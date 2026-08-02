import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import {
  NAVER_BLOG_VISITOR_AVERAGE_DAYS,
  calculateNaverBlogVisitorAverage,
} from "../src/domain/naverBlogVisitors.js";
import {
  archiveNaverVisitorBatch,
  readPendingNaverVisitorBatch,
  stageNaverVisitorWorkbook,
} from "./lib/influencer-discovery-queue.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

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

const apply = args.get("apply") === "true";
const batchUpload = args.get("batch-upload") === "true";
const batchSize = Math.min(parsePositiveInt(args.get("batch-size"), 60), 500);
const configuredMaxRows = parseNonnegativeInt(args.get("max-rows"), batchSize);
const maxRows = !apply && configuredMaxRows === 0 ? batchSize : configuredMaxRows;
const concurrency = Math.min(parsePositiveInt(args.get("concurrency"), 6), 12);
const staleDays = parsePositiveNumber(args.get("stale-days"), 7);
const requestDelayMs = parseNonnegativeInt(args.get("request-delay-ms"), 120);
const requestTimeoutMs = Math.min(
  parsePositiveInt(args.get("request-timeout-ms"), 12_000),
  30_000,
);
const requestAttempts = Math.min(parsePositiveInt(args.get("request-attempts"), 3), 5);
const retryBackoffMs = Math.min(
  parsePositiveInt(args.get("retry-backoff-ms"), 600),
  5_000,
);

const tmpDir = path.join(cwd, ".tmp");
const logDir = path.join(cwd, "logs");
const lockPath = path.join(tmpDir, "naver-blog-visitor-sync.pid");
const uploaderLockPath = path.join(
  cwd,
  "data",
  "influencer-discovery-queue",
  "uploader.lock",
);
const uploaderTokenEnvName = "YEOLLOCK_INFLUENCER_UPLOADER_LOCK_TOKEN";
const uploaderPidEnvName = "YEOLLOCK_INFLUENCER_UPLOADER_PID";
let uploaderSessionValidated = false;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function acquireLock() {
  await fs.mkdir(tmpDir, { recursive: true });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let handle;
    try {
      handle = await fs.open(lockPath, "wx");
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2),
        "utf8",
      );
      await handle.sync();
      await handle.close();
      return { acquired: true, pid: process.pid };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (error?.code !== "EEXIST") throw error;

      let current;
      try {
        current = JSON.parse(await fs.readFile(lockPath, "utf8"));
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
        const stats = await fs.stat(lockPath).catch(() => null);
        if (stats && Date.now() - stats.mtimeMs < 60_000) {
          return { acquired: false, pid: null };
        }
      }
      if (isProcessAlive(Number(current?.pid))) {
        return { acquired: false, pid: Number(current.pid) };
      }
      await fs.rm(lockPath, { force: true }).catch((removeError) => {
        if (removeError?.code !== "ENOENT") throw removeError;
      });
    }
  }
  return { acquired: false, pid: null };
}

async function releaseLock() {
  try {
    const current = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (Number(current.pid) === process.pid) {
      await fs.rm(lockPath, { force: true });
    }
  } catch {
    // A stale lock is recovered by the next invocation.
  }
}

function readSupabaseConfig() {
  assertBatchDatabaseAccess();
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return { supabaseUrl, serviceKey };
}

function assertBatchDatabaseAccess() {
  if (!apply || !batchUpload || !uploaderSessionValidated) {
    throw new Error(
      "Supabase access requires a verified 12-hour uploader session.",
    );
  }
}

async function validateUploaderSession() {
  const expectedToken = String(process.env[uploaderTokenEnvName] ?? "");
  const expectedPid = Number.parseInt(String(process.env[uploaderPidEnvName] ?? ""), 10);
  if (!expectedToken || !Number.isInteger(expectedPid) || expectedPid <= 0) {
    throw new Error("The Naver visitor batch is missing its uploader session.");
  }

  let lock;
  try {
    lock = JSON.parse(await fs.readFile(uploaderLockPath, "utf8"));
  } catch (error) {
    throw new Error("The Naver visitor batch uploader lock is unavailable.", {
      cause: error,
    });
  }
  if (
    String(lock?.token ?? "") !== expectedToken ||
    Number(lock?.pid) !== expectedPid ||
    process.ppid !== expectedPid ||
    !isProcessAlive(expectedPid)
  ) {
    throw new Error("The Naver visitor batch uploader session is invalid or stale.");
  }
  uploaderSessionValidated = true;
}

