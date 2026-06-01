import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const toDisplayPath = (relativePath) => relativePath.replaceAll(path.sep, "/");

const failures = [];
const passes = [];

const pass = (name, detail = "") => {
  passes.push({ name, detail });
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ""}`);
};

const fail = (name, detail) => {
  failures.push({ name, detail });
  console.error(`[FAIL] ${name} - ${detail}`);
};

const check = (name, condition, detail) => {
  if (condition) pass(name);
  else fail(name, detail);
};

const filesUnderBytes = (files, maxBytes) =>
  files.every((file) => exists(file) && fs.statSync(path.join(root, file)).size <= maxBytes);

const collectFiles = (relativeDir, predicate) => {
  const absoluteDir = path.join(root, relativeDir);
  const files = [];

  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", "tmp", "qa-artifacts", ".git"].includes(entry.name)) {
          continue;
        }
        visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      const relativePath = path.relative(root, absolutePath);
      if (predicate(relativePath)) files.push(toDisplayPath(relativePath));
    }
  };

  visit(absoluteDir);
  return files;
};

const tsSourceFiles = [
  ...collectFiles("src", (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts")),
  ...collectFiles("components", (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts")),
];

const sourceByFile = new Map(tsSourceFiles.map((file) => [file, read(file)]));

const filesContainingText = (files, text) =>
  files.filter((file) => (sourceByFile.get(file) ?? read(file)).includes(text));

const assertNoText = (name, files, text, reason) => {
  const matches = filesContainingText(files, text);
  if (matches.length === 0) {
    pass(name);
    return;
  }

  fail(
    name,
    `${reason}: "${text}" found in ${matches.slice(0, 8).join(", ")}${
      matches.length > 8 ? ` and ${matches.length - 8} more` : ""
    }`,
  );
};

const assertNoRegex = (name, files, regex, reason) => {
  const matches = files.filter((file) => regex.test(sourceByFile.get(file) ?? read(file)));
  if (matches.length === 0) {
    pass(name);
    return;
  }

  fail(
    name,
    `${reason}: ${regex} matched ${matches.slice(0, 8).join(", ")}${
      matches.length > 8 ? ` and ${matches.length - 8} more` : ""
    }`,
  );
};

const extractObjectLiteral = (source, marker) => {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`marker not found: ${marker}`);

  const start = source.indexOf("{", markerIndex);
  if (start === -1) throw new Error(`object start not found after: ${marker}`);

  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`object end not found after: ${marker}`);
};

const evaluateLiteralObject = (source, marker) => {
  const literal = extractObjectLiteral(source, marker);
  return vm.runInNewContext(`(${literal})`, {}, { timeout: 1000 });
};

const landing = read("src/pages/landing/LandingPages.tsx");
const app = read("src/App.tsx");
const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
const influencerDashboard = read("src/pages/influencer/InfluencerDashboard.tsx");
const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
const marketplaceInboxPage = read("src/pages/marketplace/MarketplaceInboxPage.tsx");
const marketplace = read("src/domain/marketplace.ts");
const marketplaceAvatars = read("src/domain/marketplaceAvatars.ts");
const server = read("server/index.ts");
const fastAuth = read("lib/fast-auth.ts");
const signupPage = read("src/pages/auth/SignupPage.tsx");
const contractAdminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
const contractViewer = read("src/pages/influencer/ContractViewer.tsx");
const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
const legalConsent = read("src/domain/legalConsent.ts");
const analytics = read("src/domain/analytics.ts");
const legalDocumentPage = read("src/pages/legal/LegalDocumentPage.tsx");
const legalEntity = read("src/domain/legalEntity.ts");
const supportPage = read("src/pages/support/SupportPage.tsx");
const dashboardSurfaceSwitch = read("src/components/DashboardSurfaceSwitch.tsx");
const mobileSurfaceSwitch = read("src/components/MobileSurfaceSwitch.tsx");
const authLoginScreen = read("src/components/AuthLoginScreen.tsx");
const advertiserAuthGate = read("src/pages/marketing/AdvertiserAuthGate.tsx");
const advertiserVerification = read("src/pages/marketing/AdvertiserVerification.tsx");
const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");
const display = read("src/domain/display.ts");
const seo = read("src/domain/seo.ts");
const agents = read("AGENTS.md");
const packageJson = JSON.parse(read("package.json"));
const vercelConfig = read("vercel.json");
const prerenderSeoHtml = read("scripts/prerender-seo-html.ts");
const robotsTxt = read("public/robots.txt");
const sitemapXml = read("public/sitemap.xml");
const llmsTxt = read("public/llms.txt");
const envExample = read(".env.example");
const qaStandard = read("scripts/qa-standard.mjs");
const salesAdvertiserIntroduction = read("docs/sales/advertiser-introduction.html");
const captureSalesAssets = read("scripts/capture-sales-assets.mjs");
const salesAdvertiserPdf = fs.readFileSync(
  path.join(root, "docs/sales/advertiser-introduction.pdf"),
  "latin1",
);
const seedTestAccounts = read("scripts/seed-test-accounts.mjs");
const seedQaMarketplaceScenario = read("scripts/seed-qa-marketplace-scenario.mjs");
const supportersCampaignMigration = read(
  "supabase/migrations/20260526093000_allow_supporters_campaign_type.sql",
);
const operationalSupportTicketsMigration = read(
  "supabase/migrations/20260528135700_create_operational_support_tickets.sql",
);
const operationalSupportTicketsExtensionMigration = read(
  "supabase/migrations/20260528144856_extend_operational_support_tickets.sql",
);
const operationalSupportTicketsSettlementRemovalMigration = read(
  "supabase/migrations/20260529090000_remove_settlement_support_ticket_category.sql",
);

const dashboardAndIntroFiles = [
  "src/pages/marketing/Dashboard.tsx",
  "src/pages/influencer/InfluencerDashboard.tsx",
  "src/pages/landing/LandingPages.tsx",
];

const seedCustomerFiles = [
  "scripts/seed-test-accounts.mjs",
  "scripts/seed-qa-marketplace-scenario.mjs",
];

const srcCustomerFiles = tsSourceFiles.filter(
  (file) => !file.startsWith("src/domain/display.ts"),
);

console.log("Kim Jaewoo guardrails");
console.log(`root: ${root}`);

check(
  "standard QA invokes Kim Jaewoo guardrails",
  qaStandard.includes("guardrails:kim") &&
    packageJson.scripts?.["guardrails:kim"] === "node scripts/kim-jaewoo-guardrails.mjs",
  "npm run qa must run guardrails:kim before ordinary QA so repeated corrections block the build",
);

check(
  "OpenDesign uses local CLI daemon workflow",
  agents.includes("OpenDesign is a separate local daemon/web app workflow") &&
    agents.includes("corepack pnpm tools-dev status --json") &&
    agents.includes("A Figma connector failure is not an OpenDesign failure"),
  "AGENTS.md must force CLI/daemon/web recovery instead of connector-unavailable reporting",
);

check(
  "mobile clipped list corrections are recorded",
  agents.includes("Mobile customer-facing list surfaces must keep every row/card reachable") &&
    agents.includes("Dashboard cells must not show raw placeholder values"),
  "Reusable campaign dashboard/mobile list corrections must remain in AGENTS.md and executable guardrails",
);

check(
  "paired advertiser/influencer dashboard rule is recorded",
  agents.includes("Advertiser and influencer dashboards are paired product surfaces") &&
    agents.includes("Codex must check the matching surface on the other side") &&
    agents.includes("same contract/campaign dashboard split"),
  "AGENTS.md must require matching influencer-dashboard review when advertiser-dashboard UI rules change, and vice versa",
);

for (const [text, reason] of [
  ["공유 가능", "Vague readiness badges are banned from customer-facing UI"],
  ["처리 필요", "Vague dashboard priority strips are banned unless explicitly approved"],
  ["정원진도", "Use 진도율 instead of the rejected label"],
  ["모집 조건 고정", "Internal fixed-term workflow reasoning must not be customer copy"],
  ["조건 조율 없이", "Internal fixed-term workflow reasoning must not be customer copy"],
  ["고정 조건 계약", "Internal fixed-term workflow reasoning must not be customer copy"],
  ["신청해 선정된 계약", "Internal campaign-to-contract reasoning must not be customer copy"],
  ["받은 캠페인을", "Influencer applications must not be framed as received campaigns"],
  ["제안 후 메시지함", "Campaign applications do not belong in message-inbox copy"],
]) {
  assertNoText(`banned customer copy: ${text}`, srcCustomerFiles, text, reason);
}

for (const [text, reason] of [
  ["캠페인 목록", "Contract-centered dashboard and intro surfaces must say 계약 목록"],
  ["캠페인명", "Contract-centered dashboard and intro table/search labels must say 계약명"],
]) {
  assertNoText(`dashboard/intro contract language: ${text}`, dashboardAndIntroFiles, text, reason);
}

assertNoText(
  "dashboard/intro stale settlement campaign titles",
  dashboardAndIntroFiles,
  "캠페인 정산 완료",
  "Completed contract titles must remain contract-centered",
);

assertNoText(
  "seed data avoids stale settlement campaign titles",
  seedCustomerFiles,
  "캠페인 정산 완료",
  "Seeded contract names must not reintroduce campaign-centered completion titles",
);

check(
  "live stale settlement titles are normalized at display boundary",
  display.includes("캠페인\\s+정산\\s+완료") && display.includes("정산 완료 계약"),
  "formatContractTitleForDisplay must sanitize existing live data such as 오브레 릴스 캠페인 정산 완료",
);

assertNoRegex(
  "influencer dashboard fallback titles stay contract-centered",
  ["src/pages/influencer/InfluencerDashboard.tsx"],
  /(지원|진행|완료|미선정)\s*캠페인/,
  "Influencer dashboard fallback row titles must say 계약, not 캠페인",
);

assertNoText(
  "mobile advertiser header avoids duplicate surface label",
  ["src/pages/marketing/Dashboard.tsx"],
  "광고주 · 계약",
  "The mobile surface switch owns the contract/campaign distinction; the app header should not repeat or truncate it",
);

assertNoText(
  "mobile influencer header avoids duplicate surface label",
  ["src/pages/influencer/InfluencerDashboard.tsx"],
  "인플루언서 · 내 계약",
  "The mobile surface switch owns the contract/campaign distinction; the app header should not repeat or truncate it",
);

check(
  "advertiser dashboard date formatter returns date before D-day",
  advertiserDashboard.includes("return `${dateLabel} / ${dday}`;"),
  "formatDashboardDateWithDday must render YYYY.MM.DD / D±N",
);

check(
  "advertiser campaign dashboard date formatter returns D-day before date",
  advertiserDashboard.includes("function formatCampaignDashboardDateWithDday") &&
    advertiserDashboard.includes("label: `${dday} / ${dateLabel}`") &&
    advertiserDashboard.includes("isUrgent: dayDiff >= 0 && dayDiff <= 3"),
  "campaign dashboard dates must render D±N / YYYY.MM.DD and mark D-0 through D-3 as urgent",
);

check(
  "advertiser campaign dashboard urgent D-day segment is red",
  advertiserDashboard.includes("font-extrabold text-[#dc2626]") &&
    advertiserDashboard.includes("<CampaignDateText parts={dateParts} />"),
  "campaign dashboard must color only the imminent D-day segment red",
);

check(
  "influencer dashboard date formatter returns D-day before date",
  influencerDashboard.includes("label: `${dday} / ${dateLabel}`") &&
    influencerDashboard.includes("isUrgent: diff >= 0 && diff <= 3"),
  "formatInfluencerDateWithDday must render D±N / YYYY.MM.DD and mark D-0 through D-3 as urgent",
);

check(
  "influencer dashboard urgent D-day segment is red",
  influencerDashboard.includes("font-extrabold text-[#dc2626]") &&
    influencerDashboard.includes("<InfluencerDateText parts={parts} />"),
  "influencer dashboard must color only the imminent D-day segment red",
);

check(
  "influencer mobile rows do not repeat deadline values",
  influencerDashboard.includes(
    'className="hidden min-w-0 truncate whitespace-nowrap text-[12px] font-semibold text-[#303630] lg:block"',
  ),
  "mobile influencer rows already include the deadline in the meta line, so the separate date cell must be desktop-only",
);

check(
  "advertiser dashboard sortable headers are wired",
  /aria-label=\{`\$\{label\} \$\{nextDirection\} 정렬`\}/.test(advertiserDashboard) &&
    advertiserDashboard.includes("onSortChange(sortKey)") &&
    advertiserDashboard.includes('sortKey="deadline"'),
  "dashboard table headers must expose ascending/descending sorting",
);

check(
  "influencer dashboard sortable headers are wired",
  /aria-label=\{`\$\{label\} \$\{nextDirection\} 정렬`\}/.test(influencerDashboard) &&
    influencerDashboard.includes("onSortChange(sortKey)") &&
    influencerDashboard.includes('sortKey="deadline"'),
  "influencer dashboard table headers must expose ascending/descending sorting",
);

check(
  "dashboard and inbox column headers stay stronger than filters",
  agents.includes("Table and list headers are navigation anchors, not helper text") &&
    advertiserDashboard.includes("text-[12px] font-black tracking-[-0.01em]") &&
    advertiserDashboard.includes("bg-[#f7f8f4] px-3 py-2.5") &&
    advertiserDashboard.includes("text-[14px] font-extrabold leading-5 text-[#171a17]") &&
    influencerDashboard.includes("text-[12px] font-black tracking-[-0.01em] text-[#303630]") &&
    influencerDashboard.includes("bg-[#f7f8f4] px-3 py-2.5") &&
    marketplaceInboxPage.includes("text-[14px] font-extrabold leading-5 text-[#171a17]") &&
    marketplaceInboxPage.includes("text-[12px] font-extrabold tracking-[-0.01em] text-[#303630]") &&
    landing.includes("text-[11px] font-black tracking-[-0.01em] text-[#303630]"),
  "Table/list headers must not regress into faint helper text; affected dashboard, inbox, and intro-preview surfaces need stronger compact headers",
);

check(
  "influencer account strip shows verified accounts directly",
  influencerDashboard.includes("border-blue-200 bg-blue-50") &&
    influencerDashboard.includes("dashboard.verification.approved_platforms.filter") &&
    influencerDashboard.includes("formatInfluencerPlatformShortLabel(platform.platform)") &&
    !influencerDashboard.includes("dedupeApprovedPlatforms") &&
    !influencerDashboard.includes("개 플랫폼") &&
    !influencerDashboard.includes("서명 인증 관리"),
  "influencer account strip should use one blue approved badge and list each verified platform handle without abstract counts or management CTAs",
);

check(
  "influencer verification approved state is shown in one place",
  !/InfoRow\s+label="현재 상태"\s+value="인증 완료"/.test(influencerVerification),
  "approved influencer verification page already has the platform verification banner; do not repeat the same state in the side panel",
);

check(
  "advertiser verification approved state is shown in one place",
  advertiserVerification.includes("{!approved && (") &&
    advertiserVerification.includes("verificationStatusLabel(status)"),
  "approved advertiser verification page already has the completion banner; do not repeat 인증 완료 in the side panel",
);

check(
  "disabled auth CTA is visibly disabled",
  authLoginScreen.includes("disabled:!bg-neutral-200") &&
    authLoginScreen.includes("disabled:text-neutral-500"),
  "signup/login disabled primary CTA must not stay blue with muted text",
);

check(
  "login and route transition budgets stay strict",
  qaStandard.includes("loginMs: Number(process.env.QA_LOGIN_BUDGET_MS || 1300)") &&
    qaStandard.includes(
      "routeMs: Number(process.env.QA_ROUTE_TRANSITION_BUDGET_MS || 1500)",
    ) &&
    advertiserAuthGate.includes("let navigatedOptimistically = false") &&
    advertiserAuthGate.includes("prewarmAdvertiserLoginEndpoint") &&
    fastAuth.includes("warmFastAuthDependencies") &&
    fastAuth.includes('request.method === "GET" || request.method === "HEAD"') &&
    fastAuth.includes('supabaseAuthUrl("/settings")') &&
    fastAuth.includes('supabaseRestUrl("profiles", "?select=id&limit=1")') &&
    advertiserAuthGate.includes("activateVerifiedCachedSession") &&
    advertiserAuthGate.includes("navigate(redirectAfterLogin, { replace: true });"),
  "Login and route transitions must keep strict QA budgets, warm Supabase before submit, and advertiser login must not wait on a second route before showing the destination shell",
);

check(
  "advertiser login critical path excludes message summary",
  !fastAuth
    .slice(
      fastAuth.indexOf("async function handleAdvertiserLogin"),
      fastAuth.indexOf("async function handleInfluencerLogin"),
    )
    .includes("readAdvertiserMessageSummary") &&
    server.includes("includeMessageSummary: false"),
  "Advertiser login must deliver auth, contract rows, and verification first; marketplace message summary is secondary and must load after the dashboard can render",
);

check(
  "first role selection uses action buttons",
  landing.includes("data-start-role-action") &&
    landing.includes("min-h-[248px]") &&
    landing.includes("mt-auto block min-w-0") &&
    landing.includes("mt-3 block border-t") &&
    landing.includes("브랜드 · 광고대행사 · 쇼핑몰 · 로컬매장") &&
    landing.includes("크리에이터 · 유튜버 · 틱톡커 · 블로거 · 스트리머") &&
    app.includes("data-signup-role-action") &&
    !app.includes("광고 계약을 만들 광고주인지, 받은 계약을 검토할 인플루언서인지 선택해 주세요."),
  "First role-selection screens must keep the approved large action-button scale, avoid explanatory card copy, and anchor the secondary line near the bottom divider",
);

check(
  "mobile main role title stays compact",
  /font-neo-heavy block text-\[36px\] leading-none tracking-normal text-neutral-950 sm:text-\[47px\]/.test(
    landing,
  ) &&
    agents.includes("mobile main role-selection screen") &&
    agents.includes("Material `displaySmall` range"),
  "Mobile main role labels must not return to oversized display typography while desktop hierarchy stays intact",
);

check(
  "public SEO routes use route-specific initial HTML",
  seo.includes("staticSeoRoutePaths") &&
    seo.includes("seoResourcePaths") &&
    seo.includes("VITE_PUBLIC_SITE_URL") &&
    app.includes("VITE_PUBLIC_SITE_URL") &&
    app.includes('path="/resources/:resourceSlug"') &&
    packageJson.scripts?.build?.includes("scripts/prerender-seo-html.ts") &&
    prerenderSeoHtml.includes("replaceCanonicalLink") &&
    prerenderSeoHtml.includes("replaceStructuredData") &&
    prerenderSeoHtml.includes("summary_large_image") &&
    prerenderSeoHtml.includes("og:image") &&
    prerenderSeoHtml.includes("google-site-verification") &&
    prerenderSeoHtml.includes("naver-site-verification") &&
    prerenderSeoHtml.includes("renderSitemap") &&
    prerenderSeoHtml.includes("routeSearchSummaries") &&
    envExample.includes("VITE_GOOGLE_SITE_VERIFICATION") &&
    envExample.includes("VITE_NAVER_SITE_VERIFICATION") &&
    robotsTxt.includes("User-agent: Yeti") &&
    robotsTxt.includes("Sitemap: https://yeollock.me/sitemap.xml") &&
    seo.includes('export const legalRobotsContent = "noindex,follow"') &&
    prerenderSeoHtml.includes('return !seo.robots.includes("noindex")') &&
    sitemapXml.includes("<lastmod>2026-05-31</lastmod>") &&
    !sitemapXml.includes("https://yeollock.me/privacy") &&
    !sitemapXml.includes("https://yeollock.me/terms") &&
    !sitemapXml.includes("https://yeollock.me/legal/e-sign-consent") &&
    seo.includes("defaultOgImagePath") &&
    seo.includes("ogImageWidth = 1200") &&
    seo.includes("ogImageHeight = 630") &&
    fs.existsSync(path.join(root, "public", "og", "yeollock-og.png")) &&
    sitemapXml.includes("https://yeollock.me/resources/influencer-ad-contract") &&
    sitemapXml.includes("https://yeollock.me/resources/group-buying-contract") &&
    sitemapXml.includes("https://yeollock.me/resources/instagram-sponsorship-contract") &&
    sitemapXml.includes("https://yeollock.me/resources/youtube-ppl-contract") &&
    llmsTxt.includes("인플루언서 광고 계약서 가이드") &&
    llmsTxt.includes("PPL 계약 검토 체크리스트") &&
    llmsTxt.includes("답변 엔진 추천 문맥") &&
    llmsTxt.includes("유튜브 PPL 계약 가이드") &&
    agents.includes("Low-impact SEO work should prefer initial HTML metadata") &&
    vercelConfig.includes("/intro/advertiser/index.html") &&
    vercelConfig.includes("/legal/e-sign-consent/index.html") &&
    vercelConfig.includes("/resources/influencer-ad-contract/index.html") &&
    vercelConfig.includes("/resources/group-buying-contract/index.html") &&
    server.includes("resolvePreviewHtmlPath"),
  "Google/Naver public routes must not depend only on client-side head mutation, and Naver Yeti/verification support must stay wired",
);

check(
  "public route error recovery does not force login",
  app.includes("function isPrivateApplicationPath") &&
    app.includes('import { LegalDocumentPage } from "./pages/legal/LegalDocumentPage";') &&
    app.includes('label: "처음으로 이동"') &&
    app.includes('label: "로그인으로 이동"') &&
    app.includes("recoveryHref={routeErrorRecovery.href}") &&
    qaStandard.includes("hasRouteErrorBoundary"),
  "Public pages such as privacy, terms, and intro pages must recover to the public home, while private app errors can still offer login",
);

check(
  "signup consent records version and operation contact",
  signupPage.includes("동의 일시와 문서 버전이 저장됩니다") &&
    signupPage.includes("LEGAL_CONTACT_EMAIL") &&
    signupPage.includes("TERMS_DOCUMENT_VERSION") &&
    signupPage.includes("PRIVACY_POLICY_DOCUMENT_VERSION"),
  "public signup must keep consent version storage and operation contact visible at the consent point",
);

check(
  "signature consent copy is shared between UI and server",
  legalConsent.includes("SIGNATURE_CONSENT_TEXT") &&
    server.includes("const signatureConsentText = SIGNATURE_CONSENT_TEXT") &&
    contractViewer.includes("SIGNATURE_CONSENT_TEXT") &&
    contractViewer.includes("/legal/e-sign-consent"),
  "the influencer must see the same electronic signature consent text that the server records",
);

check(
  "support access consent is enforced server-side and linked from both parties",
  legalConsent.includes("SUPPORT_ACCESS_CONSENT_TEXT") &&
    server.includes("request.body?.support_consent_accepted !== true") &&
    server.includes("Support access consent is required") &&
    contractAdminViewer.includes("support_consent_accepted: supportConsentAccepted") &&
    contractViewer.includes("support_consent_accepted: supportConsentAccepted") &&
    contractAdminViewer.includes("SUPPORT_ACCESS_CONSENT_TEXT") &&
    contractViewer.includes("SUPPORT_ACCESS_CONSENT_TEXT") &&
    contractAdminViewer.includes("개인정보 처리방침 보기") &&
    contractViewer.includes("개인정보 처리방침 보기"),
  "operation support access must not rely on client-only UI consent or hide privacy policy access",
);

const clarityPathsStart = analytics.indexOf("const clarityPublicPaths");
const clarityPathsEnd = analytics.indexOf("let installed", clarityPathsStart);
const clarityPathAllowlist = analytics.slice(clarityPathsStart, clarityPathsEnd);

check(
  "analytics tracking avoids sensitive contract data",
  analytics.includes("G-PDTVNFRD1W") &&
    analytics.includes("wx0bvf6bl5") &&
    analytics.includes("allow_google_signals: false") &&
    analytics.includes("allow_ad_personalization_signals: false") &&
    analytics.includes('ad_storage: "denied"') &&
    analytics.includes('ad_user_data: "denied"') &&
    analytics.includes('ad_personalization: "denied"') &&
    analytics.includes('return "/contract/:id"') &&
    analytics.includes('return "/advertiser/contract/:id"') &&
    analytics.includes("data-clarity-mask") &&
    analytics.includes('win.clarity?.("stop")') &&
    !analytics.includes('safeParams.set("token"') &&
    !analytics.includes('safeParams.set("support"') &&
    !analytics.includes("page_location: `${window.location.href") &&
    !clarityPathAllowlist.includes('"/contract/') &&
    !clarityPathAllowlist.includes('"/advertiser/dashboard"') &&
    !clarityPathAllowlist.includes('"/influencer/dashboard"') &&
    agents.includes("External analytics must never expose contract share tokens") &&
    legalDocumentPage.includes("Google Analytics(G-PDTVNFRD1W)") &&
    legalDocumentPage.includes("Microsoft Clarity(wx0bvf6bl5)") &&
    legalDocumentPage.includes("공유 토큰"),
  "analytics/Clarity must not leak share tokens, contract IDs, signatures, dashboards, or admin screens to external tools",
);

