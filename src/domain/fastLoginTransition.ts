export type FastLoginRole = "advertiser" | "influencer";

const pendingMs = 6_000;
const eventName = "yeollock:fast-login-transition";

const getStorageKey = (role: FastLoginRole) =>
  `yeollock.${role}.login-transition`;

const readStartedAt = (role: FastLoginRole) => {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(role));
    const startedAt = raw ? Number(raw) : NaN;
    if (!Number.isFinite(startedAt)) return undefined;
    if (Date.now() - startedAt > pendingMs) {
      window.sessionStorage.removeItem(getStorageKey(role));
      return undefined;
    }
    return startedAt;
  } catch {
    return undefined;
  }
};

const emitChange = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(eventName));
};

export function startFastLoginTransition(role: FastLoginRole) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getStorageKey(role), String(Date.now()));
  } catch {
    // This only controls perceived speed; server auth remains authoritative.
  }
  emitChange();
}

export function finishFastLoginTransition(role: FastLoginRole) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(getStorageKey(role));
  } catch {
    // Ignore storage failures.
  }
  emitChange();
}

export function isFastLoginTransitionPending(role: FastLoginRole) {
  return readStartedAt(role) !== undefined;
}

export function waitForFastLoginTransition(
  role: FastLoginRole,
  timeoutMs = 1_200,
) {
  if (typeof window === "undefined" || !isFastLoginTransitionPending(role)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener(eventName, handleChange);
      resolve();
    };
    const handleChange = () => {
      if (!isFastLoginTransitionPending(role)) finish();
    };
    const timeout = window.setTimeout(finish, timeoutMs);

    window.addEventListener(eventName, handleChange);
    handleChange();
  });
}

export function subscribeFastLoginTransition(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
