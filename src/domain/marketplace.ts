import type { InfluencerPlatform } from "./verification.js";
import {
  isoAlpha2CountryCodes,
  isIsoAlpha2CountryCode,
} from "./isoCountryCodes.js";

export type CampaignProposalType =
  | "sponsored_post"
  | "product_seeding"
  | "supporters"
  | "experience_group"
  | "ppl"
  | "group_buy"
  | "visit_review"
  | "other";

export const campaignProposalTypeOptions: CampaignProposalType[] = [
  "sponsored_post",
  "product_seeding",
  "supporters",
  "experience_group",
  "ppl",
  "group_buy",
  "visit_review",
  "other",
];

export const marketplaceLegacyCountryOptions = [
  "south_korea",
  "japan",
  "taiwan",
  "hong_kong",
  "united_states",
  "china",
  "thailand",
  "vietnam",
  "indonesia",
  "singapore",
  "malaysia",
  "australia",
  "canada",
  "germany",
  "india",
  "philippines",
  "bulgaria",
  "tanzania",
  "egypt",
  "global",
  "other",
] as const;

export type MarketplaceLegacyCountryCode =
  (typeof marketplaceLegacyCountryOptions)[number];
export type MarketplaceIsoCountryCode = `iso_${Lowercase<string>}`;
export type MarketplaceCountryCode =
  | MarketplaceLegacyCountryCode
  | MarketplaceIsoCountryCode;

const marketplaceCountryCodeByIso: Record<string, MarketplaceLegacyCountryCode> = {
  AU: "australia",
  BG: "bulgaria",
  CA: "canada",
  CN: "china",
  DE: "germany",
  EG: "egypt",
  HK: "hong_kong",
  ID: "indonesia",
  IN: "india",
  JP: "japan",
  KR: "south_korea",
  MY: "malaysia",
  PH: "philippines",
  SG: "singapore",
  TH: "thailand",
  TW: "taiwan",
  TZ: "tanzania",
  US: "united_states",
  VN: "vietnam",
};

const marketplaceLegacyCountrySet = new Set<string>(
  marketplaceLegacyCountryOptions,
);

export const marketplaceCountryLabels: Record<MarketplaceLegacyCountryCode, string> = {
  south_korea: "한국",
  japan: "일본",
  taiwan: "대만",
  hong_kong: "홍콩",
  united_states: "미국",
  china: "중국",
  thailand: "태국",
  vietnam: "베트남",
  indonesia: "인도네시아",
  singapore: "싱가포르",
  malaysia: "말레이시아",
  australia: "호주",
  canada: "캐나다",
  germany: "독일",
  india: "인도",
  philippines: "필리핀",
  bulgaria: "불가리아",
  tanzania: "탄자니아",
  egypt: "이집트",
  global: "글로벌",
  other: "기타 국가",
};

const koreanRegionNames = new Intl.DisplayNames(["ko"], { type: "region" });

export const marketplaceCountryFromIso = (
  value: string | null | undefined,
): MarketplaceCountryCode | "" => {
  const isoCode = String(value ?? "").trim().toUpperCase();
  if (!isIsoAlpha2CountryCode(isoCode)) return "";
  return (
    marketplaceCountryCodeByIso[isoCode] ??
    (`iso_${isoCode.toLowerCase()}` as MarketplaceIsoCountryCode)
  );
};

export const isMarketplaceCountryCode = (
  value: unknown,
): value is MarketplaceCountryCode => {
  if (typeof value !== "string") return false;
  if (marketplaceLegacyCountrySet.has(value)) return true;
  if (!/^iso_[a-z]{2}$/.test(value)) return false;
  return isIsoAlpha2CountryCode(value.slice(4));
};

export const getMarketplaceCountryLabel = (country: MarketplaceCountryCode) => {
  if (marketplaceLegacyCountrySet.has(country)) {
    return marketplaceCountryLabels[country as MarketplaceLegacyCountryCode];
  }

  const isoCode = country.slice(4).toUpperCase();
  return koreanRegionNames.of(isoCode) ?? isoCode;
};

const preferredMarketplaceCountries = marketplaceLegacyCountryOptions.filter(
  (country) => country !== "global" && country !== "other",
);
const extendedMarketplaceCountries = isoAlpha2CountryCodes
  .filter((isoCode) => !marketplaceCountryCodeByIso[isoCode])
  .map((isoCode) => `iso_${isoCode.toLowerCase()}` as MarketplaceIsoCountryCode)
  .sort((left, right) =>
    getMarketplaceCountryLabel(left).localeCompare(
      getMarketplaceCountryLabel(right),
      "ko",
    ),
  );

export const marketplaceCountryOptions: MarketplaceCountryCode[] = [
  ...preferredMarketplaceCountries,
  ...extendedMarketplaceCountries,
  "global",
  "other",
];

export const formatMarketplaceCountries = (
  countries: MarketplaceCountryCode[] | undefined,
  fallback = "",
) => {
  if (!countries || countries.length === 0) return fallback;
  const labels = countries.map((country) => getMarketplaceCountryLabel(country));
  return labels.length <= 3
    ? labels.join(", ")
    : `${labels.slice(0, 3).join(", ")} 외 ${labels.length - 3}`;
};

const formatDateOnly = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const getRelativeCampaignDate = (daysFromToday: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return formatDateOnly(date);
};

export type MarketplaceCampaignStatus = "open" | "draft" | "closed" | "ended";

export type CampaignApplicationContactField = "phone" | "email";

export const CAMPAIGN_APPLICATION_CONTACT_POLICY_VERSION = "2026-08-08.1";

export type MarketplaceBrandCampaign = {
  id?: string;
  relativeTestDates?: boolean;
  title: string;
  type: CampaignProposalType;
  otherTypeLabel?: string;
  budget: string;
  applicantLimit?: string;
  location?: string;
  offer?: string;
  summary?: string;
  mission?: string;
  targetCountries?: MarketplaceCountryCode[];
  thumbnailUrl?: string;
  deadline?: string;
  uploadDeadline?: string;
  platforms?: InfluencerPlatform[];
  deliverables?: string[];
  applicationContactFields?: CampaignApplicationContactField[];
  applicationContactConsentVersion?: string;
  requiredConsents?: Array<{
    id: string;
    text: string;
  }>;
  consentVersion?: string;
  status?: MarketplaceCampaignStatus;
  createdAt?: string;
  updatedAt?: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  closedAt?: string;
  endedAt?: string;
  reopenedAt?: string;
  activityEvents?: Array<{
    id: string;
    actor: string;
    action: string;
    description: string;
    createdAt: string;
  }>;
};

