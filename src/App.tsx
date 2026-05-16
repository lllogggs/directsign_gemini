import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
  Link,
} from "react-router-dom";
import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { AdvertiserAuthGate } from "./pages/marketing/AdvertiserAuthGate";
import { RoleIntroPage, StartPage } from "./pages/landing/LandingPages";
import { getNextPath } from "./domain/navigation";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "./domain/brand";

type RouteModuleLoader = () => Promise<unknown>;

const loadDashboard = () => import("./pages/marketing/Dashboard");
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
  import("./pages/influencer/InfluencerDashboard");
const loadInfluencerLoginPage = () =>
  import("./pages/influencer/InfluencerLoginPage");
const loadSystemAdminDashboard = () =>
  import("./pages/admin/SystemAdminDashboard");
const loadLegalDocumentPage = () => import("./pages/legal/LegalDocumentPage");
const loadMarketplacePages = () => import("./pages/marketplace/MarketplacePages");
const loadMarketplaceInboxPage = () =>
  import("./pages/marketplace/MarketplaceInboxPage");
const loadCampaignPages = () => import("./pages/marketplace/CampaignPages");

const Dashboard = lazy(() =>
  loadDashboard().then((module) => ({
    default: module.Dashboard,
  })),
);
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
const InfluencerDashboard = lazy(() =>
  loadInfluencerDashboard().then((module) => ({
    default: module.InfluencerDashboard,
  })),
);
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
const LegalDocumentPage = lazy(() =>
  loadLegalDocumentPage().then((module) => ({
    default: module.LegalDocumentPage,
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
const AdvertiserCampaignRecruitmentPage = lazy(() =>
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
};

function getRouteLoadingCopy(pathname: string): LoadingCopy {
  if (pathname === "/intro/advertiser") {
    return {
      label: "계약 시작 화면을 준비하고 있습니다",
      detail: "사업자 인증, 검토 링크, 서명 증빙 안내를 불러오는 중입니다.",
    };
  }

  if (pathname === "/intro/influencer") {
    return {
      label: "계약 검토 화면을 준비하고 있습니다",
      detail: "조건 확인, 수정 요청, 전자서명 안내를 불러오는 중입니다.",
    };
  }

  return { label: "화면을 불러오는 중입니다" };
}

function AppLoading({
  label = "계약 데이터를 불러오는 중입니다",
  detail,
}: LoadingCopy) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] font-sans text-neutral-500">
      <div className="mx-5 w-full max-w-[360px] border border-neutral-200 bg-white px-6 py-5 text-center shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          {PRODUCT_NAME}
        </p>
        <p className="mt-2 text-sm font-medium text-neutral-900">{label}</p>
        {detail ? (
          <p className="mt-2 text-[12px] font-semibold leading-5 text-neutral-500">
            {detail}
          </p>
        ) : null}
        <div className="mt-4 space-y-2" aria-hidden="true">
          <span className="block h-2.5 w-full rounded-full bg-neutral-100" />
          <span className="mx-auto block h-2.5 w-4/5 rounded-full bg-neutral-100" />
        </div>
      </div>
    </div>
  );
}

type RouteErrorBoundaryProps = {
  children: ReactNode;
  key?: string;
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
              to="/login"
              className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
            >
              로그인으로 이동
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

const utilityNoIndexPrefixes = ["/login", "/signup", "/reset-password"];
const publicSiteOrigin =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/$/, "") ||
  "https://yeollock.me";

type RouteSeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
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
  "전자서명 증빙",
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
  "서명 증빙 보관",
];
const defaultSeoDescription =
  "광고 조건을 계약서 작성부터 검토 링크, 전자서명 증빙까지 한 흐름으로 정리합니다.";

const searchIntentSeoDescription =
  "연락미는 광고주가 인플루언서를 찾고, 인플루언서가 광고주 제안을 검토할 때 협찬, PPL, 공동구매 조건을 계약서 작성부터 검토 링크, 전자서명 증빙까지 한 흐름으로 정리합니다.";

