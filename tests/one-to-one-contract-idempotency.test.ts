import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  hasCompleteOneToOneContractForDraftContext,
  hasSameOneToOneContractStorageIdentity,
  isConcurrentOneToOneContractIdentityConflict,
  isEquivalentOneToOneContractWriteRetry,
  mergeOneToOneContractWriteSet,
} from "../lib/one-to-one-contract-idempotency.js";
import type { Contract } from "../src/domain/contracts.js";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const buildContract = (): Contract => ({
  id: "11111111-1111-4111-8111-111111111111",
  data_origin: "qa",
  advertiser_id: "22222222-2222-4222-8222-222222222222",
  brand_profile_id: "33333333-3333-4333-8333-333333333333",
  campaign_name: "1:1 저장 QA",
  advertiser_info: { name: "브랜드", manager: "담당자" },
  title: "1:1 저장 QA",
  type: "협찬",
  status: "DRAFT",
  influencer_info: {
    name: "인플루언서",
    channel_url: "https://www.instagram.com/example/",
    contact: "qa.influencer@example.test",
  },
  campaign: {
    source: "direct",
    fixed_terms: false,
    source_application_id: "44444444-4444-4444-8444-444444444444",
    budget: "100,000원",
    platforms: ["INSTAGRAM"],
  },
  workflow: {
    next_actor: "advertiser",
    next_action: "초안 확인",
    risk_level: "low",
  },
  evidence: {
    share_token_status: "not_issued",
    audit_ready: false,
    pdf_status: "not_ready",
  },
  audit_events: [
    {
      id: "client-event",
      actor: "advertiser",
      action: "draft_saved",
      description: "초안을 저장했습니다.",
      created_at: "2026-08-07T00:00:00.000Z",
    },
  ],
  clauses: [
    {
      clause_id: "scope",
      category: "업무 범위",
      content: "인스타그램 콘텐츠 1건",
      status: "PENDING_REVIEW",
      history: [],
    },
  ],
  created_at: "2026-08-07T00:00:00.000Z",
  updated_at: "2026-08-07T00:00:00.000Z",
});

describe("one-to-one contract write idempotency", () => {
  it("recovers only the exact V2 legacy identity unique conflict", () => {
    assert.equal(
      isConcurrentOneToOneContractIdentityConflict(
        409,
        'duplicate key value violates unique constraint "contracts_legacy_contract_id_key"',
      ),
      true,
    );
    assert.equal(
      isConcurrentOneToOneContractIdentityConflict(
        409,
        'duplicate key value violates unique constraint "contracts_pkey"',
      ),
      false,
    );
    assert.equal(
      isConcurrentOneToOneContractIdentityConflict(
        500,
        'duplicate key value violates unique constraint "contracts_legacy_contract_id_key"',
      ),
      false,
    );
  });

  it("requires the full one-to-one storage identity and an active row", () => {
    const identity = {
      id: "contract-id",
      legacy_contract_id: "contract-id",
      owner_organization_id: "organization-id",
      data_origin: "qa",
      workflow_source: "one_to_one",
      marketplace_campaign_id: null,
      source_application_id: "proposal-id",
      created_by_profile_id: "advertiser-id",
      deleted_at: null,
    };
    assert.equal(hasSameOneToOneContractStorageIdentity(identity, identity), true);
    assert.equal(
      hasSameOneToOneContractStorageIdentity(identity, {
        ...identity,
        source_application_id: "another-proposal",
      }),
      false,
    );
    assert.equal(
      hasSameOneToOneContractStorageIdentity(
        { ...identity, deleted_at: "2026-08-07T00:00:00.000Z" },
        identity,
      ),
      false,
    );
  });

  it("accepts a stale retry only when customer-authored contract facts match", () => {
    const incoming = buildContract();
    const existing: Contract = {
      ...incoming,
      advertiser_trust: { risk_level: "low", risk_score: 0 },
      evidence: {
        ...incoming.evidence!,
        share_token: "server-only-token",
        share_token_expires_at: "2026-08-14T00:00:00.000Z",
      },
      audit_events: [
        {
          id: "server-event",
          actor: "advertiser",
          action: "draft_saved",
          description: "광고주가 계약 초안을 저장했습니다.",
          created_at: "2026-08-07T00:00:01.000Z",
        },
      ],
      updated_at: "2026-08-07T00:00:01.000Z",
    };

    assert.equal(
      isEquivalentOneToOneContractWriteRetry(existing, incoming),
      true,
    );
    assert.equal(
      isEquivalentOneToOneContractWriteRetry(existing, {
        ...incoming,
        title: "변경된 계약",
      }),
      false,
    );
    assert.equal(
      isEquivalentOneToOneContractWriteRetry(existing, {
        ...incoming,
        campaign: { ...incoming.campaign, budget: "200,000원" },
      }),
      false,
    );
    assert.equal(
      isEquivalentOneToOneContractWriteRetry(existing, {
        ...incoming,
        evidence: { ...incoming.evidence!, share_token_status: "active" },
      }),
      false,
    );
  });

  it("replaces an observed V2-only intermediate row with one complete write", () => {
    const incoming = buildContract();
    const incompleteV2Projection: Contract = {
      ...incoming,
      title: "V2 hydration placeholder",
      clauses: [
        {
          clause_id: `${incoming.id}:clause:summary`,
          category: "계약 요약",
          content: "계약 세부 조항을 확인하세요.",
          status: "PENDING_REVIEW",
          history: [],
        },
      ],
    };

    const writeSet = mergeOneToOneContractWriteSet(
      [incompleteV2Projection],
      -1,
      incoming,
      true,
    );

    assert.equal(writeSet.length, 1);
    assert.deepEqual(writeSet[0], incoming);
  });

  it("keeps an accepted proposal editable while only the V2 base row exists", () => {
    const incompleteV2Projection = buildContract();

    assert.equal(
      hasCompleteOneToOneContractForDraftContext(
        incompleteV2Projection,
        true,
      ),
      false,
    );
    assert.equal(
      hasCompleteOneToOneContractForDraftContext(
        incompleteV2Projection,
        false,
      ),
      true,
    );
    assert.equal(
      hasCompleteOneToOneContractForDraftContext(undefined, false),
      false,
    );
  });

  it("keeps the UI and server defenses on the actual write path", () => {
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const store = read("src/store.ts");
    const server = read("server/index.ts");

    assert.match(
      builder,
      /if \(saveContractInFlightRef\.current \|\| isSyncing\) return;/,
    );
    assert.match(builder, /saveContractInFlightRef\.current = true;/);
    assert.match(builder, /disabled=\{isSyncing\}/);
    assert.match(
      store,
      /if \(existingContract\) return existingContract;/,
    );
    assert.match(server, /upsertSupabaseV2ContractRow\(/);
    assert.match(server, /equivalentOneToOneRetry/);
    assert.match(server, /!isV2Only/);
    assert.match(server, /observedIncompleteOneToOneContract/);
    assert.match(server, /mergeOneToOneContractWriteSet\(/);
    assert.match(server, /hasCompleteOneToOneContractForDraftContext\(/);
  });
});
