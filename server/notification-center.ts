import { Buffer } from "node:buffer";

export const notificationRoles = ["advertiser", "influencer"] as const;
export type NotificationRole = (typeof notificationRoles)[number];

export const notificationCopyKeys = [
  "campaign.application_received",
  "campaign.application_selected",
  "campaign.status_changed",
  "contract.ready_to_sign",
  "contract.signed",
  "contract.content_submitted",
  "contract.content_reviewed",
  "contract.ready_to_close",
  "contract.closed",
  "deadline.action_due",
] as const;
export type NotificationCopyKey = (typeof notificationCopyKeys)[number];

export const notificationRouteKeys = [
  "dashboard",
  "campaign_detail",
  "contract_detail",
] as const;
export type NotificationRouteKey = (typeof notificationRouteKeys)[number];

export interface NotificationCursor {
  occurredAt: string;
  eventId: string;
}

export interface NotificationRecipientInput {
  profileId: string;
  role: NotificationRole;
  organizationId?: string;
}

export interface NotificationEventInput {
  eventKey: string;
  eventType: string;
  sourceType:
    | "contract_event"
    | "campaign_application"
    | "campaign"
    | "deadline"
    | "system";
  sourceId: string;
  sourceVersion: string;
  actorProfileId?: string;
  actorRole?: NotificationRole | "system";
  copyKey: NotificationCopyKey;
  safeParams: Record<string, unknown>;
  routeKey: NotificationRouteKey;
  routeParams: Record<string, unknown>;
  dataOrigin: "production" | "qa" | "demo" | "seed";
  occurredAt: string;
  recipients: NotificationRecipientInput[];
}

export interface NotificationEventRow {
  id: string;
  event_type: string;
  copy_key: string;
  safe_params?: Record<string, unknown> | null;
  route_key: string;
  route_params?: Record<string, unknown> | null;
  occurred_at: string;
  data_origin?: string | null;
}

export interface NotificationRecipientRow {
  event_id: string;
  read_at?: string | null;
  occurred_at: string;
  notification_events?:
    | NotificationEventRow
    | NotificationEventRow[]
    | null;
}

export interface NotificationFeedRpcRow {
  event_id: string;
  event_type: string;
  copy_key: string;
  safe_params?: Record<string, unknown> | null;
  route_key: string;
  route_params?: Record<string, unknown> | null;
  occurred_at: string;
  read_at?: string | null;
}

