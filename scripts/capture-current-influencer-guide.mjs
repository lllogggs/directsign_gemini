import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.SALES_CAPTURE_BASE_URL || "https://yeollock.me").replace(/\/$/, "");
const influencerEmail = process.env.QA_INFLUENCER_EMAIL || "creator.sora@yeollock.me";
const influencerPassword = process.env.QA_TEST_PASSWORD || "YeollockTest!2026";
const outDir = path.resolve("public/guide/influencer/assets");
const fallbackCampaignId = "e8015400-9a61-48a0-8160-950accdede7a";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dateOnly = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const exampleCampaigns = [
  {
    brandName: "오브제랩",
    brandCategory: "뷰티",
    title: "여름 진정 세럼 인스타 릴스 체험단",
    type: "experience_group",
    typeLabel: "체험단",
    budget: "150,000원 + 제품 제공",
    applicantLimit: "20명",
    summary: "민감 피부도 가볍게 사용할 수 있는 진정 세럼을 직접 사용하고 릴스로 소개해 주세요.",
    mission: "사용 전후 느낌과 제형을 자연광에서 보여주고, 실제 사용 후기를 본인 말투로 담아 주세요.",
    platforms: ["instagram"],
    platformLabels: ["인스타그램"],
    deliverables: ["Instagram Reel 1건", "Story 2건"],
    eligibilityRules: [{ platform: "instagram", metric: "followers", minimum: 3000 }],
    applicationCount: 47,
    deadlineOffset: 6,
    uploadOffset: 18,
  },
  {
    brandName: "모노트립",
    brandCategory: "여행",
    title: "서울 호캉스 유튜브 브이로그 모집",
    type: "sponsored_post",
    typeLabel: "유료 광고",
    budget: "500,000원 + 숙박 제공",
    applicantLimit: "8명",
    summary: "서울 도심 호텔의 객실·조식·부대시설을 브이로그 형식으로 소개하는 캠페인입니다.",
    mission: "체크인부터 조식까지 실제 동선을 담고 장점과 아쉬운 점을 솔직하게 소개해 주세요.",
    platforms: ["youtube"],
    platformLabels: ["유튜브"],
    deliverables: ["YouTube 영상 1건", "Shorts 1건"],
    eligibilityRules: [{ platform: "youtube", metric: "subscribers", minimum: 5000 }],
    applicationCount: 21,
    deadlineOffset: 9,
    uploadOffset: 28,
  },
  {
    brandName: "브레드룸",
    brandCategory: "푸드",
    title: "신제품 베이커리 네이버 블로그 리뷰",
    type: "visit_review",
    typeLabel: "방문 리뷰",
    budget: "80,000원 + 5만원 이용권",
    applicantLimit: "15명",
    summary: "신제품과 매장 분위기를 직접 경험하고 사진 중심의 블로그 리뷰를 작성해 주세요.",
    mission: "메뉴 3종 이상과 매장 전경을 촬영하고 검색 유입에 도움이 되는 상세 후기를 작성해 주세요.",
    platforms: ["naver_blog"],
    platformLabels: ["네이버 블로그"],
    deliverables: ["블로그 포스팅 1건", "사진 12장 이상"],
    eligibilityRules: [{ platform: "naver_blog", metric: "average_daily_visitors_4d", minimum: 300 }],
    applicationCount: 63,
    deadlineOffset: 4,
    uploadOffset: 14,
  },
  {
    brandName: "핏데이",
    brandCategory: "헬스",
    title: "홈트 기구 틱톡 숏폼 챌린지",
    type: "product_seeding",
    typeLabel: "제품 협찬",
    budget: "제품 제공 + 120,000원",
    applicantLimit: "12명",
    summary: "집에서 따라 하기 쉬운 운동 루틴과 함께 홈트 기구 사용 장면을 숏폼으로 제작해 주세요.",
    mission: "15~30초 안에 핵심 사용법이 보이도록 구성하고 직접 운동하는 장면을 포함해 주세요.",
    platforms: ["tiktok", "instagram"],
    platformLabels: ["틱톡", "인스타그램"],
    deliverables: ["TikTok 또는 Reel 1건"],
    eligibilityRules: [{ platform: "instagram", metric: "followers", minimum: 2000 }],
    applicationCount: 35,
    deadlineOffset: 11,
    uploadOffset: 24,
  },
  {
    brandName: "스튜디오 문",
    brandCategory: "리빙",
    title: "무선 조명 신제품 크리에이터 서포터즈",
    type: "supporters",
    typeLabel: "서포터즈",
    budget: "제품 제공 + 월 200,000원",
    applicantLimit: "10명",
    summary: "한 달 동안 무선 조명을 활용한 공간 스타일링 콘텐츠를 제작하는 서포터즈입니다.",
    mission: "거실·침실 등 서로 다른 공간에서 활용한 모습과 실제 사용 팁을 소개해 주세요.",
    platforms: ["instagram", "naver_blog"],
    platformLabels: ["인스타그램", "네이버 블로그"],
    deliverables: ["Reel 2건", "사진 피드 2건"],
    eligibilityRules: [{ platform: "instagram", metric: "followers", minimum: 5000 }],
    applicationCount: 18,
    deadlineOffset: 13,
    uploadOffset: 35,
  },
];

