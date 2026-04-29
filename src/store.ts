import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export type ContractType = "협찬" | "PPL" | "공동구매";
export type ContractStatus =
  | "DRAFT"
  | "REVIEWING"
  | "NEGOTIATING"
  | "APPROVED"
  | "SIGNED";
export type ClauseStatus =
  | "APPROVED"
  | "MODIFICATION_REQUESTED"
  | "DELETION_REQUESTED";
export type ContractActor = "advertiser" | "influencer" | "system";
export type ContractRiskLevel = "low" | "medium" | "high";
export type PdfStatus = "not_ready" | "draft_ready" | "signed_ready";
export type ContractPlatform =
  | "NAVER_BLOG"
  | "YOUTUBE"
  | "INSTAGRAM"
  | "TIKTOK"
  | "OTHER";

export interface ClauseHistory {
  id: string;
  role: "advertiser" | "influencer";
  action: "수정 요청" | "삭제 요청" | "수락" | "거절" | "대안 제시";
  comment: string;
  timestamp: string;
}

export interface Clause {
  clause_id: string;
  category: string;
  content: string;
  status: ClauseStatus;
  history: ClauseHistory[];
}

export interface ContractWorkflow {
  next_actor: ContractActor;
  next_action: string;
  due_at?: string;
  last_message?: string;
  risk_level: ContractRiskLevel;
}

export interface ContractCampaign {
  budget?: string;
  start_date?: string;
  end_date?: string;
  deadline?: string;
  upload_due_at?: string;
  review_due_at?: string;
  revision_limit?: string;
  disclosure_text?: string;
  tracking_link?: string;
  period?: string;
  platforms?: ContractPlatform[];
  deliverables?: string[];
}

export interface ContractEvidence {
  share_token_status: "not_issued" | "active" | "expired" | "revoked";
  share_token_expires_at?: string;
  audit_ready: boolean;
  pdf_status: PdfStatus;
}

export interface AuditEvent {
  id: string;
  actor: ContractActor;
  action: string;
  description: string;
  created_at: string;
  related_clause_id?: string;
}

export interface Contract {
  id: string;
  advertiser_id: string;
  advertiser_info?: {
    name: string;
    manager?: string;
  };
  type: ContractType;
  status: ContractStatus;
  title: string;
  influencer_info: {
    name: string;
    channel_url: string;
    contact: string;
  };
  campaign?: ContractCampaign;
  workflow?: ContractWorkflow;
  evidence?: ContractEvidence;
  audit_events?: AuditEvent[];
  clauses: Clause[];
  signature_data?: {
    adv_sign: string; // base64
    inf_sign: string; // base64
    signed_at: string;
    ip: string;
  };
  pdf_url?: string;
  created_at: string;
  updated_at: string;
}

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const createWorkflow = (
  status: ContractStatus,
  overrides: Partial<ContractWorkflow> = {},
): ContractWorkflow => {
  const defaults: Record<ContractStatus, ContractWorkflow> = {
    DRAFT: {
      next_actor: "advertiser",
      next_action: "계약 초안을 완성하고 공유 링크를 발송하세요.",
      due_at: addDays(3),
      risk_level: "low",
    },
    REVIEWING: {
      next_actor: "influencer",
      next_action: "인플루언서 검토 응답을 기다리는 중입니다.",
      due_at: addDays(2),
      risk_level: "medium",
    },
    NEGOTIATING: {
      next_actor: "advertiser",
      next_action: "수정 요청을 검토하고 답변하세요.",
      due_at: addDays(1),
      risk_level: "high",
    },
    APPROVED: {
      next_actor: "advertiser",
      next_action: "최종본을 잠그고 서명을 요청하세요.",
      due_at: addDays(1),
      risk_level: "medium",
    },
    SIGNED: {
      next_actor: "system",
      next_action: "서명 완료본과 감사 기록을 보관하세요.",
      risk_level: "low",
    },
  };

  return { ...defaults[status], ...overrides };
};

const createEvidence = (
  overrides: Partial<ContractEvidence> = {},
): ContractEvidence => ({
  share_token_status: "not_issued",
  audit_ready: false,
  pdf_status: "not_ready",
  ...overrides,
});

