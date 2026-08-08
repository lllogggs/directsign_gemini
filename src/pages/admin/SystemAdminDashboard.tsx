import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Lock,
  LogOut,
  RefreshCw,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  verificationStatusLabel,
  verificationStatusTone,
  type VerificationRequest,
} from "../../domain/verification";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { LogoMark } from "../../components/BrandLogo";
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

type OperationalAlert = {
  id: string;
  kind:
    | "verification_request"
    | "support_ticket"
    | "support_access"
    | "auth_health";
  action:
    | "auto_approved"
    | "needs_review"
    | "mobile_action"
    | "provider_degraded"
    | "terminal_spike"
    | "revoke_failed"
    | "rate_limit_spike";
  severity: "info" | "normal" | "high" | "urgent";
  status: "queued" | "sent" | "failed" | "muted";
  subject_type: string;
  subject_id: string;
  title: string;
  body: string;
  mobile_path: string;
  dashboard_path?: string;
  dedupe_key: string;
  decision_reason?: string;
  metadata_json?: Record<string, unknown>;
  sent_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
};

type AdminDashboardSection =
  | "overview"
  | "support_tickets"
  | "support_access"
  | "manual_verification";

type VerificationReviewTab = "pending" | "approved";

type AdminAuthStep = "credentials" | "totp";

