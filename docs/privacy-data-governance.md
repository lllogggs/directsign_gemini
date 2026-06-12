# Privacy and Data Handling Guardrails

This service stores contract, verification, support, marketplace, and export data. Treat every data path as hostile until it is classified.

## Data Classes

- Public catalog data: marketplace profiles, campaign cards, public SEO pages, and non-sensitive images intended for public browsing.
- Account data: profile names, emails, verification status, organization names, platform handles, and dashboard summaries.
- Contract data: contract bodies, parties, clauses, fees, deadlines, share tokens, review PDFs, signed PDFs, signatures, deliverables, and support context.
- Operator-only evidence: verification evidence files, support access audit logs, signed IP/User-Agent values, storage bucket/path/provider metadata, OAuth tokens, and internal ids.
- Sales prospect data: raw lead exports, enrichment logs, business email lists, phone lists, and cold-email CSV/TSV/JSON files.

## Non-Negotiable Rules

- Raw sales prospect files must not live in git-visible `docs/sales/`. Store them only under ignored `data/` paths such as `data/sales-leads/<date>/`.
- `docs/sales/*prospect*`, `*lead*`, `*business-emails*`, `*email-discovery*`, and `cold-email-leads.csv` artifacts are blocked by `.gitignore`, `.vercelignore`, and `npm run privacy:scan`.
- Client contract responses must not expose raw signature images, signed IP addresses, User-Agent strings, storage buckets, storage paths, storage providers, signed PDF paths, or consent text bodies.
- Share tokens may be returned only to the advertiser surface that needs to create a share URL. Share/influencer/admin contract responses must omit the token body.
- Deliverable responses may expose safe file names, content types, byte sizes, timestamps, and authenticated download URLs. They must not expose stored private file paths or submitted IP/User-Agent metadata.
- Google Workspace OAuth tokens are server-only data. Token tables must keep RLS enabled and grant table access only to `service_role`; `public`, `anon`, and `authenticated` grants must be revoked.
- Google OAuth callbacks must bind the signed state to the current app session profile and consume the state nonce once before storing tokens.
- Sensitive contract, PDF, support, verification, and dashboard responses must stay `Cache-Control: no-store`. Public marketplace/catalog cache rules must not be reused for private contract data.

## Verification Checklist

- Run `npm run privacy:scan` before lint, commit, or deploy.
- Run `npm run lint`, `npm test`, and `npm audit --omit=dev` after privacy/security changes.
- When adding a new API response containing contract, deliverable, verification, support, or OAuth data, add a regression assertion in `tests/directsign-security.test.ts`.
- When adding a new Supabase table for private data, pair RLS policies with explicit grants/revokes in the same migration or an immediate hardening migration.
