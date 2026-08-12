const DEFAULT_GOOGLE_ANALYTICS_ID = "G-PDTVNFRD1W";
const DEFAULT_MICROSOFT_CLARITY_ID = "wx0bvf6bl5";

const ANALYTICS_CONSENT_STORAGE_KEY = "yeollock.analytics-consent.v1";
export const ANALYTICS_CONSENT_CHANGED_EVENT =
  "yeollock:analytics-consent-changed";

export type AnalyticsConsent = "granted" | "denied";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
};

const readPublicEnv = (name: string) => {
  const value = import.meta.env[name] as string | undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const GOOGLE_ANALYTICS_ID =
  readPublicEnv("VITE_GOOGLE_ANALYTICS_ID") ?? DEFAULT_GOOGLE_ANALYTICS_ID;

export const MICROSOFT_CLARITY_ID =
  readPublicEnv("VITE_MICROSOFT_CLARITY_ID") ?? DEFAULT_MICROSOFT_CLARITY_ID;

const productionHosts = new Set(["yeollock.me", "www.yeollock.me"]);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

// Only fixed, non-authenticated information pages may produce analytics events.
// Values are stable page keys; a requested URL, dynamic segment, query, hash,
// document title, or referrer must never become an analytics parameter.
const googleAnalyticsPublicPageKeys = new Map<string, string>([
  ["/", "public_home"],
  ["/en/creators", "public_creators_en"],
  ["/ja/creators", "public_creators_ja"],
  ["/zh/creators", "public_creators_zh"],
  ["/intro/advertiser", "public_intro_advertiser"],
  ["/intro/influencer", "public_intro_influencer"],
  ["/privacy", "public_privacy"],
  ["/terms", "public_terms"],
  ["/legal/e-sign-consent", "public_e_sign_consent"],
  ["/resources", "public_resources_index"],
]);

const clarityPublicPaths = new Set([
  "/",
  "/intro/advertiser",
  "/intro/influencer",
  "/privacy",
  "/terms",
  "/legal/e-sign-consent",
]);

const publicCampaignPathPattern =
  /^\/campaigns\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const googleAnalyticsScriptId = "yeollock-google-analytics";
const clarityScriptId = "yeollock-microsoft-clarity";
const analyticsCookieMaxAgeSeconds = 60 * 60 * 24 * 90;

let googleAnalyticsInstalled = false;
let historyPatched = false;
let clarityScriptInstalled = false;
let clarityStoppedAfterWithdrawal = false;
let clarityStoppedForUnsafeLocation = false;
let lastTrackedPageKey: string | undefined;

const analyticsWindow = () => window as AnalyticsWindow;

const isBrowser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const normalizeStaticPath = (pathname: string) =>
  pathname.replace(/\/+$/, "") || "/";

const getCurrentHostname = () => (isBrowser() ? window.location.hostname : "");

const isAnalyticsRuntimeEnabled = () => {
  if (!isBrowser()) return false;

  const hostname = getCurrentHostname();
  if (productionHosts.has(hostname)) return true;

  const localOverride = readPublicEnv("VITE_ENABLE_LOCAL_ANALYTICS") === "true";
  const nonProductionOverride =
    readPublicEnv("VITE_ENABLE_NON_PRODUCTION_ANALYTICS") === "true";

  if (localHosts.has(hostname)) return localOverride;
  return nonProductionOverride;
};

const readStoredAnalyticsConsent = (): AnalyticsConsent | null => {
  if (!isBrowser()) return null;
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    return null;
  }
};

export const getAnalyticsConsent = () => readStoredAnalyticsConsent();

const hasUntrustedUrlContext = (search = "", hash = "") =>
  Boolean(search || hash);

export const isAnalyticsPublicPath = (
  pathname: string,
  search = "",
  hash = "",
) =>
  !hasUntrustedUrlContext(search, hash) &&
  googleAnalyticsPublicPageKeys.has(normalizeStaticPath(pathname));

const isClarityAllowedLocation = (
  pathname: string,
  search = "",
  hash = "",
) => {
  if (hasUntrustedUrlContext(search, hash)) return false;
  const normalizedPath = normalizeStaticPath(pathname);
  return (
    clarityPublicPaths.has(normalizedPath) ||
    publicCampaignPathPattern.test(normalizedPath)
  );
};

export const getAnalyticsPagePath = (
  pathname: string,
  search = "",
  hash = "",
) =>
  isAnalyticsPublicPath(pathname, search, hash)
    ? (googleAnalyticsPublicPageKeys.get(normalizeStaticPath(pathname)) ?? null)
    : null;

// GA remains fail-closed until the property-side Enhanced Measurement history
// pageview setting has been independently verified as disabled. `send_page_view`
// alone does not disable that property-side listener in a SPA.
export const isGoogleAnalyticsCollectionEnabled = () =>
  readPublicEnv("VITE_GA_HISTORY_MEASUREMENT_VERIFIED") === "true";

// Clarity is enabled for this general-audience professional service and remains
// behind explicit analytics consent. Microsoft says Clarity shouldn't be used
// on websites/apps targeting users under 18; 연락미 does not target that audience.
export const isMicrosoftClarityCollectionEnabled = () => true;

