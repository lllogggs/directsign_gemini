import { createHmac, timingSafeEqual } from "node:crypto";

export type InstagramDmChallengeEvent = {
  challengeCode: string;
  senderId: string;
  messageId: string;
  receivedAt: string;
};

export type InstagramDmFailureReason =
  | "expired"
  | "username_mismatch"
  | "provider_unavailable";

export type InstagramDmCandidateRecord = {
  status: string;
  data_origin?: string | null;
  platform_handle?: string | null;
  platform_url?: string | null;
  ownership_challenge_expires_at?: string | null;
};

export type InstagramDmRestoreRecord = InstagramDmCandidateRecord & {
  id: string;
  created_at: string;
  profile_id?: string | null;
  target_id?: string | null;
  platform?: string | null;
  ownership_verification_method?: string | null;
  ownership_challenge_code_hash?: string | null;
  ownership_challenge_code_ciphertext?: string | null;
  ownership_challenge_consumed_at?: string | null;
};

export type InstagramDmProcessResult<SavedRecord> =
  | { outcome: "verified"; autoApproved: boolean; saved: SavedRecord }
  | { outcome: "expired" }
  | { outcome: "username_mismatch" }
  | { outcome: "provider_unavailable"; error: unknown }
  | { outcome: "ignored"; reason: "missing_or_consumed" | "race_or_replay" };

