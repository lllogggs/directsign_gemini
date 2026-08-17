import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  userSessionAccessMaxAgeSeconds,
  userSessionRefreshMaxAgeSeconds,
} from "./user-session-policy.js";
import {
  getUserSessionLogoutBarrierCookieName,
  getUserSessionLogoutResumeCookieName,
  readUserSessionLogoutBarrierState,
  type UserSessionBrowserRole,
} from "./user-session-barrier.js";
import {
  classifyAuthMetricDataOrigin,
  observeOperationalAuthMetric,
  type AuthMetricDataOrigin,
  type AuthMetricOutcome,
} from "./auth-monitoring.js";
import {
  authMetricOriginCookieMaxAgeSeconds,
  createAuthMetricOriginCookieValue,
  getAuthMetricOriginCookieName,
} from "./auth-metric-origin.js";

type Role = "marketer" | "influencer";
type VerificationStatus = "not_submitted" | "pending" | "approved" | "rejected";
type InfluencerPlatform =
  | "instagram"
  | "youtube"
  | "tiktok"
  | "naver_blog"
  | "other";

type RequestLike = IncomingMessage & {
  body?: unknown;
  method?: string;
  headers: IncomingMessage["headers"];
  authMetricDataOrigin?: AuthMetricDataOrigin;
};

type ResponseLike = ServerResponse & {
  status?: (statusCode: number) => ResponseLike;
  json?: (body: unknown) => void;
};

interface SupabaseAuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

interface SupabaseAuthSession {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: SupabaseAuthUser;
}

interface SupabaseProfileRow {
  id: string;
  role: Role | "admin";
  name: string;
  email: string;
  data_origin?: AuthMetricDataOrigin | null;
  company_name?: string | null;
  activity_categories?: string[] | null;
  activity_platforms?: InfluencerPlatform[] | null;
  verification_status?: VerificationStatus | "not_submitted";
  email_verified_at?: string | null;
  terms_accepted_at?: string | null;
  privacy_policy_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_policy_version?: string | null;
}

interface SupabaseOrganizationRow {
  id: string;
  name: string;
  organization_type: string;
  business_registration_number?: string | null;
  business_verification_status?: VerificationStatus | "not_submitted";
  business_verification_request_id?: string | null;
  representative_name?: string | null;
}

interface SupabaseOrganizationMemberRow {
  organization_id: string;
  profile_id: string;
  role: string;
  is_default?: boolean | null;
  organizations?: SupabaseOrganizationRow | SupabaseOrganizationRow[] | null;
}

type ContractRecord = Record<string, any>;

interface SupabaseContractRow {
  id: string;
  contract: ContractRecord;
  share_token?: string | null;
  campaign_name?: string | null;
  post_link?: string | null;
}

interface VerificationRequestRecord {
  id: string;
  target_type: "advertiser_organization" | "influencer_account";
  target_id: string;
  verification_type: "business_registration_certificate" | "platform_account";
  status: VerificationStatus;
  profile_id?: string;
  organization_id?: string;
  subject_name: string;
  submitted_by_name?: string;
  submitted_by_email?: string;
  business_registration_number?: string;
  representative_name?: string;
  platform?: InfluencerPlatform;
  platform_handle?: string;
  platform_url?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const supabaseLegacyTable =
  process.env.SUPABASE_CONTRACTS_TABLE ?? "directsign_contracts";
const isHostedRuntime =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.VERCEL_REGION) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const isPreview = process.argv.includes("--preview") || isHostedRuntime;
const shareTokenCipherPrefix = "enc:v1:";
const userFastSessionMaxAgeSeconds = 60 * 10;
const userSessionFastPathSecret =
  process.env.USER_SESSION_FAST_PATH_SECRET?.trim();
const shareTokenEncryptionSecret =
  process.env.DIRECTSIGN_TOKEN_ENCRYPTION_SECRET?.trim();
const publicAuthIpMaxAttempts = readPositiveNumber(
  process.env.PUBLIC_AUTH_IP_MAX_ATTEMPTS,
  40,
);
const publicAuthEmailMaxAttempts = readPositiveNumber(
  process.env.PUBLIC_AUTH_EMAIL_MAX_ATTEMPTS,
  8,
);
const publicAuthWindowMs =
  readPositiveNumber(process.env.PUBLIC_AUTH_WINDOW_SECONDS, 15 * 60) * 1000;
const publicAuthAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();
const distributedRateLimitRequired =
  isHostedRuntime || process.env.NODE_ENV === "production";
