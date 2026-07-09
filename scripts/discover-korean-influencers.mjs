import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

dotenv.config({ path: ".env.local" });
dotenv.config();

const cwd = process.cwd();
const outputDir = path.join(cwd, "docs", "discovery");

const categoryConfigs = {
  beauty: {
    label: "뷰티",
    categories: ["뷰티", "스킨케어", "메이크업"],
    audienceTags: ["뷰티", "화장품 리뷰", "데일리 루틴"],
    youtubeQueries: [
      "한국 뷰티 유튜버",
      "스킨케어 리뷰 유튜버",
      "메이크업 튜토리얼 유튜버",
      "화장품 리뷰 유튜버",
      "올리브영 추천 유튜버",
    ],
    naverQueries: [
      "뷰티 블로그 화장품 리뷰",
      "스킨케어 블로그 후기",
      "메이크업 블로그 리뷰",
      "올리브영 추천 블로그",
      "향수 리뷰 블로그",
    ],
  },
  living: {
    label: "리빙",
    categories: ["리빙", "라이프스타일", "홈"],
    audienceTags: ["리빙", "집꾸미기", "생활용품"],
    youtubeQueries: [
      "한국 리빙 유튜버",
      "집꾸미기 유튜버",
      "살림 브이로그 유튜버",
      "생활용품 리뷰 유튜버",
      "인테리어 유튜버",
    ],
    naverQueries: [
      "리빙 블로그 생활용품 리뷰",
      "집꾸미기 블로그",
      "살림 블로그 리뷰",
      "인테리어 블로그 후기",
      "홈데코 블로그",
    ],
  },
  fashion: {
    label: "패션",
    categories: ["패션", "스타일", "코디"],
    audienceTags: ["패션", "코디", "데일리룩"],
    youtubeQueries: [
      "한국 패션 유튜버",
      "데일리룩 유튜버",
      "남자 패션 유튜버",
      "여자 패션 유튜버",
      "쇼핑하울 패션 유튜버",
    ],
    naverQueries: [
      "패션 블로그 데일리룩",
      "여자 패션 블로그 코디",
      "남자 패션 블로그 코디",
      "쇼핑하울 블로그",
      "패션 인플루언서 블로그",
    ],
  },
  food: {
    label: "푸드",
    categories: ["푸드", "맛집", "요리"],
    audienceTags: ["푸드", "맛집", "레시피"],
    youtubeQueries: [
      "한국 푸드 유튜버",
      "맛집 리뷰 유튜버",
      "자취 요리 유튜버",
      "집밥 레시피 유튜버",
      "카페 디저트 유튜버",
    ],
    naverQueries: [
      "맛집 블로그 리뷰",
      "푸드 블로그 협찬",
      "요리 레시피 블로그",
      "카페 디저트 블로그",
      "자취요리 블로그",
    ],
  },
  travel: {
    label: "여행",
    categories: ["여행", "숙박", "로컬"],
    audienceTags: ["여행", "숙소", "국내여행"],
    youtubeQueries: [
      "국내 여행 유튜버",
      "숙소 리뷰 유튜버",
      "서울 여행 유튜버",
      "제주 여행 유튜버",
      "감성 여행 브이로그",
    ],
    naverQueries: [
      "국내여행 블로그 숙소",
      "제주 여행 블로그",
      "서울 여행 블로그",
      "호텔 숙소 리뷰 블로그",
      "여행 인플루언서 블로그",
    ],
  },
  parenting: {
    label: "육아",
    categories: ["육아", "키즈", "가족"],
    audienceTags: ["육아", "키즈", "가족"],
    youtubeQueries: [
      "육아 유튜버",
      "키즈 제품 리뷰 유튜버",
      "육아 브이로그 유튜버",
      "아이랑 갈만한 곳 유튜버",
      "맘 유튜버",
    ],
    naverQueries: [
      "육아 블로그 제품 리뷰",
      "키즈 블로그 협찬",
      "아이랑 갈만한 곳 블로그",
      "육아용품 리뷰 블로그",
      "맘 인플루언서 블로그",
    ],
  },
  pet: {
    label: "펫",
    categories: ["펫", "반려동물", "강아지"],
    audienceTags: ["펫", "강아지", "고양이"],
    youtubeQueries: [
      "반려동물 유튜버",
      "강아지 유튜버",
      "고양이 유튜버",
      "펫용품 리뷰 유튜버",
      "반려견 브이로그",
    ],
    naverQueries: [
      "반려동물 블로그 리뷰",
      "강아지 용품 블로그",
      "고양이 용품 블로그",
      "펫 인플루언서 블로그",
      "반려견 블로그 협찬",
    ],
  },
  fitness: {
    label: "운동",
    categories: ["운동", "헬스", "건강"],
    audienceTags: ["운동", "헬스", "건강관리"],
    youtubeQueries: [
      "한국 운동 유튜버",
      "헬스 유튜버",
      "홈트 유튜버",
      "필라테스 유튜버",
      "다이어트 브이로그 유튜버",
    ],
    naverQueries: [
      "운동 블로그 헬스",
      "홈트 블로그 리뷰",
      "필라테스 블로그",
      "다이어트 블로그 협찬",
      "건강관리 블로그",
    ],
  },
  game: {
    label: "게임",
    categories: ["게임", "엔터테인먼트", "콘텐츠"],
    audienceTags: ["게임", "라이브", "스트리밍"],
    youtubeQueries: [
      "한국 게임 유튜버",
      "게임 리뷰 유튜버",
      "게임 스트리머 유튜버",
      "모바일 게임 유튜버",
      "게임 플레이 유튜버",
    ],
    naverQueries: [
      "게임 블로그 리뷰",
      "모바일 게임 블로그",
      "게임 공략 블로그",
      "게임 스트리머 블로그",
      "게임 크리에이터 블로그",
    ],
  },
  tech: {
    label: "IT",
    categories: ["IT", "생활가전", "테크"],
    audienceTags: ["IT", "가전", "디지털"],
    youtubeQueries: [
      "IT 리뷰 유튜버",
      "생활가전 리뷰 유튜버",
      "테크 유튜버",
      "스마트폰 리뷰 유튜버",
      "가전제품 추천 유튜버",
    ],
    naverQueries: [
      "IT 블로그 리뷰",
      "생활가전 블로그 리뷰",
      "테크 블로그",
      "스마트폰 리뷰 블로그",
      "가전제품 추천 블로그",
    ],
  },
};

