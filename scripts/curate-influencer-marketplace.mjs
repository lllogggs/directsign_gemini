import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import {
  classifyExternalInfluencerSearchEvidence,
  classifyDiscoveredInfluencerAccount,
  normalizeMarketplaceCreatorCategories,
} from "../src/domain/influencerDiscoveryQuality.js";
import { reserveNaverSearchRequest } from "./lib/naver-search-budget.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const apply = process.argv.includes("--apply");
const skipExternal = process.argv.includes("--skip-external");
const skipNaver = process.argv.includes("--skip-naver");
const verbose = process.argv.includes("--verbose");
const naverLimitArgument = process.argv.find((value) =>
  value.startsWith("--naver-limit="),
);
const naverReviewLimit = naverLimitArgument
  ? Math.max(0, Number(naverLimitArgument.split("=")[1]) || 0)
  : Number.POSITIVE_INFINITY;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const naverClientId = process.env.NAVER_CLIENT_ID;
const naverClientSecret = process.env.NAVER_CLIENT_SECRET;
const cachePath = path.join(
  process.cwd(),
  ".tmp",
  "instagram-account-curation-v3.json",
);
const externalReviewVersion = "2026-07-independent-creators-v3";
const naverReviewVersion = "2026-07-naver-account-type-v11";
const naverTargetedReviewVersion = "2026-07-naver-role-review-v6";
const instagramMetadataFollowerThreshold = 300_000;
const externalCacheMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const naverSearchConcurrency = 32;
const naverRequestIntervalMs = 110;
let naverRequestSchedule = Promise.resolve();
let nextNaverRequestAt = 0;
let naverQuotaExhausted = false;
let naverQuotaWarningShown = false;
const NAVER_QUOTA_EXHAUSTED = Symbol("naver-quota-exhausted");

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabaseHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json",
};

const entertainerOccupationIds = [
  "Q33999", // actor
  "Q177220", // singer
  "Q639669", // musician
  "Q2252262", // rapper
  "Q245068", // comedian
  "Q947873", // television presenter
  "Q4610556", // model
  "Q5716684", // dancer
  "Q2066131", // athlete
  "Q82955", // politician
  "Q1930187", // journalist
];

async function readAllRows() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/discovered_influencer_profiles?select=*&order=id.asc&limit=1000&offset=${offset}`,
      { headers: supabaseHeaders },
    );
    if (!response.ok) throw new Error(await response.text());
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function sparqlLiteral(value) {
  return JSON.stringify(String(value));
}

async function queryWikidataAccountTypes(handles, attempt = 0) {
  const handleValues = handles.map(sparqlLiteral).join(" ");
  const occupationValues = entertainerOccupationIds
    .map((id) => `wd:${id}`)
    .join(" ");
  const query = `
SELECT DISTINCT ?instagram ?entity ?type WHERE {
  VALUES ?instagram { ${handleValues} }
  ?entity wdt:P2003 ?instagram.
  {
    ?entity wdt:P106 ?occupation.
    ?occupation wdt:P279* ?entertainerOccupation.
    VALUES ?entertainerOccupation { ${occupationValues} }
    BIND("celebrity" AS ?type)
  }
  UNION
  {
    FILTER NOT EXISTS { ?entity wdt:P31 wd:Q5 }
    BIND("organization" AS ?type)
  }
}`;
  const endpoint = new URL("https://query.wikidata.org/sparql");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("query", query);
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "yeollock.me-data-curation/1.0 (yeollockme@gmail.com)",
    },
  });

  if (!response.ok) {
    if (attempt < 2 && [429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1500));
      return queryWikidataAccountTypes(handles, attempt + 1);
    }
    throw new Error(
      `Wikidata query failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json();
  return payload.results.bindings.map((binding) => ({
    handle: String(binding.instagram?.value ?? "")
      .trim()
      .toLowerCase(),
    entity: String(binding.entity?.value ?? ""),
    type: binding.type?.value === "celebrity" ? "celebrity" : "organization",
  }));
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/giu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/giu, '"')
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

function preferIdentityMatch(matches, key, match) {
  const existing = matches.get(key);
  if (!existing || match.type === "celebrity") matches.set(key, match);
}

