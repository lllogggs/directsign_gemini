const NAVER_INFLUENCER_ORIGIN = "https://in.naver.com";
const NAVER_INFLUENCER_MAX_RESPONSE_BYTES = 768 * 1024;
const NAVER_INFLUENCER_DEFAULT_TIMEOUT_MS = 5_500;

export type NormalizedNaverInfluencerProfile = {
  profileId: string;
  profileUrl: string;
};

export type NaverInfluencerProfileCheckResult =
  | ({
      status: "verified";
      checkedAt: string;
    } & NormalizedNaverInfluencerProfile)
  | ({
      status: "not_linked" | "not_found" | "unavailable";
      checkedAt: string;
    } & NormalizedNaverInfluencerProfile);

type ApolloChannelItem = {
  serviceType?: unknown;
  serviceId?: unknown;
  status?: unknown;
  providerStatus?: unknown;
  url?: unknown;
};

function normalizeNaverIdentifier(value: string, maximumLength: number) {
  const normalized = value.trim().replace(/^@+/, "").normalize("NFC").toLowerCase();
  return normalized.length >= 2 &&
    normalized.length <= maximumLength &&
    /^[a-z0-9._-]+$/.test(normalized)
    ? normalized
    : "";
}

function normalizeNaverBlogIdentifier(value: string) {
  const normalized = value.trim().replace(/^@+/, "").normalize("NFC").toLowerCase();
  return normalized.length >= 2 &&
    normalized.length <= 50 &&
    /^[a-z0-9_-]+$/.test(normalized)
    ? normalized
    : "";
}

export function normalizeNaverBlogIdentity(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    return normalizeNaverBlogIdentifier(trimmed);
  }
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "blog.naver.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return "";
    }
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length === 1
      ? normalizeNaverBlogIdentifier(decodeURIComponent(segments[0] ?? ""))
      : "";
  } catch {
    return "";
  }
}

export function normalizeNaverInfluencerProfile(
  value: string,
): NormalizedNaverInfluencerProfile | undefined {
  const trimmed = value.trim();
  let rawProfileId = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (
        url.protocol !== "https:" ||
        url.hostname.toLowerCase() !== "in.naver.com" ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        return undefined;
      }
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length !== 1) return undefined;
      rawProfileId = decodeURIComponent(segments[0] ?? "");
    } catch {
      return undefined;
    }
  }
  const profileId = normalizeNaverIdentifier(rawProfileId, 64);
  return profileId
    ? { profileId, profileUrl: `${NAVER_INFLUENCER_ORIGIN}/${profileId}` }
    : undefined;
}

export function normalizeNaverInfluencerProfileUrl(
  value: string,
): NormalizedNaverInfluencerProfile | undefined {
  const trimmed = value.trim();
  return /^https:\/\//i.test(trimmed)
    ? normalizeNaverInfluencerProfile(trimmed)
    : undefined;
}

function readApolloState(html: string): Record<string, unknown> | undefined {
  const assignment = /window\.__APOLLO_STATE__\s*=\s*/g.exec(html);
  if (!assignment) return undefined;
  const start = assignment.index + assignment[0].length;
  const marker = html.indexOf("window.__REACT_QUERY_STATE__", start);
  if (marker < 0) return undefined;
  const raw = html.slice(start, marker).trim().replace(/;\s*$/, "");
  if (!raw.startsWith("{") || !raw.endsWith("}")) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function hasExactNaverInfluencerBlogConnection(
  html: string,
  approvedBlogIdInput: string,
) {
  return (
    inspectNaverInfluencerBlogConnection(html, approvedBlogIdInput) === "linked"
  );
}

function inspectNaverInfluencerBlogConnection(
  html: string,
  approvedBlogIdInput: string,
): "linked" | "not_linked" | "unavailable" {
  const approvedBlogId = normalizeNaverBlogIdentity(approvedBlogIdInput);
  const apolloState = readApolloState(html);
  const rootQuery = apolloState?.ROOT_QUERY;
  if (!approvedBlogId || !rootQuery || typeof rootQuery !== "object") {
    return "unavailable";
  }

  let foundAuthoritativeChannelGroup = false;

  for (const [key, sourceValue] of Object.entries(
    rootQuery as Record<string, unknown>,
  )) {
    if (!key.startsWith("dataSourceMap(") || !sourceValue || typeof sourceValue !== "object") {
      continue;
    }
    const dataSourceMap = (sourceValue as Record<string, unknown>).dataSourceMap;
    if (!dataSourceMap || typeof dataSourceMap !== "object") continue;
    for (const component of Object.values(dataSourceMap as Record<string, unknown>)) {
      if (!component || typeof component !== "object") continue;
      const channelInfo = (component as Record<string, unknown>).channelInfo;
      if (!Array.isArray(channelInfo)) continue;
      for (const groupValue of channelInfo) {
        if (!groupValue || typeof groupValue !== "object") continue;
        const group = groupValue as Record<string, unknown>;
        if (group.ctype !== "activeChannels" || !Array.isArray(group.items)) continue;
        foundAuthoritativeChannelGroup = true;
        for (const itemValue of group.items) {
          if (!itemValue || typeof itemValue !== "object") continue;
          const item = itemValue as ApolloChannelItem;
          const serviceId =
            typeof item.serviceId === "string"
              ? normalizeNaverBlogIdentity(item.serviceId)
              : "";
          const urlBlogId =
            typeof item.url === "string" ? normalizeNaverBlogIdentity(item.url) : "";
          if (
            item.serviceType === "NBLOG" &&
            item.status === "ENABLED" &&
            item.providerStatus === "CONNECTED" &&
            serviceId === approvedBlogId &&
            urlBlogId === approvedBlogId
          ) {
            return "linked";
          }
        }
      }
    }
  }
  return foundAuthoritativeChannelGroup ? "not_linked" : "unavailable";
}

async function readResponseTextWithLimit(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > NAVER_INFLUENCER_MAX_RESPONSE_BYTES
  ) {
    throw new Error("Naver Influencer response too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > NAVER_INFLUENCER_MAX_RESPONSE_BYTES) {
        throw new Error("Naver Influencer response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function checkNaverInfluencerProfileConnection(
  profileInput: string,
  approvedBlogIdInput: string,
  options: {
    now?: Date;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<NaverInfluencerProfileCheckResult | undefined> {
  const profile = normalizeNaverInfluencerProfile(profileInput);
  const approvedBlogId = normalizeNaverBlogIdentity(approvedBlogIdInput);
  if (!profile || !approvedBlogId) return undefined;
  const checkedAt = (options.now ?? new Date()).toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? NAVER_INFLUENCER_DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await (options.fetchImpl ?? fetch)(profile.profileUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "yeollock.me-naver-influencer-check/1.0",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status === 404) return { ...profile, status: "not_found", checkedAt };
    if (!response.ok || response.status >= 300) {
      return { ...profile, status: "unavailable", checkedAt };
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      return { ...profile, status: "unavailable", checkedAt };
    }
    const html = await readResponseTextWithLimit(response);
    const connection = inspectNaverInfluencerBlogConnection(html, approvedBlogId);
    return {
      ...profile,
      status:
        connection === "linked"
          ? "verified"
          : connection === "not_linked"
            ? "not_linked"
            : "unavailable",
      checkedAt,
    };
  } catch {
    return { ...profile, status: "unavailable", checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}
