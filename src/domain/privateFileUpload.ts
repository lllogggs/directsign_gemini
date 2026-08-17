import { Upload } from "tus-js-client";
import { apiFetch } from "./api.js";

export const PRIVATE_FILE_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
export const MAX_PRIVATE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const PRIVATE_FILE_STORAGE_BUCKET = "directsign-private";

export type PrivateFileUploadArea =
  | "verification-advertiser"
  | "verification-influencer"
  | "deliverables";

export type PrivateFileDescriptor = {
  type: string;
  size: number;
  sha256: string;
};

export type PrivateFileUploadTicket = {
  ticket_id: string;
  upload_url: string;
  upload_signature: string;
  bucket: string;
  object_path: string;
  initiation_expires_at: string;
  finalize_expires_at: string;
};

export type PendingPrivateFileTransfer = {
  selectionKey: string;
  descriptor: PrivateFileDescriptor;
  ticket: PrivateFileUploadTicket;
  uploadState: "pending" | "uploaded" | "uncertain";
  tusUploadUrl?: string;
};

export type PrivateFileUploadIdentity = {
  selectionKey: string;
  uploadId: string;
};

export type PrivateFileUploadProgress = {
  phase: "hashing" | "ticketing" | "uploading";
  percent?: number;
};

export class PrivateFileTransferError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "PrivateFileTransferError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;
const safeBucketPattern = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const safeObjectSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;

export const getOrCreatePrivateFileUploadIdentity = (
  current: PrivateFileUploadIdentity | undefined,
  selectionKey: string,
  createUuid = () => globalThis.crypto.randomUUID(),
): PrivateFileUploadIdentity => {
  if (current?.selectionKey === selectionKey && uuidPattern.test(current.uploadId)) {
    return current;
  }
  const uploadId = createUuid();
  if (!uuidPattern.test(uploadId)) {
    throw new PrivateFileTransferError("파일 업로드 식별자를 만들지 못했습니다.");
  }
  return { selectionKey, uploadId };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readSafeServerError = (value: unknown, fallback: string) => {
  if (!isRecord(value) || typeof value.error !== "string") return fallback;
  const message = value.error.trim();
  if (
    !message ||
    message.length > 300 ||
    /https?:\/\/|token|signature|authorization/i.test(message)
  ) {
    return fallback;
  }
  return message;
};

const readSafeServerCode = (value: unknown) =>
  isRecord(value) &&
  typeof value.code === "string" &&
  /^[A-Z][A-Z0-9_]{1,63}$/.test(value.code)
    ? value.code
    : undefined;

const isLocalUploadEndpoint = (url: URL) => {
  if (typeof window === "undefined") return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const pageHost = window.location.hostname.toLowerCase();
  const uploadHost = url.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  return localHosts.has(pageHost) && localHosts.has(uploadHost);
};

const assertUploadEndpoint = (value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PrivateFileTransferError("파일 업로드 주소가 올바르지 않습니다.");
  }

  const isSupabaseEndpoint =
    url.protocol === "https:" && url.hostname.toLowerCase().endsWith(".supabase.co");
  if (
    (!isSupabaseEndpoint && !isLocalUploadEndpoint(url)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/storage\/v1\/upload\/resumable\/?$/.test(url.pathname)
  ) {
    throw new PrivateFileTransferError("파일 업로드 주소가 허용되지 않았습니다.");
  }

  return url.toString();
};

const assertTusResumeUrl = (value: string, endpoint: string) => {
  let url: URL;
  const endpointUrl = new URL(endpoint);
  try {
    url = new URL(value);
  } catch {
    throw new PrivateFileTransferError("파일 업로드 재개 주소가 올바르지 않습니다.");
  }
  const endpointPath = endpointUrl.pathname.replace(/\/$/, "");
  if (
    url.origin !== endpointUrl.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(`${endpointPath}/`) ||
    url.pathname.length <= endpointPath.length + 1
  ) {
    throw new PrivateFileTransferError("파일 업로드 재개 주소가 허용되지 않았습니다.");
  }
  return url.toString();
};

const assertObjectPath = (value: string, expectedArea: PrivateFileUploadArea) => {
  if (
    value.length > 1024 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("//")
  ) {
    throw new PrivateFileTransferError("파일 저장 경로가 올바르지 않습니다.");
  }
  const segments = value.split("/");
  if (
    segments[0] !== expectedArea ||
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !safeObjectSegmentPattern.test(segment),
    )
  ) {
    throw new PrivateFileTransferError("파일 저장 경로가 허용되지 않았습니다.");
  }
  const uuidSegment =
    "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const canonicalPathPattern = new RegExp(
    `^${expectedArea}/${uuidSegment}/${uuidSegment}-evidence\\.(pdf|png|jpg|webp)$`,
    "i",
  );
  if (!canonicalPathPattern.test(value)) {
    throw new PrivateFileTransferError("파일 저장 경로가 허용되지 않았습니다.");
  }
  return value;
};

const assertFutureTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now() - 30_000) {
    throw new PrivateFileTransferError("파일 업로드 요청이 만료되었습니다.", {
      code: "UPLOAD_TICKET_EXPIRED",
    });
  }
  return new Date(timestamp).toISOString();
};

export const parsePrivateFileUploadTicket = (
  value: unknown,
  expectedArea: PrivateFileUploadArea,
): PrivateFileUploadTicket => {
  if (!isRecord(value)) {
    throw new PrivateFileTransferError("파일 업로드 요청을 확인하지 못했습니다.");
  }

  const ticketId = typeof value.ticket_id === "string" ? value.ticket_id : "";
  const signature =
    typeof value.upload_signature === "string" ? value.upload_signature : "";
  const bucket = typeof value.bucket === "string" ? value.bucket : "";
  const objectPath =
    typeof value.object_path === "string" ? value.object_path : "";

  if (!uuidPattern.test(ticketId)) {
    throw new PrivateFileTransferError("파일 업로드 요청 식별자가 올바르지 않습니다.");
  }
  if (
    !signature ||
    signature.length > 8_192 ||
    Array.from(signature).some((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint <= 0x20 || codePoint === 0x7f;
    })
  ) {
    throw new PrivateFileTransferError("파일 업로드 권한을 확인하지 못했습니다.");
  }
  if (
    !safeBucketPattern.test(bucket) ||
    bucket !== PRIVATE_FILE_STORAGE_BUCKET
  ) {
    throw new PrivateFileTransferError("파일 저장소가 올바르지 않습니다.");
  }

  return {
    ticket_id: ticketId,
    upload_url: assertUploadEndpoint(
      typeof value.upload_url === "string" ? value.upload_url : "",
    ),
    upload_signature: signature,
    bucket,
    object_path: assertObjectPath(objectPath, expectedArea),
    initiation_expires_at: assertFutureTimestamp(
      typeof value.initiation_expires_at === "string"
        ? value.initiation_expires_at
        : "",
    ),
    finalize_expires_at: assertFutureTimestamp(
      typeof value.finalize_expires_at === "string"
        ? value.finalize_expires_at
        : "",
    ),
  };
};

