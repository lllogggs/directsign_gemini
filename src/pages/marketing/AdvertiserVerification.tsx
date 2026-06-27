import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  FileUp,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { LogoMark } from "../../components/BrandLogo";
import {
  type VerificationAccountInfo,
  type VerificationRequest,
  getVerificationRejectionGuidance,
  verificationStatusLabel,
  verificationStatusTone,
} from "../../domain/verification";
import { apiFetch } from "../../domain/api";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { PRODUCT_NAME } from "../../domain/brand";
import { removeInternalTestLabel } from "../../domain/display";
import { translateApiErrorMessage } from "../../domain/userMessages";

const MAX_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_VERIFICATION_FILE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

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

interface AdvertiserVerificationForm {
  subject_name: string;
  business_registration_number: string;
  representative_name: string;
  submitted_by_name: string;
  submitted_by_email: string;
  manager_phone: string;
  business_start_date: string;
  document_issue_date: string;
  document_check_number: string;
  note: string;
}

const initialForm: AdvertiserVerificationForm = {
  subject_name: "",
  business_registration_number: "",
  representative_name: "",
  submitted_by_name: "",
  submitted_by_email: "",
  manager_phone: "",
  business_start_date: "",
  document_issue_date: "",
  document_check_number: "",
  note: "",
};

const withVerificationDefaults = (
  form: AdvertiserVerificationForm,
  latest?: VerificationRequest,
  account?: VerificationAccountInfo,
): AdvertiserVerificationForm => ({
  ...form,
  subject_name:
    form.subject_name || latest?.subject_name || account?.company_name || "",
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
  submitted_by_name:
    form.submitted_by_name || latest?.submitted_by_name || account?.name || "",
  submitted_by_email:
    form.submitted_by_email || latest?.submitted_by_email || account?.email || "",
  manager_phone: form.manager_phone || latest?.manager_phone || "",
  business_start_date: form.business_start_date || "",
  document_issue_date:
    form.document_issue_date || latest?.document_issue_date || "",
  document_check_number:
    form.document_check_number || latest?.document_check_number || "",
});

