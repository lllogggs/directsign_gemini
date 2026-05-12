import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CopyCheck,
  FileText,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
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
import { formatElapsedDayLabel, formatUploadDueLabel } from "../../domain/timing";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { PRODUCT_NAME } from "../../domain/brand";

type StatusFilter = "AUTHORING" | "REVISION" | "SIGNING" | "DONE";
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

const DASHBOARD_TABS: Array<{
  id: StatusFilter;
  label: string;
  statuses: ContractStatus[];
}> = [
  { id: "AUTHORING", label: "작성", statuses: ["DRAFT", "REVIEWING"] },
  { id: "REVISION", label: "수정", statuses: ["NEGOTIATING"] },
  { id: "SIGNING", label: "서명", statuses: ["APPROVED"] },
  { id: "DONE", label: "완료", statuses: ["SIGNED"] },
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
    label: "제안",
    shortLabel: "제안",
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
    helper: "서명본 보관 및 콘텐츠 이행 관리",
    tone: "text-neutral-900",
    badge: "border-neutral-300 bg-neutral-100 text-neutral-900",
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
    className: "border-neutral-200 bg-white text-neutral-700",
    mark: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
        <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 14.9V9.1l5.2 2.9L10 14.9Z" />
      </svg>
    ),
  },
  INSTAGRAM: {
    label: "인스타그램",
    shortLabel: "인스타",
    className: "border-neutral-200 bg-white text-neutral-700",
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
    className: "border-neutral-200 bg-white text-neutral-700",
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("AUTHORING");
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
        const selectedTab = DASHBOARD_TABS.find((tab) => tab.id === statusFilter);

        if (selectedTab && !selectedTab.statuses.includes(contract.status)) {
          return false;
        }
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
  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="flex items-center gap-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="text-[18px] font-semibold tracking-[-0.02em]">{PRODUCT_NAME}</span>
          </button>

          <div className="flex items-center gap-2">
            <SyncPill isSyncing={isSyncing} syncError={syncError} />
            <button
              type="button"
              onClick={() => navigate("/advertiser/builder")}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-950 px-4 text-[13px] font-semibold text-white transition hover:bg-neutral-800"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              새 계약
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
        <section className="min-w-0 overflow-hidden rounded-[8px] border border-[#cbd5cc] bg-[#fdfdfb] shadow-[0_22px_60px_rgba(23,26,23,0.10)]">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#7d857f]">
                  계약 운영 화면
                </p>
                <h1 className="mt-1 truncate text-[18px] font-semibold text-[#171a17]">
                  캠페인 계약 운영
                </h1>
                <p className="mt-1 text-[12px] font-medium text-[#7d857f]">
                  전체 {contracts.length.toLocaleString()}건 · 검색 결과 {filteredContracts.length.toLocaleString()}건
                </p>
              </div>
              <span className="inline-flex h-8 items-center rounded-[8px] bg-[#eef0ed] px-3 text-[12px] font-semibold text-[#303630]">
                발송 가능
              </span>
            </div>
          </div>

          <VerificationBanner
            status={advertiserVerificationStatus}
            account={advertiserAccount}
            isLoading={isVerificationLoading}
            onOpen={() => navigate("/advertiser/verification")}
            embedded
          />

          <div className="grid xl:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0 p-4">
              <div className="mb-3 rounded-[8px] border border-[#d9e0d9] bg-[#f8faf7] p-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-[12px] font-semibold text-[#7d857f]">
                      오늘 처리할 계약
                    </p>
                    <p className="mt-1 text-[20px] font-semibold text-[#171a17]">
                      바로 처리할 일
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MetricTile label="확인 필요" value={summary.needsAction} tone="amber" />
                    <MetricTile label="48시간 내 처리" value={summary.dueSoon} tone="rose" />
                    <MetricTile label="활성 링크" value={summary.activeLinks} tone="sky" />
                    <MetricTile label="계약 금액" value={formatMoney(summary.value)} tone="neutral" compact />
                  </div>
                </div>
              </div>

              <section className="rounded-t-[8px] border border-b-0 border-[#d9e0d9] bg-white p-2">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      aria-label="계약 검색"
                      placeholder="계약명, 상대방, 플랫폼 검색"
                      className="h-9 w-full rounded-[6px] border border-[#d9e0d9] bg-[#f8faf7] pl-8 pr-3 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17] focus:bg-white"
                    />
                  </div>
                  <DashboardTabs
                    activeTab={statusFilter}
                    counts={statusCounts}
                    onChange={setStatusFilter}
                  />
                </div>
              </section>

              {syncError && <SyncErrorPanel message={syncError} />}

              <ContractTable
                compact={false}
                contracts={filteredContracts}
                currentTime={currentTime}
                statusFilter={statusFilter}
                totalContracts={contracts.length}
                onOpen={(contract) => navigate(`/advertiser/contract/${contract.id}`)}
              />
            </div>

            <ActionQueue
              contracts={priorityContracts}
              currentTime={currentTime}
              onOpen={(contract) => navigate(`/advertiser/contract/${contract.id}`)}
            />
          </div>
        </section>
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
                ? "border-neutral-200 bg-neutral-50"
                : "border-amber-200 bg-amber-50/85"
            }`
          : `mb-3 rounded-md border px-3 py-2.5 ${
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
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className={`h-9 shrink-0 whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition ${
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
    sky: "bg-sky-500",
    neutral: "bg-neutral-500",
  }[tone];
  const valueClass = {
    amber: "text-amber-700",
    rose: "text-rose-700",
    sky: "text-sky-700",
    neutral: "text-neutral-950",
  }[tone];

  return (
    <div className="rounded-[8px] border border-[#d9e0d9] bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${accentClass}`} />
        <p className="text-[11px] font-semibold leading-4 text-[#7d857f]">{label}</p>
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
      <span className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-[12px] font-semibold text-amber-700">
        <AlertCircle className="h-3.5 w-3.5" />
        동기화 확인 필요
      </span>
    );
  }

  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-600">
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
  return (
    <aside className="border-t border-[#d9e0d9] bg-[#f8faf7] p-4 xl:border-l xl:border-t-0">
      <p className="text-[12px] font-semibold text-[#59605b]">최근 이력</p>
      <div className="mt-4 space-y-4">
        {contracts.length > 0 ? (
          contracts.map((contract) => (
            <button
              key={contract.id}
              type="button"
              onClick={() => onOpen(contract)}
              className="group flex w-full gap-3 text-left"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#303630]" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-[#8b938d]">
                  {STATUS_META[contract.status].label} · {formatAdvertiserTimingLabel(contract, currentTime)}
                </span>
                <span className="mt-1 block line-clamp-2 text-[12px] font-semibold leading-5 text-[#303630]">
                  {formatDashboardContractTitle(contract.title)}
                </span>
              </span>
            </button>
          ))
        ) : (
          <p className="text-[12px] font-semibold leading-5 text-[#8b938d]">
            바로 처리할 계약이 없습니다.
          </p>
        )}
      </div>
    </aside>
  );
}

function DashboardTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: StatusFilter;
  counts: Record<ContractStatus, number>;
  onChange: (tab: StatusFilter) => void;
}) {
  return (
    <div
      className="grid min-w-0 grid-cols-4 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1 lg:w-[360px] lg:shrink-0"
      role="tablist"
      aria-label="계약 상태"
    >
      {DASHBOARD_TABS.map((tab) => {
        const active = activeTab === tab.id;
        const count = tab.statuses.reduce((sum, status) => sum + counts[status], 0);

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

function ContractTable({
  contracts,
  compact,
  currentTime,
  statusFilter,
  totalContracts,
  onOpen,
}: {
  contracts: Contract[];
  compact: boolean;
  currentTime: number;
  statusFilter: StatusFilter;
  totalContracts: number;
  onOpen: (contract: Contract) => void;
}) {
  if (contracts.length === 0) return <EmptyState isInitialEmpty={totalContracts === 0} />;

  const dueHeader = getAdvertiserDueHeader(statusFilter);

  return (
    <section className="overflow-hidden rounded-b-[8px] border border-[#d9e0d9] bg-white">
      <div
        className={`hidden border-b border-[#d9e0d9] bg-[#f8faf7] px-4 py-3 text-[11px] font-semibold text-[#7d857f] lg:grid ${
          compact
            ? "grid-cols-[minmax(220px,1fr)_130px_90px_120px]"
            : "grid-cols-[minmax(260px,1fr)_150px_100px_130px]"
        }`}
      >
        <span>계약</span>
        <span>상대</span>
        <span>금액</span>
        <span>{dueHeader}</span>
      </div>
      <div className="divide-y divide-[#edf1ed]">
        {contracts.map((contract) => (
          <React.Fragment key={contract.id}>
            <ContractRow
              compact={compact}
              contract={contract}
              currentTime={currentTime}
              statusFilter={statusFilter}
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
  currentTime,
  statusFilter,
  onOpen,
}: {
  contract: Contract;
  compact: boolean;
  currentTime: number;
  statusFilter: StatusFilter;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8faf7] lg:items-center ${
        compact
          ? "lg:grid-cols-[minmax(220px,1fr)_130px_90px_120px]"
          : "lg:grid-cols-[minmax(260px,1fr)_150px_100px_130px]"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-[#171a17]">
          {formatDashboardContractTitle(contract.title)}
        </p>
        <p className="mt-1 truncate text-[12px] text-[#7d857f]">
          {formatPlatforms(contract) || formatContractTypeLabel(contract.type)} · {formatPeriod(contract)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#303630]">
          {contract.influencer_info.name}
        </p>
        <p className="truncate text-[12px] text-[#8b938d]">
          인플루언서
        </p>
      </div>

      <PreviewAmount value={contract.campaign?.budget ?? "미정"} />

      <StatusTiming
        contract={contract}
        currentTime={currentTime}
        showStatus={statusFilter === "AUTHORING"}
      />
    </button>
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

function StatusTiming({
  contract,
  currentTime,
  showStatus,
}: {
  contract: Contract;
  currentTime: number;
  showStatus: boolean;
}) {
  return (
    <div className="min-w-0">
      {showStatus && <StatusBadge status={contract.status} />}
      <p
        className={`truncate text-[12px] font-semibold tabular-nums ${
          showStatus ? "mt-1 text-neutral-400" : "text-neutral-600"
        }`}
      >
        {formatAdvertiserTimingLabel(contract, currentTime)}
      </p>
    </div>
  );
}

function PreviewAmount({ value }: { value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-semibold text-[#303630]">{value}</p>
      <p className="mt-1 truncate text-[12px] text-[#8b938d]">금액</p>
    </div>
  );
}

function EmptyState({ isInitialEmpty }: { isInitialEmpty: boolean }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center rounded-b-[8px] border border-[#d9e0d9] bg-white px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
        <FileText className="h-5 w-5" strokeWidth={1.7} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
        {isInitialEmpty ? "아직 계약이 없습니다" : "조건에 맞는 계약이 없습니다"}
      </h2>
      <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
        {isInitialEmpty
          ? "새 계약을 만들면 이곳에서 바로 관리할 수 있습니다."
          : "검색어를 줄이거나 전체로 바꿔보세요."}
      </p>
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
  return getContractPlatformDisplayItems(contract)
    .map((item) => item.label)
    .join(", ");
}

function formatContractTypeLabel(type: Contract["type"]) {
  if (type === "PPL") return "유료 광고 (PPL)";
  if (type === "협찬") return "제품 협찬";
  if (type === "공동구매") return "공동구매";
  return type;
}

function formatDashboardContractTitle(title: string) {
  const cleaned = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  return removeInternalTestLabel(cleaned || title, "계약명 미정");
}

function getAdvertiserDueHeader(statusFilter: StatusFilter) {
  if (statusFilter === "AUTHORING") return "현 단계";
  if (statusFilter === "DONE") return "기한";
  const headers: Record<Exclude<StatusFilter, "AUTHORING" | "DONE">, string> = {
    REVISION: "수정요청일로부터",
    SIGNING: "서명요청일로부터",
  };
  return headers[statusFilter];
}

function getContractPlatformDisplayItems(contract: Contract) {
  const source = getContractPlatformSource(contract);

  return getContractPlatforms(contract).flatMap((platform) =>
    getPlatformLabelsFromSource(platform, source).map((label) => ({
      platform,
      label,
      title: PLATFORM_META[platform].label,
    })),
  );
}

function getContractPlatformSource(contract: Contract) {
  return [
    contract.title,
    contract.type,
    contract.influencer_info.channel_url,
    ...(contract.campaign?.deliverables ?? []),
    ...(contract.clauses ?? []).map((clause) => clause.content),
  ]
    .join(" ")
    .toLowerCase();
}

function getPlatformLabelsFromSource(platform: ContractPlatform, source: string) {
  const labels: string[] = [];
  const add = (label: string) => {
    if (!labels.includes(label)) labels.push(label);
  };

  if (platform === "YOUTUBE") {
    if (source.includes("shorts") || source.includes("숏츠")) add("유튜브-숏츠");
    if (
      source.includes("longform") ||
      source.includes("long-form") ||
      source.includes("롱폼")
    ) {
      add("유튜브-롱폼");
    }
  }

  if (platform === "INSTAGRAM") {
    if (source.includes("reels") || source.includes("reel") || source.includes("릴스")) {
      add("인스타그램-릴스");
    }
    if (source.includes("story") || source.includes("stories") || source.includes("스토리")) {
      add("인스타그램-스토리");
    }
    if (source.includes("feed") || source.includes("피드")) add("인스타그램-피드");
    if (source.includes("live") || source.includes("라이브")) add("인스타그램-라이브");
  }

  if (platform === "TIKTOK") {
    if (source.includes("short") || source.includes("숏폼")) add("틱톡-숏폼");
  }

  if (platform === "NAVER_BLOG") add("네이버 블로그");
  if (platform === "OTHER") add("기타");

  return labels.length > 0 ? labels : [PLATFORM_META[platform].label];
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

function formatAdvertiserTimingLabel(contract: Contract, currentTime: number) {
  if (contract.status === "SIGNED") {
    return formatUploadDueLabel(
      contract.campaign?.upload_due_at ?? contract.campaign?.deadline,
      currentTime,
      "기한",
    );
  }

  const elapsedPrefix: Record<Exclude<ContractStatus, "SIGNED">, string> = {
    DRAFT: "작성일로부터",
    REVIEWING: "제안일로부터",
    NEGOTIATING: "수정요청일로부터",
    APPROVED: "서명요청일로부터",
  };

  return formatElapsedDayLabel(
    contract.updated_at ?? contract.created_at,
    currentTime,
    elapsedPrefix[contract.status],
  );
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
