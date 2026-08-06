import { apiFetch } from "./api.js";

export type NotificationRole = "advertiser" | "influencer";

export type NotificationRouteKey =
  | "dashboard"
  | "campaign_detail"
  | "contract_detail";

export type NotificationItem = {
  id: string;
  eventType: string;
  copyKey: string;
  safeParams: Record<string, unknown>;
  routeKey: NotificationRouteKey | string;
  routeParams: Record<string, unknown>;
  occurredAt: string;
  readAt: string | null;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  nextCursor: string | null;
  through: string;
  unreadCount: number;
};

export type NotificationCountResponse = {
  unreadCount: number;
  through: string;
};

export type NotificationReadResponse = {
  id: string;
  readAt: string;
  unreadCount: number;
};

export type NotificationReadAllResponse = {
  through: string;
  updatedCount: number;
  unreadCount: number;
};

export class NotificationAuthorizationError extends Error {
  constructor() {
    super("Notification authorization expired");
    this.name = "NotificationAuthorizationError";
  }
}

const toSafeRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toSafeCount = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

const toNullableText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const parseNotificationItem = (value: unknown): NotificationItem | undefined => {
  const row = toSafeRecord(value);
  const id = toNullableText(row.id);
  const occurredAt = toNullableText(row.occurredAt ?? row.occurred_at);
  if (!id || !occurredAt) return undefined;

  return {
    id,
    eventType: toNullableText(row.eventType ?? row.event_type) ?? "notification",
    copyKey: toNullableText(row.copyKey ?? row.copy_key) ?? "notification",
    safeParams: toSafeRecord(row.safeParams ?? row.safe_params),
    routeKey: toNullableText(row.routeKey ?? row.route_key) ?? "dashboard",
    routeParams: toSafeRecord(row.routeParams ?? row.route_params),
    occurredAt,
    readAt: toNullableText(row.readAt ?? row.read_at),
  };
};

const readJson = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new NotificationAuthorizationError();
    }
    const message = toNullableText(toSafeRecord(data).error);
    throw new Error(message ?? "알림을 불러오지 못했습니다.");
  }
  return toSafeRecord(data);
};

export async function fetchNotifications({
  role,
  cursor,
  limit = 20,
}: {
  role: NotificationRole;
  cursor?: string | null;
  limit?: number;
}): Promise<NotificationListResponse> {
  const query = new URLSearchParams({
    role,
    limit: String(Math.max(1, Math.min(50, Math.floor(limit)))),
  });
  if (cursor) query.set("cursor", cursor);

  const response = await apiFetch(`/api/notifications?${query.toString()}`, {
    headers: { Accept: "application/json" },
    credentials: "include",
    cache: "no-store",
  });
  const data = await readJson(response);

  return {
    items: Array.isArray(data.items)
      ? data.items
          .map(parseNotificationItem)
          .filter((item): item is NotificationItem => Boolean(item))
      : [],
    nextCursor: toNullableText(data.nextCursor ?? data.next_cursor),
    through: toNullableText(data.through) ?? new Date().toISOString(),
    unreadCount: toSafeCount(data.unreadCount ?? data.unread_count),
  };
}

export async function fetchNotificationUnreadCount(
  role: NotificationRole,
): Promise<NotificationCountResponse> {
  const response = await apiFetch(
    `/api/notifications/unread-count?role=${encodeURIComponent(role)}`,
    {
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
    },
  );
  const data = await readJson(response);
  return {
    unreadCount: toSafeCount(data.unreadCount ?? data.unread_count),
    through: toNullableText(data.through) ?? new Date().toISOString(),
  };
}

export async function markNotificationRead({
  role,
  id,
}: {
  role: NotificationRole;
  id: string;
}): Promise<NotificationReadResponse> {
  const response = await apiFetch(
    `/api/notifications/${encodeURIComponent(id)}/read`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ role }),
    },
  );
  const data = await readJson(response);
  return {
    id: toNullableText(data.id) ?? id,
    readAt: toNullableText(data.readAt ?? data.read_at) ?? new Date().toISOString(),
    unreadCount: toSafeCount(data.unreadCount ?? data.unread_count),
  };
}

export async function markAllNotificationsRead({
  role,
  through,
}: {
  role: NotificationRole;
  through: string;
}): Promise<NotificationReadAllResponse> {
  const response = await apiFetch("/api/notifications/read-all", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ role, through }),
  });
  const data = await readJson(response);
  return {
    through: toNullableText(data.through) ?? through,
    updatedCount: toSafeCount(data.updatedCount ?? data.updated_count),
    unreadCount: toSafeCount(data.unreadCount ?? data.unread_count),
  };
}

