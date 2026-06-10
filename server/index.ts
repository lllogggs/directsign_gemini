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
import {
  createDemoContracts,
  createEvidence,
  createShareToken,
  createWorkflow,
  isFixedCampaignContract,
} from "../src/domain/contracts.js";
import type {
  Contract,
  ContractDeliverableItem,
  ContractPlatform,
} from "../src/domain/contracts.js";
import type {
  InfluencerDashboardActivityEvent,
  InfluencerDashboardApplication,
  InfluencerDashboardContract,
  InfluencerDashboardContractStage,
  InfluencerDashboardResponse,
  InfluencerDashboardTask,
} from "../src/domain/influencerDashboard";
import {
  buildMarketplaceCampaignPosts,
  campaignProposalTypeOptions,
  findBrandProfileByHandle,
  findInfluencerProfileByHandle,
  mergeMarketplaceBrandProfiles,
  mergeMarketplaceInfluencerProfiles,
  platformLabels,
  type CampaignProposalType,
  type MarketplaceBrandCampaign,
  type MarketplaceBrandProfile,
  type MarketplaceCampaignStatus,
  type MarketplaceCampaignPost,
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
  buildInfluencerPublicProfileUrl,
  createMarketplaceProfileFromPublicSettings,
  formatInfluencerPublicProfileUrl,
  getAutomaticPublicProfileHandle,
  getInfluencerPublicProfilePath,
  getPublicProfileHandleError,
  normalizePublicProfileHandle,
  type InfluencerPublicProfileSettings,
} from "../src/domain/publicInfluencerProfile.js";
import {
  SIGNATURE_CONSENT_TEXT,
  SIGNATURE_CONSENT_VERSION,
  SUPPORT_ACCESS_CONSENT_TEXT,
} from "../src/domain/legalConsent.js";
import { normalizeSeoPath, staticSeoRoutePaths } from "../src/domain/seo.js";

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
  | "instagram_dm_code"
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

type OperationalSupportTicketCategory =
  | "service_error"
  | "account_access"
  | "contract_flow"
  | "privacy_request"
  | "other";
type OperationalSupportTicketRequesterRole =
  | "advertiser"
  | "influencer"
  | "operator"
  | "other";
type OperationalSupportTicketSeverity = "low" | "normal" | "high" | "urgent";
type OperationalSupportTicketStatus =
  | "open"
  | "reviewing"
  | "resolved"
  | "closed";

interface OperationalSupportTicketRecord {
  id: string;
  category: OperationalSupportTicketCategory;
  requester_role: OperationalSupportTicketRequesterRole;
  requester_name?: string;
  requester_email: string;
  subject: string;
  message: string;
  context_url?: string;
  contract_id?: string;
  contract_title?: string;
  page_path?: string;
  browser_context?: Record<string, unknown>;
  severity: OperationalSupportTicketSeverity;
  status: OperationalSupportTicketStatus;
  admin_note?: string;
  source: string;
  ip_hash?: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

interface OperationalSupportTicketStoreFile {
  support_tickets: OperationalSupportTicketRecord[];
}

type OperationalAlertKind =
  | "verification_request"
  | "support_ticket"
  | "support_access";
type OperationalAlertAction =
  | "auto_approved"
  | "needs_review"
  | "mobile_action";
type OperationalAlertSeverity = "info" | "normal" | "high" | "urgent";
type OperationalAlertStatus = "queued" | "sent" | "failed" | "muted";

interface OperationalAlertRecord {
  id: string;
  kind: OperationalAlertKind;
  action: OperationalAlertAction;
  severity: OperationalAlertSeverity;
  status: OperationalAlertStatus;
  subject_type: string;
  subject_id: string;
  title: string;
  body: string;
  mobile_path: string;
  dashboard_path?: string;
  dedupe_key: string;
  decision_reason?: string;
  metadata_json: Record<string, unknown>;
  sent_at?: string;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

interface OperationalAlertStoreFile {
  operational_alerts: OperationalAlertRecord[];
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
const supportTicketDataFile = path.join(dataDir, "support-tickets.json");
const operationalAlertDataFile = path.join(dataDir, "operational-alerts.json");
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
const cronSecret = readConfiguredServerSecret("CRON_SECRET");
const discordOperationsWebhookUrl =
  readConfiguredServerSecret("DISCORD_OPERATIONS_WEBHOOK_URL") ??
  readConfiguredServerSecret("OPERATIONS_DISCORD_WEBHOOK_URL");
const discordOperationsBotToken =
  readConfiguredServerSecret("DISCORD_OPERATIONS_BOT_TOKEN") ??
  readConfiguredServerSecret("OPERATIONS_DISCORD_BOT_TOKEN");
const discordOperationsChannelId =
  readConfiguredServerSecret("DISCORD_OPERATIONS_CHANNEL_ID") ??
  readConfiguredServerSecret("OPERATIONS_DISCORD_CHANNEL_ID");
const discordOperationsUserAgent = "yeollock-operations-notifier/1.0";
const adminSessionSecret = resolveServerSecret({
  name: "ADMIN_SESSION_SECRET",
  purpose: "signing admin session cookies",
  requiredInProduction: isProductionRuntime || Boolean(adminAccessCode),
  generateLocal: Boolean(adminAccessCode) || !isProductionRuntime,
});
const userSessionFastPathSecret =
  resolveServerSecret({
    name: "USER_SESSION_FAST_PATH_SECRET",
    purpose: "signing short-lived advertiser and influencer fast session cookies",
    requiredInProduction: false,
    generateLocal: false,
  }) ?? adminSessionSecret;

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
const advertiserFastSessionCookie = "directsign_advertiser_fast";
const influencerAccessCookie = "directsign_influencer_access";
const influencerRefreshCookie = "directsign_influencer_refresh";
const influencerFastSessionCookie = "directsign_influencer_fast";
const signedPdfAccessCookie = "yeollock_signed_pdf_access";
const influencerAccessMaxAgeSeconds = 60 * 60;
const influencerRefreshMaxAgeSeconds = 60 * 60 * 24 * 14;
const userFastSessionMaxAgeSeconds = 60 * 10;
const signedPdfAccessMaxAgeSeconds = 60 * 10;
const defaultAdvertiserTargetId =
  process.env.DIRECTSIGN_DEFAULT_ADVERTISER_ID ?? "adv_1";
const defaultInfluencerTargetId =
  process.env.DIRECTSIGN_DEFAULT_INFLUENCER_ID ?? "influencer_guest";
const privateStorageBucket =
  process.env.DIRECTSIGN_PRIVATE_STORAGE_BUCKET ?? "directsign-private";
const privateFilesDir = path.join(dataDir, "private-files");
const marketplacePublicStorageBucket =
  process.env.MARKETPLACE_PUBLIC_STORAGE_BUCKET ?? "yeollock-marketplace-public";
const marketplacePublicFilesDir = path.join(dataDir, "marketplace-public");
const allowLocalPrivateFileFallback =
  (!isProductionRuntime && !useSupabase) ||
  demoMode ||
  (!isProductionRuntime &&
    process.env.DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK === "true");
const allowLocalMarketplacePublicFileFallback =
  (!isProductionRuntime && !useSupabase) ||
  demoMode ||
  (!isProductionRuntime &&
    process.env.MARKETPLACE_ALLOW_LOCAL_PUBLIC_FILE_FALLBACK === "true");
const allowProductionTestData =
  process.env.YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA === "true";
const allowMarketplaceSeedData =
  demoMode || !isProductionRuntime || allowProductionTestData;
const allowPublicMarketplaceCatalogFallback =
  process.env.DISABLE_PUBLIC_MARKETPLACE_CATALOG_FALLBACK !== "1";
const filterOperationalMarketplaceTestData =
  isProductionRuntime && !demoMode && !allowProductionTestData;
const signatureConsentVersion = SIGNATURE_CONSENT_VERSION;
const signatureConsentText = SIGNATURE_CONSENT_TEXT;
const supportAccessConsentText = SUPPORT_ACCESS_CONSENT_TEXT;
const productName = process.env.PRODUCT_NAME ?? process.env.VITE_PRODUCT_NAME ?? "yeollock.me";
const adminOperatorName = configuredAdminOperatorName ?? `${productName} 운영자`;
const signupTermsVersion = "2026-06-02";
const signupPrivacyPolicyVersion = "2026-06-02";
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
const dayMs = 24 * 60 * 60 * 1000;
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
const marketplaceFollowerSyncMaxChannels = Math.min(
  Math.floor(
    parsePositiveNumberEnv(
      process.env.MARKETPLACE_FOLLOWER_SYNC_MAX_CHANNELS,
      25,
    ),
  ),
  100,
);
const marketplaceFollowerSyncStaleMs =
  parsePositiveNumberEnv(process.env.MARKETPLACE_FOLLOWER_SYNC_STALE_DAYS, 6) *
  dayMs;
const marketplaceNaverBlogVisitorSyncStaleMs =
  parsePositiveNumberEnv(
    process.env.MARKETPLACE_NAVER_BLOG_VISITOR_SYNC_STALE_DAYS,
    1,
  ) * dayMs;
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
const logLegacyShareTokenDecryptWarnings =
  process.env.DIRECTSIGN_LOG_LEGACY_TOKEN_DECRYPT_WARNINGS === "true";
const loggedLegacyShareTokenDecryptFailures = new Set<string>();
const maxLoggedLegacyShareTokenDecryptFailures = 100;

export const app = express();
app.set("trust proxy", isHostedRuntime ? 1 : false);
app.use(
  express.json({
    limit: "10mb",
    verify: (request, _response, buffer) => {
      (request as express.Request & { rawBody?: Buffer }).rawBody =
        Buffer.from(buffer);
    },
  }),
);

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
        "img-src 'self' data: blob: https://*.supabase.co https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "script-src 'self' https://*.googletagmanager.com https://*.clarity.ms",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com",
      ].join("; "),
    );
  }
  next();
});

app.get("/favicon.ico", (_request, response) => {
  response.type("image/x-icon");
  response.sendFile(path.join(root, "public", "favicon.ico"));
});

app.use(
  "/marketplace-assets",
  express.static(marketplacePublicFilesDir, {
    immutable: true,
    maxAge: "30d",
    redirect: false,
  }),
);

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

const contractStatuses = new Set([
  "DRAFT",
  "REVIEWING",
  "NEGOTIATING",
  "APPROVED",
  "SIGNED",
  "CLOSED",
]);
const clauseStatuses = new Set([
  "PENDING_REVIEW",
  "APPROVED",
  "MODIFICATION_REQUESTED",
  "DELETION_REQUESTED",
]);
const shareTokenStatuses = new Set(["not_issued", "active", "expired", "revoked"]);
const pdfStatuses = new Set(["not_ready", "draft_ready", "signed_ready"]);
const verificationStatuses = new Set(["pending", "approved", "rejected"]);
const advertiserTrustRiskLevels = new Set(["low", "medium", "high"]);
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
  "instagram_dm_code",
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
const marketplaceImageMimeTypes = signatureImageMimeTypes;
const maxMarketplaceImageSize = 3 * 1024 * 1024;
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
    if (logLegacyShareTokenDecryptWarnings) {
      const fingerprint = createHash("sha256").update(value).digest("hex").slice(0, 12);
      if (!loggedLegacyShareTokenDecryptFailures.has(fingerprint)) {
        if (
          loggedLegacyShareTokenDecryptFailures.size >=
          maxLoggedLegacyShareTokenDecryptFailures
        ) {
          loggedLegacyShareTokenDecryptFailures.clear();
        }
        loggedLegacyShareTokenDecryptFailures.add(fingerprint);
        console.warn(`[yeollock.me] failed to decrypt legacy share token ${fingerprint}`);
      }
    }
    return undefined;
  }
};

const normalizeContract = (contract: Contract): Contract => {
  const normalizedContract: Contract = {
    ...contract,
    campaign_name: hasText(contract.campaign_name)
      ? contract.campaign_name.trim()
      : contract.title,
    post_link: hasText(contract.post_link) ? contract.post_link.trim() : undefined,
  };

  if (!contract.evidence) return normalizedContract;

  const shareToken =
    contract.evidence.share_token_status === "active"
      ? (contract.evidence.share_token ?? createShareToken())
      : undefined;

  return {
    ...normalizedContract,
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
  campaign_name?: string | null;
  post_link?: string | null;
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
  avatar_url?: string | null;
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

type SupabaseOrganizationMemberWithOrganizationRow =
  SupabaseOrganizationMemberRow & {
    organizations?: SupabaseOrganizationRow | SupabaseOrganizationRow[] | null;
  };

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

interface SupabaseContractEventRow {
  id: string;
  contract_id: string;
  actor_role?: string | null;
  actor_display_name?: string | null;
  event_type: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
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
  platform_id?: string | null;
  deliverable_type: string;
  title: string;
  description?: string | null;
  quantity?: number | null;
  due_at?: string | null;
  retention_days?: number | null;
  content_format?: string | null;
  requirement_json?: Record<string, unknown> | null;
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
  avatar_url?: string | null;
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
  follower_count?: number | null;
  follower_count_synced_at?: string | null;
  follower_sync_status?:
    | "not_synced"
    | "synced"
    | "stale"
    | "failed"
    | "skipped"
    | "not_configured"
    | null;
  follower_sync_source?: string | null;
  follower_sync_error?: string | null;
  follower_sync_metadata?: Record<string, unknown> | null;
  sort_order?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

type SupabaseMarketplaceInfluencerHandleRow = Pick<
  SupabaseMarketplaceInfluencerProfileRow,
  | "id"
  | "owner_profile_id"
  | "public_handle"
  | "display_name"
  | "created_at"
  | "updated_at"
>;

interface SupabaseMarketplaceFollowerSyncRunRow {
  id: string;
  requested_by: string;
  status: "running" | "completed" | "partial_failed" | "failed";
  started_at: string;
  finished_at?: string | null;
  channels_checked: number;
  channels_updated: number;
  channels_failed: number;
  channels_skipped: number;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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
  logo_url?: string | null;
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
  sender_influencer_avatar_label?: string | null;
  sender_influencer_avatar_url?: string | null;
  sender_influencer_display_name?: string | null;
  sender_influencer_headline?: string | null;
  sender_influencer_categories?: string[] | null;
  sender_name: string;
  sender_intro: string;
  proposal_type: CampaignProposalType;
  proposal_summary: string;
  campaign_id?: string | null;
  campaign_snapshot?: MarketplaceCampaignSnapshot | null;
  converted_contract_id?: string | null;
  status: MarketplaceProposalStatus;
  created_at: string;
  updated_at: string;
  marketplace_platforms?: MarketplaceMessageThread["platforms"];
}

interface MarketplaceCampaignSnapshot {
  id: string;
  title: string;
  type: CampaignProposalType;
  budget: string;
  applicantLimit?: string;
  summary?: string;
  deadline?: string;
  uploadDeadline?: string;
  platforms?: InfluencerPlatform[];
  deliverables?: string[];
  brandId: string;
  brandHandle: string;
  brandName: string;
  brandCategory?: string;
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

const supabaseAuthWarmupMinIntervalMs = 30 * 1000;
const supabaseRequestTimeoutMs = parsePositiveNumberEnv(
  process.env.SUPABASE_REQUEST_TIMEOUT_MS,
  8,
) * 1000;
let supabaseAuthWarmupStartedAt = 0;
let supabaseAuthWarmupPromise: Promise<void> | undefined;

const createSupabaseTimeoutSignal = () => AbortSignal.timeout(supabaseRequestTimeoutMs);

const warmSupabaseAuthConnection = async () => {
  if (!supabaseUrl || !supabasePublishableKey) return;

  const now = Date.now();
  if (supabaseAuthWarmupPromise) {
    await supabaseAuthWarmupPromise;
    return;
  }
  if (now - supabaseAuthWarmupStartedAt < supabaseAuthWarmupMinIntervalMs) return;

  supabaseAuthWarmupStartedAt = now;
  supabaseAuthWarmupPromise = fetch(supabaseAuthUrl("/settings"), {
    headers: supabaseAuthHeaders(),
    cache: "no-store",
    signal: createSupabaseTimeoutSignal(),
  })
    .then(async (warmupResponse) => {
      if (!warmupResponse.ok) {
        throw new Error(
          `Supabase Auth warmup failed (${warmupResponse.status}): ${await parseSupabaseError(
            warmupResponse,
          )}`,
        );
      }
    })
    .finally(() => {
      supabaseAuthWarmupPromise = undefined;
    });

  await supabaseAuthWarmupPromise;
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
  row: Pick<SupabaseContractRow, "contract" | "share_token"> &
    Partial<Pick<SupabaseContractRow, "campaign_name" | "post_link">>,
) => {
  const fallbackToken = decryptShareTokenFromLegacyStore(row.share_token);
  const contractToken = decryptShareTokenFromLegacyStore(
    row.contract?.evidence?.share_token,
  );
  const shareToken = contractToken ?? fallbackToken;

  const restoredContract = row.contract
    ? {
        ...row.contract,
        campaign_name: row.contract.campaign_name ?? row.campaign_name ?? undefined,
        post_link: row.contract.post_link ?? row.post_link ?? undefined,
      }
    : row.contract;

  if (!restoredContract?.evidence || !shareToken) return restoredContract;

  return {
    ...restoredContract,
    evidence: {
      ...restoredContract.evidence,
      share_token: shareToken,
    },
  };
};

const toLegacySupabaseStatus = (status: Contract["status"]) =>
  status === "CLOSED" ? "SIGNED" : status;

const toSupabaseRow = (contract: Contract): SupabaseContractRow => {
  const normalizedContract = normalizeContract(contract);
  const protectedContract = protectLegacyContractForSupabase(normalizedContract);

  return {
    id: normalizedContract.id,
    advertiser_id: normalizedContract.advertiser_id,
    campaign_name: normalizedContract.campaign_name ?? normalizedContract.title,
    post_link: normalizedContract.post_link ?? null,
    title: normalizedContract.title,
    status: toLegacySupabaseStatus(normalizedContract.status),
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
    signal: init.signal ?? createSupabaseTimeoutSignal(),
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

const isMissingLegacyCampaignColumnError = (message: string) =>
  /campaign_name|post_link/i.test(message) &&
  /column|schema cache|Could not find/i.test(message);

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

const recentSessionCacheTtlMs = parsePositiveNumberEnv(
  process.env.SUPABASE_RECENT_SESSION_CACHE_SECONDS,
  8,
) * 1000;
const profileCacheTtlMs = parsePositiveNumberEnv(
  process.env.SUPABASE_PROFILE_CACHE_SECONDS,
  8,
) * 1000;
const supabaseContractStoreCacheTtlMs =
  parsePositiveNumberEnv(process.env.SUPABASE_CONTRACT_STORE_CACHE_SECONDS, 20) *
  1000;
const supabaseVerificationRequestCacheTtlMs =
  parsePositiveNumberEnv(
    process.env.SUPABASE_VERIFICATION_REQUEST_CACHE_SECONDS,
    20,
  ) * 1000;
const organizationCacheTtlMs =
  parsePositiveNumberEnv(process.env.SUPABASE_ORGANIZATION_CACHE_SECONDS, 60) *
  1000;
const recentAuthSessionCache = new Map<
  string,
  { user: SupabaseAuthUser; cachedAt: number }
>();
const profileCache = new Map<
  string,
  { profile: SupabaseProfileRow; cachedAt: number }
>();
const profileEmailCache = new Map<
  string,
  { profile: SupabaseProfileRow; cachedAt: number }
>();
let supabaseContractStoreCache:
  | { store: ContractStoreFile; cachedAt: number }
  | undefined;
let supabaseContractStoreInflight: Promise<ContractStoreFile> | undefined;
let supabaseVerificationRequestCache:
  | { requests: VerificationRequestRecord[]; cachedAt: number }
  | undefined;
let supabaseVerificationRequestInflight:
  | Promise<VerificationRequestRecord[]>
  | undefined;
const organizationCache = new Map<
  string,
  { organization?: SupabaseOrganizationRow; cachedAt: number }
>();
const organizationInflight = new Map<
  string,
  Promise<SupabaseOrganizationRow | undefined>
>();
const influencerDashboardCacheTtlMs =
  parsePositiveNumberEnv(process.env.SUPABASE_INFLUENCER_DASHBOARD_CACHE_SECONDS, 15) *
  1000;
const influencerDashboardCache = new Map<
  string,
  { dashboard: InfluencerDashboardResponse; cachedAt: number }
>();
const influencerDashboardInflight = new Map<
  string,
  Promise<InfluencerDashboardResponse>
>();

const getTokenCacheKey = (accessToken: string) =>
  createHash("sha256").update(accessToken).digest("hex");

const readRecentAuthSession = (accessToken: string | undefined) => {
  if (!accessToken) return undefined;
  const key = getTokenCacheKey(accessToken);
  const cache = recentAuthSessionCache.get(key);
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > recentSessionCacheTtlMs) {
    recentAuthSessionCache.delete(key);
    return undefined;
  }
  return cache.user;
};

const rememberRecentAuthSession = (
  accessToken: string | undefined,
  user: SupabaseAuthUser | undefined,
) => {
  if (!accessToken || !user?.id) return;
  recentAuthSessionCache.set(getTokenCacheKey(accessToken), {
    user,
    cachedAt: Date.now(),
  });
};

const forgetRecentAuthSession = (accessToken: string | undefined) => {
  if (!accessToken) return;
  recentAuthSessionCache.delete(getTokenCacheKey(accessToken));
};

const readProfileFromCache = (userId: string) => {
  const cache = profileCache.get(userId);
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > profileCacheTtlMs) {
    profileCache.delete(userId);
    return undefined;
  }
  return cache.profile;
};

const rememberProfile = (profile: SupabaseProfileRow | undefined) => {
  if (!profile?.id) return;
  profileCache.set(profile.id, {
    profile,
    cachedAt: Date.now(),
  });
  if (profile.email) {
    profileEmailCache.set(normalizeEmail(profile.email), {
      profile,
      cachedAt: Date.now(),
    });
  }
};

const forgetProfile = (userId: string | undefined) => {
  if (!userId) return;
  profileCache.delete(userId);
  for (const [email, cache] of profileEmailCache.entries()) {
    if (cache.profile.id === userId) {
      profileEmailCache.delete(email);
    }
  }
};

const readProfileFromEmailCache = (email: string) => {
  const cache = profileEmailCache.get(normalizeEmail(email));
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > profileCacheTtlMs) {
    profileEmailCache.delete(normalizeEmail(email));
    return undefined;
  }
  return cache.profile;
};

const cloneContractStore = (store: ContractStoreFile): ContractStoreFile =>
  normalizeStore({ contracts: [...store.contracts] });

type SupabaseLegacyContractProjection =
  Pick<SupabaseContractRow, "id" | "contract" | "share_token"> &
    Partial<Pick<SupabaseContractRow, "campaign_name" | "post_link">>;

const rememberSupabaseContractStoreCache = (store: ContractStoreFile) => {
  supabaseContractStoreCache = {
    store: cloneContractStore(store),
    cachedAt: Date.now(),
  };
};

const readSupabaseContractStoreCache = () => {
  if (!supabaseContractStoreCache) return undefined;
  if (
    Date.now() - supabaseContractStoreCache.cachedAt >
    supabaseContractStoreCacheTtlMs
  ) {
    supabaseContractStoreCache = undefined;
    return undefined;
  }
  return cloneContractStore(supabaseContractStoreCache.store);
};

const invalidateSupabaseContractStoreCache = () => {
  supabaseContractStoreCache = undefined;
  supabaseContractStoreInflight = undefined;
};

const cloneVerificationRequests = (requests: VerificationRequestRecord[]) =>
  requests.map(normalizeVerificationRequest);

const rememberSupabaseVerificationRequestCache = (
  requests: VerificationRequestRecord[],
) => {
  supabaseVerificationRequestCache = {
    requests: cloneVerificationRequests(requests),
    cachedAt: Date.now(),
  };
};

const readSupabaseVerificationRequestCache = () => {
  if (!supabaseVerificationRequestCache) return undefined;
  if (
    Date.now() - supabaseVerificationRequestCache.cachedAt >
    supabaseVerificationRequestCacheTtlMs
  ) {
    supabaseVerificationRequestCache = undefined;
    return undefined;
  }
  return cloneVerificationRequests(supabaseVerificationRequestCache.requests);
};

const invalidateSupabaseVerificationRequestCache = () => {
  supabaseVerificationRequestCache = undefined;
  supabaseVerificationRequestInflight = undefined;
};

const readOrganizationFromCache = (profileId: string) => {
  const cache = organizationCache.get(profileId);
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > organizationCacheTtlMs) {
    organizationCache.delete(profileId);
    return undefined;
  }
  return cache.organization;
};

const rememberOrganizationCache = (
  profileId: string,
  organization: SupabaseOrganizationRow | undefined,
) => {
  organizationCache.set(profileId, { organization, cachedAt: Date.now() });
};

const invalidateOrganizationCache = () => {
  organizationCache.clear();
  organizationInflight.clear();
};

const cloneInfluencerDashboard = (
  dashboard: InfluencerDashboardResponse,
): InfluencerDashboardResponse =>
  JSON.parse(JSON.stringify(dashboard)) as InfluencerDashboardResponse;

const getInfluencerDashboardCacheKey = (
  userId: string,
  options: InfluencerDashboardBuildOptions = {},
) => `${userId}:${options.includeApplications === false ? "lite" : "full"}`;

const readInfluencerDashboardCache = (
  userId: string,
  options: InfluencerDashboardBuildOptions = {},
) => {
  const key = getInfluencerDashboardCacheKey(userId, options);
  const cache = influencerDashboardCache.get(key);
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > influencerDashboardCacheTtlMs) {
    influencerDashboardCache.delete(key);
    return undefined;
  }
  return cloneInfluencerDashboard(cache.dashboard);
};

const rememberInfluencerDashboardCache = (
  userId: string,
  options: InfluencerDashboardBuildOptions,
  dashboard: InfluencerDashboardResponse,
) => {
  influencerDashboardCache.set(getInfluencerDashboardCacheKey(userId, options), {
    dashboard: cloneInfluencerDashboard(dashboard),
    cachedAt: Date.now(),
  });
};

const invalidateInfluencerDashboardCache = () => {
  influencerDashboardCache.clear();
  influencerDashboardInflight.clear();
};

const readProfileByUserId = async (userId: string) => {
  if (!useSupabase) return undefined;
  const cachedProfile = readProfileFromCache(userId);
  if (cachedProfile) return cachedProfile;

  const rows = await readSupabaseRows<SupabaseProfileRow>(
    "profiles",
    `?select=${profileSelectFields}&id=eq.${encodeURIComponent(userId)}&limit=1`,
    "profile",
  );

  const profile = rows[0];
  rememberProfile(profile);
  return profile;
};

const readProfileByEmail = async (email: string) => {
  if (!useSupabase || !email) return undefined;
  const cachedProfile = readProfileFromEmailCache(email);
  if (cachedProfile) return cachedProfile;

  const rows = await readSupabaseRows<SupabaseProfileRow>(
    "profiles",
    `?select=${profileSelectFields}&email=eq.${encodeURIComponent(email)}&limit=1`,
    "profile by email",
  );

  const profile = rows[0];
  rememberProfile(profile);
  return profile;
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

const syncProfileEmailVerifiedAtInBackground = (authUser: SupabaseAuthUser) => {
  void syncProfileEmailVerifiedAt(authUser).catch((error) => {
    console.warn(
      `[${productName}] profile email verification background sync failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  });
};

const readDefaultOrganizationForProfile = async (profileId: string) => {
  if (!useSupabase) return undefined;
  const cachedOrganization = readOrganizationFromCache(profileId);
  if (cachedOrganization !== undefined || organizationCache.has(profileId)) {
    return cachedOrganization;
  }
  const inflight = organizationInflight.get(profileId);
  if (inflight) return inflight;

  const request = (async () => {
    let memberships: SupabaseOrganizationMemberWithOrganizationRow[];
    try {
      memberships =
        await readSupabaseRows<SupabaseOrganizationMemberWithOrganizationRow>(
          "organization_members",
          `?select=organization_id,profile_id,role,is_default,organizations(*)&profile_id=eq.${encodeURIComponent(
            profileId,
          )}&order=is_default.desc&limit=1`,
          "organization membership with organization",
        );
    } catch {
      memberships = await readSupabaseRows<SupabaseOrganizationMemberRow>(
        "organization_members",
        `?select=organization_id,profile_id,role,is_default&profile_id=eq.${encodeURIComponent(
          profileId,
        )}&order=is_default.desc&limit=1`,
        "organization membership",
      );
    }

    const organizationId = memberships[0]?.organization_id;
    const embeddedOrganization = Array.isArray(memberships[0]?.organizations)
      ? memberships[0]?.organizations?.[0]
      : memberships[0]?.organizations;

    if (!organizationId) {
      rememberOrganizationCache(profileId, undefined);
      return undefined;
    }

    if (embeddedOrganization?.id) {
      rememberOrganizationCache(profileId, embeddedOrganization);
      return embeddedOrganization;
    }

    const organizations = await readSupabaseRows<SupabaseOrganizationRow>(
      "organizations",
      `?select=*&id=eq.${encodeURIComponent(organizationId)}&limit=1`,
      "organization",
    );

    const organization = organizations[0];
    rememberOrganizationCache(profileId, organization);
    return organization;
  })().finally(() => {
    organizationInflight.delete(profileId);
  });

  organizationInflight.set(profileId, request);
  return request;
};

const buildAdvertiserSessionUser = (
  authUser: SupabaseAuthUser,
  profile: SupabaseProfileRow,
  organization?: SupabaseOrganizationRow,
) => ({
  id: profile.id,
  email: profile.email ?? authUser.email,
  name: profile.name,
  role: profile.role,
  company_name: organization?.name ?? profile.company_name,
  verification_status:
    organization?.business_verification_status ??
    profile.verification_status ??
    "not_submitted",
  business_registration_number:
    organization?.business_registration_number ?? undefined,
});

const isAdvertiserRole = (role: SupabaseProfileRow["role"] | undefined) =>
  role === "marketer";

const isInfluencerRole = (role: SupabaseProfileRow["role"] | undefined) =>
  role === "influencer";

const buildInfluencerSessionUser = (
  authUser: SupabaseAuthUser,
  profile: SupabaseProfileRow,
): InfluencerDashboardResponse["user"] => ({
  id: authUser.id,
  email: profile.email ?? authUser.email ?? "",
  name: profile.name ?? authUser.email ?? "인플루언서",
  avatar_url: profile.avatar_url ?? undefined,
  role: profile.role,
  activity_categories: profile.activity_categories ?? [],
  activity_platforms: profile.activity_platforms ?? [],
  verification_status:
    (profile.verification_status as VerificationStatus | undefined) ??
    "not_submitted",
  email_verified: Boolean(
    authUser.email_confirmed_at ??
      authUser.confirmed_at ??
      profile.email_verified_at,
  ),
});

const buildInfluencerSessionVerification = (
  profile: SupabaseProfileRow,
): InfluencerDashboardResponse["verification"] => ({
  status:
    (profile.verification_status as VerificationStatus | undefined) ??
    "not_submitted",
  approved_platforms: [],
});

const requireAdvertiserSession = async (
  request: express.Request,
  response: express.Response,
) => {
  const auth = await authenticateAdvertiserRequest(request, response);

  if (!auth) {
    response.status(401).json({ error: "광고주 로그인이 필요합니다." });
    return undefined;
  }

  const profile = auth.profile ?? (await readProfileByUserId(auth.user.id));

  if (!isAdvertiserRole(profile?.role)) {
    response.status(403).json({
      error: "광고주 계정 권한이 필요합니다. 광고주 계정으로 로그인해 주세요.",
    });
    return undefined;
  }

  if (!auth.fastSession) {
    const fastToken = createUserFastSessionToken(auth.user, profile, "marketer");
    if (fastToken) {
      response.append(
        "Set-Cookie",
        `${advertiserFastSessionCookie}=${encodeURIComponent(
          fastToken,
        )}; ${advertiserCookieOptions(userFastSessionMaxAgeSeconds)}`,
      );
    }
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

  const profile = auth.profile ?? (await readProfileByUserId(auth.user.id));

  if (!isInfluencerRole(profile?.role)) {
    response.status(403).json({
      error: "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.",
    });
    return undefined;
  }

  if (!auth.fastSession) {
    const fastToken = createUserFastSessionToken(auth.user, profile, "influencer");
    if (fastToken) {
      response.append(
        "Set-Cookie",
        `${influencerFastSessionCookie}=${encodeURIComponent(
          fastToken,
        )}; ${influencerCookieOptions(userFastSessionMaxAgeSeconds)}`,
      );
    }
  }

  return { ...auth, profile };
};

type AdvertiserSession = NonNullable<
  Awaited<ReturnType<typeof requireAdvertiserSession>>
>;
type InfluencerSession = NonNullable<
  Awaited<ReturnType<typeof requireInfluencerSession>>
>;

type AdvertiserDashboardBootstrapPayload = {
  contracts: Contract[];
  verification: Awaited<ReturnType<typeof buildAdvertiserScopedVerificationSummary>>;
  message_summary?: MarketplaceMessageSummary;
  source: "supabase" | "file";
  allow_local_merge: boolean;
  demo_mode: boolean;
};

const advertiserDashboardCacheTtlMs =
  parsePositiveNumberEnv(
    process.env.SUPABASE_ADVERTISER_DASHBOARD_CACHE_SECONDS,
    10,
  ) * 1000;
const advertiserDashboardCache = new Map<
  string,
  { dashboard: AdvertiserDashboardBootstrapPayload; cachedAt: number }
>();
const advertiserDashboardInflight = new Map<
  string,
  Promise<AdvertiserDashboardBootstrapPayload | undefined>
>();

const cloneAdvertiserDashboardBootstrap = (
  dashboard: AdvertiserDashboardBootstrapPayload,
): AdvertiserDashboardBootstrapPayload =>
  JSON.parse(JSON.stringify(dashboard)) as AdvertiserDashboardBootstrapPayload;

const getAdvertiserDashboardCacheKey = (
  auth: AdvertiserSession,
  includeMessageSummary: boolean,
) => `${auth.profile.id}:${includeMessageSummary ? "full" : "lite"}`;

const canUseAdvertiserDashboardCache = (auth: AdvertiserSession) =>
  hasText(auth.accessToken) || auth.fastSession === true;

const readAdvertiserDashboardCache = (
  auth: AdvertiserSession,
  includeMessageSummary: boolean,
) => {
  if (!canUseAdvertiserDashboardCache(auth)) return undefined;
  const key = getAdvertiserDashboardCacheKey(auth, includeMessageSummary);
  const cache = advertiserDashboardCache.get(key);
  if (!cache) return undefined;
  if (Date.now() - cache.cachedAt > advertiserDashboardCacheTtlMs) {
    advertiserDashboardCache.delete(key);
    return undefined;
  }
  return cloneAdvertiserDashboardBootstrap(cache.dashboard);
};

const rememberAdvertiserDashboardCache = (
  auth: AdvertiserSession,
  includeMessageSummary: boolean,
  dashboard: AdvertiserDashboardBootstrapPayload,
) => {
  if (!canUseAdvertiserDashboardCache(auth)) return;
  advertiserDashboardCache.set(
    getAdvertiserDashboardCacheKey(auth, includeMessageSummary),
    {
      dashboard: cloneAdvertiserDashboardBootstrap(dashboard),
      cachedAt: Date.now(),
    },
  );
};

const invalidateAdvertiserDashboardCache = () => {
  advertiserDashboardCache.clear();
  advertiserDashboardInflight.clear();
};

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

async function buildAdvertiserLoginDashboardBootstrap(
  auth: AdvertiserSession,
  options: { includeMessageSummary?: boolean } = {},
) {
  try {
    const includeMessageSummary = options.includeMessageSummary ?? true;
    const useDashboardCache = canUseAdvertiserDashboardCache(auth);
    const cachedDashboard = readAdvertiserDashboardCache(
      auth,
      includeMessageSummary,
    );
    if (cachedDashboard) return cachedDashboard;

    const key = getAdvertiserDashboardCacheKey(auth, includeMessageSummary);
    const inflight = useDashboardCache
      ? advertiserDashboardInflight.get(key)
      : undefined;
    if (inflight) {
      const dashboard = await inflight;
      return dashboard ? cloneAdvertiserDashboardBootstrap(dashboard) : undefined;
    }

    const dashboardPromise = (async () => {
      const [contracts, verification, messageSummary] = await Promise.all([
        readAdvertiserScopedSupabaseContracts(auth).then(async (scopedContracts) => {
          if (scopedContracts) return scopedContracts;
          const store = await readStore();
          return store.contracts.filter((contract) =>
            canAdvertiserAccessLegacyContract(auth, contract),
          );
        }),
        buildAdvertiserScopedVerificationSummary(auth),
        includeMessageSummary
          ? readMarketplaceMessagesForAdvertiser(auth, { summaryOnly: true })
              .then((data) => data.summary)
              .catch((error) => {
                console.warn(
                  `[${productName}] advertiser message summary bootstrap failed: ${
                    error instanceof Error ? error.message : "unknown error"
                  }`,
                );
                return emptyMarketplaceMessageSummary();
              })
          : Promise.resolve(undefined),
      ]);

      const dashboard = {
        contracts,
        verification,
        ...(messageSummary ? { message_summary: messageSummary } : {}),
        source: useSupabase ? "supabase" : "file",
        allow_local_merge: !useSupabase,
        demo_mode: demoMode,
      } satisfies AdvertiserDashboardBootstrapPayload;
      rememberAdvertiserDashboardCache(auth, includeMessageSummary, dashboard);
      return cloneAdvertiserDashboardBootstrap(dashboard);
    })().finally(() => {
      advertiserDashboardInflight.delete(key);
    });
    if (useDashboardCache) advertiserDashboardInflight.set(key, dashboardPromise);
    return dashboardPromise;
  } catch (error) {
    console.warn(
      `[${productName}] advertiser login dashboard bootstrap failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return undefined;
  }
}

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

const supportTicketTable = "operational_support_tickets";
let supportTicketReadFallbackWarned = false;
let supportTicketWriteFallbackWarned = false;
const allowLocalSupportTicketStore = !useSupabase || demoMode;

const supportTicketCategories = new Set<OperationalSupportTicketCategory>([
  "service_error",
  "account_access",
  "contract_flow",
  "privacy_request",
  "other",
]);
const supportTicketRequesterRoles = new Set<OperationalSupportTicketRequesterRole>([
  "advertiser",
  "influencer",
  "operator",
  "other",
]);
const supportTicketSeverities = new Set<OperationalSupportTicketSeverity>([
  "low",
  "normal",
  "high",
  "urgent",
]);
const supportTicketStatuses = new Set<OperationalSupportTicketStatus>([
  "open",
  "reviewing",
  "resolved",
  "closed",
]);

const sanitizeSupportContextUrl = (value: unknown) => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return undefined;

  try {
    const parsed = normalized.startsWith("/")
      ? new URL(normalized, "https://yeollock.me")
      : new URL(normalized);
    return parsed.origin === "https://yeollock.me"
      ? parsed.pathname
      : `${parsed.origin}${parsed.pathname}`.slice(0, 500);
  } catch {
    return normalized.startsWith("/") ? normalized.split("?")[0]?.slice(0, 500) : undefined;
  }
};

const normalizeSupportTicketContractId = (value: unknown) => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return undefined;
  const cleaned = normalized.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return cleaned || undefined;
};

const normalizeSupportBrowserContext = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const context: Record<string, unknown> = {};

  for (const key of ["viewport", "devicePixelRatio", "timezone", "language"]) {
    const item = source[key];
    if (typeof item === "string") context[key] = item.slice(0, 120);
    if (typeof item === "number" && Number.isFinite(item)) context[key] = item;
  }

  return context;
};

const createMissingSupportTicketStoreError = () =>
  new Error(
    "Supabase operational_support_tickets table is required when Supabase storage is enabled.",
  );

const isMissingSupabaseSupportTicketTableError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("operational_support_tickets") ||
    error.message.includes("schema cache") ||
    error.message.includes("Could not find the table") ||
    error.message.includes("relation")) &&
  (error.message.includes("404") ||
    error.message.includes("400") ||
    error.message.includes("PGRST205") ||
    error.message.includes("does not exist") ||
    error.message.includes("schema cache"));

const normalizeSupportTicket = (
  row: OperationalSupportTicketRecord,
): OperationalSupportTicketRecord => ({
  id: row.id,
  category: supportTicketCategories.has(row.category) ? row.category : "other",
  requester_role: supportTicketRequesterRoles.has(row.requester_role)
    ? row.requester_role
    : "other",
  requester_name: row.requester_name ?? undefined,
  requester_email: row.requester_email,
  subject: row.subject,
  message: row.message,
  context_url: row.context_url ?? undefined,
  contract_id: row.contract_id ?? undefined,
  contract_title: row.contract_title ?? undefined,
  page_path: row.page_path ?? undefined,
  browser_context:
    row.browser_context && typeof row.browser_context === "object"
      ? row.browser_context
      : {},
  severity: supportTicketSeverities.has(row.severity) ? row.severity : "normal",
  status: supportTicketStatuses.has(row.status) ? row.status : "open",
  admin_note: row.admin_note ?? undefined,
  source: row.source ?? "support_page",
  ip_hash: row.ip_hash ?? undefined,
  user_agent: row.user_agent ?? undefined,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const readSupportTicketsFromFile = async () => {
  try {
    const contents = await fs.readFile(supportTicketDataFile, "utf8");
    const parsed = JSON.parse(contents) as OperationalSupportTicketStoreFile;

    if (!Array.isArray(parsed.support_tickets)) {
      throw new Error("Invalid support ticket store");
    }

    return parsed.support_tickets.map(normalizeSupportTicket);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      console.warn(`[yeollock.me] resetting invalid support ticket store: ${code}`);
    }
    return [];
  }
};

const writeSupportTicketsToFile = async (
  records: OperationalSupportTicketRecord[],
) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${supportTicketDataFile}.tmp`;
  await fs.writeFile(
    tempFile,
    JSON.stringify({ support_tickets: records }, null, 2),
    "utf8",
  );
  await fs.rename(tempFile, supportTicketDataFile);
};

const readSupportTickets = async () => {
  if (useSupabase) {
    try {
      const rows = await readSupabaseRows<OperationalSupportTicketRecord>(
        supportTicketTable,
        "?select=*&order=created_at.desc",
        "operational support tickets",
      );
      return rows.map(normalizeSupportTicket);
    } catch (error) {
      if (!isMissingSupabaseSupportTicketTableError(error)) {
        throw error;
      }
      if (!allowLocalSupportTicketStore) {
        throw createMissingSupportTicketStoreError();
      }
      if (!supportTicketReadFallbackWarned) {
        console.warn(
          "[yeollock.me] operational_support_tickets table is not available; using local support ticket store.",
        );
        supportTicketReadFallbackWarned = true;
      }
    }
  }

  return readSupportTicketsFromFile();
};

const insertSupportTicket = async (
  record: OperationalSupportTicketRecord,
) => {
  if (useSupabase) {
    try {
      const [inserted] =
        await insertSupabaseRowsReturning<OperationalSupportTicketRecord>(
          supportTicketTable,
          [record as unknown as Record<string, unknown>],
          "operational support ticket",
        );
      if (inserted) return normalizeSupportTicket(inserted);
    } catch (error) {
      if (!isMissingSupabaseSupportTicketTableError(error)) {
        throw error;
      }
      if (!allowLocalSupportTicketStore) {
        throw createMissingSupportTicketStoreError();
      }
      if (!supportTicketWriteFallbackWarned) {
        console.warn(
          "[yeollock.me] operational_support_tickets table is not available; writing support tickets locally.",
        );
        supportTicketWriteFallbackWarned = true;
      }
    }
  }

  const current = await readSupportTicketsFromFile();
  const next = [record, ...current.filter((item) => item.id !== record.id)];
  await writeSupportTicketsToFile(next);
  return record;
};

const updateSupportTicket = async (
  record: OperationalSupportTicketRecord,
) => {
  const updatedRecord = {
    ...record,
    updated_at: new Date().toISOString(),
  };

  if (useSupabase) {
    try {
      const response = await fetchSupabase(
        supportTicketTable,
        `?id=eq.${encodeURIComponent(record.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(updatedRecord),
        },
      );
      await assertSupabaseOk(response, "Supabase operational support ticket update");
      const [updated] =
        (await response.json()) as OperationalSupportTicketRecord[];
      if (updated) return normalizeSupportTicket(updated);
    } catch (error) {
      if (!isMissingSupabaseSupportTicketTableError(error)) {
        throw error;
      }
      if (!allowLocalSupportTicketStore) {
        throw createMissingSupportTicketStoreError();
      }
    }
  }

  const current = await readSupportTicketsFromFile();
  const next = current.map((item) =>
    item.id === updatedRecord.id ? updatedRecord : item,
  );
  await writeSupportTicketsToFile(next);
  return updatedRecord;
};

const operationalAlertTable = "operational_alert_events";
let operationalAlertReadFallbackWarned = false;
let operationalAlertWriteFallbackWarned = false;
const allowLocalOperationalAlertStore = !useSupabase || demoMode;

const operationalAlertKinds = new Set<OperationalAlertKind>([
  "verification_request",
  "support_ticket",
  "support_access",
]);
const operationalAlertActions = new Set<OperationalAlertAction>([
  "auto_approved",
  "needs_review",
  "mobile_action",
]);
const operationalAlertSeverities = new Set<OperationalAlertSeverity>([
  "info",
  "normal",
  "high",
  "urgent",
]);
const operationalAlertStatuses = new Set<OperationalAlertStatus>([
  "queued",
  "sent",
  "failed",
  "muted",
]);

const createMissingOperationalAlertStoreError = () =>
  new Error(
    "Supabase operational_alert_events table is required when Supabase storage is enabled.",
  );

const isMissingSupabaseOperationalAlertTableError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("operational_alert_events") ||
    error.message.includes("schema cache") ||
    error.message.includes("Could not find the table") ||
    error.message.includes("relation")) &&
  (error.message.includes("404") ||
    error.message.includes("400") ||
    error.message.includes("PGRST205") ||
    error.message.includes("does not exist") ||
    error.message.includes("schema cache"));

const isDuplicateOperationalAlertError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("duplicate key") ||
    error.message.includes("23505") ||
    error.message.includes("409"));

const normalizeOperationalAlert = (
  row: OperationalAlertRecord,
): OperationalAlertRecord => ({
  id: row.id,
  kind: operationalAlertKinds.has(row.kind) ? row.kind : "support_ticket",
  action: operationalAlertActions.has(row.action) ? row.action : "needs_review",
  severity: operationalAlertSeverities.has(row.severity) ? row.severity : "normal",
  status: operationalAlertStatuses.has(row.status) ? row.status : "queued",
  subject_type: row.subject_type,
  subject_id: row.subject_id,
  title: row.title,
  body: row.body,
  mobile_path: row.mobile_path,
  dashboard_path: row.dashboard_path ?? undefined,
  dedupe_key: row.dedupe_key,
  decision_reason: row.decision_reason ?? undefined,
  metadata_json:
    row.metadata_json && typeof row.metadata_json === "object"
      ? row.metadata_json
      : {},
  sent_at: row.sent_at ?? undefined,
  error_message: row.error_message ?? undefined,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const readOperationalAlertsFromFile = async () => {
  try {
    const contents = await fs.readFile(operationalAlertDataFile, "utf8");
    const parsed = JSON.parse(contents) as OperationalAlertStoreFile;

    if (!Array.isArray(parsed.operational_alerts)) {
      throw new Error("Invalid operational alert store");
    }

    return parsed.operational_alerts.map(normalizeOperationalAlert);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      console.warn(`[yeollock.me] resetting invalid operational alert store: ${code}`);
    }
    return [];
  }
};

const writeOperationalAlertsToFile = async (
  records: OperationalAlertRecord[],
) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = `${operationalAlertDataFile}.tmp`;
  await fs.writeFile(
    tempFile,
    JSON.stringify({ operational_alerts: records }, null, 2),
    "utf8",
  );
  await fs.rename(tempFile, operationalAlertDataFile);
};

const readOperationalAlerts = async () => {
  if (useSupabase) {
    try {
      const rows = await readSupabaseRows<OperationalAlertRecord>(
        operationalAlertTable,
        "?select=*&order=created_at.desc&limit=100",
        "operational alert events",
      );
      return rows.map(normalizeOperationalAlert);
    } catch (error) {
      if (!isMissingSupabaseOperationalAlertTableError(error)) {
        throw error;
      }
      if (!allowLocalOperationalAlertStore) {
        throw createMissingOperationalAlertStoreError();
      }
      if (!operationalAlertReadFallbackWarned) {
        console.warn(
          "[yeollock.me] operational_alert_events table is not available; using local operational alert store.",
        );
        operationalAlertReadFallbackWarned = true;
      }
    }
  }

  return readOperationalAlertsFromFile();
};

const readOperationalAlertByDedupeKey = async (dedupeKey: string) => {
  if (useSupabase) {
    try {
      const rows = await readSupabaseRows<OperationalAlertRecord>(
        operationalAlertTable,
        `?select=*&dedupe_key=eq.${encodeURIComponent(dedupeKey)}&limit=1`,
        "operational alert event",
      );
      return rows[0] ? normalizeOperationalAlert(rows[0]) : undefined;
    } catch (error) {
      if (!isMissingSupabaseOperationalAlertTableError(error)) {
        throw error;
      }
      if (!allowLocalOperationalAlertStore) {
        throw createMissingOperationalAlertStoreError();
      }
    }
  }

  const current = await readOperationalAlertsFromFile();
  return current.find((item) => item.dedupe_key === dedupeKey);
};

const insertOperationalAlert = async (
  record: OperationalAlertRecord,
) => {
  const normalizedRecord = normalizeOperationalAlert(record);

  if (useSupabase) {
    try {
      const [inserted] = await insertSupabaseRowsReturning<OperationalAlertRecord>(
        operationalAlertTable,
        [normalizedRecord as unknown as Record<string, unknown>],
        "operational alert event",
      );
      if (inserted) return normalizeOperationalAlert(inserted);
    } catch (error) {
      if (isDuplicateOperationalAlertError(error)) {
        const existing = await readOperationalAlertByDedupeKey(
          normalizedRecord.dedupe_key,
        );
        if (existing) return existing;
        throw error;
      }
      if (!isMissingSupabaseOperationalAlertTableError(error)) {
        throw error;
      }
      if (!allowLocalOperationalAlertStore) {
        throw createMissingOperationalAlertStoreError();
      }
      if (!operationalAlertWriteFallbackWarned) {
        console.warn(
          "[yeollock.me] operational_alert_events table is not available; writing operational alerts locally.",
        );
        operationalAlertWriteFallbackWarned = true;
      }
    }
  }

  const current = await readOperationalAlertsFromFile();
  const existing = current.find((item) => item.dedupe_key === normalizedRecord.dedupe_key);
  if (existing) return existing;
  const next = [normalizedRecord, ...current.filter((item) => item.id !== normalizedRecord.id)];
  await writeOperationalAlertsToFile(next);
  return normalizedRecord;
};

const updateOperationalAlert = async (
  record: OperationalAlertRecord,
  updates: Partial<OperationalAlertRecord>,
) => {
  const updatedRecord = normalizeOperationalAlert({
    ...record,
    ...updates,
    updated_at: updates.updated_at ?? new Date().toISOString(),
  });

  if (useSupabase) {
    try {
      const updatePayload = {
        ...updatedRecord,
        ...(Object.prototype.hasOwnProperty.call(updates, "error_message")
          ? { error_message: updates.error_message ?? null }
          : {}),
      };
      const response = await fetchSupabase(
        operationalAlertTable,
        `?id=eq.${encodeURIComponent(record.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(updatePayload),
        },
      );
      await assertSupabaseOk(response, "Supabase operational alert update");
      const [updated] = (await response.json()) as OperationalAlertRecord[];
      if (updated) return normalizeOperationalAlert(updated);
    } catch (error) {
      if (!isMissingSupabaseOperationalAlertTableError(error)) {
        throw error;
      }
      if (!allowLocalOperationalAlertStore) {
        throw createMissingOperationalAlertStoreError();
      }
    }
  }

  const current = await readOperationalAlertsFromFile();
  const next = current.map((item) =>
    item.id === updatedRecord.id ? updatedRecord : item,
  );
  await writeOperationalAlertsToFile(next);
  return updatedRecord;
};

const buildOperationalAlertUrl = (mobilePath: string) => {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  const baseUrl = configured || (isProductionRuntime ? "https://yeollock.me" : `http://localhost:${port}`);
  return new URL(mobilePath, `${baseUrl}/`).toString();
};

const operationalAlertSeverityLabel = (severity: OperationalAlertSeverity) => {
  const labels: Record<OperationalAlertSeverity, string> = {
    info: "자동 처리",
    normal: "운영 확인",
    high: "확인 필요",
    urgent: "긴급 확인",
  };

  return labels[severity];
};

const operationalAlertDiscordColor = (severity: OperationalAlertSeverity) => {
  const colors: Record<OperationalAlertSeverity, number> = {
    info: 0x2563eb,
    normal: 0x171717,
    high: 0xf59e0b,
    urgent: 0xdc2626,
  };

  return colors[severity];
};

const hasDiscordOperationsTarget = () =>
  Boolean(
    discordOperationsWebhookUrl ||
      (discordOperationsBotToken && discordOperationsChannelId),
  );

const buildDiscordOperationalAlertPayload = (alert: OperationalAlertRecord) => {
  const mobileUrl = buildOperationalAlertUrl(alert.mobile_path);
  return {
    username: `${productName} 운영`,
    content: `${operationalAlertSeverityLabel(alert.severity)} · ${alert.title}`,
    embeds: [
      {
        title: alert.title,
        description: `${alert.body}\n\n[모바일 운영 상세](${mobileUrl})`,
        color: operationalAlertDiscordColor(alert.severity),
        fields: [
          {
            name: "상태",
            value: operationalAlertSeverityLabel(alert.severity),
            inline: true,
          },
          {
            name: "항목",
            value: alert.subject_type,
            inline: true,
          },
        ],
        timestamp: alert.created_at,
      },
    ],
    allowed_mentions: { parse: [] },
  };
};

const sendDiscordOperationalAlert = async (alert: OperationalAlertRecord) => {
  const payload = buildDiscordOperationalAlertPayload(alert);

  if (discordOperationsWebhookUrl) {
    if (!isSafeHttpUrl(discordOperationsWebhookUrl)) {
      throw new Error("DISCORD_OPERATIONS_WEBHOOK_URL must be an https URL");
    }

    const response = await fetch(discordOperationsWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": discordOperationsUserAgent,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed (${response.status})`);
    }
  } else if (discordOperationsBotToken && discordOperationsChannelId) {
    if (!/^\d+$/.test(discordOperationsChannelId)) {
      throw new Error("DISCORD_OPERATIONS_CHANNEL_ID must be a Discord channel id");
    }

    const { username: _username, ...messagePayload } = payload;
    const response = await fetch(
      `https://discord.com/api/v10/channels/${discordOperationsChannelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${discordOperationsBotToken}`,
          "Content-Type": "application/json",
          "User-Agent": discordOperationsUserAgent,
        },
        body: JSON.stringify(messagePayload),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      throw new Error(`Discord bot message failed (${response.status})`);
    }
  } else {
    return alert;
  }

  return updateOperationalAlert(alert, {
    status: "sent",
    sent_at: new Date().toISOString(),
    error_message: null,
  });
};

const dispatchOperationalAlert = async (alert: OperationalAlertRecord) => {
  if (alert.status === "sent" || alert.status === "muted") return alert;
  if (!hasDiscordOperationsTarget()) return alert;

  try {
    return await sendDiscordOperationalAlert(alert);
  } catch (error) {
    return updateOperationalAlert(alert, {
      status: "failed",
      error_message:
        error instanceof Error ? error.message.slice(0, 500) : "Discord alert failed",
    });
  }
};

const enqueueOperationalAlert = async (
  input: Omit<OperationalAlertRecord, "id" | "status" | "created_at" | "updated_at">,
) => {
  const now = new Date().toISOString();
  const existing = await readOperationalAlertByDedupeKey(input.dedupe_key);
  const alert =
    existing ??
    (await insertOperationalAlert({
      id: randomUUID(),
      status: "queued",
      created_at: now,
      updated_at: now,
      ...input,
    }));
  return dispatchOperationalAlert(alert);
};

const supportTicketSeverityToAlertSeverity = (
  severity: OperationalSupportTicketSeverity,
): OperationalAlertSeverity => {
  if (severity === "urgent") return "urgent";
  if (severity === "high") return "high";
  return "normal";
};

const verificationAlertSubjectType = (record: VerificationRequestRecord) =>
  record.target_type === "advertiser_organization"
    ? "광고주 사업자 인증"
    : "인플루언서 계정 인증";

const enqueueVerificationOperationalAlert = async (
  record: VerificationRequestRecord,
) => {
  if (isOperationalTestVerificationRequest(record)) return undefined;

  const isAutomationApproval =
    record.status === "approved" &&
    normalizeRequiredText(record.reviewed_by_name).includes("automation");
  const needsReview = record.status === "pending";

  if (!isAutomationApproval && !needsReview) return undefined;

  const action: OperationalAlertAction = isAutomationApproval
    ? "auto_approved"
    : "needs_review";
  const title = isAutomationApproval ? "인증 자동 승인" : "인증 확인 필요";
  const body = `${verificationAlertSubjectType(record)} · ${record.subject_name}`;

  return enqueueOperationalAlert({
    kind: "verification_request",
    action,
    severity: isAutomationApproval ? "info" : "high",
    subject_type: verificationAlertSubjectType(record),
    subject_id: record.id,
    title,
    body,
    mobile_path: `/admin/mobile?item=verification:${encodeURIComponent(record.id)}`,
    dashboard_path: "/admin",
    dedupe_key: `verification_request:${record.id}:${action}`,
    decision_reason: record.reviewer_note,
    metadata_json: {
      target_type: record.target_type,
      verification_type: record.verification_type,
      status: record.status,
    },
  });
};

const enqueueSupportTicketOperationalAlert = async (
  ticket: OperationalSupportTicketRecord,
) => {
  if (isOperationalTestSupportTicket(ticket)) return undefined;
  if (ticket.status !== "open" && ticket.status !== "reviewing") return undefined;

  return enqueueOperationalAlert({
    kind: "support_ticket",
    action: "needs_review",
    severity: supportTicketSeverityToAlertSeverity(ticket.severity),
    subject_type: "고객 문의",
    subject_id: ticket.id,
    title: "고객 문의 접수",
    body: `${supportTicketCategoryLabelForAlert(ticket.category)} · ${supportTicketSeverityLabelForAlert(ticket.severity)} · ${ticket.subject.slice(0, 80)}`,
    mobile_path: `/admin/mobile?item=support_ticket:${encodeURIComponent(ticket.id)}`,
    dashboard_path: "/admin",
    dedupe_key: `support_ticket:${ticket.id}:active`,
    decision_reason: ticket.admin_note,
    metadata_json: {
      category: ticket.category,
      status: ticket.status,
      severity: ticket.severity,
      contract_id: ticket.contract_id,
    },
  });
};

const enqueueSupportAccessOperationalAlert = async (
  requestRecord: SupportAccessRequestRecord,
) => {
  if (isOperationalTestSupportAccessRequest(requestRecord)) return undefined;
  if (!isSupportAccessActive(requestRecord)) return undefined;

  return enqueueOperationalAlert({
    kind: "support_access",
    action: "needs_review",
    severity: "normal",
    subject_type: "지원 열람",
    subject_id: requestRecord.id,
    title: "지원 열람 요청",
    body: `${requesterRoleLabelForAlert(requestRecord.requester_role)} · 계약 ${requestRecord.contract_id.slice(0, 12)}`,
    mobile_path: `/admin/mobile?item=support_access:${encodeURIComponent(requestRecord.id)}`,
    dashboard_path: "/admin",
    dedupe_key: `support_access:${requestRecord.id}:active`,
    decision_reason: requestRecord.reason.slice(0, 300),
    metadata_json: {
      contract_id: requestRecord.contract_id,
      requester_role: requestRecord.requester_role,
      scope: requestRecord.scope,
      status: requestRecord.status,
    },
  });
};

const supportTicketCategoryLabelForAlert = (
  category: OperationalSupportTicketCategory,
) => {
  const labels: Record<OperationalSupportTicketCategory, string> = {
    service_error: "장애",
    account_access: "계정",
    contract_flow: "계약",
    privacy_request: "개인정보",
    other: "기타",
  };

  return labels[category];
};

const supportTicketSeverityLabelForAlert = (
  severity: OperationalSupportTicketSeverity,
) => {
  const labels: Record<OperationalSupportTicketSeverity, string> = {
    low: "낮음",
    normal: "보통",
    high: "높음",
    urgent: "긴급",
  };

  return labels[severity];
};

const requesterRoleLabelForAlert = (
  role: SupportAccessRequestRecord["requester_role"],
) => (role === "advertiser" ? "광고주" : "인플루언서");

const dispatchQueuedOperationalAlerts = async (limit = 20) => {
  const alerts = (await readOperationalAlerts())
    .filter((alert) => alert.status === "queued" || alert.status === "failed")
    .sort((a, b) => parseDateAscending(a.created_at, b.created_at))
    .slice(0, limit);

  let sentCount = 0;
  let failedCount = 0;

  for (const alert of alerts) {
    const updated = await dispatchOperationalAlert(alert);
    if (updated.status === "sent") sentCount += 1;
    if (updated.status === "failed") failedCount += 1;
  }

  return {
    attempted_count: alerts.length,
    sent_count: sentCount,
    failed_count: failedCount,
    discord_configured: hasDiscordOperationsTarget(),
  };
};

const runOperationalAlertSweep = async () => {
  const [verificationRequests, supportTickets, supportAccessRequests] =
    await Promise.all([
      readOperationalAdminVerificationRequests(),
      readOperationalAdminSupportTickets(),
      readOperationalAdminSupportAccessRequests(),
    ]);

  for (const record of verificationRequests) {
    if (record.status === "pending" || record.status === "approved") {
      await enqueueVerificationOperationalAlert(record);
    }
  }
  for (const ticket of supportTickets) {
    await enqueueSupportTicketOperationalAlert(ticket);
  }
  for (const requestRecord of supportAccessRequests) {
    await enqueueSupportAccessOperationalAlert(requestRecord);
  }

  const dispatch = await dispatchQueuedOperationalAlerts();

  return {
    verification_count: verificationRequests.length,
    support_ticket_count: supportTickets.length,
    support_access_count: supportAccessRequests.length,
    dispatch,
  };
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

type UserFastSessionPayload = {
  v: 1;
  role: "marketer" | "influencer";
  exp: number;
  user: SupabaseAuthUser;
  profile: SupabaseProfileRow;
};

const userFastSessionHmac = (payload: string) => {
  if (!userSessionFastPathSecret) return "";
  return createHmac("sha256", userSessionFastPathSecret)
    .update(payload)
    .digest("hex");
};

const createUserFastSessionToken = (
  user: SupabaseAuthUser,
  profile: SupabaseProfileRow,
  role: UserFastSessionPayload["role"],
) => {
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
    } satisfies UserFastSessionPayload),
    "utf8",
  ).toString("base64url");
  const signature = userFastSessionHmac(payload);
  return `${payload}.${signature}`;
};

const verifyUserFastSessionToken = (
  token: string | undefined,
  expectedRole: UserFastSessionPayload["role"],
) => {
  if (!token || !userSessionFastPathSecret) return undefined;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return undefined;
  if (!safeEqual(signature, userFastSessionHmac(payload))) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<UserFastSessionPayload>;

    if (parsed.v !== 1 || parsed.role !== expectedRole) return undefined;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
      return undefined;
    }
    if (!parsed.user?.id || !parsed.profile?.id) return undefined;
    if (parsed.user.id !== parsed.profile.id) return undefined;
    if (parsed.profile.role !== expectedRole) return undefined;

    return parsed as UserFastSessionPayload;
  } catch {
    return undefined;
  }
};

const shouldUseUserFastSession = (
  request: express.Request,
  bearerToken: string | undefined,
) => !bearerToken && (request.method === "GET" || request.method === "HEAD");

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
  profile?: SupabaseProfileRow,
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

  if (profile && isAdvertiserRole(profile.role)) {
    const fastToken = createUserFastSessionToken(session.user, profile, "marketer");
    if (fastToken) {
      cookies.push(
        `${advertiserFastSessionCookie}=${encodeURIComponent(
          fastToken,
        )}; ${advertiserCookieOptions(userFastSessionMaxAgeSeconds)}`,
      );
    }
  }

  response.setHeader("Set-Cookie", cookies);
};

const clearAdvertiserSessionCookies = (response: express.Response) => {
  response.setHeader("Set-Cookie", [
    `${advertiserAccessCookie}=; ${clearAdvertiserCookieOptions()}`,
    `${advertiserRefreshCookie}=; ${clearAdvertiserCookieOptions()}`,
    `${advertiserFastSessionCookie}=; ${clearAdvertiserCookieOptions()}`,
    `${signedPdfAccessCookie}=; ${signedPdfCookieOptions(0)}`,
  ]);
};

const setInfluencerSessionCookies = (
  response: express.Response,
  session: SupabaseAuthSession,
  profile?: SupabaseProfileRow,
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

  if (profile && isInfluencerRole(profile.role)) {
    const fastToken = createUserFastSessionToken(session.user, profile, "influencer");
    if (fastToken) {
      cookies.push(
        `${influencerFastSessionCookie}=${encodeURIComponent(
          fastToken,
        )}; ${influencerCookieOptions(userFastSessionMaxAgeSeconds)}`,
      );
    }
  }

  response.setHeader("Set-Cookie", cookies);
};

const clearInfluencerSessionCookies = (response: express.Response) => {
  response.setHeader("Set-Cookie", [
    `${influencerAccessCookie}=; ${clearInfluencerCookieOptions()}`,
    `${influencerRefreshCookie}=; ${clearInfluencerCookieOptions()}`,
    `${influencerFastSessionCookie}=; ${clearInfluencerCookieOptions()}`,
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

const requireCronRequest = (
  request: express.Request,
  response: express.Response,
) => {
  if (!cronSecret) {
    response.status(503).json({ error: "CRON_SECRET is not configured" });
    return false;
  }

  const token = getBearerToken(request);
  if (!token || !safeEqual(token, cronSecret)) {
    response.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
};

const fetchSupabaseAuthUser = async (accessToken: string) => {
  const response = await fetch(supabaseAuthUrl("/user"), {
    headers: supabaseAuthHeaders(accessToken),
    signal: createSupabaseTimeoutSignal(),
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
      signal: createSupabaseTimeoutSignal(),
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

const requestSupabasePasswordRecovery = async ({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo: string;
}) => {
  const url = new URL(supabaseAuthUrl("/recover"));
  url.searchParams.set("redirect_to", redirectTo);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: supabaseAuthHeaders(),
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }
};

const updateSupabasePasswordWithRecoveryToken = async ({
  accessToken,
  password,
}: {
  accessToken: string;
  password: string;
}) => {
  const response = await fetch(supabaseAuthUrl("/user"), {
    method: "PUT",
    headers: supabaseAuthHeaders(accessToken),
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error(await parseSupabaseError(response));
  }
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
    forgetProfile(readRecentAuthSession(accessToken)?.id);
    forgetRecentAuthSession(accessToken);
    await revokeSupabaseSession(accessToken);
    return;
  }

  if (hasText(refreshToken)) {
    const session = await refreshSupabaseSession(refreshToken);
    forgetProfile(session.user.id);
    forgetRecentAuthSession(session.access_token);
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
  const fastSessionToken = cookies.get(influencerFastSessionCookie);
  const accessToken = bearerToken ?? cookieAccessToken;

  if (shouldUseUserFastSession(request, bearerToken)) {
    const fastSession = verifyUserFastSessionToken(
      fastSessionToken,
      "influencer",
    );
    if (fastSession) {
      rememberProfile(fastSession.profile);
      return {
        user: fastSession.user,
        accessToken: accessToken ?? "",
        profile: fastSession.profile,
        fastSession: true,
      };
    }
  }

  if (accessToken) {
    const cachedUser = readRecentAuthSession(accessToken);
    if (cachedUser) {
      return { user: cachedUser, accessToken };
    }

    try {
      const user = await fetchSupabaseAuthUser(accessToken);
      rememberRecentAuthSession(accessToken, user);
      return {
        user,
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
      rememberRecentAuthSession(session.access_token, session.user);
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
  const fastSessionToken = cookies.get(advertiserFastSessionCookie);
  const accessToken = bearerToken ?? cookieAccessToken;

  if (shouldUseUserFastSession(request, bearerToken)) {
    const fastSession = verifyUserFastSessionToken(fastSessionToken, "marketer");
    if (fastSession) {
      rememberProfile(fastSession.profile);
      return {
        user: fastSession.user,
        accessToken: accessToken ?? "",
        profile: fastSession.profile,
        fastSession: true,
      };
    }
  }

  if (accessToken) {
    const cachedUser = readRecentAuthSession(accessToken);
    if (cachedUser) {
      return { user: cachedUser, accessToken };
    }

    try {
      const user = await fetchSupabaseAuthUser(accessToken);
      rememberRecentAuthSession(accessToken, user);
      return {
        user,
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
      rememberRecentAuthSession(session.access_token, session.user);
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

const operationalTestEmailLocals = new Set([
  "breadroom.manager",
  "test.influencer",
  "creator.sora",
  "breadroom",
  "breadroom-partner",
  "obre-beauty",
  "housefit",
  "brewinglab",
  "nightcare",
  "minseo.home",
  "today.taste",
  "haru.fit",
  "ziyu.log",
  "luna.day",
  "yuna.beauty",
  "review.j",
  "only.routine",
  "harin.log",
  "moa.review",
  "sua.pick",
  "raon.beauty",
  "jian.home",
  "serin.daily",
  "narae.shorts",
  "romi.review",
  "sodam.pick",
]);

const operationalTestTextPattern =
  /\b(?:qa|test|demo|seed|showcase|dummy)\b|테스트|데모|시드|쇼케이스/i;

const normalizeOperationalTestText = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const operationalTestSeedTextValues = new Set(
  [
    "광고주 매니저",
    "브레드룸",
    "브래드룸",
    "breadroom",
    "breadroom-partner",
    "오브레",
    "obre",
    "하우스핏",
    "housefit",
    "브루잉랩",
    "brewinglab",
    "나이트케어",
    "nightcare",
    "크리에이터 소라",
    "creator-sora",
    "creator.sora",
    "creator_sora",
    "민서홈",
    "minseo-home",
    "minseo.home",
    "오늘의취향",
    "today-taste",
    "today.taste",
    "하루핏",
    "haru-fit",
    "haru.fit",
    "지유로그",
    "ziyu-log",
    "ziyu.log",
    "루나데이",
    "luna-day",
    "luna.day",
    "유나뷰티",
    "yuna-beauty",
    "yuna.beauty",
    "리뷰제이",
    "review-j",
    "review.j",
    "온리루틴",
    "only-routine",
    "only.routine",
    "하린로그",
    "harin-log",
    "harin.log",
    "모아리뷰",
    "moa-review",
    "moa.review",
    "수아픽",
    "sua-pick",
    "sua.pick",
    "라온뷰티",
    "raon-beauty",
    "raon.beauty",
    "지안홈",
    "jian-home",
    "jian.home",
    "세린데일리",
    "serin-daily",
    "serin.daily",
    "나래숏폼",
    "narae-shorts",
    "narae.shorts",
    "로미리뷰",
    "romi-review",
    "romi.review",
    "소담픽",
    "sodam-pick",
    "sodam.pick",
    "선정 크리에이터 계약",
    "완료 보관 캠페인",
    "브레드룸 여름 루틴",
    "브레드룸 신제품 언박싱",
    "파우치 필수템 쇼츠",
    "데일리 루틴 블로그",
    "성수 팝업",
    "나이트 케어 쇼츠",
    "공동구매 파일럿",
    "오브레 릴스",
    "브루잉랩 공동구매",
  ].map(normalizeOperationalTestText),
);

const hasOperationalTestText = (value: unknown) => {
  if (!hasText(value)) return false;
  const normalized = normalizeOperationalTestText(value);
  return (
    operationalTestTextPattern.test(normalized) ||
    [...operationalTestSeedTextValues].some((marker) =>
      normalized.includes(marker),
    )
  );
};

const extractEmails = (value: unknown) =>
  hasText(value)
    ? (value.match(/[^\s<>()"']+@[^\s<>()"']+\.[^\s<>()"']+/g) ?? [])
    : [];

const isOperationalTestEmail = (value: unknown) => {
  const email = normalizeEmail(value);
  if (!email.includes("@")) return false;

  const [local = "", domain = ""] = email.split("@");
  if (
    domain === "directsign.app" ||
    domain === "example.com" ||
    domain === "example.net" ||
    domain === "example.org" ||
    domain.endsWith(".test") ||
    domain === "test"
  ) {
    return true;
  }

  if (
    /^(qa|test|demo|seed)[._-]/i.test(local) ||
    /[._-](qa|test|demo|seed)([._-]|$)/i.test(local)
  ) {
    return true;
  }

  return domain === "yeollock.me" && operationalTestEmailLocals.has(local);
};

const hasOperationalTestEmail = (values: unknown[]) =>
  values.some((value) => extractEmails(value).some(isOperationalTestEmail));

const hasOperationalTestMarker = (value: unknown, depth = 0): boolean => {
  if (!value || depth > 4) return false;

  if (typeof value === "string") {
    return hasOperationalTestEmail([value]) || hasOperationalTestText(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasOperationalTestMarker(item, depth + 1));
  }

  if (typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
    if (
      (key === "seeded" || key === "is_test" || key === "test_data") &&
      item === true
    ) {
      return true;
    }

    if (
      (key === "source" ||
        key === "configured_by" ||
        key === "user_agent" ||
        key === "note") &&
      hasText(item) &&
      operationalTestTextPattern.test(item)
    ) {
      return true;
    }

    return hasOperationalTestMarker(item, depth + 1);
  });
};

const isOperationalTestContractId = (value: unknown) =>
  hasText(value) && /^(demo-contract|qa-|test-|seed-)/i.test(value.trim());

const isOperationalTestContract = (contract: Contract) =>
  isOperationalTestContractId(contract.id) ||
  hasOperationalTestEmail([
    contract.advertiser_info?.name,
    contract.advertiser_info?.manager,
    contract.influencer_info?.name,
    contract.influencer_info?.contact,
    contract.signature_data?.signer_email,
  ]) ||
  hasOperationalTestMarker({
    title: contract.title,
    campaign_name: contract.campaign_name,
    post_link: contract.post_link,
    advertiser_id: contract.advertiser_id,
    advertiser_info: contract.advertiser_info,
    influencer_info: contract.influencer_info,
    campaign: contract.campaign,
    workflow: contract.workflow,
    settlement: contract.settlement,
    evidence: contract.evidence,
    signature_data: contract.signature_data,
    audit_events: contract.audit_events,
  });

const isOperationalTestSupportAccessRequest = (
  request: SupportAccessRequestRecord,
) =>
  isOperationalTestContractId(request.contract_id) ||
  hasOperationalTestEmail([request.requester_name, request.requester_email]) ||
  hasOperationalTestMarker({
    requester_name: request.requester_name,
    reason: request.reason,
    reviewed_by_name: request.reviewed_by_name,
    audit_events: request.audit_events,
  });

const isOperationalTestSupportTicket = (ticket: OperationalSupportTicketRecord) =>
  isOperationalTestContractId(ticket.contract_id) ||
  hasOperationalTestEmail([ticket.requester_name, ticket.requester_email]) ||
  hasOperationalTestMarker({
    source: ticket.source,
    requester_name: ticket.requester_name,
    subject: ticket.subject,
    message: ticket.message,
    contract_title: ticket.contract_title,
    page_path: ticket.page_path,
    context_url: ticket.context_url,
    browser_context: ticket.browser_context,
  });

const isOperationalTestVerificationRequest = (
  request: VerificationRequestRecord,
) =>
  hasOperationalTestEmail([request.submitted_by_email]) ||
  hasOperationalTestMarker({
    evidence_snapshot_json: request.evidence_snapshot_json,
    subject_name: request.subject_name,
    platform_handle: request.platform_handle,
    platform_url: request.platform_url,
    ownership_challenge_url: request.ownership_challenge_url,
    note: request.note,
  });

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

type VerificationAutomationStatus =
  | "not_configured"
  | "matched"
  | "not_found"
  | "blocked"
  | "failed"
  | "invalid_input";

type VerificationAutomationMode =
  | "api_ready"
  | "public_challenge"
  | "manual_fallback"
  | "oauth_required"
  | "webhook_ready";

interface VerificationAutomationResult {
  provider: string;
  configured: boolean;
  mode: VerificationAutomationMode;
  status: VerificationAutomationStatus;
  checked_at: string;
  http_status?: number;
  result_hash?: string;
  message: string;
  next_action?: string;
  matched_fields?: string[];
  ownership_check?: {
    status: OwnershipCheckStatus;
    checked_at: string;
    http_status?: number;
    error?: string;
  };
  public_challenge?: {
    status: OwnershipCheckStatus;
    checked_at: string;
    http_status?: number;
    error?: string;
  };
  profile?: Record<string, unknown>;
  plan?: ReturnType<typeof buildVerificationAutomationPlan>;
}

const hasConfiguredEnv = (...names: string[]) =>
  names.some((name) => hasText(process.env[name]));

const buildVerificationAutomationPlan = (platform: InfluencerPlatform) => {
  const plans: Record<
    InfluencerPlatform,
    {
      provider: string;
      configured: boolean;
      mode: VerificationAutomationMode;
      registration_required: boolean;
      note: string;
      required_env: string[];
      fallback: string;
    }
  > = {
    youtube: {
      provider: "youtube_data_api",
      configured: hasConfiguredEnv("YOUTUBE_DATA_API_KEY"),
      mode: hasConfiguredEnv("YOUTUBE_DATA_API_KEY")
        ? "api_ready"
        : "public_challenge",
      registration_required: !hasConfiguredEnv("YOUTUBE_DATA_API_KEY"),
      required_env: ["YOUTUBE_DATA_API_KEY"],
      fallback: "public challenge code on the channel/proof URL",
      note: "YouTube Data API 또는 Google OAuth 등록 후 채널 소유 확인 자동화를 확장할 수 있습니다.",
    },
    naver_blog: {
      provider: "naver_search_api",
      configured: hasConfiguredEnv("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"),
      mode: hasConfiguredEnv("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET")
        ? "api_ready"
        : "public_challenge",
      registration_required: !hasConfiguredEnv("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"),
      required_env: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
      fallback: "public blog post/profile challenge code",
      note: "Naver 개발자 앱 등록 전에는 공개 URL의 인증 코드 확인으로 fallback합니다.",
    },
    instagram: {
      provider: "instagram_graph_api",
      configured: hasConfiguredEnv("META_GRAPH_ACCESS_TOKEN", "META_IG_USER_ID"),
      mode: hasConfiguredEnv("META_GRAPH_ACCESS_TOKEN", "META_IG_USER_ID")
        ? "api_ready"
        : hasConfiguredEnv("META_WEBHOOK_VERIFY_TOKEN")
          ? "webhook_ready"
          : "manual_fallback",
      registration_required: !hasConfiguredEnv("META_APP_ID", "META_APP_SECRET"),
      required_env: [
        "META_APP_ID",
        "META_APP_SECRET",
        "META_GRAPH_ACCESS_TOKEN",
        "META_IG_USER_ID",
      ],
      fallback: "profile bio/post challenge, screenshot, or inbound Instagram DM webhook",
      note: "Instagram Graph API는 Meta 앱 등록과 권한 심사가 필요하므로 현재는 코드/스크린샷 검수로 처리합니다.",
    },
    tiktok: {
      provider: "tiktok_login_kit",
      configured: hasConfiguredEnv("TIKTOK_ACCOUNT_ACCESS_TOKEN"),
      mode: hasConfiguredEnv("TIKTOK_ACCOUNT_ACCESS_TOKEN")
        ? "api_ready"
        : "oauth_required",
      registration_required: !hasConfiguredEnv("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"),
      required_env: [
        "TIKTOK_CLIENT_KEY",
        "TIKTOK_CLIENT_SECRET",
        "TIKTOK_ACCOUNT_ACCESS_TOKEN",
      ],
      fallback: "TikTok Login OAuth, public challenge code, or screenshot review",
      note: "TikTok Login Kit 등록 전에는 공개 URL 또는 스크린샷 검수로 처리합니다.",
    },
    other: {
      provider: "public_url_challenge",
      configured: false,
      mode: "public_challenge",
      registration_required: false,
      required_env: [],
      fallback: "public URL challenge or screenshot review",
      note: "공개 URL에 인증 코드를 넣는 방식으로 운영자 검수를 보조합니다.",
    },
  };

  return plans[platform];
};

const fetchJsonWithTimeout = async <T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6500,
): Promise<{ status: number; ok: boolean; payload: T; body: string }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiResponse = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const body = await apiResponse.text();
    let payload = {} as T;

    try {
      payload = body ? (JSON.parse(body) as T) : ({} as T);
    } catch {
      payload = {} as T;
    }

    return {
      status: apiResponse.status,
      ok: apiResponse.ok,
      payload,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchTextWithTimeout = async (
  url: string,
  init: RequestInit = {},
  timeoutMs = 6500,
): Promise<{ status: number; ok: boolean; body: string }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const apiResponse = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return {
      status: apiResponse.status,
      ok: apiResponse.ok,
      body: await apiResponse.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeDateCompact = (value: string | undefined) => {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return undefined;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return undefined;
  }
  return digits;
};

const normalizeHandleForComparison = (value: string | undefined) =>
  normalizeRequiredText(value)
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();

const extractNaverBlogId = (value: string | undefined) => {
  const raw = normalizeRequiredText(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === "blog.naver.com" || host === "m.blog.naver.com") {
      const queryBlogId = normalizeHandleForComparison(
        url.searchParams.get("blogId") ?? undefined,
      );
      if (queryBlogId) return queryBlogId;

      return normalizeHandleForComparison(url.pathname.split("/").filter(Boolean)[0]);
    }
  } catch {
    // Fall through to direct handle normalization.
  }

  return normalizeHandleForComparison(raw);
};

const stripHtmlTags = (value: string | undefined) =>
  normalizeRequiredText(value).replace(/<[^>]*>/g, " ");

const buildAutomationOwnershipStatus = (
  status: VerificationAutomationStatus,
): OwnershipCheckStatus => {
  if (status === "matched") return "matched";
  if (status === "not_found" || status === "invalid_input") return "not_found";
  if (status === "blocked" || status === "not_configured") return "blocked";
  return "failed";
};

const shouldAutoApproveBusinessVerification = (
  check: VerificationAutomationResult,
) =>
  process.env.VERIFICATION_AUTO_APPROVE_BUSINESS === "true" &&
  check.status === "matched" &&
  (check.profile?.validate_status === "matched" ||
    check.profile?.validate_status === undefined);

const shouldAutoApprovePlatformVerification = (
  check: VerificationAutomationResult,
) =>
  process.env.VERIFICATION_AUTO_APPROVE_PLATFORM === "true" &&
  check.status === "matched";

const runBusinessRegistrationAutomationCheck = async (
  businessRegistrationNumber: string,
  options: {
    businessStartDate?: string;
    representativeName?: string;
    subjectName?: string;
  } = {},
): Promise<VerificationAutomationResult> => {
  const checkedAt = new Date().toISOString();
  const normalizedNumber = normalizeBusinessRegistrationNumber(
    businessRegistrationNumber,
  );
  const serviceKey =
    process.env.NTS_BUSINESS_STATUS_API_KEY?.trim() ||
    process.env.NTS_BUSINESS_VALIDATE_API_KEY?.trim() ||
    "";
  const statusServiceKey =
    process.env.NTS_BUSINESS_STATUS_API_KEY?.trim() || serviceKey;
  const validateServiceKey =
    process.env.NTS_BUSINESS_VALIDATE_API_KEY?.trim() || serviceKey;
  const businessStartDate = normalizeDateCompact(options.businessStartDate);
  const representativeName = normalizeRequiredText(options.representativeName);
  const subjectName = normalizeRequiredText(options.subjectName);

  if (!isValidBusinessRegistrationNumber(normalizedNumber)) {
    return {
      provider: "nts_businessman",
      configured: Boolean(serviceKey),
      mode: serviceKey ? "api_ready" : "manual_fallback",
      status: "invalid_input",
      checked_at: checkedAt,
      message: "사업자등록번호 체크섬이 유효하지 않아 자동 조회를 건너뛰었습니다.",
    };
  }

  if (!serviceKey) {
    return {
      provider: "nts_businessman",
      configured: false,
      mode: "manual_fallback",
      status: "not_configured",
      checked_at: checkedAt,
      message:
        "국세청 사업자등록정보 API 키가 없어 수동 검수로 접수합니다. API 등록 후 NTS_BUSINESS_STATUS_API_KEY를 설정하면 자동 상태 조회가 실행됩니다.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = new URL("https://api.odcloud.kr/api/nts-businessman/v1/status");
    url.searchParams.set("serviceKey", statusServiceKey);
    const apiResponse = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ b_no: [normalizedNumber] }),
      signal: controller.signal,
    });
    const payload = (await apiResponse.json().catch(() => ({}))) as {
      data?: Array<{
        b_no?: string;
        b_stt?: string;
        b_stt_cd?: string;
        tax_type?: string;
        end_dt?: string;
      }>;
    };
    const result = payload.data?.[0];
    let validateStatus: VerificationAutomationStatus | undefined;
    let validateHttpStatus: number | undefined;
    let validatePayload: unknown;

    if (validateServiceKey && businessStartDate && representativeName) {
      const validateUrl = new URL("https://api.odcloud.kr/api/nts-businessman/v1/validate");
      validateUrl.searchParams.set("serviceKey", validateServiceKey);
      const validateResponse = await fetchJsonWithTimeout<{
        data?: Array<{
          valid?: string;
          valid_msg?: string;
          request_param?: Record<string, unknown>;
          status?: Record<string, unknown>;
        }>;
      }>(
        validateUrl.toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            businesses: [
              {
                b_no: normalizedNumber,
                start_dt: businessStartDate,
                p_nm: representativeName,
                ...(subjectName ? { b_nm: subjectName } : {}),
              },
            ],
          }),
        },
        6500,
      );
      validateHttpStatus = validateResponse.status;
      validatePayload = validateResponse.payload;
      validateStatus =
        validateResponse.ok && validateResponse.payload.data?.[0]?.valid === "01"
          ? "matched"
          : "not_found";
    } else if (validateServiceKey) {
      validateStatus = "invalid_input";
    }
    const isActive =
      result?.b_stt_cd === "01" ||
      normalizeRequiredText(result?.b_stt).includes("계속");

    return {
      provider: "nts_businessman",
      configured: true,
      mode: "api_ready",
      status:
        apiResponse.ok &&
        isActive &&
        (validateStatus === undefined || validateStatus === "matched")
          ? "matched"
          : "not_found",
      checked_at: checkedAt,
      http_status: apiResponse.status,
      result_hash: sha256Hex(
        JSON.stringify({ status: result ?? payload, validate: validatePayload }),
      ),
      profile: {
        business_status_code: result?.b_stt_cd,
        business_status_label: result?.b_stt,
        tax_type: result?.tax_type,
        validate_status: validateStatus,
        validate_http_status: validateHttpStatus,
        validate_attempted: validateStatus !== undefined,
        validate_input_ready: Boolean(businessStartDate && representativeName),
      },
      message:
        apiResponse.ok && isActive
          ? "국세청 사업자등록 상태 조회에서 계속사업자로 확인되었습니다."
          : "국세청 사업자등록 상태 조회 결과를 운영자 검수에서 확인해야 합니다.",
    };
  } catch (error) {
    return {
      provider: "nts_businessman",
      configured: true,
      mode: "api_ready",
      status: "failed",
      checked_at: checkedAt,
      message:
        error instanceof Error
          ? `국세청 사업자등록 상태 자동 조회 실패: ${error.message}`
          : "국세청 사업자등록 상태 자동 조회에 실패했습니다.",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const buildNotConfiguredAutomationResult = (
  plan: ReturnType<typeof buildVerificationAutomationPlan>,
  checkedAt: string,
  message?: string,
): VerificationAutomationResult => ({
  provider: plan.provider,
  configured: false,
  mode: plan.mode,
  status: "not_configured",
  checked_at: checkedAt,
  message: message ?? plan.note,
  next_action: plan.fallback,
  plan,
});

const runPublicChallengeAutomation = async (
  proofUrl: string | undefined,
  challengeCode: string,
) => {
  if (!proofUrl) {
    return {
      status: "not_run" as OwnershipCheckStatus,
      checked_at: new Date().toISOString(),
      error: "Proof URL is missing",
    };
  }

  return checkOwnershipChallenge(proofUrl, challengeCode);
};

const parseYoutubeChannelTarget = (
  platformUrl: string,
  platformHandle: string,
) => {
  try {
    const url = new URL(platformUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const channelIndex = parts.findIndex((part) => part === "channel");
    if (channelIndex >= 0 && parts[channelIndex + 1]) {
      return { type: "id" as const, value: parts[channelIndex + 1] };
    }
    const handlePart = parts.find((part) => part.startsWith("@"));
    if (handlePart) {
      return { type: "handle" as const, value: handlePart.replace(/^@/, "") };
    }
  } catch {
    // Fall back to the submitted handle.
  }

  return {
    type: "handle" as const,
    value: normalizeHandleForComparison(platformHandle),
  };
};

const parseYoutubeVideoId = (value: string | undefined) => {
  if (!hasText(value)) return undefined;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const directVideoId =
      hostname === "youtu.be" ? parts[0] : url.searchParams.get("v") ?? undefined;
    const pathVideoId =
      parts[0] && ["shorts", "embed", "live"].includes(parts[0])
        ? parts[1]
        : undefined;
    const candidate = directVideoId ?? pathVideoId;
    return candidate && /^[a-zA-Z0-9_-]{6,}$/.test(candidate)
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
};

const containsChallengeCode = (
  value: string | undefined | null,
  challengeCode: string,
) =>
  normalizeRequiredText(value)
    .toUpperCase()
    .includes(challengeCode.toUpperCase());

type YoutubeChannelItem = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
    hiddenSubscriberCount?: boolean;
  };
};

type YoutubeVideoItem = {
  id?: string;
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    publishedAt?: string;
  };
  status?: {
    privacyStatus?: string;
    uploadStatus?: string;
  };
};

const fetchYoutubeChannelForTarget = async (
  apiKey: string,
  target: ReturnType<typeof parseYoutubeChannelTarget>,
  timeoutMs = 6500,
) => {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("key", apiKey);
  if (target.type === "id") {
    url.searchParams.set("id", target.value);
  } else {
    url.searchParams.set(
      "forHandle",
      target.value.startsWith("@") ? target.value : `@${target.value}`,
    );
  }

  return fetchJsonWithTimeout<{
    items?: YoutubeChannelItem[];
    error?: unknown;
  }>(url.toString(), {}, timeoutMs);
};

const fetchYoutubeVideoForProof = async (apiKey: string, videoId: string) => {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  return fetchJsonWithTimeout<{
    items?: YoutubeVideoItem[];
    error?: unknown;
  }>(url.toString());
};

const runYoutubeAutomationCheck = async ({
  platformUrl,
  platformHandle,
  proofUrl,
  ownershipMethod,
  challengeCode,
}: {
  platformUrl: string;
  platformHandle: string;
  proofUrl?: string;
  ownershipMethod: InfluencerVerificationMethod;
  challengeCode: string;
}): Promise<VerificationAutomationResult> => {
  const checkedAt = new Date().toISOString();
  const plan = buildVerificationAutomationPlan("youtube");
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();

  if (!apiKey) {
    const publicChallenge = await runPublicChallengeAutomation(
      proofUrl ?? platformUrl,
      challengeCode,
    );

    return {
      ...buildNotConfiguredAutomationResult(
        plan,
        publicChallenge.checked_at,
        publicChallenge.status === "matched"
          ? "YouTube 공개 증빙 URL에서 인증코드를 확인했습니다. API 키가 연결되면 채널 일치 여부까지 자동 확인합니다."
          : "YOUTUBE_DATA_API_KEY가 없어 YouTube 공개 증빙 URL만 확인했습니다. 관리자 검수가 필요합니다.",
      ),
      status:
        publicChallenge.status === "matched" ? "matched" : "not_configured",
      http_status: publicChallenge.http_status,
      matched_fields:
        publicChallenge.status === "matched" ? ["public_url"] : undefined,
      ownership_check: publicChallenge,
      public_challenge: publicChallenge,
    };
  }

  const target = parseYoutubeChannelTarget(platformUrl, platformHandle);
  if (!target.value) {
    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: "invalid_input",
      checked_at: checkedAt,
      message: "YouTube channel handle or channel id is required.",
      plan,
    };
  }

  try {
    const channelResponse = await fetchYoutubeChannelForTarget(apiKey, target);
    const channel = channelResponse.payload.items?.[0];
    const proofVideoId = parseYoutubeVideoId(proofUrl);
    const videoResponse = proofVideoId
      ? await fetchYoutubeVideoForProof(apiKey, proofVideoId)
      : undefined;
    const video = videoResponse?.payload.items?.[0];
    const channelDescriptionMatched = containsChallengeCode(
      channel?.snippet?.description,
      challengeCode,
    );
    const videoTitleMatched = containsChallengeCode(
      video?.snippet?.title,
      challengeCode,
    );
    const videoDescriptionMatched = containsChallengeCode(
      video?.snippet?.description,
      challengeCode,
    );
    const videoChannelMatches =
      Boolean(channel?.id && video?.snippet?.channelId) &&
      channel?.id === video?.snippet?.channelId;
    const videoProofMatched =
      Boolean(video) &&
      videoChannelMatches &&
      (videoTitleMatched || videoDescriptionMatched);
    const shouldTryPublicProof =
      !channelDescriptionMatched &&
      !videoProofMatched &&
      ownershipMethod !== "channel_description_code" &&
      hasText(proofUrl);
    const publicChallenge = shouldTryPublicProof
      ? await runPublicChallengeAutomation(proofUrl, challengeCode)
      : undefined;
    const publicProofMatched = publicChallenge?.status === "matched";
    const matched =
      channelDescriptionMatched || videoProofMatched || publicProofMatched;
    const matchedFields = [
      channelDescriptionMatched ? "channel.snippet.description" : undefined,
      videoTitleMatched && videoChannelMatches ? "video.snippet.title" : undefined,
      videoDescriptionMatched && videoChannelMatches
        ? "video.snippet.description"
        : undefined,
      publicProofMatched ? "public_url" : undefined,
    ].filter((value): value is string => Boolean(value));
    const ownershipCheck = {
      status: matched ? "matched" : ("not_found" as OwnershipCheckStatus),
      checked_at: publicChallenge?.checked_at ?? checkedAt,
      http_status: videoResponse?.status ?? channelResponse.status,
    };

    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: channelResponse.ok && matched ? "matched" : "not_found",
      checked_at: checkedAt,
      http_status: videoResponse?.status ?? channelResponse.status,
      result_hash: sha256Hex(
        JSON.stringify({
          channel: channelResponse.payload,
          video: videoResponse?.payload,
          public_challenge: publicChallenge,
        }),
      ),
      message:
        channelResponse.ok && matched
          ? videoProofMatched
            ? "YouTube 영상/쇼츠 증빙이 제출 채널과 일치하고 인증코드를 포함합니다."
            : channelDescriptionMatched
              ? "YouTube 채널 설명에서 인증코드를 확인했습니다."
              : "YouTube 공개 증빙 URL에서 인증코드를 확인했습니다."
          : "YouTube 채널 또는 제출 증빙에서 인증코드를 확인하지 못했습니다.",
      matched_fields: matchedFields,
      ownership_check: {
        ...ownershipCheck,
        status: channelResponse.ok ? ownershipCheck.status : "failed",
      },
      public_challenge: publicChallenge,
      profile: channel
        ? {
            channel_id: channel.id,
            title: channel.snippet?.title,
            custom_url: channel.snippet?.customUrl,
            published_at: channel.snippet?.publishedAt,
            subscriber_count: channel.statistics?.subscriberCount,
            video_count: channel.statistics?.videoCount,
            hidden_subscriber_count: channel.statistics?.hiddenSubscriberCount,
            proof_video_id: video?.id,
            proof_video_title: video?.snippet?.title,
            proof_video_channel_id: video?.snippet?.channelId,
            proof_video_channel_title: video?.snippet?.channelTitle,
            proof_video_published_at: video?.snippet?.publishedAt,
            proof_video_privacy_status: video?.status?.privacyStatus,
            proof_video_code_found: videoTitleMatched || videoDescriptionMatched,
            proof_video_channel_matched: videoChannelMatches,
            proof_source: videoProofMatched
              ? "video"
              : channelDescriptionMatched
                ? "channel"
                : publicProofMatched
                  ? "public_url"
                  : undefined,
          }
        : undefined,
      plan,
    };
  } catch (error) {
    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: "failed",
      checked_at: checkedAt,
      message: error instanceof Error ? error.message : "YouTube API check failed.",
      plan,
    };
  }
};

const runNaverBlogAutomationCheck = async ({
  platformHandle,
  platformUrl,
  proofUrl,
  challengeCode,
}: {
  platformHandle: string;
  platformUrl: string;
  proofUrl?: string;
  challengeCode: string;
}): Promise<VerificationAutomationResult> => {
  const checkedAt = new Date().toISOString();
  const plan = buildVerificationAutomationPlan("naver_blog");
  const expectedBlogId =
    extractNaverBlogId(platformHandle) ||
    extractNaverBlogId(platformUrl) ||
    extractNaverBlogId(proofUrl);
  const publicChallenge = await runPublicChallengeAutomation(proofUrl, challengeCode);
  if (publicChallenge.status === "matched") {
    return {
      provider: plan.provider,
      configured: plan.configured,
      mode: plan.mode,
      status: "matched",
      checked_at: publicChallenge.checked_at,
      http_status: publicChallenge.http_status,
      message: "네이버 블로그 공개 증빙 URL에서 인증코드를 확인했습니다.",
      matched_fields: ["public_url"],
      ownership_check: publicChallenge,
      public_challenge: publicChallenge,
      profile: {
        blog_id: expectedBlogId || undefined,
        proof_source: "public_url",
      },
      plan,
    };
  }

  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return {
      ...buildNotConfiguredAutomationResult(
        plan,
        publicChallenge.checked_at,
        "NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 없어 공개 증빙 URL만 확인했습니다. 자동 확인이 막히면 관리자 검수가 필요합니다.",
      ),
      public_challenge: publicChallenge,
      ownership_check: publicChallenge,
      profile: {
        blog_id: expectedBlogId || undefined,
      },
    };
  }

  try {
    const url = new URL("https://openapi.naver.com/v1/search/blog.json");
    url.searchParams.set("query", `${challengeCode} ${expectedBlogId || platformHandle}`);
    url.searchParams.set("display", "10");
    url.searchParams.set("sort", "date");
    const apiResponse = await fetchJsonWithTimeout<{
      items?: Array<{
        title?: string;
        link?: string;
        description?: string;
        bloggername?: string;
        bloggerlink?: string;
      }>;
      errorMessage?: string;
    }>(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
        Accept: "application/json",
      },
    });
    const items = apiResponse.payload.items ?? [];
    const matchedItem = items.find((item) => {
      const haystack = [
        stripHtmlTags(item.title),
        stripHtmlTags(item.description),
        item.link,
        item.bloggerlink,
        item.bloggername,
      ]
        .filter(Boolean)
        .join(" ");
      const bloggerId = extractNaverBlogId(item.bloggerlink);
      const linkBlogId = extractNaverBlogId(item.link);
      const handleMatches =
        !expectedBlogId ||
        bloggerId === expectedBlogId ||
        linkBlogId === expectedBlogId ||
        normalizeHandleForComparison(item.bloggername).includes(expectedBlogId);
      return containsChallengeCode(haystack, challengeCode) && handleMatches;
    });

    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: apiResponse.ok && matchedItem ? "matched" : "not_found",
      checked_at: checkedAt,
      http_status: apiResponse.status,
      result_hash: sha256Hex(JSON.stringify(apiResponse.payload)),
      message: matchedItem
        ? "네이버 블로그 검색 API에서 제출 블로그의 인증코드를 확인했습니다."
        : "네이버 블로그 검색 API에서 제출 블로그의 인증코드를 찾지 못했습니다.",
      matched_fields: matchedItem ? ["search.items"] : [],
      ownership_check: {
        status: apiResponse.ok && matchedItem ? "matched" : "not_found",
        checked_at: checkedAt,
        http_status: apiResponse.status,
      },
      public_challenge: publicChallenge,
      profile: matchedItem
        ? {
            blog_id: expectedBlogId || undefined,
            link: matchedItem.link,
            bloggername: matchedItem.bloggername,
            bloggerlink: matchedItem.bloggerlink,
            proof_source: "naver_search_api",
          }
        : {
            blog_id: expectedBlogId || undefined,
          },
      plan,
    };
  } catch (error) {
    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: "failed",
      checked_at: checkedAt,
      message: error instanceof Error ? error.message : "Naver blog API check failed.",
      public_challenge: publicChallenge,
      ownership_check: publicChallenge,
      plan,
    };
  }
};

const runInstagramAutomationCheck = async ({
  platformHandle,
  proofUrl,
  challengeCode,
}: {
  platformHandle: string;
  proofUrl?: string;
  challengeCode: string;
}): Promise<VerificationAutomationResult> => {
  const checkedAt = new Date().toISOString();
  const plan = buildVerificationAutomationPlan("instagram");
  const accessToken = process.env.META_GRAPH_ACCESS_TOKEN?.trim();
  const igUserId = process.env.META_IG_USER_ID?.trim();
  const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";
  const username = normalizeHandleForComparison(platformHandle).replace(/[^a-z0-9._]/g, "");
  const publicChallenge = await runPublicChallengeAutomation(proofUrl, challengeCode);

  if (!accessToken || !igUserId) {
    return {
      ...buildNotConfiguredAutomationResult(
        plan,
        publicChallenge.checked_at,
        publicChallenge.status === "matched"
          ? "Instagram 공개 증빙 URL에서 인증코드를 확인했습니다. Graph API 연결 전에는 관리자 검수와 함께 사용합니다."
          : "Instagram Graph API가 없어 공개 증빙 URL만 확인했습니다. Instagram이 접근을 막으면 스크린샷 검수가 필요합니다.",
      ),
      status:
        publicChallenge.status === "matched" ? "matched" : "not_configured",
      http_status: publicChallenge.http_status,
      matched_fields:
        publicChallenge.status === "matched" ? ["public_url"] : undefined,
      public_challenge: publicChallenge,
      ownership_check: publicChallenge,
      profile: {
        username: username || undefined,
        proof_source:
          publicChallenge.status === "matched" ? "public_url" : undefined,
      },
    };
  }
  if (!username) {
    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: "invalid_input",
      checked_at: checkedAt,
      message: "Instagram username is required.",
      plan,
    };
  }

  try {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${igUserId}`);
    url.searchParams.set(
      "fields",
      `business_discovery.username(${username}){id,username,followers_count,media_count,biography,website,profile_picture_url}`,
    );
    url.searchParams.set("access_token", accessToken);
    const apiResponse = await fetchJsonWithTimeout<{
      business_discovery?: {
        id?: string;
        username?: string;
        followers_count?: number;
        media_count?: number;
        biography?: string;
        website?: string;
        profile_picture_url?: string;
      };
      error?: unknown;
    }>(url.toString());
    const profile = apiResponse.payload.business_discovery;
    const bioMatched = containsChallengeCode(profile?.biography, challengeCode);
    const publicMatched = publicChallenge.status === "matched";
    const matched = bioMatched || publicMatched;

    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: apiResponse.ok && matched ? "matched" : "not_found",
      checked_at: publicMatched ? publicChallenge.checked_at : checkedAt,
      http_status: apiResponse.status,
      result_hash: sha256Hex(
        JSON.stringify({
          graph: apiResponse.payload,
          public_challenge: publicChallenge,
        }),
      ),
      message: matched
        ? bioMatched
          ? "Instagram Graph API에서 프로필 소개의 인증코드를 확인했습니다."
          : "Instagram 공개 증빙 URL에서 인증코드를 확인했습니다."
        : "Instagram 프로필 또는 공개 증빙에서 인증코드를 확인하지 못했습니다.",
      matched_fields: [
        bioMatched ? "business_discovery.biography" : undefined,
        publicMatched ? "public_url" : undefined,
      ].filter((value): value is string => Boolean(value)),
      ownership_check: {
        status: apiResponse.ok && matched ? "matched" : "not_found",
        checked_at: publicMatched ? publicChallenge.checked_at : checkedAt,
        http_status: apiResponse.status,
      },
      public_challenge: publicChallenge,
      profile: profile
        ? {
            id: profile.id,
            username: profile.username,
            followers_count: profile.followers_count,
            media_count: profile.media_count,
            website: profile.website,
            proof_source: bioMatched
              ? "instagram_graph_api"
              : publicMatched
                ? "public_url"
                : undefined,
          }
        : {
            username,
            proof_source: publicMatched ? "public_url" : undefined,
          },
      plan,
    };
  } catch (error) {
    const publicFallback = publicChallenge.status === "matched";
    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: publicFallback ? "matched" : "failed",
      checked_at: publicFallback ? publicChallenge.checked_at : checkedAt,
      message: publicFallback
        ? "Instagram Graph API 확인은 실패했지만 공개 증빙 URL에서 인증코드를 확인했습니다."
        : error instanceof Error
          ? error.message
          : "Instagram API check failed.",
      matched_fields: publicFallback ? ["public_url"] : undefined,
      public_challenge: publicChallenge,
      ownership_check: publicChallenge,
      profile: {
        username,
        proof_source: publicFallback ? "public_url" : undefined,
      },
      plan,
    };
  }
};

const runInstagramDmManualCheck = (
  challengeCode: string,
): VerificationAutomationResult => {
  const checkedAt = new Date().toISOString();
  const plan = buildVerificationAutomationPlan("instagram");
  const webhookConfigured = Boolean(
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() &&
      process.env.META_APP_SECRET?.trim(),
  );

  return {
    provider: webhookConfigured
      ? "instagram_messaging_webhook"
      : "instagram_dm_manual_review",
    configured: webhookConfigured,
    mode: webhookConfigured ? "webhook_ready" : "manual_fallback",
    status: "blocked",
    checked_at: checkedAt,
    message:
      "Instagram DM challenge is pending operator review until inbound webhook automation approves it.",
    next_action:
      "Confirm the influencer sent this challenge code to the official Instagram account, then approve manually.",
    matched_fields: [],
    ownership_check: {
      status: "not_run",
      checked_at: checkedAt,
    },
    profile: {
      challenge_code_hash: sha256Hex(challengeCode),
      review_channel: "instagram_dm",
      webhook_configured: webhookConfigured,
    },
    plan,
  };
};

const runTikTokAutomationCheck = async ({
  platformHandle,
  proofUrl,
  challengeCode,
  accessToken,
}: {
  platformHandle: string;
  proofUrl?: string;
  challengeCode: string;
  accessToken?: string;
}): Promise<VerificationAutomationResult> => {
  const checkedAt = new Date().toISOString();
  const plan = buildVerificationAutomationPlan("tiktok");
  const token = accessToken?.trim() || process.env.TIKTOK_ACCOUNT_ACCESS_TOKEN?.trim();
  const publicChallenge = await runPublicChallengeAutomation(proofUrl, challengeCode);

  if (!token) {
    return {
      ...buildNotConfiguredAutomationResult(
        plan,
        publicChallenge.checked_at,
        publicChallenge.status === "matched"
          ? "TikTok 공개 증빙 URL에서 인증코드를 확인했습니다. OAuth 연결 전에는 관리자 검수와 함께 사용합니다."
          : "TikTok OAuth 토큰이 없어 공개 증빙 URL만 확인했습니다. TikTok이 접근을 막으면 스크린샷 검수가 필요합니다.",
      ),
      status:
        publicChallenge.status === "matched" ? "matched" : "not_configured",
      http_status: publicChallenge.http_status,
      matched_fields:
        publicChallenge.status === "matched" ? ["public_url"] : undefined,
      public_challenge: publicChallenge,
      ownership_check: publicChallenge,
      profile: {
        username: normalizeHandleForComparison(platformHandle) || undefined,
        proof_source:
          publicChallenge.status === "matched" ? "public_url" : undefined,
      },
    };
  }

  try {
    const url = new URL("https://open.tiktokapis.com/v2/user/info/");
    url.searchParams.set(
      "fields",
      [
        "open_id",
        "union_id",
        "display_name",
        "username",
        "bio_description",
        "profile_deep_link",
        "is_verified",
        "follower_count",
        "following_count",
        "likes_count",
        "video_count",
      ].join(","),
    );
    const apiResponse = await fetchJsonWithTimeout<{
      data?: {
        user?: {
          open_id?: string;
          union_id?: string;
          display_name?: string;
          username?: string;
          bio_description?: string;
          profile_deep_link?: string;
          is_verified?: boolean;
          follower_count?: number;
          following_count?: number;
          likes_count?: number;
          video_count?: number;
        };
      };
      error?: unknown;
    }>(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const user = apiResponse.payload.data?.user;
    const expectedHandle = normalizeHandleForComparison(platformHandle);
    const userHandle = normalizeHandleForComparison(user?.username);
    const handleMatches = expectedHandle ? expectedHandle === userHandle : true;
    const bioMatched = Boolean(
      handleMatches && containsChallengeCode(user?.bio_description, challengeCode),
    );
    const publicMatched = publicChallenge.status === "matched";
    const matched = bioMatched || publicMatched;

    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: apiResponse.ok && matched ? "matched" : "not_found",
      checked_at: checkedAt,
      http_status: apiResponse.status,
      result_hash: sha256Hex(
        JSON.stringify({
          user_info: apiResponse.payload,
          public_challenge: publicChallenge,
        }),
      ),
      message: matched
        ? bioMatched
          ? "TikTok OAuth 사용자 정보에서 핸들과 프로필 소개 인증코드를 확인했습니다."
          : "TikTok 공개 증빙 URL에서 인증코드를 확인했습니다."
        : "TikTok OAuth 사용자 정보 또는 공개 증빙에서 인증코드를 확인하지 못했습니다.",
      matched_fields: [
        bioMatched ? "data.user.username" : undefined,
        bioMatched ? "data.user.bio_description" : undefined,
        publicMatched ? "public_url" : undefined,
      ].filter((value): value is string => Boolean(value)),
      ownership_check: {
        status: apiResponse.ok && matched ? "matched" : "not_found",
        checked_at: publicMatched ? publicChallenge.checked_at : checkedAt,
        http_status: apiResponse.status,
      },
      public_challenge: publicChallenge,
      profile: user
        ? {
            open_id_hash: user.open_id ? sha256Hex(user.open_id) : undefined,
            union_id_hash: user.union_id ? sha256Hex(user.union_id) : undefined,
            display_name: user.display_name,
            username: user.username,
            profile_deep_link: user.profile_deep_link,
            is_verified: user.is_verified,
            follower_count: user.follower_count,
            following_count: user.following_count,
            likes_count: user.likes_count,
            video_count: user.video_count,
            proof_source: bioMatched
              ? "tiktok_oauth"
              : publicMatched
                ? "public_url"
                : undefined,
          }
        : {
            username: expectedHandle || undefined,
            proof_source: publicMatched ? "public_url" : undefined,
          },
      plan,
    };
  } catch (error) {
    const publicFallback = publicChallenge.status === "matched";
    return {
      provider: plan.provider,
      configured: true,
      mode: "api_ready",
      status: publicFallback ? "matched" : "failed",
      checked_at: publicFallback ? publicChallenge.checked_at : checkedAt,
      message: publicFallback
        ? "TikTok OAuth 확인은 실패했지만 공개 증빙 URL에서 인증코드를 확인했습니다."
        : error instanceof Error
          ? error.message
          : "TikTok API check failed.",
      matched_fields: publicFallback ? ["public_url"] : undefined,
      public_challenge: publicChallenge,
      ownership_check: publicChallenge,
      profile: {
        username: normalizeHandleForComparison(platformHandle) || undefined,
        proof_source: publicFallback ? "public_url" : undefined,
      },
      plan,
    };
  }
};

const runPlatformAccountAutomationCheck = async ({
  platform,
  platformHandle,
  platformUrl,
  proofUrl,
  ownershipMethod,
  challengeCode,
  platformAccessToken,
}: {
  platform: InfluencerPlatform;
  platformHandle: string;
  platformUrl: string;
  proofUrl?: string;
  ownershipMethod: InfluencerVerificationMethod;
  challengeCode: string;
  platformAccessToken?: string;
}): Promise<VerificationAutomationResult> => {
  const checkedAt = new Date().toISOString();
  const plan = buildVerificationAutomationPlan(platform);

  if (platform === "instagram" && ownershipMethod === "instagram_dm_code") {
    return runInstagramDmManualCheck(challengeCode);
  }

  if (ownershipMethod === "screenshot_review") {
    return {
      provider: plan.provider,
      configured: plan.configured,
      mode: plan.mode,
      status: "blocked",
      checked_at: checkedAt,
      message: "Screenshot review cannot be fully automated.",
      next_action: "Operator must review the submitted evidence file.",
      ownership_check: { status: "not_run", checked_at: checkedAt },
      plan,
    };
  }

  if (platform === "youtube") {
    const apiResult = await runYoutubeAutomationCheck({
      platformUrl,
      platformHandle,
      proofUrl,
      ownershipMethod,
      challengeCode,
    });
    return apiResult;
  }

  if (platform === "naver_blog") {
    return runNaverBlogAutomationCheck({
      platformHandle,
      platformUrl,
      proofUrl,
      challengeCode,
    });
  }

  if (platform === "instagram") {
    return runInstagramAutomationCheck({ platformHandle, proofUrl, challengeCode });
  }

  if (platform === "tiktok") {
    return runTikTokAutomationCheck({
      platformHandle,
      proofUrl,
      challengeCode,
      accessToken: platformAccessToken,
    });
  }

  const publicChallenge = await runPublicChallengeAutomation(proofUrl, challengeCode);
  return {
    provider: plan.provider,
    configured: false,
    mode: plan.mode,
    status: publicChallenge.status === "matched" ? "matched" : "not_configured",
    checked_at: publicChallenge.checked_at,
    http_status: publicChallenge.http_status,
    message:
      publicChallenge.status === "matched"
        ? "Public proof URL contains the challenge code."
        : "No platform API is configured; operator review is required.",
    ownership_check: publicChallenge,
    public_challenge: publicChallenge,
    plan,
  };
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

const validateMarketplaceImageFile = (
  file: ReturnType<typeof parseEvidenceFile> | undefined,
) => {
  if (!file) return "Image file is required";
  if (!marketplaceImageMimeTypes.has(file.type)) {
    return "Only PNG, JPG, or WebP images are allowed";
  }
  if (file.size <= 0 || file.size > maxMarketplaceImageSize) {
    return "Image file must be 3MB or smaller";
  }
  if (!file.data_url.startsWith("data:")) {
    return "Image file is invalid";
  }

  return undefined;
};

const buildMarketplacePublicStoragePath = ({
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

const marketplacePublicObjectUrl = (objectPath: string) => {
  if (!supabaseUrl) return undefined;
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(
    marketplacePublicStorageBucket,
  )}/${encodedPath}`;
};

const ensureMarketplacePublicStorageBucket = async () => {
  if (!useSupabase) return;

  const checkResponse = await fetch(
    supabaseStorageUrl(
      `/bucket/${encodeURIComponent(marketplacePublicStorageBucket)}`,
    ),
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
      `Supabase public storage bucket check failed (${checkResponse.status}): ${checkBody}`,
    );
  }

  const createResponse = await fetch(supabaseStorageUrl("/bucket"), {
    method: "POST",
    headers: supabaseStorageHeaders("application/json"),
    body: JSON.stringify({
      id: marketplacePublicStorageBucket,
      name: marketplacePublicStorageBucket,
      public: true,
      file_size_limit: maxMarketplaceImageSize,
      allowed_mime_types: Array.from(marketplaceImageMimeTypes),
    }),
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(
      `Supabase public storage bucket create failed (${createResponse.status}): ${await createResponse.text()}`,
    );
  }
};

const uploadSupabaseMarketplacePublicImage = async ({
  objectPath,
  contentType,
  buffer,
}: {
  objectPath: string;
  contentType: string;
  buffer: Buffer;
}) => {
  await ensureMarketplacePublicStorageBucket();

  const response = await fetch(
    supabaseStorageUrl(
      `/object/${encodeURIComponent(marketplacePublicStorageBucket)}/${objectPath}`,
    ),
    {
      method: "POST",
      headers: {
        ...supabaseStorageHeaders(contentType),
        "x-upsert": "true",
      },
      body: buffer,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Supabase public storage upload failed (${response.status}): ${await response.text()}`,
    );
  }
};

const storeMarketplacePublicImage = async ({
  area,
  ownerId,
  file,
}: {
  area: string;
  ownerId: string;
  file: NonNullable<ReturnType<typeof parseEvidenceFile>>;
}) => {
  const { contentType, buffer } = dataUrlToBuffer(file.data_url);

  if (
    contentType !== file.type ||
    !assertDeclaredMimeMatchesContent(contentType, buffer, marketplaceImageMimeTypes)
  ) {
    throw new Error("Image file content type is invalid");
  }
  if (buffer.byteLength <= 0 || buffer.byteLength > maxMarketplaceImageSize) {
    throw new Error("Image file size is invalid");
  }

  const objectPath = buildMarketplacePublicStoragePath({
    area,
    ownerId,
    fileId: randomUUID(),
    fileName: file.name,
    mimeType: contentType,
  });

  if (useSupabase) {
    try {
      await uploadSupabaseMarketplacePublicImage({
        objectPath,
        contentType,
        buffer,
      });
      const publicUrl = marketplacePublicObjectUrl(objectPath);
      if (publicUrl) return publicUrl;
    } catch (error) {
      if (!allowLocalMarketplacePublicFileFallback) {
        throw error;
      }
      console.warn(
        `[${productName}] Supabase public storage unavailable, storing marketplace image locally: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  if (!allowLocalMarketplacePublicFileFallback) {
    throw new Error("Marketplace image storage requires Supabase Storage.");
  }

  const absolutePath = path.resolve(marketplacePublicFilesDir, objectPath);
  if (!absolutePath.startsWith(path.resolve(marketplacePublicFilesDir))) {
    throw new Error("Marketplace image path is invalid");
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return `/marketplace-assets/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
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

type ContractDocumentSignatureEvidence = {
  signedAt: string;
  contractHash: string;
  signatureHash: string;
  signatureDataUrl?: string;
  signatureContentType?: string;
  signerName: string;
  signerEmail: string;
  clientIp: string;
  consentText?: string;
};

const pdfPlatformLabels: Record<ContractPlatform, string> = {
  INSTAGRAM: "인스타그램",
  YOUTUBE: "유튜브",
  NAVER_BLOG: "네이버 블로그",
  TIKTOK: "틱톡",
  OTHER: "기타",
};

const formatPdfValue = (value: unknown, fallback = "-") => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join(", ");
    return normalized || fallback;
  }
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const formatContractPdfDate = (value: string | undefined) => {
  if (!hasText(value)) return "-";
  const dateOnly = toDateOnly(value);
  return dateOnly ?? value;
};

const buildContractDocumentPdf = async ({
  contract,
  signatureEvidence,
}: {
  contract: Contract;
  signatureEvidence?: ContractDocumentSignatureEvidence;
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
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - margin) return;
    pdf.addPage();
    y = margin;
  };

  const setTextColor = (color: number) => {
    pdf.setTextColor(color, color, color);
  };

  const addHeading = (text: string, top = 28) => {
    ensureSpace(top + 24);
    y += top;
    pdf.setDrawColor(226, 226, 226);
    pdf.line(margin, y - 13, pageWidth - margin, y - 13);
    pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
    pdf.setFontSize(13);
    setTextColor(18);
    pdf.text(text, margin, y);
    y += 18;
  };

  const addLine = (text: string, indent = 0) => {
    const chunks = pdf.splitTextToSize(
      formatPdfValue(text),
      contentWidth - indent,
    ) as string[];
    chunks.forEach((chunk) => {
      ensureSpace(16);
      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(10);
      setTextColor(70);
      pdf.text(chunk, margin + indent, y);
      y += 14;
    });
  };

  const addParagraph = (text: string, fallback = "-") => {
    const chunks = pdf.splitTextToSize(formatPdfValue(text, fallback), contentWidth) as string[];
    chunks.forEach((chunk) => {
      ensureSpace(16);
      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(10);
      setTextColor(70);
      pdf.text(chunk, margin, y);
      y += 14;
    });
  };

  const addRows = (rows: Array<[string, string]>) => {
    const labelWidth = 118;
    rows.forEach(([label, value]) => {
      const valueLines = pdf.splitTextToSize(
        formatPdfValue(value),
        contentWidth - labelWidth - 22,
      ) as string[];
      const rowHeight = Math.max(32, valueLines.length * 13 + 18);
      ensureSpace(rowHeight);

      pdf.setDrawColor(220, 220, 220);
      pdf.setFillColor(248, 248, 248);
      pdf.rect(margin, y, labelWidth, rowHeight, "FD");
      pdf.rect(margin + labelWidth, y, contentWidth - labelWidth, rowHeight, "S");

      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(9);
      setTextColor(90);
      pdf.text(label, margin + 10, y + 20);

      pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
      pdf.setFontSize(10);
      setTextColor(24);
      valueLines.forEach((line, index) => {
        pdf.text(line, margin + labelWidth + 12, y + 20 + index * 13);
      });
      y += rowHeight;
    });
    y += 4;
  };

  const addBoxedItems = (items: string[], emptyText: string) => {
    if (!items.length) {
      addParagraph(emptyText);
      return;
    }

    items.forEach((item) => {
      const lines = pdf.splitTextToSize(formatPdfValue(item), contentWidth - 24) as string[];
      const boxHeight = Math.max(38, lines.length * 14 + 20);
      ensureSpace(boxHeight + 6);
      pdf.setDrawColor(226, 226, 226);
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, y, contentWidth, boxHeight, "FD");
      pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
      pdf.setFontSize(10);
      setTextColor(24);
      lines.forEach((line, index) => {
        pdf.text(line, margin + 12, y + 21 + index * 14);
      });
      y += boxHeight + 6;
    });
  };

  const addSignatureBoxes = () => {
    const gap = 14;
    const boxWidth = (contentWidth - gap) / 2;
    const boxHeight = 74;
    ensureSpace(boxHeight + 8);

    const boxes: Array<[string, string]> = [
      ["광고주", formatPdfValue(contract.advertiser_info?.name ?? contract.advertiser_id)],
      [
        "인플루언서",
        formatPdfValue(signatureEvidence?.signerName ?? contract.influencer_info.name, "서명 전"),
      ],
    ];

    boxes.forEach(([label, value], index) => {
      const x = margin + index * (boxWidth + gap);
      pdf.setDrawColor(220, 220, 220);
      pdf.rect(x, y, boxWidth, boxHeight, "S");
      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(9);
      setTextColor(120);
      pdf.text(label, x + 12, y + 18);
      pdf.setDrawColor(232, 232, 232);
      pdf.line(x + 12, y + 50, x + boxWidth - 12, y + 50);
      pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
      pdf.setFontSize(10);
      setTextColor(42);
      pdf.text(value, x + 12, y + 64);
    });

    y += boxHeight + 4;
  };

  const campaign = contract.campaign ?? {};
  pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
  pdf.setFontSize(20);
  setTextColor(18);
  const titleLines = pdf.splitTextToSize(
    formatPdfValue(contract.title, "계약서 초안"),
    contentWidth,
  ) as string[];
  titleLines.forEach((line) => {
    ensureSpace(26);
    pdf.text(line, margin, y);
    y += 24;
  });
  pdf.setFont(fontFamily, "normal");
  pdf.setFontSize(10);
  setTextColor(110);
  pdf.text(`작성일 ${formatContractPdfDate(contract.created_at)}`, margin, y + 3);
  y += 16;

  addHeading("계약 개요", 26);
  addRows([
    ["계약 종류", formatPdfValue(contract.type)],
    ["광고주", formatPdfValue(contract.advertiser_info?.name ?? contract.advertiser_id)],
    ["광고주 담당자", formatPdfValue(contract.advertiser_info?.manager)],
    ["인플루언서", formatPdfValue(contract.influencer_info.name)],
    ["연락처", formatPdfValue(contract.influencer_info.contact)],
    ["대표 채널", formatPdfValue(contract.influencer_info.channel_url)],
  ]);

  addHeading("제1조 제공 매체 및 컨텐츠 조건");
  addBoxedItems(
    (campaign.deliverables ?? []).map((item) => formatPdfValue(item)).filter((item) => item !== "-"),
    "제공 매체와 컨텐츠 조건이 입력되지 않았습니다.",
  );
  addRows([
    [
      "플랫폼",
      formatPdfValue(
        (campaign.platforms ?? []).map((platform) => pdfPlatformLabels[platform] ?? platform),
      ),
    ],
  ]);

  addHeading("제2조 일정 및 검수");
  addRows([
    [
      "캠페인 기간",
      formatPdfValue(
        campaign.period ??
          [formatContractPdfDate(campaign.start_date), formatContractPdfDate(campaign.end_date)]
            .filter((value) => value !== "-")
            .join(" - "),
      ),
    ],
    ["업로드 마감일", formatPdfValue(campaign.upload_due_at ?? campaign.deadline)],
    ["광고주 검수 회신", formatPdfValue(campaign.review_due_at)],
    ["수정 가능 횟수", formatPdfValue(campaign.revision_limit)],
  ]);

  addHeading("제3조 광고 표시 및 추적");
  addParagraph(
    formatPdfValue(
      campaign.disclosure_text,
      "광고 표시 조건이 입력되지 않았습니다.",
    ),
  );
  if (hasText(campaign.tracking_link)) {
    addRows([["추적 링크", campaign.tracking_link]]);
  }
  if ((campaign.required_hashtags ?? []).length || (campaign.brand_account_tags ?? []).length) {
    addRows([
      ["필수 해시태그", formatPdfValue(campaign.required_hashtags)],
      ["브랜드 태그", formatPdfValue(campaign.brand_account_tags)],
    ]);
  }

  addHeading("제4조 지급 조건");
  addParagraph(formatPdfValue(campaign.budget, "지급 조건이 입력되지 않았습니다."));

  addHeading("특약 및 자동 생성 조항");
  if (contract.clauses.length > 0) {
    contract.clauses.forEach((clause, index) => {
      ensureSpace(48);
      pdf.setFont(fontFamily, "normal");
      pdf.setFontSize(9);
      setTextColor(150);
      pdf.text(String(index + 1).padStart(2, "0"), margin, y);
      pdf.setFont(fontFamily, signedPdfFont ? "normal" : "bold");
      pdf.setFontSize(10);
      setTextColor(24);
      pdf.text(formatPdfValue(clause.category), margin + 28, y);
      y += 16;
      addLine(clause.content, 28);
      y += 4;
    });
  } else {
    addParagraph("계약 조항이 입력되지 않았습니다.");
  }

  addHeading("서명란");
  addSignatureBoxes();

  if (signatureEvidence) {
    addHeading("전자서명 증빙");
    addRows([
      ["서명자", signatureEvidence.signerName],
      ["서명자 이메일", signatureEvidence.signerEmail],
      ["서명 시각", signatureEvidence.signedAt],
      ["서명 IP", signatureEvidence.clientIp],
      ["계약 해시", signatureEvidence.contractHash],
      ["서명 이미지 해시", signatureEvidence.signatureHash],
      ["동의 문구 버전", signatureConsentVersion],
      [
        "동의 문구",
        signatureEvidence.consentText ||
          "서명자는 계약 내용을 확인하고 전자서명에 동의했습니다.",
      ],
    ]);

    if (signatureEvidence.signatureDataUrl && signatureEvidence.signatureContentType) {
    try {
      const imageType =
          signatureEvidence.signatureContentType === "image/png"
          ? "PNG"
            : signatureEvidence.signatureContentType === "image/jpeg"
            ? "JPEG"
            : undefined;
      if (imageType) {
        ensureSpace(70);
          pdf.addImage(signatureEvidence.signatureDataUrl, imageType, margin, y, 160, 48);
        y += 60;
      }
    } catch {
        addLine("서명 이미지는 별도 저장되었고 해시로 검증됩니다.");
      }
    }
  }

  return Buffer.from(pdf.output("arraybuffer"));
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
}) =>
  buildContractDocumentPdf({
    contract,
    signatureEvidence: {
      signedAt,
      contractHash,
      signatureHash,
      signatureDataUrl,
      signatureContentType,
      signerName,
      signerEmail,
      clientIp,
      consentText,
    },
  });

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
  SIGNED: "서명 완료",
  CLOSED: "계약 마감",
};

const buildContractReviewPdf = async (contract: Contract) =>
  buildContractDocumentPdf({ contract });

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
    active_contract_count: contracts.filter((contract) => contract.status !== "CLOSED").length,
    completed_contract_count: contracts.filter((contract) => contract.status === "CLOSED").length,
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

const readOperationalAdminContracts = async () => {
  if (!useSupabase) return [] as Contract[];
  const store = await readStore();
  return store.contracts.filter((contract) => !isOperationalTestContract(contract));
};

const readOperationalAdminSupportAccessRequests = async () => {
  if (!useSupabase) return [] as SupportAccessRequestRecord[];
  const rows = await readSupabaseRows<SupabaseSupportAccessRequestRow>(
    supportAccessTable,
    "?select=*&order=created_at.desc",
    "operational admin support access requests",
  );
  const supportAccessRequests = await attachSupportAccessEvents(
    rows.map(normalizeSupportAccessRequest),
  );
  return supportAccessRequests.filter(
    (request) => !isOperationalTestSupportAccessRequest(request),
  );
};

const readOperationalAdminSupportTickets = async () => {
  if (!useSupabase) return [] as OperationalSupportTicketRecord[];
  const rows = await readSupabaseRows<OperationalSupportTicketRecord>(
    supportTicketTable,
    "?select=*&order=created_at.desc",
    "operational admin support tickets",
  );
  return rows
    .map(normalizeSupportTicket)
    .filter((ticket) => !isOperationalTestSupportTicket(ticket));
};

const readOperationalAdminVerificationRequests = async () => {
  if (!useSupabase) return [] as VerificationRequestRecord[];
  const requests = await readSupabaseVerificationRequests();
  return requests.filter(
    (request) => !isOperationalTestVerificationRequest(request),
  );
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
    SIGNED: "active",
    CLOSED: "completed",
  };

  return statuses[status];
};

const mapContractToV2Status = (contract: Contract) => {
  return mapContractStatusToV2(contract.status);
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

const deliverableRequirementLabels: Record<string, string> = {
  videoLength: "영상 길이",
  photoCount: "사진 수",
  frameCount: "컷 수",
  wordCount: "글자수",
  maintainPeriod: "게시 유지",
  note: "조건",
};

const normalizeRequirementJson = (
  requirements: ContractDeliverableItem["requirements"] | undefined,
) => {
  if (!requirements || typeof requirements !== "object") return {};

  return Object.fromEntries(
    Object.entries(requirements)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => (typeof value === "string" ? hasText(value) : value !== undefined)),
  );
};

const summarizeRequirementJson = (requirements: Record<string, unknown>) =>
  Object.entries(requirements)
    .filter(([key]) => key !== "platformName" && key !== "contentName")
    .map(([key, value]) => {
      if (!hasText(value)) return "";
      const label = deliverableRequirementLabels[key] ?? key;
      return `${label} ${value.trim()}`;
    })
    .filter(Boolean)
    .join(", ");

const normalizeContractDeliverableItems = (contract: Contract) =>
  Array.isArray(contract.campaign?.deliverable_items)
    ? contract.campaign.deliverable_items.filter(
        (item): item is ContractDeliverableItem =>
          Boolean(item) &&
          hasText(item.contentType) &&
          hasText(item.contentLabel) &&
          hasText(item.platform),
      )
    : [];

const buildContractDeliverableRequirementRows = (
  contract: Contract,
  options: { platformIdByPlatform?: Map<string, string> } = {},
): SupabaseDeliverableRequirementRow[] => {
  const dueAt = toIsoDateTime(contract.campaign?.upload_due_at ?? contract.campaign?.deadline);
  const structuredItems = normalizeContractDeliverableItems(contract);

  if (structuredItems.length > 0) {
    return structuredItems.map((item, index) => {
      const requirementJson = normalizeRequirementJson(item.requirements);
      const requirementSummary =
        hasText(item.requirementText)
          ? item.requirementText.trim()
          : summarizeRequirementJson(requirementJson);
      const platformLabel = hasText(item.platformLabel)
        ? item.platformLabel.trim()
        : item.platform;
      const contentLabel = item.contentLabel.trim();
      const title = `${platformLabel} ${contentLabel}`.trim();

      return {
        id: stableUuid(
          `${contract.id}:deliverable-requirement:${index}:${item.platform}:${item.contentType}:${item.id}`,
        ),
        contract_id: contract.id,
        platform_id: options.platformIdByPlatform?.get(mapPlatformToV2(item.platform)),
        deliverable_type: inferDeliverableType(`${item.contentType} ${contentLabel}`),
        title,
        description: requirementSummary || title,
        quantity: 1,
        due_at: dueAt,
        content_format: item.contentType,
        requirement_json: requirementJson,
        review_required: true,
        evidence_required: true,
        order_no: index + 1,
        created_at: contract.created_at,
        updated_at: contract.updated_at,
      };
    });
  }

  return (contract.campaign?.deliverables ?? []).map((deliverable, index) => {
    const quantityMatch = deliverable.match(/(\d+)/);
    const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1])) : 1;

    return {
      id: stableUuid(`${contract.id}:deliverable-requirement:${index}:${deliverable}`),
      contract_id: contract.id,
      deliverable_type: inferDeliverableType(deliverable),
      title: deliverable,
      description: deliverable,
      quantity,
      due_at: dueAt,
      review_required: true,
      evidence_required: true,
      order_no: index + 1,
      created_at: contract.created_at,
      updated_at: contract.updated_at,
    };
  });
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

const insertSupabaseV2Rows = async (
  table: string,
  rows: Array<Record<string, unknown>>,
) => {
  if (rows.length === 0) return;

  const response = await fetchSupabase(table, "", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(normalizeRowsForPostgrest(rows)),
  });
  await assertSupabaseOk(response, `Supabase ${table} insert`);
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

const campaignProposalTypes = new Set<CampaignProposalType>(
  campaignProposalTypeOptions,
);

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

const marketplaceCampaignStatuses = new Set(["open", "draft", "closed", "ended"]);
const advertiserCampaignStatusUpdates = new Set<MarketplaceCampaignStatus>([
  "open",
  "closed",
  "ended",
]);
const isAdvertiserCampaignStatusUpdate = (
  value: string,
): value is MarketplaceCampaignStatus =>
  advertiserCampaignStatusUpdates.has(value as MarketplaceCampaignStatus);

const normalizeCampaignPlatforms = (
  value: unknown,
  fallback: InfluencerPlatform[] = [],
) => {
  const { selected } = normalizeSelectedValues(value, influencerPlatforms);
  return selected.length > 0 ? selected : fallback;
};

const normalizeBrandCampaignActivityEvents = (
  value: unknown,
): NonNullable<MarketplaceBrandCampaign["activityEvents"]> => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const id = normalizeOptionalText(record.id)?.slice(0, 80);
      const actor = normalizeOptionalText(record.actor)?.slice(0, 120);
      const action = normalizeOptionalText(record.action)?.slice(0, 80);
      const description = normalizeOptionalText(record.description)?.slice(0, 500);
      const createdAt = normalizeOptionalText(record.createdAt ?? record.created_at);
      if (!id || !actor || !action || !description || !createdAt) return undefined;
      return { id, actor, action, description, createdAt };
    })
    .filter(
      (item): item is NonNullable<MarketplaceBrandCampaign["activityEvents"]>[number] =>
        Boolean(item),
    )
    .slice(0, 80);
};

const normalizeBrandCampaigns = (
  value: unknown,
  maxItems = 20,
): MarketplaceBrandProfile["activeCampaigns"] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const id = normalizeOptionalText(record.id)?.slice(0, 80);
      const title = normalizeRequiredText(record.title);
      const type = normalizeRequiredText(record.type) as CampaignProposalType;
      const budget = normalizeRequiredText(record.budget);
      const applicantLimit = normalizeOptionalText(
        record.applicantLimit ?? record.applicant_limit,
      )?.slice(0, 40);
      const summary = normalizeOptionalText(record.summary)?.slice(0, 1000);
      const deadline = normalizeOptionalText(record.deadline)?.slice(0, 40);
      const uploadDeadline = normalizeOptionalText(
        record.uploadDeadline ?? record.upload_deadline,
      )?.slice(0, 40);
      const status = normalizeOptionalText(record.status);
      const createdAt = normalizeOptionalText(record.createdAt ?? record.created_at);
      const updatedAt = normalizeOptionalText(record.updatedAt ?? record.updated_at);
      const statusUpdatedAt = normalizeOptionalText(
        record.statusUpdatedAt ?? record.status_updated_at,
      );
      const statusUpdatedBy = normalizeOptionalText(
        record.statusUpdatedBy ?? record.status_updated_by,
      )?.slice(0, 120);
      const closedAt = normalizeOptionalText(record.closedAt ?? record.closed_at);
      const endedAt = normalizeOptionalText(record.endedAt ?? record.ended_at);
      const reopenedAt = normalizeOptionalText(record.reopenedAt ?? record.reopened_at);
      const activityEvents = normalizeBrandCampaignActivityEvents(
        record.activityEvents ?? record.activity_events,
      );
      const platforms = normalizeCampaignPlatforms(record.platforms);
      const deliverables = normalizeStringArrayForStorage(record.deliverables, [], 6);
      if (!title || !budget || !campaignProposalTypes.has(type)) return undefined;
      return {
        ...(id ? { id } : {}),
        title: title.slice(0, 100),
        type,
        budget: budget.slice(0, 80),
        ...(applicantLimit ? { applicantLimit } : {}),
        ...(summary ? { summary } : {}),
        ...(deadline ? { deadline } : {}),
        ...(uploadDeadline ? { uploadDeadline } : {}),
        ...(platforms.length > 0 ? { platforms } : {}),
        ...(deliverables.length > 0 ? { deliverables } : {}),
        ...(status && marketplaceCampaignStatuses.has(status) ? { status } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(updatedAt ? { updatedAt } : {}),
        ...(statusUpdatedAt ? { statusUpdatedAt } : {}),
        ...(statusUpdatedBy ? { statusUpdatedBy } : {}),
        ...(closedAt ? { closedAt } : {}),
        ...(endedAt ? { endedAt } : {}),
        ...(reopenedAt ? { reopenedAt } : {}),
        ...(activityEvents.length > 0 ? { activityEvents } : {}),
      };
    })
    .filter((item): item is MarketplaceBrandCampaign =>
      Boolean(item),
    )
    .slice(0, maxItems);
};

const buildMarketplaceAvatarLabel = (name: string, fallback = "IN") => {
  const normalized = name.trim();
  if (!normalized) return fallback;
  const ascii = normalized.replace(/[^a-zA-Z0-9]/g, "");
  if (ascii.length >= 2) return ascii.slice(0, 2).toUpperCase();
  if (ascii.length === 1) return ascii.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
};

const normalizeMarketplacePublicImageUrl = (value: unknown) => {
  const clean = normalizeOptionalText(value);
  if (!clean || clean.length > 2048) return undefined;
  return /^(https?:\/\/|\/)/i.test(clean) ? clean : undefined;
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
  return buildInfluencerPublicProfileUrl(clean);
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
  avatarUrl: row.avatar_url ?? undefined,
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
    avatarUrl: row.avatar_url ?? base.avatarUrl,
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
  logoUrl: row.logo_url ?? undefined,
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
  const dbProfiles = profiles
    .map((profile) =>
      mapInfluencerProfileRowToMarketplaceProfile(
        profile,
        channels.get(profile.id) ?? [],
      ),
    )
    .filter(
      (profile) =>
        !filterOperationalMarketplaceTestData ||
        !hasOperationalTestMarker(profile),
    );

  if (allowMarketplaceSeedData) return mergeMarketplaceInfluencerProfiles(dbProfiles);
  return dbProfiles.length > 0 ? dbProfiles : fallbackMarketplaceInfluencerProfiles();
};

const readMarketplaceBrandProfiles = async () => {
  if (!useSupabase) return fallbackMarketplaceBrandProfiles();

  const rows = await readSupabaseRows<SupabaseMarketplaceBrandProfileRow>(
    "marketplace_brand_profiles",
    "?select=*&is_published=eq.true&order=updated_at.desc",
    "marketplace brand profiles",
  );

  const dbProfiles = rows.map(mapBrandProfileRowToMarketplaceProfile);
  const visibleDbProfiles = dbProfiles.filter(
    (profile) =>
      !filterOperationalMarketplaceTestData || !hasOperationalTestMarker(profile),
  );
  if (allowMarketplaceSeedData) return mergeMarketplaceBrandProfiles(visibleDbProfiles);
  return visibleDbProfiles.length > 0
    ? visibleDbProfiles
    : fallbackMarketplaceBrandProfiles();
};

const publicMarketplaceCacheMaxAgeSeconds = 60;
const publicMarketplaceCacheStaleSeconds = 300;
const publicMarketplaceRuntimeCacheSeconds =
  publicMarketplaceCacheMaxAgeSeconds + publicMarketplaceCacheStaleSeconds;
const publicMarketplaceCacheControl = `public, max-age=${publicMarketplaceCacheMaxAgeSeconds}, stale-while-revalidate=${publicMarketplaceCacheStaleSeconds}`;
const publicMarketplaceCdnCacheControl = `public, s-maxage=${publicMarketplaceCacheMaxAgeSeconds}, stale-while-revalidate=${publicMarketplaceCacheStaleSeconds}`;

type PublicMarketplaceCacheKey =
  | "marketplace-influencers"
  | "marketplace-brands"
  | "marketplace-campaigns";

type RuntimeCacheClient = {
  get: <T>(key: string) => Promise<T | undefined>;
  set: <T>(
    key: string,
    value: T,
    options?: { ttl?: number; tags?: string[]; name?: string },
  ) => Promise<void>;
  delete: (key: string) => Promise<void>;
  expireTag: (tag: string | string[]) => Promise<void>;
};
type RuntimeCachePurgeModule = {
  invalidateByTag?: (tag: string | string[]) => Promise<void>;
};

type PublicMarketplaceCacheEntry<T> = {
  value?: T;
  expiresAt: number;
  staleUntil: number;
  refresh?: Promise<T>;
};

type PublicMarketplaceCacheOptions<T> = {
  fallback?: () => T;
};

const fallbackMarketplaceInfluencerProfiles = () =>
  allowPublicMarketplaceCatalogFallback ? mergeMarketplaceInfluencerProfiles() : [];

const fallbackMarketplaceBrandProfiles = () =>
  allowPublicMarketplaceCatalogFallback ? mergeMarketplaceBrandProfiles() : [];

const fallbackMarketplaceCampaignPosts = () =>
  buildMarketplaceCampaignPosts(fallbackMarketplaceBrandProfiles());

const isEmptyPublicMarketplaceValue = (value: unknown) =>
  Array.isArray(value) && value.length === 0;

const applyPublicMarketplaceFallback = <T,>(
  value: T,
  options: PublicMarketplaceCacheOptions<T>,
) => {
  if (!isEmptyPublicMarketplaceValue(value) || !options.fallback) return value;
  const fallbackValue = options.fallback();
  return isEmptyPublicMarketplaceValue(fallbackValue) ? value : fallbackValue;
};

const publicMarketplaceCache = new Map<
  PublicMarketplaceCacheKey,
  PublicMarketplaceCacheEntry<unknown>
>();

const publicMarketplaceCacheTags: Record<PublicMarketplaceCacheKey, string[]> = {
  "marketplace-influencers": ["marketplace", "marketplace:influencers"],
  "marketplace-brands": ["marketplace", "marketplace:brands"],
  "marketplace-campaigns": [
    "marketplace",
    "marketplace:campaigns",
    "marketplace:brands",
  ],
};
const publicMarketplaceAllTags = Array.from(
  new Set(Object.values(publicMarketplaceCacheTags).flat()),
);
let runtimeCachePromise: Promise<RuntimeCacheClient | undefined> | undefined;

const getPublicMarketplaceRuntimeCacheKey = (key: PublicMarketplaceCacheKey) =>
  `public-marketplace:${key}:v1`;

const getVercelRuntimeCache = async () => {
  if (process.env.DISABLE_VERCEL_RUNTIME_CACHE === "1") return undefined;
  runtimeCachePromise ??= import("@vercel/functions")
    .then(({ getCache }) =>
      getCache({
        namespace: "yeollock-api-v1",
      }) as RuntimeCacheClient,
    )
    .catch((error) => {
      console.warn(
        `[${productName}] Vercel runtime cache unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return undefined;
    });
  return runtimeCachePromise;
};

const readPublicMarketplaceRuntimeCache = async <T,>(
  key: PublicMarketplaceCacheKey,
) => {
  const cache = await getVercelRuntimeCache();
  if (!cache) return undefined;
  const value = await cache.get<T | null>(getPublicMarketplaceRuntimeCacheKey(key));
  return value === null ? undefined : value;
};

const writePublicMarketplaceRuntimeCache = async <T,>(
  key: PublicMarketplaceCacheKey,
  value: T,
) => {
  const cache = await getVercelRuntimeCache();
  if (!cache) return;
  await cache.set(getPublicMarketplaceRuntimeCacheKey(key), value, {
    ttl: publicMarketplaceRuntimeCacheSeconds,
    tags: publicMarketplaceCacheTags[key],
    name: key,
  });
};

const expirePublicMarketplaceRuntimeCache = async (tags = publicMarketplaceAllTags) => {
  if (process.env.DISABLE_VERCEL_RUNTIME_CACHE === "1") return;
  const cache = await getVercelRuntimeCache();
  await cache?.expireTag(tags).catch((error) => {
    console.warn(
      `[${productName}] public marketplace runtime cache invalidation failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  });
  await import("@vercel/functions")
    .then((module: RuntimeCachePurgeModule) => module.invalidateByTag?.(tags))
    .catch((error) => {
      console.warn(
        `[${productName}] public marketplace CDN cache invalidation failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    });
};

const rememberPublicMarketplaceMemoryCache = <T,>(
  key: PublicMarketplaceCacheKey,
  value: T,
) => {
  const now = Date.now();
  publicMarketplaceCache.set(key, {
    value,
    expiresAt: now + publicMarketplaceCacheMaxAgeSeconds * 1000,
    staleUntil:
      now +
      publicMarketplaceRuntimeCacheSeconds *
        1000,
  });
};

const refreshPublicMarketplaceCache = async <T,>(
  key: PublicMarketplaceCacheKey,
  loader: () => Promise<T>,
  options: PublicMarketplaceCacheOptions<T> = {},
) => {
  const value = applyPublicMarketplaceFallback(await loader(), options);
  rememberPublicMarketplaceMemoryCache(key, value);
  void writePublicMarketplaceRuntimeCache(key, value).catch((error) => {
    console.warn(
      `[${productName}] public marketplace runtime cache write failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  });
  return value;
};

const readPublicMarketplaceCache = async <T,>(
  key: PublicMarketplaceCacheKey,
  loader: () => Promise<T>,
  options: PublicMarketplaceCacheOptions<T> = {},
) => {
  const now = Date.now();
  const cached = publicMarketplaceCache.get(
    key,
  ) as PublicMarketplaceCacheEntry<T> | undefined;

  if (cached?.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.value !== undefined && cached.staleUntil > now) {
    if (!cached.refresh) {
      cached.refresh = refreshPublicMarketplaceCache(key, loader, options)
        .catch((error) => {
          console.warn(
            `[${productName}] public marketplace cache refresh failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
          return cached.value as T;
        })
        .finally(() => {
          const latest = publicMarketplaceCache.get(key);
          if (latest) delete (latest as PublicMarketplaceCacheEntry<T>).refresh;
        });
      publicMarketplaceCache.set(key, cached);
    }
    return cached.value;
  }

  const runtimeCached = await readPublicMarketplaceRuntimeCache<T>(key).catch(
    (error) => {
      console.warn(
        `[${productName}] public marketplace runtime cache read failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return undefined;
    },
  );
  if (runtimeCached !== undefined) {
    const value = applyPublicMarketplaceFallback(runtimeCached, options);
    rememberPublicMarketplaceMemoryCache(key, value);
    return value;
  }

  if (cached?.refresh) return cached.refresh;

  const refresh = refreshPublicMarketplaceCache(key, loader, options).catch((error) => {
    publicMarketplaceCache.delete(key);
    if (cached?.value !== undefined) return cached.value;
    if (!options.fallback) throw error;

    const value = options.fallback();
    rememberPublicMarketplaceMemoryCache(key, value);
    console.warn(
      `[${productName}] public marketplace cache cold fallback for ${key}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return value;
  });
  publicMarketplaceCache.set(key, {
    value: cached?.value,
    expiresAt: cached?.expiresAt ?? 0,
    staleUntil: cached?.staleUntil ?? 0,
    refresh,
  });
  return refresh;
};

const clearPublicMarketplaceCache = () => {
  publicMarketplaceCache.clear();
  void expirePublicMarketplaceRuntimeCache().catch((error) => {
    console.warn(
      `[${productName}] public marketplace runtime cache invalidation failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  });
};

const sendPublicMarketplaceJson = <T,>(
  response: express.Response,
  payload: T,
  key: PublicMarketplaceCacheKey,
) => {
  response.setHeader("Cache-Control", publicMarketplaceCacheControl);
  response.setHeader("CDN-Cache-Control", publicMarketplaceCdnCacheControl);
  response.setHeader("Vercel-CDN-Cache-Control", publicMarketplaceCdnCacheControl);
  response.setHeader("Vercel-Cache-Tag", publicMarketplaceCacheTags[key].join(","));
  response.json(payload);
};

const warmPublicMarketplaceCache = () => {
  if (process.env.DISABLE_PUBLIC_MARKETPLACE_CACHE_WARMUP === "1") return;
  if (process.env.VERCEL === "1") return;

  setTimeout(() => {
    void Promise.all([
      readPublicMarketplaceCache(
        "marketplace-influencers",
        readMarketplaceInfluencerProfiles,
        { fallback: fallbackMarketplaceInfluencerProfiles },
      ),
      readPublicMarketplaceCache(
        "marketplace-brands",
        readMarketplaceBrandProfiles,
        { fallback: fallbackMarketplaceBrandProfiles },
      ),
    ])
      .then(([, brands]) =>
        readPublicMarketplaceCache(
          "marketplace-campaigns",
          async () => buildMarketplaceCampaignPosts(brands),
          { fallback: fallbackMarketplaceCampaignPosts },
        ),
      )
      .catch((error) => {
        console.warn(
          `[${productName}] public marketplace cache warmup failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      });
  }, 0);
};

warmPublicMarketplaceCache();

type MarketplaceFollowerSyncStatus =
  | "synced"
  | "failed"
  | "skipped"
  | "not_configured";

type MarketplaceFollowerSyncEventStatus =
  | "updated"
  | "unchanged"
  | "failed"
  | "skipped"
  | "not_configured";

type MarketplaceFollowerSyncSnapshot = {
  status: MarketplaceFollowerSyncStatus;
  checkedAt: string;
  provider: string;
  followerCount?: number;
  followersLabel?: string;
  httpStatus?: number;
  error?: string;
  metadata?: Record<string, unknown>;
};

type MarketplaceFollowerSyncQueueItem = {
  profile: SupabaseMarketplaceInfluencerProfileRow;
  channel: SupabaseMarketplaceInfluencerChannelRow;
};

type MarketplaceFollowerSyncResult = {
  run_id: string;
  status: SupabaseMarketplaceFollowerSyncRunRow["status"];
  started_at: string;
  finished_at: string;
  requested_by: string;
  channels_checked: number;
  channels_updated: number;
  channels_failed: number;
  channels_skipped: number;
};

const marketplaceFollowerSyncConcurrency = 5;
let marketplaceFollowerSyncInFlight:
  | Promise<MarketplaceFollowerSyncResult>
  | undefined;

const truncateMarketplaceSyncText = (value: string | undefined, max = 500) => {
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
};

const normalizeFollowerCount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^\d]/g, ""))
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
};

const formatMarketplaceFollowerCountLabel = (count: number) => {
  if (count >= 10_000) {
    const tenThousands = count / 10_000;
    const formatted =
      tenThousands >= 100
        ? Math.round(tenThousands).toLocaleString("ko-KR")
        : tenThousands.toFixed(1).replace(/\.0$/, "");
    return `${formatted}\ub9cc`;
  }

  return `${count.toLocaleString("ko-KR")}\uba85`;
};

const formatMarketplacePersonCountLabel = (count: number) => {
  if (count >= 10_000) {
    const tenThousands = count / 10_000;
    const formatted =
      tenThousands >= 100
        ? Math.round(tenThousands).toLocaleString("ko-KR")
        : tenThousands.toFixed(1).replace(/\.0$/, "");
    return `${formatted}\ub9cc\uba85`;
  }

  return `${count.toLocaleString("ko-KR")}\uba85`;
};

const formatNaverBlogVisitorLabel = (
  count: number,
  basis: "yesterday" | "stored_5_day_average",
) =>
  basis === "yesterday"
    ? `\uc5b4\uc81c \ubc29\ubb38\uc790 ${formatMarketplacePersonCountLabel(count)}`
    : `\ucd5c\uadfc 5\uc77c \ud3c9\uade0 \ubc29\ubb38\uc790 ${formatMarketplacePersonCountLabel(
        count,
      )}`;

const buildFollowerSnapshot = (
  snapshot: Omit<MarketplaceFollowerSyncSnapshot, "checkedAt"> & {
    checkedAt?: string;
  },
): MarketplaceFollowerSyncSnapshot => ({
  ...snapshot,
  checkedAt: snapshot.checkedAt ?? new Date().toISOString(),
  error: truncateMarketplaceSyncText(snapshot.error),
});

type NaverBlogVisitorCount = {
  date: string;
  count: number;
};

const naverBlogVisitorCounterProvider = "naver_blog_public_visitor_counter";
const naverBlogVisitorAverageWindowDays = 5;
const kstOffsetMs = 9 * 60 * 60 * 1000;

const formatKstCompactDate = (date: Date, dayOffset = 0) => {
  const kstDate = new Date(date.getTime() + kstOffsetMs + dayOffset * dayMs);
  const year = kstDate.getUTCFullYear().toString().padStart(4, "0");
  const month = (kstDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = kstDate.getUTCDate().toString().padStart(2, "0");
  return `${year}${month}${day}`;
};

const getNaverBlogVisitorTargetDate = (date = new Date()) =>
  formatKstCompactDate(date, -1);

const normalizeNaverBlogVisitorCounts = (
  counts: NaverBlogVisitorCount[],
) => {
  const byDate = new Map<string, number>();
  for (const count of counts) {
    if (!normalizeDateCompact(count.date)) continue;
    if (!Number.isFinite(count.count) || count.count < 0) continue;
    byDate.set(count.date, Math.floor(count.count));
  }

  return Array.from(byDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => right.date.localeCompare(left.date));
};

const parseNaverBlogVisitorCounts = (body: string) =>
  normalizeNaverBlogVisitorCounts(
    Array.from(body.matchAll(/<visitorcnt\b[^>]*\/?>/gi))
      .map((match) => {
        const tag = match[0];
        const id = tag.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
        const count = normalizeFollowerCount(
          tag.match(/\bcnt\s*=\s*["']([^"']+)["']/i)?.[1],
        );
        const date = normalizeDateCompact(id);
        if (!date || count === undefined) return undefined;
        return { date, count };
      })
      .filter((count): count is NaverBlogVisitorCount => Boolean(count)),
  );

const readNaverBlogVisitorCountsFromMetadata = (
  metadata: Record<string, unknown> | null | undefined,
) => {
  const rawCounts = metadata?.naver_blog_daily_visitors;
  if (!Array.isArray(rawCounts)) return [];

  return normalizeNaverBlogVisitorCounts(
    rawCounts
      .map((item) => {
        if (!item || typeof item !== "object") return undefined;
        const record = item as Record<string, unknown>;
        const date = normalizeDateCompact(
          typeof record.date === "string" || typeof record.date === "number"
            ? String(record.date)
            : undefined,
        );
        const count = normalizeFollowerCount(record.count);
        if (!date || count === undefined) return undefined;
        return { date, count };
      })
      .filter((count): count is NaverBlogVisitorCount => Boolean(count)),
  );
};

const selectNaverBlogCompletedVisitorCounts = (
  counts: NaverBlogVisitorCount[],
  targetDate: string,
) =>
  normalizeNaverBlogVisitorCounts(counts)
    .filter((count) => count.date <= targetDate)
    .slice(0, naverBlogVisitorAverageWindowDays);

const calculateNaverBlogFiveDayAverage = (
  counts: NaverBlogVisitorCount[],
) => {
  const windowCounts = counts.slice(0, naverBlogVisitorAverageWindowDays);
  if (windowCounts.length < naverBlogVisitorAverageWindowDays) return undefined;
  return Math.round(
    windowCounts.reduce((total, count) => total + count.count, 0) /
      windowCounts.length,
  );
};

const buildNaverBlogStoredAverageSnapshot = ({
  channel,
  blogId,
  targetDate,
  checkedAt,
  httpStatus,
  error,
}: {
  channel: SupabaseMarketplaceInfluencerChannelRow;
  blogId: string;
  targetDate: string;
  checkedAt: string;
  httpStatus?: number;
  error: string;
}) => {
  const storedCounts = selectNaverBlogCompletedVisitorCounts(
    readNaverBlogVisitorCountsFromMetadata(channel.follower_sync_metadata),
    targetDate,
  );
  const average = calculateNaverBlogFiveDayAverage(storedCounts);
  if (average === undefined) return undefined;

  return buildFollowerSnapshot({
    status: "synced",
    provider: naverBlogVisitorCounterProvider,
    checkedAt,
    followerCount: average,
    followersLabel: formatNaverBlogVisitorLabel(average, "stored_5_day_average"),
    httpStatus,
    error,
    metadata: {
      metric: "daily_blog_visitors",
      value_basis: "stored_5_day_average",
      target_date: targetDate,
      blog_id: blogId,
      naver_blog_daily_visitors: storedCounts,
      average_window_days: naverBlogVisitorAverageWindowDays,
      source_error: error,
    },
  });
};

const fetchYoutubeFollowerSnapshot = async (
  channel: SupabaseMarketplaceInfluencerChannelRow,
): Promise<MarketplaceFollowerSyncSnapshot> => {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) {
    return buildFollowerSnapshot({
      status: "not_configured",
      provider: "youtube_data_api",
      error: "YOUTUBE_DATA_API_KEY is not configured.",
    });
  }

  const target = parseYoutubeChannelTarget(channel.url ?? "", channel.handle);
  if (!target.value) {
    return buildFollowerSnapshot({
      status: "skipped",
      provider: "youtube_data_api",
      error: "YouTube channel handle or channel id is missing.",
    });
  }

  try {
    const response = await fetchYoutubeChannelForTarget(apiKey, target, 4500);
    const item = response.payload.items?.[0];
    const followerCount = normalizeFollowerCount(item?.statistics?.subscriberCount);

    if (!response.ok) {
      return buildFollowerSnapshot({
        status: "failed",
        provider: "youtube_data_api",
        httpStatus: response.status,
        error: "YouTube Data API request failed.",
      });
    }

    if (!item) {
      return buildFollowerSnapshot({
        status: "failed",
        provider: "youtube_data_api",
        httpStatus: response.status,
        error: "YouTube channel was not found.",
      });
    }

    if (item.statistics?.hiddenSubscriberCount || followerCount === undefined) {
      return buildFollowerSnapshot({
        status: "skipped",
        provider: "youtube_data_api",
        httpStatus: response.status,
        error: "YouTube subscriber count is hidden.",
        metadata: {
          channel_id: item.id,
          title: item.snippet?.title,
          hidden_subscriber_count: item.statistics?.hiddenSubscriberCount ?? false,
        },
      });
    }

    return buildFollowerSnapshot({
      status: "synced",
      provider: "youtube_data_api",
      httpStatus: response.status,
      followerCount,
      metadata: {
        channel_id: item.id,
        title: item.snippet?.title,
        custom_url: item.snippet?.customUrl,
        video_count: normalizeFollowerCount(item.statistics?.videoCount),
      },
    });
  } catch (error) {
    return buildFollowerSnapshot({
      status: "failed",
      provider: "youtube_data_api",
      error: error instanceof Error ? error.message : "YouTube sync failed.",
    });
  }
};

const fetchInstagramFollowerSnapshot = async (
  channel: SupabaseMarketplaceInfluencerChannelRow,
): Promise<MarketplaceFollowerSyncSnapshot> => {
  const accessToken = process.env.META_GRAPH_ACCESS_TOKEN?.trim();
  const igUserId = process.env.META_IG_USER_ID?.trim();
  const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v24.0";
  const username = normalizeHandleForComparison(channel.handle).replace(
    /[^a-z0-9._]/g,
    "",
  );

  if (!accessToken || !igUserId) {
    return buildFollowerSnapshot({
      status: "not_configured",
      provider: "instagram_graph_api",
      error: "META_GRAPH_ACCESS_TOKEN/META_IG_USER_ID is not configured.",
      metadata: { username: username || undefined },
    });
  }

  if (!username) {
    return buildFollowerSnapshot({
      status: "skipped",
      provider: "instagram_graph_api",
      error: "Instagram username is missing.",
    });
  }

  try {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${igUserId}`);
    url.searchParams.set(
      "fields",
      `business_discovery.username(${username}){id,username,followers_count,media_count}`,
    );
    url.searchParams.set("access_token", accessToken);
    const response = await fetchJsonWithTimeout<{
      business_discovery?: {
        id?: string;
        username?: string;
        followers_count?: number;
        media_count?: number;
      };
      error?: unknown;
    }>(url.toString(), {}, 4500);
    const profile = response.payload.business_discovery;
    const followerCount = normalizeFollowerCount(profile?.followers_count);

    if (!response.ok) {
      return buildFollowerSnapshot({
        status: "failed",
        provider: "instagram_graph_api",
        httpStatus: response.status,
        error: "Instagram Graph API request failed.",
        metadata: { username },
      });
    }

    if (!profile || followerCount === undefined) {
      return buildFollowerSnapshot({
        status: "failed",
        provider: "instagram_graph_api",
        httpStatus: response.status,
        error: "Instagram business discovery did not return a follower count.",
        metadata: { username },
      });
    }

    return buildFollowerSnapshot({
      status: "synced",
      provider: "instagram_graph_api",
      httpStatus: response.status,
      followerCount,
      metadata: {
        id: profile.id,
        username: profile.username,
        media_count: profile.media_count,
      },
    });
  } catch (error) {
    return buildFollowerSnapshot({
      status: "failed",
      provider: "instagram_graph_api",
      error: error instanceof Error ? error.message : "Instagram sync failed.",
      metadata: { username },
    });
  }
};

const fetchTikTokFollowerSnapshot = async (
  channel: SupabaseMarketplaceInfluencerChannelRow,
): Promise<MarketplaceFollowerSyncSnapshot> => {
  const token = process.env.TIKTOK_ACCOUNT_ACCESS_TOKEN?.trim();
  const expectedHandle = normalizeHandleForComparison(channel.handle);

  if (!token) {
    return buildFollowerSnapshot({
      status: "not_configured",
      provider: "tiktok_login_kit",
      error: "TIKTOK_ACCOUNT_ACCESS_TOKEN is not configured.",
      metadata: { expected_handle: expectedHandle || undefined },
    });
  }

  try {
    const url = new URL("https://open.tiktokapis.com/v2/user/info/");
    url.searchParams.set(
      "fields",
      ["username", "display_name", "follower_count", "video_count"].join(","),
    );
    const response = await fetchJsonWithTimeout<{
      data?: {
        user?: {
          username?: string;
          display_name?: string;
          follower_count?: number;
          video_count?: number;
        };
      };
      error?: unknown;
    }>(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      4500,
    );
    const user = response.payload.data?.user;
    const userHandle = normalizeHandleForComparison(user?.username);
    const followerCount = normalizeFollowerCount(user?.follower_count);

    if (!response.ok) {
      return buildFollowerSnapshot({
        status: "failed",
        provider: "tiktok_login_kit",
        httpStatus: response.status,
        error: "TikTok user info request failed.",
        metadata: { expected_handle: expectedHandle || undefined },
      });
    }

    if (expectedHandle && userHandle && expectedHandle !== userHandle) {
      return buildFollowerSnapshot({
        status: "skipped",
        provider: "tiktok_login_kit",
        httpStatus: response.status,
        error: "TikTok token user does not match the marketplace channel handle.",
        metadata: {
          expected_handle: expectedHandle,
          token_username: userHandle,
        },
      });
    }

    if (!user || followerCount === undefined) {
      return buildFollowerSnapshot({
        status: "failed",
        provider: "tiktok_login_kit",
        httpStatus: response.status,
        error: "TikTok user info did not return a follower count.",
        metadata: { expected_handle: expectedHandle || undefined },
      });
    }

    return buildFollowerSnapshot({
      status: "synced",
      provider: "tiktok_login_kit",
      httpStatus: response.status,
      followerCount,
      metadata: {
        username: user.username,
        display_name: user.display_name,
        video_count: user.video_count,
      },
    });
  } catch (error) {
    return buildFollowerSnapshot({
      status: "failed",
      provider: "tiktok_login_kit",
      error: error instanceof Error ? error.message : "TikTok sync failed.",
      metadata: { expected_handle: expectedHandle || undefined },
    });
  }
};

const fetchNaverBlogVisitorSnapshot = async (
  channel: SupabaseMarketplaceInfluencerChannelRow,
): Promise<MarketplaceFollowerSyncSnapshot> => {
  const checkedAt = new Date().toISOString();
  const targetDate = getNaverBlogVisitorTargetDate(new Date(checkedAt));
  const blogId =
    extractNaverBlogId(channel.handle) || extractNaverBlogId(channel.url ?? undefined);

  if (!blogId) {
    return buildFollowerSnapshot({
      status: "skipped",
      provider: naverBlogVisitorCounterProvider,
      checkedAt,
      error: "Naver Blog id is missing.",
    });
  }

  try {
    const url = new URL("https://blog.naver.com/NVisitorgp4Ajax.nhn");
    url.searchParams.set("blogId", blogId);
    const response = await fetchTextWithTimeout(
      url.toString(),
      {
        headers: {
          Accept: "application/xml,text/xml,*/*",
          "User-Agent": "DirectSignMarketplaceSync/1.0",
        },
      },
      4500,
    );
    const visitorCounts = parseNaverBlogVisitorCounts(response.body);
    const completedCounts = selectNaverBlogCompletedVisitorCounts(
      visitorCounts,
      targetDate,
    );
    const targetCount = completedCounts.find((count) => count.date === targetDate);
    const fiveDayAverage = calculateNaverBlogFiveDayAverage(completedCounts);

    if (!response.ok) {
      return (
        buildNaverBlogStoredAverageSnapshot({
          channel,
          blogId,
          targetDate,
          checkedAt,
          httpStatus: response.status,
          error: "Naver Blog visitor counter request failed; showing stored five day average.",
        }) ??
        buildFollowerSnapshot({
          status: "failed",
          provider: naverBlogVisitorCounterProvider,
          checkedAt,
          httpStatus: response.status,
          error: "Naver Blog visitor counter request failed.",
          metadata: { blog_id: blogId, target_date: targetDate },
        })
      );
    }

    if (!targetCount) {
      return (
        buildNaverBlogStoredAverageSnapshot({
          channel,
          blogId,
          targetDate,
          checkedAt,
          httpStatus: response.status,
          error:
            "Naver Blog visitor counter did not include yesterday; showing stored five day average.",
        }) ??
        buildFollowerSnapshot({
          status: "failed",
          provider: naverBlogVisitorCounterProvider,
          checkedAt,
          httpStatus: response.status,
          error: "Naver Blog visitor counter did not include yesterday.",
          metadata: {
            blog_id: blogId,
            target_date: targetDate,
            naver_blog_daily_visitors: completedCounts,
          },
        })
      );
    }

    return buildFollowerSnapshot({
      status: "synced",
      provider: naverBlogVisitorCounterProvider,
      checkedAt,
      httpStatus: response.status,
      followerCount: targetCount.count,
      followersLabel: formatNaverBlogVisitorLabel(targetCount.count, "yesterday"),
      metadata: {
        metric: "daily_blog_visitors",
        value_basis: "yesterday",
        target_date: targetDate,
        blog_id: blogId,
        naver_blog_daily_visitors: completedCounts,
        average_window_days: naverBlogVisitorAverageWindowDays,
        five_day_average: fiveDayAverage ?? null,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Naver Blog visitor sync failed.";
    return (
      buildNaverBlogStoredAverageSnapshot({
        channel,
        blogId,
        targetDate,
        checkedAt,
        error: `${errorMessage}; showing stored five day average.`,
      }) ??
      buildFollowerSnapshot({
        status: "failed",
        provider: naverBlogVisitorCounterProvider,
        checkedAt,
        error: errorMessage,
        metadata: { blog_id: blogId, target_date: targetDate },
      })
    );
  }
};

const fetchMarketplaceFollowerSnapshot = (
  channel: SupabaseMarketplaceInfluencerChannelRow,
) => {
  if (channel.platform === "youtube") return fetchYoutubeFollowerSnapshot(channel);
  if (channel.platform === "instagram") return fetchInstagramFollowerSnapshot(channel);
  if (channel.platform === "tiktok") return fetchTikTokFollowerSnapshot(channel);
  if (channel.platform === "naver_blog") return fetchNaverBlogVisitorSnapshot(channel);

  return Promise.resolve(
    buildFollowerSnapshot({
      status: "skipped",
      provider: "public_url_challenge",
      error: `${channel.platform} follower sync is not supported by a configured provider.`,
    }),
  );
};

const getMarketplaceFollowerSyncChannelStatus = (
  snapshot: MarketplaceFollowerSyncSnapshot,
): NonNullable<SupabaseMarketplaceInfluencerChannelRow["follower_sync_status"]> => {
  if (snapshot.status === "synced") return "synced";
  return snapshot.status;
};

const getMarketplaceFollowerSyncEventStatus = ({
  snapshot,
  previousCount,
}: {
  snapshot: MarketplaceFollowerSyncSnapshot;
  previousCount?: number;
}): MarketplaceFollowerSyncEventStatus => {
  if (snapshot.status === "synced") {
    return previousCount === snapshot.followerCount ? "unchanged" : "updated";
  }
  return snapshot.status;
};

const isMarketplaceFollowerSyncDue = (
  channel: SupabaseMarketplaceInfluencerChannelRow,
  nowMs = Date.now(),
) => {
  if (channel.follower_sync_status !== "synced") return true;
  if (!channel.follower_count_synced_at) return true;
  const syncedAt = Date.parse(channel.follower_count_synced_at);
  const staleMs =
    channel.platform === "naver_blog"
      ? marketplaceNaverBlogVisitorSyncStaleMs
      : marketplaceFollowerSyncStaleMs;
  return !Number.isFinite(syncedAt) || nowMs - syncedAt >= staleMs;
};

const compareMarketplaceFollowerSyncQueue = (
  left: MarketplaceFollowerSyncQueueItem,
  right: MarketplaceFollowerSyncQueueItem,
) => {
  const leftSynced = left.channel.follower_count_synced_at
    ? Date.parse(left.channel.follower_count_synced_at)
    : 0;
  const rightSynced = right.channel.follower_count_synced_at
    ? Date.parse(right.channel.follower_count_synced_at)
    : 0;

  return leftSynced - rightSynced;
};

const readMarketplaceFollowerSyncQueue = async (limit: number) => {
  const { profiles, channels } = await readMarketplaceInfluencerRows(
    "?select=*&is_published=eq.true&order=updated_at.desc",
  );
  const queue = profiles.flatMap((profile) =>
    (channels.get(profile.id) ?? []).map((channel) => ({ profile, channel })),
  );

  return queue
    .filter(({ channel }) => isMarketplaceFollowerSyncDue(channel))
    .sort(compareMarketplaceFollowerSyncQueue)
    .slice(0, limit);
};

const syncMarketplaceFollowerChannel = async ({
  runId,
  item,
}: {
  runId: string;
  item: MarketplaceFollowerSyncQueueItem;
}) => {
  const snapshot = await fetchMarketplaceFollowerSnapshot(item.channel);
  const previousCount = item.channel.follower_count ?? undefined;
  const nextFollowersLabel =
    snapshot.status === "synced" && snapshot.followerCount !== undefined
      ? (snapshot.followersLabel ??
        formatMarketplaceFollowerCountLabel(snapshot.followerCount))
      : item.channel.followers_label;
  const eventStatus = getMarketplaceFollowerSyncEventStatus({
    snapshot,
    previousCount,
  });
  const channelSyncStatus = getMarketplaceFollowerSyncChannelStatus(snapshot);
  const checkedAt = snapshot.checkedAt;

  await patchSupabaseRecord(
    "marketplace_influencer_channels",
    `?id=eq.${encodeURIComponent(item.channel.id)}`,
    {
      ...(snapshot.status === "synced"
        ? {
            follower_count: snapshot.followerCount,
            followers_label: nextFollowersLabel,
            follower_count_synced_at: checkedAt,
          }
        : {}),
      follower_sync_status: channelSyncStatus,
      follower_sync_source: snapshot.provider,
      follower_sync_error: snapshot.error ?? null,
      follower_sync_metadata: {
        ...(snapshot.metadata ?? {}),
        checked_at: checkedAt,
        http_status: snapshot.httpStatus ?? null,
      },
      updated_at: checkedAt,
    },
    "Supabase marketplace follower channel sync",
  );

  return {
    event: {
      id: randomUUID(),
      run_id: runId,
      channel_id: item.channel.id,
      profile_id: item.profile.id,
      platform: item.channel.platform,
      handle: item.channel.handle,
      status: eventStatus,
      previous_follower_count: previousCount ?? null,
      follower_count: snapshot.followerCount ?? null,
      previous_followers_label: item.channel.followers_label ?? null,
      followers_label: nextFollowersLabel ?? null,
      provider: snapshot.provider,
      http_status: snapshot.httpStatus ?? null,
      error_message: snapshot.error ?? null,
      checked_at: checkedAt,
      metadata: snapshot.metadata ?? {},
    },
    snapshot,
    eventStatus,
  };
};

const runMarketplaceFollowerSyncInternal = async ({
  requestedBy,
  maxChannels = marketplaceFollowerSyncMaxChannels,
}: {
  requestedBy: string;
  maxChannels?: number;
}): Promise<MarketplaceFollowerSyncResult> => {
  if (!useSupabase) {
    throw new Error("Supabase is not configured");
  }

  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const effectiveMaxChannels = Math.max(1, Math.min(Math.floor(maxChannels), 100));

  await upsertSupabaseV2Rows("marketplace_follower_sync_runs", [
    {
      id: runId,
      requested_by: requestedBy,
      status: "running",
      started_at: startedAt,
      channels_checked: 0,
      channels_updated: 0,
      channels_failed: 0,
      channels_skipped: 0,
      metadata: {
        max_channels: effectiveMaxChannels,
        stale_days: marketplaceFollowerSyncStaleMs / dayMs,
        naver_blog_stale_days: marketplaceNaverBlogVisitorSyncStaleMs / dayMs,
      },
    },
  ]);

  try {
    const queue = await readMarketplaceFollowerSyncQueue(effectiveMaxChannels);
    const channelResults: Awaited<
      ReturnType<typeof syncMarketplaceFollowerChannel>
    >[] = [];

    for (let index = 0; index < queue.length; index += marketplaceFollowerSyncConcurrency) {
      const chunk = queue.slice(index, index + marketplaceFollowerSyncConcurrency);
      channelResults.push(
        ...(await Promise.all(
          chunk.map((item) => syncMarketplaceFollowerChannel({ runId, item })),
        )),
      );
    }

    await insertSupabaseV2Rows(
      "marketplace_follower_sync_events",
      channelResults.map((result) => result.event),
    );

    const channelsUpdated = channelResults.filter((result) =>
      ["updated", "unchanged"].includes(result.eventStatus),
    ).length;
    const channelsFailed = channelResults.filter(
      (result) => result.eventStatus === "failed",
    ).length;
    const channelsSkipped = channelResults.length - channelsUpdated - channelsFailed;
    const finishedAt = new Date().toISOString();
    const status: SupabaseMarketplaceFollowerSyncRunRow["status"] =
      channelsFailed > 0 && channelsUpdated + channelsSkipped > 0
        ? "partial_failed"
        : channelsFailed > 0
          ? "failed"
          : "completed";

    await patchSupabaseRecord(
      "marketplace_follower_sync_runs",
      `?id=eq.${encodeURIComponent(runId)}`,
      {
        status,
        finished_at: finishedAt,
        channels_checked: channelResults.length,
        channels_updated: channelsUpdated,
        channels_failed: channelsFailed,
        channels_skipped: channelsSkipped,
        metadata: {
          max_channels: effectiveMaxChannels,
          queued_channels: queue.length,
          stale_days: marketplaceFollowerSyncStaleMs / dayMs,
          naver_blog_stale_days: marketplaceNaverBlogVisitorSyncStaleMs / dayMs,
        },
      },
      "Supabase marketplace follower sync run update",
    );

    if (channelsUpdated > 0) clearPublicMarketplaceCache();

    return {
      run_id: runId,
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      requested_by: requestedBy,
      channels_checked: channelResults.length,
      channels_updated: channelsUpdated,
      channels_failed: channelsFailed,
      channels_skipped: channelsSkipped,
    };
  } catch (error) {
    clearPublicMarketplaceCache();
    const finishedAt = new Date().toISOString();
    const message = truncateMarketplaceSyncText(
      error instanceof Error ? error.message : "Marketplace follower sync failed.",
    );

    await patchSupabaseRecord(
      "marketplace_follower_sync_runs",
      `?id=eq.${encodeURIComponent(runId)}`,
      {
        status: "failed",
        finished_at: finishedAt,
        error_message: message,
      },
      "Supabase marketplace follower sync failure update",
    );

    throw error;
  }
};

const runMarketplaceFollowerSync = (options: {
  requestedBy: string;
  maxChannels?: number;
}) => {
  if (!marketplaceFollowerSyncInFlight) {
    marketplaceFollowerSyncInFlight = runMarketplaceFollowerSyncInternal(options).finally(
      () => {
        marketplaceFollowerSyncInFlight = undefined;
      },
    );
  }

  return marketplaceFollowerSyncInFlight;
};

const buildMarketplaceBrandHandle = (
  organization: SupabaseOrganizationRow,
  profile: SupabaseProfileRow,
) => {
  const source = `${organization.name || profile.company_name || profile.name || "brand"}`;
  const normalized = source
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = organization.id.replace(/-/g, "").slice(0, 6);
  const base = normalized.length >= 3 ? normalized.slice(0, 20).replace(/-+$/g, "") : "brand";

  return `${base}-${suffix}`.slice(0, 30).replace(/-+$/g, "");
};

const readAdvertiserMarketplaceBrandRow = async (
  organizationId: string,
) => {
  if (!useSupabase) return undefined;

  const rows = await readSupabaseRows<SupabaseMarketplaceBrandProfileRow>(
    "marketplace_brand_profiles",
    `?select=*&organization_id=eq.${encodeURIComponent(organizationId)}&limit=1`,
    "advertiser marketplace brand profile",
  );

  return rows[0];
};

const buildAdvertiserBrandProfileFromAuth = (
  auth: AdvertiserSession,
  organization: SupabaseOrganizationRow,
  row?: SupabaseMarketplaceBrandProfileRow,
): MarketplaceBrandProfile => {
  if (row) return mapBrandProfileRowToMarketplaceProfile(row);

  const name = organization.name || auth.profile.company_name || auth.profile.name || "광고주";

  return {
    id: stableUuid(`marketplace:brand:${organization.id}`),
    handle: buildMarketplaceBrandHandle(organization, auth.profile),
    displayName: name,
    category: "캠페인 모집",
    headline: "인플루언서 협업 캠페인을 모집합니다",
    description:
      "모집글을 등록하면 인플루언서가 캠페인 조건을 확인하고 신청할 수 있습니다.",
    location: "운영 지역 미입력",
    logoLabel: buildMarketplaceAvatarLabel(name, "BR"),
    preferredPlatforms: [],
    proposalTypes: ["sponsored_post", "product_seeding", "supporters"],
    budgetRangeLabel: "협의 가능",
    responseTimeLabel: "제안 확인 후 응답",
    statusLabel: "모집 준비",
    fitTags: ["캠페인 모집", "전자계약 가능"],
    audienceTargets: [],
    activeCampaigns: [],
    recentCreators: [],
  };
};

const readAdvertiserCampaignBoard = async (auth: AdvertiserSession) => {
  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  if (!organization) {
    return {
      organization: undefined,
      brand: undefined,
      campaigns: [] as MarketplaceBrandCampaign[],
    };
  }

  const row = await readAdvertiserMarketplaceBrandRow(organization.id);
  const brand = buildAdvertiserBrandProfileFromAuth(auth, organization, row);

  return {
    organization,
    brand,
    campaigns: brand.activeCampaigns,
  };
};

const saveAdvertiserMarketplaceBrandImage = async (
  auth: AdvertiserSession,
  file: NonNullable<ReturnType<typeof parseEvidenceFile>>,
) => {
  if (!useSupabase) {
    return {
      ok: false as const,
      status: 503,
      error: "Supabase is required for brand image upload",
    };
  }

  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  if (!organization) {
    return {
      ok: false as const,
      status: 409,
      error: "Advertiser organization is required",
    };
  }

  const imageUrl = await storeMarketplacePublicImage({
    area: "brand-logos",
    ownerId: organization.id,
    file,
  });
  const existing = await readAdvertiserMarketplaceBrandRow(organization.id);
  const currentBrand = buildAdvertiserBrandProfileFromAuth(
    auth,
    organization,
    existing,
  );
  const now = new Date().toISOString();
  const rowId = existing?.id ?? stableUuid(`marketplace:brand:${organization.id}`);
  const displayName = currentBrand.displayName || organization.name;

  await upsertSupabaseV2Rows(
    "marketplace_brand_profiles",
    [
      {
        id: rowId,
        organization_id: organization.id,
        public_handle:
          existing?.public_handle ?? buildMarketplaceBrandHandle(organization, auth.profile),
        display_name: displayName,
        category: currentBrand.category,
        headline: currentBrand.headline,
        description: currentBrand.description,
        location: currentBrand.location,
        logo_label: currentBrand.logoLabel || buildMarketplaceAvatarLabel(displayName, "BR"),
        logo_url: imageUrl,
        preferred_platforms: currentBrand.preferredPlatforms,
        proposal_types: currentBrand.proposalTypes,
        budget_range_label: currentBrand.budgetRangeLabel,
        response_time_label: currentBrand.responseTimeLabel,
        status_label: currentBrand.statusLabel,
        fit_tags: currentBrand.fitTags,
        audience_targets: currentBrand.audienceTargets,
        active_campaigns: currentBrand.activeCampaigns,
        recent_creators: currentBrand.recentCreators,
        is_published: existing?.is_published ?? currentBrand.activeCampaigns.length > 0,
        updated_at: now,
      },
    ],
    "organization_id",
  );
  clearPublicMarketplaceCache();

  const savedRow = await readAdvertiserMarketplaceBrandRow(organization.id);
  return {
    ok: true as const,
    image_url: imageUrl,
    brand: buildAdvertiserBrandProfileFromAuth(auth, organization, savedRow),
  };
};

const validateMarketplaceCampaignInput = (body: Record<string, unknown>) => {
  const title = normalizeRequiredText(body.title);
  const type = normalizeRequiredText(body.type) as CampaignProposalType;
  const applicantLimit = normalizeRequiredText(body.applicantLimit);
  const budget = normalizeRequiredText(body.budget);
  const summary = normalizeRequiredText(body.summary);
  const deadline = normalizeOptionalText(body.deadline);
  const uploadDeadline = normalizeOptionalText(body.uploadDeadline);
  const platforms = normalizeCampaignPlatforms(body.platforms, ["instagram"]);
  const deliverables = normalizeStringArrayForStorage(body.deliverables, [], 6);

  if (!title || title.length > 100) {
    return { error: "제목은 100자 이내로 입력해 주세요." };
  }
  if (!campaignProposalTypes.has(type)) {
    return { error: "광고형태를 선택해 주세요." };
  }
  if (!applicantLimit || applicantLimit.length > 40) {
    return { error: "모집인원을 40자 이내로 입력해 주세요." };
  }
  if (!budget || budget.length > 80) {
    return { error: "지급내용을 80자 이내로 입력해 주세요." };
  }
  if (!summary || summary.length > 1000) {
    return { error: "캠페인설명은 1000자 이내로 입력해 주세요." };
  }
  if (!deliverables.length) {
    return { error: "산출물을 6개 이내로 입력해 주세요." };
  }
  if (!uploadDeadline || uploadDeadline.length > 40) {
    return { error: "업로드 마감일을 40자 이내로 입력해 주세요." };
  }
  if (!deadline || deadline.length > 40) {
    return { error: "모집마감일을 40자 이내로 입력해 주세요." };
  }

  return {
    title,
    type,
    applicantLimit,
    budget,
    summary,
    deadline,
    uploadDeadline,
    platforms,
    deliverables,
  };
};

const upsertAdvertiserMarketplaceCampaign = async (
  auth: AdvertiserSession,
  body: Record<string, unknown>,
) => {
  if (!useSupabase) {
    return {
      ok: false as const,
      status: 503,
      error: "Supabase 설정이 필요합니다.",
    };
  }

  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  if (!organization) {
    return {
      ok: false as const,
      status: 409,
      error: "광고주 조직 정보를 찾을 수 없습니다.",
    };
  }

  const payload = validateMarketplaceCampaignInput(body);
  if ("error" in payload) {
    return { ok: false as const, status: 422, error: payload.error };
  }

  const existing = await readAdvertiserMarketplaceBrandRow(organization.id);
  const currentBrand = buildAdvertiserBrandProfileFromAuth(auth, organization, existing);
  const now = new Date().toISOString();
  const actor = auth.profile.email || auth.user.email || auth.profile.name;
  const campaign: MarketplaceBrandCampaign = {
    id: randomUUID(),
    title: payload.title,
    type: payload.type,
    applicantLimit: payload.applicantLimit,
    budget: payload.budget,
    summary: payload.summary,
    ...(payload.deadline ? { deadline: payload.deadline } : {}),
    uploadDeadline: payload.uploadDeadline,
    platforms: payload.platforms,
    deliverables:
      payload.deliverables.length > 0
        ? payload.deliverables
        : ["컨텐츠 산출물 협의"],
    status: "open",
    createdAt: now,
    updatedAt: now,
    statusUpdatedAt: now,
    statusUpdatedBy: actor,
    activityEvents: [
      {
        id: randomUUID(),
        actor,
        action: "campaign_created",
        description: "캠페인 모집글이 공개되었습니다.",
        createdAt: now,
      },
    ],
  };
  const campaigns = normalizeBrandCampaigns(
    [campaign, ...currentBrand.activeCampaigns],
    8,
  );
  const preferredPlatforms = Array.from(
    new Set([
      ...payload.platforms,
      ...currentBrand.preferredPlatforms,
    ]),
  );
  const proposalTypes = Array.from(
    new Set([payload.type, ...currentBrand.proposalTypes]),
  );
  const rowId = existing?.id ?? stableUuid(`marketplace:brand:${organization.id}`);
  const displayName = currentBrand.displayName || organization.name;
  const category =
    currentBrand.category === "캠페인 모집" && payload.deliverables.length > 0
      ? payload.deliverables[0]
      : currentBrand.category;

  await upsertSupabaseV2Rows(
    "marketplace_brand_profiles",
    [
      {
        id: rowId,
        organization_id: organization.id,
        public_handle:
          existing?.public_handle ?? buildMarketplaceBrandHandle(organization, auth.profile),
        display_name: displayName,
        category,
        headline: payload.title,
        description: payload.summary,
        location: currentBrand.location || "운영 지역 미입력",
        logo_label: currentBrand.logoLabel || buildMarketplaceAvatarLabel(displayName, "BR"),
        logo_url: currentBrand.logoUrl ?? null,
        preferred_platforms: preferredPlatforms,
        proposal_types: proposalTypes,
        budget_range_label: payload.budget,
        response_time_label: currentBrand.responseTimeLabel || "제안 확인 후 응답",
        status_label: "모집 중",
        fit_tags:
          payload.deliverables.length > 0
            ? payload.deliverables
            : currentBrand.fitTags.length > 0
              ? currentBrand.fitTags
              : ["캠페인 모집"],
        audience_targets: currentBrand.audienceTargets,
        active_campaigns: campaigns,
        recent_creators: currentBrand.recentCreators,
        is_published: true,
        updated_at: now,
      },
    ],
    "organization_id",
  );
  clearPublicMarketplaceCache();

  const savedRow = await readAdvertiserMarketplaceBrandRow(organization.id);
  const brand = buildAdvertiserBrandProfileFromAuth(auth, organization, savedRow);

  return {
    ok: true as const,
    brand,
    campaign,
    campaigns: brand.activeCampaigns,
  };
};

const updateAdvertiserMarketplaceCampaignStatus = async (
  auth: AdvertiserSession,
  campaignId: string,
  body: Record<string, unknown>,
) => {
  if (!useSupabase) {
    return {
      ok: false as const,
      status: 503,
      error: "Supabase 설정이 필요합니다.",
    };
  }

  const requestedStatus = normalizeOptionalText(body.status);
  if (!isAdvertiserCampaignStatusUpdate(requestedStatus)) {
    return {
      ok: false as const,
      status: 422,
      error: "변경할 캠페인 상태를 확인해 주세요.",
    };
  }

  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  if (!organization) {
    return {
      ok: false as const,
      status: 409,
      error: "광고주 조직 정보를 찾을 수 없습니다.",
    };
  }

  const existing = await readAdvertiserMarketplaceBrandRow(organization.id);
  if (!existing) {
    return {
      ok: false as const,
      status: 404,
      error: "캠페인 브랜드 프로필을 찾을 수 없습니다.",
    };
  }

  const currentBrand = buildAdvertiserBrandProfileFromAuth(auth, organization, existing);
  const campaignIndex = currentBrand.activeCampaigns.findIndex(
    (campaign) => campaign.id === campaignId,
  );

  if (campaignIndex < 0) {
    return {
      ok: false as const,
      status: 404,
      error: "변경할 캠페인을 찾을 수 없습니다.",
    };
  }

  const now = new Date().toISOString();
  const actor = auth.profile.email || auth.user.email || auth.profile.name;
  const currentCampaign = currentBrand.activeCampaigns[campaignIndex];
  const {
    closedAt: _closedAt,
    endedAt: _endedAt,
    reopenedAt: _reopenedAt,
    statusUpdatedAt: _statusUpdatedAt,
    statusUpdatedBy: _statusUpdatedBy,
    updatedAt: _updatedAt,
    ...baseCampaign
  } = currentCampaign;
  const statusFields =
    requestedStatus === "open"
      ? { reopenedAt: now }
      : requestedStatus === "ended"
        ? { endedAt: now }
        : { closedAt: now };
  const statusLabel =
    requestedStatus === "open"
      ? "모집중"
      : requestedStatus === "closed"
        ? "모집 종료"
        : "종료";
  const activityEvents = [
    ...(currentCampaign.activityEvents ?? []),
    {
      id: randomUUID(),
      actor,
      action: "campaign_status_updated",
      description: `캠페인 상태를 ${statusLabel} 상태로 변경했습니다.`,
      createdAt: now,
    },
  ].slice(-80);
  const updatedCampaign: MarketplaceBrandCampaign = {
    ...baseCampaign,
    status: requestedStatus,
    updatedAt: now,
    statusUpdatedAt: now,
    statusUpdatedBy: actor,
    activityEvents,
    ...statusFields,
  };
  const activeCampaigns = currentBrand.activeCampaigns.map((campaign, index) =>
    index === campaignIndex ? updatedCampaign : campaign,
  );
  const campaigns = normalizeBrandCampaigns(activeCampaigns, 20);

  await patchSupabaseRecord(
    "marketplace_brand_profiles",
    `?id=eq.${encodeURIComponent(existing.id)}`,
    {
      active_campaigns: campaigns,
      status_label:
        requestedStatus === "open"
          ? "모집 중"
          : requestedStatus === "closed"
            ? "모집 종료"
            : "운영 종료",
      updated_at: now,
    },
    "Supabase advertiser campaign status update",
  );
  clearPublicMarketplaceCache();

  const savedRow = await readAdvertiserMarketplaceBrandRow(organization.id);
  const brand = buildAdvertiserBrandProfileFromAuth(auth, organization, savedRow);
  const savedCampaign =
    brand.activeCampaigns.find((campaign) => campaign.id === campaignId) ??
    updatedCampaign;

  return {
    ok: true as const,
    brand,
    campaign: savedCampaign,
    campaigns: brand.activeCampaigns,
  };
};

const buildMarketplaceCampaignSnapshot = (
  campaign: MarketplaceCampaignPost,
): MarketplaceCampaignSnapshot => ({
  id: campaign.id,
  title: campaign.title,
  type: campaign.type,
  budget: campaign.budget,
  ...(campaign.applicantLimit ? { applicantLimit: campaign.applicantLimit } : {}),
  ...(campaign.summary ? { summary: campaign.summary } : {}),
  ...(campaign.deadline ? { deadline: campaign.deadline } : {}),
  ...(campaign.uploadDeadline ? { uploadDeadline: campaign.uploadDeadline } : {}),
  ...(campaign.platforms?.length ? { platforms: campaign.platforms } : {}),
  ...(campaign.deliverables?.length ? { deliverables: campaign.deliverables } : {}),
  brandId: campaign.brandId,
  brandHandle: campaign.brandHandle,
  brandName: campaign.brandName,
  brandCategory: campaign.brandCategory,
});

const normalizeMarketplaceCampaignSnapshot = (
  value: unknown,
): MarketplaceCampaignSnapshot | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const id = normalizeRequiredText(record.id);
  const title = normalizeRequiredText(record.title);
  const type = normalizeRequiredText(record.type) as CampaignProposalType;
  const budget = normalizeRequiredText(record.budget);
  const applicantLimit = normalizeOptionalText(
    record.applicantLimit ?? record.applicant_limit,
  );
  const brandId = normalizeRequiredText(record.brandId);
  const brandHandle = normalizeRequiredText(record.brandHandle);
  const brandName = normalizeRequiredText(record.brandName);
  const summary = normalizeOptionalText(record.summary);
  const deadline = normalizeOptionalText(record.deadline);
  const uploadDeadline = normalizeOptionalText(
    record.uploadDeadline ?? record.upload_deadline,
  );
  const brandCategory = normalizeOptionalText(record.brandCategory);
  const platforms = normalizeCampaignPlatforms(record.platforms);
  const deliverables = normalizeStringArrayForStorage(record.deliverables, [], 8);

  if (
    !id ||
    !title ||
    !budget ||
    !brandId ||
    !brandHandle ||
    !brandName ||
    !campaignProposalTypes.has(type)
  ) {
    return undefined;
  }

  return {
    id,
    title,
    type,
    budget,
    ...(applicantLimit ? { applicantLimit } : {}),
    ...(summary ? { summary } : {}),
    ...(deadline ? { deadline } : {}),
    ...(uploadDeadline ? { uploadDeadline } : {}),
    ...(platforms.length ? { platforms } : {}),
    ...(deliverables.length ? { deliverables } : {}),
    brandId,
    brandHandle,
    brandName,
    ...(brandCategory ? { brandCategory } : {}),
  };
};

const findMarketplaceCampaignPostById = async (campaignId: string) => {
  const campaigns = buildMarketplaceCampaignPosts(await readMarketplaceBrandProfiles());
  return campaigns.find((campaign) => campaign.id === campaignId);
};

const readInfluencerMarketplaceProfileForApplication = async (
  auth: InfluencerSession,
) => {
  if (!useSupabase) return undefined;

  const { profiles, channels } = await readMarketplaceInfluencerRows(
    `?select=*&owner_profile_id=eq.${encodeURIComponent(auth.profile.id)}&limit=1`,
  );
  const profile = profiles[0];
  if (!profile) return undefined;

  return mapInfluencerProfileRowToMarketplaceProfile(
    profile,
    channels.get(profile.id) ?? [],
  );
};

const buildCampaignApplicationSummary = (campaign: MarketplaceCampaignPost) => {
  const lines = [
    `캠페인 신청: ${campaign.title}`,
    campaign.summary ? `모집 설명: ${campaign.summary}` : undefined,
    campaign.applicantLimit ? `모집인원: ${campaign.applicantLimit}` : undefined,
    `지급내용: ${campaign.budget}`,
    campaign.deliverables?.length
      ? `산출물: ${campaign.deliverables.join(", ")}`
      : undefined,
    campaign.platformLabels.length
      ? `플랫폼: ${campaign.platformLabels.join(", ")}`
      : undefined,
    campaign.uploadDeadline ? `업로드 마감일: ${campaign.uploadDeadline}` : undefined,
    campaign.deadline ? `모집마감일: ${campaign.deadline}` : undefined,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n").slice(0, 1500);
};

const submitMarketplaceCampaignApplication = async (
  auth: InfluencerSession,
  campaignId: string,
) => {
  if (!useSupabase) {
    return {
      ok: false as const,
      status: 503,
      error: "Supabase 설정이 필요합니다.",
    };
  }

  const campaign = await findMarketplaceCampaignPostById(campaignId);
  if (!campaign || !isUuid(campaign.brandId)) {
    return {
      ok: false as const,
      status: 404,
      error: "신청 가능한 캠페인을 찾을 수 없습니다.",
    };
  }

  const existingRows = await readMarketplaceProposalRows(
    `?select=*&direction=eq.influencer_to_brand&sender_profile_id=eq.${encodeURIComponent(
      auth.profile.id,
    )}&target_brand_profile_id=eq.${encodeURIComponent(
      campaign.brandId,
    )}&campaign_id=eq.${encodeURIComponent(campaign.id)}&status=in.(submitted,reviewed,converted_to_contract)&limit=1`,
    "marketplace campaign application duplicate check",
  );

  if (existingRows[0]) {
    return {
      ok: true as const,
      alreadySubmitted: true,
      proposal: existingRows[0],
    };
  }

  const publicProfile = await readInfluencerMarketplaceProfileForApplication(auth);
  const senderName =
    publicProfile?.displayName ||
    auth.profile.name ||
    auth.user.email ||
    "인플루언서";
  const senderIntro =
    publicProfile?.headline ||
    auth.profile.activity_categories?.join(", ") ||
    "캠페인을 확인하고 신청했습니다.";
  const now = new Date().toISOString();
  const proposalId = randomUUID();
  const rows = await insertSupabaseRowsReturning<SupabaseMarketplaceContactProposalRow>(
    "marketplace_contact_proposals",
    [
      {
        id: proposalId,
        direction: "influencer_to_brand",
        target_brand_profile_id: campaign.brandId,
        target_handle: campaign.brandHandle,
        target_display_name: campaign.brandName,
        sender_profile_id: auth.profile.id,
        sender_name: senderName,
        sender_intro: senderIntro,
        proposal_type: campaign.type,
        proposal_summary: buildCampaignApplicationSummary(campaign),
        campaign_id: campaign.id,
        campaign_snapshot: buildMarketplaceCampaignSnapshot(campaign),
        status: "submitted",
        created_at: now,
        updated_at: now,
      },
    ],
    "marketplace campaign application",
  );
  invalidateAdvertiserDashboardCache();
  invalidateInfluencerDashboardCache();

  return {
    ok: true as const,
    alreadySubmitted: false,
    proposal: rows[0],
  };
};

const saveInfluencerMarketplaceAvatar = async (
  auth: InfluencerSession,
  file: NonNullable<ReturnType<typeof parseEvidenceFile>>,
) => {
  if (!useSupabase) {
    return {
      ok: false as const,
      status: 503,
      error: "Supabase is required for influencer image upload",
    };
  }

  const imageUrl = await storeMarketplacePublicImage({
    area: "influencer-avatars",
    ownerId: auth.profile.id,
    file,
  });

  await patchSupabaseRecord(
    "profiles",
    `?id=eq.${encodeURIComponent(auth.profile.id)}`,
    { avatar_url: imageUrl },
    "Supabase influencer avatar update",
  );

  const { profiles } = await readMarketplaceInfluencerRows(
    `?select=*&owner_profile_id=eq.${encodeURIComponent(auth.profile.id)}&limit=1`,
  );
  const publicProfile = profiles[0];

  if (publicProfile) {
    await patchSupabaseRecord(
      "marketplace_influencer_profiles",
      `?id=eq.${encodeURIComponent(publicProfile.id)}`,
      { avatar_url: imageUrl, updated_at: new Date().toISOString() },
      "Supabase influencer marketplace avatar update",
    );
  }

  clearPublicMarketplaceCache();
  invalidateInfluencerDashboardCache();

  return {
    ok: true as const,
    image_url: imageUrl,
  };
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

const normalizeAlternatePublicProfileHandle = (value: unknown) => {
  const raw = normalizeOptionalText(value);
  if (!raw) return "";
  return normalizePublicProfileHandle(raw).replace(/\s+/g, "_");
};

const readMarketplaceInfluencerProfileByHandle = async (handle: string) => {
  if (!useSupabase) return undefined;

  const rows = await readSupabaseRows<SupabaseMarketplaceInfluencerHandleRow>(
    "marketplace_influencer_profiles",
    `?select=id,owner_profile_id,public_handle,display_name,created_at,updated_at&public_handle=eq.${encodeURIComponent(
      handle,
    )}&limit=1`,
    "marketplace influencer handle lookup",
  );

  return rows[0];
};

const findInfluencerPublicHandleConflict = async (
  handle: string,
  ownerProfileId: string,
) => {
  const existing = await readMarketplaceInfluencerProfileByHandle(handle);
  return existing && existing.owner_profile_id !== ownerProfileId
    ? existing
    : undefined;
};

const appendPublicHandleSuffix = (baseHandle: string, suffix: string) => {
  const maxBaseLength = Math.max(1, 30 - suffix.length);
  const base = baseHandle.slice(0, maxBaseLength).replace(/[_.-]+$/g, "");
  const candidate = `${base}${suffix}`;
  return getPublicProfileHandleError(candidate) ? undefined : candidate;
};

const buildAlternatePublicProfileHandleSuggestions = (
  baseHandle: string,
  ownerProfileId: string,
) => {
  const ownerSuffix = ownerProfileId.replace(/-/g, "").slice(0, 4);
  const suffixes = [
    ownerSuffix ? `_${ownerSuffix}` : "_2",
    ".official",
    "_creator",
    "_2",
  ];

  return Array.from(
    new Set(
      suffixes
        .map((suffix) => appendPublicHandleSuffix(baseHandle, suffix))
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 3);
};

const buildPublicProfileHandleConflictResult = ({
  handle,
  ownerProfileId,
  error,
}: {
  handle: string;
  ownerProfileId: string;
  error?: string;
}) => ({
  ok: false as const,
  status: 409,
  code: "public_profile_handle_conflict",
  error:
    error ??
    "이미 사용 중인 플랫폼 ID입니다. 다른 공개 주소를 입력하거나 이의신청을 접수해 주세요.",
  handle,
  profile_url: formatInfluencerPublicProfileUrl(handle),
  can_customize_handle: true,
  suggested_handles: buildAlternatePublicProfileHandleSuggestions(
    handle,
    ownerProfileId,
  ),
});

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
  const approvedPlatforms = dashboard.verification.approved_platforms;
  const automaticHandle = getAutomaticPublicProfileHandle(approvedPlatforms) ?? "";
  const handleError = automaticHandle
    ? getPublicProfileHandleError(automaticHandle)
    : "플랫폼 인증을 먼저 완료하면 첫 등록 플랫폼 ID로 공개 주소가 자동 생성됩니다.";

  if (handleError) {
    return { ok: false as const, status: 422, error: handleError };
  }

  const automaticHandleConflict = await findInfluencerPublicHandleConflict(
    automaticHandle,
    profile.id,
  );
  let handle = automaticHandle;

  if (automaticHandleConflict) {
    const alternateHandle = normalizeAlternatePublicProfileHandle(
      body.alternateHandle,
    );

    if (!alternateHandle) {
      return buildPublicProfileHandleConflictResult({
        handle: automaticHandle,
        ownerProfileId: profile.id,
      });
    }

    const alternateHandleError = getPublicProfileHandleError(alternateHandle);
    if (alternateHandleError) {
      return {
        ok: false as const,
        status: 422,
        code: "public_profile_alternate_handle_invalid",
        error: alternateHandleError,
        handle: alternateHandle,
      };
    }

    if (alternateHandle === automaticHandle) {
      return buildPublicProfileHandleConflictResult({
        handle: automaticHandle,
        ownerProfileId: profile.id,
      });
    }

    const alternateHandleConflict = await findInfluencerPublicHandleConflict(
      alternateHandle,
      profile.id,
    );

    if (alternateHandleConflict) {
      return buildPublicProfileHandleConflictResult({
        handle: alternateHandle,
        ownerProfileId: profile.id,
        error: "입력한 공개 주소가 이미 사용 중입니다. 다른 주소를 입력해 주세요.",
      });
    }

    handle = alternateHandle;
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
  const existingProfile = await readStoredInfluencerPublicProfile(profile.id);
  const avatarUrl =
    normalizeMarketplacePublicImageUrl(body.avatarUrl ?? body.avatar_url) ??
    existingProfile?.avatarUrl ??
    profile.avatar_url ??
    defaults.avatarUrl;
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
    ...(avatarUrl ? { avatarUrl } : {}),
    categories,
    brandFit,
    collaborationTypes,
    startingPriceLabel:
      normalizeRequiredText(body.startingPriceLabel) ||
      defaults.startingPriceLabel,
    responseTimeLabel:
      normalizeRequiredText(body.responseTimeLabel) ||
      defaults.responseTimeLabel,
    platforms: approvedPlatforms.map((platform) => ({
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
        avatar_url: savedProfile.avatarUrl ?? null,
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
          "컨텐츠 사용 범위와 희망 일정을 제안에 포함해 주세요.",
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
  clearPublicMarketplaceCache();

  return { ok: true as const, profile: savedProfile };
};

const submitInfluencerPublicHandleAppeal = async ({
  authUser,
  profile,
  body,
  request,
}: {
  authUser: SupabaseAuthUser;
  profile: SupabaseProfileRow;
  body: Record<string, unknown>;
  request: express.Request;
}) => {
  const dashboard = await buildInfluencerDashboard(authUser);
  const approvedPlatforms = dashboard.verification.approved_platforms;
  const primaryPlatform = approvedPlatforms[0];
  const automaticHandle = getAutomaticPublicProfileHandle(approvedPlatforms) ?? "";
  const handleError = automaticHandle
    ? getPublicProfileHandleError(automaticHandle)
    : "플랫폼 인증을 먼저 완료하면 공개 주소 이의신청을 접수할 수 있습니다.";

  if (handleError || !primaryPlatform) {
    return {
      ok: false as const,
      status: 422,
      error: handleError ?? "공개 주소 이의신청에 사용할 인증 플랫폼이 없습니다.",
    };
  }

  const conflict = await findInfluencerPublicHandleConflict(
    automaticHandle,
    profile.id,
  );

  if (!conflict) {
    return {
      ok: false as const,
      status: 409,
      error: "현재 공개 주소 충돌이 없어 이의신청을 접수할 수 없습니다.",
    };
  }

  const existingAppeal = (await readVerificationRequests()).find(
    (record) =>
      record.status === "pending" &&
      record.profile_id === profile.id &&
      record.evidence_snapshot_json?.request_type ===
        "public_profile_handle_claim" &&
      record.evidence_snapshot_json?.claimed_handle === automaticHandle,
  );

  if (existingAppeal) {
    return {
      ok: true as const,
      request: existingAppeal,
      already_submitted: true,
    };
  }

  const now = new Date().toISOString();
  const submittedName =
    normalizeRequiredText(profile.name) ||
    normalizeRequiredText(authUser.email) ||
    "인플루언서";
  const submittedEmail = normalizeOptionalText(profile.email ?? authUser.email);
  const alternateHandle = normalizeAlternatePublicProfileHandle(
    body.alternateHandle,
  );
  const reason =
    normalizeOptionalText(body.reason) ||
    `${formatInfluencerPublicProfileUrl(
      automaticHandle,
    )} 주소가 이미 사용 중이지만 신청자의 인증 플랫폼 ID와 일치합니다.`;

  const record: VerificationRequestRecord = {
    id: randomUUID(),
    target_type: "influencer_account",
    target_id: profile.id,
    verification_type: "platform_account",
    status: "pending",
    profile_id: profile.id,
    subject_name: `${submittedName} 공개 주소 이의신청`,
    submitted_by_name: submittedName,
    submitted_by_email: submittedEmail,
    platform: primaryPlatform.platform,
    platform_handle: primaryPlatform.handle,
    platform_url: primaryPlatform.url,
    ownership_verification_method: "screenshot_review",
    ownership_check_status: "not_run",
    evidence_snapshot_json: {
      request_type: "public_profile_handle_claim",
      claim_type: "platform_handle_conflict",
      claimed_handle: automaticHandle,
      claimed_profile_url: buildInfluencerPublicProfileUrl(automaticHandle),
      requested_alternate_handle: alternateHandle || null,
      current_owner_profile_id: conflict.owner_profile_id,
      current_marketplace_profile_id: conflict.id,
      requested_by_profile_id: profile.id,
      submitted_from: "public_profile_settings",
      platform: primaryPlatform.platform,
      platform_handle: primaryPlatform.handle,
      platform_url: primaryPlatform.url,
      reason,
      created_at: now,
    },
    note: reason,
    submitted_ip: getClientIp(request),
    submitted_user_agent: request.header("user-agent") ?? "unknown",
    created_at: now,
    updated_at: now,
  };

  return {
    ok: true as const,
    request: await insertVerificationRequest(record),
    already_submitted: false,
  };
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
      ? getInfluencerPublicProfilePath(row.target_handle)
      : `/brands/${row.target_handle}`;
  }

  if (
    role === "advertiser" &&
    row.direction === "influencer_to_brand" &&
    row.sender_influencer_handle
  ) {
    return getInfluencerPublicProfilePath(row.sender_influencer_handle);
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

const getMarketplaceMessageBucket = (
  role: MarketplaceInboxRole,
  row: SupabaseMarketplaceContactProposalRow,
): MarketplaceMessageBucket => {
  const isAdvertiserInbox =
    role === "advertiser" && row.direction === "influencer_to_brand";
  const isInfluencerInbox =
    role === "influencer" && row.direction === "advertiser_to_influencer";
  return isAdvertiserInbox || isInfluencerInbox ? "inbox" : "sent";
};

const mapMarketplaceProposalToMessage = (
  row: SupabaseMarketplaceContactProposalRow,
  role: MarketplaceInboxRole,
): MarketplaceMessageThread => {
  const bucket = getMarketplaceMessageBucket(role, row);
  const isAdvertiserApplicant =
    role === "advertiser" && row.direction === "influencer_to_brand";
  const counterpartName =
    bucket === "inbox"
      ? isAdvertiserApplicant
        ? row.sender_influencer_display_name ?? row.sender_name
        : row.sender_name
      : row.target_display_name;

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
    counterpartAvatarLabel: isAdvertiserApplicant
      ? row.sender_influencer_avatar_label ?? undefined
      : undefined,
    counterpartAvatarUrl: isAdvertiserApplicant
      ? row.sender_influencer_avatar_url ?? undefined
      : undefined,
    counterpartIntro: isAdvertiserApplicant
      ? row.sender_influencer_headline ?? row.sender_intro
      : row.sender_intro,
    counterpartHref: getMarketplaceCounterpartHref(role, row, bucket),
    counterpartCategories: isAdvertiserApplicant
      ? row.sender_influencer_categories ?? undefined
      : undefined,
    platforms: row.marketplace_platforms ?? [],
    proposalType: row.proposal_type,
    proposalTypeLabel: getProposalTypeLabel(row.proposal_type),
    proposalSummary: row.proposal_summary,
    campaignId: row.campaign_id ?? undefined,
    campaignTitle:
      normalizeMarketplaceCampaignSnapshot(row.campaign_snapshot)?.title ?? undefined,
    convertedContractId: row.converted_contract_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const buildMarketplaceMessageSummary = (
  role: MarketplaceInboxRole,
  rows: SupabaseMarketplaceContactProposalRow[],
) =>
  rows.reduce((acc, row) => {
    const bucket = getMarketplaceMessageBucket(role, row);
    if (bucket === "inbox") acc.inboxCount += 1;
    if (bucket === "sent") acc.sentCount += 1;
    if (bucket === "inbox" && row.status === "submitted") acc.unreadCount += 1;
    if (row.status === "submitted") acc.submittedCount += 1;
    if (row.status === "reviewed") acc.reviewedCount += 1;
    if (row.status === "converted_to_contract") acc.convertedCount += 1;
    if (row.status === "closed") acc.closedCount += 1;
    return acc;
  }, emptyMarketplaceMessageSummary());

const isOneToOneMarketplaceMessageProposal = (
  row: SupabaseMarketplaceContactProposalRow,
) =>
  !(
    row.direction === "influencer_to_brand" &&
    hasText(row.campaign_id ?? undefined)
  );

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
  const summary = buildMarketplaceMessageSummary(role, rows);

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
    `?select=owner_profile_id,public_handle,avatar_label,avatar_url,display_name,headline,categories&owner_profile_id=in.${postgrestInFilter(
      senderProfileIds,
    )}`,
    "sender influencer public profile handles",
  );
  const profileByOwnerId = new Map(
    profileRows.map((profile) => [profile.owner_profile_id, profile]),
  );

  return rows.map((row) => ({
    ...row,
    sender_influencer_handle: row.sender_profile_id
      ? profileByOwnerId.get(row.sender_profile_id)?.public_handle ?? null
      : null,
    sender_influencer_avatar_label: row.sender_profile_id
      ? profileByOwnerId.get(row.sender_profile_id)?.avatar_label ?? null
      : null,
    sender_influencer_avatar_url: row.sender_profile_id
      ? profileByOwnerId.get(row.sender_profile_id)?.avatar_url ?? null
      : null,
    sender_influencer_display_name: row.sender_profile_id
      ? profileByOwnerId.get(row.sender_profile_id)?.display_name ?? null
      : null,
    sender_influencer_headline: row.sender_profile_id
      ? profileByOwnerId.get(row.sender_profile_id)?.headline ?? null
      : null,
    sender_influencer_categories: row.sender_profile_id
      ? profileByOwnerId.get(row.sender_profile_id)?.categories ?? null
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

const addPlatformInfoToMarketplaceProposals = async (
  rows: SupabaseMarketplaceContactProposalRow[],
) => {
  if (!useSupabase || rows.length === 0) return rows;

  const targetInfluencerProfileIds = Array.from(
    new Set(
      rows
        .filter((row) => row.direction === "advertiser_to_influencer")
        .map((row) => row.target_influencer_profile_id)
        .filter((id): id is string => hasText(id ?? undefined)),
    ),
  );
  const senderProfileIds = Array.from(
    new Set(
      rows
        .filter((row) => row.direction === "influencer_to_brand")
        .map((row) => row.sender_profile_id)
        .filter((id): id is string => hasText(id ?? undefined)),
    ),
  );
  const targetBrandProfileIds = Array.from(
    new Set(
      rows
        .filter((row) => row.direction === "influencer_to_brand")
        .map((row) => row.target_brand_profile_id)
        .filter((id): id is string => hasText(id ?? undefined)),
    ),
  );

  const senderInfluencerProfilesPromise =
    senderProfileIds.length > 0
      ? readSupabaseRows<SupabaseMarketplaceInfluencerProfileRow>(
          "marketplace_influencer_profiles",
          `?select=id,owner_profile_id&owner_profile_id=in.${postgrestInFilter(
            senderProfileIds,
          )}`,
          "marketplace proposal sender influencer profiles",
        )
      : Promise.resolve([] as SupabaseMarketplaceInfluencerProfileRow[]);
  const brandRowsPromise =
    targetBrandProfileIds.length > 0
      ? readSupabaseRows<Pick<SupabaseMarketplaceBrandProfileRow, "id" | "preferred_platforms">>(
          "marketplace_brand_profiles",
          `?select=id,preferred_platforms&id=in.${postgrestInFilter(
            targetBrandProfileIds,
          )}`,
          "marketplace proposal brand platform preferences",
        )
      : Promise.resolve(
          [] as Array<
            Pick<SupabaseMarketplaceBrandProfileRow, "id" | "preferred_platforms">
          >,
        );
  const senderInfluencerProfiles = await senderInfluencerProfilesPromise;
  const senderInfluencerProfileIdByOwnerId = new Map(
    senderInfluencerProfiles.map((profile) => [profile.owner_profile_id, profile.id]),
  );
  const influencerProfileIds = Array.from(
    new Set([
      ...targetInfluencerProfileIds,
      ...senderInfluencerProfiles.map((profile) => profile.id),
    ]),
  );
  const channelRowsPromise =
    influencerProfileIds.length > 0
      ? readSupabaseRows<SupabaseMarketplaceInfluencerChannelRow>(
          "marketplace_influencer_channels",
          `?select=profile_id,platform,label,handle,url,followers_label,sort_order&profile_id=in.${postgrestInFilter(
            influencerProfileIds,
          )}&order=sort_order.asc`,
          "marketplace proposal platform channels",
        )
      : Promise.resolve([] as SupabaseMarketplaceInfluencerChannelRow[]);
  const [channelRows, brandRows] = await Promise.all([
    channelRowsPromise,
    brandRowsPromise,
  ]);
  const channelsByProfileId = new Map<
    string,
    MarketplaceMessageThread["platforms"]
  >();
  for (const channel of channelRows) {
    const channels = channelsByProfileId.get(channel.profile_id) ?? [];
    channels.push({
      platform: channel.platform,
      label: channel.label || platformLabels[channel.platform],
      handle: channel.handle,
      url: channel.url ?? undefined,
      followersLabel: channel.followers_label ?? undefined,
    });
    channelsByProfileId.set(channel.profile_id, channels);
  }

  const brandPlatformsById = new Map(
    brandRows.map((brand) => [
      brand.id,
      (brand.preferred_platforms ?? []).map((platform) => ({
        platform,
        label: platformLabels[platform],
      })),
    ]),
  );

  return rows.map((row) => {
    const influencerProfileId =
      row.direction === "advertiser_to_influencer"
        ? row.target_influencer_profile_id
        : row.sender_profile_id
          ? senderInfluencerProfileIdByOwnerId.get(row.sender_profile_id)
          : undefined;
    const influencerPlatforms = influencerProfileId
      ? channelsByProfileId.get(influencerProfileId) ?? []
      : [];
    const brandPlatforms = row.target_brand_profile_id
      ? brandPlatformsById.get(row.target_brand_profile_id) ?? []
      : [];

    return {
      ...row,
      marketplace_platforms:
        influencerPlatforms.length > 0
          ? influencerPlatforms
          : brandPlatforms.length > 0
            ? brandPlatforms
            : [{ platform: "other" as InfluencerPlatform, label: platformLabels.other }],
    };
  });
};

const readMarketplaceMessagesForAdvertiser = async (
  auth: AdvertiserSession,
  options: { summaryOnly?: boolean } = {},
): Promise<MarketplaceMessagesResponse> => {
  const messageProposalSelect = options.summaryOnly
    ? "id,direction,status,campaign_id,created_at"
    : "*";
  const sentRowsPromise = readMarketplaceProposalRows(
    `?select=${messageProposalSelect}&direction=eq.advertiser_to_influencer&sender_profile_id=eq.${encodeURIComponent(
      auth.profile.id,
    )}&order=created_at.desc`,
    "advertiser marketplace sent proposals",
  );
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
  const incomingRowsPromise =
    brandIds.length > 0
      ? readMarketplaceProposalRows(
          `?select=${messageProposalSelect}&direction=eq.influencer_to_brand&target_brand_profile_id=in.${postgrestInFilter(
            brandIds,
          )}&order=created_at.desc`,
          "advertiser marketplace incoming proposals",
        )
      : Promise.resolve([] as SupabaseMarketplaceContactProposalRow[]);
  const [incomingRows, sentRows] = await Promise.all([
    incomingRowsPromise,
    sentRowsPromise,
  ]);
  const rows = uniqueRowsById([...incomingRows, ...sentRows]);

  if (options.summaryOnly) {
    return {
      role: "advertiser",
      threads: [],
      summary: buildMarketplaceMessageSummary(
        "advertiser",
        rows.filter(isOneToOneMarketplaceMessageProposal),
      ),
    };
  }

  return buildMarketplaceMessagesResponse(
    "advertiser",
    await addPlatformInfoToMarketplaceProposals(
      uniqueRowsById([
        ...(await addSenderInfluencerHandlesToMarketplaceProposals(incomingRows)),
        ...sentRows,
      ]),
    ),
  );
};

const readMarketplaceMessagesForInfluencer = async (
  auth: InfluencerSession,
  options: { summaryOnly?: boolean } = {},
): Promise<MarketplaceMessagesResponse> => {
  const messageProposalSelect = options.summaryOnly
    ? "id,direction,status,campaign_id,created_at"
    : "*";
  const profileRowsPromise = useSupabase
    ? readSupabaseRows<SupabaseMarketplaceInfluencerProfileRow>(
        "marketplace_influencer_profiles",
        `?select=id,public_handle&owner_profile_id=eq.${encodeURIComponent(
          auth.profile.id,
        )}`,
        "influencer marketplace public profiles",
      )
    : Promise.resolve([] as SupabaseMarketplaceInfluencerProfileRow[]);
  const sentRowsPromise = readMarketplaceProposalRows(
    `?select=${messageProposalSelect}&direction=eq.influencer_to_brand&sender_profile_id=eq.${encodeURIComponent(
      auth.profile.id,
    )}&order=created_at.desc`,
    "influencer marketplace sent proposals",
  );
  const profileRows = await profileRowsPromise;
  const publicProfileIds = profileRows.map((row) => row.id).filter(Boolean);
  const incomingRowsPromise =
    publicProfileIds.length > 0
      ? readMarketplaceProposalRows(
          `?select=${messageProposalSelect}&direction=eq.advertiser_to_influencer&target_influencer_profile_id=in.${postgrestInFilter(
            publicProfileIds,
          )}&order=created_at.desc`,
          "influencer marketplace incoming proposals",
        )
      : Promise.resolve([] as SupabaseMarketplaceContactProposalRow[]);
  const [incomingRows, sentRows] = await Promise.all([
    incomingRowsPromise,
    sentRowsPromise,
  ]);
  const rows = uniqueRowsById([...incomingRows, ...sentRows]);

  if (options.summaryOnly) {
    return {
      role: "influencer",
      threads: [],
      summary: buildMarketplaceMessageSummary(
        "influencer",
        rows.filter(isOneToOneMarketplaceMessageProposal),
      ),
    };
  }

  return buildMarketplaceMessagesResponse(
    "influencer",
    await addPlatformInfoToMarketplaceProposals(
      uniqueRowsById([
        ...(await addSenderBrandHandlesToMarketplaceProposals(incomingRows)),
        ...sentRows,
      ]),
    ),
  );
};

const readSupabaseLegacyContractRows = async (
  querySuffix: string,
  label: string,
): Promise<SupabaseLegacyContractProjection[]> => {
  let response = await fetchSupabase(
    supabaseLegacyTable,
    `?select=id,contract,share_token,campaign_name,post_link${querySuffix}`,
  );

  if (!response.ok) {
    const errorMessage = await parseSupabaseError(response);
    if (!isMissingLegacyCampaignColumnError(errorMessage)) {
      throw new Error(
        `Supabase ${label} read failed (${response.status}): ${errorMessage}`,
      );
    }
    response = await fetchSupabase(
      supabaseLegacyTable,
      `?select=id,contract,share_token${querySuffix}`,
    );
  }

  await assertSupabaseOk(response, `Supabase ${label} read`);

  return (await response.json()) as SupabaseLegacyContractProjection[];
};

const restoreSupabaseLegacyContractRows = (
  rows: SupabaseLegacyContractProjection[],
) =>
  rows
    .map(restoreLegacyContractFromSupabase)
    .filter((contract): contract is Contract => Boolean(contract?.id));

const readSupabaseStoreFromRemote = async (): Promise<ContractStoreFile> => {
  const rows = await readSupabaseLegacyContractRows(
    "&order=updated_at.desc",
    "legacy",
  );
  return normalizeStore({
    contracts: restoreSupabaseLegacyContractRows(rows),
  });
};

const readAdvertiserScopedSupabaseContracts = async (
  auth: AdvertiserSession,
): Promise<Contract[] | undefined> => {
  if (!useSupabase) return undefined;

  const profileEmail = normalizeEmail(auth.profile.email ?? auth.user.email ?? "");

  try {
    const rowsByAdvertiserId = await readSupabaseLegacyContractRows(
      `&advertiser_id=eq.${encodeURIComponent(
        auth.profile.id,
      )}&order=updated_at.desc`,
      "advertiser scoped legacy",
    );

    if (rowsByAdvertiserId.length > 0 || !hasText(profileEmail)) {
      return restoreSupabaseLegacyContractRows(rowsByAdvertiserId).filter(
        (contract) => canAdvertiserAccessLegacyContract(auth, contract),
      );
    }

    const rows = uniqueRowsById(
      await readSupabaseLegacyContractRows(
        `&contract->advertiser_info->>manager=eq.${encodeURIComponent(
          profileEmail,
        )}&order=updated_at.desc`,
        "advertiser manager legacy",
      ),
    );
    return restoreSupabaseLegacyContractRows(rows).filter((contract) =>
      canAdvertiserAccessLegacyContract(auth, contract),
    );
  } catch (error) {
    console.warn(
      `[${productName}] advertiser scoped contract read fell back to full store: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return undefined;
  }
};

const readSupabaseStore = async (): Promise<ContractStoreFile> => {
  const cachedStore = readSupabaseContractStoreCache();
  if (cachedStore) return cachedStore;

  if (supabaseContractStoreInflight) return supabaseContractStoreInflight;

  supabaseContractStoreInflight = readSupabaseStoreFromRemote()
    .then((store) => {
      rememberSupabaseContractStoreCache(store);
      return cloneContractStore(store);
    })
    .finally(() => {
      supabaseContractStoreInflight = undefined;
    });

  return supabaseContractStoreInflight;
};

const readSupabaseLegacyContract = async (
  contractId: string,
): Promise<Contract | undefined> => {
  if (!useSupabase || !hasText(contractId)) return undefined;

  let response = await fetchSupabase(
    supabaseLegacyTable,
    `?select=contract,share_token,campaign_name,post_link&id=eq.${encodeURIComponent(contractId)}&limit=1`,
  );

  if (!response.ok) {
    const errorMessage = await parseSupabaseError(response);
    if (!isMissingLegacyCampaignColumnError(errorMessage)) {
      throw new Error(
        `Supabase legacy contract read failed (${response.status}): ${errorMessage}`,
      );
    }
    response = await fetchSupabase(
      supabaseLegacyTable,
      `?select=contract,share_token&id=eq.${encodeURIComponent(contractId)}&limit=1`,
    );
  }

  await assertSupabaseOk(response, "Supabase legacy contract read");

  const rows = (await response.json()) as Array<
    Pick<SupabaseContractRow, "contract" | "share_token"> &
      Partial<Pick<SupabaseContractRow, "campaign_name" | "post_link">>
  >;
  const row = rows[0];

  if (!row) return undefined;

  const contract = restoreLegacyContractFromSupabase(row);
  return contract?.id ? normalizeContract(contract) : undefined;
};

const upsertSupabaseContracts = async (contracts: Contract[]) => {
  if (contracts.length === 0) return;

  const rows = contracts.map((contract) => toSupabaseRow(contract));
  let response = await fetchSupabase(supabaseLegacyTable, "?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const errorMessage = await parseSupabaseError(response);
    if (!isMissingLegacyCampaignColumnError(errorMessage)) {
      throw new Error(
        `Supabase legacy write failed (${response.status}): ${errorMessage}`,
      );
    }
    response = await fetchSupabase(supabaseLegacyTable, "?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(
        rows.map(({ campaign_name: _campaignName, post_link: _postLink, ...row }) => row),
      ),
    });
  }

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
        contract.status === "SIGNED" || contract.status === "CLOSED"
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
        contract.status === "SIGNED" || contract.status === "CLOSED"
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
  const platformIdByPlatform = new Map(
    platformRows.map((row) => [row.platform, row.id] as const),
  );

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
      locked_at:
        contract.status === "SIGNED" || contract.status === "CLOSED"
          ? toIsoDateTime(contract.updated_at)
          : undefined,
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

  const deliverableRows = buildContractDeliverableRequirementRows(contract, {
    platformIdByPlatform,
  });

  await upsertSupabaseV2Rows(
    "deliverable_requirements",
    deliverableRows.map((row) => ({ ...row })) as Array<Record<string, unknown>>,
  );

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
  if (hasText(contract.post_link) && !isSafeHttpUrl(contract.post_link)) {
    return "Submitted post link must be an http(s) URL";
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

  if (contract.advertiser_trust) {
    if (
      contract.advertiser_trust.risk_level &&
      !advertiserTrustRiskLevels.has(contract.advertiser_trust.risk_level)
    ) {
      return "Invalid advertiser trust risk level";
    }
    if (
      typeof contract.advertiser_trust.risk_score === "number" &&
      (
        !Number.isFinite(contract.advertiser_trust.risk_score) ||
        contract.advertiser_trust.risk_score < 0 ||
        contract.advertiser_trust.risk_score > 100
      )
    ) {
      return "Invalid advertiser trust risk score";
    }
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

  if (isFixedCampaignContract(existing)) {
    if (incoming.status === "NEGOTIATING") {
      return "Campaign recruitment contracts cannot enter negotiation";
    }

    if (
      incoming.clauses.some(
        (clause) =>
          clause.status === "MODIFICATION_REQUESTED" ||
          clause.status === "DELETION_REQUESTED",
      )
    ) {
      return "Campaign recruitment terms are fixed and cannot be modified by request";
    }

    const appendedEvents = (incoming.audit_events ?? []).slice(
      existing?.audit_events?.length ?? 0,
    );
    if (
      appendedEvents.some(
        (event) =>
          event.action.includes("수정") ||
          event.action.includes("삭제") ||
          event.description.includes("수정") ||
          event.description.includes("삭제"),
      )
    ) {
      return "Campaign recruitment contracts only allow term confirmation, not negotiation";
    }
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

  if (!jsonEqual(incoming.advertiser_trust, existing.advertiser_trust)) {
    return "Advertiser trust metadata cannot be changed by influencer";
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

  if (incoming.status === "CLOSED" && existing.status !== "CLOSED") {
    return "Closed status must be created through the contract close endpoint";
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

  if (existing.status === "CLOSED") {
    if (incoming.status !== existing.status) {
      return "Closed contracts cannot be reopened";
    }

    if (!jsonEqual(incomingAuditEvents, existingAuditEvents)) {
      return "Closed contract audit history is locked";
    }

    if (!jsonEqual(incoming, existing)) {
      return "Closed contracts cannot be modified";
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

const readSupabaseVerificationRequestsFromRemote = async () => {
  const response = await fetchSupabase(
    "verification_requests",
    "?select=*&order=created_at.desc",
  );

  await assertSupabaseOk(response, "Supabase verification read");

  const rows = (await response.json()) as VerificationRequestRecord[];
  return rows.map(normalizeVerificationRequest);
};

const readSupabaseVerificationRequests = async () => {
  const cachedRequests = readSupabaseVerificationRequestCache();
  if (cachedRequests) return cachedRequests;

  if (supabaseVerificationRequestInflight) {
    return supabaseVerificationRequestInflight;
  }

  supabaseVerificationRequestInflight = readSupabaseVerificationRequestsFromRemote()
    .then((requests) => {
      rememberSupabaseVerificationRequestCache(requests);
      return cloneVerificationRequests(requests);
    })
    .finally(() => {
      supabaseVerificationRequestInflight = undefined;
    });

  return supabaseVerificationRequestInflight;
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

  if (table === supabaseLegacyTable) {
    invalidateSupabaseContractStoreCache();
    invalidateAdvertiserDashboardCache();
  }
  if (table === "verification_requests") {
    invalidateSupabaseVerificationRequestCache();
    invalidateAdvertiserDashboardCache();
  }
  if (table === "organizations" || table === "organization_members") {
    invalidateOrganizationCache();
    invalidateAdvertiserDashboardCache();
  }
  if (
    table === "profiles" ||
    table === "marketplace_influencer_profiles" ||
    table === "marketplace_brand_profiles"
  ) {
    clearPublicMarketplaceCache();
    invalidateAdvertiserDashboardCache();
    invalidateInfluencerDashboardCache();
  }
  if (
    table === "contracts" ||
    table.startsWith("contract_") ||
    table.startsWith("deliverable") ||
    table === "verification_requests" ||
    table === "marketplace_contact_proposals"
  ) {
    invalidateAdvertiserDashboardCache();
    invalidateInfluencerDashboardCache();
  }
};

const marketplacePlatformToContractPlatform = (
  platform: InfluencerPlatform,
): ContractPlatformValue => {
  const platforms: Record<InfluencerPlatform, ContractPlatformValue> = {
    instagram: "INSTAGRAM",
    youtube: "YOUTUBE",
    tiktok: "TIKTOK",
    naver_blog: "NAVER_BLOG",
    other: "OTHER",
  };

  return platforms[platform];
};

const proposalTypeToContractType = (
  type: CampaignProposalType,
): Contract["type"] => {
  if (type === "ppl") return "PPL";
  if (type === "group_buy") return "공동구매";
  return "협찬";
};

const safeMarketplaceProposalChannelUrl = (
  row: SupabaseMarketplaceContactProposalRow,
) => {
  const platformUrl = row.marketplace_platforms?.find((platform) =>
    isSafeHttpUrl(platform.url),
  )?.url;
  if (platformUrl) return platformUrl;

  const handle = row.sender_influencer_handle ?? normalizePublicProfileHandle(row.sender_name);
  const profileUrl = buildInfluencerPublicProfileUrl(handle);
  return isSafeHttpUrl(profileUrl) ? profileUrl : "https://yeollock.me";
};

const buildMarketplaceCampaignDraftClauses = (
  snapshot: MarketplaceCampaignSnapshot,
  _row: SupabaseMarketplaceContactProposalRow,
): Contract["clauses"] => {
  const platforms =
    snapshot.platforms?.map((platform) => platformLabels[platform]).join(", ") ||
    "모집글 조건";
  const deliverables =
    snapshot.deliverables?.filter(hasText).join(", ") ||
    "모집글 조건";
  const supportersClauses: Contract["clauses"] =
    snapshot.type === "supporters"
      ? [
          {
            clause_id: "campaign_supporters_product_mission",
            category: "제품 제공 및 미션",
            content: `광고주는 서포터즈 활동을 위해 "${snapshot.budget}"에 기재된 제품 또는 제품 제공 조건을 제공한다. 인플루언서는 제공 제품을 직접 사용한 뒤 다음 산출물을 기한 내 게시 또는 제출한다: ${deliverables}.`,
            status: "APPROVED",
            history: [],
          },
          {
            clause_id: "campaign_supporters_resale_ban",
            category: "재판매 금지",
            content:
              "인플루언서는 제공받은 제품을 재판매, 양도, 교환, 환불 신청, 현금화 등 캠페인 목적 외로 처분할 수 없다. 재판매 또는 그 시도가 확인되면 서포터즈 활동 자격은 자동 박탈되며 광고주는 모집글 또는 계약서에 기재된 제품 제공비를 청구할 수 있다.",
            status: "APPROVED",
            history: [],
          },
          {
            clause_id: "campaign_supporters_posting_mission",
            category: "게시 유지 및 미션 이행",
            content:
              "인플루언서는 게시한 컨텐츠를 모집글 또는 계약서에 기재된 유지 기간 동안 공개 상태로 유지한다. 유지 기간이 별도로 기재되지 않은 경우 삭제, 비공개 전환, 주요 내용 수정은 광고주와 사전에 합의한다. 미션 불이행, 무단 삭제, 광고 표시 누락 등으로 캠페인 목적 달성이 어려운 경우 광고주는 제품 제공비 청구를 요청할 수 있다.",
            status: "APPROVED",
            history: [],
          },
        ]
      : [];

  return [
    {
      clause_id: "campaign_application_scope",
      category: "캠페인 범위",
      content: [
        `캠페인명: ${snapshot.title}`,
        snapshot.summary ? `모집 설명: ${snapshot.summary}` : undefined,
        snapshot.applicantLimit ? `모집인원: ${snapshot.applicantLimit}` : undefined,
        snapshot.deadline ? `모집마감일: ${snapshot.deadline}` : undefined,
        snapshot.uploadDeadline
          ? `업로드 마감일: ${snapshot.uploadDeadline}`
          : undefined,
        `브랜드: ${snapshot.brandName}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
      status: "APPROVED",
      history: [],
    },
    {
      clause_id: "campaign_application_deliverables",
      category: "산출물 및 플랫폼",
      content: `인플루언서는 ${platforms} 채널에서 다음 산출물을 제공한다: ${deliverables}. 컨텐츠 제출 마감일은 ${
        snapshot.uploadDeadline ?? "모집글 조건"
      } 기준으로 한다.`,
      status: "APPROVED",
      history: [],
    },
    {
      clause_id: "campaign_application_payment",
      category: "지급 조건",
      content:
        snapshot.type === "supporters"
          ? `본 서포터즈 캠페인의 지급 조건은 "${snapshot.budget}"을 기준으로 한다. 제품 제공은 캠페인 미션 이행을 전제로 한다.`
          : `본 캠페인의 예산 또는 지급 조건은 "${snapshot.budget}"을 기준으로 한다.`,
      status: "APPROVED",
      history: [],
    },
    ...supportersClauses,
    {
      clause_id: "campaign_application_review",
      category: "광고 표시 및 검수",
      content:
        "컨텐츠에는 관계 법령과 플랫폼 정책에 맞는 광고 표시를 포함한다. 광고주는 모집글에 명시한 산출물과 제출 기한을 기준으로 컨텐츠를 검수한다.",
      status: "APPROVED",
      history: [],
    },
  ];
};

const resolveMarketplaceCampaignSnapshotForProposal = async (
  row: SupabaseMarketplaceContactProposalRow,
) => {
  const storedSnapshot = normalizeMarketplaceCampaignSnapshot(row.campaign_snapshot);
  if (storedSnapshot) return storedSnapshot;

  if (row.campaign_id) {
    const campaign = await findMarketplaceCampaignPostById(row.campaign_id);
    if (campaign) return buildMarketplaceCampaignSnapshot(campaign);
  }

  return {
    id: row.campaign_id ?? row.id,
    title:
      row.proposal_summary
        .split("\n")[0]
        ?.replace(/^캠페인 신청:\s*/, "")
        .trim() || `${row.target_display_name} 캠페인`,
    type: row.proposal_type,
    budget: "협의 가능",
    summary: row.proposal_summary,
    brandId: row.target_brand_profile_id ?? "",
    brandHandle: row.target_handle,
    brandName: row.target_display_name,
  } satisfies MarketplaceCampaignSnapshot;
};

const readMarketplaceProposalForAdvertiserAcceptance = async (
  auth: AdvertiserSession,
  proposalId: string,
) => {
  if (!useSupabase) {
    return {
      ok: false as const,
      status: 503,
      error: "Supabase 설정이 필요합니다.",
    };
  }

  const organization = await readDefaultOrganizationForProfile(auth.profile.id);
  if (!organization) {
    return {
      ok: false as const,
      status: 409,
      error: "광고주 조직 정보를 찾을 수 없습니다.",
    };
  }

  const brandRow = await readAdvertiserMarketplaceBrandRow(organization.id);
  if (!brandRow) {
    return {
      ok: false as const,
      status: 409,
      error: "캠페인 브랜드 프로필을 찾을 수 없습니다.",
    };
  }

  const proposalRows = await readMarketplaceProposalRows(
    `?select=*&id=eq.${encodeURIComponent(proposalId)}&limit=1`,
    "marketplace proposal acceptance lookup",
  );
  const proposal = proposalRows[0];

  if (!proposal) {
    return {
      ok: false as const,
      status: 404,
      error: "신청 내역을 찾을 수 없습니다.",
    };
  }

  if (
    proposal.direction !== "influencer_to_brand" ||
    proposal.target_brand_profile_id !== brandRow.id
  ) {
    return {
      ok: false as const,
      status: 403,
      error: "이 신청을 수락할 권한이 없습니다.",
    };
  }

  const [withSenderHandle] = await addSenderInfluencerHandlesToMarketplaceProposals([
    proposal,
  ]);
  const [enrichedProposal] = await addPlatformInfoToMarketplaceProposals([
    withSenderHandle,
  ]);

  return {
    ok: true as const,
    organization,
    brand: mapBrandProfileRowToMarketplaceProfile(brandRow),
    proposal: enrichedProposal,
  };
};

const createDraftContractFromMarketplaceApplication = async (
  auth: AdvertiserSession,
  proposalId: string,
) => {
  const acceptance = await readMarketplaceProposalForAdvertiserAcceptance(
    auth,
    proposalId,
  );

  if (!acceptance.ok) {
    return {
      ok: false as const,
      status: acceptance.status,
      error: acceptance.error,
    };
  }

  const { organization, brand, proposal } = acceptance;
  if (proposal.status === "closed") {
    return {
      ok: false as const,
      status: 409,
      error: "종료된 신청은 계약으로 전환할 수 없습니다.",
    };
  }

  if (proposal.converted_contract_id) {
    const existing = await readContractWriteContext(proposal.converted_contract_id);
    if (existing.existingContract) {
      return {
        ok: true as const,
        status: 200,
        contract: existing.existingContract,
        alreadyConverted: true,
      };
    }
  }

  const snapshot = await resolveMarketplaceCampaignSnapshotForProposal(proposal);
  const senderProfile = proposal.sender_profile_id
    ? await readProfileByUserId(proposal.sender_profile_id)
    : undefined;
  const now = new Date().toISOString();
  const contractId = randomUUID();
  const platforms =
    snapshot.platforms && snapshot.platforms.length > 0
      ? snapshot.platforms.map(marketplacePlatformToContractPlatform)
      : proposal.marketplace_platforms?.map((platform) =>
          marketplacePlatformToContractPlatform(platform.platform),
        ) ?? ["OTHER"];
  const uniquePlatforms = Array.from(new Set(platforms));
  const channelUrl = safeMarketplaceProposalChannelUrl(proposal);
  const influencerContact =
    senderProfile?.email || proposal.sender_influencer_handle || "계약 작성 단계에서 확인";
  const contract: Contract = {
    id: contractId,
    advertiser_id: auth.profile.id,
    advertiser_info: {
      name: organization.name || brand.displayName,
      manager: auth.profile.email || auth.user.email || auth.profile.name,
    },
    type: proposalTypeToContractType(snapshot.type),
    status: "DRAFT",
    title: `${snapshot.title} 계약서 초안`,
    influencer_info: {
      name: proposal.sender_name,
      channel_url: channelUrl,
      contact: influencerContact,
    },
    campaign: {
      source: "marketplace_campaign",
      fixed_terms: true,
      marketplace_campaign_id: snapshot.id,
      source_application_id: proposal.id,
      applicant_limit: snapshot.applicantLimit,
      budget: snapshot.budget,
      deadline: snapshot.deadline,
      upload_due_at: snapshot.uploadDeadline ?? snapshot.deadline,
      platforms: uniquePlatforms,
      deliverables:
        snapshot.deliverables && snapshot.deliverables.length > 0
          ? snapshot.deliverables
          : [getProposalTypeLabel(snapshot.type)],
    },
    workflow: createWorkflow("DRAFT", {
      last_message:
        "계약이 생성되었습니다. 공유 링크를 발급하고 서명을 요청하세요.",
    }),
    evidence: createEvidence({
      share_token_status: "not_issued",
      audit_ready: false,
      pdf_status: "not_ready",
    }),
    audit_events: [
      {
        id: randomUUID(),
        actor: "advertiser",
        action: "campaign_application_accepted",
        description: "광고주가 캠페인 신청을 수락해 계약이 생성되었습니다.",
        created_at: now,
      },
    ],
    clauses: buildMarketplaceCampaignDraftClauses(snapshot, proposal),
    created_at: now,
    updated_at: now,
  };

  const validationError = validateContractPayload(contract);
  if (validationError) {
    return {
      ok: false as const,
      status: 422,
      error: validationError,
    };
  }

  const { store, existingIndex } = await readContractWriteContext(contract.id);
  await writeStore(mergeContractIntoStore(store, existingIndex, contract));
  await patchSupabaseRecord(
    "marketplace_contact_proposals",
    `?id=eq.${encodeURIComponent(proposal.id)}`,
    {
      status: "converted_to_contract",
      converted_contract_id: contract.id,
      updated_at: now,
    },
    "Supabase marketplace proposal contract conversion",
  );

  return {
    ok: true as const,
    status: 201,
    contract,
    alreadyConverted: false,
  };
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
    invalidateSupabaseVerificationRequestCache();
    invalidateAdvertiserDashboardCache();
    invalidateInfluencerDashboardCache();
    await applyVerificationStatusSideEffects(insertedRecord);
    await enqueueVerificationOperationalAlert(insertedRecord);
    return insertedRecord;
  }

  const verificationRequests = await readVerificationRequests();
  await writeVerificationRequests([normalizedRecord, ...verificationRequests]);
  await enqueueVerificationOperationalAlert(normalizedRecord);
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
    invalidateSupabaseVerificationRequestCache();
    invalidateAdvertiserDashboardCache();
    invalidateInfluencerDashboardCache();
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

const updateVerificationRequestAutomation = async (
  record: VerificationRequestRecord,
  updates: Partial<VerificationRequestRecord>,
) => {
  const updatedRecord = normalizeVerificationRequest({
    ...record,
    ...updates,
    updated_at: updates.updated_at ?? new Date().toISOString(),
  });

  if (useSupabase) {
    const response = await fetchSupabase(
      "verification_requests",
      `?id=eq.${encodeURIComponent(record.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(updates),
      },
    );

    await assertSupabaseOk(response, "Supabase verification automation update");
    const rows = (await response.json()) as VerificationRequestRecord[];
    const savedRecord = rows[0] ? normalizeVerificationRequest(rows[0]) : updatedRecord;
    invalidateSupabaseVerificationRequestCache();
    invalidateAdvertiserDashboardCache();
    invalidateInfluencerDashboardCache();
    await applyVerificationStatusSideEffects(savedRecord);
    await enqueueVerificationOperationalAlert(savedRecord);
    return savedRecord;
  }

  const verificationRequests = await readVerificationRequests();
  await writeVerificationRequests(
    verificationRequests.map((item) =>
      item.id === record.id ? updatedRecord : item,
    ),
  );
  await enqueueVerificationOperationalAlert(updatedRecord);
  return updatedRecord;
};

const rerunVerificationAutomation = async (
  record: VerificationRequestRecord,
) => {
  const checkedAt = new Date().toISOString();
  const existingSnapshot = record.evidence_snapshot_json ?? {};

  if (record.target_type === "advertiser_organization") {
    if (!record.business_registration_number) {
      throw new Error("Business registration number is missing");
    }

    const result = await runBusinessRegistrationAutomationCheck(
      record.business_registration_number,
      {
        businessStartDate: normalizeOptionalText(
          existingSnapshot.business_start_date,
        ),
        representativeName: record.representative_name,
        subjectName: record.subject_name,
      },
    );
    const autoApprove =
      record.status === "pending" && shouldAutoApproveBusinessVerification(result);
    const nextSnapshot = {
      ...existingSnapshot,
      automation: {
        ...((existingSnapshot.automation as Record<string, unknown> | undefined) ?? {}),
        business_registration: result,
      },
    };
    const updatedRecord = await updateVerificationRequestAutomation(record, {
      evidence_snapshot_json: nextSnapshot,
      ...(autoApprove
        ? {
            status: "approved" as VerificationStatus,
            reviewer_note:
              "Auto-approved by NTS business status/validation automation.",
            reviewed_by_name: `${productName} automation`,
            reviewed_at: checkedAt,
          }
        : {}),
      updated_at: checkedAt,
    });

    return { record: updatedRecord, automation: result };
  }

  if (record.target_type === "influencer_account") {
    if (
      !record.platform ||
      !record.platform_handle ||
      !record.platform_url ||
      !record.ownership_challenge_code
    ) {
      throw new Error("Platform verification request is missing required fields");
    }

    const result = await runPlatformAccountAutomationCheck({
      platform: record.platform,
      platformHandle: record.platform_handle,
      platformUrl: record.platform_url,
      proofUrl: record.ownership_challenge_url ?? record.platform_url,
      ownershipMethod:
        record.ownership_verification_method ?? "screenshot_review",
      challengeCode: record.ownership_challenge_code,
    });
    const ownershipCheck =
      result.ownership_check ??
      ({
        status: buildAutomationOwnershipStatus(result.status),
        checked_at: result.checked_at,
        http_status: result.http_status,
      } satisfies {
        status: OwnershipCheckStatus;
        checked_at: string;
        http_status?: number;
      });
    const autoApprove =
      record.status === "pending" && shouldAutoApprovePlatformVerification(result);
    const existingOwnershipVerification =
      (existingSnapshot.ownership_verification as
        | Record<string, unknown>
        | undefined) ?? {};
    const existingAutomation =
      (existingOwnershipVerification.automation as
        | Record<string, unknown>
        | undefined) ?? {};
    const nextSnapshot = {
      ...existingSnapshot,
      ownership_verification: {
        ...existingOwnershipVerification,
        automation: {
          ...existingAutomation,
          platform_account: result,
          ownership_challenge: ownershipCheck,
        },
      },
    };
    const updatedRecord = await updateVerificationRequestAutomation(record, {
      evidence_snapshot_json: nextSnapshot,
      ownership_check_status: ownershipCheck.status,
      ownership_checked_at: ownershipCheck.checked_at,
      ...(autoApprove
        ? {
            status: "approved" as VerificationStatus,
            reviewer_note: "Auto-approved by platform ownership automation.",
            reviewed_by_name: `${productName} automation`,
            reviewed_at: checkedAt,
          }
        : {}),
      updated_at: checkedAt,
    });

    return { record: updatedRecord, automation: result };
  }

  throw new Error("Unsupported verification target type");
};

const verifyMetaWebhookSignature = (request: express.Request) => {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret) return false;
  const signature = request.header("x-hub-signature-256");
  const rawBody = (request as express.Request & { rawBody?: Buffer }).rawBody;
  if (!signature?.startsWith("sha256=") || !rawBody) return false;

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const extractInstagramDmChallengeEvents = (body: unknown) => {
  const events: Array<{
    challengeCode: string;
    senderId?: string;
    messageId?: string;
    receivedAt: string;
  }> = [];
  const entries = Array.isArray((body as { entry?: unknown[] })?.entry)
    ? ((body as { entry: unknown[] }).entry)
    : [];

  for (const entry of entries) {
    const messaging = Array.isArray((entry as { messaging?: unknown[] })?.messaging)
      ? ((entry as { messaging: unknown[] }).messaging)
      : [];

    for (const item of messaging) {
      const message = (item as { message?: { text?: unknown; mid?: unknown } }).message;
      const text = normalizeRequiredText(message?.text).toUpperCase();
      const match = text.match(/DS-[A-Z0-9]{4}-[A-Z0-9]{4}/);
      if (!match) continue;

      events.push({
        challengeCode: match[0],
        senderId: normalizeOptionalText(
          (item as { sender?: { id?: unknown } }).sender?.id,
        ),
        messageId: normalizeOptionalText(message?.mid),
        receivedAt: new Date().toISOString(),
      });
    }
  }

  return events;
};

const applyInstagramDmChallengeEvent = async (event: {
  challengeCode: string;
  senderId?: string;
  messageId?: string;
  receivedAt: string;
}) => {
  const records = await readVerificationRequests();
  const record = records
    .filter(
      (item) =>
        item.target_type === "influencer_account" &&
        item.platform === "instagram" &&
        item.status === "pending" &&
        item.ownership_challenge_code === event.challengeCode,
    )
    .sort((a, b) => parseDateDescending(a.created_at, b.created_at))[0];

  if (!record) return undefined;

  const existingSnapshot = record.evidence_snapshot_json ?? {};
  const dmAutomation: VerificationAutomationResult = {
    provider: "instagram_messaging_webhook",
    configured: true,
    mode: "webhook_ready",
    status: "matched",
    checked_at: event.receivedAt,
    message: "Instagram inbound DM contained the pending challenge code.",
    matched_fields: ["messaging.message.text"],
    ownership_check: {
      status: "matched",
      checked_at: event.receivedAt,
    },
    profile: {
      sender_id_hash: event.senderId ? sha256Hex(event.senderId) : undefined,
      message_id_hash: event.messageId ? sha256Hex(event.messageId) : undefined,
    },
  };
  const autoApprove = shouldAutoApprovePlatformVerification(dmAutomation);
  const nextSnapshot = {
    ...existingSnapshot,
    ownership_verification: {
      ...((existingSnapshot.ownership_verification as
        | Record<string, unknown>
        | undefined) ?? {}),
      automation: {
        ...(((existingSnapshot.ownership_verification as
          | Record<string, unknown>
          | undefined)?.automation as Record<string, unknown> | undefined) ?? {}),
        instagram_dm: dmAutomation,
      },
    },
  };

  return updateVerificationRequestAutomation(record, {
    evidence_snapshot_json: nextSnapshot,
    ownership_check_status: "matched",
    ownership_checked_at: event.receivedAt,
    ...(autoApprove
      ? {
          status: "approved" as VerificationStatus,
          reviewer_note:
            "Auto-approved by inbound Instagram DM challenge automation.",
          reviewed_by_name: `${productName} automation`,
          reviewed_at: event.receivedAt,
        }
      : {}),
    updated_at: event.receivedAt,
  });
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

const parseDateAscending = (a: string, b: string) => {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
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

const buildApprovedInfluencerPlatforms = (
  requests: VerificationRequestRecord[],
): InfluencerDashboardResponse["verification"]["approved_platforms"] =>
  [...requests]
    .filter((request) => request.status === "approved" && request.platform && request.platform_handle)
    .sort((a, b) => parseDateAscending(a.created_at, b.created_at))
    .map((request) => ({
      platform: request.platform!,
      handle: request.platform_handle!,
      url: request.platform_url,
      approved_at: request.reviewed_at,
    }));

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
    organization,
    subjectName:
      organization?.name ??
      auth.profile.company_name ??
      auth.profile.name ??
      "Advertiser",
    submittedByName: auth.profile.name,
    submittedByEmail: auth.profile.email ?? auth.user.email ?? "",
  };
};

type AdvertiserVerificationContext = Awaited<
  ReturnType<typeof buildAdvertiserVerificationContext>
>;

const readAdvertiserScopedVerificationRequests = async (
  auth: AdvertiserSession,
  context: AdvertiserVerificationContext,
) => {
  if (!useSupabase) return readVerificationRequests();

  const organization = context.organization;
  const targetIds = Array.from(
    new Set(
      [
        context.targetId,
        auth.profile.id,
        organization?.id,
      ].filter((value): value is string => hasText(value)),
    ),
  );
  const orFilters = [
    targetIds.length > 0
      ? `target_id.in.${postgrestInFilter(targetIds)}`
      : undefined,
    `profile_id.eq.${encodeURIComponent(auth.profile.id)}`,
    hasText(organization?.id)
      ? `organization_id.eq.${encodeURIComponent(organization.id)}`
      : undefined,
    hasText(organization?.business_verification_request_id)
      ? `id.eq.${encodeURIComponent(organization.business_verification_request_id)}`
      : undefined,
  ].filter((value): value is string => hasText(value));

  try {
    const rows = await readSupabaseRows<VerificationRequestRecord>(
      "verification_requests",
      `?select=*&target_type=eq.advertiser_organization&verification_type=eq.business_registration_certificate&or=(${orFilters.join(
        ",",
      )})&order=created_at.desc`,
      "advertiser scoped verification requests",
    );
    return rows.map(normalizeVerificationRequest);
  } catch (error) {
    console.warn(
      `[${productName}] advertiser scoped verification read fell back to full store: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return readVerificationRequests();
  }
};

const buildAdvertiserScopedVerificationSummary = async (
  auth: AdvertiserSession,
) => {
  const context = await buildAdvertiserVerificationContext(auth);
  const organization = context.organization;
  const requests = await readAdvertiserScopedVerificationRequests(auth, context);
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
  const influencerLatest = [...requests].sort((a, b) =>
    parseDateDescending(a.created_at, b.created_at),
  )[0];
  const status = deriveVerificationStatus(
    requests,
    auth.profile.verification_status ?? "not_submitted",
  );
  const approvedPlatforms = buildApprovedInfluencerPlatforms(requests);

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

const maskBusinessRegistrationNumber = (value: string | undefined) => {
  const digits = normalizeBusinessRegistrationNumber(value ?? "");
  if (digits.length !== 10) return undefined;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-*****`;
};

const personalEmailDomains = new Set([
  "gmail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
]);

const extractEmailDomain = (value: string | undefined | null) => {
  const email = normalizeOptionalText(value)?.toLowerCase();
  if (!email) return undefined;
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0 || atIndex === email.length - 1) return undefined;
  return email.slice(atIndex + 1);
};

const normalizeBusinessNameForTrust = (value: string | undefined | null) =>
  normalizeRequiredText(value)
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[()（）.,·ㆍ\-_]/g, "")
    .replace(/주식회사|유한회사|합자회사|합명회사|사단법인|재단법인|㈜|\(주\)|주\)/g, "");

const businessNamesLikelyMatch = (
  left: string | undefined | null,
  right: string | undefined | null,
) => {
  const normalizedLeft = normalizeBusinessNameForTrust(left);
  const normalizedRight = normalizeBusinessNameForTrust(right);
  if (!normalizedLeft || !normalizedRight) return true;
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
};

const extractVerificationBusinessStartDate = (
  record: VerificationRequestRecord | undefined,
) => {
  const snapshotValue = record?.evidence_snapshot_json?.business_start_date;
  return normalizeOptionalText(snapshotValue);
};

const parseBusinessStartDate = (value: string | undefined) => {
  if (!value) return undefined;
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length !== 8) return undefined;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const isDateWithinDays = (value: string | undefined, days: number) => {
  const date = parseBusinessStartDate(value);
  if (!date) return false;
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 0) return false;
  return ageMs <= days * 24 * 60 * 60 * 1000;
};

const isInternalContractUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "yeollock.me" ||
      hostname.endsWith(".yeollock.me") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
};

const hasExternalContractLink = (contract: Contract) => {
  const linkTexts = [
    contract.campaign?.tracking_link,
    contract.workflow?.last_message,
    ...contract.clauses.map((clause) => clause.content),
  ].filter(hasText);
  const urls = linkTexts.flatMap((text) => text.match(/https?:\/\/[^\s"'<>]+/g) ?? []);
  return urls.some((url) => !isInternalContractUrl(url));
};

const getAdvertiserBusinessVerificationRequests = async (
  auth: AdvertiserSession,
  contract: Contract,
) => {
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

  return { organization, requests: relevantRequests };
};

const buildAdvertiserTrustSnapshot = async (
  auth: AdvertiserSession,
  contract: Contract,
  contracts: Contract[],
): Promise<Contract["advertiser_trust"]> => {
  const { organization, requests } = await getAdvertiserBusinessVerificationRequests(
    auth,
    contract,
  );
  const latest = requests[0];
  const previousProgressContracts = contracts.filter(
    (item) =>
      item.id !== contract.id &&
      item.advertiser_id === contract.advertiser_id &&
      item.status !== "DRAFT" &&
      !item.id.startsWith("demo-contract-"),
  );
  const firstContract = previousProgressContracts.length === 0;
  const managerEmail =
    latest?.submitted_by_email ?? auth.profile.email ?? auth.user.email;
  const managerEmailDomain = extractEmailDomain(managerEmail);
  const budgetAmount = parseMoneyAmount(contract.campaign?.budget);
  const businessStartDate = extractVerificationBusinessStartDate(latest);
  const verifiedBusinessName =
    latest?.subject_name ?? organization?.name ?? contract.advertiser_info?.name;
  const riskFlags: NonNullable<
    NonNullable<Contract["advertiser_trust"]>["risk_flags"]
  > = [];
  let riskScore = 0;

  const addFlag = (
    condition: boolean,
    score: number,
    code: string,
    label: string,
    severity: "low" | "medium" | "high",
  ) => {
    if (!condition) return;
    riskScore += score;
    riskFlags.push({ code, label, severity });
  };

  addFlag(
    latest?.status !== "approved",
    50,
    "business_verification_not_approved",
    "사업자 인증이 아직 완료되지 않았습니다.",
    "high",
  );
  addFlag(
    firstContract,
    30,
    "first_contract_on_yeollock",
    "연락미에서 처음 광고 계약을 진행하는 광고주입니다.",
    "medium",
  );
  addFlag(
    Boolean(managerEmailDomain && personalEmailDomains.has(managerEmailDomain)),
    10,
    "personal_manager_email_domain",
    "담당자 이메일이 개인 메일 도메인입니다.",
    "low",
  );
  addFlag(
    !businessNamesLikelyMatch(verifiedBusinessName, contract.advertiser_info?.name),
    15,
    "business_name_contract_name_mismatch",
    "인증 사업자명과 계약서의 광고주명이 다릅니다.",
    "medium",
  );
  addFlag(
    isDateWithinDays(businessStartDate, 90),
    15,
    "recent_business_start_date",
    "개업일이 최근 90일 이내입니다.",
    "medium",
  );
  addFlag(
    typeof budgetAmount === "number" && budgetAmount >= 3000000,
    15,
    "high_first_contract_amount",
    "첫 거래 기준 계약 금액이 큰 편입니다.",
    "medium",
  );
  addFlag(
    hasExternalContractLink(contract),
    10,
    "external_link_in_contract_terms",
    "계약 조건에 외부 링크가 포함되어 있습니다.",
    "low",
  );

  const cappedScore = Math.min(100, riskScore);
  const riskLevel = cappedScore >= 60 ? "high" : cappedScore >= 30 ? "medium" : "low";
  const verificationLabels: Record<string, string> = {
    approved: "국세청 사업자 정보 확인 완료",
    pending: "사업자 인증 검토 중",
    rejected: "사업자 인증 반려",
    not_submitted: "사업자 인증 미제출",
  };
  const verificationStatus = latest?.status ?? "not_submitted";

  return {
    business_verification_status: verificationStatus,
    business_verification_label: verificationLabels[verificationStatus],
    business_verified_at: latest?.reviewed_at ?? latest?.updated_at,
    business_name: verifiedBusinessName,
    business_registration_number_masked:
      maskBusinessRegistrationNumber(latest?.business_registration_number) ??
      maskBusinessRegistrationNumber(organization?.business_registration_number ?? undefined),
    representative_name: latest?.representative_name,
    manager_name: contract.advertiser_info?.manager ?? latest?.submitted_by_name,
    manager_phone: latest?.manager_phone,
    manager_email_domain: managerEmailDomain,
    first_contract: firstContract,
    risk_score: cappedScore,
    risk_level: riskLevel,
    risk_flags: riskFlags,
    guidance:
      "처음 거래하는 광고주라면 계약 전 사업자 정보와 담당자가 맞는지 유선 또는 공식 채널로 한 번 더 확인하세요.",
  };
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

const formatDashboardActivityActorRole = (role?: string | null) => {
  if (role === "advertiser" || role === "agency" || role === "marketer") {
    return "광고주";
  }
  if (role === "influencer") return "인플루언서";
  return "시스템";
};

const formatDashboardActivityAction = (action: string) => {
  const labels: Record<string, string> = {
    campaign_application_submitted: "캠페인 지원",
    campaign_application_reviewed: "지원 검토",
    campaign_application_accepted: "지원 수락",
    campaign_application_closed: "지원 종료",
    contract_created: "계약 생성",
    share_link_issued: "검토 링크 발급",
    contract_signed: "계약 서명",
    contract_completed: "계약 마감",
    contract_closed: "계약 마감",
    post_link_submitted: "컨텐츠 제출",
    deliverable_submitted: "컨텐츠 제출",
    deliverable_approved: "컨텐츠 승인",
    deliverable_changes_requested: "수정 요청",
    deliverable_rejected: "컨텐츠 반려",
    signed_pdf_downloaded: "서명본 다운로드",
    deliverable_file_downloaded: "컨텐츠 파일 다운로드",
  };

  return labels[action] ?? action.replace(/_/g, " ");
};

const normalizeDashboardActivityEvent = (
  event: {
    id: string;
    actor?: string | null;
    actorRole?: string | null;
    action: string;
    description?: string | null;
    createdAt: string;
  },
): InfluencerDashboardActivityEvent => ({
  id: event.id,
  actor:
    normalizeOptionalText(event.actor) ??
    formatDashboardActivityActorRole(event.actorRole),
  action: event.action,
  label: formatDashboardActivityAction(event.action),
  description:
    normalizeOptionalText(event.description) ??
    `${formatDashboardActivityAction(event.action)} 기록이 생성되었습니다.`,
  created_at: event.createdAt,
});

const mapContractEventRowsToDashboardActivities = (
  rows: SupabaseContractEventRow[],
): InfluencerDashboardActivityEvent[] =>
  rows
    .map((row) => {
      const description = normalizeOptionalText(
        row.payload?.description ?? row.payload?.message,
      );

      return normalizeDashboardActivityEvent({
        id: row.id,
        actor: row.actor_display_name,
        actorRole: row.actor_role,
        action: row.event_type,
        description,
        createdAt: row.created_at,
      });
    })
    .filter((event) => Number.isFinite(parseDashboardDate(event.created_at)))
    .sort(
      (a, b) =>
        parseDashboardDate(b.created_at) - parseDashboardDate(a.created_at),
    )
    .slice(0, 20);

const mapLegacyAuditEventsToDashboardActivities = (
  events: Contract["audit_events"] = [],
): InfluencerDashboardActivityEvent[] =>
  events
    .map((event) =>
      normalizeDashboardActivityEvent({
        id: event.id,
        actorRole: event.actor,
        action: event.action,
        description: event.description,
        createdAt: event.created_at,
      }),
    )
    .filter((event) => Number.isFinite(parseDashboardDate(event.created_at)))
    .sort(
      (a, b) =>
        parseDashboardDate(b.created_at) - parseDashboardDate(a.created_at),
    )
    .slice(0, 20);

const withFallbackDashboardActivity = (
  events: InfluencerDashboardActivityEvent[],
  fallback: InfluencerDashboardActivityEvent,
) => (events.length > 0 ? events : [fallback]);

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
    label: "컨텐츠 제출",
    statusLabel: "컨텐츠 제출 필요",
    actionLabel: "제출하기",
    nextAction: "서명 완료 후 컨텐츠 URL이나 컨텐츠 파일을 제출해 주세요.",
  },
  deliverables_review: {
    label: "광고주 검수 필요",
    statusLabel: "광고주 검수 중",
    actionLabel: "제출 내역 보기",
    nextAction: "제출한 컨텐츠를 광고주가 확인 및 검수하고 있습니다.",
  },
  signed: {
    label: "완료",
    statusLabel: "서명 완료",
    actionLabel: "완료본 보기",
    nextAction: "서명본과 감사 기록을 보관하세요.",
  },
  completed: {
    label: "완료",
    statusLabel: "계약 마감",
    actionLabel: "마감 내역 보기",
    nextAction: "모든 컨텐츠 확인 및 검수가 끝나 광고 계약이 마감되었습니다.",
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
    CLOSED: "completed",
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
  events,
}: {
  contract: SupabaseContractV2Row;
  legacyContract?: Contract;
  parties: SupabaseContractPartyRow[];
  platforms: SupabaseContractPlatformRow[];
  pricingTerm?: SupabaseContractPricingTermRow;
  clauses: SupabaseContractClauseRow[];
  deliverableRequirements: SupabaseDeliverableRequirementRow[];
  deliverables: SupabaseDeliverableRow[];
  events: SupabaseContractEventRow[];
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
  const hasPendingDeliverableReview = deliverables.some(
    (deliverable) => normalizeDeliverableStatus(deliverable.review_status) === "submitted",
  );
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
        : hasPendingDeliverableReview ||
            (deliverableSummary.submitted >= deliverableSummary.total &&
              !hasDeliverableRevision)
          ? "deliverables_review"
          : "deliverables_due";
  }

  const stageMeta = dashboardStageMeta[stage];
  const recordStatus =
    ["signed", "deliverables_due", "deliverables_review", "completed"].includes(stage)
      ? "ready"
      : "not_ready";
  const activityEvents = withFallbackDashboardActivity(
    mapContractEventRowsToDashboardActivities(events),
    normalizeDashboardActivityEvent({
      id: `${contract.id}:contract-created`,
      actor:
        advertiserParty?.company_name ??
        advertiserParty?.display_name ??
        legacyContract?.advertiser_info?.name ??
        "광고주",
      action: "contract_created",
      description: "광고주가 계약 초안을 생성했습니다.",
      createdAt: contract.created_at ?? contract.updated_at,
    }),
  );

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
    activity_events: activityEvents,
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
  const legacyDeliverableSummary = contract.deliverable_summary;
  const activityEvents = withFallbackDashboardActivity(
    mapLegacyAuditEventsToDashboardActivities(contract.audit_events),
    normalizeDashboardActivityEvent({
      id: `${contract.id}:contract-created`,
      actor: contract.advertiser_info?.name ?? "광고주",
      action: "contract_created",
      description: "광고주가 계약 초안을 생성했습니다.",
      createdAt: contract.created_at,
    }),
  );

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
      total:
        legacyDeliverableSummary?.total ??
        contract.campaign?.deliverables?.length ??
        0,
      submitted: legacyDeliverableSummary?.submitted ?? 0,
      approved: legacyDeliverableSummary?.approved ?? 0,
    },
    record_summary: {
      status:
        contract.status === "SIGNED" || contract.status === "CLOSED"
          ? "ready"
          : "not_ready",
      label:
        contract.status === "SIGNED" || contract.status === "CLOSED"
          ? "서명본 보관됨"
          : "서명 후 보관",
    },
    activity_events: activityEvents,
  };
};

const applicationStageMeta: Record<
  InfluencerDashboardApplication["stage"],
  {
    label: string;
    actionLabel: string;
    nextAction: string;
  }
> = {
  submitted: {
    label: "지원 접수",
    actionLabel: "신청 내역 보기",
    nextAction: "광고주가 지원 내용을 검토하는 중입니다.",
  },
  reviewed: {
    label: "검토 중",
    actionLabel: "메시지 확인",
    nextAction: "광고주 검토가 진행 중입니다. 추가 요청은 메시지함에서 확인하세요.",
  },
  accepted: {
    label: "수락 완료",
    actionLabel: "계약 보기",
    nextAction: "지원이 수락되었습니다. 생성된 계약을 확인하세요.",
  },
  closed: {
    label: "종료",
    actionLabel: "기록 보기",
    nextAction: "지원 흐름이 종료되었습니다. 메시지함에서 기록을 확인할 수 있습니다.",
  },
};

const inferApplicationStage = (
  row: SupabaseMarketplaceContactProposalRow,
): InfluencerDashboardApplication["stage"] => {
  if (row.converted_contract_id || row.status === "converted_to_contract") {
    return "accepted";
  }
  if (row.status === "reviewed") return "reviewed";
  if (row.status === "closed") return "closed";
  return "submitted";
};

const buildApplicationActivityEvents = (
  row: SupabaseMarketplaceContactProposalRow,
  brandName: string,
): InfluencerDashboardActivityEvent[] => {
  const events = [
    normalizeDashboardActivityEvent({
      id: `${row.id}:submitted`,
      actor: row.sender_name || "인플루언서",
      action: "campaign_application_submitted",
      description: `${brandName} 캠페인에 지원했습니다.`,
      createdAt: row.created_at,
    }),
  ];

  if (row.status === "reviewed") {
    events.push(
      normalizeDashboardActivityEvent({
        id: `${row.id}:reviewed`,
        actor: brandName,
        action: "campaign_application_reviewed",
        description: "광고주가 지원 내용을 검토 중으로 표시했습니다.",
        createdAt: row.updated_at,
      }),
    );
  }

  if (row.converted_contract_id || row.status === "converted_to_contract") {
    events.push(
      normalizeDashboardActivityEvent({
        id: `${row.id}:accepted`,
        actor: brandName,
        action: "campaign_application_accepted",
        description: "지원이 수락되어 계약이 생성되었습니다.",
        createdAt: row.updated_at,
      }),
    );
  }

  if (row.status === "closed") {
    events.push(
      normalizeDashboardActivityEvent({
        id: `${row.id}:closed`,
        actor: brandName,
        action: "campaign_application_closed",
        description: "캠페인 지원 흐름이 종료되었습니다.",
        createdAt: row.updated_at,
      }),
    );
  }

  return events.sort(
    (a, b) =>
      parseDashboardDate(b.created_at) - parseDashboardDate(a.created_at),
  );
};

const mapMarketplaceProposalToDashboardApplication = (
  row: SupabaseMarketplaceContactProposalRow,
): InfluencerDashboardApplication => {
  const snapshot = normalizeMarketplaceCampaignSnapshot(row.campaign_snapshot);
  const stage = inferApplicationStage(row);
  const stageMeta = applicationStageMeta[stage];
  const platformSource =
    snapshot?.platforms && snapshot.platforms.length > 0
      ? snapshot.platforms
      : row.marketplace_platforms?.map((platform) => platform.platform) ?? [];
  const platforms = Array.from(
    new Set(
      (platformSource.length > 0 ? platformSource : ["other"]).map(
        normalizeInfluencerPlatform,
      ),
    ),
  );
  const brandName = snapshot?.brandName ?? row.target_display_name ?? "광고주";
  const actionHref = row.converted_contract_id
    ? `/contract/${encodeURIComponent(row.converted_contract_id)}`
    : "/influencer/messages";

  return {
    id: row.id,
    campaign_id: row.campaign_id ?? snapshot?.id ?? undefined,
    campaign_title:
      snapshot?.title ??
      (row.campaign_id ? `캠페인 ${row.campaign_id}` : getProposalTypeLabel(row.proposal_type)),
    brand_name: brandName,
    brand_handle: snapshot?.brandHandle ?? row.target_handle ?? undefined,
    status: row.status,
    stage,
    stage_label: stageMeta.label,
    next_action_label: stageMeta.nextAction,
    action_label: stageMeta.actionLabel,
    action_href: actionHref,
    platform_labels: platforms.map((platform) => dashboardPlatformLabels[platform]),
    platforms,
    fee_label: snapshot?.budget ?? "조건 협의",
    deadline_label: formatDashboardDue(snapshot?.deadline),
    due_at: snapshot?.deadline,
    proposal_summary: row.proposal_summary,
    converted_contract_id: row.converted_contract_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    activity_events: buildApplicationActivityEvents(row, brandName),
  };
};

const buildInfluencerDashboardApplications = async (
  profileId: string | undefined,
): Promise<InfluencerDashboardApplication[]> => {
  if (!useSupabase || !profileId) return [];

  const rows = await readMarketplaceProposalRows(
    `?select=*&direction=eq.influencer_to_brand&sender_profile_id=eq.${encodeURIComponent(
      profileId,
    )}&order=updated_at.desc`,
    "influencer dashboard campaign applications",
  );
  const enrichedRows = await addPlatformInfoToMarketplaceProposals(rows);

  return enrichedRows
    .map(mapMarketplaceProposalToDashboardApplication)
    .sort(
      (a, b) =>
        parseDashboardDate(b.updated_at) - parseDashboardDate(a.updated_at),
    );
};

const mapV2StatusToLegacyStatus = (
  status: SupabaseContractV2Row["status"],
  nextActorRole?: string | null,
): Contract["status"] => {
  if (status === "completed") return "CLOSED";
  if (status === "active") return "SIGNED";
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

const contractPlatformDisplayLabels: Record<ContractPlatformValue, string> = {
  INSTAGRAM: "인스타그램",
  YOUTUBE: "유튜브",
  TIKTOK: "틱톡",
  NAVER_BLOG: "네이버 블로그",
  OTHER: "기타",
};

const getRequirementRecord = (requirement: SupabaseDeliverableRequirementRow) =>
  requirement.requirement_json && typeof requirement.requirement_json === "object"
    ? requirement.requirement_json
    : {};

const summarizeDeliverableRequirementRow = (
  requirement: SupabaseDeliverableRequirementRow,
) => {
  if (hasText(requirement.description)) return requirement.description.trim();
  const summary = summarizeRequirementJson(getRequirementRecord(requirement));
  return summary || requirement.title;
};

const buildLegacyDeliverableItemsFromRows = (
  requirements: SupabaseDeliverableRequirementRow[],
  platforms: SupabaseContractPlatformRow[],
): ContractDeliverableItem[] => {
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));

  return requirements.map((requirement) => {
    const requirementRecord = getRequirementRecord(requirement);
    const platformRow = requirement.platform_id
      ? platformById.get(requirement.platform_id)
      : undefined;
    const platform = platformRow
      ? mapV2PlatformToLegacy(normalizeInfluencerPlatform(platformRow.platform))
      : "OTHER";
    const defaultPlatformLabel = contractPlatformDisplayLabels[platform];
    const platformLabel = hasText(requirementRecord.platformName)
      ? requirementRecord.platformName.trim()
      : defaultPlatformLabel;
    const inferredContentLabel =
      requirement.title.startsWith(platformLabel)
        ? requirement.title.slice(platformLabel.length).trim()
        : requirement.title;
    const contentLabel = hasText(requirementRecord.contentName)
      ? requirementRecord.contentName.trim()
      : inferredContentLabel || requirement.title;

    return {
      id: requirement.id,
      platform,
      platformLabel,
      contentType: (requirement.content_format ?? "other") as ContractDeliverableItem["contentType"],
      contentLabel,
      requirementText: summarizeDeliverableRequirementRow(requirement),
      requirements: requirementRecord as ContractDeliverableItem["requirements"],
    };
  });
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
            : status === "SIGNED" || status === "CLOSED"
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
      audit_ready: status === "APPROVED" || status === "SIGNED" || status === "CLOSED",
      pdf_status:
        status === "SIGNED" || status === "CLOSED"
          ? "signed_ready"
          : status === "DRAFT"
            ? "not_ready"
            : "draft_ready",
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
            status:
              status === "APPROVED" || status === "SIGNED" || status === "CLOSED"
                ? "APPROVED"
                : "PENDING_REVIEW",
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

  const legacyContract = buildLegacyContractFromV2Rows({
    contract,
    parties,
    platforms,
    pricingTerm: pricingTerms[0],
    clauses,
    shareLink: shareLinks[0],
  });
  const bundle = await readContractDeliverableBundle(legacyContract);
  const summary = buildDeliverableSummary(bundle.requirements, bundle.deliverables);
  const deliverableItems = buildLegacyDeliverableItemsFromRows(
    bundle.requirements,
    platforms,
  );
  const deliverableSummaries =
    bundle.requirements.length > 0
      ? bundle.requirements.map(summarizeDeliverableRequirementRow)
      : legacyContract.campaign?.deliverables;

  return normalizeContract({
    ...legacyContract,
    campaign: {
      ...legacyContract.campaign,
      deliverables: deliverableSummaries,
      ...(deliverableItems.length ? { deliverable_items: deliverableItems } : {}),
    },
    deliverable_summary: {
      ...summary,
      updated_at: contract.updated_at ?? legacyContract.updated_at,
    },
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
  const latestRejectedVerification = verificationRequests
    .filter((request) => request.status === "rejected")
    .sort((a, b) => parseDateDescending(a.created_at, b.created_at))[0];
  const rejectionNote =
    latestRejectedVerification?.reviewer_note ||
    "프로필 URL, 핸들, 인증 코드 위치 또는 공개 접근 가능 여부를 확인할 수 없습니다.";

  if (
    activeContract &&
    (verificationStatus !== "approved" || activeContractNeedingVerification)
  ) {
    const taskContract = activeContractNeedingVerification ?? activeContract;
    tasks.push({
      id: "verification",
      contract_id: taskContract.id,
      tone: verificationStatus === "rejected" ? "rose" : "amber",
      title:
        verificationStatus === "pending"
          ? "계정 인증 검토 중"
          : verificationStatus === "rejected"
            ? "계정 인증 재제출 필요"
            : "플랫폼 계정 인증 필요",
      body:
        verificationStatus === "pending"
          ? "운영자 검토가 끝나면 계정 인증 상태가 갱신됩니다."
          : verificationStatus === "rejected"
            ? `반려 사유: ${rejectionNote} 계약 검토는 가능하지만, 서명하려면 새 증빙으로 다시 승인받아야 합니다.`
          : "계약 검토는 가능하지만, 서명하려면 플랫폼 계정 인증 승인이 먼저 필요합니다.",
      action_label:
        verificationStatus === "pending"
          ? "인증 상태 보기"
          : verificationStatus === "rejected"
            ? "인증 재제출"
            : "인증 제출",
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

type InfluencerDashboardBuildOptions = {
  includeApplications?: boolean;
};

const buildInfluencerDashboardFromLocal = async (
  authUser: SupabaseAuthUser,
  options: InfluencerDashboardBuildOptions = {},
  profile?: SupabaseProfileRow,
): Promise<InfluencerDashboardResponse> => {
  const userEmail = normalizeEmail(profile?.email ?? authUser.email ?? "");
  const store = await readStore();
  const dashboardContracts = store.contracts
    .filter((contract) => {
      const contactEmail = normalizeEmail(contract.influencer_info?.contact ?? "");
      return hasText(userEmail) && contactEmail === userEmail;
    })
    .map(buildLegacyDashboardContract)
    .sort(
      (a, b) => parseDashboardDate(b.updated_at) - parseDashboardDate(a.updated_at),
    );
  const dashboardApplications =
    options.includeApplications === false ? [] : [];

  const verificationRequests = (await readVerificationRequests()).filter(
    (request) =>
      request.target_type === "influencer_account" &&
      (request.profile_id === authUser.id ||
        request.submitted_by_email?.trim().toLowerCase() === userEmail),
  );
  const latestVerification = [...verificationRequests]
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
  const approvedPlatforms = buildApprovedInfluencerPlatforms(verificationRequests);
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
          !verificationRequests.some((request) =>
            verificationMatchesPlatformAccount(
              request,
              account.platform,
              account.url,
            ),
          ),
      ),
  );

  return {
    authenticated: true,
    user: {
      id: authUser.id,
      email: profile?.email ?? authUser.email ?? "",
      name: profile?.name ?? authUser.email ?? "인플루언서",
      avatar_url: profile?.avatar_url ?? undefined,
      role: profile?.role ?? "influencer",
      activity_categories: profile?.activity_categories ?? [],
      activity_platforms: profile?.activity_platforms ?? [],
      verification_status: verificationStatus,
      email_verified: Boolean(
        authUser.email_confirmed_at ??
          authUser.confirmed_at ??
          profile?.email_verified_at,
      ),
    },
    verification: {
      status: verificationStatus,
      latest_request: latestVerificationForResponse,
      approved_platforms: approvedPlatforms,
    },
    summary: {
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
    },
    tasks: buildDashboardTasks(
      dashboardContracts,
      verificationStatus,
      verificationRequests,
    ),
    contracts: dashboardContracts,
    applications: dashboardApplications,
  };
};

const buildInfluencerDashboardFromRemote = async (
  authUser: SupabaseAuthUser,
  options: InfluencerDashboardBuildOptions = {},
): Promise<InfluencerDashboardResponse> => {
  if (!useSupabase) {
    throw new Error("Supabase is required for influencer dashboard");
  }

  const userEmail = authUser.email?.trim().toLowerCase() ?? "";
  const [
    profiles,
    profileParties,
    emailParties,
    legacyStore,
  ] = await Promise.all([
    readSupabaseRows<SupabaseProfileRow>(
      "profiles",
      `?select=*&id=eq.${encodeURIComponent(authUser.id)}&limit=1`,
      "profile",
    ),
    readSupabaseRows<SupabaseContractPartyRow>(
      "contract_parties",
      `?select=*&party_role=eq.influencer&profile_id=eq.${encodeURIComponent(authUser.id)}`,
      "influencer parties by profile",
    ),
    userEmail
      ? readSupabaseRows<SupabaseContractPartyRow>(
          "contract_parties",
          `?select=*&party_role=eq.influencer&email=eq.${encodeURIComponent(userEmail)}`,
          "influencer parties by email",
        )
      : Promise.resolve([] as SupabaseContractPartyRow[]),
    readStore(),
  ]);
  const profile = profiles[0];

  if (profile && profile.role !== "influencer") {
    throw new Error("Influencer role is required");
  }

  const influencerParties = uniqueRowsById([...profileParties, ...emailParties]);
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
      contractEvents,
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
      readSupabaseRows<SupabaseContractEventRow>(
        "contract_events",
        `?select=id,contract_id,actor_role,actor_display_name,event_type,payload,created_at&contract_id=in.${contractFilter}&order=created_at.desc`,
        "contract events",
      ),
    ]);
    const partiesByContract = groupByContractId(allParties);
    const platformsByContract = groupByContractId(platforms);
    const clausesByContract = groupByContractId(clauses);
    const requirementsByContract = groupByContractId(deliverableRequirements);
    const deliverablesByContract = groupByContractId(deliverables);
    const eventsByContract = groupByContractId(contractEvents);
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
        events: eventsByContract.get(contract.id) ?? [],
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
  const dashboardApplications =
    options.includeApplications === false
      ? []
      : await buildInfluencerDashboardApplications(profile?.id ?? authUser.id);

  const verificationRequests = (await readVerificationRequests()).filter(
    (request) =>
      request.target_type === "influencer_account" &&
      (request.profile_id === authUser.id ||
        request.submitted_by_email?.trim().toLowerCase() === userEmail),
  );
  const latestVerification = [...verificationRequests]
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
  const approvedPlatforms = buildApprovedInfluencerPlatforms(verificationRequests);
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
      avatar_url: profile?.avatar_url ?? undefined,
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
    applications: dashboardApplications,
  };
};

const buildInfluencerDashboard = async (
  authUser: SupabaseAuthUser,
  options: InfluencerDashboardBuildOptions = {},
  profile?: SupabaseProfileRow,
): Promise<InfluencerDashboardResponse> => {
  const cachedDashboard = readInfluencerDashboardCache(authUser.id, options);
  if (cachedDashboard) return cachedDashboard;

  const key = getInfluencerDashboardCacheKey(authUser.id, options);
  const inflight = influencerDashboardInflight.get(key);
  if (inflight) return inflight.then(cloneInfluencerDashboard);

  const dashboardPromise = (useSupabase
    ? buildInfluencerDashboardFromRemote(authUser, options)
    : buildInfluencerDashboardFromLocal(authUser, options, profile))
    .then((dashboard) => {
      rememberInfluencerDashboardCache(authUser.id, options, dashboard);
      return cloneInfluencerDashboard(dashboard);
    })
    .finally(() => {
      influencerDashboardInflight.delete(key);
    });
  influencerDashboardInflight.set(key, dashboardPromise);
  return dashboardPromise;
};

const writeStore = async (store: ContractStoreFile) => {
  if (useSupabase) {
    const normalizedContracts = normalizeStore(store).contracts;
    if (useSupabaseV2) {
      await syncSupabaseV2Contracts(normalizedContracts);
    }
    await upsertSupabaseContracts(normalizedContracts);
    rememberSupabaseContractStoreCache({ contracts: normalizedContracts });
    invalidateAdvertiserDashboardCache();
    invalidateInfluencerDashboardCache();
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

const warmDashboardDataCachesInBackground = (reason: string) => {
  if (!useSupabase) return;

  void Promise.allSettled([
    readSupabaseStore(),
    readSupabaseVerificationRequests(),
  ]).then((results) => {
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejected.length === 0) return;
    console.warn(
      `[${productName}] dashboard data cache warmup failed (${reason}): ${
        rejected
          .map((result) =>
            result.reason instanceof Error ? result.reason.message : "unknown error",
          )
          .join("; ")
      }`,
    );
  });
};

const readContractWriteContext = async (contractId: string) => {
  if (useSupabase) {
    const legacyContract = await readSupabaseLegacyContract(contractId);
    const v2Contract =
      !legacyContract && isUuid(contractId)
        ? await readSupabaseV2ContractAsLegacy(contractId)
        : undefined;
    const existingContract = legacyContract ?? v2Contract;

    return {
      store: { contracts: existingContract ? [existingContract] : [] },
      existingIndex: legacyContract ? 0 : -1,
      existingContract,
      isV2Only: !legacyContract && Boolean(v2Contract),
    };
  }

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

const readContractById = async (contractId: string) => {
  if (useSupabase) {
    return (
      (await readSupabaseLegacyContract(contractId)) ??
      (await readSupabaseV2ContractAsLegacy(contractId))
    );
  }

  const store = await readStore();
  return store.contracts.find((item) => item.id === contractId);
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

const upsertContractIntoStore = (
  store: ContractStoreFile,
  contract: Contract,
) => ({
  contracts: store.contracts.some((item) => item.id === contract.id)
    ? store.contracts.map((item) => (item.id === contract.id ? contract : item))
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
  buildContractDeliverableRequirementRows(contract);

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
      platform_id: requirement.platform_id,
      content_format: requirement.content_format,
      requirement_json: requirement.requirement_json ?? {},
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

  const storedLegacyContract = await readSupabaseLegacyContract(contractId);
  const legacyContract =
    storedLegacyContract ?? (await readSupabaseV2ContractAsLegacy(contractId));
  if (!legacyContract) return;

  const bundle = await readContractDeliverableBundle(legacyContract);
  const summary = buildDeliverableSummary(bundle.requirements, bundle.deliverables);
  const hasRevision = bundle.deliverables.some((deliverable) =>
    ["changes_requested", "rejected"].includes(
      normalizeDeliverableStatus(deliverable.review_status),
    ),
  );
  const hasPendingReview = bundle.deliverables.some(
    (deliverable) => normalizeDeliverableStatus(deliverable.review_status) === "submitted",
  );
  const completed =
    summary.total > 0 && summary.approved >= summary.total;
  const now = new Date().toISOString();

  const workflow =
    completed
      ? {
          next_actor: "advertiser" as const,
          next_action: "모든 컨텐츠가 승인되었습니다. 광고 계약 마감을 진행하세요.",
          risk_level: "low" as const,
          last_message: "모든 필수 컨텐츠가 승인되었습니다.",
        }
      : hasPendingReview
        ? {
            next_actor: "advertiser" as const,
            next_action: "제출된 컨텐츠 URL과 파일을 검수하고 승인 또는 수정 요청을 남기세요.",
            risk_level: "medium" as const,
            last_message: "광고주 컨텐츠 확인 및 검수가 필요합니다.",
          }
        : {
            next_actor: "influencer" as const,
            next_action: hasRevision
              ? "수정 요청된 컨텐츠를 보완한 뒤 URL이나 파일을 다시 제출하세요."
              : "컨텐츠 URL과 파일을 제출해 광고주 검수를 요청하세요.",
            risk_level: hasRevision ? ("medium" as const) : ("low" as const),
            last_message: hasRevision
              ? "컨텐츠 수정 요청 또는 반려가 있습니다."
              : "인플루언서 컨텐츠 제출을 기다리는 중입니다.",
          };
  const updates = completed
    ? {
        status: "active",
        next_actor_role: "advertiser",
        next_action: workflow.next_action,
        next_due_at: null,
        completed_at: null,
        updated_at: now,
      }
    : hasPendingReview
      ? {
          status: "active",
          next_actor_role: "advertiser",
          next_action: workflow.next_action,
          next_due_at: null,
          completed_at: null,
          updated_at: now,
        }
      : {
          status: "active",
          next_actor_role: "influencer",
          next_action: workflow.next_action,
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

  if (storedLegacyContract) {
    const firstSubmittedUrl = bundle.deliverables.find((deliverable) =>
      hasText(deliverable.url),
    )?.url;
    const updatedLegacyContract = normalizeContract({
      ...storedLegacyContract,
      post_link: firstSubmittedUrl ?? storedLegacyContract.post_link,
      deliverable_summary: {
        ...summary,
        updated_at: now,
      },
      workflow: {
        ...(storedLegacyContract.workflow ?? {}),
        ...workflow,
      },
      updated_at: now,
    });

    await patchSupabaseRecord(
      supabaseLegacyTable,
      `?id=eq.${encodeURIComponent(contractId)}`,
      {
        contract: updatedLegacyContract,
        post_link: updatedLegacyContract.post_link ?? null,
        campaign_name:
          updatedLegacyContract.campaign_name ?? updatedLegacyContract.title,
      },
      "Supabase legacy contract deliverable summary update",
    );
  }

  if (completed) {
    await insertContractEvent({
      contractId,
      actorRole: "system",
      actorDisplayName: productName,
      eventType: "deliverables_ready_to_close",
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

    if (legacyContract.status === "SIGNED" || legacyContract.status === "CLOSED") {
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

      if (
        ["signed", "completed"].includes(
          inferDashboardStage(contract.status, contract.next_actor_role),
        )
      ) {
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

app.get("/api/auth/warmup", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  warmDashboardDataCachesInBackground("auth-warmup");
  try {
    await warmSupabaseAuthConnection();
  } catch (error) {
    console.warn(
      `[${productName}] Supabase Auth warmup failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  response.status(204).end();
});

app.post("/api/support/tickets", async (request, response, next) => {
  try {
    const requesterEmail = normalizeEmail(request.body?.requester_email);
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "operational_support_ticket",
      requesterEmail || getClientIp(request),
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    if (!isValidEmail(requesterEmail)) {
      response.status(422).json({ error: "문의 받을 이메일을 확인해 주세요." });
      return;
    }

    const categoryInput = normalizeRequiredText(request.body?.category);
    const requesterRoleInput = normalizeRequiredText(request.body?.requester_role);
    const severityInput = normalizeRequiredText(request.body?.severity);
    const subject = normalizeRequiredText(request.body?.subject);
    const message = normalizeRequiredText(request.body?.message);
    const requesterName = normalizeOptionalText(request.body?.requester_name);
    const contextUrl = sanitizeSupportContextUrl(request.body?.context_url);
    const pagePath = sanitizeSupportContextUrl(
      request.body?.page_path ?? request.body?.context_url,
    );
    const contractId = normalizeSupportTicketContractId(request.body?.contract_id);
    const contractTitle = normalizeOptionalText(request.body?.contract_title)?.slice(
      0,
      120,
    );
    const browserContext = normalizeSupportBrowserContext(
      request.body?.browser_context,
    );

    if (subject.length < 2 || subject.length > 120) {
      response.status(422).json({ error: "문의 제목은 2~120자로 입력해 주세요." });
      return;
    }

    if (message.length < 10 || message.length > 2000) {
      response.status(422).json({ error: "문의 내용은 10~2000자로 입력해 주세요." });
      return;
    }

    if (
      contextUrl &&
      !contextUrl.startsWith("/") &&
      !/^https?:\/\//i.test(contextUrl)
    ) {
      response.status(422).json({ error: "화면 주소 형식이 올바르지 않습니다." });
      return;
    }

    const now = new Date().toISOString();
    const ticket = await insertSupportTicket({
      id: randomUUID(),
      category: supportTicketCategories.has(
        categoryInput as OperationalSupportTicketCategory,
      )
        ? (categoryInput as OperationalSupportTicketCategory)
        : "other",
      requester_role: supportTicketRequesterRoles.has(
        requesterRoleInput as OperationalSupportTicketRequesterRole,
      )
        ? (requesterRoleInput as OperationalSupportTicketRequesterRole)
        : "other",
      requester_name: requesterName,
      requester_email: requesterEmail,
      subject,
      message,
      context_url: contextUrl,
      contract_id: contractId,
      contract_title: contractTitle,
      page_path: pagePath,
      browser_context: browserContext,
      severity: supportTicketSeverities.has(
        severityInput as OperationalSupportTicketSeverity,
      )
        ? (severityInput as OperationalSupportTicketSeverity)
        : "normal",
      status: "open",
      source: "support_page",
      ip_hash: sha256Hex(`support-ticket:${getClientIp(request)}`),
      user_agent: request.header("user-agent")?.slice(0, 500),
      created_at: now,
      updated_at: now,
    });

    await enqueueSupportTicketOperationalAlert(ticket);

    response.status(201).json({
      ticket: {
        id: ticket.id,
        status: ticket.status,
        created_at: ticket.created_at,
      },
      message: "문의가 접수되었습니다.",
    });
  } catch (error) {
    next(error);
  }
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

    const [
      contracts,
      supportAccessRequests,
      verificationRequests,
      supportTickets,
    ] = await Promise.all([
      readOperationalAdminContracts(),
      readOperationalAdminSupportAccessRequests(),
      readOperationalAdminVerificationRequests(),
      readOperationalAdminSupportTickets(),
    ]);
    const metrics = await buildAdminMetrics(
      contracts,
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
        support_tickets: {
          open_count: supportTickets.filter(
            (ticket) => ticket.status === "open" || ticket.status === "reviewing",
          ).length,
          total_count: supportTickets.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/operational-alerts", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;

    response.json({
      operational_alerts: await readOperationalAlerts(),
      discord_configured: hasDiscordOperationsTarget(),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/support-tickets", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;

    response.json({
      support_tickets: await readOperationalAdminSupportTickets(),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/support-tickets/:id", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "admin_support_ticket_update",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    if (!requireAdminSession(request, response)) return;

    const status = normalizeRequiredText(request.body?.status);
    const adminNote = normalizeOptionalText(request.body?.admin_note);

    if (!supportTicketStatuses.has(status as OperationalSupportTicketStatus)) {
      response.status(422).json({ error: "문의 상태를 다시 선택해 주세요." });
      return;
    }

    const tickets = await readSupportTickets();
    const ticket = tickets.find((item) => item.id === request.params.id);

    if (!ticket) {
      response.status(404).json({ error: "문의 내역을 찾을 수 없습니다." });
      return;
    }

    const updated = await updateSupportTicket({
      ...ticket,
      status: status as OperationalSupportTicketStatus,
      admin_note: adminNote,
    });

    response.json({ ticket: updated });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/support-access-requests", async (request, response, next) => {
  try {
    if (!requireAdminSession(request, response)) return;

    const supportAccessRequests = await readOperationalAdminSupportAccessRequests();
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

    const profile = auth.profile ?? (await readProfileByUserId(auth.user.id));

    if (!isAdvertiserRole(profile?.role)) {
      response.status(403).json({ authenticated: false });
      return;
    }
    const organization = await readDefaultOrganizationForProfile(profile.id);

    response.json({
      authenticated: true,
      user: buildAdvertiserSessionUser(auth.user, profile, organization),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/advertiser/dashboard/bootstrap", async (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    const auth = await requireAdvertiserSession(request, response);
    if (!auth) return;

    const dashboard = await buildAdvertiserLoginDashboardBootstrap(auth);
    if (!dashboard) {
      response.status(503).json({
        error: "Dashboard data is warming up. Please try again.",
      });
      return;
    }

    response.json(dashboard);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset/request", async (request, response) => {
  try {
    const email = normalizeEmail(request.body?.email);
    const role = normalizeRequiredText(request.body?.role);

    if (!isValidEmail(email)) {
      response.status(422).json({ error: "올바른 이메일을 입력해 주세요." });
      return;
    }

    if (!useSupabase) {
      response.status(503).json({ error: "Password reset requires Supabase Auth" });
      return;
    }

    const throttle = consumePublicAuthRateLimit(request, "password_reset", email);
    if (throttle.blocked) {
      sendPublicAuthRateLimitResponse(response, throttle);
      return;
    }

    const resetUrl = new URL("/reset-password", `${getAppBaseUrl(request)}/`);
    if (role === "advertiser" || role === "influencer") {
      resetUrl.searchParams.set("role", role);
    }

    await requestSupabasePasswordRecovery({
      email,
      redirectTo: resetUrl.toString(),
    });
    clearPublicAuthRateLimit(request, "password_reset", email);

    response.status(202).json({
      message:
        "가입된 이메일이면 비밀번호 재설정 링크를 보냈습니다. 받은 편지함과 스팸함을 확인해 주세요.",
    });
  } catch (error) {
    response.status(400).json({
      error: getLoginFailureMessage(
        error,
        "비밀번호 재설정 메일을 보내지 못했습니다.",
      ),
    });
  }
});

app.post("/api/auth/password-reset/complete", async (request, response) => {
  try {
    const accessToken = normalizeRequiredText(request.body?.access_token);
    const password = normalizeRequiredText(request.body?.password);
    const passwordError = validateSignupPassword(password);

    if (!accessToken) {
      response.status(422).json({ error: "재설정 링크가 올바르지 않습니다." });
      return;
    }
    if (passwordError) {
      response.status(422).json({ error: passwordError });
      return;
    }

    if (!useSupabase) {
      response.status(503).json({ error: "Password reset requires Supabase Auth" });
      return;
    }

    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "password_reset_complete",
      accessToken.slice(0, 24),
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    await updateSupabasePasswordWithRecoveryToken({ accessToken, password });

    response.json({
      message: "비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.",
    });
  } catch (error) {
    response.status(400).json({
      error: getLoginFailureMessage(
        error,
        "비밀번호를 변경하지 못했습니다. 재설정 링크를 다시 요청해 주세요.",
      ),
    });
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

    const profileByEmailPromise = readProfileByEmail(email).catch(() => undefined);
    const prefetchedOrganizationPromise = profileByEmailPromise.then((profile) =>
      isAdvertiserRole(profile?.role)
        ? readDefaultOrganizationForProfile(profile.id)
        : undefined,
    );
    const prefetchedDashboardPromise = profileByEmailPromise
      .then((profile) =>
        isAdvertiserRole(profile?.role)
          ? buildAdvertiserLoginDashboardBootstrap({
              user: { id: profile.id, email: profile.email },
              accessToken: "",
              profile,
            }, { includeMessageSummary: false })
          : undefined,
      )
      .catch((error) => {
        console.warn(
          `[${productName}] advertiser login prefetch failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
        return undefined;
      });
    const session = await createSupabasePasswordSession(email, password);
    const profileByEmail = await profileByEmailPromise;
    const profile =
      profileByEmail?.id === session.user.id
        ? profileByEmail
        : await readProfileByUserId(session.user.id);

    if (!isAdvertiserRole(profile?.role)) {
      response.status(403).json({
        error: "광고주 계정 권한이 필요합니다. 광고주 계정으로 로그인해 주세요.",
      });
      return;
    }

    rememberRecentAuthSession(session.access_token, session.user);
    rememberProfile(profile);
    setAdvertiserSessionCookies(response, session, profile);
    clearPublicAuthRateLimit(request, "advertiser_login", email);
    const advertiserSession = {
      user: session.user,
      accessToken: session.access_token,
      profile,
    } satisfies AdvertiserSession;
    const canUsePrefetch = profileByEmail?.id === profile.id;
    const [organization, prefetchedDashboard] = canUsePrefetch
      ? await Promise.all([
          prefetchedOrganizationPromise,
          prefetchedDashboardPromise,
        ])
      : [undefined, undefined];
    const [resolvedOrganization, dashboard] = await Promise.all([
      organization ?? readDefaultOrganizationForProfile(profile.id),
      prefetchedDashboard ??
        buildAdvertiserLoginDashboardBootstrap(advertiserSession, {
          includeMessageSummary: false,
        }),
    ]);
    response.json({
      authenticated: true,
      user: buildAdvertiserSessionUser(session.user, profile, resolvedOrganization),
      dashboard,
    });
    if (!profile.email_verified_at) {
      syncProfileEmailVerifiedAtInBackground(session.user);
    }
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
      response.json({ authenticated: false });
      return;
    }

    const profile = auth.profile ?? (await readProfileByUserId(auth.user.id));

    if (!profile || !isInfluencerRole(profile.role)) {
      response.status(403).json({ authenticated: false });
      return;
    }

    response.json({
      authenticated: true,
      user: buildInfluencerSessionUser(auth.user, profile),
      verification: buildInfluencerSessionVerification(profile),
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

    const profileByEmailPromise = readProfileByEmail(email).catch(() => undefined);
    const session = await createSupabasePasswordSession(email, password);
    const profileByEmail = await profileByEmailPromise;
    const profile =
      profileByEmail?.id === session.user.id
        ? profileByEmail
        : await readProfileByUserId(session.user.id);

    if (!profile || !isInfluencerRole(profile.role)) {
      response.status(403).json({
        error: "인플루언서 계정 권한이 필요합니다. 인플루언서 계정으로 로그인해 주세요.",
      });
      return;
    }

    rememberRecentAuthSession(session.access_token, session.user);
    rememberProfile(profile);
    setInfluencerSessionCookies(response, session, profile);
    clearPublicAuthRateLimit(request, "influencer_login", email);
    void buildInfluencerDashboard(session.user, {
      includeApplications: false,
    }).catch((error) => {
      console.warn(
        `[${productName}] influencer login dashboard bootstrap failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return undefined;
    });
    response.json({
      authenticated: true,
      user: buildInfluencerSessionUser(session.user, profile),
      verification: buildInfluencerSessionVerification(profile),
    });
    if (!profile.email_verified_at) {
      syncProfileEmailVerifiedAtInBackground(session.user);
    }
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
      response.json({ authenticated: false });
      return;
    }

    const includeApplications =
      normalizeOptionalText(request.query.includeApplications) !== "false";
    response.json(
      await buildInfluencerDashboard(auth.user, { includeApplications }, auth.profile),
    );
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

app.get(
  "/api/cron/sync-marketplace-followers",
  async (request, response, next) => {
    if (!requireCronRequest(request, response)) return;

    try {
      const maxChannels =
        typeof request.query.max_channels === "string"
          ? Number(request.query.max_channels)
          : marketplaceFollowerSyncMaxChannels;
      const result = await runMarketplaceFollowerSync({
        requestedBy: "vercel_cron",
        maxChannels: Number.isFinite(maxChannels)
          ? maxChannels
          : marketplaceFollowerSyncMaxChannels,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/cron/ops-alerts", async (request, response, next) => {
  if (!requireCronRequest(request, response)) return;

  try {
    response.json(await runOperationalAlertSweep());
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/influencers", async (_request, response, next) => {
  try {
    const profiles = await readPublicMarketplaceCache(
      "marketplace-influencers",
      readMarketplaceInfluencerProfiles,
      { fallback: fallbackMarketplaceInfluencerProfiles },
    );
    sendPublicMarketplaceJson(response, { profiles }, "marketplace-influencers");
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/influencers/:handle", async (request, response, next) => {
  try {
    const profiles = await readPublicMarketplaceCache(
      "marketplace-influencers",
      readMarketplaceInfluencerProfiles,
      { fallback: fallbackMarketplaceInfluencerProfiles },
    );
    const profile = findInfluencerProfileByHandle(request.params.handle, profiles);

    if (!profile) {
      response.status(404).json({ error: "Influencer profile not found" });
      return;
    }

    sendPublicMarketplaceJson(response, { profile }, "marketplace-influencers");
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/brands", async (_request, response, next) => {
  try {
    const brands = await readPublicMarketplaceCache(
      "marketplace-brands",
      readMarketplaceBrandProfiles,
      { fallback: fallbackMarketplaceBrandProfiles },
    );
    sendPublicMarketplaceJson(response, { brands }, "marketplace-brands");
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/brands/:handle", async (request, response, next) => {
  try {
    const brands = await readPublicMarketplaceCache(
      "marketplace-brands",
      readMarketplaceBrandProfiles,
      { fallback: fallbackMarketplaceBrandProfiles },
    );
    const brand = findBrandProfileByHandle(request.params.handle, brands);

    if (!brand) {
      response.status(404).json({ error: "Brand profile not found" });
      return;
    }

    sendPublicMarketplaceJson(response, { brand }, "marketplace-brands");
  } catch (error) {
    next(error);
  }
});

app.get("/api/marketplace/campaigns", async (_request, response, next) => {
  try {
    const campaigns = await readPublicMarketplaceCache(
      "marketplace-campaigns",
      async () =>
        buildMarketplaceCampaignPosts(
          await readPublicMarketplaceCache(
            "marketplace-brands",
            readMarketplaceBrandProfiles,
            { fallback: fallbackMarketplaceBrandProfiles },
          ),
        ),
      { fallback: fallbackMarketplaceCampaignPosts },
    );
    sendPublicMarketplaceJson(response, { campaigns }, "marketplace-campaigns");
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/marketplace/campaigns/:campaignId/applications",
  async (request, response, next) => {
    try {
      const influencerAuth = await requireInfluencerSession(request, response);
      if (!influencerAuth) return;

      const throttle = consumeSensitiveEndpointRateLimit(
        request,
        "marketplace_campaign_application",
        `${influencerAuth.profile.id}:${request.params.campaignId}`,
      );
      if (throttle.blocked) {
        sendSensitiveRateLimitResponse(response, throttle);
        return;
      }

      const result = await submitMarketplaceCampaignApplication(
        influencerAuth,
        request.params.campaignId,
      );

      if (!result.ok) {
        response.status(result.status).json({ error: result.error });
        return;
      }

      response.status(result.alreadySubmitted ? 200 : 201).json({
        proposal: {
          id: result.proposal.id,
          status: result.proposal.status,
          campaign_id: result.proposal.campaign_id,
          target_handle: result.proposal.target_handle,
        },
        already_submitted: result.alreadySubmitted,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/advertiser/campaigns", async (request, response, next) => {
  try {
    const advertiserAuth = await requireAdvertiserSession(request, response);
    if (!advertiserAuth) return;

    const board = await readAdvertiserCampaignBoard(advertiserAuth);

    response.setHeader("Cache-Control", "no-store");
    response.json({
      brand: board.brand ?? null,
      campaigns: board.campaigns,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/advertiser/brand-image", async (request, response, next) => {
  try {
    const advertiserAuth = await requireAdvertiserSession(request, response);
    if (!advertiserAuth) return;

    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "advertiser_brand_image_upload",
      advertiserAuth.profile.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const file = parseEvidenceFile(request.body?.file ?? request.body?.image);
    const fileError = validateMarketplaceImageFile(file);
    if (fileError || !file) {
      response.status(422).json({ error: fileError ?? "Image file is invalid" });
      return;
    }

    const result = await saveAdvertiserMarketplaceBrandImage(
      advertiserAuth,
      file,
    );
    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }

    response.json({
      image_url: result.image_url,
      brand: result.brand,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/advertiser/campaigns", async (request, response, next) => {
  try {
    const advertiserAuth = await requireAdvertiserSession(request, response);
    if (!advertiserAuth) return;

    const result = await upsertAdvertiserMarketplaceCampaign(
      advertiserAuth,
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {},
    );

    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }

    response.status(201).json({
      brand: result.brand,
      campaign: result.campaign,
      campaigns: result.campaigns,
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/advertiser/campaigns/:id/status", async (request, response, next) => {
  try {
    const advertiserAuth = await requireAdvertiserSession(request, response);
    if (!advertiserAuth) return;

    const result = await updateAdvertiserMarketplaceCampaignStatus(
      advertiserAuth,
      request.params.id,
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {},
    );

    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }

    response.json({
      brand: result.brand,
      campaign: result.campaign,
      campaigns: result.campaigns,
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/advertiser/marketplace/proposals/:id/accept",
  async (request, response, next) => {
    try {
      const advertiserAuth = await requireAdvertiserSession(request, response);
      if (!advertiserAuth) return;

      const throttle = consumeSensitiveEndpointRateLimit(
        request,
        "marketplace_proposal_accept",
        `${advertiserAuth.profile.id}:${request.params.id}`,
      );
      if (throttle.blocked) {
        sendSensitiveRateLimitResponse(response, throttle);
        return;
      }

      const result = await createDraftContractFromMarketplaceApplication(
        advertiserAuth,
        request.params.id,
      );

      if (!result.ok) {
        response.status(result.status).json({ error: result.error });
        return;
      }

      response.status(result.status).json({
        contract: result.contract,
        already_converted: result.alreadyConverted,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/influencer/public-profile", async (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    const influencerAuth = await authenticateInfluencerRequest(request, response);

    if (!influencerAuth) {
      response.json({ authenticated: false, profile: null });
      return;
    }

    const profile =
      influencerAuth.profile ?? (await readProfileByUserId(influencerAuth.user.id));

    if (!profile || !isInfluencerRole(profile.role)) {
      response.status(403).json({ authenticated: false, profile: null });
      return;
    }

    response.json({
      authenticated: true,
      profile: await readStoredInfluencerPublicProfile(profile.id),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/influencer/public-profile/avatar", async (request, response, next) => {
  try {
    const influencerAuth = await requireInfluencerSession(request, response);
    if (!influencerAuth) return;

    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "influencer_avatar_upload",
      influencerAuth.profile.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const file = parseEvidenceFile(request.body?.file ?? request.body?.image);
    const fileError = validateMarketplaceImageFile(file);
    if (fileError || !file) {
      response.status(422).json({ error: fileError ?? "Image file is invalid" });
      return;
    }

    const result = await saveInfluencerMarketplaceAvatar(influencerAuth, file);
    if (!result.ok) {
      response.status(result.status).json({ error: result.error });
      return;
    }

    response.json({ image_url: result.image_url });
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
      const { ok: _ok, status, ...payload } = result;
      response.status(status).json(payload);
      return;
    }

    response.json({ profile: result.profile });
  } catch (error) {
    next(error);
  }
});

app.post("/api/influencer/public-profile/handle-appeal", async (request, response, next) => {
  try {
    const influencerAuth = await requireInfluencerSession(request, response);
    if (!influencerAuth) return;

    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "public_profile_handle_appeal",
      influencerAuth.profile.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const result = await submitInfluencerPublicHandleAppeal({
      authUser: influencerAuth.user,
      profile: influencerAuth.profile,
      body:
        request.body && typeof request.body === "object"
          ? (request.body as Record<string, unknown>)
          : {},
      request,
    });

    if (!result.ok) {
      const { ok: _ok, status, ...payload } = result;
      response.status(status).json(payload);
      return;
    }

    response.status(result.already_submitted ? 200 : 201).json({
      request: result.request,
      already_submitted: result.already_submitted,
    });
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
      invalidateAdvertiserDashboardCache();
      invalidateInfluencerDashboardCache();

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
      invalidateAdvertiserDashboardCache();
      invalidateInfluencerDashboardCache();

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
    const summaryParam = (
      normalizeOptionalText(request.query.summary) ?? ""
    ).toLowerCase();
    const summaryOnly =
      summaryParam === "1" || summaryParam === "true";

    if (role === "advertiser") {
      const advertiserAuth = await requireAdvertiserSession(request, response);
      if (!advertiserAuth) return;

      response.setHeader("Cache-Control", "no-store");
      response.json(
        await readMarketplaceMessagesForAdvertiser(advertiserAuth, {
          summaryOnly,
        }),
      );
      return;
    }

    if (role === "influencer") {
      const influencerAuth = await requireInfluencerSession(request, response);
      if (!influencerAuth) return;

      response.setHeader("Cache-Control", "no-store");
      response.json(
        await readMarketplaceMessagesForInfluencer(influencerAuth, {
          summaryOnly,
        }),
      );
      return;
    }

    response.status(422).json({ error: "role must be advertiser or influencer" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/webhooks/instagram", (request, response) => {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  const mode = normalizeOptionalText(request.query["hub.mode"]);
  const token = normalizeOptionalText(request.query["hub.verify_token"]);
  const challenge = normalizeOptionalText(request.query["hub.challenge"]);

  if (verifyToken && mode === "subscribe" && token === verifyToken && challenge) {
    response.status(200).send(challenge);
    return;
  }

  response.status(403).json({ error: "Instagram webhook verification failed" });
});

app.post("/api/webhooks/instagram", async (request, response, next) => {
  try {
    if (!process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()) {
      response.status(404).json({ error: "Instagram webhook is not configured" });
      return;
    }
    if (!verifyMetaWebhookSignature(request)) {
      response.status(401).json({ error: "Invalid Instagram webhook signature" });
      return;
    }

    const events = extractInstagramDmChallengeEvents(request.body);
    const updated = (
      await Promise.all(events.map((event) => applyInstagramDmChallengeEvent(event)))
    ).filter((record): record is VerificationRequestRecord => Boolean(record));

    response.json({ received: true, matched: updated.length });
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
        const profile =
          influencerAuth.profile ?? (await readProfileByUserId(influencerAuth.user.id));

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
        const profile =
          advertiserAuth.profile ?? (await readProfileByUserId(advertiserAuth.user.id));

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
    const businessStartDate = normalizeDateOnlyValue(
      request.body?.business_start_date,
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

    const businessAutomationCheck =
      await runBusinessRegistrationAutomationCheck(businessRegistrationNumber, {
        businessStartDate,
        representativeName,
        subjectName,
      });
    const now = new Date().toISOString();
    const requestId = randomUUID();
    const autoApprove = shouldAutoApproveBusinessVerification(businessAutomationCheck);
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
      status: autoApprove ? "approved" : "pending",
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
        business_start_date: businessStartDate,
        document_check_number: documentCheckNumber,
        automation: {
          business_registration: businessAutomationCheck,
        },
      }),
      note,
      reviewer_note: autoApprove
        ? "Auto-approved by NTS business status/validation automation."
        : undefined,
      submitted_ip: getClientIp(request),
      submitted_user_agent: request.header("user-agent") ?? "unknown",
      reviewed_by_name: autoApprove ? `${productName} automation` : undefined,
      reviewed_at: autoApprove ? now : undefined,
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
    const platformAccessToken = normalizeOptionalText(
      request.body?.platform_access_token,
    );
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
    if (ownershipMethod === "instagram_dm_code" && platform !== "instagram") {
      response.status(422).json({ error: "Instagram DM verification is only available for Instagram" });
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
    const platformAutomationCheck = await runPlatformAccountAutomationCheck({
      platform,
      platformHandle,
      platformUrl,
      proofUrl: ownershipChallengeUrl,
      ownershipMethod,
      challengeCode: ownershipChallengeCode,
      platformAccessToken,
    });
    const ownershipCheck =
      platformAutomationCheck.ownership_check ??
      ({
        status: buildAutomationOwnershipStatus(platformAutomationCheck.status),
        checked_at: platformAutomationCheck.checked_at,
        http_status: platformAutomationCheck.http_status,
      } satisfies {
        status: OwnershipCheckStatus;
        checked_at: string;
        http_status?: number;
      });
    const autoApprove = shouldAutoApprovePlatformVerification(
      platformAutomationCheck,
    );
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
      status: autoApprove ? "approved" : "pending",
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
          automation: {
            platform_account: platformAutomationCheck,
            ownership_challenge: ownershipCheck,
          },
        },
      }),
      note,
      reviewer_note: autoApprove
        ? "Auto-approved by platform ownership automation."
        : undefined,
      submitted_ip: getClientIp(request),
      submitted_user_agent: request.header("user-agent") ?? "unknown",
      reviewed_by_name: autoApprove ? `${productName} automation` : undefined,
      reviewed_at: autoApprove ? now : undefined,
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
      verification_requests: await readOperationalAdminVerificationRequests(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/verification-requests/:id/automation-check", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "admin_verification_automation_check",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    if (!requireAdminSession(request, response)) return;

    const record = (await readVerificationRequests()).find(
      (item) => item.id === request.params.id,
    );

    if (!record) {
      response.status(404).json({ error: "Verification request not found" });
      return;
    }

    const result = await rerunVerificationAutomation(record);
    response.json({
      request: result.record,
      automation: result.automation,
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

app.post("/api/contracts/:id/post-link", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "post_link_submit",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const postLink = normalizeUrlValue(
      request.body?.post_link ?? request.body?.url,
    );

    if (!postLink) {
      response.status(422).json({
        error: "Submitted post link must be an http(s) URL",
      });
      return;
    }

    const influencerAuth = await requireInfluencerSession(request, response);
    if (!influencerAuth) return;

    const {
      store,
      existingContract: contract,
    } = await readContractWriteContext(request.params.id);

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }
    if (!canInfluencerAccessLegacyContract(influencerAuth, contract)) {
      response.status(403).json({ error: "이 계약을 볼 권한이 없습니다." });
      return;
    }
    if (contract.status !== "SIGNED") {
      response.status(409).json({
        error: "Contract must be signed before post link can be submitted",
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedContract = normalizeContract({
      ...contract,
      post_link: postLink,
      workflow: {
        ...contract.workflow,
        next_actor: contract.workflow?.next_actor ?? "system",
        next_action:
          contract.workflow?.next_action ??
          "전자서명 완료 후 컨텐츠 제출을 기다리는 중입니다.",
        risk_level: contract.workflow?.risk_level ?? "low",
        last_message: "인플루언서가 컨텐츠 URL을 제출했습니다.",
      },
      audit_events: [
        ...(contract.audit_events ?? []),
        {
          id: randomUUID(),
          actor: "influencer",
          action: "post_link_submitted",
          description: "인플루언서가 컨텐츠 URL을 제출했습니다.",
          created_at: now,
        },
      ],
      updated_at: now,
    });

    await writeStore(upsertContractIntoStore(store, updatedContract));
    await insertContractEvent({
      contractId: contract.id,
      actorProfileId: influencerAuth.profile.id,
      actorRole: "influencer",
      actorDisplayName: influencerAuth.profile.name,
      eventType: "post_link_submitted",
      targetType: "contract",
      targetId: contract.id,
      payload: { has_url: true },
      request,
    });

    response.json({ contract: updatedContract, post_link: postLink });
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
      "컨텐츠";
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
    if (contract.status !== "SIGNED") {
      response.status(409).json({
        error: "Contract must be signed before deliverables can be reviewed",
      });
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

app.get("/api/influencer/dashboard/applications", async (request, response, next) => {
  try {
    const auth = await requireInfluencerSession(request, response);
    if (!auth) return;

    response.json({
      applications: await buildInfluencerDashboardApplications(auth.profile.id),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/contracts/:id/close", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "contract_close",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const advertiserAuth = await requireAdvertiserSession(request, response);
    if (!advertiserAuth) return;

    const {
      store,
      existingContract: contract,
    } = await readContractWriteContext(request.params.id);

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }
    if (!canAdvertiserAccessLegacyContract(advertiserAuth, contract)) {
      response.status(403).json({ error: "이 계약을 볼 권한이 없습니다." });
      return;
    }
    if (contract.status !== "SIGNED") {
      response.status(409).json({ error: "Contract must be signed before it can be closed" });
      return;
    }
    const settlementConfirmed =
      request.body?.settlement_confirmed === true ||
      request.body?.settlementConfirmed === true;
    if (!settlementConfirmed) {
      response.status(422).json({
        error: "정산 완료 확인 후 계약을 종료할 수 있습니다.",
      });
      return;
    }

    const bundle = await readContractDeliverableBundle(contract);
    const summary = buildDeliverableSummary(bundle.requirements, bundle.deliverables);
    if (summary.total <= 0 || summary.approved < summary.total) {
      response.status(409).json({
        error: "All required content must be approved before contract close",
        summary,
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedContract = normalizeContract({
      ...contract,
      status: "CLOSED",
      settlement: {
        ...(contract.settlement ?? {}),
        advertiser_confirmed_paid: true,
        advertiser_confirmed_at: now,
        advertiser_confirmed_by_profile_id: advertiserAuth.profile.id,
        advertiser_confirmed_by_name: advertiserAuth.profile.name,
        status: "confirmed_paid",
      },
      deliverable_summary: {
        ...summary,
        updated_at: now,
      },
      workflow: {
        next_actor: "system",
        next_action: "광고 계약 마감 완료",
        risk_level: "low",
        last_message: "광고 계약 마감 완료",
      },
      audit_events: [
        ...(contract.audit_events ?? []),
        {
          id: randomUUID(),
          actor: "advertiser",
          action: "contract_closed",
          description:
            "광고주가 필수 컨텐츠 승인과 정산 완료를 확인한 뒤 광고 계약을 마감했습니다.",
          created_at: now,
        },
      ],
      updated_at: now,
    });

    await writeStore(upsertContractIntoStore(store, updatedContract));
    if (useSupabaseV2 && isUuid(contract.id)) {
      await patchSupabaseRecord(
        "contracts",
        `?id=eq.${encodeURIComponent(contract.id)}`,
        {
          status: "completed",
          next_actor_role: null,
          next_action: "광고 계약 마감 완료",
          next_due_at: null,
          completed_at: now,
          updated_at: now,
        },
        "Supabase contract close update",
      );
    }
    await insertContractEvent({
      contractId: contract.id,
      actorProfileId: advertiserAuth.profile.id,
      actorRole: "advertiser",
      actorDisplayName: advertiserAuth.profile.name,
      eventType: "contract_closed",
      targetType: "contract",
      targetId: contract.id,
      payload: { summary, settlement_confirmed: true },
      request,
    });

    response.json({
      contract: updatedContract,
      summary,
      message: "광고 계약 마감 완료",
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
          description: "운영자가 당사자 요청에 따라 제출된 컨텐츠 파일을 내려받았습니다.",
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

    const contract = await readContractById(request.params.id);

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

    if (request.body?.support_consent_accepted !== true) {
      response.status(422).json({
        error: "Support access consent is required",
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
          description: `계약 당사자가 "${supportAccessConsentText}"에 동의하고 24시간 지원 열람을 허용했습니다.`,
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

    await enqueueSupportAccessOperationalAlert(record);

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
    const contract = await readContractById(request.params.id);

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

app.get("/api/contracts/:id/review-pdf", async (request, response, next) => {
  try {
    const throttle = consumeSensitiveEndpointRateLimit(
      request,
      "contract_review_pdf",
      request.params.id,
    );
    if (throttle.blocked) {
      sendSensitiveRateLimitResponse(response, throttle);
      return;
    }

    const contract = await readContractById(request.params.id);

    if (!contract) {
      response.status(404).json({ error: "Contract not found" });
      return;
    }

    const access = await resolveLegacyContractAccess(request, response, contract);
    if (!access) {
      return;
    }

    if (access.role === "admin") {
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
        description: "운영자가 당사자 요청에 따라 계약서 전체보기 PDF를 열람했습니다.",
        ip: getClientIp(request),
        user_agent: request.header("user-agent") ?? "unknown",
      });
    }

    const pdfBuffer = await buildContractReviewPdf(contract);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${contract.id}-review-contract.pdf"`,
    );
    response.send(pdfBuffer);
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

    const contract = await readContractById(request.params.id);

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
        next_action: "전자서명 완료 후 컨텐츠 제출을 기다리는 중입니다.",
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
          "사업자 인증 승인 후 계약 공유 링크를 발송할 수 있습니다.",
      });
      return;
    }

    let updatedContract = buildServerAuthoredContract(
      actor as Exclude<AuditActor, "system">,
      existingContract,
      normalizedContract,
    );

    if (actor === "advertiser") {
      updatedContract = {
        ...updatedContract,
        advertiser_trust: await buildAdvertiserTrustSnapshot(
          advertiserAuth!,
          updatedContract,
          store.contracts,
        ),
      };
    }

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
const staticSeoRoutePathSet = new Set<string>(staticSeoRoutePaths);

const resolvePreviewHtmlPath = (distDir: string, requestPath: string) => {
  const normalizedPath = normalizeSeoPath(requestPath);

  if (!staticSeoRoutePathSet.has(normalizedPath)) {
    return path.join(distDir, "index.html");
  }

  const routeHtmlPath =
    normalizedPath === "/"
      ? path.join(distDir, "index.html")
      : path.join(distDir, ...normalizedPath.split("/").filter(Boolean), "index.html");

  return fsSync.existsSync(routeHtmlPath)
    ? routeHtmlPath
    : path.join(distDir, "index.html");
};

if (!isVercelFunction) {
  warmDashboardDataCachesInBackground("startup");
}

if (!isVercelFunction) {
  const httpServer = createHttpServer(app);

  if (isPreview) {
    const distDir = path.join(root, ["di", "st"].join(""));
    app.use(
      express.static(distDir, {
        immutable: true,
        maxAge: "1y",
        redirect: false,
        setHeaders: (response, filePath) => {
          if (filePath.endsWith("index.html")) {
            response.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );
    app.get("*", (request, response) => {
      response.setHeader("Cache-Control", "no-cache");
      response.sendFile(resolvePreviewHtmlPath(distDir, request.path));
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
