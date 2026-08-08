export const PLATFORM_VERIFICATION_DECISION_RULE_VERSION = "2026-08-08.1";

type RetainableAutomationDecision = {
  provider?: unknown;
  mode?: unknown;
  status?: unknown;
  checked_at?: unknown;
};

type RetainableOwnershipCheck = {
  status?: unknown;
  checked_at?: unknown;
};

const requiredText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const retainedTimestamp = (value: unknown) => {
  const timestamp = requiredText(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(timestamp) &&
    Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : "";
};

const minimizedProviders = new Map([
  ["youtube", "youtube_data_api"],
  ["naver_blog", "naver_search_api"],
]);
const retainedModes = new Set([
  "api_ready",
  "public_challenge",
  "manual_fallback",
  "oauth_required",
  "webhook_ready",
]);
const retainedStatuses = new Set([
  "not_configured",
  "pending",
  "matched",
  "not_found",
  "blocked",
  "failed",
  "invalid_input",
]);
const retainedOwnershipStatuses = new Set([
  "not_run",
  "matched",
  "not_found",
  "blocked",
  "failed",
]);

export const minimizesPlatformVerificationProviderEvidence = (platform: string) =>
  minimizedProviders.has(platform);

export const buildRetainedPlatformAutomationDecision = (
  platform: string,
  automation: RetainableAutomationDecision,
) => {
  if (!minimizesPlatformVerificationProviderEvidence(platform)) return automation;

  const provider = minimizedProviders.get(platform) ?? "platform_automation";
  const requestedMode = requiredText(automation.mode);
  const mode = retainedModes.has(requestedMode) ? requestedMode : "manual_fallback";
  const requestedStatus = requiredText(automation.status);
  const status = retainedStatuses.has(requestedStatus) ? requestedStatus : "failed";
  const checkedAt = retainedTimestamp(automation.checked_at);

  return {
    provider,
    mode,
    status,
    ...(checkedAt ? { checked_at: checkedAt } : {}),
    decision_source: "transient_provider_check",
    decision_rule_version: PLATFORM_VERIFICATION_DECISION_RULE_VERSION,
    provider_response_retained: false,
  };
};

export const buildRetainedOwnershipCheck = (
  platform: string,
  ownershipCheck: RetainableOwnershipCheck,
) => {
  if (!minimizesPlatformVerificationProviderEvidence(platform)) return ownershipCheck;

  const requestedStatus = requiredText(ownershipCheck.status);
  const status = retainedOwnershipStatuses.has(requestedStatus)
    ? requestedStatus
    : "failed";
  const checkedAt = retainedTimestamp(ownershipCheck.checked_at);
  return {
    status,
    ...(checkedAt ? { checked_at: checkedAt } : {}),
  };
};
