import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../domain/api";
import {
  isFastLoginTransitionPending,
  waitForFastLoginTransition,
  type FastLoginRole,
} from "../domain/fastLoginTransition";
import { translateApiErrorMessage } from "../domain/userMessages";
import type { VerificationSummary } from "../domain/verification";

type VerificationSummaryOptions = {
  role?: "advertiser" | "influencer";
  enabled?: boolean;
};

const VERIFICATION_SUMMARY_CACHE_MS = 2 * 60 * 1000;
const verificationSummaryCache = new Map<
  string,
  {
    summary: VerificationSummary;
    statusCode: number;
    cachedAt: number;
  }
>();
type VerificationSummaryCacheEntry = {
  summary: VerificationSummary;
  statusCode: number;
  cachedAt: number;
};
const verificationSummaryInflight = new Map<
  string,
  Promise<VerificationSummaryCacheEntry | undefined>
>();

const buildVerificationStatusUrl = (role?: VerificationSummaryOptions["role"]) => {
  const query = new URLSearchParams();
  if (role) query.set("role", role);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/api/verification/status${suffix}`;
};

const getVerificationCacheKey = (role?: VerificationSummaryOptions["role"]) =>
  role ?? "all";

const getFastLoginRole = (
  role?: VerificationSummaryOptions["role"],
): FastLoginRole | undefined =>
  role === "advertiser" || role === "influencer" ? role : undefined;

const getVerificationStorageKey = (role?: VerificationSummaryOptions["role"]) =>
  `yeollock-verification-summary:${getVerificationCacheKey(role)}`;

function readStoredVerificationSummary(role?: VerificationSummaryOptions["role"]) {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.sessionStorage.getItem(getVerificationStorageKey(role));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      summary?: VerificationSummary;
      statusCode?: number;
      cachedAt?: number;
    };
    if (!parsed.summary || typeof parsed.cachedAt !== "number") return undefined;
    if (Date.now() - parsed.cachedAt > VERIFICATION_SUMMARY_CACHE_MS) {
      window.sessionStorage.removeItem(getVerificationStorageKey(role));
      return undefined;
    }
    return {
      summary: parsed.summary,
      statusCode: parsed.statusCode ?? 200,
      cachedAt: parsed.cachedAt,
    };
  } catch {
    return undefined;
  }
}

function writeStoredVerificationSummary(
  role: VerificationSummaryOptions["role"] | undefined,
  entry: VerificationSummaryCacheEntry,
) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      getVerificationStorageKey(role),
      JSON.stringify(entry),
    );
  } catch {
    // Keep the in-memory cache even if sessionStorage is unavailable.
  }
}

export function primeVerificationSummary(
  role: VerificationSummaryOptions["role"] | undefined,
  summary: VerificationSummary,
  statusCode = 200,
) {
  const entry = {
    summary,
    statusCode,
    cachedAt: Date.now(),
  };
  verificationSummaryCache.set(getVerificationCacheKey(role), entry);
  writeStoredVerificationSummary(role, entry);
}

export function getCachedVerificationSummary(
  role?: VerificationSummaryOptions["role"],
) {
  const cache = verificationSummaryCache.get(getVerificationCacheKey(role));
  if (!cache) {
    const stored = readStoredVerificationSummary(role);
    if (stored) {
      verificationSummaryCache.set(getVerificationCacheKey(role), stored);
    }
    return stored;
  }
  if (Date.now() - cache.cachedAt > VERIFICATION_SUMMARY_CACHE_MS) {
    verificationSummaryCache.delete(getVerificationCacheKey(role));
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(getVerificationStorageKey(role));
    }
    return undefined;
  }
  return cache;
}

export function clearVerificationSummaryCache(
  role?: VerificationSummaryOptions["role"],
) {
  if (role) {
    verificationSummaryCache.delete(getVerificationCacheKey(role));
    verificationSummaryInflight.delete(getVerificationCacheKey(role));
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(getVerificationStorageKey(role));
    }
    return;
  }
  verificationSummaryCache.clear();
  verificationSummaryInflight.clear();
  if (typeof window !== "undefined") {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith("yeollock-verification-summary:")) {
        window.sessionStorage.removeItem(key);
      }
    }
  }
}

async function fetchVerificationSummary(
  role?: VerificationSummaryOptions["role"],
  signal?: AbortSignal,
) {
  const cacheKey = getVerificationCacheKey(role);
  const existingRequest = verificationSummaryInflight.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const response = await apiFetch(buildVerificationStatusUrl(role), {
      headers: { Accept: "application/json" },
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      clearVerificationSummaryCache(role);
      throw new Error(`인증 상태 API 오류 (${response.status})`);
    }

    const entry = {
      summary: (await response.json()) as VerificationSummary,
      statusCode: response.status,
      cachedAt: Date.now(),
    };
    verificationSummaryCache.set(cacheKey, entry);
    writeStoredVerificationSummary(role, entry);
    return entry;
  })().finally(() => {
    verificationSummaryInflight.delete(cacheKey);
  });

  verificationSummaryInflight.set(cacheKey, request);
  return request;
}

export async function preloadVerificationSummary(
  role?: VerificationSummaryOptions["role"],
) {
  if (getCachedVerificationSummary(role)) return;
  await fetchVerificationSummary(role).catch(() => undefined);
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

  const load = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!enabled) {
      setIsLoading(false);
      setError(undefined);
      return;
    }
    if (!silent) setIsLoading(true);
    setError(undefined);
    if (!silent) setStatusCode(undefined);

    try {
      const next = await fetchVerificationSummary(role, signal);
      if (!next) return;
      setStatusCode(next.statusCode);
      setSummary(next.summary);
    } catch (requestError) {
      if (signal?.aborted) return;
      const message =
        requestError instanceof Error ? requestError.message : undefined;
      setStatusCode(getStatusCodeFromVerificationError(message));
      setSummary((current) => current ?? null);
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
    await load();
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (getCachedVerificationSummary(role)) {
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
