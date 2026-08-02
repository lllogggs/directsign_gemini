export const userSessionAccessMaxAgeSeconds = 60 * 60;
export const userSessionRollingDays = 30;
export const userSessionRefreshMaxAgeSeconds =
  60 * 60 * 24 * userSessionRollingDays;
export const userSessionRefreshReuseCacheMs = 10 * 1000;

const transientAuthFailureStatuses = new Set([408, 425, 429]);
const terminalRefreshErrorCodes = new Set([
  "invalid_credentials",
  "invalid_grant",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
  "user_banned",
  "user_not_found",
]);
const terminalAccessErrorCodes = new Set([
  "bad_jwt",
  "session_expired",
  "session_not_found",
  "user_banned",
  "user_not_found",
]);

export type SupabaseAuthFailure = {
  status: number;
  code?: string;
  message?: string;
};

const normalizeAuthFailureText = (value: string | undefined) =>
  String(value ?? "").trim().toLowerCase();

export function isRetryableSupabaseAuthFailureStatus(status: number) {
  return transientAuthFailureStatuses.has(status) || status >= 500;
}

export function isTerminalSupabaseRefreshFailure({
  status,
  code,
  message,
}: SupabaseAuthFailure) {
  if (isRetryableSupabaseAuthFailureStatus(status)) return false;

  const normalizedCode = normalizeAuthFailureText(code);
  if (terminalRefreshErrorCodes.has(normalizedCode)) return true;

  const normalizedMessage = normalizeAuthFailureText(message);
  return (
    /\binvalid[_ -]?grant\b/.test(normalizedMessage) ||
    /invalid refresh token/.test(normalizedMessage) ||
    /refresh token.{0,40}(already used|expired|not found|revoked)/.test(
      normalizedMessage,
    ) ||
    /session.{0,40}(expired|not found|revoked)/.test(normalizedMessage)
  );
}

export function isTerminalSupabaseAccessFailure({
  status,
  code,
  message,
}: SupabaseAuthFailure) {
  if (isRetryableSupabaseAuthFailureStatus(status)) return false;

  const normalizedCode = normalizeAuthFailureText(code);
  if (terminalAccessErrorCodes.has(normalizedCode)) return true;
  if (status === 401) return true;

  const normalizedMessage = normalizeAuthFailureText(message);
  return (
    /\b(jwt|access token).{0,40}(expired|invalid|not found|revoked)\b/.test(
      normalizedMessage,
    ) ||
    /\b(user|session).{0,40}(banned|expired|not found|revoked)\b/.test(
      normalizedMessage,
    )
  );
}