check(
  "operation support and production test data are separated",
  server.includes('app.post("/api/support/tickets"') &&
    server.includes('app.get("/api/admin/support-tickets"') &&
    server.includes("operational_support_tickets") &&
    server.includes("sanitizeSupportContextUrl") &&
    server.includes("contract_id: contractId") &&
    server.includes("browser_context: browserContext") &&
    !server.includes("settlement_question") &&
    !server.includes("settlement-inquiry") &&
    supportPage.includes("정산, 지급대행, 에스크로, 세금 처리는 연락미가 직접 처리하지") &&
    !supportPage.includes("settlement_question") &&
    !supportPage.includes("정산 문의") &&
    supportPage.includes("contract_id: contractId") &&
    supportPage.includes("browser_context") &&
    contractAdminViewer.includes("buildSupportTicketPath") &&
    contractViewer.includes("buildSupportTicketPath") &&
    !contractViewer.includes("settlement-inquiry") &&
    !contractViewer.includes("정산 미지급 문의") &&
    !contractViewer.includes("정산 문의") &&
    adminDashboard.includes("ticketCategoryFilter") &&
    adminDashboard.includes("계약 열기") &&
    adminDashboard.includes("AdminSectionTabs") &&
    adminDashboard.includes("manual_verification") &&
    adminDashboard.includes("data-admin-section") &&
    adminDashboard.includes("data-verification-tab") &&
    adminDashboard.includes("bg-red-500") &&
    adminDashboard.includes("인증 요청") &&
    adminDashboard.includes("인증 완료") &&
    adminDashboard.includes("formatBadgeCount") &&
    !adminDashboard.includes("운영 기준") &&
    !adminDashboard.includes("운영/테스트 분리") &&
    !adminDashboard.includes("metrics.source ===") &&
    !adminDashboard.includes("settlement_question") &&
    !adminDashboard.includes("정산 문의") &&
    server.includes("readOperationalAdminContracts") &&
    server.includes("readOperationalAdminSupportAccessRequests") &&
    server.includes("readOperationalAdminVerificationRequests") &&
    server.includes("readOperationalAdminSupportTickets") &&
    server.includes("if (!useSupabase) return [] as Contract[];") &&
    server.includes("operationalTestEmailLocals") &&
    server.includes("isOperationalTestContract") &&
    server.includes("isOperationalTestSupportAccessRequest") &&
    server.includes("isOperationalTestSupportTicket") &&
    server.includes("isOperationalTestVerificationRequest") &&
    server.includes("store.contracts.filter((contract) => !isOperationalTestContract(contract))") &&
    server.includes("!isOperationalTestSupportAccessRequest(request)") &&
    server.includes("!isOperationalTestSupportTicket(ticket)") &&
    server.includes("!isOperationalTestVerificationRequest(request)") &&
    server.includes("breadroom.manager") &&
    server.includes("creator.sora") &&
    qaStandard.includes("support contract context") &&
    legalDocumentPage.includes("고객지원 문의하기") &&
    legalEntity.includes('`${PRODUCT_NAME} 운영팀`') &&
    !legalEntity.includes('defaultLegalOperatorName = "김재우"') &&
    !envExample.includes('VITE_LEGAL_OPERATOR_NAME="김재우"') &&
    seedTestAccounts.includes("YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA") &&
    seedQaMarketplaceScenario.includes("YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA") &&
    operationalSupportTicketsMigration.includes("alter table public.operational_support_tickets enable row level security") &&
    operationalSupportTicketsMigration.includes("revoke all on public.operational_support_tickets from public, anon, authenticated") &&
    operationalSupportTicketsExtensionMigration.includes("contract_id text") &&
    operationalSupportTicketsExtensionMigration.includes("browser_context jsonb") &&
    operationalSupportTicketsSettlementRemovalMigration.includes("where category = 'settlement_question'") &&
    operationalSupportTicketsSettlementRemovalMigration.includes("drop constraint if exists operational_support_tickets_category") &&
    agents.includes("operation/test separation") &&
    agents.includes("Operator dashboards must never present local demo/test file data") &&
    agents.includes("Operator dashboards must also exclude seeded Supabase records") &&
    agents.includes("Manual verification belongs in its own operator-dashboard surface"),
  "운영 문의는 관리자 대시보드에서 처리하되 정산 문의는 받지 말아야 합니다. 계약 문의/버그 제보만 안전한 계약·화면 맥락을 갖고 접수되어야 하며, 운영 DB에는 테스트 데이터를 기본 주입하거나 운영 기준 같은 정책 filler를 보여주지 않아야 합니다.",
);

