const DEFAULT_GOOGLE_ANALYTICS_ID = "G-PDTVNFRD1W";
const DEFAULT_MICROSOFT_CLARITY_ID = "wx0bvf6bl5";

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
const clarityPublicPaths = new Set([
  "/",
  "/intro/advertiser",
  "/intro/influencer",
  "/privacy",
  "/terms",
  "/legal/e-sign-consent",
]);

let installed = false;
let historyPatched = false;
let clarityScriptInstalled = false;
let claritySuppressedForSession = false;

const analyticsWindow = () => window as AnalyticsWindow;

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

const getCurrentHostname = () => (isBrowser() ? window.location.hostname : "");

const isAnalyticsEnabled = () => {
  if (!isBrowser()) return false;

  const hostname = getCurrentHostname();
  if (productionHosts.has(hostname)) return true;

  const localOverride = readPublicEnv("VITE_ENABLE_LOCAL_ANALYTICS") === "true";
  const nonProductionOverride =
    readPublicEnv("VITE_ENABLE_NON_PRODUCTION_ANALYTICS") === "true";

  if (localHosts.has(hostname)) return localOverride;
  return nonProductionOverride;
};

const appendScript = (id: string, src: string) => {
  if (document.getElementById(id)) return;

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
};

const installGoogleAnalytics = () => {
  const win = analyticsWindow();
  win.dataLayer = win.dataLayer ?? [];
  win.gtag =
    win.gtag ??
    function gtag(...args: unknown[]) {
      win.dataLayer?.push(args);
    };

  win.gtag("js", new Date());
  win.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  win.gtag("set", {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  win.gtag("config", GOOGLE_ANALYTICS_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  appendScript(
    "yeollock-google-analytics",
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GOOGLE_ANALYTICS_ID,
    )}`,
  );
};

const isClarityAllowedPath = (pathname: string) => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return clarityPublicPaths.has(normalized);
};

const setClarityContentMask = (pathname: string) => {
  if (isClarityAllowedPath(pathname)) {
    document.body.removeAttribute("data-clarity-mask");
    return;
  }

  document.body.setAttribute("data-clarity-mask", "true");
};

const stopClarity = () => {
  const win = analyticsWindow();
  win.clarity?.("stop");
  claritySuppressedForSession = true;
};

const prepareClarityForPath = (pathname: string) => {
  setClarityContentMask(pathname);

  if (!isClarityAllowedPath(pathname)) {
    stopClarity();
  }
};

const installClarity = (pathname: string) => {
  if (
    !MICROSOFT_CLARITY_ID ||
    clarityScriptInstalled ||
    claritySuppressedForSession ||
    !isClarityAllowedPath(pathname)
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

  appendScript(
    "yeollock-microsoft-clarity",
    `https://www.clarity.ms/tag/${encodeURIComponent(MICROSOFT_CLARITY_ID)}`,
  );
  clarityScriptInstalled = true;
};

const patchHistoryForClarity = () => {
  if (historyPatched) return;
  historyPatched = true;

  const prepareNextUrl = (url?: string | URL | null) => {
    if (!url) return;

    try {
      const nextUrl = new URL(String(url), window.location.href);
      prepareClarityForPath(nextUrl.pathname);
    } catch {
      prepareClarityForPath(window.location.pathname);
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
    prepareClarityForPath(window.location.pathname);
  });
};

const anonymizeAnalyticsPathname = (pathname: string) => {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized.startsWith("/contract/")) return "/contract/:id";
  if (normalized.startsWith("/advertiser/contract/")) {
    return "/advertiser/contract/:id";
  }
  if (normalized.startsWith("/admin")) return "/admin";

  return normalized.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
    "/:id",
  );
};

export const getAnalyticsPagePath = (pathname: string, search = "") => {
  const path = anonymizeAnalyticsPathname(pathname);
  const params = new URLSearchParams(search);
  const role = params.get("role");
  const feature = params.get("feature");
  const safeParams = new URLSearchParams();

  if (role === "advertiser" || role === "influencer") safeParams.set("role", role);
  if (feature) safeParams.set("feature", feature.slice(0, 40));

  const query = safeParams.toString();
  return query ? `${path}?${query}` : path;
};

export const installAnalytics = () => {
  if (!isAnalyticsEnabled() || installed) return;
  installed = true;

  installGoogleAnalytics();
  patchHistoryForClarity();
  prepareClarityForPath(window.location.pathname);
  installClarity(window.location.pathname);
};

export const syncAnalyticsRoute = (pathname: string, search = "") => {
  if (!isAnalyticsEnabled()) return;

  installAnalytics();
  prepareClarityForPath(pathname);
  installClarity(pathname);

  const win = analyticsWindow();
  const pagePath = getAnalyticsPagePath(pathname, search);
  win.gtag?.("event", "page_view", {
    page_title: document.title,
    page_location: `${window.location.origin}${pagePath}`,
    page_path: pagePath,
  });
};
