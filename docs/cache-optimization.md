# Cache optimization notes

## Applied scope

- Public marketplace/catalog APIs use short CDN cache headers, Vercel cache tags, and Runtime Cache as a per-region refill layer.
- Advertiser dashboard bootstrap keeps `Cache-Control: no-store` and uses only a 10-second in-process cache after a session or fast-session is verified.
- Marketplace message summary requests are deduped client-side while one request is already in flight.
- Supabase indexes were added for dashboard bootstrap, marketplace messages, and campaign application query paths.

## Cache boundaries

- Public cache allowed: published influencer profiles, brand profiles, and campaign listing payloads.
- Private in-process dedupe only: advertiser dashboard bootstrap and message summaries.
- Never public-cache: contract detail, share tokens, review/final PDFs, signature assets, deliverable evidence, support access, verification evidence, admin queues, and user-specific dashboard payloads.

## Sources checked

- Vercel Cache-Control headers: https://vercel.com/docs/headers/cache-control-headers
- Vercel Runtime Cache and tag invalidation: https://vercel.com/docs/runtime-cache
- Supabase query optimization: https://supabase.com/docs/guides/database/query-optimization
- MDN Cache-Control reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