const distributedRateLimitTimeoutMs = 1_500;
const fastAuthWarmupTtlMs = 20_000;
const fastAuthWarmupTimeoutMs = 1_500;
let fastAuthWarmup:
  | {
      startedAt: number;
      promise: Promise<void>;
    }
  | undefined;

const profileSelectFields = [
  "id",
  "role",
  "name",
  "email",
  "data_origin",
  "company_name",
  "activity_categories",
  "activity_platforms",
  "verification_status",
  "email_verified_at",
  "terms_accepted_at",
  "privacy_policy_accepted_at",
  "terms_version",
  "privacy_policy_version",
].join(",");

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requireSupabaseConfig() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase is not configured");
  }
  return { url: supabaseUrl, key: supabaseServiceRoleKey };
}

function supabaseHeaders(accessToken?: string) {
  const { key } = requireSupabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken ?? key}`,
    "Content-Type": "application/json",
  };
}

function supabaseRestUrl(table: string, query = "") {
  const { url } = requireSupabaseConfig();
  return `${url}/rest/v1/${table}${query}`;
}

function supabaseAuthUrl(pathName: string) {
  const { url } = requireSupabaseConfig();
  return `${url}/auth/v1${pathName}`;
}

async function fetchWarmupTarget(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fastAuthWarmupTimeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    await response.arrayBuffer().catch(() => undefined);
  } catch {
    // Warmup should never change login availability.
  } finally {
    clearTimeout(timer);
  }
}

async function warmFastAuthDependencies() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return;

  try {
    const headers = supabaseHeaders();
    await Promise.allSettled([
      fetchWarmupTarget(supabaseAuthUrl("/settings"), headers),
      fetchWarmupTarget(
        supabaseRestUrl("profiles", "?select=id&limit=1"),
        headers,
      ),
    ]);
  } catch {
    // Missing or temporarily unavailable Supabase config should not block login.
  }
}

function startFastAuthWarmup() {
  const now = Date.now();
  if (fastAuthWarmup && now - fastAuthWarmup.startedAt < fastAuthWarmupTtlMs) {
    return fastAuthWarmup.promise;
  }

  fastAuthWarmup = {
    startedAt: now,
    promise: warmFastAuthDependencies().finally(() => {
      if (
        fastAuthWarmup &&
        Date.now() - fastAuthWarmup.startedAt >= fastAuthWarmupTtlMs
      ) {
        fastAuthWarmup = undefined;
      }
    }),
  };
  return fastAuthWarmup.promise;
}

async function parseSupabaseError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      error?: string;
      msg?: string;
      error_code?: string;
    };
    return parsed.message ?? parsed.msg ?? parsed.error ?? parsed.error_code ?? body;
  } catch {
    return body;
  }
}

async function readSupabaseRows<T>(table: string, query = "", label = table) {
  const response = await fetch(supabaseRestUrl(table, query), {
    headers: supabaseHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `${label} failed (${response.status}): ${await parseSupabaseError(response)}`,
    );
  }
  return (await response.json()) as T[];
}

async function createSupabasePasswordSession(email: string, password: string) {
  const response = await fetch(supabaseAuthUrl("/token?grant_type=password"), {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }
  return (await response.json()) as SupabaseAuthSession;
}

async function revokeSupabaseSession(
  accessToken: string,
  scope: "local" | "global" = "local",
) {
  const response = await fetch(supabaseAuthUrl(`/logout?scope=${scope}`), {
    method: "POST",
    headers: supabaseHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(
      `Supabase logout failed (${response.status}): ${await parseSupabaseError(response)}`,
    );
  }
}

interface PrivacyErasureStatus {
  found?: boolean;
  status?: string | null;
}

async function readPrivacyErasureStatus(authUserId: string) {
  const response = await fetch(
    supabaseRestUrl("rpc/get_privacy_erasure_status"),
    {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_request_id: null,
        p_auth_user_id: authUserId,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Privacy erasure status failed (${response.status}): ${await parseSupabaseError(
        response,
      )}`,
    );
  }
  return (await response.json()) as PrivacyErasureStatus;
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

type FastSessionAuthorityResult = {
  active?: boolean;
  reason?: string;
};

class FastSessionAuthorityUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      "Authoritative session verification is temporarily unavailable",
      cause === undefined ? undefined : { cause },
    );
    this.name = "FastSessionAuthorityUnavailableError";
  }
}

function readSessionIdentity(session: SupabaseAuthSession) {
  const [, payload] = session.access_token.split(".");
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      session_id?: string;
    };
    if (claims.sub !== session.user.id || !hasText(claims.session_id)) return undefined;
    return { userId: claims.sub, authSessionId: claims.session_id };
  } catch {
    return undefined;
  }
}

