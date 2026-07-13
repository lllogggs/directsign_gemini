import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import {
  choosePreferredInfluencerRow,
  inferCreatorCountries,
  normalizePublicProfileUrl,
} from "./lib/influencer-country.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const apply = process.argv.includes("--apply");
const auditVersion = "2026-07-12-country-v2";
const auditedAt = new Date().toISOString();
const outputDir = path.join(process.cwd(), "docs", "discovery");
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const youtubeApiKey = process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY;

if (!supabaseUrl || !serviceKey || !youtubeApiKey) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and YOUTUBE_DATA_API_KEY are required.",
  );
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const internalBioPattern =
  /(?:공개\s*(?:랭킹|프로필).*후보|기준.*후보|수집한.*후보|public.*candidate)/iu;
const rankingSources = new Set([
  "hypeauditor_public_ranking",
  "hypeauditor_kr_public_api",
  "starngage_kr_public_ranking",
  "starngage_kr_instagram_nano",
  "starngage_kr_instagram_public_db",
]);

const manualOverrides = new Map(
  [
    ["hoahong848", ["vietnam", "south_korea"], undefined, "explicit Korea-Vietnam identity"],
    ["nhuquan2000", ["vietnam"], undefined, "Vietnamese creator identity"],
    ["minacute_korea", ["vietnam", "south_korea"], undefined, "Vietnamese-Korean identity"],
    ["xinchaotamday2", ["vietnam", "south_korea"], undefined, "Vietnamese team in Korea"],
    ["huongthutran2608", ["vietnam", "south_korea"], "active", "Vietnamese creator living in Korea"],
    ["korean_so_fun", ["thailand", "south_korea"], undefined, "Thai Korean-language creator"],
    ["yubbieleee", ["thailand", "south_korea"], undefined, "Thai-Korean creator identity"],
    ["sayuriakon13", ["japan", "south_korea"], undefined, "Japan-born creator living in Korea"],
    ["kims_japanlife", ["japan"], undefined, "official YouTube country and Japan-life identity"],
    ["tiktok:myhealthydish", ["vietnam", "united_states"], "active", "Vietnamese creator with matched US channel profile"],
    ["instagram:myhealthydish", ["vietnam", "united_states"], "needs_review", "Vietnamese creator with matched US channel profile"],
    ["thoi_trangkorea", ["vietnam", "south_korea"], "active", "Vietnamese Korean-fashion identity"],
    ["bumtienghan", ["vietnam", "south_korea"], "active", "Vietnamese Korean-language creator"],
    ["uclewngqrekrnposywfmk95q", ["vietnam"], "active", "Vietnamese creator identity"],
    ["yoona1312", [], "needs_review", "localized page boilerplate is not country proof"],
    ["koreamedicalbeautyvn", ["vietnam"], "hidden", "business account"],
    ["mybt.korea", ["vietnam", "south_korea"], "hidden", "medical service account"],
    ["rorost.net", ["vietnam", "south_korea"], "hidden", "marketing platform account"],
    ["hansohee.th", ["thailand"], "hidden", "fan account"],
    ["odajong_thailand", ["thailand"], "hidden", "business account"],
    ["minimal_prop", ["thailand"], "hidden", "shop account"],
    ["plazastyle", ["japan"], "hidden", "retail brand account"],
    ["romand_jp", ["japan"], "hidden", "brand account"],
    ["ohousejp", ["japan"], "hidden", "brand account"],
    ["dholic_official", ["japan"], "hidden", "brand account"],
    ["sneakervitamin.hanoi", ["vietnam"], "hidden", "retail account"],
    [
      "instagram:jeonju_lg_bestshop_pyeongwha",
      ["south_korea"],
      "hidden",
      "business account with mismatched crosslinked display name",
    ],
  ].map(([handle, countries, status, reason]) => [
    handle,
    { countries, status, reason },
  ]),
);

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

