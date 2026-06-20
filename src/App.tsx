import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
  Link,
} from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { BrandLogo } from "./components/BrandLogo";
import { AdvertiserAuthGate } from "./pages/marketing/AdvertiserAuthGate";
import { RoleIntroPage, StartPage } from "./pages/landing/LandingPages";
import { Dashboard as AdvertiserDashboard } from "./pages/marketing/Dashboard";
import { InfluencerDashboard as InfluencerDashboardPage } from "./pages/influencer/InfluencerDashboard";
import { LegalDocumentPage } from "./pages/legal/LegalDocumentPage";
import { SeoResourcePage, SeoResourcesIndexPage } from "./pages/seo/SeoResourcePage";
import { getNextPath } from "./domain/navigation";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "./domain/brand";
import { LEGAL_CONTACT_EMAIL } from "./domain/legalEntity";
import { syncAnalyticsRoute } from "./domain/analytics";
import {
  getSeoResourceByPath,
  seoResourceIndexPath,
  seoResources,
  type SeoResourcePage as SeoResourceConfig,
} from "./domain/seoResources";

type RouteModuleLoader = () => Promise<unknown>;

const loadDashboard = () => Promise.resolve({ Dashboard: AdvertiserDashboard });
const loadContractBuilder = () => import("./pages/marketing/ContractBuilder");
const loadContractAdminViewer = () =>
  import("./pages/marketing/ContractAdminViewer");
const loadContractViewer = () => import("./pages/influencer/ContractViewer");
const loadLoginLanding = () => import("./pages/auth/LoginLanding");
const loadSignupPage = () => import("./pages/auth/SignupPage");
const loadPasswordResetPage = () => import("./pages/auth/PasswordResetPage");
const loadAdvertiserVerification = () =>
  import("./pages/marketing/AdvertiserVerification");
const loadInfluencerVerification = () =>
  import("./pages/influencer/InfluencerVerification");
const loadInfluencerDashboard = () =>
  Promise.resolve({ InfluencerDashboard: InfluencerDashboardPage });
const loadInfluencerLoginPage = () =>
  import("./pages/influencer/InfluencerLoginPage");
const loadSystemAdminDashboard = () =>
  import("./pages/admin/SystemAdminDashboard");
const loadLegalDocumentPage = () => Promise.resolve({ LegalDocumentPage });
const loadSupportPage = () => import("./pages/support/SupportPage");
const loadMarketplacePages = () => import("./pages/marketplace/MarketplacePages");
const loadMarketplaceInboxPage = () =>
  import("./pages/marketplace/MarketplaceInboxPage");
const loadCampaignPages = () => import("./pages/marketplace/CampaignPages");

const Dashboard = AdvertiserDashboard;
const ContractBuilder = lazy(() =>
  loadContractBuilder().then((module) => ({
    default: module.ContractBuilder,
  })),
);
const ContractAdminViewer = lazy(() =>
  loadContractAdminViewer().then((module) => ({
    default: module.ContractAdminViewer,
  })),
);
const ContractViewer = lazy(() =>
  loadContractViewer().then((module) => ({
    default: module.ContractViewer,
  })),
);
const LoginLanding = lazy(() =>
  loadLoginLanding().then((module) => ({
    default: module.LoginLanding,
  })),
);
function AdvertiserIntroPage() {
  return <RoleIntroPage role="advertiser" />;
}

function InfluencerIntroPage() {
  return <RoleIntroPage role="influencer" />;
}

