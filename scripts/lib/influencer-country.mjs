import {
  isoAlpha2CountryCodes,
  isIsoAlpha2CountryCode,
} from "../../src/domain/isoCountryCodes.js";

const marketplaceCountryCodes = new Set([
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
]);

const isoCountryMap = new Map([
  ["KR", "south_korea"],
  ["JP", "japan"],
  ["TW", "taiwan"],
  ["HK", "hong_kong"],
  ["US", "united_states"],
  ["CN", "china"],
  ["TH", "thailand"],
  ["VN", "vietnam"],
  ["ID", "indonesia"],
  ["SG", "singapore"],
  ["MY", "malaysia"],
  ["AU", "australia"],
  ["CA", "canada"],
  ["DE", "germany"],
  ["IN", "india"],
  ["PH", "philippines"],
  ["BG", "bulgaria"],
  ["TZ", "tanzania"],
  ["EG", "egypt"],
]);

const countryIdentityPatterns = new Map([
  [
    "south_korea",
    /(?:\b(?:south\s*korea|korea|korean|seoul|busan|incheon|daegu|daejeon|gwangju|ulsan|jeju)\b|(?:한국|대한민국|서울|부산|인천|대구|대전|광주|울산|제주))/iu,
  ],
  ["japan", /(?:\b(?:japan|japanese|tokyo|osaka|kyoto)\b|(?:일본|도쿄|오사카|교토))/iu],
  ["taiwan", /(?:\b(?:taiwan|taiwanese|taipei)\b|(?:대만|타이베이))/iu],
  ["hong_kong", /(?:\b(?:hong\s*kong|hongkonger)\b|홍콩)/iu],
  ["united_states", /(?:\b(?:united\s*states|american|usa|new\s*york|los\s*angeles)\b|(?:미국|뉴욕|로스앤젤레스))/iu],
  ["china", /(?:\b(?:china|chinese|beijing|shanghai)\b|(?:중국|베이징|상하이))/iu],
  [
    "thailand",
    /(?:\b(?:thailand|thai|bangkok)\b|(?:태국|방콕))/iu,
  ],
  [
    "vietnam",
    /(?:\b(?:vietnam|vietnamese|viet\s*nam|hanoi|ha\s*noi|ho\s*chi\s*minh|saigon)\b|(?:베트남|하노이|호치민))/iu,
  ],
  ["indonesia", /(?:\b(?:indonesia|indonesian|jakarta)\b|(?:인도네시아|자카르타))/iu],
  ["singapore", /(?:\b(?:singapore|singaporean)\b|싱가포르)/iu],
  ["malaysia", /(?:\b(?:malaysia|malaysian|kuala\s*lumpur)\b|말레이시아)/iu],
  ["australia", /(?:\b(?:australia|australian|sydney|melbourne)\b|(?:호주|시드니|멜버른))/iu],
  ["canada", /(?:\b(?:canada|canadian|toronto|vancouver)\b|(?:캐나다|토론토|밴쿠버))/iu],
  ["germany", /(?:\b(?:germany|german|berlin)\b|(?:독일|베를린))/iu],
  ["india", /(?:\b(?:india|indian|new\s*delhi|mumbai)\b|(?:인도|뉴델리|뭄바이))/iu],
  ["philippines", /(?:\b(?:philippines|filipino|filipina|manila)\b|(?:필리핀|마닐라))/iu],
  ["bulgaria", /(?:\b(?:bulgaria|bulgarian|sofia)\b|불가리아)/iu],
  ["tanzania", /(?:\b(?:tanzania|tanzanian)\b|탄자니아)/iu],
  ["egypt", /(?:\b(?:egypt|egyptian|cairo)\b|(?:이집트|카이로))/iu],
]);

const vietnameseToneLetters = /[\u1EA0-\u1EF9]/gu;
const vietnameseSurname =
  /(?:^|[^a-z])(?:nguyen|tran|pham|hoang|huynh|bui)(?=$|[^a-z])/iu;
const thaiLetters = /[\u0E00-\u0E7F]/u;
const japaneseKana = /[\u3040-\u30FF]/u;
const hangul = /[\uAC00-\uD7A3]/u;

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

