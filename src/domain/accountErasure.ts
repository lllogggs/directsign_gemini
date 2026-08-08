export type AccountErasureRole = "advertiser" | "influencer";

export const ACCOUNT_ERASURE_EVENT = "yeollock:open-account-erasure";

export function openAccountErasureDialog(role: AccountErasureRole) {
  window.dispatchEvent(
    new CustomEvent(ACCOUNT_ERASURE_EVENT, { detail: { role } }),
  );
}
