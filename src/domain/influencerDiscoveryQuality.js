export const INSTAGRAM_PUBLIC_CREATOR_FOLLOWER_LIMIT = 2_000_000;

export const MARKETPLACE_CREATOR_CATEGORY_OPTIONS = Object.freeze([
  { value: "beauty", label: "뷰티" },
  { value: "fashion", label: "패션" },
  { value: "living", label: "리빙" },
  { value: "food", label: "맛집" },
  { value: "travel", label: "여행" },
  { value: "parenting", label: "육아" },
  { value: "pet", label: "반려동물" },
  { value: "fitness", label: "건강·운동" },
  { value: "game", label: "게임" },
  { value: "tech", label: "IT·테크" },
  { value: "education", label: "교육" },
  { value: "finance", label: "경제·비즈니스" },
  { value: "automotive", label: "자동차" },
  { value: "content", label: "일상·브이로그" },
]);

const categoryAliases = new Map(
  [
    [
      "beauty",
      ["beauty", "뷰티", "스킨케어", "메이크업", "화장품", "미용", "코스메틱"],
    ],
    [
      "fashion",
      ["fashion", "패션", "스타일링", "코디", "의류", "신발", "액세서리"],
    ],
    [
      "living",
      [
        "living",
        "lifestyle",
        "리빙",
        "라이프스타일",
        "홈",
        "인테리어",
        "diy",
        "셀프diy",
        "살림",
        "생활",
      ],
    ],
    [
      "food",
      [
        "food",
        "mukbang",
        "푸드",
        "맛집",
        "요리",
        "먹방",
        "카페",
        "홈카페",
        "레시피",
      ],
    ],
    ["travel", ["travel", "여행", "숙박", "로컬", "호텔", "캠핑"]],
    [
      "parenting",
      ["parenting", "kids", "육아", "키즈", "키즈카페", "출산", "유아"],
    ],
    [
      "pet",
      [
        "pet",
        "pets",
        "펫",
        "애견",
        "반려동물",
        "강아지",
        "고양이",
        "반려견",
        "반려묘",
      ],
    ],
    [
      "fitness",
      [
        "fitness",
        "fit",
        "health",
        "운동",
        "헬스",
        "건강",
        "피트니스",
        "트레이너",
        "다이어트",
        "홈트",
      ],
    ],
    ["game", ["game", "gaming", "게임", "게이밍", "스트리밍", "e스포츠"]],
    [
      "tech",
      ["tech", "technology", "테크", "생활가전", "가전", "디지털"],
    ],
    [
      "education",
      [
        "education",
        "교육",
        "공부",
        "학습",
        "어학",
        "커리어",
        "영어",
        "한국어 강사",
        "한국어 교육",
      ],
    ],
    [
      "finance",
      ["finance", "business", "경제", "금융", "재테크", "주식", "비즈니스"],
    ],
    ["automotive", ["automotive", "car", "자동차", "차량", "모빌리티"]],
    [
      "content",
      [
        "content",
        "entertainment",
        "콘텐츠",
        "엔터테인먼트",
        "브이로그",
        "일상",
        "코미디",
      ],
    ],
  ].flatMap(([key, aliases]) =>
    aliases.map((alias) => [String(alias).trim().toLocaleLowerCase("ko"), key]),
  ),
);

for (const option of MARKETPLACE_CREATOR_CATEGORY_OPTIONS) {
  categoryAliases.set(option.label.toLocaleLowerCase("ko"), option.value);
}

const categoryLabels = new Map(
  MARKETPLACE_CREATOR_CATEGORY_OPTIONS.map((option) => [
    option.value,
    option.label,
  ]),
);

