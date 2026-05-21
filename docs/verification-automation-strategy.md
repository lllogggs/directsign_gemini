# Verification Automation Strategy

연락미의 인증 자동화는 "자동 확인 결과를 증빙으로 붙이고, 최종 승인 권한은 운영자가 유지"하는 구조로 시작한다. 완전 자동 승인은 환경변수 플래그가 켜진 경우에만 동작한다.

## Advertiser Business Verification

현재 구현:

- 국세청 사업자등록 상태조회: `NTS_BUSINESS_STATUS_API_KEY`
- 국세청 사업자등록 진위확인: `NTS_BUSINESS_VALIDATE_API_KEY`
- 사업자등록번호 체크섬 검증
- 상태조회 결과, 진위확인 결과, 결과 해시를 `verification_requests.evidence_snapshot_json.automation.business_registration`에 저장
- `VERIFICATION_AUTO_APPROVE_BUSINESS="true"`일 때만 자동 승인

필요한 API:

- data.go.kr 국세청 사업자등록정보 진위확인 및 상태조회 서비스 API 키

운영 입력값:

- 사업자등록번호
- 대표자명
- 개업일자
- 사업자등록증명원 또는 사업자등록증 파일

주의:

- 국세청 상태조회는 사업자가 계속사업자인지 확인한다.
- 진위확인은 사업자등록번호, 개업일자, 대표자명 조합이 맞는지 확인한다.
- 법적 고지용 운영자 개인정보와 광고주 사업자 인증은 별개다.

## Influencer Platform Verification

공통 원칙:

- 인플루언서가 받은 챌린지 코드 `DS-XXXX-XXXX`를 공개 프로필, 설명, 게시글, 또는 플랫폼 OAuth/DM 흐름으로 증명한다.
- API 결과와 공개 URL 검사 결과는 자동 증빙으로 저장한다.
- `VERIFICATION_AUTO_APPROVE_PLATFORM="true"`일 때만 자동 승인한다.

### YouTube

현재 구현:

- `YOUTUBE_DATA_API_KEY`가 있으면 YouTube Data API `channels.list`로 채널 설명을 조회한다.
- 채널 설명에 챌린지 코드가 있으면 `matched`.
- 키가 없거나 채널 설명으로 확인이 안 되면 공개 URL 챌린지 검사로 fallback.

필요한 API:

- Google Cloud YouTube Data API v3 key

추천 운영 방식:

- 인플루언서에게 채널 설명에 챌린지 코드를 잠깐 넣게 한다.
- 자동 확인 후 코드를 제거해도 된다.

### Naver Blog

현재 구현:

- 공개 블로그/게시글 URL에 챌린지 코드가 있는지 먼저 확인한다.
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`이 있으면 Naver Blog Search API로 코드와 블로그 ID를 보조 조회한다.

필요한 API:

- Naver Developers Search API application

추천 운영 방식:

- 공개 인증 글 하나를 쓰게 하는 방식이 가장 안정적이다.
- 검색 API는 색인 지연이 있을 수 있으므로 공개 URL 직접 검사를 1순위로 둔다.

### Instagram

현재 구현:

- `META_GRAPH_ACCESS_TOKEN`, `META_IG_USER_ID`가 있으면 Instagram Graph API Business Discovery로 공개 professional 계정 bio를 확인한다.
- `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`가 있으면 `/api/webhooks/instagram` inbound DM webhook으로 챌린지 코드 수신을 처리한다.
- 승인 전 운영은 `instagram_dm_code` 방식으로 접수한다. 인플루언서가 연락미 공식 인스타그램 계정에 챌린지 코드를 DM으로 보내고, 운영자가 발신 계정과 제출 프로필 URL을 대조해 승인한다.
- API가 없으면 공개 코드/스크린샷 수동 검토로 fallback.

필요한 API/설정:

- Meta app
- Instagram professional account 또는 connected Facebook Page
- Graph API access token
- Business Discovery permission/app review
- Messenger API for Instagram webhook 권한을 쓰려면 webhook subscription과 app review

DM 우회 전략:

- 우리가 먼저 아무 인플루언서에게 DM을 보내는 방식은 제한이 크다.
- 대신 인플루언서가 연락미 공식 Instagram 계정으로 챌린지 코드를 먼저 DM으로 보내게 한다.
- 자동화 전에는 관리자 화면에서 코드, 핸들, 프로필 URL, 실제 DM 발신 계정을 비교해 수동 승인한다.
- Meta webhook이 inbound message를 받아 pending verification의 코드와 매칭한다.
- 이 방식은 "사용자가 먼저 보낸 DM"이라 정책 리스크가 낮고 자동화 여지가 있다.

### TikTok

현재 구현:

- `TIKTOK_ACCOUNT_ACCESS_TOKEN` 또는 향후 OAuth로 받은 creator access token이 있으면 TikTok User Info API로 username/bio를 확인한다.
- client key/secret만 있으면 자동 확인은 아직 불가능하고 OAuth 동의 화면이 필요하다.

필요한 API/설정:

- TikTok Developer app
- Login Kit
- user info scopes
- 인플루언서별 OAuth consent token

추천 운영 방식:

- 1차는 프로필 bio 챌린지 코드 또는 인증 영상 설명 확인.
- 2차로 TikTok OAuth 연결 버튼을 붙여 자동 인증.
- OAuth 전까지는 스크린샷 검토 fallback 유지.

## What To Ask The Owner For

바로 받아오면 좋은 것:

- `NTS_BUSINESS_STATUS_API_KEY`
- `NTS_BUSINESS_VALIDATE_API_KEY`
- `YOUTUBE_DATA_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

앱 등록/심사가 필요한 것:

- Meta app id/secret
- Meta Graph access token
- Meta IG user id
- Meta webhook verify token
- TikTok client key/secret

나중에 OAuth UI까지 붙일 때 필요한 것:

- TikTok redirect URI
- Instagram/Facebook redirect URI
- 각 플랫폼 앱 심사에 제출할 개인정보 처리방침/서비스 설명 URL

## Current Safety Defaults

- 자동 승인 기본값은 모두 `false`.
- API 응답 원문은 저장하지 않고 해시와 최소 메타데이터만 저장한다.
- 토큰과 API 키는 서버 환경변수만 사용한다.
- 운영자 법률/사업자 개인정보 입력을 요구하지 않는다.
