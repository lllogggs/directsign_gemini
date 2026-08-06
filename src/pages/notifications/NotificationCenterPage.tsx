import { Bell, Check, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { AdvertiserAccountSettingsMenu } from "../../components/AdvertiserAccountSettingsMenu";
import { LogoMark } from "../../components/BrandLogo";
import { DashboardSurfaceSwitch } from "../../components/DashboardSurfaceSwitch";
import { HeaderMessageCenterButton } from "../../components/HeaderMessageCenterButton";
import {
  HeaderNotificationCenterButton,
  NotificationItems,
} from "../../components/HeaderNotificationCenterButton";
import { InfluencerAccountSettingsMenu } from "../../components/InfluencerAccountSettingsMenu";
import { MobileSurfaceSwitch } from "../../components/MobileSurfaceSwitch";
import { clearAdvertiserDashboardBootstrapPreload } from "../../domain/advertiserDashboardPreload";
import { clearAdvertiserSessionCache } from "../../domain/advertiserSessionCache";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { finishFastLoginTransition } from "../../domain/fastLoginTransition";
import { clearInfluencerDashboardPreload } from "../../domain/influencerDashboardPreload";
import { buildLoginRedirect } from "../../domain/navigation";
import {
  getNotificationDestination,
  type NotificationItem,
  type NotificationRole,
} from "../../domain/notifications";
import {
  clearMarketplaceMessageSummaryCache,
  useMarketplaceMessageSummary,
} from "../../hooks/useMarketplaceMessageSummary";
import {
  clearNotificationCenterCache,
  useNotificationCenter,
} from "../../hooks/useNotificationCenter";
import { clearVerificationSummaryCache } from "../../hooks/useVerificationSummary";

type SessionUser = {
  id?: string;
  email?: string;
  name?: string;
};

type SessionState =
  | { status: "checking" }
  | { status: "ready"; user: SessionUser }
  | { status: "retry" };

const getDashboardPath = (role: NotificationRole) =>
  role === "advertiser" ? "/advertiser/dashboard" : "/influencer/dashboard";

const getLoginPath = (role: NotificationRole) =>
  role === "advertiser" ? "/login/advertiser" : "/login/influencer";

export function NotificationCenterPage({ role }: { role: NotificationRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<SessionState>({ status: "checking" });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const checkSession = useCallback(async () => {
    setSession((current) =>
      current.status === "ready" ? current : { status: "checking" },
    );
    try {
      const response = await apiFetch(`/api/${role}/session`, {
        headers: { Accept: "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        authenticated?: boolean;
        user?: SessionUser;
      };

      if (response.ok && data.authenticated === true) {
        setSession({ status: "ready", user: data.user ?? {} });
        return;
      }

      if (
        response.status === 401 ||
        response.status === 403 ||
        (response.ok && data.authenticated === false)
      ) {
        clearNotificationCenterCache(role);
        navigate(
          buildLoginRedirect(
            getLoginPath(role),
            `${location.pathname}${location.search}`,
            getDashboardPath(role),
            [role === "advertiser" ? "/advertiser" : "/influencer"],
          ),
          { replace: true },
        );
        return;
      }

      setSession({ status: "retry" });
    } catch {
      setSession({ status: "retry" });
    }
  }, [location.pathname, location.search, navigate, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkSession(), 0);
    return () => window.clearTimeout(timer);
  }, [checkSession]);

  if (session.status !== "ready") {
    return (
      <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950">
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
            <div className="flex h-10 min-w-10 items-center gap-3 px-1">
              <LogoMark />
              <span className="font-neo-heavy text-[18px] leading-none">
                {PRODUCT_NAME}
              </span>
            </div>
            <div className="flex gap-1.5 sm:gap-2" aria-hidden="true">
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
              <span className="h-10 w-10 rounded-[9px] border border-neutral-200 bg-white" />
            </div>
          </div>
        </header>
        <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-[1500px] items-center justify-center px-5">
          {session.status === "retry" ? (
            <div className="text-center">
              <p className="text-[14px] font-extrabold text-neutral-800">
                알림을 준비하지 못했습니다
              </p>
              <button
                type="button"
                onClick={() => void checkSession()}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-[9px] bg-neutral-950 px-4 text-[12px] font-extrabold text-white"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <span className="h-2 w-24 animate-pulse rounded-full bg-neutral-200" />
          )}
        </main>
      </div>
    );
  }

  return (
    <AuthenticatedNotificationCenter
      role={role}
      user={session.user}
      accountMenuOpen={accountMenuOpen}
      setAccountMenuOpen={setAccountMenuOpen}
    />
  );
}

function AuthenticatedNotificationCenter({
  role,
  user,
  accountMenuOpen,
  setAccountMenuOpen,
}: {
  role: NotificationRole;
  user: SessionUser;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const {
    items,
    unreadCount,
    status,
    error,
    nextCursor,
    isLoadingMore,
    isUpdatingReadState,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  } = useNotificationCenter(role);
  const { summary, isLoading: isMessageSummaryLoading } =
    useMarketplaceMessageSummary(role);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLogout = async () => {
    try {
      await apiFetch(`/api/${role}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // The local private cache is cleared even when the best-effort revoke fails.
    } finally {
      clearNotificationCenterCache(role);
      clearMarketplaceMessageSummaryCache(role);
      clearVerificationSummaryCache(role);
      if (role === "advertiser") {
        clearAdvertiserSessionCache();
        clearAdvertiserDashboardBootstrapPreload();
      } else {
        finishFastLoginTransition("influencer");
        clearInfluencerDashboardPreload();
      }
      navigate(getLoginPath(role), { replace: true });
    }
  };

  const openItem = (item: NotificationItem) => {
    if (!item.readAt) void markRead(item.id);
    const destination = getNotificationDestination(role, item.routeKey, item.routeParams);
    if (destination) navigate(destination);
  };

  const accountEmail = user.email?.trim() || undefined;

  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate(getDashboardPath(role))}
            aria-label={PRODUCT_NAME}
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none">
              {PRODUCT_NAME}
            </span>
          </button>

          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            <div className="hidden lg:block">
              <DashboardSurfaceSwitch role={role} />
            </div>
            <HeaderNotificationCenterButton role={role} />
            <HeaderMessageCenterButton
              unreadCount={summary.unreadCount}
              isLoading={isMessageSummaryLoading}
              onClick={() => navigate(`/${role}/messages`)}
            />
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            {role === "advertiser" ? (
              <AdvertiserAccountSettingsMenu
                account={{ email: accountEmail }}
                open={accountMenuOpen}
                onToggle={() => setAccountMenuOpen(!accountMenuOpen)}
                onClose={() => setAccountMenuOpen(false)}
                onChangePassword={() => {
                  setAccountMenuOpen(false);
                  navigate("/reset-password?role=advertiser");
                }}
                onOpenBusinessVerification={() => {
                  setAccountMenuOpen(false);
                  navigate("/advertiser/verification");
                }}
                onLogout={() => {
                  setAccountMenuOpen(false);
                  void handleLogout();
                }}
              />
            ) : (
              <InfluencerAccountSettingsMenu
                account={{
                  email: accountEmail,
                  name: user.name?.trim() || "인플루언서",
                }}
                open={accountMenuOpen}
                onToggle={() => setAccountMenuOpen(!accountMenuOpen)}
                onClose={() => setAccountMenuOpen(false)}
                onManageProfile={() => {
                  setAccountMenuOpen(false);
                  navigate("/influencer/profile");
                }}
                onChangePassword={() => {
                  setAccountMenuOpen(false);
                  navigate("/reset-password?role=influencer");
                }}
                onLogout={() => {
                  setAccountMenuOpen(false);
                  void handleLogout();
                }}
              />
            )}
          </div>
        </div>
      </header>

      <MobileSurfaceSwitch role={role} />

      <main className="mx-auto w-full max-w-[1040px] px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <section className="overflow-hidden rounded-[12px] border border-neutral-200/90 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.055)]">
          <div className="flex min-h-[64px] items-center justify-between gap-4 border-b border-neutral-100 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-neutral-950 text-white">
                  <Bell className="h-4 w-4" />
                </span>
                <h1 className="text-[18px] font-extrabold text-neutral-950">알림</h1>
              </div>
              <p className="mt-1 text-[12px] font-semibold text-neutral-500">
                {unreadCount ? `읽지 않은 알림 ${unreadCount}개` : "모두 확인했습니다"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={!unreadCount || isUpdatingReadState}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-neutral-200 bg-white px-3 text-[11px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:pointer-events-none disabled:text-neutral-300"
            >
              <Check className="h-3.5 w-3.5" />
              모두 읽음
            </button>
          </div>

          <NotificationItems
            items={items}
            status={status}
            error={error}
            onOpen={openItem}
          />

          {nextCursor ? (
            <div className="border-t border-neutral-100 p-3 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
                className="inline-flex h-10 min-w-[120px] items-center justify-center rounded-[9px] border border-neutral-200 bg-white px-4 text-[12px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 disabled:text-neutral-400"
              >
                {isLoadingMore ? "불러오는 중" : "이전 알림 더 보기"}
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
