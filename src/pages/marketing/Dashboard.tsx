import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  ChevronDown,
  CheckCircle2,
  Clock3,
  CopyCheck,
  ExternalLink,
  FileText,
  KeyRound,
  LogOut,
  Mail,
  Megaphone,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Contract,
  ContractPlatform,
  ContractStatus,
  useAppStore,
} from "../../store";
import {
  getVerificationRejectionGuidance,
  verificationStatusTone,
  type InfluencerPlatform,
  type VerificationRequest,
  type VerificationStatus,
} from "../../domain/verification";
import {
  formatContractTitleForDisplay,
  formatMoneyLabel,
  formatPublicContactValue,
  removeInternalTestLabel,
} from "../../domain/display";
import {
  clearVerificationSummaryCache,
  useVerificationSummary,
} from "../../hooks/useVerificationSummary";
import { useMarketplaceMessageSummary } from "../../hooks/useMarketplaceMessageSummary";
import {
  clearAdvertiserSessionCache,
  getAdvertiserSessionCache,
} from "../../domain/advertiserSessionCache";
import { clearAdvertiserDashboardBootstrapPreload } from "../../domain/advertiserDashboardPreload";
import { PRODUCT_NAME } from "../../domain/brand";
import { LEGAL_CONTACT_EMAIL } from "../../domain/legalEntity";
import { apiFetch } from "../../domain/api";
import {
  isFastLoginTransitionPending,
  subscribeFastLoginTransition,
  waitForFastLoginTransition,
} from "../../domain/fastLoginTransition";
import { ContractFirstExperienceDialog } from "../../components/ScreenHelp";
import { DashboardSurfaceSwitch } from "../../components/DashboardSurfaceSwitch";
import { CONTRACT_FIRST_EXPERIENCE_CONTENT } from "../../domain/screenHelp";
import {
  compareChannelAudienceValues,
  findInfluencerProfileByDisplayName,
  getChannelAudienceSortValue,
  getInfluencerProfilePath,
  platformLabels,
  type MarketplaceBrandCampaign,
  type MarketplaceCampaignStatus,
  type MarketplaceInfluencerProfile,
} from "../../domain/marketplace";
import {
  type MarketplaceMessageThread,
  type MarketplaceMessagesResponse,
  type MarketplaceProposalStatus,
} from "../../domain/marketplaceInbox";
import { getMarketplaceInfluencerAvatarUrlFromHref } from "../../domain/marketplaceAvatars";

type PlatformFilter = "ALL" | ContractPlatform;
type ContractTypeFilter = "ALL" | Contract["type"];
type AmountFilter = "ALL" | "FIXED" | "COMMISSION";
type ActualAmountKind = Exclude<AmountFilter, "ALL">;
type DetailStatusFilter = "ALL" | ContractStatus;
type CampaignParticipantFilter = "ALL" | "ONE" | "TWO_TO_FIVE" | "SIX_PLUS";
type CampaignLifecycle = "RECRUITING" | "IN_PROGRESS" | "ENDED";
type CampaignStatusAction = Extract<MarketplaceCampaignStatus, "open" | "closed" | "ended">;
type DetailProgressFilter = "ALL" | "UPLOAD_DONE" | "SIGNED_DONE" | "SIGN_PENDING";
type DetailDeadlineFilter = "ALL" | "OVERDUE" | "THIS_WEEK" | "LATER" | "NO_DATE";
type DetailPostLinkFilter = "ALL" | "SUBMITTED" | "NOT_SUBMITTED";
type ApplicantPlatformFilter = "ALL" | InfluencerPlatform;
type ApplicantStatusFilter = "ALL" | MarketplaceProposalStatus;
type ApplicantSortValue =
  | "audience_desc"
  | "audience_asc"
  | "recent"
  | "name_asc";
type SortKey =
  | "updated"
  | "platform"
  | "brand"
  | "type"
  | "title"
  | "amount"
  | "participants"
  | "deadline"
  | "status";
type SortDirection = "asc" | "desc";
type ContractSort = {
  key: SortKey;
  direction: SortDirection;
};
type FilterOption = {
  value: string;
  label: string;
};
type AppliedFilter = {
  id: string;
  label: string;
  onRemove: () => void;
};
type DashboardDateParts = {
  label: string;
  dday?: string;
  dateLabel?: string;
  isUrgent?: boolean;
};
type CampaignGroup = {
  key: string;
  campaignId?: string;
  name: string;
  contracts: Contract[];
  applicants: MarketplaceMessageThread[];
  marketplaceCampaign?: MarketplaceBrandCampaign;
  lifecycle: CampaignLifecycle;
  participantCount: number;
  acceptedParticipantCount: number;
  applicantCount: number;
  completedCount: number;
  latestUpdatedAt: string;
  platforms: ContractPlatform[];
  brands: string[];
};
type CampaignAlertTone = "amber" | "blue" | "rose" | "emerald" | "neutral";
type CampaignAlert = {
  id: string;
  campaignKey: string;
  campaignName: string;
  label: string;
  detail: string;
  tone: CampaignAlertTone;
  priority: number;
};
type DashboardActionMetric = {
  id: string;
  label: string;
  value: number;
  helper: string;
  tone: CampaignAlertTone;
};
type CampaignActivity = {
  id: string;
  createdAt: string;
  actor: string;
  title: string;
  description: string;
};
type MarketplaceDashboardState = {
  status: "loading" | "ready" | "error";
  campaigns: MarketplaceBrandCampaign[];
  threads: MarketplaceMessageThread[];
  error?: string;
};
type CampaignStatusUpdateResponse = {
  campaign?: MarketplaceBrandCampaign;
  campaigns?: MarketplaceBrandCampaign[];
  error?: string;
};
type AdvertiserAccountSummary = {
  name: string;
  meta?: string;
  email?: string;
  businessNumber?: string;
};
type DashboardSurface = "contracts" | "campaigns";

interface DashboardProps {
  surface?: DashboardSurface;
}

const STATUS_ORDER: ContractStatus[] = [
  "DRAFT",
  "REVIEWING",
  "NEGOTIATING",
  "APPROVED",
  "SIGNED",
  "CLOSED",
];

const PLATFORM_FILTERS: PlatformFilter[] = [
  "ALL",
  "INSTAGRAM",
  "YOUTUBE",
  "TIKTOK",
  "NAVER_BLOG",
  "OTHER",
];

const CONTRACT_TYPE_FILTERS: ContractTypeFilter[] = [
  "ALL",
  "협찬",
  "PPL",
  "공동구매",
];

const DETAIL_STATUS_FILTERS: DetailStatusFilter[] = [
  "ALL",
  ...STATUS_ORDER,
];

const AMOUNT_FILTERS: AmountFilter[] = ["ALL", "FIXED", "COMMISSION"];

const CAMPAIGN_PARTICIPANT_OPTIONS: Array<{
  value: CampaignParticipantFilter;
  label: string;
}> = [
  { value: "ALL", label: "전체" },
  { value: "ONE", label: "1명" },
  { value: "TWO_TO_FIVE", label: "2-5명" },
  { value: "SIX_PLUS", label: "6명 이상" },
];

const CAMPAIGN_LIFECYCLE_TABS: Array<{
  value: CampaignLifecycle;
  label: string;
}> = [
  {
    value: "RECRUITING",
    label: "모집중",
  },
  {
    value: "IN_PROGRESS",
    label: "진행중",
  },
  {
    value: "ENDED",
    label: "종료",
  },
];

const APPLICANT_STATUS_META: Record<
  MarketplaceProposalStatus,
  { label: string; className: string }
