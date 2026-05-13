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
  counterpartHref?: string;
  platforms: Array<{
    platform: InfluencerPlatform;
    label: string;
    handle?: string;
    url?: string;
  }>;
  proposalType: CampaignProposalType;
  proposalTypeLabel: string;
  proposalSummary: string;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceMessageSummary = {
  inboxCount: number;
  sentCount: number;
  unreadCount: number;
  submittedCount: number;
  reviewedCount: number;
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
  convertedCount: 0,
  closedCount: 0,
};

export const proposalStatusLabels: Record<MarketplaceProposalStatus, string> = {
  submitted: "새 제안",
  reviewed: "검토 중",
  converted_to_contract: "계약 전환",
  closed: "종료",
};

export const proposalStatusTone: Record<MarketplaceProposalStatus, string> = {
  submitted: "border-amber-200 bg-amber-50 text-amber-800",
  reviewed: "border-sky-200 bg-sky-50 text-sky-700",
  converted_to_contract: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

export const marketplaceFlowSteps = {
  advertiser: [
    { label: "탐색", href: "/advertiser/discover" },
    { label: "제안함", href: "/advertiser/messages" },
    { label: "계약 작성", href: "/advertiser/builder" },
    { label: "계약 관리", href: "/advertiser/dashboard" },
  ],
  influencer: [
    { label: "브랜드 탐색", href: "/influencer/brands" },
    { label: "제안함", href: "/influencer/messages" },
    { label: "공개 프로필", href: "/influencer/dashboard" },
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
