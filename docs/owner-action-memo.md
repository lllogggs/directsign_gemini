# 오너 액션 메모

최종 업데이트: 2026-05-18

아래 항목은 제품 소유자 확인과 production 대시보드 접근이 필요한 작업입니다. production 비밀키나 실제 인증 코드는 Discord에 붙여 넣지 마세요. 현재 무료 개인 운영 단계에서는 사업자등록번호, 주소, 통신판매업 신고번호 같은 사업자 정보를 요구하지 않습니다.

## 0. 기상 후 체크리스트 (2026-05-18)

오늘 새벽 기준 production 배포는 `https://yeollock.me`에 완료되어 있고, 헬스체크는 정상입니다.

바로 볼 것:

- 광고주 대시보드에서 화면 전체가 아니라 계약 표 내부만 스크롤되는지 직접 확인합니다.
- `동일 조건 계약 ... 묶어 표시합니다` 문구가 광고주/인플루언서 대시보드에 더 이상 보이지 않는지 확인합니다.
- 공식 Instagram 계정 `@yeollockme`를 실제로 확보했는지 확인합니다. 확보 전이면 먼저 계정을 만들고 프로필에 연락미 서비스 계정임을 알 수 있게 정리합니다.
- 인스타 수동 인증 운영 방식 확인: 인플루언서가 연락미 공식 계정으로 `DS-XXXX-XXXX` 코드를 DM 보내면, 관리자 화면에서 요청 코드, 제출 프로필 URL, 실제 DM 발신 계정을 대조해 승인합니다.
- 실제 광고주 계정 1개로 사업자 인증부터 계약 작성, 공유 링크 발송까지 테스트합니다.
- 실제 인플루언서 계정 1개로 계약 링크 열기, 가입/로그인 후 복귀, 인스타 DM 인증 요청, 관리자 승인, 서명까지 테스트합니다.
- 아직 받지 않은 외부 API는 우선순위를 정합니다: Naver Search API, Meta App/OAuth/Webhook, TikTok Developer App. Meta는 승인 전까지 필수로 보지 말고 DM 수동 인증으로 운영합니다.
- 공개 법적 고지는 초기 검증 단계에서 문의 이메일 `yeollockme@gmail.com` 중심으로 둡니다. 운영자 개인명, 사업자번호, 주소, 전화번호는 유료화 또는 사업자 명의 운영 전 별도 검토로 둡니다.

## 1. 가입 플로우 직접 확인

- 광고주 가입을 실제로 받을 수 있는 이메일로 진행합니다.
- Supabase 확인 메일이 도착하는지 확인합니다.
- 확인 링크가 `https://yeollock.me/login/advertiser`로 돌아오는지 확인합니다.
- 이메일 확인 뒤 로그인했을 때 관리자 개입 없이 광고주 대시보드가 열리는지 확인합니다.
- 공개 인플루언서 가입을 받을 예정이면 인플루언서 가입도 같은 방식으로 한 번 확인합니다.
- 테스트 중 Supabase rate limit이 뜨면 임시 이메일을 계속 만들지 말고 제한 시간이 풀릴 때까지 기다립니다.

## 2. Vercel Production legal env 확인

현재는 `free_individual` 운영으로 두고, 공개 문의 이메일 중심으로 표시합니다. 유료화하거나 사업자 명의 운영으로 전환할 때만 운영자 개인명과 사업자 정보 값을 실제 정보로 바꿉니다.

```env
VITE_LEGAL_OPERATING_MODE="free_individual"
VITE_LEGAL_OPERATOR_NAME=""
VITE_LEGAL_REPRESENTATIVE_NAME=""
VITE_LEGAL_CONTACT_EMAIL="yeollockme@gmail.com"
VITE_LEGAL_CONTACT_PHONE=""
VITE_LEGAL_BUSINESS_REGISTRATION_NUMBER=""
VITE_LEGAL_MAIL_ORDER_BUSINESS_NUMBER=""
VITE_LEGAL_ADDRESS=""
```