const normalizeSeoPath = (pathname: string) =>
  pathname.replace(/\/+$/, "") || "/";

const buildCanonicalUrl = (pathname: string) =>
  `${publicSiteOrigin}${pathname === "/" ? "/" : pathname}`;

const buildStructuredData = ({
  title,
  description,
  canonicalPath,
  keywords = seoKeywordList,
}: Pick<RouteSeoConfig, "title" | "description" | "canonicalPath"> & {
  keywords?: string[];
}) => {
  const url = buildCanonicalUrl(canonicalPath);
  const keywordText = keywords.join(", ");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${publicSiteOrigin}/#organization`,
        name: PRODUCT_NAME,
        url: `${publicSiteOrigin}/`,
        logo: `${publicSiteOrigin}/favicon.svg`,
        knowsAbout: seoKeywordList,
      },
      {
        "@type": "WebSite",
        "@id": `${publicSiteOrigin}/#website`,
        name: PRODUCT_NAME,
        url: `${publicSiteOrigin}/`,
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
        isPartOf: { "@id": `${publicSiteOrigin}/#website` },
        about: { "@id": `${publicSiteOrigin}/#app` },
      },
    ],
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
      title: `${PRODUCT_NAME} - 광고 계약은 확실하게`,
      description: defaultSeoDescription,
      canonicalPath: "/",
      robots: publicRobotsContent,
    },
    "/intro/advertiser": {
      title: `광고주 광고 계약 관리 - ${PRODUCT_NAME}`,
      description:
        "광고 조건 입력, 계약서 작성, 검토 링크 발송, 전자서명 증빙 보관까지 광고주 계약 운영을 한 흐름으로 정리합니다.",
      canonicalPath: "/intro/advertiser",
      robots: publicRobotsContent,
    },
    "/intro/influencer": {
      title: `인플루언서 광고 계약 검토 - ${PRODUCT_NAME}`,
      description:
        "인플루언서가 받은 광고 계약 조건을 확인하고 수정 요청과 전자서명을 간단하게 진행할 수 있습니다.",
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
      title: `전자서명 안내 - ${PRODUCT_NAME}`,
      description:
        "연락미에서 전자서명을 진행할 때 고정되는 최종본, 서명 의사표시, 감사 증빙 보관 기준입니다.",
      canonicalPath: "/legal/e-sign-consent",
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
};

const buildPublicSeoConfig = (config: IntentAwareSeoCopy): RouteSeoConfig => ({
  ...config,
  structuredData: buildStructuredData(config),
});

