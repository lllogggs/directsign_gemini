import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, MailCheck, ShieldCheck } from "lucide-react";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { PRODUCT_NAME } from "../../domain/brand";

const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";

type SignupRole = "advertiser" | "influencer";

type SignupResponse = {
  authenticated?: boolean;
  confirmation_required?: boolean;
  message?: string;
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
  const loginRedirectPath = `${config.loginPath}?next=${encodeURIComponent(config.nextPath)}`;
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setConfirmationEmail("");
    setConfirmationMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await fetch(`${API_BASE}${config.endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          email: normalizedEmail,
          password,
          ...(role === "advertiser" ? { company_name: companyName.trim() } : {}),
        }),
      });
      const data = (await response.json()) as SignupResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "계정을 만들 수 없습니다.");
      }

      if (data.confirmation_required) {
        setConfirmationEmail(normalizedEmail);
        setConfirmationMessage(
          data.message ??
            "인증 메일을 보냈습니다. 메일 링크를 누른 뒤 로그인해 주세요.",
        );
        return;
      }

      if (data.authenticated === true) {
        navigate(config.nextPath, { replace: true });
        return;
      }

      throw new Error(data.error ?? "계정을 만들 수 없습니다.");
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

  if (confirmationEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-5 py-8 font-sans text-neutral-950">
        <section className="w-full max-w-[420px] rounded-lg border border-neutral-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            </div>
            <p className="text-[17px] font-semibold leading-5 text-neutral-950">
              {PRODUCT_NAME}
            </p>
          </div>

          <div className="mt-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-950 text-white">
              <MailCheck className="h-5 w-5" strokeWidth={2} />
            </div>
            <h1 className="mt-5 text-[26px] font-semibold leading-tight tracking-normal text-neutral-950">
              이메일을 확인해 주세요
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-neutral-500">
              {confirmationMessage}
            </p>
          </div>

          <div className="mt-5 rounded-lg border border-neutral-200 bg-[#fafafa] px-4 py-3 text-[14px] font-semibold text-neutral-950">
            {confirmationEmail}
          </div>

          <div className="mt-6 space-y-3">
            <Link
              to={loginRedirectPath}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-5 text-[15px] font-semibold text-white transition hover:bg-neutral-800"
            >
              로그인하기
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => {
                setConfirmationEmail("");
                setConfirmationMessage("");
              }}
              className="flex h-11 w-full items-center justify-center rounded-lg border border-neutral-200 bg-white px-5 text-[14px] font-semibold text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
            >
              이메일 다시 입력
            </button>
          </div>

          <p className="mt-5 border-t border-neutral-100 pt-4 text-center text-[12px] font-medium leading-5 text-neutral-400">
            메일이 보이지 않으면 스팸함을 먼저 확인해 주세요.
          </p>
        </section>
      </main>
    );
  }

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
          to={loginRedirectPath}
          className="text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
        >
          로그인으로 돌아가기
        </Link>
      }
      onSubmit={handleSubmit}
    />
  );
}
