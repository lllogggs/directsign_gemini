import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  BadgeCheck,
  BookOpen,
  ChevronDown,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileSignature,
  FileText,
  Globe2,
  Instagram,
  KeyRound,
  LogOut,
  Mail,
  Megaphone,
  MessageSquareText,
  Music2,
  RefreshCw,
  Save,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  X,
  Youtube,
} from "lucide-react";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { LEGAL_CONTACT_EMAIL } from "../../domain/legalEntity";
import type {
  InfluencerDashboardActivityEvent,
  InfluencerDashboardApplication,
  InfluencerDashboardApplicationStage,
  InfluencerDashboardContract,
  InfluencerDashboardContractStage,
  InfluencerDashboardResponse,
} from "../../domain/influencerDashboard";
import { buildLoginRedirect } from "../../domain/navigation";
import {
  formatContractTitleForDisplay,
  formatMoneyLabel,
  formatPublicContactValue,
  formatPublicHandleValue,
  removeInternalTestLabel,
} from "../../domain/display";
import {
  proposalTypeLabels,
  type CampaignProposalType,
} from "../../domain/marketplace";
import {
  buildDefaultPublicProfileSettings,
  buildPublicProfileSettingsFromForm,
  formatInfluencerPublicProfileUrl,
  getAutomaticPublicProfileHandle,
  getInfluencerPublicProfilePath,
  getPublicProfileHandleError,
  normalizePublicProfileHandle,
  type InfluencerPublicProfileResponse,
  type InfluencerPublicProfileSettings,
} from "../../domain/publicInfluencerProfile";
import { translateApiErrorMessage } from "../../domain/userMessages";
import type { InfluencerPlatform, VerificationStatus } from "../../domain/verification";
import { useMarketplaceMessageSummary } from "../../hooks/useMarketplaceMessageSummary";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; dashboard: InfluencerDashboardResponse }
  | { status: "error"; message: string };

type PublicProfileSavePayload = InfluencerPublicProfileSettings & {
  alternateHandle?: string;
};

type PublicProfileSaveError = Error & {
  code?: string;
  handle?: string;
  profileUrl?: string;
  suggestedHandles?: string[];
  canCustomizeHandle?: boolean;
};

type PlatformFilter = "all" | InfluencerPlatform;
type AmountFilter = "all" | "fixed" | "commission";
type ActualAmountKind = Exclude<AmountFilter, "all">;
type InfluencerApplicationWorkStage =
  | "application_submitted"
  | "application_reviewed"
  | "application_accepted"
  | "application_closed";
type InfluencerWorkStage =
  | InfluencerDashboardContractStage
  | InfluencerApplicationWorkStage;
type DetailStageFilter = "all" | InfluencerWorkStage;
type DeadlineFilter = "all" | "overdue" | "this_week" | "later" | "none";
type InfluencerCampaignLifecycle =
  | "APPLIED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REJECTED";
type SortKey =
  | "updated"
  | "platform"
  | "advertiser"
  | "title"
  | "amount"
  | "stage"
  | "deadline";
type SortDirection = "asc" | "desc";
type ContractSort = {
  key: SortKey;
  direction: SortDirection;
};
type AppliedFilter = {
  id: string;
  label: string;
  onRemove: () => void;
};
type InfluencerAccountSummary = {
  name: string;
  email?: string;
};
type InfluencerCampaignWorkItem = {
  id: string;
  kind: "contract" | "application";
  lifecycle: InfluencerCampaignLifecycle;
  title: string;
  advertiser_name: string;
  stage: InfluencerWorkStage;
  stage_label: string;
  next_action_label: string;
  action_label: string;
  action_href: string;
  platform_labels: string[];
  platforms: InfluencerPlatform[];
  platform_accounts: Array<{
    platform: InfluencerPlatform;
    url?: string;
  }>;
  fee_label: string;
  deadline_label: string;
  due_at?: string;
  updated_at: string;
  deliverable_summary: {
    total: number;
    submitted: number;
    approved: number;
  };
  activity_events: InfluencerDashboardActivityEvent[];
  source_contract?: InfluencerDashboardContract;
  source_application?: InfluencerDashboardApplication;
};

const STAGE_META: Record<
  InfluencerDashboardContractStage,
  {
    label: string;
    helper: string;
    className: string;
    icon: React.ReactNode;
  }
