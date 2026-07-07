import type { ReactNode } from "react";
import { X } from "lucide-react";

type ResponsiveFilterPanelProps = {
  id: string;
  open: boolean;
  title?: string;
  activeCount?: number;
  onClose: () => void;
  onClear?: () => void;
  children: ReactNode;
  className?: string;
};

export function ResponsiveFilterPanel({
  id,
  open,
  title = "필터",
  activeCount = 0,
  onClose,
  onClear,
  children,
  className = "",
}: ResponsiveFilterPanelProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden"
        aria-label="필터 닫기"
        onClick={onClose}
      />
      <div
        id={id}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-[20px] border border-neutral-200 bg-white p-4 shadow-[0_-18px_48px_rgba(15,23,42,0.18)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:max-h-[min(520px,calc(100vh-180px))] sm:w-[min(760px,calc(100vw-48px))] sm:overflow-visible sm:rounded-[12px] sm:p-3 sm:shadow-[0_18px_54px_rgba(15,23,42,0.16)] ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-extrabold text-neutral-950 sm:text-[13px]">
              {title}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-neutral-500">
              {activeCount > 0 ? `${activeCount}개 조건 적용` : "전체 조건"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onClear && activeCount > 0 ? (
              <button
                type="button"
                onClick={onClear}
                className="hidden h-8 items-center rounded-[8px] px-2.5 text-[11px] font-extrabold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex"
              >
                초기화
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-950"
              aria-label="필터 닫기"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="mt-3">{children}</div>
        <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-neutral-200 bg-white/95 px-4 pb-1 pt-3 backdrop-blur sm:hidden">
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="h-11 flex-1 rounded-[12px] border border-neutral-200 bg-white text-[13px] font-extrabold text-neutral-600"
            >
              초기화
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-[1.4] rounded-[12px] bg-neutral-950 text-[13px] font-extrabold text-white"
          >
            적용
          </button>
        </div>
      </div>
    </>
  );
}
