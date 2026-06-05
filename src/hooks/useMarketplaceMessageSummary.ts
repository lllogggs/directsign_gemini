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

type MessageSummaryOptions = {
  enabled?: boolean;
};

const MESSAGE_SUMMARY_CACHE_MS = 60 * 1000;
const messageSummaryCache = new Map<
  MarketplaceInboxRole,
  {
    summary: MarketplaceMessageSummary;
    cachedAt: number;
  }
>();
const messageSummaryInflight = new Map<
  MarketplaceInboxRole,
  Promise<MarketplaceMessageSummary | undefined>
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

export function primeMarketplaceMessageSummary(
  role: MarketplaceInboxRole,
  summary: MarketplaceMessageSummary,
) {
  messageSummaryInflight.delete(role);
  messageSummaryCache.set(role, {
    summary,
    cachedAt: Date.now(),
  });
}

export function useMarketplaceMessageSummary(
  role: MarketplaceInboxRole,
  options: MessageSummaryOptions = {},
): SummaryState {
  const enabled = options.enabled ?? true;
  const cached = getCachedMessageSummary(role);
  const [summary, setSummary] = useState<MarketplaceMessageSummary>(
    cached?.summary ?? emptyMarketplaceMessageSummary,
  );
  const [isLoading, setIsLoading] = useState(enabled && !cached);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    const timer = window.setTimeout(() => {
      const latestCached = getCachedMessageSummary(role);
      if (latestCached) {
        if (active) {
          setSummary(latestCached.summary);
          setIsLoading(false);
        }
        return;
      }

      if (active) setIsLoading(true);
      const inflight =
        messageSummaryInflight.get(role) ??
        waitForFastLoginTransition(role, 2_500)
          .then(() =>
            apiFetch(`/api/marketplace/messages?role=${role}&summary=1`, {
              headers: { Accept: "application/json" },
              credentials: "include",
            }),
          )
          .then(async (response) => {
            if (!response.ok) return undefined;
            const data = (await response.json()) as MarketplaceMessagesResponse;
            const nextSummary = data.summary ?? emptyMarketplaceMessageSummary;
            messageSummaryCache.set(role, {
              summary: nextSummary,
              cachedAt: Date.now(),
            });
            return nextSummary;
          })
          .catch(() => emptyMarketplaceMessageSummary)
          .finally(() => {
            messageSummaryInflight.delete(role);
          });
      messageSummaryInflight.set(role, inflight);

      void inflight
        .then((nextSummary) => {
          if (!active) return;
          setSummary(nextSummary ?? emptyMarketplaceMessageSummary);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [enabled, role]);

  return { summary, isLoading };
}
