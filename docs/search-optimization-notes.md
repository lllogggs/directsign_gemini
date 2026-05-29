# 연락미 검색 및 AI 검색 최적화 메모

기준 문서:
- Google Search Central, "Optimizing your website for generative AI features on Google Search" (last updated 2026-05-15 UTC).
- Naver Search Advisor, SEO 기본 가이드 / robots.txt 설정하기 / 사이트 등록 및 소유확인 가이드.

## 반영한 원칙

- AI 검색 최적화는 별도 꼼수가 아니라 기본 SEO, 크롤링 가능성, 사용자에게 유용한 원문 콘텐츠, 명확한 기술 구조를 맞추는 작업으로 본다.
- 공개 페이지에는 광고 계약, 검토 링크, 수정 협의, 전자서명 증빙처럼 연락미가 실제로 제공하는 내용을 visible content로 둔다.
- 비공개 계약, 대시보드, 관리자, 로그인/가입 화면은 검색 노출 대상에서 제외한다.
- 구조화 데이터는 화면과 서비스 고지에서 확인 가능한 정보만 넣는다.
- 사이트맵에는 검색 결과에 나오길 원하는 공개 canonical URL만 넣는다.

## 이번 변경

- A 전략: Google Search Console과 Naver Search Advisor 소유확인 메타를 빌드 단계에서 초기 HTML에 반영하고, sitemap.xml을 공개 SEO 라우트 설정에서 다시 생성한다.
- B 전략: 현재 서비스 화면을 바꾸지 않고 공개 라우트의 noscript 초기 HTML에 라우트별 서비스 설명을 보강한다.
- 홈 하단에 광고주/인플루언서/비제공 범위를 설명하는 공개 콘텐츠를 유지한다.
- 홈 정적 HTML head와 React 라우트 SEO JSON-LD에 Organization, WebSite, WebApplication, WebPage 정보를 보강했다.
- 운영자 연락 이메일과 공식 인스타그램 URL을 구조화 데이터에 반영했다.
- sitemap.xml lastmod를 2026-05-29로 갱신했다.
- robots.txt에 공개 페이지 allow와 비공개 업무 화면 disallow를 명확히 적었다.
- llms.txt에 서비스 정의, 신뢰 정보, 답변 엔진용 정확한 설명을 보강했다.
- Naver 간단체크 기준에 맞춰 공개 라우트의 title/description을 짧고 고유하게 유지한다.
- robots.txt에 Naver 검색로봇 `Yeti` 규칙을 명시하고 sitemap 위치를 유지한다.
- Search Console 소유확인 토큰은 `GOOGLE_SITE_VERIFICATION` 또는 `VITE_GOOGLE_SITE_VERIFICATION`로 설정하면 빌드 시 최초 HTML head에 삽입된다.
- Search Advisor 소유확인 토큰은 `NAVER_SITE_VERIFICATION` 또는 `VITE_NAVER_SITE_VERIFICATION`로 설정하면 빌드 시 최초 HTML head에 삽입된다.

## 배포 후 해야 할 일

- Google Search Console에 `https://yeollock.me/` 소유권을 등록한다.
- Search Console에서 `https://yeollock.me/sitemap.xml`을 제출한다.
- Naver Search Advisor에 `https://yeollock.me/` 사이트를 등록하고 소유확인을 완료한다.
- Naver Search Advisor에서 `https://yeollock.me/sitemap.xml`을 제출하고 사이트 간단체크를 실행한다.
- Rich Results Test로 홈, 광고주 안내, 인플루언서 안내, 개인정보, 약관, 전자서명 안내 URL을 확인한다.
- URL Inspection에서 홈과 소개 페이지가 `200`, indexable, canonical URL로 인식되는지 확인한다.
- PageSpeed Insights에서 모바일 Core Web Vitals와 렌더링 문제를 확인한다.
