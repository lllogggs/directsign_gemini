import {
  formatMarketplaceCountries,
  type MarketplaceCountryCode,
  type MarketplaceInfluencerProfile,
} from "./marketplace.js";
import { normalizeMarketplaceCreatorCategory } from "./influencerDiscoveryQuality.js";

type MarketplaceInfluencerPlatform =
  MarketplaceInfluencerProfile["platforms"][number]["platform"];

export type MarketplaceInfluencerSearchFilters = {
  search?: string;
  platform?: MarketplaceInfluencerPlatform;
  categories?: string[];
  countries?: MarketplaceCountryCode[];
};

export type MarketplaceInfluencerPageOptions =
  MarketplaceInfluencerSearchFilters & {
    limit: number;
    offset: number;
  };

const normalizeSearchText = (value: unknown) =>
  typeof value === "string" ? value.trim().toLocaleLowerCase("ko-KR") : "";

const getCategoryFilterKey = (category: string) =>
  normalizeMarketplaceCreatorCategory(category) || "content";

export const matchesMarketplaceInfluencerSearch = (
  profile: MarketplaceInfluencerProfile,
  filters: MarketplaceInfluencerSearchFilters,
) => {
  if (
    filters.platform &&
    !profile.platforms.some((channel) => channel.platform === filters.platform)
  ) {
    return false;
  }

  const categoryFilters = new Set(filters.categories ?? []);
  if (
    categoryFilters.size > 0 &&
    !profile.categories.some((category) =>
      categoryFilters.has(getCategoryFilterKey(category)),
    )
  ) {
    return false;
  }

  const countryFilters = new Set(filters.countries ?? []);
  if (
    countryFilters.size > 0 &&
    !profile.audienceCountries?.some((country) => countryFilters.has(country))
  ) {
    return false;
  }

  const search = normalizeSearchText(filters.search);
  if (!search) return true;

  const searchableText = [
    profile.displayName,
    profile.handle,
    profile.headline,
    profile.bio,
    profile.location,
    profile.audience,
    formatMarketplaceCountries(profile.audienceCountries),
    ...profile.categories,
    ...profile.brandFit,
    ...profile.recentBrands,
    ...profile.platforms.map((channel) => channel.handle),
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR");

  return searchableText.includes(search);
};

export const paginateMarketplaceInfluencerProfiles = (
  profiles: MarketplaceInfluencerProfile[],
  options: MarketplaceInfluencerPageOptions,
) => {
  const matchingProfiles = profiles.filter((profile) =>
    matchesMarketplaceInfluencerSearch(profile, options),
  );
  const total = matchingProfiles.length;
  const page = matchingProfiles.slice(options.offset, options.offset + options.limit);

  return {
    profiles: page,
    total,
    hasMore: options.offset + page.length < total,
  };
};
