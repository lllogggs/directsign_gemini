import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileImage,
  Globe2,
  Instagram,
  Music2,
  RefreshCw,
  ShieldCheck,
  Youtube,
} from "lucide-react";
import { useAppStore } from "../../store";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { formatPublicHandleValue } from "../../domain/display";
import { buildLoginRedirect } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";
import {
  getVerificationRejectionGuidance,
  type InfluencerPlatform,
  type InfluencerVerificationMethod,
  verificationStatusLabel,
  verificationStatusTone,
} from "../../domain/verification";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";

const MAX_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_VERIFICATION_FILE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const inferVerificationFileType = (file: File) => {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "";
};

const validateVerificationFile = (file: File | null) => {
  if (!file) return undefined;
  if (file.size > MAX_VERIFICATION_FILE_SIZE) {
    return `인증 파일은 ${MAX_VERIFICATION_FILE_SIZE / 1024 / 1024}MB 이하로 업로드해주세요.`;
  }
  if (!ACCEPTED_VERIFICATION_FILE_TYPES.has(inferVerificationFileType(file))) {
    return "PDF, PNG, JPG, WebP 파일만 업로드할 수 있습니다.";
  }
  return undefined;
};

interface InfluencerVerificationForm {
  subject_name: string;
  submitted_by_email: string;
  platform_handle: string;
  platform_url: string;
  ownership_challenge_url: string;
  note: string;
}

const initialForm: InfluencerVerificationForm = {
  subject_name: "",
  submitted_by_email: "",
  platform_handle: "",
  platform_url: "",
  ownership_challenge_url: "",
  note: "",
};

const OFFICIAL_INSTAGRAM_HANDLE =
  String(import.meta.env.VITE_INSTAGRAM_OFFICIAL_HANDLE ?? "yeollockme")
    .trim()
    .replace(/^@+/, "") || "yeollockme";
const OFFICIAL_INSTAGRAM_URL = `https://instagram.com/${OFFICIAL_INSTAGRAM_HANDLE}`;

const METHOD_META: Record<
  InfluencerVerificationMethod,
  {
    label: string;
    helper: string;
  }
> = {
  instagram_dm_code: {
    label: "Instagram DM 인증",
    helper: "연락미 공식 계정에 인증 코드를 DM으로 보내고 운영자가 확인",
  },
  profile_bio_code: {
    label: "프로필 소개에 코드 삽입",
    helper: "프로필 소개, 바이오, 웹사이트 영역처럼 공개로 보이는 위치",
  },
  public_post_code: {
    label: "공개 게시글로 인증",
    helper: "인증 코드가 들어간 공개 게시글, 커뮤니티 글, 영상/쇼츠 URL",
  },
  channel_description_code: {
    label: "채널 설명에 코드 삽입",
    helper: "유튜브 채널 설명 또는 공개 영상/쇼츠 설명란",
  },
  screenshot_review: {
    label: "스크린샷 검수",
    helper: "플랫폼 공개 확인이 어려운 경우 관리자 검수용 캡처 첨부",
  },
};

const PLATFORM_META: Record<
  InfluencerPlatform,
  {
    label: string;
    hostHint: string;
    handlePlaceholder: string;
    urlPlaceholder: string;
    proofPlaceholder: string;
    className: string;
    icon: React.ReactNode;
    methods: InfluencerVerificationMethod[];
    instructions: string[];
  }
