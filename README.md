<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e786620b-1980-4964-9772-882fad39365a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase setup

DMOffer can store contracts in Supabase through the local Express API. The browser never receives the Supabase service role key.

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
PRODUCT_NAME="DMOffer"
VITE_PRODUCT_NAME="DMOffer"
ADMIN_ACCESS_CODE="YOUR_OPERATOR_ACCESS_CODE"
ADMIN_SESSION_SECRET="YOUR_LONG_RANDOM_SESSION_SECRET"
DIRECTSIGN_DEMO_MODE="false"
DIRECTSIGN_DEFAULT_ADVERTISER_ID="adv_1"
DIRECTSIGN_DEFAULT_INFLUENCER_ID="influencer_guest"
DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK="false"
```

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present, `/api/contracts` reads from the compatibility table and writes both the compatibility table and the normalized v2 schema. Without them, the app falls back to `data/contracts.json`.
Demo seed contracts are disabled by default. Set `DIRECTSIGN_DEMO_MODE="true"` only when you intentionally want demo data in a local showcase.

In Supabase mode, `support_access_requests` is required. DMOffer fails closed instead of storing operator support access audits in local files when this table is missing. Private evidence files also fail closed if Supabase Storage upload fails unless `DIRECTSIGN_ALLOW_LOCAL_PRIVATE_FILE_FALLBACK="true"` is set for local development.

Supabase Auth should use email confirmation for public signup:

- Enable Email provider and Confirm email in Supabase Authentication settings.
- Set Site URL to `APP_URL`.
- Add redirect URLs for `/login/advertiser` and `/login/influencer` on the deployed app URL.
- Public advertiser/influencer signup sends a Supabase confirmation email and does not create an app session until the user confirms the email and logs in.

Advertiser verification is intentionally manual in the first production path:

- Advertisers can draft contracts immediately.
- Sending a share link is blocked until a business verification request is approved in `/admin`.
- Influencers can still open contract links and sign.
- Influencer platform account verification now asks the creator to place a product challenge code in a platform-specific public location, such as an Instagram bio, YouTube channel description, or Naver Blog profile/post.
- `/admin` shows the challenge code, proof URL, screenshot evidence, and automated check status. Operator approval remains authoritative because some platforms block unauthenticated crawls.
