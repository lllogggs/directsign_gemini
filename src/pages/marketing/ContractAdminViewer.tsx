import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  LifeBuoy,
  Link2,
  MessageSquareText,
  PenLine,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { ClauseHistory, Contract, ContractStatus, useAppStore } from "../../store";
import { createShareToken } from "../../domain/contracts";
import { PRODUCT_NAME } from "../../domain/brand";

const buildShareUrl = (contractId: string, shareToken?: string) =>
  `${window.location.origin}/contract/${contractId}${
    shareToken ? `?token=${encodeURIComponent(shareToken)}` : ""
  }`;

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
    label: "완료",
    helper: "서명본 보관 완료",
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
  const contract = getContract(id || "");
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();
  const [supportReason, setSupportReason] = useState("");
  const [isRequestingSupport, setIsRequestingSupport] = useState(false);
  const [draftConfirmationOpen, setDraftConfirmationOpen] = useState(false);

  const summary = useMemo(() => {
    if (!contract) return undefined;
    const pendingClauses = contract.clauses.filter((clause) => clause.status !== "APPROVED");
    const activeShare = contract.evidence?.share_token_status === "active";
    const allApproved = pendingClauses.length === 0;

    return {
      pendingClauses,
      activeShare,
      allApproved,
      shareUrl: buildShareUrl(contract.id, contract.evidence?.share_token),
    };
  }, [contract]);

  if (!contract || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-6 text-center">
        <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
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
        ? "서명 요청 보내기"
        : "수정 요청 검토";
  const canRequestSignatures = summary.allApproved && contract.status !== "SIGNED";

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
    const now = new Date().toISOString();
    const shareToken = contract.evidence?.share_token ?? createShareToken();

    updateContract(contract.id, {
      status: "APPROVED",
      workflow: {
        next_actor: "influencer",
        next_action: "인플루언서의 최종 서명을 기다리는 중입니다.",
        due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        risk_level: "medium",
        last_message: "최종본 서명 요청을 발송했습니다.",
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
          description: "광고주가 최종본 서명 요청 링크를 발급했습니다.",
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

    setIsRequestingSupport(true);

    try {
      const response = await fetch(
        `/api/contracts/${encodeURIComponent(contract.id)}/support-access-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
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
      setNotice("운영자가 24시간 동안 이 계약을 확인할 수 있습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "운영자 확인 요청을 보내지 못했습니다.",
      );
    } finally {
      setIsRequestingSupport(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:text-neutral-950"
              aria-label="대시보드로 돌아가기"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-sm">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  계약 워크스페이스
                </p>
                <p className="truncate text-[16px] font-semibold">{PRODUCT_NAME}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              disabled={!summary.activeShare}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-700 transition-colors hover:border-neutral-300 disabled:text-neutral-300"
            >
              <Copy className="h-4 w-4" />
              링크 복사
            </button>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={contract.status === "SIGNED"}
              className="hidden h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 sm:inline-flex"
            >
              <Send className="h-4 w-4" />
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10">
        <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={contract.status} />
                <span className="rounded-md border border-neutral-200 bg-[#fafafa] px-2.5 py-1 text-[12px] font-semibold text-neutral-500">
                  {contract.type}
                </span>
              </div>
              <h1 className="max-w-4xl text-[30px] font-semibold leading-tight tracking-[-0.03em] text-neutral-950 sm:text-[38px]">
                {contract.title}
              </h1>
              <p className="mt-3 max-w-3xl text-[14px] leading-6 text-neutral-500">
                {contract.workflow?.next_action ?? STATUS_META[contract.status].helper}
              </p>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[520px]">
              <InfoTile label="인플루언서" value={contract.influencer_info.name} />
              <InfoTile label="금액" value={contract.campaign?.budget ?? "미정"} />
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
            helper={contract.evidence?.pdf_status === "signed_ready" ? "서명 PDF 준비" : "초안 PDF 기준"}
            tone="neutral"
          />
          <WorkflowCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="저장 상태"
            value={syncError ? "확인 필요" : isSyncing ? "저장 중" : "저장 완료"}
            helper={syncError ? "동기화 실패 가능성" : "서버 저장소와 동기화"}
            tone={syncError ? "amber" : "neutral"}
          />
        </section>

        {notice && (
          <div className="mb-5 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13px] font-semibold text-neutral-800">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {notice}
            </span>
            <button type="button" onClick={() => setNotice(undefined)} className="text-neutral-700">
              닫기
            </button>
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="space-y-4">
            <Panel title="상대방 정보">
              <div className="space-y-4">
                <PersonLine
                  label="인플루언서"
                  value={contract.influencer_info.name}
                  helper={contract.influencer_info.contact || "연락처 미입력"}
                />
                <a
                  href={contract.influencer_info.channel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-[#fafafa] px-3 py-3 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-white"
                >
                  채널 열기
                  <ExternalLink className="h-4 w-4 text-neutral-400" />
                </a>
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
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
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
            className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white shadow-sm"
          >
            <div className="border-b border-neutral-200 px-5 py-4">
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
                            {clause.category}
                          </h3>
                          <ClauseBadge status={clause.status} />
                        </div>
                        <p className="max-w-3xl whitespace-pre-wrap text-[14px] leading-7 text-neutral-700">
                          {clause.content}
                        </p>
                      </div>
                    </div>

                    {latestHistory && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-amber-700">
                          <MessageSquareText className="h-4 w-4" />
                          인플루언서 의견
                        </div>
                        <p className="whitespace-pre-wrap text-[14px] leading-6 text-neutral-800">
                          {latestHistory.comment}
                        </p>
                      </div>
                    )}

                    {needsReview && (
                      <div className="mt-4 rounded-lg border border-neutral-200 bg-[#fafafa] p-4">
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
                <div className="rounded-lg border border-neutral-200 bg-[#fafafa] p-4">
                  <p className="text-[13px] font-semibold text-neutral-900">
                    {summary.activeShare ? "공유 링크 활성화" : "공유 링크 비활성"}
                  </p>
                  <p className="mt-2 truncate font-mono text-[12px] text-neutral-500">
                    {summary.activeShare ? summary.shareUrl : "서명 요청 시 링크가 활성화됩니다."}
                  </p>
                  <button
                    type="button"
                    onClick={copyLink}
                    disabled={!summary.activeShare}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[12px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:text-neutral-300"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    복사
                  </button>
                </div>
                <button
                  type="button"
                  onClick={requestSignatures}
                  disabled={!canRequestSignatures}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  <Send className="h-4 w-4" />
                  {primaryActionLabel}
                </button>
                {!summary.allApproved && (
                  <p className="text-center text-[12px] font-semibold text-amber-700">
                    조항 검토가 끝나면 서명 요청을 보낼 수 있습니다.
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="운영자 확인">
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-[#fafafa] p-4">
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
                <button
                  type="button"
                  onClick={requestOperatorSupport}
                  disabled={isRequestingSupport || supportReason.trim().length < 5}
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
                          {actorLabel(event.actor)} · {event.action}
                        </p>
                        <p className="mt-1 text-[12px] text-neutral-400">
                          {formatDateTime(event.created_at)}
                        </p>
                        <p className="mt-2 text-[13px] leading-6 text-neutral-600">
                          {event.description}
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
    <div className="rounded-lg border border-neutral-200 bg-[#fafafa] px-4 py-3">
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
    <div className={`rounded-lg border p-4 shadow-sm ${className}`}>
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
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
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
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-[13px] font-semibold text-white">
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

function ClauseBadge({ status }: { status: "APPROVED" | "MODIFICATION_REQUESTED" | "DELETION_REQUESTED" }) {
  if (status === "APPROVED") {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">
        승인
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