async function readOfficialYoutubeCountries(rows) {
  const channelRows = rows.filter(
    (row) =>
      row.platform === "youtube" &&
      /^youtube_data_api(?:_longtail)?$/.test(String(row.source_provider)) &&
      /^UC[A-Za-z0-9_-]{20,}$/.test(String(row.external_id ?? "")),
  );
  const byChannelId = new Map(channelRows.map((row) => [row.external_id, row]));
  const channels = new Map();
  const channelIds = Array.from(byChannelId.keys());

  for (let index = 0; index < channelIds.length; index += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", channelIds.slice(index, index + 50).join(","));
    url.searchParams.set("key", youtubeApiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      throw new Error(`YouTube channels failed (${response.status}): ${await response.text()}`);
    }
    const payload = await response.json();
    for (const channel of payload.items ?? []) {
      channels.set(channel.id, channel.snippet ?? {});
    }
  }

  return { channelRows, channels };
}

function sameCountries(left, right) {
  const normalize = (values) => Array.from(new Set(values ?? [])).sort().join(",");
  return normalize(left) === normalize(right);
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
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
  }

  const seen = new Set();
  return Array.from(groups.entries()).flatMap(([key, group]) => {
    const uniqueRows = Array.from(new Map(group.map((row) => [row.id, row])).values());
    if (uniqueRows.length < 2) return [];
    const signature = uniqueRows.map((row) => row.id).sort().join(":");
    if (seen.has(signature)) return [];
    seen.add(signature);
    return [{ key, rows: uniqueRows }];
  });
}

const rows = await readAllRows();
const rowsById = new Map(rows.map((row) => [row.id, row]));
const patches = new Map();

function stagePatch(row, changes, reason) {
  if (!row || row.status === "claimed") return;
  const current = patches.get(row.id) ?? {};
  const reasons = new Set([
    ...(current.source_evidence?.countryAudit?.reasons ?? []),
    reason,
  ]);
  const sourceEvidence = {
    ...(row.source_evidence ?? {}),
    ...(current.source_evidence ?? {}),
    ...(changes.source_evidence ?? {}),
    countryAudit: {
      version: auditVersion,
      auditedAt,
      reasons: Array.from(reasons),
    },
  };
  patches.set(row.id, {
    ...current,
    ...changes,
    source_evidence: sourceEvidence,
    last_checked_at: auditedAt,
  });
}

const youtubeVerification = await readOfficialYoutubeCountries(rows);
for (const row of youtubeVerification.channelRows) {
  if (
    row.source_evidence?.countryLock === true ||
    row.source_evidence?.countryConfidence === "manual_verified"
  ) {
    continue;
  }
  const snippet = youtubeVerification.channels.get(row.external_id);
  if (!snippet) continue;
  const inference = inferCreatorCountries({
    displayName: row.display_name,
    bio: internalBioPattern.test(String(row.bio ?? "")) ? "" : row.bio,
    handle: row.platform_handle,
    officialCountryCode: snippet.country,
  });
  const nextStatus =
    inference.countries.length === 0 && row.status === "active"
      ? "needs_review"
      : row.status;
  const evidence = {
    officialCountry: snippet.country ?? null,
    countryConfidence: inference.confidence,
    countrySignals: inference.signals,
  };
  if (
    !sameCountries(row.audience_countries, inference.countries) ||
    row.source_evidence?.officialCountry !== evidence.officialCountry ||
    row.source_evidence?.countryConfidence !== evidence.countryConfidence ||
    nextStatus !== row.status
  ) {
    stagePatch(
      row,
      {
        audience_countries: inference.countries,
        status: nextStatus,
        source_evidence: evidence,
      },
      snippet.country ? "youtube_official_country" : "youtube_profile_country_recheck",
    );
  }
}

