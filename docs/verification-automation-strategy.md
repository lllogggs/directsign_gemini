# Verification Automation Strategy

연락미의 광고주 인증은 국세청 상태조회와 세 항목 진위확인이 모두 일치하면 즉시 승인하고, 그 외에는 운영자 서류 심사로 전환한다. 인플루언서 계정 인증은 서버가 발급한 일회용 코드와 제출 계정이 엄격히 일치하면 즉시 승인하고, 자동 확인이 어렵거나 모호하면 운영자 수기 심사로 전환한다.

## Advertiser Business Verification

현재 구현:

- 국세청 사업자등록 상태조회: `NTS_BUSINESS_STATUS_API_KEY`
- 국세청 사업자등록 진위확인: `NTS_BUSINESS_VALIDATE_API_KEY`
- 사업자등록번호 체크섬 검증
- 상태조회 결과, 진위확인 결과, 결과 해시를 `verification_requests.evidence_snapshot_json.automation.business_registration`에 저장
- `VERIFICATION_AUTO_APPROVE_BUSINESS="false"`는 장애 대응용 자동승인 중지 스위치이며, 설정하지 않거나 `true`이면 엄격한 일치 건을 자동 승인

필요한 API:

- data.go.kr 국세청 사업자등록정보 진위확인 및 상태조회 서비스 API 키

운영 입력값:

- 사업자등록번호
- 대표자명
- 개업일자
- 자동 확인 실패 시에만 사업자등록증명원 또는 사업자등록증 파일과 문서 발급 정보

주의:

- 국세청 상태조회는 사업자가 계속사업자인지 확인한다.
- 진위확인은 사업자등록번호, 개업일자, 대표자명 조합이 맞는지 확인한다.
- 상태조회와 진위확인이 모두 명시적으로 성공한 경우에만 즉시 승인한다. 미설정, 장애, 비정상 응답은 반려하지 않고 서류 심사로 전환한다.
- 세 항목 확인은 법적 상호나 제출자의 재직·대표 권한을 확인한 결과로 과장하지 않는다.
- 법적 고지용 운영자 개인정보와 광고주 사업자 인증은 별개다.

## Influencer Platform Verification

공통 원칙:

- 연락미 서버가 사용자·플랫폼에 묶인 30분짜리 1회용 챌린지 코드 `DS-XXXX-XXXX`를 발급하고, 인플루언서는 이를 공개 프로필, 설명, 게시글, 또는 플랫폼 OAuth/DM 흐름으로 증명한다.
- YouTube·NAVER 응답과 그 해시는 소유 여부를 판정하는 요청 안에서만 사용하고 저장하지 않는다. 사용자가 제출한 계정 URL·핸들·챌린지와 연락미의 판정 방법·규칙·결과·시각만 인증 기록으로 저장하며, 별도 방문자 수나 공급자 통계를 받거나 보관하지 않는다.
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
- 운영 자동인증은 Supabase의 KST 일일 원자 카운터로 최대 5%를 예약하고, 오프라인 탐색 스크립트는 로컬 원장으로 최대 75%만 사용한다. 두 할당의 합은 확인된 일일 한도의 80%를 넘지 않는다.

필요한 API:

- Naver Developers Search API application

추천 운영 방식:

- 공개 인증 글 하나를 쓰게 하는 방식이 가장 안정적이다.
- 검색 API는 색인 지연이 있을 수 있으므로 공개 URL 직접 검사를 1순위로 둔다.

### Instagram

> **2026-08-02 현재 운영 기준:** Business Discovery·운영자 수동 DM 승인·고객
> Instagram/Facebook redirect를 사용하던 이전 설계는 폐기했다. 상세 source of truth는
> [`instagram-dm-automation-runbook.md`](./instagram-dm-automation-runbook.md)다.

- 고객 Meta 로그인은 제공하지 않는다.
- 연락미 공식 Professional 계정 `@yeollockme`만 운영자가 Meta App에 한 번 연결한다.
- 고객은 연락미 서버가 발급한 일회용 코드를 `@yeollockme`에 먼저 DM으로 보낸다.
- Vercel이 Meta 서명 webhook의 recipient와 sender username을 확인하고, 제출 핸들·프로필 URL과 정확히 일치할 때만 원자적으로 자동 승인한다.
- `META_INSTAGRAM_ACCESS_TOKEN`과 만료시각, App Secret, webhook verify token, 공식 IG user ID, 전용 자동승인 flag가 모두 준비되지 않으면 요청을 저장하지 않고 503으로 닫는다.
- 불일치·만료는 수기 검수 대상이며, Meta 조회 장애는 코드를 유지한 채 자동 재시도하는 읽기 전용 운영 상태다.
- production migration·환경변수·배포·실제 Meta 서명 E2E·Discord 실패 알림 확인 전에는 운영 중으로 보고하지 않는다.
- 서버 처리이므로 위 준비가 끝난 뒤에는 Product Owner의 로컬 컴퓨터가 꺼져 있어도 동작한다.

현재 구현과 필요한 설정:

- 공식 `@yeollockme` Professional 계정의 `instagram_business_basic`, `instagram_business_manage_messages` 권한과 messages webhook 구독
- `META_APP_ID`, `META_APP_SECRET`, `META_INSTAGRAM_ACCESS_TOKEN`, `META_INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT`, `META_IG_USER_ID`, `META_WEBHOOK_VERIFY_TOKEN`
- `/api/webhooks/instagram` GET verify와 POST `X-Hub-Signature-256` 검증
- 10분 일회용 challenge, keyed hash 조회, AES-GCM 복구 ciphertext, consume/replay 방지
- Meta sender profile username과 제출 핸들·프로필 URL username의 exact match
- DB 원자 consume 및 원자 관리자 terminal review RPC
- QA/demo/seed 자동승인·Discord 제외와 민감정보 비저장

Meta 구성이 없거나 전용 자동승인 flag가 꺼져 있으면 DM 요청을 pending으로 남기지 않는다. 사용자에게 다른 공개 코드 또는 스크린샷 검수 방식을 선택하게 한다.

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
- 공식 `@yeollockme`용 Meta Instagram access token과 만료시각
- Meta IG user id
- Meta webhook verify token
- TikTok client key/secret

나중에 OAuth UI까지 붙일 때 필요한 것:

- TikTok redirect URI
- 각 플랫폼 앱 심사에 제출할 개인정보 처리방침/서비스 설명 URL

## Current Safety Defaults

- 광고주 사업자 인증은 엄격한 국세청 일치 건만 기본 자동 승인하며 명시적 `false`로 중지할 수 있다. 플랫폼 계정 자동 승인은 기본 `false`다.
- YouTube·NAVER 계정 자동인증 응답, 응답 해시, 응답에서 확인한 채널·게시물·통계 정보는 저장하지 않는다.
- 토큰과 API 키는 서버 환경변수만 사용한다.
- 운영자 법률/사업자 개인정보 입력을 요구하지 않는다.