const businessIdentityPatterns = [
  /(?:공식\s*(?:계정|채널|몰|스토어|인스타그램)|브랜드\s*공식|주식회사|유한회사|법인|컴퍼니|쇼핑몰|백화점|대형마트|병원|의원|클리닉|대학교|학교법인|협회|재단|공공기관|관공서|시청|구청|군청|공항|은행|카드사|증권|보험|매거진|잡지|언론사|신문사|방송사|항공사|여행사|엔터테인먼트|소속사|구단|e\s*스포츠|미용기기|미용가구|미용재료|샴푸대)/iu,
  /(?:^|[\s|/._-])(?:official\s*(?:account|channel|shop|store)|shop|store|mall|company|corporation|corp|manufacturer|clinic|hospital|university|foundation|association|government|magazine|news|media|airlines?|travel\s*agency|entertainment|esports)(?:$|[\s|/._-])/iu,
];

const strongBusinessMetadataPatterns = [
  /(?:브랜드\s*공식|본사\s*계정|고객\s*센터|전국\s*매장|채용\s*문의|법인\s*문의|가맹\s*문의)/iu,
  /(?:official\s*(?:brand|shop|store)|corporate\s*(?:account|office)|customer\s*(?:service|support)|store\s*locator|wholesale\s*inquir)/iu,
];

const commercialMetadataPatterns = [
  /(?:온라인\s*주문|제품\s*구매|매장\s*문의|견적\s*문의|구매\s*링크|주문\s*문의|배송\s*문의)/iu,
  /(?:online\s*(?:shop|store)|shop\s*now|order\s*(?:now|online)|worldwide\s*shipping|available\s+at)/iu,
  /(?:사업자\s*등록|통신판매|제조|유통|도매|대리점|입점\s*문의)/iu,
];

const celebrityPatterns = [
  /(?:^|[\s(/_-])(?:배우|가수|아이돌|방송인|개그맨|개그우먼|코미디언|아나운서|뮤지션|래퍼|보이그룹|걸그룹)(?:$|[\s)/_-])/iu,
  /(?:^|[\s(/_.-])(?:actor|actress|singer|idol|musician|rapper|comedian|entertainer|television\s*presenter|tv\s*host|k-?pop\s*(?:artist|group))(?:$|[\s)/_.-])/iu,
  /(?:팬\s*(?:계정|페이지|베이스)|fan\s*(?:account|page|base)|updates?\s+(?:account|page))/iu,
];

const strongCelebrityMetadataPatterns = [
  /(?:^|[\s|/._-])(?:배우|가수|아이돌|방송인|개그맨|개그우먼|코미디언|아나운서|뮤지션|래퍼|프로게이머|프로골프선수|프로축구선수|프로야구선수|프로농구선수|프로배구선수)(?:$|[\s|/._-])/iu,
  /(?:^|[\s|/._-])(?:actor|actress|singer|idol|musician|rapper|comedian|entertainer|television\s*presenter|tv\s*host|professional\s*(?:athlete|gamer))(?:$|[\s|/._-])/iu,
];

const businessHandlePatterns = [
  /(?:^|[._-])of[_-]?f?icial(?:$|[._-])/iu,
  /(?:of+icial|off?c?ial|officail)$/iu,
  /(?:^|[._-])(?:brand|shop|store|mall|corp|company|clinic|hospital|magazine|news|media|hotel|resort|esports)(?:$|[._-])/iu,
  /(?:^|[._-])(?:agency|bank|holdings|furniture)(?:$|[._-])/iu,
  /(?:fanbase|fanpage|updates|bighit|entertainment)/iu,
];

const businessHandleContextPatterns = [
  /(?:official|of+icial|shop|store|mall|company|corp|korea|_kr|\.kr)$/iu,
  /(?:brand|shop|store|mall|corp|company|clinic|hospital|magazine|news|media|hotel|resort|airline|esports)/iu,
];

const businessDisplayNamePatterns = [
  /(?:마켓|스토어|호텔|리조트|airlines?|hotels?|resorts?)\s*$/iu,
  /(?:팩토리|factory)\)?\s*(?:hq)?\s*$/iu,
  /애견카페.*호텔.*유치원/iu,
];

