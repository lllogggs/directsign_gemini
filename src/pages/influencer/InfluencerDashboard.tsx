import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileSignature,
  FileText,
  Globe2,
  Instagram,
  LogOut,
  Music2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Youtube,
} from "lucide-react";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import type {
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
import { translateApiErrorMessage } from "../../domain/userMessages";
import type { InfluencerPlatform, VerificationStatus } from "../../domain/verification";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; dashboard: InfluencerDashboardResponse }
  | { status: "error"; message: string };

type ContractFilter = "revision" | "review" | "sign" | "fulfillment" | "done";
type PlatformFilter = "all" | InfluencerPlatform;
type DetailStageFilter = "all" | InfluencerDashboardContractStage;

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
    label: "콘텐츠 제출",
    helper: "링크/증빙 제출",
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

const DASHBOARD_TABS: Array<{
  id: ContractFilter;
  label: string;
  stages: InfluencerDashboardContractStage[];
}> = [
  { id: "revision", label: "수정", stages: ["change_pending"] },
  { id: "review", label: "검토", stages: ["review_needed", "waiting"] },
  { id: "sign", label: "서명", stages: ["ready_to_sign"] },
  {
    id: "fulfillment",
    label: "이행",
    stages: ["deliverables_due", "deliverables_review"],
  },
  {
    id: "done",
    label: "완료",
    stages: ["signed", "completed"],
  },
];

const PLATFORM_FILTERS: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];

