export const ADVERTISER_UNVERIFIED_CAMPAIGN_LIMIT = 2 as const;

export type AdvertiserCampaignAccess = {
  published_count: number;
  unverified_campaign_limit: number;
  next_campaign_number: number;
  business_verified: boolean;
  can_publish: boolean;
  verification_required: boolean;
  next_path: string;
};

export type AdvertiserContractAccessReason =
  | "business_verified"
  | "campaign_intro_exempt"
  | "business_verification_required";

export type AdvertiserContractAccess = {
  can_send: boolean;
  verification_required: boolean;
  reason: AdvertiserContractAccessReason;
  next_path: string;
};

export type VerificationRequiredErrorCode =
  | "advertiser_business_verification_required"
  | "influencer_verification_required";

export type VerificationRequiredApiError = {
  code?: VerificationRequiredErrorCode | string;
  error?: string;
  next_path?: string;
  campaign_access?: AdvertiserCampaignAccess;
};

export function isVerificationRequiredError(
  value: unknown,
  code: VerificationRequiredErrorCode,
): value is VerificationRequiredApiError {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as VerificationRequiredApiError).code === code,
  );
}

export function isAdvertiserCampaignAccess(
  value: unknown,
): value is AdvertiserCampaignAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const access = value as Partial<AdvertiserCampaignAccess>;
  return (
    Number.isSafeInteger(access.published_count) &&
    Number.isSafeInteger(access.unverified_campaign_limit) &&
    Number.isSafeInteger(access.next_campaign_number) &&
    typeof access.business_verified === "boolean" &&
    typeof access.can_publish === "boolean" &&
    typeof access.verification_required === "boolean" &&
    typeof access.next_path === "string"
  );
}

export function isAdvertiserContractAccess(
  value: unknown,
): value is AdvertiserContractAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const access = value as Partial<AdvertiserContractAccess>;
  const hasValidReason =
    access.reason === "business_verified" ||
    access.reason === "campaign_intro_exempt" ||
    access.reason === "business_verification_required";

  if (
    typeof access.can_send !== "boolean" ||
    typeof access.verification_required !== "boolean" ||
    !hasValidReason ||
    typeof access.next_path !== "string" ||
    !access.next_path.startsWith("/")
  ) {
    return false;
  }

  return access.reason === "business_verification_required"
    ? !access.can_send && access.verification_required
    : access.can_send && !access.verification_required;
}
