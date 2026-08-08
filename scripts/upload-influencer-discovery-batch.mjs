import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  archiveInfluencerBatch,
  isInfluencerBatchDue,
  readPendingInfluencerBatch,
} from "./lib/influencer-discovery-queue.mjs";

const MINIMUM_UPLOAD_INTERVAL_HOURS = 12;
const DEFAULT_LOCK_STALE_HOURS = 24;
const QUEUE_RELATIVE_PATH = path.join("data", "influencer-discovery-queue");
const STATE_FILE_NAME = "state.json";
const LOCK_FILE_NAME = "uploader.lock";

function parseCliArgs(argv) {
  return new Map(
    argv
      .filter((argument) => argument.startsWith("--"))
      .map((argument) => {
        const [key, ...rest] = argument.slice(2).split("=");
        return [key, rest.length > 0 ? rest.join("=") : "true"];
      }),
  );
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`${label} must be a valid date.`);
  }
  return date;
}

function normalizeIntervalHours(value) {
  return Math.max(
    MINIMUM_UPLOAD_INTERVAL_HOURS,
    parsePositiveNumber(value, MINIMUM_UPLOAD_INTERVAL_HOURS),
  );
}

function uploaderPaths(rootDir = process.cwd()) {
  const projectRoot = path.resolve(rootDir);
  const queueRoot = path.join(projectRoot, QUEUE_RELATIVE_PATH);
  return {
    projectRoot,
    queueRoot,
    statePath: path.join(queueRoot, STATE_FILE_NAME),
    lockPath: path.join(queueRoot, LOCK_FILE_NAME),
  };
}

function stateSuccessfulUploadAt(state) {
  if (!state || typeof state !== "object") return null;
  for (const key of [
    "lastSuccessfulUploadAt",
    "lastSuccessAt",
    "lastCompletedAt",
    "completedAt",
    "lastUploadedAt",
    "lastUploadAt",
  ]) {
    if (state[key]) return normalizeDate(state[key], `state.${key}`);
  }
  return null;
}

/**
 * Returns the first time a pending snapshot may open a Supabase session.
 * A failed session also advances the access guard so a three-minute collector
 * loop cannot accidentally turn a failure into repeated database traffic.
 */
export function getInfluencerBatchDueAt({
  state,
  oldestPendingAt,
  intervalHours = MINIMUM_UPLOAD_INTERVAL_HOURS,
}) {
  if (!oldestPendingAt) return null;
  const interval = normalizeIntervalHours(intervalHours) * 60 * 60 * 1000;
  const oldest = normalizeDate(oldestPendingAt, "oldestPendingAt");
  const successfulAnchor = stateSuccessfulUploadAt(state) ?? oldest;
  let dueAt = successfulAnchor.getTime() + interval;

  if (state?.lastSupabaseAccessAt) {
    const accessGuard =
      normalizeDate(
        state.lastSupabaseAccessAt,
        "state.lastSupabaseAccessAt",
      ).getTime() + interval;
    dueAt = Math.max(dueAt, accessGuard);
  }

  return new Date(dueAt).toISOString();
}

export function dedupeInfluencerBatchRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array.");
  const latestById = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError("Every influencer batch row must be an object.");
    }
    const id = String(row.id ?? "").trim();
    if (!id) throw new TypeError("Every influencer batch row must have an id.");
    latestById.set(id, row);
  }
  return [...latestById.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row);
}

