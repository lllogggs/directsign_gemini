import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "@vercel/og";
import type { ReactElement } from "react";
import { PRODUCT_NAME } from "../src/domain/brand.js";
import type { InfluencerPlatform } from "../src/domain/verification.js";
import {
  CAMPAIGN_TITLE_MAX_GRAPHEMES,
  countCampaignTitleGraphemes,
  getCampaignTitleBreakCandidates,
  getCampaignTitleFontSize,
  getCampaignOgImagePath,
  normalizeCampaignTitle,
} from "../src/domain/campaignPresentation.js";

const PUBLIC_ORIGIN = "https://yeollock.me";
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;
const TITLE_SAFE_WIDTH = 1040;
const GENERIC_CAMPAIGN_TITLE = "인플루언서 캠페인";

type OpenTypeFont = {
  getAdvanceWidth: (
    text: string,
    fontSize: number,
    options?: Record<string, unknown>,
  ) => number;
};

type OpenTypeModule = {
  parse: (buffer: ArrayBuffer) => OpenTypeFont;
};

export type CampaignSharePreviewInput = {
  id: string;
  title: string;
  typeLabel: string;
  platforms: InfluencerPlatform[];
  updatedAt?: string;
};

export type CampaignOgTitleLayout = {
  title: string;
  lines: [string] | [string, string];
  fontSize: number;
  lineHeight: number;
};

type ShareMetadata = {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  imageAlt: string;
  robots: string;
};

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");
const fontDirectory = path.join(projectRoot, "public", "fonts", "nanum-square-neo");
const regularFontBuffer = fs.readFileSync(
  path.join(fontDirectory, "NanumSquareNeo-bRg.ttf"),
);
const extraBoldFontBuffer = fs.readFileSync(
  path.join(fontDirectory, "NanumSquareNeo-dEb.ttf"),
);
const heavyFontBuffer = fs.readFileSync(
  path.join(fontDirectory, "NanumSquareNeo-eHv.ttf"),
);
const require = createRequire(import.meta.url);
const opentype = require("@shuding/opentype.js") as OpenTypeModule;
const measurementFont = opentype.parse(
  extraBoldFontBuffer.buffer.slice(
    extraBoldFontBuffer.byteOffset,
    extraBoldFontBuffer.byteOffset + extraBoldFontBuffer.byteLength,
  ),
);

const measureTitle = (text: string, fontSize: number) =>
  measurementFont.getAdvanceWidth(text, fontSize, { kerning: true });

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const uniquePlatforms = (platforms: InfluencerPlatform[]) =>
  Array.from(new Set(platforms)).filter(
    (platform): platform is Exclude<InfluencerPlatform, "other"> =>
      platform !== "other",
  );

const platformLabel: Record<Exclude<InfluencerPlatform, "other">, string> = {
  instagram: "인스타그램",
  youtube: "유튜브",
  tiktok: "틱톡",
  naver_blog: "네이버 블로그",
};

const stripLegacyTitleAtWordBoundary = (value: string) => {
  const normalized = normalizeCampaignTitle(value);
  if (countCampaignTitleGraphemes(normalized) <= CAMPAIGN_TITLE_MAX_GRAPHEMES) {
    return normalized;
  }

  const candidates = getCampaignTitleBreakCandidates(normalized).filter(
    (index) =>
      countCampaignTitleGraphemes(normalized.slice(0, index).trim()) <
      CAMPAIGN_TITLE_MAX_GRAPHEMES,
  );
  const boundary = candidates.at(-1);
  return boundary === undefined
    ? GENERIC_CAMPAIGN_TITLE
    : `${normalized.slice(0, boundary).trim()}…`;
};

const chooseBalancedLines = (
  title: string,
  fontSize: number,
  candidates: number[],
) => {
  const fitting = candidates
    .map((index) => {
      const first = title.slice(0, index).trim();
      const second = title.slice(index).trim();
      return {
        first,
        second,
        firstWidth: measureTitle(first, fontSize),
        secondWidth: measureTitle(second, fontSize),
      };
    })
    .filter(
      ({ first, second, firstWidth, secondWidth }) =>
        first &&
        second &&
        firstWidth <= TITLE_SAFE_WIDTH &&
        secondWidth <= TITLE_SAFE_WIDTH,
    )
    .sort((left, right) => {
      const leftBalance = Math.abs(left.firstWidth - left.secondWidth);
      const rightBalance = Math.abs(right.firstWidth - right.secondWidth);
      return leftBalance - rightBalance;
    });

  const best = fitting[0];
  return best ? ([best.first, best.second] as [string, string]) : undefined;
};

