import React from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore, Contract, ContractStatus } from "../../store";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle,
  PenTool,
} from "lucide-react";
import { format } from "date-fns";

const COLUMNS: { id: ContractStatus; title: string; icon: React.ReactNode }[] =
  [
    {
      id: "DRAFT",
      title: "Drafts",
      icon: <FileText strokeWidth={1.5} className="w-4 h-4 text-neutral-400" />,
    },
    {
      id: "REVIEWING",
      title: "Out for Review",
      icon: <Clock strokeWidth={1.5} className="w-4 h-4 text-neutral-400" />,
    },
    {
      id: "NEGOTIATING",
      title: "Action Required",
      icon: <AlertCircle strokeWidth={1.5} className="w-4 h-4 text-amber-500" />,
    },
    {
      id: "APPROVED",
      title: "Ready to Sign",
      icon: <PenTool strokeWidth={1.5} className="w-4 h-4 text-neutral-400" />,
    },
    {
      id: "SIGNED",
      title: "Completed",
      icon: <CheckCircle strokeWidth={1.5} className="w-4 h-4 text-emerald-500" />,
    },
  ];

export function Dashboard() {
  const navigate = useNavigate();
  const contracts = useAppStore((state) => state.contracts);

  const getContractsByStatus = (status: ContractStatus) => {
    return contracts.filter((c) => c.status === status);
  };

  return (
    <div className="flex flex-col h-screen bg-[#FAFAFA] text-neutral-900 overflow-hidden font-sans">
      <header className="h-[80px] px-12 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-neutral-900 rounded-sm flex items-center justify-center text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <span className="text-lg font-heading tracking-widest uppercase text-neutral-900">
            DirectSign
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Button
            onClick={() => navigate("/marketing/builder")}
            className="bg-neutral-900 hover:bg-neutral-800 text-white rounded-none px-6 py-6 text-[13px] font-medium tracking-wide shadow-none uppercase transition-all duration-300"
          >
            <Plus className="w-4 h-4 mr-2" /> New Contract
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto p-12 pt-6">
        <div className="max-w-[1400px] mx-auto h-full flex flex-col">
          <div className="flex justify-between items-center mb-12 shrink-0">
            <div>
              <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-[0.2em] mb-2">Overview</p>
              <h1 className="text-4xl font-heading font-light text-neutral-900 tracking-tight">
                Contracts
              </h1>
            </div>
          </div>

          <div className="flex gap-8 flex-1 min-h-0 pb-12 overflow-x-auto hide-scrollbar">
            {COLUMNS.map((column) => (
              <div
                key={column.id}
                className="min-w-[340px] w-[340px] flex flex-col shrink-0"
              >
                <div className="flex items-center justify-between mb-8 px-1">
                  <div className="flex items-center gap-3">
                    {column.icon}
                    <h2 className="font-medium text-[13px] uppercase tracking-widest text-neutral-500">
                      {column.title}
                    </h2>
                  </div>
                  <span className="text-neutral-400 text-[12px] font-mono">
                    {getContractsByStatus(column.id).length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 hide-scrollbar pb-8 custom-scrollbar">
                  {getContractsByStatus(column.id).map((contract) => (
                    <ContractCard
                      key={contract.id}
                      contract={contract}
                      onClick={() =>
                        navigate(`/marketing/contract/${contract.id}`)
                      }
                    />
                  ))}
                  {getContractsByStatus(column.id).length === 0 && (
                    <div className="h-[120px] flex items-center justify-center text-neutral-300 text-[13px] font-light italic border border-neutral-200 border-dashed bg-transparent rounded-sm">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

interface ContractCardProps {
  contract: Contract;
  onClick: () => void;
}

const ContractCard: React.FC<ContractCardProps> = ({ contract, onClick }) => {
  const isNegotiating = contract.status === "NEGOTIATING";

  return (
    <div
      className={`group cursor-pointer transition-all duration-300 p-8 flex flex-col bg-white border ${
        isNegotiating
          ? "border-amber-200/60 shadow-[0_4px_24px_rgba(245,158,11,0.06)]"
          : "border-neutral-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.04)] hover:border-neutral-200"
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-center mb-6">
        <span
          className={`text-[10px] items-center flex font-medium uppercase tracking-[0.15em] ${isNegotiating ? "text-amber-600" : "text-neutral-400"}`}
        >
          {contract.type}
        </span>
        <span
          className="text-[11px] font-mono text-neutral-400"
        >
          {format(new Date(contract.updated_at), "MMM dd")}
        </span>
      </div>

      <p className="text-xl font-heading font-normal text-neutral-900 leading-snug line-clamp-2 mb-6 group-hover:text-black transition-colors">
        {contract.title}
      </p>
      
      <div className="mt-auto flex items-center gap-3">
        <div className="w-8 h-8 bg-neutral-50 border border-neutral-100 flex items-center justify-center text-[11px] font-medium text-neutral-600 rounded-sm">
          {contract.influencer_info.name.charAt(0)}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest text-neutral-400 mb-0.5">Counterparty</span>
          <span className="text-[13px] font-medium text-neutral-800">{contract.influencer_info.name}</span>
        </div>
      </div>

      {isNegotiating && (
        <div className="mt-6 pt-6 border-t border-amber-100/50 flex items-center gap-2">
          <AlertCircle strokeWidth={1.5} className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[12px] font-medium text-amber-600 tracking-wide">
            Review Requested
          </p>
        </div>
      )}
    </div>
  );
};
