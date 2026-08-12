import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.SALES_CAPTURE_BASE_URL || "https://yeollock.me").replace(/\/$/, "");
const advertiserEmail = process.env.SALES_CAPTURE_ADVERTISER_EMAIL || "breadroom.manager@yeollock.me";
const advertiserPassword = process.env.QA_TEST_PASSWORD || "YeollockTest!2026";
const outDir = path.resolve("public/guide/assets");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const discoveryProfiles = [
  {
    id: "guide-minseo-home", handle: "minseo-home", displayName: "민서홈", headline: "리빙과 일상을 기록합니다", bio: "", location: "서울", avatarLabel: "민", avatarUrl: "/images/influencers/minseo-home.png", categories: ["living"], audience: "", audienceCountries: ["south_korea"], audienceTags: [],
    platforms: [{ platform: "naver_blog", label: "네이버 블로그", handle: "minseo_home", url: "https://blog.naver.com/", followersLabel: "일 방문자 1,240", performanceLabel: "", ownershipStatus: "verified", naverInfluencer: true }],
    collaborationTypes: ["experience_group"], startingPriceLabel: "", responseTimeLabel: "", verifiedLabel: "", brandFit: [], recentBrands: [], portfolio: [], proposalHints: [], source: "registered", platformVerified: true, publicProfilePublished: true, publicProfileHandle: "minseo-home"
  },
  {
    id: "guide-today-taste", handle: "today-taste", displayName: "오늘의맛", headline: "맛집과 식품 리뷰", bio: "", location: "서울", avatarLabel: "오", avatarUrl: "/images/influencers/today-taste.png", categories: ["food"], audience: "", audienceCountries: ["south_korea"], audienceTags: [],
    platforms: [{ platform: "instagram", label: "인스타그램", handle: "today_taste", url: "https://www.instagram.com/", followersLabel: "18.4K", performanceLabel: "", ownershipStatus: "verified" }],
    collaborationTypes: ["sponsored_post"], startingPriceLabel: "", responseTimeLabel: "", verifiedLabel: "", brandFit: [], recentBrands: [], portfolio: [], proposalHints: [], source: "registered", platformVerified: true, publicProfilePublished: true, publicProfileHandle: "today-taste"
  },
  {
    id: "guide-haru-fit", handle: "haru-fit", displayName: "하루핏", headline: "운동과 건강 콘텐츠", bio: "", location: "경기", avatarLabel: "하", avatarUrl: "/images/influencers/haru-fit.png", categories: ["fitness"], audience: "", audienceCountries: ["south_korea"], audienceTags: [],
    platforms: [{ platform: "youtube", label: "유튜브", handle: "harufit", url: "https://www.youtube.com/", followersLabel: "32.1K", performanceLabel: "", ownershipStatus: "verified" }],
    collaborationTypes: ["ppl"], startingPriceLabel: "", responseTimeLabel: "", verifiedLabel: "", brandFit: [], recentBrands: [], portfolio: [], proposalHints: [], source: "registered", platformVerified: true, publicProfilePublished: true, publicProfileHandle: "haru-fit"
  },
  {
    id: "guide-luna-day", handle: "luna-day", displayName: "루나데이", headline: "뷰티 리뷰", bio: "", location: "서울", avatarLabel: "루", avatarUrl: "/images/influencers/luna-day.png", categories: ["beauty"], audience: "", audienceCountries: ["south_korea"], audienceTags: [],
    platforms: [{ platform: "tiktok", label: "틱톡", handle: "lunaday", url: "https://www.tiktok.com/", followersLabel: "24.7K", performanceLabel: "", ownershipStatus: "verified" }],
    collaborationTypes: ["product_seeding"], startingPriceLabel: "", responseTimeLabel: "", verifiedLabel: "", brandFit: [], recentBrands: [], portfolio: [], proposalHints: [], source: "registered", platformVerified: true, publicProfilePublished: true, publicProfileHandle: "luna-day"
  }
];

async function login(page) {
  await page.goto(`${baseUrl}/login/advertiser`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const result = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/advertiser/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
  }, { email: advertiserEmail, password: advertiserPassword });
  if (!result.ok || result.body?.authenticated !== true) throw new Error(`advertiser login failed (${result.status})`);

  const accountId = await page.evaluate(async () => {
    const response = await fetch("/api/advertiser/session", { headers: { Accept: "application/json" }, credentials: "include" });
    const body = await response.json().catch(() => ({}));
    return body?.user?.id || body?.account?.id || null;
  });
  if (accountId) {
    await page.evaluate((id) => localStorage.setItem(`yeollock:product-tour:advertiser:${encodeURIComponent(id)}:influencer-discovery:v1`, "seen"), accountId);
  }
}

async function findCampaignWithApplicants(page) {
  return page.evaluate(async () => {
    const [campaignResponse, applicationResponse] = await Promise.all([
      fetch("/api/advertiser/campaigns", { headers: { Accept: "application/json" }, credentials: "include" }),
      fetch("/api/marketplace/campaign-applications?role=advertiser", { headers: { Accept: "application/json" }, credentials: "include" }),
    ]);
    const campaignData = await campaignResponse.json().catch(() => ({}));
    const applicationData = await applicationResponse.json().catch(() => ({}));
    const campaigns = Array.isArray(campaignData?.campaigns) ? campaignData.campaigns : [];
    const threads = Array.isArray(applicationData?.threads) ? applicationData.threads : [];
    const counts = new Map();
    for (const thread of threads) if (thread?.campaignId) counts.set(thread.campaignId, (counts.get(thread.campaignId) || 0) + 1);
    const sorted = campaigns.filter((campaign) => counts.has(campaign.id)).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
    return sorted[0]?.id || threads.find((thread) => thread?.campaignId)?.campaignId || null;
  });
}

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  await login(page);

  await page.route("**/api/marketplace/influencers?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profiles: discoveryProfiles, total: discoveryProfiles.length, page: 1, pageSize: 100, totalPages: 1 }) });
  });
  await page.goto(`${baseUrl}/advertiser/discover`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-marketplace-influencer-row="true"]').first().waitFor({ state: "visible" });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, "yeollock-influencer-discovery-main.png"), fullPage: false });
  await page.unroute("**/api/marketplace/influencers?**");

  const campaignId = await findCampaignWithApplicants(page);
  if (!campaignId) throw new Error("no campaign with applicants available for capture");
  await page.goto(`${baseUrl}/advertiser/campaigns?campaign=${encodeURIComponent(`campaign:${campaignId}`)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText("지원자 현황", { exact: true }).waitFor({ state: "visible" });
  await wait(1200);
  await page.screenshot({ path: path.join(outDir, "yeollock-campaign-applicants-dashboard.png"), fullPage: false });

  console.log(JSON.stringify({ ok: true, campaignId, outputs: ["public/guide/assets/yeollock-influencer-discovery-main.png", "public/guide/assets/yeollock-campaign-applicants-dashboard.png"] }, null, 2));
} finally {
  await browser.close();
}
