# Conversation Summary

Last updated: 2026-05-16

## Connection

- Workspace path: `C:\Users\wkeoo93\Desktop\codexs\directsign_gemini`.
- Current branch: `codex/supabase-marketplace-profiles`.
- The local dev server was restarted successfully on `http://localhost:3000`.
- `/api/health` returned `200` with `service: directsign-api`, Supabase storage enabled, demo mode disabled, and admin auth configured.

## Project Identity

- Product name: `yeollock.me`.
- User nickname for this project: `연락미`.
- When the user says `연락미`, treat it as this DirectSign / yeollock.me project unless they clarify otherwise.

## Product Scope

- Core product: advertiser and influencer contract workspace.
- Main flows: advertiser/influencer signup and login, marketplace discovery, campaign/proposal workflows, contract drafting, review, modification discussion, share links, e-signature evidence, signed PDF storage, deliverable submission/review, account verification, and support access audit.
- Explicit boundary: the product is a contract platform only. It does not provide settlement, payout, escrow, tax invoice issuance, withholding, refund processing, or collection services.
- Payment terms may be recorded inside contracts, but actual payment/tax handling remains between the parties.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind-style utility classes, React Router.
- Backend: Express in `server/index.ts`.
- Data/auth/storage: Supabase, with server-only service role usage.
- Deployment: Vercel project `yeollock-me`, production domain `https://yeollock.me`.
- AI: `GEMINI_API_KEY` is currently optional/reserved and must remain server-side only.

## Recent State

- Latest commit: `ffa61f3 Prepare yeollock for public beta hardening`.
- Recent work included public beta hardening, password reset, SEO/public assets, QA script expansion, Supabase helper hardening migration, marketplace/profile/campaign UI polish, auth flow polish, and launch readiness updates.
- Working tree was clean before this summary update.
- Standard verification command: `npm run qa`.

## Launch And Owner Tasks

- Owner-only launch tasks live in `docs/owner-action-memo.md`.
- Launch readiness lives in `docs/launch-readiness.md`.
- Before public launch, owner must confirm real signup/email-confirmation flows, Vercel legal env values, Supabase Auth redirect settings, Supabase Advisor warnings, production Data API exposure, and a full advertiser-to-influencer contract/signing/deliverable flow.
- Legal mode should remain `VITE_LEGAL_OPERATING_MODE="free_individual"` while the service is free and not operated as a registered business. Switch to `registered_business` before paid/business operation.

## Operating Rules

- Follow `AGENTS.md`: Codex is the orchestrator/implementation lead; the user is final authority.
- Ask before changes that affect product direction, major UX structure, data/backend architecture, API key handling, authentication, payments, deployment, external services, user data permissions, or advertiser/influencer workflow.
- For meaningful improvements, include customer reaction review: primary reaction, secondary reaction if relevant, risk, and mitigation.
- Product quality bar: trust, clarity, evidence, error recovery, efficient advertiser desktop workflow, low-friction influencer mobile workflow.

## Known Context-Restoration Note

- Some PowerShell `Get-Content` output in this environment displays Korean as mojibake, but `git show` and `git diff` display the same files correctly. Treat this as a terminal/output encoding issue unless browser rendering or file bytes prove otherwise.
