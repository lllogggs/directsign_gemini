import {
  proposalTypeLabels,
  type CampaignProposalType,
} from "./marketplace.js";
import type { InfluencerPlatform } from "./verification.js";

export type MarketplaceInboxRole = "advertiser" | "influencer";
export type MarketplaceMessageBucket = "inbox" | "sent";
export type MarketplaceProposalDirection =
  | "advertiser_to_influencer"
  | "influencer_to_brand";
export type MarketplaceProposalStatus =
  | "submitted"
  | "reviewed"
  | "accepted"
  | "declined"
  | "converted_to_contract"
  | "closed";

export type MarketplaceMessageThread = {
  id: string;
  bucket: MarketplaceMessageBucket;
  direction: MarketplaceProposalDirection;
  status: MarketplaceProposalStatus;
  unread: boolean;
  senderName: string;
  senderIntro: string;
  targetName: string;
  targetHandle: string;
  counterpartName: string;
  counterpartAvatarLabel?: string;
  counterpartAvatarUrl?: string;
  counterpartIntro?: string;
  counterpartHref?: string;
  counterpartCategories?: string[];
  platforms: Array<{
    platform: InfluencerPlatform;
    label: string;
    handle?: string;
    url?: string;
    followersLabel?: string;
  }>;
  proposalType: CampaignProposalType;
  proposalTypeLabel: string;
  proposalSummary: string;
  campaignId?: string;
  campaignTitle?: string;
  convertedContractId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceMessageSummary = {
  inboxCount: number;
  sentCount: number;
  unreadCount: number;
  submittedCount: number;
  reviewedCount: number;
  acceptedCount: number;
  declinedCount: number;
  convertedCount: number;
  closedCount: number;
};

export type MarketplaceMessagesResponse = {
  role: MarketplaceInboxRole;
  threads: MarketplaceMessageThread[];
  summary: MarketplaceMessageSummary;
};

export const emptyMarketplaceMessageSummary: MarketplaceMessageSummary = {
  inboxCount: 0,
  sentCount: 0,
  unreadCount: 0,
  submittedCount: 0,
  reviewedCount: 0,
  acceptedCount: 0,
  declinedCount: 0,
  convertedCount: 0,
  closedCount: 0,
};

export const proposalStatusLabels: Record<MarketplaceProposalStatus, string> = {
  submitted: "새 제안",
  reviewed: "검토 중",
  accepted: "수락됨",
  declined: "거절됨",
  converted_to_contract: "계약서 작성 완료",
  closed: "종료",
};

export const proposalStatusTone: Record<MarketplaceProposalStatus, string> = {
  submitted: "border-amber-200 bg-amber-50 text-amber-800",
  reviewed: "border-sky-200 bg-sky-50 text-sky-700",
  accepted: "border-blue-200 bg-blue-50 text-blue-700",
  declined: "border-rose-200 bg-rose-50 text-rose-700",
  converted_to_contract: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

export const marketplaceFlowSteps = {
  advertiser: [
    { label: "캠페인", href: "/advertiser/campaigns" },
    { label: "탐색", href: "/advertiser/discover" },
    { label: "제안함", href: "/advertiser/messages" },
    { label: "1:1 계약 작성", href: "/advertiser/builder" },
  ],
  influencer: [
    { label: "캠페인 확인", href: "/influencer/campaigns" },
    { label: "브랜드 탐색", href: "/influencer/brands" },
    { label: "제안함", href: "/influencer/messages" },
    { label: "계약 검토", href: "/influencer/dashboard" },
  ],
} satisfies Record<MarketplaceInboxRole, Array<{ label: string; href: string }>>;

export function getProposalTypeLabel(type: CampaignProposalType) {
  return proposalTypeLabels[type] ?? "제안";
}

export function formatMarketplaceMessageDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
