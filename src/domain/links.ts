const readPublicEnv = (name: string) => {
  const value =
    typeof import.meta !== "undefined"
      ? (import.meta.env[name] as string | undefined)
      : undefined;
  return value?.trim().replace(/\/$/, "") || undefined;
};

export const getPublicAppOrigin = () =>
  readPublicEnv("VITE_PUBLIC_SITE_URL") ??
  readPublicEnv("VITE_SITE_URL") ??
  readPublicEnv("VITE_APP_URL") ??
  (typeof window !== "undefined" ? window.location.origin : "");

export const buildContractShareUrl = (contractId: string, shareToken?: string) =>
  `${getPublicAppOrigin()}/contract/${contractId}${
    shareToken ? `?token=${encodeURIComponent(shareToken)}` : ""
  }`;
