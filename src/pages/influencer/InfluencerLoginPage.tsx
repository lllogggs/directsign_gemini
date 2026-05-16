import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { getNextPath } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";

const influencerLoginTrustBadges = [
  "계약 조건 확인",
  "수정 요청 기록",
  "서명 PDF 확인",
];

const influencerLoginProcessSummary = [
  {
    title: "받은 계약 확인",
    description: "광고 조건, 일정, 금액을 링크에서 다시 확인합니다.",
  },
  {
    title: "수정 요청",
    description: "필요한 변경 사항은 계약 기록에 남깁니다.",
  },
  {
    title: "전자서명",
    description: "완료 후 PDF와 서명 이력을 확인합니다.",
  },
];

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
        throw new Error(
          translateApiErrorMessage(errorMessage, "로그인에 실패했습니다."),
        );
      }

      navigate(nextPath, { replace: true });
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? translateApiErrorMessage(loginError.message, "로그인에 실패했습니다.")
          : "로그인에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLoginScreen
      title="인플루언서 로그인"
      description="받은 계약의 조건, 수정 요청, 서명 이력을 확인합니다."
      trustBadges={influencerLoginTrustBadges}
      processSummary={influencerLoginProcessSummary}
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
            to={`/signup/influencer?next=${encodeURIComponent(nextPath)}`}
            className="text-[13px] font-semibold text-neutral-950 transition hover:text-neutral-600"
          >
            계정 만들기
          </Link>
          <span className="h-3 w-px bg-neutral-200" />
          <Link
            to="/reset-password?role=influencer"
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
          <span className="sr-only">{PRODUCT_NAME}</span>
        </div>
      }
      onSubmit={handleSubmit}
    />
  );
}
