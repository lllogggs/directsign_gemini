import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  FileText,
  Link2,
  MessageSquareText,
  PenLine,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "../../domain/brand";

type IntroRole = "advertiser" | "influencer";

type RoleCard = {
  role: IntroRole;
  title: string;
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  metrics: Array<{ label: string; value: string }>;
};

const roleCards: RoleCard[] = [
  {
    role: "advertiser",
    title: "광고주",
    label: "브랜드, 대행사, 마케팅팀",
    href: "/intro/advertiser",
    description:
      "캠페인 조건을 계약서로 정리하고 검토, 수정 협의, 서명 상태를 한 화면에서 관리합니다.",
    icon: Building2,
    tone: "bg-sky-50 text-sky-700 ring-sky-100",
    metrics: [
      { label: "검토 필요", value: "3" },
      { label: "서명 대기", value: "5" },
    ],
  },
  {
    role: "influencer",
    title: "인플루언서",
    label: "크리에이터, 매니저, MCN",
    href: "/intro/influencer",
    description:
      "받은 계약의 핵심 조건을 확인하고 수정 요청, 플랫폼 인증, 전자서명을 순서대로 처리합니다.",
    icon: UserRound,
    tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100",
    metrics: [
      { label: "검토 필요", value: "2" },
      { label: "제출 예정", value: "4" },
    ],
  },
];