export type MarketplaceInfluencerProfile = {
  id: string;
  handle: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  avatarLabel: string;
  avatarUrl?: string;
  categories: string[];
  audience: string;
  audienceCountries?: MarketplaceCountryCode[];
  audienceTags: string[];
  platforms: Array<{
    platform: InfluencerPlatform;
    label: string;
    handle: string;
    url: string;
    followersLabel: string;
    performanceLabel: string;
    ownershipStatus?: "unverified" | "verified";
    metricType?: "average_daily_visitors_4d";
    metricSource?: "creator_self_report";
    metricTrust?: "self_reported";
    metricPeriodDays?: 4;
  }>;
  collaborationTypes: CampaignProposalType[];
  startingPriceLabel: string;
  responseTimeLabel: string;
  verifiedLabel: string;
  brandFit: string[];
  recentBrands: string[];
  portfolio: Array<{
    title: string;
    brand: string;
    result: string;
  }>;
  proposalHints: string[];
  recentPosts?: Array<{
    title: string;
    url: string;
    publishedDate: string;
  }>;
  source?: "registered" | "discovered";
  registrationVisibility?: "authenticated_advertisers";
  platformVerified?: boolean;
  publicProfilePublished?: boolean;
  publicProfileHandle?: string;
};

export type MarketplaceBrandProfile = {
  id: string;
  organizationId?: string;
  handle: string;
  displayName: string;
  category: string;
  headline: string;
  description: string;
  location: string;
  logoLabel: string;
  logoUrl?: string;
  preferredPlatforms: InfluencerPlatform[];
  proposalTypes: CampaignProposalType[];
  budgetRangeLabel: string;
  responseTimeLabel: string;
  statusLabel: string;
  fitTags: string[];
  audienceTargets: string[];
  activeCampaigns: MarketplaceBrandCampaign[];
  recentCreators: string[];
  isDefault?: boolean;
  archivedAt?: string;
};

export type MarketplaceCampaignPost = MarketplaceBrandCampaign & {
  id: string;
  brandId: string;
  brandHandle: string;
  brandName: string;
  brandCategory: string;
  brandHeadline: string;
  brandLocation: string;
  brandLogoLabel: string;
  brandLogoUrl?: string;
  brandHref: string;
  typeLabel: string;
  platformLabels: string[];
  deadlineLabel: string;
  acceptsApplications: boolean;
  applicationCount?: number;
};

export function splitCampaignGuidelineParagraphs(value: string | undefined) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[\t ]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export type CampaignGuidelineLineKind =
  | "section"
  | "numbered"
  | "example"
  | "bullet"
  | "body";

export type CampaignGuidelineLine = {
  kind: CampaignGuidelineLineKind;
  text: string;
  marker?: string;
  content: string;
};

export type CampaignGuidelineParagraph = {
  lines: CampaignGuidelineLine[];
};

function parseCampaignGuidelineLine(text: string): CampaignGuidelineLine {
  const normalizedText = text.trim();
  const numberedMatch = normalizedText.match(/^(\d+\.)(?:[\t ]+)(.+)$/u);
  if (numberedMatch) {
    return {
      kind: "numbered",
      text,
      marker: numberedMatch[1],
      content: numberedMatch[2],
    };
  }

  const bulletMatch = normalizedText.match(/^(-)(?:[\t ]+)(.+)$/u);
  if (bulletMatch) {
    return {
      kind: "bullet",
      text,
      marker: bulletMatch[1],
      content: bulletMatch[2],
    };
  }

  if (/^\[[^\]\n]+\]$/u.test(normalizedText)) {
    return { kind: "section", text, content: normalizedText };
  }

  if (normalizedText === "예시") {
    return { kind: "example", text, content: normalizedText };
  }

  return { kind: "body", text, content: text };
}

export function parseCampaignGuideline(
  value: string | undefined,
): CampaignGuidelineParagraph[] {
  return splitCampaignGuidelineParagraphs(value)
    .map((paragraph) => ({
      lines: paragraph
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map(parseCampaignGuidelineLine),
    }))
    .filter((paragraph) => paragraph.lines.length > 0);
}

export function formatCampaignApplicationStats(
  campaign: Pick<MarketplaceCampaignPost, "applicantLimit" | "applicationCount">,
) {
  const applicationCount = Math.max(
    0,
    Number.isFinite(Number(campaign.applicationCount))
      ? Math.floor(Number(campaign.applicationCount))
      : 0,
  );
  const normalizedLimit = campaign.applicantLimit?.trim() ?? "";
  const numericLimitMatch = normalizedLimit
    .replace(/,/g, "")
    .match(/^(\d+)\s*명?$/);
  const numericLimit = numericLimitMatch
    ? Number(numericLimitMatch[1])
    : undefined;
  const applicantLimitLabel = formatCampaignApplicantLimit(
    campaign.applicantLimit,
    "상시",
  );
  const competitionLabel =
    applicationCount > 0 && numericLimit && numericLimit > 0
      ? ` · 경쟁률 ${(applicationCount / numericLimit).toFixed(1)}:1`
      : "";

  return `지원 ${applicationCount.toLocaleString("ko-KR")}명 · 모집 ${applicantLimitLabel}${competitionLabel}`;
}

export function resolveCampaignApplicationCountSync(response: {
  already_submitted?: boolean;
  applicationCount?: number;
  application_count?: number;
}):
  | { kind: "replace"; applicationCount: number }
  | { kind: "preserve" }
  | { kind: "refetch" } {
  const value = response.applicationCount ?? response.application_count;
  if (Number.isSafeInteger(value) && Number(value) >= 0) {
    return { kind: "replace", applicationCount: Number(value) };
  }
  return response.already_submitted === true
    ? { kind: "preserve" }
    : { kind: "refetch" };
}

export function isMarketplaceApplicationBrandId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export const proposalTypeLabels: Record<CampaignProposalType, string> = {
  sponsored_post: "유료 광고",
  product_seeding: "제품 협찬",
  supporters: "서포터즈",
  experience_group: "체험단",
  ppl: "PPL",
  group_buy: "공동구매",
  visit_review: "방문 리뷰",
  other: "기타",
};

export function getCampaignProposalTypeDisplayLabel(
  campaign: Pick<MarketplaceBrandCampaign, "type" | "otherTypeLabel">,
) {
  return campaign.type === "other" && campaign.otherTypeLabel?.trim()
    ? campaign.otherTypeLabel.trim()
    : proposalTypeLabels[campaign.type];
}

export function formatCampaignApplicantLimit(
  value: string | undefined,
  fallback = "상시",
) {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return /^\d+$/.test(normalized)
    ? `${Number(normalized).toLocaleString("ko-KR")}명`
    : normalized;
}

export const platformLabels: Record<InfluencerPlatform, string> = {
  instagram: "인스타",
  youtube: "유튜브",
  tiktok: "틱톡",
  naver_blog: "블로그",
  other: "기타",
};

