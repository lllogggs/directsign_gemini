const ADVERTISER_SESSION_CACHE_MS = 60 * 1000;
const ADVERTISER_SESSION_CACHE_KEY = "yeollock.advertiser.session";

export type AdvertiserSessionUserSnapshot = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  company_name?: string | null;
  verification_status?: string;
  business_registration_number?: string | null;
};

let advertiserSessionCache:
  | {
      authenticated: true;
      cachedAt: number;
      user?: AdvertiserSessionUserSnapshot;
    }
  | undefined;

const readStoredAdvertiserSessionCache = () => {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.sessionStorage.getItem(ADVERTISER_SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as {
      authenticated?: unknown;
      cachedAt?: unknown;
      user?: AdvertiserSessionUserSnapshot;
    };
    if (parsed.authenticated !== true || typeof parsed.cachedAt !== "number") {
      return undefined;
    }
    return {
      authenticated: true as const,
      cachedAt: parsed.cachedAt,
      user: parsed.user,
    };
  } catch {
    return undefined;
  }
};

const writeStoredAdvertiserSessionCache = (
  cachedAt: number,
  user?: AdvertiserSessionUserSnapshot,
) => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      ADVERTISER_SESSION_CACHE_KEY,
      JSON.stringify({ authenticated: true, cachedAt, user }),
    );
  } catch {
    // Session cache only improves perceived speed; failing closed is fine.
  }
};

const clearStoredAdvertiserSessionCache = () => {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(ADVERTISER_SESSION_CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
};

export function getAdvertiserSessionCache() {
  advertiserSessionCache = advertiserSessionCache ?? readStoredAdvertiserSessionCache();
  if (!advertiserSessionCache) return undefined;
  if (Date.now() - advertiserSessionCache.cachedAt > ADVERTISER_SESSION_CACHE_MS) {
    advertiserSessionCache = undefined;
    clearStoredAdvertiserSessionCache();
    return undefined;
  }
  return advertiserSessionCache;
}

export function rememberAdvertiserSession(user?: AdvertiserSessionUserSnapshot) {
  const cachedAt = Date.now();
  advertiserSessionCache = {
    authenticated: true,
    cachedAt,
    user: user ?? advertiserSessionCache?.user,
  };
  writeStoredAdvertiserSessionCache(cachedAt, advertiserSessionCache.user);
}

export function clearAdvertiserSessionCache() {
  advertiserSessionCache = undefined;
  clearStoredAdvertiserSessionCache();
}
