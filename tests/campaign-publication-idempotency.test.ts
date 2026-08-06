import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPAIGN_PUBLICATION_ATTEMPT_TTL_MS,
  clearCampaignPublicationAttempt,
  fingerprintCampaignPublicationPayload,
  resolveCampaignPublicationAttempt,
  resolveCampaignPublicationIntentId,
} from "../src/domain/campaignPublicationIdempotency.js";

const createMemoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

describe("campaign publication idempotency", () => {
  it("reuses one key for an exact retry after a page reload", () => {
    const storage = createMemoryStorage();
    let sequence = 0;
    const createIdempotencyKey = () => `attempt-${++sequence}`;
    const first = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-a",
      storage,
      now: 1_000,
      createIdempotencyKey,
    });
    const afterReload = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-a",
      storage,
      now: 2_000,
      createIdempotencyKey,
    });

    assert.equal(first.idempotencyKey, "attempt-1");
    assert.equal(afterReload.idempotencyKey, first.idempotencyKey);
    assert.equal(sequence, 1);
  });

  it("rotates the key for a changed payload or an expired attempt", () => {
    const storage = createMemoryStorage();
    let sequence = 0;
    const createIdempotencyKey = () => `attempt-${++sequence}`;
    const first = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-a",
      storage,
      now: 1_000,
      createIdempotencyKey,
    });
    const changed = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-b",
      currentAttempt: first,
      storage,
      now: 2_000,
      createIdempotencyKey,
    });
    const expired = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-b",
      currentAttempt: changed,
      storage,
      now: changed.createdAt + CAMPAIGN_PUBLICATION_ATTEMPT_TTL_MS,
      createIdempotencyKey,
    });

    assert.equal(changed.idempotencyKey, "attempt-2");
    assert.equal(expired.idempotencyKey, "attempt-3");
  });

  it("rotates the key after a confirmed successful publication", () => {
    const storage = createMemoryStorage();
    let sequence = 0;
    const createIdempotencyKey = () => `attempt-${++sequence}`;
    const completed = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-a",
      storage,
      now: 1_000,
      createIdempotencyKey,
    });

    clearCampaignPublicationAttempt(completed, storage);

    const intentionalNewSubmission = resolveCampaignPublicationAttempt({
      intentId: "intent-b",
      fingerprint: "payload-a",
      storage,
      now: 2_000,
      createIdempotencyKey,
    });
    assert.notEqual(
      intentionalNewSubmission.idempotencyKey,
      completed.idempotencyKey,
    );
  });

  it("keeps in-page retries stable when browser storage is unavailable", () => {
    let sequence = 0;
    const createIdempotencyKey = () => `attempt-${++sequence}`;
    const first = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-a",
      storage: undefined,
      now: 1_000,
      createIdempotencyKey,
    });
    const retry = resolveCampaignPublicationAttempt({
      intentId: "intent-a",
      fingerprint: "payload-a",
      currentAttempt: first,
      storage: undefined,
      now: 2_000,
      createIdempotencyKey,
    });

    assert.equal(retry.idempotencyKey, first.idempotencyKey);
    assert.equal(sequence, 1);
  });

  it("fingerprints the serialized request body deterministically", async () => {
    const first = await fingerprintCampaignPublicationPayload(
      '{"title":"캠페인 A"}',
    );
    const retry = await fingerprintCampaignPublicationPayload(
      '{"title":"캠페인 A"}',
    );
    const changed = await fingerprintCampaignPublicationPayload(
      '{"title":"캠페인 B"}',
    );

    assert.equal(retry, first);
    assert.notEqual(changed, first);
  });

  it("keeps one intent across reload and creates another for a new history entry", () => {
    const firstHistory = {
      state: { key: "route-a" } as Record<string, unknown>,
      replaceState(nextState: unknown) {
        this.state = nextState as Record<string, unknown>;
      },
    };
    let sequence = 0;
    const createIntentId = () => `intent-${++sequence}`;
    const first = resolveCampaignPublicationIntentId({
      history: firstHistory,
      createIntentId,
    });
    const afterReload = resolveCampaignPublicationIntentId({
      history: firstHistory,
      createIntentId,
    });
    const intentionalNewEntry = resolveCampaignPublicationIntentId({
      history: {
        state: { key: "route-b" },
        replaceState() {},
      },
      createIntentId,
    });

    assert.equal(afterReload, first);
    assert.notEqual(intentionalNewEntry, first);
  });
});