function SignupLanding() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f7f4] px-4 py-4 font-sans text-neutral-950 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[34svh] border-t border-neutral-200/60 bg-[#eef0ec]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid min-h-[calc(100vh-32px)] w-full max-w-[1500px] grid-rows-[56px_auto]">
        <Link
          to="/"
          className="yl-brand-action -ml-1 flex h-10 w-fit min-w-0 items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          aria-label={`${PRODUCT_NAME} 홈`}
        >
          <BrandLogo />
        </Link>
        <section className="flex justify-center pt-[clamp(52px,8.5svh,88px)]">
          <div className="w-full max-w-[640px]">
            <p className="text-[12px] font-extrabold uppercase tracking-normal text-neutral-400">
              계정 만들기
            </p>
            <h1 className="mt-3 text-[32px] font-extrabold leading-tight text-neutral-950 sm:text-[36px]">
              역할을 선택하세요
            </h1>
            <div className="mt-7 grid gap-3.5">
              <Link
                to="/signup/advertiser"
                data-signup-role-action="advertiser"
                className="flex min-h-[112px] items-center justify-between gap-4 rounded-[10px] border border-blue-200 bg-white px-5 py-4 text-left text-blue-700 shadow-[0_1px_0_rgba(15,23,42,0.03),0_10px_28px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-blue-500 hover:bg-blue-50 hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.06)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950 sm:min-h-[124px] sm:px-6"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-[23px] font-extrabold leading-7 text-neutral-950 sm:text-[25px]">
                    광고주로 가입
                  </strong>
                  <span className="mt-2 block truncate text-[13px] font-extrabold text-blue-700 sm:text-[14px]">
                    계약 만들기
                  </span>
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-blue-200 bg-white text-blue-700 transition sm:h-11 sm:w-11">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
              <Link
                to="/signup/influencer"
                data-signup-role-action="influencer"
                className="flex min-h-[112px] items-center justify-between gap-4 rounded-[10px] border border-emerald-200 bg-white px-5 py-4 text-left text-emerald-700 shadow-[0_1px_0_rgba(15,23,42,0.03),0_10px_28px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.06)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950 sm:min-h-[124px] sm:px-6"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-[23px] font-extrabold leading-7 text-neutral-950 sm:text-[25px]">
                    인플루언서로 가입
                  </strong>
                  <span className="mt-2 block truncate text-[13px] font-extrabold text-emerald-700 sm:text-[14px]">
                    계약 확인하기
                  </span>
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-emerald-200 bg-white text-emerald-700 transition sm:h-11 sm:w-11">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </div>
            <Link
              to="/login"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-[10px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              이미 계정이 있어요
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

const SignupPage = lazy(() =>
  loadSignupPage().then((module) => ({
    default: module.SignupPage,
  })),
);
const PasswordResetPage = lazy(() =>
  loadPasswordResetPage().then((module) => ({
    default: module.PasswordResetPage,
  })),
);
const AdvertiserVerification = lazy(() =>
  loadAdvertiserVerification().then((module) => ({
    default: module.AdvertiserVerification,
  })),
);
const InfluencerVerification = lazy(() =>
  loadInfluencerVerification().then((module) => ({
    default: module.InfluencerVerification,
  })),
);
const InfluencerDashboard = InfluencerDashboardPage;
const InfluencerLoginPage = lazy(() =>
  loadInfluencerLoginPage().then((module) => ({
    default: module.InfluencerLoginPage,
  })),
);
const SystemAdminDashboard = lazy(() =>
  loadSystemAdminDashboard().then((module) => ({
    default: module.SystemAdminDashboard,
  })),
);
const SupportPage = lazy(() =>
  loadSupportPage().then((module) => ({
    default: module.SupportPage,
  })),
);
const AdvertiserInfluencerDiscoveryPage = lazy(() =>
  loadMarketplacePages().then((module) => ({
    default: module.AdvertiserInfluencerDiscoveryPage,
  })),
);
const InfluencerBrandDiscoveryPage = lazy(() =>
  loadMarketplacePages().then((module) => ({
    default: module.InfluencerBrandDiscoveryPage,
  })),
);
const PublicInfluencerProfilePage = lazy(() =>
  loadMarketplacePages().then((module) => ({
    default: module.PublicInfluencerProfilePage,
  })),
);
const PublicBrandProfilePage = lazy(() =>
  loadMarketplacePages().then((module) => ({
    default: module.PublicBrandProfilePage,
  })),
);
const AdvertiserMessagesPage = lazy(() =>
  loadMarketplaceInboxPage().then((module) => ({
    default: () => <module.MarketplaceInboxPage role="advertiser" />,
  })),
);
const InfluencerMessagesPage = lazy(() =>
  loadMarketplaceInboxPage().then((module) => ({
    default: () => <module.MarketplaceInboxPage role="influencer" />,
  })),
);
const AdvertiserCampaignCreationPage = lazy(() =>
  loadCampaignPages().then((module) => ({
    default: module.AdvertiserCampaignRecruitmentPage,
  })),
);
const InfluencerCampaignDiscoveryPage = lazy(() =>
  loadCampaignPages().then((module) => ({
    default: module.InfluencerCampaignDiscoveryPage,
  })),
);

type LoadingCopy = {
  label: string;
  detail?: string;
  listTitle?: string;
  tabs?: string[];
  variant?: "app" | "plain";
};

function getRouteLoadingCopy(pathname: string): LoadingCopy {
  if (pathname === "/intro/advertiser") {
    return {
      label: "계약 시작 화면을 준비하고 있습니다",
      detail: "사업자 인증, 검토 링크, 전자서명 안내를 불러오는 중입니다.",
    };
  }

  if (pathname === "/intro/influencer") {
    return {
      label: "계약 검토 화면을 준비하고 있습니다",
      detail: "조건 확인, 수정 요청, 전자서명 안내를 불러오는 중입니다.",
    };
  }

  if (pathname.startsWith("/influencer")) {
    return {
      label: "1:1 계약",
      listTitle: "1:1 계약 목록",
      tabs: ["지원중", "진행중", "완료", "미선정"],
      variant: "app",
    };
  }

  if (pathname.startsWith("/advertiser")) {
    return {
      label: "1:1 계약 운영",
      listTitle: "1:1 계약 목록",
      tabs: ["작성중", "진행중", "종료"],
      variant: "app",
    };
  }

  return { label: "화면을 불러오는 중입니다" };
}

function AppLoading({
  label = "계약 데이터를 불러오는 중입니다",
  detail,
  listTitle = "1:1 계약 목록",
  tabs = ["작성중", "진행중", "종료"],
  variant = "plain",
}: LoadingCopy) {
  if (variant !== "app") {
    return (
      <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950">
        <p className="sr-only">
          {label}
          {detail ? ` ${detail}` : ""}
        </p>
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
            <BrandLogo
              className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1"
              textClassName="font-neo-heavy text-[18px] leading-none"
            />
            <span className="h-9 w-20 rounded-[9px] bg-white shadow-[inset_0_0_0_1px_rgba(23,26,23,0.08)]" />
          </div>
        </header>
        <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-[1500px] items-center justify-center px-5">
          <div className="grid w-full max-w-[280px] gap-3">
            <span className="h-3 w-24 rounded-full bg-neutral-200" />
            <span className="h-3 w-full rounded-full bg-neutral-100" />
            <span className="h-3 w-4/5 rounded-full bg-neutral-100" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950 lg:h-screen lg:overflow-hidden">
      <p className="sr-only">
        {label}
        {detail ? ` ${detail}` : ""}
      </p>
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <BrandLogo
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1"
            textClassName="font-neo-heavy text-[18px] leading-none"
          />
          <span className="h-9 w-24 rounded-[9px] bg-white shadow-[inset_0_0_0_1px_rgba(23,26,23,0.08)]" />
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-3 py-2.5 sm:px-5 lg:flex lg:h-[calc(100vh-56px)] lg:flex-col lg:overflow-hidden lg:px-6">
        <section className="yl-panel min-h-0 flex-1 overflow-hidden border border-[#d9e0d9] bg-[#fdfdfb]">
          <div className="flex h-10 items-center border-b border-[#d9e0d9] bg-white px-4 text-[15px] font-bold text-neutral-950">
            {label}
          </div>
          <div
            className="grid gap-0 bg-[#ecebe5] px-2 pt-2 text-[13px] font-extrabold text-neutral-600"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((tab, index) => (
              <span
                key={tab}
                className={`flex h-10 items-center px-3 ${
                  index === 0 ? "rounded-t-[10px] bg-white text-neutral-950" : ""
                }`}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="space-y-3 px-3 py-4">
            <span className="block text-[13px] font-extrabold text-neutral-950">
              {listTitle}
            </span>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px]">
              <input
                type="search"
                aria-label="계약 검색"
                placeholder="계약명으로 검색"
                className="h-10 min-w-0 rounded-[9px] border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 outline-none"
              />
              <select
                aria-label="플랫폼 필터"
                className="h-10 rounded-[9px] border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 outline-none"
                defaultValue="all"
              >
                <option value="all">전체</option>
                <option value="instagram">인스타</option>
                <option value="youtube">유튜브</option>
              </select>
            </div>
            <div className="grid grid-cols-[80px_90px_110px_minmax(180px,1fr)_130px_110px_110px] gap-2 text-[12px] font-extrabold tracking-[-0.01em] text-neutral-700">
              <span>플랫폼</span>
              <span>종류</span>
              <span>브랜드</span>
              <span>계약명</span>
              <span>지급내용</span>
              <span>마감일</span>
              <span>현 단계</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold text-neutral-400">
              <span>검색</span>
              <span>필터</span>
              <span>서명</span>
              <span>제출</span>
              <span>검수</span>
              <span>증빙</span>
            </div>
            <span className="block h-9 w-full rounded-md bg-neutral-100" />
            <span className="block h-9 w-full rounded-md bg-neutral-100" />
            <span className="block h-9 w-5/6 rounded-md bg-neutral-100" />
          </div>
        </section>
      </main>
    </div>
  );
}

type RouteErrorBoundaryProps = {
  children: ReactNode;
  key?: string;
  recoveryHref: string;
  recoveryLabel: string;
};

class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  { hasError: boolean }
> {
  declare props: RouteErrorBoundaryProps;
  state = { hasError: false };

  constructor(props: RouteErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[${PRODUCT_NAME}] route render failed`, error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-5 py-10 font-sans text-neutral-950">
        <section className="w-full max-w-[440px] rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold text-neutral-500">{PRODUCT_NAME}</p>
          <h1 className="mt-3 text-[24px] font-semibold tracking-normal">
            화면을 다시 불러와야 합니다
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            일시적인 화면 오류가 발생했습니다. 새로고침하거나 로그인 화면으로 이동해 다시 시도해 주세요.
          </p>
          <div className="mt-6 grid gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              새로고침
            </button>
            <Link
              to={this.props.recoveryHref}
              className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
            >
              {this.props.recoveryLabel}
            </Link>
          </div>
        </section>
      </main>
    );
  }
}

const privateRoutePrefixes = [
  "/admin",
  "/advertiser",
  "/contract",
  "/influencer",
  "/marketing",
];

function isPrivateApplicationPath(pathname: string) {
  return privateRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
}

const utilityNoIndexPrefixes = ["/login", "/signup", "/reset-password"];
const readPublicEnv = (name: string) => {
  const value =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.[name] as string | undefined)
      : undefined;
  return value?.trim().replace(/\/$/, "") || undefined;
};

const publicSiteOrigin =
  readPublicEnv("VITE_PUBLIC_SITE_URL") ??
  readPublicEnv("VITE_SITE_URL") ??
  readPublicEnv("VITE_APP_URL") ??
  "https://yeollock.me";
const officialInstagramHandle =
  String(import.meta.env.VITE_INSTAGRAM_OFFICIAL_HANDLE ?? "yeollockme")
    .trim()
    .replace(/^@+/, "") || "yeollockme";
const publicSameAsUrls = [`https://www.instagram.com/${officialInstagramHandle}/`];
const seoDateModified = "2026-05-30";

type RouteSeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  ogImageUrl?: string;
  ogImageAlt?: string;
  structuredData?: unknown;
};

const publicRobotsContent =
  "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const privateRobotsContent = "noindex,nofollow";
const seoKeywordList = [
  "인플루언서 광고 계약",
  "광고주 인플루언서 찾기",
  "인플루언서 광고주 찾기",
  "브랜드 협찬 계약",
  "PPL 계약",
  "공동구매 계약",
  "광고 제안 관리",
  "크리에이터 전자계약",
  "검토 링크",
  "전자서명",
];
const advertiserIntentKeywords = [
  "인플루언서 찾기",
  "광고주 인플루언서 매칭",
  "인스타그램 협찬 제안",
  "유튜브 PPL 계약",
  "틱톡 광고 계약",
  "블로그 체험단 계약",
  "공동구매 수수료 계약",
];
const influencerIntentKeywords = [
  "인플루언서 광고주 찾기",
  "브랜드 협찬 제안",
  "광고 제안 검토",
  "협찬 계약서 확인",
  "PPL 조건 검토",
  "공동구매 계약 검토",
  "크리에이터 광고 계약",
];
const seoFeatureList = [
  "광고 조건 입력",
  "계약서 작성",
  "검토 링크 발송",
  "수정 협의",
  "전자서명",
  "서명 완료본 보관",
];
const defaultSeoDescription =
  "협찬, PPL, 공동구매 계약을 작성부터 검토 링크, 전자서명, 증빙 보관까지 관리합니다.";

const searchIntentSeoDescription =
  "광고주와 인플루언서가 협찬, PPL, 공동구매 계약을 작성부터 검토 링크, 전자서명, 증빙 보관까지 관리합니다.";

const normalizeSeoPath = (pathname: string) =>
  pathname.replace(/\/+$/, "") || "/";

const buildCanonicalUrl = (pathname: string) =>
  `${publicSiteOrigin}${pathname === "/" ? "/" : pathname}`;

const defaultOgImagePath = "/og/yeollock-og.png";
const defaultOgImageUrl = buildCanonicalUrl(defaultOgImagePath);
const defaultOgImageAlt = "연락미 인플루언서 광고 계약 관리 화면 미리보기";
const ogImageWidth = 1200;
const ogImageHeight = 630;

const buildStructuredData = ({
  title,
  description,
  canonicalPath,
  ogImageUrl = defaultOgImageUrl,
  ogImageAlt = defaultOgImageAlt,
  keywords = seoKeywordList,
  resource,
  resourceList,
}: Pick<
  RouteSeoConfig,
  "title" | "description" | "canonicalPath" | "ogImageUrl" | "ogImageAlt"
> & {
  keywords?: string[];
  resource?: SeoResourceConfig;
  resourceList?: SeoResourceConfig[];
}) => {
  const url = buildCanonicalUrl(canonicalPath);
  const keywordText = keywords.join(", ");
  const graph: unknown[] = [
    {
      "@type": "Organization",
      "@id": `${publicSiteOrigin}/#organization`,
      name: PRODUCT_NAME,
      alternateName: "yeollock.me",
      url: `${publicSiteOrigin}/`,
      logo: `${publicSiteOrigin}/favicon.svg`,
      image: ogImageUrl,
      email: LEGAL_CONTACT_EMAIL,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: LEGAL_CONTACT_EMAIL,
          availableLanguage: ["ko-KR"],
        },
      ],
      sameAs: publicSameAsUrls,
      knowsAbout: seoKeywordList,
    },
    {
      "@type": "WebSite",
      "@id": `${publicSiteOrigin}/#website`,
      name: PRODUCT_NAME,
      url: `${publicSiteOrigin}/`,
      description: searchIntentSeoDescription,
      image: ogImageUrl,
      inLanguage: "ko-KR",
      publisher: { "@id": `${publicSiteOrigin}/#organization` },
    },
    {
      "@type": "WebApplication",
      "@id": `${publicSiteOrigin}/#app`,
      name: PRODUCT_NAME,
      url: `${publicSiteOrigin}/`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "ko-KR",
      description: searchIntentSeoDescription,
      keywords: seoKeywordList.join(", "),
      featureList: seoFeatureList,
      image: ogImageUrl,
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "KRW",
        availability: "https://schema.org/InStock",
      },
      audience: [
        {
          "@type": "BusinessAudience",
          audienceType: "광고주, 브랜드, 광고대행사, 마케팅팀",
        },
        {
          "@type": "Audience",
          audienceType: "인플루언서, 크리에이터, 스트리머, MCN",
        },
      ],
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: title,
      description,
      keywords: keywordText,
      inLanguage: "ko-KR",
      dateModified: seoDateModified,
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: ogImageUrl,
        width: ogImageWidth,
        height: ogImageHeight,
        caption: ogImageAlt,
      },
      isPartOf: { "@id": `${publicSiteOrigin}/#website` },
      about: { "@id": `${publicSiteOrigin}/#app` },
    },
  ];

  if (resource) {
    graph.push({
      "@type": "Article",
      "@id": `${url}#article`,
      headline: title,
      description,
      mainEntityOfPage: { "@id": `${url}#webpage` },
      author: { "@id": `${publicSiteOrigin}/#organization` },
      publisher: { "@id": `${publicSiteOrigin}/#organization` },
      image: ogImageUrl,
      dateModified: seoDateModified,
      inLanguage: "ko-KR",
      keywords: keywordText,
      articleSection: resource.sections.map((section) => section.heading),
    });
  }

  if (resourceList) {
    graph.push({
      "@type": "ItemList",
      "@id": `${url}#resources`,
      name: "광고 계약 가이드",
      itemListElement: resourceList.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.title,
        url: buildCanonicalUrl(item.path),
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
};

const getRouteSeoConfig = (pathname: string): RouteSeoConfig => {
  const normalizedPath = normalizeSeoPath(pathname);
  const isPrivateRoute = privateRoutePrefixes.some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
  const isUtilityRoute = utilityNoIndexPrefixes.some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );

  const noIndexConfig = {
    title: `${PRODUCT_NAME} - 보안 접속`,
    description: PRODUCT_DESCRIPTION,
    canonicalPath: normalizedPath,
    robots: privateRobotsContent,
  };

  if (isPrivateRoute || isUtilityRoute) return noIndexConfig;

  const knownPages: Record<string, Omit<RouteSeoConfig, "structuredData">> = {
    "/": {
      title: `${PRODUCT_NAME} - 인플루언서 광고 계약 관리`,
      description: defaultSeoDescription,
      canonicalPath: "/",
      robots: publicRobotsContent,
    },
    "/intro/advertiser": {
      title: `광고주 광고 계약 관리 - ${PRODUCT_NAME}`,
      description:
        "광고 조건 입력, 계약서 작성, 검토 링크 발송, 전자서명, 콘텐츠 제출 확인까지 광고주 계약 운영을 한 흐름으로 정리합니다.",
      canonicalPath: "/intro/advertiser",
      robots: publicRobotsContent,
    },
    "/intro/influencer": {
      title: `인플루언서 광고 계약 검토 - ${PRODUCT_NAME}`,
      description:
        "광고주가 보낸 1:1 계약 조건을 인플루언서가 확인하고 수정 요청과 전자서명을 간단하게 진행할 수 있습니다.",
      canonicalPath: "/intro/influencer",
      robots: publicRobotsContent,
    },
    "/privacy": {
      title: `개인정보 처리방침 - ${PRODUCT_NAME}`,
      description:
        "연락미의 회원가입, 계정 인증, 계약 작성, 전자서명 증빙 보관에 필요한 개인정보 처리 기준입니다.",
      canonicalPath: "/privacy",
      robots: publicRobotsContent,
    },
    "/terms": {
      title: `이용약관 - ${PRODUCT_NAME}`,
      description:
        "연락미 광고 계약 워크스페이스 이용 조건, 책임 범위, 데이터 보관 기준을 안내합니다.",
      canonicalPath: "/terms",
      robots: publicRobotsContent,
    },
    "/legal/e-sign-consent": {
      title: `전자서명 안내 및 동의 - ${PRODUCT_NAME}`,
      description:
        "연락미에서 전자서명을 진행할 때 고정되는 최종본, 서명 의사표시, 감사 증빙 보관 기준입니다.",
      canonicalPath: "/legal/e-sign-consent",
      robots: publicRobotsContent,
    },
    "/support": {
      title: `고객지원 - ${PRODUCT_NAME}`,
      description:
        "연락미 장애, 계정, 계약 흐름, 개인정보 문의를 접수하는 고객지원 채널입니다.",
      canonicalPath: "/support",
      robots: publicRobotsContent,
    },
    [seoResourceIndexPath]: {
      title: `광고 계약 가이드 - ${PRODUCT_NAME}`,
      description:
        "협찬, PPL, 공동구매 계약 전 조건과 서명 증빙을 확인하는 공개 자료입니다.",
      canonicalPath: seoResourceIndexPath,
      robots: publicRobotsContent,
    },
  };

  const knownPage = knownPages[normalizedPath];
  if (knownPage) {
    return {
      ...knownPage,
      structuredData: buildStructuredData(knownPage),
    };
  }

  const resourcePage = getSeoResourceByPath(normalizedPath);
  if (resourcePage) {
    const config = {
      title: `${resourcePage.title} - ${PRODUCT_NAME}`,
      description: resourcePage.description,
      canonicalPath: resourcePage.path,
      robots: publicRobotsContent,
    };
    return {
      ...config,
      structuredData: buildStructuredData({
        ...config,
        keywords: resourcePage.keywords,
        resource: resourcePage,
      }),
    };
  }

  if (normalizedPath.startsWith("/brands/")) {
    const brandHandle = decodeURIComponent(
      normalizedPath.split("/").filter(Boolean).at(1) ?? "브랜드",
    );
    const config = {
      title: `${brandHandle} 브랜드 프로필 - ${PRODUCT_NAME}`,
      description:
        "광고주 공개 프로필에서 브랜드 정보와 광고 제안 전 확인할 내용을 살펴봅니다.",
      canonicalPath: normalizedPath,
      robots: publicRobotsContent,
    };
    return { ...config, structuredData: buildStructuredData(config) };
  }

  if (normalizedPath.split("/").filter(Boolean).length === 1) {
    const profileHandle = decodeURIComponent(normalizedPath.slice(1));
    const config = {
      title: `${profileHandle} 인플루언서 프로필 - ${PRODUCT_NAME}`,
      description:
        "인플루언서 공개 프로필에서 플랫폼, 활동 분야, 광고 계약 전 확인할 정보를 살펴봅니다.",
      canonicalPath: normalizedPath,
      robots: publicRobotsContent,
    };
    return { ...config, structuredData: buildStructuredData(config) };
  }

  return {
    title: `${PRODUCT_NAME} - 페이지를 찾을 수 없습니다`,
    description: PRODUCT_DESCRIPTION,
    canonicalPath: normalizedPath,
    robots: privateRobotsContent,
  };
};

type IntentAwareSeoCopy = Omit<RouteSeoConfig, "structuredData"> & {
  keywords?: string[];
  resource?: SeoResourceConfig;
  resourceList?: SeoResourceConfig[];
};

const buildPublicSeoConfig = (config: IntentAwareSeoCopy): RouteSeoConfig => ({
  ...config,
  ogImageUrl: config.ogImageUrl ?? defaultOgImageUrl,
  ogImageAlt: config.ogImageAlt ?? defaultOgImageAlt,
  structuredData: buildStructuredData({
    ...config,
    ogImageUrl: config.ogImageUrl ?? defaultOgImageUrl,
    ogImageAlt: config.ogImageAlt ?? defaultOgImageAlt,
  }),
});

const publicSearchIntentPages: Record<string, IntentAwareSeoCopy> = {
  "/": {
    title: `${PRODUCT_NAME} | 인플루언서 광고 계약·전자서명 관리`,
    description: searchIntentSeoDescription,
    canonicalPath: "/",
    robots: publicRobotsContent,
    keywords: seoKeywordList,
  },
  "/intro/advertiser": {
    title: `광고주 인플루언서 계약 관리 | ${PRODUCT_NAME}`,
    description:
      "브랜드 협찬, PPL, 공동구매 제안을 계약서 작성, 검토 링크, 전자서명, 증빙 보관까지 관리합니다.",
    canonicalPath: "/intro/advertiser",
    robots: publicRobotsContent,
    keywords: advertiserIntentKeywords,
  },
  "/intro/influencer": {
    title: `인플루언서 광고 계약 검토·전자서명 | ${PRODUCT_NAME}`,
    description:
      "받은 협찬, PPL, 공동구매 계약을 확인하고 수정 요청, 전자서명, 제출 상태를 관리합니다.",
    canonicalPath: "/intro/influencer",
    robots: publicRobotsContent,
    keywords: influencerIntentKeywords,
  },
  "/privacy": {
    title: `개인정보 처리방침 - ${PRODUCT_NAME}`,
    description:
      "계정 인증, 광고 계약, 검토 링크, 전자서명 증빙에 필요한 개인정보 처리 기준입니다.",
    canonicalPath: "/privacy",
    robots: publicRobotsContent,
    keywords: ["광고 계약 개인정보", "전자서명 개인정보", "계약 서비스 개인정보"],
  },
  "/terms": {
    title: `이용약관 - ${PRODUCT_NAME}`,
    description:
      "광고주와 인플루언서가 연락미 계약 서비스를 이용할 때 적용되는 조건입니다.",
    canonicalPath: "/terms",
    robots: publicRobotsContent,
    keywords: ["광고 계약 서비스 약관", "인플루언서 계약 약관", "전자계약 약관"],
  },
  "/legal/e-sign-consent": {
    title: `전자서명 안내 및 동의 - ${PRODUCT_NAME}`,
    description:
      "광고 계약 전자서명의 최종본 확정, 서명 의사표시, 감사 증빙 보관 기준입니다.",
    canonicalPath: "/legal/e-sign-consent",
    robots: publicRobotsContent,
    keywords: ["광고 계약 전자서명", "인플루언서 계약 서명", "전자서명 증빙"],
  },
  "/support": {
    title: `고객지원 - ${PRODUCT_NAME}`,
    description:
      "연락미 장애, 계정, 계약 흐름, 개인정보 문의를 접수합니다.",
    canonicalPath: "/support",
    robots: publicRobotsContent,
    keywords: ["연락미 문의", "광고 계약 오류 문의", "전자계약 고객지원"],
  },
  [seoResourceIndexPath]: {
    title: `광고 계약 가이드 - ${PRODUCT_NAME}`,
    description:
      "협찬, PPL, 공동구매 계약 전 조건과 서명 증빙을 확인하는 공개 자료입니다.",
    canonicalPath: seoResourceIndexPath,
    robots: publicRobotsContent,
    keywords: ["광고 계약 가이드", "인플루언서 계약서", "PPL 계약 체크리스트"],
  },
};

const isNoIndexRoute = (normalizedPath: string) =>
  [...privateRoutePrefixes, ...utilityNoIndexPrefixes].some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );

const getIntentAwareRouteSeoConfig = (pathname: string): RouteSeoConfig => {
  const baseConfig = getRouteSeoConfig(pathname);
  const normalizedPath = normalizeSeoPath(pathname);

  if (isNoIndexRoute(normalizedPath)) {
    return {
      ...baseConfig,
      title: `${PRODUCT_NAME} - 보안 접속`,
      description: "로그인과 권한 확인이 필요한 비공개 업무 화면입니다.",
      structuredData: undefined,
    };
  }

  const publicPage = publicSearchIntentPages[normalizedPath];
  if (publicPage) {
    return buildPublicSeoConfig({
      ...publicPage,
      resourceList:
        normalizedPath === seoResourceIndexPath ? seoResources : undefined,
    });
  }

  const resourcePage = getSeoResourceByPath(normalizedPath);
  if (resourcePage) {
    return buildPublicSeoConfig({
      title: `${resourcePage.title} - ${PRODUCT_NAME}`,
      description: resourcePage.description,
      canonicalPath: resourcePage.path,
      robots: publicRobotsContent,
      keywords: resourcePage.keywords,
      resource: resourcePage,
    });
  }

  if (normalizedPath.startsWith("/brands/")) {
    const brandHandle = decodeURIComponent(
      normalizedPath.split("/").filter(Boolean).at(1) ?? "브랜드",
    );

    return buildPublicSeoConfig({
      title: `${brandHandle} 광고주 프로필 - ${PRODUCT_NAME}`,
      description: `인플루언서가 ${brandHandle}의 광고 제안, 브랜드 협찬, PPL, 공동구매 캠페인 조건을 확인할 수 있는 광고주 프로필입니다.`,
      canonicalPath: normalizedPath,
      robots: publicRobotsContent,
      keywords: advertiserIntentKeywords,
    });
  }

  if (normalizedPath.split("/").filter(Boolean).length === 1) {
    const profileHandle = decodeURIComponent(normalizedPath.slice(1));

    return buildPublicSeoConfig({
      title: `${profileHandle} 인플루언서 프로필 - ${PRODUCT_NAME}`,
      description: `광고주가 ${profileHandle}의 채널, 플랫폼, 협찬, PPL, 공동구매 제안 가능성을 확인할 수 있는 인플루언서 프로필입니다.`,
      canonicalPath: normalizedPath,
      robots: publicRobotsContent,
      keywords: influencerIntentKeywords,
    });
  }

  return baseConfig;
};

const upsertMetaByName = (name: string, content: string) => {
  let tag = window.document.querySelector<HTMLMetaElement>(
    `meta[name="${name}"]`,
  );

  if (!tag) {
    tag = window.document.createElement("meta");
    tag.name = name;
    window.document.head.appendChild(tag);
  }

  tag.content = content;
};

const upsertMetaByProperty = (property: string, content: string) => {
  let tag = window.document.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );

  if (!tag) {
    tag = window.document.createElement("meta");
    tag.setAttribute("property", property);
    window.document.head.appendChild(tag);
  }

  tag.content = content;
};

const upsertLink = (rel: string, href: string) => {
  let tag = window.document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (!tag) {
    tag = window.document.createElement("link");
    tag.rel = rel;
    window.document.head.appendChild(tag);
  }

  tag.href = href;
};

const upsertStructuredData = (structuredData?: unknown) => {
  const scriptId = "yeollock-seo-jsonld";
  let tag = window.document.getElementById(scriptId) as HTMLScriptElement | null;

  if (!structuredData) {
    tag?.remove();
    return;
  }

  if (!tag) {
    tag = window.document.createElement("script");
    tag.id = scriptId;
    tag.type = "application/ld+json";
    window.document.head.appendChild(tag);
  }

  tag.textContent = JSON.stringify(structuredData);
};

const preloadedRouteModules = new Set<RouteModuleLoader>();

const preloadRouteModule = (loader: RouteModuleLoader) => {
  if (preloadedRouteModules.has(loader)) return;
  preloadedRouteModules.add(loader);
  void loader().catch(() => {
    preloadedRouteModules.delete(loader);
  });
};

const preloadRouteModules = (loaders: RouteModuleLoader[]) => {
  loaders.forEach(preloadRouteModule);
};

const getExactRoutePreloaders = (pathname: string): RouteModuleLoader[] => {
  if (pathname === "/login") return [loadLoginLanding];
  if (pathname === "/login/advertiser") return [loadLoginLanding, loadDashboard];
  if (pathname === "/login/influencer") {
    return [loadInfluencerLoginPage, loadInfluencerDashboard];
  }
  if (pathname === "/signup/advertiser" || pathname === "/signup/influencer") {
    return [loadSignupPage];
  }
  if (pathname === "/reset-password") return [loadPasswordResetPage];
  if (
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/legal/e-sign-consent"
  ) {
    return [loadLegalDocumentPage];
  }
  if (pathname === "/support") return [loadSupportPage];
  if (pathname === "/advertiser/dashboard") return [loadDashboard];
  if (pathname === "/advertiser/builder") return [loadContractBuilder];
  if (pathname === "/advertiser/discover") return [loadMarketplacePages];
  if (pathname === "/advertiser/campaigns") return [loadDashboard];
  if (pathname === "/advertiser/campaigns/new") return [loadCampaignPages];
  if (pathname === "/advertiser/messages") return [loadMarketplaceInboxPage];
  if (pathname === "/advertiser/verification") return [loadAdvertiserVerification];
  if (pathname.startsWith("/advertiser/contract/")) {
    return [loadContractAdminViewer];
  }
  if (pathname.startsWith("/contract/")) return [loadContractViewer];
  if (pathname === "/influencer/dashboard") return [loadInfluencerDashboard];
  if (pathname === "/influencer/brands") return [loadMarketplacePages];
  if (pathname === "/influencer/campaigns") return [loadCampaignPages];
  if (pathname === "/influencer/messages") return [loadMarketplaceInboxPage];
  if (pathname === "/influencer/verification") return [loadInfluencerVerification];
  if (pathname.startsWith("/brands/")) return [loadMarketplacePages];
  if (pathname === "/resources" || pathname.startsWith("/resources/")) return [];
  if (pathname !== "/" && pathname.split("/").filter(Boolean).length === 1) {
    return [loadMarketplacePages];
  }

  return [];
};

const getContextualRoutePreloaders = (pathname: string): RouteModuleLoader[] => {
  if (pathname === "/" || pathname.startsWith("/intro/")) {
    return [loadLoginLanding, loadSignupPage];
  }

  if (pathname === "/login/advertiser") return [loadDashboard];
  if (pathname === "/login/influencer") return [loadInfluencerDashboard];
  if (pathname === "/login") return [loadLoginLanding];

  if (pathname === "/advertiser/dashboard") {
    return [
      loadDashboard,
      loadContractBuilder,
      loadMarketplacePages,
      loadCampaignPages,
      loadMarketplaceInboxPage,
      loadAdvertiserVerification,
    ];
  }

  if (pathname === "/influencer/dashboard") {
    return [
      loadInfluencerDashboard,
      loadCampaignPages,
      loadMarketplacePages,
      loadMarketplaceInboxPage,
      loadInfluencerVerification,
    ];
  }

  if (pathname.startsWith("/signup")) {
    return [loadLoginLanding, loadDashboard, loadInfluencerDashboard];
  }

  if (pathname.startsWith("/advertiser")) {
    return [
      loadDashboard,
      loadContractBuilder,
      loadMarketplacePages,
      loadMarketplaceInboxPage,
      loadCampaignPages,
      loadAdvertiserVerification,
      loadContractAdminViewer,
    ];
  }

  if (pathname.startsWith("/influencer")) {
    return [
      loadInfluencerDashboard,
      loadMarketplacePages,
      loadMarketplaceInboxPage,
      loadCampaignPages,
      loadInfluencerVerification,
      loadContractViewer,
    ];
  }

  if (pathname.startsWith("/brands/") || pathname !== "/") {
    return [loadLoginLanding, loadSignupPage, loadMarketplacePages];
  }

  return [];
};

const getImmediateRoutePreloaders = (
  pathname: string,
  search: string,
): RouteModuleLoader[] => {
  if (pathname === "/login/advertiser") {
    const nextPath = getNextPath(search, "/advertiser/dashboard", ["/advertiser"]);
    return [loadDashboard, ...getExactRoutePreloaders(nextPath)];
  }

  if (pathname === "/login/influencer") {
    const nextPath = getNextPath(search, "/influencer/dashboard", [
      "/influencer",
      "/contract",
    ]);
    return [loadInfluencerDashboard, ...getExactRoutePreloaders(nextPath)];
  }

  return getExactRoutePreloaders(pathname);
};

const scheduleIdlePreload = (
  callback: () => void,
  timeout: number,
  delayMs = 0,
) => {
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  let cancelIdle: (() => void) | undefined;
  const timer = window.setTimeout(() => {
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(callback, { timeout });
      cancelIdle = () => idleWindow.cancelIdleCallback?.(handle);
      return;
    }

    const fallbackTimer = window.setTimeout(callback, Math.min(timeout, 900));
    cancelIdle = () => window.clearTimeout(fallbackTimer);
  }, delayMs);

  return () => {
    window.clearTimeout(timer);
    cancelIdle?.();
  };
};

