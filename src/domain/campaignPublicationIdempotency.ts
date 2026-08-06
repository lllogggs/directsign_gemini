const CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY =
  "yeollock:advertiser:campaign-publication-attempt:v1";
const CAMPAIGN_PUBLICATION_INTENT_HISTORY_KEY =
  "yeollockCampaignPublicationIntentId";

export const CAMPAIGN_PUBLICATION_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

type CampaignPublicationAttemptStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type CampaignPublicationAttempt = {
  intentId: string;
  fingerprint: string;
  idempotencyKey: string;
  createdAt: number;
  expiresAt: number;
};

type StoredCampaignPublicationAttempt = CampaignPublicationAttempt & {
  version: 1;
};

const readBrowserSessionStorage = (): CampaignPublicationAttemptStorage | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

const isUsableCampaignPublicationAttempt = (
  value: unknown,
  intentId: string,
  fingerprint: string,
  now: number,
): value is StoredCampaignPublicationAttempt => {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<StoredCampaignPublicationAttempt>;
  return (
    attempt.version === 1 &&
    attempt.intentId === intentId &&
    attempt.fingerprint === fingerprint &&
    typeof attempt.idempotencyKey === "string" &&
    attempt.idempotencyKey.length > 0 &&
    attempt.idempotencyKey.length <= 120 &&
    typeof attempt.createdAt === "number" &&
    Number.isFinite(attempt.createdAt) &&
    attempt.createdAt <= now + 5 * 60 * 1000 &&
    typeof attempt.expiresAt === "number" &&
    Number.isFinite(attempt.expiresAt) &&
    attempt.expiresAt > now &&
    attempt.expiresAt - attempt.createdAt ===
      CAMPAIGN_PUBLICATION_ATTEMPT_TTL_MS
  );
};

const readStoredCampaignPublicationAttempt = (
  storage: CampaignPublicationAttemptStorage | undefined,
  intentId: string,
  fingerprint: string,
  now: number,
) => {
  if (!storage) return undefined;
  try {
    const serialized = storage.getItem(
      CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY,
    );
    if (!serialized) return undefined;
    const parsed = JSON.parse(serialized) as unknown;
    if (isUsableCampaignPublicationAttempt(parsed, intentId, fingerprint, now)) {
      return parsed;
    }
    storage.removeItem(CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY);
  } catch {
    try {
      storage.removeItem(CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY);
    } catch {
      // Storage failures must not block campaign publication.
    }
  }
  return undefined;
};

const createCampaignPublicationIdempotencyKey = () => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `campaign-publication-${cryptoApi.randomUUID()}`;
  }

  const randomPart = Math.random().toString(36).slice(2);
  return `campaign-publication-${Date.now().toString(36)}-${randomPart}`;
};

const createCampaignPublicationIntentId = () =>
  createCampaignPublicationIdempotencyKey().replace(
    "campaign-publication-",
    "campaign-intent-",
  );

const fallbackPayloadFingerprint = (serializedPayload: string) => {
  const bytes = new TextEncoder().encode(serializedPayload);
  const offset = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const seeds = [
    0n,
    0x9e3779b97f4a7c15n,
    0xc2b2ae3d27d4eb4fn,
    0x165667b19e3779f9n,
  ];
  const digest = seeds
    .map((seed) => {
      let hash = offset ^ seed;
      for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * prime);
      }
      return hash.toString(16).padStart(16, "0");
    })
    .join("");
  return `fnv1a256:${digest}`;
};

export const resolveCampaignPublicationIntentId = ({
  history = typeof window === "undefined" ? undefined : window.history,
  createIntentId = createCampaignPublicationIntentId,
}: {
  history?: Pick<History, "state" | "replaceState">;
  createIntentId?: () => string;
} = {}) => {
  const state =
    history?.state && typeof history.state === "object"
      ? (history.state as Record<string, unknown>)
      : {};
  const existingIntentId = state[CAMPAIGN_PUBLICATION_INTENT_HISTORY_KEY];
  if (
    typeof existingIntentId === "string" &&
    existingIntentId.length > 0 &&
    existingIntentId.length <= 120
  ) {
    return existingIntentId;
  }

  const intentId = createIntentId().slice(0, 120);
  try {
    history?.replaceState(
      {
        ...state,
        [CAMPAIGN_PUBLICATION_INTENT_HISTORY_KEY]: intentId,
      },
      "",
    );
  } catch {
    // The in-memory intent still distinguishes this mounted creation flow.
  }
  return intentId;
};

export const fingerprintCampaignPublicationPayload = async (
  serializedPayload: string,
) => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) return fallbackPayloadFingerprint(serializedPayload);

  try {
    const digest = await cryptoApi.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(serializedPayload),
    );
    return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
  } catch {
    return fallbackPayloadFingerprint(serializedPayload);
  }
};

export const resolveCampaignPublicationAttempt = ({
  intentId,
  fingerprint,
  currentAttempt,
  storage = readBrowserSessionStorage(),
  now = Date.now(),
  createIdempotencyKey = createCampaignPublicationIdempotencyKey,
}: {
  intentId: string;
  fingerprint: string;
  currentAttempt?: CampaignPublicationAttempt;
  storage?: CampaignPublicationAttemptStorage;
  now?: number;
  createIdempotencyKey?: () => string;
}): CampaignPublicationAttempt => {
  if (
    currentAttempt &&
    isUsableCampaignPublicationAttempt(
      { ...currentAttempt, version: 1 },
      intentId,
      fingerprint,
      now,
    )
  ) {
    return currentAttempt;
  }

  const storedAttempt = readStoredCampaignPublicationAttempt(
    storage,
    intentId,
    fingerprint,
    now,
  );
  if (storedAttempt) {
    const { version: _version, ...attempt } = storedAttempt;
    return attempt;
  }

  const attempt: CampaignPublicationAttempt = {
    intentId,
    fingerprint,
    idempotencyKey: createIdempotencyKey().slice(0, 120),
    createdAt: now,
    expiresAt: now + CAMPAIGN_PUBLICATION_ATTEMPT_TTL_MS,
  };

  try {
    storage?.setItem(
      CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY,
      JSON.stringify({ ...attempt, version: 1 }),
    );
  } catch {
    // The in-memory attempt still keeps retries stable for this page lifetime.
  }

  return attempt;
};

export const clearCampaignPublicationAttempt = (
  completedAttempt: CampaignPublicationAttempt,
  storage = readBrowserSessionStorage(),
) => {
  if (!storage) return;
  try {
    const serialized = storage.getItem(
      CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY,
    );
    if (!serialized) return;
    const stored = JSON.parse(serialized) as Partial<StoredCampaignPublicationAttempt>;
    if (
      stored.version === 1 &&
      stored.intentId === completedAttempt.intentId &&
      stored.fingerprint === completedAttempt.fingerprint &&
      stored.idempotencyKey === completedAttempt.idempotencyKey
    ) {
      storage.removeItem(CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY);
    }
  } catch {
    try {
      storage.removeItem(CAMPAIGN_PUBLICATION_ATTEMPT_STORAGE_KEY);
    } catch {
      // Storage cleanup is best-effort after a confirmed publication.
    }
  }
};
