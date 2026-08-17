import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const tsxCommand = path.join(
  root,
  "node_modules",
  ".bin",
  isWindows ? "tsx.cmd" : "tsx",
);
const qaPort = Number(process.env.QA_PORT || 3100);

const resultRows = [];
let serverProcess = null;

const record = (name, status, detail = "") => {
  resultRows.push({ name, status, detail });
  const marker = status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL";
  console.log(`[${marker}] ${name}${detail ? ` - ${detail}` : ""}`);
};

const runCommand = (name, command, args, { optional = false } = {}) =>
  new Promise((resolve) => {
    console.log(`\n$ ${[command, ...args].join(" ")}`);
    let child;
    try {
      child = spawn(command, args, {
        cwd: root,
        env: { ...process.env, CI: process.env.CI || "1", NO_COLOR: "1" },
        shell: isWindows,
        stdio: "inherit",
        windowsHide: true,
      });
    } catch (error) {
      record(name, optional ? "warn" : "fail", error instanceof Error ? error.message : String(error));
      resolve(optional);
      return;
    }

    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        record(name, "pass");
        resolve(true);
        return;
      }

      record(name, optional ? "warn" : "fail", `exit ${exitCode}`);
      resolve(optional);
    });

    child.on("error", (error) => {
      record(name, optional ? "warn" : "fail", error.message);
      resolve(optional);
    });
  });

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readHealth = async (baseUrl) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/health`, { timeoutMs: 3000 });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

const supportsCurrentApiSurface = async (baseUrl) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", role: "advertiser" }),
      timeoutMs: 5000,
    });
    if (response.status !== 422) return false;

    const marketplaceResponse = await fetchWithTimeout(
      `${baseUrl}/api/marketplace/influencers`,
      { headers: { Accept: "application/json" }, timeoutMs: 5000 },
    );
    const marketplaceCacheControl =
      marketplaceResponse.headers.get("cache-control") ?? "";
    if (
      marketplaceResponse.status !== 401 ||
      !marketplaceCacheControl.includes("private") ||
      !marketplaceCacheControl.includes("no-store")
    ) {
      return false;
    }

    const cronResponse = await fetchWithTimeout(
      `${baseUrl}/api/cron/sync-marketplace-followers`,
      { timeoutMs: 5000 },
    );
    return [401, 503].includes(cronResponse.status);
  } catch {
    return false;
  }
};

const startTemporaryServer = async () => {
  const baseUrl = `http://127.0.0.1:${qaPort}`;
  serverProcess = spawn(tsxCommand, ["server/index.ts", "--preview"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(qaPort),
      NO_COLOR: "1",
    },
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    if (text.includes("server running")) console.log(text.trim());
  });
  serverProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error(text);
  });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const health = await readHealth(baseUrl);
    if (health?.ok) return { baseUrl, health, temporary: true };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`dev server did not become healthy on ${baseUrl}`);
};

const ensureServer = async () => {
  const requestedBaseUrl = process.env.QA_BASE_URL?.trim();
  if (requestedBaseUrl) {
    const existingHealth = await readHealth(requestedBaseUrl);
    if (
      existingHealth?.ok &&
      (await supportsCurrentApiSurface(requestedBaseUrl))
    ) {
      return {
        baseUrl: requestedBaseUrl,
        health: existingHealth,
        temporary: false,
      };
    }

    if (existingHealth?.ok) {
      console.log(
        `Existing QA server at ${requestedBaseUrl} is healthy but does not expose the current QA API surface; starting a temporary server.`,
      );
    }
  }

  // A default QA run must exercise the current worktree, not an unrelated
  // long-running preview process that happens to expose the same route names.
  return await startTemporaryServer();
};

const smokeRoute = async (baseUrl, route, expectedStatuses) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}${route}`);
    const expected = expectedStatuses.includes(response.status);
    record(
      `HTTP ${route}`,
      expected ? "pass" : "fail",
      `status ${response.status}, expected ${expectedStatuses.join("/")}`,
    );
    return expected;
  } catch (error) {
    record(`HTTP ${route}`, "fail", error instanceof Error ? error.message : String(error));
    return false;
  }
};

const smokeJsonRoute = async (baseUrl, route, expectedStatuses, expectedShape = {}) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}${route}`);
    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const matchesShape = Object.entries(expectedShape).every(
      ([key, value]) => data?.[key] === value,
    );
    const expected = expectedStatuses.includes(response.status) && matchesShape;
    const shapeSummary =
      Object.keys(expectedShape).length > 0
        ? `, expected body ${JSON.stringify(expectedShape)}`
        : "";
    record(
      `HTTP ${route}`,
      expected ? "pass" : "fail",
      `status ${response.status}, expected ${expectedStatuses.join("/")}${shapeSummary}`,
    );
    return expected;
  } catch (error) {
    record(`HTTP ${route}`, "fail", error instanceof Error ? error.message : String(error));
    return false;
  }
};

