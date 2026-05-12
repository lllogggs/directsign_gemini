import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileImage,
  Globe2,
  Instagram,
  Link2,
  Music2,
  RefreshCw,
  ShieldCheck,
  Youtube,
} from "lucide-react";
import { useAppStore } from "../../store";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { buildLoginRedirect } from "../../domain/navigation";
import { translateApiErrorMessage } from "../../domain/userMessages";
import {
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

const METHOD_META: Record<
  InfluencerVerificationMethod,
  {
    label: string;
    helper: string;
  }
> = {
  profile_bio_code: {
    label: "프로필 소개에 코드 삽입",
    helper: "바이오, 소개글, 웹사이트 영역처럼 운영자가 공개 확인할 수 있는 위치",
  },
  public_post_code: {
    label: "공개 게시글로 인증",
    helper: "인증 코드가 들어간 공개 게시글, 커뮤니티 글, 블로그 글 URL",
  },
  channel_description_code: {
    label: "채널 설명에 코드 삽입",
    helper: "유튜브 채널 설명 또는 공개 영상 설명란",
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
    methods: ["profile_bio_code", "public_post_code", "screenshot_review"],
    instructions: [
      "프로필 소개 또는 공개 게시글 본문에 인증 코드를 그대로 넣으세요.",
      "비공개 계정이면 프로필 화면과 계정 설정 화면 캡처를 첨부하세요.",
      "검수 완료 후 코드는 삭제해도 됩니다.",
    ],
  },
  youtube: {
    label: "유튜브",
    hostHint: "youtube.com 또는 youtu.be",
    handlePlaceholder: "@channel",
    urlPlaceholder: "https://youtube.com/@channel",
    proofPlaceholder: "채널 소개, 커뮤니티 글, 영상 설명 URL",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: <Youtube className="h-4 w-4" />,
    methods: ["channel_description_code", "public_post_code", "screenshot_review"],
    instructions: [
      "채널 설명, 커뮤니티 글, 또는 공개 영상 설명란에 인증 코드를 넣으세요.",
      "증빙 URL은 코드가 실제로 보이는 공개 페이지로 입력하세요.",
      "운영자가 코드와 채널명이 일치하는지 확인합니다.",
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
      "블로그 소개글 또는 공개 인증 글에 인증 코드를 넣으세요.",
      "서로이웃 전용 글은 확인이 어려우니 공개 글을 권장합니다.",
      "블로그 ID와 계약서의 채널 정보가 같은지 함께 검수됩니다.",
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
      "프로필 소개 또는 공개 영상 설명에 인증 코드를 넣으세요.",
      "외부에서 확인이 막히면 스크린샷 검수로 제출하세요.",
      "검수 완료 후 코드는 삭제해도 됩니다.",
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
    useState<InfluencerVerificationMethod>("profile_bio_code");
  const [challengeCode, setChallengeCode] = useState(createChallengeCode);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const selectedPlatform = PLATFORM_META[platform];
  const selectedMethod = METHOD_META[method];
  const proofUrl = form.ownership_challenge_url || form.platform_url;
  const verification = summary?.influencer;
  const verificationStatus = verification?.status ?? "not_submitted";
  const latest = verification?.latest_request;
  const approved = verificationStatus === "approved";
  const verifiedHandle =
    latest?.platform_handle || verification?.account?.platform_handle;
  const verifiedUrl = latest?.platform_url || verification?.account?.platform_url;

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
  };

  const updatePlatform = (nextPlatform: InfluencerPlatform) => {
    setPlatform(nextPlatform);
    setMethod(PLATFORM_META[nextPlatform].methods[0]);
    setError("");
    setSubmitted(false);
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
            `${selectedPlatform.label} 계정에 ${PRODUCT_NAME} 인증 코드 ${challengeCode}를 게시했습니다.`,
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
      setForm(initialForm);
      setFile(null);
      setChallengeCode(createChallengeCode());
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
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5 sm:px-8">
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

      <main className="mx-auto grid max-w-6xl gap-4 px-5 py-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)] sm:p-6">
          <div className="mb-5 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 shadow-[inset_3px_0_0_rgba(23,23,23,0.12)]">
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
                      ? `${verifiedHandle || "등록된 계정"} 기준으로 인증되어 있습니다. 다른 플랫폼을 추가하거나 계정 정보가 바뀐 경우에만 새 요청을 남기세요.`
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
                  ? "확인중"
                  : verificationStatusLabel(verificationStatus)}
              </span>
            </div>
          </div>

          <div className="mb-5">
            <h1 className="text-[24px] font-semibold tracking-tight">
              {approved ? "플랫폼 인증 관리" : "플랫폼 계정 소유 인증"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              {approved
                ? "인증된 계정을 유지하면서 새 플랫폼이나 변경된 계정만 추가 검수로 관리합니다."
                : "블로그, 인스타그램, 유튜브 등 계약에 쓰는 채널이 본인 계정인지 인증 코드와 증빙 URL로 확인합니다."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-neutral-900">플랫폼</p>
                <span className="text-xs font-medium text-neutral-400">
                  {selectedPlatform.hostHint}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-5">
                {(Object.keys(PLATFORM_META) as InfluencerPlatform[]).map((item) => {
                  const meta = PLATFORM_META[item];
                  const active = item === platform;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => updatePlatform(item)}
                      className={`flex min-h-[64px] flex-col items-start justify-between rounded-lg border p-3 text-left transition ${
                        active
                          ? `${meta.className} shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-2 ring-neutral-950/10`
                          : "border-neutral-200 bg-white text-neutral-600 hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                      }`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/70 text-current">
                        {meta.icon}
                      </span>
                      <span className="text-xs font-semibold">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            <section className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">
                    {PRODUCT_NAME} 인증 코드
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    선택한 플랫폼의 공개 영역에 아래 코드를 그대로 넣으세요.
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
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {selectedPlatform.instructions.map((instruction) => (
                  <div
                    key={instruction}
                    className="flex items-start gap-2 rounded-md bg-white px-3 py-2 text-xs leading-5 text-neutral-600"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
                    <span>{instruction}</span>
                  </div>
                ))}
              </div>
            </section>

            <div>
              <p className="mb-3 text-sm font-semibold text-neutral-900">
                인증 방식
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedPlatform.methods.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMethod(item)}
                    className={`rounded-lg border p-3 text-left transition ${
                    method === item
                        ? "border-neutral-950 bg-neutral-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.14)]"
                        : "border-neutral-200 bg-white text-neutral-700 hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                    }`}
                  >
                    <span className="text-sm font-semibold">
                      {METHOD_META[item].label}
                    </span>
                    <span
                      className={`mt-2 block text-xs leading-5 ${
                        method === item ? "text-neutral-300" : "text-neutral-500"
                      }`}
                    >
                      {METHOD_META[item].helper}
                    </span>
                  </button>
                ))}
              </div>
            </div>

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

            <div>
              <label className="text-sm font-semibold text-neutral-900">
                증빙 스크린샷
                {method === "screenshot_review" ? " (필수)" : " (선택)"}
              </label>
              <label className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-[#fbfbfc] px-4 py-5 text-center transition hover:border-neutral-500 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <FileImage className="mb-2 h-5 w-5 text-neutral-500" />
                <span className="text-sm font-semibold text-neutral-900">
                  {file ? file.name : "PNG, JPG, WebP, PDF 업로드"}
                </span>
                <span className="mt-1 text-xs text-neutral-500">
                  프로필 소유자 화면, 코드가 보이는 공개 화면, 설정 화면 등을 첨부하세요.
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
                계정 소유 인증 요청을 접수했습니다. 운영자 검수 후 승인됩니다.
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
                  : "계정 소유 인증 요청"}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${selectedPlatform.className}`}
              >
                {selectedPlatform.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-950">
                  {selectedPlatform.label}
                </p>
              </div>
            </div>
            <InfoRow label="인증 방식" value={selectedMethod.label} />
            <InfoRow label="인증 코드" value={challengeCode} mono />
            <InfoRow label="증빙 URL" value={proofUrl || verifiedUrl || "미입력"} />
            {approved && verifiedHandle && (
              <InfoRow label="승인 계정" value={verifiedHandle} />
            )}
          </section>

          <TrustNote
            icon={<Link2 className="h-4 w-4" />}
            title="서명 전 필수 순서"
            body="계약 검토는 계속할 수 있지만, 전자서명은 플랫폼 계정 인증이 승인된 뒤에만 진행됩니다."
          />
          <TrustNote
            icon={<BadgeCheck className="h-4 w-4" />}
            title="관리자 검수"
            body="자동 확인은 보조 수단입니다. 최종 승인은 운영자가 코드, URL, 스크린샷을 함께 확인한 뒤 처리합니다."
          />
          <a
            href={proofUrl || form.platform_url || selectedPlatform.urlPlaceholder}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-400 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
          >
            <ExternalLink className="h-4 w-4" />
            증빙 URL 열기
          </a>
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

function TrustNote({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
        {icon}
      </div>
      <p className="text-sm font-semibold text-neutral-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-500">{body}</p>
    </section>
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
