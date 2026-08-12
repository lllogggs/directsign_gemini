import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.SALES_CAPTURE_BASE_URL || "https://yeollock.me").replace(/\/$/, "");
const advertiserEmail = process.env.SALES_CAPTURE_ADVERTISER_EMAIL || "breadroom.manager@yeollock.me";
const advertiserPassword = process.env.QA_TEST_PASSWORD || "YeollockTest!2026";
const outDir = path.resolve("public/guide/assets");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(page) {
  await page.goto(`${baseUrl}/login/advertiser`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const result = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/advertiser/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => ({})) };
  }, { email: advertiserEmail, password: advertiserPassword });
  if (!result.ok || result.body?.authenticated !== true) {
    throw new Error(`advertiser login failed (${result.status})`);
  }

  const session = await page.evaluate(async () => {
    const response = await fetch("/api/advertiser/session", { headers: { Accept: "application/json" }, credentials: "include" });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  const accountId = session.body?.user?.id || session.body?.account?.id || null;
  if (accountId) {
    await page.evaluate((id) => {
      localStorage.setItem(`yeollock:product-tour:advertiser:${encodeURIComponent(id)}:influencer-discovery:v1`, "seen");
    }, accountId);
  }
}

async function inspectInfluencerApi(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/marketplace/influencers?page=1&sort=audience_desc", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      total: body?.total,
      page: body?.page,
      pageSize: body?.pageSize,
      totalPages: body?.totalPages,
      profiles: Array.isArray(body?.profiles) ? body.profiles.length : null,
      error: body?.error || body?.message || null,
    };
  });
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
    for (const thread of threads) {
      if (!thread?.campaignId) continue;
      counts.set(thread.campaignId, (counts.get(thread.campaignId) || 0) + 1);
    }
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

  const influencerApi = await inspectInfluencerApi(page);
  console.log("influencerApi", JSON.stringify(influencerApi));
  if (!influencerApi.ok || !influencerApi.profiles) {
    throw new Error(`influencer API unavailable for capture: ${JSON.stringify(influencerApi)}`);
  }

  await page.goto(`${baseUrl}/advertiser/discover`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-product-tour="advertiser-discovery-overview"]').waitFor({ state: "visible" });
  await page.locator('[data-marketplace-influencer-row="true"]').first().waitFor({ state: "visible" });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, "yeollock-influencer-discovery-main.png"), fullPage: false });

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
