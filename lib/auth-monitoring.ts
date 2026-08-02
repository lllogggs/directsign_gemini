import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";

export type AuthMetricOperation =
  | "user_signup"
  | "user_login"
  | "admin_login"
  | "admin_mfa_enroll"
  | "admin_mfa_challenge"
  | "admin_mfa_verify"
  | "recent_auth_issue"
  | "recent_auth_consume"
  | "session_validate"
  | "session_refresh"
  | "session_logout"
  | "session_revoke"
  | "password_reset";

export type AuthMetricRole =
  | "anonymous"
  | "marketer"
  | "influencer"
  | "admin"
  | "system";

export type AuthMetricOutcome =
  | "success"
  | "rejected"
  | "required"
  | "expired"
  | "revoked"
  | "invalid"
  | "rate_limited"
  | "provider_error"
  | "storage_error"
  | "unavailable";

export type AuthMetricDataOrigin = "production" | "qa" | "demo" | "seed";

export type OperationalAuthMetric = {
  operation: AuthMetricOperation;
  role: AuthMetricRole;
  outcome: AuthMetricOutcome;
  latencyMs: number;
  dataOrigin?: AuthMetricDataOrigin;
};

type AuthHealthAlertAction =
  | "provider_degraded"
  | "terminal_spike"
  | "revoke_failed"
  | "rate_limit_spike";

type MetricBucket = {
  bucket_minute: string;
  operation: AuthMetricOperation;
  role: AuthMetricRole;
  outcome: AuthMetricOutcome;
  request_count: number | string;
};

const getSupabaseUrl = () =>
  process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const getSupabaseServiceRoleKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim();
const isProductionRuntime = () =>
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.VERCEL || process.env.VERCEL_REGION);
const authAlertWindowMinutes = readPositiveInteger(
  process.env.AUTH_ALERT_WINDOW_MINUTES,
  10,
  60,
);
const authAlertCooldownMinutes = readPositiveInteger(
  process.env.AUTH_ALERT_COOLDOWN_MINUTES,
  15,
  120,
);
const authAlertProviderThreshold = readPositiveInteger(
  process.env.AUTH_ALERT_PROVIDER_ERROR_THRESHOLD,
  5,
  1000,
);
const authAlertTerminalThreshold = readPositiveInteger(
  process.env.AUTH_ALERT_TERMINAL_THRESHOLD,
  20,
  5000,
);
const authAlertRateLimitThreshold = readPositiveInteger(
  process.env.AUTH_ALERT_RATE_LIMIT_THRESHOLD,
  10,
  5000,
);

const knownNonProductionIdentityLocalParts = new Set([
  "brand-demo",
  "breadroom.manager",
  "breadroom",
  "brewinglab",
  "creator-demo",
  "creator.sora",
  "harin.log",
  "haru.fit",
  "housefit",
  "jian.home",
  "luna.day",
  "minseo.home",
  "moa.review",
  "narae.shorts",
  "nightcare",
  "obre-beauty",
  "only.routine",
  "raon.beauty",
  "review.j",
  "romi.review",
  "serin.daily",
  "sodam.pick",
  "sua.pick",
  "test.influencer",
  "today.taste",
  "yuna.beauty",
  "ziyu.log",
]);

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(maximum, Math.floor(parsed))
    : fallback;
}

function looksLikeTestIdentity(identifier: string | undefined) {
  const normalized = identifier?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  const localPart = normalized.split("@", 1)[0];
  const domain = normalized.includes("@")
    ? normalized.slice(normalized.lastIndexOf("@") + 1)
    : "";
  return (
    (domain === "yeollock.me" &&
      knownNonProductionIdentityLocalParts.has(localPart)) ||
    /(^|[+._-])(qa|test|testing|demo|seed)([+._@-]|$)/i.test(normalized) ||
    /@(example\.(com|org|net)|directsign\.app)$/i.test(normalized)
  );
}

export function classifyAuthMetricDataOrigin({
  identifier,
  explicit,
}: {
  identifier?: string;
  explicit?: string | null;
}): AuthMetricDataOrigin | undefined {
  const normalized = explicit?.trim().toLowerCase();
  if (normalized === "qa" || normalized === "demo" || normalized === "seed") {
    return normalized;
  }
  if (looksLikeTestIdentity(identifier)) return "qa";
  if (normalized === "production") return "production";
  return isProductionRuntime() && Boolean(identifier?.trim())
    ? "production"
    : undefined;
}

