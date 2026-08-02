const NAVER_BLOG_HOST_PATTERN = /^(?:m\.)?blog\.naver\.com$/iu;

function decodeNaverSearchText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeNaverBlogPostUrl(value) {
  try {
    const parsed = new globalThis.URL(String(value ?? "").trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (!NAVER_BLOG_HOST_PATTERN.test(parsed.hostname)) return "";
    parsed.protocol = "https:";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function normalizeNaverBlogPostDate(value) {
  const compact = String(value ?? "")
    .trim()
    .replace(/[^0-9]/gu, "");
  if (!/^\d{8}$/u.test(compact)) return "";

  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function normalizeNaverBlogRecentPosts(values, limit = 3) {
  const posts = Array.isArray(values) ? values : [];
  const byUrl = new Map();
  for (const value of posts) {
    const title = decodeNaverSearchText(value?.title).slice(0, 180);
    const url = normalizeNaverBlogPostUrl(value?.url ?? value?.link);
    const publishedDate = normalizeNaverBlogPostDate(
      value?.publishedDate ?? value?.publishedAt ?? value?.postdate,
    );
    if (!title || !url || !publishedDate) continue;

    const current = byUrl.get(url);
    if (!current || publishedDate > current.publishedDate) {
      byUrl.set(url, { title, url, publishedDate });
    }
  }

  const safeLimit = Math.max(0, Math.min(Number(limit) || 0, 10));
  return Array.from(byUrl.values())
    .sort(
      (left, right) =>
        right.publishedDate.localeCompare(left.publishedDate) ||
        left.title.localeCompare(right.title, "ko-KR"),
    )
    .slice(0, safeLimit);
}
