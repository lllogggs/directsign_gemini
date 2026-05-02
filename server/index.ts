import express from "express";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { createDemoContracts, createShareToken } from "../src/domain/contracts";
import type { Contract } from "../src/domain/contracts";
import type {
  InfluencerDashboardContract,
  InfluencerDashboardContractStage,
  InfluencerDashboardResponse,
  InfluencerDashboardTask,
} from "../src/domain/influencerDashboard";

dotenv.config({ path: ".env.local" });
dotenv.config();

interface ContractStoreFile {
  contracts: Contract[];
}

type VerificationStatus = "not_submitted" | "pending" | "approved" | "rejected";
type VerificationTargetType =
  | "advertiser_organization"
  | "influencer_account";
type VerificationType =
  | "business_registration_certificate"
  | "platform_account";
type InfluencerPlatform =
  | "instagram"
  | "youtube"
  | "tiktok"
  | "naver_blog"
  | "other";
type InfluencerVerificationMethod =
  | "profile_bio_code"
  | "public_post_code"
  | "channel_description_code"
  | "screenshot_review";
type OwnershipCheckStatus =
  | "not_run"
  | "matched"
  | "not_found"
  | "blocked"
  | "failed";

interface VerificationRequestRecord {
  id: string;
  target_type: VerificationTargetType;
  target_id: string;
  verification_type: VerificationType;
  status: VerificationStatus;
  profile_id?: string;
  organization_id?: string;
  subject_name: string;
  submitted_by_name?: string;
  submitted_by_email?: string;
  business_registration_number?: string;
  representative_name?: string;
  manager_phone?: string;
  platform?: InfluencerPlatform;
  platform_handle?: string;
  platform_url?: string;
  ownership_verification_method?: InfluencerVerificationMethod;
  ownership_challenge_code?: string;
  ownership_challenge_url?: string;
  ownership_check_status?: OwnershipCheckStatus;
  ownership_checked_at?: string;
  document_issue_date?: string;
  document_check_number?: string;
  evidence_file_name?: string;
  evidence_file_mime?: string;
  evidence_file_size?: number;
  evidence_snapshot_json?: Record<string, unknown>;
  note?: string;
  reviewer_note?: string;
  submitted_ip?: string;
  submitted_user_agent?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

interface VerificationStoreFile {
  verification_requests: VerificationRequestRecord[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(root, "data");
const dataFile = path.join(dataDir, "contracts.json");
const verificationDataFile = path.join(dataDir, "verification-requests.json");
const port = Number(process.env.PORT ?? 3000);
const isPreview = process.argv.includes("--preview") || process.env.NODE_ENV === "production";
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const supabaseLegacyTable = process.env.SUPABASE_CONTRACTS_TABLE ?? "directsign_contracts";
const supabaseSchemaVersion = process.env.SUPABASE_SCHEMA_VERSION ?? "v2";
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);
const useSupabaseV2 = useSupabase && supabaseSchemaVersion !== "legacy";
const demoMode = process.env.DIRECTSIGN_DEMO_MODE === "true";
const adminAccessCode = process.env.ADMIN_ACCESS_CODE;
const adminSessionSecret =
  process.env.ADMIN_SESSION_SECRET ?? supabaseServiceRoleKey;
const adminSessionCookie = "directsign_admin_session";
const adminSessionMaxAgeSeconds = 60 * 60 * 8;
const advertiserAccessCookie = "directsign_advertiser_access";
const advertiserRefreshCookie = "directsign_advertiser_refresh";
const influencerAccessCookie = "directsign_influencer_access";
const influencerRefreshCookie = "directsign_influencer_refresh";
const influencerAccessMaxAgeSeconds = 60 * 60;
const influencerRefreshMaxAgeSeconds = 60 * 60 * 24 * 14;
const defaultAdvertiserTargetId =
  process.env.DIRECTSIGN_DEFAULT_ADVERTISER_ID ?? "adv_1";
const defaultInfluencerTargetId =
  process.env.DIRECTSIGN_DEFAULT_INFLUENCER_ID ?? "influencer_guest";
const privateStorageBucket =
  process.env.DIRECTSIGN_PRIVATE_STORAGE_BUCKET ?? "directsign-private";
const privateFilesDir = path.join(dataDir, "private-files");
const signatureConsentVersion = "directsign-signature-consent-v1";

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "10mb" }));

const contractStatuses = new Set(["DRAFT", "REVIEWING", "NEGOTIATING", "APPROVED", "SIGNED"]);
const clauseStatuses = new Set(["APPROVED", "MODIFICATION_REQUESTED", "DELETION_REQUESTED"]);
const shareTokenStatuses = new Set(["not_issued", "active", "expired", "revoked"]);
const pdfStatuses = new Set(["not_ready", "draft_ready", "signed_ready"]);
const verificationStatuses = new Set(["pending", "approved", "rejected"]);
const verificationTargetTypes = new Set([
  "advertiser_organization",
  "influencer_account",
]);
const verificationTypes = new Set([
  "business_registration_certificate",
  "platform_account",
]);
const influencerPlatforms = new Set([
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
]);
const influencerVerificationMethods = new Set([
  "profile_bio_code",
  "public_post_code",
  "channel_description_code",
  "screenshot_review",
]);
const platformUrlHostPatterns: Record<InfluencerPlatform, RegExp[]> = {
  instagram: [/(^|\.)instagram\.com$/],
  youtube: [/(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/],
  tiktok: [/(^|\.)tiktok\.com$/],
  naver_blog: [/(^|\.)blog\.naver\.com$/, /(^|\.)m\.blog\.naver\.com$/],
  other: [],
};
const ownershipChallengePattern = /^DS-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const evidenceFileMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const maxVerificationFileSize = 4 * 1024 * 1024;

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeContract = (contract: Contract): Contract => {
  if (!contract.evidence) return contract;

  const shareToken =
    contract.evidence.share_token_status === "active"
      ? (contract.evidence.share_token ?? createShareToken())
      : undefined;

  return {
    ...contract,
    evidence: {
      ...contract.evidence,
      share_token: shareToken,
    },
  };
};

const normalizeStore = (store: ContractStoreFile): ContractStoreFile => ({
  contracts: store.contracts.map(normalizeContract),
});

interface SupabaseContractRow {
  id: string;
  advertiser_id: string;
  title: string;
  status: string;
  influencer_name?: string | null;
  share_token?: string | null;
  share_token_status: string;
  contract: Contract;
  created_at?: string;
  updated_at?: string;
}

interface SupabaseAuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

interface SupabaseAdminUserResponse {
  id: string;
  email?: string;
}

interface SupabaseAuthSession {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: SupabaseAuthUser;
}

interface SupabaseProfileRow {
  id: string;
  role: "marketer" | "influencer" | "admin";
  name: string;
  email: string;
  company_name?: string | null;
  verification_status?: VerificationStatus | "not_submitted";
  email_verified_at?: string | null;
}

interface SupabaseOrganizationRow {
  id: string;
  name: string;
  organization_type: string;
  business_registration_number?: string | null;
  business_verification_status?: VerificationStatus | "not_submitted";
  representative_name?: string | null;
}

interface SupabaseOrganizationMemberRow {
  organization_id: string;
  profile_id: string;
  role: string;
  is_default?: boolean | null;
}

interface StoredPrivateFile {
  provider: "supabase_storage" | "local_file";
  bucket: string;
  path: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  stored_at: string;
}

interface SupabaseContractV2Row {
  id: string;
  status: "draft" | "negotiating" | "signing" | "active" | "completed" | "cancelled";
  campaign_title: string;
  campaign_summary?: string | null;
  campaign_start_date?: string | null;
  campaign_end_date?: string | null;
  upload_deadline?: string | null;
  review_deadline?: string | null;
  total_fee_amount?: number | string | null;
  total_fee_currency?: string | null;
  pricing_type?: string | null;
  next_actor_role?: string | null;
  next_action?: string | null;
  next_due_at?: string | null;
  signed_at?: string | null;
  completed_at?: string | null;
  legacy_contract_id?: string | null;
  updated_at: string;
}

interface SupabaseContractPartyRow {
  id: string;
  contract_id: string;
  profile_id?: string | null;
  organization_id?: string | null;
  party_role: string;
  display_name: string;
  email?: string | null;
  company_name?: string | null;
  channel_url?: string | null;
}

interface SupabaseContractPlatformRow {
  id: string;
  contract_id: string;
  platform: InfluencerPlatform;
  handle?: string | null;
  url?: string | null;
  is_primary?: boolean | null;
}

interface SupabaseContractPricingTermRow {
  contract_id: string;
  pricing_type: string;
  currency?: string | null;
  fixed_amount?: number | string | null;
  commission_rate_bps?: number | null;
  commission_base?: string | null;
}

interface SupabaseContractClauseRow {
  contract_id: string;
  status: "pending" | "accepted" | "requested_change" | "rejected" | "countered" | "removed";
}

interface SupabaseDeliverableRequirementRow {
  contract_id: string;
}

interface SupabaseDeliverableRow {
  contract_id: string;
  review_status?: string | null;
}

interface SupabasePayoutRow {
  contract_id: string;
  status?: "pending" | "scheduled" | "paid" | "failed" | "cancelled" | null;
}

const requireSupabaseConfig = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase is not configured");
  }

  return {
    url: supabaseUrl,
    key: supabaseServiceRoleKey,
  };
};

const supabaseHeaders = () => {
  const { key } = requireSupabaseConfig();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
};

const supabaseAuthHeaders = (accessToken?: string) => {
  const key = supabasePublishableKey ?? supabaseServiceRoleKey;

  if (!supabaseUrl || !key) {
    throw new Error("Supabase Auth is not configured");
  }

  return {
    apikey: key,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    "Content-Type": "application/json",
  };
};

const supabaseAdminAuthHeaders = () => {
  const { key } = requireSupabaseConfig();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
};

const supabaseStorageHeaders = (contentType?: string) => {
  const { key } = requireSupabaseConfig();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
};

const supabaseRestUrl = (table: string, query = "") => {
  const { url } = requireSupabaseConfig();
  return `${url}/rest/v1/${table}${query}`;
};

const supabaseAuthUrl = (pathName: string) => {
  if (!supabaseUrl) {
    throw new Error("Supabase Auth is not configured");
  }

  return `${supabaseUrl}/auth/v1${pathName}`;
};

const supabaseStorageUrl = (pathName: string) => {
  if (!supabaseUrl) {
    throw new Error("Supabase Storage is not configured");
  }

  return `${supabaseUrl}/storage/v1${pathName}`;
};

const toSupabaseRow = (contract: Contract): SupabaseContractRow => ({
  id: contract.id,
  advertiser_id: contract.advertiser_id,
  title: contract.title,
  status: contract.status,
  influencer_name: contract.influencer_info?.name,
  share_token: contract.evidence?.share_token ?? null,
  share_token_status: contract.evidence?.share_token_status ?? "not_issued",
  contract,
  created_at: contract.created_at,
  updated_at: contract.updated_at,
});

const parseSupabaseError = async (response: Response) => {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? body;
  } catch {
    return body;
  }
};

type SupabaseRequestInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

const fetchSupabase = (table: string, query = "", init: SupabaseRequestInit = {}) =>
  fetch(supabaseRestUrl(table, query), {
    ...init,
    headers: {
      ...supabaseHeaders(),
      ...(init.headers ?? {}),
    },
  });

const assertSupabaseOk = async (response: Response, label: string) => {
  if (!response.ok) {
    throw new Error(
      `${label} failed (${response.status}): ${await parseSupabaseError(response)}`,
    );
  }
};

const readSupabaseRows = async <T>(table: string, query = "", label = table) => {
  const response = await fetchSupabase(table, query);
  await assertSupabaseOk(response, `Supabase ${label} read`);
  return (await response.json()) as T[];
};

const insertSupabaseRowsReturning = async <T>(
  table: string,
  rows: Array<Record<string, unknown>>,
  label = table,
) => {
  const response = await fetchSupabase(table, "", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(normalizeRowsForPostgrest(rows)),
  });
  await assertSupabaseOk(response, `Supabase ${label} insert`);
  return (await response.json()) as T[];
};

const readProfileByUserId = async (userId: string) => {
  if (!useSupabase) return undefined;

  const rows = await readSupabaseRows<SupabaseProfileRow>(
    "profiles",
    `?select=*&id=eq.${encodeURIComponent(userId)}&limit=1`,
    "profile",
  );

  return rows[0];
};

const readDefaultOrganizationForProfile = async (profileId: string) => {
  if (!useSupabase) return undefined;

  const memberships = await readSupabaseRows<SupabaseOrganizationMemberRow>(
    "organization_members",
    `?select=organization_id,profile_id,role,is_default&profile_id=eq.${encodeURIComponent(
      profileId,
    )}&order=is_default.desc&limit=1`,
    "organization membership",
  );
  const organizationId = memberships[0]?.organization_id;

  if (!organizationId) return undefined;

  const organizations = await readSupabaseRows<SupabaseOrganizationRow>(
    "organizations",
    `?select=*&id=eq.${encodeURIComponent(organizationId)}&limit=1`,
    "organization",
  );

  return organizations[0];
};

const isAdvertiserRole = (role: SupabaseProfileRow["role"] | undefined) =>
  role === "marketer" || role === "admin";

const isInfluencerRole = (role: SupabaseProfileRow["role"] | undefined) =>
  role === "influencer";

const requireAdvertiserSession = async (
  request: express.Request,
  response: express.Response,
) => {
  const auth = await authenticateAdvertiserRequest(request, response);

  if (!auth) {
    response.status(401).json({ error: "Advertiser session is required" });
    return undefined;
  }

  const profile = await readProfileByUserId(auth.user.id);

  if (!isAdvertiserRole(profile?.role)) {
    response.status(403).json({ error: "Advertiser account is required" });
    return undefined;
  }

  return { ...auth, profile };
};

const requireInfluencerSession = async (
  request: express.Request,
  response: express.Response,
) => {
  const auth = await authenticateInfluencerRequest(request, response);

  if (!auth) {
    response.status(401).json({ error: "Influencer session is required" });
    return undefined;
  }

  const profile = await readProfileByUserId(auth.user.id);

  if (!isInfluencerRole(profile?.role)) {
    response.status(403).json({ error: "Influencer account is required" });
    return undefined;
  }

  return { ...auth, profile };
};

type AdvertiserSession = NonNullable<
  Awaited<ReturnType<typeof requireAdvertiserSession>>
>;
type InfluencerSession = NonNullable<
  Awaited<ReturnType<typeof requireInfluencerSession>>
>;

const canAdvertiserAccessLegacyContract = (
  auth: AdvertiserSession,
  contract: Contract,
) => {
  if (auth.profile.role === "admin") return true;

  return (
    contract.advertiser_id === defaultAdvertiserTargetId ||
    contract.advertiser_id === auth.profile.id ||
    contract.advertiser_info?.manager === auth.profile.email ||
    contract.advertiser_info?.name === auth.profile.company_name
  );
};

