# Instagram DM 계정주 인증 운영 런북

## 결정 사항

- 서비스명은 **연락미**이고 `yeollock.me`는 서비스 도메인이다.
- 인증 수신 계정은 **연락미 공식 Instagram 계정 `@yeollockme`** 하나다.
- `@yeollockme`를 Professional 계정(비즈니스 또는 크리에이터)으로 준비하고 Meta App에 운영자가 한 번 연결한다.
- 인플루언서 고객에게 Meta 로그인이나 Instagram OAuth 연결을 요구하지 않는다. 고객은 연락미가 서버에서 발급한 코드를 `@yeollockme`에 DM으로 보내기만 한다.
- 운영자가 토큰을 처음 발급하거나 갱신할 때만 Meta 로그인이 필요할 수 있다. 고객 화면에는 Meta 로그인 버튼을 제공하지 않는다.
- webhook, Supabase, Vercel 서버가 인증을 처리하므로 운영자의 로컬 컴퓨터가 꺼져 있어도 동작해야 한다.

이 방식이 증명하는 것은 제출한 Instagram 계정을 현재 제어하고 있다는 사실이다. 법적 실명이나 계정의 실제 소유권 전체를 증명하는 것으로 안내하면 안 된다.

## 현재 운영 상태 — 2026-08-02

현재 production 점검에서는 필수 Meta 환경 변수가 설정되어 있지 않았다. 따라서 코드는 준비되어 있어도 Instagram DM 자동 인증은 아직 production에서 활성 상태가 아니다.

다음 항목도 실제 운영 완료로 보고하기 전에 각각 확인해야 한다.

- Meta App 생성 및 Live 전환
- 연락미 공식 Instagram 계정 `@yeollockme` 연결
- 필요한 권한의 App Review 및 Advanced Access 승인
- production webhook 구독
- production Supabase migration 적용
- production Vercel 환경 변수 설정 및 재배포
- Meta가 실제로 서명한 webhook을 이용한 E2E 통과
- 실패 이벤트의 Discord 도착 확인

Discord bot/channel 설정은 Meta 자동화와 별도다. Discord 변수가 존재하더라도 Meta 서명 이벤트에서 만들어진 실패 알림이 실제 채널에 도착하기 전에는 전체 경로가 검증됐다고 보고하지 않는다.

## 동작 흐름

1. 로그인한 인플루언서가 Instagram 핸들과 프로필 URL을 제출한다.
2. 연락미 서버가 10분 유효한 일회용 `DS-XXXX-XXXX` 코드를 발급하고 원문은 암호화, 조회키는 keyed hash로 저장한다.
3. 고객이 연락미 공식 Instagram 계정 `@yeollockme`에 그 코드를 DM으로 보낸다.
4. Meta가 `https://yeollock.me/api/webhooks/instagram`으로 서명된 webhook을 전송한다.
5. 서버가 서명, webhook recipient, self/echo 여부, 코드 유효기간과 미사용 상태를 확인한다.
6. 서버가 webhook sender의 Instagram scoped ID로 Meta User Profile API를 조회하고 반환된 username을 제출 핸들 및 프로필 URL username과 정확히 대조한다.
7. production 요청만 원자적으로 자동 승인한다. QA, demo, seed 요청은 자동 승인하지 않는다.
8. 승인 시 challenge hash와 ciphertext를 지우고 consumed 시각 및 발신자·메시지 식별자의 hash만 보존한다.
9. 불일치, 만료, Meta 조회 실패, 설정 누락은 Discord 운영 알림으로 전달한다.

문자열 코드만 일치하거나 DM 발신자 username을 확인하지 못한 경우에는 절대 자동 승인하지 않는다.

## Meta 준비

### 1. 공식 계정

- `@yeollockme`의 계정 유형을 Professional로 확인한다.
- 계정 이메일, 전화번호, 2단계 인증 및 복구 수단은 회사가 통제한다.
- 개인 운영자 계정에만 복구 권한이 묶이지 않도록 주 담당자와 백업 담당자를 지정한다.
- 프로필에서 연락미 공식 계정임을 확인할 수 있게 유지한다.

### 2. Meta App 및 권한

Instagram API with Instagram Login 기준으로 다음 권한을 우선 검토한다.

- `instagram_business_basic`
- `instagram_business_manage_messages`