const creatorDisplayContextPattern =
  /(?:여행|맛집|숙소|리뷰|크리에이터|인플루언서|브이로그|일상|언니|엄마|아빠|작가|에디터|travel|review|creator|influencer|vlog)/iu;

// These accounts were directly reviewed after search snippets confused a
// creator's own business registration or content subject with account type.
const reviewedIndependentCreatorHandles = new Set([
  "39.cho",
  "9th_london",
  "chae.on",
  "crazy_greapa",
  "dohyun_streetworkout",
  "engtoontv",
  "friendshiping94",
  "haroni_kim",
  "heungburton",
  "gyung_studio",
  "itseunchaeofficial",
  "jadipiaofficial",
  "jess.02.23",
  "jinbaekofficial",
  "jinsu_jung",
  "jmom_table",
  "kyutaeoppa",
  "lavisuofficial",
  "mia_korean",
  "palhosquare",
  "parclassic",
  "seon_h_e",
  "songsukjung",
  "swim_hyunlee",
  "uglynoeuly",
  "uroi.home",
  "xfactorgolf_angma",
  "yeyecoreaninhaoficial",
  "yoonara_mood",
  "yuns.ohyunseok",
]);

const reviewedNonCreatorAccounts = new Map([
  ["10000recipe", "business"],
  ["abyss_sunmi", "celebrity"],
  ["all.about.20s", "organization"],
  ["artart.today", "organization"],
  ["baskinrobbinskorea", "business"],
  ["codibook", "business"],
  ["dayoungism", "celebrity"],
  ["dinotaeng", "business"],
  ["eatmother", "organization"],
  ["hotpeul_tour", "organization"],
  ["jeonguk_hotpeul", "organization"],
  ["jimin.bighiitentertaiinment", "organization"],
  ["jungkookieslove", "organization"],
  ["kdramakorean_indo", "organization"],
  ["na_onion", "celebrity"],
  ["nida_hyunha", "celebrity"],
  ["parkjjongaa", "celebrity"],
  ["postarchivefaction", "business"],
  ["ppulbatu", "organization"],
  ["sillllling", "celebrity"],
  ["slow.and", "business"],
  ["st.chengdam", "business"],
  ["stellakimofficial", "celebrity"],
  ["superstar_jhs", "celebrity"],
  ["thv_hybez", "organization"],
  ["t1_oner", "celebrity"],
  ["r_yuhyeju", "celebrity"],
  ["yyyoungggggg", "celebrity"],
  ["yg_stage", "business"],
  ["zanmang_loopy", "business"],
  ["account.leeminho", "organization"],
  ["ableenglish_ae", "business"],
  ["all.about.busan", "organization"],
  ["all.about.jeju", "organization"],
  ["all.about.seoul.trip", "organization"],
  ["arenakorea", "business"],
  ["aster_djofficial", "celebrity"],
  ["busanplanet", "organization"],
  ["busansomang", "organization"],
  ["busantravel", "organization"],
  ["cake.english.kr", "business"],
  ["dazedkorea", "business"],
  ["deeenerss", "celebrity"],
  ["disneypluskr", "business"],
  ["donki_kr", "business"],
  ["esquire.korea", "business"],
  ["etudeofficial", "business"],
  ["fastpapermag", "business"],
  ["foodyinkorea", "organization"],
  ["goxnniee", "celebrity"],
  ["grc_unlimited_ceo", "business"],
  ["gumayusi", "celebrity"],
  ["hajiwon.22", "celebrity"],
  ["hv_nara", "celebrity"],
  ["home.it_insta", "organization"],
  ["iwoosung", "celebrity"],
  ["iwomansense", "business"],
  ["jeonguk_food", "organization"],
  ["joohoneywalker", "celebrity"],
  ["kainrivers", "business"],
  ["kbsdrama", "business"],
  ["kimchi_chic", "celebrity"],
  ["korea_yangiliklari", "organization"],
  ["keria_minseok", "celebrity"],
  ["leechanhyuk", "celebrity"],
  ["liakimhappy", "celebrity"],
  ["lottewellfood", "business"],
  ["mbcdrama_now", "business"],
  ["mijiracer", "celebrity"],
  ["minleemusic", "celebrity"],
  ["nailmc.nail", "business"],
  ["noblessekorea", "business"],
  ["onepick_day", "organization"],
  ["officialmashiho", "celebrity"],
  ["olympic", "organization"],
  ["park.shinhye", "organization"],
  ["petzip", "business"],
  ["romandyou", "business"],
  ["rt_holdings", "business"],
  ["samsungkorea", "business"],
  ["saebomoh", "celebrity"],
  ["seoul_thehotple", "organization"],
  ["seoul.southkorea", "business"],
  ["si_hyun_car", "celebrity"],
  ["southkorea.explores", "organization"],
  ["speak_kr", "business"],
  ["stylechosun", "business"],
  ["studio_choom", "business"],
  ["tarzzan", "celebrity"],
  ["theclasskorea", "business"],
  ["thingthing.kr", "organization"],
  ["think.busan", "organization"],
  ["think_matjip", "organization"],
  ["todayhouse", "business"],
  ["visitkorea_travel", "organization"],
  ["williamhammington", "celebrity"],
  ["wjswhdtj94", "celebrity"],
  ["wwdkorea", "business"],
  ["yesstyle", "business"],
  ["yeomi.travel", "business"],
  ["yuhengsa", "organization"],
]);

