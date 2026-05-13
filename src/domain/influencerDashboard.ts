import type {
  InfluencerPlatform,
  VerificationRequest,
  VerificationStatus,
} from "./verification.js";

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

export interface InfluencerDashboardUser {
  id: string;
  email: string;
  name: string;
  role: "marketer" | "influencer" | "admin";
  activity_categories: InfluencerActivityCategory[];
  activity_platforms: InfluencerPlatform[];
  verification_status: VerificationStatus;
  email_verified: boolean;
}

export interface InfluencerDashboardVerification {
  status: VerificationStatus;
  latest_request?: VerificationRequest;
  approved_platforms: Array<{
    platform: InfluencerPlatform;
    handle: string;
    url?: string;
    approved_at?: string;
  }>;
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
}

export interface InfluencerDashboardResponse {
  authenticated: true;
  user: InfluencerDashboardUser;
  verification: InfluencerDashboardVerification;
  summary: InfluencerDashboardSummary;
  tasks: InfluencerDashboardTask[];
  contracts: InfluencerDashboardContract[];
}
