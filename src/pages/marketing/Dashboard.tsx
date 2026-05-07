import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CopyCheck,
  FileText,
  Grid3X3,
  List,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import {
  Contract,
  ContractPlatform,
  ContractStatus,
  useAppStore,
} from "../../store";
import {
  verificationStatusLabel,
  verificationStatusTone,
  type VerificationStatus,
} from "../../domain/verification";
import { removeInternalTestLabel } from "../../domain/display";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { PRODUCT_NAME } from "../../domain/brand";

type StatusFilter = ContractStatus | "ALL";
type ViewMode = "list" | "board";
type AdvertiserAccountSummary = {
  name: string;
  meta: string;
  businessNumber?: string;
};

const STATUS_ORDER: ContractStatus[] = [
  "DRAFT",
  "REVIEWING",
  "NEGOTIATING",
  "APPROVED",
  "SIGNED",
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
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <FileText className="h-4 w-4" strokeWidth={1.8} />,
  },
  REVIEWING: {
    label: "검토 중",
    shortLabel: "검토",
    helper: "상대방 응답 대기",
    tone: "text-neutral-500",
    badge: "border-neutral-200 bg-white text-neutral-700",
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
    tone: "text-neutral-600",
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <PenLine className="h-4 w-4" strokeWidth={1.8} />,
  },
  SIGNED: {
    label: "서명 완료",
    shortLabel: "서명",
    helper: "서명본 보관 및 콘텐츠 이행 관리",
    tone: "text-neutral-600",
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />,
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
    className: "border-neutral-200 bg-white text-neutral-700",
    mark: <span className="text-[10px] font-black">B</span>,
  },
  YOUTUBE: {
    label: "유튜브",
    shortLabel: "유튜브",
    className: "border-[#ff0033]/20 bg-[#ff0033]/10 text-[#d70022]",
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
    className: "border-neutral-200 bg-neutral-950 text-white",
    mark: <span className="text-[12px] font-black">♪</span>,
  },
  OTHER: {
    label: "기타",
    shortLabel: "기타",
    className: "border-neutral-200 bg-white text-neutral-600",
    mark: <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />,
  },
};

