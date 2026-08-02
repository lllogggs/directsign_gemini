import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  extractInstagramDmChallengeEvents,
  isActionableInstagramDmManualReview,
  selectInstagramDmRestoreRecord,
  processInstagramDmChallengeEvent,
  verifyInstagramWebhookSignature,
  type InstagramDmCandidateRecord,
  type InstagramDmChallengeEvent,
  type InstagramDmFailureReason,
  type InstagramDmRestoreRecord,
} from "../server/instagram-dm-verification";
import { isOperationalTestEmail } from "../server/operational-test-email";
import {
  buildPlatformVerificationEmail,
  resetPlatformVerificationEmailDedupeForTests,
  sendPlatformVerificationEmail,
} from "../server/verification-email";
import { verificationRequestBelongsToInfluencerAccount } from "../server/verification-ownership";

const fixedNow = new Date("2026-08-02T03:00:00.000Z");
const event: InstagramDmChallengeEvent = {
  challengeCode: "DS-AB12-CD34",
  senderId: "1234567890",
  messageId: "mid.verified.1",
  receivedAt: fixedNow.toISOString(),
};

type MemoryRecord = InstagramDmCandidateRecord & {
  id: string;
  ownership_challenge_code_hash: string | null;
  ownership_challenge_consumed_at: string | null;
};

type SavedRecord = {
  id: string;
  status: "pending" | "approved";
  consumedAt: string;
};

type RestoreRecord = InstagramDmRestoreRecord & {
  platform: string;
  challengeState:
    | "awaiting_dm"
    | "retrying_provider"
    | "verified"
    | "expired"
    | "manual_review";
};

const makeRestoreRecord = (
  overrides: Partial<RestoreRecord> = {},
): RestoreRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  target_id: "influencer-owner-1",
  created_at: "2026-08-02T02:55:00.000Z",
  status: "pending",
  platform: "instagram",
  platform_handle: "creator.name",
  platform_url: "https://instagram.com/creator.name",
  ownership_verification_method: "instagram_dm_code",
  ownership_challenge_code_hash: "hash:active",
  ownership_challenge_code_ciphertext: "cipher:active",
  ownership_challenge_consumed_at: null,
  ownership_challenge_expires_at: "2026-08-02T03:10:00.000Z",
  challengeState: "awaiting_dm",
  ...overrides,
});

describe("Operational test email classification", () => {
  it("normalizes known QA accounts and recognizes explicit test markers", () => {
    assert.equal(isOperationalTestEmail("  Creator.Sora@YEOLLOCK.ME  "), true);
    assert.equal(isOperationalTestEmail("qa.audit@yeollock.me"), true);
    assert.equal(isOperationalTestEmail("creator-demo@yeollock.me"), true);
    assert.equal(isOperationalTestEmail("creator@example.com"), true);
    assert.equal(isOperationalTestEmail("creator@preview.test"), true);
  });

  it("does not classify an ordinary production address or malformed value as test data", () => {
    assert.equal(isOperationalTestEmail("creator@yeollock.me"), false);
    assert.equal(isOperationalTestEmail("not-an-email"), false);
    assert.equal(isOperationalTestEmail(undefined), false);
  });
});

describe("Influencer verification request ownership", () => {
  const trustedProfileId = "profile-owner-1";
  const trustedProfileEmail = "owner@yeollock.me";

  it("accepts ID-bound records only when every present ID matches", () => {
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        { target_type: "influencer_account", profile_id: trustedProfileId },
        trustedProfileId,
        trustedProfileEmail,
      ),
      true,
    );
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        { target_type: "influencer_account", target_id: trustedProfileId },
        trustedProfileId,
        trustedProfileEmail,
      ),
      true,
    );
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        {
          target_type: "influencer_account",
          profile_id: trustedProfileId,
          target_id: trustedProfileId,
        },
        trustedProfileId,
        trustedProfileEmail,
      ),
      true,
    );
  });

  it("rejects a mismatched bound ID even when the email matches", () => {
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        {
          target_type: "influencer_account",
          profile_id: trustedProfileId,
          target_id: "profile-someone-else",
          submitted_by_email: trustedProfileEmail,
        },
        trustedProfileId,
        trustedProfileEmail,
      ),
      false,
    );
  });

  it("uses normalized exact email fallback only when no ID is bound", () => {
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        {
          target_type: "influencer_account",
          submitted_by_email: "  OWNER@YEOLLOCK.ME  ",
        },
        trustedProfileId,
        " Owner@Yeollock.Me ",
      ),
      true,
    );
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        {
          target_type: "influencer_account",
          submitted_by_email: "someone-else@yeollock.me",
        },
        trustedProfileId,
        trustedProfileEmail,
      ),
      false,
    );
  });

  it("rejects the wrong target type or an empty trusted profile ID", () => {
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        { target_type: "organization", profile_id: trustedProfileId },
        trustedProfileId,
        trustedProfileEmail,
      ),
      false,
    );
    assert.equal(
      verificationRequestBelongsToInfluencerAccount(
        { target_type: "influencer_account", submitted_by_email: trustedProfileEmail },
        "",
        trustedProfileEmail,
      ),
      false,
    );
  });
});