const brandSignals = [
  "공식",
  "스토어",
  "쇼핑몰",
  "브랜드",
  "주식회사",
  "회사",
  "홈쇼핑",
  "백화점",
  "마트",
  "뉴스",
  "매거진",
  "병원",
  "의원",
  "클리닉",
  "치과",
  "약국",
  "한의원",
  "아카데미",
  "협회",
  "학회",
  "센터",
  "그룹",
  "법인",
  "재단",
  "연구원",
  "연구소",
  "대학교",
  "학교",
  "공사",
  "공단",
  "정부",
  "시청",
  "구청",
  "군청",
  "리포트",
  "오늘의집",
  "견적",
  "무료상담",
  "블로그대행",
  "포스팅대행",
  "상위노출",
  "체험단대행",
  "마케팅대행",
  "구매평",
  "리모델링",
  "시공",
  "official",
  "store",
  "shop",
  "mall",
  "brand",
  "company",
  "corp",
  "inc.",
  "institute",
  "foundation",
  "university",
  "government",
  "association",
  "report",
  "lab",
  "agency",
  "quote",
  "remodeling",
];

const brandLikePatterns = [
  /(?:주식회사|\(주\)|㈜|유한회사|사단법인|재단법인)/i,
  /(?:공식몰|공식 스토어|브랜드몰|브랜드관|온라인몰|쇼핑몰|홈쇼핑|백화점|편집샵)/i,
  /(?:전문\s*업체|전문업체|시공\s*문의|견적\s*문의|상담\s*문의|대표\s*전화|문의\s*전화)/i,
  /(?:블로그|포스팅|마케팅|체험단|원고|댓글|리뷰)\s*(?:대행|견적|문의|상담)/i,
  /(?:상위\s*노출|검색\s*노출|노출\s*보장|트래픽|방문자\s*늘리|조회수\s*늘리|구매평)/i,
  /(?:인테리어|리모델링|시공|설계|디자인).{0,12}(?:업체|회사|견적|문의|상담|전문)/i,
  /(?:업체|회사|견적|문의|상담|전문).{0,12}(?:인테리어|리모델링|시공|설계)/i,
  /(?:실내건축|면허|보유업체|카카오채널문의|인스타그램\s*@).{0,24}(?:인테리어|견적|시공|문의|검색|아이디검색)/i,
  /(?:인테리어|리모델링).{0,24}(?:실내건축|면허|보유업체|카카오채널문의|시공|견적|유선문의)/i,
  /(?:interior|design|remodeling).*(?:company|agency|studio|contact|quote)/i,
  /\bseo\b/i,
];

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length > 0 ? rest.join("=") : "true"];
    }),
);

