import { ArrowRight, Building2, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { PRODUCT_NAME } from "../../domain/brand";
import { getSafeRedirectPath } from "../../domain/navigation";

const loginRoles = [
  {
    role: "advertiser",
    title: "광고주 로그인",
    detail: "계약 작성 · 검토 링크 · 증빙 관리",
    href: "/login/advertiser",
    fallback: "/advertiser/dashboard",
    allowedPrefixes: ["/advertiser"],
    icon: Building2,
  },
  {
    role: "influencer",
    title: "인플루언서 로그인",
    detail: "계약 검토 · 수정 요청 · 전자서명",
    href: "/login/influencer",
    fallback: "/influencer/dashboard",
    allowedPrefixes: ["/influencer", "/contract"],
    icon: UserRound,
  },
] as const;

function getRoleTone(role: (typeof loginRoles)[number]["role"]) {
  if (role === "advertiser") {
    return {
      card:
        "border-neutral-200 bg-white hover:border-blue-300 hover:bg-blue-50/35",
      icon: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]",
      arrow:
        "border-[#bfdbfe] bg-white text-[#2563eb] group-hover:border-[#2563eb] group-hover:bg-[#2563eb] group-hover:text-white",
      detail: "text-neutral-500",
    };
  }

  return {
    card:
      "border-neutral-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/35",
    icon: "border-[#a7f3d0] bg-[#ecfdf5] text-[#059669]",
    arrow:
      "border-[#a7f3d0] bg-white text-[#059669] group-hover:border-[#059669] group-hover:bg-[#059669] group-hover:text-white",
    detail: "text-neutral-500",
  };
}

export function LoginLanding() {
  const location = useLocation();
  const requestedNext = new URLSearchParams(location.search).get("next");

  return (
    <main className="h-svh overflow-hidden bg-[#f4f5f2] font-sans text-neutral-950">
      <div className="mx-auto grid h-svh w-full max-w-[1500px] grid-rows-[56px_minmax(0,1fr)_38px] px-4 sm:px-6 lg:px-6">
        <header className="flex items-center justify-between border-b border-transparent">
          <Link
            to="/"
            className="yl-brand-action -ml-1 flex min-w-0 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            aria-label={`${PRODUCT_NAME} 홈`}
          >
            <BrandLogo />
          </Link>
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-[8px] border border-neutral-200 bg-white px-3 text-[12px] font-extrabold text-neutral-600 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            처음으로
          </Link>
        </header>

        <section className="flex min-h-0 items-start justify-center pt-[10vh] sm:pt-[13vh] lg:pt-[14vh]">
          <div className="w-full max-w-[520px]">
            <h1 className="sr-only">{PRODUCT_NAME} 로그인</h1>
            <div className="grid gap-3">
              {loginRoles.map((role) => {
                const Icon = role.icon;
                const tone = getRoleTone(role.role);
                const next = requestedNext
                  ? getSafeRedirectPath(
                      requestedNext,
                      role.fallback,
                      role.allowedPrefixes,
                    )
                  : "";
                const href = next
                  ? `${role.href}?next=${encodeURIComponent(next)}`
                  : role.href;

                return (
                  <Link
                    key={role.href}
                    to={href}
                    aria-label={role.title}
                    className={`group flex h-[104px] items-center gap-4 rounded-[10px] border px-5 text-left shadow-[0_1px_0_rgba(15,23,42,0.03),0_10px_28px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.055)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950 sm:h-[104px] sm:px-5 ${tone.card}`}
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border ${tone.icon}`}>
                      <Icon className="h-5 w-5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[22px] font-extrabold leading-7 text-neutral-950 sm:text-[23px]">
                        {role.title}
                      </strong>
                      <span className={`mt-1.5 block truncate text-[13px] font-bold leading-5 ${tone.detail}`}>
                        {role.detail}
                      </span>
                    </span>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border transition ${tone.arrow}`}>
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 text-center">
              <Link
                to="/reset-password?role=advertiser"
                className="inline-flex min-h-8 items-center text-[12px] font-bold text-neutral-500 transition hover:text-neutral-950"
              >
                비밀번호 재설정
              </Link>
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
          <Link className="transition hover:text-neutral-950" to="/legal/e-sign-consent">
            전자서명
          </Link>
        </footer>
      </div>
    </main>
  );
}

