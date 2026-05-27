import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
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
const marketplace = read("src/domain/marketplace.ts");
const server = read("server/index.ts");
const signupPage = read("src/pages/auth/SignupPage.tsx");
const contractAdminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
const contractViewer = read("src/pages/influencer/ContractViewer.tsx");
const legalConsent = read("src/domain/legalConsent.ts");
const analytics = read("src/domain/analytics.ts");
const legalDocumentPage = read("src/pages/legal/LegalDocumentPage.tsx");
const mobileSurfaceSwitch = read("src/components/MobileSurfaceSwitch.tsx");
const authLoginScreen = read("src/components/AuthLoginScreen.tsx");
const advertiserVerification = read("src/pages/marketing/AdvertiserVerification.tsx");
const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");
const display = read("src/domain/display.ts");
const seo = read("src/domain/seo.ts");
const agents = read("AGENTS.md");
const packageJson = JSON.parse(read("package.json"));
const vercelConfig = read("vercel.json");
const prerenderSeoHtml = read("scripts/prerender-seo-html.ts");
const robotsTxt = read("public/robots.txt");
const envExample = read(".env.example");
const qaStandard = read("scripts/qa-standard.mjs");
const seedTestAccounts = read("scripts/seed-test-accounts.mjs");
const seedQaMarketplaceScenario = read("scripts/seed-qa-marketplace-scenario.mjs");
const supportersCampaignMigration = read(
  "supabase/migrations/20260526093000_allow_supporters_campaign_type.sql",
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

assertNoRegex(
  "contract dashboard/intro date order is YYYY.MM.DD / D-day",
  dashboardAndIntroFiles,
  /D[-+]\d+\s*\/\s*20\d{2}\.\d{2}\.\d{2}/,
  "contract and intro previews keep date-first D-day notation; campaign dashboard has a separate D-day-first guardrail",
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
  "influencer dashboard date formatter returns date before D-day",
  influencerDashboard.includes("return `${dateLabel} / ${dday}`;"),
  "formatInfluencerDateWithDday must render YYYY.MM.DD / D±N",
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
  "influencer verification state is shown in one place",
  (influencerDashboard.match(/verification\.label/g) ?? []).length === 1,
  "influencer dashboard must not repeat the same verification state in the page header and profile banner",
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
  "first role selection uses action buttons",
  landing.includes("data-start-role-action") &&
    !landing.includes("min-h-[248px]") &&
    app.includes("data-signup-role-action") &&
    !app.includes("광고 계약을 만들 광고주인지, 받은 계약을 검토할 인플루언서인지 선택해 주세요."),
  "First role-selection screens must use clear action buttons and avoid oversized explanatory role cards",
);

check(
  "public SEO routes use route-specific initial HTML",
  seo.includes("staticSeoRoutePaths") &&
    seo.includes("VITE_PUBLIC_SITE_URL") &&
    app.includes("VITE_PUBLIC_SITE_URL") &&
    packageJson.scripts?.build?.includes("scripts/prerender-seo-html.ts") &&
    prerenderSeoHtml.includes("replaceCanonicalLink") &&
    prerenderSeoHtml.includes("replaceStructuredData") &&
    prerenderSeoHtml.includes("naver-site-verification") &&
    envExample.includes("VITE_NAVER_SITE_VERIFICATION") &&
    robotsTxt.includes("User-agent: Yeti") &&
    robotsTxt.includes("Sitemap: https://yeollock.me/sitemap.xml") &&
    vercelConfig.includes("/intro/advertiser/index.html") &&
    vercelConfig.includes("/legal/e-sign-consent/index.html") &&
    server.includes("resolvePreviewHtmlPath"),
  "Google/Naver public routes must not depend only on client-side head mutation, and Naver Yeti/verification support must stay wired",
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
    mobileSurfaceSwitch.includes("내 계약") &&
    mobileSurfaceSwitch.includes("캠페인") &&
    mobileSurfaceSwitch.includes("/advertiser/dashboard") &&
    mobileSurfaceSwitch.includes("/advertiser/campaigns") &&
    mobileSurfaceSwitch.includes("/influencer/dashboard") &&
    mobileSurfaceSwitch.includes("/influencer/campaigns") &&
    advertiserDashboard.includes("<AdvertiserDashboardSurfaceSwitch active={surface} />") &&
    advertiserDashboard.includes("function AdvertiserDashboardSurfaceSwitch") &&
    advertiserDashboard.includes('to="/advertiser/dashboard"') &&
    advertiserDashboard.includes('to="/advertiser/campaigns"') &&
    !advertiserDashboard.includes('<MobileSurfaceSwitch role="advertiser"') &&
    (influencerDashboard.match(/<MobileSurfaceSwitch role="influencer" active="contracts" \/>/g) ??
      []).length >= 2 &&
    campaignPages.includes('<MobileSurfaceSwitch role={role} active="campaigns" />'),
  "mobile users must see the contract/campaign surface split without duplicating the same switch in both the header and body",
);

check(
  "advertiser campaign tab opens dashboard before creation",
  app.includes('path="/advertiser/campaigns"') &&
    app.includes('<Dashboard surface="campaigns" />') &&
    app.includes('path="/advertiser/campaigns/new"') &&
    advertiserDashboard.includes('to="/advertiser/campaigns/new"') &&
    campaignPages.includes('backHref="/advertiser/campaigns"') &&
    campaignPages.includes('backLabel="캠페인 대시보드"') &&
    qaStandard.includes('"/advertiser/campaigns/new"'),
  "The advertiser campaign surface must open a dashboard first, with campaign creation as a secondary page",
);

check(
  "mobile influencer campaign lists are scrollable",
  campaignPages.includes('data-campaign-scroll-region="open"') &&
    campaignPages.includes('grid min-h-0 flex-1 auto-rows-max') &&
    campaignPages.includes("overflow-y-auto overscroll-contain") &&
    qaStandard.includes("Browser mobile influencer campaigns scroll"),
  "The influencer campaign discovery list must remain reachable on mobile, with rendered scroll behavior covered by standard QA",
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
  "intro preview remains contract-centered",
  landing.includes("계약 목록") &&
    landing.includes("계약명") &&
    !landing.includes("캠페인 목록"),
  "intro previews must mirror the contract dashboard labels",
);

const demoData = evaluateLiteralObject(landing, "const introDashboardDemoData =");
const expectedTabs = {
  advertiser: ["모집중", "진행중", "종료"],
  influencer: ["지원중", "진행중", "완료", "미선정"],
};
const datePattern = /^20\d{2}\.\d{2}\.\d{2} \/ D(?:-\d+|\+\d+)$/;

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
      state.rows.every((row) => datePattern.test(row.date)),
      `${role} ${state.activeTab}: every visible row date must match YYYY.MM.DD / D±N`,
    );

    check(
      `intro ${role} ${state.activeTab} row titles stay contract-centered`,
      state.rows.every((row) => !row.title.includes("캠페인")),
      `${role} ${state.activeTab}: row titles must read as contract titles, not campaign titles`,
    );
  }
}

console.log("\nSummary");
console.log(`- passed: ${passes.length}`);
console.log(`- failed: ${failures.length}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
