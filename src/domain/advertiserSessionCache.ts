const ADVERTISER_SESSION_CACHE_MS = 60 * 1000;

let advertiserSessionCache:
  | {
      authenticated: true;
      cachedAt: number;
    }
  | undefined;

export function getAdvertiserSessionCache() {
  if (!advertiserSessionCache) return undefined;
  if (Date.now() - advertiserSessionCache.cachedAt > ADVERTISER_SESSION_CACHE_MS) {
    advertiserSessionCache = undefined;
    return undefined;
  }
  return advertiserSessionCache;
}

export function rememberAdvertiserSession() {
  advertiserSessionCache = {
    authenticated: true,
    cachedAt: Date.now(),
  };
}

export function clearAdvertiserSessionCache() {
  advertiserSessionCache = undefined;
}
