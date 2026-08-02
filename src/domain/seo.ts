import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "./brand.js";
import { LEGAL_CONTACT_EMAIL } from "./legalEntity.js";
import {
  getSeoResourceByPath,
  seoResourceIndexPath,
  seoResourcePaths,
  seoResources,
  type SeoResourcePage,
} from "./seoResources.js";

export type RouteSeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  htmlLang?: string;
  ogLocale?: string;
  ogImageUrl?: string;
  ogImageAlt?: string;
  structuredData?: unknown;
};

type IntentAwareSeoCopy = Omit<RouteSeoConfig, "structuredData"> & {
  keywords?: string[];
  resource?: SeoResourcePage;
  resourceList?: SeoResourcePage[];
};

const privateRoutePrefixes = [
  "/admin",
  "/advertiser",
  "/contract",
  "/influencer",
  "/marketing",
];

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
  String(import.meta.env?.VITE_INSTAGRAM_OFFICIAL_HANDLE ?? "yeollockme")
    .trim()
    .replace(/^@+/, "") || "yeollockme";

const publicSameAsUrls = [`https://www.instagram.com/${officialInstagramHandle}/`];
export const seoDateModified = "2026-05-31";

export const publicRobotsContent =
  "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
export const legalRobotsContent = "noindex,follow";
export const privateRobotsContent = "noindex,nofollow";

export const staticSeoRoutePaths = [
  "/",
  "/en/creators",
  "/ja/creators",
  "/zh/creators",
  "/intro/advertiser",
  "/intro/influencer",
  "/privacy",
  "/terms",
  "/legal/e-sign-consent",
  "/support",
  ...seoResourcePaths,
] as const;

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

const globalCreatorIntentKeywords = [
  "Korean brand collaboration",
  "Korean influencer campaign",
  "K-beauty brand deals",
  "K-fashion creator campaign",
  "Korea travel creator",
  "韓国ブランド 案件",
  "韩国品牌合作",
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

export const normalizeSeoPath = (pathname: string) =>
  pathname.replace(/\/+$/, "") || "/";

export const buildCanonicalUrl = (pathname: string) =>
  `${publicSiteOrigin}${pathname === "/" ? "/" : pathname}`;

export const defaultOgImagePath = "/og/yeollock-og.png";
export const defaultOgImageUrl = buildCanonicalUrl(defaultOgImagePath);
export const defaultOgImageAlt =
  "연락미 인플루언서 광고 계약 관리 화면 미리보기";
export const ogImageWidth = 1200;
export const ogImageHeight = 630;

const buildStructuredData = ({
  title,
  description,
  canonicalPath,
  htmlLang,
  ogImageUrl = defaultOgImageUrl,
  ogImageAlt = defaultOgImageAlt,
  keywords = seoKeywordList,
  resource,
  resourceList,
}: Pick<
  RouteSeoConfig,
  | "title"
  | "description"
  | "canonicalPath"
  | "htmlLang"
  | "ogImageUrl"
  | "ogImageAlt"
> & {
  keywords?: string[];
  resource?: SeoResourcePage;
  resourceList?: SeoResourcePage[];
}) => {
  const url = buildCanonicalUrl(canonicalPath);
  const pageLanguage = htmlLang ?? "ko-KR";
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
      inLanguage: pageLanguage,
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
      inLanguage: pageLanguage,
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
    "/en/creators": {
      title: `Korean brand deals for creators - ${PRODUCT_NAME}`,
      description:
        "Review K-brand terms, sign online, and keep proof with 연락미.",
      canonicalPath: "/en/creators",
      robots: publicRobotsContent,
      htmlLang: "en",
      ogLocale: "en_US",
    },
    "/ja/creators": {
      title: `韓国ブランド案件を契約まで明確に - ${PRODUCT_NAME}`,
      description:
        "연락미で韓国ブランドの募集条件、電子署名、PDF証拠保管まで一つの場所で確認できます。",
      canonicalPath: "/ja/creators",
      robots: publicRobotsContent,
      htmlLang: "ja",
      ogLocale: "ja_JP",
    },
    "/zh/creators": {
      title: `韩国品牌合作，签约前说清楚 - ${PRODUCT_NAME}`,
      description:
        "通过 연락미 查看韩国品牌活动条件、在线签署，并统一保存合同 PDF 与合作证据。",
      canonicalPath: "/zh/creators",
      robots: publicRobotsContent,
      htmlLang: "zh-CN",
      ogLocale: "zh_CN",
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
      robots: legalRobotsContent,
    },
    "/terms": {
      title: `이용약관 - ${PRODUCT_NAME}`,
      description:
        "연락미 광고 계약 워크스페이스 이용 조건, 책임 범위, 데이터 보관 기준을 안내합니다.",
      canonicalPath: "/terms",
      robots: legalRobotsContent,
    },
    "/legal/e-sign-consent": {
      title: `전자서명 안내 및 동의 - ${PRODUCT_NAME}`,
      description:
        "연락미에서 전자서명을 진행할 때 고정되는 최종본, 서명 의사표시, 감사 증빙 보관 기준입니다.",
      canonicalPath: "/legal/e-sign-consent",
      robots: legalRobotsContent,
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
  "/en/creators": {
    title: `Korean brand deals for creators | ${PRODUCT_NAME}`,
    description:
      "Review K-brand terms, sign online, and keep proof with 연락미.",
    canonicalPath: "/en/creators",
    robots: publicRobotsContent,
    htmlLang: "en",
    ogLocale: "en_US",
    keywords: globalCreatorIntentKeywords,
  },
  "/ja/creators": {
    title: `韓国ブランド案件を契約まで明確に | ${PRODUCT_NAME}`,
    description:
      "韓国ブランドの募集条件、電子署名、PDF証拠保管まで연락미で一つに整理できます。",
    canonicalPath: "/ja/creators",
    robots: publicRobotsContent,
    htmlLang: "ja",
    ogLocale: "ja_JP",
    keywords: globalCreatorIntentKeywords,
  },
  "/zh/creators": {
    title: `韩国品牌合作，签约前说清楚 | ${PRODUCT_NAME}`,
    description:
      "创作者可以通过 연락미 查看韩国品牌活动条件、在线签署，并统一保存合同 PDF 与合作证据。",
    canonicalPath: "/zh/creators",
    robots: publicRobotsContent,
    htmlLang: "zh-CN",
    ogLocale: "zh_CN",
    keywords: globalCreatorIntentKeywords,
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
    robots: legalRobotsContent,
    keywords: ["광고 계약 개인정보", "전자서명 개인정보", "계약 서비스 개인정보"],
  },
  "/terms": {
    title: `이용약관 - ${PRODUCT_NAME}`,
    description:
      "광고주와 인플루언서가 연락미 계약 서비스를 이용할 때 적용되는 조건입니다.",
    canonicalPath: "/terms",
    robots: legalRobotsContent,
    keywords: ["광고 계약 서비스 약관", "인플루언서 계약 약관", "전자계약 약관"],
  },
  "/legal/e-sign-consent": {
    title: `전자서명 안내 및 동의 - ${PRODUCT_NAME}`,
    description:
      "광고 계약 전자서명의 최종본 확정, 서명 의사표시, 감사 증빙 보관 기준입니다.",
    canonicalPath: "/legal/e-sign-consent",
    robots: legalRobotsContent,
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

export const getIntentAwareRouteSeoConfig = (pathname: string): RouteSeoConfig => {
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
