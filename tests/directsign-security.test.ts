import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatContractTitleForDisplay } from "../src/domain/display";
import {
  buildCanonicalUrl,
  getIntentAwareRouteSeoConfig,
  defaultOgImageUrl,
  ogImageHeight,
  ogImageWidth,
  staticSeoRoutePaths,
} from "../src/domain/seo";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("yeollock.me security regressions", () => {
  it("does not inject the server-only Gemini API key into the Vite client bundle", () => {
    const viteConfig = read("vite.config.ts");

    assert.equal(viteConfig.includes("process.env.GEMINI_API_KEY"), false);
    assert.equal(viteConfig.includes("env.GEMINI_API_KEY"), false);
  });

  it("keeps private application routes out of search indexing", () => {
    const robots = read("public/robots.txt");

    for (const route of [
      "/admin",
      "/advertiser",
      "/contract",
      "/influencer",
      "/marketing",
    ]) {
      assert.match(robots, new RegExp(`Disallow:\\s*${route}`));
    }
  });

  it("keeps public SEO routes prerendered with unique canonical metadata", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
      headers?: Array<{
        source?: string;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const envExample = read(".env.example");
    const indexHtml = read("index.html");
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");
    const llmsTxt = read("public/llms.txt");
    const prerender = read("scripts/prerender-seo-html.ts");
    const seoSource = read("src/domain/seo.ts");
    const appSource = read("src/App.tsx");
    const rewriteBySource = new Map(
      vercelConfig.rewrites?.map((rewrite) => [
        rewrite.source,
        rewrite.destination,
      ]),
    );
    const headerBySource = new Map(
      vercelConfig.headers?.map((headerConfig) => [
        headerConfig.source,
        new Map(
          headerConfig.headers?.map((header) => [header.key, header.value]),
        ),
      ]),
    );
    const routeTitles = new Set<string>();
    const routeDescriptions = new Set<string>();
    const maxNaverTitleLength = 40;
    const maxNaverDescriptionLength = 80;

    assert.match(
      packageJson.scripts?.build ?? "",
      /scripts\/prerender-seo-html\.ts/,
    );
    assert.match(seoSource, /VITE_PUBLIC_SITE_URL/);
    assert.match(appSource, /VITE_PUBLIC_SITE_URL/);
    assert.match(prerender, /GOOGLE_SITE_VERIFICATION/);
    assert.match(prerender, /google-site-verification/);
    assert.match(prerender, /NAVER_SITE_VERIFICATION/);
    assert.match(prerender, /naver-site-verification/);
    assert.match(prerender, /routeSearchSummaries/);
    assert.match(prerender, /renderSitemap/);
    assert.match(prerender, /summary_large_image/);
    assert.match(indexHtml, /og:image/);
    assert.match(indexHtml, /twitter:image/);
    assert.match(seoSource, /seoResourcePaths/);
    assert.match(appSource, /path="\/resources\/:resourceSlug"/);
    assert.match(llmsTxt, /인플루언서 광고 계약서 가이드/);
    assert.match(llmsTxt, /PPL 계약 검토 체크리스트/);
    assert.match(llmsTxt, /공동구매 계약 가이드/);
    assert.match(llmsTxt, /인스타그램 협찬 계약 가이드/);
    assert.match(llmsTxt, /유튜브 PPL 계약 가이드/);
    assert.match(envExample, /GOOGLE_SITE_VERIFICATION=""/);
    assert.match(envExample, /VITE_GOOGLE_SITE_VERIFICATION=""/);
    assert.match(envExample, /NAVER_SITE_VERIFICATION=""/);
    assert.match(envExample, /VITE_NAVER_SITE_VERIFICATION=""/);
    assert.match(indexHtml, /google-site-verification/);
    assert.match(robots, /User-agent:\s*Yeti/);
    assert.match(robots, /Sitemap:\s*https:\/\/yeollock\.me\/sitemap\.xml/);
    assert.equal(
      headerBySource.get("/robots.txt")?.get("Content-Type"),
      "text/plain; charset=utf-8",
    );
    assert.equal(
      headerBySource.get("/sitemap.xml")?.get("Content-Type"),
      "application/xml; charset=utf-8",
    );

    for (const routePath of staticSeoRoutePaths) {
      const seo = getIntentAwareRouteSeoConfig(routePath);
      const canonicalUrl = buildCanonicalUrl(routePath);
      const isLegalNoIndexRoute = [
        "/privacy",
        "/terms",
        "/legal/e-sign-consent",
      ].includes(routePath);

      assert.equal(seo.canonicalPath, routePath);
      if (isLegalNoIndexRoute) {
        assert.equal(seo.robots, "noindex,follow");
        assert.doesNotMatch(sitemap, new RegExp(`<loc>${escapeRegExp(canonicalUrl)}</loc>`));
      } else {
        assert.match(seo.robots, /^index,follow/);
        assert.match(
          sitemap,
          new RegExp(
            `<loc>${escapeRegExp(canonicalUrl)}</loc>\\s*<lastmod>2026-05-31</lastmod>`,
          ),
        );
      }
      assert.equal(seo.ogImageUrl, defaultOgImageUrl);
      assert.equal(seo.ogImageAlt?.length ? true : false, true);
      assert.ok([...seo.title].length <= maxNaverTitleLength, seo.title);
      assert.ok(
        [...seo.description].length <= maxNaverDescriptionLength,
        seo.description,
      );
      routeTitles.add(seo.title);
      routeDescriptions.add(seo.description);

      if (routePath !== "/") {
        assert.equal(
          rewriteBySource.get(routePath),
          `${routePath}/index.html`,
        );
      }
    }

    assert.equal(routeTitles.size, staticSeoRoutePaths.length);
    assert.equal(routeDescriptions.size, staticSeoRoutePaths.length);
    assert.equal(ogImageWidth, 1200);
    assert.equal(ogImageHeight, 630);
  });

  it("applies baseline security headers to Vercel static and API routes", () => {
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      headers?: Array<{
        source?: string;
        headers?: Array<{ key?: string; value?: string }>;
      }>;
    };
    const globalHeaders = vercelConfig.headers?.find(
      (entry) => entry.source === "/(.*)",
    )?.headers;

    assert.ok(globalHeaders);
    const byKey = new Map(globalHeaders.map((header) => [header.key, header.value]));

    assert.equal(byKey.get("X-Content-Type-Options"), "nosniff");
    assert.equal(byKey.get("X-Frame-Options"), "DENY");
    assert.equal(byKey.get("Referrer-Policy"), "no-referrer");
    assert.match(byKey.get("Permissions-Policy") ?? "", /camera=\(\)/);
    assert.match(byKey.get("Strict-Transport-Security") ?? "", /includeSubDomains/);
    assert.match(byKey.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
    assert.match(byKey.get("Content-Security-Policy") ?? "", /img-src 'self' data: blob: https:\/\/\*\.supabase\.co/);
    assert.match(byKey.get("Content-Security-Policy") ?? "", /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);
    assert.match(byKey.get("Content-Security-Policy") ?? "", /script-src 'self' https:\/\/\*\.googletagmanager\.com https:\/\/\*\.clarity\.ms/);
    assert.match(byKey.get("Content-Security-Policy") ?? "", /https:\/\/\*\.google-analytics\.com/);
    assert.match(byKey.get("Content-Security-Policy") ?? "", /https:\/\/\*\.analytics\.google\.com/);
    assert.match(byKey.get("Content-Security-Policy") ?? "", /https:\/\/c\.bing\.com/);
    assert.doesNotMatch(byKey.get("Content-Security-Policy") ?? "", /script-src[^;]*'unsafe-inline'/);
  });

  it("installs analytics without exposing sensitive contract routes to external tools", () => {
    const analytics = read("src/domain/analytics.ts");
    const app = read("src/App.tsx");
    const main = read("src/main.tsx");
    const privacy = read("src/pages/legal/LegalDocumentPage.tsx");
    const envExample = read(".env.example");
    const server = read("server/index.ts");
    const clarityPathsStart = analytics.indexOf("const clarityPublicPaths");
    const clarityPathsEnd = analytics.indexOf("let installed", clarityPathsStart);
    const clarityPathAllowlist = analytics.slice(clarityPathsStart, clarityPathsEnd);

    assert.match(analytics, /G-PDTVNFRD1W/);
    assert.match(analytics, /wx0bvf6bl5/);
    assert.match(main, /installAnalytics\(\)/);
    assert.match(app, /RouteAnalytics/);
    assert.match(app, /syncAnalyticsRoute\(location\.pathname, location\.search\)/);

    assert.match(analytics, /allow_google_signals:\s*false/);
    assert.match(analytics, /allow_ad_personalization_signals:\s*false/);
    assert.match(analytics, /ad_storage:\s*"denied"/);
    assert.match(analytics, /ad_user_data:\s*"denied"/);
    assert.match(analytics, /ad_personalization:\s*"denied"/);

    assert.match(analytics, /if \(normalized\.startsWith\("\/contract\/"\)\) return "\/contract\/:id"/);
    assert.match(analytics, /return "\/advertiser\/contract\/:id"/);
    assert.match(analytics, /new URLSearchParams\(search\)/);
    assert.doesNotMatch(analytics, /safeParams\.set\("token"/);
    assert.doesNotMatch(analytics, /safeParams\.set\("support"/);
    assert.doesNotMatch(analytics, /page_location:[\s\S]*window\.location\.href/);

    assert.match(analytics, /clarityPublicPaths/);
    assert.match(analytics, /data-clarity-mask/);
    assert.match(analytics, /win\.clarity\?\.\("stop"\)/);
    assert.doesNotMatch(clarityPathAllowlist, /"\/contract\//);
    assert.doesNotMatch(clarityPathAllowlist, /"\/advertiser\/dashboard"/);
    assert.doesNotMatch(clarityPathAllowlist, /"\/influencer\/dashboard"/);

    assert.match(server, /script-src 'self' https:\/\/\*\.googletagmanager\.com https:\/\/\*\.clarity\.ms/);
    assert.match(server, /img-src 'self' data: blob: https:\/\/\*\.supabase\.co/);
    assert.match(server, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co https:\/\/\*\.google-analytics\.com/);
    assert.match(envExample, /VITE_GOOGLE_ANALYTICS_ID="G-PDTVNFRD1W"/);
    assert.match(envExample, /VITE_MICROSOFT_CLARITY_ID="wx0bvf6bl5"/);
    assert.match(privacy, /Google Analytics\(G-PDTVNFRD1W\)/);
    assert.match(privacy, /Microsoft Clarity\(wx0bvf6bl5\)/);
    assert.match(privacy, /공유 토큰/);
  });

  it("bundles a Korean-capable font for server-signed PDFs", () => {
    const server = read("server/index.ts");
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      functions?: Record<string, { includeFiles?: string }>;
    };

    assert.match(server, /public", "fonts", "NanumGothic-Regular\.ttf"/);
    assert.equal(
      vercelConfig.functions?.["api/index.ts"]?.includeFiles,
      "public/fonts/**",
    );
    assert.ok(statSync(join(root, "public/fonts/NanumGothic-Regular.ttf")).size > 1_000_000);
  });

  it("protects marketplace follower sync with cron auth and server-only logs", () => {
    const server = read("server/index.ts");
    const envExample = read(".env.example");
    const migration = read(
      "supabase/migrations/20260518044009_add_marketplace_follower_sync.sql",
    );
    const vercelConfig = JSON.parse(read("vercel.json")) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };

    assert.ok(
      vercelConfig.crons?.some(
        (cron) =>
          cron.path === "/api/cron/sync-marketplace-followers" &&
          cron.schedule === "0 18 * * *",
      ),
    );
    assert.match(envExample, /CRON_SECRET=""/);
    assert.match(envExample, /MARKETPLACE_NAVER_BLOG_VISITOR_SYNC_STALE_DAYS="1"/);
    assert.match(server, /const cronSecret = readConfiguredServerSecret\("CRON_SECRET"\)/);
    assert.match(server, /requireCronRequest/);
    assert.match(server, /safeEqual\(token, cronSecret\)/);
    assert.match(server, /\/api\/cron\/sync-marketplace-followers/);
    assert.match(server, /runMarketplaceFollowerSync/);
    assert.match(server, /marketplace_follower_sync_runs/);
    assert.match(server, /marketplace_follower_sync_events/);
    assert.match(server, /follower_count_synced_at/);
    assert.match(server, /clearPublicMarketplaceCache\(\)/);
    assert.match(server, /NVisitorgp4Ajax\.nhn/);
    assert.match(server, /naver_blog_public_visitor_counter/);
    assert.match(server, /stored_5_day_average/);
    assert.match(server, /getNaverBlogVisitorTargetDate/);
    assert.match(
      migration,
      /alter table public\.marketplace_influencer_channels[\s\S]+follower_count/,
    );
    assert.match(migration, /marketplace_follower_sync_runs/);
    assert.match(migration, /marketplace_follower_sync_events/);
    assert.match(migration, /enable row level security/);
    assert.match(
      migration,
      /revoke all on table[\s\S]+from public, anon, authenticated;/,
    );
    assert.match(migration, /grant select, insert, update on table[\s\S]+to service_role;/);
    assert.doesNotMatch(migration, /grant[\s\S]+to anon;/);
  });

  it("keeps server-loaded domain imports compatible with Vercel ESM runtime", () => {
    const domainDir = join(root, "src/domain");
    const domainFiles = readdirSync(domainDir).filter((file) => file.endsWith(".ts"));

    for (const file of domainFiles) {
      const source = read(`src/domain/${file}`);
      const relativeImports = source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g);

      for (const match of relativeImports) {
        assert.match(
          match[1],
          /\.js$/,
          `${file} uses an extensionless relative import that can break Vercel serverless ESM: ${match[1]}`,
        );
      }
    }
  });

  it("keeps duplicate early Supabase migrations as no-ops", () => {
    const duplicateSchema = read(
      "supabase/migrations/20260501020000_create_directsign_v2_schema.sql",
    );
    const duplicateVerification = read(
      "supabase/migrations/20260501141435_create_verification_requests.sql",
    );

    assert.match(duplicateSchema, /Consolidated no-op/);
    assert.doesNotMatch(duplicateSchema, /create\s+trigger/i);
    assert.match(duplicateVerification, /Consolidated no-op/);
    assert.doesNotMatch(duplicateVerification, /create\s+trigger/i);
  });

  it("documents the real Supabase migration chain instead of the no-op schema", () => {
    const launchReadiness = read("docs/launch-readiness.md");

    assert.match(launchReadiness, /Apply every SQL file[\s\S]+timestamp order/);
    assert.match(launchReadiness, /20260430193123_create_directsign_v2_schema\.sql/);
    assert.match(
      launchReadiness,
      /20260501020000_create_directsign_v2_schema\.sql[\s\S]+no-op/,
    );
    assert.match(launchReadiness, /20260505070645_harden_contract_support_access\.sql/);
    assert.match(launchReadiness, /20260506075008_restrict_authenticated_direct_writes\.sql/);
    assert.match(launchReadiness, /20260507224346_allow_revoked_support_access_event\.sql/);
    assert.match(launchReadiness, /20260507230025_lock_reserved_settlement_tables\.sql/);
    assert.match(launchReadiness, /20260518044009_add_marketplace_follower_sync\.sql/);
    assert.match(launchReadiness, /20260528135700_create_operational_support_tickets\.sql/);
    assert.match(launchReadiness, /20260528144856_extend_operational_support_tickets\.sql/);
    assert.match(launchReadiness, /20260529090000_remove_settlement_support_ticket_category\.sql/);
  });

  it("separates production data from test seeds and centralizes support tickets", () => {
    const server = read("server/index.ts");
    const app = read("src/App.tsx");
    const supportPage = read("src/pages/support/SupportPage.tsx");
    const supportDomain = read("src/domain/support.ts");
    const advertiserViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const influencerViewer = read("src/pages/influencer/ContractViewer.tsx");
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const legalEntity = read("src/domain/legalEntity.ts");
    const envExample = read(".env.example");
    const seedAccounts = read("scripts/seed-test-accounts.mjs");
    const seedMarketplace = read("scripts/seed-qa-marketplace-scenario.mjs");
    const migration = read(
      "supabase/migrations/20260528135700_create_operational_support_tickets.sql",
    );
    const extensionMigration = read(
      "supabase/migrations/20260528144856_extend_operational_support_tickets.sql",
    );
    const settlementCategoryRemovalMigration = read(
      "supabase/migrations/20260529090000_remove_settlement_support_ticket_category.sql",
    );

    assert.match(envExample, /YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA="false"/);
    assert.match(envExample, /VITE_LEGAL_OPERATOR_NAME=""/);
    assert.doesNotMatch(envExample, /VITE_LEGAL_OPERATOR_NAME="김재우"/);
    assert.doesNotMatch(legalEntity, /defaultLegalOperatorName = "김재우"/);
    assert.match(legalEntity, /`\$\{PRODUCT_NAME\} 운영팀`/);
    assert.match(seedAccounts, /YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA/);
    assert.match(seedAccounts, /Production test data seeding is blocked/);
    assert.match(seedMarketplace, /YEOLLOCK_ALLOW_PRODUCTION_TEST_DATA/);
    assert.match(seedMarketplace, /Production test data seeding is blocked/);
    assert.match(server, /const allowProductionTestData/);
    assert.match(server, /const allowMarketplaceSeedData/);
    assert.match(server, /const filterOperationalMarketplaceTestData/);
    assert.match(server, /demoMode \|\| !isProductionRuntime \|\| allowProductionTestData/);
    assert.match(server, /!filterOperationalMarketplaceTestData \|\|[\s\S]+!hasOperationalTestMarker\(profile\)/);
    assert.match(server, /allowMarketplaceSeedData\s+\?\s+mergeMarketplaceInfluencerProfiles/);
    assert.match(server, /allowMarketplaceSeedData\s+\?\s+mergeMarketplaceBrandProfiles/);
    assert.match(server, /allowMarketplaceSeedData\s+\?\s+marketplaceBrands\s+:\s+\[\]/);
    assert.match(server, /const profiles = await readPublicMarketplaceCache\(\s*"marketplace-influencers"/);
    assert.match(server, /normalizeMarketplaceHandle\(item\.handle\) === normalizedHandle/);
    assert.match(server, /const brands = await readPublicMarketplaceCache\(\s*"marketplace-brands"/);

    assert.match(server, /app\.post\("\/api\/support\/tickets"/);
    assert.match(server, /app\.get\("\/api\/admin\/support-tickets"/);
    assert.match(server, /operational_support_tickets/);
    assert.match(server, /sanitizeSupportContextUrl/);
    assert.match(server, /contract_id: contractId/);
    assert.match(server, /browser_context: browserContext/);
    assert.match(app, /path="\/support"/);
    assert.match(supportDomain, /buildSupportTicketPath/);
    assert.match(supportPage, /정산, 지급대행, 에스크로, 세금 처리는 연락미가 직접 처리하지/);
    assert.doesNotMatch(server, /settlement_question/);
    assert.doesNotMatch(server, /settlement-inquiry/);
    assert.doesNotMatch(supportDomain, /settlement_question/);
    assert.doesNotMatch(supportPage, /settlement_question|정산 문의/);
    assert.doesNotMatch(influencerViewer, /settlement-inquiry|정산 미지급 문의|정산 문의/);
    assert.doesNotMatch(adminDashboard, /settlement_question|정산 문의/);
    assert.match(supportPage, /contract_id: contractId/);
    assert.match(supportPage, /browser_context/);
    assert.match(advertiserViewer, /buildSupportTicketPath/);
    assert.match(influencerViewer, /buildSupportTicketPath/);
    assert.match(adminDashboard, /고객 문의/);
    assert.match(adminDashboard, /ticketCategoryFilter/);
    assert.match(adminDashboard, /계약 열기/);
    assert.match(adminDashboard, /AdminSectionTabs/);
    assert.match(adminDashboard, /manual_verification/);
    assert.match(adminDashboard, /data-admin-section/);
    assert.match(adminDashboard, /data-verification-tab/);
    assert.match(adminDashboard, /bg-red-500/);
    assert.match(adminDashboard, /인증 요청/);
    assert.match(adminDashboard, /인증 완료/);
    assert.doesNotMatch(adminDashboard, /운영 기준|운영\/테스트 분리|metrics\.source ===/);
    assert.match(server, /readOperationalAdminContracts/);
    assert.match(server, /readOperationalAdminSupportAccessRequests/);
    assert.match(server, /readOperationalAdminVerificationRequests/);
    assert.match(server, /readOperationalAdminSupportTickets/);
    assert.match(server, /if \(!useSupabase\) return \[\] as Contract\[\];/);
    assert.match(server, /operationalTestEmailLocals/);
    assert.match(server, /isOperationalTestContract/);
    assert.match(server, /isOperationalTestSupportAccessRequest/);
    assert.match(server, /isOperationalTestSupportTicket/);
    assert.match(server, /isOperationalTestVerificationRequest/);
    assert.match(server, /operationalTestSeedTextValues/);
    assert.match(server, /hasOperationalTestText/);
    assert.match(server, /store\.contracts\.filter\(\(contract\) => !isOperationalTestContract\(contract\)\)/);
    assert.match(server, /!isOperationalTestSupportAccessRequest\(request\)/);
    assert.match(server, /!isOperationalTestSupportTicket\(ticket\)/);
    assert.match(server, /!isOperationalTestVerificationRequest\(request\)/);
    assert.match(server, /breadroom\.manager/);
    assert.match(server, /test\.influencer/);
    assert.match(server, /creator\.sora/);
    assert.match(server, /광고주 매니저/);
    assert.match(server, /브레드룸 신제품 언박싱/);
    assert.match(server, /title: contract\.title/);
    assert.match(server, /contract_title: ticket\.contract_title/);

    assert.match(migration, /create table if not exists public\.operational_support_tickets/);
    assert.match(migration, /enable row level security/);
    assert.match(
      migration,
      /revoke all on public\.operational_support_tickets from public, anon, authenticated/,
    );
    assert.match(migration, /to service_role/);
    assert.match(extensionMigration, /contract_id text/);
    assert.match(extensionMigration, /browser_context jsonb/);
    assert.match(extensionMigration, /operational_support_tickets_contract_created_idx/);
    assert.match(extensionMigration, /Public share tokens and signatures must not be stored/);
    assert.match(settlementCategoryRemovalMigration, /where category = 'settlement_question'/);
    assert.match(settlementCategoryRemovalMigration, /drop constraint if exists operational_support_tickets_category/);
    assert.doesNotMatch(
      settlementCategoryRemovalMigration.replace(/where category = 'settlement_question'/g, ""),
      /'settlement_question'/,
    );
  });

  it("blocks authenticated Data API writes for security-sensitive tables", () => {
    const migration = read(
      "supabase/migrations/20260506075008_restrict_authenticated_direct_writes.sql",
    );

    for (const table of [
      "public.contracts",
      "public.contract_clauses",
      "public.share_links",
      "public.signatures",
      "public.verification_requests",
      "public.support_access_requests",
    ]) {
      assert.match(migration, new RegExp(table.replace(".", "\\.")));
    }

    assert.match(migration, /revoke insert, update, delete on table[\s\S]+from anon, authenticated;/);
    assert.match(migration, /to service_role;/);
  });

  it("keeps future settlement and payout tables reserved until marketplace launch", () => {
    const migration = read(
      "supabase/migrations/20260507230025_lock_reserved_settlement_tables.sql",
    );

    for (const table of [
      "settlement_periods",
      "settlement_reports",
      "settlement_items",
      "payouts",
    ]) {
      assert.match(migration, new RegExp(`'${table}'`));
    }

    assert.match(migration, /drop policy if exists/);
    assert.match(migration, /revoke all on table public\.%I from public, anon, authenticated/);
    assert.match(migration, /grant all on table public\.%I to service_role/);
    assert.match(migration, /Reserved for future marketplace settlement features/);
  });

  it("fails closed for production demo mode and anonymous admin attribution", () => {
    const server = read("server/index.ts");
    const envExample = read(".env.example");

    assert.match(server, /DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE/);
    assert.match(server, /DIRECTSIGN_DEMO_MODE cannot be enabled in production/);
    assert.match(server, /Production requires ADMIN_ACCESS_CODE/);
    assert.match(server, /Production requires ADMIN_OPERATOR_NAME/);
    assert.match(server, /const adminOperatorName = configuredAdminOperatorName/);
    assert.match(envExample, /ADMIN_OPERATOR_NAME=""/);
    assert.match(envExample, /DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE="false"/);
  });

  it("fails closed when Supabase support access audit events cannot be stored", () => {
    const server = read("server/index.ts");

    assert.match(server, /createMissingSupportAccessEventStoreError/);
    assert.match(server, /ensureSupportAccessEventStoreAvailable/);
    assert.match(
      server,
      /if \(!allowLocalSupportAccessStore\) \{\s*throw createMissingSupportAccessEventStoreError\(\);/s,
    );
    assert.match(server, /await ensureSupportAccessEventStoreAvailable\(\);/);
  });

  it("surfaces support access audit events and records revocations explicitly", () => {
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260507224346_allow_revoked_support_access_event.sql",
    );

    assert.match(server, /interface SupportAccessAuditEvent[\s\S]+"revoked"/);
    assert.match(server, /const attachSupportAccessEvents = async/);
    assert.match(server, /support_access_events/);
    assert.match(server, /action: status === "closed" \? "closed" : "revoked"/);
    assert.match(migration, /'revoked'/);
  });

  it("requires explicit support access consent from contract parties", () => {
    const server = read("server/index.ts");
    const legalConsent = read("src/domain/legalConsent.ts");
    const advertiserViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const influencerViewer = read("src/pages/influencer/ContractViewer.tsx");
    const userMessages = read("src/domain/userMessages.ts");
    const routeStart = server.indexOf(
      'app.post("/api/contracts/:id/support-access-requests"',
    );
    const routeEnd = server.indexOf('app.get("/api/contracts/:id"', routeStart);
    const route = server.slice(routeStart, routeEnd);

    assert.notEqual(routeStart, -1);
    assert.notEqual(routeEnd, -1);
    assert.match(legalConsent, /SUPPORT_ACCESS_CONSENT_TEXT/);
    assert.match(legalConsent, /24시간 확인하고, 열람 기록이 감사 로그에 남는 것/);
    assert.match(route, /request\.body\?\.support_consent_accepted !== true/);
    assert.match(route, /Support access consent is required/);
    assert.match(route, /supportAccessConsentText/);
    assert.match(advertiserViewer, /SUPPORT_ACCESS_CONSENT_TEXT/);
    assert.match(influencerViewer, /SUPPORT_ACCESS_CONSENT_TEXT/);
    assert.match(advertiserViewer, /support_consent_accepted: supportConsentAccepted/);
    assert.match(influencerViewer, /support_consent_accepted: supportConsentAccepted/);
    assert.match(advertiserViewer, /개인정보 처리방침 보기/);
    assert.match(influencerViewer, /개인정보 처리방침 보기/);
    assert.match(userMessages, /Support access consent is required/);
  });

  it("uses server operator identity for admin verification reviews", () => {
    const server = read("server/index.ts");
    const reviewRouteStart = server.indexOf(
      'app.patch("/api/admin/verification-requests/:id"',
    );
    const reviewRouteEnd = server.indexOf('app.get("/api/contracts"', reviewRouteStart);
    const reviewRoute = server.slice(reviewRouteStart, reviewRouteEnd);

    assert.notEqual(reviewRouteStart, -1);
    assert.notEqual(reviewRouteEnd, -1);
    assert.match(reviewRoute, /const reviewedByName = adminOperatorName/);
    assert.doesNotMatch(reviewRoute, /request\.body\?\.reviewed_by_name/);
  });

  it("does not present share links as complete before server sync settles", () => {
    const builder = read("src/pages/marketing/ContractBuilder.tsx");

    assert.match(builder, /공유 링크 저장 중/);
    assert.match(builder, /공유 링크 확인 필요/);
    assert.match(
      builder,
      /disabled=\{result\.stale \|\| isSyncing \|\| Boolean\(syncError\)\}/,
    );
    assert.match(
      builder,
      /shareResultState === "ready"[\s\S]+!result\.stale/,
    );
    assert.match(builder, /buildContractShareUrl/);
  });

  it("builds public share links from configured public site URL", () => {
    const links = read("src/domain/links.ts");
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const envExample = read(".env.example");

    assert.match(links, /VITE_PUBLIC_SITE_URL/);
    assert.match(links, /buildContractShareUrl/);
    assert.match(builder, /buildContractShareUrl/);
    assert.match(adminViewer, /buildContractShareUrl/);
    assert.match(envExample, /VITE_PUBLIC_SITE_URL="https:\/\/yeollock\.me"/);
  });

  it("does not keep contracts or share tokens in persistent browser localStorage", () => {
    const store = read("src/store.ts");
    const persistConfig = store.slice(
      store.indexOf('name: "yeollock-contract-ui-state"'),
    );

    assert.match(store, /window\.localStorage\.removeItem\(key\)/);
    assert.match(store, /"directsign-contract-store"/);
    assert.match(store, /"yeollock-contract-store"/);
    assert.match(store, /createJSONStorage\(\(\) => sessionStorage\)/);
    assert.match(persistConfig, /partialize:\s*\(\)\s*=>\s*\(\{\s*contracts:\s*\[\]\s*\}\)/s);
    assert.doesNotMatch(persistConfig, /localStorage/);
    assert.doesNotMatch(persistConfig, /share_token/);
  });

  it("blocks bearer share tokens from signed PDF downloads", () => {
    const server = read("server/index.ts");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");
    const reviewPdfRouteStart = server.indexOf('app.get("/api/contracts/:id/review-pdf"');
    const reviewPdfRouteEnd = server.indexOf(
      'app.get("/api/contracts/:id/final-pdf"',
      reviewPdfRouteStart,
    );
    const reviewPdfRoute = server.slice(reviewPdfRouteStart, reviewPdfRouteEnd);
    const finalPdfRouteStart = server.indexOf('app.get("/api/contracts/:id/final-pdf"');
    const finalPdfRouteEnd = server.indexOf(
      'app.post("/api/contracts/:id/signatures/influencer"',
      finalPdfRouteStart,
    );
    const finalPdfRoute = server.slice(finalPdfRouteStart, finalPdfRouteEnd);
    const contractGetRouteStart = server.indexOf('app.get("/api/contracts/:id"');
    const contractGetRouteEnd = server.indexOf(
      'app.get("/api/contracts/:id/final-pdf"',
      contractGetRouteStart,
    );
    const contractGetRoute = server.slice(contractGetRouteStart, contractGetRouteEnd);
    const finalPdfHrefStart = viewer.indexOf("const finalPdfHref =");
    const finalPdfHrefEnd = viewer.indexOf(
      "const reviewPdfBaseHref",
      finalPdfHrefStart,
    );
    const finalPdfHrefBuilder = viewer.slice(finalPdfHrefStart, finalPdfHrefEnd);
    const contractDocumentPdfStart = server.indexOf("const buildContractDocumentPdf");
    const contractDocumentPdfEnd = server.indexOf(
      "const buildSignedContractPdf",
      contractDocumentPdfStart,
    );
    const contractDocumentPdfBuilder = server.slice(
      contractDocumentPdfStart,
      contractDocumentPdfEnd,
    );
    const signedPdfBuilderStart = server.indexOf("const buildSignedContractPdf");
    const signedPdfBuilderEnd = server.indexOf("const stableUuid", signedPdfBuilderStart);
    const signedPdfBuilder = server.slice(signedPdfBuilderStart, signedPdfBuilderEnd);
    const pdfDownloadStart = viewer.indexOf("const pdfResponse = await fetch(");
    const pdfDownloadEnd = viewer.indexOf("if (!pdfResponse.ok)", pdfDownloadStart);
    const pdfDownloadBlock = viewer.slice(pdfDownloadStart, pdfDownloadEnd);

    assert.notEqual(reviewPdfRouteStart, -1);
    assert.notEqual(reviewPdfRouteEnd, -1);
    assert.notEqual(finalPdfRouteStart, -1);
    assert.notEqual(finalPdfRouteEnd, -1);
    assert.notEqual(contractGetRouteStart, -1);
    assert.notEqual(contractGetRouteEnd, -1);
    assert.notEqual(contractDocumentPdfStart, -1);
    assert.notEqual(contractDocumentPdfEnd, -1);
    assert.notEqual(signedPdfBuilderStart, -1);
    assert.notEqual(signedPdfBuilderEnd, -1);
    assert.match(reviewPdfRoute, /buildContractReviewPdf/);
    assert.match(reviewPdfRoute, /Content-Type", "application\/pdf"/);
    assert.match(contractDocumentPdfBuilder, /계약 개요/);
    assert.match(contractDocumentPdfBuilder, /특약 및 자동 생성 조항/);
    assert.match(reviewPdfRoute, /buildContractReviewPdf/);
    assert.match(server, /const buildContractReviewPdf = async \(contract: Contract\) =>\s*buildContractDocumentPdf\(\{ contract \}\);/);
    assert.match(signedPdfBuilder, /buildContractDocumentPdf\(\{/);
    assert.doesNotMatch(contractDocumentPdfBuilder, /확인 안내/);
    assert.doesNotMatch(contractDocumentPdfBuilder, /Signed Contract/);
    assert.doesNotMatch(reviewPdfRoute, /allowShareToken:\s*false/);
    assert.match(finalPdfRoute, /allowShareToken:\s*false/);
    assert.match(finalPdfRoute, /hasSignedPdfCookieAccess/);
    assert.doesNotMatch(contractGetRoute, /allowShareToken:\s*false/);
    assert.doesNotMatch(finalPdfHrefBuilder, /shareToken/);
    assert.doesNotMatch(pdfDownloadBlock, /X-Yeollock-Share-Token/);
  });

  it("blocks bearer share tokens from influencer review mutations", () => {
    const server = read("server/index.ts");
    const reviewRouteStart = server.indexOf(
      'app.put("/api/contracts/:id"',
    );
    const reviewRouteEnd = server.indexOf(
      'if (isPreview)',
      reviewRouteStart,
    );
    const reviewRoute = server.slice(reviewRouteStart, reviewRouteEnd);

    assert.notEqual(reviewRouteStart, -1);
    assert.notEqual(reviewRouteEnd, -1);
    assert.match(reviewRoute, /allowShareToken:\s*false/);
    assert.match(reviewRoute, /Influencer session is required for contract review changes/);
  });

  it("keeps signed content deliverables behind authenticated server APIs", () => {
    const server = read("server/index.ts");
    const getRouteStart = server.indexOf('app.get("/api/contracts/:id/deliverables"');
    const postRouteStart = server.indexOf('app.post("/api/contracts/:id/deliverables"');
    const patchRouteStart = server.indexOf(
      'app.patch("/api/contracts/:id/deliverables/:deliverableId"',
    );
    const supportRouteStart = server.indexOf(
      'app.post("/api/contracts/:id/support-access-requests"',
    );
    const getRoute = server.slice(getRouteStart, postRouteStart);
    const postRoute = server.slice(postRouteStart, patchRouteStart);
    const patchRoute = server.slice(patchRouteStart, supportRouteStart);

    assert.notEqual(getRouteStart, -1);
    assert.notEqual(postRouteStart, -1);
    assert.notEqual(patchRouteStart, -1);
    assert.match(getRoute, /allowShareToken:\s*false/);
    assert.match(postRoute, /requireInfluencerSession/);
    assert.match(postRoute, /storeDeliverableFile/);
    assert.match(postRoute, /contract_files/);
    assert.match(patchRoute, /requireAdvertiserSession/);
    assert.match(patchRoute, /updateContractDeliverableWorkflow/);
    assert.match(server, /status:\s*"completed"/);
  });

  it("counts orphan deliverable submissions against single matching requirements", () => {
    const server = read("server/index.ts");
    const counterStart = server.indexOf("const countDeliverableUnits =");
    const counterEnd = server.indexOf("const buildDeliverableSummary =", counterStart);
    const counter = server.slice(counterStart, counterEnd);

    assert.notEqual(counterStart, -1);
    assert.notEqual(counterEnd, -1);
    assert.match(counter, /unassignedDeliverables/);
    assert.match(counter, /!deliverable\.requirement_id/);
    assert.match(counter, /unassignedOffset/);
    assert.match(counter, /Math\.min\(quantity, matchingCount\)/);
  });

  it("requires support PDF scope before support operators can download deliverable files", () => {
    const server = read("server/index.ts");
    const routeStart = server.indexOf(
      '"/api/contracts/:id/deliverables/:deliverableId/files/:fileId"',
    );
    const routeEnd = server.indexOf(
      'app.post("/api/contracts/:id/support-access-requests"',
      routeStart,
    );
    const route = server.slice(routeStart, routeEnd);

    assert.notEqual(routeStart, -1);
    assert.notEqual(routeEnd, -1);
    assert.match(route, /does not include private file access/);
    assert.match(route, /deliverable_file_downloaded/);
    assert.match(route, /viewed_pdf/);
  });

  it("locks the post-sign content workflow behind review and close gates", () => {
    const contracts = read("src/domain/contracts.ts");
    const server = read("server/index.ts");
    const advertiserViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const influencerViewer = read("src/pages/influencer/ContractViewer.tsx");
    const dashboard = read("src/pages/marketing/Dashboard.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const reviewRouteStart = server.indexOf(
      'app.patch("/api/contracts/:id/deliverables/:deliverableId"',
    );
    const closeRouteStart = server.indexOf('app.post("/api/contracts/:id/close"');

    assert.notEqual(reviewRouteStart, -1);
    assert.notEqual(closeRouteStart, -1);

    const reviewRoute = server.slice(reviewRouteStart, closeRouteStart);
    const closeRoute = server.slice(closeRouteStart);

    assert.match(contracts, /deliverable_summary\?:/);
    assert.match(reviewRoute, /contract\.status !== "SIGNED"/);
    assert.match(reviewRoute, /Contract must be signed before deliverables can be reviewed/);
    assert.match(closeRoute, /status:\s*"CLOSED"/);
    assert.match(closeRoute, /contract_closed/);
    assert.match(server, /toLegacySupabaseStatus/);
    assert.match(server, /status === "CLOSED" \? "SIGNED" : status/);
    assert.match(advertiserViewer, /window\.confirm/);
    assert.match(advertiserViewer, /isContractSignedOrClosed/);
    assert.match(influencerViewer, /!isContractSignedOrClosed/);
    assert.match(dashboard, /isContractContentSubmitted/);
    assert.match(dashboard, /contract\.deliverable_summary/);
    assert.match(campaignPages, /window\.confirm/);
  });

  it("audits evidence and signed PDF downloads on the server", () => {
    const server = read("server/index.ts");

    assert.match(server, /appendVerificationEvidenceAccessAudit/);
    assert.match(server, /evidence_access_audit/);
    assert.match(server, /Cache-Control", "no-store"/);
    assert.match(server, /signed_pdf_downloaded/);
  });

  it("keeps advertiser contract PDF downloads in the contract detail action area", () => {
    const agents = read("AGENTS.md");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");
    const dashboard = read("src/pages/marketing/Dashboard.tsx");

    assert.match(
      agents,
      /Contract detail pages should expose PDF downloads inside the detail action area/,
    );
    assert.match(
      adminViewer,
      /apiPath\(`\/api\/contracts\/\$\{contract\.id\}\/review-pdf`\)/,
    );
    assert.match(
      adminViewer,
      /contract\.pdf_url \|\| apiPath\(`\/api\/contracts\/\$\{contract\.id\}\/final-pdf`\)/,
    );
    assert.match(adminViewer, /isContractSignedOrClosed\s*\?/);
    assert.match(adminViewer, /contractPdfDownloadName/);
    assert.match(adminViewer, /download=\{contractPdfDownloadName\}/);
    assert.doesNotMatch(dashboard, /review-pdf|final-pdf/);
  });

  it("keeps file limits aligned at 10MB for verification and proof evidence", () => {
    const server = read("server/index.ts");
    const deliverables = read("src/domain/deliverables.ts");
    const advertiserVerification = read("src/pages/marketing/AdvertiserVerification.tsx");
    const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");

    assert.match(server, /const maxVerificationFileSize = 10 \* 1024 \* 1024/);
    assert.match(server, /const maxDeliverableFileSize = maxVerificationFileSize/);
    assert.match(server, /Verification evidence file must be 10MB or smaller/);
    assert.match(server, /Proof file must be 10MB or smaller/);
    assert.match(deliverables, /MAX_DELIVERABLE_FILE_SIZE_BYTES = 10 \* 1024 \* 1024/);
    assert.match(deliverables, /Proof file must be 10MB or smaller/);
    assert.match(advertiserVerification, /MAX_VERIFICATION_FILE_SIZE = 10 \* 1024 \* 1024/);
    assert.match(influencerVerification, /MAX_VERIFICATION_FILE_SIZE = 10 \* 1024 \* 1024/);
    assert.doesNotMatch(advertiserVerification, /4MB/);
    assert.doesNotMatch(influencerVerification, /4MB/);
  });

  it("routes frontend API calls through the API base helper", () => {
    const api = read("src/domain/api.ts");

    assert.match(api, /VITE_API_BASE_URL/);
    assert.match(api, /apiFetch/);

    for (const file of [
      "src/hooks/useVerificationSummary.ts",
      "src/pages/admin/SystemAdminDashboard.tsx",
      "src/pages/auth/SignupPage.tsx",
      "src/pages/influencer/ContractViewer.tsx",
      "src/pages/influencer/InfluencerDashboard.tsx",
      "src/pages/influencer/InfluencerLoginPage.tsx",
      "src/pages/influencer/InfluencerVerification.tsx",
      "src/pages/marketing/AdvertiserAuthGate.tsx",
      "src/pages/marketing/AdvertiserVerification.tsx",
      "src/pages/marketing/ContractAdminViewer.tsx",
      "src/pages/marketing/ContractBuilder.tsx",
      "src/store.ts",
    ]) {
      assert.doesNotMatch(read(file), /fetch\(\s*["'`]\/api/);
    }
  });

  it("moves advertiser login to the destination shell before waiting for authentication response", () => {
    const app = read("src/App.tsx");
    const advertiserAuthGate = read("src/pages/marketing/AdvertiserAuthGate.tsx");
    const loginLanding = read("src/pages/auth/LoginLanding.tsx");
    const fastAuth = read("lib/fast-auth.ts");
    const server = read("server/index.ts");
    const loginStartIndex = advertiserAuthGate.indexOf(
      'const loginPromise = apiFetch("/api/advertiser/login"',
    );
    const optimisticNavigateIndex = advertiserAuthGate.indexOf(
      "navigate(redirectAfterLogin, { replace: true });",
      loginStartIndex,
    );
    const awaitLoginIndex = advertiserAuthGate.indexOf(
      "const response = await loginPromise;",
      loginStartIndex,
    );

    assert.match(app, /<AdvertiserAuthGate redirectAfterLogin=\{nextPath\}>/);
    assert.match(advertiserAuthGate, /useNavigate/);
    assert.match(advertiserAuthGate, /startFastLoginTransition\("advertiser"\)/);
    assert.match(advertiserAuthGate, /prewarmAdvertiserLoginEndpoint/);
    assert.match(advertiserAuthGate, /method: "GET"/);
    assert.match(fastAuth, /warmFastAuthDependencies/);
    assert.match(fastAuth, /request\.method === "GET" \|\| request\.method === "HEAD"/);
    assert.match(fastAuth, /supabaseAuthUrl\("\/settings"\)/);
    assert.match(fastAuth, /supabaseRestUrl\("profiles", "\?select=id&limit=1"\)/);
    assert.ok(loginStartIndex > -1, "advertiser login request should be started");
    assert.ok(
      optimisticNavigateIndex > loginStartIndex &&
        optimisticNavigateIndex < awaitLoginIndex,
      "advertiser login should move to the destination shell before waiting for the API response",
    );
    assert.match(advertiserAuthGate, /if \(!navigatedOptimistically\) \{/);
    assert.match(loginLanding, /const href = next[\s\S]+\? `\$\{role\.href\}\?next=/);
    assert.match(loginLanding, /: role\.href/);

    const fastAuthAdvertiserLogin = fastAuth.slice(
      fastAuth.indexOf("async function handleAdvertiserLogin"),
      fastAuth.indexOf("async function handleInfluencerLogin"),
    );
    assert.doesNotMatch(fastAuthAdvertiserLogin, /readAdvertiserMessageSummary/);
    assert.match(server, /includeMessageSummary: false/);
  });

  it("keeps advertiser marketplace messages focused on sent proposals", () => {
    const inbox = read("src/pages/marketplace/MarketplaceInboxPage.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const server = read("server/index.ts");
    const agents = read("AGENTS.md");

    assert.match(inbox, /role === "advertiser" \? "sent" : "inbox"/);
    assert.match(inbox, /summaryTitle:\s*\(openCount: number\) =>/);
    assert.match(inbox, /`보낸 제안 \$\{openCount\.toLocaleString\(\)\}건이 진행 중입니다`/);
    assert.match(inbox, /primaryBucketLabel: "보낸 제안"/);
    assert.match(inbox, /platformFilterOptions/);
    assert.match(inbox, /제안 종류/);
    assert.doesNotMatch(inbox, /function PlatformPills/);
    assert.doesNotMatch(inbox, /formatPlatformLabel/);
    assert.match(
      inbox,
      /grid-cols-\[104px_minmax\(170px,0\.75fr\)_minmax\(330px,1\.45fr\)_132px_132px\]/,
    );
    assert.match(inbox, /function ProposalSummary/);
    assert.match(server, /addPlatformInfoToMarketplaceProposals/);
    assert.match(server, /marketplace_influencer_channels/);
    assert.match(
      inbox,
      /role === "advertiser"[\s\S]+id: "sent", label: copy\.primaryBucketLabel/,
    );
    assert.match(inbox, /function MessageThreadRow/);
    assert.match(inbox, /function isOneToOneMessageThread/);
    assert.match(inbox, /thread\.direction === "influencer_to_brand"[\s\S]+Boolean\(thread\.campaignId\)/);
    assert.doesNotMatch(inbox, /지원자 목록/);
    assert.doesNotMatch(inbox, /function ApplicantSelectionRow/);
    assert.match(campaignPages, /function AdvertiserCampaignApplicantList/);
    assert.match(campaignPages, /function isCampaignApplicationThread/);
    assert.match(server, /isOneToOneMarketplaceMessageProposal/);
    assert.match(server, /rows\.filter\(isOneToOneMarketplaceMessageProposal\)/);
    assert.match(agents, /Message inboxes are only for 1:1 contract proposals/);
    assert.doesNotMatch(inbox, /function NotificationPanel/);
  });

  it("keeps influencer public profile links on the root handle URL", () => {
    const app = read("src/App.tsx");
    const publicProfile = read("src/domain/publicInfluencerProfile.ts");
    const marketplace = read("src/domain/marketplace.ts");
    const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
    const server = read("server/index.ts");
    const agents = read("AGENTS.md");
    const indexCss = read("src/index.css");
    const platformBrandMark = read("src/components/PlatformBrandMark.tsx");
    const platformDisplay = read("src/domain/platformDisplay.ts");
    const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const influencerPublicProfileSource = marketplacePages.slice(
      marketplacePages.indexOf("export function PublicInfluencerProfilePage"),
      marketplacePages.indexOf("export function PublicBrandProfilePage"),
    );

    assert.match(
      app,
      /<Route path="\/:profileHandle" element=\{<PublicInfluencerProfilePage \/>\} \/>/,
    );
    assert.match(publicProfile, /export function getInfluencerPublicProfilePath/);
    assert.match(publicProfile, /return clean \? `\/\$\{clean\}` : "\/"/);
    assert.match(publicProfile, /export function formatInfluencerPublicProfileUrl/);
    assert.match(publicProfile, /return clean \? `yeollock\.me\/\$\{clean\}` : "yeollock\.me"/);
    assert.match(marketplace, /return `\/\$\{normalizeMarketplaceHandle\(profile\.handle\)\}`/);
    assert.match(server, /getInfluencerPublicProfilePath\(row\.target_handle\)/);
    assert.match(server, /getInfluencerPublicProfilePath\(row\.sender_influencer_handle\)/);
    assert.doesNotMatch(marketplacePages, /yeollock\.me\/\{profile\.handle\}/);
    assert.doesNotMatch(influencerPublicProfileSource, /formatInfluencerPublicProfileUrl/);
    assert.match(agents, /Blue primary CTAs were directly requested by the Product Owner as a product-wide rule/);
    assert.match(indexCss, /--yl-primary: #2563eb/);
    assert.match(influencerPublicProfileSource, /data-profile-layout="creator-media-kit"/);
    assert.match(influencerPublicProfileSource, /getMarketplaceInfluencerAvatarUrl\(profile\)/);
    assert.match(influencerPublicProfileSource, /channelSummaries = profile\.platforms\.slice\(0, 4\)/);
    assert.match(influencerPublicProfileSource, /href=\{platform\.url\}/);
    assert.match(influencerPublicProfileSource, /to="\/advertiser\/discover"/);
    assert.match(influencerPublicProfileSource, /sm:hidden/);
    assert.match(influencerPublicProfileSource, /bg-blue-600/);
    assert.match(influencerPublicProfileSource, /제안하기/);
    assert.match(agents, /first screens should not show money/);
    assert.match(agents, /proposal areas should show only the blue "제안하기" button/);
    assert.match(agents, /account for one, two, three, and four verified platforms/);
    assert.match(
      agents,
      /Remove explanatory labels such as "플랫폼 \/ 팔로워", "팔로워", "구독자", or "이웃"/,
    );
    assert.match(agents, /categories should read as simple premium text/);
    assert.match(influencerPublicProfileSource, /lg:pt-14/);
    assert.doesNotMatch(influencerPublicProfileSource, /profile\.responseTimeLabel/);
    assert.doesNotMatch(influencerPublicProfileSource, /startingPriceLabel/);
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /플랫폼 \/ 팔로워|다른 인플루언서 보기|profile\.location/,
    );
    assert.match(agents, /platform and follower\/subscriber metrics are primary decision data/);
    assert.match(agents, /recognizable official-brand platform marks/);
    assert.match(agents, /shared with dashboard platform pills/);
    assert.match(agents, /extra bordered or white rounded wrapper/);
    assert.match(agents, /around a 28px raw brand mark/);
    assert.match(
      agents,
      /Remove explanatory labels such as/,
    );
    assert.match(agents, /visually bind the platform name\/logo to its audience number/);
    assert.match(agents, /tall `justify-between` stat tiles/);
    assert.match(agents, /On mobile only, render each verified platform as one horizontal row/);
    assert.match(agents, /On desktop, keep the platform area block-like/);
    assert.match(agents, /upper profile action area/);
    assert.match(agents, /larger representative channel blocks/);
    assert.match(agents, /one platform uses the full strip/);
    assert.match(agents, /two platforms split the strip evenly/);
    assert.match(agents, /existing compact external-link icon/);
    assert.match(agents, /Do not show a text tooltip or visible text button/);
    assert.match(agents, /image bezels should stay present but restrained/);
    assert.match(agents, /hiding nonessential handles/);
    assert.match(platformBrandMark, /export function PlatformBrandMark/);
    assert.doesNotMatch(platformBrandMark, /export function getPlatformDisplayName/);
    assert.match(platformDisplay, /export function getPlatformDisplayName/);
    assert.match(platformBrandMark, /md: "h-7 w-7"/);
    assert.doesNotMatch(platformBrandMark, /border border-neutral-200 bg-white/);
    assert.match(platformDisplay, /platform === "instagram"/);
    assert.match(platformDisplay, /platform === "naver_blog"/);
    assert.match(marketplacePages, /from "\.\.\/\.\.\/components\/PlatformBrandMark"/);
    assert.match(marketplacePages, /from "\.\.\/\.\.\/domain\/platformDisplay"/);
    assert.match(influencerPublicProfileSource, /PlatformBrandMark platform=\{platform\.platform\}/);
    assert.match(influencerPublicProfileSource, /getPlatformDisplayName\(platform\.platform\)/);
    assert.match(influencerPublicProfileSource, /platformCount === 1/);
    assert.match(influencerPublicProfileSource, /platformCount === 2/);
    assert.match(influencerPublicProfileSource, /platformCount === 3/);
    assert.match(influencerPublicProfileSource, /hasFeaturedPlatformLayout = platformCount <= 2/);
    assert.match(influencerPublicProfileSource, /grid-cols-\[minmax\(0,1fr\)_auto_auto\]/);
    assert.match(influencerPublicProfileSource, /lg:grid-cols-\[minmax\(0,1fr\)_156px\]/);
    assert.match(influencerPublicProfileSource, /lg:grid-cols-\[minmax\(0,1fr\)\]/);
    assert.match(influencerPublicProfileSource, /lg:grid-cols-\[repeat\(2,minmax\(0,1fr\)\)\]/);
    assert.match(influencerPublicProfileSource, /lg:grid-cols-\[repeat\(3,minmax\(150px,1fr\)\)\]/);
    assert.match(influencerPublicProfileSource, /lg:grid-cols-\[repeat\(4,minmax\(116px,1fr\)\)\]/);
    assert.match(influencerPublicProfileSource, /lg:gap-x-5/);
    assert.match(influencerPublicProfileSource, /lg:flex lg:flex-col/);
    assert.match(influencerPublicProfileSource, /lg:min-h-\[118px\]/);
    assert.match(influencerPublicProfileSource, /lg:items-center lg:justify-center/);
    assert.match(influencerPublicProfileSource, /lg:text-\[48px\]/);
    assert.match(influencerPublicProfileSource, /lg:inline-flex/);
    assert.match(influencerPublicProfileSource, /lg:hidden/);
    assert.match(influencerPublicProfileSource, /ExternalLink/);
    assert.match(influencerPublicProfileSource, /h-\[200px\]/);
    assert.match(influencerPublicProfileSource, /p-1\.5 sm:p-2\.5/);
    assert.match(influencerPublicProfileSource, /text-\[22px\]/);
    assert.match(influencerPublicProfileSource, /sm:text-\[24px\]/);
    assert.match(influencerPublicProfileSource, /lg:mt-3/);
    assert.match(influencerPublicProfileSource, /lg:text-\[36px\]/);
    assert.match(influencerPublicProfileSource, /lg:absolute lg:right-0 lg:top-0/);
    assert.doesNotMatch(influencerPublicProfileSource, /인플루언서 계정으로 이동/);
    assert.doesNotMatch(influencerPublicProfileSource, /group-hover:opacity-100/);
    assert.doesNotMatch(influencerPublicProfileSource, /group-focus-visible:opacity-100/);
    assert.doesNotMatch(influencerPublicProfileSource, />계정 보기</);
    assert.doesNotMatch(influencerPublicProfileSource, /연결하기/);
    assert.doesNotMatch(influencerPublicProfileSource, /p-3 sm:p-5/);
    assert.doesNotMatch(influencerPublicProfileSource, /flex-col justify-between/);
    assert.doesNotMatch(influencerPublicProfileSource, /hidden truncate text-\[13px\]/);
    assert.doesNotMatch(influencerPublicProfileSource, /getPlatformAudienceMetricLabel/);
    assert.doesNotMatch(influencerPublicProfileSource, /getPlatformIcon\(platform\.platform/);
    assert.doesNotMatch(influencerPublicProfileSource, /text-\[32px\]|text-\[42px\]/);
    assert.doesNotMatch(influencerPublicProfileSource, /lg:grid-cols-\[minmax\(0,1fr\)_184px\]/);
    assert.doesNotMatch(influencerPublicProfileSource, /lg:w-\[184px\]/);
    assert.doesNotMatch(influencerPublicProfileSource, /lg:grid-cols-\[minmax\(220px,260px\)\]/);
    assert.doesNotMatch(influencerPublicProfileSource, /lg:max-w-\[520px\]/);
    assert.match(
      influencerPublicProfileSource,
      /aria-label=\{`\$\{getPlatformDisplayName\(platform\.platform\)\} \$\{platform\.handle\}/,
    );
    assert.match(agents, /proposal panels must not stretch into tall empty cards/);
    assert.match(agents, /polished creator media-kit first page/);
    assert.match(agents, /awkward stretched CTAs/);
    assert.match(agents, /Desktop proposal CTAs should be separated into the upper profile action area/);
    assert.match(influencerPublicProfileSource, /data-profile-platform-strip/);
    assert.match(influencerPublicProfileSource, /lg:grid-cols-\[minmax\(0,1fr\)_156px\]/);
    assert.match(influencerPublicProfileSource, /w-\[156px\]/);
    assert.match(influencerPublicProfileSource, /lg:inline-flex/);
    assert.match(influencerPublicProfileSource, /lg:hidden/);
    assert.match(influencerPublicProfileSource, /min-h-\[52px\]/);
    assert.doesNotMatch(influencerPublicProfileSource, /lg:grid-cols-\[minmax\(0,1fr\)_184px\]/);
    assert.doesNotMatch(influencerPublicProfileSource, /lg:w-\[184px\]/);
    assert.match(influencerPublicProfileSource, /rounded-\[28px\]/);
    assert.match(advertiserDashboard, /from "\.\.\/\.\.\/components\/PlatformBrandMark"/);
    assert.match(advertiserDashboard, /<PlatformBrandMark platform="youtube" size="sm" \/>/);
    assert.match(advertiserDashboard, /<PlatformBrandMark platform="instagram" size="sm" \/>/);
    assert.match(agents, /Dashboard platform columns should show platform logos only/);
    assert.match(advertiserDashboard, /aria-label=\{`플랫폼 \$\{items\.map\(\(item\) => item\.title\)\.join\(", "\)\}`\}/);
    assert.match(advertiserDashboard, /function CampaignPlatformMarks/);
    assert.match(advertiserDashboard, /<CampaignPlatformMarks platforms=\{campaign\.platforms\} title=\{platformLabel\} \/>/);
    assert.doesNotMatch(advertiserDashboard, />\{item\.label\}<\/span>/);
    assert.match(campaignPages, /from "\.\.\/\.\.\/components\/PlatformBrandMark"/);
    assert.match(campaignPages, /from "\.\.\/\.\.\/domain\/platformDisplay"/);
    assert.match(campaignPages, /<PlatformBrandMark platform=\{item\.platform\} size="sm" \/>/);
    assert.match(campaignPages, /getPlatformDisplayName\(item\.platform\)/);
    assert.match(campaignPages, /const text = item\.followersLabel;/);
    assert.match(
      campaignPages,
      /inline-flex min-w-0 shrink items-center gap-1\.5 text-\[11px\] font-extrabold text-neutral-800/,
    );
    assert.match(
      marketplacePages,
      /inline-flex max-w-full items-center gap-1\.5 text-\[12px\] font-extrabold/,
    );
    assert.doesNotMatch(
      influencerPublicProfileSource,
      /대표 콘텐츠|플랫폼 \/ 팔로워|다른 인플루언서 보기|profile\.location|portfolioItems|profile\.portfolio|ProfileInfoRow/,
    );
  });

  it("derives influencer public profile handles from the first registered platform outside the dashboard strip", () => {
    const publicProfile = read("src/domain/publicInfluencerProfile.ts");
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260514012437_allow_dot_in_influencer_public_handles.sql",
    );

    assert.match(publicProfile, /export function getAutomaticPublicProfileHandle/);
    assert.match(publicProfile, /const firstPlatformHandle = platforms\?\.\[0\]\?\.handle/);
    assert.match(publicProfile, /handle: defaults\.handle/);
    assert.match(publicProfile, /\[a-z0-9_\.-\]/);
    assert.match(server, /const automaticHandle = getAutomaticPublicProfileHandle\(approvedPlatforms\) \?\? ""/);
    assert.match(server, /buildApprovedInfluencerPlatforms\(verificationRequests\)/);
    assert.match(server, /parseDateAscending\(a\.created_at, b\.created_at\)/);
    assert.doesNotMatch(server, /normalizePublicProfileHandle\(normalizeRequiredText\(body\.handle\)\)/);
    assert.match(migration, /drop constraint if exists marketplace_influencer_profiles_handle_format/);
    assert.match(migration, /order by owner_profile_id, created_at asc/);
  });

  it("opens manual influencer public handles only after conflicts and queues appeals", () => {
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const server = read("server/index.ts");

    assert.match(server, /findInfluencerPublicHandleConflict/);
    assert.match(server, /code: "public_profile_handle_conflict"/);
    assert.match(server, /body\.alternateHandle/);
    assert.doesNotMatch(server, /body\.handle/);
    assert.match(server, /app\.post\("\/api\/influencer\/public-profile\/handle-appeal"/);
    assert.match(server, /request_type: "public_profile_handle_claim"/);
    assert.match(adminDashboard, /public_profile_handle_claim/);
    assert.match(adminDashboard, /공개 주소 소유권 이의신청/);
  });

  it("starts generated clauses as pending review and moves influencer signing through PDF review", () => {
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");

    assert.match(builder, /status:\s*"PENDING_REVIEW"/);
    assert.match(builder, /influencerContact[\s\S]+서명 계정 확인/);
    assert.match(viewer, /shouldShowPdfReview/);
    assert.match(viewer, /function PdfContractPreview/);
    assert.match(viewer, /pdfjsLib\.getDocument/);
    assert.match(viewer, /aria-label="계약서 PDF 1페이지 미리보기"/);
    assert.match(viewer, /PDF 계약서와 계정 인증이 확인되어 서명할 수 있습니다/);
    assert.doesNotMatch(viewer, /checkedClauseIdsByContract/);
    assert.doesNotMatch(viewer, /toggleClauseConfirmation/);
    assert.doesNotMatch(viewer, /확인 체크/);
    assert.doesNotMatch(viewer, /계약서 조항을 모두 체크하면 서명할 수 있습니다/);
    assert.doesNotMatch(viewer, /canSubmitClauseReview/);
    assert.doesNotMatch(viewer, /const approveClause = \(/);
    assert.doesNotMatch(viewer, /이 조항 승인/);
    assert.match(adminViewer, /검토 대기/);
  });

  it("keeps public auth and signature evidence server-authored", () => {
    const server = read("server/index.ts");
    const legalConsent = read("src/domain/legalConsent.ts");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");
    const signRouteStart = server.indexOf(
      'app.post("/api/contracts/:id/signatures/influencer"',
    );
    const signRouteEnd = server.indexOf('app.put("/api/contracts/:id"', signRouteStart);
    const signRoute = server.slice(signRouteStart, signRouteEnd);
    const authHeadersStart = server.indexOf("const supabaseAuthHeaders");
    const authHeadersEnd = server.indexOf("const supabaseStorageHeaders", authHeadersStart);
    const authHeaders = server.slice(authHeadersStart, authHeadersEnd);

    assert.match(server, /Production requires Supabase/);
    assert.match(server, /Production requires SUPABASE_PUBLISHABLE_KEY/);
    assert.match(server, /app\.set\("trust proxy", isHostedRuntime \? 1 : false\)/);
    assert.match(authHeaders, /const key = supabasePublishableKey/);
    assert.doesNotMatch(authHeaders, /supabaseServiceRoleKey/);
    assert.match(legalConsent, /SIGNATURE_CONSENT_TEXT/);
    assert.match(legalConsent, /directsign-signature-consent-v2/);
    assert.match(legalConsent, /전자서명 안내 문서를 확인했고 전자서명에 동의합니다/);
    assert.match(server, /const signatureConsentText\s*=\s*SIGNATURE_CONSENT_TEXT/);
    assert.match(viewer, /SIGNATURE_CONSENT_TEXT/);
    assert.match(viewer, /\/legal\/e-sign-consent/);
    assert.match(server, /setSignedPdfAccessCookie\(response, updatedContract\)/);
    assert.match(signRoute, /share_token_status:\s*"revoked"/);
    assert.doesNotMatch(signRoute, /request\.body\?\.consent_text/);
    assert.match(server, /buildServerAuthoredContract/);
  });

  it("server-authors advertiser trust and surfaces only a compact verification badge", () => {
    const server = read("server/index.ts");
    const contracts = read("src/domain/contracts.ts");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");

    assert.match(contracts, /advertiser_trust/);
    assert.match(server, /buildAdvertiserTrustSnapshot/);
    assert.match(server, /first_contract_on_yeollock/);
    assert.match(server, /Advertiser trust metadata cannot be changed by influencer/);
    assert.match(viewer, /BusinessVerificationBadge/);
    assert.match(viewer, /사업자 인증 완료/);
    assert.doesNotMatch(viewer, /AdvertiserTrustNotice/);
    assert.doesNotMatch(viewer, /위험점수/);
  });

  it("keeps legacy share token decrypt warnings opt-in and deduplicated", () => {
    const server = read("server/index.ts");
    const decryptStart = server.indexOf("const decryptShareTokenFromLegacyStore");
    const decryptEnd = server.indexOf("const normalizeContract", decryptStart);
    const decryptBlock = server.slice(decryptStart, decryptEnd);

    assert.match(server, /DIRECTSIGN_LOG_LEGACY_TOKEN_DECRYPT_WARNINGS/);
    assert.match(server, /loggedLegacyShareTokenDecryptFailures/);
    assert.match(server, /maxLoggedLegacyShareTokenDecryptFailures/);
    assert.match(decryptBlock, /if \(logLegacyShareTokenDecryptWarnings\)/);
    assert.match(decryptBlock, /createHash\("sha256"\)\.update\(value\)/);
    assert.match(decryptBlock, /console\.warn\(`/);
    assert.doesNotMatch(
      decryptBlock,
      /console\.warn\("\[yeollock\.me\] failed to decrypt legacy share token"\)/,
    );
  });

  it("rejects unsafe external contract URLs before they reach user-facing links", () => {
    const server = read("server/index.ts");
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");

    assert.match(server, /Influencer channel URL must be an http\(s\) URL/);
    assert.match(server, /Tracking link must be an http\(s\) URL/);
    assert.match(builder, /메인 채널 URL은 http 또는 https 주소여야 합니다/);
    assert.match(builder, /추적 링크는 http 또는 https 주소만 입력할 수 있습니다/);
    assert.match(adminViewer, /getSafeExternalHref/);
    assert.match(adminViewer, /safeInfluencerHref/);
  });

  it("allows free individual operation without business registration disclosure", () => {
    const legalEntity = read("src/domain/legalEntity.ts");
    const legalPage = read("src/pages/legal/LegalDocumentPage.tsx");
    const envExample = read(".env.example");
    const launchReadiness = read("docs/launch-readiness.md");
    const ownerMemo = read("docs/owner-action-memo.md");

    assert.match(envExample, /VITE_LEGAL_OPERATING_MODE="free_individual"/);
    assert.match(legalEntity, /"free_individual"/);
    assert.match(legalEntity, /"registered_business"/);
    assert.match(legalEntity, /해당 없음\(무료 개인 운영\)/);
    assert.match(legalEntity, /required: isRegisteredBusiness/);
    assert.match(
      launchReadiness,
      /operator personal\/business fields can remain\s+blank during development, QA, and early validation/,
    );
    assert.match(ownerMemo, /free_individual[\s\S]+공개 문의 이메일 중심/);
    assert.doesNotMatch(legalPage, /출시 전 입력 필요/);
    assert.doesNotMatch(legalPage, /미설정/);
    assert.doesNotMatch(launchReadiness, /출시 전 입력 필요/);
    assert.doesNotMatch(launchReadiness, /REAL_OPERATOR_NAME/);
    assert.doesNotMatch(ownerMemo, /출시 전 입력 필요/);
    assert.doesNotMatch(ownerMemo, /REAL_OPERATOR_NAME/);
  });

  it("discloses that free signup and usage can later become paid", () => {
    const legalPage = read("src/pages/legal/LegalDocumentPage.tsx");
    const signupPage = read("src/pages/auth/SignupPage.tsx");
    const server = read("server/index.ts");

    assert.match(server, /const signupTermsVersion = "2026-06-02"/);
    assert.match(server, /const signupPrivacyPolicyVersion = "2026-06-02"/);
    assert.match(signupPage, /const TERMS_DOCUMENT_VERSION = "2026-06-02"/);
    assert.match(signupPage, /const PRIVACY_POLICY_DOCUMENT_VERSION = "2026-06-02"/);
    assert.match(signupPage, /LEGAL_CONTACT_EMAIL/);
    assert.match(signupPage, /동의 일시와 문서 버전이 저장됩니다/);
    assert.match(signupPage, /현재 가입과 기본 서비스 이용은 무료입니다/);
    assert.match(signupPage, /향후 일부 또는 전체\s+기능이 유료로 전환될 수 있으며/);
    assert.match(legalPage, /effectiveDate: "2026-06-02"/);
    assert.match(legalPage, /향후 일부 또는 전체 기능이 유료로 전환될 수 있으며/);
    assert.match(legalPage, /전환 전 별도 고지/);
    assert.match(legalPage, /처리위탁 및 국외 처리/);
    assert.match(legalPage, /Vercel\(호스팅·서버 실행\)/);
    assert.match(legalPage, /Supabase\(인증·데이터베이스·스토리지\)/);
    assert.match(legalPage, /계약 본문, 공유 토큰, 전자서명, 사업자 증빙, 운영자 화면/);
    assert.match(legalPage, /전자적 형태라는 이유만으로 효력이 부인되지/);
    assert.match(legalPage, /별도 서면, 공증, 인감, 원본 제출/);
  });

  it("keeps verification automation optional until provider registration", () => {
    const server = read("server/index.ts");
    const envExample = read(".env.example");
    const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");

    assert.match(envExample, /NTS_BUSINESS_STATUS_API_KEY=""/);
    assert.match(envExample, /NTS_BUSINESS_VALIDATE_API_KEY=""/);
    assert.match(envExample, /VERIFICATION_AUTO_APPROVE_BUSINESS="false"/);
    assert.match(envExample, /VERIFICATION_AUTO_APPROVE_PLATFORM="false"/);
    assert.match(envExample, /YOUTUBE_DATA_API_KEY=""/);
    assert.match(envExample, /NAVER_CLIENT_ID=""/);
    assert.match(envExample, /TIKTOK_CLIENT_KEY=""/);
    assert.match(envExample, /TIKTOK_ACCOUNT_ACCESS_TOKEN=""/);
    assert.match(envExample, /META_APP_ID=""/);
    assert.match(envExample, /META_GRAPH_ACCESS_TOKEN=""/);
    assert.match(envExample, /META_WEBHOOK_VERIFY_TOKEN=""/);
    assert.match(envExample, /VITE_INSTAGRAM_OFFICIAL_HANDLE="yeollockme"/);
    assert.match(server, /runBusinessRegistrationAutomationCheck/);
    assert.match(server, /buildVerificationAutomationPlan/);
    assert.match(server, /runPlatformAccountAutomationCheck/);
    assert.match(server, /extractNaverBlogId/);
    assert.match(server, /parseYoutubeVideoId/);
    assert.match(server, /fetchYoutubeVideoForProof/);
    assert.match(server, /https:\/\/www\.googleapis\.com\/youtube\/v3\/videos/);
    assert.match(server, /proof_video_channel_matched/);
    assert.match(server, /video\.snippet\.description/);
    assert.match(server, /Instagram 공개 증빙 URL/);
    assert.match(server, /TikTok 공개 증빙 URL/);
    assert.match(server, /proof_source/);
    assert.match(server, /\/api\/admin\/verification-requests\/:id\/automation-check/);
    assert.match(server, /\/api\/webhooks\/instagram/);
    assert.match(server, /business_start_date/);
    assert.match(server, /VERIFICATION_AUTO_APPROVE_BUSINESS/);
    assert.match(server, /VERIFICATION_AUTO_APPROVE_PLATFORM/);
    assert.match(server, /status: "not_configured"/);
    assert.match(server, /provider: "youtube_data_api"/);
    assert.match(server, /provider: "tiktok_login_kit"/);
    assert.match(server, /provider: "instagram_messaging_webhook"/);
    assert.match(server, /"instagram_dm_code"/);
    assert.match(server, /runInstagramDmManualCheck/);
    assert.match(server, /business_registration: businessAutomationCheck/);
    assert.match(server, /platform_account: platformAutomationCheck/);
    assert.match(influencerVerification, /Instagram DM 인증/);
    assert.match(influencerVerification, /OFFICIAL_INSTAGRAM_HANDLE/);
    assert.match(adminDashboard, /Instagram DM 수동 확인/);
  });

  it("keeps Kim Jaewoo UI guardrails aligned with rendered copy", () => {
    const agents = read("AGENTS.md");
    const landing = read("src/pages/landing/LandingPages.tsx");
    const qaStandard = read("scripts/qa-standard.mjs");
    const kimGuardrails = read("scripts/kim-jaewoo-guardrails.mjs");
    const captureSalesAssets = read("scripts/capture-sales-assets.mjs");
    const authLoginScreen = read("src/components/AuthLoginScreen.tsx");
    const advertiserVerification = read("src/pages/marketing/AdvertiserVerification.tsx");
    const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");
    const seedAccounts = read("scripts/seed-test-accounts.mjs");
    const server = read("server/index.ts");
    const dashboardSurfaceSwitch = read("src/components/DashboardSurfaceSwitch.tsx");
    const mobileSurfaceSwitch = read("src/components/MobileSurfaceSwitch.tsx");
    const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
    const influencerDashboard = read("src/pages/influencer/InfluencerDashboard.tsx");
    const campaignPages = read("src/pages/marketplace/CampaignPages.tsx");
    const marketplacePages = read("src/pages/marketplace/MarketplacePages.tsx");
    const app = read("src/App.tsx");
    const marketplaceDomain = read("src/domain/marketplace.ts");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const marketplace = read("src/pages/marketplace/MarketplacePages.tsx");
    const supportersCampaignMigration = read(
      "supabase/migrations/20260526093000_allow_supporters_campaign_type.sql",
    );

    assert.match(agents, /Kim Jaewoo Agent must be strict/);
    assert.match(agents, /Repeated Product Owner corrections must become executable guardrails/);
    assert.match(agents, /Mobile customer-facing list surfaces must keep every row\/card reachable/);
    assert.match(agents, /Dashboard cells must not show raw placeholder values/);
    assert.match(agents, /External analytics must never expose contract share tokens/);
    assert.equal(
      packageJson.scripts?.["guardrails:kim"],
      "node scripts/kim-jaewoo-guardrails.mjs",
    );
    assert.match(qaStandard, /guardrails:kim/);
    assert.match(kimGuardrails, /캠페인 목록/);
    assert.match(kimGuardrails, /공유 가능/);
    assert.match(kimGuardrails, /influencer account strip shows verified accounts directly/);
    assert.match(kimGuardrails, /influencer verification approved state is shown in one place/);
    assert.match(kimGuardrails, /advertiser verification approved state is shown in one place/);
    assert.match(kimGuardrails, /disabled auth CTA is visibly disabled/);
    assert.match(kimGuardrails, /fallback titles stay contract-centered/);
    assert.match(kimGuardrails, /row titles stay contract-centered/);
    assert.match(kimGuardrails, /live stale settlement titles are normalized/);
    assert.match(kimGuardrails, /mobile contract and campaign surfaces are explicit/);
    assert.match(kimGuardrails, /advertiser campaign tab opens dashboard before creation/);
    assert.match(kimGuardrails, /mobile influencer campaign lists are scrollable/);
    assert.match(kimGuardrails, /advertiser campaign dashboard avoids placeholder campaign values/);
    assert.match(kimGuardrails, /advertiser campaign dashboard date formatter returns D-day before date/);
    assert.match(kimGuardrails, /advertiser campaign dashboard urgent D-day segment is red/);
    assert.match(kimGuardrails, /influencer dashboard date formatter returns D-day before date/);
    assert.match(kimGuardrails, /influencer dashboard urgent D-day segment is red/);
    assert.match(kimGuardrails, /test advertiser campaign dashboard seed covers varied lifecycle cases/);
    assert.match(kimGuardrails, /supporters campaign type creates product-mission contract guardrails/);
    assert.match(kimGuardrails, /signup consent records version and operation contact/);
    assert.match(kimGuardrails, /signature consent copy is shared between UI and server/);
    assert.match(kimGuardrails, /support access consent is enforced server-side and linked from both parties/);
    assert.match(kimGuardrails, /analytics tracking avoids sensitive contract data/);
    assert.match(kimGuardrails, /public marketplace cache falls back after cold Supabase timeout/);
    assert.match(kimGuardrails, /cache optimization keeps public and sensitive data separated/);
    assert.match(kimGuardrails, /advertiser contract detail keeps one state-specific PDF download action/);
    assert.match(kimGuardrails, /public route error recovery does not force login/);
    assert.match(kimGuardrails, /mobile advertiser header avoids duplicate surface label/);
    assert.match(kimGuardrails, /mobile influencer header avoids duplicate surface label/);
    assert.match(kimGuardrails, /influencer mobile rows do not repeat deadline values/);
    assert.match(kimGuardrails, /OpenDesign is a separate local daemon\/web app workflow/);
    assert.match(kimGuardrails, /mobile clipped list corrections are recorded/);
    assert.match(kimGuardrails, /paired advertiser\/influencer dashboard rule is recorded/);
    assert.match(kimGuardrails, /dashboard and inbox column headers stay stronger than filters/);
    assert.match(agents, /Table and list headers are navigation anchors, not helper text/);
    assert.match(kimGuardrails, /first role selection uses action buttons/);
    assert.match(kimGuardrails, /mobile main role title stays compact/);
    assert.match(kimGuardrails, /advertiser creator discovery and applicant selection support follower sorting/);
    assert.match(kimGuardrails, /advertiser sales PDF campaign applicant capture feels full/);
    assert.match(kimGuardrails, /intro pages use the PDF proposal slide frame/);
    assert.match(agents, /sales\/PDF proposal flow as a manual carousel/);
    assert.match(agents, /subtle left\/right controls/);
    assert.match(agents, /same PDF slide-page composition/);
    assert.match(agents, /Do not duplicate the PDF's internal brand\/header/);
    assert.match(agents, /do not place the intro content inside a white\/card-like screen wrapper/);
    assert.match(agents, /brand marks and brand text should stay black\/neutral/);
    assert.match(landing, /const advertiserProposalSlides/);
    assert.match(landing, /const influencerProposalSlides/);
    assert.match(landing, /function ProposalIntroCarousel/);
    assert.match(landing, /광고주 PDF 제안서형 인트로 슬라이드/);
    assert.match(landing, /인플루언서 PDF 제안서형 인트로 슬라이드/);
    assert.match(landing, /data-intro-pdf-carousel/);
    assert.match(landing, /data-intro-pdf-slide/);
    assert.doesNotMatch(landing, /shadow-\[0_28px_86px/);
    assert.doesNotMatch(landing, /linear-gradient\(112deg,transparent_0_61%/);
    assert.doesNotMatch(landing, /pointer-events-none absolute inset-3/);
    assert.doesNotMatch(landing, /yl-primary-action inline-flex h-\[34px\]/);
    assert.match(landing, /inline-flex h-9 items-center gap-3 border-0 bg-transparent text-neutral-950 shadow-none/);
    assert.doesNotMatch(landing, /function ProposalSlideBrand/);
    assert.doesNotMatch(landing, /<ProposalSlideBrand/);
    assert.match(landing, /aria-label=\{`이전 \$\{controlLabel\}`\}/);
    assert.match(landing, /aria-label=\{`다음 \$\{controlLabel\}`\}/);
    assert.match(landing, /yeollock-contract-builder-first-screen\.png/);
    assert.match(landing, /yeollock-influencer-contract\.png/);
    assert.match(landing, /yeollock-contract-content-review\.png/);
    assert.match(landing, /yeollock-contract-handshake\.png/);
    assert.match(landing, /yeollock-campaign-applicants-dashboard\.png/);
    assert.match(qaStandard, /광고비 먹튀/);
    assert.match(qaStandard, /협찬품 미반환/);
    assert.doesNotMatch(
      qaStandard,
      /requiredText: \["계약 흐름을", "한눈에 관리", "작성중", "진행중", "종료"\]/,
    );
    assert.match(agents, /choose the campaign with the most visible selectable influencer rows first/);
    assert.match(agents, /12 or more applicants for proposal captures/);
    assert.match(agents, /not zooming or enlarging the screenshot/);
    assert.match(seedAccounts, /applicantCount: 12/);
    assert.match(captureSalesAssets, /openCount: 0/);
    assert.match(captureSalesAssets, /activeOpenCount: 0/);
    assert.match(captureSalesAssets, /\{ width: 1440, height: 1250 \}/);
    assert.match(captureSalesAssets, /fillCampaignApplicantsForSalesCapture/);
    assert.match(captureSalesAssets, /rows\.length < 12/);
    assert.match(captureSalesAssets, /count \+ "명 표시 · 전체 " \+ count \+ "명"/);
    assert.match(captureSalesAssets, /b\.count - a\.count/);
    assert.match(captureSalesAssets, /b\.openCount - a\.openCount/);
    assert.match(captureSalesAssets, /b\.activeOpenCount - a\.activeOpenCount/);
    assert.match(landing, /data-start-role-action/);
    assert.match(landing, /min-h-\[248px\]/);
    assert.match(landing, /text-\[36px\] leading-none tracking-normal text-neutral-950 sm:text-\[47px\]/);
    assert.match(landing, /mt-auto block min-w-0/);
    assert.match(landing, /mt-3 block border-t/);
    assert.match(landing, /브랜드 · 광고대행사 · 쇼핑몰 · 로컬매장/);
    assert.match(landing, /크리에이터 · 유튜버 · 틱톡커 · 블로거 · 스트리머/);
    assert.match(app, /data-signup-role-action/);
    assert.doesNotMatch(
      app,
      /광고 계약을 만들 광고주인지, 받은 계약을 검토할 인플루언서인지 선택해 주세요/,
    );
    assert.match(mobileSurfaceSwitch, /data-mobile-surface-switch/);
    assert.match(mobileSurfaceSwitch, /\/advertiser\/campaigns/);
    assert.match(mobileSurfaceSwitch, /\/influencer\/campaigns/);
    assert.match(dashboardSurfaceSwitch, /data-dashboard-surface-switch/);
    assert.match(dashboardSurfaceSwitch, /data-dashboard-surface-active/);
    assert.match(dashboardSurfaceSwitch, /인플루언서 대시보드 전환/);
    assert.match(dashboardSurfaceSwitch, /href: "\/influencer\/dashboard"/);
    assert.match(dashboardSurfaceSwitch, /href: "\/influencer\/campaigns"/);
    assert.match(advertiserDashboard, /<DashboardSurfaceSwitch role="advertiser" active=\{surface\} \/>/);
    assert.match(influencerDashboard, /<DashboardSurfaceSwitch role="influencer" active="contracts" \/>/);
    assert.match(campaignPages, /<DashboardSurfaceSwitch role=\{role\} active="campaigns" \/>/);
    assert.match(kimGuardrails, /marketplace discovery separates platform and category filters/);
    assert.match(agents, /Platform and category are separate discovery axes/);
    assert.match(agents, /Category chips and filters must use customer-facing Korean labels/);
    assert.match(agents, /channel-size sorting by subscribers\/followers/);
    assert.match(marketplacePages, /const \[categoryFilters, setCategoryFilters\]/);
    assert.match(marketplacePages, /hasAnyCategory\(profile\.categories, categoryFilters\)/);
    assert.match(marketplacePages, /function getCategoryFilterKey/);
    assert.match(marketplacePages, /const categoryDisplayLabels/);
    assert.match(marketplacePages, /function CategoryChecklist/);
    assert.match(marketplacePages, /<CategoryChecklist/);
    assert.match(marketplacePages, /values=\{categoryFilters\}/);
    assert.match(marketplacePages, /function InfluencerSortSelect/);
    assert.match(marketplacePages, /audience_desc/);
    assert.match(marketplacePages, /compareInfluencerProfilesBySort/);
    assert.match(marketplacePages, /구독자·팔로워 많은순/);
    assert.match(marketplaceDomain, /function getChannelAudienceSortValue/);
    assert.match(marketplaceDomain, /function compareChannelAudienceValues/);
    assert.match(campaignPages, /function CategoryCheckboxList/);
    assert.match(campaignPages, /<CategoryCheckboxList/);
    assert.match(app, /path="\/advertiser\/campaigns"/);
    assert.match(app, /<Dashboard surface="campaigns" \/>/);
    assert.match(app, /path="\/advertiser\/campaigns\/new"/);
    assert.match(app, /function isPrivateApplicationPath/);
    assert.match(app, /import \{ LegalDocumentPage \} from "\.\/pages\/legal\/LegalDocumentPage"/);
    assert.match(app, /label: "처음으로 이동"/);
    assert.match(app, /recoveryHref=\{routeErrorRecovery\.href\}/);
    assert.match(qaStandard, /"\/advertiser\/campaigns\/new"/);
    assert.match(qaStandard, /hasRouteErrorBoundary/);
    assert.match(advertiserDashboard, /to="\/advertiser\/campaigns\/new"/);
    assert.match(campaignPages, /backHref="\/advertiser\/campaigns"/);
    assert.doesNotMatch(campaignPages, /받은 계약/);
    assert.match(marketplaceDomain, /\| "supporters"/);
    assert.match(marketplaceDomain, /supporters: "서포터즈"/);
    assert.match(campaignPages, /제품 제공\(소비자가 89,000원 상당\)/);
    assert.match(marketplace, /campaignProposalTypeOptions/);
    assert.match(server, /campaign_supporters_resale_ban/);
    assert.match(server, /서포터즈 활동 자격은 자동 박탈/);
    assert.match(server, /campaign_supporters_posting_mission/);
    assert.match(server, /미션 불이행/);
    assert.match(supportersCampaignMigration, /'supporters'/);
    assert.match(seedAccounts, /type: "supporters"/);
    assert.match(server, /fallbackMarketplaceCampaignPosts/);
    assert.match(server, /public marketplace cache cold fallback/);
    assert.match(server, /publicMarketplaceCache\.delete\(key\)/);
    assert.match(server, /process\.env\.VERCEL === "1"/);
    assert.match(campaignPages, /data-campaign-scroll-region="open"/);
    assert.match(campaignPages, /sm:flex-row sm:items-center sm:justify-between/);
    assert.match(campaignPages, /grid min-w-0 flex-1 grid-cols-2/);
    assert.match(campaignPages, /grid min-h-0 flex-1 auto-rows-max/);
    assert.match(qaStandard, /Browser mobile influencer campaigns scroll/);
    assert.match(qaStandard, /filter button overflow/);
    assert.doesNotMatch(advertiserDashboard, /\/미정/);
    assert.doesNotMatch(advertiserDashboard, /명 신청/);
    assert.match(advertiserDashboard, /신청\/모집 인원/);
    assert.match(agents, /Paired advertiser\/influencer dashboard surfaces must keep interaction parity/);
    assert.match(agents, /Campaign applicant middle columns must stay compact and single-line/);
    assert.match(advertiserDashboard, /compareCampaignGroupsBySort/);
    assert.match(advertiserDashboard, /sortKey="participants"/);
    assert.match(advertiserDashboard, /handleCampaignSortChange/);
    assert.match(campaignPages, /function CampaignSortSelect/);
    assert.match(campaignPages, /compareMarketplaceCampaignPostsBySort/);
    assert.match(campaignPages, /compareAppliedCampaignApplicationsBySort/);
    assert.match(campaignPages, /advertiserApplicantSortOptions/);
    assert.match(campaignPages, /function AdvertiserCampaignApplicantControls/);
    assert.match(campaignPages, /compareCampaignApplicantsBySort/);
    assert.match(campaignPages, /ProfileAvatarLink/);
    assert.match(campaignPages, /ariaLabel="지원자 정렬"/);
    assert.match(advertiserDashboard, /APPLICANT_SORT_OPTIONS/);
    assert.match(advertiserDashboard, /compareCampaignApplicantsBySort/);
    assert.match(
      advertiserDashboard,
      /getChannelAudienceSortValue\(getCampaignApplicantDisplayPlatforms\(a\)\)/,
    );
    assert.match(
      campaignPages,
      /getChannelAudienceSortValue\(getCampaignApplicantDisplayPlatforms\(a\)\)/,
    );
    assert.match(advertiserDashboard, /aria-label="지원자 정렬"/);
    assert.match(advertiserDashboard, /controlsId="campaign-applicant-filters"/);
    assert.match(marketplaceDomain, /getInfluencerProfilePathByDisplayName/);
    assert.match(marketplaceDomain, /handle: "creator-sora"/);
    assert.match(marketplaceDomain, /displayName: "크리에이터 소라"/);
    assert.doesNotMatch(marketplacePages, /"creator-sora": "zeu_k"/);
    assert.match(
      advertiserDashboard,
      /findInfluencerProfileByHandle\(thread\.counterpartHref\)/,
    );
    assert.match(
      advertiserDashboard,
      /findInfluencerProfileByDisplayName\(applicantName\)/,
    );
    assert.match(advertiserDashboard, /getCampaignApplicantDisplayPlatforms\(\s*thread,/);
    assert.match(advertiserDashboard, /<ApplicantPlatformLinks platforms=\{displayPlatforms\} \/>/);
    assert.match(advertiserDashboard, /thread\.counterpartCategories/);
    assert.match(advertiserDashboard, /getCampaignApplicantMainCategory\(\s*thread\.counterpartCategories,\s*applicantProfile,/);
    assert.match(advertiserDashboard, /<ApplicantCategoryPill category=\{mainCategory\} \/>/);
    assert.match(advertiserDashboard, /visiblePlatforms\.slice\(0, 1\)/);
    assert.doesNotMatch(advertiserDashboard, /formatCampaignActivityDate\(thread\.createdAt\)/);
    assert.match(
      campaignPages,
      /findInfluencerProfileByHandle\(application\.counterpartHref\)/,
    );
    assert.match(
      campaignPages,
      /findInfluencerProfileByDisplayName\(applicantName\)/,
    );
    assert.match(campaignPages, /getCampaignApplicantDisplayPlatforms\(\s*application,/);
    assert.match(campaignPages, /application\.counterpartCategories/);
    assert.match(campaignPages, /getCampaignApplicantMainCategory\(\s*application\.counterpartCategories,\s*applicantProfile,/);
    assert.match(
      campaignPages,
      /<CampaignApplicantPlatformPills\s+platforms=\{displayPlatforms\}\s+category=\{mainCategory\}\s+\/>/,
    );
    assert.match(campaignPages, /flex-nowrap items-center gap-1 overflow-hidden/);
    assert.match(campaignPages, /visiblePlatforms\.slice\(0, 1\)/);
    assert.doesNotMatch(
      campaignPages,
      /지원 \{formatMarketplaceMessageDate\(application\.createdAt\)\}/,
    );
    assert.match(server, /sender_influencer_categories/);
    assert.match(server, /display_name,headline,categories/);
    assert.match(advertiserDashboard, /grid w-full grid-cols-2 gap-1\.5 sm:w-\[190px\]/);
    assert.match(
      advertiserDashboard,
      /no-scrollbar overflow-x-hidden overflow-y-auto overscroll-contain rounded-\[10px\]/,
    );
    assert.match(advertiserDashboard, /lg:grid-cols-\[minmax\(260px,0\.82fr\)_minmax\(280px,0\.78fr\)_190px\]/);
    assert.match(advertiserDashboard, /primaryActionSpan = hasProfileAction \? "" : "col-span-2"/);
    assert.match(campaignPages, /grid w-full grid-cols-2 gap-1\.5 sm:w-\[188px\]/);
    assert.match(advertiserDashboard, /프로필 보기/);
    assert.match(campaignPages, /function AppliedCampaignFilters/);
    assert.match(campaignPages, /appliedStatusFilter/);
    assert.match(campaignPages, /CampaignColumnHeader/);
    assert.match(advertiserDashboard, /label: `\$\{dday\} \/ \$\{dateLabel\}`/);
    assert.match(advertiserDashboard, /font-extrabold text-\[#dc2626\]/);
    assert.match(influencerDashboard, /label: `\$\{dday\} \/ \$\{dateLabel\}`/);
    assert.match(influencerDashboard, /<InfluencerDateText parts=\{parts\} \/>/);
    assert.match(advertiserDashboard, /계약 조건 확인/);
    assert.match(advertiserDashboard, /extractCampaignSummaryField/);
    assert.match(seedAccounts, /campaignDashboardApplicationFixtures/);
    assert.match(seedAccounts, /handle: "creator-sora"/);
    assert.match(seedAccounts, /email: "creator\.sora@yeollock\.me"/);
    assert.match(seedAccounts, /const applicantNames = \[\.\.\.new Set/);
    assert.match(seedAccounts, /seeded_campaign_applications/);
    assert.match(server, /maxItems = 20/);
    assert.match(server, /normalizeBrandCampaigns\(activeCampaigns, 20\)/);
    assert.doesNotMatch(seedAccounts, /applicantLimit: "1명"/);
    assert.ok(
      (influencerDashboard.match(/MobileSurfaceSwitch role="influencer" active="contracts"/g) ?? [])
        .length >= 2,
    );
    assert.match(campaignPages, /MobileSurfaceSwitch role=\{role\} active="campaigns"/);
    assert.doesNotMatch(advertiserDashboard, /광고주 · 계약/);
    assert.doesNotMatch(influencerDashboard, /인플루언서 · 내 계약/);
    assert.match(influencerDashboard, /hidden min-w-0 truncate whitespace-nowrap text-\[12px\] font-semibold text-\[#303630\] lg:block/);
    assert.match(landing, /받은 광고/);
    assert.match(landing, /메일과 카톡에 흩어진/);
    assert.match(landing, /흩어진 광고[\s\S]*조건은/);
    assert.match(landing, /금액 확인 누락/);
    assert.match(landing, /일정 착오/);
    assert.match(landing, /수정 요청/);
    assert.match(landing, /서명 완료본/);
    assert.match(qaStandard, /받은 광고/);
    assert.match(qaStandard, /금액 확인 누락/);
    assert.doesNotMatch(landing, /받은 캠페인을/);
    assert.doesNotMatch(landing, /캠페인 정산 완료/);
    assert.doesNotMatch(seedAccounts, /캠페인 정산 완료/);
    assert.equal(
      formatContractTitleForDisplay("오브레 릴스 캠페인 정산 완료"),
      "오브레 릴스 정산 완료 계약",
    );
    assert.match(authLoginScreen, /disabled:!bg-neutral-200/);
    assert.match(advertiserVerification, /\{!approved && \(/);
    assert.doesNotMatch(influencerVerification, /InfoRow\s+label="현재 상태"\s+value="인증 완료"/);
    assert.doesNotMatch(marketplace, /제안 후 메시지함/);
    assert.match(landing, /2026\.05\.29 \/ D-5/);
    assert.doesNotMatch(landing, /D-5 \/ 2026\.05\.29/);
  });

  it("separates public cache optimization from sensitive contract data", () => {
    const server = read("server/index.ts");
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const messageSummaryHook = read("src/hooks/useMarketplaceMessageSummary.ts");
    const migration = read(
      "supabase/migrations/20260604012714_optimize_cache_query_paths.sql",
    );
    const agents = read("AGENTS.md");

    assert.ok(packageJson.dependencies?.["@vercel/functions"]);
    assert.match(server, /const getVercelRuntimeCache = async/);
    assert.match(server, /publicMarketplaceCacheTags/);
    assert.match(server, /writePublicMarketplaceRuntimeCache/);
    assert.match(server, /value === null \? undefined : value/);
    assert.match(server, /isEmptyPublicMarketplaceValue/);
    assert.match(server, /applyPublicMarketplaceFallback/);
    assert.match(server, /applyPublicMarketplaceFallback\(await loader\(\), options\)/);
    assert.match(server, /invalidateByTag/);
    assert.match(server, /Vercel-CDN-Cache-Control/);
    assert.match(server, /Vercel-Cache-Tag/);
    assert.match(
      server,
      /sendPublicMarketplaceJson\(response, \{ profiles \}, "marketplace-influencers"\)/,
    );
    assert.match(
      server,
      /sendPublicMarketplaceJson\(response, \{ campaigns \}, "marketplace-campaigns"\)/,
    );

    for (const route of [
      '"/api/advertiser/dashboard/bootstrap"',
      '"/api/marketplace/messages"',
      '"/api/contracts/:id"',
      '"/api/contracts/:id/review-pdf"',
      '"/api/contracts/:id/final-pdf"',
    ]) {
      const routeIndex = server.indexOf(route);
      assert.notEqual(routeIndex, -1, `${route} route must exist`);
      const routeSlice = server.slice(routeIndex, routeIndex + 4500);
      assert.match(routeSlice, /Cache-Control", "no-store"/);
      assert.doesNotMatch(routeSlice, /sendPublicMarketplaceJson/);
      assert.doesNotMatch(routeSlice, /writePublicMarketplaceRuntimeCache/);
    }

    assert.match(server, /const advertiserDashboardCache = new Map/);
    assert.match(server, /invalidateAdvertiserDashboardCache\(\)/);
    assert.match(messageSummaryHook, /messageSummaryInflight/);
    assert.match(migration, /directsign_contracts_advertiser_status_updated_idx/);
    assert.match(
      migration,
      /marketplace_contact_proposals_campaign_status_created_idx/,
    );
    assert.match(migration, /contract_parties_profile_role_contract_idx/);
    assert.match(agents, /Cache optimization must classify data before implementation/);
    assert.match(agents, /Keep sensitive HTTP responses `no-store`/);
  });

  it("keeps dashboard Excel exports scoped to operational list data", () => {
    const advertiserDashboard = read("src/pages/marketing/Dashboard.tsx");
    const influencerDashboard = read("src/pages/influencer/InfluencerDashboard.tsx");
    const dashboardDownloadButton = read("src/components/DashboardDownloadButton.tsx");
    const xlsxExport = read("src/domain/xlsxExport.ts");
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const agents = read("AGENTS.md");
    const advertiserExportSource = advertiserDashboard.slice(
      advertiserDashboard.indexOf("function buildAdvertiserContractExportSheet"),
      advertiserDashboard.indexOf(
        "function parseDate",
        advertiserDashboard.indexOf("function buildAdvertiserContractExportSheet"),
      ),
    );
    const influencerExportSource = influencerDashboard.slice(
      influencerDashboard.indexOf("function buildInfluencerDashboardExportSheet"),
      influencerDashboard.indexOf(
        "function parseDate",
        influencerDashboard.indexOf("function buildInfluencerDashboardExportSheet"),
      ),
    );
    const advertiserFilterStart = advertiserDashboard.indexOf(
      'id="advertiser-contract-filters"',
    );
    const advertiserFilterPanel = advertiserDashboard.slice(
      advertiserFilterStart,
      advertiserDashboard.indexOf("<ContractTableHeaderRow", advertiserFilterStart),
    );
    const advertiserFilterOrder = [
      'label="플랫폼"',
      'label="종류"',
      "<ContractNameSearch",
      'label="지급내용"',
      "<DashboardDateRangeFilter",
      'label="현 단계"',
    ].map((marker) => advertiserFilterPanel.indexOf(marker));

    assert.ok(packageJson.dependencies?.fflate);
    assert.match(dashboardDownloadButton, /aria-label="엑셀 내보내기"/);
    assert.match(dashboardDownloadButton, /title="엑셀 내보내기"/);
    assert.match(dashboardDownloadButton, />내보내기<\/span>/);
    assert.doesNotMatch(dashboardDownloadButton, />다운로드<\/span>/);
    assert.match(dashboardDownloadButton, /hidden sm:inline/);
    assert.match(xlsxExport, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
    assert.match(advertiserDashboard, /const CONTRACTS_PER_PAGE = 20/);
    assert.match(advertiserDashboard, /const DASHBOARD_CONTRACT_EXPORT_LIMIT = 5000/);
    assert.match(advertiserDashboard, /displayContracts\.slice\(pageStartIndex, pageEndIndex\)/);
    assert.match(advertiserDashboard, /<ContractPagination/);
    assert.match(advertiserDashboard, /<DashboardDownloadButton onClick=\{handleDownloadDashboard\} \/>/);
    assert.match(advertiserDashboard, /gap-x-3 gap-y-1/);
    assert.match(advertiserDashboard, /const \[contractDateFromFilter, setContractDateFromFilter\]/);
    assert.match(advertiserDashboard, /const \[contractDateToFilter, setContractDateToFilter\]/);
    assert.match(advertiserDashboard, /function DashboardDateRangeFilter/);
    assert.match(advertiserDashboard, /function DashboardDateInput/);
    assert.match(advertiserDashboard, /type="date"/);
    assert.match(advertiserDashboard, /placeholderLabel="시작일"/);
    assert.match(advertiserDashboard, /placeholderLabel="종료일"/);
    assert.match(advertiserDashboard, /matchesDashboardDateRange/);
    assert.match(advertiserDashboard, /Boolean\(contractDateFromFilter\)/);
    assert.match(advertiserDashboard, /Boolean\(contractDateToFilter\)/);
    assert.match(advertiserDashboard, /hasContractDashboardFilters/);
    assert.match(advertiserDashboard, /contractDownloadContracts/);
    assert.match(advertiserDashboard, /\? visibleContracts\s*:\s*\[\.\.\.dashboardContracts\]/);
    assert.match(advertiserDashboard, /contractDownloadContracts\.length > DASHBOARD_CONTRACT_EXPORT_LIMIT/);
    assert.match(
      advertiserFilterPanel,
      /lg:grid-cols-\[minmax\(132px,0\.34fr\)_minmax\(108px,0\.26fr\)_minmax\(300px,1fr\)_minmax\(132px,0\.34fr\)_minmax\(146px,0\.38fr\)_minmax\(112px,0\.3fr\)\]/,
    );
    assert.ok(advertiserFilterOrder.every((index) => index >= 0));
    assert.ok(
      advertiserFilterOrder.every(
        (index, orderIndex) =>
          orderIndex === 0 || index > advertiserFilterOrder[orderIndex - 1],
      ),
    );
    assert.match(agents, /visible Korean copy "내보내기"/);
    assert.match(agents, /accessible\/title copy "엑셀 내보내기"/);
    assert.match(agents, /Excel export should sit immediately beside the dashboard title/);
    assert.match(agents, /Date filtering belongs inside the dashboard filter panel/);
    assert.match(agents, /same visible column order as the table/);
    assert.match(influencerDashboard, /<DashboardDownloadButton onClick=\{handleDownloadDashboard\} \/>/);
    assert.match(advertiserExportSource, /buildAdvertiserContractExportSheet/);
    assert.match(advertiserExportSource, /CONTRACT_LIFECYCLE_EXPORT_LABELS\[lifecycle\]/);
    assert.match(advertiserExportSource, /"구분"/);
    assert.match(advertiserExportSource, /"기준일"/);
    assert.match(advertiserExportSource, /"계약 최초작성일"/);
    assert.match(advertiserExportSource, /"서명일"/);
    assert.match(advertiserExportSource, /"크리에이터명"/);
    assert.match(advertiserExportSource, /"크리에이터 계정명"/);
    assert.match(advertiserExportSource, /"구독자\/팔로워수"/);
    assert.match(advertiserExportSource, /"콘텐츠 수량"/);
    assert.match(advertiserExportSource, /"마감일"/);
    assert.match(advertiserExportSource, /"조항 수"/);
    assert.match(advertiserExportSource, /buildAdvertiserCampaignExportSheet/);
    assert.match(advertiserExportSource, /buildAdvertiserCampaignApplicantExportSheet/);
    assert.match(influencerExportSource, /buildInfluencerDashboardExportSheet/);
    for (const sensitivePattern of [
      /share_token|shareToken/,
      /pdf_url/,
      /signature_data/,
      /evidence_file/,
      /storage_path/,
      /supportAccess/,
      /download_url/,
    ]) {
      assert.doesNotMatch(advertiserExportSource, sensitivePattern);
      assert.doesNotMatch(influencerExportSource, sensitivePattern);
    }
    assert.match(
      agents,
      /Dashboard data exports should use one quiet top-right export action/,
    );
    assert.match(
      agents,
      /whole dashboard contract set across lifecycle tabs/,
    );
    assert.match(agents, /paginate at 20 rows per page/);
    assert.match(agents, /more than 5,000 rows/);
    assert.match(agents, /detailed operational extracts/);
  });
});
