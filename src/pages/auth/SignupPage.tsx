import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";

const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";

type SignupRole = "advertiser" | "influencer";

type SignupResponse = {
  authenticated?: boolean;
  error?: string;
};

const roleConfig = {
  advertiser: {
    title: "광고주 계정 만들기",
    endpoint: "/api/advertiser/signup",
    nextPath: "/advertiser/verification",
    loginPath: "/login/advertiser",
  },
  influencer: {
    title: "인플루언서 계정 만들기",
    endpoint: "/api/influencer/signup",
    nextPath: "/influencer/verification",
    loginPath: "/login/influencer",
  },
} satisfies Record<SignupRole, {
  title: string;
  endpoint: string;
  nextPath: string;
  loginPath: string;
}>;

export function SignupPage({ role }: { role: SignupRole }) {
  const navigate = useNavigate();
  const config = roleConfig[role];
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}${config.endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          password,
          ...(role === "advertiser" ? { company_name: companyName } : {}),
        }),
      });
      const data = (await response.json()) as SignupResponse;

      if (!response.ok || data.authenticated !== true) {
        throw new Error(data.error ?? "계정을 만들 수 없습니다.");
      }

      navigate(config.nextPath, { replace: true });
    } catch (signupError) {
      setError(
        signupError instanceof Error
          ? signupError.message
          : "계정을 만들 수 없습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLoginScreen
      title={config.title}
      fields={[
        ...(role === "advertiser"
          ? [
              {
                id: "companyName",
                label: "회사명",
                value: companyName,
                type: "text" as const,
                autoComplete: "organization",
                required: true,
                onChange: setCompanyName,
              },
            ]
          : []),
        {
          id: "name",
          label: role === "advertiser" ? "담당자명" : "이름 또는 활동명",
          value: name,
          type: "text",
          autoComplete: "name",
          required: true,
          onChange: setName,
        },
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
          autoComplete: "new-password",
          placeholder: "영문과 숫자 포함 8자 이상",
          required: true,
          onChange: setPassword,
        },
      ]}
      submitLabel="계정 만들기"
      submittingLabel="생성 중"
      isSubmitting={isSubmitting}
      error={error}
      footer={
        <Link
          to={config.loginPath}
          className="text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
        >
          로그인으로 돌아가기
        </Link>
      }
      onSubmit={handleSubmit}
    />
  );
}