const smokeAppShellRoute = async (baseUrl, route) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}${route}`, {
      headers: { Accept: "text/html" },
      timeoutMs: 30000,
    });
    const body = await response.text();
    const hasRoot = body.includes('id="root"');
    const hasViteError = body.includes("vite-error-overlay") || body.includes("[plugin:vite");
    const ok = response.status === 200 && hasRoot && !hasViteError;

    record(
      `UI shell ${route}`,
      ok ? "pass" : "fail",
      `status ${response.status}, root ${hasRoot ? "yes" : "no"}, vite error ${
        hasViteError ? "yes" : "no"
      }`,
    );
    return ok;
  } catch (error) {
    record(`UI shell ${route}`, "fail", error instanceof Error ? error.message : String(error));
    return false;
  }
};

const smokeMethodRoute = async (
  baseUrl,
  method,
  route,
  expectedStatuses,
  body,
) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}${route}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const expected = expectedStatuses.includes(response.status);
    record(
      `${method} ${route}`,
      expected ? "pass" : "fail",
      `status ${response.status}, expected ${expectedStatuses.join("/")}`,
    );
    return expected;
  } catch (error) {
    record(
      `${method} ${route}`,
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const measureGetRoute = async (baseUrl, route, timeoutMs = 15000) => {
  const startedAt = performance.now();
  const response = await fetchWithTimeout(`${baseUrl}${route}`, {
    headers: { Accept: "application/json" },
    timeoutMs,
  });
  await response.arrayBuffer();
  return {
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    cacheControl: response.headers.get("cache-control") ?? "",
  };
};

const checkPublicApiCache = async (baseUrl, route) => {
  try {
    const coldTimeoutMs = Number(
      process.env.QA_PUBLIC_API_COLD_TIMEOUT_MS || 45000,
    );
    const first = await measureGetRoute(baseUrl, route, coldTimeoutMs);
    const repeat = await measureGetRoute(baseUrl, route);
    const warmed = await measureGetRoute(baseUrl, route);
    const repeatBudgetMs = Number(process.env.QA_PUBLIC_API_REPEAT_BUDGET_MS || 750);
    const hasPublicCache =
      first.cacheControl.includes("public") &&
      first.cacheControl.includes("max-age=60") &&
      first.cacheControl.includes("stale-while-revalidate=300");
    const warmRepeatMs = Math.min(repeat.durationMs, warmed.durationMs);
    const ok =
      first.status === 200 &&
      repeat.status === 200 &&
      warmed.status === 200 &&
      hasPublicCache &&
      warmRepeatMs <= repeatBudgetMs;

    record(
      `Public API cache ${route}`,
      ok ? "pass" : "fail",
      `first ${first.durationMs}ms, repeats ${repeat.durationMs}/${warmed.durationMs}ms, cache "${
        first.cacheControl || "missing"
      }", repeat budget ${repeatBudgetMs}ms`,
    );
    return ok;
  } catch (error) {
    record(
      `Public API cache ${route}`,
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const findSupabaseCli = () => {
  const candidates = [
    process.env.SUPABASE_CLI,
    path.join(os.homedir(), ".local", "bin", isWindows ? "supabase.exe" : "supabase"),
    isWindows ? "supabase.cmd" : "supabase",
    "supabase",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0) return candidate;
  }
  return null;
};

const checkSupabaseMigrations = async () => {
  const supabase = findSupabaseCli();
  if (!supabase) {
    record("Supabase linked migrations", "fail", "Supabase CLI not found");
    return false;
  }

  console.log(`\n$ ${supabase} migration list --linked --agent=no`);
  const result = spawnSync(
    supabase,
    ["migration", "list", "--linked", "--agent=no"],
    {
      cwd: root,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output) console.log(output);

  if (result.status !== 0) {
    const transientConnectionIssue =
      /ECIRCUITBREAKER|too many authentication failures|SUPABASE_DB_PASSWORD/i.test(
        output,
      );
    record(
      "Supabase linked migrations",
      transientConnectionIssue ? "warn" : "fail",
      transientConnectionIssue
        ? "remote migration check temporarily blocked by Supabase connection guard"
        : `exit ${result.status}`,
    );
    return transientConnectionIssue;
  }

  const pendingLocal = output
    .split(/\r?\n/)
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((columns) => /^\d{14}$/.test(columns[0] ?? "") && !columns[1])
    .map((columns) => columns[0]);

  if (pendingLocal.length > 0) {
    record(
      "Supabase linked migrations",
      "fail",
      `local migrations not on remote: ${pendingLocal.join(", ")}`,
    );
    return false;
  }

  record("Supabase linked migrations", "pass");
  return true;
};

const browserRenderRoutes = [
  {
    name: "home",
    path: "/",
    requiredText: [
      "광고 계약은",
      "브랜드 · 광고대행사",
      "크리에이터 · 유튜버",
    ],
    minTextLength: 50,
  },
  {
    name: "intro advertiser",
    path: "/intro/advertiser",
    requiredText: [
      "인플루언서",
      "광고",
      "계약서",
      "없는 약속은",
      "위험합니다.",
      "광고비 먹튀",
    ],
    mobileRequiredText: [
      "인플루언서",
      "광고",
      "광고비 먹튀",
      "협찬품 미반환",
      "콘텐츠 수정 거부",
      "각종 분쟁",
    ],
    minTextLength: 65,
    mobileMinTextLength: 55,
  },
  {
    name: "intro influencer",
    path: "/intro/influencer",
    requiredText: [
      "광고계약",
      "흩어진 광고 계약",
      "위험합니다",
      "광고비 미지급",
      "마감일 착오",
      "콘텐츠 기준 변경",
      "활용 범위 과다",
    ],
    mobileRequiredText: [
      "광고계약",
      "흩어진 광고 계약",
      "위험합니다",
      "광고비 미지급",
      "마감일 착오",
    ],
    minTextLength: 60,
    mobileMinTextLength: 55,
  },
  {
    name: "login",
    path: "/login",
    requiredText: ["광고주로 시작", "인플루언서로 시작"],
    minTextLength: 60,
  },
  {
    name: "password reset",
    path: "/reset-password?role=advertiser",
    requiredText: ["비밀번호 재설정", "재설정 메일"],
    minTextLength: 60,
  },
  {
    name: "signup advertiser",
    path: "/signup/advertiser",
    requiredText: ["광고주 가입", "회사명 또는 브랜드명"],
    minTextLength: 80,
  },
  {
    name: "privacy",
    path: "/privacy",
    requiredText: ["개인정보 처리방침"],
    minTextLength: 120,
  },
  {
    name: "terms",
    path: "/terms",
    requiredText: ["이용약관"],
    minTextLength: 120,
  },
  {
    name: "e-sign consent",
    path: "/legal/e-sign-consent",
    requiredText: ["전자서명 안내"],
    minTextLength: 120,
  },
  {
    name: "support",
    path: "/support",
    requiredText: ["문의 접수", "정산, 지급대행", "yeollockme@gmail.com"],
    forbiddenText: ["정산 문의"],
    minTextLength: 120,
  },
  {
    name: "support contract context",
    path: "/support?category=contract_flow&role=advertiser&contract_id=demo-contract-001&contract_title=%EB%B8%8C%EB%A0%88%EB%93%9C%EB%A3%B8%20%EA%B3%84%EC%95%BD%20%EB%AC%B8%EC%9D%98",
    requiredText: ["문의 접수", "브레드룸 계약 문의", "demo-contract-001"],
    forbiddenText: ["정산 문의"],
    minTextLength: 120,
  },
  {
    name: "resource guide",
    path: "/resources",
    requiredText: ["광고 계약 가이드", "공동구매 계약 가이드", "유튜브 PPL 계약 가이드"],
    minTextLength: 120,
  },
];

const browserRenderViewports = [
  { name: "desktop", width: 1365, height: 900, mobile: false },
  { name: "mobile", width: 375, height: 812, mobile: true },
];

const getRenderRequiredText = (route, viewport) =>
  viewport.mobile ? route.mobileRequiredText ?? route.requiredText : route.requiredText;

const getRenderMinTextLength = (route, viewport) =>
  viewport.mobile ? route.mobileMinTextLength ?? route.minTextLength : route.minTextLength;

const qaCredentials = {
  advertiserEmail: process.env.QA_ADVERTISER_EMAIL || "breadroom.manager@yeollock.me",
  influencerEmail: process.env.QA_INFLUENCER_EMAIL || "creator.sora@yeollock.me",
  password: process.env.QA_TEST_PASSWORD || "YeollockTest!2026",
};

const checkPrivateApiBoundary = async (baseUrl, route) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}${route}`, {
      headers: { Accept: "application/json" },
      timeoutMs: 15000,
    });
    await response.arrayBuffer();
    const cacheControl = response.headers.get("cache-control") ?? "";
    const ok =
      response.status === 401 &&
      cacheControl.includes("private") &&
      cacheControl.includes("no-store");

    record(
      `Private API boundary ${route}`,
      ok ? "pass" : "fail",
      `status ${response.status}, cache "${cacheControl || "missing"}"`,
    );
    return ok;
  } catch (error) {
    record(
      `Private API boundary ${route}`,
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const browserPerformanceBudgets = {
  loginMs: Number(process.env.QA_LOGIN_BUDGET_MS || 1300),
  routeMs: Number(process.env.QA_ROUTE_TRANSITION_BUDGET_MS || 1500),
  actionMs: Number(process.env.QA_ACTION_BUDGET_MS || 250),
};

const isAbsoluteWindowsPath = (candidate) => /^[a-z]:[\\/]/i.test(candidate);

const findBrowserExecutable = async () => {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const configured = process.env.QA_CHROME_PATH;
  const absoluteCandidates = [
    configured && (path.isAbsolute(configured) || isAbsoluteWindowsPath(configured))
      ? configured
      : null,
    isWindows && programFiles
      ? path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    isWindows && programFilesX86
      ? path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    isWindows && localAppData
      ? path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    isWindows && programFiles
      ? path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
    isWindows && programFilesX86
      ? path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
  ].filter(Boolean);

  for (const candidate of absoluteCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known browser path.
    }
  }

  const commandCandidates = [
    configured && !(path.isAbsolute(configured) || isAbsoluteWindowsPath(configured))
      ? configured
      : null,
    isWindows ? null : "google-chrome",
    isWindows ? null : "chromium",
    isWindows ? null : "chromium-browser",
    isWindows ? null : "microsoft-edge",
  ].filter(Boolean);

  for (const candidate of commandCandidates) {
    const result = spawnSync(candidate, ["--version"], {
      cwd: root,
      encoding: "utf8",
      shell: isWindows,
      windowsHide: true,
    });
    if (result.status === 0) return candidate;
  }

  return null;
};

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (typeof WebSocket === "undefined") {
      throw new Error("Node WebSocket API is not available");
    }

    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => {
      const raw =
        typeof event.data === "string"
          ? event.data
          : Buffer.from(event.data).toString("utf8");
      const message = JSON.parse(raw);
      if (!message.id || !this.pending.has(message.id)) return;

      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
        return;
      }

      resolve(message.result);
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("DevTools WebSocket connection timed out")),
        10000,
      );
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("DevTools WebSocket connection failed"));
      });
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // The browser process may have already exited.
    }
  }
}

const readDevToolsEndpoint = async (profileDir) => {
  const activePortFile = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    try {
      const content = await fs.readFile(activePortFile, "utf8");
      const [port, webSocketPath] = content.trim().split(/\r?\n/);
      if (port && webSocketPath) {
        return {
          port,
          webSocketUrl: `ws://127.0.0.1:${port}${webSocketPath}`,
        };
      }
    } catch {
      // Chrome writes this file after the DevTools endpoint is ready.
    }

    await sleep(250);
  }

  throw new Error("DevTools endpoint was not published");
};

const evaluateRenderedPage = async (client, sessionId) => {
  const evaluation = await client.send(
    "Runtime.evaluate",
    {
      expression: `(() => {
        const bodyText = document.body?.innerText?.replace(/\\s+/g, " ").trim() || "";
        const root = document.getElementById("root");
        const rootRect = root?.getBoundingClientRect();
        return {
          url: location.href,
          title: document.title,
          bodyText,
          bodyTextLength: bodyText.length,
          rootChildCount: root?.childElementCount ?? 0,
          rootHeight: rootRect?.height ?? 0,
          hasViteError:
            bodyText.includes("[plugin:vite") ||
            bodyText.includes("vite-error-overlay") ||
            Boolean(document.querySelector("vite-error-overlay")),
          hasRouteErrorBoundary:
            bodyText.includes("화면을 다시 불러와야 합니다") ||
            bodyText.includes("일시적인 화면 오류가 발생했습니다"),
          stillLoading:
            bodyText.includes("화면을 불러오는 중입니다") && bodyText.length < 100,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      })()`,
      returnByValue: true,
    },
    sessionId,
  );

  return evaluation.result?.value ?? {};
};