const categories = String(
  args.get("categories") ??
    "beauty,living,fashion,food,travel,parenting,pet,fitness,game,tech",
)
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value in categoryConfigs);
const apply = args.get("apply") === "true";
const includeYoutube = args.get("youtube") !== "false";
const includeNaver = args.get("naver") !== "false";
const includeInstagram = args.get("instagram") !== "false";
const includeTikTok = args.get("tiktok") !== "false";
const youtubePerQuery = parsePositiveInt(args.get("youtube-per-query"), 12);
const youtubePages = parsePositiveInt(args.get("youtube-pages"), 1);
const naverPerQuery = parsePositiveInt(args.get("naver-per-query"), 30);
const naverPages = parsePositiveInt(args.get("naver-pages"), 1);
const tiktokPerQuery = parsePositiveInt(args.get("tiktok-per-query"), 30);
const tiktokPages = parsePositiveInt(args.get("tiktok-pages"), 1);
const minFollowers = parseOptionalPositiveInt(args.get("min-followers"));
const maxFollowers = parseOptionalPositiveInt(args.get("max-followers"));
const inputPath = args.get("input");
const outputPlatforms = new Set(
  String(args.get("output-platforms") ?? "")
    .split(",")
    .map(normalizePlatformName)
    .filter(Boolean),
);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveInt(value) {
  if (value == null) return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizePlatformName(value) {
  const platform = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (platform === "naver" || platform === "blog") return "naver_blog";
  if (platform === "ig") return "instagram";
  if (platform === "tt") return "tiktok";
  return ["youtube", "naver_blog", "instagram", "tiktok"].includes(platform)
    ? platform
    : "";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableUuid(seed) {
  const chars = sha256(seed).slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value, maxLength) {
  return Array.from(String(value ?? "")).slice(0, maxLength).join("");
}

function slugPart(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .slice(0, 23);
}

function makePublicHandle(platform, handleSeed, externalId) {
  const prefixByPlatform = {
    instagram: "ig",
    naver_blog: "blog",
    tiktok: "tt",
    youtube: "yt",
  };
  const prefix = prefixByPlatform[platform] ?? "ch";
  const slug = slugPart(handleSeed);
  const fallback = sha256(`${platform}:${externalId}`).slice(0, 10);
  return `${prefix}-${slug || fallback}`.slice(0, 30).replace(/[^a-z0-9]+$/, "");
}

function ensureHttpUrl(value) {
  const clean = String(value ?? "").trim();
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith("//")) return `https:${clean}`;
  return clean ? `https://${clean.replace(/^\/+/, "")}` : "";
}

function compactKoreanNumber(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return undefined;
  if (amount >= 100_000_000) {
    return `${(amount / 100_000_000).toFixed(amount >= 1_000_000_000 ? 0 : 1).replace(/\.0$/, "")}억`;
  }
  if (amount >= 10_000) {
    return `${(amount / 10_000).toFixed(amount >= 100_000 ? 0 : 1).replace(/\.0$/, "")}만`;
  }
  return Math.round(amount).toLocaleString("ko-KR");
}

function parseEnglishCompactNumber(value, unit) {
  const amount = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const normalizedUnit = String(unit ?? "").toLowerCase();
  const multiplier =
    normalizedUnit === "b" ? 1_000_000_000 :
      normalizedUnit === "m" ? 1_000_000 :
        normalizedUnit === "k" ? 1_000 :
          1;
  return Math.round(amount * multiplier);
}

function parseTikTokFollowerCount(text) {
  const match = String(text ?? "").match(/([\d,.]+)\s*([kmb])?\s*followers\b/i);
  if (!match) return null;
  return parseEnglishCompactNumber(match[1], match[2]);
}

function hasKoreaProfileSignal(text) {
  const value = String(text ?? "");
  return (
    /[\uac00-\ud7a3]/u.test(value) ||
    /\b(?:south\s*korea|korea|korean|seoul|busan|incheon|daegu|daejeon|gwangju|ulsan|jeju|k-?beauty|k-?food|k-?fashion|k-?style|k-?pop)\b/i.test(value)
  );
}

function isLikelyBrandOrInstitution(text) {
  const lower = text.toLowerCase();
  return (
    brandSignals.some((signal) => lower.includes(signal.toLowerCase())) ||
    brandLikePatterns.some((pattern) => pattern.test(text))
  );
}

function hasPoorDisplayName(candidate) {
  const name = String(candidate.display_name ?? "").trim();
  if (!name) return true;
  const isNaverBlog = candidate.platform === "naver_blog";
  const readable = name
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (readable.length < 2) return true;
  if (/^[^\p{L}\p{N}]+/u.test(name)) return true;
  if (isNaverBlog && !/[가-힣]/u.test(name)) return true;
  if (isNaverBlog && /^\d/u.test(readable)) return true;
  const symbolCount = Array.from(name).filter((char) =>
    /[^\p{L}\p{N}\s]/u.test(char),
  ).length;
  if (symbolCount >= Math.max(3, Math.ceil(name.length * 0.24))) return true;
  if (/(?:blog\s*design|better\s*than|^test\b)/i.test(readable)) return true;
  if (isNaverBlog && /(?:\bblog\b|블로그)/i.test(name)) return true;
  return false;
}

function inferCategories(text, preferredCategory) {
  const config = categoryConfigs[preferredCategory];
  const result = new Set(config?.categories ?? []);
  const lower = text.toLowerCase();

  if (isStrongGamingText(text)) {
    return [
      "게임",
      "엔터테인먼트",
      "콘텐츠",
      ...Array.from(result).filter(
        (item) => !["게임", "엔터테인먼트", "콘텐츠"].includes(item),
      ),
    ].slice(0, 6);
  }

  if (/뷰티|스킨|메이크업|화장품|향수|beauty|makeup|cosmetic/.test(lower)) {
    ["뷰티", "스킨케어", "메이크업"].forEach((item) => result.add(item));
  }
  if (/리빙|살림|집꾸미기|인테리어|생활용품|홈데코|living|home|interior/.test(lower)) {
    ["리빙", "라이프스타일", "홈"].forEach((item) => result.add(item));
  }
  if (/패션|코디|데일리룩|쇼핑하울|fashion|style|outfit/.test(lower)) {
    ["패션", "스타일", "코디"].forEach((item) => result.add(item));
  }
  if (/푸드|맛집|요리|레시피|카페|디저트|food|recipe|restaurant|cafe/.test(lower)) {
    ["푸드", "맛집", "요리"].forEach((item) => result.add(item));
  }
  if (/여행|숙소|호텔|제주|국내여행|travel|hotel|stay/.test(lower)) {
    ["여행", "숙박", "로컬"].forEach((item) => result.add(item));
  }
  if (/육아|키즈|아이|맘|가족|parenting|kids|baby/.test(lower)) {
    ["육아", "키즈", "가족"].forEach((item) => result.add(item));
  }
  if (/펫|반려|강아지|고양이|댕댕|pet|dog|cat/.test(lower)) {
    ["펫", "반려동물", "강아지"].forEach((item) => result.add(item));
  }
  if (/운동|헬스|홈트|필라테스|다이어트|fitness|health|workout/.test(lower)) {
    ["운동", "헬스", "건강"].forEach((item) => result.add(item));
  }
  if (isStrongGamingText(text)) {
    ["게임", "엔터테인먼트", "콘텐츠"].forEach((item) => result.add(item));
  }
  if (/it|테크|가전|스마트폰|디지털|tech|gadget/.test(lower)) {
    ["IT", "생활가전", "테크"].forEach((item) => result.add(item));
  }

  return Array.from(result).slice(0, 6);
}

function isStrongGamingText(value) {
  const text = String(value ?? "").toLowerCase();
  return /(?:게임\s*(?:유튜버|크리에이터|리뷰|방송|스트리머|공략|플레이)|게이머|게임플레이|게임\s*채널|gaming|gamer|gameplay|gameplays|games\b|game\s*over|minecraft|roblox|league of legends|valorant|battlegrounds|pubg|fortnite|메이플랜드|메이플스토리|마인크래프트|로블록스|발로란트|배틀그라운드|리그오브레전드|모바일게임)/i.test(
    text,
  );
}

function scoreCandidate(candidate) {
  const text = [
    candidate.display_name,
    candidate.headline,
    candidate.bio,
    candidate.platform_handle,
    ...(candidate.categories ?? []),
  ].join(" ");
  const brandLike = isLikelyBrandOrInstitution(text);
  const poorDisplayName = hasPoorDisplayName(candidate);
  let score = candidate.platform === "youtube" ? 38 : 40;

  if (candidate.display_name) score += 8;
  if (candidate.profile_url) score += 8;
  if (candidate.avatar_url) score += 4;
  if ((candidate.categories ?? []).length > 0) score += 8;
  if (candidate.platform === "youtube" && candidate.follower_count) {
    score += Math.min(22, Math.round(Math.log10(candidate.follower_count + 1) * 4));
  }
  if (candidate.platform === "instagram" && candidate.follower_count) {
    score += Math.min(18, Math.round(Math.log10(candidate.follower_count + 1) * 4));
  }
  if (candidate.platform === "tiktok" && candidate.follower_count) {
    score += Math.min(18, Math.round(Math.log10(candidate.follower_count + 1) * 4));
  }
  if (candidate.average_views) {
    score += Math.min(12, Math.round(Math.log10(candidate.average_views + 1) * 3));
  }
  if (candidate.platform === "naver_blog") {
    score += Math.min(14, Number(candidate.source_evidence?.matchedPosts ?? 1) * 4);
  }
  if (brandLike) score -= 35;
  if (poorDisplayName) score -= 32;
  if (candidate.platform === "youtube" && Number(candidate.follower_count ?? 0) < 1_000) {
    score -= 6;
  }

  const qualityScore = Math.max(0, Math.min(100, score));
  return {
    qualityScore,
    status:
      !brandLike && !poorDisplayName && qualityScore >= 52
        ? "active"
        : "needs_review",
  };
}

function rescoreRow(row) {
  const scored = scoreCandidate(row);
  const hasRequiredTikTokSignal =
    row.platform !== "tiktok" || row.source_evidence?.koreaProfileSignal === true;
  const qualityScore = hasRequiredTikTokSignal
    ? scored.qualityScore
    : Math.min(scored.qualityScore, 45);
  return {
    ...row,
    quality_score: qualityScore,
    status: hasRequiredTikTokSignal ? scored.status : "needs_review",
  };
}

async function fetchJson(url, init, label) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 240)}`);
  }
  return response.json();
}

async function collectYoutubeCandidates() {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey || !includeYoutube) return [];

  const discovered = new Map();

  for (const category of categories) {
    for (const query of categoryConfigs[category].youtubeQueries) {
      let pageToken = "";
      for (let pageIndex = 0; pageIndex < youtubePages; pageIndex += 1) {
        const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
        searchUrl.searchParams.set("part", "snippet");
        searchUrl.searchParams.set("type", "channel");
        searchUrl.searchParams.set("regionCode", "KR");
        searchUrl.searchParams.set("relevanceLanguage", "ko");
        searchUrl.searchParams.set("maxResults", String(Math.min(youtubePerQuery, 50)));
        searchUrl.searchParams.set("q", query);
        searchUrl.searchParams.set("key", apiKey);
        if (pageToken) searchUrl.searchParams.set("pageToken", pageToken);

        const data = await fetchJson(
          searchUrl,
          undefined,
          `YouTube search ${query} page ${pageIndex + 1}`,
        );
        for (const item of data.items ?? []) {
          const channelId = item?.id?.channelId;
          if (!channelId || discovered.has(channelId)) continue;
          discovered.set(channelId, {
            category,
            query,
            channelId,
            snippet: item.snippet ?? {},
          });
        }

        pageToken = data.nextPageToken || "";
        if (!pageToken) break;
      }
    }
  }

  const channelIds = Array.from(discovered.keys());
  const rows = [];

  for (let index = 0; index < channelIds.length; index += 50) {
    const ids = channelIds.slice(index, index + 50);
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.searchParams.set("part", "snippet,statistics");
    channelUrl.searchParams.set("id", ids.join(","));
    channelUrl.searchParams.set("key", apiKey);

    const data = await fetchJson(channelUrl, undefined, "YouTube channels");
    for (const channel of data.items ?? []) {
      const seed = discovered.get(channel.id);
      const snippet = channel.snippet ?? {};
      const stats = channel.statistics ?? {};
      const title = stripHtml(snippet.title);
      const description = stripHtml(snippet.description);
      const customUrl = stripHtml(snippet.customUrl);
      const platformHandle = (customUrl || channel.id).replace(/^@+/, "");
      const profileUrl = customUrl
        ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}`
        : `https://www.youtube.com/channel/${channel.id}`;
      const subscriberCount = stats.hiddenSubscriberCount
        ? undefined
        : Number.parseInt(stats.subscriberCount ?? "", 10);
      const videoCount = Number.parseInt(stats.videoCount ?? "", 10);
      const viewCount = Number.parseInt(stats.viewCount ?? "", 10);
      const averageViews =
        Number.isFinite(viewCount) && Number.isFinite(videoCount) && videoCount > 0
          ? Math.round(viewCount / videoCount)
          : undefined;
      const categoriesForRow = inferCategories(`${title} ${description}`, seed.category);
      const candidate = {
        id: stableUuid(`discovered:youtube:${channel.id}`),
        platform: "youtube",
        public_handle: makePublicHandle("youtube", platformHandle || title, channel.id),
        external_id: channel.id,
        platform_handle: platformHandle || channel.id,
        display_name: title || platformHandle || channel.id,
        headline: `${categoryConfigs[seed.category].label} 콘텐츠 채널`,
        bio: truncateText(description, 240),
        profile_url: profileUrl,
        avatar_url: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? null,
        categories: categoriesForRow,
        audience_countries: ["south_korea"],
        audience_tags: categoryConfigs[seed.category].audienceTags,
        followers_label: subscriberCount ? `구독자 ${compactKoreanNumber(subscriberCount)}명` : "구독자 공개 안됨",
        follower_count: Number.isFinite(subscriberCount) ? subscriberCount : null,
        average_views: Number.isFinite(averageViews) ? averageViews : null,
        post_count: Number.isFinite(videoCount) ? videoCount : null,
        source_provider: "youtube_data_api",
        source_keyword: seed.query,
        source_url: profileUrl,
        source_evidence: {
          sourceCategory: seed.category,
          searchQuery: seed.query,
          viewCount: Number.isFinite(viewCount) ? viewCount : null,
          videoCount: Number.isFinite(videoCount) ? videoCount : null,
          hiddenSubscriberCount: Boolean(stats.hiddenSubscriberCount),
        },
      };
      const scored = scoreCandidate(candidate);
      rows.push({
        ...candidate,
        quality_score: scored.qualityScore,
        status: scored.status,
      });
    }
  }

  return rows;
}

