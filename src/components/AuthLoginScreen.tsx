import React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME } from "../domain/brand";

export interface AuthLoginField {
  id: string;
  label: string;
  value: string;
  type: "email" | "password" | "text";
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

interface AuthLoginScreenProps {
  title: string;
  description?: string;
  fields: AuthLoginField[];
  children?: React.ReactNode;
  submitLabel: string;
  submittingLabel?: string;
  submitDisabled?: boolean;
  isSubmitting: boolean;
  error?: string;
  footer?: React.ReactNode;
  onSubmit: (event: React.FormEvent) => void;
}

export function AuthLoginScreen({
  title,
  description,
  fields,
  children,
  submitLabel,
  submittingLabel = "확인 중",
  submitDisabled = false,
  isSubmitting,
  error,
  footer,
  onSubmit,
}: AuthLoginScreenProps) {
  const errorId = error ? `${title.replace(/\s+/g, "-")}-login-error` : undefined;

  return (
    <main className="min-h-screen bg-[#f7f6f3] px-5 py-5 font-sans text-neutral-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-[1040px] flex-col">
        <header className="flex h-14 items-center justify-between">
          <Link
            to="/"
            aria-label={`${PRODUCT_NAME} 홈`}
            className="inline-flex items-center gap-2.5"
          >
            <AuthLogoMark />
            <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em] text-neutral-950">
              {PRODUCT_NAME}
            </span>
          </Link>
          <Link
            to="/login"
            className="rounded-full border border-neutral-200 bg-white/65 px-3 py-1.5 text-[12px] font-bold text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950"
          >
            다른 로그인
          </Link>
        </header>

        <section className="grid flex-1 place-items-center py-8">
          <div className="w-full max-w-[460px]">
            <section className="rounded-[22px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(15,23,42,0.035),0_20px_58px_rgba(15,23,42,0.06)]">
              <div className="p-6 sm:p-7">
                <div>
                  <h1 className="font-neo-heavy text-[28px] leading-tight tracking-[-0.035em] text-neutral-950">
                    {title}
                  </h1>
                  {description ? (
                    <p className="mt-2 text-[14px] font-semibold leading-6 text-neutral-500">
                      {description}
                    </p>
                  ) : null}
                </div>

                <form
                  className="mt-6 space-y-4"
                  onSubmit={onSubmit}
                  aria-describedby={errorId}
                >
                  {fields.map((field) => (
                    <label key={field.id} className="block">
                      <span className="text-[13px] font-bold text-neutral-700">
                        {field.label}
                      </span>
                      <input
                        className="mt-2 h-12 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-4 text-[15px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)] disabled:bg-neutral-100 disabled:text-neutral-400"
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                        type={field.type}
                        autoComplete={field.autoComplete}
                        placeholder={field.placeholder}
                        required={field.required}
                        disabled={field.disabled || isSubmitting}
                        aria-invalid={Boolean(error) || undefined}
                        aria-describedby={errorId}
                      />
                    </label>
                  ))}

                  {children}

                  {error ? (
                    <div
                      id={errorId}
                      role="alert"
                      aria-live="assertive"
                      className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold leading-5 text-red-700"
                    >
                      {error}
                    </div>
                  ) : null}

                  <button
                    className="group flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-5 text-[15px] font-bold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_18px_42px_rgba(37,99,235,0.28)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
                    disabled={isSubmitting || submitDisabled}
                    type="submit"
                  >
                    {isSubmitting ? submittingLabel : submitLabel}
                    {!isSubmitting ? (
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    ) : null}
                  </button>
                </form>

                {footer ? (
                  <div className="mt-5 border-t border-neutral-100 pt-4 text-center">
                    {footer}
                  </div>
                ) : null}
              </div>
            </section>

            <nav
              aria-label="법적 문서"
              className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] font-semibold text-neutral-400"
            >
              <Link className="transition hover:text-neutral-950" to="/privacy">
                개인정보 처리방침
              </Link>
              <Link className="transition hover:text-neutral-950" to="/terms">
                이용약관
              </Link>
              <Link className="transition hover:text-neutral-950" to="/legal/e-sign-consent">
                전자서명 안내
              </Link>
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthLogoMark() {
  return (
    <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
      <svg
        aria-hidden="true"
        className="h-[23px] w-[23px]"
        fill="none"
        viewBox="0 0 32 32"
      >
        <circle cx="9.8" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="22.2" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="16" cy="22" r="3" fill="currentColor" opacity="0.96" />
        <path
          d="M12.1 12.8 16 19.1l3.9-6.3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.1"
        />
      </svg>
    </span>
  );
}
