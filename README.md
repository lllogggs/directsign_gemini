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

DirectSign can store contracts in Supabase through the local Express API. The browser never receives the Supabase service role key.

1. Create a Supabase project.
2. Run `supabase/migrations/20260501000000_create_directsign_contracts.sql` in the Supabase SQL editor for the current UI compatibility table.
3. Run `supabase/migrations/20260501020000_create_directsign_v2_schema.sql` for the normalized contract, clause, pricing, sharing, signature, and audit tables.
4. Run `supabase/migrations/20260501030000_create_verification_requests.sql` for advertiser business verification and influencer account checks.
5. Run `supabase/migrations/20260502055903_add_influencer_account_ownership_verification.sql` to store influencer ownership challenge codes, proof URLs, and best-effort automated check results.
6. Add these values to `.env.local`:

```env
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
SUPABASE_CONTRACTS_TABLE="directsign_contracts"
SUPABASE_SCHEMA_VERSION="v2"
ADMIN_ACCESS_CODE="YOUR_OPERATOR_ACCESS_CODE"
ADMIN_SESSION_SECRET="YOUR_LONG_RANDOM_SESSION_SECRET"
DIRECTSIGN_DEMO_MODE="false"
DIRECTSIGN_DEFAULT_ADVERTISER_ID="adv_1"
DIRECTSIGN_DEFAULT_INFLUENCER_ID="influencer_guest"
```

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present, `/api/contracts` reads from the compatibility table and writes both the compatibility table and the normalized v2 schema. Without them, the app falls back to `data/contracts.json`.
Demo seed contracts are disabled by default. Set `DIRECTSIGN_DEMO_MODE="true"` only when you intentionally want demo data in a local showcase.

Advertiser verification is intentionally manual in the first production path:

- Advertisers can draft contracts immediately.
- Sending a share link is blocked until a business verification request is approved in `/admin`.
- Influencers can still open contract links and sign.
- Influencer platform account verification now asks the creator to place a DirectSign challenge code in a platform-specific public location, such as an Instagram bio, YouTube channel description, or Naver Blog profile/post.
- `/admin` shows the challenge code, proof URL, screenshot evidence, and automated check status. Operator approval remains authoritative because some platforms block unauthenticated crawls.
