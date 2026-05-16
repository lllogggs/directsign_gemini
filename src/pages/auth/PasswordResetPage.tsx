import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, MailCheck } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { translateApiErrorMessage } from "../../domain/userMessages";

type ResetRole = "advertiser" | "influencer";

const roleCopy = {
  advertiser: {
    label: "광고주",
    loginHref: "/login/advertiser",
    description: "계약 공유 링크와 서명 증빙을 관리하는 광고주 계정의 접근을 복구합니다.",
  },
  influencer: {
    label: "인플루언서",
    loginHref: "/login/influencer",
    description: "받은 계약 검토와 전자서명을 진행하는 인플루언서 계정의 접근을 복구합니다.",
  },
} satisfies Record<ResetRole, { label: string; loginHref: string; description: string }>;

function getRecoveryAccessToken() {
  if (typeof window === "undefined") return "";

  const hash = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);

  return hashParams.get("access_token") ?? queryParams.get("access_token") ?? "";
}

function getResetRole(search: string): ResetRole {
  const role = new URLSearchParams(search).get("role");
  return role === "influencer" ? "influencer" : "advertiser";
}

export function PasswordResetPage() {
  const location = useLocation();
  const role = getResetRole(location.search);
  const copy = roleCopy[role];
  const [accessToken] = useState(() => getRecoveryAccessToken());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const isCompleting = Boolean(accessToken);
  const title = isCompleting ? "새 비밀번호 설정" : "비밀번호 재설정";
  const helper = useMemo(
    () =>
      isCompleting
        ? "메일 링크가 확인되었습니다. 새 비밀번호를 설정하면 기존 비밀번호는 더 이상 사용할 수 없습니다."
        : copy.description,
    [copy.description, isCompleting],
  );

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await apiFetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "비밀번호 재설정 메일을 보내지 못했습니다.",
          ),
        );
      }

      setNotice(
        data.message ??
          "가입된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 받은 편지함과 스팸함을 확인해 주세요.",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? translateApiErrorMessage(
              requestError.message,
              "비밀번호 재설정 메일을 보내지 못했습니다.",
            )
          : "비밀번호 재설정 메일을 보내지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (password !== passwordConfirm) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiFetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token: accessToken, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "비밀번호를 변경하지 못했습니다.",
          ),
        );
      }

      window.history.replaceState(null, "", `/reset-password?role=${role}`);
      setPassword("");
      setPasswordConfirm("");
      setNotice(data.message ?? "비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.");
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? translateApiErrorMessage(
              completeError.message,
              "비밀번호를 변경하지 못했습니다.",
            )
          : "비밀번호를 변경하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f6f3] px-5 py-5 font-sans text-neutral-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-[1040px] flex-col">
        <header className="flex h-14 items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label={`${PRODUCT_NAME} 홈`}>
            <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
              <KeyRound className="h-4 w-4" />
            </span>
            <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em]">
              {PRODUCT_NAME}
            </span>
          </Link>
          <Link
            to={copy.loginHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/65 px-3 py-1.5 text-[12px] font-bold text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            로그인
          </Link>
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="w-full max-w-[460px] rounded-[22px] border border-neutral-200/90 bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,0.035),0_20px_58px_rgba(15,23,42,0.06)] sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-blue-600 text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)]">
              {isCompleting ? <KeyRound className="h-5 w-5" /> : <MailCheck className="h-5 w-5" />}
            </div>
            <p className="mt-5 text-[12px] font-bold text-neutral-500">
              {copy.label} 계정 접근
            </p>
            <h1 className="font-neo-heavy mt-2 text-[28px] leading-tight tracking-[-0.035em]">
              {title}
            </h1>
            <p className="mt-2 text-[14px] font-semibold leading-6 text-neutral-500">
              {helper}
            </p>

            <form
              className="mt-6 space-y-4"
              onSubmit={isCompleting ? completeReset : requestReset}
            >
              {isCompleting ? (
                <>
                  <PasswordField
                    label="새 비밀번호"
                    value={password}
                    placeholder="영문과 숫자를 포함해 8자 이상"
                    onChange={setPassword}
                  />
                  <PasswordField
                    label="새 비밀번호 확인"
                    value={passwordConfirm}
                    placeholder="새 비밀번호를 다시 입력"
                    onChange={setPasswordConfirm}
                  />
                </>
              ) : (
                <label className="block">
                  <span className="text-[13px] font-bold text-neutral-700">
                    가입 이메일
                  </span>
                  <input
                    value={email}
                    type="email"
                    autoComplete="email"
                    required
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 h-12 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-4 text-[15px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)]"
                    placeholder="name@example.com"
                  />
                </label>
              )}

              <div className="rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-4 py-3">
                <div className="flex gap-2 text-[12px] font-semibold leading-5 text-neutral-600">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <span>
                    재설정 링크는 메일 받은 사용자가 새 비밀번호를 설정하는 용도로만 사용됩니다.
                  </span>
                </div>
              </div>

              {error ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold leading-5 text-red-700"
                >
                  {error}
                </div>
              ) : null}

              {notice ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] font-semibold leading-5 text-blue-800"
                >
                  {notice}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-5 text-[15px] font-bold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_18px_42px_rgba(37,99,235,0.28)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
              >
                {isSubmitting
                  ? isCompleting
                    ? "변경 중"
                    : "메일 전송 중"
                  : isCompleting
                    ? "비밀번호 변경"
                    : "재설정 메일 받기"}
                {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function PasswordField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold text-neutral-700">{label}</span>
      <input
        value={value}
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-4 text-[15px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)]"
        placeholder={placeholder}
      />
    </label>
  );
}
