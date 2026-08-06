import { Link } from "react-router";
import {
  DASHBOARD_SURFACE_ITEMS,
  type DashboardSurfaceItem,
  type DashboardSurfaceKind,
  type DashboardSurfaceRole,
} from "../domain/dashboardSurfaces";

interface DashboardSurfaceSwitchProps {
  role: DashboardSurfaceRole;
  active?: DashboardSurfaceKind;
}

const surfaceConfig: Record<
  DashboardSurfaceRole,
  {
    ariaLabel: string;
    items: DashboardSurfaceItem[];
  }
> = {
  advertiser: {
    ariaLabel: "광고주 대시보드 전환",
    items: DASHBOARD_SURFACE_ITEMS.advertiser,
  },
  influencer: {
    ariaLabel: "인플루언서 대시보드 전환",
    items: DASHBOARD_SURFACE_ITEMS.influencer,
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
      data-product-tour={`${role}-dashboard-surfaces`}
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
