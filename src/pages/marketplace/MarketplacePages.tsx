import {
  ArrowLeft,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  FileText,
  Handshake,
  LogIn,
  LogOut,
  Megaphone,
  MessageSquareText,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  Store,
  UserRound,
} from "lucide-react";
import {
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router";
import { LogoMark } from "../../components/BrandLogo";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { FilterSelectControl } from "../../components/FilterSelectControl";
import { ResponsiveFilterPanel } from "../../components/ResponsiveFilterPanel";
import { AdvertiserAccountSettingsMenu } from "../../components/AdvertiserAccountSettingsMenu";
import { InfluencerAccountSettingsMenu } from "../../components/InfluencerAccountSettingsMenu";
import { HeaderMessageCenterButton } from "../../components/HeaderMessageCenterButton";
import { HeaderNotificationCenterButton } from "../../components/HeaderNotificationCenterButton";
import {
  ProductSpotlightTour,
  type ProductSpotlightTourStep,
} from "../../components/ProductSpotlightTour";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  getMarketplaceCreatorCategoryLabel,
  MARKETPLACE_CREATOR_CATEGORY_OPTIONS,
  normalizeMarketplaceCreatorCategory,
} from "../../domain/influencerDiscoveryQuality.js";
import { normalizeNaverBlogRecentPosts } from "../../domain/naverBlogPosts.js";
import {
  canOpenInfluencerPublicProfile,
  formatCampaignApplicantLimit,
  getBrandProfilePath,
  getCampaignProposalTypeDisplayLabel,
  getInfluencerProfilePath,
  getMarketplaceBrandDisplayFamilyKey,
  formatMarketplaceCountries,
  getMarketplaceCountryLabel,
  marketplaceCountryOptions,
  oneToOneProposalTypeOptions,
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
import {
  isVerificationRequiredError,
  type VerificationRequiredApiError,
} from "../../domain/verificationPolicy";
import {
  clearAdvertiserSessionCache,
  getAdvertiserSessionCache,
} from "../../domain/advertiserSessionCache";
import { clearAdvertiserDashboardBootstrapPreload } from "../../domain/advertiserDashboardPreload";
import { clearInfluencerDashboardPreload } from "../../domain/influencerDashboardPreload";
import { finishFastLoginTransition } from "../../domain/fastLoginTransition";
import { clearVerificationSummaryCache } from "../../hooks/useVerificationSummary";
import {
  clearMarketplaceMessageSummaryCache,
  useMarketplaceMessageSummary,
} from "../../hooks/useMarketplaceMessageSummary";
import { clearNotificationCenterCache } from "../../hooks/useNotificationCenter";

type PlatformFilter = "all" | InfluencerPlatform;
type InfluencerSortValue = "audience_desc" | "audience_asc" | "name_asc";
type ContactDraftRole = "advertiser" | "influencer";
type MarketplaceShellMode = "checking" | "authenticated" | "anonymous";
type MarketplaceShellRole = ContactDraftRole;

const ADVERTISER_DISCOVERY_TOUR_STEPS = [
  {
    id: "overview",
    target: "advertiser-discovery-overview",
    title: "조건에 맞는 인플루언서 찾기",
    description:
      "검색과 정렬을 함께 사용해 탐색 목록에서 원하는 인플루언서를 빠르게 찾습니다.",
    padding: 6,
  },
  {
    id: "interest",
    target: "advertiser-discovery-interest",
    title: "관심 인플루언서 모아보기",
    description:
      "목록이나 상세의 별표로 관심을 표시하면, 관심 탭에서 관심 표시한 인플루언서만 다시 볼 수 있습니다.",
  },
  {
    id: "filters",
    target: "advertiser-discovery-filters",
    title: "플랫폼별로 좁혀보기",
    description:
      "필터를 열어 플랫폼·카테고리·크리에이터 국가를 조합할 수 있습니다. 모든 조건은 전체 결과에 적용됩니다.",
  },
] satisfies readonly ProductSpotlightTourStep[];

type PublicProfileHeaderConfig = {
  authenticatedRole?: MarketplaceShellRole;
  authenticatedActions?: ReactNode;
  authenticatedHref: string;
  authenticatedLabel: string;
  anonymousHref: string;
  anonymousLabel: string;
  forceHref?: string;
  forceLabel?: string;
  showAuthenticatedBackIcon?: boolean;
};
type MarketplaceSessionStatusResponse = {
  authenticated?: boolean;
};
type InfluencerContactForm = {
  brandName: string;
  brandIntro: string;
  proposalType: CampaignProposalType;
  proposalSummary: string;
};
type BrandContactForm = {
  creatorName: string;
  channelIntro: string;
  proposalType: CampaignProposalType;
  proposalSummary: string;
};

const CONTACT_DRAFT_TTL_MS = 30 * 60 * 1000;
const CONTACT_DRAFT_STORAGE_PREFIX = "yeollock:contact-draft:v1";

const normalizeContactDraftTarget = (value: string) =>
  value.trim().toLowerCase();

const getContactDraftStorageKey = (
  role: ContactDraftRole,
  targetHandle: string,
) =>
  `${CONTACT_DRAFT_STORAGE_PREFIX}:${role}:${normalizeContactDraftTarget(
    targetHandle,
  )}`;

const clearContactDraft = (
  role: ContactDraftRole,
  targetHandle: string,
) => {
  try {
    window.sessionStorage.removeItem(
      getContactDraftStorageKey(role, targetHandle),
    );
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

const saveContactDraft = <T extends Record<string, string>>({
  role,
  targetHandle,
  form,
}: {
  role: ContactDraftRole;
  targetHandle: string;
  form: T;
}) => {
  const normalizedTarget = normalizeContactDraftTarget(targetHandle);
  if (!normalizedTarget) return;

  try {
    window.sessionStorage.setItem(
      getContactDraftStorageKey(role, normalizedTarget),
      JSON.stringify({
        role,
        target: { handle: normalizedTarget },
        expiresAt: Date.now() + CONTACT_DRAFT_TTL_MS,
        form,
      }),
    );
  } catch {
    // Draft persistence must never block the contact flow.
  }
};

const readContactDraft = <T,>({
  role,
  targetHandle,
  parseForm,
}: {
  role: ContactDraftRole;
  targetHandle: string;
  parseForm: (value: unknown) => T | undefined;
}) => {
  const normalizedTarget = normalizeContactDraftTarget(targetHandle);
  if (!normalizedTarget) return undefined;

  const storageKey = getContactDraftStorageKey(role, normalizedTarget);
  try {
    const rawDraft = window.sessionStorage.getItem(storageKey);
    if (!rawDraft) return undefined;

    const draft = JSON.parse(rawDraft) as {
      role?: unknown;
      target?: { handle?: unknown };
      expiresAt?: unknown;
      form?: unknown;
    };
    const expiresAt =
      typeof draft.expiresAt === "number" ? draft.expiresAt : Number.NaN;
    const storedTarget =
      typeof draft.target?.handle === "string"
        ? normalizeContactDraftTarget(draft.target.handle)
        : "";
    if (
      draft.role !== role ||
      storedTarget !== normalizedTarget ||
      !Number.isFinite(expiresAt) ||
      Date.now() >= expiresAt
    ) {
      window.sessionStorage.removeItem(storageKey);
      return undefined;
    }

    const parsedForm = parseForm(draft.form);
    if (!parsedForm) {
      window.sessionStorage.removeItem(storageKey);
      return undefined;
    }
    return parsedForm;
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
    return undefined;
  }
};

const readDraftText = (
  value: unknown,
  maxLength: number,
): string | undefined =>
  typeof value === "string" ? value.slice(0, maxLength) : undefined;

const isOneToOneProposalType = (
  value: unknown,
): value is CampaignProposalType =>
  typeof value === "string" &&
  oneToOneProposalTypeOptions.includes(value as CampaignProposalType);

const parseInfluencerContactDraft = (
  value: unknown,
): InfluencerContactForm | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const form = value as Record<string, unknown>;
  const brandName = readDraftText(form.brandName, 80);
  const brandIntro = readDraftText(form.brandIntro, 1000);
  const proposalSummary = readDraftText(form.proposalSummary, 1500);
  if (
    brandName === undefined ||
    brandIntro === undefined ||
    proposalSummary === undefined ||
    !isOneToOneProposalType(form.proposalType)
  ) {
    return undefined;
  }

  return {
    brandName,
    brandIntro,
    proposalType: form.proposalType,
    proposalSummary,
  };
};

const parseBrandContactDraft = (
  value: unknown,
): BrandContactForm | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const form = value as Record<string, unknown>;
  const creatorName = readDraftText(form.creatorName, 80);
  const channelIntro = readDraftText(form.channelIntro, 1000);
  const proposalSummary = readDraftText(form.proposalSummary, 1500);
  if (
    creatorName === undefined ||
    channelIntro === undefined ||
    proposalSummary === undefined ||
    !isOneToOneProposalType(form.proposalType)
  ) {
    return undefined;
  }

  return {
    creatorName,
    channelIntro,
    proposalType: form.proposalType,
    proposalSummary,
  };
};

const platformFilterOptions: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const influencerCategoryOptions = MARKETPLACE_CREATOR_CATEGORY_OPTIONS.map(
  (option) => option.value,
);

const proposalTypeOptions = oneToOneProposalTypeOptions;
const influencerSortOptions: Array<{ label: string; value: InfluencerSortValue }> = [
  { label: "구독자·팔로워 많은순", value: "audience_desc" },
  { label: "구독자·팔로워 적은순", value: "audience_asc" },
  { label: "이름순", value: "name_asc" },
];

function getCategoryFilterKey(category: string) {
  return normalizeMarketplaceCreatorCategory(category) || "content";
}

function getCategoryLabel(category: string) {
  return getMarketplaceCreatorCategoryLabel(getCategoryFilterKey(category));
}

function getCategoryLabels(categories: string[], limit: number) {
  const labelsByKey = new Map<string, string>();
  for (const category of categories) {
    const key = getCategoryFilterKey(category);
    if (!labelsByKey.has(key)) labelsByKey.set(key, getCategoryLabel(category));
  }
  return Array.from(labelsByKey.values()).slice(0, limit);
}

type MarketplaceInfluencersResponse = {
  profiles: MarketplaceInfluencerProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type MarketplaceInfluencerResponse = {
  profile: MarketplaceInfluencerProfile;
};

type AdvertiserSavedInfluencersResponse = {
  handles?: string[];
};

type AdvertiserSavedInfluencerMutationResponse = {
  handle?: string;
  requested_handle?: string;
  saved?: boolean;
};

type MarketplaceBrandsResponse = {
  brands: MarketplaceBrandProfile[];
};

type MarketplaceBrandResponse = {
  brand: MarketplaceBrandProfile;
};

const marketplaceInfluencerPageSize = 100;
const emptyInfluencerCategoryFilters: string[] = [];
const emptyInfluencerCountryFilters: MarketplaceCountryCode[] = [];

function useMarketplaceInfluencers(
  platformFilter: PlatformFilter,
  page: number,
  influencerSort: InfluencerSortValue,
  savedOnly = false,
  query = "",
  categoryFilters: string[] = emptyInfluencerCategoryFilters,
  countryFilters: MarketplaceCountryCode[] = emptyInfluencerCountryFilters,
  savedHandlesRevision = 0,
) {
  const [profiles, setProfiles] =
    useState<MarketplaceInfluencerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [total, setTotal] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [requestRevision, setRequestRevision] = useState(0);
  const mountedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const collectionKey = useMemo(
    () =>
      JSON.stringify({
        categoryFilters,
        countryFilters,
        platformFilter,
        query: query.trim(),
        savedHandlesRevision: savedOnly ? savedHandlesRevision : 0,
        savedOnly,
        sort: influencerSort,
      }),
    [
      categoryFilters,
      countryFilters,
      platformFilter,
      query,
      savedHandlesRevision,
      savedOnly,
      influencerSort,
    ],
  );
  const previousCollectionKeyRef = useRef(collectionKey);

  const retry = useCallback(() => {
    setRequestRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const collectionChanged = previousCollectionKeyRef.current !== collectionKey;
    previousCollectionKeyRef.current = collectionKey;

    const loadPage = async () => {
      await Promise.resolve();
      if (
        !mountedRef.current ||
        requestGeneration !== requestGenerationRef.current
      ) {
        return;
      }
      if (collectionChanged) {
        setProfiles([]);
        setTotal(null);
        setTotalPages(null);
        setLoadedPage(null);
      }
      setError(undefined);
      setIsLoading(true);

      try {
        const searchParams = new URLSearchParams();
        searchParams.set("page", String(page));
        searchParams.set("sort", influencerSort);
        if (platformFilter !== "all") {
          searchParams.set("platform", platformFilter);
        }
        if (savedOnly) {
          searchParams.set("saved_only", "true");
          searchParams.set("saved_revision", String(savedHandlesRevision));
        }
        if (query.trim()) searchParams.set("search", query.trim());
        categoryFilters.forEach((category) =>
          searchParams.append("category", category),
        );
        countryFilters.forEach((country) =>
          searchParams.append("country", country),
        );
        const response = await apiFetch(
          `/api/marketplace/influencers?${searchParams.toString()}`,
          { headers: { Accept: "application/json" } },
        );
        if (!response.ok) throw new Error("Marketplace influencers failed");
        const data = (await response.json()) as MarketplaceInfluencersResponse;
        if (
          !mountedRef.current ||
          requestGeneration !== requestGenerationRef.current
        ) {
          return;
        }
        if (
          !Array.isArray(data.profiles) ||
          data.profiles.length > marketplaceInfluencerPageSize ||
          !Number.isSafeInteger(data.page) ||
          data.page < 1 ||
          data.pageSize !== marketplaceInfluencerPageSize ||
          !Number.isSafeInteger(data.totalPages)
        ) {
          throw new Error("Marketplace influencers response was invalid");
        }
        if (
          !Number.isSafeInteger(data.total) ||
          data.total < 0 ||
          data.totalPages !==
            Math.ceil(data.total / marketplaceInfluencerPageSize)
        ) {
          throw new Error("Marketplace influencer total was invalid");
        }

        setProfiles(data.profiles);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setLoadedPage(data.page);
      } catch {
        if (
          mountedRef.current &&
          requestGeneration === requestGenerationRef.current
        ) {
          setError("인플루언서 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (
          mountedRef.current &&
          requestGeneration === requestGenerationRef.current
        ) {
          setIsLoading(false);
        }
      }
    };

    void loadPage();
    return () => {
      if (requestGenerationRef.current === requestGeneration) {
        requestGenerationRef.current += 1;
      }
    };
  }, [
    categoryFilters,
    collectionKey,
    countryFilters,
    page,
    platformFilter,
    query,
    requestRevision,
    savedHandlesRevision,
    savedOnly,
    influencerSort,
  ]);

  return {
    profiles,
    isLoading,
    error,
    total,
    totalPages,
    loadedPage,
    retry,
  };
}

function useAdvertiserSavedInfluencers(enabled = true) {
  const [savedHandles, setSavedHandles] = useState<Set<string>>(() => new Set());
  const [savingHandles, setSavingHandles] = useState<Set<string>>(() => new Set());
  const [isReady, setIsReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const savedHandlesRef = useRef(savedHandles);
  const savingHandlesRef = useRef(savingHandles);
  const isReadyRef = useRef(false);
  const mountedRef = useRef(false);

  const replaceSavedHandles = useCallback((next: Set<string>) => {
    savedHandlesRef.current = next;
    setSavedHandles(next);
  }, []);

  const replaceSavingHandles = useCallback((next: Set<string>) => {
    savingHandlesRef.current = next;
    setSavingHandles(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    if (!enabled) {
      isReadyRef.current = false;
      void Promise.resolve().then(() => {
        if (!active) return;
        setIsReady(false);
        setError(undefined);
        replaceSavedHandles(new Set());
        replaceSavingHandles(new Set());
      });
      return () => {
        active = false;
        mountedRef.current = false;
      };
    }

    isReadyRef.current = false;
    void Promise.resolve().then(() => {
      if (!active) return;
      setIsReady(false);
      setError(undefined);
      replaceSavedHandles(new Set());
      replaceSavingHandles(new Set());
    });

    void apiFetch("/api/advertiser/saved-influencers", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Saved influencers failed");
        const data = (await response.json()) as AdvertiserSavedInfluencersResponse;
        const handles = new Set(
          (Array.isArray(data.handles) ? data.handles : [])
            .map((handle) => normalizePublicProfileHandle(handle))
          .filter(Boolean),
        );
        if (active) {
          replaceSavedHandles(handles);
          isReadyRef.current = true;
          setIsReady(true);
        }
      })
      .catch(() => {
        if (active) {
          isReadyRef.current = false;
          setError("관심 인플루언서를 불러오지 못했습니다.");
        }
      });

    return () => {
      active = false;
      isReadyRef.current = false;
      mountedRef.current = false;
    };
  }, [enabled, replaceSavedHandles, replaceSavingHandles]);

  const toggleSaved = useCallback(
    async (profile: MarketplaceInfluencerProfile) => {
      const handle = normalizePublicProfileHandle(profile.handle);
      if (
        !enabled ||
        !isReadyRef.current ||
        !handle ||
        savingHandlesRef.current.has(handle)
      ) {
        return;
      }

      const wasSaved = savedHandlesRef.current.has(handle);
      const optimisticSaved = new Set(savedHandlesRef.current);
      if (wasSaved) optimisticSaved.delete(handle);
      else optimisticSaved.add(handle);
      replaceSavedHandles(optimisticSaved);

      const nextSaving = new Set(savingHandlesRef.current);
      nextSaving.add(handle);
      replaceSavingHandles(nextSaving);
      setError(undefined);

      try {
        const response = await apiFetch(
          `/api/advertiser/saved-influencers/${encodeURIComponent(handle)}`,
          {
            method: wasSaved ? "DELETE" : "PUT",
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) throw new Error("Saved influencer update failed");
        const data = (await response.json().catch(() => ({}))) as
          AdvertiserSavedInfluencerMutationResponse;
        const canonicalHandle =
          normalizePublicProfileHandle(data.handle ?? "") || handle;
        const confirmedSaved = new Set(savedHandlesRef.current);
        if (wasSaved) {
          confirmedSaved.delete(handle);
          confirmedSaved.delete(canonicalHandle);
        } else {
          confirmedSaved.add(handle);
          confirmedSaved.add(canonicalHandle);
        }
        replaceSavedHandles(confirmedSaved);
        if (mountedRef.current) {
          setRevision((current) => current + 1);
        }
      } catch {
        const rolledBack = new Set(savedHandlesRef.current);
        if (wasSaved) rolledBack.add(handle);
        else rolledBack.delete(handle);
        replaceSavedHandles(rolledBack);
        if (mountedRef.current) setError("관심 상태를 변경하지 못했습니다.");
      } finally {
        const completed = new Set(savingHandlesRef.current);
        completed.delete(handle);
        replaceSavingHandles(completed);
      }
    },
    [enabled, replaceSavedHandles, replaceSavingHandles],
  );

  return {
    savedHandles,
    savingHandles,
    isReady,
    revision,
    error,
    toggleSaved,
  };
}

function useMarketplaceBrands() {
  const [brands, setBrands] = useState<MarketplaceBrandProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(false);

  const loadBrands = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const response = await apiFetch("/api/marketplace/brands", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Marketplace brands failed");
      const data = (await response.json()) as MarketplaceBrandsResponse;
      if (!Array.isArray(data.brands)) {
        throw new Error("Marketplace brands response was invalid");
      }
      if (mountedRef.current) setBrands(data.brands);
    } catch {
      if (mountedRef.current) {
        setBrands([]);
        setError("브랜드 목록을 불러오지 못했습니다.");
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      void loadBrands();
    }, 0);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
    };
  }, [loadBrands]);

  return { brands, isLoading, error, retry: loadBrands };
}

function useMarketplaceInfluencerProfile(handle: string | undefined) {
  const [remoteResult, setRemoteResult] = useState<{
    handle: string;
    status: "ready";
    profile: MarketplaceInfluencerProfile | null;
  } | {
    handle: string;
    status: "error";
    message: string;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
        if (active) setRemoteResult({ handle, status: "ready", profile: data.profile });
      })
      .catch(() => {
        if (active) {
          setRemoteResult({
            handle,
            status: "error",
            message: "인플루언서 프로필을 불러오지 못했습니다.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [handle, reloadToken]);

  const hasRemoteResult = remoteResult?.handle === handle;

  return {
    profile:
      hasRemoteResult && remoteResult.status === "ready"
        ? remoteResult.profile
        : null,
    isLoading: Boolean(handle && !hasRemoteResult),
    error:
      hasRemoteResult && remoteResult.status === "error"
        ? remoteResult.message
        : undefined,
    retry: () => {
      setRemoteResult(null);
      setReloadToken((current) => current + 1);
    },
  };
}

function useMarketplaceBrandProfile(handle: string | undefined) {
  const [remoteResult, setRemoteResult] = useState<{
    brand: MarketplaceBrandProfile | null;
    handle: string;
    status: "ready";
  } | {
    handle: string;
    status: "error";
    message: string;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
        if (active) setRemoteResult({ handle, status: "ready", brand: data.brand });
      })
      .catch(() => {
        if (active) {
          setRemoteResult({
            handle,
            status: "error",
            message: "브랜드 프로필을 불러오지 못했습니다.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [handle, reloadToken]);

  const hasRemoteResult = remoteResult?.handle === handle;

  return {
    brand:
      hasRemoteResult && remoteResult.status === "ready" ? remoteResult.brand : null,
    isLoading: Boolean(handle && !hasRemoteResult),
    error:
      hasRemoteResult && remoteResult.status === "error"
        ? remoteResult.message
        : undefined,
    retry: () => {
      setRemoteResult(null);
      setReloadToken((current) => current + 1);
    },
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

function useMarketplaceShellMode(
  role: MarketplaceShellRole,
): MarketplaceShellMode {
  const [mode, setMode] = useState<MarketplaceShellMode>("checking");

  useEffect(() => {
    let active = true;
    let retryAttempt = 0;
    let retryTimer: number | undefined;

    const checkSession = async () => {
      try {
        const response = await apiFetch(`/api/${role}/session`, {
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as
          MarketplaceSessionStatusResponse;
        if (!active) return;
        if (response.ok && data.authenticated === true) {
          retryAttempt = 0;
          setMode("authenticated");
          return;
        }
        if (
          response.status === 401 ||
          response.status === 403 ||
          (response.ok && data.authenticated === false)
        ) {
          retryAttempt = 0;
          setMode("anonymous");
          return;
        }
      } catch {
        // Keep the last known shell mode while authentication is temporarily unavailable.
      }

      if (!active || retryTimer !== undefined) return;
      const retryDelayMs = Math.min(1_000 * 2 ** retryAttempt, 10_000);
      retryAttempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void checkSession();
      }, retryDelayMs);
    };

    void checkSession();

    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [role]);

  return mode;
}

function useInfluencerMarketplaceShellMode(): MarketplaceShellMode {
  return useMarketplaceShellMode("influencer");
}

function AdvertiserMarketplaceHeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/advertiser/campaigns"
        className="yl-header-action yl-header-action-secondary"
      >
        <Megaphone className="h-4 w-4" />
        <span className="hidden sm:inline">캠페인</span>
      </Link>
      <Link
        to="/advertiser/builder"
        className="yl-header-action yl-header-action-primary hidden sm:inline-flex"
      >
        <FileText className="h-4 w-4" />
        <span>1:1 계약</span>
      </Link>
    </div>
  );
}

export function AdvertiserInfluencerDiscoveryPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [countryFilters, setCountryFilters] = useState<MarketplaceCountryCode[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [influencerSort, setInfluencerSort] =
    useState<InfluencerSortValue>("audience_desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] =
    useState<MarketplaceInfluencerProfile | null>(null);
  const [previewProfile, setPreviewProfile] = useState<{
    profile: MarketplaceInfluencerProfile;
    top: number;
    left: number;
  } | null>(null);
  const previewCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    savedHandles,
    savingHandles,
    isReady: savedInfluencersReady,
    revision: savedHandlesRevision,
    error: savedInfluencerError,
    toggleSaved: toggleSavedInfluencer,
  } = useAdvertiserSavedInfluencers();
  const {
    profiles,
    isLoading,
    error: influencerLoadError,
    total: influencerTotal,
    totalPages: influencerTotalPages,
    loadedPage,
    retry: retryInfluencers,
  } = useMarketplaceInfluencers(
    platformFilter,
    currentPage,
    influencerSort,
    savedOnly,
    query,
    categoryFilters,
    countryFilters,
    savedOnly ? savedHandlesRevision : 0,
  );
  const { brands } = useMarketplaceBrands();
  const advertiserTourAccountId = getAdvertiserSessionCache()?.user?.id;
  const totalPages = Math.max(1, influencerTotalPages ?? 0);
  const displayedPage = Math.min(loadedPage ?? currentPage, totalPages);
  const scrollInfluencerListToTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      const desktopList = document.querySelector<HTMLElement>(
        '[data-influencer-table-scroll="true"]',
      );
      const mobileList = document.querySelector<HTMLElement>(
        '[data-influencer-list-scroll="true"]',
      );
      const activeList =
        desktopList?.offsetParent !== null ? desktopList : mobileList;
      if (activeList) activeList.scrollTop = 0;
    });
  }, []);
  const resetToFirstPage = useCallback(() => {
    setCurrentPage(1);
    setPreviewProfile(null);
    scrollInfluencerListToTop();
  }, [scrollInfluencerListToTop]);
  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (
        isLoading ||
        nextPage < 1 ||
        nextPage > totalPages ||
        nextPage === currentPage
      ) {
        return;
      }
      setCurrentPage(nextPage);
      setPreviewProfile(null);
      scrollInfluencerListToTop();
    },
    [currentPage, isLoading, scrollInfluencerListToTop, totalPages],
  );
  const handleToggleSavedInfluencer = useCallback(
    async (profile: MarketplaceInfluencerProfile) => {
      if (savedOnly) resetToFirstPage();
      await toggleSavedInfluencer(profile);
    },
    [resetToFirstPage, savedOnly, toggleSavedInfluencer],
  );

  useEffect(() => {
    if (influencerTotal === null || currentPage <= totalPages) return;
    const timer = window.setTimeout(() => {
      setCurrentPage(totalPages);
      setPreviewProfile(null);
      scrollInfluencerListToTop();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentPage, influencerTotal, scrollInfluencerListToTop, totalPages]);
  const hiddenFilterCount =
    Number(platformFilter !== "all") +
    Number(categoryFilters.length > 0) +
    Number(countryFilters.length > 0);
  const hasActiveDiscoveryConditions = Boolean(
    query.trim() ||
      savedOnly ||
      platformFilter !== "all" ||
      categoryFilters.length > 0 ||
      countryFilters.length > 0,
  );
  const clearHiddenDiscoveryFilters = useCallback(() => {
    setPlatformFilter("all");
    setCategoryFilters([]);
    setCountryFilters([]);
    resetToFirstPage();
  }, [resetToFirstPage]);
  const showProfilePreview = (
    profile: MarketplaceInfluencerProfile,
    event:
      | MouseEvent<HTMLElement>
      | PointerEvent<HTMLElement>
      | FocusEvent<HTMLElement>,
  ) => {
    if (previewCloseTimerRef.current) {
      clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 384;
    const height = profile.recentPosts?.length ? 430 : 258;
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
  const keepProfilePreviewOpen = useCallback(() => {
    if (!previewCloseTimerRef.current) return;
    clearTimeout(previewCloseTimerRef.current);
    previewCloseTimerRef.current = null;
  }, []);
  const scheduleProfilePreviewClose = useCallback(() => {
    if (previewCloseTimerRef.current) clearTimeout(previewCloseTimerRef.current);
    previewCloseTimerRef.current = setTimeout(() => {
      setPreviewProfile(null);
      previewCloseTimerRef.current = null;
    }, 180);
  }, []);

  useEffect(
    () => () => {
      if (previewCloseTimerRef.current) clearTimeout(previewCloseTimerRef.current);
    },
    [],
  );

  return (
    <>
      <ProductSpotlightTour
        accountId={advertiserTourAccountId}
        role="advertiser"
        tourId="influencer-discovery"
        version={1}
        steps={ADVERTISER_DISCOVERY_TOUR_STEPS}
      />
      <MarketplaceShell
      mode="authenticated"
      role="advertiser"
      eyebrow="광고주 탐색"
      title="인플루언서 찾기"
      description="프로필과 채널 규모를 보고 바로 컨택합니다."
      backHref="/advertiser/dashboard"
      backLabel="1:1 계약 대시보드"
      brandCount={brands.length}
      showMetrics={false}
      showHeroCopy={false}
      clipPanelOverflow
      actions={<AdvertiserMarketplaceHeaderActions />}
    >
      <InfluencerDiscoveryControls
        count={influencerTotal}
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          resetToFirstPage();
        }}
        savedOnly={savedOnly}
        onSavedOnlyChange={(value) => {
          setSavedOnly(value);
          resetToFirstPage();
        }}
        sort={influencerSort}
        onSortChange={(value) => {
          setInfluencerSort(value);
          resetToFirstPage();
        }}
        platformFilter={platformFilter}
        onPlatformChange={(value) => {
          setPlatformFilter(value);
          resetToFirstPage();
        }}
        categoryFilters={categoryFilters}
        onCategoryChange={(values) => {
          setCategoryFilters(values);
          resetToFirstPage();
        }}
        countryFilters={countryFilters}
        onCountryChange={(values) => {
          setCountryFilters(values);
          resetToFirstPage();
        }}
        open={filtersOpen}
        activeFilterCount={hiddenFilterCount}
        onClearFilters={clearHiddenDiscoveryFilters}
        onClose={() => setFiltersOpen(false)}
        onToggle={() => {
          setPreviewProfile(null);
          setFiltersOpen((current) => !current);
        }}
      />

      {isLoading && profiles.length === 0 ? (
        <MarketplaceLoadingState label="인플루언서 프로필을 불러오는 중입니다" />
      ) : influencerLoadError && profiles.length === 0 ? (
        <MarketplaceErrorState
          message={influencerLoadError}
          onRetry={retryInfluencers}
        />
      ) : profiles.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <EmptyMarketplaceState
            title={
              savedOnly
                ? "관심 인플루언서가 없습니다"
                : hasActiveDiscoveryConditions
                ? "조건에 맞는 인플루언서가 없습니다"
                : "등록된 인플루언서가 없습니다"
            }
            body={
              savedOnly
                ? "목록이나 상세 화면의 별표를 눌러 추가해보세요."
                : hasActiveDiscoveryConditions
                ? "검색어나 조건을 줄여보세요."
                : "새 프로필이 등록되면 이곳에 표시됩니다."
            }
          />
        </div>
      ) : (
        <>
          <InfluencerDiscoveryTable
            profiles={profiles}
            platformFilter={platformFilter}
            currentPage={displayedPage}
            totalPages={totalPages}
            isLoading={isLoading}
            loadError={influencerLoadError}
            onRetry={retryInfluencers}
            onPageChange={handlePageChange}
            onContact={setSelectedProfile}
            savedHandles={savedHandles}
            savingHandles={savingHandles}
            isInterestReady={savedInfluencersReady}
            onToggleSaved={handleToggleSavedInfluencer}
            onPreview={showProfilePreview}
            onPreviewEnd={scheduleProfilePreviewClose}
          />
          {previewProfile ? (
            <InfluencerPreviewCard
              profile={previewProfile.profile}
              top={previewProfile.top}
              left={previewProfile.left}
              onPreviewEnter={keepProfilePreviewOpen}
              onPreviewEnd={scheduleProfilePreviewClose}
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
      {savedInfluencerError ? (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-[8px] bg-neutral-950 px-4 py-3 text-[12px] font-extrabold text-white shadow-xl"
        >
          {savedInfluencerError}
        </div>
      ) : null}
      </MarketplaceShell>
    </>
  );
}

export function InfluencerBrandDiscoveryPage() {
  const navigate = useNavigate();
  const shellMode = useInfluencerMarketplaceShellMode();
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openFilterList, setOpenFilterList] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] =
    useState<MarketplaceBrandProfile | null>(null);
  const publicProfilePath = useInfluencerPublicProfilePath();
  const {
    brands,
    isLoading,
    error: brandLoadError,
    retry: retryBrands,
  } = useMarketplaceBrands();
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
      mode={shellMode}
      role="influencer"
      eyebrow="인플루언서 탐색"
      title="브랜드 찾기"
      description="브랜드 정보를 확인하고 바로 역제안합니다."
      backHref="/influencer/dashboard"
      backLabel="1:1 계약"
      brandCount={displayBrands.length}
      showMetrics={false}
      showHeroCopy={false}
      actions={
        <div className="flex items-center gap-2">
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
      ) : brandLoadError ? (
        <MarketplaceErrorState message={brandLoadError} onRetry={retryBrands} />
      ) : filteredBrands.length === 0 ? (
        <EmptyMarketplaceState
          title={
            displayBrands.length === 0
              ? "등록된 브랜드가 없습니다"
              : "조건에 맞는 브랜드가 없습니다"
          }
          body={
            displayBrands.length === 0
              ? "새 브랜드가 등록되면 이곳에 표시됩니다."
              : "검색어나 조건을 줄여보세요."
          }
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

function MarketplaceAppHeader({
  mode,
  role,
  actions,
  showAuthenticatedActions = true,
}: {
  mode: MarketplaceShellMode;
  role: MarketplaceShellRole;
  actions?: ReactNode;
  showAuthenticatedActions?: boolean;
}) {
  const navigate = useNavigate();
  const isAuthenticated = mode === "authenticated";
  const isCheckingSession = mode === "checking";
  const dashboardHref = `/${role}/dashboard`;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const closeAccountMenu = useCallback(() => setAccountMenuOpen(false), []);
  const { summary: messageSummary, isLoading: isMessageSummaryLoading } =
    useMarketplaceMessageSummary(role, {
      enabled: isAuthenticated && showAuthenticatedActions,
    });

  const handleLogout = async () => {
    try {
      await apiFetch(`/api/${role}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] ${role} logout request failed`, error);
    } finally {
      finishFastLoginTransition(role);
      clearVerificationSummaryCache(role);
      clearMarketplaceMessageSummaryCache(role);
      clearNotificationCenterCache(role);
      if (role === "advertiser") {
        clearAdvertiserSessionCache();
        clearAdvertiserDashboardBootstrapPreload();
      } else {
        clearInfluencerDashboardPreload();
      }
      navigate(role === "advertiser" ? "/login/advertiser" : "/login/influencer", {
        replace: true,
      });
    }
  };

  return (
    <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
        {isCheckingSession ? (
          <div className="flex shrink-0 items-center gap-3" aria-busy="true">
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none sm:text-[19px]">
              {PRODUCT_NAME}
            </span>
          </div>
        ) : (
          <Link
            to={isAuthenticated ? dashboardHref : "/"}
            className="flex shrink-0 items-center gap-3"
          >
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none sm:text-[19px]">
              {PRODUCT_NAME}
            </span>
          </Link>
        )}
        <div className="ml-2 flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-visible sm:ml-3 sm:gap-2">
          {isAuthenticated ? (
            showAuthenticatedActions ? (
              <>
                <HeaderNotificationCenterButton role={role} />
                <HeaderMessageCenterButton
                  unreadCount={messageSummary.unreadCount}
                  isLoading={isMessageSummaryLoading}
                  onClick={() => navigate(`/${role}/messages`)}
                />
                <div className="hidden sm:contents">{actions}</div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
                  aria-label="로그아웃"
                  title="로그아웃"
                >
                  <LogOut className="h-4 w-4" />
                  <span>로그아웃</span>
                </button>
                {role === "advertiser" ? (
                  <AdvertiserAccountSettingsMenu
                    account={{}}
                    open={accountMenuOpen}
                    onToggle={() => setAccountMenuOpen((current) => !current)}
                    onClose={closeAccountMenu}
                    onOpenBusinessVerification={() => {
                      closeAccountMenu();
                      navigate("/advertiser/verification");
                    }}
                    onChangePassword={() => {
                      closeAccountMenu();
                      navigate("/reset-password?role=advertiser");
                    }}
                    onLogout={() => {
                      closeAccountMenu();
                      void handleLogout();
                    }}
                  />
                ) : (
                  <InfluencerAccountSettingsMenu
                    account={{ name: "인플루언서" }}
                    open={accountMenuOpen}
                    onToggle={() => setAccountMenuOpen((current) => !current)}
                    onClose={closeAccountMenu}
                    onManageProfile={() => {
                      closeAccountMenu();
                      navigate("/influencer/profile");
                    }}
                    onChangePassword={() => {
                      closeAccountMenu();
                      navigate("/reset-password?role=influencer");
                    }}
                    onLogout={() => {
                      closeAccountMenu();
                      void handleLogout();
                    }}
                  />
                )}
              </>
            ) : null
          ) : mode === "anonymous" ? (
            <Link
              to={`/login/${role}`}
              className="yl-header-action yl-header-action-secondary shrink-0"
              aria-label="로그인"
              title="로그인"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">로그인</span>
            </Link>
          ) : showAuthenticatedActions ? (
            <div className="flex gap-1.5 sm:gap-2" aria-busy="true">
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="sr-only">로그인 상태 확인 중</span>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function PublicProfileHeader({
  mode,
  authenticatedRole,
  authenticatedActions,
  authenticatedHref,
  authenticatedLabel,
  anonymousHref,
  anonymousLabel,
  forceHref,
  forceLabel,
  showAuthenticatedBackIcon = false,
}: PublicProfileHeaderConfig & { mode: MarketplaceShellMode }) {
  if (mode === "authenticated" && authenticatedRole && !forceHref) {
    return (
      <MarketplaceAppHeader
        mode={mode}
        role={authenticatedRole}
        actions={authenticatedActions}
      />
    );
  }

  const isChecking = mode === "checking" && !forceHref;
  const href =
    forceHref ??
    (mode === "authenticated" ? authenticatedHref : anonymousHref);
  const label =
    forceLabel ??
    (mode === "authenticated" ? authenticatedLabel : anonymousLabel);
  const showBackIcon = Boolean(forceHref) ||
    (mode === "authenticated" && showAuthenticatedBackIcon);

  return (
    <header className="shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-h-10 min-w-10 items-center gap-3">
          <LogoMark />
          <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em]">
            {PRODUCT_NAME}
          </span>
        </Link>
        {isChecking ? (
          <span
            className="inline-flex h-10 w-[120px] items-center justify-center rounded-[12px] border border-neutral-200 bg-white"
            aria-busy="true"
          >
            <span className="sr-only">로그인 상태 확인 중</span>
            <span
              className="h-4 w-20 animate-pulse rounded bg-neutral-200"
              aria-hidden="true"
            />
          </span>
        ) : (
          <Link
            to={href}
            className="inline-flex h-10 items-center gap-1.5 rounded-[12px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 sm:text-[13px]"
            aria-label={label}
            title={label}
          >
            {showBackIcon ? <ArrowLeft className="h-4 w-4 shrink-0" /> : null}
            {label}
          </Link>
        )}
      </div>
    </header>
  );
}

export function PublicInfluencerProfilePage() {
  const { profileHandle } = useParams<{ profileHandle: string }>();
  const [showContact, setShowContact] = useState(false);
  const [failedProfileAvatarUrl, setFailedProfileAvatarUrl] = useState<string | null>(
    null,
  );
  const {
    profile,
    isLoading,
    error: profileLoadError,
    retry: retryProfile,
  } = useMarketplaceInfluencerProfile(profileHandle);
  const currentProfilePath = useInfluencerPublicProfilePath();
  const advertiserShellMode = useMarketplaceShellMode("advertiser");
  const {
    savedHandles: profileInterestHandles,
    savingHandles: profileInterestSavingHandles,
    isReady: profileInterestReady,
    error: profileInterestError,
    toggleSaved: toggleProfileInterest,
  } = useAdvertiserSavedInfluencers(advertiserShellMode === "authenticated");
  const isOwnRequestedProfile = Boolean(
    currentProfilePath &&
      profileHandle &&
      normalizePublicProfileHandle(currentProfilePath) ===
        normalizePublicProfileHandle(profileHandle),
  );
  const publicInfluencerHeader: PublicProfileHeaderConfig = {
    authenticatedRole: "advertiser",
    authenticatedActions: <AdvertiserMarketplaceHeaderActions />,
    authenticatedHref: "/advertiser/discover",
    authenticatedLabel: "인플루언서 찾기",
    anonymousHref: "/intro/advertiser",
    anonymousLabel: "광고주 시작하기",
    showAuthenticatedBackIcon: true,
    ...(isOwnRequestedProfile
      ? {
          forceHref: "/influencer/profile",
          forceLabel: "프로필 관리",
        }
      : {}),
  };

  if (isLoading) {
    return (
      <MarketplaceShell
        mode={advertiserShellMode}
        role="advertiser"
        showAuthenticatedActions={false}
        publicHeader={publicInfluencerHeader}
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

  if (profileLoadError) {
    return (
      <MarketplaceShell
        mode={advertiserShellMode}
        role="advertiser"
        showAuthenticatedActions={false}
        publicHeader={publicInfluencerHeader}
        eyebrow="공개 프로필"
        title="프로필을 불러오지 못했습니다"
        description="잠시 후 다시 확인해 주세요."
        backHref="/"
        backLabel="처음으로"
        showMetrics={false}
      >
        <MarketplaceErrorState message={profileLoadError} onRetry={retryProfile} />
      </MarketplaceShell>
    );
  }

  if (!profile) {
    return (
      <MarketplaceShell
        mode={advertiserShellMode}
        role="advertiser"
        showAuthenticatedActions={false}
        publicHeader={publicInfluencerHeader}
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
  const profileVerified = profile.platformVerified === true;
  const profileComplete = Boolean(
    getMarketplaceInfluencerAvatarUrl(profile) && profile.headline.trim(),
  );
  const normalizedProfileHandle = normalizePublicProfileHandle(profile.handle);
  const showProfileInterestAction =
    advertiserShellMode === "authenticated" && !isOwnPublishedProfile;
  const ownerPrimaryAction = isOwnPublishedProfile
    ? !profileVerified
      ? {
          href: "/influencer/verification",
          label: "계정 인증하기",
        }
      : !profileComplete
        ? {
            href: "/influencer/profile",
            label: "프로필 완성하기",
          }
        : undefined
    : undefined;
  const showPrimaryProfileAction = Boolean(
    ownerPrimaryAction ||
      (!isOwnPublishedProfile && !isDiscoveredProfile && profileVerified),
  );
  const isProfileInterested = profileInterestHandles.has(normalizedProfileHandle);
  const isProfileInterestSaving =
    profileInterestSavingHandles.has(normalizedProfileHandle);
  const primaryProfileActionClassName =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] bg-blue-600 px-4 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700";
  const renderProfileActions = (layout: "desktop" | "mobile") => {
    if (!showProfileInterestAction && !showPrimaryProfileAction) return null;
    const desktop = layout === "desktop";
    return (
      <div
        className={
          desktop
            ? "hidden shrink-0 items-center justify-end gap-2 lg:flex"
            : "flex w-full min-w-0 items-center gap-2 lg:hidden"
        }
      >
        {showProfileInterestAction ? (
          <InfluencerInterestButton
            profile={profile}
            isSaved={isProfileInterested}
            isSaving={isProfileInterestSaving}
            isReady={profileInterestReady}
            onToggle={toggleProfileInterest}
            variant="detail"
            className={
              showPrimaryProfileAction
                ? "w-[92px]"
                : desktop
                  ? "w-[112px]"
                  : "w-full"
            }
          />
        ) : null}
        {ownerPrimaryAction ? (
          <Link
            to={ownerPrimaryAction.href}
            className={`${desktop ? "h-12 w-[156px]" : "h-12 min-w-0 flex-1"} ${primaryProfileActionClassName}`}
          >
            <UserRound className="h-4 w-4 shrink-0" />
            <span>{ownerPrimaryAction.label}</span>
          </Link>
        ) : showPrimaryProfileAction ? (
          <button
            type="button"
            onClick={() => setShowContact(true)}
            className={`${desktop ? "h-12 w-[156px]" : "h-12 min-w-0 flex-1"} ${primaryProfileActionClassName}`}
            aria-label={`${profile.displayName}에게 1:1 계약 제안`}
            title="1:1 계약 제안"
          >
            <Handshake className="h-4 w-4 shrink-0" />
            <span>1:1 계약 제안</span>
          </button>
        ) : null}
      </div>
    );
  };

  const profileAvatarUrl = getMarketplaceInfluencerAvatarUrl(profile);
  const shouldRenderProfileAvatar =
    Boolean(profileAvatarUrl) && failedProfileAvatarUrl !== profileAvatarUrl;
  const profileLayoutClassName = shouldRenderProfileAvatar
    ? "grid lg:grid-cols-[320px_minmax(0,1fr)]"
    : "grid";

  return (
    <main className="min-h-svh bg-[#f4f7fb] font-sans text-neutral-950">
      <PublicProfileHeader
        mode={advertiserShellMode}
        {...publicInfluencerHeader}
      />

      <section className="px-4 py-4 sm:px-6 sm:py-8 lg:px-8 lg:pt-14">
        {advertiserShellMode === "authenticated" && !isOwnPublishedProfile ? (
          <div className="mx-auto mb-3 flex max-w-[1080px] justify-start sm:mb-4">
            <Link
              to="/advertiser/discover"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              aria-label="인플루언서 찾기"
              title="인플루언서 찾기"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="whitespace-nowrap">인플루언서 찾기</span>
            </Link>
          </div>
        ) : null}
        <article
          data-profile-layout="creator-media-kit"
          className="mx-auto max-w-[1080px] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.1)]"
        >
          <div className={profileLayoutClassName}>
            {shouldRenderProfileAvatar ? (
              <div className="relative bg-neutral-950 p-1.5 sm:p-2.5">
                <img
                  src={profileAvatarUrl}
                  alt={profile.displayName}
                  className="h-[200px] w-full rounded-[20px] object-cover shadow-[0_18px_42px_rgba(15,23,42,0.12)] sm:h-[320px] sm:rounded-[22px] lg:h-full lg:min-h-[360px]"
                  onError={() => setFailedProfileAvatarUrl(profileAvatarUrl ?? null)}
                />
              </div>
            ) : null}

            <div className="flex min-w-0 flex-col p-4 sm:p-7 lg:p-8">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
              <p className="break-keep text-[13px] font-extrabold text-neutral-500 sm:text-[14px]">
                {categoryLabels.join(" · ")}
              </p>

              <h1 className="font-neo-heavy mt-4 text-[33px] leading-[0.98] tracking-normal text-neutral-950 sm:mt-5 sm:text-[56px]">
                {profile.displayName}
              </h1>
              {profile.headline.trim() ? (
                <p className="mt-3 max-w-xl break-keep text-[15px] font-extrabold leading-6 text-neutral-800 sm:mt-4 sm:text-[19px] sm:leading-8">
                  {cleanMarketplaceCopy(profile.headline)}
                </p>
              ) : !profileVerified ? (
                <span className="mt-3 inline-flex w-fit rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[12px] font-extrabold text-neutral-600">
                  계정 인증 전
                </span>
              ) : null}

                </div>

                {renderProfileActions("desktop")}
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
                          aria-label={[
                            getPlatformDisplayName(platform.platform),
                            platform.handle,
                            platform.followersLabel,
                            platform.performanceLabel,
                            "계정 보기",
                          ].filter(Boolean).join(" ")}
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
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className={platformFollowerClassName}>
                              {platform.ownershipStatus === "unverified"
                                ? "계정 인증 전"
                                : formatDiscoveryAudienceMetric(
                                    platform.followersLabel,
                                  )}
                            </p>
                            <SelfReportedMetricBadge
                              visible={platform.metricTrust === "self_reported"}
                            />
                          </div>
                          <span
                            aria-hidden="true"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-neutral-400 transition group-hover:bg-blue-50 group-hover:text-blue-700 lg:absolute lg:right-0 lg:top-0 lg:h-7 lg:w-7"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </span>
                        </a>
                      ))}
                    </div>

                    {showProfileInterestAction || showPrimaryProfileAction ? (
                      <aside className="flex min-h-[52px] min-w-0 items-center justify-center lg:hidden">
                        {renderProfileActions("mobile")}
                      </aside>
                    ) : null}
                  </div>
                </div>

              </div>
            </div>
          </div>

        </article>
      </section>

      {showContact &&
      !isOwnPublishedProfile &&
      !isDiscoveredProfile &&
      profileVerified ? (
        <InfluencerContactDialog
          key={profile.id}
          profile={profile}
          onClose={() => setShowContact(false)}
        />
      ) : null}
      {profileInterestError && showProfileInterestAction ? (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-[8px] bg-neutral-950 px-4 py-3 text-[12px] font-extrabold text-white shadow-xl"
        >
          {profileInterestError}
        </div>
      ) : null}
    </main>
  );
}

export function PublicBrandProfilePage() {
  const { brandHandle } = useParams<{ brandHandle: string }>();
  const [showContact, setShowContact] = useState(false);
  const influencerShellMode = useMarketplaceShellMode("influencer");
  const publicBrandHeader: PublicProfileHeaderConfig = {
    authenticatedRole: "influencer",
    authenticatedHref: "/influencer/brands",
    authenticatedLabel: "브랜드 찾기",
    anonymousHref: "/intro/influencer",
    anonymousLabel: "인플루언서 시작하기",
  };
  const {
    brand,
    isLoading,
    error: brandLoadError,
    retry: retryBrand,
  } = useMarketplaceBrandProfile(brandHandle);

  if (isLoading) {
    return (
      <MarketplaceShell
        mode={influencerShellMode}
        role="influencer"
        showAuthenticatedActions={false}
        publicHeader={publicBrandHeader}
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

  if (brandLoadError) {
    return (
      <MarketplaceShell
        mode={influencerShellMode}
        role="influencer"
        publicHeader={publicBrandHeader}
        eyebrow="브랜드 프로필"
        title="브랜드를 불러오지 못했습니다"
        description="잠시 후 다시 확인해 주세요."
        showAuthenticatedActions={false}
        backHref="/influencer/brands"
        backLabel="브랜드 찾기"
        showMetrics={false}
      >
        <MarketplaceErrorState message={brandLoadError} onRetry={retryBrand} />
      </MarketplaceShell>
    );
  }

  if (!brand) {
    return (
      <MarketplaceShell
        mode={influencerShellMode}
        role="influencer"
        showAuthenticatedActions={false}
        publicHeader={publicBrandHeader}
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
      <PublicProfileHeader mode={influencerShellMode} {...publicBrandHeader} />

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
                      {getCampaignProposalTypeDisplayLabel(campaign)}
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
                          {formatCampaignApplicantLimit(campaign.applicantLimit)}
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
  mode,
  role,
  publicHeader,
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
  showAuthenticatedActions = true,
  clipPanelOverflow = false,
  children,
}: {
  mode: MarketplaceShellMode;
  role: MarketplaceShellRole;
  publicHeader?: PublicProfileHeaderConfig;
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
  showAuthenticatedActions?: boolean;
  clipPanelOverflow?: boolean;
  children: ReactNode;
}) {
  const isAuthenticated = mode === "authenticated";

  useEffect(() => {
    if (!clipPanelOverflow) return undefined;
    document.documentElement.classList.add("yl-fixed-app-frame");
    document.body.classList.add("yl-fixed-app-frame");
    return () => {
      document.documentElement.classList.remove("yl-fixed-app-frame");
      document.body.classList.remove("yl-fixed-app-frame");
    };
  }, [clipPanelOverflow]);

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      {publicHeader ? (
        <PublicProfileHeader mode={mode} {...publicHeader} />
      ) : (
        <MarketplaceAppHeader
          mode={mode}
          role={role}
          actions={actions}
          showAuthenticatedActions={showAuthenticatedActions}
        />
      )}

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
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h1 className="min-w-0 font-neo-heavy text-[28px] leading-[1.05] text-neutral-950 sm:text-[36px] sm:leading-none">
                  {title}
                </h1>
                <Link
                  to={backHref}
                  className="yl-header-action yl-header-action-secondary shrink-0"
                  aria-label={backLabel}
                  title={backLabel}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{backLabel}</span>
                </Link>
              </div>
              {showHeroCopy ? (
                <p className="mt-2 line-clamp-1 max-w-3xl break-keep text-[13px] font-bold leading-5 text-neutral-600">
                  {description}
                </p>
              ) : null}
            </div>
            {isAuthenticated && showMetrics ? (
              <div className="grid grid-cols-3 gap-1.5 rounded-[14px] border border-neutral-200 bg-white p-1.5 shadow-[0_10px_26px_rgba(15,23,42,0.035)] sm:w-[360px]">
                <MiniMetric label="공개 프로필" value={(profileCount ?? 0).toString()} />
                <MiniMetric label="입점 브랜드" value={(brandCount ?? 0).toString()} />
                <MiniMetric label="계약 연결" value="요청 가능" />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div
        className={`yl-panel mx-3 my-3 flex min-h-0 max-w-[1500px] flex-1 flex-col border sm:mx-5 lg:mx-auto lg:w-full ${
          clipPanelOverflow ? "overflow-hidden" : "overflow-visible"
        }`}
      >
        {children}
      </div>
    </main>
  );
}

function InfluencerDiscoveryTable({
  profiles,
  platformFilter,
  currentPage,
  totalPages,
  isLoading,
  loadError,
  onRetry,
  onPageChange,
  onContact,
  savedHandles,
  savingHandles,
  isInterestReady,
  onToggleSaved,
  onPreview,
  onPreviewEnd,
}: {
  profiles: MarketplaceInfluencerProfile[];
  platformFilter: PlatformFilter;
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  loadError?: string;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onContact: (profile: MarketplaceInfluencerProfile) => void;
  savedHandles: ReadonlySet<string>;
  savingHandles: ReadonlySet<string>;
  isInterestReady: boolean;
  onToggleSaved: (profile: MarketplaceInfluencerProfile) => Promise<void>;
  onPreview: (
    profile: MarketplaceInfluencerProfile,
    event:
      | MouseEvent<HTMLElement>
      | PointerEvent<HTMLElement>
      | FocusEvent<HTMLElement>,
  ) => void;
  onPreviewEnd: () => void;
}) {
  return (
    <section
      data-influencer-list-scroll="true"
      aria-busy={isLoading}
      className="min-h-0 flex-1 overflow-auto p-2.5 lg:flex lg:flex-col lg:overflow-hidden lg:p-4"
    >
      <div className="hidden min-h-0 min-w-[1000px] w-full flex-1 flex-col rounded-[8px] border border-[#d9e0d9] bg-white lg:flex">
        <div
          data-influencer-table-header="true"
          className="grid shrink-0 grid-cols-[44px_78px_56px_minmax(150px,0.6fr)_minmax(240px,0.8fr)_minmax(140px,0.5fr)_110px] items-center gap-2.5 rounded-t-[8px] border-b border-[#d7ddd7] bg-[#f7f8f4] px-3 py-3 text-[12px] font-extrabold text-[#303630] shadow-[0_1px_0_rgba(215,221,215,0.9)]"
        >
          <span className="text-center">관심</span>
          <span>국가</span>
          <span>플랫폼</span>
          <span>카테고리</span>
          <span>인플루언서</span>
          <span>채널 지표</span>
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
              isSaved={savedHandles.has(normalizePublicProfileHandle(profile.handle))}
              isSaving={savingHandles.has(normalizePublicProfileHandle(profile.handle))}
              isReady={isInterestReady}
              onToggleSaved={onToggleSaved}
              onPreview={onPreview}
              onPreviewEnd={onPreviewEnd}
            />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white lg:hidden">
        {profiles.map((profile) => (
          <InfluencerDiscoveryCompactRow
            key={profile.id}
            profile={profile}
            platformFilter={platformFilter}
            onContact={onContact}
            isSaved={savedHandles.has(normalizePublicProfileHandle(profile.handle))}
            isSaving={savingHandles.has(normalizePublicProfileHandle(profile.handle))}
            isReady={isInterestReady}
            onToggleSaved={onToggleSaved}
          />
        ))}
      </div>

      <div className="w-full shrink-0 pt-2.5">
        {loadError ? (
          <div
            role="alert"
            className="mb-2 flex min-h-10 items-center justify-center gap-3 rounded-[8px] border border-rose-100 bg-rose-50 px-3 text-[12px] font-semibold text-rose-700"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={onRetry}
              className="h-8 shrink-0 rounded-md border border-rose-200 bg-white px-3 font-extrabold transition hover:border-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              다시 시도
            </button>
          </div>
        ) : null}
        <InfluencerPagination
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isLoading}
          onPageChange={onPageChange}
        />
      </div>
    </section>
  );
}

function getInfluencerPaginationWindow(
  currentPage: number,
  totalPages: number,
  maxVisiblePages: number,
) {
  const visibleCount = Math.min(maxVisiblePages, totalPages);
  const centeredStart = Math.max(1, currentPage - Math.floor(visibleCount / 2));
  const start = Math.min(centeredStart, totalPages - visibleCount + 1);
  return Array.from({ length: visibleCount }, (_, index) => start + index);
}

function InfluencerPagination({
  currentPage,
  totalPages,
  isLoading,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const desktopPages = getInfluencerPaginationWindow(
    currentPage,
    totalPages,
    10,
  );
  const mobilePages = getInfluencerPaginationWindow(
    currentPage,
    totalPages,
    5,
  );
  const compactMobilePages = getInfluencerPaginationWindow(
    currentPage,
    totalPages,
    4,
  );
  const buttonClassName =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[12px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-default disabled:opacity-45 sm:h-8 sm:w-8";
  const renderPaginationControls = (pages: number[]) => (
    <>
      <button
        type="button"
        aria-label="이전 페이지"
        title="이전 페이지"
        disabled={isLoading || currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        className={`${buttonClassName} border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      {pages.map((page) => {
        const isCurrent = page === currentPage;
        return (
          <button
            key={page}
            type="button"
            aria-label={`${page}페이지`}
            aria-current={isCurrent ? "page" : undefined}
            disabled={isLoading}
            onClick={() => onPageChange(page)}
            className={`${buttonClassName} ${
              isCurrent
                ? "bg-blue-600 text-white shadow-sm"
                : "border border-neutral-200 bg-white text-neutral-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            }`}
          >
            {page}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="다음 페이지"
        title="다음 페이지"
        disabled={isLoading || currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className={`${buttonClassName} border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </>
  );

  return (
    <nav
      data-influencer-pagination="true"
      aria-label="인플루언서 목록 페이지"
      className="flex w-full items-center justify-center overflow-hidden"
    >
      <div className="flex max-w-full items-center justify-center gap-1 min-[360px]:hidden">
        {renderPaginationControls(compactMobilePages)}
      </div>
      <div className="hidden max-w-full items-center justify-center gap-1 min-[360px]:flex sm:hidden">
        {renderPaginationControls(mobilePages)}
      </div>
      <div className="hidden max-w-full items-center justify-center gap-1 sm:flex">
        {renderPaginationControls(desktopPages)}
      </div>
      <span className="sr-only" aria-live="polite">
        {isLoading
          ? `${currentPage}페이지를 불러오는 중입니다`
          : `${currentPage}페이지`}
      </span>
    </nav>
  );
}

function InfluencerInterestButton({
  profile,
  isSaved,
  isSaving,
  isReady,
  onToggle,
  variant = "icon",
  className = "",
}: {
  profile: MarketplaceInfluencerProfile;
  isSaved: boolean;
  isSaving: boolean;
  isReady: boolean;
  onToggle: (profile: MarketplaceInfluencerProfile) => Promise<void>;
  variant?: "icon" | "detail";
  className?: string;
}) {
  const label = isSaved ? "관심 인플루언서 해제" : "관심 인플루언서 추가";
  const isDetail = variant === "detail";

  return (
    <button
      type="button"
      aria-pressed={isSaved}
      aria-label={`${profile.displayName} ${label}`}
      title={label}
      disabled={!isReady || isSaving}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void onToggle(profile);
      }}
      className={`inline-flex shrink-0 items-center justify-center gap-2 border font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-45 ${
        isDetail
          ? `h-12 rounded-[12px] px-3 text-[13px] ${
              isSaved
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            }`
          : `h-9 w-9 justify-self-center rounded-[8px] ${
              isSaved
                ? "border-blue-100 bg-blue-50 text-blue-700"
                : "border-transparent bg-transparent text-neutral-400 hover:border-neutral-200 hover:bg-neutral-50 hover:text-neutral-700"
            }`
      } ${className}`}
    >
      <Star
        className={`${isDetail ? "h-4 w-4" : "h-[18px] w-[18px]"} ${
          isSaved ? "fill-current" : ""
        } ${isSaving ? "animate-pulse" : ""}`}
        strokeWidth={2.2}
        aria-hidden="true"
      />
      {isDetail ? <span>관심</span> : null}
    </button>
  );
}

function InfluencerDiscoveryTableRow({
  profile,
  platformFilter,
  onContact,
  isSaved,
  isSaving,
  isReady,
  onToggleSaved,
  onPreview,
  onPreviewEnd,
}: {
  key?: string;
  profile: MarketplaceInfluencerProfile;
  platformFilter: PlatformFilter;
  onContact: (profile: MarketplaceInfluencerProfile) => void;
  isSaved: boolean;
  isSaving: boolean;
  isReady: boolean;
  onToggleSaved: (profile: MarketplaceInfluencerProfile) => Promise<void>;
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
  const countryLabel = formatMarketplaceCountries(
    profile.audienceCountries,
    "국가 미확인",
  );
  const audienceLabel = formatDiscoveryAudienceMetric(primaryPlatform?.followersLabel);
  const isPrivateRegisteredProfile = isAuthenticatedAdvertiserOnlyInfluencer(profile);
  const canOpenPublicProfile = canOpenInfluencerPublicProfile(profile);
  const platformLabel = primaryPlatform
    ? platformLabels[primaryPlatform.platform]
    : isPrivateRegisteredProfile
      ? "플랫폼 인증 전"
      : "기타";
  const canPropose =
    isRegisteredMarketplaceInfluencer(profile) && profile.platformVerified === true;
  const primaryChannelUrl = getMarketplaceInfluencerPrimaryChannelUrl(
    profile,
    platformFilter,
  );
  const profileActionHref =
    primaryChannelUrl ??
    (canOpenPublicProfile ? getInfluencerProfilePath(profile) : undefined);

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
      className="group grid min-h-[64px] grid-cols-[44px_78px_56px_minmax(150px,0.6fr)_minmax(240px,0.8fr)_minmax(140px,0.5fr)_110px] items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#fbfcfa] focus-visible:bg-[#fbfcfa] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600"
    >
      <InfluencerInterestButton
        profile={profile}
        isSaved={isSaved}
        isSaving={isSaving}
        isReady={isReady}
        onToggle={onToggleSaved}
      />

      <p className="truncate text-[12px] font-bold text-neutral-500">{countryLabel}</p>

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
          <span className="text-[12px] font-bold text-neutral-400">
            {isPrivateRegisteredProfile ? "플랫폼 인증 전" : "확인 필요"}
          </span>
        )}
      </div>

      <p className="truncate text-[12px] font-bold text-neutral-700">
        {categoryLabel ||
          (isRegisteredMarketplaceInfluencer(profile)
            ? "카테고리 미설정"
            : "카테고리 미확인")}
      </p>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          {canOpenPublicProfile ? (
            <Link
              to={getInfluencerProfilePath(profile)}
              className="min-w-0 truncate text-[14px] font-extrabold text-neutral-950 hover:underline"
              title={profile.displayName}
            >
              {profile.displayName}
            </Link>
          ) : (
            <span
              className="min-w-0 truncate text-[14px] font-extrabold text-neutral-950"
              title={`${profile.displayName} · 공개 프로필 준비 전`}
            >
              {profile.displayName}
            </span>
          )}
        </div>
      </div>
      <div
        className="flex min-w-0 items-center gap-1.5"
        title={primaryPlatform?.performanceLabel}
      >
        <p className="truncate text-[12px] font-extrabold text-neutral-950">
          {primaryPlatform
            ? primaryPlatform.ownershipStatus === "unverified"
              ? "계정 인증 전"
              : audienceLabel
            : isPrivateRegisteredProfile
              ? "플랫폼 인증 전"
              : audienceLabel}
        </p>
        <SelfReportedMetricBadge
          visible={primaryPlatform?.metricTrust === "self_reported"}
        />
      </div>

      <div className="flex justify-end">
        {canPropose ? (
          <button
            type="button"
            onClick={() => onContact(profile)}
            className="inline-flex h-9 w-[106px] items-center justify-center gap-1.5 rounded-[7px] bg-blue-600 px-1.5 text-[12px] font-extrabold text-white transition hover:bg-blue-700"
          >
            <Send className="h-3.5 w-3.5" />
            1:1 계약 제안
          </button>
        ) : profileActionHref ? (
          <a
            href={profileActionHref}
            target={primaryChannelUrl ? "_blank" : undefined}
            rel={primaryChannelUrl ? "noreferrer" : undefined}
            aria-label={`${profile.displayName} ${
              primaryChannelUrl ? "공개 채널 보기" : "프로필 보기"
            }`}
            title={primaryChannelUrl ? "공개 채널 보기" : "프로필 보기"}
            className="inline-flex h-9 w-[106px] items-center justify-center gap-1.5 rounded-[7px] border border-neutral-200 bg-white px-2 text-[12px] font-extrabold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {primaryChannelUrl ? "채널 보기" : "프로필 보기"}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-9 w-[106px] items-center justify-center rounded-[7px] border border-neutral-200 bg-neutral-50 px-2 text-[12px] font-extrabold text-neutral-400"
          >
            프로필 준비 전
          </span>
        )}
      </div>
    </article>
  );
}

function InfluencerDiscoveryCompactRow({
  profile,
  platformFilter,
  onContact,
  isSaved,
  isSaving,
  isReady,
  onToggleSaved,
}: {
  key?: string;
  profile: MarketplaceInfluencerProfile;
  platformFilter: PlatformFilter;
  onContact: (profile: MarketplaceInfluencerProfile) => void;
  isSaved: boolean;
  isSaving: boolean;
  isReady: boolean;
  onToggleSaved: (profile: MarketplaceInfluencerProfile) => Promise<void>;
}) {
  const [recentPostsOpen, setRecentPostsOpen] = useState(false);
  const primaryPlatform = getMarketplaceInfluencerDisplayPlatform(
    profile,
    platformFilter,
  );
  const categoryLabel = getCategoryLabels(profile.categories, 2).join(" · ");
  const canPropose =
    isRegisteredMarketplaceInfluencer(profile) && profile.platformVerified === true;
  const primaryChannelUrl = getMarketplaceInfluencerPrimaryChannelUrl(
    profile,
    platformFilter,
  );
  const countryLabel = formatMarketplaceCountries(
    profile.audienceCountries,
    "국가 미확인",
  );
  const recentPosts = normalizeNaverBlogRecentPosts(profile.recentPosts, 3);
  const isPrivateRegisteredProfile = isAuthenticatedAdvertiserOnlyInfluencer(profile);
  const canOpenPublicProfile = canOpenInfluencerPublicProfile(profile);
  const profileActionHref =
    primaryChannelUrl ??
    (canOpenPublicProfile ? getInfluencerProfilePath(profile) : undefined);

  return (
    <article className="grid gap-3 border-b border-[#e4e9e4] p-3 last:border-b-0">
      <div className="flex min-w-0 items-start">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {canOpenPublicProfile ? (
              <Link
                to={getInfluencerProfilePath(profile)}
                className="min-w-0 truncate text-[15px] font-extrabold text-neutral-950 hover:underline"
                title={profile.displayName}
              >
                {profile.displayName}
              </Link>
            ) : (
              <span
                className="min-w-0 truncate text-[15px] font-extrabold text-neutral-950"
                title={`${profile.displayName} · 공개 프로필 준비 전`}
              >
                {profile.displayName}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[12px] font-bold text-neutral-600">
            {countryLabel} ·{" "}
            {categoryLabel ||
              (isRegisteredMarketplaceInfluencer(profile)
                ? "카테고리 미설정"
                : "카테고리 미확인")}
          </p>
          {primaryPlatform ? (
            <div className="mt-1.5">
              <PlatformPill
                platform={primaryPlatform.platform}
                label={platformLabels[primaryPlatform.platform]}
                value={
                  primaryPlatform.ownershipStatus === "unverified"
                    ? "계정 인증 전"
                    : primaryPlatform.followersLabel
                }
                description={primaryPlatform.performanceLabel}
                metricTrust={primaryPlatform.metricTrust}
              />
            </div>
          ) : isPrivateRegisteredProfile ? (
            <p className="mt-1.5 text-[12px] font-bold text-neutral-500">
              플랫폼 인증 전
            </p>
          ) : null}
        </div>
        <InfluencerInterestButton
          profile={profile}
          isSaved={isSaved}
          isSaving={isSaving}
          isReady={isReady}
          onToggle={onToggleSaved}
        />
      </div>
      {recentPosts.length > 0 ? (
        <div className="rounded-[8px] border border-neutral-200 bg-[#fbfcfa]">
          <button
            type="button"
            onClick={() => setRecentPostsOpen((current) => !current)}
            className="flex min-h-10 w-full items-center justify-between gap-3 px-3 text-left text-[12px] font-extrabold text-neutral-800"
            aria-expanded={recentPostsOpen}
          >
            <span>최근 확인 게시물 {recentPosts.length}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition ${recentPostsOpen ? "rotate-180" : ""}`}
            />
          </button>
          {recentPostsOpen ? (
            <NaverRecentPostList posts={recentPosts} className="border-t border-neutral-200 px-3 py-2" />
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2">
        {canPropose ? (
          <button
            type="button"
            onClick={() => onContact(profile)}
            className="yl-primary-action inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] font-extrabold transition"
          >
            <Send className="h-4 w-4" />
            1:1 계약 제안
          </button>
        ) : profileActionHref ? (
          <a
            href={profileActionHref}
            target={primaryChannelUrl ? "_blank" : undefined}
            rel={primaryChannelUrl ? "noreferrer" : undefined}
            aria-label={`${profile.displayName} ${
              primaryChannelUrl ? "공개 채널 보기" : "프로필 보기"
            }`}
            title={primaryChannelUrl ? "공개 채널 보기" : "프로필 보기"}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
          >
            <ExternalLink className="h-4 w-4" />
            {primaryChannelUrl ? "채널 보기" : "프로필 보기"}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-10 w-full items-center justify-center rounded-[8px] border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-extrabold text-neutral-400"
          >
            프로필 준비 전
          </span>
        )}
      </div>
    </article>
  );
}

function InfluencerPreviewCard({
  profile,
  top,
  left,
  onPreviewEnter,
  onPreviewEnd,
}: {
  profile: MarketplaceInfluencerProfile;
  top: number;
  left: number;
  onPreviewEnter: () => void;
  onPreviewEnd: () => void;
}) {
  const categoryLabel = getCategoryLabels(profile.categories, 4).join(" · ");
  const countryLabel = formatMarketplaceCountries(
    profile.audienceCountries,
    "국가 미확인",
  );
  const avatarUrl = getMarketplaceInfluencerAvatarUrl(profile);
  const recentPosts = normalizeNaverBlogRecentPosts(profile.recentPosts, 3);
  const isPrivateRegisteredProfile = isAuthenticatedAdvertiserOnlyInfluencer(profile);

  return (
    <aside
      data-marketplace-preview-card="true"
      className="fixed z-50 hidden w-[384px] rounded-[10px] border border-[#cfd8cf] bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.18)] lg:block"
      style={{ top, left }}
      onMouseEnter={onPreviewEnter}
      onMouseLeave={onPreviewEnd}
      onFocus={onPreviewEnter}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onPreviewEnd();
      }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <OptionalAvatarImage
          src={avatarUrl}
          alt={profile.displayName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[16px] font-extrabold text-neutral-950">
              {profile.displayName}
            </h3>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-[12px]">
        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-2">
          <span className="font-extrabold text-neutral-400">카테고리</span>
          <span className="truncate font-extrabold text-neutral-800">
            {categoryLabel ||
              (isRegisteredMarketplaceInfluencer(profile)
                ? "미설정"
                : "미확인")}
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
            description={platform.performanceLabel}
            metricTrust={platform.metricTrust}
          />
        ))}
        {profile.platforms.length === 0 && isPrivateRegisteredProfile ? (
          <span className="text-[12px] font-bold text-neutral-500">플랫폼 인증 전</span>
        ) : null}
      </div>
      {recentPosts.length > 0 ? (
        <div className="mt-3 border-t border-neutral-200 pt-3">
          <p className="text-[11px] font-extrabold text-neutral-500">최근 확인 게시물</p>
          <NaverRecentPostList posts={recentPosts} className="mt-1.5" />
        </div>
      ) : null}
    </aside>
  );
}

function NaverRecentPostList({
  posts,
  className = "",
}: {
  posts: NonNullable<MarketplaceInfluencerProfile["recentPosts"]>;
  className?: string;
}) {
  const safePosts = normalizeNaverBlogRecentPosts(posts, 3);
  if (safePosts.length === 0) return null;

  return (
    <div className={`grid gap-1 ${className}`.trim()}>
      {safePosts.map((post) => (
        <a
          key={post.url}
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="group/post grid min-h-8 grid-cols-[minmax(0,1fr)_72px] items-center gap-2 rounded-[6px] px-1.5 text-[12px] transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600"
          aria-label={`${post.title} 게시물 새 탭에서 보기`}
          title={post.title}
        >
          <span className="truncate font-bold text-neutral-800 group-hover/post:text-blue-700">
            {post.title}
          </span>
          <time
            dateTime={post.publishedDate}
            className="text-right font-semibold tabular-nums text-neutral-500"
          >
            {post.publishedDate.replaceAll("-", ".")}
          </time>
        </a>
      ))}
    </div>
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

function isAuthenticatedAdvertiserOnlyInfluencer(
  profile: MarketplaceInfluencerProfile,
) {
  return (
    profile.registrationVisibility === "authenticated_advertisers" &&
    !profile.publicProfilePublished
  );
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
  const [initialDraft] = useState(() =>
    readContactDraft({
      role: "advertiser",
      targetHandle: profile.handle,
      parseForm: parseInfluencerContactDraft,
    }),
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [verificationPath, setVerificationPath] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftRestored, setDraftRestored] = useState(Boolean(initialDraft));
  const [form, setForm] = useState<InfluencerContactForm>(
    () =>
      initialDraft ?? {
        brandName: "",
        brandIntro: "",
        proposalType: profile.collaborationTypes[0] ?? "sponsored_post",
        proposalSummary: "",
      },
  );
  const loginNext = encodeURIComponent(
    canOpenInfluencerPublicProfile(profile)
      ? getInfluencerProfilePath(profile)
      : "/advertiser/discover",
  );
  const canSubmit =
    form.brandName.trim().length > 0 &&
    form.brandIntro.trim().length > 0 &&
    form.proposalSummary.trim().length > 0;
  const persistDraft = useCallback(() => {
    saveContactDraft({
      role: "advertiser",
      targetHandle: profile.handle,
      form: {
        brandName: form.brandName.slice(0, 80),
        brandIntro: form.brandIntro.slice(0, 1000),
        proposalType: form.proposalType,
        proposalSummary: form.proposalSummary.slice(0, 1500),
      },
    });
  }, [form, profile.handle]);
  const handleClose = useCallback(() => {
    clearContactDraft("advertiser", profile.handle);
    onClose();
  }, [onClose, profile.handle]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(undefined);
    setVerificationPath(undefined);

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

      const data = (await response.json().catch(() => ({}))) as
        VerificationRequiredApiError;

      if (response.status === 401) {
        persistDraft();
        setError("광고주 로그인 후 1:1 계약 제안을 저장할 수 있습니다.");
        return;
      }
      if (
        response.status === 403 &&
        isVerificationRequiredError(
          data,
          "advertiser_business_verification_required",
        )
      ) {
        persistDraft();
        setError(
          data.error ??
            "1:1 계약 제안은 첫 제안부터 사업자 인증이 필요합니다.",
        );
        setVerificationPath(data.next_path ?? "/advertiser/verification");
        return;
      }
      if (response.status === 403) {
        persistDraft();
        setError("광고주 로그인 후 1:1 계약 제안을 저장할 수 있습니다.");
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "1:1 계약 제안을 저장하지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      clearContactDraft("advertiser", profile.handle);
      setDraftRestored(false);
      setSubmitted(true);
    } catch {
      setError("1:1 계약 제안을 저장하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogFrame
      title={`${profile.displayName}에게 1:1 계약 제안`}
      onClose={handleClose}
    >
      {submitted ? (
        <ProposalSubmitted
          title="1:1 계약 제안이 저장됐습니다"
          body="브랜드 소개와 계약 조건이 메시지함에 저장됐습니다."
          actionHref="/advertiser/messages"
          actionLabel="메시지함 보기"
          onClose={handleClose}
        />
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          {draftRestored ? (
            <div
              role="status"
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-800"
            >
              저장된 제안 내용을 불러왔습니다. 확인 후 직접 저장해 주세요.
            </div>
          ) : null}
          <FormField label="브랜드명">
            <input
              required
              maxLength={80}
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
              maxLength={1000}
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
              maxLength={1500}
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
              {verificationPath ? (
                <Link
                  to={verificationPath}
                  onClick={persistDraft}
                  className="yl-primary-action mt-2 inline-flex h-9 items-center rounded-md px-3 text-[12px] font-semibold"
                >
                  사업자 인증하기
                </Link>
              ) : error.includes("로그인") ? (
                <Link
                  to={`/login/advertiser?next=${loginNext}`}
                  onClick={persistDraft}
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
  const [initialDraft] = useState(() =>
    readContactDraft({
      role: "influencer",
      targetHandle: brand.handle,
      parseForm: parseBrandContactDraft,
    }),
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftRestored, setDraftRestored] = useState(Boolean(initialDraft));
  const [form, setForm] = useState<BrandContactForm>(
    () =>
      initialDraft ?? {
        creatorName: "",
        channelIntro: "",
        proposalType: brand.proposalTypes[0] ?? "sponsored_post",
        proposalSummary: "",
      },
  );
  const loginNext = encodeURIComponent(getBrandProfilePath(brand));
  const canSubmit =
    form.creatorName.trim().length > 0 &&
    form.channelIntro.trim().length > 0 &&
    form.proposalSummary.trim().length > 0;
  const persistDraft = useCallback(() => {
    saveContactDraft({
      role: "influencer",
      targetHandle: brand.handle,
      form: {
        creatorName: form.creatorName.slice(0, 80),
        channelIntro: form.channelIntro.slice(0, 1000),
        proposalType: form.proposalType,
        proposalSummary: form.proposalSummary.slice(0, 1500),
      },
    });
  }, [brand.handle, form]);
  const handleClose = useCallback(() => {
    clearContactDraft("influencer", brand.handle);
    onClose();
  }, [brand.handle, onClose]);

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

      if (response.status === 401 || response.status === 403) {
        persistDraft();
        setError("인플루언서 로그인 후 역제안을 저장할 수 있습니다.");
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "역제안을 저장하지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      clearContactDraft("influencer", brand.handle);
      setDraftRestored(false);
      setSubmitted(true);
    } catch {
      setError("역제안을 저장하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogFrame title={`${brand.displayName}에 제안`} onClose={handleClose}>
      {submitted ? (
        <ProposalSubmitted
          title="역제안이 저장됐습니다"
          body="내 채널 소개와 광고 형태가 저장됐습니다. 이후 상태는 메시지함에서 확인할 수 있습니다."
          actionHref="/influencer/messages"
          actionLabel="메시지함 보기"
          onClose={handleClose}
        />
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          {draftRestored ? (
            <div
              role="status"
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-800"
            >
              저장된 제안 내용을 불러왔습니다. 확인 후 직접 저장해 주세요.
            </div>
          ) : null}
          <FormField label="활동명">
            <input
              required
              maxLength={80}
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
              maxLength={1000}
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
              maxLength={1500}
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
                  onClick={persistDraft}
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
        maxLength={120}
        className="h-9 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-[12px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950"
      />
    </div>
  );
}

function InfluencerDiscoveryControls({
  count,
  query,
  onQueryChange,
  savedOnly,
  onSavedOnlyChange,
  sort,
  onSortChange,
  platformFilter,
  onPlatformChange,
  categoryFilters,
  onCategoryChange,
  countryFilters,
  onCountryChange,
  open,
  activeFilterCount,
  onClearFilters,
  onClose,
  onToggle,
}: {
  count: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  savedOnly: boolean;
  onSavedOnlyChange: (value: boolean) => void;
  sort: InfluencerSortValue;
  onSortChange: (value: InfluencerSortValue) => void;
  platformFilter: PlatformFilter;
  onPlatformChange: (value: PlatformFilter) => void;
  categoryFilters: string[];
  onCategoryChange: (value: string[]) => void;
  countryFilters: MarketplaceCountryCode[];
  onCountryChange: (value: MarketplaceCountryCode[]) => void;
  open: boolean;
  activeFilterCount: number;
  onClearFilters: () => void;
  onClose: () => void;
  onToggle: () => void;
}) {
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const controlsId = "advertiser-influencer-filters";
  const filterButtonClassName = `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border px-3 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
    open
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
  }`;

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      window.requestAnimationFrame(() => filterButtonRef.current?.focus());
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const renderFilterContents = () => (
    <InfluencerFilterPanelContents
      platformFilter={platformFilter}
      onPlatformChange={onPlatformChange}
      categoryFilters={categoryFilters}
      onCategoryChange={onCategoryChange}
      countryFilters={countryFilters}
      onCountryChange={onCountryChange}
    />
  );

  return (
    <section
      data-product-tour="advertiser-discovery-overview"
      className="relative shrink-0 border-b border-[#d9e0d9] bg-white"
    >
      <div className="px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold text-neutral-950">
              인플루언서 목록
            </p>
            <p
              className="mt-0.5 text-[12px] font-bold text-neutral-500 tabular-nums"
              data-discovery-total-count={count ?? "loading"}
              aria-live="polite"
            >
              {count === null ? "전체 인원 확인 중" : `총 ${count.toLocaleString()}명`}
            </p>
          </div>
          <InfluencerInterestScope
            value={savedOnly}
            onChange={onSavedOnlyChange}
          />
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-center">
          <SearchBox
            value={query}
            onChange={onQueryChange}
            label="인플루언서 검색"
            placeholder="이름, 핸들, 카테고리 검색"
          />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-end">
            <InfluencerSortSelect
              value={sort}
              onChange={onSortChange}
              onOpen={onClose}
            />
            <button
              ref={filterButtonRef}
              type="button"
              data-product-tour="advertiser-discovery-filters"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={`${controlsId}-desktop ${controlsId}-mobile`}
              className={filterButtonClassName}
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
              <span>필터</span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] text-white">
                  {activeFilterCount}
                </span>
              ) : null}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                strokeWidth={2}
              />
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div
          id={`${controlsId}-desktop`}
          className="hidden border-t border-neutral-200 bg-[#f7f8f4] px-4 py-3 lg:block"
        >
          <div className="w-full">
            {activeFilterCount > 0 ? (
              <div className="mb-2 flex min-h-8 items-center justify-end">
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex h-8 items-center rounded-[8px] px-2.5 text-[11px] font-extrabold text-neutral-500 transition hover:bg-white hover:text-neutral-950"
                >
                  필터 초기화
                </button>
              </div>
            ) : null}
            {renderFilterContents()}
          </div>
        </div>
      ) : null}

      <ResponsiveFilterPanel
        id={`${controlsId}-mobile`}
        open={open}
        mobileOnly
        title="인플루언서 필터"
        activeCount={activeFilterCount}
        onClose={onClose}
        onClear={activeFilterCount > 0 ? onClearFilters : undefined}
        closeLabel="결과 보기"
      >
        {renderFilterContents()}
      </ResponsiveFilterPanel>
    </section>
  );
}

function InfluencerInterestScope({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="인플루언서 목록 범위"
      data-product-tour="advertiser-discovery-interest"
      className="grid w-full shrink-0 grid-cols-2 rounded-[10px] bg-neutral-100 p-1 sm:w-[190px]"
    >
      <button
        type="button"
        aria-pressed={!value}
        onClick={() => onChange(false)}
        className={`h-9 rounded-[8px] px-3 text-[12px] font-extrabold transition ${
          !value
            ? "bg-white text-neutral-950 shadow-sm"
            : "text-neutral-500 hover:text-neutral-800"
        }`}
      >
        전체
      </button>
      <button
        type="button"
        aria-pressed={value}
        onClick={() => onChange(true)}
        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] px-3 text-[12px] font-extrabold transition ${
          value
            ? "bg-white text-blue-700 shadow-sm"
            : "text-neutral-500 hover:text-neutral-800"
        }`}
      >
        <Star
          className={`h-3.5 w-3.5 ${value ? "fill-current" : ""}`}
          strokeWidth={2.2}
          aria-hidden="true"
        />
        관심
      </button>
    </div>
  );
}

function InfluencerFilterPanelContents({
  platformFilter,
  onPlatformChange,
  categoryFilters,
  onCategoryChange,
  countryFilters,
  onCountryChange,
}: {
  platformFilter: PlatformFilter;
  onPlatformChange: (value: PlatformFilter) => void;
  categoryFilters: string[];
  onCategoryChange: (value: string[]) => void;
  countryFilters: MarketplaceCountryCode[];
  onCountryChange: (value: MarketplaceCountryCode[]) => void;
}) {
  return (
    <div className="grid overflow-hidden rounded-[12px] border border-neutral-200 bg-white lg:grid-cols-[minmax(220px,0.72fr)_minmax(260px,1fr)_minmax(260px,1fr)]">
      <section className="border-b border-neutral-200 p-3 lg:border-b-0 lg:border-r">
        <p className="text-[12px] font-extrabold text-neutral-950">플랫폼</p>
        <div className="mt-2 grid grid-cols-2 gap-1" aria-label="플랫폼 필터">
          {platformFilterOptions.map((platform) => {
            const selected = platformFilter === platform;
            const label =
              platform === "all" ? "전체" : getPlatformDisplayName(platform);
            return (
              <button
                key={platform}
                type="button"
                aria-pressed={selected}
                onClick={() => onPlatformChange(platform)}
                className={`flex h-9 min-w-0 items-center gap-2 rounded-[8px] px-2.5 text-left text-[12px] font-extrabold transition ${
                  selected
                    ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
                }`}
              >
                {platform === "all" ? (
                  <span
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[9px]"
                    aria-hidden="true"
                  >
                    ALL
                  </span>
                ) : (
                  <PlatformBrandMark platform={platform} size="xs" />
                )}
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <DirectMultiFilterSection
        label="카테고리"
        searchPlaceholder="카테고리 검색"
        options={influencerCategoryOptions.map((category) => ({
          value: category,
          label: getCategoryLabel(category),
        }))}
        values={categoryFilters}
        onChange={onCategoryChange}
        className="border-b border-neutral-200 lg:border-b-0 lg:border-r"
      />
      <DirectMultiFilterSection
        label="국가"
        searchPlaceholder="국가 검색"
        options={marketplaceCountryOptions.map((country) => ({
          value: country,
          label: getMarketplaceCountryLabel(country),
        }))}
        values={countryFilters}
        onChange={onCountryChange}
      />
    </div>
  );
}

function DirectMultiFilterSection<T extends string>({
  label,
  searchPlaceholder,
  options,
  values,
  onChange,
  className = "",
}: {
  label: string;
  searchPlaceholder: string;
  options: Array<FilterListOption<T>>;
  values: T[];
  onChange: (value: T[]) => void;
  className?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const selected = new Set(values);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ko");
  const visibleOptions = normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${String(option.value)}`
          .toLocaleLowerCase("ko")
          .includes(normalizedQuery),
      )
    : options;

  return (
    <section className={`min-w-0 p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-extrabold text-neutral-950">{label}</p>
        {values.length > 0 ? (
          <span className="text-[11px] font-extrabold text-blue-700">
            {values.length}개 선택
          </span>
        ) : null}
      </div>
      <label className="mt-2 flex h-9 items-center gap-2 rounded-[8px] border border-neutral-200 bg-neutral-50 px-2.5 focus-within:border-blue-300 focus-within:bg-white">
        <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-neutral-900 outline-none placeholder:text-neutral-400"
        />
      </label>
      <div
        className="mt-1.5 overflow-visible lg:max-h-40 lg:overflow-y-auto"
        aria-label={`${label} 선택`}
      >
        {!normalizedQuery ? (
          <DirectFilterOptionButton
            label="전체"
            selected={values.length === 0}
            onClick={() => onChange([])}
          />
        ) : null}
        {visibleOptions.map((option) => (
          <DirectFilterOptionButton
            key={option.value}
            label={option.label}
            selected={selected.has(option.value)}
            onClick={() =>
              onChange(
                selected.has(option.value)
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value],
              )
            }
          />
        ))}
        {visibleOptions.length === 0 ? (
          <p className="px-2.5 py-4 text-center text-[12px] font-bold text-neutral-400">
            검색 결과 없음
          </p>
        ) : null}
      </div>
    </section>
  );
}

function DirectFilterOptionButton({
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
          ? "bg-blue-50 text-blue-700"
          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
      }`}
    >
      <span className="truncate">{label}</span>
      {selected ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" strokeWidth={2.4} />
      ) : null}
    </button>
  );
}

function DiscoveryControls({
  title,
  count,
  summary,
  open,
  activeCount,
  controlsId,
  filterColumns = 4,
  toolbar,
  onToggle,
  children,
}: {
  title: string;
  count: number | null;
  summary: string;
  open: boolean;
  activeCount: number;
  controlsId: string;
  filterColumns?: 4 | 5;
  toolbar?: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      onToggle();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onToggle();
      window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onToggle, open]);

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    if (!open) restoreFocusRef.current = event.currentTarget;
    onToggle();
  };

  return (
    <section
      ref={rootRef}
      className="relative overflow-visible border-b border-[#d9e0d9] bg-white"
    >
      <div className="flex min-h-12 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2">
        <div className="flex w-full min-w-0 items-start justify-between gap-3 sm:block sm:flex-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-extrabold leading-tight text-neutral-950 sm:text-[13px]">
              {title}
            </p>
            <p
              className="mt-0.5 truncate text-[11px] font-bold leading-tight text-neutral-500"
              data-discovery-total-count={count ?? "loading"}
              aria-live="polite"
            >
              {count === null ? "전체 건수 집계 중" : `총 ${count.toLocaleString()}건`} ·{" "}
              {summary}
            </p>
          </div>
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={handleToggle}
              aria-expanded={open}
              aria-controls={controlsId}
              className={`${filterButtonClassName} sm:hidden`}
            >
              {filterButtonContent}
            </button>
          </div>
        </div>
        {toolbar ? (
          <div className="w-full min-w-0 sm:hidden">{toolbar}</div>
        ) : null}
        <div className="hidden min-w-0 shrink-0 items-center gap-2 sm:flex">
          {toolbar}
          <button
            type="button"
            onClick={handleToggle}
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
          className={`absolute left-3 right-3 top-[calc(100%+8px)] z-[60] rounded-[14px] border border-neutral-200 bg-white p-3 shadow-[0_22px_60px_rgba(15,23,42,0.18)] sm:left-auto sm:right-4 ${
            filterColumns === 5
              ? "sm:w-[min(720px,calc(100vw-48px))] lg:w-[min(1040px,calc(100vw-48px))]"
              : "sm:w-[min(720px,calc(100vw-48px))] lg:w-[min(900px,calc(100vw-48px))]"
          }`}
        >
          <div
            className={`grid gap-2 sm:grid-cols-2 ${
              filterColumns === 5
                ? "lg:grid-cols-[minmax(210px,1.15fr)_minmax(140px,0.72fr)_minmax(140px,0.72fr)_minmax(180px,0.88fr)_minmax(150px,0.76fr)]"
                : "lg:grid-cols-[minmax(220px,1.1fr)_minmax(150px,0.72fr)_minmax(180px,0.82fr)_minmax(150px,0.72fr)]"
            }`}
          >
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
  searchPlaceholder,
  listMaxHeightClassName,
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
  searchPlaceholder?: string;
  listMaxHeightClassName?: string;
}) {
  const open = openId === id;
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const selected = new Set<T>(selectedValues);
  const isClearSelected = Boolean(onClear) && selectedValues.length === 0;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("ko");
  const visibleOptions = normalizedSearchQuery
    ? options.filter((option) =>
        `${option.label} ${String(option.value)}`
          .toLocaleLowerCase("ko")
          .includes(normalizedSearchQuery),
      )
    : options;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      onOpenChange(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onOpenChange(null);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open || !searchPlaceholder) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, searchPlaceholder]);

  return (
    <section ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setSearchQuery("");
          onOpenChange(open ? null : id);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-[10px] border bg-white px-3 text-left shadow-[0_1px_0_rgba(15,23,42,0.03)] transition ${
          open
            ? "border-neutral-300 shadow-[0_0_0_3px_rgba(15,23,42,0.06)]"
            : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
        }`}
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
        <div
          className="absolute left-0 right-0 top-full z-[70] mt-2 overflow-hidden rounded-[12px] border border-neutral-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
        >
          {searchPlaceholder ? (
            <label className="mb-1.5 flex h-9 items-center gap-2 rounded-[8px] border border-neutral-200 bg-neutral-50 px-2.5 focus-within:border-neutral-300 focus-within:bg-white">
              <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" strokeWidth={2} />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-neutral-900 outline-none placeholder:text-neutral-400"
              />
            </label>
          ) : null}
          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-label={label}
            aria-multiselectable={closeOnSelect ? undefined : true}
            className={`${
              listMaxHeightClassName ??
              (searchPlaceholder ? "max-h-48" : "max-h-56")
            } overflow-y-auto`}
          >
            {onClear && !normalizedSearchQuery ? (
              <FilterListOptionButton
                label="전체"
                selected={isClearSelected}
                onClick={() => {
                  onClear();
                  if (closeOnSelect) onOpenChange(null);
                }}
              />
            ) : null}
            {visibleOptions.map((option) => (
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
            {visibleOptions.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-[12px] font-bold text-neutral-400">
                검색 결과 없음
              </p>
            ) : null}
          </div>
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
      role="option"
      aria-selected={selected}
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
  onOpen,
}: {
  value: InfluencerSortValue;
  onChange: (value: InfluencerSortValue) => void;
  onOpen?: () => void;
}) {
  const selectedLabel =
    influencerSortOptions.find((option) => option.value === value)?.label ?? "이름순";
  const compactLabel =
    value === "audience_desc"
      ? "채널 규모 큰순"
      : value === "audience_asc"
        ? "채널 규모 작은순"
        : selectedLabel;

  return (
    <FilterSelectControl
      value={value}
      options={influencerSortOptions}
      onChange={(nextValue) => onChange(nextValue as InfluencerSortValue)}
      onOpen={onOpen}
      ariaLabel="인플루언서 정렬"
      leadingIcon={
        <ArrowUpDown
          className="h-3.5 w-3.5 text-neutral-500"
          strokeWidth={2}
        />
      }
      triggerLabel={
        <>
          <span className="sm:hidden">{compactLabel}</span>
          <span className="hidden sm:inline">{selectedLabel}</span>
        </>
      }
      className="w-full sm:w-[190px] sm:shrink-0"
      triggerClassName="h-9 text-[12px]"
      menuClassName="sm:min-w-[190px]"
    />
  );
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
  description,
  metricTrust,
}: {
  key?: string;
  platform: InfluencerPlatform;
  label: string;
  value?: string;
  description?: string;
  metricTrust?: "self_reported";
}) {
  const hasMetric = Boolean(value);
  const metricValue = hasMetric ? formatDiscoveryAudienceMetric(value) : "";
  const accessibleLabel = [label, description, metricValue].filter(Boolean).join(" ");

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 text-[12px] font-extrabold ${
        hasMetric
          ? "h-7 text-neutral-900"
          : "h-6 text-neutral-800"
      }`}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      <PlatformBrandMark platform={platform} size={hasMetric ? "xs" : "sm"} />
      {metricValue ? (
        <span className="truncate text-neutral-950">{metricValue}</span>
      ) : null}
      <SelfReportedMetricBadge visible={metricTrust === "self_reported"} />
    </span>
  );
}

function SelfReportedMetricBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-neutral-100 px-1.5 text-[10px] font-bold text-neutral-600">
      자가신고
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

function OptionalAvatarImage({
  src,
  alt,
}: {
  src?: string;
  alt: string;
}) {
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  if (!src || failedImageSrc === src) return null;

  return (
    <span className="flex h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-100">
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setFailedImageSrc(src)}
      />
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

function MarketplaceErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="flex min-h-[240px] flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-rose-50 text-rose-700">
        <Search className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-[17px] font-semibold text-neutral-950">{message}</h2>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-[13px] font-semibold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50"
      >
        다시 시도
      </button>
    </section>
  );
}
