import { apiPath } from "./api.js";
import { getPublicPageViewKey } from "./publicPageViews.js";

let lastSentRouteKey: string | undefined;

export const trackOwnedPageView = (
  pathname: string,
  search = "",
  hash = "",
) => {
  const routeIdentity = `${pathname}\u0000${search}\u0000${hash}`;
  if (lastSentRouteKey === routeIdentity) return;
  lastSentRouteKey = routeIdentity;

  const pageKey = getPublicPageViewKey(pathname, search, hash);
  if (!pageKey) return;

  // React Strict Mode can run an initial effect twice in development. Keep one
  // request per route visit while still counting A -> B -> A navigation.
  void fetch(apiPath("/api/site-page-views"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_key: pageKey }),
    keepalive: true,
  }).catch(() => {
    // Page counting must never delay or interrupt the public page.
  });
};