for (const row of rows) {
  if (
    row.source_evidence?.countryLock === true ||
    row.source_evidence?.countryConfidence === "manual_verified"
  ) {
    continue;
  }
  const provider = String(row.source_provider ?? "");
  if (
    row.platform === "youtube" &&
    /^youtube_data_api(?:_longtail)?$/.test(provider)
  ) {
    continue;
  }
  const inference = inferCreatorCountries({
    displayName: row.display_name,
    bio: internalBioPattern.test(String(row.bio ?? "")) ? "" : row.bio,
    handle: row.platform_handle,
  });
  const existingCountries = Array.isArray(row.audience_countries)
    ? row.audience_countries
    : [];
  const hasVietnameseNameSignal = inference.signals.includes("script:vietnam");
  const hasWeakCountrySignal = inference.signals.some((signal) =>
    /^(?:flag|script):/.test(signal),
  );
  const existingCountryConfidence = String(
    row.source_evidence?.countryConfidence ?? "",
  );
  const hasTrustedExistingCountry = [
    "official",
    "platform",
    "manual_verified",
  ].includes(existingCountryConfidence);
  const shouldClearUnsupportedCountryGuess =
    inference.countries.length === 0 &&
    hasWeakCountrySignal &&
    !hasTrustedExistingCountry &&
    existingCountries.length > 0 &&
    (row.status === "active" || existingCountries.includes("south_korea"));
  const wasMovedForUnverifiedCountry = (
    row.source_evidence?.countryAudit?.reasons ?? []
  ).includes("unverified_creator_country_review");
  const isPreviouslyNormalizedRankingCountry =
    rankingSources.has(provider) &&
    existingCountries.length === 0 &&
    (row.source_evidence?.countryAudit?.reasons ?? []).includes(
      "ranking_market_not_creator_country",
    );
  if (isPreviouslyNormalizedRankingCountry) continue;
  const isUnverifiedRankingCountry =
    rankingSources.has(provider) &&
    inference.countries.length === 0 &&
    !hasTrustedExistingCountry &&
    existingCountries.length > 0;
  if (isUnverifiedRankingCountry) {
    const shouldRestoreActive =
      wasMovedForUnverifiedCountry && Number(row.quality_score ?? 0) >= 52;
    stagePatch(
      row,
      {
        audience_countries: [],
        status: shouldRestoreActive ? "active" : row.status,
        source_evidence: {
          countryConfidence: "unknown",
          countrySignals: inference.signals,
        },
      },
      "ranking_market_not_creator_country",
    );
    continue;
  }
  const hasExplicitCountrySignal =
    inference.confidence === "explicit" && inference.countries.length > 0;
  const shouldRecheck =
    row.platform === "tiktok" ||
    provider === "naver_web_search_youtube_public_profile" ||
    (row.platform !== "naver_blog" &&
      hasExplicitCountrySignal &&
      !sameCountries(existingCountries, inference.countries)) ||
    shouldClearUnsupportedCountryGuess ||
    (row.platform !== "naver_blog" && hasVietnameseNameSignal) ||
    (row.platform === "instagram" &&
      existingCountries.length === 0 &&
      row.status === "active") ||
    (row.platform === "instagram" &&
      rankingSources.has(provider) &&
      (row.audience_countries ?? []).includes("south_korea"));
  if (!shouldRecheck) continue;

  if (
    row.platform === "instagram" &&
    inference.countries.length === 0 &&
    existingCountries.length === 0
  ) {
    if (row.status === "active") {
      stagePatch(
        row,
        {
          status: "needs_review",
          source_evidence: {
            countryConfidence: inference.confidence,
            countrySignals: inference.signals,
          },
        },
        "missing_creator_country_review",
      );
    }
    continue;
  }
  if (row.platform === "instagram" && inference.countries.length === 0) {
    if (shouldClearUnsupportedCountryGuess) {
      stagePatch(
        row,
        {
          audience_countries: [],
          status: row.status === "active" ? "needs_review" : row.status,
          source_evidence: {
            countryConfidence: inference.confidence,
            countrySignals: inference.signals,
          },
        },
        "unverified_creator_country_review",
      );
    }
    continue;
  }
  const preserveNonKoreanRankingCountry =
    hasVietnameseNameSignal &&
    provider === "hypeauditor_public_ranking" &&
    existingCountries.some(
      (country) => !["global", "south_korea"].includes(country),
    );
  const nextCountries = preserveNonKoreanRankingCountry
    ? Array.from(
        new Set([
          ...existingCountries.filter((country) => country !== "global"),
          ...inference.countries,
        ]),
      )
    : inference.countries;
  const foreignLanguageOnly =
    inference.confidence === "language" &&
    !nextCountries.includes("south_korea");
  const nextStatus =
    nextCountries.length === 0 || foreignLanguageOnly
      ? row.status === "active"
        ? "needs_review"
        : row.status
      : row.status;
  if (!sameCountries(row.audience_countries, nextCountries) || nextStatus !== row.status) {
    stagePatch(
      row,
      {
        audience_countries: nextCountries,
        status: nextStatus,
        source_evidence: {
          countryConfidence: inference.confidence,
          countrySignals: inference.signals,
        },
      },
      `${row.platform}_profile_country_recheck`,
    );
  }
}

