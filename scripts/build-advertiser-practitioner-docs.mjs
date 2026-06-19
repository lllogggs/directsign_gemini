import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const salesDir = path.join(root, "docs", "sales");
const reviewDir = path.join(salesDir, "review", "advertiser-practitioner-docs");

const rel = (from, to) => path.relative(from, path.join(root, to)).replaceAll("\\", "/");

const assets = {
  logo: rel(salesDir, "public/favicon.svg"),
  dashboard: rel(salesDir, "docs/sales/assets/yeollock-practitioner-dashboard.png"),
  builder: rel(salesDir, "docs/sales/assets/yeollock-practitioner-contract-builder.png"),
  detail: rel(salesDir, "docs/sales/assets/yeollock-practitioner-contract-detail.png"),
  applicants: rel(salesDir, "docs/sales/assets/yeollock-campaign-applicants-dashboard.png"),
  contractPdf: rel(salesDir, "docs/sales/assets/yeollock-contract-pdf-review-page.png"),
};

const font = {
  light: rel(salesDir, "public/fonts/nanum-square-neo/NanumSquareNeoTTF-aLt.woff2"),
  regular: rel(salesDir, "public/fonts/nanum-square-neo/NanumSquareNeoTTF-bRg.woff2"),
  bold: rel(salesDir, "public/fonts/nanum-square-neo/NanumSquareNeoTTF-cBd.woff2"),
  heavy: rel(salesDir, "public/fonts/nanum-square-neo/NanumSquareNeoTTF-eHv.woff2"),
};

