import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  FileText,
  Handshake,
  LogOut,
  Megaphone,
  MessageSquareText,
  Search,
  Send,
  SlidersHorizontal,
  Settings,
  Store,
  UserRound,
} from "lucide-react";
import {
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LogoMark } from "../../components/BrandLogo";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { ResponsiveFilterPanel } from "../../components/ResponsiveFilterPanel";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  campaignProposalTypeOptions,
  compareChannelAudienceValues,
  getBrandProfilePath,
  getChannelAudienceSortValue,
  getInfluencerProfilePath,
  getMarketplaceBrandDisplayFamilyKey,
  formatMarketplaceCountries,
  getMarketplaceCountryLabel,
  findBrandProfileByHandle,
  marketplaceBrands,
  marketplaceCountryOptions,
  mergeMarketplaceBrandProfiles,
  platformLabels,
  proposalTypeLabels,
  type CampaignProposalType,
  type MarketplaceBrandProfile,
  type MarketplaceCountryCode,
  type MarketplaceInfluencerProfile,
} from "../../domain/marketplace";
import { getPlatformDisplayName } from "../../domain/platformDisplay";
import {
  getInfluencerPublicProfilePath,
  normalizePublicProfileHandle,
  type InfluencerPublicProfileResponse,
} from "../../domain/publicInfluencerProfile";
import { getMarketplaceInfluencerAvatarUrl } from "../../domain/marketplaceAvatars";
import type { InfluencerPlatform } from "../../domain/verification";

type PlatformFilter = "all" | InfluencerPlatform;
type InfluencerSortValue = "audience_desc" | "audience_asc" | "name_asc";

const platformFilterOptions: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const categoryKeyAliases: Record<string, string> = {
  beauty: "beauty",
  "뷰티": "beauty",
  tech: "tech",
  "테크": "tech",
  lifestyle: "lifestyle",
  "라이프스타일": "lifestyle",
  fashion: "fashion",
  "패션": "fashion",
  education: "education",
  "교육": "education",
  fitness: "fitness",
  "피트니스": "fitness",
  game: "game",
  "게임": "game",
  mukbang: "food",
  food: "food",
  "푸드": "food",
  travel: "travel",
  "여행": "travel",
  living: "living",
  "리빙": "living",
  homecafe: "homecafe",
  "홈카페": "homecafe",
  parenting: "parenting",
  "육아": "parenting",
};

const categoryDisplayLabels: Record<string, string> = {
  beauty: "뷰티",
  tech: "테크",
  lifestyle: "라이프스타일",
  fashion: "패션",
  education: "교육",
  fitness: "피트니스",
  game: "게임",
  food: "푸드",
  travel: "여행",
  living: "리빙",
  homecafe: "홈카페",
  parenting: "육아",
};

const proposalTypeOptions = campaignProposalTypeOptions;
const influencerSortOptions: Array<{ label: string; value: InfluencerSortValue }> = [
  { label: "구독자·팔로워 많은순", value: "audience_desc" },
  { label: "구독자·팔로워 적은순", value: "audience_asc" },
  { label: "이름순", value: "name_asc" },
];

function getCategoryFilterKey(category: string) {
  const normalized = category.trim().toLowerCase();
  return categoryKeyAliases[normalized] ?? normalized;
}

function getCategoryLabel(category: string) {
  const key = getCategoryFilterKey(category);
  return categoryDisplayLabels[key] ?? cleanMarketplaceCopy(category);
}

function getCategoryLabels(categories: string[], limit: number) {
  const labelsByKey = new Map<string, string>();
  for (const category of categories) {
    const key = getCategoryFilterKey(category);
    if (!labelsByKey.has(key)) labelsByKey.set(key, getCategoryLabel(category));
  }
  return Array.from(labelsByKey.values()).slice(0, limit);
}

function hasAnyCategory(categories: string[], filters: string[]) {
  if (filters.length === 0) return true;
  const selectedKeys = new Set(filters);
  return categories.some((category) => selectedKeys.has(getCategoryFilterKey(category)));
}

function formatSelectedCategorySummary(categories: string[]) {
  if (categories.length === 0) return "";
  const labels = categories.map((category) => getCategoryLabel(category));
  return labels.length <= 2 ? labels.join(", ") : `카테고리 ${labels.length}개`;
}

type MarketplaceInfluencersResponse = {
  profiles: MarketplaceInfluencerProfile[];
  hasMore?: boolean;
};

type MarketplaceInfluencerResponse = {
  profile: MarketplaceInfluencerProfile;
};

type MarketplaceBrandsResponse = {
  brands: MarketplaceBrandProfile[];
};

type MarketplaceBrandResponse = {
  brand: MarketplaceBrandProfile;
};

const marketplaceInfluencerPageSize = 1000;

function mergeUniqueInfluencerProfiles(
  current: MarketplaceInfluencerProfile[],
  incoming: MarketplaceInfluencerProfile[],
) {
  const seen = new Set(current.map((profile) => profile.id));
  const next = [...current];
  for (const profile of incoming) {
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    next.push(profile);
  }
  return next;
}

function useMarketplaceInfluencers() {
  const [profiles, setProfiles] =
    useState<MarketplaceInfluencerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextOffsetRef = useRef(0);
  const loadingRef = useRef(false);
  const mountedRef = useRef(false);
  const hasMoreRef = useRef(true);

  const updateHasMore = useCallback((value: boolean) => {
    hasMoreRef.current = value;
    setHasMore(value);
  }, []);

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;

    const offset = nextOffsetRef.current;
    loadingRef.current = true;
    if (offset === 0) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const response = await apiFetch(
        `/api/marketplace/influencers?limit=${marketplaceInfluencerPageSize}&offset=${offset}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("Marketplace influencers failed");
      const data = (await response.json()) as MarketplaceInfluencersResponse;
      if (!mountedRef.current) return;

      const incomingProfiles = data.profiles.length > 0 ? data.profiles : [];
      setProfiles((current) =>
        offset === 0
          ? mergeUniqueInfluencerProfiles([], incomingProfiles)
          : mergeUniqueInfluencerProfiles(current, incomingProfiles),
      );
      nextOffsetRef.current = offset + incomingProfiles.length;
      updateHasMore(Boolean(data.hasMore) && incomingProfiles.length > 0);
    } catch {
      if (mountedRef.current && offset === 0) setProfiles([]);
      if (mountedRef.current) updateHasMore(false);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
      loadingRef.current = false;
    }
  }, [updateHasMore]);

  useEffect(() => {
    mountedRef.current = true;
    void loadNextPage();

    return () => {
      mountedRef.current = false;
    };
  }, [loadNextPage]);

  return { profiles, isLoading, isLoadingMore, hasMore, loadNextPage };
}

function useMarketplaceBrands() {
  const [brands, setBrands] =
    useState<MarketplaceBrandProfile[]>(marketplaceBrands);
  const [isLoading, setIsLoading] = useState(marketplaceBrands.length === 0);

  useEffect(() => {
    let active = true;

    void apiFetch("/api/marketplace/brands", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Marketplace brands failed");
        return (await response.json()) as MarketplaceBrandsResponse;
      })
      .then((data) => {
        if (!active) return;
        setBrands(
          data.brands.length > 0
            ? mergeMarketplaceBrandProfiles(data.brands)
            : marketplaceBrands,
        );
      })
      .catch(() => {
        if (active) setBrands(marketplaceBrands);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { brands, isLoading };
}

function useMarketplaceInfluencerProfile(handle: string | undefined) {
  const fallbackProfile: MarketplaceInfluencerProfile | null = null;
  const [remoteResult, setRemoteResult] = useState<{
    handle: string;
    profile: MarketplaceInfluencerProfile | null;
  } | null>(null);

  useEffect(() => {
    if (!handle) return;

    let active = true;

    void apiFetch(`/api/marketplace/influencers/${encodeURIComponent(handle)}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 404) return { profile: fallbackProfile };
        if (!response.ok) throw new Error("Marketplace influencer failed");
        return (await response.json()) as MarketplaceInfluencerResponse;
      })
      .then((data) => {
        if (active) setRemoteResult({ handle, profile: data.profile });
      })
      .catch(() => {
        if (active) {
          setRemoteResult({ handle, profile: fallbackProfile });
        }
      });

    return () => {
      active = false;
    };
  }, [fallbackProfile, handle]);

  const hasRemoteResult = remoteResult?.handle === handle;

  return {
    profile: hasRemoteResult ? remoteResult.profile : fallbackProfile,
    isLoading: Boolean(handle && !fallbackProfile && !hasRemoteResult),
  };
}

