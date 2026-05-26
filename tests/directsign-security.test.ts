import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatContractTitleForDisplay } from "../src/domain/display";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

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
    assert.match(byKey.get("Content-Security-Policy") ?? "", /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);
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
    const finalPdfHrefEnd = viewer.indexOf("const signatureEvidenceRows", finalPdfHrefStart);
    const finalPdfHrefBuilder = viewer.slice(finalPdfHrefStart, finalPdfHrefEnd);
    const pdfDownloadStart = viewer.indexOf("const pdfResponse = await fetch(");
    const pdfDownloadEnd = viewer.indexOf("if (!pdfResponse.ok)", pdfDownloadStart);
    const pdfDownloadBlock = viewer.slice(pdfDownloadStart, pdfDownloadEnd);

    assert.notEqual(finalPdfRouteStart, -1);
    assert.notEqual(finalPdfRouteEnd, -1);
    assert.notEqual(contractGetRouteStart, -1);
    assert.notEqual(contractGetRouteEnd, -1);
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

  it("redirects advertiser login immediately after successful authentication", () => {
    const app = read("src/App.tsx");
    const advertiserAuthGate = read("src/pages/marketing/AdvertiserAuthGate.tsx");
    const loginLanding = read("src/pages/auth/LoginLanding.tsx");

    assert.match(app, /<AdvertiserAuthGate redirectAfterLogin=\{nextPath\}>/);
    assert.match(advertiserAuthGate, /useNavigate/);
    assert.match(advertiserAuthGate, /navigate\(redirectAfterLogin, \{ replace: true \}\)/);
    assert.match(loginLanding, /const href = next[\s\S]+\? `\$\{role\.href\}\?next=/);
    assert.match(loginLanding, /: role\.href/);
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
    const influencerDashboard = read("src/pages/influencer/InfluencerDashboard.tsx");
    const server = read("server/index.ts");

    assert.match(
      app,
      /<Route path="\/:profileHandle" element=\{<PublicInfluencerProfilePage \/>\} \/>/,
    );
    assert.match(publicProfile, /export function getInfluencerPublicProfilePath/);
    assert.match(publicProfile, /return clean \? `\/\$\{clean\}` : "\/"/);
    assert.match(publicProfile, /export function formatInfluencerPublicProfileUrl/);
    assert.match(publicProfile, /return clean \? `yeollock\.me\/\$\{clean\}` : "yeollock\.me"/);
    assert.match(marketplace, /return `\/\$\{normalizeMarketplaceHandle\(profile\.handle\)\}`/);
    assert.match(marketplacePages, /formatInfluencerPublicProfileUrl\(profile\.handle\)/);
    assert.match(
      influencerDashboard,
      /navigate\(getInfluencerPublicProfilePath\(publicProfile\.handle\)\)/,
    );
    assert.match(server, /getInfluencerPublicProfilePath\(row\.target_handle\)/);
    assert.match(server, /getInfluencerPublicProfilePath\(row\.sender_influencer_handle\)/);
    assert.doesNotMatch(marketplacePages, /yeollock\.me\/\{profile\.handle\}/);
  });

  it("derives influencer public profile handles from the first registered platform", () => {
    const publicProfile = read("src/domain/publicInfluencerProfile.ts");
    const influencerDashboard = read("src/pages/influencer/InfluencerDashboard.tsx");
    const server = read("server/index.ts");
    const migration = read(
      "supabase/migrations/20260514012437_allow_dot_in_influencer_public_handles.sql",
    );

    assert.match(publicProfile, /export function getAutomaticPublicProfileHandle/);
    assert.match(publicProfile, /const firstPlatformHandle = platforms\?\.\[0\]\?\.handle/);
    assert.match(publicProfile, /handle: defaults\.handle/);
    assert.match(publicProfile, /\[a-z0-9_\.-\]/);
    assert.match(influencerDashboard, /getAutomaticPublicProfileHandle\(approvedPlatforms\)/);
    assert.match(influencerDashboard, /첫 등록 플랫폼 ID 기준/);
    assert.doesNotMatch(influencerDashboard, /value=\{form\.handle\}/);
    assert.doesNotMatch(influencerDashboard, /handle: initialProfile\.handle/);
    assert.match(server, /const automaticHandle = getAutomaticPublicProfileHandle\(approvedPlatforms\) \?\? ""/);
    assert.match(server, /buildApprovedInfluencerPlatforms\(verificationRequests\)/);
    assert.match(server, /parseDateAscending\(a\.created_at, b\.created_at\)/);
    assert.doesNotMatch(server, /normalizePublicProfileHandle\(normalizeRequiredText\(body\.handle\)\)/);
    assert.match(migration, /drop constraint if exists marketplace_influencer_profiles_handle_format/);
    assert.match(migration, /order by owner_profile_id, created_at asc/);
  });

  it("opens manual influencer public handles only after conflicts and queues appeals", () => {
    const influencerDashboard = read("src/pages/influencer/InfluencerDashboard.tsx");
    const adminDashboard = read("src/pages/admin/SystemAdminDashboard.tsx");
    const server = read("server/index.ts");

    assert.match(server, /findInfluencerPublicHandleConflict/);
    assert.match(server, /code: "public_profile_handle_conflict"/);
    assert.match(server, /body\.alternateHandle/);
    assert.doesNotMatch(server, /body\.handle/);
    assert.match(server, /app\.post\("\/api\/influencer\/public-profile\/handle-appeal"/);
    assert.match(server, /request_type: "public_profile_handle_claim"/);
    assert.match(influencerDashboard, /manualHandleAllowed/);
    assert.match(influencerDashboard, /alternateHandle: normalizedManualHandle/);
    assert.match(influencerDashboard, /이의신청하기/);
    assert.match(adminDashboard, /public_profile_handle_claim/);
    assert.match(adminDashboard, /공개 주소 소유권 이의신청/);
  });

  it("starts generated clauses as pending review and exposes mobile clause actions", () => {
    const builder = read("src/pages/marketing/ContractBuilder.tsx");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");
    const adminViewer = read("src/pages/marketing/ContractAdminViewer.tsx");

    assert.match(builder, /status:\s*"PENDING_REVIEW"/);
    assert.match(builder, /influencerContact[\s\S]+서명 계정 확인/);
    assert.match(viewer, /const approveClause = \(/);
    assert.match(viewer, /canSubmitClauseReview/);
    assert.match(viewer, /이 조항 승인/);
    assert.match(viewer, /수정 요청/);
    assert.match(adminViewer, /검토 대기/);
  });

  it("keeps public auth and signature evidence server-authored", () => {
    const server = read("server/index.ts");
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
    assert.match(server, /const signatureConsentText\s*=/);
    assert.match(server, /setSignedPdfAccessCookie\(response, updatedContract\)/);
    assert.match(signRoute, /share_token_status:\s*"revoked"/);
    assert.doesNotMatch(signRoute, /request\.body\?\.consent_text/);
    assert.match(server, /buildServerAuthoredContract/);
  });

  it("server-authors advertiser trust risk for influencer review links", () => {
    const server = read("server/index.ts");
    const contracts = read("src/domain/contracts.ts");
    const viewer = read("src/pages/influencer/ContractViewer.tsx");

    assert.match(contracts, /advertiser_trust/);
    assert.match(server, /buildAdvertiserTrustSnapshot/);
    assert.match(server, /first_contract_on_yeollock/);
    assert.match(server, /Advertiser trust metadata cannot be changed by influencer/);
    assert.match(viewer, /AdvertiserTrustNotice/);
    assert.match(viewer, /유선 또는 공식 채널/);
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
      /business number, mail-order\s+registration, address, and phone are not required/,
    );
    assert.match(ownerMemo, /free_individual[\s\S]+사업자등록번호, 주소, 전화번호/);
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

    assert.match(server, /const signupTermsVersion = "2026-05-19"/);
    assert.match(signupPage, /const TERMS_DOCUMENT_VERSION = "2026-05-19"/);
    assert.match(signupPage, /현재 가입과 기본 서비스 이용은 무료입니다/);
    assert.match(signupPage, /향후 일부 또는 전체\s+기능이 유료로 전환될 수 있으며/);
    assert.match(legalPage, /effectiveDate: "2026-05-19"/);
    assert.match(legalPage, /향후 일부 또는 전체 기능이 유료로 전환될 수 있으며/);
    assert.match(legalPage, /전환 전 별도 고지/);
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
    const authLoginScreen = read("src/components/AuthLoginScreen.tsx");
    const advertiserVerification = read("src/pages/marketing/AdvertiserVerification.tsx");
    const influencerVerification = read("src/pages/influencer/InfluencerVerification.tsx");
    const seedAccounts = read("scripts/seed-test-accounts.mjs");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const marketplace = read("src/pages/marketplace/MarketplacePages.tsx");

    assert.match(agents, /Kim Jaewoo Agent must be strict/);
    assert.match(agents, /Repeated Product Owner corrections must become executable guardrails/);
    assert.equal(
      packageJson.scripts?.["guardrails:kim"],
      "node scripts/kim-jaewoo-guardrails.mjs",
    );
    assert.match(qaStandard, /guardrails:kim/);
    assert.match(kimGuardrails, /캠페인 목록/);
    assert.match(kimGuardrails, /공유 가능/);
    assert.match(kimGuardrails, /influencer verification state is shown in one place/);
    assert.match(kimGuardrails, /influencer verification approved state is shown in one place/);
    assert.match(kimGuardrails, /advertiser verification approved state is shown in one place/);
    assert.match(kimGuardrails, /disabled auth CTA is visibly disabled/);
    assert.match(kimGuardrails, /fallback titles stay contract-centered/);
    assert.match(kimGuardrails, /row titles stay contract-centered/);
    assert.match(kimGuardrails, /live stale settlement titles are normalized/);
    assert.match(kimGuardrails, /OpenDesign is a separate local daemon\/web app workflow/);
    assert.match(landing, /계약과 신청을/);
    assert.match(qaStandard, /계약과 신청을/);
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
});
