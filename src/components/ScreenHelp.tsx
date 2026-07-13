import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpenText,
  CheckCircle2,
  HelpCircle,
  ListChecks,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ContractFirstExperienceContent,
  ScreenHelpContent,
} from "../domain/screenHelp";

type ScreenHelpButtonProps = {
  content: ScreenHelpContent;
  className?: string;
  buttonClassName?: string;
  label?: string;
};

type ContractFirstExperienceDialogProps = {
  content: ContractFirstExperienceContent;
  onCreateContract: () => void;
};

export function ScreenHelpButton({
  content,
  className,
  buttonClassName,
  label = "이 화면 도움말",
}: ScreenHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const triggerButton = triggerButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => triggerButton?.focus());
    };
  }, [open]);

  return (
    <>
      <span className={cn("inline-flex shrink-0", className)}>
        <button
          ref={triggerButtonRef}
          type="button"
          data-od-id={`${content.id}-trigger`}
          onClick={() => setOpen(true)}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={label}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-neutral-200 bg-white text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
            buttonClassName,
          )}
        >
          <HelpCircle className="h-4 w-4" strokeWidth={1.9} />
        </button>
      </span>

      {open && typeof document !== "undefined"
        ? createPortal(
          <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            data-od-id={`${content.id}-modal`}
            className="relative grid max-h-[calc(100dvh-2rem)] w-full max-w-[680px] overflow-hidden rounded-[20px] border border-neutral-200 bg-white p-0 text-left shadow-[0_1px_0_rgba(15,23,42,0.035),0_24px_70px_rgba(15,23,42,0.14)]"
          >
            <div className="border-b border-neutral-200/80 bg-white p-5 sm:p-6">
              <button
                type="button"
                ref={closeButtonRef}
                data-slot="dialog-close"
                onClick={() => setOpen(false)}
                aria-label="도움말 닫기"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <X className="h-4 w-4" strokeWidth={1.9} />
              </button>
              <div className="mb-3 flex items-center gap-3 pr-10">
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
                  <BookOpenText className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-400">
                  화면 도움말
                </span>
              </div>
              <h2
                id={titleId}
                className="font-neo-heavy text-[24px] leading-tight text-neutral-950"
              >
                {content.title}
              </h2>
              <p id={descriptionId} className="pt-2 text-sm leading-6 text-neutral-600">
                {content.summary}
              </p>
            </div>

            <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-6">
              <section className="min-w-0 space-y-4">
                <HelpPanel
                  icon={<ListChecks className="h-4 w-4" strokeWidth={1.9} />}
                  title="지금 할 일"
                >
                  <p className="text-sm leading-6 text-neutral-700">
                    {content.primaryAction}
                  </p>
                </HelpPanel>

                <HelpPanel
                  icon={<CheckCircle2 className="h-4 w-4" strokeWidth={1.9} />}
                  title="진행 순서"
                >
                  <ol className="grid gap-2">
                    {content.steps.map((step, index) => (
                      <li
                        key={step.title}
                        className="grid grid-cols-[28px_minmax(0,1fr)] gap-3"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 text-[12px] font-bold text-white">
                          {index + 1}
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-neutral-950">
                            {step.title}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-5 text-neutral-600">
                            {step.description}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </HelpPanel>
              </section>

              <aside className="space-y-4">
                <HelpPanel
                  icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.9} />}
                  title="계약 흐름"
                >
                  <ol className="grid gap-1.5">
                    {content.flow.map((item, index) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-[12px] font-semibold text-neutral-700"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-[#fbfaf7] text-[10px] text-neutral-500">
                          {index + 1}
                        </span>
                        <span className="min-w-0">{item}</span>
                      </li>
                    ))}
                  </ol>
                </HelpPanel>

                <HelpPanel title="확인할 것">
                  <ul className="grid gap-2">
                    {content.safeguards.map((item) => (
                      <li
                        key={item}
                        className="text-[12px] leading-5 text-neutral-600 before:mr-2 before:text-neutral-400 before:content-['•']"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </HelpPanel>

                <div className="rounded-[14px] border border-blue-100 bg-blue-50/70 p-3 text-[12px] leading-5 text-blue-950">
                  <p className="font-bold">완료 기준</p>
                  <p className="mt-1 text-blue-900/80">{content.completion}</p>
                </div>
              </aside>
            </div>

            <div className="border-t border-neutral-200/80 bg-[#fbfaf7] px-5 py-4 text-right sm:px-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-[10px] bg-neutral-950 px-4 text-[13px] font-bold text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                확인했습니다
              </button>
            </div>
          </section>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}

export function ContractFirstExperienceDialog({
  content,
  onCreateContract,
}: ContractFirstExperienceDialogProps) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;

    try {
      return window.localStorage.getItem(content.storageKey) !== "seen";
    } catch {
      return false;
    }
  });
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(content.storageKey, "seen");
    } catch {
      // The guide is non-critical; ignore storage failures.
    }
  }, [content.storageKey]);

  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismiss, open]);

  const startContract = () => {
    markSeen();
    setOpen(false);
    onCreateContract();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-od-id={`${content.id}-modal`}
        className="relative grid max-h-[calc(100dvh-2rem)] w-full max-w-[720px] overflow-hidden rounded-[20px] border border-neutral-200 bg-white text-left shadow-[0_1px_0_rgba(15,23,42,0.035),0_24px_70px_rgba(15,23,42,0.14)]"
      >
        <div className="border-b border-neutral-200/80 bg-white p-5 sm:p-6">
          <button
            type="button"
            ref={closeButtonRef}
            data-slot="dialog-close"
            onClick={dismiss}
            aria-label="첫 계약 안내 닫기"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
          <div className="mb-3 flex items-center gap-3 pr-10">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <BookOpenText className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-400">
              계약 첫 시작
            </span>
          </div>
          <h2
            id={titleId}
            className="font-neo-heavy text-[24px] leading-tight text-neutral-950"
          >
            {content.title}
          </h2>
          <p id={descriptionId} className="pt-2 text-sm leading-6 text-neutral-600">
            {content.summary}
          </p>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-6">
          <section className="min-w-0 rounded-[16px] border border-neutral-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2 text-[12px] font-bold text-neutral-950">
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#f4f2ed] text-neutral-700">
                <ListChecks className="h-4 w-4" strokeWidth={1.9} />
              </span>
              첫 계약 진행 순서
            </div>
            <ol className="grid gap-3">
              {content.steps.map((step, index) => (
                <li
                  key={step.title}
                  className="grid grid-cols-[30px_minmax(0,1fr)] gap-3"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 text-[12px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-neutral-950">
                      {step.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-neutral-600">
                      {step.description}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <aside className="space-y-4">
            <section className="rounded-[16px] border border-blue-100 bg-blue-50/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-bold text-blue-950">
                <ShieldCheck className="h-4 w-4" strokeWidth={1.9} />
                신뢰 체크
              </div>
              <ul className="grid gap-2">
                {content.checks.map((item) => (
                  <li
                    key={item}
                    className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 text-[12px] leading-5 text-blue-950"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-blue-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <p className="rounded-[14px] border border-neutral-200 bg-[#fbfaf7] p-3 text-[12px] leading-5 text-neutral-600">
              이 안내는 처음 한 번만 표시됩니다. 이후에는 각 화면 제목 옆의 ? 버튼으로
              필요한 순간에 다시 확인할 수 있습니다.
            </p>
          </aside>
        </div>

        <div className="grid gap-2 border-t border-neutral-200/80 bg-[#fbfaf7] px-5 py-4 sm:flex sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-neutral-200 bg-white px-4 text-[13px] font-bold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {content.secondaryActionLabel}
          </button>
          <button
            type="button"
            onClick={startContract}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-[13px] font-bold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {content.primaryActionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function HelpPanel({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-neutral-200 bg-white p-3.5 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-bold text-neutral-950">
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#f4f2ed] text-neutral-700">
            {icon}
          </span>
        ) : null}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}
