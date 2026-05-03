import { ArrowRight, Building2, ShieldCheck, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { getSafeRedirectPath } from "../../domain/navigation";
import { PRODUCT_NAME } from "../../domain/brand";

const roleOptions = [
  {
    title: "광고주",
    href: "/login/advertiser",
    fallback: "/advertiser/dashboard",
    allowedPrefixes: ["/advertiser"],
    icon: Building2,
  },
  {
    title: "인플루언서",
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
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fafafa_0%,#f3f4f6_100%)] px-5 py-8 font-sans text-neutral-950">
      <section className="w-full max-w-[460px] overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="h-1 bg-neutral-950" />
        <div className="p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[18px] font-semibold leading-5 tracking-[-0.01em] text-neutral-950">
              {PRODUCT_NAME}
            </p>
          </div>
        </div>

        <div className="mt-7">
          <h1 className="text-[26px] font-semibold leading-tight tracking-normal">
            로그인
          </h1>
        </div>

        <div className="mt-6 space-y-2">
          {roleOptions.map((option) => {
            const Icon = option.icon;
            const next = getSafeRedirectPath(
              requestedNext,
              option.fallback,
              option.allowedPrefixes,
            );
            const href = `${option.href}?next=${encodeURIComponent(next)}`;

            return (
              <Link
                key={option.href}
                to={href}
                className="group flex h-16 items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-[#fbfbfc] px-4 transition hover:-translate-y-0.5 hover:border-neutral-950 hover:bg-neutral-950 hover:text-white hover:shadow-[0_16px_34px_rgba(15,23,42,0.14)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-700 ring-1 ring-neutral-200 transition group-hover:bg-white/10 group-hover:text-white group-hover:ring-white/10">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate text-[16px] font-semibold">
                    {option.title}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-white" />
              </Link>
            );
          })}
        </div>
        </div>
      </section>
    </main>
  );
}
