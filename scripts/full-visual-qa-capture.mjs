/* global document, window */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const outputRoot =
  process.env.QA_OUTPUT_DIR ||
  path.join(
    root,
    "qa-artifacts",
    `full-visual-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );

const credentials = {
  advertiser: {
    email: process.env.QA_ADVERTISER_EMAIL || "breadroom.manager@yeollock.me",
    password: process.env.QA_TEST_PASSWORD || "YeollockTest!2026",
  },
  influencer: {
    email: process.env.QA_INFLUENCER_EMAIL || "creator.sora@yeollock.me",
    password: process.env.QA_TEST_PASSWORD || "YeollockTest!2026",
  },
};

const sensitiveQueryKeyPattern = /token|secret|password|signature|code/i;

function redactUrlForReport(value) {
  if (typeof value !== "string" || !value) return value;

  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
    const url = new URL(value, "http://qa-report.local");
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveQueryKeyPattern.test(key)) {
        url.searchParams.set(key, "REDACTED");
      }
    }
    if (url.hash.includes("=")) {
      const hashParams = new URLSearchParams(url.hash.slice(1));
      for (const key of [...hashParams.keys()]) {
        if (sensitiveQueryKeyPattern.test(key)) {
          hashParams.set(key, "REDACTED");
        }
      }
      url.hash = hashParams.toString();
    }
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return redactSensitiveText(value);
  }
}

function redactSensitiveText(value) {
  return String(value).replace(
    /([?&#][a-z\d_.-]*(?:token|secret|password|signature|code)[a-z\d_.-]*=)[^&#\s]*/gi,
    "$1REDACTED",
  );
}

async function launchBrowser() {
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Fall back to the bundled browser if a local channel is unavailable.
    }
  }
  return chromium.launch({ headless: true });
}

const viewports = [
  { key: "pc", label: "PC", width: 1365, height: 900, isMobile: false },
  { key: "mobile", label: "모바일", width: 390, height: 844, isMobile: true },
];

const publicPages = [
  { id: "home", label: "메인", path: "/" },
  { id: "login", label: "로그인 선택", path: "/login" },
  { id: "login-advertiser", label: "광고주 로그인", path: "/login/advertiser" },
  { id: "login-influencer", label: "인플루언서 로그인", path: "/login/influencer" },
  { id: "signup", label: "회원가입 선택", path: "/signup" },
  { id: "signup-advertiser", label: "광고주 회원가입", path: "/signup/advertiser" },
  { id: "signup-influencer", label: "인플루언서 회원가입", path: "/signup/influencer" },
  { id: "reset-password", label: "비밀번호 재설정", path: "/reset-password?role=advertiser" },
  { id: "support", label: "고객지원", path: "/support" },
  { id: "privacy", label: "개인정보 처리방침", path: "/privacy" },
  { id: "terms", label: "이용약관", path: "/terms" },
  { id: "esign-consent", label: "전자서명 동의", path: "/legal/e-sign-consent" },
  { id: "resources", label: "자료실", path: "/resources" },
  { id: "resource-contract", label: "자료실 상세", path: "/resources/collaboration-contract" },
  { id: "public-brand-profile", label: "공개 브랜드 프로필", path: "/brands/breadroom-partner" },
  {
    id: "public-registered-influencer-profile",
    label: "등록 인플루언서 공개 프로필",
    path: "/creator-sora",
  },
  { id: "global-creators-en", label: "해외 크리에이터 영문", path: "/en/creators" },
  { id: "global-creators-ja", label: "해외 크리에이터 일본어", path: "/ja/creators" },
  { id: "global-creators-zh", label: "해외 크리에이터 중국어", path: "/zh/creators" },
  {
    id: "login-influencer-en",
    label: "인플루언서 영문 로그인",
    path: "/login/influencer?locale=en",
  },
  {
    id: "signup-influencer-en",
    label: "인플루언서 영문 회원가입",
    path: "/signup/influencer?locale=en",
  },
  {
    id: "login-influencer-ja",
    label: "인플루언서 일본어 로그인",
    path: "/login/influencer?locale=ja",
  },
  {
    id: "signup-influencer-ja",
    label: "인플루언서 일본어 회원가입",
    path: "/signup/influencer?locale=ja",
  },
  {
    id: "login-influencer-zh",
    label: "인플루언서 중국어 로그인",
    path: "/login/influencer?locale=zh",
  },
  {
    id: "signup-influencer-zh",
    label: "인플루언서 중국어 회원가입",
    path: "/signup/influencer?locale=zh",
  },
  { id: "admin-login", label: "운영자 로그인", path: "/admin/login" },
];

const advertiserPages = [
  { id: "dashboard", label: "광고주 1:1 계약 대시보드", path: "/advertiser/dashboard" },
  {
    id: "dashboard-progress-tab",
    label: "광고주 1:1 계약 대시보드 진행중 탭",
    path: "/advertiser/dashboard",
    action: async (page) => selectExactTab(page, ["진행중"]),
  },
  {
    id: "dashboard-closed-tab",
    label: "광고주 1:1 계약 대시보드 종료 탭",
    path: "/advertiser/dashboard",
    action: async (page) => selectExactTab(page, ["종료", "완료"]),
  },
  { id: "builder", label: "광고주 계약 작성", path: "/advertiser/builder" },
  { id: "discover", label: "인플루언서 찾기", path: "/advertiser/discover" },
  { id: "campaigns", label: "광고주 캠페인", path: "/advertiser/campaigns" },
  { id: "campaign-new", label: "캠페인 작성", path: "/advertiser/campaigns/new" },
  { id: "costs", label: "광고비 현황", path: "/advertiser/costs" },
  { id: "messages", label: "광고주 메시지", path: "/advertiser/messages" },
  { id: "verification", label: "광고주 인증", path: "/advertiser/verification" },
];

const influencerPages = [
  { id: "dashboard", label: "인플루언서 1:1 계약 대시보드", path: "/influencer/dashboard" },
  {
    id: "dashboard-progress-tab",
    label: "인플루언서 1:1 계약 대시보드 진행중 탭",
    path: "/influencer/dashboard",
    action: async (page) => selectExactTab(page, ["진행중"]),
  },
  {
    id: "dashboard-done-tab",
    label: "인플루언서 1:1 계약 대시보드 완료 탭",
    path: "/influencer/dashboard",
    action: async (page) => selectExactTab(page, ["완료"]),
  },
  { id: "brands", label: "브랜드 찾기", path: "/influencer/brands" },
  { id: "campaigns", label: "캠페인 찾기", path: "/influencer/campaigns" },
  { id: "messages", label: "인플루언서 메시지", path: "/influencer/messages" },
  { id: "verification", label: "인플루언서 인증", path: "/influencer/verification" },
  { id: "profile", label: "인플루언서 공개 프로필 관리", path: "/influencer/profile" },
];

const introSlides = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `intro-advertiser-${index + 1}`,
    label: `광고주 인트로 ${index + 1}`,
    path: "/intro/advertiser",
    action: async (page) => selectIntroSlide(page, index),
  })),
  ...Array.from({ length: 7 }, (_, index) => ({
    id: `intro-influencer-${index + 1}`,
    label: `인플루언서 인트로 ${index + 1}`,
    path: "/intro/influencer",
    action: async (page) => selectIntroSlide(page, index),
  })),
];

async function selectExactTab(page, candidates) {
  const tabs = page.locator('[role="tab"]');

  for (const label of candidates) {
    const count = await tabs.count();
    for (let index = 0; index < count; index += 1) {
      const tab = tabs.nth(index);
      const visibleLabel = (await tab.locator("span").first().textContent().catch(() => ""))
        ?.trim();
      if (visibleLabel !== label) continue;

      const element = await tab.elementHandle();
      if (!element) throw new Error(`Tab element unavailable: ${label}`);
      await tab.click({ timeout: 3000 });
      await page.waitForFunction(
        (node) => node.getAttribute("aria-selected") === "true",
        element,
        { timeout: 5000 },
      );
      if ((await tab.getAttribute("aria-selected")) !== "true") {
        throw new Error(`Tab did not become selected: ${label}`);
      }
      await page.waitForTimeout(500);
      return;
    }
  }

  throw new Error(`Exact tab not found: ${candidates.join(" or ")}`);
}

async function discoverPublicInfluencerScenario() {
  const response = await fetch(`${baseUrl}/api/marketplace/influencers`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Public influencer discovery failed (${response.status})`);
  }

  const data = await response.json();
  const profiles = Array.isArray(data.profiles) ? data.profiles : [];
  const profile = profiles.find(
    (item) => typeof item?.handle === "string" && item.handle.trim(),
  );
  if (!profile) {
    throw new Error("Public influencer discovery returned no current handle");
  }

  const handle = profile.handle.trim();
  return {
    handle,
    scenario: {
      id: "public-influencer-profile",
      label: "공개 인플루언서 프로필",
      path: `/${encodeURIComponent(handle)}`,
    },
  };
}

