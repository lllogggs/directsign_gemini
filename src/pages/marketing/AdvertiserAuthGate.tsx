import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import {
  AuthPasswordResetLink,
  AuthLoginQuickActions,
  AuthLoginScreen,
} from "../../components/AuthLoginScreen";
import { BrandLogo } from "../../components/BrandLogo";
import {
  appendSafeAuthNext,
  AuthAccountNoticeDialog,
  clearConsumedAuthNavigationState,
  parseAuthAccountNotice,
  readAuthNoticeState,
  readAuthPrefillEmail,
} from "../../components/AuthAccountNoticeDialog";
import { apiFetch } from "../../domain/api";
import {
  clearAdvertiserDashboardBootstrapPreload,
  preloadAdvertiserDashboardBootstrap,
  primeAdvertiserDashboardBootstrap,
} from "../../domain/advertiserDashboardPreload";
import {
  clearAdvertiserSessionCache,
  getAdvertiserSessionCache,
  rememberAdvertiserSession,
} from "../../domain/advertiserSessionCache";
import {
  finishFastLoginTransition,
  isFastLoginTransitionPending,
  startFastLoginTransition,
  waitForFastLoginTransition,
} from "../../domain/fastLoginTransition";
import { buildLoginRedirect } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";
import {
  clearVerificationSummaryCache,
  primeVerificationSummary,
  preloadVerificationSummary,
} from "../../hooks/useVerificationSummary";
import { clearNotificationCenterCache } from "../../hooks/useNotificationCenter";
import { type Contract, useAppStore } from "../../store";
import type { VerificationSummary } from "../../domain/verification";
import type { MarketplaceMessageSummary } from "../../domain/marketplaceInbox";

type AdvertiserSessionResponse = {
  authenticated?: boolean;
  user?: {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    company_name?: string | null;
    verification_status?: string;
    business_registration_number?: string | null;
  };
  dashboard?: {
    contracts?: Contract[];
    verification?: VerificationSummary;
    message_summary?: MarketplaceMessageSummary;
    source?: "supabase" | "file";
    allow_local_merge?: boolean;
    demo_mode?: boolean;
  };
  error?: string;
  code?: string;
  actual_role?: string;
  correct_login_path?: string;
  signup_path?: string;
};

const waitSoft = async <T,>(promise: Promise<T>, timeoutMs: number) => {
  await Promise.race([
    promise.then(() => undefined).catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
};

let advertiserLoginWarmupStarted = false;

const prewarmAdvertiserLoginEndpoint = () => {
  if (advertiserLoginWarmupStarted || typeof window === "undefined") return;
  advertiserLoginWarmupStarted = true;
  void Promise.allSettled([
    apiFetch("/api/auth/warmup", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    }),
    apiFetch("/api/advertiser/login", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    }),
  ]);
};

const rememberAuthenticatedAdvertiser = (
  user?: AdvertiserSessionResponse["user"],
) => {
  const previousAccountId = getAdvertiserSessionCache()?.user?.id;
  const nextAccountId = user?.id;
  if (!nextAccountId || previousAccountId !== nextAccountId) {
    clearNotificationCenterCache("advertiser");
    clearVerificationSummaryCache("advertiser");
    clearAdvertiserDashboardBootstrapPreload();
  }
  if (!nextAccountId) clearAdvertiserSessionCache();
  rememberAdvertiserSession(user);
  return nextAccountId;
};

