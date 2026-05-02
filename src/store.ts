import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { createEvidence, createShareToken, createWorkflow } from "./domain/contracts";
import type {
  AuditEvent,
  ClauseHistory,
  ClauseStatus,
  Contract,
  ContractStatus,
} from "./domain/contracts";

export type {
  AuditEvent,
  Clause,
  ClauseHistory,
  ClauseStatus,
  Contract,
  ContractActor,
  ContractCampaign,
  ContractEvidence,
  ContractPlatform,
  ContractRiskLevel,
  ContractStatus,
  ContractType,
  PdfStatus,
} from "./domain/contracts";

const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "서버 동기화에 실패했습니다.";

const parseDate = (value?: string) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const isInternalQaContract = (contract: Contract) =>
  contract.influencer_info.contact === "qa.creator@example.com" ||
  contract.title === "QA 인플루언서 리뷰 화면 확인 계약";

const isDemoSeedContract = (contract: Contract) =>
  contract.id.startsWith("demo-contract-");

interface ContractsResponse {
  contracts?: Contract[];
  source?: "supabase" | "file";
  allow_local_merge?: boolean;
}

type HydrateOptions = {
  force?: boolean;
};

const mergeContracts = (
  local: Contract[],
  remote: Contract[],
  options: { allowLocalMerge: boolean },
) => {
  const byId = new Map<string, Contract>();

  remote.filter((contract) => !isInternalQaContract(contract)).forEach((contract) => {
    byId.set(contract.id, normalizeContract(contract));
  });

  if (!options.allowLocalMerge) {
    return Array.from(byId.values()).sort(
      (a, b) => parseDate(b.updated_at) - parseDate(a.updated_at),
    );
  }

  local.filter((contract) => {
    if (isInternalQaContract(contract)) return false;
    if (isDemoSeedContract(contract)) return false;
    return true;
  }).forEach((contract) => {
    const existing = byId.get(contract.id);

    if (
      !existing ||
      parseDate(contract.updated_at) >= parseDate(existing.updated_at)
    ) {
      byId.set(contract.id, normalizeContract(contract));
    }
  });

  return Array.from(byId.values()).sort(
    (a, b) => parseDate(b.updated_at) - parseDate(a.updated_at),
  );
};

type PersistOptions = {
  actor?: "advertiser" | "influencer";
  shareToken?: string;
};

const normalizeEvidence = (
  evidence: Contract["evidence"],
  current?: Contract["evidence"],
): Contract["evidence"] => {
  if (!evidence) return evidence;

  if (evidence.share_token_status !== "active") {
    return {
      ...evidence,
      share_token: undefined,
    };
  }

  return {
    ...evidence,
    share_token: evidence.share_token ?? current?.share_token ?? createShareToken(),
  };
};

const normalizeContract = (contract: Contract): Contract => ({
  ...contract,
  evidence: normalizeEvidence(contract.evidence),
});