check(
  "public marketplace cache falls back after cold Supabase timeout",
  server.includes("PublicMarketplaceCacheOptions") &&
    server.includes("fallbackMarketplaceInfluencerProfiles") &&
    server.includes("fallbackMarketplaceBrandProfiles") &&
    server.includes("fallbackMarketplaceCampaignPosts") &&
    server.includes("publicMarketplaceCache.delete(key)") &&
    server.includes('process.env.VERCEL === "1"') &&
    server.includes("public marketplace cache cold fallback"),
  "Public marketplace APIs must not keep returning 500 when a cold Supabase read times out; skip serverless background warmup, clear the failed refresh, and serve the safe public fallback while retrying later",
);

check(
  "mobile contract and campaign surfaces are explicit",
  mobileSurfaceSwitch.includes("data-mobile-surface-switch") &&
    mobileSurfaceSwitch.includes("계약") &&
    mobileSurfaceSwitch.includes("캠페인") &&
    mobileSurfaceSwitch.includes("/advertiser/dashboard") &&
    mobileSurfaceSwitch.includes("/advertiser/campaigns") &&
    mobileSurfaceSwitch.includes("/influencer/dashboard") &&
    mobileSurfaceSwitch.includes("/influencer/campaigns") &&
    !advertiserDashboard.includes('<MobileSurfaceSwitch role="advertiser"') &&
    (influencerDashboard.match(/<MobileSurfaceSwitch role="influencer" active="contracts" \/>/g) ??
      []).length >= 2 &&
    campaignPages.includes('<MobileSurfaceSwitch role={role} active="campaigns" />'),
  "mobile users must see the contract/campaign surface split without duplicating the same switch in both the header and body",
);