type AdminAuthResponse = {
  authenticated?: boolean;
  configured?: boolean;
  mfa_required?: boolean;
  enrollment_required?: boolean;
  qr_code?: string;
  secret?: string;
  error?: string;
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

export function SystemAdminDashboard({
  loginOnly = false,
  mobileOnly = false,
}: {
  loginOnly?: boolean;
  mobileOnly?: boolean;
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const adminFallbackPath = mobileOnly ? "/admin/mobile" : "/admin";
  const requestedNextPath = getNextPath(location.search, adminFallbackPath, ["/admin"]);
  const nextPath = requestedNextPath.startsWith("/admin/login")
    ? adminFallbackPath
    : requestedNextPath;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthConfigured, setIsAuthConfigured] = useState(true);
  const [authStep, setAuthStep] = useState<AdminAuthStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isTotpEnrollment, setIsTotpEnrollment] = useState(false);
  const [totpQrCode, setTotpQrCode] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<AdminMetrics>(emptyMetrics);
  const [supportRequests, setSupportRequests] = useState<SupportAccessRequest[]>([]);
  const [supportTickets, setSupportTickets] = useState<OperationalSupportTicket[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [operationalAlerts, setOperationalAlerts] = useState<OperationalAlert[]>([]);
  const [isDiscordConfigured, setIsDiscordConfigured] = useState(false);
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
  const [activeSection, setActiveSection] =
    useState<AdminDashboardSection>("overview");
  const [verificationReviewTab, setVerificationReviewTab] =
    useState<VerificationReviewTab>("pending");

  const activeSupportRequests = useMemo(
    () => supportRequests.filter((request) => request.is_active),
    [supportRequests],
  );
  const pendingVerificationRequests = useMemo(
    () =>
      verificationRequests.filter((request) =>
        isVisiblePendingVerificationRequest(request, verificationRequests),
      ),
    [verificationRequests],
  );
  const approvedVerificationRequests = useMemo(
    () => verificationRequests.filter((request) => request.status === "approved"),
    [verificationRequests],
  );
  const visibleVerificationRequests = useMemo(
    () =>
      verificationReviewTab === "pending"
        ? pendingVerificationRequests
        : approvedVerificationRequests,
    [
      approvedVerificationRequests,
      pendingVerificationRequests,
      verificationReviewTab,
    ],
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
      const [
        metricsResult,
        supportResult,
        ticketResult,
        verificationResult,
        alertResult,
      ] =
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
          apiFetch("/api/admin/operational-alerts", {
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

      if (alertResult.status === "fulfilled") {
        const alertData = (await alertResult.value.json()) as {
          operational_alerts?: OperationalAlert[];
          discord_configured?: boolean;
        };
        if (alertResult.value.ok) {
          setOperationalAlerts(alertData.operational_alerts ?? []);
          setIsDiscordConfigured(alertData.discord_configured === true);
        }
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

  const completeAdminLogin = () => {
    setIsAuthenticated(true);
    setAuthStep("credentials");
    setEmail("");
    setPassword("");
    setTotpCode("");
    setTotpQrCode("");
    setTotpSecret("");
    setIsTotpEnrollment(false);
    if (loginOnly) {
      navigate(nextPath, { replace: true });
    }
  };

  const restartAdminLogin = () => {
    setAuthStep("credentials");
    setPassword("");
    setTotpCode("");
    setTotpQrCode("");
    setTotpSecret("");
    setIsTotpEnrollment(false);
    setError("");
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const isTotpStep = authStep === "totp";
      const response = await apiFetch(
        isTotpStep ? "/api/admin/mfa/verify" : "/api/admin/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(
            isTotpStep ? { code: totpCode } : { email, password },
          ),
        },
      );
      const data = (await response.json()) as AdminAuthResponse;

      if (response.ok && data.authenticated === true) {
        completeAdminLogin();
        return;
      }

      if (!isTotpStep && response.ok && data.mfa_required === true) {
        setAuthStep("totp");
        setPassword("");
        setTotpCode("");
        setIsTotpEnrollment(data.enrollment_required === true);
        setTotpQrCode(data.qr_code?.trim() ?? "");
        setTotpSecret(data.secret?.trim() ?? "");
        return;
      }

      setIsAuthConfigured(data.configured !== false);
      if (
        isTotpStep &&
        (response.status === 403 || data.error === "운영자 인증을 다시 시작해 주세요.")
      ) {
        restartAdminLogin();
        setError("운영자 로그인을 다시 진행해 주세요.");
        return;
      }
      setError(
        data.configured === false
          ? "운영자 로그인을 사용할 수 없습니다. 서버 설정을 확인해 주세요."
          : translateApiErrorMessage(
              data.error,
              isTotpStep
                ? "인증 앱의 코드를 확인해 주세요."
                : "이메일 또는 비밀번호를 확인해 주세요.",
            ),
      );
    } catch {
      setError("운영자 로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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
      setOperationalAlerts([]);
      setIsDiscordConfigured(false);
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

    const isTotpStep = authStep === "totp";
    const safeTotpQrCode = totpQrCode.startsWith("data:image/")
      ? totpQrCode
      : "";

    return (
      <AuthLoginScreen
        title={isTotpStep ? "2단계 인증" : "운영자 로그인"}
        description={
          isTotpStep
            ? isTotpEnrollment
              ? "인증 앱을 등록하고 표시된 코드를 입력해 주세요."
              : "인증 앱에 표시된 코드를 입력해 주세요."
            : "개인 운영자 계정으로 로그인해 주세요."
        }
        fields={
          isTotpStep
            ? [
                {
                  id: "totpCode",
                  label: "인증 코드",
                  value: totpCode,
                  type: "text",
                  autoComplete: "one-time-code",
                  placeholder: "6자리 코드",
                  required: true,
                  disabled: !isAuthConfigured,
                  onChange: (value: string) =>
                    setTotpCode(value.replace(/\D/g, "").slice(0, 8)),
                },
              ]
            : [
                {
                  id: "email",
                  label: "이메일",
                  value: email,
                  type: "email",
                  autoComplete: "username",
                  placeholder: "name@company.com",
                  required: true,
                  disabled: !isAuthConfigured,
                  onChange: setEmail,
                },
                {
                  id: "password",
                  label: "비밀번호",
                  value: password,
                  type: "password",
                  autoComplete: "current-password",
                  placeholder: "비밀번호",
                  required: true,
                  disabled: !isAuthConfigured,
                  onChange: setPassword,
                },
              ]
        }
        submitLabel={isTotpStep ? "인증하고 들어가기" : "로그인"}
        submittingLabel={isTotpStep ? "인증 중" : "로그인 중"}
        submitDisabled={!isAuthConfigured}
        isSubmitting={isSubmitting}
        error={
          error ||
          (!isAuthConfigured
            ? "운영자 로그인을 사용할 수 없습니다. 서버 설정을 확인해 주세요."
            : undefined)
        }
        showOtherLoginLink={false}
        footer={
          <button
            type="button"
            onClick={isTotpStep ? restartAdminLogin : () => navigate("/login")}
            className="text-[13px] font-semibold text-neutral-500 transition hover:text-neutral-950"
          >
            {isTotpStep ? "계정 다시 입력" : "일반 로그인으로 돌아가기"}
          </button>
        }
        onSubmit={handleLogin}
      >
        {isTotpStep && isTotpEnrollment ? (
          <section
            aria-label="인증 앱 등록 정보"
            className="rounded-[14px] border border-neutral-200 bg-neutral-50 p-4"
          >
            {safeTotpQrCode ? (
              <img
                src={safeTotpQrCode}
                alt="인증 앱 등록 QR 코드"
                className="mx-auto h-40 w-40 rounded-[12px] bg-white p-2"
              />
            ) : null}
            {totpSecret ? (
              <div className={safeTotpQrCode ? "mt-3" : ""}>
                <p className="text-[12px] font-bold text-neutral-600">
                  직접 입력 키
                </p>
                <code className="mt-1.5 block break-all rounded-[10px] border border-neutral-200 bg-white px-3 py-2 text-center text-[12px] font-bold tracking-[0.08em] text-neutral-900">
                  {totpSecret}
                </code>
              </div>
            ) : null}
            {!safeTotpQrCode && !totpSecret ? (
              <p className="text-[13px] font-semibold leading-5 text-neutral-600">
                인증 앱 등록 정보를 불러오지 못했습니다. 계정을 다시 입력해 주세요.
              </p>
            ) : null}
          </section>
        ) : null}
      </AuthLoginScreen>
    );
  }

  if (loginOnly) {
    return <Navigate to={nextPath} replace />;
  }

  if (mobileOnly) {
    return (
      <MobileAdminOperations
        activeSupportRequests={activeSupportRequests}
        activeSupportTickets={activeSupportTickets}
        checkingVerificationId={checkingVerificationId}
        closingSupportId={closingSupportId}
        dataError={dataError}
        isDiscordConfigured={isDiscordConfigured}
        isLoadingData={isLoadingData}
        locationSearch={location.search}
        operationalAlerts={operationalAlerts}
        pendingVerificationRequests={pendingVerificationRequests}
        reviewingVerificationId={reviewingVerificationId}
        updatingTicketId={updatingTicketId}
        verificationRequests={verificationRequests}
        onApproveVerification={(id) => reviewVerificationRequest(id, "approved")}
        onClearError={() => setDataError("")}
        onCloseSupportAccess={closeSupportAccess}
        onLogout={handleLogout}
        onOpenContract={(contractId) =>
          navigate(`/advertiser/contract/${encodeURIComponent(contractId)}`)
        }
        onOpenSupportAccess={(request) =>
          navigate(`/contract/${encodeURIComponent(request.contract_id)}?support=${request.id}`)
        }
        onRefresh={loadAdminData}
        onRejectVerification={(id) => reviewVerificationRequest(id, "rejected")}
        onRecheckVerification={rerunVerificationAutomation}
        onSelectItem={(itemKey) =>
          navigate(`/admin/mobile?item=${encodeURIComponent(itemKey)}`, {
            replace: false,
          })
        }
        onUpdateTicketStatus={updateSupportTicketStatus}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1480px] items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark />
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-semibold tracking-[-0.02em]">
                {PRODUCT_NAME} 운영
              </h1>
              <p className="hidden text-xs font-medium text-neutral-500 sm:block">
                계약 본문은 당사자 지원 요청이 있을 때만 열립니다.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={loadAdminData}
              aria-label="새로고침"
              title="새로고침"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-400 sm:w-auto sm:px-3"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingData ? "animate-spin" : ""}`} />
              <span className="hidden whitespace-nowrap sm:inline">새로고침</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="로그아웃"
              title="로그아웃"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-700 transition hover:border-neutral-400 sm:w-auto sm:px-3"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden whitespace-nowrap sm:inline">로그아웃</span>
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
            label="수기인증"
            value={String(metrics.verification.pending_count)}
            helper={`누적 요청 ${metrics.verification.total_count}`}
            icon={<UserRoundCheck className="h-4 w-4" />}
          />
        </section>

        <AdminSectionTabs
          activeSection={activeSection}
          pendingVerificationCount={pendingVerificationRequests.length}
          supportTicketCount={activeSupportTickets.length}
          supportAccessCount={activeSupportRequests.length}
          onChange={setActiveSection}
        />

        <div className="mt-4">
          {activeSection === "overview" && (
            <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
                  상태별 계약 수
                </h2>
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
          )}

          {activeSection === "support_tickets" && (
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
          )}

          {activeSection === "support_access" && (
            <SupportAccessPanel
              requests={activeSupportRequests}
              closingId={closingSupportId}
              onOpen={(request) =>
                navigate(`/contract/${encodeURIComponent(request.contract_id)}?support=${request.id}`)
              }
              onClose={closeSupportAccess}
            />
          )}

          {activeSection === "manual_verification" && (
            <VerificationReviewPanel
              requests={visibleVerificationRequests}
              activeTab={verificationReviewTab}
              pendingCount={pendingVerificationRequests.length}
              approvedCount={approvedVerificationRequests.length}
              reviewingId={reviewingVerificationId}
              checkingId={checkingVerificationId}
              onTabChange={setVerificationReviewTab}
              onApprove={(id) => reviewVerificationRequest(id, "approved")}
              onReject={(id) => reviewVerificationRequest(id, "rejected")}
              onRecheck={rerunVerificationAutomation}
            />
          )}
        </div>
      </main>
    </div>
  );
}

type MobileOperationKind =
  | "all"
  | "verification"
  | "support_ticket"
  | "support_access"
  | "auth_health";

type MobileOperationItem = {
  key: string;
  id: string;
  kind: Exclude<MobileOperationKind, "all">;
  title: string;
  eyebrow: string;
  description: string;
  statusLabel: string;
  createdAt: string;
  tone: "info" | "normal" | "high" | "urgent";
};

function MobileAdminOperations({
  activeSupportRequests,
  activeSupportTickets,
  checkingVerificationId,
  closingSupportId,
  dataError,
  isDiscordConfigured,
  isLoadingData,
  locationSearch,
  operationalAlerts,
  pendingVerificationRequests,
  reviewingVerificationId,
  updatingTicketId,
  verificationRequests,
  onApproveVerification,
  onClearError,
  onCloseSupportAccess,
  onLogout,
  onOpenContract,
  onOpenSupportAccess,
  onRefresh,
  onRejectVerification,
  onRecheckVerification,
  onSelectItem,
  onUpdateTicketStatus,
}: {
  activeSupportRequests: SupportAccessRequest[];
  activeSupportTickets: OperationalSupportTicket[];
  checkingVerificationId: string;
  closingSupportId: string;
  dataError: string;
  isDiscordConfigured: boolean;
  isLoadingData: boolean;
  locationSearch: string;
  operationalAlerts: OperationalAlert[];
  pendingVerificationRequests: VerificationRequest[];
  reviewingVerificationId: string;
  updatingTicketId: string;
  verificationRequests: VerificationRequest[];
  onApproveVerification: (id: string) => void;
  onClearError: () => void;
  onCloseSupportAccess: (id: string) => void;
  onLogout: () => void;
  onOpenContract: (contractId: string) => void;
  onOpenSupportAccess: (request: SupportAccessRequest) => void;
  onRefresh: () => void;
  onRejectVerification: (id: string) => void;
  onRecheckVerification: (id: string) => void;
  onSelectItem: (itemKey: string) => void;
  onUpdateTicketStatus: (
    id: string,
    status: OperationalSupportTicket["status"],
  ) => void;
}) {
  const [kindFilter, setKindFilter] = useState<MobileOperationKind>("all");
  const selectedItemKey = useMemo(
    () => new URLSearchParams(locationSearch).get("item") ?? "",
    [locationSearch],
  );
  const items = useMemo(
    () =>
      buildMobileOperationItems({
        activeSupportRequests,
        activeSupportTickets,
        operationalAlerts,
        pendingVerificationRequests,
        verificationRequests,
      }),
    [
      activeSupportRequests,
      activeSupportTickets,
      operationalAlerts,
      pendingVerificationRequests,
      verificationRequests,
    ],
  );
  const visibleItems = useMemo(
    () =>
      kindFilter === "all"
        ? items
        : items.filter((item) => item.kind === kindFilter),
    [items, kindFilter],
  );
  const selectedItem = selectedItemKey
    ? items.find((item) => item.key === selectedItemKey)
    : visibleItems[0] ?? items[0];
  const linkedItemMissing = Boolean(selectedItemKey && !selectedItem);
  const pendingAlertCount = operationalAlerts.filter(
    (alert) => alert.status === "queued" || alert.status === "failed",
  ).length;
  const filters: Array<{ id: MobileOperationKind; label: string; count: number }> = [
    { id: "all", label: "전체", count: items.length },
    {
      id: "verification",
      label: "인증",
      count: items.filter((item) => item.kind === "verification").length,
    },
    {
      id: "support_ticket",
      label: "문의",
      count: items.filter((item) => item.kind === "support_ticket").length,
    },
    {
      id: "support_access",
      label: "지원",
      count: items.filter((item) => item.kind === "support_access").length,
    },
    {
      id: "auth_health",
      label: "로그인",
      count: items.filter((item) => item.kind === "auth_health").length,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[560px] items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark />
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em]">
                모바일 운영
              </h1>
              <p className="text-xs font-medium text-neutral-500">
                확인 {items.length.toLocaleString("ko-KR")}건
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              aria-label="새로고침"
              title="새로고침"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-400"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingData ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="로그아웃"
              title="로그아웃"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-400"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[560px] px-4 py-4">
        {dataError && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700">
            <span className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{dataError}</span>
            </span>
            <button type="button" onClick={onClearError} aria-label="닫기">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3">
            <p className="text-xs font-semibold text-neutral-500">처리 대기</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
              {items.length.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3">
            <p className="text-xs font-semibold text-neutral-500">폰 알림</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
              {isDiscordConfigured ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  Discord 연결
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4 text-amber-600" />
                  Discord 미설정
                </>
              )}
            </p>
            {pendingAlertCount > 0 && (
              <p className="mt-1 text-xs font-medium text-neutral-500">
                재시도 {pendingAlertCount}건
              </p>
            )}
          </div>
        </section>

        <nav className="mb-3 flex gap-1 rounded-lg bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {filters.map((filter) => {
            const selected = kindFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setKindFilter(filter.id)}
                className={`h-9 flex-1 rounded-md text-xs font-semibold transition ${
                  selected
                    ? "bg-neutral-950 text-white"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950"
                }`}
              >
                {filter.label}
                {filter.count > 0 && (
                  <span className={selected ? "ml-1 text-white/80" : "ml-1 text-neutral-400"}>
                    {formatBadgeCount(filter.count)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <section className="mb-3 space-y-2">
          {visibleItems.map((item) => {
            const selected = selectedItem?.key === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectItem(item.key)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                  selected
                    ? "border-neutral-950 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-500">
                      {item.eyebrow}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-neutral-950">
                      {item.title}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${mobileToneClass(
                      item.tone,
                    )}`}
                  >
                    {item.statusLabel}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">
                  {item.description}
                </p>
              </button>
            );
          })}

          {visibleItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-10 text-center">
              <p className="text-sm font-semibold text-neutral-400">
                확인할 항목이 없습니다.
              </p>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-4 h-10 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white"
              >
                새로고침
              </button>
            </div>
          )}
        </section>

        {linkedItemMissing ? (
          <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {isLoadingData ? (
              <div className="h-20 animate-pulse rounded-lg bg-neutral-100" />
            ) : (
              <>
                <h2 className="text-base font-semibold text-neutral-950">
                  현재 작업 대상이 아닙니다
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  이 알림의 인증 요청은 새 요청으로 대체되었거나 이미 처리되었습니다.
                </p>
              </>
            )}
          </section>
        ) : (
          <MobileOperationDetail
            checkingVerificationId={checkingVerificationId}
            closingSupportId={closingSupportId}
            item={selectedItem}
            operationalAlerts={operationalAlerts}
            reviewingVerificationId={reviewingVerificationId}
            supportAccessRequests={activeSupportRequests}
            supportTickets={activeSupportTickets}
            updatingTicketId={updatingTicketId}
            verificationRequests={verificationRequests}
            onApproveVerification={onApproveVerification}
            onCloseSupportAccess={onCloseSupportAccess}
            onOpenContract={onOpenContract}
            onOpenSupportAccess={onOpenSupportAccess}
            onRejectVerification={onRejectVerification}
            onRecheckVerification={onRecheckVerification}
            onUpdateTicketStatus={onUpdateTicketStatus}
          />
        )}
      </main>
    </div>
  );
}

function buildMobileOperationItems({
  activeSupportRequests,
  activeSupportTickets,
  operationalAlerts,
  pendingVerificationRequests,
  verificationRequests,
}: {
  activeSupportRequests: SupportAccessRequest[];
  activeSupportTickets: OperationalSupportTicket[];
  operationalAlerts: OperationalAlert[];
  pendingVerificationRequests: VerificationRequest[];
  verificationRequests: VerificationRequest[];
}) {
  const autoApprovedVerificationIds = new Set(
    operationalAlerts
      .filter(
        (alert) =>
          alert.kind === "verification_request" &&
          alert.action === "auto_approved",
      )
      .map((alert) => alert.subject_id),
  );
  const pendingIds = new Set(pendingVerificationRequests.map((request) => request.id));
  const autoApprovedRequests = verificationRequests.filter(
    (request) =>
      request.status === "approved" &&
      autoApprovedVerificationIds.has(request.id) &&
      !pendingIds.has(request.id),
  );
  const authHealthAlerts = operationalAlerts
    .filter((alert) => alert.kind === "auth_health" && alert.status !== "muted")
    .slice(0, 20);

  return [
    ...authHealthAlerts.map((alert) => ({
      key: `auth_health:${alert.id}`,
      id: alert.id,
      kind: "auth_health" as const,
      title: alert.title,
      eyebrow: "로그인 상태",
      description: alert.body,
      statusLabel: authHealthStatusLabel(alert),
      createdAt: alert.created_at,
      tone:
        alert.severity === "urgent"
          ? ("urgent" as const)
          : alert.severity === "high"
            ? ("high" as const)
            : ("normal" as const),
    })),
    ...pendingVerificationRequests.map((request) => ({
      key: `verification:${request.id}`,
      id: request.id,
      kind: "verification" as const,
      title: request.subject_name,
      eyebrow: verificationTypeLabel(request),
      description:
        request.platform_handle ??
        request.business_registration_number ??
        formatDateTime(request.created_at),
      statusLabel: "확인 필요",
      createdAt: request.created_at,
      tone: "high" as const,
    })),
    ...autoApprovedRequests.map((request) => ({
      key: `verification:${request.id}`,
      id: request.id,
      kind: "verification" as const,
      title: request.subject_name,
      eyebrow: verificationTypeLabel(request),
      description: request.reviewer_note ?? "자동 승인 완료",
      statusLabel: "자동 승인",
      createdAt: request.reviewed_at ?? request.updated_at,
      tone: "info" as const,
    })),
    ...activeSupportTickets.map((ticket) => ({
      key: `support_ticket:${ticket.id}`,
      id: ticket.id,
      kind: "support_ticket" as const,
      title: ticket.subject,
      eyebrow: supportTicketCategoryLabel(ticket.category),
      description: ticket.message,
      statusLabel: supportTicketStatusLabel(ticket.status),
      createdAt: ticket.created_at,
      tone: ticket.severity === "urgent" ? ("urgent" as const) : ticket.severity === "high" ? ("high" as const) : ("normal" as const),
    })),
    ...activeSupportRequests.map((request) => ({
      key: `support_access:${request.id}`,
      id: request.id,
      kind: "support_access" as const,
      title: `${requesterRoleLabel(request.requester_role)} 지원 열람`,
      eyebrow: `계약 ${shortId(request.contract_id)}`,
      description: request.reason,
      statusLabel: supportStatusLabel(request),
      createdAt: request.created_at,
      tone: "normal" as const,
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function MobileOperationDetail({
  checkingVerificationId,
  closingSupportId,
  item,
  operationalAlerts,
  reviewingVerificationId,
  supportAccessRequests,
  supportTickets,
  updatingTicketId,
  verificationRequests,
  onApproveVerification,
  onCloseSupportAccess,
  onOpenContract,
  onOpenSupportAccess,
  onRejectVerification,
  onRecheckVerification,
  onUpdateTicketStatus,
}: {
  checkingVerificationId: string;
  closingSupportId: string;
  item?: MobileOperationItem;
  operationalAlerts: OperationalAlert[];
  reviewingVerificationId: string;
  supportAccessRequests: SupportAccessRequest[];
  supportTickets: OperationalSupportTicket[];
  updatingTicketId: string;
  verificationRequests: VerificationRequest[];
  onApproveVerification: (id: string) => void;
  onCloseSupportAccess: (id: string) => void;
  onOpenContract: (contractId: string) => void;
  onOpenSupportAccess: (request: SupportAccessRequest) => void;
  onRejectVerification: (id: string) => void;
  onRecheckVerification: (id: string) => void;
  onUpdateTicketStatus: (
    id: string,
    status: OperationalSupportTicket["status"],
  ) => void;
}) {
  if (!item) return null;

  if (item.kind === "auth_health") {
    const alert = operationalAlerts.find((record) => record.id === item.id);
    if (!alert || alert.kind !== "auth_health") return null;

    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-neutral-500">
              {authHealthActionLabel(alert.action)}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
              {alert.title}
            </h2>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${mobileToneClass(
              item.tone,
            )}`}
          >
            {authHealthStatusLabel(alert)}
          </span>
        </div>
        <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-700">
          {alert.body}
        </p>
        <p className="mt-3 text-xs font-medium text-neutral-500">
          감지 {formatDateTime(alert.created_at)}
        </p>
      </section>
    );
  }

  if (item.kind === "verification") {
    const request = verificationRequests.find((record) => record.id === item.id);
    if (!request) return null;
    const evidenceUrl = getVerificationEvidenceUrl(request);
    const proofUrl = request.ownership_challenge_url ?? request.platform_url;
    const isInstagramDm =
      request.ownership_verification_method === "instagram_dm_code";
    const canReview = isActionableManualVerificationRequest(
      request,
      verificationRequests,
    );
    const instagramDmState = getInstagramDmState(request);
    const showInstagramDmFailureReason =
      isInstagramDm &&
      (["retrying_provider", "manual_review", "expired"].includes(
        instagramDmState,
      ) ||
        ["not_found", "blocked", "failed"].includes(
          request.ownership_check_status ?? "",
        ));

    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-neutral-500">
              {verificationTypeLabel(request)}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
              {request.subject_name}
            </h2>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${verificationStatusTone(request.status)}`}>
            {verificationStatusLabel(request.status)}
          </span>
        </div>

        <div className="mt-4 space-y-2 text-sm text-neutral-700">
          {request.platform_handle && <p>핸들 {request.platform_handle}</p>}
          {request.business_registration_number && (
            <p>사업자번호 {request.business_registration_number}</p>
          )}
          {request.ownership_challenge_code && (
            <p className="font-mono">코드 {request.ownership_challenge_code}</p>
          )}
          {showInstagramDmFailureReason && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
              Instagram DM · {getInstagramDmFailureReasonLabel(request)}
            </p>
          )}
          <p className="text-xs font-medium text-neutral-500">
            접수 {formatDateTime(request.created_at)}
          </p>
          {request.reviewer_note && (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
              {request.reviewer_note}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {proofUrl && (
            <a
              href={proofUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700"
            >
              URL 확인
            </a>
          )}
          {evidenceUrl && (
            <a
              href={evidenceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700"
            >
              증빙 보기
            </a>
          )}
        </div>

        {canReview ? (
          <div
            className={`mt-3 grid gap-2 ${
              isInstagramDm ? "grid-cols-2" : "grid-cols-3"
            }`}
          >
            {!isInstagramDm && (
              <button
                type="button"
                disabled={checkingVerificationId === request.id}
                onClick={() => onRecheckVerification(request.id)}
                className="h-10 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 disabled:opacity-50"
              >
                재확인
              </button>
            )}
            <button
              type="button"
              disabled={reviewingVerificationId === request.id}
              onClick={() => onApproveVerification(request.id)}
              className="h-10 rounded-lg bg-neutral-950 text-sm font-semibold text-white disabled:opacity-50"
            >
              승인
            </button>
            <button
              type="button"
              disabled={reviewingVerificationId === request.id}
              onClick={() => onRejectVerification(request.id)}
              className="h-10 rounded-lg border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              반려
            </button>
          </div>
        ) : request.status !== "pending" ? (
          <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
            처리 {formatDateTime(request.reviewed_at ?? request.updated_at)}
          </p>
        ) : null}
      </section>
    );
  }

  if (item.kind === "support_ticket") {
    const ticket = supportTickets.find((record) => record.id === item.id);
    if (!ticket) return null;

    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-neutral-500">
              {supportTicketCategoryLabel(ticket.category)}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
              {ticket.subject}
            </h2>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${supportTicketStatusTone(ticket.status)}`}>
            {supportTicketStatusLabel(ticket.status)}
          </span>
        </div>

        <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-700">
          {ticket.message}
        </p>
        <p className="mt-3 text-xs font-medium text-neutral-500">
          {requesterRoleLabel(ticket.requester_role)} · {formatDateTime(ticket.created_at)}
        </p>

        <div className="mt-4 grid gap-2">
          {ticket.contract_id && (
            <button
              type="button"
              onClick={() => onOpenContract(ticket.contract_id!)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700"
            >
              계약 열기
              <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
          {ticket.status === "open" && (
            <button
              type="button"
              disabled={updatingTicketId === ticket.id}
              onClick={() => onUpdateTicketStatus(ticket.id, "reviewing")}
              className="h-10 rounded-lg bg-neutral-950 text-sm font-semibold text-white disabled:opacity-50"
            >
              검토 시작
            </button>
          )}
          {(ticket.status === "open" || ticket.status === "reviewing") && (
            <button
              type="button"
              disabled={updatingTicketId === ticket.id}
              onClick={() => onUpdateTicketStatus(ticket.id, "resolved")}
              className="h-10 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 disabled:opacity-50"
            >
              해결 완료
            </button>
          )}
        </div>
      </section>
    );
  }

  const request = supportAccessRequests.find((record) => record.id === item.id);
  if (!request) return null;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-neutral-500">
            계약 {shortId(request.contract_id)}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
            {requesterRoleLabel(request.requester_role)} 지원 열람
          </h2>
        </div>
        <span className="rounded-full bg-neutral-950 px-2.5 py-1 text-[11px] font-semibold text-white">
          {supportStatusLabel(request)}
        </span>
      </div>

      <p className="mt-4 whitespace-pre-line text-sm leading-6 text-neutral-700">
        {request.reason}
      </p>
      <p className="mt-3 text-xs font-medium text-neutral-500">
        {formatRemaining(request.expires_at)} · {formatDateTime(request.created_at)}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!request.is_active}
          onClick={() => onOpenSupportAccess(request)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-neutral-950 text-sm font-semibold text-white disabled:bg-neutral-200 disabled:text-neutral-500"
        >
          열람
          <ArrowUpRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={!request.is_active || closingSupportId === request.id}
          onClick={() => onCloseSupportAccess(request.id)}
          className="h-10 rounded-lg border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 disabled:text-neutral-300"
        >
          종료
        </button>
      </div>
    </section>
  );
}

function getVerificationEvidenceUrl(request: VerificationRequest) {
  if (typeof request.evidence_snapshot_json?.evidence_file?.download_path === "string") {
    return request.evidence_snapshot_json.evidence_file.download_path;
  }
  if (typeof request.evidence_snapshot_json?.file_data_url === "string") {
    return request.evidence_snapshot_json.file_data_url;
  }
  return undefined;
}

function mobileToneClass(tone: MobileOperationItem["tone"]) {
  const tones: Record<MobileOperationItem["tone"], string> = {
    info: "bg-blue-50 text-blue-700",
    normal: "bg-neutral-100 text-neutral-700",
    high: "bg-amber-50 text-amber-800",
    urgent: "bg-rose-50 text-rose-700",
  };

  return tones[tone];
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

function AdminSectionTabs({
  activeSection,
  pendingVerificationCount,
  supportTicketCount,
  supportAccessCount,
  onChange,
}: {
  activeSection: AdminDashboardSection;
  pendingVerificationCount: number;
  supportTicketCount: number;
  supportAccessCount: number;
  onChange: (section: AdminDashboardSection) => void;
}) {
  const items: Array<{
    id: AdminDashboardSection;
    label: string;
    count?: number;
    urgentBadge?: number;
  }> = [
    { id: "overview", label: "운영 현황" },
    { id: "support_tickets", label: "고객 문의", count: supportTicketCount },
    { id: "support_access", label: "지원 열람", count: supportAccessCount },
    {
      id: "manual_verification",
      label: "수기인증",
      count: pendingVerificationCount,
      urgentBadge: pendingVerificationCount,
    },
  ];

  return (
    <nav
      aria-label="운영 대시보드 화면 전환"
      className="rounded-lg border border-neutral-200/80 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <div className="flex flex-wrap gap-1">
        {items.map((item) => {
          const selected = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-admin-section={item.id}
              onClick={() => onChange(item.id)}
              className={`relative h-10 rounded-md px-4 text-[13px] font-semibold transition ${
                selected
                  ? "bg-neutral-950 text-white"
                  : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-950"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {item.label}
                {item.count !== undefined &&
                item.count > 0 &&
                item.urgentBadge === undefined ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      selected
                        ? "bg-white/15 text-white"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {formatBadgeCount(item.count)}
                  </span>
                ) : null}
              </span>
              {item.urgentBadge !== undefined && item.urgentBadge > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-bold leading-4 text-white shadow-[0_4px_12px_rgba(239,68,68,0.4)] ring-2 ring-white">
                  {formatBadgeCount(item.urgentBadge)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
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
  activeTab,
  pendingCount,
  approvedCount,
  reviewingId,
  checkingId,
  onTabChange,
  onApprove,
  onReject,
  onRecheck,
}: {
  requests: VerificationRequest[];
  activeTab: VerificationReviewTab;
  pendingCount: number;
  approvedCount: number;
  reviewingId: string;
  checkingId: string;
  onTabChange: (tab: VerificationReviewTab) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRecheck: (id: string) => void;
}) {
  const tabs: Array<{
    id: VerificationReviewTab;
    label: string;
    count: number;
  }> = [
    { id: "pending", label: "인증 요청", count: pendingCount },
    { id: "approved", label: "인증 완료", count: approvedCount },
  ];

  return (
    <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold tracking-[-0.02em]">
          수기인증
        </h2>
        <UserRoundCheck className="h-4 w-4 text-neutral-400" />
      </div>

      <div className="mb-4 flex rounded-lg bg-neutral-100 p-1">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-verification-tab={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`h-9 flex-1 rounded-md text-xs font-semibold transition ${
                selected
                  ? "bg-white text-neutral-950 shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  selected
                    ? "bg-neutral-950 text-white"
                    : "bg-white text-neutral-500"
                }`}
              >
                {formatBadgeCount(tab.count)}
              </span>
            </button>
          );
        })}
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
          const canReview = isActionableManualVerificationRequest(
            request,
            requests,
          );
          const isHandleAppeal = isPublicProfileHandleAppeal(request);
          const claimedHandle = getEvidenceString(request, "claimed_handle");
          const claimedProfileUrl =
            getEvidenceString(request, "claimed_profile_url") ||
            (claimedHandle ? `https://yeollock.me/${claimedHandle}` : "");
          const currentOwnerId = getEvidenceString(request, "current_owner_profile_id");
          const claimReason = getEvidenceString(request, "reason") || request.note;
          const automationSummary = getVerificationAutomationSummary(request);
          const businessStartDate = getEvidenceString(
            request,
            "business_start_date",
          );
          const fallbackReason = getVerificationFallbackReasonLabel(
            getEvidenceString(request, "fallback_reason"),
          );
          const instagramDmFailureReason =
            getInstagramDmFailureReasonLabel(request);

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
                {request.ownership_verification_method === "instagram_dm_code" &&
                  request.status === "pending" &&
                  request.ownership_check_status === "failed" && (
                  <p className="font-semibold text-neutral-700">
                    Instagram DM 자동 확인 실패 · {instagramDmFailureReason}
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
                {request.representative_name && (
                  <p>대표자 {request.representative_name}</p>
                )}
                {businessStartDate && <p>개업일 {businessStartDate}</p>}
                {fallbackReason && (
                  <p className="font-semibold text-amber-700">
                    서류 전환 사유 {fallbackReason}
                  </p>
                )}
                {automationSummary &&
                  request.ownership_verification_method !==
                    "instagram_dm_code" && <p>{automationSummary}</p>}
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
                {canReview && (
                  <>
                    {request.ownership_verification_method !==
                      "instagram_dm_code" && (
                      <button
                        type="button"
                        disabled={checkingId === request.id}
                        title={automationSummary || undefined}
                        onClick={() => onRecheck(request.id)}
                        className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:border-neutral-400 disabled:opacity-50"
                      >
                        {checkingId === request.id ? "자동 확인 중" : "자동 확인"}
                      </button>
                    )}
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
                {!isPending && (
                  <span className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-500">
                    처리 {formatDateTime(request.reviewed_at ?? request.updated_at)}
                  </span>
                )}
              </div>
            </article>
          );
        })}

        {requests.length === 0 && (
          <EmptyState
            text={
              activeTab === "pending"
                ? "처리할 인증 요청이 없습니다."
                : "완료된 인증이 없습니다."
            }
          />
        )}
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

function authHealthActionLabel(action: OperationalAlert["action"]) {
  const labels: Partial<Record<OperationalAlert["action"], string>> = {
    provider_degraded: "인증 공급자 오류",
    terminal_spike: "세션 종료 증가",
    revoke_failed: "세션 폐기 실패",
    rate_limit_spike: "로그인 제한 증가",
  };

  return labels[action] ?? "로그인 상태";
}

function authHealthStatusLabel(alert: OperationalAlert) {
  if (alert.status === "failed") return "전송 실패";
  if (alert.status === "queued") return "확인 필요";
  if (alert.status === "sent") return "알림 전송";
  return "숨김";
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
    instagram_dm_code: "Instagram DM 인증",
    profile_bio_code: "프로필 소개 코드",
    public_post_code: "공개 게시글 코드",
    channel_description_code: "채널 설명 코드",
    screenshot_review: "스크린샷 검수",
  };

  return labels[method] ?? method;
}

function isActionableManualVerificationRequest(
  request: VerificationRequest,
  requests: VerificationRequest[],
) {
  if (request.status !== "pending") return false;
  if (request.ownership_verification_method !== "instagram_dm_code") {
    return true;
  }
  const ownership = request.evidence_snapshot_json?.ownership_verification as
    | Record<string, unknown>
    | undefined;
  const instagramDm = ownership?.instagram_dm as
    | Record<string, unknown>
    | undefined;
  const isFailureState =
    instagramDm?.state === "manual_review" || instagramDm?.state === "expired";
  if (!isFailureState) return false;
  const handle = request.platform_handle?.replace(/^@+/, "").toLowerCase();
  const createdAt = new Date(request.created_at).getTime();
  return !requests.some(
    (candidate) =>
      candidate.id !== request.id &&
      candidate.target_id === request.target_id &&
      candidate.platform === "instagram" &&
      candidate.platform_handle?.replace(/^@+/, "").toLowerCase() === handle &&
      new Date(candidate.created_at).getTime() >= createdAt,
  );
}

function isInstagramDmProviderRetryRequest(
  request: VerificationRequest,
  requests: VerificationRequest[],
) {
  return (
    request.status === "pending" &&
    request.platform === "instagram" &&
    request.ownership_verification_method === "instagram_dm_code" &&
    getInstagramDmState(request) === "retrying_provider" &&
    !requests.some(
      (candidate) =>
        candidate.id !== request.id &&
        candidate.target_id === request.target_id &&
        candidate.platform === "instagram" &&
        candidate.platform_handle?.replace(/^@+/, "").toLowerCase() ===
          request.platform_handle?.replace(/^@+/, "").toLowerCase() &&
        new Date(candidate.created_at).getTime() >=
          new Date(request.created_at).getTime(),
    )
  );
}

function isVisiblePendingVerificationRequest(
  request: VerificationRequest,
  requests: VerificationRequest[],
) {
  return (
    isActionableManualVerificationRequest(request, requests) ||
    isInstagramDmProviderRetryRequest(request, requests)
  );
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
    return "Instagram DM 자동 확인을 완료하지 못했습니다. 새 인증 요청에서 발급된 새 코드를 공식 계정으로 보내 주세요.";
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

function getInstagramDmState(request: VerificationRequest) {
  const ownership = request.evidence_snapshot_json?.ownership_verification as
    | Record<string, unknown>
    | undefined;
  const instagramDm = ownership?.instagram_dm as
    | Record<string, unknown>
    | undefined;
  return typeof instagramDm?.state === "string" ? instagramDm.state : "";
}

function getInstagramDmFailureReasonLabel(request: VerificationRequest) {
  const ownership = request.evidence_snapshot_json?.ownership_verification as
    | Record<string, unknown>
    | undefined;
  const instagramDm = ownership?.instagram_dm as
    | Record<string, unknown>
    | undefined;
  const reason = typeof instagramDm?.failure_reason === "string"
    ? instagramDm.failure_reason
    : "";
  const labels: Record<string, string> = {
    expired: "코드 만료",
    username_mismatch: "제출 계정과 DM 발신 계정 불일치",
    provider_unavailable: "Meta 발신자 조회 일시 실패 · 자동 재시도",
  };
  return labels[reason] ?? "사유 확인 필요";
}

function getVerificationFallbackReasonLabel(value: string) {
  const labels: Record<string, string> = {
    not_matched: "정보 불일치 또는 신규 등록 반영 지연",
    service_unavailable: "국세청 자동 확인 일시 불가",
    inactive: "휴업 또는 폐업 상태 조회",
  };
  return labels[value] ?? "";
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
