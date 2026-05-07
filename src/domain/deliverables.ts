export type DeliverableReviewStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "waived";

export interface DeliverableFile {
  id: string;
  file_name?: string | null;
  content_type?: string | null;
  byte_size?: number | null;
  created_at?: string | null;
  download_url: string;
}

export interface DeliverableSubmission {
  id: string;
  contract_id: string;
  requirement_id?: string | null;
  title?: string | null;
  url?: string | null;
  submitted_at?: string | null;
  review_status: DeliverableReviewStatus;
  review_comment?: string | null;
  reviewed_at?: string | null;
  metadata?: Record<string, unknown>;
  files: DeliverableFile[];
}

export interface DeliverableRequirement {
  id: string;
  contract_id: string;
  deliverable_type: string;
  title: string;
  description?: string | null;
  quantity: number;
  due_at?: string | null;
  review_required: boolean;
  evidence_required: boolean;
  order_no: number;
  submissions: DeliverableSubmission[];
}

export interface DeliverablesResponse {
  contract_id: string;
  requirements: DeliverableRequirement[];
  submissions: DeliverableSubmission[];
  summary: {
    total: number;
    submitted: number;
    approved: number;
  };
  error?: string;
}

export const DELIVERABLE_FILE_ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp";

export const MAX_DELIVERABLE_FILE_SIZE_BYTES = 4 * 1024 * 1024;

const isAsciiOnly = (value: string) =>
  value.split("").every((character) => character.charCodeAt(0) <= 0x7f);

const deliverableFileMimeTypes = new Set(
  DELIVERABLE_FILE_ACCEPT.split(",").map((value) => value.trim()),
);

export const reviewStatusLabel = (status: DeliverableReviewStatus) => {
  const labels: Record<DeliverableReviewStatus, string> = {
    draft: "초안",
    submitted: "검수 대기",
    changes_requested: "수정 요청",
    approved: "승인",
    rejected: "반려",
    waived: "면제",
  };

  return labels[status] ?? status;
};

export const reviewStatusTone = (status: DeliverableReviewStatus) => {
  const tones: Record<DeliverableReviewStatus, string> = {
    draft: "border-neutral-200 bg-white text-neutral-600",
    submitted: "border-sky-200 bg-sky-50 text-sky-700",
    changes_requested: "border-amber-200 bg-amber-50 text-amber-800",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
    waived: "border-neutral-200 bg-neutral-100 text-neutral-600",
  };

  return tones[status] ?? tones.draft;
};

export const submittedReviewStatuses = new Set<DeliverableReviewStatus>([
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "waived",
]);

export const isDeliverableRevisionStatus = (status: DeliverableReviewStatus) =>
  status === "changes_requested" || status === "rejected";

export const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
};

export const getSubmissionNote = (submission: DeliverableSubmission) => {
  const note = submission.metadata?.note;
  return typeof note === "string" && note.trim() ? note.trim() : undefined;
};

export const validateDeliverableUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return undefined;
  } catch {
    return "콘텐츠 URL은 https:// 또는 http://로 시작하는 주소여야 합니다.";
  }

  return "콘텐츠 URL은 https:// 또는 http://로 시작하는 주소여야 합니다.";
};

export const validateDeliverableFile = (file?: File) => {
  if (!file) return undefined;
  if (!deliverableFileMimeTypes.has(file.type)) {
    return "증빙 파일은 PDF, PNG, JPG, WebP만 첨부할 수 있습니다.";
  }
  if (file.size <= 0) {
    return "비어 있는 파일은 첨부할 수 없습니다.";
  }
  if (file.size > MAX_DELIVERABLE_FILE_SIZE_BYTES) {
    return "증빙 파일은 4MB 이하로 첨부해 주세요.";
  }
  return undefined;
};

export const getDeliverableErrorMessage = (
  message: string | undefined,
  fallback = "콘텐츠 제출 정보를 처리하지 못했습니다.",
) => {
  if (!message) return fallback;

  const exactMessages: Record<string, string> = {
    "Advertiser session is required": "광고주 로그인이 필요합니다.",
    "Influencer session is required": "인플루언서 로그인이 필요합니다.",
    "Advertiser account is required": "광고주 계정 권한이 필요합니다.",
    "Influencer account is required": "인플루언서 계정 권한이 필요합니다.",
    "Contract not found": "계약서를 찾을 수 없습니다.",
    "Contract access is not allowed": "이 계약의 콘텐츠 정보를 볼 권한이 없습니다.",
    "Deliverable submission requires Supabase":
      "콘텐츠 제출은 운영 DB 연결 후 사용할 수 있습니다.",
    "Deliverable review requires Supabase":
      "콘텐츠 검수는 운영 DB 연결 후 사용할 수 있습니다.",
    "Contract must be signed before deliverables can be submitted":
      "전자서명 완료 후 콘텐츠를 제출할 수 있습니다.",
    "Valid deliverable requirement is required":
      "제출할 콘텐츠 항목을 다시 선택해 주세요.",
    "Content URL or proof file is required":
      "콘텐츠 URL 또는 증빙 파일을 하나 이상 추가해 주세요.",
    "Content URL must be http or https":
      "콘텐츠 URL은 https:// 또는 http:// 주소만 입력할 수 있습니다.",
    "Only PDF, PNG, JPG, or WebP proof files are allowed":
      "증빙 파일은 PDF, PNG, JPG, WebP만 첨부할 수 있습니다.",
    "Proof file must be 4MB or smaller": "증빙 파일은 4MB 이하로 첨부해 주세요.",
    "Proof file is invalid": "증빙 파일 형식을 확인해 주세요.",
    "Proof file content is invalid": "증빙 파일 내용과 형식이 일치하지 않습니다.",
    "File could not be read": "파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.",
    "Valid review status is required": "검수 상태를 다시 선택해 주세요.",
    "Review comment is required when requesting changes or rejecting":
      "수정 요청이나 반려에는 검수 코멘트가 필요합니다.",
    "Deliverable not found": "제출물을 찾을 수 없습니다.",
    "Deliverable file not found": "증빙 파일을 찾을 수 없습니다.",
    "Deliverable file metadata is invalid": "증빙 파일 정보가 올바르지 않습니다.",
    "Deliverable file integrity check failed":
      "증빙 파일 무결성 확인에 실패했습니다. 다시 업로드해 주세요.",
    "Internal server error":
      "서버에서 콘텐츠 증빙을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };

  if (exactMessages[message]) return exactMessages[message];

  const normalized = message.toLowerCase();
  if (normalized.includes("too many")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (normalized.includes("api error") || normalized.includes("failed")) {
    return fallback;
  }
  if (isAsciiOnly(message)) {
    return fallback;
  }

  return message;
};

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("File could not be read"));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read"));
    reader.readAsDataURL(file);
  });