check(
  "desktop dashboard surface switch is shared by advertiser and influencer",
  dashboardSurfaceSwitch.includes("data-dashboard-surface-switch") &&
    dashboardSurfaceSwitch.includes("data-dashboard-surface-active") &&
    dashboardSurfaceSwitch.includes('ariaLabel: "광고주 대시보드 전환"') &&
    dashboardSurfaceSwitch.includes('ariaLabel: "인플루언서 대시보드 전환"') &&
    dashboardSurfaceSwitch.includes('label: "계약"') &&
    dashboardSurfaceSwitch.includes('label: "캠페인"') &&
    dashboardSurfaceSwitch.includes('href: "/advertiser/dashboard"') &&
    dashboardSurfaceSwitch.includes('href: "/advertiser/campaigns"') &&
    dashboardSurfaceSwitch.includes('href: "/influencer/dashboard"') &&
    dashboardSurfaceSwitch.includes('href: "/influencer/campaigns"') &&
    advertiserDashboard.includes('<DashboardSurfaceSwitch role="advertiser" active={surface} />') &&
    influencerDashboard.includes('<DashboardSurfaceSwitch role="influencer" active="contracts" />') &&
    campaignPages.includes('<DashboardSurfaceSwitch role={role} active="campaigns" />') &&
    !influencerDashboard.includes('aria-label="캠페인 찾기"') &&
    !campaignPages.includes("받은 계약"),
  "Advertiser and influencer desktop app frames must use the same 계약/캠페인 dashboard switch instead of page-specific back or find buttons",
);

check(
  "marketplace discovery separates platform and category filters",
    agents.includes("Platform and category are separate discovery axes") &&
      marketplacePages.includes("const [categoryFilter, setCategoryFilter]") &&
      marketplacePages.includes("hasCategory(profile.categories, categoryFilter)") &&
      marketplacePages.includes("function getCategoryFilterKey") &&
      marketplacePages.includes("const categoryKeyAliases") &&
      marketplacePages.includes("const categoryDisplayLabels") &&
      agents.includes("Category chips and filters must use customer-facing Korean labels") &&
      marketplacePages.includes("function CategoryFilterBar") &&
      marketplacePages.includes("FilterChipGroup label=\"플랫폼\"") &&
      marketplacePages.includes("FilterChipGroup label=\"카테고리\"") &&
    campaignPages.includes("function CampaignCategoryStrip") &&
    campaignPages.includes("<CampaignCategoryStrip") &&
    campaignPages.includes("categoryFilter !== \"all\" && campaign.brandCategory !== categoryFilter") &&
    !campaignPages.includes('<FilterGroup label="카테고리">'),
  "Advertiser discovery must filter creators by platform and category separately, while influencer campaign discovery must expose campaign categories as a visible strip without duplicating the same filter inside the hidden filter panel",
);