function parseInstagramMetadata(html, handle) {
  const title = decodeHtmlEntities(
    html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/iu)?.[1],
  );
  const description = decodeHtmlEntities(
    html.match(/<meta\s+content="([\s\S]*?)"\s+name="description"/iu)?.[1],
  );
  const displayName = title
    .replace(
      new RegExp(
        `\\s*\\(@${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\).*`,
        "iu",
      ),
      "",
    )
    .trim();
  return {
    displayName,
    description,
    fetchedAt: new Date().toISOString(),
    status: 200,
  };
}

async function fetchInstagramMetadata(handle, attempt = 0) {
  const response = await fetch(
    `https://www.instagram.com/${encodeURIComponent(handle)}/`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; yeollock.me data curation)",
      },
    },
  );
  if (!response.ok) {
    if (attempt < 2 && [429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1800));
      return fetchInstagramMetadata(handle, attempt + 1);
    }
    return { fetchedAt: new Date().toISOString(), status: response.status };
  }
  return parseInstagramMetadata(await response.text(), handle);
}

async function readCurationCache() {
  try {
    const payload = JSON.parse(await fs.readFile(cachePath, "utf8"));
    const ageMs = Date.now() - Date.parse(payload.updatedAt);
    if (
      payload.version !== externalReviewVersion ||
      !Number.isFinite(ageMs) ||
      ageMs > externalCacheMaxAgeMs
    ) {
      return undefined;
    }
    return payload;
  } catch (error) {
    if (error?.code !== "ENOENT")
      console.warn(`Curation cache ignored: ${error.message}`);
    return undefined;
  }
}