export function AdvertiserVerification() {
  const navigate = useNavigate();
  const { summary, isLoading, refresh } = useVerificationSummary({ role: "advertiser" });
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [hasEditedForm, setHasEditedForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);

  const advertiser = summary?.advertiser;
  const status = advertiser?.status ?? "not_submitted";
  const latest = advertiser?.latest_request;
  const account = advertiser?.account;
  const approved = status === "approved";
  const rejectionGuidance =
    status === "rejected"
      ? getVerificationRejectionGuidance(latest, "advertiser_organization")
      : undefined;
  const displayCompany = removeInternalTestLabel(
    latest?.subject_name || account?.company_name,
    "브랜드",
  );
  const displayManager = removeInternalTestLabel(
    latest?.submitted_by_name || account?.name,
    "광고주",
  );
  const displayEmail = latest?.submitted_by_email || account?.email || "-";
  const displayBusinessNumber =
    latest?.business_registration_number ||
    account?.business_registration_number ||
    "-";
  const visibleForm =
    hasEditedForm || submitted ? form : withVerificationDefaults(form, latest, account);
  const showVerificationForm = !approved || showUpdateForm;
  const showApprovedOverview =
    approved && !showVerificationForm && !rejectionGuidance;

  const handleLogout = async () => {
    await apiFetch("/api/advertiser/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    navigate("/login/advertiser", { replace: true });
  };

  const updateForm = (updates: Partial<AdvertiserVerificationForm>) => {
    setForm({ ...visibleForm, ...updates });
    setHasEditedForm(true);
    setError("");
    setSubmitted(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!file) {
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
      const file_data_url = await readFileAsDataUrl(file);
      const response = await apiFetch("/api/verification/advertiser", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...visibleForm,
          evidence_file: {
            name: file.name,
            type: inferVerificationFileType(file),
            size: file.size,
            data_url: file_data_url,
          },
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(
          translateApiErrorMessage(data.error, "인증 요청을 접수하지 못했습니다."),
        );
      }

      setSubmitted(true);
      setFile(null);
      setForm(initialForm);
      setHasEditedForm(false);
      await refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? translateApiErrorMessage(
              submitError.message,
              "인증 요청을 접수하지 못했습니다.",
            )
          : "인증 요청을 접수하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="yl-brand-action group flex min-w-0 items-center gap-3 rounded-lg text-neutral-950 transition hover:text-neutral-700"
              aria-label={PRODUCT_NAME}
            >
              <LogoMark />
              <span className="truncate text-lg font-extrabold">{PRODUCT_NAME}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="yl-header-action yl-header-action-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">대시보드</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/reset-password?role=advertiser")}
              className="yl-header-icon-action"
              aria-label="설정"
              title="설정"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto grid h-[calc(100vh-56px)] gap-3 overflow-hidden px-5 py-4 sm:px-8 ${
          showApprovedOverview
            ? "max-w-4xl lg:grid-cols-1"
            : "max-w-5xl lg:grid-cols-[minmax(0,1fr)_260px]"
        }`}
      >
        <section
          className={`overflow-y-auto rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)] sm:p-5 ${
            showApprovedOverview
              ? "min-h-[420px]"
              : "min-h-0"
          }`}
        >
          {approved && !showVerificationForm && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-950">
                    사업자 인증이 완료되었습니다
                  </p>
                  <p className="mt-1 text-sm leading-6 text-emerald-800/80">
                    {displayCompany} 계정은 계약 공유 링크를 발송할 수 있습니다.
                  </p>
                </div>
                </div>
                  <button
                    type="button"
                    onClick={() => setShowUpdateForm(true)}
                  className="h-10 shrink-0 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:border-emerald-300"
                  >
                    인증 정보 갱신 요청
                  </button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <InfoRow label="회사" value={displayCompany} compact />
                <InfoRow label="담당" value={displayManager} compact />
                <InfoRow label="이메일" value={displayEmail} compact />
                <InfoRow label="사업자" value={displayBusinessNumber} compact />
              </div>
              {latest ? (
                <div className="mt-3 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-emerald-900">
                  제출일 {new Intl.DateTimeFormat("ko-KR").format(new Date(latest.created_at))}
                  {latest.reviewer_note ? ` · 검토 메모 ${latest.reviewer_note}` : ""}
                </div>
              ) : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate("/advertiser/builder")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  <FileText className="h-4 w-4" />
                  1:1 계약 작성
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/advertiser/campaigns/new")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <Megaphone className="h-4 w-4" />
                  캠페인 작성
                </button>
              </div>
            </div>
          )}

          {rejectionGuidance && (
            <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-[inset_3px_0_0_rgba(190,18,60,0.22)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-rose-700 ring-1 ring-rose-100">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-900">
                    {rejectionGuidance.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-rose-800/80">
                    {rejectionGuidance.body}
                  </p>
                  <div className="mt-3 rounded-md border border-rose-100 bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-rose-900">
                    반려 사유: {rejectionGuidance.reviewerNote}
                  </div>
                  <ul className="mt-3 grid gap-2 text-xs leading-5 text-rose-900 sm:grid-cols-2">
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
          )}

          {showVerificationForm && (
            <div className="mb-4 border-b border-neutral-100 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
              <h1 className="text-[24px] font-semibold tracking-tight">
                {approved ? "사업자 인증 정보 갱신" : "사업자 인증"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                {approved
                  ? "상호, 담당자, 사업자 정보가 바뀐 경우에만 새 증빙으로 갱신합니다."
                  : "계약 발송 전 사업자번호와 증빙을 확인합니다. 운영자 법적 고지 정보와는 별개입니다."}
              </p>
                </div>
                <span
                  className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${verificationStatusTone(
                    status,
                  )}`}
                >
                  {isLoading ? "정보 확인 중" : verificationStatusLabel(status)}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-xs font-semibold leading-5 text-neutral-600 sm:grid-cols-3">
                <div className="rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-2">
                  <span className="block text-neutral-950">필수</span>
                  사업자번호, 대표자명, 증빙 파일
                </div>
                <div className="rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-2">
                  <span className="block text-neutral-950">검토</span>
                  보통 1영업일 내 확인
                </div>
                <div className="rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 py-2">
                  <span className="block text-neutral-950">제한</span>
                  승인 전 계약 공유 차단
                </div>
              </div>
            </div>
          )}

          {showVerificationForm && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <section className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      사업자 정보
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-neutral-500">
                      국세청 조회와 증빙 대조에 쓰는 필수 정보입니다.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <TextField
                    label="회사/브랜드명"
                    value={visibleForm.subject_name}
                    onChange={(value) => updateForm({ subject_name: value })}
                    required
                  />
                  <TextField
                    label="사업자등록번호"
                    value={visibleForm.business_registration_number}
                    onChange={(value) =>
                      updateForm({ business_registration_number: value })
                    }
                    placeholder="000-00-00000"
                    required
                  />
                  <TextField
                    label="대표자명"
                    value={visibleForm.representative_name}
                    onChange={(value) => updateForm({ representative_name: value })}
                    required
                  />
                  <TextField
                    label="개업일자"
                    type="text"
                    placeholder="예: 20260517"
                    value={visibleForm.business_start_date}
                    onChange={(value) => updateForm({ business_start_date: value })}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-neutral-950">
                    담당자와 증빙
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-neutral-500">
                    사업자 증빙과 대표 서명 또는 인감 날인 자료는 심사와 감사 기록 용도로만 사용합니다.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <TextField
                    label="담당자명"
                    value={visibleForm.submitted_by_name}
                    onChange={(value) => updateForm({ submitted_by_name: value })}
                    required
                  />
                  <TextField
                    label="담당자 이메일"
                    type="email"
                    value={visibleForm.submitted_by_email}
                    onChange={(value) => updateForm({ submitted_by_email: value })}
                    required
                  />
                  <TextField
                    label="담당자 연락처"
                    value={visibleForm.manager_phone}
                    onChange={(value) => updateForm({ manager_phone: value })}
                  />
                  <TextField
                    label="문서 발급일"
                    type="text"
                    placeholder="예: 20260517"
                    value={visibleForm.document_issue_date}
                    onChange={(value) =>
                      updateForm({ document_issue_date: value })
                    }
                    required
                  />
                  <TextField
                    label="문서확인번호/발급번호"
                    value={visibleForm.document_check_number}
                    onChange={(value) =>
                      updateForm({ document_check_number: value })
                    }
                    placeholder="정부24/홈택스 문서 번호"
                  />
                  <label className="block">
                    <span className="text-sm font-semibold text-neutral-900">
                      사업자/서명 증빙 파일
                    </span>
                    <span className="mt-2 flex h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-[#fbfbfc] px-3 transition hover:border-neutral-500 hover:bg-white">
                      <FileUp className="h-4 w-4 shrink-0 text-neutral-500" />
                      <span className="min-w-0 truncate text-sm font-semibold text-neutral-900">
                        {file ? file.name : "증빙 파일 업로드"}
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          const nextFile = event.target.files?.[0] ?? null;
                          const fileError = validateVerificationFile(nextFile);
                          if (fileError) {
                            setFile(null);
                            setError(fileError);
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

              <div>
                <label className="text-sm font-semibold text-neutral-900">
                  선택 메모
                </label>
                <textarea
                  value={visibleForm.note}
                  onChange={(event) => updateForm({ note: event.target.value })}
                  className="mt-2 min-h-16 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] p-3 text-sm outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.05)]"
                  placeholder="상호가 브랜드명과 다르거나 대행사가 대신 계약하는 경우 적어주세요."
                />
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
                >
                  {error}
                </div>
              )}
              {submitted && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-800"
                >
                  인증 요청이 접수되었습니다. 승인 전까지 계약 발송은 제한됩니다.
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 w-full rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
              >
                {isSubmitting
                  ? "접수 중"
                  : approved
                    ? "인증 정보 갱신 요청"
                    : status === "rejected"
                      ? "새 증빙으로 재제출"
                      : "수기 심사 요청"}
              </button>
            </form>
          )}
        </section>

        {!showApprovedOverview ? (
        <aside className="min-h-0 space-y-3 overflow-y-auto">
          <section className="rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-950">
                    {approved ? "인증 정보" : "제출 전 확인"}
                  </p>
                </div>
              </div>
              {!approved && (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${verificationStatusTone(
                    status,
                  )}`}
                >
                  {isLoading ? "정보 확인 중" : verificationStatusLabel(status)}
                </span>
              )}
            </div>

            {(latest || account) ? (
              <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4 text-sm">
                <InfoRow label="회사" value={displayCompany} />
                <InfoRow label="담당" value={displayManager} />
                <InfoRow label="이메일" value={displayEmail} />
                <InfoRow label="사업자" value={displayBusinessNumber} />
                {latest && (
                  <InfoRow
                    label="제출일"
                    value={new Intl.DateTimeFormat("ko-KR").format(
                      new Date(latest.created_at),
                    )}
                  />
                )}
                {latest?.reviewer_note && (
                  <InfoRow label="검토 메모" value={latest.reviewer_note} />
                )}
              </div>
            ) : null}
            {!approved && (
              <ul className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-xs leading-5 text-neutral-600">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  사업자번호와 대표자명을 확인합니다.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  파일은 10MB 이하 PDF/이미지만 받습니다.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  보통 1영업일 내 확인합니다.
                </li>
              </ul>
            )}
          </section>
        </aside>
        ) : null}
      </main>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-neutral-900">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] px-3 text-sm outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.05)]"
      />
    </label>
  );
}

function InfoRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "rounded-md border border-neutral-200 bg-white px-3 py-2"
          : undefined
      }
    >
      <p className="text-xs font-semibold text-neutral-400">{label}</p>
      <p className="mt-1 break-words font-medium text-neutral-800 [overflow-wrap:anywhere]">
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
