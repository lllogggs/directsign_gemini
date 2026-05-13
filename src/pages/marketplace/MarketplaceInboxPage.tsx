import {
  ArrowLeft,
  ArrowRight,
  FileText,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import type { CampaignProposalType } from "../../domain/marketplace";
import {
  emptyMarketplaceMessageSummary,
  formatMarketplaceMessageDate,
  type MarketplaceInboxRole,
  type MarketplaceMessageBucket,
  type MarketplaceMessagesResponse,
  type MarketplaceProposalStatus,
} from "../../domain/marketplaceInbox";

type InboxState =
  | { status: "loading" }
  | { status: "ready"; data: MarketplaceMessagesResponse }
  | { status: "error"; message: string };

type MessageThread = MarketplaceMessagesResponse["threads"][number];

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
    eyebrow: "광고주 메시지함",
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
    eyebrow: "인플루언서 메시지함",
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
  const visibleThreads = useMemo(
    () =>
      data.threads.filter((thread) => {
        if (thread.bucket !== bucket) return false;
        if (!normalizedQuery) return true;

        return [
          thread.senderName,
          thread.targetName,
          thread.counterpartName,
          thread.senderIntro,
          thread.proposalSummary,
          getProposalTypeLabel(thread),
          proposalStatusLabels[thread.status],
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [bucket, data.threads, normalizedQuery],
  );

  return (
    <main className="min-h-screen bg-[#f6f6f5] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[7px] bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="truncate text-[17px] font-extrabold tracking-[-0.01em]">
              {PRODUCT_NAME}
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to={copy.backHref}
              className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{copy.backLabel}</span>
            </Link>
            <button
              type="button"
              onClick={() => void loadMessages()}
              className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 py-4 sm:px-6">
        <section className="overflow-hidden rounded-[12px] border border-neutral-200 bg-white">
          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-neutral-500">{copy.eyebrow}</p>
              <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-neutral-950 sm:text-[26px]">
                {copy.summaryTitle(focusMetrics.headingCount)}
              </h1>
              <p className="mt-1 text-[13px] font-semibold leading-5 text-neutral-500">
                {copy.summaryHint}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                to={copy.discoverHref}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[7px] border border-neutral-200 bg-white px-3 text-[12px] font-bold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
              >
                <Search className="h-4 w-4" />
                {copy.discoverLabel}
              </Link>
              <Link
                to={copy.primaryHref}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[7px] bg-neutral-950 px-3 text-[12px] font-bold text-white transition hover:bg-neutral-800"
              >
                <FileText className="h-4 w-4" />
                {copy.primaryLabel}
              </Link>
            </div>
          </div>

          <div className="grid border-t border-neutral-200 bg-neutral-50/80 sm:grid-cols-3">
            <SummaryMetric
              label={focusMetrics.primaryLabel}
              value={focusMetrics.primaryValue}
              emphasis={role === "advertiser"}
            />
            <SummaryMetric
              label={focusMetrics.firstLabel}
              value={focusMetrics.firstValue}
              emphasis={role !== "advertiser"}
            />
            <SummaryMetric label={focusMetrics.secondLabel} value={focusMetrics.secondValue} />
          </div>
        </section>

        <section className="mt-3 min-w-0 overflow-hidden rounded-[12px] border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 bg-white p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="grid grid-cols-2 gap-1 rounded-[9px] bg-neutral-100 p-1 lg:w-[280px]">
                {bucketOptions.map((option) => (
                  <div key={option.id}>
                    <BucketButton
                      active={bucket === option.id}
                      label={option.label}
                      count={option.count}
                      onClick={() => setBucket(option.id)}
                    />
                  </div>
                ))}
              </div>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="제안 검색"
                  placeholder={copy.searchPlaceholder}
                  className="h-10 w-full rounded-[8px] border border-neutral-200 bg-white pl-8 pr-3 text-[13px] font-semibold text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950"
                />
              </div>
            </div>
          </div>

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
            <>
              <div className="hidden grid-cols-[112px_minmax(150px,200px)_minmax(0,1fr)_118px_118px] border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-extrabold text-neutral-500 md:grid">
                <span>상태</span>
                <span>상대</span>
                <span>제안</span>
                <span className="text-right">{copy.dateHeader}</span>
                <span className="sr-only">액션</span>
              </div>
              <div className="max-h-[calc(100vh-292px)] min-h-[340px] divide-y divide-neutral-100 overflow-y-auto">
                {visibleThreads.map((thread) => (
                  <div key={thread.id}>
                    <MessageThreadRow role={role} thread={thread} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 first:border-t-0 sm:block sm:border-l sm:border-t-0 sm:first:border-l-0 ${
        emphasis ? "bg-white" : ""
      }`}
    >
      <p className="text-[12px] font-bold text-neutral-500">{label}</p>
      <p className="mt-0 flex items-baseline gap-0.5 text-neutral-950 sm:mt-1">
        <span className="text-[22px] font-extrabold leading-none tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="text-[13px] font-bold text-neutral-500">건</span>
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
      className={`inline-flex h-8 items-center justify-center gap-1 rounded-[7px] px-2 text-[12px] font-extrabold transition ${
        active
          ? "bg-white text-neutral-950 shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
          : "text-neutral-500 hover:bg-white/70 hover:text-neutral-950"
      }`}
    >
      <span>{label}</span>
      <span className={active ? "text-neutral-500" : "text-neutral-400"}>
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function MessageThreadRow({
  role,
  thread,
}: {
  role: MarketplaceInboxRole;
  thread: MessageThread;
}) {
  const actionHref =
    role === "advertiser"
      ? thread.bucket === "inbox"
        ? "/advertiser/builder"
        : thread.counterpartHref
      : thread.counterpartHref ?? "/influencer/dashboard";
  const actionLabel =
    role === "advertiser"
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

  return (
    <article className="grid gap-3 bg-white px-4 py-3.5 transition hover:bg-neutral-50 md:grid-cols-[112px_minmax(150px,200px)_minmax(0,1fr)_118px_118px] md:items-center">
      <div className="flex min-w-0 items-center gap-2 md:block">
        <span
          className={`inline-flex h-6 shrink-0 items-center rounded-[6px] border px-2 text-[11px] font-extrabold ${proposalStatusTone[thread.status]}`}
        >
          {proposalStatusLabels[thread.status]}
        </span>
        {thread.unread ? (
          <span className="inline-flex h-6 items-center rounded-[6px] bg-neutral-950 px-2 text-[11px] font-extrabold text-white md:mt-1">
            새 메시지
          </span>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[14px] font-extrabold text-neutral-950">
          {thread.counterpartName}
        </p>
        <p className="mt-0.5 truncate text-[12px] font-semibold text-neutral-500">
          {relationshipLabel} · {relationshipName}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-[6px] border border-neutral-200 bg-white px-2 text-[11px] font-extrabold text-neutral-700">
            {proposalTypeLabel}
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-800">
            {thread.proposalSummary}
          </p>
        </div>
        <p className="mt-1 line-clamp-1 text-[12px] font-medium leading-5 text-neutral-500 md:hidden">
          {formatMarketplaceMessageDate(thread.createdAt)}
        </p>
      </div>

      <p className="hidden text-right text-[12px] font-bold tabular-nums text-neutral-500 md:block">
        {formatMarketplaceMessageDate(thread.createdAt)}
      </p>

      <div className="flex md:justify-end">
        {actionHref ? (
          <Link
            to={actionHref}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[7px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-800 transition hover:border-neutral-950 hover:bg-neutral-950 hover:text-white md:w-[104px]"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="inline-flex h-9 w-full items-center justify-center rounded-[7px] border border-neutral-200 text-[12px] font-bold text-neutral-500 md:w-[104px]">
            연결 대기
          </span>
        )}
      </div>
    </article>
  );
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
    <section className="min-h-[340px] px-4 py-4">
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-[8px] border border-neutral-100 bg-neutral-50 px-3 py-3 md:grid-cols-[112px_minmax(150px,200px)_minmax(0,1fr)_118px_118px]"
          >
            <div className="h-6 rounded bg-neutral-200/70" />
            <div className="h-6 rounded bg-neutral-200/70" />
            <div className="h-6 rounded bg-neutral-200/70" />
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
    <section className="flex min-h-[340px] items-center justify-center px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] bg-rose-50 text-rose-600">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-[17px] font-extrabold text-neutral-950">
          메시지함을 열 수 없습니다
        </h2>
        <p className="mt-2 text-[13px] font-semibold leading-6 text-neutral-600">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[7px] bg-neutral-950 px-4 text-[13px] font-extrabold text-white transition hover:bg-neutral-800"
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
    <section className="flex min-h-[340px] items-center justify-center px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-500">
          <Send className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-[17px] font-extrabold text-neutral-950">{title}</h2>
        <p className="mt-2 text-[13px] font-semibold leading-6 text-neutral-600">
          {body}
        </p>
      </div>
    </section>
  );
}