> = {
  submitted: {
    label: "지원 접수",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  reviewed: {
    label: "검토 중",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  converted_to_contract: {
    label: "수락 완료",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  closed: {
    label: "종료",
    className: "border-neutral-200 bg-neutral-100 text-neutral-600",
  },
};

const APPLICANT_PLATFORM_FILTERS: ApplicantPlatformFilter[] = [
  "ALL",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const APPLICANT_STATUS_FILTERS: ApplicantStatusFilter[] = [
  "ALL",
  "submitted",
  "reviewed",
  "converted_to_contract",
  "closed",
];

const APPLICANT_SORT_OPTIONS: Array<{
  value: ApplicantSortValue;
  label: string;
}> = [
  { value: "audience_desc", label: "구독자·팔로워 많은순" },
  { value: "audience_asc", label: "구독자·팔로워 적은순" },
  { value: "recent", label: "최근 지원순" },
  { value: "name_asc", label: "이름순" },
];

const DETAIL_PROGRESS_OPTIONS: Array<{
  value: DetailProgressFilter;
  label: string;
}> = [
  { value: "ALL", label: "전체" },
  { value: "SIGN_PENDING", label: "서명대기" },
  { value: "SIGNED_DONE", label: "전자서명 완료" },
  { value: "UPLOAD_DONE", label: "컨텐츠 제출" },
];

const DETAIL_DEADLINE_OPTIONS: Array<{
  value: DetailDeadlineFilter;
  label: string;
}> = [
  { value: "ALL", label: "전체" },
  { value: "OVERDUE", label: "마감 지남" },
  { value: "THIS_WEEK", label: "7일 이내" },
  { value: "LATER", label: "이후" },
  { value: "NO_DATE", label: "마감 없음" },
];

const DETAIL_POST_LINK_OPTIONS: Array<{
  value: DetailPostLinkFilter;
  label: string;
}> = [
  { value: "ALL", label: "전체" },
  { value: "SUBMITTED", label: "컨텐츠 제출" },
  { value: "NOT_SUBMITTED", label: "컨텐츠 미제출" },
];

const STATUS_META: Record<
  ContractStatus,
  {
    label: string;
    shortLabel: string;
    helper: string;
    tone: string;
    badge: string;
    icon: React.ReactNode;
  }
> = {
  DRAFT: {
    label: "초안",
    shortLabel: "초안",
    helper: "공유 전 작성 중",
    tone: "text-neutral-500",
    badge: "border-neutral-200 bg-white text-neutral-600",
    icon: <FileText className="h-4 w-4" strokeWidth={1.8} />,
  },
  REVIEWING: {
    label: "검토 대기",
    shortLabel: "검토",
    helper: "인플루언서 검토 대기",
    tone: "text-sky-700",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    icon: <Clock3 className="h-4 w-4" strokeWidth={1.8} />,
  },
  NEGOTIATING: {
    label: "수정 요청",
    shortLabel: "수정",
    helper: "광고주 확인 필요",
    tone: "text-amber-600",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    icon: <AlertCircle className="h-4 w-4" strokeWidth={1.8} />,
  },
  APPROVED: {
    label: "서명 대기",
    shortLabel: "서명",
    helper: "최종본 승인 완료",
    tone: "text-sky-700",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    icon: <PenLine className="h-4 w-4" strokeWidth={1.8} />,
  },
  SIGNED: {
    label: "서명 완료",
    shortLabel: "완료",
    helper: "전자서명 완료 후 컨텐츠 제출 대기",
    tone: "text-neutral-900",
    badge: "border-neutral-300 bg-neutral-100 text-neutral-900",
    icon: <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />,
  },
  CLOSED: {
    label: "계약 마감",
    shortLabel: "마감",
    helper: "컨텐츠 확인 및 검수 완료",
    tone: "text-emerald-700",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <CopyCheck className="h-4 w-4" strokeWidth={1.8} />,
  },
};

const PLATFORM_META: Record<
  ContractPlatform,
  {
    label: string;
    shortLabel: string;
    className: string;
    mark: React.ReactNode;
  }
> = {
  NAVER_BLOG: {
    label: "네이버 블로그",
    shortLabel: "블로그",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    mark: <span className="text-[10px] font-black">B</span>,
  },
  YOUTUBE: {
    label: "유튜브",
    shortLabel: "유튜브",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    mark: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
        <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 14.9V9.1l5.2 2.9L10 14.9Z" />
      </svg>
    ),
  },
  INSTAGRAM: {
    label: "인스타그램",
    shortLabel: "인스타",
    className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    mark: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current">
        <rect x="5" y="5" width="14" height="14" rx="4" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" strokeWidth="2" />
        <circle cx="16.5" cy="7.5" r="1" className="fill-current stroke-0" />
      </svg>
    ),
  },
  TIKTOK: {
    label: "틱톡",
    shortLabel: "틱톡",
    className: "border-cyan-200 bg-cyan-50 text-cyan-700",
    mark: <span className="text-[12px] font-black">♪</span>,
  },
  OTHER: {
    label: "기타",
    shortLabel: "기타",
    className: "border-neutral-200 bg-white text-neutral-600",
    mark: <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />,
  },
};

export function Dashboard({ surface = "contracts" }: DashboardProps) {
  const navigate = useNavigate();
  const isCampaignSurface = surface === "campaigns";
  const contracts = useAppStore((state) => state.contracts);
  const isHydrated = useAppStore((state) => state.isHydrated);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const syncError = useAppStore((state) => state.syncError);
  const resetHydration = useAppStore((state) => state.resetHydration);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [campaignPlatformFilter, setCampaignPlatformFilter] =
    useState<PlatformFilter>("ALL");
  const [campaignBrandFilter, setCampaignBrandFilter] = useState("ALL");
  const [campaignParticipantFilter, setCampaignParticipantFilter] =
    useState<CampaignParticipantFilter>("ALL");
  const [campaignLifecycleFilter, setCampaignLifecycleFilter] =
    useState<CampaignLifecycle>("RECRUITING");
  const [contractTypeFilter, setContractTypeFilter] =
    useState<ContractTypeFilter>("ALL");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("ALL");
  const [detailStatusFilter, setDetailStatusFilter] =
    useState<DetailStatusFilter>("ALL");
  const [contractSort, setContractSort] = useState<ContractSort>({
    key: "updated",
    direction: "desc",
  });
  const [campaignSort, setCampaignSort] = useState<ContractSort>({
    key: "deadline",
    direction: "asc",
  });
  const [marketplaceState, setMarketplaceState] =
    useState<MarketplaceDashboardState>({
      status: "loading",
      campaigns: [],
      threads: [],
    });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isLoginTransitionPending, setIsLoginTransitionPending] = useState(() =>
    isFastLoginTransitionPending("advertiser"),
  );
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
  const {
    summary: messageSummary,
    isLoading: isMessageSummaryLoading,
  } = useMarketplaceMessageSummary("advertiser");
  const cachedAdvertiserUser = getAdvertiserSessionCache()?.user;
  const advertiserVerificationStatus =
    verificationSummary?.advertiser.status ?? "not_submitted";
  const advertiserAccount = useMemo<AdvertiserAccountSummary>(() => {
    const advertiser = verificationSummary?.advertiser;
    const latest = advertiser?.latest_request;
    const account = advertiser?.account;
    const contractAdvertiser = contracts.find(
      (contract) =>
        contract.advertiser_info?.name || contract.advertiser_info?.manager,
    )?.advertiser_info;
    const name = removeInternalTestLabel(
      latest?.subject_name ||
        account?.company_name ||
        cachedAdvertiserUser?.company_name ||
        contractAdvertiser?.name,
      "광고주 계정",
    );
    const manager = removeInternalTestLabel(
      latest?.submitted_by_name ||
        account?.name ||
        cachedAdvertiserUser?.name ||
        contractAdvertiser?.manager,
    );
    const email = formatPublicContactValue(
      latest?.submitted_by_email || account?.email || cachedAdvertiserUser?.email,
    );
    const meta = [manager, email].filter(Boolean).join(" · ");

    return {
      name,
      meta: meta || undefined,
      email: email || undefined,
      businessNumber:
        latest?.business_registration_number ||
        account?.business_registration_number ||
        cachedAdvertiserUser?.business_registration_number ||
        undefined,
    };
  }, [cachedAdvertiserUser, contracts, verificationSummary]);

  const loadMarketplaceCampaignData = useCallback(async () => {
    setMarketplaceState((current) =>
      current.status === "ready" ? current : { ...current, status: "loading" },
    );

    try {
      const [campaignResponse, messageResponse] = await Promise.all([
        apiFetch("/api/advertiser/campaigns", {
          headers: { Accept: "application/json" },
          credentials: "include",
        }),
        apiFetch("/api/marketplace/messages?role=advertiser", {
          headers: { Accept: "application/json" },
          credentials: "include",
        }),
      ]);

      if (campaignResponse.status === 401 || messageResponse.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const campaignData = (await campaignResponse.json().catch(() => ({}))) as
        | { campaigns?: MarketplaceBrandCampaign[] }
        | { error?: string };
      const messageData = (await messageResponse.json().catch(() => ({}))) as
        | MarketplaceMessagesResponse
        | { error?: string };

      if (!campaignResponse.ok || !("campaigns" in campaignData)) {
        throw new Error(
          "error" in campaignData
            ? campaignData.error ?? "캠페인을 불러오지 못했습니다."
            : "캠페인을 불러오지 못했습니다.",
        );
      }

      if (!messageResponse.ok || !("threads" in messageData)) {
        throw new Error(
          "error" in messageData
            ? messageData.error ?? "지원자 목록을 불러오지 못했습니다."
            : "지원자 목록을 불러오지 못했습니다.",
        );
      }

      setMarketplaceState({
        status: "ready",
        campaigns: campaignData.campaigns ?? [],
        threads: messageData.threads,
      });
    } catch (error) {
      setMarketplaceState({
        status: "error",
        campaigns: [],
        threads: [],
        error:
          error instanceof Error
            ? error.message
            : "캠페인 지원자 목록을 불러오지 못했습니다.",
      });
    }
  }, [navigate]);

  useEffect(() => {
    const syncLoginTransition = () => {
      setIsLoginTransitionPending(isFastLoginTransitionPending("advertiser"));
    };
    syncLoginTransition();
    return subscribeFastLoginTransition(syncLoginTransition);
  }, []);

  useEffect(() => {
    if (!isCampaignSurface && !searchParams.get("campaign")) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void waitForFastLoginTransition("advertiser").then(() => {
        if (!active) return;
        void loadMarketplaceCampaignData();
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isCampaignSurface, loadMarketplaceCampaignData, searchParams]);

  const campaignGroups = useMemo(
    () =>
      buildCampaignGroups({
        contracts,
        marketplaceCampaigns: marketplaceState.campaigns,
        messageThreads: marketplaceState.threads,
        fallbackBrandName: advertiserAccount.name,
      }),
    [
      advertiserAccount.name,
      contracts,
      marketplaceState.campaigns,
      marketplaceState.threads,
    ],
  );
  const campaignTabCounts = useMemo(
    () => getCampaignLifecycleCounts(campaignGroups),
    [campaignGroups],
  );
  const campaignBrandOptions = useMemo<FilterOption[]>(() => {
    const brands = Array.from(
      new Set(campaignGroups.flatMap((campaign) => campaign.brands)),
    ).sort(compareText);

    return [
      { value: "ALL", label: "전체" },
      ...brands.map((brand) => ({ value: brand, label: brand })),
    ];
  }, [campaignGroups]);
  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return campaignGroups
      .filter((campaign) =>
        (!normalizedQuery ||
          campaign.name.toLowerCase().includes(normalizedQuery)) &&
        (campaignPlatformFilter === "ALL" ||
          campaign.platforms.includes(campaignPlatformFilter)) &&
        (campaignBrandFilter === "ALL" ||
          campaign.brands.includes(campaignBrandFilter)) &&
        matchesCampaignParticipantFilter(campaign, campaignParticipantFilter) &&
        campaign.lifecycle === campaignLifecycleFilter,
      )
      .sort((a, b) => compareCampaignGroupsBySort(a, b, campaignSort));
  }, [
    campaignBrandFilter,
    campaignGroups,
    campaignLifecycleFilter,
    campaignParticipantFilter,
    campaignPlatformFilter,
    campaignSort,
    query,
  ]);
  const dashboardContracts = useMemo(
    () => collapseInternalDuplicateContracts(contracts, getDashboardContractCollapseKey),
    [contracts],
  );
  const contractLifecycleCounts = useMemo(
    () => getContractLifecycleCounts(dashboardContracts),
    [dashboardContracts],
  );
  const visibleContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return dashboardContracts
      .filter(
        (contract) =>
          getDashboardContractLifecycle(contract) === campaignLifecycleFilter &&
          matchesContractDashboardQuery(contract, normalizedQuery) &&
          (campaignPlatformFilter === "ALL" ||
            getContractPlatforms(contract).includes(campaignPlatformFilter)) &&
          (contractTypeFilter === "ALL" || contract.type === contractTypeFilter) &&
          (amountFilter === "ALL" ||
            getAmountFilterKind(contract.campaign?.budget) === amountFilter) &&
          (detailStatusFilter === "ALL" || contract.status === detailStatusFilter),
      )
      .sort((a, b) => _compareContractsBySort(a, b, contractSort));
  }, [
    amountFilter,
    campaignLifecycleFilter,
    campaignPlatformFilter,
    contractSort,
    contractTypeFilter,
    dashboardContracts,
    detailStatusFilter,
    query,
  ]);
  const handleContractSortChange = useCallback((key: SortKey) => {
    setContractSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }, []);
  const handleCampaignSortChange = useCallback((key: SortKey) => {
    setCampaignSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }, []);
  const selectedCampaignKey = searchParams.get("campaign") ?? undefined;
  const selectedCampaign = selectedCampaignKey
    ? campaignGroups.find((campaign) => campaign.key === selectedCampaignKey)
    : undefined;
  const openContract = (contract: Contract) =>
    navigate(`/advertiser/contract/${contract.id}`);
  const setCampaignQueryParam = (key?: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (key) next.set("campaign", key);
      else next.delete("campaign");
      return next;
    });
  };
  const openCampaign = (campaign: CampaignGroup) =>
    setCampaignQueryParam(campaign.key);
  const closeCampaign = () => setCampaignQueryParam();
  const updateCampaignStatus = useCallback(
    async (campaign: CampaignGroup, status: CampaignStatusAction) => {
      if (!campaign.campaignId) {
        throw new Error("저장된 캠페인 ID가 없어 상태를 변경할 수 없습니다.");
      }

      const response = await apiFetch(
        `/api/advertiser/campaigns/${encodeURIComponent(campaign.campaignId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        },
      );

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | CampaignStatusUpdateResponse
        | { error?: string };

      if (!response.ok || !("campaigns" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인 상태를 변경하지 못했습니다."
            : "캠페인 상태를 변경하지 못했습니다.",
        );
      }

      setMarketplaceState((current) => ({
        ...current,
        status: "ready",
        campaigns: data.campaigns ?? current.campaigns,
        error: undefined,
      }));
    },
    [navigate],
  );
  const acceptCampaignApplication = useCallback(
    async (thread: MarketplaceMessageThread) => {
      const response = await apiFetch(
        `/api/advertiser/marketplace/proposals/${encodeURIComponent(thread.id)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | { contract?: { id?: string }; error?: string }
        | { error?: string };

      if (!response.ok || !("contract" in data) || !data.contract?.id) {
        throw new Error(
          "error" in data
            ? data.error ?? "지원 수락에 실패했습니다."
            : "지원 수락에 실패했습니다.",
        );
      }

      navigate(`/advertiser/contract/${data.contract.id}`);
    },
    [navigate],
  );
  const handleLogout = async () => {
    try {
      await apiFetch("/api/advertiser/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] advertiser logout request failed`, error);
    } finally {
      clearAdvertiserSessionCache();
      clearAdvertiserDashboardBootstrapPreload();
      clearVerificationSummaryCache("advertiser");
      resetHydration();
      navigate("/login/advertiser", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950 lg:h-screen lg:overflow-hidden">
      {!isCampaignSurface && isHydrated && contracts.length === 0 ? (
        <ContractFirstExperienceDialog
          content={CONTRACT_FIRST_EXPERIENCE_CONTENT}
          onCreateContract={() => navigate("/advertiser/builder")}
        />
      ) : null}
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            aria-label={PRODUCT_NAME}
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="font-neo-heavy hidden text-[18px] leading-none sm:inline">{PRODUCT_NAME}</span>
            <span className="sr-only sm:hidden">
              광고주
            </span>
          </button>

          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            {isSyncing || syncError ? (
              <div className="hidden shrink-0 sm:block">
                <SyncPill isSyncing={isSyncing} syncError={syncError} />
              </div>
            ) : null}
            <DashboardSurfaceSwitch role="advertiser" active={surface} />
            <MessageCenterButton
              unreadCount={messageSummary.unreadCount}
              isLoading={isMessageSummaryLoading}
              onClick={() => navigate("/advertiser/messages")}
            />
            <button
              type="button"
              onClick={() => navigate("/advertiser/discover")}
              className="yl-header-action yl-header-action-secondary"
              aria-label="인플루언서 찾기"
              title="인플루언서 찾기"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">인플루언서</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <AccountSettingsMenu
              account={advertiserAccount}
              open={accountMenuOpen}
              onToggle={() => setAccountMenuOpen((current) => !current)}
              onChangePassword={() => {
                setAccountMenuOpen(false);
                navigate("/reset-password?role=advertiser");
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-2.5 sm:px-5 lg:flex lg:h-[calc(100vh-56px)] lg:flex-col lg:overflow-hidden lg:px-6">
        <section className="min-w-0 overflow-hidden rounded-[10px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.055)] lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-[17px] font-bold text-[#171a17]">
                  {isCampaignSurface ? "캠페인 운영 대시보드" : "계약 운영 대시보드"}
                </h1>
              </div>
              {isCampaignSurface ? (
                <Link
                  to="/advertiser/campaigns/new"
                  className="yl-header-action yl-header-action-primary"
                  aria-label="새 캠페인"
                  title="새 캠페인"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="sm:hidden">캠페인</span>
                  <span className="hidden sm:inline">새 캠페인</span>
                </Link>
              ) : (
                <Link
                  to="/advertiser/builder"
                  className="yl-header-action yl-header-action-primary"
                  aria-label="새 계약"
                  title="새 계약"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="sm:hidden">계약</span>
                  <span className="hidden sm:inline">새 계약</span>
                </Link>
              )}
            </div>
          </div>

          <VerificationBanner
            status={advertiserVerificationStatus}
            account={advertiserAccount}
            isLoading={isVerificationLoading}
            latest={verificationSummary?.advertiser.latest_request}
            onOpen={() => navigate("/advertiser/verification")}
            embedded
          />

          <div className="min-w-0 p-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            {isCampaignSurface ? (
              <>
                {marketplaceState.status === "error" && marketplaceState.error ? (
                  <CampaignDataErrorPanel message={marketplaceState.error} />
                ) : null}
                {marketplaceState.status === "loading" &&
                campaignGroups.length === 0 ? (
                  <CampaignLoadingState />
                ) : (
                  <CampaignDashboard
                    campaigns={filteredCampaigns}
                    totalCampaigns={campaignGroups.length}
                    lifecycleFilter={campaignLifecycleFilter}
                    onLifecycleFilterChange={setCampaignLifecycleFilter}
                    lifecycleCounts={campaignTabCounts}
                    query={query}
                    onQueryChange={setQuery}
                    platformFilter={campaignPlatformFilter}
                    onPlatformFilterChange={setCampaignPlatformFilter}
                    brandFilter={campaignBrandFilter}
                    onBrandFilterChange={setCampaignBrandFilter}
                    brandOptions={campaignBrandOptions}
                    participantFilter={campaignParticipantFilter}
                    onParticipantFilterChange={setCampaignParticipantFilter}
                    sortState={campaignSort}
                    onSortChange={handleCampaignSortChange}
                    selectedCampaign={selectedCampaign}
                    onOpenCampaign={openCampaign}
                    onBack={closeCampaign}
                    onOpenContract={openContract}
                    onAcceptApplication={acceptCampaignApplication}
                    onUpdateCampaignStatus={updateCampaignStatus}
                    marketplaceStatus={marketplaceState.status}
                    marketplaceError={marketplaceState.error}
                  />
                )}
              </>
            ) : (
              <>
                {syncError && <SyncErrorPanel message={syncError} />}

                <ContractTable
                  lifecycleFilter={campaignLifecycleFilter}
                  lifecycleTabs={
                    <CampaignLifecycleTabs
                      value={campaignLifecycleFilter}
                      counts={contractLifecycleCounts}
                      onChange={setCampaignLifecycleFilter}
                    />
                  }
                  contracts={visibleContracts}
                  totalContracts={dashboardContracts.length}
                  query={query}
                  onQueryChange={setQuery}
                  platformFilter={campaignPlatformFilter}
                  onPlatformFilterChange={setCampaignPlatformFilter}
                  contractTypeFilter={contractTypeFilter}
                  onContractTypeFilterChange={setContractTypeFilter}
                  amountFilter={amountFilter}
                  onAmountFilterChange={setAmountFilter}
                  detailStatusFilter={detailStatusFilter}
                  onDetailStatusFilterChange={setDetailStatusFilter}
                  sortState={contractSort}
                  onSortChange={handleContractSortChange}
                  isDataPending={isLoginTransitionPending || (!isHydrated && !syncError)}
                  onOpen={openContract}
                />
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function AccountSettingsMenu({
  account,
  open,
  onToggle,
  onChangePassword,
}: {
  account: AdvertiserAccountSummary;
  open: boolean;
  onToggle: () => void;
  onChangePassword: () => void;
}) {
  const emailChangeHref = buildSupportMailtoHref({
    subject: "광고주 계정 이메일 변경 요청",
    body: [
      "광고주 계정 이메일 변경을 요청합니다.",
      "",
      `현재 표시 이메일: ${account.email ?? "확인 필요"}`,
      "변경할 이메일:",
      "회사/브랜드명:",
      "요청 사유:",
    ].join("\n"),
  });

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label="계정 설정"
        title="계정 설정"
        aria-expanded={open}
        className="yl-header-icon-action"
      >
        <Settings className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[260px] overflow-hidden rounded-[12px] border border-neutral-200 bg-white text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-[13px] font-extrabold text-neutral-950">
              계정 설정
            </p>
            {account.email ? (
              <p className="mt-1 truncate text-[12px] font-semibold text-neutral-500">
                {account.email}
              </p>
            ) : null}
          </div>
          <a
            href={emailChangeHref}
            className="flex h-11 items-center gap-2 px-4 text-[12px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-950"
          >
            <Mail className="h-3.5 w-3.5" />
            이메일 변경
          </a>
          <button
            type="button"
            onClick={onChangePassword}
            className="flex h-11 w-full items-center gap-2 px-4 text-left text-[12px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-950"
          >
            <KeyRound className="h-3.5 w-3.5" />
            비밀번호 변경
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VerificationBanner({
  status,
  account,
  isLoading,
  latest,
  onOpen,
  embedded = false,
}: {
  status: VerificationStatus;
  account: AdvertiserAccountSummary;
  isLoading: boolean;
  latest?: VerificationRequest;
  onOpen: () => void;
  embedded?: boolean;
}) {
  const approved = status === "approved";
  const showCompactAccount = approved || (isLoading && !latest);
  const rejected = status === "rejected";
  const copy = getAdvertiserVerificationBannerCopy(status, latest);
  const businessNumber = account.businessNumber
    ? formatBusinessRegistrationNumber(account.businessNumber)
    : undefined;

  if (showCompactAccount) {
    return (
      <section
        className={
          embedded
            ? "border-b border-neutral-200 bg-[#fbfbf8] px-4 py-2"
            : "mb-3 rounded-md border border-neutral-200 bg-white px-3 py-2.5"
        }
      >
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-neutral-950">
              {account.name}
            </p>
            {businessNumber ? (
              <p className="mt-0.5 truncate text-[12px] font-semibold text-neutral-500">
                사업자번호 {businessNumber}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="h-10 shrink-0 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            정보 보기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={
        embedded
          ? `border-b px-4 py-2 ${
              approved
                ? "border-neutral-200 bg-[#fbfbf8]"
                : rejected
                  ? "border-rose-200 bg-rose-50/85"
                : "border-amber-200 bg-amber-50/85"
            }`
          : `mb-3 rounded-md border px-3 py-2.5 ${
              approved
                ? "border-neutral-200 bg-white"
                : rejected
                  ? "border-rose-200 bg-rose-50/85"
                : "border-amber-200 bg-amber-50/85"
            }`
      }
    >
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] ${
              approved
                ? "bg-white text-neutral-800 ring-1 ring-neutral-200"
                : rejected
                  ? "bg-rose-100 text-rose-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-[13px] font-bold text-neutral-950">
                사업자 인증
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${verificationStatusTone(
                  status,
                )}`}
              >
                {copy.statusLabel}
              </span>
            </div>
            <span className="max-w-[180px] truncate text-[12px] font-semibold text-neutral-800">
              {account.name}
            </span>
            {account.meta ? (
              <>
                <span className="hidden h-3 w-px bg-neutral-200 sm:inline-block" />
                <span className="max-w-[300px] truncate text-[12px] text-neutral-500">
                  {account.meta}
                </span>
              </>
            ) : null}
            {businessNumber && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                사업자 {businessNumber}
              </span>
            )}
            {copy.helper ? (
              <p className="basis-full text-[12px] font-semibold leading-5 text-neutral-600">
                {copy.helper}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className={`h-10 shrink-0 whitespace-nowrap rounded-md px-3 text-[12px] font-semibold transition ${
            approved
              ? "border border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"
              : "bg-neutral-950 text-white hover:bg-neutral-800"
          }`}
        >
          {copy.actionLabel}
        </button>
      </div>
    </section>
  );
}

function buildSupportMailtoHref({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) {
  return `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

function SyncPill({
  isSyncing,
  syncError,
}: {
  isSyncing: boolean;
  syncError?: string;
}) {
  if (syncError) {
    return (
      <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-2.5 text-[12px] font-semibold text-amber-700">
        <AlertCircle className="h-3.5 w-3.5" />
        동기화 확인 필요
      </span>
    );
  }

  if (!isSyncing) return null;

  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-semibold text-neutral-600">
      <CopyCheck className="h-3.5 w-3.5 text-neutral-500" />
      저장 중
    </span>
  );
}

function MessageCenterButton({
  unreadCount,
  isLoading,
  onClick,
}: {
  unreadCount: number;
  isLoading: boolean;
  onClick: () => void;
}) {
  const badge = unreadCount > 0 ? unreadCount : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="yl-header-action yl-header-action-secondary relative"
      aria-label="메시지함"
      title="메시지함"
    >
      <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2} />
      <span className="hidden sm:inline">메시지함</span>
      {badge ? (
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-extrabold tabular-nums text-white ring-2 ring-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : isLoading ? (
        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-neutral-300 ring-2 ring-white" />
      ) : null}
    </button>
  );
}

function PlatformPills({ contract }: { contract: Contract }) {
  const items = getContractPlatformDisplayItems(contract);

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {items.slice(0, 3).map((item) => (
        <span
          key={`${item.platform}-${item.label}`}
          className={`inline-flex h-5 max-w-full items-center gap-1 rounded-[5px] border px-1.5 text-[10px] font-semibold whitespace-nowrap ${PLATFORM_META[item.platform].className}`}
          title={item.title}
        >
          <span className="shrink-0">{PLATFORM_META[item.platform].mark}</span>
          <span className="min-w-0 truncate whitespace-nowrap">{item.label}</span>
        </span>
      ))}
      {items.length > 3 && (
        <span className="inline-flex h-5 items-center rounded-[5px] border border-neutral-200 bg-white px-1.5 text-[10px] font-semibold text-neutral-500">
          +{items.length - 3}
        </span>
      )}
    </div>
  );
}

function formatPlatformFilterLabel(platform: PlatformFilter) {
  if (platform === "ALL") return "전체";
  return PLATFORM_META[platform].shortLabel;
}

function getAdvertiserVerificationBannerCopy(
  status: VerificationStatus,
  latest?: VerificationRequest,
) {
  const rejectionGuidance =
    status === "rejected"
      ? getVerificationRejectionGuidance(latest, "advertiser_organization")
      : undefined;

  const copies: Record<
    VerificationStatus,
    { statusLabel: string; helper: string; actionLabel: string }
  > = {
    approved: {
      statusLabel: "인증 완료",
      helper: "",
      actionLabel: "인증 정보 보기",
    },
    pending: {
      statusLabel: "검수 중",
      helper: "인증 요청이 접수되었습니다. 검수 완료 전에는 공유 링크 발송이 제한됩니다.",
      actionLabel: "검수 상태 보기",
    },
    rejected: {
      statusLabel: "재제출 필요",
      helper: rejectionGuidance
        ? `반려 사유: ${rejectionGuidance.reviewerNote} 새 증빙으로 다시 제출해 주세요.`
        : "반려 사유를 확인하고 새 증빙으로 다시 제출해 주세요.",
      actionLabel: "재제출",
    },
    not_submitted: {
      statusLabel: "제출 필요",
      helper: "사업자 인증을 제출해야 인플루언서에게 공유 링크를 보낼 수 있습니다.",
      actionLabel: "인증 제출",
    },
  };

  return copies[status];
}

function CampaignDashboard({
  campaigns,
  totalCampaigns,
  lifecycleFilter,
  onLifecycleFilterChange,
  lifecycleCounts,
  query,
  onQueryChange,
  platformFilter,
  onPlatformFilterChange,
  brandFilter,
  onBrandFilterChange,
  brandOptions,
  participantFilter,
  onParticipantFilterChange,
  sortState,
  onSortChange,
  selectedCampaign,
  onOpenCampaign,
  onBack,
  onOpenContract,
  onAcceptApplication,
  onUpdateCampaignStatus,
  marketplaceStatus,
  marketplaceError,
}: {
  campaigns: CampaignGroup[];
  totalCampaigns: number;
  lifecycleFilter: CampaignLifecycle;
  onLifecycleFilterChange: (value: CampaignLifecycle) => void;
  lifecycleCounts: Record<CampaignLifecycle, number>;
  query: string;
  onQueryChange: (value: string) => void;
  platformFilter: PlatformFilter;
  onPlatformFilterChange: (value: PlatformFilter) => void;
  brandFilter: string;
  onBrandFilterChange: (value: string) => void;
  brandOptions: FilterOption[];
  participantFilter: CampaignParticipantFilter;
  onParticipantFilterChange: (value: CampaignParticipantFilter) => void;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
  selectedCampaign?: CampaignGroup;
  onOpenCampaign: (campaign: CampaignGroup) => void;
  onBack: () => void;
  onOpenContract: (contract: Contract) => void;
  onAcceptApplication: (thread: MarketplaceMessageThread) => Promise<void>;
  onUpdateCampaignStatus: (
    campaign: CampaignGroup,
    status: CampaignStatusAction,
  ) => Promise<void>;
  marketplaceStatus: MarketplaceDashboardState["status"];
  marketplaceError?: string;
}) {
  if (selectedCampaign) {
    return (
      <CampaignDetailView
        campaign={selectedCampaign}
        onBack={onBack}
        onOpenContract={onOpenContract}
        onAcceptApplication={onAcceptApplication}
        onUpdateCampaignStatus={onUpdateCampaignStatus}
        marketplaceStatus={marketplaceStatus}
        marketplaceError={marketplaceError}
      />
    );
  }

  return (
    <CampaignListView
      campaigns={campaigns}
      totalCampaigns={totalCampaigns}
      lifecycleFilter={lifecycleFilter}
      onLifecycleFilterChange={onLifecycleFilterChange}
      lifecycleCounts={lifecycleCounts}
      query={query}
      onQueryChange={onQueryChange}
      platformFilter={platformFilter}
      onPlatformFilterChange={onPlatformFilterChange}
      brandFilter={brandFilter}
      onBrandFilterChange={onBrandFilterChange}
      brandOptions={brandOptions}
      participantFilter={participantFilter}
      onParticipantFilterChange={onParticipantFilterChange}
      sortState={sortState}
      onSortChange={onSortChange}
      onOpenCampaign={onOpenCampaign}
    />
  );
}

function CampaignListView({
  campaigns,
  totalCampaigns,
  lifecycleFilter,
  onLifecycleFilterChange,
  lifecycleCounts,
  query,
  onQueryChange,
  platformFilter,
  onPlatformFilterChange,
  brandFilter,
  onBrandFilterChange,
  brandOptions,
  participantFilter,
  onParticipantFilterChange,
  sortState,
  onSortChange,
  onOpenCampaign,
}: {
  campaigns: CampaignGroup[];
  totalCampaigns: number;
  lifecycleFilter: CampaignLifecycle;
  onLifecycleFilterChange: (value: CampaignLifecycle) => void;
  lifecycleCounts: Record<CampaignLifecycle, number>;
  query: string;
  onQueryChange: (value: string) => void;
  platformFilter: PlatformFilter;
  onPlatformFilterChange: (value: PlatformFilter) => void;
  brandFilter: string;
  onBrandFilterChange: (value: string) => void;
  brandOptions: FilterOption[];
  participantFilter: CampaignParticipantFilter;
  onParticipantFilterChange: (value: CampaignParticipantFilter) => void;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
  onOpenCampaign: (campaign: CampaignGroup) => void;
}) {
  const platformOptions = PLATFORM_FILTERS.map((platform) => ({
    value: platform,
    label: formatPlatformFilterLabel(platform),
  }));
  const dateColumnLabel = lifecycleFilter === "ENDED" ? "종료일" : "마감일";
  const activeFilters = [
    platformFilter !== "ALL"
      ? {
          id: "platform",
          label:
            platformOptions.find((option) => option.value === platformFilter)?.label ??
            platformFilter,
          onRemove: () => onPlatformFilterChange("ALL"),
        }
      : null,
    brandFilter !== "ALL"
      ? {
          id: "brand",
          label:
            brandOptions.find((option) => option.value === brandFilter)?.label ??
            brandFilter,
          onRemove: () => onBrandFilterChange("ALL"),
        }
      : null,
    participantFilter !== "ALL"
      ? {
          id: "participant",
          label:
            CAMPAIGN_PARTICIPANT_OPTIONS.find(
              (option) => option.value === participantFilter,
            )?.label ?? participantFilter,
          onRemove: () => onParticipantFilterChange("ALL"),
        }
      : null,
    query.trim()
      ? {
          id: "query",
          label: `검색 ${query.trim()}`,
          onRemove: () => onQueryChange(""),
        }
      : null,
  ].filter(isAppliedFilter);
  const filterSummary =
    activeFilters.length > 0 ? `${activeFilters.length}개 조건 적용` : "전체 조건";
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <CampaignLifecycleTabs
        value={lifecycleFilter}
        counts={lifecycleCounts}
        onChange={onLifecycleFilterChange}
      />
      <div className="border-b border-[#d9e0d9] bg-white">
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
              모집 현황
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
              {campaigns.length.toLocaleString("ko-KR")}건 표시 · {filterSummary}
            </p>
          </div>
          <DashboardFilterToggleButton
            open={filtersOpen}
            activeCount={activeFilters.length}
            onClick={() => setFiltersOpen((current) => !current)}
            controlsId="advertiser-campaign-filters"
          />
        </div>
        <DashboardAppliedFilterBar
          filters={activeFilters}
          onClearAll={() => {
            onPlatformFilterChange("ALL");
            onBrandFilterChange("ALL");
            onParticipantFilterChange("ALL");
            onQueryChange("");
          }}
        />
        {filtersOpen ? (
          <div
            id="advertiser-campaign-filters"
            className="grid gap-2 border-t border-[#edf1ed] bg-[#f8faf7] p-2 lg:grid-cols-[minmax(110px,0.22fr)_minmax(130px,0.24fr)_minmax(260px,0.7fr)_minmax(130px,0.24fr)]"
          >
            <TableFilterSelect
              label="플랫폼"
              value={platformFilter}
              options={platformOptions}
              onChange={(value) => onPlatformFilterChange(value as PlatformFilter)}
              compact
            />
            <TableFilterSelect
              label="브랜드"
              value={brandFilter}
              options={brandOptions}
              onChange={onBrandFilterChange}
              compact
            />
            <CampaignSearch value={query} onChange={onQueryChange} compact />
            <TableFilterSelect
              label="진도율"
              value={participantFilter}
              options={CAMPAIGN_PARTICIPANT_OPTIONS}
              onChange={(value) =>
                onParticipantFilterChange(value as CampaignParticipantFilter)
              }
              compact
            />
          </div>
        ) : null}
      </div>
      <CampaignTableHeaderRow
        dateColumnLabel={dateColumnLabel}
        sortState={sortState}
        onSortChange={onSortChange}
      />

      <div className="no-scrollbar max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1">
        {campaigns.length > 0 ? (
          campaigns.map((campaign) => (
            <React.Fragment key={campaign.key}>
              <CampaignRow
                campaign={campaign}
                onOpen={() => onOpenCampaign(campaign)}
              />
            </React.Fragment>
          ))
        ) : (
          <CampaignEmptyState isInitialEmpty={totalCampaigns === 0} />
        )}
      </div>
    </section>
  );
}

function CampaignTableHeaderRow({
  dateColumnLabel,
  sortState,
  onSortChange,
}: {
  dateColumnLabel: string;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
}) {
  return (
    <div className="hidden border-b border-[#d7ddd7] bg-[#f7f8f4] px-3 py-2.5 lg:grid lg:grid-cols-[minmax(104px,0.2fr)_minmax(82px,0.14fr)_minmax(250px,0.78fr)_minmax(160px,0.4fr)_minmax(132px,0.32fr)_minmax(104px,0.23fr)] lg:items-center lg:gap-2">
      <ColumnHeader
        label="플랫폼"
        sortKey="platform"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="브랜드"
        sortKey="brand"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="캠페인"
        sortKey="title"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="지급내용"
        sortKey="amount"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="신청/모집 인원"
        sortKey="participants"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label={dateColumnLabel}
        sortKey="deadline"
        sortState={sortState}
        onSortChange={onSortChange}
      />
    </div>
  );
}

function isAppliedFilter(filter: AppliedFilter | null): filter is AppliedFilter {
  return Boolean(filter);
}

function DashboardAppliedFilterBar({
  filters,
  onClearAll,
}: {
  filters: AppliedFilter[];
  onClearAll: () => void;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-[#edf1ed] bg-white px-3 py-2">
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={filter.onRemove}
          aria-label={`${filter.label} 필터 해제`}
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-[#d9e0d9] bg-[#fbfcfa] pl-2.5 pr-2 text-[11px] font-bold text-[#303630] transition hover:border-[#bcc8bd] hover:bg-white"
        >
          <span className="max-w-[180px] truncate">{filter.label}</span>
          <X className="h-3 w-3 shrink-0 text-[#7d857f]" strokeWidth={2.2} />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex h-8 shrink-0 items-center rounded-full px-2 text-[11px] font-extrabold text-[#606861] transition hover:bg-[#eef2ee] hover:text-[#303630]"
      >
        초기화
      </button>
    </div>
  );
}

function DashboardFilterToggleButton({
  open,
  activeCount,
  controlsId,
  onClick,
}: {
  open: boolean;
  activeCount: number;
  controlsId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controlsId}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-[#e1e6e1] bg-[#fbfcfa] px-2.5 text-[11px] font-bold text-[#606861] transition-colors hover:border-[#cbd5cc] hover:text-[#303630]"
    >
      <SlidersHorizontal className="h-3.5 w-3.5 text-[#606861]" strokeWidth={2} />
      <span>필터</span>
      {activeCount > 0 ? (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#171a17] px-1 text-[11px] font-extrabold text-white">
          {activeCount}
        </span>
      ) : null}
      <ChevronDown
        className={`h-3.5 w-3.5 text-[#606861] transition-transform ${
          open ? "rotate-180" : ""
        }`}
        strokeWidth={2}
      />
    </button>
  );
}

function _DashboardActionStrip({
  metrics: _metrics,
}: {
  metrics: DashboardActionMetric[];
}) {
  return null;
}

function CampaignLifecycleTabs({
  value,
  counts,
  onChange,
}: {
  value: CampaignLifecycle;
  counts: Record<CampaignLifecycle, number>;
  onChange: (value: CampaignLifecycle) => void;
}) {
  return (
    <div className="yl-dashboard-lifecycle-strip bg-[#ecebe5] px-2 pt-2">
      <div
        role="tablist"
        className="grid min-w-0 grid-cols-3 items-end gap-0 overflow-visible"
      >
        {CAMPAIGN_LIFECYCLE_TABS.map((tab) => {
          const active = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              role="tab"
              aria-selected={active}
              className={`relative flex h-10 min-w-0 flex-1 items-center justify-between gap-2 overflow-visible rounded-t-[10px] border px-3 text-left transition focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 ${
                active
                  ? "yl-dashboard-lifecycle-tab-active z-10 border-[#d9e0d9] border-b-white bg-white text-[#171a17]"
                  : "border-transparent bg-transparent text-[#59605b] hover:bg-white/35 hover:text-[#171a17]"
              }`}
            >
              <span className="truncate text-[13px] font-extrabold">
                {tab.label}
              </span>
              <span
                className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-extrabold ${
                  active
                    ? "bg-[#171a17] text-white"
                    : "bg-white/80 text-[#303630]"
                }`}
              >
                {counts[tab.value].toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CampaignSearch({
  value,
  onChange,
  label = "계약명",
  placeholder = "계약명으로 검색",
  ariaLabel,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
}) {
  return (
    <label
      className={
        compact
          ? "grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-2"
          : "block min-w-0"
      }
    >
      <ColumnHeader label={label} />
      <span className={`relative block ${compact ? "" : "mt-1"}`}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={ariaLabel ?? `${label} 검색`}
          placeholder={placeholder}
          className="h-9 w-full max-w-full rounded-[6px] border border-[#d9e0d9] bg-white pl-7 pr-2 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17]"
        />
      </span>
    </label>
  );
}

function CampaignRow({
  campaign,
  onOpen,
}: {
  campaign: CampaignGroup;
  onOpen: () => void;
}) {
  const brandLabel = campaign.brands.join(", ");
  const progress = getCampaignRosterProgress(campaign);
  const primaryPlatform = campaign.platforms[0] ?? "OTHER";
  const platformMeta = PLATFORM_META[primaryPlatform];
  const platformLabel = formatCampaignPlatformSummary(campaign.platforms);
  const paymentLabel = getCampaignPaymentLabel(campaign);
  const dateParts = getCampaignListDateParts(campaign);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${campaign.name} 캠페인 열기, 지급내용 ${paymentLabel}, 신청/모집 인원 ${progress.label}, 날짜 ${dateParts.label}`}
      className="group grid w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-[#fafaf7] lg:min-h-[44px] lg:grid-cols-[minmax(104px,0.2fr)_minmax(82px,0.14fr)_minmax(250px,0.78fr)_minmax(160px,0.4fr)_minmax(132px,0.32fr)_minmax(104px,0.23fr)] lg:items-center"
    >
      <div className="min-w-0">
        <span
          className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-[12px] font-extrabold whitespace-nowrap ${platformMeta.className}`}
        >
          <span className="shrink-0">{platformMeta.mark}</span>
          <span className="min-w-0 truncate whitespace-nowrap">{platformLabel}</span>
        </span>
      </div>
      <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630]">
        {brandLabel}
      </p>
      <p className="min-w-0 truncate whitespace-nowrap text-[14px] font-semibold text-[#171a17]">
        {campaign.name}
      </p>
      <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630]">
        {paymentLabel}
      </p>
      <div className="min-w-0 pr-3 lg:pr-5">
        <p className="whitespace-nowrap text-[13px] font-extrabold text-[#171a17]">
          {progress.label}
        </p>
        <div className="mt-1 h-1.5 max-w-[108px] overflow-hidden rounded-full bg-[#e6ebe6]">
          <div
            className="h-full rounded-full bg-[#171a17]"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
      <CampaignDateText parts={dateParts} />
    </button>
  );
}

function CampaignDateText({ parts }: { parts: DashboardDateParts }) {
  if (!parts.dday || !parts.dateLabel) {
    return (
      <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630]">
        {parts.label}
      </p>
    );
  }

  return (
    <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold tabular-nums text-[#303630]">
      <span
        className={parts.isUrgent ? "font-extrabold text-[#dc2626]" : "text-[#303630]"}
      >
        {parts.dday}
      </span>
      <span className="text-[#9aa39d]">{" / "}</span>
      <span>{parts.dateLabel}</span>
    </p>
  );
}

function CampaignDetailView({
  campaign,
  onBack,
  onOpenContract,
  onAcceptApplication,
  onUpdateCampaignStatus,
  marketplaceStatus,
  marketplaceError,
}: {
  campaign: CampaignGroup;
  onBack: () => void;
  onOpenContract: (contract: Contract) => void;
  onAcceptApplication: (thread: MarketplaceMessageThread) => Promise<void>;
  onUpdateCampaignStatus: (
    campaign: CampaignGroup,
    status: CampaignStatusAction,
  ) => Promise<void>;
  marketplaceStatus: MarketplaceDashboardState["status"];
  marketplaceError?: string;
}) {
  const [influencerQuery, setInfluencerQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [progressFilter, setProgressFilter] =
    useState<DetailProgressFilter>("ALL");
  const [deadlineFilter, setDeadlineFilter] =
    useState<DetailDeadlineFilter>("ALL");
  const [postLinkFilter, setPostLinkFilter] =
    useState<DetailPostLinkFilter>("ALL");
  const [detailFiltersOpen, setDetailFiltersOpen] = useState(false);
  const completionRatio =
    campaign.acceptedParticipantCount > 0
      ? Math.min(100, Math.round((campaign.completedCount / campaign.acceptedParticipantCount) * 100))
      : 0;
  const statusMeta = getCampaignLifecycleMeta(campaign);
  const platformOptions = PLATFORM_FILTERS.map((platform) => ({
    value: platform,
    label: formatPlatformFilterLabel(platform),
  }));
  const detailActiveFilters = [
    influencerQuery.trim()
      ? {
          id: "query",
          label: `검색 ${influencerQuery.trim()}`,
          onRemove: () => setInfluencerQuery(""),
        }
      : null,
    platformFilter !== "ALL"
      ? {
          id: "platform",
          label:
            platformOptions.find((option) => option.value === platformFilter)?.label ??
            platformFilter,
          onRemove: () => setPlatformFilter("ALL"),
        }
      : null,
    progressFilter !== "ALL"
      ? {
          id: "progress",
          label:
            DETAIL_PROGRESS_OPTIONS.find((option) => option.value === progressFilter)
              ?.label ?? progressFilter,
          onRemove: () => setProgressFilter("ALL"),
        }
      : null,
    deadlineFilter !== "ALL"
      ? {
          id: "deadline",
          label:
            DETAIL_DEADLINE_OPTIONS.find((option) => option.value === deadlineFilter)
              ?.label ?? deadlineFilter,
          onRemove: () => setDeadlineFilter("ALL"),
        }
      : null,
    postLinkFilter !== "ALL"
      ? {
          id: "post-link",
          label:
            DETAIL_POST_LINK_OPTIONS.find((option) => option.value === postLinkFilter)
              ?.label ?? postLinkFilter,
          onRemove: () => setPostLinkFilter("ALL"),
        }
      : null,
  ].filter(isAppliedFilter);
  const detailFilterSummary =
    detailActiveFilters.length > 0
      ? `${detailActiveFilters.length}개 조건 적용`
      : "전체 조건";
  const filteredContracts = useMemo(() => {
    const normalizedQuery = influencerQuery.trim().toLowerCase();

    return campaign.contracts.filter((contract) => {
      const influencerName = removeInternalTestLabel(
        contract.influencer_info.name,
        "인플루언서",
      ).toLowerCase();

      return (
        (!normalizedQuery || influencerName.includes(normalizedQuery)) &&
        (platformFilter === "ALL" ||
          getContractPlatforms(contract).includes(platformFilter)) &&
        (progressFilter === "ALL" ||
          getCampaignProgressFilterValue(contract) === progressFilter) &&
        matchesDetailDeadlineFilter(contract, deadlineFilter) &&
        (postLinkFilter === "ALL" ||
          (postLinkFilter === "SUBMITTED"
            ? isContractContentSubmitted(contract)
            : !isContractContentSubmitted(contract)))
      );
    });
  }, [
    campaign.contracts,
    deadlineFilter,
    influencerQuery,
    platformFilter,
    postLinkFilter,
    progressFilter,
  ]);

  return (
    <section className="no-scrollbar overflow-x-hidden overflow-y-auto overscroll-contain rounded-[10px] border border-[#d9e0d9] bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="border-b border-[#d9e0d9] bg-[#f8faf7] px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-[#d9e0d9] bg-white px-2.5 text-[12px] font-extrabold text-[#303630] transition hover:border-[#cbd5cc]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          계약 목록
        </button>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold text-[#7d857f]">
              캠페인 상세
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-[18px] font-bold text-[#171a17]">
                {campaign.name}
              </h2>
              <span
                className={`inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[12px] font-extrabold ${statusMeta.className}`}
              >
                {statusMeta.label}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-extrabold text-[#171a17]">
                완료율: {campaign.completedCount} / {campaign.acceptedParticipantCount}
              </p>
              <span className="text-[12px] font-semibold text-[#606861]">
                {completionRatio}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e6ebe6]">
              <div
                className="h-full rounded-full bg-[#171a17]"
                style={{ width: `${completionRatio}%` }}
              />
            </div>
            <CampaignStatusActions
              campaign={campaign}
              onUpdateStatus={onUpdateCampaignStatus}
            />
          </div>
        </div>
      </div>

      <CampaignApplicantsPanel
        campaign={campaign}
        marketplaceStatus={marketplaceStatus}
        marketplaceError={marketplaceError}
        onAcceptApplication={onAcceptApplication}
      />

      <div className="border-b border-[#d9e0d9] bg-[#fbfcfa]">
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
              인플루언서 목록
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
              {filteredContracts.length.toLocaleString("ko-KR")}명 표시 ·{" "}
              {detailFilterSummary}
            </p>
          </div>
          <DashboardFilterToggleButton
            open={detailFiltersOpen}
            activeCount={detailActiveFilters.length}
            onClick={() => setDetailFiltersOpen((current) => !current)}
            controlsId="campaign-detail-filters"
          />
        </div>
        <DashboardAppliedFilterBar
          filters={detailActiveFilters}
          onClearAll={() => {
            setInfluencerQuery("");
            setPlatformFilter("ALL");
            setProgressFilter("ALL");
            setDeadlineFilter("ALL");
            setPostLinkFilter("ALL");
          }}
        />
        {detailFiltersOpen ? (
          <div
            id="campaign-detail-filters"
            className="grid gap-2 border-t border-[#edf1ed] bg-[#f8faf7] p-2 lg:grid-cols-[minmax(220px,0.7fr)_minmax(130px,0.36fr)_minmax(130px,0.34fr)_minmax(130px,0.34fr)_minmax(160px,0.45fr)]"
          >
            <CampaignSearch
              label="인플루언서"
              placeholder="인플루언서명 검색"
              value={influencerQuery}
              onChange={setInfluencerQuery}
              compact
            />
            <TableFilterSelect
              label="플랫폼"
              value={platformFilter}
              options={platformOptions}
              onChange={(value) => setPlatformFilter(value as PlatformFilter)}
              compact
            />
            <TableFilterSelect
              label="현재 상태"
              value={progressFilter}
              options={DETAIL_PROGRESS_OPTIONS}
              onChange={(value) => setProgressFilter(value as DetailProgressFilter)}
              compact
            />
            <TableFilterSelect
              label="마감일"
              value={deadlineFilter}
              options={DETAIL_DEADLINE_OPTIONS}
              onChange={(value) => setDeadlineFilter(value as DetailDeadlineFilter)}
              compact
            />
            <TableFilterSelect
              label="컨텐츠 제출 링크"
              value={postLinkFilter}
              options={DETAIL_POST_LINK_OPTIONS}
              onChange={(value) => setPostLinkFilter(value as DetailPostLinkFilter)}
              compact
            />
          </div>
        ) : null}
      </div>
      <CampaignInfluencerTableHeaderRow />

      <div className="no-scrollbar max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1">
        {filteredContracts.length > 0 ? (
          filteredContracts.map((contract) => (
            <React.Fragment key={contract.id}>
              <CampaignInfluencerRow
                contract={contract}
                onOpen={() => onOpenContract(contract)}
              />
            </React.Fragment>
          ))
        ) : (
          <EmptyState isInitialEmpty={campaign.contracts.length === 0} />
        )}
      </div>
    </section>
  );
}

function CampaignInfluencerTableHeaderRow() {
  return (
    <div className="hidden border-b border-[#e3e8e3] bg-white px-3 py-2 lg:grid lg:grid-cols-[minmax(180px,0.7fr)_minmax(130px,0.36fr)_minmax(130px,0.34fr)_minmax(130px,0.34fr)_minmax(160px,0.45fr)] lg:items-center lg:gap-2">
      <ColumnHeader label="인플루언서" />
      <ColumnHeader label="플랫폼" />
      <ColumnHeader label="현재 상태" />
      <ColumnHeader label="마감일" />
      <ColumnHeader label="컨텐츠 제출" />
    </div>
  );
}

function CampaignStatusActions({
  campaign,
  onUpdateStatus,
}: {
  campaign: CampaignGroup;
  onUpdateStatus: (
    campaign: CampaignGroup,
    status: CampaignStatusAction,
  ) => Promise<void>;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();
  const actions = getCampaignStatusActions(campaign);

  if (actions.length === 0) return null;

  const handleUpdate = async (action: (typeof actions)[number]) => {
    if (isUpdating) return;

    const confirmed = window.confirm(action.confirmMessage);
    if (!confirmed) return;

    setIsUpdating(true);
    setError(undefined);
    try {
      await onUpdateStatus(campaign, action.status);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "캠페인 상태를 변경하지 못했습니다.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.status}
              type="button"
              onClick={() => void handleUpdate(action)}
              disabled={isUpdating}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[12px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${action.className}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {isUpdating ? "변경 중" : action.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-right text-[11px] font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function _CampaignWorkflowPanel({ campaign }: { campaign: CampaignGroup }) {
  const alerts = buildCampaignAlerts([campaign]);
  const activities = buildCampaignActivities(campaign);

  return (
    <div className="grid gap-2 border-b border-[#d9e0d9] bg-white p-3 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
      <div className="rounded-[8px] border border-[#d9e0d9] bg-[#fbfbf8] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-extrabold text-[#303630]">
            처리할 일
          </p>
          <span className="text-[11px] font-semibold text-[#7d857f]">
            {alerts.length.toLocaleString()}건
          </span>
        </div>
        {alerts.length > 0 ? (
          <div className="mt-2 grid gap-1.5">
            {alerts.slice(0, 4).map((alert) => (
              <div
                key={alert.id}
                className={`rounded-md border px-2.5 py-2 ${getCampaignAlertToneClass(alert.tone)}`}
              >
                <p className="text-[12px] font-extrabold">{alert.label}</p>
                <p className="mt-0.5 text-[11px] font-semibold opacity-75">
                  {alert.detail}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12px] font-semibold leading-5 text-[#7d857f]">
            지금 이 캠페인에서 바로 처리할 알림이 없습니다.
          </p>
        )}
      </div>

      <div className="rounded-[8px] border border-[#d9e0d9] bg-[#fbfbf8] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-extrabold text-[#303630]">
            활동 기록
          </p>
          <span className="text-[11px] font-semibold text-[#7d857f]">
            최근 {activities.length.toLocaleString()}건
          </span>
        </div>
        {activities.length > 0 ? (
          <div className="mt-2 grid gap-2">
            {activities.slice(0, 5).map((activity) => (
              <div
                key={activity.id}
                className="grid gap-1 border-l-2 border-[#d9e0d9] pl-2.5"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-extrabold text-[#171a17]">
                    {activity.actor} · {activity.title}
                  </p>
                  <span className="shrink-0 text-[11px] font-semibold text-[#9aa39d]">
                    {formatCampaignActivityDate(activity.createdAt)}
                  </span>
                </div>
                <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-[#606861]">
                  {activity.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12px] font-semibold leading-5 text-[#7d857f]">
            아직 이 캠페인에 표시할 활동 기록이 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}

function CampaignApplicantsPanel({
  campaign,
  marketplaceStatus,
  marketplaceError,
  onAcceptApplication,
}: {
  campaign: CampaignGroup;
  marketplaceStatus: MarketplaceDashboardState["status"];
  marketplaceError?: string;
  onAcceptApplication: (thread: MarketplaceMessageThread) => Promise<void>;
}) {
  const applicants = campaign.applicants;
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] =
    useState<ApplicantPlatformFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<ApplicantStatusFilter>("ALL");
  const [sortValue, setSortValue] =
    useState<ApplicantSortValue>("audience_desc");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleApplicants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return applicants
      .filter((thread) => {
        const searchableText = [
          getCampaignApplicantDisplayName(thread),
          thread.counterpartIntro,
          thread.senderIntro,
          thread.campaignTitle,
          ...thread.platforms.flatMap((platform) => [
            platform.label,
            platform.handle,
            platform.followersLabel,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!normalizedQuery || searchableText.includes(normalizedQuery)) &&
          (platformFilter === "ALL" ||
            thread.platforms.some(
              (platform) => platform.platform === platformFilter,
            )) &&
          (statusFilter === "ALL" || thread.status === statusFilter)
        );
      })
      .sort((a, b) => compareCampaignApplicantsBySort(a, b, sortValue));
  }, [applicants, platformFilter, query, sortValue, statusFilter]);

  const activeFilters = useMemo(
    () =>
      [
        query.trim()
          ? {
              id: "applicant-query",
              label: `검색 ${query.trim()}`,
              onRemove: () => setQuery(""),
            }
          : null,
        platformFilter !== "ALL"
          ? {
              id: "applicant-platform",
              label: platformLabels[platformFilter],
              onRemove: () => setPlatformFilter("ALL"),
            }
          : null,
        statusFilter !== "ALL"
          ? {
              id: "applicant-status",
              label: APPLICANT_STATUS_META[statusFilter].label,
              onRemove: () => setStatusFilter("ALL"),
            }
          : null,
      ].filter(isAppliedFilter),
    [platformFilter, query, statusFilter],
  );

  return (
    <div className="border-b border-[#d9e0d9] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold text-[#171a17]">
            지원자
          </p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
            {visibleApplicants.length.toLocaleString("ko-KR")}명 표시 · 전체{" "}
            {applicants.length.toLocaleString("ko-KR")}명
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={sortValue}
            onChange={(event) =>
              setSortValue(event.target.value as ApplicantSortValue)
            }
            aria-label="지원자 정렬"
            className="h-8 max-w-[180px] rounded-[6px] border border-[#d9e0d9] bg-white px-2 text-[11px] font-bold text-[#303630] outline-none transition-colors hover:border-[#cbd5cc] focus:border-[#171a17]"
          >
            {APPLICANT_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <DashboardFilterToggleButton
            open={filtersOpen}
            activeCount={activeFilters.length}
            controlsId="campaign-applicant-filters"
            onClick={() => setFiltersOpen((current) => !current)}
          />
        </div>
      </div>
      <DashboardAppliedFilterBar
        filters={activeFilters}
        onClearAll={() => {
          setQuery("");
          setPlatformFilter("ALL");
          setStatusFilter("ALL");
        }}
      />
      {filtersOpen ? (
        <div
          id="campaign-applicant-filters"
          className="grid gap-2 border-t border-[#edf1ed] bg-[#f8faf7] p-2 lg:grid-cols-[minmax(220px,0.8fr)_minmax(130px,0.4fr)_minmax(130px,0.4fr)]"
        >
          <CampaignSearch
            label="이름"
            placeholder="이름, 채널 검색"
            ariaLabel="지원자 검색"
            value={query}
            onChange={setQuery}
            compact
          />
          <TableFilterSelect
            label="플랫폼"
            value={platformFilter}
            options={APPLICANT_PLATFORM_FILTERS.map((platform) => ({
              value: platform,
              label: platform === "ALL" ? "전체" : platformLabels[platform],
            }))}
            onChange={(value) =>
              setPlatformFilter(value as ApplicantPlatformFilter)
            }
            compact
          />
          <TableFilterSelect
            label="상태"
            value={statusFilter}
            options={APPLICANT_STATUS_FILTERS.map((status) => ({
              value: status,
              label:
                status === "ALL" ? "전체" : APPLICANT_STATUS_META[status].label,
            }))}
            onChange={(value) => setStatusFilter(value as ApplicantStatusFilter)}
            compact
          />
        </div>
      ) : null}

      {marketplaceStatus === "error" ? (
        <p className="border-t border-[#edf1ed] px-3 py-2 text-[12px] font-semibold text-rose-700">
          {marketplaceError ?? "지원자 목록을 불러오지 못했습니다."}
        </p>
      ) : applicants.length > 0 ? (
        <div className="divide-y divide-[#edf1ed] border-t border-[#edf1ed]">
          {visibleApplicants.length > 0 ? (
            visibleApplicants.map((thread) => (
              <React.Fragment key={thread.id}>
                <CampaignApplicantRow
                  thread={thread}
                  onAcceptApplication={onAcceptApplication}
                />
              </React.Fragment>
            ))
          ) : (
            <div className="px-3 py-4 text-[12px] font-semibold text-[#7d857f]">
              조건에 맞는 지원자가 없습니다.
            </div>
          )}
        </div>
      ) : (
        <div className="border-t border-[#edf1ed] px-3 py-4 text-[12px] font-semibold text-[#7d857f]">
          {marketplaceStatus === "loading"
            ? "지원자 목록을 불러오는 중입니다."
            : "아직 이 캠페인에 지원한 인플루언서가 없습니다."}
        </div>
      )}
    </div>
  );
}

function compareCampaignApplicantsBySort(
  a: MarketplaceMessageThread,
  b: MarketplaceMessageThread,
  sortValue: ApplicantSortValue,
) {
  if (sortValue === "audience_desc" || sortValue === "audience_asc") {
    const audienceCompare = compareChannelAudienceValues(
      getChannelAudienceSortValue(getCampaignApplicantDisplayPlatforms(a)),
      getChannelAudienceSortValue(getCampaignApplicantDisplayPlatforms(b)),
      sortValue === "audience_asc" ? "asc" : "desc",
    );
    if (audienceCompare !== 0) return audienceCompare;
  }

  if (sortValue === "recent") {
    const recentCompare =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (Number.isFinite(recentCompare) && recentCompare !== 0) {
      return recentCompare;
    }
  }

  return getCampaignApplicantDisplayName(a).localeCompare(
    getCampaignApplicantDisplayName(b),
    "ko-KR",
  );
}

function getCampaignApplicantDisplayName(thread: MarketplaceMessageThread) {
  return removeInternalTestLabel(
    thread.counterpartName || thread.senderName,
    "인플루언서",
  );
}

function CampaignApplicantRow({
  thread,
  onAcceptApplication,
}: {
  thread: MarketplaceMessageThread;
  onAcceptApplication: (thread: MarketplaceMessageThread) => Promise<void>;
}) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string>();
  const statusMeta = APPLICANT_STATUS_META[thread.status];
  const canAccept =
    !thread.convertedContractId &&
    (thread.status === "submitted" || thread.status === "reviewed");

  const handleAccept = async () => {
    if (!canAccept || isAccepting) return;

    const confirmed = window.confirm(
      `${thread.counterpartName || thread.senderName}을 선정할까요? 선정하면 계약이 생성됩니다.`,
    );
    if (!confirmed) return;

    setIsAccepting(true);
    setAcceptError(undefined);
    try {
      await onAcceptApplication(thread);
    } catch (error) {
      setAcceptError(
        error instanceof Error ? error.message : "선정에 실패했습니다.",
      );
    } finally {
      setIsAccepting(false);
    }
  };

  const applicantName = getCampaignApplicantDisplayName(thread);
  const fallbackProfile = findInfluencerProfileByDisplayName(applicantName);
  const displayPlatforms = getCampaignApplicantDisplayPlatforms(
    thread,
    fallbackProfile,
  );
  const initial = applicantName.trim().slice(0, 1) || "인";
  const profileHref =
    thread.counterpartHref ||
    (fallbackProfile ? getInfluencerProfilePath(fallbackProfile) : undefined);
  const avatarUrl = getMarketplaceInfluencerAvatarUrlFromHref(
    profileHref,
    thread.counterpartAvatarUrl,
  );
  const rawIntro = thread.senderIntro || thread.proposalSummary || "";
  const intro =
    rawIntro && !isGenericCampaignApplicantIntro(rawIntro) ? rawIntro : "";
  const firstPlatform = displayPlatforms[0];
  const primaryHandle =
    firstPlatform?.handle ||
    firstPlatform?.followersLabel ||
    (firstPlatform ? platformLabels[firstPlatform.platform] : "채널 확인");
  const avatarMark = (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#171a17] text-[15px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${applicantName} profile`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        initial
      )}
    </span>
  );

  const hasProfileAction = Boolean(profileHref);
  const primaryActionSpan = hasProfileAction ? "" : "col-span-2";

  return (
    <div className="grid gap-3 px-3 py-3 lg:min-h-[64px] lg:grid-cols-[minmax(260px,0.82fr)_minmax(280px,0.78fr)_190px] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        {profileHref ? (
          <Link
            to={profileHref}
            className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171a17]"
            aria-label={`${applicantName} 프로필 보기`}
          >
            {avatarMark}
          </Link>
        ) : (
          avatarMark
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            {profileHref ? (
              <Link
                to={profileHref}
                className="truncate text-[14px] font-extrabold text-[#171a17] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171a17]"
                title={`${applicantName} 프로필 보기`}
              >
                {applicantName}
              </Link>
            ) : (
              <p className="truncate text-[14px] font-extrabold text-[#171a17]">
                {applicantName}
              </p>
            )}
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          </div>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-[#606861]">
            {primaryHandle}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <ApplicantPlatformLinks platforms={displayPlatforms} />
        {intro ? (
          <p className="mt-1 truncate text-[12px] font-semibold text-[#606861]">
            {intro}
          </p>
        ) : null}
        <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
          <span
            className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-extrabold ${statusMeta.className}`}
          >
            {statusMeta.label}
          </span>
          <span className="inline-flex h-6 items-center rounded-md border border-[#d9e0d9] bg-white px-2 text-[11px] font-bold text-[#606861]">
            지원 {formatCampaignActivityDate(thread.createdAt)}
          </span>
          <span className="inline-flex h-6 items-center rounded-md border border-[#d9e0d9] bg-white px-2 text-[11px] font-bold text-[#606861]">
            {thread.proposalTypeLabel}
          </span>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-1.5 sm:w-[190px] sm:justify-self-end">
        {profileHref ? (
          <Link
            to={profileHref}
            className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border border-[#d9e0d9] bg-white px-2 text-[12px] font-extrabold text-[#303630] transition hover:border-[#171a17] hover:text-[#171a17]"
          >
            프로필
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        {thread.convertedContractId ? (
          <a
            href={`/advertiser/contract/${thread.convertedContractId}`}
            className={`${primaryActionSpan} inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md bg-[#171a17] px-2 text-[12px] font-extrabold text-white transition hover:bg-black`}
          >
            계약 보기
          </a>
        ) : canAccept ? (
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={isAccepting}
            className={`${primaryActionSpan} inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 text-[12px] font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300`}
          >
            {isAccepting ? "선정 중" : "선정"}
          </button>
        ) : (
          <span
            className={`${primaryActionSpan} inline-flex h-9 min-w-0 items-center justify-center rounded-md border px-2 text-[12px] font-extrabold ${statusMeta.className}`}
          >
            {statusMeta.label}
          </span>
        )}
        {acceptError ? (
          <p className="col-span-2 text-[11px] font-semibold text-rose-700 sm:text-right">
            {acceptError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function isGenericCampaignApplicantIntro(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return (
    normalized.length === 0 ||
    /캠페인\s*지원\s*데이터입니다\.?$/.test(normalized)
  );
}

function getCampaignApplicantDisplayPlatforms(
  thread: MarketplaceMessageThread,
  fallbackProfile?: MarketplaceInfluencerProfile,
) {
  if (!thread.counterpartHref && fallbackProfile?.platforms.length) {
    return fallbackProfile.platforms;
  }

  return thread.platforms;
}

function ApplicantPlatformLinks({
  platforms,
}: {
  platforms: MarketplaceMessageThread["platforms"];
}) {
  const visiblePlatforms =
    platforms.length > 0
      ? platforms
      : [
          {
            platform: "other" as InfluencerPlatform,
            label: platformLabels.other,
          },
        ];

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visiblePlatforms.slice(0, 3).map((item, index) => {
        const label = platformLabels[item.platform] ?? item.label;
        const text = item.followersLabel ? `${label} ${item.followersLabel}` : label;
        const key = `${item.platform}-${item.handle ?? item.url ?? index}`;
        const platformMeta =
          PLATFORM_META[marketplacePlatformToContractPlatform(item.platform)];
        const content = (
          <>
            <span className="shrink-0">{platformMeta.mark}</span>
            <span className="truncate">{text}</span>
          </>
        );

        if (item.url) {
          return (
            <a
              key={key}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-[11px] font-extrabold transition hover:brightness-[0.98] ${platformMeta.className}`}
              title={item.handle ? `${text} · ${item.handle}` : text}
            >
              {content}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          );
        }

        return (
          <span
            key={key}
            className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-[11px] font-extrabold ${platformMeta.className}`}
            title={item.handle ? `${text} · ${item.handle}` : text}
          >
            {content}
          </span>
        );
      })}
      {visiblePlatforms.length > 3 ? (
        <span className="inline-flex h-7 items-center rounded-md border border-[#d9e0d9] bg-white px-2 text-[11px] font-extrabold text-[#7d857f]">
          +{visiblePlatforms.length - 3}
        </span>
      ) : null}
    </div>
  );
}

function CampaignInfluencerRow({
  contract,
  onOpen,
}: {
  contract: Contract;
  onOpen: () => void;
}) {
  const progress = getCampaignProgressStatus(contract);
  const deadline = formatCampaignDeadline(contract);
  const postLink = contract.post_link;
  const contentSubmitted = isContractContentSubmitted(contract);

  return (
    <div className="grid gap-2 px-3 py-3 lg:min-h-[46px] lg:grid-cols-[minmax(180px,0.7fr)_minmax(130px,0.36fr)_minmax(130px,0.34fr)_minmax(130px,0.34fr)_minmax(160px,0.45fr)] lg:items-center lg:py-2">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 text-left text-[13px] font-semibold text-[#171a17] underline-offset-4 hover:underline"
      >
        <span className="block truncate">
          {removeInternalTestLabel(contract.influencer_info.name, "인플루언서")}
        </span>
      </button>
      <PlatformPills contract={contract} />
      <span
        className={`inline-flex w-fit items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${progress.className}`}
      >
        {progress.label}
      </span>
      <span className="text-[12px] font-semibold text-[#303630]">
        {deadline}
      </span>
      <span className="min-w-0">
        {postLink ? (
          <a
            href={postLink}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex max-w-full items-center gap-1.5 text-[12px] font-semibold text-[#171a17] underline underline-offset-4"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">컨텐츠 제출 링크 열기</span>
          </a>
        ) : contentSubmitted ? (
          <span className="text-[12px] font-semibold text-[#303630]">
            컨텐츠 제출
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-[#9aa39d]">
            컨텐츠 미제출
          </span>
        )}
      </span>
    </div>
  );
}

function ContractTable({
  lifecycleFilter,
  lifecycleTabs,
  contracts,
  totalContracts,
  query,
  onQueryChange,
  platformFilter,
  onPlatformFilterChange,
  contractTypeFilter,
  onContractTypeFilterChange,
  amountFilter,
  onAmountFilterChange,
  detailStatusFilter,
  onDetailStatusFilterChange,
  sortState,
  onSortChange,
  isDataPending = false,
  onOpen,
}: {
  lifecycleFilter: CampaignLifecycle;
  lifecycleTabs?: React.ReactNode;
  contracts: Contract[];
  totalContracts: number;
  query: string;
  onQueryChange: (value: string) => void;
  platformFilter: PlatformFilter;
  onPlatformFilterChange: (value: PlatformFilter) => void;
  contractTypeFilter: ContractTypeFilter;
  onContractTypeFilterChange: (value: ContractTypeFilter) => void;
  amountFilter: AmountFilter;
  onAmountFilterChange: (value: AmountFilter) => void;
  detailStatusFilter: DetailStatusFilter;
  onDetailStatusFilterChange: (value: DetailStatusFilter) => void;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
  isDataPending?: boolean;
  onOpen: (contract: Contract) => void;
}) {
  const platformOptions = PLATFORM_FILTERS.map((platform) => ({
    value: platform,
    label: formatPlatformFilterLabel(platform),
  }));
  const contractTypeOptions = CONTRACT_TYPE_FILTERS.map((type) => ({
    value: type,
    label: type === "ALL" ? "전체" : formatContractTypeFilterLabel(type),
  }));
  const statusOptions = DETAIL_STATUS_FILTERS.map((status) => ({
    value: status,
    label: status === "ALL" ? "전체" : STATUS_META[status].shortLabel,
  }));
  const amountOptions = AMOUNT_FILTERS.map((amount) => ({
    value: amount,
    label: formatAmountFilterLabel(amount),
  }));
  const activeFilters = [
    platformFilter !== "ALL"
      ? {
          id: "platform",
          label:
            platformOptions.find((option) => option.value === platformFilter)?.label ??
            platformFilter,
          onRemove: () => onPlatformFilterChange("ALL"),
        }
      : null,
    contractTypeFilter !== "ALL"
      ? {
          id: "type",
          label:
            contractTypeOptions.find((option) => option.value === contractTypeFilter)
              ?.label ?? contractTypeFilter,
          onRemove: () => onContractTypeFilterChange("ALL"),
        }
      : null,
    amountFilter !== "ALL"
      ? {
          id: "amount",
          label:
            amountOptions.find((option) => option.value === amountFilter)?.label ??
            amountFilter,
          onRemove: () => onAmountFilterChange("ALL"),
        }
      : null,
    detailStatusFilter !== "ALL"
      ? {
          id: "status",
          label:
            statusOptions.find((option) => option.value === detailStatusFilter)?.label ??
            detailStatusFilter,
          onRemove: () => onDetailStatusFilterChange("ALL"),
        }
      : null,
    query.trim()
      ? {
          id: "query",
          label: `검색 ${query.trim()}`,
          onRemove: () => onQueryChange(""),
        }
      : null,
  ].filter(isAppliedFilter);
  const filterSummary =
    activeFilters.length > 0 ? `${activeFilters.length}개 조건 적용` : "전체 조건";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const displayContracts = collapseInternalDuplicateContracts(
    contracts,
    getDashboardContractCollapseKey,
  );
  const dateColumnLabel = lifecycleFilter === "ENDED" ? "종료일" : "마감일";

  return (
    <section className="overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      {lifecycleTabs}
      <div className="border-b border-[#d9e0d9] bg-white">
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
              계약 목록
            </p>
            {isDataPending ? (
              <span
                className="mt-1 block h-3 w-24 rounded-full bg-neutral-100"
                aria-hidden="true"
              />
            ) : (
              <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
                {displayContracts.length.toLocaleString("ko-KR")}건 표시 · {filterSummary}
              </p>
            )}
          </div>
          <DashboardFilterToggleButton
            open={filtersOpen}
            activeCount={activeFilters.length}
            onClick={() => setFiltersOpen((current) => !current)}
            controlsId="advertiser-contract-filters"
          />
        </div>
        <DashboardAppliedFilterBar
          filters={activeFilters}
          onClearAll={() => {
            onPlatformFilterChange("ALL");
            onContractTypeFilterChange("ALL");
            onAmountFilterChange("ALL");
            onDetailStatusFilterChange("ALL");
            onQueryChange("");
          }}
        />
        {filtersOpen ? (
          <div
            id="advertiser-contract-filters"
            className="grid gap-2 border-t border-[#edf1ed] bg-[#f8faf7] p-2 lg:grid-cols-[minmax(130px,0.32fr)_minmax(120px,0.28fr)_minmax(260px,0.7fr)_minmax(120px,0.28fr)_minmax(130px,0.3fr)]"
          >
            <TableFilterSelect
              label="플랫폼"
              value={platformFilter}
              options={platformOptions}
              onChange={(value) => onPlatformFilterChange(value as PlatformFilter)}
              compact
            />
            <TableFilterSelect
              label="종류"
              value={contractTypeFilter}
              options={contractTypeOptions}
              onChange={(value) => onContractTypeFilterChange(value as ContractTypeFilter)}
              compact
            />
            <ContractNameSearch
              value={query}
              onChange={onQueryChange}
              sortKey="title"
              sortState={sortState}
              onSortChange={onSortChange}
              compact
            />
            <TableFilterSelect
              label="지급내용"
              value={amountFilter}
              options={amountOptions}
              onChange={(value) => onAmountFilterChange(value as AmountFilter)}
              compact
            />
            <TableFilterSelect
              label="현 단계"
              value={detailStatusFilter}
              options={statusOptions}
              onChange={(value) => onDetailStatusFilterChange(value as DetailStatusFilter)}
              compact
            />
          </div>
        ) : null}
      </div>
      <ContractTableHeaderRow
        dateColumnLabel={dateColumnLabel}
        sortState={sortState}
        onSortChange={onSortChange}
      />

      <div className="no-scrollbar max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1">
        {isDataPending ? (
          <ContractTableSkeletonRows />
        ) : displayContracts.length > 0 ? (
          displayContracts.map((contract) => (
            <React.Fragment key={contract.id}>
              <ContractRow
                contract={contract}
                lifecycleFilter={lifecycleFilter}
                onOpen={() => onOpen(contract)}
              />
            </React.Fragment>
          ))
        ) : (
          <EmptyState isInitialEmpty={totalContracts === 0} />
        )}
      </div>
    </section>
  );
}

function ContractTableSkeletonRows() {
  return (
    <div className="divide-y divide-[#edf1ed]" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="grid min-h-[56px] grid-cols-[88px_minmax(0,1fr)] items-center gap-2 px-3 py-2 lg:grid-cols-[minmax(132px,0.34fr)_minmax(108px,0.26fr)_minmax(300px,1fr)_minmax(132px,0.34fr)_minmax(146px,0.38fr)_minmax(112px,0.3fr)]"
        >
          <span className="h-6 w-20 rounded-md bg-neutral-100" />
          <span className="h-3 w-16 rounded-full bg-neutral-100" />
          <span className="h-4 w-4/5 rounded-full bg-neutral-100" />
          <span className="h-3 w-24 rounded-full bg-neutral-100" />
          <span className="h-3 w-28 rounded-full bg-neutral-100" />
          <span className="h-6 w-20 rounded-md bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function ContractTableHeaderRow({
  dateColumnLabel,
  sortState,
  onSortChange,
}: {
  dateColumnLabel: string;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
}) {
  return (
    <div className="hidden border-b border-[#d7ddd7] bg-[#f7f8f4] px-3 py-2.5 lg:grid lg:grid-cols-[minmax(132px,0.34fr)_minmax(108px,0.26fr)_minmax(300px,1fr)_minmax(132px,0.34fr)_minmax(146px,0.38fr)_minmax(112px,0.3fr)] lg:items-center lg:gap-2">
      <ColumnHeader
        label="플랫폼"
        sortKey="platform"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="종류"
        sortKey="type"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="계약명"
        sortKey="title"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="지급내용"
        sortKey="amount"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label={dateColumnLabel}
        sortKey="deadline"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="현 단계"
        sortKey="status"
        sortState={sortState}
        onSortChange={onSortChange}
      />
    </div>
  );
}

function ContractNameSearch({
  value,
  onChange,
  sortKey,
  sortState,
  onSortChange,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  sortKey?: SortKey;
  sortState?: ContractSort;
  onSortChange?: (key: SortKey) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-2"
          : "block min-w-0 lg:w-[90%]"
      }
    >
      <ColumnHeader
        label="계약명"
        sortKey={sortKey}
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <span className={`relative block ${compact ? "" : "mt-1"}`}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="계약명 검색"
          placeholder="계약명으로 검색"
          className="h-10 w-full max-w-full rounded-[6px] border border-[#d9e0d9] bg-white pl-7 pr-2 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17]"
        />
      </span>
    </div>
  );
}

function TableFilterSelect({
  label,
  value,
  options,
  maxWidthClassName = "w-full",
  sortKey,
  sortState,
  onSortChange,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  maxWidthClassName?: string;
  sortKey?: SortKey;
  sortState?: ContractSort;
  onSortChange?: (key: SortKey) => void;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-2"
          : "block min-w-0"
      }
    >
      <ColumnHeader
        label={label}
        sortKey={sortKey}
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} 필터`}
        className={`block h-9 max-w-full ${maxWidthClassName} ${
          compact ? "" : "mt-1"
        } rounded-[6px] border border-[#d9e0d9] bg-white px-2 text-[12px] font-bold text-[#303630] outline-none transition-colors hover:border-[#cbd5cc] focus:border-[#171a17]`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColumnHeader({
  label,
  sortKey,
  sortState,
  onSortChange,
}: {
  label: string;
  sortKey?: SortKey;
  sortState?: ContractSort;
  onSortChange?: (key: SortKey) => void;
}) {
  const active = Boolean(sortKey && sortState?.key === sortKey);

  return (
    <div className="flex h-7 min-w-0 items-center gap-1.5">
      <span
        className={`block truncate text-[12px] font-black tracking-[-0.01em] ${
          active ? "text-[#171a17]" : "text-[#303630]"
        }`}
      >
        {label}
      </span>
      {sortKey && sortState && onSortChange ? (
        <SortButton
          label={label}
          sortKey={sortKey}
          sortState={sortState}
          onSortChange={onSortChange}
        />
      ) : null}
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  sortState,
  onSortChange,
}: {
  label: string;
  sortKey: SortKey;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
}) {
  const active = sortState.key === sortKey;
  const Icon = active
    ? sortState.direction === "asc"
      ? ArrowUpWideNarrow
      : ArrowDownWideNarrow
    : ArrowUpDown;
  const nextDirection =
    active && sortState.direction === "asc" ? "내림차순" : "오름차순";

  return (
    <button
      type="button"
      onClick={() => onSortChange(sortKey)}
      aria-label={`${label} ${nextDirection} 정렬`}
      title={`${label} ${nextDirection} 정렬`}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] transition-colors ${
        active
          ? "bg-[#171a17] text-white"
          : "text-[#9aa39d] hover:bg-[#eef0ed] hover:text-[#303630]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
    </button>
  );
}

function ContractRow({
  contract,
  lifecycleFilter,
  onOpen,
}: {
  contract: Contract;
  lifecycleFilter: CampaignLifecycle;
  onOpen: () => void;
}) {
  const typeLabel = formatContractTypeLabel(contract.type);
  const amountLabel = formatDashboardAmountLabel(contract.campaign?.budget);
  const dateLabel = formatDashboardContractDateLabel(contract, lifecycleFilter);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-[#f8faf7] lg:min-h-[38px] lg:grid-cols-[minmax(132px,0.34fr)_minmax(108px,0.26fr)_minmax(300px,1fr)_minmax(132px,0.34fr)_minmax(146px,0.38fr)_minmax(112px,0.3fr)] lg:items-center lg:py-1.5"
    >
      <div className="flex min-w-0 items-center justify-between gap-2 lg:block">
        <PlatformPills contract={contract} />
        <span className="shrink-0 lg:hidden">
          <StatusBadge status={contract.status} dense />
        </span>
      </div>

      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-[12px] font-semibold text-[#303630]">
          {typeLabel}
        </p>
      </div>

      <div className="min-w-0">
        <p className="min-w-0 truncate text-[13px] font-semibold text-[#171a17]">
          {formatDashboardContractTitle(contract.title)}
        </p>
        <p className="mt-1 min-w-0 truncate text-[11px] font-semibold text-[#606861] lg:hidden">
          {typeLabel} · {amountLabel} · {dateLabel}
        </p>
      </div>

      <div className="hidden min-w-0 lg:block">
        <AmountCell value={contract.campaign?.budget} />
      </div>

      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-[12px] font-semibold tabular-nums text-[#303630]">
          {dateLabel}
        </p>
      </div>

      <StatusTiming contract={contract} />
    </button>
  );
}

function AmountCell({ value }: { value?: string | null }) {
  const label = formatDashboardAmountLabel(value);

  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] font-semibold text-[#303630]">{label}</p>
    </div>
  );
}

function StatusBadge({
  status,
  dense = false,
  inverted = false,
}: {
  status: ContractStatus;
  dense?: boolean;
  inverted?: boolean;
}) {
  const meta = STATUS_META[status];
  const className = inverted
    ? "border-white/10 bg-white/10 text-white"
    : meta.badge;

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border font-semibold ${className} ${
        dense ? "px-2 py-1 text-[11px]" : "px-2 py-1 text-[11px]"
      }`}
    >
      <span className={inverted ? "text-white" : meta.tone}>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function StatusTiming({
  contract,
}: {
  contract: Contract;
}) {
  return (
    <div className="hidden min-w-0 lg:block">
      <StatusBadge status={contract.status} />
    </div>
  );
}

function EmptyState({ isInitialEmpty }: { isInitialEmpty: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {isInitialEmpty ? "아직 계약이 없습니다" : "조건에 맞는 계약이 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {isInitialEmpty
          ? "상대 정보와 합의 조건을 입력해 새 계약을 만들고 바로 관리할 수 있습니다."
          : "검색어를 줄이거나 전체로 바꿔보세요."}
      </p>
    </section>
  );
}

function CampaignLoadingState() {
  return (
    <section className="flex min-h-[280px] flex-col items-center justify-center rounded-[8px] border border-[#d9e0d9] bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <Clock3 className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        캠페인 현황을 불러오는 중
      </h2>
    </section>
  );
}

function CampaignEmptyState({ isInitialEmpty }: { isInitialEmpty: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <Megaphone className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {isInitialEmpty ? "아직 캠페인이 없습니다" : "조건에 맞는 캠페인이 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {isInitialEmpty
          ? "캠페인 작성에서 모집 조건을 만들면 이곳에서 지원자와 계약 전환을 관리합니다."
          : "검색어를 줄이거나 전체로 바꿔보세요."}
      </p>
    </section>
  );
}

function CampaignDataErrorPanel({ message }: { message: string }) {
  return (
    <section className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-800">
      <p className="font-semibold">캠페인 현황을 최신 상태로 불러오지 못했습니다.</p>
      <p className="mt-1 text-amber-700">
        현재 화면은 비어 있는 데이터가 아니라 실패 상태일 수 있습니다.
      </p>
      <p className="mt-2 font-mono text-[11px] text-amber-700">{message}</p>
    </section>
  );
}

function SyncErrorPanel({ message }: { message: string }) {
  return (
    <section className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-800">
      <p className="font-semibold">계약 목록을 최신 상태로 불러오지 못했습니다.</p>
      <p className="mt-1 text-amber-700">
        서버 연결이나 권한을 확인해야 합니다. 현재 화면은 비어 있는 데이터가 아니라 실패 상태일 수 있습니다.
      </p>
      <p className="mt-2 font-mono text-[11px] text-amber-700">{message}</p>
    </section>
  );
}

function getContractPlatforms(contract: Contract): ContractPlatform[] {
  if (contract.campaign?.platforms?.length) return contract.campaign.platforms;

  const source = [
    contract.influencer_info.channel_url,
    ...(contract.campaign?.deliverables ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const platforms = new Set<ContractPlatform>();

  if (source.includes("instagram") || source.includes("인스타")) platforms.add("INSTAGRAM");
  if (source.includes("youtube") || source.includes("youtu") || source.includes("유튜브")) platforms.add("YOUTUBE");
  if (source.includes("tiktok") || source.includes("틱톡")) platforms.add("TIKTOK");
  if (source.includes("naver") || source.includes("blog") || source.includes("블로그")) platforms.add("NAVER_BLOG");

  return platforms.size > 0 ? Array.from(platforms) : ["OTHER"];
}

function formatContractTypeLabel(type: Contract["type"]) {
  if (type === "PPL") return "유료 광고 (PPL)";
  if (type === "협찬") return "제품 협찬";
  if (type === "공동구매") return "공동구매";
  return type;
}

function formatContractTypeFilterLabel(type: Contract["type"]) {
  if (type === "PPL") return "PPL";
  if (type === "협찬") return "협찬";
  if (type === "공동구매") return "공동구매";
  return type;
}

function formatAmountFilterLabel(filter: AmountFilter) {
  if (filter === "FIXED") return "정액";
  if (filter === "COMMISSION") return "수수료";
  return "전체";
}

function getAmountFilterKind(value?: string | null): ActualAmountKind {
  const text = `${value ?? ""} ${formatMoneyLabel(value, "")}`.toLowerCase();

  if (/%|commission|수수료|판매\s*수익/.test(text)) return "COMMISSION";
  return "FIXED";
}

function formatDashboardAmountLabel(value?: string | null) {
  const label = formatMoneyLabel(value, "-").replace(/\s+/g, " ").trim();
  const percentMatch = label.match(/(\d+(?:\.\d+)?)\s*%/);

  if (percentMatch) return `수수료 ${percentMatch[1]}%`;
  return label || "-";
}

function _compareContractsBySort(a: Contract, b: Contract, sort: ContractSort) {
  let result: number;

  switch (sort.key) {
    case "platform":
      result = compareText(getPlatformSortLabel(a), getPlatformSortLabel(b));
      break;
    case "type":
      result = compareText(formatContractTypeLabel(a.type), formatContractTypeLabel(b.type));
      break;
    case "title":
      result = compareText(
        formatDashboardContractTitle(a.title),
        formatDashboardContractTitle(b.title),
      );
      break;
    case "amount":
      result = compareAmountValues(a.campaign?.budget, b.campaign?.budget);
      break;
    case "deadline":
      result = compareOptionalDateValues(
        getDashboardContractDateValue(a, getDashboardContractLifecycle(a)),
        getDashboardContractDateValue(b, getDashboardContractLifecycle(b)),
      );
      break;
    case "status":
      result = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      break;
    case "updated":
    default:
      result = parseDate(a.updated_at) - parseDate(b.updated_at);
      break;
  }

  if (result === 0) {
    result = compareText(formatDashboardContractTitle(a.title), formatDashboardContractTitle(b.title));
  }

  return sort.direction === "asc" ? result : -result;
}

function compareCampaignGroupsBySort(
  a: CampaignGroup,
  b: CampaignGroup,
  sort: ContractSort,
) {
  let result: number;

  switch (sort.key) {
    case "platform":
      result = compareText(
        formatCampaignPlatformSummary(a.platforms),
        formatCampaignPlatformSummary(b.platforms),
      );
      break;
    case "brand":
      result = compareText(a.brands.join(" "), b.brands.join(" "));
      break;
    case "title":
      result = compareText(a.name, b.name);
      break;
    case "amount":
      result = compareAmountValues(
        getCampaignPaymentLabel(a),
        getCampaignPaymentLabel(b),
      );
      break;
    case "participants":
      result = compareCampaignParticipantValues(a, b);
      break;
    case "deadline":
      result = compareOptionalDateValues(
        getCampaignListDateSortValue(a),
        getCampaignListDateSortValue(b),
      );
      break;
    case "updated":
    default:
      result = parseDate(a.latestUpdatedAt) - parseDate(b.latestUpdatedAt);
      break;
  }

  if (result === 0) result = compareText(a.name, b.name);

  return sort.direction === "asc" ? result : -result;
}

function compareCampaignParticipantValues(a: CampaignGroup, b: CampaignGroup) {
  const currentA = getCampaignDisplayParticipantCount(a);
  const currentB = getCampaignDisplayParticipantCount(b);
  const capacityA = getCampaignCapacity(a);
  const capacityB = getCampaignCapacity(b);
  const ratioA = capacityA ? currentA / capacityA : currentA > 0 ? 0.01 : 0;
  const ratioB = capacityB ? currentB / capacityB : currentB > 0 ? 0.01 : 0;

  return (
    ratioA - ratioB ||
    currentA - currentB ||
    (capacityA ?? Number.POSITIVE_INFINITY) -
      (capacityB ?? Number.POSITIVE_INFINITY)
  );
}

function getCampaignListDateSortValue(campaign: CampaignGroup) {
  return campaign.lifecycle === "ENDED"
    ? getCampaignEndedDateValue(campaign)
    : getCampaignDeadlineValue(campaign);
}

function getPlatformSortLabel(contract: Contract) {
  return getContractPlatforms(contract)
    .map((platform) => PLATFORM_META[platform].shortLabel)
    .join(" ");
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareAmountValues(a?: string | null, b?: string | null) {
  const amountA = getAmountSortMeta(a);
  const amountB = getAmountSortMeta(b);

  if (amountA.kind !== amountB.kind) {
    return amountA.kind === "FIXED" ? -1 : 1;
  }

  if (Number.isFinite(amountA.value) && Number.isFinite(amountB.value)) {
    return amountA.value - amountB.value;
  }
  if (Number.isFinite(amountA.value)) return -1;
  if (Number.isFinite(amountB.value)) return 1;
  return compareText(amountA.label, amountB.label);
}

function compareOptionalDateValues(a?: string, b?: string) {
  const timeA = a ? new Date(a).getTime() : Number.NaN;
  const timeB = b ? new Date(b).getTime() : Number.NaN;
  const validA = Number.isFinite(timeA);
  const validB = Number.isFinite(timeB);

  if (!validA && !validB) return 0;
  if (!validA) return 1;
  if (!validB) return -1;
  return timeA - timeB;
}

function getAmountSortMeta(value?: string | null) {
  const kind = getAmountFilterKind(value);
  const label = formatDashboardAmountLabel(value);
  const raw = `${value ?? ""} ${label}`.replace(/,/g, "").toLowerCase();
  const percentMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);

  if (kind === "COMMISSION") {
    return {
      kind,
      label,
      value: percentMatch ? Number(percentMatch[1]) : Number.NaN,
    };
  }

  const manWonMatch = raw.match(/(\d+(?:\.\d+)?)\s*만/);
  if (manWonMatch) {
    return {
      kind,
      label,
      value: Number(manWonMatch[1]) * 10000,
    };
  }

  const wonMatch = raw.match(/(\d{4,})\s*(?:원|krw)?/i);
  if (wonMatch) {
    return {
      kind,
      label,
      value: Number(wonMatch[1]),
    };
  }

  const fallbackMatch = raw.match(/(\d+(?:\.\d+)?)/);
  return {
    kind,
    label,
    value: fallbackMatch ? Number(fallbackMatch[1]) : Number.NaN,
  };
}

function formatDashboardContractTitle(title: string) {
  const cleaned = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  return formatContractTitleForDisplay(cleaned || title, "계약명 미정");
}

function collapseInternalDuplicateContracts<T extends { title: string }>(
  contracts: T[],
  getKey: (contract: T) => string,
) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const contract of contracts) {
    const isInternalRepeat = /^\[QA-[^\]]+\]/.test(contract.title);
    if (!isInternalRepeat) {
      result.push(contract);
      continue;
    }

    const key = getKey(contract);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(contract);
  }

  return result;
}

function getDashboardContractCollapseKey(contract: Contract) {
  return [
    formatDashboardContractTitle(contract.title),
    contract.status,
    formatContractTypeLabel(contract.type),
    formatDashboardAmountLabel(contract.campaign?.budget),
    getContractPlatforms(contract).join(","),
  ].join("|");
}

function getContractLifecycleCounts(contracts: Contract[]) {
  return contracts.reduce<Record<CampaignLifecycle, number>>(
    (counts, contract) => {
      counts[getDashboardContractLifecycle(contract)] += 1;
      return counts;
    },
    { RECRUITING: 0, IN_PROGRESS: 0, ENDED: 0 },
  );
}

function getDashboardContractLifecycle(contract: Contract): CampaignLifecycle {
  if (contract.status === "CLOSED") return "ENDED";
  if (contract.status === "APPROVED" || contract.status === "SIGNED") {
    return "IN_PROGRESS";
  }
  return "RECRUITING";
}

function matchesContractDashboardQuery(contract: Contract, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  const haystack = [
    formatDashboardContractTitle(contract.title),
    contract.campaign_name,
    contract.influencer_info.name,
    contract.advertiser_info?.name,
    contract.advertiser_trust?.business_name,
    formatContractTypeLabel(contract.type),
    formatDashboardAmountLabel(contract.campaign?.budget),
    ...getContractPlatforms(contract).map((platform) => PLATFORM_META[platform].label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function matchesCampaignParticipantFilter(
  campaign: CampaignGroup,
  filter: CampaignParticipantFilter,
) {
  const participantCount = getCampaignDisplayParticipantCount(campaign);

  if (filter === "ALL") return true;
  if (filter === "ONE") return participantCount === 1;
  if (filter === "TWO_TO_FIVE") {
    return participantCount >= 2 && participantCount <= 5;
  }
  return participantCount >= 6;
}

function getContractBrandName(contract: Contract) {
  return removeInternalTestLabel(
    contract.advertiser_info?.name ?? contract.advertiser_trust?.business_name,
    "브랜드 미정",
  );
}

function getContractCampaignName(contract: Contract) {
  const displayTitle = formatContractTitleForDisplay(
    (contract.campaign_name ?? contract.title).replace(/^\[[^\]]+\]\s*/, "").trim(),
    "계약명 미정",
  );

  return stripCampaignContractSuffix(displayTitle);
}

type CampaignGroupDraft = {
  key: string;
  campaignId?: string;
  name: string;
  contracts: Contract[];
  applicants: MarketplaceMessageThread[];
  marketplaceCampaign?: MarketplaceBrandCampaign;
  latestUpdatedAt: string;
  platforms: Set<ContractPlatform>;
  brands: Set<string>;
};

function buildCampaignGroups({
  contracts,
  marketplaceCampaigns,
  messageThreads,
  fallbackBrandName,
}: {
  contracts: Contract[];
  marketplaceCampaigns: MarketplaceBrandCampaign[];
  messageThreads: MarketplaceMessageThread[];
  fallbackBrandName: string;
}): CampaignGroup[] {
  const groups = new Map<string, CampaignGroupDraft>();
  const campaignKeyByTitle = new Map<string, string>();

  const getOrCreateGroup = (key: string, name: string) => {
    const existing = groups.get(key);
    if (existing) return existing;

    const group: CampaignGroupDraft = {
      key,
      name,
      contracts: [],
      applicants: [],
      latestUpdatedAt: "",
      platforms: new Set<ContractPlatform>(),
      brands: new Set<string>(),
    };
    groups.set(key, group);
    return group;
  };

  for (const campaign of marketplaceCampaigns) {
    const name = removeInternalTestLabel(
      stripCampaignContractSuffix(campaign.title),
      `${fallbackBrandName} 제안 캠페인`,
    );
    const key = getMarketplaceCampaignGroupKey(campaign);
    const group = getOrCreateGroup(key, name);

    group.campaignId = campaign.id;
    group.marketplaceCampaign = campaign;
    group.latestUpdatedAt = getLaterDateValue(group.latestUpdatedAt, campaign.deadline);
    group.brands.add(fallbackBrandName);
    for (const platform of campaign.platforms ?? []) {
      group.platforms.add(marketplacePlatformToContractPlatform(platform));
    }

    campaignKeyByTitle.set(getCampaignLookupKey(name), key);
  }

  for (const contract of contracts) {
    const name = getContractCampaignName(contract);
    const lookupKey = getCampaignLookupKey(name);
    const key = campaignKeyByTitle.get(lookupKey) ?? `contract:${lookupKey}`;
    const group = getOrCreateGroup(key, name);

    group.contracts.push(contract);
    group.latestUpdatedAt = getLaterDateValue(group.latestUpdatedAt, contract.updated_at);
    group.brands.add(getContractBrandName(contract));
    for (const platform of getContractPlatforms(contract)) {
      group.platforms.add(platform);
    }
  }

  for (const thread of getCampaignApplicationThreads(messageThreads)) {
    const name = getThreadCampaignName(thread, `${fallbackBrandName} 제안 캠페인`);
    const lookupKey = getCampaignLookupKey(name);
    const key =
      thread.campaignId
        ? `campaign:${thread.campaignId}`
        : campaignKeyByTitle.get(lookupKey) ?? `application:${lookupKey}`;
    const group = getOrCreateGroup(key, name);

    if (thread.campaignId) group.campaignId = thread.campaignId;
    group.applicants.push(thread);
    group.latestUpdatedAt = getLaterDateValue(group.latestUpdatedAt, thread.updatedAt);
    group.brands.add(thread.targetName || fallbackBrandName);
    for (const item of thread.platforms) {
      group.platforms.add(marketplacePlatformToContractPlatform(item.platform));
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const acceptedNames = new Set(
        group.contracts.map((contract) =>
          removeInternalTestLabel(contract.influencer_info.name, "인플루언서"),
        ),
      );
      const applicantNames = new Set(
        group.applicants.map((thread) => thread.counterpartName || thread.senderName),
      );
      const participantNames = new Set([...acceptedNames, ...applicantNames]);
      const acceptedParticipantCount = acceptedNames.size;
      const participantCount = participantNames.size;
      const completedCount = group.contracts.filter(
        (contract) => contract.status === "CLOSED",
      ).length;
      const platforms = Array.from(group.platforms);
      const brands = Array.from(group.brands).filter(Boolean).sort(compareText);

      const campaign: CampaignGroup = {
        key: group.key,
        campaignId: group.campaignId,
        name: group.name,
        contracts: [...group.contracts].sort((a, b) =>
          compareText(a.influencer_info.name, b.influencer_info.name),
        ),
        applicants: [...group.applicants].sort(
          (a, b) => getDateMs(b.createdAt) - getDateMs(a.createdAt),
        ),
        marketplaceCampaign: group.marketplaceCampaign,
        lifecycle: "RECRUITING",
        participantCount,
        acceptedParticipantCount,
        applicantCount: applicantNames.size,
        completedCount,
        latestUpdatedAt: group.latestUpdatedAt,
        platforms: platforms.length > 0 ? platforms : ["OTHER"],
        brands: brands.length > 0 ? brands : [fallbackBrandName],
      };

      return {
        ...campaign,
        lifecycle: getCampaignLifecycle(campaign),
      };
    })
    .sort((a, b) => {
      const lifecycleDiff =
        getCampaignLifecycleSortOrder(a.lifecycle) -
        getCampaignLifecycleSortOrder(b.lifecycle);
      if (lifecycleDiff !== 0) return lifecycleDiff;

      const updatedDiff = getDateMs(b.latestUpdatedAt) - getDateMs(a.latestUpdatedAt);
      return updatedDiff || compareText(a.name, b.name);
    });
}

function getCampaignDisplayParticipantCount(campaign: CampaignGroup) {
  if (campaign.lifecycle === "RECRUITING") {
    return Math.max(campaign.applicantCount, campaign.acceptedParticipantCount);
  }

  return Math.max(campaign.participantCount, campaign.acceptedParticipantCount);
}

function getCampaignLifecycleCounts(campaigns: CampaignGroup[]) {
  return campaigns.reduce<Record<CampaignLifecycle, number>>(
    (counts, campaign) => {
      counts[campaign.lifecycle] += 1;
      return counts;
    },
    { RECRUITING: 0, IN_PROGRESS: 0, ENDED: 0 },
  );
}

function getCampaignRosterProgress(campaign: CampaignGroup) {
  const current = getCampaignDisplayParticipantCount(campaign);
  const capacity = getCampaignCapacity(campaign);
  if (!capacity) {
    return {
      label: `${current.toLocaleString()}/확인중`,
      percent: current > 0 ? 12 : 0,
    };
  }

  const percent = Math.min(100, Math.round((current / capacity) * 100));

  return {
    label: `${current.toLocaleString()}/${capacity.toLocaleString()}`,
    percent,
  };
}

function getCampaignCapacity(campaign: CampaignGroup) {
  const raw =
    campaign.marketplaceCampaign?.applicantLimit ??
    campaign.contracts.find((contract) => contract.campaign?.applicant_limit)
      ?.campaign?.applicant_limit ??
    extractCampaignSummaryField(campaign, "모집인원:", [
      "지급내용:",
      "산출물:",
      "플랫폼:",
      "업로드 마감일:",
      "모집마감일:",
    ]);
  if (!raw) return undefined;

  const values = raw
    .replace(/,/g, "")
    .match(/\d+/g)
    ?.map((item) => Number(item))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!values?.length) return undefined;
  return Math.max(...values);
}

function formatCampaignPlatformSummary(platforms: ContractPlatform[]) {
  const labels = platforms.map((platform) => PLATFORM_META[platform].shortLabel);
  if (labels.length <= 1) return labels[0] ?? "기타";

  return `${labels[0]} 외 ${labels.length - 1}`;
}

function getCampaignPaymentLabel(campaign: CampaignGroup) {
  const value =
    campaign.marketplaceCampaign?.budget ??
    campaign.contracts.find((contract) => contract.campaign?.budget)?.campaign?.budget ??
    extractCampaignSummaryField(campaign, "지급내용:", [
      "산출물:",
      "플랫폼:",
      "업로드 마감일:",
      "모집마감일:",
    ]);

  if (!value?.trim()) return "계약 조건 확인";

  return formatDashboardAmountLabel(value);
}

function getCampaignListDateParts(campaign: CampaignGroup): DashboardDateParts {
  const value =
    campaign.lifecycle === "ENDED"
      ? getCampaignEndedDateValue(campaign)
      : getCampaignDeadlineValue(campaign);
  if (!value) {
    if (campaign.lifecycle === "RECRUITING") return { label: "상시 모집" };
    if (campaign.lifecycle === "IN_PROGRESS") return { label: "마감일 확인" };
    return { label: "종료일 확인" };
  }

  return formatCampaignDashboardDateWithDday(value);
}

function formatCampaignDashboardDateWithDday(value?: string): DashboardDateParts {
  if (!value) return { label: "마감일 확인" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: value };

  const dateLabel = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join(".");
  const dayDiff = getDayDiffFromToday(date);
  const dday =
    dayDiff > 0 ? `D-${dayDiff}` : dayDiff === 0 ? "D-0" : `D+${Math.abs(dayDiff)}`;

  return {
    label: `${dday} / ${dateLabel}`,
    dday,
    dateLabel,
    isUrgent: dayDiff >= 0 && dayDiff <= 3,
  };
}

function getCampaignDeadlineValue(campaign: CampaignGroup) {
  const contractDates = campaign.contracts
    .map(
      (contract) =>
        contract.workflow?.due_at ??
        contract.campaign?.upload_due_at ??
        contract.campaign?.deadline ??
        contract.campaign?.end_date,
    )
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => getDateMs(a) - getDateMs(b));

  if (campaign.lifecycle === "IN_PROGRESS" && contractDates.length > 0) {
    return contractDates[0];
  }

  return (
    campaign.marketplaceCampaign?.deadline ??
    campaign.marketplaceCampaign?.uploadDeadline ??
    extractCampaignSummaryField(campaign, "모집마감일:", []) ??
    extractCampaignSummaryField(campaign, "업로드 마감일:", ["모집마감일:"]) ??
    contractDates[0]
  );
}

function extractCampaignSummaryField(
  campaign: CampaignGroup,
  startToken: string,
  stopTokens: string[],
) {
  for (const thread of campaign.applicants) {
    const value = extractSummaryField(thread.proposalSummary, startToken, stopTokens);
    if (value) return value;
  }

  return undefined;
}

function extractSummaryField(
  summary: string,
  startToken: string,
  stopTokens: string[],
) {
  const startIndex = summary.indexOf(startToken);
  if (startIndex < 0) return undefined;

  const valueStart = startIndex + startToken.length;
  const nextStopIndex = stopTokens
    .map((token) => summary.indexOf(token, valueStart))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const rawValue =
    nextStopIndex === undefined
      ? summary.slice(valueStart)
      : summary.slice(valueStart, nextStopIndex);
  const value = normalizeCampaignSummaryText(rawValue);

  return value || undefined;
}

function normalizeCampaignSummaryText(value: string) {
  return value
    .replace(/T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u, "")
    .replace(/\s+/g, " ")
    .replace(/[·|,-]+$/g, "")
    .trim();
}

function getCampaignEndedDateValue(campaign: CampaignGroup) {
  const contractDates = campaign.contracts
    .map(
      (contract) =>
        contract.signature_data?.signed_at ??
        contract.campaign?.end_date ??
        contract.updated_at,
    )
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => getDateMs(b) - getDateMs(a));

  return (
    campaign.marketplaceCampaign?.endedAt ??
    campaign.marketplaceCampaign?.closedAt ??
    contractDates[0] ??
    campaign.latestUpdatedAt
  );
}

function getCampaignLifecycle(campaign: CampaignGroup): CampaignLifecycle {
  if (campaign.marketplaceCampaign?.status === "ended") return "ENDED";
  if (
    campaign.acceptedParticipantCount > 0 &&
    campaign.completedCount >= campaign.acceptedParticipantCount
  ) {
    return "ENDED";
  }
  if (campaign.acceptedParticipantCount > 0 || campaign.contracts.length > 0) {
    return "IN_PROGRESS";
  }
  if (campaign.marketplaceCampaign?.status === "closed") return "ENDED";
  if (isPastCampaignDeadline(campaign.marketplaceCampaign?.deadline)) {
    return "ENDED";
  }

  return "RECRUITING";
}

function getCampaignLifecycleSortOrder(lifecycle: CampaignLifecycle) {
  if (lifecycle === "RECRUITING") return 0;
  if (lifecycle === "IN_PROGRESS") return 1;
  return 2;
}

function getCampaignActionCounts(campaign: CampaignGroup) {
  return {
    newApplicants: campaign.applicants.filter(
      (thread) => thread.status === "submitted" && !thread.convertedContractId,
    ).length,
    actionableApplicants: campaign.applicants.filter(
      (thread) =>
        !thread.convertedContractId &&
        (thread.status === "submitted" || thread.status === "reviewed"),
    ).length,
    overdueContracts: campaign.contracts.filter(
      (contract) =>
        isContractContentMissing(contract) && isContractDeadlineOverdue(contract),
    ).length,
    dueSoonContracts: campaign.contracts.filter(
      (contract) =>
        isContractContentMissing(contract) && isContractDeadlineDueSoon(contract),
    ).length,
    draftContracts: campaign.contracts.filter((contract) => contract.status === "DRAFT")
      .length,
    revisionRequests: campaign.contracts.filter(
      (contract) => contract.status === "NEGOTIATING",
    ).length,
    submittedLinks: campaign.contracts.filter(isContractContentReviewNeeded)
      .length,
  };
}

function _getDashboardActionMetrics(campaigns: CampaignGroup[]): DashboardActionMetric[] {
  const totals = campaigns.reduce(
    (accumulator, campaign) => {
      const counts = getCampaignActionCounts(campaign);

      return {
        newApplicants: accumulator.newApplicants + counts.newApplicants,
        revisionRequests: accumulator.revisionRequests + counts.revisionRequests,
        dueSoonContracts:
          accumulator.dueSoonContracts +
          counts.dueSoonContracts +
          counts.overdueContracts,
        submittedLinks: accumulator.submittedLinks + counts.submittedLinks,
        draftContracts: accumulator.draftContracts + counts.draftContracts,
      };
    },
    {
      newApplicants: 0,
      revisionRequests: 0,
      dueSoonContracts: 0,
      submittedLinks: 0,
      draftContracts: 0,
    },
  );

  const metrics: DashboardActionMetric[] = [
    {
      id: "revision",
      label: "수정 요청",
      value: totals.revisionRequests,
      helper: "조항 확인",
      tone: "rose",
    },
    {
      id: "applicants",
      label: "새 지원",
      value: totals.newApplicants,
      helper: "수락 검토",
      tone: "amber",
    },
    {
      id: "due-soon",
      label: "마감 임박",
      value: totals.dueSoonContracts,
      helper: "제출 확인",
      tone: "blue",
    },
    {
      id: "submitted",
      label: "제출 확인",
      value: totals.submittedLinks,
      helper: "검수 대기",
      tone: "emerald",
    },
    {
      id: "draft",
      label: "계약 초안",
      value: totals.draftContracts,
      helper: "검토 링크 발송",
      tone: "neutral",
    },
  ];

  return metrics.filter((metric) => metric.value > 0).slice(0, 4);
}

function buildCampaignAlerts(campaigns: CampaignGroup[]): CampaignAlert[] {
  return campaigns
    .flatMap((campaign) => {
      const counts = getCampaignActionCounts(campaign);
      const alerts: CampaignAlert[] = [];

      if (counts.newApplicants > 0) {
        alerts.push({
          id: `${campaign.key}:new-applicants`,
          campaignKey: campaign.key,
          campaignName: campaign.name,
          label: `새 지원 ${counts.newApplicants}명`,
          detail: "지원자 플랫폼 확인 후 수락 여부를 결정해야 합니다.",
          tone: "amber",
          priority: 10,
        });
      }
      if (counts.revisionRequests > 0) {
        alerts.push({
          id: `${campaign.key}:revision`,
          campaignKey: campaign.key,
          campaignName: campaign.name,
          label: `수정 요청 ${counts.revisionRequests}건`,
          detail: "인플루언서가 보낸 조항 수정 요청을 확인해야 합니다.",
          tone: "rose",
          priority: 20,
        });
      }
      if (counts.overdueContracts > 0) {
        alerts.push({
          id: `${campaign.key}:overdue`,
          campaignKey: campaign.key,
          campaignName: campaign.name,
          label: `마감 지남 ${counts.overdueContracts}건`,
          detail: "컨텐츠 제출 링크나 서명 상태가 마감 이후에도 완료되지 않았습니다.",
          tone: "rose",
          priority: 30,
        });
      }
      if (counts.draftContracts > 0) {
        alerts.push({
          id: `${campaign.key}:drafts`,
          campaignKey: campaign.key,
          campaignName: campaign.name,
          label: `계약 초안 ${counts.draftContracts}건`,
          detail: "지원 수락 후 생성된 초안을 검토 링크 발급까지 이어가야 합니다.",
          tone: "blue",
          priority: 40,
        });
      }
      if (counts.dueSoonContracts > 0) {
        alerts.push({
          id: `${campaign.key}:due-soon`,
          campaignKey: campaign.key,
          campaignName: campaign.name,
          label: `7일 이내 마감 ${counts.dueSoonContracts}건`,
          detail: "캠페인 마감 전 서명이나 컨텐츠 제출 누락 여부를 확인하세요.",
          tone: "blue",
          priority: 50,
        });
      }
      if (counts.submittedLinks > 0) {
        alerts.push({
          id: `${campaign.key}:submitted-links`,
          campaignKey: campaign.key,
          campaignName: campaign.name,
          label: `제출 확인 ${counts.submittedLinks}건`,
          detail: "인플루언서가 제출한 링크를 열어 검수해야 합니다.",
          tone: "emerald",
          priority: 60,
        });
      }

      return alerts;
    })
    .sort((a, b) => a.priority - b.priority || compareText(a.campaignName, b.campaignName));
}

function getCampaignAlertToneClass(tone: CampaignAlertTone) {
  const tones: Record<CampaignAlertTone, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    neutral: "border-neutral-200 bg-neutral-100 text-neutral-600",
  };

  return tones[tone];
}

function getCampaignLifecycleMeta(campaign: CampaignGroup) {
  const recruitmentStatus = campaign.marketplaceCampaign?.status;

  if (campaign.lifecycle === "RECRUITING") {
    return {
      label: recruitmentStatus === "closed" ? "종료" : "모집중",
      className:
        recruitmentStatus === "closed"
          ? "border-neutral-200 bg-neutral-100 text-neutral-600"
          : "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (campaign.lifecycle === "IN_PROGRESS") {
    return {
      label: "진행중",
      className: "border-neutral-300 bg-neutral-100 text-neutral-800",
    };
  }

  return {
    label: "종료",
    className: "border-neutral-200 bg-neutral-100 text-neutral-600",
  };
}

function getCampaignStatusActions(campaign: CampaignGroup) {
  const status = campaign.marketplaceCampaign?.status ?? "open";
  const actions: Array<{
    status: CampaignStatusAction;
    label: string;
    confirmMessage: string;
    className: string;
    icon: typeof Clock3;
  }> = [];

  if (campaign.marketplaceCampaign && status === "open") {
    actions.push({
      status: "closed",
      label: "모집 종료",
      confirmMessage:
        "이 캠페인의 공개 모집을 종료할까요? 기존 지원자와 진행 중 계약은 유지됩니다.",
      className: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300",
      icon: Clock3,
    });
  }

  if (
    campaign.marketplaceCampaign &&
    status === "closed" &&
    campaign.lifecycle !== "IN_PROGRESS"
  ) {
    actions.push({
      status: "open",
      label: "다시 모집",
      confirmMessage: "이 캠페인을 다시 공개 모집 상태로 바꿀까요?",
      className: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300",
      icon: Plus,
    });
  }

  if (
    campaign.marketplaceCampaign &&
    status !== "ended" &&
    campaign.acceptedParticipantCount > 0 &&
    campaign.completedCount >= campaign.acceptedParticipantCount
  ) {
    actions.push({
      status: "ended",
      label: "종료 처리",
      confirmMessage:
        "이 캠페인을 종료 보관 상태로 바꿀까요? 대시보드 종료 탭에서 확인하게 됩니다.",
      className:
        "border-neutral-300 bg-neutral-100 text-neutral-800 hover:border-neutral-400",
      icon: CheckCircle2,
    });
  }

  if (
    campaign.marketplaceCampaign &&
    status === "ended" &&
    campaign.acceptedParticipantCount === 0
  ) {
    actions.push({
      status: "open",
      label: "다시 모집",
      confirmMessage: "종료된 캠페인을 다시 공개 모집 상태로 바꿀까요?",
      className: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300",
      icon: Plus,
    });
  }

  return actions;
}

function buildCampaignActivities(campaign: CampaignGroup): CampaignActivity[] {
  const campaignEvents: CampaignActivity[] = [];
  const marketplaceCampaign = campaign.marketplaceCampaign;

  if (marketplaceCampaign?.activityEvents?.length) {
    for (const event of marketplaceCampaign.activityEvents) {
      campaignEvents.push({
        id: `${campaign.key}:campaign-event:${event.id}`,
        createdAt: event.createdAt,
        actor: event.actor,
        title: formatCampaignActivityAction(event.action),
        description: event.description,
      });
    }
  } else if (marketplaceCampaign?.createdAt) {
    campaignEvents.push({
      id: `${campaign.key}:campaign-created`,
      createdAt: marketplaceCampaign.createdAt,
      actor: "광고주",
      title: "캠페인 저장",
      description: "운영 중인 캠페인이 생성되었습니다.",
    });
  }

  if (
    !marketplaceCampaign?.activityEvents?.length &&
    marketplaceCampaign?.statusUpdatedAt &&
    !(
      marketplaceCampaign.status === "open" &&
      marketplaceCampaign.createdAt === marketplaceCampaign.statusUpdatedAt
    )
  ) {
    campaignEvents.push({
      id: `${campaign.key}:campaign-status`,
      createdAt: marketplaceCampaign.statusUpdatedAt,
      actor: marketplaceCampaign.statusUpdatedBy ?? "광고주",
      title: formatCampaignStatusActionLabel(marketplaceCampaign.status),
      description: `캠페인 상태가 ${formatCampaignStatusLabel(marketplaceCampaign.status)} 상태로 변경되었습니다.`,
    });
  }

  for (const thread of campaign.applicants) {
    campaignEvents.push({
      id: `${thread.id}:submitted`,
      createdAt: thread.createdAt,
      actor: thread.counterpartName || thread.senderName,
      title: "캠페인 지원",
      description: thread.proposalSummary,
    });

    if (thread.convertedContractId) {
      campaignEvents.push({
        id: `${thread.id}:converted`,
        createdAt: thread.updatedAt,
        actor: "광고주",
        title: "지원 수락",
        description: "지원이 수락되어 계약이 생성되었습니다.",
      });
    }
  }

  for (const contract of campaign.contracts) {
    campaignEvents.push({
      id: `${contract.id}:created`,
      createdAt: contract.created_at,
      actor: "광고주",
      title: "계약 생성",
      description: `${removeInternalTestLabel(contract.influencer_info.name, "인플루언서")} 계약이 생성되었습니다.`,
    });

    if (contract.signature_data?.signed_at) {
      campaignEvents.push({
        id: `${contract.id}:signed`,
        createdAt: contract.signature_data.signed_at,
        actor: contract.influencer_info.name,
        title: "서명 완료",
        description: "계약 서명이 완료되어 증거 기록이 보관되었습니다.",
      });
    }

    if (isContractContentSubmitted(contract)) {
      campaignEvents.push({
        id: `${contract.id}:post-link`,
        createdAt: contract.updated_at,
        actor: contract.influencer_info.name,
        title: "컨텐츠 제출",
        description: contract.post_link
          ? "인플루언서가 컨텐츠 제출 링크를 등록했습니다."
          : "인플루언서가 컨텐츠 파일을 제출했습니다.",
      });
    }

    for (const event of contract.audit_events ?? []) {
      campaignEvents.push({
        id: `${contract.id}:audit:${event.id}`,
        createdAt: event.created_at,
        actor: formatCampaignAuditActor(event.actor),
        title: formatCampaignAuditAction(event.action),
        description: event.description,
      });
    }
  }

  return campaignEvents
    .filter((event) => Number.isFinite(getDateMs(event.createdAt)))
    .sort((a, b) => getDateMs(b.createdAt) - getDateMs(a.createdAt));
}

function formatCampaignStatusLabel(status?: MarketplaceCampaignStatus) {
  if (status === "closed") return "모집 종료";
  if (status === "ended") return "종료";
  if (status === "draft") return "비공개";
  return "모집중";
}

function formatCampaignStatusActionLabel(status?: MarketplaceCampaignStatus) {
  if (status === "closed") return "모집 종료";
  if (status === "ended") return "캠페인 종료";
  if (status === "draft") return "비공개 전환";
  return "모집 재개";
}

function formatCampaignActivityAction(action: string) {
  const labels: Record<string, string> = {
    campaign_created: "캠페인 저장",
    campaign_status_updated: "상태 변경",
  };

  return labels[action] ?? action.replace(/_/g, " ");
}

function formatCampaignAuditActor(actor: NonNullable<Contract["audit_events"]>[number]["actor"]) {
  if (actor === "advertiser") return "광고주";
  if (actor === "influencer") return "인플루언서";
  return "시스템";
}

function formatCampaignAuditAction(action: string) {
  const labels: Record<string, string> = {
    campaign_application_accepted: "지원 수락",
    contract_created: "계약 생성",
    share_link_issued: "검토 링크 발급",
    contract_signed: "계약 서명",
    contract_closed: "광고 계약 마감",
  };

  return labels[action] ?? action.replace(/_/g, " ");
}

function isContractDeadlineOverdue(contract: Contract) {
  const date = getCampaignDeadlineDate(contract);
  if (!date) return false;

  return getDaysUntilDate(date) < 0;
}

function isContractDeadlineDueSoon(contract: Contract) {
  const date = getCampaignDeadlineDate(contract);
  if (!date) return false;

  const daysUntil = getDaysUntilDate(date);
  return daysUntil >= 0 && daysUntil <= 7;
}

function getDaysUntilDate(date: Date) {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const targetStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  return Math.floor((targetStart.getTime() - todayStart.getTime()) / 86400000);
}

function formatCampaignActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getMarketplaceCampaignGroupKey(campaign: MarketplaceBrandCampaign) {
  if (campaign.id) return `campaign:${campaign.id}`;
  return `campaign-title:${getCampaignLookupKey(campaign.title)}`;
}

function getCampaignApplicationThreads(threads: MarketplaceMessageThread[]) {
  return threads.filter(
    (thread) =>
      thread.direction === "influencer_to_brand" &&
      Boolean(thread.campaignId || thread.campaignTitle),
  );
}

function getThreadCampaignName(
  thread: MarketplaceMessageThread,
  fallback = "브랜드 제안 캠페인",
) {
  const title =
    thread.campaignTitle ||
    thread.proposalSummary
      .split("\n")[0]
      ?.replace(/^캠페인 신청:\s*/, "")
      .trim() ||
    `${thread.targetName || "브랜드"} 캠페인`;

  return removeInternalTestLabel(stripCampaignContractSuffix(title), fallback);
}

function stripCampaignContractSuffix(value: string) {
  const cleaned = value
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s*(계약서|계약)\s*(초안|최종본)?$/u, "")
    .trim();

  return cleaned || value;
}

function getCampaignLookupKey(value: string) {
  return stripCampaignContractSuffix(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function marketplacePlatformToContractPlatform(
  platform: InfluencerPlatform,
): ContractPlatform {
  if (platform === "instagram") return "INSTAGRAM";
  if (platform === "youtube") return "YOUTUBE";
  if (platform === "tiktok") return "TIKTOK";
  if (platform === "naver_blog") return "NAVER_BLOG";
  return "OTHER";
}

function getLaterDateValue(current?: string, next?: string) {
  if (!next) return current ?? "";
  if (!current) return next;
  return getDateMs(next) > getDateMs(current) ? next : current;
}

function isPastCampaignDeadline(value?: string) {
  if (!value) return false;
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return false;

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const deadlineStart = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
  );

  return deadlineStart < todayStart;
}

function getContractDeliverableSummary(contract: Contract) {
  return contract.deliverable_summary;
}

function isContractContentSubmitted(contract: Contract) {
  const summary = getContractDeliverableSummary(contract);
  if (summary && summary.total > 0) return summary.submitted > 0;
  return Boolean(contract.post_link);
}

function isContractContentMissing(contract: Contract) {
  if (contract.status !== "SIGNED") return false;

  const summary = getContractDeliverableSummary(contract);
  if (summary && summary.total > 0) return summary.submitted < summary.total;
  return !contract.post_link;
}

function isContractContentReviewNeeded(contract: Contract) {
  if (contract.status !== "SIGNED") return false;

  const summary = getContractDeliverableSummary(contract);
  if (summary && summary.total > 0) {
    return summary.submitted > summary.approved;
  }
  return Boolean(contract.post_link);
}

function getCampaignProgressStatus(contract: Contract) {
  if (contract.status === "CLOSED") {
    return {
      label: "광고 계약 마감",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (isContractContentSubmitted(contract)) {
    return {
      label: "컨텐츠 제출",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (isContractContentMissing(contract)) {
    return {
      label: "컨텐츠 미제출",
      className: "border-neutral-300 bg-neutral-100 text-neutral-800",
    };
  }
  return {
    label: "전자서명 대기",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  };
}

function getCampaignProgressFilterValue(contract: Contract): DetailProgressFilter {
  if (contract.status === "CLOSED") return "UPLOAD_DONE";
  if (isContractContentSubmitted(contract)) return "UPLOAD_DONE";
  if (contract.status === "SIGNED") return "SIGNED_DONE";
  return "SIGN_PENDING";
}

function matchesDetailDeadlineFilter(
  contract: Contract,
  filter: DetailDeadlineFilter,
) {
  if (filter === "ALL") return true;
  const date = getCampaignDeadlineDate(contract);

  if (!date) return filter === "NO_DATE";
  if (filter === "NO_DATE") return false;

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const deadlineStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const sevenDaysLater = new Date(todayStart);
  sevenDaysLater.setDate(todayStart.getDate() + 7);

  if (filter === "OVERDUE") return deadlineStart < todayStart;
  if (filter === "THIS_WEEK") {
    return deadlineStart >= todayStart && deadlineStart <= sevenDaysLater;
  }
  return deadlineStart > sevenDaysLater;
}

function getCampaignDeadlineDate(contract: Contract) {
  const value =
    contract.campaign?.upload_due_at ??
    contract.campaign?.deadline ??
    contract.campaign?.end_date;
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getDashboardContractDateValue(
  contract: Contract,
  lifecycle: CampaignLifecycle,
) {
  if (lifecycle === "ENDED") {
    return (
      contract.signature_data?.signed_at ??
      contract.campaign?.end_date ??
      contract.updated_at
    );
  }

  return (
    contract.workflow?.due_at ??
    contract.campaign?.upload_due_at ??
    contract.campaign?.deadline ??
    contract.campaign?.end_date
  );
}

function formatDashboardContractDateLabel(
  contract: Contract,
  lifecycle: CampaignLifecycle,
) {
  return formatDashboardDateWithDday(
    getDashboardContractDateValue(contract, lifecycle),
  );
}

function formatCampaignDeadline(contract: Contract) {
  const value =
    contract.campaign?.upload_due_at ??
    contract.campaign?.deadline ??
    contract.campaign?.end_date;

  return formatDashboardDateWithDday(value);
}

function formatDashboardDateWithDday(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dateLabel = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join(".");
  const dayDiff = getDayDiffFromToday(date);
  const dday =
    dayDiff > 0 ? `D-${dayDiff}` : dayDiff === 0 ? "D-0" : `D+${Math.abs(dayDiff)}`;

  return `${dateLabel} / ${dday}`;
}

function getDayDiffFromToday(date: Date) {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.round((dateStart.getTime() - todayStart.getTime()) / 86_400_000);
}

function getDateMs(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getContractPlatformDisplayItems(contract: Contract) {
  return getContractPlatforms(contract).map((platform) => ({
    platform,
    label: PLATFORM_META[platform].shortLabel,
    title: PLATFORM_META[platform].label,
  }));
}

function parseDate(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function formatBusinessRegistrationNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-**-${digits.slice(5)}`;
}
