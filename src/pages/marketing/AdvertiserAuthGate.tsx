import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import {
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
};

const waitSoft = async <T,>(promise: Promise<T>, timeoutMs: number) => {
  await Promise.race([
    promise.then(() => undefined).catch(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
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
  const shouldShowLoginImmediately =
    Boolean(redirectAfterLogin) && !redirectUnauthenticated;
  const [isChecking, setIsChecking] = useState(
    !cachedSession && !shouldShowLoginImmediately,
  );
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(cachedSession));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialLoginError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshContracts = useCallback(async (options?: { force?: boolean }) => {
    await hydrateContracts(options);
  }, [hydrateContracts]);

  const preloadDashboard = useCallback(async () => {
    try {
      await preloadAdvertiserDashboardBootstrap();
    } catch (preloadError) {
      console.warn("[yeollock.me] advertiser dashboard preload failed", preloadError);
      await Promise.allSettled([
        preloadVerificationSummary("advertiser"),
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
    let cancelled = false;
    const hadCachedSession = Boolean(getAdvertiserSessionCache());

    if (shouldShowLoginImmediately && !hadCachedSession) {
      return () => {
        cancelled = true;
      };
    }

    const checkSession = async () => {
      try {
        const response = await apiFetch("/api/advertiser/session", {
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const data = (await response.json()) as AdvertiserSessionResponse;

        if (!cancelled && response.ok && data.authenticated === true) {
          rememberAdvertiserSession(data.user);
          if (location.pathname === "/advertiser/verification") {
            await waitSoft(preloadVerificationSummary("advertiser"), 900);
          }
          setIsAuthenticated(true);
          setIsChecking(false);
          preloadDashboardInBackground();
          return;
        }

        if (!cancelled) {
          clearAdvertiserSessionCache();
          clearVerificationSummaryCache("advertiser");
          setIsAuthenticated(false);
        }
      } catch {
        if (!cancelled && !hadCachedSession) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    const activateVerifiedCachedSession = () => {
      const latestCachedSession = getAdvertiserSessionCache();
      if (!latestCachedSession || cancelled) return false;
      setIsAuthenticated(true);
      setIsChecking(false);
      preloadDashboardInBackground();
      return true;
    };

    const timer = window.setTimeout(() => {
      const run = async () => {
        if (isFastLoginTransitionPending("advertiser")) {
          await waitForFastLoginTransition("advertiser", 2_500);
        }
        if (cancelled) return;

        if (activateVerifiedCachedSession()) {
          void checkSession();
          return;
        }

        await checkSession();
      };
      void run();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "광고주 계정으로 로그인할 수 없습니다.",
          ),
        );
      }

      if (!navigatedOptimistically) setIsAuthenticated(true);
      rememberAdvertiserSession(data.user);
      if (data.dashboard?.verification) {
        primeVerificationSummary("advertiser", data.dashboard.verification);
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
      if (redirectAfterLogin && !navigatedOptimistically) {
        navigate(redirectAfterLogin, { replace: true });
        return;
      }
    } catch (loginError) {
      finishFastLoginTransition("advertiser");
      clearAdvertiserSessionCache();
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
    if (!initialLoginError) return;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [initialLoginError, location.pathname, location.search, navigate]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#f4f5f2] px-4 py-3 font-sans text-neutral-950">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-[34px] w-[34px] rounded-[11px] bg-neutral-950 shadow-[0_8px_18px_rgba(15,23,42,0.12)]" />
            <span className="h-5 w-14 rounded bg-neutral-200" />
          </div>
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
        submitLabel="대시보드 열기"
        isSubmitting={isSubmitting}
        error={error}
        errorHint="이메일, 비밀번호, 광고주 계정 권한을 확인해 주세요. 계정이 없다면 아래에서 계정을 먼저 만들 수 있습니다."
        footer={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup/advertiser"
              className="inline-flex min-h-9 items-center text-[13px] font-semibold text-neutral-950 transition hover:text-neutral-600"
            >
              계정 만들기
            </Link>
            <span className="h-3 w-px bg-neutral-200" />
            <Link
              to="/reset-password?role=advertiser"
              className="inline-flex min-h-9 items-center text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
            >
              비밀번호 재설정
            </Link>
            <span className="h-3 w-px bg-neutral-200" />
            <Link
              to="/login"
              className="inline-flex min-h-9 items-center text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
            >
              돌아가기
            </Link>
          </div>
        }
        onSubmit={handleSubmit}
      />
    );
  }

  return <>{children}</>;
}
