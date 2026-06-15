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
const xlsxExport = read("src/domain/xlsxExport.ts");
const legalDocumentPage = read("src/pages/legal/LegalDocumentPage.tsx");
const legalEntity = read("src/domain/legalEntity.ts");
const supportPage = read("src/pages/support/SupportPage.tsx");
const dashboardSurfaceSwitch = read("src/components/DashboardSurfaceSwitch.tsx");
const dashboardDownloadButton = read("src/components/DashboardDownloadButton.tsx");
const mobileSurfaceSwitch = read("src/components/MobileSurfaceSwitch.tsx");
const authLoginScreen = read("src/components/AuthLoginScreen.tsx");
const loginLanding = read("src/pages/auth/LoginLanding.tsx");
const passwordResetPage = read("src/pages/auth/PasswordResetPage.tsx");
const contractBuilder = read("src/pages/marketing/ContractBuilder.tsx");
const brandLogo = read("src/components/BrandLogo.tsx");
const platformBrandMark = read("src/components/PlatformBrandMark.tsx");
const platformDisplay = read("src/domain/platformDisplay.ts");
const indexCss = read("src/index.css");
const advertiserAuthGate = read("src/pages/marketing/AdvertiserAuthGate.tsx");
const advertiserVerification = read("src/pages/marketing/AdvertiserVerification.tsx");
const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");
const display = read("src/domain/display.ts");
const seo = read("src/domain/seo.ts");
const marketplaceMessageSummaryHook = read("src/hooks/useMarketplaceMessageSummary.ts");
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
const salesInfluencerIntroduction = read("docs/sales/influencer-introduction.html");
const practitionerIntroduction = read("docs/sales/advertiser-practitioner-introduction.html");
const practitionerGuide = read("docs/sales/advertiser-practitioner-guide.html");
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
const cacheQueryOptimizationMigration = read(
  "supabase/migrations/20260604012714_optimize_cache_query_paths.sql",
);
const advertiserDashboardExportStart = advertiserDashboard.indexOf(
  "function buildAdvertiserContractExportSheet",
);
const advertiserDashboardExportEnd = advertiserDashboard.indexOf(
  "function parseDate",
  advertiserDashboardExportStart,
);
const advertiserDashboardExportSource = advertiserDashboard.slice(
  advertiserDashboardExportStart,
  advertiserDashboardExportEnd,
);
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
const advertiserContractFilterStart = advertiserDashboard.indexOf(
  'id="advertiser-contract-filters"',
);
const advertiserContractFilterEnd = advertiserDashboard.indexOf(
  "<ContractTableHeaderRow",
  advertiserContractFilterStart,
);
const advertiserContractFilterPanel =
  advertiserContractFilterStart >= 0 && advertiserContractFilterEnd >= 0
    ? advertiserDashboard.slice(advertiserContractFilterStart, advertiserContractFilterEnd)
    : "";
const advertiserContractTableGrid =
  "lg:grid-cols-[minmax(132px,0.34fr)_minmax(108px,0.26fr)_minmax(300px,1fr)_minmax(132px,0.34fr)_minmax(146px,0.38fr)_minmax(112px,0.3fr)]";
const advertiserContractFilterOrder = [
  'label="플랫폼"',
  'label="종류"',
  "<ContractNameSearch",
  'label="지급내용"',
  "<DashboardDateRangeFilter",
  'label="현 단계"',
].map((marker) => advertiserContractFilterPanel.indexOf(marker));
const hasAdvertiserContractFilterTableOrder =
  advertiserContractFilterOrder.every((index) => index >= 0) &&
  advertiserContractFilterOrder.every(
    (index, orderIndex) =>
      orderIndex === 0 || index > advertiserContractFilterOrder[orderIndex - 1],
  );
