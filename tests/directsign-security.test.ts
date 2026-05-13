import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
    const readme = read("README.md");

    assert.match(readme, /Apply every SQL file[\s\S]+timestamp order/);
    assert.match(readme, /20260430193123_create_directsign_v2_schema\.sql/);
    assert.match(readme, /20260501020000_create_directsign_v2_schema\.sql[\s\S]+no-op/);
    assert.match(readme, /20260505070645_harden_contract_support_access\.sql/);
    assert.match(readme, /20260506075008_restrict_authenticated_direct_writes\.sql/);
    assert.match(readme, /20260507224346_allow_revoked_support_access_event\.sql/);
    assert.match(readme, /20260507230025_lock_reserved_settlement_tables\.sql/);
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
    const readme = read("README.md");

    assert.match(envExample, /VITE_LEGAL_OPERATING_MODE="free_individual"/);
    assert.match(legalEntity, /"free_individual"/);
    assert.match(legalEntity, /"registered_business"/);
    assert.match(legalEntity, /해당 없음\(무료 개인 운영\)/);
    assert.match(legalEntity, /required: isRegisteredBusiness/);
    assert.match(
      readme,
      /business registration, mail-order registration, address, and phone fields are not required/,
    );
    assert.doesNotMatch(legalPage, /출시 전 입력 필요/);
    assert.doesNotMatch(legalPage, /미설정/);
    assert.doesNotMatch(readme, /출시 전 입력 필요/);
  });
});