const commonCss = `
@font-face { font-family: "NanumSquareNeo"; src: url("${font.light}") format("woff2"); font-weight: 300; font-style: normal; font-display: swap; }
@font-face { font-family: "NanumSquareNeo"; src: url("${font.regular}") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "NanumSquareNeo"; src: url("${font.bold}") format("woff2"); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: "NanumSquareNeo"; src: url("${font.heavy}") format("woff2"); font-weight: 900; font-style: normal; font-display: swap; }

@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #e8ebef; color: #111827; font-family: "NanumSquareNeo", "Malgun Gothic", system-ui, sans-serif; word-break: keep-all; overflow-wrap: normal; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.deck { width: 100%; }
.page {
  position: relative;
  width: 297mm;
  height: 210mm;
  overflow: hidden;
  page-break-after: always;
  background:
    linear-gradient(180deg, rgba(255,255,255,.98), rgba(250,251,252,.98)),
    #ffffff;
  padding: 19mm 21mm 17mm;
}
.page.dark {
  color: #ffffff;
  background:
    linear-gradient(132deg, rgba(8,13,24,.98), rgba(15,23,42,.96) 58%, rgba(31,41,55,.98)),
    #111827;
}
.page:last-child { page-break-after: auto; }
.brand-row { display: flex; align-items: center; justify-content: space-between; height: 10mm; margin-bottom: 11mm; }
.brand { display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 900; letter-spacing: 0; }
.brand-mark { width: 24px; height: 24px; border-radius: 7px; display: block; overflow: hidden; font-size: 0; line-height: 0; box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
.brand-mark::before { content: ""; display: block; width: 100%; height: 100%; background: url("${assets.logo}") center / cover no-repeat; }
.dark .brand-mark { box-shadow: 0 0 0 1px rgba(255,255,255,.18); }
.meta { color: #6b7280; font-size: 10px; font-weight: 700; }
.dark .meta { color: rgba(255,255,255,.58); }
.kicker { color: #2563eb; font-size: 12px; font-weight: 900; margin-bottom: 7mm; }
.dark .kicker { color: #8db6ff; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 45px; line-height: 1.12; letter-spacing: 0; font-weight: 900; max-width: 720px; word-break: keep-all; overflow-wrap: normal; }
h2 { font-size: 32px; line-height: 1.18; letter-spacing: 0; font-weight: 900; max-width: 620px; word-break: keep-all; overflow-wrap: normal; }
h3 { font-size: 19px; line-height: 1.28; font-weight: 900; }
.lead { color: #4b5563; font-size: 16px; line-height: 1.65; font-weight: 700; max-width: 680px; margin-top: 7mm; word-break: keep-all; overflow-wrap: normal; }
.dark .lead { color: rgba(255,255,255,.74); }
.small { color: #6b7280; font-size: 11px; line-height: 1.55; font-weight: 700; }
.dark .small { color: rgba(255,255,255,.62); }
.hero-grid { display: grid; grid-template-columns: 45% 55%; gap: 13mm; align-items: center; height: 151mm; }
.split { display: grid; grid-template-columns: 42% 58%; gap: 11mm; align-items: center; height: 151mm; }
.split.equal { grid-template-columns: 50% 50%; }
.stack { display: grid; gap: 5mm; }
.points { display: grid; gap: 5mm; margin-top: 12mm; }
.point { display: grid; grid-template-columns: 9mm 1fr; gap: 4mm; align-items: start; }
.num { width: 8mm; height: 8mm; border-radius: 999px; background: #111827; color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 900; }
.dark .num { background: #ffffff; color: #111827; }
.point strong { display: block; font-size: 15px; line-height: 1.4; margin-bottom: 1.5mm; font-weight: 900; }
.point span { display: block; color: #6b7280; font-size: 11px; line-height: 1.55; font-weight: 700; }
.dark .point span { color: rgba(255,255,255,.64); }
.mockup {
  position: relative;
  background: #f5f6f8;
  border: 1px solid rgba(17,24,39,.1);
  border-radius: 14px;
  box-shadow: 0 24px 70px rgba(15,23,42,.14);
  overflow: hidden;
}
.mockup.dark-card { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); box-shadow: 0 24px 70px rgba(0,0,0,.32); }
.mockup img { display: block; width: 100%; height: 100%; object-fit: contain; }
.screen-wide { aspect-ratio: 1.517 / 1; }
.screen-short { aspect-ratio: 1.72 / 1; }
.screen-tall { aspect-ratio: 1.05 / 1; }
.screen-paper { height: 143mm; width: 102mm; margin-left: auto; margin-right: auto; background: #fff; }
.screen-paper img { object-fit: contain; }
.screen-applicants img { object-fit: contain; background: #f5f6f8; }
.export-visual { position: relative; aspect-ratio: 1.517 / 1; background: #111827; }
.export-visual .export-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(.08); opacity: .54; }
.export-visual::after { content: ""; position: absolute; inset: 0; background: rgba(17,24,39,.34); }
.export-modal {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  width: 74mm;
  transform: translate(-50%, -50%);
  border-radius: 15px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15,23,42,.28);
  padding: 6mm;
}
.export-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5mm; }
.export-modal h3 { font-size: 18px; }
.export-close { color: #6b7280; font-size: 18px; line-height: 1; }
.export-option { display: grid; grid-template-columns: 11mm 1fr; align-items: center; gap: 4mm; min-height: 15mm; padding: 3.5mm; border: 1px solid rgba(17,24,39,.11); border-radius: 10px; margin-top: 3mm; }
.export-icon { width: 10mm; height: 10mm; border-radius: 9px; display: grid; place-items: center; background: #f3f4f6; color: #111827; font-size: 14px; font-weight: 900; }
.export-option.google .export-icon { background: #e8f1ff; color: #2563eb; }
.export-option strong { display: block; font-size: 14px; line-height: 1.3; font-weight: 900; }
.export-option span { display: block; color: #6b7280; font-size: 10px; line-height: 1.45; font-weight: 700; margin-top: 1mm; }
.strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 12mm; }
.fact-list { display: grid; gap: 3mm; margin-top: 10mm; }
.fact-row { display: grid; grid-template-columns: 22mm 1fr; gap: 4mm; align-items: start; padding: 4.2mm 0; border-top: 1px solid rgba(17,24,39,.08); }
.fact-row:first-child { border-top: 0; }
.fact-row b { font-size: 17px; line-height: 1.2; font-weight: 900; }
.fact-row span { color: #6b7280; font-size: 11px; line-height: 1.52; font-weight: 700; }
.metric {
  min-height: 32mm;
  border: 1px solid rgba(17,24,39,.09);
  background: #fff;
  border-radius: 12px;
  padding: 7mm;
}
.dark .metric { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
.metric b { display: block; font-size: 26px; font-weight: 900; margin-bottom: 3mm; }
.metric span { display: block; color: #6b7280; font-size: 11px; line-height: 1.5; font-weight: 700; }
.dark .metric span { color: rgba(255,255,255,.68); }
.callout {
  position: absolute;
  right: 19mm;
  bottom: 18mm;
  width: 70mm;
  padding: 6mm;
  border-radius: 14px;
  background: rgba(255,255,255,.92);
  border: 1px solid rgba(37,99,235,.18);
  box-shadow: 0 18px 50px rgba(15,23,42,.16);
}
.callout strong { display: block; font-size: 14px; font-weight: 900; margin-bottom: 2mm; }
.callout span { color: #4b5563; font-size: 11px; line-height: 1.55; font-weight: 700; }
.note-box { margin-top: 10mm; padding: 6mm; border-radius: 14px; background: #f8fafc; border: 1px solid rgba(37,99,235,.16); box-shadow: 0 14px 40px rgba(15,23,42,.08); }
.note-box strong { display: block; font-size: 14px; font-weight: 900; margin-bottom: 2mm; }
.note-box span { display: block; color: #4b5563; font-size: 11px; line-height: 1.55; font-weight: 700; }
.workflow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; margin-top: 14mm; }
.step-card { background: #fff; border: 1px solid rgba(17,24,39,.09); border-radius: 14px; padding: 7mm; min-height: 39mm; }
.dark .step-card { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
.step-card i { display: block; color: #2563eb; font-style: normal; font-size: 10px; font-weight: 900; margin-bottom: 4mm; }
.dark .step-card i { color: #8db6ff; }
.step-card strong { display: block; font-size: 16px; font-weight: 900; margin-bottom: 3mm; line-height: 1.3; }
.step-card span { display: block; color: #6b7280; font-size: 11px; font-weight: 700; line-height: 1.5; }
.dark .step-card span { color: rgba(255,255,255,.66); }
.footer { position: absolute; left: 21mm; right: 21mm; bottom: 10mm; display: flex; justify-content: space-between; color: #9ca3af; font-size: 9px; font-weight: 700; }
.dark .footer { color: rgba(255,255,255,.42); }
.tag-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8mm; }
.tag { border: 1px solid rgba(37,99,235,.18); background: #eff6ff; color: #1d4ed8; border-radius: 999px; padding: 7px 10px; font-size: 11px; font-weight: 900; }
.dark .tag { background: rgba(37,99,235,.16); border-color: rgba(147,197,253,.24); color: #bfdbfe; }
.checklist { display: grid; gap: 3.5mm; margin-top: 11mm; }
.check {
  display: grid;
  grid-template-columns: 8mm 1fr;
  gap: 3mm;
  align-items: start;
  padding: 4.5mm 0;
  border-top: 1px solid rgba(17,24,39,.08);
}
.check:first-child { border-top: 0; }
.mark { width: 7mm; height: 7mm; border-radius: 50%; background: #2563eb; color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 900; }
.check strong { display: block; font-size: 15px; line-height: 1.35; margin-bottom: 1.2mm; font-weight: 900; }
.check span { display: block; color: #6b7280; font-size: 11px; line-height: 1.55; font-weight: 700; }
.guide-label { display: inline-flex; align-items: center; height: 25px; padding: 0 10px; border-radius: 999px; background: #111827; color: #fff; font-size: 10px; font-weight: 900; margin-bottom: 5mm; }
.two-shots { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; align-items: center; }
.two-shots .mockup { aspect-ratio: 1.517 / 1; }
.quote {
  margin-top: 12mm;
  padding: 9mm;
  background: #111827;
  color: #fff;
  border-radius: 18px;
}
.quote strong { font-size: 20px; line-height: 1.45; display: block; font-weight: 900; }
.quote span { display: block; margin-top: 4mm; color: rgba(255,255,255,.66); font-size: 11px; line-height: 1.55; font-weight: 700; }
.cover-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.08); border-radius: 999px; color: rgba(255,255,255,.82); font-size: 11px; font-weight: 900; margin-bottom: 10mm; }
.cover-line { position: absolute; left: 21mm; right: 21mm; bottom: 32mm; height: 1px; background: rgba(255,255,255,.14); }
.cover-meta { position: absolute; left: 21mm; right: 21mm; bottom: 18mm; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8mm; color: rgba(255,255,255,.64); font-size: 11px; line-height: 1.55; font-weight: 700; }
.cover-meta b { display: block; color: #fff; font-size: 13px; margin-bottom: 1mm; }
`;

