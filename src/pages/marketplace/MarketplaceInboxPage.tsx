import {
  ArrowLeft,
  ArrowRight,
  FileSignature,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  getPlatformTone,
  platformLabels,
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
  "sponsored_post",
  "product_seeding",
  "ppl",
  "group_buy",
  "visit_review",
];
const proposalStatusFilterOptions: ProposalStatusFilter[] = [
  "all",
  "submitted",
  "reviewed",
  "converted_to_contract",
  "closed",
];

const proposalTypeLabels: Record<CampaignProposalType, string> = {
  sponsored_post: "유료 광고",
  product_seeding: "제품 협찬",
  ppl: "PPL",
  group_buy: "공동구매",
  visit_review: "방문 리뷰",
};

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
    panelTitle: "계약으로 넘길 제안",
    summaryTitle: (openCount: number) =>
      openCount > 0
        ? `보낸 제안 ${openCount.toLocaleString()}건이 진행 중입니다`
        : "보낸 제안 진행 상황",
    summaryHint: "인플루언서에게 보낸 제안의 확인, 검토, 계약 전환을 관리합니다.",
    backHref: "/advertiser/dashboard",
    backLabel: "계약 대시보드",
    discoverHref: "/advertiser/discover",
    discoverLabel: "인플루언서 찾기",
    primaryHref: "/advertiser/builder",
    primaryLabel: "계약 작성",
    emptyInbox: "아직 받은 역제안이 없습니다",
    emptySent: "아직 보낸 컨택 제안이 없습니다",
    emptyInboxBody: "공개 프로필이나 탐색 화면에서 들어온 역제안이 여기에 쌓입니다.",
    emptySentBody: "인플루언서를 찾아 제안을 보내면 진행 상태가 여기에 정리됩니다.",
    primaryBucketLabel: "보낸 제안",
    secondaryBucketLabel: "받은 제안",
    searchPlaceholder: "인플루언서, 제안 종류, 제안 내용 검색",
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
    backLabel: "계약 대시보드",
    discoverHref: "/influencer/brands",
    discoverLabel: "브랜드 찾기",
    primaryHref: "/influencer/dashboard",
    primaryLabel: "계약 검토",
    emptyInbox: "아직 받은 브랜드 제안이 없습니다",
    emptySent: "아직 보낸 역제안이 없습니다",
    emptyInboxBody: "브랜드가 보낸 컨택 제안이 도착하면 이 화면에서 확인할 수 있습니다.",
    emptySentBody: "브랜드에 보낸 역제안의 진행 상태가 여기에 정리됩니다.",
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
    emptyInboxBody: string;
    emptySentBody: string;
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
  const [bucket, setBucket] = useState<MarketplaceMessageBucket>(primaryBucket);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [proposalTypeFilter, setProposalTypeFilter] =
    useState<ProposalTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ProposalStatusFilter>("all");
  const [query, setQuery] = useState("");

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

  const data =
    state.status === "ready"
      ? state.data
      : {
          role,
          threads: [],
          summary: emptyMarketplaceMessageSummary,
        };
  const normalizedQuery = query.trim().toLowerCase();
  const sentThreads = useMemo(
    () => data.threads.filter((thread) => thread.bucket === "sent"),
    [data.threads],
  );
  const sentOpenCount = sentThreads.filter((thread) =>
    ["submitted", "reviewed"].includes(thread.status),
  ).length;
  const sentConvertedCount = sentThreads.filter(
    (thread) => thread.status === "converted_to_contract",
  ).length;
  const inboxOpenCount = data.threads.filter(
    (thread) =>
      thread.bucket === "inbox" && ["submitted", "reviewed"].includes(thread.status),
  ).length;
  const focusMetrics =
    role === "advertiser"
      ? {
          headingCount: sentOpenCount,
          primaryLabel: "보낸 제안",
          primaryValue: data.summary.sentCount,
          firstLabel: "진행 중",
          firstValue: sentOpenCount,
          secondLabel: "계약 전환",
          secondValue: sentConvertedCount,
        }
      : {
          headingCount: inboxOpenCount,
          primaryLabel: "받은 제안",
          primaryValue: data.summary.inboxCount,
          firstLabel: "확인 필요",
          firstValue: data.summary.unreadCount,
          secondLabel: "진행 중",
          secondValue: inboxOpenCount,
        };
  const bucketOptions: Array<{
    id: MarketplaceMessageBucket;
    label: string;
    count: number;
  }> =
    role === "advertiser"
      ? [
          { id: "sent", label: copy.primaryBucketLabel, count: data.summary.sentCount },
          { id: "inbox", label: copy.secondaryBucketLabel, count: data.summary.inboxCount },
        ]
      : [
          { id: "inbox", label: copy.primaryBucketLabel, count: data.summary.inboxCount },
          { id: "sent", label: copy.secondaryBucketLabel, count: data.summary.sentCount },
        ];
  const bucketThreads = useMemo(
    () => data.threads.filter((thread) => thread.bucket === bucket),
    [bucket, data.threads],
  );
  const platformCounts = useMemo(() => {
    const counts = Object.fromEntries(
      platformFilterOptions.map((platform) => [platform, 0]),
    ) as Record<PlatformFilter, number>;
    counts.all = bucketThreads.length;
    for (const thread of bucketThreads) {
      const platforms: InfluencerPlatform[] = thread.platforms.length
        ? thread.platforms.map((item) => item.platform)
        : ["other" as InfluencerPlatform];
      for (const platform of new Set<InfluencerPlatform>(platforms)) {
        counts[platform] += 1;
      }
    }
    return counts;
  }, [bucketThreads]);
  const proposalTypeCounts = useMemo(() => {
    const counts = Object.fromEntries(
      proposalTypeFilterOptions.map((type) => [type, 0]),
    ) as Record<ProposalTypeFilter, number>;
    counts.all = bucketThreads.length;
    for (const thread of bucketThreads) counts[thread.proposalType] += 1;
    return counts;
  }, [bucketThreads]);
  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(
      proposalStatusFilterOptions.map((status) => [status, 0]),
    ) as Record<ProposalStatusFilter, number>;
    counts.all = bucketThreads.length;
    for (const thread of bucketThreads) counts[thread.status] += 1;
    return counts;
  }, [bucketThreads]);
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
      ? `진행 중 ${sentOpenCount.toLocaleString()}건`
      : `확인 필요 ${data.summary.unreadCount.toLocaleString()}건`;
  const contractHomeIsPrimary = copy.primaryHref === copy.backHref;
  const resetScopedFilters = () => {
    setPlatformFilter("all");
    setProposalTypeFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-neo-heavy hidden text-[19px] leading-none sm:inline">{PRODUCT_NAME}</span>
          </Link>

          <div className="no-scrollbar ml-3 flex min-w-0 items-center gap-2 overflow-x-auto">
            {!contractHomeIsPrimary ? (
              <Link
                to={copy.primaryHref}
                className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-blue-600 px-3 text-[13px] font-extrabold text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)] transition hover:bg-blue-700"
              >
                <FileSignature className="h-4 w-4" />
                {copy.primaryLabel}
              </Link>
            ) : null}
            <Link
              to={copy.backHref}
              className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] px-3 text-[13px] font-extrabold transition ${
                contractHomeIsPrimary
                  ? "bg-blue-600 text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)] hover:bg-blue-700"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-950"
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8">
        <section className="min-w-0 overflow-hidden rounded-[18px] border border-neutral-200 bg-[#fdfdfb] shadow-[0_22px_60px_rgba(23,26,23,0.08)]">
          <div className="border-b border-[#d9e0d9] bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-extrabold text-[#7d857f]">
                  {copy.eyebrow}
                </p>
                <h1 className="font-neo-heavy mt-1 truncate text-[22px] leading-tight text-[#171a17]">
                  {copy.panelTitle}
                </h1>
                <p className="mt-1 text-[12px] font-medium text-[#7d857f]">
                  전체 {data.threads.length.toLocaleString()}건 · 검색 결과{" "}
                  {visibleThreads.length.toLocaleString()}건
                </p>
              </div>
              <span className="inline-flex h-8 items-center rounded-full bg-[#eef0ed] px-3 text-[12px] font-extrabold text-[#303630]">
                {headerBadge}
              </span>
            </div>
          </div>

          <div className="grid border-b border-neutral-200/80 bg-[#fcfcfd] sm:grid-cols-3">
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

          <div className="min-w-0 p-4">
            <section className="rounded-t-[8px] border border-b-0 border-[#d9e0d9] bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="제안 검색"
                    placeholder={copy.searchPlaceholder}
                    className="h-10 w-full rounded-[6px] border border-[#d9e0d9] bg-[#f8faf7] pl-8 pr-3 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17] focus:bg-white"
                  />
                </div>
                <div
                  className="grid min-w-0 grid-cols-2 gap-1 overflow-hidden rounded-full bg-neutral-100 p-1 lg:w-[300px] lg:shrink-0"
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
                          setBucket(option.id);
                          resetScopedFilters();
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid gap-2 border-t border-[#edf1ed] pt-3 xl:grid-cols-[1.08fr_1.08fr_0.94fr]">
                <FilterGroup label="플랫폼">
                  {platformFilterOptions.map((platform) => (
                    <div key={platform}>
                      <FilterButton
                        active={platformFilter === platform}
                        count={platformCounts[platform]}
                        label={platform === "all" ? "전체" : platformLabels[platform]}
                        tone={platform === "all" ? undefined : getPlatformTone(platform)}
                        onClick={() => setPlatformFilter(platform)}
                      />
                    </div>
                  ))}
                </FilterGroup>
                <FilterGroup label="제안 종류">
                  {proposalTypeFilterOptions.map((type) => (
                    <div key={type}>
                      <FilterButton
                        active={proposalTypeFilter === type}
                        count={proposalTypeCounts[type]}
                        label={type === "all" ? "전체" : proposalTypeLabels[type]}
                        onClick={() => setProposalTypeFilter(type)}
                      />
                    </div>
                  ))}
                </FilterGroup>
                <FilterGroup label="상태">
                  {proposalStatusFilterOptions.map((status) => (
                    <div key={status}>
                      <FilterButton
                        active={statusFilter === status}
                        count={statusCounts[status]}
                        label={status === "all" ? "전체" : proposalStatusLabels[status]}
                        tone={status === "all" ? undefined : proposalStatusTone[status]}
                        onClick={() => setStatusFilter(status)}
                      />
                    </div>
                  ))}
                </FilterGroup>
              </div>
            </section>

            {state.status === "loading" ? (
              <LoadingState />
            ) : state.status === "error" ? (
              <ErrorState message={state.message} onRetry={loadMessages} />
            ) : visibleThreads.length === 0 ? (
              <EmptyState
                title={bucket === "inbox" ? copy.emptyInbox : copy.emptySent}
                body={bucket === "inbox" ? copy.emptyInboxBody : copy.emptySentBody}
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
      className={`h-9 w-full min-w-0 rounded-full px-1 text-[12px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
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

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[7px] border border-[#e5eae5] bg-[#fbfcfa] px-3 py-2.5">
      <span className="block text-[12px] font-extrabold text-[#303630]">{label}</span>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  count,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  const activeClass = tone ?? "border-[#171a17] bg-[#171a17] text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 ${
        active
          ? activeClass
          : "border-[#d9e0d9] bg-white text-[#59605b] hover:border-[#b8c2ba] hover:text-[#171a17]"
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-[11px] ${
          active ? "opacity-80" : "text-[#a0aaa2]"
        }`}
      >
        {count.toLocaleString()}
      </span>
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
    <section className="overflow-hidden rounded-b-[8px] border border-[#d9e0d9] bg-white">
      <div className="hidden grid-cols-[104px_minmax(160px,0.85fr)_minmax(166px,0.9fr)_104px_minmax(240px,1.25fr)_122px_104px] border-b border-[#d9e0d9] bg-[#f8faf7] px-4 py-3 text-[11px] font-semibold text-[#7d857f] lg:grid">
        <span>상태</span>
        <span>상대</span>
        <span>플랫폼</span>
        <span>종류</span>
        <span>제안 내용</span>
        <span className="text-right">{copy.dateHeader}</span>
        <span className="sr-only">액션</span>
      </div>
      <div className="max-h-[620px] divide-y divide-[#edf1ed] overflow-y-auto lg:max-h-[calc(100vh-360px)]">
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
      ? `/advertiser/contract/${thread.convertedContractId}`
      : role === "advertiser"
        ? thread.bucket === "inbox"
          ? "/advertiser/builder"
          : thread.counterpartHref
        : thread.counterpartHref ?? "/influencer/dashboard";
  const actionLabel =
    thread.convertedContractId
      ? "초안 보기"
      : role === "advertiser"
        ? thread.bucket === "inbox"
          ? "계약 작성"
          : "상대 보기"
        : thread.bucket === "inbox"
          ? "브랜드 보기"
          : "대상 보기";
  const relationshipLabel = getRelationshipLabel(role, thread);
  const relationshipName =
    thread.bucket === "sent" ? thread.targetName : thread.senderName;
  const proposalTypeLabel = getProposalTypeLabel(thread);

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
    <article className="grid gap-3 bg-white px-4 py-3 text-left transition-colors hover:bg-[#f8faf7] lg:grid-cols-[104px_minmax(160px,0.85fr)_minmax(166px,0.9fr)_104px_minmax(240px,1.25fr)_122px_104px] lg:items-center">
      <div className="flex min-w-0 items-center gap-2 md:block">
        <span
          className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[11px] font-semibold ${proposalStatusTone[thread.status]}`}
        >
          {proposalStatusLabels[thread.status]}
        </span>
        {thread.unread ? (
          <span className="inline-flex h-6 items-center rounded-md bg-neutral-950 px-2 text-[11px] font-semibold text-white md:mt-1">
            새 메시지
          </span>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-[#171a17]">
          {thread.counterpartName}
        </p>
        <p className="mt-0.5 truncate text-[12px] font-medium text-[#7d857f]">
          {relationshipLabel} · {relationshipName}
        </p>
      </div>

      <div className="min-w-0">
        <PlatformPills platforms={thread.platforms} />
      </div>

      <div className="min-w-0">
        <span className="inline-flex h-6 items-center rounded-[5px] border border-[#d9e0d9] bg-white px-2 text-[11px] font-semibold text-[#59605b]">
          {proposalTypeLabel}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#303630]">
          {thread.proposalSummary}
        </p>
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
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-[12px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300 lg:w-[104px]"
          >
            {isAccepting ? "생성 중" : "수락"}
            <FileSignature className="h-3.5 w-3.5" />
          </button>
        ) : actionHref ? (
          <Link
            to={actionHref}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-700 transition hover:border-neutral-950 hover:bg-neutral-950 hover:text-white lg:w-[104px]"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex h-9 w-full items-center justify-center rounded-md border border-neutral-200 text-[12px] font-semibold text-neutral-500 lg:w-[104px]">
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

function PlatformPills({ platforms }: { platforms: MessageThread["platforms"] }) {
  const visiblePlatforms =
    platforms.length > 0
      ? platforms
      : [{ platform: "other" as InfluencerPlatform, label: platformLabels.other }];
  const visibleCount = Math.min(visiblePlatforms.length, 2);

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visiblePlatforms.slice(0, visibleCount).map((item, index) => (
        <span
          key={`${item.platform}-${item.handle ?? item.label}-${index}`}
          title={item.handle ? `${formatPlatformLabel(item)} · ${item.handle}` : formatPlatformLabel(item)}
          className={`inline-flex h-6 max-w-full items-center rounded-[5px] border px-2 text-[11px] font-bold ${getPlatformTone(
            item.platform,
          )}`}
        >
          <span className="truncate">{formatPlatformLabel(item)}</span>
        </span>
      ))}
      {visiblePlatforms.length > visibleCount ? (
        <span className="inline-flex h-6 items-center rounded-[5px] border border-[#d9e0d9] bg-white px-2 text-[11px] font-bold text-[#7d857f]">
          +{visiblePlatforms.length - visibleCount}
        </span>
      ) : null}
    </div>
  );
}

function formatPlatformLabel(item: MessageThread["platforms"][number]) {
  const baseLabel = platformLabels[item.platform];
  if (!item.label || item.label === baseLabel) return baseLabel;
  return `${baseLabel}-${item.label}`;
}

function getProposalTypeLabel(thread: MessageThread) {
  return proposalTypeLabels[thread.proposalType] ?? thread.proposalTypeLabel;
}

function getRelationshipLabel(role: MarketplaceInboxRole, thread: MessageThread) {
  if (role === "advertiser") {
    return thread.bucket === "sent" ? "인플루언서" : "보낸 사람";
  }

  return thread.bucket === "inbox" ? "브랜드" : "제안 대상";
}

function LoadingState() {
  return (
    <section className="rounded-b-[8px] border border-[#d9e0d9] bg-white px-4 py-4">
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-[8px] border border-[#edf1ed] bg-[#f8faf7] px-3 py-3 lg:grid-cols-[104px_minmax(160px,0.85fr)_minmax(166px,0.9fr)_104px_minmax(240px,1.25fr)_122px_104px]"
          >
            <div className="h-6 rounded bg-neutral-200/70" />
            <div className="h-6 rounded bg-neutral-200/70" />
            <div className="h-6 rounded bg-neutral-200/70" />
            <div className="hidden h-6 rounded bg-neutral-200/70 md:block" />
            <div className="hidden h-6 rounded bg-neutral-200/70 md:block" />
            <div className="hidden h-6 rounded bg-neutral-200/70 md:block" />
            <div className="hidden h-6 rounded bg-neutral-200/70 md:block" />
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">
        메시지함을 불러오는 중입니다.
      </p>
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
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-[13px] font-semibold text-white transition hover:bg-neutral-800"
        >
          <RefreshCw className="h-4 w-4" />
          다시 시도
        </button>
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="flex min-h-[190px] flex-col items-center justify-center rounded-b-[8px] border border-[#d9e0d9] bg-white px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f8faf7] text-[#aeb7b0] ring-1 ring-[#d9e0d9]">
          <Send className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-[14px] font-semibold text-[#171a17]">{title}</h2>
        <p className="mt-1 max-w-md text-[12px] leading-5 text-[#7d857f]">
          {body}
        </p>
      </div>
    </section>
  );
}
