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
  support_tickets?: {
    open_count: number;
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

type OperationalSupportTicket = {
  id: string;
  category:
    | "service_error"
    | "account_access"
    | "contract_flow"
    | "privacy_request"
    | "other";
  requester_role: "advertiser" | "influencer" | "operator" | "other";
  requester_name?: string;
  requester_email: string;
  subject: string;
  message: string;
  context_url?: string;
  contract_id?: string;
  contract_title?: string;
  page_path?: string;
  browser_context?: Record<string, unknown>;
  severity: "low" | "normal" | "high" | "urgent";
  status: "open" | "reviewing" | "resolved" | "closed";
  admin_note?: string;
  created_at: string;
  updated_at: string;
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
  support_tickets: {
    open_count: 0,
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
  const [supportTickets, setSupportTickets] = useState<OperationalSupportTicket[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [dataError, setDataError] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [reviewingVerificationId, setReviewingVerificationId] = useState("");
  const [checkingVerificationId, setCheckingVerificationId] = useState("");
  const [closingSupportId, setClosingSupportId] = useState("");
  const [updatingTicketId, setUpdatingTicketId] = useState("");
  const [ticketCategoryFilter, setTicketCategoryFilter] = useState<
    OperationalSupportTicket["category"] | "all"
  >("all");
  const [ticketStatusFilter, setTicketStatusFilter] = useState<
    OperationalSupportTicket["status"] | "active" | "all"
  >("active");

  const activeSupportRequests = useMemo(
    () => supportRequests.filter((request) => request.is_active),
    [supportRequests],
  );
  const pendingVerificationRequests = useMemo(
    () => verificationRequests.filter((request) => request.status === "pending"),
    [verificationRequests],
  );
  const activeSupportTickets = useMemo(
    () =>
      supportTickets.filter(
        (ticket) => ticket.status === "open" || ticket.status === "reviewing",
      ),
    [supportTickets],
  );
  const visibleSupportTickets = useMemo(() => {
    return supportTickets
      .filter((ticket) => {
        const categoryMatches =
          ticketCategoryFilter === "all" || ticket.category === ticketCategoryFilter;
        const statusMatches =
          ticketStatusFilter === "all" ||
          (ticketStatusFilter === "active"
            ? ticket.status === "open" || ticket.status === "reviewing"
            : ticket.status === ticketStatusFilter);
        return categoryMatches && statusMatches;
      })
      .slice(0, 8);
  }, [supportTickets, ticketCategoryFilter, ticketStatusFilter]);

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
      const [metricsResult, supportResult, ticketResult, verificationResult] =
        await Promise.allSettled([
          apiFetch("/api/admin/metrics", { headers: { Accept: "application/json" } }),
          apiFetch("/api/admin/support-access-requests", {
            headers: { Accept: "application/json" },
          }),
          apiFetch("/api/admin/support-tickets", {
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

      if (ticketResult.status === "fulfilled") {
        const ticketData = (await ticketResult.value.json()) as {
          support_tickets?: OperationalSupportTicket[];
          error?: string;
        };
        if (ticketResult.value.ok) {
          setSupportTickets(ticketData.support_tickets ?? []);
        } else {
          failedSections.push(
            translateApiErrorMessage(ticketData.error, "고객 문의"),
          );
        }
      } else {
        failedSections.push("고객 문의");
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
      console.warn(`[${PRODUCT_NAME}] admin logout request failed`, error);
    } finally {
      setIsAuthenticated(false);
      setMetrics(emptyMetrics);
      setSupportRequests([]);
      setSupportTickets([]);
      setVerificationRequests([]);
    }
  };

  const reviewVerificationRequest = async (
    id: string,
    status: "approved" | "rejected",
  ) => {
    setReviewingVerificationId(id);
    setDataError("");
    const targetRequest = verificationRequests.find((request) => request.id === id);

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
          reviewer_note: buildDefaultVerificationReviewerNote(
            status,
            targetRequest,
          ),
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

  const rerunVerificationAutomation = async (id: string) => {
    setCheckingVerificationId(id);
    setDataError("");

    try {
      const response = await apiFetch(
        `/api/admin/verification-requests/${id}/automation-check`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const data = (await response.json()) as {
        request?: VerificationRequest;
        error?: string;
      };

      if (!response.ok || !data.request) {
        throw new Error(
          translateApiErrorMessage(
            data.error,
            "자동 확인을 다시 실행하지 못했습니다.",
          ),
        );
      }

      await loadAdminData();
    } catch (requestError) {
      setDataError(
        requestError instanceof Error
          ? translateApiErrorMessage(
              requestError.message,
              "자동 확인을 다시 실행하지 못했습니다.",
            )
          : "자동 확인을 다시 실행하지 못했습니다.",
      );
    } finally {
      setCheckingVerificationId("");
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

  const updateSupportTicketStatus = async (
    id: string,
    status: OperationalSupportTicket["status"],
  ) => {
    setUpdatingTicketId(id);
    setDataError("");

    try {
      const response = await apiFetch(`/api/admin/support-tickets/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const data = (await response.json()) as {
        ticket?: OperationalSupportTicket;
        error?: string;
      };

      if (!response.ok || !data.ticket) {
        throw new Error(
          translateApiErrorMessage(data.error, "문의 상태를 변경하지 못했습니다."),
        );
      }

      await loadAdminData();
    } catch (requestError) {
      setDataError(
        requestError instanceof Error
          ? translateApiErrorMessage(
              requestError.message,
              "문의 상태를 변경하지 못했습니다.",
            )
          : "문의 상태를 변경하지 못했습니다.",
      );
    } finally {
      setUpdatingTicketId("");
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
            label="고객 문의"
            value={String(metrics.support_tickets?.open_count ?? activeSupportTickets.length)}
            helper={`누적 ${metrics.support_tickets?.total_count ?? supportTickets.length}`}
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
                  운영 기준
                </h2>
                <Lock className="h-4 w-4 text-neutral-400" />
              </div>
              <div className="grid gap-3 text-sm leading-6 text-neutral-700 sm:grid-cols-3">
                <PolicyStep
                  number="01"
                  title="운영/테스트 분리"
                  body="운영 DB에는 테스트 데이터를 기본 주입하지 않습니다. 시드는 별도 승인 환경에서만 실행합니다."
                />
                <PolicyStep
                  number="02"
                  title="정산 비취급"
                  body="연락미는 계약 조건과 증빙을 보관하지만 지급대행, 에스크로, 세금 처리는 하지 않습니다."
                />
                <PolicyStep
                  number="03"
                  title="문의 집중"
                  body="장애, 계정, 계약 흐름 문의는 고객지원 접수 후 이 대시보드에서 상태를 처리합니다."
                />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <SupportTicketPanel
              tickets={visibleSupportTickets}
              totalCount={supportTickets.length}
              categoryFilter={ticketCategoryFilter}
              statusFilter={ticketStatusFilter}
              onCategoryFilterChange={setTicketCategoryFilter}
              onStatusFilterChange={setTicketStatusFilter}
              updatingId={updatingTicketId}
              onStatusChange={updateSupportTicketStatus}
              onOpenContract={(contractId) =>
                navigate(`/advertiser/contract/${encodeURIComponent(contractId)}`)
              }
            />

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
              checkingId={checkingVerificationId}
              onApprove={(id) => reviewVerificationRequest(id, "approved")}
              onReject={(id) => reviewVerificationRequest(id, "rejected")}
              onRecheck={rerunVerificationAutomation}
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

function SupportTicketPanel({
  tickets,
  totalCount,
  categoryFilter,
  statusFilter,
  onCategoryFilterChange,
  onStatusFilterChange,
  updatingId,
  onStatusChange,
  onOpenContract,
}: {
  tickets: OperationalSupportTicket[];
  totalCount: number;
  categoryFilter: OperationalSupportTicket["category"] | "all";
  statusFilter: OperationalSupportTicket["status"] | "active" | "all";
  onCategoryFilterChange: (
    category: OperationalSupportTicket["category"] | "all",
  ) => void;
  onStatusFilterChange: (
    status: OperationalSupportTicket["status"] | "active" | "all",
  ) => void;
  updatingId: string;
  onStatusChange: (
    id: string,
    status: OperationalSupportTicket["status"],
  ) => void;
  onOpenContract: (contractId: string) => void;
}) {
  const categoryFilters: Array<{
    value: OperationalSupportTicket["category"] | "all";
    label: string;
  }> = [
    { value: "all", label: "전체" },
    { value: "contract_flow", label: "계약" },
    { value: "service_error", label: "오류" },
    { value: "account_access", label: "계정" },
    { value: "privacy_request", label: "개인정보" },
  ];
  const statusFilters: Array<{
    value: OperationalSupportTicket["status"] | "active" | "all";
    label: string;
  }> = [
    { value: "active", label: "열린 문의" },
    { value: "open", label: "새 문의" },
    { value: "reviewing", label: "확인 중" },
    { value: "resolved", label: "해결" },
    { value: "all", label: "전체" },
  ];

  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
          고객 문의
        </h2>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
          {tickets.length}/{totalCount}건
        </span>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {categoryFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onCategoryFilterChange(filter.value)}
              className={`h-8 rounded-lg px-3 text-xs font-semibold transition ${
                categoryFilter === filter.value
                  ? "bg-neutral-950 text-white"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-950"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onStatusFilterChange(filter.value)}
              className={`h-8 rounded-lg px-3 text-xs font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-neutral-100 text-neutral-950 ring-1 ring-neutral-300"
                  : "bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {tickets.map((ticket) => (
          <article
            key={ticket.id}
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-950">
                  {ticket.subject}
                </p>
                <p className="mt-1 truncate text-xs font-medium text-neutral-500">
                  {supportTicketCategoryLabel(ticket.category)} ·{" "}
                  {requesterRoleLabel(ticket.requester_role)} ·{" "}
                  {ticket.requester_email}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${supportTicketStatusTone(
                  ticket.status,
                )}`}
              >
                {supportTicketStatusLabel(ticket.status)}
              </span>
            </div>

            <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-700">
              {ticket.message}
            </p>
            {ticket.contract_id && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-950">
                    {ticket.contract_title || "계약 문의"}
                  </p>
                  <p className="mt-0.5 truncate font-medium text-neutral-400">
                    {ticket.contract_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenContract(ticket.contract_id!)}
                  className="h-8 shrink-0 rounded-md border border-neutral-200 bg-[#fbfbfc] px-2.5 font-semibold text-neutral-700 transition hover:border-neutral-400 hover:bg-white"
                >
                  계약 열기
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500">
              <span>{formatDateTime(ticket.created_at)}</span>
              {(ticket.page_path || ticket.context_url) && (
                <>
                  <span>·</span>
                  <span className="max-w-[240px] truncate">
                    {ticket.page_path || ticket.context_url}
                  </span>
                </>
              )}
              <span>·</span>
              <span>{supportTicketSeverityLabel(ticket.severity)}</span>
            </div>

            <div className="mt-4 flex gap-2">
              {ticket.status === "open" && (
                <button
                  type="button"
                  disabled={updatingId === ticket.id}
                  onClick={() => onStatusChange(ticket.id, "reviewing")}
                  className="h-9 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
                >
                  검토 시작
                </button>
              )}
              {(ticket.status === "open" || ticket.status === "reviewing") && (
                <button
                  type="button"
                  disabled={updatingId === ticket.id}
                  onClick={() => onStatusChange(ticket.id, "resolved")}
                  className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400 disabled:text-neutral-300"
                >
                  해결 완료
                </button>
              )}
            </div>
          </article>
        ))}

        {tickets.length === 0 && (
          <EmptyState text="접수된 고객 문의가 없습니다." />
        )}
      </div>
    </section>
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
  checkingId,
  onApprove,
  onReject,
  onRecheck,
}: {
  requests: VerificationRequest[];
  reviewingId: string;
  checkingId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRecheck: (id: string) => void;
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
          const isHandleAppeal = isPublicProfileHandleAppeal(request);
          const claimedHandle = getEvidenceString(request, "claimed_handle");
          const claimedProfileUrl =
            getEvidenceString(request, "claimed_profile_url") ||
            (claimedHandle ? `https://yeollock.me/${claimedHandle}` : "");
          const currentOwnerId = getEvidenceString(request, "current_owner_profile_id");
          const claimReason = getEvidenceString(request, "reason") || request.note;
          const automationSummary = getVerificationAutomationSummary(request);

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
                {isHandleAppeal && (
                  <>
                    <p className="font-semibold text-amber-700">
                      공개 주소 소유권 이의신청
                    </p>
                    {claimedHandle && (
                      <p>요청 주소 yeollock.me/{claimedHandle}</p>
                    )}
                    {currentOwnerId && (
                      <p>현재 점유 프로필 {shortId(currentOwnerId)}</p>
                    )}
                    {claimReason && (
                      <p className="line-clamp-3 text-neutral-700">{claimReason}</p>
                    )}
                  </>
                )}
                {request.platform_handle && <p>핸들 {request.platform_handle}</p>}
                {request.ownership_verification_method && (
                  <p>방식 {verificationMethodLabel(request.ownership_verification_method)}</p>
                )}
                {request.ownership_verification_method === "instagram_dm_code" && (
                  <p className="font-semibold text-neutral-700">
                    공식 인스타그램 DM 발신 계정과 프로필 URL을 대조 후 승인
                  </p>
                )}
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
                {isHandleAppeal && claimedProfileUrl && (
                  <a
                    href={claimedProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:border-amber-300"
                  >
                    점유 프로필
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
                <button
                  type="button"
                  disabled={checkingId === request.id}
                  title={automationSummary || undefined}
                  onClick={() => onRecheck(request.id)}
                  className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400 disabled:opacity-50"
                >
                  {checkingId === request.id ? "자동 확인 중" : "자동 확인"}
                </button>
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

function requesterRoleLabel(
  role: SupportAccessRequest["requester_role"] | OperationalSupportTicket["requester_role"],
) {
  if (role === "advertiser") return "광고주";
  if (role === "influencer") return "인플루언서";
  if (role === "operator") return "운영";
  return "기타";
}

function supportTicketCategoryLabel(
  category: OperationalSupportTicket["category"],
) {
  const labels: Record<OperationalSupportTicket["category"], string> = {
    service_error: "장애/오류",
    account_access: "계정",
    contract_flow: "계약 흐름",
    privacy_request: "개인정보",
    other: "기타",
  };

  return labels[category];
}

function supportTicketStatusLabel(status: OperationalSupportTicket["status"]) {
  const labels: Record<OperationalSupportTicket["status"], string> = {
    open: "접수",
    reviewing: "검토",
    resolved: "해결",
    closed: "종료",
  };

  return labels[status];
}

function supportTicketStatusTone(status: OperationalSupportTicket["status"]) {
  const tones: Record<OperationalSupportTicket["status"], string> = {
    open: "bg-amber-50 text-amber-800",
    reviewing: "bg-blue-50 text-blue-700",
    resolved: "bg-emerald-50 text-emerald-700",
    closed: "bg-neutral-200 text-neutral-600",
  };

  return tones[status];
}

function supportTicketSeverityLabel(
  severity: OperationalSupportTicket["severity"],
) {
  const labels: Record<OperationalSupportTicket["severity"], string> = {
    low: "낮음",
    normal: "보통",
    high: "높음",
    urgent: "긴급",
  };

  return labels[severity];
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
  if (isPublicProfileHandleAppeal(request)) {
    return "인플루언서 공개 주소 이의신청";
  }
  if (request.target_type === "advertiser_organization") {
    return "사업자 인증";
  }
  const platform = request.platform ? ` · ${request.platform}` : "";
  return `인플루언서 계정 인증${platform}`;
}

function verificationMethodLabel(method: string) {
  const labels: Record<string, string> = {
    instagram_dm_code: "Instagram DM 수동 확인",
    profile_bio_code: "프로필 소개 코드",
    public_post_code: "공개 게시글 코드",
    channel_description_code: "채널 설명 코드",
    screenshot_review: "스크린샷 검수",
  };

  return labels[method] ?? method;
}

function buildDefaultVerificationReviewerNote(
  status: "approved" | "rejected",
  request?: VerificationRequest,
) {
  if (status === "approved") return "수기 확인 후 승인했습니다.";
  if (!request) return "제출 정보와 증빙을 대조할 수 없습니다. 필요한 항목을 확인해 다시 제출해 주세요.";

  if (isPublicProfileHandleAppeal(request)) {
    return "공개 주소 소유권을 확인할 증빙이 충분하지 않습니다. 본인 계정임을 확인할 수 있는 URL이나 스크린샷을 다시 제출해 주세요.";
  }

  if (request.target_type === "advertiser_organization") {
    return "사업자등록번호, 대표자명, 발급일, 문서번호 또는 증빙 파일을 확인할 수 없습니다. 최신 사업자등록증명원으로 다시 제출해 주세요.";
  }

  if (request.ownership_verification_method === "instagram_dm_code") {
    return "공식 인스타그램 DM 발신 계정과 제출한 프로필 URL 또는 인증 코드가 일치하는지 확인할 수 없습니다. 같은 코드로 다시 DM을 보내고 재제출해 주세요.";
  }

  return "프로필 URL, 핸들, 인증 코드 위치 또는 공개 접근 가능 여부를 확인할 수 없습니다. 코드가 보이는 URL이나 스크린샷으로 다시 제출해 주세요.";
}

function isPublicProfileHandleAppeal(request: VerificationRequest) {
  return request.evidence_snapshot_json?.request_type === "public_profile_handle_claim";
}

function getEvidenceString(request: VerificationRequest, key: string) {
  const value = request.evidence_snapshot_json?.[key];
  return typeof value === "string" && value.trim() ? value : "";
}

function getVerificationAutomationSummary(request: VerificationRequest) {
  const automation =
    request.evidence_snapshot_json?.automation ??
    (request.evidence_snapshot_json?.ownership_verification as
      | { automation?: unknown }
      | undefined)?.automation;

  if (!automation || typeof automation !== "object") return "";

  const typed = automation as Record<string, unknown>;
  const result =
    typed.business_registration ??
    typed.platform_account ??
    typed.instagram_dm ??
    typed.ownership_challenge;

  if (!result || typeof result !== "object") return "";

  const payload = result as {
    provider?: unknown;
    status?: unknown;
    mode?: unknown;
    message?: unknown;
    checked_at?: unknown;
  };
  const provider = typeof payload.provider === "string" ? payload.provider : "automation";
  const status = typeof payload.status === "string" ? payload.status : "unknown";
  const mode = typeof payload.mode === "string" ? payload.mode : "manual";
  const checkedAt =
    typeof payload.checked_at === "string" ? formatDateTime(payload.checked_at) : "";

  return `자동 확인 ${status} · ${provider} · ${mode}${checkedAt ? ` · ${checkedAt}` : ""}`;
}