async function selectIntroSlide(page, index) {
  await page.waitForSelector("[data-intro-carousel-controls]", { timeout: 5000 }).catch(() => null);
  const controls = page.locator("[data-intro-carousel-controls] button");
  const target = controls.nth(index + 1);
  if ((await target.count()) > 0) {
    await target.click();
    await page.waitForTimeout(700);
  }
}

async function login(page, role) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(
    async ({ role: loginRole, email, password }) => {
      const response = await fetch(`/api/${loginRole}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({})),
      };
    },
    { role, ...credentials[role] },
  );

  if (!result.ok || result.body?.authenticated !== true) {
    throw new Error(`${role} login failed (${result.status})`);
  }
}

async function getContractSamples(page) {
  await page.goto(`${baseUrl}/advertiser/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => null);
  return page.evaluate(async () => {
    const response = await fetch("/api/contracts", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!response.ok) return {};
    const data = await response.json();
    const contracts = Array.isArray(data.contracts) ? data.contracts : [];
    const active =
      contracts.find(
        (item) =>
          item?.status !== "SIGNED" &&
          item?.evidence?.share_token_status === "active" &&
          item?.evidence?.share_token,
      ) || contracts[0];
    const signed = contracts.find((item) => item?.status === "SIGNED") || contracts[0];
    const map = (item) =>
      item
        ? {
            id: item.id,
            title: item.title,
            status: item.status,
            token: item?.evidence?.share_token,
          }
        : null;
    return { active: map(active), signed: map(signed), count: contracts.length };
  });
}

async function getCampaignSamples(page) {
  await page.goto(`${baseUrl}/advertiser/campaigns`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => null);
  return page.evaluate(async () => {
    const [campaignResponse, contractResponse, messageResponse] = await Promise.all([
      fetch("/api/advertiser/campaigns", {
        headers: { Accept: "application/json" },
        credentials: "include",
      }),
      fetch("/api/contracts", {
        headers: { Accept: "application/json" },
        credentials: "include",
      }),
      fetch("/api/marketplace/messages?role=advertiser", {
        headers: { Accept: "application/json" },
        credentials: "include",
      }),
    ]);
    if (!campaignResponse.ok || !contractResponse.ok || !messageResponse.ok) {
      throw new Error("Campaign QA data could not be loaded");
    }
    const [data, contractData, messageData] = await Promise.all([
      campaignResponse.json(),
      contractResponse.json(),
      messageResponse.json(),
    ]);
    const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    const contracts = Array.isArray(contractData.contracts)
      ? contractData.contracts
      : [];
    const threads = Array.isArray(messageData.threads) ? messageData.threads : [];
    const activityCounts = new Map();
    const addActivity = (campaignId, weight = 1) => {
      if (typeof campaignId !== "string" || !campaignId) return;
      activityCounts.set(campaignId, (activityCounts.get(campaignId) ?? 0) + weight);
    };
    for (const contract of contracts) {
      addActivity(contract?.campaign?.id ?? contract?.campaign_id, 2);
    }
    for (const thread of threads) {
      addActivity(thread?.campaignId, 1);
    }
    const pickMostPopulated = (status) =>
      campaigns
        .filter((item) => item?.status === status && item?.id)
        .sort((left, right) => {
          const scoreDifference =
            (activityCounts.get(right.id) ?? 0) -
            (activityCounts.get(left.id) ?? 0);
          if (scoreDifference !== 0) return scoreDifference;
          return String(left.title ?? "").localeCompare(String(right.title ?? ""), "ko");
        })[0];
    const map = (item) =>
      item?.id
        ? {
            id: item.id,
            title: item.title,
            status: item.status,
            activityCount: activityCounts.get(item.id) ?? 0,
          }
        : null;
    const samples = {
      recruiting: map(pickMostPopulated("open")),
      progress: map(pickMostPopulated("closed")),
      ended: map(pickMostPopulated("ended")),
      count: campaigns.length,
    };
    for (const key of ["recruiting", "progress", "ended"]) {
      if (!samples[key]) throw new Error(`Missing ${key} campaign QA data`);
    }
    return samples;
  });
}

async function waitForStableScreen(page) {
  const loadingPatterns = [
    "불러오는 중",
    "확인하는 중",
    "준비하는 중",
    "잠시만 기다려 주세요",
  ];
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (!loadingPatterns.some((pattern) => text.includes(pattern))) return;
    await page.waitForTimeout(250);
  }
}

