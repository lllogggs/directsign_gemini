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
    return (
      marketplaceResponse.status === 200 &&
      (marketplaceResponse.headers.get("cache-control") ?? "").includes(
        "stale-while-revalidate=300",
      )
    );
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
  const defaultBaseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
  const existingHealth = await readHealth(defaultBaseUrl);
  if (existingHealth?.ok && (await supportsCurrentApiSurface(defaultBaseUrl))) {
    return { baseUrl: defaultBaseUrl, health: existingHealth, temporary: false };
  }

  if (existingHealth?.ok) {
    console.log(
      `Existing dev server at ${defaultBaseUrl} is healthy but does not expose the current QA API surface; starting a temporary server.`,
    );
  }

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

const measureGetRoute = async (baseUrl, route) => {
  const startedAt = performance.now();
  const response = await fetchWithTimeout(`${baseUrl}${route}`, {
    headers: { Accept: "application/json" },
    timeoutMs: 15000,
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
    const first = await measureGetRoute(baseUrl, route);
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
    requiredText: ["광고 계약은", "전자서명 증빙"],
    minTextLength: 80,
  },
  {
    name: "intro advertiser",
    path: "/intro/advertiser",
    requiredText: ["광고주", "계약 시작"],
    minTextLength: 80,
  },
  {
    name: "intro influencer",
    path: "/intro/influencer",
    requiredText: ["인플루언서", "계약 수신"],
    minTextLength: 80,
  },
  {
    name: "login",
    path: "/login",
    requiredText: ["광고주 로그인", "인플루언서 로그인"],
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
];

const browserRenderViewports = [
  { name: "desktop", width: 1365, height: 900, mobile: false },
  { name: "mobile", width: 375, height: 812, mobile: true },
];

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
      const hasRequiredText = route.requiredText.every((text) =>
        lastMetrics.bodyText?.includes(text),
      );
      const rendered =
        Number(lastMetrics.bodyTextLength ?? 0) >= route.minTextLength &&
        Number(lastMetrics.rootChildCount ?? 0) > 0 &&
        Number(lastMetrics.rootHeight ?? 0) >= Math.min(300, viewport.height * 0.6) &&
        !lastMetrics.hasViteError &&
        !lastMetrics.stillLoading &&
        hasRequiredText;

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
        const hasRequiredText = route.requiredText.every((text) =>
          result.metrics.bodyText?.includes(text),
        );
        const detail = result.ok
          ? `text ${textLength}, root ${rootHeight}px`
          : `text ${textLength}, root ${rootHeight}px, required ${
              hasRequiredText ? "yes" : "no"
            }, loading ${result.metrics.stillLoading ? "yes" : "no"}, sample "${
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

const readMarketplaceInfluencerHandle = async (baseUrl) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/marketplace/influencers`);
    if (!response.ok) {
      record(
        "Marketplace influencer handle",
        "fail",
        `status ${response.status}, expected 200`,
      );
      return null;
    }

    const data = await response.json();
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    const qaProfile =
      profiles.find((profile) => profile.handle === "creator-sora") ??
      profiles.find((profile) => profile.handle);

    if (!qaProfile?.handle) {
      record("Marketplace influencer handle", "fail", "no public handle returned");
      return null;
    }

    record("Marketplace influencer handle", "pass", qaProfile.handle);
    return qaProfile.handle;
  } catch (error) {
    record(
      "Marketplace influencer handle",
      "fail",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
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
    await runCommand("npm test", npmCommand, ["test"]),
    await runCommand("npm run lint", npmCommand, ["run", "lint"]),
    await runCommand("npm run build", npmCommand, ["run", "build"]),
    await runCommand("npm audit --omit=dev", npmCommand, ["audit", "--omit=dev"]),
  ];

  requiredChecks.push(await checkSupabaseMigrations());

  try {
    const server = await ensureServer();
    const influencerPublicHandle = await readMarketplaceInfluencerHandle(server.baseUrl);
    requiredChecks.push(Boolean(influencerPublicHandle));
    const influencerPublicPath = influencerPublicHandle
      ? `/${encodeURIComponent(influencerPublicHandle)}`
      : "/qa_influencer";

    record(
      "/api/health",
      "pass",
      `${server.health.storage ?? "unknown"} storage${server.temporary ? ", temporary server" : ""}`,
    );

    requiredChecks.push(
      await checkPublicApiCache(server.baseUrl, "/api/marketplace/influencers"),
      await checkPublicApiCache(server.baseUrl, "/api/marketplace/brands"),
      await checkPublicApiCache(server.baseUrl, "/api/marketplace/campaigns"),
    );

    requiredChecks.push(
      await smokeRoute(server.baseUrl, "/api/contracts", [401]),
      await smokeRoute(server.baseUrl, "/api/admin/metrics", [401]),
      await smokeRoute(server.baseUrl, "/api/influencer/dashboard", [401]),
      await smokeRoute(server.baseUrl, "/api/marketplace/messages?role=advertiser", [401]),
      await smokeRoute(server.baseUrl, "/api/marketplace/messages?role=influencer", [401]),
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
        [422],
        { password: "abc12345" },
      ),
      await smokeMethodRoute(
        server.baseUrl,
        "POST",
        "/api/contracts/nonexistent/signatures/influencer",
        [400],
        {},
      ),
      await smokeRoute(server.baseUrl, "/api/contracts/nonexistent/deliverables", [404]),
      await smokeMethodRoute(
        server.baseUrl,
        "POST",
        "/api/contracts/nonexistent/deliverables",
        [401, 503],
        {},
      ),
      await smokeRoute(server.baseUrl, "/api/contracts/nonexistent/final-pdf", [404]),
      await smokeRoute(server.baseUrl, "/api/marketplace/influencers", [200]),
      await smokeRoute(
        server.baseUrl,
        `/api/marketplace/influencers/${encodeURIComponent(influencerPublicHandle ?? "qa_influencer")}`,
        [200],
      ),
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
      await smokeAppShellRoute(server.baseUrl, "/advertiser/messages"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/dashboard"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/brands"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/campaigns"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/messages"),
      await smokeAppShellRoute(server.baseUrl, influencerPublicPath),
      await smokeAppShellRoute(server.baseUrl, "/brands/breadroom-partner"),
      await smokeAppShellRoute(server.baseUrl, "/contract/nonexistent"),
      await smokeRoute(server.baseUrl, "/privacy", [200]),
      await smokeRoute(server.baseUrl, "/terms", [200]),
      await smokeRoute(server.baseUrl, "/legal/e-sign-consent", [200]),
    );
    requiredChecks.push(await checkBrowserRenderedRoutes(server.baseUrl));
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
