import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AuthPasswordResetLink,
  AuthLoginQuickActions,
  AuthLoginScreen,
} from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import {
  finishFastLoginTransition,
  startFastLoginTransition,
} from "../../domain/fastLoginTransition";
import type { InfluencerDashboardResponse } from "../../domain/influencerDashboard";
import {
  preloadInfluencerDashboard,
  primeInfluencerDashboard,
} from "../../domain/influencerDashboardPreload";
import { getNextPath } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";

export function InfluencerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = getNextPath(location.search, "/influencer/dashboard", [
    "/influencer",
    "/contract",
  ]);
  const initialLoginError =
    typeof (location.state as { loginError?: unknown } | null)?.loginError ===
    "string"
      ? ((location.state as { loginError: string }).loginError)
      : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(initialLoginError);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    let navigatedOptimistically = false;

    try {
      const loginPromise = apiFetch("/api/influencer/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      navigatedOptimistically = true;
      startFastLoginTransition("influencer");
      navigate(nextPath, { replace: true });

      const response = await loginPromise;
      const data = (await response.json()) as
        | { authenticated: true; dashboard?: InfluencerDashboardResponse }
        | { error?: string };

      if (!response.ok || !("authenticated" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(
          translateApiErrorMessage(errorMessage, "로그인에 실패했습니다."),
        );
      }

      if ("dashboard" in data && data.dashboard) {
        primeInfluencerDashboard(data.dashboard);
      }
      const dashboardPreload =
        "dashboard" in data && data.dashboard
          ? undefined
          : preloadInfluencerDashboard().catch(() => undefined);
      finishFastLoginTransition("influencer");
      if (dashboardPreload) void dashboardPreload;
      if (!navigatedOptimistically) {
        navigate(nextPath, { replace: true });
      }
    } catch (loginError) {
      finishFastLoginTransition("influencer");
      const message =
        loginError instanceof Error
          ? translateApiErrorMessage(loginError.message, "로그인에 실패했습니다.")
          : "로그인에 실패했습니다.";
      if (navigatedOptimistically) {
        navigate(`/login/influencer?next=${encodeURIComponent(nextPath)}`, {
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

  return (
    <AuthLoginScreen
      title="인플루언서 로그인"
      description="받은 계약 화면으로 이동합니다."
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
      error={error}
      errorHint="이메일과 비밀번호를 확인해 주세요. 처음 받은 계약이라면 계정 만들기 후 같은 계약으로 돌아옵니다."
      postSubmit={<AuthPasswordResetLink href="/reset-password?role=influencer" />}
      belowCard={
        <>
          <AuthLoginQuickActions
            introHref="/intro/influencer"
            signupHref={`/signup/influencer?next=${encodeURIComponent(nextPath)}`}
          />
          <span className="sr-only">{PRODUCT_NAME}</span>
        </>
      }
      onSubmit={handleSubmit}
    />
  );
}
