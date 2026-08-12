import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.SALES_CAPTURE_BASE_URL || "https://yeollock.me").replace(/\/$/, "");
const influencerEmail = process.env.QA_INFLUENCER_EMAIL || "creator.sora@yeollock.me";
const influencerPassword = process.env.QA_TEST_PASSWORD || "YeollockTest!2026";
const outDir = path.resolve("public/guide/influencer/assets");
const fallbackCampaignId = "e8015400-9a61-48a0-8160-950accdede7a";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    .locator('a[href^="/campaigns/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  return href || `/campaigns/${fallbackCampaignId}`;
}

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

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
