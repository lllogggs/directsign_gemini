import {
  Bell,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileSignature,
  Megaphone,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import {
  getNotificationCopy,
  getNotificationDestination,
  type NotificationItem,
  type NotificationRole,
} from "../domain/notifications";
import { useNotificationCenter } from "../hooks/useNotificationCenter";

const getNotificationsPath = (role: NotificationRole) =>
  role === "advertiser"
    ? "/advertiser/notifications"
    : "/influencer/notifications";

const formatOccurredAt = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (elapsedSeconds < 60) return "방금 전";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}시간 전`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
};

const getNotificationIcon = (copyKey: string): ReactNode => {
  if (copyKey.startsWith("campaign.")) {
    return <Megaphone className="h-4 w-4" strokeWidth={2} />;
  }
  if (copyKey === "contract.ready_to_sign" || copyKey === "contract.signed") {
    return <FileSignature className="h-4 w-4" strokeWidth={2} />;
  }
  if (copyKey.startsWith("contract.content") || copyKey === "contract.ready_to_close") {
    return <FileCheck2 className="h-4 w-4" strokeWidth={2} />;
  }
  if (copyKey === "deadline.action_due") {
    return <Clock3 className="h-4 w-4" strokeWidth={2} />;
  }
  return <Bell className="h-4 w-4" strokeWidth={2} />;
};

function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  const copy = useMemo(() => getNotificationCopy(item), [item]);
  const isUnread = !item.readAt;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`group flex w-full items-start gap-3 px-4 py-3.5 text-left transition focus-visible:bg-blue-50 focus-visible:outline-none ${
        isUnread ? "bg-blue-50/55 hover:bg-blue-50" : "bg-white hover:bg-neutral-50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${
          isUnread
            ? "bg-blue-600 text-white"
            : "border border-neutral-200 bg-white text-neutral-500"
        }`}
        aria-hidden="true"
      >
        {getNotificationIcon(item.copyKey)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <strong className="min-w-0 flex-1 text-[13px] font-extrabold leading-5 text-neutral-950">
            {copy.title}
          </strong>
          {isUnread ? (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600"
              aria-label="읽지 않음"
            />
          ) : null}
        </span>
        <span className="mt-0.5 block text-[12px] font-semibold leading-[18px] text-neutral-600">
          {copy.detail}
        </span>
        <span className="mt-1.5 block text-[10px] font-bold text-neutral-400">
          {formatOccurredAt(item.occurredAt)}
        </span>
      </span>
      <ChevronRight
        className="mt-2 h-3.5 w-3.5 shrink-0 text-neutral-300 transition group-hover:text-neutral-500"
        aria-hidden="true"
      />
    </button>
  );
}

export function NotificationItems({
  items,
  status,
  error,
  onOpen,
}: {
  items: NotificationItem[];
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  onOpen: (item: NotificationItem) => void;
}) {
  if (status === "loading" && items.length === 0) {
    return (
      <div className="space-y-1 p-2" aria-label="알림 불러오는 중">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex gap-3 rounded-[10px] px-2 py-3">
            <span className="h-8 w-8 shrink-0 animate-pulse rounded-[9px] bg-neutral-100" />
            <span className="min-w-0 flex-1 space-y-2 pt-1">
              <span className="block h-3 w-2/5 animate-pulse rounded-full bg-neutral-100" />
              <span className="block h-3 w-4/5 animate-pulse rounded-full bg-neutral-100" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (status === "error" && items.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[13px] font-extrabold text-neutral-800">
          알림을 불러오지 못했습니다
        </p>
        <p className="mt-1 text-[12px] font-semibold text-neutral-500">
          잠시 후 다시 확인해 주세요.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Bell className="h-4 w-4" />
        </span>
        <p className="mt-3 text-[13px] font-extrabold text-neutral-800">
          새 알림이 없습니다
        </p>
        <p className="mt-1 text-[12px] font-semibold text-neutral-500">
          계약과 캠페인 진행 소식을 알려드릴게요.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-100">
      {items.map((item) => (
        <div key={item.id}>
          <NotificationRow item={item} onOpen={onOpen} />
        </div>
      ))}
      {error ? (
        <p className="px-4 py-2.5 text-center text-[11px] font-bold text-amber-700">
          최신 알림을 불러오지 못했습니다.
        </p>
      ) : null}
    </div>
  );
}

export function HeaderNotificationCenterButton({
  role,
  enabled = true,
}: {
  role: NotificationRole;
  enabled?: boolean;
}) {
  const navigate = useNavigate();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const {
    items,
    unreadCount,
    status,
    error,
    isUpdatingReadState,
    refresh,
    markRead,
    markAllRead,
  } = useNotificationCenter(role, { enabled });

  useEffect(() => {
    if (enabled || !open) return undefined;
    const frame = window.requestAnimationFrame(() => setOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [enabled, open]);

  useEffect(() => {
    if (!open) return undefined;
    void refresh();
    window.requestAnimationFrame(() => panelRef.current?.focus());

    const close = (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      close(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, refresh]);

  if (!enabled) {
    return <span className="h-10 w-10 shrink-0" aria-hidden="true" />;
  }

  const badge = unreadCount && unreadCount > 0 ? unreadCount : undefined;
  const openItem = (item: NotificationItem) => {
    if (!item.readAt) void markRead(item.id);
    const destination = getNotificationDestination(role, item.routeKey, item.routeParams);
    setOpen(false);
    navigate(destination ?? getNotificationsPath(role));
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="yl-header-icon-action relative"
        aria-label={badge ? `알림 ${badge}개` : "알림"}
        title="알림"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <Bell className="h-4 w-4" strokeWidth={2} />
        {badge ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-extrabold tabular-nums text-white ring-2 ring-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="알림"
          tabIndex={-1}
          className="fixed inset-x-3 top-[64px] z-50 flex max-h-[min(620px,calc(100dvh-76px))] flex-col overflow-hidden rounded-[14px] border border-neutral-200 bg-white text-left shadow-[0_24px_70px_rgba(15,23,42,0.2)] outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[390px] sm:max-w-[calc(100vw-24px)]"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-100 px-4">
            <h2 className="text-[14px] font-extrabold text-neutral-950">알림</h2>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={!unreadCount || isUpdatingReadState}
              className="inline-flex h-8 items-center gap-1 rounded-[8px] px-2 text-[11px] font-extrabold text-blue-700 transition hover:bg-blue-50 disabled:pointer-events-none disabled:text-neutral-300"
            >
              <Check className="h-3.5 w-3.5" />
              모두 읽음
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <NotificationItems
              items={items.slice(0, 8)}
              status={status}
              error={error}
              onOpen={openItem}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(getNotificationsPath(role));
            }}
            className="flex h-11 shrink-0 items-center justify-center border-t border-neutral-100 bg-white text-[12px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-950"
          >
            전체 알림 보기
          </button>
        </div>
      ) : null}
    </div>
  );
}
