import assert from "node:assert/strict";
import test from "node:test";
import type { Contract } from "../src/domain/contracts.js";
import {
  createContractDocumentHash,
  hasSameContractDocument,
} from "../server/contract-document-security.js";

const buildContract = (): Contract => ({
  id: "contract-1",
  advertiser_id: "advertiser-1",
  brand_profile_id: "brand-1",
  title: "콘텐츠 계약",
  type: "협찬",
  status: "APPROVED",
  advertiser_info: { name: "연락미", manager: "담당자" },
  influencer_info: {
    name: "크리에이터",
    channel_url: "https://example.com/channel",
    contact: "creator@example.com",
  },
  campaign: {
    budget: "100000",
    platforms: ["INSTAGRAM"],
    deliverables: ["릴스 1건"],
  },
  clauses: [
    {
      clause_id: "clause-1",
      category: "콘텐츠",
      content: "릴스 한 건을 게시합니다.",
      status: "APPROVED",
      history: [],
    },
  ],
  evidence: {
    share_token_status: "active",
    share_token: "secret-a",
    audit_ready: true,
    pdf_status: "draft_ready",
  },
  audit_events: [],
  created_at: "2026-08-11T00:00:00.000Z",
  updated_at: "2026-08-11T00:01:00.000Z",
});

test("document hash changes for every customer-visible contract term", () => {
  const contract = buildContract();
  const original = createContractDocumentHash(contract, "2026-05-01");
  const mutations: Contract[] = [
    { ...contract, title: "바뀐 계약" },
    {
      ...contract,
      influencer_info: { ...contract.influencer_info, name: "다른 사람" },
    },
    {
      ...contract,
      campaign: { ...contract.campaign, budget: "900000" },
    },
    {
      ...contract,
      clauses: [{ ...contract.clauses[0], content: "다른 콘텐츠" }],
    },
  ];

  for (const mutation of mutations) {
    assert.notEqual(
      createContractDocumentHash(mutation, "2026-05-01"),
      original,
    );
  }
});

test("document hash ignores transport, workflow, and audit metadata", () => {
  const contract = buildContract();
  const metadataOnly: Contract = {
    ...contract,
    updated_at: "2026-08-11T00:05:00.000Z",
    workflow: {
      next_actor: "influencer",
      next_action: "서명",
      risk_level: "low",
    },
    evidence: {
      ...contract.evidence!,
      share_token: "secret-b",
    },
    audit_events: [
      {
        id: "event-1",
        actor: "advertiser",
        action: "share_rotated",
        description: "링크 회전",
        created_at: "2026-08-11T00:05:00.000Z",
      },
    ],
    settlement: {
      status: "confirmed_paid",
      advertiser_confirmed_paid: true,
      advertiser_confirmed_at: "2026-08-11T00:04:00.000Z",
      advertiser_confirmed_by_profile_id: "advertiser-1",
      advertiser_confirmed_by_name: "연락미 담당자",
      inquiries: [
        {
          id: "inquiry-1",
          status: "resolved",
          message: "당사자 확인 기록",
          requested_at: "2026-08-11T00:03:00.000Z",
        },
      ],
    },
  };

  assert.equal(
    hasSameContractDocument(contract, metadataOnly, "2026-05-01"),
    true,
  );
});

test("document hash binds the signature consent version", () => {
  const contract = buildContract();
  assert.notEqual(
    createContractDocumentHash(contract, "2026-05-01"),
    createContractDocumentHash(contract, "2027-01-01"),
  );
});