const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const hmacHex = (value: string) => {
  if (!adminSessionSecret) return "";
  return createHmac("sha256", adminSessionSecret).update(value).digest("hex");
};

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const parseCookies = (cookieHeader: string | undefined) => {
  if (!cookieHeader) return new Map<string, string>();

  return new Map(
    cookieHeader.split(";").flatMap((cookie) => {
      const [rawKey, ...rawValue] = cookie.trim().split("=");
      if (!rawKey || rawValue.length === 0) return [];
      return [[rawKey, decodeURIComponent(rawValue.join("="))]];
    }),
  );
};

const createAdminSessionToken = () => {
  const expiresAt = Date.now() + adminSessionMaxAgeSeconds * 1000;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const signature = hmacHex(payload);
  return `${payload}.${signature}`;
};

const verifyAdminSessionToken = (token: string | undefined) => {
  if (!token || !adminSessionSecret) return false;

  const [expiresAt, nonce, signature] = token.split(".");
  if (!expiresAt || !nonce || !signature) return false;
  if (Number(expiresAt) < Date.now()) return false;

  const expectedSignature = hmacHex(`${expiresAt}.${nonce}`);
  return safeEqual(signature, expectedSignature);
};

const isAdminAuthConfigured = () =>
  hasText(adminAccessCode) && hasText(adminSessionSecret);

const adminCookieOptions = () => [
  "HttpOnly",
  "SameSite=Lax",
  "Path=/",
  `Max-Age=${adminSessionMaxAgeSeconds}`,
  isPreview ? "Secure" : "",
].filter(Boolean).join("; ");

const clearAdminCookieOptions = () =>
  [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    isPreview ? "Secure" : "",
  ].filter(Boolean).join("; ");

const influencerCookieOptions = (maxAgeSeconds: number) =>
  [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    isPreview ? "Secure" : "",
  ].filter(Boolean).join("; ");

const clearInfluencerCookieOptions = () =>
  [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    isPreview ? "Secure" : "",
  ].filter(Boolean).join("; ");

const advertiserCookieOptions = (maxAgeSeconds: number) =>
  [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    isPreview ? "Secure" : "",
  ].filter(Boolean).join("; ");

const clearAdvertiserCookieOptions = () =>
  [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    isPreview ? "Secure" : "",
  ].filter(Boolean).join("; ");

const setAdvertiserSessionCookies = (
  response: express.Response,
  session: SupabaseAuthSession,
) => {
  const cookies = [
    `${advertiserAccessCookie}=${encodeURIComponent(
      session.access_token,
    )}; ${advertiserCookieOptions(
      Math.min(
        influencerAccessMaxAgeSeconds,
        Math.max(60, Number(session.expires_in ?? influencerAccessMaxAgeSeconds)),
      ),
    )}`,
  ];

  if (session.refresh_token) {
    cookies.push(
      `${advertiserRefreshCookie}=${encodeURIComponent(
        session.refresh_token,
      )}; ${advertiserCookieOptions(influencerRefreshMaxAgeSeconds)}`,
    );
  }

  response.setHeader("Set-Cookie", cookies);
};

const clearAdvertiserSessionCookies = (response: express.Response) => {
  response.setHeader("Set-Cookie", [
    `${advertiserAccessCookie}=; ${clearAdvertiserCookieOptions()}`,
    `${advertiserRefreshCookie}=; ${clearAdvertiserCookieOptions()}`,
  ]);
};

const setInfluencerSessionCookies = (
  response: express.Response,
  session: SupabaseAuthSession,
) => {
  const cookies = [
    `${influencerAccessCookie}=${encodeURIComponent(
      session.access_token,
    )}; ${influencerCookieOptions(
      Math.min(
        influencerAccessMaxAgeSeconds,
        Math.max(60, Number(session.expires_in ?? influencerAccessMaxAgeSeconds)),
      ),
    )}`,
  ];

  if (session.refresh_token) {
    cookies.push(
      `${influencerRefreshCookie}=${encodeURIComponent(
        session.refresh_token,
      )}; ${influencerCookieOptions(influencerRefreshMaxAgeSeconds)}`,
    );
  }

  response.setHeader("Set-Cookie", cookies);
};

const clearInfluencerSessionCookies = (response: express.Response) => {
  response.setHeader("Set-Cookie", [
    `${influencerAccessCookie}=; ${clearInfluencerCookieOptions()}`,
    `${influencerRefreshCookie}=; ${clearInfluencerCookieOptions()}`,
  ]);
};

const getClientIp = (request: express.Request) => {
  const forwardedFor = request.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.ip || request.socket.remoteAddress || "unknown";
};

const getAdminSessionFromRequest = (request: express.Request) =>
  parseCookies(request.header("cookie")).get(adminSessionCookie);

