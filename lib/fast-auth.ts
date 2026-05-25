import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

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

type MarketplaceProposalDirection =
  | "advertiser_to_influencer"
  | "influencer_to_brand";
type MarketplaceProposalStatus =
  | "submitted"
  | "reviewed"
  | "converted_to_contract"
  | "closed";

interface SupabaseMarketplaceProposalRow {
  id: string;
  direction: MarketplaceProposalDirection;
  status: MarketplaceProposalStatus;
  created_at: string;
}

interface SupabaseMarketplaceBrandProfileRow {
  id: string;
  public_handle?: string | null;
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
const accessMaxAgeSeconds = 60 * 60;
const refreshMaxAgeSeconds = 60 * 60 * 24 * 14;
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET?.trim();
const userSessionFastPathSecret =
  process.env.USER_SESSION_FAST_PATH_SECRET?.trim() || adminSessionSecret;
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

const profileSelectFields = [
  "id",
  "role",
  "name",
  "email",
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

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

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

function consumeRateLimit(request: RequestLike, role: string, email: string) {
  const now = Date.now();
  const ip = getClientIp(request);
  const keys = [`ip:${role}:${ip}`, `email:${role}:${email}`];
  for (const key of keys) {
    const limit = key.startsWith("email:")
      ? publicAuthEmailMaxAttempts
      : publicAuthIpMaxAttempts;
    const attempt = publicAuthAttempts.get(key);
    if (!attempt || attempt.resetAt <= now) {
      publicAuthAttempts.set(key, { count: 1, resetAt: now + publicAuthWindowMs });
      continue;
    }
    if (attempt.count >= limit) {
      return { blocked: true, retryAfter: Math.ceil((attempt.resetAt - now) / 1000) };
    }
    attempt.count += 1;
  }
  return { blocked: false, retryAfter: 0 };
}

function clearRateLimit(role: string, email: string, request: RequestLike) {
  publicAuthAttempts.delete(`ip:${role}:${getClientIp(request)}`);
  publicAuthAttempts.delete(`email:${role}:${email}`);
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

function setSessionCookies(
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
        accessMaxAgeSeconds,
        Math.max(60, Number(session.expires_in ?? accessMaxAgeSeconds)),
      ),
    )}`,
  ];
  if (session.refresh_token) {
    cookies.push(
      `${cookiePrefix}_refresh=${encodeURIComponent(
        session.refresh_token,
      )}; ${cookieOptions(refreshMaxAgeSeconds)}`,
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
  response.setHeader("Set-Cookie", cookies);
}

function getShareTokenCipherKey() {
  if (!shareTokenEncryptionSecret) return undefined;
  return createHash("sha256").update(shareTokenEncryptionSecret).digest();
}

function encryptShareTokenForLegacyStore(value: string | undefined | null) {
  if (!hasText(value)) return undefined;
  if (value.startsWith(shareTokenCipherPrefix)) return value;
  const key = getShareTokenCipherKey();
  if (!key) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${shareTokenCipherPrefix}${payload.toString("base64url")}`;
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
  if (!contract?.evidence?.share_token) return contract;
  return {
    ...contract,
    evidence: {
      ...contract.evidence,
      share_token: encryptShareTokenForLegacyStore(contract.evidence.share_token),
    },
  };
}

