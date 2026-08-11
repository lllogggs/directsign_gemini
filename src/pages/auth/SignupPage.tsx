import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ArrowRight, MailCheck, X } from "lucide-react";
import {
  AuthLoginScreen,
  getGlobalCreatorAuthLocale,
  preserveAuthContext,
} from "../../components/AuthLoginScreen";
import type {
  AuthLoginChromeCopy,
  GlobalCreatorAuthLocale,
} from "../../components/AuthLoginScreen";
import { BrandLogo } from "../../components/BrandLogo";
import { readAuthPrefillEmail } from "../../components/AuthAccountNoticeDialog";
import { apiFetch } from "../../domain/api";
import {
  PUBLIC_PROFILE_CONSENT_VERSION,
  parseRepresentativeActivityPage,
} from "../../domain/activityPage";
import { PRODUCT_NAME } from "../../domain/brand";
import { LEGAL_CONTACT_EMAIL } from "../../domain/legalEntity";
import { getNextPath } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

const TERMS_DOCUMENT_VERSION = "2026-06-02";
const PRIVACY_POLICY_DOCUMENT_VERSION = "2026-08-11.2";

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

const creatorProfileSetupCopies = {
  ko: {
    activityPageLabel: "대표 활동 페이지",
    activityPagePlaceholder: "https://instagram.com/creator",
    activityPageHint: "가입 후 계정 인증에 그대로 사용합니다.",
    inferredLabel: "플랫폼 자동 확인",
    manualPlatformLabel: "플랫폼",
    manualHandleLabel: "계정 ID",
    manualHandlePlaceholder: "@ 없이 입력",
    publicProfileConsentTitle: "최소 공개 프로필 생성에 동의",
    publicProfileConsentNote:
      "이메일 확인 후 활동명, 분야, 대표 활동 페이지가 공개됩니다. 계정 인증 전에는 팔로워 수와 1:1 계약 제안이 표시되지 않습니다.",
    requiredProfile: "활동 분야와 대표 활동 페이지를 확인해 주세요.",
  },
  en: {
    activityPageLabel: "Main activity page",
    activityPagePlaceholder: "https://instagram.com/creator",
    activityPageHint: "We will reuse this page for account verification.",
    inferredLabel: "Platform detected",
    manualPlatformLabel: "Platform",
    manualHandleLabel: "Account ID",
    manualHandlePlaceholder: "Enter without @",
    publicProfileConsentTitle: "Create my minimal public profile",
    publicProfileConsentNote:
      "After email confirmation, your creator name, category, and activity page become public. Metrics and 1:1 proposals stay hidden until account verification.",
    requiredProfile: "Choose a category and enter a valid activity page.",
  },
  ja: {
    activityPageLabel: "代表活動ページ",
    activityPagePlaceholder: "https://instagram.com/creator",
    activityPageHint: "登録後のアカウント認証にも使用します。",
    inferredLabel: "プラットフォームを確認しました",
    manualPlatformLabel: "プラットフォーム",
    manualHandleLabel: "アカウントID",
    manualHandlePlaceholder: "@なしで入力",
    publicProfileConsentTitle: "最小公開プロフィールを作成する",
    publicProfileConsentNote:
      "メール確認後、活動名・ジャンル・代表ページが公開されます。認証前は指標と1:1契約提案を表示しません。",
    requiredProfile: "活動ジャンルと代表活動ページを確認してください。",
  },
  zh: {
    activityPageLabel: "主要创作主页",
    activityPagePlaceholder: "https://instagram.com/creator",
    activityPageHint: "注册后将直接用于账号认证。",
    inferredLabel: "已识别平台",
    manualPlatformLabel: "平台",
    manualHandleLabel: "账号 ID",
    manualHandlePlaceholder: "请勿输入 @",
    publicProfileConsentTitle: "创建最小公开主页",
    publicProfileConsentNote:
      "邮箱确认后将公开创作者名称、领域和主要主页。账号认证前不会显示指标或1:1合同提案。",
    requiredProfile: "请选择内容领域并填写有效的主要主页。",
  },
} as const;

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

type SignupConsentCopy = {
  termsTitle: string;
  privacyTitle: string;
  recordNote: string;
  viewLabel: string;
  closeLabel: string;
  openDocumentLabel: string;
  confirmLabel: string;
  terms: {
    title: string;
    items: string[];
  };
  privacy: {
    title: string;
    items: string[];
  };
};