export const marketplaceInfluencers: MarketplaceInfluencerProfile[] = [
  {
    id: "inf-zeu-k",
    handle: "zeu_k",
    displayName: "제우",
    headline: "20대 라이프스타일과 데일리 뷰티 숏폼을 빠르게 검증하는 크리에이터",
    bio:
      "릴스와 숏츠 중심으로 제품 사용 장면, 첫인상 리뷰, 구매 전환형 스토리 구성을 제작합니다. 초안 검토와 수정 요청을 계약 안에서 정리하는 협업을 선호합니다.",
    location: "서울 · 수도권",
    avatarLabel: "ZK",
    categories: ["뷰티", "라이프스타일", "패션"],
    audience: "20-34 여성 중심 · 관심사 기반 구매 전환",
    audienceCountries: ["south_korea", "japan", "taiwan"],
    audienceTags: ["20대 여성", "데일리 뷰티", "숏폼 반응", "리뷰형 콘텐츠"],
    platforms: [
      {
        platform: "instagram",
        label: "릴스",
        handle: "@zeu_k",
        url: "https://instagram.com/zeu_k",
        followersLabel: "8.4만",
        performanceLabel: "평균 조회 3.1만",
      },
      {
        platform: "youtube",
        label: "쇼츠",
        handle: "@zeu.k",
        url: "https://youtube.com/@zeu.k",
        followersLabel: "2.1만",
        performanceLabel: "완주율 42%",
      },
    ],
    collaborationTypes: ["sponsored_post", "product_seeding", "supporters", "ppl"],
    startingPriceLabel: "150만원부터",
    responseTimeLabel: "보통 1영업일 내 응답",
    verifiedLabel: "플랫폼 인증 완료",
    brandFit: ["신제품 런칭", "사용감 리뷰", "릴스 1건 + 스토리 2건"],
    recentBrands: ["오브제스튜디오", "브레드룸", "로컬센트"],
    portfolio: [
      {
        title: "신제품 언박싱 릴스",
        brand: "브레드룸",
        result: "댓글 저장률 2.4배",
      },
      {
        title: "데일리 파우치 리뷰",
        brand: "오브제스튜디오",
        result: "브랜드 클릭 1,820회",
      },
      {
        title: "주말 루틴 숏츠",
        brand: "로컬센트",
        result: "평균 시청 38초",
      },
    ],
    proposalHints: [
      "제품을 어떤 장면에서 보여줄지 먼저 적어 주세요.",
      "희망 광고 형태와 업로드 마감일을 함께 보내면 응답이 빠릅니다.",
      "필수 문구, 사용 범위, 2차 활용 여부는 계약 전 확인이 필요합니다.",
    ],
  },
  {
    id: "inf-creator-sora",
    handle: "creator-sora",
    displayName: "크리에이터 소라",
    headline: "릴스와 쇼츠 중심으로 제품 사용 장면을 만드는 크리에이터",
    bio:
      "뷰티와 라이프스타일 제품을 직접 사용하는 장면 위주로 구성합니다. 제품 첫인상, 사용 루틴, 구매 전 확인 포인트를 짧고 선명하게 정리합니다.",
    location: "서울 · 원격 협업",
    avatarLabel: "CS",
    avatarUrl: "/images/influencers/creator-sora.png",
    categories: ["뷰티", "라이프스타일"],
    audience: "20-34 여성 중심 · 뷰티/라이프스타일 관심",
    audienceCountries: ["south_korea", "japan", "taiwan"],
    audienceTags: ["릴스", "쇼츠", "사용 장면", "리뷰형 콘텐츠"],
    platforms: [
      {
        platform: "instagram",
        label: "인스타",
        handle: "@creator_sora",
        url: "https://instagram.com/creator_sora",
        followersLabel: "8.1만",
        performanceLabel: "캠페인 지원 가능",
      },
      {
        platform: "youtube",
        label: "유튜브",
        handle: "@creator.sora",
        url: "https://youtube.com/@creator.sora",
        followersLabel: "2.4만",
        performanceLabel: "캠페인 지원 가능",
      },
    ],
    collaborationTypes: ["sponsored_post", "product_seeding", "supporters"],
    startingPriceLabel: "협의 가능",
    responseTimeLabel: "보통 1영업일 내 응답",
    verifiedLabel: "플랫폼 인증 완료",
    brandFit: ["신제품 사용 리뷰", "릴스 1건", "쇼츠 1건"],
    recentBrands: ["브레드룸", "오브레", "하우스핏"],
    portfolio: [
      {
        title: "선케어 사용 루틴 릴스",
        brand: "브레드룸",
        result: "저장과 문의 중심 반응",
      },
      {
        title: "파우치 필수템 쇼츠",
        brand: "오브레",
        result: "댓글 문의 증가",
      },
      {
        title: "홈케어 제품 리뷰",
        brand: "하우스핏",
        result: "제품 사용 장면 중심 구성",
      },
    ],
    proposalHints: [
      "필수 노출 장면과 금지 표현을 먼저 알려 주세요.",
      "제품 수령일과 업로드 마감일을 함께 보내면 일정 조율이 빠릅니다.",
      "릴스, 쇼츠, 스토리 중 필요한 결과물을 구분해 주세요.",
    ],
  },
  {
    id: "inf-minseo-home",
    handle: "minseo_home",
    displayName: "민서홈",
    headline: "홈카페, 리빙 소품, 주방 브랜드에 강한 리뷰형 크리에이터",
    bio:
      "긴 설명보다 실제 배치, 사용 전후, 구매 이유를 차분하게 보여주는 콘텐츠를 만듭니다.",
    location: "부산 · 원격 협업",
    avatarLabel: "MH",
    categories: ["리빙", "홈카페", "푸드"],
    audience: "25-39 여성 · 리빙/소비재 관심",
    audienceCountries: ["south_korea"],
    audienceTags: ["홈카페", "주방용품", "저장형 콘텐츠", "블로그 연계"],
    platforms: [
      {
        platform: "instagram",
        label: "피드/릴스",
        handle: "@minseo.home",
        url: "https://instagram.com/minseo.home",
        followersLabel: "5.8만",
        performanceLabel: "저장률 6.8%",
      },
      {
        platform: "naver_blog",
        label: "블로그",
        handle: "minseo-home",
        url: "https://blog.naver.com/minseo-home",
        followersLabel: "",
        performanceLabel: "자가신고 미입력",
      },
    ],
    collaborationTypes: ["product_seeding", "visit_review", "sponsored_post"],
    startingPriceLabel: "90만원부터",
    responseTimeLabel: "보통 당일 응답",
    verifiedLabel: "활동 채널 확인됨",
    brandFit: ["리빙 신제품", "방문형 촬영", "블로그 상세 리뷰"],
    recentBrands: ["모노트립", "오늘한잔", "오브제스튜디오"],
    portfolio: [
      {
        title: "홈카페 머신 리뷰",
        brand: "오늘한잔",
        result: "검색 유입 4,200회",
      },
      {
        title: "주방 선반 정리 콘텐츠",
        brand: "오브제스튜디오",
        result: "저장 1,140회",
      },
    ],
    proposalHints: [
      "촬영 공간 제약이 있으면 먼저 공유해 주세요.",
      "블로그 포함 여부에 따라 검수 일정이 달라집니다.",
    ],
  },
  {
    id: "inf-channel-ove",
    handle: "channel_ove",
    displayName: "채널오브",
    headline: "브랜드 스토리와 제품 사용 맥락을 길게 풀어내는 유튜브 크리에이터",
    bio:
      "롱폼 리뷰와 숏츠 클립을 함께 운영하며, 계약 조건과 검수 일정을 명확히 정리하는 협업을 선호합니다.",
    location: "서울 · 스튜디오 보유",
    avatarLabel: "OV",
    categories: ["테크", "라이프스타일", "교육"],
    audience: "25-44 남녀 · 정보 탐색형 시청자",
    audienceCountries: ["south_korea", "united_states"],
    audienceTags: ["롱폼 리뷰", "구매 전 탐색", "제품 비교", "테크"],
    platforms: [
      {
        platform: "youtube",
        label: "롱폼/쇼츠",
        handle: "@channelove",
        url: "https://youtube.com/@channelove",
        followersLabel: "12.6만",
        performanceLabel: "평균 조회 5.4만",
      },
    ],
    collaborationTypes: ["ppl", "sponsored_post"],
    startingPriceLabel: "320만원부터",
    responseTimeLabel: "2영업일 내 응답",
    verifiedLabel: "플랫폼 인증 완료",
    brandFit: ["테크 리뷰", "브랜드 인터뷰", "롱폼 + 숏츠 패키지"],
    recentBrands: ["채널랩", "모노트립", "브레드룸"],
    portfolio: [
      {
        title: "제품 비교형 롱폼",
        brand: "채널랩",
        result: "평균 시청 지속 7분 12초",
      },
      {
        title: "브랜드 인터뷰 영상",
        brand: "모노트립",
        result: "상담 전환 210건",
      },
    ],
    proposalHints: [
      "제품 제공 가능 일정과 촬영 가능 범위를 먼저 알려 주세요.",
      "롱폼은 스크립트 검수 일정을 계약에 포함하는 편이 안전합니다.",
    ],
  },
  {
    id: "inf-haru-fit",
    handle: "haru-fit",
    displayName: "하루핏",
    headline: "홈트 루틴과 챌린지 숏폼을 명확하게 보여주는 운동 크리에이터",
    bio:
      "집에서 따라할 수 있는 운동 루틴, 제품 사용 장면, 초보자용 자세 설명을 짧고 반복 시청하기 쉽게 구성합니다.",
    location: "서울 · 경기",
    avatarLabel: "HF",
    avatarUrl: "/images/influencers/haru-fit.png",
    categories: ["헬스", "라이프스타일"],
    audience: "20-39 남녀 · 홈트/건강 루틴 관심",
    audienceCountries: ["south_korea", "thailand"],
    audienceTags: ["홈트", "챌린지", "운동 초보", "숏폼 루틴"],
    platforms: [
      {
        platform: "instagram",
        label: "릴스",
        handle: "@haru.fit",
        url: "https://instagram.com/haru.fit",
        followersLabel: "7.4만",
        performanceLabel: "루틴 저장 반응 강점",
      },
      {
        platform: "tiktok",
        label: "틱톡",
        handle: "@harufit",
        url: "https://www.tiktok.com/@harufit",
        followersLabel: "3.6만",
        performanceLabel: "챌린지형 콘텐츠",
      },
    ],
    collaborationTypes: ["ppl", "sponsored_post", "supporters"],
    startingPriceLabel: "180만원부터",
    responseTimeLabel: "1영업일 내 응답",
    verifiedLabel: "플랫폼 인증 완료",
    brandFit: ["홈트 루틴", "운동 챌린지", "릴스 + 틱톡 패키지"],
    recentBrands: ["하우스핏", "모노트립"],
    portfolio: [
      {
        title: "10분 홈트 챌린지",
        brand: "하우스핏",
        result: "저장 2,300회",
      },
      {
        title: "운동 전후 루틴",
        brand: "모노트립",
        result: "완주율 39%",
      },
    ],
    proposalHints: [
      "필수 운동 동작과 금지 표현을 먼저 알려 주세요.",
      "챌린지 사용 기간과 2차 활용 여부를 계약에 포함해 주세요.",
    ],
  },
  {
    id: "inf-luna-day",
    handle: "luna-day",
    displayName: "루나데이",
    headline: "데일리 패션과 뷰티 제품을 자연스럽게 연결하는 릴스 크리에이터",
    bio:
      "출근룩, 주말 외출, 파우치 루틴처럼 실제 하루 흐름 안에서 제품을 보여주는 콘텐츠를 만듭니다.",
    location: "서울 · 원격 협업",
    avatarLabel: "LD",
    avatarUrl: "/images/influencers/luna-day.png",
    categories: ["패션", "뷰티", "라이프스타일"],
    audience: "20-34 여성 · 패션/뷰티 구매 관심",
    audienceCountries: ["south_korea", "japan", "taiwan"],
    audienceTags: ["데일리룩", "파우치", "릴스", "스토리"],
    platforms: [
      {
        platform: "instagram",
        label: "릴스/스토리",
        handle: "@luna.day",
        url: "https://instagram.com/luna.day",
        followersLabel: "6.9만",
        performanceLabel: "스토리 클릭 반응",
      },
    ],
    collaborationTypes: ["sponsored_post", "product_seeding", "supporters"],
    startingPriceLabel: "130만원부터",
    responseTimeLabel: "당일 응답 가능",
    verifiedLabel: "활동 채널 확인됨",
    brandFit: ["데일리룩", "뷰티 루틴", "릴스 1건 + 스토리"],
    recentBrands: ["오브레뷰티", "브레드룸"],
    portfolio: [
      {
        title: "출근 파우치 릴스",
        brand: "오브레뷰티",
        result: "프로필 방문 1,480회",
      },
    ],
    proposalHints: [
      "착용 또는 사용 장면의 필수 컷을 먼저 정리해 주세요.",
      "스토리 링크 사용 여부를 함께 알려 주세요.",
    ],
  },
  {
    id: "inf-rooday",
    handle: "rooday",
    displayName: "루데이",
    headline: "푸드, 홈카페, 로컬 방문 후기를 차분하게 정리하는 리뷰어",
    bio:
      "메뉴 선택, 공간 분위기, 재방문 이유를 실제 방문 흐름에 맞춰 보여줍니다. 블로그와 릴스를 함께 운영합니다.",
    location: "대구 · 경북",
    avatarLabel: "RD",
    avatarUrl: "/images/influencers/rooday.png",
    categories: ["푸드", "홈카페", "여행"],
    audience: "25-44 여성 · 로컬 맛집/카페 탐색",
    audienceCountries: ["south_korea", "japan"],
    audienceTags: ["방문 리뷰", "홈카페", "저장형 콘텐츠", "블로그"],
    platforms: [
      {
        platform: "instagram",
        label: "릴스",
        handle: "@rooday",
        url: "https://instagram.com/rooday",
        followersLabel: "4.7만",
        performanceLabel: "저장형 후기",
      },
      {
        platform: "naver_blog",
        label: "블로그",
        handle: "rooday",
        url: "https://blog.naver.com/rooday",
        followersLabel: "",
        performanceLabel: "자가신고 미입력",
      },
    ],
    collaborationTypes: ["visit_review", "product_seeding", "group_buy"],
    startingPriceLabel: "80만원부터",
    responseTimeLabel: "1영업일 내 응답",
    verifiedLabel: "활동 채널 확인됨",
    brandFit: ["방문 리뷰", "홈카페 레시피", "블로그 상세 후기"],
    recentBrands: ["브루잉랩", "모노트립"],
    portfolio: [
      {
        title: "로컬 카페 방문 리뷰",
        brand: "브루잉랩",
        result: "검색 유입 3,600회",
      },
    ],
    proposalHints: [
      "방문 가능 시간과 촬영 제한을 먼저 공유해 주세요.",
      "블로그 원고 분량과 사진 수를 계약 조건에 적어 주세요.",
    ],
  },
  {
    id: "inf-today-taste",
    handle: "today-taste",
    displayName: "오늘의취향",
    headline: "홈카페 레시피와 공동구매 전환을 함께 설계하는 크리에이터",
    bio:
      "드립백, 원두, 디저트 소품을 실제 레시피와 함께 보여줍니다. 공동구매 일정과 판매 조건을 계약서로 정리하는 협업에 익숙합니다.",
    location: "서울 · 온라인",
    avatarLabel: "TT",
    avatarUrl: "/images/influencers/today-taste.png",
    categories: ["홈카페", "푸드", "리빙"],
    audience: "25-39 여성 · 홈카페/선물 구매층",
    audienceCountries: ["south_korea", "taiwan", "hong_kong"],
    audienceTags: ["홈카페", "레시피", "공동구매", "저장형"],
    platforms: [
      {
        platform: "instagram",
        label: "피드/릴스",
        handle: "@today.taste",
        url: "https://instagram.com/today.taste",
        followersLabel: "6.2만",
        performanceLabel: "공동구매 문의",
      },
      {
        platform: "naver_blog",
        label: "블로그",
        handle: "today-taste",
        url: "https://blog.naver.com/today-taste",
        followersLabel: "",
        performanceLabel: "자가신고 미입력",
      },
    ],
    collaborationTypes: ["group_buy", "product_seeding", "sponsored_post"],
    startingPriceLabel: "판매 조건 협의",
    responseTimeLabel: "당일 응답 가능",
    verifiedLabel: "플랫폼 인증 완료",
    brandFit: ["홈카페", "공동구매", "레시피형 콘텐츠"],
    recentBrands: ["브루잉랩", "오브제스튜디오"],
    portfolio: [
      {
        title: "드립백 공동구매 릴스",
        brand: "브루잉랩",
        result: "문의 430건",
      },
    ],
    proposalHints: [
      "판매 기간, 수수료, 정산 기준을 계약 조건에 분리해 주세요.",
      "레시피 사용 범위와 2차 활용 여부를 먼저 알려 주세요.",
    ],
  },
  {
    id: "inf-ziyu-log",
    handle: "ziyu-log",
    displayName: "지유로그",
    headline: "육아, 리빙, 생활용품 후기를 생활 장면 중심으로 보여주는 크리에이터",
    bio:
      "아이와 함께 쓰는 제품, 집안 정리, 생활 루틴을 과장 없이 보여주는 콘텐츠를 제작합니다.",
    location: "경기 · 원격 협업",
    avatarLabel: "ZL",
    avatarUrl: "/images/influencers/ziyu-log.png",
    categories: ["리빙", "육아", "라이프스타일"],
    audience: "30-44 여성 · 육아/생활용품 관심",
    audienceCountries: ["south_korea", "vietnam"],
    audienceTags: ["육아", "생활용품", "실사용 후기", "저장형"],
    platforms: [
      {
        platform: "instagram",
        label: "피드/릴스",
        handle: "@ziyu.log",
        url: "https://instagram.com/ziyu.log",
        followersLabel: "5.1만",
        performanceLabel: "저장형 후기",
      },
      {
        platform: "youtube",
        label: "쇼츠",
        handle: "@ziyu.log",
        url: "https://youtube.com/@ziyu.log",
        followersLabel: "1.6만",
        performanceLabel: "생활 루틴 클립",
      },
    ],
    collaborationTypes: ["product_seeding", "sponsored_post", "supporters"],
    startingPriceLabel: "110만원부터",
    responseTimeLabel: "2영업일 내 응답",
    verifiedLabel: "활동 채널 확인됨",
    brandFit: ["생활용품", "육아템", "실사용 후기"],
    recentBrands: ["오브제스튜디오", "하우스핏"],
    portfolio: [
      {
        title: "아이방 정리용품 리뷰",
        brand: "오브제스튜디오",
        result: "저장 1,920회",
      },
    ],
    proposalHints: [
      "아이 노출 범위와 촬영 제한을 먼저 정리해 주세요.",
      "제품 사용 기간이 필요한 경우 충분한 검수 일정을 잡아 주세요.",
    ],
  },
];

