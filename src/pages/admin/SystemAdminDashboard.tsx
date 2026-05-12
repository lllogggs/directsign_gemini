import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  FileText,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  verificationStatusLabel,
  verificationStatusTone,
  type VerificationRequest,
} from "../../domain/verification";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { apiFetch } from "../../domain/api";
import { buildLoginRedirect, getNextPath } from "../../domain/navigation";
import { PRODUCT_NAME } from "../../domain/brand";
import { translateApiErrorMessage } from "../../domain/userMessages";

type AdminMetrics = {
  contract_count: number;
  active_contract_count: number;
  completed_contract_count: number;
  active_share_link_count: number;
  total_fixed_fee_amount: number;
  total_fixed_fee_label: string;
  status_counts: Array<{
    status: string;
    label: string;
    count: number;
  }>;
  support_access: {
    active_count: number;
    total_count: number;
  };
  verification: {
    pending_count: number;
    total_count: number;
  };
  source: "supabase" | "file";
  demo_mode: boolean;
};

type SupportAccessRequest = {
  id: string;
  contract_id: string;
  requester_role: "advertiser" | "influencer";
  requester_name?: string;
  requester_email?: string;
  reason: string;
  scope: "contract" | "contract_and_pdf";
  status: "active" | "closed" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  updated_at: string;
  is_active?: boolean;
  audit_events?: Array<{
    id: string;
    action: string;
    actor_role: string;
    description: string;
    created_at: string;
  }>;
};

const emptyMetrics: AdminMetrics = {
  contract_count: 0,
  active_contract_count: 0,
  completed_contract_count: 0,
  active_share_link_count: 0,
  total_fixed_fee_amount: 0,
  total_fixed_fee_label: "-",
  status_counts: [],
  support_access: {
    active_count: 0,
    total_count: 0,
  },
  verification: {
    pending_count: 0,
    total_count: 0,
  },
  source: "file",
  demo_mode: false,
};