const readRouteParam = (
  params: Record<string, unknown>,
  key: "campaignId" | "contractId",
) => {
  const snakeKey = key === "campaignId" ? "campaign_id" : "contract_id";
  const value = params[key] ?? params[snakeKey];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) return undefined;
  if (!/^[a-zA-Z0-9:_-]+$/.test(normalized)) return undefined;
  return encodeURIComponent(normalized);
};

/** Maps server-owned route keys to local paths. Raw URLs are never accepted. */
export function getNotificationDestination(
  role: NotificationRole,
  routeKey: string,
  routeParams: Record<string, unknown>,
) {
  if (routeKey === "dashboard") {
    return role === "advertiser"
      ? "/advertiser/dashboard"
      : "/influencer/dashboard";
  }

  if (routeKey === "campaign_detail") {
    const campaignId = readRouteParam(routeParams, "campaignId");
    if (!campaignId) return undefined;
    return role === "advertiser"
      ? `/advertiser/campaigns?campaign=campaign%3A${campaignId}`
      : `/influencer/campaigns?view=applied&campaign=${campaignId}`;
  }

  if (routeKey === "contract_detail") {
    const contractId = readRouteParam(routeParams, "contractId");
    if (!contractId) return undefined;
    return role === "advertiser"
      ? `/advertiser/contract/${contractId}`
      : `/contract/${contractId}`;
  }

  return undefined;
}

const getSafeText = (
  params: Record<string, unknown>,
  keys: string[],
  fallback: string,
) => {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 80);
    }
  }
  return fallback;
};

export type NotificationCopy = {
  title: string;
  detail: string;
};

export function getNotificationCopy(item: NotificationItem): NotificationCopy {
  const campaign = getSafeText(
    item.safeParams,
    ["campaignTitle", "campaign_title"],
    "캠페인",
  );
  const creator = getSafeText(
    item.safeParams,
    ["creatorName", "creator_name"],
    "인플루언서",
  );
  const contract = getSafeText(
    item.safeParams,
    ["contractTitle", "contract_title"],
    "계약",
  );
  const campaignStatus = getSafeText(
    item.safeParams,
    ["campaignStatus", "campaign_status"],
    "",
  );
  const status =
    {
      open: "모집 중",
      closed: "모집 종료",
      ended: "캠페인 종료",
    }[campaignStatus] ?? "진행 상태";
  const reviewStatus = getSafeText(
    item.safeParams,
    ["reviewStatus", "review_status"],
    "",
  );
  const reviewDetail =
    {
      approved: `${contract} 콘텐츠가 승인되었습니다.`,
      changes_requested: `${contract} 콘텐츠에 수정 요청이 도착했습니다.`,
      rejected: `${contract} 콘텐츠가 반려되었습니다.`,
    }[reviewStatus] ?? `${contract} 검수 결과를 확인해 주세요.`;

  switch (item.copyKey) {
    case "campaign.application_received":
      return {
        title: "새 캠페인 신청",
        detail: `${creator}님이 ${campaign}에 신청했습니다.`,
      };
    case "campaign.application_selected":
      return {
        title: "캠페인 선정",
        detail: `${campaign} 선정 결과와 다음 단계를 확인해 주세요.`,
      };
    case "campaign.status_changed":
      if (campaignStatus === "closed") {
        return {
          title: "캠페인 지원 결과",
          detail: `${campaign} 지원 결과가 미선정으로 확정되었습니다.`,
        };
      }
      return {
        title: "캠페인 상태 변경",
        detail: `${campaign}이 ${status} 상태로 변경되었습니다.`,
      };
    case "contract.ready_to_sign":
      return {
        title: "서명할 계약서가 준비됐어요",
        detail: `${contract} 내용을 확인하고 서명해 주세요.`,
      };
    case "contract.signed":
      return {
        title: "계약 서명 완료",
        detail: `${contract} 서명이 완료되었습니다.`,
      };
    case "contract.content_submitted":
      return {
        title: "콘텐츠 제출",
        detail: `${contract}에 새 콘텐츠가 제출되었습니다.`,
      };
    case "contract.content_reviewed":
      return {
        title: "콘텐츠 검수 결과",
        detail: reviewDetail,
      };
    case "contract.ready_to_close":
      return {
        title: "계약 마감 준비 완료",
        detail: `${contract}의 콘텐츠 검수가 완료되었습니다.`,
      };
    case "contract.closed":
      return {
        title: "계약 마감 완료",
        detail: `${contract}이 마감되었습니다.`,
      };
    case "deadline.action_due":
      return {
        title: "확인할 마감이 있어요",
        detail: `${contract}의 다음 단계를 확인해 주세요.`,
      };
    default:
      return {
        title: "진행 상태가 업데이트됐어요",
        detail: "새로운 내용을 확인해 주세요.",
      };
  }
}
