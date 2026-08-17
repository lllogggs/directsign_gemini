import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Download,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BrandLogo } from "../../components/BrandLogo";
import { apiFetch } from "../../domain/api";
import {
  ADMIN_ANALYTICS_RANGE_DAYS,
  type AdminAnalyticsComparison,
  type AdminAnalyticsPageBreakdown,
  type AdminAnalyticsRangeDays,
  type AdminAnalyticsResponse,
  type AdminAnalyticsSystemStatus,
} from "../../domain/adminAnalytics";

type AdminSessionState = "checking" | "authenticated" | "unauthenticated";

type MetricCardKey =
  | "page_views"
  | "contracts_created"
  | "support_tickets"
  | "verification_requests"
  | "active_contracts";

const metricCardOptions: Array<{ key: MetricCardKey; label: string }> = [
  { key: "page_views", label: "공개 페이지 조회수" },
  { key: "contracts_created", label: "생성 계약" },
  { key: "support_tickets", label: "접수 문의" },
  { key: "verification_requests", label: "인증 요청" },
  { key: "active_contracts", label: "활성 계약" },
];

const numberFormatter = new Intl.NumberFormat("ko-KR");

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : numberFormatter.format(value);

const formatDateRange = (startDate: string, endDate: string) =>
  `${startDate.replaceAll("-", ".")} – ${endDate.replaceAll("-", ".")}`;

const formatGeneratedAt = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "방금 전";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatDelta = (value: number | null) => {
  if (value === null) return { label: "비교 데이터 없음", tone: "muted" as const };
  if (value === 0) return { label: "변화 없음", tone: "neutral" as const };
  return {
    label: `${value > 0 ? "+" : ""}${value.toFixed(1)}%`,
    tone: value > 0 ? ("positive" as const) : ("negative" as const),
  };
};

const formatAxisValue = (value: number | string) =>
  numberFormatter.format(Number(value) || 0);

const escapeCsvCell = (value: string | number | null | undefined) => {
  const normalized = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
};

const buildAnalyticsCsv = (analytics: AdminAnalyticsResponse) => {
  const rows: Array<Array<string | number | null | undefined>> = [
    ["연락미 운영 분석센터"],
    ["분석 기간", formatDateRange(analytics.range.start_date, analytics.range.end_date)],
    ["이전 기간", formatDateRange(analytics.range.previous_start_date, analytics.range.previous_end_date)],
    [],
    ["핵심 지표", "현재 기간", "이전 기간", "변화율"],
    ["공개 페이지 조회수", analytics.overview.page_views.current, analytics.overview.page_views.previous, analytics.overview.page_views.delta_percent === null ? "비교 데이터 없음" : `${analytics.overview.page_views.delta_percent}%`],
    ["생성 계약", analytics.overview.contracts_created.current, analytics.overview.contracts_created.previous, analytics.overview.contracts_created.delta_percent === null ? "비교 데이터 없음" : `${analytics.overview.contracts_created.delta_percent}%`],
    ["접수 문의", analytics.overview.support_tickets.current, analytics.overview.support_tickets.previous, analytics.overview.support_tickets.delta_percent === null ? "비교 데이터 없음" : `${analytics.overview.support_tickets.delta_percent}%`],
    ["인증 요청", analytics.overview.verification_requests.current, analytics.overview.verification_requests.previous, analytics.overview.verification_requests.delta_percent === null ? "비교 데이터 없음" : `${analytics.overview.verification_requests.delta_percent}%`],
    ["활성 계약", analytics.overview.active_contracts],
    [],
    ["일자별 공개 페이지 조회수", "조회수"],
    ...analytics.daily_page_views.map((row) => [row.date, row.page_views]),
    [],
    ["페이지별 조회수", "현재 기간", "이전 기간", "변화율"],
    ...analytics.page_breakdown.map((row) => [
      row.label,
      row.current,
      row.previous,
      row.delta_percent === null ? "비교 데이터 없음" : `${row.delta_percent}%`,
    ]),
    [],
    ["인증 성능", "현재 기간", "이전 기간"],
    ["인증 요청", analytics.auth_health.current.requests, analytics.auth_health.previous.requests],
    ["실패 요청", analytics.auth_health.current.failed_requests, analytics.auth_health.previous.failed_requests],
    ["서비스 오류", analytics.auth_health.current.service_errors, analytics.auth_health.previous.service_errors],
    ["실패율", analytics.auth_health.current.failure_rate_percent === null ? "비교 데이터 없음" : `${analytics.auth_health.current.failure_rate_percent}%`, analytics.auth_health.previous.failure_rate_percent === null ? "비교 데이터 없음" : `${analytics.auth_health.previous.failure_rate_percent}%`],
    ["평균 지연(ms)", analytics.auth_health.current.avg_latency_ms, analytics.auth_health.previous.avg_latency_ms],
    ["최대 지연(ms)", analytics.auth_health.current.max_latency_ms, analytics.auth_health.previous.max_latency_ms],
  ];

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
};