const fanAccountIdentityPattern =
  /(?:팬\s*(?:계정|페이지|베이스)|fan\s*(?:account|page|base)|fanstagram|fans?\s+page|not\s+impersonat|dedicated\s+to)/iu;
const fanAccountHandlePattern =
  /(?:^|[._-])(?:aespa|apink|blackpink|bts|enhypen|exo|itzy|lesserafim|nct|newjeans|redvelvet|seventeen|straykids|twice)(?:$|[._-])|^(?:aespa|apink|blackpink|bts|enhypen|exo|itzy|lesserafim|nct|newjeans|redvelvet|seventeen|straykids|twice)|(?:aespa|apink|blackpink|bts|enhypen|exo|itzy|lesserafim|nct|newjeans|redvelvet|seventeen|straykids|twice)$/iu;

const externalCelebrityIdentityMarkers = [
  "배우",
  "가수",
  "아이돌",
  "방송인",
  "개그맨",
  "개그우먼",
  "코미디언",
  "아나운서",
  "연예인",
  "뮤지션",
  "래퍼",
  "보이그룹",
  "걸그룹",
  "프로게이머",
  "국가대표",
  "프로축구선수",
  "프로야구선수",
  "프로농구선수",
  "프로배구선수",
  "프로골프선수",
  "프로테니스선수",
  "레이싱드라이버",
  "actor",
  "actress",
  "singer",
  "idol",
  "musician",
  "rapper",
  "comedian",
  "entertainer",
  "tvhost",
  "televisionpresenter",
  "kpopartist",
  "kpopgroup",
  "professionalathlete",
  "professionalgamer",
];

const externalTargetedCelebrityIdentityMarkers = [
  "배우",
  "가수",
  "아이돌",
  "방송인",
  "개그맨",
  "개그우먼",
  "코미디언",
  "아나운서",
  "연예인",
  "뮤지션",
  "래퍼",
  "보이그룹",
  "걸그룹",
  "actor",
  "actress",
  "singer",
  "idol",
  "musician",
  "rapper",
  "comedian",
  "entertainer",
  "tvhost",
  "televisionpresenter",
  "kpopartist",
  "kpopgroup",
];

