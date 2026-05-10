import { ArrowRight, Building2, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { PRODUCT_NAME } from "../../domain/brand";
import { getSafeRedirectPath } from "../../domain/navigation";

const loginRoles = [
  {
    title: "광고주 로그인",
    detail: "작성 · 공유 · 관리",
    href: "/login/advertiser",
    fallback: "/advertiser/dashboard",
    allowedPrefixes: ["/advertiser"],
    icon: Building2,
  },
  {
    title: "인플루언서 로그인",
    detail: "검토 · 요청 · 서명",
    href: "/login/influencer",
    fallback: "/influencer/dashboard",
    allowedPrefixes: ["/influencer", "/contract"],
    icon: UserRound,
  },
];

export function LoginLanding() {
  const location = useLocation();
  const requestedNext = new URLSearchParams(location.search).get("next");

  return (
    <main className="min-h-screen bg-[#f7f6f3] font-sans text-neutral-950">
      <div className="mx-auto grid min-h-screen w-full max-w-[760px] grid-rows-[68px_1fr_48px] px-5 sm:px-6">
        <header className="flex items-center justify-between">
          <Link
            to="/"
            className="-ml-1 flex min-w-0 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            aria-label={`${PRODUCT_NAME} 홈`}
          >
            <BrandLogo />
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-8 items-center rounded-full border border-neutral-200 bg-white/65 px-3 text-[11px] font-bold tracking-[-0.005em] text-neutral-500 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            처음으로
          </Link>
        </header>

        <section className="flex items-center justify-center py-7 sm:py-9">
          <div className="w-full">
            <h1 className="sr-only">{PRODUCT_NAME} 로그인</h1>
            <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4">
              {loginRoles.map((role) => {
                const Icon = role.icon;
                const next = getSafeRedirectPath(
                  requestedNext,
                  role.fallback,
                  role.allowedPrefixes,
                );
                const href = `${role.href}?next=${encodeURIComponent(next)}`;

                return (
                  <Link
                    key={role.href}
                    to={href}
                    aria-label={role.title}
                    className="group flex min-h-[174px] flex-col rounded-[22px] border border-neutral-200/90 bg-white px-5 py-5 text-left shadow-[0_1px_0_rgba(15,23,42,0.035),0_16px_42px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_22px_58px_rgba(15,23,42,0.06)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950 sm:min-h-[210px] sm:px-6 sm:py-6"
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-neutral-200 bg-[#f6f5f2] text-neutral-800 transition group-hover:border-neutral-950 group-hover:bg-neutral-950 group-hover:text-white">
                        <Icon className="h-[17px] w-[17px]" />
                      </span>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-300 transition group-hover:border-neutral-950 group-hover:bg-neutral-950 group-hover:text-white">
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </span>
                    </span>

                    <span className="mt-auto block">
                      <strong className="font-neo-heavy block text-[25px] leading-none tracking-[-0.035em] text-neutral-950 sm:text-[30px]">
                        {role.title}
                      </strong>
                      <span className="mt-3.5 block border-t border-neutral-200 pt-3.5 text-[12px] font-bold tracking-[-0.005em] text-neutral-500 sm:mt-4 sm:pt-4">
                        {role.detail}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="flex items-center justify-center gap-5 text-[11px] font-semibold text-neutral-400">
          <Link className="transition hover:text-neutral-950" to="/privacy">
            개인정보
          </Link>
          <Link className="transition hover:text-neutral-950" to="/terms">
            이용약관
          </Link>
        </footer>
      </div>
    </main>
  );
}

function BrandLogo() {
  return (
    <span className="inline-flex items-center gap-2.5" aria-hidden="true">
      <LogoMark />
      <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em] text-neutral-950 sm:text-[19px]">
        {PRODUCT_NAME}
      </span>
    </span>
  );
}

function LogoMark() {
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
