import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { BrandLogo } from "./BrandLogo";
import { apiFetch } from "../domain/api";
import { setAnalyticsConsent } from "../domain/analytics";
import {
  ACCOUNT_ERASURE_EVENT,
  type AccountErasureRole,
} from "../domain/accountErasure";
import { advertiserSelectedBrandStorageKey } from "../domain/advertiserBrands";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

const ACCOUNT_ERASURE_CONFIRMATION = "탈퇴";
const ANALYTICS_CONSENT_STORAGE_KEY = "yeollock.analytics-consent.v1";
const ACCOUNT_LOCAL_STORAGE_KEYS = new Set([
  ANALYTICS_CONSENT_STORAGE_KEY,
  advertiserSelectedBrandStorageKey,
  "yeollock:advertiser-contract-first-experience:v1",
]);
const ACCOUNT_LOCAL_STORAGE_PREFIXES = ["yeollock:product-tour:"];

type AccountErasureEvent = CustomEvent<{ role: AccountErasureRole }>;

function clearDeletedAccountClientState() {
  setAnalyticsConsent("denied");

  try {
    window.sessionStorage.clear();
  } catch {
    // A hard navigation below still clears all in-memory account state.
  }

  try {
    const keys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index),
    ).filter((key): key is string => Boolean(key));

    for (const key of keys) {
      if (
        ACCOUNT_LOCAL_STORAGE_KEYS.has(key) ||
        ACCOUNT_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be blocked. Analytics was already disabled above.
  }
}

export function AccountErasureDialog() {
  const [role, setRole] = useState<AccountErasureRole>();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useBodyScrollLock(Boolean(role));

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const accountEvent = event as AccountErasureEvent;
      if (
        accountEvent.detail?.role !== "advertiser" &&
        accountEvent.detail?.role !== "influencer"
      ) {
        return;
      }

      previousFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setRole(accountEvent.detail.role);
      setConfirmation("");
      setError("");
      setIsSubmitting(false);
    };

    window.addEventListener(ACCOUNT_ERASURE_EVENT, handleOpen);
    return () => window.removeEventListener(ACCOUNT_ERASURE_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!role) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [role]);

  const close = useCallback(() => {
    if (isSubmitting) return;
    setRole(undefined);
    setConfirmation("");
    setError("");
    window.requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, [isSubmitting]);

  useEffect(() => {
    if (!role) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, role]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!role || confirmation !== ACCOUNT_ERASURE_CONFIRMATION || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    const requestInit: RequestInit = {
      method: "DELETE",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": window.crypto.randomUUID(),
      },
      body: JSON.stringify({
        role,
        confirmation: ACCOUNT_ERASURE_CONFIRMATION,
      }),
    };

    try {
      const response = await apiFetch("/api/account", requestInit);
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (response.status === 428) {
          throw new Error("본인 확인이 취소되었습니다.");
        }
        throw new Error(
          payload.error || payload.message || "계정을 탈퇴하지 못했습니다.",
        );
      }

      clearDeletedAccountClientState();
      window.location.replace(`/login/${role}`);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "계정을 탈퇴하지 못했습니다.",
      );
      inputRef.current?.focus();
      setIsSubmitting(false);
    }
  };

  if (!role) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-neutral-950/45 px-4 py-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[calc(100svh-48px)] w-full max-w-[420px] overflow-y-auto rounded-[18px] border border-neutral-200 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.24)] sm:p-6"
        role="dialog"
      >
        <BrandLogo markClassName="h-8 w-8 rounded-[10px]" />
        <h2
          className="mt-7 text-[22px] font-extrabold tracking-[-0.035em] text-neutral-950"
          id={titleId}
        >
          연락미 계정을 탈퇴할까요?
        </h2>
        <p
          className="mt-2 text-[14px] font-medium leading-6 text-neutral-600"
          id={descriptionId}
        >
          계정 이용과 서비스 내 공개 프로필 노출은 즉시 중단됩니다. 저장 파일은
          삭제 작업과 운영 확인을 거쳐 파기하고, 전자계약·서명 증빙은 정해진 기간
          동안 분리 보관한 뒤 파기됩니다.
        </p>

        <form className="mt-6" onSubmit={submit}>
          <label
            className="block text-[13px] font-extrabold text-neutral-800"
            htmlFor="account-erasure-confirmation"
          >
            확인을 위해 <span className="text-red-600">탈퇴</span>를 입력해 주세요
          </label>
          <input
            ref={inputRef}
            autoComplete="off"
            className="mt-2 h-12 w-full rounded-[11px] border border-neutral-300 bg-white px-3.5 text-[15px] text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-red-500 focus:ring-4 focus:ring-red-100"
            disabled={isSubmitting}
            id="account-erasure-confirmation"
            onChange={(event) => {
              setConfirmation(event.target.value);
              if (error) setError("");
            }}
            placeholder="탈퇴"
            spellCheck={false}
            value={confirmation}
          />
          {error ? (
            <p className="mt-2 text-[13px] font-semibold text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[11px] bg-red-600 px-4 text-[14px] font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={
              isSubmitting || confirmation !== ACCOUNT_ERASURE_CONFIRMATION
            }
            type="submit"
          >
            {isSubmitting ? "처리 중" : "계정 탈퇴"}
          </button>
          <button
            className="mt-2 h-10 w-full rounded-[10px] text-[13px] font-bold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={close}
            type="button"
          >
            취소
          </button>
        </form>
      </section>
    </div>
  );
}
