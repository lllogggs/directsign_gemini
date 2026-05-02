import React from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

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
  eyebrow?: string;
  title: string;
  description?: string;
  fields: AuthLoginField[];
  submitLabel: string;
  submittingLabel?: string;
  isSubmitting: boolean;
  error?: string;
  footer?: React.ReactNode;
  onSubmit: (event: React.FormEvent) => void;
}

export function AuthLoginScreen({
  title,
  description,
  fields,
  submitLabel,
  submittingLabel = "확인 중",
  isSubmitting,
  error,
  footer,
  onSubmit,
}: AuthLoginScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-5 py-8 font-sans text-neutral-950">
      <section className="w-full max-w-[420px] rounded-lg border border-neutral-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold leading-5 text-neutral-950">
                DirectSign
              </p>
            </div>
          </div>
          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[12px] font-semibold text-neutral-600">
            보안 접속
          </span>
        </div>

        <div className="mt-7">
          <h1 className="text-[26px] font-semibold leading-tight tracking-normal text-neutral-950">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-[14px] leading-6 text-neutral-500">
              {description}
            </p>
          ) : null}
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {fields.map((field) => (
            <label key={field.id} className="block">
              <span className="text-[13px] font-semibold text-neutral-800">
                {field.label}
              </span>
              <input
                className="mt-2 h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-[15px] font-medium text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 disabled:bg-neutral-100 disabled:text-neutral-400"
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                type={field.type}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                required={field.required}
                disabled={field.disabled || isSubmitting}
              />
            </label>
          ))}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold leading-5 text-rose-700">
              {error}
            </div>
          ) : null}

          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-[15px] font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
            disabled={isSubmitting}
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
      </section>
    </main>
  );
}
