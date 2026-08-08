export type VerificationMetricPlatform = "tiktok";

export type VerifiedPlatformChannelMetric = {
  status: "available";
  platform: VerificationMetricPlatform;
  metric: "follower_count";
  value: number;
  checked_at: string;
  source: "tiktok_user_info_api";
  verified_handle: string;
};

export type UnavailablePlatformChannelMetric = {
  status: "unavailable";
  platform: VerificationMetricPlatform;
  metric: "follower_count";
  checked_at: string;
  source: "tiktok_user_info_api";
  verified_handle: string;
  reason: "hidden" | "missing_or_invalid";
};

export type PlatformChannelMetricEvidence =
  | VerifiedPlatformChannelMetric
  | UnavailablePlatformChannelMetric;

type VerificationAutomationLike = {
  provider?: unknown;
  configured?: unknown;
  checked_at?: unknown;
  profile?: unknown;
};

type BuildVerifiedPlatformChannelMetricInput = {
  platform: string;
  platformHandle: string;
  platformAccessTokenProvided?: boolean;
  automation: VerificationAutomationLike;
};

type ApprovedPlatformVerificationLike = {
  target_type?: string | null;
  verification_type?: string | null;
  status?: string | null;
  data_origin?: string | null;
  platform?: string | null;
  platform_handle?: string | null;
  reviewed_at?: string | null;
  evidence_snapshot_json?: Record<string, unknown> | null;
};

const requiredText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const normalizeVerificationMetricHandle = (value: unknown) =>
  requiredText(value).replace(/^@+/, "").toLowerCase();

export const normalizeVerificationMetricCount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
};

export const bindOwnershipStatusToSubmittedIdentity = <T extends string>(
  status: T,
  identityMatches: boolean,
): T | "not_found" =>
  status === "matched" && !identityMatches ? "not_found" : status;

const normalizeCheckedAt = (value: unknown) => {
  const checkedAt = requiredText(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(checkedAt)) {
    return undefined;
  }
  return Number.isFinite(Date.parse(checkedAt)) ? checkedAt : undefined;
};

const readRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const buildVerifiedPlatformChannelMetric = ({
  platform,
  platformHandle,
  platformAccessTokenProvided = false,
  automation,
}: BuildVerifiedPlatformChannelMetricInput): PlatformChannelMetricEvidence | undefined => {
  const requestedHandle = normalizeVerificationMetricHandle(platformHandle);
  const checkedAt = normalizeCheckedAt(automation.checked_at);
  const profile = readRecord(automation.profile);
  if (!requestedHandle || !checkedAt || !profile || automation.configured !== true) {
    return undefined;
  }

  if (platform === "tiktok" && automation.provider === "tiktok_login_kit") {
    const apiHandle = normalizeVerificationMetricHandle(profile.username);
    const followerCount = normalizeVerificationMetricCount(profile.follower_count);
    if (
      !platformAccessTokenProvided ||
      profile.oauth_token_source !== "submitted_user_access_token" ||
      profile.user_info_api_succeeded !== true ||
      apiHandle !== requestedHandle
    ) {
      return undefined;
    }
    if (followerCount === undefined) {
      return {
        status: "unavailable",
        platform: "tiktok",
        metric: "follower_count",
        checked_at: checkedAt,
        source: "tiktok_user_info_api",
        verified_handle: requestedHandle,
        reason: "missing_or_invalid",
      };
    }
    return {
      status: "available",
      platform: "tiktok",
      metric: "follower_count",
      value: followerCount,
      checked_at: checkedAt,
      source: "tiktok_user_info_api",
      verified_handle: requestedHandle,
    };
  }

  return undefined;
};

export const readVerifiedPlatformChannelMetric = (
  record: ApprovedPlatformVerificationLike,
  operationalTest = false,
): VerifiedPlatformChannelMetric | undefined => {
  if (
    operationalTest ||
    record.target_type !== "influencer_account" ||
    record.verification_type !== "platform_account" ||
    record.status !== "approved" ||
    record.data_origin !== "production" ||
    !record.reviewed_at
  ) {
    return undefined;
  }
  const platform = record.platform;
  if (platform !== "tiktok") return undefined;
  const ownershipVerification = readRecord(
    record.evidence_snapshot_json?.ownership_verification,
  );
  const metric = readRecord(ownershipVerification?.channel_metric);
  if (
    !metric ||
    metric.status !== "available" ||
    metric.platform !== platform
  ) {
    return undefined;
  }

  const expectedMetric = "follower_count";
  const expectedSource = "tiktok_user_info_api";
  const requestedHandle = normalizeVerificationMetricHandle(
    record.platform_handle,
  );
  const verifiedHandle = normalizeVerificationMetricHandle(
    metric.verified_handle,
  );
  const value = normalizeVerificationMetricCount(metric.value);
  const checkedAt = normalizeCheckedAt(metric.checked_at);
  if (
    !requestedHandle ||
    verifiedHandle !== requestedHandle ||
    metric.metric !== expectedMetric ||
    metric.source !== expectedSource ||
    value === undefined ||
    !checkedAt
  ) {
    return undefined;
  }
  return {
    status: "available",
    platform,
    metric: expectedMetric,
    value,
    checked_at: checkedAt,
    source: expectedSource,
    verified_handle: requestedHandle,
  };
};

export const shouldInvalidateApprovedPlatformChannelCache = (
  record: ApprovedPlatformVerificationLike,
  operationalTest = false,
) =>
  !operationalTest &&
  record.target_type === "influencer_account" &&
  record.verification_type === "platform_account" &&
  record.status === "approved" &&
  record.data_origin === "production" &&
  Boolean(record.reviewed_at) &&
  (record.platform === "youtube" ||
    record.platform === "tiktok" ||
    record.platform === "naver_blog") &&
  Boolean(normalizeVerificationMetricHandle(record.platform_handle));
