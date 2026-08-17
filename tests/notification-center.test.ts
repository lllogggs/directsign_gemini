import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  mapNotificationFeedRpcRow,
  normalizeNotificationEventInput,
  sanitizeNotificationRouteParams,
  sanitizeNotificationSafeParams,
} from "../server/notification-center.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260803100000_add_customer_notification_center.sql",
  ),
  "utf8",
);
const server = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");
const atomicContractMigration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260811190000_atomic_contract_close.sql",
  ),
  "utf8",
);
const atomicDeliverableMigration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260811194000_atomic_deliverable_mutations.sql",
  ),
  "utf8",
);

const migrationSection = (start: string, end: string) => {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing migration section start: ${start}`);
  assert.ok(endIndex > startIndex, `missing migration section end: ${end}`);
  return migration.slice(startIndex, endIndex);
};

const advertiserId = "11111111-1111-4111-8111-111111111111";
const influencerId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";

test("notification copy params are allowlisted and discard private metadata", () => {
  assert.deepEqual(
    sanitizeNotificationSafeParams("contract.content_reviewed", {
      contractTitle: "  여름 캠페인  ",
      reviewStatus: "changes_requested",
      reviewComment: "private free-form comment",
      email: "private@example.com",
      shareToken: "secret",
      arbitraryUrl: "https://private.example/path",
    }),
    {
      contractTitle: "여름 캠페인",
      reviewStatus: "changes_requested",
    },
  );

  assert.deepEqual(
    sanitizeNotificationSafeParams("deadline.action_due", {
      contractTitle: "마감 계약",
      dueAt: "2026-08-04T03:00:00+09:00",
      password: "never-store",
    }),
    {
      contractTitle: "마감 계약",
      dueAt: "2026-08-03T18:00:00.000Z",
    },
  );
});

test("route params are whitelist-mapped and never accept arbitrary hrefs", () => {
  assert.deepEqual(
    sanitizeNotificationRouteParams("campaign_detail", {
      campaignId: "campaign-1",
      href: "https://evil.example",
      token: "secret",
    }),
    { campaignId: "campaign-1" },
  );
  assert.deepEqual(
    sanitizeNotificationRouteParams("dashboard", {
      href: "/admin",
    }),
    {},
  );
});

test("event normalization excludes non-production, self and invalid recipients", () => {
  const base = {
    eventKey: "campaign_application:44444444-4444-4444-8444-444444444444:submitted",
    eventType: "campaign.application_received",
    sourceType: "campaign_application" as const,
    sourceId: eventId,
    sourceVersion: "v1",
    actorProfileId: influencerId,
    actorRole: "influencer" as const,
    copyKey: "campaign.application_received" as const,
    safeParams: { campaignTitle: "캠페인", email: "hidden@example.com" },
    routeKey: "campaign_detail" as const,
    routeParams: { campaignId: "campaign-1", href: "/unsafe" },
    occurredAt: "2026-08-03T00:00:00.000Z",
    recipients: [
      { profileId: advertiserId, role: "advertiser" as const, organizationId },
      { profileId: advertiserId, role: "advertiser" as const, organizationId },
      { profileId: influencerId, role: "influencer" as const },
      { profileId: "not-a-uuid", role: "influencer" as const },
    ],
  };

  const normalized = normalizeNotificationEventInput({
    ...base,
    dataOrigin: "production",
  });
  assert.ok(normalized);
  assert.deepEqual(normalized.recipients, [
    { profileId: advertiserId, role: "advertiser", organizationId },
  ]);
  assert.deepEqual(normalized.safeParams, { campaignTitle: "캠페인" });
  assert.deepEqual(normalized.routeParams, { campaignId: "campaign-1" });

  assert.equal(
    normalizeNotificationEventInput({ ...base, dataOrigin: "qa" }),
    undefined,
  );
});

test("cursor is opaque, round-trips and rejects malformed input", () => {
  const cursor = {
    occurredAt: "2026-08-03T00:00:00.000Z",
    eventId,
  };
  const encoded = encodeNotificationCursor(cursor);
  assert.deepEqual(decodeNotificationCursor(encoded), cursor);
  assert.equal(decodeNotificationCursor("not-base64-json"), undefined);
  assert.equal(
    decodeNotificationCursor(
      Buffer.from(
        JSON.stringify({ ...cursor, eventId: "wrong" }),
        "utf8",
      ).toString("base64url"),
    ),
    undefined,
  );
});

test("flat feed rows are sanitized before reaching clients", () => {
  assert.deepEqual(
    mapNotificationFeedRpcRow({
      event_id: eventId,
      event_type: "contract.content_reviewed",
      copy_key: "contract.content_reviewed",
      safe_params: {
        contractTitle: "계약",
        reviewStatus: "approved",
        rawEmail: "hidden@example.com",
      },
      route_key: "contract_detail",
      route_params: { contractId: "contract-1", href: "/admin" },
      occurred_at: "2026-08-03T00:00:00Z",
      read_at: null,
    }),
    {
      id: eventId,
      eventType: "contract.content_reviewed",
      copyKey: "contract.content_reviewed",
      safeParams: { contractTitle: "계약", reviewStatus: "approved" },
      routeKey: "contract_detail",
      routeParams: { contractId: "contract-1" },
      occurredAt: "2026-08-03T00:00:00.000Z",
      readAt: null,
    },
  );
});

test("migration establishes immutable service-only durable primitives", () => {
  for (const table of [
    "notification_events",
    "notification_recipients",
    "notification_outbox",
    "notification_projection_state",
    "notification_projection_receipts",
    "notification_workflow_sources",
    "notification_campaign_status_sources",
    "notification_campaign_status_recipients",
    "notification_projection_failures",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /notification_events_reject_update/);
  assert.match(migration, /notification_events_production_only/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /lease_expires_at/);
  assert.match(migration, /attempt_count < 10/);
  assert.match(migration, /service role required/g);
  assert.match(migration, /from public\.profiles as actor/);
  assert.match(
    migration,
    /revoke execute on function public\.directsign_project_contract_event_notification\(\)/,
  );
});

test("idempotency compares full immutable facts and recipient snapshot", () => {
  for (const fact of [
    "actor_profile_id",
    "actor_role",
    "safe_params",
    "route_params",
    "data_origin",
    "occurred_at",
  ]) {
    assert.match(
      migration,
      new RegExp(`v_existing\\.${fact} is distinct from`),
    );
  }
  assert.match(migration, /notification recipient snapshot collision/);
  assert.match(
    migration,
    /never\r?\n\s*-- expand an old event to organization members who joined later/,
  );
});

test("all customer reads and read mutations revalidate current source access", () => {
  const authorizationCalls = migration.match(
    /customer_notification_recipient_authorized\(/g,
  ) ?? [];
  // declaration + grants + list + single read + read-all + unread count
  assert.ok(authorizationCalls.length >= 7);
  assert.match(migration, /membership\.profile_id = p_profile_id/);
  assert.match(migration, /party\.profile_id = p_profile_id/);
  assert.match(migration, /proposal\.sender_profile_id = p_profile_id/);
  assert.match(migration, /contract\.next_actor_role = 'influencer'/);
  assert.match(migration, /recipient\.occurred_at <= p_cutoff/);
});

test("actual workflow sources project without backfill or message duplication", () => {
  assert.match(migration, /when 'share_link_issued' then/);
  assert.doesNotMatch(migration, /when 'contract_ready_to_sign' then/);
  assert.match(
    migration,
    /v_contract\.status not in \('signing', 'active', 'completed'\)/,
  );
  assert.match(migration, /contract_event\.created_at >= projection_state\.cutover_at/);
  assert.match(
    migration,
    /new\.direction <> 'influencer_to_brand' or new\.campaign_id is null/,
  );
  assert.match(server, /rows\.filter\(isOneToOneMarketplaceMessageProposal\)/);
});

test("daily deadline reconciliation is 48-hour safe and counts only new events", () => {
  assert.match(
    migration,
    /p_horizon_minutes integer default 2880/,
  );
  assert.match(
    migration,
    /v_contract\.next_due_at - interval '48 hours'/,
  );
  assert.match(
    migration,
    /select result\.notification_event_id, result\.inserted\s+into v_notification_id, v_inserted/,
  );
  assert.match(
    migration,
    /if v_notification_id is not null and v_inserted then\s+v_count := v_count \+ 1/,
  );
  assert.match(
    server,
    /p_horizon_minutes: 2880, p_limit: 500/,
  );
  assert.match(server, /"reconcile_campaign_notifications"/);
  assert.match(server, /"reconcile_notification_workflow_sources"/);
});

test("notification APIs are private, role-scoped and use source-authorized RPCs", () => {
  for (const route of [
    'app.get("/api/notifications"',
    'app.get("/api/notifications/unread-count"',
    'app.post("/api/notifications/read-all"',
    'app.post("/api/notifications/:id/read"',
  ]) {
    assert.ok(server.includes(route), route);
  }
  assert.match(server, /Cache-Control", "private, no-store"/);
  assert.match(server, /rpc\/list_customer_notifications/);
  assert.match(server, /rpc\/get_notification_unread_count/);
  assert.match(server, /rpc\/mark_notification_read/);
  assert.match(server, /rpc\/mark_all_notifications_read/);
  const productionGate = server.slice(
    server.indexOf("const isProductionNotificationProfile ="),
    server.indexOf("const requireCustomerNotificationSession ="),
  );
  assert.match(productionGate, /profile\.data_origin === "production"/);
  assert.doesNotMatch(productionGate, /resolveTrustedDataOrigin/);
});

test("legacy contract sync preserves notification recipient ownership links", () => {
  assert.match(
    server,
    /const \[advertiserOrganization, influencerProfile\] = await Promise\.all\(/,
  );
  assert.match(
    server,
    /owner_organization_id: advertiserOrganization\?\.id \?\? null/,
  );
  assert.match(server, /organization_id: advertiserOrganization\?\.id \?\? null/);
  assert.match(
    server,
    /influencerProfile && isInfluencerRole\(influencerProfile\.role\)/,
  );
  assert.match(
    server,
    /id: influencerPartyId,[\s\S]*?profile_id: influencerProfileId,[\s\S]*?party_role: "influencer"/,
  );
  assert.match(
    server,
    /actor_profile_id:[\s\S]*?event\.actor === "advertiser"[\s\S]*?advertiserProfileId[\s\S]*?event\.actor === "influencer"[\s\S]*?influencerProfileId/,
  );
});

test("campaign applications stay operational without re-entering messages", () => {
  assert.match(server, /const isMarketplaceCampaignApplicationProposal =/);
  assert.match(
    server,
    /options\.campaignApplicationsOnly[\s\S]*?isMarketplaceCampaignApplicationProposal[\s\S]*?: isOneToOneMarketplaceMessageProposal/,
  );
  assert.match(server, /"\/api\/marketplace\/campaign-applications"/);
  assert.match(server, /campaignApplicationsOnly: true/g);
  assert.match(server, /requireAdvertiserSession\(request, response\)/);
  assert.match(server, /requireInfluencerSession\(request, response\)/);
  assert.match(
    server,
    /"\/api\/marketplace\/campaign-applications"[\s\S]*?Cache-Control", "private, no-store"/,
  );
});

test("repeatable contract milestones use deterministic duplicate-safe events", () => {
  const retiredPostLinkRoute = server.slice(
    server.indexOf('app.post("/api/contracts/:id/post-link"'),
    server.indexOf('app.post("/api/contracts/:id/deliverables"'),
  );
  assert.match(retiredPostLinkRoute, /status\(410\)/);
  assert.match(retiredPostLinkRoute, /DELIVERABLE_ENDPOINT_REQUIRED/);
  assert.doesNotMatch(
    retiredPostLinkRoute,
    /writeExistingContractWithCas|insertContractEvent|post_link_submitted/,
  );
  assert.match(
    server,
    /const readyEventId = stableUuid\([\s\S]*?`\$\{contract\.id\}:event:deliverables_ready_to_close`/,
  );
  assert.match(
    server,
    /if \(ignoreDuplicate\) \{\s*await insertSupabaseV2RowsIgnoringDuplicates\("contract_events", rows\)/,
  );
  assert.doesNotMatch(
    server,
    /audit_events:\s*useSupabaseV2 \|\|[\s\S]*?\? existingAuditEvents/,
  );
  assert.match(
    atomicDeliverableMigration,
    /from public\.sync_directsign_deliverable_workflow_atomically/,
  );
  assert.match(
    atomicDeliverableMigration,
    /insert into public\.contract_events[\s\S]*?from public\.sync_directsign_deliverable_workflow_atomically/,
  );
  const atomicWorkflow = atomicContractMigration.slice(
    atomicContractMigration.indexOf(
      "create or replace function public.sync_directsign_deliverable_workflow_atomically",
    ),
    atomicContractMigration.indexOf(
      "revoke all on function public.guard_active_contract_deliverable_mutation",
    ),
  );
  assert.match(atomicWorkflow, /for update/);
  assert.match(atomicWorkflow, /update public\.directsign_contracts/);
  assert.match(atomicWorkflow, /update public\.contracts/);
  assert.match(atomicWorkflow, /'deliverables_ready_to_close'/);
  assert.match(atomicWorkflow, /insert into public\.contract_events/);
});

test("SQL hardening uses core hashing and preserves immutable actor history", () => {
  assert.match(migration, /pg_catalog\.md5\(/);
  assert.match(migration, /pg_catalog\.concat_ws\(/);
  assert.doesNotMatch(migration, /\bdigest\s*\(/i);
  assert.match(
    migration,
    /actor_profile_id uuid,\s*\n\s*actor_role text/,
  );
  assert.match(
    migration,
    /drop constraint if exists notification_events_actor_profile_id_fkey/,
  );
  assert.match(
    migration,
    /drop constraint if exists contract_events_actor_profile_id_fkey/,
  );
  assert.match(
    migration,
    /drop constraint if exists marketplace_contact_proposals_sender_profile_id_fkey/,
  );
});

test("retention keeps immutable projection tombstones to prevent unread resurrection", () => {
  assert.match(
    migration,
    /create table if not exists public\.notification_projection_receipts/,
  );
  const enqueue = migrationSection(
    "create or replace function public.enqueue_notification_event(",
    "revoke execute on function public.enqueue_notification_event(",
  );
  assert.match(enqueue, /v_existing_receipt\.fact_fingerprint/);
  assert.match(enqueue, /notification projection receipt collision/);
  assert.match(enqueue, /insert into public\.notification_projection_receipts/);

  const purge = migrationSection(
    "create or replace function public.purge_expired_customer_notifications()",
    "revoke execute on function public.purge_expired_customer_notifications()",
  );
  assert.doesNotMatch(purge, /delete from public\.notification_projection_receipts/);

  const contractReconcile = migrationSection(
    "create or replace function public.reconcile_contract_notifications(",
    "revoke execute on function public.reconcile_contract_notifications(integer)",
  );
  assert.match(contractReconcile, /notification_projection_receipts as receipt/);
  assert.match(contractReconcile, /receipt\.event_key is null/);
});

test("recipient snapshot insert keeps column/value arity exact", () => {
  const insert = migrationSection(
    "insert into public.notification_recipients (",
    "from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as requested(",
  );
  assert.match(
    insert,
    /event_id,\s*recipient_profile_id,\s*recipient_role,\s*recipient_organization_id,\s*occurred_at\s*\)\s*select distinct\s*v_event_id,\s*recipient\.id,\s*requested\."role",\s*case[\s\S]*?end,\s*p_occurred_at\s*$/,
  );
  assert.equal((insert.match(/recipient\.id,/g) ?? []).length, 1);
});

test("outbox reaps an abandoned final attempt before claiming more work", () => {
  const claim = migrationSection(
    "create or replace function public.claim_notification_outbox(",
    "revoke execute on function public.claim_notification_outbox(text, integer, integer)",
  );
  assert.match(claim, /abandoned\.attempt_count >= 10/);
  assert.match(claim, /status = 'dead'/);
  assert.match(claim, /last_error_code = 'max_attempts_exhausted'/);
  assert.match(claim, /abandoned\.lease_expires_at <= now\(\)/);
});

test("daily deadlines anti-join receipts before LIMIT and include a bounded missed-run window", () => {
  const deadlines = migrationSection(
    "create or replace function public.reconcile_contract_deadline_notifications(",
    "revoke execute on function public.reconcile_contract_deadline_notifications(integer, integer)",
  );
  assert.match(deadlines, /contract\.next_due_at > now\(\) - interval '48 hours'/);
  assert.match(deadlines, /notification_projection_receipts as receipt/);
  assert.ok(
    deadlines.indexOf("not exists (") < deadlines.indexOf("limit least(greatest(p_limit"),
    "deadline idempotency anti-join must run before the batch limit",
  );
  assert.match(deadlines, /least\(greatest\(p_horizon_minutes, 15\), 2880\)/);
});

test("campaign status capture freezes batches before projection and retries partial work", () => {
  const campaignProjector = migrationSection(
    "create or replace function public.project_campaign_status_notification(",
    "revoke execute on function public.project_campaign_status_notification(text)",
  );
  assert.match(campaignProjector, /notification_campaign_status_sources/);
  assert.match(campaignProjector, /notification_campaign_status_recipients/);
  assert.match(campaignProjector, /group by snapshot\.batch_no/);
  assert.match(campaignProjector, /':batch:' \|\| v_batch\.batch_no/);
  assert.match(campaignProjector, /campaign_projection_complete/);
  assert.match(campaignProjector, /if v_notification_id is null then/);
  assert.match(campaignProjector, /campaign status Bell batch was not persisted/);

  const campaignTrigger = migrationSection(
    "create or replace function public.directsign_project_campaign_status_notification()",
    "drop trigger if exists marketplace_campaigns_project_status_notification",
  );
  assert.match(campaignTrigger, /statusUpdatedByProfileId/);
  assert.match(campaignTrigger, /row_number\(\) over/);
  assert.match(campaignTrigger, /\/ 250\)::integer/);
  assert.match(campaignTrigger, /insert into public\.notification_campaign_status_sources/);
  assert.match(campaignTrigger, /insert into public\.notification_campaign_status_recipients/);
  assert.ok(
    campaignTrigger.indexOf("insert into public.notification_campaign_status_sources") <
      campaignTrigger.indexOf("perform public.project_campaign_status_notification"),
    "immutable source capture must precede best-effort projection",
  );
  assert.match(campaignTrigger, /exception\s+when others then/);
  assert.match(campaignTrigger, /record_notification_projection_failure/);
  assert.match(campaignTrigger, /return new/);
});

test("database triggers are trusted while direct projection RPCs remain service-only", () => {
  const enqueue = migrationSection(
    "create or replace function public.enqueue_notification_event(",
    "revoke execute on function public.enqueue_notification_event(",
  );
  assert.match(
    enqueue,
    /coalesce\(auth\.role\(\), ''\) <> 'service_role'[\s\S]*?pg_catalog\.pg_trigger_depth\(\) = 0/,
  );
  assert.match(
    migration,
    /revoke execute on function public\.enqueue_notification_event\([\s\S]*?from public, anon, authenticated/,
  );
});

test("authoritative deliverable transitions have one durable Bell owner", () => {
  assert.match(
    migration,
    /create table if not exists public\.notification_workflow_sources/,
  );
  assert.match(migration, /deliverables_capture_notification_source/);
  assert.match(migration, /project_notification_workflow_source/);
  assert.match(migration, /reconcile_notification_workflow_sources/);

  const capture = migrationSection(
    "create or replace function public.directsign_capture_deliverable_notification_source()",
    "drop trigger if exists deliverables_capture_notification_source",
  );
  assert.match(capture, /authoritative production deliverable actor is required/);
  assert.match(capture, /insert into public\.notification_workflow_sources/);
  assert.match(capture, /source\/actor capture must either persist/);
  assert.ok(
    capture.indexOf("insert into public.notification_workflow_sources") <
      capture.indexOf("perform public.project_notification_workflow_source"),
    "deliverable source capture must commit atomically before projection",
  );
  assert.match(capture, /exception\s+when others then/);
  assert.match(capture, /record_notification_projection_failure/);
  assert.doesNotMatch(capture, /on conflict \(source_key\) do nothing/);

  const contractProjector = migrationSection(
    "create or replace function public.project_contract_event_notification(",
    "revoke execute on function public.project_contract_event_notification(uuid)",
  );
  assert.match(contractProjector, /notification_safe_timestamptz/);
  assert.match(contractProjector, /source\.occurred_at = public\.notification_safe_timestamptz/);
  assert.match(contractProjector, /when 'deliverable_submitted' then/);
  assert.match(contractProjector, /when 'deliverable_approved' then/);
  assert.doesNotMatch(contractProjector, /<= 600/);
  assert.match(
    contractProjector,
    /v_contract_event\.created_at < v_cutover_at/,
  );

  const contractReconcile = migrationSection(
    "create or replace function public.reconcile_contract_notifications(",
    "revoke execute on function public.reconcile_contract_notifications(integer)",
  );
  assert.match(contractReconcile, /'deliverable_submitted'/);
  assert.match(contractReconcile, /'deliverable_approved'/);
  assert.match(contractReconcile, /not exists \([\s\S]*?notification_workflow_sources/);
  assert.match(contractReconcile, /source\.occurred_at = public\.notification_safe_timestamptz/);
  assert.match(server, /finalizeDeliverableSubmissionAtomically/);
  assert.match(server, /finalizeDeliverableReviewAtomically/);
  assert.match(
    atomicDeliverableMigration,
    /'transition_occurred_at', p_occurred_at/,
  );
  assert.match(
    atomicDeliverableMigration,
    /insert into public\.contract_events[\s\S]*?from public\.sync_directsign_deliverable_workflow_atomically/,
  );
  assert.match(
    atomicDeliverableMigration,
    /revoke all on function public\.finalize_directsign_deliverable_review/,
  );
});

test("recipient authorization and source selection fail closed on unknown provenance", () => {
  assert.doesNotMatch(
    migration,
    /coalesce\([^\n)]*data_origin[^\n)]*,\s*'production'\)/i,
  );
  const authorization = migrationSection(
    "create or replace function public.customer_notification_recipient_authorized(",
    "revoke execute on function public.customer_notification_recipient_authorized(",
  );
  assert.match(authorization, /when event\.source_type = 'deliverable' then exists/);
  assert.match(authorization, /source\.data_origin = 'production'/);
  assert.match(authorization, /contract\.data_origin = 'production'/);
  assert.match(authorization, /proposal\.data_origin = 'production'/);
  assert.match(authorization, /brand\.data_origin = 'production'/);
  assert.match(authorization, /recipient_profile\.data_origin = 'production'/);
});

test("campaign reconciliation is cutover-scoped and records actionable failures", () => {
  const reconcile = migrationSection(
    "create or replace function public.reconcile_campaign_notifications(",
    "revoke execute on function public.reconcile_campaign_notifications(integer)",
  );
  assert.match(reconcile, /projection_state\.projection_key = 'customer_bell'/g);
  assert.match(reconcile, /proposal\.created_at >= projection_state\.cutover_at/);
  assert.match(reconcile, /proposal\.converted_at >= projection_state\.cutover_at/);
  assert.match(reconcile, /notification_campaign_status_sources as source/);
  assert.match(reconcile, /source\.data_origin = 'production'/);
  assert.match(reconcile, /source\.occurred_at/);
  assert.match(migration, /campaign\.updated_at >= projection_state\.cutover_at/);
  assert.match(migration, /campaign\.status in \('open', 'closed', 'ended'\)/);
  assert.doesNotMatch(reconcile, /now\(\) - interval '180 days'/);
  assert.match(reconcile, /record_notification_projection_failure/);
  assert.match(
    migration,
    /create table if not exists public\.notification_projection_failures/,
  );
});

test("campaign Bell sources revalidate campaign, brand, and organization ownership", () => {
  const projector = migrationSection(
    "create or replace function public.project_campaign_application_notification(",
    "revoke execute on function public.project_campaign_application_notification(uuid, text)",
  );
  assert.match(projector, /campaign\.id = v_proposal\.campaign_id/);
  assert.match(
    projector,
    /campaign\.brand_profile_id = v_proposal\.target_brand_profile_id/,
  );
  assert.match(projector, /campaign\.organization_id = v_brand\.organization_id/);

  const reconcile = migrationSection(
    "create or replace function public.reconcile_campaign_notifications(",
    "revoke execute on function public.reconcile_campaign_notifications(integer)",
  );
  assert.match(
    reconcile,
    /campaign\.brand_profile_id = proposal\.target_brand_profile_id/g,
  );
  assert.match(reconcile, /campaign\.organization_id = brand\.organization_id/g);

  const authorization = migrationSection(
    "create or replace function public.customer_notification_recipient_authorized(",
    "revoke execute on function public.customer_notification_recipient_authorized(",
  );
  assert.match(
    authorization,
    /campaign\.brand_profile_id = proposal\.target_brand_profile_id/,
  );
  assert.match(authorization, /brand\.organization_id = campaign\.organization_id/);
});

test("retry projection remains valid after monotonic workflow advancement", () => {
  const contractProjector = migrationSection(
    "create or replace function public.project_contract_event_notification(",
    "revoke execute on function public.project_contract_event_notification(uuid)",
  );
  assert.match(
    contractProjector,
    /when 'share_link_issued' then\s*if v_contract\.status not in \('signing', 'active', 'completed'\)/,
  );
  assert.match(
    contractProjector,
    /when 'post_link_submitted' then\s*if v_contract\.status not in \('active', 'completed'\)/,
  );
  assert.match(
    contractProjector,
    /when 'deliverables_ready_to_close' then\s*if v_contract\.status not in \('active', 'completed'\)/,
  );

  const applicationProjector = migrationSection(
    "create or replace function public.project_campaign_application_notification(",
    "revoke execute on function public.project_campaign_application_notification(uuid, text)",
  );
  assert.match(
    applicationProjector,
    /v_proposal\.status not in \('converted_to_contract', 'closed'\)/,
  );
  assert.match(applicationProjector, /v_proposal\.converted_contract_id is null/);

  const campaignReconcile = migrationSection(
    "create or replace function public.reconcile_campaign_notifications(",
    "revoke execute on function public.reconcile_campaign_notifications(integer)",
  );
  assert.match(
    campaignReconcile,
    /proposal\.status in \('converted_to_contract', 'closed'\)/,
  );
  assert.match(campaignReconcile, /proposal\.converted_contract_id is not null/);
});

test("workflow transitions preserve production actors and true automation stays system", () => {
  const applicationProjector = migrationSection(
    "create or replace function public.project_campaign_application_notification(",
    "revoke execute on function public.project_campaign_application_notification(uuid, text)",
  );
  assert.match(
    applicationProjector,
    /'campaign_application:' \|\| v_proposal\.id::text \|\| ':selected'[\s\S]*?v_proposal\.converted_by_profile_id,\s*'advertiser'/,
  );

  const campaignProjector = migrationSection(
    "create or replace function public.project_campaign_status_notification(",
    "revoke execute on function public.project_campaign_status_notification(text)",
  );
  assert.match(
    campaignProjector,
    /v_source\.source_version \|\| ':batch:'[\s\S]*?v_source\.actor_profile_id,\s*v_source\.actor_role/,
  );

  const contractValidator = migrationSection(
    "create or replace function public.directsign_validate_notification_contract_event_actor()",
    "drop trigger if exists contract_events_notification_actor_validate",
  );
  assert.match(contractValidator, /when new\.event_type = 'deliverables_ready_to_close' then 'system'/);
  assert.match(contractValidator, /authoritative production contract event actor is required/);
  assert.match(contractValidator, /new\.notification_actor_proof_at := clock_timestamp\(\)/);

  const contractProjector = migrationSection(
    "create or replace function public.project_contract_event_notification(",
    "revoke execute on function public.project_contract_event_notification(uuid)",
  );
  assert.match(contractProjector, /authoritative user contract event actor is required/);
  assert.match(contractProjector, /v_contract_event\.actor_profile_id is null/);
  assert.match(contractProjector, /notification_historical_actor_valid/);
});

test("influencer signup links only exact production contract-party emails", () => {
  const linker = migrationSection(
    "create or replace function public.directsign_link_influencer_contract_parties()",
    "drop trigger if exists profiles_link_influencer_contract_parties",
  );
  assert.match(linker, /party\.profile_id is null/);
  assert.match(linker, /lower\(btrim\(party\.email\)\) = lower\(btrim\(new\.email\)\)/);
  assert.match(linker, /new\.data_origin is distinct from 'production'/);
  assert.match(linker, /other\.data_origin = 'production'/);
  assert.match(linker, /contract\.data_origin = 'production'/);
  assert.match(migration, /profiles_link_influencer_contract_parties/);
});

test("deleted actors retry only through immutable occurrence-time proof", () => {
  const historicalActor = migrationSection(
    "create or replace function public.notification_historical_actor_valid(",
    "revoke execute on function public.notification_historical_actor_valid(uuid)",
  );
  assert.match(historicalActor, /p_actor_profile_id is null/);
  assert.match(historicalActor, /not exists \([\s\S]*?existing_actor/);
  assert.match(historicalActor, /production_actor\.data_origin = 'production'/);

  const contractValidator = migrationSection(
    "create or replace function public.directsign_validate_notification_contract_event_actor()",
    "drop trigger if exists contract_events_notification_actor_validate",
  );
  assert.match(contractValidator, /new\.notification_actor_proof_at := null/);
  assert.match(contractValidator, /existing_event\.id = new\.id/);
  assert.match(contractValidator, /new\.notification_actor_proof_at := clock_timestamp\(\)/);
  assert.match(contractValidator, /notification_safe_timestamptz/);

  const enqueue = migrationSection(
    "create or replace function public.enqueue_notification_event(",
    "revoke execute on function public.enqueue_notification_event(",
  );
  assert.match(enqueue, /contract_event\.notification_actor_proof_at is not null/);
  assert.match(enqueue, /proposal\.submitted_actor_proof_at is not null/);
  assert.match(enqueue, /proposal\.converted_actor_proof_at is not null/);
});

test("campaign application provenance rejects preconverted inserts and status-only conversion", () => {
  const submissionProof = migrationSection(
    "create or replace function public.directsign_capture_campaign_application_submission_proof()",
    "drop trigger if exists marketplace_campaign_application_submission_proof",
  );
  assert.match(submissionProof, /new\.status is distinct from 'submitted'/);
  assert.match(submissionProof, /new\.converted_contract_id is not null/);
  assert.match(submissionProof, /new\.converted_by_profile_id is not null/);
  assert.match(submissionProof, /new\.converted_at is not null/);
  assert.match(submissionProof, /new\.converted_actor_proof_at := null/);
  assert.match(submissionProof, /new\.submitted_actor_proof_at := clock_timestamp\(\)/);

  const conversionProof = migrationSection(
    "create or replace function public.directsign_protect_campaign_conversion_provenance()",
    "drop trigger if exists marketplace_campaign_conversion_provenance_immutable",
  );
  assert.match(
    conversionProof,
    /old\.status in \('submitted', 'reviewed', 'accepted'\)/,
  );
  assert.match(conversionProof, /new\.status = 'converted_to_contract'/);
  assert.match(conversionProof, /closed campaign application status is final/);
  assert.match(conversionProof, /declined campaign application status is final/);
  assert.match(
    conversionProof,
    /old\.status = 'converted_to_contract'[\s\S]*?new\.status not in \('converted_to_contract', 'closed'\)/,
  );
  assert.match(conversionProof, /old\.converted_contract_id is not null/);
  assert.match(conversionProof, /campaign conversion source status is not eligible/);
  assert.match(
    conversionProof,
    /campaign conversion proof must be captured with the status transition/,
  );
  assert.match(conversionProof, /complete campaign conversion provenance is required/);
  assert.match(conversionProof, /production campaign selection actor is not authorized/);
  assert.match(conversionProof, /selected_contract\.id = new\.converted_contract_id/);
  assert.match(conversionProof, /selected_contract\.deleted_at is null/);
  assert.match(conversionProof, /selected_contract\.data_origin = 'production'/);
  assert.match(
    conversionProof,
    /selected_contract\.owner_organization_id = campaign\.organization_id/,
  );
  assert.match(conversionProof, /selected_contract\.workflow_source = 'marketplace_campaign'/);
  assert.match(conversionProof, /selected_contract\.marketplace_campaign_id = new\.campaign_id/);
  assert.match(conversionProof, /selected_contract\.source_application_id = new\.id::text/);
  assert.match(conversionProof, /v_conversion_occurred_at := clock_timestamp\(\)/);
  assert.match(conversionProof, /new\.converted_at := v_conversion_occurred_at/);
  assert.match(conversionProof, /new\.converted_actor_proof_at := v_conversion_occurred_at/);
  assert.match(
    migration,
    /before update of\s+status, converted_contract_id, converted_by_profile_id, converted_at,\s+converted_actor_proof_at/,
  );
  assert.match(
    server,
    /if \(deterministicExisting\.existingContract\) \{[\s\S]*?await syncSupabaseV2Contract\(\s*deterministicExisting\.existingContract,?\s*\);[\s\S]*?await transitionMarketplaceProposalToContract\(/,
  );
  assert.match(server, /p_actor_profile_id: actorProfileId/);
});

test("malformed deliverable audit timestamps fail closed without breaking retries", () => {
  const safeTimestamp = migrationSection(
    "create or replace function public.notification_safe_timestamptz(",
    "revoke execute on function public.notification_safe_timestamptz(text)",
  );
  assert.match(safeTimestamp, /p_value !~/);
  assert.match(safeTimestamp, /exception when others then\s+return null/);
  assert.doesNotMatch(
    migration,
    /\(\s*[^)]*transition_occurred_at[^)]*\)::timestamptz/,
  );
});

test("null influencer party links have bounded exact-email retry", () => {
  const reconciler = migrationSection(
    "create or replace function public.reconcile_influencer_contract_party_links(",
    "revoke execute on function public.reconcile_influencer_contract_party_links(integer)",
  );
  assert.match(reconciler, /party\.profile_id is null/);
  assert.match(reconciler, /lower\(btrim\(profile\.email\)\) = lower\(btrim\(party\.email\)\)/);
  assert.match(reconciler, /profile\.data_origin = 'production'/);
  assert.match(reconciler, /for update of party skip locked/);
  assert.match(reconciler, /limit least\(greatest\(p_limit, 1\), 1000\)/);
  assert.match(server, /"reconcile_influencer_contract_party_links"/);
});
