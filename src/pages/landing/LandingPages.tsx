import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  FileText,
  MessageSquareText,
  PenLine,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "../../domain/brand";

type IntroRole = "advertiser" | "influencer";

type RoleCard = {
  role: IntroRole;
  title: string;
  href: string;
  icon: LucideIcon;
  className: string;
};

const roleCards: RoleCard[] = [
  {
    role: "advertiser",
    title: "광고주",
    href: "/intro/advertiser",
    icon: Building2,
    className:
      "border-sky-200 text-sky-950 hover:border-sky-500 hover:bg-sky-50",
  },
  {
    role: "influencer",
    title: "인플루언서",
    href: "/intro/influencer",
    icon: UserRound,
    className:
      "border-fuchsia-200 text-fuchsia-950 hover:border-fuchsia-500 hover:bg-fuchsia-50",
  },
];

const introConfig = {
  advertiser: {
    eyebrow: "광고주용 계약 운영",
    title: "캠페인 계약을 보내고, 수정 요청과 서명 증빙까지 봅니다",
    description:
      "브랜드와 대행사가 인플루언서 계약 초안을 만들고 공유한 뒤, 검토 의견, 수정 협의, 서명 완료 상태를 계약별로 관리합니다.",
    primaryLabel: "광고주로 시작하기",
    primaryHref: "/signup/advertiser",
    secondaryLabel: "기존 광고주 로그인",
    secondaryHref: "/login/advertiser",
    switchLabel: "인플루언서 소개 보기",
    switchHref: "/intro/influencer",
    previewTitle: "광고주 계약함",
    previewSubtitle: "오늘 처리할 계약",
    summary: [
      { label: "확인 필요", value: "3", tone: "text-amber-700" },
      { label: "48시간 내 마감", value: "2", tone: "text-rose-700" },
      { label: "활성 링크", value: "7", tone: "text-neutral-950" },
      { label: "계약 금액", value: "1,240만", tone: "text-neutral-950" },
    ],
    rows: [
      {
        title: "봄 신제품 릴스 캠페인",
        actor: "리나스튜디오",
        platform: "Instagram",
        amount: "320만",
        status: "수정 요청",
        statusClass: "border-amber-200 bg-amber-50 text-amber-800",
      },
      {
        title: "카페 팝업 방문 콘텐츠",
        actor: "오늘의취향",
        platform: "YouTube",
        amount: "450만",
        status: "서명 대기",
        statusClass: "border-indigo-200 bg-indigo-50 text-indigo-700",
      },
      {
        title: "운동 루틴 숏폼 패키지",
        actor: "핏데이",
        platform: "TikTok",
        amount: "280만",
        status: "검토 중",
        statusClass: "border-sky-200 bg-sky-50 text-sky-700",
      },
    ],
    features: [
      {
        icon: FileText,
        title: "조건을 계약서로 정리",
        description:
          "캠페인명, 채널, 금액, 일정, 검수 기준을 빠뜨리지 않고 검토 가능한 계약 초안으로 정리합니다.",
      },
      {
        icon: MessageSquareText,
        title: "수정 요청을 조항별로 기록",
        description:
          "인플루언서의 질문과 수정 요청, 광고주의 답변을 계약 이력에 남겨 승인 전 혼선을 줄입니다.",
      },
      {
        icon: FileSignature,
        title: "서명 증빙까지 확인",
        description:
          "최종본, 서명 시각, 동의 문구, PDF 다운로드 흐름을 계약별 증빙으로 확인합니다.",
      },
    ],
    proofPoints: ["사업자 인증 후 계약 발송", "수정 요청·승인 이력 보관", "서명 완료 PDF 확인"],
  },
  influencer: {
    eyebrow: "인플루언서용 계약 검토",
    title: "받은 계약을 확인하고, 수정 요청과 서명을 차례대로 처리합니다",
    description:
      "크리에이터와 매니저가 광고 조건을 모바일에서도 읽기 쉽게 확인하고, 불편한 조항은 수정 요청한 뒤 안전하게 서명합니다.",
    primaryLabel: "인플루언서로 시작하기",
    primaryHref: "/signup/influencer",
    secondaryLabel: "기존 인플루언서 로그인",
    secondaryHref: "/login/influencer",
    switchLabel: "광고주 소개 보기",
    switchHref: "/intro/advertiser",
    previewTitle: "인플루언서 계약함",
    previewSubtitle: "오늘 확인할 계약",
    summary: [
      { label: "검토 필요", value: "2", tone: "text-amber-700" },
      { label: "수정 협의", value: "1", tone: "text-amber-700" },
      { label: "서명 준비", value: "3", tone: "text-neutral-950" },
      { label: "확정 금액", value: "680만", tone: "text-neutral-950" },
    ],
    rows: [
      {
        title: "뷰티 브랜드 릴스 2건",
        actor: "누디브랜딩",
        platform: "Instagram",
        amount: "180만",
        status: "검토 필요",
        statusClass: "border-amber-200 bg-amber-50 text-amber-800",
      },
      {
        title: "여행 브이로그 협찬",
        actor: "로컬트립",
        platform: "YouTube",
        amount: "300만",
        status: "서명 준비",
        statusClass: "border-neutral-300 bg-white text-neutral-800",
      },
      {
        title: "운동 챌린지 콘텐츠",
        actor: "무브핏",
        platform: "TikTok",
        amount: "200만",
        status: "콘텐츠 제출",
        statusClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
      },
    ],
    features: [
      {
        icon: ClipboardCheck,
        title: "핵심 조건 확인",
        description:
          "금액, 업로드 일정, 제출물, 사용 권한처럼 놓치기 쉬운 조건을 계약 화면에서 먼저 확인합니다.",
      },
      {
        icon: PenLine,
        title: "불리한 조항 수정 요청",
        description:
          "동의하기 어려운 조항은 계약 안에서 바로 요청하고 광고주 답변을 같은 화면에서 기다립니다.",
      },
      {
        icon: FileCheck2,
        title: "서명과 제출 상태 확인",
        description:
          "서명 완료 뒤 콘텐츠 링크, 증빙 파일, 다음 제출 상태까지 이어서 확인합니다.",
      },
    ],
    proofPoints: ["모바일 계약 검토", "플랫폼 계정 인증", "완료 계약 보관"],
  },
} satisfies Record<
  IntroRole,
  {
    eyebrow: string;
    title: string;
    description: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
    switchLabel: string;
    switchHref: string;
    previewTitle: string;
    previewSubtitle: string;
    summary: Array<{ label: string; value: string; tone: string }>;
    rows: Array<{
      title: string;
      actor: string;
      platform: string;
      amount: string;
      status: string;
      statusClass: string;
    }>;
    features: Array<{ icon: LucideIcon; title: string; description: string }>;
    proofPoints: string[];
  }