describe("Platform verification customer email", () => {
  const productionInput = {
    requestId: "12345678-1234-4234-8234-123456789012",
    recipientEmail: "creator@yeollock.me",
    status: "pending" as const,
    platform: "instagram" as const,
    ownershipMethod: "instagram_dm_code" as const,
    dataOrigin: "production" as const,
  };

  it("uses Korean 연락미 branding without exposing verification evidence", () => {
    const content = buildPlatformVerificationEmail(productionInput);
    const rendered = `${content.subject}\n${content.text}\n${content.html}`;

    assert.match(content.subject, /^\[연락미\] 인스타그램 계정 인증 요청이 접수되었습니다$/);
    assert.match(content.html, /https:\/\/yeollock\.me\/email-logo\.png/);
    assert.match(content.html, /width="42" height="42"/);
    assert.match(content.html, />연락미<\/td>/);
    assert.match(content.html, /https:\/\/yeollock\.me\/influencer\/verification/);
    assert.match(content.text, /이메일에는 인증 정보를 담지 않습니다/);
    assert.doesNotMatch(rendered, /DS-AB12-CD34|mid\.verified\.1|Bearer\s+/i);
    assert.doesNotMatch(rendered, /access[_ -]?token/i);
    assert.doesNotMatch(rendered, /12345678-1234-4234-8234-123456789012/);
  });

  it("provides concise Korean approval and rejection messages", () => {
    const approved = buildPlatformVerificationEmail({
      ...productionInput,
      status: "approved",
    });
    const rejected = buildPlatformVerificationEmail({
      ...productionInput,
      status: "rejected",
    });

    assert.match(approved.subject, /^\[연락미\].*계정 인증이 완료되었습니다$/);
    assert.match(approved.text, /인증 배지가 표시/);
    assert.match(rejected.subject, /^\[연락미\].*계정 인증 요청을 확인해 주세요$/);
    assert.match(rejected.text, /자세한 안내와 재시도 방법/);
    assert.doesNotMatch(rejected.text, /reviewer|검수 메모|반려 사유/i);
  });

  it("fails closed before fetch for disabled, non-production, and test recipients", async () => {
    resetPlatformVerificationEmailDedupeForTests();
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    assert.deepEqual(
      await sendPlatformVerificationEmail(productionInput, { apiKey: "", fetchImpl }),
      { status: "skipped", reason: "not_configured" },
    );
    assert.deepEqual(
      await sendPlatformVerificationEmail(
        { ...productionInput, dataOrigin: "qa" },
        { apiKey: "resend-test-key", fetchImpl },
      ),
      { status: "skipped", reason: "non_production" },
    );
    const { dataOrigin: _dataOrigin, ...missingOriginInput } = productionInput;
    assert.deepEqual(
      await sendPlatformVerificationEmail(missingOriginInput, {
        apiKey: "resend-test-key",
        fetchImpl,
      }),
      { status: "skipped", reason: "non_production" },
    );
    assert.deepEqual(
      await sendPlatformVerificationEmail(
        { ...productionInput, recipientEmail: "  Creator.Sora@YEOLLOCK.ME  " },
        { apiKey: "resend-test-key", fetchImpl },
      ),
      { status: "skipped", reason: "invalid_recipient" },
    );
    assert.equal(fetchCalls, 0);
  });

  it("sends once per request state with a hashed Resend idempotency key", async () => {
    resetPlatformVerificationEmailDedupeForTests();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;

    const first = await sendPlatformVerificationEmail(productionInput, {
      apiKey: "resend-test-key",
      fetchImpl,
      now: () => fixedNow.getTime(),
    });
    const duplicate = await sendPlatformVerificationEmail(productionInput, {
      apiKey: "resend-test-key",
      fetchImpl,
      now: () => fixedNow.getTime(),
    });

    assert.equal(first.status, "sent");
    assert.equal(duplicate.status, "deduplicated");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.resend.com/emails");
    const headers = new Headers(calls[0]?.init?.headers);
    assert.match(headers.get("Idempotency-Key") ?? "", /^platform-verification-[a-f0-9]{32}$/);
    assert.doesNotMatch(headers.get("Idempotency-Key") ?? "", /12345678-1234/);
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      from: string;
      to: string[];
      subject: string;
    };
    assert.equal(body.from, "연락미 <no-reply@auth.yeollock.me>");
    assert.deepEqual(body.to, ["creator@yeollock.me"]);
    assert.match(body.subject, /인스타그램 계정 인증 요청/);
  });

  it("returns a failure result without blocking a later retry", async () => {
    resetPlatformVerificationEmailDedupeForTests();
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return new Response(null, { status: 503 });
    }) as typeof fetch;

    const first = await sendPlatformVerificationEmail(productionInput, {
      apiKey: "resend-test-key",
      fetchImpl,
    });
    const retry = await sendPlatformVerificationEmail(productionInput, {
      apiKey: "resend-test-key",
      fetchImpl,
    });

    assert.equal(first.status, "failed");
    assert.equal(retry.status, "failed");
    assert.equal(fetchCalls, 2);
  });
});

