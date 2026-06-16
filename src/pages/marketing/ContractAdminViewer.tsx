import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  LifeBuoy,
  LogOut,
  Mail,
  MessageSquareText,
  PenLine,
  RefreshCw,
  Save,
  Send,
  Settings,
} from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { ClauseHistory, Contract, ContractStatus, useAppStore } from "../../store";
import { apiFetch, apiPath } from "../../domain/api";
import { createShareToken, isFixedCampaignContract } from "../../domain/contracts";
import { buildContractShareUrl } from "../../domain/links";
import { PRODUCT_NAME } from "../../domain/brand";
import { LEGAL_CONTACT_EMAIL } from "../../domain/legalEntity";
import { SUPPORT_ACCESS_CONSENT_TEXT } from "../../domain/legalConsent";
import { buildSupportTicketPath } from "../../domain/support";
import { BrandLogo, LogoMark } from "../../components/BrandLogo";
import { verificationStatusLabel } from "../../domain/verification";
import {
  clearVerificationSummaryCache,
  useVerificationSummary,
} from "../../hooks/useVerificationSummary";
import { clearAdvertiserSessionCache } from "../../domain/advertiserSessionCache";
import { translateApiErrorMessage } from "../../domain/userMessages";
import {
  formatContractTitleForDisplay,
  formatCustomerContractText,
  formatMoneyLabel,
  formatOperationalText,
  formatPublicUrlLabel,
  formatPublicContactValue,
  removeInternalTestLabel,
} from "../../domain/display";
import { ScreenHelpButton } from "../../components/ScreenHelp";
import { SCREEN_HELP_CONTENT } from "../../domain/screenHelp";
import {
  formatFileSize,
  getDeliverableErrorMessage,
  getSubmissionNote,
  isDeliverableRevisionStatus,
  reviewStatusLabel,
  reviewStatusTone,
  submittedReviewStatuses,
  type DeliverablesResponse,
  type DeliverableReviewStatus,
} from "../../domain/deliverables";