const checkRenderedRoute = async (client, baseUrl, route, viewport) => {
  const target = await client.send("Target.createTarget", { url: "about:blank" });
  const targetId = target.targetId;
  const attached = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  let lastMetrics = {};

  try {
    await client.send("Page.enable", {}, sessionId);
    await client.send("Runtime.enable", {}, sessionId);
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      },
      sessionId,
    );
    await client.send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: viewport.mobile },
      sessionId,
    );
    await client.send(
      "Page.navigate",
      { url: new URL(route.path, baseUrl).toString() },
      sessionId,
    );

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      lastMetrics = await evaluateRenderedPage(client, sessionId);
      const requiredText = getRenderRequiredText(route, viewport);
      const minTextLength = getRenderMinTextLength(route, viewport);
      const hasRequiredText = requiredText.every((text) =>
        lastMetrics.bodyText?.includes(text),
      );
      const hasForbiddenText = (route.forbiddenText ?? []).some((text) =>
        lastMetrics.bodyText?.includes(text),
      );
      const rendered =
        Number(lastMetrics.bodyTextLength ?? 0) >= minTextLength &&
        Number(lastMetrics.rootChildCount ?? 0) > 0 &&
        Number(lastMetrics.rootHeight ?? 0) >= Math.min(300, viewport.height * 0.6) &&
        !lastMetrics.hasViteError &&
        !lastMetrics.hasRouteErrorBoundary &&
        !lastMetrics.stillLoading &&
        hasRequiredText &&
        !hasForbiddenText;

      if (rendered) return { ok: true, metrics: lastMetrics };
      if (lastMetrics.hasViteError) break;
      await sleep(500);
    }

    return { ok: false, metrics: lastMetrics };
  } finally {
    if (targetId) {
      try {
        await client.send("Target.closeTarget", { targetId });
      } catch {
        // Closing the whole browser at the end is enough for a failed target.
      }
    }
  }
};

const checkBrowserRenderedRoutes = async (baseUrl) => {
  if (process.env.QA_SKIP_BROWSER_RENDER === "1") {
    record("Browser rendered routes", "warn", "skipped by QA_SKIP_BROWSER_RENDER=1");
    return true;
  }

  const browserExecutable = await findBrowserExecutable();
  if (!browserExecutable) {
    record("Browser rendered routes", "fail", "Chrome or Edge executable not found");
    return false;
  }

  const outputDir = path.join(
    root,
    "qa-artifacts",
    `browser-render-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  const profileDir = path.join(outputDir, "chrome-profile");
  await fs.mkdir(profileDir, { recursive: true });

  const browserProcess = spawn(
    browserExecutable,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  );
  let browserErrorOutput = "";
  browserProcess.stderr.on("data", (chunk) => {
    browserErrorOutput += chunk.toString();
  });

  let client;
  const checkResults = [];

  try {
    const endpoint = await readDevToolsEndpoint(profileDir);
    client = new CdpClient(endpoint.webSocketUrl);
    await client.connect();

    for (const viewport of browserRenderViewports) {
      for (const route of browserRenderRoutes) {
        const result = await checkRenderedRoute(client, baseUrl, route, viewport);
        checkResults.push(result.ok);
        const textLength = result.metrics.bodyTextLength ?? 0;
        const rootHeight = Math.round(result.metrics.rootHeight ?? 0);
        const requiredText = getRenderRequiredText(route, viewport);
        const hasRequiredText = requiredText.every((text) =>
          result.metrics.bodyText?.includes(text),
        );
        const hasForbiddenText = (route.forbiddenText ?? []).some((text) =>
          result.metrics.bodyText?.includes(text),
        );
        const detail = result.ok
          ? `text ${textLength}, root ${rootHeight}px`
          : `text ${textLength}, root ${rootHeight}px, required ${
              hasRequiredText ? "yes" : "no"
            }, forbidden ${
              hasForbiddenText ? "yes" : "no"
            }, errorBoundary ${result.metrics.hasRouteErrorBoundary ? "yes" : "no"}, loading ${
              result.metrics.stillLoading ? "yes" : "no"
            }, sample "${
              result.metrics.bodyText?.slice(0, 48) || "empty"
            }"`;

        record(
          `Browser render ${viewport.name} ${route.name}`,
          result.ok ? "pass" : "fail",
          detail,
        );
      }
    }
  } catch (error) {
    record(
      "Browser rendered routes",
      "fail",
      `${
        error instanceof Error ? error.message : String(error)
      }${browserErrorOutput ? `; browser stderr: ${browserErrorOutput.slice(0, 240)}` : ""}`,
    );
    checkResults.push(false);
  } finally {
    client?.close();
    stopProcessTree(browserProcess.pid);
  }

  return checkResults.every(Boolean);
};

const evaluateCdpValue = async (client, sessionId, expression) => {
  const evaluation = await client.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  );

  if (evaluation.exceptionDetails) {
    const exceptionText =
      evaluation.exceptionDetails.text ||
      evaluation.exceptionDetails.exception?.description ||
      "Runtime evaluation failed";
    throw new Error(exceptionText);
  }

  return evaluation.result?.value;
};

const waitForRouteReady = async (
  client,
  sessionId,
  expectedPath,
  { minTextLength = 60, timeoutMs = 15000 } = {},
) => {
  const deadline = Date.now() + timeoutMs;
  let lastMetrics = {};

  while (Date.now() < deadline) {
    lastMetrics = await evaluateCdpValue(
      client,
      sessionId,
      `(() => {
        const bodyText = document.body?.innerText?.replace(/\\s+/g, " ").trim() || "";
        const root = document.getElementById("root");
        return {
          pathname: location.pathname,
          href: location.href,
          bodyTextLength: bodyText.length,
          rootChildCount: root?.childElementCount ?? 0,
          hasViteError:
            bodyText.includes("[plugin:vite") ||
            bodyText.includes("vite-error-overlay") ||
            Boolean(document.querySelector("vite-error-overlay")),
          stillLoading:
            /불러오는 중|확인 중|loading/i.test(bodyText) && bodyText.length < 120,
          sample: bodyText.slice(0, 80),
        };
      })()`,
    );

    const isExpectedPath = !expectedPath || lastMetrics.pathname === expectedPath;
    const isReady =
      isExpectedPath &&
      Number(lastMetrics.bodyTextLength ?? 0) >= minTextLength &&
      Number(lastMetrics.rootChildCount ?? 0) > 0 &&
      !lastMetrics.hasViteError &&
      !lastMetrics.stillLoading;

    if (isReady) return lastMetrics;
    if (lastMetrics.hasViteError) break;
    await sleep(100);
  }

  throw new Error(
    `route ${expectedPath || "(any)"} not ready; path ${lastMetrics.pathname || "unknown"}, text ${
      lastMetrics.bodyTextLength ?? 0
    }, sample "${lastMetrics.sample || "empty"}"`,
  );
};

const fillLoginAndSubmit = async (client, sessionId, email, password) =>
  await evaluateCdpValue(
    client,
    sessionId,
    `(async () => {
      const waitFrames = async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      };
      const setValue = (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(element),
          "value",
        )?.set;
        if (setter) setter.call(element, value);
        else element.value = value;
        element.focus();
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const emailInput = document.querySelector('input[type="email"], input[name="email"]');
      const passwordInput = document.querySelector('input[type="password"], input[name="password"]');
      const submitButton = document.querySelector('button[type="submit"]');
      if (!emailInput || !passwordInput || !submitButton) {
        return {
          ok: false,
          detail: "login form controls missing",
        };
      }
      setValue(emailInput, ${JSON.stringify(email)});
      setValue(passwordInput, ${JSON.stringify(password)});
      await waitFrames();
      submitButton.click();
      return { ok: true };
    })()`,
  );

