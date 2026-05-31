const influencerAvatarByHandle: Record<string, string> = {
  "channel-ove": "/images/influencers/channel-ove.png",
  "channel_ove": "/images/influencers/channel-ove.png",
  "channelove": "/images/influencers/channel-ove.png",
  "creator-sora": "/images/influencers/creator-sora.png",
  "creator.sora": "/images/influencers/creator-sora.png",
  "creator_sora": "/images/influencers/creator-sora.png",
  "haru-fit": "/images/influencers/haru-fit.png",
  "haru.fit": "/images/influencers/haru-fit.png",
  "luna-day": "/images/influencers/luna-day.png",
  "luna.day": "/images/influencers/luna-day.png",
  "minseo-home": "/images/influencers/minseo-home.png",
  "minseo.home": "/images/influencers/minseo-home.png",
  "minseo_home": "/images/influencers/minseo-home.png",
  "rooday": "/images/influencers/rooday.png",
  "today-taste": "/images/influencers/today-taste.png",
  "today.taste": "/images/influencers/today-taste.png",
  "today_taste": "/images/influencers/today-taste.png",
  "zeu-k": "/images/influencers/zeu-k.png",
  "zeu.k": "/images/influencers/zeu-k.png",
  "zeu_k": "/images/influencers/zeu-k.png",
  "ziyu-log": "/images/influencers/ziyu-log.png",
  "ziyu.log": "/images/influencers/ziyu-log.png",
};

type MarketplaceAvatarProfile = {
  handle?: string | null;
  avatarUrl?: string | null;
};

export function getMarketplaceInfluencerAvatarUrl(
  profile: MarketplaceAvatarProfile,
) {
  const uploadedUrl = normalizeMarketplaceImageUrl(profile.avatarUrl);
  if (uploadedUrl) return uploadedUrl;

  return getMarketplaceInfluencerAvatarUrlFromHandle(profile.handle);
}

export function getMarketplaceInfluencerAvatarUrlFromHref(
  href: string | undefined,
  avatarUrl?: string,
) {
  const uploadedUrl = normalizeMarketplaceImageUrl(avatarUrl);
  if (uploadedUrl) return uploadedUrl;

  if (!href) return undefined;
  return getMarketplaceInfluencerAvatarUrlFromHandle(
    extractMarketplaceHandleFromHref(href),
  );
}

export function getMarketplaceInfluencerAvatarUrlFromHandle(
  handle: string | undefined | null,
) {
  const normalized = normalizeMarketplaceAvatarKey(handle);
  if (!normalized) return undefined;

  return (
    influencerAvatarByHandle[normalized] ??
    influencerAvatarByHandle[normalized.replace(/[._]/g, "-")] ??
    influencerAvatarByHandle[normalized.replace(/-/g, ".")] ??
    influencerAvatarByHandle[normalized.replace(/[-.]/g, "_")]
  );
}

export function normalizeMarketplaceImageUrl(value: string | undefined | null) {
  const clean = value?.trim();
  if (!clean) return undefined;
  if (/^(https?:\/\/|\/)/i.test(clean)) return clean;
  return undefined;
}

function extractMarketplaceHandleFromHref(href: string) {
  const clean = href.trim();
  if (!clean) return "";

  try {
    return new URL(clean, "https://yeollock.me").pathname.replace(/^\/+/, "");
  } catch {
    return clean.replace(/^\/+/, "");
  }
}

function normalizeMarketplaceAvatarKey(value: string | undefined | null) {
  return (value ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?yeollock\.me\//i, "")
    .replace(/^yeollock\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^\//, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}