const makeRecord = (overrides: Partial<MemoryRecord> = {}): MemoryRecord => ({
  id: "request-1",
  status: "pending",
  data_origin: "production",
  platform_handle: "creator.name",
  platform_url: "https://www.instagram.com/creator.name/",
  ownership_challenge_expires_at: "2026-08-02T03:10:00.000Z",
  ownership_challenge_code_hash: `hash:${event.challengeCode}`,
  ownership_challenge_consumed_at: null,
  ...overrides,
});

const makeDependencies = (
  record: MemoryRecord,
  options: {
    username?: string;
    autoApproveEnabled?: boolean;
    providerError?: Error;
  } = {},
) => {
  const failures: InstagramDmFailureReason[] = [];
  const saved: SavedRecord[] = [];
  let lookupCalls = 0;

  return {
    failures,
    saved,
    get lookupCalls() {
      return lookupCalls;
    },
    dependencies: {
      now: () => new Date(fixedNow),
      hashCode: (challengeCode: string) => `hash:${challengeCode}`,
      readPendingByHash: async (codeHash: string) =>
        record.status === "pending" &&
        record.ownership_challenge_code_hash === codeHash &&
        !record.ownership_challenge_consumed_at
          ? record
          : undefined,
      lookupSenderUsername: async () => {
        lookupCalls += 1;
        if (options.providerError) throw options.providerError;
        return options.username ?? "creator.name";
      },
      markFailure: async (
        target: MemoryRecord,
        codeHash: string,
        reason: InstagramDmFailureReason,
        checkedAt: string,
      ) => {
        assert.equal(target.id, record.id);
        assert.equal(codeHash, `hash:${event.challengeCode}`);
        assert.equal(checkedAt, event.receivedAt);
        failures.push(reason);
      },
      compareAndConsume: async ({
        codeHash,
        event: verifiedEvent,
        autoApprove,
      }: {
        record: MemoryRecord;
        codeHash: string;
        event: InstagramDmChallengeEvent;
        requestedHandle: string;
        autoApprove: boolean;
      }) => {
        await Promise.resolve();
        if (
          record.status !== "pending" ||
          record.ownership_challenge_code_hash !== codeHash ||
          record.ownership_challenge_consumed_at ||
          new Date(record.ownership_challenge_expires_at ?? 0).getTime() <=
            fixedNow.getTime()
        ) {
          return undefined;
        }
        record.ownership_challenge_code_hash = null;
        record.ownership_challenge_consumed_at = verifiedEvent.receivedAt;
        record.status = autoApprove ? "approved" : "pending";
        return {
          id: record.id,
          status: autoApprove ? "approved" : "pending",
          consumedAt: verifiedEvent.receivedAt,
        } satisfies SavedRecord;
      },
      isStillAuthoritative: async () => true,
      autoApproveEnabled: options.autoApproveEnabled ?? true,
      isOperationalTest: (target: MemoryRecord) =>
        ["qa", "demo", "seed"].includes(target.data_origin ?? ""),
      onSaved: async (value: SavedRecord) => {
        saved.push(value);
      },
    },
  };
};

