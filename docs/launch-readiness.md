# yeollock.me Launch Readiness

Last reviewed: 2026-05-04

## Current Scope

yeollock.me is a contract platform for advertisers and influencers. The production
scope is contract drafting, review, negotiation, sharing, e-signature evidence,
document storage, account verification, and support access auditing.

yeollock.me does not currently provide settlement, payout, escrow, tax invoice
issuance, withholding, refund processing, or collection services. Contract
payment terms can be recorded as clauses, but actual payment and tax handling
remain between the contract parties.

## Must Before Public Launch

Owner-only checklist: see [`owner-action-memo.md`](owner-action-memo.md).

- Replace all placeholder operator information in `/privacy`, `/terms`, and
  `/legal/e-sign-consent`. For the initial free individual service, keep
  `VITE_LEGAL_OPERATING_MODE="free_individual"` and publish the real service
  operator, privacy/contact representative, contact email, and customer support
  channel. Before paid or registered-business use, switch to
  `VITE_LEGAL_OPERATING_MODE="registered_business"` and add the business number,
  mail-order registration if applicable, address, and phone.
- Confirm the privacy policy against the current PIPC privacy policy guide.
  The PIPC guide list shows the current 2026.4 privacy policy guide as of this
  review date: https://m.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS217&mCode=D010030000
- Define personal data retention and deletion rules for accounts, contracts,
  verification evidence, signatures, support access logs, and server logs.
- Prepare an incident response runbook for personal data leakage. 개인정보 보호법
  제34조 requires prompt notification to data subjects after a leak is known:
  https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398739
- Run Supabase migrations in order and verify RLS policies are enabled for every
  exposed public table before connecting production data.
- Configure production Supabase Auth: email confirmation on, deployed Site URL,
  advertiser/influencer redirect URLs, and separate production keys.
- Create the private storage bucket for signed PDFs and verification evidence.
  Do not enable local private file fallback in production.
- Verify that signed Korean contract PDFs render readable text. Production
  bundles NanumGothic for the default path; `SIGNED_PDF_FONT_PATH` can override
  it with another Korean-capable TTF font if needed.
- Set strong server-only secrets: `SUPABASE_SERVICE_ROLE_KEY`,
  `ADMIN_ACCESS_CODE`, `ADMIN_SESSION_SECRET`,
  `DIRECTSIGN_TOKEN_ENCRYPTION_SECRET`. Generate app secrets with
  `npm run secrets:generate`, keep them stable across deployments, and do not
  prefix secrets with `VITE_`.
- Set `APP_URL` to the deployed origin, keep public auth rate limits enabled, and
  leave CSP enforcing unless temporarily diagnosing a production rollout issue.
- Confirm advertiser verification operations: who reviews business evidence,
  what is accepted, rejection reason templates, and support SLA.
- Confirm support access operations: party request required, 24-hour access
  window, audit log review, and PDF access scope.
- Confirm e-signature UX and evidence. 전자서명법 제3조 recognizes that an
  electronic signature is not denied effect only because it is electronic:
  https://law.go.kr/lsLinkProc.do?chrClsCd=010202&datClsCd=010102&gubun=admRul&joNo=000300000&lsId=33982&lsNm=%EC%A0%84%EC%9E%90%EC%84%9C%EB%AA%85%EB%B2%95&mode=10
- Review influencer advertising disclosure clauses against the current FTC
  recommendation/endorsement guidance. The FTC issued a 2025-12-02 updated
  economic-interest disclosure guide notice:
  https://m.korea.kr/briefing/pressReleaseView.do?gubun=pressRelease&newsId=156732583&pageIndex=1&repCode=

## Should Before First Paid Users

- Add a production monitoring checklist: server errors, auth failures, upload
  failures, signing failures, and support access events.
- Add backup and restore verification for Supabase database and private storage.
- Add operator playbooks for verification approval, support access, abuse
  reports, account deletion, and contract evidence export.
- Add customer-facing help copy explaining that yeollock.me is not a settlement or
  payment intermediary.
- Run full manual flows on desktop and mobile: advertiser signup, email
  confirmation, business verification request, admin approval, contract draft,
  share link send, influencer review, modification request, approval, signature,
  signed PDF access, and support access request.
- Decide whether to keep old settlement-related database tables unused for
  future expansion or remove them in a later migration after legal/product
  review.

## Later

- Team accounts and organization roles for agencies.
- Contract template versioning and legal-template review workflow.
- Optional paid plan and billing. Do not add this until payment and tax
  responsibility boundaries are reviewed.
- Optional settlement features only after a separate product, legal, tax, and
  compliance review.
