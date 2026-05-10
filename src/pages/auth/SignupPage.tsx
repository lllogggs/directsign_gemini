import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Check, MailCheck } from "lucide-react";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { getNextPath } from "../../domain/navigation";

const LEGAL_DOCUMENT_VERSION = "2026-05-06";

type SignupRole = "advertiser" | "influencer";

type SignupResponse = {
  authenticated?: boolean;
  confirmation_required?: boolean;
  message?: string;
  error?: string;
};

const INFLUENCER_CATEGORY_OPTIONS = [
  { value: "mukbang", label: "먹방" },
  { value: "travel", label: "여행" },
  { value: "beauty", label: "뷰티" },
  { value: "fashion", label: "패션" },
  { value: "fitness", label: "운동/건강" },
  { value: "tech", label: "IT/테크" },
  { value: "game", label: "게임" },
  { value: "education", label: "교육" },
  { value: "lifestyle", label: "라이프스타일" },
  { value: "finance", label: "경제/재테크" },
] as const;

const INFLUENCER_PLATFORM_OPTIONS = [
  { value: "instagram", label: "인스타그램" },
  { value: "youtube", label: "유튜브" },
  { value: "tiktok", label: "틱톡" },
  { value: "naver_blog", label: "네이버 블로그" },
  { value: "other", label: "기타" },
] as const;

type InfluencerActivityCategory =
  (typeof INFLUENCER_CATEGORY_OPTIONS)[number]["value"];
type InfluencerSignupPlatform =
  (typeof INFLUENCER_PLATFORM_OPTIONS)[number]["value"];

type SignupConsents = {
  terms: boolean;
  privacy: boolean;
};

const roleConfig = {
  advertiser: {
    title: "광고주 가입",
    description: "계약 작성과 공유를 시작합니다.",
    endpoint: "/api/advertiser/signup",
    nextPath: "/advertiser/verification",
    loginPath: "/login/advertiser",
  },
  influencer: {
    title: "인플루언서 가입",
    description: "받은 계약을 검토하고 서명합니다.",
    endpoint: "/api/influencer/signup",
    nextPath: "/influencer/dashboard",
    loginPath: "/login/influencer",
  },
} satisfies Record<SignupRole, {
  title: string;
  description: string;
  endpoint: string;
  nextPath: string;
  loginPath: string;
}>;

