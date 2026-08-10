import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  campaignProposalTypeOptions,
  formatCampaignApplicationStats,
  oneToOneProposalTypeOptions,
  parseCampaignGuideline,
  proposalTypeLabels,
  resolveCampaignApplicationCountSync,
  splitCampaignGuidelineParagraphs,
} from "../src/domain/marketplace.ts";
import {
  CAMPAIGN_OG_LAYOUT_VERSION,
  CAMPAIGN_TITLE_MAX_GRAPHEMES,
  CAMPAIGN_TITLE_MAX_UNBROKEN_GRAPHEMES,
  countCampaignTitleGraphemes,
  getCampaignOgImagePath,
  getCampaignOgImageVersion,
  getCampaignTitleFontSize,
  getCampaignTitleValidationError,
  normalizeCampaignTitle,
} from "../src/domain/campaignPresentation.ts";
import {
  buildCampaignShareMetadata,
  buildContractShareMetadata,
  injectShareMetadata,
  layoutCampaignOgTitle,
  renderCampaignShareImage,
  renderContractShareImage,
} from "../server/share-preview.tsx";

const operatingCampaignGuideline = `[캠페인 소개]
연락미에 직접 가입하고 캠페인 신청까지 진행한 뒤, 처음 이용하는 인플루언서가 그대로 따라 할 수 있는 네이버 블로그 가이드를 작성해 주세요.

[필수 구성]
1. 연락미 가입 과정
- 연락미 홈에서 ‘인플루언서로 시작’ 선택
- 이메일 인증
- 기본 프로필 입력
- 인플루언서 대시보드 진입

예시
“연락미 홈에서 인플루언서로 시작해 이메일 인증을 마치면 대시보드가 열립니다.”

2. 캠페인 신청 과정
- 캠페인 탭 진입
- 모집글 선택
- 보상·모집마감·콘텐츠 조건 확인
- 플랫폼 계정 인증
- 신청 완료

예시
“캠페인 카드에서 보상과 마감일을 확인한 뒤 상세를 열어 신청하기를 누릅니다.”

3. 연락미 강점
- 캠페인과 1:1 계약을 목적에 맞게 구분
- 금액·콘텐츠·마감·선정 상태를 한곳에서 확인
- 선정 후 계약서·전자서명·PDF 증빙까지 이어서 관리

각 강점은 직접 확인한 화면과 함께 본인의 표현으로 설명해 주세요.

[작성 기준]
- 제목에 ‘연락미’와 ‘블로그 체험단’ 포함
- 본문에 ‘연락미’, ‘인플루언서 캠페인’, ‘캠페인 신청’을 자연스럽게 포함
- 본문 1,200자 이상
- 직접 캡처한 이미지 8장 이상
- 첫 화면에 “본 포스팅은 연락미로부터 모바일 상품권을 제공받아 작성했습니다.” 표시
- https://yeollock.me 링크 포함
- #연락미 #인플루언서캠페인 #블로그체험단 #캠페인신청 #전자계약 포함
- 이메일·전화번호·비밀번호·인증코드는 반드시 가림 처리
- 직접 경험한 사실을 중심으로 작성하며 긍정 표현은 강요하지 않습니다.
- 게시물은 6개월 이상 공개 유지`;

