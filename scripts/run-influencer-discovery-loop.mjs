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

const intervalMinutes = parsePositiveNumber(args.get("interval-minutes"), 5);
const maxRuns = parseNonnegativeInt(args.get("max-runs"), 0);
const runTimeoutMinutes = parsePositiveNumber(args.get("run-timeout-minutes"), 30);
const apply = args.get("apply") !== "false";
const youtubePerQuery = parsePositiveInt(args.get("youtube-per-query"), 8);
const youtubePages = parsePositiveInt(args.get("youtube-pages"), 1);
const youtubeCheckMinutes = parsePositiveNumber(args.get("youtube-check-minutes"), 180);
const naverPerQuery = parsePositiveInt(args.get("naver-per-query"), 80);
const naverPages = parsePositiveInt(args.get("naver-pages"), 4);
const includeYoutube = args.get("youtube") !== "false";
const includeNaver = args.get("naver") !== "false";
const includeInstagram = args.get("instagram") !== "false";
const includeTikTok = args.get("tiktok") !== "false";
const minFollowers = args.get("min-followers");
const maxFollowers = args.get("max-followers");
const tiktokPerQuery = parsePositiveInt(args.get("tiktok-per-query"), 30);
const tiktokPages = parsePositiveInt(args.get("tiktok-pages"), 1);
const requestedPlatforms = String(args.get("platforms") ?? "youtube,naver_blog,instagram,tiktok")
  .split(",")
  .map(normalizePlatformId)
  .filter(Boolean);

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

function normalizePlatformId(value) {
  const platform = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (platform === "naver" || platform === "blog") return "naver_blog";
  if (platform === "ig") return "instagram";
  if (platform === "tt") return "tiktok";
  return ["youtube", "naver_blog", "instagram", "tiktok"].includes(platform)
    ? platform
    : "";
}

function buildPlatformPlan() {
  const definitions = {
    youtube: {
      id: "youtube",
      enabled: includeYoutube,
      outputPlatforms: "youtube",
      flags: { youtube: true, naver: false, instagram: false, tiktok: false },
    },
    naver_blog: {
      id: "naver_blog",
      enabled: includeNaver,
      outputPlatforms: "naver_blog",
      flags: { youtube: false, naver: true, instagram: false, tiktok: false },
    },
    instagram: {
      id: "instagram",
      enabled: includeInstagram,
      outputPlatforms: "instagram",
      flags: {
        youtube: false,
        naver: includeNaver,
        instagram: true,
        tiktok: false,
      },
    },
    tiktok: {
      id: "tiktok",
      enabled: includeTikTok,
      outputPlatforms: "tiktok",
      flags: { youtube: false, naver: false, instagram: false, tiktok: true },
    },
  };
  const seen = new Set();
  return requestedPlatforms
    .filter((platform) => {
      if (seen.has(platform)) return false;
      seen.add(platform);
      return definitions[platform]?.enabled;
    })
    .map((platform) => definitions[platform]);
}

const platformPlan = buildPlatformPlan();

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

function shouldSkipPlatformCheck(state, platformJob, nowMs) {
  if (platformJob.id !== "youtube") return null;
  const cooldownUntil = state.platformCooldownUntil?.[platformJob.id] ?? null;
  const cooldownUntilMs = Date.parse(String(cooldownUntil ?? ""));
  if (!Number.isFinite(cooldownUntilMs) || cooldownUntilMs <= nowMs) return null;
  return {
    cooldownUntil,
    waitMinutes: Math.ceil((cooldownUntilMs - nowMs) / 60_000),
  };
}

function isPlatformUsageLimitResult(result) {
  const text = `${result?.stderrTail ?? ""}\n${result?.stdoutTail ?? ""}`.toLowerCase();
  return (
    text.includes("quota exceeded") ||
    text.includes("ratelimitexceeded") ||
    text.includes("rate limit") ||
    text.includes("dailylimitexceeded") ||
    text.includes("userratelimitexceeded") ||
    /(?:^|\D)429(?:\D|$)/.test(text)
  );
}

function updatePlatformLimitState(state, platformJob, result, checkedAt) {
  if (platformJob.id !== "youtube") return null;
  state.platformCooldownUntil = { ...(state.platformCooldownUntil ?? {}) };
  if (!result.ok && isPlatformUsageLimitResult(result)) {
    const cooldownUntil = new Date(
      Date.parse(checkedAt) + youtubeCheckMinutes * 60_000,
    ).toISOString();
    state.platformCooldownUntil[platformJob.id] = cooldownUntil;
    return { platformLimitedUntil: cooldownUntil };
  }
  delete state.platformCooldownUntil[platformJob.id];
  return { platformLimitedUntil: null };
}