async function fetchDueRows(limit) {
  const { supabaseUrl, serviceKey } = readSupabaseConfig();
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select:
      "id,platform_handle,profile_url,naver_blog_visitor_status,naver_blog_visitor_checked_at",
    platform: "eq.naver_blog",
    status: "eq.active",
    or: `(naver_blog_visitor_checked_at.is.null,naver_blog_visitor_checked_at.lt.${cutoff})`,
    order: "naver_blog_visitor_checked_at.asc.nullsfirst,id.asc",
    limit: String(limit),
  });
  const response = await fetch(
    `${supabaseUrl}/rest/v1/discovered_influencer_profiles?${params}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase Naver visitor queue read failed (${response.status}): ${(
        await response.text()
      ).slice(0, 300)}`,
    );
  }
  return response.json();
}

function extractNaverBlogId(row) {
  const handle = String(row.platform_handle ?? "")
    .trim()
    .replace(/^@/, "");
  if (/^[a-z0-9._-]{2,50}$/i.test(handle)) return handle;

  try {
    const url = new URL(String(row.profile_url ?? ""));
    const segments = url.pathname.split("/").filter(Boolean);
    const blogId = segments[0] ?? url.searchParams.get("blogId") ?? "";
    return /^[a-z0-9._-]{2,50}$/i.test(blogId) ? blogId : "";
  } catch {
    return "";
  }
}

