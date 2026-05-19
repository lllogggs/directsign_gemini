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
  | "instagram_dm_code"
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

export interface VerificationRejectionGuidance {
  title: string;
  body: string;
  reviewerNote: string;
  checklist: string[];
}

const platformLabel = (platform?: InfluencerPlatform) => {
  const labels: Record<InfluencerPlatform, string> = {
    instagram: "인스타그램",
    youtube: "유튜브",
    tiktok: "틱톡",
    naver_blog: "네이버 블로그",
    other: "기타 플랫폼",
  };

  return platform ? labels[platform] : "플랫폼";
};

const getInfluencerPlatformChecklistItem = (request?: VerificationRequest) => {
  if (request?.platform === "youtube") {
    return "유튜브 채널 소개, 영상, 쇼츠, 커뮤니티 글 중 인증 코드가 보이는 공개 URL을 제출해 주세요.";
  }
  if (request?.platform === "instagram") {
    return "인스타그램은 공식 계정 DM 발신 계정, 프로필 URL, 인증 코드가 서로 일치해야 합니다.";
  }
  if (request?.platform === "tiktok") {
    return "틱톡 프로필 또는 영상 설명에서 인증 코드가 보이지 않으면 코드가 보이는 스크린샷을 함께 제출해 주세요.";
  }
  if (request?.platform === "naver_blog") {
    return "네이버 블로그는 서로이웃 전용 글이 아닌 공개 글이나 프로필 소개에서 인증 코드가 보여야 합니다.";
  }

  return "운영자가 로그인 없이 확인할 수 있는 공개 URL이나 코드가 보이는 스크린샷을 제출해 주세요.";
};

export const getVerificationRejectionGuidance = (
  request?: VerificationRequest,
  fallbackTargetType?: VerificationTargetType,
): VerificationRejectionGuidance => {
  const targetType = request?.target_type ?? fallbackTargetType;
  const reviewerNote =
    request?.reviewer_note?.trim() ||
    "운영자가 제출 정보와 증빙을 대조하는 과정에서 확인이 필요한 항목을 찾았습니다.";

  if (targetType === "advertiser_organization") {
    return {
      title: "사업자 인증 재제출이 필요합니다",
      body: "계약 초안 작성은 계속할 수 있지만, 새 증빙으로 승인되기 전까지 공유 링크 발송은 제한됩니다.",
      reviewerNote,
      checklist: [
        "사업자등록번호, 회사명, 대표자명이 증빙 문서와 가입 정보에서 서로 일치하는지 확인해 주세요.",
        "발급일과 문서확인번호가 보이는 최근 사업자등록증명원 PDF 또는 이미지를 올려 주세요.",
        "문서 전체가 잘리지 않고 흐릿하지 않은지, 민감 정보를 가린 경우에도 검수에 필요한 항목은 보이는지 확인해 주세요.",
        "대행사가 브랜드를 대신 계약하는 경우 운영자 메모에 관계와 계약 권한을 적어 주세요.",
      ],
    };
  }

  const label = platformLabel(request?.platform);

  return {
    title: `${label} 계정 인증 재제출이 필요합니다`,
    body: "계약 내용 검토는 계속할 수 있지만, 인증이 승인되기 전까지 해당 계약의 전자서명은 제한됩니다.",
    reviewerNote,
    checklist: [
      "프로필 URL과 핸들이 실제 본인 계정과 일치하고 외부에서 열람 가능한지 확인해 주세요.",
      "인증 코드가 증빙 URL의 공개 화면에 그대로 보이거나, 코드와 계정 소유자가 함께 보이는 스크린샷을 첨부해 주세요.",
      getInfluencerPlatformChecklistItem(request),
      "인증이 끝나기 전에 코드가 들어간 게시글이나 소개 문구를 삭제하지 말아 주세요.",
    ],
  };
};