function RouteSeoMeta() {
  const location = useLocation();

  useEffect(() => {
    const seo = getIntentAwareRouteSeoConfig(location.pathname);
    const canonicalUrl = buildCanonicalUrl(seo.canonicalPath);

    window.document.title = seo.title;
    upsertMetaByName("description", seo.description);
    upsertMetaByName("robots", seo.robots);
    upsertMetaByName("application-name", PRODUCT_NAME);
    upsertMetaByName("apple-mobile-web-app-title", PRODUCT_NAME);
    upsertLink("canonical", canonicalUrl);
    upsertMetaByProperty("og:site_name", PRODUCT_NAME);
    upsertMetaByProperty("og:type", "website");
    upsertMetaByProperty("og:locale", "ko_KR");
    upsertMetaByProperty("og:url", canonicalUrl);
    upsertMetaByProperty("og:title", seo.title);
    upsertMetaByProperty("og:description", seo.description);
    upsertMetaByProperty("og:image", seo.ogImageUrl ?? defaultOgImageUrl);
    upsertMetaByProperty("og:image:secure_url", seo.ogImageUrl ?? defaultOgImageUrl);
    upsertMetaByProperty("og:image:type", "image/png");
    upsertMetaByProperty("og:image:width", String(ogImageWidth));
    upsertMetaByProperty("og:image:height", String(ogImageHeight));
    upsertMetaByProperty("og:image:alt", seo.ogImageAlt ?? defaultOgImageAlt);
    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", seo.title);
    upsertMetaByName("twitter:description", seo.description);
    upsertMetaByName("twitter:image", seo.ogImageUrl ?? defaultOgImageUrl);
    upsertMetaByName("twitter:image:alt", seo.ogImageAlt ?? defaultOgImageAlt);
    upsertStructuredData(seo.structuredData);
  }, [location.pathname]);

  return null;
}

