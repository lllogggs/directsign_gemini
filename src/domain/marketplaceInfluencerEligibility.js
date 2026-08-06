import { classifyDiscoveredInfluencerAccount } from "./influencerDiscoveryQuality.js";

const normalizeText = (value) => String(value ?? "").trim();

const operationalTestTextPattern =
  /\b(?:qa|test|demo|seed|showcase|dummy)\b|\uD14C\uC2A4\uD2B8|\uB370\uBAA8|\uC2DC\uB4DC|\uC608\uC2DC|\uC0D8\uD50C/i;

const knownOperationalSeedHandles = new Set([
  "breadroom",
  "breadroom-partner",
  "obre",
  "housefit",
  "brewinglab",
  "nightcare",
  "creator-sora",
  "creator.sora",
  "creator_sora",
  "minseo-home",
  "minseo.home",
  "today-taste",
  "today.taste",
  "haru-fit",
  "haru.fit",
  "ziyu-log",
  "ziyu.log",
  "luna-day",
  "luna.day",
  "yuna-beauty",
  "yuna.beauty",
  "review-j",
  "review.j",
  "only-routine",
  "only.routine",
  "harin-log",
  "harin.log",
  "moa-review",
  "moa.review",
  "sua-pick",
  "sua.pick",
  "raon-beauty",
  "raon.beauty",
  "jian-home",
  "jian.home",
  "serin-daily",
  "serin.daily",
  "narae-shorts",
  "narae.shorts",
  "romi-review",
  "romi.review",
  "sodam-pick",
  "sodam.pick",
]);

const hasExplicitOperationalTestMarker = (value, depth = 0) => {
  if (!value || depth > 4) return false;
  if (Array.isArray(value)) {
    return value.some((item) =>
      hasExplicitOperationalTestMarker(item, depth + 1),
    );
  }
  if (typeof value !== "object") return false;

  return Object.entries(value).some(([key, item]) => {
    if (["seeded", "is_test", "test_data"].includes(key) && item === true) {
      return true;
    }
    if (
      ["source", "configured_by", "user_agent", "note"].includes(key) &&
      typeof item === "string" &&
      operationalTestTextPattern.test(item)
    ) {
      return true;
    }
    return hasExplicitOperationalTestMarker(item, depth + 1);
  });
};

export function hasMarketplaceOperationalTestMarker(row) {
  const handles = [row?.public_handle, row?.platform_handle]
    .map((value) => normalizeText(value).replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  if (handles.some((handle) => knownOperationalSeedHandles.has(handle))) {
    return true;
  }

  const visibleText = [
    row?.public_handle,
    row?.platform_handle,
    row?.display_name,
    row?.headline,
    row?.bio,
    row?.source_provider,
    row?.source_keyword,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    operationalTestTextPattern.test(visibleText) ||
    hasExplicitOperationalTestMarker(row?.source_evidence)
  );
}

export function normalizeDiscoveredInfluencerDisplayName(row) {
  const fallback = row?.platform_handle || row?.public_handle || row?.id || "";
  const rawName = normalizeText(row?.display_name) || fallback;
  const handle = normalizeText(row?.platform_handle || row?.public_handle);
  const handleWithoutAt = handle.replace(/^@/, "");
  let name = rawName
    .replace(
      /\s*[|｜]\s*(?:TikTok|YouTube|Instagram|NAVER|Naver(?: Blog)?|네이버(?:\s*블로그)?)\s*$/i,
      "",
    )
    .replace(
      /\s*[-–—]\s*(?:TikTok|YouTube|Instagram|NAVER|Naver(?: Blog)?|네이버(?:\s*블로그)?)\s*$/i,
      "",
    )
    .replace(/\s*\((?:@[^)]+|[^)]*TikTok[^)]*|[^)]*YouTube[^)]*)\)\s*$/i, "")
    .replace(/\s*@[\w.]{2,32}\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!name || /^[@\W_]+$/.test(name)) {
    name = handle ? handle.replace(/^@/, "") : fallback;
  }

  if (handleWithoutAt && name.toLowerCase() === handleWithoutAt.toLowerCase()) {
    return handle.replace(/^@/, "");
  }

  return name;
}