function advanceStateAfterPlatform(state, categoryIndex, platformIndex, result) {
  state.runCount = Number(state.runCount ?? 0) + 1;
  state.platformIndex = (platformIndex + 1) % platformPlan.length;
  state.categoryIndex = state.platformIndex === 0
    ? (categoryIndex + 1) % categories.length
    : categoryIndex;
  Object.assign(state, result);
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

function runDiscovery(category, platformJob) {
  const childArgs = [
    "scripts/discover-korean-influencers.mjs",
    `--categories=${category}`,
    `--apply=${apply ? "true" : "false"}`,
    `--youtube=${platformJob.flags.youtube ? "true" : "false"}`,
    `--naver=${platformJob.flags.naver ? "true" : "false"}`,
    `--instagram=${platformJob.flags.instagram ? "true" : "false"}`,
    `--tiktok=${platformJob.flags.tiktok ? "true" : "false"}`,
    `--output-platforms=${platformJob.outputPlatforms}`,
    `--youtube-per-query=${youtubePerQuery}`,
    `--youtube-pages=${youtubePages}`,
    `--naver-per-query=${naverPerQuery}`,
    `--naver-pages=${naverPages}`,
    `--tiktok-per-query=${tiktokPerQuery}`,
    `--tiktok-pages=${tiktokPages}`,
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
  if (platformPlan.length === 0) {
    throw new Error("No platforms configured for influencer discovery loop.");
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
    includeYoutube,
    includeNaver,
    includeInstagram,
    includeTikTok,
    platforms: platformPlan.map((platform) => platform.id),
    platformCycleMinutes: intervalMinutes * platformPlan.length,
    youtubeCheckMinutes,
    youtubePerQuery,
    youtubePages,
    naverPerQuery,
    naverPages,
    tiktokPerQuery,
    tiktokPages,
  });

  const state = await readState();
  let localRuns = 0;

  try {
    while (maxRuns === 0 || localRuns < maxRuns) {
      const categoryIndex = Number(state.categoryIndex ?? 0) % categories.length;
      const platformIndex = Number(state.platformIndex ?? 0) % platformPlan.length;
      const category = categories[categoryIndex];
      const platformJob = platformPlan[platformIndex];
      const startedAt = new Date().toISOString();
      const skip = shouldSkipPlatformCheck(state, platformJob, Date.now());
      if (skip) {
        const finishedAt = new Date().toISOString();
        await appendLog({
          type: "run_skipped",
          at: finishedAt,
          category,
          platform: platformJob.id,
          reason: "platform_usage_limit_cooldown",
          ...skip,
        });
        advanceStateAfterPlatform(state, categoryIndex, platformIndex, {
          lastSkipAt: finishedAt,
          lastSkippedCategory: category,
          lastSkippedPlatform: platformJob.id,
          lastSkippedReason: "platform_usage_limit_cooldown",
          lastSkippedNextCheckAt: skip.cooldownUntil,
        });
        await writeState(state);
        localRuns += 1;
        if (maxRuns !== 0 && localRuns >= maxRuns) break;
        await sleep(intervalMinutes * 60 * 1000);
        continue;
      }

      state.platformLastCheckedAt = {
        ...(state.platformLastCheckedAt ?? {}),
        [platformJob.id]: startedAt,
      };
      await writeState(state);

      await appendLog({
        type: "run_started",
        at: startedAt,
        category,
        platform: platformJob.id,
      });

      const result = await runDiscovery(category, platformJob);
      const finishedAt = new Date().toISOString();
      const platformLimitState = updatePlatformLimitState(
        state,
        platformJob,
        result,
        startedAt,
      );
      await appendLog({
        type: result.ok ? "run_finished" : "run_failed",
        at: finishedAt,
        category,
        platform: platformJob.id,
        ...platformLimitState,
        ...result,
      });

      advanceStateAfterPlatform(state, categoryIndex, platformIndex, {
        lastRunAt: finishedAt,
        lastCategory: category,
        lastPlatform: platformJob.id,
        lastOk: result.ok,
        lastSummary: result.summary,
        ...(platformLimitState ?? {}),
      });
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
