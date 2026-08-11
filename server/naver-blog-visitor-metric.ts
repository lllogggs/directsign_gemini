const NAVER_BLOG_VISITOR_ENDPOINT =
  "https://blog.naver.com/NVisitorgp4Ajax.nhn";
const NAVER_BLOG_VISITOR_WINDOW_DAYS = 4;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export type NaverBlogVisitorMetricResult =
  | {
      status: "available";
      averageDailyVisitors4d: number;
      checkedAt: string;
    }
  | {
      status: "counter_private" | "unavailable";
      checkedAt: string;
    };

type NaverBlogVisitorCount = {
  date: string;
  count: number;
};

function formatKstCompactDate(date: Date, dayOffset: number) {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS + dayOffset * DAY_MS);
  return `${kstDate.getUTCFullYear().toString().padStart(4, "0")}${(
    kstDate.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}${kstDate.getUTCDate().toString().padStart(2, "0")}`;
}

export function getNaverBlogVisitorTargetDates(date = new Date()) {
  return Array.from({ length: NAVER_BLOG_VISITOR_WINDOW_DAYS }, (_, index) =>
    formatKstCompactDate(date, -(index + 1)),
  );
}

function normalizeCompactDate(value: string | undefined) {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return value;
}

export function parseNaverBlogVisitorCounts(body: string) {
  const counts = new Map<string, number>();
  for (const match of body.matchAll(/<visitorcnt\b[^>]*\/?>/gi)) {
    const tag = match[0];
    const date = normalizeCompactDate(
      tag.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1],
    );
    const rawCount = tag.match(/\bcnt\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!date || !rawCount || !/^\d+$/.test(rawCount)) continue;
    const count = Number(rawCount);
    if (!Number.isSafeInteger(count) || count < 0) continue;
    counts.set(date, count);
  }
  return Array.from(counts, ([date, count]) => ({ date, count })).sort(
    (left, right) => right.date.localeCompare(left.date),
  );
}

export function calculateNaverBlogVisitorAverage(
  counts: NaverBlogVisitorCount[],
  targetDates: string[],
) {
  const countByDate = new Map(counts.map((count) => [count.date, count.count]));
  const values = targetDates.map((date) => countByDate.get(date));
  if (
    values.length !== NAVER_BLOG_VISITOR_WINDOW_DAYS ||
    values.some((value) => value === undefined)
  ) {
    return undefined;
  }
  return Math.round(
    (values as number[]).reduce((total, value) => total + value, 0) /
      NAVER_BLOG_VISITOR_WINDOW_DAYS,
  );
}

function normalizeBlogId(value: string) {
  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9_-]{2,50}$/.test(normalized) ? normalized : "";
}

async function readResponseTextWithLimit(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Naver Blog visitor response is too large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        throw new Error("Naver Blog visitor response is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function fetchNaverBlogVisitorMetric(
  blogIdInput: string,
  options: {
    now?: Date;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<NaverBlogVisitorMetricResult> {
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  const blogId = normalizeBlogId(blogIdInput);
  if (!blogId) return { status: "unavailable", checkedAt };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4_500);
  try {
    const url = new URL(NAVER_BLOG_VISITOR_ENDPOINT);
    url.searchParams.set("blogId", blogId);
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.1",
        "User-Agent": "yeollock.me-campaign-eligibility/1.0",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return { status: "unavailable", checkedAt };

    const body = await readResponseTextWithLimit(response);
    const counts = parseNaverBlogVisitorCounts(body);
    if (counts.length === 0) return { status: "counter_private", checkedAt };
    const averageDailyVisitors4d = calculateNaverBlogVisitorAverage(
      counts,
      getNaverBlogVisitorTargetDates(now),
    );
    if (averageDailyVisitors4d === undefined) {
      return { status: "unavailable", checkedAt };
    }
    return { status: "available", averageDailyVisitors4d, checkedAt };
  } catch {
    return { status: "unavailable", checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}