export function isClearlyBusinessDiscoveredInfluencerRow(row) {
  const text = [
    row?.display_name,
    row?.headline,
    row?.bio,
    row?.platform_handle,
    row?.source_keyword,
    ...(Array.isArray(row?.categories) ? row.categories : []),
  ]
    .filter(Boolean)
    .join(" ");

  return [
    /(?:블로그대행|포스팅대행|마케팅대행|체험단대행|상위\s*노출|노출\s*보장|구매평)/i,
    /(?:실내건축|면허|보유업체|카카오채널문의|인스타그램\s*@).{0,24}(?:인테리어|견적|시공|문의|검색|아이디검색)/i,
    /(?:인테리어|리모델링).{0,24}(?:실내건축|면허|보유업체|카카오채널문의|시공|견적|유선문의)/i,
    /(?:업체|회사|견적|문의|상담|전문).{0,16}(?:인테리어|리모델링|시공|설계)/i,
    /(?:interior|design|remodeling).{0,32}(?:company|agency|studio|contact|quote)/i,
    /\bseo\b/i,
  ].some((pattern) => pattern.test(text));
}

export function isClearlyNonCreatorDiscoveredInfluencerRow(row) {
  const displayName = normalizeDiscoveredInfluencerDisplayName(row);
  const identityText = [
    displayName,
    row?.display_name,
    row?.headline,
    row?.platform_handle,
    row?.profile_url,
  ]
    .filter(Boolean)
    .join(" ");
  const metadataText = [
    row?.bio,
    row?.source_keyword,
    ...(Array.isArray(row?.categories) ? row.categories : []),
  ]
    .filter(Boolean)
    .join(" ");
  const combinedText = `${identityText} ${metadataText}`;

  const identityPatterns = [
    /(?:유튜버|인플루언서|크리에이터|채널).{0,16}(?:순위|랭킹)/i,
    /(?:순위|랭킹).{0,16}(?:유튜버|인플루언서|크리에이터|채널)/i,
    /(?:한국|국내)?\s*(?:유튜버|인플루언서|크리에이터)\s*(?:순위|랭킹)$/i,
    /(?:^|\s)(?:TikTok\s*Korea|틱톡\s*TikTok\s*Korea|YouTube\s*Korea|Instagram\s*Korea)(?:\s|$|\()/i,
    /(?:공식\s*(?:계정|채널)|official\s*(?:account|channel))/i,
  ];
  const combinedPatterns = [
    /(?:브랜드|브랜드 공식|회사|기업|매장|쇼핑몰|스토어|platform|official shop)/i,
  ];

  return (
    identityPatterns.some((pattern) => pattern.test(identityText)) ||
    combinedPatterns.some((pattern) => pattern.test(combinedText))
  );
}

export function classifyMarketplacePublicInfluencerEligibility(row) {
  if (hasMarketplaceOperationalTestMarker(row)) {
    return {
      eligible: false,
      excluded: true,
      type: "test",
      reason: "operational_test_marker",
    };
  }

  const accountAssessment = classifyDiscoveredInfluencerAccount(row);
  if (accountAssessment.excluded) {
    return {
      eligible: false,
      excluded: true,
      type: accountAssessment.type,
      reason: accountAssessment.reason,
    };
  }

  if (isClearlyBusinessDiscoveredInfluencerRow(row)) {
    return {
      eligible: false,
      excluded: true,
      type: "business",
      reason: "marketplace_business_signal",
    };
  }

  if (isClearlyNonCreatorDiscoveredInfluencerRow(row)) {
    return {
      eligible: false,
      excluded: true,
      type: "organization",
      reason: "marketplace_non_creator_signal",
    };
  }

  if (row?.status !== "active") {
    return {
      eligible: false,
      excluded: false,
      type: "creator",
      reason: `status_${normalizeText(row?.status) || "unknown"}`,
    };
  }

  return {
    eligible: true,
    excluded: false,
    type: "creator",
    reason: accountAssessment.reason || "creator_candidate",
  };
}