type GlobalCreatorSignupCopy = {
  lang: string;
  homeHref: string;
  title: string;
  nameLabel: string;
  emailLabel: string;
  passwordLabel: string;
  passwordConfirmationLabel: string;
  passwordPlaceholder: string;
  categoryLabel: string;
  platformLabel: string;
  selectLabel: string;
  submitLabel: string;
  contractSubmitLabel: string;
  campaignSubmitLabel: string;
  submittingLabel: string;
  loginPrompt: string;
  categoryOptions: Record<InfluencerActivityCategory, string>;
  platformOptions: Record<InfluencerSignupPlatform, string>;
  errors: {
    requiredConsents: string;
    requiredProfile: string;
    invalidEmail: string;
    passwordLength: string;
    passwordFormat: string;
    passwordConfirmationRequired: string;
    passwordMismatch: string;
    nameRequired: string;
    invalidActivity: string;
    emailInUse: string;
    unavailable: string;
    rateLimited: string;
    fallback: string;
  };
  confirmation: {
    title: string;
    message: string;
    loginLabel: string;
    editEmailLabel: string;
    inboxHint: string;
  };
  consent: SignupConsentCopy;
  chrome: AuthLoginChromeCopy;
};

const koreanSignupConsentCopy: SignupConsentCopy = {
  termsTitle: "이용약관 동의",
  privacyTitle: "개인정보 처리방침 동의",
  recordNote: "동의 일시와 문서 버전이 저장됩니다. 문의:",
  viewLabel: "보기",
  closeLabel: "닫기",
  openDocumentLabel: "전체 문서 열기",
  confirmLabel: "확인",
  terms: {
    title: "이용약관",
    items: [
      "연락미 계정 생성과 서비스 이용 조건을 확인합니다.",
      "계약 작성, 검토 링크, 전자서명 증빙의 기본 책임 범위를 확인합니다.",
      "광고비 지급, 정산, 환불, 세금 처리는 계약 당사자 간 처리합니다.",
      "현재 가입과 기본 서비스 이용은 무료입니다. 향후 일부 또는 전체 기능이 유료로 전환될 수 있으며, 전환 전 안내합니다.",
    ],
  },
  privacy: {
    title: "개인정보 처리방침",
    items: [
      "계정 생성과 계약 진행에 필요한 정보만 수집합니다.",
      "계약 당사자 확인, 서명 증빙, 알림 제공 목적으로 사용합니다.",
      "보관 기간과 제공 기준은 처리방침 문서에서 확인할 수 있습니다.",
    ],
  },
};

const globalCreatorSignupCopies: Record<
  GlobalCreatorAuthLocale,
  GlobalCreatorSignupCopy