function RouteAnalytics() {
  const location = useLocation();

  useEffect(() => {
    syncAnalyticsRoute(location.pathname, location.search);
  }, [location.pathname, location.search]);

  return null;
}

function RoutePreloader() {
  const location = useLocation();

  useEffect(() => {
    const preloadFromAnchor = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;

      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        preloadRouteModules(getExactRoutePreloaders(url.pathname));
      } catch {
        // Ignore malformed links.
      }
    };

    document.addEventListener("pointerover", preloadFromAnchor, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchstart", preloadFromAnchor, {
      capture: true,
      passive: true,
    });
    document.addEventListener("focusin", preloadFromAnchor, true);

    return () => {
      document.removeEventListener("pointerover", preloadFromAnchor, true);
      document.removeEventListener("touchstart", preloadFromAnchor, true);
      document.removeEventListener("focusin", preloadFromAnchor, true);
    };
  }, []);

  useEffect(() => {
    preloadRouteModules(
      getImmediateRoutePreloaders(location.pathname, location.search),
    );

    const cancelLikelyPreload = scheduleIdlePreload(() => {
      preloadRouteModules(getContextualRoutePreloaders(location.pathname));
    }, 900, location.pathname.startsWith("/login") ? 40 : 850);

    const secondaryTimer = window.setTimeout(() => {
      if (location.pathname === "/") {
        preloadRouteModules([loadMarketplacePages, loadCampaignPages]);
      }
    }, 1600);

    return () => {
      cancelLikelyPreload();
      window.clearTimeout(secondaryTimer);
    };
  }, [location.pathname, location.search]);

  return null;
}

