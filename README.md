<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 연락미 (yeollock.me)

연락미는 광고주와 인플루언서가 연락, 계약 검토, 수정 협의, 전자서명 증빙을 한 곳에서 처리하는 워크스페이스입니다.

For production launch readiness, service scope, and legal/security operations,
see [`docs/launch-readiness.md`](docs/launch-readiness.md).

View your app in AI Studio: https://ai.studio/apps/e786620b-1980-4964-9772-882fad39365a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

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
2. Run `supabase/migrations/20260501000000_create_directsign_contracts.sql` in the Supabase SQL editor for the current UI compatibility table.
3. Run `supabase/migrations/20260501020000_create_directsign_v2_schema.sql` for the normalized contract, clause, pricing, sharing, signature, and audit tables.
4. Run `supabase/migrations/20260501030000_create_verification_requests.sql` for advertiser business verification and influencer account checks.
5. Run `supabase/migrations/20260502055903_add_influencer_account_ownership_verification.sql` to store influencer ownership challenge codes, proof URLs, and best-effort automated check results.
6. Run `supabase/migrations/20260503073000_create_support_access_requests.sql` to restrict operator contract access and store customer-approved support access audits.
7. Add these values to `.env.local`:

```env
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_PUBLISHABLE_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
SUPABASE_CONTRACTS_TABLE="directsign_contracts"
SUPABASE_SCHEMA_VERSION="v2"
APP_URL="https://yeollock.me"
PRODUCT_NAME="연락미"
VITE_PRODUCT_NAME="연락미"
ADMIN_ACCESS_CODE="YOUR_OPERATOR_ACCESS_CODE"
ADMIN_SESSION_SECRET="YOUR_LONG_RANDOM_SESSION_SECRET"
ADMIN_LOGIN_MAX_FAILURES="5"
ADMIN_LOGIN_WINDOW_SECONDS="900"
ADMIN_LOGIN_LOCK_SECONDS="900"
DIRECTSIGN_DEMO_MODE="false"
DIRECTSIGN_DEFAULT_ADVERTISER_ID="adv_1"
DIRECTSIGN_DEFAULT_INFLUENCER_ID="influencer_guest"
DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK="false"
```

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present, `/api/contracts` reads from the compatibility table and writes both the compatibility table and the normalized v2 schema. Without them, the app falls back to `data/contracts.json`.
Demo seed contracts are disabled by default. Set `DIRECTSIGN_DEMO_MODE="true"` only when you intentionally want demo data in a local showcase.

In Supabase mode, `support_access_requests` is required. The app fails closed instead of storing operator support access audits in local files when this table is missing. Private evidence files also fail closed if Supabase Storage upload fails unless `DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK="true"` is set for local development.

Before launch, review and publish `/privacy`, `/terms`, and `/legal/e-sign-consent`. They are service-ready drafts for privacy notice, terms, and electronic signature consent, but the operator must replace placeholder contact details, actual subprocessors, data-retention periods, customer support channels, and company information with legally reviewed production values.

The product is currently scoped as a contract platform only. It records contract payment terms as clauses between the advertiser and influencer, but it does not perform settlement, payout, escrow, tax invoice issuance, withholding, refund processing, or collection work. Keep this boundary visible in sales material, onboarding copy, terms, support scripts, and internal operating procedures.

Production responses include baseline security headers and admin login throttling. Keep `ADMIN_ACCESS_CODE` and `ADMIN_SESSION_SECRET` long, unique, and server-side only.

Supabase Auth should use email confirmation for public signup:

- Enable Email provider and Confirm email in Supabase Authentication settings.
- Set Site URL to `https://yeollock.me`.
- Add redirect URLs for `https://yeollock.me/login/advertiser` and `https://yeollock.me/login/influencer`.
- Public advertiser/influencer signup sends a Supabase confirmation email and does not create an app session until the user confirms the email and logs in.

Advertiser verification is intentionally manual in the first production path:

- Advertisers can draft contracts immediately.
- Sending a share link is blocked until a business verification request is approved in `/admin`.
- Influencers can still open contract links and sign.
- Public influencer signup only stores checked activity categories and platform selections, then sends the creator to the dashboard after email confirmation and login.
- Influencer platform account ownership verification is deferred until a contract context exists. It asks the creator to place a product challenge code in a platform-specific public location, such as an Instagram bio, YouTube channel description, or Naver Blog profile/post.
- `/admin` shows the challenge code, proof URL, screenshot evidence, and automated check status. Operator approval remains authoritative because some platforms block unauthenticated crawls.
