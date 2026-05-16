import type { InfluencerPlatform } from "./verification.js";

export type CampaignProposalType =
  | "sponsored_post"
  | "product_seeding"
  | "ppl"
  | "group_buy"
  | "visit_review";

export type MarketplaceCampaignStatus = "open" | "draft" | "closed";

export type MarketplaceBrandCampaign = {
  id?: string;
  title: string;
  type: CampaignProposalType;
  budget: string;
  summary?: string;
  deadline?: string;
  platforms?: InfluencerPlatform[];
  deliverables?: string[];
  status?: MarketplaceCampaignStatus;
};

export type MarketplaceInfluencerProfile = {
  id: string;
  handle: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  avatarLabel: string;
  categories: string[];
  audience: string;
  audienceTags: string[];
  platforms: Array<{
    platform: InfluencerPlatform;
    label: string;
    handle: string;
    url: string;
    followersLabel: string;
    performanceLabel: string;
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
};

export type MarketplaceBrandProfile = {
  id: string;
  handle: string;
  displayName: string;
  category: string;
  headline: string;
  description: string;
  location: string;
  logoLabel: string;
  preferredPlatforms: InfluencerPlatform[];
  proposalTypes: CampaignProposalType[];
  budgetRangeLabel: string;
  responseTimeLabel: string;
  statusLabel: string;
  fitTags: string[];
  audienceTargets: string[];
  activeCampaigns: MarketplaceBrandCampaign[];
  recentCreators: string[];
};

export type MarketplaceCampaignPost = MarketplaceBrandCampaign & {
  id: string;
  brandId: string;
  brandHandle: string;
  brandName: string;
  brandCategory: string;
  brandHeadline: string;
  brandLogoLabel: string;
  brandHref: string;
  typeLabel: string;
  platformLabels: string[];
  deadlineLabel: string;
};

export const proposalTypeLabels: Record<CampaignProposalType, string> = {
  sponsored_post: "유료 광고",
  product_seeding: "제품 협찬",
  ppl: "PPL",
  group_buy: "공동구매",
  visit_review: "방문 리뷰",
};

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
    collaborationTypes: ["sponsored_post", "product_seeding", "ppl"],
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
        followersLabel: "1.2만",
        performanceLabel: "검색 유입 강점",
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
    preferredPlatforms: ["instagram", "youtube", "tiktok"],
    proposalTypes: ["sponsored_post", "product_seeding", "ppl"],
    budgetRangeLabel: "100만-450만원",
    responseTimeLabel: "1영업일 내 확인",
    statusLabel: "입점 브랜드",
    fitTags: ["신제품 런칭", "릴스/쇼츠", "20-34 타깃"],
    audienceTargets: ["뷰티 입문자", "데일리 루틴", "선물 구매층"],
    activeCampaigns: [
      {
        title: "신제품 언박싱 릴스",
        type: "sponsored_post",
        budget: "180만-280만원",
      },
      {
        title: "파우치 필수템 리뷰",
        type: "product_seeding",
        budget: "제품 제공 + 제작비",
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
        budget: "300만-500만원",
      },
      {
        title: "여행 코스 블로그 리뷰",
        type: "sponsored_post",
        budget: "120만-220만원",
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
        budget: "제품 제공 + 120만원",
      },
      {
        title: "공동구매 파일럿",
        type: "group_buy",
        budget: "판매 수수료 협의",
      },
    ],
    recentCreators: ["제우", "민서홈"],
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

export function mergeMarketplaceInfluencerProfiles(
  accountProfiles: MarketplaceInfluencerProfile[] = [],
) {
  const byHandle = new Map<string, MarketplaceInfluencerProfile>();

  [...accountProfiles, ...marketplaceInfluencers].forEach((profile) => {
    const normalized = normalizeMarketplaceHandle(profile.handle);
    if (!byHandle.has(normalized)) byHandle.set(normalized, profile);
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
  return mergeMarketplaceInfluencerProfiles(accountProfiles).find(
    (profile) => normalizeMarketplaceHandle(profile.handle) === normalized,
  );
}

export function findBrandProfileByHandle(
  handle: string | undefined,
  accountProfiles: MarketplaceBrandProfile[] = [],
) {
  if (!handle) return undefined;
  const normalized = normalizeMarketplaceHandle(handle);
  return mergeMarketplaceBrandProfiles(accountProfiles).find(
    (profile) => normalizeMarketplaceHandle(profile.handle) === normalized,
  );
}

export function getInfluencerProfilePath(profile: MarketplaceInfluencerProfile) {
  return `/${normalizeMarketplaceHandle(profile.handle)}`;
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
          brandLogoLabel: brand.logoLabel,
          brandHref: getBrandProfilePath(brand),
          typeLabel: proposalTypeLabels[campaign.type],
          platformLabels: platforms.map((platform) => platformLabels[platform]),
          deadlineLabel: getCampaignDeadlineLabel(campaign.deadline),
          platforms,
          status: campaign.status ?? "open",
        } satisfies MarketplaceCampaignPost;
      }),
    )
    .filter((campaign) => campaign.status !== "closed");
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