function MetricCard({
  comparison,
  icon,
  label,
  snapshot,
}: {
  comparison?: AdminAnalyticsComparison;
  icon: React.ReactNode;
  label: string;
  snapshot?: number;
}) {
  const delta = comparison ? formatDelta(comparison.delta_percent) : undefined;
  return (
    <article className="rounded-[18px] border border-neutral-200/90 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-neutral-600">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        {delta ? (
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
              delta.tone === "positive"
                ? "bg-blue-50 text-blue-700"
                : delta.tone === "negative"
                  ? "bg-rose-50 text-rose-700"
                  : delta.tone === "neutral"
                    ? "bg-neutral-100 text-neutral-600"
                    : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {delta.label}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-500">
            현재 보유
          </span>
        )}
      </div>
      <p className="mt-5 text-[30px] font-semibold tracking-[-0.05em] text-neutral-950">
        {formatNumber(comparison?.current ?? snapshot)}
      </p>
      <p className="mt-1 text-xs font-medium text-neutral-500">
        {comparison ? `이전 기간 ${formatNumber(comparison.previous)}` : "현재 운영 중인 계약"}
      </p>
    </article>
  );
}

function ChartEmptyState({
  detail,
  icon = <BarChart3 className="h-5 w-5" />,
}: {
  detail: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 px-5 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-neutral-400 shadow-sm">
        {icon}
      </span>
      <p className="mt-3 text-sm font-bold text-neutral-700">표시할 집계가 없습니다</p>
      <p className="mt-1 max-w-[320px] text-xs font-medium leading-5 text-neutral-500">
        {detail}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminAnalyticsSystemStatus["status"] }) {
  const labels: Record<AdminAnalyticsSystemStatus["status"], string> = {
    healthy: "정상",
    attention: "확인 필요",
    unavailable: "연결 안 됨",
    no_data: "데이터 없음",
  };
  const classes: Record<AdminAnalyticsSystemStatus["status"], string> = {
    healthy: "bg-blue-50 text-blue-700",
    attention: "bg-amber-50 text-amber-700",
    unavailable: "bg-neutral-100 text-neutral-600",
    no_data: "bg-neutral-100 text-neutral-500",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

function statusIcon(status: AdminAnalyticsSystemStatus["status"]) {
  if (status === "healthy") return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
  if (status === "attention") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <Database className="h-4 w-4 text-neutral-400" />;
}

function AuthHealthMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 px-3 py-3">
      <p className="text-[11px] font-bold text-neutral-500">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-neutral-950">
        {value}
      </p>
    </div>
  );
}

