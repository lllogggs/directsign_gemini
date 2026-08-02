import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthMetricDataOrigin } from "./auth-monitoring.js";
import type { UserSessionBrowserRole } from "./user-session-barrier.js";

const allowedOrigins = new Set<AuthMetricDataOrigin>([
  "production",
  "qa",
  "demo",
  "seed",
]);

// This cookie is only a short-lived monitoring classifier. It is renewed after
// an authoritative session validation and never extends the customer session.
export const authMetricOriginCookieMaxAgeSeconds = 60 * 60 * 2;

export const getAuthMetricOriginCookieName = (role: UserSessionBrowserRole) =>
  role === "advertiser"
    ? "directsign_advertiser_auth_origin"
    : "directsign_influencer_auth_origin";

const signOriginPayload = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const bindingDigest = (kind: "user" | "session" | "proof", value: string, secret: string) =>
  createHmac("sha256", secret)
    .update(`auth-metric-origin:${kind}:${value}`)
    .digest("base64url");

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const createAuthMetricOriginCookieValue = ({
  role,
  origin,
  secret,
  userId,
  authSessionId,
  sessionProof,
  nowMs = Date.now(),
}: {
  role: UserSessionBrowserRole;
  origin: AuthMetricDataOrigin;
  secret: string;
  userId: string;
  authSessionId: string;
  sessionProof: string;
  nowMs?: number;
}) => {
  if (
    !secret ||
    !userId ||
    !authSessionId ||
    !sessionProof ||
    !Number.isFinite(nowMs) ||
    !allowedOrigins.has(origin)
  ) {
    return undefined;
  }
  const expiresAtSeconds = Math.floor(nowMs / 1000) + authMetricOriginCookieMaxAgeSeconds;
  const payload = [
    "v2",
    role,
    origin,
    String(expiresAtSeconds),
    bindingDigest("user", userId, secret),
    bindingDigest("session", authSessionId, secret),
    bindingDigest("proof", sessionProof, secret),
  ].join(".");
  return `${payload}.${signOriginPayload(payload, secret)}`;
};

export const readAuthMetricOriginCookieValue = ({
  value,
  role,
  secret,
  userId,
  authSessionId,
  sessionProof,
  nowMs = Date.now(),
}: {
  value: string | undefined;
  role: UserSessionBrowserRole;
  secret: string;
  userId: string;
  authSessionId: string;
  sessionProof: string;
  nowMs?: number;
}): AuthMetricDataOrigin | undefined => {
  if (
    !value ||
    !secret ||
    !userId ||
    !authSessionId ||
    !sessionProof ||
    !Number.isFinite(nowMs)
  ) {
    return undefined;
  }
  const [
    version,
    tokenRole,
    origin,
    expiresAtText,
    userBinding,
    sessionBinding,
    proofBinding,
    signature,
    extra,
  ] = value.split(".");
  const expiresAtSeconds = Number(expiresAtText);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (
    version !== "v2" ||
    tokenRole !== role ||
    !allowedOrigins.has(origin as AuthMetricDataOrigin) ||
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds <= nowSeconds ||
    expiresAtSeconds > nowSeconds + authMetricOriginCookieMaxAgeSeconds ||
    !userBinding ||
    !sessionBinding ||
    !proofBinding ||
    !signature ||
    extra
  ) {
    return undefined;
  }
  const payload = [
    version,
    tokenRole,
    origin,
    expiresAtText,
    userBinding,
    sessionBinding,
    proofBinding,
  ].join(".");
  const expected = signOriginPayload(payload, secret);
  if (!safeEqual(signature, expected)) return undefined;
  if (
    !safeEqual(userBinding, bindingDigest("user", userId, secret)) ||
    !safeEqual(
      sessionBinding,
      bindingDigest("session", authSessionId, secret),
    ) ||
    !safeEqual(proofBinding, bindingDigest("proof", sessionProof, secret))
  ) {
    return undefined;
  }
  return origin as AuthMetricDataOrigin;
};
