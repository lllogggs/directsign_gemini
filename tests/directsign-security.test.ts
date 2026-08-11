import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatContractTitleForDisplay } from "../src/domain/display";
import {
  getMarketplaceCountryLabel,
  isMarketplaceCountryCode,
  marketplaceCountryFromIso,
  marketplaceCountryOptions,
  type MarketplaceInfluencerProfile,
} from "../src/domain/marketplace";
import { getMarketplaceCampaignApplicationCustomerStatus } from "../src/domain/marketplaceInbox";
import { paginateMarketplaceInfluencerProfiles } from "../src/domain/marketplaceInfluencerSearch";
import {
  normalizeNaverBlogPostDate,
  normalizeNaverBlogPostUrl,
  normalizeNaverBlogRecentPosts,
} from "../src/domain/naverBlogPosts.js";
import { createNaverSearchBudget } from "../scripts/lib/naver-search-budget.mjs";
import {
  buildDiscoveredPublicInfluencerDirectoryRow,
  parsePublicAudienceCountLabel,
  resolvePublicInfluencerDirectoryRows,
} from "../scripts/lib/public-influencer-directory.mjs";
import {
  isRetryableSupabaseAuthFailureStatus,
  isTerminalSupabaseRefreshFailure,
  userSessionAccessMaxAgeSeconds,
  userSessionRefreshMaxAgeSeconds,
  userSessionRefreshReuseCacheMs,
  userSessionRollingDays,
} from "../lib/user-session-policy";
import {
  isActionableInstagramDmManualReview,
  isAwaitingInstagramDmRestoreRecord,
  selectInstagramDmRestoreRecord,
} from "../server/instagram-dm-verification";
import {
  classifyExternalInfluencerSearchEvidence,
  classifyDiscoveredInfluencerAccount,
  normalizeMarketplaceCreatorCategories,
} from "../src/domain/influencerDiscoveryQuality.js";
import {
  buildCanonicalUrl,
  getIntentAwareRouteSeoConfig,
  defaultOgImageUrl,
  ogImageHeight,
  ogImageWidth,
  staticSeoRoutePaths,
} from "../src/domain/seo";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const readRuntimeScriptSources = (directory: string): string =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return [readRuntimeScriptSources(entryPath)];
      if (!entry.isFile() || !/\.(?:[cm]?[jt]s|tsx?|ps1)$/.test(entry.name)) {
        return [];
      }
      if (entryPath.endsWith("kim-jaewoo-guardrails.mjs")) return [];
      return [readFileSync(entryPath, "utf8")];
    })
    .join("\n");
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("yeollock.me security regressions", () => {
  it("keeps public campaign detail routes indexable instead of marking them missing", () => {
    const campaignPath = "/campaigns/4b57fcee-6d4a-4c73-bcb0-3c8e88176158";
    const seo = getIntentAwareRouteSeoConfig(campaignPath);

    assert.equal(seo.title, "캠페인 모집글 - 연락미");
    assert.equal(seo.canonicalPath, campaignPath);
    assert.match(seo.robots, /^index,follow/);
  });

  it("keeps progressive campaign verification out of first-use spotlight copy", () => {
    const dashboard = read("src/pages/marketing/Dashboard.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const tourStart = dashboard.indexOf(
      "const ADVERTISER_CAMPAIGN_TOUR_STEPS",
    );
    const tourEnd = dashboard.indexOf("type ContractSort", tourStart);
    const helperStart = campaignPages.indexOf("const submitHelperText");
    const helperEnd = campaignPages.indexOf(
      "const togglePlatform",
      helperStart,
    );

    assert.notEqual(tourStart, -1);
    assert.notEqual(tourEnd, -1);

    const campaignTour = dashboard.slice(tourStart, tourEnd);
    assert.match(
      campaignTour,
      /여러 인플루언서를 모집할 캠페인 내용과 참여 조건을 작성해 배포합니다/,
    );
    assert.doesNotMatch(campaignTour, /첫\s*2회|3회차|사업자 인증/);

    assert.notEqual(helperStart, -1);
    assert.notEqual(helperEnd, -1);
    const publicationHelper = campaignPages.slice(helperStart, helperEnd);
    assert.match(
      publicationHelper,
      /verificationBlocksPublication[\s\S]*3회차부터 사업자 인증/,
    );
    assert.match(
      publicationHelper,
      /: canSubmit\s*\? "필수 조건이 준비되었습니다\. 공개하면 인플루언서 캠페인 화면에 바로 노출됩니다\."/,
    );
    assert.doesNotMatch(publicationHelper, /가입만으로|현재 \$\{campaignAccess/);
    assert.match(
      campaignPages,
      /verificationBlocksPublication \? \([\s\S]*사업자 인증하기/,
    );
  });

  it("keeps campaign authoring ordered and application consent evidence immutable", () => {
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const marketplace = read("src/domain/marketplace.ts");
    const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
    const landing = read("src/pages/landing/LandingPages.tsx");
    const server = read("server/index.ts");
    const expandMigration = read(
      "supabase/migrations/20260806130000_add_campaign_application_consents.sql",
    );
    const enforcementMigration = read(
      "supabase/migrations/20260806131000_enforce_campaign_application_consents.sql",
    );
    const seedTestAccounts = read("scripts/seed-test-accounts.mjs");
    const seedQaMarketplaceScenario = read(
      "scripts/seed-qa-marketplace-scenario.mjs",
    );
    const creationStart = campaignPages.indexOf(
      "export function AdvertiserCampaignRecruitmentPage",
    );
    const creationEnd = campaignPages.indexOf(
      "export function InfluencerCampaignDiscoveryPage",
      creationStart,
    );
    const checkboxStart = campaignPages.indexOf(
      "function CampaignFormCheckboxOption",
    );
    const checkboxEnd = campaignPages.indexOf(
      "function CampaignDatePicker",
      checkboxStart,
    );
    const discoveryFilterStart = campaignPages.indexOf(
      "function CampaignPlatformFilterList",
    );
    const discoveryFilterEnd = campaignPages.indexOf(
      "function dedupeCampaignsByBrandIdentity",
      discoveryFilterStart,
    );
    const consentDialogStart = campaignPages.indexOf(
      "function CampaignApplicationConsentDialog",
    );
    const consentDialogEnd = campaignPages.indexOf(
      "function CampaignRecruitmentDetailDialog",
      consentDialogStart,
    );

    assert.notEqual(creationStart, -1);
    assert.ok(creationEnd > creationStart);
    assert.notEqual(checkboxStart, -1);
    assert.ok(checkboxEnd > checkboxStart);
    assert.notEqual(discoveryFilterStart, -1);
    assert.ok(discoveryFilterEnd > discoveryFilterStart);
    assert.notEqual(consentDialogStart, -1);
    assert.ok(consentDialogEnd > consentDialogStart);

    const creation = campaignPages.slice(creationStart, creationEnd);
    const checkboxOption = campaignPages.slice(checkboxStart, checkboxEnd);
    const discoveryFilters = campaignPages.slice(
      discoveryFilterStart,
      discoveryFilterEnd,
    );
    const consentDialog = campaignPages.slice(
      consentDialogStart,
      consentDialogEnd,
    );
    const orderedFields = [
      "<CampaignImageUpload",
      '<CampaignField label="캠페인명">',
      '<CampaignField label="플랫폼">',
      '<CampaignField label="광고형태">',
    ].map((marker) => creation.indexOf(marker));

    assert.ok(orderedFields.every((index) => index >= 0));
    assert.ok(
      orderedFields.every(
        (index, position) => position === 0 || orderedFields[position - 1] < index,
      ),
    );
    assert.match(marketplace, /experience_group: "체험단"/);
    assert.match(marketplace, /other: "기타"/);
    assert.match(
      campaignPages,
      /OTHER_CAMPAIGN_TYPE_OPTION_LABEL = "기타\(직접작성\)"/,
    );
    assert.match(creation, /<CampaignField label="광고형태 직접작성">/);
    assert.ok(creation.includes('inputMode="numeric"'));
    assert.ok(creation.includes('pattern="[0-9]*"'));
    assert.ok(creation.includes('.replace(/\\D/g, "")'));
    assert.match(creation, /<CampaignField label="지역">/);
    assert.match(creation, /<CampaignField label="가이드라인">/);
    assert.doesNotMatch(
      creation,
      /<CampaignField label="(?:지역\/진행방식|진행방식|제공상품|참여 미션)">/,
    );

    assert.match(checkboxOption, /type="checkbox"/);
    assert.ok(
      checkboxOption.indexOf('type="checkbox"') <
        checkboxOption.indexOf('<span className="min-w-0 flex-1 truncate">'),
    );
    assert.doesNotMatch(discoveryFilters, /type="checkbox"/);

    assert.match(campaignPages, /function CampaignRequiredConsentEditor/);
    assert.doesNotMatch(campaignPages, /DEFAULT_CAMPAIGN_REQUIRED_CONSENTS/);
    assert.match(
      campaignPages,
      /function createEmptyCampaignForm[\s\S]*?requiredConsents: \[\]/,
    );
    assert.match(creation, /requiredConsents: \[\]/);
    assert.match(campaignPages, /consents\.map\(\(consent, index\) =>/);
    assert.match(campaignPages, /동의 항목 추가/);
    assert.ok(
      (campaignPages.match(/requiredConsents\.length === 0/g) ?? []).length >= 2,
    );
    assert.ok(
      (
        campaignPages.match(
          /submitCampaignApplication\(campaign, \{[\s\S]{0,180}acceptedConsentIds: \[\]/g,
        ) ?? []
      ).length >= 2,
    );
    assert.match(consentDialog, /requiredConsents\.map/);
    assert.match(consentDialog, /"동의합니다"/);
    assert.match(consentDialog, /aria-pressed=\{accepted\}/);
    assert.match(consentDialog, /disabled=\{!allAccepted \|\| isSubmitting\}/);
    assert.match(consentDialog, /disabled:hover:bg-neutral-300/);
    assert.doesNotMatch(campaignPages, /window\.confirm/);
    const consentEditor = campaignPages.slice(
      campaignPages.indexOf("function CampaignRequiredConsentEditor"),
      campaignPages.indexOf("function CampaignFormSelectList"),
    );
    assert.equal(consentEditor.match(/h-9 w-9/g)?.length, 3);
    assert.match(
      marketplacePages,
      /getCampaignProposalTypeDisplayLabel\(campaign\)/,
    );
    assert.match(
      marketplacePages,
      /formatCampaignApplicantLimit\(campaign\.applicantLimit\)/,
    );
    const campaignIntroPreview = landing.slice(
      landing.indexOf("function InfluencerCampaignApplyPreview"),
      landing.indexOf("function InfluencerContractPdfPreview"),
    );
    assert.match(campaignIntroPreview, /신청 동의/);
    assert.match(campaignIntroPreview, /광고주 직접 추가/);
    assert.doesNotMatch(campaignIntroPreview, /4개 항목/);
    assert.match(
      campaignIntroPreview,
      /광고주가 추가한 항목이 있는 캠페인은 각 항목에 동의한 뒤 신청합니다\./,
    );
    assert.equal(campaignIntroPreview.match(/동의 후 신청/g)?.length, 1);
    assert.doesNotMatch(
      campaignIntroPreview,
      /bg-blue-600[^>]*>\s*신청\s*</,
    );

    assert.match(
      server,
      /const buildCampaignConsentVersion[\s\S]*sha256Hex\(JSON\.stringify/,
    );
    assert.match(
      server,
      /createHash\("sha256"\)\.update\(value\)\.digest\("hex"\)/,
    );
    assert.match(server, /requiredConsents: requiredConsentsResult\.items/);
    assert.match(server, /consentVersion: requiredConsentsResult\.version/);
    assert.match(server, /safeEqual\(submittedVersion, expectedVersion\)/);
    assert.match(server, /acceptedIds\.length !== expectedIds\.length/);
    assert.match(
      server,
      /expectedIds\.some\(\(id\) => !acceptedIdSet\.has\(id\)\)/,
    );
    assert.match(server, /application_consent_snapshot: \{/);
    assert.match(
      expandMigration,
      /add column if not exists application_consent_snapshot jsonb/,
    );
    assert.match(
      expandMigration,
      /marketplace_campaign_application_consent_snapshot_guard/,
    );
    assert.match(
      expandMigration,
      /new\.application_consent_snapshot is distinct from old\.application_consent_snapshot/,
    );
    assert.match(expandMigration, /if p_snapshot is null then\s+return true;/);
    assert.doesNotMatch(
      expandMigration,
      /campaign application consent snapshot is required/,
    );
    assert.match(
      enforcementMigration,
      /new\.direction = 'influencer_to_brand'[\s\S]*new\.campaign_id is not null[\s\S]*new\.application_consent_snapshot is null/,
    );
    assert.match(
      enforcementMigration,
      /campaign application consent snapshot is required/,
    );
    assert.match(seedTestAccounts, /application_consent_snapshot: \{/);
    assert.match(seedTestAccounts, /buildSeedCampaignConsentState/);
    assert.match(seedQaMarketplaceScenario, /application_consent_snapshot: \{/);
    assert.match(seedQaMarketplaceScenario, /buildCampaignConsentState/);
    assert.match(
      seedQaMarketplaceScenario,
      /"stale QA campaign applications"/,
    );
    assert.match(
      server,
      /const normalizeCampaignRequiredConsents[\s\S]*if \(!Array\.isArray\(value\)\) return \[\];/,
    );
    assert.match(server, /record\.offer \?\? record\.offeredProduct/);
    assert.match(server, /const mission = normalizeOptionalText\(record\.mission\)/);
  });

  it("moves initial spotlight focus from the dialog container to a tour control", () => {
    const spotlight = read("src/components/ProductSpotlightTour.tsx");

    assert.match(spotlight, /document\.activeElement === tooltip/);
    assert.match(spotlight, /focusTourControl\(tooltip\)/);
  });

  it("keeps the customer-facing product name as 연락미", () => {
    const customerBrandFiles = [
      "src/App.tsx",
      "src/domain/seo.ts",
      "src/pages/auth/SignupPage.tsx",
      "src/pages/landing/GlobalCreatorLandingPage.tsx",
    ];

    for (const path of customerBrandFiles) {
      const source = read(path);
      assert.equal(source.includes("Yeollock"), false, path);
      assert.equal(source.includes("열록"), false, path);
      assert.equal(source.includes("연락미"), true, path);
    }

    const envExample = read(".env.example");
    const server = read("server/index.ts");
    assert.match(envExample, /^PRODUCT_NAME="연락미"$/m);
    assert.match(envExample, /^VITE_PRODUCT_NAME="연락미"$/m);
    assert.match(server, /normalizedConfiguredProductKey === "yeollock\.me"/);
    assert.match(server, /\? "연락미"\s*: normalizedConfiguredProductName/);
  });

  it("does not inject the server-only Gemini API key into the Vite client bundle", () => {
    const viteConfig = read("vite.config.ts");

    assert.equal(viteConfig.includes("process.env.GEMINI_API_KEY"), false);
    assert.equal(viteConfig.includes("env.GEMINI_API_KEY"), false);
  });

  it("keeps private application routes out of search indexing", () => {
    const robots = read("public/robots.txt");

    for (const route of [
      "/admin",
      "/advertiser",
      "/contract",
      "/influencer",
      "/marketing",
    ]) {
      assert.match(robots, new RegExp(`Disallow:\\s*${route}`));
    }
  });

  it("keeps public SEO routes prerendered with unique canonical metadata", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
      headers?: Array<{
        source?: string;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const envExample = read(".env.example");
    const indexHtml = read("index.html");
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const llmsTxt = read("public/llms.txt");
    const prerender = read("scripts/prerender-seo-html.ts");
    const seoSource = read("src/domain/seo.ts");
    const appSource = read("src/App.tsx");
    const rewriteBySource = new Map(
      vercelConfig.rewrites?.map((rewrite) => [
        rewrite.source,
        rewrite.destination,
      ]),
    );
    const headerBySource = new Map(
      vercelConfig.headers?.map((headerConfig) => [
        headerConfig.source,
        new Map(
          headerConfig.headers?.map((header) => [header.key, header.value]),
        ),
      ]),
    );
    const routeTitles = new Set<string>();
    const routeDescriptions = new Set<string>();
    const maxNaverTitleLength = 40;
    const maxNaverDescriptionLength = 80;

    assert.match(
      packageJson.scripts?.build ?? "",
      /scripts\/prerender-seo-html\.ts/,
    );
    assert.match(seoSource, /VITE_PUBLIC_SITE_URL/);
    assert.match(appSource, /VITE_PUBLIC_SITE_URL/);
    assert.match(prerender, /GOOGLE_SITE_VERIFICATION/);
    assert.match(prerender, /google-site-verification/);
    assert.match(prerender, /NAVER_SITE_VERIFICATION/);
    assert.match(prerender, /naver-site-verification/);
    assert.match(prerender, /routeSearchSummaries/);
    assert.match(prerender, /renderSitemap/);
    assert.match(prerender, /summary_large_image/);
    assert.match(indexHtml, /og:image/);
    assert.match(indexHtml, /twitter:image/);
    assert.match(seoSource, /seoResourcePaths/);
    assert.match(appSource, /path="\/resources\/:resourceSlug"/);
    assert.match(llmsTxt, /인플루언서 광고 계약서 가이드/);
    assert.match(llmsTxt, /PPL 계약 검토 체크리스트/);
    assert.match(llmsTxt, /공동구매 계약 가이드/);
    assert.match(llmsTxt, /인스타그램 협찬 계약 가이드/);
    assert.match(llmsTxt, /유튜브 PPL 계약 가이드/);
    assert.match(envExample, /GOOGLE_SITE_VERIFICATION=""/);
    assert.match(envExample, /VITE_GOOGLE_SITE_VERIFICATION=""/);
    assert.match(envExample, /NAVER_SITE_VERIFICATION=""/);
    assert.match(envExample, /VITE_NAVER_SITE_VERIFICATION=""/);
    assert.match(indexHtml, /google-site-verification/);
    assert.match(robots, /User-agent:\s*Yeti/);
    assert.match(robots, /Sitemap:\s*https:\/\/yeollock\.me\/sitemap\.xml/);
    assert.equal(
      headerBySource.get("/robots.txt")?.get("Content-Type"),
      "text/plain; charset=utf-8",
    );
    assert.equal(
      headerBySource.get("/sitemap.xml")?.get("Content-Type"),
      "application/xml; charset=utf-8",
    );
    assert.equal(
      headerBySource.get("/rm-:path*")?.get("X-Robots-Tag"),
      "noindex, nofollow",
    );

    for (const routePath of staticSeoRoutePaths) {
      const seo = getIntentAwareRouteSeoConfig(routePath);
      const canonicalUrl = buildCanonicalUrl(routePath);
      const isLegalNoIndexRoute = [
        "/privacy",
        "/terms",
        "/legal/e-sign-consent",
      ].includes(routePath);

      assert.equal(seo.canonicalPath, routePath);
      if (isLegalNoIndexRoute) {
        assert.equal(seo.robots, "noindex,follow");
        assert.doesNotMatch(
          sitemap,
          new RegExp(`<loc>${escapeRegExp(canonicalUrl)}</loc>`),
        );
      } else {
        assert.match(seo.robots, /^index,follow/);
        assert.match(
          sitemap,
          new RegExp(
            `<loc>${escapeRegExp(canonicalUrl)}</loc>\\s*<lastmod>2026-05-31</lastmod>`,
          ),
        );
      }
      assert.equal(seo.ogImageUrl, defaultOgImageUrl);
      assert.equal(seo.ogImageAlt?.length ? true : false, true);
      assert.ok([...seo.title].length <= maxNaverTitleLength, seo.title);
      assert.ok(
        [...seo.description].length <= maxNaverDescriptionLength,
        seo.description,
      );
      routeTitles.add(seo.title);
      routeDescriptions.add(seo.description);

      if (routePath !== "/") {
        assert.equal(rewriteBySource.get(routePath), `${routePath}/index.html`);
      }
    }

    assert.equal(routeTitles.size, staticSeoRoutePaths.length);
    assert.equal(routeDescriptions.size, staticSeoRoutePaths.length);
    assert.equal(ogImageWidth, 1200);
    assert.equal(ogImageHeight, 630);
  });

  it("applies baseline security headers to Vercel static and API routes", () => {
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      headers?: Array<{
        source?: string;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const globalHeaders = vercelConfig.headers?.find(
      (entry) => entry.source === "/(.*)",
    )?.headers;

    assert.ok(globalHeaders);
    const byKey = new Map(
      globalHeaders.map((header) => [header.key, header.value]),
    );

    assert.equal(byKey.get("X-Content-Type-Options"), "nosniff");
    assert.equal(byKey.get("X-Frame-Options"), "DENY");
    assert.equal(byKey.get("Referrer-Policy"), "no-referrer");
    assert.match(byKey.get("Permissions-Policy") ?? "", /camera=\(\)/);
    assert.match(
      byKey.get("Strict-Transport-Security") ?? "",
      /includeSubDomains/,
    );
    assert.match(
      byKey.get("Content-Security-Policy") ?? "",
      /frame-ancestors 'none'/,
    );
    assert.match(
      byKey.get("Content-Security-Policy") ?? "",
      /img-src 'self' data: blob: https:\/\/\*\.supabase\.co/,
    );
    assert.match(
      byKey.get("Content-Security-Policy") ?? "",
      /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/,
    );
    assert.match(
      byKey.get("Content-Security-Policy") ?? "",
      /script-src 'self' https:\/\/\*\.googletagmanager\.com/,
    );
    assert.match(
      byKey.get("Content-Security-Policy") ?? "",
      /https:\/\/\*\.google-analytics\.com/,
    );
    assert.match(
      byKey.get("Content-Security-Policy") ?? "",
      /https:\/\/\*\.analytics\.google\.com/,
    );
    assert.doesNotMatch(
      byKey.get("Content-Security-Policy") ?? "",
      /clarity\.ms|c\.bing\.com/,
    );
    assert.doesNotMatch(
      byKey.get("Content-Security-Policy") ?? "",
      /script-src[^;]*'unsafe-inline'/,
    );
  });

  it("loads analytics only after consent on fixed public page keys", () => {
    const analytics = read("src/domain/analytics.ts");
    const app = read("src/App.tsx");
    const main = read("src/main.tsx");
    const privacy = read("src/pages/legal/LegalDocumentPage.tsx");
    const envExample = read(".env.example");
    const server = read("server/index.ts");
    const clarityPathsStart = analytics.indexOf("const clarityPublicPaths");
    const clarityPathsEnd = analytics.indexOf(
      "const googleAnalyticsScriptId",
      clarityPathsStart,
    );
    const clarityPathAllowlist = analytics.slice(
      clarityPathsStart,
      clarityPathsEnd,
    );

    assert.match(analytics, /G-PDTVNFRD1W/);
    assert.match(analytics, /wx0bvf6bl5/);
    assert.doesNotMatch(main, /installAnalytics\(\)/);
    assert.match(app, /RouteAnalytics/);
    assert.match(
      app,
      /syncAnalyticsRoute\(location\.pathname, location\.search, location\.hash\)/,
    );

    assert.match(analytics, /allow_google_signals:\s*false/);
    assert.match(analytics, /allow_ad_personalization_signals:\s*false/);
    assert.match(analytics, /analytics_storage:\s*"denied"/);
    assert.match(analytics, /getAnalyticsConsent\(\) !== "granted"/);
    assert.match(analytics, /ad_storage:\s*"denied"/);
    assert.match(analytics, /ad_user_data:\s*"denied"/);
    assert.match(analytics, /ad_personalization:\s*"denied"/);

    assert.match(analytics, /googleAnalyticsPublicPageKeys/);
    assert.match(analytics, /hasUntrustedUrlContext\(search, hash\)/);
    assert.match(
      analytics,
      /VITE_GA_HISTORY_MEASUREMENT_VERIFIED.*=== "true"/,
    );
    assert.match(analytics, /page_key: pageKey/);
    assert.match(analytics, /safeAnalyticsLocation\(pageKey\)/);
    assert.doesNotMatch(analytics, /new URLSearchParams/);
    assert.doesNotMatch(analytics, /document\.title/);
    assert.doesNotMatch(analytics, /page_title:/);
    assert.doesNotMatch(
      analytics,
      /page_location:[\s\S]{0,80}window\.location\.(?:href|pathname|search)/,
    );
    assert.doesNotMatch(analytics, /"\/contract\//);
    assert.doesNotMatch(analytics, /"\/advertiser\/dashboard"/);
    assert.doesNotMatch(analytics, /"\/influencer\/dashboard"/);
    assert.doesNotMatch(analytics, /"\/admin"/);
    assert.match(analytics, /clarityPublicPaths/);
    assert.match(analytics, /data-clarity-mask/);
    assert.match(analytics, /win\.clarity\?\.\("stop"\)/);
    assert.match(
      analytics,
      /export const isMicrosoftClarityCollectionEnabled = \(\) => false/,
    );
    assert.match(analytics, /removeAnalyticsScripts/);
    assert.match(analytics, /expireFirstPartyAnalyticsCookies/);
    assert.doesNotMatch(clarityPathAllowlist, /"\/contract\//);
    assert.doesNotMatch(clarityPathAllowlist, /"\/advertiser\/dashboard"/);
    assert.doesNotMatch(clarityPathAllowlist, /"\/influencer\/dashboard"/);

    assert.match(
      server,
      /script-src 'self' https:\/\/\*\.googletagmanager\.com/,
    );
    assert.doesNotMatch(server, /clarity\.ms|c\.bing\.com/);
    assert.match(
      server,
      /img-src 'self' data: blob: https:\/\/\*\.supabase\.co/,
    );
    assert.match(
      server,
      /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co https:\/\/\*\.google-analytics\.com/,
    );
    assert.match(envExample, /VITE_GOOGLE_ANALYTICS_ID="G-PDTVNFRD1W"/);
    assert.match(envExample, /VITE_MICROSOFT_CLARITY_ID="wx0bvf6bl5"/);
    assert.match(
      envExample,
      /VITE_GA_HISTORY_MEASUREMENT_VERIFIED="false"/,
    );
    assert.match(privacy, /Google Analytics · G-PDTVNFRD1W/);
    assert.match(privacy, /Microsoft Clarity · wx0bvf6bl5/);
    assert.match(privacy, /현재 전송 중지/);
    assert.match(privacy, /공유 토큰/);
    assert.match(privacy, /분석을 허용하기 전에는 스크립트를 불러오지 않/);
  });

  it("keeps raw marketplace rows and private files behind server boundaries", () => {
    const server = read("server/index.ts");
    const privateBucketGuard = server.slice(
      server.indexOf("const ensurePrivateStorageBucket"),
      server.indexOf("const uploadSupabasePrivateFile"),
    );
    const publicBucketGuard = server.slice(
      server.indexOf("const ensureMarketplacePublicStorageBucket"),
      server.indexOf("const uploadSupabaseMarketplacePublicImage"),
    );
    const migration = read(
      "supabase/migrations/20260808110000_harden_public_marketplace_boundaries.sql",
    );

    assert.match(
      migration,
      /revoke select on table[\s\S]+marketplace_influencer_profiles[\s\S]+marketplace_influencer_channels[\s\S]+marketplace_brand_profiles[\s\S]+from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /drop policy if exists marketplace_influencer_profiles_select_public_or_owner/,
    );
    assert.match(migration, /revoke create on schema public/);
    assert.match(privateBucketGuard, /bucket\.public === false/);
    assert.match(privateBucketGuard, /fileSizeLimit === maxVerificationFileSize/);
    assert.match(privateBucketGuard, /evidenceFileMimeTypes/);
    assert.match(
      privateBucketGuard,
      /Supabase private storage bucket security policy mismatch/,
    );
    assert.match(publicBucketGuard, /bucket\.public === true/);
    assert.match(publicBucketGuard, /fileSizeLimit === maxMarketplaceImageSize/);
    assert.match(publicBucketGuard, /marketplaceImageMimeTypes/);
    assert.match(
      publicBucketGuard,
      /Supabase public storage bucket security policy mismatch/,
    );
    assert.doesNotMatch(publicBucketGuard, /bucket\.public === false/);
    assert.match(privateBucketGuard, /ensurePrivateStorageBucket\(false\)/);
    assert.match(
      publicBucketGuard,
      /ensureMarketplacePublicStorageBucket\(false\)/,
    );
    assert.match(migration, /update storage\.buckets[\s\S]+file_size_limit = 10485760/);
    assert.match(server, /storedFile\.bucket !== privateStorageBucket/);
    assert.match(server, /isAllowedPrivateStorageObjectPath/);
    assert.match(server, /path\.relative\(privateFilesRoot, absolutePath\)/);
  });

  it("minimizes operational metadata and private response caching", () => {
    const server = read("server/index.ts");
    const discordPayload = server.slice(
      server.indexOf("const buildDiscordOperationalAlertPayload"),
      server.indexOf("const sendDiscordOperationalAlert"),
    );
    const healthRoute = server.slice(
      server.indexOf('app.get("/api/health"'),
      server.indexOf("type StartLanguageTargetPath"),
    );

    assert.match(server, /app\.disable\("x-powered-by"\)/);
    assert.match(server, /standardJsonParser = express\.json\(\{ limit: "256kb" \}\)/);
    assert.match(server, /largeUploadJsonParser = express\.json\(\{ limit: "14mb" \}\)/);
    assert.match(server, /largeUploadPreBodyMaxRequests = 30/);
    assert.match(server, /largeUploadPreBodyMaxTrackedNetworks = 5_000/);
    assert.match(server, /declaredLength > largeUploadBodyLimitBytes/);
    assert.match(server, /operationalErrorLabel/);
    assert.match(server, /instagramWebhookJsonParser = express\.json\(\{/);
    assert.match(server, /request\.path === "\/api\/webhooks\/instagram"/);
    assert.match(discordPayload, /고객 정보는 외부 알림에 포함하지 않습니다/);
    assert.doesNotMatch(discordPayload, /alert\.body/);
    assert.doesNotMatch(discordPayload, /alert\.mobile_path/);
    assert.match(healthRoute, /response\.json\(\{ ok: true \}\)/);
    assert.doesNotMatch(healthRoute, /supabase_schema_version|admin_auth_configured/);
    assert.match(
      server,
      /app\.get\("\/api\/influencer\/dashboard"[\s\S]{0,220}Cache-Control", "private, no-store"/,
    );
  });

  it("bundles a Korean-capable font for server-signed PDFs", () => {
    const server = read("server/index.ts");
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      functions?: Record<string, { includeFiles?: string }>;
    };

    assert.match(server, /public", "fonts", "NanumMyeongjo-Regular\.ttf"/);
    assert.match(server, /public", "fonts", "NanumMyeongjo-Bold\.ttf"/);
    assert.match(
      vercelConfig.functions?.["api/index.ts"]?.includeFiles ?? "",
      /public\/fonts\/\*\*/,
    );
    assert.match(
      vercelConfig.functions?.["api/index.ts"]?.includeFiles ?? "",
      /dist\/index\.html/,
    );
    assert.ok(
      statSync(join(root, "public/fonts/NanumMyeongjo-Regular.ttf")).size >
        1_000_000,
    );
    assert.ok(
      statSync(join(root, "public/fonts/NanumMyeongjo-Bold.ttf")).size >
        1_000_000,
    );
  });

  it("keeps marketplace follower sync server-only and automatically disabled", () => {
    const server = read("server/index.ts");
    const envExample = read(".env.example");
    const migration = read(
      "supabase/migrations/20260518044009_add_marketplace_follower_sync.sql",
    );
    const registeredChannelMigration = read(
      "supabase/migrations/20260807110000_materialize_registered_verified_channels.sql",
    );
    const registeredDirectoryMigration = read(
      "supabase/migrations/20260806120000_add_registered_influencer_discovery.sql",
    );
    const registeredMetricRefreshMigration = read(
      "supabase/migrations/20260807120000_scope_influencer_directory_refresh_to_profile_type.sql",
    );
    const boundedMetricWriteMigration = read(
      "supabase/migrations/20260807130000_remove_synchronous_registered_metric_refresh_trigger.sql",
    );
    const boundedRegisteredTriggerMigration = read(
      "supabase/migrations/20260807140000_bound_registered_channel_trigger_to_identity_changes.sql",
    );
    const instagramDmFollowerMigration = read(
      "supabase/migrations/20260807150000_apply_instagram_dm_follower_metric.sql",
    );
    const verifiedPlatformMetricMigration = read(
      "supabase/migrations/20260807160000_apply_verified_platform_channel_metrics.sql",
    );
    const instagramDmStart = server.indexOf(
      "const fetchInstagramDmSenderProfile",
    );
    const instagramDmSource = server.slice(
      instagramDmStart,
      server.indexOf("const latestVerificationForTarget", instagramDmStart),
    );
    const youtubeAutomationStart = server.indexOf(
      "const runYoutubeAutomationCheck",
    );
    const naverAutomationStart = server.indexOf(
      "const runNaverBlogAutomationCheck",
    );
    const instagramAutomationStart = server.indexOf(
      "const runInstagramAutomationCheck",
    );
    const tiktokAutomationStart = server.indexOf(
      "const runTikTokAutomationCheck",
    );
    const platformAutomationStart = server.indexOf(
      "const runPlatformAccountAutomationCheck",
    );
    const youtubeAutomationSource = server.slice(
      youtubeAutomationStart,
      naverAutomationStart,
    );
    const naverAutomationSource = server.slice(
      naverAutomationStart,
      instagramAutomationStart,
    );
    const tiktokAutomationSource = server.slice(
      tiktokAutomationStart,
      platformAutomationStart,
    );
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };

    assert.equal(
      vercelConfig.crons?.some(
        (cron) => cron.path === "/api/cron/sync-marketplace-followers",
      ),
      false,
    );
    assert.ok(
      vercelConfig.crons?.some(
        (cron) =>
          cron.path === "/api/cron/ops-alerts" &&
          cron.schedule === "0 17 * * *",
      ),
    );
    assert.match(envExample, /CRON_SECRET=""/);
    assert.match(
      envExample,
      /ENABLE_AUTOMATIC_MARKETPLACE_FOLLOWER_SYNC="false"/,
    );
    assert.doesNotMatch(envExample, /MARKETPLACE_NAVER_BLOG_VISITOR_SYNC/);
    assert.match(
      server,
      /const cronSecret = readConfiguredServerSecret\("CRON_SECRET"\)/,
    );
    assert.match(server, /requireCronRequest/);
    assert.match(server, /safeEqual\(token, cronSecret\)/);
    assert.match(server, /\/api\/cron\/sync-marketplace-followers/);
    assert.match(
      server,
      /process\.env\.ENABLE_AUTOMATIC_MARKETPLACE_FOLLOWER_SYNC === "true"/,
    );
    assert.match(server, /AUTOMATIC_INFLUENCER_COLLECTION_DISABLED/);
    assert.match(server, /runMarketplaceFollowerSync/);
    assert.match(server, /marketplace_follower_sync_runs/);
    assert.match(server, /marketplace_follower_sync_events/);
    assert.match(server, /follower_count_synced_at/);
    assert.match(server, /clearPublicMarketplaceCache\(\)/);
    assert.doesNotMatch(server, /NVisitorgp4Ajax\.nhn/);
    assert.doesNotMatch(server, /naver_blog_public_visitor_counter/);
    assert.doesNotMatch(server, /stored_4_day_average/);
    assert.doesNotMatch(server, /getNaverBlogVisitorTargetDates/);
    assert.match(
      migration,
      /alter table public\.marketplace_influencer_channels[\s\S]+follower_count/,
    );
    assert.match(migration, /marketplace_follower_sync_runs/);
    assert.match(migration, /marketplace_follower_sync_events/);
    assert.match(migration, /enable row level security/);
    assert.match(
      migration,
      /revoke all on table[\s\S]+from public, anon, authenticated;/,
    );
    assert.match(
      migration,
      /grant select, insert, update on table[\s\S]+to service_role;/,
    );
    assert.doesNotMatch(migration, /grant[\s\S]+to anon;/);
    assert.match(
      registeredChannelMigration,
      /directsign_materialize_registered_member_channels/,
    );
    assert.match(
      registeredChannelMigration,
      /create trigger verification_requests_materialize_registered_member_channels/,
    );
    assert.match(
      registeredChannelMigration,
      /request_row\.status::text = 'approved'/,
    );
    assert.match(
      registeredChannelMigration,
      /request_row\.data_origin = 'production'/,
    );
    assert.doesNotMatch(registeredChannelMigration, /grant[\s\S]+to anon;/);
    assert.match(
      registeredMetricRefreshMigration,
      /v_is_published is distinct from true/,
    );
    assert.match(
      registeredMetricRefreshMigration,
      /directsign_refresh_registered_member_discovery/,
    );
    assert.match(
      registeredMetricRefreshMigration,
      /marketplace_influencer_channels_sync_registered_member_directory/,
    );
    assert.doesNotMatch(registeredMetricRefreshMigration, /grant[\s\S]+to anon;/);
    assert.match(
      boundedMetricWriteMigration,
      /drop trigger if exists marketplace_influencer_channels_sync_registered_member_directory/,
    );
    assert.match(
      boundedMetricWriteMigration,
      /drop function if exists[\s\S]+directsign_sync_registered_member_directory_from_channel/,
    );
    assert.match(
      boundedRegisteredTriggerMigration,
      /update of profile_id, platform, handle, url/,
    );
    assert.doesNotMatch(
      boundedRegisteredTriggerMigration,
      /update of profile_id, platform, handle, url, follower_count/,
    );
    assert.ok(instagramDmStart >= 0);
    assert.match(
      instagramDmSource,
      /url\.searchParams\.set\("fields", "id,username,follower_count"\)/,
    );
    assert.match(instagramDmSource, /normalizeInstagramFollowerCount/);
    assert.match(instagramDmSource, /follower_count_source: "instagram_user_profile_api"/);
    assert.match(instagramDmSource, /readVerifiedInstagramDmFollowerCount/);
    assert.match(instagramDmSource, /await clearPublicMarketplaceCache\(\)/);
    assert.doesNotMatch(instagramDmSource, /runMarketplaceFollowerSync/);
    assert.doesNotMatch(instagramDmSource, /business_discovery|media\{/i);
    assert.doesNotMatch(server, /requestedBy: "platform_verification"/);
    assert.doesNotMatch(server, /requestedBy: "influencer_profile_publish"/);
    assert.doesNotMatch(server, /syncRegisteredMarketplaceDirectoryMetrics/);
    assert.match(
      instagramDmFollowerMigration,
      /directsign_apply_approved_instagram_dm_follower_metric/,
    );
    assert.match(
      instagramDmFollowerMigration,
      /directsign_is_operational_profile\([\s\S]+?'influencer'/,
    );
    assert.doesNotMatch(
      instagramDmFollowerMigration,
      /create or replace function directsign_private\.directsign_materialize_registered_member_channels/,
    );
    assert.match(
      instagramDmFollowerMigration,
      /v_request\.profile_id is distinct from v_target_profile_id[\s\S]+owner binding mismatch/,
    );
    assert.match(
      instagramDmFollowerMigration,
      /jsonb_typeof\([\s\S]+?follower_count/,
    );
    assert.match(instagramDmFollowerMigration, /is distinct from 'number'/);
    assert.match(
      instagramDmFollowerMigration,
      /coalesce\(v_follower_text, ''\) !~ /,
    );
    assert.match(instagramDmFollowerMigration, /9007199254740991/);
    assert.match(instagramDmFollowerMigration, /v_channel_id uuid/);
    assert.match(
      instagramDmFollowerMigration,
      /lower\(regexp_replace\(btrim\(channel\.handle\), '\^@\+', ''\)\) = v_handle[\s\S]+limit 1[\s\S]+for update/,
    );
    assert.match(instagramDmFollowerMigration, /follower_count = v_follower_count/);
    assert.match(instagramDmFollowerMigration, /where channel\.id = v_channel_id/);
    assert.match(instagramDmFollowerMigration, /follower_count_checked_at/);
    assert.match(
      instagramDmFollowerMigration,
      /follower_sync_source = 'instagram_user_profile_api'/,
    );
    assert.match(
      instagramDmFollowerMigration,
      /directsign_refresh_registered_member_discovery\(/,
    );
    assert.match(
      instagramDmFollowerMigration,
      /new\.ownership_verification_method::text = 'instagram_dm_code'[\s\S]+directsign_apply_approved_instagram_dm_follower_metric/,
    );
    assert.match(
      registeredDirectoryMigration,
      /'follower_count', enriched\.follower_count[\s\S]+v_audience_counts,[\s\S]+v_max_audience_count/,
    );
    assert.match(
      registeredDirectoryMigration,
      /jsonb_object_agg\([\s\S]+per_platform\.follower_count[\s\S]+select max\(follower_count\) from per_platform/,
    );
    assert.doesNotMatch(instagramDmFollowerMigration, /grant[\s\S]+to anon;/);
    assert.match(
      server,
      /const channelMetric = buildVerifiedPlatformChannelMetric\([\s\S]+platformAccessTokenProvided: Boolean\(platformAccessToken\)/,
    );
    assert.match(server, /channel_api_succeeded: channelResponse\.ok/);
    assert.match(server, /oauth_token_source: submittedUserAccessToken/);
    assert.match(server, /user_info_api_succeeded: userInfoApiSucceeded/);
    assert.match(
      youtubeAutomationSource,
      /videoProofMatched && videoTitleMatched/,
    );
    assert.match(
      youtubeAutomationSource,
      /videoProofMatched && videoDescriptionMatched/,
    );
    assert.doesNotMatch(
      naverAutomationSource,
      /const expectedBlogId\s*=[^;]*extractNaverBlogId\(proofUrl\)/,
    );
    assert.match(
      naverAutomationSource,
      /bindOwnershipStatusToSubmittedIdentity/,
    );
    assert.doesNotMatch(
      naverAutomationSource,
      /ownership_check: publicChallenge/,
    );
    assert.match(
      tiktokAutomationSource,
      /bindOwnershipStatusToSubmittedIdentity/,
    );
    assert.doesNotMatch(
      tiktokAutomationSource,
      /ownership_check: publicChallenge/,
    );
    assert.match(
      server,
      /publicProofHandle === expectedHandle[\s\S]+const matched =[\s\S]+channelDescriptionMatched \|\| videoProofMatched \|\| publicProofMatched/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /directsign_apply_approved_platform_channel_metric/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /v_request\.profile_id is distinct from v_target_profile_id[\s\S]+owner binding mismatch/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /directsign_is_operational_profile\([\s\S]+?'influencer'/,
    );
    assert.match(verifiedPlatformMetricMigration, /9007199254740991/);
    assert.match(
      verifiedPlatformMetricMigration,
      /pg_catalog\.pg_advisory_xact_lock/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /when v_platform = 'naver_blog' then[\s\S]+self_reported_channel_metric/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /when 'naver_blog' then 'average_daily_visitors_4d'[\s\S]+when 'naver_blog' then 'creator_self_report'/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /coalesce\(v_metric ->> 'trust', ''\) <> 'self_reported'[\s\S]+coalesce\(v_metric ->> 'period_days', ''\) <> '4'/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /v_metric_status = 'unavailable'[\s\S]+follower_count = null/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /v_checked_at >= channel\.follower_count_synced_at/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /coalesce\([\s\S]+channel\.follower_sync_metadata[\s\S]+\|\| jsonb_strip_nulls/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /new\.platform::text in \('youtube', 'tiktok', 'naver_blog'\)[\s\S]+directsign_apply_approved_platform_channel_metric/,
    );
    assert.match(
      verifiedPlatformMetricMigration,
      /evidence_snapshot_json[\s\S]+on public\.verification_requests/,
    );
    assert.doesNotMatch(verifiedPlatformMetricMigration, /NVisitorgp4Ajax/);
    assert.doesNotMatch(verifiedPlatformMetricMigration, /grant[\s\S]+to anon;/);
  });

  it("keeps Naver visitor collection out of discovery while isolating the application-only cache", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const agents = read("AGENTS.md");
    const server = read("server/index.ts");
    const runtimeScripts = readRuntimeScriptSources(join(root, "scripts"));
    const influencerVerification = read(
      "src/pages/influencer/InfluencerVerification.tsx",
    );
    const marketplaceDomain = read("src/domain/marketplace.ts");
    const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
    const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const applicationMetric = read("server/naver-blog-visitor-metric.ts");
    const influencerCredential = read("server/naver-influencer-credential.ts");
    const eligibilityMigration = read(
      "supabase/migrations/20260811120000_add_campaign_eligibility_rules.sql",
    );
    const removedCollectorPath = join(
      root,
      "scripts",
      "sync-discovered-naver-blog-visitors.mjs",
    );
    const removedVisitorParserPath = join(
      root,
      "src",
      "domain",
      "naverBlogVisitors.js",
    );
    const forbiddenRuntimeCollector =
      /naver_blog_public_visitor_counter|sync-discovered-naver-blog-visitors/;

    assert.equal(existsSync(removedCollectorPath), false);
    assert.equal(existsSync(removedVisitorParserPath), false);
    assert.equal(packageJson.scripts?.["sync:naver-blog-visitors"], undefined);
    assert.doesNotMatch(JSON.stringify(packageJson.scripts ?? {}), forbiddenRuntimeCollector);
    assert.doesNotMatch(server, forbiddenRuntimeCollector);
    assert.doesNotMatch(runtimeScripts, forbiddenRuntimeCollector);
    assert.doesNotMatch(runtimeScripts, /NVisitorgp4Ajax/);
    assert.match(
      applicationMetric,
      /https:\/\/blog\.naver\.com\/NVisitorgp4Ajax\.nhn/,
    );
    assert.match(applicationMetric, /redirect: "error"/);
    assert.match(applicationMetric, /MAX_RESPONSE_BYTES = 64 \* 1024/);
    assert.match(applicationMetric, /NAVER_BLOG_VISITOR_WINDOW_DAYS = 4/);
    assert.match(
      eligibilityMigration,
      /create table if not exists directsign_private\.campaign_naver_application_metrics/,
    );
    assert.match(eligibilityMigration, /alter table directsign_private\.campaign_naver_application_metrics force row level security/);
    assert.match(
      eligibilityMigration,
      /revoke all on table directsign_private\.campaign_naver_application_metrics[\s\S]+from public, anon, authenticated/,
    );
    assert.match(eligibilityMigration, /interval '30 days'/);

    assert.doesNotMatch(
      influencerVerification,
      /naver_blog_recent_4d_average_visitors|최근 4일 평균 일일 방문자 수/,
    );
    assert.doesNotMatch(
      server,
      /Naver Blog visitor report is required|buildNaverBlogSelfReportedChannelMetric|self_reported_channel_metric: selfReportedChannelMetric/,
    );
    assert.doesNotMatch(
      marketplaceDomain,
      /metricType\?: "average_daily_visitors_4d"|metricTrust\?: "self_reported"/,
    );
    assert.doesNotMatch(marketplacePages, /SelfReportedMetricBadge|>\s*자가신고\s*</);
    assert.match(campaignPages, /label: "인플루언서"/);
    assert.match(campaignPages, /label: "일방문자 수"/);
    assert.doesNotMatch(
      campaignPages,
      /인플루언서와 일방문자 수는 둘 중 하나만 적용됩니다/,
    );
    assert.match(campaignPages, /네이버 인플루언서가 맞습니다/);
    assert.match(campaignPages, /본인[\s\S]+확인은 1년간 보관/);
    assert.match(campaignPages, /본인 확인 · 직접 확인 필요/);
    assert.match(advertiserDashboard, /자동 확인됨/);
    assert.match(advertiserDashboard, /본인 확인 · 직접 확인 필요/);
    assert.match(advertiserDashboard, /네이버에서 확인/);
    assert.match(advertiserDashboard, /rel="noreferrer noopener"/);
    assert.match(advertiserDashboard, /"채널 지표"/);
    assert.doesNotMatch(advertiserDashboard, /"구독자\/팔로워수"/);
    assert.match(
      server,
      /state\.selfAttestation[\s\S]+isCredentialActiveAt\(state\.selfAttestation\.expiresAt\)[\s\S]+evidenceType: "self_attested"/,
    );
    assert.match(
      server,
      /check\?\.status === "not_linked" \|\| check\?\.status === "not_found"[\s\S]+code: "condition_not_met"/,
    );
    assert.match(
      server,
      /code: "naver_influencer_check_unavailable"[\s\S]+self_attestation_challenge/,
    );
    assert.match(
      server,
      /application_eligibility_snapshot:[\s\S]+items: eligibility\.evidence/,
    );
    assert.match(
      influencerCredential,
      /NAVER_INFLUENCER_ORIGIN = "https:\/\/in\.naver\.com"/,
    );
    assert.match(influencerCredential, /redirect: "manual"/);
    assert.match(influencerCredential, /status: "unavailable"/);
    assert.match(
      eligibilityMigration,
      /create table if not exists directsign_private\.naver_influencer_qualifications[\s\S]+expires_at = checked_at \+ interval '1 year'/,
    );
    assert.match(
      eligibilityMigration,
      /create table if not exists directsign_private\.naver_influencer_self_attestations[\s\S]+expires_at = attested_at \+ interval '1 year'/,
    );
    assert.match(
      eligibilityMigration,
      /get_active_naver_influencer_badges[\s\S]+from directsign_private\.naver_influencer_qualifications/,
    );
    assert.doesNotMatch(
      eligibilityMigration.slice(
        eligibilityMigration.indexOf("create or replace function public.get_active_naver_influencer_badges"),
        eligibilityMigration.indexOf("create or replace function public.cleanup_naver_influencer_credentials"),
      ),
      /naver_influencer_self_attestations/,
    );
    const reviewUpdateStart = server.indexOf(
      "const updateVerificationRequestReview = async",
    );
    const automationUpdateStart = server.indexOf(
      "const updateVerificationRequestAutomation = async",
    );
    const reviewUpdateSource = server.slice(
      reviewUpdateStart,
      automationUpdateStart,
    );
    const automationUpdateSource = server.slice(
      automationUpdateStart,
      server.indexOf("const rerunVerificationAutomation", automationUpdateStart),
    );
    assert.match(
      reviewUpdateSource,
      /shouldInvalidateApprovedPlatformChannelCache\([\s\S]+updatedRecord[\s\S]+shouldInvalidateApprovedPlatformChannelCache\([\s\S]+existingRecord/,
    );
    assert.match(
      automationUpdateSource,
      /shouldInvalidateApprovedPlatformChannelCache\([\s\S]+savedRecord[\s\S]+shouldInvalidateApprovedPlatformChannelCache\([\s\S]+record/,
    );
    assert.match(
      agents,
      /sole Product Owner-approved exception is an on-demand campaign-application eligibility check[\s\S]+private 30-day cache/,
    );
    assert.match(
      agents,
      /no Naver visitor value may enter discovery, public profile, `audience_counts`, `max_audience_count`, or global channel-size sorting/,
    );
  });

  it("stages influencer collection in local XLSX and uploads changed rows at most every 12 hours", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const agents = read("AGENTS.md");
    const gitignore = read(".gitignore");
    const collector = read("scripts/discover-korean-influencers.mjs");
    const collectorMain = collector.slice(
      collector.indexOf("async function main()"),
      collector.indexOf("const isMainModule"),
    );
    const loop = read("scripts/run-influencer-discovery-loop.mjs");
    const startScript = read("scripts/start-influencer-discovery-loop.ps1");
    const uploader = read("scripts/upload-influencer-discovery-batch.mjs");
    const queue = read("scripts/lib/influencer-discovery-queue.mjs");

    assert.match(
      agents,
      /collection runs must not read from or write to Supabase/,
    );
    assert.match(agents, /gitignored local XLSX staging workbook/);
    assert.match(agents, /at most once every 12 hours/);
    assert.match(
      agents,
      /automatic collection and its coupled batch-upload checks are disabled by default/,
    );
    assert.match(gitignore, /^data\/$/m);
    assert.match(collector, /requestedApply \|\| storageMode === "supabase"/);
    assert.doesNotMatch(collector, /allow-direct-supabase/);
    assert.match(collectorMain, /stageInfluencerDiscoveryWorkbook/);
    assert.doesNotMatch(collectorMain, /reserveExistingHandles\(/);
    assert.doesNotMatch(collectorMain, /upsertSupabaseRows\(/);
    assert.doesNotMatch(
      collector,
      /fetchAllSupabaseRows\([\s\S]{0,220}\.catch\(\(\) => \[\]\)/,
    );
    assert.match(loop, /"--apply=false"/);
    assert.match(loop, /storage !== "local-xlsx"/);
    assert.match(loop, /upload-influencer-discovery-batch\.mjs/);
    assert.match(
      loop,
      /args\.get\("enable-automatic-collection"\) === "true"/,
    );
    assert.match(loop, /if \(!automaticCollectionEnabled\)/);
    assert.ok(
      loop.indexOf("if (!automaticCollectionEnabled)") <
        loop.indexOf("main().catch"),
    );
    assert.doesNotMatch(loop, /"--apply=true"/);
    assert.doesNotMatch(loop, /sync-discovered-naver-blog-visitors\.mjs/);
    assert.match(startScript, /\[switch\]\$EnableAutomaticCollection/);
    assert.match(startScript, /if \(-not \$EnableAutomaticCollection\)/);
    assert.ok(
      startScript.indexOf("if (-not $EnableAutomaticCollection)") <
        startScript.indexOf("Start-Process"),
    );
    assert.match(startScript, /--enable-automatic-collection=true/);
    assert.match(startScript, /--storage=local-xlsx/);
    assert.match(startScript, /--upload-interval-hours=12/);
    assert.doesNotMatch(startScript, /--apply=true/);
    assert.match(uploader, /MINIMUM_UPLOAD_INTERVAL_HOURS = 12/);
    assert.match(
      uploader,
      /Math\.max\([\s\S]{0,100}MINIMUM_UPLOAD_INTERVAL_HOURS/,
    );
    assert.match(uploader, /isInfluencerBatchDue/);
    assert.match(uploader, /onlyChanged:\s*true/);
    assert.match(uploader, /uploaderSession/);
    assert.match(
      collector,
      /assertInfluencerUploaderSession\(uploaderSession\)/,
    );
    assert.match(collector, /state\?\.lastSupabaseAccessAt !== authorizedIso/);
    assert.match(collector, /state\?\.lastAttemptedBatchId !== batchId/);
    assert.match(
      collector,
      /upsertSupabaseRows[\s\S]{0,220}assertInfluencerUploaderSession\(uploaderSession\)/,
    );
    assert.match(uploader, /archiveInfluencerBatch/);
    assert.doesNotMatch(uploader, /sync-discovered-naver-blog-visitors\.mjs/);
    assert.match(queue, /t="inlineStr"/);
    assert.match(queue, /\.partial/);
    assert.match(queue, /Pending queue workbook changed after snapshot/);
    assert.match(
      packageJson.scripts?.["upload:influencers:batch"] ?? "",
      /upload-influencer-discovery-batch\.mjs/,
    );
    assert.match(
      packageJson.scripts?.test ?? "",
      /influencer-discovery-queue\.test\.ts/,
    );
  });

  it("keeps the automatic influencer loop inert without the dedicated opt-in flag", () => {
    const directory = mkdtempSync(join(tmpdir(), "yeollock-disabled-loop-"));
    try {
      const result = spawnSync(
        process.execPath,
        [join(process.cwd(), "scripts", "run-influencer-discovery-loop.mjs")],
        {
          cwd: directory,
          encoding: "utf8",
          timeout: 5_000,
        },
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /automatic collection is disabled/i);
      assert.equal(result.signal, null);
      assert.deepEqual(readdirSync(directory), []);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps Naver recent post titles, links, and dates bound and safe", () => {
    const posts = normalizeNaverBlogRecentPosts(
      [
        {
          title: "<b>두 번째</b> 게시물",
          url: "http://blog.naver.com/example/2#section",
          publishedDate: "20260713",
        },
        {
          title: "첫 번째 게시물",
          link: "https://m.blog.naver.com/example/1",
          postdate: "2026-07-12",
        },
        {
          title: "중복 게시물",
          url: "https://blog.naver.com/example/2",
          publishedDate: "20260711",
        },
        {
          title: "외부 링크",
          url: "https://example.com/not-naver",
          publishedDate: "20260714",
        },
      ],
      3,
    );

    assert.deepEqual(posts, [
      {
        title: "두 번째 게시물",
        url: "https://blog.naver.com/example/2",
        publishedDate: "2026-07-13",
      },
      {
        title: "첫 번째 게시물",
        url: "https://m.blog.naver.com/example/1",
        publishedDate: "2026-07-12",
      },
    ]);
    assert.equal(normalizeNaverBlogPostDate("20260230"), "");
    assert.equal(normalizeNaverBlogPostUrl("javascript:alert(1)"), "");

    const collector = read("scripts/discover-korean-influencers.mjs");
    const countryRepair = read("scripts/repair-influencer-country-data.mjs");
    const server = read("server/index.ts");
    const marketplace = read("src/pages/marketplace/MarketplacePages.tsx");
    const naverCollectorSource = collector.slice(
      collector.indexOf("async function collectNaverBlogCandidates"),
      collector.indexOf("const reservedInstagramHandles"),
    );
    assert.match(collector, /recentPosts/);
    assert.match(collector, /naverSorts/);
    assert.doesNotMatch(
      collector,
      /platform:\s*"naver_blog"[\s\S]{0,900}audience_countries:\s*\["south_korea"\]/,
    );
    assert.doesNotMatch(naverCollectorSource, /inferCreatorCountries/);
    assert.match(naverCollectorSource, /confidence:\s*"unknown"/);
    assert.match(countryRepair, /naver_search_not_creator_country_evidence/);
    assert.match(server, /normalizeNaverBlogRecentPosts/);
    assert.match(marketplace, /최근 확인 게시물/);
    assert.match(marketplace, /rel="noreferrer"/);
  });

  it("caps every Naver search path in one KST-daily 80 percent ledger", async () => {
    const directory = mkdtempSync(join(tmpdir(), "yeollock-naver-budget-"));
    const statePath = join(directory, "usage.json");
    try {
      const budget = createNaverSearchBudget({
        statePath,
        dailyLimit: 10,
        budgetRatio: 0.8,
        now: () => new Date("2026-07-14T12:00:00+09:00"),
      });
      for (let index = 0; index < 8; index += 1) {
        const result = await budget.reserveRequest(
          index % 2 === 0 ? "/v1/search/blog.json" : "/v1/search/webkr.json",
        );
        assert.equal(result.allowed, true);
      }
      const exhausted = await budget.reserveRequest("/v1/search/blog.json");
      assert.equal(exhausted.allowed, false);
      assert.equal(exhausted.reason, "budget_exhausted");
      assert.equal(exhausted.cap, 8);
      assert.equal(exhausted.used, 8);
      assert.equal(exhausted.remaining, 0);

      writeFileSync(statePath, "{not-json", "utf8");
      const corrupt = await budget.snapshot();
      assert.equal(corrupt.allowed, false);
      assert.equal(corrupt.reason, "corrupt_state");
      assert.equal(corrupt.used, 8);

      const collector = read("scripts/discover-korean-influencers.mjs");
      const curator = read("scripts/curate-influencer-marketplace.mjs");
      const server = read("server/index.ts");
      const envExample = read(".env.example");
      assert.match(collector, /reserveNaverSearchRequest/);
      assert.match(curator, /reserveNaverSearchRequest/);
      const naverVerificationStart = server.indexOf(
        "const runNaverBlogAutomationCheck",
      );
      const naverVerificationSource = server.slice(
        naverVerificationStart,
        server.indexOf(
          "const runInstagramAutomationCheck",
          naverVerificationStart,
        ),
      );
      assert.match(
        naverVerificationSource,
        /reserveNaverSearchRequest\("blog"\)/,
      );
      assert.match(naverVerificationSource, /if \(!reservation\.allowed\)/);
      assert.match(envExample, /NAVER_SEARCH_DAILY_LIMIT="25000"/);
      assert.match(envExample, /NAVER_SEARCH_DAILY_BUDGET_RATIO="0\.8"/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps influencer discovery totals exact across fixed 100-row pages", () => {
    const makeProfile = (
      id: string,
      overrides: Partial<MarketplaceInfluencerProfile> = {},
    ): MarketplaceInfluencerProfile => ({
      id,
      handle: id,
      displayName: id,
      headline: `${id} headline`,
      bio: `${id} bio`,
      location: "국가 미확인",
      avatarLabel: id.slice(0, 1),
      categories: ["content"],
      audience: "1,000명",
      audienceTags: [],
      platforms: [
        {
          platform: "instagram",
          label: "인스타그램",
          handle: id,
          url: `https://www.instagram.com/${id}`,
          followersLabel: "1,000명",
          performanceLabel: "공개 지표 확인",
        },
      ],
      collaborationTypes: ["sponsored_post"],
      startingPriceLabel: "협의",
      responseTimeLabel: "협의",
      verifiedLabel: "공개 계정",
      brandFit: [],
      recentBrands: [],
      portfolio: [],
      proposalHints: [],
      ...overrides,
    });
    const profiles = [
      makeProfile("alpha", {
        displayName: "알파 뷰티",
        categories: ["beauty"],
        audienceCountries: ["south_korea"],
      }),
      makeProfile("beta", {
        categories: ["beauty"],
        audienceCountries: ["south_korea"],
        platforms: [
          {
            platform: "youtube",
            label: "유튜브",
            handle: "beta",
            url: "https://www.youtube.com/@beta",
            followersLabel: "2,000명",
            performanceLabel: "공개 지표 확인",
          },
        ],
      }),
      makeProfile("gamma", {
        categories: ["tech"],
        audienceCountries: ["japan"],
        platforms: [
          {
            platform: "instagram",
            label: "인스타그램",
            handle: "gamma",
            url: "https://www.instagram.com/gamma",
            followersLabel: "3,000명",
            performanceLabel: "공개 지표 확인",
          },
          {
            platform: "youtube",
            label: "유튜브",
            handle: "gamma",
            url: "https://www.youtube.com/@gamma",
            followersLabel: "3,000명",
            performanceLabel: "공개 지표 확인",
          },
        ],
      }),
      makeProfile("delta", {
        categories: ["travel"],
        platforms: [
          {
            platform: "naver_blog",
            label: "네이버 블로그",
            handle: "delta",
            url: "https://blog.naver.com/delta",
            followersLabel: "공개 지표 확인",
            performanceLabel: "공개 지표 확인",
          },
        ],
      }),
      makeProfile("epsilon", {
        categories: ["fashion"],
        audienceCountries: ["taiwan"],
        platforms: [
          {
            platform: "tiktok",
            label: "틱톡",
            handle: "epsilon",
            url: "https://www.tiktok.com/@epsilon",
            followersLabel: "5,000명",
            performanceLabel: "공개 지표 확인",
          },
        ],
      }),
    ];

    const first = paginateMarketplaceInfluencerProfiles(profiles, {
      limit: 2,
      offset: 0,
    });
    const second = paginateMarketplaceInfluencerProfiles(profiles, {
      limit: 2,
      offset: 2,
    });
    const last = paginateMarketplaceInfluencerProfiles(profiles, {
      limit: 2,
      offset: 4,
    });
    const beyondEnd = paginateMarketplaceInfluencerProfiles(profiles, {
      limit: 2,
      offset: 9,
    });
    assert.deepEqual(
      [first.total, second.total, last.total, beyondEnd.total],
      [5, 5, 5, 5],
    );
    assert.deepEqual(
      [first.profiles.length, second.profiles.length, last.profiles.length],
      [2, 2, 1],
    );
    assert.deepEqual(
      [first.hasMore, second.hasMore, last.hasMore, beyondEnd.hasMore],
      [true, true, false, false],
    );
    assert.equal(beyondEnd.profiles.length, 0);

    assert.equal(
      paginateMarketplaceInfluencerProfiles(profiles, {
        limit: 10,
        offset: 0,
        platform: "youtube",
      }).total,
      2,
    );
    assert.equal(
      paginateMarketplaceInfluencerProfiles(profiles, {
        limit: 10,
        offset: 0,
        categories: ["beauty"],
      }).total,
      2,
    );
    assert.equal(
      paginateMarketplaceInfluencerProfiles(profiles, {
        limit: 10,
        offset: 0,
        countries: ["south_korea"],
      }).total,
      2,
    );
    assert.equal(
      paginateMarketplaceInfluencerProfiles(profiles, {
        limit: 10,
        offset: 0,
        platform: "youtube",
        categories: ["beauty"],
        countries: ["south_korea"],
      }).total,
      1,
    );
    assert.equal(
      paginateMarketplaceInfluencerProfiles(profiles, {
        limit: 10,
        offset: 0,
        search: "알파",
      }).total,
      1,
    );
    assert.equal(
      paginateMarketplaceInfluencerProfiles(profiles, {
        limit: 10,
        offset: 0,
        categories: ["beauty", "tech"],
      }).total,
      3,
    );
    assert.equal(
      paginateMarketplaceInfluencerProfiles(profiles, {
        limit: 10,
        offset: 0,
        countries: ["south_korea", "japan"],
      }).total,
      3,
    );
    assert.equal(
      paginateMarketplaceInfluencerProfiles([profiles[0], profiles[2]], {
        limit: 10,
        offset: 0,
        categories: ["beauty"],
      }).total,
      1,
    );

    const directorySizedProfiles = Array.from({ length: 243 }, (_, index) =>
      makeProfile(`creator-${String(index + 1).padStart(3, "0")}`),
    );
    const directoryFirstPage = paginateMarketplaceInfluencerProfiles(
      directorySizedProfiles,
      { limit: 100, offset: 0 },
    );
    const directorySecondPage = paginateMarketplaceInfluencerProfiles(
      directorySizedProfiles,
      { limit: 100, offset: 100 },
    );
    const directoryLastPage = paginateMarketplaceInfluencerProfiles(
      directorySizedProfiles,
      { limit: 100, offset: 200 },
    );
    assert.deepEqual(
      [directoryFirstPage.total, directorySecondPage.total, directoryLastPage.total],
      [243, 243, 243],
    );
    assert.deepEqual(
      [
        directoryFirstPage.profiles.length,
        directorySecondPage.profiles.length,
        directoryLastPage.profiles.length,
      ],
      [100, 100, 43],
    );
    assert.equal(
      new Set(
        [
          ...directoryFirstPage.profiles,
          ...directorySecondPage.profiles,
          ...directoryLastPage.profiles,
        ].map((profile) => profile.id),
      ).size,
      243,
    );

    const server = read("server/index.ts");
    const marketplace = read("src/pages/marketplace/MarketplacePages.tsx");
    const agents = read("AGENTS.md");
    const directoryMigration = read(
      "supabase/migrations/20260804100000_add_public_influencer_directory.sql",
    );
    assert.match(server, /readMarketplaceInfluencerSearchFilters/);
    assert.match(server, /rpc\/list_marketplace_influencers/);
    assert.match(server, /const marketplaceInfluencerPageSize = 100/);
    assert.match(server, /readIndexedMarketplaceInfluencerPage/);
    assert.match(server, /hydrateMarketplaceInfluencerDirectoryReferences/);
    assert.doesNotMatch(server, /readMarketplaceInfluencerProfileCollection/);
    assert.doesNotMatch(server, /readDiscoveredInfluencerProfiles/);
    assert.match(
      server,
      /response\.setHeader\("Cache-Control", "private, no-store"\)/,
    );
    assert.match(server, /p_saved_only: savedOnly/);
    assert.match(server, /p_organization_id: organizationId \?\? null/);
    assert.match(directoryMigration, /create table[^;]+marketplace_public_influencer_directory/is);
    assert.match(directoryMigration, /create or replace function public\.list_marketplace_influencers/is);
    assert.match(directoryMigration, /p_page_size integer default 100/);
    assert.match(directoryMigration, /p_page_size is distinct from 100/);
    assert.match(directoryMigration, /count\(\*\)/);
    assert.match(directoryMigration, /p_saved_only/);
    assert.match(directoryMigration, /p_organization_id/);
    assert.match(directoryMigration, /grant execute[^;]+to service_role/is);
    assert.doesNotMatch(directoryMigration, /grant execute[^;]+to (?:anon|authenticated)/is);
    assert.doesNotMatch(server, /\.filter\(Boolean\)\s*\.slice\(0, 12\)/);
    assert.match(marketplace, /total: influencerTotal/);
    assert.match(marketplace, /const marketplaceInfluencerPageSize = 100/);
    assert.match(marketplace, /searchParams\.set\("page", String\(page\)\)/);
    assert.match(marketplace, /searchParams\.set\("sort", influencerSort\)/);
    assert.match(marketplace, /searchParams\.append\("category", category\)/);
    assert.match(marketplace, /searchParams\.append\("country", country\)/);
    assert.match(marketplace, /const desktopPages = getInfluencerPaginationWindow\([\s\S]*?10,[\s\S]*?\);/);
    assert.match(marketplace, /const mobilePages = getInfluencerPaginationWindow\([\s\S]*?5,[\s\S]*?\);/);
    assert.match(marketplace, /aria-current=\{isCurrent \? "page" : undefined\}/);
    assert.match(marketplace, /aria-label="이전 페이지"/);
    assert.match(marketplace, /aria-label="다음 페이지"/);
    assert.doesNotMatch(marketplace, /new IntersectionObserver/);
    assert.doesNotMatch(marketplace, /InfluencerLoadMoreMarker/);
    assert.doesNotMatch(marketplace, /compareInfluencerProfilesBySort/);
    assert.match(marketplace, /data-discovery-total-count/);
    assert.match(marketplace, /총 \$\{count\.toLocaleString\(\)\}건/);
    assert.match(
      agents,
      /authoritative server-side numbered pagination with exactly 100 eligible discovery entries/,
    );
    assert.doesNotMatch(marketplace, /count=\{filteredProfiles\.length\}/);
    assert.doesNotMatch(
      marketplace,
      /setSavedHandles\(next\);\s*setRevision\(/,
    );
    assert.match(
      marketplace,
      /if \(!response\.ok\) throw new Error\("Saved influencer update failed"\);[\s\S]+const canonicalHandle =[\s\S]+replaceSavedHandles\(confirmedSaved\);\s*if \(mountedRef\.current\) \{\s*setRevision\(/,
    );
  });

  it("publishes only consented email-confirmed minimal influencer profiles and keeps discovery private", () => {
    const server = read("server/index.ts");
    const marketplace = read("src/pages/marketplace/MarketplacePages.tsx");
    const migration = read(
      "supabase/migrations/20260806120000_add_registered_influencer_discovery.sql",
    );
    const minimalProfileMigration = read(
      "supabase/migrations/20260807180000_publish_minimal_influencer_profiles.sql",
    );
    const discoveryRoute = server.slice(
      server.indexOf('app.get("/api/marketplace/influencers"'),
      server.indexOf('app.get("/api/advertiser/saved-influencers"'),
    );
    const proposalRoute = server.slice(
      server.indexOf('"/api/marketplace/influencers/:handle/proposals"'),
      server.indexOf('"/api/marketplace/brands/:handle/proposals"'),
    );
    const publicDetailRoute = server.slice(
      server.indexOf('app.get("/api/marketplace/influencers/:handle"'),
      server.indexOf('app.get("/api/marketplace/brands"'),
    );
    const profilePublish = server.slice(
      server.indexOf("const upsertInfluencerPublicProfile"),
      server.indexOf("const submitInfluencerPublicHandleAppeal"),
    );

    assert.match(
      migration,
      /create table if not exists public\.marketplace_registered_influencer_directory/,
    );
    assert.match(migration, /registered_identity_only boolean[\s\S]+default false/);
    assert.match(
      migration,
      /marketplace_influencer_profiles_registered_handle_owner/,
    );
    assert.match(migration, /'rm-' \|\| left\(md5\(owner_profile_id::text\), 27\)/);
    assert.match(migration, /registered_member_visibility = 'authenticated_advertisers'/);
    assert.match(migration, /auth\.uid\(\)/);
    assert.match(migration, /auth\.role\(\) is distinct from 'authenticated'/);
    assert.match(migration, /membership\.role::text in \('owner', 'admin', 'marketer'\)/);
    assert.match(migration, /p_page_size is distinct from 100/);
    assert.match(
      migration,
      /revoke all on table public\.marketplace_registered_influencer_directory[\s\S]+from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function public\.list_authenticated_marketplace_influencers[\s\S]+to authenticated/,
    );
    assert.doesNotMatch(
      migration,
      /grant execute on function public\.list_authenticated_marketplace_influencers[\s\S]+to anon/,
    );
    assert.match(
      migration,
      /A creator's audience market is not evidence of the creator's own country/,
    );
    assert.doesNotMatch(migration, /v_marketplace_profile\.audience_countries/);
    assert.match(migration, /v_creator_countries := '\{\}'::text\[\]/);
    assert.match(migration, /v_country_display_label := '국가 미확인'/);
    assert.match(
      migration,
      /set influencer_public_handle = registered_member\.registered_handle/,
    );
    const registeredMemberRefresh = migration.slice(
      migration.indexOf(
        "create or replace function directsign_private.directsign_refresh_registered_member_discovery",
      ),
      migration.indexOf(
        "create or replace function public.resolve_marketplace_saved_influencer_handle",
      ),
    );
    assert.match(
      registeredMemberRefresh,
      /jsonb_array_elements\(v_verified_channels\)[\s\S]+discovered\.platform_handle/,
    );
    assert.match(
      registeredMemberRefresh,
      /insert into public\.advertiser_saved_influencers[\s\S]+v_registered_handle[\s\S]+on conflict \(organization_id, influencer_public_handle\) do nothing/,
    );
    assert.match(
      registeredMemberRefresh,
      /with removed_alias_saves as \([\s\S]+delete from public\.advertiser_saved_influencers as saved[\s\S]+any\(v_saved_alias_handles\)[\s\S]+returning/,
    );
    assert.match(
      registeredMemberRefresh,
      /pg_advisory_xact_lock\([\s\S]+directsign:marketplace-saved-influencer:/,
    );
    assert.match(
      migration,
      /create or replace function public\.resolve_marketplace_saved_influencer_handle/,
    );
    assert.match(
      migration,
      /join lateral jsonb_array_elements\(registered_member\.verified_channels\)[\s\S]+verified_channel\.value ->> 'platform' = discovered\.platform::text[\s\S]+btrim\(discovered\.platform_handle\)/,
    );
    assert.match(
      migration,
      /revoke all on function\s+public\.resolve_marketplace_saved_influencer_handle\(text\)\s+from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function\s+public\.resolve_marketplace_saved_influencer_handle\(text\)\s+to service_role/,
    );
    assert.match(
      migration,
      /join auth\.users as auth_user[\s\S]+auth_user\.id = candidate\.id/,
    );
    assert.match(migration, /auth_user\.raw_app_meta_data/);
    assert.match(migration, /auth_user\.raw_user_meta_data/);
    assert.match(migration, /qa_account\|seeded\|is_test\|test_data/);
    const atomicSavedMutation = migration.slice(
      migration.indexOf(
        "create or replace function public.mutate_marketplace_saved_influencer",
      ),
      migration.indexOf(
        "create or replace function directsign_private.directsign_sync_registered_member_profile",
      ),
    );
    assert.match(
      atomicSavedMutation,
      /pg_advisory_xact_lock\([\s\S]+directsign:marketplace-saved-influencer:/,
    );
    assert.match(
      atomicSavedMutation,
      /resolve_marketplace_saved_influencer_handle\(v_requested_handle\)[\s\S]+insert into public\.advertiser_saved_influencers[\s\S]+delete from public\.advertiser_saved_influencers/,
    );
    assert.match(
      migration,
      /revoke all on function public\.mutate_marketplace_saved_influencer\([\s\S]+\) from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function public\.mutate_marketplace_saved_influencer\([\s\S]+\) to service_role/,
    );

    assert.match(discoveryRoute, /requireAdvertiserSession\(request, response\)/);
    assert.match(discoveryRoute, /readAuthenticatedMarketplaceInfluencerPage/);
    assert.match(discoveryRoute, /accessToken: advertiserAuth\.accessToken/);
    assert.match(
      discoveryRoute,
      /AuthenticatedInfluencerDirectoryAccessError[\s\S]+hasActiveAdvertiserOrganizationMembership\(\{[\s\S]+profileId: advertiserAuth\.profile\.id[\s\S]+organizationId: organization\.id[\s\S]+readIndexedMarketplaceInfluencerPage\(\{[\s\S]+organizationId: organization\.id/,
    );
    assert.doesNotMatch(
      discoveryRoute,
      /error: "인플루언서 탐색 권한이 없습니다\."/,
    );
    assert.match(
      server,
      /rpcResponse\.status === 403[\s\S]+\.clone\(\)[\s\S]+accessError\.code === "42501"[\s\S]+accessError\.message === "authenticated production advertiser profile required"/,
    );
    assert.match(
      server,
      /const confirmedAt = auth\.user\.email_confirmed_at \?\? auth\.user\.confirmed_at;[\s\S]+await syncProfileEmailVerifiedAt\(auth\.user\);[\s\S]+email_verified_at: confirmedAt/,
    );
    assert.match(
      server,
      /const hasActiveAdvertiserOrganizationMembership =[\s\S]+role=in\.\(owner,admin,marketer\)[\s\S]+organization_type=eq\.advertiser&deleted_at=is\.null[\s\S]+memberships\.length > 0 && organizations\.length > 0/,
    );
    assert.match(
      server,
      /rpcResponse\.status === 403[\s\S]+\.clone\(\)[\s\S]+accessError\.code === "42501"[\s\S]+accessError\.message === "authenticated production advertiser profile required"/,
    );
    assert.match(
      server,
      /const confirmedAt = auth\.user\.email_confirmed_at \?\? auth\.user\.confirmed_at;[\s\S]+await syncProfileEmailVerifiedAt\(auth\.user\);[\s\S]+email_verified_at: confirmedAt/,
    );
    assert.match(discoveryRoute, /Cache-Control", "private, no-store/);
    assert.doesNotMatch(discoveryRoute, /sendPublicMarketplaceJson/);
    const authenticatedRestHelper = server.slice(
      server.indexOf("const fetchSupabaseAsUser"),
      server.indexOf("const assertSupabaseOk"),
    );
    assert.match(authenticatedRestHelper, /supabaseAuthHeaders\(accessToken\)/);
    assert.match(authenticatedRestHelper, /cache: "no-store"/);
    assert.match(server, /rpc\/list_authenticated_marketplace_influencers/);
    assert.match(server, /readRegisteredMarketplaceInfluencerByStableHandle/);
    assert.match(server, /readAdvertiserVisibleMarketplaceInfluencerByHandle/);
    assert.match(server, /rpc\/mutate_marketplace_saved_influencer/);
    const savedInfluencerMutationRoutes = server.slice(
      server.indexOf('"/api/advertiser/saved-influencers/:handle"'),
      server.indexOf('app.get("/api/marketplace/influencers/:handle"'),
    );
    assert.equal(
      savedInfluencerMutationRoutes.match(
        /mutateAdvertiserSavedInfluencer\(\{/g,
      )?.length,
      2,
    );
    assert.doesNotMatch(
      savedInfluencerMutationRoutes,
      /upsertSupabaseV2Rows\(\s*"advertiser_saved_influencers"/,
    );
    assert.doesNotMatch(
      savedInfluencerMutationRoutes,
      /deleteSupabaseV2Rows\(\s*"advertiser_saved_influencers"/,
    );
    assert.match(marketplace, /const canonicalHandle =/);
    assert.match(marketplace, /confirmedSaved\.delete\(canonicalHandle\)/);
    assert.match(marketplace, /confirmedSaved\.add\(canonicalHandle\)/);
    assert.doesNotMatch(
      marketplace,
      /primaryChannelUrl \?\? getInfluencerProfilePath\(profile\)/,
    );
    assert.match(
      marketplace,
      /const profileActionHref =[\s\S]+canOpenPublicProfile \? getInfluencerProfilePath\(profile\) : undefined/,
    );
    assert.match(marketplace, /프로필 준비 전/);
    assert.match(proposalRoute, /target\.marketplaceProfileId/);
    assert.match(proposalRoute, /target_influencer_profile_id: target\.marketplaceProfileId/);
    assert.match(
      publicDetailRoute,
      /readPublicMarketplaceInfluencerProfileByHandle/,
    );
    assert.doesNotMatch(publicDetailRoute, /readRegisteredMarketplaceInfluencerByStableHandle/);

    assert.match(minimalProfileMigration, /public_profile_consent_at/);
    assert.match(minimalProfileMigration, /auth_user\.email_confirmed_at is not null/);
    assert.match(
      minimalProfileMigration,
      /create or replace function public\.directsign_publish_minimal_influencer_profile/,
    );
    assert.match(minimalProfileMigration, /public_index_enabled = false/);
    assert.match(minimalProfileMigration, /ownership_status = 'verified'/);
    assert.match(
      minimalProfileMigration,
      /create or replace function directsign_private\.directsign_prune_nonindexed_profile_directory\(\)/,
    );
    assert.match(
      minimalProfileMigration,
      /create or replace function directsign_private\.directsign_prune_nonindexed_channel_directory\(\)/,
    );
    assert.match(
      minimalProfileMigration,
      /zz_marketplace_channels_prune_nonindexed_directory[\s\S]+directsign_prune_nonindexed_channel_directory\(\)/,
    );
    assert.match(minimalProfileMigration, /'running_yaho'/);
    assert.match(minimalProfileMigration, /v_follower_count is distinct from 178/);

    assert.match(profilePublish, /storedProfileRow\?\.id \?\? stableUuid/);
    assert.match(profilePublish, /let handle = existingProfile\.handle/);
    assert.match(
      profilePublish,
      /const shouldPromoteHandle =[\s\S]+const automaticHandleConflict =[\s\S]+findInfluencerPublicHandleConflict/,
    );
    assert.match(profilePublish, /registered_identity_only: false/);
    assert.match(
      profilePublish,
      /storedProfileRow && storedProfileRow\.registered_identity_only !== true/,
    );
    assert.match(
      server,
      /const readStoredInfluencerPublicProfile[\s\S]+profile\.registered_identity_only === true/,
    );
    assert.match(
      server,
      /target_influencer_profile_id=in\.\$\{postgrestInFilter\([\s\S]+publicProfileIds/,
    );
  });

  it("builds one deterministic eligible influencer directory", () => {
    const sharedHandle = "shared.creator";
    const discovered = {
      id: "11111111-1111-4111-8111-111111111111",
      platform: "instagram",
      public_handle: sharedHandle,
      platform_handle: `@${sharedHandle}`,
      display_name: "공개 크리에이터",
      headline: "뷰티와 라이프스타일",
      bio: "일상을 기록합니다",
      categories: ["뷰티"],
      audience_countries: ["south_korea"],
      audience_tags: ["20대"],
      follower_count: 12_345,
      followers_label: "1.2만명",
      quality_score: 92,
      status: "active",
      updated_at: "2026-08-04T00:00:00.000Z",
    };
    const discoveredRow = buildDiscoveredPublicInfluencerDirectoryRow(discovered);
    assert.ok(discoveredRow);
    assert.equal(discoveredRow.max_audience_count, 12_345);
    assert.deepEqual(discoveredRow.platforms, ["instagram"]);
    assert.equal(parsePublicAudienceCountLabel("구독자 2.4만명"), 24_000);
    assert.equal(
      buildDiscoveredPublicInfluencerDirectoryRow({
        ...discovered,
        id: "22222222-2222-4222-8222-222222222222",
        public_handle: "hidden.creator",
        status: "hidden",
      }),
      null,
    );

    const resolved = resolvePublicInfluencerDirectoryRows({
      registeredProfiles: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          public_handle: sharedHandle,
          display_name: "가입 크리에이터",
          categories: ["뷰티"],
          audience_countries: ["south_korea"],
          is_published: true,
          data_origin: "production",
          updated_at: "2026-08-04T00:00:00.000Z",
        },
      ],
      registeredChannels: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          profile_id: "33333333-3333-4333-8333-333333333333",
          platform: "instagram",
          handle: `@${sharedHandle}`,
          follower_count: 50_000,
          updated_at: "2026-08-04T00:00:00.000Z",
        },
      ],
      discoveredProfiles: [discovered],
    });
    assert.equal(resolved.rows.length, 1);
    assert.equal(resolved.rows[0]?.source_type, "registered");
    assert.equal(resolved.summary.handle_conflicts.length, 1);
  });

  it("keeps influencer discovery independent-creator only with organization-scoped saves", () => {
    const server = read("server/index.ts");
    const marketplace = read("src/pages/marketplace/MarketplacePages.tsx");
    const collector = read("scripts/discover-korean-influencers.mjs");
    const curator = read("scripts/curate-influencer-marketplace.mjs");
    const migration = read(
      "supabase/migrations/20260713020000_add_advertiser_saved_influencers.sql",
    );

    assert.match(
      marketplace,
      /<span[^>]*>관심<\/span>[\s\S]*<span>국가<\/span>[\s\S]*<span>플랫폼<\/span>[\s\S]*<span>카테고리<\/span>[\s\S]*<span>인플루언서<\/span>[\s\S]*<span>채널 지표<\/span>/,
    );

    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        follower_count: 2_000_001,
      }).excluded,
      true,
    );
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "hv_nara",
          display_name: "권나라",
          follower_count: 1_622_069,
        },
        [
          {
            title: "권나라, 블랙 필라테스룩",
            description:
              "배우 권나라가 자신의 인스타그램(@hv_nara)에 공개했다.",
            link: "https://example.com/hv_nara",
          },
        ],
      )?.type,
      "celebrity",
    );
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "sample_sunmi_archive",
          display_name: "선미 SUNMI",
          follower_count: 600_000,
        },
        [
          {
            title: "Sunmi - profile",
            description:
              "Lee Sun-mi, known mononymously as Sunmi, is a South Korean singer and songwriter.",
            link: "https://example.com/sunmi",
          },
        ],
        { trustTitleAlias: true },
      )?.type,
      "celebrity",
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "sample_actor_profile",
        display_name: "Sample Profile",
        bio: "Actor / Actress based in Seoul",
      }).excluded,
      true,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "slow.and",
        display_name: "슬로우앤드",
      }).excluded,
      true,
    );
    for (const entertainmentAccount of [
      "r_yuhyeju",
      "stellakimofficial",
      "yyyoungggggg",
    ]) {
      assert.equal(
        classifyDiscoveredInfluencerAccount({
          platform: "instagram",
          platform_handle: entertainmentAccount,
          follower_count: 600_000,
        }).excluded,
        true,
      );
    }
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "yesstyle",
          display_name: "YesStyle | K-Beauty & Fashion",
          follower_count: 1_989_008,
        },
        [
          {
            title: "YesStyle - Beauty & Fashion App",
            description: "Download by YESSTYLE.COM LIMITED on the App Store.",
            link: "https://apps.example.com/yesstyle",
          },
        ],
      )?.type,
      "business",
    );
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "kyutaeoppa",
          display_name: "Kyutae Oppa",
          follower_count: 1_941_090,
        },
        [
          {
            title: "Kyutae Oppa",
            description: "유튜브 크리에이터의 Instagram: kyutaeoppa",
            link: "https://youtube.com/kyutaeoppa",
          },
        ],
      ),
      undefined,
    );
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "sample_actor_93",
          display_name: "김연수",
          follower_count: 500_000,
        },
        [
          {
            title: "배우 김연수 새 프로필 공개",
            description: "김연수가 드라마 출연 소식을 알렸다.",
            link: "https://example.com/profile",
          },
        ],
        { trustTitleAlias: true },
      )?.type,
      "celebrity",
    );
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "xfactorgolf_angma",
          display_name: "앙마원장",
          follower_count: 400_000,
        },
        [
          {
            title: "앙마원장 Instagram profile",
            description: "골프 레슨 콘텐츠를 만드는 크리에이터",
            link: "https://example.com/xfactorgolf_angma",
          },
        ],
      ),
      undefined,
    );
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "palhosquare",
          display_name: "팔호광장",
          follower_count: 80_000,
        },
        [
          {
            title: "정신과 심리 만화 by 팔호광장",
            description: "심리학을 배우면서 치유하는 웹툰입니다.",
            link: "https://example.com/palhosquare",
          },
        ],
      ),
      undefined,
    );
    for (const reviewedCreator of [
      {
        handle: "chae.on",
        name: "chae.on",
        evidence:
          "인스타그램 @chae.on 님, 작성자 주식회사 아이밀의 협업 게시물",
      },
      {
        handle: "crazy_greapa",
        name: "크레이지 그레빠",
        evidence:
          "크레이지 그레빠의 사업자등록번호와 대표자 정보를 조회합니다.",
      },
      {
        handle: "friendshiping94",
        name: "우정잉",
        evidence: "인터넷 방송인 우정잉의 가수 데뷔 뮤직비디오",
      },
      {
        handle: "haroni_kim",
        name: "포토그래퍼 하로니",
        evidence: "배우 프로필 촬영을 진행하는 포토그래퍼 하로니",
      },
      {
        handle: "jinsu_jung",
        name: "SNS국가대표 정진수 강사",
        evidence: "SNS국가대표 정진수 강사의 인스타그램 마케팅 강의",
      },
      {
        handle: "9th_london",
        name: "김태희 | 나인언니",
        evidence: "배우 김태희 관련 뉴스와 이름이 같은 패션 크리에이터",
      },
      {
        handle: "seon_h_e",
        name: "seon_h_e",
        evidence: "동명이인 배우 자료와 무관한 여행 크리에이터",
      },
      {
        handle: "songsukjung",
        name: "포토그래퍼 송석정",
        evidence: "패션 브랜드 룩북과 화보 촬영을 진행하는 포토그래퍼",
      },
      {
        handle: "swim_hyunlee",
        name: "현이쌤",
        evidence: "전 국가대표 상비군 출신 수영 교육 크리에이터",
      },
      {
        handle: "uglynoeuly",
        name: "못생긴 노을이",
        evidence: "초등 래퍼 노을이와 만난 반려동물 크리에이터",
      },
      {
        handle: "uroi.home",
        name: "유로이홈 | 조가영",
        evidence:
          "유로이홈 님의 공간입니다. 운영사 주식회사 버킷플레이스 사업자등록번호 119-86-91245",
      },
      {
        handle: "engtoontv",
        name: "잉툰TV",
        evidence: "만화로 배우는 영어 콘텐츠를 만드는 교육 크리에이터",
      },
      {
        handle: "jinbaekofficial",
        name: "백진경 Jin Baek",
        evidence: "영국 라이프스타일 숏폼을 만드는 독립 크리에이터",
      },
    ]) {
      assert.equal(
        classifyExternalInfluencerSearchEvidence(
          {
            platform: "instagram",
            platform_handle: reviewedCreator.handle,
            display_name: reviewedCreator.name,
            follower_count: 500_000,
          },
          [
            {
              title: reviewedCreator.name,
              description: reviewedCreator.evidence,
              link: `https://example.com/${reviewedCreator.handle}`,
            },
          ],
        ),
        undefined,
      );
    }
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "8garak",
          display_name: "팔가락",
          follower_count: 120_000,
        },
        [
          {
            title: "팔가락 님의 작품",
            description:
              "수영 국가대표가 양궁 선수에게 프러포즈하는 웹툰 이야기입니다.",
            link: "https://example.com/artist/8garak",
          },
        ],
      ),
      undefined,
    );
    assert.equal(
      classifyExternalInfluencerSearchEvidence(
        {
          platform: "instagram",
          platform_handle: "amelia_tantono",
          display_name: "Amelia Tantono",
          follower_count: 500_000,
        },
        [
          {
            title: "국내 중소기업 제품을 소개하는 아멜리카노샵",
            description:
              "니즈앤주식회사가 운영하며 크리에이터 Amelia Tantono가 한국 문화를 소개한다.",
            link: "https://example.com/amelia_tantono",
          },
        ],
      ),
      undefined,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "sample_brand_official",
      }).excluded,
      true,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "jinbaekofficial",
        source_evidence: {
          accountCuration: {
            type: "business",
            reason: "verified_external_review",
          },
        },
      }).excluded,
      false,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "olympic",
        display_name: "올림픽",
      }).excluded,
      true,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "goxnniee",
        display_name: "김고은",
      }).excluded,
      true,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "bts_updates_daily",
        display_name: "BTS archive",
        bio: "Fan account dedicated to BTS",
      }).excluded,
      true,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "bts__jungk00k",
        display_name: "JUNGKOOK",
      }).excluded,
      true,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        platform_handle: "felix_straykids",
        display_name: "STRAY KIDS FELIX",
      }).excluded,
      true,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        display_name: "장재식",
        bio: "건강검진 병원 이사, 일상과 운동 기록",
      }).excluded,
      false,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        display_name: "JINJO BBOY SKIM 김헌준",
        headline: "엔터테인먼트 Instagram creator",
        bio: "Business inquiries: creator@example.com",
      }).excluded,
      false,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        display_name: "궁뜰안주인 | 곤지암리조트맛집",
      }).excluded,
      false,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        display_name: "룰루미뇽 | 여행 맛집 숙소 호텔",
      }).excluded,
      false,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        source_evidence: {
          accountCuration: {
            type: "celebrity",
            reason: "wikidata_instagram_display_name",
          },
        },
      }).excluded,
      false,
    );
    assert.equal(
      classifyDiscoveredInfluencerAccount({
        platform: "instagram",
        source_evidence: {
          accountCuration: {
            type: "celebrity",
            reason: "wikidata_instagram_handle",
          },
        },
      }).excluded,
      true,
    );
    assert.deepEqual(
      normalizeMarketplaceCreatorCategories({
        categories: ["홈카페", "레시피"],
      }),
      ["맛집"],
    );
    assert.deepEqual(
      normalizeMarketplaceCreatorCategories({
        display_name: "잉툰TV | 만화로 배우는 영어",
        categories: ["반려동물"],
      }),
      ["교육"],
    );
    assert.deepEqual(
      normalizeMarketplaceCreatorCategories({
        display_name: "흥둥이 홈트 윤쌤",
        categories: ["맛집"],
      }),
      ["건강·운동"],
    );
    assert.deepEqual(
      normalizeMarketplaceCreatorCategories({
        display_name: "게임 크리에이터 민준",
        categories: ["리빙"],
      }),
      ["게임"],
    );
    assert.match(collector, /existingSameId\?\.status === "hidden"/);
    assert.match(curator, /queryWikidataAccountTypes/);
    assert.match(server, /savedOnlyQuery === "true"/);
    assert.match(server, /requireAdvertiserSession/);
    assert.match(server, /readAdvertiserSavedInfluencerRows/);
    assert.match(marketplace, /function InfluencerInterestButton/);
    assert.match(marketplace, /function InfluencerInterestScope/);
    assert.match(marketplace, /aria-pressed=\{isSaved\}/);
    assert.match(marketplace, /관심 인플루언서 추가/);
    assert.match(marketplace, /mobileOnly/);
    assert.match(
      marketplace,
      /useAdvertiserSavedInfluencers\(advertiserShellMode === "authenticated"\)/,
    );
    assert.doesNotMatch(marketplace, /저장한 인플루언서|저장한 계정만/);
    assert.match(marketplace, /searchPlaceholder="카테고리 검색"/);
    assert.match(
      migration,
      /primary key \(organization_id, influencer_public_handle\)/,
    );
    assert.match(migration, /enable row level security/);
    assert.match(
      migration,
      /revoke all[\s\S]+from public, anon, authenticated;/,
    );
    assert.match(migration, /to service_role;/);
  });

  it("keeps mobile operations alerts server-only and Discord-ready", () => {
    const server = read("server/index.ts");
    const app = read("src/App.tsx");
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const envExample = read(".env.example");
    const migration = read(
      "supabase/migrations/20260610003213_create_operational_alert_events.sql",
    );
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };

    assert.ok(
      vercelConfig.crons?.some(
        (cron) =>
          cron.path === "/api/cron/ops-alerts" &&
          cron.schedule === "0 17 * * *",
      ),
    );
    assert.match(envExample, /DISCORD_OPERATIONS_WEBHOOK_URL=""/);
    assert.match(envExample, /DISCORD_OPERATIONS_BOT_TOKEN=""/);
    assert.match(envExample, /DISCORD_OPERATIONS_CHANNEL_ID=""/);
    assert.doesNotMatch(envExample, /VITE_DISCORD/);
    assert.match(server, /discordOperationsWebhookUrl/);
    assert.match(server, /discordOperationsBotToken/);
    assert.match(server, /discordOperationsChannelId/);
    assert.match(server, /hasDiscordOperationsTarget/);
    assert.match(server, /DISCORD_OPERATIONS_WEBHOOK_URL/);
    assert.match(server, /DISCORD_OPERATIONS_BOT_TOKEN/);
    assert.match(server, /DISCORD_OPERATIONS_CHANNEL_ID/);
    assert.match(server, /operational_alert_events/);
    assert.match(server, /sendDiscordOperationalAlert/);
    assert.match(server, /allowed_mentions: \{ parse: \[\] \}/);
    assert.match(server, /enqueueVerificationOperationalAlert/);
    assert.match(server, /enqueueSupportTicketOperationalAlert/);
    assert.match(server, /enqueueSupportAccessOperationalAlert/);
    assert.match(server, /runOperationalAlertSweep/);
    assert.match(server, /\/api\/cron\/ops-alerts/);
    assert.match(server, /\/api\/admin\/operational-alerts/);
    assert.match(app, /path="\/admin\/mobile"/);
    assert.match(adminDashboard, /mobileOnly/);
    assert.match(adminDashboard, /function MobileAdminOperations/);
    assert.match(adminDashboard, /onApproveVerification/);
    assert.match(adminDashboard, /onUpdateTicketStatus/);
    assert.match(
      migration,
      /create table if not exists public\.operational_alert_events/,
    );
    assert.match(
      migration,
      /alter table public\.operational_alert_events enable row level security/,
    );
    assert.match(
      migration,
      /revoke all on public\.operational_alert_events from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant select, insert, update on public\.operational_alert_events to service_role/,
    );
    assert.match(migration, /mobile_path = '\/admin\/mobile'/);
    assert.doesNotMatch(migration, /grant[\s\S]+to anon;/);
    assert.doesNotMatch(adminDashboard, /DISCORD_OPERATIONS_WEBHOOK_URL/);
  });

  it("keeps server-loaded domain imports compatible with Vercel ESM runtime", () => {
    const domainDir = join(root, "src/domain");
    const domainFiles = readdirSync(domainDir).filter((file) =>
      file.endsWith(".ts"),
    );

    for (const file of domainFiles) {
      const source = read(`src/domain/${file}`);
      const relativeImports = source.matchAll(
        /from\s+["'](\.{1,2}\/[^"']+)["']/g,
      );

      for (const match of relativeImports) {
        assert.match(
          match[1],
          /\.js$/,
          `${file} uses an extensionless relative import that can break Vercel serverless ESM: ${match[1]}`,
        );
      }
    }
  });

  it("keeps duplicate early Supabase migrations as no-ops", () => {
    const duplicateSchema = read(
      "supabase/migrations/20260501020000_create_directsign_v2_schema.sql",
    );
    const duplicateVerification = read(
      "supabase/migrations/20260501141435_create_verification_requests.sql",
    );

    assert.match(duplicateSchema, /Consolidated no-op/);
    assert.doesNotMatch(duplicateSchema, /create\s+trigger/i);
    assert.match(duplicateVerification, /Consolidated no-op/);
    assert.doesNotMatch(duplicateVerification, /create\s+trigger/i);
  });

  it("documents the real Supabase migration chain instead of the no-op schema", () => {
    const launchReadiness = read("docs/launch-readiness.md");

    assert.match(launchReadiness, /Apply every SQL file[\s\S]+timestamp order/);
    assert.match(
      launchReadiness,
      /20260430193123_create_directsign_v2_schema\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260501020000_create_directsign_v2_schema\.sql[\s\S]+no-op/,
    );
    assert.match(
      launchReadiness,
      /20260505070645_harden_contract_support_access\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260506075008_restrict_authenticated_direct_writes\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260507224346_allow_revoked_support_access_event\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260507230025_lock_reserved_settlement_tables\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260518044009_add_marketplace_follower_sync\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260528135700_create_operational_support_tickets\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260528144856_extend_operational_support_tickets\.sql/,
    );
    assert.match(
      launchReadiness,
      /20260529090000_remove_settlement_support_ticket_category\.sql/,
    );
  });

  it("separates production data from test seeds and centralizes support tickets", () => {
    const server = read("server/index.ts");
    const operationalTestEmail = read("server/operational-test-email.ts");
    const app = read("src/App.tsx");
    const supportPage = read("src/pages/support/SupportPage.tsx");
    const supportDomain = read("src/domain/support.ts");
    const advertiserViewer = read(
      "src/pages/marketing/ContractAdminViewer.tsx",
    );
    const influencerViewer = read("src/pages/influencer/ContractViewer.tsx");
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const legalEntity = read("src/domain/legalEntity.ts");
    const envExample = read(".env.example");
    const seedAccounts = read("scripts/seed-test-accounts.mjs");
    const seedMarketplace = read("scripts/seed-qa-marketplace-scenario.mjs");
    const migration = read(
      "supabase/migrations/20260528135700_create_operational_support_tickets.sql",
    );
    const extensionMigration = read(
      "supabase/migrations/20260528144856_extend_operational_support_tickets.sql",
    );
    const settlementCategoryRemovalMigration = read(
      "supabase/migrations/20260529090000_remove_settlement_support_ticket_category.sql",
    );
    const marketplaceEligibility = read(
      "src/domain/marketplaceInfluencerEligibility.js",
    );

    assert.match(envExample, /YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA="false"/);
    assert.match(envExample, /VITE_LEGAL_OPERATOR_NAME=""/);
    assert.doesNotMatch(envExample, /VITE_LEGAL_OPERATOR_NAME="김재우"/);
    assert.doesNotMatch(legalEntity, /defaultLegalOperatorName = "김재우"/);
    assert.match(legalEntity, /`\$\{PRODUCT_NAME\} 운영팀`/);
    assert.match(seedAccounts, /YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA/);
    assert.match(seedAccounts, /Production test data seeding is blocked/);
    assert.match(seedAccounts, /const seedOneToOneProposalShowcase/);
    assert.match(seedAccounts, /data_origin: "qa"/);
    assert.match(seedAccounts, /direction: "advertiser_to_influencer"/);
    assert.match(seedAccounts, /direction: "influencer_to_brand"/);
    assert.match(seedAccounts, /seeded_one_to_one_proposals/);
    assert.match(seedMarketplace, /YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA/);
    assert.match(seedMarketplace, /Production test data seeding is blocked/);
    assert.match(server, /const allowProductionTestData/);
    assert.match(server, /const allowPublicMarketplaceCatalogFallback/);
    assert.match(server, /const filterOperationalMarketplaceTestData/);
    assert.match(
      server,
      /!isProductionRuntime &&[\s\S]+DIRECTSIGN_ALLOW_BUNDLED_CATALOG_FALLBACK === "true"/,
    );
    assert.match(
      server,
      /!filterOperationalMarketplaceTestData \|\|[\s\S]+!hasOperationalTestMarker\(profile\)/,
    );
    assert.match(server, /classifyMarketplacePublicInfluencerEligibility/);
    assert.match(server, /readIndexedMarketplaceInfluencerPage/);
    assert.match(server, /rpc\/list_marketplace_influencers/);
    assert.doesNotMatch(server, /readAllMarketplaceInfluencerRows/);
    assert.match(marketplaceEligibility, /knownOperationalSeedHandles/);
    assert.match(marketplaceEligibility, /operationalTestTextPattern/);
    assert.match(marketplaceEligibility, /reason: "operational_test_marker"/);
    assert.match(
      server,
      /if \(allowPublicMarketplaceCatalogFallback\) \{[\s\S]+return mergeMarketplaceBrandProfiles\(visibleDbProfiles\)/,
    );
    assert.match(
      server,
      /if \(!useSupabase\) return fallbackMarketplaceBrandProfiles\(\)/,
    );
    assert.match(server, /readAuthenticatedMarketplaceInfluencerPage/);
    assert.match(server, /rpc\/list_authenticated_marketplace_influencers/);
    assert.match(
      server,
      /readPublicMarketplaceInfluencerProfileByHandle\(\s*request\.params\.handle/,
    );
    assert.match(
      server,
      /const brands = await readPublicMarketplaceCache\(\s*"marketplace-brands"/,
    );
    assert.match(
      server,
      /findBrandProfileByHandle\(request\.params\.handle, brands\)/,
    );

    assert.match(server, /app\.post\("\/api\/support\/tickets"/);
    assert.match(server, /app\.get\("\/api\/admin\/support-tickets"/);
    assert.match(server, /operational_support_tickets/);
    assert.match(server, /sanitizeSupportContextUrl/);
    assert.match(server, /contract_id: contractId/);
    assert.match(server, /browser_context: browserContext/);
    assert.match(app, /path="\/support"/);
    assert.match(supportDomain, /buildSupportTicketPath/);
    assert.match(
      supportPage,
      /정산, 지급대행, 에스크로, 세금 처리는 연락미가 직접 처리하지/,
    );
    assert.doesNotMatch(server, /settlement_question/);
    assert.doesNotMatch(server, /settlement-inquiry/);
    assert.doesNotMatch(supportDomain, /settlement_question/);
    assert.doesNotMatch(supportPage, /settlement_question|정산 문의/);
    assert.doesNotMatch(
      influencerViewer,
      /settlement-inquiry|정산 미지급 문의|정산 문의/,
    );
    assert.doesNotMatch(adminDashboard, /settlement_question|정산 문의/);
    assert.match(supportPage, /contract_id: contractId/);
    assert.match(supportPage, /browser_context/);
    assert.match(advertiserViewer, /buildSupportTicketPath/);
    assert.match(influencerViewer, /buildSupportTicketPath/);
    assert.match(adminDashboard, /고객 문의/);
    assert.match(adminDashboard, /ticketCategoryFilter/);
    assert.match(adminDashboard, /계약 열기/);
    assert.match(adminDashboard, /AdminSectionTabs/);
    assert.match(adminDashboard, /manual_verification/);
    assert.match(adminDashboard, /data-admin-section/);
    assert.match(adminDashboard, /data-verification-tab/);
    assert.match(adminDashboard, /bg-red-500/);
    assert.match(adminDashboard, /인증 요청/);
    assert.match(adminDashboard, /인증 완료/);
    assert.doesNotMatch(
      adminDashboard,
      /운영 기준|운영\/테스트 분리|metrics\.source ===/,
    );
    assert.match(server, /readOperationalAdminContracts/);
    assert.match(server, /readOperationalAdminSupportAccessRequests/);
    assert.match(server, /readOperationalAdminVerificationRequests/);
    assert.match(server, /readOperationalAdminSupportTickets/);
    assert.match(server, /if \(!useSupabase\) return \[\] as Contract\[\];/);
    assert.match(
      server,
      /import \{ isOperationalTestEmail \} from "\.\/operational-test-email\.js"/,
    );
    assert.match(operationalTestEmail, /operationalTestEmailLocals/);
    assert.match(server, /isOperationalTestContract/);
    assert.match(server, /isOperationalTestSupportAccessRequest/);
    assert.match(server, /isOperationalTestSupportTicket/);
    assert.match(server, /isOperationalTestVerificationRequest/);
    assert.match(server, /operationalTestSeedTextValues/);
    assert.match(server, /hasOperationalTestText/);
    assert.match(
      server,
      /store\.contracts\.filter\(\(contract\) => !isOperationalTestContract\(contract\)\)/,
    );
    assert.match(server, /!isOperationalTestSupportAccessRequest\(request\)/);
    assert.match(server, /!isOperationalTestSupportTicket\(ticket\)/);
    assert.match(server, /!isOperationalTestVerificationRequest\(request\)/);
    assert.match(operationalTestEmail, /breadroom\.manager/);
    assert.match(operationalTestEmail, /test\.influencer/);
    assert.match(operationalTestEmail, /creator\.sora/);
    assert.match(server, /광고주 매니저/);
    assert.match(server, /브레드룸 신제품 언박싱/);
    assert.match(server, /title: contract\.title/);
    assert.match(server, /contract_title: ticket\.contract_title/);

    assert.match(
      migration,
      /create table if not exists public\.operational_support_tickets/,
    );
    assert.match(migration, /enable row level security/);
    assert.match(
      migration,
      /revoke all on public\.operational_support_tickets from public, anon, authenticated/,
    );
    assert.match(migration, /to service_role/);
    assert.match(extensionMigration, /contract_id text/);
    assert.match(extensionMigration, /browser_context jsonb/);
    assert.match(
      extensionMigration,
      /operational_support_tickets_contract_created_idx/,
    );
    assert.match(
      extensionMigration,
      /Public share tokens and signatures must not be stored/,
    );
    assert.match(
      settlementCategoryRemovalMigration,
      /where category = 'settlement_question'/,
    );
    assert.match(
      settlementCategoryRemovalMigration,
      /drop constraint if exists operational_support_tickets_category/,
    );
    assert.doesNotMatch(
      settlementCategoryRemovalMigration.replace(
        /where category = 'settlement_question'/g,
        "",
      ),
      /'settlement_question'/,
    );
  });

  it("blocks authenticated Data API writes for security-sensitive tables", () => {
    const migration = read(
      "supabase/migrations/20260506075008_restrict_authenticated_direct_writes.sql",
    );

    for (const table of [
      "public.contracts",
      "public.contract_clauses",
      "public.share_links",
      "public.signatures",
      "public.verification_requests",
      "public.support_access_requests",
    ]) {
      assert.match(migration, new RegExp(table.replace(".", "\\.")));
    }

    assert.match(
      migration,
      /revoke insert, update, delete on table[\s\S]+from anon, authenticated;/,
    );
    assert.match(migration, /to service_role;/);
  });

  it("keeps future settlement and payout tables reserved until marketplace launch", () => {
    const migration = read(
      "supabase/migrations/20260507230025_lock_reserved_settlement_tables.sql",
    );

    for (const table of [
      "settlement_periods",
      "settlement_reports",
      "settlement_items",
      "payouts",
    ]) {
      assert.match(migration, new RegExp(`'${table}'`));
    }

    assert.match(migration, /drop policy if exists/);
    assert.match(
      migration,
      /revoke all on table public\.%I from public, anon, authenticated/,
    );
    assert.match(migration, /grant all on table public\.%I to service_role/);
    assert.match(
      migration,
      /Reserved for future marketplace settlement features/,
    );
  });

  it("fails closed for production demo mode and shared admin fallbacks", () => {
    const server = read("server/index.ts");
    const envExample = read(".env.example");

    assert.match(server, /DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE/);
    assert.match(
      server,
      /DIRECTSIGN_DEMO_MODE cannot be enabled in production/,
    );
    assert.doesNotMatch(server, /ADMIN_ACCESS_CODE|ADMIN_OPERATOR_NAME/);
    assert.doesNotMatch(envExample, /ADMIN_ACCESS_CODE|ADMIN_OPERATOR_NAME/);
    assert.match(server, /profile\?\.role !== "admin"/);
    assert.match(server, /claims\.aal !== "aal2"/);
    assert.match(server, /getVerifiedAdminTotpFactor/);
    assert.match(envExample, /USER_SESSION_FAST_PATH_SECRET=""/);
    assert.match(envExample, /DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE="false"/);
  });

  it("binds personal admin MFA and one-time recent authentication to server state", () => {
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260730090000_add_auth_security_foundation.sql",
    );
    const adminUi = read("src/pages/admin/SystemAdminDashboard.tsx");
    const clientApi = read("src/domain/api.ts");
    const recentDialog = read("src/components/RecentAuthDialog.tsx");
    const monitoring = read("lib/auth-monitoring.ts");
    const metricOrigin = read("lib/auth-metric-origin.ts");
    const metricClassifierStart = server.indexOf(
      "const classifySessionAuthMetricDataOrigin",
    );
    const metricClassifierSource = server.slice(
      metricClassifierStart,
      server.indexOf("const hasAdminTotpAmr", metricClassifierStart),
    );
    const adminRegistrationStart = server.indexOf(
      "const registerAdminOperatorSession",
    );
    const adminRegistrationSource = server.slice(
      adminRegistrationStart,
      server.indexOf("const revokeAdminOperatorSession", adminRegistrationStart),
    );
    const metricTableStart = migration.indexOf(
      "create table if not exists public.operational_auth_metric_buckets",
    );
    const metricTableSource = migration.slice(
      metricTableStart,
      migration.indexOf(
        "create index if not exists operational_auth_metric_bucket_minute_idx",
        metricTableStart,
      ),
    );

    assert.match(server, /app\.post\("\/api\/admin\/mfa\/verify"/);
    assert.match(server, /claims\.aal !== "aal2"/);
    assert.match(server, /profile\?\.role !== "admin"/);
    assert.match(
      adminRegistrationSource,
      /\?on_conflict=admin_session_id|\?on_conflict=auth_session_id/,
    );
    assert.match(adminUi, /type AdminAuthStep = "credentials" \| "totp"/);
    assert.match(adminUi, /qr_code\?: string/);
    assert.match(adminUi, /enrollment_required\?: boolean/);

    assert.match(migration, /create table if not exists public\.auth_recent_grants/);
    assert.match(migration, /expires_at <= authenticated_at \+ interval '10 minutes'/);
    assert.match(migration, /create or replace function public\.consume_auth_recent_grant/);
    for (const exactBinding of [
      "grant_row.profile_id = p_profile_id",
      "grant_row.auth_session_id = p_auth_session_id",
      "grant_row.role = p_role",
      "grant_row.action = p_action",
      "grant_row.resource_hash = p_resource_hash",
      "grant_row.consumed_at is null",
    ]) {
      assert.match(migration, new RegExp(exactBinding.replaceAll(".", "\\.")));
    }
    assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
    assert.match(server, /app\.post\("\/api\/auth\/recent"/);
    assert.match(server, /action: "advertiser_contract_close"/);
    assert.match(server, /action: "advertiser_share_reveal"/);
    assert.match(server, /action: "influencer_signature"/);
    assert.match(server, /share_token: undefined/);
    assert.match(recentDialog, /registerRecentAuthHandler/);
    assert.match(recentDialog, /현재 로그인은 그대로 유지됩니다/);
    assert.match(clientApi, /authenticated \? fetch\(target, init\) : response/);

    assert.match(monitoring, /record_operational_auth_metric/);
    assert.match(monitoring, /metric\.dataOrigin !== "production"/);
    assert.doesNotMatch(monitoring, /authenticatedContext/);
    assert.match(metricOrigin, /createHmac\("sha256", secret\)/);
    assert.match(metricOrigin, /"v2"/);
    assert.match(metricOrigin, /bindingDigest\("user", userId, secret\)/);
    assert.match(
      metricOrigin,
      /bindingDigest\("session", authSessionId, secret\)/,
    );
    assert.match(metricOrigin, /bindingDigest\("proof", sessionProof, secret\)/);
    assert.match(metricOrigin, /expiresAtSeconds <= nowSeconds/);
    assert.match(server, /readAuthMetricOriginFromRequest/);
    assert.doesNotMatch(metricClassifierSource, /accessToken|claims|decode/);
    assert.match(
      metricClassifierSource,
      /return verifiedIdentityOrigin \?\? authoritativeOrigin/,
    );
    assert.doesNotMatch(
      metricTableSource,
      /profile_id|email|ip_hash|auth_session_id|token_hash|resource_hash|user_agent/i,
    );
  });

  it("hardens admin TOTP against factor swapping, phone-only AAL2, and provider outages", () => {
    const server = read("server/index.ts");
    const atomicMfaMigration = read(
      "supabase/migrations/20260730100000_add_atomic_admin_mfa_rate_limit_reservations.sql",
    );
    const verifyRouteStart = server.indexOf(
      'app.post("/api/admin/mfa/verify"',
    );
    const verifyRoute = server.slice(
      verifyRouteStart,
      server.indexOf('app.post("/api/admin/logout"', verifyRouteStart),
    );
    const retryableBranchStarts = Array.from(
      verifyRoute.matchAll(/if \(isRetryableAdminMfaFailure\(error\)\) \{/g),
      (match) => match.index,
    );

    assert.ok(verifyRouteStart >= 0);
    assert.match(server, /createHmac\("sha256", secret\)/);
    assert.match(server, /createAdminPendingMfaBindingToken/);
    assert.match(server, /verifyAdminPendingMfaBindingToken/);
    for (const bindingField of ["userId", "authSessionId", "factorId"]) {
      assert.match(server, new RegExp(`payload\\.${bindingField}`));
    }
    assert.match(
      verifyRoute,
      /factor\.id === factorId && factor\.factor_type === "totp"/,
    );
    assert.match(verifyRoute, /authoritative: true/);
    assert.ok((server.match(/hasAdminTotpAmr\(claims\)/g) ?? []).length >= 4);
    assert.match(server, /entry\.method\?\.toLowerCase\(\) === "totp"/);

    assert.match(verifyRoute, /reserveAdminMfaRateLimit\(/);
    assert.match(server, /rpc\/reserve_admin_mfa_rate_limit/);
    assert.match(server, /rollbackAdminMfaRateLimitReservation/);
    assert.match(server, /adminMfaMaxFailures/);
    assert.match(verifyRoute, /response\.status\(429\)/);
    assert.doesNotMatch(verifyRoute, /clearAdminMfaSubjectRateLimits/);
    assert.doesNotMatch(verifyRoute, /directsign_rate_limit_buckets[\s\S]*DELETE/);
    assert.match(server, /`admin-mfa:user:\$\{userId\}`/);
    assert.match(server, /`admin-mfa:factor:\$\{factorId\}`/);
    assert.match(server, /`admin-mfa:ip:\$\{getClientIp\(request\)\}`/);
    assert.doesNotMatch(verifyRoute, /sha256Hex\(factorBinding\)/);
    assert.ok(retryableBranchStarts.length >= 3);
    for (const branchStart of retryableBranchStarts) {
      const branch = verifyRoute.slice(branchStart, branchStart + 900);
      assert.match(branch, /rollbackAdminMfaReservationOrRespond/);
      assert.match(branch, /response\.status\(503\)/);
      const retryableResponse = branch.slice(
        0,
        branch.indexOf("response.status(503)") + 180,
      );
      assert.match(retryableResponse, /retryable: true/);
      assert.doesNotMatch(retryableResponse, /clearAdminSessionCookies/);
      assert.doesNotMatch(retryableResponse, /clearRateLimitBucket/);
      assert.doesNotMatch(
        retryableResponse,
        /finalizeAdminMfaRateLimitReservation/,
      );
    }
    assert.match(atomicMfaMigration, /pg_advisory_xact_lock/);
    assert.match(
      atomicMfaMigration,
      /admin MFA rate limit buckets must be distinct/,
    );
    assert.match(
      atomicMfaMigration,
      /if v_blocked then[\s\S]*?select true, v_retry_after_seconds, false/,
    );
    assert.match(
      atomicMfaMigration,
      /bucket\.reset_at = v_item\.bucket_reset_at/,
    );
    assert.match(
      atomicMfaMigration,
      /terminal_outcome in \('finalized', 'rolled_back'\)/,
    );
    assert.match(
      atomicMfaMigration,
      /reservation_ttl_seconds integer not null/,
    );
    assert.match(
      atomicMfaMigration,
      /v_existing_reservation\.reservation_ttl_seconds[\s\S]*?<> p_reservation_ttl_seconds/,
    );
    assert.match(server, /type AdminMfaProviderStage =[\s\S]*?"enroll"[\s\S]*?"remove"/);
    assert.match(server, /fetchSupabaseAdminMfa\(\s*"enroll"/);
    assert.match(server, /fetchSupabaseAdminMfa\(\s*"remove"/);
    assert.match(
      server,
      /setAdminSessionCookies\([\s\S]*?adminPendingSessionMaxAgeSeconds[\s\S]*?sendRetryableAdminMfaUnavailable/,
    );
    assert.match(
      server,
      /admin\?\.authSessionId \?\? claims\?\.session_id/,
    );
  });

  it("behaviorally exact-binds and expires the admin pending-MFA cookie", async () => {
    const envNames = [
      "VERCEL",
      "DIRECTSIGN_DEMO_MODE",
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DIRECTSIGN_TOKEN_ENCRYPTION_SECRET",
    ] as const;
    const previousEnv = new Map(
      envNames.map((name) => [name, process.env[name]] as const),
    );
    process.env.VERCEL = "1";
    process.env.DIRECTSIGN_DEMO_MODE = "false";
    process.env.SUPABASE_URL = "https://admin-mfa-unit-test.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "p".repeat(48);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "s".repeat(48);
    process.env.DIRECTSIGN_TOKEN_ENCRYPTION_SECRET = "x".repeat(64);

    try {
      const {
        createAdminPendingMfaBindingToken,
        readAdminPendingMfaBindingToken,
        verifyAdminPendingMfaBindingToken,
      } = await import("../server/index");
      const secret = "binding-secret-".padEnd(64, "z");
      const nowMs = 10_000;
      const tokens = new Map(
        (["production", "qa", "demo", "seed"] as const).map((dataOrigin) => {
          const candidate = createAdminPendingMfaBindingToken({
            secret,
            userId: "user-a",
            authSessionId: "session-a",
            factorId: "totp-a",
            dataOrigin,
            nowMs,
          });
          assert.equal(
            readAdminPendingMfaBindingToken({
              token: candidate,
              secret,
              nowMs: nowMs + 1,
            })?.dataOrigin,
            dataOrigin,
          );
          return [dataOrigin, candidate] as const;
        }),
      );
      const token = tokens.get("production")!;
      const verify = (overrides: {
        token?: string;
        secret?: string;
        userId?: string;
        authSessionId?: string;
        nowMs?: number;
      } = {}) =>
        verifyAdminPendingMfaBindingToken({
          token: overrides.token ?? token,
          secret: overrides.secret ?? secret,
          userId: overrides.userId ?? "user-a",
          authSessionId: overrides.authSessionId ?? "session-a",
          nowMs: overrides.nowMs ?? nowMs + 1,
        });

      assert.equal(verify(), "totp-a");
      assert.equal(verify({ userId: "user-b" }), undefined);
      assert.equal(verify({ authSessionId: "session-b" }), undefined);
      assert.equal(verify({ secret: "wrong-secret".padEnd(64, "q") }), undefined);
      assert.equal(verify({ nowMs: nowMs + 10 * 60 * 1000 + 1 }), undefined);
      const tamperedToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
      assert.equal(verify({ token: tamperedToken }), undefined);

      const legacyPayload = Buffer.from(
        JSON.stringify({
          version: 1,
          userId: "user-a",
          authSessionId: "session-a",
          factorId: "totp-a",
          issuedAt: nowMs,
          expiresAt: nowMs + 10 * 60 * 1000,
        }),
        "utf8",
      ).toString("base64url");
      const legacyToken = `${legacyPayload}.${createHmac("sha256", secret)
        .update(legacyPayload)
        .digest("base64url")}`;
      assert.equal(
        readAdminPendingMfaBindingToken({
          token: legacyToken,
          secret,
          nowMs: nowMs + 1,
        })?.dataOrigin,
        undefined,
      );

      const invalidOriginPayload = Buffer.from(
        JSON.stringify({
          version: 2,
          userId: "user-a",
          authSessionId: "session-a",
          factorId: "totp-a",
          dataOrigin: "customer-supplied",
          issuedAt: nowMs,
          expiresAt: nowMs + 10 * 60 * 1000,
        }),
        "utf8",
      ).toString("base64url");
      const invalidOriginToken = `${invalidOriginPayload}.${createHmac(
        "sha256",
        secret,
      )
        .update(invalidOriginPayload)
        .digest("base64url")}`;
      assert.equal(
        readAdminPendingMfaBindingToken({
          token: invalidOriginToken,
          secret,
          nowMs: nowMs + 1,
        }),
        undefined,
      );
    } finally {
      for (const name of envNames) {
        const previous = previousEnv.get(name);
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
      }
    }
  });

  it("canonicalizes www to the apex host with a permanent method-preserving redirect", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      redirects?: Array<{
        source?: string;
        destination?: string;
        permanent?: boolean;
        has?: Array<{ type?: string; value?: string }>;
      }>;
    };
    const redirect = vercel.redirects?.find((candidate) =>
      candidate.has?.some(
        (condition) =>
          condition.type === "host" && condition.value === "www\\.yeollock\\.me",
      ),
    );

    assert.ok(redirect);
    assert.equal(redirect.source, "/:path(.*)");
    assert.equal(redirect.destination, "https://yeollock.me/:path");
    assert.equal(redirect.permanent, true);
  });

  it("fails closed when Supabase support access audit events cannot be stored", () => {
    const server = read("server/index.ts");

    assert.match(server, /createMissingSupportAccessEventStoreError/);
    assert.match(server, /ensureSupportAccessEventStoreAvailable/);
    assert.match(
      server,
      /if \(!allowLocalSupportAccessStore\) \{\s*throw createMissingSupportAccessEventStoreError\(\);/s,
    );
    assert.match(server, /await ensureSupportAccessEventStoreAvailable\(\);/);
  });

  it("surfaces support access audit events and records revocations explicitly", () => {
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260507224346_allow_revoked_support_access_event.sql",
    );

    assert.match(server, /interface SupportAccessAuditEvent[\s\S]+"revoked"/);
    assert.match(server, /const attachSupportAccessEvents = async/);
    assert.match(server, /support_access_events/);
    assert.match(server, /action: status === "closed" \? "closed" : "revoked"/);
    assert.match(migration, /'revoked'/);
  });

  it("requires explicit support access consent from contract parties", () => {
    const server = read("server/index.ts");
    const legalConsent = read("src/domain/legalConsent.ts");
    const advertiserViewer = read(
      "src/pages/marketing/ContractAdminViewer.tsx",
    );
    const influencerViewer = read("src/pages/influencer/ContractViewer.tsx");
    const userMessages = read("src/domain/userMessages.ts");
    const routeStart = server.indexOf(
      'app.post("/api/contracts/:id/support-access-requests"',
    );
    const routeEnd = server.indexOf('app.get("/api/contracts/:id"', routeStart);
    const route = server.slice(routeStart, routeEnd);

    assert.notEqual(routeStart, -1);
    assert.notEqual(routeEnd, -1);
    assert.match(legalConsent, /SUPPORT_ACCESS_CONSENT_TEXT/);
    assert.match(
      legalConsent,
      /24시간 확인하고, 열람 기록이 감사 로그에 남는 것/,
    );
    assert.match(route, /request\.body\?\.support_consent_accepted !== true/);
    assert.match(route, /Support access consent is required/);
    assert.match(route, /supportAccessConsentText/);
    assert.match(advertiserViewer, /SUPPORT_ACCESS_CONSENT_TEXT/);
    assert.match(influencerViewer, /SUPPORT_ACCESS_CONSENT_TEXT/);
    assert.match(
      advertiserViewer,
      /support_consent_accepted: supportConsentAccepted/,
    );
    assert.match(
      influencerViewer,
      /support_consent_accepted: supportConsentAccepted/,
    );
    assert.match(advertiserViewer, /개인정보 처리방침 보기/);
    assert.match(influencerViewer, /개인정보 처리방침 보기/);
    assert.match(userMessages, /Support access consent is required/);
  });

  it("uses server operator identity for admin verification reviews", () => {
    const server = read("server/index.ts");
    const reviewRouteStart = server.indexOf(
      'app.patch("/api/admin/verification-requests/:id"',
    );
    const reviewRouteEnd = server.indexOf(
      'app.get("/api/contracts"',
      reviewRouteStart,
    );
    const reviewRoute = server.slice(reviewRouteStart, reviewRouteEnd);

    assert.notEqual(reviewRouteStart, -1);
    assert.notEqual(reviewRouteEnd, -1);
    assert.match(reviewRoute, /const admin = await requireAdminSession/);
    assert.match(reviewRoute, /const reviewedByName = admin\.profile\.name/);
    assert.match(reviewRoute, /reviewedByProfileId: admin\.profile\.id/);
    assert.doesNotMatch(reviewRoute, /request\.body\?\.reviewed_by_name/);
  });

  it("does not present share links as complete before server sync settles", () => {
    const builder = read("src/pages/marketing/ContractBuilder.tsx");

    assert.match(builder, /공유 링크 저장 중/);
    assert.match(builder, /공유 링크 확인 필요/);
    assert.match(
      builder,
      /disabled=\{[\s\S]{0,180}result\.stale \|\|[\s\S]{0,80}isSyncing \|\|[\s\S]{0,80}Boolean\(syncError\)/,
    );
    assert.match(builder, /resultSaveState === "ready"[\s\S]+!result\.stale/);
    assert.match(builder, /\/share-link\/reveal/);
  });

  it("builds public share links from the canonical site and step-up reveal endpoint", () => {
    const links = read("src/domain/links.ts");
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const envExample = read(".env.example");

    assert.match(links, /VITE_PUBLIC_SITE_URL/);
    assert.match(links, /buildContractShareUrl/);
    assert.match(builder, /\/share-link\/reveal/);
    assert.doesNotMatch(builder, /buildContractShareUrl|createShareToken/);
    assert.match(adminViewer, /\/share-link\/reveal/);
    assert.doesNotMatch(adminViewer, /buildContractShareUrl|createShareToken/);
    assert.match(adminViewer, /payload\.share_url/);
    assert.match(envExample, /VITE_PUBLIC_SITE_URL="https:\/\/yeollock\.me"/);
  });

  it("keeps share tokens server-authored and absent from routine client state", () => {
    const server = read("server/index.ts");
    const fastAuth = read("lib/fast-auth.ts");
    const store = read("src/store.ts");
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const normalizeStart = server.indexOf("const normalizeContract =");
    const normalizeSource = server.slice(
      normalizeStart,
      server.indexOf("const normalizeStore", normalizeStart),
    );
    const serverAuthorStart = server.indexOf(
      "const serverAuthorContractShareEvidence",
    );
    const serverAuthorSource = server.slice(
      serverAuthorStart,
      server.indexOf("const isContractSendAttempt", serverAuthorStart),
    );
    const fastProtectionStart = fastAuth.indexOf(
      "function protectContractForClient",
    );
    const fastProtectionSource = fastAuth.slice(
      fastProtectionStart,
      fastAuth.indexOf("async function readProfileByEmail", fastProtectionStart),
    );

    assert.doesNotMatch(normalizeSource, /createShareToken\(/);
    assert.match(serverAuthorSource, /hasUsableContractShareLink\(existing\)/);
    assert.match(serverAuthorSource, /createShareToken\(\)/);
    assert.match(serverAuthorSource, /existing!\.evidence!\.share_token/);
    assert.match(serverAuthorSource, /actor === "influencer"/);
    assert.match(serverAuthorSource, /evidence: existing\?\.evidence/);
    assert.match(server, /!hasUsableContractShareLink\(existing\)/);
    assert.match(server, /isContractShareRotation/);
    assert.match(fastProtectionSource, /share_token: undefined/);
    assert.doesNotMatch(fastProtectionSource, /encryptShareTokenForLegacyStore/);
    assert.match(store, /share_token: undefined/);
    assert.doesNotMatch(builder, /createShareToken|buildContractShareUrl/);
    assert.doesNotMatch(adminViewer, /createShareToken|buildContractShareUrl/);
    assert.match(builder, /navigator\.clipboard\.writeText\(payload\.share_url\)/);
    assert.match(adminViewer, /navigator\.clipboard\.writeText\(payload\.share_url\)/);
  });

  it("does not keep contracts or share tokens in persistent browser localStorage", () => {
    const store = read("src/store.ts");
    const persistConfig = store.slice(
      store.indexOf('name: "yeollock-contract-ui-state"'),
    );

    assert.match(store, /window\.localStorage\.removeItem\(key\)/);
    assert.match(store, /"directsign-contract-store"/);
    assert.match(store, /"yeollock-contract-store"/);
    assert.match(store, /createJSONStorage\(\(\) => sessionStorage\)/);
    assert.match(
      persistConfig,
      /partialize:\s*\(\)\s*=>\s*\(\{\s*contracts:\s*\[\]\s*\}\)/s,
    );
    assert.doesNotMatch(persistConfig, /localStorage/);
    assert.doesNotMatch(persistConfig, /share_token/);
  });

  it("keeps customer login rolling while separating transient auth failures from logout", () => {
    assert.equal(userSessionAccessMaxAgeSeconds, 60 * 60);
    assert.equal(userSessionRollingDays, 30);
    assert.equal(userSessionRefreshMaxAgeSeconds, 60 * 60 * 24 * 30);
    assert.equal(userSessionRefreshReuseCacheMs, 10 * 1000);

    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      assert.equal(isRetryableSupabaseAuthFailureStatus(status), true);
      assert.equal(
        isTerminalSupabaseRefreshFailure({
          status,
          code: "refresh_token_not_found",
        }),
        false,
      );
    }
    for (const status of [400, 401, 403, 404, 409, 422]) {
      assert.equal(isRetryableSupabaseAuthFailureStatus(status), false);
      assert.equal(
        isTerminalSupabaseRefreshFailure({
          status,
          code: "unexpected_failure",
        }),
        false,
      );
    }
    assert.equal(
      isTerminalSupabaseRefreshFailure({
        status: 400,
        code: "refresh_token_not_found",
      }),
      true,
    );

    const server = read("server/index.ts");
    const fastAuth = read("lib/fast-auth.ts");
    const advertiserGate = read("src/pages/marketing/AdvertiserAuthGate.tsx");
    const influencerLogin = read("src/pages/influencer/InfluencerLoginPage.tsx");

    assert.match(server, /userSessionRefreshMaxAgeSeconds/);
    assert.match(fastAuth, /userSessionRefreshMaxAgeSeconds/);
    assert.match(server, /signal: createSupabaseTimeoutSignal\(\)/);
    assert.match(server, /SupabaseAuthUserVerificationError/);
    assert.match(server, /SupabaseSessionRefreshError/);
    assert.match(server, /AuthSessionTemporarilyUnavailableError/);
    assert.match(server, /supabaseSessionRefreshInflight/);
    assert.match(server, /supabaseSessionRefreshReuseCache/);
    assert.match(server, /getTokenCacheKey\(refreshToken\)/);
    assert.match(server, /response\.setHeader\("Retry-After", "1"\)/);
    assert.match(server, /response\.status\(503\)/);
    assert.match(server, /setPrivateAuthResponseHeaders\(response\)/);
    assert.match(
      fastAuth,
      /response\.setHeader\("Cache-Control", "private, no-store"\)/,
    );
    assert.match(fastAuth, /response\.setHeader\("Vary", "Cookie"\)/);

    assert.match(advertiserGate, /const isAuthoritativeLogout/);
    assert.match(advertiserGate, /response\.status === 401/);
    assert.match(advertiserGate, /response\.status === 403/);
    assert.match(advertiserGate, /retryDelayMs/);
    assert.match(advertiserGate, /<BrandLogo \/>/);

    assert.match(influencerLogin, /apiFetch\("\/api\/influencer\/session"/);
    assert.match(influencerLogin, /const isAuthoritativeLogout/);
    assert.match(influencerLogin, /isCheckingSession/);
    assert.match(influencerLogin, /retryDelayMs/);
    assert.match(influencerLogin, /<BrandLogo \/>/);

    assert.match(server, /const adminSessionMaxAgeSeconds = 60 \* 60 \* 8/);
    assert.match(server, /const signedPdfAccessMaxAgeSeconds = 60 \* 10/);
    assert.doesNotMatch(advertiserGate, /localStorage/);
    assert.doesNotMatch(influencerLogin, /localStorage/);
  });

  it("blocks bearer share tokens from signed PDF downloads", () => {
    const server = read("server/index.ts");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");
    const reviewPdfRouteStart = server.indexOf(
      'app.get("/api/contracts/:id/review-pdf"',
    );
    const reviewPdfRouteEnd = server.indexOf(
      'app.get("/api/contracts/:id/final-pdf"',
      reviewPdfRouteStart,
    );
    const reviewPdfRoute = server.slice(reviewPdfRouteStart, reviewPdfRouteEnd);
    const finalPdfRouteStart = server.indexOf(
      'app.get("/api/contracts/:id/final-pdf"',
    );
    const finalPdfRouteEnd = server.indexOf(
      'app.post("/api/contracts/:id/signatures/influencer"',
      finalPdfRouteStart,
    );
    const finalPdfRoute = server.slice(finalPdfRouteStart, finalPdfRouteEnd);
    const contractGetRouteStart = server.indexOf(
      'app.get("/api/contracts/:id"',
    );
    const contractGetRouteEnd = server.indexOf(
      'app.get("/api/contracts/:id/final-pdf"',
      contractGetRouteStart,
    );
    const contractGetRoute = server.slice(
      contractGetRouteStart,
      contractGetRouteEnd,
    );
    const finalPdfHrefStart = viewer.indexOf("const finalPdfHref =");
    const finalPdfHrefEnd = viewer.indexOf(
      "const reviewPdfBaseHref",
      finalPdfHrefStart,
    );
    const finalPdfHrefBuilder = viewer.slice(
      finalPdfHrefStart,
      finalPdfHrefEnd,
    );
    const contractDocumentPdfStart = server.indexOf(
      "const buildContractDocumentPdf",
    );
    const contractDocumentPdfEnd = server.indexOf(
      "const buildSignedContractPdf",
      contractDocumentPdfStart,
    );
    const contractDocumentPdfBuilder = server.slice(
      contractDocumentPdfStart,
      contractDocumentPdfEnd,
    );
    const signedPdfBuilderStart = server.indexOf(
      "const buildSignedContractPdf",
    );
    const signedPdfBuilderEnd = server.indexOf(
      "const stableUuid",
      signedPdfBuilderStart,
    );
    const signedPdfBuilder = server.slice(
      signedPdfBuilderStart,
      signedPdfBuilderEnd,
    );
    const pdfDownloadStart = viewer.indexOf("const pdfResponse = await fetch(");
    const pdfDownloadEnd = viewer.indexOf(
      "if (!pdfResponse.ok)",
      pdfDownloadStart,
    );
    const pdfDownloadBlock = viewer.slice(pdfDownloadStart, pdfDownloadEnd);

    assert.notEqual(reviewPdfRouteStart, -1);
    assert.notEqual(reviewPdfRouteEnd, -1);
    assert.notEqual(finalPdfRouteStart, -1);
    assert.notEqual(finalPdfRouteEnd, -1);
    assert.notEqual(contractGetRouteStart, -1);
    assert.notEqual(contractGetRouteEnd, -1);
    assert.notEqual(contractDocumentPdfStart, -1);
    assert.notEqual(contractDocumentPdfEnd, -1);
    assert.notEqual(signedPdfBuilderStart, -1);
    assert.notEqual(signedPdfBuilderEnd, -1);
    assert.match(reviewPdfRoute, /buildContractReviewPdf/);
    assert.match(reviewPdfRoute, /Content-Type", "application\/pdf"/);
    assert.match(contractDocumentPdfBuilder, /광고 계약서/);
    assert.match(contractDocumentPdfBuilder, /제1조 계약 당사자/);
    assert.match(contractDocumentPdfBuilder, /제3조 플랫폼 및 콘텐츠/);
    assert.match(contractDocumentPdfBuilder, /제7조 특약 및 추가 조항/);
    assert.doesNotMatch(contractDocumentPdfBuilder, /계약 개요/);
    assert.doesNotMatch(contractDocumentPdfBuilder, /자동 생성 조항/);
    assert.match(reviewPdfRoute, /buildContractReviewPdf/);
    assert.match(
      server,
      /const buildContractReviewPdf = async \(contract: Contract\) =>\s*buildContractDocumentPdf\(\{ contract \}\);/,
    );
    assert.match(signedPdfBuilder, /buildContractDocumentPdf\(\{/);
    assert.doesNotMatch(contractDocumentPdfBuilder, /확인 안내/);
    assert.doesNotMatch(contractDocumentPdfBuilder, /Signed Contract/);
    assert.doesNotMatch(reviewPdfRoute, /allowShareToken:\s*false/);
    assert.match(finalPdfRoute, /allowShareToken:\s*false/);
    assert.match(finalPdfRoute, /hasSignedPdfCookieAccess/);
    assert.doesNotMatch(contractGetRoute, /allowShareToken:\s*false/);
    assert.doesNotMatch(finalPdfHrefBuilder, /shareToken/);
    assert.doesNotMatch(pdfDownloadBlock, /X-Yeollock-Share-Token/);
  });

  it("blocks bearer share tokens from influencer review mutations", () => {
    const server = read("server/index.ts");
    const reviewRouteStart = server.indexOf('app.put("/api/contracts/:id"');
    const reviewRouteEnd = server.indexOf("if (isPreview)", reviewRouteStart);
    const reviewRoute = server.slice(reviewRouteStart, reviewRouteEnd);

    assert.notEqual(reviewRouteStart, -1);
    assert.notEqual(reviewRouteEnd, -1);
    assert.match(reviewRoute, /allowShareToken:\s*false/);
    assert.match(
      reviewRoute,
      /Influencer session is required for contract review changes/,
    );
  });

  it("keeps signed content deliverables behind authenticated server APIs", () => {
    const server = read("server/index.ts");
    const getRouteStart = server.indexOf(
      'app.get("/api/contracts/:id/deliverables"',
    );
    const postRouteStart = server.indexOf(
      'app.post("/api/contracts/:id/deliverables"',
    );
    const patchRouteStart = server.indexOf(
      'app.patch("/api/contracts/:id/deliverables/:deliverableId"',
    );
    const supportRouteStart = server.indexOf(
      'app.post("/api/contracts/:id/support-access-requests"',
    );
    const getRoute = server.slice(getRouteStart, postRouteStart);
    const postRoute = server.slice(postRouteStart, patchRouteStart);
    const patchRoute = server.slice(patchRouteStart, supportRouteStart);

    assert.notEqual(getRouteStart, -1);
    assert.notEqual(postRouteStart, -1);
    assert.notEqual(patchRouteStart, -1);
    assert.match(getRoute, /allowShareToken:\s*false/);
    assert.match(postRoute, /requireInfluencerSession/);
    assert.match(postRoute, /storeDeliverableFile/);
    assert.match(postRoute, /contract_files/);
    assert.match(patchRoute, /requireAdvertiserSession/);
    assert.match(patchRoute, /updateContractDeliverableWorkflow/);
    assert.match(server, /status:\s*"completed"/);
  });

  it("counts orphan deliverable submissions against single matching requirements", () => {
    const server = read("server/index.ts");
    const counterStart = server.indexOf("const countDeliverableUnits =");
    const counterEnd = server.indexOf(
      "const buildDeliverableSummary =",
      counterStart,
    );
    const counter = server.slice(counterStart, counterEnd);

    assert.notEqual(counterStart, -1);
    assert.notEqual(counterEnd, -1);
    assert.match(counter, /unassignedDeliverables/);
    assert.match(counter, /!deliverable\.requirement_id/);
    assert.match(counter, /unassignedOffset/);
    assert.match(counter, /Math\.min\(quantity, matchingCount\)/);
  });

  it("requires support PDF scope before support operators can download deliverable files", () => {
    const server = read("server/index.ts");
    const routeStart = server.indexOf(
      '"/api/contracts/:id/deliverables/:deliverableId/files/:fileId"',
    );
    const routeEnd = server.indexOf(
      'app.post("/api/contracts/:id/support-access-requests"',
      routeStart,
    );
    const route = server.slice(routeStart, routeEnd);

    assert.notEqual(routeStart, -1);
    assert.notEqual(routeEnd, -1);
    assert.match(route, /does not include private file access/);
    assert.match(route, /deliverable_file_downloaded/);
    assert.match(route, /viewed_pdf/);
  });

  it("locks the post-sign content workflow behind review and close gates", () => {
    const contracts = read("src/domain/contracts.ts");
    const server = read("server/index.ts");
    const advertiserViewer = read(
      "src/pages/marketing/ContractAdminViewer.tsx",
    );
    const influencerViewer = read("src/pages/influencer/ContractViewer.tsx");
    const dashboard = read("src/pages/marketing/Dashboard.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const reviewRouteStart = server.indexOf(
      'app.patch("/api/contracts/:id/deliverables/:deliverableId"',
    );
    const closeRouteStart = server.indexOf(
      'app.post("/api/contracts/:id/close"',
    );

    assert.notEqual(reviewRouteStart, -1);
    assert.notEqual(closeRouteStart, -1);

    const reviewRoute = server.slice(reviewRouteStart, closeRouteStart);
    const closeRoute = server.slice(closeRouteStart);

    assert.match(contracts, /deliverable_summary\?:/);
    assert.match(reviewRoute, /contract\.status !== "SIGNED"/);
    assert.match(
      reviewRoute,
      /Contract must be signed before deliverables can be reviewed/,
    );
    assert.match(closeRoute, /status:\s*"CLOSED"/);
    assert.match(closeRoute, /contract_closed/);
    assert.match(server, /toLegacySupabaseStatus/);
    assert.match(server, /status === "CLOSED" \? "SIGNED" : status/);
    assert.match(advertiserViewer, /window\.confirm/);
    assert.match(advertiserViewer, /isContractSignedOrClosed/);
    assert.match(influencerViewer, /!isContractSignedOrClosed/);
    assert.match(dashboard, /isContractContentSubmitted/);
    assert.match(dashboard, /contract\.deliverable_summary/);
    assert.doesNotMatch(campaignPages, /window\.confirm/);
  });

  it("audits evidence and signed PDF downloads on the server", () => {
    const server = read("server/index.ts");

    assert.match(server, /appendVerificationEvidenceAccessAudit/);
    assert.match(server, /evidence_access_audit/);
    assert.match(server, /Cache-Control", "no-store"/);
    assert.match(server, /signed_pdf_downloaded/);
  });

  it("keeps advertiser contract PDF downloads in the contract detail action area", () => {
    const agents = read("AGENTS.md");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const dashboard = read("src/pages/marketing/Dashboard.tsx");

    assert.match(
      agents,
      /Contract detail pages should expose PDF downloads inside the detail action area/,
    );
    assert.match(
      adminViewer,
      /apiPath\(`\/api\/contracts\/\$\{contract\.id\}\/review-pdf`\)/,
    );
    assert.match(
      adminViewer,
      /contract\.pdf_url \|\| apiPath\(`\/api\/contracts\/\$\{contract\.id\}\/final-pdf`\)/,
    );
    assert.match(adminViewer, /isContractSignedOrClosed\s*\?/);
    assert.match(adminViewer, /contractPdfDownloadName/);
    assert.match(adminViewer, /download=\{contractPdfDownloadName\}/);
    assert.doesNotMatch(dashboard, /review-pdf|final-pdf/);
  });

  it("keeps file limits aligned at 10MB for verification and proof evidence", () => {
    const server = read("server/index.ts");
    const deliverables = read("src/domain/deliverables.ts");
    const advertiserVerification = read(
      "src/pages/marketing/AdvertiserVerification.tsx",
    );
    const influencerVerification = read(
      "src/pages/influencer/InfluencerVerification.tsx",
    );

    assert.match(server, /const maxVerificationFileSize = 10 \* 1024 \* 1024/);
    assert.match(
      server,
      /const maxDeliverableFileSize = maxVerificationFileSize/,
    );
    assert.match(server, /Verification evidence file must be 10MB or smaller/);
    assert.match(server, /Proof file must be 10MB or smaller/);
    assert.match(
      deliverables,
      /MAX_DELIVERABLE_FILE_SIZE_BYTES = 10 \* 1024 \* 1024/,
    );
    assert.match(deliverables, /Proof file must be 10MB or smaller/);
    assert.match(
      advertiserVerification,
      /MAX_VERIFICATION_FILE_SIZE = 10 \* 1024 \* 1024/,
    );
    assert.match(
      influencerVerification,
      /MAX_VERIFICATION_FILE_SIZE = 10 \* 1024 \* 1024/,
    );
    assert.doesNotMatch(advertiserVerification, /4MB/);
    assert.doesNotMatch(influencerVerification, /4MB/);
  });

  it("routes frontend API calls through the API base helper", () => {
    const api = read("src/domain/api.ts");

    assert.match(api, /VITE_API_BASE_URL/);
    assert.match(api, /apiFetch/);

    for (const file of [
      "src/hooks/useVerificationSummary.ts",
      "src/pages/admin/SystemAdminDashboard.tsx",
      "src/pages/auth/SignupPage.tsx",
      "src/pages/influencer/ContractViewer.tsx",
      "src/pages/influencer/InfluencerDashboard.tsx",
      "src/pages/influencer/InfluencerLoginPage.tsx",
      "src/pages/influencer/InfluencerVerification.tsx",
      "src/pages/marketing/AdvertiserAuthGate.tsx",
      "src/pages/marketing/AdvertiserVerification.tsx",
      "src/pages/marketing/ContractAdminViewer.tsx",
      "src/pages/marketing/ContractBuilder.tsx",
      "src/store.ts",
    ]) {
      assert.doesNotMatch(read(file), /fetch\(\s*["'`]\/api/);
    }
  });

  it("requires an exact password confirmation before either signup contacts Supabase", () => {
    const server = read("server/index.ts");
    const advertiserSignupStart = server.indexOf(
      'app.post("/api/advertiser/signup"',
    );
    const influencerSignupStart = server.indexOf(
      'app.post("/api/influencer/signup"',
    );
    const advertiserSignup = server.slice(
      advertiserSignupStart,
      server.indexOf('app.post("/api/advertiser/logout"', advertiserSignupStart),
    );
    const influencerSignup = server.slice(
      influencerSignupStart,
      server.indexOf('app.post("/api/influencer/logout"', influencerSignupStart),
    );

    for (const signupSource of [advertiserSignup, influencerSignup]) {
      const mismatchIndex = signupSource.indexOf(
        "password !== passwordConfirmation",
      );
      const firstSupabaseAuthIndex = Math.min(
        ...[
          signupSource.indexOf("createSupabasePasswordSession("),
          signupSource.indexOf("createSupabaseSignupUser({"),
        ].filter((index) => index >= 0),
      );

      assert.notEqual(mismatchIndex, -1);
      assert.ok(
        mismatchIndex < firstSupabaseAuthIndex,
        "password confirmation must be checked before a Supabase Auth request",
      );
      assert.match(signupSource, /request\.body\?\.password_confirmation/);
      assert.match(signupSource, /code: "PASSWORD_CONFIRMATION_MISMATCH"/);
      assert.match(signupSource, /response\.status\(422\)/);
    }

    assert.equal(
      (server.match(/code: "PASSWORD_CONFIRMATION_MISMATCH"/g) ?? []).length,
      2,
    );
  });

  it("turns confirmation-mail provider failures into a concise Korean signup error", () => {
    const server = read("server/index.ts");
    const userMessages = read("src/domain/userMessages.ts");

    assert.match(server, /error sending confirmation email/);
    assert.match(
      server,
      /인증 메일을 보내지 못했습니다\. 잠시 후 다시 시도해 주세요\./,
    );
    assert.match(userMessages, /"Error sending confirmation email"/);
    assert.match(
      userMessages,
      /인증 메일을 보내지 못했습니다\. 잠시 후 다시 시도해 주세요\./,
    );
  });

  it("returns typed account setup and role mismatch results only after password auth", () => {
    const server = read("server/index.ts");
    const advertiserLoginStart = server.indexOf(
      'app.post("/api/advertiser/login"',
    );
    const influencerLoginStart = server.indexOf(
      'app.post("/api/influencer/login"',
    );
    const advertiserLogin = server.slice(
      advertiserLoginStart,
      server.indexOf('app.post("/api/advertiser/signup"', advertiserLoginStart),
    );
    const influencerLogin = server.slice(
      influencerLoginStart,
      server.indexOf('app.post("/api/influencer/signup"', influencerLoginStart),
    );

    for (const loginSource of [advertiserLogin, influencerLogin]) {
      const passwordSessionIndex = loginSource.indexOf(
        "createSupabasePasswordSession(email, password)",
      );
      assert.ok(passwordSessionIndex >= 0);
      assert.match(
        loginSource,
        /typeof request\.body\?\.password === "string" \? request\.body\.password : ""/,
      );
      assert.doesNotMatch(
        loginSource,
        /normalizeRequiredText\(request\.body\?\.password\)/,
      );
      assert.ok(
        loginSource.indexOf('code: "ACCOUNT_SETUP_INCOMPLETE"') >
          passwordSessionIndex,
      );
      assert.ok(
        loginSource.indexOf('code: "AUTH_ROLE_MISMATCH"') >
          passwordSessionIndex,
      );
      assert.ok(
        (loginSource.match(/terminateRoleSessionForAuthorizationFailure/g) ?? [])
          .length >= 2,
      );
      assert.match(loginSource, /accessToken: session\.access_token/);
      assert.match(loginSource, /refreshToken: session\.refresh_token/);
      assert.match(loginSource, /userId: session\.user\.id/);
      assert.match(loginSource, /response\.status\(401\)/);
    }

    assert.match(advertiserLogin, /signup_path: "\/signup\/advertiser"/);
    assert.match(advertiserLogin, /actual_role: "influencer"/);
    assert.match(
      advertiserLogin,
      /correct_login_path: "\/login\/influencer"/,
    );
    assert.match(influencerLogin, /signup_path: "\/signup\/influencer"/);
    assert.match(influencerLogin, /actual_role: "advertiser"/);
    assert.match(
      influencerLogin,
      /correct_login_path: "\/login\/advertiser"/,
    );
  });

  it("recovers a password-verified auth-only advertiser without overwriting profiles", () => {
    const server = read("server/index.ts");
    const advertiserSignupStart = server.indexOf(
      'app.post("/api/advertiser/signup"',
    );
    const advertiserSignup = server.slice(
      advertiserSignupStart,
      server.indexOf('app.post("/api/advertiser/logout"', advertiserSignupStart),
    );
    const mismatchIndex = advertiserSignup.indexOf(
      "password !== passwordConfirmation",
    );
    const recoveryStart = advertiserSignup.indexOf(
      "let existingPasswordSession",
    );
    const regularSignupStart = advertiserSignup.indexOf(
      "const authUser = await createSupabaseSignupUser",
    );
    const recoverySource = advertiserSignup.slice(
      recoveryStart,
      regularSignupStart,
    );

    assert.ok(
      mismatchIndex >= 0 &&
        recoveryStart > mismatchIndex &&
        regularSignupStart > recoveryStart,
    );
    assert.match(recoverySource, /createSupabasePasswordSession\(email, password\)/);
    assert.match(recoverySource, /if \(existingProfile\)/);
    assert.match(
      recoverySource,
      /insertSupabaseV2RowsIgnoringDuplicates\([\s\S]+"profiles"/,
    );
    assert.doesNotMatch(recoverySource, /upsertSupabaseV2Rows\(\s*"profiles"/);
    assert.match(recoverySource, /const recoveredProfile = await readProfileByUserId/);
    assert.match(recoverySource, /if \(!isAdvertiserRole\(recoveredProfile\.role\)\)/);
    assert.match(
      recoverySource,
      /ensureDefaultOrganizationForAdvertiserProfile\([\s\S]+recoveredProfile/,
    );
    assert.match(recoverySource, /recovered_signup: true/);
    assert.match(recoverySource, /next_path: nextPath/);
    assert.match(recoverySource, /setAdvertiserSessionCookies/);
    assert.match(
      recoverySource,
      /finally[\s\S]+if \(!keepRecoveredSession\)[\s\S]+revokeTemporarySupabaseSession/,
    );
    assert.match(recoverySource, /code: "ACCOUNT_ALREADY_REGISTERED"/);
    assert.match(recoverySource, /code: "AUTH_ROLE_MISMATCH"/);
  });

  it("recovers a password-verified auth-only influencer without overwriting profiles", () => {
    const server = read("server/index.ts");
    const influencerSignupStart = server.indexOf(
      'app.post("/api/influencer/signup"',
    );
    const influencerSignup = server.slice(
      influencerSignupStart,
      server.indexOf('app.post("/api/influencer/logout"', influencerSignupStart),
    );
    const recoveryStart = influencerSignup.indexOf(
      "let existingPasswordSession",
    );
    const regularSignupStart = influencerSignup.indexOf(
      "const authUser = await createSupabaseSignupUser",
    );
    const recoverySource = influencerSignup.slice(
      recoveryStart,
      regularSignupStart,
    );
    const signupUserHelperStart = server.indexOf(
      "const createSupabaseSignupUser",
    );
    const signupUserHelper = server.slice(
      signupUserHelperStart,
      server.indexOf(
        "const requestSupabasePasswordRecovery",
        signupUserHelperStart,
      ),
    );

    assert.ok(recoveryStart >= 0 && regularSignupStart > recoveryStart);
    assert.match(recoverySource, /createSupabasePasswordSession\(email, password\)/);
    assert.match(recoverySource, /if \(existingProfile\)/);
    assert.match(
      recoverySource,
      /insertSupabaseV2RowsIgnoringDuplicates\([\s\S]+"profiles"/,
    );
    assert.doesNotMatch(recoverySource, /upsertSupabaseV2Rows\(/);
    assert.match(recoverySource, /const recoveredProfile = await readProfileByUserId/);
    assert.match(recoverySource, /if \(!isInfluencerRole\(recoveredProfile\.role\)\)/);
    assert.match(recoverySource, /recovered_signup: true/);
    assert.match(
      influencerSignup,
      /const nextPath = normalizeSignupNextPath\([\s\S]+request\.body\?\.next_path,[\s\S]+"influencer",[\s\S]+\)/,
    );
    assert.match(recoverySource, /next_path: nextPath/);
    assert.match(recoverySource, /setInfluencerSessionCookies/);
    assert.match(recoverySource, /revokeTemporarySupabaseSession/);
    assert.match(
      signupUserHelper,
      /Array\.isArray\(authUser\.identities\)[\s\S]+authUser\.identities\.length === 0/,
    );
  });

  it("moves advertiser login to the destination shell before waiting for authentication response", () => {
    const app = read("src/App.tsx");
    const advertiserAuthGate = read(
      "src/pages/marketing/AdvertiserAuthGate.tsx",
    );
    const influencerLoginPage = read(
      "src/pages/influencer/InfluencerLoginPage.tsx",
    );
    const loginLanding = read("src/pages/auth/LoginLanding.tsx");
    const fastAuth = read("lib/fast-auth.ts");
    const server = read("server/index.ts");
    const loginStartIndex = advertiserAuthGate.indexOf(
      'const loginPromise = apiFetch("/api/advertiser/login"',
    );
    const optimisticNavigateIndex = advertiserAuthGate.indexOf(
      "navigate(redirectAfterLogin, { replace: true });",
      loginStartIndex,
    );
    const awaitLoginIndex = advertiserAuthGate.indexOf(
      "const response = await loginPromise;",
      loginStartIndex,
    );

    assert.match(app, /<AdvertiserAuthGate redirectAfterLogin=\{nextPath\}>/);
    assert.match(advertiserAuthGate, /useNavigate/);
    assert.match(
      advertiserAuthGate,
      /startFastLoginTransition\("advertiser"\)/,
    );
    assert.match(advertiserAuthGate, /prewarmAdvertiserLoginEndpoint/);
    assert.match(advertiserAuthGate, /method: "GET"/);
    assert.match(fastAuth, /warmFastAuthDependencies/);
    assert.match(
      fastAuth,
      /request\.method === "GET" \|\| request\.method === "HEAD"/,
    );
    assert.match(fastAuth, /supabaseAuthUrl\("\/settings"\)/);
    assert.match(
      fastAuth,
      /supabaseRestUrl\("profiles", "\?select=id&limit=1"\)/,
    );
    assert.ok(
      loginStartIndex > -1,
      "advertiser login request should be started",
    );
    assert.ok(
      optimisticNavigateIndex > loginStartIndex &&
        optimisticNavigateIndex < awaitLoginIndex,
      "advertiser login should move to the destination shell before waiting for the API response",
    );
    assert.match(advertiserAuthGate, /if \(!navigatedOptimistically\) \{/);
    assert.match(
      advertiserAuthGate,
      /waitForFastLoginTransition\("advertiser", 6_000\)/,
    );
    assert.match(advertiserAuthGate, /apiFetch\("\/api\/auth\/warmup"/);
    assert.match(
      advertiserAuthGate,
      /window\.location\.pathname !== redirectAfterLogin/,
    );
    assert.match(
      influencerLoginPage,
      /const isCampaignContinuation = nextPath\.startsWith\("\/campaigns\/"\)/,
    );
    assert.match(
      influencerLoginPage,
      /const shouldNavigateOptimistically = !isCampaignContinuation/,
    );
    assert.match(influencerLoginPage, /if \(shouldNavigateOptimistically\) \{/);
    assert.match(
      influencerLoginPage,
      /window\.location\.pathname !== destinationPath/,
    );
    assert.match(
      read("src/pages/influencer/ContractViewer.tsx"),
      /await waitForFastLoginTransition\("influencer", 6_000\)/,
    );
    assert.match(
      loginLanding,
      /const href = next[\s\S]+\? `\$\{role\.href\}\?next=/,
    );
    assert.match(loginLanding, /: role\.href/);

    const fastAuthAdvertiserLogin = fastAuth.slice(
      fastAuth.indexOf("async function handleAdvertiserLogin"),
      fastAuth.indexOf("async function handleInfluencerLogin"),
    );
    assert.doesNotMatch(
      fastAuthAdvertiserLogin,
      /readAdvertiserMessageSummary/,
    );
    assert.match(server, /includeMessageSummary: false/);
    assert.match(
      server,
      /const cachedStore = readSupabaseContractStoreCache\(\);[\s\S]+canAdvertiserAccessLegacyContract/,
    );
  });

  it("keeps advertiser marketplace messages focused on sent proposals", () => {
    const inbox = read("src/pages/marketplace/MarketplaceInboxPage.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const server = read("server/index.ts");
    const agents = read("AGENTS.md");

    assert.match(inbox, /role === "advertiser" \? "sent" : "inbox"/);
    assert.match(inbox, /summaryTitle:\s*\(openCount: number\) =>/);
    assert.match(
      inbox,
      /`보낸 1:1 계약 제안 \$\{openCount\.toLocaleString\(\)\}건이 진행 중입니다`/,
    );
    assert.match(inbox, /primaryBucketLabel: "보낸 계약 제안"/);
    assert.match(inbox, /eyebrow: "광고주 1:1 제안"/);
    assert.match(inbox, /secondLabel: "계약서 작성 완료"/);
    assert.match(inbox, /converted_to_contract: "계약서 작성 완료"/);
    assert.doesNotMatch(inbox, /광고주 계약 전환|secondLabel: "계약 전환"/);
    assert.match(inbox, /platformFilterOptions/);
    assert.match(inbox, /제안 종류/);
    assert.match(inbox, /1:1 계약 제안 관리/);
    assert.match(inbox, /1:1 계약 작성/);
    assert.doesNotMatch(inbox, /function PlatformPills/);
    assert.doesNotMatch(inbox, /formatPlatformLabel/);
    assert.match(
      inbox,
      /grid-cols-\[104px_minmax\(170px,0\.75fr\)_minmax\(330px,1\.45fr\)_132px_132px\]/,
    );
    assert.match(inbox, /function ProposalSummary/);
    assert.match(server, /addPlatformInfoToMarketplaceProposals/);
    assert.match(server, /marketplace_influencer_channels/);
    assert.match(
      inbox,
      /role === "advertiser"[\s\S]+id: "sent", label: copy\.primaryBucketLabel/,
    );
    assert.match(inbox, /function MessageThreadRow/);
    assert.match(inbox, /function isOneToOneMessageThread/);
    assert.match(
      inbox,
      /thread\.direction === "influencer_to_brand"[\s\S]+Boolean\(thread\.campaignId\)/,
    );
    assert.doesNotMatch(inbox, /지원자 목록/);
    assert.doesNotMatch(inbox, /function ApplicantSelectionRow/);
    assert.match(
      read("src/pages/marketing/Dashboard.tsx"),
      /function CampaignApplicantsPanel/,
    );
    assert.match(campaignPages, /function isCampaignApplicationThread/);
    assert.match(server, /isOneToOneMarketplaceMessageProposal/);
    assert.match(
      server,
      /rows\.filter\(isOneToOneMarketplaceMessageProposal\)/,
    );
    assert.match(
      server,
      /direction=eq\.influencer_to_brand[\s\S]+campaign_id=not\.is\.null[\s\S]+influencer dashboard campaign applications/,
    );
    assert.match(agents, /Message inboxes are only for 1:1 contract proposals/);
    assert.doesNotMatch(inbox, /function NotificationPanel/);
  });

  it("keeps influencer public profile links on the root handle URL", () => {
    const app = read("src/App.tsx");
    const publicProfile = read("src/domain/publicInfluencerProfile.ts");
    const marketplace = read("src/domain/marketplace.ts");
    const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
    const server = read("server/index.ts");
    const agents = read("AGENTS.md");
    const indexCss = read("src/index.css");
    const platformBrandMark = read("src/components/PlatformBrandMark.tsx");
    const platformDisplay = read("src/domain/platformDisplay.ts");
    const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const influencerPublicProfileSource = marketplacePages.slice(
      marketplacePages.indexOf("export function PublicInfluencerProfilePage"),
      marketplacePages.indexOf("export function PublicBrandProfilePage"),
    );

    assert.match(
      app,
      /<Route path="\/:profileHandle" element=\{<PublicInfluencerProfilePage \/>\} \/>/,
    );
    assert.match(
      publicProfile,
      /export function getInfluencerPublicProfilePath/,
    );
    assert.match(publicProfile, /return clean \? `\/\$\{clean\}` : "\/"/);
    assert.match(
      publicProfile,
      /export function formatInfluencerPublicProfileUrl/,
    );
    assert.match(
      publicProfile,
      /return clean \? `yeollock\.me\/\$\{clean\}` : "yeollock\.me"/,
    );
    assert.match(marketplace, /profile\.publicProfilePublished && profile\.publicProfileHandle/);
    assert.match(marketplace, /normalizeMarketplaceHandle\([\s\S]+profile\.handle/);
    const counterpartHrefHelper = server.slice(
      server.indexOf("const getMarketplaceCounterpartHref"),
      server.indexOf("const loadSignedPdfBoldFont"),
    );
    assert.match(
      counterpartHrefHelper,
      /row\.target_influencer_public_handle[\s\S]+getInfluencerPublicProfilePath\(row\.target_influencer_public_handle\)/,
    );
    assert.match(
      counterpartHrefHelper,
      /getInfluencerPublicProfilePath\(row\.sender_influencer_handle\)/,
    );
    assert.doesNotMatch(
      counterpartHrefHelper,
      /getInfluencerPublicProfilePath\(row\.target_handle\)/,
    );
    assert.match(
      server,
      /profile\?\.data_origin === "production"[\s\S]+profile\.is_published[\s\S]+profile\.registered_identity_only !== true/,
    );
    assert.doesNotMatch(marketplacePages, /yeollock\.me\/\{profile\.handle\}/);
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /formatInfluencerPublicProfileUrl/,
    );
    assert.match(
      agents,
      /Blue primary CTAs were directly requested by the Product Owner as a product-wide rule/,
    );
    assert.match(indexCss, /--yl-primary: #2563eb/);
    assert.match(
      influencerPublicProfileSource,
      /data-profile-layout="creator-media-kit"/,
    );
    assert.match(
      influencerPublicProfileSource,
      /getMarketplaceInfluencerAvatarUrl\(profile\)/,
    );
    assert.match(
      influencerPublicProfileSource,
      /channelSummaries = profile\.platforms\.slice\(0, 4\)/,
    );
    assert.match(influencerPublicProfileSource, /href=\{platform\.url\}/);
    assert.match(
      influencerPublicProfileSource,
      /const publicInfluencerHeader: PublicProfileHeaderConfig/,
    );
    assert.match(
      influencerPublicProfileSource,
      /authenticatedHref: "\/advertiser\/discover"/,
    );
    assert.match(influencerPublicProfileSource, /forceHref: "\/influencer\/profile"/);
    assert.match(
      influencerPublicProfileSource,
      /<PublicProfileHeader[\s\S]*?mode=\{advertiserShellMode\}[\s\S]*?publicInfluencerHeader/,
    );
    assert.match(influencerPublicProfileSource, /lg:hidden/);
    assert.match(influencerPublicProfileSource, /bg-blue-600/);
    assert.match(influencerPublicProfileSource, /1:1 계약 제안/);
    assert.match(agents, /first screens should not show money/);
    assert.match(
      agents,
      /proposal areas must call the primary action `1:1 계약 제안`/,
    );
    assert.match(
      agents,
      /account for one, two, three, and four verified platforms/,
    );
    assert.match(
      agents,
      /Remove explanatory labels such as "플랫폼 \/ 팔로워", "팔로워", "구독자", or "이웃"/,
    );
    assert.match(agents, /categories should read as simple premium text/);
    assert.match(influencerPublicProfileSource, /lg:pt-14/);
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /profile\.responseTimeLabel/,
    );
    assert.doesNotMatch(influencerPublicProfileSource, /startingPriceLabel/);
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /플랫폼 \/ 팔로워|다른 인플루언서 보기|profile\.location/,
    );
    assert.match(
      agents,
      /platform and follower\/subscriber metrics are primary decision data/,
    );
    assert.match(agents, /recognizable official-brand platform marks/);
    assert.match(agents, /shared with dashboard platform pills/);
    assert.match(agents, /extra bordered or white rounded wrapper/);
    assert.match(agents, /around a 28px raw brand mark/);
    assert.match(agents, /Remove explanatory labels such as/);
    assert.match(
      agents,
      /visually bind the platform name\/logo to its audience number/,
    );
    assert.match(agents, /tall `justify-between` stat tiles/);
    assert.match(
      agents,
      /On mobile only, render each verified platform as one horizontal row/,
    );
    assert.match(agents, /On desktop, keep the platform area block-like/);
    assert.match(agents, /upper profile action area/);
    assert.match(agents, /larger representative channel blocks/);
    assert.match(agents, /one platform uses the full strip/);
    assert.match(agents, /two platforms split the strip evenly/);
    assert.match(agents, /existing compact external-link icon/);
    assert.match(agents, /Do not show a text tooltip or visible text button/);
    assert.match(agents, /image bezels should stay present but restrained/);
    assert.match(agents, /hiding nonessential handles/);
    assert.match(platformBrandMark, /export function PlatformBrandMark/);
    assert.doesNotMatch(
      platformBrandMark,
      /export function getPlatformDisplayName/,
    );
    assert.match(platformDisplay, /export function getPlatformDisplayName/);
    assert.match(platformBrandMark, /md: "h-7 w-7"/);
    assert.doesNotMatch(
      platformBrandMark,
      /border border-neutral-200 bg-white/,
    );
    assert.match(platformDisplay, /platform === "instagram"/);
    assert.match(platformDisplay, /platform === "naver_blog"/);
    assert.match(
      marketplacePages,
      /from "\.\.\/\.\.\/components\/PlatformBrandMark"/,
    );
    assert.match(
      marketplacePages,
      /from "\.\.\/\.\.\/domain\/platformDisplay"/,
    );
    assert.match(
      influencerPublicProfileSource,
      /PlatformBrandMark platform=\{platform\.platform\}/,
    );
    assert.match(
      influencerPublicProfileSource,
      /getPlatformDisplayName\(platform\.platform\)/,
    );
    assert.match(influencerPublicProfileSource, /platformCount === 1/);
    assert.match(influencerPublicProfileSource, /platformCount === 2/);
    assert.match(influencerPublicProfileSource, /platformCount === 3/);
    assert.match(
      influencerPublicProfileSource,
      /hasFeaturedPlatformLayout = platformCount <= 2/,
    );
    assert.match(
      influencerPublicProfileSource,
      /grid-cols-\[minmax\(0,1fr\)_auto_auto\]/,
    );
    assert.match(
      influencerPublicProfileSource,
      /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/,
    );
    assert.match(influencerPublicProfileSource, /variant="detail"/);
    assert.match(
      influencerPublicProfileSource,
      /lg:grid-cols-\[minmax\(0,1fr\)\]/,
    );
    assert.match(
      influencerPublicProfileSource,
      /lg:grid-cols-\[repeat\(2,minmax\(0,1fr\)\)\]/,
    );
    assert.match(
      influencerPublicProfileSource,
      /lg:grid-cols-\[repeat\(3,minmax\(150px,1fr\)\)\]/,
    );
    assert.match(
      influencerPublicProfileSource,
      /lg:grid-cols-\[repeat\(4,minmax\(116px,1fr\)\)\]/,
    );
    assert.match(influencerPublicProfileSource, /lg:gap-x-5/);
    assert.match(influencerPublicProfileSource, /lg:flex lg:flex-col/);
    assert.match(influencerPublicProfileSource, /lg:min-h-\[118px\]/);
    assert.match(
      influencerPublicProfileSource,
      /lg:items-center lg:justify-center/,
    );
    assert.match(influencerPublicProfileSource, /lg:text-\[48px\]/);
    assert.match(
      influencerPublicProfileSource,
      /hidden shrink-0 items-center justify-end gap-2 lg:flex/,
    );
    assert.match(influencerPublicProfileSource, /lg:hidden/);
    assert.match(influencerPublicProfileSource, /ExternalLink/);
    assert.match(influencerPublicProfileSource, /h-\[200px\]/);
    assert.match(influencerPublicProfileSource, /p-1\.5 sm:p-2\.5/);
    assert.match(influencerPublicProfileSource, /text-\[22px\]/);
    assert.match(influencerPublicProfileSource, /sm:text-\[24px\]/);
    assert.match(influencerPublicProfileSource, /lg:mt-3/);
    assert.match(influencerPublicProfileSource, /lg:text-\[36px\]/);
    assert.match(
      influencerPublicProfileSource,
      /lg:absolute lg:right-0 lg:top-0/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /인플루언서 계정으로 이동/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /group-hover:opacity-100/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /group-focus-visible:opacity-100/,
    );
    assert.doesNotMatch(influencerPublicProfileSource, />계정 보기</);
    assert.doesNotMatch(influencerPublicProfileSource, /연결하기/);
    assert.doesNotMatch(influencerPublicProfileSource, /p-3 sm:p-5/);
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /flex-col justify-between/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /hidden truncate text-\[13px\]/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /getPlatformAudienceMetricLabel/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /getPlatformIcon\(platform\.platform/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /text-\[32px\]|text-\[42px\]/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /lg:grid-cols-\[minmax\(0,1fr\)_184px\]/,
    );
    assert.doesNotMatch(influencerPublicProfileSource, /lg:w-\[184px\]/);
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /lg:grid-cols-\[minmax\(220px,260px\)\]/,
    );
    assert.doesNotMatch(influencerPublicProfileSource, /lg:max-w-\[520px\]/);
    assert.match(
      influencerPublicProfileSource,
      /aria-label=\{\[[\s\S]+getPlatformDisplayName\(platform\.platform\)[\s\S]+platform\.handle[\s\S]+platform\.followersLabel[\s\S]+platform\.performanceLabel[\s\S]+"계정 보기"[\s\S]+\.join\(" "\)\}/,
    );
    assert.match(
      agents,
      /proposal panels must not stretch into tall empty cards/,
    );
    assert.match(agents, /polished creator media-kit first page/);
    assert.match(agents, /awkward stretched CTAs/);
    assert.match(
      agents,
      /Desktop proposal CTAs should be separated into the upper profile action area/,
    );
    assert.match(influencerPublicProfileSource, /data-profile-platform-strip/);
    assert.match(
      influencerPublicProfileSource,
      /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/,
    );
    assert.match(influencerPublicProfileSource, /w-\[156px\]/);
    assert.match(influencerPublicProfileSource, /justify-end gap-2 lg:flex/);
    assert.match(influencerPublicProfileSource, /lg:hidden/);
    assert.match(influencerPublicProfileSource, /min-h-\[52px\]/);
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /lg:grid-cols-\[minmax\(0,1fr\)_184px\]/,
    );
    assert.doesNotMatch(influencerPublicProfileSource, /lg:w-\[184px\]/);
    assert.match(influencerPublicProfileSource, /rounded-\[28px\]/);
    assert.match(
      advertiserDashboard,
      /from "\.\.\/\.\.\/components\/PlatformBrandMark"/,
    );
    assert.match(
      advertiserDashboard,
      /<PlatformBrandMark platform="youtube" size="sm" \/>/,
    );
    assert.match(
      advertiserDashboard,
      /<PlatformBrandMark platform="instagram" size="sm" \/>/,
    );
    assert.match(
      agents,
      /Dashboard platform columns should show platform logos only/,
    );
    assert.match(
      advertiserDashboard,
      /aria-label=\{`플랫폼 \$\{items\.map\(\(item\) => item\.title\)\.join\(", "\)\}`\}/,
    );
    assert.match(advertiserDashboard, /function CampaignPlatformMarks/);
    assert.match(
      advertiserDashboard,
      /<CampaignPlatformMarks platforms=\{campaign\.platforms\} title=\{platformLabel\} \/>/,
    );
    assert.doesNotMatch(advertiserDashboard, />\{item\.label\}<\/span>/);
    assert.match(
      campaignPages,
      /from "\.\.\/\.\.\/components\/PlatformBrandMark"/,
    );
    assert.match(campaignPages, /from "\.\.\/\.\.\/domain\/platformDisplay"/);
    assert.match(campaignPages, /function CampaignPlatformLogoMarks/);
    assert.match(
      campaignPages,
      /<PlatformBrandMark platform=\{platform\} size="sm" \/>/,
    );
    assert.match(campaignPages, /getPlatformDisplayName\(platform\)/);
    assert.match(campaignPages, /aria-label=\{`플랫폼 \$\{label\}`\}/);
    assert.match(
      marketplacePages,
      /inline-flex max-w-full items-center gap-1\.5 text-\[12px\] font-extrabold/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /대표 콘텐츠|플랫폼 \/ 팔로워|다른 인플루언서 보기|profile\.location|portfolioItems|profile\.portfolio|ProfileInfoRow/,
    );
  });

  it("keeps discovered influencer candidates out of the 1:1 proposal flow", () => {
    const marketplace = read("src/domain/marketplace.ts");
    const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
    const server = read("server/index.ts");

    assert.match(marketplace, /source\?: "registered" \| "discovered"/);
    assert.match(marketplace, /source: profile\.source \?\? "registered"/);
    assert.match(
      marketplace,
      /accountProfiles\.length > 0 \? accountProfiles : mergeMarketplaceInfluencerProfiles\(\)/,
    );
    assert.match(server, /source: "registered"/);
    assert.match(server, /source: "discovered"/);
    assert.doesNotMatch(
      server,
      /return mergeMarketplaceInfluencerProfiles\(visibleProfiles\)/,
    );
    assert.match(server, /if \(profile\.source === "discovered"\)/);
    assert.match(
      server,
      /연락미에 등록된 인플루언서에게만 1:1 계약 제안을 보낼 수 있습니다/,
    );
    assert.match(
      marketplacePages,
      /function isRegisteredMarketplaceInfluencer\(profile: MarketplaceInfluencerProfile\)/,
    );
    assert.match(
      marketplacePages,
      /const canPropose =[\s\S]+isRegisteredMarketplaceInfluencer\(profile\) && profile\.platformVerified === true/,
    );
    assert.match(server, /code: "influencer_platform_verification_required"/);
    assert.match(marketplacePages, /채널 보기/);
    assert.match(
      marketplacePages,
      /title=\{primaryChannelUrl \? "공개 채널 보기" : "프로필 보기"\}/,
    );
    assert.match(marketplacePages, /프로필 준비 전/);
    assert.doesNotMatch(
      marketplacePages,
      /primaryChannelUrl \?\? getInfluencerProfilePath\(profile\)/,
    );
    assert.match(
      marketplacePages,
      /target=\{primaryChannelUrl \? "_blank" : undefined\}/,
    );
  });

  it("derives influencer public profile handles from the first registered platform outside the dashboard strip", () => {
    const publicProfile = read("src/domain/publicInfluencerProfile.ts");
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260514012437_allow_dot_in_influencer_public_handles.sql",
    );

    assert.match(
      publicProfile,
      /export function getAutomaticPublicProfileHandle/,
    );
    assert.match(
      publicProfile,
      /const firstPlatformHandle = platforms\?\.\[0\]\?\.handle/,
    );
    assert.match(publicProfile, /handle: defaults\.handle/);
    assert.match(publicProfile, /\[a-z0-9_\.-\]/);
    assert.match(
      server,
      /const automaticHandle = getAutomaticPublicProfileHandle\(approvedPlatforms\) \?\? ""/,
    );
    assert.match(
      server,
      /await buildApprovedInfluencerPlatforms\(\s*verificationRequests,?\s*\)/,
    );
    assert.match(server, /parseDateAscending\(a\.created_at, b\.created_at\)/);
    assert.doesNotMatch(
      server,
      /normalizePublicProfileHandle\(normalizeRequiredText\(body\.handle\)\)/,
    );
    assert.match(
      migration,
      /drop constraint if exists marketplace_influencer_profiles_handle_format/,
    );
    assert.match(migration, /order by owner_profile_id, created_at asc/);
  });

  it("opens manual influencer public handles only after conflicts and queues appeals", () => {
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const server = read("server/index.ts");

    assert.match(server, /findInfluencerPublicHandleConflict/);
    assert.match(server, /code: "public_profile_handle_conflict"/);
    assert.match(server, /body\.alternateHandle/);
    assert.doesNotMatch(server, /body\.handle/);
    assert.match(
      server,
      /app\.post\("\/api\/influencer\/public-profile\/handle-appeal"/,
    );
    assert.match(server, /request_type: "public_profile_handle_claim"/);
    assert.match(adminDashboard, /public_profile_handle_claim/);
    assert.match(adminDashboard, /공개 주소 소유권 이의신청/);
  });

  it("starts generated clauses as pending review and moves influencer signing through PDF review", () => {
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const reviewCtaStart = viewer.indexOf("if (shouldShowContractReviewCta)");
    const reviewCtaEnd = viewer.indexOf(
      "if (hasVerificationStatusError)",
      reviewCtaStart,
    );
    const reviewCtaBlock = viewer.slice(reviewCtaStart, reviewCtaEnd);
    const signGate = viewer.slice(
      viewer.indexOf("const canOpenSignModal"),
      viewer.indexOf("const signButtonLabel"),
    );

    assert.match(builder, /status:\s*"PENDING_REVIEW"/);
    assert.match(builder, /influencerContact[\s\S]+서명 계정 확인/);
    assert.match(viewer, /shouldShowPdfReview/);
    assert.match(viewer, /function PdfContractPreview/);
    assert.match(viewer, /pdfjsLib\.getDocument/);
    assert.match(viewer, /aria-label="계약서 PDF 1페이지 미리보기"/);
    assert.match(viewer, /Array\.from\(\{ length: pageCount \}/);
    assert.match(viewer, /renderedPageNumbers\.size === pageCount/);
    assert.match(viewer, /const reachedDocumentEnd =/);
    assert.match(
      viewer,
      /scrollContainer\.scrollTop \+ scrollContainer\.clientHeight[\s\S]+scrollContainer\.scrollHeight - 24/,
    );
    assert.match(
      viewer,
      /!allPagesRendered[\s\S]+!hasReachedFinalPage[\s\S]+onReviewComplete\?\.\(\)/,
    );
    assert.ok(reviewCtaStart >= 0 && reviewCtaEnd > reviewCtaStart);
    assert.match(reviewCtaBlock, /setRevealedContractDocumentKey/);
    assert.doesNotMatch(reviewCtaBlock, /setReviewedContractDocumentKey/);
    assert.match(signGate, /hasReviewedContractDocument/);
    assert.match(
      viewer,
      /PDF 계약서와 계정 인증이 확인되어 서명할 수 있습니다/,
    );
    assert.doesNotMatch(viewer, /checkedClauseIdsByContract/);
    assert.doesNotMatch(viewer, /toggleClauseConfirmation/);
    assert.doesNotMatch(viewer, /확인 체크/);
    assert.doesNotMatch(
      viewer,
      /계약서 조항을 모두 체크하면 서명할 수 있습니다/,
    );
    assert.doesNotMatch(viewer, /canSubmitClauseReview/);
    assert.doesNotMatch(viewer, /const approveClause = \(/);
    assert.doesNotMatch(viewer, /이 조항 승인/);
    assert.match(adminViewer, /검토 대기/);
  });

  it("keeps public auth and signature evidence server-authored", () => {
    const server = read("server/index.ts");
    const legalConsent = read("src/domain/legalConsent.ts");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");
    const signRouteStart = server.indexOf(
      'app.post("/api/contracts/:id/signatures/influencer"',
    );
    const signRouteEnd = server.indexOf(
      'app.put("/api/contracts/:id"',
      signRouteStart,
    );
    const signRoute = server.slice(signRouteStart, signRouteEnd);
    const authHeadersStart = server.indexOf("const supabaseAuthHeaders");
    const authHeadersEnd = server.indexOf(
      "const supabaseStorageHeaders",
      authHeadersStart,
    );
    const authHeaders = server.slice(authHeadersStart, authHeadersEnd);

    assert.match(server, /Production requires Supabase/);
    assert.match(server, /Production requires SUPABASE_PUBLISHABLE_KEY/);
    assert.match(
      server,
      /app\.set\("trust proxy", isHostedRuntime \? 1 : false\)/,
    );
    assert.match(authHeaders, /const key = supabasePublishableKey/);
    assert.doesNotMatch(authHeaders, /supabaseServiceRoleKey/);
    assert.match(legalConsent, /SIGNATURE_CONSENT_TEXT/);
    assert.match(legalConsent, /directsign-signature-consent-v2/);
    assert.match(
      legalConsent,
      /전자서명 안내 문서를 확인했고 전자서명에 동의합니다/,
    );
    assert.match(
      server,
      /const signatureConsentText\s*=\s*SIGNATURE_CONSENT_TEXT/,
    );
    assert.match(viewer, /SIGNATURE_CONSENT_TEXT/);
    assert.match(viewer, /\/legal\/e-sign-consent/);
    assert.match(
      server,
      /setSignedPdfAccessCookie\(response, updatedContract\)/,
    );
    assert.match(signRoute, /share_token_status:\s*"revoked"/);
    assert.doesNotMatch(signRoute, /request\.body\?\.consent_text/);
    assert.match(server, /buildServerAuthoredContract/);
  });

  it("server-authors advertiser trust and surfaces only a compact verification badge", () => {
    const server = read("server/index.ts");
    const contracts = read("src/domain/contracts.ts");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");

    assert.match(contracts, /advertiser_trust/);
    assert.match(server, /buildAdvertiserTrustSnapshot/);
    assert.match(server, /first_contract_on_yeollock/);
    assert.match(
      server,
      /Advertiser trust metadata cannot be changed by influencer/,
    );
    assert.match(viewer, /BusinessVerificationBadge/);
    assert.match(viewer, /사업자 인증 완료/);
    assert.doesNotMatch(viewer, /AdvertiserTrustNotice/);
    assert.doesNotMatch(viewer, /위험점수/);
  });

  it("keeps legacy share token decrypt warnings opt-in and deduplicated", () => {
    const server = read("server/index.ts");
    const decryptStart = server.indexOf(
      "const decryptShareTokenFromLegacyStore",
    );
    const decryptEnd = server.indexOf("const normalizeContract", decryptStart);
    const decryptBlock = server.slice(decryptStart, decryptEnd);

    assert.match(server, /DIRECTSIGN_LOG_LEGACY_TOKEN_DECRYPT_WARNINGS/);
    assert.match(server, /loggedLegacyShareTokenDecryptFailures/);
    assert.match(server, /maxLoggedLegacyShareTokenDecryptFailures/);
    assert.match(decryptBlock, /if \(logLegacyShareTokenDecryptWarnings\)/);
    assert.match(decryptBlock, /createHash\("sha256"\)\.update\(value\)/);
    assert.match(decryptBlock, /console\.warn\(`/);
    assert.doesNotMatch(
      decryptBlock,
      /console\.warn\("\[yeollock\.me\] failed to decrypt legacy share token"\)/,
    );
  });

  it("rejects unsafe external contract URLs before they reach user-facing links", () => {
    const server = read("server/index.ts");
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");

    assert.match(server, /Influencer channel URL must be an http\(s\) URL/);
    assert.match(server, /Tracking link must be an http\(s\) URL/);
    assert.match(builder, /메인 채널 URL은 http 또는 https 주소여야 합니다/);
    assert.match(
      builder,
      /추적 링크는 http 또는 https 주소만 입력할 수 있습니다/,
    );
    assert.match(adminViewer, /getSafeExternalHref/);
    assert.match(adminViewer, /safeInfluencerHref/);
  });

  it("allows free individual operation without business registration disclosure", () => {
    const legalEntity = read("src/domain/legalEntity.ts");
    const legalPage = read("src/pages/legal/LegalDocumentPage.tsx");
    const envExample = read(".env.example");
    const launchReadiness = read("docs/launch-readiness.md");
    const ownerMemo = read("docs/owner-action-memo.md");

    assert.match(envExample, /VITE_LEGAL_OPERATING_MODE="free_individual"/);
    assert.match(legalEntity, /"free_individual"/);
    assert.match(legalEntity, /"registered_business"/);
    assert.match(legalEntity, /해당 없음\(무료 개인 운영\)/);
    assert.match(legalEntity, /required: isRegisteredBusiness/);
    assert.match(
      launchReadiness,
      /operator personal\/business fields can remain\s+blank during development, QA, and early validation/,
    );
    assert.match(ownerMemo, /free_individual[\s\S]+공개 문의 이메일 중심/);
    assert.doesNotMatch(legalPage, /출시 전 입력 필요/);
    assert.doesNotMatch(legalPage, /미설정/);
    assert.doesNotMatch(launchReadiness, /출시 전 입력 필요/);
    assert.doesNotMatch(launchReadiness, /REAL_OPERATOR_NAME/);
    assert.doesNotMatch(ownerMemo, /출시 전 입력 필요/);
    assert.doesNotMatch(ownerMemo, /REAL_OPERATOR_NAME/);
  });

  it("discloses that free signup and usage can later become paid", () => {
    const legalPage = read("src/pages/legal/LegalDocumentPage.tsx");
    const signupPage = read("src/pages/auth/SignupPage.tsx");
    const server = read("server/index.ts");

    assert.match(server, /const signupTermsVersion = "2026-06-02"/);
    assert.match(server, /const signupPrivacyPolicyVersion = "2026-08-11\.2"/);
    assert.match(signupPage, /const TERMS_DOCUMENT_VERSION = "2026-06-02"/);
    assert.match(
      signupPage,
      /const PRIVACY_POLICY_DOCUMENT_VERSION = "2026-08-11\.2"/,
    );
    assert.match(signupPage, /LEGAL_CONTACT_EMAIL/);
    assert.match(signupPage, /동의 일시와 문서 버전이 저장됩니다/);
    assert.match(signupPage, /현재 가입과 기본 서비스 이용은 무료입니다/);
    assert.match(
      signupPage,
      /향후 일부 또는 전체\s+기능이 유료로 전환될 수 있으며/,
    );
    assert.match(legalPage, /effectiveDate: "2026-08-11"/);
    assert.match(legalPage, /documentVersion: "2026-08-11\.2"/);
    assert.match(
      legalPage,
      /향후 일부 또는 전체 기능이 유료로 전환될 수 있으며/,
    );
    assert.match(legalPage, /전환 전 별도 고지/);
    assert.match(legalPage, /처리위탁 및 국외 처리/);
    assert.match(legalPage, /Vercel은 서울 리전/);
    assert.match(legalPage, /Supabase와 그 기반 AWS는 일본 도쿄 리전/);
    assert.match(
      legalPage,
      /가입·로그인·대시보드·메시지·알림·인증·계약·공유 링크·서명·관리자 화면/,
    );
    assert.match(legalPage, /전자적 형태라는 이유만으로 효력이 부인되지/);
    assert.match(legalPage, /별도 서면, 공증, 인감, 원본 제출/);
  });

  it("keeps verification provider credentials optional with strict fallback", () => {
    const server = read("server/index.ts");
    const envExample = read(".env.example");
    const influencerVerification = read(
      "src/pages/influencer/InfluencerVerification.tsx",
    );
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");

    assert.match(envExample, /NTS_BUSINESS_STATUS_API_KEY=""/);
    assert.match(envExample, /NTS_BUSINESS_VALIDATE_API_KEY=""/);
    assert.match(envExample, /VERIFICATION_AUTO_APPROVE_BUSINESS="true"/);
    assert.match(envExample, /VERIFICATION_AUTO_APPROVE_PLATFORM="false"/);
    assert.match(envExample, /YOUTUBE_DATA_API_KEY=""/);
    assert.match(envExample, /NAVER_CLIENT_ID=""/);
    assert.match(envExample, /TIKTOK_CLIENT_KEY=""/);
    assert.match(envExample, /TIKTOK_ACCOUNT_ACCESS_TOKEN=""/);
    assert.match(envExample, /META_APP_ID=""/);
    assert.match(envExample, /META_GRAPH_ACCESS_TOKEN=""/);
    assert.match(envExample, /META_WEBHOOK_VERIFY_TOKEN=""/);
    assert.match(envExample, /VITE_INSTAGRAM_OFFICIAL_HANDLE="yeollockme"/);
    assert.match(server, /runBusinessRegistrationAutomationCheck/);
    assert.match(server, /buildVerificationAutomationPlan/);
    assert.match(server, /runPlatformAccountAutomationCheck/);
    assert.match(server, /extractNaverBlogId/);
    assert.match(server, /parseYoutubeVideoId/);
    assert.match(server, /fetchYoutubeVideoForProof/);
    assert.match(server, /https:\/\/www\.googleapis\.com\/youtube\/v3\/videos/);
    assert.match(server, /proof_video_channel_matched/);
    assert.match(server, /video\.snippet\.description/);
    assert.match(server, /Instagram 공개 증빙 URL/);
    assert.match(server, /TikTok 공개 증빙 URL/);
    assert.match(server, /proof_source/);
    assert.match(
      server,
      /\/api\/admin\/verification-requests\/:id\/automation-check/,
    );
    assert.match(server, /\/api\/webhooks\/instagram/);
    assert.match(server, /business_start_date/);
    assert.match(server, /VERIFICATION_AUTO_APPROVE_BUSINESS/);
    assert.match(server, /VERIFICATION_AUTO_APPROVE_PLATFORM/);
    assert.match(server, /status: "not_configured"/);
    assert.match(server, /provider: "youtube_data_api"/);
    assert.match(server, /provider: "tiktok_login_kit"/);
    assert.match(server, /provider: "instagram_messaging_webhook"/);
    assert.match(server, /"instagram_dm_code"/);
    assert.match(server, /runInstagramDmWebhookCheck/);
    assert.doesNotMatch(server, /pending operator review|approve manually/);
    assert.match(server, /business_registration: businessAutomationCheck/);
    assert.match(server, /platform_account: platformAutomationCheck/);
    assert.match(influencerVerification, /Instagram DM 인증/);
    assert.match(influencerVerification, /instagramDmChallenge\.official_handle/);
    assert.match(influencerVerification, /instagramDmChallenge\.official_url/);
    assert.match(adminDashboard, /Instagram DM 인증/);
  });

  it("keeps Instagram DM ownership challenges server-issued, exact, and one-time", () => {
    const server = read("server/index.ts");
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const instagramDmModule = read("server/instagram-dm-verification.ts");
    const influencerVerification = read(
      "src/pages/influencer/InfluencerVerification.tsx",
    );
    const envExample = read(".env.example");
    const migration = read(
      "supabase/migrations/20260802090000_add_instagram_dm_challenge_automation.sql",
    );
    const lifecycleMigration = read(
      "supabase/migrations/20260802091000_enforce_instagram_dm_challenge_lifecycle.sql",
    );
    const atomicMigration = read(
      "supabase/migrations/20260802092000_add_atomic_instagram_dm_transitions.sql",
    );
    const webhookStart = server.indexOf("const verifyMetaWebhookSignature");
    const webhookSource = `${instagramDmModule}\n${server.slice(
      webhookStart,
      server.indexOf("const latestVerificationForTarget", webhookStart),
    )}`;
    const influencerRouteStart = server.indexOf(
      'app.post("/api/verification/influencer"',
    );
    const influencerRouteSource = server.slice(
      influencerRouteStart,
      server.indexOf('app.get("/api/admin/verification-requests"', influencerRouteStart),
    );
    const automationPlanStart = server.indexOf(
      "const buildVerificationAutomationPlan",
    );
    const automationPlanSource = server.slice(
      automationPlanStart,
      server.indexOf("const buildNotConfiguredAutomationResult", automationPlanStart),
    );
    const operationalTestStart = server.indexOf(
      "const isOperationalTestVerificationRequest",
    );
    const operationalTestSource = server.slice(
      operationalTestStart,
      server.indexOf("const normalizeSelectedValues", operationalTestStart),
    );
    const verificationAlertStart = server.indexOf(
      "const enqueueVerificationOperationalAlert",
    );
    const verificationAlertSource = server.slice(
      verificationAlertStart,
      server.indexOf("const enqueueSupportTicketOperationalAlert", verificationAlertStart),
    );
    const retryingProviderRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "influencer-owner-1",
      target_id: "influencer-owner-1",
      created_at: "2026-08-02T02:55:00.000Z",
      status: "pending",
      platform: "instagram",
      platform_handle: "creator.name",
      platform_url: "https://instagram.com/creator.name",
      ownership_verification_method: "instagram_dm_code",
      ownership_challenge_code_hash: "hash:active",
      ownership_challenge_code_ciphertext: "cipher:active",
      ownership_challenge_consumed_at: null,
      ownership_challenge_expires_at: "2026-08-02T03:10:00.000Z",
    };
    const retryingProviderState = () => "retrying_provider";

    assert.match(envExample, /VERIFICATION_AUTO_APPROVE_INSTAGRAM_DM="false"/);
    assert.match(envExample, /META_INSTAGRAM_ACCESS_TOKEN=""/);
    assert.match(envExample, /META_INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT=""/);
    assert.match(server, /const instagramDmChallengeTtlMs = 10 \* 60 \* 1000/);
    assert.match(server, /const createInstagramDmChallengeCode/);
    assert.match(server, /randomBytes\(8\)/);
    assert.match(server, /hashInstagramDmChallengeCode/);
    assert.match(server, /encryptInstagramDmChallengeCode/);
    assert.match(server, /decryptInstagramDmChallengeCode/);
    assert.match(server, /readActiveInstagramDmChallenge/);
    assert.match(server, /aes-256-gcm/);
    assert.match(server, /VERIFICATION_AUTO_APPROVE_INSTAGRAM_DM === "true"/);
    assert.match(
      automationPlanSource,
      /instagramDmRuntimeEnv\.every\(\(name\) => hasText\(process\.env\[name\]\)\)/,
    );
    assert.match(automationPlanSource, /instagramDmTokenExpiry > Date\.now\(\)/);
    assert.match(
      automationPlanSource,
      /process\.env\.VERIFICATION_AUTO_APPROVE_INSTAGRAM_DM === "true"/,
    );
    assert.match(
      influencerRouteSource,
      /isInstagramDmMethod[\s\S]+createInstagramDmChallengeCode\(\)/,
    );
    assert.match(
      influencerRouteSource,
      /Cache-Control", "private, no-store"/,
    );
    assert.match(
      influencerRouteSource,
      /INSTAGRAM_DM_AUTOMATION_UNAVAILABLE/,
    );
    assert.match(
      influencerRouteSource,
      /const isOperationalTestSubmission =[\s\S]+hasOperationalTestEmail[\s\S]+hasOperationalTestMarker/,
    );
    assert.match(
      influencerRouteSource,
      /enqueueInstagramDmAutomationUnavailableAlert\([\s\S]{0,180}isOperationalTestSubmission/,
    );
    assert.match(influencerRouteSource, /readActiveInstagramDmChallenge/);
    assert.match(
      influencerRouteSource,
      /const platformHandle = isInstagramDmMethod\s+\? instagramDmUsername/,
    );
    assert.match(
      influencerRouteSource,
      /`https:\/\/www\.instagram\.com\/\$\{instagramDmUsername\}\//,
    );
    assert.match(
      influencerRouteSource,
      /catch \(error\) \{\s+if \(isInstagramDmMethod\)/,
    );
    assert.match(influencerRouteSource, /ownership_challenge_code_hash/);
    assert.match(influencerRouteSource, /ownership_challenge_code_ciphertext/);
    assert.match(
      influencerRouteSource,
      /ownership_challenge_code: isInstagramDmMethod[\s\S]{0,100}\? undefined/,
    );
    assert.match(influencerRouteSource, /instagram_dm_challenge/);
    assert.match(influencerRouteSource, /request\.query\.request_id/);
    assert.ok(
      influencerRouteSource.indexOf("record = await insertVerificationRequest") <
        influencerRouteSource.indexOf(
          "await supersedeActiveInstagramDmChallengeForFallback",
        ),
      "alternate request must be stored before the previous DM challenge is superseded",
    );
    assert.match(
      influencerRouteSource,
      /\/api\/verification\/influencer\/instagram-dm-challenge/,
    );
    assert.match(webhookSource, /isStillAuthoritative/);
    assert.match(webhookSource, /freshSupabase: true/);
    assert.match(
      influencerVerification,
      /fetchInstagramDmChallenge\(requestId\)/,
    );
    assert.match(
      influencerVerification,
      /challenge\.request_id !== requestId/,
    );
    assert.match(webhookSource, /expectedRecipientId/);
    assert.match(webhookSource, /recipientId !== expectedRecipientId/);
    assert.match(webhookSource, /message\?\.is_echo === true/);
    assert.match(webhookSource, /https:\/\/graph\.instagram\.com/);
    assert.match(webhookSource, /Authorization: `Bearer \$\{metaInstagramAccessToken\}`/);
    assert.match(webhookSource, /senderUsername !== requestedHandle/);
    assert.match(webhookSource, /profileUrlHandle !== requestedHandle/);
    assert.match(webhookSource, /status=eq\.pending/);
    assert.match(webhookSource, /ownership_challenge_consumed_at=is\.null/);
    assert.match(webhookSource, /ownership_challenge_expires_at=gt\./);
    assert.match(webhookSource, /Prefer: "return=representation"/);
    assert.match(webhookSource, /ownership_challenge_code_ciphertext: null/);
    assert.match(webhookSource, /delete instagramDm\.failure_reason/);
    assert.match(webhookSource, /Promise\.allSettled/);
    assert.match(
      webhookSource,
      /rpc\/directsign_consume_instagram_dm_challenge/,
    );
    assert.match(webhookSource, /enqueueInstagramDmFailureOperationalAlert\(saved, reason\)\.catch/);
    assert.match(instagramDmModule, /"retrying_provider"/);
    assert.match(
      operationalTestSource,
      /if \(explicitOrigin === true\) return true/,
    );
    assert.doesNotMatch(
      operationalTestSource,
      /if \(explicitOrigin !== undefined\) return explicitOrigin/,
    );
    assert.match(operationalTestSource, /hasOperationalTestEmail/);
    assert.match(operationalTestSource, /hasOperationalTestMarker/);
    assert.match(server, /isOperationalTest: isOperationalTestVerificationRequest/);
    assert.match(
      verificationAlertSource,
      /const enqueueVerificationOperationalAlert[\s\S]+isOperationalTestVerificationRequest\(record\)/,
    );
    assert.match(
      verificationAlertSource,
      /const enqueueInstagramDmFailureOperationalAlert[\s\S]+isOperationalTestVerificationRequest\(record\)/,
    );
    assert.equal(
      isAwaitingInstagramDmRestoreRecord(
        retryingProviderRecord,
        new Date("2026-08-02T03:00:00.000Z").getTime(),
        retryingProviderState,
      ),
      true,
    );
    assert.equal(
      selectInstagramDmRestoreRecord([retryingProviderRecord], {
        nowMs: new Date("2026-08-02T03:00:00.000Z").getTime(),
        getChallengeState: retryingProviderState,
      })?.id,
      retryingProviderRecord.id,
    );
    assert.equal(
      isActionableInstagramDmManualReview(
        retryingProviderRecord,
        [retryingProviderRecord],
        retryingProviderState,
      ),
      false,
    );
    assert.match(server, /enqueueInstagramDmFailureOperationalAlert/);
    assert.match(server, /인증 코드 만료/);
    assert.match(server, /제출 계정과 DM 발신 계정 불일치/);
    assert.match(server, /Meta 발신자 조회 일시 실패/);
    assert.match(server, /enqueueInstagramDmTokenExpiryOperationalAlert/);
    assert.match(server, /const isActionableManualVerificationRequest/);
    assert.match(
      server,
      /Instagram DM verification is still waiting for the signed webhook/,
    );
    assert.match(
      adminDashboard,
      /isVisiblePendingVerificationRequest\(request, verificationRequests\)/,
    );
    assert.match(adminDashboard, /function isInstagramDmProviderRetryRequest/);
    assert.match(
      adminDashboard,
      /getInstagramDmState\(request\) === "retrying_provider"/,
    );
    assert.match(
      adminDashboard,
      /const canReview = isActionableManualVerificationRequest/,
    );
    assert.match(adminDashboard, /const linkedItemMissing/);
    assert.match(adminDashboard, /현재 작업 대상이 아닙니다/);
    assert.doesNotMatch(
      adminDashboard,
      /find\(\(item\) => item\.key === selectedItemKey\) \?\?\s+visibleItems\[0\]/,
    );
    assert.match(server, /hasNewerInstagramVerificationRequestForSameHandle/);
    assert.match(
      server,
      /Instagram DM verification is retried only by the signed webhook/,
    );
    assert.match(
      server,
      /A newer Instagram ownership verification request is authoritative/,
    );
    assert.match(
      adminDashboard,
      /request\.ownership_verification_method !==\s+"instagram_dm_code"/,
    );
    assert.match(server, /const ownershipVerifierUserAgent = "yeollock-ownership-verifier\/1\.0"/);
    assert.doesNotMatch(server, /`\$\{productName\} ownership verifier`/);
    assert.match(migration, /add value if not exists 'instagram_dm_code'/);
    assert.match(migration, /ownership_challenge_code_hash text/);
    assert.match(migration, /ownership_challenge_code_ciphertext text/);
    assert.match(migration, /ownership_challenge_expires_at timestamptz/);
    assert.match(migration, /ownership_challenge_consumed_at timestamptz/);
    assert.match(migration, /verification_requests_active_challenge_hash_idx/);
    assert.match(migration, /verification_requests_one_active_instagram_dm_idx/);
    assert.match(migration, /regexp_replace\(platform_handle, '\^@\+', ''\)/);
    assert.match(server, /rpc\/directsign_review_instagram_dm_challenge/);
    assert.match(
      atomicMigration,
      /lock table public\.verification_requests in share row exclusive mode/,
    );
    assert.match(
      atomicMigration,
      /directsign_consume_instagram_dm_challenge[\s\S]+not exists/,
    );
    assert.match(
      atomicMigration,
      /directsign_review_instagram_dm_challenge[\s\S]+not exists/,
    );
    assert.match(
      atomicMigration,
      /revoke all on function[\s\S]+from public, anon, authenticated/,
    );
    assert.match(atomicMigration, /to service_role/);
    assert.match(
      server,
      /isInstagramDmTerminalReview[\s\S]+ownership_challenge_code_hash: null[\s\S]+ownership_challenge_code_ciphertext: null/,
    );
    assert.match(
      server,
      /isInstagramDmTerminalReview \? "&status=eq\.pending"/,
    );
    assert.match(
      lifecycleMigration,
      /verification_requests_terminal_dm_challenge_cleared_chk/,
    );
    assert.match(lifecycleMigration, /or status = 'pending'/);
    assert.match(lifecycleMigration, /ownership_challenge_code_hash is null/);
    assert.match(
      lifecycleMigration,
      /ownership_challenge_code_ciphertext is null/,
    );
  });

  it("uses strict three-field NTS advertiser verification before document fallback", () => {
    const server = read("server/index.ts");
    const advertiserVerification = read(
      "src/pages/marketing/AdvertiserVerification.tsx",
    );
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const legalPage = read("src/pages/legal/LegalDocumentPage.tsx");
    const agents = read("AGENTS.md");
    const automationStart = server.indexOf(
      "const runBusinessRegistrationAutomationCheck",
    );
    const automationSource = server.slice(
      automationStart,
      server.indexOf("const buildNotConfiguredAutomationResult", automationStart),
    );
    const routeStart = server.indexOf(
      'app.post("/api/verification/advertiser"',
    );
    const routeSource = server.slice(
      routeStart,
      server.indexOf('app.post("/api/verification/influencer"', routeStart),
    );

    assert.match(server, /check\.profile\?\.business_status_code === "01"/);
    assert.match(server, /check\.profile\?\.validate_status === "matched"/);
    assert.match(server, /process\.env\.VERIFICATION_AUTO_APPROVE_BUSINESS !== "false"/);
    assert.match(automationSource, /Promise\.all\(/);
    assert.match(automationSource, /start_dt: businessStartDate/);
    assert.match(automationSource, /p_nm: representativeName/);
    assert.doesNotMatch(automationSource, /b_nm|subjectName/);
    assert.match(automationSource, /statusResult\?\.b_stt_cd === "01"/);
    assert.match(automationSource, /!statusPayloadValid \|\| !validatePayloadValid/);

    assert.match(routeSource, /submissionMode === "automatic"/);
    assert.match(routeSource, /outcome: "evidence_required"/);
    assert.match(routeSource, /outcome: autoApprove \? "approved" : "pending_manual_review"/);
    assert.match(routeSource, /verification_method: autoApprove \? "nts_three_field"/);
    assert.match(routeSource, /Cache-Control", "private, no-store"/);
    assert.ok(
      routeSource.indexOf('outcome: "evidence_required"') <
        routeSource.indexOf("insertVerificationRequest"),
    );
    assert.match(
      routeSource,
      /!autoApprove && evidenceFile[\s\S]+storeEvidenceFile/,
    );

    for (const label of ["사업자등록번호", "대표자명", "개업일자"]) {
      assert.match(advertiserVerification, new RegExp(`label="${label}"`));
    }
    assert.match(advertiserVerification, /submission_mode: submissionMode/);
    assert.match(advertiserVerification, /data\.outcome === "evidence_required"/);
    assert.match(advertiserVerification, /\{activeFallback \? \(/);
    assert.doesNotMatch(advertiserVerification, /label="회사\/브랜드명"/);
    assert.doesNotMatch(advertiserVerification, /label="담당자명"/);
    assert.doesNotMatch(advertiserVerification, /label="담당자 이메일"/);
    assert.doesNotMatch(advertiserVerification, /보통 1영업일/);

    assert.match(adminDashboard, /서류 전환 사유/);
    assert.match(adminDashboard, /business_start_date/);
    assert.match(adminDashboard, /request\.representative_name/);
    assert.match(legalPage, /국세청 자동 확인이 되지 않는 경우에만 증빙 파일/);
    assert.match(
      agents,
      /default advertiser business-verification path is an immediate National Tax Service check/,
    );
  });

  it("keeps Kim Jaewoo UI guardrails aligned with rendered copy", () => {
    const agents = read("AGENTS.md");
    const landing = read("src/pages/landing/LandingPages.tsx");
    const qaStandard = read("scripts/qa-standard.mjs");
    const kimGuardrails = read("scripts/kim-jaewoo-guardrails.mjs");
    const captureSalesAssets = read("scripts/capture-sales-assets.mjs");
    const authLoginScreen = read("src/components/AuthLoginScreen.tsx");
    const advertiserVerification = read(
      "src/pages/marketing/AdvertiserVerification.tsx",
    );
    const influencerVerification = read(
      "src/pages/influencer/InfluencerVerification.tsx",
    );
    const influencerProfileSettings = read(
      "src/pages/influencer/InfluencerPublicProfileSettingsPage.tsx",
    );
    const seedAccounts = read("scripts/seed-test-accounts.mjs");
    const seedQaMarketplaceScenario = read(
      "scripts/seed-qa-marketplace-scenario.mjs",
    );
    const server = read("server/index.ts");
    const dashboardSurfaceSwitch = read(
      "src/components/DashboardSurfaceSwitch.tsx",
    );
    const dashboardSurfaces = read("src/domain/dashboardSurfaces.ts");
    const mobileSurfaceSwitch = read("src/components/MobileSurfaceSwitch.tsx");
    const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
    const influencerDashboard = read(
      "src/pages/influencer/InfluencerDashboard.tsx",
    );
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
    const responsiveFilterPanel = read("src/components/ResponsiveFilterPanel.tsx");
    const influencerLoginPage = read(
      "src/pages/influencer/InfluencerLoginPage.tsx",
    );
    const signupPage = read("src/pages/auth/SignupPage.tsx");
    const practitionerIntroduction = read(
      "docs/sales/advertiser-practitioner-introduction.html",
    );
    const practitionerGuide = read(
      "docs/sales/advertiser-practitioner-guide.html",
    );
    const app = read("src/App.tsx");
    const marketplaceDomain = read("src/domain/marketplace.ts");
    const influencerSearch = read("src/domain/marketplaceInfluencerSearch.ts");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const marketplace = read("src/pages/marketplace/MarketplacePages.tsx");
    const advertiserCampaignDetailStart = advertiserDashboard.indexOf(
      "function CampaignDetailView",
    );
    const advertiserCampaignDetailEnd = advertiserDashboard.indexOf(
      "function CampaignInfluencerTableHeaderRow",
      advertiserCampaignDetailStart,
    );
    const advertiserCampaignDetailSource = advertiserDashboard.slice(
      advertiserCampaignDetailStart,
      advertiserCampaignDetailEnd,
    );
    const campaignParticipantEmptyStart = advertiserDashboard.indexOf(
      "function CampaignParticipantEmptyState",
    );
    const campaignParticipantEmptyEnd = advertiserDashboard.indexOf(
      "function CampaignLoadingState",
      campaignParticipantEmptyStart,
    );
    const campaignParticipantEmptySource = advertiserDashboard.slice(
      campaignParticipantEmptyStart,
      campaignParticipantEmptyEnd,
    );
    const supportersCampaignMigration = read(
      "supabase/migrations/20260526093000_allow_supporters_campaign_type.sql",
    );

    assert.match(agents, /Kim Jaewoo Agent must be strict/);
    assert.match(
      agents,
      /Repeated Product Owner corrections must become executable guardrails/,
    );
    assert.match(
      agents,
      /Mobile customer-facing list surfaces must keep every row\/card reachable/,
    );
    assert.match(
      agents,
      /Dashboard cells must not show raw placeholder values/,
    );
    assert.match(
      agents,
      /External analytics must never expose contract share tokens/,
    );
    assert.equal(
      packageJson.scripts?.["guardrails:kim"],
      "node scripts/kim-jaewoo-guardrails.mjs",
    );
    assert.match(qaStandard, /guardrails:kim/);
    assert.match(kimGuardrails, /캠페인 목록/);
    assert.match(kimGuardrails, /공유 가능/);
    assert.match(
      kimGuardrails,
      /influencer account strip shows verified accounts directly/,
    );
    assert.match(
      kimGuardrails,
      /influencer verification approved state is shown in one place/,
    );
    assert.match(
      kimGuardrails,
      /advertiser verification approved state is shown in one place/,
    );
    assert.match(kimGuardrails, /disabled auth CTA is visibly disabled/);
    assert.match(kimGuardrails, /fallback titles stay contract-centered/);
    assert.match(kimGuardrails, /row titles stay contract-centered/);
    assert.match(kimGuardrails, /live stale settlement titles are normalized/);
    assert.match(
      kimGuardrails,
      /mobile contract and campaign surfaces are explicit/,
    );
    assert.match(
      kimGuardrails,
      /advertiser campaign tab opens dashboard before creation/,
    );
    assert.match(
      kimGuardrails,
      /mobile influencer campaign lists are scrollable/,
    );
    assert.match(
      kimGuardrails,
      /advertiser campaign dashboard avoids placeholder campaign values/,
    );
    assert.match(
      kimGuardrails,
      /advertiser campaign dashboard date formatter returns D-day before date/,
    );
    assert.match(
      kimGuardrails,
      /advertiser campaign dashboard urgent D-day segment is red/,
    );
    assert.match(
      kimGuardrails,
      /influencer dashboard date formatter returns D-day before date/,
    );
    assert.match(
      kimGuardrails,
      /influencer dashboard urgent D-day segment is red/,
    );
    assert.match(
      kimGuardrails,
      /test advertiser campaign dashboard seed covers varied lifecycle cases/,
    );
    assert.match(
      kimGuardrails,
      /supporters campaign type creates product-mission contract guardrails/,
    );
    assert.match(
      kimGuardrails,
      /signup consent records version and operation contact/,
    );
    assert.match(
      kimGuardrails,
      /signature consent copy is shared between UI and server/,
    );
    assert.match(
      kimGuardrails,
      /support access consent is enforced server-side and linked from both parties/,
    );
    assert.match(
      kimGuardrails,
      /analytics tracking avoids sensitive contract data/,
    );
    assert.match(
      kimGuardrails,
      /indexed influencer directory keeps exact totals without full-corpus reads/,
    );
    assert.match(
      kimGuardrails,
      /cache optimization keeps public and sensitive data separated/,
    );
    assert.match(
      kimGuardrails,
      /advertiser contract detail keeps one state-specific PDF download action/,
    );
    assert.match(
      kimGuardrails,
      /public route error recovery does not force login/,
    );
    assert.match(
      kimGuardrails,
      /mobile advertiser header avoids duplicate surface label/,
    );
    assert.match(
      kimGuardrails,
      /mobile influencer header avoids duplicate surface label/,
    );
    assert.match(
      kimGuardrails,
      /influencer mobile rows do not repeat deadline values/,
    );
    assert.match(
      kimGuardrails,
      /OpenDesign is a separate local daemon\/web app workflow/,
    );
    assert.match(kimGuardrails, /mobile clipped list corrections are recorded/);
    assert.match(
      kimGuardrails,
      /paired advertiser\/influencer dashboard rule is recorded/,
    );
    assert.match(
      kimGuardrails,
      /dashboard and inbox column headers stay stronger than filters/,
    );
    assert.match(
      agents,
      /Table and list headers are navigation anchors, not helper text/,
    );
    assert.match(kimGuardrails, /first role selection uses action buttons/);
    assert.match(kimGuardrails, /mobile main role title stays compact/);
    assert.match(
      kimGuardrails,
      /advertiser creator discovery and applicant selection support follower sorting/,
    );
    assert.match(
      kimGuardrails,
      /advertiser sales PDF campaign applicant capture feels full/,
    );
    assert.match(
      kimGuardrails,
      /campaign selection stays inside campaign surface/,
    );
    assert.match(
      agents,
      /A campaign remains a one-to-many campaign surface after applicant selection/,
    );
    assert.match(advertiserDashboard, /선정자별 진행을 관리합니다/);
    assert.doesNotMatch(
      advertiserDashboard,
      /지원자와 선정자별 진행을 관리합니다/,
    );
    assert.doesNotMatch(
      advertiserDashboard,
      /선정하면 이 캠페인의 계약서가 만들어집니다/,
    );
    assert.match(advertiserDashboard, /캠페인 계약서 진행이 시작됩니다/);
    assert.match(advertiserCampaignDetailSource, /모집 현황/);
    assert.match(advertiserCampaignDetailSource, /선정자별 진행/);
    assert.doesNotMatch(advertiserCampaignDetailSource, /1:1 계약 목록/);
    assert.match(
      campaignParticipantEmptySource,
      /아직 선정자별 진행이 없습니다/,
    );
    assert.match(
      campaignParticipantEmptySource,
      /계약서와 서명 진행이 이곳에 표시됩니다/,
    );
    assert.doesNotMatch(
      campaignParticipantEmptySource,
      /아직 1:1 계약이 없습니다/,
    );
    assert.match(
      campaignPages,
      /선정하면 이 캠페인의 계약서 초안이 만들어집니다/,
    );
    assert.match(campaignPages, /캠페인 계약서 진행이 시작됩니다/);
    assert.match(practitionerIntroduction, /선정자별 진행을 관리합니다/);
    assert.match(practitionerGuide, /캠페인 상세에서 선정자별로 봅니다/);
    assert.match(app, /path="\/campaigns\/:campaignId"/);
    assert.match(app, /PublicCampaignRecruitmentPage/);
    assert.match(
      server,
      /app\.get\("\/api\/marketplace\/campaigns\/:campaignId"/,
    );
    assert.match(
      campaignPages,
      /export function PublicCampaignRecruitmentPage/,
    );
    assert.match(campaignPages, /function getPublicCampaignDisplayCopy/);
    assert.match(
      campaignPages,
      /const campaignCopy = campaign \? getPublicCampaignDisplayCopy\(campaign\) : null/,
    );
    assert.match(marketplaceDomain, /acceptsApplications: boolean/);
    assert.match(marketplaceDomain, /function isMarketplaceApplicationBrandId/);
    assert.match(
      marketplaceDomain,
      /acceptsApplications: isMarketplaceApplicationBrandId\(brand\.id\)/,
    );
    assert.match(
      server,
      /isMarketplaceApplicationBrandId\(campaign\.brandId\)/,
    );
    assert.match(campaignPages, /function canApplyToMarketplaceCampaign/);
    assert.match(
      campaignPages,
      /isMarketplaceApplicationBrandId\(campaign\.brandId\)/,
    );
    assert.match(campaignPages, /신청 준비 중/);
    assert.match(campaignPages, /\/api\/influencer\/session/);
    assert.match(
      server,
      /insertSupabaseRowsReturning<SupabaseMarketplaceContactProposalRow>\(\s*"marketplace_contact_proposals"/,
    );
    assert.match(server, /campaign_id: campaign\.id/);
    assert.match(
      advertiserDashboard,
      /for \(const thread of getCampaignApplicationThreads\(messageThreads\)\)/,
    );
    assert.match(
      advertiserDashboard,
      /thread\.campaignId\s*\?\s*`campaign:\$\{thread\.campaignId\}`/,
    );
    assert.match(advertiserDashboard, /group\.applicants\.push\(thread\)/);
    assert.match(
      advertiserDashboard,
      /const applicants = useMemo\([\s\S]*?campaign\.applicants/,
    );
    assert.match(campaignPages, /href: "\/influencer\/campaigns"/);
    assert.match(campaignPages, /getCampaignSharePath\(campaign\)/);
    assert.match(advertiserDashboard, /copyCampaignShareLink/);
    assert.match(advertiserDashboard, /getCampaignShareUrl\(campaign\)/);
    assert.match(influencerLoginPage, /"\/campaigns"/);
    assert.match(signupPage, /"\/campaigns"/);
    for (const source of [
      advertiserDashboard,
      campaignPages,
      practitionerIntroduction,
      practitionerGuide,
    ]) {
      assert.doesNotMatch(source, /계약 전환/);
      assert.doesNotMatch(source, /계약 흐름으로 연결/);
      assert.doesNotMatch(source, /계약으로 넘깁니다/);
      assert.doesNotMatch(source, /이후에는 1:1 계약 대시보드에서 관리/);
      assert.doesNotMatch(source, /이후 관리는 1:1 계약/);
    }
    assert.match(kimGuardrails, /intro pages use the PDF proposal slide frame/);
    assert.match(agents, /sales\/PDF proposal flow as a manual carousel/);
    assert.match(agents, /subtle left\/right controls/);
    assert.match(agents, /same PDF slide-page composition/);
    assert.match(agents, /Do not duplicate the PDF's internal brand\/header/);
    assert.match(
      agents,
      /do not place the intro content inside a white\/card-like screen wrapper/,
    );
    assert.match(
      agents,
      /brand marks and brand text should stay black\/neutral/,
    );
    assert.match(landing, /const advertiserProposalSlides/);
    assert.match(landing, /const influencerProposalSlides/);
    assert.match(landing, /function ProposalIntroCarousel/);
    assert.match(landing, /광고주 PDF 제안서형 인트로 슬라이드/);
    assert.match(landing, /인플루언서 PDF 제안서형 인트로 슬라이드/);
    assert.match(landing, /data-intro-pdf-carousel/);
    assert.match(landing, /data-intro-pdf-slide/);
    assert.doesNotMatch(landing, /shadow-\[0_28px_86px/);
    assert.doesNotMatch(landing, /linear-gradient\(112deg,transparent_0_61%/);
    assert.doesNotMatch(landing, /pointer-events-none absolute inset-3/);
    assert.doesNotMatch(landing, /yl-primary-action inline-flex h-\[34px\]/);
    assert.match(
      landing,
      /inline-flex h-9 items-center gap-3 border-0 bg-transparent text-neutral-950 shadow-none/,
    );
    assert.doesNotMatch(landing, /function ProposalSlideBrand/);
    assert.doesNotMatch(landing, /<ProposalSlideBrand/);
    assert.match(landing, /aria-label=\{`이전 \$\{controlLabel\}`\}/);
    assert.match(landing, /aria-label=\{`다음 \$\{controlLabel\}`\}/);
    assert.match(landing, /yeollock-contract-builder-first-screen\.png/);
    assert.match(landing, /yeollock-intro-contract-builder-focused\.png/);
    assert.match(landing, /yeollock-intro-contract-share-focused\.png/);
    assert.match(landing, /yeollock-influencer-contract\.png/);
    assert.match(landing, /yeollock-intro-content-review-focused\.png/);
    assert.match(landing, /yeollock-contract-handshake\.png/);
    assert.match(landing, /yeollock-intro-campaign-applicants-focused\.png/);
    assert.match(
      landing,
      /function IntroMobileServiceCapture[\s\S]*?className="h-full w-full object-contain object-center"/,
    );
    assert.match(qaStandard, /광고비 먹튀/);
    assert.match(qaStandard, /협찬품 미반환/);
    assert.doesNotMatch(
      qaStandard,
      /requiredText: \["계약 흐름을", "한눈에 관리", "작성중", "진행중", "종료"\]/,
    );
    assert.match(
      agents,
      /choose the campaign with the most visible selectable influencer rows first/,
    );
    assert.match(agents, /12 or more applicants for proposal captures/);
    assert.match(agents, /not zooming or enlarging the screenshot/);
    assert.match(seedAccounts, /applicantCount: 12/);
    assert.match(captureSalesAssets, /openCount: 0/);
    assert.match(captureSalesAssets, /activeOpenCount: 0/);
    assert.match(captureSalesAssets, /\{ width: 1440, height: 1250 \}/);
    assert.match(captureSalesAssets, /fillCampaignApplicantsForSalesCapture/);
    assert.match(captureSalesAssets, /rows\.length < 12/);
    assert.match(
      captureSalesAssets,
      /count \+ "명 표시 · 전체 " \+ count \+ "명"/,
    );
    assert.match(captureSalesAssets, /b\.count - a\.count/);
    assert.match(captureSalesAssets, /b\.openCount - a\.openCount/);
    assert.match(captureSalesAssets, /b\.activeOpenCount - a\.activeOpenCount/);
    assert.match(landing, /data-start-role-action/);
    assert.match(landing, /min-h-\[248px\]/);
    assert.match(
      landing,
      /text-\[36px\] leading-none tracking-normal text-neutral-950 sm:text-\[47px\]/,
    );
    assert.match(landing, /mt-auto block min-w-0/);
    assert.match(landing, /mt-3 block border-t/);
    assert.match(landing, /브랜드 · 광고대행사 · 쇼핑몰 · 로컬매장/);
    assert.match(landing, /크리에이터 · 유튜버 · 틱톡커 · 블로거 · 스트리머/);
    assert.match(app, /data-signup-role-action/);
    assert.doesNotMatch(
      app,
      /광고 계약을 만들 광고주인지, 받은 계약을 검토할 인플루언서인지 선택해 주세요/,
    );
    assert.match(mobileSurfaceSwitch, /data-mobile-surface-switch/);
    assert.match(mobileSurfaceSwitch, /DASHBOARD_SURFACE_ITEMS/);
    assert.match(dashboardSurfaceSwitch, /data-dashboard-surface-switch/);
    assert.match(dashboardSurfaceSwitch, /data-dashboard-surface-active/);
    assert.match(dashboardSurfaceSwitch, /인플루언서 대시보드 전환/);
    assert.match(dashboardSurfaceSwitch, /DASHBOARD_SURFACE_ITEMS/);
    assert.match(dashboardSurfaces, /href: "\/influencer\/dashboard"/);
    assert.match(dashboardSurfaces, /href: "\/influencer\/campaigns"/);
    assert.ok(
      dashboardSurfaces.indexOf(
        '{ id: "campaigns", label: "캠페인", href: "/advertiser/campaigns" }',
      ) <
        dashboardSurfaces.indexOf(
          '{ id: "contracts", label: "1:1 계약", href: "/advertiser/dashboard" }',
        ),
    );
    assert.ok(
      dashboardSurfaces.indexOf(
        '{ id: "campaigns", label: "캠페인", href: "/influencer/campaigns" }',
      ) <
        dashboardSurfaces.indexOf(
          '{ id: "contracts", label: "1:1 계약", href: "/influencer/dashboard" }',
        ),
    );
    assert.match(
      advertiserDashboard,
      /<DashboardSurfaceSwitch role="advertiser" active=\{surface\} \/>/,
    );
    assert.match(
      influencerDashboard,
      /<DashboardSurfaceSwitch role="influencer" active="contracts" \/>/,
    );
    assert.match(influencerDashboard, /인스타그램 계정 인증하기/);
    assert.match(influencerDashboard, /인증 계속하기/);
    assert.doesNotMatch(influencerDashboard, /인증한 플랫폼 없음/);
    assert.match(
      influencerVerification,
      /<DashboardSurfaceSwitch role="influencer" \/>/,
    );
    assert.match(
      influencerVerification,
      /<MobileSurfaceSwitch role="influencer" \/>/,
    );
    assert.doesNotMatch(influencerVerification, /label="이름\/활동명"/);
    assert.doesNotMatch(influencerVerification, /label="연락 이메일"/);
    assert.doesNotMatch(influencerVerification, /서명 조건/);
    assert.match(
      server,
      /const submittedByEmail =\s+influencerAuth\.profile\.email \?\? influencerAuth\.user\.email/,
    );
    assert.match(
      campaignPages,
      /<DashboardSurfaceSwitch role=\{role\} active="campaigns" \/>/,
    );
    assert.match(
      kimGuardrails,
      /marketplace discovery separates platform and category filters/,
    );
    assert.match(agents, /Platform and category are separate discovery axes/);
    assert.match(
      agents,
      /Category chips and filters must use customer-facing Korean labels/,
    );
    assert.match(agents, /channel-size sorting by subscribers\/followers/);
    assert.match(
      marketplacePages,
      /const \[categoryFilters, setCategoryFilters\]/,
    );
    assert.match(
      influencerSearch,
      /categoryFilters\.has\(getCategoryFilterKey\(category\)\)/,
    );
    assert.match(marketplacePages, /function getCategoryFilterKey/);
    assert.match(marketplacePages, /MARKETPLACE_CREATOR_CATEGORY_OPTIONS/);
    assert.match(marketplacePages, /normalizeMarketplaceCreatorCategory/);
    assert.match(marketplacePages, /searchPlaceholder="카테고리 검색"/);
    assert.match(marketplacePages, /function InfluencerFilterPanelContents/);
    assert.match(marketplacePages, /function DirectMultiFilterSection/);
    assert.match(marketplacePages, /lg:max-h-40 lg:overflow-y-auto/);
    assert.match(marketplacePages, /getPlatformDisplayName\(platform\)/);
    assert.doesNotMatch(marketplacePages, /플랫폼 · 카테고리 · 국가/);
    assert.match(responsiveFilterPanel, /yl-primary-action/);
    assert.doesNotMatch(responsiveFilterPanel, /"전체 조건"/);
    assert.match(
      responsiveFilterPanel,
      /onClear && activeCount > 0 && !mobileOnly/,
    );
    assert.match(marketplacePages, /categoryFilters=\{categoryFilters\}/);
    assert.match(marketplacePages, /function InfluencerSortSelect/);
    assert.match(marketplacePages, /audience_desc/);
    assert.match(marketplacePages, /searchParams\.set\("sort", influencerSort\)/);
    assert.match(marketplacePages, /구독자·팔로워 많은순/);
    assert.match(marketplaceDomain, /function getChannelAudienceSortValue/);
    assert.match(marketplaceDomain, /function compareChannelAudienceValues/);
    assert.match(
      agents,
      /authoritative server-side numbered pagination with exactly 100 eligible discovery entries/,
    );
    assert.match(server, /readMarketplaceInfluencerPlatformFilter/);
    assert.match(
      server,
      /const profileFilters = \{ \.\.\.filters, platform \}/,
    );
    assert.match(server, /readPublicMarketplaceInfluencerProfileByHandle/);
    assert.match(
      marketplacePages,
      /useMarketplaceInfluencers\([\s\S]+platformFilter,[\s\S]+savedOnly,[\s\S]+query,[\s\S]+categoryFilters,[\s\S]+countryFilters/,
    );
    assert.match(marketplacePages, /requestGenerationRef/);
    assert.match(
      marketplacePages,
      /searchParams\.set\("platform", platformFilter\)/,
    );
    assert.match(marketplacePages, /data-influencer-table-scroll="true"/);
    assert.match(marketplacePages, /data-influencer-list-scroll="true"/);
    assert.match(marketplacePages, /function InfluencerPagination/);
    assert.match(marketplacePages, /aria-current/);
    assert.doesNotMatch(marketplacePages, /new IntersectionObserver/);
    assert.match(campaignPages, /function CampaignCategoryFilterList/);
    assert.match(campaignPages, /<CampaignCategoryFilterList/);
    assert.match(campaignPages, /function CampaignFilterListSection/);
    assert.match(app, /path="\/advertiser\/campaigns"/);
    assert.match(app, /<Dashboard surface="campaigns" \/>/);
    assert.match(app, /path="\/advertiser\/campaigns\/new"/);
    assert.match(app, /function isPrivateApplicationPath/);
    assert.match(
      app,
      /import \{ LegalDocumentPage \} from "\.\/pages\/legal\/LegalDocumentPage"/,
    );
    assert.match(app, /label: "처음으로 이동"/);
    assert.match(app, /recoveryHref=\{routeErrorRecovery\.href\}/);
    assert.match(qaStandard, /"\/advertiser\/campaigns\/new"/);
    assert.match(qaStandard, /hasRouteErrorBoundary/);
    assert.match(advertiserDashboard, /to="\/advertiser\/campaigns\/new"/);
    assert.match(campaignPages, /backHref="\/advertiser\/campaigns"/);
    assert.doesNotMatch(campaignPages, /받은 계약/);
    assert.match(marketplaceDomain, /\| "supporters"/);
    assert.match(marketplaceDomain, /supporters: "서포터즈"/);
    assert.match(marketplaceDomain, /experience_group: "체험단"/);
    assert.match(marketplaceDomain, /other: "기타"/);
    assert.match(
      campaignPages,
      /OTHER_CAMPAIGN_TYPE_OPTION_LABEL = "기타\(직접작성\)"/,
    );
    assert.match(marketplace, /oneToOneProposalTypeOptions/);
    assert.doesNotMatch(marketplace, /campaignProposalTypeOptions/);
    assert.match(server, /campaign_supporters_resale_ban/);
    assert.match(server, /서포터즈 활동 자격은 자동 박탈/);
    assert.match(server, /campaign_supporters_posting_mission/);
    assert.match(server, /콘텐츠 조건 불이행/);
    assert.match(supportersCampaignMigration, /'supporters'/);
    assert.match(seedAccounts, /type: "supporters"/);
    assert.match(server, /fallbackMarketplaceCampaignPosts/);
    assert.match(server, /public marketplace cache cold fallback/);
    assert.match(server, /publicMarketplaceCache\.delete\(key\)/);
    assert.match(server, /process\.env\.VERCEL === "1"/);
    assert.match(campaignPages, /data-campaign-scroll-region="open"/);
    assert.match(
      campaignPages,
      /sm:flex-row sm:items-center sm:justify-between/,
    );
    assert.match(campaignPages, /grid min-w-0 flex-1 grid-cols-2/);
    assert.match(campaignPages, /grid min-h-0 flex-1 auto-rows-max/);
    assert.match(qaStandard, /Browser mobile influencer campaigns scroll/);
    assert.match(qaStandard, /filter button overflow/);
    assert.doesNotMatch(advertiserDashboard, /\/미정/);
    assert.doesNotMatch(advertiserDashboard, /명 신청/);
    assert.doesNotMatch(advertiserDashboard, /신청\/모집 인원/);
    assert.match(advertiserDashboard, /sortKey="deadline"/);
    assert.match(
      agents,
      /Paired advertiser\/influencer dashboard surfaces must keep interaction parity/,
    );
    assert.match(
      agents,
      /Campaign applicant middle columns must stay compact and single-line/,
    );
    assert.match(advertiserDashboard, /compareCampaignGroupsBySort/);
    assert.doesNotMatch(advertiserDashboard, /sortKey="participants"/);
    assert.match(advertiserDashboard, /handleCampaignSortChange/);
    assert.match(campaignPages, /function CampaignSortSelect/);
    assert.match(campaignPages, /compareMarketplaceCampaignPostsBySort/);
    assert.match(campaignPages, /compareAppliedCampaignApplicationsBySort/);
    assert.match(advertiserDashboard, /APPLICANT_SORT_OPTIONS/);
    assert.match(advertiserDashboard, /function CampaignApplicantsPanel/);
    assert.match(advertiserDashboard, /compareCampaignApplicantsBySort/);
    assert.match(advertiserDashboard, /ariaLabel="지원자 정렬"/);
    assert.match(advertiserDashboard, /options=\{APPLICANT_SORT_OPTIONS\}/);
    assert.match(advertiserDashboard, /<FilterSelectControl/);
    assert.match(advertiserDashboard, /to=\{profileHref\}/);
    assert.match(
      agents,
      /advertiser-facing campaign management should read like an operational table\/list/,
    );
    assert.match(
      agents,
      /influencer-facing campaign discovery should read like thumbnail recruitment cards/,
    );
    assert.match(advertiserDashboard, /function CampaignListView/);
    assert.match(advertiserDashboard, /function CampaignTableHeaderRow/);
    assert.match(campaignPages, /function AdvertiserCampaignPreview/);
    const advertiserCampaignPreviewSource = campaignPages.slice(
      campaignPages.indexOf("function AdvertiserCampaignPreview"),
      campaignPages.indexOf("function CampaignImageUpload"),
    );
    assert.match(
      advertiserCampaignPreviewSource,
      /getPublicCampaignDisplayCopy\(campaign\)/,
    );
    assert.doesNotMatch(
      advertiserCampaignPreviewSource,
      /getCampaignDisplayCopy\(campaign\)/,
    );
    assert.match(
      campaignPages,
      /createCampaignFormFromRecord\(campaign, data\.brand\)/,
    );
    assert.match(
      campaignPages,
      /createCampaignFormFromRecord\(updatedCampaign, data\.brand\)/,
    );
    assert.match(
      seedAccounts,
      /location: campaign\.location \?\? brandProfileRow\.location/,
    );
    assert.match(
      seedAccounts,
      /campaign\.summary \?\?\s*`\$\{campaign\.title\}의 핵심 특징/,
    );
    assert.match(campaignPages, /function CampaignThumbnail/);
    assert.match(campaignPages, /function CampaignRecruitmentDetailDialog/);
    assert.match(campaignPages, /function CampaignCardMetaChips/);
    assert.match(campaignPages, /function CampaignCardDeadlineStrip/);
    assert.match(campaignPages, /제출마감일/);
    assert.match(
      campaignPages,
      /제출마감 \{getCampaignSubmissionDeadlineLabel\(campaign\)\}/,
    );
    assert.doesNotMatch(campaignPages, /콘텐츠 \{getCampaign/);
    assert.match(campaignPages, /<CampaignField label="지역">/);
    assert.match(campaignPages, /<CampaignField label="가이드라인">/);
    assert.match(campaignPages, /function CampaignRequiredConsentEditor/);
    assert.match(campaignPages, /function CampaignApplicationConsentDialog/);
    assert.match(campaignPages, /function CampaignImageUpload/);
    assert.match(campaignPages, /\/api\/advertiser\/campaign-image/);
    assert.match(server, /제공상품을 120자 이내로 입력해 주세요/);
    assert.match(server, /가이드라인:/);
    assert.match(server, /지역:/);
    assert.match(server, /"\/api\/advertiser\/campaign-image"/);
    assert.match(server, /area: "campaign-thumbnails"/);
    assert.match(marketplaceDomain, /offer\?: string/);
    assert.match(marketplaceDomain, /thumbnailUrl\?: string/);
    assert.match(
      marketplaceDomain,
      /\/images\/campaigns\/monotrip-local-stay-v2\.png/,
    );
    assert.match(
      marketplaceDomain,
      /\/images\/campaigns\/breadroom-homecare-supporters-v2\.png/,
    );
    assert.match(
      seedAccounts,
      /thumbnailUrl: "\/images\/campaigns\/breadroom-homecare-supporters-v2\.png"/,
    );
    assert.match(marketplaceDomain, /function isMarketplaceCampaignRecruiting/);
    assert.match(
      marketplaceDomain,
      /isMarketplaceCampaignRecruiting\(campaign\.deadline\)/,
    );
    assert.match(
      advertiserDashboard,
      /getChannelAudienceSortValue\(getCampaignApplicantDisplayPlatforms\(a\)\)/,
    );
    assert.match(advertiserDashboard, /ariaLabel="지원자 정렬"/);
    assert.match(
      advertiserDashboard,
      /controlsId="campaign-applicant-filters"/,
    );
    assert.match(marketplaceDomain, /getInfluencerProfilePathByDisplayName/);
    assert.match(marketplaceDomain, /handle: "creator-sora"/);
    assert.match(marketplaceDomain, /displayName: "크리에이터 소라"/);
    assert.doesNotMatch(marketplacePages, /"creator-sora": "zeu_k"/);
    assert.match(
      advertiserDashboard,
      /findInfluencerProfileByHandle\(thread\.counterpartHref\)/,
    );
    assert.match(
      advertiserDashboard,
      /findInfluencerProfileByDisplayName\(applicantName\)/,
    );
    assert.match(
      advertiserDashboard,
      /if \(thread\.counterpartProfilePublished === false\) return undefined/,
    );
    assert.match(
      advertiserDashboard,
      /getCampaignApplicantDisplayPlatforms\(\s*thread,/,
    );
    assert.match(
      advertiserDashboard,
      /<ApplicantPlatformLinks platforms=\{topDisplayPlatforms\} \/>/,
    );
    assert.match(
      advertiserDashboard,
      /getInstagramApplicationEvidenceAccount/,
    );
    assert.match(advertiserDashboard, /thread\.counterpartCategories/);
    assert.match(
      advertiserDashboard,
      /getCampaignApplicantMainCategory\(\s*thread\.counterpartCategories,\s*applicantProfile,/,
    );
    assert.match(
      advertiserDashboard,
      /<ApplicantCategoryPill category=\{mainCategory\} \/>/,
    );
    assert.match(advertiserDashboard, /visiblePlatforms\.slice\(0, 1\)/);
    assert.doesNotMatch(
      advertiserDashboard,
      /formatCampaignActivityDate\(thread\.createdAt\)/,
    );
    assert.match(server, /sender_influencer_categories/);
    assert.match(server, /display_name,headline,categories/);
    assert.match(
      advertiserDashboard,
      /grid w-full grid-cols-2 gap-1\.5 sm:w-\[190px\]/,
    );
    assert.match(
      advertiserDashboard,
      /no-scrollbar overflow-x-hidden overflow-y-auto overscroll-contain rounded-\[10px\]/,
    );
    assert.match(
      advertiserDashboard,
      /lg:grid-cols-\[minmax\(180px,0\.7fr\)_minmax\(130px,0\.36fr\)_minmax\(130px,0\.34fr\)_minmax\(130px,0\.34fr\)_minmax\(160px,0\.45fr\)\]/,
    );
    assert.match(
      advertiserDashboard,
      /primaryActionSpan = hasProfileAction \? "" : "col-span-2"/,
    );
    assert.match(advertiserDashboard, /프로필 보기/);
    assert.match(campaignPages, /function AppliedCampaignFilters/);
    assert.match(campaignPages, /appliedStatusFilter/);
    assert.match(campaignPages, /function CampaignColumnLabel/);
    assert.doesNotMatch(campaignPages, /function CampaignColumnHeader/);
    assert.match(advertiserDashboard, /label: `\$\{dday\} \/ \$\{dateLabel\}`/);
    assert.match(advertiserDashboard, /font-extrabold text-\[#dc2626\]/);
    assert.match(influencerDashboard, /label: `\$\{dday\} \/ \$\{dateLabel\}`/);
    assert.match(
      influencerDashboard,
      /<InfluencerDateText parts=\{parts\} \/>/,
    );
    assert.match(advertiserDashboard, /계약 조건 확인/);
    assert.match(advertiserDashboard, /extractCampaignSummaryField/);
    assert.match(seedAccounts, /campaignDashboardApplicationFixtures/);
    assert.match(seedAccounts, /handle: "creator-sora"/);
    assert.match(seedAccounts, /email: "creator\.sora@yeollock\.me"/);
    assert.match(seedAccounts, /const applicantNames = \[\.\.\.new Set/);
    assert.match(seedAccounts, /seeded_campaign_applications/);
    assert.match(server, /maxItems = 20/);
    assert.match(server, /normalizeBrandCampaigns\(activeCampaigns, 20\)/);
    assert.doesNotMatch(seedAccounts, /applicantLimit: "1명"/);
    assert.ok(
      (
        influencerDashboard.match(
          /MobileSurfaceSwitch role="influencer" active="contracts"/g,
        ) ?? []
      ).length >= 2,
    );
    assert.match(
      campaignPages,
      /MobileSurfaceSwitch role=\{role\} active="campaigns"/,
    );
    assert.doesNotMatch(advertiserDashboard, /광고주 · 계약/);
    assert.doesNotMatch(influencerDashboard, /인플루언서 · 내 계약/);
    assert.match(
      influencerDashboard,
      /hidden min-w-0 truncate whitespace-nowrap text-\[12px\] font-semibold text-\[#303630\] lg:block/,
    );
    assert.match(landing, /광고계약/);
    assert.match(landing, /흩어진 광고 계약/);
    assert.match(landing, /광고비 미지급/);
    assert.match(landing, /마감일 착오/);
    assert.match(landing, /콘텐츠 기준 변경/);
    assert.match(landing, /활용 범위 과다/);
    assert.match(landing, /1:1 계약 대시보드/);
    assert.doesNotMatch(landing, /받은 광고\s*계약/);
    assert.doesNotMatch(landing, /받은 1:1 계약 대시보드/);
    assert.match(landing, /수정 요청/);
    assert.match(landing, /서명 완료본/);
    assert.match(qaStandard, /광고계약/);
    assert.match(qaStandard, /광고비 미지급/);
    assert.doesNotMatch(landing, /받은 캠페인을/);
    assert.doesNotMatch(landing, /캠페인 정산 완료/);
    assert.doesNotMatch(seedAccounts, /캠페인 정산 완료/);
    assert.equal(
      formatContractTitleForDisplay("오브레 릴스 캠페인 정산 완료"),
      "오브레 릴스 정산 완료 계약",
    );
    assert.match(authLoginScreen, /disabled:!bg-neutral-200/);
    assert.match(advertiserVerification, /showApprovedOverview \?/);
    assert.equal(
      (advertiserVerification.match(/사업자 인증 완료/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(
      influencerVerification,
      /InfoRow\s+label="현재 상태"\s+value="인증 완료"/,
    );
    const verifiedPlatformRows = influencerProfileSettings.slice(
      influencerProfileSettings.indexOf("function VerifiedPlatformRows"),
      influencerProfileSettings.indexOf("function ProfileLoadingView"),
    );
    assert.match(
      verifiedPlatformRows,
      /grid min-h-16 grid-cols-\[minmax\(0,1fr\)_auto\] items-center/,
    );
    assert.doesNotMatch(verifiedPlatformRows, /bg-blue-50 px-2/);
    assert.doesNotMatch(marketplace, /제안 후 메시지함/);
    assert.match(landing, /formatIntroDateWithDday\(5, "date-first"\)/);
    assert.match(landing, /formatIntroDateWithDday\(8\)/);
    assert.match(landing, /formatIntroShortDateTime\(7, 18\)/);
    assert.doesNotMatch(landing, /2026\.06\./);
    assert.match(seedAccounts, /const getSeedDate = \(days, hour = 12\) =>/);
    assert.match(
      seedQaMarketplaceScenario,
      /const getSeedDate = \(days, hour = 12\) =>/,
    );
    assert.doesNotMatch(landing, /D\+\d+/);
  });

  it("stores campaigns as independent service-role rows with a legacy rollback mirror", () => {
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260711043000_normalize_marketplace_campaigns.sql",
    );

    assert.match(
      migration,
      /create table if not exists public\.marketplace_campaigns/,
    );
    assert.match(migration, /jsonb_array_elements\(brand\.active_campaigns\)/);
    assert.match(
      migration,
      /revoke all on table public\.marketplace_campaigns/,
    );
    assert.match(migration, /to service_role/);
    assert.match(server, /hydrateBrandRowsWithNormalizedCampaigns/);
    assert.match(server, /upsertNormalizedMarketplaceCampaign/);
    assert.match(server, /active_campaigns: campaigns/);
  });

  it("enforces progressive campaign verification at the atomic server and database boundary", () => {
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260806110000_add_progressive_campaign_verification.sql",
    );
    const registeredDiscoveryMigration = read(
      "supabase/migrations/20260806120000_add_registered_influencer_discovery.sql",
    );

    assert.match(server, /const ADVERTISER_UNVERIFIED_CAMPAIGN_LIMIT = 2/);
    assert.match(server, /rpc\/get_progressive_campaign_access/);
    assert.match(server, /rpc\/publish_marketplace_campaign/);
    assert.match(server, /campaign_access: board\.campaignAccess/);
    assert.match(server, /code: "advertiser_business_verification_required"/);

    assert.match(migration, /add column if not exists first_published_at timestamptz/);
    assert.match(migration, /add column if not exists organization_campaign_sequence bigint/);
    assert.match(migration, /verification_gate_basis text/);
    assert.match(
      migration,
      /campaign\.campaign_data ->> 'createdAt'/,
    );
    assert.match(
      migration,
      /partition by publication\.organization_id[\s\S]*publication\.publication_at asc, publication\.id asc/,
    );
    assert.match(
      migration,
      /marketplace_campaigns_organization_sequence_unique[\s\S]*organization_id,[\s\S]*organization_campaign_sequence/,
    );
    assert.match(
      migration,
      /create table if not exists public\.marketplace_campaign_publication_counters/,
    );
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /v_next_sequence := v_published_count \+ 1/);
    assert.match(migration, /not v_business_verified and v_next_sequence > 2/);
    assert.match(
      migration,
      /when v_next_sequence <= 2 then 'intro_exempt'[\s\S]*else 'business_verified'/,
    );
    assert.match(migration, /else 'grandfathered'/);
    assert.match(migration, /campaign publication identity is immutable/);
    assert.match(migration, /contract workflow provenance is immutable/);
    const businessVerificationFunction = migration.slice(
      migration.indexOf(
        "create or replace function public.directsign_organization_business_verified",
      ),
      migration.indexOf(
        "create or replace function public.get_progressive_campaign_access",
      ),
    );
    for (const operationalVerificationBinding of [
      "request.id = organization.business_verification_request_id",
      "request.organization_id = organization.id",
      "request.target_id = organization.id::text",
      "request.data_origin = 'production'",
      "submitter.data_origin = 'production'",
      "submitter.role::text = 'marketer'",
      "organization.business_verification_status = 'approved'",
      "organization.business_verified_at is not null",
      "organization.business_registration_number =",
      "request.business_registration_number",
      "btrim(organization.representative_name) =",
      "btrim(request.representative_name)",
      "directsign_email_is_operational",
      "directsign_has_test_marker",
      "submitter_auth.raw_app_meta_data",
      "submitter_auth.raw_user_meta_data",
      "request.evidence_snapshot_json",
      "data_origin|environment",
      "qa|test|demo|seed|qa_account",
      "qa_account|seeded|is_test|test_data",
    ]) {
      assert.ok(
        businessVerificationFunction.includes(operationalVerificationBinding),
        operationalVerificationBinding,
      );
    }
    const testMarkerHelperPattern =
      /create or replace function directsign_private\.directsign_has_test_marker\([\s\S]*?\n\$\$;/;
    const campaignTestMarkerHelper = migration.match(testMarkerHelperPattern)?.[0];
    const discoveryTestMarkerHelper =
      registeredDiscoveryMigration.match(testMarkerHelperPattern)?.[0];
    assert.ok(campaignTestMarkerHelper, "campaign test-marker helper must exist");
    assert.equal(
      discoveryTestMarkerHelper,
      campaignTestMarkerHelper,
      "later migrations must not weaken the shared production test-marker helper",
    );
    for (const knownSeedMarker of [
      "광고주.매니저",
      "브레드룸",
      "브래드룸",
      "오브레",
      "크리에이터.소라",
      "민서홈",
      "소담픽",
    ]) {
      assert.ok(campaignTestMarkerHelper.includes(knownSeedMarker), knownSeedMarker);
    }
    assert.doesNotMatch(
      businessVerificationFunction,
      /request\.organization_id = p_organization_id[\s\S]+\bor\b[\s\S]+request\.target_id/,
    );
    assert.doesNotMatch(
      migration,
      /grant execute on function public\.publish_marketplace_campaign\([\s\S]*to (?:anon|authenticated)/,
    );

    const publishFunction = migration.slice(
      migration.indexOf("create or replace function public.publish_marketplace_campaign"),
      migration.indexOf(
        "create or replace function public.directsign_campaign_contract_verification_exempt",
      ),
    );
    assert.ok(
      publishFunction.indexOf("insert into public.marketplace_campaigns") <
        publishFunction.indexOf("update public.marketplace_brand_profiles"),
      "the authoritative campaign insert must precede the legacy brand mirror",
    );

    const createFlow = server.slice(
      server.indexOf("const upsertAdvertiserMarketplaceCampaign"),
      server.indexOf("const updateAdvertiserMarketplaceCampaignStatus"),
    );
    const publicationKeyBuilder = server.slice(
      server.indexOf("const buildCampaignPublicationRequestKey"),
      server.indexOf("const upsertAdvertiserMarketplaceCampaign"),
    );
    assert.match(publicationKeyBuilder, /Idempotency-Key/);
    assert.match(publicationKeyBuilder, /clientKey\.length < 16/);
    assert.doesNotMatch(publicationKeyBuilder, /Date\.now|retryWindow|payload/);
    assert.match(createFlow, /campaign_idempotency_key_required/);
    assert.ok(
      createFlow.indexOf("publishMarketplaceCampaignAtomically") <
        createFlow.indexOf('"marketplace_brand_profiles"'),
      "campaign publication must succeed before the denormalized brand update",
    );
    assert.doesNotMatch(createFlow, /active_campaigns: campaigns/);
  });

  it("keeps every authoritative advertiser campaign manageable beyond the legacy mirror", () => {
    const server = read("server/index.ts");
    const allCampaignReader = server.slice(
      server.indexOf("const readAllNormalizedMarketplaceCampaignRows"),
      server.indexOf("const mapNormalizedMarketplaceCampaignRow"),
    );
    assert.match(allCampaignReader, /pageSize = 1000/);
    assert.match(allCampaignReader, /offset/);

    const advertiserBrandReader = server.slice(
      server.indexOf("const readAdvertiserMarketplaceBrandRows"),
      server.indexOf("const ensureAdvertiserDefaultBrandRow"),
    );
    assert.match(advertiserBrandReader, /readAll: true/);
    assert.match(advertiserBrandReader, /Number\.MAX_SAFE_INTEGER/);

    const archiveFlow = server.slice(
      server.indexOf("const archiveAdvertiserBrandProfile"),
      server.indexOf("const validateMarketplaceCampaignInput"),
    );
    assert.match(archiveFlow, /readAllNormalizedMarketplaceCampaignRows/);
    assert.match(archiveFlow, /status=in\.\(open,draft\)/);

    const statusFlow = server.slice(
      server.indexOf("const updateAdvertiserMarketplaceCampaignStatus"),
      server.indexOf("const buildMarketplaceCampaignSnapshot"),
    );
    assert.match(statusFlow, /authoritativeCampaignRows/);
    assert.match(statusFlow, /organization_id=eq/);
    assert.match(statusFlow, /campaign_idempotency_key_required/);
    assert.doesNotMatch(statusFlow, /Math\.floor\(Date\.now/);
  });

  it("keeps campaign exemptions provenance-bound while gating direct proposals and new applications", () => {
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260806110000_add_progressive_campaign_verification.sql",
    );

    const exemptionFunction = migration.slice(
      migration.indexOf(
        "create or replace function public.directsign_campaign_contract_verification_exempt",
      ),
      migration.indexOf(
        "create or replace function public.directsign_protect_campaign_publication_identity",
      ),
    );
    for (const requiredBinding of [
      "contract.workflow_source = 'marketplace_campaign'",
      "campaign.id = contract.marketplace_campaign_id",
      "application.id::text = contract.source_application_id",
      "application.converted_contract_id = contract.id",
      "campaign.verification_gate_basis = 'intro_exempt'",
      "campaign.organization_campaign_sequence between 1 and 2",
    ]) {
      assert.ok(exemptionFunction.includes(requiredBinding), requiredBinding);
    }
    assert.match(server, /rpc\/directsign_campaign_contract_verification_exempt/);
    assert.match(server, /const resolveAdvertiserContractAccess/);
    assert.match(server, /isAdvertiserVerifiedOrCampaignContractExempt/);
    assert.match(server, /buildAdvertiserVerificationRequiredPayload/);

    const serverBusinessVerification = server.slice(
      server.indexOf("const isAdvertiserBusinessVerified"),
      server.indexOf("const isAdvertiserApprovedForContractSend"),
    );
    assert.match(
      serverBusinessVerification,
      /rpc\/directsign_organization_business_verified/,
    );
    assert.match(
      serverBusinessVerification,
      /if \(!organization \|\| !isUuid\(organization\.id\)\) return false/,
    );
    assert.match(serverBusinessVerification, /rpcResponse\.json\(\)\) === true/);
    assert.doesNotMatch(serverBusinessVerification, /readVerificationRequests/);
    assert.doesNotMatch(serverBusinessVerification, /relevantRequests/);
    assert.doesNotMatch(
      serverBusinessVerification,
      /request\.status === "approved"/,
    );

    const contractDetailRoute = server.slice(
      server.indexOf('app.get("/api/contracts/:id"'),
      server.indexOf('app.post("/api/contracts/:id/share-link/reveal"'),
    );
    assert.match(contractDetailRoute, /resolveAdvertiserContractAccess/);
    assert.match(contractDetailRoute, /advertiser_contract_access/);

    const advertiserWriteGuard = server.slice(
      server.indexOf("const verifyAdvertiserContractWriteAccess"),
      server.indexOf("const verifyInfluencerShareAccess"),
    );
    assert.match(advertiserWriteGuard, /isFixedCampaignContract\(existing\)/);
    assert.match(advertiserWriteGuard, /incoming\.brand_profile_id/);
    assert.match(advertiserWriteGuard, /incoming\.influencer_info/);
    assert.match(advertiserWriteGuard, /incoming\.campaign/);
    assert.match(advertiserWriteGuard, /incoming\.clauses/);

    const directProposalRoute = server.slice(
      server.indexOf('"/api/marketplace/influencers/:handle/proposals"'),
      server.indexOf('"/api/marketplace/brands/:handle/proposals"'),
    );
    assert.match(directProposalRoute, /isAdvertiserBusinessVerified\(advertiserAuth\)/);
    assert.match(
      directProposalRoute,
      /buildAdvertiserVerificationRequiredPayload\(\)/,
    );
    assert.ok(
      directProposalRoute.indexOf("isAdvertiserBusinessVerified") <
        directProposalRoute.indexOf("insertSupabaseRowsReturning"),
    );

    const applicationFlow = server.slice(
      server.indexOf("const submitMarketplaceCampaignApplication"),
      server.indexOf("const saveInfluencerMarketplaceAvatar"),
    );
    assert.match(applicationFlow, /code: "influencer_verification_required"/);
    assert.match(applicationFlow, /next_path: "\/influencer\/verification"/);
    assert.ok(
      applicationFlow.indexOf("if (existingRows[0])") <
        applicationFlow.indexOf("hasApprovedInfluencerPlatformVerification"),
      "an idempotent duplicate application lookup must happen before the new-application gate",
    );
    assert.ok(
      applicationFlow.indexOf("hasApprovedInfluencerPlatformVerification") <
        applicationFlow.indexOf("insertSupabaseRowsReturning"),
      "platform verification must be approved before a new application insert",
    );
  });

  it("separates public cache optimization from sensitive contract data", () => {
    const server = read("server/index.ts");
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const messageSummaryHook = read(
      "src/hooks/useMarketplaceMessageSummary.ts",
    );
    const migration = read(
      "supabase/migrations/20260604012714_optimize_cache_query_paths.sql",
    );
    const agents = read("AGENTS.md");

    assert.ok(packageJson.dependencies?.["@vercel/functions"]);
    assert.match(server, /const getVercelRuntimeCache = async/);
    assert.match(server, /publicMarketplaceCacheTags/);
    assert.match(server, /writePublicMarketplaceRuntimeCache/);
    assert.match(server, /value === null \? undefined : value/);
    assert.match(server, /allowPublicMarketplaceCatalogFallback/);
    assert.match(server, /isEmptyPublicMarketplaceValue/);
    assert.match(server, /applyPublicMarketplaceFallback/);
    assert.match(
      server,
      /applyPublicMarketplaceFallback\(await loader\(\), options\)/,
    );
    assert.doesNotMatch(
      server,
      /readPublicMarketplaceCache\([\s\S]+"marketplace-influencers",[\s\S]+readMarketplaceInfluencerProfileCollection/,
    );
    assert.match(server, /readIndexedMarketplaceInfluencerPage/);
    assert.match(server, /rpc\/list_marketplace_influencers/);
    assert.match(server, /paginateMarketplaceInfluencerProfiles\(fallbackProfiles/);
    assert.match(
      server,
      /visibleDbProfiles\.length > 0[\s\S]*fallbackMarketplaceBrandProfiles\(\)/,
    );
    assert.match(server, /invalidateByTag/);
    assert.match(server, /Vercel-CDN-Cache-Control/);
    assert.match(server, /Vercel-Cache-Tag/);
    assert.match(server, /readAuthenticatedMarketplaceInfluencerPage/);
    assert.match(server, /rpc\/list_authenticated_marketplace_influencers/);
    assert.match(
      server,
      /sendPublicMarketplaceJson\(response, \{ campaigns \}, "marketplace-campaigns"\)/,
    );

    for (const route of [
      '"/api/advertiser/dashboard/bootstrap"',
      '"/api/marketplace/messages"',
      '"/api/contracts/:id"',
      '"/api/contracts/:id/review-pdf"',
      '"/api/contracts/:id/final-pdf"',
    ]) {
      const routeIndex = server.indexOf(route);
      assert.notEqual(routeIndex, -1, `${route} route must exist`);
      const routeSlice = server.slice(routeIndex, routeIndex + 4500);
      assert.match(routeSlice, /Cache-Control", "no-store"/);
      assert.doesNotMatch(routeSlice, /sendPublicMarketplaceJson/);
      assert.doesNotMatch(routeSlice, /writePublicMarketplaceRuntimeCache/);
    }

    assert.match(server, /const advertiserDashboardCache = new Map/);
    assert.match(server, /invalidateAdvertiserDashboardCache\(\)/);
    assert.match(messageSummaryHook, /messageSummaryInflight/);
    assert.match(
      migration,
      /directsign_contracts_advertiser_status_updated_idx/,
    );
    assert.match(
      migration,
      /marketplace_contact_proposals_campaign_status_created_idx/,
    );
    assert.match(migration, /contract_parties_profile_role_contract_idx/);
    assert.match(
      agents,
      /Cache optimization must classify data before implementation/,
    );
    assert.match(agents, /Keep sensitive HTTP responses `no-store`/);
  });

  it("keeps dashboard Excel exports scoped to operational list data", () => {
    const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
    const influencerDashboard = read(
      "src/pages/influencer/InfluencerDashboard.tsx",
    );
    const dashboardDownloadButton = read(
      "src/components/DashboardDownloadButton.tsx",
    );
    const xlsxExport = read("src/domain/xlsxExport.ts");
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const agents = read("AGENTS.md");
    const advertiserExportSource = advertiserDashboard.slice(
      advertiserDashboard.indexOf(
        "function buildAdvertiserContractExportSheet",
      ),
      advertiserDashboard.indexOf(
        "function parseDate",
        advertiserDashboard.indexOf(
          "function buildAdvertiserContractExportSheet",
        ),
      ),
    );
    const influencerExportSource = influencerDashboard.slice(
      influencerDashboard.indexOf(
        "function buildInfluencerDashboardExportSheet",
      ),
      influencerDashboard.indexOf(
        "function parseDate",
        influencerDashboard.indexOf(
          "function buildInfluencerDashboardExportSheet",
        ),
      ),
    );
    const advertiserFilterStart = advertiserDashboard.indexOf(
      'id="advertiser-contract-filters"',
    );
    const advertiserFilterPanel = advertiserDashboard.slice(
      advertiserFilterStart,
      advertiserDashboard.indexOf(
        "<ContractTableHeaderRow",
        advertiserFilterStart,
      ),
    );
    const advertiserFilterOrder = [
      'label="플랫폼"',
      'label="종류"',
      "<ContractNameSearch",
      'label="지급내용"',
      'label="현 단계"',
    ].map((marker) => advertiserFilterPanel.indexOf(marker));

    assert.ok(packageJson.dependencies?.fflate);
    assert.match(dashboardDownloadButton, /aria-label="내보내기"/);
    assert.match(dashboardDownloadButton, /title="내보내기"/);
    assert.match(dashboardDownloadButton, />내보내기<\/span>/);
    assert.doesNotMatch(dashboardDownloadButton, />다운로드<\/span>/);
    assert.doesNotMatch(dashboardDownloadButton, /hidden sm:inline/);
    assert.match(advertiserDashboard, /<DashboardExportDialog/);
    assert.match(influencerDashboard, /<DashboardExportDialog/);
    assert.match(advertiserDashboard, /exportWorkbookToGoogleSheets/);
    assert.match(influencerDashboard, /exportWorkbookToGoogleSheets/);
    assert.match(
      xlsxExport,
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
    );
    assert.match(advertiserDashboard, /const CONTRACTS_PER_PAGE = 20/);
    assert.match(
      advertiserDashboard,
      /const DASHBOARD_CONTRACT_EXPORT_LIMIT = 5000/,
    );
    assert.match(
      advertiserDashboard,
      /displayContracts\.slice\(pageStartIndex, pageEndIndex\)/,
    );
    assert.match(advertiserDashboard, /<ContractPagination/);
    assert.match(
      advertiserDashboard,
      /<DashboardDownloadButton onClick=\{handleDownloadDashboard\} \/>/,
    );
    assert.match(advertiserDashboard, /gap-x-3 gap-y-1/);
    assert.match(
      advertiserDashboard,
      /const \[contractDateFromFilter, setContractDateFromFilter\]/,
    );
    assert.match(
      advertiserDashboard,
      /const \[contractDateToFilter, setContractDateToFilter\]/,
    );
    assert.match(
      advertiserDashboard,
      /const \[contractPeriodFilter, setContractPeriodFilter\]/,
    );
    assert.match(advertiserDashboard, /function DashboardPeriodPicker/);
    assert.match(
      advertiserDashboard,
      /data-dashboard-period-picker-trigger="true"/,
    );
    assert.match(advertiserDashboard, /data-cost-period-quick="true"/);
    assert.match(advertiserDashboard, /align="right"/);
    assert.match(advertiserDashboard, /label: "금주"/);
    assert.match(advertiserDashboard, /label: "전주"/);
    assert.match(advertiserDashboard, /label: "당월"/);
    assert.match(advertiserDashboard, /label: "전월"/);
    assert.match(advertiserDashboard, /matchesDashboardDateRange/);
    assert.match(advertiserDashboard, /Boolean\(contractDateFromFilter\)/);
    assert.match(advertiserDashboard, /Boolean\(contractDateToFilter\)/);
    assert.match(advertiserDashboard, /hasContractDashboardFilters/);
    assert.match(advertiserDashboard, /contractDownloadContracts/);
    assert.match(
      advertiserDashboard,
      /\? visibleContracts\s*:\s*\[\.\.\.oneToOneContracts\]/,
    );
    assert.match(
      advertiserDashboard,
      /contractDownloadContracts\.length > DASHBOARD_CONTRACT_EXPORT_LIMIT/,
    );
    assert.match(
      advertiserFilterPanel,
      /lg:grid-cols-\[minmax\(132px,0\.34fr\)_minmax\(108px,0\.26fr\)_minmax\(300px,1fr\)_minmax\(132px,0\.34fr\)_minmax\(112px,0\.3fr\)\]/,
    );
    assert.ok(advertiserFilterOrder.every((index) => index >= 0));
    assert.ok(
      advertiserFilterOrder.every(
        (index, orderIndex) =>
          orderIndex === 0 || index > advertiserFilterOrder[orderIndex - 1],
      ),
    );
    assert.match(agents, /visible Korean copy "내보내기"/);
    assert.match(agents, /accessible\/title copy "내보내기"/);
    assert.match(
      agents,
      /Excel export should sit immediately beside the dashboard title/,
    );
    assert.match(
      agents,
      /Date filtering should use the shared "기간 선택" button/,
    );
    assert.match(agents, /same visible column order as the table/);
    assert.match(
      influencerDashboard,
      /<DashboardDownloadButton onClick=\{handleDownloadDashboard\} \/>/,
    );
    assert.match(advertiserExportSource, /buildAdvertiserContractExportSheet/);
    assert.match(
      advertiserExportSource,
      /CONTRACT_LIFECYCLE_EXPORT_LABELS\[lifecycle\]/,
    );
    assert.match(advertiserExportSource, /"구분"/);
    assert.match(advertiserExportSource, /"기준일"/);
    assert.match(advertiserExportSource, /"계약 최초작성일"/);
    assert.match(advertiserExportSource, /"서명일"/);
    assert.match(advertiserExportSource, /"크리에이터명"/);
    assert.match(advertiserExportSource, /"크리에이터 계정명"/);
    assert.match(advertiserExportSource, /"채널 지표"/);
    assert.doesNotMatch(advertiserExportSource, /"구독자\/팔로워수"/);
    assert.match(advertiserExportSource, /"콘텐츠 수량"/);
    assert.match(advertiserExportSource, /"마감일"/);
    assert.match(advertiserExportSource, /"조항 수"/);
    assert.match(advertiserExportSource, /buildAdvertiserCampaignExportSheet/);
    assert.match(
      advertiserExportSource,
      /buildAdvertiserCampaignApplicantExportSheet/,
    );
    assert.match(influencerExportSource, /buildInfluencerDashboardExportSheet/);
    for (const sensitivePattern of [
      /share_token|shareToken/,
      /pdf_url/,
      /signature_data/,
      /evidence_file/,
      /storage_path/,
      /supportAccess/,
      /download_url/,
    ]) {
      assert.doesNotMatch(advertiserExportSource, sensitivePattern);
      assert.doesNotMatch(influencerExportSource, sensitivePattern);
    }
    assert.match(
      agents,
      /Dashboard data exports should use one quiet top-right export action/,
    );
    assert.match(agents, /whole dashboard contract set across lifecycle tabs/);
    assert.match(agents, /paginate at 20 rows per page/);
    assert.match(agents, /more than 5,000 rows/);
    assert.match(agents, /detailed operational extracts/);
  });

  it("blocks raw sales lead artifacts and server secrets from git-visible files", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const gitignore = read(".gitignore");
    const vercelignore = read(".vercelignore");
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      functions?: Record<string, { excludeFiles?: string }>;
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const privacyScan = read("scripts/privacy-pii-scan.mjs");
    const governance = read("docs/privacy-data-governance.md");
    const server = read("server/index.ts");
    const sensitiveRewriteSources = new Map(
      vercelConfig.rewrites?.map((rewrite) => [
        rewrite.source,
        rewrite.destination,
      ]),
    );
    const salesDocs = readdirSync(join(root, "docs", "sales")).filter((file) =>
      statSync(join(root, "docs", "sales", file)).isFile(),
    );
    const vercelIgnoreLines = new Set(
      vercelignore.split(/\r?\n/).map((line) => line.trim()),
    );

    assert.match(
      packageJson.scripts?.["privacy:scan"] ?? "",
      /privacy-pii-scan\.mjs/,
    );
    assert.match(packageJson.scripts?.lint ?? "", /privacy:scan/);
    for (const ignoreFile of [gitignore, vercelignore]) {
      assert.match(ignoreFile, /docs\/sales\/\*prospect\*\.tsv/);
      assert.match(ignoreFile, /docs\/sales\/\*lead\*\.csv/);
      assert.match(ignoreFile, /docs\/sales\/\*business-emails\*\.tsv/);
      assert.match(ignoreFile, /docs\/sales\/\*email-discovery\*\.json/);
      assert.match(ignoreFile, /docs\/sales\/cold-email-leads\.csv/);
    }
    for (const deploymentOnlyPath of [
      ".tmp",
      ".vercel-global",
      ".vercel/output",
      ".vercel/**",
      ".mcp.json",
      ".agents",
      ".codex",
      ".od-skills",
      "AGENTS.md",
      "data",
      "data/**",
      "**/runtime-secrets.json",
      "dist",
      "supabase",
      "tests",
      "**/.env*",
    ]) {
      assert.ok(vercelIgnoreLines.has(deploymentOnlyPath));
    }
    assert.match(vercelignore, /^docs\/sales\/\*\.\*$/m);
    assert.doesNotMatch(vercelignore, /^docs\/sales\/assets(?:\/|$)/m);
    const apiFunctionExcludes =
      vercelConfig.functions?.["api/index.ts"]?.excludeFiles ?? "";
    for (const blockedFunctionPath of [
      "data/**",
      "**/runtime-secrets.json",
      "**/*.log",
      "docs/sales/**",
      "qa-artifacts/**",
      "tmp/**",
      ".tmp/**",
    ]) {
      assert.ok(apiFunctionExcludes.includes(blockedFunctionPath));
    }
    assert.match(privacyScan, /git[\s\S]*ls-files[\s\S]*--exclude-standard/);
    assert.match(privacyScan, /raw sales lead artifact/);
    assert.match(privacyScan, /possible non-empty server secret/);
    assert.match(governance, /Raw sales prospect files must not live/);
    assert.match(server, /const sensitiveSourceStaticRequestPattern/);
    assert.match(server, /data\(\?:\\\/\|\$\)/);
    assert.match(server, /server\(\?:\\\/\|\$\)/);
    assert.match(server, /const sensitiveSalesArtifactRequestPattern/);
    assert.match(
      server,
      /response\.status\(404\)\.type\("text\/plain"\)\.send\("Not found"\)/,
    );
    for (const source of [
      "/.env(.*)",
      "/data/(.*)",
      "/server/(.*)",
      "/supabase/(.*)",
      "/scripts/(.*)",
      "/tests/(.*)",
      "/lib/(.*)",
      "/qa-artifacts/(.*)",
      "/docs/sales/(.*).csv",
      "/docs/sales/(.*).tsv",
      "/docs/sales/(.*).json",
      "/package.json",
      "/package-lock.json",
      "/tsconfig(.*).json",
      "/vite.config.ts",
      "/AGENTS.md",
    ]) {
      assert.equal(sensitiveRewriteSources.get(source), "/api/index");
    }

    for (const file of salesDocs) {
      assert.doesNotMatch(
        file,
        /(prospect|lead|business-emails|email-discovery|cold-email).*\.(csv|tsv|json)$/i,
      );
    }
  });

  it("redacts private signature, token, and deliverable metadata from client API responses", () => {
    const server = read("server/index.ts");
    const redactionStart = server.indexOf("const redactSignatureDataForClient");
    const redactionSource = server.slice(
      redactionStart,
      server.indexOf("const sha256Hex", redactionStart),
    );

    assert.notEqual(redactionStart, -1);
    assert.match(redactionSource, /const redactContractForClient/);
    assert.match(redactionSource, /share_token: undefined/);
    assert.match(redactionSource, /sanitizeClientAuditEvent/);
    assert.match(
      redactionSource,
      /contract_hash: signatureData\.contract_hash/,
    );
    assert.match(
      redactionSource,
      /signature_hash: signatureData\.signature_hash/,
    );
    for (const forbidden of [
      /adv_sign: signatureData\.adv_sign/,
      /inf_sign: signatureData\.inf_sign/,
      /ip: signatureData\.ip/,
      /user_agent: signatureData\.user_agent/,
      /consent_text: signatureData\.consent_text/,
      /signature_storage_path/,
      /signed_pdf_path/,
    ]) {
      assert.doesNotMatch(redactionSource, forbidden);
    }

    assert.match(server, /delete safeMetadata\.submitted_ip/);
    assert.match(server, /delete safeMetadata\.submitted_user_agent/);
    assert.match(server, /delete safeMetadata\.proof_file/);
    assert.doesNotMatch(server, /metadata: deliverable\.metadata \?\? \{\}/);
    assert.doesNotMatch(
      server,
      /response\.json\(\{ contract: updatedContract \}\)/,
    );
    assert.doesNotMatch(
      server,
      /response\.json\(\{ contract, access_role: access\.role \}\)/,
    );
    assert.match(
      server,
      /redactContractForClient\(updatedContract, "influencer"\)/,
    );
    assert.match(server, /redactContractForClient\(updatedContract, actor\)/);
    assert.match(
      server,
      /redactContractForClient\(responseContract, access\.role\)/,
    );
    assert.match(server, /redactContractForClient\(contract, "advertiser"\)/);
    assert.match(server, /sanitizeDeliverableForClient\(deliverable\)/);
    assert.match(server, /sanitizeDeliverableForClient\(updatedDeliverable\)/);
  });

  it("does not expose contract existence through the detail JSON endpoint", () => {
    const server = read("server/index.ts");
    const routeStart = server.indexOf('app.get("/api/contracts/:id"');
    const routeSource = server.slice(
      routeStart,
      server.indexOf('app.get("/api/contracts/:id/review-pdf"', routeStart),
    );

    assert.notEqual(routeStart, -1);
    assert.match(routeSource, /sendError: false/);
    assert.match(
      routeSource,
      /response\.status\(404\)\.json\(\{ error: "Contract not found" \}\)/,
    );
    assert.match(
      routeSource,
      /normalizeTestContractDatesForSession\(access\.auth, contract\)/,
    );
    assert.match(
      routeSource,
      /redactContractForClient\(responseContract, access\.role\)/,
    );
  });

  it("rebases operational test account dates at the response boundary", () => {
    const server = read("server/index.ts");

    assert.match(server, /const shouldUseRelativeTestDatesForSession/);
    assert.match(server, /timeZone: "Asia\/Seoul"/);
    assert.match(server, /const normalizeTestContractDatesForSession/);
    assert.match(server, /const shouldNormalizeTestContractDatesForSession/);
    assert.match(
      server,
      /isOperationalTestContract\(contract\)\s*&&\s*contract\.relative_test_dates !== false/,
    );
    assert.match(
      server,
      /relative_test_dates: contract\.relative_test_dates === true/,
    );
    const seedAccounts = read("scripts/seed-test-accounts.mjs");
    assert.match(
      seedAccounts,
      /platform: "instagram",[\s\S]+handle: "@creator\.sora",[\s\S]+url: "https:\/\/instagram\.com\/creator\.sora"/,
    );
    assert.match(
      server,
      /const normalizeTestBrandProfileCampaignDatesForSession/,
    );
    assert.match(
      server,
      /campaign\.relativeTestDates\s*\?\s*normalizeRelativeTestCampaignDates\(campaign, index\)\s*:\s*campaign/,
    );
    assert.match(
      server,
      /record\.statusUpdatedByProfileId \?\? record\.status_updated_by_profile_id/,
    );
    assert.match(
      server,
      /const normalizeTestMarketplaceProposalRowsForSession/,
    );
    assert.match(
      server,
      /const contractTextReplacements = new Map<string, string>\(\)/,
    );
    assert.match(server, /const normalizeRelativeTestContractScheduleText/);
    assert.match(
      server,
      /normalizeRelativeTestContractScheduleText\(\s*replaceRelativeTestDatesInText\(clause\.content, contractTextReplacements\),\s*schedule,\s*\)/,
    );
    assert.match(
      server,
      /const sessionContracts = normalizeTestContractsForSession\(auth, contracts\)/,
    );
    assert.match(
      server,
      /const sessionContracts = normalizeTestContractsForSession\(\s*advertiserAuth,\s*contracts,\s*\)/,
    );
    assert.match(
      server,
      /normalizeTestBrandProfileCampaignDatesForSession\(auth, rawBrand\)/,
    );
    assert.match(
      server,
      /normalizeTestMarketplaceProposalRowsForSession\(\s*auth,\s*await addPlatformInfoToMarketplaceProposals/,
    );
    assert.match(
      server,
      /buildInfluencerDashboardApplications\(\s*profile\?\.id \?\? authUser\.id,\s*\{ user: authUser, profile \},\s*\)/,
    );
    assert.match(
      server,
      /buildInfluencerDashboardApplications\(auth\.profile\.id, auth\)/,
    );
    assert.match(
      server,
      /useRelativeTestDates: legacyContract[\s\S]+shouldNormalizeTestContractDatesForSession\([\s\S]+relativeDateAuth,[\s\S]+legacyContract/,
    );
    assert.match(
      server,
      /const dashboardDueAt =[\s\S]+useRelativeTestDates && legacyDueAt \? legacyDueAt : v2DueAt/,
    );
    assert.match(
      server,
      /deadline_label: formatDashboardDue\(dashboardDueAt\)[\s\S]+due_at: dashboardDueAt/,
    );
    assert.doesNotMatch(server, /await writeStore\(normalizeTest/);
  });

  it("invalidates the full contract list cache after a Supabase point write", () => {
    const server = read("server/index.ts");
    const writeStoreStart = server.indexOf("const writeStore = async");
    const writeStoreSource = server.slice(
      writeStoreStart,
      server.indexOf("const readStore = async", writeStoreStart),
    );

    assert.notEqual(writeStoreStart, -1);
    assert.match(
      writeStoreSource,
      /await upsertSupabaseContracts\(normalizedContracts\)/,
    );
    assert.match(writeStoreSource, /invalidateSupabaseContractStoreCache\(\)/);
    assert.doesNotMatch(
      writeStoreSource,
      /rememberSupabaseContractStoreCache\(/,
    );
  });

  it("does not expose private contract existence through deliverable and final PDF endpoints", () => {
    const server = read("server/index.ts");
    const deliverablesStart = server.indexOf(
      'app.get("/api/contracts/:id/deliverables"',
    );
    const deliverablesSource = server.slice(
      deliverablesStart,
      server.indexOf(
        'app.post("/api/contracts/:id/post-link"',
        deliverablesStart,
      ),
    );
    const fileStart = server.indexOf(
      '"/api/contracts/:id/deliverables/:deliverableId/files/:fileId"',
    );
    const fileSource = server.slice(
      fileStart,
      server.indexOf(
        'app.post("/api/contracts/:id/support-access-requests"',
        fileStart,
      ),
    );
    const finalPdfStart = server.indexOf(
      'app.get("/api/contracts/:id/final-pdf"',
    );
    const finalPdfSource = server.slice(
      finalPdfStart,
      server.indexOf(
        'app.post("/api/contracts/:id/signatures/influencer"',
        finalPdfStart,
      ),
    );

    for (const [name, source] of [
      ["deliverables", deliverablesSource],
      ["deliverable file", fileSource],
      ["final PDF", finalPdfSource],
    ] as const) {
      assert.notEqual(source.length, 0, `${name} route must exist`);
      assert.match(source, /sendError: false/);
      assert.match(
        source,
        /response\.status\(404\)\.json\(\{ error: "Contract not found" \}\)/,
      );
    }
    assert.doesNotMatch(finalPdfSource, /Signed PDF access is not allowed/);
  });

  it("binds Google OAuth callbacks to the active app session and one-time state nonce", () => {
    const server = read("server/index.ts");
    const authStart = server.indexOf(
      "const authenticateGoogleWorkspaceOAuthCallback",
    );
    const authSource = server.slice(
      authStart,
      server.indexOf("const getGoogleWorkspaceScopes", authStart),
    );
    const callbackStart = server.indexOf(
      'app.get("/api/google/oauth/callback"',
    );
    const callbackSource = server.slice(
      callbackStart,
      server.indexOf('app.post("/api/google/sheets/export"', callbackStart),
    );

    assert.match(server, /const usedGoogleOAuthStateNonces = new Map/);
    assert.match(server, /const consumeGoogleOAuthStateNonce/);
    assert.match(server, /!hasText\(parsed\.nonce\)/);
    assert.match(
      authSource,
      /authenticateAdvertiserRequest\(request, response\)/,
    );
    assert.match(
      authSource,
      /authenticateInfluencerRequest\(request, response\)/,
    );
    assert.match(authSource, /profile\.id !== state\.profileId/);
    assert.match(callbackSource, /authenticateGoogleWorkspaceOAuthCallback/);
    assert.match(callbackSource, /consumeGoogleOAuthStateNonce\(state\)/);
    assert.match(callbackSource, /redirectWithStatus\("failed"\)/);
  });

  it("keeps Google Workspace token tables service-role only in Supabase grants", () => {
    const migrationName = readdirSync(
      join(root, "supabase", "migrations"),
    ).find((file) =>
      file.endsWith("_harden_google_workspace_table_grants.sql"),
    );
    assert.ok(migrationName);
    const migration = read(`supabase/migrations/${migrationName}`);

    assert.match(
      migration,
      /revoke all[\s\S]*google_workspace_connections[\s\S]*from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /revoke all[\s\S]*google_calendar_events[\s\S]*from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant select, insert, update, delete[\s\S]*google_workspace_connections[\s\S]*to service_role/,
    );
    assert.match(
      migration,
      /grant select, insert, update, delete[\s\S]*google_calendar_events[\s\S]*to service_role/,
    );
    assert.doesNotMatch(migration, /to anon/);
    assert.doesNotMatch(migration, /to authenticated/);
  });

  it("keeps verification summaries account-authoritative and strips private evidence", () => {
    const hook = read("src/hooks/useVerificationSummary.ts");
    const server = read("server/index.ts");
    const sanitizerStart = server.indexOf(
      "const sanitizeVerificationRequestForSummary",
    );
    const sanitizerSource = server.slice(
      sanitizerStart,
      server.indexOf(
        "const getContractRequiredInfluencerPlatforms",
        sanitizerStart,
      ),
    );
    const statusStart = server.indexOf('app.get("/api/verification/status"');
    const statusSource = server.slice(
      statusStart,
      server.indexOf('app.post("/api/verification/advertiser"', statusStart),
    );

    assert.doesNotMatch(hook, /sessionStorage|localStorage/);
    assert.match(hook, /const VERIFICATION_SUMMARY_CACHE_MS = 15 \* 1000/);
    assert.match(hook, /cache: "no-store"/);
    assert.match(hook, /cached\.accountKey !== resolvedAccountKey/);
    assert.match(hook, /accountContext\.email[\s\S]+summaryEmail/);
    assert.match(hook, /generation !== getVerificationGeneration\(cacheKey\)/);
    assert.notEqual(
      sanitizerStart,
      -1,
      "verification response sanitizer must exist",
    );
    assert.match(sanitizerSource, /ownership_verification_method/);
    for (const privateField of [
      "evidence_file",
      "evidence_snapshot_json",
      "ownership_challenge_code",
      "ownership_challenge_url",
      "submitted_ip",
      "submitted_user_agent",
      "profile_id",
      "organization_id",
    ]) {
      assert.doesNotMatch(sanitizerSource, new RegExp(privateField));
    }
    assert.equal(
      (
        server.match(
          /latest_request: sanitizeVerificationRequestForSummary/g,
        ) ?? []
      ).length,
      4,
    );
    assert.equal(
      (
        server.match(
          /request: sanitizeVerificationRequestForSummary\(record\)/g,
        ) ?? []
      ).length,
      2,
    );
    assert.match(
      statusSource,
      /response\.setHeader\("Cache-Control", "no-store"\)/,
    );
  });

  it("validates every required signing platform without reusing one channel URL", () => {
    const server = read("server/index.ts");
    const matcherStart = server.indexOf(
      "const verificationMatchesContractPlatform",
    );
    const matcherSource = server.slice(
      matcherStart,
      server.indexOf(
        "const resolveInfluencerContractVerification",
        matcherStart,
      ),
    );

    assert.notEqual(matcherStart, -1, "contract platform matcher must exist");
    assert.match(
      matcherSource,
      /request\.verification_type !== "platform_account"/,
    );
    assert.match(matcherSource, /request\.platform !== platform/);
    assert.match(
      matcherSource,
      /const inferredFromChannelUrl = inferPlatformFromUrl\(channelUrl\)/,
    );
    assert.match(
      matcherSource,
      /channelPlatform !== platform \|\|[\s\S]+verificationMatchesPlatformAccount\(request, platform, channelUrl\)/,
    );
  });

  it("uses authoritative marketplace data unless bundled catalogs are explicitly enabled", () => {
    const server = read("server/index.ts");
    const fallbackStart = server.indexOf(
      "const allowPublicMarketplaceCatalogFallback",
    );
    const fallbackSource = server.slice(
      fallbackStart,
      server.indexOf(
        "const filterOperationalMarketplaceTestData",
        fallbackStart,
      ),
    );

    assert.match(fallbackSource, /!isProductionRuntime/);
    assert.match(
      fallbackSource,
      /DIRECTSIGN_ALLOW_BUNDLED_CATALOG_FALLBACK === "true"/,
    );
    assert.doesNotMatch(server, /DISABLE_PUBLIC_MARKETPLACE_CATALOG_FALLBACK/);
    assert.match(server, /`public-marketplace:\$\{key\}:v2`/);
  });

  it("publishes campaigns from the authoritative source and finalizes unselected applicants atomically", () => {
    const server = read("server/index.ts");
    const dashboard = read("src/pages/marketing/Dashboard.tsx");
    const campaignPage = read("src/pages/marketplace/CampaignPages.tsx");
    const dashboardDomain = read("src/domain/influencerDashboard.ts");
    const finalizationMigration = read(
      "supabase/migrations/20260806140000_finalize_campaign_recruitment.sql",
    );
    const applicationBoundaryMigration = read(
      "supabase/migrations/20260806141000_lock_campaign_application_boundaries.sql",
    );
    const notificationMigration = read(
      "supabase/migrations/20260803100000_add_customer_notification_center.sql",
    );

    const publicReaderStart = server.indexOf(
      "const readMarketplaceCampaignPosts = async",
    );
    const publicReaderSource = server.slice(
      publicReaderStart,
      server.indexOf("const publicMarketplaceCacheMaxAgeSeconds", publicReaderStart),
    );
    assert.notEqual(publicReaderStart, -1);
    assert.match(
      publicReaderSource,
      /readAllNormalizedMarketplaceCampaignRows\([\s\S]*?status=eq\.open&archived_at=is\.null/,
    );
    assert.match(publicReaderSource, /is_published=eq\.true&archived_at=is\.null/);
    assert.match(publicReaderSource, /filterOperationalMarketplaceTestData/);
    assert.match(server, /"marketplace-campaigns",\s*readMarketplaceCampaignPosts/);

    const statusUpdateStart = server.indexOf(
      "const updateAdvertiserMarketplaceCampaignStatus = async",
    );
    const statusUpdateSource = server.slice(
      statusUpdateStart,
      server.indexOf("const buildMarketplaceCampaignSnapshot", statusUpdateStart),
    );
    assert.match(
      statusUpdateSource,
      /requestedStatus === "closed"[\s\S]*?finalizeMarketplaceCampaignRecruitmentAtomically/,
    );
    assert.match(statusUpdateSource, /await clearPublicMarketplaceCache\(\)/);
    assert.match(statusUpdateSource, /not_selected_count: notSelectedCount/);

    const campaignUpdateIndex = finalizationMigration.indexOf(
      "update public.marketplace_campaigns",
    );
    const applicationUpdateIndex = finalizationMigration.indexOf(
      "update public.marketplace_contact_proposals",
    );
    assert.ok(campaignUpdateIndex >= 0);
    assert.ok(applicationUpdateIndex > campaignUpdateIndex);
    assert.match(finalizationMigration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
    assert.match(
      finalizationMigration,
      /campaign\.id = p_campaign_id[\s\S]*?campaign\.brand_profile_id = p_brand_profile_id[\s\S]*?campaign\.organization_id = p_organization_id/,
    );
    assert.match(
      finalizationMigration,
      /application\.direction = 'influencer_to_brand'[\s\S]*?application\.campaign_id = p_campaign_id[\s\S]*?application\.target_brand_profile_id = p_brand_profile_id[\s\S]*?application\.converted_contract_id is null[\s\S]*?application\.status in \('submitted', 'reviewed'\)/,
    );
    assert.match(finalizationMigration, /status = 'declined'/);
    assert.match(
      finalizationMigration,
      /revoke execute on function public\.finalize_marketplace_campaign_recruitment[\s\S]*?from public, anon, authenticated/,
    );
    assert.match(
      notificationMigration,
      /proposal\.status in \('submitted', 'reviewed'\)[\s\S]*?perform public\.project_campaign_status_notification\(v_source_key\)/,
    );

    assert.match(
      dashboard,
      /const APPLICANT_STATUS_FILTERS[\s\S]*?"reviewed",\s*"accepted",\s*"converted_to_contract",\s*"not_selected"/,
    );
    assert.match(
      campaignPage,
      /const applicationStatusFilterOptions[\s\S]*?"reviewed",\s*"accepted",\s*"converted_to_contract",\s*"not_selected"/,
    );
    const applicantFilterSource = dashboard.slice(
      dashboard.indexOf("const APPLICANT_STATUS_FILTERS"),
      dashboard.indexOf("const APPLICANT_SORT_OPTIONS"),
    );
    const applicationFilterSource = campaignPage.slice(
      campaignPage.indexOf("const applicationStatusFilterOptions"),
      campaignPage.indexOf("const openCampaignSortOptions"),
    );
    assert.doesNotMatch(applicantFilterSource, /"declined"|"closed"/);
    assert.doesNotMatch(applicationFilterSource, /"declined"|"closed"/);
    assert.equal(
      getMarketplaceCampaignApplicationCustomerStatus({
        status: "closed",
        convertedContractId: "legacy-selected-contract",
      }),
      "converted_to_contract",
    );
    assert.equal(
      getMarketplaceCampaignApplicationCustomerStatus({ status: "closed" }),
      "not_selected",
    );
    assert.equal(
      getMarketplaceCampaignApplicationCustomerStatus({ status: "declined" }),
      "not_selected",
    );
    assert.match(
      campaignPage,
      /application\.status === "declined" \|\| application\.status === "closed"[\s\S]*?aria-label="추가 액션 없음"[\s\S]*?—/,
    );
    assert.doesNotMatch(campaignPage, /to="\/influencer\/messages"/);
    assert.match(
      campaignPage,
      /not_selected:[\s\S]*?label: "미선정"[\s\S]*?border-neutral-200 bg-neutral-100 text-neutral-600/,
    );
    const applicationStageMetaStart = server.indexOf(
      "const applicationStageMeta",
    );
    const applicationStageMetaSource = server.slice(
      applicationStageMetaStart,
      server.indexOf("const inferApplicationStage", applicationStageMetaStart),
    );
    assert.doesNotMatch(applicationStageMetaSource, /메시지/);
    assert.match(
      applicationStageMetaSource,
      /reviewed:[\s\S]*?actionLabel: "신청 내역 보기"[\s\S]*?선정 결과를 기다려 주세요/,
    );
    assert.match(
      applicationStageMetaSource,
      /closed:[\s\S]*?label: "미선정"[\s\S]*?이번 캠페인은 미선정되었습니다/,
    );

    const submissionCampaignLockIndex = applicationBoundaryMigration.indexOf(
      "for key share",
    );
    const submissionOpenCheckIndex = applicationBoundaryMigration.indexOf(
      "v_campaign.status <> 'open'",
    );
    const reservationCampaignLockIndex = applicationBoundaryMigration.indexOf(
      "select campaign.* into v_campaign",
      submissionOpenCheckIndex,
    );
    const reservationProposalLockIndex = applicationBoundaryMigration.indexOf(
      "select proposal.* into v_proposal",
      reservationCampaignLockIndex,
    );
    assert.ok(submissionCampaignLockIndex >= 0);
    assert.ok(submissionOpenCheckIndex > submissionCampaignLockIndex);
    assert.ok(reservationCampaignLockIndex > submissionOpenCheckIndex);
    assert.ok(reservationProposalLockIndex > reservationCampaignLockIndex);
    assert.match(
      applicationBoundaryMigration,
      /v_campaign\.status <> 'open'[\s\S]*?message = 'campaign is not open for applications'/,
    );
    assert.match(
      applicationBoundaryMigration,
      /v_proposal\.status = 'accepted'[\s\S]*?'already_reserved'/,
    );
    assert.match(
      applicationBoundaryMigration,
      /v_campaign\.status <> 'open'[\s\S]*?'campaign_closed'[\s\S]*?status = 'accepted'/,
    );
    assert.match(
      applicationBoundaryMigration,
      /revoke execute on function public\.reserve_marketplace_campaign_application_selection[\s\S]*?from public, anon, authenticated/,
    );
    assert.match(
      applicationBoundaryMigration,
      /actor\.data_origin = brand\.data_origin[\s\S]*?brand\.data_origin <> 'production'[\s\S]*?qa\|test\|demo\|seed[\s\S]*?directsign/,
    );

    const contractCreationStart = server.indexOf(
      "const createDraftContractFromMarketplaceApplication",
    );
    const contractCreationSource = server.slice(
      contractCreationStart,
      server.indexOf("const readVerificationRequests", contractCreationStart),
    );
    const reservationIndex = contractCreationSource.indexOf(
      "reserveMarketplaceCampaignApplicationSelectionAtomically",
    );
    const contractWriteIndex = contractCreationSource.indexOf("await writeStore(");
    assert.ok(reservationIndex >= 0);
    assert.ok(contractWriteIndex > reservationIndex);
    assert.match(
      contractCreationSource,
      /proposalStatus === "declined"[\s\S]*?미선정으로 확정된 지원자는 선정할 수 없습니다/,
    );
    assert.doesNotMatch(contractCreationSource, /지원 수락|신청을 수락/);
    assert.match(server, /campaign_application_accepted: "지원자 선정"/);
    assert.match(server, /campaign_application_not_selected: "미선정"/);
    assert.match(server, /if \(row\.status === "accepted"\) return "reserved"/);
    assert.match(
      dashboard,
      /thread\.status === "accepted"[\s\S]*?isSelectionReserved[\s\S]*?"선정 계속"/,
    );
    assert.match(
      dashboard,
      /hasSelectionReservations[\s\S]*?showApplicantsPanel[\s\S]*?reservedOnly=\{!isRecruitingDetail\}/,
    );
    assert.match(
      contractCreationSource,
      /stableUuid\([\s\S]*?marketplace-proposal-contract:\$\{proposal\.id\}/,
    );
    const actionStart = dashboard.indexOf("function getCampaignStatusActions");
    const actionSource = dashboard.slice(
      actionStart,
      dashboard.indexOf("function formatCampaignStatusLabel", actionStart),
    );
    assert.match(
      actionSource,
      /선정하지 않은 지원자는 미선정으로 확정됩니다/,
    );
    assert.doesNotMatch(actionSource, /탈락|거절/);
    assert.match(dashboardDomain, /\| "declined"/);
    assert.match(server, /if \(row\.status === "declined"\) return "declined"/);
    assert.match(server, /label: "미선정"[\s\S]*?이번 캠페인은 미선정되었습니다/);
  });

  it("keeps signup continuations role-scoped and campaign applications in the applied view", () => {
    const server = read("server/index.ts");
    const progressiveCampaignMigration = read(
      "supabase/migrations/20260806110000_add_progressive_campaign_verification.sql",
    );
    const nextPathStart = server.indexOf("const signupNextPathRules");
    const nextPathSource = server.slice(
      nextPathStart,
      server.indexOf("const getBearerToken", nextPathStart),
    );
    const campaignCreateStart = server.indexOf(
      "const upsertAdvertiserMarketplaceCampaign",
    );
    const campaignCreateSource = server.slice(
      campaignCreateStart,
      server.indexOf(
        "const updateAdvertiserMarketplaceCampaignStatus",
        campaignCreateStart,
      ),
    );
    assert.match(nextPathSource, /allowedPrefixes: \["\/advertiser"\]/);
    assert.match(
      nextPathSource,
      /allowedPrefixes: \["\/influencer", "\/contract", "\/campaigns"\]/,
    );
    assert.match(nextPathSource, /candidate\.startsWith\("\/\/"\)/);
    assert.match(nextPathSource, /candidate\.includes\("\\\\"\)/);
    assert.match(nextPathSource, /parsed\.origin === baseUrl\.origin/);
    assert.equal((server.match(/request\.body\?\.next_path/g) ?? []).length, 2);
    assert.equal(
      (
        server.match(
          /buildEmailConfirmationRedirect\([\s\S]{0,120}nextPath/g,
        ) ?? []
      ).length,
      2,
    );
    assert.match(server, /"\/influencer\/campaigns\?view=applied"/);
    assert.match(campaignCreateSource, /publishMarketplaceCampaignAtomically/);
    assert.match(
      progressiveCampaignMigration,
      /order by campaign\.created_at desc, campaign\.id desc[\s\S]*limit 20/,
    );
    assert.doesNotMatch(progressiveCampaignMigration, /limit 8/);
  });

  it("marks private contract list responses no-store", () => {
    const server = read("server/index.ts");
    const contractsStart = server.indexOf('app.get("/api/contracts"');
    const contractsSource = server.slice(
      contractsStart,
      server.indexOf(
        'app.get("/api/contracts/:id/deliverables"',
        contractsStart,
      ),
    );

    assert.notEqual(
      contractsStart,
      -1,
      "private contract list route must exist",
    );
    assert.match(
      contractsSource,
      /response\.setHeader\("Cache-Control", "no-store"\)/,
    );
  });

  it("does not turn an unknown influencer country into Korea", () => {
    const collector = read("scripts/discover-korean-influencers.mjs");
    const marketplacePage = read("src/pages/marketplace/MarketplacePages.tsx");
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260712010000_fix_influencer_country_semantics.sql",
    );
    const expandedCountryMigration = read(
      "supabase/migrations/20260712020000_expand_influencer_country_codes.sql",
    );

    assert.doesNotMatch(
      collector,
      /audience_countries:\s*hasKoreaProfileSignal\(`\$\{displayName\} \$\{description\} \$\{keyword\}`\)/,
    );
    assert.doesNotMatch(server, /location:\s*"한국"/);
    assert.match(
      collector,
      /row\.platform === "naver_blog" \|\|\s*\(hasCountrySignal && hasRequiredTikTokSignal\)/,
    );
    assert.doesNotMatch(
      collector,
      /platform:\s*"naver_blog"[\s\S]{0,1200}audience_countries:\s*\["south_korea"\]/,
    );
    assert.match(collector, /existingSameId\?\.status === "hidden"/);
    assert.match(collector, /existingEvidence\.countryLock === true/);
    assert.match(collector, /sanitizeInfluencerCollectedRow/);
    assert.ok((marketplacePage.match(/"국가 미확인"/g) ?? []).length >= 2);
    assert.match(migration, /set default '\{\}'::text\[\]/);
    assert.match(
      migration,
      /Search locale and ranking market are not creator-country evidence/,
    );
    assert.match(expandedCountryMigration, /iso_\[a-z\]\{2\}/);
    assert.equal(marketplaceCountryFromIso("FR"), "iso_fr");
    assert.equal(getMarketplaceCountryLabel("iso_fr"), "프랑스");
    assert.equal(isMarketplaceCountryCode("iso_fr"), true);
    assert.equal(isMarketplaceCountryCode("iso_zz"), false);
    assert.equal(marketplaceCountryOptions.includes("iso_fr"), true);
  });
});