> = {
  instagram: {
    label: "인스타그램",
    hostHint: "instagram.com",
    handlePlaceholder: "@creator",
    urlPlaceholder: "https://instagram.com/creator",
    proofPlaceholder: "https://instagram.com/creator 또는 인증 게시글 URL",
    className: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    icon: <Instagram className="h-4 w-4" />,
    methods: [
      "instagram_dm_code",
      "profile_bio_code",
      "public_post_code",
      "screenshot_review",
    ],
    instructions: [
      "가장 권장하는 방식은 연락미 공식 인스타그램 계정으로 인증 코드를 DM 보내는 것입니다.",
      "DM을 보낸 뒤 요청을 접수하면 운영자가 발신 계정과 입력한 프로필 URL을 대조합니다.",
      "공개 흔적을 남기기 싫다면 프로필 소개나 게시글보다 DM 인증을 선택하세요.",
      "Meta 자동화가 연결되기 전까지는 운영자가 직접 확인해 승인합니다.",
    ],
  },
  youtube: {
    label: "유튜브",
    hostHint: "youtube.com 또는 youtu.be",
    handlePlaceholder: "@channel",
    urlPlaceholder: "https://youtube.com/@channel",
    proofPlaceholder: "채널 소개, 영상, 쇼츠, 커뮤니티 글 URL",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: <Youtube className="h-4 w-4" />,
    methods: ["channel_description_code", "public_post_code", "screenshot_review"],
    instructions: [
      "채널 소개에 코드를 넣거나, 공개 영상/쇼츠 설명에 코드를 넣어 주세요.",
      "증빙 URL에는 코드가 보이는 채널, 영상, 쇼츠, 커뮤니티 글 주소를 넣으면 됩니다.",
      "자동화는 채널 핸들, 영상 소유 채널, 인증 코드 포함 여부를 함께 확인합니다.",
      "인증이 끝나면 코드는 삭제해도 됩니다.",
    ],
  },
  naver_blog: {
    label: "네이버 블로그",
    hostHint: "blog.naver.com",
    handlePlaceholder: "blog-id",
    urlPlaceholder: "https://blog.naver.com/blog-id",
    proofPlaceholder: "블로그 프로필 또는 인증 글 URL",
    className: "border-neutral-200 bg-white text-neutral-700",
    icon: <BookOpen className="h-4 w-4" />,
    methods: ["profile_bio_code", "public_post_code", "screenshot_review"],
    instructions: [
      "블로그 소개글 또는 공개 글 본문에 인증 코드를 넣어 주세요.",
      "서로이웃 전용 글은 자동 확인이 어렵기 때문에 공개 글을 권장합니다.",
      "자동화는 블로그 ID와 인증 코드가 같은 글에 있는지 함께 확인합니다.",
      "인증이 끝나면 코드는 삭제해도 됩니다.",
    ],
  },
  tiktok: {
    label: "틱톡",
    hostHint: "tiktok.com",
    handlePlaceholder: "@creator",
    urlPlaceholder: "https://tiktok.com/@creator",
    proofPlaceholder: "https://tiktok.com/@creator 또는 인증 영상 URL",
    className: "border-neutral-200 bg-neutral-950 text-white",
    icon: <Music2 className="h-4 w-4" />,
    methods: ["profile_bio_code", "public_post_code", "screenshot_review"],
    instructions: [
      "프로필 소개 또는 공개 영상 설명에 인증 코드를 넣어 주세요.",
      "TikTok이 외부 확인을 막으면 코드가 보이는 화면을 캡처해 제출해 주세요.",
      "OAuth 연결 전에는 공개 URL 확인과 스크린샷 검수를 함께 사용합니다.",
      "인증이 끝나면 코드는 삭제해도 됩니다.",
    ],
  },
  other: {
    label: "기타",
    hostHint: "공개 확인 가능한 URL",
    handlePlaceholder: "account-id",
    urlPlaceholder: "https://example.com/creator",
    proofPlaceholder: "인증 코드가 보이는 공개 URL",
    className: "border-neutral-200 bg-white text-neutral-700",
    icon: <Globe2 className="h-4 w-4" />,
    methods: ["profile_bio_code", "public_post_code", "screenshot_review"],
    instructions: [
      "공개 프로필, 게시글, 소개 페이지 중 한 곳에 인증 코드를 넣으세요.",
      "운영자가 로그인 없이 확인 가능한 URL을 입력하세요.",
      "공개 확인이 어려우면 스크린샷을 첨부하세요.",
    ],
  },
};