const appendScript = (id: string, src: string) => {
  if (document.getElementById(id)) return;

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
};

const setGoogleAnalyticsDisabled = (disabled: boolean) => {
  if (!isBrowser()) return;
  const win = analyticsWindow() as AnalyticsWindow & Record<string, unknown>;
  win[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = disabled;
};

const safeAnalyticsLocation = (pageKey: string) =>
  `${window.location.origin}/_analytics/${pageKey}`;

const installGoogleAnalytics = (pageKey: string) => {
  if (googleAnalyticsInstalled) return;

  setGoogleAnalyticsDisabled(false);
  const win = analyticsWindow();
  win.dataLayer = win.dataLayer ?? [];
  win.gtag =
    win.gtag ??
    function gtag(...args: unknown[]) {
      win.dataLayer?.push(args);
    };

  win.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  win.gtag("consent", "update", {
    analytics_storage: "granted",
  });
  win.gtag("js", new Date());
  win.gtag("set", {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  win.gtag("config", GOOGLE_ANALYTICS_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: analyticsCookieMaxAgeSeconds,
    cookie_update: false,
    page_location: safeAnalyticsLocation(pageKey),
    page_referrer: "",
  });

  appendScript(
    googleAnalyticsScriptId,
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GOOGLE_ANALYTICS_ID,
    )}`,
  );
  googleAnalyticsInstalled = true;
};

const setClarityContentMask = (
  pathname: string,
  search = "",
  hash = "",
) => {
  if (isClarityAllowedLocation(pathname, search, hash)) {
    document.body.removeAttribute("data-clarity-mask");
    return;
  }

  document.body.setAttribute("data-clarity-mask", "true");
};

const stopClarity = () => {
  const win = analyticsWindow();
  win.clarity?.("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: "denied",
  });
  win.clarity?.("stop");
};

const prepareClarityForLocation = (
  pathname: string,
  search = "",
  hash = "",
) => {
  setClarityContentMask(pathname, search, hash);
  if (!isClarityAllowedLocation(pathname, search, hash)) {
    if (clarityScriptInstalled || analyticsWindow().clarity) {
      stopClarity();
      clarityStoppedForUnsafeLocation = true;
    }
  }
};

const installClarity = (pathname: string, search = "", hash = "") => {
  if (
    !MICROSOFT_CLARITY_ID ||
    clarityScriptInstalled ||
    clarityStoppedAfterWithdrawal ||
    clarityStoppedForUnsafeLocation ||
    !isClarityAllowedLocation(pathname, search, hash)
  ) {
    return;
  }

  const win = analyticsWindow();
  if (!win.clarity) {
    const clarityQueue: unknown[][] = [];
    const clarity = (...args: unknown[]) => {
      clarityQueue.push(args);
    };
    (clarity as typeof clarity & { q?: unknown[][] }).q = clarityQueue;
    win.clarity = clarity;
  }
  win.clarity("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: "granted",
  });

  appendScript(
    clarityScriptId,
    `https://www.clarity.ms/tag/${encodeURIComponent(MICROSOFT_CLARITY_ID)}`,
  );
  clarityScriptInstalled = true;
};

const prepareExternalAnalyticsForLocation = (
  pathname: string,
  search = "",
  hash = "",
) => {
  const pageKey = getAnalyticsPagePath(pathname, search, hash);
  setGoogleAnalyticsDisabled(
    !pageKey || !isGoogleAnalyticsCollectionEnabled(),
  );
  prepareClarityForLocation(pathname, search, hash);
};

const patchHistoryForExternalAnalytics = () => {
  if (historyPatched) return;
  historyPatched = true;

  const prepareNextUrl = (url?: string | URL | null) => {
    if (!url) return;
    try {
      const nextUrl = new URL(String(url), window.location.href);
      // Disable GA before the History API mutates the address. Property-side
      // history listeners must never observe a private or raw URL.
      setGoogleAnalyticsDisabled(true);
      prepareClarityForLocation(
        nextUrl.pathname,
        nextUrl.search,
        nextUrl.hash,
      );
    } catch {
      setGoogleAnalyticsDisabled(true);
      prepareClarityForLocation(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      );
    }
  };

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = ((data, unused, url) => {
    prepareNextUrl(url);
    return originalPushState(data, unused, url);
  }) as History["pushState"];

  window.history.replaceState = ((data, unused, url) => {
    prepareNextUrl(url);
    return originalReplaceState(data, unused, url);
  }) as History["replaceState"];

  window.addEventListener("popstate", () => {
    prepareExternalAnalyticsForLocation(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    );
  });
  window.addEventListener("hashchange", () => {
    prepareExternalAnalyticsForLocation(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    );
  });
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      try {
        const nextUrl = new URL(anchor.href, window.location.href);
        if (nextUrl.origin === window.location.origin) prepareNextUrl(nextUrl);
      } catch {
        setGoogleAnalyticsDisabled(true);
        prepareClarityForLocation(
          window.location.pathname,
          window.location.search,
          window.location.hash,
        );
      }
    },
    true,
  );
  document.addEventListener("submit", () => {
    setGoogleAnalyticsDisabled(true);
    if (clarityScriptInstalled || analyticsWindow().clarity) {
      stopClarity();
      clarityStoppedForUnsafeLocation = true;
    }
  });
};