export function Dashboard() {
  const navigate = useNavigate();
  const contracts = useAppStore((state) => state.contracts);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const syncError = useAppStore((state) => state.syncError);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [compact, setCompact] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
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
      latest?.subject_name || account?.company_name || contractAdvertiser?.name,
      "광고주 계정",
    );
    const manager = removeInternalTestLabel(
      latest?.submitted_by_name || account?.name || contractAdvertiser?.manager,
    );
    const email = latest?.submitted_by_email || account?.email;
    const meta = [manager, email].filter(Boolean).join(" · ");

    return {
      name,
      meta: meta || "계정 정보 확인 필요",
      businessNumber:
        latest?.business_registration_number || account?.business_registration_number,
    };
  }, [contracts, verificationSummary]);

  const statusCounts = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (acc, status) => {
          acc[status] = contracts.filter((contract) => contract.status === status).length;
          return acc;
        },
        {} as Record<ContractStatus, number>,
      ),
    [contracts],
  );

  const actionQueue = useMemo(() => {
    return contracts
      .filter((contract) => contract.status !== "SIGNED")
      .sort((a, b) => priorityScore(b, currentTime) - priorityScore(a, currentTime));
  }, [contracts, currentTime]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return contracts
      .filter((contract) => {
        if (statusFilter !== "ALL" && contract.status !== statusFilter) return false;
        if (!normalizedQuery) return true;

        return [
          contract.title,
          contract.influencer_info.name,
          contract.influencer_info.contact,
          contract.influencer_info.channel_url,
          formatPlatforms(contract),
          contract.campaign?.budget,
          formatPeriod(contract),
          STATUS_META[contract.status].label,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => parseDate(b.updated_at) - parseDate(a.updated_at));
  }, [contracts, query, statusFilter]);

  const groupedContracts = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (acc, status) => {
          acc[status] = filteredContracts.filter((contract) => contract.status === status);
          return acc;
        },
        {} as Record<ContractStatus, Contract[]>,
      ),
    [filteredContracts],
  );

  const summary = useMemo(() => {
    const now = currentTime;
    const needsAction = contracts.filter(
      (contract) =>
        contract.status === "NEGOTIATING" ||
        contract.workflow?.next_actor === "advertiser",
    ).length;
    const dueSoon = contracts.filter((contract) => {
      const due = parseDate(contract.workflow?.due_at);
      if (!Number.isFinite(due)) return false;
      const days = Math.ceil((due - now) / dayMs);
      return contract.status !== "SIGNED" && days >= 0 && days <= 2;
    }).length;
    const activeLinks = contracts.filter((contract) => {
      if (contract.evidence?.share_token_status !== "active") return false;
      const expiresAt = parseDate(contract.evidence.share_token_expires_at);
      return !Number.isFinite(expiresAt) || expiresAt > now;
    }).length;
    const value = contracts.reduce((sum, contract) => sum + parseMoney(contract.campaign?.budget), 0);

    return { needsAction, dueSoon, activeLinks, value };
  }, [contracts, currentTime]);
  const priorityContracts = actionQueue.slice(0, 3);
  const hasPriorityContracts = priorityContracts.length > 0;

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="flex items-center gap-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="text-[19px] font-semibold tracking-[-0.02em]">{PRODUCT_NAME}</span>
          </button>

          <div className="flex items-center gap-2">
            <SyncPill isSyncing={isSyncing} syncError={syncError} />
            <button
              type="button"
              onClick={() => navigate("/advertiser/builder")}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800 hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)]"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              새 계약
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
        <section
          className={`mb-3 grid min-w-0 items-start gap-3 ${
            hasPriorityContracts
              ? "lg:grid-cols-[minmax(0,1fr)_300px]"
              : "lg:grid-cols-1"
          }`}
        >
          <div className="min-w-0 overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
            <VerificationBanner
              status={advertiserVerificationStatus}
              account={advertiserAccount}
              isLoading={isVerificationLoading}
              onOpen={() => navigate("/advertiser/verification")}
              embedded
            />
            <div className="grid gap-4 p-4 lg:grid-cols-[190px_minmax(0,1fr)] lg:items-center">
              <div className="min-w-0">
                <p className="hidden">
                  광고주 워크스페이스
                </p>
                <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.02em] text-neutral-950">
                  계약 운영 현황
                </h1>
                <p className="hidden">
                  계약명, 인플루언서, 플랫폼, 금액, 기간, 현재 단계를 같은 규칙으로
                  확인하고 바로 다음 행동으로 이동하세요.
                </p>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricTile label="확인 필요" value={summary.needsAction} tone="amber" />
                <MetricTile label="48시간 내 마감" value={summary.dueSoon} tone="rose" />
                <MetricTile label="활성 링크" value={summary.activeLinks} tone="neutral" />
                <MetricTile label="계약 금액" value={formatMoney(summary.value)} tone="neutral" compact />
              </div>
            </div>
          </div>

          <ActionQueue
            contracts={priorityContracts}
            currentTime={currentTime}
            onOpen={(contract) => navigate(`/advertiser/contract/${contract.id}`)}
          />
        </section>

        <section className="rounded-t-lg border border-b-0 border-neutral-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="계약 검색"
                placeholder="계약명, 인플루언서, 플랫폼, 금액으로 검색"
                className="h-10 w-full rounded-md border border-neutral-200 bg-[#fbfbfc] pl-9 pr-4 text-[13px] outline-none transition-colors placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.05)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                active={statusFilter === "ALL"}
                label="전체"
                count={contracts.length}
                onClick={() => setStatusFilter("ALL")}
              />
              {STATUS_ORDER.map((status) => (
                <React.Fragment key={status}>
                  <StatusChip
                    active={statusFilter === status}
                    label={STATUS_META[status].shortLabel}
                    count={statusCounts[status]}
                    onClick={() => setStatusFilter(status)}
                  />
                </React.Fragment>
              ))}
              <span className="mx-1 hidden h-6 w-px bg-neutral-200 lg:inline-block" />
              <IconToggle
                active={viewMode === "list"}
                label="목록"
                icon={<List className="h-4 w-4" />}
                onClick={() => setViewMode("list")}
              />
              <IconToggle
                active={viewMode === "board"}
                label="칸반"
                icon={<Grid3X3 className="h-4 w-4" />}
                onClick={() => setViewMode("board")}
              />
              <button
                type="button"
                onClick={() => setCompact((value) => !value)}
                className={`h-9 rounded-md border px-3 text-[12px] font-semibold transition-colors ${
                  compact
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                }`}
              >
                접은 보기
              </button>
            </div>
          </div>
        </section>

        {syncError && (
          <SyncErrorPanel message={syncError} />
        )}

        {viewMode === "list" ? (
          <ContractTable
            compact={compact}
            contracts={filteredContracts}
            totalContracts={contracts.length}
            onOpen={(contract) => navigate(`/advertiser/contract/${contract.id}`)}
          />
        ) : (
          <ContractBoard
            compact={compact}
            groupedContracts={groupedContracts}
            onOpen={(contract) => navigate(`/advertiser/contract/${contract.id}`)}
          />
        )}
      </main>
    </div>
  );
}

