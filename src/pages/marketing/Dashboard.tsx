import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CopyCheck,
  FileText,
  LogOut,
  Megaphone,
  MessageSquareText,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
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
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { useMarketplaceMessageSummary } from "../../hooks/useMarketplaceMessageSummary";
import { PRODUCT_NAME } from "../../domain/brand";
import { apiFetch } from "../../domain/api";

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
  const resetHydration = useAppStore((state) => state.resetHydration);
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [contractTypeFilter, setContractTypeFilter] =
    useState<ContractTypeFilter>("ALL");
  const [detailStatusFilter, setDetailStatusFilter] =
    useState<DetailStatusFilter>("ALL");
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
  const {
    summary: messageSummary,
    isLoading: isMessageSummaryLoading,
  } = useMarketplaceMessageSummary("advertiser");
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
  ]);
  const handleLogout = async () => {
    try {
      await apiFetch("/api/advertiser/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn("[Yeollock] advertiser logout request failed", error);
    } finally {
      resetHydration();
      navigate("/login/advertiser", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950 lg:h-screen lg:overflow-hidden">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="flex shrink-0 items-center gap-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="font-neo-heavy hidden text-[18px] leading-none sm:inline">{PRODUCT_NAME}</span>
          </button>

          <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
            <SyncPill isSyncing={isSyncing} syncError={syncError} />
            <button
              type="button"
              onClick={() => navigate("/advertiser/builder")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-blue-600 px-3 text-[12px] font-extrabold text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              새 계약
            </button>
            <MessageCenterButton
              unreadCount={messageSummary.unreadCount}
              isLoading={isMessageSummaryLoading}
              onClick={() => navigate("/advertiser/messages")}
            />
            <button
              type="button"
              onClick={() => navigate("/advertiser/discover")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-2.5 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">상대 찾기</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/advertiser/campaigns")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-2.5 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
            >
              <Megaphone className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">모집글</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-2.5 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
              aria-label="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-2 sm:px-5 lg:h-[calc(100vh-48px)] lg:overflow-hidden lg:px-6">
        <section className="min-w-0 overflow-hidden rounded-[12px] border border-neutral-200 bg-[#fdfdfb] shadow-[0_16px_44px_rgba(23,26,23,0.07)] lg:flex lg:h-full lg:flex-col">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
                  <h1 className="truncate text-[17px] font-bold text-[#171a17]">
                  계약 운영
                </h1>
                <p className="pb-0.5 text-[12px] font-semibold text-[#7d857f]">
                  전체 {contracts.length.toLocaleString()}건 · 검색 결과 {filteredContracts.length.toLocaleString()}건 · 진행 중인 계약 포함
                </p>
              </div>
              <span
                className={`inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12px] font-semibold ${readinessBadge.className}`}
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

          <div className="min-w-0 p-2.5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            {contracts.length === 0 ? (
              <ContractFirstNotice onCreate={() => navigate("/advertiser/builder")} />
            ) : null}

            {syncError && <SyncErrorPanel message={syncError} />}

            <ContractTable
              contracts={filteredContracts}
              totalContracts={contracts.length}
              query={query}
              onQueryChange={setQuery}
              platformFilter={platformFilter}
              onPlatformFilterChange={setPlatformFilter}
              platformCounts={platformCounts}
              contractTypeFilter={contractTypeFilter}
              onContractTypeFilterChange={setContractTypeFilter}
              contractTypeCounts={contractTypeCounts}
              detailStatusFilter={detailStatusFilter}
              onDetailStatusFilterChange={setDetailStatusFilter}
              statusCounts={statusCounts}
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
          ? `border-b px-4 py-2 ${
              approved
                ? "border-neutral-200 bg-[#fbfbf8]"
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
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] ${
              approved
                ? "bg-white text-neutral-800 ring-1 ring-neutral-200"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-[13px] font-bold text-neutral-950">
                광고주 사업자 인증
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${verificationStatusTone(
                  status,
                )}`}
              >
                {isLoading ? "확인중" : verificationStatusLabel(status)}
              </span>
            </div>
            <span className="max-w-[180px] truncate text-[12px] font-semibold text-neutral-800">
              {account.name}
            </span>
            <span className="hidden h-3 w-px bg-neutral-200 sm:inline-block" />
            <span className="max-w-[300px] truncate text-[12px] text-neutral-500">
              {account.meta}
            </span>
            {account.businessNumber && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                사업자 {formatBusinessRegistrationNumber(account.businessNumber)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className={`h-7 shrink-0 whitespace-nowrap rounded-md px-3 text-[12px] font-semibold transition ${
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

function ContractFirstNotice({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="mb-3 flex flex-col gap-3 rounded-[10px] border border-blue-100 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-blue-950">
          먼저 계약을 만들고 검토 링크를 발급하세요
        </p>
        <p className="mt-1 text-[12px] font-medium leading-5 text-blue-800/80">
          상대 정보와 금액, 일정, 산출물을 입력하면 검토 링크, 수정 요청, 전자서명 증빙까지 이어집니다.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-3 text-[12px] font-extrabold text-white transition hover:bg-blue-700"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        새 계약
      </button>
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

  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-semibold text-neutral-600">
      <CopyCheck className="h-3.5 w-3.5 text-neutral-500" />
      {isSyncing ? "저장 중" : "저장 완료"}
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
      className="relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-neutral-200 bg-white px-2.5 text-[12px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
      aria-label="메시지함"
      title="메시지함"
    >
      <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2} />
      <span className="hidden sm:inline">메시지함</span>
      {badge ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-extrabold tabular-nums text-white ring-2 ring-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : isLoading ? (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-neutral-300 ring-2 ring-white" />
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
          className={`inline-flex h-5 max-w-full items-center gap-1 rounded-[5px] border px-1.5 text-[10px] font-semibold ${PLATFORM_META[item.platform].className}`}
          title={item.title}
        >
          <span className="shrink-0">{PLATFORM_META[item.platform].mark}</span>
          <span className="truncate">{item.label}</span>
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

function ContractTable({
  contracts,
  totalContracts,
  query,
  onQueryChange,
  platformFilter,
  onPlatformFilterChange,
  platformCounts,
  contractTypeFilter,
  onContractTypeFilterChange,
  contractTypeCounts,
  detailStatusFilter,
  onDetailStatusFilterChange,
  statusCounts,
  onOpen,
}: {
  contracts: Contract[];
  totalContracts: number;
  query: string;
  onQueryChange: (value: string) => void;
  platformFilter: PlatformFilter;
  onPlatformFilterChange: (value: PlatformFilter) => void;
  platformCounts: Record<PlatformFilter, number>;
  contractTypeFilter: ContractTypeFilter;
  onContractTypeFilterChange: (value: ContractTypeFilter) => void;
  contractTypeCounts: Record<ContractTypeFilter, number>;
  detailStatusFilter: DetailStatusFilter;
  onDetailStatusFilterChange: (value: DetailStatusFilter) => void;
  statusCounts: Record<ContractStatus, number>;
  onOpen: (contract: Contract) => void;
}) {
  const platformOptions = PLATFORM_FILTERS.map((platform) => ({
    value: platform,
    label: formatPlatformFilterLabel(platform),
    count: platformCounts[platform],
  }));
  const contractTypeOptions = CONTRACT_TYPE_FILTERS.map((type) => ({
    value: type,
    label: type === "ALL" ? "전체" : formatContractTypeFilterLabel(type),
    count: contractTypeCounts[type],
  }));
  const statusOptions = DETAIL_STATUS_FILTERS.map((status) => ({
    value: status,
    label: status === "ALL" ? "전체" : STATUS_META[status].shortLabel,
    count: status === "ALL" ? totalContracts : statusCounts[status],
  }));

  return (
    <section className="overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="grid gap-2 border-b border-[#d9e0d9] bg-[#f8faf7] p-2 lg:hidden">
        <ContractNameSearch value={query} onChange={onQueryChange} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
          <TableFilterSelect
            label="현 단계"
            value={detailStatusFilter}
            options={statusOptions}
            onChange={(value) => onDetailStatusFilterChange(value as DetailStatusFilter)}
          />
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(155px,0.46fr)_minmax(120px,0.36fr)_minmax(320px,1fr)_minmax(145px,0.42fr)_minmax(124px,0.36fr)] items-end gap-3 border-b border-[#d9e0d9] bg-[#f8faf7] px-3 py-2 lg:grid">
        <TableFilterSelect
          label="플랫폼"
          value={platformFilter}
          options={platformOptions}
          maxWidthClassName="w-[125px]"
          onChange={(value) => onPlatformFilterChange(value as PlatformFilter)}
        />
        <TableFilterSelect
          label="종류"
          value={contractTypeFilter}
          options={contractTypeOptions}
          maxWidthClassName="w-[102px]"
          onChange={(value) => onContractTypeFilterChange(value as ContractTypeFilter)}
        />
        <ContractNameSearch value={query} onChange={onQueryChange} />
        <div className="pb-1.5 text-[11px] font-extrabold text-[#7d857f]">금액</div>
        <TableFilterSelect
          label="현 단계"
          value={detailStatusFilter}
          options={statusOptions}
          maxWidthClassName="w-[112px]"
          onChange={(value) => onDetailStatusFilterChange(value as DetailStatusFilter)}
        />
      </div>

      <div className="max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {contracts.length > 0 ? (
          contracts.map((contract) => (
            <React.Fragment key={contract.id}>
              <ContractRow
                contract={contract}
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

function ContractNameSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 lg:w-[95%]">
      <span className="text-[11px] font-extrabold text-[#7d857f]">계약명</span>
      <span className="relative mt-1 block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="계약명 검색"
          placeholder="계약명으로 검색"
          className="h-8 w-full max-w-full rounded-[6px] border border-[#d9e0d9] bg-white pl-7 pr-2 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17]"
        />
      </span>
    </label>
  );
}

function TableFilterSelect({
  label,
  value,
  options,
  maxWidthClassName = "w-full",
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; count: number }>;
  maxWidthClassName?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-extrabold text-[#7d857f]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} 필터`}
        className={`mt-1 block h-8 max-w-full ${maxWidthClassName} rounded-[6px] border border-[#d9e0d9] bg-white px-2 text-[12px] font-bold text-[#303630] outline-none transition-colors hover:border-[#cbd5cc] focus:border-[#171a17]`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} {option.count}
          </option>
        ))}
      </select>
    </label>
  );
}

