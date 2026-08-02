export type DashboardSurfaceRole = "advertiser" | "influencer";
export type DashboardSurfaceKind = "contracts" | "campaigns" | "costs";

export type DashboardSurfaceItem = {
  id: DashboardSurfaceKind;
  label: string;
  href: string;
  mobileLabel?: string;
  mobileAriaLabel?: string;
};

export const DASHBOARD_SURFACE_ITEMS: Record<
  DashboardSurfaceRole,
  DashboardSurfaceItem[]
> = {
  advertiser: [
    { id: "campaigns", label: "캠페인", href: "/advertiser/campaigns" },
    { id: "contracts", label: "1:1 계약", href: "/advertiser/dashboard" },
    {
      id: "costs",
      label: "광고비 현황",
      mobileLabel: "광고비",
      mobileAriaLabel: "광고비 현황",
      href: "/advertiser/costs",
    },
  ],
  influencer: [
    { id: "campaigns", label: "캠페인", href: "/influencer/campaigns" },
    { id: "contracts", label: "1:1 계약", href: "/influencer/dashboard" },
  ],
};