export async function readUploaderState({ rootDir } = {}) {
  const { statePath } = uploaderPaths(rootDir);
  try {
    const parsed = JSON.parse(await fs.readFile(statePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Invalid influencer batch uploader state: ${statePath}`);
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1 };
    throw error;
  }
}

async function writeUploaderState(state, { rootDir } = {}) {
  const { queueRoot, statePath } = uploaderPaths(rootDir);
  await fs.mkdir(queueRoot, { recursive: true });
  const partialPath = path.join(
    queueRoot,
    `.${STATE_FILE_NAME}.${process.pid}.${randomUUID()}.partial`,
  );
  let handle;
  try {
    handle = await fs.open(partialPath, "wx");
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(partialPath, statePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(partialPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return statePath;
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireUploaderLock({
  rootDir,
  now = new Date(),
  staleHours = DEFAULT_LOCK_STALE_HOURS,
} = {}) {
  const { queueRoot, lockPath } = uploaderPaths(rootDir);
  const startedAt = normalizeDate(now, "now").toISOString();
  const staleAfterMs =
    parsePositiveNumber(staleHours, DEFAULT_LOCK_STALE_HOURS) * 3_600_000;
  await fs.mkdir(queueRoot, { recursive: true });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = randomUUID();
    let handle;
    try {
      handle = await fs.open(lockPath, "wx");
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, token, startedAt }, null, 2)}\n`,
        "utf8",
      );
      await handle.sync();
      await handle.close();
      return { acquired: true, lockPath, pid: process.pid, token, startedAt };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (error?.code !== "EEXIST") throw error;

      let current = null;
      try {
        current = JSON.parse(await fs.readFile(lockPath, "utf8"));
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
      }

      const currentStartedAt = Number.isFinite(
        new Date(current?.startedAt).getTime(),
      )
        ? new Date(current.startedAt).getTime()
        : 0;
      const expired =
        currentStartedAt === 0 ||
        normalizeDate(now, "now").getTime() - currentStartedAt >= staleAfterMs;
      if (current && isProcessAlive(Number(current.pid)) && !expired) {
        return {
          acquired: false,
          lockPath,
          pid: Number(current.pid),
          startedAt: current.startedAt ?? null,
        };
      }
      await fs.rm(lockPath, { force: true }).catch((removeError) => {
        if (removeError?.code !== "ENOENT") throw removeError;
      });
    }
  }

  return { acquired: false, lockPath, pid: null, startedAt: null };
}