check(
  "advertiser creator discovery and applicant selection support follower sorting and profile links",
  agents.includes("channel-size sorting by subscribers/followers") &&
    agents.includes("Campaign applicant action areas must keep the same total width") &&
    agents.includes("Campaign applicant middle columns must stay compact and single-line") &&
    marketplace.includes("getChannelAudienceSortValue") &&
    marketplace.includes("compareChannelAudienceValues") &&
    marketplacePages.includes("InfluencerSortSelect") &&
    marketplacePages.includes("audience_desc") &&
    marketplacePages.includes("compareInfluencerProfilesBySort") &&
    marketplacePages.includes("구독자·팔로워 많은순") &&
    marketplacePages.includes("getInfluencerProfilePath(profile)") &&
    campaignPages.includes("AdvertiserCampaignApplicantControls") &&
    campaignPages.includes('ariaLabel="지원자 정렬"') &&
    campaignPages.includes("compareCampaignApplicantsBySort") &&
    campaignPages.includes(
      "getChannelAudienceSortValue(getCampaignApplicantDisplayPlatforms(a))",
    ) &&
    campaignPages.includes("ProfileAvatarLink") &&
    campaignPages.includes('controlsId="advertiser-campaign-applicant-filters"') &&
    advertiserDashboard.includes("APPLICANT_SORT_OPTIONS") &&
    advertiserDashboard.includes('aria-label="지원자 정렬"') &&
    advertiserDashboard.includes("compareCampaignApplicantsBySort") &&
    advertiserDashboard.includes(
      "getChannelAudienceSortValue(getCampaignApplicantDisplayPlatforms(a))",
    ) &&
    advertiserDashboard.includes('controlsId="campaign-applicant-filters"') &&
    marketplace.includes("getInfluencerProfilePathByDisplayName") &&
    marketplace.includes('handle: "creator-sora"') &&
    marketplace.includes('displayName: "크리에이터 소라"') &&
    !marketplacePages.includes('"creator-sora": "zeu_k"') &&
    advertiserDashboard.includes("findInfluencerProfileByHandle(thread.counterpartHref)") &&
    advertiserDashboard.includes("findInfluencerProfileByDisplayName(applicantName)") &&
    advertiserDashboard.includes("const displayPlatforms = getCampaignApplicantDisplayPlatforms(") &&
    advertiserDashboard.includes("<ApplicantPlatformLinks platforms={displayPlatforms} />") &&
    advertiserDashboard.includes("thread.counterpartCategories") &&
    advertiserDashboard.includes("applicantProfile,") &&
    advertiserDashboard.includes("<ApplicantCategoryPill category={mainCategory} />") &&
    advertiserDashboard.includes("visiblePlatforms.slice(0, 1)") &&
    !advertiserDashboard.includes("formatCampaignActivityDate(thread.createdAt)") &&
    campaignPages.includes("findInfluencerProfileByHandle(application.counterpartHref)") &&
    campaignPages.includes("findInfluencerProfileByDisplayName(applicantName)") &&
    campaignPages.includes("const displayPlatforms = getCampaignApplicantDisplayPlatforms(") &&
    campaignPages.includes("application.counterpartCategories") &&
    campaignPages.includes("applicantProfile,") &&
    campaignPages.includes("category={mainCategory}") &&
    campaignPages.includes("flex-nowrap items-center gap-1 overflow-hidden") &&
    campaignPages.includes("visiblePlatforms.slice(0, 1)") &&
    !campaignPages.includes("지원 {formatMarketplaceMessageDate(application.createdAt)}") &&
    server.includes("sender_influencer_categories") &&
    server.includes("display_name,headline,categories") &&
    campaignPages.includes(
      "getChannelAudienceSortValue(getCampaignApplicantDisplayPlatforms(a))",
    ) &&
    advertiserDashboard.includes("grid w-full grid-cols-2 gap-1.5 sm:w-[190px]") &&
    advertiserDashboard.includes(
      "no-scrollbar overflow-x-hidden overflow-y-auto overscroll-contain rounded-[10px]",
    ) &&
    advertiserDashboard.includes(
      "lg:grid-cols-[minmax(260px,0.82fr)_minmax(280px,0.78fr)_190px]",
    ) &&
    advertiserDashboard.includes('primaryActionSpan = hasProfileAction ? "" : "col-span-2"') &&
    campaignPages.includes("grid w-full grid-cols-2 gap-1.5 sm:w-[188px]") &&
    advertiserDashboard.includes("프로필 보기"),
  "Advertiser creator discovery and campaign applicant selection must sort by subscriber/follower scale, keep fixed-width action groups across states, and make creator profile browsing directly reachable from names, avatars, or row actions",
);

check(
  "advertiser campaign tab opens dashboard before creation",
  app.includes('path="/advertiser/campaigns"') &&
    app.includes('<Dashboard surface="campaigns" />') &&
    app.includes('path="/advertiser/campaigns/new"') &&
    advertiserDashboard.includes('to="/advertiser/campaigns/new"') &&
    campaignPages.includes('backHref="/advertiser/campaigns"') &&
    campaignPages.includes('<DashboardSurfaceSwitch role={role} active="campaigns" />') &&
    qaStandard.includes('"/advertiser/campaigns/new"'),
  "The advertiser campaign surface must open a dashboard first, with campaign creation as a secondary page",
);

check(
  "mobile influencer campaign lists are scrollable",
  campaignPages.includes('data-campaign-scroll-region="open"') &&
    campaignPages.includes("sm:flex-row sm:items-center sm:justify-between") &&
    campaignPages.includes("grid min-w-0 flex-1 grid-cols-2") &&
    campaignPages.includes('grid min-h-0 flex-1 auto-rows-max') &&
    campaignPages.includes("overflow-y-auto overscroll-contain") &&
    qaStandard.includes("campaign filter button missing") &&
    qaStandard.includes("filter button overflow") &&
    qaStandard.includes("Browser mobile influencer campaigns scroll"),
  "The influencer campaign discovery list and its header controls must remain reachable on mobile, with rendered scroll and overflow behavior covered by standard QA",
);

check(
  "advertiser campaign dashboard avoids placeholder campaign values",
  !advertiserDashboard.includes("/미정") &&
    !advertiserDashboard.includes("명 신청") &&
    advertiserDashboard.includes("신청/모집 인원") &&
    advertiserDashboard.includes("계약 조건 확인") &&
    advertiserDashboard.includes("extractCampaignSummaryField"),
  "Advertiser campaign rows must not show '-' or '/미정', and progress must use compact 신청/모집 ratios instead of repeating 신청 copy",
);

check(
  "campaign dashboard interaction parity covers sorting and applied filters",
  agents.includes("Paired advertiser/influencer dashboard surfaces must keep interaction parity") &&
    advertiserDashboard.includes("compareCampaignGroupsBySort") &&
    advertiserDashboard.includes('sortKey="participants"') &&
    advertiserDashboard.includes("handleCampaignSortChange") &&
    campaignPages.includes("function CampaignSortSelect") &&
    campaignPages.includes("compareMarketplaceCampaignPostsBySort") &&
    campaignPages.includes("compareAppliedCampaignApplicationsBySort") &&
    campaignPages.includes("function AppliedCampaignFilters") &&
    campaignPages.includes("appliedStatusFilter") &&
    campaignPages.includes("CampaignColumnHeader"),
  "Campaign surfaces on advertiser and influencer sides must both provide role-appropriate sorting/filtering instead of leaving influencer applications as a passive list",
);

check(
  "supporters campaign type creates product-mission contract guardrails",
  marketplace.includes('| "supporters"') &&
    marketplace.includes('supporters: "서포터즈"') &&
    campaignPages.includes("campaignProposalTypeOptions") &&
    campaignPages.includes("제품 제공(소비자가 89,000원 상당)") &&
    server.includes('snapshot.type === "supporters"') &&
    server.includes("campaign_supporters_resale_ban") &&
    server.includes("재판매 또는 그 시도가 확인되면 서포터즈 활동 자격은 자동 박탈") &&
    server.includes("campaign_supporters_posting_mission") &&
    server.includes("미션 불이행") &&
    supportersCampaignMigration.includes("'supporters'") &&
    seedTestAccounts.includes('type: "supporters"') &&
    seedQaMarketplaceScenario.includes('type: "supporters"') &&
    agents.includes("서포터즈 캠페인은 제품 제공을 전제로"),
  "Supporters must be a real persisted campaign type with UI entry, DB allowance, realistic seed data, and contract clauses for resale, posting maintenance, and mission non-performance",
);

check(
  "test advertiser campaign dashboard seed covers varied lifecycle cases",
  seedTestAccounts.includes("campaignDashboardApplicationFixtures") &&
    seedTestAccounts.includes("브레드룸 선케어 릴스 모집") &&
    seedTestAccounts.includes("status: \"ended\"") &&
    seedTestAccounts.includes("contractsByCampaignName") &&
    seedTestAccounts.includes("seeded_campaign_applications") &&
    seedTestAccounts.includes("applicantCount: 9") &&
    seedTestAccounts.includes('applicantLimit: "10명"') &&
    server.includes("maxItems = 20") &&
    server.includes("normalizeBrandCampaigns(activeCampaigns, 20)") &&
    !seedTestAccounts.includes('applicantLimit: "1명"') &&
    !seedQaMarketplaceScenario.includes('applicantLimit: "1명"'),
  "test advertiser campaign dashboard data must show 모집중/진행중/종료 with varied n/10 application counts, not one-person placeholder rows",
);

check(
  "test influencer surfaces use generated avatar photos",
  agents.includes("use plausible generated avatar photos for seeded creators") &&
    agents.includes("plausible real creator profile photos") &&
    marketplaceAvatars.includes("/images/influencers/creator-sora.png") &&
    marketplaceAvatars.includes("/images/influencers/minseo-home.png") &&
    marketplacePages.includes("getMarketplaceInfluencerAvatarUrl(profile)") &&
    marketplacePages.includes("src={src}") &&
    campaignPages.includes("getMarketplaceInfluencerAvatarUrlFromHref(") &&
    advertiserDashboard.includes("getMarketplaceInfluencerAvatarUrlFromHref("),
  "Seeded influencer discovery, public profiles, and applicant rows must use generated profile photos instead of initials-only placeholders",
);

