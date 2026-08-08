import type { InfluencerPlatform } from "./verification.js";

export const PUBLIC_PROFILE_CONSENT_VERSION = "2026-08-07";

export type RepresentativeActivityPage = {
  normalizedUrl: string;
  supported: boolean;
  platform?: InfluencerPlatform;
  handle?: string;
};

export type RepresentativeActivityPageResult =
  | { ok: true; page: RepresentativeActivityPage }
  | { ok: false; error: string };

const instagramReservedPaths = new Set([
  "accounts",
  "direct",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
]);

const cleanHandle = (value: string) =>
  decodeURIComponent(value).trim().replace(/^@+/, "").replace(/\/+$/, "");

const safeHandle = (value: string, pattern: RegExp, maxLength = 160) => {
  const handle = cleanHandle(value);
  return handle && handle.length <= maxLength && pattern.test(handle)
    ? handle
    : undefined;
};

export function normalizeManualActivityPageHandle(value: unknown) {
  if (typeof value !== "string") return "";
  const handle = value.trim().replace(/^@+/, "").split(/[/?#]/)[0].trim();
  return handle.length <= 160 ? handle : "";
}

export function parseRepresentativeActivityPage(
  value: unknown,
): RepresentativeActivityPageResult {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return { ok: false, error: "대표 활동 페이지 주소를 입력해 주세요." };
  }
  if (raw.length > 2048) {
    return { ok: false, error: "대표 활동 페이지 주소가 너무 깁니다." };
  }

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "열 수 있는 대표 활동 페이지 주소를 입력해 주세요." };
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (parsed.port && !["80", "443"].includes(parsed.port))
  ) {
    return { ok: false, error: "공개 웹페이지 주소만 입력할 수 있습니다." };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, error: "공개 웹페이지 주소만 입력할 수 있습니다." };
  }
  parsed.protocol = "https:";
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  if (parsed.port === "80" || parsed.port === "443") parsed.port = "";

  const segments = parsed.pathname.split("/").filter(Boolean);
  const host = hostname.replace(/^(?:www\.|m\.)/, "");
  let platform: InfluencerPlatform | undefined;
  let handle: string | undefined;

  if (host === "instagram.com") {
    const candidate = segments[0]?.toLowerCase();
    handle = candidate && !instagramReservedPaths.has(candidate)
      ? safeHandle(segments[0], /^[a-z0-9._]+$/i, 30)
      : undefined;
    platform = handle ? "instagram" : undefined;
  } else if (host === "tiktok.com") {
    handle = safeHandle(segments[0] ?? "", /^[a-z0-9._]+$/i, 30);
    platform = handle && segments[0]?.startsWith("@") ? "tiktok" : undefined;
  } else if (host === "blog.naver.com") {
    handle = safeHandle(segments[0] ?? "", /^[a-z0-9_-]+$/i, 80);
    platform = handle ? "naver_blog" : undefined;
  } else if (host === "youtube.com") {
    const first = segments[0] ?? "";
    if (first.startsWith("@")) {
      handle = safeHandle(first, /^[a-z0-9._-]+$/i, 100);
    } else if (["channel", "c", "user"].includes(first.toLowerCase())) {
      handle = safeHandle(segments[1] ?? "", /^[a-z0-9._-]+$/i, 160);
    }
    platform = handle ? "youtube" : undefined;
  }

  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  const normalizedUrl = parsed.toString();

  return {
    ok: true,
    page: {
      normalizedUrl,
      supported: Boolean(platform && handle),
      ...(platform ? { platform } : {}),
      ...(handle ? { handle } : {}),
    },
  };
}
