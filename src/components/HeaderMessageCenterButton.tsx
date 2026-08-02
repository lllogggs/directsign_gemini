import { MessageSquareText } from "lucide-react";

export function HeaderMessageCenterButton({
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
      className="yl-header-action yl-header-action-secondary relative"
      aria-label="메시지함"
      title="메시지함"
    >
      <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2} />
      <span className="hidden sm:inline">메시지함</span>
      {badge ? (
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-extrabold tabular-nums text-white ring-2 ring-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : isLoading ? (
        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-neutral-300 ring-2 ring-white" />
      ) : null}
    </button>
  );
}
