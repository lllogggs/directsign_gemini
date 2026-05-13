import express from "express";
import dotenv from "dotenv";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { createDemoContracts, createShareToken } from "../src/domain/contracts.js";
import type { Contract } from "../src/domain/contracts.js";
import type {
  InfluencerDashboardContract,
  InfluencerDashboardContractStage,
  InfluencerDashboardResponse,
  InfluencerDashboardTask,
} from "../src/domain/influencerDashboard";
import {
  findBrandProfileByHandle,
  findInfluencerProfileByHandle,
  mergeMarketplaceBrandProfiles,
  mergeMarketplaceInfluencerProfiles,
  marketplaceBrands,
  platformLabels,
  type CampaignProposalType,
  type MarketplaceBrandProfile,
  type MarketplaceInfluencerProfile,
} from "../src/domain/marketplace.js";
import {
  getProposalTypeLabel,
  type MarketplaceInboxRole,
  type MarketplaceMessageBucket,
  type MarketplaceMessageSummary,
  type MarketplaceMessageThread,
  type MarketplaceMessagesResponse,
  type MarketplaceProposalDirection,
  type MarketplaceProposalStatus,
} from "../src/domain/marketplaceInbox.js";
import {
  buildDefaultPublicProfileSettings,
  createMarketplaceProfileFromPublicSettings,
  getPublicProfileHandleError,
  normalizePublicProfileHandle,
  type InfluencerPublicProfileSettings,
} from "../src/domain/publicInfluencerProfile.js";

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
type InfluencerActivityCategory =
  | "mukbang"
  | "travel"
  | "beauty"
  | "fashion"
  | "fitness"
  | "tech"
  | "game"
  | "education"
  | "lifestyle"
  | "finance";
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

type SupportAccessStatus = "active" | "closed" | "revoked" | "expired";
type SupportAccessScope = "contract" | "contract_and_pdf";
type SupportAccessActorRole = "advertiser" | "influencer" | "admin" | "system";

interface SupportAccessAuditEvent {
  id: string;
  action:
    | "created"
    | "viewed_contract"
    | "viewed_pdf"
    | "closed"
    | "revoked"
    | "expired";
  actor_role: SupportAccessActorRole;
  actor_name?: string;
  description: string;
  ip?: string;
  user_agent?: string;
  created_at: string;
}

interface SupportAccessRequestRecord {
  id: string;
  contract_id: string;
  legacy_contract_id?: string;
  requester_profile_id?: string;
  requester_role: "advertiser" | "influencer";
  requester_name?: string;
  requester_email?: string;
  reason: string;
  scope: SupportAccessScope;
  status: SupportAccessStatus;
  expires_at: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  audit_events: SupportAccessAuditEvent[];
  created_at: string;
  updated_at: string;
}

interface SupportAccessStoreFile {
  support_access_requests: SupportAccessRequestRecord[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const localDataDirName = ["da", "ta"].join("");
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(root, localDataDirName);
const dataFile = path.join(dataDir, "contracts.json");
const verificationDataFile = path.join(dataDir, "verification-requests.json");
const supportAccessDataFile = path.join(dataDir, "support-access-requests.json");
const port = Number(process.env.PORT ?? 3000);
const isHostedRuntime =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.VERCEL_REGION) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const isProductionRuntime = process.env.NODE_ENV === "production" || isHostedRuntime;
const isPreview = process.argv.includes("--preview") || isProductionRuntime;
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
const allowProductionDemoMode =
  process.env.DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE === "true";

if (isProductionRuntime && demoMode && !allowProductionDemoMode) {
  throw new Error(
    "DIRECTSIGN_DEMO_MODE cannot be enabled in production. Set it to false before deploy.",
  );
}

if (isProductionRuntime && !demoMode) {
  if (!useSupabase) {
    throw new Error(
      "Production requires Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  if (!supabasePublishableKey) {
    throw new Error(
      "Production requires SUPABASE_PUBLISHABLE_KEY for public Auth calls.",
    );
  }
}

const runtimeSecretsFile = path.join(dataDir, "runtime-secrets.json");
const readConfiguredServerSecret = (name: string) => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

interface RuntimeSecretsFile {
  secrets?: Record<string, string>;
}

const readLocalRuntimeSecrets = () => {
  if (isProductionRuntime && !demoMode) return new Map<string, string>();

  try {
    const parsed = JSON.parse(
      fsSync.readFileSync(runtimeSecretsFile, "utf8"),
    ) as RuntimeSecretsFile;
    return new Map(
      Object.entries(parsed.secrets ?? {}).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" &&
          typeof entry[1] === "string" &&
          entry[1].trim().length > 0,
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[yeollock.me] failed to read local runtime secrets; generating fresh local secrets");
    }
    return new Map<string, string>();
  }
};

const localRuntimeSecrets = readLocalRuntimeSecrets();

const writeLocalRuntimeSecrets = () => {
  fsSync.mkdirSync(dataDir, { recursive: true });
  fsSync.writeFileSync(
    runtimeSecretsFile,
    `${JSON.stringify(
      { secrets: Object.fromEntries(localRuntimeSecrets) },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  try {
    fsSync.chmodSync(runtimeSecretsFile, 0o600);
  } catch {
    // Best effort on platforms that support POSIX file modes.
  }
};

const getLocalRuntimeSecret = (name: string, purpose: string) => {
  const existing = localRuntimeSecrets.get(name);
  if (existing && existing.trim().length >= 32) return existing;

  const value = randomBytes(48).toString("base64url");
  localRuntimeSecrets.set(name, value);
  writeLocalRuntimeSecrets();
  console.warn(
    `[yeollock.me] ${name} is not set; generated a local runtime secret in ${path.relative(
      root,
      runtimeSecretsFile,
    )} for ${purpose}. Set ${name} in production and keep it stable across deployments.`,
  );
  return value;
};

const obviousSecretPlaceholderPattern =
  /^(YOUR_|MY_|CHANGE_ME|REPLACE_ME|TODO|EXAMPLE|TEST_SECRET)/i;

const resolveServerSecret = ({
  name,
  purpose,
  requiredInProduction = false,
  generateLocal = false,
  minLength = 32,
}: {
  name: string;
  purpose: string;
  requiredInProduction?: boolean;
  generateLocal?: boolean;
  minLength?: number;
}) => {
  const configured = readConfiguredServerSecret(name);

  if (configured) {
    const looksUnsafe =
      configured.length < minLength || obviousSecretPlaceholderPattern.test(configured);
    if (looksUnsafe && isProductionRuntime && !demoMode) {
      throw new Error(
        `${name} must be a long random server-side value before production. Run npm run secrets:generate and store the generated value in the deployment environment.`,
      );
    }
    if (looksUnsafe) {
      console.warn(
        `[yeollock.me] ${name} looks short or placeholder-like; replace it with a long random value before production.`,
      );
    }
    return configured;
  }

  if (requiredInProduction && isProductionRuntime && !demoMode) {
    throw new Error(
      `${name} is required in production for ${purpose}. Run npm run secrets:generate and store the generated value in the deployment environment.`,
    );
  }

  return generateLocal ? getLocalRuntimeSecret(name, purpose) : undefined;
};

const adminAccessCode = readConfiguredServerSecret("ADMIN_ACCESS_CODE");
const configuredAdminOperatorName = readConfiguredServerSecret("ADMIN_OPERATOR_NAME");
const adminSessionSecret = resolveServerSecret({
  name: "ADMIN_SESSION_SECRET",
  purpose: "signing admin session cookies",
  requiredInProduction: isProductionRuntime || Boolean(adminAccessCode),
  generateLocal: Boolean(adminAccessCode) || !isProductionRuntime,
});

if (isProductionRuntime && !demoMode && !adminAccessCode?.trim()) {
  throw new Error("Production requires ADMIN_ACCESS_CODE for operator access.");
}

if (isProductionRuntime && !demoMode && !configuredAdminOperatorName?.trim()) {
  throw new Error("Production requires ADMIN_OPERATOR_NAME for audit attribution.");
}
const adminSessionCookie = "directsign_admin_session";
const adminSessionMaxAgeSeconds = 60 * 60 * 8;
const advertiserAccessCookie = "directsign_advertiser_access";
const advertiserRefreshCookie = "directsign_advertiser_refresh";
const influencerAccessCookie = "directsign_influencer_access";
const influencerRefreshCookie = "directsign_influencer_refresh";
const signedPdfAccessCookie = "yeollock_signed_pdf_access";
const influencerAccessMaxAgeSeconds = 60 * 60;
const influencerRefreshMaxAgeSeconds = 60 * 60 * 24 * 14;
const signedPdfAccessMaxAgeSeconds = 60 * 10;
const defaultAdvertiserTargetId =
  process.env.DIRECTSIGN_DEFAULT_ADVERTISER_ID ?? "adv_1";
const defaultInfluencerTargetId =
  process.env.DIRECTSIGN_DEFAULT_INFLUENCER_ID ?? "influencer_guest";
const privateStorageBucket =
  process.env.DIRECTSIGN_PRIVATE_STORAGE_BUCKET ?? "directsign-private";
const privateFilesDir = path.join(dataDir, "private-files");
const allowLocalPrivateFileFallback =
  (!isProductionRuntime && !useSupabase) ||
  demoMode ||
  (!isProductionRuntime &&
    process.env.DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK === "true");
const signatureConsentVersion = "directsign-signature-consent-v1";
const signatureConsentText =
  "계약 최종본, 모든 조항, 서명 증빙 보관 기준, 전자서명 안내 문서를 확인했고 전자서명에 동의합니다.";
const productName = process.env.PRODUCT_NAME ?? process.env.VITE_PRODUCT_NAME ?? "yeollock.me";
const adminOperatorName = configuredAdminOperatorName ?? `${productName} 운영자`;
const signupTermsVersion = "2026-05-06";
const signupPrivacyPolicyVersion = "2026-05-06";
const signedPdfFontCandidates = [
  process.env.SIGNED_PDF_FONT_PATH,
  path.join(root, "assets", "fonts", "NotoSansKR-Regular.ttf"),
  path.join(root, "public", "fonts", "NotoSansKR-Regular.ttf"),
  path.join(root, "public", "fonts", "NanumGothic-Regular.ttf"),
  "C:\\Windows\\Fonts\\malgun.ttf",
  "/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf",
  "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
].filter((candidate): candidate is string => Boolean(candidate));
let signedPdfFontCache:
  | { fileName: string; familyName: string; base64: string }
  | undefined;
const parsePositiveNumberEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const adminLoginMaxFailures = parsePositiveNumberEnv(
  process.env.ADMIN_LOGIN_MAX_FAILURES,
  5,
);
const adminLoginWindowMs =
  parsePositiveNumberEnv(process.env.ADMIN_LOGIN_WINDOW_SECONDS, 15 * 60) * 1000;
const adminLoginLockMs =
  parsePositiveNumberEnv(process.env.ADMIN_LOGIN_LOCK_SECONDS, 15 * 60) * 1000;
const publicAuthIpMaxAttempts = parsePositiveNumberEnv(
  process.env.PUBLIC_AUTH_IP_MAX_ATTEMPTS,
  40,
);
const publicAuthEmailMaxAttempts = parsePositiveNumberEnv(
  process.env.PUBLIC_AUTH_EMAIL_MAX_ATTEMPTS,
  8,
);
const publicAuthWindowMs =
  parsePositiveNumberEnv(process.env.PUBLIC_AUTH_WINDOW_SECONDS, 15 * 60) * 1000;
const sensitiveEndpointIpMaxAttempts = parsePositiveNumberEnv(
  process.env.SENSITIVE_ENDPOINT_IP_MAX_ATTEMPTS,
  60,
);
const sensitiveEndpointSubjectMaxAttempts = parsePositiveNumberEnv(
  process.env.SENSITIVE_ENDPOINT_SUBJECT_MAX_ATTEMPTS,
  20,
);
const sensitiveEndpointWindowMs =
  parsePositiveNumberEnv(
    process.env.SENSITIVE_ENDPOINT_WINDOW_SECONDS,
    15 * 60,
  ) * 1000;
const cspReportOnly =
  process.env.CONTENT_SECURITY_POLICY_REPORT_ONLY === "true" ||
  process.env.DIRECTSIGN_CSP_REPORT_ONLY === "true";
const shareTokenCipherPrefix = "enc:v1:";
const shareTokenEncryptionSecret = resolveServerSecret({
  name: "DIRECTSIGN_TOKEN_ENCRYPTION_SECRET",
  purpose: "encrypting legacy compatibility share tokens at rest",
  requiredInProduction: true,
  generateLocal: true,
});

export const app = express();
app.set("trust proxy", isHostedRuntime ? 1 : false);
app.use(express.json({ limit: "10mb" }));

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedConfiguredOrigins = [
  process.env.PUBLIC_SITE_URL,
  process.env.SITE_URL,
  process.env.VITE_SITE_URL,
  process.env.VITE_API_BASE_URL,
]
  .map((value) => {
    if (typeof value !== "string" || value.trim().length === 0) return undefined;
    try {
      return new URL(value).origin;
    } catch {
      return undefined;
    }
  })
  .filter((value): value is string => typeof value === "string" && value.length > 0);

const isAllowedRequestOrigin = (request: express.Request) => {
  const origin = request.header("origin");
  if (typeof origin !== "string" || origin.trim().length === 0) return true;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  if (allowedConfiguredOrigins.includes(originUrl.origin)) return true;

  const requestHost =
    request.header("x-forwarded-host") ?? request.header("host") ?? "";
  const requestProto =
    request.header("x-forwarded-proto") ?? request.protocol ?? "http";
  return `${requestProto}://${requestHost}` === originUrl.origin;
};

app.use((request, response, next) => {
  if (
    stateChangingMethods.has(request.method.toUpperCase()) &&
    !isAllowedRequestOrigin(request)
  ) {
    response.status(403).json({ error: "Cross-site request origin is not allowed" });
    return;
  }

  next();
});

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  if (isPreview) {
    response.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    response.setHeader(
      cspReportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "script-src 'self'",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      ].join("; "),
    );
  }
  next();
});

interface AdminLoginAttempt {
  failures: number;
  windowStartedAt: number;
  lockedUntil?: number;
}

const adminLoginAttempts = new Map<string, AdminLoginAttempt>();

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const publicAuthRateLimitBuckets = new Map<string, RateLimitBucket>();

