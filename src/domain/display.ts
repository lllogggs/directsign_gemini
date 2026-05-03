export const removeInternalTestLabel = (value?: string | null, fallback = "") => {
  const text = value?.trim();
  if (!text) return fallback;

  const cleaned = text
    .replace(/^테스트브랜드$/g, "브랜드")
    .replace(/^테스트 광고주$/g, "광고주")
    .replace(/^테스트 인플루언서$/g, "인플루언서")
    .replace(/^테스트\s*/g, "")
    .trim();

  return cleaned || fallback || text;
};
