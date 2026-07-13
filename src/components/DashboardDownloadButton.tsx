import { Download } from "lucide-react";

type DashboardDownloadButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export function DashboardDownloadButton({
  onClick,
  disabled = false,
}: DashboardDownloadButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="yl-header-action yl-header-action-secondary !w-[88px] px-2.5 sm:!w-[112px] disabled:pointer-events-none disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-300 disabled:shadow-none"
      aria-label="내보내기"
      title="내보내기"
    >
      <Download className="h-3.5 w-3.5" strokeWidth={2} />
      <span>내보내기</span>
    </button>
  );
}
