import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  useAppStore,
  Contract,
  ContractPlatform,
  ContractStatus,
  ContractType,
  Clause,
} from "../../store";
import type {
  ContractDeliverableContentType,
  ContractDeliverableItem,
  ContractDeliverableRequirementDetail,
} from "../../domain/contracts";
import {
  getVerificationRejectionGuidance,
  type VerificationRequest,
  type VerificationStatus,
} from "../../domain/verification";
import { removeInternalTestLabel } from "../../domain/display";
import {
  clearVerificationSummaryCache,
  useVerificationSummary,
} from "../../hooks/useVerificationSummary";
import { clearAdvertiserSessionCache } from "../../domain/advertiserSessionCache";
import { clearAdvertiserDashboardBootstrapPreload } from "../../domain/advertiserDashboardPreload";
import { finishFastLoginTransition } from "../../domain/fastLoginTransition";
import { clearMarketplaceMessageSummaryCache } from "../../hooks/useMarketplaceMessageSummary";
import { PRODUCT_NAME } from "../../domain/brand";
import { LEGAL_CONTACT_EMAIL } from "../../domain/legalEntity";
import { ScreenHelpButton } from "../../components/ScreenHelp";
import { LogoMark } from "../../components/BrandLogo";
import { SCREEN_HELP_CONTENT } from "../../domain/screenHelp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  KeyRound,
  LogOut,
  Mail,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { apiFetch } from "../../domain/api";
import type { MarketplaceBrandProfile } from "../../domain/marketplace";
import {
  readSelectedAdvertiserBrandId,
  writeSelectedAdvertiserBrandId,
} from "../../domain/advertiserBrands";

type StepId = 1 | 2 | 3 | 4 | 5;
type ResultMode = "draft" | "share";
type AdvertiserBrandsResponse = {
  brand?: MarketplaceBrandProfile | null;
  brands?: MarketplaceBrandProfile[];
  error?: string;
};

type MarketplaceProposalDraftContextResponse = {
  contract_id?: string;
  already_converted?: boolean;
  converted_contract_id?: string;
  brand?: MarketplaceBrandProfile;
  prefill?: {
    brandId?: string;
    title?: string;
    type?: ContractType;
    influencerName?: string;
    influencerUrl?: string;
    influencerContact?: string;
    platforms?: ContractPlatform[];
    proposalSummary?: string;
  };
  error?: string;
};

interface ContractDraft {
  advertiserName: string;
  advertiserManager: string;
  title: string;
  type: ContractType;
  influencerName: string;
  influencerUrl: string;
  influencerContact: string;
  selectedDeliverables: ContractDeliverableContentType[];
  deliverableRequirements: Partial<
    Record<ContractDeliverableContentType, ContractDeliverableRequirementDetail>
  >;
  campaignStart: string;
  campaignEnd: string;
  uploadDueDate: string;
  reviewDueDate: string;
  revisionLimit: string;
  revisionRequestPolicy: string;
  disclosureText: string;
  trackingLink: string;
  referenceLinks: string;
  requiredHashtags: string;
  brandAccountTags: string;
  contentFileRequirement: string;
  contentUsageAllowed: boolean;
  contentUsageChannels: string;
  contentUsagePeriod: string;
  contentUsageEditAllowed: boolean;
  exclusivity: string;
  paymentMethod: "external_bank_transfer" | "advertiser_direct" | "other_direct";
  withholdingTaxEnabled: boolean;
  payment: string;
  customClauses: { id: string; category: string; content: string }[];
  newClauseCategory: string;
  newClauseContent: string;
}

interface ValidationError {
  field: string;
  message: string;
  step: StepId;
}

const STEPS: Array<{ s: StepId; label: string }> = [
  { s: 1, label: "플랫폼 선택" },
  { s: 2, label: "기본 정보" },
  { s: 3, label: "일정 및 지급" },
  { s: 4, label: "특약 사항" },
  { s: 5, label: "발송 전 확인" },
];

type DeliverableRequirementField = keyof ContractDeliverableRequirementDetail;

interface DeliverableFieldConfig {
  key: DeliverableRequirementField;
  label: string;
  placeholder: string;
  fullWidth?: boolean;
}

interface DeliverableOption {
  platform: ContractPlatform;
  platformLabel: string;
  contentType: ContractDeliverableContentType;
  label: string;
  caption: string;
  fields: DeliverableFieldConfig[];
  requiredFields: DeliverableRequirementField[];
}

const PLATFORM_CONTENT_GROUPS: Array<{
  platform: ContractPlatform;
  label: string;
  items: DeliverableOption[];
}> = [
  {
    platform: "INSTAGRAM",
    label: "인스타그램",
    items: [
      {
        platform: "INSTAGRAM",
        platformLabel: "인스타그램",
        contentType: "instagram_reels",
        label: "릴스",
        caption: "세로 숏폼",
        requiredFields: ["videoLength"],
        fields: [
          { key: "videoLength", label: "영상 길이", placeholder: "예: 30초 이상" },
          { key: "maintainPeriod", label: "게시 유지", placeholder: "예: 30일" },
        ],
      },
      {
        platform: "INSTAGRAM",
        platformLabel: "인스타그램",
        contentType: "instagram_story",
        label: "스토리",
        caption: "컷 단위 노출",
        requiredFields: ["frameCount"],
        fields: [
          { key: "frameCount", label: "컷 수", placeholder: "예: 3컷 이상" },
          { key: "maintainPeriod", label: "게시 유지", placeholder: "예: 24시간" },
        ],
      },
      {
        platform: "INSTAGRAM",
        platformLabel: "인스타그램",
        contentType: "instagram_feed",
        label: "피드",
        caption: "이미지/캐러셀",
        requiredFields: ["photoCount"],
        fields: [
          { key: "photoCount", label: "사진 수", placeholder: "예: 5장 이상" },
          { key: "maintainPeriod", label: "게시 유지", placeholder: "예: 3개월" },
        ],
      },
    ],
  },
  {
    platform: "YOUTUBE",
    label: "유튜브",
    items: [
      {
        platform: "YOUTUBE",
        platformLabel: "유튜브",
        contentType: "youtube_shorts",
        label: "쇼츠",
        caption: "세로 숏폼",
        requiredFields: ["videoLength"],
        fields: [
          { key: "videoLength", label: "영상 길이", placeholder: "예: 45초 이상" },
          { key: "maintainPeriod", label: "게시 유지", placeholder: "예: 3개월" },
        ],
      },
      {
        platform: "YOUTUBE",
        platformLabel: "유튜브",
        contentType: "youtube_longform",
        label: "롱폼",
        caption: "일반 영상",
        requiredFields: ["videoLength"],
        fields: [
          { key: "videoLength", label: "영상 길이", placeholder: "예: 5분 이상" },
          { key: "maintainPeriod", label: "게시 유지", placeholder: "예: 6개월" },
        ],
      },
    ],
  },
  {
    platform: "TIKTOK",
    label: "틱톡",
    items: [
      {
        platform: "TIKTOK",
        platformLabel: "틱톡",
        contentType: "tiktok_shortform",
        label: "숏폼",
        caption: "세로 영상",
        requiredFields: ["videoLength"],
        fields: [
          { key: "videoLength", label: "영상 길이", placeholder: "예: 30초 이상" },
          { key: "maintainPeriod", label: "게시 유지", placeholder: "예: 30일" },
        ],
      },
    ],
  },
  {
    platform: "NAVER_BLOG",
    label: "네이버 블로그",
    items: [
      {
        platform: "NAVER_BLOG",
        platformLabel: "네이버 블로그",
        contentType: "naver_blog_review",
        label: "원고",
        caption: "텍스트/사진 리뷰",
        requiredFields: ["wordCount", "photoCount"],
        fields: [
          { key: "wordCount", label: "글자수", placeholder: "예: 1,500자 이상" },
          { key: "photoCount", label: "사진 수", placeholder: "예: 8장 이상" },
          {
            key: "maintainPeriod",
            label: "게시 유지",
            placeholder: "예: 6개월",
            fullWidth: true,
          },
        ],
      },
    ],
  },
  {
    platform: "OTHER",
    label: "기타",
    items: [
      {
        platform: "OTHER",
        platformLabel: "기타",
        contentType: "other",
        label: "직접 입력",
        caption: "플랫폼/콘텐츠 직접 지정",
        requiredFields: ["platformName", "contentName", "note"],
        fields: [
          { key: "platformName", label: "플랫폼", placeholder: "예: 커뮤니티" },
          { key: "contentName", label: "콘텐츠", placeholder: "예: 게시글" },
          {
            key: "note",
            label: "조건",
            placeholder: "예: 본문 800자 이상, 이미지 3장",
            fullWidth: true,
          },
          {
            key: "maintainPeriod",
            label: "게시 유지",
            placeholder: "예: 30일",
            fullWidth: true,
          },
        ],
      },
    ],
  },
];

const INITIAL_DRAFT: ContractDraft = {
  advertiserName: "",
  advertiserManager: "",
  title: "",
  type: "협찬",
  influencerName: "",
  influencerUrl: "",
  influencerContact: "",
  selectedDeliverables: [],
  deliverableRequirements: {},
  campaignStart: "",
  campaignEnd: "",
  uploadDueDate: "",
  reviewDueDate: "",
  revisionLimit: "",
  revisionRequestPolicy:
    "수정 요청은 계약서에 적힌 광고표시, 필수 해시태그, 링크, 일정, 콘텐츠 형식 조건에 한정합니다.",
  disclosureText: "콘텐츠 제목 또는 본문 첫 부분에 '유료광고' 또는 '#광고'를 명확히 표시",
  trackingLink: "",
  referenceLinks: "",
  requiredHashtags: "",
  brandAccountTags: "",
  contentFileRequirement: "게시물 캡처, 블로그 PDF, 스토리 캡처 등 광고주가 확인할 수 있는 파일",
  contentUsageAllowed: false,
  contentUsageChannels: "",
  contentUsagePeriod: "",
  contentUsageEditAllowed: false,
  exclusivity: "",
  paymentMethod: "external_bank_transfer",
  withholdingTaxEnabled: true,
  payment: "",
  customClauses: [],
  newClauseCategory: "",
  newClauseContent: "",
};

const DEFAULT_CONTRACT_TITLE_EXAMPLE =
  "루트코스메틱 수분크림 인스타 릴스 협찬";

const isBlank = (value?: string) => !value || value.trim().length === 0;
const REQUIRED_DISCLOSURE_PATTERN = /광고|유료|협찬|대가|sponsored|ad/i;

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const splitCommaSeparated = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const splitLineSeparated = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const paymentMethodLabels: Record<ContractDraft["paymentMethod"], string> = {
  external_bank_transfer: "외부 계좌입금",
  advertiser_direct: "광고주 직접 지급",
  other_direct: "기타 직접 정산",
};

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

