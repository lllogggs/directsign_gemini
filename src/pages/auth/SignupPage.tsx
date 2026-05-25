import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, MailCheck, X } from "lucide-react";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { getNextPath } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";

const TERMS_DOCUMENT_VERSION = "2026-05-19";
const PRIVACY_POLICY_DOCUMENT_VERSION = "2026-05-06";

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
    endpoint: "/api/advertiser/signup",
    nextPath: "/advertiser/verification",
    loginPath: "/login/advertiser",
  },
  influencer: {
    title: "인플루언서 가입",
    endpoint: "/api/influencer/signup",
    nextPath: "/influencer/dashboard",
    loginPath: "/login/influencer",
  },
} satisfies Record<
  SignupRole,
  {
    title: string;
    endpoint: string;
    nextPath: string;
    loginPath: string;
  }
>;

export function SignupPage({ role }: { role: SignupRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const config = roleConfig[role];
  const allowedNextPrefixes =
    role === "influencer" ? ["/influencer", "/contract"] : ["/advertiser"];
  const nextPath = getNextPath(
    location.search,
    config.nextPath,
    allowedNextPrefixes,
  );
  const loginRedirectPath = `${config.loginPath}?next=${encodeURIComponent(nextPath)}`;
  const isContractContinuationSignup =
    role === "influencer" && nextPath.startsWith("/contract/");
  const signupSubmitLabel = isContractContinuationSignup
    ? "가입하고 계약으로 돌아가기"
    : "가입하기";
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
  const [openLegalDocument, setOpenLegalDocument] = useState<
    "terms" | "privacy" | null
  >(null);
  const requiredConsentsAccepted = consents.terms && consents.privacy;
  const influencerCategorySelected = activityCategories.length > 0;
  const influencerPlatformSelected = activityPlatforms.length > 0;
  const influencerRequiredProfileComplete =
    role !== "influencer" ||
    (influencerCategorySelected && influencerPlatformSelected);
  const canSubmitSignup =
    requiredConsentsAccepted && influencerRequiredProfileComplete;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setConfirmationEmail("");
    setConfirmationMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!requiredConsentsAccepted) {
        throw new Error(
          "회원가입에는 이용약관과 개인정보 처리방침 필수 동의가 필요합니다.",
        );
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
          terms_version: TERMS_DOCUMENT_VERSION,
          privacy_policy_version: PRIVACY_POLICY_DOCUMENT_VERSION,
          ...(role === "advertiser"
            ? { company_name: companyName.trim() }
            : {}),
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
        throw new Error(
          translateApiErrorMessage(data.error, "계정을 만들 수 없습니다."),
        );
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

      throw new Error(
        translateApiErrorMessage(data.error, "계정을 만들 수 없습니다."),
      );
    } catch (signupError) {
      setError(
        signupError instanceof Error
          ? translateApiErrorMessage(
              signupError.message,
              "계정을 만들 수 없습니다.",
            )
          : "계정을 만들 수 없습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmationEmail) {
    return (
      <main className="min-h-screen bg-[#f5f7f2] px-5 pb-5 pt-0 font-sans text-[#141714] sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-20px)] w-full max-w-[1500px] flex-col">
          <header className="flex h-14 items-center justify-between 2xl:px-6">
            <Link
              to="/"
              aria-label={`${PRODUCT_NAME} 홈`}
              className="yl-brand-action -ml-1 inline-flex items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
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
    <>
      <AuthLoginScreen
        title={config.title}
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
        submitLabel={signupSubmitLabel}
        submittingLabel="생성 중"
        submitDisabled={!canSubmitSignup}
        isSubmitting={isSubmitting}
        error={error}
        showLegalFooter={false}
        showOtherLoginLink={false}
        footer={
          <Link
            to={loginRedirectPath}
            className="inline-flex min-h-8 items-center text-[13px] font-semibold text-[#59605b] transition hover:text-neutral-950 sm:min-h-10"
          >
            이미 계정이 있으면 로그인하기
          </Link>
        }
        onSubmit={handleSubmit}
      >
        {role === "influencer" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SignupSelectField
              label="활동 분야"
              value={activityCategories[0] ?? ""}
              options={INFLUENCER_CATEGORY_OPTIONS}
              disabled={isSubmitting}
              onChange={(value) =>
                setActivityCategories(
                  value ? [value as InfluencerActivityCategory] : [],
                )
              }
            />
            <SignupSelectField
              label="대표 플랫폼"
              value={activityPlatforms[0] ?? ""}
              options={INFLUENCER_PLATFORM_OPTIONS}
              disabled={isSubmitting}
              onChange={(value) =>
                setActivityPlatforms(
                  value ? [value as InfluencerSignupPlatform] : [],
                )
              }
            />
          </div>
        ) : null}

        <SignupConsentPanel
          consents={consents}
          disabled={isSubmitting}
          onOpenDocument={setOpenLegalDocument}
          onToggle={(key) =>
            setConsents((current) => ({ ...current, [key]: !current[key] }))
          }
        />
      </AuthLoginScreen>
      <LegalConsentModal
        document={openLegalDocument}
        onClose={() => setOpenLegalDocument(null)}
      />
    </>
  );
}

function SignupSelectField<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T | "";
  options: readonly { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T | "") => void;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold text-neutral-700">
        {label}
      </span>
      <select
        value={value}
        required
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T | "")}
        className="mt-1.5 h-10 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-3 text-[14px] font-semibold text-neutral-950 outline-none transition hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)] disabled:bg-neutral-100 disabled:text-neutral-400 sm:mt-2 sm:h-11"
      >
        <option value="">선택</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SignupConsentPanel({
  consents,
  disabled,
  onOpenDocument,
  onToggle,
}: {
  consents: SignupConsents;
  disabled: boolean;
  onOpenDocument: (document: keyof SignupConsents) => void;
  onToggle: (key: keyof SignupConsents) => void;
}) {
  return (
    <section className="grid gap-1 rounded-[10px] border border-neutral-200 bg-[#fbfaf7] px-3 py-2">
      <ConsentCheckbox
        checked={consents.terms}
        disabled={disabled}
        document="terms"
        title="이용약관 동의"
        version={TERMS_DOCUMENT_VERSION}
        onOpenDocument={onOpenDocument}
        onToggle={() => onToggle("terms")}
      />
      <ConsentCheckbox
        checked={consents.privacy}
        disabled={disabled}
        document="privacy"
        title="개인정보 처리방침 동의"
        version={PRIVACY_POLICY_DOCUMENT_VERSION}
        onOpenDocument={onOpenDocument}
        onToggle={() => onToggle("privacy")}
      />
    </section>
  );
}

