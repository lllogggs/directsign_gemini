import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpWideNarrow,
  BookOpen,
  ChevronDown,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSignature,
  FileText,
  Globe2,
  Instagram,
  KeyRound,
  LogOut,
  Mail,
  MessageSquareText,
  Music2,
  Search,
  Settings,
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
import {
  clearInfluencerDashboardPreload,
  consumeInfluencerDashboardPreload,
} from "../../domain/influencerDashboardPreload";
import { waitForFastLoginTransition } from "../../domain/fastLoginTransition";
import { buildLoginRedirect } from "../../domain/navigation";
import {
  formatContractTitleForDisplay,
  formatMoneyLabel,
  formatPublicContactValue,
  formatPublicHandleValue,
  removeInternalTestLabel,
} from "../../domain/display";
import { translateApiErrorMessage } from "../../domain/userMessages";
import type { InfluencerPlatform } from "../../domain/verification";
import { DashboardSurfaceSwitch } from "../../components/DashboardSurfaceSwitch";
import { MobileSurfaceSwitch } from "../../components/MobileSurfaceSwitch";
import { useMarketplaceMessageSummary } from "../../hooks/useMarketplaceMessageSummary";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; dashboard: InfluencerDashboardResponse }
  | { status: "error"; message: string };

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
type InfluencerDashboardDateParts = {
  label: string;
  dday?: string;
  dateLabel?: string;
  isUrgent?: boolean;
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
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
      await waitForFastLoginTransition("influencer");
      const preloadedDashboard = consumeInfluencerDashboardPreload();

      if (preloadedDashboard) {
        try {
          const data = await preloadedDashboard;
          setState({ status: "ready", dashboard: data });
          return;
        } catch {
          clearInfluencerDashboardPreload();
        }
      }

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
  const accountSummary: InfluencerAccountSummary = {
    name: removeInternalTestLabel(dashboard.user.name, "인플루언서 계정"),
    email: formatPublicContactValue(dashboard.user.email) || undefined,
  };
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
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/influencer/dashboard")}
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="font-neo-heavy hidden text-[18px] leading-none sm:inline">{PRODUCT_NAME}</span>
            <span className="max-w-[104px] truncate text-[12px] font-extrabold leading-none text-neutral-700 sm:hidden">
              인플루언서
            </span>
          </button>

          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            <DashboardSurfaceSwitch role="influencer" active="contracts" />
            <MessageCenterButton
              unreadCount={messageSummary.unreadCount}
              isLoading={isMessageSummaryLoading}
              onClick={() => navigate("/influencer/messages")}
            />
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

      <MobileSurfaceSwitch role="influencer" active="contracts" />

      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-2.5 sm:px-5 lg:flex lg:h-[calc(100vh-56px)] lg:flex-col lg:overflow-hidden lg:px-6">
        <section className="min-w-0 overflow-hidden rounded-[10px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.055)] lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
                <h1 className="truncate text-[17px] font-bold text-[#171a17]">
                  내 계약
                </h1>
              </div>
            </div>
          </div>

          <InfluencerAccountBanner dashboard={dashboard} />

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

function LoadingView() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <div className="flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="font-neo-heavy hidden text-[18px] leading-none sm:inline">
              {PRODUCT_NAME}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-10 w-20 rounded-[9px] bg-neutral-950" />
            <span className="hidden h-10 w-24 rounded-[9px] border border-neutral-200 bg-white sm:block" />
            <span className="hidden h-10 w-24 rounded-[9px] border border-neutral-200 bg-white sm:block" />
          </div>
        </div>
      </header>

      <MobileSurfaceSwitch role="influencer" active="contracts" />

      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-2.5 sm:px-5 lg:flex lg:h-[calc(100vh-56px)] lg:flex-col lg:overflow-hidden lg:px-6">
        <section className="min-w-0 overflow-hidden rounded-[10px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.055)] lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="truncate text-[17px] font-bold text-[#171a17]">
                내 계약
              </h1>
              <span className="h-8 w-24 rounded-[8px] border border-neutral-200 bg-neutral-50" />
            </div>
          </div>
          <div className="min-w-0 p-2.5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <div className="rounded-[10px] border border-neutral-200 bg-white">
              <div className="grid grid-cols-4 rounded-t-[10px] bg-[#e8e5df] text-[13px] font-extrabold text-neutral-700">
                {["지원중", "진행중", "완료", "미선정"].map((label, index) => (
                  <div
                    key={label}
                    className={`flex h-11 items-center px-3 ${
                      index === 0 ? "bg-white text-neutral-950" : ""
                    }`}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="border-b border-neutral-100 px-3 py-2">
                <p className="text-[13px] font-extrabold text-neutral-950">
                  계약 목록
                </p>
                <p className="mt-0.5 text-[12px] font-semibold text-neutral-500">
                  플랫폼, 브랜드, 계약명, 지급내용, 마감일, 현 단계
                </p>
              </div>
              <div className="grid gap-2 border-b border-neutral-100 px-3 py-2 sm:grid-cols-[minmax(220px,1fr)_150px]">
                <input
                  type="search"
                  aria-label="계약 검색"
                  placeholder="계약명으로 검색"
                  className="h-10 min-w-0 rounded-[9px] border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 outline-none"
                />
                <select
                  aria-label="플랫폼 필터"
                  className="h-10 rounded-[9px] border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 outline-none"
                  defaultValue="all"
                >
                  <option value="all">전체</option>
                  <option value="instagram">인스타</option>
                  <option value="youtube">유튜브</option>
                </select>
              </div>
              <div className="grid grid-cols-[90px_120px_minmax(180px,1fr)_150px_130px_120px] border-b border-neutral-100 px-3 py-2 text-[12px] font-bold text-neutral-500">
                <span>플랫폼</span>
                <span>브랜드</span>
                <span>계약명</span>
                <span>지급내용</span>
                <span>마감일</span>
                <span>현 단계</span>
              </div>
              <div className="space-y-2 px-3 py-4">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="grid grid-cols-[90px_120px_minmax(180px,1fr)_150px_130px_120px] items-center gap-0"
                  >
                    <span className="h-7 w-16 rounded-[7px] bg-neutral-100" />
                    <span className="h-4 w-20 rounded bg-neutral-100" />
                    <span className="h-4 w-44 rounded bg-neutral-100" />
                    <span className="h-4 w-24 rounded bg-neutral-100" />
                    <span className="h-4 w-20 rounded bg-neutral-100" />
                    <span className="h-7 w-20 rounded-[7px] bg-neutral-100" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
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
}: {
  dashboard: InfluencerDashboardResponse;
}) {
  const verificationApproved = dashboard.verification.status === "approved";
  const approvedPlatforms = dashboard.verification.approved_platforms.filter(
    (platform) => platform.handle.trim().length > 0,
  );

  return (
    <section className="border-b border-[#d9e0d9] bg-[#fcfcfd] px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-800 ring-1 ring-neutral-200">
          <UserCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-extrabold text-neutral-950">
              {removeInternalTestLabel(dashboard.user.name, "인플루언서 계정")}
            </p>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-extrabold text-blue-700">
              {verificationApproved ? "인증 완료" : "인증 전"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4 text-neutral-500">
            {approvedPlatforms.map((platform, index) => (
              <span
                key={`${platform.platform}:${platform.handle}:${platform.url ?? ""}:${index}`}
                className={`inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-full border px-2 py-0.5 font-semibold ${PLATFORM_META[platform.platform].className}`}
              >
                {PLATFORM_META[platform.platform].icon}
                <span className="shrink-0">
                  {formatInfluencerPlatformShortLabel(platform.platform)}
                </span>
                <span className="truncate">
                  {formatInfluencerVerifiedHandle(platform)}
                </span>
              </span>
            ))}
            {approvedPlatforms.length === 0 ? (
              <span className="text-[12px] font-semibold text-neutral-500">
                인증한 플랫폼 없음
              </span>
            ) : null}
          </div>
        </div>
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

function EmptyContracts({ hasQuery }: { hasQuery: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {hasQuery ? "조건에 맞는 계약이 없습니다" : "아직 내 계약이 없습니다"}
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
      <div className="border-b border-[#d9e0d9] bg-white">
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
      <div className="no-scrollbar max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto overscroll-contain lg:max-h-none lg:min-h-0 lg:flex-1">
        {displayItems.length > 0 ? (
          displayItems.map((item) => {
            const advertiserName = removeInternalTestLabel(
              item.advertiser_name,
              "광고주",
            );
            const amountLabel = formatDashboardAmountLabel(item.fee_label);
            const titleLabel = formatInfluencerDashboardItemTitle(item);

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
                  {titleLabel}
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
    <div className="hidden border-b border-[#d7ddd7] bg-[#f7f8f4] px-3 py-2.5 lg:grid lg:grid-cols-[minmax(104px,0.2fr)_minmax(82px,0.14fr)_minmax(250px,0.78fr)_minmax(160px,0.4fr)_minmax(132px,0.32fr)_minmax(104px,0.23fr)] lg:items-center lg:gap-2">
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
    <div className="bg-[#ecebe5] px-2 pt-2">
      <div
        role="tablist"
        className="grid min-w-0 grid-cols-4 items-end gap-0 overflow-visible"
      >
        {INFLUENCER_LIFECYCLE_TABS.map((tab) => {
          const active = value === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              role="tab"
              aria-selected={active}
              className={`relative flex h-10 min-w-0 items-center justify-between gap-0.5 rounded-t-[10px] border px-1 text-left transition focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-neutral-950 sm:gap-1.5 sm:px-3 ${
                active
                  ? "z-10 border-[#d9e0d9] border-b-white bg-white text-[#171a17] after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-white"
                  : "border-transparent bg-transparent text-[#59605b] hover:bg-white/35 hover:text-[#171a17]"
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
  const parts =
    lifecycle === "COMPLETED" || lifecycle === "REJECTED"
      ? getInfluencerDateDisplayParts(item.updated_at)
      : getDeadlineDisplayParts(item);

  return <InfluencerDateText parts={parts} />;
}

function InfluencerDateText({ parts }: { parts: InfluencerDashboardDateParts }) {
  if (!parts.dday || !parts.dateLabel) {
    return (
      <p className="hidden min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630] lg:block">
        {parts.label}
      </p>
    );
  }

  return (
    <p className="hidden min-w-0 truncate whitespace-nowrap text-[12px] font-semibold tabular-nums text-[#303630] lg:block">
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
    <div className="flex h-7 min-w-0 items-center gap-1.5">
      <span className="block truncate text-[12px] font-black tracking-[-0.01em] text-[#303630]">{label}</span>
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

function getDeadlineDisplayParts(
  item: InfluencerCampaignWorkItem,
): InfluencerDashboardDateParts {
  if (Number.isFinite(getDueTime(item))) {
    return getInfluencerDateDisplayParts(item.due_at);
  }

  return { label: item.deadline_label?.trim() || "마감 없음" };
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

function formatInfluencerDateWithDday(value?: string) {
  return getInfluencerDateDisplayParts(value).label;
}

function getInfluencerDateDisplayParts(
  value?: string,
): InfluencerDashboardDateParts {
  if (!value) return { label: "-" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: value };

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
  const dday = diff > 0 ? `D-${diff}` : diff === 0 ? "D-0" : `D+${Math.abs(diff)}`;

  return {
    label: `${dday} / ${dateLabel}`,
    dday,
    dateLabel,
    isUrgent: diff >= 0 && diff <= 3,
  };
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

function formatInfluencerDashboardItemTitle(item: InfluencerCampaignWorkItem) {
  return formatDashboardContractTitle(
    item.title,
    buildInfluencerDashboardTitleFallback(item),
  );
}

function buildInfluencerDashboardTitleFallback(item: InfluencerCampaignWorkItem) {
  const advertiserName = removeInternalTestLabel(item.advertiser_name, "브랜드");
  const lifecycleLabel =
    item.lifecycle === "COMPLETED"
      ? "완료 계약"
      : item.lifecycle === "IN_PROGRESS"
        ? "진행 계약"
        : item.lifecycle === "REJECTED"
          ? "미선정 계약"
          : "지원 계약";

  return `${advertiserName} ${lifecycleLabel}`;
}

function formatDashboardContractTitle(title: string, fallback = "계약명 미정") {
  const cleaned = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  return formatContractTitleForDisplay(cleaned || title, fallback);
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

function formatInfluencerVerifiedHandle(
  platform: InfluencerDashboardResponse["verification"]["approved_platforms"][number],
) {
  const handle = formatPublicHandleValue(
    platform.handle,
    PLATFORM_META[platform.platform].label,
  );
  if (platform.platform === "naver_blog" || handle.startsWith("@")) return handle;
  return `@${handle}`;
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