function AdvertiserLoginRoute() {
  const location = useLocation();
  const nextPath = getNextPath(location.search, "/advertiser/dashboard", ["/advertiser"]);

  return (
    <AdvertiserAuthGate redirectAfterLogin={nextPath}>
      <Navigate to={nextPath} replace />
    </AdvertiserAuthGate>
  );
}

function LegacyMarketingRedirect() {
  const location = useLocation();
  const params = useParams();
  const legacyPath = params["*"] ?? "";
  const advertiserPath = legacyPath
    ? `/advertiser/${legacyPath}`
    : "/advertiser/dashboard";

  return <Navigate to={`${advertiserPath}${location.search}`} replace />;
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-5 py-10 font-sans text-neutral-950">
      <section className="w-full max-w-[420px] rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-semibold text-neutral-500">{PRODUCT_NAME}</p>
        <h1 className="mt-3 text-[24px] font-semibold tracking-normal">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          링크가 만료되었거나 접근 경로가 변경되었을 수 있습니다.
        </p>
        <div className="mt-6 grid gap-2">
          <Link
            to="/"
            className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            처음으로 이동
          </Link>
          <Link
            to="/influencer/dashboard"
            className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
          >
            인플루언서 대시보드
          </Link>
          <Link
            to="/advertiser/dashboard"
            className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
          >
            1:1 계약 대시보드
          </Link>
        </div>
      </section>
    </main>
  );
}