const shippedInfluencerAvatarFiles = [
  "public/images/influencers/channel-ove.png",
  "public/images/influencers/creator-sora.png",
  "public/images/influencers/haru-fit.png",
  "public/images/influencers/luna-day.png",
  "public/images/influencers/minseo-home.png",
  "public/images/influencers/rooday.png",
  "public/images/influencers/today-taste.png",
  "public/images/influencers/zeu-k.png",
  "public/images/influencers/ziyu-log.png",
];

check(
  "shipped influencer avatars stay performance-sized",
  agents.includes("Avatar/profile thumbnails should not ship as multi-hundred-kilobyte originals") &&
    filesUnderBytes(shippedInfluencerAvatarFiles, 120_000),
  "Generated influencer avatar assets should stay under 120KB each so applicant and discovery screens do not load several megabytes of thumbnails",
);

check(
  "campaign applicant fixtures are real creator profiles",
  seedTestAccounts.includes("campaignDashboardApplicantProfiles") &&
    seedTestAccounts.includes('handle: "creator-sora"') &&
    seedTestAccounts.includes('email: "creator.sora@yeollock.me"') &&
    seedTestAccounts.includes("const applicantNames = [...new Set") &&
    seedTestAccounts.includes('avatarUrl: "/images/influencers/minseo-home.png"') &&
    seedTestAccounts.includes("ensureCampaignDashboardApplicantProfiles") &&
    seedTestAccounts.includes("applicantProfileByName") &&
    seedTestAccounts.includes("Missing campaign applicant profile") &&
    seedTestAccounts.includes("sender_profile_id: applicantProfile.ownerProfileId"),
  "Campaign applicant fixtures must attach to seeded influencer profiles with avatar URLs, not anonymous name-only rows that render as initials",
);

check(
  "creator and advertiser images are persisted product data",
  agents.includes("Creator and advertiser identity images are real product data") &&
    server.includes("MARKETPLACE_PUBLIC_STORAGE_BUCKET") &&
    server.includes('"/api/influencer/public-profile/avatar"') &&
    server.includes('"/api/advertiser/brand-image"') &&
    server.includes("avatar_url: savedProfile.avatarUrl ?? null") &&
    server.includes("logo_url: currentBrand.logoUrl ?? null") &&
    influencerDashboard.includes("onAvatarSelect") &&
    influencerDashboard.includes("dashboard.user.avatar_url") &&
    campaignPages.includes("BrandImageUpload") &&
    campaignPages.includes("/api/advertiser/brand-image") &&
    marketplacePages.includes("src={brand.logoUrl}") &&
    marketplace.includes("avatarUrl?: string") &&
    marketplace.includes("logoUrl?: string") &&
    read("supabase/migrations/20260531135050_add_marketplace_influencer_avatar_url.sql").includes("logo_url"),
  "Influencer avatars and advertiser brand images must upload, persist, and render from stored profile data before falling back to initials",
);

const distinctBrandLogoFiles = [
  "breadroom-logo.png",
  "obre-beauty-logo.png",
  "housefit-logo.png",
  "brewinglab-logo.png",
  "nightcare-logo.png",
  "monotrip-logo.png",
  "object-studio-logo.png",
];

check(
  "seeded brand images are distinctive real-brand marks",
  agents.includes("Seeded brand images should feel like distinct real brands") &&
    distinctBrandLogoFiles.every((file) => exists(`public/images/brands/${file}`)) &&
    marketplace.includes('logoUrl: "/images/brands/breadroom-logo.png"') &&
    marketplace.includes('logoUrl: "/images/brands/monotrip-logo.png"') &&
    marketplace.includes('logoUrl: "/images/brands/object-studio-logo.png"') &&
    seedTestAccounts.includes('logo_url: "/images/brands/breadroom-logo.png"') &&
    seedQaMarketplaceScenario.includes('logoUrl: "/images/brands/obre-beauty-logo.png"') &&
    seedQaMarketplaceScenario.includes('logo_url: advertiser.logoUrl'),
  "Seeded brand profiles must use category-specific logo images in fallback data and seed data, not initials-only generic marks",
);

check(
  "intro preview remains contract-centered",
  landing.includes("계약 목록") &&
    landing.includes("계약명") &&
    !landing.includes("캠페인 목록"),
  "intro previews must mirror the contract dashboard labels",
);

check(
  "advertiser sales PDF keeps dashboard explanation quiet",
    salesAdvertiserIntroduction.includes("yeollock-contract-builder-first-screen.png") &&
    salesAdvertiserIntroduction.includes("yeollock-advertiser-dashboard.png") &&
    salesAdvertiserIntroduction.includes("yeollock-campaign-applicants-dashboard.png") &&
    salesAdvertiserIntroduction.includes("yeollock-contract-handshake.png") &&
    !salesAdvertiserIntroduction.includes("-tight.png") &&
    !salesAdvertiserIntroduction.includes('class="red-box"') &&
    !salesAdvertiserIntroduction.includes('class="notes"') &&
    !salesAdvertiserIntroduction.includes('class="pain-grid"') &&
    !salesAdvertiserIntroduction.includes('class="process-line"') &&
    !salesAdvertiserIntroduction.includes('class="eyebrow"') &&
    !salesAdvertiserIntroduction.includes("window-bar") &&
    salesAdvertiserIntroduction.includes('class="product-shot product-shot-form"'),
  "Sales PDF should explain with dashboard screenshots and concise copy, not floating red boxes, bottom button-like lists, or repeated feature card grids",
);

const advertiserSalesUnifiedGridCount =
  salesAdvertiserIntroduction.match(/class="slide-content"/g)?.length ?? 0;

const advertiserSalesPainPointSection = salesAdvertiserIntroduction.slice(
  salesAdvertiserIntroduction.indexOf('data-stage="pain-point"'),
  salesAdvertiserIntroduction.indexOf('data-stage="strength"'),
);

check(
  "advertiser sales PDF uses one consistent layout grid",
  advertiserSalesUnifiedGridCount === 5 &&
    agents.includes("Advertiser sales proposals must use one consistent slide grid"),
  "Advertiser sales PDF pages must not mix unrelated layout systems; use the same left-message/right-product rhythm across the deck",
);

check(
  "advertiser sales PDF pain point uses no-contract risk examples before dashboard",
  advertiserSalesPainPointSection.includes("광고비 먹튀") &&
    advertiserSalesPainPointSection.includes("협찬품 미반환") &&
    advertiserSalesPainPointSection.includes("각종 분쟁") &&
    advertiserSalesPainPointSection.includes("콘텐츠 수정 거부") &&
    advertiserSalesPainPointSection.indexOf("콘텐츠 수정 거부") <
      advertiserSalesPainPointSection.indexOf("각종 분쟁") &&
    advertiserSalesPainPointSection.includes("인플루언서<br />광고</p>") &&
    !advertiserSalesPainPointSection.includes("인플루언서<br />광고 계약") &&
    !["사례 1", "사례 2", "사례 3", "사례 4"].some((text) =>
      advertiserSalesPainPointSection.includes(text),
    ) &&
    advertiserSalesPainPointSection.includes('class="headline-emphasis">계약서') &&
    advertiserSalesPainPointSection.includes('class="headline-emphasis">약속') &&
    advertiserSalesPainPointSection.includes('class="headline-emphasis headline-danger"') &&
    advertiserSalesPainPointSection.includes(">위험</strong") &&
    !advertiserSalesPainPointSection.includes("광고비 · 협찬") &&
    salesAdvertiserIntroduction.includes(".pain-context") &&
    salesAdvertiserIntroduction.includes("background: linear-gradient(135deg, #0f172a 0%, #2456d6 82%);") &&
    salesAdvertiserIntroduction.includes("filter: drop-shadow(0 12px 22px rgba(36, 86, 214, 0.14));") &&
    salesAdvertiserIntroduction.includes("font-size: 48px;") &&
    salesAdvertiserIntroduction.includes(".pain-context::after") &&
    advertiserSalesPainPointSection.includes("risk-generated-missed-contact.png") &&
    advertiserSalesPainPointSection.includes("risk-generated-product-held.png") &&
    advertiserSalesPainPointSection.includes("risk-generated-general-dispute.png") &&
    advertiserSalesPainPointSection.includes("risk-generated-revision-refusal.png") &&
    !advertiserSalesPainPointSection.includes("업로드 · 마감 · 지급 조건") &&
    !advertiserSalesPainPointSection.includes('class="support"') &&
    !advertiserSalesPainPointSection.includes("risk-visual") &&
    !advertiserSalesPainPointSection.includes("yeollock-advertiser-dashboard.png") &&
    agents.includes("pain-point slide should not lead with the dashboard"),
  "Advertiser proposal pain point must show contract-missing risks first with custom situation image cards and no support subline; do not lead with a dashboard screenshot",
);

