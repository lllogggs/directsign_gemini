import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { getNextPath } from "../../domain/navigation";

export function InfluencerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = getNextPath(location.search, "/influencer/dashboard", [
    "/influencer",
    "/contract",
  ]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await apiFetch("/api/influencer/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as
        | { authenticated: true }
        | { error?: string };

      if (!response.ok || !("authenticated" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(errorMessage ?? "로그인에 실패했습니다.");
      }

      navigate(nextPath, { replace: true });
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "로그인에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLoginScreen
      title="인플루언서 로그인"
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
        <div className="flex items-center justify-center gap-3">
          <Link
            to={`/signup/influencer?next=${encodeURIComponent(nextPath)}`}
            className="text-[13px] font-semibold text-neutral-950 transition hover:text-neutral-600"
          >
            계정 만들기
          </Link>
          <span className="h-3 w-px bg-neutral-200" />
          <Link
            to="/login"
            className="text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
          >
            돌아가기
          </Link>
          <span className="sr-only">{PRODUCT_NAME}</span>
        </div>
      }
      onSubmit={handleSubmit}
    />
  );
}
