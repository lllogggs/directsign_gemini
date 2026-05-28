import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_NAME } from "../src/domain/brand.ts";
import {
  buildCanonicalUrl,
  getIntentAwareRouteSeoConfig,
  staticSeoRoutePaths,
} from "../src/domain/seo.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const indexPath = path.join(distDir, "index.html");
const seoScriptId = "yeollock-seo-jsonld";
const defaultNaverSiteVerification =
  "eea8ff877c8abe42deb35a15e6dbb3e202ee178e";
const naverSiteVerification =
  process.env.NAVER_SITE_VERIFICATION?.trim() ||
  process.env.VITE_NAVER_SITE_VERIFICATION?.trim() ||
  defaultNaverSiteVerification;

const routeLabels: Record<(typeof staticSeoRoutePaths)[number], string> = {
  "/": "홈",
  "/intro/advertiser": "광고주 안내",
  "/intro/influencer": "인플루언서 안내",
  "/privacy": "개인정보 처리방침",
  "/terms": "이용약관",
  "/legal/e-sign-consent": "전자서명 안내",
};

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
    `<meta\\s+(?=[^>]*\\bname=["']${escapeRegex(name)}["'])[^>]*>\\s*`,
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

const renderNoscript = (title: string, description: string) => {
  const navLinks = staticSeoRoutePaths
    .map((route) => {
      const href = route === "/" ? "/" : route;
      return `<a href="${escapeHtml(href)}">${escapeHtml(routeLabels[route])}</a>`;
    })
    .join("\n          ");

  return `<noscript>
      <main lang="ko" style="max-width: 720px; margin: 48px auto; padding: 0 20px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #171717;">
        <h1 style="font-size: 28px; line-height: 1.2; margin: 0 0 12px;">${escapeHtml(title)}</h1>
        <p style="margin: 0 0 16px;">${escapeHtml(description)}</p>
        <nav aria-label="공개 페이지" style="display: flex; flex-wrap: wrap; gap: 10px;">
          ${navLinks}
        </nav>
      </main>
    </noscript>`;
};

const replaceNoscript = (html: string, title: string, description: string) =>
  /<noscript>[\s\S]*?<\/noscript>/i.test(html)
    ? html.replace(/<noscript>[\s\S]*?<\/noscript>/i, renderNoscript(title, description))
    : html.replace(/<body>/i, `<body>\n    ${renderNoscript(title, description)}`);

const renderSeoHtml = (template: string, routePath: string) => {
  const seo = getIntentAwareRouteSeoConfig(routePath);
  const canonicalUrl = buildCanonicalUrl(seo.canonicalPath);
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(seo.title)}</title>`);
  html = replaceMetaName(html, "description", seo.description);
  html = replaceMetaName(html, "robots", seo.robots);
  html = replaceOptionalMetaName(
    html,
    "naver-site-verification",
    naverSiteVerification,
  );
  html = replaceMetaName(html, "application-name", PRODUCT_NAME);
  html = replaceMetaName(html, "apple-mobile-web-app-title", PRODUCT_NAME);
  html = replaceCanonicalLink(html, canonicalUrl);
  html = replaceAlternateLink(html, "ko-KR", canonicalUrl);
  html = replaceAlternateLink(html, "x-default", canonicalUrl);
  html = replaceMetaProperty(html, "og:site_name", PRODUCT_NAME);
  html = replaceMetaProperty(html, "og:type", "website");
  html = replaceMetaProperty(html, "og:locale", "ko_KR");
  html = replaceMetaProperty(html, "og:url", canonicalUrl);
  html = replaceMetaProperty(html, "og:title", seo.title);
  html = replaceMetaProperty(html, "og:description", seo.description);
  html = replaceMetaName(html, "twitter:card", "summary");
  html = replaceMetaName(html, "twitter:title", seo.title);
  html = replaceMetaName(html, "twitter:description", seo.description);
  html = replaceStructuredData(html, seo.structuredData);
  return replaceNoscript(html, seo.title, seo.description);
};

const routeOutputPath = (routePath: string) => {
  if (routePath === "/") return indexPath;
  return path.join(
    distDir,
    ...routePath.split("/").filter(Boolean),
    "index.html",
  );
};

const main = async () => {
  const template = await fs.readFile(indexPath, "utf8");

  for (const routePath of staticSeoRoutePaths) {
    const outputPath = routeOutputPath(routePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, renderSeoHtml(template, routePath), "utf8");
  }

  console.log(
    `prerendered SEO HTML for ${staticSeoRoutePaths.length} public routes`,
  );
};

await main();