const contractStatuses = new Set(["DRAFT", "REVIEWING", "NEGOTIATING", "APPROVED", "SIGNED"]);
const clauseStatuses = new Set([
  "PENDING_REVIEW",
  "APPROVED",
  "MODIFICATION_REQUESTED",
  "DELETION_REQUESTED",
]);
const shareTokenStatuses = new Set(["not_issued", "active", "expired", "revoked"]);
const pdfStatuses = new Set(["not_ready", "draft_ready", "signed_ready"]);
const verificationStatuses = new Set(["pending", "approved", "rejected"]);
const influencerPlatforms = new Set<InfluencerPlatform>([
  "instagram",
  "youtube",
  "tiktok",
  "naver_blog",
  "other",
]);
const influencerActivityCategories = new Set<InfluencerActivityCategory>([
  "mukbang",
  "travel",
  "beauty",
  "fashion",
  "fitness",
  "tech",
  "game",
  "education",
  "lifestyle",
  "finance",
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
const standardHttpPorts = new Set(["", "80", "443"]);
const ownershipChallengePattern = /^DS-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const evidenceFileMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const maxVerificationFileSize = 10 * 1024 * 1024;
const deliverableFileMimeTypes = evidenceFileMimeTypes;
const maxDeliverableFileSize = maxVerificationFileSize;
const signatureImageMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const maxSignatureImageSize = 1 * 1024 * 1024;
const maxOwnershipCheckBytes = 256 * 1024;
const deliverableReviewStatuses = new Set<DeliverableReviewStatus>([
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "waived",
]);
const advertiserDeliverableReviewStatuses = new Set<DeliverableReviewStatus>([
  "changes_requested",
  "approved",
  "rejected",
]);

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const getShareTokenCipherKey = () => {
  if (!shareTokenEncryptionSecret) return undefined;
  return createHash("sha256").update(shareTokenEncryptionSecret).digest();
};

const encryptShareTokenForLegacyStore = (value: string | undefined | null) => {
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
};

const decryptShareTokenFromLegacyStore = (value: string | undefined | null) => {
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
    console.warn("[yeollock.me] failed to decrypt legacy share token");
    return undefined;
  }
};

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

interface SupabaseAuthSession {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: SupabaseAuthUser;
}

type SupabaseSignupPayload =
  | (SupabaseAuthUser & Partial<SupabaseAuthSession>)
  | {
      user?: SupabaseAuthUser | null;
      session?: SupabaseAuthSession | null;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

interface SupabaseProfileRow {
  id: string;
  role: "marketer" | "influencer" | "admin";
  name: string;
  email: string;
  company_name?: string | null;
  activity_categories?: InfluencerActivityCategory[] | null;
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
  created_by_profile_id?: string | null;
  created_at?: string | null;
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
  id?: string;
  contract_id: string;
  order_no?: number | null;
  title?: string | null;
  body?: string | null;
  status: "pending" | "accepted" | "requested_change" | "rejected" | "countered" | "removed";
}

interface SupabaseShareLinkRow {
  contract_id: string;
  status: "active" | "expired" | "revoked";
  expires_at?: string | null;
}

type DeliverableReviewStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "waived";

interface SupabaseDeliverableRequirementRow {
  id: string;
  contract_id: string;
  deliverable_type: string;
  title: string;
  description?: string | null;
  quantity?: number | null;
  due_at?: string | null;
  review_required?: boolean | null;
  evidence_required?: boolean | null;
  order_no?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SupabaseDeliverableRow {
  id: string;
  contract_id: string;
  requirement_id?: string | null;
  creator_profile_id?: string | null;
  title?: string | null;
  url?: string | null;
  submitted_at?: string | null;
  review_status?: DeliverableReviewStatus | null;
  review_comment?: string | null;
  reviewed_by_profile_id?: string | null;
  reviewed_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SupabaseContractFileRow {
  id: string;
  contract_id: string;
  uploaded_by_profile_id?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  file_type?: string | null;
  bucket: string;
  storage_path: string;
  file_name?: string | null;
  content_type?: string | null;
  byte_size?: number | string | null;
  file_hash?: string | null;
  created_at?: string | null;
}

interface SupabaseSupportAccessRequestRow {
  id: string;
  contract_id: string;
  legacy_contract_id?: string | null;
  requester_profile_id?: string | null;
  requester_role: "advertiser" | "influencer";
  requester_name?: string | null;
  requester_email?: string | null;
  reason: string;
  scope: SupportAccessScope;
  status: SupportAccessStatus;
  expires_at: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  audit_events?: SupportAccessAuditEvent[] | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseSupportAccessEventRow {
  id: string;
  support_access_request_id: string;
  contract_id: string;
  action: SupportAccessAuditEvent["action"];
  actor_role: SupportAccessActorRole;
  actor_name?: string | null;
  description: string;
  ip?: string | null;
  user_agent?: string | null;
  event_hash: string;
  previous_event_hash?: string | null;
  created_at: string;
}

interface SupabaseMarketplaceInfluencerProfileRow {
  id: string;
  owner_profile_id: string;
  public_handle: string;
  display_name: string;
  headline: string;
  bio: string;
  location: string;
  avatar_label: string;
  categories?: string[] | null;
  audience: string;
  audience_tags?: string[] | null;
  collaboration_types?: CampaignProposalType[] | null;
  starting_price_label: string;
  response_time_label: string;
  verified_label: string;
  brand_fit?: string[] | null;
  recent_brands?: string[] | null;
  portfolio?: MarketplaceInfluencerProfile["portfolio"] | null;
  proposal_hints?: string[] | null;
  is_published: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SupabaseMarketplaceInfluencerChannelRow {
  id: string;
  profile_id: string;
  platform: InfluencerPlatform;
  label: string;
  handle: string;
  url?: string | null;
  followers_label?: string | null;
  performance_label?: string | null;
  sort_order?: number | null;
}

interface SupabaseMarketplaceBrandProfileRow {
  id: string;
  organization_id: string;
  public_handle: string;
  display_name: string;
  category: string;
  headline: string;
  description: string;
  location: string;
  logo_label: string;
  preferred_platforms?: InfluencerPlatform[] | null;
  proposal_types?: CampaignProposalType[] | null;
  budget_range_label: string;
  response_time_label: string;
  status_label: string;
  fit_tags?: string[] | null;
  audience_targets?: string[] | null;
  active_campaigns?: MarketplaceBrandProfile["activeCampaigns"] | null;
  recent_creators?: string[] | null;
  is_published: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SupabaseMarketplaceContactProposalRow {
  id: string;
  direction: MarketplaceProposalDirection;
  target_influencer_profile_id?: string | null;
  target_brand_profile_id?: string | null;
  target_handle: string;
  target_display_name: string;
  sender_profile_id?: string | null;
  sender_organization_id?: string | null;
  sender_brand_handle?: string | null;
  sender_influencer_handle?: string | null;
  sender_name: string;
  sender_intro: string;
  proposal_type: CampaignProposalType;
  proposal_summary: string;
  status: MarketplaceProposalStatus;
  created_at: string;
  updated_at: string;
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
  const key = supabasePublishableKey;

  if (!supabaseUrl || !key) {
    throw new Error("Supabase Auth is not configured");
  }

  return {
    apikey: key,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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

const protectLegacyContractForSupabase = (contract: Contract): Contract => {
  if (!contract.evidence?.share_token) return contract;

  return {
    ...contract,
    evidence: {
      ...contract.evidence,
      share_token: encryptShareTokenForLegacyStore(contract.evidence.share_token),
    },
  };
};

const restoreLegacyContractFromSupabase = (
  row: Pick<SupabaseContractRow, "contract" | "share_token">,
) => {
  const fallbackToken = decryptShareTokenFromLegacyStore(row.share_token);
  const contractToken = decryptShareTokenFromLegacyStore(
    row.contract?.evidence?.share_token,
  );
  const shareToken = contractToken ?? fallbackToken;

  if (!row.contract?.evidence || !shareToken) return row.contract;

  return {
    ...row.contract,
    evidence: {
      ...row.contract.evidence,
      share_token: shareToken,
    },
  };
};

const toSupabaseRow = (contract: Contract): SupabaseContractRow => {
  const normalizedContract = normalizeContract(contract);
  const protectedContract = protectLegacyContractForSupabase(normalizedContract);

  return {
    id: normalizedContract.id,
    advertiser_id: normalizedContract.advertiser_id,
    title: normalizedContract.title,
    status: normalizedContract.status,
    influencer_name: normalizedContract.influencer_info?.name,
    share_token:
      encryptShareTokenForLegacyStore(normalizedContract.evidence?.share_token) ??
      null,
    share_token_status:
      normalizedContract.evidence?.share_token_status ?? "not_issued",
    contract: protectedContract,
    created_at: normalizedContract.created_at,
    updated_at: normalizedContract.updated_at,
  };
};

const parseSupabaseError = async (response: Response) => {
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

const syncProfileEmailVerifiedAt = async (authUser: SupabaseAuthUser) => {
  const verifiedAt = authUser.email_confirmed_at ?? authUser.confirmed_at;
  if (!useSupabase || !authUser.id || !verifiedAt) return;

  const response = await fetchSupabase(
    "profiles",
    `?id=eq.${encodeURIComponent(authUser.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        email_verified_at: verifiedAt,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  await assertSupabaseOk(response, "Supabase profile email verification update");
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
  role === "marketer";

const isInfluencerRole = (role: SupabaseProfileRow["role"] | undefined) =>
  role === "influencer";

const requireAdvertiserSession = async (
  request: express.Request,
  response: express.Response,
) => {
  const auth = await authenticateAdvertiserRequest(request, response);

  if (!auth) {
    response.status(401).json({ error: "광고주 로그인이 필요합니다." });
    return undefined;
  }

  const profile = await readProfileByUserId(auth.user.id);

  if (!isAdvertiserRole(profile?.role)) {
    response.status(403).json({
      error: "광고주 계정 권한이 필요합니다. 광고주 계정으로 로그인해 주세요.",
    });
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
    response.status(401).json({ error: "인플루언서 로그인이 필요합니다." });
    return undefined;
  }

  const profile = await readProfileByUserId(auth.user.id);

  if (!isInfluencerRole(profile?.role)) {
    response.status(403).json({
      error: "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.",
    });
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
  const profileEmail = normalizeEmail(auth.profile.email ?? auth.user.email ?? "");
  const contractManagerEmail = normalizeEmail(contract.advertiser_info?.manager ?? "");
  const contractAdvertiserId = normalizeRequiredText(contract.advertiser_id);
  const isBoundToProfile =
    isUuid(contractAdvertiserId) && contractAdvertiserId === auth.profile.id;
  const isLegacyManagerEmailMatch =
    hasText(profileEmail) &&
    hasText(contractManagerEmail) &&
    contractManagerEmail.includes("@") &&
    profileEmail === contractManagerEmail;

  return isBoundToProfile || isLegacyManagerEmailMatch;
};

const canInfluencerAccessLegacyContract = (
  auth: InfluencerSession,
  contract: Contract,
) => {
  const profileEmail = normalizeEmail(auth.profile.email ?? auth.user.email ?? "");
  const contractEmail = normalizeEmail(contract.influencer_info.contact ?? "");

  return hasText(profileEmail) && profileEmail === contractEmail;
};

const supportAccessTable = "support_access_requests";
let supportAccessReadFallbackWarned = false;
let supportAccessWriteFallbackWarned = false;
let supportAccessEventWriteFallbackWarned = false;
const allowLocalSupportAccessStore = !useSupabase || demoMode;

const createMissingSupportAccessStoreError = () =>
  new Error(
    "Supabase support_access_requests table is required when Supabase storage is enabled.",
  );

const createMissingSupportAccessEventStoreError = () =>
  new Error(
    "Supabase support_access_events table is required when Supabase storage is enabled.",
  );

const isMissingSupabaseSupportAccessTableError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("support_access_requests") ||
    error.message.includes("schema cache") ||
    error.message.includes("Could not find the table") ||
    error.message.includes("relation")) &&
  (error.message.includes("404") ||
    error.message.includes("400") ||
    error.message.includes("PGRST205") ||
    error.message.includes("does not exist") ||
    error.message.includes("schema cache"));

const isMissingSupabaseSupportAccessEventTableError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("support_access_events") ||
    error.message.includes("schema cache") ||
    error.message.includes("Could not find the table") ||
    error.message.includes("relation")) &&
  (error.message.includes("404") ||
    error.message.includes("400") ||
    error.message.includes("PGRST205") ||
    error.message.includes("does not exist") ||
    error.message.includes("schema cache"));

const normalizeSupportAccessRequest = (
  row: SupportAccessRequestRecord | SupabaseSupportAccessRequestRow,
): SupportAccessRequestRecord => ({
  id: row.id,
  contract_id: row.contract_id,
  legacy_contract_id: row.legacy_contract_id ?? undefined,
  requester_profile_id: row.requester_profile_id ?? undefined,
  requester_role: row.requester_role,
  requester_name: row.requester_name ?? undefined,
  requester_email: row.requester_email ?? undefined,
  reason: row.reason,
  scope: row.scope ?? "contract",
  status: row.status,
  expires_at: row.expires_at,
  reviewed_by_name: row.reviewed_by_name ?? undefined,
  reviewed_at: row.reviewed_at ?? undefined,
  audit_events: Array.isArray(row.audit_events) ? row.audit_events : [],
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const normalizeSupportAccessEvent = (
  row: SupabaseSupportAccessEventRow,
): SupportAccessAuditEvent => ({
  id: row.id,
  action: row.action,
  actor_role: row.actor_role,
  actor_name: row.actor_name ?? undefined,
  description: row.description,
  ip: row.ip ?? undefined,
  user_agent: row.user_agent ?? undefined,
  created_at: row.created_at,
});

const attachSupportAccessEvents = async (
  records: SupportAccessRequestRecord[],
) => {
  if (!useSupabase || records.length === 0) return records;

  const ids = records.map((record) => record.id);
  const eventRows = await readSupabaseRows<SupabaseSupportAccessEventRow>(
    "support_access_events",
    `?select=*&support_access_request_id=in.(${ids.join(",")})&order=created_at.asc`,
    "support access events",
  );
  const eventsByRequestId = new Map<string, SupportAccessAuditEvent[]>();
  eventRows.forEach((row) => {
    const current = eventsByRequestId.get(row.support_access_request_id) ?? [];
    current.push(normalizeSupportAccessEvent(row));
    eventsByRequestId.set(row.support_access_request_id, current);
  });

  return records.map((record) => ({
    ...record,
    audit_events: eventsByRequestId.get(record.id) ?? record.audit_events ?? [],
  }));
};

const readSupportAccessRequestsFromFile = async () => {
  try {
    const contents = await fs.readFile(supportAccessDataFile, "utf8");
    const parsed = JSON.parse(contents) as SupportAccessStoreFile;

    if (!Array.isArray(parsed.support_access_requests)) {
      throw new Error("Invalid support access store");
    }

    return parsed.support_access_requests.map(normalizeSupportAccessRequest);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      console.warn(`[yeollock.me] resetting invalid support access store: ${code}`);
    }
    return [];
  }
};

const writeSupportAccessRequestsToFile = async (
  records: SupportAccessRequestRecord[],
) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${supportAccessDataFile}.tmp`;
  await fs.writeFile(
    tempFile,
    JSON.stringify({ support_access_requests: records }, null, 2),
    "utf8",
  );
  await fs.rename(tempFile, supportAccessDataFile);
};

const readSupportAccessRequests = async () => {
  if (useSupabase) {
    try {
      const rows = await readSupabaseRows<SupabaseSupportAccessRequestRow>(
        supportAccessTable,
        "?select=*&order=created_at.desc",
        "support access requests",
      );
      return attachSupportAccessEvents(rows.map(normalizeSupportAccessRequest));
    } catch (error) {
      if (!isMissingSupabaseSupportAccessTableError(error)) {
        throw error;
      }
      if (!allowLocalSupportAccessStore) {
        throw createMissingSupportAccessStoreError();
      }
      if (!supportAccessReadFallbackWarned) {
        console.warn(
          "[yeollock.me] support_access_requests table is not available; using local support access store.",
        );
        supportAccessReadFallbackWarned = true;
      }
    }
  }

  return readSupportAccessRequestsFromFile();
};

const insertSupportAccessRequest = async (
  record: SupportAccessRequestRecord,
) => {
  if (useSupabase) {
    try {
      const [inserted] = await insertSupabaseRowsReturning<SupabaseSupportAccessRequestRow>(
        supportAccessTable,
        [record as unknown as Record<string, unknown>],
        "support access request",
      );
      if (inserted) return normalizeSupportAccessRequest(inserted);
    } catch (error) {
      if (!isMissingSupabaseSupportAccessTableError(error)) {
        throw error;
      }
      if (!allowLocalSupportAccessStore) {
        throw createMissingSupportAccessStoreError();
      }
      if (!supportAccessWriteFallbackWarned) {
        console.warn(
          "[yeollock.me] support_access_requests table is not available; writing support access locally.",
        );
        supportAccessWriteFallbackWarned = true;
      }
    }
  }

  const current = await readSupportAccessRequestsFromFile();
  const next = [record, ...current.filter((item) => item.id !== record.id)];
  await writeSupportAccessRequestsToFile(next);
  return record;
};

const updateSupportAccessRequest = async (
  record: SupportAccessRequestRecord,
) => {
  const updatedRecord = {
    ...record,
    updated_at: new Date().toISOString(),
  };

  if (useSupabase) {
    try {
      const response = await fetchSupabase(
        supportAccessTable,
        `?id=eq.${encodeURIComponent(record.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(updatedRecord),
        },
      );
      await assertSupabaseOk(response, "Supabase support access update");
      const [updated] = (await response.json()) as SupabaseSupportAccessRequestRow[];
      if (updated) return normalizeSupportAccessRequest(updated);
    } catch (error) {
      if (!isMissingSupabaseSupportAccessTableError(error)) {
        throw error;
      }
      if (!allowLocalSupportAccessStore) {
        throw createMissingSupportAccessStoreError();
      }
    }
  }

  const current = await readSupportAccessRequestsFromFile();
  const next = current.map((item) =>
    item.id === updatedRecord.id ? updatedRecord : item,
  );
  await writeSupportAccessRequestsToFile(next);
  return updatedRecord;
};

const isSupportAccessActive = (record: SupportAccessRequestRecord) =>
  record.status === "active" &&
  new Date(record.expires_at).getTime() > Date.now();

const getActiveSupportAccessForContract = async (
  contractId: string,
  requestId?: string,
) => {
  const requests = await readSupportAccessRequests();
  return requests
    .filter(
      (record) =>
        record.contract_id === contractId &&
        (!requestId || record.id === requestId) &&
        isSupportAccessActive(record),
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
};

const ensureSupportAccessEventStoreAvailable = async () => {
  if (!useSupabase || allowLocalSupportAccessStore) return;

  try {
    await readSupabaseRows<Pick<SupabaseSupportAccessEventRow, "id">>(
      "support_access_events",
      "?select=id&limit=1",
      "support access events",
    );
  } catch (error) {
    if (!isMissingSupabaseSupportAccessEventTableError(error)) {
      throw error;
    }
    throw createMissingSupportAccessEventStoreError();
  }
};

const appendSupportAccessEventRow = async (
  requestRecord: Pick<SupportAccessRequestRecord, "id" | "contract_id">,
  event: SupportAccessAuditEvent,
) => {
  if (!useSupabase) return;

  try {
    const previousRows = await readSupabaseRows<Pick<SupabaseSupportAccessEventRow, "event_hash">>(
      "support_access_events",
      `?select=event_hash&support_access_request_id=eq.${encodeURIComponent(
        requestRecord.id,
      )}&order=created_at.desc&limit=1`,
      "support access events",
    );
    const previousEventHash = previousRows[0]?.event_hash;
    const hashPayload = {
      support_access_request_id: requestRecord.id,
      contract_id: requestRecord.contract_id,
      action: event.action,
      actor_role: event.actor_role,
      actor_name: event.actor_name ?? null,
      description: event.description,
      ip: event.ip ?? null,
      user_agent: event.user_agent ?? null,
      previous_event_hash: previousEventHash ?? null,
      created_at: event.created_at,
    };

    await insertSupabaseRowsReturning<SupabaseSupportAccessEventRow>(
      "support_access_events",
      [
        {
          id: event.id,
          support_access_request_id: requestRecord.id,
          contract_id: requestRecord.contract_id,
          action: event.action,
          actor_role: event.actor_role,
          actor_name: event.actor_name,
          description: event.description,
          ip: event.ip,
          user_agent: event.user_agent,
          event_hash: sha256Hex(JSON.stringify(hashPayload)),
          previous_event_hash: previousEventHash,
          created_at: event.created_at,
        },
      ],
      "support access event",
    );
  } catch (error) {
    if (!isMissingSupabaseSupportAccessEventTableError(error)) {
      throw error;
    }
    if (!allowLocalSupportAccessStore) {
      throw createMissingSupportAccessEventStoreError();
    }
    if (!supportAccessEventWriteFallbackWarned) {
      console.warn(
        "[yeollock.me] support_access_events table is not available; support access event rows will be skipped.",
      );
      supportAccessEventWriteFallbackWarned = true;
    }
  }
};

const appendSupportAccessAuditEvent = async (
  requestId: string,
  event: Omit<SupportAccessAuditEvent, "id" | "created_at">,
) => {
  const requests = await readSupportAccessRequests();
  const current = requests.find((item) => item.id === requestId);
  if (!current) return undefined;
  const auditEvent: SupportAccessAuditEvent = {
    ...event,
    id: randomUUID(),
    created_at: new Date().toISOString(),
  };

  if (useSupabase) {
    await appendSupportAccessEventRow(current, auditEvent);
    return current;
  }

  const updated = await updateSupportAccessRequest({
    ...current,
    audit_events: [
      ...(current.audit_events ?? []),
      auditEvent,
    ],
  });

  await appendSupportAccessEventRow(updated, auditEvent);
  return updated;
};

const bindContractToAdvertiser = async (
  auth: AdvertiserSession,
  contract: Contract,
) => {
  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  const companyName = normalizeRequiredText(
    contract.advertiser_info?.name ??
      organization?.name ??
      auth.profile.company_name ??
      auth.profile.name,
  );
  const manager = normalizeRequiredText(
    contract.advertiser_info?.manager ??
      auth.profile.name ??
      auth.profile.email ??
      auth.user.email,
  );

  return {
    ...contract,
    advertiser_id: auth.profile.id,
    advertiser_info: {
      name: companyName || auth.profile.name || "광고주",
      manager: manager || auth.profile.email || auth.user.email,
    },
  };
};

const getSupportAccessRequestIdFromRequest = (request: express.Request) =>
  normalizeOptionalText(request.header("X-Yeollock-Support-Access-Request")) ??
  normalizeOptionalText(request.header("X-DirectSign-Support-Access-Request")) ??
  normalizeOptionalText(request.query.support) ??
  normalizeOptionalText(request.query.support_access_request_id);

const resolveLegacyContractAccess = async (
  request: express.Request,
  response: express.Response,
  contract: Contract,
  options: {
    allowAdmin?: boolean;
    allowAdvertiser?: boolean;
    allowInfluencer?: boolean;
    allowShareToken?: boolean;
    sendError?: boolean;
  } = {},
) => {
  const {
    allowAdmin = true,
    allowAdvertiser = true,
    allowInfluencer = true,
    allowShareToken = true,
    sendError = true,
  } = options;

  if (allowAdvertiser) {
    try {
      const auth = await authenticateAdvertiserRequest(request, response);
      const profile = auth ? await readProfileByUserId(auth.user.id) : undefined;

      if (auth && isAdvertiserRole(profile?.role)) {
        const advertiserSession = { ...auth, profile: profile! };
        if (canAdvertiserAccessLegacyContract(advertiserSession, contract)) {
          return { role: "advertiser" as const, auth: advertiserSession };
        }
      }
    } catch {
      // Ignore this branch and let the remaining access strategies decide.
    }
  }

  if (allowInfluencer) {
    try {
      const auth = await authenticateInfluencerRequest(request, response);
      const profile = auth ? await readProfileByUserId(auth.user.id) : undefined;

      if (auth && isInfluencerRole(profile?.role)) {
        const influencerSession = { ...auth, profile: profile! };
        if (canInfluencerAccessLegacyContract(influencerSession, contract)) {
          return { role: "influencer" as const, auth: influencerSession };
        }
      }
    } catch {
      // Ignore this branch and let the final response stay generic.
    }
  }

  if (allowAdmin && verifyAdminSessionToken(getAdminSessionFromRequest(request))) {
    const supportAccessRequestId = getSupportAccessRequestIdFromRequest(request);

    if (!supportAccessRequestId) {
      if (sendError) {
        response
          .status(403)
          .json({ error: "활성화된 지원 열람 요청 정보가 필요합니다." });
      }
      return undefined;
    }

    const supportAccess = await getActiveSupportAccessForContract(
      contract.id,
      supportAccessRequestId,
    );
    if (supportAccess) {
      return { role: "admin" as const, supportAccess };
    }

    if (sendError) {
      response
        .status(403)
        .json({ error: "활성화된 지원 열람 요청이 있어야 열람할 수 있습니다." });
    }
    return undefined;
  }

  if (allowShareToken) {
    const shareAccessError = verifyInfluencerShareAccess(request, contract);
    if (!shareAccessError) {
      return { role: "share" as const };
    }
  }

  if (sendError) {
    response.status(403).json({ error: "이 계약을 볼 권한이 없습니다." });
  }

  return undefined;
};

type ResolvedLegacyContractAccess = NonNullable<
  Awaited<ReturnType<typeof resolveLegacyContractAccess>>
>;

const contractAccessActor = (
  access: ResolvedLegacyContractAccess | undefined,
  fallbackRole = "signed_pdf_cookie",
) => {
  if (!access) {
    return {
      actorProfileId: undefined,
      actorRole: fallbackRole,
      actorDisplayName: fallbackRole,
    };
  }

  if ("auth" in access) {
    return {
      actorProfileId: access.auth.profile.id,
      actorRole: access.role,
      actorDisplayName: access.auth.profile.name ?? access.auth.profile.email,
    };
  }

  if (access.role === "admin") {
    return {
      actorProfileId: undefined,
      actorRole: "admin",
      actorDisplayName: adminOperatorName,
    };
  }

  return {
    actorProfileId: undefined,
    actorRole: access.role,
    actorDisplayName: access.role,
  };
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

const signedPdfCookieOptions = (maxAgeSeconds = signedPdfAccessMaxAgeSeconds) =>
  [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    isPreview ? "Secure" : "",
  ].filter(Boolean).join("; ");

const createSignedPdfAccessToken = (contract: Contract) => {
  const signatureHash = contract.signature_data?.signature_hash;
  if (!shareTokenEncryptionSecret || !hasText(signatureHash)) return undefined;

  const payload = Buffer.from(
    JSON.stringify({
      contract_id: contract.id,
      signature_hash: signatureHash,
      expires_at: Date.now() + signedPdfAccessMaxAgeSeconds * 1000,
      nonce: randomBytes(16).toString("hex"),
    }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", shareTokenEncryptionSecret)
    .update(payload)
    .digest("hex");

  return `${payload}.${signature}`;
};

const verifySignedPdfAccessToken = (
  token: string | undefined,
  contract: Contract,
) => {
  if (!shareTokenEncryptionSecret || !token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expectedSignature = createHmac("sha256", shareTokenEncryptionSecret)
    .update(payload)
    .digest("hex");
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      contract_id?: string;
      signature_hash?: string;
      expires_at?: number;
    };

    return (
      parsed.contract_id === contract.id &&
      parsed.signature_hash === contract.signature_data?.signature_hash &&
      typeof parsed.expires_at === "number" &&
      parsed.expires_at >= Date.now()
    );
  } catch {
    return false;
  }
};

const hasSignedPdfCookieAccess = (
  request: express.Request,
  contract: Contract,
) =>
  verifySignedPdfAccessToken(
    parseCookies(request.header("cookie")).get(signedPdfAccessCookie),
    contract,
  );

const setSignedPdfAccessCookie = (
  response: express.Response,
  contract: Contract,
) => {
  const token = createSignedPdfAccessToken(contract);
  if (!token) return;

  response.append(
    "Set-Cookie",
    `${signedPdfAccessCookie}=${encodeURIComponent(token)}; ${signedPdfCookieOptions()}`,
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
    `${signedPdfAccessCookie}=; ${signedPdfCookieOptions(0)}`,
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
    `${signedPdfAccessCookie}=; ${signedPdfCookieOptions(0)}`,
  ]);
};

const getClientIp = (request: express.Request) => {
  return request.ip || request.socket.remoteAddress || "unknown";
};

const getAdminLoginAttemptKey = (request: express.Request) =>
  request.socket.remoteAddress || getClientIp(request);

const getAdminLoginThrottle = (key: string) => {
  const now = Date.now();
  const attempt = adminLoginAttempts.get(key);

  if (!attempt) return { blocked: false };
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((attempt.lockedUntil - now) / 1000),
    };
  }
  if (now - attempt.windowStartedAt > adminLoginWindowMs) {
    adminLoginAttempts.delete(key);
  }
  return { blocked: false };
};

const recordAdminLoginFailure = (key: string) => {
  const now = Date.now();
  const current = adminLoginAttempts.get(key);
  const attempt =
    current && now - current.windowStartedAt <= adminLoginWindowMs
      ? current
      : { failures: 0, windowStartedAt: now };

  attempt.failures += 1;
  if (attempt.failures >= adminLoginMaxFailures) {
    attempt.lockedUntil = now + adminLoginLockMs;
  }
  adminLoginAttempts.set(key, attempt);
  return attempt;
};

const clearAdminLoginFailures = (key: string) => {
  adminLoginAttempts.delete(key);
};

const normalizeRateLimitEmail = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const consumeRateLimitBucket = (
  key: string,
  maxAttempts: number,
  windowMs: number,
) => {
  const now = Date.now();
  const bucket = publicAuthRateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    publicAuthRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { blocked: false };
  }

  if (bucket.count >= maxAttempts) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  publicAuthRateLimitBuckets.set(key, bucket);
  return { blocked: false };
};

const getPublicAuthRateLimitKeys = (
  request: express.Request,
  action: string,
  email: unknown,
) => {
  const clientIp = getClientIp(request);
  const normalizedEmail = normalizeRateLimitEmail(email);
  const keys = [
    {
      key: `public-auth:${action}:ip:${clientIp}`,
      maxAttempts: publicAuthIpMaxAttempts,
    },
  ];

  if (hasText(normalizedEmail)) {
    keys.push({
      key: `public-auth:${action}:ip-email:${clientIp}:${normalizedEmail}`,
      maxAttempts: publicAuthEmailMaxAttempts,
    });
  }

  return keys;
};

const consumePublicAuthRateLimit = (
  request: express.Request,
  action: string,
  email: unknown,
) => {
  for (const limit of getPublicAuthRateLimitKeys(request, action, email)) {
    const result = consumeRateLimitBucket(
      limit.key,
      limit.maxAttempts,
      publicAuthWindowMs,
    );
    if (result.blocked) return result;
  }

  return { blocked: false };
};

const clearPublicAuthRateLimit = (
  request: express.Request,
  action: string,
  email: unknown,
) => {
  for (const limit of getPublicAuthRateLimitKeys(request, action, email)) {
    publicAuthRateLimitBuckets.delete(limit.key);
  }
};

const sendPublicAuthRateLimitResponse = (
  response: express.Response,
  throttle: { retryAfterSeconds?: number },
) => {
  response.setHeader("Retry-After", String(throttle.retryAfterSeconds ?? 60));
  response.status(429).json({
    error: "Too many authentication attempts. Try again later.",
    retry_after_seconds: throttle.retryAfterSeconds,
  });
};

const normalizeRateLimitSubject = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:@-]+/g, "-")
    .slice(0, 160);

const consumeSensitiveEndpointRateLimit = (
  request: express.Request,
  action: string,
  subject?: unknown,
) => {
  const clientIp = getClientIp(request);
  const limits = [
    {
      key: `sensitive:${action}:ip:${clientIp}`,
      maxAttempts: sensitiveEndpointIpMaxAttempts,
    },
  ];
  const normalizedSubject = normalizeRateLimitSubject(subject);

  if (hasText(normalizedSubject)) {
    limits.push({
      key: `sensitive:${action}:subject:${normalizedSubject}`,
      maxAttempts: sensitiveEndpointSubjectMaxAttempts,
    });
  }

  for (const limit of limits) {
    const result = consumeRateLimitBucket(
      limit.key,
      limit.maxAttempts,
      sensitiveEndpointWindowMs,
    );
    if (result.blocked) return result;
  }

  return { blocked: false };
};

const sendSensitiveRateLimitResponse = (
  response: express.Response,
  throttle: { retryAfterSeconds?: number },
) => {
  response.setHeader("Retry-After", String(throttle.retryAfterSeconds ?? 60));
  response.status(429).json({
    error: "Too many sensitive requests. Try again later.",
    retry_after_seconds: throttle.retryAfterSeconds,
  });
};

const getAppBaseUrl = (request: express.Request) => {
  const configuredUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configuredUrl) return configuredUrl;
  if (isPreview) {
    throw new Error("APP_URL is required for production email redirects");
  }

  const forwardedProto = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || request.protocol || "http";
  const host = request.get("host") || `localhost:${port}`;
  return `${protocol}://${host}`;
};

const buildEmailConfirmationRedirect = (
  request: express.Request,
  loginPath: string,
  nextPath: string,
) => {
  const url = new URL(loginPath, `${getAppBaseUrl(request)}/`);
  url.searchParams.set("next", nextPath);
  return url.toString();
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

const isSupabaseAuthUser = (value: unknown): value is SupabaseAuthUser =>
  typeof value === "object" &&
  value !== null &&
  hasText((value as { id?: unknown }).id);

const extractSupabaseSignupUser = (payload: SupabaseSignupPayload) => {
  const wrappedUser = (payload as { user?: unknown }).user;
  if (isSupabaseAuthUser(wrappedUser)) return wrappedUser;

  const sessionUser = (payload as { session?: { user?: unknown } | null }).session
    ?.user;
  if (isSupabaseAuthUser(sessionUser)) return sessionUser;

  if (isSupabaseAuthUser(payload)) return payload;
  return undefined;
};

const extractSupabaseSignupSession = (payload: SupabaseSignupPayload) => {
  const wrappedSession = (payload as { session?: SupabaseAuthSession | null })
    .session;
  if (wrappedSession?.access_token) return wrappedSession;

  const accessToken = (payload as { access_token?: string }).access_token;
  if (!hasText(accessToken)) return undefined;

  const user = extractSupabaseSignupUser(payload);
  if (!user) return undefined;

  return {
    access_token: accessToken,
    refresh_token: (payload as { refresh_token?: string }).refresh_token,
    expires_in: (payload as { expires_in?: number }).expires_in,
    user,
  } satisfies SupabaseAuthSession;
};

const createSupabaseSignupUser = async ({
  email,
  password,
  name,
  companyName,
  redirectTo,
}: {
  email: string;
  password: string;
  name: string;
  companyName?: string;
  redirectTo: string;
}) => {
  const url = new URL(supabaseAuthUrl("/signup"));
  url.searchParams.set("redirect_to", redirectTo);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: supabaseAuthHeaders(),
    body: JSON.stringify({
      email,
      password,
      data: {
        name,
        ...(companyName ? { company_name: companyName } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }

  const payload = (await response.json()) as SupabaseSignupPayload;
  const session = extractSupabaseSignupSession(payload);

  if (session?.access_token) {
    throw new Error(
      "Supabase 이메일 확인 설정이 꺼져 있습니다. Authentication > Sign In / Providers > Email에서 Confirm email을 켠 뒤 다시 가입해 주세요.",
    );
  }

  const authUser = extractSupabaseSignupUser(payload);
  if (!authUser?.id) {
    throw new Error("Supabase 가입 응답에서 사용자 정보를 확인할 수 없습니다.");
  }

  return authUser;
};

const getLoginFailureMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  const isAsciiMessage = message
    .split("")
    .every((character) => character.charCodeAt(0) <= 0x7f);

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials")
  ) {
    return "이메일 또는 비밀번호를 확인해 주세요.";
  }

  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("email not verified")
  ) {
    return `이메일 인증 후 로그인할 수 있습니다. 받은 편지함의 ${productName} 확인 메일을 열어주세요.`;
  }

  if (
    normalized.includes("influencer role is required") ||
    normalized.includes("influencer account is required")
  ) {
    return "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.";
  }

  if (
    normalized.includes("advertiser role is required") ||
    normalized.includes("advertiser account is required")
  ) {
    return "광고주 계정 권한이 필요합니다. 광고주 계정으로 로그인해 주세요.";
  }

  return hasText(message) && !isAsciiMessage ? message : fallback;
};

const getSignupFailureMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  const isAsciiMessage = message
    .split("")
    .every((character) => character.charCodeAt(0) <= 0x7f);

  if (
    normalized.includes("user already registered") ||
    normalized.includes("duplicate key") ||
    normalized.includes("foreign key")
  ) {
    return "이미 가입된 이메일이면 로그인해 주세요. 새 가입이라면 받은 편지함의 인증 메일을 확인해 주세요.";
  }

  return hasText(message) && !isAsciiMessage ? message : fallback;
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

const revokeSupabaseSession = async (accessToken: string | undefined) => {
  if (!useSupabase || !hasText(accessToken)) return;

  const response = await fetch(supabaseAuthUrl("/logout?scope=local"), {
    method: "POST",
    headers: supabaseAuthHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(
      `Supabase logout failed (${response.status}): ${await parseSupabaseError(response)}`,
    );
  }
};

const revokeSessionFromRequest = async (
  request: express.Request,
  accessCookieName: string,
  refreshCookieName: string,
) => {
  const cookies = parseCookies(request.header("cookie"));
  const bearerToken = getBearerToken(request);
  const cookieAccessToken = cookies.get(accessCookieName);
  const refreshToken = cookies.get(refreshCookieName);
  const accessToken = bearerToken ?? cookieAccessToken;

  if (hasText(accessToken)) {
    await revokeSupabaseSession(accessToken);
    return;
  }

  if (hasText(refreshToken)) {
    const session = await refreshSupabaseSession(refreshToken);
    await revokeSupabaseSession(session.access_token);
  }
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
    try {
      const session = await refreshSupabaseSession(refreshToken);
      if (response) {
        setInfluencerSessionCookies(response, session);
      }
      return {
        user: session.user,
        accessToken: session.access_token,
      };
    } catch {
      if (response) {
        clearInfluencerSessionCookies(response);
      }
    }
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
    try {
      const session = await refreshSupabaseSession(refreshToken);
      if (response) {
        setAdvertiserSessionCookies(response, session);
      }
      return {
        user: session.user,
        accessToken: session.access_token,
      };
    } catch {
      if (response) {
        clearAdvertiserSessionCookies(response);
      }
    }
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

const normalizeSelectedValues = <T extends string>(
  value: unknown,
  allowedValues: ReadonlySet<T>,
) => {
  const normalized = Array.isArray(value)
    ? value.map(normalizeRequiredText).filter(hasText)
    : [];
  const invalid = normalized.filter((item) => !allowedValues.has(item as T));
  const selected = [
    ...new Set(
      normalized.filter((item): item is T => allowedValues.has(item as T)),
    ),
  ];

  return { selected, invalid };
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateSignupPassword = (password: string) => {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "비밀번호는 영문과 숫자를 함께 포함해야 합니다.";
  }
  return undefined;
};

const hasAcceptedRequiredSignupConsents = (body: unknown) => {
  const payload = body as Record<string, unknown> | undefined;
  return payload?.terms_accepted === true && payload?.privacy_accepted === true;
};

const buildSignupLegalConsent = (
  request: express.Request,
  role: "advertiser" | "influencer",
) => {
  const acceptedAt = new Date().toISOString();

  return {
    terms_accepted_at: acceptedAt,
    privacy_policy_accepted_at: acceptedAt,
    terms_version: signupTermsVersion,
    privacy_policy_version: signupPrivacyPolicyVersion,
    signup_consent_snapshot: {
      role,
      terms_accepted: true,
      privacy_accepted: true,
      terms_version: signupTermsVersion,
      privacy_policy_version: signupPrivacyPolicyVersion,
      accepted_at: acceptedAt,
      ip: getClientIp(request),
      user_agent: request.header("user-agent") ?? "unknown",
      source: "signup",
    },
  };
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

const isSafeHttpUrl = (value: string | undefined) => {
  if (!hasText(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeChallengeCode = (value: unknown) =>
  normalizeRequiredText(value).toUpperCase();

const normalizeHostname = (hostname: string) =>
  hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");

const isPrivateIpAddress = (address: string) => {
  const normalized = normalizeHostname(address);
  const mappedIpv4 = normalized.startsWith("::ffff:")
    ? normalized.slice("::ffff:".length)
    : normalized;
  const version = isIP(mappedIpv4);

  if (version === 4) {
    const parts = mappedIpv4.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
      return true;
    }

    const [first, second, third, fourth] = parts;
    const privateOrReserved =
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224 ||
      (first === 255 && second === 255 && third === 255 && fourth === 255);

    return privateOrReserved;
  }

  if (version === 6) {
    const firstSegment = Number.parseInt(normalized.split(":")[0] || "0", 16);
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      (firstSegment & 0xffc0) === 0xfe80 ||
      (firstSegment & 0xff00) === 0xff00 ||
      normalized.startsWith("2001:db8:")
    );
  }

  return false;
};

const isBlockedExternalHostname = (hostname: string) => {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isPrivateIpAddress(normalized)
  );
};

const validateExternalHttpUrl = async (urlValue: string) => {
  let url: URL;

  try {
    url = new URL(urlValue);
  } catch {
    return "Valid public URL is required";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only HTTP(S) URLs are allowed";
  }

  if (url.username || url.password) {
    return "URL credentials are not allowed";
  }

  if (!standardHttpPorts.has(url.port)) {
    return "Only standard HTTP(S) ports are allowed";
  }

  if (isBlockedExternalHostname(url.hostname)) {
    return "Private or local URLs are not allowed";
  }

  try {
    await resolvePublicHttpTarget(url);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "URL host could not be verified";
  }

  return undefined;
};

const resolvePublicHttpTarget = async (url: URL) => {
  const hostname = normalizeHostname(url.hostname);
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });

  if (addresses.length === 0) {
    throw new Error("URL host could not be resolved");
  }

  if (addresses.some((address) => isPrivateIpAddress(address.address))) {
    throw new Error("URLs resolving to private networks are not allowed");
  }

  return addresses;
};

const fetchPublicHttpText = async (urlValue: string) => {
  const url = new URL(urlValue);
  const addresses = await resolvePublicHttpTarget(url);
  const address = addresses[0];
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const port = url.port ? Number(url.port) : isHttps ? 443 : 80;

  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = requestFn(
      {
        hostname: address.address,
        port,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        timeout: 4500,
        headers: {
          Accept: "text/html,text/plain,*/*",
          Host: url.host,
          "User-Agent": `${productName} ownership verifier`,
        },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;

        incoming.on("data", (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes > maxOwnershipCheckBytes) {
            request.destroy(new Error("Ownership proof page is too large"));
            return;
          }
          chunks.push(chunk);
        });

        incoming.on("end", () => {
          resolve({
            status: incoming.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Ownership check timed out"));
    });
    request.on("error", reject);
    request.end();
  });
};

const hasPublicHttpUrlHost = (urlValue: string) => {
  try {
    const url = new URL(urlValue);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      standardHttpPorts.has(url.port) &&
      !isBlockedExternalHostname(url.hostname)
    );
  } catch {
    return false;
  }
};

const isExpectedPlatformUrl = (
  platform: InfluencerPlatform,
  urlValue: string,
) => {
  if (platform === "other") return hasPublicHttpUrlHost(urlValue);

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

  try {
    const unsafeUrlError = await validateExternalHttpUrl(urlValue);
    if (unsafeUrlError) {
      return {
        status: "blocked",
        checked_at: checkedAt,
        error: unsafeUrlError,
      };
    }

    const response = await fetchPublicHttpText(urlValue);

    if ([401, 403, 429].includes(response.status)) {
      return {
        status: "blocked",
        checked_at: checkedAt,
        http_status: response.status,
      };
    }

    return {
      status: response.body.includes(challengeCode) ? "matched" : "not_found",
      checked_at: checkedAt,
      http_status: response.status,
    };
  } catch (error) {
    return {
      status: "failed",
      checked_at: checkedAt,
      error: error instanceof Error ? error.message : "Challenge check failed",
    };
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
    return "Verification evidence file must be 10MB or smaller";
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

const detectAllowedFileMimeType = (buffer: Buffer) => {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
};

const assertDeclaredMimeMatchesContent = (
  declaredType: string,
  buffer: Buffer,
  allowedTypes: ReadonlySet<string>,
) => {
  const detectedType = detectAllowedFileMimeType(buffer);
  return (
    allowedTypes.has(declaredType) &&
    detectedType === declaredType
  );
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
  const checkBody = await checkResponse.text();
  const bucketMissing =
    checkResponse.status === 404 ||
    (checkResponse.status === 400 &&
      (checkBody.includes('"statusCode":"404"') ||
        checkBody.toLowerCase().includes("bucket not found")));

  if (!bucketMissing) {
    throw new Error(
      `Supabase storage bucket check failed (${checkResponse.status}): ${checkBody}`,
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
      if (!allowLocalPrivateFileFallback) {
        throw error;
      }
      console.warn(
        `[${productName}] Supabase Storage unavailable, storing private file locally: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  if (!allowLocalPrivateFileFallback) {
    throw new Error(
      "Private file storage requires Supabase Storage in production. Set Supabase storage env vars or enable demo mode for non-production testing.",
    );
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

  if (
    contentType !== file.type ||
    !assertDeclaredMimeMatchesContent(contentType, buffer, evidenceFileMimeTypes)
  ) {
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

const loadSignedPdfFont = async () => {
  if (signedPdfFontCache) return signedPdfFontCache;

  for (const candidate of signedPdfFontCandidates) {
    try {
      const fontBuffer = await fs.readFile(candidate);
      signedPdfFontCache = {
        fileName: path.basename(candidate),
        familyName: "SignedPdfKR",
        base64: fontBuffer.toString("base64"),
      };
      return signedPdfFontCache;
    } catch {
      // Try the next configured/system font candidate.
    }
  }

  return undefined;
};

const buildSignedContractPdf = async ({
  contract,
  signedAt,
  contractHash,
  signatureHash,
  signatureDataUrl,
  signatureContentType,
  signerName,
  signerEmail,
  clientIp,
  consentText,
}: {
  contract: Contract;
  signedAt: string;
  contractHash: string;
  signatureHash: string;
  signatureDataUrl?: string;
  signatureContentType?: string;
  signerName: string;
  signerEmail: string;
  clientIp: string;
  consentText?: string;
}) => {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const signedPdfFont = await loadSignedPdfFont();
  const fontFamily = signedPdfFont?.familyName ?? "helvetica";
  if (signedPdfFont) {
    pdf.addFileToVFS(signedPdfFont.fileName, signedPdfFont.base64);
    pdf.addFont(signedPdfFont.fileName, signedPdfFont.familyName, "normal");
  }
  const margin = 40;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  let y = 48;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - margin) return;
    pdf.addPage();
    y = margin;
  };
  const addHeading = (text: string) => {
    ensureSpace(30);
    pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
    pdf.setFontSize(14);
    pdf.text(text, margin, y);
    y += 22;
  };
  const addLine = (text: string, indent = 0) => {
    const chunks = pdf.splitTextToSize(text, pageWidth - margin * 2 - indent) as string[];
    chunks.forEach((chunk) => {
      ensureSpace(16);
      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(9);
      pdf.text(chunk, margin + indent, y);
      y += 14;
    });
  };

  const campaign = contract.campaign ?? {};
  pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
  pdf.setFontSize(16);
  pdf.text(`${productName} Signed Contract`, margin, y);
  y += 28;

  addHeading("Parties and campaign");
  [
    `Contract ID: ${contract.id}`,
    `Title: ${contract.title}`,
    `Status at signing: ${contract.status}`,
    `Advertiser: ${contract.advertiser_info?.name ?? contract.advertiser_id}`,
    `Advertiser manager: ${contract.advertiser_info?.manager ?? "-"}`,
    `Influencer: ${contract.influencer_info.name}`,
    `Influencer contact: ${contract.influencer_info.contact}`,
    `Influencer channel: ${contract.influencer_info.channel_url}`,
    `Compensation: ${campaign.budget ?? "-"}`,
    `Period: ${campaign.period ?? ([campaign.start_date, campaign.end_date].filter(Boolean).join(" - ") || "-")}`,
    `Upload deadline: ${campaign.upload_due_at ?? campaign.deadline ?? "-"}`,
    `Review deadline: ${campaign.review_due_at ?? "-"}`,
    `Revision limit: ${campaign.revision_limit ?? "-"}`,
    `Disclosure text: ${campaign.disclosure_text ?? "-"}`,
    `Platforms: ${(campaign.platforms ?? []).join(", ") || "-"}`,
    `Deliverables: ${(campaign.deliverables ?? []).join(", ") || "-"}`,
  ].forEach((line) => addLine(line));

  addHeading("Clauses");
  contract.clauses.forEach((clause, index) => {
    addLine(`${index + 1}. [${clause.status}] ${clause.category}`, 0);
    addLine(clause.content, 12);
  });

  addHeading("Consent and signature evidence");
  [
    `Signer: ${signerName}`,
    `Signer email: ${signerEmail}`,
    `Signed at: ${signedAt}`,
    `Signed IP: ${clientIp}`,
    `Contract hash: ${contractHash}`,
    `Signature image hash: ${signatureHash}`,
    `Consent version: ${signatureConsentVersion}`,
    `Consent text: ${consentText || "The signer confirmed the contract terms and agreed to electronic signature."}`,
  ].forEach((line) => addLine(line));

  if (signatureDataUrl && signatureContentType) {
    try {
      const imageType =
        signatureContentType === "image/png"
          ? "PNG"
          : signatureContentType === "image/jpeg"
            ? "JPEG"
            : undefined;
      if (imageType) {
        ensureSpace(70);
        pdf.addImage(signatureDataUrl, imageType, margin, y, 160, 48);
        y += 60;
      }
    } catch {
      addLine("Signature image was stored separately and verified by hash.");
    }
  }

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

const legacyContractStatusLabels: Record<Contract["status"], string> = {
  DRAFT: "초안",
  REVIEWING: "검토",
  NEGOTIATING: "수정",
  APPROVED: "서명",
  SIGNED: "완료",
};

const formatWonCompact = (amount: number) => {
  if (!amount || amount <= 0) return "-";
  if (amount >= 100000000) {
    const value = amount / 100000000;
    return `${Number.isInteger(value) ? value : value.toFixed(1)}억원`;
  }
  if (amount >= 10000) {
    return `${Math.round(amount / 10000).toLocaleString("ko-KR")}만원`;
  }
  return `${amount.toLocaleString("ko-KR")}원`;
};

const buildAdminMetrics = async (
  contracts: Contract[],
  supportAccessRequests: SupportAccessRequestRecord[],
) => {
  const statusCounts = Array.from(contractStatuses).map((status) => ({
    status,
    label: legacyContractStatusLabels[status as Contract["status"]] ?? status,
    count: contracts.filter((contract) => contract.status === status).length,
  }));
  const totalFixedFeeAmount = contracts.reduce((total, contract) => {
    const amount = parseMoneyAmount(contract.campaign?.budget);
    return total + (amount ?? 0);
  }, 0);
  const activeSupportAccessRequests = supportAccessRequests.filter(isSupportAccessActive);

  return {
    contract_count: contracts.length,
    active_contract_count: contracts.filter((contract) => contract.status !== "SIGNED").length,
    completed_contract_count: contracts.filter((contract) => contract.status === "SIGNED").length,
    active_share_link_count: contracts.filter(
      (contract) => contract.evidence?.share_token_status === "active",
    ).length,
    total_fixed_fee_amount: totalFixedFeeAmount,
    total_fixed_fee_label: formatWonCompact(totalFixedFeeAmount),
    status_counts: statusCounts,
    support_access: {
      active_count: activeSupportAccessRequests.length,
      total_count: supportAccessRequests.length,
    },
    source: useSupabase ? "supabase" : "file",
    demo_mode: demoMode,
  };
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

const mapContractToV2Status = (contract: Contract) => {
  if (contract.status !== "SIGNED") return mapContractStatusToV2(contract.status);
  return (contract.campaign?.deliverables?.length ?? 0) > 0 ? "active" : "completed";
};

const mapClauseStatusToV2 = (status: Contract["clauses"][number]["status"]) => {
  const statuses: Record<Contract["clauses"][number]["status"], string> = {
    PENDING_REVIEW: "pending",
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

const campaignProposalTypes = new Set<CampaignProposalType>([
  "sponsored_post",
  "product_seeding",
  "ppl",
  "group_buy",
  "visit_review",
]);

const normalizeStringArrayForStorage = (
  value: unknown,
  fallback: string[] = [],
  maxItems = 8,
) => {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item) => normalizeRequiredText(item))
    .filter(hasText)
    .slice(0, maxItems);

  return normalized.length > 0 ? normalized : fallback;
};

const normalizeCampaignProposalTypes = (
  value: unknown,
  fallback: CampaignProposalType[] = ["sponsored_post", "product_seeding"],
) => {
  if (!Array.isArray(value)) return fallback;

  const normalized = value.filter(
    (item): item is CampaignProposalType =>
      typeof item === "string" && campaignProposalTypes.has(item as CampaignProposalType),
  );

  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
};

const normalizeMarketplacePortfolio = (
  value: unknown,
): MarketplaceInfluencerProfile["portfolio"] => {
  if (!Array.isArray(value)) {
    return [
      {
        title: "공개 프로필",
        brand: productName,
        result: "광고주 컨택 접수 가능",
      },
    ];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const title = normalizeRequiredText(record.title);
      const brand = normalizeRequiredText(record.brand);
      const result = normalizeRequiredText(record.result);
      if (!title || !brand || !result) return undefined;
      return { title, brand, result };
    })
    .filter((item): item is MarketplaceInfluencerProfile["portfolio"][number] =>
      Boolean(item),
    )
    .slice(0, 6);
};

const normalizeBrandCampaigns = (
  value: unknown,
): MarketplaceBrandProfile["activeCampaigns"] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const title = normalizeRequiredText(record.title);
      const type = normalizeRequiredText(record.type) as CampaignProposalType;
      const budget = normalizeRequiredText(record.budget);
      if (!title || !budget || !campaignProposalTypes.has(type)) return undefined;
      return { title, type, budget };
    })
    .filter((item): item is MarketplaceBrandProfile["activeCampaigns"][number] =>
      Boolean(item),
    )
    .slice(0, 6);
};

const buildMarketplaceAvatarLabel = (name: string, fallback = "IN") => {
  const normalized = name.trim();
  if (!normalized) return fallback;
  const ascii = normalized.replace(/[^a-zA-Z0-9]/g, "");
  if (ascii.length >= 2) return ascii.slice(0, 2).toUpperCase();
  if (ascii.length === 1) return ascii.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
};

const formatStoredMarketplacePlatformHandle = (
  handle: string,
  platform: InfluencerPlatform,
) => {
  const clean = handle.trim();
  if (!clean) return "계정 미입력";
  if (platform === "naver_blog") return clean.replace(/^@/, "");
  return clean.startsWith("@") ? clean : `@${clean}`;
};

const buildMarketplacePlatformUrl = (
  platform: InfluencerPlatform,
  handle: string,
) => {
  const clean = normalizePublicProfileHandle(handle);
  if (platform === "instagram") return `https://instagram.com/${clean}`;
  if (platform === "youtube") return `https://youtube.com/@${clean}`;
  if (platform === "tiktok") return `https://tiktok.com/@${clean}`;
  if (platform === "naver_blog") return `https://blog.naver.com/${clean}`;
  return `https://yeollock.me/${clean}`;
};

const groupMarketplaceChannelsByProfileId = (
  rows: SupabaseMarketplaceInfluencerChannelRow[],
) => {
  const grouped = new Map<string, SupabaseMarketplaceInfluencerChannelRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.profile_id) ?? [];
    current.push(row);
    grouped.set(row.profile_id, current);
  }

  for (const items of grouped.values()) {
    items.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  }

  return grouped;
};

const mapInfluencerProfileRowToPublicSettings = (
  row: SupabaseMarketplaceInfluencerProfileRow,
  channels: SupabaseMarketplaceInfluencerChannelRow[] = [],
): InfluencerPublicProfileSettings => ({
  ownerId: row.owner_profile_id,
  handle: row.public_handle,
  displayName: row.display_name,
  headline: row.headline,
  bio: row.bio,
  location: row.location,
  audience: row.audience,
  avatarLabel: row.avatar_label,
  categories: row.categories ?? [],
  brandFit: row.brand_fit ?? [],
  collaborationTypes: normalizeCampaignProposalTypes(row.collaboration_types),
  startingPriceLabel: row.starting_price_label,
  responseTimeLabel: row.response_time_label,
  platforms: channels.map((channel) => ({
    platform: channel.platform,
    handle: channel.handle,
    url: channel.url ?? undefined,
  })),
  published: row.is_published,
  updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
});

const mapInfluencerProfileRowToMarketplaceProfile = (
  row: SupabaseMarketplaceInfluencerProfileRow,
  channels: SupabaseMarketplaceInfluencerChannelRow[] = [],
): MarketplaceInfluencerProfile => {
  const settings = mapInfluencerProfileRowToPublicSettings(row, channels);
  const base = createMarketplaceProfileFromPublicSettings(settings);
  const mappedChannels = channels.map((channel) => ({
    platform: channel.platform,
    label: channel.label || platformLabels[channel.platform],
    handle: formatStoredMarketplacePlatformHandle(channel.handle, channel.platform),
    url: channel.url ?? buildMarketplacePlatformUrl(channel.platform, channel.handle),
    followersLabel: channel.followers_label ?? "계정 연동",
    performanceLabel: channel.performance_label ?? "프로필에서 확인",
  }));

  return {
    ...base,
    id: row.id,
    audienceTags: row.audience_tags ?? settings.categories,
    platforms: mappedChannels.length > 0 ? mappedChannels : base.platforms,
    verifiedLabel: row.verified_label,
    recentBrands: row.recent_brands ?? base.recentBrands,
    portfolio: normalizeMarketplacePortfolio(row.portfolio),
    proposalHints: normalizeStringArrayForStorage(
      row.proposal_hints,
      base.proposalHints,
      6,
    ),
  };
};

const mapBrandProfileRowToMarketplaceProfile = (
  row: SupabaseMarketplaceBrandProfileRow,
): MarketplaceBrandProfile => ({
  id: row.id,
  handle: row.public_handle,
  displayName: row.display_name,
  category: row.category,
  headline: row.headline,
  description: row.description,
  location: row.location,
  logoLabel: row.logo_label,
  preferredPlatforms: row.preferred_platforms ?? [],
  proposalTypes: normalizeCampaignProposalTypes(row.proposal_types),
  budgetRangeLabel: row.budget_range_label,
  responseTimeLabel: row.response_time_label,
  statusLabel: row.status_label,
  fitTags: row.fit_tags ?? [],
  audienceTargets: row.audience_targets ?? [],
  activeCampaigns: normalizeBrandCampaigns(row.active_campaigns),
  recentCreators: row.recent_creators ?? [],
});

const readMarketplaceInfluencerRows = async (query: string) => {
  if (!useSupabase) {
    return {
      profiles: [] as SupabaseMarketplaceInfluencerProfileRow[],
      channels: new Map<string, SupabaseMarketplaceInfluencerChannelRow[]>(),
    };
  }

  const profiles = await readSupabaseRows<SupabaseMarketplaceInfluencerProfileRow>(
    "marketplace_influencer_profiles",
    query,
    "marketplace influencer profiles",
  );

  if (profiles.length === 0) {
    return {
      profiles,
      channels: new Map<string, SupabaseMarketplaceInfluencerChannelRow[]>(),
    };
  }

  const profileFilter = postgrestInFilter(profiles.map((profile) => profile.id));
  const channelRows = await readSupabaseRows<SupabaseMarketplaceInfluencerChannelRow>(
    "marketplace_influencer_channels",
    `?select=*&profile_id=in.${profileFilter}&order=sort_order.asc`,
    "marketplace influencer channels",
  );

  return {
    profiles,
    channels: groupMarketplaceChannelsByProfileId(channelRows),
  };
};

const readMarketplaceInfluencerProfiles = async () => {
  const { profiles, channels } = await readMarketplaceInfluencerRows(
    "?select=*&is_published=eq.true&order=updated_at.desc",
  );
  const dbProfiles = profiles.map((profile) =>
    mapInfluencerProfileRowToMarketplaceProfile(
      profile,
      channels.get(profile.id) ?? [],
    ),
  );

  return mergeMarketplaceInfluencerProfiles(dbProfiles);
};

const readMarketplaceBrandProfiles = async () => {
  if (!useSupabase) return marketplaceBrands;

  const rows = await readSupabaseRows<SupabaseMarketplaceBrandProfileRow>(
    "marketplace_brand_profiles",
    "?select=*&is_published=eq.true&order=updated_at.desc",
    "marketplace brand profiles",
  );

  return mergeMarketplaceBrandProfiles(rows.map(mapBrandProfileRowToMarketplaceProfile));
};

const readStoredInfluencerPublicProfile = async (ownerProfileId: string) => {
  if (!useSupabase) return undefined;

  const { profiles, channels } = await readMarketplaceInfluencerRows(
    `?select=*&owner_profile_id=eq.${encodeURIComponent(ownerProfileId)}&limit=1`,
  );
  const profile = profiles[0];
  if (!profile) return undefined;

  return mapInfluencerProfileRowToPublicSettings(
    profile,
    channels.get(profile.id) ?? [],
  );
};

const upsertInfluencerPublicProfile = async ({
  authUser,
  profile,
  body,
}: {
  authUser: SupabaseAuthUser;
  profile: SupabaseProfileRow;
  body: Record<string, unknown>;
}) => {
  if (!useSupabase) {
    throw new Error("Supabase is required for public profile publishing");
  }

  const dashboard = await buildInfluencerDashboard(authUser);
  const defaults = buildDefaultPublicProfileSettings(dashboard);
  const handle = normalizePublicProfileHandle(normalizeRequiredText(body.handle));
  const handleError = getPublicProfileHandleError(handle);

  if (handleError) {
    return { ok: false as const, status: 422, error: handleError };
  }

  const existingHandleRows =
    await readSupabaseRows<SupabaseMarketplaceInfluencerProfileRow>(
      "marketplace_influencer_profiles",
      `?select=id,owner_profile_id,public_handle,display_name,headline,bio,location,avatar_label,categories,audience,audience_tags,collaboration_types,starting_price_label,response_time_label,verified_label,brand_fit,recent_brands,portfolio,proposal_hints,is_published,created_at,updated_at&public_handle=eq.${encodeURIComponent(handle)}&limit=1`,
      "marketplace influencer handle check",
    );
  const existingForHandle = existingHandleRows[0];

  if (existingForHandle && existingForHandle.owner_profile_id !== profile.id) {
    return {
      ok: false as const,
      status: 409,
      error: "이미 사용 중인 공개 주소입니다. 다른 주소를 선택해 주세요.",
    };
  }

  const now = new Date().toISOString();
  const rowId = stableUuid(`marketplace:influencer:${profile.id}`);
  const displayName =
    normalizeRequiredText(body.displayName) || defaults.displayName;
  const categories = normalizeStringArrayForStorage(
    body.categories,
    defaults.categories,
    6,
  );
  const audience =
    normalizeRequiredText(body.audience) ||
    (categories.length > 0
      ? `${categories.join(", ")} 관심 고객`
      : defaults.audience);
  const brandFit = normalizeStringArrayForStorage(
    body.brandFit,
    defaults.brandFit,
    6,
  );
  const collaborationTypes = normalizeCampaignProposalTypes(
    body.collaborationTypes,
    defaults.collaborationTypes,
  );
  const savedProfile: InfluencerPublicProfileSettings = {
    ...defaults,
    ownerId: profile.id,
    handle,
    displayName,
    headline: normalizeRequiredText(body.headline) || defaults.headline,
    bio: normalizeRequiredText(body.bio) || defaults.bio,
    location: normalizeRequiredText(body.location) || defaults.location,
    audience,
    avatarLabel:
      normalizeRequiredText(body.avatarLabel) ||
      buildMarketplaceAvatarLabel(displayName),
    categories,
    brandFit,
    collaborationTypes,
    startingPriceLabel:
      normalizeRequiredText(body.startingPriceLabel) ||
      defaults.startingPriceLabel,
    responseTimeLabel:
      normalizeRequiredText(body.responseTimeLabel) ||
      defaults.responseTimeLabel,
    platforms: dashboard.verification.approved_platforms.map((platform) => ({
      platform: platform.platform,
      handle: platform.handle,
      url: platform.url,
    })),
    published: true,
    updatedAt: now,
  };

  await upsertSupabaseV2Rows(
    "marketplace_influencer_profiles",
    [
      {
        id: rowId,
        owner_profile_id: profile.id,
        public_handle: savedProfile.handle,
        display_name: savedProfile.displayName,
        headline: savedProfile.headline,
        bio: savedProfile.bio,
        location: savedProfile.location,
        avatar_label: savedProfile.avatarLabel,
        categories: savedProfile.categories,
        audience: savedProfile.audience,
        audience_tags: savedProfile.categories,
        collaboration_types: savedProfile.collaborationTypes,
        starting_price_label: savedProfile.startingPriceLabel,
        response_time_label: savedProfile.responseTimeLabel,
        verified_label:
          savedProfile.platforms.length > 0
            ? "계정 프로필 연동"
            : "공개 프로필 설정",
        brand_fit: savedProfile.brandFit,
        recent_brands: ["입점 브랜드 제안 가능"],
        portfolio: [
          {
            title: "공개 프로필",
            brand: productName,
            result: "광고주 컨택 접수 가능",
          },
        ],
        proposal_hints: [
          "브랜드 소개와 광고 형태를 함께 보내면 검토가 빠릅니다.",
          "콘텐츠 사용 범위와 희망 일정을 제안에 포함해 주세요.",
          "최종 조건은 전자계약 단계에서 다시 확인합니다.",
        ],
        is_published: true,
        updated_at: now,
      },
    ],
    "owner_profile_id",
  );

  await deleteSupabaseV2Rows(
    "marketplace_influencer_channels",
    `?profile_id=eq.${encodeURIComponent(rowId)}`,
  );

  await upsertSupabaseV2Rows(
    "marketplace_influencer_channels",
    savedProfile.platforms.map((platform, index) => ({
      id: stableUuid(
        `marketplace:influencer-channel:${rowId}:${platform.platform}:${platform.handle}`,
      ),
      profile_id: rowId,
      platform: platform.platform,
      label: platformLabels[platform.platform],
      handle: platform.handle,
      url: platform.url ?? buildMarketplacePlatformUrl(platform.platform, platform.handle),
      followers_label: "계정 연동",
      performance_label: "프로필에서 확인",
      sort_order: index,
      updated_at: now,
    })),
  );

  return { ok: true as const, profile: savedProfile };
};

const validateMarketplaceProposal = (body: Record<string, unknown>) => {
  const senderName = normalizeRequiredText(
    body.senderName ?? body.brandName ?? body.creatorName,
  );
  const senderIntro = normalizeRequiredText(
    body.senderIntro ?? body.brandIntro ?? body.channelIntro,
  );
  const proposalType = normalizeRequiredText(body.proposalType) as CampaignProposalType;
  const proposalSummary = normalizeRequiredText(body.proposalSummary);

  if (!senderName || senderName.length > 80) {
    return { error: "이름 또는 브랜드명을 80자 이내로 입력해 주세요." };
  }
  if (!senderIntro || senderIntro.length > 1000) {
    return { error: "소개 내용을 1000자 이내로 입력해 주세요." };
  }
  if (!campaignProposalTypes.has(proposalType)) {
    return { error: "제안 가능한 광고 형태를 선택해 주세요." };
  }
  if (!proposalSummary || proposalSummary.length > 1500) {
    return { error: "제안 요약을 1500자 이내로 입력해 주세요." };
  }

  return { senderName, senderIntro, proposalType, proposalSummary };
};

const emptyMarketplaceMessageSummary = (): MarketplaceMessageSummary => ({
  inboxCount: 0,
  sentCount: 0,
  unreadCount: 0,
  submittedCount: 0,
  reviewedCount: 0,
  convertedCount: 0,
  closedCount: 0,
});

const getMarketplaceCounterpartHref = (
  role: MarketplaceInboxRole,
  row: SupabaseMarketplaceContactProposalRow,
  bucket: MarketplaceMessageBucket,
) => {
  if (bucket === "sent") {
    return row.direction === "advertiser_to_influencer"
      ? `/${row.target_handle}`
      : `/brands/${row.target_handle}`;
  }

  if (
    role === "advertiser" &&
    row.direction === "influencer_to_brand" &&
    row.sender_influencer_handle
  ) {
    return `/${row.sender_influencer_handle}`;
  }

  if (
    role === "influencer" &&
    row.direction === "advertiser_to_influencer" &&
    row.sender_brand_handle
  ) {
    return `/brands/${row.sender_brand_handle}`;
  }

  if (role === "advertiser" && row.direction === "influencer_to_brand") {
    return undefined;
  }

  if (role === "influencer" && row.direction === "advertiser_to_influencer") {
    return undefined;
  }

  return undefined;
};

const mapMarketplaceProposalToMessage = (
  row: SupabaseMarketplaceContactProposalRow,
  role: MarketplaceInboxRole,
): MarketplaceMessageThread => {
  const isAdvertiserInbox =
    role === "advertiser" && row.direction === "influencer_to_brand";
  const isInfluencerInbox =
    role === "influencer" && row.direction === "advertiser_to_influencer";
  const bucket: MarketplaceMessageBucket =
    isAdvertiserInbox || isInfluencerInbox ? "inbox" : "sent";
  const counterpartName = bucket === "inbox" ? row.sender_name : row.target_display_name;

  return {
    id: row.id,
    bucket,
    direction: row.direction,
    status: row.status,
    unread: bucket === "inbox" && row.status === "submitted",
    senderName: row.sender_name,
    senderIntro: row.sender_intro,
    targetName: row.target_display_name,
    targetHandle: row.target_handle,
    counterpartName,
    counterpartHref: getMarketplaceCounterpartHref(role, row, bucket),
    proposalType: row.proposal_type,
    proposalTypeLabel: getProposalTypeLabel(row.proposal_type),
    proposalSummary: row.proposal_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const buildMarketplaceMessagesResponse = (
  role: MarketplaceInboxRole,
  rows: SupabaseMarketplaceContactProposalRow[],
): MarketplaceMessagesResponse => {
  const threads = rows
    .map((row) => mapMarketplaceProposalToMessage(row, role))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const summary = threads.reduce((acc, thread) => {
    if (thread.bucket === "inbox") acc.inboxCount += 1;
    if (thread.bucket === "sent") acc.sentCount += 1;
    if (thread.unread) acc.unreadCount += 1;
    if (thread.status === "submitted") acc.submittedCount += 1;
    if (thread.status === "reviewed") acc.reviewedCount += 1;
    if (thread.status === "converted_to_contract") acc.convertedCount += 1;
    if (thread.status === "closed") acc.closedCount += 1;
    return acc;
  }, emptyMarketplaceMessageSummary());

  return { role, threads, summary };
};

const readMarketplaceProposalRows = async (
  query: string,
  label: string,
): Promise<SupabaseMarketplaceContactProposalRow[]> => {
  if (!useSupabase) return [];

  return readSupabaseRows<SupabaseMarketplaceContactProposalRow>(
    "marketplace_contact_proposals",
    query,
    label,
  );
};

const addSenderInfluencerHandlesToMarketplaceProposals = async (
  rows: SupabaseMarketplaceContactProposalRow[],
) => {
  const senderProfileIds = Array.from(
    new Set(
      rows
        .map((row) => row.sender_profile_id)
        .filter((id): id is string => hasText(id ?? undefined)),
    ),
  );

  if (!useSupabase || senderProfileIds.length === 0) return rows;

  const profileRows = await readSupabaseRows<SupabaseMarketplaceInfluencerProfileRow>(
    "marketplace_influencer_profiles",
    `?select=owner_profile_id,public_handle&owner_profile_id=in.${postgrestInFilter(
      senderProfileIds,
    )}`,
    "sender influencer public profile handles",
  );
  const handleByOwnerId = new Map(
    profileRows.map((profile) => [profile.owner_profile_id, profile.public_handle]),
  );

  return rows.map((row) => ({
    ...row,
    sender_influencer_handle: row.sender_profile_id
      ? handleByOwnerId.get(row.sender_profile_id) ?? null
      : null,
  }));
};

const addSenderBrandHandlesToMarketplaceProposals = async (
  rows: SupabaseMarketplaceContactProposalRow[],
) => {
  const senderOrganizationIds = Array.from(
    new Set(
      rows
        .map((row) => row.sender_organization_id)
        .filter((id): id is string => hasText(id ?? undefined)),
    ),
  );

  if (!useSupabase || senderOrganizationIds.length === 0) return rows;

  const brandRows = await readSupabaseRows<SupabaseMarketplaceBrandProfileRow>(
    "marketplace_brand_profiles",
    `?select=organization_id,public_handle&organization_id=in.${postgrestInFilter(
      senderOrganizationIds,
    )}`,
    "sender brand public profile handles",
  );
  const handleByOrganizationId = new Map(
    brandRows.map((brand) => [brand.organization_id, brand.public_handle]),
  );

  return rows.map((row) => ({
    ...row,
    sender_brand_handle: row.sender_organization_id
      ? handleByOrganizationId.get(row.sender_organization_id) ?? null
      : null,
  }));
};

const readMarketplaceMessagesForAdvertiser = async (
  auth: AdvertiserSession,
): Promise<MarketplaceMessagesResponse> => {
  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  const brandRows =
    useSupabase && organization
      ? await readSupabaseRows<SupabaseMarketplaceBrandProfileRow>(
          "marketplace_brand_profiles",
          `?select=id,public_handle&organization_id=eq.${encodeURIComponent(
            organization.id,
          )}`,
          "advertiser marketplace brand profiles",
        )
      : [];
  const brandIds = brandRows.map((row) => row.id).filter(Boolean);
  const incomingRows =
    brandIds.length > 0
      ? await readMarketplaceProposalRows(
          `?select=*&direction=eq.influencer_to_brand&target_brand_profile_id=in.${postgrestInFilter(
            brandIds,
          )}&order=created_at.desc`,
          "advertiser marketplace incoming proposals",
        )
      : [];
  const sentRows = await readMarketplaceProposalRows(
    `?select=*&direction=eq.advertiser_to_influencer&sender_profile_id=eq.${encodeURIComponent(
      auth.profile.id,
    )}&order=created_at.desc`,
    "advertiser marketplace sent proposals",
  );

  return buildMarketplaceMessagesResponse(
    "advertiser",
    uniqueRowsById([
      ...(await addSenderInfluencerHandlesToMarketplaceProposals(incomingRows)),
      ...sentRows,
    ]),
  );
};

const readMarketplaceMessagesForInfluencer = async (
  auth: InfluencerSession,
): Promise<MarketplaceMessagesResponse> => {
  const profileRows = useSupabase
    ? await readSupabaseRows<SupabaseMarketplaceInfluencerProfileRow>(
        "marketplace_influencer_profiles",
        `?select=id,public_handle&owner_profile_id=eq.${encodeURIComponent(
          auth.profile.id,
        )}`,
        "influencer marketplace public profiles",
      )
    : [];
  const publicProfileIds = profileRows.map((row) => row.id).filter(Boolean);
  const incomingRows =
    publicProfileIds.length > 0
      ? await readMarketplaceProposalRows(
          `?select=*&direction=eq.advertiser_to_influencer&target_influencer_profile_id=in.${postgrestInFilter(
            publicProfileIds,
          )}&order=created_at.desc`,
          "influencer marketplace incoming proposals",
        )
      : [];
  const sentRows = await readMarketplaceProposalRows(
    `?select=*&direction=eq.influencer_to_brand&sender_profile_id=eq.${encodeURIComponent(
      auth.profile.id,
    )}&order=created_at.desc`,
    "influencer marketplace sent proposals",
  );

  return buildMarketplaceMessagesResponse(
    "influencer",
    uniqueRowsById([
      ...(await addSenderBrandHandlesToMarketplaceProposals(incomingRows)),
      ...sentRows,
    ]),
  );
};

const readSupabaseStore = async (): Promise<ContractStoreFile> => {
  const response = await fetchSupabase(
    supabaseLegacyTable,
    "?select=contract,share_token&order=updated_at.desc",
  );

  await assertSupabaseOk(response, "Supabase legacy read");

  const rows = (await response.json()) as Array<
    Pick<SupabaseContractRow, "contract" | "share_token">
  >;

  return normalizeStore({
    contracts: rows
      .map(restoreLegacyContractFromSupabase)
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

  return productName;
};

const syncSupabaseV2Contract = async (contract: Contract) => {
  if (!isUuid(contract.id)) {
    console.warn(
      `[yeollock.me] skipped Supabase v2 sync for non-UUID contract id: ${contract.id}`,
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
      status: mapContractToV2Status(contract),
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
      created_by_profile_id: isUuid(contract.advertiser_id)
        ? contract.advertiser_id
        : undefined,
      next_actor_role: mapActorToPartyRole(contract.workflow?.next_actor),
      next_action: contract.workflow?.next_action,
      next_due_at: toIsoDateTime(contract.workflow?.due_at),
      version_no: Math.max(1, (contract.audit_events?.length ?? 0) + 1),
      signed_at:
        contract.status === "SIGNED"
          ? toIsoDateTime(contract.signature_data?.signed_at ?? contract.updated_at)
          : undefined,
      completed_at:
        mapContractToV2Status(contract) === "completed"
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
      profile_id: isUuid(contract.advertiser_id) ? contract.advertiser_id : undefined,
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

    const advertiserSignatureHash = hasText(contract.signature_data.adv_sign)
      ? sha256Hex(contract.signature_data.adv_sign)
      : undefined;
    const influencerSignatureHash =
      contract.signature_data.signature_hash ??
      (hasText(contract.signature_data.inf_sign)
        ? sha256Hex(contract.signature_data.inf_sign)
        : undefined);

    if (advertiserSignatureHash) {
      signatureRows.push({
        id: stableUuid(`${contract.id}:signature:advertiser`),
        contract_id: contract.id,
        signed_snapshot_id: snapshotId,
        signer_party_id: advertiserPartyId,
        signer_role: "advertiser",
        signer_name:
          contract.advertiser_info?.manager ?? contract.advertiser_info?.name ?? "광고주",
        signature_hash: advertiserSignatureHash,
        signature_storage_path: contract.signature_data.signature_storage_path,
        signed_ip: hasText(contract.signature_data.ip)
          ? contract.signature_data.ip
          : undefined,
        signed_user_agent: contract.signature_data.user_agent,
        consent_text_version: contract.signature_data.consent_text_version,
        signed_at: signedAt,
      });
    }

    if (influencerSignatureHash) {
      signatureRows.push({
        id: stableUuid(`${contract.id}:signature:influencer`),
        contract_id: contract.id,
        signed_snapshot_id: snapshotId,
        signer_party_id: influencerPartyId,
        signer_role: "influencer",
        signer_name: contract.influencer_info.name,
        signer_email: contract.influencer_info.contact,
        signature_hash: influencerSignatureHash,
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
  if (!isSafeHttpUrl(contract.influencer_info?.channel_url)) {
    return "Influencer channel URL must be an http(s) URL";
  }
  if (
    hasText(contract.campaign?.tracking_link) &&
    !isSafeHttpUrl(contract.campaign?.tracking_link)
  ) {
    return "Tracking link must be an http(s) URL";
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

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, stableJsonValue(nestedValue)]),
    );
  }

  return value ?? null;
};

const jsonEqual = (left: unknown, right: unknown) =>
  JSON.stringify(stableJsonValue(left)) === JSON.stringify(stableJsonValue(right));

const verifyInfluencerContractWriteAccess = (
  existing: Contract | undefined,
  incoming: Contract,
) => {
  if (!existing) {
    return "Influencer cannot create contracts";
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

const verifyAdvertiserContractWriteAccess = (
  existing: Contract | undefined,
  incoming: Contract,
) => {
  if (!existing) {
    if (incoming.status === "SIGNED" || incoming.signature_data || incoming.pdf_url) {
      return "Signatures and signed PDFs must be created through the signing endpoint";
    }

    return undefined;
  }

  if (incoming.status === "SIGNED" && existing.status !== "SIGNED") {
    return "Signed status must be created through the signing endpoint";
  }

  if (!jsonEqual(incoming.signature_data, existing.signature_data)) {
    return "Signature data must be created through the signing endpoint";
  }

  if (incoming.pdf_url !== existing.pdf_url) {
    return "Signed PDF URL must be created through the signing endpoint";
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

  if (incomingAuditEvents
    .slice(existingAuditEvents.length)
    .some((event) => event.actor !== "advertiser")) {
    return "Advertiser writes can only append advertiser audit events";
  }

  if (existing.status === "SIGNED") {
    if (incoming.status !== existing.status) {
      return "Signed contracts cannot be reopened";
    }

    if (!jsonEqual(incomingAuditEvents, existingAuditEvents)) {
      return "Signed contract audit history is locked";
    }

    if (!jsonEqual(incoming, existing)) {
      return "Signed contracts cannot be modified";
    }
  }

  return undefined;
};

const verifyInfluencerShareAccess = (
  request: express.Request,
  existing: Contract,
) => {
  const expectedToken = existing.evidence?.share_token;
  const providedToken =
    request.header("X-Yeollock-Share-Token") ??
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
      console.warn(`[yeollock.me] resetting invalid verification store: ${code}`);
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

const appendVerificationEvidenceAccessAudit = async (
  record: VerificationRequestRecord,
  request: express.Request,
) => {
  const existingAudit = Array.isArray(
    record.evidence_snapshot_json?.evidence_access_audit,
  )
    ? (record.evidence_snapshot_json!.evidence_access_audit as unknown[])
    : [];
  const auditEvent = {
    id: randomUUID(),
    action: "evidence_downloaded",
    actor_role: "admin",
    actor_name: adminOperatorName,
    ip: getClientIp(request),
    user_agent: request.header("user-agent") ?? "unknown",
    created_at: new Date().toISOString(),
  };
  const evidenceSnapshot = {
    ...(record.evidence_snapshot_json ?? {}),
    evidence_access_audit: [...existingAudit.slice(-49), auditEvent],
  };
  const updatedAt = new Date().toISOString();

  if (useSupabase) {
    await patchSupabaseRecord(
      "verification_requests",
      `?id=eq.${encodeURIComponent(record.id)}`,
      {
        evidence_snapshot_json: evidenceSnapshot,
        updated_at: updatedAt,
      },
      "Supabase verification evidence access audit",
    );
    return;
  }

  const records = await readVerificationRequests();
  await writeVerificationRequests(
    records.map((item) =>
      item.id === record.id
        ? {
            ...item,
            evidence_snapshot_json: evidenceSnapshot,
            updated_at: updatedAt,
          }
        : item,
    ),
  );
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
    const profileVerificationStatus =
      record.target_type === "influencer_account"
        ? deriveVerificationStatus(
            (await readVerificationRequests()).filter(
              (request) =>
                request.target_type === "influencer_account" &&
                (request.profile_id === record.profile_id ||
                  request.target_id === record.profile_id ||
                  (hasText(record.submitted_by_email) &&
                    normalizeEmail(request.submitted_by_email ?? "") ===
                      normalizeEmail(record.submitted_by_email))),
            ),
            record.status,
          )
        : record.status;

    await patchSupabaseRecord(
      "profiles",
      `?id=eq.${encodeURIComponent(record.profile_id)}`,
      {
        verification_status: profileVerificationStatus,
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

const getInfluencerVerificationRequestsForAuth = async (
  auth: InfluencerSession,
) => {
  const userEmail = normalizeEmail(auth.profile.email ?? auth.user.email ?? "");
  return (await readVerificationRequests()).filter(
    (request) =>
      request.target_type === "influencer_account" &&
      (request.profile_id === auth.profile.id ||
        request.target_id === auth.profile.id ||
        (hasText(userEmail) &&
          normalizeEmail(request.submitted_by_email ?? "") === userEmail)),
  );
};

const deriveVerificationStatus = (
  requests: VerificationRequestRecord[],
  fallback?: VerificationStatus | "not_submitted",
): VerificationStatus => {
  if (requests.some((request) => request.status === "approved")) {
    return "approved";
  }

  const latest = [...requests].sort((a, b) =>
    parseDateDescending(a.created_at, b.created_at),
  )[0];

  return latest?.status ?? fallback ?? "not_submitted";
};

const getContractRequiredInfluencerPlatforms = (contract: Contract) => {
  const platforms =
    contract.campaign?.platforms?.map((platform) =>
      normalizeInfluencerPlatform(mapPlatformToV2(platform)),
    ) ?? [];
  const inferred = normalizeInfluencerPlatform(
    mapPlatformToV2(inferPlatformFromUrl(contract.influencer_info.channel_url) ?? "OTHER"),
  );

  return Array.from(new Set(platforms.length > 0 ? platforms : [inferred]));
};

const normalizeComparableUrl = (value: string | undefined) => {
  if (!hasText(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return undefined;
  }
};

const verificationMatchesPlatformAccount = (
  request: VerificationRequestRecord,
  platform: InfluencerPlatform,
  platformUrl?: string,
) => {
  if (request.status !== "approved" || request.platform !== platform) return false;
  if (!hasText(platformUrl)) return false;

  const inferredPlatform = normalizeInfluencerPlatform(
    mapPlatformToV2(inferPlatformFromUrl(platformUrl) ?? "OTHER"),
  );

  if (inferredPlatform !== platform) return false;

  const contractUrl = normalizeComparableUrl(platformUrl);
  const verifiedUrl = normalizeComparableUrl(request.platform_url);
  if (!contractUrl || !verifiedUrl) return false;
  return contractUrl === verifiedUrl;
};

const verificationMatchesContractPlatform = (
  request: VerificationRequestRecord,
  platform: InfluencerPlatform,
  contract: Contract,
) => {
  return verificationMatchesPlatformAccount(
    request,
    platform,
    contract.influencer_info.channel_url,
  );
};

const resolveInfluencerContractVerification = async (
  auth: InfluencerSession,
  contract: Contract,
) => {
  const requests = await getInfluencerVerificationRequestsForAuth(auth);
  const requiredPlatforms = getContractRequiredInfluencerPlatforms(contract);
  const missingPlatforms = requiredPlatforms.filter(
    (platform) =>
      !requests.some((request) =>
        verificationMatchesContractPlatform(request, platform, contract),
      ),
  );

  return {
    ok: missingPlatforms.length === 0,
    requiredPlatforms,
    missingPlatforms,
    approvedRequests: requests.filter((request) => request.status === "approved"),
  };
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
    targetId: organization?.id ?? auth.profile.id,
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
  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  const requests = await readVerificationRequests();
  const targetIds = Array.from(
    new Set(
      [
        context.targetId,
        auth.profile.id,
        organization?.id,
      ].filter((value): value is string => hasText(value)),
    ),
  );
  const advertiserLatest = requests
    .filter(
      (request) =>
        request.target_type === "advertiser_organization" &&
        request.verification_type === "business_registration_certificate" &&
        (
          targetIds.includes(request.target_id) ||
          request.profile_id === auth.profile.id ||
          (hasText(organization?.id) && request.organization_id === organization?.id) ||
          (
            hasText(organization?.business_verification_request_id) &&
            request.id === organization?.business_verification_request_id
          )
        ),
    )
    .sort((a, b) => parseDateDescending(a.created_at, b.created_at))[0];
  const advertiserStatus =
    advertiserLatest?.status === "approved" && !hasText(advertiserLatest.reviewed_at)
      ? "pending"
      : (advertiserLatest?.status ?? "not_submitted");

  return {
    advertiser: {
      target_type: "advertiser_organization" as const,
      target_id: context.targetId,
      status: advertiserStatus,
      latest_request: advertiserLatest,
      account: {
        name: auth.profile.name,
        company_name:
          organization?.name ?? auth.profile.company_name ?? context.subjectName,
        email: auth.profile.email ?? auth.user.email,
        business_registration_number:
          organization?.business_registration_number ?? undefined,
        representative_name: organization?.representative_name ?? undefined,
      },
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
  const requests = await getInfluencerVerificationRequestsForAuth(auth);
  const influencerLatest = requests.sort((a, b) =>
    parseDateDescending(a.created_at, b.created_at),
  )[0];
  const status = deriveVerificationStatus(
    requests,
    auth.profile.verification_status ?? "not_submitted",
  );
  const approvedPlatforms = requests
    .filter((request) => request.status === "approved" && request.platform && request.platform_handle)
    .map((request) => ({
      platform: request.platform!,
      handle: request.platform_handle!,
      url: request.platform_url,
      approved_at: request.reviewed_at,
    }));

  return {
    advertiser: emptyVerificationProfile(
      "advertiser_organization",
      defaultAdvertiserTargetId,
    ),
    influencer: {
      target_type: "influencer_account" as const,
      target_id: auth.profile.id,
      status,
      latest_request: influencerLatest,
      approved_platforms: approvedPlatforms,
      account: {
        name: auth.profile.name,
        email: auth.profile.email ?? auth.user.email,
        platform_handle: influencerLatest?.platform_handle,
        platform_url: influencerLatest?.platform_url,
      },
    },
  };
};

const isAdvertiserApprovedForContractSend = async (
  auth: AdvertiserSession,
  contract: Contract,
) => {
  if (auth.profile.role === "admin") return true;

  const organization = await readDefaultOrganizationForProfile(auth.profile.id);

  const targetIds = Array.from(
    new Set(
      [
        auth.profile.id,
        organization?.id,
        contract.advertiser_id,
      ].filter((value): value is string => hasText(value)),
    ),
  );

  const requests = await readVerificationRequests();
  const relevantRequests = requests
    .filter(
      (request) =>
        request.target_type === "advertiser_organization" &&
        request.verification_type === "business_registration_certificate" &&
        (
          targetIds.includes(request.target_id) ||
          request.profile_id === auth.profile.id ||
          (hasText(organization?.id) && request.organization_id === organization?.id) ||
          (
            hasText(organization?.business_verification_request_id) &&
            request.id === organization?.business_verification_request_id
          )
        ),
    )
    .sort((a, b) => parseDateDescending(a.created_at, b.created_at));
  const latest = relevantRequests[0];

  return latest?.status === "approved" && hasText(latest.reviewed_at);
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

const buildServerAuthoredContract = (
  actor: Exclude<AuditActor, "system">,
  existing: Contract | undefined,
  incoming: Contract,
) => {
  const preservedAuditEvents = existing?.audit_events ?? [];
  const incomingAuditEvents = incoming.audit_events ?? [];
  const hadClientAppendedAudit =
    incomingAuditEvents.length > preservedAuditEvents.length;

  let action = "";
  let description = "";

  if (!existing) {
    action = incoming.status === "DRAFT" ? "draft_saved" : "contract_created";
    description =
      incoming.status === "DRAFT"
        ? "광고주가 계약 초안을 저장했습니다."
        : "광고주가 계약을 생성했습니다.";
  } else if (actor === "advertiser" && isContractSendAttempt(existing, incoming)) {
    action = "share_link_issued";
    description = "광고주 인증 확인 후 계약 공유 링크를 발급했습니다.";
  } else if (existing.status !== incoming.status) {
    action = "contract_status_changed";
    description = `${actorDisplayName(incoming, actor) ?? actor}가 계약 상태를 ${incoming.status}(으)로 변경했습니다.`;
  } else if (hadClientAppendedAudit) {
    action =
      actor === "influencer"
        ? "contract_review_updated"
        : "contract_updated";
    description =
      actor === "influencer"
        ? "인플루언서가 계약 조항 검토 결과를 제출했습니다."
        : "광고주가 계약 내용을 저장했습니다.";
  }

  if (!action) {
    return {
      ...incoming,
      audit_events: preservedAuditEvents,
    };
  }

  const serverEvent: NonNullable<Contract["audit_events"]>[number] = {
    id: randomUUID(),
    actor,
    action,
    description,
    created_at: new Date().toISOString(),
  };

  const relatedClauseId = incomingAuditEvents
    .slice(preservedAuditEvents.length)
    .find((event) => hasText(event.related_clause_id))?.related_clause_id;

  if (relatedClauseId) {
    serverEvent.related_clause_id = relatedClauseId;
  }

  return {
    ...incoming,
    audit_events: [...preservedAuditEvents, serverEvent],
  };
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
  instagram: "인스타그램",
  youtube: "유튜브",
  tiktok: "틱톡",
  naver_blog: "네이버 블로그",
  other: "기타",
};

const normalizeInfluencerPlatform = (
  value: string | undefined | null,
): InfluencerPlatform => {
  const normalized = value ?? "";
  return influencerPlatforms.has(normalized as InfluencerPlatform)
    ? (normalized as InfluencerPlatform)
    : "other";
};

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
    label: "서명 준비",
    statusLabel: "서명 대기",
    actionLabel: "인증 후 서명",
    nextAction: "최종본 확인과 플랫폼 계정 인증 승인이 끝나면 전자서명을 완료할 수 있습니다.",
  },
  deliverables_due: {
    label: "콘텐츠 제출",
    statusLabel: "콘텐츠 제출 필요",
    actionLabel: "제출하기",
    nextAction: "서명 완료 후 콘텐츠 링크나 증빙 파일을 제출해 주세요.",
  },
  deliverables_review: {
    label: "검수 대기",
    statusLabel: "광고주 검수 중",
    actionLabel: "제출 내역 보기",
    nextAction: "제출한 콘텐츠를 광고주가 검수하고 있습니다.",
  },
  signed: {
    label: "완료",
    statusLabel: "서명 완료",
    actionLabel: "완료본 보기",
    nextAction: "서명본과 감사 기록을 보관하세요.",
  },
  completed: {
    label: "완료",
    statusLabel: "계약 완료",
    actionLabel: "완료 내역 보기",
    nextAction: "모든 콘텐츠 검수와 계약 증빙이 완료되었습니다.",
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
  if (status === "completed") return "completed";
  if (status === "active") return "signed";
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
  const viewerContractId = legacyContract?.id ?? contractId;
  const token = legacyContract?.evidence?.share_token;
  const tokenActive = legacyContract?.evidence?.share_token_status === "active";
  const suffix = token && tokenActive ? `?token=${encodeURIComponent(token)}` : "";
  return `/contract/${viewerContractId}${suffix}`;
};

const buildVerificationHref = (contractId: string, legacyContract?: Contract) => {
  const viewerContractId = legacyContract?.id ?? contractId;
  const token = legacyContract?.evidence?.share_token;
  const suffix = token ? `&token=${encodeURIComponent(token)}` : "";
  return `/influencer/verification?contractId=${encodeURIComponent(viewerContractId)}${suffix}`;
};

const getLegacyPlatformAccounts = (
  contract: Contract,
): InfluencerDashboardContract["platform_accounts"] => {
  const platforms =
    contract.campaign?.platforms?.map((platform) =>
      normalizeInfluencerPlatform(mapPlatformToV2(platform)),
    ) ?? [
      normalizeInfluencerPlatform(
        mapPlatformToV2(
          inferPlatformFromUrl(contract.influencer_info.channel_url) ?? "OTHER",
        ),
      ),
    ];
  const channelPlatform = normalizeInfluencerPlatform(
    mapPlatformToV2(inferPlatformFromUrl(contract.influencer_info.channel_url) ?? "OTHER"),
  );

  return [...new Set(platforms)].map((platform) => ({
    platform,
    url:
      platform === channelPlatform && hasText(contract.influencer_info.channel_url)
        ? contract.influencer_info.channel_url
        : undefined,
  }));
};

const getV2PlatformAccounts = (
  platforms: SupabaseContractPlatformRow[],
  legacyContract?: Contract,
): InfluencerDashboardContract["platform_accounts"] => {
  if (platforms.length === 0 && legacyContract) {
    return getLegacyPlatformAccounts(legacyContract);
  }

  if (platforms.length === 0) {
    return [{ platform: "other" }];
  }

  return platforms.map((platform) => ({
    platform: normalizeInfluencerPlatform(platform.platform),
    url: platform.url ?? undefined,
  }));
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
}: {
  contract: SupabaseContractV2Row;
  legacyContract?: Contract;
  parties: SupabaseContractPartyRow[];
  platforms: SupabaseContractPlatformRow[];
  pricingTerm?: SupabaseContractPricingTermRow;
  clauses: SupabaseContractClauseRow[];
  deliverableRequirements: SupabaseDeliverableRequirementRow[];
  deliverables: SupabaseDeliverableRow[];
}): InfluencerDashboardContract => {
  let stage = inferDashboardStage(contract.status, contract.next_actor_role);
  const advertiserParty =
    parties.find((party) => ["advertiser", "agency", "marketer"].includes(party.party_role)) ??
    parties.find((party) => party.party_role !== "influencer");
  const influencerParty = parties.find((party) => party.party_role === "influencer");
  const normalizedPlatforms = platforms.length
    ? platforms.map((platform) => normalizeInfluencerPlatform(platform.platform))
    : (legacyContract?.campaign?.platforms?.map((platform) =>
        normalizeInfluencerPlatform(mapPlatformToV2(platform)),
      ) ?? ["other"]);
  const platformAccounts = getV2PlatformAccounts(platforms, legacyContract);
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
  const deliverableSummary = buildDeliverableSummary(deliverableRequirements, deliverables);
  const needsDeliverables = deliverableSummary.total > 0;
  const hasDeliverableRevision = deliverables.some((deliverable) =>
    ["changes_requested", "rejected"].includes(
      normalizeDeliverableStatus(deliverable.review_status),
    ),
  );

  if (contract.status === "completed") {
    stage = "completed";
  } else if (contract.status === "active" && needsDeliverables) {
    stage =
      deliverableSummary.approved >= deliverableSummary.total
        ? "completed"
        : deliverableSummary.submitted >= deliverableSummary.total && !hasDeliverableRevision
          ? "deliverables_review"
          : "deliverables_due";
  }

  const stageMeta = dashboardStageMeta[stage];
  const recordStatus =
    ["signed", "deliverables_due", "deliverables_review", "completed"].includes(stage)
      ? "ready"
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
    platform_accounts: platformAccounts,
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
      total: deliverableSummary.total || legacyContract?.campaign?.deliverables?.length || 0,
      submitted: deliverableSummary.submitted || submittedDeliverables,
      approved: deliverableSummary.approved || approvedDeliverables,
    },
    record_summary: {
      status: recordStatus,
      label: recordStatus === "ready" ? "서명본 보관됨" : "서명 후 보관",
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
  const platformAccounts = getLegacyPlatformAccounts(contract);
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
    platform_accounts: platformAccounts,
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
    record_summary: {
      status: contract.status === "SIGNED" ? "ready" : "not_ready",
      label: contract.status === "SIGNED" ? "서명본 보관됨" : "서명 후 보관",
    },
  };
};

const mapV2StatusToLegacyStatus = (
  status: SupabaseContractV2Row["status"],
  nextActorRole?: string | null,
): Contract["status"] => {
  if (status === "completed" || status === "active") return "SIGNED";
  if (status === "signing") return "APPROVED";
  if (status === "negotiating") {
    return nextActorRole === "advertiser" ? "NEGOTIATING" : "REVIEWING";
  }
  return "DRAFT";
};

const mapV2PlatformToLegacy = (platform: InfluencerPlatform): ContractPlatformValue => {
  const platforms: Record<InfluencerPlatform, ContractPlatformValue> = {
    instagram: "INSTAGRAM",
    youtube: "YOUTUBE",
    tiktok: "TIKTOK",
    naver_blog: "NAVER_BLOG",
    other: "OTHER",
  };
  return platforms[platform] ?? "OTHER";
};

const mapV2ClauseStatusToLegacy = (
  status: SupabaseContractClauseRow["status"],
): Contract["clauses"][number]["status"] => {
  if (status === "pending") return "PENDING_REVIEW";
  if (status === "accepted") return "APPROVED";
  if (status === "rejected" || status === "removed") return "DELETION_REQUESTED";
  return "MODIFICATION_REQUESTED";
};

const buildLegacyContractFromV2Rows = ({
  contract,
  parties,
  platforms,
  pricingTerm,
  clauses,
  shareLink,
}: {
  contract: SupabaseContractV2Row;
  parties: SupabaseContractPartyRow[];
  platforms: SupabaseContractPlatformRow[];
  pricingTerm?: SupabaseContractPricingTermRow;
  clauses: SupabaseContractClauseRow[];
  shareLink?: SupabaseShareLinkRow;
}): Contract => {
  const advertiserParty =
    parties.find((party) => ["advertiser", "agency", "marketer"].includes(party.party_role)) ??
    parties.find((party) => party.party_role !== "influencer");
  const influencerParty = parties.find((party) => party.party_role === "influencer");
  const legacyPlatforms = platforms.length
    ? platforms.map((platform) =>
        mapV2PlatformToLegacy(normalizeInfluencerPlatform(platform.platform)),
      )
    : ["OTHER" as ContractPlatformValue];
  const status = mapV2StatusToLegacyStatus(contract.status, contract.next_actor_role);
  const shareLinkActive = shareLink?.status === "active";
  const createdAt = contract.created_at ?? contract.updated_at ?? new Date().toISOString();
  const updatedAt = contract.updated_at ?? createdAt;
  const periodLabel =
    [
      contract.campaign_start_date ? formatKoreanDate(contract.campaign_start_date) : undefined,
      contract.campaign_end_date ? formatKoreanDate(contract.campaign_end_date) : undefined,
    ]
      .filter(Boolean)
      .join(" - ") || undefined;

  return normalizeContract({
    id: contract.id,
    advertiser_id:
      advertiserParty?.profile_id ??
      contract.created_by_profile_id ??
      advertiserParty?.email ??
      "advertiser",
    advertiser_info: {
      name:
        advertiserParty?.company_name ??
        advertiserParty?.display_name ??
        "광고주",
      manager: advertiserParty?.email ?? undefined,
    },
    type:
      contract.pricing_type === "commission" ||
      contract.pricing_type === "fixed_plus_commission"
        ? "공동구매"
        : "협찬",
    status,
    title: contract.campaign_title,
    influencer_info: {
      name: influencerParty?.display_name ?? "인플루언서",
      channel_url: influencerParty?.channel_url ?? platforms[0]?.url ?? "",
      contact: influencerParty?.email ?? "",
    },
    campaign: {
      budget: formatPricingTerm(pricingTerm),
      start_date: contract.campaign_start_date ?? undefined,
      end_date: contract.campaign_end_date ?? undefined,
      deadline: contract.upload_deadline ?? contract.review_deadline ?? undefined,
      upload_due_at: contract.upload_deadline ?? undefined,
      review_due_at: contract.review_deadline ?? undefined,
      period: periodLabel,
      platforms: [...new Set(legacyPlatforms)],
      deliverables: platforms.map((platform) => dashboardPlatformLabels[platform.platform]),
    },
    workflow: {
      next_actor:
        contract.next_actor_role === "advertiser"
          ? "advertiser"
          : contract.next_actor_role === "influencer"
            ? "influencer"
            : status === "SIGNED"
              ? "system"
              : "advertiser",
      next_action:
        contract.next_action ??
        dashboardStageMeta[inferDashboardStage(contract.status, contract.next_actor_role)]
          .nextAction,
      due_at: contract.next_due_at ?? contract.upload_deadline ?? contract.review_deadline ?? undefined,
      risk_level:
        contract.next_actor_role === "advertiser" || status === "NEGOTIATING"
          ? "high"
          : "medium",
      last_message: contract.campaign_summary ?? undefined,
    },
    evidence: {
      share_token_status:
        shareLinkActive ? "active" : shareLink?.status === "revoked" ? "revoked" : "not_issued",
      share_token_expires_at: shareLink?.expires_at ?? undefined,
      audit_ready: status === "APPROVED" || status === "SIGNED",
      pdf_status: status === "SIGNED" ? "signed_ready" : status === "DRAFT" ? "not_ready" : "draft_ready",
    },
    clauses: clauses.length
      ? clauses
          .slice()
          .sort((left, right) => (left.order_no ?? 0) - (right.order_no ?? 0))
          .map((clause, index) => ({
            clause_id: clause.id ?? `${contract.id}:clause:${index + 1}`,
            category: clause.title ?? `조항 ${index + 1}`,
            content: clause.body ?? "조항 본문을 불러오지 못했습니다.",
            status: mapV2ClauseStatusToLegacy(clause.status),
            history: [],
          }))
      : [
          {
            clause_id: `${contract.id}:clause:summary`,
            category: "계약 요약",
            content: contract.campaign_summary ?? "계약 세부 조항을 확인하세요.",
            status: status === "APPROVED" || status === "SIGNED" ? "APPROVED" : "PENDING_REVIEW",
            history: [],
          },
        ],
    audit_events: [],
    created_at: createdAt,
    updated_at: updatedAt,
  });
};

const readSupabaseV2ContractAsLegacy = async (
  contractId: string,
): Promise<Contract | undefined> => {
  if (!useSupabase || !isUuid(contractId)) return undefined;

  const contracts = await readSupabaseRows<SupabaseContractV2Row>(
    "contracts",
    `?select=*&id=eq.${encodeURIComponent(contractId)}&deleted_at=is.null&limit=1`,
    "contract v2 detail",
  );
  const contract = contracts[0];
  if (!contract) return undefined;

  const [
    parties,
    platforms,
    pricingTerms,
    clauses,
    shareLinks,
  ] = await Promise.all([
    readSupabaseRows<SupabaseContractPartyRow>(
      "contract_parties",
      `?select=*&contract_id=eq.${encodeURIComponent(contract.id)}`,
      "contract v2 parties",
    ),
    readSupabaseRows<SupabaseContractPlatformRow>(
      "contract_platforms",
      `?select=*&contract_id=eq.${encodeURIComponent(contract.id)}`,
      "contract v2 platforms",
    ),
    readSupabaseRows<SupabaseContractPricingTermRow>(
      "contract_pricing_terms",
      `?select=*&contract_id=eq.${encodeURIComponent(contract.id)}&limit=1`,
      "contract v2 pricing",
    ),
    readSupabaseRows<SupabaseContractClauseRow>(
      "contract_clauses",
      `?select=id,contract_id,order_no,title,body,status&contract_id=eq.${encodeURIComponent(
        contract.id,
      )}&order=order_no.asc`,
      "contract v2 clauses",
    ),
    readSupabaseRows<SupabaseShareLinkRow>(
      "share_links",
      `?select=contract_id,status,expires_at&contract_id=eq.${encodeURIComponent(
        contract.id,
      )}&order=created_at.desc&limit=1`,
      "contract v2 share link",
    ),
  ]);

  return buildLegacyContractFromV2Rows({
    contract,
    parties,
    platforms,
    pricingTerm: pricingTerms[0],
    clauses,
    shareLink: shareLinks[0],
  });
};

const buildDashboardTasks = (
  contracts: InfluencerDashboardContract[],
  verificationStatus: VerificationStatus,
  verificationRequests: VerificationRequestRecord[] = [],
) => {
  const tasks: InfluencerDashboardTask[] = [];
  const activeContract = contracts.find((contract) => contract.stage !== "signed");
  const contractNeedsVerification = (contract: InfluencerDashboardContract) =>
    contract.stage !== "signed" &&
    (contract.platform_accounts.length > 0
      ? contract.platform_accounts
      : contract.platforms.map((platform) => ({ platform, url: undefined }))).some(
        (account) =>
          !verificationRequests.some((request) =>
            verificationMatchesPlatformAccount(
              request,
              account.platform,
              account.url,
            ),
          ),
      );
  const activeContractNeedingVerification = contracts.find(contractNeedsVerification);

  if (
    activeContract &&
    (verificationStatus !== "approved" || activeContractNeedingVerification)
  ) {
    const taskContract = activeContractNeedingVerification ?? activeContract;
    tasks.push({
      id: "verification",
      contract_id: taskContract.id,
      tone: verificationStatus === "rejected" ? "rose" : "amber",
      title: verificationStatus === "pending" ? "계정 인증 검토 중" : "플랫폼 계정 인증 필요",
      body:
        verificationStatus === "pending"
          ? "운영자 검토가 끝나면 계정 인증 상태가 갱신됩니다."
          : "계약 검토는 가능하지만, 서명하려면 플랫폼 계정 인증 승인이 먼저 필요합니다.",
      action_label: verificationStatus === "pending" ? "인증 상태 보기" : "인증 제출",
      href: taskContract.verification_href,
    });
  }

  for (const contract of contracts) {
    if (["signed", "completed", "waiting"].includes(contract.stage)) continue;

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
        `?select=*&contract_id=in.${contractFilter}`,
        "deliverable requirements",
      ),
      readSupabaseRows<SupabaseDeliverableRow>(
        "deliverables",
        `?select=*&contract_id=in.${contractFilter}`,
        "deliverables",
      ),
    ]);
    const partiesByContract = groupByContractId(allParties);
    const platformsByContract = groupByContractId(platforms);
    const clausesByContract = groupByContractId(clauses);
    const requirementsByContract = groupByContractId(deliverableRequirements);
    const deliverablesByContract = groupByContractId(deliverables);
    const pricingByContract = new Map(
      pricingTerms.map((pricingTerm) => [pricingTerm.contract_id, pricingTerm]),
    );
    const v2ContractIds = new Set(contracts.map((contract) => contract.id));

    dashboardContracts = contracts.map((contract) =>
      buildV2DashboardContract({
        contract,
        legacyContract:
          legacyContractsById.get(contract.legacy_contract_id ?? "") ??
          legacyContractsById.get(contract.id),
        parties: partiesByContract.get(contract.id) ?? [],
        platforms: platformsByContract.get(contract.id) ?? [],
        pricingTerm: pricingByContract.get(contract.id),
        clauses: clausesByContract.get(contract.id) ?? [],
        deliverableRequirements: requirementsByContract.get(contract.id) ?? [],
        deliverables: deliverablesByContract.get(contract.id) ?? [],
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
  const verificationStatus = deriveVerificationStatus(
    verificationRequests,
    (profile?.verification_status as VerificationStatus | undefined) ??
      "not_submitted",
  );
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
  const hasActiveContract = dashboardContracts.some((contract) => contract.stage !== "signed");
  const hasActiveContractRequiringVerification = dashboardContracts.some(
    (contract) =>
      contract.stage !== "signed" &&
      (contract.platform_accounts.length > 0
        ? contract.platform_accounts
        : contract.platforms.map((platform) => ({ platform, url: undefined }))).some(
        (account) =>
          !verificationRequests.some(
            (request) =>
              verificationMatchesPlatformAccount(
                request,
                account.platform,
                account.url,
              ),
          ),
      ),
  );
  const summary = {
    total_contracts: dashboardContracts.length,
    review_needed: dashboardContracts.filter((contract) => contract.stage === "review_needed").length,
    change_pending: dashboardContracts.filter((contract) => contract.stage === "change_pending").length,
    ready_to_sign: dashboardContracts.filter((contract) => contract.stage === "ready_to_sign").length,
    signed: dashboardContracts.filter((contract) =>
      ["signed", "deliverables_due", "deliverables_review", "completed"].includes(
        contract.stage,
      ),
    ).length,
    verification_needed:
      hasActiveContract &&
      (verificationStatus !== "approved" || hasActiveContractRequiringVerification),
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
      activity_categories: profile?.activity_categories ?? [],
      activity_platforms: profile?.activity_platforms ?? [],
      verification_status: verificationStatus,
      email_verified: Boolean(authUser.email_confirmed_at ?? authUser.confirmed_at ?? profile?.email_verified_at),
    },
    verification: {
      status: verificationStatus,
      latest_request: latestVerificationForResponse,
      approved_platforms: approvedPlatforms,
    },
    summary,
    tasks: buildDashboardTasks(
      dashboardContracts,
      verificationStatus,
      verificationRequests,
    ),
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
      console.warn(`[yeollock.me] resetting invalid data store: ${code}`);
    }

    const initialStore = { contracts: demoMode ? createDemoContracts() : [] };
    await writeStore(initialStore);
    return initialStore;
  }
};

const readContractWriteContext = async (contractId: string) => {
  const store = await readStore();
  const existingIndex = store.contracts.findIndex((item) => item.id === contractId);
  const legacyContract =
    existingIndex >= 0 ? store.contracts[existingIndex] : undefined;
  const v2Contract =
    !legacyContract && useSupabase && isUuid(contractId)
      ? await readSupabaseV2ContractAsLegacy(contractId)
      : undefined;

  return {
    store,
    existingIndex,
    existingContract: legacyContract ?? v2Contract,
    isV2Only: !legacyContract && Boolean(v2Contract),
  };
};

const mergeContractIntoStore = (
  store: ContractStoreFile,
  existingIndex: number,
  contract: Contract,
) => ({
  contracts:
    existingIndex >= 0
      ? store.contracts.map((item, index) =>
          index === existingIndex ? contract : item,
        )
      : [...store.contracts, contract],
});

const submittedDeliverableStatuses = new Set<DeliverableReviewStatus>([
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
]);

const normalizeDeliverableStatus = (
  value: string | null | undefined,
): DeliverableReviewStatus =>
  deliverableReviewStatuses.has(value as DeliverableReviewStatus)
    ? (value as DeliverableReviewStatus)
    : "draft";

const normalizeDeliverableQuantity = (value: number | null | undefined) =>
  Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;

const buildLegacyDeliverableRequirementRows = (
  contract: Contract,
): SupabaseDeliverableRequirementRow[] =>
  (contract.campaign?.deliverables ?? []).map((deliverable, index) => ({
    id: stableUuid(`${contract.id}:deliverable-requirement:${index}:${deliverable}`),
    contract_id: contract.id,
    deliverable_type: inferDeliverableType(deliverable),
    title: deliverable,
    description: deliverable,
    quantity: 1,
    due_at: toIsoDateTime(contract.campaign?.upload_due_at ?? contract.campaign?.deadline),
    review_required: true,
    evidence_required: true,
    order_no: index + 1,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
  }));

const readContractDeliverableBundle = async (
  contract: Contract,
) => {
  if (!useSupabase || !isUuid(contract.id)) {
    return {
      requirements: buildLegacyDeliverableRequirementRows(contract),
      deliverables: [] as SupabaseDeliverableRow[],
      files: [] as SupabaseContractFileRow[],
    };
  }

  const [requirements, deliverables] = await Promise.all([
    readSupabaseRows<SupabaseDeliverableRequirementRow>(
      "deliverable_requirements",
      `?select=*&contract_id=eq.${encodeURIComponent(contract.id)}&order=order_no.asc`,
      "deliverable requirements",
    ),
    readSupabaseRows<SupabaseDeliverableRow>(
      "deliverables",
      `?select=*&contract_id=eq.${encodeURIComponent(contract.id)}&order=created_at.asc`,
      "deliverables",
    ),
  ]);
  const deliverableIds = deliverables.map((deliverable) => deliverable.id);
  const files = deliverableIds.length
    ? await readSupabaseRows<SupabaseContractFileRow>(
        "contract_files",
        `?select=*&contract_id=eq.${encodeURIComponent(
          contract.id,
        )}&related_type=eq.deliverable&related_id=in.${postgrestInFilter(
          deliverableIds,
        )}&order=created_at.asc`,
        "deliverable files",
      )
    : [];

  return {
    requirements: requirements.length
      ? requirements
      : buildLegacyDeliverableRequirementRows(contract),
    deliverables,
    files,
  };
};

const countDeliverableUnits = (
  requirements: SupabaseDeliverableRequirementRow[],
  deliverables: SupabaseDeliverableRow[],
  predicate: (status: DeliverableReviewStatus) => boolean,
) => {
  if (requirements.length === 0) {
    return deliverables.filter((deliverable) =>
      predicate(normalizeDeliverableStatus(deliverable.review_status)),
    ).length;
  }

  const requirementIds = new Set(requirements.map((requirement) => requirement.id));
  const unassignedDeliverables = deliverables.filter(
    (deliverable) =>
      !deliverable.requirement_id || !requirementIds.has(deliverable.requirement_id),
  );
  let unassignedOffset = 0;

  return requirements.reduce((total, requirement) => {
    const quantity = normalizeDeliverableQuantity(requirement.quantity);
    const requirementDeliverables = deliverables.filter(
      (deliverable) => deliverable.requirement_id === requirement.id,
    );
    const deliverablesForRequirement =
      requirementDeliverables.length > 0
        ? requirementDeliverables
        : unassignedDeliverables.slice(unassignedOffset, unassignedOffset + quantity);

    if (requirementDeliverables.length === 0) {
      unassignedOffset += quantity;
    }

    const matchingCount = deliverablesForRequirement.filter((deliverable) =>
      predicate(normalizeDeliverableStatus(deliverable.review_status)),
    ).length;
    return total + Math.min(quantity, matchingCount);
  }, 0);
};

const buildDeliverableSummary = (
  requirements: SupabaseDeliverableRequirementRow[],
  deliverables: SupabaseDeliverableRow[],
) => {
  const total = requirements.length
    ? requirements.reduce(
        (sum, requirement) => sum + normalizeDeliverableQuantity(requirement.quantity),
        0,
      )
    : deliverables.length;
  const submitted = countDeliverableUnits(requirements, deliverables, (status) =>
    submittedDeliverableStatuses.has(status),
  );
  const approved = countDeliverableUnits(
    requirements,
    deliverables,
    (status) => status === "approved" || status === "waived",
  );

  return { total, submitted, approved };
};

const buildDeliverableResponse = (
  contract: Contract,
  bundle: Awaited<ReturnType<typeof readContractDeliverableBundle>>,
) => {
  const filesByDeliverable = new Map<string, SupabaseContractFileRow[]>();
  for (const file of bundle.files) {
    if (!file.related_id) continue;
    filesByDeliverable.set(file.related_id, [
      ...(filesByDeliverable.get(file.related_id) ?? []),
      file,
    ]);
  }

  const submissions = bundle.deliverables.map((deliverable) => ({
    id: deliverable.id,
    contract_id: deliverable.contract_id,
    requirement_id: deliverable.requirement_id,
    title: deliverable.title,
    url: deliverable.url,
    submitted_at: deliverable.submitted_at,
    review_status: normalizeDeliverableStatus(deliverable.review_status),
    review_comment: deliverable.review_comment,
    reviewed_at: deliverable.reviewed_at,
    metadata: deliverable.metadata ?? {},
    files: (filesByDeliverable.get(deliverable.id) ?? []).map((file) => ({
      id: file.id,
      file_name: file.file_name,
      content_type: file.content_type,
      byte_size: Number(file.byte_size ?? 0),
      created_at: file.created_at,
      download_url: `/api/contracts/${encodeURIComponent(
        contract.id,
      )}/deliverables/${encodeURIComponent(deliverable.id)}/files/${encodeURIComponent(
        file.id,
      )}`,
    })),
  }));

  return {
    contract_id: contract.id,
    requirements: bundle.requirements.map((requirement) => ({
      id: requirement.id,
      contract_id: requirement.contract_id,
      deliverable_type: requirement.deliverable_type,
      title: requirement.title,
      description: requirement.description,
      quantity: normalizeDeliverableQuantity(requirement.quantity),
      due_at: requirement.due_at,
      review_required: requirement.review_required !== false,
      evidence_required: requirement.evidence_required === true,
      order_no: requirement.order_no ?? 1,
      submissions: submissions.filter(
        (submission) => submission.requirement_id === requirement.id,
      ),
    })),
    submissions,
    summary: buildDeliverableSummary(bundle.requirements, bundle.deliverables),
  };
};

const validateDeliverableFile = (
  file: ReturnType<typeof parseEvidenceFile> | undefined,
) => {
  if (!file) return undefined;
  if (!deliverableFileMimeTypes.has(file.type)) {
    return "Only PDF, PNG, JPG, or WebP proof files are allowed";
  }
  if (file.size <= 0 || file.size > maxDeliverableFileSize) {
    return "Proof file must be 10MB or smaller";
  }
  if (!file.data_url.startsWith("data:")) {
    return "Proof file is invalid";
  }
  return undefined;
};

const storeDeliverableFile = async ({
  contractId,
  deliverableId,
  file,
}: {
  contractId: string;
  deliverableId: string;
  file: NonNullable<ReturnType<typeof parseEvidenceFile>>;
}) => {
  const { contentType, buffer } = dataUrlToBuffer(file.data_url);

  if (
    contentType !== file.type ||
    !assertDeclaredMimeMatchesContent(contentType, buffer, deliverableFileMimeTypes) ||
    buffer.byteLength <= 0 ||
    buffer.byteLength > maxDeliverableFileSize
  ) {
    throw new Error("Proof file content is invalid");
  }

  return storePrivateBuffer({
    area: "deliverables",
    ownerId: contractId,
    fileId: deliverableId,
    fileName: file.name,
    contentType,
    buffer,
  });
};

const insertContractEvent = async ({
  contractId,
  actorProfileId,
  actorRole,
  actorDisplayName,
  eventType,
  targetType,
  targetId,
  payload,
  request,
}: {
  contractId: string;
  actorProfileId?: string;
  actorRole: string;
  actorDisplayName?: string;
  eventType: string;
  targetType?: string;
  targetId?: string;
  payload: Record<string, unknown>;
  request: express.Request;
}) => {
  if (!useSupabase || !isUuid(contractId)) return;

  await insertSupabaseRowsReturning(
    "contract_events",
    [
      {
        id: randomUUID(),
        contract_id: contractId,
        actor_profile_id: actorProfileId,
        actor_role: actorRole,
        actor_display_name: actorDisplayName,
        event_type: eventType,
        target_type: targetType,
        target_id: targetId,
        payload,
        ip_address: getClientIp(request),
        user_agent: request.header("user-agent") ?? "unknown",
      },
    ],
    "contract event",
  );
};

const updateContractDeliverableWorkflow = async (
  contractId: string,
  request: express.Request,
) => {
  if (!useSupabase || !isUuid(contractId)) return;

  const legacyContract = await readSupabaseV2ContractAsLegacy(contractId);
  if (!legacyContract) return;

  const bundle = await readContractDeliverableBundle(legacyContract);
  const summary = buildDeliverableSummary(bundle.requirements, bundle.deliverables);
  const hasRevision = bundle.deliverables.some((deliverable) =>
    ["changes_requested", "rejected"].includes(
      normalizeDeliverableStatus(deliverable.review_status),
    ),
  );
  const hasPendingReview =
    summary.submitted > summary.approved && !hasRevision;
  const completed =
    summary.total > 0 && summary.approved >= summary.total;
  const now = new Date().toISOString();

  const updates = completed
    ? {
        status: "completed",
        next_actor_role: null,
        next_action: "모든 콘텐츠 제출물이 승인되어 계약 이행이 완료되었습니다.",
        next_due_at: null,
        completed_at: now,
        updated_at: now,
      }
    : hasPendingReview
      ? {
          status: "active",
          next_actor_role: "advertiser",
          next_action: "제출된 콘텐츠 링크와 증빙을 검수하고 승인 또는 수정 요청을 남기세요.",
          next_due_at: null,
          completed_at: null,
          updated_at: now,
        }
      : {
          status: "active",
          next_actor_role: "influencer",
          next_action: hasRevision
            ? "수정 요청된 콘텐츠를 보완한 뒤 링크나 증빙 파일을 다시 제출하세요."
            : "콘텐츠 링크와 증빙 파일을 제출해 광고주 검수를 요청하세요.",
          next_due_at: null,
          completed_at: null,
          updated_at: now,
        };

  await patchSupabaseRecord(
    "contracts",
    `?id=eq.${encodeURIComponent(contractId)}`,
    updates,
    "Supabase contract deliverable workflow update",
  );

  if (completed) {
    await insertContractEvent({
      contractId,
      actorRole: "system",
      actorDisplayName: productName,
      eventType: "contract_completed",
      targetType: "contract",
      targetId: contractId,
      payload: { summary },
      request,
    });
  }
};

const resolveInfluencerVerificationContractAccess = async (
  auth: InfluencerSession,
  contractIdValue: unknown,
): Promise<
  | { ok: true; contractId: string }
  | { ok: false; status: number; error: string }
> => {
  const contractId = normalizeOptionalText(contractIdValue);

  if (!contractId) {
    return {
      ok: false,
      status: 422,
      error: "Active contract is required for account verification",
    };
  }

  const store = await readStore();
  const legacyContract = store.contracts.find((contract) => contract.id === contractId);

  if (legacyContract) {
    if (!canInfluencerAccessLegacyContract(auth, legacyContract)) {
      return { ok: false, status: 403, error: "이 계약을 볼 권한이 없습니다." };
    }

    if (legacyContract.status === "SIGNED") {
      return {
        ok: false,
        status: 409,
        error: "Account verification requires an active unsigned contract",
      };
    }

    return { ok: true, contractId: legacyContract.id };
  }

  if (useSupabase) {
    const contracts = await readSupabaseRows<SupabaseContractV2Row>(
      "contracts",
      `?select=*&id=eq.${encodeURIComponent(contractId)}&deleted_at=is.null&limit=1`,
      "verification contract",
    );
    const contract = contracts[0];

    if (contract) {
      const parties = await readSupabaseRows<SupabaseContractPartyRow>(
        "contract_parties",
        `?select=*&contract_id=eq.${encodeURIComponent(contract.id)}&party_role=eq.influencer`,
        "verification contract parties",
      );
      const profileEmail = normalizeEmail(auth.profile.email ?? auth.user.email ?? "");
      const hasPartyAccess = parties.some(
        (party) =>
          party.profile_id === auth.profile.id ||
          (hasText(profileEmail) && normalizeEmail(party.email ?? "") === profileEmail),
      );

      if (!hasPartyAccess) {
        return { ok: false, status: 403, error: "이 계약을 볼 권한이 없습니다." };
      }

      if (inferDashboardStage(contract.status, contract.next_actor_role) === "signed") {
        return {
          ok: false,
          status: 409,
          error: "Account verification requires an active unsigned contract",
        };
      }

      return { ok: true, contractId: contract.id };
    }
  }

  return { ok: false, status: 404, error: "Contract not found" };
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
  const attemptKey = getAdminLoginAttemptKey(request);
  const throttle = getAdminLoginThrottle(attemptKey);

  if (throttle.blocked) {
    response.setHeader("Retry-After", String(throttle.retryAfterSeconds ?? 60));
    response.status(429).json({
      error: "운영자 로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      retry_after_seconds: throttle.retryAfterSeconds,
    });
    return;
  }

  if (!safeEqual(accessCode, adminAccessCode!)) {
    const attempt = recordAdminLoginFailure(attemptKey);
    console.warn(
      `[${productName} Admin] failed login attempt from ${getClientIp(request)} (${attempt.failures}/${adminLoginMaxFailures})`,
    );
    response.status(401).json({ error: "운영자 인증 코드가 올바르지 않습니다." });
    return;
  }

  clearAdminLoginFailures(attemptKey);
  response.setHeader(
    "Set-Cookie",
    `${adminSessionCookie}=${encodeURIComponent(
      createAdminSessionToken(),
    )}; ${adminCookieOptions()}`,
  );
  response.json({ authenticated: true, configured: true });
});

app.post("/api/admin/logout", (_request, response) => {
  response.setHeader("Set-Cookie", [
    `${adminSessionCookie}=; ${clearAdminCookieOptions()}`,
    `${signedPdfAccessCookie}=; ${signedPdfCookieOptions(0)}`,
  ]);
  response.json({ authenticated: false });
});

app.get("/api/admin/metrics", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;

    const [store, supportAccessRequests, verificationRequests] = await Promise.all([
      readStore(),
      readSupportAccessRequests(),
      readVerificationRequests(),
    ]);
    const metrics = await buildAdminMetrics(
      store.contracts,
      supportAccessRequests,
    );

    response.json({
      metrics: {
        ...metrics,
        verification: {
          pending_count: verificationRequests.filter(
            (record) => record.status === "pending",
          ).length,
          total_count: verificationRequests.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/support-access-requests", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;

    const supportAccessRequests = await readSupportAccessRequests();
    response.json({
      support_access_requests: supportAccessRequests
        .map((record) => ({
          ...record,
          is_active: isSupportAccessActive(record),
        }))
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/support-access-requests/:id", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "admin_support_access_review",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    if (!requireAdminSession(request, response)) return;

    const status = String(request.body?.status ?? "");
    if (status !== "closed" && status !== "revoked") {
      response.status(422).json({ error: "Valid support access status is required" });
      return;
    }

    const supportAccessRequests = await readSupportAccessRequests();
    const record = supportAccessRequests.find((item) => item.id === request.params.id);

    if (!record) {
      response.status(404).json({ error: "Support access request not found" });
      return;
    }

    const statusAuditEvent: SupportAccessAuditEvent = {
      id: randomUUID(),
      action: status === "closed" ? "closed" : "revoked",
      actor_role: "admin",
      actor_name: adminOperatorName,
      description:
        status === "closed"
          ? "운영자가 지원 열람을 종료했습니다."
          : "운영자가 지원 열람을 회수했습니다.",
      ip: getClientIp(request),
      user_agent: request.header("user-agent") ?? "unknown",
      created_at: new Date().toISOString(),
    };

    const updated = await updateSupportAccessRequest({
      ...record,
      status,
      reviewed_by_name: adminOperatorName,
      reviewed_at: new Date().toISOString(),
      audit_events: useSupabase
        ? record.audit_events
        : [...(record.audit_events ?? []), statusAuditEvent],
    });

    await appendSupportAccessEventRow(updated, statusAuditEvent);

    response.json({ request: updated, is_active: isSupportAccessActive(updated) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/advertiser/session", async (request, response, next) => {
  try {
    const auth = await authenticateAdvertiserRequest(request, response);

    if (!auth) {
      response.json({ authenticated: false });
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
      response.status(422).json({ error: "이메일과 비밀번호를 입력해 주세요." });
      return;
    }

    const throttle = consumePublicAuthRateLimit(request, "advertiser_login", email);
    if (throttle.blocked) {
      sendPublicAuthRateLimitResponse(response, throttle);
      return;
    }

    const session = await createSupabasePasswordSession(email, password);
    const profile = await readProfileByUserId(session.user.id);

    if (!isAdvertiserRole(profile?.role)) {
      response.status(403).json({
        error: "광고주 계정 권한이 필요합니다. 광고주 계정으로 로그인해 주세요.",
      });
      return;
    }

    await syncProfileEmailVerifiedAt(session.user);
    setAdvertiserSessionCookies(response, session);
    clearPublicAuthRateLimit(request, "advertiser_login", email);
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
      error: getLoginFailureMessage(error, "광고주 로그인에 실패했습니다."),
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
    if (!hasAcceptedRequiredSignupConsents(request.body)) {
      response.status(422).json({
        error: "회원가입에는 이용약관과 개인정보 처리방침 필수 동의가 필요합니다.",
      });
      return;
    }

    const throttle = consumePublicAuthRateLimit(request, "advertiser_signup", email);
    if (throttle.blocked) {
      sendPublicAuthRateLimitResponse(response, throttle);
      return;
    }

    const authUser = await createSupabaseSignupUser({
      email,
      password,
      name: managerName,
      companyName,
      redirectTo: buildEmailConfirmationRedirect(
        request,
        "/login/advertiser",
        "/advertiser/verification",
      ),
    });

    await upsertSupabaseV2Rows("profiles", [
      {
        id: authUser.id,
        role: "marketer",
        name: managerName,
        email,
        company_name: companyName,
        verification_status: "not_submitted",
        email_verified_at: null,
        ...buildSignupLegalConsent(request, "advertiser"),
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

    response.status(202).json({
      authenticated: false,
      confirmation_required: true,
      message:
        "인증 메일을 보냈습니다. 메일 링크를 누른 뒤 광고주 계정으로 로그인해 주세요.",
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
      error: getSignupFailureMessage(
        error,
        "광고주 계정을 만들 수 없습니다.",
      ),
    });
  }
});

app.post("/api/advertiser/logout", async (request, response) => {
  try {
    await revokeSessionFromRequest(
      request,
      advertiserAccessCookie,
      advertiserRefreshCookie,
    );
  } catch (error) {
    console.warn(
      `[${productName}] advertiser Supabase logout revoke failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
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

app.post("/api/influencer/login", async (request, response, _next) => {
  try {
    const email = normalizeRequiredText(request.body?.email).toLowerCase();
    const password = normalizeRequiredText(request.body?.password);

    if (!email.includes("@") || !password) {
      response.status(422).json({ error: "이메일과 비밀번호를 입력해 주세요." });
      return;
    }

    const throttle = consumePublicAuthRateLimit(request, "influencer_login", email);
    if (throttle.blocked) {
      sendPublicAuthRateLimitResponse(response, throttle);
      return;
    }

    const session = await createSupabasePasswordSession(email, password);
    const dashboard = await buildInfluencerDashboard(session.user);

    if (dashboard.user.role !== "influencer") {
      response.status(403).json({
        error: "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.",
      });
      return;
    }

    await syncProfileEmailVerifiedAt(session.user);
    setInfluencerSessionCookies(response, session);
    clearPublicAuthRateLimit(request, "influencer_login", email);
    response.json({
      authenticated: true,
      user: dashboard.user,
      verification: dashboard.verification,
    });
  } catch (error) {
    response.status(401).json({
      error: getLoginFailureMessage(error, "인플루언서 로그인에 실패했습니다."),
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
    const activityCategories = normalizeSelectedValues<InfluencerActivityCategory>(
      request.body?.activity_categories,
      influencerActivityCategories,
    );
    const activityPlatforms = normalizeSelectedValues<InfluencerPlatform>(
      request.body?.activity_platforms,
      influencerPlatforms,
    );
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
    if (
      activityCategories.invalid.length > 0 ||
      activityPlatforms.invalid.length > 0
    ) {
      response.status(422).json({ error: "선택할 수 없는 활동 정보가 포함되어 있습니다." });
      return;
    }
    if (
      activityCategories.selected.length === 0 ||
      activityPlatforms.selected.length === 0
    ) {
      response.status(422).json({ error: "활동 영역과 플랫폼을 각각 하나 이상 선택해 주세요." });
      return;
    }
    if (!hasAcceptedRequiredSignupConsents(request.body)) {
      response.status(422).json({
        error: "회원가입에는 이용약관과 개인정보 처리방침 필수 동의가 필요합니다.",
      });
      return;
    }

    const throttle = consumePublicAuthRateLimit(request, "influencer_signup", email);
    if (throttle.blocked) {
      sendPublicAuthRateLimitResponse(response, throttle);
      return;
    }

    const authUser = await createSupabaseSignupUser({
      email,
      password,
      name,
      redirectTo: buildEmailConfirmationRedirect(
        request,
        "/login/influencer",
        "/influencer/dashboard",
      ),
    });

    await upsertSupabaseV2Rows("profiles", [
      {
        id: authUser.id,
        role: "influencer",
        name,
        email,
        activity_categories: activityCategories.selected,
        activity_platforms: activityPlatforms.selected,
        verification_status: "not_submitted",
        email_verified_at: null,
        ...buildSignupLegalConsent(request, "influencer"),
        updated_at: new Date().toISOString(),
      },
    ]);

    response.status(202).json({
      authenticated: false,
      confirmation_required: true,
      message:
        "인증 메일을 보냈습니다. 메일 링크를 누른 뒤 인플루언서 계정으로 로그인해 주세요.",
      user: {
        id: authUser.id,
        email,
        name,
        role: "influencer",
        activity_categories: activityCategories.selected,
        activity_platforms: activityPlatforms.selected,
        verification_status: "not_submitted",
      },
    });
  } catch (error) {
    response.status(400).json({
      error: getSignupFailureMessage(
        error,
        "인플루언서 계정을 만들 수 없습니다.",
      ),
    });
  }
});

app.post("/api/influencer/logout", async (request, response) => {
  try {
    await revokeSessionFromRequest(
      request,
      influencerAccessCookie,
      influencerRefreshCookie,
    );
  } catch (error) {
    console.warn(
      `[${productName}] influencer Supabase logout revoke failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  clearInfluencerSessionCookies(response);
  response.json({ authenticated: false });
});

app.get("/api/influencer/dashboard", async (request, response, next) => {
  try {
    const auth = await authenticateInfluencerRequest(request, response);

    if (!auth) {
      response.status(401).json({ authenticated: false });
      return;
    }

    response.json(await buildInfluencerDashboard(auth.user));
  } catch (error) {
    if (error instanceof Error && error.message === "Influencer role is required") {
      response.status(403).json({
        error: "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.",
      });
      return;
    }

    next(error);
  }
});

app.get("/api/marketplace/influencers", async (_request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    response.json({ profiles: await readMarketplaceInfluencerProfiles() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/influencers/:handle", async (request, response, next) => {
  try {
    const profile = findInfluencerProfileByHandle(
      request.params.handle,
      await readMarketplaceInfluencerProfiles(),
    );

    if (!profile) {
      response.status(404).json({ error: "Influencer profile not found" });
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.json({ profile });
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/brands", async (_request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    response.json({ brands: await readMarketplaceBrandProfiles() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/brands/:handle", async (request, response, next) => {
  try {
    const brand = findBrandProfileByHandle(
      request.params.handle,
      await readMarketplaceBrandProfiles(),
    );

    if (!brand) {
      response.status(404).json({ error: "Brand profile not found" });
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.json({ brand });
  } catch (error) {
    next(error);
  }
});

app.get("/api/influencer/public-profile", async (request, response, next) => {
  try {
    const influencerAuth = await requireInfluencerSession(request, response);
    if (!influencerAuth) return;

    response.setHeader("Cache-Control", "no-store");
    response.json({
      profile: await readStoredInfluencerPublicProfile(influencerAuth.profile.id),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/influencer/public-profile", async (request, response, next) => {
  try {
    const influencerAuth = await requireInfluencerSession(request, response);
    if (!influencerAuth) return;

    const result = await upsertInfluencerPublicProfile({
      authUser: influencerAuth.user,
      profile: influencerAuth.profile,
      body:
        request.body && typeof request.body === "object"
          ? (request.body as Record<string, unknown>)
          : {},
    });

    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }

    response.json({ profile: result.profile });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/marketplace/influencers/:handle/proposals",
  async (request, response, next) => {
    try {
      const advertiserAuth = await requireAdvertiserSession(request, response);
      if (!advertiserAuth) return;

      const profile = findInfluencerProfileByHandle(
        request.params.handle,
        await readMarketplaceInfluencerProfiles(),
      );
      if (!profile) {
        response.status(404).json({ error: "Influencer profile not found" });
        return;
      }

      const payload = validateMarketplaceProposal(
        request.body && typeof request.body === "object"
          ? (request.body as Record<string, unknown>)
          : {},
      );
      if ("error" in payload) {
        response.status(422).json({ error: payload.error });
        return;
      }

      const organization = await readDefaultOrganizationForProfile(
        advertiserAuth.profile.id,
      );
      const now = new Date().toISOString();
      const proposalId = randomUUID();

      await insertSupabaseRowsReturning(
        "marketplace_contact_proposals",
        [
          {
            id: proposalId,
            direction: "advertiser_to_influencer",
            target_influencer_profile_id: isUuid(profile.id) ? profile.id : null,
            target_handle: profile.handle,
            target_display_name: profile.displayName,
            sender_profile_id: advertiserAuth.profile.id,
            sender_organization_id: organization?.id ?? null,
            sender_name: payload.senderName,
            sender_intro: payload.senderIntro,
            proposal_type: payload.proposalType,
            proposal_summary: payload.proposalSummary,
            status: "submitted",
            created_at: now,
            updated_at: now,
          },
        ],
        "marketplace contact proposal",
      );

      response.status(201).json({
        proposal: {
          id: proposalId,
          status: "submitted",
          target_handle: profile.handle,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/marketplace/brands/:handle/proposals",
  async (request, response, next) => {
    try {
      const influencerAuth = await requireInfluencerSession(request, response);
      if (!influencerAuth) return;

      const brand = findBrandProfileByHandle(
        request.params.handle,
        await readMarketplaceBrandProfiles(),
      );
      if (!brand) {
        response.status(404).json({ error: "Brand profile not found" });
        return;
      }

      const payload = validateMarketplaceProposal(
        request.body && typeof request.body === "object"
          ? (request.body as Record<string, unknown>)
          : {},
      );
      if ("error" in payload) {
        response.status(422).json({ error: payload.error });
        return;
      }

      const now = new Date().toISOString();
      const proposalId = randomUUID();

      await insertSupabaseRowsReturning(
        "marketplace_contact_proposals",
        [
          {
            id: proposalId,
            direction: "influencer_to_brand",
            target_brand_profile_id: isUuid(brand.id) ? brand.id : null,
            target_handle: brand.handle,
            target_display_name: brand.displayName,
            sender_profile_id: influencerAuth.profile.id,
            sender_name: payload.senderName,
            sender_intro: payload.senderIntro,
            proposal_type: payload.proposalType,
            proposal_summary: payload.proposalSummary,
            status: "submitted",
            created_at: now,
            updated_at: now,
          },
        ],
        "marketplace contact proposal",
      );

      response.status(201).json({
        proposal: {
          id: proposalId,
          status: "submitted",
          target_handle: brand.handle,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/marketplace/messages", async (request, response, next) => {
  try {
    const role = normalizeOptionalText(request.query.role);

    if (role === "advertiser") {
      const advertiserAuth = await requireAdvertiserSession(request, response);
      if (!advertiserAuth) return;

      response.setHeader("Cache-Control", "no-store");
      response.json(await readMarketplaceMessagesForAdvertiser(advertiserAuth));
      return;
    }

    if (role === "influencer") {
      const influencerAuth = await requireInfluencerSession(request, response);
      if (!influencerAuth) return;

      response.setHeader("Cache-Control", "no-store");
      response.json(await readMarketplaceMessagesForInfluencer(influencerAuth));
      return;
    }

    response.status(422).json({ error: "role must be advertiser or influencer" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/verification/status", async (request, response, next) => {
  try {
    const requestedRole = normalizeOptionalText(request.query.role);

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

    if (requestedRole !== "advertiser") {
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
    }

    if (requestedRole !== "influencer") {
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
    }

    response.status(401).json({ error: "로그인 후 이용할 수 있습니다." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/verification/advertiser", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "verification_advertiser",
      request.body?.business_registration_number,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

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
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "verification_influencer",
      request.body?.platform_url ?? request.body?.platform_handle,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const influencerAuth = await requireInfluencerSession(request, response);

    if (!influencerAuth) return;

    const requestedContractId = normalizeOptionalText(request.body?.contract_id);
    const contractAccess = requestedContractId
      ? await resolveInfluencerVerificationContractAccess(
          influencerAuth,
          requestedContractId,
        )
      : ({ ok: true, contractId: undefined } as const);

    if (contractAccess.ok === false) {
      response.status(contractAccess.status).json({ error: contractAccess.error });
      return;
    }

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
      response.status(422).json({ error: `Valid ${productName} challenge code is required` });
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
      platform !== "tiktok" &&
      platform !== "other";
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
          contract_id: contractAccess.contractId,
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
      response.setHeader("Cache-Control", "no-store");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${sanitizeStorageSegment(storedFile.file_name)}"`,
      );
      await appendVerificationEvidenceAccessAudit(record, request);
      response.send(fileBuffer);
      return;
    }

    const legacyDataUrl = record.evidence_snapshot_json?.file_data_url;
    if (typeof legacyDataUrl === "string") {
      const { contentType, buffer } = dataUrlToBuffer(legacyDataUrl);
      if (!assertDeclaredMimeMatchesContent(contentType, buffer, evidenceFileMimeTypes)) {
        response.status(415).json({ error: "Legacy evidence file type is not allowed" });
        return;
      }
      response.setHeader("Content-Type", contentType);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Disposition", `attachment; filename="${record.id}-evidence.${extensionForMimeType(contentType)}"`);
      await appendVerificationEvidenceAccessAudit(record, request);
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
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "admin_verification_review",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    if (!requireAdminSession(request, response)) return;

    const status = normalizeRequiredText(request.body?.status);
    const reviewerNote = normalizeOptionalText(request.body?.reviewer_note);
    const reviewedByName = adminOperatorName;

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

    if (adminAuthenticated) {
      response.status(403).json({
        error:
          "Admin contract list access is restricted. Use aggregate admin metrics instead.",
      });
      return;
    }

    const advertiserAuth = adminAuthenticated
      ? undefined
      : await requireAdvertiserSession(request, response);

    if (!advertiserAuth) {
      return;
    }

    const store = await readStore();
    const contracts = store.contracts.filter((contract) =>
      canAdvertiserAccessLegacyContract(advertiserAuth, contract),
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

app.get("/api/contracts/:id/deliverables", async (request, response, next) => {
  try {
    const { existingContract: contract } = await readContractWriteContext(
      request.params.id,
    );

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const access = await resolveLegacyContractAccess(request, response, contract, {
      allowShareToken: false,
    });
    if (!access) return;

    response.setHeader("Cache-Control", "no-store");
    response.json(buildDeliverableResponse(contract, await readContractDeliverableBundle(contract)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/contracts/:id/deliverables", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "deliverable_submit",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    if (!useSupabase) {
      response.status(503).json({ error: "Deliverable submission requires Supabase" });
      return;
    }

    const influencerAuth = await requireInfluencerSession(request, response);
    if (!influencerAuth) return;

    const { existingContract: contract } = await readContractWriteContext(
      request.params.id,
    );

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }
    if (!canInfluencerAccessLegacyContract(influencerAuth, contract)) {
      response.status(403).json({ error: "이 계약을 볼 권한이 없습니다." });
      return;
    }
    if (contract.status !== "SIGNED") {
      response.status(409).json({ error: "Contract must be signed before deliverables can be submitted" });
      return;
    }

    const bundle = await readContractDeliverableBundle(contract);
    const requirementId = normalizeOptionalText(request.body?.requirement_id);
    const requirement = requirementId
      ? bundle.requirements.find((item) => item.id === requirementId)
      : bundle.requirements[0];

    if (bundle.requirements.length > 0 && !requirement) {
      response.status(422).json({ error: "Valid deliverable requirement is required" });
      return;
    }

    const title =
      normalizeOptionalText(request.body?.title) ??
      requirement?.title ??
      "콘텐츠 증빙";
    const url = normalizeUrlValue(request.body?.url);
    const note = normalizeOptionalText(request.body?.note);
    const evidenceFile = parseEvidenceFile(request.body?.evidence_file);
    const evidenceError = validateDeliverableFile(evidenceFile);

    if (!url && !evidenceFile) {
      response.status(422).json({ error: "Content URL or proof file is required" });
      return;
    }
    if (request.body?.url && !url) {
      response.status(422).json({ error: "Content URL must be http or https" });
      return;
    }
    if (evidenceError) {
      response.status(422).json({ error: evidenceError });
      return;
    }

    const now = new Date().toISOString();
    const deliverableId = randomUUID();
    const storedFile = evidenceFile
      ? await storeDeliverableFile({
          contractId: contract.id,
          deliverableId,
          file: evidenceFile,
        })
      : undefined;
    const [deliverable] = await insertSupabaseRowsReturning<SupabaseDeliverableRow>(
      "deliverables",
      [
        {
          id: deliverableId,
          contract_id: contract.id,
          requirement_id: requirement?.id,
          creator_profile_id: influencerAuth.profile.id,
          title,
          url,
          submitted_at: now,
          review_status: "submitted",
          metadata: {
            note,
            proof_file: storedFile,
            submitted_ip: getClientIp(request),
            submitted_user_agent: request.header("user-agent") ?? "unknown",
          },
          created_at: now,
          updated_at: now,
        },
      ],
      "deliverable",
    );

    if (!deliverable) {
      throw new Error("Deliverable insert did not return a row");
    }

    if (storedFile) {
      await insertSupabaseRowsReturning(
        "contract_files",
        [
          {
            id: randomUUID(),
            contract_id: contract.id,
            uploaded_by_profile_id: influencerAuth.profile.id,
            related_type: "deliverable",
            related_id: deliverable.id,
            file_type: "evidence",
            bucket: storedFile.bucket,
            storage_path: storedFile.path,
            file_name: storedFile.file_name,
            content_type: storedFile.content_type,
            byte_size: storedFile.byte_size,
            file_hash: storedFile.sha256,
            created_at: now,
          },
        ],
        "contract file",
      );
    }

    await insertContractEvent({
      contractId: contract.id,
      actorProfileId: influencerAuth.profile.id,
      actorRole: "influencer",
      actorDisplayName: influencerAuth.profile.name,
      eventType: "deliverable_submitted",
      targetType: "deliverable",
      targetId: deliverable.id,
      payload: {
        requirement_id: requirement?.id,
        title,
        has_url: Boolean(url),
        has_file: Boolean(storedFile),
      },
      request,
    });
    await updateContractDeliverableWorkflow(contract.id, request);

    const updatedBundle = await readContractDeliverableBundle(contract);
    response.status(201).json({
      deliverable,
      ...buildDeliverableResponse(contract, updatedBundle),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/contracts/:id/deliverables/:deliverableId", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "deliverable_review",
      request.params.deliverableId,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    if (!useSupabase) {
      response.status(503).json({ error: "Deliverable review requires Supabase" });
      return;
    }

    const advertiserAuth = await requireAdvertiserSession(request, response);
    if (!advertiserAuth) return;

    const { existingContract: contract } = await readContractWriteContext(
      request.params.id,
    );

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }
    if (!canAdvertiserAccessLegacyContract(advertiserAuth, contract)) {
      response.status(403).json({ error: "이 계약을 볼 권한이 없습니다." });
      return;
    }

    const status = normalizeRequiredText(request.body?.review_status) as DeliverableReviewStatus;
    const reviewComment = normalizeOptionalText(request.body?.review_comment);
    if (!advertiserDeliverableReviewStatuses.has(status)) {
      response.status(422).json({ error: "Valid review status is required" });
      return;
    }
    if ((status === "changes_requested" || status === "rejected") && !reviewComment) {
      response.status(422).json({ error: "Review comment is required when requesting changes or rejecting" });
      return;
    }

    const deliverables = await readSupabaseRows<SupabaseDeliverableRow>(
      "deliverables",
      `?select=*&id=eq.${encodeURIComponent(
        request.params.deliverableId,
      )}&contract_id=eq.${encodeURIComponent(contract.id)}&limit=1`,
      "deliverable review target",
    );
    const deliverable = deliverables[0];
    if (!deliverable) {
      response.status(404).json({ error: "Deliverable not found" });
      return;
    }

    const now = new Date().toISOString();
    const patchResponse = await fetchSupabase(
      "deliverables",
      `?id=eq.${encodeURIComponent(deliverable.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          review_status: status,
          review_comment: reviewComment,
          reviewed_by_profile_id: advertiserAuth.profile.id,
          reviewed_at: now,
          updated_at: now,
        }),
      },
    );
    await assertSupabaseOk(patchResponse, "Supabase deliverable review update");
    const [updatedDeliverable] = (await patchResponse.json()) as SupabaseDeliverableRow[];

    await insertContractEvent({
      contractId: contract.id,
      actorProfileId: advertiserAuth.profile.id,
      actorRole: "advertiser",
      actorDisplayName: advertiserAuth.profile.name,
      eventType:
        status === "approved"
          ? "deliverable_approved"
          : status === "changes_requested"
            ? "deliverable_changes_requested"
            : "deliverable_rejected",
      targetType: "deliverable",
      targetId: deliverable.id,
      payload: { review_status: status, review_comment: reviewComment },
      request,
    });
    await updateContractDeliverableWorkflow(contract.id, request);

    const updatedBundle = await readContractDeliverableBundle(contract);
    response.json({
      deliverable: updatedDeliverable,
      ...buildDeliverableResponse(contract, updatedBundle),
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/contracts/:id/deliverables/:deliverableId/files/:fileId",
  async (request, response, next) => {
    try {
      const { existingContract: contract } = await readContractWriteContext(
        request.params.id,
      );

      if (!contract) {
        response.status(404).json({ error: "Contract not found" });
        return;
      }

      const access = await resolveLegacyContractAccess(request, response, contract, {
        allowShareToken: false,
      });
      if (!access) return;
      if (access.role === "admin" && access.supportAccess.scope !== "contract_and_pdf") {
        response.status(403).json({
          error: "This support access request does not include private file access",
        });
        return;
      }

      const rows = await readSupabaseRows<SupabaseContractFileRow>(
        "contract_files",
        `?select=*&id=eq.${encodeURIComponent(
          request.params.fileId,
        )}&contract_id=eq.${encodeURIComponent(
          contract.id,
        )}&related_type=eq.deliverable&related_id=eq.${encodeURIComponent(
          request.params.deliverableId,
        )}&limit=1`,
        "deliverable file",
      );
      const file = rows[0];
      if (!file) {
        response.status(404).json({ error: "Deliverable file not found" });
        return;
      }

      const storedFile = parseStoredPrivateFile({
        provider: "supabase_storage",
        bucket: file.bucket,
        path: file.storage_path,
        file_name: file.file_name ?? `${file.id}.${extensionForMimeType(file.content_type ?? "")}`,
        content_type: file.content_type ?? "application/octet-stream",
        byte_size: Number(file.byte_size ?? 0),
        sha256: file.file_hash,
        stored_at: file.created_at ?? new Date(0).toISOString(),
      });

      if (!storedFile) {
        response.status(404).json({ error: "Deliverable file metadata is invalid" });
        return;
      }

      const fileBuffer = await readStoredPrivateFile(storedFile);
      const currentHash = createHash("sha256").update(fileBuffer).digest("hex");
      if (currentHash !== storedFile.sha256) {
        response.status(409).json({ error: "Deliverable file integrity check failed" });
        return;
      }

      const actor = contractAccessActor(access);
      await insertContractEvent({
        contractId: contract.id,
        actorProfileId: actor.actorProfileId,
        actorRole: actor.actorRole,
        actorDisplayName: actor.actorDisplayName,
        eventType: "deliverable_file_downloaded",
        targetType: "contract_file",
        targetId: file.id,
        payload: {
          deliverable_id: request.params.deliverableId,
          file_name: storedFile.file_name,
          access_role: access.role,
        },
        request,
      });
      if (access.role === "admin") {
        await appendSupportAccessAuditEvent(access.supportAccess.id, {
          action: "viewed_pdf",
          actor_role: "admin",
          actor_name: adminOperatorName,
          description: "운영자가 당사자 요청에 따라 제출 증빙 파일을 내려받았습니다.",
          ip: getClientIp(request),
          user_agent: request.header("user-agent") ?? "unknown",
        });
      }

      response.setHeader("Content-Type", storedFile.content_type);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${sanitizeStorageSegment(storedFile.file_name)}"`,
      );
      response.send(fileBuffer);
    } catch (error) {
      next(error);
    }
  },
);

app.post("/api/contracts/:id/support-access-requests", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "support_access_request",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const store = await readStore();
    const contract =
      store.contracts.find((item) => item.id === request.params.id) ??
      (await readSupabaseV2ContractAsLegacy(request.params.id));

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const access = await resolveLegacyContractAccess(request, response, contract, {
      allowAdmin: false,
      allowAdvertiser: true,
      allowInfluencer: true,
      allowShareToken: false,
      sendError: false,
    });

    if (!access || access.role === "admin" || access.role === "share") {
      response.status(403).json({
        error:
          "로그인한 계약 당사자만 운영자 확인 요청을 보낼 수 있습니다.",
      });
      return;
    }

    const reason = normalizeRequiredText(request.body?.reason);
    if (reason.length < 5 || reason.length > 1000) {
      response.status(422).json({
        error: "Support request reason must be between 5 and 1000 characters",
      });
      return;
    }

    const requestedScope = normalizeOptionalText(request.body?.scope);
    const scope: SupportAccessScope =
      requestedScope === "contract_and_pdf" ? "contract_and_pdf" : "contract";

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const requesterRole =
      access.role === "advertiser" ? "advertiser" : "influencer";
    const requesterProfile = "auth" in access ? access.auth.profile : undefined;
    const requesterName =
      requesterProfile?.name ??
      (requesterRole === "advertiser"
        ? contract.advertiser_info?.manager ?? contract.advertiser_info?.name
        : contract.influencer_info.name);
    const requesterEmail =
      requesterProfile?.email ??
      (requesterRole === "influencer"
        ? contract.influencer_info.contact
        : contract.advertiser_info?.manager);

    const activeDuplicate = (await readSupportAccessRequests()).find(
      (requestRecord) =>
        requestRecord.contract_id === contract.id &&
        requestRecord.requester_role === requesterRole &&
        (requesterProfile?.id
          ? requestRecord.requester_profile_id === requesterProfile.id
          : normalizeEmail(requestRecord.requester_email ?? "") ===
            normalizeEmail(requesterEmail ?? "")) &&
        isSupportAccessActive(requestRecord),
    );

    if (activeDuplicate) {
      response.status(409).json({
        error: "An active support access request already exists for this contract",
        request: activeDuplicate,
      });
      return;
    }

    await ensureSupportAccessEventStoreAvailable();

    const record = await insertSupportAccessRequest({
      id: randomUUID(),
      contract_id: contract.id,
      legacy_contract_id: contract.id,
      requester_profile_id: requesterProfile?.id,
      requester_role: requesterRole,
      requester_name: requesterName,
      requester_email: requesterEmail,
      reason,
      scope,
      status: "active",
      expires_at: expiresAt,
      audit_events: [
        {
          id: randomUUID(),
          action: "created",
          actor_role: requesterRole,
          actor_name: requesterName,
          description:
            "계약 당사자가 운영자 확인 요청을 열어 24시간 지원 열람을 허용했습니다.",
          ip: getClientIp(request),
          user_agent: request.header("user-agent") ?? "unknown",
          created_at: now,
        },
      ],
      created_at: now,
      updated_at: now,
    });
    const createdAuditEvent = record.audit_events[0];
    if (createdAuditEvent) {
      await appendSupportAccessEventRow(record, createdAuditEvent);
    }

    response.status(201).json({
      request: record,
      message: "Support access is active for 24 hours",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts/:id", async (request, response, next) => {
  try {
    const store = await readStore();
    const contract =
      store.contracts.find((item) => item.id === request.params.id) ??
      (await readSupabaseV2ContractAsLegacy(request.params.id));

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const access = await resolveLegacyContractAccess(request, response, contract);
    if (!access) {
      return;
    }

    if (access.role === "admin") {
      await appendSupportAccessAuditEvent(access.supportAccess.id, {
        action: "viewed_contract",
        actor_role: "admin",
        actor_name: adminOperatorName,
        description: "운영자가 당사자 요청에 따라 계약 본문을 열람했습니다.",
        ip: getClientIp(request),
        user_agent: request.header("user-agent") ?? "unknown",
      });
    }

    response.setHeader("Cache-Control", "no-store");
    response.json({ contract, access_role: access.role });
  } catch (error) {
    next(error);
  }
});

app.get("/api/contracts/:id/final-pdf", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "final_pdf",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const { existingContract: contract } = await readContractWriteContext(
      request.params.id,
    );

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const access = await resolveLegacyContractAccess(request, response, contract, {
      allowShareToken: false,
      sendError: false,
    });
    const signedPdfCookieAccess = !access && hasSignedPdfCookieAccess(request, contract);

    if (!access && !signedPdfCookieAccess) {
      response.status(403).json({ error: "Signed PDF access is not allowed" });
      return;
    }

    if (access?.role === "admin") {
      if (access.supportAccess.scope !== "contract_and_pdf") {
        response.status(403).json({
          error: "This support access request does not include PDF access",
        });
        return;
      }

      await appendSupportAccessAuditEvent(access.supportAccess.id, {
        action: "viewed_pdf",
        actor_role: "admin",
        actor_name: adminOperatorName,
        description: "운영자가 당사자 요청에 따라 서명본 PDF를 열람했습니다.",
        ip: getClientIp(request),
        user_agent: request.header("user-agent") ?? "unknown",
      });
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

    const actor = contractAccessActor(
      access,
      signedPdfCookieAccess ? "signed_pdf_cookie" : "unknown",
    );
    await insertContractEvent({
      contractId: contract.id,
      actorProfileId: actor.actorProfileId,
      actorRole: actor.actorRole,
      actorDisplayName: actor.actorDisplayName,
      eventType: "signed_pdf_downloaded",
      targetType: "signed_pdf",
      targetId: contract.id,
      payload: {
        access_role: access?.role ?? "signed_pdf_cookie",
        file_name: storedFile.file_name,
      },
      request,
    });

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${contract.id}-signed-record.pdf"`,
    );
    response.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/contracts/:id/signatures/influencer", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "influencer_signature",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const signatureData = String(request.body?.signature_data ?? "");
    const signerName = normalizeRequiredText(request.body?.signer_name);
    const consentAccepted = request.body?.consent_accepted === true;

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

    const {
      store,
      existingIndex,
      existingContract: existing,
    } = await readContractWriteContext(request.params.id);

    if (!existing) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }
    const influencerAuth = await requireInfluencerSession(request, response);

    if (!influencerAuth) return;

    if (!canInfluencerAccessLegacyContract(influencerAuth, existing)) {
      response.status(403).json({ error: "이 계약을 볼 권한이 없습니다." });
      return;
    }

    const shareExpiresAt = existing.evidence?.share_token_expires_at
      ? new Date(existing.evidence.share_token_expires_at).getTime()
      : undefined;
    if (
      existing.status !== "APPROVED" ||
      existing.evidence?.share_token_status !== "active" ||
      (typeof shareExpiresAt === "number" && shareExpiresAt < Date.now())
    ) {
      response.status(409).json({
        error: "광고주가 최종본 공유를 활성화한 뒤 서명할 수 있습니다.",
      });
      return;
    }

    const contractVerification = await resolveInfluencerContractVerification(
      influencerAuth,
      existing,
    );

    if (!contractVerification.ok) {
      response.status(409).json({
        error: "Contract platform verification must be approved before signing",
        required_platforms: contractVerification.requiredPlatforms,
        missing_platforms: contractVerification.missingPlatforms,
      });
      return;
    }

    if (!existing.clauses.every((clause) => clause.status === "APPROVED")) {
      response.status(409).json({
        error: "서명 전에 모든 조항이 승인되어야 합니다.",
      });
      return;
    }

    const signedAt = new Date().toISOString();
    const clientIp = getClientIp(request);
    const userAgent = request.header("user-agent") ?? "unknown";
    const { contentType: signatureContentType, buffer: signatureBuffer } =
      dataUrlToBuffer(signatureData);

    if (
      !signatureImageMimeTypes.has(signatureContentType) ||
      !assertDeclaredMimeMatchesContent(
        signatureContentType,
        signatureBuffer,
        signatureImageMimeTypes,
      ) ||
      signatureBuffer.byteLength <= 0 ||
      signatureBuffer.byteLength > maxSignatureImageSize
    ) {
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
      signatureDataUrl: signatureData,
      signatureContentType,
      signerName,
      signerEmail: existing.influencer_info.contact,
      clientIp,
      consentText: signatureConsentText,
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
        share_token_status: "revoked",
        share_token: undefined,
        share_token_expires_at: undefined,
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
        adv_sign: "",
        inf_sign: "",
        signed_at: signedAt,
        ip: clientIp,
        user_agent: userAgent,
        signer_name: signerName,
        signer_email: existing.influencer_info.contact,
        consent_text: signatureConsentText,
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

    const nextStore = mergeContractIntoStore(store, existingIndex, updatedContract);

    await writeStore(nextStore);
    setSignedPdfAccessCookie(response, updatedContract);
    response.json({ contract: updatedContract });
  } catch (error) {
    next(error);
  }
});

app.put("/api/contracts/:id", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "contract_write",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const contract = request.body?.contract as Contract | undefined;

    if (!contract || contract.id !== request.params.id) {
      response.status(400).json({ error: "Valid contract payload is required" });
      return;
    }

    const {
      store,
      existingIndex,
      existingContract,
    } = await readContractWriteContext(contract.id);
    const actor =
      request.header("X-Yeollock-Actor") ??
      request.header("X-DirectSign-Actor") ??
      "advertiser";
    let normalizedContract = normalizeContract(contract);

    if (actor !== "advertiser" && actor !== "influencer") {
      response.status(403).json({ error: "Invalid actor" });
      return;
    }

    let advertiserAuth: AdvertiserSession | undefined;

    if (actor === "advertiser") {
      advertiserAuth = await requireAdvertiserSession(request, response);

      if (!advertiserAuth) {
        return;
      }

      if (
        existingContract &&
        !canAdvertiserAccessLegacyContract(advertiserAuth, existingContract)
      ) {
        response.status(403).json({ error: "이 계약을 볼 권한이 없습니다." });
        return;
      }

      normalizedContract = await bindContractToAdvertiser(
        advertiserAuth,
        normalizedContract,
      );
    }

    const validationError = validateContractPayload(normalizedContract);

    if (validationError) {
      response.status(422).json({ error: validationError });
      return;
    }

    const advertiserAccessError =
      actor === "advertiser"
        ? verifyAdvertiserContractWriteAccess(existingContract, normalizedContract)
        : undefined;

    if (advertiserAccessError) {
      response.status(403).json({ error: advertiserAccessError });
      return;
    }

    if (actor === "influencer") {
      const access = existingContract
        ? await resolveLegacyContractAccess(request, response, existingContract, {
            allowAdmin: false,
            allowAdvertiser: false,
            allowInfluencer: true,
            allowShareToken: false,
            sendError: false,
          })
        : undefined;

      if (!access) {
        response.status(403).json({
          error: "계약 검토 변경은 인플루언서 로그인 후 진행할 수 있습니다.",
          code: "Influencer session is required for contract review changes",
        });
        return;
      }
    }

    const accessError =
      actor === "influencer"
        ? verifyInfluencerContractWriteAccess(existingContract, normalizedContract)
        : undefined;

    if (accessError) {
      response.status(403).json({ error: accessError });
      return;
    }

    if (
      actor === "advertiser" &&
      isContractSendAttempt(existingContract, normalizedContract) &&
      !(await isAdvertiserApprovedForContractSend(
        advertiserAuth!,
        normalizedContract,
      ))
    ) {
      response.status(403).json({
        error:
          "광고주 사업자 인증 승인 후 계약 공유 링크를 발송할 수 있습니다.",
      });
      return;
    }

    const updatedContract = buildServerAuthoredContract(
      actor as Exclude<AuditActor, "system">,
      existingContract,
      normalizedContract,
    );

    const nextStore = mergeContractIntoStore(
      store,
      existingIndex,
      updatedContract,
    );
    await writeStore(nextStore);
    response.json({ contract: updatedContract });
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
    console.error(`[${productName} API]`, error);
    response.status(500).json({ error: "Internal server error" });
  },
);

const isVercelFunction = isHostedRuntime;

if (!isVercelFunction) {
  const httpServer = createHttpServer(app);

  if (isPreview) {
    const distDir = path.join(root, ["di", "st"].join(""));
    app.use(express.static(distDir));
    app.get("*", (_request, response) => {
      response.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root,
      configLoader: "runner",
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(
      `[${productName}] ${isPreview ? "preview" : "dev"} server running on http://localhost:${port}`,
    );
  });
}

export default app;
