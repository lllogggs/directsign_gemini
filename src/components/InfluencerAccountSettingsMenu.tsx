import {
  KeyRound,
  LogOut,
  Mail,
  Settings,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { openAccountErasureDialog } from "../domain/accountErasure";
import { LEGAL_CONTACT_EMAIL } from "../domain/legalEntity";

export type InfluencerAccountSummary = {
  name: string;
  email?: string;
};

function buildSupportMailtoHref({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) {
  return `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export function InfluencerAccountSettingsMenu({
  account,
  open,
  onToggle,
  onClose,
  onManageProfile,
  onChangePassword,
  onLogout,
}: {
  account: InfluencerAccountSummary;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onManageProfile: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const emailChangeHref = buildSupportMailtoHref({
    subject: "인플루언서 계정 이메일 변경 요청",
    body: [
      "인플루언서 계정 이메일 변경을 요청합니다.",
      "",
      `현재 표시 이메일: ${account.email ?? "확인 필요"}`,
      `활동명: ${account.name}`,
      "변경할 이메일:",
      "요청 사유:",
    ].join("\n"),
  });

  useEffect(() => {
    if (!open) return undefined;

    const closeMenu = (restoreFocus: boolean) => {
      onClose();
      if (restoreFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-label="계정 설정"
        title="계정 설정"
        aria-expanded={open}
        className="yl-header-icon-action"
      >
        <Settings className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="계정 설정"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[12px] border border-neutral-200 bg-white text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
        >
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-[13px] font-extrabold text-neutral-950">계정 설정</p>
            {account.email ? (
              <p className="mt-1 truncate text-[12px] font-semibold text-neutral-500">
                {account.email}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={onManageProfile}
            className="flex min-h-12 w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-neutral-50 focus-visible:bg-neutral-50"
          >
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-neutral-800">
                공개 프로필 관리
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                활동 정보와 공개 주소를 관리합니다.
              </span>
            </span>
          </button>
          <a
            href={emailChangeHref}
            role="menuitem"
            onClick={onClose}
            className="flex min-h-12 items-start gap-2 px-4 py-3 text-left transition hover:bg-neutral-50 focus-visible:bg-neutral-50"
          >
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-neutral-800">
                로그인 이메일 변경 요청
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                소유 확인 후 새 이메일로 변경합니다.
              </span>
            </span>
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={onChangePassword}
            className="flex min-h-12 w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-neutral-50 focus-visible:bg-neutral-50"
          >
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-neutral-800">
                비밀번호 재설정
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                로그인 비밀번호를 다시 설정합니다.
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              openAccountErasureDialog("influencer");
            }}
            className="flex min-h-12 w-full items-start gap-2 border-t border-neutral-100 px-4 py-3 text-left transition hover:bg-red-50 focus-visible:bg-red-50"
          >
            <UserRoundX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-red-700">
                회원 탈퇴
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                계정과 공개 정보를 삭제합니다.
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="flex min-h-12 w-full items-start gap-2 border-t border-neutral-100 px-4 py-3 text-left transition hover:bg-neutral-50 focus-visible:bg-neutral-50 sm:hidden"
          >
            <LogOut className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-neutral-800">
                로그아웃
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                이 기기에서 계정을 종료합니다.
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