const serviceHeaders = () => {
  const supabaseServiceRoleKey = getSupabaseServiceRoleKey();
  if (!supabaseServiceRoleKey) return undefined;
  return {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
  };
};

async function recordMetric(metric: OperationalAuthMetric) {
  const supabaseUrl = getSupabaseUrl();
  const headers = serviceHeaders();
  if (!supabaseUrl || !headers || metric.dataOrigin !== "production") return false;
  const latencyMs = Math.max(
    0,
    Math.min(3_600_000, Math.round(Number(metric.latencyMs) || 0)),
  );
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/record_operational_auth_metric`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_operation: metric.operation,
        p_role: metric.role,
        p_outcome: metric.outcome,
        p_latency_ms: latencyMs,
        p_data_origin: metric.dataOrigin,
      }),
      signal: AbortSignal.timeout(1_500),
    },
  );
  return response.ok;
}

function candidateAlert(metric: OperationalAuthMetric): AuthHealthAlertAction | undefined {
  if (metric.outcome === "rate_limited") return "rate_limit_spike";
  if (
    metric.operation === "session_revoke" &&
    metric.outcome !== "success" &&
    metric.outcome !== "revoked"
  ) {
    return "revoke_failed";
  }
  if (
    metric.outcome === "provider_error" ||
    metric.outcome === "storage_error" ||
    metric.outcome === "unavailable"
  ) {
    return "provider_degraded";
  }
  if (
    (metric.operation === "session_validate" ||
      metric.operation === "session_refresh") &&
    (metric.outcome === "invalid" ||
      metric.outcome === "revoked" ||
      metric.outcome === "expired")
  ) {
    return "terminal_spike";
  }
  return undefined;
}

function bucketMatchesAlert(bucket: MetricBucket, action: AuthHealthAlertAction) {
  if (action === "rate_limit_spike") return bucket.outcome === "rate_limited";
  if (action === "revoke_failed") {
    return (
      bucket.operation === "session_revoke" &&
      ["provider_error", "storage_error", "unavailable"].includes(bucket.outcome)
    );
  }
  if (action === "provider_degraded") {
    return ["provider_error", "storage_error", "unavailable"].includes(
      bucket.outcome,
    );
  }
  return (
    ["session_validate", "session_refresh"].includes(bucket.operation) &&
    ["invalid", "revoked", "expired"].includes(bucket.outcome)
  );
}

function alertThreshold(action: AuthHealthAlertAction) {
  if (action === "provider_degraded") return authAlertProviderThreshold;
  if (action === "terminal_spike") return authAlertTerminalThreshold;
  if (action === "rate_limit_spike") return authAlertRateLimitThreshold;
  return 1;
}

function cooldownBucket(now = Date.now()) {
  const widthMs = authAlertCooldownMinutes * 60_000;
  return new Date(Math.floor(now / widthMs) * widthMs).toISOString();
}

async function dispatchDiscordAlert(alert: {
  id: string;
  action: AuthHealthAlertAction;
  title: string;
  body: string;
}) {
  const webhook = process.env.DISCORD_OPERATIONS_WEBHOOK_URL?.trim();
  const botToken = process.env.DISCORD_OPERATIONS_BOT_TOKEN?.trim();
  const channelId = process.env.DISCORD_OPERATIONS_CHANNEL_ID?.trim();
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "") || "https://yeollock.me";
  const payload = {
    username: "연락미 운영",
    content: `인증 상태 확인 · ${alert.title}`,
    embeds: [
      {
        title: alert.title,
        description: `${alert.body}\n\n[운영 화면](${appUrl}/admin/mobile?item=auth_health:${alert.id})`,
        color: 0xdc2626,
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };

  let response: Response | undefined;
  if (webhook) {
    const parsed = new URL(webhook);
    if (
      parsed.protocol !== "https:" ||
      !["discord.com", "discordapp.com"].includes(parsed.hostname)
    ) {
      return false;
    }
    response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } else if (botToken && channelId && /^\d+$/.test(channelId)) {
    const { username: _username, ...message } = payload;
    response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(5_000),
      },
    );
  }
  if (!response) return false;
  return response.ok;
}

async function evaluateAndAlert(metric: OperationalAuthMetric) {
  const action = candidateAlert(metric);
  const supabaseUrl = getSupabaseUrl();
  const headers = serviceHeaders();
  if (!action || !supabaseUrl || !headers) return;
  const since = new Date(Date.now() - authAlertWindowMinutes * 60_000).toISOString();
  const metricResponse = await fetch(
    `${supabaseUrl}/rest/v1/operational_auth_metric_buckets?select=bucket_minute,operation,role,outcome,request_count&bucket_minute=gte.${encodeURIComponent(
      since,
    )}`,
    { headers, signal: AbortSignal.timeout(1_500) },
  );
  if (!metricResponse.ok) return;
  const buckets = (await metricResponse.json()) as MetricBucket[];
  const count = buckets
    .filter((bucket) => bucketMatchesAlert(bucket, action))
    .reduce((sum, bucket) => sum + Number(bucket.request_count || 0), 0);
  if (count < alertThreshold(action)) return;

  const cooldown = cooldownBucket();
  const alertId = randomUUID();
  const labels: Record<AuthHealthAlertAction, { title: string; body: string }> = {
    provider_degraded: {
      title: "인증 공급자 오류 증가",
      body: `최근 ${authAlertWindowMinutes}분 동안 인증 공급자 오류가 ${count}건 집계되었습니다.`,
    },
    terminal_spike: {
      title: "로그인 세션 종료 증가",
      body: `최근 ${authAlertWindowMinutes}분 동안 만료·취소·무효 세션이 ${count}건 집계되었습니다.`,
    },
    revoke_failed: {
      title: "세션 종료 처리 실패",
      body: `최근 ${authAlertWindowMinutes}분 동안 세션 종료 실패가 ${count}건 집계되었습니다.`,
    },
    rate_limit_spike: {
      title: "인증 요청 제한 증가",
      body: `최근 ${authAlertWindowMinutes}분 동안 인증 요청 제한이 ${count}건 집계되었습니다.`,
    },
  };
  const label = labels[action];
  const insertResponse = await fetch(
    `${supabaseUrl}/rest/v1/operational_alert_events?on_conflict=dedupe_key`,
    {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify([
        {
          id: alertId,
          kind: "auth_health",
          action,
          severity: action === "rate_limit_spike" ? "high" : "urgent",
          status: "queued",
          subject_type: "authentication_health",
          subject_id: `${action}:${cooldown}`,
          title: label.title,
          body: label.body,
          mobile_path: `/admin/mobile?item=auth_health:${alertId}`,
          dashboard_path: "/admin",
          dedupe_key: `auth_health:${action}:${cooldown}`,
          decision_reason: `threshold=${alertThreshold(action)};window_minutes=${authAlertWindowMinutes}`,
          metadata_json: {
            aggregate_count: count,
            window_minutes: authAlertWindowMinutes,
            cooldown_minutes: authAlertCooldownMinutes,
          },
        },
      ]),
      signal: AbortSignal.timeout(1_500),
    },
  );
  if (!insertResponse.ok) return;
  const inserted = (await insertResponse.json()) as Array<{ id: string }>;
  const alert = inserted[0];
  if (!alert) return;

  const sent = await dispatchDiscordAlert({ id: alert.id, action, ...label });
  if (!sent) return;
  await fetch(
    `${supabaseUrl}/rest/v1/operational_alert_events?id=eq.${encodeURIComponent(
      alert.id,
    )}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      }),
      signal: AbortSignal.timeout(1_500),
    },
  );
}

async function recordAndEvaluate(metric: OperationalAuthMetric) {
  try {
    if (!(await recordMetric(metric))) return;
    await evaluateAndAlert(metric);
  } catch {
    // Monitoring must never change authentication availability or expose secrets.
  }
}

export function observeOperationalAuthMetric(metric: OperationalAuthMetric) {
  const task = recordAndEvaluate(metric);
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}
