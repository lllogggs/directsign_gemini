import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../domain/api";
import { translateApiErrorMessage } from "../domain/userMessages";
import type { VerificationSummary } from "../domain/verification";

type VerificationSummaryOptions = {
  role?: "advertiser" | "influencer";
};

const buildVerificationStatusUrl = (role?: VerificationSummaryOptions["role"]) => {
  const query = new URLSearchParams();
  if (role) query.set("role", role);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/api/verification/status${suffix}`;
};

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
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [statusCode, setStatusCode] = useState<number | undefined>();
  const role = options?.role;

  const load = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(undefined);
    setStatusCode(undefined);

    try {
      const response = await apiFetch(buildVerificationStatusUrl(role), {
        headers: { Accept: "application/json" },
        credentials: "include",
        signal,
      });

      setStatusCode(response.status);

      if (!response.ok) {
        throw new Error(`인증 상태 API 오류 (${response.status})`);
      }

      setSummary((await response.json()) as VerificationSummary);
    } catch (requestError) {
      if (signal?.aborted) return;
      setSummary(null);
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
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  return { summary, isLoading, error, refresh, statusCode };
}
