export interface InfluencerVerificationOwnershipRecord {
  target_type?: unknown;
  profile_id?: unknown;
  target_id?: unknown;
  submitted_by_email?: unknown;
}

const normalizeIdentifier = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const verificationRequestBelongsToInfluencerAccount = (
  record: InfluencerVerificationOwnershipRecord,
  trustedProfileId: string,
  trustedProfileEmail: string | undefined,
) => {
  if (record.target_type !== "influencer_account") return false;

  const profileId = normalizeIdentifier(trustedProfileId);
  if (!profileId) return false;

  const boundIds = [record.profile_id, record.target_id]
    .map(normalizeIdentifier)
    .filter(Boolean);
  if (boundIds.length > 0) {
    return boundIds.every((boundId) => boundId === profileId);
  }

  const profileEmail = normalizeEmail(trustedProfileEmail);
  const submittedEmail = normalizeEmail(record.submitted_by_email);
  return Boolean(profileEmail) && submittedEmail === profileEmail;
};