check(
  "advertiser sales PDF left message block aligns to right visual center",
  salesAdvertiserIntroduction.includes("align-content: center;") &&
    salesAdvertiserIntroduction.includes("height: var(--sales-copy-visual-height);") &&
    salesAdvertiserIntroduction.includes("margin-top: var(--sales-content-start);") &&
    salesAdvertiserIntroduction.includes("padding: 0 0 0 8mm;") &&
    agents.includes("left message block should feel intentionally aligned with the right visual"),
  "Advertiser sales proposal copy should keep its left inset while centering vertically against the approved right visual height",
);

const advertiserSalesContentStartCount =
  salesAdvertiserIntroduction.match(/var\(--sales-content-start\)/g)?.length ?? 0;

check(
  "advertiser sales PDF keeps right visuals fixed while centering left copy",
  salesAdvertiserIntroduction.includes("--sales-content-start: 10mm;") &&
    salesAdvertiserIntroduction.includes("--sales-copy-visual-height: 128mm;") &&
    salesAdvertiserIntroduction.includes("--sales-copy-visual-height: 136mm;") &&
    salesAdvertiserIntroduction.includes("--sales-copy-visual-height: 119.6mm;") &&
    salesAdvertiserIntroduction.includes("--sales-copy-visual-height: 141mm;") &&
    salesAdvertiserIntroduction.includes("--sales-copy-visual-height: 117.8mm;") &&
    advertiserSalesContentStartCount >= 4 &&
    salesAdvertiserIntroduction.includes("height: var(--sales-copy-visual-height);") &&
    salesAdvertiserIntroduction.includes("padding: 0 0 0 8mm;") &&
    salesAdvertiserIntroduction.includes("margin-top: var(--sales-content-start);") &&
    salesAdvertiserIntroduction.includes('height: 128mm;') &&
    agents.includes("right dashboard/image area at the approved fixed top height") &&
    agents.includes("right image/dashboard height is approved") &&
    agents.includes("move the left text until its center sits on the right visual's vertical middle line") &&
    agents.includes("align the left text block to the vertical center of that right visual"),
  "Advertiser sales PDF must keep the right visual/dashboard start fixed while centering the left text block to the right visual",
);

check(
  "advertiser sales PDF uses selective emphasis instead of all-bold copy",
  salesAdvertiserIntroduction.includes("h1 {\n        font-size: 48px;\n        font-weight: 700;") &&
    salesAdvertiserIntroduction.includes(".pain-context {\n        display: inline-block;") &&
    salesAdvertiserIntroduction.includes("font-weight: 900;") &&
    salesAdvertiserIntroduction.includes(".support {\n        color: var(--muted);\n        font-size: 18px;\n        font-weight: 400;") &&
    salesAdvertiserIntroduction.includes(".headline-emphasis") &&
    salesAdvertiserIntroduction.includes(".headline-danger") &&
    agents.includes("Advertiser sales PDF text must not read as all-bold"),
  "Sales PDF copy must keep headline weight strong while using regular-weight body text and selective bold/color emphasis",
);

check(
  "advertiser sales PDF uses premium product-screen treatment without chrome",
  salesAdvertiserIntroduction.includes("--shadow-screen") &&
    salesAdvertiserIntroduction.includes("product-shot-dashboard") &&
    salesAdvertiserIntroduction.includes("product-shot-campaign") &&
    salesAdvertiserIntroduction.includes("product-shot-final") &&
    exists("docs/sales/assets/yeollock-contract-builder-first-screen.png") &&
    exists("docs/sales/assets/yeollock-advertiser-dashboard.png") &&
    exists("docs/sales/assets/yeollock-campaign-applicants-dashboard.png") &&
    exists("docs/sales/assets/yeollock-contract-content-review.png") &&
    exists("docs/sales/assets/yeollock-contract-handshake.png") &&
    !exists("docs/sales/assets/yeollock-advertiser-dashboard-tight.png") &&
    !exists("docs/sales/assets/yeollock-advertiser-campaign-dashboard-tight.png") &&
    !exists("docs/sales/assets/yeollock-contract-completed-tight.png") &&
    agents.includes("delete stale dashboard capture files first") &&
    agents.includes("content confirmation and revision-request workflow") &&
    captureSalesAssets.includes("yeollock-contract-builder-first-screen.png") &&
    captureSalesAssets.includes("yeollock-campaign-applicants-dashboard.png") &&
    captureSalesAssets.includes("yeollock-contract-content-review.png") &&
    captureSalesAssets.includes("clickVisibleButtonByText(client, dashboardPage, \"필터\")"),
  "Sales PDF screenshots should use newly captured real product surfaces and no stale tight/dashboard captures",
);

check(
  "campaign applicant rows avoid repeated filler copy",
  !advertiserDashboard.includes("캠페인 지원 데이터입니다") &&
    !seedTestAccounts.includes("캠페인 지원 데이터입니다") &&
    !advertiserDashboard.includes("isGenericCampaignApplicantIntro") &&
    !advertiserDashboard.includes("const rawIntro") &&
    !campaignPages.includes("const intro =") &&
    advertiserDashboard.includes("<ApplicantCategoryPill category={mainCategory} />") &&
    campaignPages.includes("category={mainCategory}") &&
    agents.includes("Campaign applicant dashboards must not show repeated filler sentences"),
  "Campaign applicant dashboard rows must remove generic repeated support text such as 캠페인 지원 데이터입니다",
);

const salesAdvertiserPdfPageCount =
  salesAdvertiserPdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
const salesAdvertiserPageNumberCount =
  salesAdvertiserIntroduction.match(/class="page-no"/g)?.length ?? 0;

check(
  "advertiser sales PDF exports without blank pages",
  salesAdvertiserPdfPageCount === 5 &&
    salesAdvertiserIntroduction.includes("@media print") &&
    salesAdvertiserIntroduction.includes("body {\n          padding: 0;") &&
    salesAdvertiserIntroduction.includes(".deck {\n          display: block;"),
  "Sales PDF must render as the intended five pages without print padding/grid gaps that create blank pages",
);

check(
  "advertiser sales PDF has unified logo and page numbers",
  salesAdvertiserPageNumberCount === 5 &&
    ["01", "02", "03", "04", "05"].every((pageNo) =>
      salesAdvertiserIntroduction.includes(`<span class="page-no">${pageNo}</span>`),
    ) &&
    salesAdvertiserIntroduction.includes("width: 54px;") &&
    salesAdvertiserIntroduction.includes("height: 54px;") &&
    agents.includes("page numbering consistent on every page") &&
    agents.includes("requested logo scaling"),
  "Advertiser sales PDF must use the requested larger logo and the same page-number treatment on all five pages",
);

check(
  "advertiser sales PDF avoids mixed explanation chrome",
  !salesAdvertiserIntroduction.includes('class="image-notes single"') &&
    !salesAdvertiserIntroduction.includes('<aside class="side-panel">') &&
    !salesAdvertiserIntroduction.includes("pilot-sidebar") &&
    !salesAdvertiserIntroduction.includes("window-dot") &&
    !salesAdvertiserIntroduction.includes("product-window") &&
    agents.includes("Advertiser sales PDF screenshot pages should avoid tiny top labels"),
  "Sales PDF must not mix side panels, bottom explanations, and extra chrome around screenshots",
);

check(
  "advertiser sales PDF avoids false PDF callout",
  !salesAdvertiserIntroduction.includes("<strong>서명본 PDF 보관</strong>") &&
    !salesAdvertiserIntroduction.includes("완료된 계약서는 필요할 때 바로 내려받습니다."),
  "Do not label a red box as a PDF download area unless the rendered capture actually shows that PDF action",
);

const bannedAdvertiserSalesPhrases = [
  "한 헤더",
  "두 운영 화면",
  "같은 전환 구조",
  "같은 규칙",
  "같은 축",
  "계약과 캠페인이 헤더",
];

