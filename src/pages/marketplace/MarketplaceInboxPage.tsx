import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  FileSignature,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogoMark } from "../../components/BrandLogo";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { removeInternalTestLabel } from "../../domain/display";
import {
  platformLabels,
  proposalTypeLabels,
  campaignProposalTypeOptions,
  type CampaignProposalType,
} from "../../domain/marketplace";
import {
  emptyMarketplaceMessageSummary,
  formatMarketplaceMessageDate,
  type MarketplaceInboxRole,
  type MarketplaceMessageBucket,
  type MarketplaceMessagesResponse,
  type MarketplaceProposalStatus,
} from "../../domain/marketplaceInbox";
import type { InfluencerPlatform } from "../../domain/verification";

type InboxState =
  | { status: "loading" }
  | { status: "ready"; data: MarketplaceMessagesResponse }
  | { status: "error"; message: string };

type MessageThread = MarketplaceMessagesResponse["threads"][number];
type PlatformFilter = "all" | InfluencerPlatform;
type ProposalTypeFilter = "all" | CampaignProposalType;
type ProposalStatusFilter = "all" | MarketplaceProposalStatus;

type ProposalAcceptResponse = {
  contract?: {
    id: string;
  };
  already_converted?: boolean;
};

const platformFilterOptions: PlatformFilter[] = [
  "all",
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
];
const proposalTypeFilterOptions: ProposalTypeFilter[] = [
  "all",
  ...campaignProposalTypeOptions,
];
const proposalStatusFilterOptions: ProposalStatusFilter[] = [
  "all",
  "submitted",
  "reviewed",
  "converted_to_contract",
  "closed",
];

const proposalStatusLabels: Record<MarketplaceProposalStatus, string> = {
  submitted: "제안 전송",
  reviewed: "진행 중",
  converted_to_contract: "계약 전환",
  closed: "종료",
};