const requiredText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const verifyInstagramWebhookSignature = (
  rawBody: Uint8Array | undefined,
  signature: string | undefined,
  appSecret: string | undefined,
) => {
  if (!rawBody || !appSecret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const normalizeInstagramUsername = (
  value: string | undefined | null,
) => {
  const raw = requiredText(value);
  if (!raw) return "";

  let candidate = raw.replace(/^@+/, "");
  try {
    const url = new URL(raw);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return "";
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    // A plain Instagram username is expected when this is not a URL.
  }

  const normalized = candidate.replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(normalized) ? normalized : "";
};

export const isAwaitingInstagramDmRestoreRecord = <
  RecordType extends InstagramDmRestoreRecord,
>(
  record: RecordType,
  nowMs: number,
  getChallengeState: (record: RecordType) => string | undefined,
) =>
  record.status === "pending" &&
  record.ownership_verification_method === "instagram_dm_code" &&
  (getChallengeState(record) === "awaiting_dm" ||
    getChallengeState(record) === "retrying_provider") &&
  Boolean(record.ownership_challenge_code_hash) &&
  Boolean(record.ownership_challenge_code_ciphertext) &&
  !record.ownership_challenge_consumed_at &&
  Boolean(record.ownership_challenge_expires_at) &&
  new Date(record.ownership_challenge_expires_at ?? 0).getTime() > nowMs;

export const selectInstagramDmRestoreRecord = <
  RecordType extends InstagramDmRestoreRecord,
>(
  records: RecordType[],
  options: {
    requestId?: string;
    nowMs: number;
    getChallengeState: (record: RecordType) => string | undefined;
  },
) => {
  const ordered = [...records].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  if (options.requestId) {
    return ordered.find(
      (record) =>
        record.id === options.requestId &&
        record.ownership_verification_method === "instagram_dm_code",
    );
  }

  const latestByHandle = new Map<string, RecordType>();
  for (const record of ordered) {
    const handle = normalizeInstagramUsername(record.platform_handle);
    if (handle && !latestByHandle.has(handle)) {
      latestByHandle.set(handle, record);
    }
  }

  return ordered.find((record) => {
    const handle = normalizeInstagramUsername(record.platform_handle);
    return (
      Boolean(handle) &&
      latestByHandle.get(handle)?.id === record.id &&
      isAwaitingInstagramDmRestoreRecord(
        record,
        options.nowMs,
        options.getChallengeState,
      )
    );
  });
};

export const isActionableInstagramDmManualReview = <
  RecordType extends InstagramDmRestoreRecord,
>(
  record: RecordType,
  records: RecordType[],
  getChallengeState: (record: RecordType) => string | undefined,
) => {
  const state = getChallengeState(record);
  if (
    record.status !== "pending" ||
    record.platform !== "instagram" ||
    record.ownership_verification_method !== "instagram_dm_code" ||
    (state !== "manual_review" && state !== "expired")
  ) {
    return false;
  }

  const ownerId = record.profile_id ?? record.target_id;
  const handle = normalizeInstagramUsername(record.platform_handle);
  const createdAt = new Date(record.created_at).getTime();
  if (!ownerId || !handle || !Number.isFinite(createdAt)) return false;
  return !records.some(
    (candidate) =>
      candidate.id !== record.id &&
      (candidate.profile_id ?? candidate.target_id) === ownerId &&
      candidate.platform === "instagram" &&
      normalizeInstagramUsername(candidate.platform_handle) === handle &&
      new Date(candidate.created_at).getTime() >= createdAt,
  );
};

export const extractInstagramDmChallengeEvents = (
  body: unknown,
  expectedRecipientId: string,
  receivedAt = () => new Date().toISOString(),
) => {
  const events: InstagramDmChallengeEvent[] = [];
  if (requiredText((body as { object?: unknown })?.object) !== "instagram") {
    return events;
  }
  const entries = Array.isArray((body as { entry?: unknown[] })?.entry)
    ? (body as { entry: unknown[] }).entry
    : [];

  for (const entry of entries) {
    if (requiredText((entry as { id?: unknown }).id) !== expectedRecipientId) {
      continue;
    }
    const messaging = Array.isArray((entry as { messaging?: unknown[] })?.messaging)
      ? (entry as { messaging: unknown[] }).messaging
      : [];

    for (const item of messaging) {
      const typedItem = item as {
        sender?: { id?: unknown };
        recipient?: { id?: unknown };
        is_self?: unknown;
        message?: {
          text?: unknown;
          mid?: unknown;
          is_echo?: unknown;
          is_self?: unknown;
        };
      };
      const senderId = requiredText(typedItem.sender?.id);
      const recipientId = requiredText(typedItem.recipient?.id);
      const messageId = requiredText(typedItem.message?.mid);
      if (
        recipientId !== expectedRecipientId ||
        senderId === expectedRecipientId ||
        !/^\d{1,40}$/.test(senderId) ||
        !messageId ||
        typedItem.is_self === true ||
        typedItem.message?.is_echo === true ||
        typedItem.message?.is_self === true
      ) {
        continue;
      }
      const text = requiredText(typedItem.message?.text).toUpperCase();
      const match = text.match(/DS-[A-Z0-9]{4}-[A-Z0-9]{4}/);
      if (!match) continue;
      events.push({
        challengeCode: match[0],
        senderId,
        messageId,
        receivedAt: receivedAt(),
      });
    }
  }

  return events;
};

export const processInstagramDmChallengeEvent = async <
  RecordType extends InstagramDmCandidateRecord,
  SavedRecord,
>(
  event: InstagramDmChallengeEvent,
  dependencies: {
    now: () => Date;
    hashCode: (challengeCode: string) => string;
    readPendingByHash: (codeHash: string) => Promise<RecordType | undefined>;
    lookupSenderUsername: (senderId: string) => Promise<string>;
    markFailure: (
      record: RecordType,
      codeHash: string,
      reason: InstagramDmFailureReason,
      checkedAt: string,
    ) => Promise<unknown>;
    compareAndConsume: (input: {
      record: RecordType;
      codeHash: string;
      event: InstagramDmChallengeEvent;
      requestedHandle: string;
      autoApprove: boolean;
    }) => Promise<SavedRecord | undefined>;
    isStillAuthoritative: (record: RecordType) => Promise<boolean>;
    autoApproveEnabled: boolean;
    isOperationalTest: (record: RecordType) => boolean;
    onSaved: (saved: SavedRecord) => Promise<void>;
  },
): Promise<InstagramDmProcessResult<SavedRecord>> => {
  const codeHash = dependencies.hashCode(event.challengeCode);
  const record = await dependencies.readPendingByHash(codeHash);
  if (!record) {
    return { outcome: "ignored", reason: "missing_or_consumed" };
  }

  const expiresAt = record.ownership_challenge_expires_at
    ? new Date(record.ownership_challenge_expires_at).getTime()
    : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= dependencies.now().getTime()) {
    await dependencies.markFailure(record, codeHash, "expired", event.receivedAt);
    return { outcome: "expired" };
  }

  let senderUsername: string;
  try {
    senderUsername = normalizeInstagramUsername(
      await dependencies.lookupSenderUsername(event.senderId),
    );
  } catch (error) {
    await dependencies.markFailure(
      record,
      codeHash,
      "provider_unavailable",
      event.receivedAt,
    );
    return { outcome: "provider_unavailable", error };
  }

  const requestedHandle = normalizeInstagramUsername(record.platform_handle);
  const profileUrlHandle = normalizeInstagramUsername(record.platform_url);
  if (
    !requestedHandle ||
    senderUsername !== requestedHandle ||
    profileUrlHandle !== requestedHandle
  ) {
    await dependencies.markFailure(
      record,
      codeHash,
      "username_mismatch",
      event.receivedAt,
    );
    return { outcome: "username_mismatch" };
  }

  const autoApprove =
    dependencies.autoApproveEnabled && !dependencies.isOperationalTest(record);
  if (!(await dependencies.isStillAuthoritative(record))) {
    return { outcome: "ignored", reason: "race_or_replay" };
  }
  const saved = await dependencies.compareAndConsume({
    record,
    codeHash,
    event,
    requestedHandle,
    autoApprove,
  });
  if (!saved) {
    return { outcome: "ignored", reason: "race_or_replay" };
  }
  await dependencies.onSaved(saved);
  return { outcome: "verified", autoApproved: autoApprove, saved };
};