function PageBreakdownTable({ rows }: { rows: AdminAnalyticsPageBreakdown[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
            <th className="border-b border-neutral-200 px-3 py-3 font-bold">페이지</th>
            <th className="border-b border-neutral-200 px-3 py-3 text-right font-bold">현재</th>
            <th className="border-b border-neutral-200 px-3 py-3 text-right font-bold">이전</th>
            <th className="border-b border-neutral-200 px-3 py-3 text-right font-bold">변화율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const delta = formatDelta(row.delta_percent);
            return (
              <tr key={row.page_key} className="text-sm">
                <td className="border-b border-neutral-100 px-3 py-3 font-semibold text-neutral-800">
                  {row.label}
                </td>
                <td className="border-b border-neutral-100 px-3 py-3 text-right font-semibold text-neutral-950">
                  {formatNumber(row.current)}
                </td>
                <td className="border-b border-neutral-100 px-3 py-3 text-right font-medium text-neutral-500">
                  {formatNumber(row.previous)}
                </td>
                <td className="border-b border-neutral-100 px-3 py-3 text-right">
                  <span
                    className={`font-bold ${
                      delta.tone === "positive"
                        ? "text-blue-700"
                        : delta.tone === "negative"
                          ? "text-rose-700"
                          : "text-neutral-500"
                    }`}
                  >
                    {delta.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminAnalyticsDashboard() {
  const navigate = useNavigate();
  const [sessionState, setSessionState] = useState<AdminSessionState>("checking");
  const [range, setRange] = useState<AdminAnalyticsRangeDays>(30);
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [visibleCards, setVisibleCards] = useState<MetricCardKey[]>(
    metricCardOptions.map((option) => option.key),
  );
  const analyticsRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const response = await apiFetch("/api/admin/session", {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json()) as { authenticated?: boolean };
        if (!cancelled) {
          setSessionState(data.authenticated === true ? "authenticated" : "unauthenticated");
        }
      } catch {
        if (!cancelled) {
          setSessionState("unauthenticated");
          setError("운영자 세션을 확인하지 못했습니다.");
        }
      }
    };
    void checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAnalytics = useCallback(async (signal?: AbortSignal) => {
    if (sessionState !== "authenticated") return;
    const requestId = analyticsRequestIdRef.current + 1;
    analyticsRequestIdRef.current = requestId;
    setIsLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/admin/analytics?range=${range}`, {
        headers: { Accept: "application/json" },
        signal,
      });
      const data = (await response.json()) as {
        analytics?: AdminAnalyticsResponse;
        error?: string;
      };
      if (!response.ok || !data.analytics) {
        throw new Error(data.error || "운영 분석 데이터를 불러오지 못했습니다.");
      }
      if (requestId === analyticsRequestIdRef.current && !signal?.aborted) {
        setAnalytics(data.analytics);
      }
    } catch (loadError) {
      if (signal?.aborted) return;
      if (requestId === analyticsRequestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : "운영 분석 데이터를 불러오지 못했습니다.");
      }
    } finally {
      if (requestId === analyticsRequestIdRef.current && !signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [range, sessionState]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadAnalytics(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadAnalytics]);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch("/api/admin/logout", { method: "POST" });
    } catch (logoutError) {
      console.warn("[연락미] admin analytics logout request failed", logoutError);
    } finally {
      analyticsRequestIdRef.current += 1;
      setSessionState("unauthenticated");
      setAnalytics(null);
      navigate("/admin/login", { replace: true });
    }
  }, [navigate]);

  const downloadCsv = useCallback(() => {
    if (!analytics) return;
    const blob = new Blob([buildAnalyticsCsv(analytics)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yeollock-analytics-${analytics.range.end_date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [analytics]);

  const toggleCard = (key: MetricCardKey) => {
    setVisibleCards((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const chartHasPageViews = useMemo(
    () => Boolean(analytics?.daily_page_views.some((row) => row.page_views > 0)),
    [analytics],
  );
  const authHasData = Boolean(
    analytics?.auth_health.current.available &&
      analytics.auth_health.daily.some((row) => row.requests > 0),
  );

  if (sessionState === "checking") {
    return <AnalyticsLoadingShell />;
  }

  if (sessionState === "unauthenticated") {
    return <Navigate to="/admin/login?next=%2Fadmin%2Fanalytics" replace />;
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
        <AdminAnalyticsHeader
          onLogout={() => void handleLogout()}
          onRefresh={() => void loadAnalytics()}
          isLoading={isLoading}
        />
        <main className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10">
          <div className="rounded-[20px] border border-neutral-200 bg-white p-8 text-center shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
            <h1 className="mt-4 text-lg font-semibold">분석 데이터를 불러오지 못했습니다</h1>
            <p className="mt-2 text-sm font-medium text-neutral-500">{error || "잠시 후 다시 시도해 주세요."}</p>
            <button
              type="button"
              onClick={() => void loadAnalytics()}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              <RefreshCw className="h-4 w-4" />
              다시 불러오기
            </button>
          </div>
        </main>
      </div>
    );
  }

  const overviewByKey: Record<Exclude<MetricCardKey, "active_contracts">, AdminAnalyticsComparison> = {
    page_views: analytics.overview.page_views,
    contracts_created: analytics.overview.contracts_created,
    support_tickets: analytics.overview.support_tickets,
    verification_requests: analytics.overview.verification_requests,
  };
  const metricIcons: Record<MetricCardKey, React.ReactNode> = {
    page_views: <BarChart3 className="h-4 w-4" />,
    contracts_created: <FileCheck2 className="h-4 w-4" />,
    support_tickets: <MessageSquare className="h-4 w-4" />,
    verification_requests: <ShieldCheck className="h-4 w-4" />,
    active_contracts: <Activity className="h-4 w-4" />,
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <AdminAnalyticsHeader
        onLogout={() => void handleLogout()}
        onRefresh={() => void loadAnalytics()}
        isLoading={isLoading}
      />
      <main className="mx-auto max-w-[1480px] px-5 py-6 sm:px-8 lg:px-10">
        <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">운영 분석센터</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] sm:text-[34px]">
              사이트 운영을 숫자로 확인하세요
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-neutral-500">
              운영 데이터, 방문 흐름, 인증 성능을 한 화면에서 비교하고 다음 처리 우선순위를 정합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm" role="group" aria-label="분석 기간">
              {ADMIN_ANALYTICS_RANGE_DAYS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRange(option)}
                  className={`h-9 rounded-lg px-3 text-xs font-bold transition ${
                    range === option ? "bg-neutral-950 text-white" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {option}일
                </button>
              ))}
            </div>
            <details className="relative">
              <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-700 shadow-sm transition hover:border-neutral-400 [&::-webkit-details-marker]:hidden">
                <Settings2 className="h-4 w-4" />
                카드 설정
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              </summary>
              <div className="absolute right-0 top-12 z-10 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                <p className="px-2 pb-2 text-xs font-bold text-neutral-500">표시할 핵심 지표</p>
                <div className="space-y-1">
                  {metricCardOptions.map((option) => (
                    <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={visibleCards.includes(option.key)}
                        onChange={() => toggleCard(option.key)}
                        className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            </details>
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-700 shadow-sm transition hover:border-neutral-400"
            >
              <Download className="h-4 w-4" />
              CSV 내보내기
            </button>
          </div>
        </section>

        {error ? (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span>
            <button type="button" onClick={() => setError("")} className="text-xs font-bold">닫기</button>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {visibleCards.map((key) => {
            const option = metricCardOptions.find((item) => item.key === key);
            if (!option) return null;
            if (key === "active_contracts") {
              return (
                <React.Fragment key={key}>
                  <MetricCard
                    snapshot={analytics.overview.active_contracts}
                    icon={metricIcons[key]}
                    label={option.label}
                  />
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={key}>
                <MetricCard comparison={overviewByKey[key]} icon={metricIcons[key]} label={option.label} />
              </React.Fragment>
            );
          })}
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.85fr)]">
          <section className="rounded-[18px] border border-neutral-200/90 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-700" /><h2 className="text-base font-bold">공개 페이지 조회수 추이</h2></div>
                <p className="mt-1 text-xs font-medium text-neutral-500">{formatDateRange(analytics.range.start_date, analytics.range.end_date)} · 이전 기간과 비교</p>
              </div>
              <span className="text-xs font-bold text-neutral-500">총 {formatNumber(analytics.overview.page_views.current)}회</span>
            </div>
            <div className="mt-5 h-[260px]">
              {analytics.system_status.find((item) => item.key === "page_views")?.status === "unavailable" ? (
                <ChartEmptyState detail="자체 서버의 운영 집계 연결 후 조회수 추이를 표시합니다." />
              ) : chartHasPageViews ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.daily_page_views} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="pageViewsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.24} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#737373", fontSize: 11, fontWeight: 600 }} minTickGap={24} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#737373", fontSize: 11, fontWeight: 600 }} tickFormatter={formatAxisValue} width={48} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 30px rgba(15,23,42,.12)", fontSize: 12, fontWeight: 700 }} formatter={(value) => [`${formatNumber(Number(value))}회`, "조회수"]} labelStyle={{ color: "#525252", marginBottom: 4 }} />
                    <Area type="monotone" dataKey="page_views" stroke="#2563eb" strokeWidth={2.5} fill="url(#pageViewsFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmptyState detail="선택한 기간에 기록된 공개 페이지 조회수가 없습니다." />
              )}
            </div>
          </section>

          <section className="rounded-[18px] border border-neutral-200/90 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><LayoutDashboard className="h-5 w-5 text-blue-700" /><h2 className="text-base font-bold">운영 큐</h2></div><p className="mt-1 text-xs font-medium text-neutral-500">지금 처리해야 할 운영 상태</p></div>
              <Link to="/admin" className="text-xs font-bold text-blue-700 hover:text-blue-800">운영 현황</Link>
            </div>
            <div className="mt-5 divide-y divide-neutral-100">
              <QueueRow icon={<ShieldCheck className="h-4 w-4" />} label="수기 인증 대기" value={analytics.queue.pending_verification} href="/admin?section=manual_verification" />
              <QueueRow icon={<MessageSquare className="h-4 w-4" />} label="미처리 문의" value={analytics.queue.open_support_tickets} href="/admin?section=support_tickets" />
              <QueueRow icon={<Clock3 className="h-4 w-4" />} label="지원 열람 진행" value={analytics.queue.active_support_access} href="/admin?section=support_access" />
              <QueueRow icon={<AlertTriangle className="h-4 w-4" />} label="운영 알림 대기" value={analytics.queue.pending_operational_alerts} href="/admin" />
            </div>
            <div className="mt-5 rounded-xl bg-neutral-50 px-3 py-3 text-xs font-medium leading-5 text-neutral-500">운영 큐의 원문과 처리 버튼은 운영 현황에서 확인합니다.</div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-[18px] border border-neutral-200/90 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-700" /><h2 className="text-base font-bold">인증 성능</h2></div><p className="mt-1 text-xs font-medium text-neutral-500">운영자·고객 로그인 요청 집계</p></div><span className="text-xs font-bold text-neutral-500">현재 기간</span></div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <AuthHealthMetric label="요청" value={formatNumber(analytics.auth_health.current.requests)} />
              <AuthHealthMetric label="실패율" value={analytics.auth_health.current.failure_rate_percent === null ? "-" : `${analytics.auth_health.current.failure_rate_percent}%`} />
              <AuthHealthMetric label="평균 지연" value={analytics.auth_health.current.avg_latency_ms === null ? "-" : `${formatNumber(analytics.auth_health.current.avg_latency_ms)}ms`} />
              <AuthHealthMetric label="최대 지연" value={analytics.auth_health.current.max_latency_ms === null ? "-" : `${formatNumber(analytics.auth_health.current.max_latency_ms)}ms`} />
            </div>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-3 text-xs"><span className="font-bold text-neutral-600">서비스 오류</span><span className="font-bold text-neutral-950">{formatNumber(analytics.auth_health.current.service_errors)}건</span></div>
            {!analytics.auth_health.current.available ? <p className="mt-3 text-xs font-medium leading-5 text-neutral-500">생산 인증 지표가 연결되면 실패율과 지연을 표시합니다.</p> : null}
          </section>

          <section className="rounded-[18px] border border-neutral-200/90 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-700" /><h2 className="text-base font-bold">인증 요청 흐름</h2></div><p className="mt-1 text-xs font-medium text-neutral-500">요청량과 서비스 오류의 일별 변화</p></div><span className="text-xs font-bold text-neutral-500">{formatDateRange(analytics.range.start_date, analytics.range.end_date)}</span></div>
            <div className="mt-5 h-[230px]">{authHasData ? <ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.auth_health.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#737373", fontSize: 11, fontWeight: 600 }} minTickGap={24} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#737373", fontSize: 11, fontWeight: 600 }} tickFormatter={formatAxisValue} width={48} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 30px rgba(15,23,42,.12)", fontSize: 12, fontWeight: 700 }} formatter={(value, name) => [`${formatNumber(Number(value))}건`, name === "requests" ? "요청" : "서비스 오류"]} labelStyle={{ color: "#525252", marginBottom: 4 }} /><Bar dataKey="requests" name="requests" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={16} /><Bar dataKey="service_errors" name="service_errors" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={16} /></BarChart></ResponsiveContainer> : <ChartEmptyState icon={<ShieldCheck className="h-5 w-5" />} detail={!analytics.auth_health.current.available ? "생산 인증 지표 연결 후 요청 흐름을 표시합니다." : "선택한 기간에 인증 요청 기록이 없습니다."} />}</div>
          </section>
        </div>

        <section className="mt-4 rounded-[18px] border border-neutral-200/90 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-700" /><h2 className="text-base font-bold">페이지별 조회수</h2></div><p className="mt-1 text-xs font-medium text-neutral-500">공개 페이지 유형별 운영 유입</p></div><span className="text-xs font-bold text-neutral-500">집계 페이지 {analytics.page_breakdown.length}개</span></div>
          <div className="mt-4"><PageBreakdownTable rows={analytics.page_breakdown} /></div>
        </section>

        <section className="mt-4 rounded-[18px] border border-neutral-200/90 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Database className="h-5 w-5 text-blue-700" /><h2 className="text-base font-bold">데이터 연결 상태</h2></div><p className="mt-1 text-xs font-medium text-neutral-500">마지막 조회 {formatGeneratedAt(analytics.generated_at)} · {analytics.source === "supabase" ? "운영 데이터" : "연결 대기"}</p></div><Link to="/admin" className="text-xs font-bold text-blue-700 hover:text-blue-800">운영 현황 열기</Link></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {analytics.system_status.map((item) => (
              <div key={item.key} className="rounded-xl border border-neutral-200 px-3 py-3">
                <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="shrink-0">{statusIcon(item.status)}</span><span className="truncate text-sm font-bold text-neutral-800">{item.label}</span></div><StatusBadge status={item.status} /></div>
                <p className="mt-2 text-xs font-medium leading-5 text-neutral-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function QueueRow({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Link to={href} className="flex items-center justify-between gap-3 py-4 transition hover:bg-neutral-50">
      <span className="flex min-w-0 items-center gap-3"><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">{icon}</span><span className="truncate text-sm font-semibold text-neutral-700">{label}</span></span>
      <span className="flex shrink-0 items-center gap-2"><span className="text-lg font-semibold tracking-[-0.04em] text-neutral-950">{formatNumber(value)}</span><ArrowUpRight className="h-4 w-4 text-neutral-400" /></span>
    </Link>
  );
}

function AdminAnalyticsHeader({
  isLoading,
  onLogout,
  onRefresh,
}: {
  isLoading: boolean;
  onLogout: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1480px] items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo />
          <span className="hidden h-5 w-px bg-neutral-200 sm:block" />
          <span className="hidden truncate text-sm font-bold text-neutral-600 sm:block">운영 분석센터</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/admin" className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-400" title="운영 현황"><LayoutDashboard className="h-4 w-4" /><span className="hidden sm:inline">운영 현황</span></Link>
          <button type="button" onClick={onRefresh} aria-label="새로고침" title="새로고침" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-400 sm:w-auto sm:px-3"><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /><span className="hidden whitespace-nowrap sm:inline">새로고침</span></button>
          <button type="button" onClick={onLogout} aria-label="로그아웃" title="로그아웃" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-400 sm:w-auto sm:px-3"><LogOut className="h-4 w-4" /><span className="hidden whitespace-nowrap sm:inline">로그아웃</span></button>
        </div>
      </div>
    </header>
  );
}

function AnalyticsLoadingShell() {
  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <div className="h-[72px] border-b border-neutral-200 bg-white" />
      <main className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-neutral-200" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-neutral-200" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-[18px] bg-white" />)}</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.85fr)]"><div className="h-[370px] animate-pulse rounded-[18px] bg-white" /><div className="h-[370px] animate-pulse rounded-[18px] bg-white" /></div>
      </main>
    </div>
  );
}
