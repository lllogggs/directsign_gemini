const configuredProductName =
  (typeof import.meta !== "undefined" && import.meta.env.VITE_PRODUCT_NAME) ||
  "연락미";

const normalizedProductName = configuredProductName
  .replace(/\\r|\\n/g, "")
  .trim();
const normalizedProductKey = normalizedProductName.toLowerCase();

export const PRODUCT_NAME =
  !normalizedProductName ||
  normalizedProductKey === "yeollock" ||
  normalizedProductKey === "yeollock.me" ||
  normalizedProductKey === "directsign"
    ? "연락미"
    : normalizedProductName;

export const PRODUCT_DESCRIPTION =
  "계약서 중심 인플루언서 협업 운영툴.";
