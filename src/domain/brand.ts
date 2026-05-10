const configuredProductName =
  (typeof import.meta !== "undefined" && import.meta.env.VITE_PRODUCT_NAME) ||
  "연락미";

const normalizedProductName = configuredProductName.trim();
const normalizedProductKey = normalizedProductName.toLowerCase();

export const PRODUCT_NAME =
  !normalizedProductName ||
  normalizedProductKey === "yeollock" ||
  normalizedProductKey === "yeollock.me" ||
  normalizedProductKey === "directsign"
    ? "연락미"
    : normalizedProductName;

export const PRODUCT_DESCRIPTION =
  "광고 계약 검토부터 수정 협의, 전자서명까지 한 흐름으로.";
