export type InstagramFollowerMetricSource =
  | "instagram_user_profile_api"
  | "instagram_graph_api";

export type TrustedInstagramFollowerMetric = {
  followerCount: number;
  checkedAt: string;
  source: InstagramFollowerMetricSource;
  verificationRequestId: string;
};

export type InstagramBusinessFollowerResult =
  | {
      status: "available";
      followerCount: number;
      checkedAt: string;
      source: "instagram_graph_api";
    }
  | {
      status: "unavailable" | "not_configured";
      checkedAt: string;
      httpStatus?: number;
    };

export type InstagramReelPublicMetrics = {
  status: "available" | "unavailable";
  provider: "instagram_graph_api";
  scope: "business_discovery_public";
  checked_at: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
};

type InstagramVerificationRecord = {
  id?: string | null;
  status?: string | null;
  platform_handle?: string | null;
  ownership_verification_method?: string | null;
  data_origin?: string | null;
  evidence_snapshot_json?: Record<string, unknown> | null;
};

type InstagramChannelMetricRecord = {
  handle?: string | null;
  follower_count?: number | null;
  follower_count_synced_at?: string | null;
  follower_sync_status?: string | null;
  follower_sync_source?: string | null;
  follower_sync_metadata?: Record<string, unknown> | null;
};

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const normalizeInstagramMetricCount = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

export const normalizeInstagramMetricUsername = (value: unknown) => {
  const normalized = normalizeText(value).replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(normalized) ? normalized : "";
};