const getBearerToken = (request: express.Request) => {
  const authorization = request.header("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && hasText(token) ? token : undefined;
};

const fetchSupabaseAuthUser = async (accessToken: string) => {
  const response = await fetch(supabaseAuthUrl("/user"), {
    headers: supabaseAuthHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`Supabase user verification failed (${response.status})`);
  }

  return (await response.json()) as SupabaseAuthUser;
};

const createSupabasePasswordSession = async (
  email: string,
  password: string,
) => {
  const response = await fetch(
    supabaseAuthUrl("/token?grant_type=password"),
    {
      method: "POST",
      headers: supabaseAuthHeaders(),
      body: JSON.stringify({ email, password }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }

  return (await response.json()) as SupabaseAuthSession;
};

const createSupabaseAdminUser = async ({
  email,
  password,
  role,
  name,
  companyName,
}: {
  email: string;
  password: string;
  role: SupabaseProfileRow["role"];
  name: string;
  companyName?: string;
}) => {
  const response = await fetch(supabaseAuthUrl("/admin/users"), {
    method: "POST",
    headers: supabaseAdminAuthHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: {
        name,
        ...(companyName ? { company_name: companyName } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }

  return (await response.json()) as SupabaseAdminUserResponse;
};

const refreshSupabaseSession = async (refreshToken: string) => {
  const response = await fetch(
    supabaseAuthUrl("/token?grant_type=refresh_token"),
    {
      method: "POST",
      headers: supabaseAuthHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }

  return (await response.json()) as SupabaseAuthSession;
};

const authenticateInfluencerRequest = async (
  request: express.Request,
  response?: express.Response,
) => {
  const cookies = parseCookies(request.header("cookie"));
  const bearerToken = getBearerToken(request);
  const cookieAccessToken = cookies.get(influencerAccessCookie);
  const refreshToken = cookies.get(influencerRefreshCookie);
  const accessToken = bearerToken ?? cookieAccessToken;

  if (accessToken) {
    try {
      return {
        user: await fetchSupabaseAuthUser(accessToken),
        accessToken,
      };
    } catch {
      // Try the refresh token below before failing the request.
    }
  }

  if (refreshToken) {
    const session = await refreshSupabaseSession(refreshToken);
    if (response) {
      setInfluencerSessionCookies(response, session);
    }
    return {
      user: session.user,
      accessToken: session.access_token,
    };
  }

  return undefined;
};

const authenticateAdvertiserRequest = async (
  request: express.Request,
  response?: express.Response,
) => {
  const cookies = parseCookies(request.header("cookie"));
  const bearerToken = getBearerToken(request);
  const cookieAccessToken = cookies.get(advertiserAccessCookie);
  const refreshToken = cookies.get(advertiserRefreshCookie);
  const accessToken = bearerToken ?? cookieAccessToken;

  if (accessToken) {
    try {
      return {
        user: await fetchSupabaseAuthUser(accessToken),
        accessToken,
      };
    } catch {
      // Try the refresh token below before failing the request.
    }
  }

  if (refreshToken) {
    const session = await refreshSupabaseSession(refreshToken);
    if (response) {
      setAdvertiserSessionCookies(response, session);
    }
    return {
      user: session.user,
      accessToken: session.access_token,
    };
  }

  return undefined;
};

const requireAdminSession = (
  request: express.Request,
  response: express.Response,
) => {
  if (verifyAdminSessionToken(getAdminSessionFromRequest(request))) {
    return true;
  }

  response.status(401).json({ error: "Admin session is required" });
  return false;
};

const normalizeBusinessRegistrationNumber = (value: string) =>
  value.replace(/\D/g, "");

const isValidBusinessRegistrationNumber = (value: string) => {
  const digits = normalizeBusinessRegistrationNumber(value)
    .split("")
    .map((digit) => Number(digit));

  if (digits.length !== 10 || digits.some((digit) => Number.isNaN(digit))) {
    return false;
  }

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum =
    digits.slice(0, 9).reduce((total, digit, index) => {
      return total + digit * weights[index];
    }, 0) + Math.floor((digits[8] * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === digits[9];
};

const normalizeOptionalText = (value: unknown) =>
  hasText(value) ? value.trim() : undefined;

const normalizeRequiredText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown) =>
  normalizeRequiredText(value).toLowerCase();

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateSignupPassword = (password: string) => {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "비밀번호는 영문과 숫자를 함께 포함해야 합니다.";
  }
  return undefined;
};

const normalizeDateOnlyValue = (value: unknown) => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return undefined;

  const match = normalized.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? normalized : undefined;
};

const normalizeUrlValue = (value: unknown) => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
};

const normalizeChallengeCode = (value: unknown) =>
  normalizeRequiredText(value).toUpperCase();

const isExpectedPlatformUrl = (
  platform: InfluencerPlatform,
  urlValue: string,
) => {
  if (platform === "other") return true;

  try {
    const host = new URL(urlValue).hostname.toLowerCase();
    return platformUrlHostPatterns[platform].some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
};

const checkOwnershipChallenge = async (
  urlValue: string,
  challengeCode: string,
): Promise<{
  status: OwnershipCheckStatus;
  checked_at: string;
  http_status?: number;
  error?: string;
}> => {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(urlValue, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,text/plain,*/*",
        "User-Agent": "DirectSign ownership verifier",
      },
    });
    const body = await response.text();

    if ([401, 403, 429].includes(response.status)) {
      return {
        status: "blocked",
        checked_at: checkedAt,
        http_status: response.status,
      };
    }

    return {
      status: body.includes(challengeCode) ? "matched" : "not_found",
      checked_at: checkedAt,
      http_status: response.status,
    };
  } catch (error) {
    return {
      status: "failed",
      checked_at: checkedAt,
      error: error instanceof Error ? error.message : "Challenge check failed",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const parseEvidenceFile = (value: unknown) => {
  if (!value || typeof value !== "object") return undefined;

  const input = value as {
    name?: unknown;
    type?: unknown;
    size?: unknown;
    data_url?: unknown;
  };
  const name = normalizeRequiredText(input.name);
  const type = normalizeRequiredText(input.type);
  const size = Number(input.size);
  const dataUrl = normalizeRequiredText(input.data_url);

  if (!name || !type || !Number.isFinite(size) || !dataUrl) {
    return undefined;
  }

  return {
    name,
    type,
    size,
    data_url: dataUrl,
  };
};

const validateEvidenceFile = (
  file: ReturnType<typeof parseEvidenceFile> | undefined,
) => {
  if (!file) return "Verification evidence file is required";
  if (!evidenceFileMimeTypes.has(file.type)) {
    return "Only PDF, PNG, JPG, or WebP files are allowed";
  }
  if (file.size <= 0 || file.size > maxVerificationFileSize) {
    return "Verification evidence file must be 4MB or smaller";
  }
  if (!file.data_url.startsWith("data:")) {
    return "Verification evidence file is invalid";
  }

  return undefined;
};

const dataUrlToBuffer = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!match) {
    throw new Error("Evidence file data is invalid");
  }

  const contentType = match[1];
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return { contentType, buffer };
};

const sanitizeStorageSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";

const extensionForMimeType = (mimeType: string) => {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "bin";
};

const buildPrivateStoragePath = ({
  area,
  ownerId,
  fileId,
  fileName,
  mimeType,
}: {
  area: string;
  ownerId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
}) => {
  const extension = extensionForMimeType(mimeType);
  const baseName = sanitizeStorageSegment(fileName.replace(/\.[^.]+$/, ""));
  return `${sanitizeStorageSegment(area)}/${sanitizeStorageSegment(
    ownerId,
  )}/${sanitizeStorageSegment(fileId)}-${baseName}.${extension}`;
};

const ensurePrivateStorageBucket = async () => {
  if (!useSupabase) return;

  const checkResponse = await fetch(
    supabaseStorageUrl(`/bucket/${encodeURIComponent(privateStorageBucket)}`),
    { headers: supabaseStorageHeaders() },
  );

  if (checkResponse.ok) return;
  if (checkResponse.status !== 404) {
    throw new Error(
      `Supabase storage bucket check failed (${checkResponse.status}): ${await checkResponse.text()}`,
    );
  }

  const createResponse = await fetch(supabaseStorageUrl("/bucket"), {
    method: "POST",
    headers: supabaseStorageHeaders("application/json"),
    body: JSON.stringify({
      id: privateStorageBucket,
      name: privateStorageBucket,
      public: false,
      file_size_limit: maxVerificationFileSize,
      allowed_mime_types: Array.from(evidenceFileMimeTypes),
    }),
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(
      `Supabase storage bucket create failed (${createResponse.status}): ${await createResponse.text()}`,
    );
  }
};

const uploadSupabasePrivateFile = async ({
  objectPath,
  contentType,
  buffer,
}: {
  objectPath: string;
  contentType: string;
  buffer: Buffer;
}) => {
  await ensurePrivateStorageBucket();

  const response = await fetch(
    supabaseStorageUrl(
      `/object/${encodeURIComponent(privateStorageBucket)}/${objectPath}`,
    ),
    {
      method: "POST",
      headers: {
        ...supabaseStorageHeaders(contentType),
        "x-upsert": "false",
      },
      body: buffer,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase storage upload failed (${response.status}): ${await response.text()}`,
    );
  }
};

const storePrivateBuffer = async ({
  area,
  ownerId,
  fileId,
  fileName,
  contentType,
  buffer,
}: {
  area: string;
  ownerId: string;
  fileId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
}): Promise<StoredPrivateFile> => {
  const objectPath = buildPrivateStoragePath({
    area,
    ownerId,
    fileId,
    fileName,
    mimeType: contentType,
  });
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storedAt = new Date().toISOString();

  if (useSupabase) {
    try {
      await uploadSupabasePrivateFile({ objectPath, contentType, buffer });
      return {
        provider: "supabase_storage",
        bucket: privateStorageBucket,
        path: objectPath,
        file_name: fileName,
        content_type: contentType,
        byte_size: buffer.byteLength,
        sha256,
        stored_at: storedAt,
      };
    } catch (error) {
      console.warn(
        `[DirectSign] Supabase Storage unavailable, storing private file locally: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  const absolutePath = path.resolve(privateFilesDir, objectPath);
  if (!absolutePath.startsWith(path.resolve(privateFilesDir))) {
    throw new Error("Private file path is invalid");
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    provider: "local_file",
    bucket: "local",
    path: objectPath,
    file_name: fileName,
    content_type: contentType,
    byte_size: buffer.byteLength,
    sha256,
    stored_at: storedAt,
  };
};

const storeEvidenceFile = async ({
  requestId,
  ownerId,
  area,
  file,
}: {
  requestId: string;
  ownerId: string;
  area: string;
  file: NonNullable<ReturnType<typeof parseEvidenceFile>>;
}) => {
  const { contentType, buffer } = dataUrlToBuffer(file.data_url);

  if (contentType !== file.type || !evidenceFileMimeTypes.has(contentType)) {
    throw new Error("Evidence file content type is invalid");
  }
  if (buffer.byteLength <= 0 || buffer.byteLength > maxVerificationFileSize) {
    throw new Error("Evidence file size is invalid");
  }

  return storePrivateBuffer({
    area,
    ownerId,
    fileId: requestId,
    fileName: file.name,
    contentType,
    buffer,
  });
};

const readStoredPrivateFile = async (storedFile: StoredPrivateFile) => {
  if (storedFile.provider === "supabase_storage") {
    const response = await fetch(
      supabaseStorageUrl(
        `/object/${encodeURIComponent(storedFile.bucket)}/${storedFile.path}`,
      ),
      { headers: supabaseStorageHeaders() },
    );

    if (!response.ok) {
      throw new Error(
        `Supabase storage download failed (${response.status}): ${await response.text()}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  const absolutePath = path.resolve(privateFilesDir, storedFile.path);
  if (!absolutePath.startsWith(path.resolve(privateFilesDir))) {
    throw new Error("Private file path is invalid");
  }
  return fs.readFile(absolutePath);
};

const parseStoredPrivateFile = (value: unknown): StoredPrivateFile | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const file = value as Partial<StoredPrivateFile>;
  if (
    (file.provider !== "supabase_storage" && file.provider !== "local_file") ||
    !hasText(file.bucket) ||
    !hasText(file.path) ||
    !hasText(file.file_name) ||
    !hasText(file.content_type) ||
    typeof file.byte_size !== "number" ||
    !hasText(file.sha256) ||
    !hasText(file.stored_at)
  ) {
    return undefined;
  }

  return file as StoredPrivateFile;
};

const buildVerificationEvidenceSnapshot = (
  requestId: string,
  storedFile: StoredPrivateFile | undefined,
  extra: Record<string, unknown>,
) => ({
  ...extra,
  evidence_file: storedFile
    ? {
        ...storedFile,
        download_path: `/api/admin/verification-requests/${requestId}/evidence`,
      }
    : undefined,
});

const buildSignedContractPdf = async ({
  contract,
  signedAt,
  contractHash,
  signatureHash,
  signerName,
  signerEmail,
  clientIp,
}: {
  contract: Contract;
  signedAt: string;
  contractHash: string;
  signatureHash: string;
  signerName: string;
  signerEmail: string;
  clientIp: string;
}) => {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const lines = [
    "DirectSign Signed Contract Record",
    `Contract ID: ${contract.id}`,
    `Title: ${contract.title}`,
    `Advertiser: ${contract.advertiser_info?.name ?? contract.advertiser_id}`,
    `Influencer: ${contract.influencer_info.name}`,
    `Signer: ${signerName}`,
    `Signer Email: ${signerEmail}`,
    `Signed At: ${signedAt}`,
    `Signed IP: ${clientIp}`,
    `Contract Hash: ${contractHash}`,
    `Signature Hash: ${signatureHash}`,
    `Consent Version: ${signatureConsentVersion}`,
  ];

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(lines[0], 40, 48);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  lines.slice(1).forEach((line, index) => {
    pdf.text(line.slice(0, 110), 40, 84 + index * 18);
  });

  return Buffer.from(pdf.output("arraybuffer"));
};

const stableUuid = (seed: string) => {
  const chars = sha256Hex(seed).slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const toDateOnly = (value: string | undefined) => {
  if (!hasText(value)) return undefined;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
};

const toIsoDateTime = (value: string | undefined) => {
  if (!hasText(value)) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

const parseMoneyAmount = (value: string | undefined) => {
  if (!hasText(value) || value.includes("%")) return undefined;
  const numeric = value.replace(/[^\d.-]/g, "");
  if (!numeric) return undefined;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseCommissionBps = (value: string | undefined) => {
  if (!hasText(value)) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return undefined;
  return Math.round(Number(match[1]) * 100);
};

const inferPricingType = (fixedAmount: number | undefined, commissionBps: number | undefined) => {
  if (fixedAmount !== undefined && commissionBps !== undefined) return "fixed_plus_commission";
  if (commissionBps !== undefined) return "commission";
  if (fixedAmount !== undefined) return "fixed_fee";
  return "custom";
};

const mapContractStatusToV2 = (status: Contract["status"]) => {
  const statuses: Record<Contract["status"], string> = {
    DRAFT: "draft",
    REVIEWING: "negotiating",
    NEGOTIATING: "negotiating",
    APPROVED: "signing",
    SIGNED: "completed",
  };

  return statuses[status];
};

const mapClauseStatusToV2 = (status: Contract["clauses"][number]["status"]) => {
  const statuses: Record<Contract["clauses"][number]["status"], string> = {
    APPROVED: "accepted",
    MODIFICATION_REQUESTED: "requested_change",
    DELETION_REQUESTED: "requested_change",
  };

  return statuses[status];
};

type WorkflowNextActor = NonNullable<Contract["workflow"]>["next_actor"];
type ContractPlatformValue = NonNullable<NonNullable<Contract["campaign"]>["platforms"]>[number];

const mapActorToPartyRole = (actor: WorkflowNextActor | undefined) => {
  if (actor === "advertiser") return "advertiser";
  if (actor === "influencer") return "influencer";
  return undefined;
};

const mapPlatformToV2 = (platform: ContractPlatformValue) => {
  const platforms: Record<string, string> = {
    NAVER_BLOG: "naver_blog",
    YOUTUBE: "youtube",
    INSTAGRAM: "instagram",
    TIKTOK: "tiktok",
    OTHER: "other",
  };

  return platforms[platform] ?? "other";
};

const inferDeliverableType = (text: string) => {
  const normalized = text.toLowerCase();
  if (normalized.includes("reels") || normalized.includes("릴스")) return "reels";
  if (normalized.includes("shorts") || normalized.includes("쇼츠")) return "shorts";
  if (normalized.includes("video") || normalized.includes("영상")) return "video";
  if (normalized.includes("story") || normalized.includes("스토리")) return "story";
  if (normalized.includes("live") || normalized.includes("라이브")) return "live";
  if (normalized.includes("blog") || normalized.includes("블로그")) return "blog";
  return "post";
};

const deleteSupabaseV2Rows = async (table: string, query: string) => {
  const response = await fetchSupabase(table, query, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await assertSupabaseOk(response, `Supabase ${table} cleanup`);
};

const normalizeRowsForPostgrest = (rows: Array<Record<string, unknown>>) => {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return rows.map((row) =>
    Object.fromEntries(keys.map((key) => [key, row[key] ?? null])),
  );
};

const upsertSupabaseV2Rows = async (
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict = "id",
) => {
  if (rows.length === 0) return;

  const response = await fetchSupabase(table, `?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(normalizeRowsForPostgrest(rows)),
  });
  await assertSupabaseOk(response, `Supabase ${table} upsert`);
};

const insertSupabaseV2RowsIgnoringDuplicates = async (
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict = "id",
) => {
  if (rows.length === 0) return;

  const response = await fetchSupabase(table, `?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(normalizeRowsForPostgrest(rows)),
  });
  await assertSupabaseOk(response, `Supabase ${table} insert`);
};

const readSupabaseStore = async (): Promise<ContractStoreFile> => {
  const response = await fetchSupabase(
    supabaseLegacyTable,
    "?select=contract&order=updated_at.desc",
  );

  await assertSupabaseOk(response, "Supabase legacy read");

  const rows = (await response.json()) as Array<{ contract: Contract }>;

  return normalizeStore({
    contracts: rows
      .map((row) => row.contract)
      .filter((contract): contract is Contract => Boolean(contract?.id)),
  });
};

const upsertSupabaseContracts = async (contracts: Contract[]) => {
  if (contracts.length === 0) return;

  const response = await fetchSupabase(supabaseLegacyTable, "?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(contracts.map((contract) => toSupabaseRow(contract))),
  });

  await assertSupabaseOk(response, "Supabase legacy write");
};

const inferPlatformFromUrl = (url: string | undefined): ContractPlatformValue | undefined => {
  if (!hasText(url)) return undefined;
  const normalized = url.toLowerCase();
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "YOUTUBE";
  if (normalized.includes("instagram.com")) return "INSTAGRAM";
  if (normalized.includes("tiktok.com")) return "TIKTOK";
  if (normalized.includes("blog.naver.com")) return "NAVER_BLOG";
  return undefined;
};

type AuditActor = NonNullable<Contract["audit_events"]>[number]["actor"];

const actorDisplayName = (contract: Contract, actor: AuditActor) => {
  if (actor === "advertiser") {
    return contract.advertiser_info?.manager ?? contract.advertiser_info?.name;
  }

  if (actor === "influencer") {
    return contract.influencer_info.name;
  }

  return "DirectSign";
};

const syncSupabaseV2Contract = async (contract: Contract) => {
  if (!isUuid(contract.id)) {
    console.warn(
      `[DirectSign] skipped Supabase v2 sync for non-UUID contract id: ${contract.id}`,
    );
    return;
  }

  const fixedAmount = parseMoneyAmount(contract.campaign?.budget);
  const commissionBps = parseCommissionBps(contract.campaign?.budget);
  const pricingType = inferPricingType(fixedAmount, commissionBps);
  const contractIdFilter = `?contract_id=eq.${encodeURIComponent(contract.id)}`;
  const platforms =
    contract.campaign?.platforms?.length
      ? contract.campaign.platforms
      : ([inferPlatformFromUrl(contract.influencer_info.channel_url) ?? "OTHER"] as ContractPlatformValue[]);

  await upsertSupabaseV2Rows("contracts", [
    {
      id: contract.id,
      legacy_contract_id: contract.id,
      status: mapContractStatusToV2(contract.status),
      campaign_title: contract.title,
      campaign_summary: contract.workflow?.last_message,
      campaign_start_date: toDateOnly(contract.campaign?.start_date),
      campaign_end_date: toDateOnly(contract.campaign?.end_date),
      upload_deadline: toDateOnly(
        contract.campaign?.upload_due_at ?? contract.campaign?.deadline,
      ),
      review_deadline: toDateOnly(contract.campaign?.review_due_at),
      total_fee_amount: fixedAmount,
      total_fee_currency: "KRW",
      pricing_type: pricingType,
      next_actor_role: mapActorToPartyRole(contract.workflow?.next_actor),
      next_action: contract.workflow?.next_action,
      next_due_at: toIsoDateTime(contract.workflow?.due_at),
      version_no: Math.max(1, (contract.audit_events?.length ?? 0) + 1),
      signed_at:
        contract.status === "SIGNED"
          ? toIsoDateTime(contract.signature_data?.signed_at ?? contract.updated_at)
          : undefined,
      completed_at:
        contract.status === "SIGNED"
          ? toIsoDateTime(contract.signature_data?.signed_at ?? contract.updated_at)
          : undefined,
      created_at: toIsoDateTime(contract.created_at),
      updated_at: toIsoDateTime(contract.updated_at),
    },
  ]);

  for (const table of [
    "clause_threads",
    "deliverable_requirements",
    "contract_clauses",
    "contract_platforms",
    "share_links",
  ]) {
    await deleteSupabaseV2Rows(table, contractIdFilter);
  }

  const advertiserPartyId = stableUuid(`${contract.id}:party:advertiser`);
  const influencerPartyId = stableUuid(`${contract.id}:party:influencer`);

  await upsertSupabaseV2Rows("contract_parties", [
    {
      id: advertiserPartyId,
      contract_id: contract.id,
      party_role: "advertiser",
      display_name:
        contract.advertiser_info?.name ?? contract.advertiser_info?.manager ?? "광고주",
      company_name: contract.advertiser_info?.name,
      is_primary_signer: true,
      invited_at: toIsoDateTime(contract.created_at),
    },
    {
      id: influencerPartyId,
      contract_id: contract.id,
      party_role: "influencer",
      display_name: contract.influencer_info.name,
      email: contract.influencer_info.contact,
      channel_url: contract.influencer_info.channel_url,
      is_primary_signer: true,
      invited_at: toIsoDateTime(contract.created_at),
      accepted_at:
        contract.status === "SIGNED"
          ? toIsoDateTime(contract.signature_data?.signed_at ?? contract.updated_at)
          : undefined,
    },
  ]);

  const platformRows = platforms.map((platform, index) => ({
    id: stableUuid(`${contract.id}:platform:${platform}:${index}`),
    contract_id: contract.id,
    platform: mapPlatformToV2(platform),
    url: index === 0 ? contract.influencer_info.channel_url : undefined,
    is_primary: index === 0,
  }));

  await upsertSupabaseV2Rows("contract_platforms", platformRows);

  await upsertSupabaseV2Rows("contract_pricing_terms", [
    {
      id: stableUuid(`${contract.id}:pricing`),
      contract_id: contract.id,
      pricing_type: pricingType,
      currency: "KRW",
      fixed_amount: fixedAmount,
      commission_rate_bps: commissionBps,
      commission_base: commissionBps !== undefined ? "gross_sales" : undefined,
      vat_included: true,
      settlement_cycle: "campaign_end",
      payment_due_type: "after_invoice",
      payment_due_days: 7,
      notes: contract.campaign?.budget,
    },
  ]);

  const clauseRows = contract.clauses.map((clause, index) => {
    const lastHistory = clause.history.at(-1);

    return {
      id: stableUuid(`${contract.id}:clause:${clause.clause_id}`),
      contract_id: contract.id,
      order_no: index + 1,
      clause_type: clause.clause_id,
      title: clause.category,
      body: clause.content,
      status: mapClauseStatusToV2(clause.status),
      requested_by_role: lastHistory ? mapActorToPartyRole(lastHistory.role) : undefined,
      resolved_at:
        clause.status === "APPROVED" && lastHistory
          ? toIsoDateTime(lastHistory.timestamp)
          : undefined,
      locked_at: contract.status === "SIGNED" ? toIsoDateTime(contract.updated_at) : undefined,
      version_no: Math.max(1, clause.history.length + 1),
      created_at: toIsoDateTime(contract.created_at),
      updated_at: toIsoDateTime(contract.updated_at),
    };
  });

  await upsertSupabaseV2Rows("contract_clauses", clauseRows);

  const threadRows = contract.clauses.flatMap((clause) =>
    clause.history.map((history, index) => {
      const action = history.action.toLowerCase();
      const status = action.includes("accept") || history.action.includes("수락")
        ? "accepted"
        : action.includes("reject") || history.action.includes("거절")
          ? "rejected"
          : "open";

      return {
        id: stableUuid(`${contract.id}:thread:${clause.clause_id}:${history.id}:${index}`),
        contract_id: contract.id,
        clause_id: stableUuid(`${contract.id}:clause:${clause.clause_id}`),
        actor_role: mapActorToPartyRole(history.role) ?? "influencer",
        status,
        action_type: history.action,
        original_text: clause.content,
        message: history.comment,
        created_at: toIsoDateTime(history.timestamp),
        updated_at: toIsoDateTime(history.timestamp),
      };
    }),
  );

  await upsertSupabaseV2Rows("clause_threads", threadRows);

  const deliverableRows = (contract.campaign?.deliverables ?? []).map((deliverable, index) => {
    const quantityMatch = deliverable.match(/(\d+)/);
    const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1;

    return {
      id: stableUuid(`${contract.id}:deliverable-requirement:${index}:${deliverable}`),
      contract_id: contract.id,
      platform_id: platformRows[0]?.id,
      deliverable_type: inferDeliverableType(deliverable),
      title: deliverable,
      description: deliverable,
      quantity,
      due_at: toIsoDateTime(contract.campaign?.upload_due_at ?? contract.campaign?.deadline),
      review_required: true,
      evidence_required: true,
      order_no: index + 1,
    };
  });

  await upsertSupabaseV2Rows("deliverable_requirements", deliverableRows);

  if (
    contract.evidence?.share_token &&
    contract.evidence.share_token_status !== "not_issued"
  ) {
    await upsertSupabaseV2Rows("share_links", [
      {
        id: stableUuid(`${contract.id}:share:${contract.evidence.share_token}`),
        contract_id: contract.id,
        token_hash: sha256Hex(contract.evidence.share_token),
        scope:
          contract.status === "APPROVED" || contract.status === "SIGNED"
            ? "sign"
            : "review",
        status: contract.evidence.share_token_status,
        expires_at: toIsoDateTime(contract.evidence.share_token_expires_at),
        revoked_at:
          contract.evidence.share_token_status === "revoked"
            ? toIsoDateTime(contract.updated_at)
            : undefined,
      },
    ]);
  }

  const signedAt = toIsoDateTime(contract.signature_data?.signed_at);
  const signatureRows: Array<Record<string, unknown>> = [];

  if (contract.signature_data && signedAt) {
    const snapshotId = stableUuid(`${contract.id}:snapshot:signed:1`);
    const snapshotBodyHash = sha256Hex(
      JSON.stringify({
        title: contract.title,
        clauses: contract.clauses,
        signature_data: contract.signature_data,
      }),
    );

    await upsertSupabaseV2Rows("contract_snapshots", [
      {
        id: snapshotId,
        contract_id: contract.id,
        version_no: 1,
        snapshot_type: "signed",
        snapshot_json: contract,
        body_hash: snapshotBodyHash,
        pdf_hash: contract.signature_data.signed_pdf_hash,
        storage_path: contract.signature_data.signed_pdf_path,
        created_at: signedAt,
      },
    ]);

    if (hasText(contract.signature_data.adv_sign)) {
      signatureRows.push({
        id: stableUuid(`${contract.id}:signature:advertiser`),
        contract_id: contract.id,
        signed_snapshot_id: snapshotId,
        signer_party_id: advertiserPartyId,
        signer_role: "advertiser",
        signer_name:
          contract.advertiser_info?.manager ?? contract.advertiser_info?.name ?? "광고주",
        signature_hash: sha256Hex(contract.signature_data.adv_sign),
        signature_storage_path: contract.signature_data.signature_storage_path,
        signed_ip: hasText(contract.signature_data.ip)
          ? contract.signature_data.ip
          : undefined,
        signed_user_agent: contract.signature_data.user_agent,
        consent_text_version: contract.signature_data.consent_text_version,
        signed_at: signedAt,
      });
    }

    if (hasText(contract.signature_data.inf_sign)) {
      signatureRows.push({
        id: stableUuid(`${contract.id}:signature:influencer`),
        contract_id: contract.id,
        signed_snapshot_id: snapshotId,
        signer_party_id: influencerPartyId,
        signer_role: "influencer",
        signer_name: contract.influencer_info.name,
        signer_email: contract.influencer_info.contact,
        signature_hash:
          contract.signature_data.signature_hash ??
          sha256Hex(contract.signature_data.inf_sign),
        signature_storage_path: contract.signature_data.signature_storage_path,
        signed_ip: hasText(contract.signature_data.ip)
          ? contract.signature_data.ip
          : undefined,
        signed_user_agent: contract.signature_data.user_agent,
        consent_text_version: contract.signature_data.consent_text_version,
        signed_at: signedAt,
      });
    }
  }

  await upsertSupabaseV2Rows("signatures", signatureRows);

  const eventRows = (contract.audit_events ?? []).map((event) => ({
    id: stableUuid(`${contract.id}:event:${event.id}`),
    contract_id: contract.id,
    actor_role: event.actor,
    actor_display_name: actorDisplayName(contract, event.actor),
    event_type: event.action || "audit_event",
    target_type: event.related_clause_id ? "contract_clause" : "contract",
    target_id: event.related_clause_id
      ? stableUuid(`${contract.id}:clause:${event.related_clause_id}`)
      : contract.id,
    payload: {
      legacy_event_id: event.id,
      description: event.description,
      related_clause_id: event.related_clause_id,
    },
    created_at: toIsoDateTime(event.created_at),
  }));

  await insertSupabaseV2RowsIgnoringDuplicates("contract_events", eventRows);
};

const syncSupabaseV2Contracts = async (contracts: Contract[]) => {
  for (const contract of contracts) {
    await syncSupabaseV2Contract(contract);
  }
};

const validateContractPayload = (contract: Contract) => {
  if (!hasText(contract.id)) return "Contract id is required";
  if (!hasText(contract.advertiser_id)) return "Advertiser id is required";
  if (!contractStatuses.has(contract.status)) return "Invalid contract status";
  if (!hasText(contract.title)) return "Contract title is required";
  if (!hasText(contract.influencer_info?.name)) {
    return "Influencer name is required";
  }
  if (!Array.isArray(contract.clauses) || contract.clauses.length === 0) {
    return "At least one clause is required";
  }

  for (const clause of contract.clauses) {
    if (!hasText(clause.clause_id)) return "Clause id is required";
    if (!hasText(clause.category)) return "Clause category is required";
    if (!hasText(clause.content)) return "Clause content is required";
    if (!clauseStatuses.has(clause.status)) return "Invalid clause status";
    if (!Array.isArray(clause.history)) return "Clause history must be an array";
  }

  if (contract.evidence) {
    if (!shareTokenStatuses.has(contract.evidence.share_token_status)) {
      return "Invalid share token status";
    }
    if (!pdfStatuses.has(contract.evidence.pdf_status)) {
      return "Invalid PDF status";
    }
    if (contract.evidence.share_token_status === "active" && !hasText(contract.evidence.share_token)) {
      return "Active share links require a share token";
    }
  }

  return undefined;
};

const jsonEqual = (left: unknown, right: unknown) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const verifyInfluencerContractWriteAccess = (
  request: express.Request,
  existing: Contract | undefined,
  incoming: Contract,
) => {
  if (!existing) {
    return "Influencer cannot create contracts";
  }

  const shareAccessError = verifyInfluencerShareAccess(request, existing);

  if (shareAccessError) {
    return shareAccessError;
  }

  if (incoming.status === "DRAFT") {
    return "Influencer cannot revoke shared contracts";
  }

  if (incoming.status === "SIGNED") {
    return "Influencer signatures must be submitted through the signing endpoint";
  }

  if (incoming.advertiser_id !== existing.advertiser_id) {
    return "Advertiser ownership cannot be changed";
  }

  if (incoming.title !== existing.title || incoming.type !== existing.type) {
    return "Contract summary cannot be changed by influencer";
  }

  if (!jsonEqual(incoming.advertiser_info, existing.advertiser_info)) {
    return "Advertiser information cannot be changed by influencer";
  }

  if (!jsonEqual(incoming.influencer_info, existing.influencer_info)) {
    return "Influencer identity cannot be changed through contract review";
  }

  if (!jsonEqual(incoming.campaign, existing.campaign)) {
    return "Campaign terms cannot be changed by influencer";
  }

  if (!jsonEqual(incoming.signature_data, existing.signature_data)) {
    return "Signature data must be submitted through the signing endpoint";
  }

  if (incoming.pdf_url !== existing.pdf_url) {
    return "PDF evidence cannot be changed by influencer";
  }

  if (incoming.clauses.length !== existing.clauses.length) {
    return "Contract clauses cannot be added or removed by influencer";
  }

  for (const existingClause of existing.clauses) {
    const incomingClause = incoming.clauses.find(
      (clause) => clause.clause_id === existingClause.clause_id,
    );

    if (!incomingClause) {
      return "Contract clauses cannot be removed by influencer";
    }

    if (
      incomingClause.category !== existingClause.category ||
      incomingClause.content !== existingClause.content
    ) {
      return "Clause text cannot be changed by influencer";
    }
  }

  const existingAuditEvents = existing.audit_events ?? [];
  const incomingAuditEvents = incoming.audit_events ?? [];

  if (incomingAuditEvents.length < existingAuditEvents.length) {
    return "Audit events cannot be removed";
  }

  for (let index = 0; index < existingAuditEvents.length; index += 1) {
    if (!jsonEqual(incomingAuditEvents[index], existingAuditEvents[index])) {
      return "Audit history cannot be rewritten";
    }
  }

  const appendedEvents = incomingAuditEvents.slice(existingAuditEvents.length);

  if (appendedEvents.some((event) => event.actor !== "influencer")) {
    return "Influencer review can only append influencer audit events";
  }

  const expectedToken = existing.evidence?.share_token;

  if (incoming.evidence?.share_token && incoming.evidence.share_token !== expectedToken) {
    return "Share token cannot be changed by influencer";
  }

  if (!jsonEqual(incoming.evidence, existing.evidence)) {
    return "Contract evidence cannot be changed by influencer";
  }

  return undefined;
};

const verifyInfluencerShareAccess = (
  request: express.Request,
  existing: Contract,
) => {
  const expectedToken = existing.evidence?.share_token;
  const providedToken =
    request.header("X-DirectSign-Share-Token") ??
    normalizeOptionalText(request.query.token);

  if (
    existing.evidence?.share_token_status !== "active" ||
    !hasText(expectedToken) ||
    providedToken !== expectedToken
  ) {
    return "Valid share token is required";
  }

  if (
    existing.evidence.share_token_expires_at &&
    new Date(existing.evidence.share_token_expires_at).getTime() < Date.now()
  ) {
    return "Share token has expired";
  }

  return undefined;
};

const normalizeVerificationRequest = (
  record: VerificationRequestRecord,
): VerificationRequestRecord => ({
  ...record,
  evidence_snapshot_json: record.evidence_snapshot_json ?? {},
});

const readSupabaseVerificationRequests = async () => {
  const response = await fetchSupabase(
    "verification_requests",
    "?select=*&order=created_at.desc",
  );

  await assertSupabaseOk(response, "Supabase verification read");

  const rows = (await response.json()) as VerificationRequestRecord[];
  return rows.map(normalizeVerificationRequest);
};

const patchSupabaseRecord = async (
  table: string,
  query: string,
  updates: Record<string, unknown>,
  label: string,
) => {
  if (!useSupabase) return;

  const response = await fetchSupabase(table, query, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(updates),
  });

  await assertSupabaseOk(response, label);
};

const readVerificationRequests = async (): Promise<VerificationRequestRecord[]> => {
  if (useSupabase) {
    return readSupabaseVerificationRequests();
  }

  try {
    const contents = await fs.readFile(verificationDataFile, "utf8");
    const parsed = JSON.parse(contents) as VerificationStoreFile;

    if (!Array.isArray(parsed.verification_requests)) {
      throw new Error("Invalid verification store");
    }

    return parsed.verification_requests.map(normalizeVerificationRequest);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      console.warn(`[DirectSign] resetting invalid verification store: ${code}`);
    }

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      verificationDataFile,
      JSON.stringify({ verification_requests: [] }, null, 2),
      "utf8",
    );
    return [];
  }
};

const writeVerificationRequests = async (
  verificationRequests: VerificationRequestRecord[],
) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${verificationDataFile}.tmp`;
  await fs.writeFile(
    tempFile,
    JSON.stringify({ verification_requests: verificationRequests }, null, 2),
    "utf8",
  );
  await fs.rename(tempFile, verificationDataFile);
};

const applyVerificationStatusSideEffects = async (
  record: VerificationRequestRecord,
) => {
  if (!useSupabase) return;

  const reviewedAt =
    record.status === "approved" || record.status === "rejected"
      ? (record.reviewed_at ?? record.updated_at)
      : undefined;

  if (record.profile_id) {
    await patchSupabaseRecord(
      "profiles",
      `?id=eq.${encodeURIComponent(record.profile_id)}`,
      {
        verification_status: record.status,
        updated_at: record.updated_at,
      },
      "Supabase profile verification status update",
    );
  }

  if (record.organization_id) {
    await patchSupabaseRecord(
      "organizations",
      `?id=eq.${encodeURIComponent(record.organization_id)}`,
      {
        business_verification_status: record.status,
        business_verified_at: record.status === "approved" ? reviewedAt : null,
        business_verification_request_id: record.id,
        representative_name: record.representative_name,
        updated_at: record.updated_at,
      },
      "Supabase organization verification status update",
    );
  }
};

const insertVerificationRequest = async (record: VerificationRequestRecord) => {
  const normalizedRecord = normalizeVerificationRequest(record);

  if (useSupabase) {
    const response = await fetchSupabase("verification_requests", "", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(normalizedRecord),
    });

    await assertSupabaseOk(response, "Supabase verification insert");
    const rows = (await response.json()) as VerificationRequestRecord[];
    const insertedRecord = normalizeVerificationRequest(rows[0] ?? normalizedRecord);
    await applyVerificationStatusSideEffects(insertedRecord);
    return insertedRecord;
  }

  const verificationRequests = await readVerificationRequests();
  await writeVerificationRequests([normalizedRecord, ...verificationRequests]);
  return normalizedRecord;
};

const updateVerificationRequestReview = async ({
  id,
  status,
  reviewerNote,
  reviewedByName,
}: {
  id: string;
  status: VerificationStatus;
  reviewerNote?: string;
  reviewedByName?: string;
}) => {
  const reviewedAt = new Date().toISOString();
  const updates = {
    status,
    reviewer_note: reviewerNote,
    reviewed_by_name: reviewedByName,
    reviewed_at: reviewedAt,
    updated_at: reviewedAt,
  };

  if (useSupabase) {
    const response = await fetchSupabase(
      "verification_requests",
      `?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(updates),
      },
    );

    await assertSupabaseOk(response, "Supabase verification update");
    const rows = (await response.json()) as VerificationRequestRecord[];
    const updatedRecord = rows[0] ? normalizeVerificationRequest(rows[0]) : undefined;
    if (updatedRecord) {
      await applyVerificationStatusSideEffects(updatedRecord);
    }
    return updatedRecord;
  }

  const verificationRequests = await readVerificationRequests();
  let updatedRecord: VerificationRequestRecord | undefined;
  const nextRequests = verificationRequests.map((record) => {
    if (record.id !== id) return record;
    updatedRecord = normalizeVerificationRequest({ ...record, ...updates });
    return updatedRecord;
  });

  await writeVerificationRequests(nextRequests);
  return updatedRecord;
};

const latestVerificationForTarget = (
  requests: VerificationRequestRecord[],
  targetType: VerificationTargetType,
  targetId: string,
) =>
  requests
    .filter(
      (record) =>
        record.target_type === targetType && record.target_id === targetId,
    )
    .sort((a, b) => parseDateDescending(a.created_at, b.created_at))[0];

const parseDateDescending = (a: string, b: string) => {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
};

const buildVerificationSummary = async (
  advertiserTargetId = defaultAdvertiserTargetId,
  influencerTargetId = defaultInfluencerTargetId,
) => {
  const requests = await readVerificationRequests();
  const advertiserLatest = latestVerificationForTarget(
    requests,
    "advertiser_organization",
    advertiserTargetId,
  );
  const influencerLatest = latestVerificationForTarget(
    requests,
    "influencer_account",
    influencerTargetId,
  );

  return {
    advertiser: {
      target_type: "advertiser_organization",
      target_id: advertiserTargetId,
      status: advertiserLatest?.status ?? "not_submitted",
      latest_request: advertiserLatest,
    },
    influencer: {
      target_type: "influencer_account",
      target_id: influencerTargetId,
      status: influencerLatest?.status ?? "not_submitted",
      latest_request: influencerLatest,
    },
  };
};

const emptyVerificationProfile = (
  targetType: VerificationTargetType,
  targetId: string,
) => ({
  target_type: targetType,
  target_id: targetId,
  status: "not_submitted" as const,
});

const buildAdvertiserVerificationContext = async (auth: AdvertiserSession) => {
  const organization = await readDefaultOrganizationForProfile(auth.profile.id);

  return {
    // Legacy contracts still use adv_1. Keep the public target stable while
    // binding submissions to the authenticated profile/org columns.
    targetId: defaultAdvertiserTargetId,
    profileId: auth.profile.id,
    organizationId: organization?.id,
    subjectName:
      organization?.name ??
      auth.profile.company_name ??
      auth.profile.name ??
      "Advertiser",
    submittedByName: auth.profile.name,
    submittedByEmail: auth.profile.email ?? auth.user.email ?? "",
  };
};

const buildAdvertiserScopedVerificationSummary = async (
  auth: AdvertiserSession,
) => {
  const context = await buildAdvertiserVerificationContext(auth);
  const requests = await readVerificationRequests();
  const advertiserLatest = latestVerificationForTarget(
    requests,
    "advertiser_organization",
    context.targetId,
  );

  return {
    advertiser: {
      target_type: "advertiser_organization" as const,
      target_id: context.targetId,
      status:
        advertiserLatest?.status ??
        auth.profile.verification_status ??
        "not_submitted",
      latest_request: advertiserLatest,
    },
    influencer: emptyVerificationProfile(
      "influencer_account",
      defaultInfluencerTargetId,
    ),
  };
};

const buildInfluencerScopedVerificationSummary = async (
  auth: InfluencerSession,
) => {
  const userEmail = (auth.profile.email ?? auth.user.email ?? "").trim().toLowerCase();
  const requests = (await readVerificationRequests()).filter(
    (request) =>
      request.target_type === "influencer_account" &&
      (request.profile_id === auth.profile.id ||
        request.target_id === auth.profile.id ||
        request.submitted_by_email?.trim().toLowerCase() === userEmail),
  );
  const influencerLatest = requests.sort((a, b) =>
    parseDateDescending(a.created_at, b.created_at),
  )[0];

  return {
    advertiser: emptyVerificationProfile(
      "advertiser_organization",
      defaultAdvertiserTargetId,
    ),
    influencer: {
      target_type: "influencer_account" as const,
      target_id: auth.profile.id,
      status:
        influencerLatest?.status ??
        auth.profile.verification_status ??
        "not_submitted",
      latest_request: influencerLatest,
    },
  };
};

const isAdvertiserTargetApproved = async (advertiserTargetId: string) => {
  const requests = await readVerificationRequests();
  const latest = latestVerificationForTarget(
    requests,
    "advertiser_organization",
    advertiserTargetId,
  );

  return latest?.status === "approved";
};

const isContractSendAttempt = (
  existing: Contract | undefined,
  incoming: Contract,
) => {
  const newShareLinkIssued =
    incoming.evidence?.share_token_status === "active" &&
    existing?.evidence?.share_token_status !== "active";
  const movingOutOfDraft =
    incoming.status !== "DRAFT" && (!existing || existing.status === "DRAFT");

  return newShareLinkIssued || movingOutOfDraft;
};

const postgrestInFilter = (values: string[]) =>
  `(${values.map((value) => encodeURIComponent(value)).join(",")})`;

const uniqueRowsById = <T extends { id: string }>(rows: T[]) =>
  Array.from(new Map(rows.map((row) => [row.id, row])).values());

const groupByContractId = <T extends { contract_id: string }>(rows: T[]) => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    grouped.set(row.contract_id, [...(grouped.get(row.contract_id) ?? []), row]);
  }
  return grouped;
};

const dashboardPlatformLabels: Record<InfluencerPlatform, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  naver_blog: "Naver Blog",
  other: "Other",
};

const normalizeInfluencerPlatform = (value: string | undefined | null): InfluencerPlatform =>
  influencerPlatforms.has(value ?? "") ? (value as InfluencerPlatform) : "other";

const formatKoreanDate = (value: string | undefined | null) => {
  if (!hasText(value ?? undefined)) return "미정";
  const date = new Date(value!);
  if (Number.isNaN(date.getTime())) return value!;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const formatDashboardDue = (value: string | undefined | null) => {
  if (!hasText(value ?? undefined)) return "마감 미정";
  const due = new Date(value!);
  if (Number.isNaN(due.getTime())) return value!;

  const days = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘 마감";
  if (days === 1) return "내일 마감";
  return `${formatKoreanDate(value)} 마감`;
};

const parseDashboardDate = (value: string | undefined) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const formatWonAmount = (value: number | undefined) => {
  if (!value || value <= 0) return "-";
  if (value >= 100000000) {
    const amount = value / 100000000;
    return `${Number.isInteger(amount) ? amount : amount.toFixed(1)}억원`;
  }
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만원`;
  return `${value.toLocaleString("ko-KR")}원`;
};

const parseNumericAmount = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!hasText(value ?? undefined)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatPricingTerm = (
  pricingTerm: SupabaseContractPricingTermRow | undefined,
  legacyContract?: Contract,
) => {
  if (!pricingTerm) return legacyContract?.campaign?.budget ?? "금액 미정";

  const fixedAmount = parseNumericAmount(pricingTerm.fixed_amount);
  const fixedLabel = fixedAmount ? `${fixedAmount.toLocaleString("ko-KR")}원` : undefined;
  const commissionLabel =
    typeof pricingTerm.commission_rate_bps === "number"
      ? `${pricingTerm.commission_rate_bps / 100}%`
      : undefined;

  if (fixedLabel && commissionLabel) return `${fixedLabel} + 수수료 ${commissionLabel}`;
  if (commissionLabel) return `판매 수수료 ${commissionLabel}`;
  if (fixedLabel) return fixedLabel;
  return legacyContract?.campaign?.budget ?? "금액 미정";
};

const dashboardStageMeta: Record<
  InfluencerDashboardContractStage,
  {
    label: string;
    statusLabel: string;
    actionLabel: string;
    nextAction: string;
  }
> = {
  review_needed: {
    label: "검토 필요",
    statusLabel: "검토 중",
    actionLabel: "계약 검토",
    nextAction: "조항을 확인하고 승인 또는 수정 요청을 남겨주세요.",
  },
  change_pending: {
    label: "수정 협의 중",
    statusLabel: "수정 요청",
    actionLabel: "협의 보기",
    nextAction: "광고주 답변과 조항 변경 이력을 확인하세요.",
  },
  ready_to_sign: {
    label: "서명 가능",
    statusLabel: "서명 대기",
    actionLabel: "서명하기",
    nextAction: "최종본 확인 후 전자서명을 완료할 수 있습니다.",
  },
  signed: {
    label: "완료",
    statusLabel: "서명 완료",
    actionLabel: "완료본 보기",
    nextAction: "서명본과 감사 기록을 보관하세요.",
  },
  waiting: {
    label: "대기",
    statusLabel: "대기 중",
    actionLabel: "상세 보기",
    nextAction: "계약 상태를 확인하세요.",
  },
};

const inferDashboardStage = (
  status: SupabaseContractV2Row["status"],
  nextActorRole?: string | null,
): InfluencerDashboardContractStage => {
  if (status === "completed" || status === "active") return "signed";
  if (status === "signing") return "ready_to_sign";
  if (status === "negotiating" && nextActorRole === "influencer") {
    return "review_needed";
  }
  if (status === "negotiating") return "change_pending";
  return "waiting";
};

const inferLegacyDashboardStage = (
  status: Contract["status"],
): InfluencerDashboardContractStage => {
  const stages: Record<Contract["status"], InfluencerDashboardContractStage> = {
    DRAFT: "waiting",
    REVIEWING: "review_needed",
    NEGOTIATING: "change_pending",
    APPROVED: "ready_to_sign",
    SIGNED: "signed",
  };

  return stages[status];
};

const buildContractActionHref = (contractId: string, legacyContract?: Contract) => {
  const token = legacyContract?.evidence?.share_token;
  const tokenActive = legacyContract?.evidence?.share_token_status === "active";
  const suffix = token && tokenActive ? `?token=${encodeURIComponent(token)}` : "";
  return `/contract/${contractId}${suffix}`;
};

const buildVerificationHref = (contractId: string, legacyContract?: Contract) => {
  const token = legacyContract?.evidence?.share_token;
  const suffix = token ? `&token=${encodeURIComponent(token)}` : "";
  return `/influencer/verification?contractId=${encodeURIComponent(contractId)}${suffix}`;
};

const buildV2DashboardContract = ({
  contract,
  legacyContract,
  parties,
  platforms,
  pricingTerm,
  clauses,
  deliverableRequirements,
  deliverables,
  payouts,
}: {
  contract: SupabaseContractV2Row;
  legacyContract?: Contract;
  parties: SupabaseContractPartyRow[];
  platforms: SupabaseContractPlatformRow[];
  pricingTerm?: SupabaseContractPricingTermRow;
  clauses: SupabaseContractClauseRow[];
  deliverableRequirements: SupabaseDeliverableRequirementRow[];
  deliverables: SupabaseDeliverableRow[];
  payouts: SupabasePayoutRow[];
}): InfluencerDashboardContract => {
  const stage = inferDashboardStage(contract.status, contract.next_actor_role);
  const stageMeta = dashboardStageMeta[stage];
  const advertiserParty =
    parties.find((party) => ["advertiser", "agency", "marketer"].includes(party.party_role)) ??
    parties.find((party) => party.party_role !== "influencer");
  const influencerParty = parties.find((party) => party.party_role === "influencer");
  const normalizedPlatforms = platforms.length
    ? platforms.map((platform) => normalizeInfluencerPlatform(platform.platform))
    : (legacyContract?.campaign?.platforms?.map((platform) =>
        normalizeInfluencerPlatform(mapPlatformToV2(platform)),
      ) ?? ["other"]);
  const totalClauses = clauses.length || legacyContract?.clauses.length || 0;
  const approvedClauses =
    clauses.filter((clause) => clause.status === "accepted").length ||
    legacyContract?.clauses.filter((clause) => clause.status === "APPROVED").length ||
    0;
  const changeRequestedClauses =
    clauses.filter((clause) =>
      ["requested_change", "rejected", "countered"].includes(clause.status),
    ).length ||
    legacyContract?.clauses.filter((clause) => clause.status !== "APPROVED").length ||
    0;
  const submittedDeliverables = deliverables.filter(
    (deliverable) => deliverable.review_status && deliverable.review_status !== "draft",
  ).length;
  const approvedDeliverables = deliverables.filter(
    (deliverable) => deliverable.review_status === "approved",
  ).length;
  const payoutStatus = payouts.find((payout) => payout.status)?.status;
  const settlementStatus =
    payoutStatus === "paid"
      ? "paid"
      : stage === "signed"
        ? payoutStatus
          ? "pending"
          : "ready"
        : "not_ready";

  return {
    id: contract.id,
    title: contract.campaign_title,
    advertiser_name:
      advertiserParty?.company_name ??
      advertiserParty?.display_name ??
      legacyContract?.advertiser_info?.name ??
      "광고주",
    influencer_name:
      influencerParty?.display_name ?? legacyContract?.influencer_info.name ?? "인플루언서",
    status_label: stageMeta.statusLabel,
    stage,
    stage_label: stageMeta.label,
    next_action_label: contract.next_action ?? stageMeta.nextAction,
    action_label: stageMeta.actionLabel,
    action_href: buildContractActionHref(contract.id, legacyContract),
    verification_href: buildVerificationHref(contract.id, legacyContract),
    platform_labels: [...new Set(normalizedPlatforms)].map(
      (platform) => dashboardPlatformLabels[platform],
    ),
    platforms: [...new Set(normalizedPlatforms)],
    fee_label: formatPricingTerm(pricingTerm, legacyContract),
    period_label:
      legacyContract?.campaign?.period ??
      ([
        contract.campaign_start_date ? formatKoreanDate(contract.campaign_start_date) : undefined,
        contract.campaign_end_date ? formatKoreanDate(contract.campaign_end_date) : undefined,
      ]
        .filter(Boolean)
        .join(" - ") || "기간 미정"),
    deadline_label: formatDashboardDue(
      contract.next_due_at ?? contract.upload_deadline ?? contract.review_deadline,
    ),
    due_at: contract.next_due_at ?? contract.upload_deadline ?? contract.review_deadline ?? undefined,
    updated_at: contract.updated_at,
    clause_summary: {
      total: totalClauses,
      approved: approvedClauses,
      change_requested: changeRequestedClauses,
    },
    deliverable_summary: {
      total: deliverableRequirements.length || legacyContract?.campaign?.deliverables?.length || 0,
      submitted: submittedDeliverables,
      approved: approvedDeliverables,
    },
    settlement_summary: {
      status: settlementStatus,
      label:
        settlementStatus === "paid"
          ? "정산 완료"
          : settlementStatus === "pending"
            ? "정산 처리 중"
            : settlementStatus === "ready"
              ? "정산 준비 가능"
              : "서명 후 준비",
    },
  };
};

const buildLegacyDashboardContract = (
  contract: Contract,
): InfluencerDashboardContract => {
  const stage = inferLegacyDashboardStage(contract.status);
  const stageMeta = dashboardStageMeta[stage];
  const platforms =
    contract.campaign?.platforms?.map((platform) =>
      normalizeInfluencerPlatform(mapPlatformToV2(platform)),
    ) ?? [normalizeInfluencerPlatform(mapPlatformToV2(inferPlatformFromUrl(contract.influencer_info.channel_url) ?? "OTHER"))];
  const totalClauses = contract.clauses.length;
  const approvedClauses = contract.clauses.filter(
    (clause) => clause.status === "APPROVED",
  ).length;

  return {
    id: contract.id,
    title: contract.title,
    advertiser_name: contract.advertiser_info?.name ?? "광고주",
    influencer_name: contract.influencer_info.name,
    status_label: stageMeta.statusLabel,
    stage,
    stage_label: stageMeta.label,
    next_action_label: contract.workflow?.next_action ?? stageMeta.nextAction,
    action_label: stageMeta.actionLabel,
    action_href: buildContractActionHref(contract.id, contract),
    verification_href: buildVerificationHref(contract.id, contract),
    platform_labels: [...new Set(platforms)].map(
      (platform) => dashboardPlatformLabels[platform],
    ),
    platforms: [...new Set(platforms)],
    fee_label: contract.campaign?.budget ?? "금액 미정",
    period_label:
      contract.campaign?.period ??
      ([
        contract.campaign?.start_date ? formatKoreanDate(contract.campaign.start_date) : undefined,
        contract.campaign?.end_date ? formatKoreanDate(contract.campaign.end_date) : undefined,
      ]
        .filter(Boolean)
        .join(" - ") || "기간 미정"),
    deadline_label: formatDashboardDue(
      contract.workflow?.due_at ??
        contract.campaign?.upload_due_at ??
        contract.campaign?.deadline,
    ),
    due_at:
      contract.workflow?.due_at ??
      contract.campaign?.upload_due_at ??
      contract.campaign?.deadline,
    updated_at: contract.updated_at,
    clause_summary: {
      total: totalClauses,
      approved: approvedClauses,
      change_requested: totalClauses - approvedClauses,
    },
    deliverable_summary: {
      total: contract.campaign?.deliverables?.length ?? 0,
      submitted: 0,
      approved: 0,
    },
    settlement_summary: {
      status: contract.status === "SIGNED" ? "ready" : "not_ready",
      label: contract.status === "SIGNED" ? "정산 준비 가능" : "서명 후 준비",
    },
  };
};

const buildDashboardTasks = (
  contracts: InfluencerDashboardContract[],
  verificationStatus: VerificationStatus,
) => {
  const tasks: InfluencerDashboardTask[] = [];

  if (verificationStatus !== "approved") {
    tasks.push({
      id: "verification",
      tone: verificationStatus === "rejected" ? "rose" : "amber",
      title: verificationStatus === "pending" ? "계정 인증 검토 중" : "플랫폼 계정 인증 필요",
      body:
        verificationStatus === "pending"
          ? "운영자 검토가 끝나면 반복 거래와 정산 준비 상태가 갱신됩니다."
          : "서명은 진행할 수 있지만 반복 거래와 정산 준비에는 플랫폼 소유 확인이 필요합니다.",
      action_label: verificationStatus === "pending" ? "인증 상태 보기" : "인증 제출",
      href: "/influencer/verification",
    });
  }

  for (const contract of contracts) {
    if (contract.stage === "signed" || contract.stage === "waiting") continue;

    tasks.push({
      id: `contract:${contract.id}`,
      contract_id: contract.id,
      tone:
        contract.stage === "ready_to_sign"
          ? "sky"
          : contract.stage === "change_pending"
            ? "amber"
            : "amber",
      title: contract.stage_label,
      body: `${contract.advertiser_name} · ${contract.title}`,
      action_label: contract.action_label,
      href: contract.action_href,
      due_at: contract.due_at,
    });
  }

  return tasks.slice(0, 6);
};

const buildInfluencerDashboard = async (
  authUser: SupabaseAuthUser,
): Promise<InfluencerDashboardResponse> => {
  if (!useSupabase) {
    throw new Error("Supabase is required for influencer dashboard");
  }

  const userEmail = authUser.email?.trim().toLowerCase() ?? "";
  const profiles = await readSupabaseRows<SupabaseProfileRow>(
    "profiles",
    `?select=*&id=eq.${encodeURIComponent(authUser.id)}&limit=1`,
    "profile",
  );
  const profile = profiles[0];

  if (profile && profile.role !== "influencer") {
    throw new Error("Influencer role is required");
  }

  const profileParties = await readSupabaseRows<SupabaseContractPartyRow>(
    "contract_parties",
    `?select=*&party_role=eq.influencer&profile_id=eq.${encodeURIComponent(authUser.id)}`,
    "influencer parties by profile",
  );
  const emailParties = userEmail
    ? await readSupabaseRows<SupabaseContractPartyRow>(
        "contract_parties",
        `?select=*&party_role=eq.influencer&email=eq.${encodeURIComponent(userEmail)}`,
        "influencer parties by email",
      )
    : [];
  const influencerParties = uniqueRowsById([...profileParties, ...emailParties]);
  const legacyStore = await readStore();
  const legacyContractsForUser = legacyStore.contracts.filter(
    (contract) =>
      userEmail &&
      contract.influencer_info.contact.trim().toLowerCase() === userEmail,
  );
  const legacyContractsById = new Map(
    legacyStore.contracts.map((contract) => [contract.id, contract]),
  );
  const contractIds = [
    ...new Set([
      ...influencerParties.map((party) => party.contract_id),
      ...legacyContractsForUser.map((contract) => contract.id),
    ]),
  ];

  let dashboardContracts: InfluencerDashboardContract[] = [];

  if (contractIds.length > 0) {
    const contractFilter = postgrestInFilter(contractIds);
    const [
      contracts,
      allParties,
      platforms,
      pricingTerms,
      clauses,
      deliverableRequirements,
      deliverables,
      payouts,
    ] = await Promise.all([
      readSupabaseRows<SupabaseContractV2Row>(
        "contracts",
        `?select=*&id=in.${contractFilter}&deleted_at=is.null&order=updated_at.desc`,
        "influencer contracts",
      ),
      readSupabaseRows<SupabaseContractPartyRow>(
        "contract_parties",
        `?select=*&contract_id=in.${contractFilter}`,
        "contract parties",
      ),
      readSupabaseRows<SupabaseContractPlatformRow>(
        "contract_platforms",
        `?select=*&contract_id=in.${contractFilter}`,
        "contract platforms",
      ),
      readSupabaseRows<SupabaseContractPricingTermRow>(
        "contract_pricing_terms",
        `?select=*&contract_id=in.${contractFilter}`,
        "contract pricing",
      ),
      readSupabaseRows<SupabaseContractClauseRow>(
        "contract_clauses",
        `?select=contract_id,status&contract_id=in.${contractFilter}`,
        "contract clauses",
      ),
      readSupabaseRows<SupabaseDeliverableRequirementRow>(
        "deliverable_requirements",
        `?select=contract_id&contract_id=in.${contractFilter}`,
        "deliverable requirements",
      ),
      readSupabaseRows<SupabaseDeliverableRow>(
        "deliverables",
        `?select=contract_id,review_status&contract_id=in.${contractFilter}`,
        "deliverables",
      ),
      readSupabaseRows<SupabasePayoutRow>(
        "payouts",
        `?select=contract_id,status&contract_id=in.${contractFilter}`,
        "payouts",
      ),
    ]);
    const partiesByContract = groupByContractId(allParties);
    const platformsByContract = groupByContractId(platforms);
    const clausesByContract = groupByContractId(clauses);
    const requirementsByContract = groupByContractId(deliverableRequirements);
    const deliverablesByContract = groupByContractId(deliverables);
    const payoutsByContract = groupByContractId(payouts);
    const pricingByContract = new Map(
      pricingTerms.map((pricingTerm) => [pricingTerm.contract_id, pricingTerm]),
    );
    const v2ContractIds = new Set(contracts.map((contract) => contract.id));

    dashboardContracts = contracts.map((contract) =>
      buildV2DashboardContract({
        contract,
        legacyContract: legacyContractsById.get(contract.id),
        parties: partiesByContract.get(contract.id) ?? [],
        platforms: platformsByContract.get(contract.id) ?? [],
        pricingTerm: pricingByContract.get(contract.id),
        clauses: clausesByContract.get(contract.id) ?? [],
        deliverableRequirements: requirementsByContract.get(contract.id) ?? [],
        deliverables: deliverablesByContract.get(contract.id) ?? [],
        payouts: payoutsByContract.get(contract.id) ?? [],
      }),
    );

    dashboardContracts.push(
      ...legacyContractsForUser
        .filter((contract) => !v2ContractIds.has(contract.id))
        .map(buildLegacyDashboardContract),
    );
  }

  dashboardContracts.sort(
    (a, b) => parseDashboardDate(b.updated_at) - parseDashboardDate(a.updated_at),
  );

  const verificationRequests = (await readVerificationRequests()).filter(
    (request) =>
      request.target_type === "influencer_account" &&
      (request.profile_id === authUser.id ||
        request.submitted_by_email?.trim().toLowerCase() === userEmail),
  );
  const latestVerification = verificationRequests
    .sort((a, b) => parseDateDescending(a.created_at, b.created_at))[0];
  const latestVerificationForResponse =
    latestVerification?.status === "not_submitted"
      ? undefined
      : (latestVerification as InfluencerDashboardResponse["verification"]["latest_request"]);
  const verificationStatus =
    (profile?.verification_status as VerificationStatus | undefined) ??
    latestVerification?.status ??
    "not_submitted";
  const approvedPlatforms = verificationRequests
    .filter((request) => request.status === "approved" && request.platform && request.platform_handle)
    .map((request) => ({
      platform: request.platform!,
      handle: request.platform_handle!,
      url: request.platform_url,
      approved_at: request.reviewed_at,
    }));
  const nextDeadline = dashboardContracts
    .map((contract) => contract.due_at)
    .filter((value): value is string => hasText(value))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  const fixedFeeTotal = dashboardContracts.reduce((total, contract) => {
    const amount = parseMoneyAmount(contract.fee_label);
    return total + (amount ?? 0);
  }, 0);
  const summary = {
    total_contracts: dashboardContracts.length,
    review_needed: dashboardContracts.filter((contract) => contract.stage === "review_needed").length,
    change_pending: dashboardContracts.filter((contract) => contract.stage === "change_pending").length,
    ready_to_sign: dashboardContracts.filter((contract) => contract.stage === "ready_to_sign").length,
    signed: dashboardContracts.filter((contract) => contract.stage === "signed").length,
    verification_needed: verificationStatus !== "approved",
    next_deadline: nextDeadline,
    total_fixed_fee_label: formatWonAmount(fixedFeeTotal),
  };

  return {
    authenticated: true,
    user: {
      id: authUser.id,
      email: profile?.email ?? authUser.email ?? "",
      name: profile?.name ?? authUser.email ?? "인플루언서",
      role: profile?.role ?? "influencer",
      verification_status: verificationStatus,
      email_verified: Boolean(authUser.email_confirmed_at ?? authUser.confirmed_at ?? profile?.email_verified_at),
    },
    verification: {
      status: verificationStatus,
      latest_request: latestVerificationForResponse,
      approved_platforms: approvedPlatforms,
    },
    summary,
    tasks: buildDashboardTasks(dashboardContracts, verificationStatus),
    contracts: dashboardContracts,
  };
};

const writeStore = async (store: ContractStoreFile) => {
  if (useSupabase) {
    const normalizedContracts = normalizeStore(store).contracts;
    if (useSupabaseV2) {
      await syncSupabaseV2Contracts(normalizedContracts);
    }
    await upsertSupabaseContracts(normalizedContracts);
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tempFile, dataFile);
};

const readStore = async (): Promise<ContractStoreFile> => {
  if (useSupabase) {
    return readSupabaseStore();
  }

  try {
    const contents = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(contents) as ContractStoreFile;

    if (!Array.isArray(parsed.contracts)) {
      throw new Error("Invalid contracts store");
    }

    const normalizedStore = normalizeStore(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalizedStore)) {
      await writeStore(normalizedStore);
    }

    return normalizedStore;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      console.warn(`[DirectSign] resetting invalid data store: ${code}`);
    }

    const initialStore = { contracts: demoMode ? createDemoContracts() : [] };
    await writeStore(initialStore);
    return initialStore;
  }
};

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "directsign-api",
    storage: useSupabase ? "supabase" : "file",
    demo_mode: demoMode,
    admin_auth_configured: isAdminAuthConfigured(),
    supabase_legacy_table: useSupabase ? supabaseLegacyTable : undefined,
    supabase_schema_version: useSupabase
      ? useSupabaseV2
        ? "v2_dual_write"
        : "legacy"
      : undefined,
  });
});

app.get("/api/admin/session", (request, response) => {
  const token = parseCookies(request.header("cookie")).get(adminSessionCookie);
  response.json({
    authenticated: verifyAdminSessionToken(token),
    configured: isAdminAuthConfigured(),
  });
});

app.post("/api/admin/login", (request, response) => {
  if (!isAdminAuthConfigured()) {
    response.status(503).json({
      error: "Admin authentication is not configured",
      configured: false,
    });
    return;
  }

  const accessCode = String(request.body?.accessCode ?? "");

  if (!safeEqual(accessCode, adminAccessCode!)) {
    response.status(401).json({ error: "Invalid admin access code" });
    return;
  }

  response.setHeader(
    "Set-Cookie",
    `${adminSessionCookie}=${encodeURIComponent(
      createAdminSessionToken(),
    )}; ${adminCookieOptions()}`,
  );
  response.json({ authenticated: true, configured: true });
});

app.post("/api/admin/logout", (_request, response) => {
  response.setHeader(
    "Set-Cookie",
    `${adminSessionCookie}=; ${clearAdminCookieOptions()}`,
  );
  response.json({ authenticated: false });
});

app.get("/api/advertiser/session", async (request, response, next) => {
  try {
    const auth = await authenticateAdvertiserRequest(request, response);

    if (!auth) {
      response.status(401).json({ authenticated: false });
      return;
    }

    const profile = await readProfileByUserId(auth.user.id);

    if (!isAdvertiserRole(profile?.role)) {
      response.status(403).json({ authenticated: false });
      return;
    }

    response.json({
      authenticated: true,
      user: {
        id: profile.id,
        email: profile.email ?? auth.user.email,
        name: profile.name,
        role: profile.role,
        company_name: profile.company_name,
        verification_status: profile.verification_status ?? "not_submitted",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/advertiser/login", async (request, response) => {
  try {
    const email = normalizeRequiredText(request.body?.email).toLowerCase();
    const password = normalizeRequiredText(request.body?.password);

    if (!email.includes("@") || !password) {
      response.status(422).json({ error: "Valid email and password are required" });
      return;
    }

    const session = await createSupabasePasswordSession(email, password);
    const profile = await readProfileByUserId(session.user.id);

    if (!isAdvertiserRole(profile?.role)) {
      response.status(403).json({ error: "Advertiser account is required" });
      return;
    }

    setAdvertiserSessionCookies(response, session);
    response.json({
      authenticated: true,
      user: {
        id: profile.id,
        email: profile.email ?? session.user.email,
        name: profile.name,
        role: profile.role,
        company_name: profile.company_name,
        verification_status: profile.verification_status ?? "not_submitted",
      },
    });
  } catch (error) {
    response.status(401).json({
      error:
        error instanceof Error && hasText(error.message)
          ? error.message
          : "Advertiser login failed",
    });
  }
});

app.post("/api/advertiser/signup", async (request, response) => {
  try {
    if (!useSupabase) {
      response.status(503).json({ error: "Account creation requires Supabase Auth" });
      return;
    }

    const email = normalizeEmail(request.body?.email);
    const password = normalizeRequiredText(request.body?.password);
    const managerName = normalizeRequiredText(request.body?.name);
    const companyName = normalizeRequiredText(request.body?.company_name);
    const passwordError = validateSignupPassword(password);

    if (!isValidEmail(email)) {
      response.status(422).json({ error: "올바른 이메일을 입력해 주세요." });
      return;
    }
    if (passwordError) {
      response.status(422).json({ error: passwordError });
      return;
    }
    if (!managerName || !companyName) {
      response.status(422).json({ error: "담당자명과 회사명을 입력해 주세요." });
      return;
    }

    const authUser = await createSupabaseAdminUser({
      email,
      password,
      role: "marketer",
      name: managerName,
      companyName,
    });

    await upsertSupabaseV2Rows("profiles", [
      {
        id: authUser.id,
        role: "marketer",
        name: managerName,
        email,
        company_name: companyName,
        verification_status: "not_submitted",
        updated_at: new Date().toISOString(),
      },
    ]);

    const [organization] = await insertSupabaseRowsReturning<SupabaseOrganizationRow>(
      "organizations",
      [
        {
          name: companyName,
          organization_type: "advertiser",
          created_by_profile_id: authUser.id,
          business_verification_status: "not_submitted",
        },
      ],
      "organization",
    );

    if (organization?.id) {
      await upsertSupabaseV2Rows(
        "organization_members",
        [
          {
            organization_id: organization.id,
            profile_id: authUser.id,
            role: "owner",
            is_default: true,
          },
        ],
        "organization_id,profile_id",
      );
    }

    const session = await createSupabasePasswordSession(email, password);
    setAdvertiserSessionCookies(response, session);
    response.status(201).json({
      authenticated: true,
      user: {
        id: authUser.id,
        email,
        name: managerName,
        role: "marketer",
        company_name: companyName,
        verification_status: "not_submitted",
      },
    });
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error && hasText(error.message)
          ? error.message
          : "광고주 계정을 만들 수 없습니다.",
    });
  }
});

app.post("/api/advertiser/logout", (_request, response) => {
  clearAdvertiserSessionCookies(response);
  response.json({ authenticated: false });
});

app.get("/api/influencer/session", async (request, response, next) => {
  try {
    const auth = await authenticateInfluencerRequest(request, response);

    if (!auth) {
      response.status(401).json({ authenticated: false });
      return;
    }

    const dashboard = await buildInfluencerDashboard(auth.user);
    response.json({
      authenticated: true,
      user: dashboard.user,
      verification: dashboard.verification,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/influencer/login", async (request, response, next) => {
  try {
    const email = normalizeRequiredText(request.body?.email).toLowerCase();
    const password = normalizeRequiredText(request.body?.password);

    if (!email.includes("@") || !password) {
      response.status(422).json({ error: "Valid email and password are required" });
      return;
    }

    const session = await createSupabasePasswordSession(email, password);
    const dashboard = await buildInfluencerDashboard(session.user);

    if (dashboard.user.role !== "influencer") {
      response.status(403).json({ error: "Influencer account is required" });
      return;
    }

    setInfluencerSessionCookies(response, session);
    response.json({
      authenticated: true,
      user: dashboard.user,
      verification: dashboard.verification,
    });
  } catch (error) {
    response.status(401).json({
      error:
        error instanceof Error && hasText(error.message)
          ? error.message
          : "Influencer login failed",
    });
  }
});

app.post("/api/influencer/signup", async (request, response) => {
  try {
    if (!useSupabase) {
      response.status(503).json({ error: "Account creation requires Supabase Auth" });
      return;
    }

    const email = normalizeEmail(request.body?.email);
    const password = normalizeRequiredText(request.body?.password);
    const name = normalizeRequiredText(request.body?.name);
    const passwordError = validateSignupPassword(password);

    if (!isValidEmail(email)) {
      response.status(422).json({ error: "올바른 이메일을 입력해 주세요." });
      return;
    }
    if (passwordError) {
      response.status(422).json({ error: passwordError });
      return;
    }
    if (!name) {
      response.status(422).json({ error: "이름 또는 활동명을 입력해 주세요." });
      return;
    }

    const authUser = await createSupabaseAdminUser({
      email,
      password,
      role: "influencer",
      name,
    });

    await upsertSupabaseV2Rows("profiles", [
      {
        id: authUser.id,
        role: "influencer",
        name,
        email,
        verification_status: "not_submitted",
        updated_at: new Date().toISOString(),
      },
    ]);

    const session = await createSupabasePasswordSession(email, password);
    setInfluencerSessionCookies(response, session);
    response.status(201).json({
      authenticated: true,
      user: {
        id: authUser.id,
        email,
        name,
        role: "influencer",
        verification_status: "not_submitted",
      },
    });
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error && hasText(error.message)
          ? error.message
          : "인플루언서 계정을 만들 수 없습니다.",
    });
  }
});

app.post("/api/influencer/logout", (_request, response) => {
  clearInfluencerSessionCookies(response);
  response.json({ authenticated: false });
});

app.get("/api/influencer/dashboard", async (request, response, next) => {
  try {
    const auth = await authenticateInfluencerRequest(request, response);

    if (!auth) {
      response.status(401).json({ error: "Influencer session is required" });
      return;
    }

    response.json(await buildInfluencerDashboard(auth.user));
  } catch (error) {
    if (error instanceof Error && error.message === "Influencer role is required") {
      response.status(403).json({ error: "Influencer account is required" });
      return;
    }

    next(error);
  }
});

app.get("/api/verification/status", async (request, response, next) => {
  try {
    if (verifyAdminSessionToken(getAdminSessionFromRequest(request))) {
      const advertiserId =
        normalizeOptionalText(request.query.advertiser_id) ??
        defaultAdvertiserTargetId;
      const influencerId =
        normalizeOptionalText(request.query.influencer_id) ??
        defaultInfluencerTargetId;

      response.json(await buildVerificationSummary(advertiserId, influencerId));
      return;
    }

    const advertiserAuth = await authenticateAdvertiserRequest(request, response);

    if (advertiserAuth) {
      const profile = await readProfileByUserId(advertiserAuth.user.id);

      if (isAdvertiserRole(profile?.role)) {
        response.json(
          await buildAdvertiserScopedVerificationSummary({
            ...advertiserAuth,
            profile: profile!,
          }),
        );
        return;
      }
    }

    const influencerAuth = await authenticateInfluencerRequest(request, response);

    if (influencerAuth) {
      const profile = await readProfileByUserId(influencerAuth.user.id);

      if (isInfluencerRole(profile?.role)) {
        response.json(
          await buildInfluencerScopedVerificationSummary({
            ...influencerAuth,
            profile: profile!,
          }),
        );
        return;
      }
    }

    response.status(401).json({ error: "Authenticated session is required" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/verification/advertiser", async (request, response, next) => {
  try {
    const advertiserAuth = await requireAdvertiserSession(request, response);

    if (!advertiserAuth) return;

    const verificationContext = await buildAdvertiserVerificationContext(
      advertiserAuth,
    );
    const subjectName =
      normalizeRequiredText(request.body?.subject_name) ||
      verificationContext.subjectName;
    const submittedByName = verificationContext.submittedByName;
    const submittedByEmail = verificationContext.submittedByEmail;
    const representativeName = normalizeRequiredText(request.body?.representative_name);
    const businessRegistrationNumber = normalizeRequiredText(
      request.body?.business_registration_number,
    );
    const managerPhone = normalizeOptionalText(request.body?.manager_phone);
    const documentIssueDate = normalizeDateOnlyValue(
      request.body?.document_issue_date,
    );
    const documentCheckNumber = normalizeOptionalText(
      request.body?.document_check_number,
    );
    const note = normalizeOptionalText(request.body?.note);
    const evidenceFile = parseEvidenceFile(request.body?.evidence_file);
    const evidenceError = validateEvidenceFile(evidenceFile);

    if (!subjectName) {
      response.status(422).json({ error: "Company or brand name is required" });
      return;
    }
    if (!submittedByName || !submittedByEmail.includes("@")) {
      response.status(422).json({ error: "Valid manager name and email are required" });
      return;
    }
    if (!representativeName) {
      response.status(422).json({ error: "Representative name is required" });
      return;
    }
    if (!isValidBusinessRegistrationNumber(businessRegistrationNumber)) {
      response.status(422).json({ error: "Business registration number is invalid" });
      return;
    }
    if (!documentIssueDate) {
      response.status(422).json({ error: "Document issue date is required" });
      return;
    }
    if (evidenceError) {
      response.status(422).json({ error: evidenceError });
      return;
    }

    const now = new Date().toISOString();
    const requestId = randomUUID();
    const storedEvidenceFile = await storeEvidenceFile({
      requestId,
      ownerId: verificationContext.profileId,
      area: "verification-advertiser",
      file: evidenceFile!,
    });
    const record = await insertVerificationRequest({
      id: requestId,
      target_type: "advertiser_organization",
      target_id: verificationContext.targetId,
      verification_type: "business_registration_certificate",
      status: "pending",
      profile_id: verificationContext.profileId,
      organization_id: verificationContext.organizationId,
      subject_name: subjectName,
      submitted_by_name: submittedByName,
      submitted_by_email: submittedByEmail,
      business_registration_number: normalizeBusinessRegistrationNumber(
        businessRegistrationNumber,
      ),
      representative_name: representativeName,
      manager_phone: managerPhone,
      document_issue_date: documentIssueDate,
      document_check_number: documentCheckNumber,
      evidence_file_name: evidenceFile!.name,
      evidence_file_mime: evidenceFile!.type,
      evidence_file_size: evidenceFile!.size,
      evidence_snapshot_json: buildVerificationEvidenceSnapshot(requestId, storedEvidenceFile, {
        submitted_profile_id: verificationContext.profileId,
        organization_id: verificationContext.organizationId,
        submitted_business_registration_number:
          normalizeBusinessRegistrationNumber(businessRegistrationNumber),
        document_check_number: documentCheckNumber,
      }),
      note,
      submitted_ip: getClientIp(request),
      submitted_user_agent: request.header("user-agent") ?? "unknown",
      created_at: now,
      updated_at: now,
    });

    response.status(201).json({ request: record });
  } catch (error) {
    next(error);
  }
});

app.post("/api/verification/influencer", async (request, response, next) => {
  try {
    const influencerAuth = await requireInfluencerSession(request, response);

    if (!influencerAuth) return;

    const subjectName =
      normalizeRequiredText(request.body?.subject_name) ||
      influencerAuth.profile.name;
    const submittedByEmail =
      influencerAuth.profile.email ?? influencerAuth.user.email ?? "";
    const platform = normalizeRequiredText(request.body?.platform) as InfluencerPlatform;
    const platformHandle = normalizeRequiredText(request.body?.platform_handle);
    const platformUrl = normalizeUrlValue(request.body?.platform_url);
    const ownershipMethod = normalizeRequiredText(
      request.body?.ownership_verification_method,
    ) as InfluencerVerificationMethod;
    const ownershipChallengeCode = normalizeChallengeCode(
      request.body?.ownership_challenge_code,
    );
    const ownershipChallengeUrl =
      normalizeUrlValue(request.body?.ownership_challenge_url) ?? platformUrl;
    const targetId = influencerAuth.profile.id;
    const note = normalizeOptionalText(request.body?.note);
    const evidenceFile = parseEvidenceFile(request.body?.evidence_file);
    const evidenceError = evidenceFile
      ? validateEvidenceFile(evidenceFile)
      : undefined;

    if (!subjectName || !submittedByEmail.includes("@")) {
      response.status(422).json({ error: "Valid name and email are required" });
      return;
    }
    if (!influencerPlatforms.has(platform)) {
      response.status(422).json({ error: "Valid platform is required" });
      return;
    }
    if (!influencerVerificationMethods.has(ownershipMethod)) {
      response.status(422).json({ error: "Valid ownership verification method is required" });
      return;
    }
    if (!platformHandle || !platformUrl) {
      response.status(422).json({ error: "Valid profile handle and URL are required" });
      return;
    }
    if (!isExpectedPlatformUrl(platform, platformUrl)) {
      response.status(422).json({ error: "Profile URL does not match the selected platform" });
      return;
    }
    if (
      ownershipChallengeUrl &&
      !isExpectedPlatformUrl(platform, ownershipChallengeUrl)
    ) {
      response.status(422).json({ error: "Proof URL does not match the selected platform" });
      return;
    }
    if (!ownershipChallengePattern.test(ownershipChallengeCode)) {
      response.status(422).json({ error: "Valid DirectSign challenge code is required" });
      return;
    }
    if (evidenceError) {
      response.status(422).json({ error: evidenceError });
      return;
    }
    if (ownershipMethod === "screenshot_review" && !evidenceFile) {
      response.status(422).json({ error: "Screenshot evidence is required for screenshot review" });
      return;
    }

    const now = new Date().toISOString();
    const shouldRunOwnershipCheck =
      ownershipMethod !== "screenshot_review" &&
      Boolean(ownershipChallengeUrl) &&
      platform !== "instagram" &&
      platform !== "tiktok";
    const ownershipCheck = shouldRunOwnershipCheck
      ? await checkOwnershipChallenge(ownershipChallengeUrl!, ownershipChallengeCode)
      : { status: "not_run" as OwnershipCheckStatus, checked_at: now };
    const requestId = randomUUID();
    const storedEvidenceFile = evidenceFile
      ? await storeEvidenceFile({
          requestId,
          ownerId: influencerAuth.profile.id,
          area: "verification-influencer",
          file: evidenceFile,
        })
      : undefined;
    const record = await insertVerificationRequest({
      id: requestId,
      target_type: "influencer_account",
      target_id: targetId,
      verification_type: "platform_account",
      status: "pending",
      profile_id: influencerAuth.profile.id,
      subject_name: subjectName,
      submitted_by_email: submittedByEmail,
      platform: platform as InfluencerPlatform,
      platform_handle: platformHandle,
      platform_url: platformUrl,
      ownership_verification_method: ownershipMethod,
      ownership_challenge_code: ownershipChallengeCode,
      ownership_challenge_url: ownershipChallengeUrl,
      ownership_check_status: ownershipCheck.status,
      ownership_checked_at: ownershipCheck.checked_at,
      evidence_file_name: evidenceFile?.name,
      evidence_file_mime: evidenceFile?.type,
      evidence_file_size: evidenceFile?.size,
      evidence_snapshot_json: buildVerificationEvidenceSnapshot(requestId, storedEvidenceFile, {
        ownership_verification: {
          platform,
          platform_handle: platformHandle,
          platform_url: platformUrl,
          profile_id: influencerAuth.profile.id,
          method: ownershipMethod,
          challenge_code: ownershipChallengeCode,
          challenge_url: ownershipChallengeUrl,
          automated_check: ownershipCheck,
        },
      }),
      note,
      submitted_ip: getClientIp(request),
      submitted_user_agent: request.header("user-agent") ?? "unknown",
      created_at: now,
      updated_at: now,
    });

    response.status(201).json({ request: record });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/verification-requests", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;
    response.json({
      verification_requests: await readVerificationRequests(),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/verification-requests/:id/evidence", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;

    const record = (await readVerificationRequests()).find(
      (item) => item.id === request.params.id,
    );

    if (!record) {
      response.status(404).json({ error: "Verification request not found" });
      return;
    }

    const storedFile = parseStoredPrivateFile(
      record.evidence_snapshot_json?.evidence_file,
    );

    if (storedFile) {
      const fileBuffer = await readStoredPrivateFile(storedFile);
      const currentHash = createHash("sha256").update(fileBuffer).digest("hex");

      if (currentHash !== storedFile.sha256) {
        response.status(409).json({ error: "Evidence file integrity check failed" });
        return;
      }

      response.setHeader("Content-Type", storedFile.content_type);
      response.setHeader(
        "Content-Disposition",
        `inline; filename="${sanitizeStorageSegment(storedFile.file_name)}"`,
      );
      response.send(fileBuffer);
      return;
    }

    const legacyDataUrl = record.evidence_snapshot_json?.file_data_url;
    if (typeof legacyDataUrl === "string") {
      const { contentType, buffer } = dataUrlToBuffer(legacyDataUrl);
      response.setHeader("Content-Type", contentType);
      response.send(buffer);
      return;
    }

    response.status(404).json({ error: "Evidence file is not available" });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/verification-requests/:id", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;

    const status = normalizeRequiredText(request.body?.status);
    const reviewerNote = normalizeOptionalText(request.body?.reviewer_note);
    const reviewedByName =
      normalizeOptionalText(request.body?.reviewed_by_name) ?? "DirectSign 운영자";

    if (!verificationStatuses.has(status)) {
      response.status(422).json({ error: "Valid verification status is required" });
      return;
    }

    const record = await updateVerificationRequestReview({
      id: request.params.id,
      status: status as VerificationStatus,
      reviewerNote,
      reviewedByName,
    });

    if (!record) {
      response.status(404).json({ error: "Verification request not found" });
      return;
    }

    response.json({ request: record });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts", async (request, response, next) => {
  try {
    const adminAuthenticated = verifyAdminSessionToken(
      getAdminSessionFromRequest(request),
    );
    const advertiserAuth = adminAuthenticated
      ? undefined
      : await requireAdvertiserSession(request, response);

    if (!adminAuthenticated && !advertiserAuth) {
      return;
    }

    const store = await readStore();
    const contracts = adminAuthenticated
      ? store.contracts
      : store.contracts.filter((contract) =>
          canAdvertiserAccessLegacyContract(advertiserAuth!, contract),
        );

    response.json({
      contracts,
      source: useSupabase ? "supabase" : "file",
      allow_local_merge: !useSupabase,
      demo_mode: demoMode,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts/:id", async (request, response, next) => {
  try {
    const store = await readStore();
    const contract = store.contracts.find((item) => item.id === request.params.id);

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const shareAccessError = verifyInfluencerShareAccess(request, contract);

    if (shareAccessError) {
      const adminAuthenticated = verifyAdminSessionToken(
        getAdminSessionFromRequest(request),
      );
      const advertiserAuth = adminAuthenticated
        ? undefined
        : await requireAdvertiserSession(request, response);

      if (!adminAuthenticated && !advertiserAuth) {
        return;
      }

      if (
        !adminAuthenticated &&
        !canAdvertiserAccessLegacyContract(advertiserAuth!, contract)
      ) {
        response.status(403).json({ error: "Contract access is not allowed" });
        return;
      }
    }

    response.json({ contract });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts/:id/final-pdf", async (request, response, next) => {
  try {
    const store = await readStore();
    const contract = store.contracts.find((item) => item.id === request.params.id);

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const shareAccessError = verifyInfluencerShareAccess(request, contract);
    if (shareAccessError) {
      const adminAuthenticated = verifyAdminSessionToken(
        getAdminSessionFromRequest(request),
      );
      const advertiserAuth = adminAuthenticated
        ? undefined
        : await requireAdvertiserSession(request, response);

      if (!adminAuthenticated && !advertiserAuth) {
        return;
      }

      if (
        !adminAuthenticated &&
        !canAdvertiserAccessLegacyContract(advertiserAuth!, contract)
      ) {
        response.status(403).json({ error: "Contract access is not allowed" });
        return;
      }
    }

    const signatureData = contract.signature_data;
    const storedFile = parseStoredPrivateFile({
      provider: signatureData?.signed_pdf_storage_provider,
      bucket: signatureData?.signed_pdf_bucket ?? privateStorageBucket,
      path: signatureData?.signed_pdf_path,
      file_name: `${contract.id}-signed-record.pdf`,
      content_type: signatureData?.signed_pdf_mime ?? "application/pdf",
      byte_size: signatureData?.signed_pdf_size ?? 0,
      sha256: signatureData?.signed_pdf_hash,
      stored_at: signatureData?.signed_at,
    });

    if (!storedFile) {
      response.status(404).json({ error: "Signed PDF is not available" });
      return;
    }

    const fileBuffer = await readStoredPrivateFile(storedFile);
    const currentHash = createHash("sha256").update(fileBuffer).digest("hex");

    if (currentHash !== storedFile.sha256) {
      response.status(409).json({ error: "Signed PDF integrity check failed" });
      return;
    }

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${contract.id}-signed-record.pdf"`,
    );
    response.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/contracts/:id/signatures/influencer", async (request, response, next) => {
  try {
    const signatureData = String(request.body?.signature_data ?? "");
    const signerName = normalizeRequiredText(request.body?.signer_name);
    const consentAccepted = request.body?.consent_accepted === true;
    const consentText = normalizeRequiredText(request.body?.consent_text);

    if (!hasText(signatureData) || !signatureData.startsWith("data:image/")) {
      response.status(400).json({ error: "Valid signature image data is required" });
      return;
    }
    if (!signerName) {
      response.status(422).json({ error: "Signer name is required" });
      return;
    }
    if (!consentAccepted) {
      response.status(422).json({ error: "Signature consent is required" });
      return;
    }

    const store = await readStore();
    const existingIndex = store.contracts.findIndex(
      (item) => item.id === request.params.id,
    );

    if (existingIndex < 0) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const existing = store.contracts[existingIndex];
    const accessError = verifyInfluencerShareAccess(request, existing);

    if (accessError) {
      response.status(403).json({ error: accessError });
      return;
    }

    if (!existing.clauses.every((clause) => clause.status === "APPROVED")) {
      response.status(409).json({
        error: "All clauses must be approved before signing",
      });
      return;
    }

    const signedAt = new Date().toISOString();
    const clientIp = getClientIp(request);
    const userAgent = request.header("user-agent") ?? "unknown";
    const { contentType: signatureContentType, buffer: signatureBuffer } =
      dataUrlToBuffer(signatureData);

    if (!signatureContentType.startsWith("image/") || signatureBuffer.byteLength <= 0) {
      response.status(400).json({ error: "Signature image data is invalid" });
      return;
    }

    const contractHash = sha256Hex(
      JSON.stringify({
        ...existing,
        signature_data: undefined,
        updated_at: undefined,
      }),
    );
    const signatureHash = createHash("sha256").update(signatureBuffer).digest("hex");
    const signatureFile = await storePrivateBuffer({
      area: "signature-images",
      ownerId: existing.id,
      fileId: randomUUID(),
      fileName: `${existing.id}-influencer-signature.png`,
      contentType: signatureContentType,
      buffer: signatureBuffer,
    });
    const signedPdfBuffer = await buildSignedContractPdf({
      contract: existing,
      signedAt,
      contractHash,
      signatureHash,
      signerName,
      signerEmail: existing.influencer_info.contact,
      clientIp,
    });
    const signedPdfFile = await storePrivateBuffer({
      area: "signed-contracts",
      ownerId: existing.id,
      fileId: randomUUID(),
      fileName: `${existing.id}-signed-record.pdf`,
      contentType: "application/pdf",
      buffer: signedPdfBuffer,
    });
    const updatedContract = normalizeContract({
      ...existing,
      status: "SIGNED",
      evidence: {
        share_token_status: "active",
        share_token: existing.evidence?.share_token,
        share_token_expires_at: existing.evidence?.share_token_expires_at,
        audit_ready: true,
        pdf_status: "signed_ready",
      },
      workflow: {
        next_actor: "system",
        next_action: "서명 완료본과 감사 기록을 보관하세요.",
        risk_level: "low",
        last_message: "인플루언서 전자서명이 완료되었습니다.",
      },
      audit_events: [
        ...(existing.audit_events ?? []),
        {
          id: randomUUID(),
          actor: "influencer",
          action: "contract_signed",
          description: `인플루언서가 전자서명을 완료했습니다. IP=${clientIp}; UA=${userAgent}`,
          created_at: signedAt,
        },
      ],
      signature_data: {
        adv_sign: existing.signature_data?.adv_sign ?? "",
        inf_sign: signatureData,
        signed_at: signedAt,
        ip: clientIp,
        user_agent: userAgent,
        signer_name: signerName,
        signer_email: existing.influencer_info.contact,
        consent_text: consentText || "계약 조항을 확인했고 전자서명에 동의합니다.",
        consent_text_version: signatureConsentVersion,
        contract_hash: contractHash,
        signature_hash: signatureHash,
        signature_storage_bucket: signatureFile.bucket,
        signature_storage_path: signatureFile.path,
        signature_storage_provider: signatureFile.provider,
        signature_storage_hash: signatureFile.sha256,
        signed_pdf_bucket: signedPdfFile.bucket,
        signed_pdf_path: signedPdfFile.path,
        signed_pdf_storage_provider: signedPdfFile.provider,
        signed_pdf_hash: signedPdfFile.sha256,
        signed_pdf_mime: signedPdfFile.content_type,
        signed_pdf_size: signedPdfFile.byte_size,
      },
      pdf_url: `/api/contracts/${existing.id}/final-pdf`,
      updated_at: signedAt,
    });

    const nextStore = {
      contracts: store.contracts.map((item, index) =>
        index === existingIndex ? updatedContract : item,
      ),
    };

    await writeStore(nextStore);
    response.json({ contract: updatedContract });
  } catch (error) {
    next(error);
  }
});

app.put("/api/contracts/:id", async (request, response, next) => {
  try {
    const contract = request.body?.contract as Contract | undefined;

    if (!contract || contract.id !== request.params.id) {
      response.status(400).json({ error: "Valid contract payload is required" });
      return;
    }

    const store = await readStore();
    const normalizedContract = normalizeContract(contract);
    const validationError = validateContractPayload(normalizedContract);

    if (validationError) {
      response.status(422).json({ error: validationError });
      return;
    }

    const existingIndex = store.contracts.findIndex((item) => item.id === contract.id);
    const existingContract =
      existingIndex >= 0 ? store.contracts[existingIndex] : undefined;
    const actor = request.header("X-DirectSign-Actor") ?? "advertiser";

    if (actor !== "advertiser" && actor !== "influencer") {
      response.status(403).json({ error: "Invalid actor" });
      return;
    }

    const accessError =
      actor === "influencer"
        ? verifyInfluencerContractWriteAccess(
            request,
            existingContract,
            normalizedContract,
          )
        : undefined;

    if (accessError) {
      response.status(403).json({ error: accessError });
      return;
    }

    if (actor === "advertiser") {
      const advertiserAuth = await requireAdvertiserSession(request, response);

      if (!advertiserAuth) {
        return;
      }

      if (
        existingContract &&
        !canAdvertiserAccessLegacyContract(advertiserAuth, existingContract)
      ) {
        response.status(403).json({ error: "Contract access is not allowed" });
        return;
      }

      if (!canAdvertiserAccessLegacyContract(advertiserAuth, normalizedContract)) {
        response.status(403).json({ error: "Contract ownership is not allowed" });
        return;
      }
    }

    if (
      actor === "advertiser" &&
      isContractSendAttempt(existingContract, normalizedContract) &&
      !(await isAdvertiserTargetApproved(normalizedContract.advertiser_id))
    ) {
      response.status(403).json({
        error:
          "Advertiser business verification approval is required before sending contracts",
      });
      return;
    }

    const nextContracts =
      existingIndex >= 0
        ? store.contracts.map((item) =>
            item.id === normalizedContract.id ? normalizedContract : item,
          )
        : [...store.contracts, normalizedContract];

    const nextStore = { contracts: nextContracts };
    await writeStore(nextStore);
    response.json({ contract: normalizedContract });
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[DirectSign API]", error);
    response.status(500).json({ error: "Internal server error" });
  },
);

if (isPreview) {
  const distDir = path.join(root, "dist");
  app.use(express.static(distDir));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(distDir, "index.html"));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", () => {
  console.log(
    `[DirectSign] ${isPreview ? "preview" : "dev"} server running on http://localhost:${port}`,
  );
});