export interface CustomerNotificationItem {
  id: string;
  eventType: string;
  copyKey: NotificationCopyKey;
  safeParams: Record<string, unknown>;
  routeKey: NotificationRouteKey;
  routeParams: Record<string, unknown>;
  occurredAt: string;
  readAt: string | null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventKeyPattern = /^[a-z0-9][a-z0-9:_-]{2,239}$/;
const eventTypePattern = /^[a-z][a-z0-9_.]{2,79}$/;

export const isNotificationRole = (value: unknown): value is NotificationRole =>
  typeof value === "string" &&
  notificationRoles.includes(value as NotificationRole);

export const isNotificationCopyKey = (
  value: unknown,
): value is NotificationCopyKey =>
  typeof value === "string" &&
  notificationCopyKeys.includes(value as NotificationCopyKey);

export const isNotificationRouteKey = (
  value: unknown,
): value is NotificationRouteKey =>
  typeof value === "string" &&
  notificationRouteKeys.includes(value as NotificationRouteKey);

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;

const cleanIsoDate = (value: unknown) => {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
};

const allowedReviewStatuses = new Set([
  "approved",
  "changes_requested",
  "rejected",
]);
const allowedCampaignStatuses = new Set(["open", "closed", "ended"]);

/**
 * Copy parameters are an allowlist, not a pass-through metadata bag.  This
 * keeps emails, free-form comments, URLs, tokens and internal identifiers out
 * of durable notification rows.
 */
export const sanitizeNotificationSafeParams = (
  copyKey: NotificationCopyKey,
  value: unknown,
): Record<string, unknown> => {
  const record = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const safe: Record<string, unknown> = {};

  if (copyKey.startsWith("campaign.")) {
    const campaignTitle = cleanText(record.campaignTitle, 120);
    if (campaignTitle) safe.campaignTitle = campaignTitle;
  }
  if (copyKey.startsWith("contract.") || copyKey === "deadline.action_due") {
    const contractTitle = cleanText(record.contractTitle, 120);
    if (contractTitle) safe.contractTitle = contractTitle;
  }
  if (copyKey === "campaign.status_changed") {
    const campaignStatus = cleanText(record.campaignStatus, 20);
    if (campaignStatus && allowedCampaignStatuses.has(campaignStatus)) {
      safe.campaignStatus = campaignStatus;
    }
  }
  if (copyKey === "contract.content_reviewed") {
    const reviewStatus = cleanText(record.reviewStatus, 24);
    if (reviewStatus && allowedReviewStatuses.has(reviewStatus)) {
      safe.reviewStatus = reviewStatus;
    }
  }
  if (copyKey === "deadline.action_due") {
    const dueAt = cleanIsoDate(record.dueAt);
    if (dueAt) safe.dueAt = dueAt;
  }

  return safe;
};

export const sanitizeNotificationRouteParams = (
  routeKey: NotificationRouteKey,
  value: unknown,
): Record<string, string> => {
  const record = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  if (routeKey === "campaign_detail") {
    const campaignId = cleanText(record.campaignId, 160);
    return campaignId ? { campaignId } : {};
  }
  if (routeKey === "contract_detail") {
    const contractId = cleanText(record.contractId, 160);
    return contractId ? { contractId } : {};
  }
  return {};
};

export const normalizeNotificationEventInput = (
  input: NotificationEventInput,
): NotificationEventInput | undefined => {
  if (!eventKeyPattern.test(input.eventKey)) return undefined;
  if (!eventTypePattern.test(input.eventType)) return undefined;
  if (!cleanText(input.sourceId, 160) || !cleanText(input.sourceVersion, 160)) {
    return undefined;
  }
  const occurredAt = cleanIsoDate(input.occurredAt);
  if (!occurredAt) return undefined;

  const recipients = Array.from(
    new Map(
      input.recipients
        .filter(
          (recipient) =>
            uuidPattern.test(recipient.profileId) &&
            isNotificationRole(recipient.role) &&
            (recipient.role !== "advertiser" ||
              Boolean(
                recipient.organizationId &&
                  uuidPattern.test(recipient.organizationId),
              )),
        )
        .filter((recipient) => recipient.profileId !== input.actorProfileId)
        .map((recipient) => [recipient.profileId, recipient]),
    ).values(),
  ).slice(0, 250);
  if (input.dataOrigin !== "production" || recipients.length === 0) {
    return undefined;
  }

  return {
    ...input,
    sourceId: input.sourceId.trim().slice(0, 160),
    sourceVersion: input.sourceVersion.trim().slice(0, 160),
    occurredAt,
    safeParams: sanitizeNotificationSafeParams(input.copyKey, input.safeParams),
    routeParams: sanitizeNotificationRouteParams(input.routeKey, input.routeParams),
    recipients,
  };
};

export const notificationEventToRpcPayload = (input: NotificationEventInput) => ({
  p_event_key: input.eventKey,
  p_event_type: input.eventType,
  p_source_type: input.sourceType,
  p_source_id: input.sourceId,
  p_source_version: input.sourceVersion,
  p_actor_profile_id: input.actorProfileId ?? null,
  p_actor_role: input.actorRole ?? null,
  p_copy_key: input.copyKey,
  p_safe_params: input.safeParams,
  p_route_key: input.routeKey,
  p_route_params: input.routeParams,
  p_data_origin: input.dataOrigin,
  p_occurred_at: input.occurredAt,
  p_recipients: input.recipients,
});

export const readNotificationLimit = (value: unknown, fallback = 20) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === "string" || typeof raw === "number"
    ? Number.parseInt(String(raw), 10)
    : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : fallback;
};

