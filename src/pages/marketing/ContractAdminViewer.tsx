import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  LifeBuoy,
  Link2,
  LogOut,
  MessageSquareText,
  PenLine,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { ClauseHistory, Contract, ContractStatus, useAppStore } from "../../store";
import { apiFetch, apiPath } from "../../domain/api";
import { createShareToken } from "../../domain/contracts";
import { buildContractShareUrl } from "../../domain/links";
import { PRODUCT_NAME } from "../../domain/brand";
import { verificationStatusLabel } from "../../domain/verification";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { translateApiErrorMessage } from "../../domain/userMessages";
import {
  formatContractTitleForDisplay,
  formatMoneyLabel,
  formatOperationalText,
  formatPublicUrlLabel,
  formatPublicContactValue,
  removeInternalTestLabel,
} from "../../domain/display";
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
    helper: "서명본 보관 및 콘텐츠 이행 관리",
    badge: "border-neutral-200 bg-white text-neutral-700",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
};

export function ContractAdminViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getContract = useAppStore((state) => state.getContract);
  const updateClauseStatus = useAppStore((state) => state.updateClauseStatus);
  const updateContract = useAppStore((state) => state.updateContract);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const syncError = useAppStore((state) => state.syncError);
  const resetHydration = useAppStore((state) => state.resetHydration);
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
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
  const advertiserVerificationStatus =
    verificationSummary?.advertiser.status ?? "not_submitted";
  const isAdvertiserVerified = advertiserVerificationStatus === "approved";

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

  if (!contract || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-6 text-center">
        <div className="rounded-lg border border-neutral-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_22px_60px_rgba(15,23,42,0.08)]">
          <FileText className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-4 text-[16px] font-semibold text-neutral-900">
            계약서를 찾을 수 없습니다
          </p>
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="mt-5 rounded-md bg-neutral-950 px-4 py-2 text-[13px] font-semibold text-white"
          >
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const primaryActionLabel =
    contract.status === "SIGNED"
      ? "서명 완료"
      : summary.allApproved
        ? isVerificationLoading
          ? "인증 확인 중"
          : isAdvertiserVerified
            ? "공유 링크 활성화"
            : "사업자 인증 필요"
        : "수정 요청 검토";
  const canRequestSignatures =
    summary.allApproved &&
    contract.status !== "SIGNED" &&
    isAdvertiserVerified &&
    !isVerificationLoading;
  const displayContractTitle = formatContractTitleForDisplay(contract.title);
  const displayInfluencerName = removeInternalTestLabel(
    contract.influencer_info.name,
    "인플루언서",
  );

  const handleAction = (
    clauseId: string,
    action: ClauseHistory["action"],
    newStatus: "APPROVED" | "MODIFICATION_REQUESTED",
  ) => {
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
      setNotice("공유 링크가 아직 활성화되지 않았습니다.");
      return;
    }

    await navigator.clipboard.writeText(summary.shareUrl);
    setNotice("인플루언서 공유 링크를 복사했습니다.");
  };

  const saveDraft = () => {
    if (summary.activeShare) {
      setDraftConfirmationOpen(true);
      setNotice("초안 저장을 계속하면 현재 공유 링크가 비활성화됩니다.");
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
        next_action: "발송 전 확인을 마치고 공유 링크를 생성하세요.",
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
            ? "광고주가 활성 공유 링크를 비활성화하고 계약을 초안으로 저장했습니다."
            : "광고주가 계약을 초안으로 저장했습니다.",
          created_at: now,
        },
      ],
    });
    setDraftConfirmationOpen(false);
    setNotice("초안으로 저장했습니다.");
  };

  const requestSignatures = () => {
    if (!isAdvertiserVerified) {
      setNotice(
        `광고주 사업자 인증 승인 후 공유 링크를 활성화할 수 있습니다. 현재 상태: ${verificationStatusLabel(
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
        next_action: "인플루언서의 최종 서명을 기다리는 중입니다.",
        due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        risk_level: "medium",
        last_message: "최종본 공유 링크를 활성화했습니다.",
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
          description: "광고주가 최종본 공유 링크를 활성화했습니다.",
          created_at: now,
        },
      ],
    });
    setNotice("서명 요청 링크를 활성화했습니다.");
  };

  const handlePrimaryAction = () => {
    if (canRequestSignatures) {
      requestSignatures();
      return;
    }

    if (summary.allApproved && contract.status !== "SIGNED") {
      if (isVerificationLoading) {
        setNotice("광고주 사업자 인증 상태를 확인한 뒤 다시 시도해 주세요.");
        return;
      }

      setNotice("사업자 인증 요청 화면에서 승인 절차를 먼저 완료해 주세요.");
      navigate("/advertiser/verification");
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
        throw new Error(data.error ?? "콘텐츠 제출 내역을 불러오지 못했습니다.");
      }

      setDeliverables(data);
    } catch (error) {
      setDeliverablesError(
        getDeliverableErrorMessage(
          error instanceof Error ? error.message : undefined,
          "콘텐츠 제출 내역을 불러오지 못했습니다.",
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
            `콘텐츠 검수 실패 (${response.status})`,
          ),
        );
      }

      setDeliverables(data);
      setReviewComments((current) => ({ ...current, [deliverableId]: "" }));
      setDeliverablesNotice(
        reviewStatus === "approved"
          ? "콘텐츠 제출물을 승인했습니다. 모든 항목이 승인되면 계약이 완료 상태로 전환됩니다."
          : reviewStatus === "changes_requested"
            ? "인플루언서에게 콘텐츠 수정 요청을 보냈습니다."
            : "콘텐츠 제출물을 반려했습니다.",
      );
      setNotice(
        reviewStatus === "approved"
          ? "콘텐츠 제출물을 승인했습니다."
          : reviewStatus === "changes_requested"
            ? "콘텐츠 수정 요청을 보냈습니다."
            : "콘텐츠 제출물을 반려했습니다.",
      );
    } catch (error) {
      setDeliverablesError(
        getDeliverableErrorMessage(
          error instanceof Error ? error.message : undefined,
          "콘텐츠 검수에 실패했습니다.",
        ),
      );
    } finally {
      setReviewingDeliverableId("");
    }
  };
  const handleLogout = async () => {
    try {
      await apiFetch("/api/advertiser/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn("[Yeollock] advertiser logout request failed", error);
    } finally {
      resetHydration();
      navigate("/login/advertiser", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:h-[72px] sm:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-300 hover:text-neutral-950 sm:h-9 sm:w-9"
              aria-label="대시보드로 돌아가기"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="hidden min-w-0 sm:block">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  계약 워크스페이스
                </p>
                <p className="truncate text-[16px] font-semibold">{PRODUCT_NAME}</p>
              </div>
              <span className="font-neo-heavy truncate text-[18px] leading-none sm:hidden">
                {PRODUCT_NAME}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={copyLink}
              disabled={!summary.activeShare}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-0 rounded-lg border border-neutral-200 bg-white px-0 text-[12px] font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-300 disabled:text-neutral-300 disabled:shadow-none sm:w-auto sm:gap-2 sm:px-3"
              aria-label="링크 복사"
              title="링크 복사"
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">링크 복사</span>
            </button>
            <button
              type="button"
              onClick={handlePrimaryAction}
              aria-label={primaryActionLabel}
              title={primaryActionLabel}
              disabled={
                contract.status === "SIGNED" ||
                (summary.allApproved && isVerificationLoading)
              }
              className="inline-flex h-10 w-12 shrink-0 items-center justify-center gap-0 rounded-lg bg-neutral-950 px-0 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800 hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)] disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none sm:w-auto sm:gap-2 sm:px-4"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">{primaryActionLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-0 rounded-lg border border-neutral-200 bg-white px-0 text-[12px] font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950 sm:w-auto sm:gap-2 sm:px-3"
              aria-label="로그아웃"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10">
        <section className="mb-5 rounded-lg border border-neutral-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={contract.status} />
                <span className="rounded-md border border-neutral-200 bg-[#fafafa] px-2.5 py-1 text-[12px] font-semibold text-neutral-500">
                  {contract.type}
                </span>
              </div>
              <h1 className="max-w-4xl text-[30px] font-semibold leading-tight tracking-[-0.03em] text-neutral-950 sm:text-[38px]">
                {displayContractTitle}
              </h1>
              <p className="mt-3 max-w-3xl text-[14px] leading-6 text-neutral-500">
                {formatOperationalText(
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

        <section className="mb-6 grid gap-4 lg:grid-cols-4">
          <WorkflowCard
            icon={<AlertCircle className="h-4 w-4" />}
            label="검토 필요 조항"
            value={`${summary.pendingClauses.length}건`}
            helper={summary.pendingClauses.length > 0 ? "광고주 답변 필요" : "모든 조항 승인됨"}
            tone={summary.pendingClauses.length > 0 ? "amber" : "neutral"}
          />
          <WorkflowCard
            icon={<Link2 className="h-4 w-4" />}
            label="공유 링크"
            value={summary.activeShare ? "활성" : "비활성"}
            helper={summary.activeShare ? "외부 검토 가능" : "아직 공유 불가"}
            tone="neutral"
          />
          <WorkflowCard
            icon={<ShieldCheck className="h-4 w-4" />}
            label="감사 준비"
            value={contract.evidence?.audit_ready ? "준비됨" : "미완료"}
            helper={contract.evidence?.pdf_status === "signed_ready" ? "서명 PDF 준비" : "서명 전 문서 기준"}
            tone="neutral"
          />
          <WorkflowCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="저장 상태"
            value={syncError ? "확인 필요" : isSyncing ? "저장 중" : "저장 완료"}
            helper={syncError ? "저장 상태 확인 필요" : "변경 사항 반영됨"}
            tone={syncError ? "amber" : "neutral"}
          />
        </section>

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

        {contract.status === "SIGNED" && (
          <AdvertiserDeliverablesPanel
            data={deliverables}
            error={deliverablesError}
            notice={deliverablesNotice}
            isLoading={isLoadingDeliverables}
            reviewComments={reviewComments}
            reviewingDeliverableId={reviewingDeliverableId}
            onReload={loadDeliverables}
            onCommentChange={(deliverableId, value) =>
              setReviewComments((current) => ({ ...current, [deliverableId]: value }))
            }
            onReview={reviewDeliverable}
          />
        )}

        <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="space-y-4">
            <Panel title="상대방 정보">
              <div className="space-y-4">
                <PersonLine
                  label="인플루언서"
                  value={displayInfluencerName}
                  helper={formatPublicContactValue(
                    contract.influencer_info.contact,
                    "연락처 미입력",
                  )}
                />
                {safeInfluencerHref ? (
                  <a
                    href={safeInfluencerHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-3 text-[13px] font-semibold text-neutral-700 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:bg-white hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
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
              </div>
            </Panel>

            <Panel title="계약 메타">
              <div className="space-y-3 text-[13px]">
                <MetaLine label="생성일" value={formatDateTime(contract.created_at)} />
                <MetaLine label="최근 수정" value={formatDateTime(contract.updated_at)} />
                <MetaLine label="공유 만료" value={formatDateTime(contract.evidence?.share_token_expires_at)} />
              </div>
            </Panel>

            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              <Save className="h-4 w-4" />
              초안으로 저장
            </button>

            {draftConfirmationOpen && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
                <p className="font-semibold">공유 링크가 비활성화됩니다</p>
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
          </aside>

          <section
            id="clause-review"
            className="scroll-mt-24 overflow-hidden rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]"
          >
            <div className="border-b border-neutral-200 bg-[#fbfbfc] px-5 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                계약 조항
              </p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
                조항 검토
              </h2>
            </div>
            <div className="divide-y divide-neutral-100">
              {contract.clauses.map((clause, index) => {
                const latestHistory = clause.history.at(-1);
                const needsReview =
                  clause.status !== "APPROVED" && latestHistory?.role === "influencer";

                return (
                  <article key={clause.clause_id} className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-3">
                          <span className="font-mono text-[12px] font-semibold text-neutral-400">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <h3 className="text-[16px] font-semibold text-neutral-950">
                            {formatOperationalText(clause.category)}
                          </h3>
                          <ClauseBadge status={clause.status} />
                        </div>
                        <p className="max-w-3xl whitespace-pre-wrap text-[14px] leading-7 text-neutral-700">
                          {formatOperationalText(clause.content)}
                        </p>
                      </div>
                    </div>

                    {latestHistory && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/85 p-4 shadow-[inset_3px_0_0_rgba(217,119,6,0.22)]">
                        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-amber-700">
                          <MessageSquareText className="h-4 w-4" />
                          인플루언서 의견
                        </div>
                        <p className="whitespace-pre-wrap text-[14px] leading-6 text-neutral-800">
                          {formatOperationalText(latestHistory.comment)}
                        </p>
                      </div>
                    )}

                    {needsReview && (
                      <div className="mt-4 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        <Textarea
                          className="min-h-[96px] rounded-md border-neutral-200 bg-white text-[14px] shadow-none focus-visible:ring-1 focus-visible:ring-neutral-900"
                          placeholder="답변 또는 대안 조건을 남기세요."
                          value={replyContent[clause.clause_id] || ""}
                          onChange={(event) =>
                            setReplyContent((prev) => ({
                              ...prev,
                              [clause.clause_id]: event.target.value,
                            }))
                          }
                        />
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() =>
                              handleAction(
                                clause.clause_id,
                                "수락" as ClauseHistory["action"],
                                "APPROVED",
                              )
                            }
                            className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-neutral-950 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
                          >
                            요청 승인
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAction(
                                clause.clause_id,
                                "대안 제시" as ClauseHistory["action"],
                                "MODIFICATION_REQUESTED",
                              )
                            }
                            className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
                          >
                            대안 제시
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <Panel title="공유와 서명">
              <div className="space-y-4">
                  <div className="rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <p className="text-[13px] font-semibold text-neutral-900">
                    {summary.activeShare ? "공유 링크 활성화" : "공유 링크 비활성"}
                  </p>
                  <p className="mt-2 truncate font-mono text-[12px] text-neutral-500">
                    {summary.activeShare ? summary.shareUrl : "최종본 공유 시 링크가 활성화됩니다."}
                  </p>
                  <button
                    type="button"
                    onClick={copyLink}
                    disabled={!summary.activeShare}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 disabled:text-neutral-300"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    복사
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={
                    contract.status === "SIGNED" ||
                    (summary.allApproved && isVerificationLoading)
                  }
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800 hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)] disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none"
                >
                  <Send className="h-4 w-4" />
                  {primaryActionLabel}
                </button>
                {contract.status === "SIGNED" && (
                  <a
            href={contract.pdf_url || apiPath(`/api/contracts/${contract.id}/final-pdf`)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    <FileText className="h-4 w-4" />
                    서명본 PDF 내려받기
                  </a>
                )}
                {!summary.allApproved && (
                  <p className="text-center text-[12px] font-semibold text-amber-700">
                    조항 검토가 끝나면 최종본 공유 링크를 활성화할 수 있습니다.
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="운영자 확인">
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                  <p className="text-[13px] leading-6 text-neutral-600">
                    로그인한 계약 당사자가 요청할 때만 24시간 열람권이 열립니다. 운영자 열람 기록은 별도로 남습니다.
                  </p>
                </div>
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
                    선택한 범위의 계약 자료를 운영자가 24시간 확인하고, 열람 기록이
                    감사 로그에 남는 것에 동의합니다.
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
                  운영자 확인 요청
                </button>
              </div>
            </Panel>

            <Panel title="감사 기록">
              <div className="space-y-4">
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
                    .slice(0, 6)
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
            </Panel>
          </aside>
        </section>
      </main>
    </div>
  );
}

function AdvertiserDeliverablesPanel({
  data,
  error,
  notice,
  isLoading,
  reviewComments,
  reviewingDeliverableId,
  onReload,
  onCommentChange,
  onReview,
}: {
  data?: DeliverablesResponse;
  error: string;
  notice: string;
  isLoading: boolean;
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
              콘텐츠 검수
            </p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
              제출 링크와 증빙 확인
            </h2>
          </div>
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
        {data?.summary && (
          <p className="mt-2 text-[12px] font-semibold text-neutral-500">
            제출 {data.summary.submitted}/{data.summary.total} · 승인 {data.summary.approved}/{data.summary.total}
          </p>
        )}
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
            아직 제출 또는 요구된 콘텐츠 항목이 없습니다.
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
                              {formatPublicUrlLabel(submission.url, "제출 링크 열기")}
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
                                  {file.file_name ?? "증빙 파일"}
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

                        {!reviewDone && (
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
                                승인
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
                                반려
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
    <div className="rounded-lg border border-neutral-200/80 bg-[#fcfcfd] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </p>
      <p className="mt-1 truncate text-[14px] font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function WorkflowCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "neutral" | "amber" | "sky";
}) {
  const className = {
    neutral: "border-neutral-200 bg-white text-neutral-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    sky: "border-neutral-200 bg-white text-neutral-700",
  }[tone];

  return (
    <div className={`rounded-lg border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12px] font-semibold">{label}</p>
        {icon}
      </div>
      <p className="text-[24px] font-semibold tracking-[-0.03em]">{value}</p>
      <p className="mt-2 text-[12px] opacity-75">{helper}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)]">
      <h2 className="mb-4 text-[14px] font-semibold text-neutral-950">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PersonLine({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.14)]">
        {value.charAt(0)}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          {label}
        </p>
        <p className="truncate text-[14px] font-semibold text-neutral-900">{value}</p>
        {helper && <p className="truncate text-[12px] text-neutral-500">{helper}</p>}
      </div>
    </div>
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
    evidence_downloaded: "증빙 파일 다운로드",
    qa_contract_seeded: "계약 생성",
    share_link_issued: "공유 링크 생성",
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
