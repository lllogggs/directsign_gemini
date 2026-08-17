export const ADMIN_ANALYTICS_RANGE_DAYS = [7, 30, 90] as const;

export type AdminAnalyticsRangeDays = (typeof ADMIN_ANALYTICS_RANGE_DAYS)[number];

export type AdminAnalyticsComparison = {
  current: number;
  previous: number;
  delta_percent: number | null;
};

export type AdminAnalyticsDailyPageView = {
  date: string;
  label: string;
  page_views: number;
};

export type AdminAnalyticsPageBreakdown = {
  page_key: string;
  label: string;
  current: number;
  previous: number;
  delta_percent: number | null;
};

export type AdminAnalyticsAuthDaily = {
  date: string;
  label: string;
  requests: number;
  failed_requests: number;
  service_errors: number;
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
};

export type AdminAnalyticsAuthSummary = {
  available: boolean;
  requests: number;
  failed_requests: number;
  service_errors: number;
  failure_rate_percent: number | null;
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
};

export type AdminAnalyticsSystemStatus = {
  key: "operational_data" | "page_views" | "auth_metrics" | "alerts";
  label: string;
  status: "healthy" | "attention" | "unavailable" | "no_data";
  detail: string;
};

export type AdminAnalyticsResponse = {
  generated_at: string;
  source: "supabase" | "unavailable";
  range: {
    days: AdminAnalyticsRangeDays;
    start_date: string;
    end_date: string;
    previous_start_date: string;
    previous_end_date: string;
  };
  overview: {
    page_views: AdminAnalyticsComparison;
    contracts_created: AdminAnalyticsComparison;
    support_tickets: AdminAnalyticsComparison;
    verification_requests: AdminAnalyticsComparison;
    active_contracts: number;
  };
  daily_page_views: AdminAnalyticsDailyPageView[];
  page_breakdown: AdminAnalyticsPageBreakdown[];
  auth_health: {
    current: AdminAnalyticsAuthSummary;
    previous: AdminAnalyticsAuthSummary;
    daily: AdminAnalyticsAuthDaily[];
  };
  queue: {
    pending_verification: number;
    open_support_tickets: number;
    active_support_access: number;
    pending_operational_alerts: number;
  };
  system_status: AdminAnalyticsSystemStatus[];
};

export const isAdminAnalyticsRangeDays = (
  value: unknown,
): value is AdminAnalyticsRangeDays =>
  ADMIN_ANALYTICS_RANGE_DAYS.includes(value as AdminAnalyticsRangeDays);

export const calculateAnalyticsDeltaPercent = (
  current: number,
  previous: number,
) => {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

export const buildAnalyticsDateKeys = (endDateKey: string, days: number) => {
  const end = new Date(`${endDateKey}T00:00:00Z`);
  if (!Number.isFinite(end.getTime()) || !Number.isInteger(days) || days <= 0) {
    return [] as string[];
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return date.toISOString().slice(0, 10);
  });
};

export const formatAnalyticsDateLabel = (dateKey: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  return match ? `${Number(match[2])}/${Number(match[3])}` : dateKey;
};
