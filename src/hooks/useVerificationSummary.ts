import { useEffect, useState } from "react";
import type { VerificationSummary } from "../domain/verification";

const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";

type VerificationSummaryOptions = {
  role?: "advertiser" | "influencer";
};

const buildVerificationStatusUrl = (role?: VerificationSummaryOptions["role"]) => {
  const query = new URLSearchParams();
  if (role) query.set("role", role);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `${API_BASE}/api/verification/status${suffix}`;
};

export function useVerificationSummary(options?: VerificationSummaryOptions) {
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [statusCode, setStatusCode] = useState<number | undefined>();
  const role = options?.role;

  const load = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(undefined);
    setStatusCode(undefined);

    try {
      const response = await fetch(buildVerificationStatusUrl(role), {
        headers: { Accept: "application/json" },
        credentials: "include",
        signal,
      });

      setStatusCode(response.status);

      if (!response.ok) {
        throw new Error(`Verification API error (${response.status})`);
      }

      setSummary((await response.json()) as VerificationSummary);
    } catch (requestError) {
      if (signal?.aborted) return;
      setSummary(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Verification status could not be loaded.",
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  const refresh = async () => {
    await load();
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [role]);

  return { summary, isLoading, error, refresh, statusCode };
}
