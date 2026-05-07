import React from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
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
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fafafa_0%,#f3f4f6_100%)] px-5 py-8 font-sans text-neutral-950">
      <section className="w-full max-w-[420px] overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="h-1 bg-neutral-950" />
        <div className="p-6 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
                <ShieldCheck className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold leading-5 tracking-normal text-neutral-950">
                  {PRODUCT_NAME}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h1 className="text-[26px] font-semibold leading-tight tracking-normal text-neutral-950">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 text-[14px] leading-6 text-neutral-500">
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
                <span className="text-[13px] font-semibold text-neutral-800">
                  {field.label}
                </span>
                <input
                  className="mt-2 h-12 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] px-4 text-[15px] font-medium text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.06)] disabled:bg-neutral-100 disabled:text-neutral-400"
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
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold leading-5 text-rose-700 shadow-[inset_3px_0_0_rgba(225,29,72,0.35)]"
              >
                {error}
              </div>
            ) : null}

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:bg-neutral-800 hover:shadow-[0_14px_34px_rgba(15,23,42,0.20)] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
              disabled={isSubmitting || submitDisabled}
              type="submit"
            >
              {isSubmitting ? submittingLabel : submitLabel}
              {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>

          {footer ? (
            <div className="mt-5 border-t border-neutral-100 pt-4 text-center">
              {footer}
            </div>
          ) : null}

          <nav
            aria-label="법적 문서"
            className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-neutral-100 pt-4 text-[12px] font-medium text-neutral-400"
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
    </main>
  );
}
