import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  fetchNotifications,
  fetchNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationAuthorizationError,
  type NotificationItem,
  type NotificationRole,
} from "../domain/notifications";

type NotificationCenterStatus = "idle" | "loading" | "ready" | "error";

export type NotificationCenterSnapshot = {
  items: NotificationItem[];
  unreadCount: number | undefined;
  through: string | undefined;
  nextCursor: string | null;
  status: NotificationCenterStatus;
  isLoadingMore: boolean;
  isUpdatingReadState: boolean;
  error: string | undefined;
};

const createSnapshot = (): NotificationCenterSnapshot => ({
  items: [],
  unreadCount: undefined,
  through: undefined,
  nextCursor: null,
  status: "idle",
  isLoadingMore: false,
  isUpdatingReadState: false,
  error: undefined,
});

const snapshots = new Map<NotificationRole, NotificationCenterSnapshot>();
const listeners = new Map<NotificationRole, Set<() => void>>();
const generations = new Map<NotificationRole, number>();
const countInflight = new Map<NotificationRole, Promise<boolean>>();
const listInflight = new Map<NotificationRole, Promise<boolean>>();
const lastCountFetchAt = new Map<NotificationRole, number>();
let activeRole: NotificationRole | undefined;

const getSnapshot = (role: NotificationRole) => {
  let snapshot = snapshots.get(role);
  if (!snapshot) {
    snapshot = createSnapshot();
    snapshots.set(role, snapshot);
  }
  return snapshot;
};

export function getNotificationCenterSnapshot(role: NotificationRole) {
  const snapshot = getSnapshot(role);
  return { ...snapshot, items: [...snapshot.items] };
}

const emit = (role: NotificationRole) => {
  for (const listener of listeners.get(role) ?? []) listener();
};

const updateSnapshot = (
  role: NotificationRole,
  update: (current: NotificationCenterSnapshot) => NotificationCenterSnapshot,
) => {
  snapshots.set(role, update(getSnapshot(role)));
  emit(role);
};

const subscribe = (role: NotificationRole, listener: () => void) => {
  let roleListeners = listeners.get(role);
  if (!roleListeners) {
    roleListeners = new Set();
    listeners.set(role, roleListeners);
  }
  roleListeners.add(listener);
  return () => {
    roleListeners?.delete(listener);
    if (roleListeners?.size === 0) listeners.delete(role);
  };
};

const getGeneration = (role: NotificationRole) => generations.get(role) ?? 0;

export function clearNotificationCenterCache(role?: NotificationRole) {
  const targets = role ? [role] : (["advertiser", "influencer"] as const);
  for (const target of targets) {
    generations.set(target, getGeneration(target) + 1);
    countInflight.delete(target);
    listInflight.delete(target);
    lastCountFetchAt.delete(target);
    snapshots.set(target, createSnapshot());
    emit(target);
  }
  if (!role || activeRole === role) activeRole = undefined;
}

const activateRole = (role: NotificationRole) => {
  if (activeRole && activeRole !== role) {
    clearNotificationCenterCache(activeRole);
  }
  activeRole = role;
};

export async function refreshNotificationCount(
  role: NotificationRole,
  options: { force?: boolean } = {},
) {
  const lastFetchedAt = lastCountFetchAt.get(role) ?? 0;
  if (!options.force && Date.now() - lastFetchedAt < 5_000) return true;

  const existing = countInflight.get(role);
  if (existing) return existing;

  const requestGeneration = getGeneration(role);
  const request = fetchNotificationUnreadCount(role)
    .then((response) => {
      if (getGeneration(role) !== requestGeneration) return false;
      lastCountFetchAt.set(role, Date.now());
      updateSnapshot(role, (current) => ({
        ...current,
        unreadCount: response.unreadCount,
        through: response.through,
        status: current.status === "idle" ? "ready" : current.status,
        error: undefined,
      }));
      return true;
    })
    .catch((error) => {
      if (error instanceof NotificationAuthorizationError) {
        clearNotificationCenterCache(role);
        return false;
      }
      if (getGeneration(role) === requestGeneration) {
        updateSnapshot(role, (current) => ({
          ...current,
          status: current.items.length > 0 ? "ready" : "error",
          error: "알림을 새로 불러오지 못했습니다.",
        }));
      }
      return false;
    })
    .finally(() => {
      if (countInflight.get(role) === request) countInflight.delete(role);
    });

  countInflight.set(role, request);
  return request;
}