const normalizeIsoTime = (value: unknown) => {
  const normalized = normalizeText(value);
  const timestamp = Date.parse(normalized);
  return normalized && Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const readTrustedInstagramDmFollowerMetric = (
  record: InstagramVerificationRecord,
  operationalTest = false,
): TrustedInstagramFollowerMetric | undefined => {
  const requestId = normalizeText(record.id);
  if (
    operationalTest ||
    !isUuid(requestId) ||
    record.status !== "approved" ||
    record.data_origin !== "production" ||
    record.ownership_verification_method !== "instagram_dm_code"
  ) {
    return undefined;
  }
  const instagramDm = (
    record.evidence_snapshot_json?.ownership_verification as
      | { instagram_dm?: Record<string, unknown> }
      | undefined
  )?.instagram_dm;
  const requestedHandle = normalizeInstagramMetricUsername(
    record.platform_handle,
  );
  const verifiedHandle = normalizeInstagramMetricUsername(
    instagramDm?.verified_handle,
  );
  const followerCount = normalizeInstagramMetricCount(
    instagramDm?.follower_count,
  );
  const checkedAt = normalizeIsoTime(
    instagramDm?.follower_count_checked_at ?? instagramDm?.checked_at,
  );
  if (
    instagramDm?.state !== "verified" ||
    instagramDm?.follower_count_source !== "instagram_user_profile_api" ||
    !requestedHandle ||
    verifiedHandle !== requestedHandle ||
    followerCount === undefined ||
    !checkedAt
  ) {
    return undefined;
  }
  return {
    followerCount,
    checkedAt,
    source: "instagram_user_profile_api",
    verificationRequestId: requestId,
  };
};

export const readTrustedInstagramChannelFollowerMetric = (
  channel: InstagramChannelMetricRecord | undefined,
  request: Pick<InstagramVerificationRecord, "id" | "platform_handle">,
): TrustedInstagramFollowerMetric | undefined => {
  if (!channel) return undefined;
  const requestId = normalizeText(request.id);
  const expectedHandle = normalizeInstagramMetricUsername(
    request.platform_handle,
  );
  const channelHandle = normalizeInstagramMetricUsername(channel.handle);
  const followerCount = normalizeInstagramMetricCount(channel.follower_count);
  const checkedAt = normalizeIsoTime(
    channel.follower_count_synced_at ??
      channel.follower_sync_metadata?.checked_at,
  );
  const source = normalizeText(channel.follower_sync_source);
  const metadataRequestId = normalizeText(
    channel.follower_sync_metadata?.request_id,
  );
  if (
    !isUuid(requestId) ||
    metadataRequestId !== requestId ||
    channel.follower_sync_status !== "synced" ||
    channel.follower_sync_metadata?.verification_bound !== true ||
    !expectedHandle ||
    channelHandle !== expectedHandle ||
    followerCount === undefined ||
    !checkedAt ||
    (source !== "instagram_user_profile_api" &&
      source !== "instagram_graph_api")
  ) {
    return undefined;
  }
  return {
    followerCount,
    checkedAt,
    source,
    verificationRequestId: requestId,
  };
};

export const selectLatestInstagramFollowerMetric = (
  ...metrics: Array<TrustedInstagramFollowerMetric | undefined>
) =>
  metrics
    .filter((metric): metric is TrustedInstagramFollowerMetric => Boolean(metric))
    .sort((left, right) => Date.parse(right.checkedAt) - Date.parse(left.checkedAt))[0];

const fetchMetaJson = async <T>(
  url: URL,
  accessToken: string,
  timeoutMs: number,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T;
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchInstagramBusinessFollowerMetric = async ({
  accessToken,
  igUserId,
  graphVersion,
  username,
  timeoutMs = 4500,
}: {
  accessToken?: string;
  igUserId?: string;
  graphVersion: string;
  username: string;
  timeoutMs?: number;
}): Promise<InstagramBusinessFollowerResult> => {
  const checkedAt = new Date().toISOString();
  const normalizedUsername = normalizeInstagramMetricUsername(username);
  if (!accessToken || !igUserId || !normalizedUsername) {
    return { status: "not_configured", checkedAt };
  }
  try {
    const url = new URL(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(
        igUserId,
      )}`,
    );
    url.searchParams.set(
      "fields",
      `business_discovery.username(${normalizedUsername}){username,followers_count}`,
    );
    const response = await fetchMetaJson<{
      business_discovery?: {
        username?: unknown;
        followers_count?: unknown;
      };
    }>(url, accessToken, timeoutMs);
    const profile = response.payload.business_discovery;
    const returnedUsername = normalizeInstagramMetricUsername(profile?.username);
    const followerCount = normalizeInstagramMetricCount(
      profile?.followers_count,
    );
    if (
      !response.ok ||
      returnedUsername !== normalizedUsername ||
      followerCount === undefined
    ) {
      return {
        status: "unavailable",
        checkedAt,
        httpStatus: response.status,
      };
    }
    return {
      status: "available",
      followerCount,
      checkedAt,
      source: "instagram_graph_api",
    };
  } catch {
    return { status: "unavailable", checkedAt };
  }
};

export const normalizeInstagramReelUrl = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || hostname !== "instagram.com") {
      return undefined;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if ((parts[0] !== "reel" && parts[0] !== "reels") || !parts[1]) {
      return undefined;
    }
    const shortcode = parts[1];
    if (!/^[A-Za-z0-9_-]{5,64}$/.test(shortcode)) return undefined;
    return {
      shortcode,
      url: `https://www.instagram.com/reel/${shortcode}/`,
    };
  } catch {
    return undefined;
  }
};

export const fetchInstagramReelPublicMetrics = async ({
  accessToken,
  igUserId,
  graphVersion,
  username,
  reelUrl,
  timeoutMs = 5000,
}: {
  accessToken?: string;
  igUserId?: string;
  graphVersion: string;
  username: string;
  reelUrl: string;
  timeoutMs?: number;
}): Promise<InstagramReelPublicMetrics> => {
  const checkedAt = new Date().toISOString();
  const target = normalizeInstagramReelUrl(reelUrl);
  const normalizedUsername = normalizeInstagramMetricUsername(username);
  const unavailable = (): InstagramReelPublicMetrics => ({
    status: "unavailable",
    provider: "instagram_graph_api",
    scope: "business_discovery_public",
    checked_at: checkedAt,
  });
  if (!target || !accessToken || !igUserId || !normalizedUsername) {
    return unavailable();
  }
  try {
    const url = new URL(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(
        igUserId,
      )}`,
    );
    url.searchParams.set(
      "fields",
      `business_discovery.username(${normalizedUsername}){username,media.limit(100){permalink,media_type,media_product_type,like_count,comments_count}}`,
    );
    const response = await fetchMetaJson<{
      business_discovery?: {
        username?: unknown;
        media?: {
          data?: Array<{
            permalink?: unknown;
            media_type?: unknown;
            media_product_type?: unknown;
            like_count?: unknown;
            comments_count?: unknown;
          }>;
        };
      };
    }>(url, accessToken, timeoutMs);
    const profile = response.payload.business_discovery;
    if (
      !response.ok ||
      normalizeInstagramMetricUsername(profile?.username) !== normalizedUsername
    ) {
      return unavailable();
    }
    const media = profile?.media?.data?.find((item) => {
      const candidate = normalizeInstagramReelUrl(item.permalink);
      return candidate?.shortcode === target.shortcode;
    });
    if (!media) return unavailable();
    const likeCount = normalizeInstagramMetricCount(media.like_count);
    const commentsCount = normalizeInstagramMetricCount(media.comments_count);
    if (likeCount === undefined && commentsCount === undefined) {
      return unavailable();
    }
    return {
      status: "available",
      provider: "instagram_graph_api",
      scope: "business_discovery_public",
      checked_at: checkedAt,
      permalink: target.url,
      ...(likeCount === undefined ? {} : { like_count: likeCount }),
      ...(commentsCount === undefined
        ? {}
        : { comments_count: commentsCount }),
    };
  } catch {
    return unavailable();
  }
};