const influencerDashboardExportStart = influencerDashboard.indexOf(
  "function buildInfluencerDashboardExportSheet",
);
const influencerDashboardExportEnd = influencerDashboard.indexOf(
  "function parseDate",
  influencerDashboardExportStart,
);
const influencerDashboardExportSource = influencerDashboard.slice(
  influencerDashboardExportStart,
  influencerDashboardExportEnd,
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

const dashboardMobileDividerBodyPattern =
  /max-h-\[620px\][^"]*divide-y[^"]*lg:divide-y-0/g;
const dashboardMaxHeightClassPattern = /className="([^"]*max-h-\[620px\][^"]*)"/g;
const hasOnlyMobileDashboardDividers = (source) =>
  Array.from(source.matchAll(dashboardMaxHeightClassPattern)).every(([, className]) =>
    !className.includes("divide-y") || className.includes("lg:divide-y-0"),
  );

check(
  "dashboard row dividers are mobile only",
  agents.includes("Desktop dashboard data rows should avoid visible row-by-row divider lines") &&
    agents.includes("mobile dashboard rows should keep clear row separators") &&
    (advertiserDashboard.match(dashboardMobileDividerBodyPattern)?.length ?? 0) >= 3 &&
    (influencerDashboard.match(dashboardMobileDividerBodyPattern)?.length ?? 0) >= 1 &&
    advertiserDashboard.includes("divide-y divide-[#edf1ed] border-t border-[#edf1ed] lg:divide-y-0") &&
    hasOnlyMobileDashboardDividers(advertiserDashboard) &&
    hasOnlyMobileDashboardDividers(influencerDashboard) &&
    !advertiserDashboard.includes("hover:bg-[#fafaf7]") &&
    !advertiserDashboard.includes("hover:bg-[#f8faf7]") &&
    !influencerDashboard.includes("hover:bg-[#fafaf7]") &&
    !influencerDashboard.includes("hover:bg-[#f8faf7]") &&
    (advertiserDashboard.match(/hover:bg-blue-50\/45/g)?.length ?? 0) >= 2 &&
    influencerDashboard.includes("hover:bg-blue-50/45"),
  "Dashboard row bodies must keep mobile separators, suppress desktop separators, and avoid gray hover shading",
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
  ["캠페인 목록", "Contract-centered dashboard and intro surfaces must say 1:1 계약 목록"],
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
  "광고주 · 1:1 계약",
  "The mobile surface switch owns the contract/campaign distinction; the app header should not repeat or truncate it",
);

assertNoText(
  "mobile influencer header avoids duplicate surface label",
  ["src/pages/influencer/InfluencerDashboard.tsx"],
  "인플루언서 · 1:1 계약",
  "The mobile surface switch owns the contract/campaign distinction; the app header should not repeat or truncate it",
);

const sharedBrandLogoConsumers = [
  app,
  landing,
  authLoginScreen,
  loginLanding,
  signupPage,
  passwordResetPage,
  adminDashboard,
  advertiserDashboard,
  influencerDashboard,
  campaignPages,
  marketplacePages,
  marketplaceInboxPage,
  contractBuilder,
  contractAdminViewer,
  advertiserVerification,
  influencerVerification,
  legalDocumentPage,
  supportPage,
];

check(
  "product headers use the shared Yeollock logo mark",
  brandLogo.includes('viewBox="0 0 32 32"') &&
    brandLogo.includes("LogoMark") &&
    brandLogo.includes("BrandLogo") &&
    sharedBrandLogoConsumers.every(
      (source) => source.includes("LogoMark") || source.includes("BrandLogo"),
    ) &&
    !sharedBrandLogoConsumers.some((source) =>
      /yl-brand-action[\s\S]{0,520}<ShieldCheck/.test(source),
    ) &&
    agents.includes("product-wide logo source of truth"),
  "Header/login/admin/marketplace/legal/support brand slots must use the same main-page logo, not shield-check or feature icons",
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
    influencerDashboard.includes("PLATFORM_META[platform.platform].icon") &&
    influencerDashboard.includes("formatInfluencerVerifiedHandle(platform)") &&
    !influencerDashboard.includes("formatInfluencerPlatformShortLabel(platform.platform)\n                </span>") &&
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
  "email verification skip is QA-process only",
  agents.includes("skip email verification during a QA/deployment process") &&
    signupPage.includes("confirmation_required") &&
    server.includes("confirmation_required: true") &&
    !signupPage.includes("skipEmailVerification") &&
    !server.includes("skipEmailVerification"),
  "Skipping email verification during QA must not turn into a permanent product-code bypass for signup confirmation",
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

const influencerShareSummaryRowsStart = contractViewer.indexOf(
  "const contractSummaryRows",
);
const influencerShareSummaryRowsEnd = contractViewer.indexOf(
  "const campaignPeriod",
  influencerShareSummaryRowsStart,
);
const influencerShareSummaryRows =
  influencerShareSummaryRowsStart >= 0 && influencerShareSummaryRowsEnd >= 0
    ? contractViewer.slice(
        influencerShareSummaryRowsStart,
        influencerShareSummaryRowsEnd,
      )
    : "";
const reviewPdfBuilderStart = server.indexOf("const buildContractReviewPdf");
const reviewPdfBuilderEnd = server.indexOf("const formatWonCompact", reviewPdfBuilderStart);
const reviewPdfBuilder =
  reviewPdfBuilderStart >= 0 && reviewPdfBuilderEnd >= 0
    ? server.slice(reviewPdfBuilderStart, reviewPdfBuilderEnd)
    : "";
const signedPdfBuilderStart = server.indexOf("const buildSignedContractPdf");
const signedPdfBuilderEnd = server.indexOf("const stableUuid", signedPdfBuilderStart);
const signedPdfBuilder =
  signedPdfBuilderStart >= 0 && signedPdfBuilderEnd >= 0
    ? server.slice(signedPdfBuilderStart, signedPdfBuilderEnd)
    : "";

check(
  "influencer contract share-link first screen stays contract-centered",
    agents.includes("Influencer contract share-link first screens must be contract-centered") &&
    agents.includes("polished document review surface") &&
    agents.includes("separate advertiser-check cards") &&
    agents.includes("산출물 summaries should surface advertiser-entered values") &&
    agents.includes('do not use "산출물" as a parent row') &&
    agents.includes('conditional "특약" row on the first summary') &&
    agents.includes('"특약사항" detail row') &&
    agents.includes('first show "계약서 확인하기"') &&
    agents.includes("first screens should show only the top contract summary") &&
    agents.includes('helper checklist labels such as "PDF 계약서 확인"') &&
    agents.includes("available vertical viewport deliberately") &&
    agents.includes("show the PDF contract file immediately") &&
    agents.includes("do not require local clause checks before signing") &&
    agents.includes("advertiser-authored contract document body") &&
    agents.includes("pre-sign review PDF and post-sign final PDF should share the same contract document generator") &&
    server.includes("const buildContractDocumentPdf") &&
    server.includes("특약 및 자동 생성 조항") &&
    reviewPdfBuilder.includes("buildContractDocumentPdf({ contract })") &&
    signedPdfBuilder.includes("buildContractDocumentPdf({") &&
    !server.includes('pdf.text("계약서 전체보기"') &&
    !server.includes("Signed Contract") &&
    !server.includes("확인 안내") &&
    contractViewer.includes('      : "계약 내용 확인";') &&
    contractViewer.includes("조건을 먼저 보고, 로그인 후 바로 서명합니다.") &&
    contractViewer.includes("contractSummaryRows") &&
    contractViewer.includes("DeliverableSummaryValue") &&
    contractViewer.includes("DeliverablePart") &&
    contractViewer.includes("parseDeliverableSummary") &&
    contractViewer.includes("getDeliverableFactValues") &&
    contractViewer.includes("deliverableSummaryFacts") &&
    contractViewer.includes("getAdvertiserSpecialTerms") &&
    contractViewer.includes("getSpecialTermCategoryLabel") &&
    contractViewer.includes("specialTermsSummary") &&
    influencerShareSummaryRows.includes('label: "플랫폼"') &&
    influencerShareSummaryRows.includes('label: "컨텐츠"') &&
    influencerShareSummaryRows.includes('label: "수량"') &&
    influencerShareSummaryRows.includes('label: "특약"') &&
    influencerShareSummaryRows.includes("deliverableSummaryFacts.platform") &&
    influencerShareSummaryRows.includes("deliverableSummaryFacts.content") &&
    influencerShareSummaryRows.includes("deliverableSummaryFacts.quantity") &&
    influencerShareSummaryRows.includes("specialTermsSummary") &&
    !influencerShareSummaryRows.includes('label: "산출물"') &&
    contractViewer.includes('label="플랫폼"') &&
    contractViewer.includes('label="컨텐츠"') &&
    contractViewer.includes('label="수량"') &&
    contractViewer.includes("hasViewedContractDocument") &&
    contractViewer.includes("shouldShowContractReviewCta") &&
    contractViewer.includes("shouldShowContractDocument") &&
    contractViewer.includes("shouldShowPdfReview") &&
    contractViewer.includes("function PdfContractPreview") &&
    contractViewer.includes('aria-label="계약서 PDF 1페이지 미리보기"') &&
    contractViewer.includes("pdfjsLib.getDocument") &&
    contractViewer.includes("<PdfContractPreview href={reviewPdfHref} />") &&
    contractViewer.includes("contractDetailRows") &&
    contractViewer.includes('label: "특약사항"') &&
    contractViewer.includes("reviewPdfHref") &&
    contractViewer.includes("/review-pdf") &&
    contractViewer.includes("PDF 계약서와 계정 인증이 확인되어 서명할 수 있습니다.") &&
    contractViewer.includes("PDF 계약서 확인이 완료되었습니다.") &&
    contractViewer.includes('? "계약서 확인하기"') &&
    contractViewer.includes('scrollIntoView({') &&
    contractViewer.includes(': "서명하기";') &&
    contractViewer.includes("summaryListClassName") &&
    contractViewer.includes("h-[calc(100dvh-57px)]") &&
    contractViewer.includes("grid h-full min-h-0") &&
    contractViewer.includes("BusinessVerificationBadge") &&
    contractViewer.includes('aria-label="사업자 인증 완료"') &&
    contractViewer.includes('role="tooltip"') &&
    contractViewer.includes("bg-blue-50 px-1.5") &&
    contractViewer.includes('buttonClassName="hidden h-9 w-9 rounded-lg sm:inline-flex"') &&
    contractViewer.includes("bg-blue-600 text-white") &&
    !contractViewer.includes("summaryChecklistClassName") &&
    !contractViewer.includes("확인 후 서명하기") &&
    !contractViewer.includes("checkedClauseIdsByContract") &&
    !contractViewer.includes("toggleClauseConfirmation") &&
    !contractViewer.includes('"확인 체크"') &&
    !contractViewer.includes("계약서 조항을 모두 체크하면 서명할 수 있습니다.") &&
    !contractViewer.includes("canSubmitClauseReview") &&
    !contractViewer.includes("조항별 검토") &&
    !contractViewer.includes("mt-4 grid grid-cols-2 gap-2") &&
    !contractViewer.includes("AdvertiserTrustNotice") &&
    !contractViewer.includes("광고주 확인 정보") &&
    !contractViewer.includes("위험점수") &&
    !contractViewer.includes('contract.campaign?.deliverables?.join(", ")') &&
    !contractViewer.includes("divide-y divide-neutral-200/80 px-4") &&
    !contractViewer.includes("false &&") &&
    !contractViewer.includes("!canSubmitClauseReview && (") &&
    !contractViewer.includes("보안 계약 검토") &&
    !contractViewer.includes("보안 링크 확인됨") &&
    !contractViewer.includes("보안 링크로 계약 내용은 먼저 확인할 수 있습니다") &&
    !contractViewer.includes("안전한 계약 의견") &&
    !contractViewer.includes("안전 저장소") &&
    !contractViewer.includes("function MetricCard"),
  "Influencer share-link landing must lead with contract title/core terms/next action, not security-review copy, visible risk blocks, or duplicate metric cards",
);

const clarityPathsStart = analytics.indexOf("const clarityPublicPaths");
const clarityPathsEnd = analytics.indexOf("let installed", clarityPathsStart);
const clarityPathAllowlist = analytics.slice(clarityPathsStart, clarityPathsEnd);

check(
  "advertiser contract detail keeps one state-specific PDF download action",
  agents.includes("Contract detail pages should expose PDF downloads inside the detail action area") &&
    contractAdminViewer.includes("apiPath(`/api/contracts/${contract.id}/review-pdf`)") &&
    contractAdminViewer.includes(
      "contract.pdf_url || apiPath(`/api/contracts/${contract.id}/final-pdf`)",
    ) &&
    contractAdminViewer.includes("contractPdfDownloadName") &&
    contractAdminViewer.includes("download={contractPdfDownloadName}") &&
    contractAdminViewer.includes("isContractSignedOrClosed ?") &&
    !advertiserDashboard.includes("review-pdf") &&
    !advertiserDashboard.includes("final-pdf"),
  "Advertiser contract PDFs must live in the contract detail action area: review PDF before signing, final signed PDF after signing, without dashboard-row PDF actions",
);

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
    server.includes("allowPublicMarketplaceCatalogFallback") &&
    server.includes("applyPublicMarketplaceFallback") &&
    server.includes("fallbackMarketplaceInfluencerProfiles") &&
    server.includes("fallbackMarketplaceBrandProfiles") &&
    server.includes("fallbackMarketplaceCampaignPosts") &&
    server.includes("dbProfiles.length > 0 ? dbProfiles : fallbackMarketplaceInfluencerProfiles()") &&
    server.includes("publicMarketplaceCache.delete(key)") &&
    server.includes('process.env.VERCEL === "1"') &&
    server.includes("public marketplace cache cold fallback"),
  "Public marketplace APIs must not keep returning 500 or empty catalog responses when a cold Supabase read times out or returns no public rows; skip serverless background warmup, clear the failed refresh, and serve the safe public fallback while retrying later",
);

check(
  "cache optimization keeps public and sensitive data separated",
  packageJson.dependencies["@vercel/functions"] &&
    server.includes("getVercelRuntimeCache") &&
    server.includes("publicMarketplaceCacheTags") &&
    server.includes("writePublicMarketplaceRuntimeCache") &&
    server.includes("value === null ? undefined : value") &&
    server.includes("invalidateByTag") &&
    server.includes('"Vercel-CDN-Cache-Control"') &&
    server.includes('"Vercel-Cache-Tag"') &&
    server.includes('response.setHeader("Cache-Control", "no-store")') &&
    server.includes("advertiserDashboardCache") &&
    server.includes("invalidateAdvertiserDashboardCache") &&
    marketplaceMessageSummaryHook.includes("messageSummaryInflight") &&
    cacheQueryOptimizationMigration.includes(
      "directsign_contracts_advertiser_status_updated_idx",
    ) &&
    cacheQueryOptimizationMigration.includes(
      "marketplace_contact_proposals_campaign_status_created_idx",
    ) &&
    cacheQueryOptimizationMigration.includes(
      "contract_parties_profile_role_contract_idx",
    ) &&
    agents.includes("Cache optimization must classify data before implementation") &&
    agents.includes("contract share tokens") &&
    agents.includes("Keep sensitive HTTP responses `no-store`"),
  "Cache changes must speed up public/catalog and repeated private reads without putting contract/PDF/signature/admin data into public CDN or Runtime Cache",
);

check(
  "dashboard excel export stays quiet and excludes sensitive fields",
  packageJson.dependencies.fflate &&
    dashboardDownloadButton.includes('aria-label="내보내기"') &&
    dashboardDownloadButton.includes('title="내보내기"') &&
    dashboardDownloadButton.includes(">내보내기</span>") &&
    !dashboardDownloadButton.includes(">다운로드</span>") &&
    dashboardDownloadButton.includes("hidden sm:inline") &&
    advertiserDashboard.includes("<DashboardExportDialog") &&
    influencerDashboard.includes("<DashboardExportDialog") &&
    advertiserDashboard.includes("exportWorkbookToGoogleSheets") &&
    influencerDashboard.includes("exportWorkbookToGoogleSheets") &&
    xlsxExport.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") &&
    advertiserDashboard.includes("handleDownloadDashboard") &&
    advertiserDashboard.includes("const CONTRACTS_PER_PAGE = 20") &&
    advertiserDashboard.includes("const DASHBOARD_CONTRACT_EXPORT_LIMIT = 5000") &&
    advertiserDashboard.includes("displayContracts.slice(pageStartIndex, pageEndIndex)") &&
    advertiserDashboard.includes("<ContractPagination") &&
    advertiserDashboard.includes("<DashboardDownloadButton onClick={handleDownloadDashboard} />") &&
    advertiserDashboard.includes("gap-x-3 gap-y-1") &&
    advertiserDashboard.includes("const [contractDateFromFilter, setContractDateFromFilter]") &&
    advertiserDashboard.includes("const [contractDateToFilter, setContractDateToFilter]") &&
    advertiserDashboard.includes("matchesDashboardDateRange") &&
    advertiserDashboard.includes("function DashboardDateRangeFilter") &&
    advertiserDashboard.includes("function DashboardDateInput") &&
    advertiserDashboard.includes('type="date"') &&
    advertiserDashboard.includes("aria-label={`${label} 시작일 필터`}") &&
    advertiserDashboard.includes("aria-label={`${label} 종료일 필터`}") &&
    advertiserDashboard.includes('placeholderLabel="시작일"') &&
    advertiserDashboard.includes('placeholderLabel="종료일"') &&
    advertiserDashboard.includes("onDateFromFilterChange(\"\")") &&
    advertiserDashboard.includes("Boolean(contractDateFromFilter)") &&
    advertiserDashboard.includes("Boolean(contractDateToFilter)") &&
    advertiserDashboard.includes("hasContractDashboardFilters") &&
    advertiserDashboard.includes("contractDownloadContracts") &&
    advertiserDashboard.includes("? visibleContracts") &&
    advertiserDashboard.includes(": [...dashboardContracts]") &&
    advertiserDashboard.includes("contractDownloadContracts.length > DASHBOARD_CONTRACT_EXPORT_LIMIT") &&
    advertiserContractFilterPanel.includes(advertiserContractTableGrid) &&
    hasAdvertiserContractFilterTableOrder &&
    agents.includes('visible Korean copy "내보내기"') &&
    agents.includes('accessible/title copy "내보내기"') &&
    agents.includes("Excel export should sit immediately beside the dashboard title") &&
    agents.includes("Date filtering belongs inside the dashboard filter panel") &&
    agents.includes("same visible column order as the table") &&
    advertiserDashboardExportSource.includes("buildAdvertiserContractExportSheet") &&
    advertiserDashboardExportSource.includes('"구분"') &&
    advertiserDashboardExportSource.includes('"기준일"') &&
    advertiserDashboardExportSource.includes('"계약 최초작성일"') &&
    advertiserDashboardExportSource.includes('"서명일"') &&
    advertiserDashboardExportSource.includes('"크리에이터명"') &&
    advertiserDashboardExportSource.includes('"크리에이터 계정명"') &&
    advertiserDashboardExportSource.includes('"구독자/팔로워수"') &&
    advertiserDashboardExportSource.includes('"콘텐츠 수량"') &&
    advertiserDashboardExportSource.includes('"마감일"') &&
    advertiserDashboardExportSource.includes('"조항 수"') &&
    advertiserDashboardExportSource.includes("CONTRACT_LIFECYCLE_EXPORT_LABELS[lifecycle]") &&
    advertiserDashboardExportSource.includes("buildAdvertiserCampaignExportSheet") &&
    advertiserDashboardExportSource.includes("buildAdvertiserCampaignApplicantExportSheet") &&
    influencerDashboard.includes("handleDownloadDashboard") &&
    influencerDashboard.includes("<DashboardDownloadButton onClick={handleDownloadDashboard} />") &&
    influencerDashboardExportSource.includes("buildInfluencerDashboardExportSheet") &&
    !/share_token|shareToken|pdf_url|signature_data|evidence_file|storage_path|supportAccess|download_url/.test(
      advertiserDashboardExportSource,
    ) &&
    !/share_token|shareToken|pdf_url|signature_data|evidence_file|storage_path|supportAccess|download_url/.test(
      influencerDashboardExportSource,
    ) &&
    agents.includes("Dashboard data exports should use one quiet top-right export action") &&
    agents.includes("whole dashboard contract set across lifecycle tabs") &&
    agents.includes("paginate at 20 rows per page") &&
    agents.includes("more than 5,000 rows") &&
    agents.includes("detailed operational extracts"),
  "Dashboard exports must use one consistent top-right action and keep share tokens, PDFs, signatures, evidence files, storage paths, and support access data out of spreadsheet rows",
);

check(
  "mobile contract and campaign surfaces are explicit",
  mobileSurfaceSwitch.includes("data-mobile-surface-switch") &&
    mobileSurfaceSwitch.includes("1:1 계약") &&
    mobileSurfaceSwitch.includes("캠페인") &&
    mobileSurfaceSwitch.includes("/advertiser/dashboard") &&
    mobileSurfaceSwitch.includes("/advertiser/campaigns") &&
    mobileSurfaceSwitch.includes("/influencer/dashboard") &&
    mobileSurfaceSwitch.includes("/influencer/campaigns") &&
    advertiserDashboard.includes('<MobileSurfaceSwitch role="advertiser" active={surface} />') &&
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
    dashboardSurfaceSwitch.includes('label: "1:1 계약"') &&
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
  "Advertiser and influencer desktop app frames must use the same 1:1 계약/캠페인 dashboard switch instead of page-specific back or find buttons",
);

check(
  "marketplace discovery separates platform and category filters",
    agents.includes("Platform and category are separate discovery axes") &&
      agents.includes("Category filters that have many options should not be an always-visible chip strip on mobile") &&
      agents.includes("allow multiple category selections") &&
      marketplacePages.includes("const [categoryFilters, setCategoryFilters] = useState<string[]>([])") &&
      marketplacePages.includes("hasAnyCategory(profile.categories, categoryFilters)") &&
      marketplacePages.includes("function getCategoryFilterKey") &&
      marketplacePages.includes("const categoryKeyAliases") &&
      marketplacePages.includes("const categoryDisplayLabels") &&
      agents.includes("Category chips and filters must use customer-facing Korean labels") &&
      marketplacePages.includes("function CategoryChecklist") &&
      marketplacePages.includes("type=\"checkbox\"") &&
      marketplacePages.includes("values={categoryFilters}") &&
      marketplacePages.includes('getCategoryLabels(profile.categories, 3).join(" · ")') &&
      marketplacePages.includes("FilterChipGroup label=\"플랫폼\"") &&
      !marketplacePages.includes("function CategoryFilterBar") &&
      !marketplacePages.includes("FilterChipGroup label=\"카테고리\"") &&
    campaignPages.includes("const [categoryFilters, setCategoryFilters] = useState<string[]>([])") &&
    campaignPages.includes("function CategoryCheckboxList") &&
    campaignPages.includes("formatCampaignCategoryFilterSummary(categoryFilters)") &&
    campaignPages.includes("!categoryFilters.includes(campaign.brandCategory)") &&
    campaignPages.includes("values={categoryFilters}") &&
    !campaignPages.includes("function CampaignCategoryStrip") &&
    !campaignPages.includes("<CampaignCategoryStrip") &&
    !campaignPages.includes('<FilterGroup label="카테고리">'),
  "Advertiser discovery and influencer campaign discovery must keep platform and category separate, with category handled as compact multi-select checkboxes instead of mobile-eating chip strips",
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
    campaignPages.includes('mobileLabel: "모집"') &&
    campaignPages.includes('mobileLabel: "신청"') &&
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
    seedTestAccounts.includes("applicantCount: 12") &&
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

check(
  "primary CTA token stays product-wide blue",
  agents.includes("Blue primary CTAs were directly requested by the Product Owner as a product-wide rule") &&
    indexCss.includes("--yl-primary: #2563eb") &&
    indexCss.includes("--yl-primary-hover: #1d4ed8") &&
    indexCss.includes("rgba(37, 99, 235, 0.2)") &&
    indexCss.includes(".yl-primary-action"),
  "Product-wide primary CTA tokens must stay blue instead of black/neutral",
);

const influencerPublicProfileStart = marketplacePages.indexOf(
  "export function PublicInfluencerProfilePage",
);
const influencerPublicProfileEnd = marketplacePages.indexOf(
  "export function PublicBrandProfilePage",
  influencerPublicProfileStart,
);
const influencerPublicProfileSource =
  influencerPublicProfileStart >= 0 && influencerPublicProfileEnd > influencerPublicProfileStart
    ? marketplacePages.slice(influencerPublicProfileStart, influencerPublicProfileEnd)
    : "";

check(
  "influencer public profile stays simple and account-forward",
  agents.includes("Influencer public profile pages should stay simple and account-forward") &&
    influencerPublicProfileSource.includes('data-profile-layout="creator-media-kit"') &&
    influencerPublicProfileSource.includes("getMarketplaceInfluencerAvatarUrl(profile)") &&
    influencerPublicProfileSource.includes("channelSummaries = profile.platforms.slice(0, 4)") &&
    influencerPublicProfileSource.includes("href={platform.url}") &&
    influencerPublicProfileSource.includes('target="_blank"') &&
    influencerPublicProfileSource.includes("bg-blue-600") &&
    influencerPublicProfileSource.includes("제안하기") &&
    influencerPublicProfileSource.includes('to="/advertiser/discover"') &&
    influencerPublicProfileSource.includes("sm:hidden") &&
    agents.includes("first screens should not show money") &&
    agents.includes('proposal areas should show only the blue "제안하기" button') &&
    agents.includes("account for one, two, three, and four verified platforms") &&
    agents.includes('Remove explanatory labels such as "플랫폼 / 팔로워", "팔로워", "구독자", or "이웃"') &&
    agents.includes("categories should read as simple premium text") &&
    influencerPublicProfileSource.includes("lg:pt-14") &&
    !influencerPublicProfileSource.includes("profile.responseTimeLabel") &&
    !influencerPublicProfileSource.includes("startingPriceLabel") &&
    !influencerPublicProfileSource.includes("대표 콘텐츠") &&
    !influencerPublicProfileSource.includes("플랫폼 / 팔로워") &&
    !influencerPublicProfileSource.includes("다른 인플루언서 보기") &&
    !influencerPublicProfileSource.includes("profile.location") &&
    !influencerPublicProfileSource.includes("portfolioItems") &&
    !influencerPublicProfileSource.includes("profile.portfolio") &&
    !influencerPublicProfileSource.includes("ProfileInfoRow"),
  "Influencer public profile must show account buttons and a blue proposal CTA without portfolio/media-kit sections or repeated channel blocks",
);

check(
  "influencer public profile makes platform metrics prominent",
    agents.includes("platform and follower/subscriber metrics are primary decision data") &&
    agents.includes("recognizable official-brand platform marks") &&
    agents.includes("shared with dashboard platform pills") &&
    agents.includes("extra bordered or white rounded wrapper") &&
    agents.includes("around a 28px raw brand mark") &&
    agents.includes("Remove explanatory labels such as") &&
    agents.includes("visually bind the platform name/logo to its audience number") &&
    agents.includes("tall `justify-between` stat tiles") &&
    agents.includes("On mobile only, render each verified platform as one horizontal row") &&
    agents.includes("On desktop, keep the platform area block-like") &&
    agents.includes("upper profile action area") &&
    agents.includes("larger representative channel blocks") &&
    agents.includes("one platform uses the full strip") &&
    agents.includes("two platforms split the strip evenly") &&
    agents.includes("existing compact external-link icon") &&
    agents.includes("Do not show a text tooltip or visible text button") &&
    agents.includes("image bezels should stay present but restrained") &&
    agents.includes("hiding nonessential handles") &&
    platformBrandMark.includes("export function PlatformBrandMark") &&
    !platformBrandMark.includes("export function getPlatformDisplayName") &&
    platformDisplay.includes("export function getPlatformDisplayName") &&
    platformBrandMark.includes('md: "h-7 w-7"') &&
    !platformBrandMark.includes("border border-neutral-200 bg-white") &&
    platformDisplay.includes('platform === "instagram"') &&
    platformDisplay.includes('platform === "naver_blog"') &&
    marketplacePages.includes('from "../../components/PlatformBrandMark"') &&
    marketplacePages.includes('from "../../domain/platformDisplay"') &&
    influencerPublicProfileSource.includes("PlatformBrandMark platform={platform.platform}") &&
    influencerPublicProfileSource.includes("getPlatformDisplayName(platform.platform)") &&
    influencerPublicProfileSource.includes("platformCount === 1") &&
    influencerPublicProfileSource.includes("platformCount === 2") &&
    influencerPublicProfileSource.includes("platformCount === 3") &&
    influencerPublicProfileSource.includes("hasFeaturedPlatformLayout = platformCount <= 2") &&
    influencerPublicProfileSource.includes("grid-cols-[minmax(0,1fr)_auto_auto]") &&
    influencerPublicProfileSource.includes("lg:grid-cols-[minmax(0,1fr)_156px]") &&
    influencerPublicProfileSource.includes("lg:grid-cols-[minmax(0,1fr)]") &&
    influencerPublicProfileSource.includes("lg:grid-cols-[repeat(2,minmax(0,1fr))]") &&
    influencerPublicProfileSource.includes("lg:grid-cols-[repeat(3,minmax(150px,1fr))]") &&
    influencerPublicProfileSource.includes("lg:grid-cols-[repeat(4,minmax(116px,1fr))]") &&
    influencerPublicProfileSource.includes("lg:gap-x-5") &&
    influencerPublicProfileSource.includes("lg:flex lg:flex-col") &&
    influencerPublicProfileSource.includes("lg:min-h-[118px]") &&
    influencerPublicProfileSource.includes("lg:items-center lg:justify-center") &&
    influencerPublicProfileSource.includes("lg:text-[48px]") &&
    influencerPublicProfileSource.includes("lg:inline-flex") &&
    influencerPublicProfileSource.includes("lg:hidden") &&
    influencerPublicProfileSource.includes("ExternalLink") &&
    influencerPublicProfileSource.includes("h-[200px]") &&
    influencerPublicProfileSource.includes("p-1.5 sm:p-2.5") &&
    influencerPublicProfileSource.includes("text-[22px]") &&
    influencerPublicProfileSource.includes("sm:text-[24px]") &&
    influencerPublicProfileSource.includes("lg:mt-3") &&
    influencerPublicProfileSource.includes("lg:text-[36px]") &&
    influencerPublicProfileSource.includes("lg:absolute lg:right-0 lg:top-0") &&
    !influencerPublicProfileSource.includes("인플루언서 계정으로 이동") &&
    !influencerPublicProfileSource.includes("group-hover:opacity-100") &&
    !influencerPublicProfileSource.includes("group-focus-visible:opacity-100") &&
    !influencerPublicProfileSource.includes(">계정 보기<") &&
    !influencerPublicProfileSource.includes("연결하기") &&
    !influencerPublicProfileSource.includes("p-3 sm:p-5") &&
    !influencerPublicProfileSource.includes("flex-col justify-between") &&
    !influencerPublicProfileSource.includes("hidden truncate text-[13px]") &&
    !influencerPublicProfileSource.includes("getPlatformAudienceMetricLabel") &&
    !influencerPublicProfileSource.includes("getPlatformIcon(platform.platform") &&
    !influencerPublicProfileSource.includes("lg:grid-cols-[minmax(0,1fr)_184px]") &&
    !influencerPublicProfileSource.includes("lg:w-[184px]") &&
    !influencerPublicProfileSource.includes("lg:grid-cols-[minmax(220px,260px)]") &&
    !influencerPublicProfileSource.includes("lg:max-w-[520px]") &&
    influencerPublicProfileSource.includes("aria-label={`${getPlatformDisplayName(platform.platform)} ${platform.handle}"),
  "Influencer public profile platform buttons must make platform names and follower/subscriber counts large and scannable",
);

check(
  "influencer public profile proposal card stays content-sized",
    agents.includes("proposal panels must not stretch into tall empty cards") &&
    agents.includes("polished creator media-kit first page") &&
    agents.includes("awkward stretched CTAs") &&
    agents.includes("Desktop proposal CTAs should be separated into the upper profile action area") &&
    influencerPublicProfileSource.includes("data-profile-platform-strip") &&
    influencerPublicProfileSource.includes("lg:grid-cols-[minmax(0,1fr)_156px]") &&
    influencerPublicProfileSource.includes("w-[156px]") &&
    influencerPublicProfileSource.includes("lg:inline-flex") &&
    influencerPublicProfileSource.includes("lg:hidden") &&
    influencerPublicProfileSource.includes("min-h-[52px]") &&
    !influencerPublicProfileSource.includes("lg:grid-cols-[minmax(0,1fr)_184px]") &&
    !influencerPublicProfileSource.includes("lg:w-[184px]") &&
    influencerPublicProfileSource.includes("rounded-[28px]"),
  "Influencer public profile proposal panels must not stretch to match left content when that creates an empty card",
);

check(
  "mobile marketplace facts avoid nested tiles",
    agents.includes("Mobile marketplace brand and campaign cards should keep only the main outer card") &&
    agents.includes('Do not add generic proposal-type rows such as "제안 가능"') &&
    agents.includes("right side of the list title/summary") &&
    agents.includes("mobile headers must not show dashboard-like status panels") &&
    agents.includes("Marketplace and dashboard-like list headers should avoid grey helper/eyebrow copy") &&
    agents.includes("do not add a separate divider line under the title section") &&
    agents.includes("Removing duplicate dividers must not collapse the title rhythm") &&
    agents.includes("titles such as \"브랜드 찾기\" and \"캠페인 탐색\"") &&
    agents.includes("one primary proposal CTA") &&
    agents.includes("Mobile campaign discovery tabs should not repeat list counts") &&
    indexCss.includes(".yl-mobile-inline-fact") &&
    indexCss.includes("@media (max-width: 639px)") &&
    indexCss.includes("border-radius: 0;") &&
    marketplacePages.includes("showMetrics={false}") &&
    (marketplacePages.match(/showMetrics=\{false\}/g)?.length ?? 0) >= 4 &&
    (marketplacePages.match(/showHeroCopy=\{false\}/g)?.length ?? 0) >= 2 &&
    marketplacePages.includes('showHeroCopy ? "border-b border-neutral-200/80" : ""') &&
    marketplacePages.includes('showHeroCopy ? "py-3 sm:py-4" : "pb-3 pt-8 sm:py-4"') &&
    !marketplacePages.includes("formatProposalTypes") &&
    !marketplacePages.includes("function ProfileFact") &&
    !marketplacePages.includes("제안 시작 정보") &&
    !marketplacePages.includes("다른 브랜드 보기") &&
    !marketplacePages.includes("brand.responseTimeLabel") &&
    !marketplacePages.includes('label="응답"') &&
    marketplacePages.includes("flex min-h-12 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2") &&
    marketplacePages.includes("flex w-full min-w-0 items-start justify-between gap-3 sm:block sm:flex-1") &&
    marketplacePages.includes('className="min-w-0 flex-1"') &&
    marketplacePages.includes('className="w-full min-w-0 sm:hidden"') &&
    marketplacePages.includes("className={`${filterButtonClassName} sm:hidden`}") &&
    marketplacePages.includes("hidden min-w-0 shrink-0 items-center gap-2 sm:flex") &&
    campaignPages.includes("metrics={[]}") &&
    (campaignPages.match(/showHeroCopy=\{false\}/g)?.length ?? 0) >= 2 &&
    campaignPages.includes('showHeroCopy ? "border-b border-neutral-200/80" : ""') &&
    campaignPages.includes('showHeroCopy ? "py-2.5 sm:py-3" : "pb-2.5 pt-7 sm:py-3"') &&
    campaignPages.includes('aria-label={`${tab.label} ${tab.count}건`}') &&
    campaignPages.includes('hidden sm:inline') &&
    campaignPages.includes("yl-fact-tile yl-mobile-inline-fact sm:px-3 sm:py-2") &&
    campaignPages.includes("grid gap-0 border-y border-neutral-100 py-1 sm:grid-cols-2"),
  "Mobile brand/campaign pages should avoid fake response claims, top status panels, and boxed fact tiles inside cards",
);

check(
  "dashboard platform columns use logo-only official marks",
  advertiserDashboard.includes('from "../../components/PlatformBrandMark"') &&
    advertiserDashboard.includes('<PlatformBrandMark platform="youtube" size="sm" />') &&
    advertiserDashboard.includes('<PlatformBrandMark platform="instagram" size="sm" />') &&
    agents.includes("Dashboard platform columns should show platform logos only") &&
    advertiserDashboard.includes('items.map((item) => item.title).join(", ")') &&
    advertiserDashboard.includes("function CampaignPlatformMarks") &&
    advertiserDashboard.includes("<CampaignPlatformMarks platforms={campaign.platforms} title={platformLabel} />") &&
    !advertiserDashboard.includes(">{item.label}</span>") &&
    campaignPages.includes('from "../../components/PlatformBrandMark"') &&
    campaignPages.includes('from "../../domain/platformDisplay"') &&
    campaignPages.includes('<PlatformBrandMark platform={item.platform} size="sm" />') &&
    campaignPages.includes("getPlatformDisplayName(item.platform)") &&
    campaignPages.includes("const text = item.followersLabel") &&
    campaignPages.includes(
      "inline-flex min-w-0 shrink items-center gap-1.5 text-[11px] font-extrabold text-neutral-800",
    ) &&
    marketplacePages.includes('value={platform.followersLabel}') &&
    marketplacePages.includes('const hasMetric = Boolean(value)') &&
    marketplacePages.includes('PlatformBrandMark platform={platform} size={hasMetric ? "xs" : "sm"}'),
  "Dashboard platform columns should avoid repeating visible platform text inside dense rows",
);

check(
  "mobile intro screenshots use contained image areas",
  agents.includes("Intro carousel mobile image areas must not crop product screenshots") &&
    agents.includes("Influencer mobile intro pages must stay product-screen and dashboard centered") &&
    landing.includes("data-intro-visual") &&
    landing.includes('productPreview: "advertiserContractDocument"') &&
    landing.includes('productPreview: "advertiserExportDashboard"') &&
    landing.includes('productPreview: "advertiserApplicants"') &&
    landing.includes('productPreview: "influencerPdf"') &&
    landing.includes('productPreview: "influencerRevision"') &&
    landing.includes('productPreview: "influencerDashboard"') &&
    landing.includes("function IntroProposalProductPreview") &&
    landing.includes("function AdvertiserContractDocumentProductPreview") &&
    landing.includes("function AdvertiserShareDmPreview") &&
    landing.includes("function AdvertiserExportDashboardPreview") &&
    landing.includes("function AdvertiserApplicantsProductPreview") &&
    landing.includes("function IntroMobileServiceCapture") &&
    landing.includes("function InfluencerContractPdfPreview") &&
    landing.includes("function InfluencerRevisionRequestPreview") &&
    landing.includes("function InfluencerIntroDashboardPreview") &&
    landing.includes('slide.stage === "final"') &&
    landing.includes("function FinalHandshakeVisual") &&
    landing.includes("data-intro-carousel-controls") &&
    !landing.includes("data-intro-mobile-controls") &&
    landing.includes("object-[52%_center]") &&
    landing.includes("contractPdfReviewPage") &&
    landing.includes('imageClassName="object-contain object-center"') &&
    salesAdvertiserIntroduction.includes(".product-shot.product-shot-final img") &&
    salesAdvertiserIntroduction.includes("object-fit: cover;") &&
    salesAdvertiserIntroduction.includes("object-position: center;"),
  "Intro mobile slides should keep product/dashboard previews contained, avoid duplicate inner headers, and keep final imagery contained in the shared visual frame",
);

check(
  "advertiser intro PC proposal previews stay dense",
  agents.includes("Advertiser intro PC proposal pages after the first slide must preserve a dense, real-service feel") &&
    agents.includes("Intro carousel controls should sit together as one page-level bottom-center cluster") &&
    agents.includes("current approved advertiser flow") &&
    agents.includes('page 3 highlights the actual "공유 링크 생성"') &&
    agents.includes('page 4 shows the contract dashboard with the "내보내기" chooser') &&
    agents.includes("Product previews may be composed in React") &&
    agents.includes("use the neutral gray intro background behind it rather than white top/bottom letterbox bands") &&
    landing.includes("function IntroDesktopServiceCapture") &&
    landing.includes("data-intro-carousel-controls") &&
    !landing.includes("sm:left-3 sm:top-1/2") &&
    !landing.includes("sm:right-3 sm:top-1/2") &&
    landing.includes("data-intro-real-service-capture") &&
    landing.includes("data-intro-headerless-service-capture") &&
    landing.includes("bg-[#e9ede8]") &&
    !landing.includes("data-intro-headerless-service-capture\n      className={`${desktopOnly ? \"hidden sm:block\" : \"block\"} h-full min-h-0 overflow-hidden rounded-[16px] border border-neutral-200 bg-white") &&
    landing.includes("yeollock-intro-contract-builder-focused.png") &&
    landing.includes("yeollock-intro-contract-builder-mobile.png") &&
    landing.includes("yeollock-intro-contract-share-focused.png") &&
    landing.includes("yeollock-intro-content-review-focused.png") &&
    landing.includes("yeollock-intro-content-review-mobile.png") &&
    landing.includes("yeollock-intro-campaign-applicants-focused.png") &&
    landing.includes("yeollock-intro-campaigns-mobile.png") &&
    landing.includes("advertiserProposalAssetUrls.contractBuilder") &&
    landing.includes("contractPdfReviewPage") &&
    landing.includes("function AdvertiserContractDocumentProductPreview") &&
    landing.includes("function AdvertiserShareDmPreview") &&
    landing.includes("function AdvertiserExportDashboardPreview") &&
    landing.includes("공유 링크 생성") &&
    landing.includes("계약서 확인하고 서명하겠습니다~!") &&
    landing.includes("내보내기") &&
    landing.includes("엑셀 파일") &&
    landing.includes("Google 스프레드시트") &&
    landing.includes('imageClassName="object-contain object-center"') &&
    landing.includes("imageSrc={advertiserProposalAssetUrls.introContentReviewMobile}") &&
    landing.includes("imageSrc={advertiserProposalAssetUrls.introContentReview}") &&
    landing.includes("imageSrc={advertiserProposalAssetUrls.introCampaignsMobile}") &&
    landing.includes("imageSrc={advertiserProposalAssetUrls.introCampaignApplicants}") &&
    !landing.includes('imageSrc={advertiserProposalAssetUrls.introContractBuilder}\n        imageClassName="object-cover') &&
    !landing.includes('imageSrc={advertiserProposalAssetUrls.introContractShare}\n          imageClassName="object-cover') &&
    !landing.includes('imageSrc={advertiserProposalAssetUrls.introContentReview}\n      imageClassName="object-cover') &&
    !landing.includes('imageSrc={advertiserProposalAssetUrls.introCampaignApplicants}\n      imageClassName="object-cover') &&
    landing.includes("sources.add(advertiserProposalAssetUrls.introContractShare)") &&
    landing.includes("sources.add(advertiserProposalAssetUrls.introContentReview)") &&
    landing.includes("sources.add(advertiserProposalAssetUrls.introCampaignApplicants)") &&
    !landing.includes("advertiserProposalAssetUrls.contractAdmin") &&
    !landing.includes("advertiserProposalAssetUrls.contractContentCompleted") &&
    !landing.includes("advertiserProposalAssetUrls.campaignApplicants") &&
    !landing.includes("left-[60%] top-[56%]") &&
    !landing.includes("const advertiserIntroApplicantRows") &&
    !landing.includes("data-intro-applicant-card") &&
    landing.includes("data-intro-copy") &&
    landing.includes("sm:text-left sm:text-[clamp(15px,1.35vw,17px)]") &&
    landing.includes("const introVisualFrameClass") &&
    landing.includes("sm:grid-cols-[minmax(220px,0.32fr)_minmax(0,0.68fr)]"),
  "Advertiser intro PC pages 2-5 must use headerless focused actual captures, left-aligned support copy, and the real 12-applicant campaign capture instead of sparse, montage, or hand-built mock dashboards",
);

check(
  "shutdown requests stay one-time operations",
  agents.includes("A one-time shutdown request must not become a standing completion routine") &&
    agents.includes("Only schedule computer shutdown when the Product Owner explicitly asks for shutdown in that current work moment"),
  "Computer shutdown should not become a standing after-completion operation",
);

check(
  "dashboard and campaign platform marks stay logo-only",
  agents.includes("Dashboard and campaign card platform indicators should use official platform logo marks") &&
    platformBrandMark.includes('xs: "h-4 w-4"') &&
    platformBrandMark.includes("rounded-[4px]") &&
    platformBrandMark.includes("rounded-[3px]") &&
    influencerDashboard.includes('import { PlatformBrandMark } from "../../components/PlatformBrandMark"') &&
    influencerDashboard.includes('icon: <PlatformBrandMark platform="instagram" size="xs" />') &&
    influencerDashboard.includes('className="inline-flex h-6 w-6 shrink-0 items-center justify-center"') &&
    influencerDashboard.includes("<PlatformBrandMark platform={primaryPlatform.platform} size=\"sm\" />") &&
    !influencerDashboard.includes('<span className="min-w-0 truncate whitespace-nowrap">{primaryPlatform.label}</span>') &&
    campaignPages.includes("function CampaignPlatformLogoMarks") &&
    campaignPages.includes('<PlatformBrandMark platform={platform} size="sm" />') &&
    !campaignPages.includes("{platformLabels[platform]}\n          </span>\n        ))}"),
  "Dashboard and campaign card platform indicators should show rounded official logos, not mixed Korean platform-name chips",
);

check(
  "intro preview platform rows stay logo-only",
  landing.includes("function IntroPlatformMarks") &&
    landing.includes("function getIntroPlatformMarks") &&
    landing.includes('<PlatformBrandMark platform="instagram" size="md" />') &&
    landing.includes('<PlatformBrandMark platform="youtube" size="md" />') &&
    landing.includes('<PlatformBrandMark platform="naver_blog" size="md" />') &&
    landing.includes('<PlatformBrandMark platform="tiktok" size="md" />') &&
    landing.includes("<IntroPlatformMarks platform={row.platform}") &&
    landing.includes("<IntroPlatformMarks platform={item.platform}") &&
    landing.includes("function MobilePreviewPlatformMeta") &&
    !landing.includes("{row.platform}\n              </span>") &&
    !landing.includes("{item.platform}\n              </p>") &&
    !landing.includes("{row.platform} · {row.due}"),
  "Intro dashboard/list rows should show official platform marks instead of visible platform-name chips",
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
  landing.includes("1:1 계약 목록") &&
    landing.includes("계약명") &&
    !landing.includes("캠페인 목록"),
  "intro previews must mirror the contract dashboard labels",
);

const advertiserProposalCarouselStart = landing.indexOf(
  "function ProposalIntroCarousel",
);
const advertiserProposalCarouselEnd = landing.indexOf(
  "function RolePreviewSlideView",
  advertiserProposalCarouselStart,
);
const advertiserProposalCarousel =
  advertiserProposalCarouselStart >= 0 && advertiserProposalCarouselEnd >= 0
    ? landing.slice(advertiserProposalCarouselStart, advertiserProposalCarouselEnd)
    : "";

check(
  "intro pages use the PDF proposal slide frame",
  landing.includes("const advertiserProposalSlides") &&
    landing.includes("const influencerProposalSlides") &&
    landing.includes("const advertiserProposalAssetUrls") &&
    landing.includes("yeollock-contract-builder-first-screen.png") &&
    landing.includes("yeollock-intro-contract-builder-focused.png") &&
    landing.includes("yeollock-intro-contract-share-focused.png") &&
    landing.includes("yeollock-influencer-contract.png") &&
    landing.includes("yeollock-intro-campaign-applicants-focused.png") &&
    landing.includes("yeollock-intro-content-review-focused.png") &&
    landing.includes("yeollock-contract-handshake.png") &&
    landing.includes("risk-generated-missed-contact.png") &&
    landing.includes("광고주 PDF 제안서형 인트로 슬라이드") &&
    landing.includes("인플루언서 PDF 제안서형 인트로 슬라이드") &&
    landing.includes("data-intro-pdf-carousel") &&
    landing.includes("data-intro-pdf-slide") &&
    !landing.includes("shadow-[0_28px_86px") &&
    !landing.includes("linear-gradient(112deg,transparent_0_61%") &&
    !landing.includes("pointer-events-none absolute inset-3") &&
    !landing.includes("yl-primary-action inline-flex h-[34px]") &&
    landing.includes("BrandLogo") &&
    !landing.includes("<LogoMark") &&
    brandLogo.includes("bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]") &&
    brandLogo.includes('viewBox="0 0 32 32"') &&
    !landing.includes("function ProposalSlideBrand") &&
    !landing.includes("<ProposalSlideBrand") &&
    landing.includes("pageNo: \"01\"") &&
    landing.includes("stage: \"link\"") &&
    advertiserProposalCarousel.includes("aria-label={`이전 ${controlLabel}`}") &&
    advertiserProposalCarousel.includes("aria-label={`다음 ${controlLabel}`}") &&
    advertiserProposalCarousel.includes('aria-roledescription="slide"') &&
    advertiserProposalCarousel.includes("setSlideIndex(index)") &&
    !landing.includes("const [searchParams] = useSearchParams") &&
    !landing.includes("lg:grid-cols-[minmax(330px,0.52fr)_minmax(0,1.48fr)]") &&
    qaStandard.includes('"계약서"') &&
    qaStandard.includes('"없는 약속은"') &&
    qaStandard.includes('"광고비 먹튀"') &&
    !qaStandard.includes('requiredText: ["계약 흐름을", "한눈에 관리", "작성중", "진행중", "종료"]') &&
    agents.includes("sales/PDF proposal flow as a manual carousel") &&
    agents.includes("same PDF slide-page composition") &&
    agents.includes("subtle left/right controls") &&
    agents.includes("Do not duplicate the PDF's internal brand/header") &&
    agents.includes("do not place the intro content inside a white/card-like screen wrapper") &&
    agents.includes("brand marks and brand text should stay black/neutral") &&
    !advertiserProposalCarousel.includes("to={startHref}"),
  "Intro pages must mirror the sales/PDF proposal composition without duplicate headers, white wrapper frames, or blue logo lockups",
);

check(
  "mobile contract builder intro uses actual product screenshot",
  agents.includes("Mobile intro product previews must not become card-in-card mockups") &&
    landing.includes("function ActualContractBuilderMobilePreview") &&
    landing.includes("<ActualContractBuilderMobilePreview />") &&
    landing.includes("function IntroMobileServiceCapture") &&
    landing.includes("src={imageSrc}") &&
    landing.includes("yeollock-intro-contract-builder-mobile.png") &&
    landing.includes("yeollock-intro-content-review-mobile.png") &&
    landing.includes("yeollock-intro-campaigns-mobile.png") &&
    landing.includes("imageSrc={advertiserProposalAssetUrls.introContractBuilderMobile}") &&
    landing.includes("imageSrc={advertiserProposalAssetUrls.introContentReviewMobile}") &&
    landing.includes("imageSrc={advertiserProposalAssetUrls.introCampaignsMobile}") &&
    !landing.includes("top-[-5.7%]") &&
    !landing.includes("w-[203%]") &&
    landing.includes("sm:hidden") &&
    !landing.includes("function AdvertiserBuilderMobileProductPreview"),
  "Mobile advertiser intro must use actual mobile service screenshots instead of desktop dashboard captures or nested mockups",
);

check(
  "advertiser sales PDF keeps dashboard explanation quiet",
  salesAdvertiserIntroduction.includes("yeollock-contract-builder-first-screen.png") &&
    salesAdvertiserIntroduction.includes("yeollock-contract-admin.png") &&
    salesAdvertiserIntroduction.includes("yeollock-influencer-contract.png") &&
    salesAdvertiserIntroduction.includes("yeollock-campaign-applicants-dashboard.png") &&
    salesAdvertiserIntroduction.includes("yeollock-contract-handshake.png") &&
    salesAdvertiserIntroduction.includes('data-stage="link-signature"') &&
    salesAdvertiserIntroduction.includes('class="link-flow-visual"') &&
    salesAdvertiserIntroduction.includes('class="product-shot product-shot-contract-hero"') &&
    salesAdvertiserIntroduction.includes(".product-shot-contract-hero img") &&
    captureSalesAssets.includes("{ width: 1180, height: 884 }") &&
    !salesAdvertiserIntroduction.includes('class="product-stack"') &&
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
  advertiserSalesUnifiedGridCount === 6 &&
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
    salesAdvertiserIntroduction.includes("--sales-copy-visual-height: 141mm;") &&
    salesAdvertiserIntroduction.includes("--sales-copy-visual-height: 117.8mm;") &&
    salesAdvertiserIntroduction.includes(".deck > .page:nth-of-type(3) {\n        --sales-copy-visual-height: 128mm;") &&
    salesAdvertiserIntroduction.includes(".deck > .page:nth-of-type(4) {\n        --sales-copy-visual-height: 141mm;") &&
    salesAdvertiserIntroduction.includes(".deck > .page:nth-of-type(6) {\n        --sales-copy-visual-height: 117.8mm;") &&
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
    salesAdvertiserIntroduction.includes("link-flow-visual") &&
    exists("docs/sales/assets/yeollock-contract-builder-first-screen.png") &&
    exists("docs/sales/assets/yeollock-advertiser-dashboard.png") &&
    exists("docs/sales/assets/yeollock-campaign-applicants-dashboard.png") &&
    exists("docs/sales/assets/yeollock-contract-content-review.png") &&
    exists("docs/sales/assets/yeollock-influencer-contract.png") &&
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
  "sales and proposal captures use current 1:1 contract naming",
  agents.includes("Proposal decks, sales PDFs, and screenshot assets must not preserve stale dashboard naming") &&
    captureSalesAssets.includes('waitForBodyText(client, dashboardPage, "1:1 계약 대시보드")') &&
    practitionerIntroduction.includes("1:1 계약 대시보드") &&
    practitionerGuide.includes("1:1 계약 대시보드") &&
    salesInfluencerIntroduction.includes("광고주가 보낸 1:1 계약") &&
    ![salesAdvertiserIntroduction, salesInfluencerIntroduction, practitionerIntroduction, practitionerGuide].some(
      (source) =>
        source.includes("받은 광고 계약") ||
        source.includes("받은 광고계약") ||
        source.includes("받은 1:1 계약 대시보드") ||
        source.includes("계약 운영 대시보드") ||
        source.includes("출근 후 먼저<br />계약 대시보드") ||
        source.includes("이후에는 계약 대시보드"),
    ),
  "Sales/proposal decks and their capture scripts must be regenerated after dashboard naming changes instead of keeping old image/copy labels",
);

check(
  "campaign selection stays inside campaign surface",
  agents.includes("A campaign remains a one-to-many campaign surface after applicant selection") &&
    advertiserDashboard.includes("지원자와 선정자별 진행을 관리합니다") &&
    advertiserDashboard.includes("선정하면 이 캠페인의 계약서가 만들어집니다") &&
    advertiserDashboard.includes("계약서 보기") &&
    advertiserCampaignDetailSource.includes("모집 현황") &&
    advertiserCampaignDetailSource.includes("선정자별 진행") &&
    campaignParticipantEmptySource.includes("아직 선정자별 진행이 없습니다") &&
    campaignParticipantEmptySource.includes("계약서와 서명 진행이 이곳에 표시됩니다") &&
    !advertiserCampaignDetailSource.includes("1:1 계약 목록") &&
    !campaignParticipantEmptySource.includes("아직 1:1 계약이 없습니다") &&
    campaignPages.includes("선정하면 이 캠페인의 계약서 초안이 만들어집니다") &&
    campaignPages.includes("캠페인 계약서 진행이 시작됩니다") &&
    campaignPages.includes("계약서 보기") &&
    practitionerIntroduction.includes("선정자별 진행을 관리합니다") &&
    practitionerIntroduction.includes("계약서, 서명, 제출 상태를 캠페인 안에서 이어갑니다") &&
    practitionerGuide.includes("선정자별 진행을 이어갑니다") &&
    practitionerGuide.includes("캠페인 상세에서 선정자별로 봅니다") &&
    ![advertiserDashboard, campaignPages, practitionerIntroduction, practitionerGuide].some(
      (source) =>
        source.includes("계약 전환") ||
        source.includes("계약 흐름으로 연결") ||
        source.includes("계약으로 넘깁니다") ||
        source.includes("이후에는 1:1 계약 대시보드에서 관리") ||
        source.includes("이후 관리는 1:1 계약"),
    ),
  "Campaign applicants may generate contract documents, but customer-facing copy must keep selection, signing, submission, and review inside the campaign surface",
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

check(
  "advertiser sales PDF campaign applicant capture feels full",
  captureSalesAssets.includes("openCount: 0") &&
    captureSalesAssets.includes("activeOpenCount: 0") &&
    captureSalesAssets.includes("{ width: 1440, height: 1250 }") &&
    captureSalesAssets.includes("b.count - a.count") &&
    captureSalesAssets.includes("b.openCount - a.openCount") &&
    captureSalesAssets.includes("b.activeOpenCount - a.activeOpenCount") &&
    captureSalesAssets.includes("fillCampaignApplicantsForSalesCapture") &&
    captureSalesAssets.includes("rowCount: rows.length") &&
    captureSalesAssets.includes("rows.length < 12") &&
    captureSalesAssets.includes('count + "명 표시 · 전체 " + count + "명"') &&
    seedTestAccounts.includes("applicantCount: 12") &&
    agents.includes("choose the campaign with the most visible selectable influencer rows first") &&
    agents.includes("do not use a sparse one- or two-row applicant list") &&
    agents.includes("12 or more applicants for proposal captures") &&
    agents.includes("not zooming or enlarging the screenshot"),
  "Advertiser proposal capture must prioritize the fullest influencer applicant list so the PDF does not look empty",
);

const salesAdvertiserPdfPageCount =
  salesAdvertiserPdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
const salesAdvertiserPageNumberCount =
  salesAdvertiserIntroduction.match(/class="page-no"/g)?.length ?? 0;

check(
  "advertiser sales PDF exports without blank pages",
  salesAdvertiserPdfPageCount === 6 &&
    salesAdvertiserIntroduction.includes("@media print") &&
    salesAdvertiserIntroduction.includes("body {\n          padding: 0;") &&
    salesAdvertiserIntroduction.includes(".deck {\n          display: block;"),
  "Sales PDF must render as the intended six pages without print padding/grid gaps that create blank pages",
);

check(
  "advertiser sales PDF has unified logo and page numbers",
  salesAdvertiserPageNumberCount === 6 &&
    ["01", "02", "03", "04", "05", "06"].every((pageNo) =>
      salesAdvertiserIntroduction.includes(`<span class="page-no">${pageNo}</span>`),
    ) &&
    salesAdvertiserIntroduction.includes("width: 54px;") &&
    salesAdvertiserIntroduction.includes("height: 54px;") &&
    agents.includes("page numbering consistent on every page") &&
    agents.includes("requested logo scaling"),
  "Advertiser sales PDF must use the requested larger logo and the same page-number treatment on all six pages",
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
    salesAdvertiserIntroduction.includes("계약서<br /><strong class=\"headline-emphasis headline-blue\">링크 공유</strong>") &&
    salesAdvertiserIntroduction.includes("작성한 계약서를 링크로 전달하면") &&
    salesAdvertiserIntroduction.includes("<strong>인플루언서</strong>가 확인 후 <strong>서명</strong>합니다") &&
    salesAdvertiserIntroduction.includes("yeollock-influencer-contract.png") &&
    salesAdvertiserIntroduction.includes("계약 관리를") &&
    salesAdvertiserIntroduction.includes("효율적으로") &&
    salesAdvertiserIntroduction.includes("진행과정 관리") &&
    !salesAdvertiserIntroduction.includes("<strong>진행과정</strong>") &&
    salesAdvertiserIntroduction.includes("플랫폼별 관리") &&
    salesAdvertiserIntroduction.includes("<strong>콘텐츠 확인</strong>") &&
    salesAdvertiserIntroduction.includes("<strong>수정요청</strong>") &&
    salesAdvertiserIntroduction.includes("서명 관리") &&
    salesAdvertiserIntroduction.includes("yeollock-contract-content-review.png") &&
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
    salesAdvertiserIntroduction.includes("계약서<br /><strong class=\"headline-emphasis headline-blue\">링크 공유</strong>") &&
    salesAdvertiserIntroduction.includes("작성한 계약서를 링크로 전달하면") &&
    salesAdvertiserIntroduction.includes("<strong>인플루언서</strong>가 확인 후 <strong>서명</strong>합니다") &&
    !salesAdvertiserIntroduction.includes("<strong>진행과정</strong>") &&
    salesAdvertiserIntroduction.includes("플랫폼별 관리") &&
    salesAdvertiserIntroduction.includes("<strong>콘텐츠 확인</strong>") &&
    salesAdvertiserIntroduction.includes("<strong>수정요청</strong>") &&
    salesAdvertiserIntroduction.includes("서명 관리") &&
    salesAdvertiserIntroduction.includes("yeollock-contract-content-review.png") &&
    salesAdvertiserIntroduction.includes("캠페인 모집도") &&
    salesAdvertiserIntroduction.includes("편리하게!") &&
    salesAdvertiserIntroduction.includes("캠페인에 지원한") &&
    salesAdvertiserIntroduction.includes("<strong>인플루언서 쉽게 확인, 선정</strong>") &&
    salesAdvertiserIntroduction.includes("1대多 계약서 자동 생성") &&
    salesAdvertiserIntroduction.includes("서로에게") &&
    salesAdvertiserIntroduction.includes("안전한 광고") &&
    salesAdvertiserIntroduction.includes("연락미에서 시작하세요") &&
    salesAdvertiserIntroduction.includes("문의 이메일"),
  "Advertiser sales PDF must keep the owner-approved six-page headline sequence",
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
  '<section class="page" data-stage="link-signature">',
  '<section class="page" data-stage="service-explanation">',
  '<section class="page" data-stage="cta">',
].map((marker) => salesAdvertiserIntroduction.indexOf(marker));

check(
  "advertiser sales PDF persuades before explaining",
  advertiserSalesStageOrder.every((index) => index >= 0) &&
    advertiserSalesStageOrder[0] < advertiserSalesStageOrder[1] &&
    advertiserSalesStageOrder[1] < advertiserSalesStageOrder[2] &&
    advertiserSalesStageOrder[2] < advertiserSalesStageOrder[3] &&
    advertiserSalesStageOrder[3] < advertiserSalesStageOrder[4],
  "Advertiser PDF must follow pain point -> yeollock strength -> link signature flow -> service/dashboard explanation -> CTA",
);

const demoData = evaluateLiteralObject(landing, "const introDashboardDemoData =");
const expectedTabs = {
  advertiser: ["작성중", "진행중", "종료"],
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
  "Advertiser intro preview must show the real dashboard 1:1 계약/캠페인 header switch, not put 새 계약/새 캠페인 in the global header",
);

check(
  "intro advertiser primary action stays in title bar",
  landing.includes('actionLabel="1:1 계약 작성"') &&
    landing.includes("function IntroDashboardTitleBar"),
  "Advertiser intro preview must mirror the real dashboard by keeping 1:1 계약 작성 in the dashboard title bar",
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
  landing.includes('label="1:1 계약"') &&
    landing.includes('label="캠페인 찾기"') &&
    landing.includes('label="메시지함"') &&
    landing.includes('label="로그아웃"'),
  "Influencer intro preview header must mirror the real dashboard action order",
);

check(
  "intro influencer explains why not email",
  landing.includes("광고계약") &&
    landing.includes("흩어진 광고 계약") &&
    landing.includes("위험") &&
    landing.includes("광고비 미지급") &&
    landing.includes("마감일 착오") &&
    landing.includes("컨텐츠 기준 변경") &&
    landing.includes("활용 범위 과다") &&
    landing.includes("1:1 계약") &&
    landing.includes("1:1 계약 대시보드") &&
    !landing.includes("받은 광고 계약") &&
    !landing.includes("받은 광고계약") &&
    !landing.includes("받은 1:1 계약 대시보드") &&
    landing.includes("const influencerProposalSlides") &&
    landing.includes("PDF 계약서") &&
    landing.includes("원문 확인") &&
    landing.includes("수정 요청") &&
    landing.includes("서명 완료본") &&
    qaStandard.includes('"광고계약"') &&
    qaStandard.includes('"광고비 미지급"') &&
    agents.includes("Influencer intro pages must now lead like the advertiser pain-point opener"),
  "Influencer intro first viewport must lead with creator-side contract risk cards before showing the received-contract dashboard",
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
