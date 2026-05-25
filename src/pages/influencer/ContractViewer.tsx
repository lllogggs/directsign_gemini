import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  useAppStore,
  type ClauseHistory,
  type Contract,
  type ContractStatus,
} from "../../store";
import { apiFetch, apiPath } from "../../domain/api";
import { isFixedCampaignContract } from "../../domain/contracts";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { buildLoginRedirect } from "../../domain/navigation";
import {
  getVerificationRejectionGuidance,
  type InfluencerPlatform,
  verificationStatusLabel,
} from "../../domain/verification";
import {
  DELIVERABLE_FILE_ACCEPT,
  formatFileSize,
  getDeliverableErrorMessage,
  getSubmissionNote,
  isDeliverableRevisionStatus,
  readFileAsDataUrl,
  reviewStatusLabel,
  reviewStatusTone,
  submittedReviewStatuses,
  validateDeliverableFile,
  validateDeliverableUrl,
  type DeliverablesResponse,
} from "../../domain/deliverables";
import {
  formatContractTitleForDisplay,
  formatCustomerContractText,
  formatMoneyLabel,
  formatOperationalText,
  formatPublicUrlLabel,
  removeInternalTestLabel,
} from "../../domain/display";
import { translateApiErrorMessage } from "../../domain/userMessages";
import { ScreenHelpButton } from "../../components/ScreenHelp";
import { SCREEN_HELP_CONTENT } from "../../domain/screenHelp";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Eraser,
  ExternalLink,
  FileSignature,
  FileText,
  LifeBuoy,
  Link2,
  MessageSquare,
  PenTool,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { format } from "date-fns";

type CanvasPoint = {
  x: number;
  y: number;
};

const STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "초안",
  REVIEWING: "검토 중",
  NEGOTIATING: "수정 요청",
  APPROVED: "서명 준비",
  SIGNED: "서명 완료",
  CLOSED: "계약 마감",
};

const CONTRACT_ACCOUNT_GUIDE_STEPS = [
  "계약 내용 먼저 확인",
  "인플루언서 가입 또는 로그인",
  "플랫폼 계정 인증",
  "조항 승인 후 서명",
] as const;

const getStatusLabel = (status: ContractStatus) =>
  STATUS_LABELS[status] ?? status;

const contractPlatformToInfluencerPlatform = (
  platform: string,
): InfluencerPlatform => {
  const platforms: Record<string, InfluencerPlatform> = {
    NAVER_BLOG: "naver_blog",
    YOUTUBE: "youtube",
    INSTAGRAM: "instagram",
    TIKTOK: "tiktok",
    OTHER: "other",
  };

  return platforms[platform] ?? "other";
};

const inferInfluencerPlatformFromUrl = (
  value: string | undefined,
): InfluencerPlatform => {
  if (!value) return "other";
  const normalized = value.toLowerCase();
  if (normalized.includes("blog.naver.com")) return "naver_blog";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
    return "youtube";
  }
  if (normalized.includes("instagram.com")) return "instagram";
  if (normalized.includes("tiktok.com")) return "tiktok";
  return "other";
};

const normalizeComparableUrl = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return undefined;
  }
};

const isAsciiOnly = (value: string) =>
  value.split("").every((character) => character.charCodeAt(0) <= 0x7f);

const approvedPlatformMatchesContract = (
  approvedPlatform: { platform: InfluencerPlatform; url?: string },
  requiredPlatform: InfluencerPlatform,
  contractChannelUrl: string | undefined,
) => {
  if (approvedPlatform.platform !== requiredPlatform) return false;
  const inferredContractPlatform =
    inferInfluencerPlatformFromUrl(contractChannelUrl);
  if (inferredContractPlatform !== requiredPlatform) return true;

  const contractUrl = normalizeComparableUrl(contractChannelUrl);
  const approvedUrl = normalizeComparableUrl(approvedPlatform.url);
  if (!contractUrl || !approvedUrl) return false;

  return contractUrl === approvedUrl;
};

const getContractLoadErrorMessage = (message?: string) => {
  if (!message) return "계약을 불러올 수 없습니다.";
  if (message === "Contract not found") {
    return "계약서가 삭제되었거나 링크가 올바르지 않습니다.";
  }
  if (message === "Contract access is not allowed") {
    return "이 계약을 열 수 있는 권한이 없습니다.";
  }
  if (message === "Valid share token is required") {
    return "공유 링크가 만료되었거나 올바르지 않습니다.";
  }
  if (message === "Share token has expired") {
    return "공유 링크 유효기간이 만료되었습니다.";
  }
  if (isAsciiOnly(message)) {
    return "계약을 불러올 수 없습니다. 링크와 로그인 상태를 확인해 주세요.";
  }
  return message;
};