export const supportedMarketplaceCountryCodes = [
  ...marketplaceCountryCodes,
  ...isoAlpha2CountryCodes
    .filter((isoCode) => !isoCountryMap.has(isoCode))
    .map((isoCode) => `iso_${isoCode.toLowerCase()}`),
];

export function isSupportedMarketplaceCountryCode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (marketplaceCountryCodes.has(normalized)) return true;
  return (
    /^iso_[a-z]{2}$/.test(normalized) &&
    isIsoAlpha2CountryCode(normalized.slice(4))
  );
}

export function marketplaceCountryFromIso(value) {
  const iso = String(value ?? "").trim().toUpperCase();
  if (!isIsoAlpha2CountryCode(iso)) return "";
  return isoCountryMap.get(iso) ?? `iso_${iso.toLowerCase()}`;
}

export function normalizeMarketplaceCountryCodes(values) {
  if (!Array.isArray(values)) return [];
  return unique(
    values.map((value) => {
      const normalized = String(value ?? "").trim().toLowerCase();
      if (isSupportedMarketplaceCountryCode(normalized)) return normalized;
      return marketplaceCountryFromIso(normalized);
    }),
  );
}

function countCountryFlags(text) {
  const flags = String(text ?? "").match(/\p{Regional_Indicator}{2}/gu) ?? [];
  return unique(
    flags.map((flag) => {
      const isoCode = Array.from(flag)
        .map((character) =>
          String.fromCharCode(
            65 + Number(character.codePointAt(0)) - 0x1f1e6,
          ),
        )
        .join("");
      return marketplaceCountryFromIso(isoCode);
    }),
  );
}

