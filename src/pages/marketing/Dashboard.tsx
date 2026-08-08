import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  CopyCheck,
  ExternalLink,
  FileText,
  ImagePlus,
  LogOut,
  Megaphone,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  Contract,
  ContractPlatform,
  ContractStatus,
  useAppStore,
} from "../../store";
import {
  isFixedCampaignContract,
} from "../../domain/contracts";
import {
  getVerificationRejectionGuidance,
  verificationStatusTone,
  type InfluencerPlatform,
  type VerificationRequest,
  type VerificationStatus,
} from "../../domain/verification";
import { type AdvertiserCampaignAccess } from "../../domain/verificationPolicy";
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
import { clearNotificationCenterCache } from "../../hooks/useNotificationCenter";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import {
  clearAdvertiserSessionCache,
  getAdvertiserSessionCache,
} from "../../domain/advertiserSessionCache";
import { clearAdvertiserDashboardBootstrapPreload } from "../../domain/advertiserDashboardPreload";
import { PRODUCT_NAME } from "../../domain/brand";
import { apiFetch } from "../../domain/api";
import {
  isFastLoginTransitionPending,
  subscribeFastLoginTransition,
  waitForFastLoginTransition,
} from "../../domain/fastLoginTransition";
import {
  readSelectedAdvertiserBrandId,
  writeSelectedAdvertiserBrandId,
} from "../../domain/advertiserBrands";
import { LogoMark } from "../../components/BrandLogo";
import { DashboardDownloadButton } from "../../components/DashboardDownloadButton";
import { DashboardExportDialog } from "../../components/DashboardExportDialog";
import { DashboardSurfaceSwitch } from "../../components/DashboardSurfaceSwitch";
import { MobileSurfaceSwitch } from "../../components/MobileSurfaceSwitch";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { ResponsiveFilterPanel } from "../../components/ResponsiveFilterPanel";
import { FilterSelectControl } from "../../components/FilterSelectControl";
import { AdvertiserAccountSettingsMenu } from "../../components/AdvertiserAccountSettingsMenu";
import { HeaderNotificationCenterButton } from "../../components/HeaderNotificationCenterButton";
import {
  ProductSpotlightTour,
  type ProductSpotlightTourStep,
} from "../../components/ProductSpotlightTour";
import {
  compareChannelAudienceValues,
  findInfluencerProfileByDisplayName,
  findInfluencerProfileByHandle,
  getChannelAudienceSortValue,
  getInfluencerProfilePath,
  platformLabels,
  proposalTypeLabels,
  type CampaignProposalType,
  type MarketplaceBrandCampaign,
  type MarketplaceBrandProfile,
  type MarketplaceCampaignStatus,
  type MarketplaceInfluencerProfile,
} from "../../domain/marketplace";
import {
  getMarketplaceCampaignApplicationCustomerStatus,
  type MarketplaceCampaignApplicationCustomerStatus,
  type MarketplaceMessageThread,
  type MarketplaceMessagesResponse,
} from "../../domain/marketplaceInbox";
import { getMarketplaceInfluencerAvatarUrlFromHref } from "../../domain/marketplaceAvatars";
import {
  exportWorkbookToGoogleSheets,
} from "../../domain/googleWorkspaceExport";
import { downloadXlsx, type XlsxSheet, type XlsxWorkbook } from "../../domain/xlsxExport";

type PlatformFilter = "ALL" | ContractPlatform;
type ContractTypeFilter = "ALL" | Contract["type"];
type AmountFilter = "ALL" | "FIXED" | "COMMISSION";
type ActualAmountKind = Exclude<AmountFilter, "ALL">;
type DetailStatusFilter = "ALL" | ContractStatus;
type CampaignLifecycle = "RECRUITING" | "IN_PROGRESS" | "ENDED";
type CampaignStatusAction = Extract<MarketplaceCampaignStatus, "open" | "closed" | "ended">;
type DetailProgressFilter = "ALL" | "UPLOAD_DONE" | "SIGNED_DONE" | "SIGN_PENDING";
type DetailDeadlineFilter = "ALL" | "OVERDUE" | "THIS_WEEK" | "LATER" | "NO_DATE";
type DetailPostLinkFilter = "ALL" | "SUBMITTED" | "NOT_SUBMITTED";
type ApplicantPlatformFilter = "ALL" | InfluencerPlatform;
type ApplicantStatusFilter =
  | "ALL"
  | MarketplaceCampaignApplicationCustomerStatus;
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

const ADVERTISER_CONTRACT_TOUR_STEPS = [
  {
    id: "surfaces",
    target: "advertiser-dashboard-surfaces",
    title: "캠페인과 1:1 계약",
    description:
      "캠페인은 여러 인플루언서를 모집해 선정자별 계약서를 관리하고, 1:1 계약은 한 인플루언서와 합의한 조건을 바로 계약서로 만듭니다.",
  },
  {
    id: "create",
    target: "advertiser-contract-create",
    title: "1:1 계약 작성",
    description:
      "1:1 계약은 첫 계약부터 사업자 인증이 필요합니다. 인증 후 한 명에게 보낼 계약서를 작성하세요.",
  },
  {
    id: "workspace",
    target: "advertiser-contract-workspace",
    title: "필요한 계약부터 확인",
    description:
      "상태 탭과 필터로 검토·서명·마감이 필요한 계약을 좁히고, 계약 행을 눌러 다음 작업을 이어갑니다.",
    padding: 6,
  },
] satisfies readonly ProductSpotlightTourStep[];

const ADVERTISER_CAMPAIGN_TOUR_STEPS = [
  {
    id: "surfaces",
    target: "advertiser-dashboard-surfaces",
    title: "캠페인과 1:1 계약",
    description:
      "캠페인은 여러 인플루언서를 모집해 선정자별 계약서를 관리하고, 1:1 계약은 한 인플루언서에게 직접 제안할 때 사용합니다.",
  },
  {
    id: "create",
    target: "advertiser-campaign-create",
    title: "캠페인 작성",
    description:
      "여러 인플루언서를 모집할 캠페인 내용과 참여 조건을 작성해 배포합니다.",
  },
  {
    id: "workspace",
    target: "advertiser-campaign-workspace",
    title: "모집부터 선정자별 진행까지",
    description:
      "모집·진행·종료 탭과 필터로 캠페인을 찾고, 캠페인을 열어 지원자와 선정자별 계약 진행을 관리합니다.",
    padding: 6,
  },
] satisfies readonly ProductSpotlightTourStep[];
type ContractSort = {
  key: SortKey;
  direction: SortDirection;
};

const CONTRACTS_PER_PAGE = 20;
const DASHBOARD_CONTRACT_EXPORT_LIMIT = 5000;
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
  types: CampaignProposalType[];
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

function getCampaignSharePath(campaign: {
  campaignId?: string;
  marketplaceCampaign?: { id?: string };
}) {
  const campaignId = campaign.campaignId ?? campaign.marketplaceCampaign?.id;
  return campaignId ? `/campaigns/${encodeURIComponent(campaignId)}` : undefined;
}