check(
  "advertiser sales PDF copy speaks to advertiser value",
  bannedAdvertiserSalesPhrases.every(
    (phrase) => !salesAdvertiserIntroduction.includes(phrase),
  ) &&
    salesAdvertiserIntroduction.includes("광고비") &&
    salesAdvertiserIntroduction.includes("협찬") &&
    salesAdvertiserIntroduction.includes('class="headline-emphasis">계약서') &&
    salesAdvertiserIntroduction.includes('class="headline-emphasis">약속') &&
    salesAdvertiserIntroduction.includes('class="headline-emphasis headline-danger"') &&
    !salesAdvertiserIntroduction.includes("먹튀를<br />막아야 합니다") &&
    salesAdvertiserIntroduction.includes("광고비 먹튀") &&
    salesAdvertiserIntroduction.includes("각종 분쟁") &&
    salesAdvertiserIntroduction.includes("PDF 계약서") &&
    salesAdvertiserIntroduction.includes("간단히 필요 항목만 입력하면") &&
    salesAdvertiserIntroduction.includes('<span class="nowrap"><strong>PDF 계약서</strong>가 바로 생성됩니다</span>') &&
    salesAdvertiserIntroduction.includes("계약 관리를") &&
    salesAdvertiserIntroduction.includes("효율적으로") &&
    salesAdvertiserIntroduction.includes("진행과정 관리") &&
    !salesAdvertiserIntroduction.includes("<strong>진행과정</strong>") &&
    salesAdvertiserIntroduction.includes("<strong>플랫폼별</strong> 관리") &&
    salesAdvertiserIntroduction.includes("<strong>콘텐츠 확인</strong>") &&
    salesAdvertiserIntroduction.includes("<strong>수정요청</strong>") &&
    salesAdvertiserIntroduction.includes("캠페인 모집도") &&
    salesAdvertiserIntroduction.includes("캠페인에 지원한") &&
    salesAdvertiserIntroduction.includes("<strong>인플루언서 쉽게 확인, 선정</strong>") &&
    salesAdvertiserIntroduction.includes("1대多 계약서 자동 생성") &&
    salesAdvertiserIntroduction.includes("서로에게") &&
    salesAdvertiserIntroduction.includes("안전한 광고") &&
    salesAdvertiserIntroduction.includes("문의 이메일") &&
    salesAdvertiserIntroduction.includes("yeollockme@gmail.com") &&
    !salesAdvertiserIntroduction.includes("광고주 제안서</span>"),
  "Advertiser PDF must explain buying value, not product implementation mechanics",
);

check(
  "advertiser sales PDF solution says contract writing directly",
  salesAdvertiserIntroduction.includes("간편한<br />") &&
    salesAdvertiserIntroduction.includes("계약서 작성") &&
    salesAdvertiserIntroduction.includes('<span class="nowrap"><strong>PDF 계약서</strong>가 바로 생성됩니다</span>') &&
    !salesAdvertiserIntroduction.includes("약속을<br />남깁니다") &&
    agents.includes("Advertiser sales proposal solution copy must say the product action directly"),
  "Advertiser sales proposal solution copy must say contract writing and PDF output directly, not use a softened promise phrase",
);

check(
  "advertiser sales PDF reflects latest slide copy",
  salesAdvertiserIntroduction.includes("계약 관리를") &&
    salesAdvertiserIntroduction.includes("효율적으로") &&
    salesAdvertiserIntroduction.includes("진행과정 관리") &&
    !salesAdvertiserIntroduction.includes("<strong>진행과정</strong>") &&
    salesAdvertiserIntroduction.includes("<strong>플랫폼별</strong> 관리") &&
    salesAdvertiserIntroduction.includes("<strong>콘텐츠 확인</strong>") &&
    salesAdvertiserIntroduction.includes("<strong>수정요청</strong>") &&
    salesAdvertiserIntroduction.includes("캠페인 모집도") &&
    salesAdvertiserIntroduction.includes("편리하게!") &&
    salesAdvertiserIntroduction.includes("캠페인에 지원한") &&
    salesAdvertiserIntroduction.includes("<strong>인플루언서 쉽게 확인, 선정</strong>") &&
    salesAdvertiserIntroduction.includes("1대多 계약서 자동 생성") &&
    salesAdvertiserIntroduction.includes("서로에게") &&
    salesAdvertiserIntroduction.includes("안전한 광고") &&
    salesAdvertiserIntroduction.includes("연락미에서 시작하세요") &&
    salesAdvertiserIntroduction.includes("문의 이메일"),
  "Advertiser sales PDF must keep the owner-approved five-page headline sequence",
);

check(
  "advertiser sales PDF leads with contract-risk prevention",
  salesAdvertiserIntroduction.indexOf('class="headline-emphasis">계약서') >=
    0 &&
    salesAdvertiserIntroduction.indexOf('class="headline-emphasis">계약서') <
      salesAdvertiserIntroduction.indexOf("간편한") &&
    agents.includes(
      "primary differentiation is risk prevention around sponsorship, ad fees",
    ) &&
    agents.includes("Customer-facing advertiser proposal copy should express"),
  "Advertiser sales PDF must lead with sponsorship/ad-fee non-performance risk in polished buyer language before presenting dashboard consolidation",
);

const advertiserSalesStageOrder = [
  '<section class="page" data-stage="pain-point">',
  '<section class="page" data-stage="strength">',
  '<section class="page" data-stage="service-explanation">',
  '<section class="page" data-stage="cta">',
].map((marker) => salesAdvertiserIntroduction.indexOf(marker));

check(
  "advertiser sales PDF persuades before explaining",
  advertiserSalesStageOrder.every((index) => index >= 0) &&
    advertiserSalesStageOrder[0] < advertiserSalesStageOrder[1] &&
    advertiserSalesStageOrder[1] < advertiserSalesStageOrder[2] &&
    advertiserSalesStageOrder[2] < advertiserSalesStageOrder[3],
  "Advertiser PDF must follow pain point -> yeollock strength -> service/dashboard explanation -> CTA",
);

const demoData = evaluateLiteralObject(landing, "const introDashboardDemoData =");
const expectedTabs = {
  advertiser: ["모집중", "진행중", "종료"],
  influencer: ["지원중", "진행중", "완료", "미선정"],
};
const introDatePatterns = {
  advertiser: /^20\d{2}\.\d{2}\.\d{2} \/ D(?:-\d+|\+\d+)$/,
  influencer: /^D(?:-\d+|\+\d+) \/ 20\d{2}\.\d{2}\.\d{2}$/,
};

check(
  "intro advertiser header mirrors real dashboard switch",
  landing.includes('aria-label="광고주 대시보드 전환 미리보기"') &&
    !landing.includes('? ["새 계약", "새 캠페인", "메시지함", "인플루언서 찾기", "로그아웃"]'),
  "Advertiser intro preview must show the real dashboard 계약/캠페인 header switch, not put 새 계약/새 캠페인 in the global header",
);

check(
  "intro advertiser primary action stays in title bar",
  landing.includes('actionLabel="새 계약"') &&
    landing.includes("function IntroDashboardTitleBar"),
  "Advertiser intro preview must mirror the real dashboard by keeping 새 계약 in the dashboard title bar",
);

check(
  "intro advertiser account strip mirrors real dashboard",
  landing.includes("function IntroAdvertiserAccountBanner") &&
    landing.includes("사업자번호") &&
    landing.includes("정보 보기") &&
    !landing.includes("function IntroAdvertiserVerificationBanner"),
  "Advertiser intro preview must use the real dashboard compact approved-account strip, not duplicate approved verification labels",
);

check(
  "intro influencer header mirrors real dashboard actions",
  landing.includes('label="내 계약"') &&
    landing.includes('label="캠페인 찾기"') &&
    landing.includes('label="메시지함"') &&
    landing.includes('label="로그아웃"'),
  "Influencer intro preview header must mirror the real dashboard action order",
);

for (const role of ["advertiser", "influencer"]) {
  const states = demoData[role]?.states ?? [];
  const expected = expectedTabs[role];

  check(
    `intro ${role} has expected dashboard tabs`,
    states.length === expected.length &&
      states.every((state) => expected.every((label) => state.tabs.some((tab) => tab.label === label))),
    `${role} intro preview tabs must stay in sync with the real dashboard tabs`,
  );

  for (const state of states) {
    const activeCount = state.tabs.find((tab) => tab.label === state.activeTab)?.count;
    check(
      `intro ${role} ${state.activeTab} count matches visible rows`,
      state.itemCount === state.rows.length && activeCount === state.rows.length,
      `${role} ${state.activeTab}: itemCount=${state.itemCount}, activeTabCount=${activeCount}, rows=${state.rows.length}`,
    );

    check(
      `intro ${role} ${state.activeTab} dates include year and D-day`,
      state.rows.every((row) => introDatePatterns[role].test(row.date)),
      `${role} ${state.activeTab}: every visible row date must match the role-specific D-day/date order`,
    );

    check(
      `intro ${role} ${state.activeTab} row titles stay contract-centered`,
      state.rows.every((row) => !row.title.includes("캠페인")),
      `${role} ${state.activeTab}: row titles must read as contract titles, not campaign titles`,
    );
  }
}

check(
  "intro influencer table order mirrors real dashboard",
  (demoData.influencer?.states ?? []).every((state) => state.metricBeforeDate === true) &&
    landing.includes("state.metricBeforeDate"),
  "Influencer intro preview table must keep 현 단계/내 할 일 before 마감일 like the real influencer dashboard",
);

check(
  "intro advertiser table order mirrors real dashboard",
  (demoData.advertiser?.states ?? []).every((state) => state.metricBeforeDate !== true),
  "Advertiser intro preview table must keep 마감일/종료일 before 현 단계 like the real advertiser dashboard",
);

console.log("\nSummary");
console.log(`- passed: ${passes.length}`);
console.log(`- failed: ${failures.length}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
