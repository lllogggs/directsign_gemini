import type { InfluencerPlatform } from "./verification.js";

export const CAMPAIGN_ELIGIBILITY_MAXIMUM = 1_000_000_000;

export type CampaignEligibilityPlatform = Extract<
  InfluencerPlatform,
  "instagram" | "youtube" | "naver_blog"
>;

export type CampaignEligibilityRule =
  | {
      platform: "instagram";
      metric: "followers";
      minimum: number;
    }
  | {
      platform: "youtube";
      metric: "subscribers";
      minimum: number;
    }
  | {
      platform: "naver_blog";
      metric: "average_daily_visitors_4d";
      minimum: number;
    }
  | {
      platform: "naver_blog";
      metric: "naver_influencer";
    };

export type NaverCampaignEligibilityMode = Extract<
  CampaignEligibilityRule,
  { platform: "naver_blog" }
>["metric"];

export const campaignEligibilityPlatforms: CampaignEligibilityPlatform[] = [
  "instagram",
  "youtube",
  "naver_blog",
];

export const campaignEligibilityPolicy = {
  instagram: {
    metric: "followers",
    label: "인스타그램 팔로워",
    inputLabel: "최소 팔로워 수",
    refresh: "live_api",
  },
  youtube: {
    metric: "subscribers",
    label: "유튜브 구독자",
    inputLabel: "최소 구독자 수",
    refresh: "live_api",
  },
  naver_blog: {
    metric: "average_daily_visitors_4d",
    label: "네이버 블로그 최근 4일 일평균 방문자",
    inputLabel: "최근 4일 최소 일평균 방문자 수",
    refresh: "private_30_day_cache",
  },
} as const;

export function isCampaignEligibilityPlatform(
  value: unknown,
): value is CampaignEligibilityPlatform {
  return (
    typeof value === "string" &&
    campaignEligibilityPlatforms.includes(value as CampaignEligibilityPlatform)
  );
}

export function getCampaignEligibilityMetric(
  platform: CampaignEligibilityPlatform,
  naverMode: NaverCampaignEligibilityMode = "average_daily_visitors_4d",
): CampaignEligibilityRule["metric"] {
  if (platform === "naver_blog") return naverMode;
  return campaignEligibilityPolicy[platform].metric;
}

export function normalizeCampaignEligibilityRules(
  value: unknown,
): CampaignEligibilityRule[] {
  if (!Array.isArray(value)) return [];

  const rules: CampaignEligibilityRule[] = [];
  const seenPlatforms = new Set<CampaignEligibilityPlatform>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const platform = record.platform;
    if (!isCampaignEligibilityPlatform(platform) || seenPlatforms.has(platform)) {
      continue;
    }
    if (
      platform === "naver_blog" &&
      record.metric === "naver_influencer" &&
      !("minimum" in record)
    ) {
      seenPlatforms.add(platform);
      rules.push({ platform, metric: "naver_influencer" });
      continue;
    }

    if (typeof record.minimum !== "number") continue;
    const minimum = record.minimum;
    if (
      record.metric !== getCampaignEligibilityMetric(platform) ||
      !Number.isSafeInteger(minimum) ||
      minimum < 1 ||
      minimum > CAMPAIGN_ELIGIBILITY_MAXIMUM
    ) continue;

    seenPlatforms.add(platform);
    if (platform === "instagram") {
      rules.push({ platform, metric: "followers", minimum });
    } else if (platform === "youtube") {
      rules.push({ platform, metric: "subscribers", minimum });
    } else {
      rules.push({
        platform,
        metric: "average_daily_visitors_4d",
        minimum,
      });
    }
  }

  return campaignEligibilityPlatforms.flatMap((platform) =>
    rules.filter((rule) => rule.platform === platform),
  );
}

export function validateCampaignEligibilityRules(
  value: unknown,
  selectedPlatforms: readonly InfluencerPlatform[],
):
  | { ok: true; rules: CampaignEligibilityRule[] }
  | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, rules: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: "지원 조건을 다시 확인해 주세요." };
  }
  if (value.length > campaignEligibilityPlatforms.length) {
    return { ok: false, error: "지원 조건은 플랫폼별로 하나씩 설정해 주세요." };
  }

  const rules = normalizeCampaignEligibilityRules(value);
  if (rules.length !== value.length) {
    return {
      ok: false,
      error:
        "지원 조건은 인스타그램 팔로워, 유튜브 구독자, 네이버 인플루언서 또는 블로그 일평균 방문자만 설정할 수 있습니다.",
    };
  }
  if (rules.some((rule) => !selectedPlatforms.includes(rule.platform))) {
    return {
      ok: false,
      error: "선택한 플랫폼에 대해서만 지원 조건을 설정해 주세요.",
    };
  }
  return { ok: true, rules };
}

export function formatCampaignEligibilityRule(rule: CampaignEligibilityRule) {
  if (rule.metric === "naver_influencer") return "네이버 인플루언서";
  return `${campaignEligibilityPolicy[rule.platform].label} ${rule.minimum.toLocaleString(
    "ko-KR",
  )}명 이상`;
}

export function formatCampaignEligibilityRules(
  rules: readonly CampaignEligibilityRule[] | undefined,
) {
  return (rules ?? []).map(formatCampaignEligibilityRule).join(" · ");
}