const getSignatureErrorMessage = (message?: string) => {
  if (!message) return "서명 저장에 실패했습니다.";
  if (message === "Influencer session is required") {
    return "서명하려면 인플루언서 로그인이 필요합니다.";
  }
  if (
    message ===
    "Influencer account verification must be approved before signing"
  ) {
    return "계정 인증 승인 후 서명할 수 있습니다.";
  }
  if (
    message === "Contract platform verification must be approved before signing"
  ) {
    return "이 계약의 플랫폼 계정 인증이 승인된 뒤 서명할 수 있습니다.";
  }
  if (message === "Contract access is not allowed") {
    return "이 계약을 서명할 수 있는 인플루언서 계정이 아닙니다.";
  }
  if (
    message === "Contract must be approved and actively shared before signing"
  ) {
    return "광고주가 서명 가능한 상태로 공유한 계약만 서명할 수 있습니다.";
  }
  if (message === "All clauses must be approved before signing") {
    return "서명 전에 모든 조항이 승인되어야 합니다.";
  }
  if (isAsciiOnly(message)) {
    return "서명 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return message;
};

const createTypedSignatureDataUrl = (signerName: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");

  if (!ctx) return "";

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 168);
  ctx.lineTo(672, 168);
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.font = "52px Georgia, 'Times New Roman', serif";
  ctx.fillText(signerName.trim(), 56, 132, 600);
  ctx.font = "18px Arial, sans-serif";
  ctx.fillText("Typed electronic signature", 56, 194);

  return canvas.toDataURL("image/png");
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export function ContractViewer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const getContract = useAppStore((state) => state.getContract);
  const updateClauseStatus = useAppStore((state) => state.updateClauseStatus);
  const replaceContract = useAppStore((state) => state.replaceContract);
  const contract = getContract(id || "");
  const {
    summary: verificationSummary,
    isLoading: isVerificationLoading,
    error: verificationStatusError,
    refresh: refreshVerificationSummary,
    statusCode: verificationStatusCode,
  } = useVerificationSummary({ role: "influencer", enabled: Boolean(contract) });

  const [selection, setSelection] = useState<{
    text: string;
    clauseId: string;
    x: number;
    y: number;
    showTooltip: boolean;
  } | null>(null);

  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    type: "MODIFICATION_REQUESTED" | "DELETION_REQUESTED";
    clauseId: string;
    selectedText: string;
  } | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const [showSignModal, setShowSignModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contractDocRef = useRef<HTMLElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<CanvasPoint | null>(null);
  const [hasSignatureStroke, setHasSignatureStroke] = useState(false);
  const [signatureMode, setSignatureMode] = useState<"draw" | "typed">("draw");
  const [isSignLoading, setIsSignLoading] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [signError, setSignError] = useState("");
  const [signNotice, setSignNotice] = useState("");
  const [isSendingSettlementInquiry, setIsSendingSettlementInquiry] =
    useState(false);
  const [settlementInquiryNotice, setSettlementInquiryNotice] = useState("");
  const [settlementInquiryError, setSettlementInquiryError] = useState("");

  const shareToken = searchParams.get("token") ?? "";
  const supportAccessRequestId = searchParams.get("support") ?? "";
  const accessVerificationKey = `${id ?? ""}:${shareToken}:${supportAccessRequestId}`;
  const [isFetchingSharedContract, setIsFetchingSharedContract] =
    useState(false);
  const [sharedContractError, setSharedContractError] = useState("");
  const [verifiedAccessKey, setVerifiedAccessKey] = useState("");
  const [serverAccessRole, setServerAccessRole] = useState<string>();
  const [supportReason, setSupportReason] = useState("");
  const [supportScope, setSupportScope] = useState<
    "contract" | "contract_and_pdf"
  >("contract");
  const [supportConsentAccepted, setSupportConsentAccepted] = useState(false);
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);
  const [supportNotice, setSupportNotice] = useState("");
  const [deliverables, setDeliverables] = useState<DeliverablesResponse>();
  const [deliverablesError, setDeliverablesError] = useState("");
  const [deliverablesNotice, setDeliverablesNotice] = useState("");
  const [isLoadingDeliverables, setIsLoadingDeliverables] = useState(false);
  const [deliverableForms, setDeliverableForms] = useState<
    Record<string, { url: string; note: string; file?: File }>
  >({});
  const [submittingDeliverableId, setSubmittingDeliverableId] = useState("");
  const [postLinkDraft, setPostLinkDraft] = useState<{
    contractId: string;
    value: string;
  }>();
  const [postLinkError, setPostLinkError] = useState("");
  const [postLinkNotice, setPostLinkNotice] = useState("");
  const [isSubmittingPostLink, setIsSubmittingPostLink] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const getCanvasPoint = (
    e: React.MouseEvent | React.TouchEvent,
  ): CanvasPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const touch = e.touches[0] ?? e.changedTouches[0];
      if (!touch) return null;
      e.preventDefault();
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (signatureMode === "typed") return;
    const point = getCanvasPoint(e);
    if (!point) return;

    isDrawingRef.current = true;
    lastPointRef.current = point;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.beginPath();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (signatureMode === "typed") return;
    if (!isDrawingRef.current) return;
    const point = getCanvasPoint(e);
    const previousPoint = lastPointRef.current;
    const canvas = canvasRef.current;
    if (!point || !previousPoint || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(previousPoint.x, previousPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    if (Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) > 1) {
      setHasSignatureStroke(true);
    }

    lastPointRef.current = point;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignatureStroke(false);
    setSignError("");
  };

  const handleSignComplete = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (signatureMode === "draw" && !hasSignatureStroke) {
      setSignError("서명을 완료하려면 먼저 서명란에 직접 서명해 주세요.");
      return;
    }
    if (!signerName.trim()) {
      setSignError("서명자 이름을 입력해 주세요.");
      return;
    }
    if (!consentAccepted) {
      setSignError("전자서명 동의 확인이 필요합니다.");
      return;
    }

    setSignError("");
    setSignNotice("");
    setIsSignLoading(true);
    const dataUrl =
      signatureMode === "typed"
        ? createTypedSignatureDataUrl(signerName)
        : canvas.toDataURL("image/png");
    if (!dataUrl) {
      setIsSignLoading(false);
      setSignError("서명 이미지를 만들지 못했습니다. 다시 시도해 주세요.");
      return;
    }

    let signedContract: typeof contract | undefined;

    try {
      const response = await apiFetch(
        `/api/contracts/${contract.id}/signatures/influencer`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Yeollock-Share-Token": shareToken,
          },
          body: JSON.stringify({
            signature_data: dataUrl,
            signer_name: signerName.trim(),
            consent_accepted: consentAccepted,
          }),
        },
      );

      const result = (await response.json()) as {
        contract?: typeof contract;
        error?: string;
      };

      if (!response.ok || !result.contract) {
        throw new Error(getSignatureErrorMessage(result.error));
      }

      replaceContract(result.contract);
      signedContract = result.contract;
    } catch (error) {
      setIsSignLoading(false);
      setSignError(
        error instanceof Error
          ? getSignatureErrorMessage(error.message)
          : "서명 저장에 실패했습니다.",
      );
      return;
    }

    setShowSignModal(false);

    let pdfDownloaded = false;
    try {
      const pdfResponse = await apiFetch(
        signedContract?.pdf_url || `/api/contracts/${contract.id}/final-pdf`,
        {
          credentials: "include",
          headers: {
            Accept: "application/pdf",
          },
        },
      );

      if (!pdfResponse.ok) {
        throw new Error(`서명본 PDF 다운로드 실패 (${pdfResponse.status})`);
      }

      downloadBlob(
        await pdfResponse.blob(),
        `${(signedContract?.title ?? contract.title).replace(/\s+/g, "_")}_signed_contract.pdf`,
      );
      pdfDownloaded = true;
    } catch (err) {
      console.error("Signed PDF download error:", err);
    }

    setIsSignLoading(false);
    setSignNotice(
      pdfDownloaded
        ? "계약 서명이 완료되었습니다. 서명본 PDF가 다운로드되었습니다."
        : "계약 서명이 완료되었습니다. PDF 자동 다운로드는 실패했지만 서버 증빙은 저장되었습니다.",
    );
  };

  const loadDeliverables = useCallback(async () => {
    const contractId = contract?.id;
    if (!contractId) return;

    setIsLoadingDeliverables(true);
    setDeliverablesError("");
    setDeliverablesNotice("");

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contractId)}/deliverables`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const data = (await response.json()) as DeliverablesResponse;

      if (!response.ok) {
        throw new Error(
          data.error ?? "컨텐츠 제출 내역을 불러오지 못했습니다.",
        );
      }

      setDeliverables(data);
    } catch (error) {
      setDeliverablesError(
        getDeliverableErrorMessage(
          error instanceof Error ? error.message : undefined,
          "컨텐츠 제출 내역을 불러오지 못했습니다.",
        ),
      );
    } finally {
      setIsLoadingDeliverables(false);
    }
  }, [contract?.id]);

  const submitDeliverable = async (requirementId: string) => {
    if (!contract) return;

    const form = deliverableForms[requirementId] ?? { url: "", note: "" };
    const url = form.url.trim();
    const note = form.note.trim();
    const urlError = validateDeliverableUrl(url);
    const fileError = validateDeliverableFile(form.file);

    if (!url && !form.file) {
      setDeliverablesError("컨텐츠 URL 또는 컨텐츠 파일을 추가해 주세요.");
      setDeliverablesNotice("");
      return;
    }

    if (urlError || fileError) {
      setDeliverablesError(
        urlError ?? fileError ?? "제출 정보를 확인해 주세요.",
      );
      setDeliverablesNotice("");
      return;
    }

    const confirmed = window.confirm(
      "컨텐츠 제출물을 광고주에게 검수 요청할까요? 제출 후 검수 결과가 감사 기록에 남습니다.",
    );
    if (!confirmed) return;

    setSubmittingDeliverableId(requirementId);
    setDeliverablesError("");
    setDeliverablesNotice("");

    try {
      const evidenceFile = form.file
        ? {
            name: form.file.name,
            type: form.file.type,
            size: form.file.size,
            data_url: await readFileAsDataUrl(form.file),
          }
        : undefined;
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/deliverables`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            requirement_id: requirementId,
            url: url || undefined,
            note: note || undefined,
            evidence_file: evidenceFile,
          }),
        },
      );
      const data = (await response.json()) as DeliverablesResponse;

      if (!response.ok) {
        throw new Error(
          getDeliverableErrorMessage(
            data.error,
            `컨텐츠 제출 실패 (${response.status})`,
          ),
        );
      }

      setDeliverables(data);
      setDeliverablesNotice(
        "컨텐츠 제출물을 접수했습니다. 광고주 확인 및 검수 결과를 이 화면에서 확인할 수 있습니다.",
      );
      setDeliverableForms((current) => ({
        ...current,
        [requirementId]: { url: "", note: "" },
      }));
    } catch (error) {
      setDeliverablesError(
        getDeliverableErrorMessage(
          error instanceof Error ? error.message : undefined,
          "컨텐츠 제출에 실패했습니다.",
        ),
      );
    } finally {
      setSubmittingDeliverableId("");
    }
  };

  const submitPostLink = async () => {
    if (!contract) return;

    const postLink = (
      postLinkDraft?.contractId === contract.id
        ? postLinkDraft.value
        : contract.post_link ?? ""
    ).trim();
    const urlError = validateDeliverableUrl(postLink);

    if (!postLink) {
      setPostLinkError("컨텐츠 URL을 입력해 주세요.");
      setPostLinkNotice("");
      return;
    }
    if (urlError) {
      setPostLinkError(urlError);
      setPostLinkNotice("");
      return;
    }

    const confirmed = window.confirm(
      "컨텐츠 URL을 광고주에게 제출할까요? 제출 링크는 광고주 검수 화면과 감사 기록에 남습니다.",
    );
    if (!confirmed) return;

    setIsSubmittingPostLink(true);
    setPostLinkError("");
    setPostLinkNotice("");

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/post-link`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ post_link: postLink }),
        },
      );
      const data = (await response.json()) as {
        contract?: Contract;
        error?: string;
      };

      if (!response.ok || !data.contract) {
        throw new Error(
          getDeliverableErrorMessage(
            data.error,
            `컨텐츠 URL 제출 실패 (${response.status})`,
          ),
        );
      }

      replaceContract(data.contract);
      setPostLinkDraft({
        contractId: data.contract.id,
        value: data.contract.post_link ?? postLink,
      });
      setPostLinkNotice("컨텐츠 URL을 제출했습니다. 광고주에게 제출 완료로 표시됩니다.");
    } catch (error) {
      setPostLinkError(
        error instanceof Error
          ? getDeliverableErrorMessage(
              error.message,
              "컨텐츠 URL 제출에 실패했습니다.",
            )
          : "컨텐츠 URL 제출에 실패했습니다.",
      );
    } finally {
      setIsSubmittingPostLink(false);
    }
  };

  useEffect(() => {
    if (showSignModal && canvasRef.current) {
      const canvas = canvasRef.current;
      isDrawingRef.current = false;
      lastPointRef.current = null;
      setHasSignatureStroke(false);
      setSignatureMode("draw");
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      setSignerName(contract?.influencer_info.name ?? "");
      setConsentAccepted(false);
      setSignError("");
    }
  }, [contract?.influencer_info.name, showSignModal]);

  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        if (selection?.showTooltip) {
          setTimeout(() => setSelection(null), 150);
        }
        return;
      }

      const anchorNode = sel.anchorNode;
      if (!anchorNode) return;

      const clauseEl = anchorNode.parentElement?.closest("[data-clause-id]");
      if (clauseEl) {
        const clauseId = clauseEl.getAttribute("data-clause-id");
        const text = sel.toString().trim();
        if (text && clauseId) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setSelection({
            text,
            clauseId,
            x: rect.left + rect.width / 2,
            y: rect.top,
            showTooltip: true,
          });
        }
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [selection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVerifiedAccessKey("");
      setServerAccessRole(undefined);
      setSharedContractError("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessVerificationKey]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setCurrentTime(Date.now()),
      60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id || verifiedAccessKey === accessVerificationKey) return;
    const needsServerCheck = true;
    if (!needsServerCheck) return;

    let cancelled = false;

    const fetchSharedContract = async () => {
      setIsFetchingSharedContract(true);
      setSharedContractError("");

      try {
        const query = new URLSearchParams();
        if (shareToken) query.set("token", shareToken);
        if (supportAccessRequestId)
          query.set("support", supportAccessRequestId);
        const suffix = query.size > 0 ? `?${query.toString()}` : "";
        const response = await apiFetch(
          `/api/contracts/${encodeURIComponent(id)}${suffix}`,
          {
            headers: {
              Accept: "application/json",
              ...(supportAccessRequestId
                ? {
                    "X-Yeollock-Support-Access-Request": supportAccessRequestId,
                  }
                : {}),
            },
            credentials: "include",
          },
        );
        const data = (await response.json()) as {
          contract?: Contract;
          access_role?: string;
          error?: string;
        };

        if (!response.ok || !data.contract) {
          throw new Error(getContractLoadErrorMessage(data.error));
        }

        if (!cancelled) {
          replaceContract(data.contract);
          setVerifiedAccessKey(accessVerificationKey);
          setServerAccessRole(data.access_role);
        }
      } catch (error) {
        if (!cancelled) {
          setSharedContractError(
            error instanceof Error
              ? getContractLoadErrorMessage(error.message)
              : "계약을 불러올 수 없습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsFetchingSharedContract(false);
        }
      }
    };

    void fetchSharedContract();

    return () => {
      cancelled = true;
    };
  }, [
    contract,
    accessVerificationKey,
    id,
    replaceContract,
    shareToken,
    supportAccessRequestId,
    verifiedAccessKey,
  ]);

  useEffect(() => {
    if (
      (contract?.status === "SIGNED" || contract?.status === "CLOSED") &&
      (serverAccessRole === "influencer" || serverAccessRole === "advertiser")
    ) {
      const timer = window.setTimeout(() => {
        void loadDeliverables();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [contract?.status, loadDeliverables, serverAccessRole]);

  const serverAccessVerified = verifiedAccessKey === accessVerificationKey;
  const shouldWaitForServerAccess = !serverAccessVerified;

  if (shouldWaitForServerAccess && sharedContractError) {
    return (
      <AccessMessage
        title="계약을 불러올 수 없습니다"
        description={sharedContractError}
        actions={
          <>
            <Link
              to="/login/influencer"
              className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              인플루언서 로그인
            </Link>
            <Link
              to="/"
              className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] px-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
            >
              처음으로 이동
            </Link>
          </>
        }
      />
    );
  }

  if (shouldWaitForServerAccess || isFetchingSharedContract) {
    return (
      <AccessMessage
        title="계약을 확인하는 중입니다"
        description="접근 권한을 확인한 뒤 계약 내용을 불러오고 있습니다."
      />
    );
  }

  if (!contract) {
    return (
      <AccessMessage
        title="계약서를 찾을 수 없습니다"
        description="계약서가 삭제되었거나 링크가 만료되었을 수 있습니다. 광고주에게 최신 검토 링크를 다시 요청해 주세요."
        actions={
          <>
            <Link
              to="/login/influencer"
              className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              내 계약함 확인
            </Link>
            <Link
              to="/"
              className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-[#fbfbfc] px-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
            >
              처음으로 이동
            </Link>
          </>
        }
      />
    );
  }

  const expectedShareToken = contract.evidence?.share_token;
  const shareTokenExpired =
    Boolean(contract.evidence?.share_token_expires_at) &&
    new Date(contract.evidence!.share_token_expires_at!).getTime() <
      currentTime;
  const shareTokenRequired =
    contract.evidence?.share_token_status === "active" &&
    Boolean(expectedShareToken);
  const hasValidShareToken =
    serverAccessVerified ||
    !shareTokenRequired ||
    shareToken === expectedShareToken;
  const isOperatorSupportView = serverAccessRole === "admin" && !shareToken;
  const hasAuthenticatedContractAccess =
    serverAccessRole === "advertiser" || serverAccessRole === "influencer";
  const canRequestOperatorSupport =
    serverAccessRole === "advertiser" || serverAccessRole === "influencer";
  const isContractClosed = contract.status === "CLOSED";
  const isContractSignedOrClosed =
    contract.status === "SIGNED" || contract.status === "CLOSED";

  if (
    !isOperatorSupportView &&
    !hasAuthenticatedContractAccess &&
    (contract.status === "DRAFT" ||
      contract.evidence?.share_token_status === "not_issued" ||
      contract.evidence?.share_token_status === "revoked")
  ) {
    return (
      <AccessMessage
        title="아직 활성화되지 않은 검토 링크입니다"
        description="광고주에게 새 계약 검토 링크 발급을 요청해 주세요."
        actions={
          <Link
            to="/login/influencer"
            className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            내 계약함 확인
          </Link>
        }
      />
    );
  }

  if (
    !isOperatorSupportView &&
    !hasAuthenticatedContractAccess &&
    (shareTokenExpired || !hasValidShareToken)
  ) {
    return (
      <AccessMessage
        title="보안 링크가 만료되었습니다"
        description="계속 진행하려면 광고주에게 새 검토 링크를 요청해 주세요."
        actions={
          <Link
            to="/login/influencer"
            className="flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            내 계약함 확인
          </Link>
        }
      />
    );
  }

  const isFixedCampaign = isFixedCampaignContract(contract);
  const allApproved = contract.clauses.every(
    (clause) => clause.status === "APPROVED",
  );
  const pendingClauses = contract.clauses.filter(
    (clause) => clause.status !== "APPROVED",
  ).length;
  const approvedClauses = contract.clauses.length - pendingClauses;
  const lastUpdated = format(new Date(contract.updated_at), "yyyy.MM.dd");
  const deadline = contract.campaign?.deadline
    ? format(new Date(contract.campaign.deadline), "yyyy.MM.dd")
    : contract.campaign?.end_date || contract.campaign?.period || "미지정";
  const displayContractTitle = formatContractTitleForDisplay(contract.title);
  const displayInfluencerName = removeInternalTestLabel(
    contract.influencer_info.name,
    "인플루언서",
  );
  const displayBudget = formatMoneyLabel(contract.campaign?.budget, "미지정");
  const reviewTone = allApproved ? "text-neutral-700" : "text-amber-700";
  const verificationPath = `/influencer/verification?contractId=${encodeURIComponent(
    contract.id,
  )}${shareToken ? `&token=${encodeURIComponent(shareToken)}` : ""}`;
  const currentContractPath = `/contract/${encodeURIComponent(contract.id)}${
    shareToken ? `?token=${encodeURIComponent(shareToken)}` : ""
  }`;
  const loginForVerificationPath = buildLoginRedirect(
    "/login/influencer",
    verificationPath,
    "/influencer/dashboard",
    ["/influencer", "/contract"],
  );
  const signupForContractPath = buildLoginRedirect(
    "/signup/influencer",
    currentContractPath,
    "/influencer/dashboard",
    ["/influencer", "/contract"],
  );
  const influencerVerificationStatus =
    verificationSummary?.influencer.status ?? "not_submitted";
  const influencerRejectionGuidance =
    influencerVerificationStatus === "rejected"
      ? getVerificationRejectionGuidance(
          verificationSummary?.influencer.latest_request,
          "influencer_account",
        )
      : undefined;
  const hasVerificationStatusError =
    Boolean(verificationStatusError) && verificationStatusCode !== 401;
  const isInfluencerAuthenticated =
    Boolean(verificationSummary) && verificationStatusCode !== 401;
  const influencerSessionEmail =
    verificationSummary?.influencer.account?.email?.trim().toLowerCase();
  const contractInfluencerEmail =
    contract.influencer_info.contact?.trim().toLowerCase();
  const isInfluencerContractOwner =
    Boolean(influencerSessionEmail) &&
    Boolean(contractInfluencerEmail) &&
    influencerSessionEmail === contractInfluencerEmail;
  const isInfluencerReviewerAuthenticated =
    isInfluencerAuthenticated &&
    (serverAccessRole === "influencer" || isInfluencerContractOwner);
  const needsInfluencerAccountSession =
    !isInfluencerReviewerAuthenticated || verificationStatusCode === 401;
  const canSubmitClauseReview =
    isInfluencerReviewerAuthenticated &&
    !isOperatorSupportView &&
    !isContractSignedOrClosed;
  const isInfluencerVerificationApproved =
    influencerVerificationStatus === "approved";
  const shareExpiresAt = contract.evidence?.share_token_expires_at
    ? new Date(contract.evidence.share_token_expires_at).getTime()
    : undefined;
  const isContractSignableState =
    contract.status === "APPROVED" &&
    contract.evidence?.share_token_status === "active" &&
    (typeof shareExpiresAt !== "number" || shareExpiresAt > currentTime);
  const requiredContractPlatforms = Array.from(
    new Set(
      contract.campaign?.platforms?.length
        ? contract.campaign.platforms.map(contractPlatformToInfluencerPlatform)
        : [
            inferInfluencerPlatformFromUrl(
              contract.influencer_info.channel_url,
            ),
          ],
    ),
  );
  const approvedPlatforms =
    verificationSummary?.influencer.approved_platforms ?? [];
  const isContractPlatformVerificationApproved =
    isInfluencerVerificationApproved &&
    requiredContractPlatforms.every((platform) =>
      approvedPlatforms.some((approvedPlatform) =>
        approvedPlatformMatchesContract(
          approvedPlatform,
          platform,
          contract.influencer_info.channel_url,
        ),
      ),
    );
  const canOpenSignModal =
    allApproved &&
    !isVerificationLoading &&
    !hasVerificationStatusError &&
    isContractSignableState &&
    isContractPlatformVerificationApproved;
  const signButtonLabel = !allApproved
    ? isFixedCampaign
      ? "내용 확인 필요"
      : "조항 승인 필요"
    : !isContractSignableState
      ? "광고주 서명 요청 대기"
      : isVerificationLoading
        ? "인증 확인 중"
        : hasVerificationStatusError
          ? "인증 다시 확인"
          : needsInfluencerAccountSession
            ? "가입/로그인 후 진행"
            : !isContractPlatformVerificationApproved
              ? "인증 후 서명하기"
              : "동의 후 서명하기";
  const signStatusMessage = !allApproved
    ? isFixedCampaign
      ? "서명 전에 계약 내용을 확인해 주세요."
      : "서명 전에 남은 조항 요청을 먼저 정리해야 합니다."
    : !isContractSignableState
      ? "광고주가 최종본을 승인하고 서명 링크를 활성화하면 서명할 수 있습니다."
      : isVerificationLoading
        ? "서명 가능 여부를 확인하기 위해 계정 인증 상태를 불러오고 있습니다."
        : hasVerificationStatusError
          ? "인증 상태를 불러오지 못했습니다. 잠시 후 다시 확인해주세요."
            : needsInfluencerAccountSession
              ? "계정이 없으면 가입 후 이 계약으로 돌아와 인증과 서명을 이어갈 수 있습니다."
            : !isContractPlatformVerificationApproved
              ? isInfluencerVerificationApproved
                ? isFixedCampaign
                  ? "계약 내용은 확인됐지만, 이 계약에 쓰는 채널 인증을 추가해야 서명할 수 있습니다."
                  : "모든 조항은 준비됐지만, 이 계약에 쓰는 채널 인증을 추가해야 서명할 수 있습니다."
                : isFixedCampaign
                  ? `계약 내용은 확인됐지만, 이 계약 플랫폼의 계정 인증 승인이 필요합니다. 현재 상태: ${verificationStatusLabel(
                      influencerVerificationStatus,
                    )}`
                  : `모든 조항은 준비됐지만, 이 계약 플랫폼의 계정 인증 승인이 필요합니다. 현재 상태: ${verificationStatusLabel(
                      influencerVerificationStatus,
                    )}`
              : isFixedCampaign
                ? "계약 내용과 계정 인증이 완료되어 서명할 수 있습니다."
                : "모든 조항과 계정 인증이 완료되어 서명할 수 있습니다.";
  const heroTitle =
    isContractClosed
      ? "광고 계약이 마감되었습니다"
      : contract.status === "SIGNED"
        ? "서명 완료 후 컨텐츠를 제출하세요"
      : "서명 전 계약 내용을 확인하세요";
  const heroDescription =
    isContractClosed
      ? "컨텐츠 확인 및 검수가 완료되어 추가 제출과 서명 액션은 차단됩니다."
      : contract.status === "SIGNED"
        ? "서명본은 저장되었습니다. 남은 컨텐츠는 URL이나 파일로 제출하고 광고주 확인 및 검수 결과를 확인하세요."
      : needsInfluencerAccountSession
        ? isFixedCampaign
          ? "계약 내용은 먼저 확인할 수 있습니다. 가입 또는 로그인 후 이 계약으로 돌아와 서명합니다."
          : "보안 링크로 계약 내용은 먼저 확인할 수 있습니다. 조항 승인, 수정 요청, 서명은 가입 또는 로그인 후 이 계약으로 돌아와 진행합니다."
        : isFixedCampaign
          ? "계약 내용을 확인하고 계정 인증이 끝나면 바로 서명합니다."
          : "핵심 조건을 먼저 확인하고, 수정이 필요한 조항은 해당 문구를 선택해 요청을 남기세요. 조항과 계정 인증이 모두 준비되면 서명할 수 있습니다.";
  const clauseChecklistLabel = allApproved
    ? isFixedCampaign
      ? "계약 내용 확인 완료"
      : "모든 조항 승인 완료"
    : isFixedCampaign
      ? `내용 확인 ${approvedClauses}/${contract.clauses.length}`
      : `조항 승인 ${approvedClauses}/${contract.clauses.length}`;
  const signatureChecklistChecked =
    isContractSignedOrClosed || canOpenSignModal;
  const signatureChecklistLabel =
    isContractClosed
      ? "전자서명 완료"
      : contract.status === "SIGNED"
      ? "서명 완료"
      : !allApproved
        ? isFixedCampaign
          ? "내용 확인 후 서명 가능"
          : "조항 승인 후 서명 가능"
        : !isContractSignableState
          ? "광고주 서명 요청 대기"
          : isVerificationLoading
            ? "인증 상태 확인 중"
            : hasVerificationStatusError
              ? "인증 상태 확인 필요"
              : needsInfluencerAccountSession
                ? "가입/로그인 후 서명 준비"
                : !isContractPlatformVerificationApproved
                  ? "계정 인증 후 서명 가능"
                  : "서명 가능";
  const verificationPanelTitle = isContractPlatformVerificationApproved
    ? "계정 인증 확인됨"
    : influencerRejectionGuidance
      ? "계정 인증 재제출 필요"
      : isInfluencerVerificationApproved
        ? "계약 채널 인증 필요"
        : "서명 전 계정 인증 필요";
  const verificationPanelDescription = isContractPlatformVerificationApproved
    ? isFixedCampaign
      ? "계정 인증은 확인되었습니다. 서명 가능 여부는 계약 내용 확인과 광고주 서명 요청 상태에 따라 열립니다."
      : "계정 인증은 확인되었습니다. 서명 가능 여부는 조항 승인과 광고주 서명 요청 상태에 따라 열립니다."
    : influencerRejectionGuidance
      ? `계약 검토는 가능하지만 서명은 제한됩니다. 반려 사유: ${influencerRejectionGuidance.reviewerNote}`
      : isInfluencerVerificationApproved
        ? "다른 플랫폼 인증은 완료됐지만, 이 계약에 적힌 채널과 일치하는 인증이 아직 없습니다."
        : "계약 검토는 가능하지만 서명은 계정 인증 승인 후 진행할 수 있습니다.";
  const verificationPanelActionLabel = isContractPlatformVerificationApproved
    ? "인증 정보 보기"
    : needsInfluencerAccountSession
      ? "가입/로그인 후 인증"
      : influencerRejectionGuidance
        ? "계정 인증 재제출"
        : isInfluencerVerificationApproved
          ? "계약 채널 인증"
          : "계정 인증 진행";
  const showContractAccountGuide =
    !isOperatorSupportView &&
    !isContractSignedOrClosed &&
    needsInfluencerAccountSession;
  const advertiserTrust = contract.advertiser_trust;

  const plainSummary = [
    {
      label: "캠페인",
      value: displayContractTitle,
    },
    {
      label: "보상",
      value: displayBudget,
    },
    {
      label: "마감일",
      value: deadline,
    },
    {
      label: "산출물",
      value:
        contract.campaign?.deliverables?.join(", ") ||
        contract.campaign?.platforms?.join(", ") ||
        "조항에서 확인",
    },
  ];
  const signatureData = contract.signature_data;
  const signatureDisplayName =
    signatureData?.signer_name?.trim() || displayInfluencerName;
  const rawFinalPdfHref =
    contract.pdf_url ||
    (isContractSignedOrClosed
      ? apiPath(`/api/contracts/${encodeURIComponent(contract.id)}/final-pdf`)
      : undefined);
  const finalPdfHref =
    rawFinalPdfHref && supportAccessRequestId
      ? `${rawFinalPdfHref}${
          rawFinalPdfHref.includes("?") ? "&" : "?"
        }support=${encodeURIComponent(supportAccessRequestId)}`
      : rawFinalPdfHref;
  const signatureEvidenceRows = signatureData
    ? [
        {
          label: "서명자",
          value: signatureDisplayName,
        },
        { label: "서명 시각", value: formatDateTime(signatureData.signed_at) },
        {
          label: "계약 해시",
          value: signatureData.contract_hash
            ? `${signatureData.contract_hash.slice(0, 12)}...`
            : "-",
        },
        {
          label: "서명 해시",
          value: signatureData.signature_hash
            ? `${signatureData.signature_hash.slice(0, 12)}...`
            : "-",
        },
      ]
    : [];

  const openClauseFeedback = (
    clause: Contract["clauses"][number],
    type: "MODIFICATION_REQUESTED" | "DELETION_REQUESTED",
  ) => {
    if (isFixedCampaign) {
      setFeedbackError("이 계약에서는 수정 요청을 보낼 수 없습니다.");
      return;
    }

    setFeedbackModal({
      isOpen: true,
      type,
      clauseId: clause.clause_id,
      selectedText: `전체 조항: ${formatOperationalText(clause.category)}`,
    });
    setFeedbackComment("");
    setFeedbackError("");
  };

  const approveClause = (clause: Contract["clauses"][number]) => {
    if (!canSubmitClauseReview) {
      setFeedbackModal({
        isOpen: true,
        type: "MODIFICATION_REQUESTED",
        clauseId: clause.clause_id,
        selectedText: `전체 조항: ${formatOperationalText(clause.category)}`,
      });
      setFeedbackError(
        "조항 의견을 남기거나 승인하려면 인플루언서 계정으로 로그인해야 합니다.",
      );
      return;
    }

    updateClauseStatus(
      contract.id,
      clause.clause_id,
      "APPROVED",
      {
        role: "influencer",
        action: "승인" as ClauseHistory["action"],
        comment: "이 조항을 확인하고 승인했습니다.",
        timestamp: new Date().toISOString(),
      },
      { actor: "influencer" },
    );
  };

  const handleFeedbackSubmit = () => {
    if (!feedbackModal) return;
    if (isFixedCampaign) {
      setFeedbackError("이 계약에서는 수정 요청을 보낼 수 없습니다.");
      return;
    }
    if (!canSubmitClauseReview) {
      setFeedbackError(
        "조항 의견을 남기려면 인플루언서 계정으로 로그인해야 합니다.",
      );
      return;
    }
    const trimmedComment = feedbackComment.trim();

    if (!trimmedComment) {
      setFeedbackError(
        "광고주가 요청 의도를 이해할 수 있도록 사유를 입력해 주세요.",
      );
      return;
    }

    setFeedbackError("");
    updateClauseStatus(
      contract.id,
      feedbackModal.clauseId,
      feedbackModal.type,
      {
        role: "influencer",
        action:
          feedbackModal.type === "MODIFICATION_REQUESTED"
            ? "수정 요청"
            : "삭제 요청",
        comment: `[선택 문구: "${feedbackModal.selectedText}"]\n${trimmedComment}`,
        timestamp: new Date().toISOString(),
      },
      { actor: "influencer", shareToken },
    );

    setFeedbackModal(null);
    setFeedbackComment("");
    setFeedbackError("");
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const requestOperatorSupport = async () => {
    const reason = supportReason.trim();

    if (reason.length < 5) {
      setSupportNotice("운영자가 확인할 내용을 5자 이상 남겨주세요.");
      return;
    }
    if (!supportConsentAccepted) {
      setSupportNotice("운영자에게 열람권을 부여하는 데 동의해야 합니다.");
      return;
    }

    setIsRequestingSupport(true);
    setSupportNotice("");

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/support-access-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(shareToken ? { "X-Yeollock-Share-Token": shareToken } : {}),
          },
          body: JSON.stringify({ reason, scope: supportScope }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "운영자 확인 요청을 보내지 못했습니다.",
          ),
        );
      }

      setSupportReason("");
      setSupportConsentAccepted(false);
      setSupportNotice("운영자가 24시간 동안 이 계약을 확인할 수 있습니다.");
    } catch (error) {
      setSupportNotice(
        error instanceof Error
          ? translateApiErrorMessage(
              error.message,
              "운영자 확인 요청을 보내지 못했습니다.",
            )
          : "운영자 확인 요청을 보내지 못했습니다.",
      );
    } finally {
      setIsRequestingSupport(false);
    }
  };

  const requestSettlementInquiry = async () => {
    if (!contract || isSendingSettlementInquiry) return;

    if (!hasAuthenticatedContractAccess || serverAccessRole !== "influencer") {
      navigate(loginForVerificationPath, { replace: true });
      return;
    }

    const confirmed = window.confirm(
      "정산 미지급 문의를 남길까요? 광고주에게 종료된 계약의 정산 확인 요청이 전달됩니다.",
    );
    if (!confirmed) return;

    setIsSendingSettlementInquiry(true);
    setSettlementInquiryNotice("");
    setSettlementInquiryError("");

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/settlement-inquiry`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            message: "계약 종료 후 정산 미지급 문의",
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        contract?: Contract;
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.contract) {
        throw new Error(data.error ?? "정산 문의를 남기지 못했습니다.");
      }

      replaceContract(data.contract);
      setSettlementInquiryNotice(data.message ?? "정산 미지급 문의를 남겼습니다.");
    } catch (error) {
      setSettlementInquiryError(
        error instanceof Error
          ? translateApiErrorMessage(error.message, "정산 문의를 남기지 못했습니다.")
          : "정산 문의를 남기지 못했습니다.",
      );
    } finally {
      setIsSendingSettlementInquiry(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f7f6f3] text-neutral-950">
      {!isOperatorSupportView && !isFixedCampaign && selection?.showTooltip && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full pb-3 animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-150"
          style={{
            top: selection.y,
            left:
              typeof window === "undefined"
                ? selection.x
                : Math.min(Math.max(selection.x, 132), window.innerWidth - 132),
          }}
        >
          <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1 text-white shadow-2xl">
            <button
              className="flex h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold hover:bg-white/10"
              onMouseDown={(e) => {
                e.preventDefault();
                setFeedbackModal({
                  isOpen: true,
                  type: "MODIFICATION_REQUESTED",
                  clauseId: selection.clauseId,
                  selectedText: selection.text,
                });
              }}
            >
              <PenTool className="h-3.5 w-3.5" strokeWidth={1.8} />
              수정 요청
            </button>
            <button
              className="flex h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold text-rose-200 hover:bg-white/10"
              onMouseDown={(e) => {
                e.preventDefault();
                setFeedbackModal({
                  isOpen: true,
                  type: "DELETION_REQUESTED",
                  clauseId: selection.clauseId,
                  selectedText: selection.text,
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              삭제 요청
            </button>
          </div>
          <div className="absolute bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-neutral-950" />
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                보안 계약 검토
              </p>
              <h1 className="truncate text-base font-semibold text-neutral-950 sm:text-lg">
                {displayContractTitle}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <StatusPill status={contract.status} allApproved={allApproved} />
            </div>
            {!isOperatorSupportView ? (
              <ScreenHelpButton
                content={SCREEN_HELP_CONTENT.influencerContract}
                buttonClassName="h-9 w-9 rounded-lg"
              />
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 pb-36 pt-4 sm:px-6 sm:pb-32 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <section className="space-y-4">
          <div className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-neutral-200 bg-[#fbfbfc] px-2.5 py-1 text-xs font-semibold text-neutral-700">
                    {contract.type} 계약
                  </span>
                  <span className="rounded-md border border-neutral-200 bg-[#fbfbfc] px-2.5 py-1 text-xs font-semibold text-neutral-700">
                    보안 링크 확인됨
                  </span>
                  <span className="rounded-md border border-neutral-200 bg-[#fbfbfc] px-2.5 py-1 text-xs font-semibold text-neutral-700 sm:hidden">
                    {getStatusLabel(contract.status)}
                  </span>
                </div>
                <h2 className="break-keep text-[25px] font-semibold leading-tight tracking-tight text-neutral-950 sm:text-3xl">
                  {heroTitle}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                  {heroDescription}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:w-64">
                <MetricCard
                  label={isFixedCampaign ? "확인" : "승인"}
                  value={`${approvedClauses}/${contract.clauses.length}`}
                />
                <MetricCard
                  label="대기"
                  value={String(pendingClauses)}
                  tone={pendingClauses ? "amber" : "neutral"}
                />
              </div>
            </div>
          </div>

          {signNotice && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-[#fcfcfd] px-4 py-3 text-sm font-semibold text-neutral-800 shadow-[inset_3px_0_0_rgba(23,23,23,0.12)]"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-neutral-700" />
                {signNotice}
              </span>
              <button
                type="button"
                onClick={() => setSignNotice("")}
                className="shrink-0 text-xs font-semibold text-neutral-500 hover:text-neutral-900"
              >
                닫기
              </button>
            </div>
          )}

          <AdvertiserTrustNotice
            trust={advertiserTrust}
            advertiserName={contract.advertiser_info?.name || "광고주"}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {plainSummary.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-neutral-200/80 bg-[#fcfcfd] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  {item.label}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-neutral-950">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <section
            ref={contractDocRef}
            className="overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]"
          >
            <div className="border-b border-neutral-200 bg-[#fbfbfc] px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    {isFixedCampaign ? "계약 내용" : "계약 조항"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-neutral-950">
                    {isFixedCampaign ? "내용 확인" : "조항별 검토"}
                  </h2>
                </div>
                <div
                  className={`flex items-center gap-2 text-sm font-medium ${reviewTone}`}
                >
                  {allApproved ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {allApproved
                    ? isFixedCampaign
                      ? "내용 확인 완료"
                      : "조항 승인 완료"
                    : isFixedCampaign
                      ? `${pendingClauses}개 내용 확인 필요`
                      : `${pendingClauses}개 조항 확인 필요`}
                </div>
              </div>
            </div>

            <div className="divide-y divide-neutral-200">
              {contract.clauses.map((clause, index) => {
                const isApproved = clause.status === "APPROVED";

                return (
                  <article
                    key={clause.clause_id}
                    data-clause-id={clause.clause_id}
                    className={`p-5 transition-colors sm:p-6 ${
                      isApproved ? "bg-white" : "bg-amber-50/55"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                            isApproved
                              ? "bg-neutral-100 text-neutral-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-neutral-950">
                            {formatOperationalText(clause.category)}
                          </h3>
                          {!isFixedCampaign && (
                            <p className="mt-1 text-xs text-neutral-500">
                              아래 문구를 정확히 선택하면 수정이나 삭제 요청을 보낼 수 있습니다.
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                          isApproved
                            ? "bg-neutral-100 text-neutral-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {isApproved ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Clock3 className="h-3.5 w-3.5" />
                        )}
                        {isApproved
                          ? isFixedCampaign
                            ? "확인 완료"
                            : "승인 완료"
                          : clause.status === "PENDING_REVIEW"
                            ? isFixedCampaign
                              ? "확인 대기"
                              : "검토 대기"
                            : isFixedCampaign
                              ? "확인 필요"
                              : "수정 요청 중"}
                      </span>
                    </div>

                    <div className="mt-5 rounded-lg border border-neutral-200 bg-white p-4 text-[15px] leading-7 text-neutral-800 selection:bg-neutral-200 selection:text-neutral-950 sm:p-5">
                      <p className="whitespace-pre-wrap">
                        {isFixedCampaign
                          ? formatCustomerContractText(clause.content)
                          : formatOperationalText(clause.content)}
                      </p>
                    </div>

                    {!isOperatorSupportView && !isContractSignedOrClosed && (
                      <div
                        className={`mt-3 grid gap-2 ${
                          isFixedCampaign ? "sm:grid-cols-1" : "sm:grid-cols-3"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => approveClause(clause)}
                          disabled={isApproved || !canSubmitClauseReview}
                          className="h-11 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-800 transition hover:border-neutral-400 hover:bg-[#fbfbfc] disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400"
                        >
                          {isApproved
                            ? isFixedCampaign
                              ? "확인 완료"
                              : "승인 완료"
                            : isFixedCampaign
                              ? "이 내용 확인"
                              : "이 조항 승인"}
                        </button>
                        {!isFixedCampaign && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                openClauseFeedback(clause, "MODIFICATION_REQUESTED")
                              }
                              disabled={!canSubmitClauseReview}
                              className="h-11 rounded-lg border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400"
                            >
                              수정 요청
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openClauseFeedback(clause, "DELETION_REQUESTED")
                              }
                              disabled={!canSubmitClauseReview}
                              className="h-11 rounded-lg border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400"
                            >
                              삭제 요청
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {!isOperatorSupportView &&
                      !isContractSignedOrClosed &&
                      !canSubmitClauseReview && (
                        <div className="mt-3 rounded-lg border border-neutral-200 bg-[#fbfbfc] px-4 py-3 text-xs leading-5 text-neutral-600">
                          <p>
                            {isFixedCampaign
                              ? "계정 생성 또는 로그인 후 이 계약으로 돌아와 내용 확인과 서명을 진행할 수 있습니다."
                              : "계정 생성 또는 로그인 후 이 계약으로 돌아와 의견 제출과 조항 승인을 진행할 수 있습니다."}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Link
                              to={signupForContractPath}
                              className="inline-flex min-h-10 items-center rounded-md bg-neutral-950 px-3 font-semibold text-white transition hover:bg-neutral-800"
                            >
                              가입하고 계속
                            </Link>
                            <button
                              type="button"
                              onClick={() => navigate(loginForVerificationPath)}
                              className="inline-flex min-h-10 items-center rounded-md border border-neutral-200 bg-white px-3 font-semibold text-neutral-950 transition hover:border-neutral-400"
                            >
                              로그인
                            </button>
                          </div>
                        </div>
                      )}

                    {clause.history.length > 0 && (
                      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
                        <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                          <MessageSquare className="h-4 w-4" />
                          협의 이력
                        </div>
                        <div className="space-y-4">
                          {clause.history.map((historyItem) => (
                            <div
                              key={historyItem.id}
                              className="border-l-2 border-neutral-200 pl-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-neutral-950">
                                  {historyItem.role === "influencer"
                                    ? "나"
                                    : "광고주"}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {format(
                                    new Date(historyItem.timestamp),
                                    "yyyy.MM.dd HH:mm",
                                  )}
                                </span>
                                <span className="rounded-md border border-neutral-200 bg-[#fbfbfc] px-2 py-0.5 text-xs font-semibold text-neutral-600">
                                  {formatOperationalText(historyItem.action)}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                                {formatOperationalText(historyItem.comment)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {isContractSignedOrClosed && (
            <>
              <PostLinkSubmissionPanel
                value={
                  postLinkDraft?.contractId === contract.id
                    ? postLinkDraft.value
                    : contract.post_link ?? ""
                }
                currentLink={contract.post_link}
                error={postLinkError}
                notice={postLinkNotice}
                isSubmitting={isSubmittingPostLink}
                canSubmit={
                  !isContractClosed &&
                  hasAuthenticatedContractAccess &&
                  serverAccessRole === "influencer"
                }
                isClosed={isContractClosed}
                loginHref={loginForVerificationPath}
                onChange={(value) => {
                  setPostLinkDraft({ contractId: contract.id, value });
                  if (postLinkError) setPostLinkError("");
                  if (postLinkNotice) setPostLinkNotice("");
                }}
                onSubmit={submitPostLink}
              />
              <InfluencerDeliverablesPanel
                data={deliverables}
                error={deliverablesError}
                notice={deliverablesNotice}
                isLoading={isLoadingDeliverables}
                forms={deliverableForms}
                submittingRequirementId={submittingDeliverableId}
                onReload={loadDeliverables}
                onFormChange={(requirementId, patch) =>
                  setDeliverableForms((current) => ({
                    ...current,
                    [requirementId]: {
                      ...(current[requirementId] ?? { url: "", note: "" }),
                      ...patch,
                    },
                  }))
                }
                onSubmit={submitDeliverable}
                loginHref={loginForVerificationPath}
                canSubmit={
                  !isContractClosed &&
                  hasAuthenticatedContractAccess &&
                  serverAccessRole === "influencer"
                }
                isClosed={isContractClosed}
              />
              {isContractClosed ? (
                <section className="rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-neutral-950">
                        정산 확인
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        종료된 계약의 미지급 건만 광고주에게 문의할 수 있습니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void requestSettlementInquiry()}
                      disabled={isSendingSettlementInquiry}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                    >
                      {isSendingSettlementInquiry
                        ? "문의 남기는 중"
                        : "정산 미지급 문의"}
                    </button>
                  </div>
                  {settlementInquiryNotice ? (
                    <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      {settlementInquiryNotice}
                    </p>
                  ) : null}
                  {settlementInquiryError ? (
                    <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      {settlementInquiryError}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <div className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                <FileText className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-950">
                  검토 체크리스트
                </p>
                <p className="text-xs text-neutral-500">
                  최근 수정 {lastUpdated}
                </p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <ChecklistRow checked label="보안 링크 확인됨" />
              <ChecklistRow
                checked={allApproved}
                label={clauseChecklistLabel}
              />
              <ChecklistRow
                checked={signatureChecklistChecked}
                label={signatureChecklistLabel}
              />
              {isContractSignedOrClosed && (
                <ChecklistRow
                  checked={Boolean(contract.post_link)}
                  label="컨텐츠 URL 제출"
                />
              )}
              {isContractSignedOrClosed && deliverables?.summary && (
                <>
                  <ChecklistRow
                    checked={
                      deliverables.summary.total === 0 ||
                      deliverables.summary.submitted >=
                        deliverables.summary.total
                    }
                    label={`컨텐츠 파일 제출 ${deliverables.summary.submitted}/${deliverables.summary.total}`}
                  />
                  <ChecklistRow
                    checked={deliverables.summary.submitted > 0}
                    label="광고주 검수 대기"
                  />
                  <ChecklistRow
                    checked={
                      deliverables.summary.total === 0 ||
                      deliverables.summary.approved >=
                        deliverables.summary.total
                    }
                    label={`컨텐츠 승인 ${deliverables.summary.approved}/${deliverables.summary.total}`}
                  />
                  <ChecklistRow
                    checked={isContractClosed}
                    label="광고 계약 마감"
                  />
                </>
              )}
            </div>
          </div>

          {showContractAccountGuide && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 ring-1 ring-blue-100">
                  <Link2 className="h-5 w-5" strokeWidth={1.9} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-950">
                    계정이 없어도 먼저 검토할 수 있어요
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">
                    받은 계약은 지금 확인하고, 가입 후 같은 계약으로 돌아와
                    승인과 서명을 이어갑니다.
                  </p>
                </div>
              </div>
              <ol className="mt-4 grid gap-2">
                {CONTRACT_ACCOUNT_GUIDE_STEPS.map((step, index) => (
                  <li
                    key={step}
                    className="flex items-center gap-2 text-xs font-semibold text-neutral-700"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-[10px] leading-none text-white">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Link
                  to={signupForContractPath}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  가입하고 이 계약 계속
                </Link>
                <Link
                  to={loginForVerificationPath}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-100 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
                >
                  기존 계정 로그인
                </Link>
              </div>
              <p className="mt-3 text-[11px] font-semibold leading-5 text-blue-900/70">
                가입 또는 로그인 후 이 계약 링크로 다시 연결됩니다.
              </p>
            </div>
          )}

          {!isOperatorSupportView && (
            <div className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-950">
                    {verificationPanelTitle}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    {verificationPanelDescription}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    isInfluencerReviewerAuthenticated
                      ? verificationPath
                      : signupForContractPath,
                  )
                }
                className="mt-4 h-10 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]"
              >
                {verificationPanelActionLabel}
              </button>
            </div>
          )}

          <div className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
            {isOperatorSupportView ? (
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                  <LifeBuoy className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-950">
                    운영자 지원 열람 중
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">
                    당사자 요청으로 열린 화면입니다. 본문과 PDF 열람은 감사
                    기록에 남습니다.
                  </p>
                </div>
              </div>
            ) : canRequestOperatorSupport ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg outline-none transition hover:bg-[#fbfbfc] focus-visible:ring-2 focus-visible:ring-neutral-950">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                    <LifeBuoy className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-950">
                      운영자 확인 요청
                    </p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                      필요할 때만 열어 24시간 열람권을 부여합니다.
                    </p>
                  </div>
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-neutral-400 transition group-open:rotate-180" />
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-2 text-[11px] font-semibold leading-5 text-neutral-500">
                    계약 해석이나 증빙 확인이 필요한 경우에만 사용하세요. 요청
                    사유와 열람 범위는 감사 기록에 남습니다.
                  </p>
                  <Textarea
                    className="min-h-[88px] rounded-lg border-neutral-200 bg-white p-3 text-sm text-neutral-950 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-950"
                    placeholder="예: 조항 해석을 확인해 주세요."
                    value={supportReason}
                    onChange={(event) => setSupportReason(event.target.value)}
                  />
                  <div className="grid gap-2">
                    {[
                      {
                        value: "contract" as const,
                        label: "계약 본문만",
                        description: "조항과 상태 확인에 필요한 최소 범위",
                      },
                      {
                        value: "contract_and_pdf" as const,
                        label: "본문 + 서명 PDF",
                        description: "서명 증빙 확인이 필요한 경우에만 선택",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSupportScope(option.value)}
                        className={`rounded-lg border px-3 py-2 text-left transition ${
                          supportScope === option.value
                            ? "border-neutral-950 bg-neutral-950 text-white"
                            : "border-neutral-200 bg-[#fbfbfc] text-neutral-700 hover:border-neutral-400"
                        }`}
                      >
                        <span className="block text-xs font-semibold">
                          {option.label}
                        </span>
                        <span
                          className={`mt-1 block text-[11px] leading-4 ${
                            supportScope === option.value
                              ? "text-neutral-300"
                              : "text-neutral-500"
                          }`}
                        >
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-3 text-left text-[12px] leading-5 text-neutral-600">
                    <input
                      type="checkbox"
                      checked={supportConsentAccepted}
                      onChange={(event) =>
                        setSupportConsentAccepted(event.target.checked)
                      }
                      className="mt-0.5 h-10 w-10 shrink-0 rounded border-neutral-300 text-neutral-950 accent-neutral-950"
                    />
                    <span>
                      선택한 범위의 계약 자료를 운영자가 24시간 확인하고, 열람
                      기록이 감사 로그에 남는 것에 동의합니다.
                    </span>
                  </label>
                  {supportNotice && (
                    <p
                      role="status"
                      aria-live="polite"
                      className="text-xs font-semibold text-neutral-600"
                    >
                      {supportNotice}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={requestOperatorSupport}
                    disabled={
                      isRequestingSupport ||
                      supportReason.trim().length < 5 ||
                      !supportConsentAccepted
                    }
                    className="h-10 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500"
                  >
                    요청 보내기
                  </button>
                </div>
              </details>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                    <LifeBuoy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      로그인 후 요청 가능
                    </p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                      운영자 열람은 계약 당사자가 로그인한 뒤 명시적으로
                      허용해야 합니다.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(loginForVerificationPath)}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
                >
                  로그인하고 요청하기
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
              계약 당사자
            </p>
            <div className="mt-4 space-y-4">
              <PartyRow
                label="광고주"
                value={contract.advertiser_info?.name || "광고주"}
              />
              <PartyRow label="인플루언서" value={displayInfluencerName} />
            </div>
            {isContractSignedOrClosed && signatureData && (
              <div className="mt-5 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-700">
                    서명 증빙
                  </p>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
                    감사 기록 저장
                  </span>
                </div>
                {signatureData.inf_sign ? (
                  <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-3">
                    <img
                      src={signatureData.inf_sign}
                      alt="인플루언서 서명"
                      className="h-12 max-w-full mix-blend-multiply"
                    />
                    <p className="mt-2 text-sm font-semibold text-neutral-950">
                      {signatureDisplayName}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-neutral-200 bg-white px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                      인플루언서 전자서명
                    </p>
                    <p className="mt-2 border-b border-neutral-300 pb-1 text-lg font-semibold text-neutral-950">
                      {signatureDisplayName}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-neutral-500">
                      서명 원본은 안전 저장소에 보관됩니다.
                    </p>
                  </div>
                )}
                <div className="mt-4 grid gap-2">
                  {signatureEvidenceRows.map((row) => (
                    <div key={row.label}>
                      <PartyRow label={row.label} value={row.value} />
                    </div>
                  ))}
                </div>
                {finalPdfHref && (
                  <a
                    href={finalPdfHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800"
                  >
                    서명본 PDF 내려받기
                  </a>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>

      {!isOperatorSupportView && !isContractSignedOrClosed && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  allApproved
                    ? "bg-neutral-100 text-neutral-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {allApproved ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-950">
                  {signStatusMessage}
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  서명하면 감사 이력이 기록되고 서명본 PDF가 다운로드됩니다.
                </p>
              </div>
            </div>
            <button
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition sm:w-auto sm:min-w-56 ${
                canOpenSignModal ||
                (allApproved &&
                  isContractSignableState &&
                  !isVerificationLoading)
                  ? "bg-neutral-950 text-white hover:bg-neutral-800"
                  : "cursor-not-allowed bg-neutral-200 text-neutral-500"
              }`}
              disabled={
                !allApproved ||
                isVerificationLoading ||
                !isContractSignableState
              }
              onClick={() => {
                if (hasVerificationStatusError) {
                  void refreshVerificationSummary();
                  return;
                }

                if (canOpenSignModal) {
                  setShowSignModal(true);
                  return;
                }

                navigate(
                  isInfluencerReviewerAuthenticated
                    ? verificationPath
                    : signupForContractPath,
                );
              }}
            >
              <FileSignature className="h-4 w-4" />
              {signButtonLabel}
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={feedbackModal?.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFeedbackModal(null);
            setFeedbackError("");
          }
        }}
      >
        <DialogContent className="overflow-hidden rounded-[22px] border-neutral-200/90 bg-white p-0 shadow-[0_1px_0_rgba(15,23,42,0.035),0_24px_70px_rgba(15,23,42,0.14)] sm:max-w-lg">
          <div className="border-b border-neutral-200/80 bg-white p-6">
            <DialogHeader>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
                  <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="text-[12px] font-bold text-neutral-500">
                  안전한 계약 의견
                </span>
              </div>
              <DialogTitle className="font-neo-heavy text-[24px] leading-tight tracking-[-0.035em] text-neutral-950">
                {feedbackModal?.type === "MODIFICATION_REQUESTED"
                  ? "조항 수정 요청"
                  : "조항 삭제 요청"}
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-6 text-neutral-600">
                광고주가 빠르게 판단할 수 있도록 요청 사유와 맥락을 남겨주세요.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-4 p-6">
            <div className="rounded-[16px] border border-neutral-200 bg-[#fbfaf7] p-4 text-sm leading-6 text-neutral-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              "{feedbackModal?.selectedText}"
            </div>
            <Textarea
              className="min-h-[132px] resize-none rounded-[16px] border-neutral-200 bg-[#fbfaf7] p-4 text-sm font-semibold text-neutral-950 placeholder:text-neutral-400 focus-visible:border-neutral-950 focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-neutral-950/10"
              placeholder={
                feedbackModal?.type === "MODIFICATION_REQUESTED"
                  ? "예: 게시 유지 기간을 3개월로 조정해 주세요."
                  : "예: 이 조항은 합의한 캠페인 범위에 해당하지 않습니다."
              }
              value={feedbackComment}
              onChange={(e) => {
                setFeedbackComment(e.target.value);
                if (feedbackError) setFeedbackError("");
              }}
            />
            {feedbackError && (
              <p
                role="alert"
                aria-live="assertive"
                className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
              >
                {feedbackError}
              </p>
            )}
          </div>
          <div className="flex gap-3 border-t border-neutral-200 bg-[#fbfaf7] p-4">
            <button
              className="h-11 flex-1 rounded-[12px] border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100"
              onClick={() => {
                setFeedbackModal(null);
                setFeedbackError("");
              }}
            >
              취소
            </button>
            <button
              className="h-11 flex-[2] rounded-[12px] bg-neutral-950 text-sm font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
              onClick={handleFeedbackSubmit}
              disabled={!feedbackComment.trim()}
            >
              요청 보내기
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSignModal}
        onOpenChange={(open) => {
          setShowSignModal(open);
          if (!open) setSignError("");
        }}
      >
        <DialogContent className="overflow-hidden rounded-[22px] border-neutral-200/90 bg-white p-0 shadow-[0_1px_0_rgba(15,23,42,0.035),0_24px_70px_rgba(15,23,42,0.14)] sm:max-w-lg">
          <div className="border-b border-neutral-200/80 bg-white p-6">
            <DialogHeader>
              <DialogTitle className="font-neo-heavy flex items-center gap-3 text-[24px] leading-tight tracking-[-0.035em] text-neutral-950">
                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-neutral-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_18px_rgba(15,23,42,0.12)]">
                  <FileSignature className="h-4 w-4" strokeWidth={1.8} />
                </span>
                동의 후 서명
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-6 text-neutral-600">
                {isFixedCampaign
                  ? "서명은 계약 내용을 확인하고 동의했다는 증빙으로 남습니다. 완료 후 서명본 PDF가 생성됩니다."
                  : "서명은 승인된 모든 조항을 확인하고 동의했다는 증빙으로 남습니다. 완료 후 서명본 PDF가 생성됩니다."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-[16px] border border-neutral-200 bg-[#fbfaf7] p-4 text-sm leading-6 text-neutral-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              {isFixedCampaign
                ? "계약 내용 확인이 완료되었습니다. 서명자 이름과 동의 여부는 감사 기록에 함께 저장됩니다."
                : "모든 조항이 승인되었습니다. 서명자 이름과 동의 여부는 감사 기록에 함께 저장됩니다."}
            </div>
            <label className="block">
              <span className="text-[13px] font-semibold text-neutral-800">
                서명자 이름
              </span>
              <input
                value={signerName}
                onChange={(event) => {
                  setSignerName(event.target.value);
                  if (signError) setSignError("");
                }}
                className="mt-2 h-11 w-full rounded-[12px] border border-neutral-200 bg-[#fbfaf7] px-3 text-sm font-semibold text-neutral-950 outline-none transition focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.08)]"
                placeholder="이름 또는 활동명"
              />
            </label>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="서명 입력 방식"
            >
              {[
                { value: "draw" as const, label: "직접 서명" },
                { value: "typed" as const, label: "이름으로 서명" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={signatureMode === option.value}
                  onClick={() => {
                    setSignatureMode(option.value);
                    setSignError("");
                    if (option.value === "typed") clearSignature();
                  }}
                  className={`h-10 rounded-[12px] border text-sm font-semibold transition ${
                    signatureMode === option.value
                      ? "border-neutral-950 bg-neutral-950 text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="relative h-48 overflow-hidden rounded-[16px] border border-neutral-300 bg-white">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="직접 서명 입력 영역"
                className={`h-full w-full touch-none ${
                  signatureMode === "draw"
                    ? "cursor-crosshair"
                    : "cursor-default opacity-20"
                }`}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {signatureMode === "typed" && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  <p className="max-w-full truncate font-serif text-3xl text-neutral-950">
                    {signerName.trim() || "Typed signature"}
                  </p>
                  <div className="mt-4 h-px w-full max-w-[320px] bg-neutral-900" />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    Typed electronic signature
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={clearSignature}
                disabled={signatureMode === "typed"}
                className="absolute right-3 top-3 flex h-9 items-center gap-2 rounded-[12px] border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Eraser className="h-3.5 w-3.5" strokeWidth={1.8} />
                지우기
              </button>
            </div>
            <p
              className={`text-sm font-medium ${
                signatureMode === "typed" || hasSignatureStroke
                  ? "text-neutral-800"
                  : "text-amber-700"
              }`}
            >
              {signatureMode === "typed"
                ? "입력한 이름을 전자서명 이미지로 기록합니다."
                : hasSignatureStroke
                  ? "서명이 입력되었습니다."
                  : "서명란에 직접 서명해 주세요."}
            </p>
            <label className="flex items-start gap-3 rounded-[16px] border border-neutral-200 bg-white p-3 text-sm leading-5 text-neutral-700">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => {
                  setConsentAccepted(event.target.checked);
                  if (signError) setSignError("");
                }}
                className="mt-1 h-4 w-4 accent-neutral-950"
              />
              <span>
                {isFixedCampaign
                  ? "계약 내용을 확인했고 전자서명에 동의합니다."
                  : "계약 조항을 확인했고 전자서명에 동의합니다."}
              </span>
            </label>
            {signError && (
              <p
                role="alert"
                aria-live="assertive"
                className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
              >
                {signError}
              </p>
            )}
          </div>

          <div className="flex gap-3 border-t border-neutral-200 bg-[#fbfaf7] p-4">
            <button
              className="h-11 flex-1 rounded-[12px] border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100"
              onClick={() => setShowSignModal(false)}
            >
              취소
            </button>
            <button
              className="h-11 flex-[2] rounded-[12px] bg-neutral-950 text-sm font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
              onClick={handleSignComplete}
              disabled={
                isSignLoading ||
                (signatureMode === "draw" && !hasSignatureStroke) ||
                !consentAccepted ||
                !signerName.trim()
              }
            >
              {isSignLoading ? "완료 중..." : "서명 완료"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfluencerDeliverablesPanel({
  data,
  error,
  notice,
  isLoading,
  forms,
  submittingRequirementId,
  canSubmit,
  isClosed,
  loginHref,
  onReload,
  onFormChange,
  onSubmit,
}: {
  data?: DeliverablesResponse;
  error: string;
  notice: string;
  isLoading: boolean;
  forms: Record<string, { url: string; note: string; file?: File }>;
  submittingRequirementId: string;
  canSubmit: boolean;
  isClosed: boolean;
  loginHref: string;
  onReload: () => void;
  onFormChange: (
    requirementId: string,
    patch: Partial<{ url: string; note: string; file?: File }>,
  ) => void;
  onSubmit: (requirementId: string) => void;
}) {
  const requirements = data?.requirements ?? [];
  const summary = data?.summary;
  const isInitialLoading = isLoading && !data;

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="border-b border-neutral-200 bg-[#fbfbfc] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              컨텐츠 파일 제출
            </p>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">
              캡처, PDF, 스토리 캡처 보관
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              광고 계약 이행 확인에 필요한 컨텐츠 파일을 제출합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onReload}
            disabled={isLoading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400 disabled:text-neutral-300"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            새로고침
          </button>
        </div>
        {summary && (
          <p className="mt-2 text-xs font-semibold text-neutral-500">
            제출 {summary.submitted}/{summary.total} · 승인 {summary.approved}/
            {summary.total}
          </p>
        )}
      </div>

      {!canSubmit && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 sm:px-6">
          {isClosed ? (
            "광고 계약이 마감되어 추가 컨텐츠 제출은 차단됩니다."
          ) : (
            <>
              컨텐츠 제출은 로그인한 인플루언서 계정에서만 가능합니다.
              <a href={loginHref} className="ml-2 underline underline-offset-4">
                로그인
              </a>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 sm:px-6">
          {error}
        </div>
      )}

      {notice && !error && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 sm:px-6">
          {notice}
        </div>
      )}

      <div className="divide-y divide-neutral-100">
        {isInitialLoading ? (
          <div className="p-5 text-sm font-semibold text-neutral-500 sm:p-6">
            제출 항목을 불러오는 중입니다.
          </div>
        ) : requirements.length === 0 ? (
          <div className="p-5 text-sm leading-6 text-neutral-500 sm:p-6">
            제출할 컨텐츠 항목이 아직 없습니다.
          </div>
        ) : (
          requirements.map((requirement) => {
            const form = forms[requirement.id] ?? { url: "", note: "" };
            const approvedCount = requirement.submissions.filter(
              (submission) => submission.review_status === "approved",
            ).length;
            const submittedCount = requirement.submissions.filter(
              (submission) =>
                submittedReviewStatuses.has(submission.review_status),
            ).length;
            const pendingReviewCount = requirement.submissions.filter(
              (submission) => submission.review_status === "submitted",
            ).length;
            const revisionRequest = [...requirement.submissions]
              .reverse()
              .find((submission) =>
                isDeliverableRevisionStatus(submission.review_status),
              );
            const isComplete = approvedCount >= requirement.quantity;
            const isSubmitting = submittingRequirementId === requirement.id;
            const statusText = isComplete
              ? "승인 완료"
              : revisionRequest
                ? "재제출 필요"
                : pendingReviewCount > 0
                  ? "검수 대기"
                  : "제출 필요";
            const statusTone = isComplete
              ? "bg-emerald-50 text-emerald-700"
              : revisionRequest
                ? "bg-amber-50 text-amber-800"
                : pendingReviewCount > 0
                  ? "bg-sky-50 text-sky-700"
                  : "bg-amber-50 text-amber-700";
            const urlError = validateDeliverableUrl(form.url);
            const fileError = validateDeliverableFile(form.file);
            const hasFormError = Boolean(urlError || fileError);

            return (
              <article key={requirement.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-neutral-950">
                      {formatOperationalText(requirement.title)}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-neutral-500">
                      필요 {requirement.quantity}건 · 제출 {submittedCount}건 ·
                      승인 {approvedCount}건
                    </p>
                    {revisionRequest?.review_comment && (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                        광고주 요청:{" "}
                        {formatOperationalText(revisionRequest.review_comment)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      statusTone
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Clock3 className="h-3.5 w-3.5" />
                    )}
                    {statusText}
                  </span>
                </div>

                {requirement.submissions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {requirement.submissions.map((submission) => {
                      const note = formatOperationalText(
                        getSubmissionNote(submission),
                      );

                      return (
                        <div
                          key={submission.id}
                          className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${reviewStatusTone(
                                submission.review_status,
                              )}`}
                            >
                              {reviewStatusLabel(submission.review_status)}
                            </span>
                            <span className="text-xs text-neutral-400">
                              {formatDateTime(submission.submitted_at)}
                            </span>
                          </div>
                          {submission.url && (
                            <a
                              href={submission.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-2 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-neutral-900 underline underline-offset-4"
                            >
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">
                                {formatPublicUrlLabel(
                                  submission.url,
                                  "컨텐츠 제출 링크 열기",
                                )}
                              </span>
                            </a>
                          )}
                          {submission.files.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {submission.files.map((file) => (
                                <a
                                  key={file.id}
                                  href={file.download_url}
                                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-semibold text-neutral-700"
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {file.file_name ?? "컨텐츠 파일"}
                                  </span>
                                  {formatFileSize(file.byte_size) && (
                                    <span className="shrink-0 text-neutral-400">
                                      {formatFileSize(file.byte_size)}
                                    </span>
                                  )}
                                </a>
                              ))}
                            </div>
                          )}
                          {note && (
                            <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs leading-5 text-neutral-600 ring-1 ring-neutral-200">
                              제출 메모: {note}
                            </p>
                          )}
                          {submission.review_comment && (
                            <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs leading-5 text-neutral-600 ring-1 ring-neutral-200">
                              광고주 코멘트:{" "}
                              {formatOperationalText(submission.review_comment)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {canSubmit && !isComplete && (
                  <div className="mt-4 grid gap-3 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4">
                    <label className="block">
                      <span className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                        <Link2 className="h-3.5 w-3.5" />
                        컨텐츠 URL
                      </span>
                      <input
                        value={form.url}
                        onChange={(event) =>
                          onFormChange(requirement.id, {
                            url: event.target.value,
                          })
                        }
                        className={`mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition focus:border-neutral-950 ${
                          urlError ? "border-rose-300" : "border-neutral-200"
                        }`}
                        placeholder="https://..."
                        aria-invalid={Boolean(urlError)}
                      />
                      {urlError && (
                        <span className="mt-1 block text-xs font-semibold text-rose-700">
                          {urlError}
                        </span>
                      )}
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-neutral-700">
                        메모
                      </span>
                      <textarea
                        value={form.note}
                        onChange={(event) =>
                          onFormChange(requirement.id, {
                            note: event.target.value,
                          })
                        }
                        className="mt-2 min-h-20 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-950"
                        placeholder="광고주가 확인할 내용을 적어 주세요."
                      />
                    </label>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700">
                      <Upload className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">
                        {form.file ? form.file.name : "컨텐츠 파일 선택"}
                      </span>
                      {form.file && formatFileSize(form.file.size) && (
                        <span className="shrink-0 text-xs text-neutral-400">
                          {formatFileSize(form.file.size)}
                        </span>
                      )}
                      <input
                        type="file"
                        accept={DELIVERABLE_FILE_ACCEPT}
                        className="sr-only"
                        onChange={(event) =>
                          onFormChange(requirement.id, {
                            file: event.target.files?.[0],
                          })
                        }
                      />
                    </label>
                    {fileError && (
                      <p className="text-xs font-semibold text-rose-700">
                        {fileError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onSubmit(requirement.id)}
                      disabled={
                        isSubmitting ||
                        hasFormError ||
                        (!form.url.trim() && !form.file)
                      }
                      className="h-10 rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500"
                    >
                      {isSubmitting ? "제출 중" : "검수 요청"}
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function PostLinkSubmissionPanel({
  value,
  currentLink,
  error,
  notice,
  isSubmitting,
  canSubmit,
  isClosed,
  loginHref,
  onChange,
  onSubmit,
}: {
  value: string;
  currentLink?: string;
  error: string;
  notice: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  isClosed: boolean;
  loginHref: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const urlError = validateDeliverableUrl(value);
  const disabled =
    !canSubmit || isSubmitting || !value.trim() || Boolean(urlError);

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="border-b border-neutral-200 bg-[#fbfbfc] px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              컨텐츠 URL 제출
            </p>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">
              컨텐츠 제출 링크
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              광고주는 이 링크를 기준으로 광고표시, 필수 해시태그, 브랜드 태그, 게시일을 확인합니다.
            </p>
          </div>
          {currentLink ? (
            <a
              href={currentLink}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              컨텐츠 제출 링크 열기
            </a>
          ) : null}
        </div>
      </div>

      {!canSubmit && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 sm:px-6">
          {isClosed ? (
            "광고 계약이 마감되어 추가 컨텐츠 URL 제출은 차단됩니다."
          ) : (
            <>
              컨텐츠 URL 제출은 로그인한 인플루언서 계정에서만 가능합니다.
              <a href={loginHref} className="ml-2 underline underline-offset-4">
                로그인
              </a>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 sm:px-6">
          {error}
        </div>
      )}

      {notice && !error && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 sm:px-6">
          {notice}
        </div>
      )}

      <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_140px] sm:p-6">
        <label className="block min-w-0">
          <span className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
            <Link2 className="h-3.5 w-3.5" />
            컨텐츠 URL
          </span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={`mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition focus:border-neutral-950 ${
              urlError ? "border-rose-300" : "border-neutral-200"
            }`}
            placeholder="https://..."
            aria-invalid={Boolean(urlError || error)}
            disabled={!canSubmit || isSubmitting}
          />
          {urlError && (
            <span className="mt-1 block text-xs font-semibold text-rose-700">
              {urlError}
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="mt-6 h-10 rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 sm:mt-auto"
        >
          {isSubmitting ? "제출 중" : "컨텐츠 URL 제출"}
        </button>
      </div>
    </section>
  );
}

function AccessMessage({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f6f3] px-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-200/80 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_60px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-neutral-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
        {actions ? <div className="mt-6 grid gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function AdvertiserTrustNotice({
  trust,
  advertiserName,
}: {
  trust?: Contract["advertiser_trust"];
  advertiserName: string;
}) {
  if (!trust) return null;

  const riskLevel = trust.risk_level ?? "low";
  const riskTone =
    riskLevel === "high"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : riskLevel === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const verificationTone =
    trust.business_verification_status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  const riskLabel =
    riskLevel === "high" ? "높음" : riskLevel === "medium" ? "주의" : "낮음";
  const visibleFlags = (trust.risk_flags ?? []).filter(
    (flag) => flag.code !== "first_contract_on_yeollock",
  );
  const rows = [
    {
      label: "인증 사업자",
      value: trust.business_name || advertiserName,
    },
    {
      label: "사업자번호",
      value: trust.business_registration_number_masked || "확인 완료",
    },
    {
      label: "대표자",
      value: trust.representative_name || "인증 정보 기준 확인",
    },
    {
      label: "담당자 확인",
      value: trust.manager_phone || "계약 전 통화 또는 공식 채널로 확인",
    },
  ];

  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${verificationTone}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {trust.business_verification_label || "사업자 정보 확인"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone}`}
              >
                위험점수 {trust.risk_score ?? 0}/100 · {riskLabel}
              </span>
            </div>
            <h3 className="mt-3 break-keep text-lg font-semibold tracking-tight text-neutral-950">
              {trust.first_contract
                ? "연락미에서 처음 광고 계약을 진행하는 광고주입니다"
                : "광고주 사업자 확인 정보를 다시 확인하세요"}
            </h3>
            <p className="mt-2 max-w-2xl break-keep text-sm leading-6 text-neutral-600">
              {trust.guidance ||
                "계약 전 사업자 정보와 담당자가 맞는지 유선 또는 공식 채널로 한 번 더 확인하세요."}
            </p>
          </div>
        </div>
        {riskLevel !== "low" && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.8} />
            확인 후 서명 권장
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-lg border border-neutral-200 bg-[#fcfcfd] p-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              {row.label}
            </p>
            <p className="mt-1 break-keep text-sm font-semibold leading-5 text-neutral-950">
              {row.value}
            </p>
          </div>
        ))}
      </div>

      {visibleFlags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleFlags.slice(0, 4).map((flag) => (
            <span
              key={flag.code}
              className="rounded-full border border-neutral-200 bg-[#fbfbfc] px-2.5 py-1 text-xs font-semibold text-neutral-600"
            >
              {flag.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusPill({
  status,
  allApproved,
}: {
  status: ContractStatus;
  allApproved: boolean;
}) {
  const isSigned = status === "SIGNED" || status === "CLOSED";
  const isReady = allApproved || status === "APPROVED";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
        isSigned
          ? "bg-neutral-100 text-neutral-700"
          : isReady
            ? "bg-neutral-100 text-neutral-700"
            : "bg-amber-50 text-amber-700"
      }`}
    >
      {isSigned ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : isReady ? (
        <FileSignature className="h-3.5 w-3.5" />
      ) : (
        <Clock3 className="h-3.5 w-3.5" />
      )}
      {getStatusLabel(status)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "amber";
}) {
  const toneClass =
    tone === "amber"
      ? "border border-amber-200 bg-amber-50 text-amber-700"
      : "border border-neutral-200 bg-[#fcfcfd] text-neutral-800";

  return (
    <div
      className={`rounded-lg p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${toneClass}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ChecklistRow({ checked, label }: { checked: boolean; label: string }) {
  const Icon = checked ? CheckCircle2 : Clock3;

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          checked
            ? "bg-neutral-100 text-neutral-700"
            : "bg-neutral-100 text-neutral-400"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </div>
      <span className={checked ? "text-neutral-800" : "text-neutral-500"}>
        {label}
      </span>
    </div>
  );
}

function PartyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-neutral-950">{value}</p>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return format(date, "yyyy.MM.dd HH:mm");
}
