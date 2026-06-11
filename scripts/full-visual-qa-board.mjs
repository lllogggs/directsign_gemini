import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const inputDir = process.argv[2];

if (!inputDir) {
  console.error("Usage: node scripts/full-visual-qa-board.mjs <capture-output-dir>");
  process.exit(1);
}

const outputRoot = path.resolve(inputDir);
const resultsPath = path.join(outputRoot, "capture-results.json");
const boardDir = path.join(outputRoot, "boards");
await fs.mkdir(boardDir, { recursive: true });

const data = JSON.parse(await fs.readFile(resultsPath, "utf8"));
const results = data.results ?? [];

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

const groups = new Map();
for (const item of results) {
  const key = `${item.viewport}-${item.role}`;
  if (!groups.has(key)) {
    groups.set(key, []);
  }
  groups.get(key).push(item);
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const toDataUri = async (relativePath) => {
  const absolutePath = path.join(outputRoot, relativePath);
  const data = await fs.readFile(absolutePath);
  return `data:image/png;base64,${data.toString("base64")}`;
};

const renderBoardHtml = async (title, items) => {
  const cards = (
    await Promise.all(
      items.map(async (item) => {
        const src = await toDataUri(item.screenshot);
        return `<article>
          <div class="head">
            <div class="label">
              ${escapeHtml(item.label)}
              <div class="path">${escapeHtml(item.path)}</div>
            </div>
            <div class="badge">${escapeHtml(item.viewportLabel)} · ${escapeHtml(item.role)}</div>
          </div>
          <img src="${src}" alt="${escapeHtml(item.label)}" />
          <div class="metrics">
            <div class="metric"><strong>가로넘침</strong>${item.metrics?.overflowX ?? "-"}</div>
            <div class="metric"><strong>세로스크롤</strong>${item.metrics?.overflowY ?? "-"}</div>
            <div class="metric"><strong>텍스트</strong>${item.metrics?.textLength ?? "-"}</div>
          </div>
        </article>`;
      }),
    )
  ).join("");

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 28px;
        background: #f3f4f1;
        color: #101410;
        font-family: Arial, "Malgun Gothic", sans-serif;
      }
      h1 {
        margin: 0 0 18px;
        font-size: 26px;
        letter-spacing: 0;
      }
      .meta {
        margin: 0 0 22px;
        color: #5b645d;
        font-size: 13px;
        font-weight: 700;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }
      article {
        overflow: hidden;
        border: 1px solid #dfe3dd;
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 10px 28px rgba(20, 26, 20, 0.06);
      }
      .head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        border-bottom: 1px solid #e7eae5;
      }
      .label {
        min-width: 0;
        font-size: 13px;
        font-weight: 900;
      }
      .path {
        margin-top: 3px;
        color: #6d756f;
        font-size: 10px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .badge {
        flex: 0 0 auto;
        align-self: start;
        border-radius: 999px;
        background: #eef2ff;
        color: #1d4ed8;
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 900;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        background: #edf0ea;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1px;
        background: #e7eae5;
        border-top: 1px solid #e7eae5;
      }
      .metric {
        background: #fbfcfa;
        padding: 7px 8px;
        font-size: 10px;
        font-weight: 800;
        color: #4d564f;
      }
      .metric strong {
        display: block;
        margin-bottom: 2px;
        color: #151915;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${escapeHtml(data.baseUrl)} · ${escapeHtml(data.createdAt)} · ${items.length}개 화면</p>
    <section class="grid">
      ${cards}
    </section>
  </body>
</html>`;
};

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  const indexEntries = [];

  for (const [key, items] of groups) {
    const title = `전체 화면 QA 캡쳐보드 - ${key}`;
    const html = await renderBoardHtml(title, items);
    const htmlPath = path.join(boardDir, `${key}.html`);
    const pngPath = path.join(boardDir, `${key}.png`);
    await fs.writeFile(htmlPath, html, "utf8");
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: pngPath, fullPage: true });
    indexEntries.push({ key, title, html: path.relative(outputRoot, htmlPath), png: path.relative(outputRoot, pngPath) });
  }

  await fs.writeFile(path.join(boardDir, "index.json"), JSON.stringify(indexEntries, null, 2), "utf8");
  console.log(JSON.stringify(indexEntries, null, 2));
} finally {
  await browser.close();
}
