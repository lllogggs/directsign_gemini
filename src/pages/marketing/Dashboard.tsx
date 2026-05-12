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
import {
  formatContractTitleForDisplay,
  formatMoneyLabel,
  formatPublicContactValue,
  removeInternalTestLabel,
} from "../../domain/display";
import { formatElapsedDayLabel, formatUploadDueLabel } from "../../domain/timing";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { PRODUCT_NAME } from "../../domain/brand";

type StatusFilter = "AUTHORING" | "REVISION" | "SIGNING" | "DONE";
type PlatformFilter = "ALL" | ContractPlatform;
type ContractTypeFilter = "ALL" | Contract["type"];
type DetailStatusFilter = "ALL" | ContractStatus;
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

export function Dashboard() {
  const navigate = useNavigate();
  const contracts = useAppStore((state) => state.contracts);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const syncError = useAppStore((state) => state.syncError);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("AUTHORING");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [contractTypeFilter, setContractTypeFilter] =
    useState<ContractTypeFilter>("ALL");
  const [detailStatusFilter, setDetailStatusFilter] =
    useState<DetailStatusFilter>("ALL");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
  const advertiserVerificationStatus =
    verificationSummary?.advertiser.status ?? "not_submitted";
  const readinessBadge = getAdvertiserReadinessBadge(
    advertiserVerificationStatus,
    isVerificationLoading,
  );
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
    const email = formatPublicContactValue(
      latest?.submitted_by_email || account?.email,
    );
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

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const platformCounts = useMemo(
    () =>
      PLATFORM_FILTERS.reduce(
        (acc, platform) => {
          acc[platform] =
            platform === "ALL"
              ? contracts.length
              : contracts.filter((contract) =>
                  getContractPlatforms(contract).includes(platform),
                ).length;
          return acc;
        },
        {} as Record<PlatformFilter, number>,
      ),
    [contracts],
  );
  const contractTypeCounts = useMemo(
    () =>
      CONTRACT_TYPE_FILTERS.reduce(
        (acc, type) => {
          acc[type] =
            type === "ALL"
              ? contracts.length
              : contracts.filter((contract) => contract.type === type).length;
          return acc;
        },
        {} as Record<ContractTypeFilter, number>,
      ),
    [contracts],
  );

  const filteredContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return contracts
      .filter((contract) => {
        const selectedTab = DASHBOARD_TABS.find((tab) => tab.id === statusFilter);

        if (
          detailStatusFilter === "ALL" &&
          selectedTab &&
          !selectedTab.statuses.includes(contract.status)
        ) {
          return false;
        }
        if (detailStatusFilter !== "ALL" && contract.status !== detailStatusFilter) {
          return false;
        }
        if (
          platformFilter !== "ALL" &&
          !getContractPlatforms(contract).includes(platformFilter)
        ) {
          return false;
        }
        if (contractTypeFilter !== "ALL" && contract.type !== contractTypeFilter) {
          return false;
        }
        if (!normalizedQuery) return true;

        return [
          contract.title,
          formatDashboardContractTitle(contract.title),
          removeInternalTestLabel(contract.influencer_info.name, "인플루언서"),
          formatPublicContactValue(contract.influencer_info.contact),
          contract.influencer_info.channel_url,
          formatPlatforms(contract),
          formatMoneyLabel(contract.campaign?.budget),
          contract.type,
          formatPeriod(contract),
          STATUS_META[contract.status].label,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => parseDate(b.updated_at) - parseDate(a.updated_at));
  }, [
    contracts,
    contractTypeFilter,
    detailStatusFilter,
    platformFilter,
    query,
    statusFilter,
  ]);
  const handleTabChange = (tab: StatusFilter) => {
    setStatusFilter(tab);
    setDetailStatusFilter("ALL");
  };
  const handleDetailStatusChange = (status: DetailStatusFilter) => {
    setDetailStatusFilter(status);

    if (status !== "ALL") {
      const matchingTab = DASHBOARD_TABS.find((tab) => tab.statuses.includes(status));
      if (matchingTab) setStatusFilter(matchingTab.id);
    }
  };

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
              <span
                className={`inline-flex h-8 items-center rounded-[8px] px-3 text-[12px] font-semibold ${readinessBadge.className}`}
              >
                {readinessBadge.label}
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

          <div className="min-w-0 p-4">
            <section className="rounded-t-[8px] border border-b-0 border-[#d9e0d9] bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="계약 검색"
                    placeholder="계약명, 상대방, 플랫폼, 종류 검색"
                    className="h-10 w-full rounded-[6px] border border-[#d9e0d9] bg-[#f8faf7] pl-8 pr-3 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17] focus:bg-white"
                  />
                </div>
                <DashboardTabs
                  activeTab={statusFilter}
                  counts={statusCounts}
                  onChange={handleTabChange}
                />
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_0.9fr_1fr]">
                <FilterGroup label="플랫폼">
                  {PLATFORM_FILTERS.map((platform) => (
                    <FilterButton
                      key={platform}
                      active={platformFilter === platform}
                      count={platformCounts[platform]}
                      label={formatPlatformFilterLabel(platform)}
                      onClick={() => setPlatformFilter(platform)}
                    />
                  ))}
                </FilterGroup>

                <FilterGroup label="계약 종류">
                  {CONTRACT_TYPE_FILTERS.map((type) => (
                    <FilterButton
                      key={type}
                      active={contractTypeFilter === type}
                      count={
                        type === "ALL"
                          ? contractTypeCounts.ALL
                          : contractTypeCounts[type]
                      }
                      label={type === "ALL" ? "전체" : formatContractTypeLabel(type)}
                      onClick={() => setContractTypeFilter(type)}
                    />
                  ))}
                </FilterGroup>

                <FilterGroup label="계약 상태">
                  {DETAIL_STATUS_FILTERS.map((status) => (
                    <FilterButton
                      key={status}
                      active={detailStatusFilter === status}
                      count={
                        status === "ALL" ? contracts.length : statusCounts[status]
                      }
                      label={status === "ALL" ? "전체" : STATUS_META[status].shortLabel}
                      onClick={() => handleDetailStatusChange(status)}
                    />
                  ))}
                </FilterGroup>
              </div>
            </section>

            {syncError && <SyncErrorPanel message={syncError} />}

            <ContractTable
              contracts={filteredContracts}
              currentTime={currentTime}
              statusFilter={statusFilter}
              totalContracts={contracts.length}
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[8px] border border-[#e5e9e4] bg-[#f8faf7] p-2.5">
      <p className="mb-2 px-1 text-[11px] font-semibold text-[#7d857f]">{label}</p>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
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
      className={`inline-flex h-8 min-w-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-semibold transition ${
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

function PlatformPills({ contract }: { contract: Contract }) {
  const items = getContractPlatformDisplayItems(contract);

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {items.slice(0, 3).map((item) => (
        <span
          key={`${item.platform}-${item.label}`}
          className={`inline-flex h-6 max-w-full items-center gap-1 rounded-[5px] border px-2 text-[11px] font-semibold ${PLATFORM_META[item.platform].className}`}
          title={item.title}
        >
          <span className="shrink-0">{PLATFORM_META[item.platform].mark}</span>
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

function formatPlatformFilterLabel(platform: PlatformFilter) {
  if (platform === "ALL") return "전체";
  return PLATFORM_META[platform].shortLabel;
}

function getAdvertiserReadinessBadge(
  status: VerificationStatus,
  isLoading: boolean,
) {
  if (isLoading) {
    return {
      label: "상태 확인 중",
      className: "bg-neutral-100 text-neutral-600",
    };
  }

  const badges: Record<VerificationStatus, { label: string; className: string }> = {
    approved: {
      label: "발송 가능",
      className: "bg-[#eef0ed] text-[#303630]",
    },
    pending: {
      label: "인증 검수 중",
      className: "bg-amber-50 text-amber-800",
    },
    rejected: {
      label: "인증 재제출 필요",
      className: "bg-rose-50 text-rose-700",
    },
    not_submitted: {
      label: "사업자 인증 필요",
      className: "bg-amber-50 text-amber-800",
    },
  };

  return badges[status];
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
  currentTime,
  statusFilter,
  totalContracts,
  onOpen,
}: {
  contracts: Contract[];
  currentTime: number;
  statusFilter: StatusFilter;
  totalContracts: number;
  onOpen: (contract: Contract) => void;
}) {
  if (contracts.length === 0) return <EmptyState isInitialEmpty={totalContracts === 0} />;

  const dueHeader = getAdvertiserDueHeader(statusFilter);

  return (
    <section className="overflow-hidden rounded-b-[8px] border border-[#d9e0d9] bg-white">
      <div className="hidden grid-cols-[minmax(280px,1.3fr)_minmax(150px,0.9fr)_110px_120px_150px] border-b border-[#d9e0d9] bg-[#f8faf7] px-4 py-3 text-[11px] font-semibold text-[#7d857f] lg:grid">
        <span>계약</span>
        <span>플랫폼</span>
        <span>종류</span>
        <span>금액</span>
        <span>{dueHeader}</span>
      </div>
      <div className="divide-y divide-[#edf1ed]">
        {contracts.map((contract) => (
          <React.Fragment key={contract.id}>
            <ContractRow
              contract={contract}
              currentTime={currentTime}
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
  currentTime,
  onOpen,
}: {
  contract: Contract;
  currentTime: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8faf7] lg:grid-cols-[minmax(280px,1.3fr)_minmax(150px,0.9fr)_110px_120px_150px] lg:items-center"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-[14px] font-semibold text-[#171a17]">
            {formatDashboardContractTitle(contract.title)}
          </p>
          <span className="lg:hidden">
            <StatusBadge status={contract.status} dense />
          </span>
        </div>
        <p className="mt-1 truncate text-[12px] text-[#7d857f]">
          {removeInternalTestLabel(contract.influencer_info.name, "인플루언서")} · {formatPeriod(contract)}
        </p>
      </div>

      <div className="min-w-0">
        <PlatformPills contract={contract} />
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#303630]">
          {formatContractTypeLabel(contract.type)}
        </p>
        <p className="mt-1 truncate text-[12px] text-[#8b938d]">종류</p>
      </div>

      <PreviewAmount value={formatMoneyLabel(contract.campaign?.budget)} />

      <StatusTiming
        contract={contract}
        currentTime={currentTime}
        showStatus
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
  return formatContractTitleForDisplay(cleaned || title, "계약명 미정");
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

function formatBusinessRegistrationNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-**-${digits.slice(5)}`;
}
