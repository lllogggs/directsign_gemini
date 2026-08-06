export const API_BASE =
  typeof import.meta !== "undefined" && typeof import.meta.env !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";

export const apiPath = (path: string) =>
  /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

export type RecentAuthChallenge = {
  code: "recent_auth_required";
  role: "advertiser" | "influencer";
  action: string;
  resource: string;
};

type RecentAuthHandler = (challenge: RecentAuthChallenge) => Promise<boolean>;

let recentAuthHandler: RecentAuthHandler | undefined;

export const registerRecentAuthHandler = (handler: RecentAuthHandler) => {
  recentAuthHandler = handler;
  return () => {
    if (recentAuthHandler === handler) recentAuthHandler = undefined;
  };
};

const parseRecentAuthChallenge = async (response: Response) => {
  if (response.status !== 428) return undefined;
  try {
    const payload = (await response.clone().json()) as Partial<RecentAuthChallenge>;
    if (
      payload.code !== "recent_auth_required" ||
      (payload.role !== "advertiser" && payload.role !== "influencer") ||
      typeof payload.action !== "string" ||
      typeof payload.resource !== "string"
    ) {
      return undefined;
    }
    return payload as RecentAuthChallenge;
  } catch {
    return undefined;
  }
};

export const apiFetch = async (path: string, init?: RequestInit) => {
  const target = apiPath(path);
  const response = await fetch(target, init);
  const challenge = await parseRecentAuthChallenge(response);
  if (!challenge || !recentAuthHandler) return response;

  const authenticated = await recentAuthHandler(challenge);
  return authenticated ? fetch(target, init) : response;
};