export const layoutCampaignOgTitle = (rawTitle: string): CampaignOgTitleLayout => {
  const title = stripLegacyTitleAtWordBoundary(rawTitle) || GENERIC_CAMPAIGN_TITLE;
  const initialFontSize = getCampaignTitleFontSize(title);
  const fontSizes = Array.from(
    { length: Math.floor((initialFontSize - 44) / 4) + 1 },
    (_, index) => initialFontSize - index * 4,
  );
  const wordCandidates = getCampaignTitleBreakCandidates(title);

  for (const fontSize of fontSizes) {
    if (measureTitle(title, fontSize) <= TITLE_SAFE_WIDTH) {
      return { title, lines: [title], fontSize, lineHeight: Math.round(fontSize * 1.18) };
    }
    const wordLines = chooseBalancedLines(title, fontSize, wordCandidates);
    if (wordLines) {
      return {
        title,
        lines: wordLines,
        fontSize,
        lineHeight: Math.round(fontSize * 1.18),
      };
    }
  }

  return {
    title: GENERIC_CAMPAIGN_TITLE,
    lines: [GENERIC_CAMPAIGN_TITLE],
    fontSize: 80,
    lineHeight: 94,
  };
};

export const isSafeCampaignShareTitle = (rawTitle: string) => {
  const title = normalizeCampaignTitle(rawTitle);
  if (!title) return false;
  if (/https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/iu.test(title)) {
    return false;
  }
  if (/(?:\+?\d[\d\s().-]{8,}\d)/u.test(title)) return false;
  if (/\b[a-z0-9_-]{32,}\b/iu.test(title)) return false;
  return true;
};

const BrandMark = ({
  size,
  iconSize,
  borderRadius,
}: {
  size: number;
  iconSize: number;
  borderRadius: number;
}) => (
  <div
    style={{
      width: size,
      height: size,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius,
      backgroundColor: "#171717",
      color: "#ffffff",
    }}
  >
    <svg width={iconSize} height={iconSize} viewBox="0 0 32 32" fill="none">
      <circle cx="9.8" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
      <circle cx="22.2" cy="11.2" r="3" fill="currentColor" opacity="0.96" />
      <circle cx="16" cy="22" r="3" fill="currentColor" opacity="0.96" />
      <path
        d="M12.1 12.8 16 19.1l3.9-6.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.1"
      />
    </svg>
  </div>
);

const PlatformMark = ({
  platform,
}: {
  platform: Exclude<InfluencerPlatform, "other">;
}) => {
  if (platform === "naver_blog") {
    return (
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 9,
          backgroundColor: "#03c75a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 48 48">
          <path d="M10 11h9.2l9.6 13.7V11H38v26h-9.2l-9.6-13.7V37H10V11z" fill="#fff" />
        </svg>
      </div>
    );
  }
  if (platform === "youtube") {
    return (
      <svg width="47" height="47" viewBox="0 0 48 48">
        <rect x="4" y="12" width="40" height="26" rx="8" fill="#ff0033" />
        <path d="M21 19.5v11l10-5.5-10-5.5z" fill="#fff" />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          backgroundImage: "linear-gradient(135deg,#feda75 0%,#fa7e1e 28%,#d62976 55%,#962fbf 75%,#4f5bd5 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="31" height="31" viewBox="0 0 24 24">
          <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="12" cy="12" r="3.7" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="17" cy="7.2" r="1.25" fill="#fff" />
        </svg>
      </div>
    );
  }
  return (
    <svg width="47" height="47" viewBox="0 0 48 48">
      <path d="M31.2 6c1.1 6.1 4.7 9.8 10.8 10.4v8.1c-4.3.1-7.9-1.2-10.7-3.7v12.4c0 7.6-5.3 12.8-12.7 12.8C11.6 46 6 41.1 6 34.7c0-7 6-12.1 13.8-11.3v8.2c-3.1-.5-5.5 1.2-5.5 3.8 0 2.4 1.9 4 4.5 4 2.7 0 4.4-1.9 4.4-5.1V6h8z" fill="#25f4ee" transform="translate(-2 2)" />
      <path d="M31.2 6c1.1 6.1 4.7 9.8 10.8 10.4v8.1c-4.3.1-7.9-1.2-10.7-3.7v12.4c0 7.6-5.3 12.8-12.7 12.8C11.6 46 6 41.1 6 34.7c0-7 6-12.1 13.8-11.3v8.2c-3.1-.5-5.5 1.2-5.5 3.8 0 2.4 1.9 4 4.5 4 2.7 0 4.4-1.9 4.4-5.1V6h8z" fill="#fe2c55" transform="translate(2 -1)" />
      <path d="M31.2 6c1.1 6.1 4.7 9.8 10.8 10.4v8.1c-4.3.1-7.9-1.2-10.7-3.7v12.4c0 7.6-5.3 12.8-12.7 12.8C11.6 46 6 41.1 6 34.7c0-7 6-12.1 13.8-11.3v8.2c-3.1-.5-5.5 1.2-5.5 3.8 0 2.4 1.9 4 4.5 4 2.7 0 4.4-1.9 4.4-5.1V6h8z" fill="#111" />
    </svg>
  );
};

