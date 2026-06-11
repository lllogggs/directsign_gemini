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
  console.error("Usage: node scripts/full-visual-qa-report.mjs <capture-output-dir> [report-output-dir]");
  process.exit(1);
}

const captureData = JSON.parse(await fs.readFile(path.join(captureDir, "capture-results.json"), "utf8"));

const findings = [
  {
    id: "pc-advertiser-discover",
    title: "PC 광고주 · 인플루언서 찾기",
    severity: "높음",
    screenshot: "screenshots/pc-advertiser-discover.png",
    judgment: "카드가 4개뿐이라 첫 화면 하단과 우측이 크게 비어 보입니다.",
    evidence: "실제 프로덕션 캡쳐에서 첫 줄 3개와 둘째 줄 1개만 보이고, 아래 대부분이 빈 표면으로 남습니다.",
    recommendation:
      "현재 카드 그리드와 헤더 구조는 유지하고, 노출 카드 수와 카드 내부 정보 밀도만 보강하는 방향이 맞습니다.",
    options: [
      "A안: 기존 3열 카드 그리드를 그대로 두고 첫 화면에 6개 이상 보이도록 실제 추천 인플루언서 데이터를 확보한다.",
      "B안: 데이터가 4개뿐인 상태에서도 카드 높이, 줄 간격, 버튼 폭을 현재 규칙 안에서 맞춰 빈칸이 덜 튀게 정돈한다.",
    ],
    sample: "discovery",
  },
  {
    id: "pc-advertiser-verification",
    title: "PC 광고주 · 인증 완료 화면",
    severity: "중간",
    screenshot: "screenshots/pc-advertiser-verification.png",
    judgment: "인증 완료 카드가 큰 흰 패널 상단에만 배치되어 하단이 과하게 비어 보입니다.",
    evidence: "인증 정보 자체는 명확하지만 페이지 전체가 빈 컨테이너처럼 보이는 비율입니다.",
    recommendation:
      "새로운 화면 구조로 바꾸기보다 현재 인증 완료 카드의 폭, 높이, 세로 위치, CTA 묶음만 정리해야 합니다.",
    options: [
      "A안: 현재 단일 인증 카드를 유지하고 카드 높이를 콘텐츠에 맞춘 뒤 페이지 안에서 세로 중앙에 가깝게 정렬한다.",
      "B안: 현재 카드 안에 이미 있는 다음 행동 버튼만 하단 CTA 줄로 정리해 빈 패널처럼 보이는 느낌을 줄인다.",
    ],
    sample: "verificationAdvertiser",
  },
  {
    id: "pc-influencer-verification",
    title: "PC 인플루언서 · 플랫폼 인증 완료 화면",
    severity: "중간",
    screenshot: "screenshots/pc-influencer-verification.png",
    judgment: "승인 플랫폼 정보가 상단 카드에만 모여 있고, 하단과 우측이 의미 없는 공백으로 남습니다.",
    evidence: "등록 플랫폼 목록은 좋지만 PC 첫 화면에서는 카드가 떠 있는 느낌이 강합니다.",
    recommendation:
      "인증 화면의 성격을 바꾸지 말고, 승인 계정 목록을 현재 카드 내부에서 더 넓게 쓰고 CTA만 같은 결로 정리해야 합니다.",
    options: [
      "A안: 현재 승인 플랫폼 카드 구조를 유지하되 플랫폼 행 간격과 카드 폭을 조정해 첫 화면 점유감을 높인다.",
      "B안: 현재 카드 하단에 기존 행동 버튼만 한 줄로 정리해 다음 행동이 보이게 하고 별도 섹션은 만들지 않는다.",
    ],
    sample: "verificationInfluencer",
  },
  {
    id: "pc-public-brand-profile",
    title: "PC 공개 브랜드 프로필",
    severity: "중간",
    screenshot: "screenshots/pc-public-public-brand-profile.png",
    judgment: "상단 브랜드 정보 이후 하단 콘텐츠가 적어 PC 첫 화면이 비어 보입니다.",
    evidence: "진행 캠페인 1개와 작은 정보 카드만 있어 넓은 PC 화면을 충분히 쓰지 못합니다.",
    recommendation:
      "브랜드 프로필을 다른 형식으로 바꾸지 말고, 현재 브랜드 소개와 캠페인 카드의 폭과 배치만 보강해야 합니다.",
    options: [
      "A안: 진행 중 캠페인이 2개 이상이면 기존 카드 패턴 그대로 첫 화면에 2~3개를 노출한다.",
      "B안: 캠페인이 1개뿐이면 카드 자체를 현재 스타일 안에서 넓게 쓰고 브랜드 정보 버튼/소개를 같은 줄 안에 정리한다.",
    ],
    sample: "brandProfile",
  },
  {
    id: "pc-public-influencer-profile",
    title: "PC 공개 인플루언서 프로필",
    severity: "중간",
    screenshot: "screenshots/pc-public-public-influencer-profile.png",
    judgment: "프로필 핵심 정보는 좋지만 첫 화면 하단이 비어 보여 완성도가 약해집니다.",
    evidence: "이미지, 이름, 플랫폼 수치는 명확하지만 다음 줄의 존재감이 거의 없습니다.",
    recommendation:
      "공개 프로필의 현재 영웅 영역, 플랫폼 버튼, 제안 CTA를 유지하고 세로 리듬과 하단 여백만 조정해야 합니다.",
    options: [
      "A안: 현재 사진/소개/플랫폼 버튼 묶음을 유지하면서 첫 화면 안에서 플랫폼 버튼 폭과 간격을 키운다.",
      "B안: 별도 콘텐츠 섹션을 만들지 않고 제안 CTA와 플랫폼 계정 버튼의 위치만 낮춰 하단 빈 느낌을 줄인다.",
    ],
    sample: "creatorProfile",
  },
];

