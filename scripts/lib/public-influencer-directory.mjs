import {
  getMarketplaceCreatorCategoryLabel,
  normalizeMarketplaceCreatorCategories,
  normalizeMarketplaceCreatorCategory,
} from "../../src/domain/influencerDiscoveryQuality.js";
import {
  classifyMarketplacePublicInfluencerEligibility,
  hasMarketplaceOperationalTestMarker,
  normalizeDiscoveredInfluencerDisplayName,
} from "../../src/domain/marketplaceInfluencerEligibility.js";

export const PUBLIC_INFLUENCER_DIRECTORY_ELIGIBILITY_VERSION =
  "2026-08-public-directory-v1";

const supportedPlatforms = new Set([
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
]);

const legacyCountryLabels = new Map([
  ["south_korea", "한국"],
  ["japan", "일본"],
  ["taiwan", "대만"],
  ["hong_kong", "홍콩"],
  ["united_states", "미국"],
  ["china", "중국"],
  ["thailand", "태국"],
  ["vietnam", "베트남"],
  ["indonesia", "인도네시아"],
  ["singapore", "싱가포르"],
  ["malaysia", "말레이시아"],
  ["australia", "호주"],
  ["canada", "캐나다"],
  ["germany", "독일"],
  ["india", "인도"],
  ["philippines", "필리핀"],
  ["bulgaria", "불가리아"],
  ["tanzania", "탄자니아"],
  ["egypt", "이집트"],
  ["global", "글로벌"],
  ["other", "기타 국가"],
]);

const koreanRegionNames = new Intl.DisplayNames(["ko"], { type: "region" });

const normalizeText = (value) => String(value ?? "").trim();

const normalizeSearchText = (values) =>
  values
    .flat(Infinity)
    .map(normalizeText)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ko-KR")
    .slice(0, 20_000);

const normalizePublicHandle = (value) =>
  normalizeText(value).replace(/^@/, "").toLowerCase();

const normalizeCountryCodes = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeText(value).toLowerCase())
        .filter(
          (value) =>
            /^(?:south_korea|japan|taiwan|hong_kong|united_states|china|thailand|vietnam|indonesia|singapore|malaysia|australia|canada|germany|india|philippines|bulgaria|tanzania|egypt|global|other|iso_[a-z]{2})$/.test(
              value,
            ),
        ),
    ),
  );

const getCountrySearchLabels = (countries) =>
  countries.map((country) => {
    const legacyLabel = legacyCountryLabels.get(country);
    if (legacyLabel) return legacyLabel;
    if (!/^iso_[a-z]{2}$/.test(country)) return country;
    return koreanRegionNames.of(country.slice(4).toUpperCase()) ?? country;
  });

const normalizeCategoryKeys = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeMarketplaceCreatorCategory(value) || "content")
        .filter(Boolean),
    ),
  );

const normalizePlatforms = (values) =>
  Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter((value) => supportedPlatforms.has(value)),
    ),
  ).sort();

const normalizeAudienceCount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return null;
  return Math.round(count);
};

export function parsePublicAudienceCountLabel(value) {
  const normalized = normalizeText(value).replace(/,/g, "").toLowerCase();
  const matches = Array.from(
    normalized.matchAll(/(\d+(?:\.\d+)?)\s*(억|만|천|k|m)?/g),
  );
  if (matches.length === 0) return null;

  const values = matches
    .map((match) => {
      const amount = Number(match[1]);
      const multiplier =
        match[2] === "억"
          ? 100_000_000
          : match[2] === "만"
            ? 10_000
            : match[2] === "천" || match[2] === "k"
              ? 1_000
              : match[2] === "m"
                ? 1_000_000
                : 1;
      return normalizeAudienceCount(amount * multiplier);
    })
    .filter((count) => count !== null);

  return values.length > 0 ? Math.max(...values) : null;
}

