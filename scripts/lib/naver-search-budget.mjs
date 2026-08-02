import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STATE_VERSION = 1;
const DEFAULT_DAILY_LIMIT = 25_000;
const DEFAULT_BUDGET_RATIO = 0.8;
const DEFAULT_STATE_PATH = path.join(
  process.cwd(),
  ".tmp",
  "naver-search-api-usage.json",
);
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MIN_MS = 15;
const LOCK_RETRY_JITTER_MS = 35;

function getKstDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function readPositiveNumber(value, fallback, { maximum } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    return undefined;
  }
  return parsed;
}

function normalizeEndpoint(endpoint) {
  const raw = String(endpoint ?? "unknown").trim();
  if (!raw) return "unknown";
  try {
    const parsed = new URL(raw);
    return parsed.pathname.slice(0, 160) || "unknown";
  } catch {
    return raw.split("?", 1)[0].slice(0, 160) || "unknown";
  }
}

function emptyEndpoints() {
  return Object.create(null);
}

function createEmptyState(dateKst) {
  return {
    version: STATE_VERSION,
    dateKst,
    used: 0,
    endpoints: emptyEndpoints(),
    updatedAt: null,
  };
}

function validateState(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.version !== STATE_VERSION ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(payload.dateKst) ||
    !Number.isSafeInteger(payload.used) ||
    payload.used < 0 ||
    !payload.endpoints ||
    typeof payload.endpoints !== "object" ||
    Array.isArray(payload.endpoints)
  ) {
    return undefined;
  }

  const endpoints = emptyEndpoints();
  let endpointTotal = 0;
  for (const [endpoint, count] of Object.entries(payload.endpoints)) {
    if (!Number.isSafeInteger(count) || count < 0) return undefined;
    endpoints[endpoint] = count;
    endpointTotal += count;
    if (!Number.isSafeInteger(endpointTotal)) return undefined;
  }
  if (endpointTotal !== payload.used) return undefined;

  return {
    version: STATE_VERSION,
    dateKst: payload.dateKst,
    used: payload.used,
    endpoints,
    updatedAt:
      typeof payload.updatedAt === "string" ? payload.updatedAt : null,
  };
}

function publicSnapshot(state, config, overrides = {}) {
  const used = Math.min(
    Number.isSafeInteger(state?.used) ? state.used : config.cap,
    Number.MAX_SAFE_INTEGER,
  );
  return {
    allowed: overrides.allowed ?? used < config.cap,
    reason: overrides.reason,
    dateKst: state?.dateKst ?? getKstDate(),
    dailyLimit: config.dailyLimit,
    budgetRatio: config.budgetRatio,
    cap: config.cap,
    used,
    remaining: Math.max(0, config.cap - used),
    endpoints: { ...(state?.endpoints ?? {}) },
    updatedAt: state?.updatedAt ?? null,
    ...overrides,
  };
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(
  lockPath,
  { lockTimeoutMs, staleLockMs },
) {
  const token = `${process.pid}:${randomUUID()}`;
  const startedAt = Date.now();

  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(
          `${JSON.stringify({ token, acquiredAt: new Date().toISOString() })}\n`,
          "utf8",
        );
      } finally {
        await handle.close();
      }
      return token;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > staleLockMs) {
          const stalePath = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
          try {
            await fs.rename(lockPath, stalePath);
            await fs.unlink(stalePath).catch(() => {});
            continue;
          } catch (staleError) {
            if (!["ENOENT", "EACCES", "EPERM"].includes(staleError?.code)) {
              throw staleError;
            }
          }
        }
      } catch (statError) {
        if (statError?.code === "ENOENT") continue;
        throw statError;
      }

      if (Date.now() - startedAt >= lockTimeoutMs) {
        const timeoutError = new Error("Naver Search usage ledger lock timed out");
        timeoutError.code = "NAVER_BUDGET_LOCK_TIMEOUT";
        throw timeoutError;
      }
      await delay(
        LOCK_RETRY_MIN_MS + Math.floor(Math.random() * LOCK_RETRY_JITTER_MS),
      );
    }
  }
}