const passedGroups = [
  "인트로 PC/모바일 슬라이드는 최근 수정 반영 후 잘림 없이 렌더링됩니다.",
  "대시보드의 고정 빈 공간은 의도된 테이블 공간으로 판단했습니다. PC에서는 임의 축소하지 않고, 모바일에서는 행 구분이 유지됩니다.",
  "메시지 빈 상태는 중앙 CTA가 있어 허용 가능한 빈 상태로 분류했습니다.",
  "모바일 광고주/인플루언서 주요 화면은 가로 넘침이나 심한 비율 깨짐 없이 렌더링됩니다.",
];

const improvementPrinciples = [
  "기존 화면 구조를 유지하고, 새 섹션이나 다른 제품처럼 보이는 레이아웃 전환은 제안하지 않는다.",
  "대시보드 고정 빈 공간, PC 대시보드 무구분선, 모바일 행 구분선 같은 기존 수정 방향을 건드리지 않는다.",
  "빈 공간은 실제 데이터 수, 카드 내부 밀도, 세로 정렬, CTA 묶음으로만 해결한다.",
  "브랜드/인플루언서 프로필은 현재 공개 프로필 결을 유지하고 화면 성격을 바꾸는 표현은 사용하지 않는다.",
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

async function imageDataUri(relativeToCapture) {
  const filePath = path.join(captureDir, relativeToCapture);
  const data = await fs.readFile(filePath);
  return `data:image/png;base64,${data.toString("base64")}`;
}

async function reportImage(relativePath, baseDir = reportDir) {
  const filePath = path.join(baseDir, relativePath);
  const data = await fs.readFile(filePath);
  return `data:image/png;base64,${data.toString("base64")}`;
}

const sampleCss = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    width: 1200px;
    height: 760px;
    background: #f3f5f2;
    color: #101410;
    font-family: Arial, "Malgun Gothic", sans-serif;
  }
  .sample { padding: 36px; }
  h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: 0; }
  p { margin: 0; color: #5d675f; font-size: 15px; line-height: 1.55; font-weight: 700; }
  .surface {
    margin-top: 24px;
    border: 1px solid #dfe5df;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 12px 28px rgba(17, 24, 39, .07);
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 58px;
    padding: 14px 18px;
    border-bottom: 1px solid #ecefec;
  }
  .toolbar strong { font-size: 15px; }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 118px;
    height: 38px;
    border-radius: 8px;
    border: 1px solid #dfe5df;
    font-size: 13px;
    font-weight: 900;
  }
  .primary { background: #2563eb; border-color: #2563eb; color: white; }
  .grid3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    padding: 18px;
  }
  .creator-card {
    min-height: 150px;
    border: 1px solid #e2e7e2;
    border-radius: 8px;
    padding: 14px;
    background: #fff;
  }
  .creator-card strong { display: block; margin-bottom: 7px; font-size: 17px; }
  .meta { color: #68746c; font-size: 12px; font-weight: 800; line-height: 1.45; }
  .platforms { margin-top: 14px; color: #ef4444; font-size: 12px; font-weight: 900; }
  .cta-row { display: flex; gap: 8px; margin-top: 14px; }
  .cta-row .button { flex: 1; min-width: 0; height: 34px; }
  .verify-wrap {
    min-height: 520px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .verify-card {
    width: 620px;
    border: 1px solid #dfe5df;
    border-radius: 8px;
    background: #fff;
    padding: 18px;
  }
  .verify-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .verify-card h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
  .badge {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: #eaf7ef;
    color: #047857;
    font-size: 12px;
    font-weight: 900;
  }
  .rows { display: grid; gap: 8px; }
  .row {
    display: grid;
    grid-template-columns: 132px 1fr;
    gap: 12px;
    align-items: center;
    min-height: 40px;
    border: 1px solid #e5e9e5;
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 800;
  }
  .row span:first-child { color: #5d675f; }
  .brand-layout {
    display: grid;
    grid-template-columns: 1.35fr .65fr;
    gap: 16px;
    padding: 18px;
  }
  .wide-card, .info-card {
    border: 1px solid #e2e7e2;
    border-radius: 8px;
    background: #fff;
    padding: 18px;
    min-height: 190px;
  }
  .wide-card h2, .info-card h2 { margin: 0 0 10px; font-size: 20px; }
  .brand-actions { display: flex; gap: 8px; margin-top: 24px; }
  .profile-layout {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 22px;
    padding: 20px;
    align-items: stretch;
  }
  .photo {
    min-height: 420px;
    border-radius: 8px;
    background: linear-gradient(145deg, #151515, #555);
    color: white;
    padding: 24px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .profile-main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
  }
  .platform-button {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    min-height: 56px;
    border: 1px solid #e2e7e2;
    border-radius: 8px;
    padding: 0 16px;
    font-weight: 900;
  }
`;

function creatorCard(name, desc, channels) {
  return `<article class="creator-card">
    <strong>${escapeHtml(name)}</strong>
    <div class="meta">${escapeHtml(desc)}</div>
    <div class="platforms">${escapeHtml(channels)}</div>
    <div class="cta-row"><span class="button primary">제안</span><span class="button">프로필</span></div>
  </article>`;
}

function sampleHtml(type) {
  if (type === "discovery") {
    return `<style>${sampleCss}</style><main class="sample">
      <h1>인플루언서 찾기 개선 샘플</h1>
      <p>현재 그리드와 버튼 구조는 유지하고, 첫 화면 카드 수만 6개 이상으로 맞춘 방향입니다.</p>
      <section class="surface">
        <div class="toolbar"><strong>인플루언서 목록 · 6명 표시</strong><span class="button">필터</span></div>
        <div class="grid3">
          ${creatorCard("채널오브", "롱폼 리뷰와 숏츠를 함께 운영합니다.", "유튜브 12.6만")}
          ${creatorCard("제우", "릴스와 숏폼 제품 사용 장면에 강합니다.", "인스타 8.4만 · 유튜브 2.1만")}
          ${creatorCard("크리에이터 소라", "뷰티와 라이프스타일 제품을 직접 사용해 소개합니다.", "인스타 8.1만 · 유튜브 2.4만")}
          ${creatorCard("민서홈", "살림과 홈카페 제품을 차분하게 보여줍니다.", "인스타 5.8만 · 블로그 1.2만")}
          ${creatorCard("라온뷰티", "스킨케어와 데일리 뷰티 루틴에 강합니다.", "인스타 4.6만")}
          ${creatorCard("소담픽", "푸드와 생활용품 리뷰 전환율이 높습니다.", "블로그 3.2만")}
        </div>
      </section>
    </main>`;
  }

  if (type === "verificationAdvertiser") {
    return `<style>${sampleCss}</style><main class="sample">
      <h1>광고주 인증 완료 개선 샘플</h1>
      <p>현재 인증 카드의 크기와 세로 위치만 정돈한 방향입니다.</p>
      <section class="surface">
        <div class="verify-wrap">
          <article class="verify-card">
            <header><h2>사업자 인증이 완료되었습니다</h2><span class="badge">인증 완료</span></header>
            <div class="rows">
              <div class="row"><span>회사</span><strong>브레드룸</strong></div>
              <div class="row"><span>담당</span><strong>광고주 매니저</strong></div>
              <div class="row"><span>이메일</span><strong>breadroom.manager@yeollock.me</strong></div>
              <div class="row"><span>승인일</span><strong>2026. 6. 7.</strong></div>
            </div>
            <div class="cta-row"><span class="button primary">새 계약 작성</span><span class="button">캠페인 작성</span></div>
          </article>
        </div>
      </section>
    </main>`;
  }

  if (type === "verificationInfluencer") {
    return `<style>${sampleCss}</style><main class="sample">
      <h1>인플루언서 플랫폼 인증 개선 샘플</h1>
      <p>현재 승인 계정 카드 안에서 목록 폭과 CTA 묶음만 정리한 방향입니다.</p>
      <section class="surface">
        <div class="verify-wrap">
          <article class="verify-card">
            <header><h2>플랫폼 인증 완료</h2><span class="badge">승인됨</span></header>
            <div class="rows">
              <div class="row"><span>인스타그램</span><strong>@creator.sora · 8.1만</strong></div>
              <div class="row"><span>유튜브</span><strong>소라라이프 · 2.4만</strong></div>
              <div class="row"><span>네이버 블로그</span><strong>sora-review · 1.2만</strong></div>
            </div>
            <div class="cta-row"><span class="button primary">브랜드 찾기</span><span class="button">계정 추가</span></div>
          </article>
        </div>
      </section>
    </main>`;
  }

  if (type === "brandProfile") {
    return `<style>${sampleCss}</style><main class="sample">
      <h1>브랜드 프로필 개선 샘플</h1>
      <p>현재 공개 브랜드 프로필 안에서 캠페인 카드와 정보 버튼의 비율만 보강한 방향입니다.</p>
      <section class="surface">
        <div class="toolbar"><strong>브레드룸</strong><span class="button primary">정보</span></div>
        <div class="brand-layout">
          <article class="wide-card">
            <h2>진행 중 캠페인</h2>
            <p>신제품 브런치 박스 체험단 · 인스타그램/블로그 중심</p>
            <div class="brand-actions"><span class="button primary">제안하기</span><span class="button">캠페인 보기</span></div>
          </article>
          <aside class="info-card">
            <h2>브랜드 정보</h2>
            <p>브랜드 소개와 기본 정보는 같은 화면 결 안에서 간결하게 보여줍니다.</p>
          </aside>
        </div>
      </section>
    </main>`;
  }

  return `<style>${sampleCss}</style><main class="sample">
    <h1>인플루언서 프로필 개선 샘플</h1>
    <p>현재 사진, 플랫폼 버튼, 제안 CTA를 유지하고 첫 화면 세로 리듬만 조정한 방향입니다.</p>
    <section class="surface">
      <div class="profile-layout">
        <div class="photo"><h2>크리에이터 소라</h2><p style="color:#e5e7eb">뷰티 · 라이프스타일</p></div>
        <div class="profile-main">
          <div class="platform-button"><span>인스타그램</span><strong>8.1만</strong></div>
          <div class="platform-button"><span>유튜브</span><strong>2.4만</strong></div>
          <div class="platform-button"><span>네이버 블로그</span><strong>1.2만</strong></div>
          <span class="button primary" style="width:220px;margin-top:10px">제안하기</span>
        </div>
      </div>
    </section>
  </main>`;
}

async function buildSampleImages(browser) {
  const sampleDir = path.join(reportDir, "samples");
  await fs.mkdir(sampleDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
  const sampleByType = new Map();
  for (const type of new Set(findings.map((finding) => finding.sample))) {
    const html = sampleHtml(type);
    const filePath = path.join(sampleDir, `${type}.png`);
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: filePath, fullPage: false });
    sampleByType.set(type, `samples/${type}.png`);
  }
  await page.close();
  return sampleByType;
}

const baseStyles = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font-family: Arial, "Malgun Gothic", sans-serif; }
  h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: 0; }
  h2 { margin: 22px 0 10px; font-size: 20px; break-after: avoid; }
  h3 { margin: 18px 0 8px; font-size: 16px; break-after: avoid; }
  p, li { font-size: 11px; line-height: 1.58; }
  .cover { min-height: 240px; display: flex; flex-direction: column; justify-content: center; border-bottom: 2px solid #111; margin-bottom: 18px; }
  .meta { color: #59625c; font-weight: 700; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 18px 0; }
  .stat { border: 1px solid #dfe4df; border-radius: 8px; padding: 10px; background: #f8faf7; }
  .stat strong { display: block; font-size: 18px; margin-bottom: 4px; }
  .finding { page-break-inside: avoid; border: 1px solid #dfe4df; border-radius: 8px; padding: 12px; margin: 12px 0; }
  .severity { display: inline-block; border-radius: 999px; padding: 3px 8px; background: #fff7ed; color: #c2410c; font-size: 10px; font-weight: 900; }
  img { max-width: 100%; border: 1px solid #dfe4df; border-radius: 8px; display: block; }
  .shot { margin-top: 8px; }
  .boards img { margin: 8px 0 18px; }
  .page-break { page-break-before: always; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
  .option { background: #f8faf7; border: 1px solid #dfe4df; border-radius: 8px; padding: 9px; }
`;

async function buildQaReportHtml() {
  const boardIndex = JSON.parse(await fs.readFile(path.join(captureDir, "boards", "index.json"), "utf8"));
  const boardImages = await Promise.all(
    boardIndex.map(async (board) => ({
      ...board,
      src: await imageDataUri(board.png.replaceAll("\\", "/")),
    })),
  );

  const findingBlocks = await Promise.all(
    findings.map(async (finding) => `<section class="finding">
      <h3>${escapeHtml(finding.title)} <span class="severity">${escapeHtml(finding.severity)}</span></h3>
      <p><strong>판정:</strong> ${escapeHtml(finding.judgment)}</p>
      <p><strong>근거:</strong> ${escapeHtml(finding.evidence)}</p>
      <img class="shot" src="${await imageDataUri(finding.screenshot)}" alt="${escapeHtml(finding.title)}" />
    </section>`),
  );

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><style>${baseStyles}</style></head><body>
    <section class="cover">
      <h1>연락미 전체 화면 QA 1차 보고서</h1>
      <p class="meta">기준: ${escapeHtml(captureData.baseUrl)} · 생성: ${escapeHtml(captureData.createdAt)} · PC/모바일 실제 캡쳐</p>
    </section>
    <section class="summary">
      <div class="stat"><strong>${captureData.total}</strong>캡쳐 화면</div>
      <div class="stat"><strong>${captureData.failed}</strong>캡쳐 실패</div>
      <div class="stat"><strong>${findings.length}</strong>이상 후보</div>
      <div class="stat"><strong>0</strong>가로 넘침</div>
    </section>
    <h2>판정 요약</h2>
    <ul>${passedGroups.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h2>이상 후보</h2>
    ${findingBlocks.join("")}
    <section class="boards page-break">
      <h2>전체 캡쳐보드</h2>
      ${boardImages.map((board) => `<h3>${escapeHtml(board.title)}</h3><img src="${board.src}" alt="${escapeHtml(board.title)}" />`).join("")}
    </section>
  </body></html>`;
}

async function buildImprovementReportHtml(sampleByType) {
  const blocks = await Promise.all(
    findings.map(async (finding) => {
      const sampleSrc = await reportImage(sampleByType.get(finding.sample));
      const currentSrc = await imageDataUri(finding.screenshot);
      return `<section class="finding page-break">
        <h2>${escapeHtml(finding.title)}</h2>
        <p><strong>현재 문제:</strong> ${escapeHtml(finding.judgment)}</p>
        <p><strong>수정 기준:</strong> 기존 서비스 구조를 유지하고, 현재 화면 안에서 밀도와 정렬만 조정합니다.</p>
        <div class="two">
          <div><h3>현재 캡쳐</h3><img src="${currentSrc}" alt="현재 ${escapeHtml(finding.title)}" /></div>
          <div><h3>샘플 방향</h3><img src="${sampleSrc}" alt="샘플 ${escapeHtml(finding.title)}" /></div>
        </div>
        <h3>선택 옵션</h3>
        <div class="two">
          ${finding.options.map((option) => `<div class="option">${escapeHtml(option)}</div>`).join("")}
        </div>
        <p><strong>기본 추천:</strong> ${escapeHtml(finding.recommendation)}</p>
      </section>`;
    }),
  );

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><style>${baseStyles}</style></head><body>
    <section class="cover">
      <h1>연락미 화면 개선 방향 샘플 보고서</h1>
      <p class="meta">1차 QA 이상 후보 기반 · 기존 수정 결 유지형 보수 제안 · 샘플 이미지는 방향 제시용 정적 시안</p>
    </section>
    <h2>이번 수정안 기준</h2>
    <ul>${improvementPrinciples.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <p>아래 샘플은 실제 서비스 화면 캡쳐를 기준으로 비어 보이는 비율을 줄이는 방향만 제안합니다. 구현 전 최종 선택이 필요합니다.</p>
    ${blocks.join("")}
  </body></html>`;
}

async function writePdf(browser, html, htmlName, pdfName) {
  const htmlPath = path.join(reportDir, htmlName);
  const pdfPath = path.join(reportDir, pdfName);
  await fs.writeFile(htmlPath, html, "utf8");
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
  });
  await page.close();
  return { htmlPath, pdfPath };
}

await fs.mkdir(reportDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const sampleByType = await buildSampleImages(browser);
  const qaHtml = await buildQaReportHtml();
  const improvementHtml = await buildImprovementReportHtml(sampleByType);
  const qaReport = await writePdf(browser, qaHtml, "01-full-screen-qa-report.html", "01-full-screen-qa-report.pdf");
  const improvementReport = await writePdf(
    browser,
    improvementHtml,
    "02-improvement-options-samples.html",
    "02-improvement-options-samples.pdf",
  );
  const manifest = {
    captureDir,
    reportDir,
    reports: {
      qa: qaReport,
      improvements: improvementReport,
    },
    findings,
    improvementPrinciples,
  };
  await fs.writeFile(path.join(reportDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await browser.close();
}
