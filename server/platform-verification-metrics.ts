export type VerificationMetricPlatform = "youtube" | "tiktok";

export type VerifiedPlatformChannelMetric = {
  status: "available";
  platform: VerificationMetricPlatform;
  metric: "subscriber_count" | "follower_count";
  value: number;
  checked_at: string;
  source: "youtube_data_api" | "tiktok_user_info_api";
  verified_handle: string;
  approximate?: boolean;
};

export type UnavailablePlatformChannelMetric = {
  status: "unavailable";
  platform: VerificationMetricPlatform;
  metric: "subscriber_count" | "follower_count";
  checked_at: string;
  source: "youtube_data_api" | "tiktok_user_info_api";
  verified_handle: string;
  reason: "hidden" | "missing_or_invalid";
};

export type PlatformChannelMetricEvidence =
  | VerifiedPlatformChannelMetric
  | UnavailablePlatformChannelMetric;

export type NaverBlogSelfReportedChannelMetric = {
  status: "available";
  platform: "naver_blog";
  metric: "average_daily_visitors_4d";
  value: number;
  period_days: 4;
  source: "creator_self_report";
  trust: "self_reported";
  reported_at: string;
  reported_handle: string;
};

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

export const buildNaverBlogSelfReportedChannelMetric = ({
  platformHandle,
  value,
  reportedAt,
}: {
  platformHandle: string;
  value: unknown;
  reportedAt: unknown;
}): NaverBlogSelfReportedChannelMetric | undefined => {
  const reportedHandle = normalizeVerificationMetricHandle(platformHandle);
  const normalizedValue = normalizeVerificationMetricCount(value);
  const normalizedReportedAt = normalizeCheckedAt(reportedAt);
  if (
    !reportedHandle ||
    normalizedValue === undefined ||
    !normalizedReportedAt
  ) {
    return undefined;
  }
  return {
    status: "available",
    platform: "naver_blog",
    metric: "average_daily_visitors_4d",
    value: normalizedValue,
    period_days: 4,
    source: "creator_self_report",
    trust: "self_reported",
    reported_at: normalizedReportedAt,
    reported_handle: reportedHandle,
  };
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

  if (platform === "youtube" && automation.provider === "youtube_data_api") {
    const apiHandle = normalizeVerificationMetricHandle(profile.custom_url);
    const channelId = requiredText(profile.channel_id);
    const submittedAsChannelId =
      /^UC[a-zA-Z0-9_-]{20,}$/.test(platformHandle.trim()) &&
      platformHandle.trim() === channelId;
    const accountBound =
      apiHandle === requestedHandle ||
      submittedAsChannelId;
    const subscriberCount = normalizeVerificationMetricCount(
      profile.subscriber_count,
    );
    if (profile.channel_api_succeeded !== true || !accountBound) {
      return undefined;
    }
    if (
      profile.hidden_subscriber_count !== false ||
      subscriberCount === undefined
    ) {
      return {
        status: "unavailable",
        platform: "youtube",
        metric: "subscriber_count",
        checked_at: checkedAt,
        source: "youtube_data_api",
        verified_handle: requestedHandle,
        reason:
          profile.hidden_subscriber_count === true
            ? "hidden"
            : "missing_or_invalid",
      };
    }
    return {
      status: "available",
      platform: "youtube",
      metric: "subscriber_count",
      value: subscriberCount,
      checked_at: checkedAt,
      source: "youtube_data_api",
      verified_handle: requestedHandle,
      approximate: true,
    };
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
  if (platform !== "youtube" && platform !== "tiktok") return undefined;
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

  const expectedMetric =
    platform === "youtube" ? "subscriber_count" : "follower_count";
  const expectedSource =
    platform === "youtube" ? "youtube_data_api" : "tiktok_user_info_api";
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
    ...(platform === "youtube" && metric.approximate === true
      ? { approximate: true }
      : {}),
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