export function SystemAdminDashboard({ loginOnly = false }: { loginOnly?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedNextPath = getNextPath(location.search, "/admin", ["/admin"]);
  const nextPath = requestedNextPath.startsWith("/admin/login")
    ? "/admin"
    : requestedNextPath;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthConfigured, setIsAuthConfigured] = useState(true);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<AdminMetrics>(emptyMetrics);
  const [supportRequests, setSupportRequests] = useState<SupportAccessRequest[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [dataError, setDataError] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [reviewingVerificationId, setReviewingVerificationId] = useState("");
  const [closingSupportId, setClosingSupportId] = useState("");

  const activeSupportRequests = useMemo(
    () => supportRequests.filter((request) => request.is_active),
    [supportRequests],
  );
  const pendingVerificationRequests = useMemo(
    () => verificationRequests.filter((request) => request.status === "pending"),
    [verificationRequests],
  );

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const response = await apiFetch("/api/admin/session", {
          headers: { Accept: "application/json" },
        });
        const data = (await response.json()) as {
          authenticated?: boolean;
          configured?: boolean;
        };

        if (!cancelled) {
          setIsAuthenticated(data.authenticated === true);
          setIsAuthConfigured(data.configured !== false);
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
          setError("운영자 세션을 확인하지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadAdminData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError("");

    try {
      const [metricsResult, supportResult, verificationResult] =
        await Promise.allSettled([
          apiFetch("/api/admin/metrics", { headers: { Accept: "application/json" } }),
          apiFetch("/api/admin/support-access-requests", {
            headers: { Accept: "application/json" },
          }),
          apiFetch("/api/admin/verification-requests", {
            headers: { Accept: "application/json" },
          }),
        ]);

      const failedSections: string[] = [];

      if (metricsResult.status === "fulfilled") {
        const metricsData = (await metricsResult.value.json()) as {
          metrics?: AdminMetrics;
          error?: string;
        };
        if (metricsResult.value.ok && metricsData.metrics) {
          setMetrics(metricsData.metrics);
        } else {
          failedSections.push(
            translateApiErrorMessage(metricsData.error, "운영 지표"),
          );
        }
      } else {
        failedSections.push("운영 지표");
      }

      if (supportResult.status === "fulfilled") {
        const supportData = (await supportResult.value.json()) as {
          support_access_requests?: SupportAccessRequest[];
          error?: string;
        };
        if (supportResult.value.ok) {
          setSupportRequests(supportData.support_access_requests ?? []);
        } else {
          failedSections.push(
            translateApiErrorMessage(supportData.error, "지원 열람 요청"),
          );
        }
      } else {
        failedSections.push("지원 열람 요청");
      }

      if (verificationResult.status === "fulfilled") {
        const verificationData = (await verificationResult.value.json()) as {
          verification_requests?: VerificationRequest[];
          error?: string;
        };
        if (verificationResult.value.ok) {
          setVerificationRequests(verificationData.verification_requests ?? []);
        } else {
          failedSections.push(
            translateApiErrorMessage(verificationData.error, "인증 대기열"),
          );
        }
      } else {
        failedSections.push("인증 대기열");
      }

      if (failedSections.length > 0) {
        setDataError(
          `${failedSections.join(", ")} 데이터를 불러오지 못했습니다. 나머지 영역은 최신 상태로 표시합니다.`,
        );
      }
    } catch (requestError) {
      setDataError(
        requestError instanceof Error
          ? translateApiErrorMessage(
              requestError.message,
              "운영 데이터를 불러오지 못했습니다.",
            )
          : "운영 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const timer = window.setTimeout(() => {
        void loadAdminData();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isAuthenticated, loadAdminData]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await apiFetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ accessCode }),
      });
      const data = (await response.json()) as {
        authenticated?: boolean;
        configured?: boolean;
        error?: string;
      };

      if (!response.ok || data.authenticated !== true) {
        setIsAuthConfigured(data.configured !== false);
        setError(
          data.configured === false
            ? "운영자 인증 환경변수가 아직 설정되지 않았습니다."
            : "관리자 인증 코드가 올바르지 않습니다.",
        );
        return;
      }

      setIsAuthenticated(true);
      setAccessCode("");
      if (loginOnly) {
        navigate(nextPath, { replace: true });
      }
    } catch {
      setError("운영자 인증 서버에 연결하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/admin/logout", { method: "POST" });
    } catch (error) {
      console.warn("[Yeollock] admin logout request failed", error);
    } finally {
      setIsAuthenticated(false);
      setMetrics(emptyMetrics);
      setSupportRequests([]);
      setVerificationRequests([]);
    }
  };

  const reviewVerificationRequest = async (
    id: string,
    status: "approved" | "rejected",
  ) => {
    setReviewingVerificationId(id);
    setDataError("");

    try {
      const response = await apiFetch(`/api/admin/verification-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          status,
          reviewed_by_name: `${PRODUCT_NAME} 운영자`,
          reviewer_note:
            status === "approved"
              ? "수기 확인 후 승인했습니다."
              : "제출 정보 또는 증빙 확인이 필요합니다.",
        }),
      });
      const data = (await response.json()) as {
        request?: VerificationRequest;
        error?: string;
      };

      if (!response.ok || !data.request) {
        throw new Error(
          translateApiErrorMessage(data.error, "인증 검토 처리에 실패했습니다."),
        );
      }

      await loadAdminData();
    } catch (requestError) {
      setDataError(
        requestError instanceof Error
          ? translateApiErrorMessage(
              requestError.message,
              "인증 검토 처리에 실패했습니다.",
            )
          : "인증 검토 처리에 실패했습니다.",
      );
    } finally {
      setReviewingVerificationId("");
    }
  };

  const closeSupportAccess = async (id: string) => {
    setClosingSupportId(id);
    setDataError("");

    try {
      const response = await apiFetch(`/api/admin/support-access-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ status: "closed" }),
      });
      const data = (await response.json()) as {
        request?: SupportAccessRequest;
        error?: string;
      };

      if (!response.ok || !data.request) {
        throw new Error(
          translateApiErrorMessage(data.error, "지원 열람을 종료하지 못했습니다."),
        );
      }

      await loadAdminData();
    } catch (requestError) {
      setDataError(
        requestError instanceof Error
          ? translateApiErrorMessage(
              requestError.message,
              "지원 열람을 종료하지 못했습니다.",
            )
          : "지원 열람을 종료하지 못했습니다.",
      );
    } finally {
      setClosingSupportId("");
    }
  };

  if (isCheckingSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6f7f9] font-sans">
        <div className="rounded-lg border border-neutral-200/80 bg-white px-6 py-5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold text-neutral-950">
            운영자 세션 확인 중
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (!loginOnly) {
      const currentPath = `${location.pathname}${location.search}`;
      return (
        <Navigate
          to={buildLoginRedirect("/admin/login", currentPath, "/admin", ["/admin"])}
          replace
        />
      );
    }

    return (
      <AuthLoginScreen
        title="운영자 접속"
        fields={[
          {
            id: "accessCode",
            label: "인증 코드",
            value: accessCode,
            type: "password",
            autoComplete: "one-time-code",
            placeholder: "인증 코드",
            required: true,
            disabled: !isAuthConfigured,
            onChange: setAccessCode,
          },
        ]}
        submitLabel="들어가기"
        isSubmitting={isSubmitting || !isAuthConfigured}
        error={
          error ||
          (!isAuthConfigured
            ? "서버에 ADMIN_ACCESS_CODE와 ADMIN_SESSION_SECRET을 설정해 주세요."
            : undefined)
        }
        footer={
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
          >
            로그인으로 돌아가기
          </button>
        }
        onSubmit={handleLogin}
      />
    );
  }

  if (loginOnly) {
    return <Navigate to={nextPath} replace />;
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold tracking-[-0.02em]">
                {PRODUCT_NAME} 운영
              </h1>
              <p className="text-xs font-medium text-neutral-500">
                계약 본문은 당사자 지원 요청이 있을 때만 열립니다.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAdminData}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-400"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingData ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-400"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-5 py-5 sm:px-8 lg:px-10">
        {dataError && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-[inset_3px_0_0_rgba(225,29,72,0.3)]">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {dataError}
            </span>
            <button type="button" onClick={() => setDataError("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="계약 건수"
            value={metrics.contract_count.toLocaleString("ko-KR")}
            helper={`진행 ${metrics.active_contract_count} · 완료 ${metrics.completed_contract_count}`}
            icon={<FileText className="h-4 w-4" />}
          />
          <MetricCard
            label="총 계약 금액"
            value={metrics.total_fixed_fee_label}
            helper="고정 금액 계약만 합산"
            icon={<Lock className="h-4 w-4" />}
          />
          <MetricCard
            label="지원 열람"
            value={String(metrics.support_access.active_count)}
            helper={`누적 요청 ${metrics.support_access.total_count}`}
            icon={<Clock3 className="h-4 w-4" />}
          />
          <MetricCard
            label="수기 인증"
            value={String(metrics.verification.pending_count)}
            helper={`누적 요청 ${metrics.verification.total_count}`}
            icon={<UserRoundCheck className="h-4 w-4" />}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <div className="space-y-4">
            <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
                  상태별 계약 수
                </h2>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                  {metrics.source === "supabase" ? "Supabase" : "File"}
                </span>
              </div>
              <div className="space-y-3">
                {metrics.status_counts.map((status) => (
                  <React.Fragment key={status.status}>
                    <StatusBar
                      label={status.label}
                      count={status.count}
                      total={Math.max(metrics.contract_count, 1)}
                    />
                  </React.Fragment>
                ))}
                {metrics.status_counts.length === 0 && (
                  <EmptyState text="아직 집계할 계약이 없습니다." />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
                  접근 정책
                </h2>
                <Lock className="h-4 w-4 text-neutral-400" />
              </div>
              <div className="grid gap-3 text-sm leading-6 text-neutral-700 sm:grid-cols-3">
                <PolicyStep
                  number="01"
                  title="기본 차단"
                  body="운영자는 계약 목록, 본문, 서명본 PDF를 기본적으로 볼 수 없습니다."
                />
                <PolicyStep
                  number="02"
                  title="당사자 요청"
                  body="광고주나 인플루언서가 사유를 남기면 24시간 지원 열람권이 열립니다."
                />
                <PolicyStep
                  number="03"
                  title="열람 기록"
                  body="운영자가 본문이나 PDF를 열 때마다 지원 요청 감사 기록에 남깁니다."
                />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <SupportAccessPanel
              requests={activeSupportRequests}
              closingId={closingSupportId}
              onOpen={(request) =>
                navigate(`/contract/${encodeURIComponent(request.contract_id)}?support=${request.id}`)
              }
              onClose={closeSupportAccess}
            />

            <VerificationReviewPanel
              requests={
                pendingVerificationRequests.length > 0
                  ? pendingVerificationRequests
                  : verificationRequests.slice(0, 5)
              }
              reviewingId={reviewingVerificationId}
              onApprove={(id) => reviewVerificationRequest(id, "approved")}
              onReject={(id) => reviewVerificationRequest(id, "rejected")}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-neutral-500">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
          {icon}
        </span>
      </div>
      <p className="text-[30px] font-semibold leading-none tracking-[-0.04em]">
        {value}
      </p>
      <p className="mt-3 text-[13px] font-medium text-neutral-500">{helper}</p>
    </div>
  );
}

function StatusBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_40px] items-center gap-3">
      <span className="text-sm font-semibold text-neutral-800">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-neutral-950"
          style={{ width: `${Math.max(4, (count / total) * 100)}%` }}
        />
      </div>
      <span className="text-right font-mono text-sm text-neutral-500">{count}</span>
    </div>
  );
}

