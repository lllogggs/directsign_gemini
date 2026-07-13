/* global document, window */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const baseUrl = (process.env.QA_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const outputRoot =
  process.env.QA_INTERACTION_OUTPUT_DIR ||
  path.join(
    root,
    "docs",
    "qa-reports",
    `full-interaction-qa-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );

const credentials = {
  advertiser: {
    email: process.env.QA_ADVERTISER_EMAIL || "breadroom.manager@yeollock.me",
    password: process.env.QA_TEST_PASSWORD || "YeollockTest!2026",
  },
  influencer: {
    email: process.env.QA_INFLUENCER_EMAIL || "creator.sora@yeollock.me",
    password: process.env.QA_TEST_PASSWORD || "YeollockTest!2026",
  },
};

const viewports = [
  { key: "pc", label: "PC", width: 1365, height: 900, isMobile: false },
  { key: "mobile", label: "모바일", width: 390, height: 844, isMobile: true },
  { key: "mobile-320", label: "모바일 320px", width: 320, height: 760, isMobile: true },
];

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const dangerousLabelPattern =
  /로그아웃|삭제|저장|등록|생성|제출|전송|발송|보내기|선정|승인|거절|서명|지원하기|신청하기|계약 종료|업로드|탈퇴|초대|복사|다운로드|엑셀 파일|Google 스프레드시트/i;
const safeTextControlPattern =
  /필터|정렬|기간|날짜|언어|Language|계정 설정|브랜드 변경|내보내기|정보 보기|상세 보기|이전 페이지|다음 페이지|첫 페이지|마지막 페이지|초기화|전체 보기|접기|펼치기|소개 보기|역할 선택|둘러보기|시작하기/i;

const publicRoutes = [
  { id: "home", label: "메인", path: "/" },
  { id: "intro-advertiser", label: "광고주 인트로", path: "/intro/advertiser" },
  {
    id: "intro-advertiser-final",
    label: "광고주 인트로 마지막 화면",
    path: "/intro/advertiser",
    introSlide: 5,
  },
  { id: "intro-influencer", label: "인플루언서 인트로", path: "/intro/influencer" },
  {
    id: "intro-influencer-final",
    label: "인플루언서 인트로 마지막 화면",
    path: "/intro/influencer",
    introSlide: 6,
  },
  { id: "global-creators-en", label: "해외 크리에이터 영문", path: "/en/creators" },
  { id: "global-creators-ja", label: "해외 크리에이터 일본어", path: "/ja/creators" },
  { id: "global-creators-zh", label: "해외 크리에이터 중국어", path: "/zh/creators" },
];

const advertiserRoutes = [
  { id: "dashboard", label: "광고주 1:1 계약 대시보드", path: "/advertiser/dashboard" },
  { id: "builder", label: "광고주 계약서 작성", path: "/advertiser/builder" },
  { id: "discover", label: "광고주 인플루언서 찾기", path: "/advertiser/discover", hoverRows: true },
  { id: "campaigns", label: "광고주 캠페인", path: "/advertiser/campaigns" },
  { id: "campaign-new", label: "광고주 캠페인 작성", path: "/advertiser/campaigns/new" },
  { id: "costs", label: "광고주 광고비 현황", path: "/advertiser/costs" },
  { id: "messages", label: "광고주 메시지", path: "/advertiser/messages" },
  { id: "verification", label: "광고주 인증", path: "/advertiser/verification" },
];

const influencerRoutes = [
  { id: "dashboard", label: "인플루언서 1:1 계약 대시보드", path: "/influencer/dashboard" },
  { id: "brands", label: "인플루언서 브랜드 찾기", path: "/influencer/brands" },
  { id: "campaigns", label: "인플루언서 캠페인 찾기", path: "/influencer/campaigns" },
  { id: "messages", label: "인플루언서 메시지", path: "/influencer/messages" },
  { id: "verification", label: "인플루언서 인증", path: "/influencer/verification" },
  { id: "profile", label: "인플루언서 공개 프로필 관리", path: "/influencer/profile" },
];

function slugify(value) {
  const normalized = String(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized.slice(0, 72) || "control";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function launchBrowser() {
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Try the next installed browser.
    }
  }
  return chromium.launch({ headless: true });
}

async function login(page, role) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(
    async ({ loginRole, email, password }) => {
      const response = await fetch(`/api/${loginRole}/login`, {
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
    },
    { loginRole: role, ...credentials[role] },
  );
  if (!result.ok || result.body?.authenticated !== true) {
    throw new Error(`${role} login failed (${result.status})`);
  }
}

async function waitForStableScreen(page) {
  await page.waitForLoadState("networkidle", { timeout: 1800 }).catch(() => null);
  const deadline = Date.now() + 12000;
  const loadingPattern = /불러오는 중|확인하는 중|준비하는 중|잠시만 기다려 주세요/;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const text = document.body?.innerText || "";
        const largeSkeletons = Array.from(
          document.querySelectorAll('[class*="animate-pulse"],[aria-busy="true"]'),
        ).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width * rect.height >= 1000;
        }).length;
        return { text, largeSkeletons };
      })
      .catch(() => ({ text: "", largeSkeletons: 1 }));
    if (
      !loadingPattern.test(state.text) &&
      state.text.trim().length >= 30 &&
      state.largeSkeletons === 0
    ) {
      break;
    }
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(250);
}

async function getDynamicRoutes(page) {
  await page.goto(`${baseUrl}/advertiser/campaigns`, { waitUntil: "domcontentloaded" });
  await waitForStableScreen(page);
  const data = await page.evaluate(async () => {
    const [campaignResponse, contractResponse, messageResponse] = await Promise.all([
      fetch("/api/advertiser/campaigns", { credentials: "include", headers: { Accept: "application/json" } }),
      fetch("/api/contracts", { credentials: "include", headers: { Accept: "application/json" } }),
      fetch("/api/marketplace/messages?role=advertiser", {
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    ]);
    const campaigns = campaignResponse.ok
      ? (await campaignResponse.json()).campaigns ?? []
      : [];
    const contracts = contractResponse.ok
      ? (await contractResponse.json()).contracts ?? []
      : [];
    const threads = messageResponse.ok
      ? (await messageResponse.json()).threads ?? []
      : [];
    const activity = new Map();
    for (const contract of contracts) {
      const campaignId = contract?.campaign?.id ?? contract?.campaign_id;
      if (campaignId) activity.set(campaignId, (activity.get(campaignId) ?? 0) + 2);
    }
    for (const thread of threads) {
      if (thread?.campaignId) {
        activity.set(thread.campaignId, (activity.get(thread.campaignId) ?? 0) + 1);
      }
    }
    const pick = (status) =>
      campaigns
        .filter((campaign) => campaign?.id && campaign.status === status)
        .sort((a, b) => (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0))[0] ?? null;
    const activeContract =
      contracts.find((contract) => contract?.id && contract.status !== "SIGNED") ?? contracts[0] ?? null;
    const signedContract = contracts.find((contract) => contract?.id && contract.status === "SIGNED") ?? null;
    return {
      recruiting: pick("open"),
      progress: pick("closed"),
      ended: pick("ended"),
      activeContract,
      signedContract,
    };
  });

  const dynamicAdvertiser = [];
  for (const [key, label] of [
    ["recruiting", "모집중"],
    ["progress", "진행중"],
    ["ended", "종료"],
  ]) {
    const campaign = data[key];
    if (!campaign?.id) continue;
    dynamicAdvertiser.push({
      id: `campaign-detail-${key}`,
      label: `광고주 캠페인 ${label} 상세`,
      path: `/advertiser/campaigns?campaign=${encodeURIComponent(`campaign:${campaign.id}`)}`,
    });
  }
  if (data.activeContract?.id) {
    dynamicAdvertiser.push({
      id: "contract-detail-active",
      label: "광고주 진행 계약 상세",
      path: `/advertiser/contract/${data.activeContract.id}`,
    });
  }
  if (data.signedContract?.id) {
    dynamicAdvertiser.push({
      id: "contract-detail-signed",
      label: "광고주 서명 완료 계약 상세",
      path: `/advertiser/contract/${data.signedContract.id}`,
    });
  }
  const dynamicInfluencer = data.signedContract?.id
    ? [
        {
          id: "contract-detail-signed",
          label: "인플루언서 서명 완료 계약 상세",
          path: `/contract/${data.signedContract.id}`,
        },
      ]
    : [];
  return { advertiser: dynamicAdvertiser, influencer: dynamicInfluencer };
}

function isSafeCandidate(control) {
  const label = `${control.ariaLabel} ${control.title} ${control.text}`.trim();
  if (control.role === "tab" || control.tag === "summary") return true;
  if (control.hasPopup === "dialog" && /날짜 선택/.test(label)) return true;
  if (dangerousLabelPattern.test(label)) return false;
  if (control.hasPopup || control.controls || control.expanded !== null) return true;
  if (control.pressed !== null) return true;
  if (control.tag === "select") return true;
  if (control.type === "date") return true;
  if (control.inCarousel || control.isPagination) return true;
  if (
    Object.keys(control.data || {}).some((key) =>
      /language-select|intro-picker-trigger|period-picker-trigger/.test(key),
    )
  ) {
    return true;
  }
  return safeTextControlPattern.test(label);
}

async function collectControls(page) {
  const controls = await page.evaluate(() => {
    const selector = [
      "button",
      "select",
      "input[type='date']",
      "[role='tab']",
      "details > summary",
    ].join(",");
    const candidates = Array.from(document.querySelectorAll(selector));
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        !element.hasAttribute("disabled") &&
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.top)
      );
    };
    return candidates.filter(visible).map((element, index) => {
      const rect = element.getBoundingClientRect();
      const data = Object.fromEntries(
        Array.from(element.attributes)
          .filter((attribute) => attribute.name.startsWith("data-"))
          .map((attribute) => [attribute.name, attribute.value]),
      );
      return {
        domIndex: index,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") || "",
        type: element.getAttribute("type") || "",
        id: element.id || "",
        text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
        ariaLabel: element.getAttribute("aria-label") || "",
        title: element.getAttribute("title") || "",
        controls: element.getAttribute("aria-controls") || "",
        hasPopup: element.getAttribute("aria-haspopup") || "",
        expanded: element.hasAttribute("aria-expanded")
          ? element.getAttribute("aria-expanded")
          : null,
        pressed: element.hasAttribute("aria-pressed")
          ? element.getAttribute("aria-pressed")
          : null,
        value: "value" in element ? element.value : "",
        inCarousel: Boolean(element.closest("[data-intro-carousel-controls]")),
        isPagination: /페이지|page/i.test(
          `${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`,
        ),
        data,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });
  });

  const safe = controls.filter(isSafeCandidate);
  const seen = new Map();
  const roleSeen = new Map();
  return safe.map((control) => {
    const baseKey = [
      control.tag,
      control.role,
      control.id,
      control.ariaLabel,
      control.controls,
      control.text,
    ].join("|");
    const ordinal = seen.get(baseKey) ?? 0;
    seen.set(baseKey, ordinal + 1);
    const roleKey = `${control.tag}|${control.role}`;
    const roleOrdinal = roleSeen.get(roleKey) ?? 0;
    roleSeen.set(roleKey, roleOrdinal + 1);
    return {
      ...control,
      ordinal,
      roleOrdinal,
      key: `${baseKey}|${ordinal}`,
      label:
        control.ariaLabel ||
        control.title ||
        control.text ||
        control.controls ||
        `${control.tag} ${control.domIndex + 1}`,
    };
  });
}

function locatorForControl(page, control) {
  let locator;
  if (control.id) {
    locator = page.locator(`[id=${JSON.stringify(control.id)}]:visible`);
  } else if (control.ariaLabel) {
    locator = page.locator(`${control.tag}[aria-label=${JSON.stringify(control.ariaLabel)}]:visible`);
  } else if (control.controls) {
    locator = page.locator(`${control.tag}[aria-controls=${JSON.stringify(control.controls)}]:visible`);
  } else if (control.role === "tab") {
    locator = page.locator('[role="tab"]:visible').nth(control.roleOrdinal ?? 0);
  } else if (control.tag === "summary") {
    locator = page.locator("details > summary").filter({ hasText: control.text });
  } else {
    locator = page.locator(control.tag).filter({ hasText: control.text });
  }
  return locator.nth(control.ordinal);
}

async function measurePage(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
      const bodyText = document.body?.innerText || "";
    const largeSkeletonCount = Array.from(
      document.querySelectorAll('[class*="animate-pulse"],[aria-busy="true"]'),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width * rect.height >= 1000;
    }).length;
    const overlays = Array.from(
      document.querySelectorAll('[role="listbox"],[role="menu"],[role="dialog"]'),
    )
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          label:
            element.getAttribute("aria-label") ||
            element.getAttribute("aria-labelledby") ||
            (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          clippedX: rect.left < -1 || rect.right > window.innerWidth + 1,
          clippedY: rect.top < -1 || rect.bottom > window.innerHeight + 1,
        };
      });
    return {
      path: window.location.pathname + window.location.search,
      textLength: bodyText.trim().length,
      largeSkeletonCount,
      overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
      overflowY: Math.max(0, doc.scrollHeight - doc.clientHeight),
      errorText:
        bodyText.match(/(?:\bundefined\b|\bNaN\b|Not found|Internal Server Error|오류가 발생|404)/g) ?? [],
      overlays,
      bodyScrollLocked:
        document.body.style.overflow === "hidden" ||
        window.getComputedStyle(document.body).overflow === "hidden",
      activeElement:
        document.activeElement?.getAttribute?.("aria-label") ||
        document.activeElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
        document.activeElement?.tagName?.toLowerCase() ||
        "",
    };
  });
}

async function capture(page, viewport, role, route, control, state, index) {
  if (viewport.auditOnly) return null;
  const fileName = [
    String(index).padStart(3, "0"),
    viewport.key,
    role,
    route.id,
    slugify(control?.label || state),
    state,
  ].join("-") + ".png";
  const filePath = path.join(outputRoot, "screenshots", fileName);
  await page.screenshot({ path: filePath, fullPage: false });
  return path.relative(outputRoot, filePath).replace(/\\/g, "/");
}

function createResult({ viewport, role, route, control, kind }) {
  return {
    viewport: viewport.key,
    viewportLabel: viewport.label,
    role,
    routeId: route.id,
    routeLabel: route.label,
    path: route.path,
    control: control?.label || "화면 기본 상태",
    kind,
    status: "pending",
    checks: [],
    screenshots: [],
    error: null,
    mutationViolations: [],
  };
}

function addCheck(result, name, ok, detail = "") {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) result.status = "fail";
}

function addMetricsChecks(
  result,
  metrics,
  { requireOverlay = false, requireLoaded = false } = {},
) {
  addCheck(result, "가로 넘침 없음", metrics.overflowX === 0, `${metrics.overflowX}px`);
  addCheck(
    result,
    "로딩 스켈레톤 종료",
    metrics.largeSkeletonCount === 0 && (!requireLoaded || metrics.textLength >= 30),
    `skeleton ${metrics.largeSkeletonCount}, text ${metrics.textLength}`,
  );
  addCheck(
    result,
    "오류 문구 없음",
    metrics.errorText.length === 0,
    metrics.errorText.join(", "),
  );
  if (requireOverlay) {
    addCheck(result, "오버레이 열림", metrics.overlays.length > 0, `${metrics.overlays.length}개`);
  }
  for (const overlay of metrics.overlays) {
    addCheck(
      result,
      `${overlay.role} 가로 경계`,
      !overlay.clippedX,
      `${overlay.left}-${overlay.right}`,
    );
    addCheck(
      result,
      `${overlay.role} 세로 경계`,
      !overlay.clippedY,
      `${overlay.top}-${overlay.bottom}`,
    );
  }
}

async function isControlOpen(page, control) {
  const trigger = locatorForControl(page, control);
  if ((await trigger.count()) === 0) return false;
  if (control.tag === "summary") {
    return trigger
      .locator("xpath=..")
      .evaluate(
        (element) =>
          element.tagName === "DETAILS" && "open" in element && element.open === true,
      )
      .catch(() => false);
  }
  if (control.controls) {
    const controlled = page.locator(`[id=${JSON.stringify(control.controls)}]`);
    if ((await controlled.count()) > 0 && (await controlled.first().isVisible().catch(() => false))) {
      return true;
    }
  }
  const expanded = await trigger.getAttribute("aria-expanded").catch(() => null);
  if (expanded !== null) return expanded === "true";
  const surfaces = page.locator('[role="listbox"],[role="menu"],[role="dialog"]');
  for (let index = 0; index < (await surfaces.count()); index += 1) {
    if (await surfaces.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function closeWithEscape(page, control) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(140);
  return !(await isControlOpen(page, control));
}

async function closeWithOutsideClick(page, control, viewport) {
  const candidates = [
    { x: 4, y: Math.max(4, viewport.height - 4) },
    { x: 4, y: 4 },
    { x: Math.max(4, viewport.width - 4), y: Math.max(4, viewport.height - 4) },
  ];
  for (const point of candidates) {
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(120);
    if (!(await isControlOpen(page, control))) return true;
  }
  return false;
}

async function findOpenSurface(page, control) {
  if (control.controls) {
    const controlled = page.locator(`[id=${JSON.stringify(control.controls)}]`);
    if ((await controlled.count()) > 0 && (await controlled.first().isVisible().catch(() => false))) {
      return controlled.first();
    }
  }
  const surfaces = page.locator('[role="listbox"],[role="menu"],[role="dialog"]');
  for (let index = 0; index < (await surfaces.count()); index += 1) {
    const surface = surfaces.nth(index);
    if (await surface.isVisible().catch(() => false)) return surface;
  }
  return null;
}

async function centerInScrollableAncestors(locator) {
  await locator.evaluate((element) => {
    let ancestor = element.parentElement;
    while (ancestor) {
      const style = window.getComputedStyle(ancestor);
      const canScroll =
        /auto|scroll/.test(style.overflowY) &&
        ancestor.scrollHeight > ancestor.clientHeight + 1;
      if (canScroll) {
        const elementBounds = element.getBoundingClientRect();
        const ancestorBounds = ancestor.getBoundingClientRect();
        ancestor.scrollTop +=
          elementBounds.top -
          ancestorBounds.top -
          (ancestor.clientHeight - elementBounds.height) / 2;
      }
      ancestor = ancestor.parentElement;
    }
  });
  await locator.evaluate(
    () => new Promise((resolve) => window.requestAnimationFrame(() => resolve(true))),
  );
}

async function openControl(page, control) {
  const trigger = locatorForControl(page, control);
  await centerInScrollableAncestors(trigger);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click({ timeout: 5000 });
  await page.waitForTimeout(180);
  return trigger;
}

async function exerciseListbox({
  page,
  viewport,
  role,
  route,
  control,
  captureIndex,
}) {
  const result = createResult({ viewport, role, route, control, kind: "listbox" });
  const trigger = await openControl(page, control);
  const openMetrics = await measurePage(page);
  addMetricsChecks(result, openMetrics, { requireOverlay: true });
  addCheck(result, "열림 상태", await isControlOpen(page, control));
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "open", captureIndex.next()),
  );

  const listbox = await findOpenSurface(page, control);
  let options = listbox ? listbox.locator('[role="option"]') : null;
  if (listbox && options && (await options.count()) === 0) {
    options = listbox.locator('button[aria-pressed]');
  }
  const optionCount = options ? await options.count() : 0;
  addCheck(result, "선택 항목 존재", optionCount > 0, `${optionCount}개`);
  addCheck(result, "Esc 닫기", await closeWithEscape(page, control));
  addCheck(
    result,
    "Esc 포커스 복귀",
    await trigger
      .evaluate((element) => document.activeElement === element)
      .catch(() => false),
  );

  await openControl(page, control);
  const reopenedSurface = await findOpenSurface(page, control);
  let reopenedOptions = reopenedSurface?.locator('[role="option"]');
  if (reopenedSurface && reopenedOptions && (await reopenedOptions.count()) === 0) {
    reopenedOptions = reopenedSurface.locator('button[aria-pressed]');
  }
  let selectionVerified = false;
  let selectedLabel = "";
  if (reopenedOptions && (await reopenedOptions.count()) > 1) {
    for (let index = 0; index < (await reopenedOptions.count()); index += 1) {
      const option = reopenedOptions.nth(index);
      const selected =
        (await option.getAttribute("aria-selected")) === "true" ||
        (await option.getAttribute("aria-pressed")) === "true";
      const label = (await option.innerText()).replace(/\s+/g, " ").trim();
      if (selected) continue;
      selectedLabel = label;
      await option.click();
      await page.waitForTimeout(220);
      const nextTrigger = locatorForControl(page, control);
      const nextText = `${await nextTrigger.innerText().catch(() => "")} ${
        await nextTrigger.getAttribute("aria-label").catch(() => "")
      }`;
      const currentSurface = await findOpenSurface(page, control);
      const selectedOption = currentSurface
        ?.locator('[role="option"],button[aria-pressed]')
        .filter({ hasText: selectedLabel })
        .first();
      const selectedState = selectedOption
        ? (await selectedOption.getAttribute("aria-selected").catch(() => null)) === "true" ||
          (await selectedOption.getAttribute("aria-pressed").catch(() => null)) === "true"
        : false;
      selectionVerified =
        selectedState ||
        nextText.includes(selectedLabel) ||
        (await nextTrigger.getAttribute("aria-expanded")) === "false";
      break;
    }
  } else if (reopenedOptions && (await reopenedOptions.count()) === 1) {
    selectionVerified = true;
  }
  addCheck(result, "항목 선택 반영", selectionVerified, selectedLabel || "선택지 없음");
  const selectedMetrics = await measurePage(page);
  addMetricsChecks(result, selectedMetrics);
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "selected", captureIndex.next()),
  );

  await openControl(page, control);
  addCheck(result, "외부 클릭 닫기", await closeWithOutsideClick(page, control, viewport));
  addCheck(result, "트리거 유지", (await trigger.count()) > 0);
  result.status = result.status === "fail" ? "fail" : "pass";
  return result;
}

async function exerciseNestedFilters({
  page,
  viewport,
  role,
  route,
  parentControl,
  captureIndex,
}) {
  const nestedResults = [];
  const surface = await findOpenSurface(page, parentControl);
  if (!surface) return nestedResults;

  const triggers = surface.locator(
    'button[aria-haspopup="listbox"],button[aria-expanded]',
  );
  const triggerCount = await triggers.count();
  for (let index = 0; index < triggerCount; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible().catch(() => false))) continue;
    const ariaLabel =
      (await trigger.getAttribute("aria-label")) ||
      (await trigger.innerText()).replace(/\s+/g, " ").trim() ||
      "필터 선택";
    const result = createResult({
      viewport,
      role,
      route,
      control: { label: `${parentControl.label} > ${ariaLabel}` },
      kind: "nested-listbox",
    });
    await trigger.click();
    await page.waitForTimeout(140);
    const metrics = await measurePage(page);
    addMetricsChecks(result, metrics);
    const listboxId = await trigger.getAttribute("aria-controls");
    const localRoot = trigger.locator("xpath=..");
    const listbox = listboxId
      ? page.locator(`[id=${JSON.stringify(listboxId)}]`)
      : localRoot;
    let options = listbox.locator('[role="option"]');
    if ((await options.count()) === 0) {
      options = localRoot.locator('button[aria-pressed]:visible');
    }
    const optionCount = await options.count();
    addCheck(result, "선택 항목 존재", optionCount > 0, `${optionCount}개`);
    if (optionCount > 0) {
      const optionBounds = (await Promise.all(
        [options.first(), options.last()].map((option) => option.boundingBox()),
      )).filter(Boolean);
      addCheck(
        result,
        "선택 목록 가로 경계",
        optionBounds.every(
          (bounds) => bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1,
        ),
        optionBounds
          .map((bounds) => `${Math.round(bounds.x)}-${Math.round(bounds.x + bounds.width)}`)
          .join(", "),
      );
      addCheck(
        result,
        "선택 목록 세로 접근",
        optionBounds.some(
          (bounds) => bounds.y < viewport.height && bounds.y + bounds.height > 0,
        ),
      );
    }
    result.screenshots.push(
      await capture(
        page,
        viewport,
        role,
        route,
        { label: `${parentControl.label}-${ariaLabel}` },
        "open",
        captureIndex.next(),
      ),
    );

    await page.keyboard.press("Escape");
    await page.waitForTimeout(140);
    addCheck(
      result,
      "중첩 목록 Esc 닫기",
      (await trigger.getAttribute("aria-expanded")) === "false",
    );
    addCheck(
      result,
      "중첩 목록 Esc 포커스 복귀",
      await trigger
        .evaluate((element) => document.activeElement === element)
        .catch(() => false),
    );
    addCheck(
      result,
      "Esc 후 상위 필터 유지",
      await surface.isVisible().catch(() => false),
    );

    await trigger.click();
    await page.waitForTimeout(120);
    const surfaceBounds = await surface.boundingBox();
    if (surfaceBounds) {
      await page.mouse.click(surfaceBounds.x + 24, surfaceBounds.y + 24);
      await page.waitForTimeout(120);
    }
    addCheck(
      result,
      "중첩 목록 외부 클릭 닫기",
      Boolean(surfaceBounds) &&
        (await trigger.getAttribute("aria-expanded")) === "false",
    );
    addCheck(
      result,
      "외부 클릭 후 상위 필터 유지",
      await surface.isVisible().catch(() => false),
    );

    await trigger.click();
    await page.waitForTimeout(120);
    let selected = false;
    let selectedLabel = "";
    for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
      const option = options.nth(optionIndex);
      const current =
        (await option.getAttribute("aria-selected")) === "true" ||
        (await option.getAttribute("aria-pressed")) === "true";
      const label = (await option.innerText()).replace(/\s+/g, " ").trim();
      if (current) continue;
      selectedLabel = label;
      await option.click();
      await page.waitForTimeout(180);
      const expandedAfter = await trigger.getAttribute("aria-expanded");
      const triggerTextAfter = (await trigger.innerText().catch(() => ""))
        .replace(/\s+/g, " ")
        .trim();
      selected = expandedAfter === "false" || triggerTextAfter.includes(selectedLabel);
      break;
    }
    addCheck(result, "항목 선택 반영", selected || optionCount === 1, selectedLabel);
    addMetricsChecks(result, await measurePage(page));
    result.screenshots.push(
      await capture(
        page,
        viewport,
        role,
        route,
        { label: `${parentControl.label}-${ariaLabel}` },
        "selected",
        captureIndex.next(),
      ),
    );
    result.status = result.status === "fail" ? "fail" : "pass";
    nestedResults.push(result);
    if ((await trigger.getAttribute("aria-expanded").catch(() => "false")) === "true") {
      await trigger.click();
      await page.waitForTimeout(100);
    }
  }

  const searchInputs = surface.locator('input[type="search"],input[aria-label*="검색"],input[placeholder*="검색"]');
  for (let index = 0; index < (await searchInputs.count()); index += 1) {
    const input = searchInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    const label =
      (await input.getAttribute("aria-label")) ||
      (await input.getAttribute("placeholder")) ||
      "검색";
    const result = createResult({
      viewport,
      role,
      route,
      control: { label: `${parentControl.label} > ${label}` },
      kind: "filter-search",
    });
    await input.fill("a");
    await page.waitForTimeout(180);
    addCheck(result, "검색값 입력", (await input.inputValue()) === "a");
    addMetricsChecks(result, await measurePage(page));
    result.screenshots.push(
      await capture(
        page,
        viewport,
        role,
        route,
        { label: `${parentControl.label}-${label}` },
        "typed",
        captureIndex.next(),
      ),
    );
    result.status = result.status === "fail" ? "fail" : "pass";
    nestedResults.push(result);
  }

  const resetButton = surface.getByRole("button", { name: /초기화/ }).first();
  if ((await resetButton.count()) > 0 && (await resetButton.isVisible().catch(() => false))) {
    const result = createResult({
      viewport,
      role,
      route,
      control: { label: `${parentControl.label} > 초기화` },
      kind: "filter-reset",
    });
    const beforeState = await surface
      .locator('input,select,button[aria-pressed],button[aria-selected]')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          value: "value" in element ? element.value : "",
          pressed: element.getAttribute("aria-pressed"),
          selected: element.getAttribute("aria-selected"),
        })),
      );
    await resetButton.click();
    await page.waitForTimeout(180);
    addMetricsChecks(result, await measurePage(page));
    const afterState = await surface
      .locator('input,select,button[aria-pressed],button[aria-selected]')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          value: "value" in element ? element.value : "",
          pressed: element.getAttribute("aria-pressed"),
          selected: element.getAttribute("aria-selected"),
        })),
      );
    addCheck(
      result,
      "초기화 동작",
      JSON.stringify(beforeState) !== JSON.stringify(afterState) || (await resetButton.isVisible()),
    );
    result.screenshots.push(
      await capture(
        page,
        viewport,
        role,
        route,
        { label: `${parentControl.label}-초기화` },
        "reset",
        captureIndex.next(),
      ),
    );
    result.status = result.status === "fail" ? "fail" : "pass";
    nestedResults.push(result);
  }
  return nestedResults;
}

async function exerciseExpandable({
  page,
  viewport,
  role,
  route,
  control,
  captureIndex,
}) {
  const kind = control.hasPopup === "menu" ? "menu" : control.hasPopup === "dialog" ? "dialog" : "expandable";
  const result = createResult({ viewport, role, route, control, kind });
  const initialTrigger = await openControl(page, control);
  const metrics = await measurePage(page);
  const surface = await findOpenSurface(page, control);
  addMetricsChecks(result, metrics, {
    requireOverlay: Boolean(control.hasPopup && !surface),
  });
  addCheck(result, "열림 상태", await isControlOpen(page, control));
  if (surface) {
    const bounds = await surface.boundingBox();
    addCheck(result, "열린 패널 표시", Boolean(bounds));
    addCheck(
      result,
      "열린 패널 가로 경계",
      Boolean(bounds) && bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1,
      bounds ? `${Math.round(bounds.x)}-${Math.round(bounds.x + bounds.width)}` : "없음",
    );
    addCheck(
      result,
      "열린 패널 세로 경계",
      Boolean(bounds) && bounds.y >= -1 && bounds.y + bounds.height <= viewport.height + 1,
      bounds ? `${Math.round(bounds.y)}-${Math.round(bounds.y + bounds.height)}` : "없음",
    );
  }
  if (surface && (await surface.getAttribute("role")) === "dialog") {
    const modal = (await surface.getAttribute("aria-modal")) === "true";
    if (modal) {
      addCheck(result, "모달 배경 스크롤 잠금", metrics.bodyScrollLocked);
    }
  }
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "open", captureIndex.next()),
  );

  const nested = surface
    ? await exerciseNestedFilters({
        page,
        viewport,
        role,
        route,
        parentControl: control,
        captureIndex,
      })
    : [];

  const surfaceLabel = surface
    ? (await surface.getAttribute("aria-label").catch(() => "")) || ""
    : "";
  if (kind === "dialog" && surface && /날짜 선택/.test(surfaceLabel)) {
    const beforeText = (await initialTrigger.innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .trim();
    const dateButtons = surface.locator("button:not([disabled])");
    const dateButtonLabels = await dateButtons.allTextContents();
    const dateIndex = dateButtonLabels.findIndex((label) => /^\d{1,2}$/.test(label.trim()));
    let selectedText = "";
    if (dateIndex >= 0) {
      selectedText = dateButtonLabels[dateIndex].trim();
      await dateButtons.nth(dateIndex).click();
      await page.waitForTimeout(180);
    }
    const selectedTrigger = locatorForControl(page, control);
    const afterText = (await selectedTrigger.innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .trim();
    addCheck(
      result,
      "날짜 선택 반영",
      dateIndex >= 0 &&
        !(await isControlOpen(page, control)) &&
        afterText.length > 0 &&
        afterText !== beforeText,
      selectedText ? `${selectedText}일 -> ${afterText}` : "선택 가능한 날짜 없음",
    );
    addCheck(
      result,
      "날짜 선택 후 포커스 복귀",
      await selectedTrigger
        .evaluate((element) => document.activeElement === element)
        .catch(() => false),
    );
    result.screenshots.push(
      await capture(page, viewport, role, route, control, "selected", captureIndex.next()),
    );
  }

  const currentControl = (await findCurrentControl(page, control)) || control;
  if (!(await isControlOpen(page, currentControl))) {
    await openControl(page, currentControl);
  }
  const escapeTrigger = locatorForControl(page, currentControl);
  addCheck(result, "Esc 닫기", await closeWithEscape(page, currentControl));
  addCheck(
    result,
    "Esc 포커스 복귀",
    await escapeTrigger
      .evaluate((element) => document.activeElement === element)
      .catch(() => false),
  );
  await openControl(page, currentControl);
  addCheck(
    result,
    "외부 클릭 닫기",
    await closeWithOutsideClick(page, currentControl, viewport),
  );
  result.status = result.status === "fail" ? "fail" : "pass";
  return [result, ...nested];
}

async function exerciseTab({ page, viewport, role, route, control, captureIndex }) {
  const result = createResult({ viewport, role, route, control, kind: "tab" });
  const trigger = await openControl(page, control);
  await waitForStableScreen(page);
  addCheck(
    result,
    "선택 상태 반영",
    (await trigger.getAttribute("aria-selected")) === "true",
    (await trigger.getAttribute("aria-selected")) || "없음",
  );
  addMetricsChecks(result, await measurePage(page));
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "selected", captureIndex.next()),
  );
  result.status = result.status === "fail" ? "fail" : "pass";
  return result;
}

async function exerciseToggle({ page, viewport, role, route, control, captureIndex }) {
  const result = createResult({ viewport, role, route, control, kind: "toggle" });
  const trigger = locatorForControl(page, control);
  const before = await trigger.getAttribute("aria-pressed");
  await openControl(page, control);
  const after = await trigger.getAttribute("aria-pressed");
  addCheck(result, "토글 상태 변경", before !== after, `${before} -> ${after}`);
  addMetricsChecks(result, await measurePage(page));
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "toggled", captureIndex.next()),
  );
  result.status = result.status === "fail" ? "fail" : "pass";
  return result;
}

async function exerciseSelect({ page, viewport, role, route, control, captureIndex }) {
  const result = createResult({ viewport, role, route, control, kind: "select" });
  const select = locatorForControl(page, control);
  const options = await select.locator("option").evaluateAll((items) =>
    items.map((item) => ({ value: item.value, text: item.textContent || "" })),
  );
  const before = await select.inputValue();
  const next = options.find((option) => option.value !== before);
  if (next) {
    await select.selectOption(next.value);
    await page.waitForTimeout(180);
  }
  addCheck(result, "선택지 존재", options.length > 1, `${options.length}개`);
  addCheck(result, "선택 반영", Boolean(next) && (await select.inputValue()) === next.value, next?.text || "없음");
  addMetricsChecks(result, await measurePage(page));
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "selected", captureIndex.next()),
  );
  result.status = result.status === "fail" ? "fail" : "pass";
  return result;
}

async function exerciseDate({ page, viewport, role, route, control, captureIndex }) {
  const result = createResult({ viewport, role, route, control, kind: "date" });
  const input = locatorForControl(page, control);
  await input.fill("2026-12-24");
  await page.waitForTimeout(120);
  addCheck(result, "날짜 입력 반영", (await input.inputValue()) === "2026-12-24");
  addMetricsChecks(result, await measurePage(page));
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "selected", captureIndex.next()),
  );
  result.status = result.status === "fail" ? "fail" : "pass";
  return result;
}

async function exerciseSimpleControl({ page, viewport, role, route, control, captureIndex }) {
  const result = createResult({ viewport, role, route, control, kind: control.isPagination ? "pagination" : "simple" });
  const beforePath = new URL(page.url()).pathname + new URL(page.url()).search;
  const beforeText = (await page.locator("main").innerText().catch(() => page.locator("body").innerText())).slice(0, 6000);
  const trigger = locatorForControl(page, control);
  const handle = await trigger.elementHandle();
  const beforeState = handle
    ? await handle.evaluate((element) => ({
        ariaCurrent: element.getAttribute("aria-current"),
        ariaSelected: element.getAttribute("aria-selected"),
        ariaSort: element.getAttribute("aria-sort"),
        ariaLabel: element.getAttribute("aria-label"),
        expanded: element.getAttribute("aria-expanded"),
        pressed: element.getAttribute("aria-pressed"),
      }))
    : null;
  await openControl(page, control);
  await waitForStableScreen(page);
  const afterPath = new URL(page.url()).pathname + new URL(page.url()).search;
  const afterText = (await page.locator("main").innerText().catch(() => page.locator("body").innerText())).slice(0, 6000);
  const afterState = handle
    ? await handle
        .evaluate((element) => ({
          ariaCurrent: element.getAttribute("aria-current"),
          ariaSelected: element.getAttribute("aria-selected"),
          ariaSort: element.getAttribute("aria-sort"),
          ariaLabel: element.getAttribute("aria-label"),
          expanded: element.getAttribute("aria-expanded"),
          pressed: element.getAttribute("aria-pressed"),
        }))
        .catch(() => null)
    : null;
  const metrics = await measurePage(page);
  addMetricsChecks(result, metrics);
  const wasAlreadySelected =
    beforeState?.ariaCurrent === "true" ||
    beforeState?.ariaCurrent === "page" ||
    beforeState?.ariaSelected === "true";
  addCheck(
    result,
    "반응 상태 확인",
    wasAlreadySelected ||
      beforePath !== afterPath ||
      beforeText !== afterText ||
      JSON.stringify(beforeState) !== JSON.stringify(afterState) ||
      metrics.overlays.length > 0,
    `${beforePath} -> ${afterPath}`,
  );
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "activated", captureIndex.next()),
  );
  if (metrics.overlays.length > 0) {
    await page.keyboard.press("Escape");
  }
  result.status = result.status === "fail" ? "fail" : "pass";
  return result;
}

async function exerciseDetails({ page, viewport, role, route, control, captureIndex }) {
  const result = createResult({ viewport, role, route, control, kind: "details" });
  const trigger = locatorForControl(page, control);
  await centerInScrollableAncestors(trigger);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.waitForTimeout(160);
  addCheck(result, "상세 내용 펼침", await isControlOpen(page, control));
  addMetricsChecks(result, await measurePage(page));
  result.screenshots.push(
    await capture(page, viewport, role, route, control, "open", captureIndex.next()),
  );
  await trigger.click();
  await page.waitForTimeout(100);
  addCheck(result, "상세 내용 접기", !(await isControlOpen(page, control)));
  result.status = result.status === "fail" ? "fail" : "pass";
  return result;
}

async function exerciseHoverRows({ page, viewport, role, route, captureIndex }) {
  if (viewport.isMobile) return [];
  const rows = page.locator('[data-marketplace-influencer-row="true"]');
  const count = await rows.count();
  if (count === 0) return [];
  const indices = [...new Set([0, Math.min(count - 1, 4), Math.min(count - 1, 8)])];
  const results = [];
  for (const index of indices) {
    const control = { label: `인플루언서 행 호버 ${index + 1}` };
    const result = createResult({ viewport, role, route, control, kind: "hover" });
    const row = rows.nth(index);
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await page.waitForTimeout(260);
    const preview = page.locator('[data-marketplace-preview-card="true"]');
    const visible = (await preview.count()) > 0 && (await preview.last().isVisible().catch(() => false));
    addCheck(result, "호버 카드 표시", visible);
    addMetricsChecks(result, await measurePage(page));
    if (visible) {
      const bounds = await preview.last().boundingBox();
      addCheck(
        result,
        "호버 카드 가로 경계",
        Boolean(bounds) && bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1,
        bounds ? `${Math.round(bounds.x)}-${Math.round(bounds.x + bounds.width)}` : "없음",
      );
    }
    result.screenshots.push(
      await capture(page, viewport, role, route, control, "hover", captureIndex.next()),
    );
    result.status = result.status === "fail" ? "fail" : "pass";
    results.push(result);
  }
  return results;
}

function classifyControl(control) {
  if (control.role === "tab") return "tab";
  if (control.tag === "summary") return "details";
  if (control.tag === "select") return "select";
  if (control.type === "date") return "date";
  if (control.pressed !== null) return "toggle";
  if (control.inCarousel || /이전 제안서 화면|다음 제안서 화면/.test(control.label)) {
    return "simple";
  }
  if (control.hasPopup === "listbox") return "listbox";
  if (control.hasPopup || control.controls || control.expanded !== null || control.tag === "summary") {
    return "expandable";
  }
  return "simple";
}

function matchCurrentControl(inventory, control) {
  return (
    inventory.find((item) => item.key === control.key) ||
    (control.id ? inventory.find((item) => item.id === control.id) : null) ||
    (control.ariaLabel
      ? inventory.find(
          (item) => item.tag === control.tag && item.ariaLabel === control.ariaLabel,
        )
      : null) ||
    (control.controls
      ? inventory.find(
          (item) => item.tag === control.tag && item.controls === control.controls,
        )
      : null) ||
    (control.role === "tab"
      ? inventory.find(
          (item) =>
            item.role === "tab" && item.roleOrdinal === control.roleOrdinal,
        )
      : null) ||
    inventory.find(
      (item) =>
        item.tag === control.tag &&
        item.role === control.role &&
        item.type === control.type &&
        item.label === control.label,
    ) ||
    null
  );
}

async function findCurrentControl(page, control) {
  const deadline = Date.now() + 5000;
  do {
    const inventory = await collectControls(page);
    const current = matchCurrentControl(inventory, control);
    if (current) return current;
    await page.waitForTimeout(180);
  } while (Date.now() < deadline);
  return null;
}

async function exerciseControl(args) {
  switch (classifyControl(args.control)) {
    case "tab":
      return [await exerciseTab(args)];
    case "select":
      return [await exerciseSelect(args)];
    case "date":
      return [await exerciseDate(args)];
    case "toggle":
      return [await exerciseToggle(args)];
    case "details":
      return [await exerciseDetails(args)];
    case "listbox":
      return [await exerciseListbox(args)];
    case "expandable":
      return exerciseExpandable(args);
    default:
      return [await exerciseSimpleControl(args)];
  }
}

async function gotoRoute(page, route) {
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForStableScreen(page);
  if (Number.isInteger(route.introSlide)) {
    const controls = page.locator("[data-intro-carousel-controls] button");
    const target = controls.nth(route.introSlide + 1);
    if ((await target.count()) > 0) {
      await target.click();
      await page.waitForTimeout(350);
    }
  }
}

async function auditRoute({
  page,
  viewport,
  role,
  route,
  guard,
  captureIndex,
}) {
  const results = [];
  guard.enabled = false;
  await gotoRoute(page, route);
  const baselineMetrics = await measurePage(page);
  const baseline = createResult({ viewport, role, route, control: null, kind: "baseline" });
  addMetricsChecks(baseline, baselineMetrics, { requireLoaded: true });
  baseline.screenshots.push(
    await capture(page, viewport, role, route, null, "baseline", captureIndex.next()),
  );
  baseline.screenshots = baseline.screenshots.filter(Boolean);
  baseline.status = baseline.status === "fail" ? "fail" : "pass";
  results.push(baseline);

  const inventory = await collectControls(page);
  if (inventory.length === 0) {
    results.push({
      ...createResult({ viewport, role, route, control: { label: "상호작용 없음" }, kind: "inventory" }),
      status: "excluded",
      error: "현재 화면에 안전하게 조작할 필터·리스트·탭·팝오버가 없습니다.",
    });
    return results;
  }

  for (const control of inventory) {
    guard.enabled = false;
    await gotoRoute(page, route);
    const current = await findCurrentControl(page, control);
    if (!current) {
      results.push({
        ...createResult({ viewport, role, route, control, kind: classifyControl(control) }),
        status: "excluded",
        error: "화면 재진입 후 컨트롤이 비노출 상태여서 제외했습니다.",
      });
      continue;
    }
    guard.violations = [];
    guard.enabled = true;
    try {
      const controlResults = await exerciseControl({
        page,
        viewport,
        role,
        route,
        control: current,
        captureIndex,
      });
      for (const result of controlResults) {
        result.mutationViolations = [...guard.violations];
        if (guard.violations.length > 0) {
          addCheck(result, "데이터 변경 요청 없음", false, guard.violations.join(", "));
          result.status = "fail";
        } else {
          addCheck(result, "데이터 변경 요청 없음", true);
        }
        result.screenshots = result.screenshots.filter(Boolean);
        results.push(result);
      }
    } catch (error) {
      results.push({
        ...createResult({ viewport, role, route, control: current, kind: classifyControl(current) }),
        status: "fail",
        error: error instanceof Error ? error.message : String(error),
        mutationViolations: [...guard.violations],
      });
    } finally {
      guard.enabled = false;
    }
  }

  if (route.hoverRows) {
    guard.enabled = false;
    await gotoRoute(page, route);
    guard.violations = [];
    guard.enabled = true;
    const hoverResults = await exerciseHoverRows({ page, viewport, role, route, captureIndex });
    for (const result of hoverResults) {
      addCheck(result, "데이터 변경 요청 없음", guard.violations.length === 0, guard.violations.join(", "));
      if (guard.violations.length > 0) result.status = "fail";
      result.screenshots = result.screenshots.filter(Boolean);
      results.push(result);
    }
    guard.enabled = false;
  }
  return results;
}

function makeCaptureIndex() {
  let value = 0;
  return {
    next() {
      value += 1;
      return value;
    },
  };
}

async function createQaContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    locale: "ko-KR",
  });
  const guard = { enabled: false, violations: [] };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    if (guard.enabled && mutatingMethods.has(method)) {
      const url = new URL(request.url());
      guard.violations.push(`${method} ${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return { context, page: await context.newPage(), guard };
}

async function runViewport(browser, viewport, captureIndex, dynamicRoutes) {
  process.stdout.write(`QA ${viewport.key} contexts\n`);
  const publicQa = await createQaContext(browser, viewport);
  const advertiserQa = await createQaContext(browser, viewport);
  const influencerQa = await createQaContext(browser, viewport);
  const results = [];

  try {
    process.stdout.write(`QA ${viewport.key} advertiser login\n`);
    await login(advertiserQa.page, "advertiser");
    process.stdout.write(`QA ${viewport.key} influencer login\n`);
    await login(influencerQa.page, "influencer");
    const routeGroups = [
      {
        role: "public",
        page: publicQa.page,
        guard: publicQa.guard,
        routes: publicRoutes,
      },
      {
        role: "advertiser",
        page: advertiserQa.page,
        guard: advertiserQa.guard,
        routes: [...advertiserRoutes, ...dynamicRoutes.advertiser],
      },
      {
        role: "influencer",
        page: influencerQa.page,
        guard: influencerQa.guard,
        routes: [...influencerRoutes, ...dynamicRoutes.influencer],
      },
    ];

    const routeFilter = (process.env.QA_INTERACTION_ROUTES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const group of routeGroups) {
      for (const route of group.routes) {
        if (
          routeFilter.length > 0 &&
          !routeFilter.some((value) =>
            `${group.role}:${route.id}`.toLowerCase().includes(value.toLowerCase()),
          )
        ) {
          continue;
        }
        process.stdout.write(`QA ${viewport.key} ${group.role} ${route.id}\n`);
        const routeResults = await auditRoute({
          page: group.page,
          viewport,
          role: group.role,
          route,
          guard: group.guard,
          captureIndex,
        });
        results.push(...routeResults);
      }
    }
  } finally {
    await publicQa.context.close();
    await advertiserQa.context.close();
    await influencerQa.context.close();
  }
  return results;
}

function renderBoardHtml(report) {
  const visibleResults = report.results.filter(
    (result) =>
      result.screenshots.some(Boolean),
  );
  const groups = new Map();
  for (const result of visibleResults) {
    const key = `${result.viewportLabel} · ${result.role}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  const sections = [...groups.entries()]
    .map(([title, items]) => {
      const cards = items
        .map((item) => {
          const checks = item.checks
            .map(
              (check) =>
                `<li class="${check.ok ? "ok" : "bad"}">${check.ok ? "통과" : "실패"} · ${escapeHtml(
                  check.name,
                )}${check.detail ? ` <span>${escapeHtml(check.detail)}</span>` : ""}</li>`,
            )
            .join("");
          const images = item.screenshots
            .filter(Boolean)
            .map(
              (shot) =>
                `<img src="${escapeHtml(shot)}" alt="${escapeHtml(
                  `${item.routeLabel} ${item.control}`,
                )}" />`,
            )
            .join("");
          return `<article class="card ${item.viewport.startsWith("mobile") ? "mobile" : ""}">
            <header>
              <div><b>${escapeHtml(item.routeLabel)}</b><span>${escapeHtml(item.control)} · ${escapeHtml(
                item.kind,
              )}</span></div>
              <strong class="${item.status}">${escapeHtml(item.status.toUpperCase())}</strong>
            </header>
            <div class="shots">${images}</div>
            <ul>${checks}</ul>
          </article>`;
        })
        .join("");
      return `<section><h2>${escapeHtml(title)}</h2><div class="grid">${cards}</div></section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>연락미 전체 상호작용 QA 캡쳐보드</title>
  <style>
    @page { size: A3 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f5f1; color: #171a17; font-family: Arial, "Noto Sans KR", sans-serif; letter-spacing: 0; }
    .cover { min-height: 180px; padding: 52px 56px; background: #111411; color: white; }
    .cover h1 { margin: 0; font-size: 34px; }
    .cover p { margin: 14px 0 0; color: #cdd5cd; font-size: 14px; }
    section { padding: 28px; break-before: page; }
    section:first-of-type { break-before: auto; }
    section > h2 { margin: 0 0 14px; font-size: 22px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .card { break-inside: avoid; overflow: hidden; border: 1px solid #d9e0d9; border-radius: 8px; background: white; }
    .card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #e5e9e4; }
    .card header div { min-width: 0; }
    .card header b, .card header span { display: block; }
    .card header b { font-size: 12px; }
    .card header span { margin-top: 3px; color: #606861; font-size: 10px; }
    .card header strong { flex: none; border-radius: 6px; padding: 4px 7px; font-size: 9px; }
    .card header strong.pass { background: #e7f7ed; color: #14733b; }
    .card header strong.fail { background: #fff0f0; color: #b42318; }
    .shots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: #dfe4de; }
    .shots img { display: block; width: 100%; height: auto; background: #eef1ec; }
    .mobile .shots img { max-height: 620px; object-fit: contain; }
    ul { margin: 0; padding: 8px 12px 10px 28px; font-size: 9px; line-height: 1.45; }
    li.ok { color: #376344; }
    li.bad { color: #b42318; font-weight: 700; }
    li span { color: #737a74; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>연락미 전체 상호작용 QA 캡쳐보드</h1>
    <p>${escapeHtml(report.createdAt)} · ${report.summary.total}개 검증 · 통과 ${report.summary.passed} · 실패 ${
      report.summary.failed
    } · 제외 ${report.summary.excluded}</p>
  </div>
  ${sections}
</body>
</html>`;
}