function toUrl(routePath) {
  return routePath.startsWith("http") ? routePath : `${baseUrl}${routePath}`;
}

async function captureScenario({ page, viewport, role, scenario }) {
  const url = toUrl(scenario.path);
  const startedAt = Date.now();
  const result = {
    id: scenario.id,
    role,
    label: scenario.label,
    path: redactUrlForReport(scenario.path),
    url: redactUrlForReport(url),
    viewport: viewport.key,
    viewportLabel: viewport.label,
    ok: false,
    error: null,
    screenshot: null,
    metrics: null,
  };

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => null);
    await waitForStableScreen(page);
    await page.waitForTimeout(300);
    if (scenario.action) {
      await scenario.action(page);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => null);
      await waitForStableScreen(page);
    }

    const fileName = `${viewport.key}-${role}-${scenario.id}.png`;
    const filePath = path.join(outputRoot, "screenshots", fileName);
    await page.screenshot({ path: filePath, fullPage: false });
    result.screenshot = path.relative(outputRoot, filePath).replace(/\\/g, "/");
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const bodyText = document.body.innerText || "";
      const visibleNodes = Array.from(
        document.querySelectorAll("button,a,input,textarea,select,[role='button'],[role='tab']"),
      )
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return {
            tag: node.tagName.toLowerCase(),
            text: (node.innerText || node.getAttribute("aria-label") || node.getAttribute("placeholder") || "")
              .trim()
              .slice(0, 80),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none" &&
              rect.bottom >= 0 &&
              rect.right >= 0 &&
              rect.top <= window.innerHeight &&
              rect.left <= window.innerWidth,
          };
        })
        .filter((item) => item.visible);
      const badWords = [
        "404",
        "찾을 수 없습니다",
        "오류가 발생",
        "Error",
        "Not found",
        "undefined",
        "NaN",
      ].filter((word) => bodyText.includes(word));
      return {
        title: document.title,
        location: window.location.pathname + window.location.search,
        textLength: bodyText.trim().length,
        badWords,
        overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
        overflowY: Math.max(0, doc.scrollHeight - doc.clientHeight),
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
        interactiveCount: visibleNodes.length,
        firstInteractive: visibleNodes.slice(0, 12),
        selectedTabs: Array.from(
          document.querySelectorAll('[role="tab"][aria-selected="true"]'),
        ).map((tab) => (tab.querySelector("span")?.textContent || tab.textContent || "").trim()),
      };
    });
    metrics.location = redactUrlForReport(metrics.location);
    result.metrics = metrics;
    result.durationMs = Date.now() - startedAt;
    result.ok = true;
  } catch (error) {
    result.error = redactSensitiveText(
      error instanceof Error ? error.message : String(error),
    );
  }

  return result;
}

