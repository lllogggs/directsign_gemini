import React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { PRODUCT_NAME } from "../domain/brand";

export type GlobalCreatorAuthLocale = "en" | "ja" | "zh";

const supportedAuthLocales = new Set<GlobalCreatorAuthLocale>([
  "en",
  "ja",
  "zh",
]);

export type AuthLoginChromeCopy = {
  homeLabel: string;
  otherLoginLabel: string;
  legalNavLabel: string;
  privacyLabel: string;
  termsLabel: string;
  eSignLabel: string;
  supportLabel: string;
};

const defaultAuthLoginChromeCopy: AuthLoginChromeCopy = {
  homeLabel: `${PRODUCT_NAME} 홈`,
  otherLoginLabel: "다른 로그인",
  legalNavLabel: "법적 문서",
  privacyLabel: "개인정보 처리방침",
  termsLabel: "이용약관",
  eSignLabel: "전자서명 안내",
  supportLabel: "문의",
};

function readNestedGlobalCreatorLocale(
  params: URLSearchParams,
): GlobalCreatorAuthLocale | null {
  const nextPath = params.get("next");
  if (
    !nextPath?.startsWith("/") ||
    nextPath.startsWith("//") ||
    nextPath.includes("\\")
  ) {
    return null;
  }

  try {
    const nestedUrl = new URL(nextPath, "https://yeollock.local");
    const nestedLocale = nestedUrl.searchParams.get("locale");
    if (
      nestedUrl.origin === "https://yeollock.local" &&
      nestedUrl.searchParams.get("source") === "global-creators" &&
      nestedLocale &&
      supportedAuthLocales.has(nestedLocale as GlobalCreatorAuthLocale)
    ) {
      return nestedLocale as GlobalCreatorAuthLocale;
    }
  } catch {
    return null;
  }

  return null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getGlobalCreatorAuthLocale(
  currentSearch: string,
): GlobalCreatorAuthLocale | null {
  const params = new URLSearchParams(currentSearch);
  const locale = params.get("locale");

  if (
    params.get("source") === "global-creators" &&
    locale &&
    supportedAuthLocales.has(locale as GlobalCreatorAuthLocale)
  ) {
    return locale as GlobalCreatorAuthLocale;
  }

  return readNestedGlobalCreatorLocale(params);
}

// Shared by the auth entry screens so locale context survives role transitions.
// eslint-disable-next-line react-refresh/only-export-components
export function preserveAuthContext(href: string, currentSearch: string) {
  const currentParams = new URLSearchParams(currentSearch);
  const directLocale = currentParams.get("locale");
  const nestedGlobalLocale = readNestedGlobalCreatorLocale(currentParams);
  const locale =
    directLocale &&
    supportedAuthLocales.has(directLocale as GlobalCreatorAuthLocale)
      ? directLocale
      : nestedGlobalLocale;
  const hasGlobalSource =
    currentParams.get("source") === "global-creators" ||
    nestedGlobalLocale !== null;
  const nextPath = currentParams.get("next");
  const target = new URL(href, "https://yeollock.local");

  if (target.origin !== "https://yeollock.local") return href;
  if (locale) {
    target.searchParams.set("locale", locale);
  }
  if (hasGlobalSource) {
    target.searchParams.set("source", "global-creators");
    if (
      nextPath?.startsWith("/") &&
      !nextPath.startsWith("//") &&
      !nextPath.includes("\\") &&
      !target.searchParams.has("next")
    ) {
      target.searchParams.set("next", nextPath);
    }
  }

  return `${target.pathname}${target.search}${target.hash}`;
}

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
  lang?: string;
  homeHref?: string;
  chromeCopy?: Partial<AuthLoginChromeCopy>;
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
  postSubmit?: React.ReactNode;
  footer?: React.ReactNode;
  belowCard?: React.ReactNode;
  showOtherLoginLink?: boolean;
  showLegalFooter?: boolean;
  onSubmit: (event: React.FormEvent) => void;
}

