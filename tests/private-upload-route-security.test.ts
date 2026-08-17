import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");

const between = (start: string, end: string) => {
  const startIndex = server.indexOf(start);
  const endIndex = server.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing route start: ${start}`);
  assert.notEqual(endIndex, -1, `missing route end: ${end}`);
  return server.slice(startIndex, endIndex);
};

test("private upload ticket endpoints bind stable resource ids before issuing capabilities", () => {
  const advertiser = between(
    '"/api/verification/advertiser/upload-ticket"',
    '"/api/verification/influencer/upload-ticket"',
  );
  const influencer = between(
    '"/api/verification/influencer/upload-ticket"',
    'app.post("/api/verification/advertiser"',
  );
  const deliverable = between(
    '"/api/contracts/:id/deliverables/upload-ticket"',
    'app.post("/api/contracts/:id/deliverables"',
  );

  for (const route of [advertiser, influencer]) {
    assert.match(route, /const uploadId = normalizeOptionalText/);
    assert.match(route, /!uploadId \|\| !isUuidText\(uploadId\)/);
    assert.match(route, /ticketId: uploadId/);
    assert.match(route, /resourceId: uploadId/);
    assert.match(route, /issuePrivateFileUploadTicket/);
  }
  assert.match(deliverable, /const submissionId = normalizeOptionalText/);
  assert.match(deliverable, /ticketId: submissionId/);
  assert.match(deliverable, /resourceId: submissionId/);
  assert.match(deliverable, /private-upload-reservation:\$\{submissionId\}/);
});

test("signed direct upload capability is fixed to private Supabase TUS without secrets or upsert", () => {
  const helpers = between(
    "const privateTusUploadEndpoint",
    "const buildVerificationEvidenceSnapshot",
  );
  assert.match(
    helpers,
    /\.storage\.supabase\.co\/storage\/v1\/upload\/resumable/,
  );
  assert.match(helpers, /\/object\/upload\/sign\//);
  assert.match(helpers, /"x-upsert": "false"/);
  assert.match(helpers, /upload_signature: uploadSignature/);
  assert.doesNotMatch(
    helpers.slice(
      helpers.indexOf("return {", helpers.indexOf("issuePrivateFileUploadTicket")),
      helpers.indexOf("type PrivateUploadTicketReadRpcRow"),
    ),
    /serviceRoleKey|authorization|apikey/i,
  );
});

test("finalizers reject inline evidence and use exact ticket-bound atomic persistence", () => {
  const advertiser = between(
    'app.post("/api/verification/advertiser"',
    'app.post("/api/verification/influencer"',
  );
  const influencer = between(
    'app.post("/api/verification/influencer"',
    '"/api/verification/influencer/instagram-dm-challenge"',
  );
  const deliverable = between(
    'app.post("/api/contracts/:id/deliverables"',
    '"/api/contracts/:id/deliverables/:deliverableId/instagram-metrics/refresh"',
  );

  for (const route of [advertiser, influencer, deliverable]) {
    assert.match(route, /"evidence_file" in request\.body/);
    assert.match(route, /readPrivateFileUploadTicket/);
    assert.match(route, /readAndVerifyPrivateUploadObject/);
    assert.match(route, /state === "finalized"/);
  }
  assert.match(deliverable, /\r?\n\s+uploadTicketId,\r?\n/);
  assert.match(
    server,
    /rpc\/finalize_directsign_deliverable_submission_from_ticket/,
  );
  assert.match(deliverable, /!pendingUploadTicketId/);
  assert.match(deliverable, /sendPrivateFileUploadError\(response, error\)/);
  assert.doesNotMatch(deliverable, /storeDeliverableFile\(/);
});

test("influencer optional evidence matches UI methods while Instagram DM remains file-free", () => {
  const route = between(
    'app.post("/api/verification/influencer"',
    '"/api/verification/influencer/instagram-dm-challenge"',
  );
  assert.match(
    route,
    /ownershipMethod === "screenshot_review" && !uploadTicketId/,
  );
  assert.match(route, /uploadTicketId && isInstagramDmMethod/);
  assert.doesNotMatch(
    route,
    /uploadTicketId && ownershipMethod !== "screenshot_review"/,
  );
  assert.match(route, /const autoApprove =\s*!uploadTicketId/);
});

test("object verification is streamed with a hard byte bound and exact MIME, magic, size, and hash", () => {
  const helpers = between(
    "const readPrivateUploadResponseBodyBounded",
    "const sendPrivateFileUploadError",
  );
  assert.match(helpers, /response\.body\.getReader\(\)/);
  assert.match(helpers, /totalBytes > maximumBytes/);
  assert.match(helpers, /reader\.cancel\(\)/);
  assert.match(helpers, /buffer\.byteLength !== ticket\.byte_size/);
  assert.match(helpers, /responseContentType !== ticket\.content_type/);
  assert.match(helpers, /assertDeclaredMimeMatchesContent/);
  assert.match(helpers, /actualSha256 !== ticket\.sha256/);
});

test("privacy cron claims delayed orphans and preserves exact references or uncertainty", () => {
  assert.match(server, /runPrivateUploadCleanupSweep/);
  assert.match(server, /claim_directsign_private_upload_cleanup/);
  assert.match(server, /hasExactVerificationEvidenceFile\(record, storedFile\)/);
  assert.match(server, /row\.content_type === ticket\.content_type/);
  assert.match(server, /completePrivateUploadCleanup\([\s\S]*?"referenced"/);
  assert.match(server, /enqueuePrivateUploadCleanupAlert/);
});

test("privacy cron prunes ticket metadata in bounded aggregate-only batches", () => {
  assert.match(
    server,
    /callSupabaseRpc<PrivateUploadTicketPruneRow\[\]>\(\s*"prune_directsign_private_file_upload_tickets"/,
  );
  assert.match(server, /total > limit/);
  assert.match(server, /cleaned \+ finalized !== total/);
  const route = between(
    'app.get("/api/cron/privacy-retention"',
    'app.get("/api/marketplace/influencers"',
  );
  assert.match(route, /await runPrivateUploadTicketPrune\(\)/);
  assert.ok(
    route.indexOf("await runPrivateUploadTicketPrune()") <
      route.indexOf("await runPrivacyRetentionSweep()"),
    "ticket metadata must be pruned before retention can remove deletion proof",
  );
  assert.match(route, /private_upload_ticket_prune: privateUploadTicketPrune/);
  assert.match(route, /enqueuePrivacyRetentionFailureAlert/);
  assert.doesNotMatch(route, /ticket_id|object_path|actor_profile_id|sha256/);
});
