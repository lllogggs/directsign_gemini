import { Link } from "react-router-dom";

type SurfaceRole = "advertiser" | "influencer";
type SurfaceKind = "contracts" | "campaigns" | "costs";

interface MobileSurfaceSwitchProps {
  role: SurfaceRole;
  active: SurfaceKind;
}

const surfaceCopy: Record<
  SurfaceRole,
  {
    ariaLabel: string;
    items: Array<{
      id: SurfaceKind;
      label: string;
      href: string;
      ariaLabel?: string;
    }>;
  }
> = {
  advertiser: {
    ariaLabel: "광고주 모바일 대시보드 전환",
    items: [
      { id: "contracts", label: "1:1 계약", href: "/advertiser/dashboard" },
      { id: "campaigns", label: "캠페인", href: "/advertiser/campaigns" },
      {
        id: "costs",
        label: "광고비",
        ariaLabel: "광고비 현황",
        href: "/advertiser/costs",
      },
    ],
  },
  influencer: {
    ariaLabel: "인플루언서 모바일 대시보드 전환",
    items: [
      { id: "contracts", label: "1:1 계약", href: "/influencer/dashboard" },
      { id: "campaigns", label: "캠페인", href: "/influencer/campaigns" },
    ],
  },
};

export function MobileSurfaceSwitch({ role, active }: MobileSurfaceSwitchProps) {
  const copy = surfaceCopy[role];
  const gridClassName =
    copy.items.length === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <nav
      className="border-b border-neutral-200/80 bg-white px-3 py-2 sm:hidden"
      aria-label={copy.ariaLabel}
      data-mobile-surface-switch={role}
    >
      <div
        className={`mx-auto grid h-10 max-w-[1500px] ${gridClassName} gap-1 rounded-[10px] bg-neutral-100 p-1`}
      >
        {copy.items.map((item) => {
          const isActive = item.id === active;
          const className = `inline-flex min-w-0 items-center justify-center rounded-[8px] px-3 text-[13px] font-extrabold transition ${
            isActive
              ? "bg-neutral-950 text-white shadow-[0_8px_18px_rgba(23,23,23,0.16)]"
              : "text-neutral-500 hover:bg-white hover:text-neutral-950"
          }`;

          if (isActive) {
            return (
              <span
                key={item.id}
                className={className}
                aria-current="page"
                aria-label={item.ariaLabel}
                data-mobile-surface-active={item.id}
              >
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.id}
              to={item.href}
              className={className}
              aria-label={item.ariaLabel}
              title={item.ariaLabel}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