const externalBusinessIdentityMarkers = [
  "주식회사",
  "유한회사",
  "법인기업",
  "기업정보",
  "기업개요",
  "본사계정",
  "본사홈페이지",
  "공식쇼핑몰",
  "공식스토어",
  "공식온라인몰",
  "온라인쇼핑몰",
  "방송사",
  "언론사",
  "신문사",
  "패션매거진",
  "라이프스타일매거진",
  "여행플랫폼",
  "마케팅대행사",
  "companylimited",
  "limitedcompany",
  "limited",
  "ltd",
  "corporation",
  "officialshop",
  "officialstore",
  "officialbrand",
  "onlineshop",
  "onlinestore",
  "fashionmagazine",
  "lifestylemagazine",
  "newsmedia",
  "broadcastingcompany",
  "broadcastingnetwork",
  "marketingagency",
];

const externalSoftBusinessIdentityMarkers = [
  "앱다운로드",
  "고객센터",
  "전국매장",
  "가맹문의",
  "입점문의",
  "무료견적",
  "공식사이트",
  "downloadtheapp",
  "downloadourapp",
  "customerservice",
  "customersupport",
  "storelocator",
  "shopfashion",
  "jobsbusinessopportunities",
];

function decodeExternalSearchText(value) {
  return normalizeText(value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&amp;/giu, "&")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactIdentityText(value) {
  return decodeExternalSearchText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[^0-9a-z가-힣]+/giu, "");
}

