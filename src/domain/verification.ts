export type VerificationStatus =
  | "not_submitted"
  | "pending"
  | "approved"
  | "rejected";

export type VerificationTargetType =
  | "advertiser_organization"
  | "influencer_account";

export type VerificationType =
  | "business_registration_certificate"
  | "platform_account";

export type InfluencerPlatform =
  | "instagram"
  | "youtube"
  | "tiktok"
  | "naver_blog"
  | "other";

export type InfluencerVerificationMethod =
  | "profile_bio_code"
  | "public_post_code"
  | "channel_description_code"
  | "screenshot_review";

export type OwnershipCheckStatus =
  | "not_run"
  | "matched"
  | "not_found"
  | "blocked"
  | "failed";

export interface VerificationRequest {
  id: string;
  target_type: VerificationTargetType;
  target_id: string;
  verification_type: VerificationType;
  status: Exclude<VerificationStatus, "not_submitted">;
  subject_name: string;
  submitted_by_name?: string;
  submitted_by_email?: string;
  business_registration_number?: string;
  representative_name?: string;
  manager_phone?: string;
  platform?: InfluencerPlatform;
  platform_handle?: string;
  platform_url?: string;
  ownership_verification_method?: InfluencerVerificationMethod;
  ownership_challenge_code?: string;
  ownership_challenge_url?: string;
  ownership_check_status?: OwnershipCheckStatus;
  ownership_checked_at?: string;
  document_issue_date?: string;
  document_check_number?: string;
  evidence_file_name?: string;
  evidence_file_mime?: string;
  evidence_file_size?: number;
  evidence_snapshot_json?: {
    file_data_url?: string;
    evidence_file?: {
      provider: "supabase_storage" | "local_file";
      bucket: string;
      path: string;
      file_name: string;
      content_type: string;
      byte_size: number;
      sha256: string;
      stored_at: string;
      download_path?: string;
    };
    [key: string]: unknown;
  };
  note?: string;
  reviewer_note?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationAccountInfo {
  name?: string;
  company_name?: string;
  email?: string;
  business_registration_number?: string;
  representative_name?: string;
  platform_handle?: string;
  platform_url?: string;
}

export interface ApprovedInfluencerPlatform {
  platform: InfluencerPlatform;
  handle: string;
  url?: string;
  approved_at?: string;
}

export interface VerificationProfile {
  target_type: VerificationTargetType;
  target_id: string;
  status: VerificationStatus;
  latest_request?: VerificationRequest;
  account?: VerificationAccountInfo;
  approved_platforms?: ApprovedInfluencerPlatform[];
}

export interface VerificationSummary {
  advertiser: VerificationProfile;
  influencer: VerificationProfile;
}

export const verificationStatusLabel = (status: VerificationStatus) => {
  const labels: Record<VerificationStatus, string> = {
    not_submitted: "미제출",
    pending: "검수 중",
    approved: "인증 완료",
    rejected: "반려",
  };

  return labels[status];
};

export const verificationStatusTone = (status: VerificationStatus) => {
  const tones: Record<VerificationStatus, string> = {
    not_submitted: "border-neutral-200 bg-white text-neutral-600",
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    approved: "border-neutral-300 bg-white text-neutral-800",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return tones[status];
};