async function verifyFastSessionAuthority(session: SupabaseAuthSession) {
  const identity = readSessionIdentity(session);
  if (!identity) return false;
  try {
    const response = await fetch(
      supabaseRestUrl("rpc/verify_directsign_auth_session"),
      {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({
          p_user_id: identity.userId,
          p_auth_session_id: identity.authSessionId,
        }),
        signal: AbortSignal.timeout(distributedRateLimitTimeoutMs),
      },
    );
    if (!response.ok) throw new Error(`Session verification failed (${response.status})`);
    const result = (await response.json()) as FastSessionAuthorityResult;
    if (result.reason === "reset_in_progress") {
      throw new FastSessionAuthorityUnavailableError();
    }
    return result.active === true && result.reason === "active";
  } catch (error) {
    if (error instanceof FastSessionAuthorityUnavailableError) throw error;
    throw new FastSessionAuthorityUnavailableError(error);
  }
}

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function getHeader(request: RequestLike, name: string) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(request: RequestLike) {
  return (
    getHeader(request, "x-forwarded-for")?.split(",")[0]?.trim() ||
    request.socket.remoteAddress ||
    "unknown"
  );
}

class FastAuthRateLimitUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      "Distributed authentication rate limiting is temporarily unavailable",
      cause === undefined ? undefined : { cause },
    );
    this.name = "FastAuthRateLimitUnavailableError";
  }
}

function hashFastAuthRateLimitKey(value: string) {
  return createHash("sha256").update(`fast-auth-rate-limit:${value}`).digest("hex");
}

function checkOrigin(request: RequestLike) {
  if (request.method !== "POST") return true;
  const origin = getHeader(request, "origin");
  if (!origin) return true;
  const host = getHeader(request, "host");
  const allowed = [
    process.env.PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VITE_SITE_URL,
    process.env.VITE_API_BASE_URL,
    host ? `https://${host}` : undefined,
    host ? `http://${host}` : undefined,
  ]
    .filter((value): value is string => hasText(value))
    .flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    });
  return allowed.includes(origin);
}

function consumeLocalRateLimitBucket(key: string, limit: number) {
  const now = Date.now();
  const attempt = publicAuthAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    publicAuthAttempts.set(key, { count: 1, resetAt: now + publicAuthWindowMs });
    return { blocked: false, retryAfter: 0 };
  }
  if (attempt.count >= limit) {
    return { blocked: true, retryAfter: Math.ceil((attempt.resetAt - now) / 1000) };
  }
  attempt.count += 1;
  return { blocked: false, retryAfter: 0 };
}

async function consumeDistributedRateLimitBucket(key: string, limit: number) {
  const response = await fetch(
    supabaseRestUrl("rpc/consume_directsign_rate_limit"),
    {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_bucket_key: key,
        p_max_attempts: limit,
        p_window_seconds: Math.max(1, Math.ceil(publicAuthWindowMs / 1000)),
      }),
      signal: AbortSignal.timeout(distributedRateLimitTimeoutMs),
    },
  );
  if (!response.ok) {
    throw new Error(`Distributed rate limit failed (${response.status})`);
  }
  const payload = (await response.json()) as
    | Array<{ blocked?: boolean; retry_after_seconds?: number }>
    | { blocked?: boolean; retry_after_seconds?: number };
  const result = Array.isArray(payload) ? payload[0] : payload;
  if (!result || typeof result.blocked !== "boolean") {
    throw new Error("Distributed rate limit returned an invalid result");
  }
  return {
    blocked: result.blocked,
    retryAfter: Math.max(0, Number(result.retry_after_seconds) || 0),
  };
}

function getRateLimitKeys(request: RequestLike, role: string, email: string) {
  return [
    {
      scope: "ip" as const,
      key: hashFastAuthRateLimitKey(`ip:${role}:${getClientIp(request)}`),
      limit: publicAuthIpMaxAttempts,
    },
    {
      scope: "email" as const,
      key: hashFastAuthRateLimitKey(`email:${role}:${email}`),
      limit: publicAuthEmailMaxAttempts,
    },
  ];
}

async function consumeRateLimit(request: RequestLike, role: string, email: string) {
  for (const bucket of getRateLimitKeys(request, role, email)) {
    try {
      const result = await consumeDistributedRateLimitBucket(bucket.key, bucket.limit);
      if (result.blocked) return result;
    } catch (error) {
      if (distributedRateLimitRequired) {
        throw new FastAuthRateLimitUnavailableError(error);
      }
      const result = consumeLocalRateLimitBucket(bucket.key, bucket.limit);
      if (result.blocked) return result;
    }
  }
  return { blocked: false, retryAfter: 0 };
}

