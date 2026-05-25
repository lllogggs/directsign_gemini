import React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME } from "../domain/brand";

export interface AuthLoginField {
  id: string;
  label: string;
  value: string;
  type: "email" | "password" | "text";
  autoComplete?: string;
  helper?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

interface AuthLoginScreenProps {
  title: string;
  description?: string;
  trustBadges?: string[];
  processSummary?: Array<{
    title: string;
    description: string;
  }>;
  fields: AuthLoginField[];
  children?: React.ReactNode;
  submitLabel: string;
  submittingLabel?: string;
  submitDisabled?: boolean;
  isSubmitting: boolean;
  error?: string;
  errorHint?: string;
  footer?: React.ReactNode;
  showOtherLoginLink?: boolean;
  showLegalFooter?: boolean;
  onSubmit: (event: React.FormEvent) => void;
}

export function AuthLoginScreen({
  title,
  description,
  trustBadges,
  processSummary,
  fields,
  children,
  submitLabel,
  submittingLabel = "확인 중",
  submitDisabled = false,
  isSubmitting,
  error,
  errorHint,
  footer,
  showOtherLoginLink = true,
  showLegalFooter = true,
  onSubmit,
}: AuthLoginScreenProps) {
  const errorId = error ? `${title.replace(/\s+/g, "-")}-login-error` : undefined;

  return (
    <main className="h-svh overflow-hidden bg-[#f7f6f3] px-4 pb-2 pt-0 font-sans text-neutral-950 sm:px-6 sm:pb-5 sm:pt-0">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between 2xl:px-6">
          <Link
            to="/"
            aria-label={`${PRODUCT_NAME} 홈`}
            className="yl-brand-action -ml-1 inline-flex min-h-10 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <AuthLogoMark />
            <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em] text-neutral-950">
              {PRODUCT_NAME}
            </span>
          </Link>
          {showOtherLoginLink ? (
            <Link
              to="/login"
              className="inline-flex min-h-10 items-center rounded-full border border-neutral-200 bg-white/65 px-3 text-[12px] font-bold text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950"
            >
              다른 로그인
            </Link>
          ) : null}
        </header>

        <section className="grid min-h-0 flex-1 place-items-center overflow-hidden py-2 pb-3 sm:py-6">
          <div className="flex max-h-none w-full max-w-[460px] flex-col sm:min-h-0 sm:max-h-full">
            <section className="custom-scrollbar overflow-visible rounded-[16px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(15,23,42,0.035),0_16px_44px_rgba(15,23,42,0.05)] sm:min-h-0 sm:max-h-full sm:overflow-y-auto sm:rounded-[18px]">
              <div className="p-4 sm:p-6">
                <div>
                  <h1 className="font-neo-heavy text-[25px] leading-tight tracking-normal text-neutral-950 sm:text-[28px]">
                    {title}
                  </h1>
                  {description ? (
                    <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-5 text-neutral-500 sm:mt-2 sm:line-clamp-none sm:text-[14px] sm:leading-6">
                      {description}
                    </p>
                  ) : null}
                  {trustBadges && trustBadges.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
                      {trustBadges.map((badge) => (
                        <li
                          key={badge}
                          className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[#d8e2d6] bg-[#f6f8f4] px-2.5 text-[10px] font-bold leading-4 text-[#3f4a40] sm:min-h-8 sm:px-3 sm:text-[11px]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#2563eb]" />
                          <span>{badge}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {processSummary && processSummary.length > 0 ? (
                    <ol className="mt-5 hidden divide-y divide-neutral-100 border-y border-neutral-100 sm:block">
                      {processSummary.map((step, index) => (
                        <li key={step.title} className="flex gap-3 py-3 text-left">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] bg-neutral-950 text-[10px] font-bold leading-none text-white">
                            {index + 1}
                          </span>
                          <span className="min-w-0">
                            <strong className="block text-[12px] font-bold text-neutral-900">
                              {step.title}
                            </strong>
                            <span className="mt-0.5 block text-[12px] font-semibold leading-5 text-neutral-500">
                              {step.description}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>

                <form
                  className="mt-4 space-y-3 sm:mt-5 sm:space-y-3.5"
                  onSubmit={onSubmit}
                  aria-describedby={errorId}
                >
                  {fields.map((field) => (
                    <label key={field.id} className="block">
                      <span className="text-[13px] font-bold text-neutral-700">
                        {field.label}
                      </span>
                      <input
                        className="mt-1.5 h-10 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-3.5 text-[14px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)] disabled:bg-neutral-100 disabled:text-neutral-400 sm:mt-2 sm:h-11 sm:px-4 sm:text-[15px]"
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
                      {field.helper ? (
                        <span className="mt-2 block">{field.helper}</span>
                      ) : null}
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
                      <p>{error}</p>
                      {errorHint ? (
                        <p className="mt-1 text-[12px] font-medium text-red-600">
                          {errorHint}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    className="group flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-5 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,0.20)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_14px_32px_rgba(37,99,235,0.24)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none sm:h-11 sm:text-[15px]"
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
                  <div className="mt-3 border-t border-neutral-100 pt-3 text-center sm:mt-4">
                    {footer}
                  </div>
                ) : null}
              </div>
            </section>

            {showLegalFooter ? (
              <nav
                aria-label="법적 문서"
                className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-1 text-[12px] font-semibold text-neutral-400 sm:mt-3 sm:gap-2"
              >
                <Link className="inline-flex min-h-7 items-center px-2 transition hover:text-neutral-950 sm:min-h-8" to="/privacy">
                  개인정보 처리방침
                </Link>
                <Link className="inline-flex min-h-7 items-center px-2 transition hover:text-neutral-950 sm:min-h-8" to="/terms">
                  이용약관
                </Link>
                <Link className="inline-flex min-h-7 items-center px-2 transition hover:text-neutral-950 sm:min-h-8" to="/legal/e-sign-consent">
                  전자서명 안내
                </Link>
              </nav>
            ) : null}
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
