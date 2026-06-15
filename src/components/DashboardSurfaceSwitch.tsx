import { Link } from "react-router-dom";

type DashboardSurfaceRole = "advertiser" | "influencer";
type DashboardSurfaceKind = "contracts" | "campaigns";

interface DashboardSurfaceSwitchProps {
  role: DashboardSurfaceRole;
  active: DashboardSurfaceKind;
}

const surfaceConfig: Record<
  DashboardSurfaceRole,
  {
    ariaLabel: string;
    items: Array<{ id: DashboardSurfaceKind; label: string; href: string }>;
  }
> = {
  advertiser: {
    ariaLabel: "광고주 대시보드 전환",
    items: [
      { id: "contracts", label: "1:1 계약", href: "/advertiser/dashboard" },
      { id: "campaigns", label: "캠페인", href: "/advertiser/campaigns" },
    ],
  },
  influencer: {
    ariaLabel: "인플루언서 대시보드 전환",
    items: [
      { id: "contracts", label: "1:1 계약", href: "/influencer/dashboard" },
      { id: "campaigns", label: "캠페인", href: "/influencer/campaigns" },
    ],
  },
};

export function DashboardSurfaceSwitch({
  role,
  active,
}: DashboardSurfaceSwitchProps) {
  const config = surfaceConfig[role];

  return (
    <nav
      className="yl-dashboard-surface-switch"
      aria-label={config.ariaLabel}
      data-dashboard-surface-switch={role}
    >
      {config.items.map((item) => (
        <Link
          key={item.id}
          to={item.href}
          className={`yl-dashboard-surface-link ${
            active === item.id ? "yl-dashboard-surface-link-active" : ""
          }`}
          aria-current={active === item.id ? "page" : undefined}
          data-dashboard-surface-active={active === item.id ? item.id : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