function VerificationBanner({
  status,
  account,
  isLoading,
  onOpen,
  embedded = false,
}: {
  status: VerificationStatus;
  account: AdvertiserAccountSummary;
  isLoading: boolean;
  onOpen: () => void;
  embedded?: boolean;
}) {
  const approved = status === "approved";

  return (
    <section
      className={
        embedded
          ? `border-b px-4 py-3 ${
              approved
                ? "border-neutral-200/80 bg-[#fcfcfd]"
                : "border-amber-200 bg-amber-50/85"
            }`
          : `mb-3 rounded-lg border px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
              approved
                ? "border-neutral-200 bg-white"
                : "border-amber-200 bg-amber-50/85"
            }`
      }
    >
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              approved
                ? "bg-white text-neutral-800 ring-1 ring-neutral-200"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-neutral-950">
                광고주 사업자 인증
              </p>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${verificationStatusTone(
                  status,
                )}`}
              >
                {isLoading ? "확인중" : verificationStatusLabel(status)}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-4 text-neutral-500">
              <span className="max-w-[220px] truncate font-semibold text-neutral-800">
                {account.name}
              </span>
              <span className="hidden h-3 w-px bg-neutral-200 sm:inline-block" />
              <span className="max-w-[340px] truncate">{account.meta}</span>
              {account.businessNumber && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-600">
                  사업자 {formatBusinessRegistrationNumber(account.businessNumber)}
                </span>
              )}
            </div>
            <p className="hidden">
              {approved
                ? "인증이 완료되어 계약 공유 링크를 발송할 수 있습니다."
                : "계약 초안 작성은 가능하지만, 공유 링크 발송은 운영자 승인 후 가능합니다."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className={`h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition ${
            approved
              ? "border border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50"
              : "bg-neutral-950 text-white hover:bg-neutral-800"
          }`}
        >
          {approved ? "인증 정보 보기" : "인증 요청하기"}
        </button>
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: number | string;
  tone: "amber" | "rose" | "sky" | "neutral";
  compact?: boolean;
}) {
  const accentClass = {
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    sky: "bg-neutral-500",
    neutral: "bg-neutral-500",
  }[tone];
  const valueClass = {
    amber: "text-amber-700",
    rose: "text-rose-700",
    sky: "text-neutral-950",
    neutral: "text-neutral-950",
  }[tone];

  return (
    <div className="rounded-md border border-neutral-200/80 bg-[#fcfcfd] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${accentClass}`} />
        <p className="text-[11px] font-semibold leading-4 text-neutral-500">{label}</p>
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

function SyncPill({
  isSyncing,
  syncError,
}: {
  isSyncing: boolean;
  syncError?: string;
}) {
  if (syncError) {
    return (
      <span className="hidden h-9 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 text-[12px] font-semibold text-amber-700 sm:inline-flex">
        <AlertCircle className="h-3.5 w-3.5" />
        동기화 확인 필요
      </span>
    );
  }

  return (
    <span className="hidden h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-600 sm:inline-flex">
      <CopyCheck className="h-3.5 w-3.5 text-neutral-500" />
      {isSyncing ? "저장 중" : "저장 완료"}
    </span>
  );
}

function ActionQueue({
  contracts,
  currentTime,
  onOpen,
}: {
  contracts: Contract[];
  currentTime: number;
  onOpen: (contract: Contract) => void;
}) {
  if (contracts.length === 0) return null;

  return (
    <aside className="min-w-0 rounded-lg border border-neutral-200/80 bg-white p-3 text-neutral-950 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_42px_rgba(15,23,42,0.06)]">
      <div className="mb-2 flex min-w-0 items-center justify-between">
        <div className="min-w-0">
          <p className="hidden">
            우선 확인 항목
          </p>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            먼저 확인할 계약
          </h2>
        </div>
        <Sparkles className="h-4 w-4 text-amber-500" />
      </div>

      <div className="min-w-0 space-y-2">
        {contracts.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[12px] leading-5 text-neutral-500">
            광고주가 바로 처리해야 할 계약이 없습니다.
          </div>
        ) : (
          contracts.map((contract) => (
            <button
              key={contract.id}
              type="button"
              onClick={() => onOpen(contract)}
              className="group w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] p-3 text-left transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-white hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{contract.title}</p>
                  <p className="mt-1 truncate text-[12px] text-neutral-400">
                    {contract.influencer_info.name} · {nextActionLabel(contract)}
                  </p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-900" />
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-neutral-500">
                <StatusBadge status={contract.status} dense />
                <span>{formatDue(contract.workflow?.due_at, currentTime)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function StatusChip({
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
      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[12px] font-semibold transition-colors ${
        active
          ? "border-neutral-950 bg-neutral-950 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] ${
          active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function IconToggle({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
        active
          ? "border-neutral-950 bg-neutral-950 text-white"
          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
      }`}
    >
      {icon}
    </button>
  );
}

function ContractTable({
  contracts,
  compact,
  totalContracts,
  onOpen,
}: {
  contracts: Contract[];
  compact: boolean;
  totalContracts: number;
  onOpen: (contract: Contract) => void;
}) {
  if (contracts.length === 0) return <EmptyState isInitialEmpty={totalContracts === 0} />;

  return (
    <section className="overflow-hidden rounded-b-lg border-x border-b border-neutral-200/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.04)]">
      <div
        className={`hidden border-b border-neutral-200 bg-[#fbfbfc] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 lg:grid ${
          compact
            ? "grid-cols-[minmax(260px,1fr)_220px_150px_48px]"
            : "grid-cols-[minmax(260px,1.35fr)_190px_180px_140px_170px_160px_48px]"
        }`}
      >
        <span>계약명</span>
        <span>인플루언서</span>
        {!compact && <span>플랫폼</span>}
        {!compact && <span>금액</span>}
        {!compact && <span>기간</span>}
        <span>현 단계</span>
        <span />
      </div>
      <div className="divide-y divide-neutral-100">
        {contracts.map((contract) => (
          <React.Fragment key={contract.id}>
            <ContractRow
              compact={compact}
              contract={contract}
              onOpen={() => onOpen(contract)}
            />
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function ContractRow({
  contract,
  compact,
  onOpen,
}: {
  contract: Contract;
  compact: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 lg:items-center ${
        compact
          ? "lg:grid-cols-[minmax(260px,1fr)_220px_150px_48px]"
          : "lg:grid-cols-[minmax(260px,1.35fr)_190px_180px_140px_170px_160px_48px]"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-neutral-950">
          {contract.title}
        </p>
        {!compact && (
          <p className="mt-1 truncate text-[12px] text-neutral-500">
            {nextActionLabel(contract)}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-neutral-800">
          {contract.influencer_info.name}
        </p>
        {!compact && (
          <p className="truncate text-[12px] text-neutral-400">
            {contract.influencer_info.contact || "연락처 미입력"}
          </p>
        )}
      </div>

      {!compact && (
        <>
          <PlatformBadges contract={contract} />
          <TableText label="금액" value={contract.campaign?.budget ?? "미정"} />
          <TableText label="기간" value={formatPeriod(contract)} />
        </>
      )}

      <StatusBadge status={contract.status} />

      <div className="hidden justify-end lg:flex">
        <ArrowUpRight className="h-4 w-4 text-neutral-300 transition-colors group-hover:text-neutral-900" />
      </div>
    </button>
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
        dense ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]"
      }`}
    >
      <span className={inverted ? "text-white" : meta.tone}>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function PlatformBadges({ contract }: { contract: Contract }) {
  const platforms = getContractPlatforms(contract);

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
            {meta.mark}
            <span className="truncate">{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function ContractBoard({
  groupedContracts,
  compact,
  onOpen,
}: {
  groupedContracts: Record<ContractStatus, Contract[]>;
  compact: boolean;
  onOpen: (contract: Contract) => void;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const contracts = groupedContracts[status];

        return (
          <div key={status} className="min-w-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className={meta.tone}>{meta.icon}</span>
                <div>
                  <h2 className="text-[13px] font-semibold text-neutral-900">
                    {meta.label}
                  </h2>
                  <p className="hidden">{meta.helper}</p>
                </div>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[12px] font-semibold text-neutral-500 ring-1 ring-neutral-200">
                {contracts.length}
              </span>
            </div>
            <div className="space-y-2">
              {contracts.length === 0 ? (
                <div className="flex min-h-[72px] items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-white/50 text-[13px] text-neutral-300">
                  계약 없음
                </div>
              ) : (
                contracts.map((contract) => (
                  <button
                    key={contract.id}
                    type="button"
                    onClick={() => onOpen(contract)}
                    className="group w-full rounded-lg border border-neutral-200/80 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
                  >
                    <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-neutral-950">
                      {contract.title}
                    </p>
                    <p className="mt-2 truncate text-[12px] font-semibold text-neutral-600">
                      {contract.influencer_info.name}
                    </p>
                    {!compact && (
                      <div className="mt-4 space-y-2">
                        <PlatformBadges contract={contract} />
                        <p className="truncate text-[12px] text-neutral-500">
                          {contract.campaign?.budget ?? "금액 미정"} · {formatPeriod(contract)}
                        </p>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function EmptyState({ isInitialEmpty }: { isInitialEmpty: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center rounded-b-lg border-x border-b border-neutral-200/80 bg-white px-6 text-center shadow-[0_18px_48px_rgba(15,23,42,0.04)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fbfbfc] text-neutral-300 ring-1 ring-neutral-200">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <p className="mt-3 text-[15px] font-semibold text-neutral-900">
        {isInitialEmpty ? "아직 계약이 없습니다" : "조건에 맞는 계약이 없습니다"}
      </p>
      <p className="mt-1 max-w-md text-[13px] leading-6 text-neutral-500">
        {isInitialEmpty
          ? "사업자 인증이 완료되어 있다면 새 계약을 만들고, 초안 저장 후 최종본 공유 링크를 활성화할 수 있습니다."
          : "검색어를 줄이거나 상태 필터를 전체로 바꿔보세요."}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <a
          href="/advertiser/builder"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800"
        >
          새 계약 만들기
        </a>
      </div>
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

const dayMs = 24 * 60 * 60 * 1000;

function priorityScore(contract: Contract, currentTime: number) {
  const statusWeight: Record<ContractStatus, number> = {
    NEGOTIATING: 50,
    APPROVED: 40,
    REVIEWING: 30,
    DRAFT: 20,
    SIGNED: 0,
  };
  const due = parseDate(contract.workflow?.due_at);
  const dueBoost = Number.isFinite(due) ? Math.max(0, 20 - Math.ceil((due - currentTime) / dayMs) * 4) : 0;
  const actorBoost = contract.workflow?.next_actor === "advertiser" ? 20 : 0;
  return statusWeight[contract.status] + dueBoost + actorBoost;
}

function nextActionLabel(contract: Contract) {
  if (contract.workflow?.next_action) return contract.workflow.next_action;

  const actions: Record<ContractStatus, string> = {
    DRAFT: "초안을 완성하고 공유 링크를 발송하세요.",
    REVIEWING: "인플루언서의 검토 응답을 기다리는 중입니다.",
    NEGOTIATING: "수정 요청을 검토하고 답변하세요.",
    APPROVED: "최종본 서명을 요청할 수 있습니다.",
    SIGNED: "서명본과 감사 기록을 보관하고, 필요한 콘텐츠 제출/검수를 이어가세요.",
  };

  return actions[contract.status];
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

function formatPlatforms(contract: Contract) {
  return getContractPlatforms(contract)
    .map((platform) => PLATFORM_META[platform].label)
    .join(", ");
}

function formatPeriod(contract: Contract) {
  if (contract.campaign?.period) return contract.campaign.period;
  if (contract.campaign?.start_date && contract.campaign?.end_date) {
    return `${formatDate(contract.campaign.start_date)} - ${formatDate(contract.campaign.end_date)}`;
  }
  if (contract.campaign?.deadline) return `${formatDate(contract.campaign.deadline)}까지`;
  if (contract.workflow?.due_at) return `${formatDate(contract.workflow.due_at)}까지`;
  return "미정";
}

function formatDue(value: string | undefined, currentTime: number) {
  if (!value) return "기한 미정";
  const due = new Date(value);
  const days = Math.ceil((due.getTime() - currentTime) / dayMs);

  if (days < 0) return `${Math.abs(days)}일 지연`;
  if (days === 0) return "오늘 마감";
  if (days === 1) return "내일 마감";
  return `${format(due, "MM.dd")} 마감`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "yyyy.MM.dd");
}

function parseDate(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function parseMoney(value?: string) {
  if (!value || value.includes("%")) return 0;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  if (value <= 0) return "-";
  if (value >= 100000000) return `${Math.round(value / 100000000)}억`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString()}만`;
  return value.toLocaleString();
}

function formatBusinessRegistrationNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-**-${digits.slice(5)}`;
}