function naverBlogIdFromLink(link) {
  try {
    const url = new URL(ensureHttpUrl(link));
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] || url.hostname;
  } catch {
    return slugPart(link) || sha256(link).slice(0, 10);
  }
}

async function collectNaverBlogCandidates() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret || !includeNaver) return [];

  const grouped = new Map();

  for (const category of categories) {
    for (const query of categoryConfigs[category].naverQueries) {
      const display = Math.min(naverPerQuery, 100);
      for (let pageIndex = 0; pageIndex < naverPages; pageIndex += 1) {
        const start = pageIndex * display + 1;
        if (start > 1000) break;

        const url = new URL("https://openapi.naver.com/v1/search/blog.json");
        url.searchParams.set("query", query);
        url.searchParams.set("display", String(display));
        url.searchParams.set("start", String(start));
        url.searchParams.set("sort", "sim");

        const data = await fetchJson(
          url,
          {
            headers: {
              "X-Naver-Client-Id": clientId,
              "X-Naver-Client-Secret": clientSecret,
            },
          },
          `Naver blog search ${query} page ${pageIndex + 1}`,
        );

        for (const item of data.items ?? []) {
          const bloggerLink = ensureHttpUrl(stripHtml(item.bloggerlink));
          if (!bloggerLink) continue;
          let bloggerUrl;
          try {
            bloggerUrl = new URL(bloggerLink);
          } catch {
            continue;
          }
          if (bloggerUrl.hostname.toLowerCase() !== "blog.naver.com") continue;
          const key = bloggerLink.toLowerCase();
          const current =
            grouped.get(key) ??
            {
              category,
              bloggerLink,
              bloggerName: stripHtml(item.bloggername),
              titles: [],
              descriptions: [],
              queries: new Set(),
              links: new Set(),
            };
          current.queries.add(query);
          current.links.add(ensureHttpUrl(stripHtml(item.link)));
          current.titles.push(stripHtml(item.title));
          current.descriptions.push(stripHtml(item.description));
          grouped.set(key, current);
        }
      }
    }
  }

  return Array.from(grouped.values()).map((blog) => {
    const blogId = naverBlogIdFromLink(blog.bloggerLink);
    const text = [
      blog.bloggerName,
      ...blog.titles.slice(0, 5),
      ...blog.descriptions.slice(0, 5),
    ].join(" ");
    const categoriesForRow = inferCategories(text, blog.category);
    const candidate = {
      id: stableUuid(`discovered:naver_blog:${blog.bloggerLink.toLowerCase()}`),
      platform: "naver_blog",
      public_handle: makePublicHandle("naver_blog", blogId, blog.bloggerLink),
      external_id: blog.bloggerLink.toLowerCase(),
      platform_handle: blogId,
      display_name: blog.bloggerName || blogId,
      headline: `${categoryConfigs[blog.category].label} 리뷰 블로그`,
      bio: truncateText(blog.descriptions.slice(0, 3).join(" "), 240),
      profile_url: blog.bloggerLink,
      avatar_url: null,
      categories: categoriesForRow,
      audience_countries: ["south_korea"],
      audience_tags: categoryConfigs[blog.category].audienceTags,
      followers_label: "블로그 공개",
      follower_count: null,
      average_views: null,
      post_count: blog.links.size,
      source_provider: "naver_search_api",
      source_keyword: Array.from(blog.queries)[0],
      source_url: Array.from(blog.links)[0] || blog.bloggerLink,
      source_evidence: {
        sourceCategory: blog.category,
        searchQueries: Array.from(blog.queries),
        matchedPosts: blog.links.size,
        sampleTitles: blog.titles.slice(0, 5),
      },
    };
    const scored = scoreCandidate(candidate);
    return {
      ...candidate,
      quality_score: scored.qualityScore,
      status: scored.status,
    };
  });
}

