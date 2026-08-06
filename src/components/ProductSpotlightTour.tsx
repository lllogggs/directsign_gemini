import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

export type ProductSpotlightTourRole = "advertiser" | "influencer";

export type ProductSpotlightTourStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  padding?: number;
};

type ProductSpotlightTourProps = {
  accountId?: string;
  role: ProductSpotlightTourRole;
  tourId: string;
  version: number | string;
  steps: readonly ProductSpotlightTourStep[];
  enabled?: boolean;
};

type SpotlightRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const PRODUCT_TOUR_STORAGE_PREFIX = "yeollock:product-tour";
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusTourControl(tooltip: HTMLElement | null) {
  if (!tooltip) return;
  const primary = tooltip.querySelector<HTMLElement>(
    "[data-product-tour-primary]:not([disabled])",
  );
  (primary ?? tooltip).focus();
}

function getProductTourStorageKey({
  accountId,
  role,
  tourId,
  version,
}: {
  accountId: string;
  role: ProductSpotlightTourRole;
  tourId: string;
  version: number | string;
}) {
  return [
    PRODUCT_TOUR_STORAGE_PREFIX,
    role,
    encodeURIComponent(accountId),
    tourId,
    `v${version}`,
  ].join(":");
}

function findVisibleTourTarget(target: string) {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-product-tour="${target}"]`,
    ),
  );

  return elements.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  });
}

function readTourSeen(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "seen";
  } catch {
    return false;
  }
}

function writeTourSeen(storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, "seen");
  } catch {
    // The tour is non-critical. Keep the product usable when storage is blocked.
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function ProductSpotlightTour({
  accountId,
  role,
  tourId,
  version,
  steps,
  enabled = true,
}: ProductSpotlightTourProps) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const tooltipRef = useRef<HTMLElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const targetWasReadyRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const storageKey = useMemo(
    () =>
      accountId
        ? getProductTourStorageKey({ accountId, role, tourId, version })
        : undefined,
    [accountId, role, tourId, version],
  );
  const currentStep = steps[stepIndex];

  useEffect(() => {
    const activationFrame = window.requestAnimationFrame(() => {
      if (!enabled || !storageKey || steps.length === 0) {
        setActive(false);
        setStepIndex(0);
        return;
      }

      setStepIndex(0);
      setActive(!readTourSeen(storageKey));
    });

    return () => window.cancelAnimationFrame(activationFrame);
  }, [enabled, steps.length, storageKey]);

  const finish = useCallback(() => {
    if (storageKey) writeTourSeen(storageKey);
    setActive(false);
    setTargetRect(null);
  }, [storageKey]);

  const measureTarget = useCallback(() => {
    if (!active || !currentStep) return;
    const target = findVisibleTourTarget(currentStep.target);
    targetRef.current = target ?? null;
    if (!target) {
      setTargetRect(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = currentStep.padding ?? 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const left = Math.max(8, rect.left - padding);
    const top = Math.max(8, rect.top - padding);
    const right = Math.min(viewportWidth - 8, rect.right + padding);
    const bottom = Math.min(viewportHeight - 8, rect.bottom + padding);

    setTargetRect({
      top,
      left,
      right,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    });
  }, [active, currentStep]);

  useLayoutEffect(() => {
    if (!active || !currentStep) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const target = findVisibleTourTarget(currentStep.target);
      if (target) {
        const rect = target.getBoundingClientRect();
        const outsideViewport =
          rect.bottom < 16 ||
          rect.top > window.innerHeight - 16 ||
          rect.right < 16 ||
          rect.left > window.innerWidth - 16;
        if (outsideViewport) {
          target.scrollIntoView({ block: "center", inline: "nearest" });
        }
      }
      measureTarget();
    });

    const resizeObserver = new ResizeObserver(measureTarget);
    const mutationObserver = new MutationObserver(measureTarget);
    const observeTarget = () => {
      const target = findVisibleTourTarget(currentStep.target);
      if (target) resizeObserver.observe(target);
    };
    observeTarget();
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [active, currentStep, measureTarget]);

  useLayoutEffect(() => {
    if (!active || !targetRect || !tooltipRef.current) return;
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const edge = 12;
    const gap = 16;
    const width = Math.min(360, viewportWidth - edge * 2);
    const tooltipHeight = Math.min(tooltip.height, viewportHeight - edge * 2);
    const left = clamp(
      targetRect.left + targetRect.width / 2 - width / 2,
      edge,
      viewportWidth - width - edge,
    );
    const roomBelow = viewportHeight - targetRect.bottom;
    const roomAbove = targetRect.top;
    const top =
      roomBelow >= tooltipHeight + gap || roomBelow >= roomAbove
        ? clamp(
            targetRect.bottom + gap,
            edge,
            viewportHeight - tooltipHeight - edge,
          )
        : clamp(
            targetRect.top - tooltipHeight - gap,
            edge,
            viewportHeight - tooltipHeight - edge,
          );

    setTooltipStyle({ top, left, width });
  }, [active, stepIndex, targetRect]);

  useEffect(() => {
    if (!active || !currentStep || !targetRect) return undefined;
    const target = targetRef.current;
    if (!target) return undefined;
    const previousDescription = target.getAttribute("aria-describedby");
    target.setAttribute(
      "aria-describedby",
      [previousDescription, descriptionId].filter(Boolean).join(" "),
    );

    return () => {
      if (previousDescription) {
        target.setAttribute("aria-describedby", previousDescription);
      } else {
        target.removeAttribute("aria-describedby");
      }
    };
  }, [active, currentStep, descriptionId, targetRect]);

  useEffect(() => {
    if (!active) return undefined;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusFrame = window.requestAnimationFrame(() => {
      focusTourControl(tooltipRef.current);
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
        return;
      }
      if (event.key !== "Tab" || !tooltipRef.current) return;
      const focusable: HTMLElement[] = [];
      tooltipRef.current
        .querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        .forEach((element) => {
          if (element.getClientRects().length > 0) focusable.push(element);
        });
      if (focusable.length === 0) {
        event.preventDefault();
        tooltipRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!tooltipRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [active, finish]);

  useEffect(() => {
    if (!active) {
      targetWasReadyRef.current = false;
      return undefined;
    }
    const targetBecameReady = Boolean(targetRect) && !targetWasReadyRef.current;
    targetWasReadyRef.current = Boolean(targetRect);
    const focusFrame = window.requestAnimationFrame(() => {
      const tooltip = tooltipRef.current;
      if (
        targetBecameReady ||
        !tooltip?.contains(document.activeElement) ||
        document.activeElement === tooltip
      ) {
        focusTourControl(tooltip);
      }
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [active, stepIndex, targetRect]);

  const trapTooltipFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
    }
  };

  if (
    !active ||
    !currentStep ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    <div data-product-tour-overlay={tourId}>
      <div
        className={`fixed inset-0 z-[1000] cursor-default ${
          targetRect ? "" : "bg-black/80"
        }`}
        aria-hidden="true"
      />
      {targetRect ? (
        <div
          className="pointer-events-none fixed z-[1001] rounded-[14px] ring-2 ring-white/95 transition-[top,left,width,height] duration-150 motion-reduce:transition-none"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            boxShadow:
              "0 0 0 3px rgba(255,255,255,0.92), 0 0 0 9999px rgba(0,0,0,0.78)",
          }}
        />
      ) : null}
      <section
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={trapTooltipFocus}
        className="fixed z-[1002] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-[16px] border border-white/15 bg-neutral-950 p-4 text-left text-white shadow-[0_24px_80px_rgba(0,0,0,0.46)] outline-none sm:p-5"
        style={
          targetRect && tooltipStyle.top !== undefined
            ? tooltipStyle
            : {
                left: "50%",
                top: "50%",
                width: "min(360px, calc(100vw - 24px))",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-extrabold tracking-[0.04em] text-white/60">
            {stepIndex + 1} / {steps.length}
          </p>
        </div>
        <h2 id={titleId} className="mt-2 text-[18px] font-extrabold leading-6">
          {currentStep.title}
        </h2>
        <p
          id={descriptionId}
          className="mt-2 break-keep text-[13px] font-semibold leading-6 text-white/75"
        >
          {currentStep.description}
        </p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="h-9 rounded-[9px] px-2 text-[12px] font-bold text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            건너뛰기
          </button>
          <div className="flex items-center gap-2">
            {!isFirst ? (
              <button
                type="button"
                onClick={() => setStepIndex((current) => current - 1)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-white/20 px-3 text-[12px] font-extrabold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
                이전
              </button>
            ) : null}
            <button
              type="button"
              data-product-tour-primary
              disabled={!targetRect}
              onClick={() => {
                if (isLast) {
                  finish();
                } else {
                  setStepIndex((current) => current + 1);
                }
              }}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-white px-3 text-[12px] font-extrabold text-neutral-950 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:bg-white/20 disabled:text-white/55"
            >
              {!targetRect ? (
                "준비 중"
              ) : isLast ? (
                <>
                  확인
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                </>
              ) : (
                <>
                  다음
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                </>
              )}
            </button>
          </div>
        </div>
        <span className="sr-only" aria-live="polite">
          {steps.length}단계 중 {stepIndex + 1}단계
        </span>
      </section>
    </div>,
    document.body,
  );
}