async function writeCurationCache({
  reviewedHandles,
  handleMatches,
  metadata,
  naverReviewedHandles = new Set(),
  naverMatches = new Map(),
  naverTargetedReviewedHandles = new Set(),
  naverTargetedMatches = new Map(),
}) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    `${JSON.stringify(
      {
        version: externalReviewVersion,
        updatedAt: new Date().toISOString(),
        reviewedHandles: Array.from(reviewedHandles).sort(),
        handleMatches: Array.from(handleMatches.values()).filter(
          (item) => item.reason !== "verified_external_review",
        ),
        naverReviewVersion,
        naverReviewedHandles: Array.from(naverReviewedHandles).sort(),
        naverMatches: Array.from(naverMatches.values()),
        naverTargetedReviewVersion,
        naverTargetedReviewedHandles: Array.from(
          naverTargetedReviewedHandles,
        ).sort(),
        naverTargetedMatches: Array.from(naverTargetedMatches.values()),
        metadata: Array.from(metadata.entries()).map(([handle, value]) => ({
          handle,
          ...value,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function waitForNaverRequestSlot() {
  const previous = naverRequestSchedule;
  let release;
  naverRequestSchedule = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  const waitMs = Math.max(0, nextNaverRequestAt - Date.now());
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  nextNaverRequestAt = Date.now() + naverRequestIntervalMs;
  release();
}

async function queryNaverAccountEvidence(
  row,
  { targeted = false, attempt = 0 } = {},
) {
  if (naverQuotaExhausted) return NAVER_QUOTA_EXHAUSTED;
  await waitForNaverRequestSlot();
  if (naverQuotaExhausted) return NAVER_QUOTA_EXHAUSTED;
  const reservation = await reserveNaverSearchRequest(
    "/v1/search/webkr.json",
  );
  if (!reservation.allowed) {
    naverQuotaExhausted = true;
    if (!naverQuotaWarningShown) {
      console.warn(
        "Naver Search daily budget is exhausted or unavailable; cached progress will be saved and non-Naver work will continue.",
      );
      naverQuotaWarningShown = true;
    }
    return NAVER_QUOTA_EXHAUSTED;
  }
  const query = [
    row.display_name,
    ...(targeted ? [] : [row.platform_handle]),
    "인스타그램",
  ]
    .filter(Boolean)
    .join(" ");
  const endpoint = new URL("https://openapi.naver.com/v1/search/webkr.json");
  endpoint.searchParams.set("display", "5");
  endpoint.searchParams.set("query", query);
  const response = await fetch(endpoint, {
    headers: {
      "X-Naver-Client-Id": naverClientId,
      "X-Naver-Client-Secret": naverClientSecret,
    },
  });
  if (!response.ok) {
    const responseText = await response.text();
    if (
      response.status === 429 &&
      /(?:Query limit exceeded|쿼리 한도를 초과|"errorCode"\s*:\s*"010")/iu.test(
        responseText,
      )
    ) {
      naverQuotaExhausted = true;
      if (!naverQuotaWarningShown) {
        console.warn(
          "Naver Search daily quota exhausted; cached progress will be saved and non-Naver work will continue.",
        );
        naverQuotaWarningShown = true;
      }
      return NAVER_QUOTA_EXHAUSTED;
    }
    if (attempt < 5 && [429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          response.status === 429
            ? (attempt + 1) * 5000
            : (attempt + 1) * 1200,
        ),
      );
      return queryNaverAccountEvidence(row, {
        targeted,
        attempt: attempt + 1,
      });
    }
    throw new Error(
      `Naver account review failed (${response.status}): ${responseText}`,
    );
  }
  const payload = await response.json();
  return classifyExternalInfluencerSearchEvidence(row, payload.items ?? [], {
    trustTitleAlias: targeted,
  });
}

async function reviewInstagramHandles(rows) {
  const instagramRows = rows.filter(
    (row) => row.platform === "instagram" && row.status === "active",
  );
  const handles = Array.from(
    new Set(
      instagramRows
        .map((row) =>
          String(row.platform_handle ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ).sort();
  const rowByHandle = new Map(
    instagramRows.map((row) => [
      String(row.platform_handle ?? "")
        .trim()
        .toLowerCase(),
      row,
    ]),
  );

  if (skipExternal) {
    return {
      handles,
      matches: new Map(),
      metadata: new Map(),
      reviewedNameCount: 0,
      metadataReviewedCount: 0,
    };
  }
  const cached = await readCurationCache();
  const reviewedHandles = new Set(cached?.reviewedHandles ?? []);
  const handleMatches = new Map(
    (cached?.handleMatches ?? [])
      .filter((item) => item.reason !== "verified_external_review")
      .map((item) => [item.handle, item]),
  );
  const canReuseNaverReview =
    cached?.naverReviewVersion === naverReviewVersion ||
    cached?.naverReviewVersion === "2026-07-naver-account-type-v9" ||
    cached?.naverReviewVersion === "2026-07-naver-account-type-v8" ||
    cached?.naverReviewVersion === "2026-07-naver-account-type-v7" ||
    cached?.naverReviewVersion === "2026-07-naver-account-type-v6" ||
    cached?.naverReviewVersion === "2026-07-naver-account-type-v5" ||
    cached?.naverReviewVersion === "2026-07-naver-account-type-v4" ||
    cached?.naverReviewVersion === "2026-07-naver-account-type-v3";
  const naverReviewedHandles = new Set(
    canReuseNaverReview ? (cached?.naverReviewedHandles ?? []) : [],
  );
  const naverMatches = new Map(
    (canReuseNaverReview ? (cached?.naverMatches ?? []) : [])
      .map((item) => {
        if (cached?.naverReviewVersion === naverReviewVersion) return item;
        const row = rowByHandle.get(item.handle);
        const migratedMatch = row
          ? classifyExternalInfluencerSearchEvidence(row, [
              {
                title: item.evidence,
                description: "",
                link: item.source,
              },
            ])
          : undefined;
        return migratedMatch ? { handle: item.handle, ...migratedMatch } : null;
      })
      .filter(Boolean)
      .map((item) => [item.handle, item]),
  );
  const canReuseTargetedReview =
    cached?.naverTargetedReviewVersion === naverTargetedReviewVersion ||
    cached?.naverTargetedReviewVersion === "2026-07-naver-role-review-v4" ||
    cached?.naverTargetedReviewVersion === "2026-07-naver-role-review-v3";
  const naverTargetedReviewedHandles = new Set(
    canReuseTargetedReview
      ? (cached?.naverTargetedReviewedHandles ?? [])
      : [],
  );
  const naverTargetedMatches = new Map(
    (canReuseTargetedReview ? (cached?.naverTargetedMatches ?? []) : [])
      .map((item) => {
        if (
          cached?.naverTargetedReviewVersion === naverTargetedReviewVersion
        ) {
          return item;
        }
        const row = rowByHandle.get(item.handle);
        const migratedMatch = row
          ? classifyExternalInfluencerSearchEvidence(
              row,
              [
                {
                  title: item.evidence,
                  description: "",
                  link: item.source,
                },
              ],
              { trustTitleAlias: true },
            )
          : undefined;
        return migratedMatch ? { handle: item.handle, ...migratedMatch } : null;
      })
      .filter(Boolean)
      .map((item) => [item.handle, item]),
  );
  const metadata = new Map(
    (cached?.metadata ?? []).map(({ handle, ...value }) => [handle, value]),
  );

  const missingHandles = handles.filter(
    (handle) => !reviewedHandles.has(handle),
  );
  const handleBatches = chunk(missingHandles, 180);
  for (let index = 0; index < handleBatches.length; index += 3) {
    const currentBatches = handleBatches.slice(index, index + 3);
    const results = await Promise.all(
      currentBatches.map((batch) => queryWikidataAccountTypes(batch)),
    );
    currentBatches.flat().forEach((handle) => reviewedHandles.add(handle));
    for (const match of results.flat())
      preferIdentityMatch(handleMatches, match.handle, match);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const metadataTargets = instagramRows
    .filter(
      (row) =>
        Number(row.follower_count) >= instagramMetadataFollowerThreshold &&
        !metadata.has(
          String(row.platform_handle ?? "")
            .trim()
            .toLowerCase(),
        ),
    )
    .map((row) =>
      String(row.platform_handle ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  for (const metadataBatch of chunk(metadataTargets, 3)) {
    const results = await Promise.all(
      metadataBatch.map(async (handle) => {
        const value = await fetchInstagramMetadata(handle);
        await new Promise((resolve) => setTimeout(resolve, 180));
        return [handle, value];
      }),
    );
    results.forEach(([handle, value]) => metadata.set(handle, value));
  }

  const canUseNaver =
    !skipNaver && Boolean(naverClientId) && Boolean(naverClientSecret);
  if (!skipNaver && !canUseNaver) {
    console.warn(
      "NAVER_CLIENT_ID/NAVER_CLIENT_SECRET are unavailable; Naver account review skipped.",
    );
  }
  const missingNaverHandles = canUseNaver
    ? handles
        .filter((handle) => !naverReviewedHandles.has(handle))
        .slice(0, naverReviewLimit)
    : [];
  const naverBatches = chunk(missingNaverHandles, naverSearchConcurrency);
  for (let index = 0; index < naverBatches.length; index += 1) {
    const batch = naverBatches[index];
    const results = await Promise.all(
      batch.map(async (handle) => {
        const row = rowByHandle.get(handle);
        const match = row ? await queryNaverAccountEvidence(row) : undefined;
        return [handle, match];
      }),
    );
    let quotaExhaustedInBatch = false;
    for (const [handle, match] of results) {
      if (match === NAVER_QUOTA_EXHAUSTED) {
        quotaExhaustedInBatch = true;
        continue;
      }
      naverReviewedHandles.add(handle);
      if (match) {
        preferIdentityMatch(naverMatches, handle, { handle, ...match });
      }
    }
    if ((index + 1) % 40 === 0 || quotaExhaustedInBatch) {
      await writeCurationCache({
        reviewedHandles,
        handleMatches,
        metadata,
        naverReviewedHandles,
        naverMatches,
        naverTargetedReviewedHandles,
        naverTargetedMatches,
      });
    }
    if (quotaExhaustedInBatch) break;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  const targetedNaverHandles = canUseNaver
    ? instagramRows
        .filter((row) => Number(row.follower_count) >= 300_000)
        .map((row) =>
          String(row.platform_handle ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(
          (handle) =>
            handle &&
            !naverMatches.has(handle) &&
            !naverTargetedReviewedHandles.has(handle),
        )
    : [];
  const targetedNaverBatches = chunk(
    targetedNaverHandles,
    naverSearchConcurrency,
  );
  for (let index = 0; index < targetedNaverBatches.length; index += 1) {
    const batch = targetedNaverBatches[index];
    const results = await Promise.all(
      batch.map(async (handle) => {
        const row = rowByHandle.get(handle);
        const match = row
          ? await queryNaverAccountEvidence(row, { targeted: true })
          : undefined;
        return [handle, match];
      }),
    );
    let quotaExhaustedInBatch = false;
    for (const [handle, match] of results) {
      if (match === NAVER_QUOTA_EXHAUSTED) {
        quotaExhaustedInBatch = true;
        continue;
      }
      naverTargetedReviewedHandles.add(handle);
      if (match) {
        preferIdentityMatch(naverTargetedMatches, handle, {
          handle,
          ...match,
        });
      }
    }
    if ((index + 1) % 40 === 0 || quotaExhaustedInBatch) {
      await writeCurationCache({
        reviewedHandles,
        handleMatches,
        metadata,
        naverReviewedHandles,
        naverMatches,
        naverTargetedReviewedHandles,
        naverTargetedMatches,
      });
    }
    if (quotaExhaustedInBatch) break;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  await writeCurationCache({
    reviewedHandles,
    handleMatches,
    metadata,
    naverReviewedHandles,
    naverMatches,
    naverTargetedReviewedHandles,
    naverTargetedMatches,
  });
  const matches = new Map(handleMatches);
  for (const match of naverMatches.values()) {
    preferIdentityMatch(matches, match.handle, match);
  }
  for (const match of naverTargetedMatches.values()) {
    preferIdentityMatch(matches, match.handle, match);
  }
  return {
    handles,
    matches,
    metadata,
    reviewedNameCount: 0,
    metadataReviewedCount: metadata.size,
    naverReviewedCount: naverReviewedHandles.size,
    naverMatchCount: naverMatches.size,
    naverTargetedReviewedCount: naverTargetedReviewedHandles.size,
    naverTargetedMatchCount: naverTargetedMatches.size,
  };
}

function sameArray(left, right) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function curateRow(row, externalMatches, instagramMetadata) {
  const normalizedCategories = normalizeMarketplaceCreatorCategories(row);
  const handle = String(row.platform_handle ?? "")
    .trim()
    .toLowerCase();
  const profileMetadata =
    row.platform === "instagram" ? instagramMetadata.get(handle) : undefined;
  const externalMatch =
    row.platform === "instagram" ? externalMatches.get(handle) : undefined;
  const sourceEvidence = row.source_evidence ?? {};
  const sourceCategories =
    sourceEvidence.categoryTaxonomy?.sourceCategories ?? row.categories ?? [];
  const assessmentRow = profileMetadata
    ? {
        ...row,
        display_name: [row.display_name, profileMetadata.displayName]
          .filter(Boolean)
          .join(" "),
        bio: [row.bio, profileMetadata.description].filter(Boolean).join("\n"),
      }
    : row;
  const externallyCuratedRow = externalMatch
    ? {
        ...assessmentRow,
        source_evidence: {
          ...sourceEvidence,
          accountCuration: {
            type: externalMatch.type,
            reason: externalMatch.reason ?? "wikidata_instagram_handle",
            source: externalMatch.entity ?? externalMatch.source,
            ...(externalMatch.evidence
              ? { evidence: externalMatch.evidence }
              : {}),
            version: externalReviewVersion,
          },
        },
      }
    : assessmentRow;
  const assessment = classifyDiscoveredInfluencerAccount(externallyCuratedRow);
  const shouldHide =
    row.platform === "instagram" &&
    row.status !== "claimed" &&
    assessment.excluded;
  const nextEvidence = {
    ...(externallyCuratedRow.source_evidence ?? {}),
    categoryTaxonomy: {
      version: "2026-07-medium-v1",
      primaryCategory: normalizedCategories[0],
      sourceCategories,
    },
    ...(shouldHide && !externallyCuratedRow.source_evidence?.accountCuration
      ? {
          accountCuration: {
            type: assessment.type,
            reason: assessment.reason,
            ...(profileMetadata ? { source: "instagram_public_profile" } : {}),
            version: externalReviewVersion,
          },
        }
      : {}),
  };
  const nextRow = {
    ...row,
    categories: normalizedCategories,
    status: shouldHide ? "hidden" : row.status,
    source_evidence: nextEvidence,
  };

  const changed =
    !sameArray(row.categories, nextRow.categories) ||
    row.status !== nextRow.status ||
    JSON.stringify(row.source_evidence ?? {}) !== JSON.stringify(nextEvidence);
  return { row: nextRow, changed, assessment, externalMatch, shouldHide };
}

async function upsertRows(rows) {
  let applied = 0;
  for (const batch of chunk(rows, 100)) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/discovered_influencer_profiles?on_conflict=id`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      },
    );
    if (!response.ok) throw new Error(await response.text());
    applied += batch.length;
  }
  return applied;
}