const reservedInstagramHandles = new Set([
  "about",
  "accounts",
  "api",
  "developer",
  "directory",
  "explore",
  "graphql",
  "oauth",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

function normalizeInstagramHandle(value) {
  const handle = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/[.,;:)\]}"'`]+$/, "")
    .toLowerCase();

  if (!/^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])?$/.test(handle)) return "";
  if (reservedInstagramHandles.has(handle)) return "";
  return handle;
}

function extractInstagramProfileRefs(text) {
  const source = String(text ?? "");
  const refs = new Map();
  const add = (rawHandle, evidence) => {
    const handle = normalizeInstagramHandle(rawHandle);
    if (!handle) return;
    refs.set(handle, evidence);
  };

  for (const match of source.matchAll(
    /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{3,30})(?:[/?#][^\s]*)?/gi,
  )) {
    add(match[1], match[0]);
  }

  for (const match of source.matchAll(
    /(?:instagram|insta|인스타그램|인스타)\s*(?:[:：=]|아이디|id|계정|주소)?\s*@?([A-Za-z0-9._]{3,30})/gi,
  )) {
    add(match[1], match[0]);
  }

  return Array.from(refs, ([handle, evidence]) => ({ handle, evidence }));
}

function collectInstagramCandidatesFromCrosslinks(sourceRows) {
  if (!includeInstagram) return [];

  const byHandle = new Map();
  for (const row of sourceRows) {
    const text = [
      row.display_name,
      row.headline,
      row.bio,
      row.profile_url,
      row.source_url,
      row.platform_handle,
    ].join(" ");
    for (const ref of extractInstagramProfileRefs(text)) {
      const profileUrl = `https://www.instagram.com/${ref.handle}/`;
      const candidate = {
        id: stableUuid(`discovered:instagram:${ref.handle}`),
        platform: "instagram",
        public_handle: makePublicHandle("instagram", ref.handle, ref.handle),
        external_id: ref.handle,
        platform_handle: ref.handle,
        display_name: row.display_name,
        headline: `${row.categories?.[0] ?? "콘텐츠"} 인스타그램 크리에이터`,
        bio: row.bio,
        profile_url: profileUrl,
        avatar_url: row.avatar_url ?? null,
        categories: row.categories ?? [],
        audience_countries: row.audience_countries ?? ["south_korea"],
        audience_tags: row.audience_tags ?? [],
        followers_label: "인스타 공개 프로필",
        follower_count: null,
        average_views: null,
        post_count: null,
        source_provider: "public_profile_crosslink",
        source_keyword: row.source_keyword,
        source_url: row.profile_url,
        source_evidence: {
          sourcePlatform: row.platform,
          sourceProfileUrl: row.profile_url,
          extractedFrom: ref.evidence,
          sourceCategory: row.source_evidence?.sourceCategory ?? row.categories?.[0] ?? null,
        },
      };
      const scored = scoreCandidate(candidate);
      const enriched = {
        ...candidate,
        quality_score: scored.qualityScore,
        status: scored.status,
      };
      const previous = byHandle.get(ref.handle);
      if (!previous || enriched.quality_score > previous.quality_score) {
        byHandle.set(ref.handle, enriched);
      }
    }
  }

  return Array.from(byHandle.values());
}

const reservedTikTokHandles = new Set([
  "about",
  "business",
  "channel",
  "content",
  "creator",
  "discover",
  "download",
  "explore",
  "foryou",
  "korea",
  "korean",
  "legal",
  "live",
  "login",
  "music",
  "search",
  "share",
  "shop",
  "star",
  "tag",
  "tiktok",
  "upload",
  "video",
]);

const tiktokSearchQueriesByCategory = {
  beauty: [
    "tiktok beauty korea creator",
    "tiktok korean beauty",
    "korean beauty tiktok influencer",
  ],
  living: [
    "tiktok korea lifestyle creator",
    "tiktok korean home living",
    "korean lifestyle tiktok influencer",
  ],
  fashion: [
    "tiktok korean fashion creator",
    "tiktok korea outfit",
    "korean fashion tiktok influencer",
  ],
  food: [
    "tiktok korean food creator",
    "tiktok korea restaurant recipe",
    "korean food tiktok influencer",
  ],
  travel: [
    "tiktok korea travel creator",
    "tiktok korea hotel travel",
    "korean travel tiktok influencer",
  ],
  parenting: [
    "tiktok korea parenting creator",
    "tiktok korean family kids",
    "korean parenting tiktok influencer",
  ],
  pet: [
    "tiktok korea pet creator",
    "tiktok korean dog cat",
    "korean pet tiktok influencer",
  ],
  fitness: [
    "tiktok korea fitness creator",
    "tiktok korean workout",
    "korean fitness tiktok influencer",
  ],
  game: [
    "tiktok korea gaming creator",
    "tiktok korean game streamer",
    "korean gaming tiktok influencer",
  ],
  tech: [
    "tiktok korea tech creator",
    "tiktok korean gadget review",
    "korean tech tiktok influencer",
  ],
};

function normalizeTikTokHandle(value) {
  const handle = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .replace(/[.,;:)\]}"'`]+$/, "")
    .toLowerCase();

  if (!/^[a-z0-9](?:[a-z0-9._]{1,22}[a-z0-9])?$/.test(handle)) return "";
  if (reservedTikTokHandles.has(handle)) return "";
  return handle;
}

