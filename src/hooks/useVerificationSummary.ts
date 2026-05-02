import { useEffect, useState } from "react";
import type { VerificationSummary } from "../domain/verification";

const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";

export function useVerificationSummary() {
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refresh = async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const response = await fetch(`${API_BASE}/api/verification/status`, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Verification API error (${response.status})`);
      }

      setSummary((await response.json()) as VerificationSummary);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Verification status could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { summary, isLoading, error, refresh };
}