function getCampaignShareUrl(campaign: {
  campaignId?: string;
  marketplaceCampaign?: { id?: string };
}) {
  const path = getCampaignSharePath(campaign);
  if (!path) return undefined;
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
type MarketplaceDashboardState = {
  status: "loading" | "ready" | "error";
  brand: MarketplaceBrandProfile | null;
  brands: MarketplaceBrandProfile[];
  campaigns: MarketplaceBrandCampaign[];
  campaignAccess?: AdvertiserCampaignAccess;
  threads: MarketplaceMessageThread[];
  error?: string;
};
type CampaignStatusUpdateResponse = {
  brand?: MarketplaceBrandProfile | null;
  brands?: MarketplaceBrandProfile[];
  campaign?: MarketplaceBrandCampaign;
  campaigns?: MarketplaceBrandCampaign[];
  campaign_access?: AdvertiserCampaignAccess;
  not_selected_count?: number;
  error?: string;
};
type AdvertiserCampaignsResponse = {
  brand?: MarketplaceBrandProfile | null;
  brands?: MarketplaceBrandProfile[];
  campaigns?: MarketplaceBrandCampaign[];
  campaign_access?: AdvertiserCampaignAccess;
};
type AdvertiserBrandsResponse = {
  brand?: MarketplaceBrandProfile | null;
  brands?: MarketplaceBrandProfile[];
  campaigns?: MarketplaceBrandCampaign[];
  error?: string;
};
type AdvertiserBrandImageResponse = {
  image_url?: string;
  brand?: MarketplaceBrandProfile | null;
  error?: string;
};
type AdvertiserAccountSummary = {
  name: string;
  meta?: string;
  email?: string;
  businessNumber?: string;
};
type DashboardSurface = "contracts" | "campaigns" | "costs";
type CostPeriodFilter =
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "CUSTOM";
type CostSourceFilter = "ALL" | "contracts" | "campaigns";
type CostStatusFilter = "ALL" | "IN_PROGRESS" | "ENDED" | "PAID";
type CostDashboardEntry = {
  id: string;
  contract: Contract;
  dateValue: string;
  dateLabel: string;
  source: Exclude<CostSourceFilter, "ALL">;
  sourceLabel: string;
  title: string;
  influencerName: string;
  platformLabel: string;
  amountValue?: number;
  amountLabel: string;
  lifecycle: CampaignLifecycle;
  lifecycleLabel: string;
  paid: boolean;
  paidLabel: string;
  nextDueLabel: string;
  searchableText: string;
};
type CostDashboardSummary = {
  total: number;
  inProgress: number;
  ended: number;
  paid: number;
  unpriced: number;
};
type CostTrendItem = {
  key: string;
  label: string;
  from?: string;
  to?: string;
  contractAmount: number;
  campaignAmount: number;
  totalAmount: number;
};
type CostDateRange = {
  from?: string;
  to?: string;
};

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

const COST_PERIOD_FILTERS: Array<{
  value: CostPeriodFilter;
  label: string;
}> = [
  { value: "THIS_WEEK", label: "금주" },
  { value: "LAST_WEEK", label: "전주" },
  { value: "THIS_MONTH", label: "당월" },
  { value: "LAST_MONTH", label: "전월" },
  { value: "CUSTOM", label: "기간 선택" },
];

const COST_SOURCE_FILTERS: Array<{
  value: CostSourceFilter;
  label: string;
}> = [
  { value: "ALL", label: "전체" },
  { value: "contracts", label: "1:1 계약" },
  { value: "campaigns", label: "캠페인" },
];

const COST_STATUS_FILTERS: Array<{
  value: CostStatusFilter;
  label: string;
}> = [
  { value: "ALL", label: "전체" },
  { value: "IN_PROGRESS", label: "진행중" },
  { value: "ENDED", label: "종료" },
  { value: "PAID", label: "지급 확인" },
];

const COST_CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

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

const CONTRACT_LIFECYCLE_TABS: Array<{
  value: CampaignLifecycle;
  label: string;
}> = [
  {
    value: "RECRUITING",
    label: "작성중",
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
  MarketplaceCampaignApplicationCustomerStatus,
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
  accepted: {
    label: "선정 준비",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  converted_to_contract: {
    label: "선정 완료",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  not_selected: {
    label: "미선정",
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
  "accepted",
  "converted_to_contract",
  "not_selected",
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
  { value: "UPLOAD_DONE", label: "콘텐츠 제출" },
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
  { value: "SUBMITTED", label: "콘텐츠 제출" },
  { value: "NOT_SUBMITTED", label: "콘텐츠 미제출" },
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
    helper: "전자서명 완료 후 콘텐츠 제출 대기",
    tone: "text-neutral-900",
    badge: "border-neutral-300 bg-neutral-100 text-neutral-900",
    icon: <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />,
  },
  CLOSED: {
    label: "계약 마감",
    shortLabel: "마감",
    helper: "콘텐츠 확인 및 검수 완료",
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
    className: "text-[#303630]",
    mark: <PlatformBrandMark platform="naver_blog" size="sm" />,
  },
  YOUTUBE: {
    label: "유튜브",
    shortLabel: "유튜브",
    className: "text-[#303630]",
    mark: <PlatformBrandMark platform="youtube" size="sm" />,
  },
  INSTAGRAM: {
    label: "인스타그램",
    shortLabel: "인스타",
    className: "text-[#303630]",
    mark: <PlatformBrandMark platform="instagram" size="sm" />,
  },
  TIKTOK: {
    label: "틱톡",
    shortLabel: "틱톡",
    className: "text-[#303630]",
    mark: <PlatformBrandMark platform="tiktok" size="sm" />,
  },
  OTHER: {
    label: "기타",
    shortLabel: "기타",
    className: "text-neutral-600",
    mark: <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />,
  },
};

export function Dashboard({ surface = "contracts" }: DashboardProps) {
  const navigate = useNavigate();
  const isCampaignSurface = surface === "campaigns";
  const isCostSurface = surface === "costs";
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
  const [campaignLifecycleFilter, setCampaignLifecycleFilter] =
    useState<CampaignLifecycle>("RECRUITING");
  const [campaignLifecycleTouched, setCampaignLifecycleTouched] = useState(false);
  const [contractTypeFilter, setContractTypeFilter] =
    useState<ContractTypeFilter>("ALL");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("ALL");
  const [detailStatusFilter, setDetailStatusFilter] =
    useState<DetailStatusFilter>("ALL");
  const [contractPeriodFilter, setContractPeriodFilter] =
    useState<CostPeriodFilter>("CUSTOM");
  const [contractDateFromFilter, setContractDateFromFilter] = useState("");
  const [contractDateToFilter, setContractDateToFilter] = useState("");
  const [costPeriodFilter, setCostPeriodFilter] =
    useState<CostPeriodFilter>("THIS_MONTH");
  const [costDateFromFilter, setCostDateFromFilter] = useState("");
  const [costDateToFilter, setCostDateToFilter] = useState("");
  const [costSourceFilter, setCostSourceFilter] =
    useState<CostSourceFilter>("ALL");
  const [costStatusFilter, setCostStatusFilter] =
    useState<CostStatusFilter>("ALL");
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
      brand: null,
      brands: [],
      campaigns: [],
      threads: [],
    });
  const [selectedBrandId, setSelectedBrandId] = useState(() =>
    readSelectedAdvertiserBrandId(),
  );
  const [brandSelectorOpen, setBrandSelectorOpen] = useState(false);
  const [brandManagerOpen, setBrandManagerOpen] = useState(false);
  const [brandManagerMode, setBrandManagerMode] =
    useState<"create" | "edit">("create");
  const [editingBrandId, setEditingBrandId] = useState<string | undefined>();
  const [brandForm, setBrandForm] = useState<AdvertiserBrandForm>({
    displayName: "",
    category: "",
    location: "",
    businessLabel: "",
    homepage: "",
    description: "",
  });
  const [brandActionError, setBrandActionError] = useState<string | undefined>();
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [updatingBrandId, setUpdatingBrandId] = useState<string | undefined>();
  const [uploadingBrandLogoId, setUploadingBrandLogoId] = useState<
    string | undefined
  >();
  const [removingBrandLogoId, setRemovingBrandLogoId] = useState<
    string | undefined
  >();
  const [deletingBrandId, setDeletingBrandId] = useState<string | undefined>();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [dashboardPanelCloseSignal, setDashboardPanelCloseSignal] = useState(0);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string | undefined>();
  const [googleSheetsError, setGoogleSheetsError] = useState<string | undefined>();
  const [isGoogleSheetsExporting, setIsGoogleSheetsExporting] = useState(false);
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
      const brandQuery = selectedBrandId
        ? `?brandId=${encodeURIComponent(selectedBrandId)}`
        : "";
      const [campaignResponse, messageResponse] = await Promise.all([
        apiFetch(`/api/advertiser/campaigns${brandQuery}`, {
          headers: { Accept: "application/json" },
          credentials: "include",
        }),
        apiFetch("/api/marketplace/campaign-applications?role=advertiser", {
          headers: { Accept: "application/json" },
          credentials: "include",
        }),
      ]);

      if (campaignResponse.status === 401 || messageResponse.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const campaignData = (await campaignResponse.json().catch(() => ({}))) as
        | AdvertiserCampaignsResponse
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
        brand: campaignData.brand ?? null,
        brands: campaignData.brands ?? (campaignData.brand ? [campaignData.brand] : []),
        campaigns: campaignData.campaigns ?? [],
        campaignAccess: campaignData.campaign_access,
        threads: messageData.threads,
      });
      if (campaignData.brand?.id) {
        setSelectedBrandId(campaignData.brand.id);
        writeSelectedAdvertiserBrandId(campaignData.brand.id);
      }
    } catch (error) {
      setMarketplaceState({
        status: "error",
        brand: null,
        brands: [],
        campaigns: [],
        threads: [],
        error:
          error instanceof Error
            ? error.message
            : "캠페인 지원자 목록을 불러오지 못했습니다.",
      });
    }
  }, [navigate, selectedBrandId]);

  useEffect(() => {
    const syncLoginTransition = () => {
      setIsLoginTransitionPending(isFastLoginTransitionPending("advertiser"));
    };
    syncLoginTransition();
    return subscribeFastLoginTransition(syncLoginTransition);
  }, []);

  useEffect(() => {
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
  }, [loadMarketplaceCampaignData]);

  const campaignGroups = useMemo(
    () =>
      buildCampaignGroups({
        contracts: contracts.filter(isFixedCampaignContract),
        marketplaceCampaigns: marketplaceState.campaigns,
        messageThreads: marketplaceState.threads,
        fallbackBrandName: marketplaceState.brand?.displayName ?? advertiserAccount.name,
      }),
    [
      advertiserAccount.name,
      contracts,
      marketplaceState.brand,
      marketplaceState.campaigns,
      marketplaceState.threads,
    ],
  );
  const campaignTabCounts = useMemo(
    () => getCampaignLifecycleCounts(campaignGroups),
    [campaignGroups],
  );
  const preferredCampaignLifecycle = useMemo(
    () => getPreferredCampaignLifecycle(campaignTabCounts),
    [campaignTabCounts],
  );
  const campaignFiltersPristine =
    query.trim().length === 0 &&
    campaignPlatformFilter === "ALL" &&
    campaignBrandFilter === "ALL";
  const shouldUsePreferredCampaignLifecycle =
    isCampaignSurface &&
    !campaignLifecycleTouched &&
    !searchParams.get("campaign") &&
    campaignFiltersPristine &&
    campaignGroups.length > 0 &&
    preferredCampaignLifecycle !== campaignLifecycleFilter &&
    campaignTabCounts[preferredCampaignLifecycle] >
      campaignTabCounts[campaignLifecycleFilter];
  const activeCampaignLifecycleFilter = shouldUsePreferredCampaignLifecycle
    ? preferredCampaignLifecycle
    : campaignLifecycleFilter;
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
          campaign.name.toLowerCase().includes(normalizedQuery) ||
          getCampaignTypeLabel(campaign).toLowerCase().includes(normalizedQuery)) &&
        (campaignPlatformFilter === "ALL" ||
          campaign.platforms.includes(campaignPlatformFilter)) &&
        (campaignBrandFilter === "ALL" ||
          campaign.brands.includes(campaignBrandFilter)) &&
        campaign.lifecycle === activeCampaignLifecycleFilter,
      )
      .sort((a, b) => compareCampaignGroupsBySort(a, b, campaignSort));
  }, [
    activeCampaignLifecycleFilter,
    campaignBrandFilter,
    campaignGroups,
    campaignPlatformFilter,
    campaignSort,
    query,
  ]);
  const dashboardContracts = useMemo(
    () => collapseInternalDuplicateContracts(contracts, getDashboardContractCollapseKey),
    [contracts],
  );
  const oneToOneContracts = useMemo(
    () => dashboardContracts.filter((contract) => !isFixedCampaignContract(contract)),
    [dashboardContracts],
  );
  const costDateRange = useMemo(
    () =>
      getCostDateRange(
        costPeriodFilter,
        costDateFromFilter,
        costDateToFilter,
      ),
    [costDateFromFilter, costDateToFilter, costPeriodFilter],
  );
  const costEntries = useMemo(
    () => buildCostDashboardEntries(dashboardContracts, costDateRange),
    [costDateRange, dashboardContracts],
  );
  const filteredCostEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return costEntries
      .filter(
        (entry) =>
          (!normalizedQuery ||
            entry.searchableText.includes(normalizedQuery)) &&
          (costSourceFilter === "ALL" || entry.source === costSourceFilter) &&
          (costStatusFilter === "ALL" ||
            (costStatusFilter === "PAID"
              ? entry.paid
              : costStatusFilter === "ENDED"
                ? entry.lifecycle === "ENDED"
                : entry.lifecycle !== "ENDED")),
      )
      .sort((a, b) => getDateMs(b.dateValue) - getDateMs(a.dateValue));
  }, [costEntries, costSourceFilter, costStatusFilter, query]);
  const costSummary = useMemo(
    () => getCostDashboardSummary(filteredCostEntries),
    [filteredCostEntries],
  );
  const costTrend = useMemo(
    () => getCostTrendItems(filteredCostEntries, costPeriodFilter, costDateRange),
    [costDateRange, costPeriodFilter, filteredCostEntries],
  );
  const contractLifecycleCounts = useMemo(
    () => getContractLifecycleCounts(oneToOneContracts),
    [oneToOneContracts],
  );
  const visibleContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return oneToOneContracts
      .filter(
        (contract) =>
          getDashboardContractLifecycle(contract) === campaignLifecycleFilter &&
          matchesContractDashboardQuery(contract, normalizedQuery) &&
          (campaignPlatformFilter === "ALL" ||
            getContractPlatforms(contract).includes(campaignPlatformFilter)) &&
          (contractTypeFilter === "ALL" || contract.type === contractTypeFilter) &&
          (amountFilter === "ALL" ||
            getAmountFilterKind(contract.campaign?.budget) === amountFilter) &&
          (detailStatusFilter === "ALL" || contract.status === detailStatusFilter) &&
          matchesDashboardDateRange(
            contract,
            campaignLifecycleFilter,
            contractDateFromFilter,
            contractDateToFilter,
          ),
      )
      .sort((a, b) => _compareContractsBySort(a, b, contractSort));
  }, [
    amountFilter,
    contractDateFromFilter,
    contractDateToFilter,
    campaignLifecycleFilter,
    campaignPlatformFilter,
    contractSort,
    contractTypeFilter,
    oneToOneContracts,
    detailStatusFilter,
    query,
  ]);
  const hasContractDashboardFilters =
    query.trim().length > 0 ||
    campaignPlatformFilter !== "ALL" ||
    contractTypeFilter !== "ALL" ||
    amountFilter !== "ALL" ||
    detailStatusFilter !== "ALL" ||
    Boolean(contractDateFromFilter) ||
    Boolean(contractDateToFilter);
  const contractDownloadContracts = useMemo(
    () =>
      hasContractDashboardFilters
        ? visibleContracts
        : [...oneToOneContracts].sort((a, b) =>
            _compareContractsBySort(a, b, contractSort),
          ),
    [
      contractSort,
      oneToOneContracts,
      hasContractDashboardFilters,
      visibleContracts,
    ],
  );
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
  const handleCampaignLifecycleFilterChange = useCallback(
    (value: CampaignLifecycle) => {
      setCampaignLifecycleTouched(true);
      setCampaignLifecycleFilter(value);
    },
    [],
  );
  const selectedCampaignKey = searchParams.get("campaign") ?? undefined;
  const selectedCampaign = selectedCampaignKey
    ? campaignGroups.find((campaign) => campaign.key === selectedCampaignKey) ??
      campaignGroups.find(
        (campaign) => campaign.key === `campaign:${selectedCampaignKey}`,
      )
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
          body: JSON.stringify({ status, brandId: selectedBrandId }),
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
        brand: data.brand ?? current.brand,
        brands: data.brands ?? current.brands,
        campaigns: data.campaigns ?? current.campaigns,
        campaignAccess: data.campaign_access ?? current.campaignAccess,
        error: undefined,
      }));
    },
    [navigate, selectedBrandId],
  );
  const selectedBrand =
    marketplaceState.brand ??
    marketplaceState.brands.find((brand) => brand.id === selectedBrandId) ??
    null;
  const applyAdvertiserBrandResponse = useCallback(
    (data: AdvertiserBrandsResponse) => {
      setMarketplaceState((current) => ({
        ...current,
        status: "ready",
        brand: data.brand ?? current.brand,
        brands: data.brands ?? current.brands,
        campaigns: data.campaigns ?? current.campaigns,
        error: undefined,
      }));

      if (data.brand?.id) {
        setSelectedBrandId(data.brand.id);
        writeSelectedAdvertiserBrandId(data.brand.id);
      }
    },
    [],
  );
  const applyUpdatedAdvertiserBrand = useCallback(
    (
      brandId: string,
      data: Pick<AdvertiserBrandsResponse, "brand" | "brands" | "campaigns">,
    ) => {
      setMarketplaceState((current) => {
        const nextBrands =
          data.brands ??
          (data.brand
            ? current.brands.map((brand) =>
                brand.id === data.brand?.id ? data.brand : brand,
              )
            : current.brands);
        const updatedBrand =
          nextBrands.find((brand) => brand.id === brandId) ??
          (data.brand?.id === brandId ? data.brand : undefined);
        const isActiveBrand =
          selectedBrandId === brandId || current.brand?.id === brandId;

        return {
          ...current,
          status: "ready",
          brand: isActiveBrand && updatedBrand ? updatedBrand : current.brand,
          brands: nextBrands,
          campaigns:
            isActiveBrand && data.campaigns
              ? data.campaigns
              : current.campaigns,
          error: undefined,
        };
      });
    },
    [selectedBrandId],
  );
  const handleSelectAdvertiserBrand = useCallback(
    (brandId: string) => {
      const brand = marketplaceState.brands.find((item) => item.id === brandId);
      setSelectedBrandId(brandId);
      writeSelectedAdvertiserBrandId(brandId);
      setBrandSelectorOpen(false);
      if (brand) {
        setMarketplaceState((current) => ({
          ...current,
          brand,
          campaigns: brand.activeCampaigns ?? current.campaigns,
        }));
      }
    },
    [marketplaceState.brands],
  );
  const handleOpenBrandManager = useCallback(() => {
    setBrandSelectorOpen(false);
    setBrandActionError(undefined);
    if (selectedBrand) {
      setBrandManagerMode("edit");
      setEditingBrandId(selectedBrand.id);
      setBrandForm(createAdvertiserBrandFormFromProfile(selectedBrand));
    } else {
      setBrandManagerMode("create");
      setEditingBrandId(undefined);
      setBrandForm(createEmptyAdvertiserBrandForm());
    }
    setBrandManagerOpen(true);
  }, [selectedBrand]);
  const handleEditAdvertiserBrand = useCallback(
    (brandId: string) => {
      const brand = marketplaceState.brands.find((item) => item.id === brandId);
      if (!brand) return;
      setBrandManagerMode("edit");
      setEditingBrandId(brand.id);
      setBrandForm(createAdvertiserBrandFormFromProfile(brand));
      setBrandActionError(undefined);
    },
    [marketplaceState.brands],
  );
  const handleStartAdvertiserBrandCreate = useCallback(() => {
    setBrandManagerMode("create");
    setEditingBrandId(undefined);
    setBrandForm(createEmptyAdvertiserBrandForm());
    setBrandActionError(undefined);
  }, []);
  const handleCreateAdvertiserBrand = useCallback(async () => {
    if (isSavingBrand) return;
    const payload = buildAdvertiserBrandPayload(brandForm);
    if (!payload.ok) {
      setBrandActionError(payload.error);
      return;
    }

    setIsSavingBrand(true);
    setBrandActionError(undefined);

    try {
      const response = await apiFetch("/api/advertiser/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload.value),
      });

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as AdvertiserBrandsResponse;
      if (!response.ok || !data.brand) {
        throw new Error(data.error ?? "브랜드를 추가하지 못했습니다.");
      }

      applyAdvertiserBrandResponse(data);
      setBrandManagerMode("edit");
      setEditingBrandId(data.brand.id);
      setBrandForm(createAdvertiserBrandFormFromProfile(data.brand));
    } catch (error) {
      setBrandActionError(
        error instanceof Error ? error.message : "브랜드를 추가하지 못했습니다.",
      );
    } finally {
      setIsSavingBrand(false);
    }
  }, [applyAdvertiserBrandResponse, brandForm, isSavingBrand, navigate]);
  const handleUpdateAdvertiserBrand = useCallback(
    async (
      brandId: string,
      nextForm: AdvertiserBrandForm,
      options?: { removeLogo?: boolean },
    ) => {
      if (updatingBrandId || removingBrandLogoId) return undefined;
      const existingBrand = marketplaceState.brands.find(
        (brand) => brand.id === brandId,
      );
      const payload = buildAdvertiserBrandPayload(nextForm, existingBrand);
      if (!payload.ok) {
        setBrandActionError(payload.error);
        return undefined;
      }

      if (options?.removeLogo) setRemovingBrandLogoId(brandId);
      else setUpdatingBrandId(brandId);
      setBrandActionError(undefined);

      try {
        const response = await apiFetch(
          `/api/advertiser/brands/${encodeURIComponent(brandId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              ...payload.value,
              ...(options?.removeLogo
                ? { removeLogo: true, remove_logo: true, logoUrl: null }
                : {}),
            }),
          },
        );

        if (response.status === 401) {
          navigate("/login/advertiser", { replace: true });
          return undefined;
        }

        const data = (await response.json().catch(() => ({}))) as AdvertiserBrandsResponse;
        if (!response.ok || !data.brand) {
          throw new Error(data.error ?? "브랜드 정보를 저장하지 못했습니다.");
        }
        if (options?.removeLogo && data.brand.logoUrl) {
          throw new Error("브랜드 로고 삭제가 반영되지 않았습니다. 잠시 후 다시 시도해 주세요.");
        }

        applyUpdatedAdvertiserBrand(brandId, data);
        if (editingBrandId === brandId && !options?.removeLogo) {
          setBrandForm(createAdvertiserBrandFormFromProfile(data.brand));
        }
        return data.brand;
      } catch (error) {
        setBrandActionError(
          error instanceof Error
            ? error.message
            : options?.removeLogo
              ? "브랜드 로고를 삭제하지 못했습니다."
              : "브랜드 정보를 저장하지 못했습니다.",
        );
        return undefined;
      } finally {
        if (options?.removeLogo) setRemovingBrandLogoId(undefined);
        else setUpdatingBrandId(undefined);
      }
    },
    [
      applyUpdatedAdvertiserBrand,
      editingBrandId,
      marketplaceState.brands,
      navigate,
      removingBrandLogoId,
      updatingBrandId,
    ],
  );
  const handleUploadAdvertiserBrandLogo = useCallback(
    async (brandId: string, file: File) => {
      if (uploadingBrandLogoId) return undefined;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        setBrandActionError("PNG, JPG, WebP 이미지만 올릴 수 있습니다.");
        return undefined;
      }
      if (file.size > 3 * 1024 * 1024) {
        setBrandActionError("브랜드 로고는 3MB 이하로 올려주세요.");
        return undefined;
      }

      setUploadingBrandLogoId(brandId);
      setBrandActionError(undefined);

      try {
        const dataUrl = await readDashboardFileAsDataUrl(file);
        const response = await apiFetch("/api/advertiser/brand-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            brandId,
            file: {
              name: file.name,
              type: file.type,
              size: file.size,
              data_url: dataUrl,
            },
          }),
        });

        if (response.status === 401) {
          navigate("/login/advertiser", { replace: true });
          return undefined;
        }

        const data = (await response.json().catch(() => ({}))) as AdvertiserBrandImageResponse;
        if (!response.ok || !data.brand) {
          throw new Error(data.error ?? "브랜드 로고를 저장하지 못했습니다.");
        }

        applyUpdatedAdvertiserBrand(brandId, { brand: data.brand });
        return data.brand;
      } catch (error) {
        setBrandActionError(
          error instanceof Error ? error.message : "브랜드 로고를 저장하지 못했습니다.",
        );
        return undefined;
      } finally {
        setUploadingBrandLogoId(undefined);
      }
    },
    [applyUpdatedAdvertiserBrand, navigate, uploadingBrandLogoId],
  );
  const handleDeleteAdvertiserBrand = useCallback(
    async (brandId: string) => {
      if (deletingBrandId) return false;
      setDeletingBrandId(brandId);
      setBrandActionError(undefined);

      try {
        const response = await apiFetch(
          `/api/advertiser/brands/${encodeURIComponent(brandId)}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json" },
            credentials: "include",
          },
        );

        if (response.status === 401) {
          navigate("/login/advertiser", { replace: true });
          return false;
        }

        const data = (await response.json().catch(() => ({}))) as AdvertiserBrandsResponse;
        if (!response.ok) {
          throw new Error(data.error ?? "브랜드를 삭제하지 못했습니다.");
        }

        applyAdvertiserBrandResponse(data);
        if (editingBrandId === brandId) {
          if (data.brand) {
            setBrandManagerMode("edit");
            setEditingBrandId(data.brand.id);
            setBrandForm(createAdvertiserBrandFormFromProfile(data.brand));
          } else {
            setBrandManagerMode("create");
            setEditingBrandId(undefined);
            setBrandForm(createEmptyAdvertiserBrandForm());
          }
        }
        return true;
      } catch (error) {
        setBrandActionError(
          error instanceof Error ? error.message : "브랜드를 삭제하지 못했습니다.",
        );
        return false;
      } finally {
        setDeletingBrandId(undefined);
      }
    },
    [applyAdvertiserBrandResponse, deletingBrandId, editingBrandId, navigate],
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
            ? data.error ?? "지원자 선정에 실패했습니다."
            : "지원자 선정에 실패했습니다.",
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
      clearNotificationCenterCache("advertiser");
      resetHydration();
      navigate("/login/advertiser", { replace: true });
    }
  };
  const buildDashboardExportWorkbook = useCallback((): XlsxWorkbook | undefined => {
    const timestamp = getDashboardExportTimestamp();

    if (isCostSurface) {
      return {
        fileName: `연락미-광고비-현황-${timestamp}.xlsx`,
        sheets: [buildAdvertiserCostExportSheet(filteredCostEntries)],
      };
    }

    if (isCampaignSurface) {
      if (selectedCampaign) {
        return {
          fileName: `연락미-캠페인-${selectedCampaign.name}-${timestamp}.xlsx`,
          sheets: [
            buildAdvertiserCampaignApplicantExportSheet(selectedCampaign.applicants),
            buildAdvertiserContractExportSheet(selectedCampaign.contracts),
          ],
        };
      }

      return {
        fileName: `연락미-캠페인-대시보드-${timestamp}.xlsx`,
        sheets: [buildAdvertiserCampaignExportSheet(filteredCampaigns)],
      };
    }

    if (contractDownloadContracts.length > DASHBOARD_CONTRACT_EXPORT_LIMIT) {
      window.alert(
        `엑셀 내보내기는 최대 ${DASHBOARD_CONTRACT_EXPORT_LIMIT.toLocaleString("ko-KR")}건까지 가능합니다. 필터나 검색 조건을 좁혀 주세요.`,
      );
      return undefined;
    }

    return {
      fileName: `연락미-계약-대시보드-${timestamp}.xlsx`,
      sheets: [
        buildAdvertiserContractExportSheet(contractDownloadContracts),
      ],
    };
  }, [
    contractDownloadContracts,
    filteredCampaigns,
    filteredCostEntries,
    isCampaignSurface,
    isCostSurface,
    selectedCampaign,
  ]);
  const handleDownloadDashboard = useCallback(() => {
    setDashboardPanelCloseSignal((current) => current + 1);
    setGoogleSheetsUrl(undefined);
    setGoogleSheetsError(undefined);
    setExportDialogOpen(true);
  }, []);
  const handleExportExcel = useCallback(() => {
    const workbook = buildDashboardExportWorkbook();
    if (!workbook) return;
    downloadXlsx(workbook);
    setExportDialogOpen(false);
  }, [buildDashboardExportWorkbook]);
  const handleExportGoogleSheets = useCallback(async () => {
    const workbook = buildDashboardExportWorkbook();
    if (!workbook) return;

    setIsGoogleSheetsExporting(true);
    setGoogleSheetsError(undefined);
    setGoogleSheetsUrl(undefined);

    try {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      const result = await exportWorkbookToGoogleSheets({
        role: "advertiser",
        workbook,
        returnPath,
      });

      if (result.status === "connection_required") {
        window.location.assign(result.authorization_url);
        return;
      }

      setGoogleSheetsUrl(result.spreadsheet_url);
    } catch (error) {
      setGoogleSheetsError(
        error instanceof Error
          ? error.message
          : "Google 스프레드시트 내보내기에 실패했습니다.",
      );
    } finally {
      setIsGoogleSheetsExporting(false);
    }
  }, [buildDashboardExportWorkbook]);

  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950 lg:h-screen lg:overflow-hidden">
      {!isCostSurface ? (
        <ProductSpotlightTour
          accountId={cachedAdvertiserUser?.id}
          role="advertiser"
          tourId={
            isCampaignSurface
              ? "campaign-dashboard"
              : "contract-dashboard"
          }
          version={1}
          steps={
            isCampaignSurface
              ? ADVERTISER_CAMPAIGN_TOUR_STEPS
              : ADVERTISER_CONTRACT_TOUR_STEPS
          }
        />
      ) : null}
      <DashboardExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExcel={handleExportExcel}
        onGoogleSheets={handleExportGoogleSheets}
        googleSheetsUrl={googleSheetsUrl}
        googleSheetsError={googleSheetsError}
        isGoogleSheetsPending={isGoogleSheetsExporting}
      />
      <BrandManagementDialog
        open={brandManagerOpen}
        brands={marketplaceState.brands}
        selectedBrand={selectedBrand}
        selectedBrandId={selectedBrand?.id}
        account={advertiserAccount}
        mode={brandManagerMode}
        editingBrandId={editingBrandId}
        form={brandForm}
        isSaving={isSavingBrand}
        updatingBrandId={updatingBrandId}
        uploadingBrandLogoId={uploadingBrandLogoId}
        removingBrandLogoId={removingBrandLogoId}
        deletingBrandId={deletingBrandId}
        error={brandActionError}
        onClose={() => {
          setBrandManagerOpen(false);
          setBrandActionError(undefined);
        }}
        onFormChange={setBrandForm}
        onCreate={handleCreateAdvertiserBrand}
        onStartCreate={handleStartAdvertiserBrandCreate}
        onEdit={handleEditAdvertiserBrand}
        onUpdate={handleUpdateAdvertiserBrand}
        onUploadLogo={handleUploadAdvertiserBrandLogo}
        onSelect={handleSelectAdvertiserBrand}
        onDelete={handleDeleteAdvertiserBrand}
      />
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            aria-label={PRODUCT_NAME}
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none">{PRODUCT_NAME}</span>
          </button>

          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            {isSyncing || syncError ? (
              <div className="hidden shrink-0 lg:block">
                <SyncPill isSyncing={isSyncing} syncError={syncError} />
              </div>
            ) : null}
            <div className="hidden lg:block">
              <DashboardSurfaceSwitch role="advertiser" active={surface} />
            </div>
            <HeaderNotificationCenterButton role="advertiser" />
            <MessageCenterButton
              unreadCount={messageSummary.unreadCount}
              isLoading={isMessageSummaryLoading}
              onClick={() => navigate("/advertiser/messages")}
            />
            <button
              type="button"
              onClick={() => navigate("/advertiser/discover")}
              className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
              aria-label="인플루언서 찾기"
              title="인플루언서 찾기"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">인플루언서</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <AdvertiserAccountSettingsMenu
              account={advertiserAccount}
              open={accountMenuOpen}
              onToggle={() => setAccountMenuOpen((current) => !current)}
              onClose={() => setAccountMenuOpen(false)}
              onChangePassword={() => {
                setAccountMenuOpen(false);
                navigate("/reset-password?role=advertiser");
              }}
              onOpenBusinessVerification={() => {
                setAccountMenuOpen(false);
                navigate("/advertiser/verification");
              }}
              onLogout={() => {
                setAccountMenuOpen(false);
                void handleLogout();
              }}
            />
          </div>
        </div>
      </header>

      <MobileSurfaceSwitch role="advertiser" active={surface} />

      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-2.5 sm:px-5 lg:flex lg:h-[calc(100vh-56px)] lg:flex-col lg:overflow-hidden lg:px-6">
        <section className="min-w-0 overflow-hidden rounded-[10px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.055)] lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="truncate text-[17px] font-bold text-[#171a17]">
                  <span className="sm:hidden">
                    {isCostSurface
                      ? "광고비 현황"
                      : isCampaignSurface
                        ? "캠페인 운영"
                        : "1:1 계약"}
                  </span>
                  <span className="hidden sm:inline">
                    {isCostSurface
                      ? "광고비 현황"
                      : isCampaignSurface
                        ? "캠페인 운영 대시보드"
                        : "1:1 계약 대시보드"}
                  </span>
                </h1>
                <DashboardDownloadButton onClick={handleDownloadDashboard} />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isCostSurface ? null : isCampaignSurface ? (
                  <Link
                    to="/advertiser/campaigns/new"
                    data-product-tour="advertiser-campaign-create"
                    className="yl-primary-action inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13px] font-extrabold leading-none transition"
                    aria-label="새 캠페인"
                    title="새 캠페인"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    <span>캠페인 작성</span>
                  </Link>
                ) : (
                  <Link
                    to="/advertiser/builder"
                    data-product-tour="advertiser-contract-create"
                    className="yl-primary-action inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13px] font-extrabold leading-none transition"
                    aria-label="1:1 계약 작성"
                    title="1:1 계약 작성"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    <span>1:1 계약 작성</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <VerificationBanner
            status={advertiserVerificationStatus}
            surface={surface}
            campaignAccess={marketplaceState.campaignAccess}
            account={advertiserAccount}
            selectedBrand={selectedBrand}
            brands={marketplaceState.brands}
            brandSelectorOpen={brandSelectorOpen}
            onToggleBrandSelector={() =>
              setBrandSelectorOpen((current) => !current)
            }
            onSelectBrand={handleSelectAdvertiserBrand}
            onOpenBrandManager={handleOpenBrandManager}
            isLoading={isVerificationLoading}
            latest={verificationSummary?.advertiser.latest_request}
            onOpen={() => navigate("/advertiser/verification")}
            embedded
          />

          <div className="min-w-0 p-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            {isCostSurface ? (
              <CostDashboard
                entries={filteredCostEntries}
                totalEntries={costEntries.length}
                summary={costSummary}
                trend={costTrend}
                periodFilter={costPeriodFilter}
                onPeriodFilterChange={setCostPeriodFilter}
                dateFromFilter={costDateFromFilter}
                onDateFromFilterChange={setCostDateFromFilter}
                dateToFilter={costDateToFilter}
                onDateToFilterChange={setCostDateToFilter}
                sourceFilter={costSourceFilter}
                onSourceFilterChange={setCostSourceFilter}
                statusFilter={costStatusFilter}
                onStatusFilterChange={setCostStatusFilter}
                query={query}
                onQueryChange={setQuery}
                onOpenContract={openContract}
                panelCloseSignal={dashboardPanelCloseSignal}
                isDataPending={isLoginTransitionPending || (!isHydrated && !syncError)}
              />
            ) : isCampaignSurface ? (
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
                    lifecycleFilter={activeCampaignLifecycleFilter}
                    onLifecycleFilterChange={handleCampaignLifecycleFilterChange}
                    lifecycleCounts={campaignTabCounts}
                    query={query}
                    onQueryChange={setQuery}
                    platformFilter={campaignPlatformFilter}
                    onPlatformFilterChange={setCampaignPlatformFilter}
                    brandFilter={campaignBrandFilter}
                    onBrandFilterChange={setCampaignBrandFilter}
                    brandOptions={campaignBrandOptions}
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
                      tabs={CONTRACT_LIFECYCLE_TABS}
                    />
                  }
                  contracts={visibleContracts}
                  totalContracts={oneToOneContracts.length}
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
                  periodFilter={contractPeriodFilter}
                  onPeriodFilterChange={setContractPeriodFilter}
                  dateFromFilter={contractDateFromFilter}
                  onDateFromFilterChange={setContractDateFromFilter}
                  dateToFilter={contractDateToFilter}
                  onDateToFilterChange={setContractDateToFilter}
                  sortState={contractSort}
                  onSortChange={handleContractSortChange}
                  panelCloseSignal={dashboardPanelCloseSignal}
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

function CostDashboard({
  entries,
  totalEntries,
  summary,
  trend,
  periodFilter,
  onPeriodFilterChange,
  dateFromFilter,
  onDateFromFilterChange,
  dateToFilter,
  onDateToFilterChange,
  sourceFilter,
  onSourceFilterChange,
  statusFilter,
  onStatusFilterChange,
  query,
  onQueryChange,
  onOpenContract,
  panelCloseSignal,
  isDataPending,
}: {
  entries: CostDashboardEntry[];
  totalEntries: number;
  summary: CostDashboardSummary;
  trend: CostTrendItem[];
  periodFilter: CostPeriodFilter;
  onPeriodFilterChange: (value: CostPeriodFilter) => void;
  dateFromFilter: string;
  onDateFromFilterChange: (value: string) => void;
  dateToFilter: string;
  onDateToFilterChange: (value: string) => void;
  sourceFilter: CostSourceFilter;
  onSourceFilterChange: (value: CostSourceFilter) => void;
  statusFilter: CostStatusFilter;
  onStatusFilterChange: (value: CostStatusFilter) => void;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenContract: (contract: Contract) => void;
  panelCloseSignal: number;
  isDataPending: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodPickerCloseSignal, setPeriodPickerCloseSignal] = useState(0);
  const activeFilters: AppliedFilter[] = [
    sourceFilter !== "ALL"
      ? {
          id: "cost-source",
          label: `구분 ${getCostSourceFilterLabel(sourceFilter)}`,
          onRemove: () => onSourceFilterChange("ALL"),
        }
      : null,
    statusFilter !== "ALL"
      ? {
          id: "cost-status",
          label: `상태 ${getCostStatusFilterLabel(statusFilter)}`,
          onRemove: () => onStatusFilterChange("ALL"),
        }
      : null,
    query.trim()
      ? {
          id: "cost-query",
          label: `검색 ${query.trim()}`,
          onRemove: () => onQueryChange(""),
        }
      : null,
  ].filter(isAppliedFilter);
  const filterSummary =
    activeFilters.length > 0 ? `${activeFilters.length}개 조건 적용` : "전체 조건";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFiltersOpen(false);
      setPeriodPickerCloseSignal((current) => current + 1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [panelCloseSignal]);

  return (
    <section className="overflow-visible rounded-[8px] border border-[#d9e0d9] bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="border-b border-[#d9e0d9] bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DashboardPeriodPicker
            periodFilter={periodFilter}
            onPeriodFilterChange={onPeriodFilterChange}
            dateFromFilter={dateFromFilter}
            onDateFromFilterChange={onDateFromFilterChange}
            dateToFilter={dateToFilter}
            onDateToFilterChange={onDateToFilterChange}
            closeSignal={periodPickerCloseSignal}
            onOpen={() => setFiltersOpen(false)}
          />
          <div className="relative">
            <DashboardFilterToggleButton
              open={filtersOpen}
              activeCount={activeFilters.length}
              onClick={() => {
                if (!filtersOpen) {
                  setPeriodPickerCloseSignal((signal) => signal + 1);
                }
                setFiltersOpen(!filtersOpen);
              }}
              controlsId="advertiser-cost-filters"
            />
            <ResponsiveFilterPanel
              id="advertiser-cost-filters"
              open={filtersOpen}
              activeCount={activeFilters.length}
              onClose={() => setFiltersOpen(false)}
              onClear={() => {
                onSourceFilterChange("ALL");
                onStatusFilterChange("ALL");
                onQueryChange("");
                onDateFromFilterChange("");
                onDateToFilterChange("");
              }}
              className="sm:w-[min(560px,calc(100vw-48px))]"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(120px,0.9fr)_minmax(120px,0.9fr)_minmax(220px,1.5fr)] sm:items-end">
                <TableFilterSelect
                  label="구분"
                  value={sourceFilter}
                  options={COST_SOURCE_FILTERS}
                  onChange={(value) => onSourceFilterChange(value as CostSourceFilter)}
                />
                <TableFilterSelect
                  label="상태"
                  value={statusFilter}
                  options={COST_STATUS_FILTERS}
                  onChange={(value) => onStatusFilterChange(value as CostStatusFilter)}
                />
                <CostDashboardSearch value={query} onChange={onQueryChange} />
              </div>
            </ResponsiveFilterPanel>
          </div>
        </div>
        <DashboardAppliedFilterBar
          filters={activeFilters}
          onClearAll={() => {
            onSourceFilterChange("ALL");
            onStatusFilterChange("ALL");
            onQueryChange("");
            onDateFromFilterChange("");
            onDateToFilterChange("");
          }}
        />
      </div>

      <div className="min-h-0 overflow-y-auto bg-[#fbfbf8] p-3 lg:flex-1">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CostMetricCard
            label="총 광고비"
            value={formatCostCurrency(summary.total)}
            note={
              summary.unpriced > 0
                ? `금액 미산정 ${summary.unpriced.toLocaleString("ko-KR")}건`
                : undefined
            }
          />
          <CostMetricCard
            label="진행중 계약금액"
            value={formatCostCurrency(summary.inProgress)}
          />
          <CostMetricCard
            label="종료된 계약금액"
            value={formatCostCurrency(summary.ended)}
          />
          <CostMetricCard
            label="지급 확인 금액"
            value={formatCostCurrency(summary.paid)}
          />
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(320px,0.9fr)_minmax(520px,1.35fr)]">
          <CostTrendChart items={trend} />
          <div className="overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white">
            <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[#d9e0d9] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
                  광고비 상세
                </p>
                {isDataPending ? (
                  <span
                    className="mt-1 block h-3 w-24 rounded-full bg-neutral-100"
                    aria-hidden="true"
                  />
                ) : (
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
                    {entries.length.toLocaleString("ko-KR")}건 표시 · {filterSummary}
                  </p>
                )}
              </div>
            </div>
            <CostTableHeaderRow />
            <div className="no-scrollbar max-h-[430px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:divide-y-0">
              {isDataPending ? (
                <CostTableSkeletonRows />
              ) : entries.length > 0 ? (
                entries.map((entry) => (
                  <React.Fragment key={entry.id}>
                    <CostRow
                      entry={entry}
                      onOpen={() => onOpenContract(entry.contract)}
                    />
                  </React.Fragment>
                ))
              ) : (
                <CostEmptyState isInitialEmpty={totalEntries === 0} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardPeriodPicker({
  periodFilter,
  onPeriodFilterChange,
  dateFromFilter,
  onDateFromFilterChange,
  dateToFilter,
  onDateToFilterChange,
  align = "left",
  closeSignal,
  onOpen,
}: {
  periodFilter: CostPeriodFilter;
  onPeriodFilterChange: (value: CostPeriodFilter) => void;
  dateFromFilter: string;
  onDateFromFilterChange: (value: string) => void;
  dateToFilter: string;
  onDateToFilterChange: (value: string) => void;
  align?: "left" | "right";
  closeSignal?: number;
  onOpen?: () => void;
}) {
  const activeRange = useMemo(
    () => getCostDateRange(periodFilter, dateFromFilter, dateToFilter),
    [dateFromFilter, dateToFilter, periodFilter],
  );
  const [open, setOpen] = useState(false);
  const [draftPeriod, setDraftPeriod] =
    useState<CostPeriodFilter>(periodFilter);
  const [draftFrom, setDraftFrom] = useState(activeRange.from ?? "");
  const [draftTo, setDraftTo] = useState(activeRange.to ?? "");
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getCostCalendarMonth(activeRange.from ?? activeRange.to),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open);
  const activeButtonLabel = getCostPeriodButtonLabel(activeRange);
  const draftRange = normalizeCostDraftRange(draftFrom, draftTo);

  const syncDraftWithActiveRange = () => {
    const nextRange = activeRange;
    setDraftPeriod(periodFilter);
    setDraftFrom(nextRange.from ?? "");
    setDraftTo(nextRange.to ?? "");
    setVisibleMonth(getCostCalendarMonth(nextRange.from ?? nextRange.to));
  };

  const applyQuickRange = (value: CostPeriodFilter) => {
    const nextRange = getCostDateRange(value, "", "");
    setDraftPeriod(value);
    setDraftFrom(nextRange.from ?? "");
    setDraftTo(nextRange.to ?? "");
    setVisibleMonth(getCostCalendarMonth(nextRange.from ?? nextRange.to));
  };
  const selectDate = (value: string) => {
    setDraftPeriod("CUSTOM");

    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(value);
      setDraftTo("");
      return;
    }

    if (value < draftFrom) {
      setDraftFrom(value);
      setDraftTo(draftFrom);
      return;
    }

    setDraftTo(value);
  };
  const applyToday = () => {
    const today = toDateInputValue(new Date());
    setDraftPeriod("CUSTOM");
    setDraftFrom(today);
    setDraftTo(today);
    setVisibleMonth(getCostCalendarMonth(today));
  };
  const resetDraft = () => applyQuickRange("THIS_MONTH");
  const applyDraft = () => {
    if (draftPeriod === "CUSTOM") {
      onDateFromFilterChange(draftRange.from ?? "");
      onDateToFilterChange(draftRange.to ?? "");
    } else {
      const nextRange = getCostDateRange(draftPeriod, "", "");
      onDateFromFilterChange(nextRange.from ?? "");
      onDateToFilterChange(nextRange.to ?? "");
    }

    onPeriodFilterChange(draftPeriod);
    setOpen(false);
  };

  useEffect(() => {
    if (closeSignal === undefined) return;
    const timer = window.setTimeout(() => setOpen(false), 0);

    return () => window.clearTimeout(timer);
  }, [closeSignal]);

  useEffect(() => {
    if (!open) return undefined;
    const triggerElement = triggerRef.current;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => triggerElement?.focus());
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const nextOpen = !open;
          if (nextOpen) {
            syncDraftWithActiveRange();
            onOpen?.();
          }
          setOpen(nextOpen);
        }}
        aria-expanded={open}
        data-dashboard-period-picker-trigger="true"
        data-cost-period-picker-trigger="true"
        className="inline-flex h-9 max-w-full items-center gap-2 rounded-[8px] border border-[#d9e0d9] bg-white px-3 text-[12px] font-extrabold text-[#303630] shadow-[0_8px_18px_rgba(23,26,23,0.045)] transition hover:border-[#171a17] hover:text-[#171a17]"
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#606861]" strokeWidth={2} />
        <span className="truncate">{activeButtonLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#606861] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden"
            aria-label="기간 선택 닫기"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="기간 선택"
            className={`fixed inset-x-0 bottom-0 z-50 max-h-[calc(100svh-16px)] overflow-y-auto overscroll-contain rounded-t-[12px] border border-[#d9e0d9] bg-white shadow-[0_22px_70px_rgba(15,23,42,0.16)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-[calc(100%+8px)] sm:w-[calc(100vw-64px)] sm:max-w-[760px] sm:max-h-none sm:overflow-hidden sm:rounded-[10px] ${
              align === "right" ? "sm:left-auto sm:right-0" : "sm:left-0"
            }`}
          >
          <div className="border-b border-[#edf1ed] bg-[#fbfbf8] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[12px] font-extrabold text-[#606861]">
                자동 선택
              </span>
              {COST_PERIOD_FILTERS.filter((item) => item.value !== "CUSTOM").map(
                (item) => {
                  const active = draftPeriod === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      data-cost-period-quick="true"
                      onClick={() => applyQuickRange(item.value)}
                      className={`h-8 rounded-[7px] px-3 text-[12px] font-extrabold transition ${
                        active
                          ? "bg-neutral-950 text-white"
                          : "bg-white text-[#606861] ring-1 ring-[#d9e0d9] hover:text-[#171a17]"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <div className="p-3 md:hidden">
            <CostCalendarMonth
              month={visibleMonth}
              rangeFrom={draftRange.from}
              rangeTo={draftRange.to}
              onSelectDate={selectDate}
              onPrevious={() =>
                setVisibleMonth((current) => addCalendarMonths(current, -1))
              }
              onNext={() =>
                setVisibleMonth((current) => addCalendarMonths(current, 1))
              }
            />
          </div>

          <div className="hidden gap-2 p-3 md:grid md:grid-cols-2">
            <CostCalendarMonth
              month={visibleMonth}
              rangeFrom={draftRange.from}
              rangeTo={draftRange.to}
              onSelectDate={selectDate}
              onPrevious={() =>
                setVisibleMonth((current) => addCalendarMonths(current, -1))
              }
            />
            <CostCalendarMonth
              month={addCalendarMonths(visibleMonth, 1)}
              rangeFrom={draftRange.from}
              rangeTo={draftRange.to}
              onSelectDate={selectDate}
              onNext={() =>
                setVisibleMonth((current) => addCalendarMonths(current, 1))
              }
            />
          </div>

          <div className="sticky bottom-0 z-10 border-t border-[#edf1ed] bg-[#fbfbf8] px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0">
                <p className="text-[12px] font-extrabold text-[#303630]">
                  선택된 기간
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] sm:items-center">
                  <CostDateInput
                    value={draftRange.from ?? draftFrom}
                    onChange={(value) => {
                      setDraftPeriod("CUSTOM");
                      setDraftFrom(value);
                    }}
                    label="시작일"
                  />
                  <span className="hidden text-center text-[12px] font-bold text-[#8b938d] sm:block">
                    -
                  </span>
                  <CostDateInput
                    value={draftRange.to ?? draftTo}
                    onChange={(value) => {
                      setDraftPeriod("CUSTOM");
                      setDraftTo(value);
                    }}
                    label="종료일"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-1.5">
                <button
                  type="button"
                  onClick={applyToday}
                  className="h-9 rounded-[7px] border border-[#d9e0d9] bg-white px-3 text-[12px] font-extrabold text-[#606861] transition hover:border-[#171a17] hover:text-[#171a17]"
                >
                  오늘
                </button>
                <button
                  type="button"
                  onClick={resetDraft}
                  className="h-9 rounded-[7px] border border-[#d9e0d9] bg-white px-3 text-[12px] font-extrabold text-[#606861] transition hover:border-[#171a17] hover:text-[#171a17]"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 rounded-[7px] border border-[#d9e0d9] bg-white px-3 text-[12px] font-extrabold text-[#303630] transition hover:border-[#171a17]"
                >
                  닫기
                </button>
                <button
                  type="button"
                  data-dashboard-period-apply="true"
                  onClick={applyDraft}
                  className="h-9 rounded-[7px] bg-neutral-950 px-4 text-[12px] font-extrabold text-white transition hover:bg-neutral-800"
                >
                  적용
                </button>
              </div>
            </div>
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CostCalendarMonth({
  month,
  rangeFrom,
  rangeTo,
  onSelectDate,
  onPrevious,
  onNext,
}: {
  month: Date;
  rangeFrom?: string;
  rangeTo?: string;
  onSelectDate: (value: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const days = getCostCalendarDays(month);

  return (
    <section className="min-w-0 rounded-[8px] border border-[#edf1ed] bg-white p-2.5">
      <div className="grid h-8 grid-cols-[32px_minmax(0,1fr)_32px] items-center">
        {onPrevious ? (
          <button
            type="button"
            onClick={onPrevious}
            aria-label="이전 달"
            title="이전 달"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[#606861] transition hover:bg-neutral-100 hover:text-[#171a17]"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.3} />
          </button>
        ) : (
          <span />
        )}
        <p className="text-center text-[15px] font-black tabular-nums text-[#171a17]">
          {formatCostCalendarMonthTitle(month)}
        </p>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            aria-label="다음 달"
            title="다음 달"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[#606861] transition hover:bg-neutral-100 hover:text-[#171a17]"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.3} />
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="mt-3 grid grid-cols-7 rounded-[6px] bg-[#f7f8f4] py-1">
        {COST_CALENDAR_WEEKDAYS.map((day, index) => (
          <span
            key={day}
            className={`text-center text-[12px] font-extrabold ${
              index === 0
                ? "text-rose-500"
                : index === 6
                  ? "text-blue-500"
                  : "text-[#303630]"
            }`}
          >
            {day}
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((date) => {
          const value = toDateInputValue(date);
          const inCurrentMonth = date.getMonth() === month.getMonth();
          const dayIndex = date.getDay();
          const selectedStart = value === rangeFrom;
          const selectedEnd = value === rangeTo;
          const inRange = Boolean(
            rangeFrom && rangeTo && value > rangeFrom && value < rangeTo,
          );
          const isSelected = selectedStart || selectedEnd;
          const today = value === toDateInputValue(new Date());
          const dayTone =
            dayIndex === 0
              ? "text-rose-500"
              : dayIndex === 6
                ? "text-blue-500"
                : "text-[#303630]";

          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectDate(value)}
              className={`flex h-8 min-w-0 items-center justify-center rounded-[7px] text-[13px] font-bold tabular-nums transition ${
                isSelected
                  ? "bg-neutral-950 text-white shadow-[0_8px_16px_rgba(23,23,23,0.16)]"
                  : inRange
                    ? "bg-blue-50 text-blue-700"
                    : inCurrentMonth
                      ? `${dayTone} hover:bg-neutral-100`
                      : "text-neutral-300 hover:bg-neutral-50"
              } ${today && !isSelected ? "ring-1 ring-blue-300" : ""}`}
              aria-pressed={isSelected}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CostDateInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={10}
        placeholder="YYYY-MM-DD"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-0 rounded-[7px] border border-[#d9e0d9] bg-white px-2 text-[12px] font-extrabold tabular-nums text-[#303630] outline-none transition hover:border-[#cbd5cc] focus:border-[#171a17]"
      />
    </label>
  );
}

function CostMetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <article className="rounded-[8px] border border-[#d9e0d9] bg-white px-3 py-3">
      <p className="truncate text-[12px] font-extrabold text-[#606861]">
        {label}
      </p>
      <p className="mt-2 truncate text-[21px] font-black tabular-nums text-[#171a17]">
        {value}
      </p>
      {note ? (
        <p className="mt-1 truncate text-[11px] font-bold text-amber-700">{note}</p>
      ) : null}
    </article>
  );
}

function CostTrendChart({ items }: { items: CostTrendItem[] }) {
  const maxSeriesValue = Math.max(
    ...items.flatMap((item) => [item.contractAmount, item.campaignAmount]),
    0,
  );
  const guideLines = [0, 1, 2, 3];
  const getBarHeight = (value: number) =>
    maxSeriesValue > 0 && value > 0
      ? Math.max(8, (value / maxSeriesValue) * 100)
      : 0;

  return (
    <section className="rounded-[8px] border border-[#d9e0d9] bg-white p-3 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[14px] font-extrabold text-[#171a17]">
          기간별 광고비
        </p>
        <div className="flex shrink-0 items-center gap-3 text-[11px] font-bold text-[#606861]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-neutral-950" />
            1:1 계약
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-[#2563eb]" />
            캠페인
          </span>
        </div>
      </div>
      <div className="relative mt-4 h-[182px] rounded-[8px] bg-[#fbfcfa] px-3 pb-7 pt-3">
        <div className="absolute inset-x-3 bottom-7 top-3">
          {guideLines.map((line) => (
            <span
              key={line}
              className="absolute left-0 right-0 border-t border-dashed border-[#e4e9e4]"
              style={{ bottom: `${(line / (guideLines.length - 1)) * 100}%` }}
            />
          ))}
        </div>
        <div className="relative flex h-full items-end gap-3">
          {items.map((item) => {
            const contractHeight = getBarHeight(item.contractAmount);
            const campaignHeight = getBarHeight(item.campaignAmount);
            const hasAmount =
              item.contractAmount > 0 || item.campaignAmount > 0;

            return (
              <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-[124px] w-full items-end justify-center">
                  {hasAmount ? (
                    <div className="flex h-full items-end justify-center gap-1.5">
                      <span className="flex h-full w-2.5 items-end justify-center sm:w-3">
                        {item.contractAmount > 0 ? (
                          <span
                            className="block w-full rounded-full bg-neutral-950 shadow-[0_1px_0_rgba(255,255,255,0.18)_inset]"
                            style={{ height: `${contractHeight}%` }}
                            title={`${item.label} 1:1 ${formatCostCurrency(item.contractAmount)}`}
                          />
                        ) : null}
                      </span>
                      <span className="flex h-full w-2.5 items-end justify-center sm:w-3">
                        {item.campaignAmount > 0 ? (
                          <span
                            className="block w-full rounded-full bg-[#2563eb] shadow-[0_1px_0_rgba(255,255,255,0.18)_inset]"
                            style={{ height: `${campaignHeight}%` }}
                            title={`${item.label} 캠페인 ${formatCostCurrency(item.campaignAmount)}`}
                          />
                        ) : null}
                      </span>
                    </div>
                  ) : (
                    <span className="h-1.5 w-5 rounded-full bg-[#e4e9e4]" />
                  )}
                </div>
                <p className="w-full truncate text-center text-[11px] font-bold text-[#606861]">
                  {item.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CostDashboardSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="col-span-2 min-w-0 sm:col-span-auto">
      <span className="block text-[11px] font-extrabold text-[#606861]">
        검색
      </span>
      <span className="mt-1 flex h-9 items-center gap-2 rounded-[6px] border border-[#d9e0d9] bg-white px-2 transition-colors focus-within:border-[#171a17]">
        <Search className="h-3.5 w-3.5 shrink-0 text-[#8b938d]" strokeWidth={2} />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="계약명, 인플루언서 검색"
          className="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-[#303630] outline-none placeholder:text-[#a6aea8]"
        />
      </span>
    </label>
  );
}

function CostTableHeaderRow() {
  return (
    <div className="hidden border-b border-[#d7ddd7] bg-[#f7f8f4] px-3 py-2.5 lg:grid lg:grid-cols-[100px_86px_minmax(220px,1fr)_minmax(112px,0.36fr)_minmax(150px,0.5fr)_minmax(126px,0.4fr)] lg:items-center lg:gap-2">
      <ColumnHeader label="계약 생성일" />
      <ColumnHeader label="구분" />
      <ColumnHeader label="계약명" />
      <ColumnHeader label="인플루언서" />
      <ColumnHeader label="계약 금액" />
      <ColumnHeader label="상태" />
    </div>
  );
}

function CostRow({
  entry,
  onOpen,
}: {
  entry: CostDashboardEntry;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-blue-50/45 lg:min-h-[42px] lg:grid-cols-[100px_86px_minmax(220px,1fr)_minmax(112px,0.36fr)_minmax(150px,0.5fr)_minmax(126px,0.4fr)] lg:items-center lg:py-1.5"
    >
      <p className="truncate text-[12px] font-semibold tabular-nums text-[#303630]">
        {entry.dateLabel}
      </p>
      <p className="truncate text-[12px] font-extrabold text-[#303630]">
        {entry.sourceLabel}
      </p>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#171a17]">
          {entry.title}
        </p>
        <p className="mt-1 truncate text-[11px] font-semibold text-[#606861] lg:hidden">
          {entry.sourceLabel} · {entry.influencerName} · {entry.amountLabel}
        </p>
      </div>
      <p className="hidden truncate text-[12px] font-semibold text-[#303630] lg:block">
        {entry.influencerName}
      </p>
      <p className="hidden truncate text-[12px] font-semibold tabular-nums text-[#303630] lg:block">
        {entry.amountLabel}
      </p>
      <p className="hidden truncate text-[12px] font-semibold text-[#303630] lg:block">
        {entry.lifecycleLabel} · {entry.paidLabel}
      </p>
    </button>
  );
}

function CostTableSkeletonRows() {
  return (
    <div className="divide-y divide-[#edf1ed] lg:divide-y-0" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="grid min-h-[52px] grid-cols-[88px_minmax(0,1fr)] items-center gap-2 px-3 py-2 lg:grid-cols-[100px_86px_minmax(220px,1fr)_minmax(112px,0.36fr)_minmax(150px,0.5fr)_minmax(126px,0.4fr)]"
        >
          <span className="h-3 w-20 rounded-full bg-neutral-100" />
          <span className="h-3 w-16 rounded-full bg-neutral-100" />
          <span className="h-4 w-4/5 rounded-full bg-neutral-100" />
          <span className="h-3 w-24 rounded-full bg-neutral-100" />
          <span className="h-3 w-24 rounded-full bg-neutral-100" />
          <span className="h-3 w-20 rounded-full bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

function CostEmptyState({ isInitialEmpty }: { isInitialEmpty: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {isInitialEmpty ? "표시할 광고비가 없습니다" : "조건에 맞는 광고비가 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {isInitialEmpty ? "계약 금액이 있는 1:1 계약과 캠페인이 이곳에 표시됩니다." : "기간이나 필터를 바꿔보세요."}
      </p>
    </section>
  );
}

type AdvertiserBrandForm = {
  displayName: string;
  category: string;
  location: string;
  businessLabel: string;
  homepage: string;
  description: string;
};

function createEmptyAdvertiserBrandForm(): AdvertiserBrandForm {
  return {
    displayName: "",
    category: "",
    location: "",
    businessLabel: "",
    homepage: "",
    description: "",
  };
}

function createAdvertiserBrandFormFromProfile(
  brand: MarketplaceBrandProfile,
): AdvertiserBrandForm {
  let businessLabel = "";
  let homepage = "";
  const descriptionLines = brand.description.split(/\r?\n/).filter((line) => {
    const normalized = line.trim();
    if (/^운영사\s*:/i.test(normalized)) {
      businessLabel = normalized.replace(/^운영사\s*:\s*/i, "").trim();
      return false;
    }
    if (/^공식\s*채널\s*:/i.test(normalized)) {
      homepage = normalized.replace(/^공식\s*채널\s*:\s*/i, "").trim();
      return false;
    }
    return true;
  });

  return {
    displayName: brand.displayName,
    category: brand.category,
    location: brand.location,
    businessLabel,
    homepage,
    description: descriptionLines.join("\n").trim(),
  };
}

function buildAdvertiserBrandPayload(
  form: AdvertiserBrandForm,
  existingBrand?: MarketplaceBrandProfile,
) {
  const displayName = form.displayName.trim();
  const category = form.category.trim();
  const location = form.location.trim();
  const businessLabel = form.businessLabel.trim();
  const homepage = form.homepage.trim();
  const description = form.description.trim();

  if (!displayName || !category || !location) {
    return {
      ok: false as const,
      error: "브랜드명, 카테고리, 운영 지역을 입력해 주세요.",
    };
  }
  if (displayName.length > 60) {
    return { ok: false as const, error: "브랜드명은 60자 이내로 입력해 주세요." };
  }
  if (businessLabel.length > 100) {
    return { ok: false as const, error: "브랜드 운영사명은 100자 이내로 입력해 주세요." };
  }
  if (category.length > 40) {
    return { ok: false as const, error: "카테고리는 40자 이내로 입력해 주세요." };
  }
  if (location.length > 80) {
    return { ok: false as const, error: "운영 지역은 80자 이내로 입력해 주세요." };
  }
  if (homepage.length > 200) {
    return { ok: false as const, error: "공식 채널은 200자 이내로 입력해 주세요." };
  }

  const descriptionParts = [
    description || `${displayName}의 인플루언서 협업 정보를 안내합니다.`,
    businessLabel ? `운영사: ${businessLabel}` : undefined,
    homepage ? `공식 채널: ${homepage}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const storedDescription = descriptionParts.join("\n");
  if (storedDescription.length > 500) {
    return {
      ok: false as const,
      error: "운영사와 공식 채널을 포함한 브랜드 설명은 500자 이내로 입력해 주세요.",
    };
  }

  const existingGeneratedHeadline = existingBrand
    ? `${existingBrand.displayName}의 인플루언서 협업 제안을 관리합니다`
    : undefined;
  const headline =
    existingBrand?.headline && existingBrand.headline !== existingGeneratedHeadline
      ? existingBrand.headline
      : `${displayName}의 인플루언서 협업 제안을 관리합니다`;

  return {
    ok: true as const,
    value: {
      displayName,
      category,
      location,
      headline,
      description: storedDescription,
    },
  };
}

function readDashboardFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("브랜드 로고를 읽지 못했습니다."));
    reader.onerror = () => reject(new Error("브랜드 로고를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function BrandManagementDialog({
  open,
  brands,
  selectedBrand,
  selectedBrandId,
  account,
  mode,
  editingBrandId,
  form,
  isSaving,
  updatingBrandId,
  uploadingBrandLogoId,
  removingBrandLogoId,
  deletingBrandId,
  error,
  onClose,
  onFormChange,
  onCreate,
  onStartCreate,
  onEdit,
  onUpdate,
  onUploadLogo,
  onSelect,
  onDelete,
}: {
  open: boolean;
  brands: MarketplaceBrandProfile[];
  selectedBrand: MarketplaceBrandProfile | null;
  selectedBrandId?: string;
  account: AdvertiserAccountSummary;
  mode: "create" | "edit";
  editingBrandId?: string;
  form: AdvertiserBrandForm;
  isSaving: boolean;
  updatingBrandId?: string;
  uploadingBrandLogoId?: string;
  removingBrandLogoId?: string;
  deletingBrandId?: string;
  error?: string;
  onClose: () => void;
  onFormChange: (form: AdvertiserBrandForm) => void;
  onCreate: () => void;
  onStartCreate: () => void;
  onEdit: (brandId: string) => void;
  onUpdate: (
    brandId: string,
    form: AdvertiserBrandForm,
    options?: { removeLogo?: boolean },
  ) => Promise<MarketplaceBrandProfile | undefined>;
  onUploadLogo: (
    brandId: string,
    file: File,
  ) => Promise<MarketplaceBrandProfile | undefined>;
  onSelect: (brandId: string) => void;
  onDelete: (brandId: string) => Promise<boolean>;
}) {
  const [pendingDeleteBrandId, setPendingDeleteBrandId] = useState<string>();
  const [pendingLogoRemovalBrandId, setPendingLogoRemovalBrandId] =
    useState<string>();
  const logoInputRef = useRef<HTMLInputElement>(null);
  useBodyScrollLock(open);

  const listedBrands = brands.length > 0 ? brands : selectedBrand ? [selectedBrand] : [];
  const canDelete = brands.length > 1;
  const showDefaultBusinessCard = listedBrands.length === 0;
  const editingBrand = listedBrands.find((brand) => brand.id === editingBrandId);
  const pendingDeleteBrand = listedBrands.find(
    (brand) => brand.id === pendingDeleteBrandId,
  );
  const pendingLogoRemovalBrand = listedBrands.find(
    (brand) => brand.id === pendingLogoRemovalBrandId,
  );
  const handleDialogClose = useCallback(() => {
    setPendingDeleteBrandId(undefined);
    setPendingLogoRemovalBrandId(undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (pendingDeleteBrandId) {
        setPendingDeleteBrandId(undefined);
        return;
      }
      if (pendingLogoRemovalBrandId) {
        setPendingLogoRemovalBrandId(undefined);
        return;
      }
      handleDialogClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    handleDialogClose,
    open,
    pendingDeleteBrandId,
    pendingLogoRemovalBrandId,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-3 py-4"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !pendingDeleteBrandId &&
          !pendingLogoRemovalBrandId
        ) {
          handleDialogClose();
        }
      }}
    >
      <section
        className="flex max-h-[calc(100vh-32px)] w-full max-w-[900px] flex-col overflow-hidden rounded-[12px] border border-neutral-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-manager-title"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="brand-manager-title"
              className="text-[17px] font-extrabold text-neutral-950"
            >
              브랜드 정보
            </h2>
            <p className="mt-1 text-[12px] font-semibold text-neutral-500">
              한 사업자 계정에서 운영하는 브랜드를 등록하고 관리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDialogClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
            aria-label="닫기"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[280px_minmax(0,1fr)] md:overflow-hidden">
          <aside className="border-b border-neutral-200 bg-[#fbfbf8] md:flex md:min-h-0 md:flex-col md:border-b-0 md:border-r">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-[12px] font-extrabold text-neutral-600">
                등록 브랜드 {listedBrands.length.toLocaleString("ko-KR")}
              </p>
              <button
                type="button"
                onClick={onStartCreate}
                className="inline-flex h-8 items-center gap-1 rounded-[7px] border border-neutral-200 bg-white px-2.5 text-[11px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
              >
                <Plus className="h-3.5 w-3.5" />
                새 브랜드
              </button>
            </div>
            <div className="max-h-[230px] overflow-y-auto border-t border-neutral-200 md:max-h-none md:flex-1">
              {listedBrands.length > 0 ? (
                <div className="divide-y divide-neutral-200">
                  {listedBrands.map((brand) => {
                    const selected = brand.id === selectedBrandId;
                    const editing = brand.id === editingBrandId && mode === "edit";
                    const deleting = deletingBrandId === brand.id;
                    return (
                      <div
                        key={brand.id}
                        className={`px-4 py-3 transition ${
                          editing ? "bg-blue-50/70" : "bg-transparent"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <BrandLogoPreview brand={brand} className="h-10 w-10" />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-[13px] font-extrabold text-neutral-950">
                                {brand.displayName}
                              </p>
                              {selected ? (
                                <span className="shrink-0 text-[10px] font-extrabold text-blue-700">
                                  사용 중
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-[11px] font-semibold text-neutral-500">
                              {[brand.category, brand.location]
                                .filter(Boolean)
                                .join(" · ") || "브랜드 정보 미입력"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-end gap-1.5">
                          {!selected ? (
                            <button
                              type="button"
                              onClick={() => {
                                onSelect(brand.id);
                                onEdit(brand.id);
                              }}
                              className="h-7 rounded-[6px] px-2 text-[11px] font-extrabold text-neutral-600 transition hover:bg-white hover:text-blue-700"
                            >
                              사용
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onEdit(brand.id)}
                            className="h-7 rounded-[6px] px-2 text-[11px] font-extrabold text-neutral-600 transition hover:bg-white hover:text-neutral-950"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={!canDelete || deleting}
                            onClick={() => setPendingDeleteBrandId(brand.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-neutral-400 transition hover:bg-white hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={`${brand.displayName} 삭제`}
                            title={canDelete ? "브랜드 삭제" : "최소 1개의 브랜드는 남겨야 합니다"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : showDefaultBusinessCard ? (
                <div className="px-4 py-5">
                  <p className="truncate text-[13px] font-extrabold text-neutral-950">
                    {account.name}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-neutral-500">
                    사업자 인증 정보 기준
                  </p>
                  {account.businessNumber ? (
                    <p className="mt-1 text-[11px] font-bold text-neutral-500">
                      사업자번호 {formatBusinessRegistrationNumber(account.businessNumber)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>

          <div className="min-w-0 bg-white px-5 py-5 md:min-h-0 md:overflow-y-auto md:px-6">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-neutral-950">
                  {mode === "edit" ? "브랜드 정보 수정" : "신규 브랜드 등록"}
                </p>
                <p className="mt-1 text-[11px] font-semibold leading-5 text-neutral-500">
                  {mode === "edit"
                    ? "캠페인과 인플루언서에게 표시되는 브랜드 정보를 관리합니다."
                    : "사업자 계정에 새 운영 브랜드를 등록합니다."}
                </p>
              </div>
              {mode === "edit" && editingBrand ? (
                <span className="shrink-0 text-[11px] font-extrabold text-neutral-500">
                  {editingBrand.isDefault ? "기본 브랜드" : "운영 브랜드"}
                </span>
              ) : null}
            </div>

            {mode === "edit" && editingBrand ? (
              <div className="flex items-center gap-3 border-b border-neutral-200 py-4">
                <BrandLogoPreview brand={editingBrand} className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-extrabold text-neutral-800">
                    브랜드 로고
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-neutral-500">
                    PNG, JPG, WebP · 최대 3MB
                  </p>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) await onUploadLogo(editingBrand.id, file);
                    event.target.value = "";
                  }}
                />
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingBrandLogoId === editingBrand.id}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-neutral-200 bg-white px-3 text-[11px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {uploadingBrandLogoId === editingBrand.id ? "업로드 중" : "교체"}
                  </button>
                  {editingBrand.logoUrl ? (
                    <button
                      type="button"
                      onClick={() => setPendingLogoRemovalBrandId(editingBrand.id)}
                      disabled={removingBrandLogoId === editingBrand.id}
                      className="flex h-9 w-9 items-center justify-center rounded-[7px] text-neutral-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="브랜드 로고 삭제"
                      title="브랜드 로고 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <BrandRegistrationFormFields form={form} onChange={onFormChange} />
            <p className="mt-3 text-[11px] font-semibold leading-5 text-neutral-500">
              계약서 서명 주체는 이 정보가 아닌 계정의 사업자 인증 정보로 관리됩니다.
            </p>
            {error ? (
              <p className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-extrabold text-rose-700">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (mode === "edit" && editingBrand) {
                  void onUpdate(editingBrand.id, form);
                } else {
                  onCreate();
                }
              }}
              disabled={
                mode === "edit"
                  ? !editingBrand || updatingBrandId === editingBrand.id
                  : isSaving
              }
              className="mt-4 flex h-10 w-full items-center justify-center rounded-[8px] bg-blue-600 px-3 text-[13px] font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === "edit"
                ? updatingBrandId === editingBrand?.id
                  ? "저장 중"
                  : "변경사항 저장"
                : isSaving
                  ? "등록 중"
                  : "브랜드 등록"}
            </button>
          </div>
        </div>
      </section>
      {pendingLogoRemovalBrand ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="brand-logo-remove-confirm-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingLogoRemovalBrandId(undefined);
            }
          }}
        >
          <section className="w-full max-w-[420px] rounded-[12px] border border-neutral-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.26)]">
            <h3
              id="brand-logo-remove-confirm-title"
              className="text-[17px] font-extrabold text-neutral-950"
            >
              브랜드 로고 삭제
            </h3>
            <p className="mt-3 text-[13px] font-semibold leading-6 text-neutral-600">
              {pendingLogoRemovalBrand.displayName}의 등록 로고를 삭제하면 브랜드
              이니셜이 대신 표시됩니다.
            </p>
            {error ? (
              <p className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-extrabold text-rose-700">
                {error}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPendingLogoRemovalBrandId(undefined)}
                disabled={removingBrandLogoId === pendingLogoRemovalBrand.id}
                className="h-10 rounded-[8px] border border-neutral-200 bg-white text-[13px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  const updated = await onUpdate(
                    pendingLogoRemovalBrand.id,
                    createAdvertiserBrandFormFromProfile(
                      pendingLogoRemovalBrand,
                    ),
                    { removeLogo: true },
                  );
                  if (updated && !updated.logoUrl) {
                    setPendingLogoRemovalBrandId(undefined);
                  }
                }}
                disabled={removingBrandLogoId === pendingLogoRemovalBrand.id}
                className="h-10 rounded-[8px] bg-rose-600 text-[13px] font-extrabold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removingBrandLogoId === pendingLogoRemovalBrand.id
                  ? "삭제 중"
                  : "로고 삭제"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingDeleteBrand ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="brand-delete-confirm-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingDeleteBrandId(undefined);
            }
          }}
        >
          <section className="w-full max-w-[420px] rounded-[12px] border border-neutral-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.26)]">
            <h3
              id="brand-delete-confirm-title"
              className="text-[17px] font-extrabold text-neutral-950"
            >
              {pendingDeleteBrand.displayName} 삭제
            </h3>
            <p className="mt-3 text-[13px] font-semibold leading-6 text-neutral-600">
              운영 브랜드 목록에서 보관 처리합니다. 과거 계약 기록은 유지되며,
              진행 중 캠페인이나 미결 제안이 있으면 삭제되지 않습니다.
            </p>
            {error ? (
              <p className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-extrabold text-rose-700">
                {error}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteBrandId(undefined)}
                disabled={deletingBrandId === pendingDeleteBrand.id}
                className="h-10 rounded-[8px] border border-neutral-200 bg-white text-[13px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  const deleted = await onDelete(pendingDeleteBrand.id);
                  if (deleted) setPendingDeleteBrandId(undefined);
                }}
                disabled={deletingBrandId === pendingDeleteBrand.id}
                className="h-10 rounded-[8px] bg-rose-600 text-[13px] font-extrabold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingBrandId === pendingDeleteBrand.id
                  ? "삭제 중"
                  : "브랜드 삭제"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function BrandLogoPreview({
  brand,
  className,
}: {
  brand: MarketplaceBrandProfile;
  className: string;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-neutral-200 bg-neutral-100 text-[12px] font-black text-neutral-600 ${className}`}
      aria-hidden="true"
    >
      <span>{brand.logoLabel || brand.displayName.slice(0, 2).toUpperCase()}</span>
      {brand.logoUrl ? (
        <img
          key={brand.logoUrl}
          src={brand.logoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

function BrandRegistrationFormFields({
  form,
  onChange,
}: {
  form: AdvertiserBrandForm;
  onChange: (form: AdvertiserBrandForm) => void;
}) {
  const inputClassName =
    "h-11 w-full rounded-[8px] border border-neutral-200 bg-white px-3 text-[13px] font-bold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:shadow-[0_0_0_3px_rgba(15,23,42,0.06)]";

  return (
    <div className="mt-4 grid gap-3">
      <BrandRegistrationField label="브랜드명" required>
        <input
          value={form.displayName}
          maxLength={60}
          onChange={(event) =>
            onChange({ ...form, displayName: event.target.value })
          }
          className={inputClassName}
          placeholder="예: 브레드룸"
        />
      </BrandRegistrationField>
      <BrandRegistrationField label="브랜드 운영사명">
        <input
          value={form.businessLabel}
          maxLength={100}
          onChange={(event) =>
            onChange({ ...form, businessLabel: event.target.value })
          }
          className={inputClassName}
          placeholder="예: 주식회사 연락미"
        />
      </BrandRegistrationField>
      <BrandRegistrationField label="카테고리" required>
        <input
          value={form.category}
          maxLength={40}
          onChange={(event) =>
            onChange({ ...form, category: event.target.value })
          }
          className={inputClassName}
          placeholder="예: 뷰티 · 스킨케어"
        />
      </BrandRegistrationField>
      <BrandRegistrationField label="운영 지역" required>
        <input
          value={form.location}
          maxLength={80}
          onChange={(event) =>
            onChange({ ...form, location: event.target.value })
          }
          className={inputClassName}
          placeholder="예: 전국 배송 / 서울 방문"
        />
      </BrandRegistrationField>
      <BrandRegistrationField label="공식 채널">
        <input
          value={form.homepage}
          maxLength={200}
          onChange={(event) =>
            onChange({ ...form, homepage: event.target.value })
          }
          className={inputClassName}
          placeholder="홈페이지 또는 인스타그램 주소"
        />
      </BrandRegistrationField>
      <BrandRegistrationField label="브랜드 설명">
        <textarea
          value={form.description}
          maxLength={500}
          onChange={(event) =>
            onChange({ ...form, description: event.target.value })
          }
          rows={5}
          className="min-h-[112px] w-full resize-y rounded-[8px] border border-neutral-200 bg-white px-3 py-2.5 text-[13px] font-bold leading-5 text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:shadow-[0_0_0_3px_rgba(15,23,42,0.06)]"
          placeholder="주요 제품과 협업 방식 등 인플루언서에게 보여줄 소개를 적어 주세요."
        />
      </BrandRegistrationField>
    </div>
  );
}

function BrandRegistrationField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-neutral-700">
        {label}
        {required ? (
          <span className="rounded-full bg-neutral-950 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
            필수
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function VerificationBanner({
  status,
  surface,
  campaignAccess,
  account,
  selectedBrand,
  brands,
  brandSelectorOpen,
  onToggleBrandSelector,
  onSelectBrand,
  onOpenBrandManager,
  isLoading,
  latest,
  onOpen,
  embedded = false,
}: {
  status: VerificationStatus;
  surface: DashboardSurface;
  campaignAccess?: AdvertiserCampaignAccess;
  account: AdvertiserAccountSummary;
  selectedBrand: MarketplaceBrandProfile | null;
  brands: MarketplaceBrandProfile[];
  brandSelectorOpen: boolean;
  onToggleBrandSelector: () => void;
  onSelectBrand: (brandId: string) => void;
  onOpenBrandManager: () => void;
  isLoading: boolean;
  latest?: VerificationRequest;
  onOpen: () => void;
  embedded?: boolean;
}) {
  const approved = status === "approved";
  const isCampaignSurface = surface === "campaigns";
  const showCompactAccount =
    approved ||
    (isLoading && !latest) ||
    (isCampaignSurface && campaignAccess?.verification_required !== true);
  const rejected = status === "rejected";
  const copy = getAdvertiserVerificationBannerCopy(status, latest, {
    campaignAccess: isCampaignSurface ? campaignAccess : undefined,
  });
  const businessNumber = account.businessNumber
    ? formatBusinessRegistrationNumber(account.businessNumber)
    : undefined;
  const brandName = selectedBrand?.displayName ?? account.name;
  const brandSummary = [selectedBrand?.category, selectedBrand?.location]
    .filter(Boolean)
    .join(" · ");
  const selectableBrands =
    brands.length > 0 ? brands : selectedBrand ? [selectedBrand] : [];

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
          <div className="relative min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[15px] font-bold text-neutral-950">
                {brandName}
              </p>
              <button
                type="button"
                onClick={onToggleBrandSelector}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] font-extrabold text-neutral-500 transition hover:bg-white hover:text-neutral-950"
                aria-label="브랜드 변경"
                title="브랜드 변경"
              >
                변경
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            {brandSummary ? (
              <p className="mt-0.5 truncate text-[12px] font-semibold text-neutral-500">
                {brandSummary}
              </p>
            ) : null}
            {brandSelectorOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[280px] overflow-hidden rounded-[12px] border border-neutral-200 bg-white text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                <div className="max-h-[240px] overflow-y-auto p-1">
                  {selectableBrands.map((brand) => {
                    const active = brand.id === selectedBrand?.id;
                    return (
                      <button
                        key={brand.id}
                        type="button"
                        onClick={() => onSelectBrand(brand.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition ${
                          active
                            ? "bg-blue-50 text-blue-700"
                            : "text-neutral-800 hover:bg-neutral-50"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-extrabold">
                            {brand.displayName}
                          </span>
                          <span className="block truncate text-[11px] font-bold text-neutral-500">
                            {[brand.category, brand.location].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {active ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={onOpenBrandManager}
                  className="flex h-10 w-full items-center justify-center gap-1.5 border-t border-neutral-100 text-[12px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-950"
                >
                  <Plus className="h-3.5 w-3.5" />
                  브랜드 추가
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onOpenBrandManager}
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
              : "yl-primary-action text-white"
          }`}
        >
          {copy.actionLabel}
        </button>
      </div>
    </section>
  );
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
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      aria-label={`플랫폼 ${items.map((item) => item.title).join(", ")}`}
    >
      {items.slice(0, 3).map((item) => (
        <span
          key={`${item.platform}-${item.label}`}
          className={`inline-flex items-center ${PLATFORM_META[item.platform].className}`}
          title={item.title}
          aria-label={item.title}
        >
          {PLATFORM_META[item.platform].mark}
        </span>
      ))}
      {items.length > 3 && (
        <span className="inline-flex items-center text-[11px] font-extrabold text-neutral-500">
          +{items.length - 3}
        </span>
      )}
    </div>
  );
}

function CampaignPlatformMarks({
  platforms,
  title,
}: {
  platforms: ContractPlatform[];
  title: string;
}) {
  const items = platforms.length > 0 ? platforms : (["OTHER"] as ContractPlatform[]);

  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5"
      title={title}
      aria-label={`플랫폼 ${title}`}
    >
      {items.slice(0, 3).map((platform) => (
        <span
          key={platform}
          className={`inline-flex items-center ${PLATFORM_META[platform].className}`}
          title={PLATFORM_META[platform].label}
          aria-label={PLATFORM_META[platform].label}
        >
          {PLATFORM_META[platform].mark}
        </span>
      ))}
      {items.length > 3 ? (
        <span className="text-[11px] font-extrabold text-neutral-500">+{items.length - 3}</span>
      ) : null}
    </span>
  );
}

function formatPlatformFilterLabel(platform: PlatformFilter) {
  if (platform === "ALL") return "전체";
  return PLATFORM_META[platform].shortLabel;
}

function getAdvertiserVerificationBannerCopy(
  status: VerificationStatus,
  latest?: VerificationRequest,
  options: { campaignAccess?: AdvertiserCampaignAccess } = {},
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
      statusLabel: "인증 필요",
      helper: "사업자 인증을 완료해야 인플루언서에게 공유 링크를 보낼 수 있습니다.",
      actionLabel: "사업자 인증하기",
    },
  };

  if (options.campaignAccess?.verification_required) {
    return {
      ...copies[status],
      helper:
        status === "pending"
          ? "3회차 캠페인 공개를 위해 사업자 인증을 확인하고 있습니다. 승인 후 바로 이어서 공개할 수 있습니다."
          : status === "rejected"
            ? copies[status].helper
            : "인플루언서가 인증된 사업주체임을 확인할 수 있도록 3회차부터 사업자 인증에 협조해 주세요.",
    };
  }

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
  const lifecycleTitle =
    lifecycleFilter === "RECRUITING"
      ? "모집 현황"
      : lifecycleFilter === "IN_PROGRESS"
        ? "진행 현황"
        : "종료 내역";

  return (
    <section
      data-product-tour="advertiser-campaign-workspace"
      className="overflow-visible rounded-[8px] border border-[#d9e0d9] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
    >
      <CampaignLifecycleTabs
        value={lifecycleFilter}
        counts={lifecycleCounts}
        onChange={onLifecycleFilterChange}
      />
      <div className="border-b border-[#d9e0d9] bg-white">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-[180px] flex-1">
            <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
              {lifecycleTitle}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
              {campaigns.length.toLocaleString("ko-KR")}건 표시 · {filterSummary}
            </p>
          </div>
          <div className="relative">
            <DashboardFilterToggleButton
              open={filtersOpen}
              activeCount={activeFilters.length}
              onClick={() => setFiltersOpen((current) => !current)}
              controlsId="advertiser-campaign-filters"
            />
            <ResponsiveFilterPanel
              id="advertiser-campaign-filters"
              open={filtersOpen}
              activeCount={activeFilters.length}
              onClose={() => setFiltersOpen(false)}
              onClear={() => {
                onPlatformFilterChange("ALL");
                onBrandFilterChange("ALL");
                onQueryChange("");
              }}
              className="sm:w-[min(620px,calc(100vw-48px))]"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(120px,0.75fr)_minmax(140px,0.85fr)_minmax(260px,1.6fr)] sm:items-end">
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
                <CampaignSearch
                  value={query}
                  onChange={onQueryChange}
                  compact
                />
              </div>
            </ResponsiveFilterPanel>
          </div>
        </div>
        <DashboardAppliedFilterBar
          filters={activeFilters}
          onClearAll={() => {
            onPlatformFilterChange("ALL");
            onBrandFilterChange("ALL");
            onQueryChange("");
          }}
        />
      </div>
      <CampaignTableHeaderRow
        dateColumnLabel={dateColumnLabel}
        sortState={sortState}
        onSortChange={onSortChange}
      />

      <div className="no-scrollbar max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1 lg:divide-y-0">
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
    <div className="hidden border-b border-[#d7ddd7] bg-[#f7f8f4] px-3 py-2.5 lg:grid lg:grid-cols-[minmax(96px,0.18fr)_minmax(92px,0.18fr)_minmax(82px,0.14fr)_minmax(260px,0.84fr)_minmax(170px,0.42fr)_minmax(100px,0.22fr)] lg:items-center lg:gap-2">
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
  tabs = CAMPAIGN_LIFECYCLE_TABS,
}: {
  value: CampaignLifecycle;
  counts: Record<CampaignLifecycle, number>;
  onChange: (value: CampaignLifecycle) => void;
  tabs?: Array<{
    value: CampaignLifecycle;
    label: string;
  }>;
}) {
  return (
    <div className="yl-dashboard-lifecycle-strip bg-[#ecebe5] px-2 pt-2">
      <div
        role="tablist"
        className="grid min-w-0 grid-cols-3 items-end gap-0 overflow-visible"
      >
        {tabs.map((tab) => {
          const active = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              role="tab"
              aria-selected={active}
              className={`relative flex h-10 min-w-0 flex-1 items-center justify-between gap-1 overflow-visible rounded-t-[10px] border px-1.5 text-left transition focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:gap-2 sm:px-3 ${
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
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`${className} ${
        compact
          ? "grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-2"
          : "block min-w-0"
      }`}
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
  const platformLabel = formatCampaignPlatformSummary(campaign.platforms);
  const typeLabel = getCampaignTypeLabel(campaign);
  const paymentLabel = getCampaignPaymentLabel(campaign);
  const dateParts = getCampaignListDateParts(campaign);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${campaign.name} 캠페인 열기, 종류 ${typeLabel}, 지급내용 ${paymentLabel}, 날짜 ${dateParts.label}`}
      className="group grid w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50/45 lg:min-h-[44px] lg:grid-cols-[minmax(96px,0.18fr)_minmax(92px,0.18fr)_minmax(82px,0.14fr)_minmax(260px,0.84fr)_minmax(170px,0.42fr)_minmax(100px,0.22fr)] lg:items-center"
    >
      <div className="min-w-0">
        <CampaignPlatformMarks platforms={campaign.platforms} title={platformLabel} />
      </div>
      <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630]">
        {typeLabel}
      </p>
      <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630]">
        {brandLabel}
      </p>
      <p className="min-w-0 truncate whitespace-nowrap text-[14px] font-semibold text-[#171a17]">
        {campaign.name}
      </p>
      <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630]">
        {paymentLabel}
      </p>
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
  const [isCampaignLinkCopied, setIsCampaignLinkCopied] = useState(false);
  const completionRatio =
    campaign.acceptedParticipantCount > 0
      ? Math.min(100, Math.round((campaign.completedCount / campaign.acceptedParticipantCount) * 100))
      : 0;
  const isRecruitingDetail = campaign.lifecycle === "RECRUITING";
  const hasSelectionReservations = campaign.applicants.some(
    (applicant) =>
      applicant.status === "accepted" && !applicant.convertedContractId,
  );
  const showApplicantsPanel = isRecruitingDetail || hasSelectionReservations;
  const isEndedDetail = campaign.lifecycle === "ENDED";
  const detailListTitle =
    campaign.lifecycle === "RECRUITING"
      ? "모집 현황"
      : campaign.lifecycle === "IN_PROGRESS"
        ? "진행 현황"
        : "종료 내역";
  const selectedApplicantCount = Math.max(
    campaign.acceptedParticipantCount,
    campaign.applicants.filter((applicant) => {
      const displayStatus =
        getMarketplaceCampaignApplicationCustomerStatus(applicant);
      return (
        displayStatus === "accepted" ||
        displayStatus === "converted_to_contract"
      );
    }).length,
  );
  const detailProgressTitle = isEndedDetail ? "최종 진행 기록" : "선정자별 진행";
  const statusMeta = getCampaignLifecycleMeta(campaign);
  const typeLabel = getCampaignTypeLabel(campaign);
  const campaignShareUrl = getCampaignShareUrl(campaign);
  const copyCampaignShareLink = async () => {
    if (!campaignShareUrl) return;

    await copyTextToClipboard(campaignShareUrl);
    setIsCampaignLinkCopied(true);
    window.setTimeout(() => setIsCampaignLinkCopied(false), 1600);
  };
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
          {detailListTitle}
        </button>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold text-[#7d857f]">
              캠페인 상세
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-[18px] font-bold text-[#171a17]">
                {campaign.name}
              </h2>
              <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-[#d9e0d9] bg-white px-2.5 text-[12px] font-extrabold text-[#303630]">
                {typeLabel}
              </span>
              <span
                className={`inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[12px] font-extrabold ${statusMeta.className}`}
              >
                {statusMeta.label}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            {isRecruitingDetail ? (
              <div className="flex items-center justify-between gap-4 text-[13px] text-[#606861]">
                <span>
                  지원자{" "}
                  <strong className="font-extrabold text-[#171a17]">
                    {campaign.applicants.length.toLocaleString("ko-KR")}명
                  </strong>
                </span>
                <span>
                  선정{" "}
                  <strong className="font-extrabold text-[#171a17]">
                    {selectedApplicantCount.toLocaleString("ko-KR")}명
                  </strong>
                </span>
              </div>
            ) : (
              <>
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
              </>
            )}
            {isRecruitingDetail && campaignShareUrl ? (
              <button
                type="button"
                onClick={() => void copyCampaignShareLink()}
                className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-[12px] font-extrabold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                aria-label={`${campaign.name} 모집 링크 복사`}
                title="모집 링크 복사"
              >
                <CopyCheck className="h-3.5 w-3.5" />
                {isCampaignLinkCopied ? "복사됨" : "모집 링크 복사"}
              </button>
            ) : null}
            <CampaignStatusActions
              campaign={campaign}
              onUpdateStatus={onUpdateCampaignStatus}
            />
          </div>
        </div>
      </div>

      <div
        className={`grid min-h-0 grid-cols-1 lg:flex-1 ${
          showApplicantsPanel ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1"
        }`}
      >
        <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
          <div className="border-b border-[#d9e0d9] bg-[#fbfcfa]">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-[180px] flex-1">
            <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
              {detailProgressTitle}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
              {filteredContracts.length.toLocaleString("ko-KR")}명 표시 ·{" "}
              {detailFilterSummary}
            </p>
          </div>
          <div className="relative">
            <DashboardFilterToggleButton
              open={detailFiltersOpen}
              activeCount={detailActiveFilters.length}
              onClick={() => setDetailFiltersOpen((current) => !current)}
              controlsId="campaign-detail-filters"
            />
            <ResponsiveFilterPanel
              id="campaign-detail-filters"
              open={detailFiltersOpen}
              activeCount={detailActiveFilters.length}
              onClose={() => setDetailFiltersOpen(false)}
              onClear={() => {
                setInfluencerQuery("");
                setPlatformFilter("ALL");
                setProgressFilter("ALL");
                setDeadlineFilter("ALL");
                setPostLinkFilter("ALL");
              }}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1.35fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(160px,0.95fr)]">
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
                  label="콘텐츠 제출 링크"
                  value={postLinkFilter}
                  options={DETAIL_POST_LINK_OPTIONS}
                  onChange={(value) => setPostLinkFilter(value as DetailPostLinkFilter)}
                  compact
                />
              </div>
            </ResponsiveFilterPanel>
          </div>
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
      </div>
      <CampaignInfluencerTableHeaderRow />

      <div className="no-scrollbar max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1 lg:divide-y-0">
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
          <CampaignParticipantEmptyState
            isInitialEmpty={campaign.contracts.length === 0}
          />
        )}
          </div>
        </div>
        {showApplicantsPanel ? (
          <CampaignApplicantsPanel
            campaign={campaign}
            marketplaceStatus={marketplaceStatus}
            marketplaceError={marketplaceError}
            onAcceptApplication={onAcceptApplication}
            allowSelection
            reservedOnly={!isRecruitingDetail}
          />
        ) : null}
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
      <ColumnHeader label="콘텐츠 제출" />
    </div>
  );
}

function CampaignApplicantsPanel({
  campaign,
  marketplaceStatus,
  marketplaceError,
  onAcceptApplication,
  allowSelection,
  reservedOnly,
}: {
  campaign: CampaignGroup;
  marketplaceStatus: MarketplaceDashboardState["status"];
  marketplaceError?: string;
  onAcceptApplication: (thread: MarketplaceMessageThread) => Promise<void>;
  allowSelection: boolean;
  reservedOnly: boolean;
}) {
  const applicants = useMemo(
    () =>
      reservedOnly
        ? campaign.applicants.filter(
            (applicant) =>
              applicant.status === "accepted" &&
              !applicant.convertedContractId,
          )
        : campaign.applicants,
    [campaign.applicants, reservedOnly],
  );
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
          (statusFilter === "ALL" ||
            getMarketplaceCampaignApplicationCustomerStatus(thread) ===
              statusFilter)
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
    <aside className="border-t border-[#d9e0d9] bg-white lg:flex lg:min-h-0 lg:flex-col lg:border-l lg:border-t-0">
      <div className="border-b border-[#d9e0d9] bg-white px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold text-[#171a17]">
              지원자 현황
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
              {visibleApplicants.length.toLocaleString("ko-KR")}명 표시 · 전체{" "}
              {applicants.length.toLocaleString("ko-KR")}명
            </p>
          </div>
          <div className="flex w-full shrink-0 items-center gap-1.5 sm:w-auto">
            <FilterSelectControl
              value={sortValue}
              onChange={(value) => setSortValue(value as ApplicantSortValue)}
              options={APPLICANT_SORT_OPTIONS}
              ariaLabel="지원자 정렬"
              className="min-w-0 flex-1 sm:w-[158px] sm:flex-none"
              triggerClassName="h-8 rounded-[6px] border-[#d9e0d9] px-2 text-[11px] shadow-none"
              menuClassName="min-w-[176px]"
              onOpen={() => setFiltersOpen(false)}
            />
            <div className="relative">
              <DashboardFilterToggleButton
                open={filtersOpen}
                activeCount={activeFilters.length}
                controlsId="campaign-applicant-filters"
                onClick={() => setFiltersOpen((current) => !current)}
              />
              <ResponsiveFilterPanel
                id="campaign-applicant-filters"
                open={filtersOpen}
                activeCount={activeFilters.length}
                onClose={() => setFiltersOpen(false)}
                onClear={() => {
                  setQuery("");
                  setPlatformFilter("ALL");
                  setStatusFilter("ALL");
                }}
                className="sm:w-[min(520px,calc(100vw-48px))]"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(120px,0.72fr)_minmax(120px,0.72fr)]">
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
                      label:
                        platform === "ALL" ? "전체" : platformLabels[platform],
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
                        status === "ALL"
                          ? "전체"
                          : APPLICANT_STATUS_META[status].label,
                    }))}
                    onChange={(value) =>
                      setStatusFilter(value as ApplicantStatusFilter)
                    }
                    compact
                  />
                </div>
              </ResponsiveFilterPanel>
            </div>
          </div>
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
      {marketplaceStatus === "error" ? (
        <p className="border-b border-[#edf1ed] px-3 py-2 text-[12px] font-semibold text-rose-700">
          {marketplaceError ?? "지원자 목록을 불러오지 못했습니다."}
        </p>
      ) : applicants.length > 0 ? (
        <div className="no-scrollbar divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:min-h-0 lg:flex-1 lg:divide-y-0">
          {visibleApplicants.length > 0 ? (
            visibleApplicants.map((thread) => (
              <React.Fragment key={thread.id}>
                <CampaignApplicantRow
                  thread={thread}
                  onAcceptApplication={onAcceptApplication}
                  allowSelection={allowSelection}
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
        <div className="px-3 py-4 text-[12px] font-semibold text-[#7d857f]">
          {marketplaceStatus === "loading"
            ? "지원자 목록을 불러오는 중입니다."
            : "아직 이 캠페인에 지원한 인플루언서가 없습니다."}
        </div>
      )}
    </aside>
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

function CampaignApplicantRow({
  thread,
  onAcceptApplication,
  allowSelection,
}: {
  thread: MarketplaceMessageThread;
  onAcceptApplication: (thread: MarketplaceMessageThread) => Promise<void>;
  allowSelection: boolean;
}) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string>();
  const statusMeta =
    APPLICANT_STATUS_META[
      getMarketplaceCampaignApplicationCustomerStatus(thread)
    ];
  const isSelectionReserved = thread.status === "accepted";
  const canAccept =
    allowSelection &&
    !thread.convertedContractId &&
    (thread.status === "submitted" ||
      thread.status === "reviewed" ||
      isSelectionReserved);
  const applicantName = getCampaignApplicantDisplayName(thread);
  const applicantProfile = getCampaignApplicantProfile(thread, applicantName);
  const displayPlatforms = getCampaignApplicantDisplayPlatforms(
    thread,
    applicantProfile,
  );
  const applicantPerformance = getCampaignApplicantPerformanceLabel(
    displayPlatforms,
    applicantProfile,
  );
  const mainCategory = getCampaignApplicantMainCategory(
    thread.counterpartCategories,
    applicantProfile,
  );
  const profileHref =
    thread.counterpartHref ||
    (applicantProfile ? getInfluencerProfilePath(applicantProfile) : undefined);
  const avatarUrl = getMarketplaceInfluencerAvatarUrlFromHref(
    profileHref,
    thread.counterpartAvatarUrl,
  );
  const initial = applicantName.trim().slice(0, 1) || "인";
  const hasProfileAction = Boolean(profileHref);
  const primaryActionSpan = hasProfileAction ? "" : "col-span-2";
  const firstPlatform = displayPlatforms[0];
  const primaryHandle = firstPlatform?.handle || firstPlatform?.followersLabel;

  const handleAccept = async () => {
    if (!canAccept || isAccepting) return;

    const confirmed = window.confirm(
      isSelectionReserved
        ? `${thread.counterpartName || thread.senderName}의 계약서 생성을 계속할까요?`
        : `${
            thread.counterpartName || thread.senderName
          }을 선정하시겠어요? 캠페인 계약서 진행이 시작됩니다.`,
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

  const avatar = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#171a17] text-[14px] font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
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

  return (
    <div className="grid gap-2 px-3 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {profileHref ? (
          <Link
            to={profileHref}
            className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171a17]"
            aria-label={`${applicantName} 프로필 보기`}
          >
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {profileHref ? (
              <Link
                to={profileHref}
                className="truncate text-[13px] font-extrabold text-[#171a17] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171a17]"
                title={`${applicantName} 프로필 보기`}
              >
                {applicantName}
              </Link>
            ) : (
              <p className="truncate text-[13px] font-extrabold text-[#171a17]">
                {applicantName}
              </p>
            )}
          </div>
          {primaryHandle ? (
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
              {primaryHandle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <ApplicantPlatformLinks platforms={displayPlatforms} />
        <ApplicantCategoryPill category={mainCategory} />
      </div>
      {applicantPerformance ? (
        <p className="truncate text-[11px] font-semibold text-[#606861]">
          {applicantPerformance}
        </p>
      ) : null}
      {thread.applicationContact?.phone || thread.applicationContact?.email ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[#4f5850]">
          {thread.applicationContact.phone ? (
            <a
              href={`tel:${thread.applicationContact.phone.replace(/[^\d+]/g, "")}`}
              className="truncate hover:text-blue-700 hover:underline"
            >
              {thread.applicationContact.phone}
            </a>
          ) : null}
          {thread.applicationContact.email ? (
            <a
              href={`mailto:${thread.applicationContact.email}`}
              className="truncate hover:text-blue-700 hover:underline"
            >
              {thread.applicationContact.email}
            </a>
          ) : null}
        </div>
      ) : null}
      <div className="grid w-full grid-cols-2 gap-1.5 sm:w-[190px]">
        {profileHref ? (
          <Link
            to={profileHref}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-[#d9e0d9] bg-white px-2 text-[12px] font-extrabold text-[#303630] transition hover:border-[#171a17] hover:text-[#171a17]"
          >
            프로필
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        {thread.convertedContractId ? (
          <Link
            to={`/advertiser/contract/${thread.convertedContractId}`}
            className={`${primaryActionSpan} inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md bg-[#171a17] px-2 text-[12px] font-extrabold text-white transition hover:bg-black`}
          >
            계약서 보기
          </Link>
        ) : canAccept ? (
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={isAccepting}
            className={`${primaryActionSpan} inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 text-[12px] font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300`}
          >
            {isAccepting
              ? "처리 중"
              : isSelectionReserved
                ? "선정 계속"
                : "선정"}
          </button>
        ) : (
          <span
            className={`${primaryActionSpan} inline-flex h-8 min-w-0 items-center justify-center rounded-md border px-2 text-[12px] font-extrabold ${statusMeta.className}`}
          >
            {statusMeta.label}
          </span>
        )}
        {acceptError ? (
          <p className="col-span-2 text-[11px] font-semibold text-rose-700">
            {acceptError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function getCampaignApplicantPerformanceLabel(
  platforms: Array<{
    followersLabel?: string;
    performanceLabel?: string;
    metricTrust?: "self_reported";
  }>,
  profile?: MarketplaceInfluencerProfile,
) {
  const performanceLabels = platforms
    .filter((platform) => platform.metricTrust !== "self_reported")
    .map((platform) => platform.performanceLabel)
    .filter((label): label is string => Boolean(label?.trim()));
  const audienceLabel = profile?.audience?.trim();

  return [
    ...performanceLabels,
    audienceLabel && !performanceLabels.includes(audienceLabel)
      ? audienceLabel
      : undefined,
  ]
    .filter((label): label is string => Boolean(label))
    .slice(0, 2)
    .join(" · ");
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
    <div className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
      {visiblePlatforms.slice(0, 1).map((item, index) => {
        const label = platformLabels[item.platform] ?? item.label;
        const text = item.followersLabel;
        const title = [label, item.followersLabel, item.performanceLabel]
          .filter(Boolean)
          .join(" ");
        const key = `${item.platform}-${item.handle ?? item.url ?? index}`;
        const platformMeta =
          PLATFORM_META[marketplacePlatformToContractPlatform(item.platform)];
        const content = (
          <>
            <span className="shrink-0">{platformMeta.mark}</span>
            {text ? <span className="truncate">{text}</span> : null}
          </>
        );

        if (item.url) {
          return (
            <a
              key={key}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className={`inline-flex max-w-full items-center gap-1.5 text-[11px] font-extrabold transition hover:text-[#171a17] ${platformMeta.className}`}
              title={item.handle ? `${title} · ${item.handle}` : title}
            >
              {content}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          );
        }

        return (
          <span
            key={key}
            className={`inline-flex max-w-full items-center gap-1.5 text-[11px] font-extrabold ${platformMeta.className}`}
            title={item.handle ? `${title} · ${item.handle}` : title}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}

function ApplicantCategoryPill({ category }: { category?: string }) {
  if (!category) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center text-[11px] font-extrabold text-[#606861]"
      title={`메인 카테고리 ${category}`}
    >
      {category}
    </span>
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

function getCampaignApplicantDisplayName(thread: MarketplaceMessageThread) {
  return removeInternalTestLabel(
    thread.counterpartName || thread.senderName,
    "인플루언서",
  );
}

function getCampaignApplicantProfile(
  thread: MarketplaceMessageThread,
  applicantName: string,
) {
  if (thread.counterpartProfilePublished === false) return undefined;

  return (
    findInfluencerProfileByHandle(thread.counterpartHref) ??
    findInfluencerProfileByDisplayName(applicantName)
  );
}

function getCampaignApplicantDisplayPlatforms(
  thread: MarketplaceMessageThread,
  fallbackProfile?: MarketplaceInfluencerProfile,
) {
  const platforms =
    !thread.counterpartHref && fallbackProfile?.platforms.length
      ? fallbackProfile.platforms
      : thread.platforms;

  return platforms.map((platform) => ({
    ...platform,
    followersLabel: /^(?:계정 연동|채널 확인|미입력|-)$/i.test(
      platform.followersLabel?.trim() ?? "",
    )
      ? undefined
      : platform.followersLabel,
  }));
}

function getCampaignApplicantMainCategory(
  categories?: string[],
  profile?: MarketplaceInfluencerProfile,
) {
  return [...(categories ?? []), ...(profile?.categories ?? [])].find(
    (category) => category.trim().length > 0,
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
      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate text-left text-[13px] font-semibold text-[#171a17] underline-offset-4 hover:underline"
        >
          {removeInternalTestLabel(contract.influencer_info.name, "인플루언서")}
        </button>
      </div>
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
            <span className="truncate">콘텐츠 제출 링크 열기</span>
          </a>
        ) : contentSubmitted ? (
          <span className="text-[12px] font-semibold text-[#303630]">
            콘텐츠 제출
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-[#9aa39d]">
            콘텐츠 미제출
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
  periodFilter,
  onPeriodFilterChange,
  dateFromFilter,
  onDateFromFilterChange,
  dateToFilter,
  onDateToFilterChange,
  sortState,
  onSortChange,
  panelCloseSignal,
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
  periodFilter: CostPeriodFilter;
  onPeriodFilterChange: (value: CostPeriodFilter) => void;
  dateFromFilter: string;
  onDateFromFilterChange: (value: string) => void;
  dateToFilter: string;
  onDateToFilterChange: (value: string) => void;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
  panelCloseSignal: number;
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
    dateFromFilter || dateToFilter
      ? {
          id: "date-range",
          label: `${dateColumnLabel} ${formatCostRangeLabel({
            from: dateFromFilter || undefined,
            to: dateToFilter || undefined,
          })}`,
          onRemove: () => {
            onPeriodFilterChange("CUSTOM");
            onDateFromFilterChange("");
            onDateToFilterChange("");
          },
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
  const [periodPickerCloseSignal, setPeriodPickerCloseSignal] = useState(0);
  const displayContracts = collapseInternalDuplicateContracts(
    contracts,
    getDashboardContractCollapseKey,
  );
  const paginationScopeKey = [
    amountFilter,
    contractTypeFilter,
    dateFromFilter,
    dateToFilter,
    detailStatusFilter,
    lifecycleFilter,
    platformFilter,
    query,
    sortState.direction,
    sortState.key,
  ].join("|");
  const [paginationState, setPaginationState] = useState({
    page: 1,
    scopeKey: paginationScopeKey,
  });
  const totalPages = Math.max(
    1,
    Math.ceil(displayContracts.length / CONTRACTS_PER_PAGE),
  );
  const currentPage =
    paginationState.scopeKey === paginationScopeKey ? paginationState.page : 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * CONTRACTS_PER_PAGE;
  const pageEndIndex = Math.min(
    pageStartIndex + CONTRACTS_PER_PAGE,
    displayContracts.length,
  );
  const paginatedContracts = displayContracts.slice(pageStartIndex, pageEndIndex);
  const shouldShowPagination = displayContracts.length > CONTRACTS_PER_PAGE;
  const handlePageChange = (page: number) =>
    setPaginationState({
      page,
      scopeKey: paginationScopeKey,
    });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFiltersOpen(false);
      setPeriodPickerCloseSignal((current) => current + 1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [panelCloseSignal]);

  return (
    <section
      data-product-tour="advertiser-contract-workspace"
      className="overflow-visible rounded-[8px] border border-[#d9e0d9] bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
    >
      {lifecycleTabs}
      <div className="border-b border-[#d9e0d9] bg-white">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-[180px] flex-1">
            <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
              1:1 계약 목록
            </p>
            {isDataPending ? (
              <span
                className="mt-1 block h-3 w-24 rounded-full bg-neutral-100"
                aria-hidden="true"
              />
            ) : (
              <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
                {shouldShowPagination
                  ? `${(pageStartIndex + 1).toLocaleString("ko-KR")}-${pageEndIndex.toLocaleString("ko-KR")} / ${displayContracts.length.toLocaleString("ko-KR")}건`
                  : `${displayContracts.length.toLocaleString("ko-KR")}건 표시`}{" "}
                · {filterSummary}
              </p>
            )}
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            <DashboardPeriodPicker
              periodFilter={periodFilter}
              onPeriodFilterChange={onPeriodFilterChange}
              dateFromFilter={dateFromFilter}
              onDateFromFilterChange={onDateFromFilterChange}
              dateToFilter={dateToFilter}
              onDateToFilterChange={onDateToFilterChange}
              align="right"
              closeSignal={periodPickerCloseSignal}
              onOpen={() => setFiltersOpen(false)}
            />
            <div className="relative">
              <DashboardFilterToggleButton
                open={filtersOpen}
                activeCount={activeFilters.length}
                onClick={() => {
                  if (!filtersOpen) {
                    setPeriodPickerCloseSignal((signal) => signal + 1);
                  }
                  setFiltersOpen(!filtersOpen);
                }}
                controlsId="advertiser-contract-filters"
              />
              <ResponsiveFilterPanel
                id="advertiser-contract-filters"
                open={filtersOpen}
                activeCount={activeFilters.length}
                onClose={() => setFiltersOpen(false)}
                onClear={() => {
                  onPlatformFilterChange("ALL");
                  onContractTypeFilterChange("ALL");
                  onAmountFilterChange("ALL");
                  onDetailStatusFilterChange("ALL");
                  onPeriodFilterChange("CUSTOM");
                  onDateFromFilterChange("");
                  onDateToFilterChange("");
                  onQueryChange("");
                }}
                className="sm:w-[min(920px,calc(100vw-48px))]"
              >
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(132px,0.34fr)_minmax(108px,0.26fr)_minmax(300px,1fr)_minmax(132px,0.34fr)_minmax(112px,0.3fr)] lg:items-end">
                  <TableFilterSelect
                    label="플랫폼"
                    value={platformFilter}
                    options={platformOptions}
                    onChange={(value) => onPlatformFilterChange(value as PlatformFilter)}
                  />
                  <TableFilterSelect
                    label="종류"
                    value={contractTypeFilter}
                    options={contractTypeOptions}
                    onChange={(value) => onContractTypeFilterChange(value as ContractTypeFilter)}
                  />
                  <ContractNameSearch
                    value={query}
                    onChange={onQueryChange}
                    sortKey="title"
                    sortState={sortState}
                    onSortChange={onSortChange}
                  />
                  <TableFilterSelect
                    label="지급내용"
                    value={amountFilter}
                    options={amountOptions}
                    onChange={(value) => onAmountFilterChange(value as AmountFilter)}
                  />
                  <TableFilterSelect
                    label="현 단계"
                    value={detailStatusFilter}
                    options={statusOptions}
                    onChange={(value) => onDetailStatusFilterChange(value as DetailStatusFilter)}
                  />
                </div>
              </ResponsiveFilterPanel>
            </div>
          </div>
        </div>
        <DashboardAppliedFilterBar
          filters={activeFilters}
          onClearAll={() => {
            onPlatformFilterChange("ALL");
            onContractTypeFilterChange("ALL");
            onAmountFilterChange("ALL");
            onDetailStatusFilterChange("ALL");
            onPeriodFilterChange("CUSTOM");
            onDateFromFilterChange("");
            onDateToFilterChange("");
            onQueryChange("");
          }}
        />
      </div>
      <ContractTableHeaderRow
        dateColumnLabel={dateColumnLabel}
        sortState={sortState}
        onSortChange={onSortChange}
      />

      <div className="no-scrollbar max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1 lg:divide-y-0">
        {isDataPending ? (
          <ContractTableSkeletonRows />
        ) : displayContracts.length > 0 ? (
          paginatedContracts.map((contract) => (
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
      {!isDataPending && shouldShowPagination ? (
        <ContractPagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          pageStartIndex={pageStartIndex}
          pageEndIndex={pageEndIndex}
          totalItems={displayContracts.length}
          onPageChange={handlePageChange}
        />
      ) : null}
    </section>
  );
}

function ContractPagination({
  currentPage,
  totalPages,
  pageStartIndex,
  pageEndIndex,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  pageStartIndex: number;
  pageEndIndex: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const pages = getPaginationPages(currentPage, totalPages);

  return (
    <div className="flex flex-col gap-2 border-t border-[#edf1ed] bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[11px] font-semibold text-[#606861]">
        {(pageStartIndex + 1).toLocaleString("ko-KR")}-
        {pageEndIndex.toLocaleString("ko-KR")} /{" "}
        {totalItems.toLocaleString("ko-KR")}건
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          aria-label="이전 페이지"
          title="이전 페이지"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d9e0d9] bg-white text-[#303630] transition hover:border-[#171a17] hover:text-[#171a17] disabled:pointer-events-none disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-300"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
        {pages.map((page, index) =>
          page === "gap" ? (
            <span
              key={`gap-${index}`}
              className="inline-flex h-8 w-6 items-center justify-center text-[11px] font-bold text-[#8b938d]"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={page === currentPage ? "page" : undefined}
              style={
                page === currentPage
                  ? {
                      backgroundColor: "#ffffff",
                      borderColor: "#171a17",
                      color: "#171a17",
                      boxShadow: "inset 0 0 0 1px #171a17",
                    }
                  : undefined
              }
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-[13px] font-black tabular-nums transition ${
                page === currentPage
                  ? "border-[#171a17] bg-white text-[#171a17] shadow-[inset_0_0_0_1px_#171a17]"
                  : "border border-[#d9e0d9] bg-white text-[#303630] hover:border-[#171a17] hover:text-[#171a17]"
              }`}
            >
              {page}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          aria-label="다음 페이지"
          title="다음 페이지"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d9e0d9] bg-white text-[#303630] transition hover:border-[#171a17] hover:text-[#171a17] disabled:pointer-events-none disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-300"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function getPaginationPages(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);
  if (currentPage > 2) pages.add(currentPage - 1);
  if (currentPage < totalPages - 1) pages.add(currentPage + 1);

  return [...pages]
    .sort((a, b) => a - b)
    .flatMap<(number | "gap")>((page, index, sortedPages) => {
      if (index === 0) return [page];
      return page - sortedPages[index - 1] > 1 ? ["gap", page] : [page];
    });
}

function ContractTableSkeletonRows() {
  return (
    <div className="divide-y divide-[#edf1ed] lg:divide-y-0" aria-hidden="true">
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
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  sortKey?: SortKey;
  sortState?: ContractSort;
  onSortChange?: (key: SortKey) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${className} ${
        compact
          ? "grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-2"
          : "block min-w-0"
      }`}
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
  className = "",
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
  className?: string;
}) {
  return (
    <div
      className={`${className} ${
        compact
          ? "grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-center gap-2"
          : "block min-w-0"
      }`}
    >
      <ColumnHeader
        label={label}
        sortKey={sortKey}
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <FilterSelectControl
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={`${label} 필터`}
        className={`max-w-full ${maxWidthClassName} ${compact ? "" : "mt-1"}`}
      />
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
          ? "bg-white text-[#171a17] ring-1 ring-[#cbd5cc] shadow-sm"
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
      className="group grid w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50/45 lg:min-h-[38px] lg:grid-cols-[minmax(132px,0.34fr)_minmax(108px,0.26fr)_minmax(300px,1fr)_minmax(132px,0.34fr)_minmax(146px,0.38fr)_minmax(112px,0.3fr)] lg:items-center lg:py-1.5"
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
        {isInitialEmpty ? "아직 1:1 계약이 없습니다" : "조건에 맞는 1:1 계약이 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {isInitialEmpty
          ? "상대 정보와 합의 조건을 입력해 1:1 계약을 만들고 바로 관리할 수 있습니다."
          : "검색어를 줄이거나 전체로 바꿔보세요."}
      </p>
    </section>
  );
}

function CampaignParticipantEmptyState({
  isInitialEmpty,
}: {
  isInitialEmpty: boolean;
}) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {isInitialEmpty
          ? "아직 선정자별 진행이 없습니다"
          : "조건에 맞는 선정자가 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {isInitialEmpty
          ? "선정자별 계약서와 서명 진행이 이곳에 표시됩니다."
          : "검색어나 필터를 줄여보세요."}
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
          ? "캠페인 작성에서 모집 조건을 만들면 이곳에서 선정자별 진행을 관리합니다."
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
      <p className="font-semibold">1:1 계약 목록을 최신 상태로 불러오지 못했습니다.</p>
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

function contractTypeToCampaignProposalType(type: Contract["type"]): CampaignProposalType {
  if (type === "PPL") return "ppl";
  if (type === "공동구매") return "group_buy";
  return "product_seeding";
}

function getCampaignTypeLabel(campaign: CampaignGroup) {
  const labels = campaign.types
    .map((type) => proposalTypeLabels[type])
    .filter(Boolean);

  if (labels.length <= 1) return labels[0] ?? "광고";
  return `${labels[0]} 외 ${labels.length - 1}`;
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

function getCostDateRange(
  period: CostPeriodFilter,
  customFrom: string,
  customTo: string,
): CostDateRange {
  if (period === "CUSTOM") {
    return {
      from: customFrom || undefined,
      to: customTo || undefined,
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date;
  let to: Date;

  if (period === "THIS_WEEK") {
    const mondayOffset = (today.getDay() + 6) % 7;
    from = new Date(today);
    from.setDate(today.getDate() - mondayOffset);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
  } else if (period === "LAST_WEEK") {
    const mondayOffset = (today.getDay() + 6) % 7;
    from = new Date(today);
    from.setDate(today.getDate() - mondayOffset - 7);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
  } else if (period === "LAST_MONTH") {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to = new Date(today.getFullYear(), today.getMonth(), 0);
  } else {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }

  return {
    from: toDateInputValue(from),
    to: toDateInputValue(to),
  };
}

function getCostPeriodButtonLabel(range: CostDateRange) {
  const rangeLabel = formatCostRangeLabel(range);
  return rangeLabel ? `기간 선택 · ${rangeLabel}` : "기간 선택";
}

function formatCostRangeLabel(range: CostDateRange) {
  if (range.from && range.to) {
    if (range.from === range.to) return formatDateFilterLabel(range.from);
    return `${formatDateFilterLabel(range.from)}-${formatDateFilterLabel(range.to)}`;
  }
  if (range.from) return `${formatDateFilterLabel(range.from)}-`;
  if (range.to) return `-${formatDateFilterLabel(range.to)}`;
  return "";
}

function normalizeCostDraftRange(from: string, to: string): CostDateRange {
  if (from && to) {
    return from <= to ? { from, to } : { from: to, to: from };
  }
  if (from) return { from, to: from };
  if (to) return { from: to, to };
  return {};
}

function getCostCalendarMonth(value?: string) {
  const date = parseDateInputValue(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addCalendarMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatCostCalendarMonthTitle(date: Date) {
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCostCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function buildCostDashboardEntries(
  contracts: Contract[],
  range: CostDateRange,
): CostDashboardEntry[] {
  return contracts
    .map((contract) => buildCostDashboardEntry(contract))
    .filter((entry): entry is CostDashboardEntry => Boolean(entry))
    .filter(
      (entry) =>
        (!range.from || entry.dateValue >= range.from) &&
        (!range.to || entry.dateValue <= range.to),
    );
}

function buildCostDashboardEntry(contract: Contract): CostDashboardEntry | undefined {
  const dateValue = getCostContractDateValue(contract);
  if (!dateValue) return undefined;

  const lifecycle = getDashboardContractLifecycle(contract);
  const source =
    contract.campaign?.source === "marketplace_campaign" ? "campaigns" : "contracts";
  const sourceLabel = source === "campaigns" ? "캠페인" : "1:1 계약";
  const title = formatDashboardContractTitle(contract.title);
  const influencerName = removeInternalTestLabel(
    contract.influencer_info?.name,
    "인플루언서",
  );
  const platformLabel = formatCampaignPlatformSummary(getContractPlatforms(contract));
  const amountValue = parseDashboardCostAmount(contract.campaign?.budget);
  const amountLabel = formatDashboardAmountLabel(contract.campaign?.budget);
  const lifecycleLabel = getCostLifecycleLabel(lifecycle);
  const paid = Boolean(contract.settlement?.advertiser_confirmed_paid);
  const paidLabel = paid ? "지급 확인" : "미확인";
  const nextDueLabel = formatDashboardContractDateLabel(contract, lifecycle);

  return {
    id: contract.id,
    contract,
    dateValue,
    dateLabel: formatDateFilterLabel(dateValue),
    source,
    sourceLabel,
    title,
    influencerName,
    platformLabel,
    amountValue,
    amountLabel,
    lifecycle,
    lifecycleLabel,
    paid,
    paidLabel,
    nextDueLabel,
    searchableText: [
      title,
      influencerName,
      platformLabel,
      sourceLabel,
      amountLabel,
      lifecycleLabel,
      paidLabel,
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function getCostContractDateValue(contract: Contract) {
  const rawValue = contract.created_at || contract.updated_at;
  if (!rawValue) return "";

  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? "" : toDateInputValue(date);
}

function parseDashboardCostAmount(value?: string | null) {
  const text = value?.trim();
  if (
    !text ||
    /협의|미정|수수료|commission|판매\s*수익|성과\s*형|매월|월별|회당|건당/i.test(
      text,
    ) ||
    /[~–—-]|부터|이상|이하|최대|최소|범위/i.test(text) ||
    /(?:월|개월|회|건)\s*[x×*]?\s*\d/i.test(text)
  ) {
    return undefined;
  }

  const matches = Array.from(
    text.matchAll(
      /(\d+(?:\.\d+)?)\s*억\s*원?|(\d+(?:\.\d+)?)\s*만\s*원?|([0-9][0-9,]{3,})\s*원/g,
    ),
  );
  if (matches.length > 1) return undefined;

  if (matches.length === 1) {
    const match = matches[0];
    const amount = match[1]
      ? Number(match[1]) * 100_000_000
      : match[2]
        ? Number(match[2]) * 10_000
        : Number((match[3] ?? "").replace(/,/g, ""));
    return Number.isFinite(amount) ? Math.round(amount) : undefined;
  }

  if (!/^\d{4,}$/.test(text.replace(/,/g, ""))) return undefined;
  const amount = Number(text.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : undefined;
}

function getCostDashboardSummary(entries: CostDashboardEntry[]): CostDashboardSummary {
  return entries.reduce<CostDashboardSummary>(
    (summary, entry) => {
      const amount = entry.amountValue ?? 0;

      if (entry.amountValue === undefined) summary.unpriced += 1;

      summary.total += amount;
      if (entry.lifecycle === "ENDED") summary.ended += amount;
      else summary.inProgress += amount;
      if (entry.paid) summary.paid += amount;

      return summary;
    },
    {
      total: 0,
      inProgress: 0,
      ended: 0,
      paid: 0,
      unpriced: 0,
    },
  );
}

function getCostTrendItems(
  entries: CostDashboardEntry[],
  period: CostPeriodFilter,
  range: CostDateRange,
): CostTrendItem[] {
  const buckets = getCostTrendBuckets(entries, period, range);
  const byKey = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        ...bucket,
        contractAmount: 0,
        campaignAmount: 0,
        totalAmount: 0,
      },
    ]),
  );

  entries.forEach((entry) => {
    const bucket = buckets.find(
      (item) =>
        item.from &&
        item.to &&
        entry.dateValue >= item.from &&
        entry.dateValue <= item.to,
    );
    const item = bucket
      ? byKey.get(bucket.key)
      : byKey.get(entry.dateValue.slice(0, 7));
    if (!item) return;

    const amount = entry.amountValue ?? 0;
    if (entry.source === "campaigns") item.campaignAmount += amount;
    else item.contractAmount += amount;
    item.totalAmount += amount;
  });

  return Array.from(byKey.values());
}

function getCostTrendBuckets(
  entries: CostDashboardEntry[],
  period: CostPeriodFilter,
  range: CostDateRange,
) {
  if (period === "THIS_WEEK" || period === "LAST_WEEK") {
    return buildDailyCostTrendBuckets(range);
  }
  if (period === "THIS_MONTH" || period === "LAST_MONTH") {
    return buildWeeklyCostTrendBuckets(range);
  }
  return buildMonthCostTrendBuckets(entries, range);
}

function buildDailyCostTrendBuckets(range: CostDateRange) {
  const from = parseDateInputValue(range.from) ?? new Date();
  const to = parseDateInputValue(range.to) ?? from;

  return buildDateBucketRange(from, to, (date) => ({
    key: toDateInputValue(date),
    label: `${date.getMonth() + 1}.${date.getDate()}`,
    from: toDateInputValue(date),
    to: toDateInputValue(date),
  }));
}

function buildWeeklyCostTrendBuckets(range: CostDateRange) {
  const from = parseDateInputValue(range.from) ?? new Date();
  const to = parseDateInputValue(range.to) ?? from;
  const buckets: Array<{ key: string; label: string; from: string; to: string }> = [];
  let cursor = new Date(from);

  while (cursor <= to) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor);
    bucketEnd.setDate(bucketEnd.getDate() + 6);
    if (bucketEnd > to) bucketEnd.setTime(to.getTime());

    const weekLabel = `${buckets.length + 1}주`;

    buckets.push({
      key: toDateInputValue(bucketStart),
      label: weekLabel,
      from: toDateInputValue(bucketStart),
      to: toDateInputValue(bucketEnd),
    });

    cursor = new Date(bucketEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets.length > 0
    ? buckets
    : [
        {
          key: toDateInputValue(from),
          label: `${from.getMonth() + 1}.${from.getDate()}`,
          from: toDateInputValue(from),
          to: toDateInputValue(from),
        },
      ];
}

function buildDateBucketRange<T>(
  from: Date,
  to: Date,
  createBucket: (date: Date) => T,
) {
  const buckets: T[] = [];
  const cursor = new Date(from);

  while (cursor <= to) {
    buckets.push(createBucket(new Date(cursor)));
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets.length > 0 ? buckets : [createBucket(from)];
}

function parseDateInputValue(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildMonthCostTrendBuckets(
  entries: CostDashboardEntry[],
  range: CostDateRange,
) {
  const keys = Array.from(
    new Set(entries.map((entry) => entry.dateValue.slice(0, 7))),
  ).sort();

  if (keys.length > 0) {
    return keys.map((key) => ({
      key,
      label: key.replace("-", "."),
      from: `${key}-01`,
      to: getMonthEndDateInputValue(key),
    }));
  }

  const fallback = range.from ?? toDateInputValue(new Date());
  const key = fallback.slice(0, 7);

  return [
    {
      key,
      label: key.replace("-", "."),
      from: `${key}-01`,
      to: getMonthEndDateInputValue(key),
    },
  ];
}

function getMonthEndDateInputValue(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map((part) => Number(part));
  if (!year || !month) return `${yearMonth}-31`;
  return toDateInputValue(new Date(year, month, 0));
}

function formatCostCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function getCostLifecycleLabel(lifecycle: CampaignLifecycle) {
  if (lifecycle === "ENDED") return "종료";
  return "진행중";
}

function getCostSourceFilterLabel(value: CostSourceFilter) {
  return COST_SOURCE_FILTERS.find((item) => item.value === value)?.label ?? "전체";
}

function getCostStatusFilterLabel(value: CostStatusFilter) {
  return COST_STATUS_FILTERS.find((item) => item.value === value)?.label ?? "전체";
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
    case "type":
      result = compareText(getCampaignTypeLabel(a), getCampaignTypeLabel(b));
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
  types: Set<CampaignProposalType>;
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
      types: new Set<CampaignProposalType>(),
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
    group.types.add(campaign.type);
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
    group.types.add(contractTypeToCampaignProposalType(contract.type));
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
    group.types.add(thread.proposalType);
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
      const platforms = group.marketplaceCampaign?.platforms?.length
        ? group.marketplaceCampaign.platforms.map(
            marketplacePlatformToContractPlatform,
          )
        : Array.from(group.platforms);
      const types = group.marketplaceCampaign
        ? [group.marketplaceCampaign.type]
        : Array.from(group.types);
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
        types: types.length > 0 ? types : ["sponsored_post"],
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

function getPreferredCampaignLifecycle(
  counts: Record<CampaignLifecycle, number>,
): CampaignLifecycle {
  return (["IN_PROGRESS", "RECRUITING", "ENDED"] as CampaignLifecycle[]).reduce(
    (best, item) => (counts[item] > counts[best] ? item : best),
    "RECRUITING",
  );
}

function getCampaignCapacity(campaign: CampaignGroup) {
  const raw =
    campaign.marketplaceCampaign?.applicantLimit ??
    campaign.contracts.find((contract) => contract.campaign?.applicant_limit)
      ?.campaign?.applicant_limit ??
    extractCampaignSummaryField(campaign, "모집인원:", [
      "지급내용:",
      "콘텐츠:",
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
      "콘텐츠:",
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

  const parts = formatCampaignDashboardDateWithDday(value);
  if (campaign.lifecycle === "ENDED" && parts.dateLabel) {
    return {
      label: `종료 / ${parts.dateLabel}`,
      dday: "종료",
      dateLabel: parts.dateLabel,
    };
  }

  return parts;
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
    dayDiff > 0
      ? `D-${dayDiff}`
      : dayDiff === 0
        ? "D-0"
        : "마감 지남";

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
  if (
    campaign.marketplaceCampaign?.status === "open" &&
    !isPastCampaignDeadline(campaign.marketplaceCampaign.deadline)
  ) {
    return "RECRUITING";
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
          detail: "콘텐츠 제출 링크나 서명 상태가 마감 이후에도 완료되지 않았습니다.",
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
          detail: "선정 후 생성된 계약서 초안을 검토 링크 발급까지 이어가야 합니다.",
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
          detail: "캠페인 마감 전 서명이나 콘텐츠 제출 누락 여부를 확인하세요.",
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

  if (
    campaign.marketplaceCampaign &&
    campaign.lifecycle === "RECRUITING" &&
    status === "open"
  ) {
    actions.push({
      status: "closed",
      label: "모집 종료",
      confirmMessage:
        "모집을 종료하면 선정하지 않은 지원자는 미선정으로 확정됩니다. 계속할까요?",
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
        title: "선정 완료",
        description: "지원자를 선정하고 캠페인 계약서 진행을 시작했습니다.",
      });
    }
  }

  for (const contract of campaign.contracts) {
    campaignEvents.push({
      id: `${contract.id}:created`,
      createdAt: contract.created_at,
      actor: "광고주",
      title: "계약서 준비",
      description: `${removeInternalTestLabel(contract.influencer_info.name, "인플루언서")} 선정자 계약서가 만들어졌습니다.`,
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
        title: "콘텐츠 제출",
        description: contract.post_link
          ? "인플루언서가 콘텐츠 제출 링크를 등록했습니다."
          : "인플루언서가 콘텐츠 파일을 제출했습니다.",
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
    campaign_application_accepted: "지원자 선정",
    contract_created: "계약서 준비",
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
      label: "콘텐츠 제출",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (isContractContentMissing(contract)) {
    return {
      label: "콘텐츠 미제출",
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

function matchesDashboardDateRange(
  contract: Contract,
  lifecycle: CampaignLifecycle,
  fromValue: string,
  toValue: string,
) {
  if (!fromValue && !toValue) return true;

  const dateValue = getDashboardContractDateInputValue(contract, lifecycle);
  if (!dateValue) return false;

  return (!fromValue || dateValue >= fromValue) && (!toValue || dateValue <= toValue);
}

function getDashboardContractDateInputValue(
  contract: Contract,
  lifecycle: CampaignLifecycle,
) {
  const value = getDashboardContractDateValue(contract, lifecycle);
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return toDateInputValue(date);
}

function toDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateFilterLabel(value: string) {
  if (!value) return "";

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;

  return `${year}.${month}.${day}`;
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
    dayDiff > 0
      ? `D-${dayDiff}`
      : dayDiff === 0
        ? "D-0"
        : "마감 지남";

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

const CONTRACT_STATUS_EXPORT_LABELS: Record<ContractStatus, string> = {
  DRAFT: "초안",
  REVIEWING: "검토중",
  NEGOTIATING: "수정중",
  APPROVED: "서명대기",
  SIGNED: "서명완료",
  CLOSED: "종료",
};

const CAMPAIGN_LIFECYCLE_EXPORT_LABELS: Record<CampaignLifecycle, string> = {
  RECRUITING: "모집중",
  IN_PROGRESS: "진행중",
  ENDED: "종료",
};

const CONTRACT_LIFECYCLE_EXPORT_LABELS: Record<CampaignLifecycle, string> = {
  RECRUITING: "작성중",
  IN_PROGRESS: "진행중",
  ENDED: "종료",
};

function getDashboardExportTimestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
}

function formatExportDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join(".");
}

function formatExportDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${formatExportDate(value)} ${[
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":")}`;
}

function formatExportBoolean(value?: boolean) {
  if (value === undefined) return "";
  return value ? "예" : "아니오";
}

function formatContractPaymentMethodLabel(
  value?: NonNullable<Contract["campaign"]>["payment_method"],
) {
  if (value === "external_bank_transfer") return "외부 계좌입금";
  if (value === "advertiser_direct") return "광고주 직접 지급";
  if (value === "other_direct") return "기타 직접 정산";
  return "";
}

function joinExportValues(values: Array<string | undefined | null>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function getContractPlatformExportLabel(contract: Contract) {
  return joinExportValues(
    getContractPlatformDisplayItems(contract).map((item) => item.title),
  );
}

function getContractCreatorExportProfile(contract: Contract) {
  return (
    findInfluencerProfileByHandle(contract.influencer_info?.channel_url) ??
    findInfluencerProfileByDisplayName(contract.influencer_info?.name)
  );
}

function getContractCreatorAccountLabel(
  contract: Contract,
  profile?: MarketplaceInfluencerProfile,
) {
  if (profile?.platforms.length) {
    return joinExportValues(
      profile.platforms.map((platform) =>
        joinExportValues([platformLabels[platform.platform], platform.handle]),
      ),
    );
  }

  return contract.influencer_info?.channel_url ?? "";
}

function getContractCreatorChannelMetricLabel(profile?: MarketplaceInfluencerProfile) {
  if (!profile?.platforms.length) return "";

  return joinExportValues(
    profile.platforms.map((platform) =>
      joinExportValues([
        platformLabels[platform.platform],
        platform.followersLabel,
      ]),
    ),
  );
}

function formatCampaignSourceLabel(source?: Contract["campaign"]["source"]) {
  if (source === "marketplace_campaign") return "캠페인 모집";
  if (source === "direct") return "직접 계약";
  return "";
}

function getContractDeliverableCount(contract: Contract) {
  if (typeof contract.deliverable_summary?.total === "number") {
    return contract.deliverable_summary.total;
  }

  return contract.campaign?.deliverables?.length ?? "";
}

function getContractBusinessVerificationLabel(contract: Contract) {
  const status = contract.advertiser_trust?.business_verification_status;
  if (status === "approved") return "인증완료";
  if (status === "pending") return "심사중";
  if (status === "rejected") return "반려";
  if (status === "not_submitted") return "미제출";
  return contract.advertiser_trust?.business_verification_label ?? "";
}

function getContractWorkflowActorLabel(actor?: Contract["workflow"]["next_actor"]) {
  if (actor === "advertiser") return "광고주";
  if (actor === "influencer") return "인플루언서";
  if (actor === "system") return "시스템";
  return "";
}

function getContractRiskLevelLabel(level?: Contract["workflow"]["risk_level"]) {
  if (level === "high") return "높음";
  if (level === "medium") return "주의";
  if (level === "low") return "낮음";
  return "";
}

function getContractPdfStatusLabel(status?: Contract["evidence"]["pdf_status"]) {
  if (status === "signed_ready") return "서명본 준비";
  if (status === "draft_ready") return "초안 준비";
  if (status === "not_ready") return "미준비";
  return "";
}

function getContractSignatureExportInfo(contract: Contract) {
  const data = contract.signature_data;

  return {
    signedAt: data?.signed_at,
    signerName: data?.signer_name,
    signerEmail: data?.signer_email,
  };
}

function getSettlementExportStatus(contract: Contract) {
  if (
    contract.settlement?.status === "confirmed_paid" ||
    contract.settlement?.advertiser_confirmed_paid
  ) {
    return "지급 확인";
  }

  if (contract.settlement?.status === "unpaid_inquiry") return "미지급 문의";
  return "";
}

function getContractClauseExportCounts(contract: Contract) {
  return contract.clauses.reduce(
    (counts, clause) => {
      counts.total += 1;
      if (clause.status === "APPROVED") counts.approved += 1;
      if (clause.status === "MODIFICATION_REQUESTED") counts.changeRequested += 1;
      if (clause.status === "DELETION_REQUESTED") counts.deleteRequested += 1;
      return counts;
    },
    {
      total: 0,
      approved: 0,
      changeRequested: 0,
      deleteRequested: 0,
    },
  );
}

function getContractAuditExportSummary(contract: Contract) {
  const events = [...(contract.audit_events ?? [])].sort(
    (a, b) => getDateMs(a.created_at) - getDateMs(b.created_at),
  );

  return {
    count: events.length,
    firstAt: events[0]?.created_at,
    latestAt: events.at(-1)?.created_at,
  };
}

function buildAdvertiserCostExportSheet(entries: CostDashboardEntry[]): XlsxSheet {
  return {
    name: "광고비 현황",
    columns: [
      "계약 생성일",
      "구분",
      "계약명",
      "인플루언서",
      "플랫폼",
      "계약 금액",
      "합산 금액",
      "계약 상태",
      "지급 상태",
      "다음 기한",
      "최종수정일",
    ],
    rows: entries.map((entry) => [
      entry.dateLabel,
      entry.sourceLabel,
      entry.title,
      entry.influencerName,
      entry.platformLabel,
      entry.amountLabel,
      entry.amountValue ?? "",
      entry.lifecycleLabel,
      entry.paidLabel,
      entry.nextDueLabel,
      formatExportDateTime(entry.contract.updated_at),
    ]),
  };
}

function buildAdvertiserContractExportSheet(contracts: Contract[]): XlsxSheet {
  return {
    name: "계약",
    columns: [
      "계약명",
      "모집명",
      "구분",
      "상태",
      "유형",
      "광고주",
      "광고주 담당자",
      "사업자명",
      "사업자 인증상태",
      "사업자 인증일",
      "사업자번호(마스킹)",
      "대표자명",
      "크리에이터명",
      "크리에이터 계정명",
      "크리에이터 연락처",
      "채널 지표",
      "플랫폼",
      "콘텐츠 형식",
      "콘텐츠 수량",
      "콘텐츠 제출 총수",
      "콘텐츠 제출",
      "콘텐츠 승인",
      "콘텐츠 제출 업데이트",
      "게시 링크",
      "광고비/조건",
      "캠페인 출처",
      "모집 인원",
      "캠페인 기간",
      "시작일",
      "마감일",
      "업로드 마감일",
      "검수 마감일",
      "종료일",
      "수정 가능 횟수",
      "수정 요청 기준",
      "광고 고지 문구",
      "필수 해시태그",
      "브랜드 계정 태그",
      "추적 링크",
      "예시 레퍼런스",
      "지급 방식",
      "3.3% 원천징수 확인",
      "URL 제출 필요",
      "파일 제출 필요",
      "파일 예시",
      "검수 범위",
      "2차 활용 허용",
      "활용 채널",
      "활용 기간",
      "편집 허용",
      "다음 담당",
      "다음 액션",
      "워크플로 마감일",
      "리스크 수준",
      "PDF 상태",
      "감사 준비",
      "서명일",
      "서명자 이름",
      "서명자 이메일",
      "정산 상태",
      "정산 확인일",
      "정산 문의수",
      "조항 수",
      "승인 조항 수",
      "수정요청 조항 수",
      "삭제요청 조항 수",
      "감사 이벤트 수",
      "최초 감사일",
      "최근 감사일",
      "기준일",
      "계약 최초작성일",
      "최종수정일",
    ],
    rows: contracts.map((contract) => {
      const lifecycle = getDashboardContractLifecycle(contract);
      const creatorProfile = getContractCreatorExportProfile(contract);
      const signature = getContractSignatureExportInfo(contract);
      const clauseCounts = getContractClauseExportCounts(contract);
      const auditSummary = getContractAuditExportSummary(contract);

      return [
        formatDashboardContractTitle(contract.title),
        contract.campaign_name ?? "",
        CONTRACT_LIFECYCLE_EXPORT_LABELS[lifecycle],
        CONTRACT_STATUS_EXPORT_LABELS[contract.status],
        formatContractTypeLabel(contract.type),
        removeInternalTestLabel(contract.advertiser_info?.name, ""),
        removeInternalTestLabel(contract.advertiser_info?.manager, ""),
        removeInternalTestLabel(contract.advertiser_trust?.business_name, ""),
        getContractBusinessVerificationLabel(contract),
        formatExportDateTime(contract.advertiser_trust?.business_verified_at),
        contract.advertiser_trust?.business_registration_number_masked ?? "",
        removeInternalTestLabel(contract.advertiser_trust?.representative_name, ""),
        removeInternalTestLabel(contract.influencer_info?.name, ""),
        getContractCreatorAccountLabel(contract, creatorProfile),
        formatPublicContactValue(contract.influencer_info?.contact),
        getContractCreatorChannelMetricLabel(creatorProfile),
        getContractPlatformExportLabel(contract),
        joinExportValues(contract.campaign?.deliverables ?? []),
        getContractDeliverableCount(contract),
        contract.deliverable_summary?.total ?? "",
        contract.deliverable_summary?.submitted ?? "",
        contract.deliverable_summary?.approved ?? "",
        formatExportDateTime(contract.deliverable_summary?.updated_at),
        contract.post_link ?? "",
        formatDashboardAmountLabel(contract.campaign?.budget),
        formatCampaignSourceLabel(contract.campaign?.source),
        contract.campaign?.applicant_limit ?? "",
        contract.campaign?.period ?? "",
        formatExportDate(contract.campaign?.start_date),
        formatExportDate(contract.campaign?.deadline),
        formatExportDate(contract.campaign?.upload_due_at),
        formatExportDate(contract.campaign?.review_due_at),
        formatExportDate(contract.campaign?.end_date),
        contract.campaign?.revision_limit ?? "",
        contract.campaign?.revision_request_policy ?? "",
        contract.campaign?.disclosure_text ?? "",
        joinExportValues(contract.campaign?.required_hashtags ?? []),
        joinExportValues(contract.campaign?.brand_account_tags ?? []),
        contract.campaign?.tracking_link ?? "",
        joinExportValues(contract.campaign?.reference_links ?? []),
        formatContractPaymentMethodLabel(contract.campaign?.payment_method),
        formatExportBoolean(contract.campaign?.withholding_tax_enabled),
        formatExportBoolean(contract.campaign?.content_submission?.url_required),
        formatExportBoolean(contract.campaign?.content_submission?.file_required),
        contract.campaign?.content_submission?.file_examples ?? "",
        contract.campaign?.content_submission?.review_scope ?? "",
        formatExportBoolean(contract.campaign?.content_usage?.allowed),
        joinExportValues(contract.campaign?.content_usage?.channels ?? []),
        contract.campaign?.content_usage?.period ?? "",
        formatExportBoolean(contract.campaign?.content_usage?.edit_allowed),
        getContractWorkflowActorLabel(contract.workflow?.next_actor),
        contract.workflow?.next_action ?? "",
        formatExportDateTime(contract.workflow?.due_at),
        getContractRiskLevelLabel(contract.workflow?.risk_level),
        getContractPdfStatusLabel(contract.evidence?.pdf_status),
        formatExportBoolean(contract.evidence?.audit_ready),
        formatExportDateTime(signature.signedAt),
        removeInternalTestLabel(signature.signerName, ""),
        formatPublicContactValue(signature.signerEmail),
        getSettlementExportStatus(contract),
        formatExportDateTime(contract.settlement?.advertiser_confirmed_at),
        contract.settlement?.inquiries?.length ?? "",
        clauseCounts.total,
        clauseCounts.approved,
        clauseCounts.changeRequested,
        clauseCounts.deleteRequested,
        auditSummary.count,
        formatExportDateTime(auditSummary.firstAt),
        formatExportDateTime(auditSummary.latestAt),
        formatDashboardContractDateLabel(contract, lifecycle),
        formatExportDateTime(contract.created_at),
        formatExportDateTime(contract.updated_at),
      ];
    }),
  };
}

function buildAdvertiserCampaignExportSheet(campaigns: CampaignGroup[]): XlsxSheet {
  return {
    name: "캠페인",
    columns: [
      "계약명",
      "상태",
      "종류",
      "브랜드",
      "플랫폼",
      "지급조건",
      "지원자",
      "선정",
      "완료",
      "마감일",
      "최종수정일",
    ],
    rows: campaigns.map((campaign) => [
      campaign.name,
      CAMPAIGN_LIFECYCLE_EXPORT_LABELS[campaign.lifecycle],
      getCampaignTypeLabel(campaign),
      joinExportValues(campaign.brands),
      joinExportValues(
        campaign.platforms.map((platform) => PLATFORM_META[platform].label),
      ),
      getCampaignPaymentLabel(campaign),
      campaign.applicantCount,
      campaign.acceptedParticipantCount,
      campaign.completedCount,
      getCampaignListDateParts(campaign).label,
      formatExportDate(campaign.latestUpdatedAt),
    ]),
  };
}

function buildAdvertiserCampaignApplicantExportSheet(
  applicants: MarketplaceMessageThread[],
): XlsxSheet {
  return {
    name: "지원자",
    columns: [
      "이름",
      "상태",
      "플랫폼",
      "대표 카테고리",
      "소개",
      "휴대전화",
      "이메일",
      "신청일",
    ],
    rows: applicants.map((thread) => {
      const applicantName = getCampaignApplicantDisplayName(thread);
      const applicantProfile = getCampaignApplicantProfile(thread, applicantName);
      const displayPlatforms = getCampaignApplicantDisplayPlatforms(
        thread,
        applicantProfile,
      );
      const mainCategory = getCampaignApplicantMainCategory(
        thread.counterpartCategories,
        applicantProfile,
      );

      return [
        applicantName,
        APPLICANT_STATUS_META[
          getMarketplaceCampaignApplicationCustomerStatus(thread)
        ].label,
        joinExportValues(
          displayPlatforms.map((platform) =>
            joinExportValues([
              platformLabels[platform.platform],
              platform.handle,
              platform.followersLabel,
            ]),
          ),
        ),
        mainCategory,
        thread.counterpartIntro || thread.senderIntro,
        thread.applicationContact?.phone,
        thread.applicationContact?.email,
        formatExportDate(thread.createdAt),
      ];
    }),
  };
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