export const marketplaceBrands: MarketplaceBrandProfile[] = [
  {
    id: "brand-breadroom",
    handle: "breadroom",
    displayName: "브레드룸",
    category: "뷰티 · 라이프스타일",
    headline: "신제품 런칭과 숏폼 전환을 함께할 크리에이터를 찾습니다",
    description:
      "사용 장면이 분명한 뷰티/라이프스타일 콘텐츠를 선호합니다. 브랜드 소개와 필수 표현은 가볍게 제공하고, 크리에이터의 자연스러운 사용 경험을 우선합니다.",
    location: "서울 성수",
    logoLabel: "BR",
    logoUrl: "/images/brands/breadroom-logo.png",
    preferredPlatforms: ["instagram", "youtube", "tiktok"],
    proposalTypes: ["sponsored_post", "product_seeding", "supporters", "ppl"],
    budgetRangeLabel: "100만-450만원",
    responseTimeLabel: "1영업일 내 확인",
    statusLabel: "입점 브랜드",
    fitTags: ["신제품 런칭", "릴스/쇼츠", "20-34 타깃"],
    audienceTargets: ["뷰티 입문자", "데일리 루틴", "선물 구매층"],
    activeCampaigns: [
      {
        title: "신제품 언박싱 릴스",
        type: "sponsored_post",
        applicantLimit: "12명",
        location: "온라인 배송",
        offer: "파우치 신제품 세트",
        targetCountries: ["south_korea", "japan", "taiwan"],
        thumbnailUrl: "/images/campaigns/breadroom-homecare-supporters-v2.png",
        budget: "180만-280만원",
        mission: "신제품 첫인상과 사용 장면을 릴스 또는 쇼츠로 제작",
        deadline: getRelativeCampaignDate(10),
        uploadDeadline: getRelativeCampaignDate(24),
      },
    ],
    recentCreators: ["제우", "민서홈"],
  },
  {
    id: "brand-monotrip",
    handle: "monotrip",
    displayName: "모노트립",
    category: "여행 · 로컬",
    headline: "방문형 리뷰와 브이로그 제안을 열어둔 여행 브랜드",
    description:
      "숙박, 로컬 체험, 카페 방문 콘텐츠를 찾습니다. 광고 표기와 콘텐츠 사용 기간은 계약에서 명확히 정리합니다.",
    location: "제주 · 강원",
    logoLabel: "MT",
    logoUrl: "/images/brands/monotrip-logo.png",
    preferredPlatforms: ["youtube", "instagram", "naver_blog"],
    proposalTypes: ["visit_review", "ppl", "sponsored_post"],
    budgetRangeLabel: "150만-600만원",
    responseTimeLabel: "2영업일 내 확인",
    statusLabel: "입점 브랜드",
    fitTags: ["방문 촬영", "롱폼 브이로그", "블로그 리뷰"],
    audienceTargets: ["주말 여행", "커플 여행", "로컬 체험"],
    activeCampaigns: [
      {
        title: "로컬 숙소 브이로그",
        type: "visit_review",
        applicantLimit: "6명",
        location: "제주 · 강원 방문",
        offer: "로컬 숙소 1박 체험",
        targetCountries: ["japan", "taiwan", "hong_kong"],
        thumbnailUrl: "/images/campaigns/monotrip-local-stay-v2.png",
        budget: "300만-500만원",
        mission: "객실, 체크인, 주변 동선을 브이로그와 후기 콘텐츠로 소개",
        deadline: getRelativeCampaignDate(3),
        uploadDeadline: getRelativeCampaignDate(14),
      },
    ],
    recentCreators: ["채널오브", "민서홈"],
  },
  {
    id: "brand-object-studio",
    handle: "object-studio",
    displayName: "오브제스튜디오",
    category: "리빙 · 소품",
    headline: "저장형 리빙 콘텐츠와 공동구매를 함께할 파트너를 찾습니다",
    description:
      "제품 배치, 공간 전후 비교, 실제 사용 루틴이 보이는 콘텐츠를 선호합니다. 공동구매는 수수료 조건을 계약서에 분리해 기록합니다.",
    location: "온라인 입점",
    logoLabel: "OS",
    logoUrl: "/images/brands/object-studio-logo.png",
    preferredPlatforms: ["instagram", "naver_blog", "youtube"],
    proposalTypes: ["product_seeding", "group_buy", "sponsored_post"],
    budgetRangeLabel: "80만-350만원",
    responseTimeLabel: "당일 확인 가능",
    statusLabel: "입점 브랜드",
    fitTags: ["리빙 소품", "공동구매", "저장형 콘텐츠"],
    audienceTargets: ["1인 가구", "홈오피스", "신혼 리빙"],
    activeCampaigns: [
      {
        title: "공간 정리 전후 리뷰",
        type: "product_seeding",
        applicantLimit: "7명",
        location: "온라인 배송",
        offer: "공간 정리 소품 세트",
        targetCountries: ["south_korea", "singapore", "malaysia"],
        thumbnailUrl: "/images/campaigns/object-studio-organization-v2.png",
        budget: "제품 제공 + 120만원",
        mission: "정리 전후 장면과 실제 사용 루틴을 사진/영상으로 제작",
        deadline: getRelativeCampaignDate(6),
        uploadDeadline: getRelativeCampaignDate(17),
      },
    ],
    recentCreators: ["제우", "민서홈"],
  },
  {
    id: "brand-obre-beauty",
    handle: "obre-beauty",
    displayName: "오브레뷰티",
    category: "뷰티 · 스킨케어",
    headline: "저자극 스킨케어 사용 후기를 자연스럽게 전할 크리에이터를 찾습니다",
    description:
      "민감 피부 루틴, 성분 비교, 아침저녁 사용감을 섬세하게 보여줄 수 있는 콘텐츠를 선호합니다.",
    location: "서울 강남",
    logoLabel: "OB",
    logoUrl: "/images/brands/obre-beauty-logo.png",
    preferredPlatforms: ["instagram", "youtube"],
    proposalTypes: ["product_seeding", "sponsored_post", "supporters"],
    budgetRangeLabel: "120만-380만원",
    responseTimeLabel: "1영업일 내 확인",
    statusLabel: "입점 브랜드",
    fitTags: ["스킨케어", "사용 후기", "성분 비교"],
    audienceTargets: ["민감 피부", "뷰티 루틴", "20-30 여성"],
    activeCampaigns: [
      {
        title: "진정 세럼 2주 루틴 리뷰",
        type: "product_seeding",
        applicantLimit: "9명",
        location: "온라인 배송",
        offer: "진정 세럼 본품",
        targetCountries: ["japan", "united_states", "thailand"],
        budget: "제품 제공 + 160만원",
        mission: "2주 사용 루틴과 민감 피부 사용감을 릴스와 스토리로 소개",
        deadline: getRelativeCampaignDate(4),
        uploadDeadline: getRelativeCampaignDate(13),
      },
    ],
    recentCreators: ["유나뷰티", "리뷰제이"],
  },
  {
    id: "brand-housefit",
    handle: "housefit",
    displayName: "하우스핏",
    category: "헬스 · 홈트",
    headline: "집에서 따라할 수 있는 운동 루틴 콘텐츠를 함께 만듭니다",
    description:
      "운동 초보도 이해하기 쉬운 루틴, 자세 설명, 짧은 챌린지형 콘텐츠를 우선 검토합니다.",
    location: "온라인 입점",
    logoLabel: "HF",
    logoUrl: "/images/brands/housefit-logo.png",
    preferredPlatforms: ["youtube", "instagram", "tiktok"],
    proposalTypes: ["ppl", "sponsored_post", "supporters"],
    budgetRangeLabel: "200만-700만원",
    responseTimeLabel: "2영업일 내 확인",
    statusLabel: "입점 브랜드",
    fitTags: ["홈트 루틴", "챌린지", "운동 초보"],
    audienceTargets: ["직장인 운동", "다이어트", "홈트 입문"],
    activeCampaigns: [
      {
        title: "10분 홈트 챌린지 쇼츠",
        type: "ppl",
        applicantLimit: "10명",
        location: "온라인 진행",
        offer: "운동 프로그램 이용권",
        targetCountries: ["south_korea", "thailand", "vietnam"],
        budget: "250만-450만원",
        mission: "집에서 따라할 수 있는 10분 루틴을 숏폼으로 제작",
        deadline: getRelativeCampaignDate(9),
        uploadDeadline: getRelativeCampaignDate(20),
      },
    ],
    recentCreators: ["하루핏", "지유로그"],
  },
  {
    id: "brand-brewinglab",
    handle: "brewinglab",
    displayName: "브루잉랩",
    category: "푸드 · 홈카페",
    headline: "홈카페 레시피와 공동구매를 연결할 파트너를 찾습니다",
    description:
      "원두, 드립백, 홈카페 도구를 실제 루틴 안에서 보여주는 콘텐츠와 공동구매 제안을 검토합니다.",
    location: "부산 · 온라인",
    logoLabel: "BL",
    logoUrl: "/images/brands/brewinglab-logo.png",
    preferredPlatforms: ["instagram", "naver_blog", "youtube"],
    proposalTypes: ["group_buy", "product_seeding", "sponsored_post"],
    budgetRangeLabel: "제품 제공-500만원",
    responseTimeLabel: "당일 확인 가능",
    statusLabel: "입점 브랜드",
    fitTags: ["홈카페", "레시피", "공동구매"],
    audienceTargets: ["홈카페", "커피 입문", "선물 구매"],
    activeCampaigns: [
      {
        title: "홈카페 드립백 공동구매",
        type: "group_buy",
        applicantLimit: "8명",
        location: "부산 · 온라인",
        offer: "드립백 세트",
        targetCountries: ["taiwan", "hong_kong", "singapore"],
        budget: "판매 수수료 + 제품 제공",
        mission: "홈카페 레시피와 공동구매 구매 포인트를 자연스럽게 연결",
        deadline: getRelativeCampaignDate(12),
        uploadDeadline: getRelativeCampaignDate(25),
      },
    ],
    recentCreators: ["오늘의취향", "민서홈"],
  },
  {
    id: "brand-nightcare",
    handle: "nightcare",
    displayName: "나이트케어",
    category: "헬스 · 수면케어",
    headline: "밤 루틴과 수면 케어 콘텐츠를 함께 만들 크리에이터를 찾습니다",
    description:
      "수면 전 루틴, 휴식, 웰니스 제품 사용 장면을 차분하게 보여주는 콘텐츠를 선호합니다.",
    location: "서울 · 온라인",
    logoLabel: "NC",
    logoUrl: "/images/brands/nightcare-logo.png",
    preferredPlatforms: ["instagram", "youtube", "tiktok"],
    proposalTypes: ["product_seeding", "sponsored_post", "ppl"],
    budgetRangeLabel: "120만-420만원",
    responseTimeLabel: "1영업일 내 확인",
    statusLabel: "입점 브랜드",
    fitTags: ["밤 루틴", "웰니스", "수면 케어"],
    audienceTargets: ["직장인", "휴식 루틴", "웰니스 관심층"],
    activeCampaigns: [
      {
        title: "나이트 루틴 숏폼 리뷰",
        type: "product_seeding",
        applicantLimit: "8명",
        location: "온라인 배송",
        offer: "수면 케어 제품",
        targetCountries: ["south_korea", "japan"],
        budget: "제품 제공 + 180만원",
        mission: "밤 루틴 안에서 제품 사용 장면과 휴식감을 숏폼으로 소개",
        deadline: getRelativeCampaignDate(5),
        uploadDeadline: getRelativeCampaignDate(16),
      },
    ],
    recentCreators: ["루나데이", "지유로그"],
  },
  {
    id: "brand-stayhour",
    handle: "stayhour",
    displayName: "스테이아워",
    category: "여행 · 숙박",
    headline: "숙박 경험과 로컬 동선을 자연스럽게 담을 크리에이터를 찾습니다",
    description:
      "객실, 주변 동선, 체크인 경험을 과장 없이 보여주는 방문형 리뷰와 브이로그 제안을 검토합니다.",
    location: "강원 · 제주",
    logoLabel: "SH",
    preferredPlatforms: ["youtube", "instagram", "naver_blog"],
    proposalTypes: ["visit_review", "ppl", "sponsored_post"],
    budgetRangeLabel: "200만-650만원",
    responseTimeLabel: "2영업일 내 확인",
    statusLabel: "입점 브랜드",
    fitTags: ["숙박 리뷰", "브이로그", "로컬 여행"],
    audienceTargets: ["주말 여행", "커플 여행", "숙박 탐색"],
    activeCampaigns: [
      {
        title: "주말 스테이 브이로그",
        type: "visit_review",
        applicantLimit: "5명",
        location: "강원 · 제주 방문",
        offer: "1박 숙박권",
        targetCountries: ["japan", "taiwan", "united_states"],
        thumbnailUrl: "/images/campaigns/stayhour-weekend-stay-v2.png",
        budget: "숙박 제공 + 300만원",
        mission: "객실, 체크인, 주변 동선을 브이로그와 후기형 콘텐츠로 기록",
        deadline: getRelativeCampaignDate(14),
        uploadDeadline: getRelativeCampaignDate(28),
      },
    ],
    recentCreators: ["채널오브", "루데이"],
  },
  {
    id: "brand-greenspoon",
    handle: "greenspoon",
    displayName: "그린스푼",
    category: "푸드 · 건강식",
    headline: "건강식 루틴과 식단 기록을 함께 보여줄 크리에이터를 찾습니다",
    description:
      "아침 식단, 도시락, 운동 후 식사처럼 실제 생활 장면에서 제품을 소개하는 콘텐츠를 선호합니다.",
    location: "온라인 입점",
    logoLabel: "GS",
    preferredPlatforms: ["instagram", "youtube", "naver_blog"],
    proposalTypes: ["product_seeding", "supporters", "sponsored_post"],
    budgetRangeLabel: "제품 제공-360만원",
    responseTimeLabel: "당일 확인 가능",
    statusLabel: "입점 브랜드",
    fitTags: ["건강식", "식단 루틴", "생활 리뷰"],
    audienceTargets: ["건강 관리", "직장인 식단", "홈트 관심층"],
    activeCampaigns: [
      {
        title: "아침 식단 루틴 리뷰",
        type: "product_seeding",
        applicantLimit: "10명",
        location: "온라인 배송",
        offer: "건강식 세트",
        targetCountries: ["south_korea", "vietnam", "indonesia"],
        thumbnailUrl: "/images/campaigns/greenspoon-breakfast-routine-v2.png",
        budget: "제품 제공 + 140만원",
        mission: "아침 식단 루틴과 제품 섭취 장면을 리뷰형 콘텐츠로 제작",
        deadline: getRelativeCampaignDate(8),
        uploadDeadline: getRelativeCampaignDate(19),
      },
    ],
    recentCreators: ["하루핏", "지유로그"],
  },
];

