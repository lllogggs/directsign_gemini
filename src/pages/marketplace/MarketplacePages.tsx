import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Handshake,
  Instagram,
  Mail,
  Megaphone,
  MessageSquareText,
  Music2,
  Search,
  Send,
  ShieldCheck,
  Store,
  UserRound,
  Youtube,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  formatProposalTypes,
  getBrandProfilePath,
  getInfluencerProfilePath,
  getPlatformTone,
  marketplaceBrands,
  marketplaceInfluencers,
  platformLabels,
  proposalTypeLabels,
  type CampaignProposalType,
  type MarketplaceBrandProfile,
  type MarketplaceInfluencerProfile,
} from "../../domain/marketplace";
import {
  formatInfluencerPublicProfileUrl,
  getInfluencerPublicProfilePath,
  type InfluencerPublicProfileResponse,
} from "../../domain/publicInfluencerProfile";
import type { InfluencerPlatform } from "../../domain/verification";

type PlatformFilter = "all" | InfluencerPlatform;

const platformFilterOptions: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const proposalTypeOptions: CampaignProposalType[] = [
  "sponsored_post",
  "product_seeding",
  "ppl",
  "group_buy",
  "visit_review",
];

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
  const [isLoading, setIsLoading] = useState(true);

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
  const [isLoading, setIsLoading] = useState(true);

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
  const [profile, setProfile] = useState<MarketplaceInfluencerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(handle));

  useEffect(() => {
    if (!handle) return;

    let active = true;

    void apiFetch(`/api/marketplace/influencers/${encodeURIComponent(handle)}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 404) return { profile: null };
        if (!response.ok) throw new Error("Marketplace influencer failed");
        return (await response.json()) as MarketplaceInfluencerResponse;
      })
      .then((data) => {
        if (active) setProfile(data.profile);
      })
      .catch(() => {
        if (active) {
          setProfile(
            marketplaceInfluencers.find((item) => item.handle === handle) ?? null,
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [handle]);

  return { profile, isLoading };
}

function useMarketplaceBrandProfile(handle: string | undefined) {
  const [brand, setBrand] = useState<MarketplaceBrandProfile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(handle));

  useEffect(() => {
    if (!handle) return;

    let active = true;

    void apiFetch(`/api/marketplace/brands/${encodeURIComponent(handle)}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 404) return { brand: null };
        if (!response.ok) throw new Error("Marketplace brand failed");
        return (await response.json()) as MarketplaceBrandResponse;
      })
      .then((data) => {
        if (active) setBrand(data.brand);
      })
      .catch(() => {
        if (active) {
          setBrand(marketplaceBrands.find((item) => item.handle === handle) ?? null);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [handle]);

  return { brand, isLoading };
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
  const [selectedProfile, setSelectedProfile] =
    useState<MarketplaceInfluencerProfile | null>(null);
  const { profiles, isLoading } = useMarketplaceInfluencers();
  const { brands } = useMarketplaceBrands();

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesPlatform =
        platformFilter === "all" ||
        profile.platforms.some((platform) => platform.platform === platformFilter);
      if (!matchesPlatform) return false;
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
    });
  }, [platformFilter, profiles, query]);

  return (
    <MarketplaceShell
      eyebrow="광고주 탐색"
      title="인플루언서 둘러보기"
      description="계약 작성 전 상대 정보를 확인하고, 필요한 컨택 내용을 계약 작성 흐름으로 이어갑니다."
      backHref="/advertiser/dashboard"
      backLabel="계약 대시보드"
      profileCount={profiles.length}
      brandCount={brands.length}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/advertiser/builder")}
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-blue-600 px-3 text-[13px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)] transition hover:bg-blue-700"
          >
            <FileText className="h-4 w-4" />
            새 계약
          </button>
          <button
            type="button"
            onClick={() => navigate("/advertiser/campaigns")}
            className="hidden h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950 sm:inline-flex"
          >
            <Megaphone className="h-4 w-4" />
            모집글
          </button>
        </div>
      }
    >
      <section className="grid gap-3 border-b border-[#d9e0d9] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <SearchBox
          value={query}
          onChange={setQuery}
          label="인플루언서 검색"
          placeholder="이름, 핸들, 카테고리, 브랜드 적합도 검색"
        />
        <PlatformFilterBar
          value={platformFilter}
          onChange={setPlatformFilter}
        />
      </section>

      <section className="grid gap-3 p-4 lg:grid-cols-3">
        {filteredProfiles.map((profile) => (
          <InfluencerDiscoveryCard
            key={profile.id}
            profile={profile}
            onContact={() => setSelectedProfile(profile)}
          />
        ))}
      </section>

      {isLoading ? (
        <MarketplaceLoadingState label="인플루언서 프로필을 불러오는 중입니다" />
      ) : null}

      {filteredProfiles.length === 0 ? (
        <EmptyMarketplaceState
          title="조건에 맞는 인플루언서가 없습니다"
          body="검색어를 줄이거나 플랫폼 필터를 전체로 바꿔보세요."
        />
      ) : null}

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
  const [selectedBrand, setSelectedBrand] =
    useState<MarketplaceBrandProfile | null>(null);
  const publicProfilePath = useInfluencerPublicProfilePath();
  const { profiles } = useMarketplaceInfluencers();
  const { brands, isLoading } = useMarketplaceBrands();

  const filteredBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return brands.filter((brand) => {
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
  }, [brands, platformFilter, query]);

  return (
    <MarketplaceShell
      eyebrow="인플루언서 탐색"
      title="입점 브랜드 둘러보기"
      description="받은 계약을 우선 확인하고, 필요할 때 브랜드 정보와 컨택 내용을 계약 검토 전 단계로 정리합니다."
      backHref="/influencer/dashboard"
      backLabel="계약 대시보드"
      profileCount={profiles.length}
      brandCount={brands.length}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/influencer/dashboard")}
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-blue-600 px-3 text-[13px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)] transition hover:bg-blue-700"
          >
            <FileText className="h-4 w-4" />
            받은 계약
          </button>
          <button
            type="button"
            onClick={() => navigate("/influencer/campaigns")}
            className="hidden h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950 sm:inline-flex"
          >
            <Megaphone className="h-4 w-4" />
            캠페인 보기
          </button>
          <button
            type="button"
            onClick={() => navigate(publicProfilePath ?? "/influencer/dashboard")}
            className="hidden h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950 sm:inline-flex"
          >
            <UserRound className="h-4 w-4" />
            {publicProfilePath ? "내 공개 프로필" : "프로필 설정"}
          </button>
        </div>
      }
    >
      <section className="grid gap-3 border-b border-[#d9e0d9] bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <SearchBox
          value={query}
          onChange={setQuery}
          label="브랜드 검색"
          placeholder="브랜드, 카테고리, 캠페인, 타깃 검색"
        />
        <PlatformFilterBar
          value={platformFilter}
          onChange={setPlatformFilter}
        />
      </section>

      <section className="grid gap-3 p-4 lg:grid-cols-3">
        {filteredBrands.map((brand) => (
          <BrandDiscoveryCard
            key={brand.id}
            brand={brand}
            onContact={() => setSelectedBrand(brand)}
          />
        ))}
      </section>

      {isLoading ? (
        <MarketplaceLoadingState label="브랜드 프로필을 불러오는 중입니다" />
      ) : null}

      {filteredBrands.length === 0 ? (
        <EmptyMarketplaceState
          title="조건에 맞는 브랜드가 없습니다"
          body="검색어를 줄이거나 플랫폼 필터를 전체로 바꿔보세요."
        />
      ) : null}

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
      >
        <EmptyMarketplaceState
          title="공개 프로필 없음"
          body="주소를 다시 확인하거나 인플루언서에게 최신 프로필 링크를 요청해 주세요."
        />
      </MarketplaceShell>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="border-b border-[#d9e0d9] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-[18px] font-semibold">{PRODUCT_NAME}</span>
          </Link>
          <Link
            to="/intro/advertiser"
            className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            광고주 시작
          </Link>
        </div>
      </header>

      <section className="border-b border-[#d9e0d9] bg-white">
        <div className="mx-auto grid max-w-[1180px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill icon={<BadgeCheck className="h-3.5 w-3.5" />} label={profile.verifiedLabel} />
              <StatusPill icon={<Mail className="h-3.5 w-3.5" />} label={profile.responseTimeLabel} />
            </div>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
              <AvatarBlock label={profile.avatarLabel} size="large" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-neutral-500">
                  {formatInfluencerPublicProfileUrl(profile.handle)}
                </p>
                <h1 className="mt-2 text-[34px] font-semibold leading-tight text-neutral-950 sm:text-[44px]">
                  {profile.displayName}
                </h1>
                <p className="mt-3 max-w-2xl break-keep text-[16px] font-medium leading-7 text-neutral-600">
                  {profile.headline}
                </p>
                <p className="mt-4 max-w-3xl break-keep text-[14px] leading-6 text-neutral-600">
                  {profile.bio}
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowContact(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-[14px] font-semibold text-white transition hover:bg-neutral-800"
                  >
                    <Handshake className="h-4 w-4" />
                    컨택 제안하기
                  </button>
                  <Link
                    to="/advertiser/discover"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-[14px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    다른 인플루언서 보기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[8px] border border-[#d9e0d9] bg-[#f8faf7] p-4">
            <p className="text-[12px] font-semibold text-neutral-500">
              컨택 시작 정보
            </p>
            <dl className="mt-3 grid gap-2">
              <ProfileFact label="활동 지역" value={profile.location} />
              <ProfileFact label="주요 타깃" value={profile.audience} />
              <ProfileFact label="협업 단가" value={profile.startingPriceLabel} />
              <ProfileFact
                label="가능 형태"
                value={formatProposalTypes(profile.collaborationTypes)}
              />
            </dl>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1180px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <div className="grid gap-4">
          <ProfileSection title="활동 채널">
            <div className="grid gap-3 md:grid-cols-2">
              {profile.platforms.map((platform) => (
                <a
                  key={`${platform.platform}-${platform.handle}`}
                  href={platform.url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid gap-3 rounded-[8px] border border-neutral-200 bg-white p-4 transition hover:border-neutral-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <PlatformPill platform={platform.platform} label={platform.label} />
                    <ExternalLink className="h-4 w-4 shrink-0 text-neutral-400" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-neutral-950">
                      {platform.handle}
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-neutral-500">
                      {platform.followersLabel} · {platform.performanceLabel}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </ProfileSection>

          <ProfileSection title="최근 협업">
            <div className="grid gap-3 md:grid-cols-3">
              {profile.portfolio.map((item) => (
                <article
                  key={`${item.brand}-${item.title}`}
                  className="rounded-[8px] border border-neutral-200 bg-white p-4"
                >
                  <p className="text-[12px] font-semibold text-neutral-500">
                    {item.brand}
                  </p>
                  <h2 className="mt-2 text-[15px] font-semibold text-neutral-950">
                    {item.title}
                  </h2>
                  <p className="mt-3 text-[13px] font-medium text-neutral-600">
                    {item.result}
                  </p>
                </article>
              ))}
            </div>
          </ProfileSection>
        </div>

        <aside className="grid gap-4">
          <ProfileSection title="브랜드 적합도">
            <TagList items={profile.brandFit} />
          </ProfileSection>
          <ProfileSection title="제안 전에 포함할 내용">
            <ul className="grid gap-2">
              {profile.proposalHints.map((hint) => (
                <li
                  key={hint}
                  className="flex gap-2 text-[13px] font-medium leading-5 text-neutral-600"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700" />
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          </ProfileSection>
        </aside>
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
      >
        <EmptyMarketplaceState
          title="공개 브랜드 없음"
          body="주소를 다시 확인하거나 브랜드에게 최신 프로필 링크를 요청해 주세요."
        />
      </MarketplaceShell>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="border-b border-[#d9e0d9] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-[18px] font-semibold">{PRODUCT_NAME}</span>
          </Link>
          <Link
            to="/intro/influencer"
            className="inline-flex h-10 items-center rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            인플루언서 시작
          </Link>
        </div>
      </header>

      <section className="border-b border-[#d9e0d9] bg-white">
        <div className="mx-auto grid max-w-[1180px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill icon={<Store className="h-3.5 w-3.5" />} label={brand.statusLabel} />
              <StatusPill icon={<Mail className="h-3.5 w-3.5" />} label={brand.responseTimeLabel} />
            </div>
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
              <AvatarBlock label={brand.logoLabel} size="large" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-neutral-500">
                  yeollock.me/brands/{brand.handle}
                </p>
                <h1 className="mt-2 text-[34px] font-semibold leading-tight text-neutral-950 sm:text-[44px]">
                  {brand.displayName}
                </h1>
                <p className="mt-3 max-w-2xl break-keep text-[16px] font-medium leading-7 text-neutral-600">
                  {brand.headline}
                </p>
                <p className="mt-4 max-w-3xl break-keep text-[14px] leading-6 text-neutral-600">
                  {brand.description}
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowContact(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-[14px] font-semibold text-white transition hover:bg-neutral-800"
                  >
                    <Handshake className="h-4 w-4" />
                    역제안하기
                  </button>
                  <Link
                    to="/influencer/brands"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-[14px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    다른 브랜드 보기
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[8px] border border-[#d9e0d9] bg-[#f8faf7] p-4">
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

      <section className="mx-auto grid max-w-[1180px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <div className="grid gap-4">
          <ProfileSection title="진행 중인 캠페인">
            <div className="grid gap-3 md:grid-cols-2">
              {brand.activeCampaigns.map((campaign) => (
                <article
                  key={`${campaign.title}-${campaign.type}`}
                  className="rounded-[8px] border border-neutral-200 bg-white p-4"
                >
                  <p className="text-[12px] font-semibold text-neutral-500">
                    {proposalTypeLabels[campaign.type]}
                  </p>
                  <h2 className="mt-2 text-[15px] font-semibold text-neutral-950">
                    {campaign.title}
                  </h2>
                  <p className="mt-3 text-[13px] font-medium text-neutral-600">
                    {campaign.budget}
                  </p>
                </article>
              ))}
            </div>
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
            <TagList items={brand.fitTags} />
          </ProfileSection>
          <ProfileSection title="타깃 고객">
            <TagList items={brand.audienceTargets} />
          </ProfileSection>
        </aside>
      </section>

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
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-neo-heavy hidden text-[19px] leading-none sm:inline">{PRODUCT_NAME}</span>
          </Link>
          <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
            <Link
              to={backHref}
              className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            {actions}
          </div>
        </div>
      </header>

      <section className="border-b border-neutral-200/80 bg-[#f7f6f3]">
        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-[13px] font-extrabold text-neutral-500">{eyebrow}</p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="font-neo-heavy text-[34px] leading-[1.05] text-neutral-950 sm:text-[48px] sm:leading-none">
                {title}
              </h1>
              <p className="mt-4 max-w-3xl break-keep text-[14px] font-bold leading-6 text-neutral-600">
                {description}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-neutral-200 bg-white p-2 shadow-[0_12px_34px_rgba(15,23,42,0.04)] sm:w-[420px]">
              <MiniMetric label="공개 프로필" value={(profileCount ?? marketplaceInfluencers.length).toString()} />
              <MiniMetric label="입점 브랜드" value={(brandCount ?? marketplaceBrands.length).toString()} />
              <MiniMetric label="계약 전환" value="검토 후" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-4 my-5 max-w-[1320px] overflow-hidden rounded-[18px] border border-neutral-200 bg-[#fdfdfb] shadow-[0_22px_60px_rgba(23,26,23,0.06)] sm:mx-6 lg:mx-auto">
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
    <article className="flex min-h-[360px] w-full min-w-0 flex-col rounded-[18px] border border-neutral-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.035)]">
      <div className="flex items-start gap-3">
        <AvatarBlock label={profile.avatarLabel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[17px] font-semibold text-neutral-950">
              {profile.displayName}
            </h2>
            <BadgeCheck className="h-4 w-4 shrink-0 text-neutral-700" />
          </div>
          <p className="mt-1 truncate text-[12px] font-semibold text-neutral-500">
            {formatInfluencerPublicProfileUrl(profile.handle)}
          </p>
        </div>
        <button
          type="button"
          onClick={onContact}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-neutral-950 px-3 text-[12px] font-extrabold text-white transition hover:bg-neutral-800"
        >
          <Send className="h-3.5 w-3.5" />
          제안
        </button>
      </div>

      <p className="mt-4 line-clamp-2 text-[14px] font-semibold leading-6 text-neutral-800">
        {profile.headline}
      </p>
      <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-neutral-600">
        {profile.audience}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {profile.platforms.map((platform) => (
          <PlatformPill
            key={`${profile.id}-${platform.platform}`}
            platform={platform.platform}
            label={`${platformLabels[platform.platform]} ${platform.followersLabel}`}
          />
        ))}
      </div>

      <dl className="mt-4 grid gap-2 text-[12px]">
        <ProfileFact label="가능 형태" value={formatProposalTypes(profile.collaborationTypes)} />
        <ProfileFact label="예상 단가" value={profile.startingPriceLabel} />
        <ProfileFact label="응답" value={profile.responseTimeLabel} />
      </dl>

      <div className="mt-4">
        <TagList items={profile.brandFit.slice(0, 3)} />
      </div>

      <div className="mt-auto pt-5">
        <Link
          to={getInfluencerProfilePath(profile)}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-neutral-200 bg-white text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          프로필 보기
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
    <article className="flex min-h-[360px] w-full min-w-0 flex-col rounded-[18px] border border-neutral-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.035)]">
      <div className="flex items-start gap-3">
        <AvatarBlock label={brand.logoLabel} />
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
        <button
          type="button"
          onClick={onContact}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-neutral-950 px-3 text-[12px] font-extrabold text-white transition hover:bg-neutral-800"
        >
          <Send className="h-3.5 w-3.5" />
          제안
        </button>
      </div>

      <p className="mt-4 line-clamp-2 text-[14px] font-semibold leading-6 text-neutral-800">
        {brand.headline}
      </p>
      <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-neutral-600">
        {brand.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {brand.preferredPlatforms.map((platform) => (
          <PlatformPill
            key={`${brand.id}-${platform}`}
            platform={platform}
            label={platformLabels[platform]}
          />
        ))}
      </div>

      <dl className="mt-4 grid gap-2 text-[12px]">
        <ProfileFact label="제안 가능" value={formatProposalTypes(brand.proposalTypes)} />
        <ProfileFact label="예산" value={brand.budgetRangeLabel} />
        <ProfileFact label="응답" value={brand.responseTimeLabel} />
      </dl>

      <div className="mt-4">
        <TagList items={brand.fitTags.slice(0, 3)} />
      </div>

      <div className="mt-auto grid gap-2 pt-5">
        <Link
          to={getBrandProfilePath(brand)}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-neutral-200 bg-white text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          브랜드 보기
        </Link>
        <p className="text-[11px] font-semibold text-neutral-500">
          제안 전 캠페인 조건은 계약 단계에서 다시 확인됩니다.
        </p>
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
          body="브랜드 소개와 광고 형태가 서버에 저장됐습니다. 이후 메시지함과 계약 작성 흐름으로 이어 붙일 수 있습니다."
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
              placeholder="업로드 채널, 희망 일정, 콘텐츠 사용 범위, 예산을 함께 적어 주세요."
              className="marketplace-input resize-none"
            />
          </FormField>
          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-[14px] font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
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
          body="내 채널 소개와 광고 형태가 서버에 저장됐습니다. 이후 메시지함과 계약 작성 흐름으로 이어 붙일 수 있습니다."
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
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-[14px] font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
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
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-neutral-950/40 px-0 sm:items-center sm:justify-center sm:px-4">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-[8px] border border-neutral-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:max-w-[560px] sm:rounded-[8px] sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
          <div>
            <p className="text-[12px] font-semibold text-neutral-500">상호 컨택</p>
            <h2 className="mt-1 text-[20px] font-semibold text-neutral-950">
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
        className="h-11 w-full rounded-md border border-neutral-200 bg-[#f8faf7] pl-9 pr-3 text-[13px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white"
      />
    </div>
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
    <div className="flex flex-wrap gap-1.5 lg:no-scrollbar lg:max-w-[560px] lg:flex-nowrap lg:overflow-x-auto lg:pb-1">
      {platformFilterOptions.map((platform) => {
        const active = value === platform;
        const label = platform === "all" ? "전체" : platformLabels[platform];

        return (
          <button
            key={platform}
            type="button"
            onClick={() => onChange(platform)}
            className={`inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-[12px] font-semibold transition ${
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

function PlatformPill({
  platform,
  label,
}: {
  key?: string;
  platform: InfluencerPlatform;
  label: string;
}) {
  return (
    <span
      className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold ${getPlatformTone(platform)}`}
    >
      {getPlatformIcon(platform)}
      <span className="truncate">{label}</span>
    </span>
  );
}

function getPlatformIcon(platform: InfluencerPlatform) {
  if (platform === "instagram") return <Instagram className="h-3.5 w-3.5" />;
  if (platform === "youtube") return <Youtube className="h-3.5 w-3.5" />;
  if (platform === "tiktok") return <Music2 className="h-3.5 w-3.5" />;
  if (platform === "naver_blog") return <BookOpen className="h-3.5 w-3.5" />;
  return <Globe2 className="h-3.5 w-3.5" />;
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
    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2">
      <dt className="text-[12px] font-semibold text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-[12px] font-semibold text-neutral-800">
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
          className="inline-flex h-7 max-w-full items-center rounded-md border border-neutral-200 bg-neutral-50 px-2.5 text-[11px] font-semibold text-neutral-600"
        >
          <span className="truncate">{item}</span>
        </span>
      ))}
    </div>
  );
}

function AvatarBlock({
  label,
  size = "default",
}: {
  label: string;
  size?: "default" | "large";
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[8px] bg-neutral-950 font-semibold text-white ${
        size === "large" ? "h-20 w-20 text-[24px]" : "h-12 w-12 text-[15px]"
      }`}
    >
      {label}
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
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 text-[12px] font-semibold text-neutral-700">
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
    <div className="rounded-[14px] bg-[#f8f7f4] px-3 py-3">
      <p className="text-[11px] font-extrabold text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-[13px] font-extrabold text-neutral-950">
        {value}
      </p>
    </div>
  );
}

function EmptyMarketplaceState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="flex min-h-[240px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-500">
        <MessageSquareText className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold text-neutral-950">{title}</h2>
      <p className="mt-2 max-w-md text-[13px] font-medium leading-6 text-neutral-600">
        {body}
      </p>
    </section>
  );
}

function MarketplaceLoadingState({ label }: { label: string }) {
  return (
    <section className="flex min-h-[160px] items-center justify-center border-t border-neutral-200 bg-white px-6 py-8 text-center">
      <div>
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-500">
          <Search className="h-4 w-4 animate-pulse" />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-neutral-600">{label}</p>
      </div>
    </section>
  );
}
