import type { Contract } from "../src/domain/contracts.js";

export type OneToOneContractStorageIdentity = {
  id?: unknown;
  legacy_contract_id?: unknown;
  owner_organization_id?: unknown;
  data_origin?: unknown;
  workflow_source?: unknown;
  marketplace_campaign_id?: unknown;
  source_application_id?: unknown;
  created_by_profile_id?: unknown;
  deleted_at?: unknown;
};

const storageIdentityKeys = [
  "id",
  "legacy_contract_id",
  "owner_organization_id",
  "data_origin",
  "workflow_source",
  "marketplace_campaign_id",
  "source_application_id",
  "created_by_profile_id",
] as const;

const normalizeIdentityValue = (value: unknown) => value ?? null;

export const isConcurrentOneToOneContractIdentityConflict = (
  status: number,
  message: string,
) =>
  status === 409 &&
  /duplicate key value violates unique constraint ["']contracts_legacy_contract_id_key["']/i.test(
    message,
  );

export const hasSameOneToOneContractStorageIdentity = (
  existing: OneToOneContractStorageIdentity,
  incoming: OneToOneContractStorageIdentity,
) =>
  normalizeIdentityValue(existing.deleted_at) === null &&
  storageIdentityKeys.every(
    (key) =>
      normalizeIdentityValue(existing[key]) ===
      normalizeIdentityValue(incoming[key]),
  );

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, stableJsonValue(nestedValue)]),
    );
  }
  return value ?? null;
};

const comparableOneToOneContractWrite = (contract: Contract) => {
  const {
    advertiser_trust: _advertiserTrust,
    audit_events: _auditEvents,
    created_at: _createdAt,
    updated_at: _updatedAt,
    evidence,
    ...customerAuthoredContract
  } = contract;
  const comparableEvidence = evidence
    ? {
        ...evidence,
        share_token: undefined,
        share_token_expires_at: undefined,
      }
    : evidence;

  return stableJsonValue({
    ...customerAuthoredContract,
    evidence: comparableEvidence,
  });
};

export const isEquivalentOneToOneContractWriteRetry = (
  existing: Contract,
  incoming: Contract,
) =>
  JSON.stringify(comparableOneToOneContractWrite(existing)) ===
  JSON.stringify(comparableOneToOneContractWrite(incoming));

export const mergeOneToOneContractWriteSet = (
  currentContracts: Contract[],
  existingIndex: number,
  updatedContract: Contract,
  observedV2Only: boolean,
) => {
  if (observedV2Only) return [updatedContract];
  if (existingIndex < 0) return [...currentContracts, updatedContract];

  return currentContracts.map((contract, index) =>
    index === existingIndex ? updatedContract : contract,
  );
};

export const hasCompleteOneToOneContractForDraftContext = (
  existingContract: Contract | undefined,
  observedV2Only: boolean,
) => Boolean(existingContract && !observedV2Only);
