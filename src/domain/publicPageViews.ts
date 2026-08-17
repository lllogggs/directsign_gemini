export const PUBLIC_PAGE_VIEW_PAGES = [
  { path: "/", key: "public_home", label: "홈" },
  { path: "/en/creators", key: "public_creators_en", label: "크리에이터 안내 · 영어" },
  { path: "/ja/creators", key: "public_creators_ja", label: "크리에이터 안내 · 일본어" },
  { path: "/zh/creators", key: "public_creators_zh", label: "크리에이터 안내 · 중국어" },
  { path: "/intro/advertiser", key: "public_intro_advertiser", label: "광고주 소개" },
  { path: "/intro/influencer", key: "public_intro_influencer", label: "인플루언서 소개" },
  { path: "/privacy", key: "public_privacy", label: "개인정보처리방침" },
  { path: "/terms", key: "public_terms", label: "이용약관" },
  { path: "/legal/e-sign-consent", key: "public_e_sign_consent", label: "전자서명 동의" },
  { path: "/resources", key: "public_resources_index", label: "자료실" },
] as const;

export type PublicPageViewKey = (typeof PUBLIC_PAGE_VIEW_PAGES)[number]["key"];

const normalizePublicPagePath = (pathname: string) =>
  pathname.replace(/\/+$/, "") || "/";

const publicPageViewKeyByPath = new Map<string, PublicPageViewKey>(
  PUBLIC_PAGE_VIEW_PAGES.map((page) => [page.path, page.key]),
);

export const getPublicPageViewKey = (
  pathname: string,
  search = "",
  hash = "",
): PublicPageViewKey | null => {
  if (search || hash) return null;
  return publicPageViewKeyByPath.get(normalizePublicPagePath(pathname)) ?? null;
};

export const getPublicPageViewLabel = (key: string) =>
  PUBLIC_PAGE_VIEW_PAGES.find((page) => page.key === key)?.label ?? key;