const footer = (title, page) => `
  <div class="footer"><span>${title}</span><span>${String(page).padStart(2, "0")}</span></div>
`;

const introDeck = `
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>연락미 광고주 실무자 소개서</title>
  <style>${commonCss}</style>
</head>
<body>
<main class="deck">
  <section class="page dark">
    <div class="brand-row">
      <div class="brand"><span class="brand-mark">Y</span>연락미</div>
      <div class="meta">Advertiser Practitioner Deck</div>
    </div>
    <div class="hero-grid">
      <div>
        <div class="cover-badge">광고주 실무자 소개서</div>
        <h1>광고 협업을<br />계약 기준으로<br />운영합니다.</h1>
        <p class="lead">인플루언서 협업에서 조건, 검토, 서명, 제출, 보고까지 흩어지는 일을 한 흐름으로 묶는 광고주 운영 도구입니다.</p>
        <div class="tag-row">
          <span class="tag">계약 작성</span>
          <span class="tag">수정 기록</span>
          <span class="tag">상태 관리</span>
          <span class="tag">보고 내보내기</span>
        </div>
      </div>
      <div class="mockup dark-card screen-wide">
        <img src="${assets.dashboard}" alt="연락미 광고주 1:1 계약 대시보드" />
      </div>
    </div>
    <div class="cover-line"></div>
    <div class="cover-meta">
      <div><b>대상</b>광고주 운영 담당자, 브랜드 매니저, 캠페인 실무자</div>
      <div><b>목적</b>계약 누락과 진행 착오를 줄이고 내부 보고까지 연결</div>
      <div><b>기준</b>실제 서비스 화면 기반</div>
    </div>
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Problem</div></div>
    <div class="split">
      <div>
        <div class="kicker">왜 필요한가</div>
        <h2>협업 리스크는<br />기록이 흩어질 때<br />생깁니다.</h2>
        <p class="lead">메일, 메신저, 시트, PDF가 따로 움직이면 조건 확인과 책임 소재가 늦어집니다. 연락미는 실무자가 매일 확인해야 하는 상태와 다음 액션을 한 곳에 남깁니다.</p>
      </div>
      <div class="stack">
        <div class="metric"><b>조건 누락</b><span>플랫폼, 컨텐츠 형태, 일정, 지급 조건이 대화 속에 섞이면 계약서 반영 여부를 다시 확인해야 합니다.</span></div>
        <div class="metric"><b>수정 이력 분산</b><span>조항 수정 요청이 메신저에 남으면 누가 어떤 조건에 동의했는지 추적하기 어렵습니다.</span></div>
        <div class="metric"><b>보고 자료 재가공</b><span>계약 현황을 내부 시트로 다시 옮기는 일이 반복되면 마감과 상태가 어긋납니다.</span></div>
      </div>
    </div>
    ${footer("광고주 실무자 소개서", 2)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Contract Builder</div></div>
    <div class="split">
      <div>
        <div class="kicker">계약 작성</div>
        <h2>플랫폼과 컨텐츠를<br />순서대로 정리합니다.</h2>
        <p class="lead">플랫폼을 먼저 고르고, 그 플랫폼에서 필요한 컨텐츠 형태를 선택합니다. 같은 플랫폼 안에서 컨텐츠를 추가하거나, 필요할 때 플랫폼을 더하는 방식이라 작성 흐름이 복잡해지지 않습니다.</p>
        <div class="points">
          <div class="point"><span class="num">1</span><div><strong>플랫폼 선택</strong><span>Instagram, YouTube, Naver, TikTok 등 협업 채널을 먼저 정합니다.</span></div></div>
          <div class="point"><span class="num">2</span><div><strong>컨텐츠 조건 입력</strong><span>릴스, 숏폼, 롱폼, 블로그 원고처럼 실제 산출 방식에 맞춰 조건을 남깁니다.</span></div></div>
          <div class="point"><span class="num">3</span><div><strong>계약서 초안 자동 정리</strong><span>입력한 조건이 PDF 계약 문서 흐름 안에 반영됩니다.</span></div></div>
        </div>
      </div>
      <div class="mockup screen-wide">
        <img src="${assets.builder}" alt="플랫폼과 컨텐츠를 먼저 선택하는 계약서 작성 화면" />
      </div>
    </div>
    ${footer("광고주 실무자 소개서", 3)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Document Review</div></div>
    <div class="split equal">
      <div>
        <div class="kicker">계약서 확인</div>
        <h2>상대방이 보는 문서는<br />실제 계약서 원문입니다.</h2>
        <p class="lead">요약 카드가 아니라 광고주가 작성한 계약 조건이 PDF 문서 형태로 정리됩니다. 검토, 공유, 서명 전 단계에서 같은 문서를 기준으로 확인합니다.</p>
        <div class="quote"><strong>“조건이 바뀌었는지”보다 “어떤 문서에 동의했는지”가 먼저 보여야 합니다.</strong><span>계약 본문을 중심에 두면 실무자와 크리에이터가 같은 기준으로 대화할 수 있습니다.</span></div>
      </div>
      <div class="mockup screen-paper">
        <img src="${assets.contractPdf}" alt="연락미 계약서 PDF 원문 미리보기" />
      </div>
    </div>
    ${footer("광고주 실무자 소개서", 4)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Operational Dashboard</div></div>
    <div class="split">
      <div>
        <div class="kicker">상태 관리</div>
        <h2>오늘 처리할 1:1 계약을<br />대시보드에서 봅니다.</h2>
        <p class="lead">작성중, 진행중, 종료 상태를 나누고 수정 요청, 검토 대기, 서명 준비처럼 실제 다음 행동이 필요한 항목을 빠르게 찾습니다.</p>
        <div class="note-box"><strong>고정된 대시보드 공간</strong><span>계약이 적어도 표 영역은 유지됩니다. 비어 있는 공간은 운영 여백으로 남고, 필요한 CTA만 명확하게 보입니다.</span></div>
      </div>
      <div class="mockup screen-wide">
        <img src="${assets.dashboard}" alt="1:1 계약 대시보드 작성중 탭" />
      </div>
    </div>
    ${footer("광고주 실무자 소개서", 5)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Campaign Workflow</div></div>
    <div class="split">
      <div>
        <div class="kicker">캠페인 모집</div>
        <h2>지원자 선정 후<br />선정자별 진행을 관리합니다.</h2>
        <p class="lead">지원자 목록에서 크리에이터 프로필과 채널 정보를 보고 선정합니다. 선정 이후에는 모집 조건을 기준으로 계약서, 서명, 제출 상태를 캠페인 안에서 이어갑니다.</p>
        <div class="points">
          <div class="point"><span class="num">1</span><div><strong>지원자 확인</strong><span>사진, 이름, 인증 채널, 팔로워 규모를 한눈에 봅니다.</span></div></div>
          <div class="point"><span class="num">2</span><div><strong>프로필 검토</strong><span>크리에이터의 공개 프로필과 채널을 확인합니다.</span></div></div>
          <div class="point"><span class="num">3</span><div><strong>계약서 준비</strong><span>선정한 지원자별 계약서와 서명 진행을 캠페인 안에서 시작합니다.</span></div></div>
        </div>
      </div>
      <div class="mockup screen-wide screen-applicants">
        <img src="${assets.applicants}" alt="캠페인 지원자 선정 화면" />
      </div>
    </div>
    ${footer("광고주 실무자 소개서", 6)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Reporting</div></div>
    <div class="split">
      <div>
        <div class="kicker">내부 보고</div>
        <h2>운영 현황은<br />엑셀과 스프레드시트로<br />내보냅니다.</h2>
        <p class="lead">대시보드에서 내보내기를 누르면 파일 다운로드와 Google 스프레드시트 생성을 선택할 수 있습니다. 실무팀이 이미 쓰는 보고 방식으로 이어지게 하는 구조입니다.</p>
        <div class="fact-list">
          <div class="fact-row"><b>XLSX</b><span>바로 다운로드해서 내부 파일로 보관합니다.</span></div>
          <div class="fact-row"><b>Sheets</b><span>사용자가 동의하면 Google Drive에 새 시트를 생성합니다.</span></div>
          <div class="fact-row"><b>Safe</b><span>공유 토큰, 원본 서명, private storage 경로는 내보내지 않습니다.</span></div>
        </div>
      </div>
      <div class="mockup export-visual">
        <img class="export-backdrop" src="${assets.dashboard}" alt="" />
        <div class="export-modal" aria-label="내보내기 선택 모달">
          <div class="export-modal-head"><h3>내보내기</h3><span class="export-close">×</span></div>
          <div class="export-option">
            <span class="export-icon">↓</span>
            <div><strong>엑셀 파일</strong><span>.xlsx로 바로 다운로드</span></div>
          </div>
          <div class="export-option google">
            <span class="export-icon">S</span>
            <div><strong>Google 스프레드시트</strong><span>연결된 Google Drive에 새 시트 생성</span></div>
          </div>
        </div>
      </div>
    </div>
    ${footer("광고주 실무자 소개서", 7)}
  </section>

  <section class="page dark">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Summary</div></div>
    <div class="split">
      <div>
        <div class="cover-badge">운영 기준</div>
        <h2>광고 협업은<br />기억이 아니라<br />기록으로 운영합니다.</h2>
        <p class="lead">계약 조건을 구조화하고, 상대방 검토와 서명을 문서 기준으로 남기고, 대시보드와 시트로 내부 운영까지 연결합니다.</p>
      </div>
      <div>
        <div class="workflow">
          <div class="step-card"><i>01</i><strong>조건 작성</strong><span>플랫폼, 컨텐츠, 일정, 지급 조건을 입력합니다.</span></div>
          <div class="step-card"><i>02</i><strong>계약 확인</strong><span>PDF 문서 기준으로 검토하고 공유합니다.</span></div>
          <div class="step-card"><i>03</i><strong>진행 관리</strong><span>1:1 계약은 계약 화면, 캠페인은 캠페인 상세에서 이어갑니다.</span></div>
          <div class="step-card"><i>04</i><strong>보고 연결</strong><span>엑셀 또는 Google 스프레드시트로 내보냅니다.</span></div>
        </div>
        <div class="quote" style="background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.12);"><strong>광고 협업을 반복 운영할수록 필요한 것은 더 많은 설명이 아니라 같은 기준의 기록입니다.</strong><span>yeollock.me</span></div>
      </div>
    </div>
    ${footer("광고주 실무자 소개서", 8)}
  </section>
</main>
</body>
</html>
`;