const measureBrowserLogin = async (client, sessionId, baseUrl, role, email) => {
  const loginPath = `/login/${role}`;
  const dashboardPath = `/${role}/dashboard`;
  await client.send("Page.navigate", { url: new URL(loginPath, baseUrl).toString() }, sessionId);
  await waitForRouteReady(client, sessionId, loginPath, {
    minTextLength: 50,
    timeoutMs: 15000,
  });
  await sleep(Number(process.env.QA_LOGIN_PRELOAD_SETTLE_MS || 400));

  const startedAt = performance.now();
  const submitted = await fillLoginAndSubmit(
    client,
    sessionId,
    email,
    qaCredentials.password,
  );
  if (!submitted?.ok) {
    record(`Browser perf login ${role}`, "fail", submitted?.detail || "submit failed");
    return false;
  }

  try {
    await waitForRouteReady(client, sessionId, dashboardPath, {
      minTextLength: 10,
      timeoutMs: Math.max(browserPerformanceBudgets.loginMs + 5000, 15000),
    });
  } catch (error) {
    record(
      `Browser perf login ${role}`,
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const ok = durationMs <= browserPerformanceBudgets.loginMs;
  record(
    `Browser perf login ${role}`,
    ok ? "pass" : "fail",
    `${durationMs}ms, budget ${browserPerformanceBudgets.loginMs}ms`,
  );
  return ok;
};

const checkBrowserRoleSession = async (client, sessionId, role) => {
  const deadline = Date.now() + 10000;
  let state = {};

  while (Date.now() < deadline) {
    state = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const response = await fetch(${JSON.stringify(`/api/${role}/session`)}, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        return {
          status: response.status,
          authenticated: data.authenticated === true,
          pathname: location.pathname,
        };
      })()`,
    );
    if (state.authenticated) break;
    await sleep(100);
  }

  const ok = Boolean(state.authenticated);
  record(
    `Browser auth session ${role}`,
    ok ? "pass" : "fail",
    ok
      ? `authoritative session confirmed on ${state.pathname}`
      : `status ${state.status ?? "unknown"}, path ${state.pathname ?? "unknown"}`,
  );
  return ok;
};

const checkAuthenticatedMarketplaceInfluencerDiscovery = async (
  client,
  sessionId,
) => {
  try {
    const result = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const readPage = async (page) => {
          const startedAt = performance.now();
          const response = await fetch(
            "/api/marketplace/influencers?page=" + page + "&sort=name_asc",
            {
              credentials: "include",
              headers: { Accept: "application/json" },
            },
          );
          const data = await response.json().catch(() => ({}));
          return {
            status: response.status,
            cacheControl: response.headers.get("cache-control") || "",
            vary: response.headers.get("vary") || "",
            durationMs: Math.round(performance.now() - startedAt),
            data,
          };
        };

        const first = await readPage(1);
        const profiles = Array.isArray(first.data?.profiles)
          ? first.data.profiles
          : [];
        const total = first.data?.total;
        const privateResponse =
          first.cacheControl.includes("private") &&
          first.cacheControl.includes("no-store") &&
          first.vary.toLowerCase().includes("cookie");
        const accessRestricted =
          first.status === 403 &&
          privateResponse &&
          typeof first.data?.error === "string" &&
          first.data.error.length > 0;
        if (accessRestricted) {
          return {
            ok: true,
            accessRestricted: true,
            firstStatus: first.status,
            cacheControl: first.cacheControl,
            total: null,
            firstDurationMs: first.durationMs,
            secondDurationMs: 0,
            detailStatus: null,
          };
        }
        const firstPageValid =
          first.status === 200 &&
          privateResponse &&
          Number.isInteger(total) &&
          first.data?.page === 1 &&
          first.data?.pageSize === 100 &&
          first.data?.totalPages === Math.ceil(total / 100) &&
          profiles.length === Math.min(100, total);

        let secondPageValid = true;
        let secondDurationMs = 0;
        if (firstPageValid && total > 100) {
          const second = await readPage(2);
          secondDurationMs = second.durationMs;
          const firstIds = new Set(profiles.map((profile) => profile?.id));
          const secondProfiles = Array.isArray(second.data?.profiles)
            ? second.data.profiles
            : [];
          secondPageValid =
            second.status === 200 &&
            second.data?.total === total &&
            second.data?.page === 2 &&
            second.data?.pageSize === 100 &&
            !secondProfiles.some((profile) => firstIds.has(profile?.id));
        }

        const handle = profiles.find((profile) => profile?.handle)?.handle || "";
        let detailStatus = null;
        if (handle) {
          const detailResponse = await fetch(
            "/api/marketplace/influencers/" + encodeURIComponent(handle),
            {
              credentials: "include",
              headers: { Accept: "application/json" },
            },
          );
          detailStatus = detailResponse.status;
          await detailResponse.arrayBuffer();
        }

        return {
          ok:
            firstPageValid &&
            secondPageValid &&
            (detailStatus === null || detailStatus === 200),
          firstStatus: first.status,
          cacheControl: first.cacheControl,
          total: Number.isInteger(total) ? total : null,
          firstDurationMs: first.durationMs,
          secondDurationMs,
          detailStatus,
        };
      })()`,
    );

    const ok = Boolean(result?.ok);
    record(
      "Browser authenticated influencer discovery API",
      ok ? "pass" : "fail",
      ok
        ? result.accessRestricted
          ? `QA account correctly excluded with 403 in ${result.firstDurationMs}ms`
          : `total ${Number(result.total ?? 0).toLocaleString("en-US")}, page size 100, page 1 ${result.firstDurationMs}ms${
              result.secondDurationMs ? `, page 2 ${result.secondDurationMs}ms` : ""
            }, detail ${result.detailStatus ?? "not applicable"}`
        : `status ${result?.firstStatus ?? "unknown"}, cache "${
            result?.cacheControl || "missing"
          }", total ${result?.total ?? "invalid"}, detail ${
            result?.detailStatus ?? "not checked"
          }`,
    );
    return ok;
  } catch (error) {
    record(
      "Browser authenticated influencer discovery API",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const measureBrowserRouteTransition = async (
  client,
  sessionId,
  baseUrl,
  route,
  label,
) => {
  const startedAt = performance.now();
  try {
    await client.send("Page.navigate", { url: new URL(route, baseUrl).toString() }, sessionId);
    await waitForRouteReady(client, sessionId, route, {
      minTextLength: 70,
      timeoutMs: Math.max(browserPerformanceBudgets.routeMs + 5000, 12000),
    });
  } catch (error) {
    record(
      `Browser perf route ${label}`,
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const ok = durationMs <= browserPerformanceBudgets.routeMs;
  record(
    `Browser perf route ${label}`,
    ok ? "pass" : "fail",
    `${durationMs}ms, budget ${browserPerformanceBudgets.routeMs}ms`,
  );
  return ok;
};

const checkInfluencerCampaignMobileScroll = async (client, sessionId, baseUrl) => {
  try {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      },
      sessionId,
    );
    await client.send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: true },
      sessionId,
    );
    await client.send(
      "Page.navigate",
      { url: new URL("/influencer/campaigns", baseUrl).toString() },
      sessionId,
    );
    await waitForRouteReady(client, sessionId, "/influencer/campaigns", {
      minTextLength: 60,
      timeoutMs: 15000,
    });

    const result = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const waitFrames = async () => {
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        };
        let region = null;
        const emptyOperationalMessages = [
          "모집 중인 캠페인이 없습니다",
          "조건에 맞는 캠페인이 없습니다",
          "아직 신청한 캠페인이 없습니다",
        ];
        for (let attempt = 0; attempt < 80; attempt += 1) {
          region = document.querySelector('[data-campaign-scroll-region="open"]');
          if (region) break;
          const currentText = document.body?.innerText || "";
          if (emptyOperationalMessages.some((message) => currentText.includes(message))) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const pageText = document.body?.innerText || "";
        const activeCampaignTab = document.querySelector(
          '[role="tablist"][aria-label="캠페인 보기"] [role="tab"][aria-selected="true"]',
        );
        if (
          !activeCampaignTab ||
          !/^모집 캠페인 [0-9]+건$/u.test(activeCampaignTab.getAttribute("aria-label") || "")
        ) {
          return { ok: false, detail: "campaign list header missing" };
        }
        const filterButton = document.querySelector(
          '[aria-controls="influencer-campaign-filters"]',
        );
        if (!filterButton) {
          return { ok: false, detail: "campaign filter button missing" };
        }
        const filterRect = filterButton.getBoundingClientRect();
        const filterFits =
          filterRect.left >= 0 &&
          filterRect.right <= window.innerWidth &&
          document.documentElement.scrollWidth <= document.documentElement.clientWidth;
        if (!filterFits) {
          return {
            ok: false,
            detail: \`filter button overflow: left \${Math.round(filterRect.left)}, right \${Math.round(
              filterRect.right,
            )}, viewport \${window.innerWidth}, scrollWidth \${document.documentElement.scrollWidth}\`,
          };
        }
        const hasEmptyOperationalState = emptyOperationalMessages.some((message) =>
          pageText.includes(message),
        );
        if (!region) {
          return hasEmptyOperationalState
            ? {
                ok: true,
                empty: true,
                scrollTop: 0,
                scrollHeight: 0,
                clientHeight: 0,
                filterRight: Math.round(filterRect.right),
              }
            : { ok: false, detail: "open campaign scroll region missing" };
        }
        const overflowY = getComputedStyle(region).overflowY;
        const scrollHeight = region.scrollHeight;
        const clientHeight = region.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        const renderedCampaignCards = region.querySelectorAll("article").length;
        if (maxScroll < 40) {
          if (hasEmptyOperationalState) {
            return {
              ok: true,
              empty: true,
              scrollTop: 0,
              scrollHeight: Math.round(scrollHeight),
              clientHeight: Math.round(clientHeight),
              filterRight: Math.round(filterRect.right),
            };
          }
          if (/auto|scroll/i.test(overflowY) && renderedCampaignCards <= 1) {
            return {
              ok: true,
              fits: true,
              cards: renderedCampaignCards,
              scrollTop: 0,
              scrollHeight: Math.round(scrollHeight),
              clientHeight: Math.round(clientHeight),
              filterRight: Math.round(filterRect.right),
            };
          }
          return {
            ok: false,
            detail: \`not enough vertical overflow: scrollHeight \${scrollHeight}, clientHeight \${clientHeight}\`,
          };
        }
        const before = region.scrollTop;
        region.scrollTop = Math.min(260, maxScroll);
        await waitFrames();
        const after = region.scrollTop;
        return {
          ok: /auto|scroll/i.test(overflowY) && after > before,
          overflowY,
          scrollTop: Math.round(after),
          scrollHeight: Math.round(scrollHeight),
          clientHeight: Math.round(clientHeight),
          filterRight: Math.round(filterRect.right),
        };
      })()`,
    );

    const ok = Boolean(result?.ok);
    record(
      "Browser mobile influencer campaigns scroll",
      ok ? "pass" : "fail",
      ok
        ? result.empty
          ? `empty operational state; scroll not applicable, filter right ${result.filterRight}px`
          : result.fits
            ? `${result.cards} campaign card fits without overflow; scroll region remains enabled, filter right ${result.filterRight}px`
            : `scrollTop ${result.scrollTop}px, region ${result.clientHeight}/${result.scrollHeight}px, filter right ${result.filterRight}px`
        : result?.detail || "scroll region did not move",
    );
    return ok;
  } catch (error) {
    record(
      "Browser mobile influencer campaigns scroll",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const checkAdvertiserApplicantSortMenu = async (
  client,
  sessionId,
  baseUrl,
  outputDir,
) => {
  try {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 1365,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );
    await client.send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: false },
      sessionId,
    );

    const campaign = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const [campaignResponse, applicationResponse] = await Promise.all([
          fetch("/api/advertiser/campaigns", {
            credentials: "include",
            headers: { Accept: "application/json" },
          }),
          fetch("/api/marketplace/campaign-applications?role=advertiser", {
            credentials: "include",
            headers: { Accept: "application/json" },
          }),
        ]);
        if (!campaignResponse.ok || !applicationResponse.ok) return null;
        const [campaignData, applicationData] = await Promise.all([
          campaignResponse.json(),
          applicationResponse.json(),
        ]);
        const campaigns = Array.isArray(campaignData.campaigns)
          ? campaignData.campaigns
          : [];
        const threads = Array.isArray(applicationData.threads)
          ? applicationData.threads
          : [];
        const counts = new Map();
        for (const thread of threads) {
          if (!thread?.campaignId) continue;
          counts.set(thread.campaignId, (counts.get(thread.campaignId) || 0) + 1);
        }
        return campaigns
          .filter((item) => item?.id && (counts.get(item.id) || 0) > 0)
          .sort((left, right) =>
            (counts.get(right.id) || 0) - (counts.get(left.id) || 0)
          )
          .map((item) => ({ id: item.id, applicantCount: counts.get(item.id) || 0 }))[0] || null;
      })()`,
    );

    if (!campaign?.id) {
      record(
        "Browser advertiser applicant sort menu",
        "fail",
        "campaign with applicants missing",
      );
      return false;
    }

    const route = `/advertiser/campaigns?campaign=${encodeURIComponent(
      `campaign:${campaign.id}`,
    )}`;
    await client.send(
      "Page.navigate",
      { url: new URL(route, baseUrl).toString() },
      sessionId,
    );
    await waitForRouteReady(client, sessionId, "/advertiser/campaigns", {
      minTextLength: 100,
      timeoutMs: 15000,
    });

    const opened = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let trigger = null;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          trigger = document.querySelector(
            'button[aria-label="지원자 정렬"][aria-haspopup="listbox"]'
          );
          if (trigger) break;
          await wait(100);
        }
        if (!trigger) return { ok: false, detail: "applicant sort trigger missing" };
        trigger.click();
        await wait(100);
        const listbox = document.querySelector('[role="listbox"][aria-label="지원자 정렬"]');
        const options = listbox
          ? Array.from(listbox.querySelectorAll('[role="option"]'))
          : [];
        const rect = listbox?.getBoundingClientRect();
        const triggerRect = trigger.getBoundingClientRect();
        const horizontalOverlap = rect
          ? rect.right >= triggerRect.left && rect.left <= triggerRect.right
          : false;
        const horizontalEdgeAligned = rect
          ? Math.abs(rect.left - triggerRect.left) <= 12 ||
            Math.abs(rect.right - triggerRect.right) <= 12
          : false;
        const verticalGap = rect
          ? rect.top >= triggerRect.bottom
            ? rect.top - triggerRect.bottom
            : triggerRect.top >= rect.bottom
              ? triggerRect.top - rect.bottom
              : 0
          : Number.POSITIVE_INFINITY;
        const anchored =
          (horizontalOverlap || horizontalEdgeAligned) && verticalGap <= 16;
        return {
          ok:
            trigger.getAttribute("aria-expanded") === "true" &&
            Boolean(listbox) &&
            options.length >= 2 &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= window.innerHeight &&
            anchored,
          detail: listbox
            ? "sort listbox incomplete, clipped, or detached from trigger (gap " +
              Math.round(verticalGap) +
              "px)"
            : "sort listbox missing",
          optionCount: options.length,
          menuLeft: rect ? Math.round(rect.left) : null,
          menuRight: rect ? Math.round(rect.right) : null,
          triggerLeft: Math.round(triggerRect.left),
          triggerRight: Math.round(triggerRect.right),
          verticalGap: Number.isFinite(verticalGap) ? Math.round(verticalGap) : null,
          anchored,
        };
      })()`,
    );
    if (!opened?.ok) {
      record(
        "Browser advertiser applicant sort menu",
        "fail",
        opened?.detail || "sort menu did not open",
      );
      return false;
    }

    const screenshot = await client.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    await fs.writeFile(
      path.join(outputDir, "advertiser-applicant-sort-open.png"),
      Buffer.from(screenshot.data, "base64"),
    );

    await client.send(
      "Input.dispatchKeyEvent",
      { type: "keyDown", key: "Escape", code: "Escape" },
      sessionId,
    );
    await client.send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Escape", code: "Escape" },
      sessionId,
    );

    const result = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const trigger = document.querySelector(
          'button[aria-label="지원자 정렬"][aria-haspopup="listbox"]'
        );
        if (!trigger) return { ok: false, detail: "sort trigger disappeared" };
        await wait(80);
        const escaped = trigger.getAttribute("aria-expanded") === "false";
        trigger.click();
        await wait(80);
        const options = Array.from(
          document.querySelectorAll('[role="listbox"][aria-label="지원자 정렬"] [role="option"]')
        );
        const nextOption = options.find(
          (option) => option.getAttribute("aria-selected") === "false"
        );
        if (!nextOption) return { ok: false, detail: "alternate sort option missing" };
        const selectedText = (nextOption.textContent || "").trim();
        nextOption.click();
        await wait(100);
        const selected =
          trigger.getAttribute("aria-expanded") === "false" &&
          (trigger.textContent || "").includes(selectedText);
        trigger.click();
        await wait(80);
        document.body.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" })
        );
        await wait(80);
        const outsideClosed = trigger.getAttribute("aria-expanded") === "false";
        return { ok: escaped && selected && outsideClosed, escaped, selected, outsideClosed };
      })()`,
    );

    const ok = Boolean(result?.ok);
    record(
      "Browser advertiser applicant sort menu",
      ok ? "pass" : "fail",
      ok
        ? `${opened.optionCount} options, Escape/select/outside click verified, ${campaign.applicantCount} applicants`
        : result?.detail ||
            `escape ${Boolean(result?.escaped)}, select ${Boolean(result?.selected)}, outside ${Boolean(result?.outsideClosed)}`,
    );
    return ok;
  } catch (error) {
    record(
      "Browser advertiser applicant sort menu",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const checkInfluencerContractLoginContinuation = async (
  client,
  sessionId,
  baseUrl,
  outputDir,
) => {
  try {
    const contractState = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const preferredStages = ["deliverables_due", "deliverables_review", "signed"];
        let lastState = { authenticated: false, contractCount: 0, stages: [] };
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const response = await fetch("/api/influencer/dashboard?includeApplications=false", {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const data = await response.json().catch(() => ({}));
          const contracts = Array.isArray(data.contracts) ? data.contracts : [];
          const contract = contracts
            .filter((item) => item?.id && preferredStages.includes(item.stage))
            .sort(
              (left, right) =>
                preferredStages.indexOf(left.stage) - preferredStages.indexOf(right.stage),
            )
            .map((item) => ({ id: item.id, stage: item.stage }))[0];
          lastState = {
            authenticated: data.authenticated === true,
            contractCount: contracts.length,
            stages: contracts.map((item) => item.stage),
          };
          if (contract) return { ...lastState, contract };
          await wait(100);
        }
        return { ...lastState, contract: null };
      })()`,
    );
    const contract = contractState?.contract;
    if (!contract?.id) {
      record(
        "Browser influencer contract login continuation",
        "fail",
        `signed direct contract missing; authenticated ${Boolean(
          contractState?.authenticated,
        )}, contracts ${contractState?.contractCount ?? 0}, stages ${(
          contractState?.stages ?? []
        ).join(",") || "none"}`,
      );
      return false;
    }

    await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        await fetch("/api/influencer/logout", {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        return true;
      })()`,
    );
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 320,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      },
      sessionId,
    );
    await client.send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: true },
      sessionId,
    );

    const destinationPath = `/contract/${contract.id}`;
    const loginPath = `/login/influencer?next=${encodeURIComponent(destinationPath)}`;
    await client.send(
      "Page.navigate",
      { url: new URL(loginPath, baseUrl).toString() },
      sessionId,
    );
    await waitForRouteReady(client, sessionId, "/login/influencer", {
      minTextLength: 50,
      timeoutMs: 15000,
    });
    const submitted = await fillLoginAndSubmit(
      client,
      sessionId,
      qaCredentials.influencerEmail,
      qaCredentials.password,
    );
    if (!submitted?.ok) {
      record(
        "Browser influencer contract login continuation",
        "fail",
        submitted?.detail || "login submit failed",
      );
      return false;
    }

    const deadline = Date.now() + 20000;
    let state = {};
    while (Date.now() < deadline) {
      state = await evaluateCdpValue(
        client,
        sessionId,
        `(() => {
          const text = document.body?.innerText || "";
          const doc = document.documentElement;
          return {
            pathname: location.pathname,
            hasPostSignHeading: text.includes("콘텐츠를 제출하세요"),
            hasLoadFailure: text.includes("계약을 불러올 수 없습니다"),
            overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            textLength: text.trim().length,
          };
        })()`,
      );
      if (
        state.pathname === destinationPath &&
        state.hasPostSignHeading &&
        !state.hasLoadFailure
      ) {
        break;
      }
      if (state.hasLoadFailure) break;
      await sleep(100);
    }

    const screenshot = await client.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    await fs.writeFile(
      path.join(outputDir, "mobile-influencer-contract-login-continuation.png"),
      Buffer.from(screenshot.data, "base64"),
    );

    const ok =
      state.pathname === destinationPath &&
      state.hasPostSignHeading &&
      !state.hasLoadFailure &&
      Number(state.overflowX ?? 1) === 0;
    record(
      "Browser influencer contract login continuation",
      ok ? "pass" : "fail",
      ok
        ? `contract ${contract.stage}, 320px overflow ${state.overflowX}px`
        : `path ${state.pathname || "unknown"}, post-sign heading ${Boolean(
            state.hasPostSignHeading,
          )}, load failure ${Boolean(state.hasLoadFailure)}, overflow ${
            state.overflowX ?? "unknown"
          }px`,
    );
    return ok;
  } catch (error) {
    record(
      "Browser influencer contract login continuation",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
};

const measureBrowserInputAction = async (client, sessionId, label) => {
  const result = await evaluateCdpValue(
    client,
    sessionId,
    `(async () => {
      const waitFrames = async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      };
      const setValue = (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(element),
          "value",
        )?.set;
        if (setter) setter.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const findSearchInput = () => Array.from(document.querySelectorAll("input")).find((item) =>
        item.type === "search" ||
        /검색|search/i.test(item.placeholder || "") ||
        /search/i.test(item.getAttribute("aria-label") || "")
      );
      const openFiltersIfNeeded = async () => {
        const button = Array.from(document.querySelectorAll("button")).find((item) =>
          /필터|filter/i.test(item.textContent || "") ||
          /filter/i.test(item.getAttribute("aria-controls") || "")
        );
        if (!button) return false;
        button.click();
        await waitFrames();
        return true;
      };
      let input = findSearchInput();
      if (!input) {
        const opened = await openFiltersIfNeeded();
        if (opened) input = findSearchInput();
      }
      if (!input) return { ok: false, detail: "search input missing" };
      const startedAt = performance.now();
      setValue(input, "릴스");
      await waitFrames();
      return {
        ok: true,
        durationMs: Math.round(performance.now() - startedAt),
        value: input.value,
      };
    })()`,
  );

  if (!result?.ok) {
    record(`Browser perf action ${label} search`, "fail", result?.detail || "action failed");
    return false;
  }

  const ok = result.durationMs <= browserPerformanceBudgets.actionMs;
  record(
    `Browser perf action ${label} search`,
    ok ? "pass" : "fail",
    `${result.durationMs}ms, budget ${browserPerformanceBudgets.actionMs}ms`,
  );
  return ok;
};

const measureBrowserSelectAction = async (client, sessionId, label) => {
  const result = await evaluateCdpValue(
    client,
    sessionId,
    `(async () => {
      const waitFrames = async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      };
      const findSelect = () => Array.from(document.querySelectorAll("select")).find(
        (item) => item.options.length > 1,
      );
      const findCustomFilterTrigger = () =>
        Array.from(
          document.querySelectorAll(
            'button[aria-haspopup="listbox"], button[aria-expanded]',
          ),
        ).find((item) => {
          if (item.offsetParent === null) return false;
          const controls = item.getAttribute("aria-controls") || "";
          if (/filters/i.test(controls)) return false;
          const text = (item.textContent || "").trim();
          return text && !/필터|filter|기간|정렬/i.test(text);
        });
      const openFiltersIfNeeded = async () => {
        const button = Array.from(document.querySelectorAll("button")).find((item) =>
          /필터|filter/i.test(item.textContent || "") ||
          /filter/i.test(item.getAttribute("aria-controls") || "")
        );
        if (!button) return false;
        button.click();
        await waitFrames();
        return true;
      };
      let select = findSelect();
      let trigger = findCustomFilterTrigger();
      if (!select && !trigger) {
        const opened = await openFiltersIfNeeded();
        if (opened) {
          select = findSelect();
          trigger = findCustomFilterTrigger();
        }
      }

      if (!select) {
        if (!trigger) return { ok: false, detail: "filter control missing" };
        trigger.click();
        await waitFrames();
        const option = Array.from(
          document.querySelectorAll(
            'button[role="option"], button[aria-pressed]',
          ),
        ).find((item) =>
          item.offsetParent !== null &&
          (item.getAttribute("aria-selected") === "false" ||
            item.getAttribute("aria-pressed") === "false"),
        );
        if (!option) return { ok: false, detail: "filter option missing" };
        const startedAt = performance.now();
        option.click();
        await waitFrames();
        return {
          ok: true,
          durationMs: Math.round(performance.now() - startedAt),
          value: (option.textContent || "").trim(),
        };
      }

      const nextIndex = select.selectedIndex === 0 ? 1 : 0;
      const startedAt = performance.now();
      select.selectedIndex = nextIndex;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFrames();
      return {
        ok: true,
        durationMs: Math.round(performance.now() - startedAt),
        value: select.value,
      };
    })()`,
  );

  if (!result?.ok) {
    record(`Browser perf action ${label} filter`, "fail", result?.detail || "action failed");
    return false;
  }

  const ok = result.durationMs <= browserPerformanceBudgets.actionMs;
  record(
    `Browser perf action ${label} filter`,
    ok ? "pass" : "fail",
    `${result.durationMs}ms, budget ${browserPerformanceBudgets.actionMs}ms`,
  );
  return ok;
};

const checkDashboardSurfaceBreakpoints = async (
  client,
  sessionId,
  role,
) => {
  const widths = [640, 768, 900, 1024, 1365];
  const route = `/${role}/dashboard`;
  const measurements = [];

  try {
    await waitForRouteReady(client, sessionId, route, {
      minTextLength: 60,
      timeoutMs: 15000,
    });

    for (const width of widths) {
      await client.send(
        "Emulation.setDeviceMetricsOverride",
        {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        },
        sessionId,
      );

      const result = await evaluateCdpValue(
        client,
        sessionId,
        `(async () => {
          const role = ${JSON.stringify(role)};
          const expectedWidth = ${width};
          const desktopSelector =
            '[data-dashboard-surface-switch="' + role + '"]';
          const mobileSelector =
            '[data-mobile-surface-switch="' + role + '"]';

          for (let attempt = 0; attempt < 150; attempt += 1) {
            if (
              document.querySelector(desktopSelector) &&
              document.querySelector(mobileSelector)
            ) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          await document.fonts?.ready;
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));

          const desktopSwitches = [
            ...document.querySelectorAll(desktopSelector),
          ];
          const mobileSwitches = [
            ...document.querySelectorAll(mobileSelector),
          ];
          const isVisible = (element) => {
            if (!element || element.getClientRects().length === 0) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };
          const rectFits = (element) => {
            const rect = element.getBoundingClientRect();
            return rect.left >= -0.5 && rect.right <= window.innerWidth + 0.5;
          };
          const itemText = (element) => (element?.textContent || '').trim();

          const desktop = desktopSwitches[0] || null;
          const mobile = mobileSwitches[0] || null;
          const desktopItems = desktop
            ? [...desktop.querySelectorAll(':scope > .yl-dashboard-surface-link')]
            : [];
          const mobileItems = mobile
            ? [...(mobile.querySelector(':scope > div')?.children || [])]
            : [];
          const desktopVisible = isVisible(desktop);
          const mobileVisible = isVisible(mobile);
          const expectsDesktop = window.innerWidth >= 1024;
          const visibleNav = expectsDesktop ? desktop : mobile;
          const visibleItems = expectsDesktop ? desktopItems : mobileItems;
          const ordered =
            itemText(visibleItems[0]) === '캠페인' &&
            itemText(visibleItems[1]) === '1:1 계약';
          const active = expectsDesktop
            ? desktop?.querySelector('[data-dashboard-surface-active="contracts"]')
            : mobile?.querySelector('[data-mobile-surface-active="contracts"]');
          const widths = desktopItems.map((item) => item.getBoundingClientRect().width);
          const widthDelta = widths.length
            ? Math.max(...widths) - Math.min(...widths)
            : 0;
          const visibleRectsFit =
            Boolean(visibleNav) &&
            rectFits(visibleNav) &&
            visibleItems.length >= 2 &&
            visibleItems.every((item) => isVisible(item) && rectFits(item));
          const overflow =
            document.documentElement.scrollWidth - document.documentElement.clientWidth;
          const visibilityMatches = expectsDesktop
            ? desktopVisible && !mobileVisible
            : mobileVisible && !desktopVisible;
          const viewportMatches = window.innerWidth === expectedWidth;

          return {
            ok:
              viewportMatches &&
              desktopSwitches.length === 1 &&
              mobileSwitches.length === 1 &&
              visibilityMatches &&
              ordered &&
              Boolean(active) &&
              visibleRectsFit &&
              (!expectsDesktop || widthDelta <= 1) &&
              overflow <= 0,
            expectedWidth,
            width: window.innerWidth,
            viewportMatches,
            desktopCount: desktopSwitches.length,
            mobileCount: mobileSwitches.length,
            desktopVisible,
            mobileVisible,
            ordered,
            active: Boolean(active),
            visibleRectsFit,
            widthDelta: Math.round(widthDelta * 10) / 10,
            overflow,
          };
        })()`,
      );
      measurements.push(result);
    }
  } finally {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 1365,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );
  }

  const ok =
    measurements.length === widths.length &&
    measurements.every((measurement) => measurement?.ok);
  record(
    `Browser ${role} dashboard surface breakpoints`,
    ok ? "pass" : "fail",
    measurements
      .map((measurement) =>
        measurement?.ok
          ? `${measurement.width}px ok`
          : `${measurement?.width ?? "?"}px ${JSON.stringify(measurement)}`,
      )
      .join(", "),
  );
  return ok;
};

const checkMobileVerificationAndProfileSurfaces = async (
  client,
  sessionId,
  baseUrl,
  outputDir,
) => {
  try {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      },
      sessionId,
    );
    await client.send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: true },
      sessionId,
    );

    await client.send(
      "Page.navigate",
      { url: new URL("/influencer/verification", baseUrl).toString() },
      sessionId,
    );
    await waitForRouteReady(client, sessionId, "/influencer/verification", {
      minTextLength: 80,
      timeoutMs: 15000,
    });
    const verification = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let section = null;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          section = document.querySelector('[data-verification-approved="influencer"]');
          if (section) break;
          await wait(100);
        }
        if (!section) return { ok: false, detail: "approved verification section missing" };
        const rows = Array.from(
          section.querySelectorAll('[data-verification-account-row="true"]')
        );
        const duplicateStatus = rows.some((row) =>
          Array.from(row.querySelectorAll("span")).some(
            (node) => (node.textContent || "").trim() === "인증"
          )
        );
        const primaryActions = section.querySelectorAll("button.yl-primary-action").length;
        const overflow = Math.max(
          0,
          Math.ceil(document.documentElement.scrollWidth - window.innerWidth)
        );
        return {
          ok: rows.length > 0 && !duplicateStatus && primaryActions === 1 && overflow <= 1,
          rows: rows.length,
          duplicateStatus,
          primaryActions,
          overflow,
        };
      })()`,
    );
    if (!verification?.ok) {
      record(
        "Browser mobile influencer verification surface",
        "fail",
        verification?.detail || JSON.stringify(verification),
      );
      return false;
    }
    const verificationShot = await client.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    await fs.writeFile(
      path.join(outputDir, "mobile-influencer-verification-approved.png"),
      Buffer.from(verificationShot.data, "base64"),
    );

    await client.send(
      "Page.navigate",
      { url: new URL("/influencer/profile", baseUrl).toString() },
      sessionId,
    );
    await waitForRouteReady(client, sessionId, "/influencer/profile", {
      minTextLength: 100,
      timeoutMs: 15000,
    });
    const profile = await evaluateCdpValue(
      client,
      sessionId,
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let row = null;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          row = document.querySelector('[data-verified-platform-row="true"]');
          if (row) break;
          await wait(100);
        }
        if (!row) return { ok: false, detail: "verified platform row missing" };
        row.scrollIntoView({ block: "center" });
        await wait(120);
        const link = row.querySelector('a[target="_blank"]');
        const rowRect = row.getBoundingClientRect();
        const linkRect = link?.getBoundingClientRect();
        const columns = getComputedStyle(row).gridTemplateColumns
          .split(/\\s+/)
          .filter(Boolean);
        const duplicateStatus = Array.from(row.querySelectorAll("span")).some(
          (node) => (node.textContent || "").trim() === "인증"
        );
        const verticallyBound = linkRect
          ? Math.abs(
              (rowRect.top + rowRect.bottom) / 2 -
                (linkRect.top + linkRect.bottom) / 2
            ) <= 12
          : false;
        const overflow = Math.max(
          0,
          Math.ceil(document.documentElement.scrollWidth - window.innerWidth)
        );
        return {
          ok:
            columns.length === 2 &&
            Boolean(link) &&
            verticallyBound &&
            !duplicateStatus &&
            overflow <= 1,
          columns: columns.length,
          verticallyBound,
          duplicateStatus,
          overflow,
        };
      })()`,
    );
    if (!profile?.ok) {
      record(
        "Browser mobile verified platform profile rows",
        "fail",
        profile?.detail || JSON.stringify(profile),
      );
      return false;
    }
    const profileShot = await client.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    await fs.writeFile(
      path.join(outputDir, "mobile-influencer-profile-platform-rows.png"),
      Buffer.from(profileShot.data, "base64"),
    );

    record(
      "Browser mobile influencer verification surface",
      "pass",
      `${verification.rows} official account rows, one blue action, no repeated approval chips`,
    );
    record(
      "Browser mobile verified platform profile rows",
      "pass",
      "two-column account rows stay visually bound without repeated approval chips",
    );
    return true;
  } catch (error) {
    record(
      "Browser mobile verification/profile surfaces",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 1365,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );
    await client.send(
      "Emulation.setTouchEmulationEnabled",
      { enabled: false },
      sessionId,
    );
  }
};

const checkBrowserPerformance = async (baseUrl) => {
  if (process.env.QA_SKIP_BROWSER_PERFORMANCE === "1") {
    record(
      "Browser performance checks",
      "warn",
      "skipped by QA_SKIP_BROWSER_PERFORMANCE=1",
    );
    return true;
  }

  const browserExecutable = await findBrowserExecutable();
  if (!browserExecutable) {
    record("Browser performance checks", "fail", "Chrome or Edge executable not found");
    return false;
  }

  const outputDir = path.join(
    root,
    "qa-artifacts",
    `browser-performance-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  const profileDir = path.join(outputDir, "chrome-profile");
  await fs.mkdir(profileDir, { recursive: true });

  const browserProcess = spawn(
    browserExecutable,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  );
  let browserErrorOutput = "";
  browserProcess.stderr.on("data", (chunk) => {
    browserErrorOutput += chunk.toString();
  });

  let client;
  const checkResults = [];

  try {
    const endpoint = await readDevToolsEndpoint(profileDir);
    client = new CdpClient(endpoint.webSocketUrl);
    await client.connect();

    const target = await client.send("Target.createTarget", { url: "about:blank" });
    const targetId = target.targetId;
    const attached = await client.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;

    try {
      await client.send("Page.enable", {}, sessionId);
      await client.send("Runtime.enable", {}, sessionId);
      await client.send(
        "Emulation.setDeviceMetricsOverride",
        {
          width: 1365,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        },
        sessionId,
      );

      checkResults.push(
        await measureBrowserLogin(
          client,
          sessionId,
          baseUrl,
          "advertiser",
          qaCredentials.advertiserEmail,
        ),
      );
      checkResults.push(
        await checkBrowserRoleSession(client, sessionId, "advertiser"),
      );
      checkResults.push(
        await checkAuthenticatedMarketplaceInfluencerDiscovery(client, sessionId),
      );
      checkResults.push(
        await checkDashboardSurfaceBreakpoints(
          client,
          sessionId,
          "advertiser",
        ),
      );
      await client.send(
        "Page.navigate",
        { url: new URL("/advertiser/discover", baseUrl).toString() },
        sessionId,
      );
      await waitForRouteReady(client, sessionId, "/advertiser/discover", {
        minTextLength: 80,
        timeoutMs: 15000,
      });
      checkResults.push(await measureBrowserInputAction(client, sessionId, "advertiser"));
      checkResults.push(await measureBrowserSelectAction(client, sessionId, "advertiser"));
      for (const [route, label] of [
        ["/advertiser/builder", "advertiser builder"],
        ["/advertiser/campaigns", "advertiser campaigns"],
        ["/advertiser/messages", "advertiser messages"],
        ["/advertiser/discover", "advertiser discover"],
        ["/advertiser/verification", "advertiser verification"],
      ]) {
        checkResults.push(
          await measureBrowserRouteTransition(client, sessionId, baseUrl, route, label),
        );
      }
      checkResults.push(
        await checkAdvertiserApplicantSortMenu(
          client,
          sessionId,
          baseUrl,
          outputDir,
        ),
      );

      checkResults.push(
        await measureBrowserLogin(
          client,
          sessionId,
          baseUrl,
          "influencer",
          qaCredentials.influencerEmail,
        ),
      );
      checkResults.push(
        await checkBrowserRoleSession(client, sessionId, "influencer"),
      );
      checkResults.push(
        await checkDashboardSurfaceBreakpoints(
          client,
          sessionId,
          "influencer",
        ),
      );
      checkResults.push(await measureBrowserInputAction(client, sessionId, "influencer"));
      checkResults.push(await measureBrowserSelectAction(client, sessionId, "influencer"));
      for (const [route, label] of [
        ["/influencer/campaigns", "influencer campaigns"],
        ["/influencer/brands", "influencer brands"],
        ["/influencer/messages", "influencer messages"],
        ["/influencer/verification", "influencer verification"],
      ]) {
        checkResults.push(
          await measureBrowserRouteTransition(client, sessionId, baseUrl, route, label),
        );
      }
      checkResults.push(
        await checkMobileVerificationAndProfileSurfaces(
          client,
          sessionId,
          baseUrl,
          outputDir,
        ),
      );
      checkResults.push(
        await checkInfluencerCampaignMobileScroll(client, sessionId, baseUrl),
      );
      checkResults.push(
        await checkInfluencerContractLoginContinuation(
          client,
          sessionId,
          baseUrl,
          outputDir,
        ),
      );
    } finally {
      if (targetId) {
        try {
          await client.send("Target.closeTarget", { targetId });
        } catch {
          // Closing the whole browser at the end is enough for a failed target.
        }
      }
    }
  } catch (error) {
    record(
      "Browser performance checks",
      "fail",
      `${
        error instanceof Error ? error.message : String(error)
      }${browserErrorOutput ? `; browser stderr: ${browserErrorOutput.slice(0, 240)}` : ""}`,
    );
    checkResults.push(false);
  } finally {
    client?.close();
    stopProcessTree(browserProcess.pid);
  }

  return checkResults.every(Boolean);
};