describe("Instagram DM ownership verification", () => {
  it("accepts only the valid Meta HMAC signature", () => {
    const rawBody = Buffer.from('{"object":"instagram"}');
    const secret = "meta-app-secret";
    const signature = `sha256=${createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex")}`;

    assert.equal(
      verifyInstagramWebhookSignature(rawBody, signature, secret),
      true,
    );
    assert.equal(
      verifyInstagramWebhookSignature(rawBody, `${signature}0`, secret),
      false,
    );
    assert.equal(verifyInstagramWebhookSignature(rawBody, signature, "wrong"), false);
    assert.equal(verifyInstagramWebhookSignature(undefined, signature, secret), false);
  });

  it("extracts only inbound DMs addressed to the official account", () => {
    const receivedAt = "2026-08-02T03:00:01.000Z";
    const body = {
      object: "instagram",
      entry: [
        {
          id: "official-ig-id",
          messaging: [
            {
              sender: { id: "10001" },
              recipient: { id: "official-ig-id" },
              message: { mid: "mid.good", text: "인증 DS-AB12-CD34" },
            },
            {
              sender: { id: "10002" },
              recipient: { id: "somebody-else" },
              message: { mid: "mid.other", text: "DS-AB12-CD34" },
            },
            {
              sender: { id: "10003" },
              recipient: { id: "official-ig-id" },
              message: {
                mid: "mid.echo",
                text: "DS-AB12-CD34",
                is_echo: true,
              },
            },
            {
              sender: { id: "official-ig-id" },
              recipient: { id: "official-ig-id" },
              message: { mid: "mid.self", text: "DS-AB12-CD34" },
            },
          ],
        },
        {
          id: "different-entry",
          messaging: [
            {
              sender: { id: "10004" },
              recipient: { id: "official-ig-id" },
              message: { mid: "mid.entry", text: "DS-AB12-CD34" },
            },
          ],
        },
      ],
    };

    assert.deepEqual(
      extractInstagramDmChallengeEvents(
        body,
        "official-ig-id",
        () => receivedAt,
      ),
      [
        {
          challengeCode: "DS-AB12-CD34",
          senderId: "10001",
          messageId: "mid.good",
          receivedAt,
        },
      ],
    );
    assert.deepEqual(
      extractInstagramDmChallengeEvents(
        { ...body, object: "page" },
        "official-ig-id",
      ),
      [],
    );
  });

  it("auto-approves only an exact Instagram username and URL match", async () => {
    const harness = makeDependencies(makeRecord());
    const result = await processInstagramDmChallengeEvent(
      event,
      harness.dependencies,
    );

    assert.equal(result.outcome, "verified");
    assert.equal(result.outcome === "verified" && result.autoApproved, true);
    assert.equal(harness.saved.length, 1);
    assert.deepEqual(harness.failures, []);
  });

  it("rejects lookalike usernames instead of treating punctuation as equal", async () => {
    const harness = makeDependencies(makeRecord(), { username: "creator_name" });
    const result = await processInstagramDmChallengeEvent(
      event,
      harness.dependencies,
    );

    assert.equal(result.outcome, "username_mismatch");
    assert.deepEqual(harness.failures, ["username_mismatch"]);
    assert.equal(harness.saved.length, 0);
  });

  it("expires at the exact deadline without querying Meta", async () => {
    const harness = makeDependencies(
      makeRecord({ ownership_challenge_expires_at: fixedNow.toISOString() }),
    );
    const result = await processInstagramDmChallengeEvent(
      event,
      harness.dependencies,
    );

    assert.equal(result.outcome, "expired");
    assert.equal(harness.lookupCalls, 0);
    assert.deepEqual(harness.failures, ["expired"]);
  });

  it("consumes a concurrent replay only once", async () => {
    const harness = makeDependencies(makeRecord());
    const results = await Promise.all([
      processInstagramDmChallengeEvent(event, harness.dependencies),
      processInstagramDmChallengeEvent(event, harness.dependencies),
    ]);

    assert.equal(results.filter((result) => result.outcome === "verified").length, 1);
    assert.equal(
      results.filter(
        (result) =>
          result.outcome === "ignored" && result.reason === "race_or_replay",
      ).length,
      1,
    );
    assert.equal(harness.saved.length, 1);
  });

  it("never auto-approves QA, demo, or seed-origin requests", async () => {
    for (const dataOrigin of ["qa", "demo", "seed"] as const) {
      const harness = makeDependencies(makeRecord({ data_origin: dataOrigin }));
      const result = await processInstagramDmChallengeEvent(
        event,
        harness.dependencies,
      );

      assert.equal(result.outcome, "verified");
      assert.equal(result.outcome === "verified" && result.autoApproved, false);
      assert.equal(harness.saved[0]?.status, "pending");
    }
  });

  it("leaves the challenge retryable when Meta lookup is unavailable", async () => {
    const record = makeRecord();
    const harness = makeDependencies(record, {
      providerError: new Error("Meta unavailable"),
    });
    const result = await processInstagramDmChallengeEvent(
      event,
      harness.dependencies,
    );

    assert.equal(result.outcome, "provider_unavailable");
    assert.deepEqual(harness.failures, ["provider_unavailable"]);
    assert.equal(record.ownership_challenge_code_hash, `hash:${event.challengeCode}`);
    assert.equal(record.ownership_challenge_consumed_at, null);
  });

  it("does not consume an old DM when a fallback appears during Meta lookup", async () => {
    const harness = makeDependencies(makeRecord());
    let releaseLookup!: () => void;
    let markLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      markLookupStarted = resolve;
    });
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    let authoritative = true;
    let consumeCalls = 0;
    const originalCompareAndConsume = harness.dependencies.compareAndConsume;
    const verification = processInstagramDmChallengeEvent(event, {
      ...harness.dependencies,
      lookupSenderUsername: async () => {
        markLookupStarted();
        await lookupGate;
        return "creator.name";
      },
      isStillAuthoritative: async () => authoritative,
      compareAndConsume: async (input) => {
        consumeCalls += 1;
        return originalCompareAndConsume(input);
      },
    });

    await lookupStarted;
    authoritative = false;
    releaseLookup();
    const result = await verification;

    assert.deepEqual(result, { outcome: "ignored", reason: "race_or_replay" });
    assert.equal(consumeCalls, 0);
    assert.equal(harness.saved.length, 0);
  });

  it("cold-restores only a currently active DM request", () => {
    const active = makeRestoreRecord();
    const approved = makeRestoreRecord({
      id: "22222222-2222-4222-8222-222222222222",
      created_at: "2026-08-02T02:56:00.000Z",
      status: "approved",
      challengeState: "verified",
      ownership_challenge_code_hash: null,
      ownership_challenge_code_ciphertext: null,
      ownership_challenge_consumed_at: "2026-08-02T02:56:30.000Z",
    });

    assert.equal(
      selectInstagramDmRestoreRecord([approved], {
        nowMs: fixedNow.getTime(),
        getChallengeState: (record) => record.challengeState,
      }),
      undefined,
    );
    assert.equal(
      selectInstagramDmRestoreRecord([active], {
        nowMs: fixedNow.getTime(),
        getChallengeState: (record) => record.challengeState,
      })?.id,
      active.id,
    );
  });

  it("restores a provider retry without enabling unsupported manual actions", () => {
    const retryingProvider = makeRestoreRecord({
      challengeState: "retrying_provider",
    });
    const getState = (record: RestoreRecord) => record.challengeState;

    assert.equal(
      selectInstagramDmRestoreRecord([retryingProvider], {
        nowMs: fixedNow.getTime(),
        getChallengeState: getState,
      })?.id,
      retryingProvider.id,
    );
    assert.equal(
      isActionableInstagramDmManualReview(
        retryingProvider,
        [retryingProvider],
        getState,
      ),
      false,
    );
  });

  it("does not restore a DM request superseded by a newer fallback for the same handle", () => {
    const active = makeRestoreRecord();
    const fallback = makeRestoreRecord({
      id: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-08-02T02:58:00.000Z",
      ownership_verification_method: "profile_bio_code",
      ownership_challenge_code_hash: null,
      ownership_challenge_code_ciphertext: null,
      challengeState: "manual_review",
    });

    assert.equal(
      selectInstagramDmRestoreRecord([active, fallback], {
        nowMs: fixedNow.getTime(),
        getChallengeState: (record) => record.challengeState,
      }),
      undefined,
    );
  });

  it("keeps another handle independent and scopes polling to the requested id", () => {
    const active = makeRestoreRecord();
    const otherHandleFallback = makeRestoreRecord({
      id: "44444444-4444-4444-8444-444444444444",
      created_at: "2026-08-02T02:58:00.000Z",
      platform_handle: "other.creator",
      platform_url: "https://instagram.com/other.creator",
      ownership_verification_method: "profile_bio_code",
      ownership_challenge_code_hash: null,
      ownership_challenge_code_ciphertext: null,
      challengeState: "manual_review",
    });
    const secondDm = makeRestoreRecord({
      id: "55555555-5555-4555-8555-555555555555",
      created_at: "2026-08-02T02:59:00.000Z",
      platform_handle: "second.creator",
      platform_url: "https://instagram.com/second.creator",
    });
    const records = [active, otherHandleFallback, secondDm];

    assert.equal(
      selectInstagramDmRestoreRecord(records, {
        nowMs: fixedNow.getTime(),
        getChallengeState: (record) => record.challengeState,
      })?.id,
      secondDm.id,
    );
    assert.equal(
      selectInstagramDmRestoreRecord(records, {
        requestId: active.id,
        nowMs: fixedNow.getTime(),
        getChallengeState: (record) => record.challengeState,
      })?.id,
      active.id,
    );
  });

  it("queues only the latest actionable DM failure for manual review", () => {
    const failed = makeRestoreRecord({
      challengeState: "manual_review",
      ownership_challenge_code_hash: null,
      ownership_challenge_code_ciphertext: null,
    });
    const fallback = makeRestoreRecord({
      id: "66666666-6666-4666-8666-666666666666",
      created_at: "2026-08-02T02:59:00.000Z",
      ownership_verification_method: "profile_bio_code",
      ownership_challenge_code_hash: null,
      ownership_challenge_code_ciphertext: null,
      challengeState: "manual_review",
    });
    const getState = (record: RestoreRecord) => record.challengeState;

    assert.equal(
      isActionableInstagramDmManualReview(failed, [failed], getState),
      true,
    );
    assert.equal(
      isActionableInstagramDmManualReview(failed, [failed, fallback], getState),
      false,
    );
    assert.equal(
      isActionableInstagramDmManualReview(
        makeRestoreRecord(),
        [makeRestoreRecord()],
        getState,
      ),
      false,
    );
  });

  it("does not let a cross-platform same-handle request hide an Instagram failure", () => {
    const failedInstagram = makeRestoreRecord({
      challengeState: "manual_review",
      ownership_challenge_code_hash: null,
      ownership_challenge_code_ciphertext: null,
    });
    const newerTikTokRequest = makeRestoreRecord({
      id: "77777777-7777-4777-8777-777777777777",
      created_at: "2026-08-02T02:59:00.000Z",
      platform: "tiktok",
      platform_url: "https://www.tiktok.com/@creator.name",
      ownership_verification_method: "screenshot_review",
      ownership_challenge_code_hash: null,
      ownership_challenge_code_ciphertext: null,
      challengeState: "manual_review",
    });

    assert.equal(
      isActionableInstagramDmManualReview(
        failedInstagram,
        [failedInstagram, newerTikTokRequest],
        (record) => record.challengeState,
      ),
      true,
    );
  });
});