async function readProfileByEmail(email: string) {
  const rows = await readSupabaseRows<SupabaseProfileRow>(
    "profiles",
    `?select=${profileSelectFields}&email=eq.${encodeURIComponent(email)}&limit=1`,
    "profile by email",
  );
  return rows[0];
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
    `?select=organization_id,profile_id,role,is_default,organizations(*)&profile_id=eq.${encodeURIComponent(
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
  const requests = await readSupabaseRows<VerificationRequestRecord>(
    "verification_requests",
    `?select=*&target_type=eq.advertiser_organization&verification_type=eq.business_registration_certificate&or=(${orFilters.join(
      ",",
    )})&order=created_at.desc`,
    "advertiser verification",
  );
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

function emptyMessageSummary() {
  return {
    inboxCount: 0,
    sentCount: 0,
    unreadCount: 0,
    submittedCount: 0,
    reviewedCount: 0,
    convertedCount: 0,
    closedCount: 0,
  };
}

function buildMessageSummary(
  role: "advertiser" | "influencer",
  rows: SupabaseMarketplaceProposalRow[],
) {
  return rows.reduce((acc, row) => {
    const isInbox =
      (role === "advertiser" && row.direction === "influencer_to_brand") ||
      (role === "influencer" && row.direction === "advertiser_to_influencer");
    if (isInbox) acc.inboxCount += 1;
    if (!isInbox) acc.sentCount += 1;
    if (isInbox && row.status === "submitted") acc.unreadCount += 1;
    if (row.status === "submitted") acc.submittedCount += 1;
    if (row.status === "reviewed") acc.reviewedCount += 1;
    if (row.status === "converted_to_contract") acc.convertedCount += 1;
    if (row.status === "closed") acc.closedCount += 1;
    return acc;
  }, emptyMessageSummary());
}

async function readAdvertiserMessageSummary(
  profile: SupabaseProfileRow,
  organization?: SupabaseOrganizationRow,
) {
  const sentPromise = readSupabaseRows<SupabaseMarketplaceProposalRow>(
    "marketplace_contact_proposals",
    `?select=id,direction,status,created_at&direction=eq.advertiser_to_influencer&sender_profile_id=eq.${encodeURIComponent(
      profile.id,
    )}&order=created_at.desc`,
    "advertiser sent proposals",
  );
  const brandRows =
    organization?.id
      ? await readSupabaseRows<SupabaseMarketplaceBrandProfileRow>(
          "marketplace_brand_profiles",
          `?select=id,public_handle&organization_id=eq.${encodeURIComponent(
            organization.id,
          )}`,
          "advertiser brand profiles",
        )
      : [];
  const brandIds = brandRows.map((row) => row.id).filter(hasText);
  const incomingPromise =
    brandIds.length > 0
      ? readSupabaseRows<SupabaseMarketplaceProposalRow>(
          "marketplace_contact_proposals",
          `?select=id,direction,status,created_at&direction=eq.influencer_to_brand&target_brand_profile_id=in.${postgrestInFilter(
            brandIds,
          )}&order=created_at.desc`,
          "advertiser incoming proposals",
        )
      : Promise.resolve([] as SupabaseMarketplaceProposalRow[]);
  const rows = [...(await sentPromise), ...(await incomingPromise)];
  return buildMessageSummary("advertiser", rows);
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

function sameUser(profile: SupabaseProfileRow | undefined, user: SupabaseAuthUser) {
  return profile?.id === user.id;
}

async function handleAdvertiserLogin(request: RequestLike, response: ResponseLike) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.includes("@") || !password) {
    sendJson(response, 422, { error: "이메일과 비밀번호를 입력해 주세요." });
    return;
  }
  const throttle = consumeRateLimit(request, "advertiser_login", email);
  if (throttle.blocked) {
    response.setHeader("Retry-After", String(throttle.retryAfter));
    sendJson(response, 429, { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }
  const profilePromise = readProfileByEmail(email).catch(() => undefined);
  const organizationPromise = profilePromise.then((profile) =>
    profile?.role === "marketer" ? readDefaultOrganization(profile.id) : undefined,
  );
  const dashboardPromise = Promise.all([profilePromise, organizationPromise])
    .then(async ([profile, organization]) => {
      if (profile?.role !== "marketer") return undefined;
      const [contracts, verification, messageSummary] = await Promise.all([
        readAdvertiserContracts(profile),
        readAdvertiserVerification(profile, organization),
        readAdvertiserMessageSummary(profile, organization).catch(() =>
          emptyMessageSummary(),
        ),
      ]);
      return {
        contracts,
        verification,
        message_summary: messageSummary,
        source: "supabase",
        allow_local_merge: false,
        demo_mode: false,
      };
    })
    .catch(() => undefined);
  const session = await createSupabasePasswordSession(email, password);
  const profileByEmail = await profilePromise;
  const profile = sameUser(profileByEmail, session.user)
    ? profileByEmail
    : await readProfileByUserId(session.user.id);
  if (profile?.role !== "marketer") {
    sendJson(response, 403, { error: "광고주 계정 권한이 필요합니다." });
    return;
  }
  const [organization, prefetchedDashboard] = sameUser(profileByEmail, session.user)
    ? await Promise.all([organizationPromise, dashboardPromise])
    : [undefined, undefined];
  const resolvedOrganization = organization ?? (await readDefaultOrganization(profile.id));
  const dashboard =
    prefetchedDashboard ?? {
      contracts: await readAdvertiserContracts(profile),
      verification: await readAdvertiserVerification(profile, resolvedOrganization),
      message_summary: await readAdvertiserMessageSummary(
        profile,
        resolvedOrganization,
      ).catch(() => emptyMessageSummary()),
      source: "supabase",
      allow_local_merge: false,
      demo_mode: false,
    };
  setSessionCookies(response, "advertiser", session, profile);
  clearRateLimit("advertiser_login", email, request);
  sendJson(response, 200, {
    authenticated: true,
    user: buildAdvertiserUser(session.user, profile, resolvedOrganization),
    dashboard,
  });
}

async function handleInfluencerLogin(request: RequestLike, response: ResponseLike) {
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email.includes("@") || !password) {
    sendJson(response, 422, { error: "이메일과 비밀번호를 입력해 주세요." });
    return;
  }
  const throttle = consumeRateLimit(request, "influencer_login", email);
  if (throttle.blocked) {
    response.setHeader("Retry-After", String(throttle.retryAfter));
    sendJson(response, 429, { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }
  const profilePromise = readProfileByEmail(email).catch(() => undefined);
  const session = await createSupabasePasswordSession(email, password);
  const profileByEmail = await profilePromise;
  const profile = sameUser(profileByEmail, session.user)
    ? profileByEmail
    : await readProfileByUserId(session.user.id);
  if (profile?.role !== "influencer") {
    sendJson(response, 403, { error: "인플루언서 계정 권한이 필요합니다." });
    return;
  }
  setSessionCookies(response, "influencer", session, profile);
  clearRateLimit("influencer_login", email, request);
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
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    if (!checkOrigin(request)) {
      sendJson(response, 403, { error: "허용되지 않은 요청입니다." });
      return;
    }
    response.setHeader("X-Yeollock-Auth-Entrypoint", `fast-${role}`);
    try {
      await handler(request, response);
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