const stopProcessTree = (processId) => {
  if (!processId) return;

  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(processId), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(processId, "SIGTERM");
  } catch {
    // The process may have already exited.
  }
};

const cleanup = () => {
  if (serverProcess && !serverProcess.killed) {
    stopProcessTree(serverProcess.pid);
  }
};

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

const main = async () => {
  console.log("yeollock.me Standard QA");
  console.log(`root: ${root}`);

  const requiredChecks = [
    await runCommand("Kim Jaewoo guardrails", npmCommand, ["run", "guardrails:kim"]),
    await runCommand("npm test", npmCommand, ["test"]),
    await runCommand("npm run lint", npmCommand, ["run", "lint"]),
    await runCommand("npm run build", npmCommand, ["run", "build"]),
    await runCommand("npm audit --omit=dev", npmCommand, ["audit", "--omit=dev"]),
  ];

  requiredChecks.push(await checkSupabaseMigrations());

  try {
    const server = await ensureServer();

    record(
      "/api/health",
      "pass",
      `${server.health.storage ?? "unknown"} storage${server.temporary ? ", temporary server" : ""}`,
    );

    requiredChecks.push(
      await checkPrivateApiBoundary(server.baseUrl, "/api/marketplace/influencers"),
      await checkPublicApiCache(server.baseUrl, "/api/marketplace/brands"),
      await checkPublicApiCache(server.baseUrl, "/api/marketplace/campaigns"),
    );

    requiredChecks.push(
      await smokeRoute(server.baseUrl, "/api/contracts", [401]),
      await smokeRoute(server.baseUrl, "/api/admin/metrics", [401]),
      await smokeJsonRoute(server.baseUrl, "/api/influencer/dashboard", [200], {
        authenticated: false,
      }),
      await smokeRoute(server.baseUrl, "/api/marketplace/messages?role=advertiser", [401]),
      await smokeRoute(server.baseUrl, "/api/marketplace/messages?role=influencer", [401]),
      await smokeRoute(server.baseUrl, "/api/cron/sync-marketplace-followers", [401, 503]),
      await smokeMethodRoute(server.baseUrl, "POST", "/api/admin/logout", [200]),
      await smokeMethodRoute(server.baseUrl, "POST", "/api/advertiser/logout", [200]),
      await smokeMethodRoute(server.baseUrl, "POST", "/api/influencer/logout", [200]),
      await smokeMethodRoute(
        server.baseUrl,
        "POST",
        "/api/auth/password-reset/request",
        [422],
        { email: "not-an-email", role: "advertiser" },
      ),
      await smokeMethodRoute(
        server.baseUrl,
        "POST",
        "/api/auth/password-reset/complete",
        [401],
        { password: "abc12345" },
      ),
      await smokeMethodRoute(
        server.baseUrl,
        "POST",
        "/api/support/tickets",
        [422],
        { requester_email: "invalid", subject: "x", message: "short" },
      ),
      await smokeMethodRoute(
        server.baseUrl,
        "POST",
        "/api/contracts/nonexistent/signatures/influencer",
        [409],
        {},
      ),
      await smokeRoute(server.baseUrl, "/api/contracts/nonexistent/deliverables", [404]),
      await smokeMethodRoute(
        server.baseUrl,
        "POST",
        "/api/contracts/nonexistent/deliverables",
        [409],
        {},
      ),
      await smokeRoute(server.baseUrl, "/api/contracts/nonexistent/final-pdf", [404]),
      await smokeRoute(server.baseUrl, "/api/marketplace/influencers", [401]),
      await smokeRoute(server.baseUrl, "/api/marketplace/brands", [200]),
      await smokeRoute(server.baseUrl, "/api/marketplace/brands/breadroom-partner", [200]),
      await smokeRoute(server.baseUrl, "/api/marketplace/campaigns", [200]),
      await smokeRoute(server.baseUrl, "/api/advertiser/campaigns", [401]),
      await smokeRoute(server.baseUrl, "/favicon.ico", [200]),
      await smokeAppShellRoute(server.baseUrl, "/"),
      await smokeAppShellRoute(server.baseUrl, "/intro/advertiser"),
      await smokeAppShellRoute(server.baseUrl, "/intro/influencer"),
      await smokeAppShellRoute(server.baseUrl, "/signup/advertiser"),
      await smokeAppShellRoute(server.baseUrl, "/reset-password?role=advertiser"),
      await smokeAppShellRoute(server.baseUrl, "/login/advertiser"),
      await smokeAppShellRoute(server.baseUrl, "/login/influencer"),
      await smokeAppShellRoute(server.baseUrl, "/advertiser/dashboard"),
      await smokeAppShellRoute(server.baseUrl, "/advertiser/discover"),
      await smokeAppShellRoute(server.baseUrl, "/advertiser/campaigns"),
      await smokeAppShellRoute(server.baseUrl, "/advertiser/campaigns/new"),
      await smokeAppShellRoute(server.baseUrl, "/advertiser/messages"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/dashboard"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/brands"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/campaigns"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/messages"),
      await smokeAppShellRoute(server.baseUrl, "/brands/breadroom-partner"),
      await smokeAppShellRoute(server.baseUrl, "/contract/nonexistent"),
      await smokeRoute(server.baseUrl, "/privacy", [200]),
      await smokeRoute(server.baseUrl, "/terms", [200]),
      await smokeRoute(server.baseUrl, "/legal/e-sign-consent", [200]),
      await smokeRoute(server.baseUrl, "/support", [200]),
      await smokeAppShellRoute(server.baseUrl, "/resources"),
      await smokeAppShellRoute(server.baseUrl, "/resources/influencer-ad-contract"),
      await smokeAppShellRoute(server.baseUrl, "/resources/ppl-contract-checklist"),
      await smokeAppShellRoute(server.baseUrl, "/resources/collaboration-contract"),
      await smokeAppShellRoute(server.baseUrl, "/resources/group-buying-contract"),
      await smokeAppShellRoute(server.baseUrl, "/resources/instagram-sponsorship-contract"),
      await smokeAppShellRoute(server.baseUrl, "/resources/youtube-ppl-contract"),
    );
    requiredChecks.push(await checkBrowserRenderedRoutes(server.baseUrl));
    requiredChecks.push(await checkBrowserPerformance(server.baseUrl));
  } catch (error) {
    record("API/route smoke", "fail", error instanceof Error ? error.message : String(error));
    requiredChecks.push(false);
  }

  const failed = resultRows.filter((row) => row.status === "fail");
  const warnings = resultRows.filter((row) => row.status === "warn");

  console.log("\nSummary");
  console.log(`- passed: ${resultRows.filter((row) => row.status === "pass").length}`);
  console.log(`- warnings: ${warnings.length}`);
  console.log(`- failed: ${failed.length}`);
  if (warnings.length) {
    console.log(`- warning items: ${warnings.map((row) => row.name).join(", ")}`);
  }
  if (failed.length) {
    console.log(`- failed items: ${failed.map((row) => row.name).join(", ")}`);
  }

  process.exit(requiredChecks.every(Boolean) && failed.length === 0 ? 0 : 1);
};

await main();
