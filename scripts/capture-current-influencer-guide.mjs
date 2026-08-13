import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.SALES_CAPTURE_BASE_URL || "https://yeollock.me").replace(/\/$/, "");
const influencerEmail = process.env.QA_INFLUENCER_EMAIL || "creator.sora@yeollock.me";
const influencerPassword = process.env.QA_TEST_PASSWORD || "YeollockTest!2026";
const outDir = path.resolve("public/guide/influencer/assets");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dateOnly = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const isoAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const campaignThumbs = {
  workspace: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8fafc"/><stop offset="1" stop-color="#e8f3ee"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><rect x="160" y="120" width="590" height="350" rx="28" fill="#fff" stroke="#d7dee4" stroke-width="7"/><rect x="205" y="165" width="500" height="255" rx="16" fill="#f5f7f8"/><rect x="245" y="205" width="170" height="125" rx="14" fill="#dbe8e4"/><circle cx="350" cy="250" r="26" fill="#fff"/><path d="M250 325l64-60 54 45 46-38 92 58H250z" fill="#b6cbc5"/><rect x="455" y="215" width="205" height="16" rx="8" fill="#cfd7db"/><rect x="455" y="255" width="170" height="14" rx="7" fill="#dfe4e7"/><rect x="455" y="290" width="195" height="14" rx="7" fill="#dfe4e7"/><rect x="455" y="345" width="150" height="14" rx="7" fill="#dfe4e7"/><path d="M235 470h445l70 55H165z" fill="#1f2937"/><rect x="790" y="165" width="230" height="250" rx="34" fill="#fff" stroke="#d7dee4" stroke-width="6"/><path d="M865 235l78 0 0 25-78 0zM865 290l110 0 0 18-110 0zM865 330l95 0 0 18-95 0z" fill="#d2d8dc"/><path d="M895 215l25-32 21 17-25 32z" fill="#111827"/><rect x="820" y="455" width="270" height="90" rx="24" fill="#fff" stroke="#d7dee4" stroke-width="6"/><circle cx="865" cy="500" r="20" fill="#fda4af"/><rect x="905" y="482" width="125" height="14" rx="7" fill="#d7dde0"/><rect x="905" y="510" width="90" height="12" rx="6" fill="#e2e6e8"/></svg>`),
  bakery: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff7ed"/><stop offset="1" stop-color="#d9a96e"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><rect y="430" width="1200" height="245" fill="#9a633c"/><ellipse cx="365" cy="430" rx="255" ry="92" fill="#b97a47"/><path d="M150 392c42-105 137-154 224-120 68 27 100 92 82 160-104 28-204 17-306-40z" fill="#e4a34f"/><path d="M215 365c35-80 98-116 162-94 44 15 72 52 78 95-82 25-160 24-240-1z" fill="#f0c36d"/><ellipse cx="575" cy="410" rx="118" ry="85" fill="#e6a348"/><path d="M520 408c17-58 46-90 78-89 34 2 58 37 69 92-49 25-98 24-147-3z" fill="#f5c67c"/><ellipse cx="750" cy="445" rx="138" ry="73" fill="#f0c06a"/><circle cx="720" cy="430" r="18" fill="#ef4444"/><circle cx="775" cy="420" r="18" fill="#f59e0b"/><rect x="878" y="290" width="165" height="265" rx="28" fill="#111827" transform="rotate(-8 960 420)"/><rect x="897" y="320" width="127" height="180" rx="17" fill="#f8fafc" transform="rotate(-8 960 410)"/><circle cx="958" cy="525" r="13" fill="#ef4444"/><rect x="80" y="520" width="310" height="110" rx="16" fill="#fff"/><path d="M118 548h230M118 578h190M118 608h150" stroke="#d1d5db" stroke-width="12" stroke-linecap="round"/><path d="M425 565l150 50" stroke="#374151" stroke-width="14" stroke-linecap="round"/></svg>`),
  serum: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#effcf9"/><stop offset="1" stop-color="#b9e8df"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><circle cx="915" cy="140" r="190" fill="#fff" opacity=".52"/><circle cx="300" cy="520" r="240" fill="#d4f4ed"/><path d="M190 135c150 55 250 126 300 225-118-21-232-83-300-225zM1000 390c-143 2-244 45-307 129 120 12 228-30 307-129z" fill="#42a77d" opacity=".7"/><rect x="515" y="155" width="245" height="390" rx="58" fill="#e7fffb" stroke="#8fd7cc" stroke-width="9"/><rect x="555" y="88" width="165" height="105" rx="25" fill="#fff"/><rect x="603" y="45" width="70" height="80" rx="30" fill="#fff"/><rect x="562" y="275" width="150" height="170" rx="28" fill="#9ce4da" opacity=".55"/><circle cx="606" cy="335" r="15" fill="#fff" opacity=".75"/><circle cx="670" cy="390" r="11" fill="#fff" opacity=".75"/><rect x="160" y="205" width="210" height="380" rx="36" fill="#111827" transform="rotate(-7 265 395)"/><rect x="183" y="248" width="164" height="265" rx="22" fill="#eefcf9" transform="rotate(-7 265 380)"/><circle cx="260" cy="545" r="16" fill="#ef4444"/><circle cx="860" cy="505" r="38" fill="#fff" opacity=".65"/><circle cx="940" cy="555" r="25" fill="#fff" opacity=".65"/></svg>`),
  hotel: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#bfe0fa"/><stop offset="1" stop-color="#eef7fd"/></linearGradient></defs><rect width="1200" height="675" fill="#f3eee8"/><rect x="585" y="55" width="550" height="415" rx="12" fill="url(#sky)" stroke="#cbd5e1" stroke-width="10"/><path d="M610 408h500V260l-64 35-66-60-82 90-67-45-87 93-72-65-62 57z" fill="#9ab0be"/><rect x="755" y="250" width="62" height="158" fill="#8097a6"/><rect x="935" y="225" width="78" height="183" fill="#718a9a"/><rect x="1040" y="300" width="46" height="108" fill="#8ea5b2"/><path d="M882 120v175M862 178h40" stroke="#64748b" stroke-width="12"/><rect x="90" y="345" width="650" height="235" rx="34" fill="#fff"/><rect x="135" y="305" width="230" height="92" rx="32" fill="#fdfdfd"/><rect x="385" y="325" width="250" height="75" rx="28" fill="#fcfcfc"/><rect x="120" y="530" width="620" height="65" rx="26" fill="#e6ded6"/><circle cx="785" cy="520" r="62" fill="#d7c3a9"/><rect x="765" y="445" width="40" height="115" rx="18" fill="#d7c3a9"/><rect x="235" y="205" width="150" height="160" rx="38" fill="#111827" transform="rotate(-7 310 285)"/><circle cx="310" cy="285" r="48" fill="#334155"/><circle cx="310" cy="285" r="27" fill="#94a3b8"/><rect x="298" y="350" width="24" height="145" rx="10" fill="#111827"/></svg>`),
};

