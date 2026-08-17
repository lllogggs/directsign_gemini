import { createHash } from "node:crypto";
import type { Contract } from "../src/domain/contracts.js";

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableJsonValue(nested)]),
    );
  }
  return value ?? null;
};

/** The exact customer-visible terms that a signature attests to. */
export const createContractDocumentSnapshot = (
  contract: Contract,
  signatureConsentVersion: string,
) => ({
  schema_version: 1,
  contract_id: contract.id,
  created_at: contract.created_at,
  title: contract.title,
  type: contract.type,
  advertiser_id: contract.advertiser_id,
  brand_profile_id: contract.brand_profile_id ?? null,
  advertiser_info: contract.advertiser_info ?? null,
  influencer_info: contract.influencer_info,
  campaign_name: contract.campaign_name ?? null,
  campaign: contract.campaign ?? null,
  clauses: contract.clauses.map((clause) => ({
    clause_id: clause.clause_id,
    category: clause.category,
    content: clause.content,
  })),
  signature_consent_version: signatureConsentVersion,
});

export const createContractDocumentHash = (
  contract: Contract,
  signatureConsentVersion: string,
) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        stableJsonValue(
          createContractDocumentSnapshot(contract, signatureConsentVersion),
        ),
      ),
    )
    .digest("hex");

export const hasSameContractDocument = (
  left: Contract,
  right: Contract,
  signatureConsentVersion: string,
) =>
  createContractDocumentHash(left, signatureConsentVersion) ===
  createContractDocumentHash(right, signatureConsentVersion);
