import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileUp,
  ShieldCheck,
} from "lucide-react";
import {
  verificationStatusLabel,
  verificationStatusTone,
} from "../../domain/verification";
import { useVerificationSummary } from "../../hooks/useVerificationSummary";
import { PRODUCT_NAME } from "../../domain/brand";
import { removeInternalTestLabel } from "../../domain/display";

const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";
const MAX_VERIFICATION_FILE_SIZE = 4 * 1024 * 1024;
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
  if (!ACCEPTED_VERIFICATION_FILE_TYPES.has(inferVerificationFileType(file))) {
    return "PDF, PNG, JPG, WebP 파일만 업로드할 수 있습니다.";
  }
  if (file.size > MAX_VERIFICATION_FILE_SIZE) {
    return "인증 파일은 4MB 이하로 업로드해주세요.";
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
  document_issue_date: "",
  document_check_number: "",
  note: "",
};

export function AdvertiserVerification() {
  const navigate = useNavigate();
  const { summary, isLoading, refresh } = useVerificationSummary({ role: "advertiser" });
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const advertiser = summary?.advertiser;
  const status = advertiser?.status ?? "not_submitted";
  const latest = advertiser?.latest_request;
  const account = advertiser?.account;
  const approved = status === "approved";
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

  const updateForm = (updates: Partial<AdvertiserVerificationForm>) => {
    setForm((current) => ({ ...current, ...updates }));
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
      const response = await fetch(`${API_BASE}/api/verification/advertiser`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...form,
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
        throw new Error(data.error ?? "인증 요청을 접수하지 못했습니다.");
      }

      setSubmitted(true);
      setFile(null);
      setForm(initialForm);
      await refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "인증 요청을 접수하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] font-sans text-neutral-950">
      <header className="border-b border-neutral-200/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between px-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="flex items-center gap-3 text-sm font-semibold text-neutral-700 transition hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-semibold text-neutral-950 sm:inline">
              {PRODUCT_NAME}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-neutral-200 bg-[#fbfbfc] px-3 py-1.5 text-xs font-semibold text-neutral-600">
              <ShieldCheck className="h-4 w-4" />
              수기 심사
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-5 py-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-lg border border-neutral-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_48px_rgba(15,23,42,0.06)] sm:p-6">
          {approved && (
            <div className="mb-5 rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 shadow-[inset_3px_0_0_rgba(23,23,23,0.12)]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-950">
                    사업자 인증이 완료되었습니다
                  </p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">
                    {displayCompany} 계정은 계약 공유 링크를 발송할 수 있습니다.
                    정보가 바뀐 경우에만 아래에서 갱신 심사를 요청하세요.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-5">
            <h1 className="text-[24px] font-semibold tracking-tight">
              {approved ? "사업자 인증 정보" : "광고주 사업자 인증"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              {approved
                ? "현재 승인 상태를 유지합니다. 상호, 담당자, 사업자 정보가 바뀌면 새 증빙으로 갱신 요청을 남겨주세요."
                : "계약 초안 작성은 바로 가능하지만, 인플루언서에게 계약을 발송하려면 운영자 수기 승인이 필요합니다."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="회사/브랜드명"
                value={form.subject_name}
                onChange={(value) => updateForm({ subject_name: value })}
                required
              />
              <TextField
                label="사업자등록번호"
                value={form.business_registration_number}
                onChange={(value) =>
                  updateForm({ business_registration_number: value })
                }
                placeholder="000-00-00000"
                required
              />
              <TextField
                label="대표자명"
                value={form.representative_name}
                onChange={(value) => updateForm({ representative_name: value })}
                required
              />
              <TextField
                label="담당자명"
                value={form.submitted_by_name}
                onChange={(value) => updateForm({ submitted_by_name: value })}
                required
              />
              <TextField
                label="담당자 이메일"
                type="email"
                value={form.submitted_by_email}
                onChange={(value) => updateForm({ submitted_by_email: value })}
                required
              />
              <TextField
                label="담당자 연락처"
                value={form.manager_phone}
                onChange={(value) => updateForm({ manager_phone: value })}
              />
              <TextField
                label="문서 발급일"
                type="date"
                value={form.document_issue_date}
                onChange={(value) => updateForm({ document_issue_date: value })}
                required
              />
              <TextField
                label="문서확인번호/발급번호"
                value={form.document_check_number}
                onChange={(value) =>
                  updateForm({ document_check_number: value })
                }
                placeholder="정부24/홈택스 문서 번호"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-neutral-900">
                사업자등록증명원 파일
              </label>
              <label className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-[#fbfbfc] px-4 py-5 text-center transition hover:border-neutral-500 hover:bg-white hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <FileUp className="mb-3 h-6 w-6 text-neutral-500" />
                <span className="text-sm font-semibold text-neutral-900">
                  {file ? file.name : "PDF 또는 이미지 업로드"}
                </span>
                <span className="mt-1 text-xs text-neutral-500">
                  최근 1~3개월 이내 발급본을 권장합니다.
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
              </label>
            </div>

            <div>
              <label className="text-sm font-semibold text-neutral-900">
                운영자에게 남길 메모
              </label>
              <textarea
                value={form.note}
                onChange={(event) => updateForm({ note: event.target.value })}
                className="mt-2 min-h-20 w-full rounded-lg border border-neutral-200 bg-[#fbfbfc] p-4 text-sm outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-950 focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.05)]"
                placeholder="상호가 브랜드명과 다르거나 대행사가 대신 계약하는 경우 적어주세요."
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}
            {submitted && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-800">
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
                  : "수기 심사 요청"}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-950">
                    광고주 인증 상태
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${verificationStatusTone(
                  status,
                )}`}
              >
                {isLoading ? "확인중" : verificationStatusLabel(status)}
              </span>
            </div>

            {(latest || account) && (
              <div className="mt-5 space-y-3 border-t border-neutral-100 pt-5 text-sm">
                <InfoRow label="회사명" value={displayCompany} />
                <InfoRow label="담당자" value={displayManager} />
                <InfoRow label="이메일" value={displayEmail} />
                <InfoRow label="사업자번호" value={displayBusinessNumber} />
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
            )}
          </section>

          <section className="rounded-lg border border-neutral-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_34px_rgba(15,23,42,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-950">
              <CheckCircle2 className="h-4 w-4" />
              승인 기준
            </div>
            <ul className="space-y-2 text-sm leading-6 text-neutral-600">
              <li>사업자등록번호 형식과 체크섬이 유효해야 합니다.</li>
              <li>사업자등록증명원 발급일과 문서번호를 확인합니다.</li>
              <li>회사명, 대표자명, 가입 정보가 합리적으로 일치해야 합니다.</li>
              <li>
                {approved
                  ? "승인 후에도 정보 변경 시 새 증빙으로 갱신 심사를 남깁니다."
                  : "승인 전에는 공유 링크 발송이 서버에서 차단됩니다."}
              </li>
            </ul>
          </section>
        </aside>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-neutral-400">{label}</p>
      <p className="mt-1 break-words font-medium text-neutral-800">{value}</p>
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