> = {
  en: {
    lang: "en",
    homeHref: "/en/creators",
    title: "Create a creator account",
    nameLabel: "Name or creator name",
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordConfirmationLabel: "Confirm password",
    passwordPlaceholder: "8+ characters with letters and numbers",
    categoryLabel: "Primary category",
    platformLabel: "Main platform",
    selectLabel: "Select",
    submitLabel: "Create account",
    contractSubmitLabel: "Sign up and return to contract",
    campaignSubmitLabel: "Sign up and return to campaign",
    submittingLabel: "Creating account",
    loginPrompt: "Already have an account? Log in",
    categoryOptions: {
      mukbang: "Food & mukbang",
      travel: "Travel",
      beauty: "Beauty",
      fashion: "Fashion",
      fitness: "Fitness & wellness",
      tech: "Tech",
      game: "Gaming",
      education: "Education",
      lifestyle: "Lifestyle",
      finance: "Finance",
    },
    platformOptions: {
      instagram: "Instagram",
      youtube: "YouTube",
      tiktok: "TikTok",
      naver_blog: "Naver Blog",
      other: "Other",
    },
    errors: {
      requiredConsents: "Agree to the Terms and Privacy Policy to continue.",
      requiredProfile: "Select a category and platform.",
      invalidEmail: "Enter a valid email address.",
      passwordLength: "Use at least 8 characters for your password.",
      passwordFormat: "Include both letters and numbers in your password.",
      passwordConfirmationRequired: "Re-enter your password.",
      passwordMismatch: "Passwords do not match.",
      nameRequired: "Enter your name or creator name.",
      invalidActivity: "Select a valid category and platform.",
      emailInUse:
        "This email may already be registered. Log in or check for a confirmation email.",
      unavailable: "Account creation is unavailable right now.",
      rateLimited: "Too many attempts. Please try again later.",
      fallback: "Unable to create your account. Please try again.",
    },
    confirmation: {
      title: "Check your email",
      message:
        "We sent a confirmation email. Open the link, then log in to 연락미.",
      loginLabel: "Log in",
      editEmailLabel: "Change email",
      inboxHint: "If it is missing, check your spam and promotions folders.",
    },
    consent: {
      termsTitle: "Agree to Terms",
      privacyTitle: "Agree to Privacy Policy",
      recordNote: "Consent time and document version are saved. Contact:",
      viewLabel: "View",
      closeLabel: "Close",
      openDocumentLabel: "Open full document",
      confirmLabel: "Done",
      terms: {
        title: "Terms of Service",
        items: [
          "Review the terms for creating a 연락미 account and using the service.",
          "연락미 supports contract drafting, review links, e-signatures, and evidence storage.",
          "Ad fees, payouts, refunds, and taxes are handled between the contracting parties.",
          "Signup and core features are currently free. We will give notice before any paid transition.",
        ],
      },
      privacy: {
        title: "Privacy Policy",
        items: [
          "We collect only the information needed to create your account and manage contracts.",
          "It is used to identify contracting parties, keep signature evidence, and send notices.",
          "Retention and sharing details are available in the full Privacy Policy.",
        ],
      },
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
    title: "クリエイター登録",
    nameLabel: "名前または活動名",
    emailLabel: "メールアドレス",
    passwordLabel: "パスワード",
    passwordConfirmationLabel: "パスワード（確認）",
    passwordPlaceholder: "英字と数字を含む8文字以上",
    categoryLabel: "活動ジャンル",
    platformLabel: "メインプラットフォーム",
    selectLabel: "選択",
    submitLabel: "アカウント作成",
    contractSubmitLabel: "登録して契約に戻る",
    campaignSubmitLabel: "登録して募集に戻る",
    submittingLabel: "作成中",
    loginPrompt: "アカウントをお持ちの方はログイン",
    categoryOptions: {
      mukbang: "グルメ・モッパン",
      travel: "旅行",
      beauty: "美容",
      fashion: "ファッション",
      fitness: "フィットネス・健康",
      tech: "IT・テック",
      game: "ゲーム",
      education: "教育",
      lifestyle: "ライフスタイル",
      finance: "経済・マネー",
    },
    platformOptions: {
      instagram: "Instagram",
      youtube: "YouTube",
      tiktok: "TikTok",
      naver_blog: "Naverブログ",
      other: "その他",
    },
    errors: {
      requiredConsents: "利用規約とプライバシーポリシーへの同意が必要です。",
      requiredProfile: "活動ジャンルとプラットフォームを選択してください。",
      invalidEmail: "有効なメールアドレスを入力してください。",
      passwordLength: "パスワードは8文字以上で入力してください。",
      passwordFormat: "パスワードには英字と数字を含めてください。",
      passwordConfirmationRequired: "パスワードをもう一度入力してください。",
      passwordMismatch: "パスワードが一致しません。",
      nameRequired: "名前または活動名を入力してください。",
      invalidActivity: "活動ジャンルとプラットフォームを選び直してください。",
      emailInUse:
        "登録済みの可能性があります。ログインするか、確認メールをご確認ください。",
      unavailable: "現在アカウントを作成できません。",
      rateLimited: "試行回数が多すぎます。時間をおいてお試しください。",
      fallback: "アカウントを作成できませんでした。もう一度お試しください。",
    },
    confirmation: {
      title: "メールをご確認ください",
      message:
        "確認メールを送信しました。メール内のリンクを開いてからログインしてください。",
      loginLabel: "ログイン",
      editEmailLabel: "メールアドレスを修正",
      inboxHint: "届かない場合は、迷惑メールフォルダもご確認ください。",
    },
    consent: {
      termsTitle: "利用規約に同意",
      privacyTitle: "プライバシーポリシーに同意",
      recordNote: "同意日時と文書バージョンを保存します。お問い合わせ:",
      viewLabel: "確認",
      closeLabel: "閉じる",
      openDocumentLabel: "全文を開く",
      confirmLabel: "完了",
      terms: {
        title: "利用規約",
        items: [
          "연락미のアカウント作成とサービス利用条件を確認します。",
          "契約書作成、確認リンク、電子署名、証拠保管に関する責任範囲を確認します。",
          "広告費の支払い、精算、返金、税務は契約当事者間で行います。",
          "現在、登録と基本機能は無料です。有料化する場合は事前にお知らせします。",
        ],
      },
      privacy: {
        title: "プライバシーポリシー",
        items: [
          "アカウント作成と契約進行に必要な情報のみを収集します。",
          "契約当事者の確認、署名証拠の保管、通知のために使用します。",
          "保存期間と提供基準は全文で確認できます。",
        ],
      },
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
    title: "创建创作者账号",
    nameLabel: "姓名或创作者名称",
    emailLabel: "邮箱",
    passwordLabel: "密码",
    passwordConfirmationLabel: "确认密码",
    passwordPlaceholder: "至少8位，包含字母和数字",
    categoryLabel: "内容领域",
    platformLabel: "主要平台",
    selectLabel: "请选择",
    submitLabel: "创建账号",
    contractSubmitLabel: "注册并返回合同",
    campaignSubmitLabel: "注册并返回活动",
    submittingLabel: "正在创建",
    loginPrompt: "已有账号？登录",
    categoryOptions: {
      mukbang: "美食与吃播",
      travel: "旅行",
      beauty: "美妆",
      fashion: "时尚",
      fitness: "健身与健康",
      tech: "科技",
      game: "游戏",
      education: "教育",
      lifestyle: "生活方式",
      finance: "财经",
    },
    platformOptions: {
      instagram: "Instagram",
      youtube: "YouTube",
      tiktok: "TikTok",
      naver_blog: "Naver博客",
      other: "其他",
    },
    errors: {
      requiredConsents: "请同意服务条款和隐私政策。",
      requiredProfile: "请选择内容领域和主要平台。",
      invalidEmail: "请输入有效的邮箱地址。",
      passwordLength: "密码至少需要8位。",
      passwordFormat: "密码需同时包含字母和数字。",
      passwordConfirmationRequired: "请再次输入密码。",
      passwordMismatch: "两次输入的密码不一致。",
      nameRequired: "请输入姓名或创作者名称。",
      invalidActivity: "请重新选择内容领域和平台。",
      emailInUse: "该邮箱可能已注册。请登录或查看确认邮件。",
      unavailable: "暂时无法创建账号。",
      rateLimited: "尝试次数过多，请稍后再试。",
      fallback: "无法创建账号，请重试。",
    },
    confirmation: {
      title: "请查收邮件",
      message: "确认邮件已发送。请打开邮件中的链接，然后登录。",
      loginLabel: "登录",
      editEmailLabel: "修改邮箱",
      inboxHint: "如未收到，请检查垃圾邮件和推广邮件文件夹。",
    },
    consent: {
      termsTitle: "同意服务条款",
      privacyTitle: "同意隐私政策",
      recordNote: "我们会保存同意时间和文档版本。联系邮箱:",
      viewLabel: "查看",
      closeLabel: "关闭",
      openDocumentLabel: "打开完整文档",
      confirmLabel: "完成",
      terms: {
        title: "服务条款",
        items: [
          "请确认创建연락미账号和使用服务的相关条款。",
          "연락미提供合同起草、审阅链接、电子签名和证据保存服务。",
          "广告费、结算、退款和税务由合同双方自行处理。",
          "目前注册和基础功能免费。如转为付费，我们会提前通知。",
        ],
      },
      privacy: {
        title: "隐私政策",
        items: [
          "我们仅收集创建账号和推进合同所需的信息。",
          "信息用于确认合同双方、保存签名证据和发送通知。",
          "保存期限和提供标准请查看完整隐私政策。",
        ],
      },
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

function localizeGlobalSignupError(
  message: string | null | undefined,
  copy: GlobalCreatorSignupCopy,
) {
  const trimmed = message?.trim() ?? "";
  if (Object.values(copy.errors).includes(trimmed)) return trimmed;

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("user already registered") ||
    normalized.includes("duplicate key") ||
    trimmed.includes("이미 가입")
  ) {
    return copy.errors.emailInUse;
  }
  if (
    normalized.includes("account creation requires") ||
    trimmed.includes("계정 생성 기능을 사용할 수 없")
  ) {
    return copy.errors.unavailable;
  }
  if (
    normalized.includes("too many") ||
    trimmed.includes("요청이 너무 많") ||
    trimmed.includes("시도가 너무 많")
  ) {
    return copy.errors.rateLimited;
  }
  if (trimmed.includes("올바른 이메일") || normalized.includes("valid email")) {
    return copy.errors.invalidEmail;
  }
  if (trimmed.includes("8자 이상") || normalized.includes("at least 8")) {
    return copy.errors.passwordLength;
  }
  if (
    trimmed.includes("영문과 숫자") ||
    (normalized.includes("letter") && normalized.includes("number"))
  ) {
    return copy.errors.passwordFormat;
  }
  if (trimmed.includes("이름 또는 활동명")) {
    return copy.errors.nameRequired;
  }
  if (
    trimmed.includes("활동 정보") ||
    trimmed.includes("활동 영역과 플랫폼") ||
    trimmed.includes("활동 분야와 플랫폼")
  ) {
    return copy.errors.invalidActivity;
  }
  if (
    trimmed.includes("이용약관과 개인정보 처리방침") ||
    normalized.includes("consent")
  ) {
    return copy.errors.requiredConsents;
  }

  return copy.errors.fallback;
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

export function SignupPage({ role }: { role: SignupRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const config = roleConfig[role];
  const globalLocale =
    role === "influencer"
      ? getGlobalCreatorAuthLocale(location.search)
      : null;
  const globalCopy = globalLocale
    ? globalCreatorSignupCopies[globalLocale]
    : null;
  const profileSetupCopy = creatorProfileSetupCopies[globalLocale ?? "ko"];
  const allowedNextPrefixes =
    role === "influencer"
      ? ["/influencer", "/contract", "/campaigns"]
      : ["/advertiser"];
  const nextPath = getNextPath(
    location.search,
    config.nextPath,
    allowedNextPrefixes,
  );
  const signupNextPath = globalLocale
    ? appendGlobalCreatorContext(nextPath, globalLocale)
    : nextPath;
  const loginRedirectPath = preserveAuthContext(
    `${config.loginPath}?next=${encodeURIComponent(nextPath)}`,
    location.search,
  );
  const isContractContinuationSignup =
    role === "influencer" && nextPath.startsWith("/contract/");
  const isCampaignContinuationSignup =
    role === "influencer" && nextPath.startsWith("/campaigns/");
  const signupSubmitLabel = globalCopy
    ? isContractContinuationSignup
      ? globalCopy.contractSubmitLabel
      : isCampaignContinuationSignup
        ? globalCopy.campaignSubmitLabel
        : globalCopy.submitLabel
    : isContractContinuationSignup
      ? "가입하고 계약으로 돌아가기"
      : isCampaignContinuationSignup
        ? "가입하고 캠페인으로 돌아가기"
        : "가입하기";
  const categoryOptions = globalCopy
    ? INFLUENCER_CATEGORY_OPTIONS.map((option) => ({
        ...option,
        label: globalCopy.categoryOptions[option.value],
      }))
    : INFLUENCER_CATEGORY_OPTIONS;
  const platformOptions = globalCopy
    ? INFLUENCER_PLATFORM_OPTIONS.map((option) => ({
        ...option,
        label: globalCopy.platformOptions[option.value],
      }))
    : INFLUENCER_PLATFORM_OPTIONS;
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState(() => readAuthPrefillEmail(location.state));
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordConfirmationTouched, setPasswordConfirmationTouched] =
    useState(false);
  const [activityCategories, setActivityCategories] = useState<
    InfluencerActivityCategory[]
  >([]);
  const [activityPlatforms, setActivityPlatforms] = useState<
    InfluencerSignupPlatform[]
  >([]);
  const [activityPageUrl, setActivityPageUrl] = useState("");
  const [activityPageHandle, setActivityPageHandle] = useState("");
  const [publicProfileConsent, setPublicProfileConsent] = useState(false);
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
  const requiredConsentsAccepted =
    consents.terms &&
    consents.privacy &&
    (role !== "influencer" || publicProfileConsent);
  const influencerCategorySelected = activityCategories.length > 0;
  const activityPageResult = useMemo(
    () => parseRepresentativeActivityPage(activityPageUrl),
    [activityPageUrl],
  );
  const inferredActivityPage = activityPageResult.ok
    ? activityPageResult.page
    : undefined;
  const activityPageNeedsManualIdentity = Boolean(
    inferredActivityPage && !inferredActivityPage.supported,
  );
  const resolvedActivityPlatform = inferredActivityPage?.supported
    ? inferredActivityPage.platform
    : activityPlatforms[0];
  const resolvedActivityHandle = inferredActivityPage?.supported
    ? inferredActivityPage.handle
    : activityPageHandle.trim().replace(/^@+/, "");
  const influencerActivityPageComplete = Boolean(
    inferredActivityPage &&
      (inferredActivityPage.supported ||
        (resolvedActivityPlatform && resolvedActivityHandle)),
  );
  const influencerRequiredProfileComplete =
    role !== "influencer" ||
    (influencerCategorySelected && influencerActivityPageComplete);
  const passwordsMatch =
    password.length > 0 &&
    passwordConfirmation.length > 0 &&
    password === passwordConfirmation;
  const passwordConfirmationError = passwordConfirmationTouched
    ? passwordConfirmation.length === 0
      ? globalCopy?.errors.passwordConfirmationRequired ??
        "비밀번호를 한 번 더 입력해 주세요."
      : password !== passwordConfirmation
        ? globalCopy?.errors.passwordMismatch ??
          "비밀번호가 일치하지 않습니다."
        : ""
    : "";
  const canSubmitSignup =
    requiredConsentsAccepted &&
    influencerRequiredProfileComplete &&
    passwordsMatch;
  const resolveSignupError = (message: string | null | undefined) =>
    globalCopy
      ? localizeGlobalSignupError(message, globalCopy)
      : translateApiErrorMessage(message, "계정을 만들 수 없습니다.");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordsMatch) {
      setPasswordConfirmationTouched(true);
      setError("");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setConfirmationEmail("");
    setConfirmationMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!requiredConsentsAccepted) {
        throw new Error(
          globalCopy?.errors.requiredConsents ??
            "회원가입에는 이용약관과 개인정보 처리방침 필수 동의가 필요합니다.",
        );
      }

      if (
        role === "influencer" &&
        (activityCategories.length === 0 || !influencerActivityPageComplete)
      ) {
        throw new Error(
          profileSetupCopy.requiredProfile,
        );
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
          password_confirmation: passwordConfirmation,
          terms_accepted: consents.terms,
          privacy_accepted: consents.privacy,
          terms_version: TERMS_DOCUMENT_VERSION,
          privacy_policy_version: PRIVACY_POLICY_DOCUMENT_VERSION,
          next_path: signupNextPath,
          ...(role === "advertiser"
            ? { company_name: companyName.trim() }
            : {}),
          ...(role === "influencer"
            ? {
                activity_categories: activityCategories,
                activity_platforms: resolvedActivityPlatform
                  ? [resolvedActivityPlatform]
                  : [],
                activity_page_url: inferredActivityPage?.normalizedUrl,
                activity_page_platform: resolvedActivityPlatform,
                activity_page_handle: resolvedActivityHandle,
                public_profile_consent_accepted: publicProfileConsent,
                public_profile_consent_version: PUBLIC_PROFILE_CONSENT_VERSION,
              }
            : {}),
        }),
      });
      const data = (await response.json()) as SignupResponse;

      if (!response.ok) {
        throw new Error(resolveSignupError(data.error));
      }

      if (data.confirmation_required) {
        setConfirmationEmail(normalizedEmail);
        setConfirmationMessage(
          globalCopy?.confirmation.message ??
            data.message ??
            "인증 메일을 보냈습니다. 메일 링크를 누른 뒤 로그인해 주세요.",
        );
        return;
      }

      if (data.authenticated === true) {
        navigate(signupNextPath, { replace: true });
        return;
      }

      throw new Error(resolveSignupError(data.error));
    } catch (signupError) {
      setError(
        signupError instanceof Error
          ? resolveSignupError(signupError.message)
          : resolveSignupError(undefined),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmationEmail) {
    return (
      <main
        lang={globalCopy?.lang}
        className="min-h-screen bg-[#f5f7f2] px-5 pb-5 pt-0 font-sans text-[#141714] sm:px-6"
      >
        <div className="mx-auto flex min-h-[calc(100vh-20px)] w-full max-w-[1500px] flex-col">
          <header className="flex h-14 items-center justify-between 2xl:px-6">
            <Link
              to={
                globalCopy
                  ? preserveAuthContext(globalCopy.homeHref, location.search)
                  : "/"
              }
              aria-label={globalCopy?.chrome.homeLabel ?? `${PRODUCT_NAME} 홈`}
              className="yl-brand-action -ml-1 inline-flex items-center gap-2.5 rounded-[12px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            >
              <BrandLogo />
            </Link>
          </header>

          <section className="grid flex-1 place-items-center py-8">
            <div className="w-full max-w-[460px] rounded-[18px] border border-[#d8ded4] bg-white/95 p-6 shadow-[0_1px_0_rgba(255,255,255,0.8),0_26px_70px_rgba(20,23,20,0.10)] sm:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#2563eb] text-white shadow-[0_14px_34px_rgba(37,99,235,0.20)]">
                <MailCheck className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="mt-6">
                <h1 className="font-neo-heavy text-[28px] leading-tight tracking-normal text-[#141714]">
                  {globalCopy?.confirmation.title ?? "이메일을 확인해 주세요"}
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
                  className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2563eb] px-5 py-3 text-center text-[15px] font-semibold leading-5 text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)] transition hover:bg-[#1d4ed8]"
                >
                  {globalCopy?.confirmation.loginLabel ?? "로그인하기"}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmationEmail("");
                    setConfirmationMessage("");
                  }}
                  className="flex min-h-11 w-full items-center justify-center rounded-[10px] border border-[#d8ded4] bg-white px-5 py-2.5 text-center text-[14px] font-semibold leading-5 text-[#59605b] transition hover:border-neutral-400 hover:text-neutral-950"
                >
                  {globalCopy?.confirmation.editEmailLabel ?? "이메일 다시 입력"}
                </button>
              </div>

              <p className="mt-5 border-t border-[#edf0ea] pt-4 text-center text-[12px] font-semibold leading-5 text-[#7d887f]">
                {globalCopy?.confirmation.inboxHint ??
                  "메일이 보이지 않으면 스팸함과 프로모션함을 먼저 확인해 주세요."}
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
        title={globalCopy?.title ?? config.title}
        lang={globalCopy?.lang}
        homeHref={globalCopy?.homeHref}
        chromeCopy={globalCopy?.chrome}
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
            label:
              role === "advertiser"
                ? "담당자명"
                : globalCopy?.nameLabel ?? "이름 또는 활동명",
            value: name,
            type: "text",
            autoComplete: "name",
            required: true,
            onChange: setName,
          },
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
            autoComplete: "new-password",
            placeholder:
              globalCopy?.passwordPlaceholder ??
              "영문과 숫자를 포함해 8자 이상",
            required: true,
            onChange: setPassword,
          },
          {
            id: "passwordConfirmation",
            label:
              globalCopy?.passwordConfirmationLabel ?? "비밀번호 확인",
            value: passwordConfirmation,
            type: "password",
            autoComplete: "new-password",
            placeholder:
              globalCopy?.passwordConfirmationLabel ?? "비밀번호 다시 입력",
            required: true,
            error: passwordConfirmationError || undefined,
            onChange: (value: string) => {
              setPasswordConfirmation(value);
              setPasswordConfirmationTouched(true);
            },
          },
        ]}
        submitLabel={signupSubmitLabel}
        submittingLabel={globalCopy?.submittingLabel ?? "생성 중"}
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
            {globalCopy?.loginPrompt ?? "이미 계정이 있으면 로그인하기"}
          </Link>
        }
        onSubmit={handleSubmit}
      >
        {role === "influencer" ? (
          <div className="grid gap-3">
            <SignupSelectField
              label={globalCopy?.categoryLabel ?? "활동 분야"}
              value={activityCategories[0] ?? ""}
              options={categoryOptions}
              selectLabel={globalCopy?.selectLabel}
              disabled={isSubmitting}
              onChange={(value) =>
                setActivityCategories(
                  value ? [value as InfluencerActivityCategory] : [],
                )
              }
            />
            <label className="block">
              <span className="text-[13px] font-bold text-neutral-700">
                {profileSetupCopy.activityPageLabel}
              </span>
              <input
                type="url"
                required
                inputMode="url"
                autoComplete="url"
                disabled={isSubmitting}
                value={activityPageUrl}
                placeholder={profileSetupCopy.activityPagePlaceholder}
                onChange={(event) => setActivityPageUrl(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-3 text-[14px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)] disabled:bg-neutral-100 disabled:text-neutral-400 sm:mt-2 sm:h-11"
              />
              <p className="mt-1.5 text-[11px] font-semibold leading-4 text-neutral-500">
                {inferredActivityPage?.supported && resolvedActivityPlatform
                  ? `${profileSetupCopy.inferredLabel}: ${
                      platformOptions.find(
                        (option) => option.value === resolvedActivityPlatform,
                      )?.label ?? resolvedActivityPlatform
                    }`
                  : profileSetupCopy.activityPageHint}
              </p>
            </label>
            {activityPageNeedsManualIdentity ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SignupSelectField
                  label={profileSetupCopy.manualPlatformLabel}
                  value={activityPlatforms[0] ?? ""}
                  options={platformOptions}
                  selectLabel={globalCopy?.selectLabel}
                  disabled={isSubmitting}
                  onChange={(value) =>
                    setActivityPlatforms(
                      value ? [value as InfluencerSignupPlatform] : [],
                    )
                  }
                />
                <label className="block">
                  <span className="text-[13px] font-bold text-neutral-700">
                    {profileSetupCopy.manualHandleLabel}
                  </span>
                  <input
                    required
                    value={activityPageHandle}
                    disabled={isSubmitting}
                    placeholder={profileSetupCopy.manualHandlePlaceholder}
                    onChange={(event) => setActivityPageHandle(event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-3 text-[14px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)] disabled:bg-neutral-100 disabled:text-neutral-400 sm:mt-2 sm:h-11"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {role === "advertiser" ? (
          <div className="rounded-[10px] border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-[12px] font-semibold leading-5 text-blue-900">
            연락미는 계약서 작성, 전자서명, 증빙 보관을 돕고 광고비 지급·정산·환불·세금은 당사자 간 처리합니다.
          </div>
        ) : null}

        <SignupConsentPanel
          consents={consents}
          disabled={isSubmitting}
          copy={globalCopy?.consent ?? koreanSignupConsentCopy}
          onOpenDocument={setOpenLegalDocument}
          onToggle={(key) =>
            setConsents((current) => ({ ...current, [key]: !current[key] }))
          }
        />
        {role === "influencer" ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-blue-100 bg-blue-50/55 px-3 py-3">
            <input
              type="checkbox"
              required
              checked={publicProfileConsent}
              disabled={isSubmitting}
              onChange={(event) => setPublicProfileConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#2563eb]"
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-bold leading-4 text-blue-950">
                {profileSetupCopy.publicProfileConsentTitle}
                <span className="ml-1 text-[10px] font-semibold text-blue-500">
                  v{PUBLIC_PROFILE_CONSENT_VERSION}
                </span>
              </span>
              <span className="mt-1 block text-[11px] font-semibold leading-4 text-blue-800/80">
                {profileSetupCopy.publicProfileConsentNote}
              </span>
            </span>
          </label>
        ) : null}
      </AuthLoginScreen>
      <LegalConsentModal
        document={openLegalDocument}
        copy={globalCopy?.consent ?? koreanSignupConsentCopy}
        lang={globalCopy?.lang}
        onClose={() => setOpenLegalDocument(null)}
      />
    </>
  );
}

function SignupSelectField<T extends string>({
  label,
  value,
  options,
  selectLabel = "선택",
  disabled,
  onChange,
}: {
  label: string;
  value: T | "";
  options: readonly { value: T; label: string }[];
  selectLabel?: string;
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
        <option value="">{selectLabel}</option>
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
  copy,
  onOpenDocument,
  onToggle,
}: {
  consents: SignupConsents;
  disabled: boolean;
  copy: SignupConsentCopy;
  onOpenDocument: (document: keyof SignupConsents) => void;
  onToggle: (key: keyof SignupConsents) => void;
}) {
  return (
    <section className="grid gap-1 rounded-[10px] border border-neutral-200 bg-[#fbfaf7] px-3 py-2">
      <ConsentCheckbox
        checked={consents.terms}
        disabled={disabled}
        document="terms"
        title={copy.termsTitle}
        viewLabel={copy.viewLabel}
        version={TERMS_DOCUMENT_VERSION}
        onOpenDocument={onOpenDocument}
        onToggle={() => onToggle("terms")}
      />
      <ConsentCheckbox
        checked={consents.privacy}
        disabled={disabled}
        document="privacy"
        title={copy.privacyTitle}
        viewLabel={copy.viewLabel}
        version={PRIVACY_POLICY_DOCUMENT_VERSION}
        onOpenDocument={onOpenDocument}
        onToggle={() => onToggle("privacy")}
      />
      <p className="border-t border-neutral-200/80 pt-2 text-[11px] font-semibold leading-5 text-neutral-500">
        {copy.recordNote}{" "}
        <a
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          className="text-neutral-700 underline underline-offset-4 hover:text-neutral-950"
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
      </p>
    </section>
  );
}

function ConsentCheckbox({
  checked,
  disabled,
  document,
  title,
  viewLabel,
  version,
  onOpenDocument,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  document: keyof SignupConsents;
  title: string;
  viewLabel: string;
  version: string;
  onOpenDocument: (document: keyof SignupConsents) => void;
  onToggle: () => void;
}) {
  const checkboxId = `signup-consent-${document}`;

  return (
    <div className="flex min-h-8 items-start gap-2 rounded-[8px] px-1 py-1 transition hover:bg-white">
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-[#2563eb]"
        checked={checked}
        disabled={disabled}
        required
        onChange={onToggle}
      />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 py-0.5">
        <label
          htmlFor={checkboxId}
          className="min-w-0 cursor-pointer break-words text-[12px] font-bold leading-4 text-neutral-900"
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
        {viewLabel}
      </button>
    </div>
  );
}

function LegalConsentModal({
  document,
  copy,
  lang,
  onClose,
}: {
  document: keyof SignupConsents | null;
  copy: SignupConsentCopy;
  lang?: string;
  onClose: () => void;
}) {
  useBodyScrollLock(Boolean(document));
  if (!document) {
    return null;
  }

  const content =
    document === "terms"
      ? {
          ...copy.terms,
          version: TERMS_DOCUMENT_VERSION,
          href: "/terms",
        }
      : {
          ...copy.privacy,
          version: PRIVACY_POLICY_DOCUMENT_VERSION,
          href: "/privacy",
        };

  return (
    <div
      lang={lang}
      className="fixed inset-0 z-50 grid place-items-center bg-neutral-950/35 px-4 py-6 backdrop-blur-[2px]"
    >
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
            aria-label={copy.closeLabel}
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
              {copy.openDocumentLabel}
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-neutral-950 px-5 text-[13px] font-bold text-white transition hover:bg-neutral-800"
            >
              {copy.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