const persistContractToServer = async (
  contract: Contract,
  set: (partial: Partial<AppState>) => void,
  options: PersistOptions = {},
) => {
  set({ isSyncing: true, syncError: undefined });

  try {
    const response = await fetch(`${API_BASE}/api/contracts/${contract.id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-DirectSign-Actor": options.actor ?? "advertiser",
        ...(options.shareToken
          ? { "X-DirectSign-Share-Token": options.shareToken }
          : {}),
      },
      body: JSON.stringify({ contract }),
    });

    if (!response.ok) {
      throw new Error(`저장 API 오류 (${response.status})`);
    }

    set({ isSyncing: false, syncError: undefined });
  } catch (error) {
    set({ isSyncing: false, syncError: getErrorMessage(error) });
  }
};

interface AppState {
  contracts: Contract[];
  isHydrated: boolean;
  isSyncing: boolean;
  syncError?: string;
  hydrateContracts: (options?: HydrateOptions) => Promise<void>;
  resetHydration: () => void;
  addContract: (
    contract: Omit<Contract, "id" | "created_at" | "updated_at">,
  ) => Contract;
  updateContract: (
    id: string,
    updates: Partial<Contract>,
    options?: PersistOptions,
  ) => void;
  updateClauseStatus: (
    contractId: string,
    clauseId: string,
    status: ClauseStatus,
    historyEntry?: Omit<ClauseHistory, "id">,
    options?: PersistOptions,
  ) => void;
  replaceContract: (contract: Contract) => void;
  getContract: (id: string) => Contract | undefined;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      contracts: [],
      isHydrated: false,
      isSyncing: false,
      syncError: undefined,

      hydrateContracts: async (options = {}) => {
        if (get().isHydrated && !options.force) return;
        set({ isSyncing: true, syncError: undefined });

        try {
          const response = await fetch(`${API_BASE}/api/contracts`, {
            headers: { Accept: "application/json" },
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error(`계약 목록 API 오류 (${response.status})`);
          }

          const data = (await response.json()) as ContractsResponse;
          const remoteContracts = Array.isArray(data.contracts)
            ? data.contracts
            : [];
          const mergedContracts = mergeContracts(get().contracts, remoteContracts, {
            allowLocalMerge: data.allow_local_merge === true,
          });

          set({
            contracts: mergedContracts,
            isHydrated: true,
            isSyncing: false,
            syncError: undefined,
          });
        } catch (error) {
          set({
            contracts: [],
            isHydrated: true,
            isSyncing: false,
            syncError: getErrorMessage(error),
          });
        }
      },

      resetHydration: () => {
        set({
          contracts: [],
          isHydrated: true,
          isSyncing: false,
          syncError: undefined,
        });
      },

      addContract: (contractData) => {
        const now = new Date().toISOString();
        const evidence =
          contractData.evidence ??
          createEvidence({
            share_token_status:
              contractData.status === "DRAFT" ? "not_issued" : "active",
            share_token_expires_at:
              contractData.status === "DRAFT" ? undefined : addDays(7),
            audit_ready: contractData.status !== "DRAFT",
            pdf_status:
              contractData.status === "DRAFT" ? "not_ready" : "draft_ready",
          });

        const newContract: Contract = {
          ...contractData,
          id: uuidv4(),
          workflow: contractData.workflow ?? createWorkflow(contractData.status),
          evidence: normalizeEvidence(evidence),
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
        void persistContractToServer(newContract, set);
        return newContract;
      },

      updateContract: (id, updates, options) => {
        let updatedContract: Contract | undefined;

        set((state) => ({
          contracts: state.contracts.map((contract) => {
            if (contract.id !== id) return contract;
            updatedContract = {
              ...contract,
              ...updates,
              evidence: updates.evidence
                ? normalizeEvidence(updates.evidence, contract.evidence)
                : contract.evidence,
              updated_at: new Date().toISOString(),
            };
            return updatedContract;
          }),
        }));

        if (updatedContract) {
          void persistContractToServer(updatedContract, set, options);
        }
      },

      updateClauseStatus: (contractId, clauseId, status, historyEntry, options) => {
        let updatedContract: Contract | undefined;

        set((state) => {
          const contract = state.contracts.find((item) => item.id === contractId);
          if (!contract) return state;

          const updatedClauses = contract.clauses.map((clause) => {
            if (clause.clause_id !== clauseId) return clause;

            return {
              ...clause,
              status,
              history: historyEntry
                ? [...clause.history, { ...historyEntry, id: uuidv4() }]
                : clause.history,
            };
          });

          let nextStatus: ContractStatus = contract.status;
          if (
            status === "MODIFICATION_REQUESTED" ||
            status === "DELETION_REQUESTED"
          ) {
            nextStatus = "NEGOTIATING";
          } else if (
            contract.status === "NEGOTIATING" &&
            updatedClauses.every((clause) => clause.status === "APPROVED")
          ) {
            nextStatus = "APPROVED";
          }

          const latestComment = historyEntry?.comment;
          const auditEvent: AuditEvent | undefined = historyEntry
            ? {
                id: uuidv4(),
                actor: historyEntry.role,
                action: historyEntry.action,
                description: historyEntry.comment,
                created_at: historyEntry.timestamp,
                related_clause_id: clauseId,
              }
            : undefined;

          updatedContract = {
            ...contract,
            clauses: updatedClauses,
            status: nextStatus,
            workflow: createWorkflow(nextStatus, {
              last_message: latestComment ?? contract.workflow?.last_message,
            }),
            audit_events: auditEvent
              ? [...(contract.audit_events ?? []), auditEvent]
              : contract.audit_events,
            updated_at: new Date().toISOString(),
          };

          return {
            contracts: state.contracts.map((item) =>
              item.id === contractId ? updatedContract! : item,
            ),
          };
        });

        if (updatedContract) {
          void persistContractToServer(updatedContract, set, options);
        }
      },

      replaceContract: (contract) => {
        const normalizedContract = normalizeContract(contract);
        set((state) => ({
          contracts: state.contracts.some((item) => item.id === normalizedContract.id)
            ? state.contracts.map((item) =>
                item.id === normalizedContract.id ? normalizedContract : item,
              )
            : [...state.contracts, normalizedContract],
          isSyncing: false,
          syncError: undefined,
        }));
      },

      getContract: (id) => get().contracts.find((contract) => contract.id === id),
    }),
    {
      name: "directsign-contract-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ contracts: state.contracts }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = false;
          state.isSyncing = false;
          state.syncError = undefined;
        }
      },
    },
  ),
);

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};
