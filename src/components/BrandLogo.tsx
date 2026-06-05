import { PRODUCT_NAME } from "../domain/brand";

type LogoMarkProps = {
  className?: string;
};

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  text?: string;
  textClassName?: string;
};

export function LogoMark({ className = "" }: LogoMarkProps) {
  return (
    <span
      className={[
        "inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <svg
        aria-hidden="true"
        className="h-[23px] w-[23px]"
        fill="none"
        viewBox="0 0 32 32"
      >
        <circle cx="9.8" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="22.2" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="16" cy="22" r="3" fill="currentColor" opacity="0.96" />
        <path
          d="M12.1 12.8 16 19.1l3.9-6.3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.1"
        />
      </svg>
    </span>
  );
}

export function BrandLogo({
  className = "inline-flex items-center gap-2.5",
  markClassName,
  text = PRODUCT_NAME,
  textClassName = "font-neo-heavy text-[18px] leading-none tracking-[-0.045em] text-neutral-950 sm:text-[19px]",
}: BrandLogoProps) {
  return (
    <span className={className}>
      <LogoMark className={markClassName} />
      <span className={textClassName}>{text}</span>
    </span>
  );
}