const introConfig = {
  advertiser: {
    eyebrow: "광고주 워크스페이스",
    title: "광고 계약을 만들고 보낸 뒤, 끝까지 추적합니다",
    description:
      "가상의 광고주 대시보드 예시처럼 계약 초안, 검토 상태, 수정 요청, 서명 증빙을 하나의 운영 화면에서 확인합니다.",
    primaryLabel: "광고주 계정 만들기",
    primaryHref: "/signup/advertiser",
    secondaryLabel: "광고주 로그인",
    secondaryHref: "/login/advertiser",
    switchLabel: "인플루언서 소개 보기",
    switchHref: "/intro/influencer",
    previewTitle: "광고주 예시 대시보드",
    previewSubtitle: "계약 운영 현황",
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
        title: "계약 초안 생성",
        description:
          "광고 조건, 플랫폼, 기간, 금액을 정리해 검토 가능한 계약 초안으로 넘깁니다.",
      },
      {
        icon: MessageSquareText,
        title: "수정 협의 추적",
        description:
          "인플루언서의 수정 요청과 광고주의 답변 상태를 계약 단위로 모아 봅니다.",
      },
      {
        icon: FileSignature,
        title: "서명 증빙 보관",
        description:
          "최종본, 서명 시각, 동의 문구, PDF 다운로드 흐름을 운영 기준에 맞춰 남깁니다.",
      },
    ],
    proofPoints: ["사업자 인증 후 공유", "계약별 다음 행동", "서명 완료 후 증빙 확인"],
  },
  influencer: {
    eyebrow: "인플루언서 워크스페이스",
    title: "받은 계약을 이해하고, 필요한 행동만 빠르게 처리합니다",
    description:
      "가상의 인플루언서 대시보드 예시처럼 계약 검토, 수정 요청, 플랫폼 인증, 서명과 콘텐츠 제출 흐름을 한 곳에서 확인합니다.",
    primaryLabel: "인플루언서 계정 만들기",
    primaryHref: "/signup/influencer",
    secondaryLabel: "인플루언서 로그인",
    secondaryHref: "/login/influencer",
    switchLabel: "광고주 소개 보기",
    switchHref: "/intro/advertiser",
    previewTitle: "인플루언서 예시 대시보드",
    previewSubtitle: "계약 처리 현황",
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
          "금액, 기간, 제출물, 사용 권한처럼 놓치기 쉬운 조건을 계약 화면에서 바로 확인합니다.",
      },
      {
        icon: PenLine,
        title: "수정 요청",
        description:
          "동의하기 어려운 조항은 계약 안에서 요청하고 광고주 답변을 기다립니다.",
      },
      {
        icon: FileCheck2,
        title: "서명 후 제출 관리",
        description:
          "서명 완료 뒤 콘텐츠 링크와 증빙 파일 제출 상태까지 이어서 확인합니다.",
      },
    ],
    proofPoints: ["모바일 검토 흐름", "플랫폼 계정 인증", "완료 계약 보관"],
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
    <main className="min-h-screen bg-[#f5f6f8] font-sans text-neutral-950">
      <LandingHeader />

      <section className="border-b border-neutral-200/80 bg-[#f8f9fb]">
        <div className="mx-auto grid w-full max-w-[1240px] gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[minmax(0,0.84fr)_minmax(420px,1fr)] lg:items-center lg:px-8 lg:pb-12 lg:pt-12">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[12px] font-semibold text-neutral-600 shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-neutral-900" />
              계약과 서명을 한 곳에서
            </div>
            <h1 className="mt-5 text-[42px] font-semibold leading-[1.05] tracking-normal text-neutral-950 sm:text-[56px]">
              {PRODUCT_NAME}
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-7 text-neutral-600">
              {PRODUCT_DESCRIPTION}
            </p>

            <div className="mt-7 grid gap-3">
              {roleCards.map((role) => {
                const Icon = role.icon;

                return (
                  <Link
                    key={role.role}
                    to={role.href}
                    className="group flex min-w-0 flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-neutral-950 hover:shadow-[0_18px_42px_rgba(15,23,42,0.10)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex min-w-0 gap-4">
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ring-1 ${role.tone}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[18px] font-semibold text-neutral-950">
                          {role.title}
                        </span>
                        <span className="mt-1 block text-[12px] font-semibold text-neutral-400">
                          {role.label}
                        </span>
                        <span className="mt-2 block text-[14px] leading-6 text-neutral-600">
                          {role.description}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                      <span className="grid grid-cols-2 gap-2">
                        {role.metrics.map((metric) => (
                          <span
                            key={metric.label}
                            className="min-w-[72px] rounded-md border border-neutral-200 bg-[#fbfbfc] px-2.5 py-2 text-left"
                          >
                            <span className="block text-[11px] font-semibold text-neutral-400">
                              {metric.label}
                            </span>
                            <span className="mt-1 block text-[18px] font-semibold text-neutral-950">
                              {metric.value}
                            </span>
                          </span>
                        ))}
                      </span>
                      <ArrowRight className="h-5 w-5 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-950" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <UnifiedDashboardPreview />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-4 px-4 py-8 sm:px-6 md:grid-cols-3 lg:px-8">
          <TrustItem
            icon={BadgeCheck}
            title="역할별 흐름"
            description="광고주와 인플루언서가 서로 다른 화면에서 필요한 일만 처리합니다."
          />
          <TrustItem
            icon={Link2}
            title="계약 링크"
            description="검토, 수정, 서명 흐름을 계약별 링크와 상태로 이어갑니다."
          />
          <TrustItem
            icon={FileSignature}
            title="전자서명 증빙"
            description="서명 완료 뒤 확인해야 할 기록을 계약 단위로 보관합니다."
          />
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}

export function RoleIntroPage({ role }: { role: IntroRole }) {
  const config = introConfig[role];

  return (
    <main className="min-h-screen bg-[#f5f6f8] font-sans text-neutral-950">
      <LandingHeader />

      <section className="border-b border-neutral-200/80 bg-[#f8f9fb]">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.76fr)_minmax(500px,1fr)] lg:items-center lg:px-8 lg:py-12">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-neutral-500">
              {config.eyebrow}
            </p>
            <h1 className="mt-4 max-w-2xl text-[34px] font-semibold leading-[1.12] tracking-normal text-neutral-950 sm:text-[48px]">
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
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-600"
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
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="truncate text-[18px] font-semibold text-neutral-950">
            {PRODUCT_NAME}
          </span>
        </Link>

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

function UnifiedDashboardPreview() {
  return (
    <section
      aria-label="서비스 예시 대시보드"
      className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_70px_rgba(15,23,42,0.10)]"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-neutral-400">예시 화면</p>
          <h2 className="mt-1 truncate text-[17px] font-semibold text-neutral-950">
            계약 운영 보드
          </h2>
        </div>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          저장 완료
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="hidden border-r border-neutral-200 bg-[#fbfbfc] p-4 lg:block">
          <div className="space-y-2">
            {["계약", "수정 협의", "서명", "증빙"].map((item, index) => (
              <div
                key={item}
                className={`rounded-md px-3 py-2 text-[13px] font-semibold ${
                  index === 0
                    ? "bg-neutral-950 text-white"
                    : "text-neutral-500"
                }`}
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-neutral-400">
              오늘 처리
            </p>
            <p className="mt-2 text-[24px] font-semibold text-neutral-950">5</p>
          </div>
        </aside>

        <div className="min-w-0 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniMetric label="검토 필요" value="3" tone="text-amber-700" />
            <MiniMetric label="서명 대기" value="5" tone="text-neutral-950" />
            <MiniMetric label="수정 협의" value="2" tone="text-amber-700" />
            <MiniMetric label="완료" value="12" tone="text-neutral-950" />
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200">
            {[
              ["브랜드 캠페인 계약", "광고주", "수정 요청", "amber"],
              ["릴스 콘텐츠 협찬", "인플루언서", "서명 준비", "neutral"],
              ["유튜브 리뷰 패키지", "광고주", "검토 중", "sky"],
            ].map(([title, owner, status, tone]) => (
              <div
                key={title}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_92px] gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_120px_110px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-neutral-950">
                    {title}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-neutral-400">
                    다음 행동이 정리됨
                  </p>
                </div>
                <p className="hidden self-center text-[13px] font-semibold text-neutral-500 sm:block">
                  {owner}
                </p>
                <span
                  className={`self-center rounded-md border px-2 py-1 text-center text-[12px] font-semibold ${statusToneClass(
                    tone,
                  )}`}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
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
            <p className="text-[12px] font-semibold text-neutral-400">가상 화면</p>
            <h2 className="mt-1 truncate text-[18px] font-semibold text-neutral-950">
              {config.previewTitle}
            </h2>
          </div>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-[#fbfbfc] px-3 text-[12px] font-semibold text-neutral-600">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            샘플 데이터
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
                오늘 먼저 볼 일
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

function TrustItem({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <article className="flex min-w-0 gap-3 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-950 ring-1 ring-neutral-200">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-neutral-950">{title}</h2>
        <p className="mt-1 text-[13px] leading-6 text-neutral-600">
          {description}
        </p>
      </div>
    </article>
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

function statusToneClass(tone: string) {
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "sky") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-neutral-200 bg-white text-neutral-700";
}
