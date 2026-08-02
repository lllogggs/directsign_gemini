import { v4 as uuidv4 } from "uuid";

export type ContractType = "협찬" | "PPL" | "공동구매";
export type ContractStatus =
  | "DRAFT"
  | "REVIEWING"
  | "NEGOTIATING"
  | "APPROVED"
  | "SIGNED"
  | "CLOSED";
export type ClauseStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "MODIFICATION_REQUESTED"
  | "DELETION_REQUESTED";
export type ContractActor = "advertiser" | "influencer" | "system";
export type ContractRiskLevel = "low" | "medium" | "high";
export type DataOrigin = "production" | "qa" | "demo" | "seed";
export type AdvertiserTrustRiskLevel = "low" | "medium" | "high";
export type PdfStatus = "not_ready" | "draft_ready" | "signed_ready";
export type ContractPlatform =
  | "NAVER_BLOG"
  | "YOUTUBE"
  | "INSTAGRAM"
  | "TIKTOK"
  | "OTHER";

export type ContractDeliverableContentType =
  | "instagram_feed"
  | "instagram_reels"
  | "instagram_story"
  | "youtube_shorts"
  | "youtube_longform"
  | "tiktok_shortform"
  | "naver_blog_review"
  | "other";

export interface ContractDeliverableRequirementDetail {
  videoLength?: string;
  photoCount?: string;
  frameCount?: string;
  wordCount?: string;
  maintainPeriod?: string;
  platformName?: string;
  contentName?: string;
  note?: string;
}

export interface ContractDeliverableItem {
  id: string;
  platform: ContractPlatform;
  platformLabel: string;
  contentType: ContractDeliverableContentType;
  contentLabel: string;
  requirementText: string;
  requirements: ContractDeliverableRequirementDetail;
}

export interface AdvertiserTrustFlag {
  code: string;
  label: string;
  severity: AdvertiserTrustRiskLevel;
}

export interface ContractAdvertiserTrust {
  business_verification_status?: "not_submitted" | "pending" | "approved" | "rejected";
  business_verification_label?: string;
  business_verified_at?: string;
  business_name?: string;
  business_registration_number_masked?: string;
  representative_name?: string;
  manager_name?: string;
  manager_phone?: string;
  manager_email_domain?: string;
  first_contract?: boolean;
  risk_score?: number;
  risk_level?: AdvertiserTrustRiskLevel;
  risk_flags?: AdvertiserTrustFlag[];
  guidance?: string;
}

export interface ClauseHistory {
  id: string;
  role: "advertiser" | "influencer";
  action: string;
  comment: string;
  timestamp: string;
}

export interface Clause {
  clause_id: string;
  category: string;
  content: string;
  status: ClauseStatus;
  history: ClauseHistory[];
}

export interface ContractWorkflow {
  next_actor: ContractActor;
  next_action: string;
  due_at?: string;
  last_message?: string;
  risk_level: ContractRiskLevel;
}

export interface ContractCampaign {
  source?: "direct" | "marketplace_campaign";
  fixed_terms?: boolean;
  marketplace_campaign_id?: string;
  source_application_id?: string;
  applicant_limit?: string;
  budget?: string;
  start_date?: string;
  end_date?: string;
  deadline?: string;
  upload_due_at?: string;
  review_due_at?: string;
  revision_limit?: string;
  revision_request_policy?: string;
  disclosure_text?: string;
  tracking_link?: string;
  reference_links?: string[];
  payment_method?: "external_bank_transfer" | "advertiser_direct" | "other_direct";
  withholding_tax_enabled?: boolean;
  period?: string;
  platforms?: ContractPlatform[];
  deliverables?: string[];
  deliverable_items?: ContractDeliverableItem[];
  required_hashtags?: string[];
  brand_account_tags?: string[];
  content_submission?: {
    url_required?: boolean;
    file_required?: boolean;
    file_examples?: string;
    review_scope?: string;
  };
  content_usage?: {
    allowed?: boolean;
    channels?: string[];
    period?: string;
    edit_allowed?: boolean;
  };
}

export interface ContractEvidence {
  share_token_status: "not_issued" | "active" | "expired" | "revoked";
  share_token?: string;
  share_token_expires_at?: string;
  audit_ready: boolean;
  pdf_status: PdfStatus;
}

export interface ContractSettlementInquiry {
  id: string;
  status: "open" | "resolved";
  message: string;
  requested_at: string;
  requested_by_profile_id?: string;
  requested_by_name?: string;
}

export interface ContractSettlement {
  advertiser_confirmed_paid?: boolean;
  advertiser_confirmed_at?: string;
  advertiser_confirmed_by_profile_id?: string;
  advertiser_confirmed_by_name?: string;
  status?: "confirmed_paid" | "unpaid_inquiry";
  inquiries?: ContractSettlementInquiry[];
}

export interface AuditEvent {
  id: string;
  actor: ContractActor;
  action: string;
  description: string;
  created_at: string;
  related_clause_id?: string;
}