function parseContractDate(value?: string) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatContractDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function getContractCalendarMonth(value?: string) {
  const date = parseContractDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addContractCalendarMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatContractCalendarMonthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatContractDateButtonLabel(value: string) {
  const date = parseContractDate(value);
  if (!date) return value;
  return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}. ${String(date.getDate()).padStart(2, "0")}.`;
}

function getContractCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: Array<Date | null> = Array.from(
    { length: firstDay.getDay() },
    () => null,
  );
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

const ALL_DELIVERABLE_OPTIONS = PLATFORM_CONTENT_GROUPS.flatMap((group) => group.items);

const defaultDeliverableByPlatform: Record<
  ContractPlatform,
  ContractDeliverableContentType
> = {
  INSTAGRAM: "instagram_reels",
  YOUTUBE: "youtube_shorts",
  TIKTOK: "tiktok_shortform",
  NAVER_BLOG: "naver_blog_review",
  OTHER: "other",
};

const getDeliverableOption = (contentType: ContractDeliverableContentType) =>
  ALL_DELIVERABLE_OPTIONS.find((option) => option.contentType === contentType);

const getSelectedDeliverableOptions = (draft: ContractDraft) =>
  draft.selectedDeliverables
    .map((contentType) => getDeliverableOption(contentType))
    .filter((option): option is DeliverableOption => Boolean(option));

const getRequirementValue = (
  requirements: ContractDeliverableRequirementDetail | undefined,
  key: DeliverableRequirementField,
) => requirements?.[key]?.trim() ?? "";

const buildRequirementText = (
  option: DeliverableOption,
  requirements: ContractDeliverableRequirementDetail | undefined,
) => {
  const parts = option.fields
    .filter((field) => field.key !== "platformName" && field.key !== "contentName")
    .map((field) => {
      const value = getRequirementValue(requirements, field.key);
      return value ? `${field.label} ${value}` : "";
    })
    .filter(Boolean);

  return parts.join(", ");
};

const getDeliverableItems = (draft: ContractDraft): ContractDeliverableItem[] =>
  getSelectedDeliverableOptions(draft).map((option, index) => {
    const requirements = draft.deliverableRequirements[option.contentType] ?? {};
    const customPlatform = getRequirementValue(requirements, "platformName");
    const customContent = getRequirementValue(requirements, "contentName");
    const platformLabel =
      option.platform === "OTHER" && customPlatform ? customPlatform : option.platformLabel;
    const contentLabel =
      option.contentType === "other" && customContent ? customContent : option.label;

    return {
      id: `${option.platform}:${option.contentType}:${index + 1}`,
      platform: option.platform,
      platformLabel,
      contentType: option.contentType,
      contentLabel,
      requirements,
      requirementText: buildRequirementText(option, requirements),
    };
  });

const getSelectedPlatforms = (draft: ContractDraft): ContractPlatform[] =>
  Array.from(new Set(getDeliverableItems(draft).map((item) => item.platform)));

const buildContractClauses = (draft: ContractDraft): Clause[] => {
  const clauses: Clause[] = [];
  const referenceLinks = splitLineSeparated(draft.referenceLinks);
  const deliverables = getDeliverableItems(draft)
    .map(
      (item) =>
        `- ${item.platformLabel} ${item.contentLabel}: ${
          item.requirementText || "조건 입력 필요"
        }`,
    );

  if (deliverables.length > 0) {
    clauses.push({
      clause_id: "draft_deliverables",
      category: "플랫폼 및 콘텐츠 조건",
      content: `본 계약에 따라 인플루언서는 다음 플랫폼과 콘텐츠 조건에 맞춰 제작 및 게시해야 한다:\n${deliverables.join(
        "\n",
      )}`,
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  if (
    draft.campaignStart ||
    draft.campaignEnd ||
    draft.uploadDueDate ||
    draft.reviewDueDate ||
    draft.revisionLimit
  ) {
    clauses.push({
      clause_id: "draft_schedule",
      category: "캠페인 일정 및 검수",
      content: [
        `캠페인 기간: ${draft.campaignStart || "입력 필요"} ~ ${
          draft.campaignEnd || "입력 필요"
        }`,
        `콘텐츠 제출 마감: ${draft.uploadDueDate || "입력 필요"}`,
        `광고주 검수 회신 기한: ${draft.reviewDueDate || "입력 필요"}`,
        `수정 가능 횟수: ${draft.revisionLimit || "입력 필요"}`,
        `수정 요청 기준: ${draft.revisionRequestPolicy || "입력 필요"}`,
        "광고주는 계약서에 명시된 조건의 누락, 오류, 광고표시 미흡, 필수 링크·태그 누락 등 객관적으로 확인 가능한 사유에 따라 수정 요청할 수 있다. 단순 취향이나 사후 변경 목적의 반복 수정 요청은 당사자 간 추가 합의가 필요하다.",
      ].join("\n"),
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  if (draft.disclosureText || draft.trackingLink || referenceLinks.length > 0) {
    clauses.push({
      clause_id: "draft_disclosure",
      category: "광고 표시 및 추적 조건",
      content: [
        `광고 표시 문구: ${draft.disclosureText || "입력 필요"}`,
        "광고주와 인플루언서는 경제적 이해관계가 소비자에게 명확히 인식되도록 콘텐츠의 제목, 본문 첫 부분, 영상 설명 또는 플랫폼상 쉽게 확인 가능한 위치에 광고 표시를 유지해야 한다.",
        "플랫폼 정책이나 관계 법령상 더 엄격한 표시가 필요한 경우 그 기준을 우선 적용한다.",
        draft.trackingLink ? `필수 추적 링크: ${draft.trackingLink}` : "",
        referenceLinks.length > 0
          ? `광고주 제공 레퍼런스: ${referenceLinks.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  clauses.push({
    clause_id: "draft_content_submission_review",
    category: "콘텐츠 제출 및 검수 조건",
    content: [
      "인플루언서는 콘텐츠 게시 후 광고주가 확인할 수 있는 콘텐츠 URL을 제출해야 한다. 광고주가 요구한 경우 게시물 캡처, 블로그 PDF, 스토리 캡처 등 파일을 함께 제출해야 한다. 광고주는 콘텐츠 URL, 광고표시 문구, 필수 해시태그, 브랜드 계정 태그, 게시일, 콘텐츠 형식별 조건을 확인할 수 있다. 제출된 콘텐츠에 누락 또는 오류가 있는 경우 광고주는 수정 요청 또는 반려를 할 수 있다. 광고주가 콘텐츠를 승인하면 해당 광고 계약은 마감 처리할 수 있다.",
      draft.requiredHashtags.trim()
        ? `필수 해시태그: ${splitCommaSeparated(draft.requiredHashtags).join(", ")}`
        : "",
      draft.brandAccountTags.trim()
        ? `브랜드 계정 태그: ${splitCommaSeparated(draft.brandAccountTags).join(", ")}`
        : "",
      draft.contentFileRequirement.trim()
        ? `함께 제출할 파일: ${draft.contentFileRequirement.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    status: "PENDING_REVIEW",
    history: [],
  });

  clauses.push({
    clause_id: "draft_content_usage",
    category: "콘텐츠 활용권",
    content: [
      "광고주는 본 계약에서 선택한 범위 내에서 인플루언서가 제작한 콘텐츠를 사용할 수 있다. 사용 가능 채널, 사용 기간, 2차 편집 가능 여부는 본 계약에서 정한 조건에 따른다. 본 계약에 명시되지 않은 활용은 당사자 간 별도 합의가 필요하다.",
      `활용 허용 여부: ${draft.contentUsageAllowed ? "허용" : "별도 합의 필요"}`,
      draft.contentUsageChannels.trim()
        ? `사용 가능 채널: ${splitCommaSeparated(draft.contentUsageChannels).join(", ")}`
        : "",
      draft.contentUsagePeriod.trim()
        ? `사용 기간: ${draft.contentUsagePeriod.trim()}`
        : "",
      `2차 편집 가능 여부: ${draft.contentUsageEditAllowed ? "가능" : "불가"}`,
    ]
      .filter(Boolean)
      .join("\n"),
    status: "PENDING_REVIEW",
    history: [],
  });

  clauses.push({
    clause_id: "draft_creator_ip_responsibility",
    category: "저작권 및 제3자 권리 책임",
    content:
      "인플루언서는 콘텐츠 제작 과정에서 사용하는 이미지, 영상, 음악, 폰트, 초상, 상표, 장소 촬영물 등 제3자의 권리를 침해하지 않도록 필요한 권리 확인과 사용 허락을 받아야 한다. 인플루언서가 임의로 사용한 자료 또는 권리 미확보로 분쟁, 삭제 요청, 손해배상, 행정 제재가 발생한 경우 그 책임은 해당 자료를 사용한 인플루언서에게 있다. 다만 광고주가 특정 자료의 사용을 직접 제공하거나 지시한 경우 그 자료 사용 권한에 대한 책임은 광고주에게 있다.",
    status: "PENDING_REVIEW",
    history: [],
  });

  if (draft.exclusivity) {
    clauses.push({
      clause_id: "draft_exclusivity",
      category: "경쟁사 배제",
      content: `업로드 후 다음 조건에 따라 동종 업계의 타 브랜드 광고를 진행하지 아니한다: ${draft.exclusivity}`,
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  if (draft.payment) {
    clauses.push({
      clause_id: "draft_payment",
      category: "대가 지급",
      content: [
        `본 계약의 대가로 광고주는 인플루언서에게 다음과 같이 지급한다: ${draft.payment}`,
        `지급 방식: ${paymentMethodLabels[draft.paymentMethod]}`,
        draft.withholdingTaxEnabled
          ? "개인 인플루언서에게 인적용역 대가로 지급하는 경우 3.3% 원천징수 및 소득신고 적용 여부와 처리 주체는 당사자가 직접 확인하여 이행한다."
          : "원천징수 또는 소득신고가 필요한 지급인지 여부는 당사자가 직접 확인하여 이행한다.",
        "연락미는 계약서 작성, 전자서명, 증빙 보관 도구를 제공하며 광고비 지급대행, 에스크로, 세금 신고, 원천징수 이행을 대행하지 않는다.",
      ].join("\n"),
      status: "PENDING_REVIEW",
      history: [],
    });
  }

  draft.customClauses.forEach((clause) => {
    clauses.push({
      clause_id: clause.id,
      category: clause.category || "기타 특약",
      content: clause.content,
      status: "PENDING_REVIEW",
      history: [],
    });
  });

  return clauses;
};

const validateContractDraft = (draft: ContractDraft): ValidationError[] => {
  const errors: ValidationError[] = [];

  const requireField = (step: StepId, field: string, value: string, message: string) => {
    if (isBlank(value)) errors.push({ step, field, message });
  };

  requireField(2, "advertiserName", draft.advertiserName, "광고주 사업자명을 입력하세요.");
  requireField(2, "title", draft.title, "계약 건명을 입력하세요.");
  requireField(2, "influencerName", draft.influencerName, "인플루언서명 또는 채널명을 입력하세요.");
  requireField(2, "influencerUrl", draft.influencerUrl, "메인 채널 URL을 입력하세요.");
  requireField(2, "influencerContact", draft.influencerContact, "연락처를 입력하세요.");

  if (
    !isBlank(draft.influencerContact) &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.influencerContact.trim())
  ) {
    errors.push({
      step: 2,
      field: "influencerContact",
      message: "서명 계정 확인을 위해 인플루언서 이메일을 입력하세요.",
    });
  }

  if (!isBlank(draft.influencerUrl) && !isHttpUrl(draft.influencerUrl)) {
    errors.push({
      step: 2,
      field: "influencerUrl",
      message: "메인 채널 URL은 http 또는 https 주소여야 합니다.",
    });
  }

  if (!isBlank(draft.trackingLink) && !isHttpUrl(draft.trackingLink)) {
    errors.push({
      step: 3,
      field: "trackingLink",
      message: "추적 링크는 http 또는 https 주소만 입력할 수 있습니다.",
    });
  }

  splitLineSeparated(draft.referenceLinks).forEach((link) => {
    if (!isHttpUrl(link)) {
      errors.push({
        step: 3,
        field: "referenceLinks",
        message: "레퍼런스 링크는 http 또는 https 주소만 입력할 수 있습니다.",
      });
    }
  });

  const deliverables = getDeliverableItems(draft);
  if (deliverables.length === 0) {
    errors.push({
      step: 1,
      field: "selectedDeliverables",
      message: "계약에 포함할 플랫폼과 콘텐츠를 최소 1개 선택하세요.",
    });
  }

  getSelectedDeliverableOptions(draft).forEach((option) => {
    const requirements = draft.deliverableRequirements[option.contentType];
    option.requiredFields.forEach((field) => {
      const fieldLabel =
        option.fields.find((item) => item.key === field)?.label ?? "조건";
      requireField(
        1,
        `${option.contentType}.${field}`,
        getRequirementValue(requirements, field),
        `${option.platformLabel} ${option.label} ${fieldLabel}을 입력하세요.`,
      );
    });
  });

  requireField(3, "campaignStart", draft.campaignStart, "캠페인 시작일을 입력하세요.");
  requireField(3, "campaignEnd", draft.campaignEnd, "캠페인 종료일을 입력하세요.");
  requireField(3, "uploadDueDate", draft.uploadDueDate, "콘텐츠 제출 마감일을 입력하세요.");
  requireField(3, "reviewDueDate", draft.reviewDueDate, "광고주 검수 회신 기한을 입력하세요.");
  requireField(3, "revisionLimit", draft.revisionLimit, "수정 가능 횟수를 입력하세요.");
  requireField(3, "revisionRequestPolicy", draft.revisionRequestPolicy, "수정 요청 기준을 입력하세요.");
  requireField(3, "payment", draft.payment, "지급 조건을 입력하세요.");
  requireField(3, "disclosureText", draft.disclosureText, "광고 표시 조건을 입력하세요.");

  if (
    !isBlank(draft.disclosureText) &&
    !REQUIRED_DISCLOSURE_PATTERN.test(draft.disclosureText)
  ) {
    errors.push({
      step: 3,
      field: "disclosureText",
      message: "광고 표시 조건에는 #광고, 유료광고, 협찬 등 대가 표시 문구가 포함되어야 합니다.",
    });
  }

  if (draft.campaignStart && draft.campaignEnd && draft.campaignEnd < draft.campaignStart) {
    errors.push({
      step: 3,
      field: "campaignEnd",
      message: "캠페인 종료일은 시작일 이후여야 합니다.",
    });
  }

  if (buildContractClauses(draft).length === 0) {
    errors.push({
      step: 5,
      field: "clauses",
      message: "계약서에 들어갈 조항이 없습니다.",
    });
  }

  return errors;
};

const buildWorkflow = (status: ContractStatus): Contract["workflow"] => {
  if (status === "DRAFT") {
    return {
      next_actor: "advertiser",
      next_action: "발송 전 확인에서 누락 조건을 점검하고 공유 링크를 생성하세요.",
      due_at: addDays(3),
      risk_level: "low",
      last_message: "계약 초안이 저장되었습니다.",
    };
  }

  return {
    next_actor: "influencer",
    next_action: "인플루언서 검토 응답을 기다리는 중입니다.",
    due_at: addDays(2),
    risk_level: "medium",
    last_message: "공유 링크가 발급되어 상대방 검토를 기다리고 있습니다.",
  };
};

function getAdvertiserVerificationBuilderCopy(
  status: VerificationStatus,
  isLoading: boolean,
  latest?: VerificationRequest,
) {
  if (isLoading) {
    return {
      label: "상태 확인 중",
      helper: "사업자 인증 상태를 확인하고 있습니다.",
      actionLabel: "인증 상태 보기",
    };
  }
  const rejectionGuidance =
    status === "rejected"
      ? getVerificationRejectionGuidance(latest, "advertiser_organization")
      : undefined;

  const copies: Record<
    VerificationStatus,
    { label: string; helper: string; actionLabel: string }
  > = {
    approved: {
      label: "인증 완료",
      helper: "계약 공유 링크를 생성하고 인플루언서에게 발송할 수 있습니다.",
      actionLabel: "인증 정보 보기",
    },
    pending: {
      label: "검수 중",
      helper: "인증 요청이 접수되었습니다. 검수 완료 전에는 초안 저장만 가능하고 공유 링크 발송은 차단됩니다.",
      actionLabel: "검수 상태 보기",
    },
    rejected: {
      label: "재제출 필요",
      helper: rejectionGuidance
        ? `반려 사유: ${rejectionGuidance.reviewerNote} 새 증빙으로 다시 제출해야 공유 링크를 발송할 수 있습니다.`
        : "반려 사유를 확인하고 새 증빙으로 다시 제출해야 공유 링크를 발송할 수 있습니다.",
      actionLabel: "재제출",
    },
    not_submitted: {
      label: "인증 필요",
      helper: "사업자 인증을 완료해야 인플루언서에게 공유 링크를 보낼 수 있습니다.",
      actionLabel: "사업자 인증하기",
    },
  };

  return copies[status];
}

const buildBuilderSupportMailtoHref = ({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) => {
  return `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
};

export function ContractBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const addContract = useAppStore((state) => state.addContract);
  const updateContract = useAppStore((state) => state.updateContract);
  const getContract = useAppStore((state) => state.getContract);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const syncError = useAppStore((state) => state.syncError);
  const resetHydration = useAppStore((state) => state.resetHydration);
  const { summary: verificationSummary, isLoading: isVerificationLoading } =
    useVerificationSummary({ role: "advertiser" });
  const advertiserVerificationStatus =
    verificationSummary?.advertiser.status ?? "not_submitted";
  const canSendContract = advertiserVerificationStatus === "approved";
  const verificationCopy = getAdvertiserVerificationBuilderCopy(
    advertiserVerificationStatus,
    isVerificationLoading,
    verificationSummary?.advertiser.latest_request,
  );
  const [selectedBrandId, setSelectedBrandId] = useState(() =>
    readSelectedAdvertiserBrandId(),
  );
  const [selectedBrand, setSelectedBrand] =
    useState<MarketplaceBrandProfile | null>(null);
  const advertiserDefaults = verificationSummary?.advertiser;
  const certifiedAdvertiserRequest =
    advertiserDefaults?.status === "approved"
      ? advertiserDefaults.latest_request
      : undefined;
  const defaultAdvertiserName = removeInternalTestLabel(
    certifiedAdvertiserRequest?.subject_name ||
      advertiserDefaults?.account?.company_name,
  );
  const defaultAdvertiserManager = removeInternalTestLabel(
    certifiedAdvertiserRequest?.submitted_by_name ||
      advertiserDefaults?.account?.name,
  );
  const advertiserAccountForHeader = {
    name: defaultAdvertiserName || "광고주 계정",
    email:
      advertiserDefaults?.latest_request?.submitted_by_email ||
      advertiserDefaults?.account?.email,
  };

  const [step, setStep] = useState<StepId>(1);
  const [draft, setDraft] = useState<ContractDraft>(INITIAL_DRAFT);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [savedContractId, setSavedContractId] = useState("");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isAddingPlatform, setIsAddingPlatform] = useState(false);
  const [addingContentPlatform, setAddingContentPlatform] = useState<ContractPlatform | "">("");
  const [pendingPlatform, setPendingPlatform] = useState<ContractPlatform | "">("");
  const [openDatePicker, setOpenDatePicker] = useState<string | null>(null);
  const [editedAdvertiserFields, setEditedAdvertiserFields] = useState({
    name: false,
    manager: false,
  });
  const [result, setResult] = useState<{
    mode: ResultMode;
    contractId?: string;
    stale?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCopyingLink, setIsCopyingLink] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [sourceProposalId, setSourceProposalId] = useState<string>();
  const [sourceProposalContractId, setSourceProposalContractId] =
    useState<string>();
  const [proposalLoadError, setProposalLoadError] = useState<string>();
  const [isProposalLoading, setIsProposalLoading] = useState(false);
  const loadedProposalRef = useRef<string>();
  const isProposalPartyLocked = Boolean(sourceProposalId);

  useEffect(() => {
    const proposalId = new URLSearchParams(location.search).get("proposal")?.trim();
    if (!proposalId || loadedProposalRef.current === proposalId) return;
    loadedProposalRef.current = proposalId;
    setIsProposalLoading(true);
    setProposalLoadError(undefined);

    void apiFetch(
      `/api/advertiser/marketplace/proposals/${encodeURIComponent(
        proposalId,
      )}/draft-context`,
      { headers: { Accept: "application/json" }, credentials: "include" },
    )
      .then(async (response) => {
        if (response.status === 401) {
          const next = encodeURIComponent(`${location.pathname}${location.search}`);
          navigate(`/login/advertiser?next=${next}`, { replace: true });
          return undefined;
        }
        const data = (await response.json().catch(() => ({}))) as
          MarketplaceProposalDraftContextResponse;
        if (!response.ok) {
          throw new Error(data.error ?? "1:1 제안 내용을 불러오지 못했습니다.");
        }
        return data;
      })
      .then((data) => {
        if (!data) return;
        if (data.already_converted && data.converted_contract_id) {
          navigate(`/advertiser/contract/${data.converted_contract_id}`, {
            replace: true,
          });
          return;
        }
        if (!data.contract_id || !data.prefill) {
          throw new Error("1:1 제안 계약 정보가 올바르지 않습니다.");
        }

        const selectedDeliverables = Array.from(
          new Set(
            (data.prefill.platforms ?? ["OTHER"]).map(
              (platform) => defaultDeliverableByPlatform[platform] ?? "other",
            ),
          ),
        );
        setSourceProposalId(proposalId);
        setSourceProposalContractId(data.contract_id);
        if (data.prefill.brandId) {
          setSelectedBrandId(data.prefill.brandId);
          writeSelectedAdvertiserBrandId(data.prefill.brandId);
        }
        setDraft((current) => ({
          ...current,
          title: data.prefill?.title ?? current.title,
          type: data.prefill?.type ?? current.type,
          influencerName: data.prefill?.influencerName ?? current.influencerName,
          influencerUrl: data.prefill?.influencerUrl ?? current.influencerUrl,
          influencerContact:
            data.prefill?.influencerContact ?? current.influencerContact,
          selectedDeliverables,
          deliverableRequirements: Object.fromEntries(
            selectedDeliverables.map((contentType) => [contentType, {}]),
          ),
          customClauses: data.prefill?.proposalSummary
            ? [
                {
                  id: `marketplace_proposal_${proposalId}`,
                  category: "사전 제안 내용",
                  content: data.prefill.proposalSummary,
                },
              ]
            : current.customClauses,
        }));
      })
      .catch((error) => {
        setProposalLoadError(
          error instanceof Error
            ? error.message
            : "1:1 제안 내용을 불러오지 못했습니다.",
        );
      })
      .finally(() => setIsProposalLoading(false));
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    let active = true;
    const query = selectedBrandId
      ? `?brandId=${encodeURIComponent(selectedBrandId)}`
      : "";

    void apiFetch(`/api/advertiser/brands${query}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    })
      .then(async (response) => {
        if (response.status === 401) {
          navigate("/login/advertiser", { replace: true });
          return undefined;
        }
        const data = (await response.json().catch(() => ({}))) as
          | AdvertiserBrandsResponse
          | { error?: string };
        if (!response.ok || !("brand" in data)) return undefined;
        return data.brand ?? data.brands?.[0] ?? null;
      })
      .then((brand) => {
        if (!active || brand === undefined) return;
        setSelectedBrand(brand);
        if (brand?.id) {
          setSelectedBrandId(brand.id);
          writeSelectedAdvertiserBrandId(brand.id);
        }
      })
      .catch(() => {
        if (!active) return;
        setSelectedBrand(null);
      });

    return () => {
      active = false;
    };
  }, [navigate, selectedBrandId]);

  const draftWithAdvertiserDefaults = useMemo(
    () => ({
      ...draft,
      advertiserName: editedAdvertiserFields.name
        ? draft.advertiserName
        : draft.advertiserName || defaultAdvertiserName,
      advertiserManager: editedAdvertiserFields.manager
        ? draft.advertiserManager
        : draft.advertiserManager || defaultAdvertiserManager,
    }),
    [
      defaultAdvertiserManager,
      defaultAdvertiserName,
      draft,
      editedAdvertiserFields.manager,
      editedAdvertiserFields.name,
    ],
  );
  const clauses = useMemo(() => buildContractClauses(draft), [draft]);
  const allErrors = useMemo(
    () => validateContractDraft(draftWithAdvertiserDefaults),
    [draftWithAdvertiserDefaults],
  );
  const stepErrors = validationErrors.filter((error) => error.step === step);
  const currentStepHasBlockingError = allErrors.some((error) => error.step === step);
  const resultSaveState = result
    ? syncError
      ? "error"
      : isSyncing
        ? "syncing"
        : "ready"
    : undefined;

  const updateDraft = (
    updater: Partial<ContractDraft> | ((current: ContractDraft) => ContractDraft),
  ) => {
    setDraft((current) =>
      typeof updater === "function" ? updater(current) : { ...current, ...updater },
    );
    setValidationErrors([]);
    setResult((current) => (current?.mode === "share" ? { ...current, stale: true } : current));
  };

  const handleDeliverableSelect = (contentType: ContractDeliverableContentType) => {
    updateDraft((current) => {
      if (current.selectedDeliverables.includes(contentType)) return current;

      return {
        ...current,
        selectedDeliverables: [...current.selectedDeliverables, contentType],
        deliverableRequirements: {
          ...current.deliverableRequirements,
          [contentType]: current.deliverableRequirements[contentType] ?? {},
        },
      };
    });
    setIsAddingPlatform(false);
    setAddingContentPlatform("");
    setPendingPlatform("");
  };

  const handleDeliverableRemove = (contentType: ContractDeliverableContentType) => {
    updateDraft((current) => {
      const nextRequirements = { ...current.deliverableRequirements };
      delete nextRequirements[contentType];
      const selectedDeliverables = current.selectedDeliverables.filter(
        (item) => item !== contentType,
      );

      return {
        ...current,
        selectedDeliverables,
        deliverableRequirements: nextRequirements,
      };
    });
    const removedOption = getDeliverableOption(contentType);
    setAddingContentPlatform((current) =>
      current && current === removedOption?.platform ? "" : current,
    );
  };

  const handleDeliverableRequirementChange = (
    contentType: ContractDeliverableContentType,
    field: DeliverableRequirementField,
    value: string,
  ) => {
    updateDraft((current) => ({
      ...current,
      deliverableRequirements: {
        ...current.deliverableRequirements,
        [contentType]: {
          ...current.deliverableRequirements[contentType],
          [field]: value,
        },
      },
    }));
  };

  const addCustomClause = () => {
    if (!draft.newClauseContent.trim()) return;

    updateDraft((current) => ({
      ...current,
      customClauses: [
        ...current.customClauses,
        {
          id: `custom_${Date.now()}`,
          category: current.newClauseCategory.trim() || "기타 특약",
          content: current.newClauseContent.trim(),
        },
      ],
      newClauseCategory: "",
      newClauseContent: "",
    }));
  };

  const addTemplateClause = (type: "delivery" | "cs") => {
    const category =
      type === "delivery" ? "배송 및 파손 책임" : "고객 CS 및 교환/환불";
    const content =
      type === "delivery"
        ? "제품의 배송, 설치 및 회수 과정에서 발생하는 파손의 책임은 공급사 또는 광고주가 부담한다."
        : "제품의 AS 및 불량 문제로 인한 교환/환불 응대는 광고주가 정한 담당 창구에서 처리한다.";

    updateDraft((current) => {
      const exists = current.customClauses.some(
        (clause) => clause.category === category && clause.content === content,
      );
      if (exists) return current;

      return {
        ...current,
        customClauses: [
          ...current.customClauses,
          { id: `template_${type}`, category, content },
        ],
      };
    });
  };

  const removeCustomClause = (id: string) => {
    updateDraft((current) => ({
      ...current,
      customClauses: current.customClauses.filter((clause) => clause.id !== id),
    }));
  };

  const goNext = () => {
    const nextErrors = validateContractDraft(draftWithAdvertiserDefaults).filter(
      (error) => error.step === step,
    );

    if (nextErrors.length > 0) {
      setValidationErrors(nextErrors);
      return;
    }

    setValidationErrors([]);
    setStep((current) => Math.min(current + 1, 5) as StepId);
  };

  const goBack = () => {
    setValidationErrors([]);
    setStep((current) => Math.max(current - 1, 1) as StepId);
  };

  const buildContractPayload = (
    status: ContractStatus,
    sourceDraft: ContractDraft,
  ): Omit<Contract, "id" | "created_at" | "updated_at"> => {
    const draft = sourceDraft;
    const deliverableItems = getDeliverableItems(draft);

    return {
      advertiser_id: "adv_1",
      brand_profile_id: (selectedBrand?.id ?? selectedBrandId) || undefined,
      campaign_name: draft.title.trim(),
      advertiser_info: {
        name: draft.advertiserName.trim(),
        manager: draft.advertiserManager.trim() || undefined,
      },
      title: draft.title.trim(),
      type: draft.type,
      status,
      influencer_info: {
        name: draft.influencerName.trim(),
        channel_url: draft.influencerUrl.trim(),
        contact: draft.influencerContact.trim(),
      },
      campaign: {
        source: sourceProposalId ? "direct" : undefined,
        source_application_id: sourceProposalId,
        budget: draft.payment.trim(),
        start_date: draft.campaignStart,
        end_date: draft.campaignEnd,
        upload_due_at: draft.uploadDueDate,
        review_due_at: draft.reviewDueDate,
        revision_limit: draft.revisionLimit.trim(),
        revision_request_policy: draft.revisionRequestPolicy.trim(),
        disclosure_text: draft.disclosureText.trim(),
        tracking_link: draft.trackingLink.trim() || undefined,
        reference_links: splitLineSeparated(draft.referenceLinks),
        payment_method: draft.paymentMethod,
        withholding_tax_enabled: draft.withholdingTaxEnabled,
        period:
          draft.campaignStart && draft.campaignEnd
            ? `${draft.campaignStart} - ${draft.campaignEnd}`
            : undefined,
        platforms: getSelectedPlatforms(draft),
        deliverable_items: deliverableItems,
        deliverables: deliverableItems.map(
          (item) =>
            `${item.platformLabel} ${item.contentLabel}${
              item.requirementText ? ` / ${item.requirementText}` : ""
            }`,
        ),
        required_hashtags: splitCommaSeparated(draft.requiredHashtags),
        brand_account_tags: splitCommaSeparated(draft.brandAccountTags),
        content_submission: {
          url_required: true,
          file_required: Boolean(draft.contentFileRequirement.trim()),
          file_examples: draft.contentFileRequirement.trim() || undefined,
          review_scope:
            "콘텐츠 URL, 광고표시 문구, 필수 해시태그, 브랜드 계정 태그, 게시일, 콘텐츠 형식별 조건",
        },
        content_usage: {
          allowed: draft.contentUsageAllowed,
          channels: splitCommaSeparated(draft.contentUsageChannels),
          period: draft.contentUsagePeriod.trim() || undefined,
          edit_allowed: draft.contentUsageEditAllowed,
        },
      },
      workflow: buildWorkflow(status),
      evidence: {
        share_token_status: status === "DRAFT" ? "not_issued" : "active",
        share_token: undefined,
        share_token_expires_at: undefined,
        audit_ready: status !== "DRAFT",
        pdf_status: status === "DRAFT" ? "not_ready" : "draft_ready",
      },
      audit_events: [],
      clauses,
    };
  };

  const saveContract = (mode: ResultMode) => {
    if (mode === "share" && !canSendContract) {
      setStep(5);
      setValidationErrors([
        {
          field: "advertiser_verification",
          message: "사업자 인증 승인 후 계약을 발송할 수 있습니다.",
          step: 5,
        },
      ]);
      return;
    }

    const draftToSave = draftWithAdvertiserDefaults;
    const errors = validateContractDraft(draftToSave);

    if (errors.length > 0) {
      setValidationErrors(errors);
      setStep(errors[0].step);
      return;
    }

    const status: ContractStatus = mode === "draft" ? "DRAFT" : "REVIEWING";
    const existing = savedContractId ? getContract(savedContractId) : undefined;
    const payload = buildContractPayload(status, draftToSave);
    const now = new Date().toISOString();
    const event = {
      id: sourceProposalId
        ? `marketplace_proposal_${sourceProposalId}_draft_saved`
        : `audit_${Date.now()}`,
      actor: "advertiser" as const,
      action: mode === "draft" ? "draft_saved" : "share_link_issued",
      description:
        mode === "draft"
          ? "광고주가 계약 초안을 저장했습니다."
          : "광고주가 발송 전 확인을 마치고 공유 링크를 생성했습니다.",
      created_at: now,
    };

    let contractId = existing?.id;
    if (existing) {
      updateContract(existing.id, {
        ...payload,
        audit_events: [...(existing.audit_events ?? []), event],
      });
    } else {
      const created = addContract({
        ...payload,
        ...(sourceProposalContractId ? { id: sourceProposalContractId } : {}),
        audit_events: [event],
      });
      contractId = created.id;
      setSavedContractId(created.id);
    }

    setCopyError("");
    setResult({
      mode,
      contractId: mode === "share" ? contractId : undefined,
      stale: false,
    });
  };

  const copyToClipboard = async () => {
    if (
      !result?.contractId ||
      result.stale ||
      isSyncing ||
      syncError ||
      isCopyingLink
    ) {
      return;
    }
    setIsCopyingLink(true);
    setCopyError("");
    try {
      const response = await apiFetch(
        `/api/contracts/${encodeURIComponent(result.contractId)}/share-link/reveal`,
        {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        share_url?: string;
        error?: string;
      };
      if (!response.ok || !payload.share_url) {
        throw new Error(payload.error || "계약서 링크를 확인하지 못했습니다.");
      }
      await navigator.clipboard.writeText(payload.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      setCopyError(
        error instanceof Error
          ? error.message
          : "계약서 링크를 확인하지 못했습니다.",
      );
    } finally {
      setIsCopyingLink(false);
    }
  };
  const handleLogout = async () => {
    try {
      await apiFetch("/api/advertiser/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.warn(`[${PRODUCT_NAME}] advertiser logout request failed`, error);
    } finally {
      finishFastLoginTransition("advertiser");
      clearAdvertiserSessionCache();
      clearAdvertiserDashboardBootstrapPreload();
      clearVerificationSummaryCache("advertiser");
      clearMarketplaceMessageSummaryCache("advertiser");
      resetHydration();
      navigate("/login/advertiser", { replace: true });
    }
  };
  const selectedDeliverableSet = new Set(draft.selectedDeliverables);
  const selectedPlatformGroups = PLATFORM_CONTENT_GROUPS.map((group) => ({
    ...group,
    selectedItems: group.items.filter((item) =>
      selectedDeliverableSet.has(item.contentType),
    ),
    remainingItems: group.items.filter(
      (item) => !selectedDeliverableSet.has(item.contentType),
    ),
  })).filter((group) => group.selectedItems.length > 0);
  const selectedPlatformSet = new Set(
    selectedPlatformGroups.map((group) => group.platform),
  );
  const availablePlatformGroups = PLATFORM_CONTENT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !selectedDeliverableSet.has(item.contentType)),
  })).filter((group) => {
    if (selectedPlatformSet.has(group.platform)) return false;
    return group.items.length > 0;
  });
  const pendingContentOptions =
    availablePlatformGroups.find((group) => group.platform === pendingPlatform)
      ?.items ?? [];
  const showAddPlatformForm =
    draft.selectedDeliverables.length === 0 || isAddingPlatform;
  const canAddPlatform = availablePlatformGroups.length > 0;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#f4f5f2] font-sans text-neutral-950">
      <header className="z-10 shrink-0 border-b border-neutral-200/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-between px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            onClick={() => navigate("/advertiser/dashboard")}
            className="yl-brand-action -ml-1 flex h-10 min-w-10 shrink-0 items-center gap-3 rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950"
          >
            <LogoMark />
            <span className="font-neo-heavy text-[18px] leading-none text-neutral-950">
              {PRODUCT_NAME}
            </span>
          </button>
          <div className="ml-2 flex min-w-0 items-center justify-end gap-1.5 sm:ml-3 sm:gap-2">
            <button
              type="button"
              onClick={() => navigate("/advertiser/dashboard")}
              className="yl-header-action yl-header-action-secondary"
              aria-label="대시보드"
              title="대시보드"
            >
              <span className="hidden sm:inline">대시보드</span>
              <span className="sm:hidden">홈</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="yl-header-action yl-header-action-secondary"
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
            <BuilderAccountSettingsMenu
              account={advertiserAccountForHeader}
              open={accountMenuOpen}
              onToggle={() => setAccountMenuOpen((current) => !current)}
              onClose={() => setAccountMenuOpen(false)}
              onChangePassword={() => {
                setAccountMenuOpen(false);
                navigate("/reset-password?role=advertiser");
              }}
              onOpenBusinessVerification={() => {
                setAccountMenuOpen(false);
                navigate("/advertiser/verification");
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 grid-cols-1 overflow-hidden px-3 pb-3 sm:px-5 lg:grid-cols-[minmax(400px,500px)_minmax(0,1fr)] lg:gap-4 lg:px-6 lg:pb-5 xl:grid-cols-[188px_minmax(400px,480px)_minmax(460px,1fr)]">
        <aside className="relative z-10 hidden min-h-0 flex-col gap-8 overflow-y-auto border border-neutral-200/90 bg-white p-4 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_46px_rgba(23,26,23,0.05)] xl:mt-5 xl:flex xl:rounded-[10px]">
          <div>
            <h3 className="mb-5 px-2 text-[11px] font-extrabold text-neutral-950">
              작성 순서
            </h3>
            <nav className="relative space-y-2">
              {STEPS.map((item) => (
                <div
                  key={item.s}
                  className={`relative z-10 flex h-11 items-center gap-2 rounded-[10px] px-2 transition-all duration-200 ${
                    step === item.s
                      ? "bg-neutral-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)]"
                      : step > item.s
                        ? "bg-neutral-50 text-neutral-900"
                        : "text-neutral-400 hover:bg-neutral-50"
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold transition-all duration-200 ${
                      step === item.s
                        ? "bg-white text-neutral-950"
                        : step > item.s
                          ? "bg-neutral-900 text-white"
                          : "border border-neutral-200 bg-white text-neutral-300"
                    }`}
                  >
                    {step > item.s ? <Check strokeWidth={3} className="h-3 w-3" /> : item.s}
                  </div>
                  <span className={`truncate text-[13px] ${step === item.s ? "font-extrabold" : "font-bold"}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <section className="contract-builder-surface relative z-0 min-h-0 w-full overflow-hidden bg-transparent">
          <div className="mx-auto flex h-full max-w-[540px] flex-col p-6 md:p-10 lg:px-1 lg:py-5">
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto scroll-pb-28 pb-4 pr-1 lg:scroll-pb-10 lg:pb-2 lg:pr-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                  {step} / 5 단계
                </p>
                <ScreenHelpButton
                  content={SCREEN_HELP_CONTENT.contractBuilder}
                  className="lg:hidden"
                />
              </div>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h1 className="font-neo-heavy text-[28px] leading-[1.18] text-neutral-950 lg:text-[30px]">
                  새 전자계약서 작성
                </h1>
                <ScreenHelpButton
                  content={SCREEN_HELP_CONTENT.contractBuilder}
                  className="mt-0.5 hidden lg:inline-flex"
                />
              </div>
              <p className="mb-5 text-[13px] font-semibold leading-5 text-neutral-500">
                조건 입력 후 검토 링크를 생성합니다.
              </p>

              {isProposalLoading ? (
                <div className="mb-4 rounded-[8px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-[12px] font-bold text-blue-700">
                  수락된 1:1 제안 내용을 불러오는 중입니다.
                </div>
              ) : proposalLoadError ? (
                <div className="mb-4 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-bold leading-5 text-rose-700">
                  {proposalLoadError}
                </div>
              ) : sourceProposalId ? (
                <div className="mb-4 rounded-[8px] border border-blue-100 bg-blue-50 px-3 py-2.5 text-[12px] font-bold text-blue-700">
                  수락된 1:1 제안에서 계약서를 작성하고 있습니다.
                </div>
              ) : null}

              {stepErrors.length > 0 && <ValidationSummary errors={stepErrors} />}

              <div className="space-y-5">
              {step === 2 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-4">
                  <div>
                    <Label>계약 유형</Label>
                    <Select
                      value={draft.type}
                      onValueChange={(value) =>
                        updateDraft({ type: value as ContractType })
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="협찬">제품 협찬</SelectItem>
                        <SelectItem value="PPL">유료 광고 (PPL)</SelectItem>
                        <SelectItem value="공동구매">공동구매</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>광고주 사업자명</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 주식회사 연락미"
                      value={draftWithAdvertiserDefaults.advertiserName}
                      onChange={(event) => {
                        setEditedAdvertiserFields((current) => ({
                          ...current,
                          name: true,
                        }));
                        updateDraft({ advertiserName: event.target.value });
                      }}
                    />
                  </div>

                  <div>
                    <Label>담당자명</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 김마케팅 매니저"
                      value={draftWithAdvertiserDefaults.advertiserManager}
                      onChange={(event) => {
                        setEditedAdvertiserFields((current) => ({
                          ...current,
                          manager: true,
                        }));
                        updateDraft({ advertiserManager: event.target.value });
                      }}
                    />
                  </div>

                  <div>
                    <Label>계약 건명</Label>
                    <Input
                      className="mt-1.5"
                      placeholder={`예: ${DEFAULT_CONTRACT_TITLE_EXAMPLE}`}
                      value={draft.title}
                      onChange={(event) => updateDraft({ title: event.target.value })}
                    />
                  </div>

                  <div className="border-t border-neutral-100 pt-3">
                    <h3 className="mb-3 text-sm font-medium">인플루언서 정보</h3>
                    <div className="space-y-3">
                      <div>
                        <Label>성명 또는 채널명</Label>
                        <Input
                          className={`mt-1.5 ${
                            isProposalPartyLocked
                              ? "cursor-default bg-neutral-50 text-neutral-700"
                              : ""
                          }`}
                          placeholder="예: 뷰티온에어"
                          value={draft.influencerName}
                          readOnly={isProposalPartyLocked}
                          title={
                            isProposalPartyLocked
                              ? "제안 상대의 등록 정보"
                              : undefined
                          }
                          onChange={(event) =>
                            updateDraft({ influencerName: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>메인 채널 URL</Label>
                        <Input
                          className={`mt-1.5 ${
                            isProposalPartyLocked
                              ? "cursor-default bg-neutral-50 text-neutral-700"
                              : ""
                          }`}
                          placeholder="https://instagram.com/..."
                          value={draft.influencerUrl}
                          readOnly={isProposalPartyLocked}
                          title={
                            isProposalPartyLocked
                              ? "제안 상대의 등록 정보"
                              : undefined
                          }
                          onChange={(event) =>
                            updateDraft({ influencerUrl: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>연락처</Label>
                        <Input
                          className={`mt-1.5 ${
                            isProposalPartyLocked
                              ? "cursor-default bg-neutral-50 text-neutral-700"
                              : ""
                          }`}
                          placeholder="creator@brand.co.kr"
                          value={draft.influencerContact}
                          readOnly={isProposalPartyLocked}
                          title={
                            isProposalPartyLocked
                              ? "제안 상대의 등록 정보"
                              : undefined
                          }
                          onChange={(event) =>
                            updateDraft({ influencerContact: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {step === 1 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label className="mb-3 block">대상 플랫폼 및 콘텐츠</Label>
                    <div className="space-y-3">
                      {selectedPlatformGroups.map((group) => (
                        <div
                          key={group.platform}
                          className="rounded-[14px] border border-neutral-900 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                        >
                          <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-2.5">
                            <p className="text-sm font-extrabold text-neutral-950">
                              {group.label}
                            </p>
                            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-neutral-950 px-2 text-[11px] font-extrabold text-white">
                              {group.selectedItems.length}
                            </span>
                          </div>

                          <div className="space-y-2 border-t border-neutral-200 px-3 pb-3 pt-3">
                            {group.selectedItems.map((item, itemIndex) => {
                              const requirement =
                                draft.deliverableRequirements[item.contentType];

                              return (
                                <div
                                  key={item.contentType}
                                  className="rounded-[10px] border border-neutral-200 bg-neutral-50/70"
                                >
                                  <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-[13px] font-extrabold text-neutral-950">
                                        {item.label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                                        {item.caption}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-[11px] font-extrabold text-neutral-900">
                                        {itemIndex + 1}
                                      </span>
                                      <button
                                        type="button"
                                        className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
                                        aria-label={`${item.platformLabel} ${item.label} 삭제`}
                                        title="삭제"
                                        onClick={() =>
                                          handleDeliverableRemove(item.contentType)
                                        }
                                      >
                                        <Trash2
                                          className="h-3.5 w-3.5"
                                          strokeWidth={1.9}
                                        />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid gap-2 border-t border-neutral-200 px-3 pb-3 pt-3">
                                    {item.fields.map((field) => (
                                      <div
                                        key={`${item.contentType}-${field.key}`}
                                        className="min-w-0"
                                      >
                                        <Label className="text-xs text-neutral-500">
                                          {field.label}
                                        </Label>
                                        <Input
                                          className="mt-1 h-8 scroll-mb-36 bg-white text-xs lg:scroll-mb-0"
                                          placeholder={field.placeholder}
                                          value={getRequirementValue(
                                            requirement,
                                            field.key,
                                          )}
                                          onChange={(event) =>
                                            handleDeliverableRequirementChange(
                                              item.contentType,
                                              field.key,
                                              event.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}

                            {addingContentPlatform === group.platform &&
                            group.remainingItems.length > 0 ? (
                              <div className="rounded-[10px] border border-neutral-200 bg-white p-3">
                                <Label className="text-xs text-neutral-500">콘텐츠</Label>
                                <Select
                                  onValueChange={(value) => {
                                    const option = group.remainingItems.find(
                                      (item) => item.label === value,
                                    );
                                    if (option) {
                                      handleDeliverableSelect(option.contentType);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="mt-1 h-10">
                                    <SelectValue placeholder="콘텐츠 선택" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {group.remainingItems.map((option) => (
                                      <SelectItem
                                        key={option.contentType}
                                        value={option.label}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}

                            {addingContentPlatform !== group.platform &&
                            group.remainingItems.length > 0 ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 w-full rounded-[12px] border-neutral-200 bg-white text-[12px] font-bold text-neutral-700 hover:bg-neutral-50"
                                onClick={() => {
                                  setAddingContentPlatform(group.platform);
                                  setIsAddingPlatform(false);
                                  setPendingPlatform("");
                                }}
                              >
                                <Plus
                                  className="mr-2 h-3.5 w-3.5"
                                  strokeWidth={1.8}
                                />
                                콘텐츠 추가
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}

                      {showAddPlatformForm && canAddPlatform ? (
                        <div className="min-h-[132px] rounded-[14px] border border-neutral-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.035)] sm:p-5">
                          <div className="grid gap-4">
                            <div>
                              <Label className="text-xs text-neutral-500">플랫폼</Label>
                              <Select
                                value={
                                  pendingPlatform
                                    ? PLATFORM_CONTENT_GROUPS.find(
                                        (group) => group.platform === pendingPlatform,
                                      )?.label ?? ""
                                    : ""
                                }
                                onValueChange={(value) => {
                                  const group = PLATFORM_CONTENT_GROUPS.find(
                                    (item) => item.label === value,
                                  );
                                  setPendingPlatform(group?.platform ?? "");
                                }}
                              >
                                <SelectTrigger className="mt-1 h-10">
                                  <SelectValue placeholder="플랫폼 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availablePlatformGroups.map((group) => (
                                    <SelectItem key={group.platform} value={group.label}>
                                      {group.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-neutral-500">콘텐츠</Label>
                              <Select
                                disabled={!pendingPlatform || pendingContentOptions.length === 0}
                                onValueChange={(value) =>
                                  {
                                    const option = pendingContentOptions.find(
                                      (item) => item.label === value,
                                    );
                                    if (option) {
                                      handleDeliverableSelect(option.contentType);
                                    }
                                  }
                                }
                              >
                                <SelectTrigger className="mt-1 h-10">
                                  <SelectValue
                                    placeholder={
                                      pendingPlatform
                                        ? "콘텐츠 선택"
                                        : "플랫폼 먼저 선택"
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {pendingContentOptions.map((option) => (
                                    <SelectItem
                                      key={option.contentType}
                                      value={option.label}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {!showAddPlatformForm && canAddPlatform ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-[12px] border-neutral-200 bg-white text-[13px] font-bold text-neutral-700 hover:bg-neutral-50"
                          onClick={() => {
                            setIsAddingPlatform(true);
                            setAddingContentPlatform("");
                            setPendingPlatform("");
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" strokeWidth={1.8} />
                          플랫폼 추가
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </section>
              )}

              {step === 3 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div className="grid gap-3">
                    <div>
                      <Label>캠페인 시작일</Label>
                        <ContractDatePicker
                          id="contract-campaign-start"
                          openId={openDatePicker}
                          onOpenChange={setOpenDatePicker}
                          value={draft.campaignStart}
                          onChange={(value) => updateDraft({ campaignStart: value })}
                        />
                    </div>
                    <div>
                      <Label>캠페인 종료일</Label>
                        <ContractDatePicker
                          id="contract-campaign-end"
                          openId={openDatePicker}
                          onOpenChange={setOpenDatePicker}
                          value={draft.campaignEnd}
                          onChange={(value) => updateDraft({ campaignEnd: value })}
                        />
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <Label>업로드 마감일</Label>
                        <ContractDatePicker
                          id="contract-upload-due-date"
                          openId={openDatePicker}
                          onOpenChange={setOpenDatePicker}
                          value={draft.uploadDueDate}
                          onChange={(value) => updateDraft({ uploadDueDate: value })}
                        />
                    </div>
                    <div>
                      <Label>검수 회신 기한</Label>
                        <ContractDatePicker
                          id="contract-review-due-date"
                          openId={openDatePicker}
                          onOpenChange={setOpenDatePicker}
                          value={draft.reviewDueDate}
                          onChange={(value) => updateDraft({ reviewDueDate: value })}
                        />
                    </div>
                  </div>

                  <div>
                    <Label>수정 가능 횟수</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 최대 2회"
                      value={draft.revisionLimit}
                      onChange={(event) =>
                        updateDraft({ revisionLimit: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>수정 요청 기준</Label>
                    <Textarea
                      className="mt-1.5 min-h-[86px]"
                      placeholder="예: 광고표시 누락, 필수 해시태그 누락, 계약한 콘텐츠 형식 미충족"
                      value={draft.revisionRequestPolicy}
                      onChange={(event) =>
                        updateDraft({ revisionRequestPolicy: event.target.value })
                      }
                    />
                  </div>

                  <div>
                    <Label>광고 표시 조건</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 본문 첫 줄에 유료광고 또는 #광고 표기"
                      value={draft.disclosureText}
                      onChange={(event) =>
                        updateDraft({ disclosureText: event.target.value })
                      }
                    />
                    <p className="mt-2 text-[12px] leading-5 text-neutral-500">
                      소비자가 쉽게 볼 수 있는 위치에 경제적 이해관계가 드러나는 문구를
                      포함해야 합니다.
                    </p>
                  </div>

                  <div>
                    <Label>추적 링크</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: https://brand.example.com/campaign"
                      value={draft.trackingLink}
                      onChange={(event) => updateDraft({ trackingLink: event.target.value })}
                    />
                    <p className="mt-2 text-[12px] leading-5 text-neutral-500">
                      쿠폰 코드나 해시태그는 광고 표시 조건 또는 특약에 적어 주세요.
                    </p>
                  </div>

                  <div>
                    <Label>예시 레퍼런스 링크</Label>
                    <Textarea
                      className="mt-1.5 min-h-[86px]"
                      placeholder="광고주가 원하는 톤이나 형식의 콘텐츠 URL을 한 줄에 하나씩 입력"
                      value={draft.referenceLinks}
                      onChange={(event) =>
                        updateDraft({ referenceLinks: event.target.value })
                      }
                    />
                  </div>

                  <div className="rounded-[16px] border border-neutral-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-neutral-950">
                      콘텐츠 제출 조건
                    </h3>
                    <p className="mt-1 text-[12px] leading-5 text-neutral-500">
                      전자서명 완료 후 인플루언서가 제출해야 할 URL과 파일 기준입니다.
                    </p>
                    <div className="mt-4 grid gap-3">
                      <div>
                        <Label>필수 해시태그</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="예: #광고, #브랜드명"
                          value={draft.requiredHashtags}
                          onChange={(event) =>
                            updateDraft({ requiredHashtags: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>브랜드 계정 태그</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="예: @brand_official"
                          value={draft.brandAccountTags}
                          onChange={(event) =>
                            updateDraft({ brandAccountTags: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>콘텐츠 파일 제출 조건</Label>
                        <Textarea
                          className="mt-1.5 min-h-[86px]"
                          placeholder="예: 게시물 캡처, 블로그 PDF, 스토리 캡처"
                          value={draft.contentFileRequirement}
                          onChange={(event) =>
                            updateDraft({ contentFileRequirement: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-neutral-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <input
                        id="content-usage-allowed"
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-neutral-300 text-neutral-900"
                        checked={draft.contentUsageAllowed}
                        onChange={(event) =>
                          updateDraft({ contentUsageAllowed: event.target.checked })
                        }
                      />
                      <div>
                        <Label htmlFor="content-usage-allowed">콘텐츠 활용권</Label>
                        <p className="mt-1 text-[12px] leading-5 text-neutral-500">
                          광고주가 제작 콘텐츠를 사용할 수 있는 범위를 계약서에 남깁니다.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div>
                        <Label>사용 가능 채널</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="예: 브랜드 인스타그램, 자사몰, 광고 소재"
                          value={draft.contentUsageChannels}
                          onChange={(event) =>
                            updateDraft({ contentUsageChannels: event.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>사용 기간</Label>
                        <Input
                          className="mt-1.5"
                          placeholder="예: 게시일로부터 3개월"
                          value={draft.contentUsagePeriod}
                          onChange={(event) =>
                            updateDraft({ contentUsagePeriod: event.target.value })
                          }
                        />
                      </div>
                      <label className="flex items-center gap-2 text-[13px] font-semibold text-neutral-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
                          checked={draft.contentUsageEditAllowed}
                          onChange={(event) =>
                            updateDraft({
                              contentUsageEditAllowed: event.target.checked,
                            })
                          }
                        />
                        2차 편집 허용
                      </label>
                    </div>
                  </div>

                  <div>
                    <Label>경쟁사 배제 조건</Label>
                    <Input
                      className="mt-1.5"
                      placeholder="예: 업로드 후 2개월간 동종 선케어 브랜드 광고 불가"
                      value={draft.exclusivity}
                      onChange={(event) => updateDraft({ exclusivity: event.target.value })}
                    />
                  </div>

                  <div>
                    <Label>지급 조건</Label>
                    <div className="mt-1.5 grid gap-3">
                      <select
                        value={draft.paymentMethod}
                        onChange={(event) =>
                          updateDraft({
                            paymentMethod: event.target
                              .value as ContractDraft["paymentMethod"],
                          })
                        }
                        className="h-11 rounded-md border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none transition hover:border-neutral-300 focus:border-neutral-950"
                        aria-label="지급 방식"
                      >
                        {Object.entries(paymentMethodLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <label className="flex min-h-11 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-neutral-300 text-neutral-900"
                          checked={draft.withholdingTaxEnabled}
                          onChange={(event) =>
                            updateDraft({
                              withholdingTaxEnabled: event.target.checked,
                            })
                          }
                        />
                        3.3% 원천징수/소득신고 확인
                      </label>
                    </div>
                    <Textarea
                      className="mt-3 min-h-[110px]"
                      placeholder="예: 총 1,200,000원, 세금계산서 수령 후 7영업일 내 지급"
                      value={draft.payment}
                      onChange={(event) => updateDraft({ payment: event.target.value })}
                    />
                  </div>
                </section>
              )}

              {step === 4 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-6">
                  <div>
                    <Label className="mb-2 block">즐겨찾는 기본 특약 추가</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addTemplateClause("delivery")}
                        className="rounded-[12px] text-xs"
                      >
                        <Plus className="mr-1 h-3 w-3" /> 파손 책임
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addTemplateClause("cs")}
                        className="rounded-[12px] text-xs"
                      >
                        <Plus className="mr-1 h-3 w-3" /> 고객 CS 전담
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-neutral-200/90 bg-white/95 p-4 shadow-[0_1px_0_rgba(15,23,42,0.035),0_16px_42px_rgba(15,23,42,0.035)]">
                    <h3 className="mb-3 text-sm font-semibold">직접 특약 추가</h3>
                    <div className="space-y-3">
                      <Input
                        placeholder="조항 카테고리 (예: 비밀유지)"
                        value={draft.newClauseCategory}
                        onChange={(event) =>
                          updateDraft({ newClauseCategory: event.target.value })
                        }
                      />
                      <Textarea
                        placeholder="세부 내용을 입력하세요"
                        value={draft.newClauseContent}
                        onChange={(event) =>
                          updateDraft({ newClauseContent: event.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full rounded-[12px]"
                        onClick={addCustomClause}
                        disabled={!draft.newClauseContent.trim()}
                      >
                        조항 추가하기
                      </Button>
                    </div>
                  </div>

                  {draft.customClauses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                        추가된 특약
                      </p>
                      {draft.customClauses.map((clause) => (
                        <div
                          key={clause.id}
                          className="flex items-start justify-between gap-3 rounded-[14px] border border-neutral-200 bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.03)]"
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-neutral-900">
                              {clause.category}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-neutral-500">
                              {clause.content}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCustomClause(clause.id)}
                            className="shrink-0 p-1 text-neutral-400 hover:text-neutral-900"
                            aria-label="특약 삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {step === 5 && (
                <section className="animate-in fade-in slide-in-from-right-4 space-y-5">
                  {allErrors.length > 0 ? (
                    <ValidationSummary errors={allErrors} />
                  ) : (
                    <div className="rounded-[16px] border border-neutral-200 bg-[#fbfaf7] p-4 text-[13px] text-neutral-800">
                      필수 조건이 모두 채워졌습니다. 초안 저장 또는 공유 링크 생성을 선택하세요.
                    </div>
                  )}

                  {result?.stale && (
                    <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-800">
                      계약 내용을 수정했습니다. 기존 공유 링크에 반영하려면 다시 공유 링크를 생성하세요.
                    </div>
                  )}

                  {!canSendContract && (
                    <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-4 text-[13px] leading-6 text-amber-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-extrabold text-amber-950">
                            공유 링크 생성 전 사업자 인증이 필요합니다.
                          </p>
                          <p className="mt-1 text-amber-800">
                            {isVerificationLoading
                              ? "사업자 인증 상태를 확인하고 있습니다."
                              : verificationCopy.helper}
                          </p>
                        </div>
                        {!isVerificationLoading && (
                          <button
                            type="button"
                            onClick={() => navigate("/advertiser/verification")}
                            className="shrink-0 rounded-[9px] border border-amber-300 bg-white px-3 py-2 text-[12px] font-extrabold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
                          >
                            {verificationCopy.actionLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <ReviewBlock title="계약 당사자">
                    <SummaryRow
                      label="광고주"
                      value={draftWithAdvertiserDefaults.advertiserName || "미입력"}
                    />
                    <SummaryRow
                      label="담당자"
                      value={draftWithAdvertiserDefaults.advertiserManager || "-"}
                    />
                    <SummaryRow label="인플루언서" value={draft.influencerName || "미입력"} />
                  </ReviewBlock>

                  <ReviewBlock title="캠페인 조건">
                    <SummaryRow
                      label="기간"
                      value={
                        draft.campaignStart && draft.campaignEnd
                          ? `${draft.campaignStart} - ${draft.campaignEnd}`
                          : "미입력"
                      }
                    />
                    <SummaryRow label="업로드 마감" value={draft.uploadDueDate || "미입력"} />
                    <SummaryRow label="검수 기한" value={draft.reviewDueDate || "미입력"} />
                    <SummaryRow label="수정 횟수" value={draft.revisionLimit || "미입력"} />
                    <SummaryRow
                      label="수정 기준"
                      value={draft.revisionRequestPolicy || "미입력"}
                      multiline
                    />
                    <SummaryRow
                      label="레퍼런스"
                      value={
                        splitLineSeparated(draft.referenceLinks).length > 0
                          ? `${splitLineSeparated(draft.referenceLinks).length}개`
                          : "없음"
                      }
                    />
                    <SummaryRow
                      label="지급 방식"
                      value={paymentMethodLabels[draft.paymentMethod]}
                    />
                    <SummaryRow
                      label="3.3% 확인"
                      value={draft.withholdingTaxEnabled ? "적용 확인" : "당사자 확인"}
                    />
                  </ReviewBlock>

                  <ReviewBlock title="발송 상태">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-neutral-500" />
                      <p className="text-[13px] leading-6 text-neutral-600">
                        공유 링크 생성 전에는 대시보드에 <b>초안</b>으로 저장됩니다. 링크 생성 후에만
                        <b> 검토 중</b> 상태로 전환됩니다.
                      </p>
                    </div>
                  </ReviewBlock>
                </section>
              )}
              </div>

              {result && (
                <div className="mt-7 rounded-[20px] border border-neutral-200/90 bg-white p-6 text-center shadow-[0_1px_0_rgba(15,23,42,0.035),0_20px_58px_rgba(15,23,42,0.06)]">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-50">
                    <CheckCircle2 strokeWidth={1.5} className="h-6 w-6 text-neutral-900" />
                  </div>
                  <h3 className="mb-3 text-xl font-heading tracking-tight text-neutral-900">
                    {result.mode === "draft"
                      ? resultSaveState === "syncing"
                        ? "초안 저장 중"
                        : resultSaveState === "error"
                          ? "초안 저장 확인 필요"
                          : "초안 저장 완료"
                      : resultSaveState === "syncing"
                        ? "공유 링크 저장 중"
                        : resultSaveState === "error"
                          ? "공유 링크 확인 필요"
                          : "공유 링크 생성 완료"}
                  </h3>
                  <p className="mx-auto mb-6 max-w-[320px] text-[13px] leading-6 text-neutral-500">
                    {result.mode === "draft"
                      ? resultSaveState === "syncing"
                        ? "계약 초안을 서버에 저장하고 있습니다."
                        : resultSaveState === "error"
                          ? "초안 저장에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 저장해 주세요."
                          : "계약이 초안 상태로 저장되었습니다. 아직 상대방에게 공유되지 않았습니다."
                      : resultSaveState === "syncing"
                        ? "변경 사항 저장이 끝나면 링크를 복사해 전달할 수 있습니다."
                        : resultSaveState === "error"
                          ? "변경 사항이 완전히 저장되지 않았습니다. 저장 상태를 확인한 뒤 공유하세요."
                          : "이 링크를 전달하면 상대방이 계약서를 검토할 수 있습니다."}
                  </p>
                  {resultSaveState !== "ready" && (
                    <div
                      className={`mb-5 border px-4 py-3 text-left text-[12px] leading-5 ${
                        resultSaveState === "error"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-neutral-200 bg-neutral-50 text-neutral-800"
                      }`}
                    >
                      {resultSaveState === "error"
                        ? "저장에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 공유 링크를 생성하세요."
                        : resultSaveState === "syncing"
                          ? "계약 내용을 저장하고 있습니다."
                          : "저장이 완료되었습니다. 링크를 전달해도 됩니다."}
                    </div>
                  )}
                  {result.mode === "share" &&
                    result.contractId &&
                    resultSaveState === "ready" &&
                    !result.stale && (
                      <div className="w-full">
                        <Button
                          type="button"
                          onClick={copyToClipboard}
                          disabled={
                            result.stale ||
                            isSyncing ||
                            Boolean(syncError) ||
                            isCopyingLink
                          }
                          className="h-11 w-full rounded-[12px] bg-neutral-950 px-5 text-[13px] font-bold text-white hover:bg-neutral-800 disabled:bg-neutral-100 disabled:text-neutral-400"
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          {isCopyingLink
                            ? "본인 확인 중"
                            : copied
                              ? "복사됨"
                              : "계약서 링크 복사"}
                        </Button>
                        {copyError ? (
                          <p className="mt-2 text-[12px] font-semibold text-red-600" role="alert">
                            {copyError}
                          </p>
                        ) : null}
                      </div>
                    )}
                  {savedContractId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 h-10 rounded-[12px] border-neutral-200 bg-white px-5 text-[13px] font-semibold text-neutral-700"
                      onClick={() => navigate(`/advertiser/contract/${savedContractId}`)}
                    >
                      관리 화면 열기
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="relative z-20 -mx-6 mt-4 flex shrink-0 flex-col gap-3 border-t border-neutral-200 bg-[#f7f6f3]/95 px-6 pb-4 pt-4 shadow-[0_-18px_36px_rgba(15,23,42,0.08)] backdrop-blur md:-mx-10 md:px-10 lg:mx-0 lg:bg-[#f7f6f3] lg:px-0 lg:pb-0 lg:shadow-none lg:backdrop-blur-none">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-[12px] border-neutral-200 bg-white text-[13px] font-bold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100 lg:hidden"
                onClick={() => setMobilePreviewOpen(true)}
              >
                <FileText className="mr-2 h-4 w-4" strokeWidth={1.8} />
                초안 확인하기
              </Button>

              <div className="flex gap-3">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-[12px] border-neutral-200 bg-white px-7 text-[14px] font-bold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100 hover:text-neutral-900"
                    onClick={goBack}
                  >
                    이전
                  </Button>
                )}

                {step < 5 ? (
                <Button
                  type="button"
                  className="h-12 flex-1 rounded-[12px] bg-neutral-950 text-[14px] font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-neutral-800"
                  onClick={goNext}
                >
                  다음
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 flex-1 rounded-[12px] border-neutral-200 bg-white text-[14px] font-bold text-neutral-700 shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:bg-neutral-100"
                    onClick={() => saveContract("draft")}
                  >
                    초안 저장
                  </Button>
                  <Button
                    type="button"
                    className="h-12 flex-1 rounded-[12px] bg-neutral-950 text-[14px] font-bold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-neutral-800 disabled:translate-y-0 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none"
                      onClick={() => saveContract("share")}
                      disabled={
                        currentStepHasBlockingError ||
                        isVerificationLoading ||
                        !canSendContract
                      }
                    >
                      공유 링크 생성
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="hidden min-h-0 flex-col overflow-hidden bg-transparent py-5 lg:flex">
          <BuilderReviewPanel draft={draftWithAdvertiserDefaults} clauses={clauses} />
        </section>
      </main>

      <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <DialogContent
          showCloseButton={false}
          className="!left-0 !top-0 !block !h-dvh !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 bg-[#f7f6f3] p-0 ring-0 sm:!max-w-none lg:hidden"
        >
          <div className="flex h-dvh min-h-0 flex-col bg-[#f7f6f3]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.035)]">
              <DialogHeader className="sr-only">
                <DialogTitle>계약서 초안 미리보기</DialogTitle>
                <DialogDescription>
                  작성 중인 입력값이 반영된 모바일 계약서 초안 미리보기입니다.
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                className="inline-flex h-10 min-w-0 items-center gap-2 rounded-[12px] border border-neutral-200 bg-white px-3 text-[13px] font-bold text-neutral-800 shadow-[0_1px_0_rgba(15,23,42,0.02)] transition hover:bg-neutral-100"
                onClick={() => setMobilePreviewOpen(false)}
                aria-label="입력 화면으로 돌아가기"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="truncate">입력으로 돌아가기</span>
              </button>
              <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-bold text-neutral-500">
                실시간 초안
              </span>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden p-3">
              <BuilderReviewPanel
                draft={draftWithAdvertiserDefaults}
                clauses={clauses}
                density="compact"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BuilderAccountSettingsMenu({
  account,
  open,
  onToggle,
  onClose,
  onChangePassword,
  onOpenBusinessVerification,
}: {
  account: { name: string; email?: string };
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChangePassword: () => void;
  onOpenBusinessVerification: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const emailChangeHref = buildBuilderSupportMailtoHref({
    subject: "광고주 계정 이메일 변경 요청",
    body: [
      "광고주 계정 이메일 변경을 요청합니다.",
      "",
      `현재 표시 이메일: ${account.email ?? "확인 필요"}`,
      `사업자명: ${account.name}`,
      "변경할 이메일:",
      "요청 사유:",
    ].join("\n"),
  });

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label="계정 설정"
        title="계정 설정"
        aria-expanded={open}
        className="yl-header-icon-action"
      >
        <Settings className="h-3.5 w-3.5" strokeWidth={2} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[290px] overflow-hidden rounded-[12px] border border-neutral-200 bg-white text-left shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          <div className="border-b border-neutral-100 px-4 py-3">
            <p className="text-[13px] font-extrabold text-neutral-950">계정 설정</p>
            {account.email ? (
              <p className="mt-1 truncate text-[12px] font-semibold text-neutral-500">
                {account.email}
              </p>
            ) : null}
          </div>
          <a
            href={emailChangeHref}
            onClick={onClose}
            className="flex min-h-12 items-start gap-2 px-4 py-3 text-left transition hover:bg-neutral-50"
          >
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-neutral-800">
                로그인 이메일 변경 요청
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                소유 확인 후 새 이메일로 변경합니다.
              </span>
            </span>
          </a>
          <button
            type="button"
            onClick={onOpenBusinessVerification}
            className="flex min-h-12 w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-neutral-50"
          >
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-neutral-800">
                사업자 인증 관리
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                사업자 정보를 확인하고 관리합니다.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onChangePassword}
            className="flex min-h-12 w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-neutral-50"
          >
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <span className="min-w-0">
              <span className="block text-[12px] font-extrabold text-neutral-800">
                비밀번호 재설정
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                로그인 비밀번호를 다시 설정합니다.
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

const BuilderReviewPanel: React.FC<{
  draft: ContractDraft;
  clauses: Clause[];
  density?: "regular" | "compact";
}> = ({ draft, clauses, density = "regular" }) => {
  const isCompact = density === "compact";
  const deliverables = getDeliverableItems(draft);
  const referenceLinks = splitLineSeparated(draft.referenceLinks);
  const previewDate = new Date().toISOString().split("T")[0];

  return (
    <div
      data-preview-density={density}
      className={`flex min-h-0 flex-1 flex-col overflow-hidden border border-neutral-200 bg-[#e8e9e4] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_42px_rgba(23,26,23,0.05)] ${
        isCompact ? "rounded-[10px] p-2" : "rounded-[12px] p-3"
      }`}
    >
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {!isCompact && (
          <div className="mx-auto mb-2 flex w-full max-w-[680px] items-center justify-between px-1">
            <p className="text-[12px] font-extrabold text-neutral-800">계약서 초안</p>
          </div>
        )}
        <article
          data-preview-document
          className={`font-contract-document mx-auto min-h-[1080px] w-full max-w-[680px] rounded-[3px] border border-neutral-300 bg-white shadow-[0_1px_0_rgba(15,23,42,0.05),0_20px_46px_rgba(15,23,42,0.18)] sm:px-10 sm:py-10 ${
            isCompact ? "px-4 py-6" : "px-5 py-8"
          }`}
        >
          <header className="border-b border-neutral-200 pb-7 text-center">
            <h2 className="text-[22px] font-semibold leading-tight text-neutral-950 sm:text-[28px]">
              {draft.title.trim() || "계약 건명 미입력"}
            </h2>
            <p className="mt-3 text-[13px] font-semibold text-neutral-500">
              작성일 {previewDate}
            </p>
          </header>

          <ContractDocumentSection title="계약 개요">
            <DocumentRows
              rows={[
                ["계약 종류", formatDraftValue(draft.type)],
                ["광고주", formatDraftValue(draft.advertiserName)],
                ["광고주 담당자", formatDraftValue(draft.advertiserManager, "-")],
                ["인플루언서", formatDraftValue(draft.influencerName)],
                ["연락처", formatDraftValue(draft.influencerContact)],
                ["대표 채널", formatDraftValue(draft.influencerUrl)],
              ]}
            />
          </ContractDocumentSection>

          <ContractDocumentSection title="제1조 제공 매체 및 콘텐츠 조건">
            {deliverables.length > 0 ? (
              <div className="space-y-2">
                {deliverables.map((row, index) => (
                  <div
                    key={`${row.contentType}-${index}`}
                    className="border border-neutral-200 bg-neutral-50/60 px-4 py-3"
                  >
                    <p className="text-[13px] font-semibold text-neutral-950">
                      {row.platformLabel} · {row.contentLabel}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-neutral-600">
                      {row.requirementText || "조건 입력 필요"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <DocumentEmpty text="플랫폼과 콘텐츠 조건을 선택하면 계약서에 반영됩니다." />
            )}
          </ContractDocumentSection>

          <ContractDocumentSection title="제2조 일정 및 검수">
            <DocumentRows
              rows={[
                ["캠페인 기간", formatDateRange(draft.campaignStart, draft.campaignEnd)],
                ["업로드 마감일", formatDraftValue(draft.uploadDueDate)],
                ["광고주 검수 회신", formatDraftValue(draft.reviewDueDate)],
                ["수정 가능 횟수", formatDraftValue(draft.revisionLimit)],
                ["수정 요청 기준", formatDraftValue(draft.revisionRequestPolicy)],
              ]}
            />
          </ContractDocumentSection>

          <ContractDocumentSection title="제3조 광고 표시 및 추적">
            <DocumentParagraph>
              {formatDraftValue(
                draft.disclosureText,
                "광고 표시 조건을 입력하면 계약서에 반영됩니다.",
              )}
            </DocumentParagraph>
            {draft.trackingLink && (
              <p className="mt-3 rounded-[10px] border border-neutral-200 bg-white px-4 py-3 font-mono text-[12px] leading-5 text-neutral-600">
                {draft.trackingLink}
              </p>
            )}
            {referenceLinks.length > 0 && (
              <DocumentRows rows={[["예시 레퍼런스", referenceLinks.join("\n")]]} />
            )}
          </ContractDocumentSection>

          <ContractDocumentSection title="제4조 지급 조건">
            <DocumentRows
              rows={[
                ["지급 방식", paymentMethodLabels[draft.paymentMethod]],
                [
                  "원천징수",
                  draft.withholdingTaxEnabled
                    ? "3.3% 원천징수/소득신고 확인"
                    : "당사자 직접 확인",
                ],
              ]}
            />
            <DocumentParagraph>
              {formatDraftValue(
                draft.payment,
                "지급 금액, 세금 처리, 지급 시점을 입력하면 계약서에 반영됩니다.",
              )}
            </DocumentParagraph>
          </ContractDocumentSection>

          {draft.exclusivity && (
            <ContractDocumentSection title="제5조 경쟁사 배제">
              <DocumentParagraph>{draft.exclusivity}</DocumentParagraph>
            </ContractDocumentSection>
          )}

          <ContractDocumentSection title="특약 및 자동 생성 조항">
            {clauses.length > 0 ? (
              <div className="space-y-4">
                {clauses.map((clause, index) => (
                  <section
                    key={clause.clause_id}
                    className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span className="font-mono text-[12px] font-semibold text-neutral-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-[14px] font-semibold text-neutral-950">
                        {clause.category}
                      </h3>
                    </div>
                    <p className="whitespace-pre-wrap pl-7 text-[13px] leading-6 text-neutral-600">
                      {clause.content}
                    </p>
                  </section>
                ))}
              </div>
            ) : (
              <DocumentEmpty text="필수 조건을 입력하면 계약 조항이 자동으로 생성됩니다." />
            )}
          </ContractDocumentSection>

          <section className="mt-8 grid grid-cols-2 gap-4 border-t border-neutral-200 pt-6">
            <SignatureBox label="광고주" value={draft.advertiserName || "서명 전"} />
            <SignatureBox label="인플루언서" value={draft.influencerName || "서명 전"} />
          </section>
        </article>
      </div>
    </div>
  );
};

function ContractDatePicker({
  id,
  openId,
  onOpenChange,
  value,
  onChange,
}: {
  id: string;
  openId: string | null;
  onOpenChange: (value: string | null) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  const open = openId === id;
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getContractCalendarMonth(value),
  );
  const selectedDate = parseContractDate(value);
  const days = useMemo(() => getContractCalendarDays(visibleMonth), [visibleMonth]);

  return (
    <section className="relative mt-1.5 min-w-0">
      <button
        type="button"
        onClick={() => {
          if (!open) setVisibleMonth(getContractCalendarMonth(value));
          onOpenChange(open ? null : id);
        }}
        aria-expanded={open}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-3 text-left text-sm font-semibold text-neutral-900 outline-none transition hover:border-neutral-300 focus:border-neutral-950"
      >
        <span className={value ? "text-neutral-950" : "text-neutral-400"}>
          {value ? formatContractDateButtonLabel(value) : "날짜 선택"}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-neutral-500" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-full max-w-[360px] rounded-[12px] border border-neutral-200 bg-white p-3 shadow-[0_20px_44px_rgba(15,23,42,0.14)]">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setVisibleMonth((current) => addContractCalendarMonths(current, -1))
              }
              className="h-8 rounded-[8px] px-2 text-[12px] font-extrabold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
            >
              이전
            </button>
            <p className="text-[13px] font-extrabold text-neutral-950">
              {formatContractCalendarMonthTitle(visibleMonth)}
            </p>
            <button
              type="button"
              onClick={() =>
                setVisibleMonth((current) => addContractCalendarMonths(current, 1))
              }
              className="h-8 rounded-[8px] px-2 text-[12px] font-extrabold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950"
            >
              다음
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-extrabold text-neutral-400">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="h-8" />;
              const dateValue = formatContractDateValue(day);
              const selected =
                Boolean(selectedDate) && dateValue === formatContractDateValue(selectedDate);
              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => {
                    onChange(dateValue);
                    onOpenChange(null);
                  }}
                  className={`h-8 rounded-[8px] text-[12px] font-extrabold transition ${
                    selected
                      ? "bg-blue-600 text-white"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const ContractDocumentSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="border-b border-neutral-200 py-6 last:border-0">
    <h3 className="mb-4 text-[15px] font-semibold text-neutral-950">
      {title}
    </h3>
    {children}
  </section>
);

const DocumentRows: React.FC<{ rows: Array<[string, string]> }> = ({ rows }) => (
  <dl className="overflow-hidden border border-neutral-300">
    {rows.map(([label, value]) => (
      <div
        key={label}
        className="grid min-w-0 grid-cols-[108px_1fr] border-b border-neutral-200 last:border-b-0 sm:grid-cols-[132px_1fr]"
      >
        <dt className="bg-neutral-50 px-3 py-2.5 text-[11px] font-semibold text-neutral-500">
          {label}
        </dt>
        <dd className="min-w-0 break-words border-l border-neutral-200 px-3 py-2.5 text-[13px] font-semibold text-neutral-900">
          {value}
        </dd>
      </div>
    ))}
  </dl>
);

const DocumentParagraph: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="whitespace-pre-wrap text-[13px] leading-7 text-neutral-700">
    {children}
  </p>
);

const DocumentEmpty: React.FC<{ text: string }> = ({ text }) => (
  <div className="border border-dashed border-neutral-300 bg-neutral-50/70 px-4 py-5 text-center text-[13px] leading-6 text-neutral-500">
    {text}
  </div>
);

const SignatureBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border border-neutral-300 bg-white px-4 py-5">
    <p className="text-[11px] font-semibold text-neutral-400">{label}</p>
    <p className="mt-5 border-t border-neutral-200 pt-3 text-center text-[13px] font-semibold text-neutral-800">
      {value}
    </p>
  </div>
);

const formatDraftValue = (value?: string, fallback = "입력 필요") => {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
};

const formatDateRange = (start?: string, end?: string) => {
  if (!start && !end) return "입력 필요";
  return `${start || "시작일 입력 필요"} - ${end || "종료일 입력 필요"}`;
};

const ValidationSummary: React.FC<{ errors: ValidationError[] }> = ({ errors }) => (
  <div className="mb-6 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
    <p className="mb-2 font-semibold">확인이 필요한 항목</p>
    <ul className="space-y-1">
      {errors.map((error) => (
        <li key={`${error.step}-${error.field}`}>- {error.message}</li>
      ))}
    </ul>
  </div>
);

const ReviewBlock: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="rounded-[16px] border border-neutral-200/90 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.035)]">
    <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
      {title}
    </h3>
    <div className="space-y-2">{children}</div>
  </div>
);

const SummaryRow: React.FC<{
  label: string;
  value: string;
  multiline?: boolean;
}> = ({
  label,
  multiline = false,
  value,
}) => (
  <div
    className={
      multiline
        ? "text-[13px]"
        : "flex items-start justify-between gap-4 text-[13px]"
    }
  >
    <span className="text-neutral-400">{label}</span>
    <span
      className={
        multiline
          ? "mt-1 block text-left font-medium leading-5 text-neutral-800"
          : "max-w-[260px] text-right font-medium text-neutral-800"
      }
    >
      {value}
    </span>
  </div>
);
