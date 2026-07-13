import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import {
  choosePreferredInfluencerRow,
  inferCreatorCountries,
  isSupportedMarketplaceCountryCode,
  normalizePublicProfileUrl,
} from "./lib/influencer-country.mjs";
import { hasMalformedCollectedText } from "./lib/influencer-text-quality.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const outputPath = path.join(
  process.cwd(),
  "docs",
  "discovery",
  "influencer-db-audit-latest.json",
);
const noWrite = process.argv.includes("--no-write");

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json",
};

async function readAllRows() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/discovered_influencer_profiles?select=*&order=id.asc&limit=1000&offset=${offset}`,
      { headers },
    );
    if (!response.ok) throw new Error(await response.text());
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function countBy(rows, keyFor) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(Array.from(counts).sort((left, right) => right[1] - left[1]));
}

function buildDuplicateGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const handle = String(row.platform_handle ?? "").trim().toLowerCase();
    const normalizedUrl = normalizePublicProfileUrl(row.profile_url);
    for (const key of [
      handle ? `${row.platform}:handle:${handle}` : "",
      normalizedUrl ? `${row.platform}:url:${normalizedUrl}` : "",
    ].filter(Boolean)) {
      const current = groups.get(key) ?? [];
      current.push(row);
      groups.set(key, current);
    }
  }

  const seen = new Set();
  const duplicates = [];
  for (const [key, group] of groups) {
    const uniqueRows = Array.from(new Map(group.map((row) => [row.id, row])).values());
    if (uniqueRows.length < 2) continue;
    const signature = uniqueRows.map((row) => row.id).sort().join(":");
    if (seen.has(signature)) continue;
    seen.add(signature);
    const preferred = uniqueRows.reduce(choosePreferredInfluencerRow);
    duplicates.push({
      key,
      preferredId: preferred.id,
      rows: uniqueRows.map((row) => ({
        id: row.id,
        platform: row.platform,
        handle: row.platform_handle,
        displayName: row.display_name,
        status: row.status,
        sourceProvider: row.source_provider,
        profileUrl: row.profile_url,
      })),
    });
  }
  return duplicates;
}

const strictBusinessPattern =
  /(?:\bofficial\b|공식\s*(?:계정|채널|몰|스토어)|\b(?:shop|store|mall|clinic|hospital|agency|platform|cattery)\b|병원|의원|마케팅\s*(?:회사|업체|대행)|쇼핑몰|브랜드몰)/iu;
const internalBioPattern =
  /(?:공개\s*(?:랭킹|프로필).*후보|기준.*후보|수집한.*후보|public.*candidate)/iu;

const rows = await readAllRows();
const countryCounts = new Map();
const countryByPlatform = {};
const unsupportedCountryRows = [];
const suspectKoreaRows = [];

for (const row of rows) {
  const countries = Array.isArray(row.audience_countries) ? row.audience_countries : [];
  for (const country of countries.length > 0 ? countries : ["__empty__"]) {
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    countryByPlatform[row.platform] ??= {};
    countryByPlatform[row.platform][country] =
      (countryByPlatform[row.platform][country] ?? 0) + 1;
    if (
      country !== "__empty__" &&
      !isSupportedMarketplaceCountryCode(country)
    ) {
      unsupportedCountryRows.push({ id: row.id, platform: row.platform, country });
    }
  }

  const trustedCountryConfidence = String(
    row.source_evidence?.countryConfidence ?? "",
  );
  if (
    countries.includes("south_korea") &&
    row.platform !== "naver_blog" &&
    !["official", "platform", "manual_verified"].includes(trustedCountryConfidence)
  ) {
    const inference = inferCreatorCountries({
      displayName: row.display_name,
      bio: row.bio,
      handle: row.platform_handle,
    });
    const foreignCountries = inference.countries.filter(
      (country) =>
        country !== "south_korea" && !countries.includes(country),
    );
    if (
      foreignCountries.length > 0 &&
      ["explicit", "language"].includes(inference.confidence)
    ) {
      suspectKoreaRows.push({
        id: row.id,
        platform: row.platform,
        displayName: row.display_name,
        handle: row.platform_handle,
        storedCountries: countries,
        inferredCountries: inference.countries,
        confidence: inference.confidence,
        signals: inference.signals,
        status: row.status,
        sourceProvider: row.source_provider,
      });
    }
  }
}

const duplicateGroups = buildDuplicateGroups(rows);
const activeRows = rows.filter((row) => row.status === "active");
const allowedPlatforms = new Set(["instagram", "youtube", "tiktok", "naver_blog"]);
const allowedStatuses = new Set(["active", "needs_review", "hidden", "claimed"]);
const platformHostPatterns = {
  instagram: /(^|\.)instagram\.com$/i,
  youtube: /(^|\.)(?:youtube\.com|youtu\.be)$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
  naver_blog: /(^|\.)blog\.naver\.com$/i,
};
function extractIdentityFlagIsoCodes(row) {
  const identityText = `${row.display_name ?? ""} ${row.platform_handle ?? ""}`;
  const flags = identityText.match(/\p{Regional_Indicator}{2}/gu) ?? [];
  return Array.from(
    new Set(
      flags.map((flag) =>
        Array.from(flag)
          .map((character) =>
            String.fromCharCode(
              65 + Number(character.codePointAt(0)) - 0x1f1e6,
            ),
          )
          .join(""),
      ),
    ),
  );
}

function hasValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value ?? ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hasExpectedPlatformHost(row) {
  if (!hasValidHttpUrl(row.profile_url)) return false;
  const pattern = platformHostPatterns[row.platform];
  if (!pattern) return false;
  return pattern.test(new URL(row.profile_url).hostname);
}

const integrityRows = {
  unsupportedPlatform: rows.filter((row) => !allowedPlatforms.has(row.platform)),
  unsupportedStatus: rows.filter((row) => !allowedStatuses.has(row.status)),
  missingDisplayName: rows.filter((row) => !String(row.display_name ?? "").trim()),
  missingHandle: rows.filter((row) => !String(row.platform_handle ?? "").trim()),
  missingProfileUrl: rows.filter((row) => !String(row.profile_url ?? "").trim()),
  invalidProfileUrl: rows.filter(
    (row) => String(row.profile_url ?? "").trim() && !hasValidHttpUrl(row.profile_url),
  ),
  wrongPlatformHost: rows.filter(
    (row) => hasValidHttpUrl(row.profile_url) && !hasExpectedPlatformHost(row),
  ),
  invalidAvatarUrl: rows.filter(
    (row) => String(row.avatar_url ?? "").trim() && !hasValidHttpUrl(row.avatar_url),
  ),
  invalidFollowerCount: rows.filter(
    (row) =>
      row.follower_count != null &&
      (!Number.isInteger(Number(row.follower_count)) || Number(row.follower_count) < 0),
  ),
  emptyCategories: rows.filter(
    (row) => !Array.isArray(row.categories) || row.categories.length === 0,
  ),
  duplicateCountryCodes: rows.filter((row) => {
    const countries = Array.isArray(row.audience_countries)
      ? row.audience_countries
      : [];
    return new Set(countries).size !== countries.length;
  }),
  malformedText: rows.filter((row) =>
    hasMalformedCollectedText(
      `${row.display_name ?? ""}\n${row.platform_handle ?? ""}\n${row.bio ?? ""}`,
    ),
  ),
  missingSourceProvider: rows.filter(
    (row) => !String(row.source_provider ?? "").trim(),
  ),
};

const activeIntegrityRows = {
  missingDisplayName: activeRows.filter(
    (row) => !String(row.display_name ?? "").trim(),
  ),
  missingHandle: activeRows.filter(
    (row) => !String(row.platform_handle ?? "").trim(),
  ),
  missingProfileUrl: activeRows.filter(
    (row) => !String(row.profile_url ?? "").trim(),
  ),
  wrongPlatformHost: activeRows.filter(
    (row) => hasValidHttpUrl(row.profile_url) && !hasExpectedPlatformHost(row),
  ),
  malformedText: activeRows.filter((row) =>
    hasMalformedCollectedText(
      `${row.display_name ?? ""}\n${row.platform_handle ?? ""}\n${row.bio ?? ""}`,
    ),
  ),
};
const activeCountryModelGapRows = activeRows
  .map((row) => {
    const identityFlagIsoCodes = extractIdentityFlagIsoCodes(row);
    const inference = inferCreatorCountries({
      displayName: row.display_name,
      bio: internalBioPattern.test(String(row.bio ?? "")) ? "" : row.bio,
      handle: row.platform_handle,
    });
    const storedCountries = Array.isArray(row.audience_countries)
      ? row.audience_countries
      : [];
    const trustedStoredCountry = [
      "official",
      "platform",
      "manual_verified",
    ].includes(String(row.source_evidence?.countryConfidence ?? ""));
    const explicitCountryMatches =
      inference.confidence === "explicit" &&
      inference.countries.length > 0 &&
      inference.countries.every((country) => storedCountries.includes(country));
    const intentionallyUnknownRankingCountry =
      storedCountries.length === 0 &&
      row.source_evidence?.countryConfidence === "unknown" &&
      (row.source_evidence?.countryAudit?.reasons ?? []).includes(
        "ranking_market_not_creator_country",
      );
    return {
      row,
      missingIsoCodes:
        trustedStoredCountry ||
        explicitCountryMatches ||
        intentionallyUnknownRankingCountry
          ? []
          : identityFlagIsoCodes,
    };
  })
  .filter(({ missingIsoCodes }) => missingIsoCodes.length > 0);
const activeKoreaOnlyCountryModelGapRows = activeCountryModelGapRows.filter(
  ({ row }) =>
    Array.isArray(row.audience_countries) &&
    row.audience_countries.length === 1 &&
    row.audience_countries[0] === "south_korea",
);
const rankingOnlyCountryRows = rows.filter((row) => {
  if (!/(?:ranking|_kr_public_api|instagram_nano|instagram_public_db)/i.test(
    String(row.source_provider ?? ""),
  )) {
    return false;
  }
  if (!Array.isArray(row.audience_countries) || row.audience_countries.length === 0) {
    return false;
  }
  if (
    ["official", "platform", "manual_verified"].includes(
      String(row.source_evidence?.countryConfidence ?? ""),
    )
  ) {
    return false;
  }
  const inference = inferCreatorCountries({
    displayName: row.display_name,
    bio: internalBioPattern.test(String(row.bio ?? "")) ? "" : row.bio,
    handle: row.platform_handle,
  });
  return inference.countries.length === 0;
});
const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    total: rows.length,
    platforms: countBy(rows, (row) => row.platform),
    statuses: countBy(rows, (row) => row.status),
    sourceProviders: countBy(rows, (row) => `${row.platform}|${row.source_provider}`),
    countries: Object.fromEntries(
      Array.from(countryCounts).sort((left, right) => right[1] - left[1]),
    ),
    countryByPlatform,
    duplicates: {
      physicalGroups: duplicateGroups.length,
      visibleGroups: duplicateGroups.filter((group) =>
        group.rows.filter((row) => row.status === "active").length > 1,
      ).length,
      rows: duplicateGroups.reduce((sum, group) => sum + group.rows.length, 0),
    },
    missing: {
      avatar: rows.filter((row) => !row.avatar_url).length,
      followerCount: rows.filter((row) => row.follower_count == null).length,
      bio: rows.filter((row) => !String(row.bio ?? "").trim()).length,
      country: rows.filter(
        (row) => !Array.isArray(row.audience_countries) || row.audience_countries.length === 0,
      ).length,
    },
    activeQuality: {
      missingAvatar: activeRows.filter((row) => !row.avatar_url).length,
      missingFollowerCount: activeRows.filter(
        (row) => row.follower_count == null,
      ).length,
      missingBio: activeRows.filter(
        (row) => !String(row.bio ?? "").trim(),
      ).length,
      emptyCountry: activeRows.filter(
        (row) => !Array.isArray(row.audience_countries) || row.audience_countries.length === 0,
      ).length,
      strictBusinessSignal: activeRows.filter((row) =>
        strictBusinessPattern.test(
          `${row.display_name ?? ""} ${row.platform_handle ?? ""} ${row.bio ?? ""}`,
        ),
      ).length,
      internalCollectionBio: activeRows.filter((row) =>
        internalBioPattern.test(String(row.bio ?? "")),
      ).length,
    },
    integrity: Object.fromEntries(
      Object.entries(integrityRows).map(([key, values]) => [key, values.length]),
    ),
    activeIntegrity: Object.fromEntries(
      Object.entries(activeIntegrityRows).map(([key, values]) => [
        key,
        values.length,
      ]),
    ),
    suspectKoreaCountry: suspectKoreaRows.length,
    countryModelGaps: {
      activeRows: activeCountryModelGapRows.length,
      activeKoreaOnlyRows: activeKoreaOnlyCountryModelGapRows.length,
      byIsoCode: countBy(
        activeCountryModelGapRows.flatMap(({ missingIsoCodes }) =>
          missingIsoCodes.map((isoCode) => ({ isoCode })),
        ),
        (item) => item.isoCode,
      ),
    },
    rankingOnlyCountry: {
      total: rankingOnlyCountryRows.length,
      active: rankingOnlyCountryRows.filter((row) => row.status === "active").length,
    },
    unsupportedCountry: unsupportedCountryRows.length,
    claimed: rows.filter((row) => row.claimed_marketplace_profile_id).length,
  },
  anomalies: {
    suspectKoreaRows: suspectKoreaRows.slice(0, 300),
    unsupportedCountryRows: unsupportedCountryRows.slice(0, 300),
    duplicateGroups,
    activeCountryModelGapRows: activeCountryModelGapRows.slice(0, 300).map(
      ({ row, missingIsoCodes }) => ({
        id: row.id,
        platform: row.platform,
        displayName: row.display_name,
        handle: row.platform_handle,
        storedCountries: row.audience_countries,
        missingIsoCodes,
        sourceProvider: row.source_provider,
      }),
    ),
    integrityRows: Object.fromEntries(
      Object.entries(integrityRows).map(([key, values]) => [
        key,
        values.slice(0, 300).map((row) => ({
          id: row.id,
          platform: row.platform,
          displayName: row.display_name,
          handle: row.platform_handle,
          profileUrl: row.profile_url,
          status: row.status,
          sourceProvider: row.source_provider,
        })),
      ]),
    ),
  },
};

if (!noWrite) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      output: noWrite ? null : outputPath,
      ...report.summary,
    },
    null,
    2,
  ),
);