async function releaseLock(lockPath, token) {
  try {
    const payload = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (payload?.token === token) await fs.unlink(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function readState(statePath, dateKst) {
  try {
    const payload = JSON.parse(await fs.readFile(statePath, "utf8"));
    const state = validateState(payload);
    if (!state) return { status: "corrupt" };
    if (state.dateKst !== dateKst) {
      return { status: "ok", state: createEmptyState(dateKst) };
    }
    return { status: "ok", state };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "ok", state: createEmptyState(dateKst) };
    }
    return { status: "corrupt" };
  }
}

async function writeState(statePath, state, config) {
  const persisted = {
    ...state,
    dailyLimit: config.dailyLimit,
    budgetRatio: config.budgetRatio,
    cap: config.cap,
    endpoints: { ...state.endpoints },
  };
  const tempPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(persisted, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tempPath, statePath);
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

export function createNaverSearchBudget(options = {}) {
  const statePath = options.statePath ?? DEFAULT_STATE_PATH;
  const dailyLimit = readPositiveNumber(
    options.dailyLimit ?? process.env.NAVER_SEARCH_DAILY_LIMIT,
    DEFAULT_DAILY_LIMIT,
  );
  const budgetRatio = readPositiveNumber(
    options.budgetRatio ?? process.env.NAVER_SEARCH_DAILY_BUDGET_RATIO,
    DEFAULT_BUDGET_RATIO,
    { maximum: 1 },
  );
  const configValid = dailyLimit !== undefined && budgetRatio !== undefined;
  const config = {
    dailyLimit: dailyLimit ?? 0,
    budgetRatio: budgetRatio ?? 0,
    cap: configValid ? Math.floor(dailyLimit * budgetRatio) : 0,
  };
  const lockPath = `${statePath}.lock`;
  const lockOptions = {
    lockTimeoutMs: options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
    staleLockMs: options.staleLockMs ?? DEFAULT_STALE_LOCK_MS,
  };

  async function withLockedState(operation) {
    if (!configValid || config.cap < 1) {
      return publicSnapshot(undefined, config, {
        allowed: false,
        reason: "invalid_config",
      });
    }

    await fs.mkdir(path.dirname(statePath), { recursive: true });
    let token;
    try {
      token = await acquireLock(lockPath, lockOptions);
      const dateKst = getKstDate(options.now?.() ?? new Date());
      const result = await readState(statePath, dateKst);
      if (result.status !== "ok") {
        return publicSnapshot(undefined, config, {
          allowed: false,
          reason: "corrupt_state",
          dateKst,
        });
      }
      return await operation(result.state);
    } catch {
      return publicSnapshot(undefined, config, {
        allowed: false,
        reason: "ledger_unavailable",
      });
    } finally {
      if (token) await releaseLock(lockPath, token).catch(() => {});
    }
  }

  return {
    async reserveRequest(endpoint) {
      const endpointKey = normalizeEndpoint(endpoint);
      return withLockedState(async (state) => {
        if (state.used >= config.cap) {
          return publicSnapshot(state, config, {
            allowed: false,
            reason: "budget_exhausted",
            endpoint: endpointKey,
            reserved: 0,
          });
        }

        state.used += 1;
        state.endpoints[endpointKey] =
          (state.endpoints[endpointKey] ?? 0) + 1;
        state.updatedAt = new Date().toISOString();
        await writeState(statePath, state, config);
        return publicSnapshot(state, config, {
          allowed: true,
          endpoint: endpointKey,
          reserved: 1,
        });
      });
    },

    async snapshot() {
      return withLockedState(async (state) => publicSnapshot(state, config));
    },

    async setMinimumUsed(minimumUsed, endpoint = "seeded") {
      const requestedMinimum = Number(minimumUsed);
      const endpointKey = normalizeEndpoint(endpoint);
      if (
        !Number.isSafeInteger(requestedMinimum) ||
        requestedMinimum < 0
      ) {
        return publicSnapshot(undefined, config, {
          allowed: false,
          reason: "invalid_minimum",
        });
      }

      return withLockedState(async (state) => {
        const increment = Math.max(0, requestedMinimum - state.used);
        if (increment > 0) {
          state.used += increment;
          state.endpoints[endpointKey] =
            (state.endpoints[endpointKey] ?? 0) + increment;
          state.updatedAt = new Date().toISOString();
          await writeState(statePath, state, config);
        }
        return publicSnapshot(state, config, {
          allowed: state.used < config.cap,
          endpoint: endpointKey,
          seeded: increment,
        });
      });
    },
  };
}

let sharedBudget;

function getSharedBudget() {
  sharedBudget ??= createNaverSearchBudget();
  return sharedBudget;
}

export async function reserveNaverSearchRequest(endpoint) {
  return getSharedBudget().reserveRequest(endpoint);
}

export async function getNaverSearchBudgetSnapshot() {
  return getSharedBudget().snapshot();
}

export async function setMinimumNaverSearchUsed(minimumUsed, endpoint) {
  return getSharedBudget().setMinimumUsed(minimumUsed, endpoint);
}
