<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# yeollock.me

yeollock.me는 광고주와 인플루언서가 연락, 계약 검토, 수정 협의, 전자서명 증빙을 한 곳에서 처리하는 워크스페이스입니다.

For production launch readiness, service scope, and legal/security operations,
see [`docs/launch-readiness.md`](docs/launch-readiness.md).
Owner-only launch tasks are tracked in
[`docs/owner-action-memo.md`](docs/owner-action-memo.md).

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and fill only the services
   you are testing locally. `GEMINI_API_KEY` is currently optional/reserved.
3. Run the app:
   `npm run dev`

## Standard QA

Use the same project QA command whether the request comes from desktop Codex,
Discord, or the terminal:

```bash
npm run qa
```

This command runs tests, lint, build, dependency audit, linked Supabase migration
status, `/api/health`, protected API access checks, app-shell UI route smoke
checks, and legal route smoke checks.
It intentionally does not require local Supabase Docker/Postgres; local database
migration checks should only be run when local Supabase is explicitly requested.
`npm run qa:discord` remains as a compatibility alias for older Discord logs or
commands, but the standard command is `npm run qa`.

## Production domain

Vercel project: `yeollock-me`

Production URL: `https://yeollock.me`

DNS is managed at Gabia. Set these records before launch:

```text
A     @     76.76.21.21
A     www   76.76.21.21
```

The Vercel project already has `yeollock.me` and `www.yeollock.me` attached.

## Supabase setup

The configured product can store contracts in Supabase through the local Express API. The browser never receives the Supabase service role key.

1. Create a Supabase project.
2. Apply every SQL file in `supabase/migrations` in timestamp order. The required base schema is `supabase/migrations/20260430193123_create_directsign_v2_schema.sql`; `20260501020000_create_directsign_v2_schema.sql` is intentionally a consolidated no-op kept only for migration history compatibility.
3. Confirm the later hardening and marketplace migrations are applied, especially `20260505070645_harden_contract_support_access.sql`, `20260505081146_harden_signature_evidence_support_boundaries.sql`, `20260506043140_add_signup_legal_consents.sql`, `20260506075008_restrict_authenticated_direct_writes.sql`, `20260507224346_allow_revoked_support_access_event.sql`, `20260507230025_lock_reserved_settlement_tables.sql`, and `20260513035730_add_marketplace_profiles.sql`.
4. Run Supabase Security Advisor after applying migrations and resolve any RLS, exposed table, or storage warnings before launch.
5. Generate server-only secrets:

```bash
npm run secrets:generate
```

6. Add these values to `.env.local`:

```env
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_PUBLISHABLE_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
SUPABASE_CONTRACTS_TABLE="directsign_contracts"
SUPABASE_SCHEMA_VERSION="v2"
APP_URL="https://yeollock.me"
VITE_PUBLIC_SITE_URL="https://yeollock.me"
PRODUCT_NAME="yeollock.me"
VITE_PRODUCT_NAME="yeollock.me"
ADMIN_ACCESS_CODE="VALUE_FROM_NPM_RUN_SECRETS_GENERATE"
ADMIN_OPERATOR_NAME="REAL_OPERATOR_NAME"
ADMIN_SESSION_SECRET="VALUE_FROM_NPM_RUN_SECRETS_GENERATE"
ADMIN_LOGIN_MAX_FAILURES="5"
ADMIN_LOGIN_WINDOW_SECONDS="900"
ADMIN_LOGIN_LOCK_SECONDS="900"
PUBLIC_AUTH_IP_MAX_ATTEMPTS="40"
PUBLIC_AUTH_EMAIL_MAX_ATTEMPTS="8"
PUBLIC_AUTH_WINDOW_SECONDS="900"
SENSITIVE_ENDPOINT_IP_MAX_ATTEMPTS="60"
SENSITIVE_ENDPOINT_SUBJECT_MAX_ATTEMPTS="20"
SENSITIVE_ENDPOINT_WINDOW_SECONDS="900"
DIRECTSIGN_TOKEN_ENCRYPTION_SECRET="VALUE_FROM_NPM_RUN_SECRETS_GENERATE"
CONTENT_SECURITY_POLICY_REPORT_ONLY="false"
DIRECTSIGN_DEMO_MODE="false"
DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE="false"
DIRECTSIGN_DEFAULT_ADVERTISER_ID="adv_1"
DIRECTSIGN_DEFAULT_INFLUENCER_ID="influencer_guest"
DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK="false"
VITE_LEGAL_OPERATING_MODE="free_individual"
VITE_LEGAL_OPERATOR_NAME=""
VITE_LEGAL_REPRESENTATIVE_NAME=""
VITE_LEGAL_BUSINESS_REGISTRATION_NUMBER=""
VITE_LEGAL_MAIL_ORDER_BUSINESS_NUMBER=""
VITE_LEGAL_ADDRESS=""
VITE_LEGAL_CONTACT_EMAIL="support@yeollock.me"
VITE_LEGAL_CONTACT_PHONE=""
```

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present, `/api/contracts` reads from the compatibility table and writes both the compatibility table and the normalized v2 schema. Without them, the app falls back to `data/contracts.json`.
Demo seed contracts are disabled by default. Set `DIRECTSIGN_DEMO_MODE="true"` only when you intentionally want demo data in a local showcase.