function getExternalIdentityAliases(row) {
  const displayName = decodeExternalSearchText(row?.display_name).normalize(
    "NFKC",
  );
  const firstSegment = displayName.split(/[|｜/,(\x5B]/u)[0]?.trim();
  const withoutDescriptors = displayName
    .replace(/\([^)]*\)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const wordAliases = displayName
    .split(/[^0-9A-Za-z가-힣]+/gu)
    .map(compactIdentityText)
    .filter(
      (value) =>
        value.length >= 3 &&
        ![
          "instagram",
          "official",
          "korea",
          "travel",
          "hotels",
          "food",
          "tips",
          "인스타그램",
          "공식",
        ].includes(value),
    );
  return Array.from(
    new Set(
      [firstSegment, withoutDescriptors, displayName, ...wordAliases]
        .map(compactIdentityText)
        .filter((value) => value.length >= 3),
    ),
  ).sort((left, right) => right.length - left.length);
}

function hasAdjacentIdentityMarker(
  compactEvidence,
  identities,
  markers,
  maximumGap,
) {
  for (const identity of identities) {
    if (markers.some((marker) => identity.includes(marker))) continue;
    let identityIndex = compactEvidence.indexOf(identity);
    while (identityIndex >= 0) {
      const identityEnd = identityIndex + identity.length;
      for (const marker of markers) {
        let markerIndex = compactEvidence.indexOf(marker);
        while (markerIndex >= 0) {
          const markerContext = compactEvidence.slice(
            markerIndex,
            markerIndex + marker.length + 3,
          );
          if (
            marker === "배우" &&
            (
              /^배우(?:면서|고|기|다|려|면|며|자|도록|다가)/u.test(
                markerContext,
              ) ||
              (/^배우는/u.test(markerContext) &&
                /(?:을|를|로)$/u.test(
                  compactEvidence.slice(Math.max(0, markerIndex - 2), markerIndex),
                ))
            )
          ) {
            markerIndex = compactEvidence.indexOf(marker, markerIndex + 1);
            continue;
          }
          const markerEnd = markerIndex + marker.length;
          const gap =
            markerEnd <= identityIndex
              ? identityIndex - markerEnd
              : identityEnd <= markerIndex
                ? markerIndex - identityEnd
                : 0;
          if (gap <= maximumGap) return true;
          markerIndex = compactEvidence.indexOf(marker, markerIndex + 1);
        }
      }
      identityIndex = compactEvidence.indexOf(identity, identityIndex + 1);
    }
  }
  return false;
}

export function classifyExternalInfluencerSearchEvidence(
  row,
  items,
  options = {},
) {
  const handle = normalizeText(row?.platform_handle)
    .replace(/^@/u, "")
    .toLocaleLowerCase("en");
  if (!handle || !Array.isArray(items) || items.length === 0) return undefined;
  if (reviewedIndependentCreatorHandles.has(handle)) return undefined;

  const compactHandle = compactIdentityText(handle);
  const aliases = getExternalIdentityAliases(row);
  const followerCount = Number(row?.follower_count);
  const hasProfileIdentityResult = items.some((item) => {
    const evidenceText = `${decodeExternalSearchText(
      item?.title,
    )} ${decodeExternalSearchText(item?.description)} ${decodeExternalSearchText(
      item?.link,
    )}`;
    return (
      compactHandle.length >= 3 &&
      compactIdentityText(evidenceText).includes(compactHandle)
    );
  });
  let softBusinessMatches = 0;
  let softBusinessSource = "";

  for (const item of items) {
    const title = decodeExternalSearchText(item?.title);
    const description = decodeExternalSearchText(item?.description);
    const link = decodeExternalSearchText(item?.link);
    const evidenceText = `${title} ${description}`;
    const relevanceText = `${evidenceText} ${link}`;
    const compactEvidence = compactIdentityText(evidenceText);
    const compactRelevance = compactIdentityText(relevanceText);
    const compactTitle = compactIdentityText(title);
    const handleMatches =
      compactHandle.length >= 3 && compactRelevance.includes(compactHandle);
    const aliasMatches =
      Number.isFinite(followerCount) &&
      followerCount >= 300_000 &&
      (hasProfileIdentityResult || options.trustTitleAlias === true) &&
      aliases.some(
        (alias) =>
          (alias.length >= 4 || /^[가-힣]{3,}$/u.test(alias)) &&
          compactTitle.includes(alias),
      );
    if (!handleMatches && !aliasMatches) continue;

    const matchedIdentities = aliases.filter((alias) =>
      compactEvidence.includes(alias),
    );
    if (
      hasAdjacentIdentityMarker(
        compactEvidence,
        matchedIdentities,
        externalCelebrityIdentityMarkers,
        4,
      ) ||
      (options.trustTitleAlias === true &&
        hasAdjacentIdentityMarker(
          compactEvidence,
          matchedIdentities,
          externalTargetedCelebrityIdentityMarkers,
          24,
        ))
    ) {
      return {
        type: "celebrity",
        reason: "verified_external_review",
        source: link,
        evidence: `${title} ${description}`.slice(0, 360),
      };
    }
    if (
      hasAdjacentIdentityMarker(
        compactEvidence,
        matchedIdentities,
        [
          "사업자번호",
          "사업자등록번호",
          "법인명",
          "기업형태",
          "대표자명",
          "통신판매업",
          "companyinfo",
        ],
        12,
      ) ||
      (hasAdjacentIdentityMarker(
        compactEvidence,
        matchedIdentities,
        ["대표번호", "영업시간", "주소지"],
        12,
      ) &&
        /(?:매장|주류|카페|레스토랑|쇼룸|스토어|shop|store|bar)/iu.test(
          evidenceText,
        ))
    ) {
      return {
        type: "business",
        reason: "verified_external_review",
        source: link,
        evidence: `${title} ${description}`.slice(0, 360),
      };
    }
    if (
      hasAdjacentIdentityMarker(
        compactEvidence,
        matchedIdentities,
        externalBusinessIdentityMarkers,
        8,
      ) ||
      (options.trustTitleAlias === true &&
        hasAdjacentIdentityMarker(
          compactEvidence,
          matchedIdentities,
          externalBusinessIdentityMarkers,
          24,
        ))
    ) {
      return {
        type: "business",
        reason: "verified_external_review",
        source: link,
        evidence: `${title} ${description}`.slice(0, 360),
      };
    }
    if (
      hasAdjacentIdentityMarker(
        compactEvidence,
        matchedIdentities,
        externalSoftBusinessIdentityMarkers,
        10,
      )
    ) {
      softBusinessMatches += 1;
      softBusinessSource ||= link;
    }
  }

  if (softBusinessMatches >= 2) {
    return {
      type: "business",
      reason: "verified_external_review",
      source: softBusinessSource,
      evidence: `organization signals found in ${softBusinessMatches} search results`,
    };
  }
  return undefined;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function categoryTextIncludesAlias(text, alias) {
  if (/^[a-z0-9]+$/iu.test(alias) && alias.length <= 3) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `(?:^|[^a-z0-9])${escapedAlias}(?:$|[^a-z0-9])`,
      "iu",
    ).test(text);
  }
  return text.includes(alias);
}