const guideDeck = `
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>연락미 광고주 운영 가이드</title>
  <style>${commonCss}</style>
</head>
<body>
<main class="deck">
  <section class="page dark">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Advertiser Operation Guide</div></div>
    <div class="hero-grid">
      <div>
        <div class="cover-badge">광고주 실무 운영 가이드</div>
        <h1>계약 작성부터<br />완료 관리까지.</h1>
        <p class="lead">팀에서 바로 공유할 수 있는 실무 흐름 중심 문서입니다. 각 단계에서 무엇을 확인하고 어떤 상태를 봐야 하는지만 남겼습니다.</p>
      </div>
      <div class="mockup dark-card screen-wide">
        <img src="${assets.detail}" alt="계약 상세 진행 화면" />
      </div>
    </div>
    <div class="cover-line"></div>
    <div class="cover-meta">
      <div><b>사용자</b>광고주 운영 담당자</div>
      <div><b>범위</b>계약 작성부터 보고 내보내기까지</div>
      <div><b>원칙</b>한 화면에서 다음 액션을 확인</div>
    </div>
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Daily View</div></div>
    <div class="split">
      <div>
        <span class="guide-label">STEP 01</span>
        <h2>출근 후 먼저<br />1:1 계약 대시보드를 봅니다.</h2>
        <div class="checklist">
          <div class="check"><span class="mark">✓</span><div><strong>작성중</strong><span>아직 공유하지 않은 계약 초안입니다. 조건 입력이 끝났는지 확인합니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>진행중</strong><span>검토, 수정, 서명, 콘텐츠 제출처럼 상대방과 주고받는 계약입니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>종료</strong><span>완료된 계약과 서명본을 확인하는 구간입니다.</span></div></div>
        </div>
      </div>
      <div class="mockup screen-wide">
        <img src="${assets.dashboard}" alt="광고주 1:1 계약 대시보드" />
      </div>
    </div>
    ${footer("광고주 운영 가이드", 2)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Create Contract</div></div>
    <div class="split">
      <div>
        <span class="guide-label">STEP 02</span>
        <h2>계약 작성은<br />플랫폼 선택에서 시작합니다.</h2>
        <p class="lead">처음부터 모든 채널을 펼치지 않습니다. 하나의 플랫폼을 고른 뒤 그 안에서 컨텐츠를 선택하고, 필요할 때 컨텐츠나 플랫폼을 추가합니다.</p>
        <div class="points">
          <div class="point"><span class="num">1</span><div><strong>플랫폼</strong><span>인스타그램, 유튜브, 네이버, 틱톡 중 계약할 채널을 선택합니다.</span></div></div>
          <div class="point"><span class="num">2</span><div><strong>컨텐츠</strong><span>릴스, 피드, 스토리, 숏폼, 롱폼, 블로그 원고처럼 실제 제공물을 고릅니다.</span></div></div>
          <div class="point"><span class="num">3</span><div><strong>조건</strong><span>영상은 길이, 블로그는 글자수와 사진 수처럼 컨텐츠에 맞는 기준을 입력합니다.</span></div></div>
        </div>
      </div>
      <div class="mockup screen-wide">
        <img src="${assets.builder}" alt="계약 작성 1단계 화면" />
      </div>
    </div>
    ${footer("광고주 운영 가이드", 3)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Before Sharing</div></div>
    <div class="split equal">
      <div>
        <span class="guide-label">STEP 03</span>
        <h2>공유 전에는<br />계약서 원문을 확인합니다.</h2>
        <div class="checklist">
          <div class="check"><span class="mark">✓</span><div><strong>브랜드와 담당자 정보</strong><span>상대방이 계약 주체를 바로 알 수 있어야 합니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>플랫폼과 컨텐츠</strong><span>릴스, 숏폼, 블로그 원고 등 실제 제출 항목이 계약서에 반영되어야 합니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>기간, 마감, 지급 조건</strong><span>운영자가 관리할 날짜와 금액이 한 문서에 들어가야 합니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>특약</strong><span>별도 조건이 없다면 비워두고, 있다면 구체적으로 적습니다.</span></div></div>
        </div>
      </div>
      <div class="mockup screen-paper">
        <img src="${assets.contractPdf}" alt="계약서 PDF 원문" />
      </div>
    </div>
    ${footer("광고주 운영 가이드", 4)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Review and Revision</div></div>
    <div class="split">
      <div>
        <span class="guide-label">STEP 04</span>
        <h2>수정 요청은<br />계약 화면에서 처리합니다.</h2>
        <p class="lead">수정할 조항과 요청 내용을 명확히 남깁니다. 이후 검토, 반영, 서명 단계에서 같은 기록을 기준으로 확인할 수 있습니다.</p>
        <div class="points">
          <div class="point"><span class="num">1</span><div><strong>요청 내용 확인</strong><span>상대방이 어떤 조항을 바꾸고 싶은지 확인합니다.</span></div></div>
          <div class="point"><span class="num">2</span><div><strong>수정 또는 유지 결정</strong><span>운영 기준에 맞춰 반영 여부를 판단합니다.</span></div></div>
          <div class="point"><span class="num">3</span><div><strong>다음 액션 실행</strong><span>서명 링크 만들기, PDF 내려받기, 서명 단계 이동을 한 화면에서 처리합니다.</span></div></div>
        </div>
      </div>
      <div class="mockup screen-wide">
        <img src="${assets.detail}" alt="계약 상세 조항 검토 화면" />
      </div>
    </div>
    ${footer("광고주 운영 가이드", 5)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Campaign Applicants</div></div>
    <div class="split">
      <div>
        <span class="guide-label">STEP 05</span>
        <h2>지원자 선정 후<br />선정자별 진행을 이어갑니다.</h2>
        <p class="lead">캠페인 조건은 모집 단계에서 정해집니다. 지원자를 선택하면 그 조건을 기준으로 계약서를 만들고, 이후 서명과 제출 상태는 캠페인 상세에서 함께 봅니다.</p>
        <div class="checklist">
          <div class="check"><span class="mark">✓</span><div><strong>프로필과 채널 확인</strong><span>사진, 이름, 인증 플랫폼, 팔로워 규모를 보고 선정합니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>선정자별 계약서</strong><span>지원자와 캠페인 조건을 다시 입력하지 않고 계약서를 준비합니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>캠페인 안에서 관리</strong><span>서명, 제출, 완료 상태를 캠페인 상세에서 선정자별로 봅니다.</span></div></div>
        </div>
      </div>
      <div class="mockup screen-wide screen-applicants">
        <img src="${assets.applicants}" alt="캠페인 지원자 관리 화면" />
      </div>
    </div>
    ${footer("광고주 운영 가이드", 6)}
  </section>

  <section class="page">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Export</div></div>
    <div class="split">
      <div>
        <span class="guide-label">STEP 06</span>
        <h2>보고는 대시보드<br />내보내기로 처리합니다.</h2>
        <p class="lead">엑셀 파일은 즉시 다운로드합니다. Google 스프레드시트는 사용자 동의 후 연결된 Drive에 새 시트를 만들고, 팀 보고나 공유 자료로 활용합니다.</p>
        <div class="checklist">
          <div class="check"><span class="mark">✓</span><div><strong>필터 확인</strong><span>필터가 적용되어 있으면 현재 조건에 맞는 결과를 내보냅니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>형식 선택</strong><span>파일 보관은 엑셀, 협업 보고는 Google 스프레드시트를 선택합니다.</span></div></div>
          <div class="check"><span class="mark">✓</span><div><strong>민감 데이터 제외</strong><span>공유 토큰, 서명 원본, private storage 경로는 운영 내보내기에 포함하지 않습니다.</span></div></div>
        </div>
      </div>
      <div class="mockup export-visual">
        <img class="export-backdrop" src="${assets.dashboard}" alt="" />
        <div class="export-modal" aria-label="내보내기 선택 모달">
          <div class="export-modal-head"><h3>내보내기</h3><span class="export-close">×</span></div>
          <div class="export-option">
            <span class="export-icon">↓</span>
            <div><strong>엑셀 파일</strong><span>.xlsx로 바로 다운로드</span></div>
          </div>
          <div class="export-option google">
            <span class="export-icon">S</span>
            <div><strong>Google 스프레드시트</strong><span>연결된 Google Drive에 새 시트 생성</span></div>
          </div>
        </div>
      </div>
    </div>
    ${footer("광고주 운영 가이드", 7)}
  </section>

  <section class="page dark">
    <div class="brand-row"><div class="brand"><span class="brand-mark">Y</span>연락미</div><div class="meta">Daily Routine</div></div>
    <div class="split">
      <div>
        <span class="guide-label" style="background:#fff;color:#111827;">DAILY ROUTINE</span>
        <h2>매일 5분,<br />이 순서만 확인합니다.</h2>
        <p class="lead">상태 확인, 지연 계약 처리, 수정 요청 응답, 완료 계약 보관, 보고 내보내기 순서로 반복하면 됩니다.</p>
      </div>
      <div class="workflow">
        <div class="step-card"><i>01</i><strong>진행중 탭 확인</strong><span>마감일과 현재 단계를 먼저 봅니다.</span></div>
        <div class="step-card"><i>02</i><strong>수정 요청 처리</strong><span>요청 내용이 명확한지 확인하고 반영 여부를 결정합니다.</span></div>
        <div class="step-card"><i>03</i><strong>서명·제출 대기 확인</strong><span>상대방 액션이 필요한 계약을 추적합니다.</span></div>
        <div class="step-card"><i>04</i><strong>보고 내보내기</strong><span>필요한 기간과 상태를 필터링한 뒤 시트로 전달합니다.</span></div>
      </div>
    </div>
    ${footer("광고주 운영 가이드", 8)}
  </section>
</main>
</body>
</html>
`;