export const calculatePrivateFileSha256 = async (file: Blob) => {
  if (!globalThis.crypto?.subtle) {
    throw new PrivateFileTransferError(
      "이 브라우저에서는 안전한 파일 확인을 사용할 수 없습니다.",
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export const preparePrivateFileDescriptor = async (
  file: File,
  contentType: string,
  onProgress?: (progress: PrivateFileUploadProgress) => void,
): Promise<PrivateFileDescriptor> => {
  onProgress?.({ phase: "hashing" });
  const type = contentType.trim().toLowerCase();
  if (
    !type ||
    file.size <= 0 ||
    file.size > MAX_PRIVATE_FILE_SIZE_BYTES
  ) {
    throw new PrivateFileTransferError("업로드할 파일을 확인하지 못했습니다.");
  }
  const sha256 = await calculatePrivateFileSha256(file);
  if (!sha256Pattern.test(sha256)) {
    throw new PrivateFileTransferError("업로드할 파일을 확인하지 못했습니다.");
  }
  return { type, size: file.size, sha256 };
};

export const getPrivateFileSelectionKey = (
  file: File,
  contentType: string,
  contextKey = "",
) =>
  JSON.stringify([
    file.name,
    file.size,
    file.lastModified,
    contentType.trim().toLowerCase(),
    contextKey,
  ]);

export const requestPrivateFileUploadTicket = async ({
  endpoint,
  descriptor,
  expectedArea,
  context,
  signal,
}: {
  endpoint: string;
  descriptor: PrivateFileDescriptor;
  expectedArea: PrivateFileUploadArea;
  context?: Record<string, string | undefined>;
  signal?: AbortSignal;
}) => {
  if (
    !descriptor.type ||
    descriptor.size <= 0 ||
    descriptor.size > MAX_PRIVATE_FILE_SIZE_BYTES ||
    !sha256Pattern.test(descriptor.sha256)
  ) {
    throw new PrivateFileTransferError("업로드할 파일 정보가 올바르지 않습니다.");
  }
  const response = await apiFetch(endpoint, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...context,
      file: descriptor,
    }),
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) {
    throw new PrivateFileTransferError(
      readSafeServerError(payload, "파일 업로드를 준비하지 못했습니다."),
      { status: response.status, code: readSafeServerCode(payload) },
    );
  }
  const ticket = parsePrivateFileUploadTicket(payload, expectedArea);
  const expectedExtension =
    descriptor.type === "application/pdf"
      ? "pdf"
      : descriptor.type === "image/png"
        ? "png"
        : descriptor.type === "image/jpeg"
          ? "jpg"
          : descriptor.type === "image/webp"
            ? "webp"
            : "";
  if (
    !expectedExtension ||
    !ticket.object_path.toLowerCase().endsWith(`-evidence.${expectedExtension}`)
  ) {
    throw new PrivateFileTransferError("파일 저장 형식이 올바르지 않습니다.");
  }
  return ticket;
};

export const isPrivateFileUploadTicketUsable = (
  ticket: PrivateFileUploadTicket,
  phase: "initiation" | "finalize",
  now = Date.now(),
) => {
  const expiry = Date.parse(
    phase === "initiation"
      ? ticket.initiation_expires_at
      : ticket.finalize_expires_at,
  );
  return Number.isFinite(expiry) && expiry > now + 5_000;
};

export const buildPrivateTusUploadOptions = (
  ticket: PrivateFileUploadTicket,
  descriptor: PrivateFileDescriptor,
  tusUploadUrl?: string,
) => ({
  endpoint: ticket.upload_url,
  ...(tusUploadUrl
    ? { uploadUrl: assertTusResumeUrl(tusUploadUrl, ticket.upload_url) }
    : {}),
  headers: {
    "x-signature": ticket.upload_signature,
    "x-upsert": "false",
  },
  metadata: {
    bucketName: ticket.bucket,
    objectName: ticket.object_path,
    contentType: descriptor.type,
    cacheControl: "0",
  },
  chunkSize: PRIVATE_FILE_TUS_CHUNK_SIZE_BYTES,
  retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
  parallelUploads: 1,
  uploadDataDuringCreation: true,
  storeFingerprintForResuming: false,
  removeFingerprintOnSuccess: true,
});

export const uploadPrivateFileWithTicket = ({
  file,
  descriptor,
  ticket,
  signal,
  onProgress,
  tusUploadUrl,
  onTusUploadUrl,
}: {
  file: File;
  descriptor: PrivateFileDescriptor;
  ticket: PrivateFileUploadTicket;
  signal?: AbortSignal;
  onProgress?: (progress: PrivateFileUploadProgress) => void;
  tusUploadUrl?: string;
  onTusUploadUrl?: (url: string) => void;
}) =>
  new Promise<void>((resolve, reject) => {
    if (!isPrivateFileUploadTicketUsable(ticket, "initiation")) {
      reject(
        new PrivateFileTransferError("파일 업로드 요청이 만료되었습니다.", {
          code: "UPLOAD_TICKET_EXPIRED",
        }),
      );
      return;
    }

    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => {
      void upload.abort().finally(() =>
        settle(() =>
          reject(
            new PrivateFileTransferError("파일 업로드가 중단되었습니다.", {
              code: "UPLOAD_ABORTED",
            }),
          ),
        ),
      );
    };

    const upload = new Upload(file, {
      ...buildPrivateTusUploadOptions(ticket, descriptor, tusUploadUrl),
      onBeforeRequest: (request) => {
        const underlying = request.getUnderlyingObject() as {
          withCredentials?: boolean;
        };
        if (typeof underlying?.withCredentials === "boolean") {
          underlying.withCredentials = false;
        }
      },
      onProgress: (bytesSent, bytesTotal) => {
        const percent =
          bytesTotal > 0
            ? Math.min(100, Math.max(0, Math.round((bytesSent / bytesTotal) * 100)))
            : undefined;
        onProgress?.({ phase: "uploading", percent });
      },
      onUploadUrlAvailable: () => {
        if (!upload.url) return;
        onTusUploadUrl?.(assertTusResumeUrl(upload.url, ticket.upload_url));
      },
      onSuccess: () => settle(resolve),
      onError: () =>
        settle(() =>
          reject(
            new PrivateFileTransferError(
              "파일 업로드를 완료하지 못했습니다. 다시 시도해 주세요.",
              { code: "UPLOAD_INTERRUPTED" },
            ),
          ),
        ),
    });

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
    onProgress?.({ phase: "uploading", percent: 0 });
    upload.start();
  });

export const shouldDiscardPrivateFileUploadTicket = (
  status: number,
  code?: string,
) => {
  if (code === "UPLOAD_NOT_READY") return false;
  return (
    status === 409 ||
    code === "UPLOAD_TICKET_INVALID" ||
    code === "UPLOAD_TICKET_EXPIRED"
  );
};

export const shouldRetryPrivateFileUpload = (code?: string) =>
  code === "UPLOAD_NOT_READY";
