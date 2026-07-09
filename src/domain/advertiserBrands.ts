export const advertiserSelectedBrandStorageKey =
  "yeollock:advertiser:selected-brand:v1";

export const readSelectedAdvertiserBrandId = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(advertiserSelectedBrandStorageKey) ?? "";
};

export const writeSelectedAdvertiserBrandId = (brandId: string | undefined) => {
  if (typeof window === "undefined") return;
  const normalized = brandId?.trim();
  if (normalized) {
    window.localStorage.setItem(advertiserSelectedBrandStorageKey, normalized);
    return;
  }
  window.localStorage.removeItem(advertiserSelectedBrandStorageKey);
};