const maxCount = (counts) => {
  const values = Object.values(counts).filter((value) => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
};

const makeDirectoryRow = ({
  sourceType,
  sourceId,
  publicHandle,
  displayName,
  searchText,
  categoryKeys,
  audienceCountries,
  platforms,
  audienceCounts,
  qualityScore,
  sourceUpdatedAt,
  eligibilityReason,
}) => {
  const normalizedHandle = normalizePublicHandle(publicHandle);
  const normalizedSourceId = normalizeText(sourceId);
  if (!normalizedSourceId || !normalizedHandle || !normalizeText(displayName)) {
    return null;
  }

  return {
    listing_key: `${sourceType}:${normalizedSourceId}`,
    source_type: sourceType,
    source_id: normalizedSourceId,
    public_handle: normalizedHandle,
    display_name: normalizeText(displayName),
    search_text: normalizeSearchText(searchText),
    category_keys: Array.from(new Set(categoryKeys)).sort(),
    audience_countries: Array.from(new Set(audienceCountries)).sort(),
    platforms: normalizePlatforms(platforms),
    audience_counts: audienceCounts,
    max_audience_count: maxCount(audienceCounts),
    quality_score: Math.max(0, Math.min(100, Number(qualityScore) || 0)),
    source_updated_at:
      normalizeText(sourceUpdatedAt) || new Date(0).toISOString(),
    eligibility_version: PUBLIC_INFLUENCER_DIRECTORY_ELIGIBILITY_VERSION,
    eligibility_reason: normalizeText(eligibilityReason) || "public_creator",
  };
};

export function buildDiscoveredPublicInfluencerDirectoryRow(row) {
  const assessment = classifyMarketplacePublicInfluencerEligibility(row);
  if (
    !assessment.eligible ||
    row?.claimed_marketplace_profile_id
  ) {
    return null;
  }

  const categoryLabels = normalizeMarketplaceCreatorCategories(row);
  const categoryKeys = normalizeCategoryKeys(categoryLabels);
  const countries = normalizeCountryCodes(row?.audience_countries);
  const platform = normalizeText(row?.platform);
  const displayName = normalizeDiscoveredInfluencerDisplayName(row);
  const audienceCount =
    platform === "naver_blog"
      ? null
      : normalizeAudienceCount(row?.follower_count) ??
        parsePublicAudienceCountLabel(row?.followers_label);
  const audienceCounts = audienceCount === null ? {} : { [platform]: audienceCount };

  return makeDirectoryRow({
    sourceType: "discovered",
    sourceId: row?.id,
    publicHandle: row?.public_handle,
    displayName,
    searchText: [
      displayName,
      row?.public_handle,
      row?.platform_handle,
      row?.headline,
      row?.bio,
      categoryLabels,
      categoryKeys,
      row?.audience_tags,
      countries,
      getCountrySearchLabels(countries),
    ],
    categoryKeys,
    audienceCountries: countries,
    platforms: [platform],
    audienceCounts,
    qualityScore: row?.quality_score,
    sourceUpdatedAt: row?.updated_at ?? row?.last_checked_at,
    eligibilityReason: assessment.reason,
  });
}

export function buildRegisteredPublicInfluencerDirectoryRow(profile, channels = []) {
  if (
    !profile?.is_published ||
    profile?.data_origin !== "production" ||
    hasMarketplaceOperationalTestMarker(profile)
  ) {
    return null;
  }

  const publicHandle = normalizePublicHandle(profile.public_handle);
  const profileChannels = channels.filter(
    (channel) => normalizeText(channel?.profile_id) === normalizeText(profile?.id),
  );
  const audienceCounts = {};
  for (const channel of profileChannels) {
    const platform = normalizeText(channel?.platform);
    if (!supportedPlatforms.has(platform)) continue;
    if (platform === "naver_blog") continue;
    const count =
      normalizeAudienceCount(channel?.follower_count) ??
      parsePublicAudienceCountLabel(channel?.followers_label);
    const current = audienceCounts[platform];
    if (current === undefined || (count !== null && (current === null || count > current))) {
      audienceCounts[platform] = count;
    }
  }

  const categoryKeys = normalizeCategoryKeys(profile?.categories);
  const categoryLabels = categoryKeys.map(getMarketplaceCreatorCategoryLabel);
  const countries = normalizeCountryCodes(profile?.audience_countries);

  return makeDirectoryRow({
    sourceType: "registered",
    sourceId: profile?.id,
    publicHandle,
    displayName: profile?.display_name || publicHandle,
    searchText: [
      profile?.display_name,
      publicHandle,
      profile?.headline,
      profile?.bio,
      profile?.location,
      profile?.audience,
      profile?.categories,
      categoryKeys,
      categoryLabels,
      profile?.brand_fit,
      profile?.recent_brands,
      profileChannels.map((channel) => channel?.handle),
      countries,
      getCountrySearchLabels(countries),
    ],
    categoryKeys,
    audienceCountries: countries,
    platforms: profileChannels.map((channel) => channel?.platform),
    audienceCounts,
    qualityScore: 100,
    sourceUpdatedAt: [
      profile?.updated_at,
      ...profileChannels.map((channel) => channel?.updated_at),
    ]
      .filter(Boolean)
      .sort()
      .at(-1),
    eligibilityReason: "registered_production_profile",
  });
}

export function resolvePublicInfluencerDirectoryRows({
  registeredProfiles = [],
  registeredChannels = [],
  discoveredProfiles = [],
} = {}) {
  const registeredRows = registeredProfiles
    .map((profile) =>
      buildRegisteredPublicInfluencerDirectoryRow(profile, registeredChannels),
    )
    .filter(Boolean);
  const discoveredRows = discoveredProfiles
    .map(buildDiscoveredPublicInfluencerDirectoryRow)
    .filter(Boolean);
  const byHandle = new Map();
  const conflicts = [];

  for (const row of [...registeredRows, ...discoveredRows]) {
    const existing = byHandle.get(row.public_handle);
    if (!existing) {
      byHandle.set(row.public_handle, row);
      continue;
    }
    conflicts.push({
      public_handle: row.public_handle,
      kept_listing_key: existing.listing_key,
      skipped_listing_key: row.listing_key,
    });
  }

  return {
    rows: Array.from(byHandle.values()).sort((left, right) =>
      left.listing_key.localeCompare(right.listing_key, "en"),
    ),
    summary: {
      registered_source_rows: registeredProfiles.length,
      registered_directory_rows: registeredRows.length,
      discovered_source_rows: discoveredProfiles.length,
      discovered_directory_rows: discoveredRows.length,
      directory_rows: byHandle.size,
      handle_conflicts: conflicts,
    },
  };
}

export function chunkPublicInfluencerDirectoryRows(rows, size = 100) {
  const chunkSize = Math.max(1, Math.min(500, Number(size) || 100));
  const chunks = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}
