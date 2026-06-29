import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_NAME } from "../src/domain/brand.ts";
import {
  buildCanonicalUrl,
  defaultOgImageAlt,
  defaultOgImageUrl,
  getIntentAwareRouteSeoConfig,
  ogImageHeight,
  ogImageWidth,
  seoDateModified,
  staticSeoRoutePaths,
} from "../src/domain/seo.ts";
import {
  seoResources,
  type SeoResourceArticlePath,
} from "../src/domain/seoResources.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const indexPath = path.join(distDir, "index.html");
const seoScriptId = "yeollock-seo-jsonld";
const defaultGoogleSiteVerification = "google2387249b6e5a1a3d.html";
const defaultNaverSiteVerification =
  "eea8ff877c8abe42deb35a15e6dbb3e202ee178e";
const googleSiteVerification =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() ||
  process.env.VITE_GOOGLE_SITE_VERIFICATION?.trim() ||
  defaultGoogleSiteVerification;
const naverSiteVerification =
  process.env.NAVER_SITE_VERIFICATION?.trim() ||
  process.env.VITE_NAVER_SITE_VERIFICATION?.trim() ||
  defaultNaverSiteVerification;

type StaticSeoRoutePath = (typeof staticSeoRoutePaths)[number];

const resourceRouteLabels = Object.fromEntries(
  seoResources.map((resource) => [resource.path, resource.title]),
) as Record<SeoResourceArticlePath, string>;

const routeLabels: Record<StaticSeoRoutePath, string> = {
  "/": "홈",
  "/en/creators": "Global creators",
  "/ja/creators": "日本語クリエイター案内",
  "/zh/creators": "中文创作者页面",
  "/intro/advertiser": "광고주 안내",
  "/intro/influencer": "인플루언서 안내",
  "/privacy": "개인정보 처리방침",
  "/terms": "이용약관",
  "/legal/e-sign-consent": "전자서명 안내",
  "/support": "고객지원",
  "/resources": "계약 가이드",
  ...resourceRouteLabels,
};

const resourceSearchSummaries = Object.fromEntries(
  seoResources.map((resource) => [
    resource.path,
    [resource.summary, resource.sections[0]?.paragraphs[0] ?? resource.description],
  ]),
) as Record<SeoResourceArticlePath, string[]>;

