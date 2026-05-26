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
const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
const influencerDashboard = read("src/pages/influencer/InfluencerDashboard.tsx");
const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
const mobileSurfaceSwitch = read("src/components/MobileSurfaceSwitch.tsx");
const authLoginScreen = read("src/components/AuthLoginScreen.tsx");
const advertiserVerification = read("src/pages/marketing/AdvertiserVerification.tsx");
const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");
const display = read("src/domain/display.ts");
const agents = read("AGENTS.md");
const packageJson = JSON.parse(read("package.json"));
const qaStandard = read("scripts/qa-standard.mjs");

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
  "dashboard/intro date order is YYYY.MM.DD / D-day",
  dashboardAndIntroFiles,
  /D[-+]\d+\s*\/\s*20\d{2}\.\d{2}\.\d{2}/,
  "D-day must follow the full date, not lead it",
);

check(
  "advertiser dashboard date formatter returns date before D-day",
  advertiserDashboard.includes("return `${dateLabel} / ${dday}`;"),
  "formatDashboardDateWithDday must render YYYY.MM.DD / D±N",
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
  "mobile contract and campaign surfaces are explicit",
  mobileSurfaceSwitch.includes("data-mobile-surface-switch") &&
    mobileSurfaceSwitch.includes("계약") &&
    mobileSurfaceSwitch.includes("내 계약") &&
    mobileSurfaceSwitch.includes("캠페인") &&
    mobileSurfaceSwitch.includes("/advertiser/dashboard") &&
    mobileSurfaceSwitch.includes("/advertiser/campaigns") &&
    mobileSurfaceSwitch.includes("/influencer/dashboard") &&
    mobileSurfaceSwitch.includes("/influencer/campaigns") &&
    advertiserDashboard.includes('<MobileSurfaceSwitch role="advertiser" active="contracts" />') &&
    (influencerDashboard.match(/<MobileSurfaceSwitch role="influencer" active="contracts" \/>/g) ??
      []).length >= 2 &&
    campaignPages.includes('<MobileSurfaceSwitch role={role} active="campaigns" />'),
  "mobile users must see the contract/campaign surface split instead of relying on icon-only header actions",
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