interface AppState {
  contracts: Contract[];
  addContract: (
    contract: Omit<Contract, "id" | "created_at" | "updated_at">,
  ) => Contract;
  updateContract: (id: string, updates: Partial<Contract>) => void;
  updateClauseStatus: (
    contractId: string,
    clauseId: string,
    status: ClauseStatus,
    historyEntry?: Omit<ClauseHistory, "id">,
  ) => void;
  getContract: (id: string) => Contract | undefined;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  contracts: [
    {
      id: "demo-contract-1",
      advertiser_id: "adv-1",
      type: "협찬",
      status: "REVIEWING",
      title: "OOTD 패션 브랜드 여름 신상 협찬 건",
      influencer_info: {
        name: "패션크리에이터A",
        channel_url: "instagram.com/fashion_a",
        contact: "fashion_a@example.com",
      },
      campaign: {
        budget: "1,500,000원",
        deadline: addDays(5),
        period: "2026.04.29 - 2026.05.31",
        platforms: ["INSTAGRAM"],
        deliverables: ["Instagram feed", "Reels"],
      },
      workflow: createWorkflow("REVIEWING", {
        last_message: "게시물 유지 기간을 3개월로 조정 요청",
      }),
      evidence: createEvidence({
        share_token_status: "active",
        share_token_expires_at: addDays(7),
        audit_ready: true,
        pdf_status: "draft_ready",
      }),
      audit_events: [
        {
          id: uuidv4(),
          actor: "system",
          action: "share_link_issued",
          description: "인플루언서 검토용 링크가 발급되었습니다.",
          created_at: new Date().toISOString(),
        },
      ],
      clauses: [
        {
          clause_id: "c_001",
          category: "서비스 제공 내용",
          content: "인스타그램 피드 1회 및 릴스 1회 업로드",
          status: "APPROVED",
          history: [],
        },
        {
          clause_id: "c_002",
          category: "유지 기간",
          content: "업로드 후 6개월간 게시물 유지",
          status: "MODIFICATION_REQUESTED",
          history: [
            {
              id: uuidv4(),
              role: "influencer",
              action: "수정 요청",
              comment:
                "통상적으로 3개월 유지 조건으로 진행합니다. 3개월로 수정 부탁드립니다.",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "demo-contract-2",
      advertiser_id: "adv-1",
      type: "PPL",
      status: "NEGOTIATING",
      title: "뷰티 숏폼 PPL 2차 수정 검토",
      influencer_info: {
        name: "뷰티메이커B",
        channel_url: "youtube.com/@beauty_b",
        contact: "beauty_b@example.com",
      },
      campaign: {
        budget: "3,200,000원",
        deadline: addDays(2),
        period: "2026.05.01 - 2026.05.15",
        platforms: ["YOUTUBE", "INSTAGRAM", "TIKTOK"],
        deliverables: ["YouTube Shorts", "Instagram story", "TikTok short"],
      },
      workflow: createWorkflow("NEGOTIATING", {
        last_message: "경쟁사 배제 기간과 수정 가능 횟수 조정 요청",
      }),
      evidence: createEvidence({
        share_token_status: "active",
        share_token_expires_at: addDays(7),
        audit_ready: true,
        pdf_status: "draft_ready",
      }),
      audit_events: [
        {
          id: uuidv4(),
          actor: "influencer",
          action: "clause_change_requested",
          description: "경쟁사 배제 기간에 대한 수정 요청이 접수되었습니다.",
          created_at: new Date().toISOString(),
          related_clause_id: "c_102",
        },
      ],
      clauses: [
        {
          clause_id: "c_101",
          category: "콘텐츠 업로드",
          content: "유튜브 숏츠 1회, 인스타그램 스토리 2회 업로드",
          status: "APPROVED",
          history: [],
        },
        {
          clause_id: "c_102",
          category: "경쟁사 배제",
          content: "업로드 후 6개월간 동종 카테고리 광고 진행 불가",
          status: "MODIFICATION_REQUESTED",
          history: [
            {
              id: uuidv4(),
              role: "influencer",
              action: "수정 요청",
              comment: "6개월은 너무 길어 2개월로 조정하고 싶습니다.",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "demo-contract-3",
      advertiser_id: "adv-1",
      type: "공동구매",
      status: "APPROVED",
      title: "헬스케어 공동구매 최종본 서명 대기",
      influencer_info: {
        name: "헬스라이프C",
        channel_url: "instagram.com/health_c",
        contact: "health_c@example.com",
      },
      campaign: {
        budget: "판매 수익 18%",
        deadline: addDays(1),
        period: "2026.05.03 - 2026.05.30",
        platforms: ["INSTAGRAM", "NAVER_BLOG"],
        deliverables: ["Instagram reels", "Naver Blog", "Live commerce"],
      },
      workflow: createWorkflow("APPROVED", {
        last_message: "모든 조항 승인 완료",
      }),
      evidence: createEvidence({
        share_token_status: "active",
        share_token_expires_at: addDays(7),
        audit_ready: true,
        pdf_status: "draft_ready",
      }),
      audit_events: [
        {
          id: uuidv4(),
          actor: "advertiser",
          action: "all_clauses_approved",
          description: "모든 조항이 승인되어 서명 요청이 가능합니다.",
          created_at: new Date().toISOString(),
        },
      ],
      clauses: [
        {
          clause_id: "c_201",
          category: "수익 분배",
          content: "공동구매 순매출의 18%를 인플루언서에게 지급",
          status: "APPROVED",
          history: [],
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],

  addContract: (contractData) => {
    const now = new Date().toISOString();
    const newContract: Contract = {
      ...contractData,
      id: uuidv4(),
      workflow: contractData.workflow ?? createWorkflow(contractData.status),
      evidence:
        contractData.evidence ??
        createEvidence({
          share_token_status:
            contractData.status === "DRAFT" ? "not_issued" : "active",
          share_token_expires_at:
            contractData.status === "DRAFT" ? undefined : addDays(7),
          audit_ready: contractData.status !== "DRAFT",
          pdf_status: contractData.status === "DRAFT" ? "not_ready" : "draft_ready",
        }),
      audit_events: contractData.audit_events ?? [
        {
          id: uuidv4(),
          actor: "advertiser",
          action: "contract_created",
          description:
            contractData.status === "DRAFT"
              ? "계약 초안이 저장되었습니다."
              : "계약 초안이 생성되고 공유 링크가 발급되었습니다.",
          created_at: now,
        },
      ],
      created_at: now,
      updated_at: now,
    };
    set((state) => ({ contracts: [...state.contracts, newContract] }));
    return newContract;
  },

  updateContract: (id, updates) => {
    set((state) => ({
      contracts: state.contracts.map((c) =>
        c.id === id
          ? { ...c, ...updates, updated_at: new Date().toISOString() }
          : c,
      ),
    }));
  },

  updateClauseStatus: (contractId, clauseId, status, historyEntry) => {
    set((state) => {
      const contract = state.contracts.find((c) => c.id === contractId);
      if (!contract) return state;

      const updatedClauses = contract.clauses.map((clause) => {
        if (clause.clause_id === clauseId) {
          return {
            ...clause,
            status,
            history: historyEntry
              ? [...clause.history, { ...historyEntry, id: uuidv4() }]
              : clause.history,
          };
        }
        return clause;
      });

      // Auto-update contract status based on clauses
      let newContractStatus = contract.status;
      if (
        status === "MODIFICATION_REQUESTED" ||
        status === "DELETION_REQUESTED"
      ) {
        newContractStatus = "NEGOTIATING";
      } else if (contract.status === "NEGOTIATING") {
        const allApproved = updatedClauses.every(
          (c) => c.status === "APPROVED",
        );
        if (allApproved) {
          newContractStatus = "APPROVED";
        }
      }
      const updatedAt = new Date().toISOString();
      const latestComment = historyEntry?.comment;
      const newWorkflow = createWorkflow(newContractStatus, {
        last_message: latestComment ?? contract.workflow?.last_message,
      });
      const newAuditEvent: AuditEvent | undefined = historyEntry
        ? {
            id: uuidv4(),
            actor: historyEntry.role,
            action: historyEntry.action,
            description: historyEntry.comment,
            created_at: historyEntry.timestamp,
            related_clause_id: clauseId,
          }
        : undefined;

      return {
        contracts: state.contracts.map((c) =>
          c.id === contractId
            ? {
                ...c,
                clauses: updatedClauses,
                status: newContractStatus,
                workflow: newWorkflow,
                audit_events: newAuditEvent
                  ? [...(c.audit_events ?? []), newAuditEvent]
                  : c.audit_events,
                updated_at: updatedAt,
              }
            : c,
        ),
      };
    });
  },

  getContract: (id) => get().contracts.find((c) => c.id === id),
    }),
    {
      name: "directsign-contract-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ contracts: state.contracts }),
    },
  ),
);
