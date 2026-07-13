import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../domain/api";
import {
  isFastLoginTransitionPending,
  waitForFastLoginTransition,
  type FastLoginRole,
} from "../domain/fastLoginTransition";
import { getAdvertiserSessionCache } from "../domain/advertiserSessionCache";
import { translateApiErrorMessage } from "../domain/userMessages";
import type { VerificationSummary } from "../domain/verification";

type VerificationSummaryOptions = {
  role?: "advertiser" | "influencer";
  enabled?: boolean;
};

type VerificationSummaryResponse = {
  summary: VerificationSummary;
  statusCode: number;
};

type VerificationSummaryCacheEntry = VerificationSummaryResponse & {
  accountKey?: string;
  cachedAt: number;
  targetKey: string;
};

type VerificationSummaryInflightEntry = {
  accountKey?: string;
  generation: number;
  promise: Promise<VerificationSummaryCacheEntry | undefined>;
};

type VerificationAccountContext = {
  key?: string;
  email?: string;
};

const VERIFICATION_SUMMARY_CACHE_MS = 15 * 1000;
const verificationSummaryCache = new Map<
  string,
  VerificationSummaryCacheEntry
>();
const verificationSummaryInflight = new Map<
  string,
  VerificationSummaryInflightEntry
>();
const verificationSummaryAccountKeys = new Map<string, string>();
const verificationSummaryGenerations = new Map<string, number>();

