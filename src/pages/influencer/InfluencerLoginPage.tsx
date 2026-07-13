import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AuthPasswordResetLink,
  AuthLoginQuickActions,
  AuthLoginScreen,
  getGlobalCreatorAuthLocale,
  preserveAuthContext,
} from "../../components/AuthLoginScreen";
import type {
  AuthLoginChromeCopy,
  GlobalCreatorAuthLocale,
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

type GlobalCreatorLoginCopy = {
  lang: string;
  homeHref: string;
  title: string;
  descriptions: {
    dashboard: string;
    contract: string;
    campaign: string;
  };
  errorHints: {
    dashboard: string;
    contract: string;
    campaign: string;
  };
  emailLabel: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
  resetPasswordLabel: string;
  introLabel: string;
  signupLabel: string;
  errors: {
    generic: string;
    invalidCredentials: string;
    emailUnconfirmed: string;
    rateLimited: string;
  };
  chrome: AuthLoginChromeCopy;
};

const globalCreatorLoginCopies: Record<
  GlobalCreatorAuthLocale,
  GlobalCreatorLoginCopy
> = {
  en: {
    lang: "en",
    homeHref: "/en/creators",
    title: "Creator login",
    descriptions: {
      dashboard: "Log in to open your creator dashboard.",
      contract: "Log in to review your contract.",
      campaign: "Log in to continue your campaign application.",
    },
    errorHints: {
      dashboard: "You can reset your password below.",
      contract: "New here? Create an account to return to this contract.",
      campaign: "New here? Create an account to return to this campaign.",
    },
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    submitLabel: "Log in",
    submittingLabel: "Logging in",
    resetPasswordLabel: "Reset password",
    introLabel: "Overview",
    signupLabel: "Create account",
    errors: {
      generic: "Unable to log in. Please try again.",
      invalidCredentials: "Check your email and password.",
      emailUnconfirmed: "Open your confirmation email before logging in.",
      rateLimited: "Too many attempts. Please try again later.",
    },
    chrome: {
      homeLabel: `${PRODUCT_NAME} home`,
      otherLoginLabel: "Other login",
      legalNavLabel: "Legal",
      privacyLabel: "Privacy",
      termsLabel: "Terms",
      eSignLabel: "E-signing",
      supportLabel: "Support",
    },
  },
  ja: {
    lang: "ja",
    homeHref: "/ja/creators",
    title: "クリエイターログイン",
    descriptions: {
      dashboard: "ログインしてダッシュボードを開きます。",
      contract: "ログインして契約書を確認します。",
      campaign: "ログインしてキャンペーン応募を続けます。",
    },
    errorHints: {
      dashboard: "下のリンクからパスワードを再設定できます。",
      contract: "初めての方は、登録後に同じ契約へ戻れます。",
      campaign: "初めての方は、登録後に同じ募集へ戻れます。",
    },
    emailLabel: "メールアドレス",
    passwordLabel: "パスワード",
    passwordPlaceholder: "パスワードを入力",
    submitLabel: "ログイン",
    submittingLabel: "ログイン中",
    resetPasswordLabel: "パスワードを再設定",
    introLabel: "サービス紹介",
    signupLabel: "アカウント作成",
    errors: {
      generic: "ログインできませんでした。もう一度お試しください。",
      invalidCredentials: "メールアドレスまたはパスワードをご確認ください。",
      emailUnconfirmed: "確認メールを開いてからログインしてください。",
      rateLimited: "試行回数が多すぎます。時間をおいてお試しください。",
    },
    chrome: {
      homeLabel: `${PRODUCT_NAME} ホーム`,
      otherLoginLabel: "別のログイン",
      legalNavLabel: "法的文書",
      privacyLabel: "プライバシー",
      termsLabel: "利用規約",
      eSignLabel: "電子署名",
      supportLabel: "お問い合わせ",
    },
  },
  zh: {
    lang: "zh-CN",
    homeHref: "/zh/creators",
    title: "创作者登录",
    descriptions: {
      dashboard: "登录后打开创作者工作台。",
      contract: "登录后查看合同。",
      campaign: "登录后继续申请活动。",
    },
    errorHints: {
      dashboard: "可通过下方链接重设密码。",
      contract: "首次使用？注册后可返回此合同。",
      campaign: "首次使用？注册后可返回此活动。",
    },
    emailLabel: "邮箱",
    passwordLabel: "密码",
    passwordPlaceholder: "请输入密码",
    submitLabel: "登录",
    submittingLabel: "正在登录",
    resetPasswordLabel: "重设密码",
    introLabel: "服务介绍",
    signupLabel: "创建账号",
    errors: {
      generic: "无法登录，请重试。",
      invalidCredentials: "请检查邮箱和密码。",
      emailUnconfirmed: "请先打开确认邮件，再登录。",
      rateLimited: "尝试次数过多，请稍后再试。",
    },
    chrome: {
      homeLabel: `${PRODUCT_NAME} 首页`,
      otherLoginLabel: "其他登录",
      legalNavLabel: "法律信息",
      privacyLabel: "隐私政策",
      termsLabel: "服务条款",
      eSignLabel: "电子签名",
      supportLabel: "帮助",
    },
  },
};

function localizeGlobalLoginError(
  message: string | null | undefined,
  copy: GlobalCreatorLoginCopy,
) {
  const trimmed = message?.trim() ?? "";
  if (Object.values(copy.errors).includes(trimmed)) return trimmed;

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email not verified") ||
    trimmed.includes("이메일 인증")
  ) {
    return copy.errors.emailUnconfirmed;
  }
  if (
    normalized.includes("too many") ||
    trimmed.includes("시도가 너무 많") ||
    trimmed.includes("요청이 너무 많")
  ) {
    return copy.errors.rateLimited;
  }
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials") ||
    trimmed.includes("이메일 또는 비밀번호") ||
    trimmed.includes("이메일과 비밀번호")
  ) {
    return copy.errors.invalidCredentials;
  }

  return copy.errors.generic;
}