export interface Contract {
  id: string;
  data_origin?: DataOrigin;
  advertiser_id: string;
  brand_profile_id?: string;
  campaign_name?: string;
  post_link?: string;
  deliverable_summary?: {
    total: number;
    submitted: number;
    approved: number;
    updated_at?: string;
  };
  advertiser_info?: {
    name: string;
    manager?: string;
  };
  advertiser_trust?: ContractAdvertiserTrust;
  type: ContractType;
  status: ContractStatus;
  title: string;
  influencer_info: {
    name: string;
    channel_url: string;
    contact: string;
  };
  campaign?: ContractCampaign;
  settlement?: ContractSettlement;
  workflow?: ContractWorkflow;
  evidence?: ContractEvidence;
  audit_events?: AuditEvent[];
  clauses: Clause[];
  signature_data?: {
    adv_sign: string;
    inf_sign: string;
    signed_at: string;
    ip: string;
    user_agent?: string;
    signer_name?: string;
    signer_email?: string;
    consent_text?: string;
    consent_text_version?: string;
    contract_hash?: string;
    signature_hash?: string;
    signature_storage_bucket?: string;
    signature_storage_path?: string;
    signature_storage_provider?: string;
    signature_storage_hash?: string;
    signed_pdf_bucket?: string;
    signed_pdf_path?: string;
    signed_pdf_storage_provider?: string;
    signed_pdf_hash?: string;
    signed_pdf_mime?: string;
    signed_pdf_size?: number;
  };
  pdf_url?: string;
  created_at: string;
  updated_at: string;
}

export const isFixedCampaignContract = (
  contract:
    | Pick<Contract, "campaign" | "clauses" | "audit_events">
    | undefined
    | null,
) => {
  if (!contract) return false;
  if (
    contract.campaign?.fixed_terms === true ||
    contract.campaign?.source === "marketplace_campaign"
  ) {
    return true;
  }

  return (
    contract.clauses.some((clause) =>
      clause.clause_id.startsWith("campaign_application_"),
    ) ||
    (contract.audit_events ?? []).some(
      (event) => event.action === "campaign_application_accepted",
    )
  );
};

