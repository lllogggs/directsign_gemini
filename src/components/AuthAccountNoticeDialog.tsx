/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useRef } from "react";
import { ArrowRight, UserRoundCheck, X } from "lucide-react";
import { getSafeRedirectPath } from "../domain/navigation";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

export type AuthAccountRole = "advertiser" | "influencer";
export type AuthAccountNoticeCode =
  | "AUTH_ROLE_MISMATCH"
  | "ACCOUNT_SETUP_INCOMPLETE";

export type AuthAccountNotice = {
  code: AuthAccountNoticeCode;
  actualRole: AuthAccountRole;
  actionPath: string;
};

type AuthFailurePayload = {
  code?: unknown;
  actual_role?: unknown;
  correct_login_path?: unknown;
  signup_path?: unknown;
};

const loginPaths: Record<AuthAccountRole, string> = {
  advertiser: "/login/advertiser",
  influencer: "/login/influencer",
};

const signupPaths: Record<AuthAccountRole, string> = {
  advertiser: "/signup/advertiser",
  influencer: "/signup/influencer",
};

const allowedNextPrefixes: Record<AuthAccountRole, readonly string[]> = {
  advertiser: ["/advertiser"],
  influencer: ["/influencer", "/contract", "/campaigns"],
};

function isAccountRole(value: unknown): value is AuthAccountRole {
  return value === "advertiser" || value === "influencer";
}

function isNoticeCode(value: unknown): value is AuthAccountNoticeCode {
  return value === "AUTH_ROLE_MISMATCH" || value === "ACCOUNT_SETUP_INCOMPLETE";
}

export function parseAuthAccountNotice(
  payload: unknown,
  requestedRole: AuthAccountRole,
): AuthAccountNotice | null {
  if (!payload || typeof payload !== "object") return null;

  const failure = payload as AuthFailurePayload;
  if (!isNoticeCode(failure.code)) return null;

  if (failure.code === "AUTH_ROLE_MISMATCH") {
    if (!isAccountRole(failure.actual_role)) return null;
    const actualRole = failure.actual_role;
    const expectedPath = loginPaths[actualRole];
    return {
      code: failure.code,
      actualRole,
      actionPath:
        failure.correct_login_path === expectedPath
          ? failure.correct_login_path
          : expectedPath,
    };
  }

  const expectedPath = signupPaths[requestedRole];
  return {
    code: failure.code,
    actualRole: requestedRole,
    actionPath:
      failure.signup_path === expectedPath ? failure.signup_path : expectedPath,
  };
}

export function appendSafeAuthNext(
  authPath: string,
  candidate: string | null | undefined,
  role: AuthAccountRole,
) {
  const safeNext = getSafeRedirectPath(
    candidate,
    "",
    allowedNextPrefixes[role],
  );
  return safeNext
    ? `${authPath}?next=${encodeURIComponent(safeNext)}`
    : authPath;
}

export function readAuthPrefillEmail(state: unknown) {
  if (!state || typeof state !== "object") return "";
  const value = (state as { prefillEmail?: unknown }).prefillEmail;
  return typeof value === "string" ? value : "";
}

export function readAuthNoticeState(
  state: unknown,
  requestedRole: AuthAccountRole,
) {
  if (!state || typeof state !== "object") return null;
  return parseAuthAccountNotice(
    (state as { authNotice?: unknown }).authNotice,
    requestedRole,
  );
}

export function clearConsumedAuthNavigationState() {
  if (typeof window === "undefined") return;
  const historyState = window.history.state;
  if (
    !historyState ||
    typeof historyState !== "object" ||
    !("usr" in historyState)
  ) {
    return;
  }

  window.history.replaceState(
    { ...historyState, usr: null },
    document.title,
  );
}

export function AuthAccountNoticeDialog({
  notice,
  onAction,
  onClose,
}: {
  notice: AuthAccountNotice | null;
  onAction: () => void;
  onClose: () => void;
}) {
  useBodyScrollLock(Boolean(notice));
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!notice) return undefined;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const getFocusableElements = (): HTMLElement[] =>
      dialog
        ? (Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ) as HTMLElement[]).filter(
            (element) => !element.hasAttribute("hidden"),
          )
        : [];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    const focusTimer = window.setTimeout(() => {
      getFocusableElements()[0]?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [notice, onClose]);

  if (!notice) return null;

  const isSetupIncomplete = notice.code === "ACCOUNT_SETUP_INCOMPLETE";
  const isAdvertiser = notice.actualRole === "advertiser";
  const title = isSetupIncomplete
    ? "가입을 마쳐주세요"
    : isAdvertiser
      ? "광고주 계정입니다"
      : "인플루언서 계정입니다";
  const description = isSetupIncomplete
    ? "계정은 확인됐지만 프로필 설정이 아직 끝나지 않았습니다. 가입 정보를 입력해 마무리해 주세요."
    : isAdvertiser
      ? "이 계정은 광고주로 가입되어 있습니다. 광고주 로그인에서 계속해 주세요."
      : "이 계정은 인플루언서로 가입되어 있습니다. 인플루언서 로그인에서 계속해 주세요.";
  const actionLabel = isSetupIncomplete
    ? "가입 계속하기"
    : isAdvertiser
      ? "광고주로 로그인"
      : "인플루언서로 로그인";
  const titleId = "auth-account-notice-title";
  const descriptionId = "auth-account-notice-description";

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-neutral-950/55 px-4 py-8 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-[420px] rounded-[20px] border border-white/80 bg-white p-6 shadow-[0_30px_90px_rgba(0,0,0,0.28)] sm:p-7"
      >
        <button
          type="button"
          aria-label="안내 닫기"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-blue-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)]">
          <UserRoundCheck className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <h2
          id={titleId}
          className="mt-5 pr-8 font-neo-heavy text-[25px] leading-tight tracking-normal text-neutral-950"
        >
          {title}
        </h2>
        <p
          id={descriptionId}
          className="mt-2 text-[14px] font-semibold leading-6 text-neutral-500"
        >
          {description}
        </p>
        <button
          type="button"
          autoFocus
          onClick={onAction}
          className="group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-blue-600 px-5 text-[15px] font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)] transition hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-blue-600"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </button>
      </section>
    </div>
  );
}