function appendGlobalCreatorContext(
  nextPath: string,
  locale: GlobalCreatorAuthLocale,
) {
  const nextUrl = new URL(nextPath, "https://yeollock.local");
  nextUrl.searchParams.set("locale", locale);
  nextUrl.searchParams.set("source", "global-creators");
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

export function InfluencerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const globalLocale = getGlobalCreatorAuthLocale(location.search);
  const globalCopy = globalLocale
    ? globalCreatorLoginCopies[globalLocale]
    : null;
  const nextPath = getNextPath(location.search, "/influencer/dashboard", [
    "/influencer",
    "/contract",
    "/campaigns",
  ]);
  const destinationPath = globalLocale
    ? appendGlobalCreatorContext(nextPath, globalLocale)
    : nextPath;
  const rawInitialLoginError =
    typeof (location.state as { loginError?: unknown } | null)?.loginError ===
    "string"
      ? ((location.state as { loginError: string }).loginError)
      : "";
  const initialLoginError =
    rawInitialLoginError && globalCopy
      ? localizeGlobalLoginError(rawInitialLoginError, globalCopy)
      : rawInitialLoginError;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(initialLoginError);
  const isCampaignContinuation = nextPath.startsWith("/campaigns/");
  const isContractContinuation = nextPath.startsWith("/contract/");
  const loginDescription = globalCopy
    ? isCampaignContinuation
      ? globalCopy.descriptions.campaign
      : isContractContinuation
        ? globalCopy.descriptions.contract
        : globalCopy.descriptions.dashboard
    : isCampaignContinuation
      ? "캠페인 신청 화면으로 이동합니다."
      : isContractContinuation
        ? "계약 화면으로 이동합니다."
        : "인플루언서 대시보드로 이동합니다.";
  const loginErrorHint = globalCopy
    ? isCampaignContinuation
      ? globalCopy.errorHints.campaign
      : isContractContinuation
        ? globalCopy.errorHints.contract
        : globalCopy.errorHints.dashboard
    : isCampaignContinuation
      ? "이메일과 비밀번호를 확인해 주세요. 처음 신청하는 캠페인이라면 계정 만들기 후 같은 모집글로 돌아옵니다."
      : "이메일과 비밀번호를 확인해 주세요. 처음 확인하는 1:1 계약이라면 계정 만들기 후 같은 계약으로 돌아옵니다.";
  const resolveLoginError = (message: string | null | undefined) =>
    globalCopy
      ? localizeGlobalLoginError(message, globalCopy)
      : translateApiErrorMessage(message, "로그인에 실패했습니다.");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    let navigatedOptimistically = false;
    const shouldNavigateOptimistically = !isCampaignContinuation;

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

      if (shouldNavigateOptimistically) {
        navigatedOptimistically = true;
        startFastLoginTransition("influencer");
        navigate(destinationPath, { replace: true });
      }

      const response = await loginPromise;
      const data = (await response.json()) as
        | { authenticated: true; dashboard?: InfluencerDashboardResponse }
        | { error?: string };

      if (!response.ok || !("authenticated" in data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        throw new Error(resolveLoginError(errorMessage));
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
      if (
        !navigatedOptimistically ||
        window.location.pathname !== destinationPath
      ) {
        navigate(destinationPath, { replace: true });
      }
    } catch (loginError) {
      finishFastLoginTransition("influencer");
      const message =
        loginError instanceof Error
          ? resolveLoginError(loginError.message)
          : resolveLoginError(undefined);
      if (navigatedOptimistically) {
        navigate(
          preserveAuthContext(
            `/login/influencer?next=${encodeURIComponent(nextPath)}`,
            location.search,
          ),
          {
            replace: true,
            state: { loginError: message },
          },
        );
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
      title={globalCopy?.title ?? "인플루언서 로그인"}
      lang={globalCopy?.lang}
      homeHref={globalCopy?.homeHref}
      chromeCopy={globalCopy?.chrome}
      description={loginDescription}
      fields={[
        {
          id: "email",
          label: globalCopy?.emailLabel ?? "이메일",
          value: email,
          type: "email",
          autoComplete: "email",
          required: true,
          onChange: setEmail,
        },
        {
          id: "password",
          label: globalCopy?.passwordLabel ?? "비밀번호",
          value: password,
          type: "password",
          autoComplete: "current-password",
          placeholder: globalCopy?.passwordPlaceholder ?? "비밀번호 입력",
          required: true,
          onChange: setPassword,
        },
      ]}
      submitLabel={globalCopy?.submitLabel ?? "로그인"}
      submittingLabel={globalCopy?.submittingLabel}
      isSubmitting={isSubmitting}
      error={error}
      errorHint={loginErrorHint}
      postSubmit={
        <AuthPasswordResetLink
          href="/reset-password?role=influencer"
          label={globalCopy?.resetPasswordLabel}
        />
      }
      belowCard={
        <>
          <AuthLoginQuickActions
            introHref={globalCopy?.homeHref ?? "/intro/influencer"}
            signupHref={`/signup/influencer?next=${encodeURIComponent(nextPath)}`}
            introLabel={globalCopy?.introLabel}
            signupLabel={globalCopy?.signupLabel}
          />
          <span className="sr-only">{PRODUCT_NAME}</span>
        </>
      }
      onSubmit={handleSubmit}
    />
  );
}
