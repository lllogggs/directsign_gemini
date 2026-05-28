import { type FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { apiFetch } from "../../domain/api";
import { PRODUCT_NAME } from "../../domain/brand";
import { LEGAL_CONTACT_EMAIL } from "../../domain/legalEntity";

type SupportCategory =
  | "service_error"
  | "account_access"
  | "contract_flow"
  | "settlement_question"
  | "privacy_request"
  | "other";
type SupportRole = "advertiser" | "influencer" | "other";

const categoryOptions: Array<{ value: SupportCategory; label: string }> = [
  { value: "service_error", label: "장애/오류" },
  { value: "account_access", label: "계정" },
  { value: "contract_flow", label: "계약 흐름" },
  { value: "settlement_question", label: "정산 문의" },
  { value: "privacy_request", label: "개인정보" },
  { value: "other", label: "기타" },
];

const roleOptions: Array<{ value: SupportRole; label: string }> = [
  { value: "advertiser", label: "광고주" },
  { value: "influencer", label: "인플루언서" },
  { value: "other", label: "기타" },
];

const readCategoryParam = (value: string | null): SupportCategory =>
  categoryOptions.some((option) => option.value === value)
    ? (value as SupportCategory)
    : "service_error";

const readRoleParam = (value: string | null): SupportRole =>
  roleOptions.some((option) => option.value === value)
    ? (value as SupportRole)
    : "advertiser";

export function SupportPage() {
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get("contract_id")?.trim() || "";
  const contractTitle = searchParams.get("contract_title")?.trim() || "";
  const [category, setCategory] = useState<SupportCategory>(() =>
    readCategoryParam(searchParams.get("category")),
  );
  const [role, setRole] = useState<SupportRole>(() =>
    readRoleParam(searchParams.get("role")),
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");

  const contextUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }, []);
  const pagePath = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.pathname;
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setTicketId("");
    setIsSubmitting(true);

    try {
      const response = await apiFetch("/api/support/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          category,
          requester_role: role,
          requester_name: name,
          requester_email: email,
          subject,
          message,
          context_url: contextUrl,
          page_path: pagePath,
          contract_id: contractId,
          contract_title: contractTitle,
          browser_context:
            typeof window === "undefined"
              ? undefined
              : {
                  viewport: `${window.innerWidth}x${window.innerHeight}`,
                  devicePixelRatio: window.devicePixelRatio,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  language: navigator.language,
                },
          severity: category === "service_error" ? "high" : "normal",
        }),
      });
      const data = (await response.json()) as {
        ticket?: { id?: string };
        error?: string;
      };

      if (!response.ok || !data.ticket?.id) {
        throw new Error(data.error ?? "문의 접수에 실패했습니다.");
      }

      setTicketId(data.ticket.id);
      setSubject("");
      setMessage("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "문의 접수에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f7f4] px-5 py-4 font-sans text-neutral-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[980px] flex-col">
        <header className="flex h-12 items-center justify-between">
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-3 rounded-[10px] px-1 text-[15px] font-extrabold text-neutral-950 transition hover:bg-neutral-100"
          >
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-neutral-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            {PRODUCT_NAME}
          </Link>
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-[10px] border border-neutral-200 bg-white px-3 text-[13px] font-extrabold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
          >
            로그인
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-5 py-8 lg:grid-cols-[0.78fr_1fr]">
          <div>
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-neutral-200 bg-white px-3 text-[13px] font-bold text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
            >
              <ArrowLeft className="h-4 w-4" />
              처음으로
            </Link>
            <h1 className="mt-7 text-[38px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[48px]">
              문의 접수
            </h1>
            <p className="mt-5 max-w-[420px] text-[15px] font-semibold leading-7 text-neutral-600">
              장애, 계약 흐름, 계정, 개인정보 문의를 운영자가 확인합니다.
            </p>
            <div className="mt-7 space-y-3 text-[13px] font-semibold leading-6 text-neutral-500">
              <p>
                정산, 지급대행, 에스크로, 세금 처리는 연락미가 직접 처리하지
                않습니다.
              </p>
              <p>이메일 문의: {LEGAL_CONTACT_EMAIL}</p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            data-clarity-mask
            className="rounded-[14px] border border-neutral-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:p-6"
          >
            {contractId && (
              <div className="mb-4 rounded-[10px] border border-neutral-200 bg-[#fbfbfc] px-3 py-3 text-[13px]">
                <p className="font-extrabold text-neutral-950">
                  {contractTitle || "계약 문의"}
                </p>
                <p className="mt-1 truncate font-semibold text-neutral-400">
                  {contractId}
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-[13px] font-bold text-neutral-700">
                유형
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as SupportCategory)}
                  className="h-11 rounded-[10px] border border-neutral-200 bg-white px-3 text-[14px] font-semibold text-neutral-950 outline-none transition focus:border-neutral-950"
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-[13px] font-bold text-neutral-700">
                역할
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as SupportRole)}
                  className="h-11 rounded-[10px] border border-neutral-200 bg-white px-3 text-[14px] font-semibold text-neutral-950 outline-none transition focus:border-neutral-950"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-[13px] font-bold text-neutral-700">
                이름
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 rounded-[10px] border border-neutral-200 bg-white px-3 text-[14px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
                  placeholder="활동명 또는 담당자명"
                />
              </label>
              <label className="grid gap-2 text-[13px] font-bold text-neutral-700">
                이메일
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  className="h-11 rounded-[10px] border border-neutral-200 bg-white px-3 text-[14px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
                  placeholder="reply@example.com"
                />
              </label>
            </div>

            <label className="mt-4 grid gap-2 text-[13px] font-bold text-neutral-700">
              제목
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
                minLength={2}
                maxLength={120}
                className="h-11 rounded-[10px] border border-neutral-200 bg-white px-3 text-[14px] font-semibold text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
                placeholder="무엇이 필요한가요?"
              />
            </label>

            <label className="mt-4 grid gap-2 text-[13px] font-bold text-neutral-700">
              내용
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={7}
                className="resize-none rounded-[10px] border border-neutral-200 bg-white px-3 py-3 text-[14px] font-semibold leading-6 text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
                placeholder="오류가 난 화면, 계정 이메일, 원하는 처리를 적어주세요."
              />
            </label>

            {error && (
              <p className="mt-4 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">
                {error}
              </p>
            )}
            {ticketId && (
              <p className="mt-4 flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                문의가 접수되었습니다. 접수번호 {ticketId.slice(0, 8)}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 h-12 w-full rounded-[11px] bg-blue-600 text-[15px] font-extrabold text-white transition hover:bg-blue-700 disabled:bg-neutral-300"
            >
              {isSubmitting ? "접수 중" : "문의 접수"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