async function releaseUploaderLock(lock) {
  if (!lock?.acquired) return;
  try {
    const current = JSON.parse(await fs.readFile(lock.lockPath, "utf8"));
    if (current.token === lock.token && Number(current.pid) === process.pid) {
      await fs.rm(lock.lockPath, { force: true });
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function loadDiscoveryUploadFunctions() {
  const module = await import("./discover-korean-influencers.mjs");
  if (
    typeof module.reserveExistingHandles !== "function" ||
    typeof module.upsertSupabaseRows !== "function"
  ) {
    throw new Error("Influencer discovery upload functions are unavailable.");
  }
  return {
    reserveExistingHandles: module.reserveExistingHandles,
    upsertSupabaseRows: module.upsertSupabaseRows,
  };
}

function serializeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runInfluencerDiscoveryBatchUpload(
  {
    rootDir = process.cwd(),
    intervalHours = MINIMUM_UPLOAD_INTERVAL_HOURS,
    force = false,
    now = undefined,
  } = {},
  dependencies = {},
) {
  const projectRoot = path.resolve(rootDir);
  const checkedAt = normalizeDate(now ?? new Date(), "now").toISOString();
  const normalizedIntervalHours = normalizeIntervalHours(intervalHours);
  const acquireLock = dependencies.acquireUploaderLock ?? acquireUploaderLock;
  const releaseLock = dependencies.releaseUploaderLock ?? releaseUploaderLock;
  const readState = dependencies.readUploaderState ?? readUploaderState;
  const writeState = dependencies.writeUploaderState ?? writeUploaderState;
  const readBatch =
    dependencies.readPendingInfluencerBatch ?? readPendingInfluencerBatch;
  const archiveBatch =
    dependencies.archiveInfluencerBatch ?? archiveInfluencerBatch;
  const loadUploadFunctions =
    dependencies.loadDiscoveryUploadFunctions ?? loadDiscoveryUploadFunctions;

  const lock = await acquireLock({ rootDir: projectRoot, now: checkedAt });
  if (!lock.acquired) {
    return {
      ok: true,
      skipped: "already_running",
      checkedAt,
      runningPid: lock.pid,
    };
  }

  try {
    let state = await readState({ rootDir: projectRoot });
    const snapshot = await readBatch({ rootDir: projectRoot });
    if (!snapshot.files.length) {
      return {
        ok: true,
        skipped: "no_pending_workbooks",
        checkedAt,
        pendingFiles: 0,
        pendingRows: 0,
      };
    }

    const dueAt = getInfluencerBatchDueAt({
      state,
      oldestPendingAt: snapshot.oldestPendingAt,
      intervalHours: normalizedIntervalHours,
    });
    const baseDue = isInfluencerBatchDue({
      state,
      now: checkedAt,
      intervalHours: normalizedIntervalHours,
      oldestPendingAt: snapshot.oldestPendingAt,
    });
    const forced = force === true;
    const due =
      forced ||
      (baseDue && new Date(checkedAt).getTime() >= new Date(dueAt).getTime());
    if (!due) {
      return {
        ok: true,
        skipped: "not_due",
        checkedAt,
        dueAt,
        pendingFiles: snapshot.files.length,
        pendingRows: snapshot.rows.length,
        batchId: snapshot.batchId,
      };
    }

    const rows = dedupeInfluencerBatchRows(snapshot.rows);
    const attemptedAt = checkedAt;
    state = {
      ...state,
      version: 1,
      intervalHours: normalizedIntervalHours,
      lastAttemptAt: attemptedAt,
      lastSupabaseAccessAt: attemptedAt,
      lastAttemptedBatchId: snapshot.batchId,
      lastAttemptedFileCount: snapshot.files.length,
      lastAttemptedRowCount: rows.length,
      ...(forced ? { lastForcedUploadAt: attemptedAt } : {}),
      lastError: null,
    };
    await writeState(state, { rootDir: projectRoot });

    let changedRows;
    let uploadedRows;
    let archive;
    try {
      const { reserveExistingHandles, upsertSupabaseRows } =
        await loadUploadFunctions();
      const uploaderSession = {
        token: lock.token,
        pid: lock.pid,
        authorizedAt: attemptedAt,
        batchId: snapshot.batchId,
        rootDir: projectRoot,
      };
      changedRows = dedupeInfluencerBatchRows(
        await reserveExistingHandles(rows, {
          onlyChanged: true,
          uploaderSession,
        }),
      );
      uploadedRows = await upsertSupabaseRows(changedRows, { uploaderSession });
      if (uploadedRows !== changedRows.length) {
        throw new Error(
          `Influencer batch upload count mismatch (${uploadedRows}/${changedRows.length}).`,
        );
      }

      const completedAt = normalizeDate(
        now ?? new Date(),
        "completedAt",
      ).toISOString();
      state = {
        ...state,
        lastSuccessfulUploadAt: completedAt,
        lastSuccessfulBatchId: snapshot.batchId,
        lastSuccessfulFileCount: snapshot.files.length,
        lastSuccessfulRowCount: rows.length,
        lastChangedRowCount: changedRows.length,
        lastUploadedRowCount: uploadedRows,
        lastError: null,
      };
      // Persist the confirmed Supabase cadence before mutating the local queue.
      await writeState(state, { rootDir: projectRoot });

      archive = await archiveBatch({
        rootDir: projectRoot,
        batchId: snapshot.batchId,
        files: snapshot.files,
        rows,
        completedAt,
      });
      state = {
        ...state,
        lastArchivedAt: completedAt,
        lastArchivePath: archive.archivePath ?? archive.path ?? null,
      };
      await writeState(state, { rootDir: projectRoot });
    } catch (error) {
      const failedAt = normalizeDate(
        now ?? new Date(),
        "failedAt",
      ).toISOString();
      const failureState = {
        ...state,
        lastFailedAt: failedAt,
        lastFailedBatchId: snapshot.batchId,
        lastError: serializeError(error),
      };
      await writeState(failureState, { rootDir: projectRoot }).catch(
        () => undefined,
      );
      throw error;
    }

    return {
      ok: true,
      checkedAt,
      dueAt,
      forced,
      intervalHours: normalizedIntervalHours,
      profile: {
        ok: true,
        batchId: snapshot.batchId,
        pendingFiles: snapshot.files.length,
        stagedRows: rows.length,
        changedRows: changedRows.length,
        uploadedRows,
        archivePath: archive.archivePath ?? archive.path ?? null,
      },
    };
  } finally {
    await releaseLock(lock).catch(() => undefined);
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const summary = await runInfluencerDiscoveryBatchUpload({
    rootDir: args.get("root-dir") ?? process.cwd(),
    intervalHours: args.get("interval-hours"),
    force: args.get("force") === "true",
  });
  console.log(JSON.stringify(summary, null, 2));
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          at: new Date().toISOString(),
          error: serializeError(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