export function normalizeMarketplaceHandle(handle: string) {
  return handle
    .trim()
    .replace(/^https?:\/\/(www\.)?yeollock\.me\//i, "")
    .replace(/^yeollock\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^\//, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

const marketplaceBrandDisplayFamilyAliases = new Map([
  ["breadroom", "breadroom-family"],
  ["breadroom-partner", "breadroom-family"],
  ["브레드룸", "breadroom-family"],
  ["브래드룸", "breadroom-family"],
]);

export function getMarketplaceBrandDisplayFamilyKey({
  handle,
  displayName,
}: {
  handle?: string;
  displayName: string;
}) {
  const normalizedHandle = handle ? normalizeMarketplaceHandle(handle) : "";
  const normalizedName = displayName.trim().toLowerCase().replace(/\s+/g, "");

  return (
    marketplaceBrandDisplayFamilyAliases.get(normalizedHandle) ??
    marketplaceBrandDisplayFamilyAliases.get(normalizedName) ??
    (normalizedHandle || normalizedName)
  );
}

export function mergeMarketplaceInfluencerProfiles(
  accountProfiles: MarketplaceInfluencerProfile[] = [],
) {
  const byHandle = new Map<string, MarketplaceInfluencerProfile>();

  [...accountProfiles, ...marketplaceInfluencers].forEach((profile) => {
    const normalized = normalizeMarketplaceHandle(profile.handle);
    if (!byHandle.has(normalized)) {
      byHandle.set(normalized, {
        ...profile,
        source: profile.source ?? "registered",
      });
    }
  });

  return Array.from(byHandle.values());
}

export function mergeMarketplaceBrandProfiles(
  accountProfiles: MarketplaceBrandProfile[] = [],
) {
  const byHandle = new Map<string, MarketplaceBrandProfile>();

  [...accountProfiles, ...marketplaceBrands].forEach((profile) => {
    const normalized = normalizeMarketplaceHandle(profile.handle);
    if (!byHandle.has(normalized)) byHandle.set(normalized, profile);
  });

  return Array.from(byHandle.values());
}

export function findInfluencerProfileByHandle(
  handle: string | undefined,
  accountProfiles: MarketplaceInfluencerProfile[] = [],
) {
  if (!handle) return undefined;
  const normalized = normalizeMarketplaceHandle(handle);
  const profiles =
    accountProfiles.length > 0 ? accountProfiles : mergeMarketplaceInfluencerProfiles();
  return profiles.find(
    (profile) => normalizeMarketplaceHandle(profile.handle) === normalized,
  );
}

export function findInfluencerProfileByDisplayName(
  displayName: string | undefined,
  accountProfiles: MarketplaceInfluencerProfile[] = [],
) {
  const normalizedName = displayName?.trim().replace(/\s+/g, " ");
  if (!normalizedName) return undefined;
  const profiles =
    accountProfiles.length > 0 ? accountProfiles : mergeMarketplaceInfluencerProfiles();
  return profiles.find(
    (profile) => profile.displayName.trim().replace(/\s+/g, " ") === normalizedName,
  );
}

export function findBrandProfileByHandle(
  handle: string | undefined,
  accountProfiles: MarketplaceBrandProfile[] = [],
) {
  if (!handle) return undefined;
  const normalized = normalizeMarketplaceHandle(handle);
  const profiles = mergeMarketplaceBrandProfiles(accountProfiles);
  const exactMatch = profiles.find(
    (profile) => normalizeMarketplaceHandle(profile.handle) === normalized,
  );
  if (exactMatch) return exactMatch;

  const familyKey = marketplaceBrandDisplayFamilyAliases.get(normalized);
  if (!familyKey) return undefined;

  return profiles.find(
    (profile) =>
      getMarketplaceBrandDisplayFamilyKey({
        handle: profile.handle,
        displayName: profile.displayName,
      }) === familyKey,
  );
}

export function getInfluencerProfilePath(profile: MarketplaceInfluencerProfile) {
  return `/${normalizeMarketplaceHandle(
    profile.publicProfilePublished && profile.publicProfileHandle
      ? profile.publicProfileHandle
      : profile.handle,
  )}`;
}

export function canOpenInfluencerPublicProfile(
  profile: MarketplaceInfluencerProfile,
) {
  return !(
    profile.registrationVisibility === "authenticated_advertisers" &&
    !profile.publicProfilePublished
  );
}

export function getInfluencerProfilePathByDisplayName(displayName: string | undefined) {
  const profile = findInfluencerProfileByDisplayName(displayName);
  return profile ? getInfluencerProfilePath(profile) : undefined;
}

export function getChannelAudienceSortValue(
  platforms: Array<{
    platform?: InfluencerPlatform;
    followersLabel?: string;
    metricTrust?: "self_reported";
  }> = [],
) {
  const values = platforms
    .filter(
      (platform) =>
        platform.platform !== "naver_blog" &&
        platform.metricTrust !== "self_reported",
    )
    .map((platform) => parseAudienceCountLabel(platform.followersLabel))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : Number.NaN;
}

export function compareChannelAudienceValues(
  valueA: number,
  valueB: number,
  direction: "asc" | "desc" = "desc",
) {
  const validA = Number.isFinite(valueA);
  const validB = Number.isFinite(valueB);

  if (!validA && !validB) return 0;
  if (!validA) return 1;
  if (!validB) return -1;

  return direction === "asc" ? valueA - valueB : valueB - valueA;
}

function parseAudienceCountLabel(value: string | undefined) {
  if (!value) return Number.NaN;

  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const matches = Array.from(
    normalized.matchAll(/(\d+(?:\.\d+)?)\s*(억|만|천|k|m)?/g),
  );

  if (matches.length === 0) return Number.NaN;

  return Math.max(
    ...matches.map((match) => {
      const amount = Number(match[1]);
      const unit = match[2];
      const multiplier =
        unit === "억"
          ? 100_000_000
          : unit === "만"
            ? 10_000
            : unit === "천" || unit === "k"
              ? 1_000
              : unit === "m"
                ? 1_000_000
                : 1;

      return amount * multiplier;
    }),
  );
}

export function getBrandProfilePath(profile: MarketplaceBrandProfile) {
  return `/brands/${profile.handle}`;
}

export function formatProposalTypes(types: CampaignProposalType[]) {
  return types.map((type) => proposalTypeLabels[type]).join(", ");
}

export function getCampaignDeadlineLabel(deadline: string | undefined) {
  if (!deadline) return "상시 검토";
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isMarketplaceCampaignRecruiting(deadline: string | undefined) {
  if (!deadline) return true;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return true;

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const deadlineStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  return deadlineStart >= todayStart;
}

export function buildMarketplaceCampaignPosts(
  brands: MarketplaceBrandProfile[],
): MarketplaceCampaignPost[] {
  return brands
    .flatMap((brand) =>
      brand.activeCampaigns.map((campaign, index) => {
        const platforms =
          campaign.platforms && campaign.platforms.length > 0
            ? campaign.platforms
            : brand.preferredPlatforms;

        return {
          ...campaign,
          id: campaign.id ?? `${brand.id}:${index}:${campaign.title}`,
          brandId: brand.id,
          brandHandle: brand.handle,
          brandName: brand.displayName,
          brandCategory: brand.category,
          brandHeadline: brand.headline,
          brandLocation: brand.location,
          brandLogoLabel: brand.logoLabel,
          brandLogoUrl: brand.logoUrl,
          brandHref: getBrandProfilePath(brand),
          typeLabel: getCampaignProposalTypeDisplayLabel(campaign),
          platformLabels: platforms.map((platform) => platformLabels[platform]),
          deadlineLabel: getCampaignDeadlineLabel(campaign.deadline),
          location: campaign.location ?? brand.location,
          thumbnailUrl: campaign.thumbnailUrl ?? brand.logoUrl,
          platforms,
          status: campaign.status ?? "open",
          acceptsApplications: isMarketplaceApplicationBrandId(brand.id),
        } satisfies MarketplaceCampaignPost;
      }),
    )
    .filter(
      (campaign) =>
        campaign.status === "open" &&
        isMarketplaceCampaignRecruiting(campaign.deadline),
    );
}

export function getPlatformTone(platform: InfluencerPlatform) {
  const tones: Record<InfluencerPlatform, string> = {
    instagram: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    youtube: "border-rose-200 bg-rose-50 text-rose-700",
    tiktok: "border-neutral-800 bg-neutral-950 text-white",
    naver_blog: "border-emerald-200 bg-emerald-50 text-emerald-700",
    other: "border-neutral-200 bg-white text-neutral-600",
  };

  return tones[platform];
}