export function AdvertiserAuthGate({
  children,
  redirectUnauthenticated = false,
  redirectAfterLogin,
}: {
  children: React.ReactNode;
  redirectUnauthenticated?: boolean;
  redirectAfterLogin?: string;
}) {
  const hydrateContracts = useAppStore((state) => state.hydrateContracts);
  const location = useLocation();
  const navigate = useNavigate();
  const cachedSession = getAdvertiserSessionCache();
  const initialLoginError =
    typeof (location.state as { loginError?: unknown } | null)?.loginError ===
    "string"
      ? ((location.state as { loginError: string }).loginError)
      : "";
  const initialAuthNotice = readAuthNoticeState(location.state, "advertiser");
  const initialPrefillEmail = readAuthPrefillEmail(location.state);
  const shouldShowLoginImmediately =
    Boolean(redirectAfterLogin) && !redirectUnauthenticated;
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState(initialPrefillEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialLoginError);
  const [authNotice, setAuthNotice] = useState(initialAuthNotice);
  const consumedInitialAuthStateRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshContracts = useCallback(async (options?: { force?: boolean }) => {
    await hydrateContracts(options);
  }, [hydrateContracts]);

  const preloadDashboard = useCallback(async () => {
    const accountId = getAdvertiserSessionCache()?.user?.id;
    try {
      await preloadAdvertiserDashboardBootstrap();
    } catch (preloadError) {
      console.warn("[yeollock.me] advertiser dashboard preload failed", preloadError);
      await Promise.allSettled([
        preloadVerificationSummary("advertiser", accountId),
        refreshContracts({ force: true }),
      ]);
    }
  }, [refreshContracts]);

  const preloadDashboardInBackground = useCallback((delayMs = 0) => {
    const run = () => {
      void preloadDashboard();
    };
    if (delayMs > 0) {
      window.setTimeout(run, delayMs);
      return;
    }
    run();
  }, [preloadDashboard]);

  useEffect(() => {
    if (!shouldShowLoginImmediately || cachedSession) return;
    prewarmAdvertiserLoginEndpoint();
  }, [cachedSession, shouldShowLoginImmediately]);

  useEffect(() => {
    let cancelled = false;
    let retryAttempt = 0;
    let retryTimer: number | undefined;

    const checkSession = async () => {
      try {
        const response = await apiFetch("/api/advertiser/session", {
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as
          AdvertiserSessionResponse;

        if (!cancelled && response.ok && data.authenticated === true) {
          const accountId = rememberAuthenticatedAdvertiser(data.user);
          if (location.pathname === "/advertiser/verification") {
            await waitSoft(
              preloadVerificationSummary("advertiser", accountId),
              900,
            );
          }
          if (cancelled) return;
          retryAttempt = 0;
          setIsAuthenticated(true);
          setIsChecking(false);
          preloadDashboardInBackground();
          return;
        }

        const isAuthoritativeLogout =
          response.status === 401 ||
          response.status === 403 ||
          (response.ok && data.authenticated === false);

        if (!cancelled && isAuthoritativeLogout) {
          clearNotificationCenterCache("advertiser");
          clearAdvertiserSessionCache();
          clearVerificationSummaryCache("advertiser");
          clearAdvertiserDashboardBootstrapPreload();
          setIsAuthenticated(false);
          setIsChecking(false);
          return;
        }
      } catch {
        // A network failure is retryable and must not turn a valid cookie into logout.
      }

      if (cancelled) return;

      if (retryTimer === undefined) {
        const retryDelayMs = Math.min(1_000 * 2 ** retryAttempt, 10_000);
        retryAttempt += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          void checkSession();
        }, retryDelayMs);
      }
    };

    const timer = window.setTimeout(() => {
      const run = async () => {
        if (isFastLoginTransitionPending("advertiser")) {
          await waitForFastLoginTransition("advertiser", 6_000);
        }
        if (cancelled) return;

        await checkSession();
      };
      void run();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [
    location.pathname,
    preloadDashboardInBackground,
    shouldShowLoginImmediately,
  ]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    let navigatedOptimistically = false;

    try {
      const loginPromise = apiFetch("/api/advertiser/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (redirectAfterLogin) {
        startFastLoginTransition("advertiser");
        navigatedOptimistically = true;
        navigate(redirectAfterLogin, { replace: true });
      }

      const response = await loginPromise;
      const data = (await response.json()) as AdvertiserSessionResponse;

      if (!response.ok || data.authenticated !== true) {
        const notice = parseAuthAccountNotice(data, "advertiser");
        if (notice) {
          if (navigatedOptimistically && redirectAfterLogin) {
            navigate(
              appendSafeAuthNext(
                "/login/advertiser",
                redirectAfterLogin,
                "advertiser",
              ),
              {
                replace: true,
                state: {
                  authNotice: notice,
                  prefillEmail: email.trim(),
                },
              },
            );
            return;
          }
          setAuthNotice(notice);
          setError("");
          return;
        }
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "광고주 계정으로 로그인할 수 없습니다.",
          ),
        );
      }

      const accountId = rememberAuthenticatedAdvertiser(data.user);
      if (!navigatedOptimistically) setIsAuthenticated(true);
      if (data.dashboard?.verification) {
        primeVerificationSummary(
          "advertiser",
          data.dashboard.verification,
          200,
          accountId,
        );
      }
      if (Array.isArray(data.dashboard?.contracts)) {
        primeAdvertiserDashboardBootstrap(data.dashboard);
      }
      const dashboardPreload = Array.isArray(data.dashboard?.contracts)
        ? undefined
        : preloadDashboard();
      if (dashboardPreload && !navigatedOptimistically) {
        await waitSoft(dashboardPreload, 260);
      }
      finishFastLoginTransition("advertiser");
      if (dashboardPreload) void dashboardPreload;
      if (
        redirectAfterLogin &&
        (!navigatedOptimistically || window.location.pathname !== redirectAfterLogin)
      ) {
        navigate(redirectAfterLogin, { replace: true });
        return;
      }
    } catch (loginError) {
      finishFastLoginTransition("advertiser");
      clearNotificationCenterCache("advertiser");
      clearAdvertiserSessionCache();
      clearVerificationSummaryCache("advertiser");
      clearAdvertiserDashboardBootstrapPreload();
      const message =
        loginError instanceof Error
          ? translateApiErrorMessage(
            loginError.message,
            "광고주 계정으로 로그인할 수 없습니다.",
          )
          : "광고주 계정으로 로그인할 수 없습니다.";
      if (navigatedOptimistically && redirectAfterLogin) {
        navigate(`/login/advertiser?next=${encodeURIComponent(redirectAfterLogin)}`, {
          replace: true,
          state: { loginError: message },
        });
        return;
      }
      setError(message);
    } finally {
      if (!navigatedOptimistically) {
        setIsSubmitting(false);
      }
    }
  };

  useEffect(() => {
    if (consumedInitialAuthStateRef.current) return;
    if (!initialLoginError && !initialAuthNotice && !initialPrefillEmail) return;
    consumedInitialAuthStateRef.current = true;
    clearConsumedAuthNavigationState();
  }, [initialAuthNotice, initialLoginError, initialPrefillEmail]);

  const handleNoticeAction = () => {
    if (!authNotice) return;
    const rawNext = new URLSearchParams(location.search).get("next");
    const actionPath = appendSafeAuthNext(
      authNotice.actionPath,
      authNotice.code === "ACCOUNT_SETUP_INCOMPLETE"
        ? redirectAfterLogin
        : rawNext,
      authNotice.actualRole,
    );
    navigate(actionPath, {
      state: { prefillEmail: email.trim() },
    });
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#f4f5f2] px-4 py-3 font-sans text-neutral-950">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between">
          <BrandLogo />
          <span className="h-10 w-20 rounded-[10px] bg-white" />
        </div>
        <div className="mx-auto mt-4 max-w-[1500px] rounded-[12px] border border-neutral-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.035)]">
          <span className="sr-only">화면 준비 중</span>
          <div className="h-6 w-44 rounded bg-neutral-200" />
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="h-12 rounded-[10px] bg-neutral-100" />
            <div className="h-12 rounded-[10px] bg-neutral-100" />
            <div className="h-12 rounded-[10px] bg-neutral-100" />
          </div>
          <div className="mt-4 h-[55vh] rounded-[10px] bg-neutral-50" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (redirectUnauthenticated) {
      const currentPath = `${location.pathname}${location.search}`;
      return (
        <Navigate
          to={buildLoginRedirect("/login/advertiser", currentPath, "/advertiser/dashboard", [
            "/advertiser",
          ])}
          replace
        />
      );
    }

    return (
      <>
        <AuthLoginScreen
          title="광고주 로그인"
          description="계약 업무를 계속하려면 로그인하세요."
          fields={[
            {
              id: "email",
              label: "이메일",
              value: email,
              type: "email",
              autoComplete: "email",
              required: true,
              onChange: setEmail,
            },
            {
              id: "password",
              label: "비밀번호",
              value: password,
              type: "password",
              autoComplete: "current-password",
              placeholder: "비밀번호 입력",
              required: true,
              onChange: setPassword,
            },
          ]}
          submitLabel="로그인"
          isSubmitting={isSubmitting}
          error={authNotice ? "" : error}
          errorHint="이메일, 비밀번호, 광고주 계정 권한을 확인해 주세요. 계정이 없다면 아래에서 계정을 먼저 만들 수 있습니다."
          postSubmit={<AuthPasswordResetLink href="/reset-password?role=advertiser" />}
          belowCard={
            <AuthLoginQuickActions
              introHref="/intro/advertiser"
              signupHref="/signup/advertiser"
            />
          }
          onSubmit={handleSubmit}
        />
        <AuthAccountNoticeDialog
          notice={authNotice}
          onAction={handleNoticeAction}
          onClose={() => setAuthNotice(null)}
        />
      </>
    );
  }

  return <>{children}</>;
}