function useMarketplaceBrandProfile(handle: string | undefined) {
  const fallbackBrand = useMemo(
    () => (handle ? findBrandProfileByHandle(handle) ?? null : null),
    [handle],
  );
  const [remoteResult, setRemoteResult] = useState<{
    brand: MarketplaceBrandProfile | null;
    handle: string;
  } | null>(null);

  useEffect(() => {
    if (!handle) return;

    let active = true;

    void apiFetch(`/api/marketplace/brands/${encodeURIComponent(handle)}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 404) return { brand: fallbackBrand };
        if (!response.ok) throw new Error("Marketplace brand failed");
        return (await response.json()) as MarketplaceBrandResponse;
      })
      .then((data) => {
        if (active) setRemoteResult({ handle, brand: data.brand });
      })
      .catch(() => {
        if (active) {
          setRemoteResult({ handle, brand: fallbackBrand });
        }
      });

    return () => {
      active = false;
    };
  }, [fallbackBrand, handle]);

  const hasRemoteResult = remoteResult?.handle === handle;

  return {
    brand: hasRemoteResult ? remoteResult.brand : fallbackBrand,
    isLoading: Boolean(handle && !fallbackBrand && !hasRemoteResult),
  };
}

function useInfluencerPublicProfilePath() {
  const [path, setPath] = useState<string | undefined>();

  useEffect(() => {
    let active = true;

    void apiFetch("/api/influencer/public-profile", {
      headers: { Accept: "application/json" },
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) return undefined;
        const data = (await response.json()) as InfluencerPublicProfileResponse;
        return data.profile?.published
          ? getInfluencerPublicProfilePath(data.profile.handle)
          : undefined;
      })
      .then((nextPath) => {
        if (active) setPath(nextPath);
      })
      .catch(() => {
        if (active) setPath(undefined);
      });

    return () => {
      active = false;
    };
  }, []);

  return path;
}

export function AdvertiserInfluencerDiscoveryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [countryFilters, setCountryFilters] = useState<MarketplaceCountryCode[]>([]);
  const [influencerSort, setInfluencerSort] =
    useState<InfluencerSortValue>("audience_desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openFilterList, setOpenFilterList] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<MarketplaceInfluencerProfile | null>(null);
  const [previewProfile, setPreviewProfile] = useState<{
    profile: MarketplaceInfluencerProfile;
    top: number;
    left: number;
  } | null>(null);
  const {
    profiles,
    isLoading,
    isLoadingMore,
    hasMore,
    loadNextPage,
  } = useMarketplaceInfluencers();
  const { brands } = useMarketplaceBrands();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoading || !hasMore) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextPage();
        }
      },
      { rootMargin: "360px 0px 360px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadNextPage, profiles.length]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles
      .filter((profile) => {
        const matchesPlatform =
          platformFilter === "all" ||
          profile.platforms.some((platform) => platform.platform === platformFilter);
        if (!matchesPlatform) return false;
        if (!hasAnyCategory(profile.categories, categoryFilters)) return false;
        if (
          countryFilters.length > 0 &&
          !countryFilters.some((country) =>
            profile.audienceCountries?.includes(country),
          )
        ) {
          return false;
        }
        if (!normalizedQuery) return true;

        return [
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
          ...profile.platforms.map((platform) => platform.handle),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) =>
        compareInfluencerProfilesBySort(a, b, influencerSort, platformFilter),
      );
  }, [categoryFilters, countryFilters, influencerSort, platformFilter, profiles, query]);
  const influencerCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set<string>(
          profiles.flatMap((profile) =>
            profile.categories.map((category) => getCategoryFilterKey(category)),
          ),
        ),
      ).sort((left, right) =>
        getCategoryLabel(left).localeCompare(getCategoryLabel(right), "ko"),
      ),
    [profiles],
  );
  const activeFilterLabels = [
    query.trim() ? `검색 ${query.trim()}` : null,
    platformFilter !== "all" ? platformLabels[platformFilter] : null,
    categoryFilters.length > 0 ? formatSelectedCategorySummary(categoryFilters) : null,
    countryFilters.length > 0
      ? `국가 ${formatMarketplaceCountries(countryFilters)}`
      : null,
  ].filter((label): label is string => Boolean(label));
  const filterSummary =
    activeFilterLabels.length > 0 ? activeFilterLabels.join(" · ") : "전체 조건";
  const showProfilePreview = (
    profile: MarketplaceInfluencerProfile,
    event:
      | MouseEvent<HTMLElement>
      | PointerEvent<HTMLElement>
      | FocusEvent<HTMLElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 344;
    const height = 258;
    const hasPointer = "clientX" in event && typeof event.clientX === "number";
    const anchorX = hasPointer ? event.clientX : rect.left + rect.width * 0.62;
    const anchorY = hasPointer ? event.clientY : rect.top + 20;
    const rightSideLeft = anchorX + 18;
    const leftSideLeft = anchorX - width - 18;
    const left =
      rightSideLeft + width <= window.innerWidth - 16
        ? rightSideLeft
        : Math.max(16, leftSideLeft);
    const top = Math.min(
      Math.max(72, anchorY + 16),
      Math.max(72, window.innerHeight - height - 16),
    );

    setPreviewProfile({ profile, top, left });
  };

  return (
    <MarketplaceShell
      eyebrow="광고주 탐색"
      title="인플루언서 찾기"
      description="프로필과 채널 규모를 보고 바로 컨택합니다."
      backHref="/advertiser/dashboard"
      backLabel="1:1 계약 대시보드"
      profileCount={profiles.length}
      brandCount={brands.length}
      showMetrics={false}
      showHeroCopy={false}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/advertiser/builder")}
            className="yl-header-action yl-header-action-primary"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">1:1 계약</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/advertiser/campaigns")}
            className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
          >
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">캠페인</span>
          </button>
        </div>
      }
    >
      <DiscoveryControls
        title="인플루언서 목록"
        count={filteredProfiles.length}
        summary={filterSummary}
        open={filtersOpen}
        activeCount={activeFilterLabels.length}
        controlsId="advertiser-influencer-filters"
        toolbar={
          <InfluencerSortSelect
            value={influencerSort}
            onChange={setInfluencerSort}
          />
        }
        onToggle={() =>
          setFiltersOpen((current) => {
            if (current) setOpenFilterList(null);
            return !current;
          })
        }
      >
        <SearchBox
          value={query}
          onChange={setQuery}
          label="인플루언서 검색"
          placeholder="이름, 핸들, 카테고리 검색"
        />
        <PlatformSelectList
          id="advertiser-platform"
          openId={openFilterList}
          onOpenChange={setOpenFilterList}
          value={platformFilter}
          onChange={setPlatformFilter}
        />
        <CategorySelectList
          id="advertiser-category"
          openId={openFilterList}
          onOpenChange={setOpenFilterList}
          values={categoryFilters}
          categories={influencerCategoryOptions}
          onChange={setCategoryFilters}
        />
        <CountrySelectList
          id="advertiser-country"
          openId={openFilterList}
          onOpenChange={setOpenFilterList}
          values={countryFilters}
          onChange={setCountryFilters}
        />
      </DiscoveryControls>

      {isLoading ? (
        <MarketplaceLoadingState label="인플루언서 프로필을 불러오는 중입니다" />
      ) : filteredProfiles.length === 0 ? (
        <EmptyMarketplaceState
          title="조건에 맞는 인플루언서가 없습니다"
          body="검색어나 조건을 줄여보세요."
        />
      ) : (
        <>
          <InfluencerDiscoveryTable
            profiles={filteredProfiles}
            platformFilter={platformFilter}
            loadMoreRef={loadMoreRef}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            onContact={setSelectedProfile}
            onPreview={showProfilePreview}
            onPreviewEnd={() => setPreviewProfile(null)}
          />
          {previewProfile ? (
            <InfluencerPreviewCard
              profile={previewProfile.profile}
              top={previewProfile.top}
              left={previewProfile.left}
            />
          ) : null}
        </>
      )}

      {selectedProfile ? (
        <InfluencerContactDialog
          key={selectedProfile.id}
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      ) : null}
    </MarketplaceShell>
  );
}

export function InfluencerBrandDiscoveryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openFilterList, setOpenFilterList] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] =
    useState<MarketplaceBrandProfile | null>(null);
  const publicProfilePath = useInfluencerPublicProfilePath();
  const { profiles } = useMarketplaceInfluencers();
  const { brands, isLoading } = useMarketplaceBrands();
  const displayBrands = useMemo(
    () => dedupeBrandsByDisplayIdentity(brands),
    [brands],
  );

  const filteredBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return displayBrands.filter((brand) => {
      const matchesPlatform =
        platformFilter === "all" ||
        brand.preferredPlatforms.includes(platformFilter);
      if (!matchesPlatform) return false;
      if (!normalizedQuery) return true;

      return [
        brand.displayName,
        brand.handle,
        brand.category,
        brand.headline,
        brand.description,
        brand.location,
        ...brand.fitTags,
        ...brand.audienceTargets,
        ...brand.recentCreators,
        ...brand.activeCampaigns.map((campaign) => campaign.title),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [displayBrands, platformFilter, query]);
  const activeFilterLabels = [
    query.trim() ? `검색 ${query.trim()}` : null,
    platformFilter !== "all" ? platformLabels[platformFilter] : null,
  ].filter((label): label is string => Boolean(label));
  const filterSummary =
    activeFilterLabels.length > 0 ? activeFilterLabels.join(" · ") : "전체 조건";

  return (
    <MarketplaceShell
      eyebrow="인플루언서 탐색"
      title="브랜드 찾기"
      description="브랜드 정보를 확인하고 바로 역제안합니다."
      backHref="/influencer/dashboard"
      backLabel="1:1 계약"
      profileCount={profiles.length}
      brandCount={displayBrands.length}
      showMetrics={false}
      showHeroCopy={false}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/influencer/dashboard")}
            className="yl-header-action yl-header-action-primary"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">1:1 계약</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/influencer/campaigns")}
            className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
          >
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">캠페인</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(publicProfilePath ?? "/influencer/dashboard")}
            className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden sm:inline">
              {publicProfilePath ? "공개 프로필" : "프로필 설정"}
            </span>
          </button>
        </div>
      }
    >
      <DiscoveryControls
        title="브랜드 목록"
        count={filteredBrands.length}
        summary={filterSummary}
        open={filtersOpen}
        activeCount={activeFilterLabels.length}
        controlsId="influencer-brand-filters"
        onToggle={() =>
          setFiltersOpen((current) => {
            if (current) setOpenFilterList(null);
            return !current;
          })
        }
      >
        <SearchBox
          value={query}
          onChange={setQuery}
          label="브랜드 검색"
          placeholder="브랜드, 카테고리 검색"
        />
        <PlatformSelectList
          id="brand-platform"
          openId={openFilterList}
          onOpenChange={setOpenFilterList}
          value={platformFilter}
          onChange={setPlatformFilter}
        />
      </DiscoveryControls>

      {isLoading ? (
        <MarketplaceLoadingState label="브랜드 프로필을 불러오는 중입니다" />
      ) : filteredBrands.length === 0 ? (
        <EmptyMarketplaceState
          title="조건에 맞는 브랜드가 없습니다"
          body="검색어나 조건을 줄여보세요."
        />
      ) : (
        <section className="grid min-h-0 flex-1 items-start gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:p-4">
          {filteredBrands.map((brand) => (
            <BrandDiscoveryCard
              key={brand.id}
              brand={brand}
              onContact={() => setSelectedBrand(brand)}
            />
          ))}
        </section>
      )}

      {selectedBrand ? (
        <BrandContactDialog
          key={selectedBrand.id}
          brand={selectedBrand}
          onClose={() => setSelectedBrand(null)}
        />
      ) : null}
    </MarketplaceShell>
  );
}

export function PublicInfluencerProfilePage() {
  const navigate = useNavigate();
  const { profileHandle } = useParams<{ profileHandle: string }>();
  const [showContact, setShowContact] = useState(false);
  const [failedProfileAvatarUrl, setFailedProfileAvatarUrl] = useState<string | null>(
    null,
  );
  const { profile, isLoading } = useMarketplaceInfluencerProfile(profileHandle);
  const currentProfilePath = useInfluencerPublicProfilePath();

  if (isLoading) {
    return (
      <MarketplaceShell
        eyebrow="공개 프로필"
        title="프로필을 불러오는 중입니다"
        description="공개 주소에 연결된 인플루언서 정보를 확인하고 있습니다."
        backHref="/"
        backLabel="처음으로"
      >
        <MarketplaceLoadingState label="공개 프로필 확인 중" />
      </MarketplaceShell>
    );
  }

  if (!profile) {
    return (
      <MarketplaceShell
        eyebrow="공개 프로필"
        title="프로필을 찾을 수 없습니다"
        description="핸들이 바뀌었거나 아직 공개되지 않은 프로필입니다."
        backHref="/"
        backLabel="처음으로"
        showMetrics={false}
      >
        <EmptyMarketplaceState
          title="공개 프로필 없음"
          body="주소를 다시 확인하거나 인플루언서에게 최신 프로필 링크를 요청해 주세요."
          primaryHref="/advertiser/discover"
          primaryLabel="인플루언서 찾기"
          secondaryHref="/intro/advertiser"
          secondaryLabel="광고주 시작 화면"
        />
      </MarketplaceShell>
    );
  }

  const categoryLabels = getCategoryLabels(profile.categories, 4);
  const channelSummaries = profile.platforms.slice(0, 4);
  const platformCount = Math.min(Math.max(channelSummaries.length, 1), 4);
  const isDiscoveredProfile = isDiscoveredMarketplaceInfluencer(profile);
  const primaryChannelUrl = getMarketplaceInfluencerPrimaryChannelUrl(
    profile,
    "all",
  );
  const hasFeaturedPlatformLayout = platformCount <= 2;
  const platformRowsClassName =
    platformCount === 1
      ? "grid gap-1 lg:grid-cols-[minmax(0,1fr)]"
      : platformCount === 2
        ? "grid gap-1 lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:gap-x-8"
        : platformCount === 3
          ? "grid gap-1 lg:grid-cols-[repeat(3,minmax(150px,1fr))] lg:gap-x-9"
          : "grid gap-1 lg:grid-cols-[repeat(4,minmax(116px,1fr))] lg:gap-x-5";
  const platformLinkClassName = [
    "group relative grid min-h-[50px] min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-neutral-100 py-2.5 transition last:border-b-0 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:min-h-[54px] lg:flex lg:flex-col lg:border-b-0 lg:py-0",
    hasFeaturedPlatformLayout
      ? "lg:min-h-[118px] lg:items-center lg:justify-center"
      : "lg:min-h-[90px] lg:items-start lg:justify-start",
  ].join(" ");
  const platformLabelClassName = [
    "flex min-w-0 items-center gap-2.5",
    hasFeaturedPlatformLayout
      ? "lg:w-full lg:justify-center lg:gap-3 lg:pr-8"
      : "lg:w-full lg:pr-7",
  ].join(" ");
  const platformNameClassName = [
    "truncate text-[15px] font-black leading-5 text-neutral-950",
    hasFeaturedPlatformLayout ? "lg:text-[17px] lg:leading-6" : "",
  ].join(" ");
  const platformFollowerClassName = [
    "text-right text-[22px] font-black leading-none text-neutral-950 tabular-nums sm:text-[24px]",
    hasFeaturedPlatformLayout
      ? "lg:mt-4 lg:text-center lg:text-[48px]"
      : "lg:mt-3 lg:text-left lg:text-[36px]",
  ].join(" ");
  const isOwnPublishedProfile = Boolean(
    currentProfilePath &&
      normalizePublicProfileHandle(currentProfilePath) ===
        normalizePublicProfileHandle(profile.handle),
  );
  const primaryProfileActionLabel = isOwnPublishedProfile
    ? "프로필 관리"
    : isDiscoveredProfile
      ? "채널 보기"
      : "제안하기";
  const primaryProfileActionIcon = isOwnPublishedProfile ? (
    <Settings className="h-4 w-4" />
  ) : isDiscoveredProfile ? (
    <ExternalLink className="h-4 w-4" />
  ) : (
    <Handshake className="h-4 w-4" />
  );
  const primaryProfileActionClassName =
    "items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-4 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700";
  const handlePrimaryProfileAction = () => {
    if (isOwnPublishedProfile) {
      navigate("/influencer/dashboard");
      return;
    }
    if (isDiscoveredProfile) return;
    setShowContact(true);
  };
  const renderPrimaryProfileAction = (className: string) =>
    isDiscoveredProfile && primaryChannelUrl ? (
      <a
        href={primaryChannelUrl}
        target="_blank"
        rel="noreferrer"
        className={className}
        aria-label={`${profile.displayName} 공개 채널 보기`}
        title="공개 채널 보기"
      >
        {primaryProfileActionIcon}
        {primaryProfileActionLabel}
      </a>
    ) : (
      <button
        type="button"
        onClick={handlePrimaryProfileAction}
        className={className}
      >
        {primaryProfileActionIcon}
        {primaryProfileActionLabel}
      </button>
    );

  const profileAvatarUrl = getMarketplaceInfluencerAvatarUrl(profile);
  const shouldRenderProfileAvatar =
    Boolean(profileAvatarUrl) && failedProfileAvatarUrl !== profileAvatarUrl;

  return (
    <main className="min-h-svh bg-[#f4f7fb] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-h-10 min-w-10 items-center gap-3">
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em]">{PRODUCT_NAME}</span>
          </Link>
          <Link
            to="/advertiser/discover"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 sm:hidden"
            aria-label="인플루언서 목록으로 돌아가기"
            title="인플루언서 목록으로 돌아가기"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link
            to="/intro/advertiser"
            className="hidden h-10 items-center rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 sm:inline-flex"
          >
            광고주 시작하기
          </Link>
        </div>
      </header>

      <section className="px-4 py-4 sm:px-6 sm:py-8 lg:px-8 lg:pt-14">
        <article
          data-profile-layout="creator-media-kit"
          className="mx-auto max-w-[1080px] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.1)]"
        >
          <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="relative bg-neutral-950 p-1.5 sm:p-2.5">
              <img
                src={profileAvatarUrl}
                alt={profile.displayName}
                className="h-[200px] w-full rounded-[20px] object-cover shadow-[0_18px_42px_rgba(15,23,42,0.12)] sm:h-[320px] sm:rounded-[22px] lg:h-full lg:min-h-[360px]"
                style={{ display: shouldRenderProfileAvatar ? undefined : "none" }}
                onError={() => setFailedProfileAvatarUrl(profileAvatarUrl ?? null)}
              />
              {!shouldRenderProfileAvatar ? (
                <div className="flex h-[200px] w-full items-center justify-center rounded-[20px] bg-neutral-900 text-[40px] font-extrabold text-white shadow-[0_18px_42px_rgba(15,23,42,0.12)] sm:h-[320px] sm:rounded-[22px] sm:text-[56px] lg:h-full lg:min-h-[360px]">
                  {profile.avatarLabel}
                </div>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col p-4 sm:p-7 lg:p-8">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_156px] lg:items-start">
                <div className="min-w-0">
              <p className="break-keep text-[13px] font-extrabold text-neutral-500 sm:text-[14px]">
                {categoryLabels.join(" · ")}
              </p>

              <h1 className="font-neo-heavy mt-4 text-[33px] leading-[0.98] tracking-normal text-neutral-950 sm:mt-5 sm:text-[56px]">
                {profile.displayName}
              </h1>
              <p className="mt-3 max-w-xl break-keep text-[15px] font-extrabold leading-6 text-neutral-800 sm:mt-4 sm:text-[19px] sm:leading-8">
                {cleanMarketplaceCopy(profile.headline)}
              </p>

                </div>

                {renderPrimaryProfileAction(
                  `hidden h-12 w-[156px] lg:inline-flex ${primaryProfileActionClassName}`,
                )}
              </div>

              <div className="mt-auto pt-5 sm:pt-7">
                <div
                  data-profile-platform-strip
                  className="border-t border-neutral-200 pt-4"
                >
                  <div className="grid gap-4">
                    <div className={platformRowsClassName}>
                      {channelSummaries.map((platform) => (
                        <a
                          key={`${platform.platform}-${platform.handle}`}
                          href={platform.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${getPlatformDisplayName(platform.platform)} ${platform.handle} 계정 보기`}
                          title={`${getPlatformDisplayName(platform.platform)} ${platform.handle}`}
                          className={platformLinkClassName}
                        >
                          <div className={platformLabelClassName}>
                            <PlatformBrandMark platform={platform.platform} />
                            <div className="min-w-0">
                              <p className={platformNameClassName}>
                                {getPlatformDisplayName(platform.platform)}
                              </p>
                            </div>
                          </div>
                          <p className={platformFollowerClassName}>
                            {platform.followersLabel}
                          </p>
                          <span
                            aria-hidden="true"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-neutral-400 transition group-hover:bg-blue-50 group-hover:text-blue-700 lg:absolute lg:right-0 lg:top-0 lg:h-7 lg:w-7"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </span>
                        </a>
                      ))}
                    </div>

                    <aside className="flex min-h-[52px] min-w-0 items-center justify-center lg:hidden">
                      {renderPrimaryProfileAction(
                        `inline-flex h-12 w-full ${primaryProfileActionClassName}`,
                      )}
                    </aside>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </article>
      </section>

      {showContact && !isOwnPublishedProfile && !isDiscoveredProfile ? (
        <InfluencerContactDialog
          key={profile.id}
          profile={profile}
          onClose={() => setShowContact(false)}
        />
      ) : null}
    </main>
  );
}