const buildVerificationStatusUrl = (role?: VerificationSummaryOptions["role"]) => {
  const query = new URLSearchParams();
  if (role) query.set("role", role);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/api/verification/status${suffix}`;
};

const getVerificationCacheKey = (role?: VerificationSummaryOptions["role"]) =>
  role ?? "all";

const normalizeAccountKey = (accountKey?: string) => {
  const normalized = accountKey?.trim();
  return normalized ? `account:${normalized}` : undefined;
};

const normalizeEmail = (email?: string) => email?.trim().toLowerCase();

const getVerificationAccountContext = (
  role?: VerificationSummaryOptions["role"],
  accountKey?: string,
): VerificationAccountContext => {
  if (role === "advertiser") {
    const user = getAdvertiserSessionCache()?.user;
    const runtimeKey = normalizeAccountKey(user?.id);
    if (runtimeKey) {
      return { key: runtimeKey, email: normalizeEmail(user?.email) };
    }
  }

  return { key: normalizeAccountKey(accountKey) };
};

const getVerificationTargetKey = (
  role: VerificationSummaryOptions["role"] | undefined,
  summary: VerificationSummary,
) => {
  if (role === "advertiser") return summary.advertiser.target_id;
  if (role === "influencer") return summary.influencer.target_id;
  return `${summary.advertiser.target_id}:${summary.influencer.target_id}`;
};

const getVerificationSummaryEmail = (
  role: VerificationSummaryOptions["role"] | undefined,
  summary: VerificationSummary,
) =>
  role === "advertiser"
    ? normalizeEmail(summary.advertiser.account?.email)
    : role === "influencer"
      ? normalizeEmail(summary.influencer.account?.email)
      : undefined;

const getVerificationGeneration = (cacheKey: string) =>
  verificationSummaryGenerations.get(cacheKey) ?? 0;

const invalidateVerificationCacheKey = (cacheKey: string) => {
  verificationSummaryCache.delete(cacheKey);
  verificationSummaryInflight.delete(cacheKey);
  verificationSummaryGenerations.set(
    cacheKey,
    getVerificationGeneration(cacheKey) + 1,
  );
};

const syncVerificationAccountKey = (
  role?: VerificationSummaryOptions["role"],
  accountKey?: string,
) => {
  const cacheKey = getVerificationCacheKey(role);
  const resolvedAccountKey = getVerificationAccountContext(role, accountKey).key;
  const previousAccountKey = verificationSummaryAccountKeys.get(cacheKey);

  if (!resolvedAccountKey) return previousAccountKey;
  if (previousAccountKey && previousAccountKey !== resolvedAccountKey) {
    invalidateVerificationCacheKey(cacheKey);
  } else {
    const cached = verificationSummaryCache.get(cacheKey);
    if (cached?.accountKey && cached.accountKey !== resolvedAccountKey) {
      invalidateVerificationCacheKey(cacheKey);
    }
  }

  verificationSummaryAccountKeys.set(cacheKey, resolvedAccountKey);
  return resolvedAccountKey;
};

const getFastLoginRole = (
  role?: VerificationSummaryOptions["role"],
): FastLoginRole | undefined =>
  role === "advertiser" || role === "influencer" ? role : undefined;

export function primeVerificationSummary(
  role: VerificationSummaryOptions["role"] | undefined,
  summary: VerificationSummary,
  statusCode = 200,
  accountKey?: string,
) {
  const cacheKey = getVerificationCacheKey(role);
  const accountContext = getVerificationAccountContext(role, accountKey);
  const summaryEmail = getVerificationSummaryEmail(role, summary);
  if (
    accountContext.email &&
    summaryEmail &&
    accountContext.email !== summaryEmail
  ) {
    return undefined;
  }

  const targetKey = getVerificationTargetKey(role, summary);
  let resolvedAccountKey: string;
  if (accountContext.key) {
    resolvedAccountKey =
      syncVerificationAccountKey(role, accountKey) ?? accountContext.key;
  } else {
    resolvedAccountKey = `target:${targetKey}`;
    const previousAccountKey = verificationSummaryAccountKeys.get(cacheKey);
    if (previousAccountKey && previousAccountKey !== resolvedAccountKey) {
      invalidateVerificationCacheKey(cacheKey);
    }
    verificationSummaryAccountKeys.set(cacheKey, resolvedAccountKey);
  }

  const entry = {
    summary,
    statusCode,
    accountKey: resolvedAccountKey,
    cachedAt: Date.now(),
    targetKey,
  } satisfies VerificationSummaryCacheEntry;
  verificationSummaryCache.set(cacheKey, entry);
  return entry;
}

export function getCachedVerificationSummary(
  role?: VerificationSummaryOptions["role"],
  accountKey?: string,
) {
  const cacheKey = getVerificationCacheKey(role);
  const resolvedAccountKey = syncVerificationAccountKey(role, accountKey);
  const cached = verificationSummaryCache.get(cacheKey);
  if (!cached) return undefined;

  if (Date.now() - cached.cachedAt > VERIFICATION_SUMMARY_CACHE_MS) {
    invalidateVerificationCacheKey(cacheKey);
    return undefined;
  }
  if (resolvedAccountKey && cached.accountKey !== resolvedAccountKey) {
    invalidateVerificationCacheKey(cacheKey);
    return undefined;
  }

  const accountEmail = getVerificationAccountContext(role, accountKey).email;
  const summaryEmail = getVerificationSummaryEmail(role, cached.summary);
  if (accountEmail && summaryEmail && accountEmail !== summaryEmail) {
    invalidateVerificationCacheKey(cacheKey);
    return undefined;
  }

  return cached;
}

export function clearVerificationSummaryCache(
  role?: VerificationSummaryOptions["role"],
) {
  if (role) {
    const cacheKey = getVerificationCacheKey(role);
    invalidateVerificationCacheKey(cacheKey);
    verificationSummaryAccountKeys.delete(cacheKey);
    return;
  }

  const cacheKeys = new Set([
    "all",
    "advertiser",
    "influencer",
    ...verificationSummaryCache.keys(),
    ...verificationSummaryInflight.keys(),
    ...verificationSummaryAccountKeys.keys(),
  ]);
  cacheKeys.forEach(invalidateVerificationCacheKey);
  verificationSummaryAccountKeys.clear();
}

async function fetchVerificationSummary(
  role?: VerificationSummaryOptions["role"],
  accountKey?: string,
) {
  const cacheKey = getVerificationCacheKey(role);
  const requestAccountContext = getVerificationAccountContext(role, accountKey);
  const resolvedAccountKey = syncVerificationAccountKey(role, accountKey);
  const generation = getVerificationGeneration(cacheKey);
  const existingRequest = verificationSummaryInflight.get(cacheKey);
  if (
    existingRequest &&
    existingRequest.generation === generation &&
    existingRequest.accountKey === resolvedAccountKey
  ) {
    return existingRequest.promise;
  }

  const request = (async () => {
    const response = await apiFetch(buildVerificationStatusUrl(role), {
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      invalidateVerificationCacheKey(cacheKey);
      throw new Error(`인증 상태 API 오류 (${response.status})`);
    }

    const summary = (await response.json()) as VerificationSummary;
    const currentAccountContext = getVerificationAccountContext(role);
    if (
      requestAccountContext.key &&
      currentAccountContext.key &&
      requestAccountContext.key !== currentAccountContext.key
    ) {
      syncVerificationAccountKey(role);
      return undefined;
    }
    if (generation !== getVerificationGeneration(cacheKey)) return undefined;

    return primeVerificationSummary(
      role,
      summary,
      response.status,
      accountKey,
    );
  })();
  verificationSummaryInflight.set(cacheKey, {
    accountKey: resolvedAccountKey,
    generation,
    promise: request,
  });

  try {
    return await request;
  } finally {
    if (verificationSummaryInflight.get(cacheKey)?.promise === request) {
      verificationSummaryInflight.delete(cacheKey);
    }
  }
}

export async function preloadVerificationSummary(
  role?: VerificationSummaryOptions["role"],
  accountKey?: string,
) {
  const cached = getCachedVerificationSummary(role, accountKey);
  if (cached) return cached;
  return fetchVerificationSummary(role, accountKey).catch(() => undefined);
}

const getVerificationSummaryErrorMessage = (message?: string) => {
  if (!message) return "인증 상태를 불러오지 못했습니다.";
  if (message.includes("401")) return "로그인 후 인증 상태를 확인할 수 있습니다.";
  if (message.includes("403")) return "인증 상태를 확인할 권한이 없습니다.";
  return translateApiErrorMessage(
    message,
    "인증 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
};

const getStatusCodeFromVerificationError = (message?: string) => {
  const match = message?.match(/\((\d{3})\)/);
  return match ? Number(match[1]) : undefined;
};

export function useVerificationSummary(options?: VerificationSummaryOptions) {
  const role = options?.role;
  const enabled = options?.enabled ?? true;
  const cached = enabled ? getCachedVerificationSummary(role) : undefined;
  const [summary, setSummary] = useState<VerificationSummary | null>(
    cached?.summary ?? null,
  );
  const [isLoading, setIsLoading] = useState(enabled && !cached);
  const [error, setError] = useState<string | undefined>();
  const [statusCode, setStatusCode] = useState<number | undefined>(
    cached?.statusCode,
  );

  const load = useCallback(async (signal?: AbortSignal, force = false) => {
    if (!enabled) {
      setSummary(null);
      setIsLoading(false);
      setError(undefined);
      setStatusCode(undefined);
      return;
    }

    const currentCache = force ? undefined : getCachedVerificationSummary(role);
    if (currentCache) {
      setSummary(currentCache.summary);
      setStatusCode(currentCache.statusCode);
      setError(undefined);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(undefined);
    if (!force) {
      setSummary(null);
      setStatusCode(undefined);
    }

    try {
      const next = await fetchVerificationSummary(role);
      if (signal?.aborted || !next) return;
      setStatusCode(next.statusCode);
      setSummary(next.summary);
    } catch (requestError) {
      if (signal?.aborted) return;
      const message =
        requestError instanceof Error ? requestError.message : undefined;
      setStatusCode(getStatusCodeFromVerificationError(message));
      setSummary(null);
      setError(
        message
          ? getVerificationSummaryErrorMessage(message)
          : "인증 상태를 불러오지 못했습니다.",
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [enabled, role]);

  const refresh = async () => {
    await load(undefined, true);
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    const fastRole = getFastLoginRole(role);
    const timer = window.setTimeout(() => {
      const run = async () => {
        if (fastRole && isFastLoginTransitionPending(fastRole)) {
          await waitForFastLoginTransition(fastRole, 2_500);
        }
        if (!controller.signal.aborted) {
          void load(controller.signal);
        }
      };
      void run();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, load, role]);

  return {
    summary: enabled ? summary : null,
    isLoading: enabled ? isLoading : false,
    error: enabled ? error : undefined,
    refresh,
    statusCode: enabled ? statusCode : undefined,
  };
}
