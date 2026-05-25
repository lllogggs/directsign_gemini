import { useEffect, useState } from "react";
import { apiFetch } from "../domain/api";
import { waitForFastLoginTransition } from "../domain/fastLoginTransition";
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

const MESSAGE_SUMMARY_CACHE_MS = 60 * 1000;
const messageSummaryCache = new Map<
  MarketplaceInboxRole,
  {
    summary: MarketplaceMessageSummary;
    cachedAt: number;
  }
>();

const getCachedMessageSummary = (role: MarketplaceInboxRole) => {
  const cache = messageSummaryCache.get(role);
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > MESSAGE_SUMMARY_CACHE_MS) {
    messageSummaryCache.delete(role);
    return undefined;
  }
  return cache;
};

export function useMarketplaceMessageSummary(role: MarketplaceInboxRole): SummaryState {
  const cached = getCachedMessageSummary(role);
  const [summary, setSummary] = useState<MarketplaceMessageSummary>(
    cached?.summary ?? emptyMarketplaceMessageSummary,
  );
  const [isLoading, setIsLoading] = useState(!cached);

  useEffect(() => {
    if (getCachedMessageSummary(role)) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void waitForFastLoginTransition(role, 2_500)
        .then(() =>
          apiFetch(`/api/marketplace/messages?role=${role}&summary=1`, {
            headers: { Accept: "application/json" },
            credentials: "include",
          }),
        )
        .then(async (response) => {
          if (!response.ok) return undefined;
          return (await response.json()) as MarketplaceMessagesResponse;
        })
        .then((data) => {
          if (!active) return;
          const nextSummary = data?.summary ?? emptyMarketplaceMessageSummary;
          messageSummaryCache.set(role, {
            summary: nextSummary,
            cachedAt: Date.now(),
          });
          setSummary(nextSummary);
        })
        .catch(() => {
          if (active) setSummary(emptyMarketplaceMessageSummary);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [role]);

  return { summary, isLoading };
}
