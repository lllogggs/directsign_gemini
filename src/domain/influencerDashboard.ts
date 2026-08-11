import type {
  ApprovedInfluencerPlatform,
  InfluencerPlatform,
  VerificationRequest,
  VerificationStatus,
} from "./verification.js";
import type { MarketplaceProposalStatus } from "./marketplaceInbox.js";

export type InfluencerActivityCategory =
  | "mukbang"
  | "travel"
  | "beauty"
  | "fashion"
  | "fitness"
  | "tech"
  | "game"
  | "education"
  | "lifestyle"
  | "finance";

export type InfluencerDashboardContractStage =
  | "review_needed"
  | "change_pending"
  | "ready_to_sign"
  | "deliverables_due"
  | "deliverables_review"
  | "signed"
  | "completed"
  | "waiting";

export type InfluencerDashboardApplicationStage =
  | "submitted"
  | "reviewed"
  | "reserved"
  | "accepted"
  | "declined"
  | "closed";

export interface InfluencerDashboardActivityEvent {
  id: string;
  actor: string;
  action: string;
  label: string;
  description: string;
  created_at: string;
}

export interface InfluencerDashboardUser {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  role: "marketer" | "influencer" | "admin";
  activity_categories: InfluencerActivityCategory[];
  activity_platforms: InfluencerPlatform[];
  verification_status: VerificationStatus;
  email_verified: boolean;
}

export interface InfluencerDashboardVerification {
  status: VerificationStatus;
  latest_request?: VerificationRequest;
  approved_platforms: ApprovedInfluencerPlatform[];
}

export interface InfluencerDashboardPublicProfile {
  path?: string;
  handle?: string;
  state: "setup_required" | "minimal" | "complete";
  published: boolean;
  platform_verification_state: "unverified" | "verified";
  representative_activity_page_url?: string;
  completion_required: boolean;
}

export interface InfluencerDashboardSummary {
  total_contracts: number;
  review_needed: number;
  change_pending: number;
  ready_to_sign: number;
  signed: number;
  verification_needed: boolean;
  next_deadline?: string;
  total_fixed_fee_label: string;
}

export interface InfluencerDashboardTask {
  id: string;
  tone: "neutral" | "amber" | "rose" | "sky";
  title: string;
  body: string;
  action_label: string;
  href: string;
  due_at?: string;
  contract_id?: string;
}

export interface InfluencerDashboardContract {
  id: string;
  title: string;
  advertiser_name: string;
  influencer_name: string;
  status_label: string;
  stage: InfluencerDashboardContractStage;
  stage_label: string;
  next_action_label: string;
  action_label: string;
  action_href: string;
  verification_href: string;
  platform_labels: string[];
  platforms: InfluencerPlatform[];
  platform_accounts: Array<{
    platform: InfluencerPlatform;
    url?: string;
  }>;
  fee_label: string;
  period_label: string;
  deadline_label: string;
  due_at?: string;
  updated_at: string;
  clause_summary: {
    total: number;
    approved: number;
    change_requested: number;
  };
  deliverable_summary: {
    total: number;
    submitted: number;
    approved: number;
  };
  record_summary: {
    label: string;
    status: "not_ready" | "ready";
  };
  activity_events: InfluencerDashboardActivityEvent[];
}

export interface InfluencerDashboardApplication {
  id: string;
  campaign_id?: string;
  campaign_title: string;
  brand_name: string;
  brand_handle?: string;
  status: MarketplaceProposalStatus;
  stage: InfluencerDashboardApplicationStage;
  stage_label: string;
  next_action_label: string;
  action_label: string;
  action_href: string;
  platform_labels: string[];
  platforms: InfluencerPlatform[];
  fee_label: string;
  deadline_label: string;
  due_at?: string;
  proposal_summary: string;
  converted_contract_id?: string;
  created_at: string;
  updated_at: string;
  activity_events: InfluencerDashboardActivityEvent[];
}

export interface InfluencerDashboardResponse {
  authenticated: true;
  user: InfluencerDashboardUser;
  verification: InfluencerDashboardVerification;
  public_profile: InfluencerDashboardPublicProfile;
  summary: InfluencerDashboardSummary;
  tasks: InfluencerDashboardTask[];
  contracts: InfluencerDashboardContract[];
  applications: InfluencerDashboardApplication[];
}
