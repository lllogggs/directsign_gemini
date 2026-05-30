/* global document, HTMLElement */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "og");
const outputFile = path.join(outDir, "yeollock-og.png");
const size = { width: 1200, height: 630 };
const fontDir = path.join(root, "public", "fonts", "nanum-square-neo");

const encodeFont = async (fileName) =>
  (await fs.readFile(path.join(fontDir, fileName))).toString("base64");

const [nanumRegular, nanumExtraBold, nanumHeavy] = await Promise.all([
  encodeFont("NanumSquareNeoTTF-bRg.woff2"),
  encodeFont("NanumSquareNeoTTF-dEb.woff2"),
  encodeFont("NanumSquareNeoTTF-eHv.woff2"),
]);

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "NanumSquareNeo";
        src: url("data:font/woff2;base64,${nanumRegular}") format("woff2");
        font-style: normal;
        font-display: block;
      }
      @font-face {
        font-family: "NanumSquareNeoExtraBold";
        src: url("data:font/woff2;base64,${nanumExtraBold}") format("woff2");
        font-style: normal;
        font-display: block;
      }
      @font-face {
        font-family: "NanumSquareNeoHeavy";
        src: url("data:font/woff2;base64,${nanumHeavy}") format("woff2");
        font-style: normal;
        font-display: block;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: ${size.width}px;
        height: ${size.height}px;
        overflow: hidden;
        font-family: "NanumSquareNeo", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
        color: #111111;
        background: #f7f7f3;
      }
      .canvas {
        position: relative;
        width: ${size.width}px;
        height: ${size.height}px;
        overflow: hidden;
      }
      .logo-lockup {
        position: absolute;
        left: 50%;
        top: 46%;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 42px;
        color: #111111;
        font-family: "NanumSquareNeoHeavy", "NanumSquareNeoExtraBold", "NanumSquareNeo", sans-serif;
        font-size: 124px;
        font-weight: 400;
        letter-spacing: 0;
        white-space: nowrap;
      }
      .logo-mark {
        width: 196px;
        height: 196px;
        border-radius: 50px;
        box-shadow: 0 42px 96px rgba(15, 23, 42, 0.24);
      }
      .logo-mark svg {
        display: block;
        width: 196px;
        height: 196px;
      }
      .logo-bg { fill: #111111; }
      .logo-node { fill: #ffffff; opacity: 0.96; }
      .logo-link {
        fill: none;
        stroke: #ffffff;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 5;
      }
      .caption {
        position: absolute;
        left: 50%;
        top: calc(46% + 146px);
        transform: translateX(-50%);
        color: #4b5563;
        font-family: "NanumSquareNeoExtraBold", "NanumSquareNeo", sans-serif;
        font-size: 21px;
        line-height: 1.2;
        font-weight: 400;
        letter-spacing: 0;
        text-align: center;
        white-space: nowrap;
      }
      .caption-text {
        display: inline-block;
        transform-origin: center center;
      }
    </style>
  </head>
  <body>
    <section class="canvas">
      <div class="logo-lockup">
        <div class="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <rect class="logo-bg" width="64" height="64" rx="16" />
            <circle class="logo-node" cx="20" cy="22" r="6" />
            <circle class="logo-node" cx="44" cy="22" r="6" />
            <circle class="logo-node" cx="32" cy="44" r="6" />
            <path class="logo-link" d="M24 25.5 32 38l8-12.5" />
          </svg>
        </div>
        <span>연락미</span>
      </div>
      <div class="caption"><span class="caption-text">광고 계약은 확실하게</span></div>
    </section>
  </body>
</html>`;

await fs.mkdir(outDir, { recursive: true });
const existingOgFiles = await fs.readdir(outDir).catch(() => []);
await Promise.all(
  existingOgFiles
    .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
    .map((fileName) => fs.rm(path.join(outDir, fileName), { force: true })),
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(async () => {
  await document.fonts.ready;
});
const metrics = await page.evaluate(() => {
  const logo = document.querySelector(".logo-mark");
  const logoLockup = document.querySelector(".logo-lockup");
  const captionText = document.querySelector(".caption-text");
  if (
    !(logo instanceof HTMLElement) ||
    !(logoLockup instanceof HTMLElement) ||
    !(captionText instanceof HTMLElement)
  ) {
    throw new Error("OG logo or caption node missing");
  }

  const iconWidth = logo.getBoundingClientRect().width;
  const logoWidth = logoLockup.getBoundingClientRect().width;
  const targetCaptionWidth = logoWidth * 0.9;
  const measure = () => captionText.getBoundingClientRect().width;
  let low = 12;
  let high = 72;

  for (let index = 0; index < 28; index += 1) {
    const mid = (low + high) / 2;
    captionText.style.fontSize = `${mid}px`;
    if (measure() < targetCaptionWidth) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const captionFontSize = (low + high) / 2;
  captionText.style.fontSize = `${captionFontSize}px`;

  return {
    logoWidth,
    iconWidth,
    targetCaptionWidth,
    captionTextWidth: measure(),
    captionFontSize,
  };
});

if (Math.abs(metrics.captionTextWidth - metrics.targetCaptionWidth) > 0.75) {
  throw new Error(
    `OG caption does not match 90% of the logo lockup width: ${metrics.captionTextWidth}px vs ${metrics.targetCaptionWidth}px`,
  );
}
await page.screenshot({ path: outputFile, clip: { x: 0, y: 0, ...size } });
await browser.close();

console.log(
  `wrote ${path.relative(root, outputFile)} (caption ${metrics.captionTextWidth.toFixed(2)}px / target ${metrics.targetCaptionWidth.toFixed(2)}px / logo ${metrics.logoWidth.toFixed(2)}px / icon ${metrics.iconWidth}px / font-size ${metrics.captionFontSize.toFixed(2)}px)`,
);