const proposalStatusTone: Record<MarketplaceProposalStatus, string> = {
  submitted: "border-amber-200 bg-amber-50 text-amber-800",
  reviewed: "border-sky-200 bg-sky-50 text-sky-700",
  converted_to_contract: "border-blue-200 bg-blue-50 text-blue-700",
  closed: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

const roleCopy = {
  advertiser: {
    eyebrow: "광고주 계약 전환",
    panelTitle: "1:1 계약 제안 관리",
    summaryTitle: (openCount: number) =>
      openCount > 0
        ? `보낸 1:1 계약 제안 ${openCount.toLocaleString()}건이 진행 중입니다`
        : "보낸 1:1 계약 제안 진행 상황",
    summaryHint: "인플루언서에게 보낸 조건 제안의 확인, 검토, 계약서 작성을 관리합니다.",
    backHref: "/advertiser/dashboard",
    backLabel: "1:1 계약 대시보드",
    discoverHref: "/advertiser/discover",
    discoverLabel: "인플루언서 찾기",
    primaryHref: "/advertiser/builder",
    primaryLabel: "1:1 계약 작성",
    emptyInbox: "아직 받은 1:1 제안이 없습니다",
    emptySent: "아직 보낸 1:1 계약 제안이 없습니다",
    emptyInboxActionLabel: "인플루언서 찾기",
    emptyInboxActionHref: "/advertiser/discover",
    emptySentActionLabel: "인플루언서 찾기",
    emptySentActionHref: "/advertiser/discover",
    primaryBucketLabel: "보낸 계약 제안",
    secondaryBucketLabel: "받은 제안",
    searchPlaceholder: "인플루언서, 제안 종류, 계약 조건 검색",
    dateHeader: "보낸 날",
  },
  influencer: {
    eyebrow: "인플루언서 계약 검토",
    panelTitle: "계약 전 검토할 제안",
    summaryTitle: (openCount: number) =>
      openCount > 0
        ? `받은 제안 ${openCount.toLocaleString()}건을 확인해야 합니다`
        : "받은 제안과 역제안 관리",
    summaryHint: "브랜드 제안과 내가 보낸 역제안을 계약 검토 흐름으로 정리합니다.",
    backHref: "/influencer/dashboard",
    backLabel: "1:1 계약",
    discoverHref: "/influencer/brands",
    discoverLabel: "브랜드 찾기",
    primaryHref: "/influencer/dashboard",
    primaryLabel: "계약 검토",
    emptyInbox: "아직 받은 브랜드 제안이 없습니다",
    emptySent: "아직 보낸 역제안이 없습니다",
    emptyInboxActionLabel: "브랜드 찾기",
    emptyInboxActionHref: "/influencer/brands",
    emptySentActionLabel: "브랜드 찾기",
    emptySentActionHref: "/influencer/brands",
    primaryBucketLabel: "받은 제안",
    secondaryBucketLabel: "보낸 제안",
    searchPlaceholder: "브랜드, 제안 종류, 제안 내용 검색",
    dateHeader: "도착일",
  },
} satisfies Record<
  MarketplaceInboxRole,
  {
    eyebrow: string;
    panelTitle: string;
    summaryTitle: (openCount: number) => string;
    summaryHint: string;
    backHref: string;
    backLabel: string;
    discoverHref: string;
    discoverLabel: string;
    primaryHref: string;
    primaryLabel: string;
    emptyInbox: string;
    emptySent: string;
    emptyInboxActionLabel: string;
    emptyInboxActionHref: string;
    emptySentActionLabel: string;
    emptySentActionHref: string;
    primaryBucketLabel: string;
    secondaryBucketLabel: string;
    searchPlaceholder: string;
    dateHeader: string;
  }
>;

export function MarketplaceInboxPage({ role }: { role: MarketplaceInboxRole }) {
  const navigate = useNavigate();
  const copy = roleCopy[role];
  const primaryBucket: MarketplaceMessageBucket = role === "advertiser" ? "sent" : "inbox";
  const [state, setState] = useState<InboxState>({ status: "loading" });
  const [selectedBucket, setSelectedBucket] =
    useState<MarketplaceMessageBucket>();
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [proposalTypeFilter, setProposalTypeFilter] =
    useState<ProposalTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ProposalStatusFilter>("all");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadMessages = useCallback(async () => {
    setState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );

    try {
      const response = await apiFetch(`/api/marketplace/messages?role=${role}`, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (response.status === 401) {
        navigate(role === "advertiser" ? "/login/advertiser" : "/login/influencer", {
          replace: true,
        });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as
        | MarketplaceMessagesResponse
        | { error?: string };

      if (!response.ok || !("threads" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(errorMessage ?? "메시지함을 불러오지 못했습니다.");
      }

      setState({ status: "ready", data });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "메시지함을 불러오지 못했습니다.",
      });
    }
  }, [navigate, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMessages();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMessages]);

  const handleLogout = async () => {
    try {
      await apiFetch(`/api/${role}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] ${role} logout request failed`, error);
    } finally {
      navigate(role === "advertiser" ? "/login/advertiser" : "/login/influencer", {
        replace: true,
      });
    }
  };

  const data =
    state.status === "ready"
      ? state.data
      : {
          role,
          threads: [],
          summary: emptyMarketplaceMessageSummary,
        };
  const normalizedQuery = query.trim().toLowerCase();
  const messageThreads = useMemo(
    () => data.threads.filter(isOneToOneMessageThread),
    [data.threads],
  );
  const sentThreads = useMemo(
    () => messageThreads.filter((thread) => thread.bucket === "sent"),
    [messageThreads],
  );
  const inboxThreads = useMemo(
    () => messageThreads.filter((thread) => thread.bucket === "inbox"),
    [messageThreads],
  );
  const sentCount = sentThreads.length;
  const inboxCount = inboxThreads.length;
  const totalCount = messageThreads.length;
  const totalOpenCount = messageThreads.filter((thread) =>
    ["submitted", "reviewed"].includes(thread.status),
  ).length;
  const totalConvertedCount = messageThreads.filter(
    (thread) => thread.status === "converted_to_contract",
  ).length;
  const inboxOpenCount = inboxThreads.filter(
    (thread) =>
      ["submitted", "reviewed"].includes(thread.status),
  ).length;
  const inboxUnreadCount = inboxThreads.filter(
    (thread) => thread.unread,
  ).length;
  const focusMetrics =
    role === "advertiser"
      ? {
          headingCount: totalOpenCount,
          primaryLabel: "전체 제안",
          primaryValue: totalCount,
          firstLabel: "확인 필요",
          firstValue: inboxOpenCount,
          secondLabel: "계약 전환",
          secondValue: totalConvertedCount,
        }
      : {
          headingCount: totalOpenCount,
          primaryLabel: "전체 제안",
          primaryValue: totalCount,
          firstLabel: "확인 필요",
          firstValue: inboxUnreadCount,
          secondLabel: "진행 중",
          secondValue: totalOpenCount,
        };
  const bucketOptions: Array<{
    id: MarketplaceMessageBucket;
    label: string;
    count: number;
  }> =
    role === "advertiser"
      ? [
          { id: "sent", label: copy.primaryBucketLabel, count: sentCount },
          { id: "inbox", label: copy.secondaryBucketLabel, count: inboxCount },
        ]
      : [
          { id: "inbox", label: copy.primaryBucketLabel, count: inboxCount },
          { id: "sent", label: copy.secondaryBucketLabel, count: sentCount },
        ];
  const fallbackBucket = bucketOptions.find((option) => option.count > 0)?.id;
  const bucket = selectedBucket ?? fallbackBucket ?? primaryBucket;
  const bucketThreads = useMemo(
    () => messageThreads.filter((thread) => thread.bucket === bucket),
    [bucket, messageThreads],
  );
  const visibleThreads = useMemo(
    () =>
      bucketThreads.filter((thread) => {
        if (
          platformFilter !== "all" &&
          !thread.platforms.some((item) => item.platform === platformFilter)
        ) {
          return false;
        }
        if (
          proposalTypeFilter !== "all" &&
          thread.proposalType !== proposalTypeFilter
        ) {
          return false;
        }
        if (statusFilter !== "all" && thread.status !== statusFilter) return false;
        if (!normalizedQuery) return true;

        return [
          thread.senderName,
          thread.targetName,
          thread.counterpartName,
          thread.senderIntro,
          thread.proposalSummary,
          ...thread.platforms.flatMap((item) => [
            item.label,
            item.handle ?? "",
            platformLabels[item.platform],
          ]),
          getProposalTypeLabel(thread),
          proposalStatusLabels[thread.status],
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [bucketThreads, normalizedQuery, platformFilter, proposalTypeFilter, statusFilter],
  );
  const headerBadge =
    role === "advertiser"
      ? inboxOpenCount > 0
        ? `확인 필요 ${inboxOpenCount.toLocaleString()}건`
        : `진행 중 ${totalOpenCount.toLocaleString()}건`
      : inboxUnreadCount > 0
        ? `확인 필요 ${inboxUnreadCount.toLocaleString()}건`
        : `진행 중 ${totalOpenCount.toLocaleString()}건`;
  const contractHomeIsPrimary = copy.primaryHref === copy.backHref;
  const activeFilterLabels = [
    query.trim() ? `검색 ${query.trim()}` : null,
    platformFilter !== "all" ? platformLabels[platformFilter] : null,
    proposalTypeFilter !== "all"
      ? proposalTypeLabels[proposalTypeFilter]
      : null,
    statusFilter !== "all" ? proposalStatusLabels[statusFilter] : null,
  ].filter((label): label is string => Boolean(label));
  const filterSummary =
    activeFilterLabels.length > 0 ? activeFilterLabels.join(" · ") : "전체 조건";
  const resetScopedFilters = () => {
    setPlatformFilter("all");
    setProposalTypeFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="z-30 shrink-0 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none sm:text-[19px]">{PRODUCT_NAME}</span>
          </Link>

          <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
            {!contractHomeIsPrimary ? (
              <Link
                to={copy.primaryHref}
                className="yl-header-action yl-header-action-primary"
              >
                <FileSignature className="h-4 w-4" />
                <span className="hidden sm:inline">{copy.primaryLabel}</span>
              </Link>
            ) : null}
            <Link
              to={copy.backHref}
              className={`yl-header-action ${
                contractHomeIsPrimary
                  ? "yl-header-action-primary"
                  : "yl-header-action-secondary"
              }`}
            >
              {contractHomeIsPrimary ? (
                <FileSignature className="h-4 w-4" />
              ) : (
                <ArrowLeft className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{copy.backLabel}</span>
            </Link>
            <button
              type="button"
              onClick={() => void loadMessages()}
              className="yl-header-icon-action"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(`/reset-password?role=${role}`, { replace: false })
              }
              className="yl-header-icon-action"
              aria-label="계정 설정"
              title="계정 설정"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full min-w-0 max-w-[1500px] flex-1 flex-col px-3 py-3 sm:px-5 lg:px-6">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-neutral-200 bg-[#fdfdfb] shadow-[0_18px_44px_rgba(23,26,23,0.07)]">
          <div className="shrink-0 border-b border-[#d9e0d9] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-extrabold text-[#7d857f]">
                  {copy.eyebrow}
                </p>
                <h1 className="font-neo-heavy mt-1 truncate text-[22px] leading-tight text-[#171a17]">
                  {copy.panelTitle}
                </h1>
              </div>
              <span className="inline-flex h-8 items-center rounded-full bg-[#eef0ed] px-3 text-[12px] font-extrabold text-[#303630]">
                {headerBadge}
              </span>
            </div>
          </div>

          <div className="grid shrink-0 border-b border-neutral-200/80 bg-[#fcfcfd] sm:grid-cols-3">
            <SummaryMetric
              label={focusMetrics.primaryLabel}
              value={focusMetrics.primaryValue}
            />
            <SummaryMetric
              label={focusMetrics.firstLabel}
              value={focusMetrics.firstValue}
            />
            <SummaryMetric label={focusMetrics.secondLabel} value={focusMetrics.secondValue} />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
            <section className="rounded-t-[8px] border border-b-0 border-[#d9e0d9] bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-extrabold leading-5 text-[#171a17]">
                    제안 목록
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[#606861]">
                    {visibleThreads.length.toLocaleString()}건 표시 · {filterSummary}
                  </p>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="grid min-w-[220px] grid-cols-2 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1 lg:w-[300px] lg:shrink-0"
                    role="tablist"
                    aria-label="제안함"
                  >
                    {bucketOptions.map((option) => (
                      <div key={option.id}>
                        <BucketButton
                          active={bucket === option.id}
                          label={option.label}
                          count={option.count}
                          onClick={() => {
                            setSelectedBucket(option.id);
                            resetScopedFilters();
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <InboxFilterToggleButton
                    open={filtersOpen}
                    activeCount={activeFilterLabels.length}
                    controlsId="marketplace-message-filters"
                    onClick={() => setFiltersOpen((current) => !current)}
                  />
                </div>
              </div>

              {filtersOpen ? (
                <div
                  id="marketplace-message-filters"
                  className="mt-3 grid grid-cols-2 gap-2 border-t border-[#edf1ed] pt-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px_160px]"
                >
                  <div className="relative col-span-2 min-w-0 lg:col-span-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      aria-label="제안 검색"
                      placeholder={copy.searchPlaceholder}
                      className="h-9 w-full rounded-[6px] border border-[#d9e0d9] bg-[#f8faf7] pl-8 pr-3 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17] focus:bg-white"
                    />
                  </div>
                  <SelectFilter
                    label="플랫폼"
                    value={platformFilter}
                    onChange={(value) => setPlatformFilter(value as PlatformFilter)}
                    options={platformFilterOptions.map((platform) => ({
                      value: platform,
                      label: platform === "all" ? "전체" : platformLabels[platform],
                    }))}
                  />
                  <SelectFilter
                    label="제안 종류"
                    value={proposalTypeFilter}
                    onChange={(value) => setProposalTypeFilter(value as ProposalTypeFilter)}
                    options={proposalTypeFilterOptions.map((type) => ({
                      value: type,
                      label: type === "all" ? "전체" : proposalTypeLabels[type],
                    }))}
                  />
                  <SelectFilter
                    label="상태"
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value as ProposalStatusFilter)}
                    options={proposalStatusFilterOptions.map((status) => ({
                      value: status,
                      label: status === "all" ? "전체" : proposalStatusLabels[status],
                    }))}
                  />
                </div>
              ) : null}
            </section>

            {state.status === "loading" ? (
              <LoadingState />
            ) : state.status === "error" ? (
              <ErrorState message={state.message} onRetry={loadMessages} />
            ) : visibleThreads.length === 0 ? (
              <EmptyState
                title={bucket === "inbox" ? copy.emptyInbox : copy.emptySent}
                actionLabel={
                  bucket === "inbox"
                    ? copy.emptyInboxActionLabel
                    : copy.emptySentActionLabel
                }
                actionHref={
                  bucket === "inbox"
                    ? copy.emptyInboxActionHref
                    : copy.emptySentActionHref
                }
              />
            ) : (
              <MessageTable copy={copy} role={role} threads={visibleThreads} />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-neutral-200/80 px-4 py-3 first:border-t-0 sm:block sm:border-l sm:border-t-0 sm:first:border-l-0">
      <p className="text-[12px] font-semibold text-[#7d857f]">{label}</p>
      <p className="mt-0 flex items-baseline gap-0.5 text-[#171a17] sm:mt-1">
        <span className="text-[22px] font-semibold leading-none tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="text-[13px] font-semibold text-[#7d857f]">건</span>
      </p>
    </div>
  );
}

function BucketButton({
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
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`h-10 w-full min-w-0 rounded-full px-1 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
        active
          ? "bg-white text-neutral-950 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
          : "text-neutral-500 hover:text-neutral-800"
      }`}
    >
      <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap">
        {label}
        <span className={`text-[10px] ${active ? "text-neutral-500" : "text-neutral-400"}`}>
          {count.toLocaleString()}
        </span>
      </span>
    </button>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[12px] font-extrabold text-[#303630]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-[6px] border border-[#d9e0d9] bg-[#f8faf7] px-2.5 text-[12px] font-bold text-[#303630] outline-none transition-colors hover:border-[#cbd5cc] focus:border-[#171a17] focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InboxFilterToggleButton({
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
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#d9e0d9] bg-white px-2.5 text-[12px] font-extrabold text-[#303630] transition hover:border-[#cbd5cc]"
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

function MessageTable({
  copy,
  role,
  threads,
}: {
  copy: (typeof roleCopy)[MarketplaceInboxRole];
  role: MarketplaceInboxRole;
  threads: MessageThread[];
}) {
  return (
    <section className="overflow-hidden rounded-b-[8px] border border-[#d9e0d9] bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      <div className="hidden grid-cols-[104px_minmax(170px,0.75fr)_minmax(330px,1.45fr)_132px_132px] border-b border-[#d7ddd7] bg-[#f7f8f4] px-4 py-3 text-[12px] font-extrabold tracking-[-0.01em] text-[#303630] lg:grid">
        <span>상태</span>
        <span>상대</span>
        <span>제안명</span>
        <span className="text-right">{copy.dateHeader}</span>
        <span className="sr-only">액션</span>
      </div>
      <div className="max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {threads.map((thread) => (
          <div key={thread.id}>
            <MessageThreadRow role={role} thread={thread} />
          </div>
        ))}
      </div>
    </section>
  );
}

function MessageThreadRow({
  role,
  thread,
}: {
  role: MarketplaceInboxRole;
  thread: MessageThread;
}) {
  const navigate = useNavigate();
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | undefined>();
  const canAcceptAsContract =
    role === "advertiser" &&
    thread.bucket === "inbox" &&
    thread.direction === "influencer_to_brand" &&
    thread.status !== "converted_to_contract" &&
    thread.status !== "closed";
  const actionHref =
    thread.convertedContractId
      ? role === "advertiser"
        ? `/advertiser/contract/${thread.convertedContractId}`
        : `/contract/${thread.convertedContractId}`
      : role === "advertiser"
        ? thread.bucket === "inbox"
          ? "/advertiser/builder"
          : thread.counterpartHref
        : thread.counterpartHref ?? "/influencer/dashboard";
  const actionLabel =
    thread.convertedContractId
      ? role === "advertiser"
        ? "초안 보기"
        : "계약 검토"
      : role === "advertiser"
        ? thread.bucket === "inbox"
          ? "1:1 계약 작성"
          : "상대 보기"
        : thread.bucket === "inbox"
          ? "브랜드 보기"
          : "캠페인 보기";
  const counterpartName = thread.counterpartName;
  const proposalSummary = thread.proposalSummary;

  const acceptAsContract = async () => {
    if (isAccepting) return;

    setIsAccepting(true);
    setAcceptError(undefined);

    try {
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
        | ProposalAcceptResponse
        | { error?: string };

      if (!response.ok || !("contract" in data) || !data.contract?.id) {
        throw new Error(
          "error" in data
            ? data.error ?? "계약 초안을 생성하지 못했습니다."
            : "계약 초안을 생성하지 못했습니다.",
        );
      }

      navigate(`/advertiser/contract/${data.contract.id}`);
    } catch (error) {
      setAcceptError(
        error instanceof Error ? error.message : "계약 초안을 생성하지 못했습니다.",
      );
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <article className={`grid gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f8faf7] lg:grid-cols-[104px_minmax(170px,0.75fr)_minmax(330px,1.45fr)_132px_132px] lg:items-center ${
      thread.unread ? "bg-[#fffdf3]" : "bg-white"
    }`}>
      <div className="flex min-w-0 items-center gap-2 md:block">
        <span
          className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[11px] font-semibold ${proposalStatusTone[thread.status]}`}
        >
          {proposalStatusLabels[thread.status]}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-[#171a17]">
          {counterpartName}
        </p>
      </div>

      <div className="min-w-0">
        <ProposalSummary summary={proposalSummary} />
        <p className="mt-1 line-clamp-1 text-[12px] font-medium leading-5 text-[#7d857f] lg:hidden">
          {formatMarketplaceMessageDate(thread.createdAt)}
        </p>
      </div>

      <p className="hidden text-right text-[12px] font-semibold tabular-nums text-[#7d857f] lg:block">
        {formatMarketplaceMessageDate(thread.createdAt)}
      </p>

      <div className="grid gap-1 lg:justify-end">
        {canAcceptAsContract ? (
          <button
            type="button"
            onClick={() => void acceptAsContract()}
            disabled={isAccepting}
            className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-600 px-3 text-[12px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 lg:w-[126px]"
          >
            {isAccepting ? "생성 중" : "수락"}
            <FileSignature className="h-3.5 w-3.5" />
          </button>
        ) : actionHref ? (
          <Link
            to={actionHref}
            className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-700 transition hover:border-neutral-950 hover:bg-neutral-950 hover:text-white lg:w-[126px]"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-md border border-neutral-200 text-[12px] font-semibold text-neutral-500 lg:w-[126px]">
            연결 대기
          </span>
        )}
        {acceptError ? (
          <p className="max-w-[220px] text-[11px] font-semibold leading-4 text-rose-700 lg:text-right">
            {acceptError}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function ProposalSummary({ summary }: { summary: string }) {
  const parsed = parseProposalSummary(summary);

  return (
    <p className="truncate text-[13px] font-extrabold text-[#303630]" title={summary}>
      {parsed.title}
    </p>
  );
}

function parseProposalSummary(summary: string) {
  const title =
    extractSummaryField(summary, "캠페인 신청:", [
      "모집 설명:",
      "지역/진행방식:",
      "제공상품:",
      "참여 미션:",
      "모집인원:",
      "지급내용:",
      "콘텐츠:",
      "산출물:",
      "플랫폼:",
      "업로드 마감일:",
      "모집마감일:",
    ]) ?? summary.split(/[.。]/)[0]?.trim() ?? summary;
  const payment = extractSummaryField(summary, "지급내용:", [
    "콘텐츠:",
    "산출물:",
    "플랫폼:",
    "업로드 마감일:",
    "모집마감일:",
  ]);
  const deliverable =
    extractSummaryField(summary, "콘텐츠:", [
      "플랫폼:",
      "업로드 마감일:",
      "모집마감일:",
    ]) ??
    extractSummaryField(summary, "산출물:", [
      "플랫폼:",
      "업로드 마감일:",
      "모집마감일:",
    ]);
  const uploadDeadline = extractSummaryField(summary, "업로드 마감일:", [
    "모집마감일:",
  ]);
  const recruitDeadline = extractSummaryField(summary, "모집마감일:", []);
  const deadline = uploadDeadline ?? recruitDeadline;

  return {
    title: formatProposalSummaryTitle(title),
    payment: payment ? `지급 ${normalizeSummaryText(payment)}` : undefined,
    deliverable: deliverable ? `콘텐츠 ${normalizeSummaryText(deliverable)}` : undefined,
    deadline: deadline ? `마감 ${normalizeSummaryText(deadline)}` : undefined,
  };
}

function isOneToOneMessageThread(thread: MessageThread) {
  return !(
    thread.direction === "influencer_to_brand" &&
    Boolean(thread.campaignId)
  );
}

function formatProposalSummaryTitle(value: string) {
  const titleOnly = value.split(/모집\s*설명:/u)[0]?.trim() ?? value;
  return removeInternalTestLabel(
    normalizeSummaryText(titleOnly),
    "캠페인 제안",
  );
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
  const value = normalizeSummaryText(rawValue);

  return value || undefined;
}

function normalizeSummaryText(value: string) {
  return value
    .replace(/T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u, "")
    .replace(/\s+/g, " ")
    .replace(/[·|,-]+$/g, "")
    .trim();
}

function getProposalTypeLabel(thread: MessageThread) {
  return proposalTypeLabels[thread.proposalType] ?? thread.proposalTypeLabel;
}

function LoadingState() {
  return (
    <section
      className="flex min-h-[190px] items-center justify-center rounded-b-[8px] border border-[#d9e0d9] bg-white px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-md">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#59605b] ring-1 ring-[#d9e0d9]">
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
        <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
          제안함 데이터를 불러오는 중입니다
        </h2>
        <p className="mt-1 text-[12px] font-medium leading-5 text-[#7d857f]">
          잠시 후 결과가 없으면 빈 상태와 다음 행동을 안내합니다.
        </p>
      </div>
    </section>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="flex min-h-[190px] items-center justify-center rounded-b-[8px] border border-[#d9e0d9] bg-white px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] bg-rose-50 text-rose-700">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">
          메시지함을 열 수 없습니다
        </h2>
        <p className="mt-1 text-[12px] font-medium leading-5 text-[#7d857f]">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.16)] transition hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          다시 시도
        </button>
      </div>
    </section>
  );
}

function EmptyState({
  title,
  actionLabel,
  actionHref,
}: {
  title: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <section className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-b-[8px] border border-[#d9e0d9] bg-white px-6 py-12 text-center">
      <div className="grid max-w-md justify-items-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
          <Send className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">{title}</h2>
        <Link
          to={actionHref}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.16)] transition hover:bg-blue-700"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