const routeSearchSummaries: Record<StaticSeoRoutePath, string[]> = {
  "/": [
    "연락미는 광고주와 인플루언서가 협찬, PPL, 공동구매 조건을 계약서 작성, 검토 링크, 수정 협의, 전자서명 증빙까지 한 흐름으로 정리하는 한국어 광고 계약 워크스페이스입니다.",
    "정산 대행, 에스크로, 세무 대행, 광고 성과 보증은 제공하지 않으며 계약 상태와 서명 증빙을 명확하게 남기는 데 집중합니다.",
  ],
  "/en/creators": [
    "Yeollock helps global creators review Korean brand campaigns, confirm content terms, sign digitally, and keep contract proof in one place.",
    "Ad fees, payouts, taxes, refunds, and escrow remain between the brand and creator.",
  ],
  "/ja/creators": [
    "Yeollockは、韓国ブランドのキャンペーン条件確認、電子署名、PDF証拠保管までをひとつの流れで整理します。",
    "広告費の支払い、税金、返金、エスクローはブランドとクリエイター間の責任です。",
  ],
  "/zh/creators": [
    "Yeollock帮助创作者确认韩国品牌活动条件、完成电子签名，并集中保存合约PDF与合作记录。",
    "广告费支付、税务、退款和托管由品牌与创作者双方负责。",
  ],
  "/intro/advertiser": [
    "광고주, 브랜드, 광고대행사는 광고 조건을 입력하고 계약서를 작성한 뒤 인플루언서에게 검토 링크를 보낼 수 있습니다.",
    "계약 진행 상태, 수정 요청, 전자서명, 콘텐츠 제출 확인을 계약 중심 대시보드에서 관리합니다.",
  ],
  "/intro/influencer": [
    "인플루언서는 광고주가 보낸 협찬, PPL, 공동구매 계약 조건을 확인하고 필요한 수정 요청을 남길 수 있습니다.",
    "최종 조건이 확정되면 전자서명과 서명 증빙 보관까지 같은 흐름에서 진행합니다.",
  ],
  "/privacy": [
    "연락미는 계정 인증, 광고 계약 작성, 검토 링크, 전자서명 증빙 보관에 필요한 개인정보 처리 기준을 안내합니다.",
    "계약 본문과 서명 증빙 같은 비공개 업무 정보는 권한이 있는 사용자에게만 제공하는 것을 원칙으로 합니다.",
  ],
  "/terms": [
    "이용약관은 광고주와 인플루언서가 연락미 계약 서비스를 사용할 때 적용되는 조건, 책임 범위, 데이터 보관 기준을 설명합니다.",
    "연락미는 정산, 지급, 환불, 세금, 채권 추심, 법률 자문을 대행하지 않습니다.",
  ],
  "/legal/e-sign-consent": [
    "전자서명 안내는 광고 계약 최종본 확정, 서명 의사표시, 감사 증빙 보관 기준을 설명합니다.",
    "서명 전에 계약 내용을 확인하고 전자서명 진행에 동의하는 절차를 고지합니다.",
  ],
  "/support": [
    "고객지원은 계정, 계약 흐름, 전자서명, 개인정보 문의와 서비스 장애를 접수하는 공개 채널입니다.",
    "정산, 지급, 환불, 세금, 채권 추심 분쟁은 연락미 지원 범위에 포함되지 않습니다.",
  ],
  "/resources": [
    "광고 계약 가이드는 협찬, PPL, 공동구매 계약 전 확인해야 할 조건과 증빙 기준을 모아 둔 공개 자료입니다.",
    "각 자료는 계약서 작성, 검토 링크, 수정 요청, 전자서명 증빙 흐름과 연결되는 검색 의도에 맞춰 정리되어 있습니다.",
  ],
  ...resourceSearchSummaries,
};

const resourcePathSet = new Set<string>(
  seoResources.map((resource) => resource.path),
);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escapeScriptJson = (value: unknown) =>
  JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const insertBeforeHeadClose = (html: string, tag: string) =>
  html.replace(/<\/head>/i, `    ${tag}\n  </head>`);

const replaceOrInsert = (html: string, pattern: RegExp, tag: string) =>
  pattern.test(html) ? html.replace(pattern, tag) : insertBeforeHeadClose(html, tag);

const replaceMetaName = (html: string, name: string, content: string) =>
  replaceOrInsert(
    html,
    new RegExp(
      `<meta\\s+(?=[^>]*\\bname=["']${escapeRegex(name)}["'])[^>]*>`,
      "i",
    ),
    `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`,
  );

const replaceOptionalMetaName = (html: string, name: string, content: string) => {
  const pattern = new RegExp(
    `<meta\\s+(?=[^>]*\\bname=["']${escapeRegex(name)}["'])[^>]*>`,
    "i",
  );

  if (!content) return html.replace(pattern, "");
  return replaceOrInsert(
    html,
    pattern,
    `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`,
  );
};

const replaceMetaProperty = (html: string, property: string, content: string) =>
  replaceOrInsert(
    html,
    new RegExp(
      `<meta\\s+(?=[^>]*\\bproperty=["']${escapeRegex(property)}["'])[^>]*>`,
      "i",
    ),
    `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`,
  );