for (const row of rows) {
  const normalizedHandle = String(row.platform_handle ?? "").toLowerCase();
  const override =
    manualOverrides.get(`${row.platform}:${normalizedHandle}`) ??
    manualOverrides.get(normalizedHandle);
  if (!override) continue;
  stagePatch(
    row,
    {
      audience_countries: override.countries,
      status: override.status ?? row.status,
      source_evidence: {
        countryConfidence: "manual_verified",
        countrySignals: override.countries.map((country) => `manual:${country}`),
        countryLock: true,
        countryStatusLock: Boolean(override.status),
      },
    },
    override.reason,
  );
}

const duplicateGroups = buildDuplicateGroups(rows);
for (const group of duplicateGroups) {
  const preferred = group.rows.reduce(choosePreferredInfluencerRow);
  for (const row of group.rows) {
    if (row.id === preferred.id) continue;
    stagePatch(
      row,
      {
        status: "hidden",
        source_evidence: {
          duplicateOf: preferred.id,
          duplicateIdentity: group.key,
        },
      },
      "duplicate_profile",
    );
  }
}

const patchRows = Array.from(patches, ([id, patch]) => ({
  id,
  before: rowsById.get(id),
  patch,
}));
const stamp = auditedAt.replace(/[:.]/g, "-");
const backupPath = path.join(outputDir, `${stamp}-influencer-country-backup.json`);
const manifestPath = path.join(outputDir, "influencer-country-repair-latest.json");

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: auditedAt,
      apply,
      totalRows: rows.length,
      youtubeChannelsChecked: youtubeVerification.channels.size,
      duplicateGroups: duplicateGroups.length,
      patches: patchRows.map(({ id, before, patch }) => ({
        id,
        platform: before.platform,
        handle: before.platform_handle,
        displayName: before.display_name,
        beforeCountries: before.audience_countries,
        afterCountries: patch.audience_countries ?? before.audience_countries,
        beforeStatus: before.status,
        afterStatus: patch.status ?? before.status,
        reasons: patch.source_evidence?.countryAudit?.reasons ?? [],
      })),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

if (apply && patchRows.length > 0) {
  await fs.writeFile(backupPath, `${JSON.stringify(patchRows.map((item) => item.before), null, 2)}\n`);
  const concurrency = 10;
  for (let index = 0; index < patchRows.length; index += concurrency) {
    await Promise.all(
      patchRows.slice(index, index + concurrency).map(async ({ id, patch }) => {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/discovered_influencer_profiles?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify(patch),
          },
        );
        if (!response.ok) {
          throw new Error(`Patch ${id} failed (${response.status}): ${await response.text()}`);
        }
      }),
    );
  }
}

const reasonCounts = {};
for (const { patch } of patchRows) {
  for (const reason of patch.source_evidence?.countryAudit?.reasons ?? []) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      apply,
      totalRows: rows.length,
      youtubeChannelsChecked: youtubeVerification.channels.size,
      patches: patchRows.length,
      countryChanges: patchRows.filter(
        ({ before, patch }) =>
          patch.audience_countries &&
          !sameCountries(before.audience_countries, patch.audience_countries),
      ).length,
      statusChanges: patchRows.filter(
        ({ before, patch }) => patch.status && patch.status !== before.status,
      ).length,
      duplicateGroups: duplicateGroups.length,
      reasons: reasonCounts,
      manifest: manifestPath,
      backup: apply ? backupPath : null,
    },
    null,
    2,
  ),
);