const getSafeExternalHref = (value?: string) => {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const buildAdminSupportMailtoHref = ({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) =>
  `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    body,
  )}`;

const STATUS_META: Record<
  ContractStatus,
  {
    label: string;
    helper: string;
    badge: string;
    icon: React.ReactNode;
  }
> = {
  DRAFT: {
    label: "초안",
    helper: "공유 전 작성 중",
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <FileText className="h-4 w-4" />,
  },
  REVIEWING: {
    label: "검토 중",
    helper: "인플루언서 응답 대기",
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <Clock3 className="h-4 w-4" />,
  },
  NEGOTIATING: {
    label: "수정 요청",
    helper: "광고주 검토 필요",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  APPROVED: {
    label: "서명 대기",
    helper: "최종본 승인 완료",
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <PenLine className="h-4 w-4" />,
  },
  SIGNED: {
    label: "서명 완료",
    helper: "전자서명 완료 후 컨텐츠 제출 대기",
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  CLOSED: {
    label: "계약 마감",
    helper: "컨텐츠 확인 및 검수 완료",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <Copy className="h-4 w-4" />,
  },
};

const CONTRACT_PROGRESS_STEPS: Array<{ key: string; label: string }> = [
  { key: "draft", label: "초안" },
  { key: "review", label: "검토" },
  { key: "revision", label: "수정" },
  { key: "sign", label: "서명" },
  { key: "content", label: "콘텐츠" },
  { key: "closed", label: "종료" },
];

const getContractProgressIndex = (status: ContractStatus) => {
  if (status === "DRAFT") return 0;
  if (status === "REVIEWING") return 1;
  if (status === "NEGOTIATING") return 2;
  if (status === "APPROVED") return 3;
  if (status === "SIGNED") return 4;
  if (status === "CLOSED") return 5;
  return 0;
};

export function ContractAdminViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getContract = useAppStore((state) => state.getContract);
  const updateClauseStatus = useAppStore((state) => state.updateClauseStatus);
  const updateContract = useAppStore((state) => state.updateContract);
  const replaceContract = useAppStore((state) => state.replaceContract);
  const resetHydration = useAppStore((state) => state.resetHydration);
  const hydrateContracts = useAppStore((state) => state.hydrateContracts);
  const isHydrated = useAppStore((state) => state.isHydrated);
  const contract = getContract(id || "");
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();
  const [supportReason, setSupportReason] = useState("");
  const [supportScope, setSupportScope] = useState<"contract" | "contract_and_pdf">(
    "contract",
  );
  const [supportConsentAccepted, setSupportConsentAccepted] = useState(false);
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);
  const [draftConfirmationOpen, setDraftConfirmationOpen] = useState(false);
  const [deliverables, setDeliverables] = useState<DeliverablesResponse>();
  const [deliverablesError, setDeliverablesError] = useState("");
  const [deliverablesNotice, setDeliverablesNotice] = useState("");
  const [isLoadingDeliverables, setIsLoadingDeliverables] = useState(false);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewingDeliverableId, setReviewingDeliverableId] = useState("");
  const [isClosingContract, setIsClosingContract] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [focusedClauseId, setFocusedClauseId] = useState("");
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
  const advertiserVerificationStatus =
    verificationSummary?.advertiser.status ?? "not_submitted";
  const isAdvertiserVerified = advertiserVerificationStatus === "approved";
  const advertiserAccount = useMemo(() => {
    const latest = verificationSummary?.advertiser.latest_request;
    const account = verificationSummary?.advertiser.account;

    return {
      name: removeInternalTestLabel(
        latest?.subject_name || account?.company_name || contract?.advertiser_info.name,
        "광고주 계정",
      ),
      email:
        formatPublicContactValue(latest?.submitted_by_email || account?.email) ||
        undefined,
    };
  }, [contract?.advertiser_info.name, verificationSummary]);

  const summary = useMemo(() => {
    if (!contract) return undefined;
    const pendingClauses = contract.clauses.filter((clause) => clause.status !== "APPROVED");
    const activeShare = contract.evidence?.share_token_status === "active";
    const allApproved = pendingClauses.length === 0;

    return {
      pendingClauses,
      activeShare,
      allApproved,
      shareUrl: buildContractShareUrl(contract.id, contract.evidence?.share_token),
    };
  }, [contract]);
  const safeInfluencerHref = getSafeExternalHref(
    contract?.influencer_info.channel_url,
  );
  const isContractSignedOrClosed =
    contract?.status === "SIGNED" || contract?.status === "CLOSED";
  const isFixedCampaign = isFixedCampaignContract(contract);
  const contractPdfHref = contract
    ? isContractSignedOrClosed
      ? contract.pdf_url || apiPath(`/api/contracts/${contract.id}/final-pdf`)
      : apiPath(`/api/contracts/${contract.id}/review-pdf`)
    : "";
  const contractPdfDownloadName = contract
    ? isContractSignedOrClosed
      ? `${contract.id}-signed-record.pdf`
      : `${contract.id}-review-contract.pdf`
    : "contract.pdf";
  const contractSupportPath = useMemo(
    () =>
      contract
        ? buildSupportTicketPath({
            category: "contract_flow",
            role: "advertiser",
            contractId: contract.id,
            contractTitle: formatContractTitleForDisplay(contract.title),
          })
        : "/support",
    [contract],
  );
  const reviewableClauses = useMemo(() => {
    if (!contract || isContractSignedOrClosed || isFixedCampaign) return [];

    return contract.clauses.filter(
      (clause) =>
        clause.status !== "APPROVED" &&
        clause.history.at(-1)?.role === "influencer",
    );
  }, [contract, isContractSignedOrClosed, isFixedCampaign]);
  const activeReviewClause =
    reviewableClauses.find((clause) => clause.clause_id === focusedClauseId) ??
    reviewableClauses[0];

  useEffect(() => {
    if (!id) return;
    void hydrateContracts();
  }, [hydrateContracts, id]);

  useEffect(() => {
    const nextFocusedClauseId =
      reviewableClauses.length === 0
        ? ""
        : reviewableClauses.some((clause) => clause.clause_id === focusedClauseId)
          ? focusedClauseId
          : reviewableClauses[0].clause_id;

    if (nextFocusedClauseId === focusedClauseId) {
      return undefined;
    }

    const syncTimer = window.setTimeout(() => {
      setFocusedClauseId(nextFocusedClauseId);
    }, 0);

    return () => window.clearTimeout(syncTimer);
  }, [focusedClauseId, reviewableClauses]);

  if (!contract || !summary) {
    if (!isHydrated) {
      return <ContractAdminLoadingShell />;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-6 text-center">
        <div className="rounded-lg border border-neutral-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_60px_rgba(15,23,42,0.08)]">
          <FileText className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-4 text-[16px] font-semibold text-neutral-900">
            계약서를 찾을 수 없습니다
          </p>
          <p className="mt-2 max-w-sm text-[13px] leading-6 text-neutral-500">
            삭제되었거나 다른 계정의 계약일 수 있습니다. 대시보드에서 계약 상태를 다시 확인하거나 1:1 계약 초안을 만들어 주세요.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="rounded-md bg-neutral-950 px-4 py-2 text-[13px] font-semibold text-white"
            >
              대시보드로 돌아가기
            </button>
            <button
              type="button"
              onClick={() => navigate("/advertiser/builder")}
              className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-[13px] font-semibold text-neutral-700"
            >
              1:1 계약 만들기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const primaryActionLabel =
    contract.status === "CLOSED"
      ? "계약 마감"
      : contract.status === "SIGNED"
      ? "서명 완료"
      : isFixedCampaign && !summary.allApproved
        ? "내용 확인"
      : summary.allApproved
        ? isVerificationLoading
          ? "인증 확인 중"
          : isAdvertiserVerified
            ? "서명 링크 만들기"
          : "광고주 인증 필요"
        : "수정 요청 검토";
  const canRequestSignatures =
    summary.allApproved &&
    !isContractSignedOrClosed &&
    isAdvertiserVerified &&
    !isVerificationLoading;
  const displayContractTitle = formatContractTitleForDisplay(contract.title);
  const displayInfluencerName = removeInternalTestLabel(
    contract.influencer_info.name,
    "인플루언서",
  );
  const signatureData = contract.signature_data;
  const canCloseContract =
    contract.status === "SIGNED" &&
    Boolean(deliverables?.summary) &&
    (deliverables?.summary.total ?? 0) > 0 &&
    (deliverables?.summary.approved ?? 0) >= (deliverables?.summary.total ?? 0);

  const handleAction = (
    clauseId: string,
    action: ClauseHistory["action"],
    newStatus: "APPROVED" | "MODIFICATION_REQUESTED",
  ) => {
    if (isFixedCampaign && newStatus !== "APPROVED") {
      setNotice("이 계약에는 현재 답변할 수정 요청이 없습니다.");
      return;
    }

    if (isContractSignedOrClosed) {
      setNotice("서명 완료 또는 계약 마감 상태에서는 조항을 수정할 수 없습니다.");
      return;
    }

    updateClauseStatus(contract.id, clauseId, newStatus, {
      role: "advertiser",
      action,
      comment:
        replyContent[clauseId] ||
        (newStatus === "APPROVED"
          ? "요청하신 수정 내용을 승인합니다."
          : "대안 조건을 제안합니다."),
      timestamp: new Date().toISOString(),
    });
    setReplyContent((prev) => ({ ...prev, [clauseId]: "" }));
    setNotice(newStatus === "APPROVED" ? "조항을 승인했습니다." : "대안 의견을 남겼습니다.");
  };

  const copyLink = async () => {
    if (!summary.activeShare) {
      setNotice("서명 링크가 아직 만들어지지 않았습니다.");
      return;
    }

    await navigator.clipboard.writeText(summary.shareUrl);
    setNotice("계약서 링크를 복사했습니다.");
  };

  const saveDraft = () => {
    if (isContractSignedOrClosed) {
      setNotice("서명 완료 또는 계약 마감 상태에서는 초안으로 되돌릴 수 없습니다.");
      return;
    }

    if (summary.activeShare) {
      setDraftConfirmationOpen(true);
      setNotice("초안 저장을 계속하면 현재 서명 링크가 비활성화됩니다.");
      return;
    }

    commitDraftSave();
  };

  const commitDraftSave = () => {
    const now = new Date().toISOString();
    updateContract(contract.id, {
      status: "DRAFT",
      workflow: {
        next_actor: "advertiser",
        next_action: "발송 전 확인을 마치고 서명 링크를 만드세요.",
        due_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        risk_level: "low",
        last_message: "계약 초안이 저장되었습니다.",
      },
      evidence: {
        share_token_status: "not_issued",
        audit_ready: false,
        pdf_status: "not_ready",
      },
      audit_events: [
        ...(contract.audit_events ?? []),
        {
          id: `audit_${Date.now()}`,
          actor: "advertiser",
          action: "draft_saved",
          description: summary.activeShare
            ? "광고주가 활성 서명 링크를 비활성화하고 계약을 초안으로 저장했습니다."
            : "광고주가 계약을 초안으로 저장했습니다.",
          created_at: now,
        },
      ],
    });
    setDraftConfirmationOpen(false);
    setNotice("초안으로 저장했습니다.");
  };

  const requestSignatures = () => {
    if (isContractSignedOrClosed) {
      setNotice("이미 서명 완료 또는 계약 마감 상태입니다.");
      return;
    }

    if (!isAdvertiserVerified) {
      setNotice(
        `사업자 인증 승인 후 서명 링크를 만들 수 있습니다. 현재 상태: ${verificationStatusLabel(
          advertiserVerificationStatus,
        )}`,
      );
      return;
    }

    const now = new Date().toISOString();
    const shareToken = contract.evidence?.share_token ?? createShareToken();

    updateContract(contract.id, {
      status: "APPROVED",
      workflow: {
        next_actor: "influencer",
        next_action: isFixedCampaign
          ? "인플루언서 서명을 기다리는 중입니다."
          : "인플루언서의 최종 서명을 기다리는 중입니다.",
        due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        risk_level: "medium",
        last_message: isFixedCampaign
          ? "계약서 서명 링크를 만들었습니다."
          : "최종본 서명 링크를 만들었습니다.",
      },
      evidence: {
        share_token_status: "active",
        share_token: shareToken,
        share_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        audit_ready: true,
        pdf_status: "draft_ready",
      },
      audit_events: [
        ...(contract.audit_events ?? []),
        {
          id: `audit_${Date.now()}`,
          actor: "advertiser",
          action: "signature_requested",
          description: isFixedCampaign
            ? "광고주가 계약서 서명 링크를 만들었습니다."
            : "광고주가 최종본 서명 링크를 만들었습니다.",
          created_at: now,
        },
      ],
    });
    setNotice("서명 요청 링크를 만들었습니다.");
  };

  const handlePrimaryAction = () => {
    if (canRequestSignatures) {
      requestSignatures();
      return;
    }

    if (summary.allApproved && !isContractSignedOrClosed) {
      if (isVerificationLoading) {
        setNotice("사업자 인증 상태를 확인한 뒤 다시 시도해 주세요.");
        return;
      }

      setNotice("사업자 인증 화면에서 승인 절차를 먼저 완료해 주세요.");
      navigate("/advertiser/verification");
      return;
    }

    if (isFixedCampaign && !summary.allApproved) {
      const now = new Date().toISOString();
      const nextClauses = contract.clauses.map((clause) => ({
        ...clause,
        status: "APPROVED" as const,
      }));

      updateContract(contract.id, {
        clauses: nextClauses,
        workflow: {
          next_actor: "advertiser",
          next_action: "계약 내용을 확인했습니다. 서명 링크를 만드세요.",
          due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          risk_level: "low",
          last_message: "계약 내용을 확인했습니다.",
        },
        audit_events: [
          ...(contract.audit_events ?? []),
          {
            id: `audit_${Date.now()}`,
            actor: "advertiser",
            action: "campaign_terms_locked",
            description: "광고주가 계약 내용을 확인했습니다.",
            created_at: now,
          },
        ],
      });
      setNotice("계약 내용을 확인했습니다. 이제 서명 링크를 만들 수 있습니다.");
      return;
    }

    document
      .getElementById("clause-review")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const requestOperatorSupport = async () => {
    const reason = supportReason.trim();

    if (reason.length < 5) {
      setNotice("운영자가 확인할 내용을 5자 이상 남겨주세요.");
      return;
    }
    if (!supportConsentAccepted) {
      setNotice("운영자에게 열람권을 부여하는 데 동의해야 합니다.");
      return;
    }

    setIsRequestingSupport(true);

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/support-access-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            reason,
            scope: supportScope,
            support_consent_accepted: supportConsentAccepted,
          }),
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
      setNotice("운영자가 24시간 동안 이 계약을 확인할 수 있습니다.");
    } catch (error) {
      setNotice(
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

  const loadDeliverables = async () => {
    setIsLoadingDeliverables(true);
    setDeliverablesError("");
    setDeliverablesNotice("");

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/deliverables`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const data = (await response.json()) as DeliverablesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "컨텐츠 제출 내역을 불러오지 못했습니다.");
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
  };

  const reviewDeliverable = async (
    deliverableId: string,
    reviewStatus: Extract<
      DeliverableReviewStatus,
      "approved" | "changes_requested" | "rejected"
    >,
  ) => {
    const reviewComment = reviewComments[deliverableId]?.trim();

    if (
      (reviewStatus === "changes_requested" || reviewStatus === "rejected") &&
      !reviewComment
    ) {
      setDeliverablesError("수정 요청이나 반려에는 검수 코멘트가 필요합니다.");
      setDeliverablesNotice("");
      return;
    }

    const reviewActionLabel =
      reviewStatus === "approved"
        ? "컨텐츠 승인"
        : reviewStatus === "changes_requested"
          ? "컨텐츠 수정 요청"
          : "컨텐츠 반려";
    const confirmed = window.confirm(
      `${reviewActionLabel} 처리할까요? 처리 결과는 감사 기록에 남고 인플루언서 화면에 표시됩니다.`,
    );
    if (!confirmed) return;

    setReviewingDeliverableId(deliverableId);
    setDeliverablesError("");
    setDeliverablesNotice("");

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/deliverables/${encodeURIComponent(
          deliverableId,
        )}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            review_status: reviewStatus,
            review_comment: reviewComment || undefined,
          }),
        },
      );
      const data = (await response.json()) as DeliverablesResponse;

      if (!response.ok) {
        throw new Error(
          getDeliverableErrorMessage(
            data.error,
            `컨텐츠 확인 및 검수 실패 (${response.status})`,
          ),
        );
      }

      setDeliverables(data);
      setReviewComments((current) => ({ ...current, [deliverableId]: "" }));
      setDeliverablesNotice(
        reviewStatus === "approved"
          ? "컨텐츠를 승인했습니다. 모든 항목이 승인되면 광고 계약을 마감할 수 있습니다."
          : reviewStatus === "changes_requested"
            ? "인플루언서에게 컨텐츠 수정 요청을 보냈습니다."
            : "컨텐츠를 반려했습니다.",
      );
      setNotice(
        reviewStatus === "approved"
          ? "컨텐츠를 승인했습니다."
          : reviewStatus === "changes_requested"
            ? "컨텐츠 수정 요청을 보냈습니다."
            : "컨텐츠를 반려했습니다.",
      );
    } catch (error) {
      setDeliverablesError(
        getDeliverableErrorMessage(
          error instanceof Error ? error.message : undefined,
          "컨텐츠 확인 및 검수에 실패했습니다.",
        ),
      );
    } finally {
      setReviewingDeliverableId("");
    }
  };

  const closeContract = async () => {
    if (!canCloseContract || isClosingContract) return;

    const confirmed = window.confirm(
      "정산이 완료된 계약인가요? 확인 후 계약을 종료하면 인플루언서 추가 제출과 광고주 검수 변경이 차단됩니다.",
    );
    if (!confirmed) return;

    setIsClosingContract(true);
    setDeliverablesError("");
    setDeliverablesNotice("");

    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/close`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ settlement_confirmed: true }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        contract?: Contract;
        error?: string;
      };

      if (!response.ok || !data.contract) {
        throw new Error(
          getDeliverableErrorMessage(
            data.error,
            `광고 계약 마감 실패 (${response.status})`,
          ),
        );
      }

      replaceContract(data.contract);
      setDeliverablesNotice("광고 계약 마감 완료");
      setNotice("광고 계약 마감 완료");
    } catch (error) {
      setDeliverablesError(
        error instanceof Error
          ? error.message
          : "광고 계약 마감에 실패했습니다.",
      );
    } finally {
      setIsClosingContract(false);
    }
  };
  const handleLogout = async () => {
    try {
      await apiFetch("/api/advertiser/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] advertiser logout request failed`, error);
    } finally {
      clearAdvertiserSessionCache();
      clearVerificationSummaryCache("advertiser");
      resetHydration();
      navigate("/login/advertiser", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none text-neutral-950">
              {PRODUCT_NAME}
            </span>
          </button>

          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="yl-header-action yl-header-action-secondary"
              aria-label="대시보드"
              title="대시보드"
            >
              <span className="hidden sm:inline">대시보드</span>
              <span className="sm:hidden">홈</span>
            </button>
            <button
              type="button"
              onClick={copyLink}
              disabled={!summary.activeShare}
              className="yl-header-action yl-header-action-secondary disabled:pointer-events-none disabled:text-neutral-300 disabled:shadow-none"
              aria-label="링크 복사"
              title="링크 복사"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">링크 복사</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <ContractAdminAccountSettingsMenu
              account={advertiserAccount}
              open={accountMenuOpen}
              onToggle={() => setAccountMenuOpen((current) => !current)}
              onChangePassword={() => {
                setAccountMenuOpen(false);
                navigate("/reset-password?role=advertiser");
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-3 py-3 sm:px-5 lg:flex lg:h-[calc(100svh-57px)] lg:flex-col lg:overflow-hidden lg:px-6">
        <section className="mb-3 shrink-0 rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_38px_rgba(15,23,42,0.05)] sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={contract.status} />
                <span className="rounded-md border border-neutral-200 bg-[#fafafa] px-2.5 py-1 text-[12px] font-semibold text-neutral-500">
                  {contract.type}
                </span>
              </div>
              <div className="flex max-w-4xl items-start gap-2">
                <h1 className="min-w-0 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-neutral-950 sm:text-[34px]">
                  {displayContractTitle}
                </h1>
                <ScreenHelpButton
                  content={SCREEN_HELP_CONTENT.contractAdmin}
                  className="mt-1.5 sm:mt-2"
                />
              </div>
              <p className="mt-2 max-w-3xl text-[13px] leading-6 text-neutral-500">
                {isFixedCampaign
                  ? "서명 링크를 만들고 서명을 요청하세요."
                  : formatOperationalText(
                      contract.workflow?.next_action,
                      STATUS_META[contract.status].helper,
                    )}
              </p>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[520px]">
              <InfoTile label="인플루언서" value={displayInfluencerName} />
              <InfoTile label="금액" value={formatMoneyLabel(contract.campaign?.budget)} />
              <InfoTile label="기간" value={formatPeriod(contract)} />
              <InfoTile label="다음 기한" value={formatDue(contract.workflow?.due_at)} />
            </div>
          </div>
        </section>

        <ContractProgress status={contract.status} />

        {notice && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-neutral-200 bg-[#fcfcfd] px-4 py-3 text-[13px] font-semibold text-neutral-800 shadow-[inset_3px_0_0_rgba(23,23,23,0.12)]">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {notice}
            </span>
            <button type="button" onClick={() => setNotice(undefined)} className="text-neutral-700">
              닫기
            </button>
          </div>
        )}

        {(contract.status === "SIGNED" || contract.status === "CLOSED") && (
          <AdvertiserDeliverablesPanel
            data={deliverables}
            error={deliverablesError}
            notice={deliverablesNotice}
            isLoading={isLoadingDeliverables}
            canCloseContract={canCloseContract}
            isClosed={contract.status === "CLOSED"}
            isClosingContract={isClosingContract}
            reviewComments={reviewComments}
            reviewingDeliverableId={reviewingDeliverableId}
            onReload={loadDeliverables}
            onCommentChange={(deliverableId, value) =>
              setReviewComments((current) => ({ ...current, [deliverableId]: value }))
            }
            onReview={reviewDeliverable}
            onCloseContract={closeContract}
          />
        )}

        <section className="grid min-h-0 gap-4 lg:flex-1 xl:grid-cols-[348px_minmax(0,1fr)]">
          <aside className="custom-scrollbar min-h-0 space-y-3 overflow-visible pr-0 lg:overflow-y-auto lg:pr-1">
            <Panel title="검토·응답">
              <div className="space-y-3">
                {activeReviewClause ? (
                  <>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-[12px] font-semibold text-amber-700">
                        수정 요청 답변
                      </p>
                      <p className="mt-1 text-[15px] font-semibold text-neutral-950">
                        {formatOperationalText(activeReviewClause.category)}
                      </p>
                      <p className="mt-2 text-[13px] leading-5 text-neutral-600 line-clamp-2">
                        {formatOperationalText(
                          activeReviewClause.history.at(-1)?.comment,
                        )}
                      </p>
                    </div>
                    <Textarea
                      className="min-h-[112px] rounded-md border-neutral-200 bg-white text-[14px] shadow-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                      placeholder="답변 또는 대안 조건을 남기세요."
                      value={replyContent[activeReviewClause.clause_id] || ""}
                      onChange={(event) =>
                        setReplyContent((prev) => ({
                          ...prev,
                          [activeReviewClause.clause_id]: event.target.value,
                        }))
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleAction(
                            activeReviewClause.clause_id,
                            "수락" as ClauseHistory["action"],
                            "APPROVED",
                          )
                        }
                        className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-950 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
                      >
                        요청 승인
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAction(
                            activeReviewClause.clause_id,
                            "대안 제시" as ClauseHistory["action"],
                            "MODIFICATION_REQUESTED",
                          )
                        }
                        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        대안 제시
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handlePrimaryAction}
                      disabled={
                        isContractSignedOrClosed ||
                        (summary.allApproved && isVerificationLoading)
                      }
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800 hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)] disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none"
                    >
                      <Send className="h-4 w-4" />
                      {primaryActionLabel}
                    </button>
                  </>
                )}
                <a
                  href={contractPdfHref}
                  download={contractPdfDownloadName}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                >
                  <FileText className="h-4 w-4" />
                  {isContractSignedOrClosed ? "서명본 PDF 내려받기" : "계약서 PDF 내려받기"}
                </a>
                {!summary.allApproved && (
                  <p className="text-center text-[12px] font-semibold text-amber-700">
                    {isFixedCampaign
                      ? "내용 확인 후 서명 링크를 만들 수 있습니다."
                      : "검토 완료 후 서명 링크를 만들 수 있습니다."}
                  </p>
                )}
              </div>
            </Panel>

            {!isContractSignedOrClosed && (
              <button
                type="button"
                onClick={saveDraft}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-300 hover:bg-neutral-50"
              >
                <Save className="h-4 w-4" />
                초안으로 저장
              </button>
            )}

            {draftConfirmationOpen && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
                <p className="font-semibold">서명 링크가 비활성화됩니다</p>
                <p className="mt-1 leading-5 text-amber-800">
                  인플루언서가 기존 링크로 더 이상 계약을 열 수 없습니다.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftConfirmationOpen(false)}
                    className="h-9 rounded-md border border-amber-200 bg-white text-xs font-semibold text-amber-900"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={commitDraftSave}
                    className="h-9 rounded-md bg-neutral-950 text-xs font-semibold text-white"
                  >
                    계속 저장
                  </button>
                </div>
              </div>
            )}

            <details className="group overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
              <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-neutral-950 [&::-webkit-details-marker]:hidden">
                계약 정보
                <span className="text-[11px] font-semibold text-neutral-400 group-open:hidden">
                  접힘
                </span>
              </summary>
              <div className="space-y-4 border-t border-neutral-100 p-4">
                {safeInfluencerHref ? (
                  <a
                    href={safeInfluencerHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-white"
                  >
                    채널 열기
                    <ExternalLink className="h-4 w-4 text-neutral-400" />
                  </a>
                ) : (
                  <div
                    aria-disabled="true"
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] font-semibold text-amber-800"
                  >
                    채널 주소 확인 필요
                    <ExternalLink className="h-4 w-4 text-amber-500" />
                  </div>
                )}
                <div className="space-y-3 text-[13px]">
                  <MetaLine label="생성일" value={formatDateTime(contract.created_at)} />
                  <MetaLine label="최근 수정" value={formatDateTime(contract.updated_at)} />
                  {isContractSignedOrClosed && signatureData ? (
                    <MetaLine label="서명 시각" value={formatDateTime(signatureData.signed_at)} />
                  ) : null}
                </div>
              </div>
            </details>

            <button
              type="button"
              onClick={() => navigate(contractSupportPath)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              <LifeBuoy className="h-4 w-4" />
              계약 문의
            </button>

            <details className="group overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
              <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-neutral-950 [&::-webkit-details-marker]:hidden">
                운영자 지원
                <span className="text-[11px] font-semibold text-neutral-400 group-open:hidden">
                  필요할 때만
                </span>
              </summary>
              <div className="space-y-3 border-t border-neutral-100 p-4">
                <p className="text-[12px] leading-5 text-neutral-500">
                  계약 판단 지원이 필요할 때만 24시간 열람을 요청합니다.
                </p>
                <Textarea
                  className="min-h-[96px] rounded-md border-neutral-200 bg-white text-[14px] shadow-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                  placeholder="예: 인플루언서가 수정 요청한 조항 판단을 도와주세요."
                  value={supportReason}
                  onChange={(event) => setSupportReason(event.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      value: "contract" as const,
                      label: "계약 본문만",
                      description: "조항 확인에 필요한 최소 범위",
                    },
                    {
                      value: "contract_and_pdf" as const,
                      label: "본문 + 서명 PDF",
                      description: "서명 증빙 확인이 필요할 때만",
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
                      <span className="block text-[12px] font-semibold">
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
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-950 accent-neutral-950"
                  />
                  <span>
                    {SUPPORT_ACCESS_CONSENT_TEXT}{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="font-semibold text-neutral-800 underline underline-offset-4 hover:text-neutral-950"
                    >
                      개인정보 처리방침 보기
                    </a>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={requestOperatorSupport}
                  disabled={
                    isRequestingSupport ||
                    supportReason.trim().length < 5 ||
                    !supportConsentAccepted
                  }
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-950 bg-neutral-950 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:border-neutral-200 disabled:bg-neutral-200 disabled:text-neutral-500"
                >
                  <LifeBuoy className="h-4 w-4" />
                  요청 보내기
                </button>
              </div>
            </details>

            <details className="group overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
              <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-neutral-950 [&::-webkit-details-marker]:hidden">
                감사 기록
                <span className="text-[11px] font-semibold text-neutral-400">
                  {(contract.audit_events ?? []).length}건
                </span>
              </summary>
              <div className="space-y-4 border-t border-neutral-100 p-4">
                {(contract.audit_events ?? []).length === 0 ? (
                  <p className="text-[13px] leading-6 text-neutral-500">
                    아직 저장된 감사 이벤트가 없습니다.
                  </p>
                ) : (
                  [...(contract.audit_events ?? [])]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                    )
                    .slice(0, 4)
                    .map((event) => (
                      <div key={event.id} className="border-l-2 border-neutral-200 pl-3">
                        <p className="text-[12px] font-semibold text-neutral-900">
                          {actorLabel(event.actor)} · {formatAuditActionLabel(event.action)}
                        </p>
                        <p className="mt-1 text-[12px] text-neutral-400">
                          {formatDateTime(event.created_at)}
                        </p>
                        <p className="mt-2 text-[13px] leading-6 text-neutral-600">
                          {formatAuditDescription(event.description)}
                        </p>
                      </div>
                    ))
                )}
              </div>
            </details>
          </aside>

          <section
            id="clause-review"
            className="custom-scrollbar min-h-0 scroll-mt-24 overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)] lg:overflow-y-auto"
          >
            <div className="sticky top-0 z-10 border-b border-neutral-200 bg-[#fbfbfc] px-6 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                계약서 본문
              </p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">
                {isFixedCampaign ? "계약 내용" : "조항 검토"}
              </h2>
            </div>
            <div className="divide-y divide-neutral-100">
              {contract.clauses.map((clause, index) => {
                const latestHistory = clause.history.at(-1);
                const needsReview = reviewableClauses.some(
                  (item) => item.clause_id === clause.clause_id,
                );
                const isFocused = activeReviewClause?.clause_id === clause.clause_id;

                return (
                  <article
                    key={clause.clause_id}
                    className={`p-6 transition ${
                      needsReview
                        ? "cursor-pointer hover:bg-amber-50/40"
                        : ""
                    } ${isFocused ? "bg-amber-50/45 shadow-[inset_3px_0_0_rgba(217,119,6,0.42)]" : ""}`}
                    onClick={() => {
                      if (needsReview) setFocusedClauseId(clause.clause_id);
                    }}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-3 flex items-center gap-3">
                          <span className="font-mono text-[12px] font-semibold text-neutral-400">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <h3 className="text-[18px] font-semibold text-neutral-950">
                            {formatOperationalText(clause.category)}
                          </h3>
                          <ClauseBadge status={clause.status} />
                        </div>
                        <p className="max-w-4xl whitespace-pre-wrap text-[15px] leading-7 text-neutral-700">
                          {isFixedCampaign
                            ? formatCustomerContractText(clause.content)
                            : formatOperationalText(clause.content)}
                        </p>
                      </div>
                    </div>

                    {latestHistory && (
                      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/85 p-4 shadow-[inset_3px_0_0_rgba(217,119,6,0.22)]">
                        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-amber-700">
                          <MessageSquareText className="h-4 w-4" />
                          인플루언서 의견
                        </div>
                        <p className="whitespace-pre-wrap text-[14px] leading-6 text-neutral-800">
                          {formatOperationalText(latestHistory.comment)}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

function ContractAdminLoadingShell() {
  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-white/92 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <BrandLogo className="yl-brand-action -ml-1 inline-flex min-h-10 items-center gap-2.5 rounded-[12px] px-1 py-1" />
          <span className="hidden h-10 w-[112px] rounded-[9px] bg-neutral-100 sm:block" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 lg:px-6">
        <div className="animate-pulse space-y-5">
          <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="h-4 w-28 rounded bg-neutral-100" />
            <div className="mt-4 h-10 w-full max-w-[560px] rounded bg-neutral-100" />
            <div className="mt-5 grid gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 rounded-lg bg-neutral-100" />
              ))}
            </div>
          </section>
          <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
            <div className="h-40 rounded-lg border border-neutral-200/80 bg-white" />
            <div className="h-[520px] rounded-lg border border-neutral-200/80 bg-white" />
            <div className="h-40 rounded-lg border border-neutral-200/80 bg-white" />
          </section>
        </div>
      </main>
    </div>
  );
}

function AdvertiserDeliverablesPanel({
  data,
  error,
  notice,
  isLoading,
  canCloseContract,
  isClosed,
  isClosingContract,
  reviewComments,
  reviewingDeliverableId,
  onReload,
  onCommentChange,
  onReview,
  onCloseContract,
}: {
  data?: DeliverablesResponse;
  error: string;
  notice: string;
  isLoading: boolean;
  canCloseContract: boolean;
  isClosed: boolean;
  isClosingContract: boolean;
  reviewComments: Record<string, string>;
  reviewingDeliverableId: string;
  onReload: () => void;
  onCommentChange: (deliverableId: string, value: string) => void;
  onReview: (
    deliverableId: string,
    reviewStatus: Extract<
      DeliverableReviewStatus,
      "approved" | "changes_requested" | "rejected"
    >,
  ) => void;
  onCloseContract: () => void;
}) {
  useEffect(() => {
    if (!data && !isLoading && !error) {
      onReload();
    }
  }, [data, error, isLoading, onReload]);

  const requirements = data?.requirements ?? [];
  const isInitialLoading = isLoading && !data;

  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="border-b border-neutral-200 bg-[#fbfbfc] px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              컨텐츠 확인 및 검수
            </p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
              광고 계약 마감 전 컨텐츠 URL과 파일을 확인하세요
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {isClosed ? (
              <span className="inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                광고 계약 마감 완료
              </span>
            ) : canCloseContract ? (
              <button
                type="button"
                onClick={onCloseContract}
                disabled={isClosingContract}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500"
              >
                {isClosingContract ? "마감 중" : "광고 계약 마감"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onReload}
              disabled={isLoading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400 disabled:text-neutral-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>
        {data?.summary && (
          <p className="mt-2 text-[12px] font-semibold text-neutral-500">
            제출 {data.summary.submitted}/{data.summary.total} · 승인 {data.summary.approved}/{data.summary.total}
          </p>
        )}
        <div className="mt-3 grid gap-2 text-[12px] font-semibold text-neutral-600 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "컨텐츠 URL",
            "광고표시 문구",
            "필수 해시태그",
            "브랜드 계정 태그",
            "게시일",
            "게시물 유지 조건",
          ].map((item) => (
            <span
              key={item}
              className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-[13px] font-semibold text-rose-700">
          {error}
        </div>
      )}

      {notice && !error && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-[13px] font-semibold text-emerald-800">
          {notice}
        </div>
      )}

      <div className="divide-y divide-neutral-100">
        {isInitialLoading ? (
          <div className="p-5 text-[14px] font-semibold text-neutral-500">
            제출 내역을 불러오는 중입니다.
          </div>
        ) : requirements.length === 0 ? (
          <div className="p-5 text-[14px] leading-6 text-neutral-500">
            아직 제출 또는 요구된 컨텐츠 항목이 없습니다.
          </div>
        ) : (
          requirements.map((requirement) => {
            const approvedCount = requirement.submissions.filter(
              (submission) => submission.review_status === "approved",
            ).length;
            const submittedCount = requirement.submissions.filter((submission) =>
              submittedReviewStatuses.has(submission.review_status),
            ).length;
            const pendingReviewCount = requirement.submissions.filter(
              (submission) => submission.review_status === "submitted",
            ).length;
            const hasRevisionRequest = requirement.submissions.some((submission) =>
              isDeliverableRevisionStatus(submission.review_status),
            );
            const isComplete = approvedCount >= requirement.quantity;
            const requirementTone = isComplete
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : pendingReviewCount > 0
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : hasRevisionRequest
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-neutral-200 bg-white text-neutral-500";
            const requirementLabel = isComplete
              ? "승인 완료"
              : pendingReviewCount > 0
                ? "검수 필요"
                : hasRevisionRequest
                  ? "재제출 대기"
                  : "제출 대기";

            return (
            <article key={requirement.id} className="p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-neutral-950">
                    {formatOperationalText(requirement.title)}
                  </h3>
                  <p className="mt-1 text-[12px] font-semibold text-neutral-500">
                    필요 {requirement.quantity}건 · 제출 {submittedCount}건 · 승인 {approvedCount}건
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full border px-3 py-1 text-[12px] font-semibold ${requirementTone}`}
                >
                  {requirementLabel}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {requirement.submissions.length === 0 ? (
                  <p className="rounded-lg border border-neutral-200 bg-[#fbfbfc] px-4 py-3 text-[13px] font-semibold text-neutral-500">
                    제출 대기 중입니다.
                  </p>
                ) : (
                  requirement.submissions.map((submission) => {
                    const isReviewing = reviewingDeliverableId === submission.id;
                    const reviewDone = ["approved", "changes_requested", "rejected"].includes(
                      submission.review_status,
                    );
                    const note = formatOperationalText(getSubmissionNote(submission));

                    return (
                      <div
                        key={submission.id}
                        className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${reviewStatusTone(
                              submission.review_status,
                            )}`}
                          >
                            {reviewStatusLabel(submission.review_status)}
                          </span>
                          <span className="text-[12px] text-neutral-400">
                            {formatDateTime(submission.submitted_at)}
                          </span>
                        </div>

                        {submission.url && (
                          <a
                            href={submission.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="mt-3 inline-flex max-w-full items-center gap-2 text-[13px] font-semibold text-neutral-900 underline underline-offset-4"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              {formatPublicUrlLabel(submission.url, "컨텐츠 제출 링크 열기")}
                            </span>
                          </a>
                        )}
                        {submission.files.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {submission.files.map((file) => (
                              <a
                                key={file.id}
                                href={file.download_url}
                                className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-[12px] font-semibold text-neutral-700"
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
                          <p className="mt-3 rounded-md bg-white px-3 py-2 text-[12px] leading-5 text-neutral-600 ring-1 ring-neutral-200">
                            제출 메모: {note}
                          </p>
                        )}
                        {submission.review_comment && (
                          <p className="mt-3 rounded-md bg-white px-3 py-2 text-[12px] leading-5 text-neutral-600 ring-1 ring-neutral-200">
                            검수 코멘트: {formatOperationalText(submission.review_comment)}
                          </p>
                        )}

                        {!isClosed && !reviewDone && (
                          <div className="mt-4 grid gap-3">
                            <Textarea
                              className="min-h-[76px] rounded-md border-neutral-200 bg-white text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                              placeholder="수정 요청이나 반려 사유를 적어 주세요."
                              value={reviewComments[submission.id] ?? ""}
                              onChange={(event) =>
                                onCommentChange(submission.id, event.target.value)
                              }
                            />
                            <div className="grid gap-2 sm:grid-cols-3">
                              <button
                                type="button"
                                onClick={() => onReview(submission.id, "approved")}
                                disabled={isReviewing}
                                className="h-10 rounded-md bg-neutral-950 text-[13px] font-semibold text-white disabled:bg-neutral-200 disabled:text-neutral-500"
                              >
                                컨텐츠 승인
                              </button>
                              <button
                                type="button"
                                onClick={() => onReview(submission.id, "changes_requested")}
                                disabled={isReviewing}
                                className="h-10 rounded-md border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 disabled:text-neutral-300"
                              >
                                수정 요청
                              </button>
                              <button
                                type="button"
                                onClick={() => onReview(submission.id, "rejected")}
                                disabled={isReviewing}
                                className="h-10 rounded-md border border-rose-200 bg-rose-50 text-[13px] font-semibold text-rose-700 disabled:text-rose-300"
                              >
                                컨텐츠 반려
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ContractProgress({ status }: { status: ContractStatus }) {
  const activeIndex = getContractProgressIndex(status);

  return (
    <section className="mb-3 shrink-0 rounded-lg border border-neutral-200/80 bg-white px-5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="relative grid grid-cols-6 gap-0">
        <div className="absolute left-[8%] right-[8%] top-[14px] h-px bg-neutral-200" />
        {CONTRACT_PROGRESS_STEPS.map((step, index) => {
          const isDone = index < activeIndex;
          const isActive = index === activeIndex;

          return (
            <div
              key={step.key}
              className={`relative flex flex-col items-center text-center text-[12px] font-semibold ${
                isActive ? "text-neutral-950" : isDone ? "text-neutral-700" : "text-neutral-400"
              }`}
            >
              <span
                className={`relative z-10 mb-2 flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-bold ${
                  isDone
                    ? "border-neutral-950 bg-neutral-950 text-white"
                    : isActive
                    ? "border-neutral-950 bg-white text-neutral-950 shadow-[0_0_0_4px_rgba(23,23,23,0.08)]"
                    : "border-neutral-200 bg-white text-neutral-400"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              <span className="truncate px-1">{step.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: ContractStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${meta.badge}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200/80 bg-[#fcfcfd] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </p>
      <p className="mt-1 truncate text-[14px] font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
      <h2 className="mb-3 text-[14px] font-semibold text-neutral-950">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-neutral-400">{label}</span>
      <span className="truncate text-right font-semibold text-neutral-800">{value}</span>
    </div>
  );
}

function ContractAdminAccountSettingsMenu({
  account,
  open,
  onToggle,
  onChangePassword,
}: {
  account: { name: string; email?: string };
  open: boolean;
  onToggle: () => void;
  onChangePassword: () => void;
}) {
  const emailChangeHref = buildAdminSupportMailtoHref({
    subject: "광고주 계정 이메일 변경 요청",
    body: [
      "광고주 계정 이메일 변경을 요청합니다.",
      "",
      `현재 표시 이메일: ${account.email ?? "확인 필요"}`,
      `회사/브랜드명: ${account.name}`,
      "변경할 이메일:",
      "요청 사유:",
    ].join("\n"),
  });

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label="계정 설정"
        title="계정 설정"
        aria-expanded={open}
        className="yl-header-icon-action"
      >
        <Settings className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[260px] overflow-hidden rounded-[12px] border border-neutral-200 bg-white text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-[13px] font-extrabold text-neutral-950">계정 설정</p>
            {account.email ? (
              <p className="mt-1 truncate text-[12px] font-semibold text-neutral-500">
                {account.email}
              </p>
            ) : null}
          </div>
          <a
            href={emailChangeHref}
            className="flex h-11 items-center gap-2 px-4 text-[12px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-950"
          >
            <Mail className="h-3.5 w-3.5" />
            이메일 변경
          </a>
          <button
            type="button"
            onClick={onChangePassword}
            className="flex h-11 w-full items-center gap-2 px-4 text-left text-[12px] font-extrabold text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-950"
          >
            <KeyRound className="h-3.5 w-3.5" />
            비밀번호 변경
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ClauseBadge({ status }: { status: Contract["clauses"][number]["status"] }) {
  if (status === "APPROVED") {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">
        승인
      </span>
    );
  }

  if (status === "PENDING_REVIEW") {
    return (
      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
        검토 대기
      </span>
    );
  }

  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      검토 필요
    </span>
  );
}

function formatPeriod(contract: Contract) {
  if (contract.campaign?.period) return contract.campaign.period;
  if (contract.campaign?.start_date && contract.campaign?.end_date) {
    return `${formatDate(contract.campaign.start_date)} - ${formatDate(contract.campaign.end_date)}`;
  }
  if (contract.campaign?.deadline) return `${formatDate(contract.campaign.deadline)}까지`;
  return "미정";
}

function formatDue(value?: string) {
  if (!value) return "기한 미정";
  const due = new Date(value);
  const days = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (Number.isNaN(due.getTime())) return value;
  if (days < 0) return `${Math.abs(days)}일 지연`;
  if (days === 0) return "오늘 마감";
  if (days === 1) return "내일 마감";
  return `${format(due, "MM.dd")} 마감`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "yyyy.MM.dd");
}

function formatDateTime(value?: string) {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "yyyy.MM.dd HH:mm");
}

function actorLabel(actor: string) {
  if (actor === "advertiser") return "광고주";
  if (actor === "influencer") return "인플루언서";
  return "시스템";
}

function formatAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    all_clauses_approved: "모든 조항 승인",
    clause_change_requested: "조항 수정 요청",
    contract_signed: "전자서명 완료",
    created: "지원 요청 생성",
    draft_saved: "초안 저장",
    evidence_downloaded: "컨텐츠 파일 다운로드",
    contract_closed: "광고 계약 마감",
    qa_contract_seeded: "계약 생성",
    share_link_issued: "서명 링크 생성",
    signature_requested: "서명 요청",
    viewed_contract: "계약 본문 열람",
    viewed_pdf: "PDF 열람",
  };

  if (labels[action]) return labels[action];
  if (/[가-힣]/.test(action)) return action;
  return "운영 기록";
}

function formatAuditDescription(description: string) {
  if (/IP=|UA=/i.test(description)) {
    return "전자서명이 완료되었고 접속 정보는 감사 기록에 보관됩니다.";
  }

  return description;
}