function makeExampleCampaign(example, index, sample = {}) {
  const id = `guide-example-campaign-${index + 1}`;
  return {
    ...sample,
    id,
    brandId: `guide-example-brand-${index + 1}`,
    brandHandle: `guide-example-brand-${index + 1}`,
    brandName: example.brandName,
    brandCategory: example.brandCategory,
    brandHeadline: `${example.brandCategory} 브랜드 공식 캠페인 예시`,
    brandLocation: "대한민국",
    brandLogoLabel: example.brandName.slice(0, 1),
    brandHref: "#",
    title: example.title,
    type: example.type,
    typeLabel: example.typeLabel,
    budget: example.budget,
    applicantLimit: example.applicantLimit,
    location: "대한민국",
    summary: example.summary,
    mission: example.mission,
    deadline: dateOnly(example.deadlineOffset),
    uploadDeadline: dateOnly(example.uploadOffset),
    deadlineLabel: `D-${example.deadlineOffset}`,
    platforms: example.platforms,
    platformLabels: example.platformLabels,
    deliverables: example.deliverables,
    eligibilityRules: example.eligibilityRules,
    targetCountries: ["south_korea"],
    status: "open",
    acceptsApplications: true,
    applicationCount: example.applicationCount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function installCampaignExamples(page) {
  await page.route("**/api/marketplace/campaigns**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET" || /\/applications(?:\?|$)/.test(request.url())) {
      return route.continue();
    }

    const response = await route.fetch();
    let payload;
    try {
      payload = await response.json();
    } catch {
      return route.fulfill({ response });
    }

    const locate = () => {
      if (Array.isArray(payload)) return { owner: null, key: null, list: payload };
      for (const key of ["campaigns", "posts", "items", "data"]) {
        if (Array.isArray(payload?.[key])) return { owner: payload, key, list: payload[key] };
      }
      return null;
    };

    const target = locate();
    if (!target) return route.fulfill({ response });
    const sample = target.list[0] ?? {};
    const examples = exampleCampaigns.map((item, index) => makeExampleCampaign(item, index, sample));
    const list = [...examples, ...target.list.filter((item) => !String(item?.id ?? "").startsWith("guide-example-"))];
    const nextPayload = target.owner ? { ...payload, [target.key]: list } : list;

    await route.fulfill({
      response,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(nextPayload),
    });
  });
}

async function login(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const result = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/influencer/login", {
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
  }, { email: influencerEmail, password: influencerPassword });

  if (!result.ok || result.body?.authenticated !== true) {
    throw new Error(`influencer login failed (${result.status})`);
  }
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => null);
  await wait(800);
  const skip = page.getByRole("button", { name: "건너뛰기" });
  if (await skip.first().isVisible().catch(() => false)) {
    await skip.first().click().catch(() => null);
    await wait(350);
  }
}

async function capture(page, filename) {
  await page.screenshot({ path: path.join(outDir, filename), fullPage: false });
}

async function findCampaignHref(page) {
  const href = await page
    .locator('a[href^="/campaigns/"]:not([href*="guide-example"])')
    .first()
    .getAttribute("href")
    .catch(() => null);
  return href || `/campaigns/${fallbackCampaignId}`;
}

