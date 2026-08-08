import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpDown,
  ArrowUpWideNarrow,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  FileSignature,
  Gift,
  LogIn,
  LogOut,
  MapPin,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { apiFetch } from "../../domain/api";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  campaignProposalTypeOptions,
  CAMPAIGN_APPLICATION_CONTACT_POLICY_VERSION,
  formatCampaignApplicantLimit,
  formatMarketplaceCountries,
  getCampaignDeadlineLabel,
  getCampaignProposalTypeDisplayLabel,
  getMarketplaceBrandDisplayFamilyKey,
  getMarketplaceCountryLabel,
  isMarketplaceApplicationBrandId,
  marketplaceCountryOptions,
  platformLabels,
  proposalTypeLabels,
  type CampaignProposalType,
  type CampaignApplicationContactField,
  type MarketplaceBrandCampaign,
  type MarketplaceBrandProfile,
  type MarketplaceCampaignPost,
  type MarketplaceCountryCode,
} from "../../domain/marketplace";
import {
  formatMarketplaceMessageDate,
  getMarketplaceCampaignApplicationCustomerStatus,
  type MarketplaceCampaignApplicationCustomerStatus,
  type MarketplaceMessageThread,
  type MarketplaceMessagesResponse,
} from "../../domain/marketplaceInbox";
import type { InfluencerPlatform } from "../../domain/verification";
import {
  isAdvertiserCampaignAccess,
  isVerificationRequiredError,
  type AdvertiserCampaignAccess,
  type VerificationRequiredApiError,
} from "../../domain/verificationPolicy";
import { DashboardSurfaceSwitch } from "../../components/DashboardSurfaceSwitch";
import { MobileSurfaceSwitch } from "../../components/MobileSurfaceSwitch";
import { AdvertiserAccountSettingsMenu } from "../../components/AdvertiserAccountSettingsMenu";
import { InfluencerAccountSettingsMenu } from "../../components/InfluencerAccountSettingsMenu";
import { HeaderMessageCenterButton } from "../../components/HeaderMessageCenterButton";
import { HeaderNotificationCenterButton } from "../../components/HeaderNotificationCenterButton";
import { LogoMark } from "../../components/BrandLogo";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { ResponsiveFilterPanel } from "../../components/ResponsiveFilterPanel";
import { FilterSelectControl } from "../../components/FilterSelectControl";
import {
  ProductSpotlightTour,
  type ProductSpotlightTourStep,
} from "../../components/ProductSpotlightTour";
import { getPlatformDisplayName } from "../../domain/platformDisplay";
import {
  readSelectedAdvertiserBrandId,
  writeSelectedAdvertiserBrandId,
} from "../../domain/advertiserBrands";
import { clearAdvertiserSessionCache } from "../../domain/advertiserSessionCache";
import { clearAdvertiserDashboardBootstrapPreload } from "../../domain/advertiserDashboardPreload";
import { clearInfluencerDashboardPreload } from "../../domain/influencerDashboardPreload";
import { finishFastLoginTransition } from "../../domain/fastLoginTransition";
import { clearVerificationSummaryCache } from "../../hooks/useVerificationSummary";
import {
  clearMarketplaceMessageSummaryCache,
  useMarketplaceMessageSummary,
} from "../../hooks/useMarketplaceMessageSummary";
import { clearNotificationCenterCache } from "../../hooks/useNotificationCenter";
import {
  clearCampaignPublicationAttempt,
  fingerprintCampaignPublicationPayload,
  resolveCampaignPublicationAttempt,
  resolveCampaignPublicationIntentId,
  type CampaignPublicationAttempt,
} from "../../domain/campaignPublicationIdempotency";

type CampaignState =
  | { status: "loading" }
  | { status: "ready"; campaigns: MarketplaceCampaignPost[] }
  | { status: "error"; message: string };

type AdvertiserCampaignState =
  | { status: "loading" }
  | {
      status: "ready";
      brand: MarketplaceBrandProfile | null;
      brands: MarketplaceBrandProfile[];
      campaigns: MarketplaceBrandCampaign[];
      campaignAccess?: AdvertiserCampaignAccess;
    }
  | { status: "error"; message: string };

type PlatformFilter = "all" | InfluencerPlatform;
type ProposalTypeFilter = "all" | CampaignProposalType;
type InfluencerCampaignView = "open" | "applied";
type CampaignShellMode = "checking" | "authenticated" | "anonymous";
type CampaignShellRole = "advertiser" | "influencer";
type CampaignSortDirection = "asc" | "desc";
type CampaignSortKey =
  | "deadline"
  | "brand"
  | "title"
  | "applicant"
  | "payment"
  | "platform"
  | "type"
  | "status"
  | "followers"
  | "appliedAt";
type CampaignSort = {
  key: CampaignSortKey;
  direction: CampaignSortDirection;
};
type ApplicationStatusFilter =
  | "all"
  | MarketplaceCampaignApplicationCustomerStatus;

const INFLUENCER_CAMPAIGN_TOUR_STEPS = [
  {
    id: "surfaces",
    target: "influencer-dashboard-surfaces",
    title: "캠페인과 1:1 계약",
    description:
      "캠페인에서는 원하는 모집글에 지원하고, 1:1 계약에서는 브랜드가 직접 보낸 계약을 확인합니다.",
  },
  {
    id: "views",
    target: "influencer-campaign-views",
    title: "모집과 신청 내역",
    description:
      "모집 캠페인에서 새 기회를 찾고, 신청한 캠페인에서 선정 여부와 이후 진행 상태를 확인합니다.",
  },
  {
    id: "filters",
    target: "influencer-campaign-filters",
    title: "내 채널에 맞는 캠페인 찾기",
    description:
      "모집 탭은 플랫폼·카테고리·모집 유형으로, 신청 내역은 검색·신청 상태로 좁힐 수 있습니다. 첫 지원 전에는 가입과 플랫폼 계정 인증이 필요합니다.",
  },
] satisfies readonly ProductSpotlightTourStep[];

const formatCampaignDateExample = (daysFromToday: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
};

