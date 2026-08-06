import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Copy,
  FileImage,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "../../store";
import { LogoMark } from "../../components/BrandLogo";
import { DashboardSurfaceSwitch } from "../../components/DashboardSurfaceSwitch";
import { HeaderMessageCenterButton } from "../../components/HeaderMessageCenterButton";
import { HeaderNotificationCenterButton } from "../../components/HeaderNotificationCenterButton";
import { InfluencerAccountSettingsMenu } from "../../components/InfluencerAccountSettingsMenu";
import { MobileSurfaceSwitch } from "../../components/MobileSurfaceSwitch";
import { PlatformBrandMark } from "../../components/PlatformBrandMark";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { formatPublicHandleValue } from "../../domain/display";
import { buildLoginRedirect } from "../../domain/navigation";
import { getPlatformDisplayName } from "../../domain/platformDisplay";
import { translateApiErrorMessage } from "../../domain/userMessages";
import {
  getVerificationRejectionGuidance,
  type InstagramDmChallenge,
  type InfluencerPlatform,
  type InfluencerVerificationMethod,
  verificationStatusLabel,
  verificationStatusTone,
} from "../../domain/verification";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import {
  clearMarketplaceMessageSummaryCache,
  useMarketplaceMessageSummary,
} from "../../hooks/useMarketplaceMessageSummary";
import { clearNotificationCenterCache } from "../../hooks/useNotificationCenter";

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
  platform_handle: string;
  platform_url: string;
  ownership_challenge_url: string;
  note: string;
}

const initialForm: InfluencerVerificationForm = {
  platform_handle: "",
  platform_url: "",
  ownership_challenge_url: "",
  note: "",
};

const normalizeInstagramHandleInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (parsed.hostname.replace(/^www\./i, "").toLowerCase() === "instagram.com") {
      return (parsed.pathname.split("/").filter(Boolean)[0] ?? "")
        .replace(/^@+/, "")
        .trim();
    }
  } catch {
    // Plain handles are normalized below.
  }

  return trimmed.replace(/^@+/, "").split(/[/?#]/)[0].trim();
};

const buildInstagramProfileUrl = (handle: string) => {
  const username = normalizeInstagramHandleInput(handle);
  return username ? `https://www.instagram.com/${username}/` : "";
};

type InstagramDmChallengeResponse = {
  error?: string;
  code?: string;
  request?: { id?: string };
  instagram_dm_challenge?: Partial<InstagramDmChallenge> & {
    code?: string;
    expires_at: string;
    official_handle: string;
  };
};

const fetchInstagramDmChallenge = async (requestId?: string) => {
  const query = new URLSearchParams();
  if (requestId?.trim()) query.set("request_id", requestId.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiFetch(
    `/api/verification/influencer/instagram-dm-challenge${suffix}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  const data = (await response.json()) as InstagramDmChallengeResponse;

  if (!response.ok) {
    throw new Error(data.error || "Instagram DM 인증 상태를 확인하지 못했습니다.");
  }

  return data.instagram_dm_challenge;
};

const INSTAGRAM_DM_CHALLENGE_STATES = new Set<InstagramDmChallenge["state"]>([
  "awaiting_dm",
  "retrying_provider",
  "verified",
  "expired",
  "manual_review",
]);

const normalizeInstagramDmChallenge = (
  challenge: InstagramDmChallengeResponse["instagram_dm_challenge"],
  requestId = "",
  fallbackState?: InstagramDmChallenge["state"],
): InstagramDmChallenge | undefined => {
  if (!challenge?.expires_at || !challenge.official_handle) return undefined;

  const officialHandle = challenge.official_handle.trim().replace(/^@+/, "");
  if (!officialHandle) return undefined;
  const state = challenge.state || fallbackState;
  if (!state || !INSTAGRAM_DM_CHALLENGE_STATES.has(state)) return undefined;
  const resolvedRequestId = challenge.request_id || requestId;
  if (!resolvedRequestId) return undefined;

  return {
    request_id: resolvedRequestId,
    state,
    code: challenge.code,
    expires_at: challenge.expires_at,
    official_handle: officialHandle,
    official_url:
      challenge.official_url || `https://instagram.com/${officialHandle}`,
    verified_handle: challenge.verified_handle,
  };
};

const METHOD_META: Record<
  InfluencerVerificationMethod,
  {
    label: string;
    helper: string;
  }
> = {
  instagram_dm_code: {
    label: "Instagram DM 인증",
    helper: "연락미 공식 계정에 인증 코드를 DM으로 보내면 자동으로 확인됩니다.",
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
    hostHint: string;
    handlePlaceholder: string;
    urlPlaceholder: string;
    proofPlaceholder: string;
    methods: InfluencerVerificationMethod[];
    instructions: string[];
  }
> = {
  instagram: {
    hostHint: "instagram.com",
    handlePlaceholder: "@creator",
    urlPlaceholder: "https://instagram.com/creator",
    proofPlaceholder: "https://instagram.com/creator 또는 인증 게시글 URL",
    methods: [
      "instagram_dm_code",
      "profile_bio_code",
      "public_post_code",
      "screenshot_review",
    ],
    instructions: [
      "DM 인증을 시작하면 서버가 일회용 인증 코드를 발급합니다.",
      "발급된 코드를 연락미 공식 인스타그램 계정으로 보내면 자동으로 확인됩니다.",
      "DM 자동 인증을 사용할 수 없을 때만 다른 인증 방식을 선택하세요.",
    ],
  },
  youtube: {
    hostHint: "youtube.com 또는 youtu.be",
    handlePlaceholder: "@channel",
    urlPlaceholder: "https://youtube.com/@channel",
    proofPlaceholder: "채널 소개, 영상, 쇼츠, 커뮤니티 글 URL",
    methods: ["channel_description_code", "public_post_code", "screenshot_review"],
    instructions: [
      "채널 소개에 코드를 넣거나, 공개 영상/쇼츠 설명에 코드를 넣어 주세요.",
      "증빙 URL에는 코드가 보이는 채널, 영상, 쇼츠, 커뮤니티 글 주소를 넣으면 됩니다.",
      "자동화는 채널 핸들, 영상 소유 채널, 인증 코드 포함 여부를 함께 확인합니다.",
      "인증이 끝나면 코드는 삭제해도 됩니다.",
    ],
  },
  naver_blog: {
    hostHint: "blog.naver.com",
    handlePlaceholder: "blog-id",
    urlPlaceholder: "https://blog.naver.com/blog-id",
    proofPlaceholder: "블로그 프로필 또는 인증 글 URL",
    methods: ["profile_bio_code", "public_post_code", "screenshot_review"],
    instructions: [
      "블로그 소개글 또는 공개 글 본문에 인증 코드를 넣어 주세요.",
      "서로이웃 전용 글은 자동 확인이 어렵기 때문에 공개 글을 권장합니다.",
      "자동화는 블로그 ID와 인증 코드가 같은 글에 있는지 함께 확인합니다.",
      "인증이 끝나면 코드는 삭제해도 됩니다.",
    ],
  },
  tiktok: {
    hostHint: "tiktok.com",
    handlePlaceholder: "@creator",
    urlPlaceholder: "https://tiktok.com/@creator",
    proofPlaceholder: "https://tiktok.com/@creator 또는 인증 영상 URL",
    methods: ["profile_bio_code", "public_post_code", "screenshot_review"],
    instructions: [
      "프로필 소개 또는 공개 영상 설명에 인증 코드를 넣어 주세요.",
      "TikTok이 외부 확인을 막으면 코드가 보이는 화면을 캡처해 제출해 주세요.",
      "OAuth 연결 전에는 공개 URL 확인과 스크린샷 검수를 함께 사용합니다.",
      "인증이 끝나면 코드는 삭제해도 됩니다.",
    ],
  },
  other: {
    hostHint: "공개 확인 가능한 URL",
    handlePlaceholder: "account-id",
    urlPlaceholder: "https://example.com/creator",
    proofPlaceholder: "인증 코드가 보이는 공개 URL",
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
  const contract = useAppStore((state) =>
    contractId ? state.getContract(contractId) : undefined,
  );
  const {
    summary,
    isLoading: isVerificationLoading,
    refresh: refreshVerificationSummary,
    statusCode: verificationStatusCode,
  } = useVerificationSummary({ role: "influencer" });
  const {
    summary: messageSummary,
    isLoading: isMessageSummaryLoading,
  } = useMarketplaceMessageSummary("influencer", {
    enabled: verificationStatusCode === 200,
  });
  const refreshVerificationSummaryRef = useRef(refreshVerificationSummary);
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
  const [instagramDmChallenge, setInstagramDmChallenge] =
    useState<InstagramDmChallenge | null>(null);
  const [instagramDmUnavailable, setInstagramDmUnavailable] = useState(false);
  const [instagramDmRestoreFailed, setInstagramDmRestoreFailed] = useState(false);
  const [instagramDmRestoreAttempt, setInstagramDmRestoreAttempt] = useState(0);
  const [isInstagramDmRestoring, setIsInstagramDmRestoring] = useState(true);
  const [showAdditionalRequest, setShowAdditionalRequest] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const selectedPlatform = PLATFORM_META[platform];
  const selectedMethod = METHOD_META[method];
  const isInstagramDmMethod =
    platform === "instagram" && method === "instagram_dm_code";
  const showFocusedInstagramDm =
    isInstagramDmMethod &&
    (Boolean(instagramDmChallenge) ||
      instagramDmUnavailable ||
      instagramDmRestoreFailed);
  const verification = summary?.influencer;
  const verificationStatus = verification?.status ?? "not_submitted";
  const latest = verification?.latest_request;
  const approved = verificationStatus === "approved";
  const approvedPlatforms = verification?.approved_platforms ?? [];
  const showRequestForm =
    showFocusedInstagramDm || !approved || showAdditionalRequest;
  const rejectionGuidance =
    verificationStatus === "rejected"
      ? getVerificationRejectionGuidance(latest, "influencer_account")
      : undefined;
  const verifiedHandle =
    approvedPlatforms[0]?.handle || latest?.platform_handle;
  const displayVerifiedHandle = formatPublicHandleValue(
    verifiedHandle,
    "인증된 계정",
  );

  const handleLogout = async () => {
    await apiFetch("/api/influencer/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    clearMarketplaceMessageSummaryCache("influencer");
    clearNotificationCenterCache("influencer");
    navigate("/login/influencer", { replace: true });
  };

  useEffect(() => {
    refreshVerificationSummaryRef.current = refreshVerificationSummary;
  }, [refreshVerificationSummary]);

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
    let cancelled = false;

    const restoreInstagramDmChallenge = async () => {
      setIsInstagramDmRestoring(true);
      setInstagramDmRestoreFailed(false);
      try {
        const responseChallenge = await fetchInstagramDmChallenge();
        const challenge = normalizeInstagramDmChallenge(responseChallenge);
        if (responseChallenge && !challenge) {
          throw new Error("Invalid Instagram DM challenge response");
        }
        if (cancelled) return;
        if (!challenge) {
          setInstagramDmChallenge(null);
          return;
        }
        if (challenge.state === "verified") {
          await refreshVerificationSummaryRef.current();
          if (!cancelled) {
            setInstagramDmChallenge(null);
            setShowAdditionalRequest(false);
          }
          return;
        }

        setPlatform("instagram");
        setMethod("instagram_dm_code");
        setInstagramDmUnavailable(false);
        setInstagramDmChallenge(challenge);
      } catch {
        if (!cancelled) setInstagramDmRestoreFailed(true);
      } finally {
        if (!cancelled) setIsInstagramDmRestoring(false);
      }
    };

    void restoreInstagramDmChallenge();
    return () => {
      cancelled = true;
    };
  }, [instagramDmRestoreAttempt]);

  useEffect(() => {
    if (
      instagramDmChallenge?.state !== "awaiting_dm" &&
      instagramDmChallenge?.state !== "retrying_provider"
    ) {
      return;
    }

    const requestId = instagramDmChallenge.request_id;
    let cancelled = false;
    let checking = false;
    const pollInstagramDmChallenge = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;

      try {
        const responseChallenge = await fetchInstagramDmChallenge(requestId);
        const challenge = normalizeInstagramDmChallenge(
          responseChallenge,
          requestId,
        );
        if (responseChallenge && !challenge) {
          throw new Error("Invalid Instagram DM challenge response");
        }
        if (challenge && challenge.request_id !== requestId) {
          throw new Error("Instagram DM challenge request mismatch");
        }
        if (cancelled) return;
        if (!challenge) {
          await refreshVerificationSummaryRef.current();
          if (!cancelled) setInstagramDmChallenge(null);
          return;
        }
        if (challenge.state === "verified") {
          await refreshVerificationSummaryRef.current();
          if (!cancelled) {
            setInstagramDmChallenge(null);
            setShowAdditionalRequest(false);
          }
          return;
        }

        setInstagramDmChallenge((current) => ({
          ...challenge,
          code: challenge.code ?? current?.code,
        }));
      } catch {
        // Keep the active code visible and retry on the next poll.
      } finally {
        checking = false;
      }
    };

    const interval = window.setInterval(() => {
      void pollInstagramDmChallenge();
    }, 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [instagramDmChallenge?.request_id, instagramDmChallenge?.state]);

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
    setInstagramDmUnavailable(false);
    setForm((current) => ({
      ...current,
      platform_handle: "",
      platform_url: "",
      ownership_challenge_url: "",
    }));
    setError("");
    setSubmitted(false);
  };

  const updateMethod = (nextMethod: InfluencerVerificationMethod) => {
    setMethod(nextMethod);
    setInstagramDmUnavailable(false);
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

  const handleCopyInstagramDmCode = () => {
    const code = instagramDmChallenge?.code;
    if (!code) return;

    void navigator.clipboard.writeText(code).catch(() => {
      setError("인증 코드를 복사하지 못했습니다. 코드를 직접 선택해서 복사하세요.");
    });
  };

  const handleOpenInstagramFallback = () => {
    setInstagramDmChallenge(null);
    setInstagramDmUnavailable(false);
    setInstagramDmRestoreFailed(false);
    setMethod("profile_bio_code");
    setError("");
    setSubmitted(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const instagramUsername = isInstagramDmMethod
      ? normalizeInstagramHandleInput(form.platform_handle)
      : "";
    if (
      isInstagramDmMethod &&
      !/^[A-Za-z0-9._]{1,30}$/.test(instagramUsername)
    ) {
      setError("인스타그램 사용자 이름을 정확히 입력해 주세요.");
      return;
    }

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
      const submittedForm = isInstagramDmMethod
        ? {
            ...form,
            platform_handle: instagramUsername,
            platform_url: buildInstagramProfileUrl(instagramUsername),
            ownership_challenge_url: buildInstagramProfileUrl(instagramUsername),
          }
        : form;
      const submittedProofUrl =
        submittedForm.ownership_challenge_url || submittedForm.platform_url;
      const response = await apiFetch("/api/verification/influencer", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...submittedForm,
          ...(contractId ? { contract_id: contractId } : {}),
          platform,
          target_id: buildTargetId(platform, submittedForm),
          ownership_verification_method: method,
          ownership_challenge_code: isInstagramDmMethod
            ? undefined
            : challengeCode,
          ownership_challenge_url: submittedProofUrl,
          evidence_file: !isInstagramDmMethod && file
            ? {
                name: file.name,
                type: inferVerificationFileType(file),
                size: file.size,
                data_url: fileDataUrl,
              }
            : undefined,
          note:
            !isInstagramDmMethod
              ? form.note ||
                `${selectedPlatform.label} 계정에 ${PRODUCT_NAME} 인증 코드 ${challengeCode}를 게시했습니다.`
              : undefined,
        }),
      });

      const data = (await response.json()) as InstagramDmChallengeResponse;

      if (
        isInstagramDmMethod &&
        (response.status === 409 ||
          (response.status >= 500 &&
            data.code !== "INSTAGRAM_DM_AUTOMATION_UNAVAILABLE"))
      ) {
        try {
          const responseChallenge = await fetchInstagramDmChallenge();
          const recoveredChallenge = normalizeInstagramDmChallenge(
            responseChallenge,
          );
          if (responseChallenge && !recoveredChallenge) {
            throw new Error("Invalid Instagram DM challenge response");
          }
          if (recoveredChallenge) {
            setInstagramDmUnavailable(false);
            setInstagramDmRestoreFailed(false);
            if (recoveredChallenge.state === "verified") {
              await refreshVerificationSummary();
              setInstagramDmChallenge(null);
              setShowAdditionalRequest(false);
            } else {
              setInstagramDmChallenge(recoveredChallenge);
            }
            return;
          }
        } catch {
          if (data.code !== "INSTAGRAM_DM_AUTOMATION_UNAVAILABLE") {
            setInstagramDmRestoreFailed(true);
            return;
          }
        }

        setInstagramDmRestoreFailed(true);
        return;
      }

      if (
        isInstagramDmMethod &&
        response.status === 503 &&
        data.code === "INSTAGRAM_DM_AUTOMATION_UNAVAILABLE"
      ) {
        setInstagramDmChallenge(null);
        setInstagramDmUnavailable(true);
        return;
      }

      if (!response.ok) {
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "계정 인증 요청을 접수하지 못했습니다.",
          ),
        );
      }

      if (isInstagramDmMethod) {
        const dmChallenge = normalizeInstagramDmChallenge(
          data.instagram_dm_challenge,
          data.request?.id,
          "awaiting_dm",
        );
        if (!dmChallenge?.code || !dmChallenge.request_id) {
          throw new Error("Instagram DM 인증 요청 정보를 받지 못했습니다.");
        }

        setInstagramDmChallenge(dmChallenge);
        setInstagramDmUnavailable(false);
        setSubmitted(false);
        await refreshVerificationSummary();
        return;
      }

      setSubmitted(true);
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
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <div className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => navigate("/influencer/dashboard")}
              className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
              aria-label={PRODUCT_NAME}
            >
              <LogoMark />
              <span className="font-neo-heavy text-[18px] leading-none">
                {PRODUCT_NAME}
              </span>
            </button>
          </div>
          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            <div className="hidden lg:block">
              <DashboardSurfaceSwitch role="influencer" />
            </div>
            <HeaderNotificationCenterButton
              role="influencer"
              enabled={verificationStatusCode === 200}
            />
            <HeaderMessageCenterButton
              unreadCount={messageSummary.unreadCount}
              isLoading={
                verificationStatusCode === 200 && isMessageSummaryLoading
              }
              onClick={() => navigate("/influencer/messages")}
            />
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <InfluencerAccountSettingsMenu
              account={{
                name: verification?.account?.name ?? "인플루언서",
                email: verification?.account?.email,
              }}
              open={accountMenuOpen}
              onToggle={() => setAccountMenuOpen((current) => !current)}
              onClose={() => setAccountMenuOpen(false)}
              onManageProfile={() => {
                setAccountMenuOpen(false);
                navigate("/influencer/profile");
              }}
              onChangePassword={() => {
                setAccountMenuOpen(false);
                navigate("/reset-password?role=influencer");
              }}
              onLogout={() => {
                setAccountMenuOpen(false);
                void handleLogout();
              }}
            />
          </div>
        </div>
      </header>

      <MobileSurfaceSwitch role="influencer" />

      <main className="mx-auto w-full max-w-[980px] px-3 py-4 sm:px-5 sm:py-6">
        <section
          className={
            approved && !showRequestForm
              ? "overflow-visible"
              : "overflow-hidden rounded-[10px] border border-neutral-200/90 bg-white p-4 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.055)] sm:p-5"
          }
        >
          {contractId ? (
            <button
              type="button"
              onClick={() => navigate(returnPath)}
              className="mb-4 inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-950"
            >
              <ArrowLeft className="h-4 w-4" />
              계약으로 돌아가기
            </button>
          ) : null}
          {rejectionGuidance && !showFocusedInstagramDm && (
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
                    반려 사유와 확인 항목을 살펴본 뒤 계정 인증을 다시 요청해 주세요.
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

          {(!approved || showRequestForm) && !showFocusedInstagramDm && (
          <div className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-[24px] font-semibold tracking-tight">
                {approved ? "플랫폼 인증 관리" : "플랫폼 계정 소유 인증"}
              </h1>
              {!approved ? (
                <span
                  className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${verificationStatusTone(
                    verificationStatus,
                  )}`}
                >
                  {isVerificationLoading
                    ? "정보 확인 중"
                    : verificationStatusLabel(verificationStatus)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              {approved
                ? "이미 승인된 계정은 유지됩니다. 새 채널이나 변경된 URL만 추가로 접수하세요."
                : "본인 계정인지 DM, 공개 코드 또는 증빙 화면으로 확인합니다."}
            </p>
          </div>
          )}

          {approved && !showRequestForm ? (
            <section
              data-verification-approved="influencer"
              className="overflow-hidden rounded-[10px] border border-neutral-200 bg-white"
            >
              <div className="flex flex-col gap-4 border-b border-neutral-200 bg-[#fbfbf9] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[12px] font-bold text-blue-700">
                    <CheckCircle2 className="h-4 w-4" />
                    인증 완료
                  </p>
                  <h1 className="mt-1 text-[22px] font-bold tracking-tight text-neutral-950">
                    플랫폼 계정 인증
                  </h1>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-neutral-600">
                    공개 프로필에 표시되는 승인 계정입니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdditionalRequest(true)}
                  className="yl-primary-action inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] px-4 text-[13px] font-bold transition"
                >
                  다른 플랫폼 인증 추가
                </button>
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
                {approvedPlatforms.length > 0 ? (
                  approvedPlatforms.map((item, index) => (
                    <div
                      key={`${item.platform}-${item.handle ?? item.url ?? "approved"}-${index}`}
                      data-verification-account-row="true"
                      className="flex min-w-0 items-center gap-3 rounded-[9px] border border-neutral-200 bg-[#fbfbfc] px-3 py-3"
                    >
                      <PlatformBrandMark platform={item.platform} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-neutral-900">
                          {getPlatformDisplayName(item.platform)}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] font-semibold text-neutral-600">
                          {item.handle
                            ? formatPublicHandleValue(item.handle, "인증된 계정")
                            : item.url ?? "인증된 계정"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    data-verification-account-row="true"
                    className="flex min-w-0 items-center gap-3 rounded-[9px] border border-neutral-200 bg-[#fbfbfc] px-3 py-3 sm:col-span-2"
                  >
                    <BadgeCheck className="h-6 w-6 shrink-0 text-blue-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-neutral-900">
                        인증된 계정
                      </p>
                      <p className="mt-0.5 truncate text-[13px] font-semibold text-neutral-600">
                        {displayVerifiedHandle}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {showRequestForm ? (
          instagramDmRestoreFailed ? (
            <section className="mx-auto flex min-h-[380px] max-w-xl flex-col justify-center">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <AlertTriangle className="mx-auto h-9 w-9 text-amber-700" />
                <h1 className="mt-4 text-xl font-semibold text-amber-950">
                  인증 상태를 확인하지 못했습니다
                </h1>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  진행 중인 인증 정보는 그대로 유지됩니다. 잠시 후 다시 확인해 주세요.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setInstagramDmRestoreAttempt((current) => current + 1)
                  }
                  className="yl-primary-action mt-6 h-11 w-full rounded-[8px] px-5 text-sm font-bold transition"
                >
                  인증 상태 다시 확인
                </button>
              </div>
            </section>
          ) : instagramDmUnavailable ? (
            <section className="mx-auto flex min-h-[380px] max-w-xl flex-col justify-center">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <AlertTriangle className="mx-auto h-9 w-9 text-amber-700" />
                <h1 className="mt-4 text-xl font-semibold text-amber-950">
                  Instagram DM 인증을 사용할 수 없습니다
                </h1>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  서버 연결이 준비되지 않아 요청이 접수되지 않았습니다. 다른 방식으로 계정 소유를 인증해 주세요.
                </p>
                <button
                  type="button"
                  onClick={handleOpenInstagramFallback}
                  className="mt-6 h-11 w-full rounded-lg border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 transition hover:border-neutral-500"
                >
                  다른 방식으로 인증
                </button>
              </div>
            </section>
          ) :
          showFocusedInstagramDm && instagramDmChallenge ? (
            <section className="mx-auto flex min-h-[380px] max-w-xl flex-col justify-center">
              {instagramDmChallenge.state === "verified" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-[10px] border border-neutral-200 bg-white p-6 text-center"
                >
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h1 className="mt-4 text-xl font-bold text-neutral-950">
                    인스타그램 계정 인증 완료
                  </h1>
                  <p className="mt-2 text-sm font-medium text-neutral-600">
                    {formatPublicHandleValue(
                      instagramDmChallenge.verified_handle || form.platform_handle,
                      "Instagram 계정",
                    )}
                  </p>
                </div>
              ) : instagramDmChallenge.state === "expired" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                  <AlertTriangle className="mx-auto h-9 w-9 text-amber-700" />
                  <h1 className="mt-4 text-xl font-semibold text-amber-950">
                    인증 코드가 만료되었습니다
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    새 인증 요청을 시작하면 새로운 코드를 받을 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setInstagramDmChallenge(null);
                      setError("");
                    }}
                    className="yl-primary-action mt-6 h-11 w-full rounded-[8px] px-5 text-sm font-bold transition"
                  >
                    다시 인증하기
                  </button>
                </div>
              ) : instagramDmChallenge.state === "manual_review" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-center"
                >
                  <BadgeCheck className="mx-auto h-9 w-9 text-neutral-700" />
                  <h1 className="mt-4 text-xl font-semibold text-neutral-950">
                    수기 확인으로 접수되었습니다
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    수기 확인 결과를 기다리거나 다른 방식으로 인증할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenInstagramFallback}
                    className="mt-6 h-11 w-full rounded-lg border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 transition hover:border-neutral-500"
                  >
                    다른 방식으로 인증
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-[#fbfbfc] p-5 sm:p-6">
                  <div className="text-center">
                    <div className="mx-auto flex w-fit items-center justify-center">
                      <PlatformBrandMark platform="instagram" size="md" />
                    </div>
                    <h1 className="mt-4 text-xl font-semibold text-neutral-950">
                      Instagram DM으로 인증
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      아래 코드를 @{instagramDmChallenge.official_handle}에 보내면 자동으로 확인됩니다.
                    </p>
                  </div>

                  {instagramDmChallenge.code ? (
                    <>
                      <code className="mt-6 block rounded-lg border border-neutral-200 bg-white px-4 py-4 text-center font-mono text-lg font-bold tracking-wide text-neutral-950">
                        {instagramDmChallenge.code}
                      </code>
                      <a
                        href={instagramDmChallenge.official_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={handleCopyInstagramDmCode}
                        className="yl-primary-action mt-4 flex h-11 w-full items-center justify-center rounded-[8px] px-5 text-sm font-bold transition"
                      >
                        코드 복사하고 Instagram 열기
                      </a>
                    </>
                  ) : null}

                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-neutral-600"
                  >
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {instagramDmChallenge.state === "retrying_provider"
                      ? "Meta 재시도 중 · 코드 유지"
                      : `DM 확인 중 · ${formatInstagramDmExpiry(instagramDmChallenge.expires_at)}까지`}
                  </div>
                  {error ? (
                    <div
                      role="alert"
                      className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
                    >
                      {error}
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          ) : (
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
                  const active = item === platform;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => updatePlatform(item)}
                      className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                        active
                          ? "border-blue-600 bg-blue-50 text-blue-800 shadow-[0_8px_20px_rgba(37,99,235,0.10)] ring-2 ring-blue-600/10"
                          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                      }`}
                    >
                      <PlatformBrandMark platform={item} size="sm" />
                      <span>{getPlatformDisplayName(item)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isInstagramDmMethod ? (
              <TextField
                label="인스타그램 사용자 이름"
                value={form.platform_handle}
                onChange={(value) => updateForm({ platform_handle: value })}
                placeholder="@creator"
                required
              />
            ) : (
              <div className="grid gap-3">
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
            )}

            {!isInstagramDmMethod ? (
            <section className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">
                    {PRODUCT_NAME} 인증 흐름
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    코드 복사 → 프로필/게시글에 임시 등록 → 증빙 URL 입력
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

              <div className="mt-3 rounded-md bg-white px-3 py-2 text-xs font-semibold leading-5 text-neutral-600">
                검수 후 프로필/게시글에 남긴 코드는 삭제해도 됩니다.
              </div>
            </section>
            ) : null}

            {!isInstagramDmMethod ? (
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
                        ? "border-blue-600 bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.14)]"
                        : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
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
            ) : null}

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

            {!isInstagramDmMethod ? (
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
            ) : null}

            {!isInstagramDmMethod ? (
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
            ) : null}

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
              disabled={
                isSubmitting ||
                isVerificationLoading ||
                verificationStatusCode === 401 ||
                (isInstagramDmMethod && isInstagramDmRestoring)
              }
              className="yl-primary-action h-11 w-full rounded-[8px] px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
            >
              {isSubmitting
                ? isInstagramDmMethod
                  ? "DM 인증 준비 중"
                  : "접수 중"
                : isInstagramDmMethod && isInstagramDmRestoring
                  ? "인증 상태 확인 중"
                : isVerificationLoading
                  ? "계정 확인 중"
                : isInstagramDmMethod
                  ? "Instagram DM 인증 시작"
                : approved
                  ? "플랫폼 인증 추가 요청"
                  : verificationStatus === "rejected"
                    ? "계정 인증 재제출"
                  : "계정 소유 인증 요청"}
            </button>
          </form>
          )
          ) : null}
        </section>

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

function formatInstagramDmExpiry(value: string) {
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return "잠시 후";

  return expiresAt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