const rows = await readAllRows();
const externalReview = await reviewInstagramHandles(rows);
const curated = rows.map((row) =>
  curateRow(row, externalReview.matches, externalReview.metadata),
);
const existingRowById = new Map(rows.map((row) => [row.id, row]));
const changedRows = curated
  .filter(
    (item) =>
      item.changed && existingRowById.get(item.row.id)?.status === "active",
  )
  .map((item) => item.row);
const hidden = curated.filter((item) => item.shouldHide);
const newlyHidden = curated.filter(
  (item) =>
    item.shouldHide &&
    item.row.status === "hidden" &&
    existingRowById.get(item.row.id)?.status === "active",
);
const reasons = Object.fromEntries(
  Array.from(
    hidden.reduce((counts, item) => {
      const reason = item.assessment.reason;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
      return counts;
    }, new Map()),
  ).sort((left, right) => right[1] - left[1]),
);
const newHiddenReasons = Object.fromEntries(
  Array.from(
    newlyHidden.reduce((counts, item) => {
      const reason = item.assessment.reason;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
      return counts;
    }, new Map()),
  ).sort((left, right) => right[1] - left[1]),
);
const sampleByReason = Object.fromEntries(
  Object.keys(newHiddenReasons).map((reason) => [
    reason,
    newlyHidden
      .filter((item) => item.assessment.reason === reason)
      .slice(0, verbose ? 100 : 12)
      .map((item) => ({
        name: item.row.display_name,
        handle: item.row.platform_handle,
        followers: item.row.follower_count,
        externalSource: item.externalMatch?.entity,
      })),
  ]),
);
const categoryCounts = Object.fromEntries(
  Array.from(
    curated
      .filter((item) => item.row.status === "active")
      .reduce((counts, item) => {
        const category = item.row.categories?.[0] ?? "일상·브이로그";
        counts.set(category, (counts.get(category) ?? 0) + 1);
        return counts;
      }, new Map()),
  ).sort((left, right) => right[1] - left[1]),
);

const applied = apply ? await upsertRows(changedRows) : 0;
console.log(
  JSON.stringify(
    {
      apply,
      totalRows: rows.length,
      reviewedInstagramHandles: externalReview.handles.length,
      reviewedInstagramNames: externalReview.reviewedNameCount,
      reviewedInstagramPublicProfiles: externalReview.metadataReviewedCount,
      reviewedInstagramNaverSearches:
        externalReview.naverReviewedCount ?? 0,
      naverAccountTypeMatches: externalReview.naverMatchCount ?? 0,
      reviewedInstagramTargetedNaverSearches:
        externalReview.naverTargetedReviewedCount ?? 0,
      targetedNaverAccountTypeMatches:
        externalReview.naverTargetedMatchCount ?? 0,
      externalMatches: externalReview.matches.size,
      rowsChanged: changedRows.length,
      instagramRowsHidden: hidden.length,
      hiddenReasons: reasons,
      activeInstagramRowsNewlyHidden: newlyHidden.length,
      newHiddenReasons,
      sampleByReason,
      activeCategoryCounts: categoryCounts,
      applied,
    },
    null,
    2,
  ),
);
