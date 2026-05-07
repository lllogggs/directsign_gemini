export const API_BASE =
  typeof import.meta !== "undefined"
    ? (import.meta.env.VITE_API_BASE_URL ?? "")
    : "";

export const apiPath = (path: string) =>
  /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

export const apiFetch = (path: string, init?: RequestInit) =>
  fetch(apiPath(path), init);
