import { apiFetch } from "./api.js";
import type { InfluencerDashboardResponse } from "./influencerDashboard.js";

let influencerDashboardPreload:
  | Promise<InfluencerDashboardResponse>
  | undefined;

const readInfluencerDashboard = async () => {
  const response = await apiFetch(
    "/api/influencer/dashboard?includeApplications=false",
    {
      headers: { Accept: "application/json" },
      credentials: "include",
    },
  );
  const data = (await response.json().catch(() => ({}))) as
    | InfluencerDashboardResponse
    | { authenticated?: false; error?: string };

  if (!response.ok || !("authenticated" in data) || data.authenticated !== true) {
    const errorMessage = "error" in data ? data.error : undefined;
    throw new Error(errorMessage ?? "인플루언서 대시보드를 불러오지 못했습니다.");
  }

  return data;
};

export const preloadInfluencerDashboard = () => {
  influencerDashboardPreload ??= readInfluencerDashboard().catch((error) => {
    influencerDashboardPreload = undefined;
    throw error;
  });
  return influencerDashboardPreload;
};

export const consumeInfluencerDashboardPreload = () => {
  const current = influencerDashboardPreload;
  influencerDashboardPreload = undefined;
  return current;
};

export const clearInfluencerDashboardPreload = () => {
  influencerDashboardPreload = undefined;
};