function extractTikTokProfileRefs(text) {
  const source = String(text ?? "");
  const refs = new Map();
  const add = (rawHandle, evidence) => {
    const handle = normalizeTikTokHandle(rawHandle);
    if (!handle) return;
    refs.set(handle, evidence);
  };

  for (const match of source.matchAll(
    /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})(?:[/?#][^\s]*)?/gi,
  )) {
    add(match[1], match[0]);
  }

  return Array.from(refs, ([handle, evidence]) => ({ handle, evidence }));
}

function buildTikTokCandidateFromSource({
  handle,
  sourceRow,
  category,
  title,
  description,
  sourceUrl,
  evidence,
  provider,
  keyword,
}) {
  const config = categoryConfigs[category] ?? categoryConfigs.beauty;
  const displayName =
    stripHtml(title) ||
    stripHtml(sourceRow?.display_name) ||
    handle;
  const bio = truncateText(stripHtml(description || sourceRow?.bio), 240);
  const profileUrl = `https://www.tiktok.com/@${handle}`;
  const followerCount = parseTikTokFollowerCount(`${displayName} ${bio}`);
  const sourceAudienceCountries = Array.isArray(sourceRow?.audience_countries)
    ? sourceRow.audience_countries
    : [];
  const hasSourceKoreaAudience = sourceAudienceCountries.some((country) =>
    /^(south_korea|kr|korea)$/i.test(String(country ?? "")),
  );
  const koreaProfileSignal =
    hasSourceKoreaAudience || hasKoreaProfileSignal(`${displayName} ${bio} ${handle}`);
  const categoriesForRow =
    sourceRow?.categories?.length
      ? sourceRow.categories
      : inferCategories(`${displayName} ${bio} ${keyword ?? ""}`, category);
  const candidate = {
    id: stableUuid(`discovered:tiktok:${handle}`),
    platform: "tiktok",
    public_handle: makePublicHandle("tiktok", handle, handle),
    external_id: handle,
    platform_handle: handle,
    display_name: displayName,
    headline: `${categoriesForRow[0] ?? config.label} 틱톡 크리에이터`,
    bio,
    profile_url: profileUrl,
    avatar_url: sourceRow?.avatar_url ?? null,
    categories: categoriesForRow,
    audience_countries: sourceAudienceCountries.length
      ? sourceAudienceCountries
      : koreaProfileSignal
        ? ["south_korea"]
        : [],
    audience_tags: sourceRow?.audience_tags ?? config.audienceTags,
    followers_label: Number.isFinite(followerCount)
      ? `팔로워 ${compactKoreanNumber(followerCount)}명`
      : "틱톡 공개 프로필",
    follower_count: Number.isFinite(followerCount) ? followerCount : null,
    average_views: null,
    post_count: null,
    source_provider: provider,
    source_keyword: keyword,
    source_url: sourceUrl || profileUrl,
    source_evidence: {
      sourceCategory: category,
      sourcePlatform: sourceRow?.platform ?? null,
      sourceProfileUrl: sourceRow?.profile_url ?? null,
      extractedFrom: evidence,
      koreaProfileSignal,
    },
  };
  const scored = scoreCandidate(candidate);
  const qualityScore = koreaProfileSignal
    ? scored.qualityScore
    : Math.min(scored.qualityScore, 45);
  return {
    ...candidate,
    quality_score: qualityScore,
    status: koreaProfileSignal && scored.status === "active" ? "active" : "needs_review",
  };
}

function collectTikTokCandidatesFromCrosslinks(sourceRows) {
  if (!includeTikTok) return [];

  const byHandle = new Map();
  for (const row of sourceRows) {
    const text = [
      row.display_name,
      row.headline,
      row.bio,
      row.profile_url,
      row.source_url,
      row.platform_handle,
    ].join(" ");
    const category = row.source_evidence?.sourceCategory in categoryConfigs
      ? row.source_evidence.sourceCategory
      : categories[0] ?? "beauty";
    for (const ref of extractTikTokProfileRefs(text)) {
      const enriched = buildTikTokCandidateFromSource({
        handle: ref.handle,
        sourceRow: row,
        category,
        title: row.display_name,
        description: row.bio,
        sourceUrl: row.profile_url,
        evidence: ref.evidence,
        provider: "public_profile_crosslink",
        keyword: row.source_keyword,
      });
      const previous = byHandle.get(ref.handle);
      if (!previous || enriched.quality_score > previous.quality_score) {
        byHandle.set(ref.handle, enriched);
      }
    }
  }

  return Array.from(byHandle.values());
}