> = {
  review_needed: {
    label: "검토 필요",
    helper: "조항 확인",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: <FileText className="h-4 w-4" />,
  },
  change_pending: {
    label: "수정 협의",
    helper: "응답 대기",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: <Clock3 className="h-4 w-4" />,
  },
  ready_to_sign: {
    label: "서명 준비",
    helper: "인증 후 서명",
    className: "border-neutral-200 bg-white text-neutral-700",
    icon: <FileSignature className="h-4 w-4" />,
  },
  deliverables_due: {
    label: "컨텐츠 제출",
    helper: "컨텐츠 제출 링크",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: <FileCheck2 className="h-4 w-4" />,
  },
  deliverables_review: {
    label: "검수 대기",
    helper: "광고주 확인",
    className: "border-neutral-200 bg-white text-neutral-700",
    icon: <Clock3 className="h-4 w-4" />,
  },
  signed: {
    label: "완료",
    helper: "보관됨",
    className: "border-neutral-200 bg-white text-neutral-700",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  completed: {
    label: "완료",
    helper: "검수 완료",
    className: "border-neutral-200 bg-white text-neutral-700",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  waiting: {
    label: "대기",
    helper: "진행 전",
    className: "border-neutral-200 bg-neutral-50 text-neutral-600",
    icon: <Clock3 className="h-4 w-4" />,
  },
};

const getStageMeta = (stage: InfluencerDashboardContractStage) => ({
  ...STAGE_META[stage],
  ...(stage === "signed"
    ? { label: "서명 완료", helper: "이행 관리" }
    : stage === "completed"
      ? { label: "검수 완료", helper: "보관됨" }
      : {}),
});

const APPLICATION_STAGE_META: Record<
  InfluencerApplicationWorkStage,
  {
    label: string;
    helper: string;
    className: string;
    icon: React.ReactNode;
  }
> = {
  application_submitted: {
    label: "지원 접수",
    helper: "광고주 검토 대기",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: <Clock3 className="h-4 w-4" />,
  },
  application_reviewed: {
    label: "검토 중",
    helper: "메시지 확인",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: <MessageSquareText className="h-4 w-4" />,
  },
  application_accepted: {
    label: "수락 완료",
    helper: "계약 확인",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  application_closed: {
    label: "미선정",
    helper: "결과 보관",
    className: "border-neutral-200 bg-neutral-100 text-neutral-600",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
};

const getWorkStageMeta = (stage: InfluencerWorkStage) => {
  if (stage.startsWith("application_")) {
    return APPLICATION_STAGE_META[stage as InfluencerApplicationWorkStage];
  }

  return getStageMeta(stage as InfluencerDashboardContractStage);
};

const PLATFORM_FILTERS: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const AMOUNT_FILTERS: AmountFilter[] = ["all", "fixed", "commission"];

const DETAIL_STAGE_FILTERS: DetailStageFilter[] = [
  "all",
  "application_submitted",
  "application_reviewed",
  "application_accepted",
  "review_needed",
  "change_pending",
  "ready_to_sign",
  "deliverables_due",
  "deliverables_review",
  "signed",
  "completed",
  "application_closed",
];

const DEADLINE_FILTERS: DeadlineFilter[] = [
  "all",
  "overdue",
  "this_week",
  "later",
  "none",
];

const INFLUENCER_LIFECYCLE_TABS: Array<{
  value: InfluencerCampaignLifecycle;
  label: string;
}> = [
  { value: "APPLIED", label: "지원중" },
  { value: "IN_PROGRESS", label: "진행중" },
  { value: "COMPLETED", label: "완료" },
  { value: "REJECTED", label: "미선정" },
];

const PROFILE_PROPOSAL_TYPES = Object.entries(proposalTypeLabels) as Array<
  [CampaignProposalType, string]
>;

const PLATFORM_META: Record<
  InfluencerPlatform,
  {
    label: string;
    className: string;
    icon: React.ReactNode;
  }
> = {
  instagram: {
    label: "인스타그램",
    className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    icon: <Instagram className="h-3.5 w-3.5" />,
  },
  youtube: {
    label: "유튜브",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: <Youtube className="h-3.5 w-3.5" />,
  },
  tiktok: {
    label: "틱톡",
    className: "border-neutral-800 bg-neutral-950 text-white",
    icon: <Music2 className="h-3.5 w-3.5" />,
  },
  naver_blog: {
    label: "네이버 블로그",
    className: "border-neutral-200 bg-white text-neutral-700",
    icon: <BookOpen className="h-3.5 w-3.5" />,
  },
  other: {
    label: "기타",
    className: "border-neutral-200 bg-white text-neutral-600",
    icon: <Globe2 className="h-3.5 w-3.5" />,
  },
};

const VERIFICATION_META: Record<
  VerificationStatus,
  {
    label: string;
    helper: string;
    className: string;
  }
> = {
  not_submitted: {
    label: "인증 필요",
    helper: "플랫폼 소유 확인 전",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  pending: {
    label: "검토 중",
    helper: "운영자 확인 대기",
    className: "border-neutral-200 bg-white text-neutral-700",
  },
  approved: {
    label: "인증 완료",
    helper: "계약 신뢰 확인됨",
    className: "border-neutral-300 bg-white text-neutral-800",
  },
  rejected: {
    label: "재제출 필요",
    helper: "반려 사유 확인",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const getDashboardErrorMessage = (message?: string) => {
  return translateApiErrorMessage(
    message,
    "인플루언서 대시보드를 불러오지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
  );
};

export function InfluencerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("all");
  const [detailStageFilter, setDetailStageFilter] =
    useState<DetailStageFilter>("all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [selectedCampaignLifecycleFilter, setSelectedCampaignLifecycleFilter] =
    useState<InfluencerCampaignLifecycle | null>(null);
  const [sortState, setSortState] = useState<ContractSort>({
    key: "updated",
    direction: "desc",
  });
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [publicProfileOverride, setPublicProfileOverride] =
    useState<InfluencerPublicProfileSettings | null>(null);
  const {
    summary: messageSummary,
    isLoading: isMessageSummaryLoading,
  } = useMarketplaceMessageSummary("influencer");
  const readyDashboardUserId =
    state.status === "ready" ? state.dashboard.user.id : undefined;

  const loadDashboard = useCallback(async () => {
    setState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    try {
      const response = await apiFetch(
        "/api/influencer/dashboard?includeApplications=false",
        {
          headers: { Accept: "application/json" },
          credentials: "include",
        },
      );

      if (response.status === 401) {
        const currentPath = `${location.pathname}${location.search}`;
        navigate(
          buildLoginRedirect("/login/influencer", currentPath, "/influencer/dashboard", [
            "/influencer",
            "/contract",
          ]),
          { replace: true },
        );
        return;
      }

      const data = (await response.json()) as
        | InfluencerDashboardResponse
        | { authenticated?: false; error?: string };

      if ("authenticated" in data && data.authenticated === false) {
        const currentPath = `${location.pathname}${location.search}`;
        navigate(
          buildLoginRedirect("/login/influencer", currentPath, "/influencer/dashboard", [
            "/influencer",
            "/contract",
          ]),
          { replace: true },
        );
        return;
      }

      if (!response.ok || !("authenticated" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(errorMessage ?? "인플루언서 대시보드를 불러오지 못했습니다.");
      }

      setState({ status: "ready", dashboard: data });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? getDashboardErrorMessage(error.message)
            : "인플루언서 대시보드를 불러오지 못했습니다.",
      });
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    if (state.status !== "ready") return;

    let active = true;
    const timer = window.setTimeout(() => {
      void apiFetch("/api/influencer/public-profile", {
        headers: { Accept: "application/json" },
        credentials: "include",
      })
        .then(async (response) => {
          if (!response.ok) return undefined;
          return (await response.json()) as InfluencerPublicProfileResponse;
        })
        .then((data) => {
          if (!active || !data?.profile) return;
          setPublicProfileOverride(data.profile);
        })
        .catch(() => {
          if (active) setPublicProfileOverride(null);
        });
    }, 900);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [readyDashboardUserId, state.status]);

  useEffect(() => {
    if (state.status !== "ready" || !readyDashboardUserId) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void apiFetch("/api/influencer/dashboard/applications", {
        headers: { Accept: "application/json" },
        credentials: "include",
      })
        .then(async (response) => {
          if (!response.ok) return undefined;
          return (await response.json()) as Pick<
            InfluencerDashboardResponse,
            "applications"
          >;
        })
        .then((data) => {
          if (!active || !data?.applications) return;
          setState((current) => {
            if (
              current.status !== "ready" ||
              current.dashboard.user.id !== readyDashboardUserId
            ) {
              return current;
            }

            return {
              status: "ready",
              dashboard: {
                ...current.dashboard,
                applications: data.applications,
              },
            };
          });
        })
        .catch(() => undefined);
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [readyDashboardUserId, state.status]);

  if (state.status === "loading") {
    return <DashboardShell><LoadingView /></DashboardShell>;
  }

  if (state.status === "error") {
    return (
      <DashboardShell>
        <ErrorView
          message={state.message}
          onRetry={loadDashboard}
          onLogin={() =>
            navigate(
              buildLoginRedirect(
                "/login/influencer",
                `${location.pathname}${location.search}`,
                "/influencer/dashboard",
                ["/influencer", "/contract"],
              ),
              { replace: true },
            )
          }
        />
      </DashboardShell>
    );
  }

  const dashboard = state.dashboard;
  const normalizedQuery = query.trim().toLowerCase();
  const campaignItems = buildInfluencerCampaignWorkItems(dashboard);
  const visibleCampaignItems = campaignItems;
  const lifecycleCounts = getInfluencerLifecycleCounts(visibleCampaignItems);
  const campaignLifecycleFilter =
    selectedCampaignLifecycleFilter ??
    INFLUENCER_LIFECYCLE_TABS.find((tab) => lifecycleCounts[tab.value] > 0)
      ?.value ??
    "APPLIED";
  const brandOptions = buildInfluencerBrandFilterOptions(campaignItems);
  const filteredCampaignItems = visibleCampaignItems
    .filter((item) => {
      if (detailStageFilter !== "all" && item.stage !== detailStageFilter) {
        return false;
      }
      const advertiserName = removeInternalTestLabel(
        item.advertiser_name,
        "광고주",
      );
      if (brandFilter !== "all" && advertiserName !== brandFilter) {
        return false;
      }
      if (
        platformFilter !== "all" &&
        !getInfluencerCampaignItemPlatforms(item).includes(platformFilter)
      ) {
        return false;
      }
      if (
        amountFilter !== "all" &&
        getAmountFilterKind(item.fee_label) !== amountFilter
      ) {
        return false;
      }
      if (!matchesDeadlineFilter(item, deadlineFilter)) {
        return false;
      }
      if (item.lifecycle !== campaignLifecycleFilter) {
        return false;
      }
      if (!normalizedQuery) return true;

      return formatDashboardContractTitle(item.title)
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((a, b) => compareCampaignItemsBySort(a, b, sortState));
  const verification = VERIFICATION_META[dashboard.verification.status];
  const accountSummary: InfluencerAccountSummary = {
    name: removeInternalTestLabel(dashboard.user.name, "인플루언서 계정"),
    email: formatPublicContactValue(dashboard.user.email) || undefined,
  };
  const publicProfile =
    publicProfileOverride?.ownerId === dashboard.user.id
      ? publicProfileOverride
      : buildDefaultPublicProfileSettings(dashboard);
  const activeContractForVerification = dashboard.contracts.find(
    (contract) => contract.stage !== "signed",
  );
  const hasVerificationRecord =
    dashboard.verification.status !== "not_submitted" ||
    dashboard.verification.approved_platforms.length > 0;
  const showVerificationAction =
    Boolean(activeContractForVerification) ||
    dashboard.summary.verification_needed ||
    hasVerificationRecord;
  const handleSortChange = (key: SortKey) => {
    setSortState((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/influencer/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] influencer logout request failed`, error);
    } finally {
      navigate("/login/influencer", { replace: true });
    }
  };

  return (
    <DashboardShell>
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/influencer/dashboard")}
            className="flex h-10 min-w-10 shrink-0 items-center gap-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="font-neo-heavy hidden text-[18px] leading-none sm:inline">{PRODUCT_NAME}</span>
            <span className="max-w-[104px] truncate text-[12px] font-extrabold leading-none text-neutral-700 sm:hidden">
              인플루언서 · 내 캠페인
            </span>
          </button>

          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            <button
              type="button"
              onClick={() => navigate("/influencer/dashboard")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] bg-neutral-950 px-0 text-[12px] font-extrabold text-white shadow-[0_10px_24px_rgba(23,26,23,0.14)] transition hover:bg-neutral-800 sm:w-auto sm:px-3"
              aria-label="내 캠페인"
              title="내 캠페인"
            >
              <FileText className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">내 캠페인</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/influencer/campaigns")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-0 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 sm:w-auto sm:px-2.5"
              aria-label="캠페인 찾기"
              title="캠페인 찾기"
            >
              <Megaphone className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">캠페인 찾기</span>
            </button>
            <MessageCenterButton
              unreadCount={messageSummary.unreadCount}
              isLoading={isMessageSummaryLoading}
              onClick={() => navigate("/influencer/messages")}
            />
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-0 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 sm:w-auto sm:px-2.5"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <InfluencerAccountSettingsMenu
              account={accountSummary}
              open={accountMenuOpen}
              onToggle={() => setAccountMenuOpen((current) => !current)}
              onChangePassword={() => {
                setAccountMenuOpen(false);
                navigate("/reset-password?role=influencer");
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-2.5 sm:px-5 lg:flex lg:h-[calc(100vh-48px)] lg:flex-col lg:overflow-hidden lg:px-6">
        <section className="min-w-0 overflow-hidden rounded-[10px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.055)] lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
                <h1 className="truncate text-[17px] font-bold text-[#171a17]">
                  내 캠페인
                </h1>
              </div>
              <span className={`inline-flex h-8 items-center rounded-[8px] border px-3 text-[12px] font-semibold ${verification.className}`}>
                {verification.label}
              </span>
            </div>
          </div>

          <InfluencerAccountBanner
            dashboard={dashboard}
            verification={verification}
            showVerificationAction={showVerificationAction}
            onVerify={() =>
              navigate(
                activeContractForVerification?.verification_href ??
                  "/influencer/verification",
              )
            }
            onOpenPublicProfile={() => {
              if (publicProfile.published) {
                navigate(getInfluencerPublicProfilePath(publicProfile.handle));
              }
            }}
            publicProfile={publicProfile}
            onEditPublicProfile={() => setProfileSettingsOpen(true)}
          />

          <div className="min-w-0 p-2.5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <ContractTable
              items={filteredCampaignItems}
              totalItems={visibleCampaignItems.length}
              lifecycleFilter={campaignLifecycleFilter}
              lifecycleCounts={lifecycleCounts}
              onLifecycleFilterChange={(value) => {
                setSelectedCampaignLifecycleFilter(value);
                setDetailStageFilter("all");
                setDeadlineFilter("all");
              }}
              query={query}
              onQueryChange={setQuery}
              platformFilter={platformFilter}
              onPlatformFilterChange={setPlatformFilter}
              brandFilter={brandFilter}
              onBrandFilterChange={setBrandFilter}
              brandOptions={brandOptions}
              amountFilter={amountFilter}
              onAmountFilterChange={setAmountFilter}
              detailStageFilter={detailStageFilter}
              onDetailStageFilterChange={setDetailStageFilter}
              deadlineFilter={deadlineFilter}
              onDeadlineFilterChange={setDeadlineFilter}
              sortState={sortState}
              onSortChange={handleSortChange}
              onOpen={(item) => { void navigate(item.action_href); }}
            />
          </div>
        </section>
      </main>

      {profileSettingsOpen ? (
        <PublicProfileSettingsDialog
          dashboard={dashboard}
          initialProfile={publicProfile}
          onClose={() => setProfileSettingsOpen(false)}
          onSave={async (profile) => {
            const response = await apiFetch("/api/influencer/public-profile", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(profile),
            });

            if (!response.ok) {
              const data = (await response.json().catch(() => ({}))) as {
                error?: string;
                code?: string;
                handle?: string;
                profile_url?: string;
                suggested_handles?: string[];
                can_customize_handle?: boolean;
              };
              throw Object.assign(
                new Error(data.error ?? "공개 프로필을 저장하지 못했습니다."),
                {
                  code: data.code,
                  handle: data.handle,
                  profileUrl: data.profile_url,
                  suggestedHandles: data.suggested_handles,
                  canCustomizeHandle: data.can_customize_handle,
                } satisfies Partial<PublicProfileSaveError>,
              );
            }

            const data = (await response.json()) as InfluencerPublicProfileResponse;
            if (!data.profile) {
              throw new Error("저장된 공개 프로필을 확인할 수 없습니다.");
            }

            setPublicProfileOverride(data.profile);
            setProfileSettingsOpen(false);
            return data.profile;
          }}
        />
      ) : null}
    </DashboardShell>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950 lg:h-screen lg:overflow-hidden">
      {children}
    </div>
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
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-0 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 sm:w-auto sm:px-2.5"
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

function InfluencerAccountSettingsMenu({
  account,
  open,
  onToggle,
  onChangePassword,
}: {
  account: InfluencerAccountSummary;
  open: boolean;
  onToggle: () => void;
  onChangePassword: () => void;
}) {
  const emailChangeHref = buildSupportMailtoHref({
    subject: "인플루언서 계정 이메일 변경 요청",
    body: [
      "인플루언서 계정 이메일 변경을 요청합니다.",
      "",
      `현재 표시 이메일: ${account.email ?? "확인 필요"}`,
      `활동명: ${account.name}`,
      "변경할 이메일:",
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
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
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

function LoadingView() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200/80 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_60px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
        <p className="mt-4 text-sm font-semibold text-neutral-950">
          인플루언서 대시보드를 불러오는 중
        </p>
      </div>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
  onLogin,
}: {
  message: string;
  onRetry: () => void;
  onLogin: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-lg border border-neutral-200/80 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_60px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
          <AlertCircle className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-semibold text-neutral-950">{message}</p>
        <p className="mt-2 text-xs font-medium leading-5 text-neutral-500">
          세션이 만료됐으면 로그인 후 같은 대시보드로 돌아옵니다.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onLogin}
            className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800"
          >
            로그인으로 이동
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="h-10 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}

function InfluencerAccountBanner({
  dashboard,
  verification,
  showVerificationAction,
  onVerify,
  onOpenPublicProfile,
  publicProfile,
  onEditPublicProfile,
}: {
  dashboard: InfluencerDashboardResponse;
  verification: (typeof VERIFICATION_META)[VerificationStatus];
  showVerificationAction: boolean;
  onVerify: () => void;
  publicProfile: InfluencerPublicProfileSettings;
  onOpenPublicProfile?: () => void;
  onEditPublicProfile: () => void;
}) {
  const verificationApproved = dashboard.verification.status === "approved";
  const activityPlatforms = Array.from(new Set(dashboard.user.activity_platforms));
  const approvedPlatformList = dedupeApprovedPlatforms(
    dashboard.verification.approved_platforms,
  );
  const approvedPlatforms = approvedPlatformList.slice(0, 2);
  const visibleActivityPlatforms = activityPlatforms.slice(0, 2);
  const platformCount = verificationApproved
    ? approvedPlatformList.length
    : activityPlatforms.length;
  const profileStatusLabel = publicProfile.published
    ? "공개 프로필 활성"
    : publicProfile.handle
      ? "공개 전 프로필"
      : "프로필 준비 필요";

  return (
    <section className="border-b border-[#d9e0d9] bg-[#fcfcfd] px-4 py-2">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-800 ring-1 ring-neutral-200">
            <UserCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-extrabold text-neutral-950">
                {removeInternalTestLabel(dashboard.user.name, "인플루언서 계정")}
              </p>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  showVerificationAction
                    ? verification.className
                    : "border-neutral-200 bg-white text-neutral-700"
                }`}
              >
                {showVerificationAction ? verification.label : "체크 완료"}
              </span>
              <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
                {platformCount > 0
                  ? `${platformCount}개 플랫폼`
                  : "플랫폼 대기"}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4 text-neutral-500">
              {approvedPlatforms.map((platform) => (
                <span
                  key={`${platform.platform}:${platform.handle}`}
                  className="inline-flex max-w-[150px] items-center gap-1.5 truncate rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600"
                >
                  {PLATFORM_META[platform.platform].icon}
                  <span className="truncate">
                    {formatPublicHandleValue(
                      platform.handle,
                      PLATFORM_META[platform.platform].label,
                    )}
                  </span>
                </span>
              ))}
              {approvedPlatforms.length === 0 &&
                visibleActivityPlatforms.map((platform) => (
                  <span
                    key={platform}
                    className="inline-flex max-w-[150px] items-center gap-1.5 truncate rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600"
                  >
                    {PLATFORM_META[platform].icon}
                    <span className="truncate">{PLATFORM_META[platform].label}</span>
                  </span>
                ))}
              <span
                className={`inline-flex max-w-[190px] items-center gap-1.5 truncate rounded-full px-2 py-0.5 font-semibold ${
                  publicProfile.published
                    ? "bg-neutral-100 text-neutral-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                <Globe2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{profileStatusLabel}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showVerificationAction ? (
            <button
              type="button"
              onClick={onVerify}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[12px] font-extrabold transition ${
                verificationApproved
                  ? "border border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"
                  : "bg-neutral-950 text-white hover:bg-neutral-800"
              }`}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {verificationApproved ? "서명 인증 관리" : "서명 인증"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEditPublicProfile}
            className="hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 sm:inline-flex"
          >
            <Settings2 className="h-3.5 w-3.5" />
            프로필 설정
          </button>
          {publicProfile.published && onOpenPublicProfile ? (
            <button
              type="button"
              onClick={onOpenPublicProfile}
              className="hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 sm:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              공개 프로필
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEditPublicProfile}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 sm:hidden"
            aria-label="공개 프로필 설정"
            title="공개 프로필 설정"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function PublicProfileSettingsDialog({
  dashboard,
  initialProfile,
  onClose,
  onSave,
}: {
  dashboard: InfluencerDashboardResponse;
  initialProfile: InfluencerPublicProfileSettings;
  onClose: () => void;
  onSave: (
    profile: PublicProfileSavePayload,
  ) => Promise<InfluencerPublicProfileSettings>;
}) {
  const approvedPlatforms = dedupeApprovedPlatforms(
    dashboard.verification.approved_platforms,
  );
  const automaticHandle = getAutomaticPublicProfileHandle(approvedPlatforms);
  const initialManualHandle =
    automaticHandle &&
    initialProfile.handle &&
    normalizePublicProfileHandle(initialProfile.handle) !== automaticHandle
      ? normalizePublicProfileHandle(initialProfile.handle)
      : "";
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [manualHandleAllowed, setManualHandleAllowed] = useState(
    Boolean(initialManualHandle),
  );
  const [manualHandle, setManualHandle] = useState(initialManualHandle);
  const [conflictHandle, setConflictHandle] = useState<string | undefined>(
    initialManualHandle ? automaticHandle : undefined,
  );
  const [suggestedHandles, setSuggestedHandles] = useState<string[]>([]);
  const [isAppealing, setIsAppealing] = useState(false);
  const [appealMessage, setAppealMessage] = useState<string | undefined>();
  const [form, setForm] = useState({
    displayName: initialProfile.displayName,
    headline: initialProfile.headline,
    bio: initialProfile.bio,
    location: initialProfile.location,
    startingPriceLabel: initialProfile.startingPriceLabel,
    responseTimeLabel: initialProfile.responseTimeLabel,
    brandFit: initialProfile.brandFit.join(", "),
    collaborationTypes: initialProfile.collaborationTypes,
  });
  const automaticHandleError = automaticHandle
    ? getPublicProfileHandleError(automaticHandle)
    : "플랫폼 인증을 완료하면 첫 등록 플랫폼 ID로 프로필 주소가 자동 생성됩니다.";
  const normalizedManualHandle = normalizePublicProfileHandle(manualHandle).replace(
    /\s+/g,
    "_",
  );
  const manualHandleError = manualHandleAllowed
    ? normalizedManualHandle
      ? getPublicProfileHandleError(normalizedManualHandle)
      : "다른 공개 주소를 입력해 주세요."
    : undefined;
  const requiredFilled =
    form.displayName.trim().length > 0 &&
    form.headline.trim().length > 0 &&
    form.bio.trim().length > 0;
  const canSave =
    !automaticHandleError &&
    requiredFilled &&
    (!manualHandleAllowed || !manualHandleError);

  const toggleProposalType = (type: CampaignProposalType) => {
    setForm((current) => {
      const exists = current.collaborationTypes.includes(type);
      return {
        ...current,
        collaborationTypes: exists
          ? current.collaborationTypes.filter((item) => item !== type)
          : [...current.collaborationTypes, type],
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || isSaving) return;

    setIsSaving(true);
    setSaveError(undefined);

    try {
      await onSave({
        ...buildPublicProfileSettingsFromForm(dashboard, form),
        ...(manualHandleAllowed
          ? { alternateHandle: normalizedManualHandle }
          : {}),
      });
    } catch (error) {
      if (error instanceof Error) {
        const profileError = error as PublicProfileSaveError;
        if (
          profileError.code === "public_profile_handle_conflict" &&
          profileError.canCustomizeHandle
        ) {
          setManualHandleAllowed(true);
          setConflictHandle(profileError.handle ?? automaticHandle);
          setSuggestedHandles(profileError.suggestedHandles ?? []);
          if (!manualHandle && profileError.suggestedHandles?.[0]) {
            setManualHandle(profileError.suggestedHandles[0]);
          }
          setAppealMessage(undefined);
        }
      }
      setSaveError(
        error instanceof Error
          ? error.message
          : "공개 프로필을 저장하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAppeal = async () => {
    if (!conflictHandle || isAppealing) return;

    setIsAppealing(true);
    setSaveError(undefined);
    setAppealMessage(undefined);

    try {
      const response = await apiFetch("/api/influencer/public-profile/handle-appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          alternateHandle: normalizedManualHandle || undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        already_submitted?: boolean;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "이의신청을 접수하지 못했습니다.");
      }

      setAppealMessage(
        data.already_submitted
          ? "이미 관리자 검토 대기열에 접수되어 있습니다."
          : "관리자 검토 대기열에 접수했습니다.",
      );
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "이의신청을 접수하지 못했습니다.",
      );
    } finally {
      setIsAppealing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-neutral-950/45 px-0 sm:items-center sm:justify-center sm:px-4">
      <section className="max-h-[94vh] w-full overflow-y-auto rounded-t-[12px] border border-neutral-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:max-w-[760px] sm:rounded-[12px] sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-neutral-500">
              연락미 계정 프로필
            </p>
            <h2 className="mt-1 text-[20px] font-semibold text-neutral-950">
              공개 프로필
            </h2>
            <p className="mt-1 text-[13px] font-medium leading-5 text-neutral-500">
              광고주가 볼 이름, 소개, 협업 조건만 간단히 정리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            닫기
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <section className="rounded-[8px] border border-neutral-200 bg-[#f8faf7] p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[12px] font-semibold text-neutral-500">공개 주소</p>
                <p className="mt-1 break-all text-[13px] font-semibold text-neutral-950">
                  yeollock.me/{manualHandleAllowed
                    ? normalizedManualHandle || suggestedHandles[0] || "creator_id"
                    : automaticHandle ?? "platform-id"}
                </p>
              </div>
              {manualHandleAllowed ? (
                <input
                  value={manualHandle}
                  onChange={(event) => setManualHandle(event.target.value)}
                  placeholder={suggestedHandles[0] ?? "creator_id_2"}
                  aria-label="공개 주소 직접 입력"
                  className="h-10 min-w-0 rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-950 outline-none focus:ring-2 focus:ring-neutral-950/10 sm:w-[240px]"
                />
              ) : null}
            </div>
            {manualHandleAllowed ? (
              <p className="mt-2 text-[12px] font-medium text-neutral-500">
                {manualHandleAllowed && conflictHandle
                  ? `자동 주소 ${formatInfluencerPublicProfileUrl(
                      conflictHandle,
                    )}가 겹쳐 대체 주소를 저장합니다.`
                  : "원하는 공개 주소를 입력할 수 있습니다."}
              </p>
            ) : automaticHandle ? (
              <p className="mt-2 text-[12px] font-medium text-neutral-500">
                첫 등록 플랫폼 ID 기준으로 자동 생성됩니다.
              </p>
            ) : null}
            {(manualHandleAllowed ? manualHandleError : automaticHandleError) ? (
              <p className="mt-2 text-[12px] font-semibold text-rose-700">
                {manualHandleAllowed ? manualHandleError : automaticHandleError}
              </p>
            ) : null}
            {manualHandleAllowed && conflictHandle ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
                <p className="font-semibold">
                  {formatInfluencerPublicProfileUrl(conflictHandle)}가 이미 사용 중입니다.
                </p>
                {suggestedHandles.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedHandles.map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        onClick={() => setManualHandle(handle)}
                        className="h-8 rounded-md border border-amber-200 bg-white px-2.5 font-semibold text-amber-900 transition hover:border-amber-300"
                      >
                        {formatInfluencerPublicProfileUrl(handle)}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAppeal}
                    disabled={isAppealing}
                    className="h-8 rounded-md bg-neutral-950 px-3 font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300"
                  >
                    {isAppealing ? "접수 중" : "이의신청하기"}
                  </button>
                  {appealMessage ? (
                    <span className="font-semibold text-emerald-700">{appealMessage}</span>
                  ) : (
                    <span className="text-amber-800">
                      본인 플랫폼 ID가 맞으면 운영자가 점유 계정을 확인합니다.
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 rounded-[8px] border border-neutral-200 bg-white p-3">
            <p className="text-[13px] font-semibold text-neutral-950">기본 정보</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProfileSettingsField label="활동명">
                <input
                  required
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  className="marketplace-input"
                />
              </ProfileSettingsField>
              <ProfileSettingsField label="활동 지역">
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, location: event.target.value }))
                  }
                  placeholder="예: 서울 · 원격 협업"
                  className="marketplace-input"
                />
              </ProfileSettingsField>
            </div>

            <ProfileSettingsField label="한 줄 소개">
              <input
                required
                value={form.headline}
                onChange={(event) =>
                  setForm((current) => ({ ...current, headline: event.target.value }))
                }
                placeholder="광고주가 첫 화면에서 볼 소개 문구"
                className="marketplace-input"
              />
            </ProfileSettingsField>

            <ProfileSettingsField label="프로필 소개">
              <textarea
                required
                rows={3}
                value={form.bio}
                onChange={(event) =>
                  setForm((current) => ({ ...current, bio: event.target.value }))
                }
                placeholder="주요 컨텐츠, 잘 맞는 브랜드, 협업 방식 등을 적어 주세요."
                className="marketplace-input resize-none"
              />
            </ProfileSettingsField>
          </section>

          <section className="grid gap-3 rounded-[8px] border border-neutral-200 bg-white p-3">
            <p className="text-[13px] font-semibold text-neutral-950">협업 조건</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProfileSettingsField label="협업 단가">
                <input
                  value={form.startingPriceLabel}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startingPriceLabel: event.target.value,
                    }))
                  }
                  placeholder="예: 150만원부터"
                  className="marketplace-input"
                />
              </ProfileSettingsField>
              <ProfileSettingsField label="응답 시간">
                <input
                  value={form.responseTimeLabel}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      responseTimeLabel: event.target.value,
                    }))
                  }
                  placeholder="예: 보통 1영업일 내 응답"
                  className="marketplace-input"
                />
              </ProfileSettingsField>
            </div>

            <ProfileSettingsField label="브랜드 적합 키워드">
              <input
                value={form.brandFit}
                onChange={(event) =>
                  setForm((current) => ({ ...current, brandFit: event.target.value }))
                }
                placeholder="예: 뷰티 신제품, 릴스 리뷰, 사용감 중심"
                className="marketplace-input"
              />
            </ProfileSettingsField>

            <ProfileSettingsField label="받고 싶은 광고 형태">
              <div className="flex flex-wrap gap-2">
                {PROFILE_PROPOSAL_TYPES.map(([type, label]) => {
                  const active = form.collaborationTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleProposalType(type)}
                      className={`inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold transition ${
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
            </ProfileSettingsField>
          </section>

          <section className="rounded-[8px] border border-neutral-200 bg-[#f8faf7] p-3">
            <p className="text-[12px] font-semibold text-neutral-500">인증 플랫폼</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {approvedPlatforms.length > 0 ? (
                approvedPlatforms.map((platform) => (
                  <span
                    key={`${platform.platform}:${platform.handle}`}
                    className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-semibold text-neutral-700"
                  >
                    {PLATFORM_META[platform.platform].icon}
                    <span className="truncate">
                      {formatPublicHandleValue(
                        platform.handle,
                        PLATFORM_META[platform.platform].label,
                      )}
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-[12px] font-medium text-neutral-500">
                  플랫폼 인증을 완료하면 공개 프로필 채널에 자동으로 표시됩니다.
                </span>
              )}
            </div>
          </section>

          {saveError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
              {saveError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-neutral-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-md border border-neutral-200 bg-white px-4 text-[14px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!canSave || isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-[14px] font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "저장 중" : "저장"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProfileSettingsField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-semibold text-neutral-800">{label}</span>
      {children}
      {error ? (
        <span className="text-[12px] font-semibold text-rose-600">{error}</span>
      ) : hint ? (
        <span className="text-[12px] font-medium text-neutral-500">{hint}</span>
      ) : null}
    </div>
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

function EmptyContracts({ hasQuery }: { hasQuery: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {hasQuery ? "조건에 맞는 캠페인이 없습니다" : "아직 내 캠페인이 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {hasQuery
          ? "검색어를 줄이거나 전체로 바꿔보세요."
          : `캠페인에 지원하거나 브랜드가 ${PRODUCT_NAME} 계약을 진행하면 이곳에 표시됩니다.`}
      </p>
    </section>
  );
}

function ContractTable({
  items,
  totalItems,
  lifecycleFilter,
  lifecycleCounts,
  onLifecycleFilterChange,
  query,
  onQueryChange,
  platformFilter,
  onPlatformFilterChange,
  brandFilter,
  onBrandFilterChange,
  brandOptions,
  amountFilter,
  onAmountFilterChange,
  detailStageFilter,
  onDetailStageFilterChange,
  deadlineFilter,
  onDeadlineFilterChange,
  sortState,
  onSortChange,
  onOpen,
}: {
  items: InfluencerCampaignWorkItem[];
  totalItems: number;
  lifecycleFilter: InfluencerCampaignLifecycle;
  lifecycleCounts: Record<InfluencerCampaignLifecycle, number>;
  onLifecycleFilterChange: (value: InfluencerCampaignLifecycle) => void;
  query: string;
  onQueryChange: (value: string) => void;
  platformFilter: PlatformFilter;
  onPlatformFilterChange: (value: PlatformFilter) => void;
  brandFilter: string;
  onBrandFilterChange: (value: string) => void;
  brandOptions: Array<{ value: string; label: string }>;
  amountFilter: AmountFilter;
  onAmountFilterChange: (value: AmountFilter) => void;
  detailStageFilter: DetailStageFilter;
  onDetailStageFilterChange: (value: DetailStageFilter) => void;
  deadlineFilter: DeadlineFilter;
  onDeadlineFilterChange: (value: DeadlineFilter) => void;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
  onOpen: (item: InfluencerCampaignWorkItem) => void;
}) {
  const platformOptions = PLATFORM_FILTERS.map((platform) => ({
    value: platform,
    label: formatPlatformFilterLabel(platform),
  }));
  const amountOptions = AMOUNT_FILTERS.map((amount) => ({
    value: amount,
    label: formatAmountFilterLabel(amount),
  }));
  const stageOptions = DETAIL_STAGE_FILTERS.map((stage) => ({
    value: stage,
    label: formatDetailStageFilterLabel(stage),
  }));
  const deadlineOptions = DEADLINE_FILTERS.map((deadline) => ({
    value: deadline,
    label: formatDeadlineFilterLabel(deadline),
  }));
  const activeFilters = [
    platformFilter !== "all"
      ? {
          id: "platform",
          label:
            platformOptions.find((option) => option.value === platformFilter)?.label ??
            platformFilter,
          onRemove: () => onPlatformFilterChange("all"),
        }
      : null,
    brandFilter !== "all"
      ? {
          id: "brand",
          label:
            brandOptions.find((option) => option.value === brandFilter)?.label ??
            brandFilter,
          onRemove: () => onBrandFilterChange("all"),
        }
      : null,
    amountFilter !== "all"
      ? {
          id: "amount",
          label:
            amountOptions.find((option) => option.value === amountFilter)?.label ??
            amountFilter,
          onRemove: () => onAmountFilterChange("all"),
        }
      : null,
    detailStageFilter !== "all"
      ? {
          id: "stage",
          label:
            stageOptions.find((option) => option.value === detailStageFilter)?.label ??
            detailStageFilter,
          onRemove: () => onDetailStageFilterChange("all"),
        }
      : null,
    deadlineFilter !== "all"
      ? {
          id: "deadline",
          label:
            deadlineOptions.find((option) => option.value === deadlineFilter)?.label ??
            deadlineFilter,
          onRemove: () => onDeadlineFilterChange("all"),
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
  const displayItems = collapseInternalDuplicateContracts(
    items,
    getInfluencerDashboardItemCollapseKey,
  );
  const metricColumnLabel = getInfluencerMetricColumnLabel(lifecycleFilter);
  const dateColumnLabel = getInfluencerDateColumnLabel(lifecycleFilter);

  return (
    <section className="overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <InfluencerLifecycleTabs
        value={lifecycleFilter}
        counts={lifecycleCounts}
        onChange={onLifecycleFilterChange}
      />
      <div className="border-b border-[#d9e0d9] bg-[#fbfbf8]">
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
              계약 목록
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
              {displayItems.length.toLocaleString("ko-KR")}건 표시 · {filterSummary}
            </p>
          </div>
          <InfluencerFilterToggleButton
            open={filtersOpen}
            activeCount={activeFilters.length}
            onClick={() => setFiltersOpen((current) => !current)}
            controlsId="influencer-contract-filters"
          />
        </div>
        <InfluencerAppliedFilterBar
          filters={activeFilters}
          onClearAll={() => {
            onPlatformFilterChange("all");
            onBrandFilterChange("all");
            onAmountFilterChange("all");
            onDetailStageFilterChange("all");
            onDeadlineFilterChange("all");
            onQueryChange("");
          }}
        />
        {filtersOpen ? (
          <div
            id="influencer-contract-filters"
            className="grid gap-2 border-t border-[#edf1ed] bg-[#f8faf7] p-2 lg:grid-cols-[minmax(110px,0.2fr)_minmax(130px,0.22fr)_minmax(240px,0.62fr)_minmax(120px,0.2fr)_minmax(130px,0.22fr)_minmax(120px,0.2fr)]"
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
              label={metricColumnLabel}
              value={detailStageFilter}
              options={stageOptions}
              onChange={(value) => onDetailStageFilterChange(value as DetailStageFilter)}
              compact
            />
            <TableFilterSelect
              label={dateColumnLabel}
              value={deadlineFilter}
              options={deadlineOptions}
              onChange={(value) => onDeadlineFilterChange(value as DeadlineFilter)}
              compact
            />
          </div>
        ) : null}
      </div>
      <InfluencerTableHeaderRow
        metricColumnLabel={metricColumnLabel}
        dateColumnLabel={dateColumnLabel}
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <div className="max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {displayItems.length > 0 ? (
          displayItems.map((item) => {
            const advertiserName = removeInternalTestLabel(
              item.advertiser_name,
              "광고주",
            );
            const amountLabel = formatDashboardAmountLabel(item.fee_label);

            return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="group grid w-full gap-2 px-3 py-2 text-left transition-colors hover:bg-[#fafaf7] lg:min-h-[44px] lg:grid-cols-[minmax(104px,0.2fr)_minmax(82px,0.14fr)_minmax(250px,0.78fr)_minmax(160px,0.4fr)_minmax(132px,0.32fr)_minmax(104px,0.23fr)] lg:items-center lg:py-1.5"
            >
              <div className="flex min-w-0 items-center justify-between gap-2 lg:block">
                <PlatformPills item={item} />
                <span className="shrink-0 lg:hidden">
                  <StageBadge stage={item.stage} dense />
                </span>
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-[12px] font-semibold text-[#303630]">
                  {advertiserName}
                </p>
              </div>
              <div className="min-w-0">
                <p className="min-w-0 truncate text-[13px] font-semibold text-[#171a17]">
                  {formatDashboardContractTitle(item.title)}
                </p>
                <p className="mt-1 min-w-0 truncate text-[11px] font-semibold text-[#606861] lg:hidden">
                  {advertiserName} · {amountLabel} · {formatDeadlineDisplay(item)}
                </p>
                {item.kind === "application" ? (
                  <p className="mt-1 truncate text-[11px] font-semibold text-[#7d857f] lg:hidden">
                    {item.next_action_label}
                  </p>
                ) : null}
              </div>
              <div className="hidden min-w-0 lg:block">
                <PreviewAmount value={amountLabel} />
              </div>
              <InfluencerMetricCell item={item} lifecycle={lifecycleFilter} />
              <InfluencerDateCell item={item} lifecycle={lifecycleFilter} />
            </button>
            );
          })
        ) : (
          <EmptyContracts hasQuery={totalItems > 0} />
        )}
      </div>
    </section>
  );
}

function InfluencerTableHeaderRow({
  metricColumnLabel,
  dateColumnLabel,
  sortState,
  onSortChange,
}: {
  metricColumnLabel: string;
  dateColumnLabel: string;
  sortState: ContractSort;
  onSortChange: (key: SortKey) => void;
}) {
  return (
    <div className="hidden border-b border-[#e3e8e3] bg-[#fbfbf8] px-3 py-2 lg:grid lg:grid-cols-[minmax(104px,0.2fr)_minmax(82px,0.14fr)_minmax(250px,0.78fr)_minmax(160px,0.4fr)_minmax(132px,0.32fr)_minmax(104px,0.23fr)] lg:items-center lg:gap-2">
      <ColumnHeader
        label="플랫폼"
        sortKey="platform"
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <ColumnHeader
        label="브랜드"
        sortKey="advertiser"
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
        label={metricColumnLabel}
        sortKey="stage"
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

function InfluencerAppliedFilterBar({
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

function InfluencerFilterToggleButton({
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

function InfluencerLifecycleTabs({
  value,
  counts,
  onChange,
}: {
  value: InfluencerCampaignLifecycle;
  counts: Record<InfluencerCampaignLifecycle, number>;
  onChange: (value: InfluencerCampaignLifecycle) => void;
}) {
  return (
    <div className="border-b border-[#d9e0d9] bg-[#ecebe5] px-2 pt-2">
      <div className="grid min-w-0 grid-cols-4 items-end gap-1">
        {INFLUENCER_LIFECYCLE_TABS.map((tab) => {
          const active = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              aria-pressed={active}
              className={`relative flex h-10 min-w-0 items-center justify-between gap-0.5 rounded-t-[10px] border px-1 text-left transition focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:gap-1.5 sm:px-3 ${
                active
                  ? "z-10 -mb-px border-[#d9e0d9] border-b-white bg-white pb-px text-[#171a17] shadow-[0_-1px_0_rgba(255,255,255,0.9)_inset]"
                  : "mb-1 border-transparent bg-[#e5e3dc] text-[#59605b] hover:bg-[#f5f4ee] hover:text-[#171a17]"
              }`}
            >
              <span className="shrink-0 whitespace-nowrap text-[10px] font-extrabold sm:text-[13px]">
                {tab.label}
              </span>
              <span
                className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-extrabold sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-[12px] ${
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

function InfluencerMetricCell({
  item,
  lifecycle,
}: {
  item: InfluencerCampaignWorkItem;
  lifecycle: InfluencerCampaignLifecycle;
}) {
  const submission = getSubmissionStatusMeta(item);
  const label =
    lifecycle === "APPLIED"
      ? item.stage_label
      : lifecycle === "IN_PROGRESS"
        ? item.stage_label
        : lifecycle === "REJECTED"
          ? "미선정"
          : submission.label;
  const className =
    lifecycle === "REJECTED"
      ? "text-[#7d857f]"
      : lifecycle === "COMPLETED"
        ? submission.className
        : getInfluencerMetricTone(item);

  return (
    <div className="hidden min-w-0 lg:block">
      <p className={`truncate text-[12px] font-extrabold ${className}`}>
        {label}
      </p>
    </div>
  );
}

function InfluencerDateCell({
  item,
  lifecycle,
}: {
  item: InfluencerCampaignWorkItem;
  lifecycle: InfluencerCampaignLifecycle;
}) {
  const value =
    lifecycle === "COMPLETED" || lifecycle === "REJECTED"
      ? formatInfluencerListDate(item.updated_at)
      : formatDeadlineDisplay(item);

  return (
    <p className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630]">
      {value}
    </p>
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
        label="캠페인명"
        sortKey={sortKey}
        sortState={sortState}
        onSortChange={onSortChange}
      />
      <span className={`relative block ${compact ? "" : "mt-1"}`}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="캠페인명 검색"
          placeholder="캠페인명으로 검색"
          className="h-9 w-full max-w-full rounded-[6px] border border-[#d9e0d9] bg-white pl-7 pr-2 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17]"
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
  return (
    <div className="flex h-6 items-center gap-1">
      <span className="block text-[11px] font-extrabold text-[#7d857f]">{label}</span>
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

function StageBadge({
  stage,
  dense = false,
}: {
  stage: InfluencerWorkStage;
  dense?: boolean;
}) {
  const meta = getWorkStageMeta(stage);

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border font-semibold ${meta.className} ${
        dense ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]"
      }`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function PreviewAmount({ value }: { value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-semibold text-[#303630]">{value}</p>
    </div>
  );
}

function PlatformPills({ item }: { item: InfluencerCampaignWorkItem }) {
  const items = getInfluencerPlatformDisplayItems(item);
  const [primaryPlatform] = items;

  return (
    <div className="flex w-full min-w-0 gap-1 overflow-hidden">
      {primaryPlatform ? (
        <span
          key={`${primaryPlatform.platform}-${primaryPlatform.label}`}
          className={`inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded-[5px] border px-2 text-[11px] font-semibold whitespace-nowrap ${PLATFORM_META[primaryPlatform.platform].className}`}
          title={
            primaryPlatform.accountId === "계정 미입력"
              ? primaryPlatform.label
              : `${primaryPlatform.label} · ${primaryPlatform.accountId}`
          }
        >
          <span className="shrink-0">{PLATFORM_META[primaryPlatform.platform].icon}</span>
          <span className="min-w-0 truncate whitespace-nowrap">{primaryPlatform.label}</span>
        </span>
      ) : null}
      {items.length > 1 && (
        <span className="inline-flex h-6 shrink-0 items-center rounded-[5px] border border-neutral-200 bg-white px-1.5 text-[11px] font-semibold text-neutral-500">
          +{items.length - 1}
        </span>
      )}
    </div>
  );
}

function buildInfluencerCampaignWorkItems(
  dashboard: InfluencerDashboardResponse,
): InfluencerCampaignWorkItem[] {
  const contractIds = new Set(dashboard.contracts.map((contract) => contract.id));
  const contractItems = dashboard.contracts.map(
    (contract): InfluencerCampaignWorkItem => ({
      id: `contract:${contract.id}`,
      kind: "contract",
      lifecycle: getContractLifecycle(contract),
      title: contract.title,
      advertiser_name: contract.advertiser_name,
      stage: contract.stage,
      stage_label: contract.stage_label,
      next_action_label: contract.next_action_label,
      action_label: contract.action_label,
      action_href: contract.action_href,
      platform_labels: contract.platform_labels,
      platforms: contract.platforms,
      platform_accounts: contract.platform_accounts,
      fee_label: contract.fee_label,
      deadline_label: contract.deadline_label,
      due_at: contract.due_at,
      updated_at: contract.updated_at,
      deliverable_summary: contract.deliverable_summary,
      activity_events: contract.activity_events ?? [],
      source_contract: contract,
    }),
  );
  const applicationItems = (dashboard.applications ?? [])
    .filter(
      (application) =>
        !application.converted_contract_id ||
        !contractIds.has(application.converted_contract_id),
    )
    .map(
      (application): InfluencerCampaignWorkItem => ({
        id: `application:${application.id}`,
        kind: "application",
        lifecycle: getApplicationLifecycle(application),
        title: application.campaign_title,
        advertiser_name: application.brand_name,
        stage: mapApplicationWorkStage(application.stage),
        stage_label: application.stage_label,
        next_action_label: application.next_action_label,
        action_label: application.action_label,
        action_href: application.action_href,
        platform_labels: application.platform_labels,
        platforms: application.platforms,
        platform_accounts: application.platforms.map((platform) => ({ platform })),
        fee_label: application.fee_label,
        deadline_label: application.deadline_label,
        due_at: application.due_at,
        updated_at: application.updated_at,
        deliverable_summary: {
          total: 0,
          submitted: 0,
          approved: 0,
        },
        activity_events: application.activity_events ?? [],
        source_application: application,
      }),
    );

  return [...applicationItems, ...contractItems].sort(
    (a, b) => parseDate(b.updated_at) - parseDate(a.updated_at),
  );
}

function mapApplicationWorkStage(
  stage: InfluencerDashboardApplicationStage,
): InfluencerApplicationWorkStage {
  if (stage === "reviewed") return "application_reviewed";
  if (stage === "accepted") return "application_accepted";
  if (stage === "closed") return "application_closed";
  return "application_submitted";
}

function getContractLifecycle(
  contract: InfluencerDashboardContract,
): InfluencerCampaignLifecycle {
  if (contract.stage === "completed" || contract.stage === "signed") {
    return "COMPLETED";
  }

  return "IN_PROGRESS";
}

function getApplicationLifecycle(
  application: InfluencerDashboardApplication,
): InfluencerCampaignLifecycle {
  if (application.stage === "closed") return "REJECTED";
  if (application.stage === "accepted") return "IN_PROGRESS";
  return "APPLIED";
}

function getInfluencerLifecycleCounts(items: InfluencerCampaignWorkItem[]) {
  return items.reduce<Record<InfluencerCampaignLifecycle, number>>(
    (counts, item) => {
      counts[item.lifecycle] += 1;
      return counts;
    },
    { APPLIED: 0, IN_PROGRESS: 0, COMPLETED: 0, REJECTED: 0 },
  );
}

function getInfluencerPlatformDisplayItems(item: InfluencerCampaignWorkItem) {
  const source = [
    item.title,
    item.next_action_label,
    ...item.platform_labels,
  ]
    .join(" ")
    .toLowerCase();
  const accounts: Array<{ platform: InfluencerPlatform; url?: string }> =
    item.platform_accounts.length > 0
      ? item.platform_accounts
      : item.platforms.map((platform) => ({ platform }));
  const fallbackAccounts =
    accounts.length > 0 ? accounts : [{ platform: "other" as InfluencerPlatform }];

  return fallbackAccounts.map((account) => ({
    platform: account.platform,
    label: getDetailedInfluencerPlatformLabel(account.platform, source),
    accountId: formatInfluencerAccountId(account.url, account.platform),
  }));
}

function getInfluencerCampaignItemPlatforms(item: InfluencerCampaignWorkItem) {
  const platforms =
    item.platforms.length > 0
      ? item.platforms
      : item.platform_accounts.map((account) => account.platform);
  const uniquePlatforms = Array.from(new Set(platforms));

  return uniquePlatforms.length > 0
    ? uniquePlatforms
    : ["other" as InfluencerPlatform];
}

function formatPlatformFilterLabel(platform: PlatformFilter) {
  if (platform === "all") return "전체";
  return formatInfluencerPlatformShortLabel(platform);
}

function formatDetailStageFilterLabel(stage: DetailStageFilter) {
  if (stage === "all") return "전체";
  return getWorkStageMeta(stage).label;
}

function formatAmountFilterLabel(filter: AmountFilter) {
  if (filter === "fixed") return "정액";
  if (filter === "commission") return "수수료";
  return "전체";
}

function formatDeadlineFilterLabel(filter: DeadlineFilter) {
  if (filter === "overdue") return "마감 지남";
  if (filter === "this_week") return "7일 이내";
  if (filter === "later") return "이후";
  if (filter === "none") return "마감 없음";
  return "전체";
}

function buildInfluencerBrandFilterOptions(
  items: InfluencerCampaignWorkItem[],
) {
  const brands = Array.from(
    new Set(
      items
        .map((item) => removeInternalTestLabel(item.advertiser_name, "광고주"))
        .filter(Boolean),
    ),
  ).sort(compareText);

  return [
    { value: "all", label: "전체" },
    ...brands.map((brand) => ({ value: brand, label: brand })),
  ];
}

function getAmountFilterKind(value?: string | null): ActualAmountKind {
  const text = `${value ?? ""} ${formatMoneyLabel(value, "")}`.toLowerCase();

  if (/%|commission|수수료|판매\s*수익/.test(text)) return "commission";
  return "fixed";
}

function matchesDeadlineFilter(
  item: InfluencerCampaignWorkItem,
  filter: DeadlineFilter,
) {
  if (filter === "all") return true;
  const dueTime = getDueTime(item);
  if (!Number.isFinite(dueTime)) return filter === "none";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.floor(
    (dueTime - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (filter === "overdue") return daysUntilDue < 0;
  if (filter === "this_week") return daysUntilDue >= 0 && daysUntilDue <= 7;
  if (filter === "later") return daysUntilDue > 7;
  return false;
}

function formatDeadlineDisplay(item: InfluencerCampaignWorkItem) {
  if (Number.isFinite(getDueTime(item))) {
    return formatInfluencerDateWithDday(item.due_at);
  }

  return item.deadline_label?.trim() || "마감 없음";
}

function getInfluencerMetricColumnLabel(lifecycle: InfluencerCampaignLifecycle) {
  if (lifecycle === "APPLIED") return "내 상태";
  if (lifecycle === "IN_PROGRESS") return "내 할 일";
  if (lifecycle === "REJECTED") return "결과";
  return "결과";
}

function getInfluencerDateColumnLabel(lifecycle: InfluencerCampaignLifecycle) {
  if (lifecycle === "APPLIED") return "응답기한";
  if (lifecycle === "COMPLETED") return "완료일";
  if (lifecycle === "REJECTED") return "결과일";
  return "마감일";
}

function getInfluencerMetricTone(item: InfluencerCampaignWorkItem) {
  if (
    item.stage === "review_needed" ||
    item.stage === "change_pending" ||
    item.stage === "deliverables_due"
  ) {
    return "text-amber-700";
  }

  if (
    item.stage === "ready_to_sign" ||
    item.stage === "application_accepted"
  ) {
    return "text-blue-700";
  }

  if (item.stage === "application_closed") return "text-[#7d857f]";
  return "text-[#303630]";
}

function formatInfluencerListDate(value?: string) {
  return formatInfluencerDateWithDday(value);
}

function formatInfluencerDateWithDday(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dateLabel = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join(".");
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((dateStart.getTime() - todayStart.getTime()) / 86_400_000);
  const dday = diff > 0 ? `D-${diff}` : diff === 0 ? "D-day" : `D+${Math.abs(diff)}`;

  return `${dateLabel} / ${dday}`;
}

function getSubmissionStatusMeta(item: InfluencerCampaignWorkItem) {
  if (item.kind === "application") {
    return {
      label: item.next_action_label || "지원 상태 확인",
      className:
        item.stage === "application_closed"
          ? "text-[#7d857f]"
          : item.stage === "application_accepted"
            ? "text-blue-700"
            : "text-amber-700",
    };
  }

  const { total, submitted, approved } = item.deliverable_summary;

  if (total <= 0) {
    return {
      label: item.next_action_label || "제출 없음",
      className: "text-[#7d857f]",
    };
  }

  if (approved >= total) {
    return { label: "제출 승인", className: "text-emerald-700" };
  }

  if (submitted >= total) {
    return { label: "제출 완료", className: "text-[#303630]" };
  }

  if (submitted > 0) {
    return {
      label: `${submitted}/${total} 제출`,
      className: "text-amber-700",
    };
  }

  if (item.stage === "deliverables_due") {
    return { label: "제출 필요", className: "text-amber-700" };
  }

  return { label: "제출 대기", className: "text-[#7d857f]" };
}

function getDueTime(item: Pick<InfluencerCampaignWorkItem, "due_at">) {
  if (!item.due_at) return Number.POSITIVE_INFINITY;
  const time = new Date(item.due_at).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function formatDashboardAmountLabel(value?: string | null) {
  const label = formatMoneyLabel(value, "-").replace(/\s+/g, " ").trim();
  const percentMatch = label.match(/(\d+(?:\.\d+)?)\s*%/);

  if (percentMatch) return `수수료 ${percentMatch[1]}%`;
  return label || "-";
}

function compareCampaignItemsBySort(
  a: InfluencerCampaignWorkItem,
  b: InfluencerCampaignWorkItem,
  sort: ContractSort,
) {
  let result: number;

  switch (sort.key) {
    case "platform":
      result = compareText(getPlatformSortLabel(a), getPlatformSortLabel(b));
      break;
    case "advertiser":
      result = compareText(
        removeInternalTestLabel(a.advertiser_name, "광고주"),
        removeInternalTestLabel(b.advertiser_name, "광고주"),
      );
      break;
    case "title":
      result = compareText(
        formatDashboardContractTitle(a.title),
        formatDashboardContractTitle(b.title),
      );
      break;
    case "amount":
      result = compareAmountValues(a.fee_label, b.fee_label);
      break;
    case "stage":
      result =
        DETAIL_STAGE_FILTERS.indexOf(a.stage) - DETAIL_STAGE_FILTERS.indexOf(b.stage);
      break;
    case "deadline":
      result = getDueTime(a) - getDueTime(b);
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

function getPlatformSortLabel(item: InfluencerCampaignWorkItem) {
  return getInfluencerCampaignItemPlatforms(item)
    .map((platform) => formatInfluencerPlatformShortLabel(platform))
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
  const kind = getAmountFilterKind(value);
  const label = formatDashboardAmountLabel(value);
  const raw = `${value ?? ""} ${label}`.replace(/,/g, "").toLowerCase();
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

function formatDashboardContractTitle(title: string) {
  const cleaned = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  return formatContractTitleForDisplay(cleaned || title, "캠페인명 미정");
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

function getInfluencerDashboardItemCollapseKey(
  item: InfluencerCampaignWorkItem,
) {
  return [
    item.kind,
    formatDashboardContractTitle(item.title),
    item.stage,
    removeInternalTestLabel(item.advertiser_name, "광고주"),
    formatDashboardAmountLabel(item.fee_label),
    getInfluencerCampaignItemPlatforms(item).join(","),
  ].join("|");
}

function dedupeApprovedPlatforms(
  platforms: InfluencerDashboardResponse["verification"]["approved_platforms"],
) {
  const seen = new Set<InfluencerPlatform>();
  return platforms.filter((platform) => {
    if (seen.has(platform.platform)) return false;
    seen.add(platform.platform);
    return true;
  });
}

function parseDate(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function getDetailedInfluencerPlatformLabel(
  platform: InfluencerPlatform,
  source: string,
) {
  void source;
  return formatInfluencerPlatformShortLabel(platform);
}

function formatInfluencerPlatformShortLabel(platform: InfluencerPlatform) {
  if (platform === "instagram") return "인스타";
  if (platform === "youtube") return "유튜브";
  if (platform === "tiktok") return "틱톡";
  if (platform === "naver_blog") return "블로그";
  return PLATFORM_META[platform].label;
}

function formatInfluencerAccountId(url: string | undefined, platform: InfluencerPlatform) {
  if (!url) return "계정 미입력";

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const pathSegment = parsed.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)[0];
    const clean = decodeURIComponent(pathSegment ?? "")
      .replace(/^@/, "")
      .trim();

    if (!clean) return parsed.hostname.replace(/^www\./, "");
    if (platform === "naver_blog") return clean;
    return `@${clean}`;
  } catch {
    const clean = url.replace(/^https?:\/\//, "").replace(/^@/, "").split(/[/?#]/)[0];
    return platform === "naver_blog" ? clean : `@${clean}`;
  }
}