const replaceCanonicalLink = (html: string, href: string) =>
  replaceOrInsert(
    html,
    /<link\s+(?=[^>]*\brel=["']canonical["'])[^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(href)}" />`,
  );

const replaceAlternateLink = (html: string, hreflang: string, href: string) =>
  replaceOrInsert(
    html,
    new RegExp(
      `<link\\s+(?=[^>]*\\brel=["']alternate["'])(?=[^>]*\\bhreflang=["']${escapeRegex(
        hreflang,
      )}["'])[^>]*>`,
      "i",
    ),
    `<link rel="alternate" href="${escapeHtml(href)}" hreflang="${escapeHtml(
      hreflang,
    )}" />`,
  );

const removeAlternateLink = (html: string, hreflang: string) =>
  html.replace(
    new RegExp(
      `<link\\s+(?=[^>]*\\brel=["']alternate["'])(?=[^>]*\\bhreflang=["']${escapeRegex(
        hreflang,
      )}["'])[^>]*>\\s*`,
      "gi",
    ),
    "",
  );

const creatorAlternatePaths = ["/en/creators", "/ja/creators", "/zh/creators"];

const replaceRouteAlternateLinks = (
  html: string,
  routePath: StaticSeoRoutePath,
  canonicalUrl: string,
) => {
  if (creatorAlternatePaths.includes(routePath)) {
    let nextHtml = removeAlternateLink(html, "ko-KR");
    nextHtml = removeAlternateLink(nextHtml, "zh");
    nextHtml = replaceAlternateLink(nextHtml, "en", buildCanonicalUrl("/en/creators"));
    nextHtml = replaceAlternateLink(nextHtml, "ja", buildCanonicalUrl("/ja/creators"));
    nextHtml = replaceAlternateLink(
      nextHtml,
      "zh-CN",
      buildCanonicalUrl("/zh/creators"),
    );
    nextHtml = replaceAlternateLink(
      nextHtml,
      "x-default",
      buildCanonicalUrl("/en/creators"),
    );
    return nextHtml;
  }

  let nextHtml = replaceAlternateLink(html, "ko-KR", canonicalUrl);
  nextHtml = replaceAlternateLink(nextHtml, "x-default", canonicalUrl);
  return nextHtml;
};

const replaceStructuredData = (html: string, structuredData?: unknown) => {
  const pattern = new RegExp(
    `<script\\s+(?=[^>]*\\bid=["']${escapeRegex(
      seoScriptId,
    )}["'])[^>]*>[\\s\\S]*?<\\/script>`,
    "i",
  );

  if (!structuredData) return html.replace(pattern, "");

  const tag = `<script id="${seoScriptId}" type="application/ld+json">\n${escapeScriptJson(
    structuredData,
  )}\n    </script>`;
  return replaceOrInsert(html, pattern, tag);
};

const renderNoscript = (
  title: string,
  description: string,
  routePath: StaticSeoRoutePath,
) => {
  const seo = getIntentAwareRouteSeoConfig(routePath);
  const navLinks = staticSeoRoutePaths
    .filter((route) => !resourcePathSet.has(route))
    .map((route) => {
      const href = route === "/" ? "/" : route;
      return `<a href="${escapeHtml(href)}">${escapeHtml(routeLabels[route])}</a>`;
    })
    .join("\n          ");
  const searchSummary = routeSearchSummaries[routePath]
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 12px;">${escapeHtml(paragraph)}</p>`,
    )
    .join("\n        ");

  return `<noscript>
      <main lang="${escapeHtml(seo.htmlLang ?? "ko")}" style="max-width: 720px; margin: 48px auto; padding: 0 20px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #171717;">
        <h1 style="font-size: 28px; line-height: 1.2; margin: 0 0 12px;">${escapeHtml(title)}</h1>
        <p style="margin: 0 0 16px;">${escapeHtml(description)}</p>
        <section aria-label="서비스 설명" style="margin: 0 0 18px;">
          ${searchSummary}
        </section>
        <nav aria-label="공개 페이지" style="display: flex; flex-wrap: wrap; gap: 10px;">
          ${navLinks}
        </nav>
      </main>
    </noscript>`;
};

const replaceNoscript = (
  html: string,
  title: string,
  description: string,
  routePath: StaticSeoRoutePath,
) =>
  /<noscript>[\s\S]*?<\/noscript>/i.test(html)
    ? html.replace(
        /<noscript>[\s\S]*?<\/noscript>/i,
        renderNoscript(title, description, routePath),
      )
    : html.replace(
        /<body>/i,
        `<body>\n    ${renderNoscript(title, description, routePath)}`,
      );

const renderSeoHtml = (template: string, routePath: StaticSeoRoutePath) => {
  const seo = getIntentAwareRouteSeoConfig(routePath);
  const canonicalUrl = buildCanonicalUrl(seo.canonicalPath);
  let html = template;

  html = html.replace(/<html\s+lang=["'][^"']*["']/i, `<html lang="${escapeHtml(seo.htmlLang ?? "ko")}"`);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  html = replaceMetaName(html, "description", seo.description);
  html = replaceMetaName(html, "robots", seo.robots);
  html = replaceOptionalMetaName(
    html,
    "google-site-verification",
    googleSiteVerification,
  );
  html = replaceOptionalMetaName(
    html,
    "naver-site-verification",
    naverSiteVerification,
  );
  html = replaceMetaName(html, "application-name", PRODUCT_NAME);
  html = replaceMetaName(html, "apple-mobile-web-app-title", PRODUCT_NAME);
  html = replaceCanonicalLink(html, canonicalUrl);
  html = replaceRouteAlternateLinks(html, routePath, canonicalUrl);
  html = replaceMetaProperty(html, "og:site_name", PRODUCT_NAME);
  html = replaceMetaProperty(html, "og:type", "website");
  html = replaceMetaProperty(html, "og:locale", seo.ogLocale ?? "ko_KR");
  html = replaceMetaProperty(html, "og:url", canonicalUrl);
  html = replaceMetaProperty(html, "og:title", seo.title);
  html = replaceMetaProperty(html, "og:description", seo.description);
  html = replaceMetaProperty(html, "og:image", seo.ogImageUrl ?? defaultOgImageUrl);
  html = replaceMetaProperty(
    html,
    "og:image:secure_url",
    seo.ogImageUrl ?? defaultOgImageUrl,
  );
  html = replaceMetaProperty(html, "og:image:type", "image/png");
  html = replaceMetaProperty(html, "og:image:width", String(ogImageWidth));
  html = replaceMetaProperty(html, "og:image:height", String(ogImageHeight));
  html = replaceMetaProperty(
    html,
    "og:image:alt",
    seo.ogImageAlt ?? defaultOgImageAlt,
  );
  html = replaceMetaName(html, "twitter:card", "summary_large_image");
  html = replaceMetaName(html, "twitter:title", seo.title);
  html = replaceMetaName(html, "twitter:description", seo.description);
  html = replaceMetaName(html, "twitter:image", seo.ogImageUrl ?? defaultOgImageUrl);
  html = replaceMetaName(
    html,
    "twitter:image:alt",
    seo.ogImageAlt ?? defaultOgImageAlt,
  );
  html = replaceStructuredData(html, seo.structuredData);
  return replaceNoscript(html, seo.title, seo.description, routePath);
};

const routeOutputPath = (routePath: string) => {
  if (routePath === "/") return indexPath;
  return path.join(
    distDir,
    ...routePath.split("/").filter(Boolean),
    "index.html",
  );
};

const renderSitemap = () => {
  const urls = staticSeoRoutePaths
    .filter((routePath) => {
      const seo = getIntentAwareRouteSeoConfig(routePath);
      return !seo.robots.includes("noindex");
    })
    .map((routePath) => {
      const seo = getIntentAwareRouteSeoConfig(routePath);
      return `  <url>
    <loc>${escapeHtml(buildCanonicalUrl(seo.canonicalPath))}</loc>
    <lastmod>${seoDateModified}</lastmod>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
};

const main = async () => {
  const template = await fs.readFile(indexPath, "utf8");

  for (const routePath of staticSeoRoutePaths) {
    const outputPath = routeOutputPath(routePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, renderSeoHtml(template, routePath), "utf8");
  }

  await fs.writeFile(path.join(distDir, "sitemap.xml"), renderSitemap(), "utf8");

  console.log(
    `prerendered SEO HTML and sitemap for ${staticSeoRoutePaths.length} public routes`,
  );
};

await main();
