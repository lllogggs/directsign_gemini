import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppStore, type Contract, type ContractStatus } from "../../store";
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
  CheckCircle2,
  Clock3,
  Eraser,
  FileSignature,
  FileText,
  LifeBuoy,
  MessageSquare,
  PenTool,
  ShieldCheck,
  Trash2,
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
  APPROVED: "서명 가능",
  SIGNED: "서명 완료",
};

const getStatusLabel = (status: ContractStatus) => STATUS_LABELS[status] ?? status;

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
  return message;
};

export function ContractViewer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const getContract = useAppStore((state) => state.getContract);
  const updateClauseStatus = useAppStore((state) => state.updateClauseStatus);
  const replaceContract = useAppStore((state) => state.replaceContract);
  const contract = getContract(id || "");

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

  const [showSignModal, setShowSignModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contractDocRef = useRef<HTMLElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<CanvasPoint | null>(null);
  const [hasSignatureStroke, setHasSignatureStroke] = useState(false);
  const [isSignLoading, setIsSignLoading] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);

  const shareToken = searchParams.get("token") ?? "";
  const supportAccessRequestId = searchParams.get("support") ?? "";
  const [isFetchingSharedContract, setIsFetchingSharedContract] = useState(false);
  const [sharedContractError, setSharedContractError] = useState("");
  const [serverAccessVerified, setServerAccessVerified] = useState(false);
  const [serverAccessRole, setServerAccessRole] = useState<string>();
  const [supportReason, setSupportReason] = useState("");
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);
  const [supportNotice, setSupportNotice] = useState("");

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): CanvasPoint | null => {
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
  };

  const handleSignComplete = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!hasSignatureStroke) {
      alert("서명을 완료하려면 먼저 서명란에 직접 서명해 주세요.");
      return;
    }
    if (!signerName.trim()) {
      alert("서명자 이름을 입력해 주세요.");
      return;
    }
    if (!consentAccepted) {
      alert("전자서명 동의 확인이 필요합니다.");
      return;
    }

    setIsSignLoading(true);
    const dataUrl = canvas.toDataURL("image/png");
    const consentText = "계약 조항을 확인했고 전자서명에 동의합니다.";

    try {
      const response = await fetch(`/api/contracts/${contract.id}/signatures/influencer`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-DirectSign-Share-Token": shareToken,
        },
        body: JSON.stringify({
          signature_data: dataUrl,
          signer_name: signerName.trim(),
          consent_accepted: consentAccepted,
          consent_text: consentText,
        }),
      });

      const result = (await response.json()) as {
        contract?: typeof contract;
        error?: string;
      };

      if (!response.ok || !result.contract) {
        throw new Error(result.error ?? "서명 저장에 실패했습니다.");
      }

      replaceContract(result.contract);
    } catch (error) {
      setIsSignLoading(false);
      alert(error instanceof Error ? error.message : "서명 저장에 실패했습니다.");
      return;
    }

    setShowSignModal(false);

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (contractDocRef.current) {
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import("html2canvas"),
          import("jspdf"),
        ]);
        const docCanvas = await html2canvas(contractDocRef.current, {
          scale: 2,
        });
        const imgData = docCanvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (docCanvas.height * pdfWidth) / docCanvas.width;

        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${contract.title.replace(/\s+/g, "_")}_signed_contract.pdf`);
      } catch (err) {
        console.error("PDF generation error:", err);
      }
    }

    setIsSignLoading(false);
    alert("계약 서명이 완료되었습니다. 서명본 PDF가 다운로드되었습니다.");
  };

  useEffect(() => {
    if (showSignModal && canvasRef.current) {
      const canvas = canvasRef.current;
      isDrawingRef.current = false;
      lastPointRef.current = null;
      setHasSignatureStroke(false);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      setSignerName(contract?.influencer_info.name ?? "");
      setConsentAccepted(false);
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
    setServerAccessVerified(false);
    setServerAccessRole(undefined);
    setSharedContractError("");
  }, [id, shareToken, supportAccessRequestId]);

  useEffect(() => {
    if (!id || serverAccessVerified) return;
    const needsServerCheck = true;
    if (!needsServerCheck) return;

    let cancelled = false;

    const fetchSharedContract = async () => {
      setIsFetchingSharedContract(true);
      setSharedContractError("");

      try {
        const query = new URLSearchParams();
        if (shareToken) query.set("token", shareToken);
        if (supportAccessRequestId) query.set("support", supportAccessRequestId);
        const suffix = query.size > 0 ? `?${query.toString()}` : "";
        const response = await fetch(`/api/contracts/${encodeURIComponent(id)}${suffix}`, {
          headers: {
            Accept: "application/json",
            ...(supportAccessRequestId
              ? { "X-DirectSign-Support-Access-Request": supportAccessRequestId }
              : {}),
          },
          credentials: "include",
        });
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
          setServerAccessVerified(true);
          setServerAccessRole(data.access_role);
        }
      } catch (error) {
        if (!cancelled) {
          setSharedContractError(
            error instanceof Error
              ? error.message
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
    id,
    replaceContract,
    serverAccessVerified,
    shareToken,
    supportAccessRequestId,
  ]);

  const shouldWaitForServerAccess =
    !serverAccessVerified;

  if (shouldWaitForServerAccess && isFetchingSharedContract) {
    return (
      <AccessMessage
        title="계약을 확인하는 중입니다"
        description="공유 링크 권한을 확인하고 계약 내용을 불러오고 있습니다."
      />
    );
  }

  if (shouldWaitForServerAccess && sharedContractError) {
    return (
      <AccessMessage
        title="계약을 불러올 수 없습니다"
        description={sharedContractError}
      />
    );
  }

  if (!contract) {
    return (
      <AccessMessage
        title="계약서를 찾을 수 없습니다"
        description="계약서가 삭제되었거나 링크가 올바르지 않을 수 있습니다."
      />
    );
  }

  const expectedShareToken = contract.evidence?.share_token;
  const shareTokenExpired =
    Boolean(contract.evidence?.share_token_expires_at) &&
    new Date(contract.evidence!.share_token_expires_at!).getTime() < Date.now();
  const shareTokenRequired =
    contract.evidence?.share_token_status === "active" &&
    Boolean(expectedShareToken);
  const hasValidShareToken =
    serverAccessVerified || !shareTokenRequired || shareToken === expectedShareToken;
  const isOperatorSupportView = serverAccessRole === "admin" && !shareToken;

  if (
    !isOperatorSupportView &&
    (contract.status === "DRAFT" ||
      contract.evidence?.share_token_status === "not_issued" ||
      contract.evidence?.share_token_status === "revoked")
  ) {
    return (
      <AccessMessage
        title="아직 활성화되지 않은 검토 링크입니다"
        description="광고주에게 새 계약 검토 링크 발급을 요청해 주세요."
      />
    );
  }

  if (!isOperatorSupportView && (shareTokenExpired || !hasValidShareToken)) {
    return (
      <AccessMessage
        title="보안 링크가 만료되었습니다"
        description="계속 진행하려면 광고주에게 새 검토 링크를 요청해 주세요."
      />
    );
  }

  const allApproved = contract.clauses.every((clause) => clause.status === "APPROVED");
  const pendingClauses = contract.clauses.filter(
    (clause) => clause.status !== "APPROVED",
  ).length;
  const approvedClauses = contract.clauses.length - pendingClauses;
  const lastUpdated = format(new Date(contract.updated_at), "yyyy.MM.dd");
  const deadline = contract.campaign?.deadline
    ? format(new Date(contract.campaign.deadline), "yyyy.MM.dd")
    : contract.campaign?.end_date || contract.campaign?.period || "미지정";
  const reviewTone = allApproved ? "text-neutral-700" : "text-amber-700";

  const plainSummary = [
    {
      label: "캠페인",
      value: contract.title,
    },
    {
      label: "보상",
      value: contract.campaign?.budget || "미지정",
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
  const signatureEvidenceRows = signatureData
    ? [
        { label: "서명자", value: signatureData.signer_name || contract.influencer_info.name },
        { label: "서명 완료", value: formatDateTime(signatureData.signed_at) },
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

  const handleFeedbackSubmit = () => {
    if (!feedbackModal) return;
    const trimmedComment = feedbackComment.trim();

    if (!trimmedComment) {
      alert("광고주가 요청 의도를 이해할 수 있도록 사유를 입력해 주세요.");
      return;
    }

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
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const requestOperatorSupport = async () => {
    const reason = supportReason.trim();

    if (reason.length < 5) {
      setSupportNotice("운영자가 확인할 내용을 5자 이상 남겨주세요.");
      return;
    }

    setIsRequestingSupport(true);
    setSupportNotice("");

    try {
      const response = await fetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/support-access-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(shareToken ? { "X-DirectSign-Share-Token": shareToken } : {}),
          },
          body: JSON.stringify({ reason, scope: "contract_and_pdf" }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "운영자 확인 요청을 보내지 못했습니다.");
      }

      setSupportReason("");
      setSupportNotice("운영자가 24시간 동안 이 계약을 확인할 수 있습니다.");
    } catch (error) {
      setSupportNotice(
        error instanceof Error
          ? error.message
          : "운영자 확인 요청을 보내지 못했습니다.",
      );
    } finally {
      setIsRequestingSupport(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f7f8fa] text-neutral-950">
      {selection?.showTooltip && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full pb-3 animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-150"
          style={{ top: selection.y, left: selection.x }}
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

      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                보안 계약 검토
              </p>
              <h1 className="truncate text-base font-semibold text-neutral-950 sm:text-lg">
                {contract.title}
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <StatusPill status={contract.status} allApproved={allApproved} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 pb-36 pt-4 sm:px-6 sm:pb-32 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <section className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                    {contract.type} 계약
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                    보안 링크 확인됨
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 sm:hidden">
                    {getStatusLabel(contract.status)}
                  </span>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                  서명 전 계약 내용을 확인하세요
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                  핵심 조건을 먼저 확인하고, 수정이 필요한 조항은 해당 문구를 선택해
                  요청을 남긴 뒤 모든 조항이 승인되면 서명할 수 있습니다.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:w-64">
                <MetricCard label="승인" value={`${approvedClauses}/${contract.clauses.length}`} />
                <MetricCard label="대기" value={String(pendingClauses)} tone={pendingClauses ? "amber" : "neutral"} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {plainSummary.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
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
            className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
          >
            <div className="border-b border-neutral-200 bg-neutral-50 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    계약 조항
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-neutral-950">
                    조항별 검토
                  </h2>
                </div>
                <div className={`flex items-center gap-2 text-sm font-medium ${reviewTone}`}>
                  {allApproved ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {allApproved ? "서명 준비 완료" : `${pendingClauses}개 조항 확인 필요`}
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
                            {clause.category}
                          </h3>
                          <p className="mt-1 text-xs text-neutral-500">
                            아래 문구를 정확히 선택하면 수정이나 삭제 요청을 보낼 수 있습니다.
                          </p>
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
                        {isApproved ? "승인 완료" : "수정 요청 중"}
                      </span>
                    </div>

                    <div className="mt-5 rounded-lg border border-neutral-200 bg-white p-4 text-[15px] leading-7 text-neutral-800 selection:bg-neutral-200 selection:text-neutral-950 sm:p-5">
                      <p className="whitespace-pre-wrap">{clause.content}</p>
                    </div>

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
                                  {historyItem.role === "influencer" ? "나" : "광고주"}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {format(new Date(historyItem.timestamp), "yyyy.MM.dd HH:mm")}
                                </span>
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                                  {historyItem.action}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                                {historyItem.comment}
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
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                <FileText className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-950">
                  검토 체크리스트
                </p>
                <p className="text-xs text-neutral-500">최근 수정 {lastUpdated}</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <ChecklistRow checked label="보안 링크 확인됨" />
              <ChecklistRow checked={allApproved} label="모든 조항 승인 완료" />
              <ChecklistRow checked={contract.status === "SIGNED"} label="서명 완료" />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-950">
                  인플루언서 계정 확인
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  계약 검토와 서명은 계속 가능하며, 반복 거래나 정산 전 계정 확인을 요청할 수 있습니다.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/influencer/verification?contractId=${contract.id}${
                    shareToken ? `&token=${shareToken}` : ""
                  }`,
                )
              }
              className="mt-4 h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
            >
              계정 확인 요청
            </button>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
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
                    당사자 요청으로 열린 화면입니다. 본문과 PDF 열람은 감사 기록에 남습니다.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                    <LifeBuoy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      운영자 확인 요청
                    </p>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                      로그인한 계약 당사자가 요청할 때만 24시간 열람권이 열립니다.
                    </p>
                  </div>
                </div>
                <Textarea
                  className="min-h-[88px] rounded-lg border-neutral-200 bg-white p-3 text-sm text-neutral-950 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-950"
                  placeholder="예: 정산 조항 해석을 확인해 주세요."
                  value={supportReason}
                  onChange={(event) => setSupportReason(event.target.value)}
                />
                {supportNotice && (
                  <p className="text-xs font-semibold text-neutral-600">
                    {supportNotice}
                  </p>
                )}
                <button
                  type="button"
                  onClick={requestOperatorSupport}
                  disabled={isRequestingSupport || supportReason.trim().length < 5}
                  className="h-10 w-full rounded-lg bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500"
                >
                  요청 보내기
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
              계약 당사자
            </p>
            <div className="mt-4 space-y-4">
              <PartyRow label="광고주" value={contract.advertiser_info?.name || "광고주"} />
              <PartyRow label="인플루언서" value={contract.influencer_info.name} />
            </div>
            {contract.status === "SIGNED" && signatureData && (
              <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-700">
                    서명 증빙
                  </p>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
                    감사 기록 저장
                  </span>
                </div>
                {signatureData.inf_sign && (
                  <img
                    src={signatureData.inf_sign}
                    alt="인플루언서 서명"
                    className="mt-3 h-12 max-w-full mix-blend-multiply"
                  />
                )}
                <div className="mt-4 grid gap-2">
                  {signatureEvidenceRows.map((row) => (
                    <div key={row.label}>
                      <PartyRow label={row.label} value={row.value} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>

      {contract.status !== "SIGNED" && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  allApproved ? "bg-neutral-100 text-neutral-700" : "bg-amber-50 text-amber-700"
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
                  {allApproved
                    ? "모든 조항을 확인했고 서명할 준비가 되었습니다."
                    : "서명 전에 남은 조항 요청을 먼저 정리해야 합니다."}
                </p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  서명하면 감사 이력이 기록되고 서명본 PDF가 다운로드됩니다.
                </p>
              </div>
            </div>
            <button
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition sm:w-auto sm:min-w-56 ${
                allApproved
                  ? "bg-neutral-950 text-white hover:bg-neutral-800"
                  : "cursor-not-allowed bg-neutral-200 text-neutral-500"
              }`}
              disabled={!allApproved}
              onClick={() => setShowSignModal(true)}
            >
              <FileSignature className="h-4 w-4" />
              {allApproved ? "동의 후 서명하기" : "서명 잠김"}
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={feedbackModal?.isOpen}
        onOpenChange={(open) => !open && setFeedbackModal(null)}
      >
        <DialogContent className="rounded-xl border-neutral-200 p-0 shadow-2xl sm:max-w-lg">
          <div className="border-b border-neutral-200 p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-neutral-950">
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
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">
              "{feedbackModal?.selectedText}"
            </div>
            <Textarea
              className="min-h-[132px] resize-none rounded-lg border-neutral-200 bg-white p-4 text-sm text-neutral-950 placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-950"
              placeholder={
                feedbackModal?.type === "MODIFICATION_REQUESTED"
                  ? "예: 게시 유지 기간을 3개월로 조정해 주세요."
                  : "예: 이 조항은 합의한 캠페인 범위에 해당하지 않습니다."
              }
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
            />
          </div>
          <div className="flex gap-3 border-t border-neutral-200 bg-neutral-50 p-4">
            <button
              className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
              onClick={() => setFeedbackModal(null)}
            >
              취소
            </button>
            <button
              className="h-11 flex-[2] rounded-lg bg-neutral-950 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
              onClick={handleFeedbackSubmit}
              disabled={!feedbackComment.trim()}
            >
              요청 보내기
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSignModal} onOpenChange={setShowSignModal}>
        <DialogContent className="rounded-xl border-neutral-200 p-0 shadow-2xl sm:max-w-lg">
          <div className="border-b border-neutral-200 p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-neutral-950">
                <FileSignature className="h-5 w-5" strokeWidth={1.8} />
                동의 후 서명
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-6 text-neutral-600">
                서명은 승인된 모든 조항을 확인하고 동의했다는 증빙으로 남습니다.
                완료 후 서명본 PDF가 생성됩니다.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">
              모든 조항이 승인되었습니다. 서명자 이름과 동의 여부는 감사 기록에 함께 저장됩니다.
            </div>
            <label className="block">
              <span className="text-[13px] font-semibold text-neutral-800">
                서명자 이름
              </span>
              <input
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-950 outline-none transition focus:border-neutral-950"
                placeholder="이름 또는 활동명"
              />
            </label>
            <div className="relative h-48 overflow-hidden rounded-lg border border-neutral-300 bg-white">
              <canvas
                ref={canvasRef}
                className="h-full w-full cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <button
                onClick={clearSignature}
                className="absolute right-3 top-3 flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 shadow-sm hover:bg-neutral-50"
              >
                <Eraser className="h-3.5 w-3.5" strokeWidth={1.8} />
                지우기
              </button>
            </div>
            <p
              className={`text-sm font-medium ${
                hasSignatureStroke ? "text-neutral-800" : "text-amber-700"
              }`}
            >
              {hasSignatureStroke
                ? "서명이 입력되었습니다."
                : "서명란에 직접 서명해 주세요."}
            </p>
            <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm leading-5 text-neutral-700">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 accent-neutral-950"
              />
              <span>
                계약 조항을 확인했고 전자서명에 동의합니다.
              </span>
            </label>
          </div>

          <div className="flex gap-3 border-t border-neutral-200 bg-neutral-50 p-4">
            <button
              className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
              onClick={() => setShowSignModal(false)}
            >
              취소
            </button>
            <button
              className="h-11 flex-[2] rounded-lg bg-neutral-950 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
              onClick={handleSignComplete}
              disabled={isSignLoading || !hasSignatureStroke || !consentAccepted || !signerName.trim()}
            >
              {isSignLoading ? "완료 중..." : "서명 완료"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccessMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f8fa] px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-neutral-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
      </div>
    </div>
  );
}

function StatusPill({
  status,
  allApproved,
}: {
  status: ContractStatus;
  allApproved: boolean;
}) {
  const isSigned = status === "SIGNED";
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
        ? "bg-amber-50 text-amber-700"
        : "bg-neutral-100 text-neutral-800";

  return (
    <div className={`rounded-lg p-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ChecklistRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          checked ? "bg-neutral-100 text-neutral-700" : "bg-neutral-100 text-neutral-400"
        }`}
      >
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
      </div>
      <span className={checked ? "text-neutral-800" : "text-neutral-500"}>{label}</span>
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
