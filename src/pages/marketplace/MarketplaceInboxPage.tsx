import {
  ArrowLeft,
  ArrowRight,
  Bell,
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
import {
  emptyMarketplaceMessageSummary,
  formatMarketplaceMessageDate,
  marketplaceFlowSteps,
  proposalStatusLabels,
  proposalStatusTone,
  type MarketplaceInboxRole,
  type MarketplaceMessageBucket,
  type MarketplaceMessagesResponse,
} from "../../domain/marketplaceInbox";

type InboxState =
  | { status: "loading" }
  | { status: "ready"; data: MarketplaceMessagesResponse }
  | { status: "error"; message: string };

const roleCopy = {
  advertiser: {
    eyebrow: "광고주 메시지함",
    title: "인플루언서 제안과 계약 전환을 한 곳에서 봅니다",
    description:
      "공개 프로필에서 보낸 컨택, 인플루언서의 역제안, 계약 작성 전 확인해야 할 초안 대화를 정리합니다.",
    backHref: "/advertiser/dashboard",
    backLabel: "계약 대시보드",
    discoverHref: "/advertiser/discover",
    discoverLabel: "인플루언서 찾기",
    primaryHref: "/advertiser/builder",
    primaryLabel: "계약 작성",
    emptyInbox: "아직 받은 역제안이 없습니다",
    emptySent: "아직 보낸 컨택 제안이 없습니다",
  },
  influencer: {
    eyebrow: "인플루언서 메시지함",
    title: "브랜드 제안과 내 역제안을 계약 전까지 관리합니다",
    description:
      "광고주가 보낸 컨택과 내가 브랜드에 보낸 제안을 분리해 보고, 계약 검토 흐름으로 이어지게 합니다.",
    backHref: "/influencer/dashboard",
    backLabel: "계약 대시보드",
    discoverHref: "/influencer/brands",
    discoverLabel: "브랜드 찾기",
    primaryHref: "/influencer/dashboard",
    primaryLabel: "계약 검토",
    emptyInbox: "아직 받은 브랜드 제안이 없습니다",
    emptySent: "아직 보낸 역제안이 없습니다",
  },
} satisfies Record<
  MarketplaceInboxRole,
  {
    eyebrow: string;
    title: string;
    description: string;
    backHref: string;
    backLabel: string;
    discoverHref: string;
    discoverLabel: string;
    primaryHref: string;
    primaryLabel: string;
    emptyInbox: string;
    emptySent: string;
  }
>;

export function MarketplaceInboxPage({ role }: { role: MarketplaceInboxRole }) {
  const navigate = useNavigate();
  const copy = roleCopy[role];
  const [state, setState] = useState<InboxState>({ status: "loading" });
  const [bucket, setBucket] = useState<MarketplaceMessageBucket>("inbox");
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
          thread.proposalTypeLabel,
          proposalStatusLabels[thread.status],
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [bucket, data.threads, normalizedQuery],
  );

  return (
    <main className="min-h-screen bg-neutral-50 font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="truncate text-[18px] font-semibold">{PRODUCT_NAME}</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to={copy.backHref}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{copy.backLabel}</span>
            </Link>
            <button
              type="button"
              onClick={() => void loadMessages()}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
              aria-label="새로고침"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-[12px] font-semibold text-neutral-500">{copy.eyebrow}</p>
          <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div className="min-w-0">
              <h1 className="text-[27px] font-semibold leading-tight text-neutral-950 sm:text-[34px]">
                {copy.title}
              </h1>
              <p className="mt-2 max-w-3xl text-[14px] font-medium leading-6 text-neutral-600">
                {copy.description}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <InboxMetric label="받은 제안" value={data.summary.inboxCount} />
              <InboxMetric label="새 알림" value={data.summary.unreadCount} />
              <InboxMetric label="보낸 제안" value={data.summary.sentCount} />
            </div>
          </div>

          <nav
            aria-label="마켓플레이스 업무 흐름"
            className="no-scrollbar mt-5 flex gap-2 overflow-x-auto"
          >
            {marketplaceFlowSteps[role].map((step) => {
              const active = step.href.endsWith("/messages");
              return (
                <Link
                  key={`${step.label}-${step.href}`}
                  to={step.href}
                  className={`inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-[12px] font-semibold transition ${
                    active
                      ? "border-neutral-950 bg-neutral-950 text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-950"
                  }`}
                >
                  {step.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1320px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
        <aside className="grid gap-3 self-start">
          <NotificationPanel
            unreadCount={data.summary.unreadCount}
            submittedCount={data.summary.submittedCount}
            convertedCount={data.summary.convertedCount}
            role={role}
          />
          <div className="grid gap-2 rounded-[8px] border border-neutral-200 bg-white p-3">
            <Link
              to={copy.discoverHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              <Search className="h-4 w-4" />
              {copy.discoverLabel}
            </Link>
            <Link
              to={copy.primaryHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3 text-[13px] font-semibold text-white transition hover:bg-neutral-800"
            >
              <FileText className="h-4 w-4" />
              {copy.primaryLabel}
            </Link>
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[8px] border border-[#d9e0d9] bg-white">
          <div className="border-b border-[#d9e0d9] bg-[#f8faf7] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 ring-1 ring-[#d9e0d9] lg:w-[260px]">
                <BucketButton
                  active={bucket === "inbox"}
                  label="받은 제안"
                  count={data.summary.inboxCount}
                  onClick={() => setBucket("inbox")}
                />
                <BucketButton
                  active={bucket === "sent"}
                  label="보낸 제안"
                  count={data.summary.sentCount}
                  onClick={() => setBucket("sent")}
                />
              </div>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b938d]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="제안 검색"
                  placeholder="상대방, 소개, 제안 내용 검색"
                  className="h-10 w-full rounded-[6px] border border-[#d9e0d9] bg-white pl-8 pr-3 text-[12px] font-semibold text-[#303630] outline-none transition-colors placeholder:text-[#8b938d] hover:border-[#cbd5cc] focus:border-[#171a17]"
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
              body={
                bucket === "inbox"
                  ? "탐색 화면과 공개 프로필에서 들어온 제안이 여기에 쌓입니다."
                  : "상대에게 보낸 컨택 제안의 상태를 여기에서 다시 확인할 수 있습니다."
              }
            />
          ) : (
            <div className="max-h-[calc(100vh-330px)] min-h-[360px] divide-y divide-[#edf1ed] overflow-y-auto">
              {visibleThreads.map((thread) => (
                <MessageThreadCard key={thread.id} role={role} thread={thread} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function InboxMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] border border-neutral-200 bg-neutral-50 px-3 py-2">
      <p className="text-[11px] font-semibold text-neutral-500">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-neutral-950">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function NotificationPanel({
  unreadCount,
  submittedCount,
  convertedCount,
  role,
}: {
  unreadCount: number;
  submittedCount: number;
  convertedCount: number;
  role: MarketplaceInboxRole;
}) {
  const contractLabel =
    role === "advertiser" ? "조건이 맞는 제안은 계약 작성으로 넘기세요." : "계약 링크가 오면 검토 화면에서 이어집니다.";

  return (
    <section className="rounded-[8px] border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-950 text-white">
          <Bell className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-neutral-950">알림</p>
          <p className="text-[12px] font-medium text-neutral-500">제안 기준으로 정리</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <NotificationRow label="새로 확인할 제안" value={unreadCount} />
        <NotificationRow label="아직 열려 있는 제안" value={submittedCount} />
        <NotificationRow label="계약으로 전환됨" value={convertedCount} />
      </div>
      <p className="mt-4 rounded-md bg-[#f8faf7] px-3 py-2 text-[12px] font-medium leading-5 text-neutral-600">
        {contractLabel}
      </p>
    </section>
  );
}

function NotificationRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
      <span className="text-[12px] font-semibold text-neutral-600">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums text-neutral-950">
        {value.toLocaleString()}
      </span>
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
      className={`h-9 rounded-full px-2 text-[12px] font-extrabold transition ${
        active
          ? "bg-neutral-950 text-white"
          : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950"
      }`}
    >
      {label} <span className={active ? "text-white/70" : "text-neutral-400"}>{count}</span>
    </button>
  );
}

function MessageThreadCard({
  role,
  thread,
}: {
  key?: string;
  role: MarketplaceInboxRole;
  thread: MarketplaceMessagesResponse["threads"][number];
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
        : "프로필 보기"
      : thread.bucket === "inbox"
        ? "브랜드 보기"
        : "제안 대상 보기";

  return (
    <article className="grid gap-3 bg-white px-4 py-4 transition hover:bg-[#f8faf7] lg:grid-cols-[minmax(0,1fr)_190px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold ${proposalStatusTone[thread.status]}`}
          >
            {proposalStatusLabels[thread.status]}
          </span>
          <span className="inline-flex h-7 items-center rounded-md border border-neutral-200 bg-white px-2.5 text-[11px] font-semibold text-neutral-600">
            {thread.proposalTypeLabel}
          </span>
          {thread.unread ? (
            <span className="inline-flex h-7 items-center rounded-md bg-neutral-950 px-2.5 text-[11px] font-semibold text-white">
              읽지 않음
            </span>
          ) : null}
        </div>

        <h2 className="mt-3 truncate text-[16px] font-semibold text-neutral-950">
          {thread.counterpartName}
        </h2>
        <p className="mt-1 text-[13px] font-medium leading-5 text-neutral-600">
          {thread.senderIntro}
        </p>
        <p className="mt-3 rounded-[8px] border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] font-semibold leading-6 text-neutral-800">
          {thread.proposalSummary}
        </p>
      </div>

      <aside className="grid content-between gap-3 rounded-[8px] border border-neutral-200 bg-white p-3">
        <div className="grid gap-2 text-[12px]">
          <MessageMeta label="대상" value={thread.targetName} />
          <MessageMeta label="보낸 사람" value={thread.senderName} />
          <MessageMeta label="접수" value={formatMarketplaceMessageDate(thread.createdAt)} />
        </div>
        {actionHref ? (
          <Link
            to={actionHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3 text-[13px] font-semibold text-white transition hover:bg-neutral-800"
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 text-[13px] font-semibold text-neutral-500">
            프로필 연결 대기
          </span>
        )}
      </aside>
    </article>
  );
}

function MessageMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2">
      <span className="font-semibold text-neutral-500">{label}</span>
      <span className="truncate font-semibold text-neutral-800">{value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="flex min-h-[360px] items-center justify-center px-6 py-10 text-center">
      <div>
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-500">
          <MessageSquareText className="h-5 w-5 animate-pulse" />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-neutral-600">
          메시지함을 불러오는 중입니다
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
    <section className="flex min-h-[360px] items-center justify-center px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] bg-rose-50 text-rose-600">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold text-neutral-950">
          메시지함을 열 수 없습니다
        </h2>
        <p className="mt-2 text-[13px] font-medium leading-6 text-neutral-600">
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
    <section className="flex min-h-[360px] items-center justify-center px-6 py-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-500">
          <Send className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold text-neutral-950">{title}</h2>
        <p className="mt-2 text-[13px] font-medium leading-6 text-neutral-600">
          {body}
        </p>
      </div>
    </section>
  );
}
