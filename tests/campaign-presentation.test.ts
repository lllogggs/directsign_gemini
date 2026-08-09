import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatCampaignApplicationStats,
  parseCampaignGuideline,
  resolveCampaignApplicationCountSync,
  splitCampaignGuidelineParagraphs,
} from "../src/domain/marketplace.ts";

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
“캠페인 카드에서 보상과 마감일을 먼저 확인하고 신청 버튼을 누릅니다.”

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