function ConsentCheckbox({
  checked,
  disabled,
  document,
  title,
  version,
  onOpenDocument,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  document: keyof SignupConsents;
  title: string;
  version: string;
  onOpenDocument: (document: keyof SignupConsents) => void;
  onToggle: () => void;
}) {
  const checkboxId = `signup-consent-${document}`;

  return (
    <div className="flex min-h-8 items-center gap-2 rounded-[8px] px-1 py-1 transition hover:bg-white">
      <input
        id={checkboxId}
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-[#2563eb]"
        checked={checked}
        disabled={disabled}
        required
        onChange={onToggle}
      />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <label
          htmlFor={checkboxId}
          className="block cursor-pointer truncate text-[12px] font-bold text-neutral-900"
        >
          {title}
        </label>
        <span className="shrink-0 text-[10px] font-semibold text-neutral-400">
          v{version}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onOpenDocument(document)}
        className="inline-flex h-7 shrink-0 items-center rounded-[7px] border border-neutral-200 bg-white px-2.5 text-[11px] font-bold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
      >
        보기
      </button>
    </div>
  );
}

function LegalConsentModal({
  document,
  onClose,
}: {
  document: keyof SignupConsents | null;
  onClose: () => void;
}) {
  if (!document) {
    return null;
  }

  const content =
    document === "terms"
      ? {
          title: "이용약관",
          version: TERMS_DOCUMENT_VERSION,
          href: "/terms",
          items: [
            "연락미 계정 생성과 서비스 이용 조건을 확인합니다.",
            "계약 작성, 검토 링크, 전자서명 증빙의 기본 책임 범위를 확인합니다.",
            "현재 가입과 기본 서비스 이용은 무료입니다. 향후 일부 또는 전체 기능이 유료로 전환될 수 있으며, 전환 전 안내합니다.",
          ],
        }
      : {
          title: "개인정보 처리방침",
          version: PRIVACY_POLICY_DOCUMENT_VERSION,
          href: "/privacy",
          items: [
            "계정 생성과 계약 진행에 필요한 정보만 수집합니다.",
            "계약 당사자 확인, 서명 증빙, 알림 제공 목적으로 사용합니다.",
            "보관 기간과 제공 기준은 처리방침 문서에서 확인할 수 있습니다.",
          ],
        };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/35 px-4 py-6 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-consent-modal-title"
        className="w-full max-w-[520px] overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div>
            <h2
              id="legal-consent-modal-title"
              className="font-neo-heavy text-[22px] leading-tight tracking-normal text-neutral-950"
            >
              {content.title}
            </h2>
            <p className="mt-1 text-[12px] font-bold text-neutral-400">
              v{content.version}
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-neutral-200 bg-[#fbfaf7] text-neutral-500 transition hover:bg-white hover:text-neutral-950"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-5">
          <ul className="space-y-2.5 text-[14px] font-semibold leading-6 text-neutral-700">
            {content.items.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-950" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link
              to={content.href}
              target="_blank"
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-neutral-200 bg-white px-4 text-[13px] font-bold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
            >
              전체 문서 열기
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-neutral-950 px-5 text-[13px] font-bold text-white transition hover:bg-neutral-800"
            >
              확인
            </button>
          </div>
        </div>
      </section>
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