const removeAnalyticsScripts = () => {
  document.getElementById(googleAnalyticsScriptId)?.remove();
  document.getElementById(clarityScriptId)?.remove();
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((script) => {
    try {
      const hostname = new URL(script.src, window.location.href).hostname;
      if (
        hostname === "googletagmanager.com" ||
        hostname.endsWith(".googletagmanager.com") ||
        hostname === "clarity.ms" ||
        hostname.endsWith(".clarity.ms")
      ) {
        script.remove();
      }
    } catch {
      // Ignore malformed third-party script URLs.
    }
  });
};

const expireFirstPartyAnalyticsCookies = () => {
  const cookieNames = document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter(
      (name): name is string =>
        Boolean(name) &&
        (name === "_ga" ||
          name.startsWith("_ga_") ||
          name === "_clck" ||
          name === "_clsk"),
    );
  const domainCandidates = [window.location.hostname];
  if (window.location.hostname.endsWith(".yeollock.me")) {
    domainCandidates.push(".yeollock.me");
  }

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    for (const domain of domainCandidates) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}; SameSite=Lax`;
    }
  }
};

const withdrawAnalytics = () => {
  const win = analyticsWindow();
  win.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  setGoogleAnalyticsDisabled(true);
  if (clarityScriptInstalled || win.clarity) {
    stopClarity();
    clarityStoppedAfterWithdrawal = true;
  }
  removeAnalyticsScripts();
  expireFirstPartyAnalyticsCookies();
  googleAnalyticsInstalled = false;
  clarityScriptInstalled = false;
  lastTrackedPageKey = undefined;
};

export const setAnalyticsConsent = (consent: AnalyticsConsent) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
  } catch {
    // A blocked localStorage means consent cannot be persisted; stay disabled.
    withdrawAnalytics();
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AnalyticsConsent>(ANALYTICS_CONSENT_CHANGED_EVENT, {
      detail: consent,
    }),
  );

  if (consent === "denied") {
    withdrawAnalytics();
    return;
  }

  if (clarityStoppedAfterWithdrawal) {
    window.location.reload();
    return;
  }
  syncAnalyticsRoute(
    window.location.pathname,
    window.location.search,
    window.location.hash,
  );
};

export const installAnalytics = (
  pathname = window.location.pathname,
  search = window.location.search,
  hash = window.location.hash,
) => {
  const pageKey = getAnalyticsPagePath(pathname, search, hash);
  const clarityAllowed =
    isMicrosoftClarityCollectionEnabled() &&
    isClarityAllowedLocation(pathname, search, hash);

  if (
    !isAnalyticsRuntimeEnabled() ||
    getAnalyticsConsent() !== "granted" ||
    (!pageKey && !clarityAllowed)
  ) {
    return;
  }

  patchHistoryForExternalAnalytics();
  prepareExternalAnalyticsForLocation(pathname, search, hash);
  if (pageKey && isGoogleAnalyticsCollectionEnabled()) {
    installGoogleAnalytics(pageKey);
  }
  if (clarityAllowed) {
    installClarity(pathname, search, hash);
  }
};

export const syncAnalyticsRoute = (
  pathname: string,
  search = "",
  hash = "",
) => {
  if (!isAnalyticsRuntimeEnabled()) return;

  const pageKey = getAnalyticsPagePath(pathname, search, hash);
  const clarityAllowed =
    isMicrosoftClarityCollectionEnabled() &&
    isClarityAllowedLocation(pathname, search, hash);

  if (getAnalyticsConsent() !== "granted") {
    setGoogleAnalyticsDisabled(true);
    if (clarityScriptInstalled || analyticsWindow().clarity) {
      prepareClarityForLocation(pathname, search, hash);
    }
    lastTrackedPageKey = undefined;
    return;
  }

  if (!pageKey && !clarityAllowed) {
    setGoogleAnalyticsDisabled(true);
    if (clarityScriptInstalled || analyticsWindow().clarity) {
      prepareClarityForLocation(pathname, search, hash);
    }
    lastTrackedPageKey = undefined;
    return;
  }

  installAnalytics(pathname, search, hash);
  prepareExternalAnalyticsForLocation(pathname, search, hash);
  if (clarityAllowed) {
    installClarity(pathname, search, hash);
  }

  if (!pageKey || !isGoogleAnalyticsCollectionEnabled()) {
    setGoogleAnalyticsDisabled(true);
    lastTrackedPageKey = undefined;
    return;
  }
  setGoogleAnalyticsDisabled(false);

  if (lastTrackedPageKey === pageKey) return;
  lastTrackedPageKey = pageKey;
  analyticsWindow().gtag?.("event", "page_view", {
    page_key: pageKey,
    page_location: safeAnalyticsLocation(pageKey),
    page_path: `/_analytics/${pageKey}`,
    page_referrer: "",
    send_to: GOOGLE_ANALYTICS_ID,
  });
};
