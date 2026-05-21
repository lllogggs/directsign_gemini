import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../domain/api";
import { translateApiErrorMessage } from "../domain/userMessages";
import type { VerificationSummary } from "../domain/verification";

type VerificationSummaryOptions = {
  role?: "advertiser" | "influencer";
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
type VerificationSummaryCacheEntry = NonNullable<
  ReturnType<typeof getCachedVerificationSummary>
>;
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

export function getCachedVerificationSummary(
  role?: VerificationSummaryOptions["role"],
) {
  const cache = verificationSummaryCache.get(getVerificationCacheKey(role));
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > VERIFICATION_SUMMARY_CACHE_MS) {
    verificationSummaryCache.delete(getVerificationCacheKey(role));
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
    return;
  }
  verificationSummaryCache.clear();
  verificationSummaryInflight.clear();
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

export function useVerificationSummary(options?: VerificationSummaryOptions) {
  const role = options?.role;
  const cached = getCachedVerificationSummary(role);
  const [summary, setSummary] = useState<VerificationSummary | null>(
    cached?.summary ?? null,
  );
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | undefined>();
  const [statusCode, setStatusCode] = useState<number | undefined>(
    cached?.statusCode,
  );

  const load = useCallback(async (signal?: AbortSignal, silent = false) => {
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
      setSummary((current) => current ?? null);
      setError(
        requestError instanceof Error
          ? getVerificationSummaryErrorMessage(requestError.message)
          : "인증 상태를 불러오지 못했습니다.",
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [role]);

  const refresh = async () => {
    await load();
  };

  useEffect(() => {
    if (getCachedVerificationSummary(role)) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, role]);

  return { summary, isLoading, error, refresh, statusCode };
}