const docs = [
  {
    name: "advertiser-practitioner-introduction",
    html: introDeck,
    title: "연락미 광고주 실무자 소개서",
  },
  {
    name: "advertiser-practitioner-guide",
    html: guideDeck,
    title: "연락미 광고주 운영 가이드",
  },
];

async function ensureDirs() {
  await fs.mkdir(salesDir, { recursive: true });
  await fs.mkdir(reviewDir, { recursive: true });
}

async function writeDocs() {
  for (const doc of docs) {
    await fs.writeFile(
      path.join(salesDir, `${doc.name}.html`),
      doc.html.replace(/[ \t]+$/gm, ""),
      "utf8",
    );
  }
}

async function render() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  for (const doc of docs) {
    const htmlPath = path.join(salesDir, `${doc.name}.html`);
    const pdfPath = path.join(salesDir, `${doc.name}.pdf`);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    await page.emulateMedia({ media: "screen" });

    const pageCount = await page.locator(".page").count();
    for (let i = 0; i < pageCount; i += 1) {
      await page.locator(".page").nth(i).screenshot({
        path: path.join(reviewDir, `${doc.name}-page-${String(i + 1).padStart(2, "0")}.png`),
      });
    }
    await buildContactSheet(context, doc, pageCount);
  }

  await browser.close();
}