async function fetchVisitorMetric(row) {
  const checkedAt = new Date().toISOString();
  const blogId = extractNaverBlogId(row);
  if (!blogId) {
    return {
      id: row.id,
      visitor_status: "unavailable",
      visitor_average_4d: null,
      visitor_counts: [],
      checked_at: checkedAt,
      error_message: "Naver Blog id is missing.",
    };
  }

  const url = new URL("https://blog.naver.com/NVisitorgp4Ajax.nhn");
  url.searchParams.set("blogId", blogId);
  let lastError = "Naver Blog visitor request failed.";

  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/xml,text/xml,*/*",
          "User-Agent": "YeollockNaverBlogVisitorSync/1.0",
        },
        signal: controller.signal,
      });

      if (response.status === 204) {
        return {
          id: row.id,
          visitor_status: "unavailable",
          visitor_average_4d: null,
          visitor_counts: [],
          checked_at: checkedAt,
          error_message: null,
        };
      }

      const body = await response.text();
      if (response.ok) {
        const metric = calculateNaverBlogVisitorAverage(body, new Date(checkedAt));
        if (!metric.available) {
          return {
            id: row.id,
            visitor_status: "unavailable",
            visitor_average_4d: null,
            visitor_counts: [],
            checked_at: checkedAt,
            error_message: null,
          };
        }

        return {
          id: row.id,
          visitor_status: "available",
          visitor_average_4d: metric.average,
          visitor_counts: metric.counts,
          checked_at: checkedAt,
          error_message: null,
        };
      }

      lastError = `Naver Blog visitor request failed (${response.status}).`;
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === requestAttempts) break;
    } catch (error) {
      lastError =
        error instanceof Error ? error.message.slice(0, 240) : "Naver Blog visitor request failed.";
      if (attempt === requestAttempts) break;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(retryBackoffMs * attempt);
  }

  return {
    id: row.id,
    visitor_status: "failed",
    visitor_average_4d: null,
    visitor_counts: [],
    checked_at: checkedAt,
    error_message: lastError,
  };
}

async function collectMetrics(rows) {
  const results = new Array(rows.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (cursor < rows.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fetchVisitorMetric(rows[index]);
        if (requestDelayMs > 0) await sleep(requestDelayMs);
      }
    }),
  );
  return results;
}

async function applyMetrics(updates) {
  assertBatchDatabaseAccess();
  if (updates.length === 0) return 0;
  const { supabaseUrl, serviceKey } = readSupabaseConfig();
  let updated = 0;
  for (let index = 0; index < updates.length; index += 100) {
    const chunk = updates.slice(index, index + 100);
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/apply_discovered_naver_blog_visitor_metrics_v2`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ p_updates: chunk }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Supabase Naver visitor update failed (${response.status}): ${(
          await response.text()
        ).slice(0, 300)}`,
      );
    }
    updated += Number(await response.json());
  }
  return updated;
}

async function uploadPendingMetrics() {
  const pending = await readPendingNaverVisitorBatch({ rootDir: cwd });
  if (pending.files.length === 0) {
    return {
      batchId: null,
      pendingFiles: 0,
      pendingRows: 0,
      updated: 0,
      archivePath: null,
    };
  }

  const updated = await applyMetrics(pending.rows);
  const completedAt = new Date().toISOString();
  const archive = await archiveNaverVisitorBatch({
    rootDir: cwd,
    batchId: pending.batchId,
    files: pending.files,
    rows: pending.rows,
    completedAt,
  });
  return {
    batchId: pending.batchId,
    pendingFiles: pending.files.length,
    pendingRows: pending.rows.length,
    updated,
    archivePath: archive.archivePath,
  };
}

async function appendSummary(summary) {
  await fs.mkdir(logDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  await fs.appendFile(
    path.join(logDir, `naver-blog-visitor-sync-${day}.jsonl`),
    `${JSON.stringify(summary)}\n`,
    "utf8",
  );
}

async function main() {
  if (!apply || !batchUpload) {
    if (apply && !batchUpload) {
      throw new Error(
        "Direct visitor-metric writes are disabled. Use --apply=true --batch-upload=true from the 12-hour uploader.",
      );
    }
    const summary = {
      ok: true,
      apply,
      batchUpload,
      skipped: "batch_upload_required",
      checkedAt: new Date().toISOString(),
    };
    await appendSummary(summary);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await validateUploaderSession();

  const lock = await acquireLock();
  if (!lock.acquired) {
    const summary = {
      ok: true,
      skipped: "already_running",
      runningPid: lock.pid,
      checkedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const startedAt = new Date().toISOString();
  const totals = {
    checked: 0,
    available: 0,
    unavailable: 0,
    failed: 0,
    staged: 0,
    retried: 0,
    updated: 0,
  };
  try {
    const retriedBatch = await uploadPendingMetrics();
    totals.retried += retriedBatch.pendingRows;
    totals.updated += retriedBatch.updated;

    while (maxRows === 0 || totals.checked < maxRows) {
      const remaining = maxRows === 0 ? batchSize : Math.min(batchSize, maxRows - totals.checked);
      if (remaining <= 0) break;
      const rows = await fetchDueRows(remaining);
      if (rows.length === 0) break;

      const updates = await collectMetrics(rows);
      totals.checked += updates.length;
      totals.available += updates.filter(
        (update) => update.visitor_status === "available",
      ).length;
      totals.unavailable += updates.filter(
        (update) => update.visitor_status === "unavailable",
      ).length;
      totals.failed += updates.filter((update) => update.visitor_status === "failed").length;
      const staged = await stageNaverVisitorWorkbook({
        rootDir: cwd,
        runId: `naver-visitor-${process.pid}-${Date.now()}-${totals.checked}`,
        createdAt: new Date().toISOString(),
        rows: updates,
      });
      totals.staged += staged.rowCount;
      const uploadedBatch = await uploadPendingMetrics();
      totals.updated += uploadedBatch.updated;

      if (rows.length < remaining) break;
    }

    const summary = {
      ok: true,
      apply,
      batchUpload,
      startedAt,
      finishedAt: new Date().toISOString(),
      averageWindowDays: NAVER_BLOG_VISITOR_AVERAGE_DAYS,
      staleDays,
      batchSize,
      maxRows,
      concurrency,
      requestTimeoutMs,
      requestAttempts,
      ...totals,
    };
    await appendSummary(summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await releaseLock();
  }
}

main().catch(async (error) => {
  const summary = {
    ok: false,
    at: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  await appendSummary(summary).catch(() => undefined);
  await releaseLock();
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
});