function parseCampaignDate(value?: string) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCampaignDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCampaignCalendarMonth(value?: string) {
  const date = parseCampaignDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addCampaignCalendarMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatCampaignCalendarMonthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatCampaignDateButtonLabel(value: string) {
  const date = parseCampaignDate(value);
  if (!date) return value;
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}. ${String(date.getDate()).padStart(2, "0")}.`;
}

function getCampaignCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Array<Date | null> = Array.from(
    { length: firstDay.getDay() },
    () => null,
  );
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

const platformOptions: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const OTHER_CAMPAIGN_TYPE_OPTION_LABEL = "기타(직접작성)";

function createCampaignRequiredConsentId() {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `consent-${randomId}`;
}

const proposalTypeOptions = campaignProposalTypeOptions;

const proposalTypeFilterOptions: ProposalTypeFilter[] = ["all", ...proposalTypeOptions];
const applicationStatusFilterOptions: ApplicationStatusFilter[] = [
  "all",
  "submitted",
  "reviewed",
  "accepted",
  "converted_to_contract",
  "not_selected",
];
const openCampaignSortOptions: Array<{ label: string; value: CampaignSort }> = [
  { label: "마감 임박순", value: { key: "deadline", direction: "asc" } },
  { label: "마감 여유순", value: { key: "deadline", direction: "desc" } },
  { label: "브랜드순", value: { key: "brand", direction: "asc" } },
  { label: "지급 높은순", value: { key: "payment", direction: "desc" } },
  { label: "플랫폼순", value: { key: "platform", direction: "asc" } },
];
const appliedCampaignSortOptions: Array<{ label: string; value: CampaignSort }> = [
  { label: "최근 신청순", value: { key: "appliedAt", direction: "desc" } },
  { label: "오래된 신청순", value: { key: "appliedAt", direction: "asc" } },
  { label: "상태순", value: { key: "status", direction: "asc" } },
  { label: "브랜드순", value: { key: "brand", direction: "asc" } },
  { label: "캠페인순", value: { key: "title", direction: "asc" } },
];
type MarketplaceCampaignsResponse = {
  campaigns: MarketplaceCampaignPost[];
};

type MarketplaceCampaignResponse = {
  campaign: MarketplaceCampaignPost;
};

type AdvertiserCampaignsResponse = {
  brand: MarketplaceBrandProfile | null;
  brands?: MarketplaceBrandProfile[];
  campaigns: MarketplaceBrandCampaign[];
  campaign_access?: AdvertiserCampaignAccess;
};

type BrandImageUploadResponse = {
  image_url?: string;
  brand?: MarketplaceBrandProfile;
  error?: string;
};

type CampaignImageUploadResponse = {
  image_url?: string;
  error?: string;
};

type CampaignApplicationResponse = {
  proposal?: {
    id: string;
    status: string;
    campaign_id?: string;
    target_handle?: string;
  };
  already_submitted?: boolean;
};

type CampaignApplicationSubmission = {
  acceptedConsentIds: string[];
  applicationContact: {
    phone?: string;
    email?: string;
  };
  applicationContactConsentAccepted: boolean;
};

type CampaignApplicationsState =
  | { status: "loading" }
  | { status: "ready"; applications: MarketplaceMessageThread[] }
  | { status: "error"; message: string };
type InfluencerSessionStatusResponse = {
  authenticated?: boolean;
  user?: {
    id?: string;
  };
};


const applicationStatusMeta: Record<
  MarketplaceCampaignApplicationCustomerStatus,
  { label: string; className: string }
> = {
  submitted: {
    label: "신청 완료",
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

type CampaignShellMetric = {
  label: string;
  value: string;
};

function getCampaignSharePath(campaign: { id?: string }) {
  return campaign.id ? `/campaigns/${encodeURIComponent(campaign.id)}` : undefined;
}

export function AdvertiserCampaignRecruitmentPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<AdvertiserCampaignState>({
    status: "loading",
  });
  const [selectedBrandId, setSelectedBrandId] = useState(() =>
    readSelectedAdvertiserBrandId(),
  );
  const [form, setForm] = useState({
    title: "",
    type: "sponsored_post" as CampaignProposalType,
    otherTypeLabel: "",
    applicantLimit: "",
    location: "",
    budget: "",
    summary: "",
    deadline: "",
    uploadDeadline: "",
    platforms: ["instagram"] as InfluencerPlatform[],
    targetCountries: [] as MarketplaceCountryCode[],
    deliverables: "",
    thumbnailUrl: "",
    applicationContactFields: [] as CampaignApplicationContactField[],
    requiredConsents: [] as NonNullable<MarketplaceBrandCampaign["requiredConsents"]>,
  });
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | undefined>();
  const [brandImagePreview, setBrandImagePreview] = useState<string | undefined>();
  const [brandImageError, setBrandImageError] = useState<string | undefined>();
  const [isBrandImageUploading, setIsBrandImageUploading] = useState(false);
  const [campaignImagePreview, setCampaignImagePreview] = useState<string | undefined>();
  const [campaignImageError, setCampaignImageError] = useState<string | undefined>();
  const [isCampaignImageUploading, setIsCampaignImageUploading] = useState(false);
  const [openFormList, setOpenFormList] = useState<string | null>(null);
  const [campaignPublicationIntentId] = useState(() =>
    resolveCampaignPublicationIntentId(),
  );
  const campaignPublicationAttemptRef =
    useRef<CampaignPublicationAttempt | undefined>(undefined);

  const loadCampaigns = useCallback(async () => {
    setState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    try {
      const query = selectedBrandId
        ? `?brandId=${encodeURIComponent(selectedBrandId)}`
        : "";
      const response = await apiFetch(`/api/advertiser/campaigns${query}`, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (response.status === 401 || response.status === 403) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | AdvertiserCampaignsResponse
        | { error?: string };

      if (!response.ok || !("campaigns" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인을 불러오지 못했습니다."
            : "캠페인을 불러오지 못했습니다.",
        );
      }

      setState({
        status: "ready",
        brand: data.brand,
        brands: data.brands ?? (data.brand ? [data.brand] : []),
        campaigns: data.campaigns,
        campaignAccess: isAdvertiserCampaignAccess(data.campaign_access)
          ? data.campaign_access
          : undefined,
      });
      if (data.brand?.id) {
        setSelectedBrandId(data.brand.id);
        writeSelectedAdvertiserBrandId(data.brand.id);
      }
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "캠페인을 불러오지 못했습니다.",
      });
    }
  }, [navigate, selectedBrandId]);

  const refreshCampaignWorkspace = useCallback(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshCampaignWorkspace();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshCampaignWorkspace]);

  const requiresOtherTypeLabel = form.type === "other";
  const hasValidRequiredConsents = form.requiredConsents.every(
    (consent) => consent.text.trim().length > 0 && consent.text.trim().length <= 300,
  );
  const requiredCampaignFieldCount =
    (requiresOtherTypeLabel ? 11 : 10) + (form.requiredConsents.length > 0 ? 1 : 0);
  const hasRequiredCampaignFields =
    form.title.trim().length > 0 &&
    form.platforms.length > 0 &&
    (!requiresOtherTypeLabel || form.otherTypeLabel.trim().length > 0) &&
    form.applicantLimit.trim().length > 0 &&
    form.location.trim().length > 0 &&
    form.budget.trim().length > 0 &&
    form.deliverables.trim().length > 0 &&
    form.summary.trim().length > 0 &&
    form.uploadDeadline.trim().length > 0 &&
    form.deadline.trim().length > 0 &&
    hasValidRequiredConsents;
  const recruitmentDeadline = parseCampaignDate(form.deadline);
  const uploadDeadline = parseCampaignDate(form.uploadDeadline);
  const dateOrderError =
    recruitmentDeadline && uploadDeadline && uploadDeadline < recruitmentDeadline
      ? "제출마감일은 모집마감일과 같거나 이후여야 합니다."
      : undefined;
  const campaignAccess =
    state.status === "ready" ? state.campaignAccess : undefined;
  const verificationBlocksPublication =
    campaignAccess?.verification_required === true;
  const canSubmit = hasRequiredCampaignFields && !dateOrderError;
  const canPublishCampaign = canSubmit && !verificationBlocksPublication;
  const missingFormLabels = [
    form.title.trim().length > 0 ? undefined : "캠페인명",
    form.platforms.length > 0 ? undefined : "플랫폼",
    form.type.trim().length > 0 ? undefined : "광고형태",
    !requiresOtherTypeLabel || form.otherTypeLabel.trim().length > 0
      ? undefined
      : "광고형태 직접작성",
    form.applicantLimit.trim().length > 0 ? undefined : "모집인원",
    form.location.trim().length > 0 ? undefined : "지역",
    form.budget.trim().length > 0 ? undefined : "지급내용",
    form.deliverables.trim().length > 0 ? undefined : "콘텐츠 조건",
    form.summary.trim().length > 0 ? undefined : "가이드라인",
    form.uploadDeadline.trim().length > 0 ? undefined : "제출마감",
    form.deadline.trim().length > 0 ? undefined : "모집마감",
    hasValidRequiredConsents ? undefined : "동의 항목 내용",
  ].filter(Boolean) as string[];
  const submitHelperText = dateOrderError
    ? dateOrderError
    : verificationBlocksPublication
      ? "인플루언서가 인증된 사업주체임을 확인할 수 있도록 3회차부터 사업자 인증에 협조해 주세요."
      : canSubmit
        ? "필수 조건이 준비되었습니다. 공개하면 인플루언서 캠페인 화면에 바로 노출됩니다."
        : `남은 필수 항목: ${missingFormLabels.slice(0, 4).join(", ")}${
            missingFormLabels.length > 4 ? ` 외 ${missingFormLabels.length - 4}개` : ""
          }`;

  const togglePlatform = (platform: InfluencerPlatform) => {
    setForm((current) => {
      const exists = current.platforms.includes(platform);
      return {
        ...current,
        platforms: exists
          ? current.platforms.filter((item) => item !== platform)
          : [...current.platforms, platform],
      };
    });
  };

  const toggleTargetCountry = (country: MarketplaceCountryCode) => {
    setForm((current) => {
      const exists = current.targetCountries.includes(country);
      return {
        ...current,
        targetCountries: exists
          ? current.targetCountries.filter((item) => item !== country)
          : [...current.targetCountries, country],
      };
    });
  };

  const toggleApplicationContactField = (
    field: CampaignApplicationContactField,
  ) => {
    setForm((current) => {
      const selected = current.applicationContactFields.includes(field);
      return {
        ...current,
        applicationContactFields: selected
          ? current.applicationContactFields.filter((item) => item !== field)
          : [...current.applicationContactFields, field],
      };
    });
  };

  const handleBrandImageSelect = async (file: File | undefined) => {
    if (!file || isBrandImageUploading) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setBrandImageError("PNG, JPG, WebP 이미지만 올릴 수 있습니다.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setBrandImageError("이미지는 3MB 이하로 올려주세요.");
      return;
    }

    setIsBrandImageUploading(true);
    setBrandImageError(undefined);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBrandImagePreview(dataUrl);
      const response = await apiFetch("/api/advertiser/brand-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          brandId: selectedBrandId,
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            data_url: dataUrl,
          },
        }),
      });

      if (response.status === 401 || response.status === 403) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as BrandImageUploadResponse;
      if (!response.ok || !data.brand) {
        throw new Error(data.error ?? "브랜드 이미지를 저장하지 못했습니다.");
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              brand: data.brand ?? current.brand,
              brands: data.brand
                ? current.brands.map((brand) =>
                    brand.id === data.brand?.id ? data.brand : brand,
                  )
                : current.brands,
            }
          : current,
      );
      if (data.brand?.id) {
        setSelectedBrandId(data.brand.id);
        writeSelectedAdvertiserBrandId(data.brand.id);
      }
      setBrandImagePreview(undefined);
    } catch (error) {
      setBrandImageError(
        error instanceof Error ? error.message : "브랜드 이미지를 저장하지 못했습니다.",
      );
      setBrandImagePreview(undefined);
    } finally {
      setIsBrandImageUploading(false);
    }
  };

  const handleCampaignImageSelect = async (file: File | undefined) => {
    if (!file || isCampaignImageUploading) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setCampaignImageError("PNG, JPG, WebP 이미지만 올릴 수 있습니다.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setCampaignImageError("이미지는 3MB 이하로 올려주세요.");
      return;
    }

    setIsCampaignImageUploading(true);
    setCampaignImageError(undefined);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCampaignImagePreview(dataUrl);
      const response = await apiFetch("/api/advertiser/campaign-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            data_url: dataUrl,
          },
        }),
      });

      if (response.status === 401 || response.status === 403) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        CampaignImageUploadResponse;
      if (!response.ok || !data.image_url) {
        throw new Error(data.error ?? "대표 이미지를 저장하지 못했습니다.");
      }

      setForm((current) => ({ ...current, thumbnailUrl: data.image_url ?? "" }));
      setCampaignImagePreview(undefined);
    } catch (error) {
      setCampaignImageError(
        error instanceof Error ? error.message : "대표 이미지를 저장하지 못했습니다.",
      );
      setCampaignImagePreview(undefined);
    } finally {
      setIsCampaignImageUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canPublishCampaign || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(undefined);
    setSavedMessage(undefined);

    try {
      const publicationPayload = {
        title: form.title.trim(),
        type: form.type,
        otherTypeLabel:
          form.type === "other" ? form.otherTypeLabel.trim() : undefined,
        applicantLimit: form.applicantLimit.trim(),
        location: form.location.trim(),
        budget: form.budget.trim(),
        summary: form.summary.trim(),
        deadline: form.deadline.trim(),
        uploadDeadline: form.uploadDeadline.trim(),
        platforms: [...form.platforms].sort(),
        targetCountries: [...form.targetCountries].sort(),
        deliverables: form.deliverables
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 6),
        thumbnailUrl: form.thumbnailUrl.trim(),
        applicationContactFields: [...form.applicationContactFields].sort(),
        requiredConsents: form.requiredConsents.map((consent) => ({
          id: consent.id,
          text: consent.text.trim(),
        })),
        brandId: selectedBrandId,
      };
      const serializedPayload = JSON.stringify(publicationPayload);
      const fingerprint = await fingerprintCampaignPublicationPayload(
        serializedPayload,
      );
      const publicationAttempt = resolveCampaignPublicationAttempt({
        intentId: campaignPublicationIntentId,
        fingerprint,
        currentAttempt: campaignPublicationAttemptRef.current,
      });
      campaignPublicationAttemptRef.current = publicationAttempt;

      const response = await apiFetch("/api/advertiser/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": publicationAttempt.idempotencyKey,
        },
        credentials: "include",
        body: serializedPayload,
      });

      const data = (await response.json().catch(() => ({}))) as
        | AdvertiserCampaignsResponse
        | VerificationRequiredApiError;

      if (response.status === 401) {
        navigate("/login/advertiser", { replace: true });
        return;
      }
      if (
        response.status === 403 &&
        isVerificationRequiredError(
          data,
          "advertiser_business_verification_required",
        )
      ) {
        setState((current) =>
          current.status === "ready" &&
          isAdvertiserCampaignAccess(data.campaign_access)
            ? { ...current, campaignAccess: data.campaign_access }
            : current,
        );
        setSubmitError(
          data.error ??
            "3회차 캠페인부터는 사업자 인증을 완료한 뒤 공개할 수 있습니다.",
        );
        return;
      }
      if (response.status === 403) {
        navigate("/login/advertiser", { replace: true });
        return;
      }

      if (!response.ok || !("campaigns" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인을 저장하지 못했습니다."
            : "캠페인을 저장하지 못했습니다.",
        );
      }

      clearCampaignPublicationAttempt(publicationAttempt);
      campaignPublicationAttemptRef.current = undefined;

      setState({
        status: "ready",
        brand: data.brand,
        brands: data.brands ?? (data.brand ? [data.brand] : []),
        campaigns: data.campaigns,
        campaignAccess: isAdvertiserCampaignAccess(data.campaign_access)
          ? data.campaign_access
          : undefined,
      });
      if (data.brand?.id) {
        setSelectedBrandId(data.brand.id);
        writeSelectedAdvertiserBrandId(data.brand.id);
      }
      setSavedMessage("캠페인이 공개 목록에 반영되었습니다.");
      setForm((current) => ({
        ...current,
        title: "",
        otherTypeLabel: "",
        applicantLimit: "",
        location: "",
        budget: "",
        summary: "",
        deadline: "",
        uploadDeadline: "",
        deliverables: "",
        targetCountries: [],
        thumbnailUrl: "",
        applicationContactFields: [],
        requiredConsents: [],
      }));
      navigate("/advertiser/campaigns");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "캠페인을 저장하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const brand = state.status === "ready" ? state.brand : null;
  const draftCampaignPost = useMemo<MarketplaceCampaignPost>(() => {
    const platforms = form.platforms.length > 0 ? form.platforms : ["instagram"];
    const logoUrl = brandImagePreview ?? brand?.logoUrl;
    const uploadedThumbnailUrl = campaignImagePreview ?? form.thumbnailUrl.trim();
    const thumbnailUrl = uploadedThumbnailUrl || logoUrl;

    return {
      id: "draft-campaign-preview",
      title: form.title.trim() || "캠페인 제목",
      type: form.type,
      otherTypeLabel:
        form.type === "other" ? form.otherTypeLabel.trim() || undefined : undefined,
      applicantLimit: form.applicantLimit.trim() || "모집 인원",
      location: form.location.trim() || "지역",
      budget: form.budget.trim() || "지급 조건",
      targetCountries: form.targetCountries,
      summary: form.summary.trim() || "가이드라인을 입력하면 이 영역에 표시됩니다.",
      deadline: form.deadline.trim() || undefined,
      uploadDeadline: form.uploadDeadline.trim() || undefined,
      platforms,
      deliverables: parseCampaignDeliverables(form.deliverables),
      applicationContactFields: form.applicationContactFields,
      requiredConsents: form.requiredConsents
        .map((consent) => ({ id: consent.id, text: consent.text.trim() }))
        .filter((consent) => consent.text.length > 0),
      status: "open",
      brandId: brand?.id ?? "draft-brand",
      brandHandle: brand?.handle ?? "draft-brand",
      brandName: brand?.displayName ?? "브랜드명",
      brandCategory: brand?.category ?? "카테고리",
      brandHeadline: brand?.headline ?? "",
      brandLocation: brand?.location ?? "지역",
      brandLogoLabel: brand?.logoLabel ?? "BR",
      brandLogoUrl: logoUrl,
      brandHref: brand ? `/brands/${brand.handle}` : "/brands",
      typeLabel:
        form.type === "other" && !form.otherTypeLabel.trim()
          ? OTHER_CAMPAIGN_TYPE_OPTION_LABEL
          : getCampaignProposalTypeDisplayLabel(form),
      platformLabels: platforms.map((platform) => platformLabels[platform]),
      deadlineLabel: getCampaignDeadlineLabel(form.deadline.trim() || undefined),
      thumbnailUrl,
    };
  }, [brand, brandImagePreview, campaignImagePreview, form]);
  const isProductExperienceCampaign =
    form.type === "supporters" || form.type === "experience_group";
  const budgetPlaceholder = isProductExperienceCampaign
    ? "예: 제품 제공(소비자가 89,000원 상당)"
    : "예: 150만-300만원";
  const deliverablesPlaceholder = isProductExperienceCampaign
    ? "예: 네이버 블로그 후기 1건, 인스타 피드 1건"
    : "예: 릴스 1건, 스토리 2건";
  const summaryPlaceholder = isProductExperienceCampaign
    ? "콘텐츠 작성 기준, 게시 기한, 공개 유지 기간, 필수 문구를 적어 주세요."
    : "인플루언서가 바로 판단할 수 있도록 타깃, 콘텐츠 톤, 필수 문구, 검수 기준을 적어 주세요.";

  return (
    <CampaignShell
      mode="authenticated"
      role="advertiser"
      eyebrow="광고주 캠페인"
      title="캠페인 작성"
      description="모집 조건을 공개하고 지원자를 한곳에서 확인합니다."
      backHref="/advertiser/campaigns"
      showHeroCopy={false}
      metrics={[
        {
          label: "작성",
          value: canSubmit
            ? "완료"
            : `${Math.max(0, requiredCampaignFieldCount - missingFormLabels.length)}/${requiredCampaignFieldCount}`,
        },
        { label: "공개", value: "모집 노출" },
        { label: "지원자", value: "선정" },
      ]}
      actions={
        <>
          <Link
            to="/advertiser/builder"
            className="yl-header-action yl-header-action-secondary"
          >
            <FileSignature className="h-4 w-4" />
            <span className="hidden sm:inline">1:1 계약 작성</span>
          </Link>
          <Link
            to="/advertiser/discover"
            className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">인플루언서 찾기</span>
          </Link>
        </>
      }
    >
      <section className="grid min-w-0 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <form
          onSubmit={handleSubmit}
          className="yl-card min-w-0 border p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto"
        >
          <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-neutral-400">
                캠페인 조건 입력
              </p>
              <h2 className="mt-1 text-[20px] font-extrabold text-neutral-950">
                캠페인 작성 폼
              </h2>
              <p className="mt-1 max-w-[520px] break-keep text-[12px] font-bold leading-5 text-neutral-500">
                인플루언서가 지원 전에 보는 금액, 콘텐츠, 일정만 빠짐없이 정리합니다.
              </p>
            </div>
            <div className="self-end sm:self-start">
              <BrandImageUpload
                brand={brand}
                previewUrl={brandImagePreview}
                disabled={isBrandImageUploading}
                onSelect={handleBrandImageSelect}
              />
            </div>
          </div>
          {brandImageError ? (
            <p className="mt-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-extrabold text-rose-700">
              {brandImageError}
            </p>
          ) : null}
          <div className="mt-4 grid min-w-0 gap-4">
            <CampaignImageUpload
              imageUrl={campaignImagePreview ?? form.thumbnailUrl}
              disabled={isCampaignImageUploading}
              onSelect={handleCampaignImageSelect}
            />
            {campaignImageError ? (
              <p className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-extrabold text-rose-700">
                {campaignImageError}
              </p>
            ) : null}

            <CampaignField label="캠페인명">
              <input
                required
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="예: 여름 러닝 챌린지 릴스 모집"
                className="campaign-input"
              />
            </CampaignField>

            <CampaignField label="플랫폼">
              <CampaignFormSelectList
                id="campaign-form-platforms"
                openId={openFormList}
                onOpenChange={setOpenFormList}
                summary={
                  form.platforms.length > 0
                    ? form.platforms.map((platform) => platformLabels[platform]).join(", ")
                    : "선택"
                }
                options={platformOptions
                  .filter((platform): platform is InfluencerPlatform => platform !== "all")
                  .map((platform) => ({
                    value: platform,
                    label: platformLabels[platform],
                  }))}
                selectedValues={form.platforms}
                onSelect={togglePlatform}
              />
            </CampaignField>

            <CampaignField label="광고형태">
              <CampaignFormSelectList
                id="campaign-form-type"
                openId={openFormList}
                onOpenChange={setOpenFormList}
                summary={
                  form.type === "other" && form.otherTypeLabel.trim()
                    ? form.otherTypeLabel.trim()
                    : form.type === "other"
                      ? OTHER_CAMPAIGN_TYPE_OPTION_LABEL
                      : proposalTypeLabels[form.type]
                }
                options={proposalTypeOptions.map((type) => ({
                  value: type,
                  label:
                    type === "other"
                      ? OTHER_CAMPAIGN_TYPE_OPTION_LABEL
                      : proposalTypeLabels[type],
                }))}
                selectedValues={[form.type]}
                closeOnSelect
                onSelect={(type) =>
                  setForm((current) => ({
                    ...current,
                    type,
                    otherTypeLabel: type === "other" ? current.otherTypeLabel : "",
                  }))
                }
              />
            </CampaignField>

            {form.type === "other" ? (
              <CampaignField label="광고형태 직접작성">
                <input
                  required
                  maxLength={60}
                  value={form.otherTypeLabel}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      otherTypeLabel: event.target.value,
                    }))
                  }
                  placeholder="예: 브랜드 앰배서더"
                  className="campaign-input"
                />
              </CampaignField>
            ) : null}

            <CampaignField label="국가">
              <CampaignFormSelectList
                id="campaign-form-countries"
                openId={openFormList}
                onOpenChange={setOpenFormList}
                summary={
                  form.targetCountries.length > 0
                    ? formatMarketplaceCountries(form.targetCountries)
                    : "전체"
                }
                options={marketplaceCountryOptions.map((country) => ({
                  value: country,
                  label: getMarketplaceCountryLabel(country),
                }))}
                selectedValues={form.targetCountries}
                searchPlaceholder="국가 검색"
                onClear={() =>
                  setForm((current) => ({ ...current, targetCountries: [] }))
                }
                onSelect={toggleTargetCountry}
              />
            </CampaignField>

            <CampaignField label="모집마감">
              <CampaignDatePicker
                id="campaign-form-recruit-deadline"
                label="모집마감"
                openId={openFormList}
                onOpenChange={setOpenFormList}
                value={form.deadline}
                min={formatCampaignDateExample(1)}
                onChange={(value) =>
                  setForm((current) => ({ ...current, deadline: value }))
                }
              />
            </CampaignField>

            <CampaignField label="제출마감">
              <CampaignDatePicker
                id="campaign-form-upload-deadline"
                label="제출마감"
                openId={openFormList}
                onOpenChange={setOpenFormList}
                value={form.uploadDeadline}
                min={formatCampaignDateExample(1)}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    uploadDeadline: value,
                  }))
                }
              />
            </CampaignField>

            <CampaignField label="지급내용">
              <input
                required
                value={form.budget}
                onChange={(event) =>
                  setForm((current) => ({ ...current, budget: event.target.value }))
                }
                placeholder={budgetPlaceholder}
                className="campaign-input"
              />
            </CampaignField>

            <CampaignField label="모집인원">
              <div className="relative">
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={form.applicantLimit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      applicantLimit: event.target.value
                        .replace(/\D/g, "")
                        .replace(/^0+/, "")
                        .slice(0, 4),
                    }))
                  }
                  placeholder="예: 5"
                  aria-label="모집인원"
                  className="campaign-input pr-11"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] font-extrabold text-neutral-500">
                  명
                </span>
              </div>
            </CampaignField>

            <CampaignField label="지역">
              <input
                required
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
                placeholder="예: 서울 성수"
                className="campaign-input"
              />
            </CampaignField>

            <CampaignField label="가이드라인">
              <textarea
                required
                rows={8}
                value={form.summary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, summary: event.target.value }))
                }
                placeholder={summaryPlaceholder}
                className="campaign-input min-h-[190px] resize-y overflow-y-auto"
              />
            </CampaignField>

            <CampaignField label="콘텐츠 조건">
              <input
                required
                value={form.deliverables}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deliverables: event.target.value,
                  }))
                }
                placeholder={deliverablesPlaceholder}
                className="campaign-input"
              />
            </CampaignField>

            <CampaignApplicationContactFieldSelector
              selectedFields={form.applicationContactFields}
              onToggle={toggleApplicationContactField}
            />

            <CampaignRequiredConsentEditor
              consents={form.requiredConsents}
              onChange={(requiredConsents) =>
                setForm((current) => ({ ...current, requiredConsents }))
              }
            />

            {submitError ? (
              <p className="rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-extrabold text-rose-700">
                {submitError}
              </p>
            ) : null}
            {savedMessage ? (
              <p className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-extrabold text-emerald-700">
                {savedMessage}
              </p>
            ) : null}

            <div className="yl-panel mt-4 min-w-0 border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className={`break-keep text-[12px] font-extrabold leading-5 ${
                    verificationBlocksPublication
                      ? "text-amber-700"
                      : canSubmit
                        ? "text-emerald-700"
                        : "text-neutral-500"
                  }`}
                >
                  {submitHelperText}
                </p>
                {verificationBlocksPublication ? (
                  <Link
                    to={campaignAccess?.next_path ?? "/advertiser/verification"}
                    className="yl-primary-action inline-flex h-12 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-[8px] px-5 text-[14px] font-extrabold transition sm:w-auto sm:min-w-[148px]"
                  >
                    사업자 인증하기
                  </Link>
                ) : (
                  <button
                    type="submit"
                    disabled={!canPublishCampaign || isSubmitting}
                    className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-blue-600 px-5 text-[14px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none sm:w-auto sm:min-w-[148px]"
                  >
                    <Plus className="h-4 w-4" />
                    {isSubmitting ? "공개 중" : "캠페인 공개"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>

        <section className="yl-panel min-w-0 border p-4 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-neutral-400">
                캠페인 미리보기
              </p>
              <h2 className="mt-1 truncate text-[20px] font-extrabold text-neutral-950">
                {brand?.displayName ?? "브랜드 프로필 준비 중"}
              </h2>
              <p className="mt-1 text-[13px] font-bold text-neutral-500">
                저장 전 공개 카드를 확인합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={loadCampaigns}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <AdvertiserCampaignPreview
            campaign={draftCampaignPost}
            canPublish={canPublishCampaign}
            helperText={submitHelperText}
          />
        </section>
      </section>
    </CampaignShell>
  );
}

export function InfluencerCampaignDiscoveryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<CampaignState>({ status: "loading" });
  const [shellMode, setShellMode] =
    useState<CampaignShellMode>("checking");
  const [applicationsState, setApplicationsState] =
    useState<CampaignApplicationsState>({ status: "loading" });
  const [tourAccountId, setTourAccountId] = useState<string | undefined>();
  const applicationsRetryAttemptRef = useRef(0);
  const applicationsRetryTimerRef = useRef<number | undefined>(undefined);
  const loadApplicationsRef = useRef<() => Promise<void>>(async () => undefined);
  const activeView: InfluencerCampaignView =
    searchParams.get("view") === "applied" ? "applied" : "open";
  const focusedCampaignId = searchParams.get("campaign") ?? undefined;
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [proposalTypeFilter, setProposalTypeFilter] =
    useState<ProposalTypeFilter>("all");
  const [openCampaignSort, setOpenCampaignSort] = useState<CampaignSort>({
    key: "deadline",
    direction: "asc",
  });
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedStatusFilter, setAppliedStatusFilter] =
    useState<ApplicationStatusFilter>("all");
  const [appliedCampaignSort, setAppliedCampaignSort] = useState<CampaignSort>({
    key: "appliedAt",
    direction: "desc",
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openFilterList, setOpenFilterList] = useState<string | null>(null);
  const [applyingCampaignId, setApplyingCampaignId] = useState<string | undefined>();
  const [applicationNotice, setApplicationNotice] = useState<
    | {
        campaignId: string;
        tone: "success" | "error";
        message: string;
        actionHref?: string;
      }
    | undefined
  >();
  const [selectedCampaign, setSelectedCampaign] =
    useState<MarketplaceCampaignPost | null>(null);
  const [applicationConsentCampaign, setApplicationConsentCampaign] =
    useState<MarketplaceCampaignPost | null>(null);
  const handleActiveViewChange = (nextView: InfluencerCampaignView) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextView === "applied") {
      nextSearchParams.set("view", "applied");
    } else {
      nextSearchParams.delete("view");
      nextSearchParams.delete("campaign");
    }
    setFiltersOpen(false);
    setOpenFilterList(null);
    setSearchParams(nextSearchParams, { replace: true });
  };

  useEffect(() => {
    let active = true;

    void apiFetch("/api/marketplace/campaigns", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("캠페인 목록을 불러오지 못했습니다.");
        return (await response.json()) as MarketplaceCampaignsResponse;
      })
      .then((data) => {
        if (!active) return;
        setState({
          status: "ready",
          campaigns: dedupeCampaignsByBrandIdentity(data.campaigns),
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "캠페인 목록을 불러오지 못했습니다.",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const scheduleApplicationsRetry = useCallback(() => {
    if (applicationsRetryTimerRef.current !== undefined) return;
    const retryDelayMs = Math.min(
      1_000 * 2 ** applicationsRetryAttemptRef.current,
      10_000,
    );
    applicationsRetryAttemptRef.current += 1;
    applicationsRetryTimerRef.current = window.setTimeout(() => {
      applicationsRetryTimerRef.current = undefined;
      void loadApplicationsRef.current();
    }, retryDelayMs);
  }, []);

  const loadApplications = useCallback(async () => {
    if (applicationsRetryTimerRef.current !== undefined) {
      window.clearTimeout(applicationsRetryTimerRef.current);
      applicationsRetryTimerRef.current = undefined;
    }
    setApplicationsState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    let sessionEstablished = false;
    try {
      const sessionResponse = await apiFetch("/api/influencer/session", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      const sessionData = (await sessionResponse.json().catch(() => ({}))) as
        InfluencerSessionStatusResponse;
      if (sessionResponse.ok && sessionData.authenticated === true) {
        applicationsRetryAttemptRef.current = 0;
        sessionEstablished = true;
        setShellMode("authenticated");
        setTourAccountId(sessionData.user?.id);
      } else if (
        sessionResponse.status === 401 ||
        sessionResponse.status === 403 ||
        (sessionResponse.ok && sessionData.authenticated === false)
      ) {
        applicationsRetryAttemptRef.current = 0;
        setShellMode("anonymous");
        setTourAccountId(undefined);
        setApplicationsState({ status: "ready", applications: [] });
        return;
      } else {
        setApplicationsState((current) =>
          current.status === "ready" ? current : { status: "loading" },
        );
        scheduleApplicationsRetry();
        return;
      }

      const response = await apiFetch(
        "/api/marketplace/campaign-applications?role=influencer",
        {
          headers: { Accept: "application/json" },
          credentials: "include",
        },
      );

      if (response.status === 401 || response.status === 403) {
        setShellMode("anonymous");
        setTourAccountId(undefined);
        setApplicationsState({ status: "ready", applications: [] });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | MarketplaceMessagesResponse
        | { error?: string };

      if (!response.ok || !("threads" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(errorMessage ?? "신청한 캠페인을 불러오지 못했습니다.");
      }

      setApplicationsState({
        status: "ready",
        applications: data.threads.filter(isInfluencerCampaignApplication),
      });
    } catch (error) {
      if (!sessionEstablished) {
        setApplicationsState((current) =>
          current.status === "ready" ? current : { status: "loading" },
        );
        scheduleApplicationsRetry();
        return;
      }
      setApplicationsState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "신청한 캠페인을 불러오지 못했습니다.",
      });
    }
  }, [scheduleApplicationsRetry]);

  useEffect(() => {
    loadApplicationsRef.current = loadApplications;
  }, [loadApplications]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadApplications();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (applicationsRetryTimerRef.current !== undefined) {
        window.clearTimeout(applicationsRetryTimerRef.current);
        applicationsRetryTimerRef.current = undefined;
      }
    };
  }, [loadApplications]);

  const campaigns = useMemo(
    () => (state.status === "ready" ? state.campaigns : []),
    [state],
  );
  const visibleCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const sortedCampaigns = campaigns
      .filter((campaign) => {
        if (
          platformFilter !== "all" &&
          !(campaign.platforms ?? []).includes(platformFilter)
        ) {
          return false;
        }
        if (proposalTypeFilter !== "all" && campaign.type !== proposalTypeFilter) {
          return false;
        }
        if (
          categoryFilters.length > 0 &&
          !categoryFilters.includes(campaign.brandCategory)
        ) {
          return false;
        }
        if (!normalizedQuery) return true;

        return [
          campaign.brandName,
          campaign.brandCategory,
          campaign.title,
          campaign.summary ?? "",
          campaign.location ?? "",
          formatMarketplaceCountries(campaign.targetCountries),
          campaign.offer ?? "",
          campaign.mission ?? "",
          campaign.budget,
          campaign.typeLabel,
          ...campaign.platformLabels,
          ...(campaign.deliverables ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => compareMarketplaceCampaignPostsBySort(a, b, openCampaignSort));

    return distributeCampaignsByBrand(sortedCampaigns);
  }, [
    campaigns,
    categoryFilters,
    openCampaignSort,
    platformFilter,
    proposalTypeFilter,
    query,
  ]);
  const applications = useMemo(
    () =>
      applicationsState.status === "ready"
        ? applicationsState.applications
        : [],
    [applicationsState],
  );
  const visibleApplications = useMemo(() => {
    const normalizedQuery = appliedQuery.trim().toLowerCase();

    return applications
      .filter((application) => {
        if (
          appliedStatusFilter !== "all" &&
          getMarketplaceCampaignApplicationCustomerStatus(application) !==
            appliedStatusFilter
        ) {
          return false;
        }
        if (!normalizedQuery) return true;

        return [
          application.targetName,
          application.counterpartName,
          application.campaignTitle ?? "",
          formatAppliedCampaignTitle(application),
          application.proposalTypeLabel,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) =>
        compareAppliedCampaignApplicationsBySort(a, b, appliedCampaignSort),
      );
  }, [applications, appliedCampaignSort, appliedQuery, appliedStatusFilter]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(campaigns.map((campaign) => campaign.brandCategory))).sort(),
    [campaigns],
  );
  const activeFilterLabels = [
    query.trim() ? `검색 ${query.trim()}` : null,
    platformFilter !== "all" ? platformLabels[platformFilter] : null,
    categoryFilters.length > 0 ? formatCampaignCategoryFilterSummary(categoryFilters) : null,
    proposalTypeFilter !== "all" ? proposalTypeLabels[proposalTypeFilter] : null,
  ].filter((label): label is string => Boolean(label));
  const appliedActiveFilterLabels = [
    appliedQuery.trim() ? `검색 ${appliedQuery.trim()}` : null,
    appliedStatusFilter !== "all"
      ? applicationStatusMeta[appliedStatusFilter].label
      : null,
  ].filter((label): label is string => Boolean(label));
  const filterSummary =
    activeFilterLabels.length > 0 ? activeFilterLabels.join(" · ") : "전체 조건";
  const appliedFilterSummary =
    appliedActiveFilterLabels.length > 0
      ? appliedActiveFilterLabels.join(" · ")
      : "전체 조건";
  const toolbarFilterCount =
    activeView === "open"
      ? activeFilterLabels.length
      : appliedActiveFilterLabels.length;

  const applyToCampaign = (campaign: MarketplaceCampaignPost) => {
    if (applyingCampaignId) return;
    if (!canApplyToMarketplaceCampaign(campaign)) {
      setApplicationNotice({
        tone: "error",
        message:
          "이 모집글은 현재 신청을 받을 수 없습니다. 광고주가 공유한 최신 모집 링크로 다시 확인해주세요.",
      });
      return;
    }

    setSelectedCampaign(null);
    const requiredConsents = (campaign.requiredConsents ?? []).filter(
      (consent) => consent.id.trim() && consent.text.trim(),
    );
    const applicationContactFields = campaign.applicationContactFields ?? [];
    if (requiredConsents.length === 0 && applicationContactFields.length === 0) {
      void submitCampaignApplication(campaign, {
        acceptedConsentIds: [],
        applicationContact: {},
        applicationContactConsentAccepted: false,
      });
      return;
    }
    setApplicationConsentCampaign(campaign);
  };

  const submitCampaignApplication = async (
    campaign: MarketplaceCampaignPost,
    submission: CampaignApplicationSubmission,
  ) => {
    if (applyingCampaignId) return;
    const campaignCopy = getCampaignDisplayCopy(campaign);

    setApplyingCampaignId(campaign.id);
    setApplicationNotice({
      campaignId: campaign.id,
      tone: "success",
      message: `${campaignCopy.title} 신청을 전송 중입니다.`,
    });

    try {
      const response = await apiFetch(
        `/api/marketplace/campaigns/${encodeURIComponent(campaign.id)}/applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            acceptedConsentIds: submission.acceptedConsentIds,
            consentVersion: campaign.consentVersion ?? "",
            applicationContact: submission.applicationContact,
            applicationContactConsentAccepted:
              submission.applicationContactConsentAccepted,
            applicationContactConsentVersion:
              campaign.applicationContactConsentVersion ?? "",
          }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as
        | CampaignApplicationResponse
        | VerificationRequiredApiError;

      if (response.status === 401) {
        setApplicationConsentCampaign(null);
        const nextPath = getCampaignSharePath(campaign) ?? "/influencer/campaigns";
        navigate(`/login/influencer?next=${encodeURIComponent(nextPath)}`, {
          replace: true,
        });
        return;
      }
      if (
        response.status === 403 &&
        isVerificationRequiredError(data, "influencer_verification_required")
      ) {
        setApplicationConsentCampaign(null);
        setApplicationNotice({
          campaignId: campaign.id,
          tone: "error",
          message:
            data.error ??
            "첫 캠페인 지원부터 플랫폼 계정 인증이 필요합니다.",
          actionHref: data.next_path ?? "/influencer/verification",
        });
        return;
      }
      if (response.status === 403) {
        setApplicationConsentCampaign(null);
        const nextPath = getCampaignSharePath(campaign) ?? "/influencer/campaigns";
        navigate(`/login/influencer?next=${encodeURIComponent(nextPath)}`, {
          replace: true,
        });
        return;
      }

      if (!response.ok || !("proposal" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인 신청을 저장하지 못했습니다."
            : "캠페인 신청을 저장하지 못했습니다.",
        );
      }

      setApplicationNotice({
        campaignId: campaign.id,
        tone: "success",
        message: data.already_submitted
          ? "이미 신청한 캠페인입니다. 광고주가 확인하면 선정자별 진행으로 이어집니다."
          : "신청이 전달됐습니다. 광고주가 선정하면 이 캠페인의 계약서 초안이 만들어집니다. 캠페인 계약서 진행이 시작됩니다.",
      });
      setApplicationConsentCampaign(null);
      setSelectedCampaign(null);
      handleActiveViewChange("applied");
      void loadApplications();
    } catch (error) {
      setApplicationConsentCampaign(null);
      setApplicationNotice({
        campaignId: campaign.id,
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "캠페인 신청을 저장하지 못했습니다.",
      });
    } finally {
      setApplyingCampaignId(undefined);
    }
  };

  return (
    <>
      <ProductSpotlightTour
        accountId={tourAccountId}
        role="influencer"
        tourId="campaign-discovery"
        version={1}
        steps={INFLUENCER_CAMPAIGN_TOUR_STEPS}
        enabled={shellMode === "authenticated"}
      />
      <CampaignShell
      mode={shellMode}
      role="influencer"
      eyebrow="인플루언서 캠페인"
      title="캠페인 탐색"
      description="모집 조건을 비교하고 바로 신청합니다."
      backHref="/influencer/dashboard"
      metrics={[]}
      showHeroCopy={false}
    >
    <section className="yl-card flex min-h-0 min-w-0 flex-1 flex-col overflow-visible border">
      <div className="border-b border-neutral-200 bg-white">
        <div className="flex min-h-12 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="hidden min-w-0 sm:block sm:flex-1">
              <p className="truncate text-[13px] font-extrabold text-neutral-950">
                {activeView === "open" ? "모집 캠페인" : "신청한 캠페인"}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-neutral-500">
                {activeView === "open"
                  ? `${visibleCampaigns.length.toLocaleString()}건 표시 · ${filterSummary}`
                  : `${visibleApplications.length.toLocaleString()}건 표시 · ${appliedFilterSummary}`}
              </p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:w-auto">
              <div className="col-span-2 min-w-0 sm:contents">
                <CampaignViewTabs
                  value={activeView}
                  openCount={visibleCampaigns.length}
                  appliedCount={applications.length}
                  onChange={handleActiveViewChange}
                />
              </div>
              <CampaignSortSelect
                value={
                  activeView === "open" ? openCampaignSort : appliedCampaignSort
                }
                options={
                  activeView === "open"
                    ? openCampaignSortOptions
                    : appliedCampaignSortOptions
                }
                onChange={
                  activeView === "open"
                    ? setOpenCampaignSort
                    : setAppliedCampaignSort
                }
              />
              <div className="relative">
                <CampaignFilterToggleButton
                  open={filtersOpen}
                  activeCount={toolbarFilterCount}
                  controlsId={
                    activeView === "open"
                      ? "influencer-campaign-filters"
                      : "influencer-applied-campaign-filters"
                  }
                  onClick={() =>
                    setFiltersOpen((current) => {
                      if (current) setOpenFilterList(null);
                      return !current;
                    })
                  }
                />
                <ResponsiveFilterPanel
                  id={
                    activeView === "open"
                      ? "influencer-campaign-filters"
                      : "influencer-applied-campaign-filters"
                  }
                  open={filtersOpen}
                  activeCount={toolbarFilterCount}
                  onClose={() => {
                    setFiltersOpen(false);
                    setOpenFilterList(null);
                  }}
                  onClear={() => {
                    if (activeView === "open") {
                      setQuery("");
                      setPlatformFilter("all");
                      setCategoryFilters([]);
                      setProposalTypeFilter("all");
                    } else {
                      setAppliedQuery("");
                      setAppliedStatusFilter("all");
                    }
                    setOpenFilterList(null);
                  }}
                  className="sm:w-[min(820px,calc(100vw-48px))]"
                >
                  {activeView === "open" ? (
                    <div className="grid gap-3">
                      <div className="relative min-w-0">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          aria-label="캠페인 검색"
                          placeholder="브랜드, 캠페인, 플랫폼, 콘텐츠 검색"
                          className="h-9 w-full rounded-[8px] border border-neutral-200 bg-white pl-10 pr-3 text-[12px] font-bold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950"
                        />
                      </div>
                      <div className="grid min-w-0 gap-2">
                        <CampaignPlatformFilterList
                          id="influencer-campaign-platform"
                          openId={openFilterList}
                          onOpenChange={setOpenFilterList}
                          value={platformFilter}
                          onChange={setPlatformFilter}
                        />
                        <CampaignProposalTypeFilterList
                          id="influencer-campaign-type"
                          openId={openFilterList}
                          onOpenChange={setOpenFilterList}
                          value={proposalTypeFilter}
                          onChange={setProposalTypeFilter}
                        />
                        <CampaignCategoryFilterList
                          id="influencer-campaign-category"
                          openId={openFilterList}
                          onOpenChange={setOpenFilterList}
                          values={categoryFilters}
                          categories={categoryOptions}
                          onChange={setCategoryFilters}
                        />
                      </div>
                    </div>
                  ) : (
                    <AppliedCampaignFilters
                      query={appliedQuery}
                      statusFilter={appliedStatusFilter}
                      openId={openFilterList}
                      onOpenChange={setOpenFilterList}
                      onQueryChange={setAppliedQuery}
                      onStatusFilterChange={setAppliedStatusFilter}
                    />
                  )}
                </ResponsiveFilterPanel>
              </div>
            </div>
          </div>
        </div>

        {activeView === "applied" ? (
          applicationsState.status === "loading" ? (
            <PanelState
              icon={<RefreshCw className="h-5 w-5 animate-spin" />}
              title="신청한 캠페인을 불러오는 중"
            />
          ) : applicationsState.status === "error" ? (
            <PanelState
              icon={<Megaphone className="h-5 w-5" />}
              title={applicationsState.message}
            />
          ) : applications.length === 0 ? (
            <PanelState
              icon={<Send className="h-5 w-5" />}
              title="아직 신청한 캠페인이 없습니다"
              body="관심 있는 캠페인을 신청하면 이곳에서 진행 상태를 확인합니다."
            />
          ) : visibleApplications.length === 0 ? (
            <PanelState
              icon={<Send className="h-5 w-5" />}
              title="조건에 맞는 캠페인이 없습니다"
              body="검색어나 상태 조건을 줄여보세요."
            />
          ) : (
            <AppliedCampaignList
              applications={visibleApplications}
              focusedCampaignId={focusedCampaignId}
              sortState={appliedCampaignSort}
              onSortChange={setAppliedCampaignSort}
            />
          )
        ) : state.status === "loading" ? (
          <PanelState icon={<RefreshCw className="h-5 w-5 animate-spin" />} title="캠페인을 불러오는 중" />
        ) : state.status === "error" ? (
          <PanelState icon={<Megaphone className="h-5 w-5" />} title={state.message} />
        ) : campaigns.length === 0 ? (
          <PanelState
            icon={<Megaphone className="h-5 w-5" />}
            title="모집 중인 캠페인이 없습니다"
            body="새 캠페인이 공개되면 이곳에 표시됩니다."
          />
        ) : visibleCampaigns.length === 0 ? (
          <PanelState
            icon={<Megaphone className="h-5 w-5" />}
            title="조건에 맞는 캠페인이 없습니다"
            body="검색어나 조건을 줄여보세요."
          />
        ) : (
          <div
            data-campaign-scroll-region="open"
            className="grid min-h-0 flex-1 auto-rows-max gap-x-3 gap-y-5 overflow-y-auto overscroll-contain bg-[#fbfaf7] p-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {applicationNotice ? (
              <div
                className={`flex flex-col gap-2 rounded-[12px] border px-3 py-2 text-[12px] font-extrabold sm:col-span-2 sm:flex-row sm:items-center sm:justify-between xl:col-span-3 ${
                  applicationNotice.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                <p>{applicationNotice.message}</p>
                {applicationNotice.actionHref ? (
                  <Link
                    to={applicationNotice.actionHref}
                    className="yl-primary-action inline-flex h-9 shrink-0 items-center justify-center rounded-[8px] px-3 text-[12px] font-extrabold"
                  >
                    계정 인증하기
                  </Link>
                ) : null}
              </div>
            ) : null}
            {visibleCampaigns.map((campaign) => (
              <CampaignPostCard
                key={campaign.id}
                campaign={campaign}
                isApplying={applyingCampaignId === campaign.id}
                onApply={applyToCampaign}
                onOpenDetail={setSelectedCampaign}
              />
            ))}
          </div>
        )}
      </section>
      {selectedCampaign ? (
        <CampaignRecruitmentDetailDialog
          campaign={selectedCampaign}
          isApplying={applyingCampaignId === selectedCampaign.id}
          onApply={applyToCampaign}
          onClose={() => setSelectedCampaign(null)}
        />
      ) : null}
      {applicationConsentCampaign ? (
        <CampaignApplicationConsentDialog
          campaign={applicationConsentCampaign}
          isSubmitting={applyingCampaignId === applicationConsentCampaign.id}
          onCancel={() => setApplicationConsentCampaign(null)}
          onSubmit={(submission) =>
            submitCampaignApplication(
              applicationConsentCampaign,
              submission,
            )
          }
        />
      ) : null}
      </CampaignShell>
    </>
  );
}

export function PublicCampaignRecruitmentPage() {
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; campaign: MarketplaceCampaignPost }
    | { status: "error"; message: string }
  >(() =>
    campaignId
      ? { status: "loading" }
      : { status: "error", message: "모집 링크를 찾을 수 없습니다." },
  );
  const [applyingCampaignId, setApplyingCampaignId] = useState<string | undefined>();
  const [applicationNotice, setApplicationNotice] = useState<
    | {
        tone: "success" | "error";
        message: string;
        actionHref?: string;
      }
    | undefined
  >();
  const [applicationConsentCampaign, setApplicationConsentCampaign] =
    useState<MarketplaceCampaignPost | null>(null);
  const [sessionStatus, setSessionStatus] = useState<
    "checking" | "anonymous" | "authenticated"
  >("checking");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { summary: publicMessageSummary, isLoading: isPublicMessageSummaryLoading } =
    useMarketplaceMessageSummary("influencer", {
      enabled: sessionStatus === "authenticated",
    });

  useEffect(() => {
    let active = true;
    let retryAttempt = 0;
    let retryTimer: number | undefined;

    const checkSession = async () => {
      try {
        const response = await apiFetch("/api/influencer/session", {
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as
          InfluencerSessionStatusResponse;
        if (!active) return;
        if (response.ok && data.authenticated === true) {
          setSessionStatus("authenticated");
          return;
        }
        if (
          response.status === 401 ||
          response.status === 403 ||
          (response.ok && data.authenticated === false)
        ) {
          setSessionStatus("anonymous");
          return;
        }
      } catch {
        // Keep the current state and retry a transient session check.
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
  }, []);

  useEffect(() => {
    let active = true;

    if (!campaignId) {
      return () => {
        active = false;
      };
    }

    void apiFetch(`/api/marketplace/campaigns/${encodeURIComponent(campaignId)}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as
          | MarketplaceCampaignResponse
          | { error?: string };
        if (!response.ok || !("campaign" in data)) {
          throw new Error(
            "error" in data
              ? data.error ?? "모집글을 불러오지 못했습니다."
              : "모집글을 불러오지 못했습니다.",
          );
        }
        return data.campaign;
      })
      .then((campaign) => {
        if (!active) return;
        setState({ status: "ready", campaign });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "모집글을 불러오지 못했습니다.",
        });
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  const applyToCampaign = (campaign: MarketplaceCampaignPost) => {
    if (applyingCampaignId) return;
    if (!canApplyToMarketplaceCampaign(campaign)) {
      setApplicationNotice({
        tone: "error",
        message:
          "이 모집글은 현재 신청을 받을 수 없습니다. 광고주가 공유한 최신 모집 링크로 다시 확인해주세요.",
      });
      return;
    }

    const requiredConsents = (campaign.requiredConsents ?? []).filter(
      (consent) => consent.id.trim() && consent.text.trim(),
    );
    const applicationContactFields = campaign.applicationContactFields ?? [];
    if (requiredConsents.length === 0 && applicationContactFields.length === 0) {
      void submitCampaignApplication(campaign, {
        acceptedConsentIds: [],
        applicationContact: {},
        applicationContactConsentAccepted: false,
      });
      return;
    }
    setApplicationConsentCampaign(campaign);
  };

  const submitCampaignApplication = async (
    campaign: MarketplaceCampaignPost,
    submission: CampaignApplicationSubmission,
  ) => {
    if (applyingCampaignId) return;
    const campaignCopy = getPublicCampaignDisplayCopy(campaign);

    setApplyingCampaignId(campaign.id);
    setApplicationNotice({
      tone: "success",
      message: `${campaignCopy.title} 신청을 전송 중입니다.`,
    });

    try {
      const response = await apiFetch(
        `/api/marketplace/campaigns/${encodeURIComponent(campaign.id)}/applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            acceptedConsentIds: submission.acceptedConsentIds,
            consentVersion: campaign.consentVersion ?? "",
            applicationContact: submission.applicationContact,
            applicationContactConsentAccepted:
              submission.applicationContactConsentAccepted,
            applicationContactConsentVersion:
              campaign.applicationContactConsentVersion ?? "",
          }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as
        | CampaignApplicationResponse
        | VerificationRequiredApiError;

      if (response.status === 401) {
        setApplicationConsentCampaign(null);
        const nextPath = getCampaignSharePath(campaign) ?? "/influencer/campaigns";
        navigate(`/login/influencer?next=${encodeURIComponent(nextPath)}`, {
          replace: true,
        });
        return;
      }
      if (
        response.status === 403 &&
        isVerificationRequiredError(data, "influencer_verification_required")
      ) {
        setApplicationConsentCampaign(null);
        setApplicationNotice({
          tone: "error",
          message:
            data.error ??
            "첫 캠페인 지원부터 플랫폼 계정 인증이 필요합니다.",
          actionHref: data.next_path ?? "/influencer/verification",
        });
        return;
      }
      if (response.status === 403) {
        setApplicationConsentCampaign(null);
        const nextPath = getCampaignSharePath(campaign) ?? "/influencer/campaigns";
        navigate(`/login/influencer?next=${encodeURIComponent(nextPath)}`, {
          replace: true,
        });
        return;
      }

      if (!response.ok || !("proposal" in data)) {
        throw new Error(
          "error" in data
            ? data.error ?? "캠페인 신청을 저장하지 못했습니다."
            : "캠페인 신청을 저장하지 못했습니다.",
        );
      }

      setApplicationNotice({
        tone: "success",
        message: data.already_submitted
          ? "이미 신청한 캠페인입니다. 광고주가 확인하면 선정자별 진행으로 이어집니다."
          : "신청이 전달됐습니다. 광고주가 선정하면 이 캠페인의 계약서 초안이 만들어집니다.",
      });
      setApplicationConsentCampaign(null);
    } catch (error) {
      setApplicationConsentCampaign(null);
      setApplicationNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "캠페인 신청을 저장하지 못했습니다.",
      });
    } finally {
      setApplyingCampaignId(undefined);
    }
  };

  const campaign = state.status === "ready" ? state.campaign : null;
  const campaignCopy = campaign ? getPublicCampaignDisplayCopy(campaign) : null;
  const canApplyToCurrentCampaign = campaign
    ? canApplyToMarketplaceCampaign(campaign)
    : false;
  const facts = campaign ? getCampaignRecruitmentFacts(campaign) : [];
  const targetCountryLabel = campaign
    ? formatMarketplaceCountries(campaign.targetCountries)
    : "";
  const detailRows = campaign
    ? [
        ...(targetCountryLabel ? [{ label: "국가", value: targetCountryLabel }] : []),
        { label: "지급조건", value: campaign.budget },
        {
          label: "콘텐츠",
          value: campaign.deliverables?.join(", ") || "가이드라인 확인",
        },
        { label: "모집마감", value: getCampaignDeadlineLabel(campaign.deadline) },
        { label: "제출마감", value: getCampaignSubmissionDeadlineLabel(campaign) },
      ]
    : [];
  const currentSharePath =
    (campaign
      ? getCampaignSharePath(campaign)
      : campaignId
        ? `/campaigns/${encodeURIComponent(campaignId)}`
        : undefined) ?? "/influencer/campaigns";
  const accountLink =
    sessionStatus === "authenticated"
      ? {
          href: "/influencer/campaigns",
          label: "내 캠페인",
        }
      : sessionStatus === "anonymous"
        ? {
          href: `/login/influencer?next=${encodeURIComponent(currentSharePath)}`,
          label: "지원 계정 로그인",
          }
        : undefined;
  const logoHref =
    sessionStatus === "authenticated"
      ? "/influencer/dashboard"
      : sessionStatus === "anonymous"
        ? "/"
        : undefined;
  const handlePublicPageLogout = async () => {
    try {
      await apiFetch("/api/influencer/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Local private state is still cleared below.
    } finally {
      finishFastLoginTransition("influencer");
      clearVerificationSummaryCache("influencer");
      clearMarketplaceMessageSummaryCache("influencer");
      clearNotificationCenterCache("influencer");
      clearInfluencerDashboardPreload();
      setAccountMenuOpen(false);
      setSessionStatus("anonymous");
    }
  };

  return (
    <>
      <main className="min-h-svh bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 sm:px-6 lg:px-8">
          {logoHref ? (
            <Link to={logoHref} className="flex min-w-0 shrink-0 items-center gap-3">
              <LogoMark />
              <span className="font-neo-heavy text-[18px] leading-none text-neutral-950">
                {PRODUCT_NAME}
              </span>
            </Link>
          ) : (
            <div className="flex min-w-0 shrink-0 items-center gap-3" aria-busy="true">
              <LogoMark />
              <span className="font-neo-heavy text-[18px] leading-none text-neutral-950">
                {PRODUCT_NAME}
              </span>
            </div>
          )}
          {sessionStatus === "authenticated" ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <HeaderNotificationCenterButton role="influencer" />
              <HeaderMessageCenterButton
                unreadCount={publicMessageSummary.unreadCount}
                isLoading={isPublicMessageSummaryLoading}
                onClick={() => navigate("/influencer/messages")}
              />
              <Link
                to="/influencer/campaigns"
                className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
              >
                내 캠페인
              </Link>
              <button
                type="button"
                onClick={() => void handlePublicPageLogout()}
                className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
                aria-label="로그아웃"
                title="로그아웃"
              >
                <LogOut className="h-4 w-4" />
                <span>로그아웃</span>
              </button>
              <InfluencerAccountSettingsMenu
                account={{ name: "인플루언서" }}
                open={accountMenuOpen}
                onToggle={() => setAccountMenuOpen((current) => !current)}
                onClose={() => setAccountMenuOpen(false)}
                onManageProfile={() => {
                  setAccountMenuOpen(false);
                  navigate("/influencer/profile");
                }}
                onChangePassword={() => {
                  setAccountMenuOpen(false);
                  navigate("/reset-password?role=influencer");
                }}
                onLogout={() => void handlePublicPageLogout()}
              />
            </div>
          ) : accountLink ? (
            <Link
              to={accountLink.href}
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
            >
              {accountLink.label}
            </Link>
          ) : (
            <div className="flex gap-1.5 sm:gap-2" aria-busy="true">
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="sr-only">로그인 상태 확인 중</span>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-[1180px] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {state.status === "loading" ? (
          <PanelState
            icon={<RefreshCw className="h-5 w-5 animate-spin" />}
            title="모집글을 불러오는 중"
          />
        ) : state.status === "error" ? (
          <PanelState
            icon={<Megaphone className="h-5 w-5" />}
            title={state.message}
            body="모집이 종료되었거나 링크가 변경되었을 수 있습니다."
          />
        ) : campaign && campaignCopy ? (
          <article className="grid min-h-0 flex-1 overflow-hidden rounded-[12px] border border-neutral-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.07)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-h-0 border-b border-neutral-200 bg-[#fbfaf7] lg:border-b-0 lg:border-r">
              <CampaignThumbnail campaign={campaign} className="h-[260px] lg:h-full" />
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-extrabold text-neutral-500">
                      {campaign.brandName} · {campaign.brandCategory}
                    </p>
                    <h1 className="mt-2 break-keep text-[25px] font-black leading-8 text-neutral-950 sm:text-[34px] sm:leading-10">
                      {campaignCopy.title}
                    </h1>
                  </div>
                  <CampaignPlatformLogoMarks
                    platforms={campaign.platforms ?? []}
                    compact
                    className="mt-1 justify-end"
                  />
                </div>

                <p className="mt-4 text-[11px] font-extrabold text-neutral-400">
                  가이드라인
                </p>
                <p className="mt-1 break-keep text-[14px] font-bold leading-7 text-neutral-600">
                  {campaignCopy.summary}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {facts.map((fact) => (
                    <CampaignInlineFact
                      key={fact.label}
                      icon={fact.icon}
                      label={fact.label}
                      value={fact.value}
                    />
                  ))}
                </div>

                <dl className="mt-6 grid gap-2 border-t border-neutral-200 pt-4">
                  {detailRows.map((row) => (
                    <div
                      key={row.label}
                      className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 border-b border-neutral-100 pb-2 last:border-b-0"
                    >
                      <dt className="text-[12px] font-extrabold text-neutral-400">
                        {row.label}
                      </dt>
                      <dd className="break-keep text-[13px] font-extrabold leading-5 text-neutral-900">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="shrink-0 border-t border-neutral-200 bg-white p-3 sm:flex sm:items-center sm:justify-between sm:gap-3">
                {applicationNotice ? (
                  <div
                    className={`mb-3 flex flex-col gap-2 break-keep rounded-[8px] border px-3 py-2 text-[12px] font-extrabold leading-5 sm:mb-0 sm:flex-row sm:items-center ${
                      applicationNotice.tone === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <p>{applicationNotice.message}</p>
                    {applicationNotice.actionHref ? (
                      <Link
                        to={applicationNotice.actionHref}
                        className="yl-primary-action inline-flex h-9 shrink-0 items-center justify-center rounded-[8px] px-3 text-[12px] font-extrabold"
                      >
                        계정 인증하기
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="mb-3 break-keep text-[12px] font-bold leading-5 text-neutral-500 sm:mb-0">
                    {canApplyToCurrentCampaign
                      ? "신청 후 광고주가 선정하면 계약서와 서명 진행이 시작됩니다."
                      : "광고주가 공유한 최신 모집 링크에서 신청할 수 있습니다."}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => applyToCampaign(campaign)}
                  disabled={
                    applyingCampaignId === campaign.id ||
                    !canApplyToMarketplaceCampaign(campaign)
                  }
                  aria-busy={applyingCampaignId === campaign.id}
                  className="yl-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-[13px] font-extrabold disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 sm:w-[180px]"
                >
                  <Send className="h-4 w-4" />
                  {getCampaignApplyButtonLabel(
                    campaign,
                    applyingCampaignId === campaign.id,
                  )}
                </button>
              </div>
            </div>
          </article>
        ) : null}
      </section>
      </main>
      {applicationConsentCampaign ? (
        <CampaignApplicationConsentDialog
          campaign={applicationConsentCampaign}
          isSubmitting={applyingCampaignId === applicationConsentCampaign.id}
          onCancel={() => setApplicationConsentCampaign(null)}
          onSubmit={(submission) =>
            submitCampaignApplication(
              applicationConsentCampaign,
              submission,
            )
          }
        />
      ) : null}
    </>
  );
}

function CampaignShell({
  mode,
  role,
  eyebrow,
  title,
  description,
  metrics = [],
  actions,
  showHeroCopy = true,
  children,
}: {
  mode: CampaignShellMode;
  role: CampaignShellRole;
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  metrics?: CampaignShellMetric[];
  actions?: ReactNode;
  showHeroCopy?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const isAuthenticated = mode === "authenticated";
  const isCheckingSession = mode === "checking";
  const dashboardHref = `/${role}/dashboard`;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const closeAccountMenu = useCallback(() => setAccountMenuOpen(false), []);
  const { summary: messageSummary, isLoading: isMessageSummaryLoading } =
    useMarketplaceMessageSummary(role, { enabled: isAuthenticated });
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
        writeSelectedAdvertiserBrandId(undefined);
      } else {
        clearInfluencerDashboardPreload();
      }
      navigate(role === "advertiser" ? "/login/advertiser" : "/login/influencer", {
        replace: true,
      });
    }
  };

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          {isCheckingSession ? (
            <div
              className="flex shrink-0 items-center gap-3"
              aria-busy="true"
            >
              <LogoMark />
              <span className="font-neo-heavy text-[18px] leading-none text-neutral-950 sm:text-[19px]">
                {PRODUCT_NAME}
              </span>
            </div>
          ) : (
            <Link
              to={isAuthenticated ? dashboardHref : "/"}
              className="flex shrink-0 items-center gap-3"
            >
              <LogoMark />
              <span className="font-neo-heavy text-[18px] leading-none text-neutral-950 sm:text-[19px]">
                {PRODUCT_NAME}
              </span>
            </Link>
          )}

          <div className="ml-2 flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-visible sm:ml-3 sm:gap-2">
            {isAuthenticated ? (
              <>
                <div className="hidden lg:block">
                  <DashboardSurfaceSwitch role={role} active="campaigns" />
                </div>
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
            ) : (
              <div className="flex gap-1.5 sm:gap-2" aria-busy="true">
                <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
                <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
                <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
                <span className="sr-only">로그인 상태 확인 중</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {isAuthenticated ? <MobileSurfaceSwitch role={role} active="campaigns" /> : null}

      <section
        className={`shrink-0 bg-[#f7f6f3] ${
          showHeroCopy ? "border-b border-neutral-200/80" : ""
        }`}
      >
        <div
          className={`mx-auto max-w-[1500px] px-3 sm:px-5 lg:px-6 ${
            showHeroCopy ? "py-2.5 sm:py-3" : "pb-2.5 pt-7 sm:py-3"
          }`}
        >
          {showHeroCopy ? (
            <p className="inline-flex items-center gap-2 text-[12px] font-extrabold text-neutral-500 sm:text-[13px]">
              <Megaphone className="h-4 w-4" />
              {eyebrow}
            </p>
          ) : null}
          <div
            className={`${showHeroCopy ? "mt-1.5 sm:mt-2" : ""} grid gap-2 sm:gap-3 ${
              isAuthenticated && metrics.length > 0
                ? "lg:grid-cols-[minmax(0,1fr)_330px] lg:items-end"
                : ""
            }`}
          >
            <div className="min-w-0">
              <h1 className="font-neo-heavy text-[26px] leading-[1.05] text-neutral-950 sm:text-[34px] sm:leading-none">
                {title}
              </h1>
              {showHeroCopy ? (
                <p className="mt-1.5 line-clamp-1 max-w-3xl break-keep text-[12px] font-bold leading-5 text-neutral-600 sm:mt-3 sm:line-clamp-none sm:text-[13px] sm:leading-6">
                  {description}
                </p>
              ) : null}
            </div>
            {isAuthenticated && metrics.length > 0 ? (
              <div className="yl-evidence-strip grid-cols-3 sm:gap-2 sm:p-2">
                {metrics.map((metric) => (
                  <ShellMetric
                    key={`${metric.label}-${metric.value}`}
                    label={metric.label}
                    value={metric.value}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 py-2 sm:px-5 sm:py-3 lg:px-6">
        {children}
      </div>
    </main>
  );
}

function ShellMetric({
  label,
  value,
}: {
  key?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="yl-fact-tile px-2.5 py-2 sm:px-3 sm:py-3">
      <p className="yl-fact-label truncate">{label}</p>
      <p className="yl-fact-value truncate text-[12px] sm:text-[13px]">
        {value}
      </p>
    </div>
  );
}

function CampaignField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-[13px] font-extrabold text-neutral-800">{label}</span>
      {children}
    </div>
  );
}

function CampaignApplicationContactFieldSelector({
  selectedFields,
  onToggle,
}: {
  selectedFields: CampaignApplicationContactField[];
  onToggle: (field: CampaignApplicationContactField) => void;
}) {
  const options: Array<{
    field: CampaignApplicationContactField;
    label: string;
    description: string;
  }> = [
    {
      field: "phone",
      label: "휴대전화",
      description: "선정 및 캠페인 진행 안내에 사용",
    },
    {
      field: "email",
      label: "이메일",
      description: "선정 및 캠페인 진행 안내에 사용",
    },
  ];

  return (
    <section className="rounded-[12px] border border-neutral-200 bg-[#fbfaf7] p-3 sm:p-4">
      <div>
        <h3 className="text-[13px] font-extrabold text-neutral-900">
          지원자 연락처 수집
        </h3>
        <p className="mt-1 break-keep text-[12px] font-bold leading-5 text-neutral-500">
          필요한 항목만 선택하세요. 기본값은 미수집이며, 선택하면 지원 화면에
          개인정보 동의가 자동으로 표시됩니다.
        </p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = selectedFields.includes(option.field);
          return (
            <button
              key={option.field}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(option.field)}
              className={`flex min-h-14 items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-blue-300 bg-blue-50 text-blue-900"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] font-bold text-neutral-500">
                  {option.description}
                </span>
              </span>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-neutral-300 bg-white text-transparent"
                }`}
                aria-hidden="true"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CampaignRequiredConsentEditor({
  consents,
  onChange,
}: {
  consents: NonNullable<MarketplaceBrandCampaign["requiredConsents"]>;
  onChange: (
    consents: NonNullable<MarketplaceBrandCampaign["requiredConsents"]>,
  ) => void;
}) {
  const moveConsent = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= consents.length) return;
    const next = [...consents];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  };

  return (
    <section className="rounded-[12px] border border-neutral-200 bg-[#fbfaf7] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-extrabold text-neutral-900">신청 동의 항목</h3>
          <p className="mt-1 break-keep text-[12px] font-bold leading-5 text-neutral-500">
            필요한 동의를 추가하면 인플루언서는 신청 전에 각 항목의 동의합니다 버튼을 눌러야 합니다.
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-neutral-400">
          {consents.length}/8
        </span>
      </div>

      <div className="mt-3 grid gap-2.5">
        {consents.map((consent, index) => (
          <div
            key={consent.id}
            className="rounded-[10px] border border-neutral-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold text-neutral-500">
                동의 {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveConsent(index, -1)}
                  disabled={index === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-[8px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`동의 ${index + 1} 위로 이동`}
                  title="위로 이동"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveConsent(index, 1)}
                  disabled={index === consents.length - 1}
                  className="flex h-9 w-9 items-center justify-center rounded-[8px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`동의 ${index + 1} 아래로 이동`}
                  title="아래로 이동"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(consents.filter((item) => item.id !== consent.id))
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-[8px] text-neutral-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`동의 ${index + 1} 삭제`}
                  title="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <textarea
              required
              rows={3}
              maxLength={300}
              value={consent.text}
              onChange={(event) =>
                onChange(
                  consents.map((item) =>
                    item.id === consent.id
                      ? { ...item, text: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder="동의받을 내용을 입력하세요."
              className="campaign-input min-h-[86px] resize-y overflow-y-auto"
              aria-label={`동의 항목 ${index + 1}`}
            />
            <p className="mt-1 text-right text-[10px] font-bold tabular-nums text-neutral-400">
              {consent.text.length}/300
            </p>
          </div>
        ))}

        <button
          type="button"
          disabled={consents.length >= 8}
          onClick={() =>
            onChange([
              ...consents,
              { id: createCampaignRequiredConsentId(), text: "" },
            ])
          }
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-neutral-300 bg-white text-[12px] font-extrabold text-neutral-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          동의 항목 추가
        </button>
      </div>
    </section>
  );
}

function CampaignFormSelectList<T extends string>({
  id,
  openId,
  onOpenChange,
  summary,
  options,
  selectedValues,
  onSelect,
  onClear,
  searchPlaceholder,
  closeOnSelect = false,
}: {
  id: string;
  openId: string | null;
  onOpenChange: (value: string | null) => void;
  summary: string;
  options: Array<{ value: T; label: string }>;
  selectedValues: T[];
  onSelect: (value: T) => void;
  onClear?: () => void;
  searchPlaceholder?: string;
  closeOnSelect?: boolean;
}) {
  const open = openId === id;
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [listPlacement, setListPlacement] = useState<"up" | "down">("down");
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

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !listRef.current) return;
    const triggerBounds = rootRef.current.getBoundingClientRect();
    const listBounds = listRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerBounds.bottom - 8;
    const spaceAbove = triggerBounds.top - 8;
    setListPlacement(
      listBounds.height > spaceBelow && spaceAbove > spaceBelow ? "up" : "down",
    );
  }, [open, options.length]);

  return (
    <section ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) setListPlacement("down");
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
        <span className="min-w-0 truncate text-[13px] font-extrabold text-neutral-950">
          {summary}
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
          ref={listRef}
          data-placement={listPlacement}
          className={`absolute left-0 right-0 z-[70] overflow-hidden rounded-[12px] border border-neutral-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.14)] ${
            listPlacement === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
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
            aria-multiselectable="true"
            className={searchPlaceholder ? "max-h-48 overflow-y-auto" : "max-h-56 overflow-y-auto"}
          >
            {onClear && !normalizedSearchQuery ? (
              <CampaignFormCheckboxOption
                label="전체"
                selected={isClearSelected}
                onClick={() => {
                  onClear();
                  if (closeOnSelect) onOpenChange(null);
                }}
              />
            ) : null}
            {visibleOptions.map((option) => (
              <CampaignFormCheckboxOption
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

function CampaignFormCheckboxOption({
  label,
  onClick,
  selected,
}: {
  key?: string;
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <label
      className={`flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[12px] font-extrabold transition ${
        selected
          ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100"
          : "text-neutral-600 hover:bg-[#f6f8f6] hover:text-neutral-950"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onClick}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300 accent-blue-600"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

function CampaignDatePicker({
  id,
  label,
  openId,
  onOpenChange,
  value,
  min,
  onChange,
}: {
  id: string;
  label: string;
  openId: string | null;
  onOpenChange: (value: string | null) => void;
  value: string;
  min: string;
  onChange: (value: string) => void;
}) {
  const open = openId === id;
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const [calendarPlacement, setCalendarPlacement] = useState<"up" | "down">(
    "down",
  );
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getCampaignCalendarMonth(value || min),
  );
  const selectedDate = parseCampaignDate(value);
  const minimumDate = parseCampaignDate(min);
  const days = useMemo(() => getCampaignCalendarDays(visibleMonth), [visibleMonth]);
  const closeCalendar = useCallback(
    (restoreFocus: boolean) => {
      onOpenChange(null);
      if (restoreFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      closeCalendar(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeCalendar(true);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeCalendar, open]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !calendarRef.current) return;
    const triggerBounds = rootRef.current.getBoundingClientRect();
    const calendarBounds = calendarRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerBounds.bottom - 8;
    const spaceAbove = triggerBounds.top - 8;
    const nextPlacement =
      calendarBounds.height > spaceBelow && spaceAbove > spaceBelow
        ? "up"
        : "down";
    setCalendarPlacement(nextPlacement);
  }, [open, visibleMonth]);

  return (
    <section ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) {
            setCalendarPlacement("down");
            setVisibleMonth(getCampaignCalendarMonth(value || min));
          }
          onOpenChange(open ? null : id);
        }}
        aria-haspopup="dialog"
        aria-label={`${label} 날짜 선택`}
        aria-expanded={open}
        aria-controls={open ? `${id}-calendar` : undefined}
        className="campaign-input flex items-center justify-between gap-3 text-left"
      >
        <span className={value ? "text-neutral-950" : "text-neutral-400"}>
          {value ? formatCampaignDateButtonLabel(value) : "날짜 선택"}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-neutral-500" />
      </button>
      {open ? (
        <div
          ref={calendarRef}
          id={`${id}-calendar`}
          role="dialog"
          aria-label={`${label} 날짜 선택`}
          data-placement={calendarPlacement}
          className={`absolute left-0 z-30 w-full max-w-[360px] rounded-[12px] border border-neutral-200 bg-white p-3 shadow-[0_20px_44px_rgba(15,23,42,0.14)] ${
            calendarPlacement === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setVisibleMonth((current) => addCampaignCalendarMonths(current, -1))
              }
              className="h-8 rounded-[8px] px-2 text-[12px] font-extrabold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
            >
              이전
            </button>
            <p className="text-[13px] font-extrabold text-neutral-950">
              {formatCampaignCalendarMonthTitle(visibleMonth)}
            </p>
            <button
              type="button"
              onClick={() =>
                setVisibleMonth((current) => addCampaignCalendarMonths(current, 1))
              }
              className="h-8 rounded-[8px] px-2 text-[12px] font-extrabold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
            >
              다음
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold text-neutral-400">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="h-8" />;
              const dateValue = formatCampaignDateValue(day);
              const disabled = minimumDate ? day < minimumDate : false;
              const selected =
                Boolean(selectedDate) && dateValue === formatCampaignDateValue(selectedDate);
              return (
                <button
                  key={dateValue}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(dateValue);
                    closeCalendar(true);
                  }}
                  className={`h-8 rounded-[8px] text-[12px] font-extrabold transition ${
                    selected
                      ? "bg-blue-600 text-white"
                      : disabled
                        ? "cursor-not-allowed text-neutral-300"
                        : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AdvertiserCampaignPreview({
  campaign,
  canPublish,
  helperText,
}: {
  campaign: MarketplaceCampaignPost;
  canPublish: boolean;
  helperText: string;
}) {
  const campaignCopy = getCampaignDisplayCopy(campaign);
  const factRows = getCampaignRecruitmentFacts(campaign);

  return (
    <section className="mt-4 overflow-hidden rounded-[12px] border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-neutral-400">
            모집 카드 미리보기
          </p>
          <p className="truncate text-[13px] font-extrabold text-neutral-950">
            {campaign.brandName}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
            canPublish
              ? "bg-emerald-50 text-emerald-700"
              : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {canPublish ? "공개 가능" : "작성 중"}
        </span>
      </div>
      <CampaignThumbnail campaign={campaign} className="h-[126px]" />
      <div className="p-3">
        <div className="flex justify-end">
          <CampaignPlatformLogoMarks
            platforms={campaign.platforms ?? []}
            compact
            className="mt-0 justify-end"
          />
        </div>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-extrabold leading-5 text-neutral-950">
          {campaignCopy.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 break-keep text-[12px] font-bold leading-5 text-neutral-600">
          {campaignCopy.summary}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {factRows.map((fact) => (
            <CampaignInlineFact
              key={fact.label}
              icon={fact.icon}
              label={fact.label}
              value={fact.value}
            />
          ))}
        </div>
        <p
          className={`mt-3 rounded-[10px] px-3 py-2 text-[12px] font-extrabold leading-5 ${
            canPublish ? "bg-emerald-50 text-emerald-700" : "bg-[#fbfaf7] text-neutral-500"
          }`}
        >
          {helperText}
        </p>
      </div>
    </section>
  );
}

function BrandImageUpload({
  brand,
  previewUrl,
  disabled,
  onSelect,
}: {
  brand: MarketplaceBrandProfile | null;
  previewUrl?: string;
  disabled: boolean;
  onSelect: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageUrl = previewUrl ?? brand?.logoUrl;
  const label = brand?.logoLabel ?? "BR";
  const name = brand?.displayName ?? "브랜드";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[12px] border border-neutral-200 bg-white text-[12px] font-extrabold text-neutral-800">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${name} logo`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          label
        )}
      </span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="inline-flex h-9 items-center rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-wait disabled:text-neutral-400"
      >
        {disabled ? "업로드 중" : "로고 업로드"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          onSelect(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function CampaignImageUpload({
  imageUrl,
  disabled,
  onSelect,
}: {
  imageUrl?: string;
  disabled: boolean;
  onSelect: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="flex min-w-0 flex-col items-stretch gap-2 rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 w-full items-center gap-3 sm:flex-1">
        <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white text-[11px] font-extrabold text-neutral-400 ring-1 ring-neutral-200">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="캠페인 대표 이미지"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            "대표"
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-neutral-950 sm:truncate">
            대표 이미지
          </p>
          <p className="mt-0.5 break-keep text-[11px] font-bold leading-4 text-neutral-500 sm:truncate">
            모집 카드와 상세 상단에 표시됩니다.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="inline-flex h-9 w-full shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-wait disabled:text-neutral-400 sm:w-auto"
      >
        {disabled ? "업로드 중" : "사진 업로드"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          onSelect(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </section>
  );
}

const generatedCampaignDisplayCopies: Record<
  string,
  { title: string; summary: string }
> = {
  "obre-beauty": {
    title: "진정 세럼 2주 루틴 리뷰",
    summary: "민감 피부 루틴과 사용감을 릴스 중심으로 보여줄 크리에이터를 찾습니다.",
  },
  housefit: {
    title: "10분 홈트 챌린지 쇼츠",
    summary: "집에서 따라할 수 있는 짧은 운동 루틴을 숏폼으로 소개합니다.",
  },
  brewinglab: {
    title: "홈카페 드립백 공동구매",
    summary: "드립백 사용 장면과 홈카페 레시피를 자연스럽게 연결합니다.",
  },
  nightcare: {
    title: "수면 루틴 쇼츠 패키지",
    summary: "밤 루틴과 제품 사용감을 짧은 영상으로 설득력 있게 보여줍니다.",
  },
  "breadroom-family": {
    title: "파우치 필수템 쇼츠 리뷰",
    summary: "신제품 런칭과 숏폼 전환을 함께할 크리에이터를 찾습니다.",
  },
};

const generatedCampaignRecruitmentDetails: Record<
  string,
  { location: string; offer: string; mission: string }
> = {
  "obre-beauty": {
    location: "온라인 배송",
    offer: "진정 세럼 본품",
    mission: "2주 사용 루틴과 민감 피부 사용감을 릴스와 스토리로 소개",
  },
  housefit: {
    location: "온라인 진행",
    offer: "운동 프로그램 이용권",
    mission: "집에서 따라할 수 있는 10분 루틴을 숏폼으로 제작",
  },
  brewinglab: {
    location: "부산 · 온라인",
    offer: "드립백 세트",
    mission: "홈카페 레시피와 공동구매 구매 포인트를 자연스럽게 연결",
  },
  nightcare: {
    location: "온라인 배송",
    offer: "수면 케어 제품",
    mission: "밤 루틴 안에서 제품 사용 장면과 휴식감을 숏폼으로 소개",
  },
  "breadroom-family": {
    location: "온라인 배송",
    offer: "파우치 신제품 세트",
    mission: "신제품 첫인상과 사용 장면을 릴스 또는 쇼츠로 제작",
  },
};

function getGeneratedCampaignRecruitmentDetails(
  campaign: MarketplaceBrandCampaign | MarketplaceCampaignPost,
) {
  if (!("brandHandle" in campaign)) return undefined;

  const familyKey = getMarketplaceBrandDisplayFamilyKey({
    handle: campaign.brandHandle,
    displayName: campaign.brandName,
  });
  const text = `${campaign.title} ${campaign.summary ?? ""}`;

  if (familyKey === "breadroom-family") {
    if (/홈케어|리빙|생활/u.test(text)) {
      return {
        location: "온라인 배송",
        offer: "홈케어 제품 세트",
        mission: "제품 사용 전후와 생활 속 사용 장면을 블로그 또는 숏폼으로 소개",
      };
    }
    if (/선케어|선크림|자외선/u.test(text)) {
      return {
        location: "온라인 배송",
        offer: "선케어 제품 세트",
        mission: "제품 사용감과 야외 루틴 장면을 릴스와 스토리로 소개",
      };
    }
    if (/파우치|필수템/u.test(text)) {
      return generatedCampaignRecruitmentDetails["breadroom-family"];
    }
  }

  return generatedCampaignRecruitmentDetails[familyKey];
}

function getCampaignDisplayCopy(campaign: MarketplaceCampaignPost) {
  const familyKey = getMarketplaceBrandDisplayFamilyKey({
    handle: campaign.brandHandle,
    displayName: campaign.brandName,
  });
  const generatedCopy = generatedCampaignDisplayCopies[familyKey];
  const rawSummary = campaign.summary ?? campaign.brandHeadline;
  const hasGeneratedTitle =
    /신제품 언박싱 릴스|제품 체험 리뷰/.test(campaign.title) &&
    Boolean(generatedCopy);
  const hasGeneratedSummary =
    /신제품 사용 장면을 릴스와 스토리로|광고 캠페인 보드/.test(rawSummary) &&
    Boolean(generatedCopy);

  return {
    title: hasGeneratedTitle ? generatedCopy.title : campaign.title,
    summary: hasGeneratedSummary ? generatedCopy.summary : rawSummary,
  };
}

function canApplyToMarketplaceCampaign(campaign: MarketplaceCampaignPost) {
  return (
    campaign.acceptsApplications === true ||
    isMarketplaceApplicationBrandId(campaign.brandId)
  );
}

function getCampaignApplyButtonLabel(
  campaign: MarketplaceCampaignPost,
  isApplying: boolean,
) {
  if (isApplying) return "신청 중";
  return canApplyToMarketplaceCampaign(campaign) ? "신청하기" : "신청 준비 중";
}

function getPublicCampaignDisplayCopy(campaign: MarketplaceCampaignPost) {
  return {
    title: campaign.title,
    summary: campaign.summary?.trim() || campaign.brandHeadline,
  };
}

type CampaignRecruitmentFact = {
  label: string;
  value: string;
  icon: ReactNode;
};

function parseCampaignDeliverables(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCampaignLocationLabel(
  campaign: MarketplaceBrandCampaign | MarketplaceCampaignPost,
) {
  const post = campaign as MarketplaceCampaignPost;
  const generated = getGeneratedCampaignRecruitmentDetails(campaign);
  return campaign.location ?? generated?.location ?? post.brandLocation ?? "지역 확인";
}

function getCampaignDdayLabel(deadline: string | undefined) {
  if (!deadline) return "상시";
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;

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
  const dayDiff = Math.round(
    (targetStart.getTime() - todayStart.getTime()) / 86400000,
  );

  if (dayDiff > 0) return `D-${dayDiff}`;
  if (dayDiff === 0) return "D-0";
  return "마감";
}

function getCampaignSubmissionDeadlineLabel(
  campaign: MarketplaceBrandCampaign | MarketplaceCampaignPost,
) {
  return getCampaignDeadlineLabel(campaign.uploadDeadline ?? campaign.deadline);
}

function getCampaignFallbackThumbnailUrl(campaign: MarketplaceCampaignPost) {
  const haystack = [
    campaign.brandHandle,
    campaign.brandName,
    campaign.title,
    campaign.summary,
    campaign.offer,
    campaign.mission,
  ]
    .filter(Boolean)
    .join(" ");

  if (/monotrip/i.test(haystack)) {
    return "/images/campaigns/monotrip-local-stay-v2.png";
  }
  if (/stayhour|nightcare/i.test(haystack)) {
    return "/images/campaigns/stayhour-weekend-stay-v2.png";
  }
  if (/breadroom|obre/i.test(haystack)) {
    return "/images/campaigns/breadroom-homecare-supporters-v2.png";
  }
  if (/object-studio|housefit/i.test(haystack)) {
    return "/images/campaigns/object-studio-organization-v2.png";
  }
  if (/greenspoon|brewinglab/i.test(haystack)) {
    return "/images/campaigns/greenspoon-breakfast-routine-v2.png";
  }

  if (/모노트립|monotrip|숙소|로컬 숙소|브이로그/u.test(haystack)) {
    return "/images/campaigns/monotrip-local-stay-v2.png";
  }
  if (/브레드룸|breadroom|홈케어|서포터즈|언박싱|파우치/u.test(haystack)) {
    return "/images/campaigns/breadroom-homecare-supporters-v2.png";
  }
  if (/오브제스튜디오|object-studio|공간 정리|리빙|소품/u.test(haystack)) {
    return "/images/campaigns/object-studio-organization-v2.png";
  }
  if (/그린스푼|greenspoon|건강식|아침 식단|루틴/u.test(haystack)) {
    return "/images/campaigns/greenspoon-breakfast-routine-v2.png";
  }
  if (/스테이아워|stayhour|주말 스테이|숙박권/u.test(haystack)) {
    return "/images/campaigns/stayhour-weekend-stay-v2.png";
  }

  return undefined;
}

function getCampaignRecruitmentFacts(
  campaign: MarketplaceBrandCampaign | MarketplaceCampaignPost,
): CampaignRecruitmentFact[] {
  return [
    {
      label: "지역",
      value: getCampaignLocationLabel(campaign),
      icon: <MapPin className="h-3.5 w-3.5" />,
    },
    {
      label: "지급",
      value: campaign.budget,
      icon: <Gift className="h-3.5 w-3.5" />,
    },
    {
      label: "모집",
      value: formatCampaignApplicantLimit(campaign.applicantLimit),
      icon: <UsersRound className="h-3.5 w-3.5" />,
    },
    {
      label: "모집마감",
      value: getCampaignDdayLabel(campaign.deadline),
      icon: <CalendarDays className="h-3.5 w-3.5" />,
    },
    {
      label: "제출마감",
      value: getCampaignSubmissionDeadlineLabel(campaign),
      icon: <CalendarDays className="h-3.5 w-3.5" />,
    },
  ];
}

function CampaignThumbnail({
  campaign,
  className = "h-36",
}: {
  campaign: MarketplaceCampaignPost;
  className?: string;
}) {
  const fallbackThumbnailUrl = getCampaignFallbackThumbnailUrl(campaign);
  const hasRealThumbnail =
    Boolean(campaign.thumbnailUrl) && campaign.thumbnailUrl !== campaign.brandLogoUrl;
  const imageUrl =
    hasRealThumbnail ? campaign.thumbnailUrl : fallbackThumbnailUrl ?? campaign.brandLogoUrl;
  const usesLogoImage = !hasRealThumbnail && !fallbackThumbnailUrl;
  const usesCanonicalShareImage = Boolean(
    imageUrl && /\/og\/yeollock-og\.png(?:[?#]|$)/i.test(imageUrl),
  );

  return (
    <div className={`relative overflow-hidden bg-[#eef1ea] ${className}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${campaign.brandName} campaign`}
          className={`h-full w-full ${
            usesLogoImage
              ? "object-contain p-6"
              : usesCanonicalShareImage
                ? "object-contain"
                : "object-cover"
          }`}
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[28px] font-black text-neutral-800">
          {campaign.brandLogoLabel}
        </div>
      )}
      <div className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-extrabold text-neutral-800 ring-1 ring-neutral-200">
        {campaign.typeLabel}
      </div>
    </div>
  );
}

function CampaignInlineFact({
  icon,
  label,
  value,
}: CampaignRecruitmentFact & { key?: string }) {
  return (
    <div className="min-w-0 border-t border-neutral-100 pt-2">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold text-neutral-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[12px] font-extrabold text-neutral-900">
        {value}
      </p>
    </div>
  );
}

function CampaignCardMetaChips({
  campaign,
}: {
  campaign: MarketplaceCampaignPost;
}) {
  const countryLabel = formatMarketplaceCountries(campaign.targetCountries);
  const chips = [
    countryLabel
      ? {
          label: "국가",
          value: countryLabel,
          icon: <UsersRound className="h-3.5 w-3.5" />,
        }
      : null,
    {
      label: "지역",
      value: getCampaignLocationLabel(campaign),
      icon: <MapPin className="h-3.5 w-3.5" />,
    },
    {
      label: "지급",
      value: campaign.budget,
      icon: <Gift className="h-3.5 w-3.5" />,
    },
    {
      label: "모집",
      value: formatCampaignApplicantLimit(campaign.applicantLimit),
      icon: <UsersRound className="h-3.5 w-3.5" />,
    },
  ].filter((chip): chip is { label: string; value: string; icon: ReactNode } =>
    Boolean(chip),
  );

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f7f7f3] px-2.5 py-1 text-[11px] font-extrabold text-neutral-700 ring-1 ring-neutral-200/80"
          title={`${chip.label}: ${chip.value}`}
          aria-label={`${chip.label}: ${chip.value}`}
        >
          <span className="shrink-0 text-neutral-400" aria-hidden="true">
            {chip.icon}
          </span>
          <span className="truncate">{chip.value}</span>
        </span>
      ))}
    </div>
  );
}

function CampaignCardDeadlineStrip({
  campaign,
}: {
  campaign: MarketplaceCampaignPost;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <span
        className="inline-flex min-w-0 items-center gap-1.5 rounded-[8px] bg-white px-2 py-1.5 text-[11px] font-extrabold text-neutral-800 ring-1 ring-neutral-200"
        title={`모집마감: ${getCampaignDeadlineLabel(campaign.deadline)}`}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className="truncate">모집 {getCampaignDdayLabel(campaign.deadline)}</span>
      </span>
      <span
        className="inline-flex min-w-0 items-center gap-1.5 rounded-[8px] bg-white px-2 py-1.5 text-[11px] font-extrabold text-neutral-800 ring-1 ring-neutral-200"
        title={`제출마감: ${getCampaignSubmissionDeadlineLabel(campaign)}`}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className="truncate">제출마감 {getCampaignSubmissionDeadlineLabel(campaign)}</span>
      </span>
    </div>
  );
}

function CampaignApplicationConsentDialog({
  campaign,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  campaign: MarketplaceCampaignPost;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (submission: CampaignApplicationSubmission) => void;
}) {
  useBodyScrollLock(true);
  const requiredConsents = (campaign.requiredConsents ?? []).filter(
    (consent) => consent.id.trim() && consent.text.trim(),
  );
  const applicationContactFields = (campaign.applicationContactFields ?? []).filter(
    (field): field is CampaignApplicationContactField =>
      field === "phone" || field === "email",
  );
  const collectsPhone = applicationContactFields.includes("phone");
  const collectsEmail = applicationContactFields.includes("email");
  const [acceptedConsentIds, setAcceptedConsentIds] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [applicationContactConsentAccepted, setApplicationContactConsentAccepted] =
    useState(false);
  const acceptedConsentIdSet = new Set(acceptedConsentIds);
  const allCustomConsentsAccepted = requiredConsents.every((consent) =>
    acceptedConsentIdSet.has(consent.id),
  );
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid =
    !collectsPhone ||
    (/^[0-9+()\-\s]{8,24}$/.test(phone.trim()) &&
      phoneDigits.length >= 9 &&
      phoneDigits.length <= 15);
  const emailValid =
    !collectsEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const hasApplicationContact = applicationContactFields.length > 0;
  const allAccepted =
    allCustomConsentsAccepted &&
    phoneValid &&
    emailValid &&
    (!hasApplicationContact || applicationContactConsentAccepted);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-neutral-950/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-consent-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={isSubmitting ? undefined : onCancel}
        aria-label="신청 동의 닫기"
      />
      <section className="relative flex max-h-[calc(100svh-16px)] w-full max-w-[620px] flex-col overflow-hidden rounded-t-[16px] bg-white shadow-[0_28px_90px_rgba(15,23,42,0.32)] sm:max-h-[calc(100svh-32px)] sm:rounded-[16px]">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-extrabold text-neutral-500">
              {campaign.brandName} · {campaign.title}
            </p>
            <h2
              id="campaign-consent-title"
              className="mt-1 text-[20px] font-black text-neutral-950"
            >
              신청 전 필수 동의
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="닫기"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbfaf7] p-3 sm:p-5">
          <div className="grid gap-2.5">
            {hasApplicationContact ? (
              <article className="rounded-[12px] border border-neutral-200 bg-white p-3 sm:p-4">
                <p className="text-[11px] font-extrabold text-neutral-400">
                  지원자 연락처
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {collectsPhone ? (
                    <label className="grid gap-1.5 text-[12px] font-extrabold text-neutral-700">
                      휴대전화
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="010-1234-5678"
                        className="campaign-input"
                        aria-invalid={phone.trim().length > 0 && !phoneValid}
                      />
                      {phone.trim().length > 0 && !phoneValid ? (
                        <span className="text-[11px] font-bold text-rose-600">
                          휴대전화 번호를 확인해 주세요.
                        </span>
                      ) : null}
                    </label>
                  ) : null}
                  {collectsEmail ? (
                    <label className="grid gap-1.5 text-[12px] font-extrabold text-neutral-700">
                      이메일
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="creator@example.com"
                        className="campaign-input"
                        aria-invalid={email.trim().length > 0 && !emailValid}
                      />
                      {email.trim().length > 0 && !emailValid ? (
                        <span className="text-[11px] font-bold text-rose-600">
                          이메일 주소를 확인해 주세요.
                        </span>
                      ) : null}
                    </label>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[10px] border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-[12px] font-extrabold text-neutral-900">
                    개인정보 수집·이용 및 광고주 제공(필수)
                  </p>
                  <dl className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px] font-bold leading-5 text-neutral-600">
                    <dt className="text-neutral-400">수집 항목</dt>
                    <dd>
                      {[
                        collectsPhone ? "휴대전화" : undefined,
                        collectsEmail ? "이메일" : undefined,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                    <dt className="text-neutral-400">이용 목적</dt>
                    <dd>지원자 확인, 선정 및 캠페인 진행 안내</dd>
                    <dt className="text-neutral-400">제공받는 자</dt>
                    <dd>{campaign.brandName} 광고주 조직</dd>
                    <dt className="text-neutral-400">보유 기간</dt>
                    <dd>
                      캠페인 종료 후 90일까지. 법령상 보존 의무가 있는 경우에는
                      해당 기간까지 보관합니다.
                    </dd>
                    <dt className="text-neutral-400">거부 시 영향</dt>
                    <dd>
                      동의를 거부할 수 있으나, 이 캠페인에는 신청할 수 없습니다.
                    </dd>
                    <dt className="text-neutral-400">정책 버전</dt>
                    <dd>{CAMPAIGN_APPLICATION_CONTACT_POLICY_VERSION}</dd>
                  </dl>
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-neutral-200 bg-white p-3">
                    <input
                      type="checkbox"
                      checked={applicationContactConsentAccepted}
                      onChange={(event) =>
                        setApplicationContactConsentAccepted(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="break-keep text-[12px] font-extrabold leading-5 text-neutral-700">
                      위 개인정보 처리 내용을 확인했고 동의합니다.
                    </span>
                  </label>
                </div>
              </article>
            ) : null}
            {requiredConsents.map((consent, index) => {
              const accepted = acceptedConsentIdSet.has(consent.id);
              return (
                <article
                  key={consent.id}
                  className={`rounded-[12px] border p-3 transition sm:p-4 ${
                    accepted
                      ? "border-blue-200 bg-blue-50/70"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <p className="text-[11px] font-extrabold text-neutral-400">
                    필수 동의 {index + 1}
                  </p>
                  <p className="mt-1.5 break-keep text-[13px] font-bold leading-6 text-neutral-800">
                    {consent.text}
                  </p>
                  <button
                    type="button"
                    aria-pressed={accepted}
                    onClick={() =>
                      setAcceptedConsentIds((current) =>
                        current.includes(consent.id)
                          ? current.filter((id) => id !== consent.id)
                          : [...current, consent.id],
                      )
                    }
                    className={`mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border text-[12px] font-extrabold transition sm:w-[132px] ${
                      accepted
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-neutral-300 bg-white text-neutral-700 hover:border-blue-300 hover:text-blue-700"
                    }`}
                  >
                    {accepted ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                    {accepted ? "동의 완료" : "동의합니다"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <footer className="shrink-0 border-t border-neutral-200 bg-white p-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
          <p className="mb-3 text-[12px] font-extrabold text-neutral-500 sm:mb-0">
            {allAccepted ? "필수 확인 완료" : "필수 입력과 동의를 확인해 주세요."}
          </p>
          <button
            type="button"
            disabled={!allAccepted || isSubmitting}
            onClick={() =>
              onSubmit({
                acceptedConsentIds: requiredConsents.map((consent) => consent.id),
                applicationContact: {
                  ...(collectsPhone ? { phone: phone.trim() } : {}),
                  ...(collectsEmail ? { email: email.trim() } : {}),
                },
                applicationContactConsentAccepted:
                  hasApplicationContact && applicationContactConsentAccepted,
              })
            }
            className="yl-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-5 text-[13px] font-extrabold disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:hover:bg-neutral-300 sm:w-[180px]"
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "신청 중" : "캠페인 신청"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CampaignRecruitmentDetailDialog({
  campaign,
  isApplying,
  onApply,
  onClose,
}: {
  campaign: MarketplaceCampaignPost;
  isApplying: boolean;
  onApply: (campaign: MarketplaceCampaignPost) => void;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const campaignCopy = getCampaignDisplayCopy(campaign);
  const facts = getCampaignRecruitmentFacts(campaign);
  const targetCountryLabel = formatMarketplaceCountries(campaign.targetCountries);
  const detailRows = [
    ...(targetCountryLabel
      ? [{ label: "국가", value: targetCountryLabel }]
      : []),
    { label: "지급조건", value: campaign.budget },
    {
      label: "콘텐츠",
      value: campaign.deliverables?.join(", ") || "가이드라인 확인",
    },
    {
      label: "모집마감",
      value: getCampaignDeadlineLabel(campaign.deadline),
    },
    {
      label: "제출마감",
      value: getCampaignSubmissionDeadlineLabel(campaign),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={`${campaignCopy.title} 상세`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="닫기"
        onClick={onClose}
      />
      <section className="relative flex max-h-[calc(100svh-24px)] w-full max-w-[920px] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-neutral-200 px-4">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold text-neutral-950">
              {campaign.brandName}
            </p>
            <p className="truncate text-[11px] font-bold text-neutral-500">
              {campaign.brandCategory} · {getCampaignLocationLabel(campaign)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
            aria-label="닫기"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="border-b border-neutral-200 lg:border-b-0 lg:border-r">
            <CampaignThumbnail campaign={campaign} className="h-[236px]" />
            <div className="grid grid-cols-2 gap-2 p-4">
              {facts.map((fact) => (
                <CampaignInlineFact
                  key={fact.label}
                  icon={fact.icon}
                  label={fact.label}
                  value={fact.value}
                />
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col p-4">
            <h2 className="break-keep text-[24px] font-black leading-8 text-neutral-950">
              {campaignCopy.title}
            </h2>
            <p className="mt-3 text-[11px] font-extrabold text-neutral-400">
              가이드라인
            </p>
            <p className="mt-1 break-keep text-[13px] font-bold leading-6 text-neutral-600">
              {campaignCopy.summary}
            </p>
            <dl className="mt-4 grid gap-2">
              {detailRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-neutral-100 pb-2 last:border-b-0"
                >
                  <dt className="text-[12px] font-extrabold text-neutral-400">
                    {row.label}
                  </dt>
                  <dd className="break-keep text-[13px] font-extrabold leading-5 text-neutral-900">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-200 bg-white p-3 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <p className="mb-3 break-keep text-[12px] font-bold leading-5 text-neutral-500 sm:mb-0">
            선정 후 캠페인 상세에서 계약서 확인과 서명을 진행합니다.
          </p>
          <button
            type="button"
            onClick={() => onApply(campaign)}
            disabled={isApplying || !canApplyToMarketplaceCampaign(campaign)}
            aria-busy={isApplying}
            className="yl-primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-[13px] font-extrabold disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 sm:w-[180px]"
          >
            <Send className="h-4 w-4" />
            {getCampaignApplyButtonLabel(campaign, isApplying)}
          </button>
        </div>
      </section>
    </div>
  );
}

function CampaignPostCard({
  campaign,
  isApplying,
  onApply,
  onOpenDetail,
}: {
  key?: string;
  campaign: MarketplaceCampaignPost;
  isApplying: boolean;
  onApply: (campaign: MarketplaceCampaignPost) => void;
  onOpenDetail: (campaign: MarketplaceCampaignPost) => void;
}) {
  const campaignCopy = getCampaignDisplayCopy(campaign);

  return (
    <article className="yl-card flex min-h-[382px] flex-col overflow-hidden border p-0">
      <button
        type="button"
        onClick={() => onOpenDetail(campaign)}
        className="block w-full text-left"
        aria-label={`${campaignCopy.title} 상세 보기`}
      >
        <CampaignThumbnail campaign={campaign} className="h-[138px]" />
      </button>
      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-3.5">
        <div className="flex items-start gap-3">
          <span className="yl-profile-mark flex h-9 w-9 shrink-0 items-center justify-center text-[11px] font-extrabold sm:h-10 sm:w-10 sm:text-[12px]">
            {campaign.brandLogoUrl ? (
              <img
                src={campaign.brandLogoUrl}
                alt={`${campaign.brandName} logo`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              campaign.brandLogoLabel
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-neutral-950">
              {campaign.brandName}
            </p>
            <p className="mt-0.5 truncate text-[12px] font-bold text-neutral-400">
              {campaign.brandCategory}
            </p>
          </div>
          <CampaignPlatformLogoMarks
            platforms={campaign.platforms ?? []}
            compact
            className="mt-0 justify-end"
          />
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => onOpenDetail(campaign)}
            className="block w-full text-left"
          >
            <h2 className="line-clamp-2 text-[16px] font-extrabold leading-6 text-neutral-950">
              {campaignCopy.title}
            </h2>
          </button>
          <p className="mt-1.5 line-clamp-2 break-keep text-[12px] font-bold leading-5 text-neutral-600 sm:text-[13px]">
            {campaignCopy.summary}
          </p>
        </div>

        <CampaignCardMetaChips campaign={campaign} />
        <CampaignCardDeadlineStrip campaign={campaign} />

        <div className="mt-auto flex items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => onOpenDetail(campaign)}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-[8px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-950 hover:text-neutral-950"
          >
            상세
          </button>
          <button
            type="button"
            onClick={() => onApply(campaign)}
            disabled={isApplying || !canApplyToMarketplaceCampaign(campaign)}
            aria-busy={isApplying}
            className="yl-primary-action inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 text-[12px] font-extrabold transition disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
          >
            <Send className="h-3.5 w-3.5" />
            {getCampaignApplyButtonLabel(campaign, isApplying)}
          </button>
        </div>
      </div>
    </article>
  );
}

function CampaignPlatformLogoMarks({
  platforms,
  compact = false,
  className = "mt-2",
}: {
  platforms: InfluencerPlatform[];
  compact?: boolean;
  className?: string;
}) {
  if (platforms.length === 0) return null;

  const visiblePlatforms = platforms.slice(0, 4);
  const label = visiblePlatforms
    .map((platform) => getPlatformDisplayName(platform))
    .join(", ");

  return (
    <div className={`${className} flex flex-wrap gap-1.5`} aria-label={`플랫폼 ${label}`}>
      {visiblePlatforms.map((platform) => (
        <span
          key={platform}
          className={`inline-flex shrink-0 items-center justify-center ${
            compact ? "h-6 w-7" : "h-7 w-8"
          }`}
          title={getPlatformDisplayName(platform)}
          aria-label={getPlatformDisplayName(platform)}
        >
          <PlatformBrandMark platform={platform} size="sm" />
        </span>
      ))}
      {platforms.length > visiblePlatforms.length ? (
        <span className="inline-flex h-6 shrink-0 items-center text-[10px] font-extrabold text-neutral-500">
          +{platforms.length - visiblePlatforms.length}
        </span>
      ) : null}
    </div>
  );
}

function CampaignViewTabs({
  value,
  openCount,
  appliedCount,
  onChange,
}: {
  value: InfluencerCampaignView;
  openCount: number;
  appliedCount: number;
  onChange: (value: InfluencerCampaignView) => void;
}) {
  const tabs: Array<{
    id: InfluencerCampaignView;
    label: string;
    mobileLabel: string;
    count: number;
  }> = [
    { id: "open", label: "모집 캠페인", mobileLabel: "모집", count: openCount },
    { id: "applied", label: "신청한 캠페인", mobileLabel: "신청", count: appliedCount },
  ];

  return (
    <div
      data-product-tour="influencer-campaign-views"
      className="grid min-w-0 flex-1 grid-cols-2 w-full gap-1 overflow-hidden rounded-full bg-neutral-100 p-1 sm:min-w-[250px] lg:w-[320px]"
      role="tablist"
      aria-label="캠페인 보기"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${tab.label} ${tab.count}건`}
            onClick={() => onChange(tab.id)}
            className={`h-9 min-w-0 rounded-full px-1.5 text-[11px] font-extrabold transition sm:px-2 sm:text-[12px] ${
              active
                ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <span className="inline-flex max-w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap">
              <span className="sm:hidden">{tab.mobileLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className={active ? "text-neutral-500" : "text-neutral-400"}>
                {tab.count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CampaignSortSelect({
  value,
  options,
  ariaLabel = "캠페인 정렬",
  onChange,
}: {
  value: CampaignSort;
  options: Array<{ label: string; value: CampaignSort }>;
  ariaLabel?: string;
  onChange: (value: CampaignSort) => void;
}) {
  return (
    <FilterSelectControl
      value={serializeCampaignSort(value)}
      options={options.map((option) => ({
        value: serializeCampaignSort(option.value),
        label: option.label,
      }))}
      onChange={(nextValue) => onChange(parseCampaignSort(nextValue, value))}
      ariaLabel={ariaLabel}
      leadingIcon={
        <ArrowUpDown
          className="h-3.5 w-3.5 text-neutral-500"
          strokeWidth={2}
        />
      }
      className="w-[178px] shrink-0"
      triggerClassName="h-8 text-[11px]"
      menuClassName="min-w-[178px]"
    />
  );
}

function AppliedCampaignFilters({
  query,
  statusFilter,
  openId,
  onOpenChange,
  onQueryChange,
  onStatusFilterChange,
}: {
  query: string;
  statusFilter: ApplicationStatusFilter;
  openId: string | null;
  onOpenChange: (value: string | null) => void;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: ApplicationStatusFilter) => void;
}) {
  return (
    <div className="grid gap-2 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="신청한 캠페인 검색"
          placeholder="브랜드, 캠페인 검색"
          className="h-9 w-full rounded-[8px] border border-neutral-200 bg-white pl-10 pr-3 text-[12px] font-bold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950"
        />
      </div>
      <CampaignApplicationStatusFilterList
        id="influencer-applied-status"
        openId={openId}
        onOpenChange={onOpenChange}
        value={statusFilter}
        onChange={onStatusFilterChange}
      />
    </div>
  );
}

function AppliedCampaignList({
  applications,
  focusedCampaignId,
  sortState,
  onSortChange,
}: {
  applications: MarketplaceMessageThread[];
  focusedCampaignId?: string;
  sortState: CampaignSort;
  onSortChange: (value: CampaignSort) => void;
}) {
  useEffect(() => {
    if (!focusedCampaignId) return;
    const row = document.getElementById(
      `campaign-application-${encodeURIComponent(focusedCampaignId)}`,
    );
    row?.scrollIntoView({ block: "center" });
  }, [applications, focusedCampaignId]);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="hidden grid-cols-[minmax(170px,0.48fr)_minmax(320px,1fr)_132px_132px_132px] border-b border-neutral-200 bg-[#f8faf7] px-4 py-3 lg:grid">
        <CampaignColumnHeader
          label="브랜드"
          sortKey="brand"
          sortState={sortState}
          onSortChange={onSortChange}
        />
        <CampaignColumnHeader
          label="캠페인"
          sortKey="title"
          sortState={sortState}
          onSortChange={onSortChange}
        />
        <CampaignColumnHeader
          label="상태"
          sortKey="status"
          sortState={sortState}
          onSortChange={onSortChange}
        />
        <CampaignColumnHeader
          label="신청일"
          sortKey="appliedAt"
          sortState={sortState}
          onSortChange={onSortChange}
          align="right"
        />
        <span className="sr-only">액션</span>
      </div>
      <div
        data-campaign-scroll-region="applied"
        className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto overscroll-contain"
      >
        {applications.map((application) => (
          <div key={application.id}>
            <AppliedCampaignRow
              application={application}
              focused={application.campaignId === focusedCampaignId}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function CampaignColumnHeader({
  label,
  sortKey,
  sortState,
  onSortChange,
  align = "left",
}: {
  label: string;
  sortKey: CampaignSortKey;
  sortState: CampaignSort;
  onSortChange: (value: CampaignSort) => void;
  align?: "left" | "right";
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
    <div
      className={`flex h-7 min-w-0 items-center gap-1.5 ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <span
        className={`truncate text-[12px] font-black tracking-[-0.01em] ${
          active ? "text-neutral-950" : "text-neutral-700"
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() =>
          onSortChange({
            key: sortKey,
            direction:
              active && sortState.direction === "asc" ? "desc" : "asc",
          })
        }
        aria-label={`${label} ${nextDirection} 정렬`}
        title={`${label} ${nextDirection} 정렬`}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] transition-colors ${
          active
            ? "bg-white text-neutral-950 ring-1 ring-neutral-300 shadow-sm"
            : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        }`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
    </div>
  );
}

function AppliedCampaignRow({
  application,
  focused = false,
}: {
  application: MarketplaceMessageThread;
  focused?: boolean;
}) {
  const displayStatus =
    getMarketplaceCampaignApplicationCustomerStatus(application);
  const statusMeta = applicationStatusMeta[displayStatus];
  const title = formatAppliedCampaignTitle(application);

  return (
    <article
      id={
        application.campaignId
          ? `campaign-application-${encodeURIComponent(application.campaignId)}`
          : undefined
      }
      className={`grid gap-3 px-4 py-3 transition lg:grid-cols-[minmax(170px,0.48fr)_minmax(320px,1fr)_132px_132px_132px] lg:items-center ${
        focused
          ? "bg-blue-50/70 ring-1 ring-inset ring-blue-200"
          : "hover:bg-[#f8faf7]"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-[14px] font-extrabold text-neutral-950">
          {application.targetName || application.counterpartName}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-extrabold text-neutral-950" title={title}>
          {title}
        </p>
      </div>
      <span
        className={`inline-flex h-7 w-fit items-center rounded-md border px-2 text-[11px] font-extrabold ${statusMeta.className}`}
      >
        {statusMeta.label}
      </span>
      <p className="text-right text-[12px] font-semibold tabular-nums text-neutral-500">
        {formatMarketplaceMessageDate(application.createdAt)}
      </p>
      <div className="flex justify-start lg:justify-end">
        {application.convertedContractId ? (
          <Link
            to={`/contract/${application.convertedContractId}`}
            className="inline-flex h-9 w-[96px] items-center justify-center rounded-md bg-blue-600 text-[12px] font-semibold text-white transition hover:bg-blue-700"
          >
            계약 검토
          </Link>
        ) : application.status === "declined" || application.status === "closed" ? (
          <span
            aria-label="추가 액션 없음"
            className="inline-flex h-9 w-[96px] items-center justify-center text-[12px] font-semibold text-neutral-400"
          >
            —
          </span>
        ) : (
          <span className="inline-flex h-9 w-[96px] items-center justify-center rounded-md border border-neutral-200 bg-white text-[12px] font-semibold text-neutral-500">
            대기
          </span>
        )}
      </div>
    </article>
  );
}

function isInfluencerCampaignApplication(thread: MarketplaceMessageThread) {
  return isCampaignApplicationThread(thread);
}

function isCampaignApplicationThread(thread: MarketplaceMessageThread) {
  return thread.direction === "influencer_to_brand" && Boolean(thread.campaignId);
}

function formatAppliedCampaignTitle(application: MarketplaceMessageThread) {
  if (application.campaignTitle) return application.campaignTitle;

  const summary = application.proposalSummary;
  const startToken = "캠페인 신청:";
  const startIndex = summary.indexOf(startToken);
  if (startIndex < 0) return summary.split(/[.。]/u)[0]?.trim() || "캠페인";

  const valueStart = startIndex + startToken.length;
  const stopTokens = [
    "가이드라인:",
    "지역:",
    "모집 설명:",
    "지역/진행방식:",
    "제공상품:",
    "참여 미션:",
    "모집인원:",
    "지급내용:",
    "콘텐츠:",
    "산출물:",
    "플랫폼:",
    "제출마감일:",
    "콘텐츠 마감일:",
    "업로드 마감일:",
    "모집마감일:",
  ];
  const nextStopIndex = stopTokens
    .map((token) => summary.indexOf(token, valueStart))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const raw =
    nextStopIndex === undefined
      ? summary.slice(valueStart)
      : summary.slice(valueStart, nextStopIndex);

  return raw.replace(/\s+/g, " ").trim() || "캠페인";
}

function serializeCampaignSort(sort: CampaignSort) {
  return `${sort.key}:${sort.direction}`;
}

function parseCampaignSort(value: string, fallback: CampaignSort): CampaignSort {
  const [key, direction] = value.split(":");
  if (!isCampaignSortKey(key) || !isCampaignSortDirection(direction)) {
    return fallback;
  }

  return { key, direction };
}

function isCampaignSortKey(value: string | undefined): value is CampaignSortKey {
  return [
    "deadline",
    "brand",
    "title",
    "applicant",
    "payment",
    "platform",
    "type",
    "status",
    "followers",
    "appliedAt",
  ].includes(value ?? "");
}

function isCampaignSortDirection(
  value: string | undefined,
): value is CampaignSortDirection {
  return value === "asc" || value === "desc";
}

function compareMarketplaceCampaignPostsBySort(
  a: MarketplaceCampaignPost,
  b: MarketplaceCampaignPost,
  sort: CampaignSort,
) {
  let result: number;

  switch (sort.key) {
    case "deadline":
      result = compareOptionalDateValues(a.deadline, b.deadline);
      break;
    case "brand":
      result = compareText(a.brandName, b.brandName);
      break;
    case "title":
      result = compareText(a.title, b.title);
      break;
    case "payment":
      result = compareAmountValues(a.budget, b.budget);
      break;
    case "platform":
      result = compareText(
        (a.platforms ?? []).map((platform) => platformLabels[platform]).join(" "),
        (b.platforms ?? []).map((platform) => platformLabels[platform]).join(" "),
      );
      break;
    case "type":
      result = compareText(a.typeLabel, b.typeLabel);
      break;
    default:
      result = compareOptionalDateValues(a.updatedAt, b.updatedAt);
      break;
  }

  if (result === 0) result = compareText(a.title, b.title);

  return sort.direction === "asc" ? result : -result;
}

function distributeCampaignsByBrand(campaigns: MarketplaceCampaignPost[]) {
  const brandQueues = new Map<string, MarketplaceCampaignPost[]>();
  const brandOrder: string[] = [];

  for (const campaign of campaigns) {
    const key = getMarketplaceBrandDisplayFamilyKey({
      handle: campaign.brandHandle,
      displayName: campaign.brandName,
    });
    const queue = brandQueues.get(key);
    if (queue) {
      queue.push(campaign);
      continue;
    }

    brandQueues.set(key, [campaign]);
    brandOrder.push(key);
  }

  const distributed: MarketplaceCampaignPost[] = [];
  let hasRemaining = true;

  while (hasRemaining) {
    hasRemaining = false;

    for (const brand of brandOrder) {
      const nextCampaign = brandQueues.get(brand)?.shift();
      if (!nextCampaign) continue;
      distributed.push(nextCampaign);
      hasRemaining = true;
    }
  }

  return distributed;
}

function compareAppliedCampaignApplicationsBySort(
  a: MarketplaceMessageThread,
  b: MarketplaceMessageThread,
  sort: CampaignSort,
) {
  let result: number;

  switch (sort.key) {
    case "brand":
      result = compareText(
        a.targetName || a.counterpartName,
        b.targetName || b.counterpartName,
      );
      break;
    case "title":
      result = compareText(formatAppliedCampaignTitle(a), formatAppliedCampaignTitle(b));
      break;
    case "status":
      result =
        applicationStatusFilterOptions.indexOf(
          getMarketplaceCampaignApplicationCustomerStatus(a),
        ) -
        applicationStatusFilterOptions.indexOf(
          getMarketplaceCampaignApplicationCustomerStatus(b),
        );
      break;
    case "appliedAt":
    default:
      result = compareOptionalDateValues(a.createdAt, b.createdAt);
      break;
  }

  if (result === 0) {
    result = compareText(formatAppliedCampaignTitle(a), formatAppliedCampaignTitle(b));
  }

  return sort.direction === "asc" ? result : -result;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
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

function compareAmountValues(a?: string | null, b?: string | null) {
  const amountA = getAmountSortMeta(a);
  const amountB = getAmountSortMeta(b);

  if (amountA.kind !== amountB.kind) {
    return amountA.kind === "fixed" ? -1 : 1;
  }

  if (Number.isFinite(amountA.value) && Number.isFinite(amountB.value)) {
    return amountA.value - amountB.value;
  }
  if (Number.isFinite(amountA.value)) return -1;
  if (Number.isFinite(amountB.value)) return 1;
  return compareText(amountA.label, amountB.label);
}

function getAmountSortMeta(value?: string | null) {
  const label = value?.trim() || "";
  const raw = label.replace(/,/g, "").toLowerCase();
  const kind = /%|commission|수수료|판매\s*수익/.test(raw)
    ? "commission"
    : "fixed";
  const percentMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/);

  if (kind === "commission") {
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


function CampaignFilterToggleButton({
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
      data-product-tour="influencer-campaign-filters"
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controlsId}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-neutral-200 bg-white px-2.5 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
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
  );
}

function formatCampaignCategoryFilterSummary(categories: string[]) {
  return categories.length <= 2 ? categories.join(", ") : `카테고리 ${categories.length}개`;
}

type CampaignFilterListOption<T extends string> = {
  value: T;
  label: string;
};

type CampaignFilterListDisclosureProps = {
  id: string;
  openId: string | null;
  onOpenChange: (value: string | null) => void;
};

function CampaignPlatformFilterList({
  id,
  openId,
  onOpenChange,
  value,
  onChange,
}: {
  value: PlatformFilter;
  onChange: (value: PlatformFilter) => void;
} & CampaignFilterListDisclosureProps) {
  const options = platformOptions.map((platform) => ({
    value: platform,
    label: platform === "all" ? "전체" : platformLabels[platform],
  }));

  return (
    <CampaignFilterListSection
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

function CampaignProposalTypeFilterList({
  id,
  openId,
  onOpenChange,
  value,
  onChange,
}: {
  value: ProposalTypeFilter;
  onChange: (value: ProposalTypeFilter) => void;
} & CampaignFilterListDisclosureProps) {
  const options = proposalTypeFilterOptions.map((type) => ({
    value: type,
    label: type === "all" ? "전체" : proposalTypeLabels[type],
  }));

  return (
    <CampaignFilterListSection
      id={id}
      openId={openId}
      onOpenChange={onOpenChange}
      label="형태"
      summary={value === "all" ? "전체" : proposalTypeLabels[value]}
      options={options}
      selectedValues={[value]}
      closeOnSelect
      onSelect={onChange}
    />
  );
}

function CampaignApplicationStatusFilterList({
  id,
  openId,
  onOpenChange,
  value,
  onChange,
}: {
  value: ApplicationStatusFilter;
  onChange: (value: ApplicationStatusFilter) => void;
} & CampaignFilterListDisclosureProps) {
  const options = applicationStatusFilterOptions.map((status) => ({
    value: status,
    label: status === "all" ? "전체" : applicationStatusMeta[status].label,
  }));

  return (
    <CampaignFilterListSection
      id={id}
      openId={openId}
      onOpenChange={onOpenChange}
      label="상태"
      summary={value === "all" ? "전체" : applicationStatusMeta[value].label}
      options={options}
      selectedValues={[value]}
      closeOnSelect
      onSelect={onChange}
    />
  );
}

function CampaignCategoryFilterList({
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
} & CampaignFilterListDisclosureProps) {
  const selected = new Set(values);
  const options = categories.map((category) => ({
    value: category,
    label: category,
  }));

  return (
    <CampaignFilterListSection
      id={id}
      openId={openId}
      onOpenChange={onOpenChange}
      label="카테고리"
      summary={
        values.length > 0 ? formatCampaignCategoryFilterSummary(values) : "전체"
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

function CampaignFilterListSection<T extends string>({
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
  options: Array<CampaignFilterListOption<T>>;
  selectedValues: T[];
  onSelect: (value: T) => void;
  onClear?: () => void;
  closeOnSelect?: boolean;
}) {
  const open = openId === id;
  const selected = new Set<T>(selectedValues);
  const isClearSelected = Boolean(onClear) && selectedValues.length === 0;
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const closeList = () => {
      onOpenChange(null);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeList();
    };
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target)) return;
      onOpenChange(null);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onOpenChange, open]);

  return (
    <section
      ref={rootRef}
      className="min-w-0 overflow-hidden rounded-[10px] border border-neutral-200 bg-white"
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(open ? null : id)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-listbox`}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-3 px-3 text-left transition hover:bg-neutral-50"
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
          id={`${id}-listbox`}
          role="listbox"
          aria-multiselectable={!closeOnSelect || undefined}
          className="max-h-56 overflow-y-auto border-t border-neutral-100 p-1"
        >
          {onClear ? (
            <CampaignFilterListOptionButton
              label="전체"
              selected={isClearSelected}
              onClick={() => {
                onClear();
                if (closeOnSelect) onOpenChange(null);
              }}
            />
          ) : null}
          {options.map((option) => (
            <CampaignFilterListOptionButton
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

function CampaignFilterListOptionButton({
  label,
  onClick,
  selected,
}: {
  key?: string;
  label: string;
  onClick: () => void;
  selected: boolean;
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
          : "text-neutral-600 hover:bg-[#f6f8f6] hover:text-neutral-950"
      }`}
    >
      <span className="truncate">{label}</span>
      {selected ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" strokeWidth={2.4} />
      ) : null}
    </button>
  );
}

function dedupeCampaignsByBrandIdentity(campaigns: MarketplaceCampaignPost[]) {
  const brandHandleByIdentity = new Map<string, string>();

  return campaigns.filter((campaign) => {
    const identity = [
      campaign.brandName,
      campaign.brandCategory,
    ]
      .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
      .join("|");
    const firstBrandHandle = brandHandleByIdentity.get(identity);

    if (!firstBrandHandle) {
      brandHandleByIdentity.set(identity, campaign.brandHandle);
      return true;
    }

    return firstBrandHandle === campaign.brandHandle;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("File could not be read"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read"));
    reader.readAsDataURL(file);
  });
}

function PanelState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <section className="flex min-h-[240px] items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-neutral-500 ring-1 ring-neutral-200">
          {icon}
        </div>
        <h2 className="mt-4 text-[15px] font-extrabold text-neutral-950">
          {title}
        </h2>
        {body ? (
          <p className="mt-2 text-[13px] font-bold leading-5 text-neutral-500">
            {body}
          </p>
        ) : null}
      </div>
    </section>
  );
}
