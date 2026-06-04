import { Globe2 } from "lucide-react";
import type { InfluencerPlatform } from "../domain/verification";

type PlatformBrandMarkSize = "sm" | "md";

const brandMarkSizeClasses: Record<PlatformBrandMarkSize, string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
};

const brandIconSizeClasses: Record<PlatformBrandMarkSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-[17px] w-[17px]",
};

export function PlatformBrandMark({
  platform,
  size = "md",
}: {
  platform: InfluencerPlatform;
  size?: PlatformBrandMarkSize;
}) {
  const markClassName = brandMarkSizeClasses[size];
  const iconClassName = brandIconSizeClasses[size];

  if (platform === "instagram") {
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden ${markClassName}`}
        style={{
          background:
            "radial-gradient(circle at 30% 110%, #fdf497 0%, #fdf497 16%, #fd5949 42%, #d6249f 68%, #285aeb 100%)",
        }}
        aria-hidden="true"
      >
        <svg className={iconClassName} viewBox="0 0 24 24" role="img">
          <rect
            x="4.2"
            y="4.2"
            width="15.6"
            height="15.6"
            rx="5"
            fill="none"
            stroke="white"
            strokeWidth="2"
          />
          <circle cx="12" cy="12" r="3.7" fill="none" stroke="white" strokeWidth="2" />
          <circle cx="17" cy="7.2" r="1.25" fill="white" />
        </svg>
      </span>
    );
  }

  if (platform === "youtube") {
    return (
      <svg
        className={`shrink-0 ${markClassName}`}
        viewBox="0 0 48 48"
        role="img"
        aria-hidden="true"
      >
        <rect x="4" y="12" width="40" height="26" rx="8" fill="#FF0033" />
        <path d="M21 19.5v11l10-5.5-10-5.5z" fill="#FFFFFF" />
      </svg>
    );
  }

  if (platform === "tiktok") {
    return (
      <svg
        className={`shrink-0 ${markClassName}`}
        viewBox="0 0 48 48"
        role="img"
        aria-hidden="true"
      >
        <path
          d="M31.2 6c1.1 6.1 4.7 9.8 10.8 10.4v8.1c-4.3.1-7.9-1.2-10.7-3.7v12.4c0 7.6-5.3 12.8-12.7 12.8C11.6 46 6 41.1 6 34.7c0-7 6-12.1 13.8-11.3v8.2c-3.1-.5-5.5 1.2-5.5 3.8 0 2.4 1.9 4 4.5 4 2.7 0 4.4-1.9 4.4-5.1V6h8z"
          fill="#25F4EE"
          transform="translate(-2 2)"
        />
        <path
          d="M31.2 6c1.1 6.1 4.7 9.8 10.8 10.4v8.1c-4.3.1-7.9-1.2-10.7-3.7v12.4c0 7.6-5.3 12.8-12.7 12.8C11.6 46 6 41.1 6 34.7c0-7 6-12.1 13.8-11.3v8.2c-3.1-.5-5.5 1.2-5.5 3.8 0 2.4 1.9 4 4.5 4 2.7 0 4.4-1.9 4.4-5.1V6h8z"
          fill="#FE2C55"
          transform="translate(2 -1)"
        />
        <path
          d="M31.2 6c1.1 6.1 4.7 9.8 10.8 10.4v8.1c-4.3.1-7.9-1.2-10.7-3.7v12.4c0 7.6-5.3 12.8-12.7 12.8C11.6 46 6 41.1 6 34.7c0-7 6-12.1 13.8-11.3v8.2c-3.1-.5-5.5 1.2-5.5 3.8 0 2.4 1.9 4 4.5 4 2.7 0 4.4-1.9 4.4-5.1V6h8z"
          fill="#111111"
        />
      </svg>
    );
  }

  if (platform === "naver_blog") {
    return (
      <span
        className={`flex shrink-0 items-center justify-center ${markClassName}`}
        style={{ backgroundColor: "#03C75A" }}
        aria-hidden="true"
      >
        <svg className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} viewBox="0 0 48 48" role="img">
          <path d="M10 11h9.2l9.6 13.7V11H38v26h-9.2l-9.6-13.7V37H10V11z" fill="#FFFFFF" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center text-neutral-700 ${markClassName}`}
      aria-hidden="true"
    >
      <Globe2 className={iconClassName} />
    </span>
  );
}