function stripLocalizedPlatformBoilerplate(value) {
  return String(value ?? "")
    .replace(/(?:watch|view|see)\s+(?:the\s+)?(?:latest|popular)?\s*videos?/gi, " ")
    .replace(/(?:followers?|likes?|subscribers?)\s*[\d,.kmb]*/gi, " ")
    .replace(/(?:TikTok|틱톡)\s*(?:의|에서|on|sur|tr[eê]n)?/giu, " ")
    .replace(/(?:님의\s*(?:최신|인기)\s*동영상을\s*시청하세요|좋아요|팔로워)/gu, " ")
    .replace(/(?:lượt\s*thích|người\s*theo\s*dõi|xem\s*video|trên\s*tiktok)/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferCreatorCountries({
  displayName,
  bio,
  handle,
  officialCountryCode,
  inheritedCountries = [],
  trustInheritedCountries = false,
} = {}) {
  const nameAndHandle = `${displayName ?? ""} ${handle ?? ""}`.trim();
  const cleanedBio = stripLocalizedPlatformBoilerplate(bio);
  const locationSegments = cleanedBio.match(
    /(?:\u{1F4CD}|\bbased\s+in\b|\bliving\s+in\b|\bborn\s+in\b|\bfrom\b|거주|출신|활동지)[^|\n]{0,80}/giu,
  ) ?? [];
  const normalizedHandle = String(handle ?? "").replace(/[._-]+/g, " ");
  const handleLocationText = /\b(?:based|born|living|from|in)\b/iu.test(
    normalizedHandle,
  )
    ? normalizedHandle
    : "";
  const explicitLocationText = `${locationSegments.join(" ")} ${handleLocationText}`.trim();
  const weakCountrySignals = [];
  const vietnameseNameMatches = nameAndHandle.match(vietnameseToneLetters) ?? [];
  if (
    vietnameseNameMatches.length >= 2 ||
    vietnameseSurname.test(String(displayName ?? "")) ||
    /nguyen/i.test(String(handle ?? ""))
  ) {
    weakCountrySignals.push("vietnam");
  }
  if (thaiLetters.test(nameAndHandle)) weakCountrySignals.push("thailand");
  if (japaneseKana.test(nameAndHandle) && !hangul.test(nameAndHandle)) {
    weakCountrySignals.push("japan");
  }

  const officialCountry = marketplaceCountryFromIso(officialCountryCode);
  if (officialCountry) {
    return {
      countries: [officialCountry],
      confidence: "official",
      signals: [
        `official:${String(officialCountryCode).toUpperCase()}`,
        ...weakCountrySignals.map((country) => `script:${country}`),
      ],
    };
  }

  const profileText = `${nameAndHandle} ${cleanedBio}`.trim();
  const identityFlags = countCountryFlags(nameAndHandle);
  const locationFlags = countCountryFlags(locationSegments.join(" "));
  const detectedFlags = unique([...identityFlags, ...locationFlags]);
  const travelLike =
    detectedFlags.length >= 4 || /(?:\btravel(?:er|ler)?\b|여행|✈)/iu.test(profileText);
  const explicitCountries = [];

  for (const [country, pattern] of countryIdentityPatterns) {
    if (pattern.test(explicitLocationText)) explicitCountries.push(country);
  }
  if (!travelLike && locationFlags.length <= 3) {
    explicitCountries.push(...locationFlags);
  }

  const languageCountries = [...weakCountrySignals];
  const vietnameseMatches = cleanedBio.match(vietnameseToneLetters) ?? [];
  if (vietnameseMatches.length >= 3) languageCountries.push("vietnam");

  const normalizedLanguageCountries = unique(languageCountries);
  const normalizedExplicit = unique(explicitCountries);
  if (normalizedExplicit.length > 0) {
    return {
      countries: normalizedExplicit,
      confidence: "explicit",
      signals: [
        ...normalizedExplicit.map((country) => `profile:${country}`),
        ...normalizedLanguageCountries.map((country) => `script:${country}`),
        ...identityFlags
          .filter((country) => !normalizedExplicit.includes(country))
          .map((country) => `flag:${country}`),
        ...(travelLike ? ["travel-flags-ignored"] : []),
      ],
    };
  }

  if (normalizedLanguageCountries.length > 0) {
    return {
      countries: [],
      confidence: "unknown",
      signals: [
        ...normalizedLanguageCountries.map((country) => `script:${country}`),
        ...identityFlags.map((country) => `flag:${country}`),
        ...(travelLike ? ["travel-flags-ignored"] : []),
      ],
    };
  }

  if (trustInheritedCountries) {
    const inherited = normalizeMarketplaceCountryCodes(inheritedCountries);
    if (inherited.length > 0) {
      return {
        countries: inherited,
        confidence: "inherited",
        signals: inherited.map((country) => `inherited:${country}`),
      };
    }
  }

  return {
    countries: [],
    confidence: "unknown",
    signals: [
      ...identityFlags.map((country) => `flag:${country}`),
      ...(travelLike && detectedFlags.length > 0
        ? ["travel-flags-ignored"]
        : []),
    ],
  };
}

export function normalizePublicProfileUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURIComponent(url.pathname)
      .replace(/\/+$/, "")
      .toLowerCase();
    return `${host}${path}`;
  } catch {
    return "";
  }
}

export function influencerSourcePriority(sourceProvider) {
  const source = String(sourceProvider ?? "").toLowerCase();
  if (source === "youtube_data_api") return 100;
  if (source === "youtube_data_api_longtail") return 95;
  if (source.includes("verified")) return 90;
  if (source.includes("curated")) return 80;
  if (source.includes("public_api")) return 70;
  if (source.includes("ranking")) return 60;
  if (source.includes("crosslink")) return 50;
  if (source.includes("web_search")) return 40;
  return 30;
}

export function choosePreferredInfluencerRow(left, right) {
  const priorityDelta =
    influencerSourcePriority(right?.source_provider) -
    influencerSourcePriority(left?.source_provider);
  if (priorityDelta !== 0) return priorityDelta > 0 ? right : left;
  const qualityDelta = Number(right?.quality_score ?? 0) - Number(left?.quality_score ?? 0);
  if (qualityDelta !== 0) return qualityDelta > 0 ? right : left;
  return String(right?.id ?? "").localeCompare(String(left?.id ?? "")) < 0 ? right : left;
}