const publicSearchIntentPages: Record<string, IntentAwareSeoCopy> = {
  "/": {
    title: `${PRODUCT_NAME} - 광고 계약은 확실하게`,
    description: searchIntentSeoDescription,
    canonicalPath: "/",
    robots: publicRobotsContent,
    keywords: seoKeywordList,
  },
  "/intro/advertiser": {
    title: `광고주 인플루언서 찾기와 광고 계약 관리 - ${PRODUCT_NAME}`,
    description:
      "광고주, 브랜드, 광고대행사가 인스타그램, 유튜브, 틱톡, 블로그 인플루언서에게 보낼 협찬, PPL, 공동구매 제안을 계약서와 전자서명까지 관리합니다.",
    canonicalPath: "/intro/advertiser",
    robots: publicRobotsContent,
    keywords: advertiserIntentKeywords,
  },
  "/intro/influencer": {
    title: `인플루언서 광고주 제안 검토와 계약 서명 - ${PRODUCT_NAME}`,
    description:
      "인플루언서와 크리에이터가 광고주나 브랜드가 보낸 협찬, PPL, 공동구매 제안을 확인하고 수정 요청과 전자서명을 진행합니다.",
    canonicalPath: "/intro/influencer",
    robots: publicRobotsContent,
    keywords: influencerIntentKeywords,
  },
  "/privacy": {
    title: `개인정보 처리방침 - ${PRODUCT_NAME}`,
    description:
      "광고 계약, 계정 인증, 검토 링크, 전자서명 증빙 보관에 필요한 개인정보 처리 기준을 안내합니다.",
    canonicalPath: "/privacy",
    robots: publicRobotsContent,
    keywords: ["광고 계약 개인정보", "전자서명 개인정보", "계약 서비스 개인정보"],
  },
  "/terms": {
    title: `이용약관 - ${PRODUCT_NAME}`,
    description:
      "광고주와 인플루언서가 연락미에서 광고 계약과 전자서명 기능을 이용할 때 적용되는 서비스 이용 조건입니다.",
    canonicalPath: "/terms",
    robots: publicRobotsContent,
    keywords: ["광고 계약 서비스 약관", "인플루언서 계약 약관", "전자계약 약관"],
  },
  "/legal/e-sign-consent": {
    title: `전자서명 안내 - ${PRODUCT_NAME}`,
    description:
      "광고 계약에서 전자서명을 진행하고 최종본, 서명 의사표시, 감사 증빙을 보관하는 기준을 안내합니다.",
    canonicalPath: "/legal/e-sign-consent",
    robots: publicRobotsContent,
    keywords: ["광고 계약 전자서명", "인플루언서 계약 서명", "전자서명 증빙"],
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
  if (publicPage) return buildPublicSeoConfig(publicPage);

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
  if (pathname === "/advertiser/dashboard") return [loadDashboard];
  if (pathname === "/advertiser/builder") return [loadContractBuilder];
  if (pathname === "/advertiser/discover") return [loadMarketplacePages];
  if (pathname === "/advertiser/campaigns") return [loadCampaignPages];
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
  if (pathname !== "/" && pathname.split("/").filter(Boolean).length === 1) {
    return [loadMarketplacePages];
  }

  return [];
};

const getContextualRoutePreloaders = (pathname: string): RouteModuleLoader[] => {
  if (pathname === "/" || pathname.startsWith("/intro/")) {
    return [loadLoginLanding, loadSignupPage];
  }

  if (pathname.startsWith("/login")) {
    return [
      loadDashboard,
      loadInfluencerDashboard,
      loadMarketplacePages,
      loadMarketplaceInboxPage,
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

const scheduleIdlePreload = (callback: () => void, timeout: number) => {
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(callback, Math.min(timeout, 900));
  return () => window.clearTimeout(timer);
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
    upsertMetaByName("twitter:card", "summary");
    upsertMetaByName("twitter:title", seo.title);
    upsertMetaByName("twitter:description", seo.description);
    upsertStructuredData(seo.structuredData);
  }, [location.pathname]);

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
    const cancelLikelyPreload = scheduleIdlePreload(() => {
      preloadRouteModules(getContextualRoutePreloaders(location.pathname));
    }, 700);

    const secondaryTimer = window.setTimeout(() => {
      if (location.pathname === "/") {
        preloadRouteModules([loadMarketplacePages, loadCampaignPages]);
      }
    }, 1600);

    return () => {
      cancelLikelyPreload();
      window.clearTimeout(secondaryTimer);
    };
  }, [location.pathname]);

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
            광고주 대시보드
          </Link>
        </div>
      </section>
    </main>
  );
}

function AppRoutes() {
  const location = useLocation();
  const loadingCopy = getRouteLoadingCopy(location.pathname);

  return (
    <>
      <RouteSeoMeta />
      <RoutePreloader />
      <RouteErrorBoundary key={location.key}>
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
          <Route path="/signup/advertiser" element={<SignupPage role="advertiser" />} />
          <Route path="/signup/influencer" element={<SignupPage role="influencer" />} />
          <Route path="/privacy" element={<LegalDocumentPage documentType="privacy" />} />
          <Route path="/terms" element={<LegalDocumentPage documentType="terms" />} />
          <Route
            path="/legal/e-sign-consent"
            element={<LegalDocumentPage documentType="eSignConsent" />}
          />
          <Route path="/admin/login" element={<SystemAdminDashboard loginOnly />} />
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
                <AdvertiserCampaignRecruitmentPage />
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
