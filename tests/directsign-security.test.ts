import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
