import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const cwd = process.cwd();
const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length > 0 ? rest.join("=") : "true"];
    }),
);

const defaultCategories = [
  "beauty",
  "living",
  "fashion",
  "food",
  "travel",
  "parenting",
  "pet",
  "fitness",
  "game",
  "tech",
];

const categories = String(args.get("categories") ?? defaultCategories.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const intervalMinutes = parsePositiveNumber(args.get("interval-minutes"), 30);
const maxRuns = parseNonnegativeInt(args.get("max-runs"), 0);
const runTimeoutMinutes = parsePositiveNumber(args.get("run-timeout-minutes"), 30);
const apply = args.get("apply") !== "false";
const youtubePerQuery = parsePositiveInt(args.get("youtube-per-query"), 8);
const youtubePages = parsePositiveInt(args.get("youtube-pages"), 1);
const naverPerQuery = parsePositiveInt(args.get("naver-per-query"), 80);
const naverPages = parsePositiveInt(args.get("naver-pages"), 4);
const includeYoutube = args.get("youtube") !== "false";
const includeNaver = args.get("naver") !== "false";
const includeInstagram = args.get("instagram") !== "false";
const minFollowers = args.get("min-followers");
const maxFollowers = args.get("max-followers");

const tmpDir = path.join(cwd, ".tmp");
const logDir = path.join(cwd, "logs");
const lockPath = path.join(tmpDir, "influencer-discovery-loop.pid");
const statePath = path.join(tmpDir, "influencer-discovery-loop-state.json");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonnegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function todayLogPath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logDir, `influencer-discovery-loop-${day}.jsonl`);
}

async function appendLog(event) {
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(todayLogPath(), `${JSON.stringify(event)}\n`, "utf8");
}

function isProcessAlive(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function assertSingleInstance() {
  await fs.mkdir(tmpDir, { recursive: true });
  try {
    const current = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (isProcessAlive(Number(current.pid))) {
      throw new Error(
        `Influencer discovery loop is already running. pid=${current.pid}`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !String(error?.message ?? "").includes("already running")) {
      await appendLog({
        type: "lock_recovered",
        at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (String(error?.message ?? "").includes("already running")) throw error;
  }

  await fs.writeFile(
    lockPath,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

async function clearLock() {
  try {
    const current = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (Number(current.pid) === process.pid) {
      await fs.rm(lockPath, { force: true });
    }
  } catch {
    // The lock is best-effort; stale locks are recovered on the next run.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonSummary(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return null;
  const summaryStart = Math.max(
    text.lastIndexOf('{\n  "ok"'),
    text.lastIndexOf('{"ok"'),
  );
  const firstBrace = summaryStart >= 0 ? summaryStart : text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function runDiscovery(category) {
  const childArgs = [
    "scripts/discover-korean-influencers.mjs",
    `--categories=${category}`,
    `--apply=${apply ? "true" : "false"}`,
    `--youtube=${includeYoutube ? "true" : "false"}`,
    `--naver=${includeNaver ? "true" : "false"}`,
    `--instagram=${includeInstagram ? "true" : "false"}`,
    `--youtube-per-query=${youtubePerQuery}`,
    `--youtube-pages=${youtubePages}`,
    `--naver-per-query=${naverPerQuery}`,
    `--naver-pages=${naverPages}`,
  ];
  if (minFollowers) childArgs.push(`--min-followers=${minFollowers}`);
  if (maxFollowers) childArgs.push(`--max-followers=${maxFollowers}`);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, childArgs, {
      cwd,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, runTimeoutMinutes * 60 * 1000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        timedOut,
        durationMs: Date.now() - startedAt,
        summary: extractJsonSummary(stdout),
        stdoutTail: stdout.slice(-2000),
        stderrTail: stderr.slice(-2000),
      });
    });
  });
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8"));
  } catch {
    return { runCount: 0, categoryIndex: 0 };
  }
}

async function writeState(state) {
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function main() {
  if (categories.length === 0) {
    throw new Error("No categories configured for influencer discovery loop.");
  }

  await assertSingleInstance();
  await appendLog({
    type: "loop_started",
    at: new Date().toISOString(),
    pid: process.pid,
    categories,
    intervalMinutes,
    maxRuns,
    apply,
    youtubePerQuery,
    youtubePages,
    naverPerQuery,
    naverPages,
  });

  const state = await readState();
  let localRuns = 0;

  try {
    while (maxRuns === 0 || localRuns < maxRuns) {
      const category = categories[state.categoryIndex % categories.length];
      const startedAt = new Date().toISOString();
      await appendLog({ type: "run_started", at: startedAt, category });

      const result = await runDiscovery(category);
      const finishedAt = new Date().toISOString();
      await appendLog({
        type: result.ok ? "run_finished" : "run_failed",
        at: finishedAt,
        category,
        ...result,
      });

      state.runCount = Number(state.runCount ?? 0) + 1;
      state.categoryIndex = (Number(state.categoryIndex ?? 0) + 1) % categories.length;
      state.lastRunAt = finishedAt;
      state.lastCategory = category;
      state.lastOk = result.ok;
      state.lastSummary = result.summary;
      await writeState(state);

      localRuns += 1;
      if (maxRuns !== 0 && localRuns >= maxRuns) break;
      await sleep(intervalMinutes * 60 * 1000);
    }
  } finally {
    await appendLog({
      type: "loop_stopped",
      at: new Date().toISOString(),
      pid: process.pid,
      localRuns,
    });
    await clearLock();
  }
}

main().catch(async (error) => {
  await appendLog({
    type: "loop_error",
    at: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