const categoryInferencePriority = [
  "pet",
  "fitness",
  "beauty",
  "travel",
  "food",
  "fashion",
  "parenting",
  "game",
  "tech",
  "education",
  "finance",
  "automotive",
  "living",
  "content",
];

const reviewedCategoryOverrides = new Map([
  ["inocat_t", "pet"],
  ["miso_ara", "pet"],
  ["rico_9c", "fitness"],
  ["self_diy", "living"],
]);

function inferCategoryFromText(value) {
  const text = normalizeText(value).toLocaleLowerCase("ko");
  if (!text) return "";
  let bestCategory = "";
  let bestScore = 0;
  for (const category of categoryInferencePriority) {
    for (const [alias, key] of categoryAliases) {
      if (key === category && categoryTextIncludesAlias(text, alias)) {
        const score = Array.from(alias).length;
        if (score > bestScore) {
          bestCategory = key;
          bestScore = score;
        }
      }
    }
  }
  return bestCategory;
}

export function normalizeMarketplaceCreatorCategory(value) {
  const normalized = normalizeText(value).toLocaleLowerCase("ko");
  return categoryAliases.get(normalized) ?? "";
}

export function getMarketplaceCreatorCategoryLabel(value) {
  const key =
    normalizeMarketplaceCreatorCategory(value) || normalizeText(value);
  return categoryLabels.get(key) ?? "기타";
}

export function inferMarketplaceCreatorCategory(row) {
  const platformHandle = normalizeText(row?.platform_handle)
    .replace(/^@/u, "")
    .toLocaleLowerCase("en");
  const reviewedCategory = reviewedCategoryOverrides.get(platformHandle);
  if (reviewedCategory) return reviewedCategory;

  const identityCategory = inferCategoryFromText(
    [
      row?.display_name,
      row?.platform_handle,
      row?.source_keyword,
    ]
      .map(normalizeText)
      .join(" "),
  );
  if (identityCategory) return identityCategory;

  const evidenceCategory = normalizeText(row?.source_evidence?.sourceCategory);
  const candidates = [
    evidenceCategory,
    ...(Array.isArray(row?.categories) ? row.categories : []),
  ];
  for (const candidate of candidates) {
    const key = normalizeMarketplaceCreatorCategory(candidate);
    if (key && key !== "content") return key;
  }
  const biographyCategory = inferCategoryFromText(row?.bio);
  if (biographyCategory) return biographyCategory;
  if (
    candidates.some((candidate) =>
      normalizeMarketplaceCreatorCategory(candidate),
    )
  ) {
    return "content";
  }
  return "content";
}

export function normalizeMarketplaceCreatorCategories(row) {
  return [
    getMarketplaceCreatorCategoryLabel(inferMarketplaceCreatorCategory(row)),
  ];
}

