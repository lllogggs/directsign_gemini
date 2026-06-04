import { platformLabels } from "./marketplace.js";
import type { InfluencerPlatform } from "./verification.js";

export function getPlatformDisplayName(platform: InfluencerPlatform) {
  if (platform === "instagram") return "인스타그램";
  if (platform === "youtube") return "유튜브";
  if (platform === "tiktok") return "틱톡";
  if (platform === "naver_blog") return "네이버 블로그";
  return platformLabels[platform] ?? "기타";
}