test("campaign titles use one normalized 40-grapheme rule and fixed OG font tiers", () => {
  assert.equal(normalizeCampaignTitle("  여름\n\t캠페인  "), "여름 캠페인");
  assert.equal(countCampaignTitleGraphemes("👨‍👩‍👧‍👦"), 1);
  assert.equal(
    getCampaignTitleValidationError(`${"가".repeat(20)} ${"나".repeat(19)}`),
    undefined,
  );
  assert.equal(
    getCampaignTitleValidationError("가".repeat(41)),
    `캠페인명은 ${CAMPAIGN_TITLE_MAX_GRAPHEMES}자 이내로 입력해 주세요.`,
  );
  assert.equal(
    getCampaignTitleValidationError("가".repeat(21)),
    `긴 단어는 ${CAMPAIGN_TITLE_MAX_UNBROKEN_GRAPHEMES}자 안에서 띄어쓰기를 추가해 주세요.`,
  );
  assert.deepEqual(
    [16, 17, 24, 25, 32, 33, 40].map((length) =>
      getCampaignTitleFontSize("가".repeat(length)),
    ),
    [80, 68, 68, 60, 60, 52, 52],
  );
  const imageIdentity = {
    id: "campaign-id",
    title: "여름 캠페인",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
  assert.equal(
    getCampaignOgImageVersion(imageIdentity),
    getCampaignOgImageVersion(imageIdentity),
  );
  assert.notEqual(
    getCampaignOgImageVersion(imageIdentity),
    getCampaignOgImageVersion({
      ...imageIdentity,
      updatedAt: "2026-08-11T00:00:00.000Z",
    }),
  );
  assert.equal(
    getCampaignOgImagePath(),
    `/api/og/campaigns/generic?v=${CAMPAIGN_OG_LAYOUT_VERSION}`,
  );
});

test("reporter group is a campaign-only type with one customer label", () => {
  assert.equal(proposalTypeLabels.reporter_group, "기자단");
  assert.equal(campaignProposalTypeOptions.includes("reporter_group"), true);
  assert.equal(oneToOneProposalTypeOptions.includes("reporter_group"), false);
});

test("OG images use the same NanumSquareNeo weights as the product UI", async () => {
  const [sharePreview, serverEntry, packageJson, vercelConfig, productCss, inbox, campaignPages] = await Promise.all([
    readFile(new URL("../server/share-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
    readFile(
      new URL("../src/pages/marketplace/MarketplaceInboxPage.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/pages/marketplace/CampaignPages.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(productCss, /font-family: 'NanumSquareNeo'/);
  assert.match(productCss, /font-family: 'NanumSquareNeoExtraBold'/);
  assert.match(productCss, /font-family: 'NanumSquareNeoHeavy'/);
  assert.match(sharePreview, /NanumSquareNeo-bRg\.ttf/);
  assert.match(sharePreview, /NanumSquareNeo-dEb\.ttf/);
  assert.match(sharePreview, /NanumSquareNeo-eHv\.ttf/);
  assert.match(sharePreview, /fontFamily: "NanumSquareNeo"/);
  assert.doesNotMatch(sharePreview, /NanumGothic/);
  assert.match(serverEntry, /from "\.\/share-preview\.js"/);
  assert.match(packageJson, /"build:share-preview": "esbuild server\/share-preview\.tsx/);
  assert.match(vercelConfig, /server\/share-preview\.js/);
  assert.ok(
    sharePreview.indexOf("visiblePlatforms.map") <
      sharePreview.indexOf('color: "#2563eb"'),
  );
  assert.match(
    sharePreview,
    /size=\{isCampaign \? 64 : 52\}[\s\S]*iconSize=\{isCampaign \? 46 : 37\}[\s\S]*fontSize: isCampaign \? 42 : 34/,
  );
  assert.match(
    sharePreview,
    /marginTop: isCampaign \? 92 : 42,[\s\S]*height: isCampaign \? 48 : 34,[\s\S]*fontSize: 28,[\s\S]*fontWeight: 800/,
  );
  assert.match(
    sharePreview,
    /marginTop: isCampaign \? 12 : 18,[\s\S]*fontSize: isCampaign \? 28 : 34,[\s\S]*fontSize: isCampaign \? 28 : 27,[\s\S]*marginTop: isCampaign \? 28 : 18/,
  );
  assert.doesNotMatch(sharePreview, /visiblePlatforms\.length > 0 \? 18/);
  assert.match(sharePreview, /variant="campaign"/);
  assert.match(sharePreview, /variant="contract"/);
  assert.match(sharePreview, /getCampaignOgImagePath/);
  assert.match(campaignPages, /getCampaignOgImagePath\(campaign\)/);
  assert.match(inbox, /oneToOneProposalTypeOptions/);
  assert.doesNotMatch(inbox, /campaignProposalTypeOptions/);
});

test("campaign OG titles always fit one or two precomputed lines", () => {
  const samples = [
    "짧은 캠페인",
    "여름 러닝 챌린지 릴스 크리에이터 모집",
    "가".repeat(20),
    "네이버 블로그 기자단 여름 신제품 체험 후기 콘텐츠 모집",
  ];
  for (const sample of samples) {
    const layout = layoutCampaignOgTitle(sample);
    assert.ok(layout.lines.length >= 1 && layout.lines.length <= 2);
    assert.ok(layout.fontSize >= 44 && layout.fontSize <= 80);
    assert.equal(layout.lines.some((line) => line.length === 0), false);
  }
  assert.deepEqual(layoutCampaignOgTitle("가".repeat(40)).lines, [
    "인플루언서 캠페인",
  ]);
});

test("campaign and contract share metadata use exact public copy without private token leakage", () => {
  const campaign = {
    id: "4b57fcee-6d4a-4c73-bcb0-3c8e88176158",
    title: "연락미 가입부터 캠페인 신청까지",
    typeLabel: "기자단",
    platforms: ["naver_blog" as const],
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
  const campaignMetadata = buildCampaignShareMetadata(campaign.id, campaign);
  assert.equal(
    campaignMetadata.title,
    "연락미 | 연락미 가입부터 캠페인 신청까지",
  );
  assert.equal(
    campaignMetadata.imageUrl,
    `https://yeollock.me${getCampaignOgImagePath(campaign)}`,
  );
  const genericCampaignMetadata = buildCampaignShareMetadata("missing-campaign");
  assert.equal(
    genericCampaignMetadata.imageUrl,
    `https://yeollock.me/api/og/campaigns/generic?v=${CAMPAIGN_OG_LAYOUT_VERSION}`,
  );
  const campaignHtml = injectShareMetadata(
    "<!doctype html><html><head><title>old</title></head><body></body></html>",
    campaignMetadata,
  );
  assert.ok(
    campaignHtml.includes(
      `property="og:image" content="${campaignMetadata.imageUrl}"`,
    ),
  );
  assert.ok(
    campaignHtml.includes(
      `property="og:image:secure_url" content="${campaignMetadata.imageUrl}"`,
    ),
  );
  assert.ok(
    campaignHtml.includes(
      `name="twitter:image" content="${campaignMetadata.imageUrl}"`,
    ),
  );

  const contractMetadata = buildContractShareMetadata("contract-id");
  assert.equal(contractMetadata.title, "연락미 | 계약서 확인");
  assert.equal(contractMetadata.imageUrl, "https://yeollock.me/api/og/contract");
  const html = injectShareMetadata(
    "<!doctype html><html><head><title>old</title></head><body></body></html>",
    contractMetadata,
  );
  assert.match(html, /<title>연락미 \| 계약서 확인<\/title>/);
  assert.doesNotMatch(html, /share_token|secret|old/iu);
  assert.match(html, /noindex,nofollow,noarchive/);
});

test("campaign and contract share images render as 1200 by 630 PNG files", async () => {
  const campaignImage = await renderCampaignShareImage({
    id: "4b57fcee-6d4a-4c73-bcb0-3c8e88176158",
    title: "네이버 블로그 기자단 모집",
    typeLabel: "기자단",
    platforms: ["naver_blog"],
  });
  const contractImage = await renderContractShareImage();
  for (const image of [campaignImage, contractImage]) {
    assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(image.readUInt32BE(16), 1200);
    assert.equal(image.readUInt32BE(20), 630);
  }
});

test("campaign guidelines normalize CRLF and preserve intentional line breaks", () => {
  assert.deepEqual(
    splitCampaignGuidelineParagraphs(
      "첫 문단 첫 줄\r\n첫 문단 둘째 줄\r\n\r\n둘째 문단\n\n\n셋째 문단",
    ),
    ["첫 문단 첫 줄\n첫 문단 둘째 줄", "둘째 문단", "셋째 문단"],
  );
});

test("campaign guideline parser preserves every operating paragraph and safe text row", () => {
  const paragraphs = parseCampaignGuideline(operatingCampaignGuideline);
  const lines = paragraphs.flatMap((paragraph) => paragraph.lines);
  const originalLines = operatingCampaignGuideline.split("\n");
  const originalNonEmptyLines = originalLines.filter(
    (line) => line.trim().length > 0,
  );

  assert.equal(originalLines.length, 41);
  assert.equal(originalLines.filter((line) => line.length === 0).length, 7);
  assert.equal(paragraphs.length, 8);
  assert.equal(lines.length, 34);
  assert.deepEqual(
    lines.map((line) => line.text),
    originalNonEmptyLines,
  );
  assert.deepEqual(
    lines.reduce<Record<string, number>>((counts, line) => {
      counts[line.kind] = (counts[line.kind] ?? 0) + 1;
      return counts;
    }, {}),
    { section: 3, body: 4, numbered: 3, bullet: 22, example: 2 },
  );
  assert.deepEqual(
    lines.map((line) => line.kind),
    [
      "section",
      "body",
      "section",
      "numbered",
      ...Array(4).fill("bullet"),
      "example",
      "body",
      "numbered",
      ...Array(5).fill("bullet"),
      "example",
      "body",
      "numbered",
      ...Array(3).fill("bullet"),
      "body",
      "section",
      ...Array(10).fill("bullet"),
    ],
  );
  assert.deepEqual(
    lines
      .filter((line) => line.kind === "numbered")
      .map((line) => [line.marker, line.content]),
    [
      ["1.", "연락미 가입 과정"],
      ["2.", "캠페인 신청 과정"],
      ["3.", "연락미 강점"],
    ],
  );

  const unsafeLookingLines = parseCampaignGuideline(
    "[안내]\n<script>alert('x')</script>\n- <b>굵게</b>",
  ).flatMap((paragraph) => paragraph.lines);
  assert.equal(unsafeLookingLines[1]?.kind, "body");
  assert.equal(unsafeLookingLines[1]?.text, "<script>alert('x')</script>");
  assert.equal(unsafeLookingLines[2]?.kind, "bullet");
  assert.equal(unsafeLookingLines[2]?.content, "<b>굵게</b>");
});

test("campaign application stats support legacy Korean applicant limits", () => {
  assert.equal(
    formatCampaignApplicationStats({
      applicantLimit: "10명",
      applicationCount: 23,
    }),
    "지원 23명 · 모집 10명 · 경쟁률 2.3:1",
  );
});

test("campaign application stats omit competition ratio before the first application", () => {
  assert.equal(
    formatCampaignApplicationStats({
      applicantLimit: "10",
      applicationCount: 0,
    }),
    "지원 0명 · 모집 10명",
  );
});

test("campaign application count sync never guesses on new or duplicate submissions", () => {
  assert.deepEqual(
    resolveCampaignApplicationCountSync({
      already_submitted: false,
      application_count: 7,
    }),
    { kind: "replace", applicationCount: 7 },
  );
  assert.deepEqual(
    resolveCampaignApplicationCountSync({ already_submitted: false }),
    { kind: "refetch" },
  );
  assert.deepEqual(
    resolveCampaignApplicationCountSync({ already_submitted: true }),
    { kind: "preserve" },
  );
});

test("campaign cards, details, previews and advertiser editing share one presentation contract", async () => {
  const [campaignPages, app, dashboard] = await Promise.all([
    readFile(new URL("../src/pages/marketplace/CampaignPages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/marketing/Dashboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(
    (campaignPages.match(/<CampaignApplicationStats\b/g) ?? []).length,
    4,
  );
  assert.equal((campaignPages.match(/<CampaignGuideline\b/g) ?? []).length, 4);
  assert.match(campaignPages, /method: "PATCH"/);
  assert.match(campaignPages, /expectedUpdatedAt: editingCampaign\.updatedAt/);
  assert.match(campaignPages, /activeEditMode === "presentation_only"/);
  assert.match(campaignPages, /helperText=\{isEditMode \? "" : submitHelperText\}/);
  assert.match(campaignPages, /submitHelperText \? \(/);
  assert.match(campaignPages, /function getDesktopCampaignGuideline/);
  assert.match(
    campaignPages,
    /상세를 열어 신청하기를 누릅니다/,
  );
  assert.match(
    app,
    /"\/influencer\/campaigns":\s*\{\s*label: "캠페인",\s*variant: "campaign-marketplace"/,
  );
  assert.match(app, /캠페인 화면을 불러오는 중입니다/);
  assert.match(
    app,
    /<DashboardSurfaceSwitch role="influencer" active="campaigns" \/>/,
  );
  assert.doesNotMatch(
    app,
    /"\/influencer\/campaigns":\s*\{[^}]*label: "캠페인 탐색"/s,
  );
  assert.doesNotMatch(
    campaignPages,
    /canSubmit\s*\? "아직 지원자가 없어 모집 조건 전체를 수정할 수 있습니다\."/,
  );
  assert.match(app, /path="\/advertiser\/campaigns\/:campaignId\/edit"/);
  assert.match(dashboard, />\s*캠페인 수정\s*<\/Link>/);
});

test("both campaign application paths bind the viewed revision and bypass stale caches", async () => {
  const campaignPages = await readFile(
    new URL("../src/pages/marketplace/CampaignPages.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(
    (campaignPages.match(/expectedCampaignRevision,/g) ?? []).length,
    2,
  );
  assert.equal(
    (
      campaignPages.match(
        /response\.status === 409\s*&&\s*isCampaignApplicationStaleError/g,
      ) ?? []
    ).length,
    2,
  );
  assert.equal((campaignPages.match(/\?fresh=\$\{Date\.now\(\)\}/g) ?? []).length, 2);
  assert.equal((campaignPages.match(/cache: "no-store" as const/g) ?? []).length, 2);
  assert.match(campaignPages, /필요한 동의에 다시 동의한 뒤 신청해 주세요/);
});

test("both application success paths replace, preserve, or fresh-refetch counts", async () => {
  const campaignPages = await readFile(
    new URL("../src/pages/marketplace/CampaignPages.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(
    (campaignPages.match(/resolveCampaignApplicationCountSync\(response\)/g) ?? [])
      .length,
    2,
  );
  assert.equal(
    (campaignPages.match(/countSync\.kind === "preserve"/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(campaignPages, /applicationCount\s*\+\s*1/);
});

test("campaign detail condition cards keep natural height and only the public page is sticky", async () => {
  const campaignPages = await readFile(
    new URL("../src/pages/marketplace/CampaignPages.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    campaignPages,
    /lg:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(260px,0\.55fr\)\] lg:items-start lg:p-7/,
  );
  assert.match(
    campaignPages,
    /p-4 ring-1 ring-neutral-200 lg:sticky lg:top-\[72px\] lg:self-start/,
  );
  assert.match(
    campaignPages,
    /lg:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(220px,0\.6fr\)\] lg:items-start/,
  );
  assert.match(
    campaignPages,
    /p-3 ring-1 ring-neutral-200 lg:self-start/,
  );
  assert.match(
    campaignPages,
    /<article className="overflow-clip rounded-\[14px\] border border-neutral-200 bg-white shadow-/,
  );
  assert.doesNotMatch(
    campaignPages,
    /<article className="overflow-hidden rounded-\[14px\] border border-neutral-200 bg-white shadow-/,
  );
  assert.match(
    campaignPages,
    /max-h-\[calc\(100svh-24px\)\][^"\n]*overflow-hidden rounded-\[14px\]/,
  );
  assert.equal((campaignPages.match(/lg:sticky/g) ?? []).length, 1);
});

test("all full campaign guidelines use one safe line renderer with mobile-safe hanging indents", async () => {
  const campaignPages = await readFile(
    new URL("../src/pages/marketplace/CampaignPages.tsx", import.meta.url),
    "utf8",
  );

  assert.equal((campaignPages.match(/<CampaignGuideline\b/g) ?? []).length, 4);
  assert.match(campaignPages, /parseCampaignGuideline\(text\)/);
  assert.match(
    campaignPages,
    /className=\{`grid min-w-0 max-w-full gap-4 \$\{className\}`\}/,
  );
  assert.match(campaignPages, /className="grid min-w-0 max-w-full gap-1"/);
  assert.match(campaignPages, /grid-cols-\[2rem_minmax\(0,1fr\)\]/);
  assert.match(campaignPages, /grid-cols-\[0\.75rem_minmax\(0,1fr\)\]/);
  assert.match(
    campaignPages,
    /className="min-w-0 max-w-full whitespace-pre-wrap break-words"/,
  );
  assert.match(
    campaignPages,
    /<span className="whitespace-nowrap text-right">\s*\{line\.marker\}/,
  );
  assert.match(campaignPages, /data-campaign-guideline-kind=\{line\.kind\}/);
  assert.doesNotMatch(campaignPages, /whitespace-pre-line/);
  assert.doesNotMatch(
    campaignPages,
    /whitespace-nowrap text-right" aria-hidden/,
  );
  assert.doesNotMatch(
    campaignPages,
    /dangerouslySetInnerHTML|ReactMarkdown|marked\(/,
  );
});