`free_individual`에서는 사업자등록번호, 주소, 전화번호, 통신판매업 신고번호 입력을 요구하지 않습니다. 이 항목들은 운영 전 확인 TODO로만 남기고, 현재 개발·QA 흐름을 막지 않습니다.

설정 후 production을 다시 배포하고 아래 문서가 placeholder 없이 `yeollockme@gmail.com` 문의 채널을 표시하는지 확인합니다.

- `https://yeollock.me/privacy`
- `https://yeollock.me/terms`
- `https://yeollock.me/legal/e-sign-consent`

## 3. Supabase Auth 설정 확인

Supabase Dashboard에서 확인할 항목입니다.

- Auth email provider 활성화
- public signup 이메일 확인 활성화
- Site URL: `https://yeollock.me`
- Redirect URLs:
  - `https://yeollock.me/login/advertiser`
  - `https://yeollock.me/login/influencer`
- Advisor가 계속 경고하면 leaked-password protection 활성화

## 4. Supabase Advisor 경고 처리

Supabase 프로젝트 로그인/링크 후 현재 경고를 다시 확인합니다.

```bash
supabase db advisors --linked --type security --level warn
```

넓은 공개 오픈 전에 해결하거나 명시적으로 수용해야 하는 알려진 경고입니다.

- exposed `public` schema에 있고 `authenticated`가 실행할 수 있는 `SECURITY DEFINER` 함수:
  - `public.directsign_is_admin()`
  - `public.directsign_is_org_member(uuid)`
  - `public.directsign_can_access_contract(uuid)`
  - `public.directsign_can_manage_contract(uuid)`
  - `public.directsign_can_respond_to_contract(uuid)`
- 고정 `search_path`가 없는 함수 후보:
  - `public.directsign_prevent_support_access_event_mutation()`
- Auth leaked-password protection 비활성화

이 함수들을 무작정 revoke하지 마세요. 일부 RLS 정책이 의존합니다. 안전한 후속 작업은 검토된 migration으로 공개 Data API 노출이 필요 없는 helper 함수를 `private` schema로 옮기고, 필요한 실행 권한만 부여하고, `search_path`를 고정한 뒤 Advisor와 계약 E2E를 다시 돌리는 것입니다.

현재 확인된 Supabase CLI는 `2.98.1`이고 `2.98.2` 업데이트가 있습니다. DB 보안 작업 전 로컬 환경에서 업데이트 가능하면 먼저 업데이트하세요.

## 5. Supabase Data API 노출 확인

Supabase는 2026-04-28부터 신규 프로젝트에서 테이블이 Data API에 자동 노출되지 않을 수 있습니다. production 프로젝트가 그 이후 새로 만들어졌거나 재생성됐다면, 서버가 쓰는 테이블이 PostgREST/Data API에 의도대로 노출되어 있는지와 RLS/grant가 맞는지 확인하세요.

서버는 `SUPABASE_SERVICE_ROLE_KEY`를 server-side에서만 사용합니다. 이 키를 절대 `VITE_` 환경변수로 추가하지 마세요.

## 6. 최종 오너 런치 체크

- 실제 광고주 계정으로 가입부터 사업자 인증 요청까지 완료합니다.
- 실제 인플루언서 계정으로 가입부터 플랫폼 인증 요청까지 완료합니다.
- 관리자 승인 후 계약 생성, 공유 링크, 검토, 서명, 콘텐츠 제출, 광고주 검수, 완료 계약 확인까지 한 번 끝까지 진행합니다.
- 최종 서명본 PDF와 완료 계약 상태 화면을 런치 기록용으로 캡처해 둡니다.
- 유료화 또는 사업자 명의 운영으로 전환하기 전, 운영자 법률 정보와 약관 문구를 별도 검토합니다.