export async function refreshNotificationList(
  role: NotificationRole,
  options: { append?: boolean } = {},
) {
  const append = options.append === true;
  const current = getSnapshot(role);
  if (append && !current.nextCursor) return true;

  const existing = listInflight.get(role);
  if (existing) return existing;

  const requestGeneration = getGeneration(role);
  updateSnapshot(role, (snapshot) => ({
    ...snapshot,
    status: append ? snapshot.status : "loading",
    isLoadingMore: append,
    error: undefined,
  }));

  const cursor = append ? current.nextCursor : undefined;
  const request = fetchNotifications({ role, cursor })
    .then((response) => {
      if (getGeneration(role) !== requestGeneration) return false;
      lastCountFetchAt.set(role, Date.now());
      updateSnapshot(role, (snapshot) => {
        const items = append
          ? [
              ...snapshot.items,
              ...response.items.filter(
                (item) => !snapshot.items.some((currentItem) => currentItem.id === item.id),
              ),
            ]
          : response.items;
        return {
          ...snapshot,
          items,
          unreadCount: response.unreadCount,
          through: response.through,
          nextCursor: response.nextCursor,
          status: "ready",
          isLoadingMore: false,
          error: undefined,
        };
      });
      return true;
    })
    .catch((error) => {
      if (error instanceof NotificationAuthorizationError) {
        clearNotificationCenterCache(role);
        return false;
      }
      if (getGeneration(role) === requestGeneration) {
        updateSnapshot(role, (snapshot) => ({
          ...snapshot,
          status: snapshot.items.length > 0 ? "ready" : "error",
          isLoadingMore: false,
          error: "알림을 불러오지 못했습니다.",
        }));
      }
      return false;
    })
    .finally(() => {
      if (listInflight.get(role) === request) listInflight.delete(role);
    });

  listInflight.set(role, request);
  return request;
}

export async function readNotification(role: NotificationRole, id: string) {
  const current = getSnapshot(role);
  const target = current.items.find((item) => item.id === id);
  if (!target || target.readAt) return true;

  updateSnapshot(role, (snapshot) => ({
    ...snapshot,
    isUpdatingReadState: true,
    error: undefined,
  }));
  try {
    const response = await markNotificationRead({ role, id });
    updateSnapshot(role, (snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item) =>
        item.id === id ? { ...item, readAt: response.readAt } : item,
      ),
      unreadCount: response.unreadCount,
      isUpdatingReadState: false,
    }));
    return true;
  } catch (error) {
    if (error instanceof NotificationAuthorizationError) {
      clearNotificationCenterCache(role);
      return false;
    }
    updateSnapshot(role, (snapshot) => ({
      ...snapshot,
      isUpdatingReadState: false,
      error: "읽음 상태를 저장하지 못했습니다.",
    }));
    return false;
  }
}

export async function readAllNotifications(role: NotificationRole) {
  const current = getSnapshot(role);
  if (!current.through || !current.unreadCount) return true;

  updateSnapshot(role, (snapshot) => ({
    ...snapshot,
    isUpdatingReadState: true,
    error: undefined,
  }));
  try {
    const response = await markAllNotificationsRead({
      role,
      through: current.through,
    });
    const cutoff = new Date(response.through).getTime();
    updateSnapshot(role, (snapshot) => ({
      ...snapshot,
      items: snapshot.items.map((item) =>
        !item.readAt && new Date(item.occurredAt).getTime() <= cutoff
          ? { ...item, readAt: response.through }
          : item,
      ),
      unreadCount: response.unreadCount,
      isUpdatingReadState: false,
    }));
    return true;
  } catch (error) {
    if (error instanceof NotificationAuthorizationError) {
      clearNotificationCenterCache(role);
      return false;
    }
    updateSnapshot(role, (snapshot) => ({
      ...snapshot,
      isUpdatingReadState: false,
      error: "읽음 상태를 저장하지 못했습니다.",
    }));
    return false;
  }
}

const BASE_POLL_MS = 45_000;
const MAX_POLL_MS = 5 * 60_000;

export function useNotificationCenter(
  role: NotificationRole,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const snapshot = useSyncExternalStore(
    useCallback((listener) => subscribe(role, listener), [role]),
    useCallback(() => getSnapshot(role), [role]),
    useCallback(() => getSnapshot(role), [role]),
  );

  useEffect(() => {
    if (!enabled) return undefined;
    activateRole(role);

    let cancelled = false;
    let failureCount = 0;
    let timer: number | undefined;

    const schedule = () => {
      if (cancelled) return;
      const delay = Math.min(BASE_POLL_MS * 2 ** failureCount, MAX_POLL_MS);
      timer = window.setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        schedule();
        return;
      }
      const succeeded = await refreshNotificationCount(role, { force: true });
      failureCount = succeeded ? 0 : Math.min(failureCount + 1, 3);
      schedule();
    };

    const refreshWhenAvailable = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      failureCount = 0;
      if (timer !== undefined) window.clearTimeout(timer);
      void refreshNotificationCount(role, { force: true }).finally(schedule);
    };

    void refreshNotificationCount(role).finally(schedule);
    window.addEventListener("focus", refreshWhenAvailable);
    window.addEventListener("online", refreshWhenAvailable);
    document.addEventListener("visibilitychange", refreshWhenAvailable);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", refreshWhenAvailable);
      window.removeEventListener("online", refreshWhenAvailable);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
    };
  }, [enabled, role]);

  return {
    ...snapshot,
    refresh: useCallback(
      () => refreshNotificationList(role),
      [role],
    ),
    refreshCount: useCallback(
      () => refreshNotificationCount(role, { force: true }),
      [role],
    ),
    loadMore: useCallback(
      () => refreshNotificationList(role, { append: true }),
      [role],
    ),
    markRead: useCallback((id: string) => readNotification(role, id), [role]),
    markAllRead: useCallback(() => readAllNotifications(role), [role]),
  };
}
