export const CAMPAIGN_TITLE_MAX_GRAPHEMES = 40;
export const CAMPAIGN_TITLE_MAX_UNBROKEN_GRAPHEMES = 20;

export const CAMPAIGN_OG_TITLE_FONT_TIERS = [
  { maxGraphemes: 16, fontSize: 80 },
  { maxGraphemes: 24, fontSize: 68 },
  { maxGraphemes: 32, fontSize: 60 },
  { maxGraphemes: CAMPAIGN_TITLE_MAX_GRAPHEMES, fontSize: 52 },
] as const;

const replaceControlCharacters = (value: string) =>
  Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
      ? " "
      : character;
  }).join("");

const createSegmenter = (granularity: "grapheme" | "word") => {
  if (typeof Intl.Segmenter !== "function") return undefined;
  return new Intl.Segmenter("ko", { granularity });
};

const graphemeSegmenter = createSegmenter("grapheme");
const wordSegmenter = createSegmenter("word");

export const normalizeCampaignTitle = (value: unknown) =>
  typeof value === "string"
    ? replaceControlCharacters(value)
        .replace(/\s+/g, " ")
        .trim()
    : "";

export const splitCampaignTitleGraphemes = (value: string) =>
  graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment)
    : Array.from(value);

export const countCampaignTitleGraphemes = (value: string) =>
  splitCampaignTitleGraphemes(value).length;

export const getCampaignTitleFontSize = (value: string) => {
  const length = countCampaignTitleGraphemes(normalizeCampaignTitle(value));
  return (
    CAMPAIGN_OG_TITLE_FONT_TIERS.find(
      ({ maxGraphemes }) => length <= maxGraphemes,
    )?.fontSize ?? CAMPAIGN_OG_TITLE_FONT_TIERS.at(-1)!.fontSize
  );
};

export const getCampaignTitleBreakCandidates = (value: string) => {
  const normalized = normalizeCampaignTitle(value);
  if (!normalized) return [];

  if (!wordSegmenter) {
    return Array.from(normalized.matchAll(/\s+/g), (match) => match.index)
      .filter((index): index is number => typeof index === "number")
      .filter((index) => index > 0 && index < normalized.length);
  }

  const candidates = new Set<number>();
  const segments = Array.from(wordSegmenter.segment(normalized));
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];
    const segmentEnd = segment.index + segment.segment.length;

    if (/\s/u.test(segment.segment)) {
      candidates.add(segment.index);
      candidates.add(segmentEnd);
      continue;
    }

    if (/\s/u.test(next.segment) || segment.isWordLike === true) {
      candidates.add(segmentEnd);
    }
  }

  return Array.from(candidates)
    .filter((index) => index > 0 && index < normalized.length)
    .sort((left, right) => left - right);
};

export const getCampaignTitleValidationError = (value: unknown) => {
  const title = normalizeCampaignTitle(value);
  if (!title) return "캠페인명을 입력해 주세요.";
  if (countCampaignTitleGraphemes(title) > CAMPAIGN_TITLE_MAX_GRAPHEMES) {
    return `캠페인명은 ${CAMPAIGN_TITLE_MAX_GRAPHEMES}자 이내로 입력해 주세요.`;
  }
  if (
    title
      .split(/\s+/u)
      .some(
        (segment) =>
          countCampaignTitleGraphemes(segment) >
          CAMPAIGN_TITLE_MAX_UNBROKEN_GRAPHEMES,
      )
  ) {
    return `긴 단어는 ${CAMPAIGN_TITLE_MAX_UNBROKEN_GRAPHEMES}자 안에서 띄어쓰기를 추가해 주세요.`;
  }
  return undefined;
};
