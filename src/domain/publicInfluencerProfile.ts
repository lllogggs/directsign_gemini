import type {
  InfluencerDashboardResponse,
  InfluencerActivityCategory,
} from "./influencerDashboard.js";
import type {
  CampaignProposalType,
  MarketplaceInfluencerProfile,
} from "./marketplace.js";
import { platformLabels } from "./marketplace.js";
import type { InfluencerPlatform } from "./verification.js";

export type InfluencerPublicProfileSettings = {
  ownerId: string;
  handle: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  audience: string;
  avatarLabel: string;
  categories: string[];
  brandFit: string[];
  collaborationTypes: CampaignProposalType[];
  startingPriceLabel: string;
  responseTimeLabel: string;
  platforms: Array<{
    platform: InfluencerPlatform;
    handle: string;
    url?: string;
  }>;
  published: boolean;
  updatedAt: string;
};

const reservedProfileHandles = new Set([
  "admin",
  "advertiser",
  "api",
  "brands",
  "contract",
  "influencer",
  "intro",
  "legal",
  "login",
  "marketing",
  "privacy",
  "signup",
  "terms",
]);

const categoryLabels: Record<InfluencerActivityCategory, string> = {
  mukbang: "먹방",
  travel: "여행",
  beauty: "뷰티",
  fashion: "패션",
  fitness: "피트니스",
  tech: "테크",
  game: "게임",
  education: "교육",
  lifestyle: "라이프스타일",
  finance: "금융",
};

const collaborationTypeFallbacks: CampaignProposalType[] = [
  "sponsored_post",
  "product_seeding",
];