In Supabase mode, `support_access_requests` is required. The app fails closed instead of storing operator support access audits in local files when this table is missing. Private evidence files also fail closed if Supabase Storage upload fails unless `DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK="true"` is set for local development.

Set `APP_URL` to the deployed origin before enabling public signup. Production signup redirects fail closed when `APP_URL` is missing. Public advertiser/influencer login and signup endpoints are rate-limited by IP and email. `DIRECTSIGN_TOKEN_ENCRYPTION_SECRET` protects new legacy compatibility-table share tokens at rest; production startup fails when it is missing, short, or placeholder-like. Keep it stable across deployments.

Before launch, review and publish `/privacy`, `/terms`, and `/legal/e-sign-consent`. Keep `VITE_LEGAL_OPERATING_MODE="free_individual"` while there is no business registration and the service is provided for free; in that mode business registration, mail-order registration, address, and phone fields are not required. The legal pages use safe public defaults for the operator and privacy representative so production pages never show placeholder launch text, but the real service operator/contact values should still be filled before public traffic. Switch to `VITE_LEGAL_OPERATING_MODE="registered_business"` before paid/business use and then fill the business registration, mail-order registration if applicable, address, and phone fields.

The product is currently scoped as a contract platform only. It records contract payment terms as clauses between the advertiser and influencer, but it does not perform settlement, payout, escrow, tax invoice issuance, withholding, refund processing, or collection work. Keep this boundary visible in sales material, onboarding copy, terms, support scripts, and internal operating procedures.

Production responses include baseline security headers, enforcing CSP by default, admin login throttling, public auth throttling, signed PDF Korean font embedding through the bundled NanumGothic font, and required server-only token encryption. Keep `ADMIN_ACCESS_CODE`, `ADMIN_SESSION_SECRET`, and `DIRECTSIGN_TOKEN_ENCRYPTION_SECRET` long, unique, stable, and server-side only. Local development can auto-generate missing runtime secrets in ignored `data/runtime-secrets.json`; do not rely on that for production.

Supabase Auth should use email confirmation for public signup:

- Enable Email provider and Confirm email in Supabase Authentication settings.
- Set Site URL to `https://yeollock.me`.
- Add redirect URLs for `https://yeollock.me/login/advertiser` and `https://yeollock.me/login/influencer`.
- Public advertiser/influencer signup sends a Supabase confirmation email and does not create an app session until the user confirms the email and logs in.

Advertiser verification is intentionally manual in the first production path:

- Advertisers can draft contracts immediately.
- Sending a share link is blocked until a business verification request is approved in `/admin`.
- Influencers can open contract links for review, but signing is blocked until their platform account verification is approved.
- Public influencer signup only stores checked activity categories and platform selections, then sends the creator to the dashboard after email confirmation and login.
- Influencer platform account ownership verification is deferred until a contract context exists. It asks the creator to place a product challenge code in a platform-specific public location, such as an Instagram bio, YouTube channel description, or Naver Blog profile/post.
- `/admin` shows the challenge code, proof URL, screenshot evidence, and automated check status. Operator approval remains authoritative because some platforms block unauthenticated crawls.