async function writeReportAndBoard(browser, results) {
  const report = {
    baseUrl,
    createdAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter((result) => result.status === "pass").length,
      failed: results.filter((result) => result.status === "fail").length,
      excluded: results.filter((result) => result.status === "excluded").length,
      screenshots: results.reduce(
        (count, result) => count + result.screenshots.filter(Boolean).length,
        0,
      ),
      mutationViolations: results.reduce(
        (count, result) => count + result.mutationViolations.length,
        0,
      ),
    },
    results,
  };
  await fs.writeFile(
    path.join(outputRoot, "interaction-results.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  const html = renderBoardHtml(report);
  const htmlPath = path.join(outputRoot, "interaction-capture-board.html");
  const pdfPath = path.join(outputRoot, "interaction-capture-board.pdf");
  const previewPath = path.join(outputRoot, "interaction-capture-board-preview.png");
  await fs.writeFile(htmlPath, html, "utf8");
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  try {
    await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: previewPath, fullPage: false });
    await page.pdf({
      path: pdfPath,
      format: "A3",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await page.close();
  }
  return report;
}

async function main() {
  await fs.mkdir(path.join(outputRoot, "screenshots"), { recursive: true });
  const browser = await launchBrowser();
  const captureIndex = makeCaptureIndex();
  const results = [];
  const viewportFilter = (process.env.QA_INTERACTION_VIEWPORTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  try {
    const reportInput = process.env.QA_INTERACTION_REPORT_INPUT;
    if (reportInput) {
      const input = JSON.parse(await fs.readFile(path.resolve(reportInput), "utf8"));
      const inputResults = Array.isArray(input.results) ? input.results : [];
      for (const result of inputResults) {
        result.screenshots = Array.isArray(result.screenshots)
          ? result.screenshots.filter(Boolean)
          : [];
      }
      const report = await writeReportAndBoard(browser, inputResults);
      console.log(JSON.stringify(report.summary, null, 2));
      return;
    }
    process.stdout.write("QA dynamic routes\n");
    const discovery = await createQaContext(browser, viewports[0]);
    let dynamicRoutes;
    try {
      await login(discovery.page, "advertiser");
      dynamicRoutes = await getDynamicRoutes(discovery.page);
    } finally {
      await discovery.context.close();
    }
    for (const viewport of viewports) {
      if (viewportFilter.length > 0 && !viewportFilter.includes(viewport.key)) continue;
      results.push(...(await runViewport(browser, viewport, captureIndex, dynamicRoutes)));
    }
    const report = await writeReportAndBoard(browser, results);
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`Report: ${path.join(outputRoot, "interaction-results.json")}`);
    console.log(`Board: ${path.join(outputRoot, "interaction-capture-board.html")}`);
    console.log(`PDF: ${path.join(outputRoot, "interaction-capture-board.pdf")}`);
    if (report.summary.failed > 0 || report.summary.mutationViolations > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