>;

export function StartPage() {
  return (
    <main className="min-h-screen bg-[#f6f5f2] font-sans text-neutral-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[920px] flex-col px-4 py-5 sm:px-6">
        <header className="flex h-12 items-center justify-center sm:justify-start">
          <BrandLockup />
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <h1 className="sr-only">
            {PRODUCT_NAME}
          </h1>
          <p className="max-w-[680px] text-[20px] font-semibold leading-8 text-neutral-950 sm:text-[26px] sm:leading-9">
            {PRODUCT_DESCRIPTION}
          </p>

          <div className="mt-8 grid w-full max-w-[460px] gap-3 sm:grid-cols-2">
            {roleCards.map((role) => {
              const Icon = role.icon;

              return (
                <Link
                  key={role.role}
                  to={role.href}
                  aria-label={`${role.title} 화면으로 이동`}
                  className={`group inline-flex h-14 items-center justify-center gap-2 rounded-lg border bg-white px-5 text-[16px] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${role.className}`}
                >
                  <Icon className="h-4 w-4" />
                  {role.title}
                  <ArrowRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-current" />
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-[12px] font-medium text-neutral-400 sm:justify-end">
          <Link className="transition hover:text-neutral-950" to="/privacy">
            개인정보 처리방침
          </Link>
          <Link className="transition hover:text-neutral-950" to="/terms">
            이용약관
          </Link>
          <Link className="transition hover:text-neutral-950" to="/legal/e-sign-consent">
            전자서명 안내
          </Link>
        </footer>
      </div>
    </main>
  );
}

export function RoleIntroPage({ role }: { role: IntroRole }) {
  const config = introConfig[role];

  return (
    <main className="min-h-screen bg-[#f5f6f8] font-sans text-neutral-950">
      <LandingHeader />

      <section className="border-b border-neutral-200/80 bg-[#f6f5f2]">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.74fr)_minmax(500px,1fr)] lg:items-center lg:px-8 lg:py-14">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-neutral-500">
              {config.eyebrow}
            </p>
            <h1 className="mt-4 max-w-2xl text-[32px] font-semibold leading-[1.12] tracking-normal text-neutral-950 sm:text-[46px]">
              {config.title}
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-7 text-neutral-600">
              {config.description}
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Link
                to={config.primaryHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:bg-neutral-800"
              >
                {config.primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to={config.secondaryHref}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-neutral-200 bg-white px-5 text-[15px] font-semibold text-neutral-800 transition hover:border-neutral-400"
              >
                {config.secondaryLabel}
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {config.proofPoints.map((point) => (
                <span
                  key={point}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-600"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {point}
                </span>
              ))}
            </div>

            <Link
              to={config.switchHref}
              className="mt-6 inline-flex text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
            >
              {config.switchLabel}
            </Link>
          </div>

          <RoleDashboardPreview config={config} />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {config.features.map((feature) => {
              const Icon = feature.icon;

              return (
                <article
                  key={feature.title}
                  className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-neutral-950 ring-1 ring-neutral-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h2 className="mt-4 text-[17px] font-semibold text-neutral-950">
                    {feature.title}
                  </h2>
                  <p className="mt-2 text-[14px] leading-6 text-neutral-600">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}

function LandingHeader() {
  return (
    <header className="border-b border-neutral-200/80 bg-white">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandLockup />

        <nav
          aria-label="서비스 메뉴"
          className="flex items-center gap-1 text-[13px] font-semibold"
        >
          <Link
            to="/intro/advertiser"
            className="hidden h-10 items-center rounded-lg px-3 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex"
          >
            광고주
          </Link>
          <Link
            to="/intro/influencer"
            className="hidden h-10 items-center rounded-lg px-3 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 sm:inline-flex"
          >
            인플루언서
          </Link>
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-lg border border-neutral-200 bg-white px-3 text-neutral-800 transition hover:border-neutral-400"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  );
}

function BrandLockup() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <FileSignature className="h-4 w-4" />
      </span>
      <span className="truncate text-[18px] font-semibold text-neutral-950">
        {PRODUCT_NAME}
      </span>
    </Link>
  );
}

function RoleDashboardPreview({
  config,
}: {
  config: (typeof introConfig)[IntroRole];
}) {
  return (
    <section
      aria-label={config.previewTitle}
      className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_70px_rgba(15,23,42,0.10)]"
    >
      <div className="border-b border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-neutral-400">역할별 작업 화면</p>
            <h2 className="mt-1 truncate text-[18px] font-semibold text-neutral-950">
              {config.previewTitle}
            </h2>
          </div>
          <span className="inline-flex h-8 items-center rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 text-[12px] font-semibold text-neutral-600">
            계약 흐름
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-3 rounded-lg border border-neutral-200 bg-[#fcfcfd] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[12px] font-semibold text-neutral-400">
                {config.previewSubtitle}
              </p>
              <p className="mt-1 text-[20px] font-semibold text-neutral-950">
                바로 처리할 일
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[430px]">
              {config.summary.map((item) => (
                <div key={item.label}>
                  <MiniMetric
                    label={item.label}
                    value={item.value}
                    tone={item.tone}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-t-lg border border-b-0 border-neutral-200 bg-white p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 flex-1 items-center rounded-md border border-neutral-200 bg-[#fbfbfc] px-3 text-[12px] font-semibold text-neutral-400">
              계약명, 상대방, 플랫폼 검색
            </div>
            <span className="hidden h-9 items-center rounded-md bg-neutral-950 px-3 text-[12px] font-semibold text-white sm:inline-flex">
              전체
            </span>
            <span className="hidden h-9 items-center rounded-md border border-neutral-200 px-3 text-[12px] font-semibold text-neutral-500 sm:inline-flex">
              대기
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-b-lg border border-neutral-200 bg-white">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_130px_100px_100px_108px] border-b border-neutral-200 bg-[#fbfbfc] px-4 py-3 text-[11px] font-semibold text-neutral-400 lg:grid">
            <span>계약명</span>
            <span>상대방</span>
            <span>플랫폼</span>
            <span>금액</span>
            <span>상태</span>
          </div>
          {config.rows.map((row) => (
            <div
              key={row.title}
              className="grid min-w-0 gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(220px,1.4fr)_130px_100px_100px_108px] lg:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-neutral-950">
                  {row.title}
                </p>
                <p className="mt-1 truncate text-[12px] text-neutral-400">
                  다음 행동과 마감이 표시됩니다
                </p>
              </div>
              <PreviewText label="상대방" value={row.actor} />
              <PreviewText label="플랫폼" value={row.platform} />
              <PreviewText label="금액" value={row.amount} />
              <span
                className={`w-fit rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${row.statusClass}`}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-500" />
        <p className="truncate text-[11px] font-semibold text-neutral-500">
          {label}
        </p>
      </div>
      <p className={`mt-2 truncate text-[20px] font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function PreviewText({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold text-neutral-300 lg:hidden">
        {label}
      </p>
      <p className="truncate text-[13px] font-semibold text-neutral-600">
        {value}
      </p>
    </div>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-6 text-[12px] font-medium text-neutral-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>{PRODUCT_NAME}</p>
        <nav aria-label="법적 문서" className="flex flex-wrap gap-x-3 gap-y-2">
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
    </footer>
  );
}
