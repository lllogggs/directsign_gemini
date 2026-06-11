import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const captureDir = path.resolve(process.argv[2] || "");
const reportDir = path.resolve(
  process.argv[3] || path.join(root, "docs", "qa-reports", "visual-qa-20260608"),
);

if (!captureDir || captureDir === root) {
  console.error("Usage: node scripts/improvement-captures-only-report.mjs <capture-output-dir> [report-output-dir]");
  process.exit(1);
}

const items = [
  {
    title: "PC 광고주 · 인플루언서 찾기",
    issue: "첫 화면 하단과 우측이 비어 보임",
    screenshot: "screenshots/pc-advertiser-discover.png",
  },
  {
    title: "PC 광고주 · 인증 완료 화면",
    issue: "인증 완료 카드가 상단에 떠 있고 하단이 과하게 비어 보임",
    screenshot: "screenshots/pc-advertiser-verification.png",
  },
  {
    title: "PC 인플루언서 · 플랫폼 인증 완료 화면",
    issue: "승인 플랫폼 카드 아래/우측 공백이 큼",
    screenshot: "screenshots/pc-influencer-verification.png",
  },
  {
    title: "PC 공개 브랜드 프로필",
    issue: "브랜드 정보 이후 첫 화면 콘텐츠 밀도가 낮음",
    screenshot: "screenshots/pc-public-public-brand-profile.png",
  },
  {
    title: "PC 공개 인플루언서 프로필",
    issue: "프로필 핵심 정보 아래쪽 첫 화면 공백이 큼",
    screenshot: "screenshots/pc-public-public-influencer-profile.png",
  },
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

async function imageDataUri(relativePath) {
  const data = await fs.readFile(path.join(captureDir, relativePath));
  return `data:image/png;base64,${data.toString("base64")}`;
}

async function buildHtml() {
  const sections = await Promise.all(
    items.map(async (item, index) => {
      const src = await imageDataUri(item.screenshot);
      return `<section class="shot-page">
        <header>
          <div>
            <p class="index">${String(index + 1).padStart(2, "0")} / ${items.length}</p>
            <h2>${escapeHtml(item.title)}</h2>
          </div>
          <p class="issue">${escapeHtml(item.issue)}</p>
        </header>
        <img src="${src}" alt="${escapeHtml(item.title)}" />
      </section>`;
    }),
  );

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111;
      font-family: Arial, "Malgun Gothic", sans-serif;
      background: #fff;
    }
    .shot-page {
      page-break-after: always;
      min-height: 180mm;
    }
    .shot-page header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 8px;
      border-bottom: 1px solid #dfe4df;
      padding-bottom: 8px;
    }
    .index {
      margin: 0 0 4px;
      color: #59625c;
      font-size: 11px;
      font-weight: 900;
    }
    h2 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0;
    }
    .issue {
      margin: 0;
      color: #c2410c;
      font-size: 12px;
      font-weight: 900;
      text-align: right;
    }
    img {
      display: block;
      width: 100%;
      max-height: 164mm;
      object-fit: contain;
      object-position: top center;
      border: 1px solid #dfe4df;
      border-radius: 8px;
      background: #f7f8f7;
    }
  </style>
</head>
<body>
  ${sections.join("")}
</body>
</html>`;
}

await fs.mkdir(reportDir, { recursive: true });
const html = await buildHtml();
const htmlPath = path.join(reportDir, "03-improvement-needed-captures-only.html");
const pdfPath = path.join(reportDir, "03-improvement-needed-captures-only.pdf");
await fs.writeFile(htmlPath, html, "utf8");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1754, height: 1240 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.pdf({
    path: pdfPath,
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
  });
  await page.screenshot({
    path: path.join(reportDir, "03-improvement-needed-captures-only-check.png"),
    fullPage: false,
  });
  console.log(JSON.stringify({ htmlPath, pdfPath, count: items.length }, null, 2));
} finally {
  await browser.close();
}