function AppRoutes() {
  const location = useLocation();
  const loadingCopy = getRouteLoadingCopy(location.pathname);
  const routeErrorRecovery = isPrivateApplicationPath(location.pathname)
    ? { href: "/login", label: "로그인으로 이동" }
    : { href: "/", label: "처음으로 이동" };

  return (
    <>
      <RouteSeoMeta />
      <RouteAnalytics />
      <RoutePreloader />
      <RouteErrorBoundary
        key={location.key}
        recoveryHref={routeErrorRecovery.href}
        recoveryLabel={routeErrorRecovery.label}
      >
      <Suspense fallback={<AppLoading {...loadingCopy} />}>
        <Routes>
          <Route
            path="/"
            element={<StartPage />}
          />
          <Route path="/intro/advertiser" element={<AdvertiserIntroPage />} />
          <Route path="/intro/influencer" element={<InfluencerIntroPage />} />
          <Route path="/login" element={<LoginLanding />} />
          <Route path="/login/advertiser" element={<AdvertiserLoginRoute />} />
          <Route path="/login/influencer" element={<InfluencerLoginPage />} />
          <Route path="/reset-password" element={<PasswordResetPage />} />
          <Route path="/signup" element={<SignupLanding />} />
          <Route path="/signup/advertiser" element={<SignupPage role="advertiser" />} />
          <Route path="/signup/influencer" element={<SignupPage role="influencer" />} />
          <Route path="/privacy" element={<LegalDocumentPage documentType="privacy" />} />
          <Route path="/terms" element={<LegalDocumentPage documentType="terms" />} />
          <Route
            path="/legal/e-sign-consent"
            element={<LegalDocumentPage documentType="eSignConsent" />}
          />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/resources" element={<SeoResourcesIndexPage />} />
          <Route path="/resources/:resourceSlug" element={<SeoResourcePage />} />
          <Route path="/admin/login" element={<SystemAdminDashboard loginOnly />} />
          <Route path="/admin/mobile" element={<SystemAdminDashboard mobileOnly />} />
          <Route path="/admin" element={<SystemAdminDashboard />} />
          <Route path="/marketing/*" element={<LegacyMarketingRedirect />} />
          <Route
            path="/advertiser/dashboard"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <Dashboard />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/builder"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <ContractBuilder />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/discover"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <AdvertiserInfluencerDiscoveryPage />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/campaigns"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <Dashboard surface="campaigns" />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/campaigns/new"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <AdvertiserCampaignCreationPage />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/messages"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <AdvertiserMessagesPage />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/verification"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <AdvertiserVerification />
              </AdvertiserAuthGate>
            }
          />
          <Route
            path="/advertiser/contract/:id"
            element={
              <AdvertiserAuthGate redirectUnauthenticated>
                <ContractAdminViewer />
              </AdvertiserAuthGate>
            }
          />
          <Route path="/contract/:id" element={<ContractViewer />} />
          <Route
            path="/influencer/verification"
            element={<InfluencerVerification />}
          />
          <Route
            path="/influencer/dashboard"
            element={<InfluencerDashboard />}
          />
          <Route
            path="/influencer/brands"
            element={<InfluencerBrandDiscoveryPage />}
          />
          <Route
            path="/influencer/campaigns"
            element={<InfluencerCampaignDiscoveryPage />}
          />
          <Route
            path="/influencer/messages"
            element={<InfluencerMessagesPage />}
          />
          <Route path="/brands/:brandHandle" element={<PublicBrandProfilePage />} />
          <Route path="/:profileHandle" element={<PublicInfluencerProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
