import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  FileWarning,
  Link2,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppStore, type AuditEvent, type Contract } from "../../store";
import {
  verificationStatusLabel,
  verificationStatusTone,
  type VerificationRequest,
} from "../../domain/verification";
import { AuthLoginScreen } from "../../components/AuthLoginScreen";
import { buildLoginRedirect, getNextPath } from "../../domain/navigation";

type QueueTone = "critical" | "warning" | "neutral" | "good";

const STATUS_LABELS: Record<Contract["status"], string> = {
  DRAFT: "초안",
  REVIEWING: "크리에이터 검토",
  NEGOTIATING: "수정 요청",
  APPROVED: "서명 대기",
  SIGNED: "서명 완료",
};

const STATUS_ORDER: Contract["status"][] = [
  "DRAFT",
  "REVIEWING",
  "NEGOTIATING",
  "APPROVED",
  "SIGNED",
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function SystemAdminDashboard({ loginOnly = false }: { loginOnly?: boolean } = {}) {
  const contracts = useAppStore((state) => state.contracts);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const syncError = useAppStore((state) => state.syncError);
  const hydrateContracts = useAppStore((state) => state.hydrateContracts);
  const resetHydration = useAppStore((state) => state.resetHydration);
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
  const [verificationRequests, setVerificationRequests] = useState<
    VerificationRequest[]
  >([]);
  const [verificationError, setVerificationError] = useState("");
  const [reviewingVerificationId, setReviewingVerificationId] = useState("");

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/admin/session", {
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
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
    await fetch("/api/admin/logout", { method: "POST" });
    resetHydration();
    setIsAuthenticated(false);
  };

  const loadVerificationRequests = async () => {
    setVerificationError("");

    try {
      const response = await fetch("/api/admin/verification-requests", {
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as {
        verification_requests?: VerificationRequest[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Verification queue could not be loaded");
      }

      setVerificationRequests(data.verification_requests ?? []);
    } catch (requestError) {
      setVerificationError(
        requestError instanceof Error
          ? requestError.message
          : "Verification queue could not be loaded",
      );
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void loadVerificationRequests();
      void hydrateContracts({ force: true });
    }
  }, [hydrateContracts, isAuthenticated, resetHydration]);

  const reviewVerificationRequest = async (
    id: string,
    status: "approved" | "rejected",
  ) => {
    setReviewingVerificationId(id);
    setVerificationError("");

    try {
      const response = await fetch(`/api/admin/verification-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          status,
          reviewed_by_name: "DirectSign 운영자",
          reviewer_note:
            status === "approved"
              ? "수기 확인 후 승인했습니다."
              : "제출 정보 또는 문서 확인이 필요합니다.",
        }),
      });
      const data = (await response.json()) as {
        request?: VerificationRequest;
        error?: string;
      };

      if (!response.ok || !data.request) {
        throw new Error(data.error ?? "Verification review failed");
      }

      setVerificationRequests((current) =>
        current.map((request) => (request.id === id ? data.request! : request)),
      );
    } catch (requestError) {
      setVerificationError(
        requestError instanceof Error
          ? requestError.message
          : "Verification review failed",
      );
    } finally {
      setReviewingVerificationId("");
    }
  };

  const operations = useMemo(
    () => buildOperationalSnapshot(contracts, isSyncing, syncError),
    [contracts, isSyncing, syncError],
  );

  if (isCheckingSession) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-neutral-50 font-sans">
        <div className="border border-neutral-200 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
            DirectSign 운영
          </p>
          <p className="mt-2 text-sm font-medium text-neutral-900">
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
            label: "관리자 인증 코드",
            value: accessCode,
            type: "password",
            autoComplete: "one-time-code",
            placeholder: "인증 코드 입력",
            required: true,
            disabled: !isAuthConfigured,
            onChange: setAccessCode,
          },
        ]}
        submitLabel="콘솔 열기"
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
            로그인 선택으로 돌아가기
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
    <div className="flex min-h-screen flex-col bg-[#f7f7f5] font-sans text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1520px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="hidden">
                DirectSign 운영
              </p>
              <h1 className="text-base font-semibold tracking-tight text-neutral-950">
                운영자 콘솔
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="hidden h-9 border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 transition-colors hover:border-neutral-400 sm:inline-flex sm:items-center"
            >
              광고주 워크스페이스
            </button>
            <div className="flex h-9 items-center gap-2 border border-neutral-200 bg-neutral-50 px-3 text-xs font-semibold text-neutral-600">
              <span
                className={`h-2 w-2 rounded-full ${
                  syncError
                    ? "bg-rose-500"
                    : isSyncing
                      ? "bg-amber-500"
                      : "bg-neutral-500"
                }`}
              />
              {syncError ? "동기화 확인 필요" : isSyncing ? "동기화 중" : "로컬 저장 준비됨"}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="hidden h-9 border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-900 sm:inline-flex sm:items-center"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1520px] flex-1 px-5 py-4 sm:px-8 lg:px-10">
        <section className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            label="진행 중 계약"
            value={operations.openContracts}
            helper={`서명 완료 기록 ${operations.signedContracts}건 보관`}
            icon={<FileWarning className="h-4 w-4" />}
            tone={operations.openContracts > 0 ? "neutral" : "good"}
          />
          <MetricTile
            label="동기화 실패"
            value={operations.syncFailures}
            helper={syncError ?? "로컬 동기화 실패 없음"}
            icon={<DatabaseZap className="h-4 w-4" />}
            tone={operations.syncFailures > 0 ? "critical" : "good"}
          />
          <MetricTile
            label="만료 임박 링크"
            value={operations.expiringLinks.length}
            helper="72시간 안에 만료되는 활성 공유 링크"
            icon={<Link2 className="h-4 w-4" />}
            tone={operations.expiringLinks.length > 0 ? "warning" : "good"}
          />
          <MetricTile
            label="장기 미서명"
            value={operations.agingUnsigned.length}
            helper="7일 이상 지연되었거나 기한이 지난 미서명 계약"
            icon={<Clock3 className="h-4 w-4" />}
            tone={operations.agingUnsigned.length > 0 ? "warning" : "good"}
          />
          <MetricTile
            label="계정 리스크"
            value={operations.tenantsAtRisk}
            helper={`관찰 중인 광고주 계정 ${operations.tenantHealth.length}개`}
            icon={<Building2 className="h-4 w-4" />}
            tone={operations.tenantsAtRisk > 0 ? "warning" : "good"}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
          <div className="space-y-4">
            <section className="border border-neutral-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="hidden">
                    실시간 운영
                  </p>
                  <h2 className="text-[17px] font-semibold tracking-tight text-neutral-950">
                    운영 큐 센터
                  </h2>
                </div>
                <p className="text-xs text-neutral-500">
                  현재 로컬 계약 저장소 기준으로 안전하게 집계합니다.
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <QueuePanel
                  title="동기화 실패"
                  description="운영자 재시도 또는 확인이 필요한 저장/API 상태"
                  empty="로컬 저장소에 동기화 실패가 없습니다."
                  items={operations.syncQueue}
                  onOpen={(id) => id && navigate(`/advertiser/contract/${id}`)}
                />
                <QueuePanel
                  title="만료 임박 공유 링크"
                  description="곧 만료되거나 이미 오래된 크리에이터 링크"
                  empty="72시간 내 만료되는 활성 공유 링크가 없습니다."
                  items={operations.expiringLinks}
                  onOpen={(id) => navigate(`/advertiser/contract/${id}`)}
                />
                <QueuePanel
                  title="장기 미서명"
                  description="서명 또는 검토가 지연되는 계약"
                  empty="정책 기준을 넘긴 미서명 계약이 없습니다."
                  items={operations.agingUnsigned}
                  onOpen={(id) => navigate(`/advertiser/contract/${id}`)}
                />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="border border-neutral-200 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="hidden">
                      계약 처리량
                    </p>
                    <h2 className="text-[16px] font-semibold text-neutral-950">
                      상태 분포
                    </h2>
                  </div>
                  <Activity className="h-4 w-4 text-neutral-400" />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={operations.statusChart}>
                      <CartesianGrid stroke="#e5e5e5" vertical={false} />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#737373", fontSize: 11 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#737373", fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ fill: "#f5f5f5" }}
                        contentStyle={{
                          border: "1px solid #e5e5e5",
                          borderRadius: 4,
                          boxShadow: "none",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" fill="#171717" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border border-neutral-200 bg-white p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="hidden">
                      광고주 상태
                    </p>
                    <h2 className="text-[16px] font-semibold text-neutral-950">
                      광고주 계정 운영 상태
                    </h2>
                  </div>
                  <UserRoundCheck className="h-4 w-4 text-neutral-400" />
                </div>
                <div className="overflow-hidden border border-neutral-100">
                  <div className="grid grid-cols-[minmax(160px,1fr)_70px_70px_88px] bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    <span>계정</span>
                    <span>진행</span>
                    <span>위험</span>
                    <span>최근</span>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {operations.tenantHealth.map((tenant) => (
                      <button
                        key={tenant.id}
                        type="button"
                        onClick={() =>
                          tenant.latestContractId &&
                          navigate(`/advertiser/contract/${tenant.latestContractId}`)
                        }
                        className="grid w-full grid-cols-[minmax(160px,1fr)_70px_70px_88px] items-center px-3 py-3 text-left text-sm transition-colors hover:bg-neutral-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-neutral-900">
                            {tenant.name}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">
                            {tenant.manager}
                          </span>
                        </span>
                        <span className="font-mono text-xs text-neutral-700">
                          {tenant.open}
                        </span>
                        <RiskBadge count={tenant.risk} />
                        <span className="text-xs text-neutral-500">
                          {formatRelative(tenant.lastActivity)}
                        </span>
                      </button>
                    ))}
                    {operations.tenantHealth.length === 0 && (
                      <div className="px-3 py-6 text-sm text-neutral-400">
                        확인 가능한 계정 기록이 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <VerificationReviewPanel
              requests={verificationRequests}
              error={verificationError}
              reviewingId={reviewingVerificationId}
              onApprove={(id) => reviewVerificationRequest(id, "approved")}
              onReject={(id) => reviewVerificationRequest(id, "rejected")}
              onRefresh={loadVerificationRequests}
            />

            <section className="border border-neutral-200 bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="hidden">
                    감사 이력
                  </p>
                  <h2 className="text-[16px] font-semibold text-neutral-950">
                    최근 증빙 기록
                  </h2>
                </div>
                <CheckCircle2 className="h-4 w-4 text-neutral-400" />
              </div>
              <div className="space-y-3">
                {operations.recentAudit.map((event) => (
                  <button
                    key={`${event.contractId}-${event.id}`}
                    type="button"
                    onClick={() => navigate(`/advertiser/contract/${event.contractId}`)}
                    className="w-full border border-neutral-100 bg-neutral-50 p-3 text-left transition-colors hover:border-neutral-300 hover:bg-white"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {eventActionLabel(event.action)}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {formatRelative(event.created_at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium text-neutral-900">
                      {event.description}
                    </p>
                    <p className="mt-2 truncate text-xs text-neutral-500">
                      {event.contractTitle}
                    </p>
                  </button>
                ))}
                {operations.recentAudit.length === 0 && (
                  <div className="border border-dashed border-neutral-200 px-4 py-5 text-center text-sm text-neutral-400">
                    아직 수집된 감사 이벤트가 없습니다.
                  </div>
                )}
              </div>
            </section>

            <section className="border border-neutral-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-neutral-500" />
                <h2 className="text-sm font-semibold text-neutral-950">
                  운영 메모
                </h2>
              </div>
              <ul className="space-y-3 text-sm leading-6 text-neutral-600">
                <li>고객 알림 전에 동기화 실패부터 우선 확인하세요.</li>
                <li>검토 중인 크리에이터 링크가 만료되기 전에 갱신하세요.</li>
                <li>오래된 승인 계약은 광고주 담당자에게 에스컬레이션하세요.</li>
              </ul>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function VerificationReviewPanel({
  requests,
  error,
  reviewingId,
  onApprove,
  onReject,
  onRefresh,
}: {
  requests: VerificationRequest[];
  error: string;
  reviewingId: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRefresh: () => void;
}) {
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const visibleRequests = pendingRequests.length > 0 ? pendingRequests : requests.slice(0, 4);

  return (
    <section className="border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="hidden">
            Verification
          </p>
          <h2 className="text-[16px] font-semibold text-neutral-950">
            수기 인증 대기열
          </h2>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-900"
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {visibleRequests.map((request) => {
          const evidenceUrl =
            typeof request.evidence_snapshot_json?.evidence_file?.download_path === "string"
              ? request.evidence_snapshot_json.evidence_file.download_path
              : typeof request.evidence_snapshot_json?.file_data_url === "string"
              ? request.evidence_snapshot_json.file_data_url
              : undefined;
          const proofUrl = request.ownership_challenge_url ?? request.platform_url;
          const isPending = request.status === "pending";

          return (
            <div
              key={request.id}
              className="border border-neutral-100 bg-neutral-50 p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">
                    {request.subject_name}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {verificationTypeLabel(request)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${verificationStatusTone(
                    request.status,
                  )}`}
                >
                  {verificationStatusLabel(request.status)}
                </span>
              </div>

              <div className="space-y-1 text-xs leading-5 text-neutral-500">
                {request.platform_handle && (
                  <p className="truncate">핸들 {request.platform_handle}</p>
                )}
                {request.ownership_challenge_code && (
                  <p className="font-mono text-neutral-700">
                    코드 {request.ownership_challenge_code}
                  </p>
                )}
                {request.ownership_verification_method && (
                  <p>방식 {ownershipMethodLabel(request.ownership_verification_method)}</p>
                )}
                {request.ownership_check_status && (
                  <p>
                    자동 확인 {ownershipCheckLabel(request.ownership_check_status)}
                    {request.ownership_checked_at
                      ? ` · ${formatRelative(request.ownership_checked_at)}`
                      : ""}
                  </p>
                )}
                {request.ownership_challenge_url && (
                  <p className="truncate">증빙 {request.ownership_challenge_url}</p>
                )}
                {request.business_registration_number && (
                  <p>사업자번호 {request.business_registration_number}</p>
                )}
                {request.platform_url && (
                  <p className="truncate">계정 {request.platform_url}</p>
                )}
                {request.document_check_number && (
                  <p>문서번호 {request.document_check_number}</p>
                )}
                {request.evidence_file_name && (
                  <p className="truncate">파일 {request.evidence_file_name}</p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {proofUrl && (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
                  >
                    증빙 URL
                  </a>
                )}
                {evidenceUrl && (
                  <a
                    href={evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950"
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
                      className="h-8 border border-neutral-950 bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === request.id}
                      onClick={() => onReject(request.id)}
                      className="h-8 border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      반려
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {visibleRequests.length === 0 && (
          <div className="border border-dashed border-neutral-200 px-4 py-5 text-center text-sm text-neutral-400">
            접수된 인증 요청이 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  icon: React.ReactNode;
  tone: QueueTone;
}) {
  return (
    <div className="border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-neutral-400">
          {label}
        </p>
        <span className={`flex h-8 w-8 items-center justify-center ${toneClasses(tone)}`}>
          {icon}
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-neutral-950">
        {value}
      </p>
      <p className="mt-2 line-clamp-1 text-xs leading-5 text-neutral-500">
        {helper}
      </p>
    </div>
  );
}

function QueuePanel({
  title,
  description,
  empty,
  items,
  onOpen,
}: {
  title: string;
  description: string;
  empty: string;
  items: QueueItem[];
  onOpen: (contractId?: string) => void;
}) {
  return (
    <div className="min-w-0 border border-neutral-200">
      <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-950">{title}</h3>
          <span className="font-mono text-xs text-neutral-500">{items.length}</span>
        </div>
        <p className="hidden">{description}</p>
      </div>
      <div className="max-h-[260px] divide-y divide-neutral-100 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.contractId)}
            className="w-full p-3 text-left transition-colors hover:bg-neutral-50"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="line-clamp-2 text-sm font-semibold text-neutral-950">
                {item.title}
              </p>
              <span
                className={`shrink-0 px-2 py-1 text-[11px] font-semibold ${toneClasses(
                  item.tone,
                )}`}
              >
                {item.badge}
              </span>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-neutral-500">
              {item.detail}
            </p>
            {item.meta && (
              <p className="mt-2 truncate text-xs font-medium text-neutral-400">
                {item.meta}
              </p>
            )}
          </button>
        ))}
        {items.length === 0 && (
          <div className="flex min-h-[96px] items-center justify-center px-4 text-center text-sm text-neutral-400">
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}

function RiskBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="w-fit bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
        정상
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit items-center gap-1 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
      <AlertTriangle className="h-3 w-3" />
      {count}
    </span>
  );
}

interface QueueItem {
  id: string;
  contractId?: string;
  title: string;
  detail: string;
  meta?: string;
  badge: string;
  tone: QueueTone;
}

interface RecentAuditItem extends AuditEvent {
  contractId: string;
  contractTitle: string;
}

function buildOperationalSnapshot(
  contracts: Contract[],
  isSyncing: boolean,
  syncError?: string,
) {
  const now = Date.now();
  const openContracts = contracts.filter((contract) => contract.status !== "SIGNED");
  const signedContracts = contracts.length - openContracts.length;

  const syncQueue: QueueItem[] = [
    ...(syncError
      ? [
          {
            id: "store-sync-error",
            title: "계약 저장소 동기화 실패",
            detail: syncError,
            meta: "서버 저장 상태가 로컬 변경보다 늦을 수 있습니다.",
            badge: "실패",
            tone: "critical" as QueueTone,
          },
        ]
      : []),
    ...(isSyncing
      ? [
          {
            id: "store-syncing",
            title: "동기화 진행 중",
            detail: "로컬 변경사항을 API와 맞추는 중입니다.",
            meta: "준비 상태로 돌아올 때까지 확인하세요.",
            badge: "진행",
            tone: "neutral" as QueueTone,
          },
        ]
      : []),
  ];

  const expiringLinks = contracts
    .filter(
      (contract) =>
        contract.evidence?.share_token_status === "active" &&
        contract.evidence.share_token_expires_at,
    )
    .map((contract) => {
      const expiry = parseDate(contract.evidence?.share_token_expires_at);
      const hours = Math.ceil((expiry - now) / (60 * 60 * 1000));
      return { contract, expiry, hours };
    })
    .filter(({ hours }) => hours <= 72)
    .sort((a, b) => a.expiry - b.expiry)
    .map(({ contract, hours }) => ({
      id: `link-${contract.id}`,
      contractId: contract.id,
      title: contract.title,
      detail:
        hours <= 0
          ? "활성 공유 링크가 이미 만료 시각을 지났습니다."
          : `크리에이터 공유 링크가 약 ${hours}시간 후 만료됩니다.`,
      meta: `${contract.influencer_info.name} / ${tenantName(contract)}`,
      badge: hours <= 0 ? "만료" : "임박",
      tone: hours <= 0 ? ("critical" as QueueTone) : ("warning" as QueueTone),
    }));

  const agingUnsigned = openContracts
    .map((contract) => {
      const ageDays = Math.floor((now - parseDate(contract.created_at)) / DAY_MS);
      const dueAt = parseDate(contract.workflow?.due_at);
      const overdueDays = Number.isFinite(dueAt)
        ? Math.floor((now - dueAt) / DAY_MS)
        : Number.NEGATIVE_INFINITY;
      return { contract, ageDays, overdueDays };
    })
    .filter(
      ({ contract, ageDays, overdueDays }) =>
        ageDays >= 7 || overdueDays >= 0 || contract.status === "APPROVED",
    )
    .sort((a, b) => b.overdueDays - a.overdueDays || b.ageDays - a.ageDays)
    .map(({ contract, ageDays, overdueDays }) => ({
      id: `aging-${contract.id}`,
      contractId: contract.id,
      title: contract.title,
      detail:
        contract.status === "APPROVED"
          ? "서명 요청 가능 상태입니다."
          : overdueDays >= 0
          ? `업무 기한이 정책 기준보다 ${overdueDays + 1}일 지났습니다.`
          : `생성 후 ${ageDays}일 동안 서명되지 않았습니다.`,
      meta: `${contract.influencer_info.name} / 다음 담당: ${actorLabel(
        contract.workflow?.next_actor,
      )}`,
      badge: contract.status === "APPROVED" ? "서명" : "지연",
      tone: overdueDays >= 0 ? ("critical" as QueueTone) : ("warning" as QueueTone),
    }));

  const recentAudit = contracts
    .flatMap((contract) =>
      (contract.audit_events ?? []).map((event): RecentAuditItem => ({
        ...event,
        contractId: contract.id,
        contractTitle: contract.title,
      })),
    )
    .sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at))
    .slice(0, 8);

  const tenantHealth = Array.from(
    contracts.reduce((map, contract) => {
      const id = contract.advertiser_id;
      const current = map.get(id) ?? {
        id,
        name: tenantName(contract),
        manager: contract.advertiser_info?.manager ?? "담당자 미지정",
        total: 0,
        open: 0,
        risk: 0,
        lastActivity: contract.updated_at,
        latestContractId: contract.id,
      };

      current.total += 1;
      current.open += contract.status === "SIGNED" ? 0 : 1;
      current.risk += isContractAtRisk(contract, now) ? 1 : 0;

      if (parseDate(contract.updated_at) > parseDate(current.lastActivity)) {
        current.lastActivity = contract.updated_at;
        current.latestContractId = contract.id;
      }

      map.set(id, current);
      return map;
    }, new Map<string, TenantHealth>()),
  )
    .map(([, tenant]) => tenant)
    .sort((a, b) => b.risk - a.risk || b.open - a.open);

  const statusChart = STATUS_ORDER.map((status) => ({
    name: STATUS_LABELS[status],
    count: contracts.filter((contract) => contract.status === status).length,
  }));

  return {
    openContracts: openContracts.length,
    signedContracts,
    syncFailures: syncError ? 1 : 0,
    syncQueue,
    expiringLinks,
    agingUnsigned,
    recentAudit,
    tenantHealth,
    tenantsAtRisk: tenantHealth.filter((tenant) => tenant.risk > 0).length,
    statusChart,
  };
}

interface TenantHealth {
  id: string;
  name: string;
  manager: string;
  total: number;
  open: number;
  risk: number;
  lastActivity: string;
  latestContractId: string;
}

function isContractAtRisk(contract: Contract, now: number) {
  if (contract.workflow?.risk_level === "high") return true;
  if (contract.status === "NEGOTIATING") return true;

  const dueAt = parseDate(contract.workflow?.due_at);
  if (Number.isFinite(dueAt) && dueAt <= now && contract.status !== "SIGNED") {
    return true;
  }

  const expiresAt = parseDate(contract.evidence?.share_token_expires_at);
  return (
    contract.evidence?.share_token_status === "active" &&
    Number.isFinite(expiresAt) &&
    expiresAt - now <= 72 * 60 * 60 * 1000
  );
}

function tenantName(contract: Contract) {
  return contract.advertiser_info?.name ?? contract.advertiser_id;
}

function actorLabel(actor?: string) {
  if (actor === "advertiser") return "광고주";
  if (actor === "influencer") return "인플루언서";
  if (actor === "admin") return "운영자";
  return "미지정";
}

function eventActionLabel(action: string) {
  const labels: Record<string, string> = {
    contract_created: "계약 생성",
    draft_saved: "초안 저장",
    share_link_issued: "공유 링크 발급",
    clause_change_requested: "조항 수정 요청",
    all_clauses_approved: "조항 승인 완료",
    contract_signed: "서명 완료",
  };

  return labels[action] ?? action;
}

function verificationTypeLabel(request: VerificationRequest) {
  if (request.target_type === "advertiser_organization") {
    return "광고주 사업자등록증명원";
  }

  const platform = request.platform ? ` / ${request.platform}` : "";
  return `인플루언서 계정 확인${platform}`;
}

function ownershipMethodLabel(
  method: NonNullable<VerificationRequest["ownership_verification_method"]>,
) {
  const labels: Record<
    NonNullable<VerificationRequest["ownership_verification_method"]>,
    string
  > = {
    profile_bio_code: "프로필 소개 코드",
    public_post_code: "공개 게시글 코드",
    channel_description_code: "채널 설명 코드",
    screenshot_review: "스크린샷 검수",
  };

  return labels[method];
}

function ownershipCheckLabel(
  status: NonNullable<VerificationRequest["ownership_check_status"]>,
) {
  const labels: Record<
    NonNullable<VerificationRequest["ownership_check_status"]>,
    string
  > = {
    not_run: "미실행",
    matched: "코드 확인",
    not_found: "코드 미발견",
    blocked: "플랫폼 차단",
    failed: "확인 실패",
  };

  return labels[status];
}

function toneClasses(tone: QueueTone) {
  if (tone === "critical") {
    return "border border-rose-200 bg-rose-50 text-rose-700";
  }
  if (tone === "warning") {
    return "border border-amber-200 bg-amber-50 text-amber-700";
  }
  if (tone === "good") {
    return "border border-neutral-200 bg-white text-neutral-700";
  }
  return "border border-neutral-200 bg-neutral-50 text-neutral-600";
}

function parseDate(value?: string) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function formatRelative(value: string) {
  const time = parseDate(value);
  if (!Number.isFinite(time)) return "확인 불가";

  const diff = Date.now() - time;
  if (diff < 60 * 1000) return "방금 전";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}분 전`;
  if (diff < DAY_MS) return `${Math.floor(diff / (60 * 60 * 1000))}시간 전`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}일 전`;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(time));
}