async function collectTikTokCandidatesFromNaverWeb() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret || !includeTikTok) return [];

  const byHandle = new Map();
  for (const category of categories) {
    const queries = tiktokSearchQueriesByCategory[category] ?? [];
    for (const query of queries) {
      const display = Math.min(tiktokPerQuery, 100);
      for (let pageIndex = 0; pageIndex < tiktokPages; pageIndex += 1) {
        const start = pageIndex * display + 1;
        if (start > 1000) break;

        const url = new URL("https://openapi.naver.com/v1/search/webkr.json");
        url.searchParams.set("query", query);
        url.searchParams.set("display", String(display));
        url.searchParams.set("start", String(start));

        const data = await fetchJson(
          url,
          {
            headers: {
              "X-Naver-Client-Id": clientId,
              "X-Naver-Client-Secret": clientSecret,
            },
          },
          `Naver web TikTok search ${query} page ${pageIndex + 1}`,
        );

        for (const item of data.items ?? []) {
          const title = stripHtml(item.title);
          const description = stripHtml(item.description);
          const link = ensureHttpUrl(stripHtml(item.link));
          const refs = extractTikTokProfileRefs(link);
          for (const ref of refs) {
            const enriched = buildTikTokCandidateFromSource({
              handle: ref.handle,
              category,
              title: title || ref.handle,
              description,
              sourceUrl: link || `https://www.tiktok.com/@${ref.handle}`,
              evidence: ref.evidence,
              provider: "naver_web_search_tiktok_public_profile",
              keyword: query,
            });
            const previous = byHandle.get(ref.handle);
            if (!previous || enriched.quality_score > previous.quality_score) {
              byHandle.set(ref.handle, enriched);
            }
          }
        }
      }
    }
  }

  return Array.from(byHandle.values());
}