async function clearRateLimit(role: string, email: string, request: RequestLike) {
  // A successful login may clear only that subject's credential bucket. The
  // shared IP bucket must retain its attempt history so an attacker cannot
  // reset it by authenticating one account they control.
  const buckets = getRateLimitKeys(request, role, email).filter(
    (bucket) => bucket.scope === "email",
  );
  for (const bucket of buckets) publicAuthAttempts.delete(bucket.key);
  if (!supabaseUrl || !supabaseServiceRoleKey) return;

  await Promise.allSettled(
    buckets.map((bucket) =>
      fetch(
        supabaseRestUrl(
          "directsign_rate_limit_buckets",
          `?bucket_key=eq.${encodeURIComponent(bucket.key)}`,
        ),
        {
          method: "DELETE",
          headers: supabaseHeaders(),
          signal: AbortSignal.timeout(distributedRateLimitTimeoutMs),
        },
      ),
    ),
  );
}

async function readBody(request: RequestLike) {
  if (request.body && typeof request.body === "object") {
    return request.body as Record<string, unknown>;
  }
  if (typeof request.body === "string") {
    return JSON.parse(request.body) as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function sendJson(response: ResponseLike, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function cookieOptions(maxAgeSeconds: number) {
  return [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    isPreview ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function appendResponseCookies(response: ResponseLike, cookies: string[]) {
  if (cookies.length === 0) return;
  const existing = response.getHeader("Set-Cookie");
  const existingCookies = Array.isArray(existing)
    ? existing.map(String)
    : typeof existing === "string"
      ? [existing]
      : [];
  response.setHeader("Set-Cookie", [...existingCookies, ...cookies]);
}

function bindSessionToObservedLogoutBarrier(
  request: RequestLike,
  response: ResponseLike,
  role: UserSessionBrowserRole,
) {
  const { barrier } = readUserSessionLogoutBarrierState(
    getHeader(request, "cookie"),
    role,
  );
  const resumeCookieName = getUserSessionLogoutResumeCookieName(role);
  appendResponseCookies(response, [
    barrier
      ? `${resumeCookieName}=${barrier}; ${cookieOptions(
          userSessionRefreshMaxAgeSeconds,
        )}`
      : `${resumeCookieName}=; ${cookieOptions(0)}`,
  ]);
}

async function terminateRoleSession(
  response: ResponseLike,
  role: UserSessionBrowserRole,
  session: SupabaseAuthSession,
  revokeScope: "local" | "global" = "local",
) {
  const cookiePrefix =
    role === "advertiser" ? "directsign_advertiser" : "directsign_influencer";
  const barrierCookieName = getUserSessionLogoutBarrierCookieName(role);
  const resumeCookieName = getUserSessionLogoutResumeCookieName(role);
  response.setHeader("Set-Cookie", [
    `${cookiePrefix}_access=; ${cookieOptions(0)}`,
    `${cookiePrefix}_refresh=; ${cookieOptions(0)}`,
    `${cookiePrefix}_fast=; ${cookieOptions(0)}`,
    `${getAuthMetricOriginCookieName(role)}=; ${cookieOptions(0)}`,
    `${barrierCookieName}=${randomBytes(16).toString("hex")}; ${cookieOptions(
      userSessionRefreshMaxAgeSeconds,
    )}`,
    `${resumeCookieName}=; ${cookieOptions(0)}`,
  ]);
  try {
    await revokeSupabaseSession(session.access_token, revokeScope);
  } catch (error) {
    console.warn(
      `[yeollock fast auth] ${role} authorization termination revoke failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

async function rejectBlockedPrivacyErasureLogin(
  response: ResponseLike,
  role: UserSessionBrowserRole,
  session: SupabaseAuthSession,
) {
  let erasure: PrivacyErasureStatus;
  try {
    erasure = await readPrivacyErasureStatus(session.user.id);
  } catch {
    // The password-grant session has not been committed to browser cookies yet.
    // Revoke only that provider session: clearing role cookies here would also
    // destroy the customer's pre-existing rolling session on this device.
    try {
      await revokeSupabaseSession(session.access_token, "local");
    } catch (error) {
      console.warn(
        `[yeollock fast auth] ${role} uncommitted session revoke failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
    sendJson(response, 503, {
      code: "ACCOUNT_ERASURE_STATUS_UNAVAILABLE",
      error: "계정 삭제 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      retryable: true,
    });
    return true;
  }

  if (erasure.found === true && erasure.status !== "cancelled") {
    await terminateRoleSession(response, role, session, "global");
    sendJson(response, 410, {
      code: "ACCOUNT_ERASURE_PENDING",
      error: "계정 삭제가 진행 중이어서 로그인할 수 없습니다.",
    });
    return true;
  }
  return false;
}

function fastSessionHmac(payload: string) {
  if (!userSessionFastPathSecret) return "";
  return createHmac("sha256", userSessionFastPathSecret)
    .update(payload)
    .digest("hex");
}

function createFastSessionToken(
  user: SupabaseAuthUser,
  profile: SupabaseProfileRow,
  role: Role,
) {
  if (!userSessionFastPathSecret) return undefined;
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      role,
      exp: Date.now() + userFastSessionMaxAgeSeconds * 1000,
      user: {
        id: user.id,
        email: user.email ?? profile.email,
        email_confirmed_at:
          user.email_confirmed_at ?? profile.email_verified_at ?? undefined,
        confirmed_at: user.confirmed_at ?? profile.email_verified_at ?? undefined,
      },
      profile,
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${fastSessionHmac(payload)}`;
}

function readAuthMetricOriginBinding(session: SupabaseAuthSession) {
  const [, payload] = session.access_token.split(".");
  if (!payload || !session.refresh_token) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      session_id?: string;
    };
    if (claims.sub !== session.user.id || !hasText(claims.session_id)) {
      return undefined;
    }
    return {
      userId: session.user.id,
      authSessionId: claims.session_id,
      sessionProof: session.refresh_token,
    };
  } catch {
    return undefined;
  }
}

function setSessionCookies(
  request: RequestLike,
  response: ResponseLike,
  role: "advertiser" | "influencer",
  session: SupabaseAuthSession,
  profile: SupabaseProfileRow,
) {
  const cookiePrefix =
    role === "advertiser" ? "directsign_advertiser" : "directsign_influencer";
  const profileRole = role === "advertiser" ? "marketer" : "influencer";
  const cookies = [
    `${cookiePrefix}_access=${encodeURIComponent(
      session.access_token,
    )}; ${cookieOptions(
      Math.min(
        userSessionAccessMaxAgeSeconds,
        Math.max(
          60,
          Number(session.expires_in ?? userSessionAccessMaxAgeSeconds),
        ),
      ),
    )}`,
  ];
  if (session.refresh_token) {
    cookies.push(
      `${cookiePrefix}_refresh=${encodeURIComponent(
        session.refresh_token,
      )}; ${cookieOptions(userSessionRefreshMaxAgeSeconds)}`,
    );
  }
  const fastToken = createFastSessionToken(session.user, profile, profileRole);
  if (fastToken) {
    cookies.push(
      `${cookiePrefix}_fast=${encodeURIComponent(
        fastToken,
      )}; ${cookieOptions(userFastSessionMaxAgeSeconds)}`,
    );
  }
  const metricOrigin = classifyAuthMetricDataOrigin({
    identifier: profile.email ?? session.user.email,
    explicit: profile.data_origin,
  });
  const metricOriginBinding = readAuthMetricOriginBinding(session);
  const metricOriginValue =
    metricOrigin && shareTokenEncryptionSecret && metricOriginBinding
      ? createAuthMetricOriginCookieValue({
          role,
          origin: metricOrigin,
          secret: shareTokenEncryptionSecret,
          ...metricOriginBinding,
        })
      : undefined;
  if (metricOriginValue) {
    cookies.push(
      `${getAuthMetricOriginCookieName(role)}=${encodeURIComponent(
        metricOriginValue,
      )}; ${cookieOptions(authMetricOriginCookieMaxAgeSeconds)}`,
    );
  }
  response.setHeader("Set-Cookie", cookies);
  bindSessionToObservedLogoutBarrier(request, response, role);
}

function getShareTokenCipherKey() {
  if (!shareTokenEncryptionSecret) return undefined;
  return createHash("sha256").update(shareTokenEncryptionSecret).digest();
}

function decryptShareTokenFromLegacyStore(value: string | undefined | null) {
  if (!hasText(value)) return undefined;
  if (!value.startsWith(shareTokenCipherPrefix)) return value;
  const key = getShareTokenCipherKey();
  if (!key) return undefined;
  try {
    const payload = Buffer.from(value.slice(shareTokenCipherPrefix.length), "base64url");
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

function restoreLegacyContract(row: SupabaseContractRow) {
  const fallbackToken = decryptShareTokenFromLegacyStore(row.share_token);
  const contractToken = decryptShareTokenFromLegacyStore(
    row.contract?.evidence?.share_token,
  );
  const shareToken = contractToken ?? fallbackToken;
  const restored = row.contract
    ? {
        ...row.contract,
        campaign_name: row.contract.campaign_name ?? row.campaign_name ?? undefined,
        post_link: row.contract.post_link ?? row.post_link ?? undefined,
      }
    : row.contract;
  if (!restored?.evidence || !shareToken) return restored;
  return {
    ...restored,
    evidence: {
      ...restored.evidence,
      share_token: shareToken,
    },
  };
}

function protectContractForClient(contract: ContractRecord) {
  if (!contract?.evidence) return contract;
  return {
    ...contract,
    evidence: {
      ...contract.evidence,
      share_token: undefined,
    },
  };
}

async function readProfileByUserId(userId: string) {
  const rows = await readSupabaseRows<SupabaseProfileRow>(
    "profiles",
    `?select=${profileSelectFields}&id=eq.${encodeURIComponent(userId)}&limit=1`,
    "profile by id",
  );
  return rows[0];
}

async function readDefaultOrganization(profileId: string) {
  const rows = await readSupabaseRows<SupabaseOrganizationMemberRow>(
    "organization_members",
    `?select=organization_id,profile_id,role,is_default,organizations(id,name,organization_type,business_registration_number,business_verification_status,business_verification_request_id,representative_name)&profile_id=eq.${encodeURIComponent(
      profileId,
    )}&order=is_default.desc&limit=1`,
    "organization membership",
  );
  const organization = rows[0]?.organizations;
  return Array.isArray(organization) ? organization[0] : organization;
}

const postgrestInFilter = (values: string[]) =>
  `(${values.map((value) => encodeURIComponent(value)).join(",")})`;

async function readAdvertiserContracts(profile: SupabaseProfileRow) {
  const byProfile = await readSupabaseRows<SupabaseContractRow>(
    supabaseLegacyTable,
    `?select=id,contract,share_token,campaign_name,post_link&advertiser_id=eq.${encodeURIComponent(
      profile.id,
    )}&order=updated_at.desc`,
    "advertiser contracts",
  );
  const rows =
    byProfile.length > 0 || !hasText(profile.email)
      ? byProfile
      : await readSupabaseRows<SupabaseContractRow>(
          supabaseLegacyTable,
          `?select=id,contract,share_token,campaign_name,post_link&contract->advertiser_info->>manager=eq.${encodeURIComponent(
            normalizeEmail(profile.email),
          )}&order=updated_at.desc`,
          "advertiser legacy manager contracts",
        );
  return rows
    .map(restoreLegacyContract)
    .filter(Boolean)
    .map(protectContractForClient);
}

async function readAdvertiserVerification(
  profile: SupabaseProfileRow,
  organization?: SupabaseOrganizationRow,
) {
  return buildAdvertiserVerification(
    profile,
    organization,
    await readAdvertiserVerificationRequests(profile, organization),
  );
}

async function readAdvertiserVerificationRequests(
  profile: SupabaseProfileRow,
  organization?: SupabaseOrganizationRow,
) {
  const targetId = organization?.id ?? profile.id;
  const targetIds = Array.from(
    new Set([targetId, profile.id, organization?.id].filter(hasText)),
  );
  const orFilters = [
    targetIds.length > 0
      ? `target_id.in.${postgrestInFilter(targetIds)}`
      : undefined,
    `profile_id.eq.${encodeURIComponent(profile.id)}`,
    hasText(organization?.id)
      ? `organization_id.eq.${encodeURIComponent(organization.id)}`
      : undefined,
    hasText(organization?.business_verification_request_id)
      ? `id.eq.${encodeURIComponent(organization.business_verification_request_id)}`
      : undefined,
  ].filter(hasText);
  return await readSupabaseRows<VerificationRequestRecord>(
    "verification_requests",
    `?select=id,target_type,target_id,verification_type,status,profile_id,organization_id,subject_name,submitted_by_name,submitted_by_email,business_registration_number,representative_name,reviewed_at,created_at,updated_at&target_type=eq.advertiser_organization&verification_type=eq.business_registration_certificate&or=(${orFilters.join(
      ",",
    )})&order=created_at.desc`,
    "advertiser verification",
  );
}

function buildAdvertiserVerification(
  profile: SupabaseProfileRow,
  organization: SupabaseOrganizationRow | undefined,
  requests: VerificationRequestRecord[],
) {
  const targetId = organization?.id ?? profile.id;
  const latest = requests[0];
  const status =
    latest?.status === "approved" && !hasText(latest.reviewed_at)
      ? "pending"
      : (latest?.status ?? "not_submitted");
  return {
    advertiser: {
      target_type: "advertiser_organization",
      target_id: targetId,
      status,
      latest_request: latest,
      account: {
        name: profile.name,
        company_name: organization?.name ?? profile.company_name ?? profile.name,
        email: profile.email,
        business_registration_number:
          organization?.business_registration_number ?? undefined,
        representative_name: organization?.representative_name ?? undefined,
      },
    },
    influencer: {
      target_type: "influencer_account",
      target_id: process.env.DIRECTSIGN_DEFAULT_INFLUENCER_ID ?? "influencer_guest",
      status: "not_submitted",
    },
  };
}

function buildAdvertiserUser(
  user: SupabaseAuthUser,
  profile: SupabaseProfileRow,
  organization?: SupabaseOrganizationRow,
) {
  return {
    id: profile.id,
    email: profile.email ?? user.email,
    name: profile.name,
    role: profile.role,
    company_name: organization?.name ?? profile.company_name,
    verification_status:
      organization?.business_verification_status ??
      profile.verification_status ??
      "not_submitted",
    business_registration_number:
      organization?.business_registration_number ?? undefined,
  };
}

function buildInfluencerUser(user: SupabaseAuthUser, profile: SupabaseProfileRow) {
  return {
    id: user.id,
    email: profile.email ?? user.email ?? "",
    name: profile.name ?? user.email ?? "인플루언서",
    role: profile.role,
    activity_categories: profile.activity_categories ?? [],
    activity_platforms: profile.activity_platforms ?? [],
    verification_status: profile.verification_status ?? "not_submitted",
    email_verified: Boolean(
      user.email_confirmed_at ?? user.confirmed_at ?? profile.email_verified_at,
    ),
  };
}

function buildInfluencerVerification(profile: SupabaseProfileRow) {
  return {
    status: profile.verification_status ?? "not_submitted",
    approved_platforms: [],
  };
}

async function handleAdvertiserLogin(request: RequestLike, response: ResponseLike) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  request.authMetricDataOrigin = classifyAuthMetricDataOrigin({ identifier: email });
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.includes("@") || !password) {
    sendJson(response, 422, { error: "이메일과 비밀번호를 입력해 주세요." });
    return;
  }
  let throttle: { blocked: boolean; retryAfter: number };
  try {
    throttle = await consumeRateLimit(request, "advertiser_login", email);
  } catch (error) {
    if (error instanceof FastAuthRateLimitUnavailableError) {
      response.setHeader("Retry-After", "2");
      sendJson(response, 503, {
        error: "Authentication is temporarily unavailable. Try again.",
        retryable: true,
      });
      return;
    }
    throw error;
  }
  if (throttle.blocked) {
    response.setHeader("Retry-After", String(throttle.retryAfter));
    sendJson(response, 429, { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }
  const session = await createSupabasePasswordSession(email, password);
  try {
    if (!(await verifyFastSessionAuthority(session))) {
      await revokeSupabaseSession(session.access_token).catch(() => undefined);
      sendJson(response, 401, { error: "로그인 세션을 다시 확인해 주세요." });
      return;
    }
  } catch (error) {
    await revokeSupabaseSession(session.access_token).catch(() => undefined);
    if (error instanceof FastSessionAuthorityUnavailableError) {
      response.setHeader("Retry-After", "1");
      sendJson(response, 503, {
        error: "Authentication is temporarily unavailable. Try again.",
        retryable: true,
      });
      return;
    }
    throw error;
  }
  if (await rejectBlockedPrivacyErasureLogin(response, "advertiser", session)) {
    return;
  }
  const profile = await readProfileByUserId(session.user.id);
  if (profile) {
    request.authMetricDataOrigin = classifyAuthMetricDataOrigin({
      identifier: profile.email,
      explicit: profile.data_origin,
    });
  }
  if (profile?.role !== "marketer") {
    await terminateRoleSession(response, "advertiser", session);
    sendJson(response, 403, { error: "광고주 계정 권한이 필요합니다." });
    return;
  }
  const resolvedOrganization = await readDefaultOrganization(profile.id);
  const [contracts, verification] = await Promise.all([
    readAdvertiserContracts(profile),
    readAdvertiserVerification(profile, resolvedOrganization),
  ]);
  const dashboard = {
    contracts,
    verification,
    source: "supabase",
    allow_local_merge: false,
    demo_mode: false,
  };
  setSessionCookies(request, response, "advertiser", session, profile);
  await clearRateLimit("advertiser_login", email, request);
  sendJson(response, 200, {
    authenticated: true,
    user: buildAdvertiserUser(session.user, profile, resolvedOrganization),
    dashboard,
  });
}

async function handleInfluencerLogin(request: RequestLike, response: ResponseLike) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  request.authMetricDataOrigin = classifyAuthMetricDataOrigin({ identifier: email });
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.includes("@") || !password) {
    sendJson(response, 422, { error: "이메일과 비밀번호를 입력해 주세요." });
    return;
  }
  let throttle: { blocked: boolean; retryAfter: number };
  try {
    throttle = await consumeRateLimit(request, "influencer_login", email);
  } catch (error) {
    if (error instanceof FastAuthRateLimitUnavailableError) {
      response.setHeader("Retry-After", "2");
      sendJson(response, 503, {
        error: "Authentication is temporarily unavailable. Try again.",
        retryable: true,
      });
      return;
    }
    throw error;
  }
  if (throttle.blocked) {
    response.setHeader("Retry-After", String(throttle.retryAfter));
    sendJson(response, 429, { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }
  const session = await createSupabasePasswordSession(email, password);
  try {
    if (!(await verifyFastSessionAuthority(session))) {
      await revokeSupabaseSession(session.access_token).catch(() => undefined);
      sendJson(response, 401, { error: "로그인 세션을 다시 확인해 주세요." });
      return;
    }
  } catch (error) {
    await revokeSupabaseSession(session.access_token).catch(() => undefined);
    if (error instanceof FastSessionAuthorityUnavailableError) {
      response.setHeader("Retry-After", "1");
      sendJson(response, 503, {
        error: "Authentication is temporarily unavailable. Try again.",
        retryable: true,
      });
      return;
    }
    throw error;
  }
  if (await rejectBlockedPrivacyErasureLogin(response, "influencer", session)) {
    return;
  }
  const profile = await readProfileByUserId(session.user.id);
  if (profile) {
    request.authMetricDataOrigin = classifyAuthMetricDataOrigin({
      identifier: profile.email,
      explicit: profile.data_origin,
    });
  }
  if (profile?.role !== "influencer") {
    await terminateRoleSession(response, "influencer", session);
    sendJson(response, 403, { error: "인플루언서 계정 권한이 필요합니다." });
    return;
  }
  setSessionCookies(request, response, "influencer", session, profile);
  await clearRateLimit("influencer_login", email, request);
  sendJson(response, 200, {
    authenticated: true,
    user: buildInfluencerUser(session.user, profile),
    verification: buildInfluencerVerification(profile),
  });
}

function withFastAuthHandler(
  role: "advertiser" | "influencer",
  handler: (request: RequestLike, response: ResponseLike) => Promise<void>,
) {
  return async function fastAuthHandler(request: RequestLike, response: ResponseLike) {
    const startedAt = Date.now();
    response.setHeader("X-Yeollock-Auth-Entrypoint", `fast-${role}`);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Vary", "Cookie");

    if (request.method === "GET" || request.method === "HEAD") {
      await startFastAuthWarmup();
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    if (!checkOrigin(request)) {
      sendJson(response, 403, { error: "허용되지 않은 요청입니다." });
      return;
    }
    try {
      await handler(request, response);
      const status = response.statusCode;
      const outcome: AuthMetricOutcome =
        status >= 200 && status < 300
          ? "success"
          : status === 429
            ? "rate_limited"
            : status === 403
              ? "invalid"
              : status >= 500
                ? "provider_error"
                : "rejected";
      observeOperationalAuthMetric({
        operation: "user_login",
        role: role === "advertiser" ? "marketer" : "influencer",
        outcome,
        latencyMs: Date.now() - startedAt,
        dataOrigin: request.authMetricDataOrigin,
      });
    } catch (error) {
      const status = /Invalid login credentials|invalid/i.test(
        error instanceof Error ? error.message : String(error),
      )
        ? 401
        : 500;
      sendJson(response, status, {
        error:
          status === 401
            ? "로그인에 실패했습니다."
            : "로그인을 처리하지 못했습니다.",
      });
      observeOperationalAuthMetric({
        operation: "user_login",
        role: role === "advertiser" ? "marketer" : "influencer",
        outcome: status === 401 ? "rejected" : "provider_error",
        latencyMs: Date.now() - startedAt,
        dataOrigin: request.authMetricDataOrigin,
      });
    }
  };
}

export const advertiserLoginHandler = withFastAuthHandler(
  "advertiser",
  handleAdvertiserLogin,
);

export const influencerLoginHandler = withFastAuthHandler(
  "influencer",
  handleInfluencerLogin,
);