export function SignupPage({ role }: { role: SignupRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const config = roleConfig[role];
  const allowedNextPrefixes =
    role === "influencer" ? ["/influencer", "/contract"] : ["/advertiser"];
  const nextPath = getNextPath(location.search, config.nextPath, allowedNextPrefixes);
  const loginRedirectPath = `${config.loginPath}?next=${encodeURIComponent(nextPath)}`;
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activityCategories, setActivityCategories] = useState<
    InfluencerActivityCategory[]
  >([]);
  const [activityPlatforms, setActivityPlatforms] = useState<
    InfluencerSignupPlatform[]
  >([]);
  const [consents, setConsents] = useState<SignupConsents>({
    terms: false,
    privacy: false,
  });
  const [error, setError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requiredConsentsAccepted = consents.terms && consents.privacy;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setConfirmationEmail("");
    setConfirmationMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!requiredConsentsAccepted) {
        throw new Error("회원가입에는 이용약관과 개인정보 처리방침 필수 동의가 필요합니다.");
      }

      if (
        role === "influencer" &&
        (activityCategories.length === 0 || activityPlatforms.length === 0)
      ) {
        throw new Error("활동 분야와 플랫폼을 각각 하나 이상 선택해 주세요.");
      }

      const response = await apiFetch(config.endpoint, {
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
          terms_accepted: consents.terms,
          privacy_accepted: consents.privacy,
          terms_version: LEGAL_DOCUMENT_VERSION,
          privacy_policy_version: LEGAL_DOCUMENT_VERSION,
          ...(role === "advertiser" ? { company_name: companyName.trim() } : {}),
          ...(role === "influencer"
            ? {
                activity_categories: activityCategories,
                activity_platforms: activityPlatforms,
              }
            : {}),
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
        navigate(nextPath, { replace: true });
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
      <main className="min-h-screen bg-[#f5f7f2] px-5 py-5 font-sans text-[#141714] sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-[1040px] flex-col">
          <header className="flex h-14 items-center justify-between">
            <Link
              to="/"
              aria-label={`${PRODUCT_NAME} 홈`}
              className="inline-flex items-center gap-2.5"
            >
              <SignupLogoMark />
              <span className="font-neo-heavy text-[18px] leading-none tracking-[-0.045em] text-neutral-950">
                {PRODUCT_NAME}
              </span>
            </Link>
          </header>

          <section className="grid flex-1 place-items-center py-8">
            <div className="w-full max-w-[460px] rounded-[18px] border border-[#d8ded4] bg-white/95 p-6 shadow-[0_1px_0_rgba(255,255,255,0.8),0_26px_70px_rgba(20,23,20,0.10)] sm:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#2563eb] text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)]">
                <MailCheck className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="mt-6">
                <h1 className="font-neo-heavy text-[28px] leading-tight tracking-[-0.035em] text-[#141714]">
                  이메일을 확인해 주세요
                </h1>
                <p className="mt-2 text-[14px] font-medium leading-6 text-[#59605b]">
                  {confirmationMessage}
                </p>
              </div>

              <div className="mt-5 rounded-[10px] border border-[#d8ded4] bg-[#fbfcfa] px-4 py-3 text-[14px] font-semibold text-[#141714]">
                {confirmationEmail}
              </div>

              <div className="mt-6 space-y-3">
                <Link
                  to={loginRedirectPath}
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[15px] font-semibold text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-[#1d4ed8]"
                >
                  로그인하기
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmationEmail("");
                    setConfirmationMessage("");
                  }}
                  className="flex h-11 w-full items-center justify-center rounded-[10px] border border-[#d8ded4] bg-white px-5 text-[14px] font-semibold text-[#59605b] transition hover:border-neutral-400 hover:text-neutral-950"
                >
                  이메일 다시 입력
                </button>
              </div>

              <p className="mt-5 border-t border-[#edf0ea] pt-4 text-center text-[12px] font-semibold leading-5 text-[#7d887f]">
                메일이 보이지 않으면 스팸함과 프로모션함을 먼저 확인해 주세요.
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <AuthLoginScreen
      title={config.title}
      description={config.description}
      fields={[
        ...(role === "advertiser"
          ? [
              {
                id: "companyName",
                label: "회사명 또는 브랜드명",
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
          placeholder: "영문과 숫자를 포함해 8자 이상",
          required: true,
          onChange: setPassword,
        },
      ]}
      submitLabel="가입하기"
      submittingLabel="생성 중"
      submitDisabled={!requiredConsentsAccepted}
      isSubmitting={isSubmitting}
      error={error}
      footer={
        <Link
          to={loginRedirectPath}
            className="text-[13px] font-semibold text-[#59605b] transition hover:text-neutral-950"
        >
          이미 계정이 있으면 로그인하기
        </Link>
      }
      onSubmit={handleSubmit}
    >
      {role === "influencer" ? (
        <>
          <MultiSelectGroup
            label="활동 분야"
            options={INFLUENCER_CATEGORY_OPTIONS}
            selectedValues={activityCategories}
            disabled={isSubmitting}
            onToggle={(value) =>
              setActivityCategories((current) => toggleValue(current, value))
            }
          />
          <MultiSelectGroup
            label="활동 플랫폼"
            options={INFLUENCER_PLATFORM_OPTIONS}
            selectedValues={activityPlatforms}
            disabled={isSubmitting}
            onToggle={(value) =>
              setActivityPlatforms((current) => toggleValue(current, value))
            }
          />
        </>
      ) : null}

      <SignupConsentPanel
        consents={consents}
        disabled={isSubmitting}
        onToggle={(key) =>
          setConsents((current) => ({ ...current, [key]: !current[key] }))
        }
      />
    </AuthLoginScreen>
  );
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}

function MultiSelectGroup<T extends string>({
  label,
  options,
  selectedValues,
  disabled,
  onToggle,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  selectedValues: T[];
  disabled: boolean;
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-semibold text-[#303630]">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValues.includes(option.value);

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onToggle(option.value)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "border-[#2563eb] bg-[#2563eb] text-white"
                  : "border-[#d8ded4] bg-[#fbfcfa] text-[#59605b] hover:border-neutral-400 hover:bg-white hover:text-neutral-950"
              }`}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SignupConsentPanel({
  consents,
  disabled,
  onToggle,
}: {
  consents: SignupConsents;
  disabled: boolean;
  onToggle: (key: keyof SignupConsents) => void;
}) {
  return (
    <section className="rounded-[12px] border border-[#d8ded4] bg-[#fbfcfa] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#141714]">
            필수 약관 및 개인정보 동의
          </p>
          <p className="mt-1 text-[12px] font-medium leading-5 text-[#7d887f]">
            가입, 인증, 계약 작성, 전자서명 증빙 보관에 필요한 내용을 확인하고 동의해야 합니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#d8ded4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#7d887f]">
          v{LEGAL_DOCUMENT_VERSION}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <ConsentCheckbox
          checked={consents.terms}
          disabled={disabled}
          title="이용약관 필수 동의"
          description="서비스 범위, 계약 내용 책임, 미보증, 광고주 인증 후 공유 제한, 대금·세금·정산 비취급, 전자서명 증빙 기준을 확인했습니다."
          linkTo="/terms"
          linkLabel="약관 보기"
          onToggle={() => onToggle("terms")}
        />
        <ConsentCheckbox
          checked={consents.privacy}
          disabled={disabled}
          title="개인정보 처리방침 필수 동의"
          description="수집 항목, 이용 목적, 보유 기간, 계약 당사자 간 제공, 권리 행사, 파기 및 보안 조치를 확인했습니다."
          linkTo="/privacy"
          linkLabel="개인정보 보기"
          onToggle={() => onToggle("privacy")}
        />
      </div>
    </section>
  );
}

function ConsentCheckbox({
  checked,
  disabled,
  title,
  description,
  linkTo,
  linkLabel,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  title: string;
  description: string;
  linkTo: string;
  linkLabel: string;
  onToggle: () => void;
}) {
  const checkboxId = `signup-consent-${linkTo.replace(/[^a-z0-9]/gi, "-")}`;

  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-[#d8ded4] bg-white p-3 transition hover:border-neutral-400">
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[#2563eb]"
        checked={checked}
        disabled={disabled}
        required
        onChange={onToggle}
      />
      <span className="min-w-0">
        <label
          htmlFor={checkboxId}
          className="block cursor-pointer text-[13px] font-semibold text-[#141714]"
        >
          {title}
        </label>
        <span className="mt-1 block text-[12px] font-medium leading-5 text-[#7d887f]">
          {description}
        </span>
        <Link
          to={linkTo}
          target="_blank"
          className="mt-2 inline-flex text-[12px] font-semibold text-[#2563eb] underline underline-offset-4"
        >
          {linkLabel}
        </Link>
      </span>
    </div>
  );
}

function SignupLogoMark() {
  return (
    <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
      <svg
        aria-hidden="true"
        className="h-[23px] w-[23px]"
        fill="none"
        viewBox="0 0 32 32"
      >
        <circle cx="9.8" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="22.2" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
        <circle cx="16" cy="22" r="3" fill="currentColor" opacity="0.96" />
        <path
          d="M12.1 12.8 16 19.1l3.9-6.3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.1"
        />
      </svg>
    </span>
  );
}
