import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ContractStatus, useAppStore } from "../../store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Copy } from "lucide-react";
import { format } from "date-fns";

export function ContractAdminViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getContract = useAppStore((state) => state.getContract);
  const updateClauseStatus = useAppStore((state) => state.updateClauseStatus);
  const updateContract = useAppStore((state) => state.updateContract);
  const contract = getContract(id || "");

  const [replyContent, setReplyContent] = useState<{
    [clauseId: string]: string;
  }>({});

  if (!contract) return <div>계약서를 찾을 수 없습니다.</div>;

  const handleAction = (
    clauseId: string,
    action: "수락" | "거절" | "대안 제시",
    newStatus: "APPROVED" | "MODIFICATION_REQUESTED",
  ) => {
    updateClauseStatus(contract.id, clauseId, newStatus, {
      role: "advertiser",
      action,
      comment:
        replyContent[clauseId] ||
        (action === "수락"
          ? "요청하신 내용을 수락합니다."
          : action === "거절"
            ? "요청하신 내용을 수락하기 어렵습니다."
            : ""),
      timestamp: new Date().toISOString(),
    });
    setReplyContent((prev) => ({ ...prev, [clauseId]: "" }));
  };

  const copyLink = () => {
    if (contract.evidence?.share_token_status !== "active") {
      alert("공유 링크 생성 후 복사할 수 있습니다.");
      return;
    }

    navigator.clipboard.writeText(
      `${window.location.origin}/contract/${contract.id}`,
    );
    alert("인플루언서용 링크가 복사되었습니다.");
  };

  const saveDraft = () => {
    const now = new Date().toISOString();
    updateContract(contract.id, {
      status: "DRAFT",
      workflow: {
        next_actor: "advertiser",
        next_action: "발송 전 확인 후 공유 링크를 생성하세요.",
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
          description: "광고주가 계약을 초안으로 저장했습니다.",
          created_at: now,
        },
      ],
    });
  };

  const requestSignatures = () => {
    const now = new Date().toISOString();
    updateContract(contract.id, {
      status: "REVIEWING",
      workflow: {
        next_actor: "influencer",
        next_action: "인플루언서 검토 응답을 기다리는 중입니다.",
        due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        risk_level: "medium",
        last_message: "서명 요청용 공유 링크가 생성되었습니다.",
      },
      evidence: {
        share_token_status: "active",
        share_token_expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        audit_ready: true,
        pdf_status: "draft_ready",
      },
      audit_events: [
        ...(contract.audit_events ?? []),
        {
          id: `audit_${Date.now()}`,
          actor: "advertiser",
          action: "signature_requested",
          description: "광고주가 인플루언서 검토 및 서명 요청 링크를 발급했습니다.",
          created_at: now,
        },
      ],
    });
  };

  const allApproved = contract.clauses.every((clause) => clause.status === "APPROVED");
  const statusLabel = getStatusLabel(contract.status);

  return (
    <div className="flex flex-col h-screen bg-[#FAFAFA] text-neutral-900 overflow-hidden font-sans">
      <header className="h-[80px] px-12 border-b border-neutral-100 bg-white flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/marketing/dashboard")}
            className="p-2 hover:bg-neutral-50 rounded-full transition-colors -ml-2 text-neutral-400 hover:text-neutral-900"
          >
            <ArrowLeft strokeWidth={1.5} className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 border-l border-neutral-100 pl-4">
            <div className="w-8 h-8 bg-neutral-900 rounded-sm flex items-center justify-center text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <span className="text-lg font-heading tracking-widest uppercase text-neutral-900">
              DirectSign
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Button
            variant="outline"
            onClick={copyLink}
            className="text-neutral-900 border-neutral-200 font-medium gap-2 rounded-none px-6 shadow-none hover:bg-neutral-50 text-[12px] uppercase tracking-wider h-[44px]"
          >
            <Copy strokeWidth={1.5} className="w-4 h-4" /> Copy Link
          </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[300px] border-r border-neutral-100 bg-[#FAFAFA] p-12 flex flex-col gap-12 shrink-0 relative z-10">
          <div>
            <h3 className="text-[10px] font-medium text-neutral-400 uppercase tracking-[0.2em] mb-8">
              Contract Info
            </h3>
            <div className="space-y-8 text-[13px]">
              <div>
                <p className="text-neutral-400 font-medium mb-3 uppercase text-[10px] tracking-[0.1em]">Influencer</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white border border-neutral-200 flex items-center justify-center text-xs font-medium text-neutral-600 uppercase rounded-sm">{contract.influencer_info.name.charAt(0)}</div>
                  <p className="font-medium text-neutral-900">
                    {contract.influencer_info.name}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-neutral-400 font-medium mb-3 uppercase text-[10px] tracking-[0.1em]">Contact</p>
                <p className="font-mono text-neutral-600">
                  {contract.influencer_info.contact || "-"}
                </p>
              </div>
              <div>
                <p className="text-neutral-400 font-medium mb-3 uppercase text-[10px] tracking-[0.1em]">Channel</p>
                <a
                  href={contract.influencer_info.channel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-900 font-mono underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900 transition-colors truncate block"
                >
                  {contract.influencer_info.channel_url || "-"}
                </a>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-neutral-200 pt-8 flex flex-col gap-3">
            <p className="text-[10px] text-neutral-400 font-medium tracking-[0.2em] uppercase">
              Status
            </p>
            <div className="flex items-center gap-3">
              <span
                className={`w-1.5 h-1.5 rounded-full ${contract.status === "NEGOTIATING" ? "bg-amber-500 animate-pulse" : contract.status === "SIGNED" ? "bg-emerald-500" : "bg-neutral-500"}`}
              ></span>
              <span className="text-[12px] font-medium tracking-wide uppercase text-neutral-900">
                {statusLabel}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Editor */}
        <section className="flex-1 bg-[#FAFAFA] flex flex-col pt-12 overflow-hidden relative items-center">
          <div className="w-full max-w-[800px] flex items-center justify-between mb-8 shrink-0 px-8">
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-heading font-light tracking-tight text-neutral-900">{contract.title}</h2>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={saveDraft}
                className="px-6 h-[44px] text-neutral-600 bg-transparent border border-neutral-200 rounded-none text-[12px] uppercase tracking-wider font-medium hover:bg-neutral-50 transition-colors"
              >
                초안 저장
              </button>
            </div>
          </div>

          {/* Document Container */}
          <div className="flex-1 bg-white border border-neutral-100 shadow-[0_8px_40px_rgba(0,0,0,0.04)] overflow-y-auto flex flex-col w-full max-w-[800px] relative custom-scrollbar pb-16">
            <div className="h-[80px] bg-white border-b border-neutral-100 flex items-center px-12 text-neutral-400 text-[10px] uppercase font-medium tracking-[0.2em] shrink-0 sticky top-0 z-10 justify-between">
              <span>{contract.type} Agreement</span>
              <span className="font-mono">{new Date().toISOString().split('T')[0]}</span>
            </div>
            
            <div className="flex-1 p-16 text-neutral-800 leading-[1.8] space-y-12 relative">
              {contract.clauses.map((clause, i) => {
                const isPending = clause.status !== "APPROVED";

                return (
                  <div key={clause.clause_id} className="relative">
                    <p className="font-medium text-[13px] uppercase tracking-[0.1em] mb-4 text-neutral-900 flex gap-4">
                      <span className="text-neutral-400 font-mono">{(i + 1).toString().padStart(2, '0')}</span> 
                      {clause.category}
                    </p>

                    {isPending ? (
                      <div className="relative bg-[#FAFAFA] p-8 mt-6 border-l-2 border-amber-500 group">
                        <p className="text-[14px] text-neutral-700 leading-relaxed whitespace-pre-wrap">{clause.content}</p>

                        {clause.history.length > 0 &&
                          clause.history[clause.history.length - 1].role ===
                            "influencer" && (
                            <div className="mt-8 bg-white p-6 border border-neutral-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                              <div className="flex items-center gap-3 mb-4">
                                <span className="text-[10px] uppercase tracking-widest font-medium text-amber-600">
                                  Counterparty Message
                                </span>
                              </div>
                              <p className="text-[14px] text-neutral-900 leading-relaxed mb-6 whitespace-pre-wrap font-serif italic text-lg px-4 border-l border-neutral-200">
                                {clause.history[clause.history.length - 1].comment}
                              </p>

                              <Textarea
                                className="mb-6 text-[13px] bg-[#FAFAFA] border-neutral-200 min-h-[100px] text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-neutral-900 rounded-none p-4"
                                placeholder="Write your response..."
                                value={replyContent[clause.clause_id] || ""}
                                onChange={(e) =>
                                  setReplyContent((prev) => ({
                                    ...prev,
                                    [clause.clause_id]: e.target.value,
                                  }))
                                }
                              />

                              <div className="flex gap-3">
                                <button
                                  onClick={() =>
                                    handleAction(
                                      clause.clause_id,
                                      "수락",
                                      "APPROVED",
                                    )
                                  }
                                  className="flex-1 h-[48px] bg-neutral-900 text-white text-[12px] uppercase tracking-wider font-medium transition-colors hover:bg-neutral-800"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() =>
                                    handleAction(
                                      clause.clause_id,
                                      "대안 제시",
                                      "MODIFICATION_REQUESTED",
                                    )
                                  }
                                  className="flex-1 h-[48px] bg-white border border-neutral-200 text-neutral-900 text-[12px] uppercase tracking-wider font-medium transition-colors hover:bg-neutral-50"
                                >
                                  Counter Offer
                                </button>
                              </div>
                            </div>
                          )}
                      </div>
                    ) : (
                      <p className="text-[14px] font-normal pl-8 leading-relaxed text-neutral-600 whitespace-pre-wrap">
                        {clause.content}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Rail: Audit Log */}
        <aside className="w-[400px] border-l border-neutral-100 bg-white shrink-0 flex flex-col z-20 shadow-[-24px_0_40px_rgba(0,0,0,0.01)]">
          <div className="p-12 overflow-y-auto flex-1 custom-scrollbar">
            <h3 className="text-[10px] font-medium text-neutral-400 uppercase tracking-[0.2em] mb-12">Audit Log</h3>
            <div className="space-y-10 relative">
              <div className="absolute left-[3px] top-4 bottom-4 w-[1px] bg-neutral-100 z-0"></div>
              {(contract.audit_events ?? []).length === 0 ? (
                <p className="text-[13px] leading-6 text-neutral-400">
                  아직 기록된 감사 이벤트가 없습니다.
                </p>
              ) : (
                [...(contract.audit_events ?? [])]
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime(),
                  )
                  .map((event) => (
                    <div key={event.id} className="flex gap-6 relative z-10">
                      <div
                        className={`w-[7px] h-[7px] rounded-full shrink-0 shadow-sm mt-1.5 flex items-center justify-center ${event.actor === "influencer" ? "bg-amber-500" : "bg-neutral-900"}`}
                      >
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-col gap-1 mb-2">
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {format(new Date(event.created_at), "MMM dd, HH:mm")}
                          </span>
                          <p className={`text-[12px] font-medium uppercase tracking-wider ${event.actor === "influencer" ? "text-amber-600" : "text-neutral-900"}`}>
                            {event.actor === "influencer"
                              ? "Counterparty"
                              : event.actor === "system"
                                ? "System"
                                : "You"}{" "}
                            {event.action}
                          </p>
                        </div>
                        <p className="text-[13px] text-neutral-700 leading-relaxed font-serif italic border-l border-neutral-200 pl-4 py-1 mt-3">
                          {event.description}
                        </p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="p-12 bg-[#FAFAFA] border-t border-neutral-100 mt-auto shrink-0 space-y-4">
            <button
              type="button"
              onClick={requestSignatures}
              disabled={!allApproved || contract.status === "SIGNED"}
              className="w-full h-[52px] bg-neutral-900 hover:bg-neutral-800 text-white rounded-none text-[12px] uppercase tracking-wider font-medium shadow-none transition-colors disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              서명 요청 보내기
            </button>
            <p className="text-[11px] text-neutral-500 text-center uppercase tracking-widest font-mono">
              {allApproved ? (
                <>All clauses <span className="text-emerald-600">approved</span></>
              ) : (
                <span className="text-amber-600">Pending clause review</span>
              )}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: "작성 중",
  REVIEWING: "검토 중",
  NEGOTIATING: "수정 요청",
  APPROVED: "서명 대기",
  SIGNED: "완료",
};

const getStatusLabel = (status: ContractStatus) => STATUS_LABELS[status] ?? status;
