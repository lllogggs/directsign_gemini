import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

type ResponsiveFilterPanelProps = {
  id: string;
  open: boolean;
  title?: string;
  activeCount?: number;
  onClose: () => void;
  onClear?: () => void;
  mobileOnly?: boolean;
  closeLabel?: string;
  children: ReactNode;
  className?: string;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ResponsiveFilterPanel({
  id,
  open,
  title = "필터",
  activeCount = 0,
  onClose,
  onClear,
  mobileOnly = false,
  closeLabel = "적용",
  children,
  className = "",
}: ResponsiveFilterPanelProps) {
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 1023px)").matches,
  );
  const shouldRender = open && (!mobileOnly || isMobileViewport);
  useBodyScrollLock(shouldRender);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!mobileOnly) return undefined;
    const media = window.matchMedia("(max-width: 1023px)");
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, [mobileOnly]);

  useEffect(() => {
    if (!shouldRender) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Node)) return;
      if (panelRef.current?.contains(event.target)) return;
      const targetElement =
        event.target instanceof Element
          ? event.target
          : event.target.parentElement;
      if (targetElement?.closest('[data-filter-select-portal="true"]')) return;
      onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [shouldRender]);

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const candidates = panelRef.current
      ? Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        )
      : [];
    const focusable: HTMLElement[] = candidates.filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.getClientRects().length > 0,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!shouldRender) return null;

  const backdropClassName = mobileOnly
    ? "fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
    : "fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden";
  const panelClassName = mobileOnly
    ? "fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-[20px] border border-neutral-200 bg-white p-4 shadow-[0_-18px_48px_rgba(15,23,42,0.18)]"
    : "fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-[20px] border border-neutral-200 bg-white p-4 shadow-[0_-18px_48px_rgba(15,23,42,0.18)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:max-h-[min(520px,calc(100vh-180px))] sm:w-[min(760px,calc(100vw-48px))] sm:overflow-visible sm:rounded-[12px] sm:p-3 sm:shadow-[0_18px_54px_rgba(15,23,42,0.16)]";
  const mobileActionClassName = mobileOnly
    ? "sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-neutral-200 bg-white/95 px-4 pb-1 pt-3 backdrop-blur"
    : "sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-neutral-200 bg-white/95 px-4 pb-1 pt-3 backdrop-blur sm:hidden";

  return (
    <>
      <div
        className={backdropClassName}
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className={`${panelClassName} ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              id={`${id}-title`}
              className="text-[14px] font-extrabold text-neutral-950 sm:text-[13px]"
            >
              {title}
            </p>
            {activeCount > 0 ? (
              <p className="mt-0.5 text-[11px] font-bold text-neutral-500">
                {activeCount}개 조건 적용
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onClear && activeCount > 0 && !mobileOnly ? (
              <button
                type="button"
                onClick={onClear}
                className="hidden h-8 items-center rounded-[8px] px-2.5 text-[11px] font-extrabold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex"
              >
                초기화
              </button>
            ) : null}
            <button
              ref={closeButtonRef}
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
        <div className={mobileActionClassName}>
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
            className="yl-primary-action h-11 flex-[1.4] rounded-[12px] text-[13px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </>
  );
}
