import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BadgeCheck,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  FileText,
  Handshake,
  LogOut,
  Mail,
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
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LogoMark } from "../../components/BrandLogo";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  campaignProposalTypeOptions,
  compareChannelAudienceValues,
  formatProposalTypes,
  getBrandProfilePath,
  getChannelAudienceSortValue,
  getInfluencerProfilePath,
  getMarketplaceBrandDisplayFamilyKey,
  findBrandProfileByHandle,
  marketplaceBrands,
  marketplaceInfluencers,
  platformLabels,
  proposalTypeLabels,
  type CampaignProposalType,
  type MarketplaceBrandProfile,
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

const demoInfluencerProfileAliases: Record<string, string> = {};

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

function useMarketplaceInfluencers() {
  const [profiles, setProfiles] =
    useState<MarketplaceInfluencerProfile[]>(marketplaceInfluencers);
  const [isLoading, setIsLoading] = useState(marketplaceInfluencers.length === 0);

  useEffect(() => {
    let active = true;

    void apiFetch("/api/marketplace/influencers", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Marketplace influencers failed");
        return (await response.json()) as MarketplaceInfluencersResponse;
      })
      .then((data) => {
        if (!active) return;
        setProfiles(data.profiles.length > 0 ? data.profiles : marketplaceInfluencers);
      })
      .catch(() => {
        if (active) setProfiles(marketplaceInfluencers);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { profiles, isLoading };
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
        setBrands(data.brands.length > 0 ? data.brands : marketplaceBrands);
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
  const fallbackProfile = useMemo(
    () => {
      if (!handle) return null;
      const normalizedHandle = normalizePublicProfileHandle(handle);
      const sourceHandle =
        demoInfluencerProfileAliases[normalizedHandle] ?? normalizedHandle;
      const profile =
        marketplaceInfluencers.find(
          (item) => normalizePublicProfileHandle(item.handle) === sourceHandle,
        ) ?? null;

      if (!profile) return null;
      return sourceHandle === normalizedHandle
        ? profile
        : { ...profile, id: `${profile.id}-${normalizedHandle}`, handle: normalizedHandle };
    },
    [handle],
  );
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
  const [influencerSort, setInfluencerSort] =
    useState<InfluencerSortValue>("audience_desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] =
    useState<MarketplaceInfluencerProfile | null>(null);
  const { profiles, isLoading } = useMarketplaceInfluencers();
  const { brands } = useMarketplaceBrands();

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles
      .filter((profile) => {
        const matchesPlatform =
          platformFilter === "all" ||
          profile.platforms.some((platform) => platform.platform === platformFilter);
        if (!matchesPlatform) return false;
        if (!hasAnyCategory(profile.categories, categoryFilters)) return false;
        if (!normalizedQuery) return true;

        return [
          profile.displayName,
          profile.handle,
          profile.headline,
          profile.bio,
          profile.location,
          profile.audience,
          ...profile.categories,
          ...profile.brandFit,
          ...profile.recentBrands,
          ...profile.platforms.map((platform) => platform.handle),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => compareInfluencerProfilesBySort(a, b, influencerSort));
  }, [categoryFilters, influencerSort, platformFilter, profiles, query]);
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
  ].filter((label): label is string => Boolean(label));
  const filterSummary =
    activeFilterLabels.length > 0 ? activeFilterLabels.join(" · ") : "전체 조건";

  return (
    <MarketplaceShell
      eyebrow="광고주 탐색"
      title="인플루언서 둘러보기"
      description="프로필과 채널 규모를 보고 바로 컨택합니다."
      backHref="/advertiser/dashboard"
      backLabel="계약 대시보드"
      profileCount={profiles.length}
      brandCount={brands.length}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/advertiser/builder")}
            className="yl-header-action yl-header-action-primary"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">새 계약</span>
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
        onToggle={() => setFiltersOpen((current) => !current)}
      >
        <SearchBox
          value={query}
          onChange={setQuery}
          label="인플루언서 검색"
          placeholder="이름, 핸들, 카테고리, 브랜드 적합도 검색"
        />
        <div className="grid min-w-0 gap-3 lg:min-w-[600px] lg:grid-cols-[minmax(210px,0.42fr)_minmax(280px,0.58fr)]">
          <FilterChipGroup label="플랫폼">
            <PlatformFilterBar value={platformFilter} onChange={setPlatformFilter} />
          </FilterChipGroup>
          <CategoryChecklist
            values={categoryFilters}
            categories={influencerCategoryOptions}
            onChange={setCategoryFilters}
          />
        </div>
      </DiscoveryControls>

      {isLoading ? (
        <MarketplaceLoadingState label="인플루언서 프로필을 불러오는 중입니다" />
      ) : filteredProfiles.length === 0 ? (
        <EmptyMarketplaceState
          title="조건에 맞는 인플루언서가 없습니다"
          body="검색어나 조건을 줄여보세요."
        />
      ) : (
        <section className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:p-4">
          {filteredProfiles.map((profile) => (
            <InfluencerDiscoveryCard
              key={profile.id}
              profile={profile}
              onContact={() => setSelectedProfile(profile)}
            />
          ))}
        </section>
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
      title="입점 브랜드 둘러보기"
      description="브랜드의 모집 채널과 응답 속도를 확인합니다."
      backHref="/influencer/dashboard"
      backLabel="내 계약"
      profileCount={profiles.length}
      brandCount={displayBrands.length}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/influencer/dashboard")}
            className="yl-header-action yl-header-action-primary"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">받은 계약</span>
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
        onToggle={() => setFiltersOpen((current) => !current)}
      >
        <SearchBox
          value={query}
          onChange={setQuery}
          label="브랜드 검색"
          placeholder="브랜드, 카테고리, 캠페인, 타깃 검색"
        />
        <PlatformFilterBar value={platformFilter} onChange={setPlatformFilter} />
      </DiscoveryControls>

      {isLoading ? (
        <MarketplaceLoadingState label="브랜드 프로필을 불러오는 중입니다" />
      ) : filteredBrands.length === 0 ? (
        <EmptyMarketplaceState
          title="조건에 맞는 브랜드가 없습니다"
          body="검색어나 조건을 줄여보세요."
        />
      ) : (
        <section className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:p-4">
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
  const { profileHandle } = useParams<{ profileHandle: string }>();
  const [showContact, setShowContact] = useState(false);
  const { profile, isLoading } = useMarketplaceInfluencerProfile(profileHandle);

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
                src={getMarketplaceInfluencerAvatarUrl(profile)}
                alt={profile.displayName}
                className="h-[200px] w-full rounded-[20px] object-cover shadow-[0_18px_42px_rgba(15,23,42,0.12)] sm:h-[320px] sm:rounded-[22px] lg:h-full lg:min-h-[360px]"
              />
              <span className="absolute bottom-5 left-5 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/80 bg-white/90 px-3 text-[12px] font-extrabold text-blue-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)] backdrop-blur sm:bottom-7 sm:left-7">
                <BadgeCheck className="h-3.5 w-3.5" />
                플랫폼 인증
              </span>
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

                <button
                  type="button"
                  onClick={() => setShowContact(true)}
                  className="hidden h-12 w-[156px] items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-4 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 lg:inline-flex"
                >
                  <Handshake className="h-4 w-4" />
                  제안하기
                </button>
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
                      <button
                        type="button"
                        onClick={() => setShowContact(true)}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-4 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
                      >
                        <Handshake className="h-4 w-4" />
                        제안하기
                      </button>
                    </aside>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </article>
      </section>

      {showContact ? (
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
          <div className="mx-auto grid max-w-[1180px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill icon={<Store className="h-3.5 w-3.5" />} label={brand.statusLabel} />
              <StatusPill icon={<Mail className="h-3.5 w-3.5" />} label={brand.responseTimeLabel} />
            </div>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
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
                  <Link
                    to="/influencer/brands"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-neutral-200 bg-white px-4 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    다른 브랜드 보기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[14px] border border-neutral-200 bg-[#fbfaf7] p-4">
            <p className="text-[12px] font-semibold text-neutral-500">
              제안 시작 정보
            </p>
            <dl className="mt-3 grid gap-2">
              <ProfileFact label="카테고리" value={brand.category} />
              <ProfileFact label="운영 지역" value={brand.location} />
              <ProfileFact label="예산" value={brand.budgetRangeLabel} />
              <ProfileFact
                label="모집 형태"
                value={formatProposalTypes(brand.proposalTypes)}
              />
            </dl>
          </aside>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1180px] gap-3 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <div className="grid gap-4">
          <ProfileSection title="진행 중인 캠페인">
            <div className="grid gap-3 md:grid-cols-2">
              {brand.activeCampaigns.slice(0, 4).map((campaign) => (
                <article
                  key={`${campaign.title}-${campaign.type}`}
                  className="rounded-[10px] border border-neutral-200 bg-white p-3"
                >
                  <p className="text-[12px] font-semibold text-neutral-500">
                    {proposalTypeLabels[campaign.type]}
                  </p>
                  <h2 className="mt-1.5 truncate text-[14px] font-semibold text-neutral-950">
                    {campaign.title}
                  </h2>
                  <p className="mt-2 text-[12px] font-medium text-neutral-600">
                    {campaign.budget}
                  </p>
                </article>
              ))}
            </div>
            {brand.activeCampaigns.length > 4 ? (
              <p className="mt-2 text-[12px] font-semibold text-neutral-500">
                나머지 {brand.activeCampaigns.length - 4}건도 브랜드 조건에 맞춰 검토할 수 있습니다.
              </p>
            ) : null}
          </ProfileSection>

          <ProfileSection title="선호 플랫폼">
            <div className="flex flex-wrap gap-1.5">
              {brand.preferredPlatforms.map((platform) => (
                <PlatformPill
                  key={`${brand.id}-${platform}`}
                  platform={platform}
                  label={platformLabels[platform]}
                />
              ))}
            </div>
          </ProfileSection>
        </div>

        <aside className="grid gap-4">
          <ProfileSection title="잘 맞는 크리에이터">
            <TagList items={brand.fitTags.map(cleanMarketplaceCopy)} />
          </ProfileSection>
          <ProfileSection title="타깃 고객">
            <TagList items={brand.audienceTargets.map(cleanMarketplaceCopy)} />
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

      <section className="shrink-0 border-b border-neutral-200/80 bg-[#f7f6f3]">
        <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
          <p className="text-[13px] font-extrabold text-neutral-500">{eyebrow}</p>
          <div className="mt-1.5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="font-neo-heavy text-[28px] leading-[1.05] text-neutral-950 sm:text-[36px] sm:leading-none">
                {title}
              </h1>
              <p className="mt-2 line-clamp-1 max-w-3xl break-keep text-[13px] font-bold leading-5 text-neutral-600">
                {description}
              </p>
            </div>
            {showMetrics ? (
              <div className="grid grid-cols-3 gap-1.5 rounded-[14px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_26px_rgba(15,23,42,0.035)] sm:w-[360px]">
                <MiniMetric label="공개 프로필" value={(profileCount ?? marketplaceInfluencers.length).toString()} />
                <MiniMetric label="입점 브랜드" value={(brandCount ?? marketplaceBrands.length).toString()} />
                <MiniMetric label="계약 연결" value="요청 가능" />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="yl-panel mx-3 my-3 flex min-h-0 max-w-[1500px] flex-1 flex-col overflow-hidden border sm:mx-5 lg:mx-auto lg:w-full">
        {children}
      </div>
    </main>
  );
}

function InfluencerDiscoveryCard({
  profile,
  onContact,
}: {
  key?: string;
  profile: MarketplaceInfluencerProfile;
  onContact: () => void;
}) {
  return (
    <article className="yl-card flex min-h-[236px] w-full min-w-0 flex-col border p-4">
      <div className="flex items-start gap-3">
        <Link
          to={getInfluencerProfilePath(profile)}
          className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          aria-label={`${profile.displayName} 프로필 보기`}
        >
          <AvatarBlock
            label={profile.avatarLabel}
            src={getMarketplaceInfluencerAvatarUrl(profile)}
            alt={profile.displayName}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={getInfluencerProfilePath(profile)}
              className="min-w-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
              title={`${profile.displayName} 프로필 보기`}
            >
              <h2 className="truncate text-[17px] font-semibold text-neutral-950">
                {profile.displayName}
              </h2>
            </Link>
            <BadgeCheck className="h-4 w-4 shrink-0 text-neutral-700" />
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-5 text-neutral-600">
            {cleanMarketplaceCopy(profile.bio || profile.headline)}
          </p>
        </div>
      </div>

      <p className="mt-3 truncate text-[12px] font-extrabold text-neutral-600">
        {getCategoryLabels(profile.categories, 3).join(" · ")}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {profile.platforms.slice(0, 3).map((platform) => (
          <PlatformPill
            key={`${profile.id}-${platform.platform}`}
            platform={platform.platform}
            label={platformLabels[platform.platform]}
            value={platform.followersLabel}
          />
        ))}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
        <button
          type="button"
          onClick={onContact}
          className="yl-primary-action inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] font-extrabold transition"
        >
          <Send className="h-4 w-4" />
          제안
        </button>
        <Link
          to={getInfluencerProfilePath(profile)}
          className="yl-secondary-action inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border text-[13px] font-extrabold transition"
        >
          프로필
        </Link>
      </div>
    </article>
  );
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
    <article className="yl-card flex min-h-[258px] w-full min-w-0 flex-col border p-3.5">
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

      <p className="mt-3 line-clamp-1 text-[13px] font-semibold leading-5 text-neutral-800">
        {formatBrandMarketplaceHeadline(brand)}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {brand.preferredPlatforms.map((platform) => (
          <PlatformPill
            key={`${brand.id}-${platform}`}
            platform={platform}
            label={platformLabels[platform]}
          />
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-1.5 text-[12px]">
        <ProfileFact label="제안 가능" value={formatProposalTypes(brand.proposalTypes)} />
        <ProfileFact label="응답" value={brand.responseTimeLabel} />
      </dl>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
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
        >
          브랜드
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
        setError("광고주 로그인 후 제안을 저장할 수 있습니다.");
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "제안을 저장하지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogFrame title={`${profile.displayName}에게 컨택`} onClose={onClose}>
      {submitted ? (
        <ProposalSubmitted
          title="제안이 저장됐습니다"
          body="브랜드 소개와 광고 형태가 메시지함에 저장됐습니다."
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
              placeholder="업로드 채널, 희망 일정, 컨텐츠 사용 범위, 예산을 함께 적어 주세요."
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
            {isSubmitting ? "저장 중" : "제안 저장"}
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
              placeholder="브랜드와 어울리는 컨텐츠 아이디어, 일정, 희망 조건을 적어 주세요."
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
  return (
    <section className="border-b border-[#d9e0d9] bg-white">
      <div className="grid min-h-12 gap-2 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:py-2">
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold leading-tight text-neutral-950 sm:truncate sm:text-[13px]">
            {title}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-tight text-neutral-500 sm:truncate">
            {count.toLocaleString()}건 표시 · {summary}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:shrink-0">
          {toolbar}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={controlsId}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950 sm:h-8 sm:px-2.5"
          >
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
          </button>
        </div>
      </div>
      {open ? (
        <div
          id={controlsId}
          className="grid gap-3 border-t border-[#edf1ed] bg-[#fbfaf7] px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function PlatformFilterBar({
  value,
  onChange,
}: {
  value: PlatformFilter;
  onChange: (value: PlatformFilter) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5 lg:no-scrollbar lg:flex-nowrap lg:overflow-x-auto">
      {platformFilterOptions.map((platform) => {
        const active = value === platform;
        const label = platform === "all" ? "전체" : platformLabels[platform];

        return (
          <button
            key={platform}
            type="button"
            onClick={() => onChange(platform)}
            className={`inline-flex h-8 shrink-0 items-center rounded-md border px-2.5 text-[12px] font-semibold transition ${
              active
                ? "border-neutral-950 bg-neutral-950 text-white"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-950"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CategoryChecklist({
  values,
  categories,
  onChange,
}: {
  values: string[];
  categories: string[];
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(values);

  return (
    <fieldset className="min-w-0">
      <legend className="text-[12px] font-extrabold text-neutral-500">
        카테고리
      </legend>
      <div className="mt-1.5 grid max-h-28 min-w-0 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:max-h-24">
      {categories.map((category) => {
        const checked = selected.has(category);
        const label = getCategoryLabel(category);

        return (
          <label
            key={category}
            className="flex min-w-0 items-center gap-2 text-[12px] font-bold text-neutral-700"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? values.filter((value) => value !== category)
                    : [...values, category],
                )
              }
              className="h-4 w-4 shrink-0 accent-neutral-950"
            />
            <span className="truncate">{label}</span>
          </label>
        );
      })}
      </div>
    </fieldset>
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
    <label className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-[8px] border border-neutral-200 bg-white px-2.5 text-neutral-700 sm:h-8 sm:shrink-0 sm:px-2">
      <ArrowUpDown className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2} />
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

function FilterChipGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-[12px] font-extrabold text-neutral-500">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function compareInfluencerProfilesBySort(
  a: MarketplaceInfluencerProfile,
  b: MarketplaceInfluencerProfile,
  sort: InfluencerSortValue,
) {
  if (sort === "name_asc") {
    return compareMarketplaceText(a.displayName, b.displayName);
  }

  const result = compareChannelAudienceValues(
    getChannelAudienceSortValue(a.platforms),
    getChannelAudienceSortValue(b.platforms),
    sort === "audience_asc" ? "asc" : "desc",
  );

  return result || compareMarketplaceText(a.displayName, b.displayName);
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
  const platformClause = platformLabel ? `${platformLabel} 컨텐츠로` : "컨텐츠로";

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

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 text-[12px] font-extrabold ${
        hasMetric
          ? "h-7 text-neutral-900"
          : "h-6 text-neutral-800"
      }`}
      title={value ? `${label} ${value}` : label}
      aria-label={value ? `${label} ${value}` : label}
    >
      <PlatformBrandMark platform={platform} size={hasMetric ? "xs" : "sm"} />
      {value ? <span className="truncate text-neutral-950">{value}</span> : null}
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

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="yl-fact-tile">
      <dt className="yl-fact-label truncate">{label}</dt>
      <dd className="yl-fact-value min-w-0 truncate">
        {value}
      </dd>
    </div>
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
  const sizeClass =
    size === "hero"
      ? "h-28 w-28 text-[30px]"
      : size === "large"
        ? "h-20 w-20 text-[24px]"
        : "h-12 w-12 text-[15px]";

  return (
    <span
      className={`yl-profile-mark flex shrink-0 items-center justify-center overflow-hidden font-semibold ${sizeClass}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ""}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        label
      )}
    </span>
  );
}

function StatusPill({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-neutral-200 bg-neutral-50 px-2.5 text-[12px] font-semibold text-neutral-700">
      {icon}
      {label}
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
