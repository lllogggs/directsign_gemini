import { useEffect, useState } from "react";
import { apiFetch } from "../domain/api";
import {
  emptyMarketplaceMessageSummary,
  type MarketplaceInboxRole,
  type MarketplaceMessageSummary,
  type MarketplaceMessagesResponse,
} from "../domain/marketplaceInbox";

type SummaryState = {
  summary: MarketplaceMessageSummary;
  isLoading: boolean;
};

export function useMarketplaceMessageSummary(role: MarketplaceInboxRole): SummaryState {
  const [summary, setSummary] = useState<MarketplaceMessageSummary>(
    emptyMarketplaceMessageSummary,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void apiFetch(`/api/marketplace/messages?role=${role}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) return undefined;
        return (await response.json()) as MarketplaceMessagesResponse;
      })
      .then((data) => {
        if (!active) return;
        setSummary(data?.summary ?? emptyMarketplaceMessageSummary);
      })
      .catch(() => {
        if (active) setSummary(emptyMarketplaceMessageSummary);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [role]);

  return { summary, isLoading };
}
