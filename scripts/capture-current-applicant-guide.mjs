import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.SALES_CAPTURE_BASE_URL || "https://yeollock.me").replace(/\/$/, "");
const email = process.env.SALES_CAPTURE_ADVERTISER_EMAIL || "breadroom.manager@yeollock.me";
const password = process.env.QA_TEST_PASSWORD || "YeollockTest!2026";
const root = process.cwd();
const publicOutput = path.join(
  root,
  "public",
  "guide",
  "assets",
  "yeollock-campaign-applicants-dashboard.png",
);
const salesOutput = path.join(
  root,
  "docs",
  "sales",
  "assets",
  "yeollock-campaign-applicants-dashboard.png",
);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1250 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login/advertiser`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const loginResult = await page.evaluate(
    async ({ loginEmail, loginPassword }) => {
      const response = await fetch("/api/advertiser/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({})),
      };
    },
    { loginEmail: email, loginPassword: password },
  );

  if (!loginResult.ok || loginResult.body?.authenticated !== true) {
    throw new Error(`Advertiser capture login failed (${loginResult.status})`);
  }

  const captureTarget = await page.evaluate(async () => {
    const [campaignResponse, applicationResponse] = await Promise.all([
      fetch("/api/advertiser/campaigns", {
        headers: { Accept: "application/json" },
        credentials: "include",
      }),
      fetch("/api/marketplace/campaign-applications?role=advertiser", {
        headers: { Accept: "application/json" },
        credentials: "include",
      }),
    ]);

    if (!campaignResponse.ok || !applicationResponse.ok) {
      return null;
    }

    const campaignData = await campaignResponse.json().catch(() => ({}));
    const applicationData = await applicationResponse.json().catch(() => ({}));
    const campaigns = Array.isArray(campaignData.campaigns)
      ? campaignData.campaigns
      : [];
    const threads = Array.isArray(applicationData.threads)
      ? applicationData.threads
      : [];

    const counts = new Map();
    for (const thread of threads) {
      if (!thread?.campaignId) continue;
      const current = counts.get(thread.campaignId) || 0;
      counts.set(thread.campaignId, current + 1);
    }

    const campaignId =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
      campaigns.find((campaign) => campaign?.id)?.id;

    return campaignId ? { campaignId, applicantCount: counts.get(campaignId) || 0 } : null;
  });

  if (!captureTarget?.campaignId) {
    throw new Error("No campaign was available for applicant capture");
  }

  const campaignKey = `campaign:${captureTarget.campaignId}`;
  await page.goto(
    `${baseUrl}/advertiser/campaigns?campaign=${encodeURIComponent(campaignKey)}`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );

  await page.waitForFunction(
    () => document.body?.innerText.includes("지원자"),
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(1200);

  // New browser profiles see the product tour. Close it so the real campaign UI is visible.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  const visualState = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const applicantImages = Array.from(
      document.querySelectorAll('img[alt$=" profile"]'),
    ).length;
    return {
      hasApplicants: bodyText.includes("지원자"),
      applicantImages,
      textSample: bodyText.slice(0, 500),
    };
  });

  if (!visualState.hasApplicants) {
    throw new Error("Applicant panel did not render");
  }

  await fs.mkdir(path.dirname(publicOutput), { recursive: true });
  await fs.mkdir(path.dirname(salesOutput), { recursive: true });
  const screenshot = await page.screenshot({ type: "png", fullPage: false });
  await fs.writeFile(publicOutput, screenshot);
  await fs.writeFile(salesOutput, screenshot);

  console.log(
    JSON.stringify({
      ok: true,
      campaignId: captureTarget.campaignId,
      applicantCount: captureTarget.applicantCount,
      renderedApplicantImages: visualState.applicantImages,
      publicOutput,
      salesOutput,
    }),
  );
} finally {
  await browser.close();
}
