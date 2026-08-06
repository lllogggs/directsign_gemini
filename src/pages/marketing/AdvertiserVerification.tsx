import React, { useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { LogoMark } from "../../components/BrandLogo";
import { AdvertiserAccountSettingsMenu } from "../../components/AdvertiserAccountSettingsMenu";
import { DashboardSurfaceSwitch } from "../../components/DashboardSurfaceSwitch";
import { HeaderMessageCenterButton } from "../../components/HeaderMessageCenterButton";
import { HeaderNotificationCenterButton } from "../../components/HeaderNotificationCenterButton";
import { MobileSurfaceSwitch } from "../../components/MobileSurfaceSwitch";
import {
  type VerificationAccountInfo,
  type VerificationRequest,
  getVerificationRejectionGuidance,
} from "../../domain/verification";
import { apiFetch } from "../../domain/api";
import {
  clearVerificationSummaryCache,
  useVerificationSummary,
} from "../../hooks/useVerificationSummary";
import { PRODUCT_NAME } from "../../domain/brand";
import { translateApiErrorMessage } from "../../domain/userMessages";
import { clearAdvertiserSessionCache } from "../../domain/advertiserSessionCache";
import { clearAdvertiserDashboardBootstrapPreload } from "../../domain/advertiserDashboardPreload";
import { finishFastLoginTransition } from "../../domain/fastLoginTransition";
import {
  clearMarketplaceMessageSummaryCache,
  useMarketplaceMessageSummary,
} from "../../hooks/useMarketplaceMessageSummary";
import { clearNotificationCenterCache } from "../../hooks/useNotificationCenter";

const MAX_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_VERIFICATION_FILE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const getCurrentKstDate = () => {
  const parts = Object.fromEntries(
    KST_DATE_FORMATTER.formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

type VerificationSubmissionMode = "automatic" | "document";
type VerificationFallbackReason =
  | "not_matched"
  | "service_unavailable"
  | "inactive";

interface AdvertiserVerificationForm {
  business_registration_number: string;
  representative_name: string;
  business_start_date: string;
  document_issue_date: string;
  document_check_number: string;
}

interface AdvertiserVerificationResponse {
  error?: string;
  outcome?: "approved" | "evidence_required" | "pending_manual_review";
  reason?: VerificationFallbackReason;
  message?: string;
  retryable?: boolean;
  request?: VerificationRequest;
}

interface ManualFallback {
  reason: VerificationFallbackReason;
  message: string;
  retryable: boolean;
}

const initialForm: AdvertiserVerificationForm = {
  business_registration_number: "",
  representative_name: "",
  business_start_date: "",
  document_issue_date: "",
  document_check_number: "",
};

const inferVerificationFileType = (file: File) => {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "";
};

const validateVerificationFile = (file: File | null) => {
  if (!file) return undefined;
  if (file.size > MAX_VERIFICATION_FILE_SIZE) {
    return `인증 파일은 ${MAX_VERIFICATION_FILE_SIZE / 1024 / 1024}MB 이하로 업로드해주세요.`;
  }
  if (!ACCEPTED_VERIFICATION_FILE_TYPES.has(inferVerificationFileType(file))) {
    return "PDF, PNG, JPG, WebP 파일만 업로드할 수 있습니다.";
  }
  return undefined;
};

const formatBusinessRegistrationInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

const withVerificationDefaults = (
  form: AdvertiserVerificationForm,
  latest?: VerificationRequest,
  account?: VerificationAccountInfo,
): AdvertiserVerificationForm => ({
  ...form,
  business_registration_number:
    form.business_registration_number ||
    latest?.business_registration_number ||
    account?.business_registration_number ||
    "",
  representative_name:
    form.representative_name ||
    latest?.representative_name ||
    account?.representative_name ||
    "",
  document_issue_date:
    form.document_issue_date || latest?.document_issue_date || "",
  document_check_number:
    form.document_check_number || latest?.document_check_number || "",
});

const fallbackFromRejectedRequest = (): ManualFallback => ({
  reason: "not_matched",
  message: "반려 사유를 확인하고 새 사업자등록증명원을 제출해 주세요.",
  retryable: false,
});

export function AdvertiserVerification() {
  const navigate = useNavigate();
  const {
    summary,
    isLoading,
    error: summaryError,
    refresh,
  } = useVerificationSummary({ role: "advertiser" });
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hasEditedForm, setHasEditedForm] = useState(false);
  const [manualFallback, setManualFallback] =
    useState<ManualFallback | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { summary: messageSummary, isLoading: isMessageSummaryLoading } =
    useMarketplaceMessageSummary("advertiser");
  const manualReviewRef = useRef<HTMLElement>(null);

  const advertiser = summary?.advertiser;
  const status = advertiser?.status ?? "not_submitted";
  const latest = advertiser?.latest_request;
  const account = advertiser?.account;
  const approved = status === "approved";
  const pending = status === "pending";
  const rejected = status === "rejected";
  const rejectionGuidance = rejected
    ? getVerificationRejectionGuidance(latest, "advertiser_organization")
    : undefined;
  const visibleForm = hasEditedForm
    ? form
    : withVerificationDefaults(form, latest, account);
  const activeFallback = rejected
    ? manualFallback ?? fallbackFromRejectedRequest()
    : manualFallback;
  const showVerificationForm = (!approved && !pending) || showUpdateForm;
  const showApprovedOverview = approved && !showUpdateForm;
  const displayBusinessNumber = formatBusinessRegistrationInput(
    latest?.business_registration_number ||
      account?.business_registration_number ||
      "",
  );
  const displayRepresentative =
    latest?.representative_name || account?.representative_name || "-";

  const handleLogout = async () => {
    try {
      await apiFetch("/api/advertiser/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (logoutError) {
      console.warn(
        `[${PRODUCT_NAME}] advertiser logout request failed`,
        logoutError,
      );
    } finally {
      finishFastLoginTransition("advertiser");
      clearAdvertiserSessionCache();
      clearAdvertiserDashboardBootstrapPreload();
      clearVerificationSummaryCache("advertiser");
      clearMarketplaceMessageSummaryCache("advertiser");
      clearNotificationCenterCache("advertiser");
      navigate("/login/advertiser", { replace: true });
    }
  };

  const updateForm = (
    updates: Partial<AdvertiserVerificationForm>,
    resetFallback = false,
  ) => {
    setForm({ ...visibleForm, ...updates });
    setHasEditedForm(true);
    setError("");
    if (resetFallback && !rejected) {
      setManualFallback(null);
      setFile(null);
    }
  };

  const submitVerification = async (submissionMode: VerificationSubmissionMode) => {
    setError("");

    if (isSubmitting || isLoading) return;
    if (pending) {
      setError("이미 접수된 인증 요청을 검토 중입니다.");
      return;
    }

    if (submissionMode === "document" && !file) {
      setError("사업자등록증명원 PDF 또는 이미지 파일을 첨부해 주세요.");
      return;
    }

    const fileError = validateVerificationFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }

    setIsSubmitting(true);

    try {
      const evidenceFile =
        submissionMode === "document" && file
          ? {
              name: file.name,
              type: inferVerificationFileType(file),
              size: file.size,
              data_url: await readFileAsDataUrl(file),
            }
          : undefined;
      const response = await apiFetch("/api/verification/advertiser", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          submission_mode: submissionMode,
          business_registration_number:
            visibleForm.business_registration_number,
          representative_name: visibleForm.representative_name,
          business_start_date: visibleForm.business_start_date,
          ...(submissionMode === "document"
            ? {
                document_issue_date: visibleForm.document_issue_date,
                document_check_number: visibleForm.document_check_number,
                evidence_file: evidenceFile,
              }
            : {}),
        }),
      });

      const data = (await response.json()) as AdvertiserVerificationResponse;

      if (!response.ok) {
        throw new Error(
          translateApiErrorMessage(data.error, "사업자 정보를 확인하지 못했습니다."),
        );
      }

      if (data.outcome === "evidence_required") {
        const nextFallback: ManualFallback = {
          reason: data.reason ?? "not_matched",
          message:
            data.message ??
            "자동 확인을 완료하지 못했습니다. 서류로 이어서 인증해 주세요.",
          retryable: data.retryable === true,
        };
        setManualFallback(nextFallback);
        window.requestAnimationFrame(() => manualReviewRef.current?.focus());
        return;
      }

      setFile(null);
      setForm(initialForm);
      setHasEditedForm(false);
      setManualFallback(null);
      setShowUpdateForm(false);
      await refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? translateApiErrorMessage(
              submitError.message,
              "사업자 정보를 확인하지 못했습니다.",
            )
          : "사업자 정보를 확인하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitVerification(activeFallback ? "document" : "automatic");
  };

  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
            aria-label={PRODUCT_NAME}
          >
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none">{PRODUCT_NAME}</span>
          </button>
          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            <div className="hidden lg:block">
              <DashboardSurfaceSwitch role="advertiser" />
            </div>
            <HeaderNotificationCenterButton role="advertiser" />
            <HeaderMessageCenterButton
              unreadCount={messageSummary.unreadCount}
              isLoading={isMessageSummaryLoading}
              onClick={() => navigate("/advertiser/messages")}
            />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="로그아웃"
              title="로그아웃"
              className="yl-header-action yl-header-action-secondary hidden sm:inline-flex"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <AdvertiserAccountSettingsMenu
              account={{ email: account?.email }}
              open={accountMenuOpen}
              onToggle={() => setAccountMenuOpen((current) => !current)}
              onClose={() => setAccountMenuOpen(false)}
              onOpenBusinessVerification={() => setAccountMenuOpen(false)}
              onChangePassword={() => {
                setAccountMenuOpen(false);
                navigate("/reset-password?role=advertiser");
              }}
              onLogout={() => {
                setAccountMenuOpen(false);
                void handleLogout();
              }}
            />
          </div>
        </div>
      </header>

      <MobileSurfaceSwitch role="advertiser" />

      <main className="mx-auto w-full max-w-[980px] px-3 py-4 sm:px-5 sm:py-6">
        {isLoading && !summary ? (
          <VerificationLoadingShell />
        ) : summaryError && !summary ? (
          <section className="rounded-[10px] border border-neutral-200 bg-white p-6 shadow-[0_18px_46px_rgba(23,26,23,0.055)]">
            <h1 className="text-xl font-extrabold">인증 상태를 확인하지 못했습니다</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-neutral-600">
              {summaryError}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="yl-primary-action mt-5 h-11 rounded-[8px] px-5 text-sm font-bold transition"
            >
              다시 시도
            </button>
          </section>
        ) : showApprovedOverview ? (
          <ApprovedVerificationOverview
            businessNumber={displayBusinessNumber || "-"}
            representativeName={displayRepresentative}
            onUpdate={() => {
              setShowUpdateForm(true);
              setError("");
            }}
          />
        ) : pending ? (
          <PendingVerificationOverview latest={latest} />
        ) : (
          <section className="overflow-hidden rounded-[10px] border border-neutral-200/90 bg-white shadow-[0_18px_46px_rgba(23,26,23,0.055)]">
            {rejectionGuidance ? (
              <div className="border-b border-rose-200 bg-rose-50 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-extrabold text-rose-950">
                      {rejectionGuidance.title}
                    </h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-rose-800">
                      {rejectionGuidance.reviewerNote}
                    </p>
                    <ul className="mt-3 grid gap-2 text-xs font-semibold leading-5 text-rose-900 sm:grid-cols-2">
                      {rejectionGuidance.checklist.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="border-b border-neutral-200 bg-[#fbfaf7] px-5 py-5 sm:px-6">
              <p className="text-[12px] font-extrabold text-blue-700">
                국세청 즉시 확인
              </p>
              <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-[25px] font-extrabold tracking-tight text-neutral-950">
                    {approved ? "사업자 인증 정보 갱신" : "사업자 정보 확인"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-600">
                    사업자등록번호, 대표자명, 개업일자를 확인합니다. 일치하면 바로 인증되며 확인되지 않을 때만 서류를 요청합니다.
                  </p>
                </div>
                {approved ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowUpdateForm(false);
                      setManualFallback(null);
                      setError("");
                    }}
                    className="h-10 shrink-0 rounded-[10px] border border-neutral-200 bg-white px-4 text-sm font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    취소
                  </button>
                ) : null}
              </div>
            </div>

            {showVerificationForm ? (
              <form
                onSubmit={handleSubmit}
                aria-busy={isSubmitting}
                className="space-y-5 p-5 sm:p-6"
              >
                <section aria-labelledby="automatic-verification-title">
                  <h2
                    id="automatic-verification-title"
                    className="text-sm font-extrabold text-neutral-950"
                  >
                    국세청 등록 정보
                  </h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <TextField
                        label="사업자등록번호"
                        value={visibleForm.business_registration_number}
                        onChange={(value) =>
                          updateForm(
                            {
                              business_registration_number:
                                formatBusinessRegistrationInput(value),
                            },
                            true,
                          )
                        }
                        placeholder="000-00-00000"
                        inputMode="numeric"
                        autoComplete="off"
                        disabled={isSubmitting}
                        required
                      />
                    </div>
                    <TextField
                      label="대표자명"
                      value={visibleForm.representative_name}
                      onChange={(value) =>
                        updateForm({ representative_name: value }, true)
                      }
                      autoComplete="name"
                      disabled={isSubmitting}
                      required
                    />
                    <TextField
                      label="개업일자"
                      type="date"
                      max={getCurrentKstDate()}
                      value={visibleForm.business_start_date}
                      onChange={(value) =>
                        updateForm({ business_start_date: value }, true)
                      }
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </section>

                {activeFallback ? (
                  <section
                    ref={manualReviewRef}
                    tabIndex={-1}
                    aria-labelledby="manual-verification-title"
                    className="rounded-[14px] border border-amber-200 bg-amber-50/70 p-4 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                      <div className="min-w-0 flex-1">
                        <h2
                          id="manual-verification-title"
                          className="text-sm font-extrabold text-amber-950"
                        >
                          서류로 인증하기
                        </h2>
                        <p className="mt-1 text-sm font-semibold leading-6 text-amber-900/80">
                          {activeFallback.message}
                        </p>
                        {activeFallback.retryable ? (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => void submitVerification("automatic")}
                            className="mt-2 text-xs font-extrabold text-blue-700 underline decoration-blue-300 underline-offset-4 disabled:text-neutral-400"
                          >
                            국세청 다시 확인
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 border-t border-amber-200/80 pt-4 sm:grid-cols-2">
                      <TextField
                        label="문서 발급일"
                        type="date"
                        max={getCurrentKstDate()}
                        value={visibleForm.document_issue_date}
                        onChange={(value) =>
                          updateForm({ document_issue_date: value })
                        }
                        disabled={isSubmitting}
                        required
                      />
                      <TextField
                        label="문서확인번호/발급번호"
                        value={visibleForm.document_check_number}
                        onChange={(value) =>
                          updateForm({ document_check_number: value })
                        }
                        placeholder="정부24/홈택스 문서 번호"
                        disabled={isSubmitting}
                      />
                      <label className="block sm:col-span-2">
                        <span className="text-sm font-extrabold text-neutral-900">
                          사업자등록증명원
                        </span>
                        <span className="mt-2 flex min-h-[68px] cursor-pointer items-center gap-3 rounded-[12px] border border-dashed border-neutral-300 bg-white px-4 transition hover:border-neutral-500">
                          <FileUp className="h-4 w-4 shrink-0 text-neutral-500" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-extrabold text-neutral-900">
                              {file ? file.name : "증빙 파일 선택"}
                            </span>
                            <span className="mt-1 block text-xs font-semibold text-neutral-500">
                              PDF, PNG, JPG, WebP · 10MB 이하
                            </span>
                          </span>
                          <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg,image/webp"
                            className="sr-only"
                            disabled={isSubmitting}
                            required
                            onChange={(event) => {
                              const nextFile = event.target.files?.[0] ?? null;
                              const nextError = validateVerificationFile(nextFile);
                              if (nextError) {
                                setFile(null);
                                setError(nextError);
                                event.currentTarget.value = "";
                                return;
                              }
                              setFile(nextFile);
                              setError("");
                            }}
                          />
                        </span>
                      </label>
                    </div>
                  </section>
                ) : null}

                {error ? (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
                  >
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting || isLoading}
                  className="yl-primary-action h-12 w-full rounded-[8px] px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
                >
                  {isSubmitting
                    ? activeFallback
                      ? "서류 제출 중"
                      : "확인 중"
                    : activeFallback
                      ? "서류 심사 요청"
                      : "사업자 인증하기"}
                </button>
              </form>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}

function ApprovedVerificationOverview({
  businessNumber,
  representativeName,
  onUpdate,
}: {
  businessNumber: string;
  representativeName: string;
  onUpdate: () => void;
}) {
  return (
    <section
      data-verification-approved="advertiser"
      className="overflow-hidden rounded-[10px] border border-neutral-200 bg-white shadow-[0_18px_46px_rgba(23,26,23,0.055)]"
    >
      <div className="border-b border-neutral-200 bg-[#fbfaf7] px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-blue-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[22px] font-extrabold tracking-tight text-neutral-950">
                사업자 인증 완료
              </h1>
              <p className="mt-1 text-sm font-semibold leading-6 text-neutral-600">
                국세청 등록 정보가 일치해 계약을 발송할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onUpdate}
            className="h-10 shrink-0 rounded-[10px] border border-neutral-200 bg-white px-4 text-sm font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            인증 정보 갱신
          </button>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="grid gap-3 rounded-[10px] border border-neutral-200 bg-[#fbfbfc] p-4 sm:grid-cols-2">
          <InfoRow label="사업자등록번호" value={businessNumber} />
          <InfoRow label="대표자명" value={representativeName} />
        </div>
      </div>
    </section>
  );
}

function PendingVerificationOverview({
  latest,
}: {
  latest?: VerificationRequest;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-neutral-200 bg-white shadow-[0_18px_46px_rgba(23,26,23,0.055)]">
      <div className="border-b border-neutral-200 bg-[#fbfaf7] px-5 py-6 sm:px-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-neutral-950">
          서류 검토 중
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-neutral-600">
          제출한 사업자등록증명원을 운영자가 확인하고 있습니다.
        </p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        <InfoRow
          label="사업자등록번호"
          value={formatBusinessRegistrationInput(
            latest?.business_registration_number ?? "",
          ) || "-"}
        />
        <InfoRow label="대표자명" value={latest?.representative_name || "-"} />
        <InfoRow
          label="접수일"
          value={
            latest?.created_at
              ? new Intl.DateTimeFormat("ko-KR").format(
                  new Date(latest.created_at),
                )
              : "-"
          }
        />
      </div>
    </section>
  );
}

function VerificationLoadingShell() {
  return (
    <section
      aria-label="사업자 인증 상태 확인 중"
      className="animate-pulse overflow-hidden rounded-[10px] border border-neutral-200 bg-white shadow-[0_18px_46px_rgba(23,26,23,0.055)]"
    >
      <div className="border-b border-neutral-100 bg-[#fbfaf7] p-6">
        <div className="h-3 w-24 rounded bg-neutral-200" />
        <div className="mt-3 h-7 w-52 rounded bg-neutral-200" />
        <div className="mt-3 h-4 w-72 max-w-full rounded bg-neutral-100" />
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="h-16 rounded-[12px] bg-neutral-100 sm:col-span-2" />
        <div className="h-16 rounded-[12px] bg-neutral-100" />
        <div className="h-16 rounded-[12px] bg-neutral-100" />
        <div className="h-12 rounded-[10px] bg-neutral-200 sm:col-span-2" />
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  inputMode,
  autoComplete,
  max,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  max?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-extrabold text-neutral-900">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-[10px] border border-neutral-200 bg-[#fbfbfc] px-3 text-sm font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.10)] disabled:cursor-wait disabled:bg-neutral-100 disabled:text-neutral-500"
      />
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-neutral-200 bg-white px-3 py-3">
      <p className="text-xs font-semibold text-neutral-400">{label}</p>
      <p className="mt-1 break-words text-sm font-extrabold text-neutral-800 [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}
