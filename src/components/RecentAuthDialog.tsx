import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrandLogo } from "./BrandLogo";
import {
  apiPath,
  registerRecentAuthHandler,
  type RecentAuthChallenge,
} from "../domain/api";

type PendingChallenge = {
  challenge: RecentAuthChallenge;
  resolve: (authenticated: boolean) => void;
};

const actionLabels: Record<string, string> = {
  advertiser_contract_send: "계약서 링크를 만들기 전에",
  advertiser_contract_close: "계약을 마감하기 전에",
  advertiser_share_reveal: "계약서 링크를 확인하기 전에",
  advertiser_share_rotate: "계약서 링크를 다시 만들기 전에",
  influencer_signature: "전자서명을 완료하기 전에",
  account_security_change: "계정 보안을 변경하기 전에",
};

export function RecentAuthDialog() {
  const [pending, setPending] = useState<PendingChallenge>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingRef = useRef<PendingChallenge>();
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unregister = registerRecentAuthHandler(
      (challenge) =>
        new Promise<boolean>((resolve) => {
          pendingRef.current?.resolve(false);
          const next = { challenge, resolve };
          pendingRef.current = next;
          setPending(next);
          setPassword("");
          setError("");
          setIsSubmitting(false);
        }),
    );
    return () => {
      unregister();
      pendingRef.current?.resolve(false);
      pendingRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const frame = window.requestAnimationFrame(() => passwordRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        pending.resolve(false);
        pendingRef.current = undefined;
        setPending(undefined);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, pending]);

  const cancel = () => {
    if (!pending || isSubmitting) return;
    pending.resolve(false);
    pendingRef.current = undefined;
    setPending(undefined);
    setPassword("");
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pending || isSubmitting || !password) return;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(apiPath("/api/auth/recent"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...pending.challenge, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "비밀번호를 확인하지 못했습니다.");
      }
      pending.resolve(true);
      pendingRef.current = undefined;
      setPending(undefined);
      setPassword("");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "비밀번호를 확인하지 못했습니다.",
      );
      passwordRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/45 px-4 py-8 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <section
        aria-labelledby="recent-auth-title"
        aria-modal="true"
        className="w-full max-w-[420px] rounded-[18px] border border-neutral-200 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.24)] sm:p-6"
        role="dialog"
      >
        <BrandLogo markClassName="h-8 w-8 rounded-[10px]" />
        <h2
          id="recent-auth-title"
          className="mt-7 text-[22px] font-extrabold tracking-[-0.035em] text-neutral-950"
        >
          비밀번호를 다시 확인해 주세요
        </h2>
        <p className="mt-2 text-[14px] font-medium leading-6 text-neutral-500">
          {actionLabels[pending.challenge.action] ?? "중요한 작업을 계속하기 전에"} 본인
          확인이 필요합니다. 현재 로그인은 그대로 유지됩니다.
        </p>

        <form className="mt-6" onSubmit={submit}>
          <label
            className="block text-[13px] font-extrabold text-neutral-800"
            htmlFor="recent-auth-password"
          >
            비밀번호
          </label>
          <input
            ref={passwordRef}
            id="recent-auth-password"
            autoComplete="current-password"
            className="mt-2 h-12 w-full rounded-[11px] border border-neutral-300 bg-white px-3.5 text-[15px] text-neutral-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            disabled={isSubmitting}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          {error ? (
            <p className="mt-2 text-[13px] font-semibold text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[11px] bg-blue-600 px-4 text-[14px] font-extrabold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || !password}
            type="submit"
          >
            {isSubmitting ? "확인 중" : "확인하고 계속"}
          </button>
          <button
            className="mt-2 h-10 w-full rounded-[10px] text-[13px] font-bold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50"
            disabled={isSubmitting}
            onClick={cancel}
            type="button"
          >
            취소
          </button>
        </form>
      </section>
    </div>
  );
}