export function AuthLoginScreen({
  title,
  lang,
  homeHref = "/",
  chromeCopy,
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
  postSubmit,
  footer,
  belowCard,
  showOtherLoginLink = true,
  showLegalFooter = true,
  onSubmit,
}: AuthLoginScreenProps) {
  const location = useLocation();
  const copy = { ...defaultAuthLoginChromeCopy, ...chromeCopy };
  const errorId = error ? `${title.replace(/\s+/g, "-")}-login-error` : undefined;
  const otherLoginHref = preserveAuthContext("/login", location.search);
  const contextualHomeHref = preserveAuthContext(homeHref, location.search);

  return (
    <main
      lang={lang}
      className="min-h-svh overflow-y-auto bg-[#f7f6f3] px-4 pb-2 pt-0 font-sans text-neutral-950 sm:h-svh sm:overflow-hidden sm:px-6 sm:pb-5 sm:pt-0"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between 2xl:px-6">
          <Link
            to={contextualHomeHref}
            aria-label={copy.homeLabel}
            className="yl-brand-action -ml-1 inline-flex min-h-10 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <BrandLogo />
          </Link>
          {showOtherLoginLink ? (
            <Link
              to={otherLoginHref}
              className="inline-flex min-h-10 items-center rounded-full border border-neutral-200 bg-white/65 px-3 text-[12px] font-bold text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950"
            >
              {copy.otherLoginLabel}
            </Link>
          ) : null}
        </header>

        <section className="grid min-h-0 flex-1 place-items-start overflow-visible py-2 pb-3 sm:place-items-center sm:overflow-hidden sm:py-2">
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
                    className="group flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-5 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,0.20)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_14px_32px_rgba(37,99,235,0.24)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:!bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none sm:h-11 sm:text-[15px]"
                    disabled={isSubmitting || submitDisabled}
                    type="submit"
                  >
                    {isSubmitting ? submittingLabel : submitLabel}
                    {!isSubmitting ? (
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    ) : null}
                  </button>
                  {postSubmit ? (
                    <div className="text-center">
                      {postSubmit}
                    </div>
                  ) : null}
                </form>

                {footer ? (
                  <div className="mt-3 border-t border-neutral-100 pt-3 text-center sm:mt-4">
                    {footer}
                  </div>
                ) : null}
              </div>
            </section>

            {belowCard ? <div className="mt-3">{belowCard}</div> : null}

            {showLegalFooter ? (
              <nav
                aria-label={copy.legalNavLabel}
                className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-1 text-[12px] font-semibold text-neutral-400 sm:mt-3 sm:gap-2"
              >
                <Link className="inline-flex min-h-7 items-center px-2 transition hover:text-neutral-950 sm:min-h-8" to={preserveAuthContext("/privacy", location.search)}>
                  {copy.privacyLabel}
                </Link>
                <Link className="inline-flex min-h-7 items-center px-2 transition hover:text-neutral-950 sm:min-h-8" to={preserveAuthContext("/terms", location.search)}>
                  {copy.termsLabel}
                </Link>
                <Link className="inline-flex min-h-7 items-center px-2 transition hover:text-neutral-950 sm:min-h-8" to={preserveAuthContext("/legal/e-sign-consent", location.search)}>
                  {copy.eSignLabel}
                </Link>
                <Link className="inline-flex min-h-7 items-center px-2 transition hover:text-neutral-950 sm:min-h-8" to={preserveAuthContext("/support", location.search)}>
                  {copy.supportLabel}
                </Link>
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

export function AuthLoginQuickActions({
  introHref,
  signupHref,
  introLabel = "둘러보기",
  signupLabel = "가입하기",
}: {
  introHref: string;
  signupHref: string;
  introLabel?: string;
  signupLabel?: string;
}) {
  const location = useLocation();
  const contextualIntroHref = preserveAuthContext(introHref, location.search);
  const contextualSignupHref = preserveAuthContext(signupHref, location.search);

  return (
    <div className="grid grid-cols-2 gap-2 text-center">
      <Link
        to={contextualIntroHref}
        className="inline-flex h-10 items-center justify-center rounded-[11px] border border-neutral-200 bg-white/80 px-3 text-[13px] font-black text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-950"
      >
        {introLabel}
      </Link>
      <Link
        to={contextualSignupHref}
        className="inline-flex h-10 items-center justify-center rounded-[11px] bg-neutral-950 px-3 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-950"
      >
        {signupLabel}
      </Link>
    </div>
  );
}

export function AuthPasswordResetLink({
  href,
  label = "비밀번호 재설정",
}: {
  href: string;
  label?: string;
}) {
  const location = useLocation();

  return (
    <Link
      to={preserveAuthContext(href, location.search)}
      className="inline-flex min-h-8 items-center px-1 text-[12px] font-bold text-neutral-500 transition hover:text-neutral-950 focus-visible:rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-950"
    >
      {label}
    </Link>
  );
}

