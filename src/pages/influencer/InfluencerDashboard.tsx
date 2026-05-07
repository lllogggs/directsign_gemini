import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
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
  Sparkles,
  UserCheck,
  Youtube,
} from "lucide-react";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import type {
  InfluencerDashboardContract,
  InfluencerDashboardContractStage,
  InfluencerDashboardResponse,
  InfluencerDashboardTask,
} from "../../domain/influencerDashboard";
import { buildLoginRedirect } from "../../domain/navigation";
import { removeInternalTestLabel } from "../../domain/display";
import type { InfluencerPlatform, VerificationStatus } from "../../domain/verification";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; dashboard: InfluencerDashboardResponse }
  | { status: "error"; message: string };

type ContractFilter = "all" | InfluencerDashboardContractStage;

const STAGE_ORDER: ContractFilter[] = [
  "all",
  "review_needed",
  "change_pending",
  "ready_to_sign",
  "deliverables_due",
  "deliverables_review",
  "signed",
  "completed",
];

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

const isAsciiOnly = (value: string) =>
  value.split("").every((character) => character.charCodeAt(0) <= 0x7f);

const getDashboardErrorMessage = (message?: string) => {
  if (!message) return "인플루언서 대시보드를 불러오지 못했습니다.";
  if (isAsciiOnly(message)) {
    return "인플루언서 대시보드를 불러오지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  return message;
};

export function InfluencerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ContractFilter>("all");

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
        throw new Error(
          errorMessage ?? `인플루언서 대시보드 API 오류 (${response.status})`,
        );
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
  const filteredContracts = dashboard.contracts.filter((contract) => {
    if (filter !== "all" && contract.stage !== filter) return false;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    return [
      contract.title,
      contract.advertiser_name,
      contract.fee_label,
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

  const handleLogout = async () => {
    await apiFetch("/api/influencer/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/login/influencer", { replace: true });
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
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
        <section
          className={`mb-3 grid min-w-0 items-start gap-3 ${
            dashboard.tasks.length > 0
              ? "lg:grid-cols-[minmax(0,1fr)_300px]"
              : "lg:grid-cols-1"
          }`}
        >
          <div className="min-w-0 overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
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
            <div className="grid gap-4 p-4 lg:grid-cols-[190px_minmax(0,1fr)] lg:items-center">
              <div className="min-w-0">
                <h1 className="text-[22px] font-semibold leading-7 tracking-normal text-neutral-950">
                  계약 처리 현황
                </h1>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
                <SummaryTile
                  label="검토 필요"
                  value={dashboard.summary.review_needed}
                  icon={<FileText className="h-4 w-4" />}
                  tone="amber"
                />
                <SummaryTile
                  label="수정 협의"
                  value={dashboard.summary.change_pending}
                  icon={<Clock3 className="h-4 w-4" />}
                  tone="amber"
                />
                <SummaryTile
                  label="서명 준비"
                  value={dashboard.summary.ready_to_sign}
                  icon={<FileSignature className="h-4 w-4" />}
                  tone="neutral"
                />
                <SummaryTile
                  label="완료"
                  value={dashboard.summary.signed}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  tone="neutral"
                />
                <SummaryTile
                  label="확정 금액"
                  value={dashboard.summary.total_fixed_fee_label}
                  icon={<FileCheck2 className="h-4 w-4" />}
                  tone="neutral"
                  compact
                />
              </div>
            </div>
          </div>

          <PriorityPanel
            tasks={dashboard.tasks}
            nextDeadline={dashboard.summary.next_deadline}
            onOpen={(href) => { void navigate(href); }}
          />
        </section>

        <section className="rounded-t-lg border border-b-0 border-neutral-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="계약 검색"
              placeholder="계약명, 광고주, 플랫폼 검색"
              className="h-10 w-full rounded-md border border-neutral-200 bg-[#fbfbfc] pl-9 pr-3 text-[13px] outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.05)]"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            {STAGE_ORDER.map((stage) => (
              <React.Fragment key={stage}>
                <FilterChip
                  active={filter === stage}
                  label={stage === "all" ? "전체" : getStageMeta(stage).label}
                  count={
                    stage === "all"
                      ? dashboard.contracts.length
                      : dashboard.contracts.filter((contract) => contract.stage === stage).length
                  }
                  onClick={() => setFilter(stage)}
                />
              </React.Fragment>
            ))}
          </div>
          </div>
        </section>

        {filteredContracts.length === 0 ? (
          <EmptyContracts hasQuery={query.trim().length > 0 || filter !== "all"} />
        ) : (
          <ContractTable
            contracts={filteredContracts}
            onOpen={(contract) => { void navigate(contract.action_href); }}
          />
        )}
      </main>
    </DashboardShell>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">{children}</div>;
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
              <span className="hidden h-3 w-px bg-neutral-200 sm:inline-block" />
              <span className="max-w-[340px] truncate">{dashboard.user.email}</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600">
                이메일 {dashboard.user.email_verified ? "확인됨" : "확인 필요"}
              </span>
              {approvedPlatforms.map((platform) => (
                <span
                  key={`${platform.platform}:${platform.handle}`}
                  className="inline-flex max-w-[170px] items-center gap-1.5 truncate rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600"
                >
                  {PLATFORM_META[platform.platform].icon}
                  <span className="truncate">{platform.handle}</span>
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

function PriorityPanel({
  tasks,
  nextDeadline,
  onOpen,
}: {
  tasks: InfluencerDashboardTask[];
  nextDeadline?: string;
  onOpen: (href: string) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <aside className="rounded-lg border border-neutral-200/80 bg-white p-4 text-neutral-950 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_42px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold leading-6">
            먼저 처리할 계약
          </h2>
        </div>
        <Sparkles className="h-4 w-4 text-amber-500" />
      </div>
      <p className="mt-2 text-[12px] font-semibold text-neutral-500">
        {nextDeadline ? formatDeadline(nextDeadline) : "마감 없음"}
      </p>
      <div className="mt-4 space-y-2">
        {tasks.slice(0, 3).map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onOpen(task.href)}
            className="group w-full rounded-md border border-neutral-200 bg-[#fbfbfc] px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-white hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[13px] font-semibold">
                {task.title}
              </p>
              <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-950" />
            </div>
            <p className="mt-1 truncate text-[12px] text-neutral-500">
              {task.action_label}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  tone,
  compact = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "sky" | "amber" | "neutral" | "dark";
  compact?: boolean;
}) {
  const accentClass = {
    sky: "bg-neutral-500",
    amber: "bg-amber-500",
    neutral: "bg-neutral-500",
    dark: "bg-neutral-500",
  }[tone];
  const valueClass = {
    sky: "text-neutral-950",
    amber: "text-amber-700",
    neutral: "text-neutral-950",
    dark: "text-neutral-950",
  }[tone];
  const spanClass = compact ? "col-span-2 sm:col-span-1" : "";

  return (
    <div className={`rounded-md border border-neutral-200/80 bg-[#fcfcfd] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${spanClass}`}>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${accentClass}`} />
        <p className="text-[11px] font-semibold leading-4 text-neutral-500">{label}</p>
        <span className="hidden">{icon}</span>
      </div>
      <p
        className={`mt-2 font-semibold tracking-[-0.03em] ${valueClass} ${
          compact ? "text-[18px]" : "text-[22px]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-[12px] font-semibold transition ${
        active
          ? "border-neutral-950 bg-neutral-950 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
      }`}
    >
      {label}
      <span className={active ? "text-white/70" : "text-neutral-400"}>{count}</span>
    </button>
  );
}

function EmptyContracts({ hasQuery }: { hasQuery: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center rounded-b-lg border-x border-b border-neutral-200/80 bg-white px-6 text-center shadow-[0_18px_48px_rgba(15,23,42,0.04)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fbfbfc] text-neutral-300 ring-1 ring-neutral-200">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[15px] font-semibold text-neutral-950">
        {hasQuery ? "조건에 맞는 계약이 없습니다" : "아직 받은 계약이 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[13px] leading-6 text-neutral-500">
        {hasQuery
          ? "검색어를 줄이거나 상태 필터를 전체로 바꿔보세요."
          : "계약 초대가 오면 검토, 수정 협의, 플랫폼 인증, 서명 순서대로 이곳에 표시됩니다."}
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
    <section className="overflow-hidden rounded-b-lg border-x border-b border-neutral-200/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.04)]">
      <div className="hidden grid-cols-[minmax(260px,1.35fr)_190px_180px_140px_170px_160px_48px] border-b border-neutral-200 bg-[#fbfbfc] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 lg:grid">
        <span>계약명</span>
        <span>광고주</span>
        <span>플랫폼</span>
        <span>금액</span>
        <span>기간</span>
        <span>현 단계</span>
        <span />
      </div>
      <div className="divide-y divide-neutral-100">
        {contracts.map((contract) => (
          <button
            key={contract.id}
            type="button"
            onClick={() => onOpen(contract)}
            className="group grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 lg:grid-cols-[minmax(260px,1.35fr)_190px_180px_140px_170px_160px_48px] lg:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-neutral-950">
                {contract.title}
              </p>
              <p className="mt-1 truncate text-[12px] text-neutral-500">
                {contract.next_action_label}
              </p>
            </div>
            <TableText label="광고주" value={contract.advertiser_name} />
            <PlatformChips contract={contract} />
            <TableText label="금액" value={contract.fee_label} />
            <TableText label="기간" value={contract.period_label} />
            <StageBadge stage={contract.stage} />
            <div className="hidden justify-end lg:flex">
              <ArrowRight className="h-4 w-4 text-neutral-300 transition-colors group-hover:text-neutral-900" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TableText({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-300 lg:hidden">
        {label}
      </p>
      <p className="truncate text-[13px] text-neutral-700">{value}</p>
    </div>
  );
}

function StageBadge({ stage }: { stage: InfluencerDashboardContractStage }) {
  const meta = getStageMeta(stage);

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function PlatformChips({ contract }: { contract: InfluencerDashboardContract }) {
  const platforms = contract.platforms.length ? contract.platforms : (["other"] as InfluencerPlatform[]);

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {platforms.map((platform) => {
        const meta = PLATFORM_META[platform];
        return (
          <span
            key={platform}
            title={meta.label}
            className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold ${meta.className}`}
          >
            {meta.icon}
            <span className="truncate">{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDeadline(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘 마감";
  if (days === 1) return "내일 마감";
  return `${formatDate(value)} 마감`;
}
