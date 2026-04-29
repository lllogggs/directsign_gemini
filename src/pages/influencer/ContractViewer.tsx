import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore, Clause } from "../../store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  PenTool,
  Trash2,
  Check,
  MessageSquare,
  AlertCircle,
  FileSignature,
  Eraser,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export function ContractViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getContract = useAppStore((state) => state.getContract);
  const updateClauseStatus = useAppStore((state) => state.updateClauseStatus);
  const contract = getContract(id || "");

  // Selection state
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
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Signature Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contractDocRef = useRef<HTMLElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSignLoading, setIsSignLoading] = useState(false);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.beginPath(); // reset path
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";

    const rect = canvas.getBoundingClientRect();
    let x, y;

    if ("touches" in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
      e.preventDefault(); // prevent scrolling while signing
    } else {
      x = (e as React.MouseEvent).clientX - rect.left;
      y = (e as React.MouseEvent).clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSignComplete = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSignLoading(true);
    const dataUrl = canvas.toDataURL("image/png");

    // Simulate updating contract status
    useAppStore.getState().updateContract(contract.id, {
      status: "SIGNED",
      signature_data: {
        adv_sign: "...",
        inf_sign: dataUrl,
        signed_at: new Date().toISOString(),
        ip: "127.0.0.1",
      },
    });

    setSignatureData(dataUrl);
    setShowSignModal(false);

    // Wait for react to render the signature image
    await new Promise((r) => setTimeout(r, 500));

    if (contractDocRef.current) {
      try {
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
        pdf.save(`${contract.title.replace(/\s+/g, "_")}_전자계약.pdf`);
      } catch (err) {
        console.error("PDF 생성 에러:", err);
      }
    }

    setIsSignLoading(false);
    alert("계약이 성공적으로 체결되었으며, 사본(PDF)이 다운로드 되었습니다!");
  };

  // Setup canvas size
  useEffect(() => {
    if (showSignModal && canvasRef.current) {
      const canvas = canvasRef.current;
      // Fixed size for modal
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [showSignModal]);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        if (selection?.showTooltip) {
          // Close after a slight delay to allow button clicks inside tooltip
          setTimeout(() => setSelection(null), 150);
        }
        return;
      }

      // Check if selection is within a clause element
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

  if (!contract) {
    return (
      <div className="p-8 text-center text-gray-500">
        계약서를 찾을 수 없습니다.
      </div>
    );
  }

  const allApproved = contract.clauses.every((c) => c.status === "APPROVED");
  const isInfluencer = true; // Simulating influencer view

  const handleFeedbackSubmit = () => {
    if (!feedbackModal) return;

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
        comment: `[선택: "${feedbackModal.selectedText}"]\n${feedbackComment}`,
        timestamp: new Date().toISOString(),
      },
    );

    setFeedbackModal(null);
    setFeedbackComment("");
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#FAFAFA] text-neutral-900 overflow-hidden font-sans">
      {/* Selection Tooltip */}
      {selection?.showTooltip && (
        <div
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full pb-3 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200"
          style={{ top: selection.y, left: selection.x }}
        >
          <div className="bg-neutral-900 text-white rounded-none px-2 py-1.5 flex gap-1 items-center shadow-xl border border-neutral-800">
            <button
              className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium tracking-wider uppercase hover:bg-neutral-800 transition-colors"
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
              <PenTool strokeWidth={1.5} className="w-3.5 h-3.5" /> Modify
            </button>
            <div className="w-px h-4 bg-neutral-700 mx-2" />
            <button
              className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium tracking-wider uppercase hover:bg-neutral-800 transition-colors text-rose-400"
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
              <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
          {/* Tooltip triangle */}
          <div className="absolute left-1/2 bottom-2 transform -translate-x-1/2 w-3 h-3 bg-neutral-900 rotate-45 border-r border-b border-neutral-800" />
        </div>
      )}

      {/* Header */}
      <header className="h-[80px] px-6 md:px-12 border-b border-neutral-100 bg-white flex items-center justify-between z-10 shrink-0 relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-neutral-900 rounded-sm flex items-center justify-center text-white font-bold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <span className="text-lg font-heading tracking-widest uppercase text-neutral-900">
            DirectSign
          </span>
        </div>
        <div className="flex items-center gap-2">
          {contract.status === "NEGOTIATING" && (
            <span className="px-4 py-2 border border-amber-200 bg-amber-50 text-amber-700 rounded-none text-[11px] font-medium tracking-[0.1em] uppercase">
              Action Required
            </span>
          )}
        </div>
      </header>

      {/* Document */}
      <main className="flex-1 flex overflow-hidden relative pb-[80px]">
        <section className="flex-1 bg-[#FAFAFA] flex flex-col pt-12 pb-20 px-4 md:px-8 overflow-y-auto relative custom-scrollbar">
          <div
            className="w-full max-w-[800px] flex flex-col bg-white shadow-[0_8px_40px_rgba(0,0,0,0.04)] border border-neutral-100 mx-auto relative mb-20 shrink-0 overflow-hidden"
            ref={contractDocRef}
          >
            <div className="h-[80px] bg-white border-b border-neutral-100 flex items-center justify-between px-12 text-neutral-400 text-[10px] uppercase font-medium tracking-[0.2em] w-full z-10">
              <span>{contract.type} Agreement</span>
              <span className="font-mono">{contract.id}</span>
            </div>
            <div className="p-12 md:p-16">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-heading font-light text-neutral-900 tracking-tight mb-12">
                  {contract.title}
                </h2>

                <div className="flex justify-center gap-16 text-[14px] text-neutral-600 font-medium py-10 border-y border-neutral-100">
                  <div className="flex flex-col items-center">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-4">
                      甲方 (Advertiser)
                    </p>
                    <p className="text-neutral-900 font-serif text-2xl italic">당근 마케팅랩</p>
                    {contract.status === "SIGNED" &&
                      contract.signature_data && (
                        <p className="mt-4 text-[10px] tracking-widest uppercase font-medium text-emerald-600 border border-emerald-200 bg-emerald-50 px-4 py-2">
                          Signed
                        </p>
                      )}
                  </div>
                  <div className="w-px bg-neutral-200"></div>
                  <div className="flex flex-col items-center">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-4">
                      乙方 (Influencer)
                    </p>
                    <p className="text-neutral-900 font-serif text-2xl italic">
                      {contract.influencer_info.name}
                    </p>
                    {contract.status === "SIGNED" &&
                      contract.signature_data?.inf_sign && (
                        <img
                          src={contract.signature_data.inf_sign}
                          alt="Signature"
                          className="h-12 mt-4 mx-auto mix-blend-multiply opacity-80"
                        />
                      )}
                  </div>
                </div>
              </div>

              <div className="space-y-12 text-neutral-800">
                {contract.clauses.map((clause, i) => {
                  const isDisputed = clause.status !== "APPROVED";

                  return (
                    <div
                      key={clause.clause_id}
                      data-clause-id={clause.clause_id}
                      className={`relative p-8 -mx-8 transition-all duration-300 
                      ${isDisputed ? "bg-[#FAFAFA] border-y border-amber-100" : "bg-white hover:bg-neutral-50"}`}
                    >
                      <h3 className="font-medium text-neutral-900 mb-6 flex items-center justify-between text-[13px] uppercase tracking-[0.1em]">
                        <span className="flex gap-4 items-center">
                          <span className="text-neutral-400 font-mono">{(i + 1).toString().padStart(2, '0')}</span>
                          {clause.category}
                        </span>
                        {isDisputed && (
                          <span className="text-[10px] tracking-widest uppercase text-amber-600 border border-amber-200 bg-amber-50 px-3 py-1">
                            Action
                          </span>
                        )}
                      </h3>

                      <p className="text-neutral-600 leading-[1.8] font-normal selection:bg-neutral-200 selection:text-black text-[14px] whitespace-pre-wrap pl-8">
                        {clause.content}
                      </p>

                      {/* Thread History */}
                      {clause.history.length > 0 && (
                        <div className="mt-8 ml-8 space-y-6 bg-white p-8 border border-neutral-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
                          <div className="flex items-center gap-3 mb-6">
                             <div className="w-1.5 h-1.5 rounded-full bg-neutral-900" />
                             <span className="text-[10px] uppercase tracking-widest font-medium text-neutral-500">Negotiation Thread</span>
                          </div>
                          {clause.history.map((h, idx) => (
                            <div key={h.id} className="flex gap-6 text-sm mt-6 pt-6 border-t border-neutral-100 first:mt-0 first:pt-0 first:border-0">
                              <div
                                className={`w-8 h-8 flex items-center justify-center shrink-0 uppercase text-[10px] tracking-widest font-medium ${h.role === "influencer" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
                              >
                                {h.role === "influencer" ? "You" : "Adv"}
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-col gap-1 mb-3">
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={`font-medium text-[12px] uppercase tracking-wider ${h.role === "influencer" ? "text-neutral-900" : "text-neutral-600"}`}
                                    >
                                      {h.role === "influencer"
                                        ? "You"
                                        : "Advertiser"}
                                    </span>
                                    <span className="text-[11px] text-neutral-400 font-mono">
                                      {format(
                                        new Date(h.timestamp),
                                        "MMM dd, HH:mm",
                                      )}
                                    </span>
                                  </div>
                                  <span className={`text-[10px] w-fit font-medium uppercase tracking-widest ${h.role === "influencer" ? "text-amber-600" : "text-neutral-500"}`}>
                                    {h.action}
                                  </span>
                                </div>
                                <p className="text-neutral-700 whitespace-pre-wrap font-serif italic text-lg border-l border-neutral-200 pl-4 py-1">
                                  {h.comment}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Info Banner for Redlining */}
              {allApproved && contract.status === "REVIEWING" && (
                <div className="mt-16 border border-neutral-200 bg-[#FAFAFA] p-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center mx-auto">
                  <div className="p-4 bg-white border border-neutral-200 shrink-0">
                    <MessageSquare strokeWidth={1} className="w-6 h-6 text-neutral-400" />
                  </div>
                  <div>
                    <h4 className="font-heading text-xl tracking-tight mb-2 text-neutral-900">
                      Need to negotiate terms?
                    </h4>
                    <p className="text-neutral-500 text-[13px] leading-relaxed">
                      Highlight any text in the contract above to request modifications or deletions directly with the advertiser.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Floating Action Bar */}
      {contract.status !== "SIGNED" && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white p-6 flex justify-center z-40 shadow-[0_-8px_32px_rgba(0,0,0,0.02)]">
          <div className="max-w-[750px] w-full flex items-center justify-between px-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400 mb-2">
                Status
              </p>
              <p className="text-lg font-heading tracking-tight text-neutral-900">
                {contract.status === "NEGOTIATING" ? "Action Required" : contract.status}
              </p>
              {!allApproved && (
                <p className="text-[11px] text-amber-600 mt-1 uppercase tracking-widest font-mono">
                  Pending resolution
                </p>
              )}
            </div>
            <button
              className={`w-48 sm:w-[280px] h-[52px] text-[12px] uppercase tracking-wider font-medium rounded-none transition-all flex items-center justify-center ${
                allApproved 
                ? "bg-neutral-900 text-white hover:bg-neutral-800" 
                : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
              }`}
              disabled={!allApproved}
              onClick={() => setShowSignModal(true)}
            >
              {allApproved ? "Sign Contract" : "Complete Review First"}
            </button>
          </div>
        </div>
      )}

      {/* Feedback Dialog */}
      <Dialog
        open={feedbackModal?.isOpen}
        onOpenChange={(open) => !open && setFeedbackModal(null)}
      >
        <DialogContent className="sm:max-w-md rounded-none p-8 border-neutral-200 shadow-2xl">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-heading text-neutral-900 tracking-tight">
              Request {feedbackModal?.type === "MODIFICATION_REQUESTED" ? "Modification" : "Deletion"}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-neutral-500 mt-2">
              Explain your counter-proposal to the advertiser.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-[#FAFAFA] p-6 border-l-2 border-neutral-900 text-[13px] text-neutral-600 mb-6 font-serif italic">
            "{feedbackModal?.selectedText}"
          </div>
          <Textarea
            className="text-[14px] bg-white border-neutral-200 p-4 min-h-[120px] text-neutral-900 placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-neutral-900 rounded-none resize-none mb-4"
            placeholder={
              feedbackModal?.type === "MODIFICATION_REQUESTED"
                ? "e.g., Please amend this clause to state..."
                : "This clause is not applicable..."
             }
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
          />
          <div className="flex gap-4 mt-6 pt-6 border-t border-neutral-100">
            <button 
              className="flex-1 h-[48px] bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 text-[12px] uppercase tracking-wider font-medium transition-colors"
              onClick={() => setFeedbackModal(null)}>
              Cancel
            </button>
            <button 
              className="flex-[2] h-[48px] bg-neutral-900 hover:bg-neutral-800 text-white text-[12px] uppercase tracking-wider font-medium transition-colors shadow-none"
              onClick={handleFeedbackSubmit}>
              Submit Request
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Dialog */}
      <Dialog open={showSignModal} onOpenChange={setShowSignModal}>
        <DialogContent className="sm:max-w-md rounded-none p-8 border-neutral-200 shadow-[0_20px_60px_rgba(0,0,0,0.1)]">
          <DialogHeader className="mb-6">
            <DialogTitle className="flex items-center gap-3 text-2xl font-heading text-neutral-900 tracking-tight">
              <FileSignature strokeWidth={1.5} className="w-6 h-6 text-neutral-900" /> Signature
            </DialogTitle>
            <DialogDescription className="text-[13px] text-neutral-500 mt-2 leading-relaxed">
              By signing below, you agree to all terms. A verified PDF will be generated immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-[#FAFAFA] border border-neutral-200 h-48 relative overflow-hidden flex flex-col mt-6">
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair touch-none mix-blend-multiply"
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
              className="absolute top-4 right-4 bg-white hover:bg-neutral-50 text-neutral-500 p-2 border border-neutral-200 flex items-center gap-2 text-[10px] uppercase tracking-wider font-medium shadow-sm transition-colors"
            >
              <Eraser strokeWidth={1.5} className="w-3.5 h-3.5" /> Clear
            </button>
          </div>

          <div className="flex gap-4 mt-8 pt-6 border-t border-neutral-100">
            <button 
              className="flex-1 h-[48px] bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 text-[12px] uppercase tracking-wider font-medium transition-colors"
              onClick={() => setShowSignModal(false)}>
              Cancel
            </button>
            <button
              className="flex-[2] h-[48px] bg-neutral-900 hover:bg-neutral-800 text-white text-[12px] uppercase tracking-wider font-medium transition-colors shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSignComplete}
              disabled={isSignLoading}
            >
              {isSignLoading ? "Processing..." : "Complete Signature"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