function PolicyStep({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="font-mono text-xs font-semibold text-neutral-400">{number}</p>
      <p className="mt-2 font-semibold text-neutral-950">{title}</p>
      <p className="mt-2 text-[13px] text-neutral-500">{body}</p>
    </div>
  );
}

function SupportAccessPanel({
  requests,
  closingId,
  onOpen,
  onClose,
}: {
  requests: SupportAccessRequest[];
  closingId: string;
  onOpen: (request: SupportAccessRequest) => void;
  onClose: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
          지원 열람 요청
        </h2>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
          {requests.filter((request) => request.is_active).length} active
        </span>
      </div>

      <div className="space-y-3">
        {requests.map((request) => (
          <article
            key={request.id}
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-950">
                  {requesterRoleLabel(request.requester_role)} 요청
                </p>
                <p className="mt-1 truncate text-xs font-medium text-neutral-500">
                  {request.requester_name || request.requester_email || "요청자 미기록"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  request.is_active
                    ? "bg-neutral-950 text-white"
                    : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {supportStatusLabel(request)}
              </span>
            </div>

            <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-700">
              {request.reason}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500">
              <span>계약 {shortId(request.contract_id)}</span>
              <span>·</span>
              <span>{formatRemaining(request.expires_at)}</span>
            </div>
            <div className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs leading-5 text-neutral-500">
              {formatSupportAuditSummary(request)}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!request.is_active}
                onClick={() => onOpen(request)}
                className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500"
              >
                계약 확인
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!request.is_active || closingId === request.id}
                onClick={() => onClose(request.id)}
                className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400 disabled:text-neutral-300"
              >
                종료
              </button>
            </div>
          </article>
        ))}

        {requests.length === 0 && (
          <EmptyState text="활성 지원 열람 요청이 없습니다." />
        )}
      </div>
    </section>
  );
}

