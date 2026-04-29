import { create } from "zustand";
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

export interface Contract {
  id: string;
  advertiser_id: string;
  type: ContractType;
  status: ContractStatus;
  title: string;
  influencer_info: {
    name: string;
    channel_url: string;
    contact: string;
  };
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

export const useAppStore = create<AppState>((set, get) => ({
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
  ],

  addContract: (contractData) => {
    const newContract: Contract = {
      ...contractData,
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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

      return {
        contracts: state.contracts.map((c) =>
          c.id === contractId
            ? {
                ...c,
                clauses: updatedClauses,
                status: newContractStatus,
                updated_at: new Date().toISOString(),
              }
            : c,
        ),
      };
    });
  },

  getContract: (id) => get().contracts.find((c) => c.id === id),
}));