export const encodeNotificationCursor = (cursor: NotificationCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

export const decodeNotificationCursor = (
  value: unknown,
): NotificationCursor | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 512) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const occurredAt = cleanIsoDate(parsed.occurredAt);
    const eventId = cleanText(parsed.eventId, 40);
    if (!occurredAt || !eventId || !uuidPattern.test(eventId)) return undefined;
    return { occurredAt, eventId };
  } catch {
    return undefined;
  }
};

export const mapNotificationRecipientRow = (
  row: NotificationRecipientRow,
): CustomerNotificationItem | undefined => {
  const event = Array.isArray(row.notification_events)
    ? row.notification_events[0]
    : row.notification_events;
  if (!event || event.data_origin !== "production") return undefined;
  if (!isNotificationCopyKey(event.copy_key)) return undefined;
  if (!isNotificationRouteKey(event.route_key)) return undefined;
  const occurredAt = cleanIsoDate(event.occurred_at ?? row.occurred_at);
  if (!occurredAt || !uuidPattern.test(event.id)) return undefined;

  return {
    id: event.id,
    eventType: cleanText(event.event_type, 80) ?? event.copy_key,
    copyKey: event.copy_key,
    safeParams: sanitizeNotificationSafeParams(
      event.copy_key,
      event.safe_params,
    ),
    routeKey: event.route_key,
    routeParams: sanitizeNotificationRouteParams(
      event.route_key,
      event.route_params,
    ),
    occurredAt,
    readAt: cleanIsoDate(row.read_at) ?? null,
  };
};

export const mapNotificationFeedRpcRow = (
  row: NotificationFeedRpcRow,
): CustomerNotificationItem | undefined => {
  if (!uuidPattern.test(row.event_id)) return undefined;
  if (!isNotificationCopyKey(row.copy_key)) return undefined;
  if (!isNotificationRouteKey(row.route_key)) return undefined;
  const occurredAt = cleanIsoDate(row.occurred_at);
  if (!occurredAt) return undefined;

  return {
    id: row.event_id,
    eventType: cleanText(row.event_type, 80) ?? row.copy_key,
    copyKey: row.copy_key,
    safeParams: sanitizeNotificationSafeParams(row.copy_key, row.safe_params),
    routeKey: row.route_key,
    routeParams: sanitizeNotificationRouteParams(row.route_key, row.route_params),
    occurredAt,
    readAt: cleanIsoDate(row.read_at) ?? null,
  };
};

export const buildNotificationCursorFilter = (
  cursor: NotificationCursor | undefined,
) => {
  if (!cursor) return "";
  const occurredAt = encodeURIComponent(cursor.occurredAt);
  const eventId = encodeURIComponent(cursor.eventId);
  return `&or=(occurred_at.lt.${occurredAt},and(occurred_at.eq.${occurredAt},event_id.lt.${eventId}))`;
};

export const notificationRetentionFilter = (now = new Date()) => {
  const readCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const unreadCutoff = new Date(
    now.getTime() - 180 * 24 * 60 * 60 * 1000,
  ).toISOString();
  return `or=(and(read_at.not.is.null,occurred_at.gte.${encodeURIComponent(
    readCutoff,
  )}),and(read_at.is.null,occurred_at.gte.${encodeURIComponent(unreadCutoff)}))`;
};

export const buildNotificationWindowFilter = (
  cursor: NotificationCursor | undefined,
  now = new Date(),
) => {
  const retention = notificationRetentionFilter(now).replace(/^or=/, "");
  const cursorFilter = buildNotificationCursorFilter(cursor).replace(/^&or=/, "");
  if (!cursorFilter) return `&or=${retention}`;
  return `&and=(or${retention},or${cursorFilter})`;
};