const DETAIL_STAGE_FILTERS: DetailStageFilter[] = [
  "all",
  "review_needed",
  "change_pending",
  "ready_to_sign",
  "deliverables_due",
  "deliverables_review",
  "signed",
  "completed",
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
  const [filter, setFilter] = useState<ContractFilter>("revision");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [detailStageFilter, setDetailStageFilter] =
    useState<DetailStageFilter>("all");

  const loadDashboard = useCallback(async () => {
    setState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    try {
      const response = await apiFetch("/api/influencer/dashboard", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

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

  if (state.status === "loading") {
    return <DashboardShell><LoadingView /></DashboardShell>;
  }

  if (state.status === "error") {
    return (
      <DashboardShell>
        <ErrorView message={state.message} onRetry={loadDashboard} />
      </DashboardShell>
    );
  }

  const dashboard = state.dashboard;
  const stageCounts = dashboard.contracts.reduce(
    (acc, contract) => {
      acc[contract.stage] = (acc[contract.stage] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<InfluencerDashboardContractStage, number>>,
  );
  const platformCounts = PLATFORM_FILTERS.reduce(
    (acc, platform) => {
      acc[platform] =
        platform === "all"
          ? dashboard.contracts.length
          : dashboard.contracts.filter((contract) =>
              getInfluencerContractPlatforms(contract).includes(platform),
            ).length;
      return acc;
    },
    {} as Record<PlatformFilter, number>,
  );
  const stageContracts = dashboard.contracts.filter((contract) => {
    const selectedTab = DASHBOARD_TABS.find((tab) => tab.id === filter);

    if (
      detailStageFilter === "all" &&
      selectedTab &&
      !selectedTab.stages.includes(contract.stage)
    ) {
      return false;
    }
    if (detailStageFilter !== "all" && contract.stage !== detailStageFilter) {
      return false;
    }
    if (
      platformFilter !== "all" &&
      !getInfluencerContractPlatforms(contract).includes(platformFilter)
    ) {
      return false;
    }

    return true;
  });

  const filteredContracts = stageContracts.filter((contract) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    return [
      formatDashboardContractTitle(contract.title),
      removeInternalTestLabel(contract.advertiser_name, "광고주"),
      formatMoneyLabel(contract.fee_label),
      contract.period_label,
      contract.stage_label,
      ...contract.platform_labels,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const verification = VERIFICATION_META[dashboard.verification.status];
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
  const handleTabChange = (tab: ContractFilter) => {
    setFilter(tab);
    setDetailStageFilter("all");
  };
  const handleDetailStageChange = (stage: DetailStageFilter) => {
    setDetailStageFilter(stage);

    if (stage !== "all") {
      const matchingTab = DASHBOARD_TABS.find((tab) => tab.stages.includes(stage));
      if (matchingTab) setFilter(matchingTab.id);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/influencer/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn("[Yeollock] influencer logout request failed", error);
    } finally {
      navigate("/login/influencer", { replace: true });
    }
  };

  return (
    <DashboardShell>
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/influencer/dashboard")}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="truncate text-[19px] font-semibold tracking-[-0.02em]">{PRODUCT_NAME}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadDashboard}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
        <section className="min-w-0 overflow-hidden rounded-[8px] border border-[#cbd5cc] bg-[#fdfdfb] shadow-[0_22px_60px_rgba(23,26,23,0.10)]">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#7d857f]">
                  계약 운영 화면
                </p>
                <h1 className="mt-1 truncate text-[18px] font-semibold text-[#171a17]">
                  받은 계약 검토
                </h1>
                <p className="mt-1 text-[12px] font-medium text-[#7d857f]">
                  전체 {dashboard.contracts.length.toLocaleString()}건 · 검색 결과 {filteredContracts.length.toLocaleString()}건
                </p>
              </div>
              <span className="inline-flex h-8 items-center rounded-[8px] bg-[#eef0ed] px-3 text-[12px] font-semibold text-[#303630]">
                검토 가능
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
          />

          <div className="min-w-0 p-4">
            <section className="rounded-t-[8px] border border-b-0 border-[#d9e0d9] bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="계약 검색"
                    placeholder="계약명, 광고주, 플랫폼, 상태 검색"
                    className="h-10 w-full rounded-[6px] border border-[#d9e0d9] bg-[#f8faf7] pl-8 pr-3 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17] focus:bg-white"
                  />
                </div>
                <DashboardTabs
                  activeTab={filter}
                  counts={stageCounts}
                  onChange={handleTabChange}
                />
              </div>

              <div className="mt-3 overflow-x-auto border-t border-[#edf1ed] pt-3">
                <div className="flex min-w-max items-center gap-4">
                  <FilterSection label="플랫폼">
                    {PLATFORM_FILTERS.map((platform) => (
                      <FilterButton
                        key={platform}
                        active={platformFilter === platform}
                        count={platformCounts[platform]}
                        label={formatPlatformFilterLabel(platform)}
                        onClick={() => setPlatformFilter(platform)}
                      />
                    ))}
                  </FilterSection>

                  <FilterDivider />

                  <FilterSection label="계약 상태">
                    {DETAIL_STAGE_FILTERS.map((stage) => (
                      <FilterButton
                        key={stage}
                        active={detailStageFilter === stage}
                        count={
                          stage === "all"
                            ? dashboard.contracts.length
                            : stageCounts[stage] ?? 0
                        }
                        label={formatDetailStageFilterLabel(stage)}
                        onClick={() => handleDetailStageChange(stage)}
                      />
                    ))}
                  </FilterSection>
                </div>
              </div>
            </section>

            {filteredContracts.length === 0 ? (
              <EmptyContracts hasQuery={query.trim().length > 0 || dashboard.contracts.length > 0} />
            ) : (
              <ContractTable
                contracts={filteredContracts}
                onOpen={(contract) => { void navigate(contract.action_href); }}
              />
            )}
          </div>
        </section>
      </main>
    </DashboardShell>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-neutral-50 font-sans text-neutral-950">{children}</div>;
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

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-lg border border-neutral-200/80 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_60px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
          <AlertCircle className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-semibold text-neutral-950">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 h-10 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

function InfluencerAccountBanner({
  dashboard,
  verification,
  showVerificationAction,
  onVerify,
}: {
  dashboard: InfluencerDashboardResponse;
  verification: (typeof VERIFICATION_META)[VerificationStatus];
  showVerificationAction: boolean;
  onVerify: () => void;
}) {
  const verificationApproved = dashboard.verification.status === "approved";
  const activityPlatforms = dashboard.user.activity_platforms.slice(0, 3);
  const approvedPlatforms = dashboard.verification.approved_platforms.slice(0, 2);
  const displayEmail = formatPublicContactValue(dashboard.user.email);

  return (
    <section className="border-b border-neutral-200/80 bg-[#fcfcfd] px-4 py-3">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-800 ring-1 ring-neutral-200">
            <UserCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-neutral-950">
                {showVerificationAction ? "플랫폼 계정 인증" : "활동 정보"}
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
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4 text-neutral-500">
              <span className="max-w-[220px] truncate font-semibold text-neutral-800">
                {removeInternalTestLabel(dashboard.user.name, "인플루언서 계정")}
              </span>
              {displayEmail && (
                <>
                  <span className="hidden h-3 w-px bg-neutral-200 sm:inline-block" />
                  <span className="max-w-[340px] truncate">{displayEmail}</span>
                </>
              )}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600">
                이메일 {dashboard.user.email_verified ? "확인됨" : "확인 필요"}
              </span>
              {approvedPlatforms.map((platform) => (
                <span
                  key={`${platform.platform}:${platform.handle}`}
                  className="inline-flex max-w-[170px] items-center gap-1.5 truncate rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600"
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
                activityPlatforms.map((platform) => (
                  <span
                    key={platform}
                    className="inline-flex max-w-[170px] items-center gap-1.5 truncate rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600"
                  >
                    {PLATFORM_META[platform].icon}
                    <span className="truncate">{PLATFORM_META[platform].label}</span>
                  </span>
                ))}
            </div>
          </div>
        </div>
        {showVerificationAction ? (
          <button
            type="button"
            onClick={onVerify}
            className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition ${
              verificationApproved
                ? "border border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"
                : "bg-neutral-950 text-white hover:bg-neutral-800"
            }`}
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            {verificationApproved ? "플랫폼 인증 관리" : "플랫폼 계정 인증"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DashboardTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: ContractFilter;
  counts: Partial<Record<InfluencerDashboardContractStage, number>>;
  onChange: (tab: ContractFilter) => void;
}) {
  return (
    <div
      className="grid min-w-0 grid-cols-5 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1 lg:w-[420px] lg:shrink-0"
      role="tablist"
      aria-label="계약 상태"
    >
      {DASHBOARD_TABS.map((tab) => {
        const active = activeTab === tab.id;
        const count = tab.stages.reduce(
          (sum, stage) => sum + (counts[stage] ?? 0),
          0,
        );

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`h-9 min-w-0 rounded-full px-1 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
              active
                ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap">
              {tab.label}
              <span
                className={`text-[10px] ${
                  active ? "text-neutral-500" : "text-neutral-400"
                }`}
              >
                {count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <p className="shrink-0 text-[13px] font-extrabold text-[#303630]">{label}</p>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterDivider() {
  return <span className="h-6 w-px shrink-0 bg-[#d9e0d9]" aria-hidden="true" />;
}

const FilterButton: React.FC<{
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}> = ({
  active,
  count,
  label,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-bold transition ${
        active
          ? "border-[#171a17] bg-[#171a17] text-white"
          : "border-[#d9e0d9] bg-white text-[#59605b] hover:border-[#b8c2ba] hover:text-[#171a17]"
      }`}
    >
      <span className="truncate">{label}</span>
      <span
        className={`text-[10px] ${
          active ? "text-white/70" : "text-[#a0aaa2]"
        }`}
      >
        {count}
      </span>
    </button>
  );
};

function EmptyContracts({ hasQuery }: { hasQuery: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center rounded-b-[8px] border border-[#d9e0d9] bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {hasQuery ? "조건에 맞는 계약이 없습니다" : "아직 받은 계약이 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {hasQuery
          ? "검색어를 줄이거나 전체로 바꿔보세요."
          : "계약 초대가 오면 이곳에 표시됩니다."}
      </p>
    </section>
  );
}

function ContractTable({
  contracts,
  onOpen,
}: {
  contracts: InfluencerDashboardContract[];
  onOpen: (contract: InfluencerDashboardContract) => void;
}) {
  return (
    <section className="overflow-hidden rounded-b-[8px] border border-[#d9e0d9] bg-white">
      <div className="hidden grid-cols-[minmax(280px,1.25fr)_minmax(150px,0.8fr)_130px_120px_130px] gap-3 border-b border-[#d9e0d9] bg-[#f8faf7] px-4 py-3 text-[11px] font-semibold text-[#7d857f] lg:grid">
        <span>계약</span>
        <span>플랫폼</span>
        <span>상대</span>
        <span>금액</span>
        <span>상태</span>
      </div>
      <div className="divide-y divide-[#edf1ed]">
        {contracts.map((contract) => (
          <button
            key={contract.id}
            type="button"
            onClick={() => onOpen(contract)}
            className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-[#f8faf7] lg:grid-cols-[minmax(280px,1.25fr)_minmax(150px,0.8fr)_130px_120px_130px] lg:gap-3 lg:items-center"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 truncate text-[14px] font-semibold text-[#171a17]">
                  {formatDashboardContractTitle(contract.title)}
                </p>
                <span className="lg:hidden">
                  <StageBadge stage={contract.stage} dense />
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <PlatformPills contract={contract} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#303630]">
                {removeInternalTestLabel(contract.advertiser_name, "광고주")}
              </p>
            </div>
            <PreviewAmount value={formatMoneyLabel(contract.fee_label)} />
            <div className="hidden lg:block">
              <StageTiming contract={contract} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function StageBadge({
  stage,
  dense = false,
}: {
  stage: InfluencerDashboardContractStage;
  dense?: boolean;
}) {
  const meta = getStageMeta(stage);

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

function StageTiming({
  contract,
}: {
  contract: InfluencerDashboardContract;
}) {
  return (
    <div className="min-w-0">
      <StageBadge stage={contract.stage} />
    </div>
  );
}

function PreviewAmount({ value }: { value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-semibold text-[#303630]">{value}</p>
    </div>
  );
}

function PlatformPills({ contract }: { contract: InfluencerDashboardContract }) {
  const items = getInfluencerPlatformDisplayItems(contract);

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {items.slice(0, 3).map((item) => (
        <span
          key={`${item.platform}-${item.label}`}
          className={`inline-flex h-6 max-w-full items-center gap-1 rounded-[5px] border px-2 text-[11px] font-semibold ${PLATFORM_META[item.platform].className}`}
          title={
            item.accountId === "계정 미입력"
              ? item.label
              : `${item.label} · ${item.accountId}`
          }
        >
          <span className="shrink-0">{PLATFORM_META[item.platform].icon}</span>
          <span className="truncate">{item.label}</span>
        </span>
      ))}
      {items.length > 3 && (
        <span className="inline-flex h-6 items-center rounded-[5px] border border-neutral-200 bg-white px-2 text-[11px] font-semibold text-neutral-500">
          +{items.length - 3}
        </span>
      )}
    </div>
  );
}

function getInfluencerPlatformDisplayItems(contract: InfluencerDashboardContract) {
  const source = [
    contract.title,
    contract.next_action_label,
    contract.period_label,
    ...contract.platform_labels,
  ]
    .join(" ")
    .toLowerCase();
  const accounts: Array<{ platform: InfluencerPlatform; url?: string }> =
    contract.platform_accounts.length > 0
      ? contract.platform_accounts
      : contract.platforms.map((platform) => ({ platform }));
  const fallbackAccounts =
    accounts.length > 0 ? accounts : [{ platform: "other" as InfluencerPlatform }];

  return fallbackAccounts.map((account) => ({
    platform: account.platform,
    label: getDetailedInfluencerPlatformLabel(account.platform, source),
    accountId: formatInfluencerAccountId(account.url, account.platform),
  }));
}

function getInfluencerContractPlatforms(contract: InfluencerDashboardContract) {
  const platforms =
    contract.platforms.length > 0
      ? contract.platforms
      : contract.platform_accounts.map((account) => account.platform);
  const uniquePlatforms = Array.from(new Set(platforms));

  return uniquePlatforms.length > 0
    ? uniquePlatforms
    : ["other" as InfluencerPlatform];
}

function formatPlatformFilterLabel(platform: PlatformFilter) {
  if (platform === "all") return "전체";
  return PLATFORM_META[platform].label;
}

function formatDetailStageFilterLabel(stage: DetailStageFilter) {
  if (stage === "all") return "전체";
  return getStageMeta(stage).label;
}

function formatDashboardContractTitle(title: string) {
  const cleaned = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  return formatContractTitleForDisplay(cleaned || title, "계약명 미정");
}

function getDetailedInfluencerPlatformLabel(
  platform: InfluencerPlatform,
  source: string,
) {
  if (platform === "youtube") {
    if (source.includes("shorts") || source.includes("short") || source.includes("숏츠")) {
      return "유튜브-숏츠";
    }
    if (source.includes("longform") || source.includes("long-form") || source.includes("롱폼")) {
      return "유튜브-롱폼";
    }
  }

  if (platform === "instagram") {
    if (source.includes("reels") || source.includes("reel") || source.includes("릴스")) {
      return "인스타그램-릴스";
    }
    if (source.includes("story") || source.includes("stories") || source.includes("스토리")) {
      return "인스타그램-스토리";
    }
    if (source.includes("feed") || source.includes("피드")) return "인스타그램-피드";
  }

  if (platform === "tiktok") return "틱톡-숏폼";
  if (platform === "naver_blog") return "네이버 블로그";
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
