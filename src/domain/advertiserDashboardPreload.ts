import { apiFetch } from "./api.js";
import { primeVerificationSummary } from "../hooks/useVerificationSummary.js";
import { useAppStore, type Contract } from "../store.js";
import type { VerificationSummary } from "./verification.js";

export type AdvertiserDashboardBootstrap = {
  contracts?: Contract[];
  verification?: VerificationSummary;
  source?: "supabase" | "file";
  allow_local_merge?: boolean;
  demo_mode?: boolean;
};

let advertiserDashboardBootstrapPreload:
  | Promise<AdvertiserDashboardBootstrap>
  | undefined;

const applyAdvertiserDashboardBootstrap = (
  dashboard: AdvertiserDashboardBootstrap,
) => {
  if (dashboard.verification) {
    primeVerificationSummary("advertiser", dashboard.verification);
  }
  if (Array.isArray(dashboard.contracts)) {
    useAppStore.getState().primeContracts({
      contracts: dashboard.contracts,
      source: dashboard.source,
      allow_local_merge: dashboard.allow_local_merge,
    });
  }
};

const readAdvertiserDashboardBootstrap = async () => {
  const response = await apiFetch("/api/advertiser/dashboard/bootstrap", {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  const data = (await response.json().catch(() => ({}))) as
    | AdvertiserDashboardBootstrap
    | { error?: string };

  if (!response.ok) {
    throw new Error("error" in data ? data.error : "Dashboard preload failed");
  }

  const dashboard = data as AdvertiserDashboardBootstrap;
  applyAdvertiserDashboardBootstrap(dashboard);
  return dashboard;
};

export const preloadAdvertiserDashboardBootstrap = () => {
  advertiserDashboardBootstrapPreload ??= readAdvertiserDashboardBootstrap().catch(
    (error) => {
      advertiserDashboardBootstrapPreload = undefined;
      throw error;
    },
  );
  return advertiserDashboardBootstrapPreload;
};

export const primeAdvertiserDashboardBootstrap = (
  dashboard: AdvertiserDashboardBootstrap,
) => {
  applyAdvertiserDashboardBootstrap(dashboard);
  advertiserDashboardBootstrapPreload = Promise.resolve(dashboard);
};

export const clearAdvertiserDashboardBootstrapPreload = () => {
  advertiserDashboardBootstrapPreload = undefined;
};