export function classifyDiscoveredInfluencerAccount(row) {
  const platform = normalizeText(row?.platform).toLowerCase();
  const platformHandle = normalizeText(row?.platform_handle)
    .replace(/^@/, "")
    .toLocaleLowerCase("en");
  if (
    platform === "instagram" &&
    reviewedIndependentCreatorHandles.has(platformHandle)
  ) {
    return {
      excluded: false,
      type: "creator",
      reason: "manual_independent_creator_review",
    };
  }

  const evidenceType = normalizeText(
    row?.source_evidence?.accountCuration?.type,
  );
  const evidenceReason = normalizeText(
    row?.source_evidence?.accountCuration?.reason,
  );
  const hasTrustedExternalEvidence = [
    "wikidata_instagram_handle",
    "manual_review",
    "verified_external_review",
  ].includes(evidenceReason);
  if (
    ["celebrity", "business", "organization"].includes(evidenceType) &&
    hasTrustedExternalEvidence
  ) {
    return {
      excluded: true,
      type: evidenceType,
      reason: evidenceReason,
    };
  }

  const reviewedAccountType = reviewedNonCreatorAccounts.get(platformHandle);
  if (platform === "instagram" && reviewedAccountType) {
    return {
      excluded: true,
      type: reviewedAccountType,
      reason: "manual_review",
    };
  }
  const followerCount = Number(row?.follower_count);
  if (
    platform === "instagram" &&
    Number.isFinite(followerCount) &&
    followerCount > INSTAGRAM_PUBLIC_CREATOR_FOLLOWER_LIMIT
  ) {
    return {
      excluded: true,
      type: "high_reach_public_figure",
      reason: "instagram_over_2m",
    };
  }

  const displayName = normalizeText(row?.display_name);
  const identityText = [displayName, row?.platform_handle, row?.profile_url]
    .map(normalizeText)
    .join(" ");
  const combinedText = [identityText, row?.bio].map(normalizeText).join(" ");

  if (
    platform === "instagram" &&
    (fanAccountIdentityPattern.test(combinedText) ||
      fanAccountHandlePattern.test(platformHandle))
  ) {
    return {
      excluded: true,
      type: "organization",
      reason: "fan_account_signal",
    };
  }
  const strongMetadataSignal = strongBusinessMetadataPatterns.some((pattern) =>
    pattern.test(combinedText),
  );
  const commercialSignalCount = commercialMetadataPatterns.filter((pattern) =>
    pattern.test(combinedText),
  ).length;
  const hasBusinessHandleContext = businessHandleContextPatterns.some(
    (pattern) => pattern.test(platformHandle),
  );
  const hasBusinessHandleSignal = businessHandlePatterns.some((pattern) =>
    pattern.test(platformHandle),
  );
  const hasBusinessIdentitySignal = businessIdentityPatterns.some((pattern) =>
    pattern.test(identityText),
  );
  const hasBusinessDisplayNameSignal = businessDisplayNamePatterns.some(
    (pattern) => pattern.test(displayName),
  );
  const hasCreatorDisplayContext =
    creatorDisplayContextPattern.test(displayName);

  if (hasBusinessHandleSignal) {
    return {
      excluded: true,
      type: "business",
      reason: "business_handle_signal",
    };
  }
  if (
    hasBusinessIdentitySignal ||
    (hasBusinessDisplayNameSignal && !hasCreatorDisplayContext)
  ) {
    return {
      excluded: true,
      type: "business",
      reason: "business_identity_signal",
    };
  }
  if (
    strongMetadataSignal ||
    commercialSignalCount >= 2 ||
    (commercialSignalCount >= 1 && hasBusinessHandleContext)
  ) {
    return {
      excluded: true,
      type: "business",
      reason: "business_metadata_signal",
    };
  }
  if (celebrityPatterns.some((pattern) => pattern.test(identityText))) {
    return {
      excluded: true,
      type: "celebrity",
      reason: "celebrity_identity_signal",
    };
  }
  if (
    platform === "instagram" &&
    strongCelebrityMetadataPatterns.some((pattern) => pattern.test(combinedText))
  ) {
    return {
      excluded: true,
      type: "celebrity",
      reason: "celebrity_metadata_signal",
    };
  }

  return { excluded: false, type: "creator", reason: "creator_candidate" };
}