export function normalizePublicProfileHandle(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?yeollock\.me\//i, "")
    .replace(/^yeollock\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^\//, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

export function getInfluencerPublicProfilePath(handle: string) {
  const clean = normalizePublicProfileHandle(handle);
  return clean ? `/${clean}` : "/";
}

export function formatInfluencerPublicProfileUrl(handle: string) {
  const clean = normalizePublicProfileHandle(handle);
  return clean ? `yeollock.me/${clean}` : "yeollock.me";
}

export function buildInfluencerPublicProfileUrl(handle: string) {
  return `https://${formatInfluencerPublicProfileUrl(handle)}`;
}

export function getAutomaticPublicProfileHandle(
  platforms: Array<{ handle: string }> | undefined,
) {
  const firstPlatformHandle = platforms?.[0]?.handle;
  if (!firstPlatformHandle) return undefined;

  const normalized = normalizePublicProfileHandle(firstPlatformHandle).replace(
    /\s+/g,
    "_",
  );

  return normalized || undefined;
}

export function getPublicProfileHandleError(handle: string) {
  if (!handle) return "공개 주소를 입력해 주세요.";
  if (handle.length < 3 || handle.length > 30) {
    return "공개 주소는 3-30자로 입력해 주세요.";
  }
  if (!/^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/.test(handle)) {
    return "영문 소문자, 숫자, 밑줄, 하이픈, 점만 사용할 수 있습니다.";
  }
  if (reservedProfileHandles.has(handle)) {
    return "서비스에서 사용하는 주소라 다른 주소를 선택해 주세요.";
  }
  return undefined;
}

export type InfluencerPublicProfileResponse = {
  profile: InfluencerPublicProfileSettings | null;
};

export function buildDefaultPublicProfileSettings(
  dashboard: InfluencerDashboardResponse,
): InfluencerPublicProfileSettings {
  const approvedPlatforms = dashboard.verification.approved_platforms;
  const defaultHandle = getAutomaticPublicProfileHandle(approvedPlatforms) ?? "";
  const categories = dashboard.user.activity_categories
    .map((category) => categoryLabels[category])
    .filter(Boolean);

  return {
    ownerId: dashboard.user.id,
    handle: defaultHandle,
    displayName: dashboard.user.name || "인플루언서",
    headline: "브랜드 협업을 위한 공개 프로필",
    bio:
      "활동 채널, 협업 가능 광고 형태, 선호하는 제안 내용을 정리해 광고주가 빠르게 컨택할 수 있도록 합니다.",
    location: "활동 지역 미입력",
    audience:
      categories.length > 0
        ? `${categories.join(", ")} 관심 고객`
        : "관심사 기반 팔로워",
    avatarLabel: buildAvatarLabel(dashboard.user.name),
    categories: categories.length > 0 ? categories : ["라이프스타일"],
    brandFit: ["브랜드 소개 확인", "광고 형태 협의", "계약 전 조건 확인"],
    collaborationTypes: collaborationTypeFallbacks,
    startingPriceLabel: "협의 가능",
    responseTimeLabel: "프로필 확인 후 응답",
    platforms: approvedPlatforms.map((platform) => ({
      platform: platform.platform,
      handle: platform.handle,
      url: platform.url,
    })),
    published: false,
    updatedAt: new Date().toISOString(),
  };
}

export function buildPublicProfileSettingsFromForm(
  dashboard: InfluencerDashboardResponse,
  form: {
    displayName: string;
    headline: string;
    bio: string;
    location: string;
    startingPriceLabel: string;
    responseTimeLabel: string;
    brandFit: string;
    collaborationTypes: CampaignProposalType[];
  },
): InfluencerPublicProfileSettings {
  const defaults = buildDefaultPublicProfileSettings(dashboard);
  const brandFit = parseCommaSeparated(form.brandFit);
  const collaborationTypes =
    form.collaborationTypes.length > 0
      ? form.collaborationTypes
      : defaults.collaborationTypes;

  return {
    ...defaults,
    handle: defaults.handle,
    displayName: form.displayName.trim(),
    headline: form.headline.trim(),
    bio: form.bio.trim(),
    location: form.location.trim() || defaults.location,
    startingPriceLabel:
      form.startingPriceLabel.trim() || defaults.startingPriceLabel,
    responseTimeLabel:
      form.responseTimeLabel.trim() || defaults.responseTimeLabel,
    brandFit: brandFit.length > 0 ? brandFit : defaults.brandFit,
    collaborationTypes,
    published: true,
    updatedAt: new Date().toISOString(),
  };
}

export function createMarketplaceProfileFromPublicSettings(
  settings: InfluencerPublicProfileSettings,
): MarketplaceInfluencerProfile {
  return {
    id: `account-${settings.ownerId}`,
    handle: settings.handle,
    displayName: settings.displayName,
    headline: settings.headline,
    bio: settings.bio,
    location: settings.location,
    avatarLabel: settings.avatarLabel,
    categories: settings.categories,
    audience: settings.audience,
    audienceTags: settings.categories,
    platforms:
      settings.platforms.length > 0
        ? settings.platforms.map((platform) => ({
            platform: platform.platform,
            label: platformLabels[platform.platform],
            handle: formatStoredPlatformHandle(platform.handle, platform.platform),
            url: platform.url ?? buildPlatformUrl(platform.platform, platform.handle),
            followersLabel: "계정 연동",
            performanceLabel: "프로필에서 확인",
          }))
        : [
            {
              platform: "other",
              label: "연락미 프로필",
              handle: settings.handle,
              url: buildInfluencerPublicProfileUrl(settings.handle),
              followersLabel: "프로필 공개",
              performanceLabel: "제안 가능",
            },
          ],
    collaborationTypes: settings.collaborationTypes,
    startingPriceLabel: settings.startingPriceLabel,
    responseTimeLabel: settings.responseTimeLabel,
    verifiedLabel:
      settings.platforms.length > 0 ? "계정 프로필 연동" : "공개 프로필 설정",
    brandFit: settings.brandFit,
    recentBrands: ["입점 브랜드 제안 가능"],
    portfolio: [
      {
        title: "공개 프로필",
        brand: "연락미",
        result: "광고주 컨택 접수 가능",
      },
    ],
    proposalHints: [
      "브랜드 소개와 광고 형태를 함께 보내면 검토가 빠릅니다.",
      "콘텐츠 사용 범위와 희망 일정을 제안에 포함해 주세요.",
      "최종 조건은 전자계약 단계에서 다시 확인합니다.",
    ],
  };
}

function buildAvatarLabel(name: string) {
  const normalized = name.trim();
  if (!normalized) return "IN";

  const ascii = normalized.replace(/[^a-zA-Z0-9]/g, "");
  if (ascii.length >= 2) return ascii.slice(0, 2).toUpperCase();
  if (ascii.length === 1) return ascii.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
}

function parseCommaSeparated(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function formatStoredPlatformHandle(
  handle: string,
  platform: InfluencerPlatform,
) {
  const clean = handle.trim();
  if (!clean) return "계정 미입력";
  if (platform === "naver_blog") return clean.replace(/^@/, "");
  return clean.startsWith("@") ? clean : `@${clean}`;
}

function buildPlatformUrl(platform: InfluencerPlatform, handle: string) {
  const clean = normalizePublicProfileHandle(handle);
  if (platform === "instagram") return `https://instagram.com/${clean}`;
  if (platform === "youtube") return `https://youtube.com/@${clean}`;
  if (platform === "tiktok") return `https://tiktok.com/@${clean}`;
  if (platform === "naver_blog") return `https://blog.naver.com/${clean}`;
  return buildInfluencerPublicProfileUrl(clean);
}