App Dashboard가 요구하는 Live 전환, App Review, access level을 배포 전에 확인한다. 앱이 소유·관리하고 Dashboard에 추가한 공식 Professional 계정만 연결하면 Standard Access가 가능할 수 있고, 앱이 소유하지 않은 다른 Professional 계정까지 연결해 서비스할 때는 Advanced Access가 필요하다. Meta가 요구하는 Business Verification과 검수용 화면 녹화, 개인정보처리방침 URL, 데이터 삭제 안내도 App Dashboard의 현재 요구사항에 맞춰 제출한다.

App Review 설명에는 다음 실제 흐름을 보여준다.

- 운영자가 `@yeollockme`를 Meta App에 연결
- 인플루언서는 Meta 로그인을 하지 않음
- 인플루언서가 먼저 인증 코드를 DM으로 전송
- 연락미 서버가 sender username을 조회해 제출 계정과 일치할 때만 승인
- 코드 만료, 불일치, 재사용 방지

공식 참고 자료:

- [Meta Instagram Platform](https://developers.facebook.com/docs/instagram-platform/)
- [Instagram API with Instagram Login](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)

권한명과 지원 Graph API 버전은 변경될 수 있으므로 App Dashboard와 Meta 공식 문서를 배포 직전에 다시 확인한다.

### 3. Webhook

- Callback URL: `https://yeollock.me/api/webhooks/instagram`
- Verify token: 임의로 만든 긴 서버 비밀값
- 대상 object: Instagram
- 구독 필드: App Dashboard가 제공하는 inbound message 관련 필드
- webhook POST는 `X-Hub-Signature-256` 검증을 통과해야 한다.
- `entry.id`와 각 message의 `recipient.id`가 `META_IG_USER_ID`와 같아야 한다.
- 공식 계정이 보낸 self/echo 이벤트는 무시한다.

Callback URL은 canonical origin인 apex `https://yeollock.me`를 사용한다. `www` 주소를 등록하지 않는다.

## 서버 환경 변수

다음 값은 Vercel의 Preview와 Production을 구분해 등록하고 Git, 문서, 브라우저, 로그, Discord에 원문을 남기지 않는다.

| 변수 | 용도 | 운영 기준 |
| --- | --- | --- |
| `META_APP_ID` | Meta App 식별자 | App Dashboard 값 |
| `META_APP_SECRET` | webhook HMAC 검증 | 서버 secret |
| `META_GRAPH_API_VERSION` | Graph API 버전 | App에서 검증한 지원 버전 |
| `META_INSTAGRAM_ACCESS_TOKEN` | DM sender profile 조회 | `@yeollockme` 연결에서 발급한 서버 token |
| `META_INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT` | token 만료 감시 | UTC ISO-8601 시각 |
| `META_IG_USER_ID` | 공식 계정 recipient 식별 | 연결된 `@yeollockme` Instagram user ID |
| `META_WEBHOOK_VERIFY_TOKEN` | webhook GET 검증 | 별도로 생성한 긴 secret |
| `VERIFICATION_AUTO_APPROVE_INSTAGRAM_DM` | 정확 일치 자동 승인 | 기본 `false`; 격리된 Preview signed E2E와 승인된 production 활성화 때만 `true` |
| `DIRECTSIGN_TOKEN_ENCRYPTION_SECRET` | challenge 암호화·keyed hash | 기존 production secret 유지 |
| `DISCORD_OPERATIONS_BOT_TOKEN` 또는 `DISCORD_OPERATIONS_WEBHOOK_URL` | 운영 알림 전송 | 원문 token 노출 금지 |
| `DISCORD_OPERATIONS_CHANNEL_ID` | 운영 알림 채널 | 운영 전용 채널 ID |
| `CRON_SECRET` | 운영 sweep 보호 | 서버 secret |

`META_GRAPH_ACCESS_TOKEN`은 기존 Business Discovery 용도로 별도 사용될 수 있다. DM sender 조회의 기준 token은 `META_INSTAGRAM_ACCESS_TOKEN`이며 둘을 같은 값이라고 가정하지 않는다.

설정 후에는 새 deployment를 만들어야 한다. Vercel에 값을 저장했지만 이전 deployment가 계속 실행 중인 상태를 운영 완료로 보지 않는다.

## Supabase migration

다음 migration을 순서대로 production에 적용한다.

1. `supabase/migrations/20260802090000_add_instagram_dm_challenge_automation.sql`
2. `supabase/migrations/20260802091000_enforce_instagram_dm_challenge_lifecycle.sql`
3. `supabase/migrations/20260802092000_add_atomic_instagram_dm_transitions.sql`

적용 전에는 backup과 현재 schema version을 기록한다. 적용 후에는 다음을 확인한다.

- ownership verification method enum에 `instagram_dm_code` 존재
- challenge hash, ciphertext, expires, consumed, message hash, sender hash column 존재
- active challenge unique index 존재
- terminal challenge 정리 lifecycle constraint 존재
- `directsign_consume_instagram_dm_challenge` 원자적 consume RPC 존재
- `directsign_review_instagram_dm_challenge` 원자적 관리자 종결 RPC 존재
- 두 RPC가 최신 동일 Instagram 계정 요청의 권한을 transaction 안에서 확인
- 두 RPC의 실행 권한이 `public`, `anon`, `authenticated`에서 회수되고 `service_role`에만 부여됨
- 기존 verification row가 constraint를 위반하지 않음

Migration을 적용하지 않은 상태에서 application만 먼저 배포하면 enum 또는 column 오류로 요청 생성이 실패한다.

## 배포 순서

1. Meta App과 `@yeollockme` 연결을 완료한다.
2. webhook verification GET이 성공하는지 확인한다.
3. Preview/Staging Supabase에 migration을 적용한다.
4. 운영 데이터와 분리된 Preview/Staging에서 QA 계정의 `data_origin`이 `qa`인지 확인한 뒤에만 자동 승인 flag를 `true`로 둔다. 현재 코드는 flag가 `false`이면 challenge 생성부터 503으로 닫으므로, `false` 상태에서는 webhook E2E를 진행할 수 없다.
5. 실제 Meta 서명 webhook 수신과 username 조회가 성공하는지 확인한다. QA 요청은 flag가 `true`여도 자동 승인되지 않고 challenge consume 후 `manual_review`로 남아야 한다.
6. Preview/Staging에서 아래 signed E2E를 통과한다.
7. production Supabase에 migration을 적용한다.
8. production 환경 변수를 등록하고 재배포한다.
9. Product Owner가 통제된 production 실DM 확인을 승인한 경우에만 `VERIFICATION_AUTO_APPROVE_INSTAGRAM_DM=true`로 바꾸고 다시 배포한다. 이때부터 production DM 요청 생성과 exact-match 자동 승인이 함께 활성화된다.
10. 운영자의 로컬 서버를 종료한 상태에서 실제 DM을 보내 server-only 동작을 확인한다.
11. 성공 기록과 Discord 실패 알림을 함께 확인한다.

Production 설정, migration, 외부 Meta 연결, 자동 승인 활성화 및 배포는 Product Owner 승인 없이 실행하지 않는다.

## Meta 서명 E2E

브라우저나 임의 스크립트로 App Secret을 이용해 서명을 위조한 요청만 보내고 통과 처리하지 않는다. 최종 E2E는 Meta App Dashboard의 webhook test 또는 실제 Instagram DM이 만든 Meta 서명 요청을 사용한다.

### 정상 경로

1. 연결된 환경에서 Instagram DM 인증 요청을 만든다.
2. 서버 응답 코드가 DB에 먼저 저장됐는지 확인한다.
3. 보조 Instagram 계정에서 `@yeollockme`로 정확한 코드를 전송한다.
4. webhook이 2xx를 반환하는지 확인한다.
5. sender username, 제출 핸들, 프로필 URL username이 정확히 같을 때만 승인되는지 확인한다.
6. challenge hash와 ciphertext가 지워지고 consumed 시각이 한 번만 저장되는지 확인한다.
7. 같은 Meta 이벤트를 재전송해 상태와 후속 작업이 두 번 바뀌지 않는지 확인한다.
8. 고객 화면이 polling으로 `verified`를 표시하는지 확인한다.

### 실패·경계 경로

- 잘못된 recipient, self event, echo event는 무시
- `creator.name`과 `creator_name` 같은 유사 username은 불일치
- 제출 핸들과 프로필 URL username이 다르면 요청 생성 거부
- 만료 시각과 같은 순간부터 `expired`
- 이미 소비한 challenge는 replay로 무시
- QA, demo, seed 요청은 정확히 일치해도 자동 승인 금지
- Meta sender 조회가 일시 실패하면 challenge를 소비하지 않고 `retrying_provider`로 유지
- `retrying_provider`는 관리자에게 읽기 전용 운영 상태로 보이되 승인·반려·재확인 버튼을 제공하지 않음
- 더 최신 TikTok 등 다른 플랫폼의 동일 문자열 핸들이 Instagram 실패 요청을 숨기지 않음
- 같은 Instagram 계정의 더 최신 인증 요청만 이전 요청의 권한을 대체

E2E 데이터는 production 운영 지표에 섞지 않는다. Preview/Staging을 우선 사용하고, production에서 통제된 확인이 꼭 필요하면 Product Owner의 명시적 승인과 정리 계획을 먼저 기록한다.

## Discord 실패 알림

다음 사건은 production 요청에 대해 Discord 운영 채널에서 확인한다.

- Meta 설정 누락
- 코드 만료
- 제출 계정과 DM 발신 계정 불일치
- Meta sender profile 조회 일시 실패
- token 만료시각 누락 또는 형식 오류
- token 만료
- token 만료 7일 전

운영 sweep은 `/api/cron/ops-alerts`를 통해 실행된다. 현재 schedule은 매일 `17:00 UTC`로, 한국시간 다음 날 `02:00`이다. 알림은 dedupe/cooldown을 적용하고 QA, demo, seed 요청을 제외해야 한다.

Discord에는 access token, App Secret, webhook verify token, challenge 원문, raw sender ID, raw message ID, 이메일, IP를 넣지 않는다. `retrying_provider` 알림은 운영자가 Meta 연결 상태를 점검하기 위한 것이며, 발신자 소유 증빙 없이 수기 승인하라는 의미가 아니다.

## Token 갱신 책임

- 1차 책임자: Product Owner가 지정한 연락미 운영자
- 백업 책임자: 별도로 지정된 admin 1명
- 책임자는 token 발급일, 만료시각, 연결한 Meta App과 공식 계정을 비밀관리 시스템에 기록한다.
- `META_INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT`은 token을 바꿀 때마다 함께 갱신한다.
- 만료 14일 전부터 갱신을 준비하고, 코드의 7일 전 Discord 경고를 마지막 안전망으로 사용한다.
- 갱신한 token은 Vercel secret에 저장하고 재배포한 뒤 실제 sender username 조회와 서명 E2E를 다시 확인한다.
- 이전 token은 새 deployment가 정상임을 확인한 뒤 Meta 측 정책에 맞게 폐기한다.
- 담당자 부재, 퇴사, Meta 권한 변경 시 즉시 운영 계정 접근권한과 token을 회수·회전한다.

## 장애 대응과 중지 기준

다음 중 하나면 `VERIFICATION_AUTO_APPROVE_INSTAGRAM_DM=false`로 되돌리고 자동 승인을 중지한다.

- webhook 서명 검증 오류 증가
- recipient ID 불일치
- sender username 조회 불가가 지속
- 잘못된 계정 자동 승인 의심
- token 유출 또는 App Secret 유출 의심
- DB lifecycle constraint 또는 원자적 consume 실패

자동 승인을 끈 뒤에는 실패 요청을 근거 없이 승인하지 않는다. 원인을 해결하고 migration, 환경 변수, 서명 E2E, replay, Discord 알림을 다시 통과한 뒤에만 재활성화한다.

## 완료 기준

- 고객 Meta 로그인 없음
- 연락미 공식 Instagram 계정 `@yeollockme`만 Meta App에 연결
- 로컬 컴퓨터가 꺼져 있어도 challenge 발급 이후 webhook 승인 완료
- 정확한 sender username 일치만 자동 승인
- 만료·불일치·replay·QA 분리 통과
- `retrying_provider` 자동 재시도와 읽기 전용 운영 노출 확인
- Discord 실패 알림 도착 및 민감정보 미포함 확인
- token 만료 책임자와 갱신일정 기록
- production Meta 환경 변수와 migration을 실제로 확인한 후에만 운영 중으로 보고