const ShareImageFrame = ({
  context,
  contextDetail,
  lines,
  fontSize,
  lineHeight,
  platforms,
  variant,
}: {
  context: string;
  contextDetail?: string;
  lines: [string] | [string, string];
  fontSize: number;
  lineHeight: number;
  platforms?: InfluencerPlatform[];
  variant: "campaign" | "contract";
}) => {
  const visiblePlatforms = uniquePlatforms(platforms ?? []);
  const isCampaign = variant === "campaign";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "58px 68px 48px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f7f7f4",
        color: "#171717",
        fontFamily: "NanumSquareNeo",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isCampaign ? 18 : 15,
        }}
      >
        <BrandMark
          size={isCampaign ? 64 : 52}
          iconSize={isCampaign ? 46 : 37}
          borderRadius={isCampaign ? 20 : 16}
        />
        <div
          style={{
            display: "flex",
            fontSize: isCampaign ? 42 : 34,
            fontWeight: 900,
            letterSpacing: isCampaign ? -1.7 : -1.4,
          }}
        >
          {PRODUCT_NAME}
        </div>
      </div>
      <div
        aria-hidden={visiblePlatforms.length === 0 ? "true" : undefined}
        style={{
          marginTop: isCampaign ? 92 : 42,
          height: isCampaign ? 48 : 34,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 28,
        }}
      >
        {visiblePlatforms.map((platform) => (
          <div
            key={platform}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <PlatformMark platform={platform} />
            <div
              style={{
                display: "flex",
                fontSize: 28,
                lineHeight: "48px",
                fontWeight: 800,
                color: "#404040",
                whiteSpace: "nowrap",
              }}
            >
              {platformLabel[platform]}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: isCampaign ? 12 : 18,
          height: 40,
          flexShrink: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 13,
          color: "#2563eb",
        }}
        >
        <div
          style={{
            display: "flex",
            fontSize: isCampaign ? 28 : 34,
            lineHeight: "40px",
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {context}
        </div>
        {contextDetail ? (
          <div
            style={{
              display: "flex",
              fontSize: isCampaign ? 28 : 27,
              lineHeight: "40px",
              fontWeight: 800,
              color: "#525252",
              whiteSpace: "nowrap",
            }}
          >
            · {contextDetail}
          </div>
        ) : null}
      </div>
      <div
        style={{
          marginTop: isCampaign ? 28 : 18,
          display: "flex",
          flexDirection: "column",
          fontSize,
          lineHeight: `${lineHeight}px`,
          fontWeight: 800,
          letterSpacing: -2.2,
        }}
      >
        {lines.map((line) => (
          <div key={line} style={{ display: "flex", whiteSpace: "nowrap" }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};

const createImageResponse = async (element: ReactElement) => {
  const response = new ImageResponse(element, {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    fonts: [
      {
        name: "NanumSquareNeo",
        data: regularFontBuffer,
        weight: 400,
        style: "normal",
      },
      {
        name: "NanumSquareNeo",
        data: extraBoldFontBuffer,
        weight: 800,
        style: "normal",
      },
      {
        name: "NanumSquareNeo",
        data: heavyFontBuffer,
        weight: 900,
        style: "normal",
      },
    ],
  });
  return Buffer.from(await response.arrayBuffer());
};

export const renderCampaignShareImage = async (
  campaign?: CampaignSharePreviewInput,
) => {
  const safeTitle = campaign && isSafeCampaignShareTitle(campaign.title);
  const layout = layoutCampaignOgTitle(
    safeTitle ? campaign.title : GENERIC_CAMPAIGN_TITLE,
  );
  return createImageResponse(
    <ShareImageFrame
      context="캠페인 모집"
      contextDetail={safeTitle ? campaign?.typeLabel : undefined}
      lines={layout.lines}
      fontSize={layout.fontSize}
      lineHeight={layout.lineHeight}
      platforms={safeTitle ? campaign?.platforms : undefined}
      variant="campaign"
    />,
  );
};

export const renderContractShareImage = async () =>
  createImageResponse(
    <ShareImageFrame
      context="계약"
      lines={["계약서 확인"]}
      fontSize={80}
      lineHeight={94}
      variant="contract"
    />,
  );

const removeExistingShareMetadata = (html: string) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/iu, "")
    .replace(
      /<meta\s+(?:name|property)=["'](?:description|robots|twitter:[^"']+|og:[^"']+)["'][^>]*>\s*/giu,
      "",
    )
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/giu, "");

export const injectShareMetadata = (html: string, metadata: ShareMetadata) => {
  const cleanHtml = removeExistingShareMetadata(html);
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="robots" content="${escapeHtml(metadata.robots)}">`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}">`,
    `<meta property="og:site_name" content="${PRODUCT_NAME}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta property="og:url" content="${escapeHtml(metadata.canonicalUrl)}">`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}">`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}">`,
    `<meta property="og:image" content="${escapeHtml(metadata.imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(metadata.imageUrl)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="${IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${escapeHtml(metadata.imageAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(metadata.imageUrl)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(metadata.imageAlt)}">`,
  ].join("\n    ");
  return cleanHtml.replace("</head>", `    ${tags}\n  </head>`);
};

export const buildCampaignShareMetadata = (
  campaignId: string,
  campaign?: CampaignSharePreviewInput,
): ShareMetadata => {
  const canonicalUrl = `${PUBLIC_ORIGIN}/campaigns/${encodeURIComponent(campaignId)}`;
  const safeTitle = campaign && isSafeCampaignShareTitle(campaign.title);
  const title = safeTitle
    ? `${PRODUCT_NAME} | ${normalizeCampaignTitle(campaign.title)}`
    : `${PRODUCT_NAME} | ${GENERIC_CAMPAIGN_TITLE}`;
  const imageUrl = `${PUBLIC_ORIGIN}${getCampaignOgImagePath(
    safeTitle ? campaign : undefined,
  )}`;
  return {
    title,
    description: "캠페인 모집 조건과 신청 방법을 확인하세요.",
    canonicalUrl,
    imageUrl,
    imageAlt: safeTitle
      ? `${normalizeCampaignTitle(campaign.title)} 캠페인 모집 미리보기`
      : "연락미 인플루언서 캠페인 모집 미리보기",
    robots: safeTitle ? "index,follow,max-image-preview:large" : "noindex,nofollow",
  };
};

export const buildContractShareMetadata = (contractId: string): ShareMetadata => ({
  title: `${PRODUCT_NAME} | 계약서 확인`,
  description: "전달받은 계약서를 확인하세요.",
  canonicalUrl: `${PUBLIC_ORIGIN}/contract/${encodeURIComponent(contractId)}`,
  imageUrl: `${PUBLIC_ORIGIN}/api/og/contract`,
  imageAlt: "연락미 계약서 확인 미리보기",
  robots: "noindex,nofollow,noarchive",
});

export const readAppShellHtml = () => {
  const candidates = [
    path.join(projectRoot, "dist", "index.html"),
    path.join(projectRoot, "index.html"),
  ];
  const htmlPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!htmlPath) throw new Error("Application HTML shell not found");
  return fs.readFileSync(htmlPath, "utf8");
};

export const shareImageDimensions = {
  width: IMAGE_WIDTH,
  height: IMAGE_HEIGHT,
} as const;