const guideExamples = [
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
    thumbnailUrl: campaignThumbs.bakery,
  },
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
    thumbnailUrl: campaignThumbs.serum,
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
    thumbnailUrl: campaignThumbs.hotel,
  },
];

let realCampaignId;
let realCampaignTitle;

function makeGuideCampaign(example, index, sample = {}) {
  const id = `guide-example-campaign-${index + 1}`;
  return {
    ...sample,
    id,
    brandId: `guide-example-brand-${index + 1}`,
    brandHandle: `guide-example-brand-${index + 1}`,
    brandName: example.brandName,
    brandCategory: example.brandCategory,
    brandHeadline: `${example.brandCategory} 브랜드 캠페인 예시`,
    brandLocation: "대한민국",
    brandLogoLabel: example.brandName.slice(0, 1),
    brandLogoUrl: undefined,
    brandHref: `/brands/guide-example-brand-${index + 1}`,
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
    thumbnailUrl: example.thumbnailUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeApplicationThread({ id, status, example, daysAgo }) {
  return {
    id,
    bucket: "sent",
    direction: "influencer_to_brand",
    status,
    unread: false,
    senderName: "소라",
    senderIntro: "라이프스타일 크리에이터",
    targetName: example.brandName,
    targetHandle: `guide-${id}`,
    counterpartName: example.brandName,
    counterpartAvatarLabel: example.brandName.slice(0, 1),
    counterpartIntro: `${example.brandCategory} 브랜드`,
    platforms: example.platforms.map((platform, index) => ({
      platform,
      label: example.platformLabels[index] ?? example.platformLabels[0],
    })),
    proposalType: example.type,
    proposalTypeLabel: example.typeLabel,
    proposalSummary: `${example.title} 캠페인에 신청했습니다.`,
    campaignId: `guide-applied-${id}`,
    campaignTitle: example.title,
    createdAt: isoAgo(daysAgo),
    updatedAt: isoAgo(Math.max(0, daysAgo - 1)),
  };
}

async function installGuideRoutes(page) {
  await page.route("**/api/marketplace/campaign-applications?role=influencer**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const threads = [
      makeApplicationThread({ id: "serum", status: "submitted", example: guideExamples[1], daysAgo: 1 }),
      makeApplicationThread({ id: "bakery", status: "reviewed", example: guideExamples[0], daysAgo: 2 }),
      makeApplicationThread({ id: "hotel", status: "submitted", example: guideExamples[2], daysAgo: 3 }),
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        role: "influencer",
        threads,
        summary: {
          inboxCount: 0,
          sentCount: threads.length,
          unreadCount: 0,
          submittedCount: 2,
          reviewedCount: 1,
          acceptedCount: 0,
          declinedCount: 0,
          convertedCount: 0,
          closedCount: 0,
        },
      }),
    });
  });

  await page.route("**/api/marketplace/campaigns**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || url.pathname !== "/api/marketplace/campaigns") {
      return route.continue();
    }

    const response = await route.fetch();
    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload.campaigns)) {
      return route.fulfill({ response });
    }

    const real =
      payload.campaigns.find((campaign) =>
        /연락미/.test(`${campaign?.brandName ?? ""} ${campaign?.title ?? ""}`),
      ) ?? payload.campaigns[0];

    if (!real?.id) {
      throw new Error("가이드에 사용할 실제 연락미 모집 캠페인을 찾지 못했습니다.");
    }

    realCampaignId = String(real.id);
    realCampaignTitle = String(real.title ?? "");

    const realForCapture = {
      ...real,
      thumbnailUrl: campaignThumbs.workspace,
    };
    const examples = guideExamples.map((example, index) =>
      makeGuideCampaign(example, index, real),
    );

    await route.fulfill({
      response,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ...payload, campaigns: [realForCapture, ...examples] }),
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
  await wait(500);
  const skip = page.getByRole("button", { name: "건너뛰기" });
  if (await skip.first().isVisible().catch(() => false)) {
    await skip.first().click().catch(() => null);
    await wait(250);
  }
}