export function PublicBrandProfilePage() {
  const { brandHandle } = useParams<{ brandHandle: string }>();
  const [showContact, setShowContact] = useState(false);
  const { brand, isLoading } = useMarketplaceBrandProfile(brandHandle);

  if (isLoading) {
    return (
      <MarketplaceShell
        eyebrow="브랜드 프로필"
        title="브랜드를 불러오는 중입니다"
        description="공개 주소에 연결된 입점 브랜드 정보를 확인하고 있습니다."
        backHref="/influencer/brands"
        backLabel="브랜드 찾기"
      >
        <MarketplaceLoadingState label="브랜드 프로필 확인 중" />
      </MarketplaceShell>
    );
  }

  if (!brand) {
    return (
      <MarketplaceShell
        eyebrow="브랜드 프로필"
        title="브랜드를 찾을 수 없습니다"
        description="핸들이 바뀌었거나 아직 공개되지 않은 브랜드 프로필입니다."
        backHref="/influencer/brands"
        backLabel="브랜드 찾기"
        showMetrics={false}
      >
        <EmptyMarketplaceState
          title="공개 브랜드 없음"
          body="주소를 다시 확인하거나 브랜드에게 최신 프로필 링크를 요청해 주세요."
          primaryHref="/influencer/brands"
          primaryLabel="브랜드 찾기"
          secondaryHref="/intro/influencer"
          secondaryLabel="인플루언서 시작 화면"
        />
      </MarketplaceShell>
    );
  }

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em]">{PRODUCT_NAME}</span>
          </Link>
          <Link
            to="/intro/influencer"
            className="inline-flex h-10 items-center rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            인플루언서 시작하기
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-neutral-200/80 bg-white">
          <div className="mx-auto grid max-w-[1180px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
            <div className="min-w-0">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <AvatarBlock
                  label={brand.logoLabel}
                  src={brand.logoUrl}
                  alt={brand.displayName}
                  size="large"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-all text-[13px] font-semibold text-neutral-500">
                    yeollock.me/brands/{brand.handle}
                  </p>
                  <h1 className="font-neo-heavy mt-2 text-[30px] leading-tight tracking-[-0.035em] text-neutral-950 sm:text-[40px]">
                    {brand.displayName}
                  </h1>
                  <p className="mt-2 max-w-2xl break-keep text-[15px] font-medium leading-6 text-neutral-600">
                    {formatBrandMarketplaceHeadline(brand)}
                  </p>
                  <p className="mt-2 line-clamp-2 max-w-3xl break-keep text-[13px] leading-5 text-neutral-600">
                    {formatBrandMarketplaceDescription(brand)}
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowContact(true)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-[13px] font-extrabold text-white shadow-[0_14px_30px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
                    >
                      <Handshake className="h-4 w-4" />
                      브랜드에 역제안하기
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <aside className="grid gap-2 rounded-[14px] border border-neutral-200 bg-[#fbfaf7] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
              <MiniMetric label="예산 범위" value={brand.budgetRangeLabel} />
              <MiniMetric label="위치" value={brand.location} />
              <div className="rounded-[10px] border border-neutral-200 bg-white px-3 py-3">
                <p className="yl-fact-label">선호 플랫폼</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {brand.preferredPlatforms.map((platform) => (
                    <PlatformPill
                      key={`${brand.id}-summary-${platform}`}
                      platform={platform}
                      label={platformLabels[platform]}
                    />
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1180px] gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
          <div className="grid gap-4">
            <ProfileSection title="진행 중인 캠페인">
              <div className="grid gap-3 md:grid-cols-2">
                {brand.activeCampaigns.slice(0, 4).map((campaign) => (
                  <article
                    key={`${campaign.title}-${campaign.type}`}
                    className="rounded-[10px] border border-neutral-200 bg-white p-4"
                  >
                    <p className="text-[12px] font-semibold text-neutral-500">
                      {proposalTypeLabels[campaign.type]}
                    </p>
                    <h2 className="mt-1.5 truncate text-[14px] font-semibold text-neutral-950">
                      {campaign.title}
                    </h2>
                    <dl className="mt-3 grid gap-2 text-[12px] font-semibold text-neutral-600">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-neutral-400">예산</dt>
                        <dd className="text-right text-neutral-800">{campaign.budget}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-neutral-400">모집</dt>
                        <dd className="text-right text-neutral-800">
                          {campaign.applicantLimit}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              {brand.activeCampaigns.length > 4 ? (
                <p className="mt-2 text-[12px] font-semibold text-neutral-500">
                  나머지 {brand.activeCampaigns.length - 4}건도 브랜드 조건에 맞춰 검토할 수 있습니다.
                </p>
              ) : null}
            </ProfileSection>

            <ProfileSection title="협업 방식">
              <TagList
                items={brand.proposalTypes.map((type) => proposalTypeLabels[type])}
              />
            </ProfileSection>
          </div>

          <aside className="grid gap-4">
            <ProfileSection title="잘 맞는 크리에이터">
              <TagList items={brand.fitTags.map(cleanMarketplaceCopy)} />
            </ProfileSection>
            <ProfileSection title="타깃 고객">
              <TagList items={brand.audienceTargets.map(cleanMarketplaceCopy)} />
            </ProfileSection>
            <ProfileSection title="최근 협업 크리에이터">
              <TagList items={brand.recentCreators.map(cleanMarketplaceCopy)} />
            </ProfileSection>
          </aside>
        </section>
      </div>

      {showContact ? (
        <BrandContactDialog
          key={brand.id}
          brand={brand}
          onClose={() => setShowContact(false)}
        />
      ) : null}
    </main>
  );
}

function MarketplaceShell({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  profileCount,
  brandCount,
  actions,
  showMetrics = true,
  showHeroCopy = true,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  profileCount?: number;
  brandCount?: number;
  actions?: ReactNode;
  showMetrics?: boolean;
  showHeroCopy?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const role = backHref.startsWith("/influencer") ? "influencer" : "advertiser";
  const handleLogout = async () => {
    try {
      await apiFetch(`/api/${role}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] ${role} logout request failed`, error);
    } finally {
      navigate(role === "advertiser" ? "/login/advertiser" : "/login/influencer", {
        replace: true,
      });
    }
  };

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none sm:text-[19px]">{PRODUCT_NAME}</span>
          </Link>
          <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
            <Link
              to={backHref}
              className="yl-header-action yl-header-action-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            {actions}
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(`/reset-password?role=${role}`, { replace: false })
              }
              className="yl-header-icon-action"
              aria-label="계정 설정"
              title="계정 설정"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <section
        className={`shrink-0 bg-[#f7f6f3] ${
          showHeroCopy ? "border-b border-neutral-200/80" : ""
        }`}
      >
        <div
          className={`mx-auto max-w-[1500px] px-3 sm:px-5 lg:px-6 ${
            showHeroCopy ? "py-3 sm:py-4" : "pb-3 pt-8 sm:py-4"
          }`}
        >
          {showHeroCopy ? (
            <p className="text-[13px] font-extrabold text-neutral-500">{eyebrow}</p>
          ) : null}
          <div className={`${showHeroCopy ? "mt-1.5" : ""} flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between`}>
            <div className="min-w-0">
              <h1 className="font-neo-heavy text-[28px] leading-[1.05] text-neutral-950 sm:text-[36px] sm:leading-none">
                {title}
              </h1>
              {showHeroCopy ? (
                <p className="mt-2 line-clamp-1 max-w-3xl break-keep text-[13px] font-bold leading-5 text-neutral-600">
                  {description}
                </p>
              ) : null}
            </div>
            {showMetrics ? (
              <div className="grid grid-cols-3 gap-1.5 rounded-[14px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_26px_rgba(15,23,42,0.035)] sm:w-[360px]">
                <MiniMetric label="공개 프로필" value={(profileCount ?? 0).toString()} />
                <MiniMetric label="입점 브랜드" value={(brandCount ?? marketplaceBrands.length).toString()} />
                <MiniMetric label="계약 연결" value="요청 가능" />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="yl-panel mx-3 my-3 flex min-h-0 max-w-[1500px] flex-1 flex-col overflow-visible border sm:mx-5 lg:mx-auto lg:w-full">
        {children}
      </div>
    </main>
  );
}

function InfluencerDiscoveryTable({
  profiles,
  platformFilter,
  loadMoreRef,
  isLoadingMore,
  hasMore,
  onContact,
  onPreview,
  onPreviewEnd,
}: {
  profiles: MarketplaceInfluencerProfile[];
  platformFilter: PlatformFilter;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  isLoadingMore: boolean;
  hasMore: boolean;
  onContact: (profile: MarketplaceInfluencerProfile) => void;
  onPreview: (
    profile: MarketplaceInfluencerProfile,
    event:
      | MouseEvent<HTMLElement>
      | PointerEvent<HTMLElement>
      | FocusEvent<HTMLElement>,
  ) => void;
  onPreviewEnd: () => void;
}) {
  const setVisibleLoadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && node.offsetParent !== null) loadMoreRef.current = node;
    },
    [loadMoreRef],
  );
  const renderLoadMoreMarker = () => {
    const compactMarker = profiles.length < 8;
    return hasMore || isLoadingMore ? (
      <div
        ref={setVisibleLoadMoreRef}
        className={
          compactMarker
            ? "h-px"
            : "flex h-14 items-center justify-center text-[12px] font-extrabold text-neutral-400"
        }
        aria-live="polite"
      >
        {isLoadingMore && !compactMarker ? "불러오는 중" : null}
      </div>
    ) : null;
  };

  return (
    <section className="min-h-0 flex-1 overflow-auto p-2.5 lg:flex lg:flex-col lg:overflow-hidden lg:p-4">
      <div className="hidden min-h-0 min-w-[980px] flex-1 flex-col rounded-[8px] border border-[#d9e0d9] bg-white lg:flex">
        <div
          data-influencer-table-header="true"
          className="grid shrink-0 grid-cols-[64px_180px_minmax(420px,1fr)_88px_132px_156px] items-center gap-3 rounded-t-[8px] border-b border-[#d7ddd7] bg-[#f7f8f4] px-4 py-3 text-[12px] font-extrabold tracking-[-0.01em] text-[#303630] shadow-[0_1px_0_rgba(215,221,215,0.9)]"
        >
          <span>플랫폼</span>
          <span>카테고리</span>
          <span>인플루언서</span>
          <span>국가</span>
          <span>구독자/팔로워</span>
          <span className="text-right">액션</span>
        </div>
        <div
          data-influencer-table-scroll="true"
          className="min-h-0 flex-1 overflow-auto"
        >
          {profiles.map((profile) => (
            <InfluencerDiscoveryTableRow
              key={profile.id}
              profile={profile}
              platformFilter={platformFilter}
              onContact={onContact}
              onPreview={onPreview}
              onPreviewEnd={onPreviewEnd}
            />
          ))}
          {renderLoadMoreMarker()}
        </div>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white lg:hidden">
        {profiles.map((profile) => (
          <InfluencerDiscoveryCompactRow
            key={profile.id}
            profile={profile}
            platformFilter={platformFilter}
            onContact={onContact}
          />
        ))}
      </div>
      <div className="lg:hidden">{renderLoadMoreMarker()}</div>
    </section>
  );
}

function InfluencerDiscoveryTableRow({
  profile,
  platformFilter,
  onContact,
  onPreview,
  onPreviewEnd,
}: {
  key?: string;
  profile: MarketplaceInfluencerProfile;
  platformFilter: PlatformFilter;
  onContact: (profile: MarketplaceInfluencerProfile) => void;
  onPreview: (
    profile: MarketplaceInfluencerProfile,
    event:
      | MouseEvent<HTMLElement>
      | PointerEvent<HTMLElement>
      | FocusEvent<HTMLElement>,
  ) => void;
  onPreviewEnd: () => void;
}) {
  const primaryPlatform = getMarketplaceInfluencerDisplayPlatform(
    profile,
    platformFilter,
  );
  const categoryLabel = getCategoryLabels(profile.categories, 3).join(" · ");
  const countryLabel = formatMarketplaceCountries(profile.audienceCountries, "한국");
  const audienceLabel = formatDiscoveryAudienceMetric(primaryPlatform?.followersLabel);
  const platformLabel = primaryPlatform
    ? platformLabels[primaryPlatform.platform]
    : "기타";
  const canPropose = isRegisteredMarketplaceInfluencer(profile);
  const primaryChannelUrl = getMarketplaceInfluencerPrimaryChannelUrl(
    profile,
    platformFilter,
  );

  return (
    <article
      data-marketplace-influencer-row="true"
      tabIndex={0}
      onMouseEnter={(event) => onPreview(profile, event)}
      onMouseMove={(event) => onPreview(profile, event)}
      onPointerEnter={(event) => onPreview(profile, event)}
      onPointerMove={(event) => onPreview(profile, event)}
      onFocus={(event) => onPreview(profile, event)}
      onMouseLeave={onPreviewEnd}
      onPointerLeave={onPreviewEnd}
      onBlur={onPreviewEnd}
      className="group grid min-h-[64px] grid-cols-[64px_180px_minmax(420px,1fr)_88px_132px_156px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#fbfcfa] focus-visible:bg-[#fbfcfa] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600"
    >
      <div className="min-w-0">
        {primaryPlatform ? (
          <span
            className="inline-flex max-w-full items-center text-neutral-800"
            title={platformLabel}
            aria-label={platformLabel}
          >
            <PlatformBrandMark platform={primaryPlatform.platform} size="xs" />
          </span>
        ) : (
          <span className="text-[12px] font-bold text-neutral-400">확인 필요</span>
        )}
      </div>

      <p className="truncate text-[12px] font-bold text-neutral-700">
        {categoryLabel || "카테고리 확인"}
      </p>

      <div className="flex min-w-0 items-center gap-3">
        <Link
          to={getInfluencerProfilePath(profile)}
          className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          aria-label={`${profile.displayName} 프로필 보기`}
        >
          <AvatarBlock
            label={profile.avatarLabel}
            src={getMarketplaceInfluencerAvatarUrl(profile)}
            alt={profile.displayName}
          />
        </Link>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              to={getInfluencerProfilePath(profile)}
              className="min-w-0 truncate text-[14px] font-extrabold text-neutral-950 hover:underline"
              title={profile.displayName}
            >
              {profile.displayName}
            </Link>
          </div>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-neutral-500">
            {cleanMarketplaceCopy(profile.bio || profile.headline)}
          </p>
        </div>
      </div>

      <p className="truncate text-[12px] font-bold text-neutral-500">{countryLabel}</p>
      <p className="truncate text-[12px] font-extrabold text-neutral-950">
        {audienceLabel}
      </p>

      <div className="flex justify-end gap-2">
        {canPropose ? (
          <button
            type="button"
            onClick={() => onContact(profile)}
            className="inline-flex h-9 w-[86px] items-center justify-center gap-1.5 rounded-[7px] bg-blue-600 px-2 text-[12px] font-extrabold text-white transition hover:bg-blue-700"
          >
            <Send className="h-3.5 w-3.5" />
            1:1 제안
          </button>
        ) : (
          <a
            href={primaryChannelUrl ?? getInfluencerProfilePath(profile)}
            target={primaryChannelUrl ? "_blank" : undefined}
            rel={primaryChannelUrl ? "noreferrer" : undefined}
            aria-label={`${profile.displayName} 공개 채널 보기`}
            title="공개 채널 보기"
            className="inline-flex h-9 w-[86px] items-center justify-center gap-1.5 rounded-[7px] bg-blue-600 px-2 text-[12px] font-extrabold text-white transition hover:bg-blue-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            채널 보기
          </a>
        )}
        <Link
          to={getInfluencerProfilePath(profile)}
          className="inline-flex h-9 w-[58px] items-center justify-center rounded-[7px] border border-neutral-200 bg-white text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          {canPropose ? "프로필" : "정보"}
        </Link>
      </div>
    </article>
  );
}

function InfluencerDiscoveryCompactRow({
  profile,
  platformFilter,
  onContact,
}: {
  key?: string;
  profile: MarketplaceInfluencerProfile;
  platformFilter: PlatformFilter;
  onContact: (profile: MarketplaceInfluencerProfile) => void;
}) {
  const primaryPlatform = getMarketplaceInfluencerDisplayPlatform(
    profile,
    platformFilter,
  );
  const categoryLabel = getCategoryLabels(profile.categories, 2).join(" · ");
  const canPropose = isRegisteredMarketplaceInfluencer(profile);
  const primaryChannelUrl = getMarketplaceInfluencerPrimaryChannelUrl(
    profile,
    platformFilter,
  );

  return (
    <article className="grid gap-3 border-b border-[#e4e9e4] p-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <AvatarBlock
          label={profile.avatarLabel}
          src={getMarketplaceInfluencerAvatarUrl(profile)}
          alt={profile.displayName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-[15px] font-extrabold text-neutral-950">
              {profile.displayName}
            </h2>
          </div>
          <p className="mt-1 truncate text-[12px] font-bold text-neutral-600">
            {categoryLabel || "카테고리 확인"}
          </p>
          {primaryPlatform ? (
            <div className="mt-1.5">
              <PlatformPill
                platform={primaryPlatform.platform}
                label={platformLabels[primaryPlatform.platform]}
                value={primaryPlatform.followersLabel}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {canPropose ? (
          <button
            type="button"
            onClick={() => onContact(profile)}
            className="yl-primary-action inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] font-extrabold transition"
          >
            <Send className="h-4 w-4" />
            1:1 제안
          </button>
        ) : (
          <a
            href={primaryChannelUrl ?? getInfluencerProfilePath(profile)}
            target={primaryChannelUrl ? "_blank" : undefined}
            rel={primaryChannelUrl ? "noreferrer" : undefined}
            aria-label={`${profile.displayName} 공개 채널 보기`}
            title="공개 채널 보기"
            className="yl-primary-action inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] font-extrabold transition"
          >
            <ExternalLink className="h-4 w-4" />
            채널 보기
          </a>
        )}
        <Link
          to={getInfluencerProfilePath(profile)}
          className="yl-secondary-action inline-flex h-10 items-center justify-center rounded-[8px] border text-[13px] font-extrabold transition"
        >
          {canPropose ? "프로필" : "정보"}
        </Link>
      </div>
    </article>
  );
}

function InfluencerPreviewCard({
  profile,
  top,
  left,
}: {
  profile: MarketplaceInfluencerProfile;
  top: number;
  left: number;
}) {
  const categoryLabel = getCategoryLabels(profile.categories, 4).join(" · ");
  const countryLabel = formatMarketplaceCountries(profile.audienceCountries, "한국");
  const description = cleanMarketplaceCopy(profile.bio || profile.headline);

  return (
    <aside
      data-marketplace-preview-card="true"
      className="pointer-events-none fixed z-50 hidden w-[344px] rounded-[10px] border border-[#cfd8cf] bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.18)] lg:block"
      style={{ top, left }}
      aria-hidden="true"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AvatarBlock
          label={profile.avatarLabel}
          src={getMarketplaceInfluencerAvatarUrl(profile)}
          alt={profile.displayName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[16px] font-extrabold text-neutral-950">
              {profile.displayName}
            </h3>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-5 text-neutral-600">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-[12px]">
        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-2">
          <span className="font-extrabold text-neutral-400">카테고리</span>
          <span className="truncate font-extrabold text-neutral-800">
            {categoryLabel || "확인 필요"}
          </span>
        </div>
        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-2">
          <span className="font-extrabold text-neutral-400">국가</span>
          <span className="truncate font-extrabold text-neutral-800">{countryLabel}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {profile.platforms.slice(0, 3).map((platform) => (
          <PlatformPill
            key={`${profile.id}-preview-${platform.platform}`}
            platform={platform.platform}
            label={platformLabels[platform.platform]}
            value={platform.followersLabel}
          />
        ))}
      </div>
    </aside>
  );
}

function formatDiscoveryAudienceMetric(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "공개 지표 확인";
  return normalized.replace(/^(구독자|팔로워)\s+/, "");
}

function isDiscoveredMarketplaceInfluencer(profile: MarketplaceInfluencerProfile) {
  return profile.source === "discovered";
}

function isRegisteredMarketplaceInfluencer(profile: MarketplaceInfluencerProfile) {
  return !isDiscoveredMarketplaceInfluencer(profile);
}

function getMarketplaceInfluencerDisplayPlatform(
  profile: MarketplaceInfluencerProfile,
  platformFilter: PlatformFilter,
) {
  if (platformFilter !== "all") {
    return (
      profile.platforms.find((platform) => platform.platform === platformFilter) ??
      profile.platforms[0]
    );
  }
  return profile.platforms[0];
}

function getMarketplaceInfluencerPrimaryChannelUrl(
  profile: MarketplaceInfluencerProfile,
  platformFilter: PlatformFilter,
) {
  return getMarketplaceInfluencerDisplayPlatform(profile, platformFilter)?.url;
}

function BrandDiscoveryCard({
  brand,
  onContact,
}: {
  key?: string;
  brand: MarketplaceBrandProfile;
  onContact: () => void;
}) {
  return (
    <article className="yl-card flex min-h-[166px] w-full min-w-0 flex-col border p-3">
      <div className="flex items-start gap-3">
        <AvatarBlock
          label={brand.logoLabel}
          src={brand.logoUrl}
          alt={brand.displayName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[17px] font-semibold text-neutral-950">
              {brand.displayName}
            </h2>
            <Store className="h-4 w-4 shrink-0 text-neutral-700" />
          </div>
          <p className="mt-1 truncate text-[12px] font-semibold text-neutral-500">
            {brand.category} · {brand.statusLabel}
          </p>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-1 text-[13px] font-semibold leading-5 text-neutral-800">
        {formatBrandMarketplaceHeadline(brand)}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {brand.preferredPlatforms.map((platform) => (
          <PlatformPill
            key={`${brand.id}-${platform}`}
            platform={platform}
            label={platformLabels[platform]}
          />
        ))}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onContact}
          className="yl-primary-action inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] font-extrabold transition"
        >
          <Send className="h-4 w-4" />
          역제안
        </button>
        <Link
          to={getBrandProfilePath(brand)}
          className="yl-secondary-action inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border text-[13px] font-extrabold transition"
          aria-label={`${brand.displayName} 브랜드 정보 보기`}
          title={`${brand.displayName} 브랜드 정보 보기`}
        >
          정보
        </Link>
      </div>
    </article>
  );
}

function InfluencerContactDialog({
  profile,
  onClose,
}: {
  key?: string;
  profile: MarketplaceInfluencerProfile;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    brandName: "",
    brandIntro: "",
    proposalType: profile.collaborationTypes[0] ?? "sponsored_post",
    proposalSummary: "",
  });
  const loginNext = encodeURIComponent(getInfluencerProfilePath(profile));
  const canSubmit =
    form.brandName.trim().length > 0 &&
    form.brandIntro.trim().length > 0 &&
    form.proposalSummary.trim().length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await apiFetch(
        `/api/marketplace/influencers/${encodeURIComponent(profile.handle)}/proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        },
      );

      if (response.status === 401) {
        setError("광고주 로그인 후 1:1 계약 제안을 저장할 수 있습니다.");
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "1:1 계약 제안을 저장하지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogFrame title={`${profile.displayName}에게 1:1 계약 제안`} onClose={onClose}>
      {submitted ? (
        <ProposalSubmitted
          title="1:1 계약 제안이 저장됐습니다"
          body="브랜드 소개와 계약 조건이 메시지함에 저장됐습니다."
          actionHref="/advertiser/messages"
          actionLabel="메시지함 보기"
          onClose={onClose}
        />
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          <FormField label="브랜드명">
            <input
              required
              value={form.brandName}
              onChange={(event) =>
                setForm((current) => ({ ...current, brandName: event.target.value }))
              }
              placeholder="예: 브레드룸"
              className="marketplace-input"
            />
          </FormField>
          <FormField label="브랜드 소개">
            <textarea
              required
              rows={3}
              value={form.brandIntro}
              onChange={(event) =>
                setForm((current) => ({ ...current, brandIntro: event.target.value }))
              }
              placeholder="브랜드가 어떤 제품과 고객을 다루는지 짧게 적어 주세요."
              className="marketplace-input resize-none"
            />
          </FormField>
          <FormField label="광고 형태">
            <select
              value={form.proposalType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposalType: event.target.value as CampaignProposalType,
                }))
              }
              className="marketplace-input"
            >
              {proposalTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {proposalTypeLabels[type]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="계약 조건 요약">
            <textarea
              required
              rows={3}
              value={form.proposalSummary}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposalSummary: event.target.value,
                }))
              }
              placeholder="업로드 채널, 희망 일정, 콘텐츠 사용 범위, 예산을 함께 적어 주세요."
              className="marketplace-input resize-none"
            />
          </FormField>
          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
              <p className="text-[12px] font-semibold text-rose-700">{error}</p>
              {error.includes("로그인") ? (
                <Link
                  to={`/login/advertiser?next=${loginNext}`}
                  className="mt-2 inline-flex h-9 items-center rounded-md bg-neutral-950 px-3 text-[12px] font-semibold text-white transition hover:bg-neutral-800"
                >
                  광고주 로그인하고 계속
                </Link>
              ) : null}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-[14px] font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "저장 중" : "1:1 계약 제안 저장"}
          </button>
        </form>
      )}
    </DialogFrame>
  );
}

function BrandContactDialog({
  brand,
  onClose,
}: {
  key?: string;
  brand: MarketplaceBrandProfile;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    creatorName: "",
    channelIntro: "",
    proposalType: brand.proposalTypes[0] ?? "sponsored_post",
    proposalSummary: "",
  });
  const loginNext = encodeURIComponent(getBrandProfilePath(brand));
  const canSubmit =
    form.creatorName.trim().length > 0 &&
    form.channelIntro.trim().length > 0 &&
    form.proposalSummary.trim().length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await apiFetch(
        `/api/marketplace/brands/${encodeURIComponent(brand.handle)}/proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        },
      );

      if (response.status === 401) {
        setError("인플루언서 로그인 후 역제안을 저장할 수 있습니다.");
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "역제안을 저장하지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogFrame title={`${brand.displayName}에 제안`} onClose={onClose}>
      {submitted ? (
        <ProposalSubmitted
          title="역제안이 저장됐습니다"
          body="내 채널 소개와 광고 형태가 저장됐습니다. 이후 상태는 메시지함에서 확인할 수 있습니다."
          actionHref="/influencer/messages"
          actionLabel="메시지함 보기"
          onClose={onClose}
        />
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          <FormField label="활동명">
            <input
              required
              value={form.creatorName}
              onChange={(event) =>
                setForm((current) => ({ ...current, creatorName: event.target.value }))
              }
              placeholder="예: my_channel"
              className="marketplace-input"
            />
          </FormField>
          <FormField label="내 채널 소개">
            <textarea
              required
              rows={3}
              value={form.channelIntro}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  channelIntro: event.target.value,
                }))
              }
              placeholder="주요 플랫폼, 타깃, 최근 성과를 짧게 적어 주세요."
              className="marketplace-input resize-none"
            />
          </FormField>
          <FormField label="광고 형태">
            <select
              value={form.proposalType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposalType: event.target.value as CampaignProposalType,
                }))
              }
              className="marketplace-input"
            >
              {proposalTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {proposalTypeLabels[type]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="제안 요약">
            <textarea
              required
              rows={3}
              value={form.proposalSummary}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposalSummary: event.target.value,
                }))
              }
              placeholder="브랜드와 어울리는 콘텐츠 아이디어, 일정, 희망 조건을 적어 주세요."
              className="marketplace-input resize-none"
            />
          </FormField>
          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
              <p className="text-[12px] font-semibold text-rose-700">{error}</p>
              {error.includes("로그인") ? (
                <Link
                  to={`/login/influencer?next=${loginNext}`}
                  className="mt-2 inline-flex h-9 items-center rounded-md bg-neutral-950 px-3 text-[12px] font-semibold text-white transition hover:bg-neutral-800"
                >
                  인플루언서 로그인하고 계속
                </Link>
              ) : null}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-[14px] font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "저장 중" : "역제안 저장"}
          </button>
        </form>
      )}
    </DialogFrame>
  );
}

function DialogFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => panelRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = (
        panelRef.current
          ? Array.from(
              panelRef.current.querySelectorAll(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ),
            )
          : []
      ).filter((element): element is HTMLElement => element instanceof HTMLElement);

      if (focusableElements.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-neutral-950/40 px-0 sm:items-center sm:justify-center sm:px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[8px] border border-neutral-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] outline-none sm:max-w-[560px] sm:rounded-[8px] sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
          <div>
            <p className="text-[12px] font-semibold text-neutral-500">상호 컨택</p>
            <h2 id={titleId} className="mt-1 text-[20px] font-semibold text-neutral-950">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            닫기
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ProposalSubmitted({
  title,
  body,
  actionHref,
  actionLabel,
  onClose,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  onClose: () => void;
}) {
  return (
    <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex gap-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <h3 className="text-[15px] font-semibold text-emerald-950">{title}</h3>
          <p className="mt-2 text-[13px] font-medium leading-6 text-emerald-800">
            {body}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {actionHref && actionLabel ? (
              <Link
                to={actionHref}
                className="inline-flex h-10 items-center rounded-md bg-emerald-900 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-800"
              >
                {actionLabel}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-md border border-emerald-200 bg-white px-4 text-[13px] font-semibold text-emerald-800 transition hover:border-emerald-300"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-[12px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950"
      />
    </div>
  );
}

function DiscoveryControls({
  title,
  count,
  summary,
  open,
  activeCount,
  controlsId,
  toolbar,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  summary: string;
  open: boolean;
  activeCount: number;
  controlsId: string;
  toolbar?: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  const filterButtonClassName =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950 sm:h-8 sm:px-2.5";
  const filterButtonContent = (
    <>
      <SlidersHorizontal className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2} />
      <span>필터</span>
      {activeCount > 0 ? (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-950 px-1 text-[11px] font-extrabold text-white">
          {activeCount}
        </span>
      ) : null}
      <ChevronDown
        className={`h-3.5 w-3.5 text-neutral-500 transition-transform ${
          open ? "rotate-180" : ""
        }`}
        strokeWidth={2}
      />
    </>
  );

  return (
    <section className="relative overflow-visible border-b border-[#d9e0d9] bg-white">
      <div className="flex min-h-12 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2">
        <div className="flex w-full min-w-0 items-start justify-between gap-3 sm:block sm:flex-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-extrabold leading-tight text-neutral-950 sm:text-[13px]">
              {title}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-bold leading-tight text-neutral-500">
              {count.toLocaleString()}건 표시 · {summary}
            </p>
          </div>
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={`${controlsId}-mobile`}
              className={`${filterButtonClassName} sm:hidden`}
            >
              {filterButtonContent}
            </button>
            <ResponsiveFilterPanel
              id={`${controlsId}-mobile`}
              open={open}
              activeCount={activeCount}
              onClose={onToggle}
            >
              <div className="grid gap-4">{children}</div>
            </ResponsiveFilterPanel>
          </div>
        </div>
        {toolbar ? (
          <div className="w-full min-w-0 sm:hidden">{toolbar}</div>
        ) : null}
        <div className="hidden min-w-0 shrink-0 items-center gap-2 sm:flex">
          {toolbar}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={controlsId}
            className={filterButtonClassName}
          >
            {filterButtonContent}
          </button>
        </div>
      </div>
      {open ? (
        <div
          id={controlsId}
          className="hidden border-t border-[#e3e8e3] bg-[#fbfcfa] px-4 py-3 sm:block"
        >
          <div className="grid grid-cols-[minmax(220px,1.1fr)_minmax(160px,0.8fr)_minmax(180px,0.9fr)_minmax(160px,0.8fr)] gap-2.5">
            {children}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type FilterListOption<T extends string> = {
  value: T;
  label: string;
};

type FilterListDisclosureProps = {
  id: string;
  openId: string | null;
  onOpenChange: (value: string | null) => void;
};

function PlatformSelectList({
  id,
  openId,
  onOpenChange,
  value,
  onChange,
}: {
  value: PlatformFilter;
  onChange: (value: PlatformFilter) => void;
} & FilterListDisclosureProps) {
  const options = platformFilterOptions.map((platform) => ({
    value: platform,
    label: platform === "all" ? "전체" : platformLabels[platform],
  }));

  return (
    <FilterListSection
      id={id}
      openId={openId}
      onOpenChange={onOpenChange}
      label="플랫폼"
      summary={value === "all" ? "전체" : platformLabels[value]}
      options={options}
      selectedValues={[value]}
      closeOnSelect
      onSelect={onChange}
    />
  );
}

function CategorySelectList({
  id,
  openId,
  onOpenChange,
  values,
  categories,
  onChange,
}: {
  values: string[];
  categories: string[];
  onChange: (value: string[]) => void;
} & FilterListDisclosureProps) {
  const selected = new Set(values);
  const options = categories.map((category) => ({
    value: category,
    label: getCategoryLabel(category),
  }));

  return (
    <FilterListSection
      id={id}
      openId={openId}
      onOpenChange={onOpenChange}
      label="카테고리"
      summary={
        values.length > 0 ? formatSelectedCategorySummary(values) : "전체"
      }
      options={options}
      selectedValues={values}
      onClear={() => onChange([])}
      onSelect={(category) =>
        onChange(
          selected.has(category)
            ? values.filter((value) => value !== category)
            : [...values, category],
        )
      }
    />
  );
}

function CountrySelectList({
  id,
  openId,
  onOpenChange,
  values,
  onChange,
}: {
  values: MarketplaceCountryCode[];
  onChange: (value: MarketplaceCountryCode[]) => void;
} & FilterListDisclosureProps) {
  const selected = new Set(values);
  const options = marketplaceCountryOptions.map((country) => ({
    value: country,
    label: getMarketplaceCountryLabel(country),
  }));

  return (
    <FilterListSection
      id={id}
      openId={openId}
      onOpenChange={onOpenChange}
      label="국가"
      summary={values.length > 0 ? formatMarketplaceCountries(values) : "전체"}
      options={options}
      selectedValues={values}
      onClear={() => onChange([])}
      onSelect={(country) =>
        onChange(
          selected.has(country)
            ? values.filter((value) => value !== country)
            : [...values, country],
        )
      }
    />
  );
}

function FilterListSection<T extends string>({
  id,
  openId,
  onOpenChange,
  label,
  summary,
  options,
  selectedValues,
  onSelect,
  onClear,
  closeOnSelect = false,
}: {
  id: string;
  openId: string | null;
  onOpenChange: (value: string | null) => void;
  label: string;
  summary: string;
  options: Array<FilterListOption<T>>;
  selectedValues: T[];
  onSelect: (value: T) => void;
  onClear?: () => void;
  closeOnSelect?: boolean;
}) {
  const open = openId === id;
  const selected = new Set<T>(selectedValues);
  const isClearSelected = Boolean(onClear) && selectedValues.length === 0;

  return (
    <section className="min-w-0 overflow-hidden rounded-[8px] border border-[#d7ddd7] bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <button
        type="button"
        onClick={() => onOpenChange(open ? null : id)}
        aria-expanded={open}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-3 px-3 text-left transition hover:bg-[#f6f8f6]"
      >
        <span className="min-w-0">
          <span className="block text-[12px] font-extrabold leading-tight text-neutral-500">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-[13px] font-extrabold leading-tight text-neutral-950">
            {summary}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div className="max-h-48 overflow-y-auto border-t border-[#e4e9e4] bg-[#fbfcfa] p-1.5">
          {onClear ? (
            <FilterListOptionButton
              label="전체"
              selected={isClearSelected}
              onClick={() => {
                onClear();
                if (closeOnSelect) onOpenChange(null);
              }}
            />
          ) : null}
          {options.map((option) => (
            <FilterListOptionButton
              key={String(option.value)}
              label={option.label}
              selected={selected.has(option.value)}
              onClick={() => {
                onSelect(option.value);
                if (closeOnSelect) onOpenChange(null);
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FilterListOptionButton({
  label,
  selected,
  onClick,
}: {
  key?: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex h-9 w-full items-center justify-between gap-3 rounded-[8px] px-2.5 text-left text-[12px] font-extrabold transition ${
        selected
          ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
          : "text-neutral-600 hover:bg-white hover:text-neutral-950"
      }`}
    >
      <span className="truncate">{label}</span>
      {selected ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" strokeWidth={2.4} />
      ) : null}
    </button>
  );
}

function InfluencerSortSelect({
  value,
  onChange,
}: {
  value: InfluencerSortValue;
  onChange: (value: InfluencerSortValue) => void;
}) {
  return (
    <label className="inline-flex h-9 w-full min-w-0 items-center gap-1.5 rounded-[8px] border border-neutral-200 bg-white px-2.5 text-neutral-700 sm:h-8 sm:w-auto sm:shrink-0 sm:px-2">
      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" strokeWidth={2} />
      <span className="sr-only">인플루언서 정렬</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as InfluencerSortValue)}
        aria-label="인플루언서 정렬"
        className="h-8 min-w-0 flex-1 bg-transparent text-[12px] font-extrabold text-neutral-700 outline-none sm:h-7 sm:min-w-[138px] sm:flex-none sm:text-[11px]"
      >
        {influencerSortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function compareInfluencerProfilesBySort(
  a: MarketplaceInfluencerProfile,
  b: MarketplaceInfluencerProfile,
  sort: InfluencerSortValue,
  platformFilter: PlatformFilter = "all",
) {
  if (sort === "name_asc") {
    return compareMarketplaceText(a.displayName, b.displayName);
  }

  const result = compareChannelAudienceValues(
    getChannelAudienceSortValue(
      getProfilePlatformsForSort(a, platformFilter),
    ),
    getChannelAudienceSortValue(
      getProfilePlatformsForSort(b, platformFilter),
    ),
    sort === "audience_asc" ? "asc" : "desc",
  );

  return result || compareMarketplaceText(a.displayName, b.displayName);
}

function getProfilePlatformsForSort(
  profile: MarketplaceInfluencerProfile,
  platformFilter: PlatformFilter,
) {
  if (platformFilter === "all") return profile.platforms;
  const platform = getMarketplaceInfluencerDisplayPlatform(profile, platformFilter);
  return platform ? [platform] : profile.platforms;
}

function compareMarketplaceText(a: string, b: string) {
  return a.localeCompare(b, "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

function cleanMarketplaceCopy(value: string) {
  return value
    .replace(
      "광고주 컨택, 제안 저장, 전자계약 전환 흐름을 검증하기 위한 공개 프로필입니다.",
      "브랜드 컨택과 전자계약 전환에 적합한 공개 프로필입니다.",
    )
    .replace(
      "인플루언서가 입점 브랜드를 둘러보고 역제안할 수 있도록 구성한 광고주 프로필입니다.",
      "인플루언서가 브랜드 정보와 제안 조건을 빠르게 확인할 수 있는 공개 프로필입니다.",
    )
    .replace(
      "캠페인 지원 화면을 실제 인플루언서 계정처럼 검수하기 위한 공개 프로필입니다.",
      "숏폼 콘텐츠와 브랜드 협업 일정을 안정적으로 운영하는 크리에이터입니다.",
    )
    .replace("뷰티와 테크 라이프스타일 제품을 빠르게 검증하는 인플루언서", "뷰티와 테크 라이프스타일 제품을 선명하게 소개하는 인플루언서")
    .replace("빠르게 검증하는", "선명하게 소개하는")
    .replace("신제품 검증", "신제품 리뷰")
    .replace("계약 전환", "계약 협업")
    .replace("제안 저장과 계약 생성 흐름 검증", "제안부터 계약 생성까지 이어진 협업")
    .replace(/\bQA\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const genericBrandDescriptionCopies = new Set([
  "브랜드 컨택과 전자계약 전환에 적합한 공개 프로필입니다.",
  "브랜드 컨택과 전자계약 협업에 적합한 공개 프로필입니다.",
  "인플루언서가 브랜드 정보와 제안 조건을 빠르게 확인할 수 있는 공개 프로필입니다.",
]);

function isGenericBrandMarketplaceCopy(value: string) {
  return (
    Array.from(genericBrandDescriptionCopies).some(
      (copy) => value === copy || value.startsWith(`${copy} `),
    ) || value.includes("공개 프로필에서 바로 보이도록 구성했습니다")
  );
}

const generatedBrandMarketplaceHeadlines: Record<string, string> = {
  nightcare: "밤 루틴과 수면 케어 콘텐츠를 함께 만듭니다",
  brewinglab: "홈카페 레시피와 공동구매 제안을 검토합니다",
  housefit: "집에서 따라하는 운동 루틴 콘텐츠를 찾습니다",
  "obre-beauty": "저자극 스킨케어 사용 후기를 찾습니다",
  "breadroom-family": "신제품 런칭과 숏폼 전환을 함께할 브랜드",
};

function formatBrandMarketplaceHeadline(brand: MarketplaceBrandProfile) {
  const cleaned = cleanMarketplaceCopy(brand.headline);
  const familyKey = getMarketplaceBrandDisplayFamilyKey({
    handle: brand.handle,
    displayName: brand.displayName,
  });
  const generatedHeadline = generatedBrandMarketplaceHeadlines[familyKey];

  if (generatedHeadline && /광고 캠페인 보드/.test(cleaned)) {
    return generatedHeadline;
  }

  if (!isGenericBrandMarketplaceCopy(cleaned)) return cleaned;

  const campaignTitle = brand.activeCampaigns[0]?.title ?? "협업 제안";
  return `${brand.displayName}의 ${campaignTitle}을 함께할 크리에이터를 찾습니다`;
}

function formatBrandMarketplaceDescription(brand: MarketplaceBrandProfile) {
  const cleaned = cleanMarketplaceCopy(brand.description);
  if (!isGenericBrandMarketplaceCopy(cleaned)) return cleaned;

  const campaignTitle = brand.activeCampaigns[0]?.title ?? brand.category;
  const targetLabel = brand.audienceTargets.slice(0, 2).join(", ");
  const platformLabel = brand.preferredPlatforms
    .slice(0, 2)
    .map((platform) => platformLabels[platform])
    .join(", ");
  const audienceClause = targetLabel
    ? `${targetLabel} 고객 반응을 보며`
    : `${brand.category} 맥락에 맞춰`;
  const platformClause = platformLabel ? `${platformLabel} 콘텐츠로` : "콘텐츠로";

  return `${audienceClause} ${campaignTitle} 제안을 검토합니다. ${platformClause} 예산, 일정, 사용 범위를 계약 전 단계에서 확인합니다.`;
}

function dedupeBrandsByDisplayIdentity(brands: MarketplaceBrandProfile[]) {
  const seen = new Set<string>();

  return brands.filter((brand) => {
    const familyKey = getMarketplaceBrandDisplayFamilyKey({
      handle: brand.handle,
      displayName: brand.displayName,
    });
    const key =
      familyKey === "breadroom-family"
        ? familyKey
        : [familyKey, brand.category, brand.statusLabel]
            .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
            .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function PlatformPill({
  platform,
  label,
  value,
}: {
  key?: string;
  platform: InfluencerPlatform;
  label: string;
  value?: string;
}) {
  const hasMetric = Boolean(value);
  const metricValue = hasMetric ? formatDiscoveryAudienceMetric(value) : "";

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 text-[12px] font-extrabold ${
        hasMetric
          ? "h-7 text-neutral-900"
          : "h-6 text-neutral-800"
      }`}
      title={metricValue ? `${label} ${metricValue}` : label}
      aria-label={metricValue ? `${label} ${metricValue}` : label}
    >
      <PlatformBrandMark platform={platform} size={hasMetric ? "xs" : "sm"} />
      {metricValue ? (
        <span className="truncate text-neutral-950">{metricValue}</span>
      ) : null}
    </span>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-neutral-200 bg-white p-4">
      <h2 className="text-[15px] font-semibold text-neutral-950">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex h-7 max-w-full items-center rounded-[8px] border border-neutral-200 bg-neutral-50 px-2.5 text-[11px] font-semibold text-neutral-600"
        >
          <span className="truncate">{item}</span>
        </span>
      ))}
    </div>
  );
}

function AvatarBlock({
  label,
  src,
  alt,
  size = "default",
}: {
  label: string;
  src?: string;
  alt?: string;
  size?: "default" | "large" | "hero";
}) {
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const sizeClass =
    size === "hero"
      ? "h-28 w-28 text-[30px]"
      : size === "large"
        ? "h-20 w-20 text-[24px]"
        : "h-12 w-12 text-[15px]";
  const shouldRenderImage = Boolean(src && failedImageSrc !== src);

  return (
    <span
      className={`yl-profile-mark flex shrink-0 items-center justify-center overflow-hidden font-semibold ${sizeClass}`}
    >
      {shouldRenderImage ? (
        <img
          src={src}
          alt={alt ?? ""}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailedImageSrc(src ?? null)}
        />
      ) : (
        label
      )}
    </span>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[13px] font-semibold text-neutral-800">{label}</span>
      {children}
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="yl-fact-tile px-3 py-3">
      <p className="yl-fact-label truncate">{label}</p>
      <p className="yl-fact-value truncate text-[13px]">
        {value}
      </p>
    </div>
  );
}

function EmptyMarketplaceState({
  title,
  body,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  body: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="flex min-h-[240px] flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-500">
        <MessageSquareText className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold text-neutral-950">{title}</h2>
      <p className="mt-2 max-w-md text-[13px] font-medium leading-6 text-neutral-600">
        {body}
      </p>
      {(primaryHref && primaryLabel) || (secondaryHref && secondaryLabel) ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {primaryHref && primaryLabel ? (
            <Link
              to={primaryHref}
              className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.16)] transition hover:bg-blue-700"
            >
              {primaryLabel}
            </Link>
          ) : null}
          {secondaryHref && secondaryLabel ? (
            <Link
              to={secondaryHref}
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MarketplaceLoadingState({ label }: { label: string }) {
  return (
    <section className="flex min-h-[160px] flex-1 items-center justify-center border-t border-neutral-200 bg-white px-6 py-8 text-center">
      <div>
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-500">
          <Search className="h-4 w-4 animate-pulse" />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-neutral-600">{label}</p>
      </div>
    </section>
  );
}
