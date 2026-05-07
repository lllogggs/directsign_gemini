import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
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
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const readHealth = async (baseUrl) => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/health`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

const startTemporaryServer = async () => {
  const baseUrl = `http://127.0.0.1:${qaPort}`;
  serverProcess = spawn(npmCommand, ["run", "dev"], {
    cwd: root,
    env: { ...process.env, PORT: String(qaPort), NO_COLOR: "1" },
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
  if (existingHealth?.ok) {
    return { baseUrl: defaultBaseUrl, health: existingHealth, temporary: false };
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
    record("Supabase linked migrations", "fail", `exit ${result.status}`);
    return false;
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

const cleanup = () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
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
    record(
      "/api/health",
      "pass",
      `${server.health.storage ?? "unknown"} storage${server.temporary ? ", temporary server" : ""}`,
    );

    requiredChecks.push(
      await smokeRoute(server.baseUrl, "/api/contracts", [401]),
      await smokeRoute(server.baseUrl, "/api/admin/metrics", [401]),
      await smokeRoute(server.baseUrl, "/api/influencer/dashboard", [401]),
      await smokeMethodRoute(server.baseUrl, "POST", "/api/admin/logout", [200]),
      await smokeMethodRoute(server.baseUrl, "POST", "/api/advertiser/logout", [200]),
      await smokeMethodRoute(server.baseUrl, "POST", "/api/influencer/logout", [200]),
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
      await smokeAppShellRoute(server.baseUrl, "/"),
      await smokeAppShellRoute(server.baseUrl, "/signup/advertiser"),
      await smokeAppShellRoute(server.baseUrl, "/login/advertiser"),
      await smokeAppShellRoute(server.baseUrl, "/login/influencer"),
      await smokeAppShellRoute(server.baseUrl, "/advertiser/dashboard"),
      await smokeAppShellRoute(server.baseUrl, "/influencer/dashboard"),
      await smokeAppShellRoute(server.baseUrl, "/contract/nonexistent"),
      await smokeRoute(server.baseUrl, "/privacy", [200]),
      await smokeRoute(server.baseUrl, "/terms", [200]),
      await smokeRoute(server.baseUrl, "/legal/e-sign-consent", [200]),
    );
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