async function addExampleConditionPanel(page) {
  const example = exampleCampaigns[0];
  await page.evaluate(({ example, deadline, uploadDeadline }) => {
    const old = document.querySelector("[data-guide-example-condition-panel]");
    if (old) old.remove();
    const main = document.querySelector("main") ?? document.body;
    const panel = document.createElement("section");
    panel.setAttribute("data-guide-example-condition-panel", "true");
    panel.style.cssText = [
      "position:fixed",
      "right:28px",
      "top:86px",
      "z-index:40",
      "width:430px",
      "max-height:760px",
      "overflow:hidden",
      "border:1px solid #e5e7eb",
      "border-radius:16px",
      "background:#fff",
      "box-shadow:0 22px 60px rgba(15,23,42,.18)",
      "font-family:inherit",
      "color:#111827",
    ].join(";");
    const row = (label, value) => `<div style="display:grid;grid-template-columns:94px 1fr;gap:14px;padding:11px 0;border-top:1px solid #f0f1f3"><b style="font-size:12px;color:#6b7280">${label}</b><span style="font-size:13px;font-weight:700;line-height:1.55">${value}</span></div>`;
    panel.innerHTML = `
      <div style="padding:20px 22px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="display:inline-flex;padding:5px 8px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:10px;font-weight:900">가이드 예시</span>
          <span style="font-size:11px;font-weight:800;color:#9ca3af">실제 화면 구성 예시</span>
        </div>
        <h2 style="margin:12px 0 5px;font-size:21px;line-height:1.35">${example.title}</h2>
        <div style="font-size:12px;font-weight:800;color:#6b7280">${example.brandName} · ${example.typeLabel}</div>
      </div>
      <div style="padding:0 22px 18px">
        ${row("제공/보상", example.budget)}
        ${row("모집 인원", example.applicantLimit)}
        ${row("플랫폼", example.platformLabels.join(" · "))}
        ${row("신청 마감", deadline)}
        ${row("업로드", uploadDeadline)}
        ${row("지원 조건", "인스타그램 팔로워 3,000명 이상")}
        ${row("제작 콘텐츠", example.deliverables.join(" · "))}
        ${row("캠페인 안내", example.summary)}
        ${row("미션", example.mission)}
      </div>
    `;
    main.appendChild(panel);
  }, { example, deadline: dateOnly(example.deadlineOffset), uploadDeadline: dateOnly(example.uploadOffset) });
  await wait(250);
}

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  await installCampaignExamples(page);
  await login(page);

  await page.goto(`${baseUrl}/influencer/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await page.getByText("1:1 계약", { exact: false }).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => null);
  await capture(page, "yeollock-influencer-dashboard-current-v1.png");

  await page.goto(`${baseUrl}/influencer/campaigns`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await page.locator('[data-campaign-layout]').first().waitFor({ state: "visible", timeout: 30000 }).catch(() => null);
  await capture(page, "yeollock-influencer-campaigns-current-v1.png");

  const campaignHref = await findCampaignHref(page);
  await page.goto(new URL(campaignHref, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await addExampleConditionPanel(page);
  await capture(page, "yeollock-influencer-campaign-detail-current-v1.png");

  await page.goto(`${baseUrl}/influencer/campaigns`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  const appliedButton = page.getByRole("button", { name: /신청한 캠페인/ }).first();
  if (await appliedButton.isVisible().catch(() => false)) {
    await appliedButton.click();
  } else {
    const appliedText = page.getByText(/신청한 캠페인/, { exact: false }).first();
    if (await appliedText.isVisible().catch(() => false)) await appliedText.click();
  }
  await wait(900);
  await capture(page, "yeollock-influencer-applied-current-v1.png");

  console.log(JSON.stringify({
    ok: true,
    production: baseUrl,
    campaignHref,
    examples: exampleCampaigns.map((campaign) => campaign.title),
    outputs: [
      "public/guide/influencer/assets/yeollock-influencer-dashboard-current-v1.png",
      "public/guide/influencer/assets/yeollock-influencer-campaigns-current-v1.png",
      "public/guide/influencer/assets/yeollock-influencer-campaign-detail-current-v1.png",
      "public/guide/influencer/assets/yeollock-influencer-applied-current-v1.png"
    ]
  }, null, 2));
} finally {
  await browser.close();
}
