const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const NAVER_BLOG_VISITOR_AVERAGE_DAYS = 4;

export function formatNaverBlogKstDate(date, dayOffset = 0) {
  const source = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(source.getTime())) return "";

  const kstDate = new Date(source.getTime() + KST_OFFSET_MS + dayOffset * DAY_MS);
  const year = kstDate.getUTCFullYear().toString().padStart(4, "0");
  const month = (kstDate.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = kstDate.getUTCDate().toString().padStart(2, "0");
  return `${year}${month}${day}`;
}

export function getNaverBlogCompletedVisitorDates(date = new Date()) {
  return Array.from(
    { length: NAVER_BLOG_VISITOR_AVERAGE_DAYS },
    (_, index) => formatNaverBlogKstDate(date, -(index + 1)),
  );
}

export function parseNaverBlogVisitorCounts(body) {
  const byDate = new Map();
  for (const match of String(body ?? "").matchAll(/<visitorcnt\b[^>]*\/?>/gi)) {
    const tag = match[0];
    const date = tag.match(/\bid\s*=\s*["'](\d{8})["']/i)?.[1];
    const rawCount = tag.match(/\bcnt\s*=\s*["']([\d,]+)["']/i)?.[1];
    const count = Number.parseInt(String(rawCount ?? "").replace(/,/g, ""), 10);
    if (!date || !Number.isFinite(count) || count < 0) continue;
    byDate.set(date, Math.floor(count));
  }

  return Array.from(byDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function calculateNaverBlogVisitorAverage(body, date = new Date()) {
  const expectedDates = getNaverBlogCompletedVisitorDates(date);
  const parsedCounts = parseNaverBlogVisitorCounts(body);
  const countByDate = new Map(parsedCounts.map((item) => [item.date, item.count]));
  const counts = expectedDates
    .map((targetDate) => {
      const count = countByDate.get(targetDate);
      return Number.isFinite(count) ? { date: targetDate, count } : undefined;
    })
    .filter(Boolean);

  if (counts.length !== NAVER_BLOG_VISITOR_AVERAGE_DAYS) {
    return {
      available: false,
      average: undefined,
      counts,
      missingDates: expectedDates.filter((targetDate) => !countByDate.has(targetDate)),
    };
  }

  return {
    available: true,
    average: Math.round(
      counts.reduce((total, item) => total + item.count, 0) / counts.length,
    ),
    counts,
    missingDates: [],
  };
}
