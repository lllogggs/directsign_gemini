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
const messageSummaryGeneration = new Map<MarketplaceInboxRole, number>();

const getMessageSummaryGeneration = (role: MarketplaceInboxRole) =>
  messageSummaryGeneration.get(role) ?? 0;

const advanceMessageSummaryGeneration = (role: MarketplaceInboxRole) => {
  messageSummaryGeneration.set(role, getMessageSummaryGeneration(role) + 1);
};

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
  advanceMessageSummaryGeneration(role);
  messageSummaryInflight.delete(role);
  messageSummaryCache.set(role, {
    summary,
    cachedAt: Date.now(),
  });
}

export function clearMarketplaceMessageSummaryCache(
  role?: MarketplaceInboxRole,
) {
  const roles = role
    ? [role]
    : [...new Set([...messageSummaryCache.keys(), ...messageSummaryInflight.keys()])];

  for (const targetRole of roles) {
    advanceMessageSummaryGeneration(targetRole);
    messageSummaryCache.delete(targetRole);
    messageSummaryInflight.delete(targetRole);
  }
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
      let inflight = messageSummaryInflight.get(role);
      if (!inflight) {
        const requestGeneration = getMessageSummaryGeneration(role);
        inflight = waitForFastLoginTransition(role, 2_500)
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
            if (getMessageSummaryGeneration(role) !== requestGeneration) {
              return messageSummaryCache.get(role)?.summary;
            }
            messageSummaryCache.set(role, {
              summary: nextSummary,
              cachedAt: Date.now(),
            });
            return nextSummary;
          })
          .catch(() => emptyMarketplaceMessageSummary)
          .finally(() => {
            if (messageSummaryInflight.get(role) === inflight) {
              messageSummaryInflight.delete(role);
            }
          });
        messageSummaryInflight.set(role, inflight);
      }

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
