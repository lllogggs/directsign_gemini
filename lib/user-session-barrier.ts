export type UserSessionBrowserRole = "advertiser" | "influencer";

const logoutBarrierCookieNameByRole = {
  advertiser: "directsign_advertiser_logout_barrier",
  influencer: "directsign_influencer_logout_barrier",
} as const;

const logoutResumeCookieNameByRole = {
  advertiser: "directsign_advertiser_logout_resume",
  influencer: "directsign_influencer_logout_resume",
} as const;

const logoutBarrierNoncePattern = /^[a-f0-9]{32}$/;

const readCookieValue = (
  cookieHeader: string | undefined,
  cookieName: string,
) => {
  if (!cookieHeader) return undefined;
  for (const rawCookie of cookieHeader.split(";")) {
    const separatorIndex = rawCookie.indexOf("=");
    if (separatorIndex < 0) continue;
    const name = rawCookie.slice(0, separatorIndex).trim();
    if (name !== cookieName) continue;
    try {
      return decodeURIComponent(rawCookie.slice(separatorIndex + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const getUserSessionLogoutBarrierCookieName = (
  role: UserSessionBrowserRole,
) => logoutBarrierCookieNameByRole[role];

export const getUserSessionLogoutResumeCookieName = (
  role: UserSessionBrowserRole,
) => logoutResumeCookieNameByRole[role];

export const readUserSessionLogoutBarrierState = (
  cookieHeader: string | undefined,
  role: UserSessionBrowserRole,
) => {
  const barrier = readCookieValue(
    cookieHeader,
    getUserSessionLogoutBarrierCookieName(role),
  );
  const resume = readCookieValue(
    cookieHeader,
    getUserSessionLogoutResumeCookieName(role),
  );
  const validBarrier =
    typeof barrier === "string" && logoutBarrierNoncePattern.test(barrier)
      ? barrier
      : undefined;
  const validResume =
    typeof resume === "string" && logoutBarrierNoncePattern.test(resume)
      ? resume
      : undefined;
  return {
    barrier: validBarrier,
    resume: validResume,
    blocked: Boolean(validBarrier && validResume !== validBarrier),
  };
};