async function collectCuratedTikTokCandidates() {
  if (!includeTikTok) return [];

  const seedPath = path.join(outputDir, "tiktok-curated-seeds.json");
  let seeds;
  try {
    seeds = JSON.parse(await fs.readFile(seedPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return [];
  }

  return seeds
    .map((seed) => {
      const handle = normalizeTikTokHandle(seed.handle);
      if (!handle) return null;
      const category = seed.category in categoryConfigs ? seed.category : "beauty";
      const followerCount = Number.parseInt(String(seed.follower_count ?? ""), 10);
      const candidate = buildTikTokCandidateFromSource({
        handle,
        category,
        title: stripHtml(seed.display_name) || handle,
        description: stripHtml(seed.bio),
        sourceUrl: seed.source_url ?? `https://www.tiktok.com/@${handle}`,
        evidence: seed.source_url ?? handle,
        provider: "curated_tiktok_public_search",
        keyword: seed.source_keyword ?? "tiktok public profile search",
      });
      return {
        ...candidate,
        headline: stripHtml(seed.headline) || candidate.headline,
        followers_label: Number.isFinite(followerCount)
          ? `팔로워 ${compactKoreanNumber(followerCount)}명`
          : candidate.followers_label,
        follower_count: Number.isFinite(followerCount) ? followerCount : null,
        post_count: Number.isFinite(seed.post_count) ? seed.post_count : null,
        source_evidence: {
          ...candidate.source_evidence,
          sourceNote: seed.source_note ?? null,
        },
        status: seed.status ?? candidate.status,
      };
    })
    .filter(Boolean);
}

async function collectCuratedInstagramCandidates() {
  if (!includeInstagram) return [];

  const seedPath = path.join(outputDir, "instagram-curated-seeds.json");
  let seeds;
  try {
    seeds = JSON.parse(await fs.readFile(seedPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return [];
  }

  return seeds
    .map((seed) => {
      const handle = normalizeInstagramHandle(seed.handle);
      if (!handle) return null;
      const category = seed.category in categoryConfigs ? seed.category : "beauty";
      const config = categoryConfigs[category];
      const followerCount = Number.parseInt(String(seed.follower_count ?? ""), 10);
      const profileUrl = `https://www.instagram.com/${handle}/`;
      const inferredCategories = inferCategories(
        [
          seed.display_name,
          seed.headline,
          seed.bio,
          seed.source_keyword,
          seed.source_url,
          handle,
        ].join(" "),
        category,
      );
      const candidate = {
        id: stableUuid(`discovered:instagram:${handle}`),
        platform: "instagram",
        public_handle: makePublicHandle("instagram", handle, handle),
        external_id: handle,
        platform_handle: handle,
        display_name: stripHtml(seed.display_name) || handle,
        headline: stripHtml(seed.headline) || `${config.label} 인스타그램 크리에이터`,
        bio: truncateText(stripHtml(seed.bio), 240),
        profile_url: profileUrl,
        avatar_url: null,
        categories: seed.categories?.length
          ? inferCategories(seed.categories.join(" "), category)
          : inferredCategories.length
            ? inferredCategories
            : config.categories,
        audience_countries: ["south_korea"],
        audience_tags: config.audienceTags,
        followers_label: Number.isFinite(followerCount)
          ? `팔로워 ${compactKoreanNumber(followerCount)}명`
          : "인스타 공개 프로필",
        follower_count: Number.isFinite(followerCount) ? followerCount : null,
        average_views: null,
        post_count: Number.isFinite(seed.post_count) ? seed.post_count : null,
        source_provider: "curated_instagram_public_search",
        source_keyword: seed.source_keyword ?? "instagram public profile search",
        source_url: seed.source_url ?? profileUrl,
        source_evidence: {
          sourceCategory: category,
          sourceUrl: seed.source_url ?? profileUrl,
          sourceNote: seed.source_note ?? null,
        },
      };
      const scored = scoreCandidate(candidate);
      return {
        ...candidate,
        quality_score: scored.qualityScore,
        status: seed.status ?? scored.status,
      };
    })
    .filter(Boolean);
}

function dedupeRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    const previous = byId.get(row.id);
    if (!previous || row.quality_score > previous.quality_score) {
      byId.set(row.id, row);
    }
  }

  const usedHandles = new Map();
  return Array.from(byId.values())
    .sort((a, b) => b.quality_score - a.quality_score)
    .map((row) => {
      const currentOwner = usedHandles.get(row.public_handle);
      if (!currentOwner || currentOwner === row.id) {
        usedHandles.set(row.public_handle, row.id);
        return row;
      }

      const suffix = sha256(row.id).slice(0, 5);
      const base = row.public_handle.slice(0, Math.max(3, 29 - suffix.length));
      const publicHandle = `${base}-${suffix}`.replace(/[^a-z0-9]+$/, "");
      usedHandles.set(publicHandle, row.id);
      return { ...row, public_handle: publicHandle };
    });
}

function filterRowsByFollowerRange(rows) {
  if (!minFollowers && !maxFollowers) return rows;

  return rows.filter((row) => {
    const followerCount = Number(row.follower_count);
    if (!Number.isFinite(followerCount)) return false;
    if (minFollowers && followerCount < minFollowers) return false;
    if (maxFollowers && followerCount > maxFollowers) return false;
    return true;
  });
}

function toTsv(rows) {
  const headers = [
    "status",
    "quality_score",
    "category",
    "platform",
    "display_name",
    "platform_handle",
    "follower_count",
    "average_views",
    "profile_url",
    "source_keyword",
  ];
  const lines = rows.map((row) =>
    headers
      .map((header) =>
        String(
          header === "category" ? row.categories?.[0] ?? "" : row[header] ?? "",
        )
          .replace(/\t/g, " ")
          .replace(/\r?\n/g, " "),
      )
      .join("\t"),
  );
  return [headers.join("\t"), ...lines].join("\n");
}

async function fetchSupabaseRows(table, query) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return fetchJson(
    `${supabaseUrl}/rest/v1/${table}${query}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    },
    `Supabase ${table} read`,
  );
}

async function fetchAllSupabaseRows(table, query, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const separator = query.includes("?") ? "&" : "?";
    const page = await fetchSupabaseRows(
      table,
      `${query}${separator}limit=${pageSize}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function reserveExistingHandles(rows) {
  const [discovered, marketplace] = await Promise.all([
    fetchAllSupabaseRows(
      "discovered_influencer_profiles",
      "?select=id,public_handle",
    ).catch(() => []),
    fetchAllSupabaseRows(
      "marketplace_influencer_profiles",
      "?select=id,public_handle",
    ).catch(() => []),
  ]);

  const taken = new Map();
  for (const row of [...discovered, ...marketplace]) {
    if (row.public_handle) taken.set(String(row.public_handle).toLowerCase(), row.id);
  }

  return rows.map((row) => {
    const owner = taken.get(row.public_handle.toLowerCase());
    if (!owner || owner === row.id) {
      taken.set(row.public_handle.toLowerCase(), row.id);
      return row;
    }

    const suffix = sha256(row.id).slice(0, 5);
    const base = row.public_handle.slice(0, Math.max(3, 29 - suffix.length));
    const publicHandle = `${base}-${suffix}`.replace(/[^a-z0-9]+$/, "");
    taken.set(publicHandle.toLowerCase(), row.id);
    return { ...row, public_handle: publicHandle };
  });
}

async function upsertSupabaseRows(rows) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  let applied = 0;
  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const response = await fetch(
      `${supabaseUrl}/rest/v1/discovered_influencer_profiles?on_conflict=id`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(chunk),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Supabase upsert failed (${response.status}): ${body.slice(0, 400)}`);
    }
    applied += chunk.length;
  }
  return applied;
}

async function main() {
  if (!inputPath && categories.length === 0) {
    throw new Error("No valid categories selected.");
  }

  let sourceRows;
  let sourceCategories = categories;
  if (inputPath) {
    const resolvedInputPath = path.isAbsolute(inputPath) ? inputPath : path.join(cwd, inputPath);
    const parsed = JSON.parse(await fs.readFile(resolvedInputPath, "utf8"));
    sourceRows = Array.isArray(parsed) ? parsed : parsed.rows;
    sourceCategories = Array.isArray(parsed.categories) ? parsed.categories : categories;
    if (!Array.isArray(sourceRows)) {
      throw new Error("Input file must be an array or a JSON object with rows.");
    }
  } else {
    const baseCollected = [
      ...(await collectYoutubeCandidates()),
      ...(await collectNaverBlogCandidates()),
    ];
    const collected = [
      ...baseCollected,
      ...collectInstagramCandidatesFromCrosslinks(baseCollected),
      ...collectTikTokCandidatesFromCrosslinks(baseCollected),
      ...(await collectTikTokCandidatesFromNaverWeb()),
      ...(await collectCuratedInstagramCandidates()),
      ...(await collectCuratedTikTokCandidates()),
    ];
    sourceRows = collected;
  }

  const targetRows = outputPlatforms.size > 0
    ? sourceRows.filter((row) => outputPlatforms.has(row.platform))
    : sourceRows;
  const deduped = dedupeRows(filterRowsByFollowerRange(targetRows.map(rescoreRow)));
  const rows = apply ? await reserveExistingHandles(deduped) : deduped;

  await fs.mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${stamp}-korean-influencer-discovery-${sourceCategories.join("-")}`;
  await fs.writeFile(
    path.join(outputDir, `${baseName}.json`),
    JSON.stringify({ categories: sourceCategories, input: inputPath, apply, total: rows.length, rows }, null, 2),
  );
  await fs.writeFile(path.join(outputDir, `${baseName}.tsv`), toTsv(rows));

  const active = rows.filter((row) => row.status === "active");
  const byPlatform = rows.reduce((acc, row) => {
    acc[row.platform] = (acc[row.platform] ?? 0) + 1;
    return acc;
  }, {});
  const byCategory = rows.reduce((acc, row) => {
    for (const category of row.categories ?? []) {
      acc[category] = (acc[category] ?? 0) + 1;
    }
    return acc;
  }, {});

  let applied = 0;
  if (apply) {
    applied = await upsertSupabaseRows(rows);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        categories: sourceCategories,
        input: inputPath,
        minFollowers,
        maxFollowers,
        youtubePages,
        naverPages,
        tiktokPages,
        total: rows.length,
        active: active.length,
        needs_review: rows.length - active.length,
        byPlatform,
        byCategory,
        applied,
        output: path.join(outputDir, `${baseName}.tsv`),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