async function buildContactSheet(context, doc, pageCount) {
  const thumbs = Array.from({ length: pageCount }, (_, index) => {
    const filename = `${doc.name}-page-${String(index + 1).padStart(2, "0")}.png`;
    return `<figure><img src="${filename}" alt="${doc.title} ${index + 1}페이지" /><figcaption>${index + 1}</figcaption></figure>`;
  }).join("");
  const sheetHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>${doc.title} 리뷰</title><style>
    @font-face { font-family: "NanumSquareNeo"; src: url("${path.relative(reviewDir, path.join(root, "public/fonts/nanum-square-neo/NanumSquareNeoTTF-bRg.woff2")).replaceAll("\\", "/")}") format("woff2"); font-weight: 400; }
    @font-face { font-family: "NanumSquareNeo"; src: url("${path.relative(reviewDir, path.join(root, "public/fonts/nanum-square-neo/NanumSquareNeoTTF-cBd.woff2")).replaceAll("\\", "/")}") format("woff2"); font-weight: 700; }
    * { box-sizing: border-box; } body { margin: 0; padding: 32px; background: #eef1f4; font-family: "NanumSquareNeo", sans-serif; color: #111827; }
    header { display: flex; align-items: end; justify-content: space-between; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; } p { margin: 6px 0 0; color: #6b7280; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    figure { margin: 0; background: #fff; border: 1px solid rgba(17,24,39,.1); border-radius: 14px; overflow: hidden; box-shadow: 0 18px 45px rgba(15,23,42,.10); }
    img { display: block; width: 100%; }
    figcaption { padding: 10px 14px; color: #6b7280; font-size: 13px; font-weight: 700; border-top: 1px solid rgba(17,24,39,.08); }
  </style></head><body><header><div><h1>${doc.title}</h1><p>페이지별 렌더링 리뷰 보드</p></div><p>${pageCount} pages</p></header><section class="grid">${thumbs}</section></body></html>`;
  const sheetPath = path.join(reviewDir, `${doc.name}-review.html`);
  await fs.writeFile(sheetPath, sheetHtml, "utf8");
  const page = await context.newPage({ viewport: { width: 1720, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(sheetPath).href, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(reviewDir, `${doc.name}-review.png`), fullPage: true });
  await page.close();
}

await ensureDirs();
await writeDocs();
await render();

for (const doc of docs) {
  console.log(path.join("docs", "sales", `${doc.name}.pdf`));
  console.log(path.join("docs", "sales", "review", "advertiser-practitioner-docs", `${doc.name}-review.png`));
}