async function capture(page, filename) {
  await page.screenshot({ path: path.join(outDir, filename), fullPage: false });
}

async function assertTextAbsent(page, text) {
  const body = await page.locator("body").innerText().catch(() => "");
  if (body.includes(text)) throw new Error(`capture contains forbidden text: ${text}`);
}

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  await installGuideRoutes(page);
  await login(page);

  await page.goto(`${baseUrl}/influencer/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await page.getByText("1:1 계약", { exact: false }).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => null);
  await capture(page, "yeollock-influencer-dashboard-current-v1.png");

  await page.goto(`${baseUrl}/influencer/campaigns`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await page.locator('[data-campaign-layout]').first().waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("신제품 베이커리 네이버 블로그 리뷰", { exact: false }).first().waitFor({ state: "visible", timeout: 30000 });
  if (!realCampaignId || !realCampaignTitle) throw new Error("실제 연락미 캠페인 ID를 확인하지 못했습니다.");
  await capture(page, "yeollock-influencer-campaigns-current-v1.png");

  await page.goto(`${baseUrl}/campaigns/${encodeURIComponent(realCampaignId)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await page.getByText(realCampaignTitle, { exact: false }).first().waitFor({ state: "visible", timeout: 30000 });
  await assertTextAbsent(page, "Campaign not found");
  await assertTextAbsent(page, "모집글을 불러오지 못했습니다");
  await capture(page, "yeollock-influencer-campaign-detail-current-v1.png");

  await page.goto(`${baseUrl}/influencer/campaigns?view=applied`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page);
  await page.getByText("여름 진정 세럼 인스타 릴스 체험단", { exact: false }).first().waitFor({ state: "visible", timeout: 30000 });
  await page.getByText(/신청 완료|검토 중/, { exact: false }).first().waitFor({ state: "visible", timeout: 30000 });
  await assertTextAbsent(page, "신청한 캠페인을 불러오는 중");
  await capture(page, "yeollock-influencer-applied-current-v1.png");

  console.log(JSON.stringify({
    ok: true,
    production: baseUrl,
    realCampaignId,
    realCampaignTitle,
    openCampaignCards: [realCampaignTitle, ...guideExamples.map((campaign) => campaign.title)],
    appliedCampaigns: guideExamples.map((campaign) => campaign.title),
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