function ContractRow({
  contract,
  onOpen,
}: {
  contract: Contract;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[#f8faf7] lg:min-h-[38px] lg:grid-cols-[minmax(155px,0.46fr)_minmax(120px,0.36fr)_minmax(320px,1fr)_minmax(145px,0.42fr)_minmax(124px,0.36fr)] lg:items-center"
    >
      <div className="min-w-0">
        <PlatformPills contract={contract} />
      </div>

      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-[#303630]">
          {formatContractTypeLabel(contract.type)}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-[13px] font-semibold text-[#171a17]">
            {formatDashboardContractTitle(contract.title)}
          </p>
          <span className="lg:hidden">
            <StatusBadge status={contract.status} dense />
          </span>
        </div>
      </div>

      <AmountCell value={contract.campaign?.budget} />

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
    <div className="min-w-0">
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

function formatDashboardAmountLabel(value?: string | null) {
  const label = formatMoneyLabel(value, "-").replace(/\s+/g, " ").trim();
  const percentMatch = label.match(/(\d+(?:\.\d+)?)\s*%/);

  if (percentMatch) return `수수료 ${percentMatch[1]}%`;
  return label || "-";
}

function formatDashboardContractTitle(title: string) {
  const cleaned = title.replace(/^\[[^\]]+\]\s*/, "").trim();
  return formatContractTitleForDisplay(cleaned || title, "계약명 미정");
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
