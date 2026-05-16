import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import { buildLoginRedirect } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";
import { useAppStore } from "../../store";

type AdvertiserSessionResponse = {
  authenticated?: boolean;
  user?: {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    company_name?: string | null;
    verification_status?: string;
  };
  error?: string;
};

const advertiserLoginTrustBadges = [
  "사업자 인증 후 공유",
  "검토 링크 상태 기록",
  "서명 PDF·감사 이력",
];

const advertiserLoginProcessSummary = [
  {
    title: "인증 상태 확인",
    description: "승인된 광고주만 계약 공유 링크를 열 수 있습니다.",
  },
  {
    title: "계약과 검토 링크 관리",
    description: "초안, 승인, 수정 요청 상태를 한 곳에서 확인합니다.",
  },
  {
    title: "서명 증빙 보관",
    description: "완료된 계약은 PDF와 감사 이력으로 남깁니다.",
  },
];

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
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshContracts = useCallback(async () => {
    await hydrateContracts({ force: true });
  }, [hydrateContracts]);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const response = await apiFetch("/api/advertiser/session", {
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const data = (await response.json()) as AdvertiserSessionResponse;

        if (!cancelled && response.ok && data.authenticated === true) {
          setIsAuthenticated(true);
          await refreshContracts();
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [refreshContracts]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await apiFetch("/api/advertiser/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as AdvertiserSessionResponse;

      if (!response.ok || data.authenticated !== true) {
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "광고주 계정으로 로그인할 수 없습니다.",
          ),
        );
      }

      setIsAuthenticated(true);
      if (redirectAfterLogin) {
        void refreshContracts();
        navigate(redirectAfterLogin, { replace: true });
        return;
      }

      await refreshContracts();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? translateApiErrorMessage(
              loginError.message,
              "광고주 계정으로 로그인할 수 없습니다.",
            )
          : "광고주 계정으로 로그인할 수 없습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] font-sans">
        <div className="rounded-lg border border-neutral-200 bg-white px-5 py-4 text-[14px] font-semibold text-neutral-900 shadow-sm">
          광고주 세션 확인 중
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
        description="계약 공유 전 인증 상태와 서명 증빙을 확인합니다."
        trustBadges={advertiserLoginTrustBadges}
        processSummary={advertiserLoginProcessSummary}
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
        footer={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup/advertiser"
              className="text-[13px] font-semibold text-neutral-950 transition hover:text-neutral-600"
            >
              계정 만들기
            </Link>
            <span className="h-3 w-px bg-neutral-200" />
            <Link
              to="/reset-password?role=advertiser"
              className="text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
            >
              비밀번호 재설정
            </Link>
            <span className="h-3 w-px bg-neutral-200" />
            <Link
              to="/login"
              className="text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
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