async function runForViewport(browser, viewport, resolvedPublicPages) {
  const viewportDir = path.join(outputRoot, "screenshots");
  await fs.mkdir(viewportDir, { recursive: true });
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    locale: "ko-KR",
  };

  const publicContext = await browser.newContext(contextOptions);
  const publicPage = await publicContext.newPage();

  const advertiserContext = await browser.newContext(contextOptions);
  const advertiserPage = await advertiserContext.newPage();
  const influencerContext = await browser.newContext(contextOptions);
  const influencerPage = await influencerContext.newPage();

  const results = [];
  const dynamicPublicPages = [];
  const dynamicAdvertiserPages = [...advertiserPages];
  const dynamicInfluencerPages = [...influencerPages];

  try {
    await login(advertiserPage, "advertiser");
    await login(influencerPage, "influencer");

    const contractSamples = await getContractSamples(advertiserPage).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    const campaignSamples = await getCampaignSamples(advertiserPage);
    if (contractSamples.active?.id) {
      dynamicAdvertiserPages.push({
        id: "contract-detail-active",
        label: "광고주 계약 상세",
        path: `/advertiser/contract/${contractSamples.active.id}`,
      });
      if (contractSamples.active.token) {
        dynamicPublicPages.push({
          id: "share-contract-active",
          label: "공유 계약 링크",
          path: `/contract/${contractSamples.active.id}?token=${encodeURIComponent(
            contractSamples.active.token,
          )}`,
        });
      }
    }
    if (contractSamples.signed?.id) {
      dynamicAdvertiserPages.push({
        id: "contract-detail-signed",
        label: "광고주 서명 완료 계약 상세",
        path: `/advertiser/contract/${contractSamples.signed.id}`,
      });
      dynamicInfluencerPages.push({
        id: "contract-detail-signed",
        label: "인플루언서 서명 완료 계약 상세",
        path: `/contract/${contractSamples.signed.id}`,
      });
    }

    for (const [key, label] of [
      ["recruiting", "모집중"],
      ["progress", "진행중"],
      ["ended", "종료"],
    ]) {
      const campaign = campaignSamples[key];
      if (!campaign?.id) continue;
      dynamicAdvertiserPages.push({
        id: `campaign-detail-${key}`,
        label: `광고주 캠페인 ${label} 상세`,
        path: `/advertiser/campaigns?campaign=${encodeURIComponent(`campaign:${campaign.id}`)}`,
      });
    }

    if (campaignSamples.recruiting?.id) {
      dynamicPublicPages.push({
        id: "public-campaign-detail",
        label: "공개 캠페인 상세",
        path: `/campaigns/${encodeURIComponent(campaignSamples.recruiting.id)}`,
      });
    }

    for (const scenario of [...resolvedPublicPages, ...introSlides, ...dynamicPublicPages]) {
      results.push(await captureScenario({ page: publicPage, viewport, role: "public", scenario }));
    }
    for (const scenario of dynamicAdvertiserPages) {
      results.push(await captureScenario({ page: advertiserPage, viewport, role: "advertiser", scenario }));
    }
    for (const scenario of dynamicInfluencerPages) {
      results.push(await captureScenario({ page: influencerPage, viewport, role: "influencer", scenario }));
    }
  } finally {
    await publicContext.close();
    await advertiserContext.close();
    await influencerContext.close();
  }

  return results;
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const publicInfluencer = await discoverPublicInfluencerScenario();
  const resolvedPublicPages = [...publicPages, publicInfluencer.scenario];
  const browser = await launchBrowser();
  const allResults = [];

  try {
    for (const viewport of viewports) {
      const results = await runForViewport(browser, viewport, resolvedPublicPages);
      allResults.push(...results);
    }
  } finally {
    await browser.close();
  }

  const summary = {
    baseUrl: redactUrlForReport(baseUrl),
    outputRoot,
    publicInfluencerHandle: publicInfluencer.handle,
    createdAt: new Date().toISOString(),
    total: allResults.length,
    passed: allResults.filter((item) => item.ok).length,
    failed: allResults.filter((item) => !item.ok).length,
    screenshots: allResults.filter((item) => item.screenshot).length,
    results: allResults,
  };

  await fs.writeFile(path.join(outputRoot, "capture-results.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    redactSensitiveText(
      error instanceof Error ? error.stack || error.message : String(error),
    ),
  );
  process.exitCode = 1;
});