export const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const formatDateOnly = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}.${String(date.getDate()).padStart(2, "0")}`;
};

const formatDemoPeriod = (startOffset: number, endOffset: number) =>
  `${formatDateOnly(startOffset)} - ${formatDateOnly(endOffset)}`;

export const createShareToken = () => uuidv4().replace(/-/g, "");

export const createWorkflow = (
  status: ContractStatus,
  overrides: Partial<ContractWorkflow> = {},
): ContractWorkflow => {
  const defaults: Record<ContractStatus, ContractWorkflow> = {
    DRAFT: {
      next_actor: "advertiser",
      next_action: "계약 초안을 완성하고 공유 링크를 발송하세요.",
      due_at: addDays(3),
      risk_level: "low",
    },
    REVIEWING: {
      next_actor: "influencer",
      next_action: "인플루언서 검토 응답을 기다리는 중입니다.",
      due_at: addDays(2),
      risk_level: "medium",
    },
    NEGOTIATING: {
      next_actor: "advertiser",
      next_action: "수정 요청을 검토하고 답변하세요.",
      due_at: addDays(1),
      risk_level: "high",
    },
    APPROVED: {
      next_actor: "advertiser",
      next_action: "최종본을 잠그고 서명을 요청하세요.",
      due_at: addDays(1),
      risk_level: "medium",
    },
    SIGNED: {
      next_actor: "system",
      next_action: "전자서명 완료 후 콘텐츠 제출을 기다리는 중입니다.",
      risk_level: "low",
    },
    CLOSED: {
      next_actor: "system",
      next_action: "광고 계약 마감 완료",
      risk_level: "low",
    },
  };

  return { ...defaults[status], ...overrides };
};

export const createEvidence = (
  overrides: Partial<ContractEvidence> = {},
): ContractEvidence => {
  const shareTokenStatus = overrides.share_token_status ?? "not_issued";

  return {
    share_token_status: "not_issued",
    audit_ready: false,
    pdf_status: "not_ready",
    ...overrides,
    share_token:
      shareTokenStatus === "active"
        ? overrides.share_token
        : undefined,
  };
};

export const createDemoContracts = (): Contract[] => {
  const now = new Date().toISOString();

  return [
    {
      id: "demo-contract-1",
      advertiser_id: "adv-1",
      campaign_name: "루트코스메틱 수분크림 인스타 릴스 협찬",
      advertiser_info: {
        name: "루트코스메틱",
        manager: "김마케팅",
      },
      type: "협찬",
      status: "REVIEWING",
      title: "루트코스메틱 수분크림 인스타 릴스 협찬",
      influencer_info: {
        name: "패션크리에이터A",
        channel_url: "https://instagram.com/fashion_a",
        contact: "fashion_a@example.com",
      },
      campaign: {
        budget: "1,500,000원",
        deadline: addDays(5),
        period: formatDemoPeriod(1, 28),
        platforms: ["INSTAGRAM"],
        deliverables: ["Instagram feed", "Reels"],
      },
      workflow: createWorkflow("REVIEWING", {
        last_message: "게시물 유지 기간을 3개월로 조정 요청",
      }),
      evidence: createEvidence({
        share_token_status: "active",
        share_token: createShareToken(),
        share_token_expires_at: addDays(7),
        audit_ready: true,
        pdf_status: "draft_ready",
      }),
      audit_events: [
        {
          id: uuidv4(),
          actor: "system",
          action: "share_link_issued",
          description: "인플루언서 검토용 링크가 발급되었습니다.",
          created_at: now,
        },
      ],
      clauses: [
        {
          clause_id: "c_001",
          category: "서비스 제공 내용",
          content: "인스타그램 피드 1회 및 릴스 1회 업로드",
          status: "APPROVED",
          history: [],
        },
        {
          clause_id: "c_002",
          category: "유지 기간",
          content: "업로드 후 6개월간 게시물 유지",
          status: "MODIFICATION_REQUESTED",
          history: [
            {
              id: uuidv4(),
              role: "influencer",
              action: "수정 요청",
              comment:
                "통상적으로 3개월 유지 조건으로 진행합니다. 3개월로 수정 부탁드립니다.",
              timestamp: now,
            },
          ],
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-contract-2",
      advertiser_id: "adv-1",
      campaign_name: "테크베어 스마트 모니터 유튜브 리뷰 건",
      advertiser_info: {
        name: "테크베어",
        manager: "박브랜드",
      },
      type: "PPL",
      status: "NEGOTIATING",
      title: "테크베어 스마트 모니터 유튜브 리뷰 건",
      influencer_info: {
        name: "뷰티메이커B",
        channel_url: "https://youtube.com/@beauty_b",
        contact: "beauty_b@example.com",
      },
      campaign: {
        budget: "3,200,000원",
        deadline: addDays(2),
        period: formatDemoPeriod(2, 18),
        platforms: ["YOUTUBE", "INSTAGRAM", "TIKTOK"],
        deliverables: ["YouTube Shorts", "Instagram story", "TikTok short"],
      },
      workflow: createWorkflow("NEGOTIATING", {
        last_message: "경쟁사 배제 기간과 수정 가능 횟수 조정 요청",
      }),
      evidence: createEvidence({
        share_token_status: "active",
        share_token: createShareToken(),
        share_token_expires_at: addDays(7),
        audit_ready: true,
        pdf_status: "draft_ready",
      }),
      audit_events: [
        {
          id: uuidv4(),
          actor: "influencer",
          action: "clause_change_requested",
          description: "경쟁사 배제 기간에 대한 수정 요청이 접수되었습니다.",
          created_at: now,
          related_clause_id: "c_102",
        },
      ],
      clauses: [
        {
          clause_id: "c_101",
          category: "콘텐츠 업로드",
          content: "유튜브 숏츠 1회, 인스타그램 스토리 2회 업로드",
          status: "APPROVED",
          history: [],
        },
        {
          clause_id: "c_102",
          category: "경쟁사 배제",
          content: "업로드 후 6개월간 동종 카테고리 광고 진행 불가",
          status: "MODIFICATION_REQUESTED",
          history: [
            {
              id: uuidv4(),
              role: "influencer",
              action: "수정 요청",
              comment: "6개월은 너무 길어 2개월로 조정하고 싶습니다.",
              timestamp: now,
            },
          ],
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-contract-3",
      advertiser_id: "adv-1",
      campaign_name: "네오슈즈 신발 2종 공동구매 진행",
      advertiser_info: {
        name: "네오슈즈",
        manager: "이커머스",
      },
      type: "공동구매",
      status: "APPROVED",
      title: "네오슈즈 신발 2종 공동구매 진행",
      influencer_info: {
        name: "헬스라이프C",
        channel_url: "https://instagram.com/health_c",
        contact: "health_c@example.com",
      },
      campaign: {
        budget: "판매 수익 18%",
        deadline: addDays(1),
        period: formatDemoPeriod(4, 24),
        platforms: ["INSTAGRAM", "NAVER_BLOG"],
        deliverables: ["Instagram reels", "Naver Blog", "Live commerce"],
      },
      workflow: createWorkflow("APPROVED", {
        last_message: "모든 조항 승인 완료",
      }),
      evidence: createEvidence({
        share_token_status: "active",
        share_token: createShareToken(),
        share_token_expires_at: addDays(7),
        audit_ready: true,
        pdf_status: "draft_ready",
      }),
      audit_events: [
        {
          id: uuidv4(),
          actor: "advertiser",
          action: "all_clauses_approved",
          description: "모든 조항이 승인되어 서명 요청이 가능합니다.",
          created_at: now,
        },
      ],
      clauses: [
        {
          clause_id: "c_201",
          category: "수익 분배",
          content: "공동구매 순매출의 18%를 인플루언서에게 지급",
          status: "APPROVED",
          history: [],
        },
      ],
      created_at: now,
      updated_at: now,
    },
  ];
};
