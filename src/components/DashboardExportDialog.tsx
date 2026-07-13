import { useEffect, useRef, type KeyboardEvent } from "react";
import { Download, ExternalLink, FileSpreadsheet, Loader2, X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

type DashboardExportDialogProps = {
  open: boolean;
  onClose: () => void;
  onExcel: () => void;
  onGoogleSheets: () => void;
  googleSheetsUrl?: string;
  googleSheetsError?: string;
  isGoogleSheetsPending?: boolean;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DashboardExportDialog({
  open,
  onClose,
  onExcel,
  onGoogleSheets,
  googleSheetsUrl,
  googleSheetsError,
  isGoogleSheetsPending = false,
}: DashboardExportDialogProps) {
  useBodyScrollLock(open);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

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
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const candidates = dialogRef.current
      ? Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        )
      : [];
    const focusable: HTMLElement[] = candidates.filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.getClientRects().length > 0,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-export-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="w-full max-w-[420px] rounded-[8px] border border-neutral-200 bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="dashboard-export-title"
              className="text-[17px] font-bold leading-tight text-neutral-950"
            >
              내보내기
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
            aria-label="닫기"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onExcel}
            className="flex min-h-[58px] items-center gap-3 rounded-[8px] border border-neutral-200 bg-white px-3 text-left hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-800">
              <Download className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-neutral-950">
                엑셀 파일
              </span>
              <span className="block text-[12px] font-medium text-neutral-500">
                .xlsx로 바로 다운로드
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onGoogleSheets}
            disabled={isGoogleSheetsPending}
            className="flex min-h-[58px] items-center gap-3 rounded-[8px] border border-neutral-200 bg-white px-3 text-left hover:border-neutral-300 hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#e8f0fe] text-[#1a73e8]">
              {isGoogleSheetsPending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <FileSpreadsheet className="h-4 w-4" strokeWidth={2} />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-neutral-950">
                Google 스프레드시트
              </span>
              <span className="block text-[12px] font-medium text-neutral-500">
                연결된 Google Drive에 새 시트 생성
              </span>
            </span>
          </button>
        </div>

        {googleSheetsUrl ? (
          <a
            href={googleSheetsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#1f6feb] px-3 text-[13px] font-bold text-white hover:bg-[#185abc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6feb]"
          >
            스프레드시트 열기
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        ) : null}

        {googleSheetsError ? (
          <p className="mt-3 rounded-[8px] bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
            {googleSheetsError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
