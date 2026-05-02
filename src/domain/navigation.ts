export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback: string,
  allowedPrefixes: string[],
) {
  if (!candidate) return fallback;

  const trimmed = candidate.trim();
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const isExternalLike =
    !trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\");

  if (hasProtocol || isExternalLike) return fallback;

  const isAllowed = allowedPrefixes.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}/`),
  );

  return isAllowed ? trimmed : fallback;
}

export function getNextPath(
  search: string,
  fallback: string,
  allowedPrefixes: string[],
) {
  const params = new URLSearchParams(search);
  return getSafeRedirectPath(params.get("next"), fallback, allowedPrefixes);
}

export function buildLoginRedirect(
  loginPath: string,
  currentPath: string,
  fallback: string,
  allowedPrefixes: string[],
) {
  const nextPath = getSafeRedirectPath(currentPath, fallback, allowedPrefixes);
  return `${loginPath}?next=${encodeURIComponent(nextPath)}`;
}