export function InfluencerVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get("contractId");
  const token = searchParams.get("token");
  const returnPath = contractId
    ? `/contract/${encodeURIComponent(contractId)}${
        token ? `?token=${encodeURIComponent(token)}` : ""
      }`
    : "/influencer/dashboard";
  const returnLabel = contractId ? "계약으로 돌아가기" : "대시보드로 돌아가기";
  const contract = useAppStore((state) =>
    contractId ? state.getContract(contractId) : undefined,
  );
  const {
    summary,
    isLoading: isVerificationLoading,
    refresh: refreshVerificationSummary,
    statusCode: verificationStatusCode,
  } = useVerificationSummary({ role: "influencer" });
  const [prefilledContractId, setPrefilledContractId] = useState("");
  const [platform, setPlatform] = useState<InfluencerPlatform>("instagram");
  const [method, setMethod] =
    useState<InfluencerVerificationMethod>("instagram_dm_code");
  const [challengeCode, setChallengeCode] = useState(createChallengeCode);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedChallengeCode, setSubmittedChallengeCode] = useState("");
  const [showAdditionalRequest, setShowAdditionalRequest] = useState(false);
  const selectedPlatform = PLATFORM_META[platform];
  const selectedMethod = METHOD_META[method];
  const proofUrl = form.ownership_challenge_url || form.platform_url;
  const evidenceHref = proofUrl.trim();
  const isInstagramDmMethod =
    platform === "instagram" && method === "instagram_dm_code";
  const verification = summary?.influencer;
  const verificationStatus = verification?.status ?? "not_submitted";
  const latest = verification?.latest_request;
  const approved = verificationStatus === "approved";
  const approvedPlatforms = verification?.approved_platforms ?? [];
  const approvedPlatformChips = approvedPlatforms.filter((item, index, items) => {
    return items.findIndex((candidate) => candidate.platform === item.platform) === index;
  });
  const visibleApprovedPlatformChips = approvedPlatformChips.slice(0, 4);
  const hiddenApprovedPlatformChipCount =
    approvedPlatformChips.length - visibleApprovedPlatformChips.length;
  const approvedPlatformNames = Array.from(
    new Set(
      approvedPlatforms.map(
        (item) => PLATFORM_META[item.platform]?.label ?? item.platform,
      ),
    ),
  );
  const approvedPlatformLabel =
    approvedPlatformNames.length > 1
      ? `${approvedPlatformNames.length}개 플랫폼 인증`
      : approvedPlatformNames[0] ?? "";
  const showRequestForm = !approved || showAdditionalRequest;
  const rejectionGuidance =
    verificationStatus === "rejected"
      ? getVerificationRejectionGuidance(latest, "influencer_account")
      : undefined;
  const selectedApprovedPlatform = approvedPlatforms.find(
    (item) => item.platform === platform,
  );
  const latestMatchesSelectedPlatform =
    latest?.platform === undefined || latest.platform === platform;
  const verifiedHandle =
    selectedApprovedPlatform?.handle ||
    (latestMatchesSelectedPlatform ? latest?.platform_handle : undefined);
  const displayVerifiedHandle = formatPublicHandleValue(
    verifiedHandle,
    "인증된 계정",
  );
  const verifiedUrl =
    selectedApprovedPlatform?.url ||
    (latestMatchesSelectedPlatform ? latest?.platform_url : undefined);
  const sidebarEvidenceHref = showRequestForm
    ? evidenceHref
    : verifiedUrl?.trim() ?? "";
  const sidebarPlatformLabel = showRequestForm
    ? selectedPlatform.label
    : approvedPlatformLabel
      ? approvedPlatformLabel
      : "승인된 플랫폼";
  const sidebarIcon = showRequestForm ? (
    selectedPlatform.icon
  ) : (
    <BadgeCheck className="h-4 w-4" />
  );
  const sidebarClassName = showRequestForm
    ? selectedPlatform.className
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  useEffect(() => {
    if (verificationStatusCode !== 401) return;

    navigate(
      buildLoginRedirect(
        "/login/influencer",
        `${location.pathname}${location.search}`,
        "/influencer/dashboard",
        ["/influencer", "/contract"],
      ),
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, verificationStatusCode]);

  useEffect(() => {
    if (!contract || prefilledContractId === contract.id) return;

    const timer = window.setTimeout(() => {
      const inferredPlatform = inferPlatform(contract.influencer_info.channel_url);
      if (inferredPlatform) {
        setPlatform(inferredPlatform);
        setMethod(PLATFORM_META[inferredPlatform].methods[0]);
      }

      setForm((current) => ({
        ...current,
        subject_name: current.subject_name || contract.influencer_info.name,
        submitted_by_email:
          current.submitted_by_email || contract.influencer_info.contact,
        platform_handle:
          current.platform_handle ||
          inferHandle(contract.influencer_info.channel_url, inferredPlatform ?? platform),
        platform_url: current.platform_url || contract.influencer_info.channel_url,
        ownership_challenge_url:
          current.ownership_challenge_url || contract.influencer_info.channel_url,
      }));
      setPrefilledContractId(contract.id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [contract, platform, prefilledContractId]);

  const updateForm = (updates: Partial<InfluencerVerificationForm>) => {
    setForm((current) => ({ ...current, ...updates }));
    setError("");
    setSubmitted(false);
    setSubmittedChallengeCode("");
  };

  const updatePlatform = (nextPlatform: InfluencerPlatform) => {
    setPlatform(nextPlatform);
    setMethod(PLATFORM_META[nextPlatform].methods[0]);
    setForm((current) => ({
      ...current,
      platform_handle: "",
      platform_url: "",
      ownership_challenge_url: "",
    }));
    setError("");
    setSubmitted(false);
    setSubmittedChallengeCode("");
  };

  const updateMethod = (nextMethod: InfluencerVerificationMethod) => {
    setMethod(nextMethod);
    setError("");
    setSubmitted(false);
    setSubmittedChallengeCode("");
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(challengeCode);
    } catch {
      setError("인증 코드를 복사하지 못했습니다. 코드를 직접 선택해서 복사하세요.");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (method === "screenshot_review" && !file) {
      setError("스크린샷 검수를 선택한 경우 증빙 파일을 첨부해야 합니다.");
      return;
    }

    const fileError = validateVerificationFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }

    setIsSubmitting(true);

    try {
      const fileDataUrl = file ? await readFileAsDataUrl(file) : undefined;
      const response = await apiFetch("/api/verification/influencer", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...form,
          ...(contractId ? { contract_id: contractId } : {}),
          platform,
          target_id: buildTargetId(platform, form),
          ownership_verification_method: method,
          ownership_challenge_code: challengeCode,
          ownership_challenge_url: proofUrl,
          evidence_file: file
            ? {
                name: file.name,
                type: inferVerificationFileType(file),
                size: file.size,
                data_url: fileDataUrl,
              }
            : undefined,
          note:
            form.note ||
            (isInstagramDmMethod
              ? `${PRODUCT_NAME} 공식 인스타그램 @${OFFICIAL_INSTAGRAM_HANDLE}으로 인증 코드 ${challengeCode}를 DM 발송합니다.`
              : `${selectedPlatform.label} 계정에 ${PRODUCT_NAME} 인증 코드 ${challengeCode}를 게시했습니다.`),
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "계정 인증 요청을 접수하지 못했습니다.",
          ),
        );
      }

      setSubmitted(true);
      setSubmittedChallengeCode(challengeCode);
      setForm(initialForm);
      setFile(null);
      await refreshVerificationSummary();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? translateApiErrorMessage(
              submitError.message,
              "계정 인증 요청을 접수하지 못했습니다.",
            )
          : "계정 인증 요청을 접수하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate(returnPath)}
            className="flex items-center gap-3 text-sm font-semibold text-neutral-700 transition hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            {returnLabel}
          </button>
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-[#fbfbfc] px-3 py-1.5 text-xs font-semibold text-neutral-600">
            <ShieldCheck className="h-4 w-4" />
            계정 소유 확인
          </div>
        </div>
      </header>

      <main className="mx-auto grid h-[calc(100vh-64px)] max-w-5xl gap-3 overflow-hidden px-5 py-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section
          className={`overflow-y-auto rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)] sm:p-5 ${
            approved && !showRequestForm && !rejectionGuidance
              ? "self-start"
              : "min-h-0"
          }`}
        >
          <div className="mb-4 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-950">
                    {approved ? "플랫폼 인증이 완료되었습니다" : "플랫폼 인증 상태"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">
                    {approved
                      ? `${displayVerifiedHandle} 기준으로 인증되어 있습니다. 다른 플랫폼을 추가하거나 계정 정보가 바뀐 경우에만 새 요청을 남기세요.`
                      : "계약 검토는 가능하지만, 서명하려면 계정 소유 인증 승인이 먼저 필요합니다."}
                  </p>
                </div>
              </div>
              <span
                className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${verificationStatusTone(
                  verificationStatus,
                )}`}
              >
                {isVerificationLoading
                  ? "정보 확인 중"
                  : verificationStatusLabel(verificationStatus)}
              </span>
            </div>
          </div>

          {rejectionGuidance && (
            <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-[inset_3px_0_0_rgba(190,18,60,0.22)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-rose-700 ring-1 ring-rose-100">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-900">
                    {rejectionGuidance.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-rose-800/80">
                    {rejectionGuidance.body}
                  </p>
                  <div className="mt-3 rounded-md border border-rose-100 bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-rose-900">
                    반려 사유: {rejectionGuidance.reviewerNote}
                  </div>
                  <ul className="mt-3 grid gap-2 text-xs leading-5 text-rose-900 sm:grid-cols-2">
                    {rejectionGuidance.checklist.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="mb-5">
            <h1 className="text-[24px] font-semibold tracking-tight">
              {approved ? "플랫폼 인증 관리" : "플랫폼 계정 소유 인증"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              {approved
                ? "이미 승인된 계정은 유지됩니다. 새 채널이나 변경된 URL만 추가로 접수하세요."
                : "계약에 쓰는 채널이 본인 계정인지 코드, DM, URL 중 가능한 방식으로 확인합니다."}
            </p>
          </div>

          {approved && !showRequestForm ? (
            <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <CheckCircle2 className="h-4 w-4" />
                    서명에 사용할 플랫폼 인증이 준비되었습니다
                  </p>
                  <p className="mt-2 max-w-2xl break-keep text-sm leading-6 text-emerald-800/80">
                    기존 인증은 유지됩니다. 새 플랫폼을 추가하거나 계정 URL이 바뀐 경우에만 추가 요청을 남기세요.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {visibleApprovedPlatformChips.length > 0 ? (
                      visibleApprovedPlatformChips.map((item) => (
                        <span
                          key={`${item.platform}-${item.handle ?? item.url ?? "approved"}`}
                          className="inline-flex h-8 max-w-full items-center truncate rounded-full border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800"
                        >
                          {PLATFORM_META[item.platform]?.label ?? item.platform}
                          {item.handle
                            ? ` · ${formatPublicHandleValue(item.handle, "인증된 계정")}`
                            : ""}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex h-8 items-center rounded-full border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800">
                        {displayVerifiedHandle}
                      </span>
                    )}
                    {hiddenApprovedPlatformChipCount > 0 ? (
                      <span className="inline-flex h-8 items-center rounded-full border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800">
                        외 {hiddenApprovedPlatformChipCount}개
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdditionalRequest(true)}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  다른 플랫폼 인증 추가
                </button>
              </div>
            </section>
          ) : null}

          {showRequestForm ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-900">플랫폼</p>
                <span className="text-xs font-medium text-neutral-400">
                  {selectedPlatform.hostHint}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PLATFORM_META) as InfluencerPlatform[]).map((item) => {
                  const meta = PLATFORM_META[item];
                  const active = item === platform;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => updatePlatform(item)}
                      className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                        active
                          ? `${meta.className} shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-2 ring-neutral-950/10`
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                      }`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/70 text-current">
                        {meta.icon}
                      </span>
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="이름/활동명"
                value={form.subject_name}
                onChange={(value) => updateForm({ subject_name: value })}
                required
              />
              <TextField
                label="연락 이메일"
                type="email"
                value={form.submitted_by_email}
                onChange={(value) =>
                  updateForm({ submitted_by_email: value })
                }
                required
              />
              <TextField
                label="핸들/채널 ID"
                value={form.platform_handle}
                onChange={(value) => updateForm({ platform_handle: value })}
                placeholder={selectedPlatform.handlePlaceholder}
                required
              />
              <TextField
                label="프로필 URL"
                type="url"
                value={form.platform_url}
                onChange={(value) =>
                  updateForm({
                    platform_url: value,
                    ownership_challenge_url:
                      form.ownership_challenge_url || value,
                  })
                }
                placeholder={selectedPlatform.urlPlaceholder}
                required
              />
            </div>

            <section className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">
                    {PRODUCT_NAME} 인증 흐름
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    {isInstagramDmMethod
                      ? `코드 복사 → @${OFFICIAL_INSTAGRAM_HANDLE} DM → 요청 접수`
                      : "코드 복사 → 프로필/게시글에 임시 등록 → 증빙 URL 입력"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-neutral-950">
                    {challengeCode}
                  </code>
                  <IconButton
                    label="인증 코드 복사"
                    onClick={handleCopyCode}
                    icon={<Copy className="h-4 w-4" />}
                  />
                  <IconButton
                    label="인증 코드 새로 만들기"
                    onClick={() => setChallengeCode(createChallengeCode())}
                    icon={<RefreshCw className="h-4 w-4" />}
                  />
                  {isInstagramDmMethod && (
                    <a
                      href={OFFICIAL_INSTAGRAM_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden h-10 items-center rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400 sm:inline-flex"
                    >
                      @{OFFICIAL_INSTAGRAM_HANDLE}
                    </a>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-semibold leading-5 text-neutral-600">
                {isInstagramDmMethod
                  ? "공개 댓글이나 게시글 없이 DM으로 확인합니다."
                  : "검수 후 프로필/게시글에 남긴 코드는 삭제해도 됩니다."}
              </div>
            </section>

            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-900">
                인증 방식
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedPlatform.methods.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => updateMethod(item)}
                    className={`h-10 rounded-lg border px-3 text-sm font-semibold transition ${
                    method === item
                        ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.14)]"
                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                    }`}
                  >
                      {METHOD_META[item].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-2 text-xs leading-5 text-neutral-500">
                {selectedMethod.helper}
              </p>
            </div>

            {!isInstagramDmMethod ? (
              <>
                <TextField
                  label="증빙 URL"
                  type="url"
                  value={form.ownership_challenge_url}
                  onChange={(value) =>
                    updateForm({ ownership_challenge_url: value })
                  }
                  placeholder={selectedPlatform.proofPlaceholder}
                  required={method !== "screenshot_review"}
                />
                <p className="-mt-2 rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-2 text-xs leading-5 text-neutral-500">
                  접근이 막히는 플랫폼은 스크린샷을 함께 올리면 운영자가 이어서 확인합니다.
                </p>
              </>
            ) : null}

            <div>
              <label className="text-sm font-semibold text-neutral-900">
                증빙 스크린샷
                {method === "screenshot_review" ? " (필수)" : " (선택)"}
              </label>
              <label className="mt-2 flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-[#fbfbfc] px-4 py-4 text-center transition hover:border-neutral-500 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <FileImage className="h-5 w-5 shrink-0 text-neutral-500" />
                <span className="text-left">
                <span className="text-sm font-semibold text-neutral-900">
                  {file ? file.name : "PNG, JPG, WebP, PDF 업로드"}
                </span>
                <span className="mt-1 block text-xs text-neutral-500">
                  소유자 화면이나 코드가 보이는 화면이면 충분합니다.
                </span>
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    const fileError = validateVerificationFile(nextFile);
                    if (fileError) {
                      setFile(null);
                      setError(fileError);
                      event.currentTarget.value = "";
                      return;
                    }
                    setFile(nextFile);
                    setError("");
                  }}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-neutral-900">
                운영자에게 남길 메모
              </span>
              <textarea
                value={form.note}
                onChange={(event) => updateForm({ note: event.target.value })}
                className="mt-2 min-h-20 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 text-sm outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.05)]"
                placeholder="코드를 넣은 위치, 임시 게시글 여부, 검수 후 삭제 예정 등 참고 내용을 적어주세요."
              />
            </label>

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
              >
                {error}
              </div>
            )}
            {submitted && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-800"
              >
                {isInstagramDmMethod
                  ? `접수 완료. 코드 ${submittedChallengeCode}를 @${OFFICIAL_INSTAGRAM_HANDLE}으로 DM 보내면 확인합니다.`
                  : "계정 소유 인증 요청을 접수했습니다. 운영자 검수 후 승인됩니다."}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isVerificationLoading || verificationStatusCode === 401}
              className="h-11 w-full rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
            >
              {isSubmitting
                ? "접수 중"
                : isVerificationLoading
                  ? "계정 확인 중"
                : approved
                  ? "플랫폼 인증 추가 요청"
                  : verificationStatus === "rejected"
                    ? "계정 인증 재제출"
                  : "계정 소유 인증 요청"}
            </button>
          </form>
          ) : null}
        </section>

        <aside className="min-h-0 space-y-3 overflow-y-auto">
          <section className="rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${sidebarClassName}`}
              >
                {sidebarIcon}
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-400">현재 선택</p>
                <p className="text-sm font-semibold text-neutral-950">
                  {sidebarPlatformLabel}
                </p>
              </div>
            </div>
            {showRequestForm ? (
              <>
                <InfoRow label="인증 방식" value={selectedMethod.label} />
                <InfoRow label="인증 코드" value={challengeCode} mono />
                <InfoRow
                  label={isInstagramDmMethod ? "인스타 프로필" : "증빙 URL"}
                  value={proofUrl || verifiedUrl || "미입력"}
                />
                {isInstagramDmMethod && (
                  <InfoRow
                    label="DM 받을 계정"
                    value={`@${OFFICIAL_INSTAGRAM_HANDLE}`}
                  />
                )}
                {approved && verifiedHandle && (
                  <InfoRow label="승인 계정" value={displayVerifiedHandle} />
                )}
              </>
            ) : (
              <>
                <InfoRow label="현재 상태" value="인증 완료" />
                {verifiedHandle ? (
                  <InfoRow label="대표 계정" value={displayVerifiedHandle} />
                ) : null}
                <InfoRow
                  label="추가 인증"
                  value="필요할 때만 새 요청"
                />
              </>
            )}
          </section>

          <section className="rounded-lg border border-neutral-200/80 bg-white p-4 text-sm leading-6 text-neutral-600 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
            <p className="font-semibold text-neutral-950">서명 조건</p>
            <p className="mt-1">
              계약 검토는 계속 가능하고, 전자서명은 플랫폼 인증 승인 뒤 진행됩니다.
            </p>
          </section>
          {sidebarEvidenceHref ? (
            <a
              href={sidebarEvidenceHref}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-400 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
            >
              <ExternalLink className="h-4 w-4" />
              증빙 URL 열기
            </a>
          ) : (
            <div className="flex min-h-11 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-center text-sm font-semibold text-neutral-400">
              증빙 URL 입력 후 열기 가능
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-neutral-900">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 text-sm outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.05)]"
      />
    </label>
  );
}

function IconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
    >
      {icon}
    </button>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border-t border-neutral-100 py-3 first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold text-neutral-400">{label}</p>
      <p
        className={`mt-1 break-words text-sm font-medium text-neutral-800 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function createChallengeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(8);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * alphabet.length);
    }
  }

  const token = Array.from(values, (value) => alphabet[value % alphabet.length]);
  return `DS-${token.slice(0, 4).join("")}-${token.slice(4).join("")}`;
}

function buildTargetId(
  platform: InfluencerPlatform,
  form: InfluencerVerificationForm,
) {
  const handle = form.platform_handle.trim().replace(/^@/, "").toLowerCase();
  if (handle) return `${platform}:${handle}`;
  return `${platform}:${form.platform_url.trim().toLowerCase()}`;
}

function inferPlatform(urlValue: string): InfluencerPlatform | undefined {
  const normalized = urlValue.toLowerCase();
  if (normalized.includes("instagram.com")) return "instagram";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
    return "youtube";
  }
  if (normalized.includes("tiktok.com")) return "tiktok";
  if (normalized.includes("blog.naver.com")) return "naver_blog";
  return undefined;
}

function inferHandle(urlValue: string, platform: InfluencerPlatform) {
  try {
    const url = new URL(urlValue);
    const segments = url.pathname.split("/").filter(Boolean);
    if (platform === "youtube") {
      return segments.find((segment) => segment.startsWith("@")) ?? segments[0] ?? "";
    }
    return segments[0] ?? "";
  } catch {
    return "";
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}
