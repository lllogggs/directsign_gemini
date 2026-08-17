export interface VerificationEvidenceFileIdentity {
  provider: "supabase_storage" | "local_file";
  bucket: string;
  path: string;
  content_type: string;
  byte_size: number;
  sha256: string;
}

export interface VerificationEvidenceRecordLike {
  evidence_snapshot_json?: Record<string, unknown>;
}

export type VerificationEvidenceReconciliationAlertReason =
  | "lookup_ambiguous"
  | "cleanup_failed";

export type VerificationEvidenceReconciliationResult<T> =
  | { state: "committed"; record: T }
  | {
      state: "cleaned";
      reason: "record_missing" | "evidence_mismatch";
      record?: T;
    }
  | {
      state: "retained";
      reason: VerificationEvidenceReconciliationAlertReason;
      record?: T;
      error: unknown;
    };

const readEvidenceFile = (
  record: VerificationEvidenceRecordLike,
): Partial<VerificationEvidenceFileIdentity> | undefined => {
  const candidate = record.evidence_snapshot_json?.evidence_file;
  return candidate && typeof candidate === "object"
    ? (candidate as Partial<VerificationEvidenceFileIdentity>)
    : undefined;
};

export const hasExactVerificationEvidenceFile = (
  record: VerificationEvidenceRecordLike,
  pendingFile: VerificationEvidenceFileIdentity,
) => {
  const persistedFile = readEvidenceFile(record);
  return Boolean(
    persistedFile &&
      persistedFile.provider === pendingFile.provider &&
      persistedFile.bucket === pendingFile.bucket &&
      persistedFile.path === pendingFile.path &&
      persistedFile.content_type === pendingFile.content_type &&
      persistedFile.sha256 === pendingFile.sha256 &&
      persistedFile.byte_size === pendingFile.byte_size,
  );
};

export const reconcileVerificationEvidencePersistence = async <
  T extends VerificationEvidenceRecordLike,
>({
  pendingFile,
  readRecord,
  deletePendingFile,
  reportUrgent,
}: {
  pendingFile: VerificationEvidenceFileIdentity;
  readRecord: () => Promise<T | undefined>;
  deletePendingFile: () => Promise<void>;
  reportUrgent: (input: {
    reason: VerificationEvidenceReconciliationAlertReason;
    error: unknown;
    recordPresent: boolean;
  }) => Promise<void>;
}): Promise<VerificationEvidenceReconciliationResult<T>> => {
  let record: T | undefined;
  try {
    record = await readRecord();
  } catch (error) {
    await reportUrgent({
      reason: "lookup_ambiguous",
      error,
      recordPresent: false,
    }).catch(() => undefined);
    return {
      state: "retained",
      reason: "lookup_ambiguous",
      error,
    };
  }

  if (record && hasExactVerificationEvidenceFile(record, pendingFile)) {
    return { state: "committed", record };
  }

  try {
    await deletePendingFile();
    return {
      state: "cleaned",
      reason: record ? "evidence_mismatch" : "record_missing",
      ...(record ? { record } : {}),
    };
  } catch (error) {
    await reportUrgent({
      reason: "cleanup_failed",
      error,
      recordPresent: Boolean(record),
    }).catch(() => undefined);
    return {
      state: "retained",
      reason: "cleanup_failed",
      ...(record ? { record } : {}),
      error,
    };
  }
};