function VerificationReviewPanel({
  requests,
  reviewingId,
  onApprove,
  onReject,
}: {
  requests: VerificationRequest[];
  reviewingId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
          수기 인증
        </h2>
        <UserRoundCheck className="h-4 w-4 text-neutral-400" />
      </div>

      <div className="space-y-3">
        {requests.map((request) => {
          const evidenceUrl =
            typeof request.evidence_snapshot_json?.evidence_file?.download_path === "string"
              ? request.evidence_snapshot_json.evidence_file.download_path
              : typeof request.evidence_snapshot_json?.file_data_url === "string"
                ? request.evidence_snapshot_json.file_data_url
                : undefined;
          const proofUrl = request.ownership_challenge_url ?? request.platform_url;
          const isPending = request.status === "pending";

          return (
            <article
              key={request.id}
              className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">
                    {request.subject_name}
                  </p>
                  <p className="mt-1 text-xs font-medium text-neutral-500">
                    {verificationTypeLabel(request)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${verificationStatusTone(
                    request.status,
                  )}`}
                >
                  {verificationStatusLabel(request.status)}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-xs leading-5 text-neutral-500">
                {request.platform_handle && <p>핸들 {request.platform_handle}</p>}
                {request.ownership_challenge_code && (
                  <p className="font-mono text-neutral-700">
                    코드 {request.ownership_challenge_code}
                  </p>
                )}
                {request.business_registration_number && (
                  <p>사업자번호 {request.business_registration_number}</p>
                )}
                {request.evidence_file_name && (
                  <p className="truncate">파일 {request.evidence_file_name}</p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {proofUrl && (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400"
                  >
                    증빙 URL
                  </a>
                )}
                {evidenceUrl && (
                  <a
                    href={evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400"
                  >
                    문서 보기
                  </a>
                )}
                {isPending && (
                  <>
                    <button
                      type="button"
                      disabled={reviewingId === request.id}
                      onClick={() => onApprove(request.id)}
                      className="h-9 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === request.id}
                      onClick={() => onReject(request.id)}
                      className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      반려
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}

        {requests.length === 0 && <EmptyState text="처리할 인증 요청이 없습니다." />}
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-200 bg-[#fbfbfc] px-4 py-8 text-center text-sm font-medium text-neutral-400">
      {text}
    </div>
  );
}

function requesterRoleLabel(role: SupportAccessRequest["requester_role"]) {
  return role === "advertiser" ? "광고주" : "인플루언서";
}

function supportStatusLabel(request: SupportAccessRequest) {
  if (request.is_active) return "열람 가능";
  if (request.status === "closed") return "종료";
  if (request.status === "revoked") return "회수";
  return "만료";
}

function shortId(value: string) {
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}...`;
}

function formatRemaining(value: string) {
  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt)) return "만료 시간 미정";
  const minutes = Math.ceil((expiresAt - Date.now()) / (60 * 1000));
  if (minutes <= 0) return "만료됨";
  if (minutes < 60) return `${minutes}분 남음`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}시간 남음`;
}

function formatSupportAuditSummary(request: SupportAccessRequest) {
  const events = request.audit_events ?? [];
  const viewCount = events.filter((event) =>
    event.action === "viewed_contract" || event.action === "viewed_pdf",
  ).length;
  const latest = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];

  if (!latest) return "아직 열람 기록이 없습니다.";

  return `열람 ${viewCount}회 · 마지막 기록 ${formatDateTime(latest.created_at)} · ${latest.description}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function verificationTypeLabel(request: VerificationRequest) {
  if (request.target_type === "advertiser_organization") {
    return "광고주 사업자 인증";
  }
  const platform = request.platform ? ` · ${request.platform}` : "";
  return `인플루언서 계정 인증${platform}`;
}
