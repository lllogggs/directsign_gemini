import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { isExpectedCampaignRevisionCurrent } from "../server/campaign-application-revision.js";

const migrationUrl = new URL(
  "../supabase/migrations/20260808160000_add_campaign_application_metrics_and_atomic_edit.sql",
  import.meta.url,
);
const serverUrl = new URL("../server/index.ts", import.meta.url);

const organizationId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const influencerId = "33333333-3333-4333-8333-333333333334";
const editCampaignId = "campaign-edit-full";
const presentationCampaignId = "campaign-edit-presentation";
const legacyPresentationCampaignId = "campaign-edit-legacy-presentation";
const lockedCampaignId = "campaign-edit-locked";
const staleApplicationCampaignId = "campaign-stale-application";
const initialRevision = "2026-08-08T00:00:00.000Z";

const fixtureSql = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;
  create function auth.role()
  returns text
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.role', true), '');
  $$;

  create table public.organizations (
    id uuid primary key
  );

  create table public.profiles (
    id uuid primary key,
    role text not null,
    email text not null,
    data_origin text not null default 'production'
  );

  create table public.organization_members (
    organization_id uuid not null,
    profile_id uuid not null,
    role text not null,
    primary key (organization_id, profile_id)
  );

  create table public.marketplace_brand_profiles (
    id uuid primary key,
    organization_id uuid not null,
    data_origin text not null default 'production',
    active_campaigns jsonb not null default '[]'::jsonb,
    archived_at timestamptz,
    updated_at timestamptz not null default now()
  );

  create table public.marketplace_campaigns (
    id text primary key,
    brand_profile_id uuid not null,
    organization_id uuid not null,
    campaign_data jsonb not null default '{}'::jsonb,
    status text not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
  );

  create table public.marketplace_contact_proposals (
    id uuid primary key,
    direction text not null,
    campaign_id text,
    target_brand_profile_id uuid,
    sender_profile_id uuid,
    data_origin text not null default 'production',
    submitted_actor_proof_at timestamptz,
    converted_actor_proof_at timestamptz,
    converted_contract_id text,
    converted_by_profile_id uuid,
    converted_at timestamptz,
    status text not null,
    campaign_snapshot jsonb,
    application_consent_snapshot jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`;

const campaignDocument = (id: string) => ({
  id,
  title: `Title ${id}`,
  type: "sponsored_post",
  applicantLimit: "10",
  location: "온라인",
  budget: "10,000원",
  summary: "Original terms",
  targetCountries: ["KR"],
  deadline: "2026-08-20",
  uploadDeadline: "2026-08-23",
  platforms: ["naver_blog"],
  deliverables: ["블로그 포스팅 1건"],
  requiredConsents: [],
  consentVersion: "initial-consent",
  status: "open",
  createdAt: initialRevision,
  updatedAt: initialRevision,
  activityEvents: [],
});

const editActivity = (id: string) => ({
  id,
  actor: "Advertiser",
  action: "campaign_details_updated",
  description: "Campaign details updated",
  createdAt: "2026-08-08T01:00:00.000Z",
});

test("campaign metrics and edit policy are enforced atomically in Postgres", async () => {
  const db = new PGlite();
  try {
    await db.exec(fixtureSql);
    await db.exec(await readFile(migrationUrl, "utf8"));
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);

    await db.query("insert into public.organizations (id) values ($1)", [
      organizationId,
    ]);
    await db.query(
      `insert into public.profiles (id, role, email, data_origin)
       values ($1, 'marketer', 'advertiser@example.test', 'production')`,
      [actorId],
    );
    await db.query(
      `insert into public.organization_members (organization_id, profile_id, role)
       values ($1, $2, 'owner')`,
      [organizationId, actorId],
    );
    await db.query(
      `insert into public.marketplace_brand_profiles (
         id, organization_id, data_origin, active_campaigns, updated_at
       ) values ($1, $2, 'production', '[]'::jsonb, $3)`,
      [brandId, organizationId, initialRevision],
    );
    for (const campaignId of [
      editCampaignId,
      presentationCampaignId,
      lockedCampaignId,
      staleApplicationCampaignId,
    ]) {
      await db.query(
        `insert into public.marketplace_campaigns (
           id, brand_profile_id, organization_id, campaign_data,
           status, created_at, updated_at
         ) values ($1, $2, $3, $4, 'open', $5, $5)`,
        [
          campaignId,
          brandId,
          organizationId,
          JSON.stringify(campaignDocument(campaignId)),
          initialRevision,
        ],
      );
    }
    await db.query(
      `insert into public.marketplace_campaigns (
         id, brand_profile_id, organization_id, campaign_data,
         status, created_at, updated_at
       ) values ($1, $2, $3, $4, 'open', $5, $5)`,
      [
        legacyPresentationCampaignId,
        brandId,
        organizationId,
        JSON.stringify({
          id: legacyPresentationCampaignId,
          title: "Legacy campaign",
          type: "sponsored_post",
          budget: "10,000원",
          status: "open",
          updatedAt: initialRevision,
          activityEvents: [],
        }),
        initialRevision,
      ],
    );
    await db.query(
      `update public.marketplace_campaigns
       set status = 'closed'
       where id = $1`,
      [lockedCampaignId],
    );

    const proposals = [
      // A declined historical snapshot must neither count nor be rewritten.
      [
        "40000000-0000-4000-8000-000000000001",
        editCampaignId,
        "production",
        initialRevision,
        "declined",
        { immutable: "snapshot", nested: { value: 1 } },
      ],
      [
        "40000000-0000-4000-8000-000000000002",
        presentationCampaignId,
        "production",
        initialRevision,
        "submitted",
        { status: "submitted" },
      ],
      [
        "40000000-0000-4000-8000-000000000003",
        presentationCampaignId,
        "production",
        initialRevision,
        "reviewed",
        { status: "reviewed" },
      ],
      [
        "40000000-0000-4000-8000-000000000004",
        presentationCampaignId,
        "qa",
        initialRevision,
        "submitted",
        { status: "qa" },
      ],
      [
        "40000000-0000-4000-8000-000000000005",
        presentationCampaignId,
        "production",
        null,
        "submitted",
        { status: "unproven" },
      ],
      [
        "40000000-0000-4000-8000-000000000006",
        presentationCampaignId,
        "production",
        initialRevision,
        "closed",
        { status: "closed" },
      ],
      [
        "40000000-0000-4000-8000-000000000007",
        lockedCampaignId,
        "production",
        initialRevision,
        "accepted",
        { status: "accepted" },
      ],
      [
        "40000000-0000-4000-8000-000000000010",
        legacyPresentationCampaignId,
        "production",
        initialRevision,
        "submitted",
        { immutable: "legacy-application-snapshot" },
      ],
    ] as const;
    for (const proposal of proposals) {
      await db.query(
        `insert into public.marketplace_contact_proposals (
           id, direction, campaign_id, target_brand_profile_id, data_origin,
           submitted_actor_proof_at, status, campaign_snapshot
         ) values ($1, 'influencer_to_brand', $2, $3, $4, $5, $6, $7)`,
        [
          proposal[0],
          proposal[1],
          brandId,
          proposal[2],
          proposal[3],
          proposal[4],
          JSON.stringify(proposal[5]),
        ],
      );
    }

    const counts = await db.query<{
      campaign_id: string;
      application_count: bigint;
    }>(
      `select *
       from public.get_public_marketplace_campaign_application_counts($1::text[])
       order by campaign_id`,
      [[editCampaignId, presentationCampaignId, lockedCampaignId]],
    );
    assert.deepEqual(
      counts.rows.map((row) => [row.campaign_id, Number(row.application_count)]),
      [
        [lockedCampaignId, 1],
        [presentationCampaignId, 2],
      ],
    );

    const snapshotBefore = await db.query<{ snapshot: string }>(
      `select campaign_snapshot::text as snapshot
       from public.marketplace_contact_proposals
       where campaign_id = $1`,
      [editCampaignId],
    );
    const fullEdit = await db.query<{
      result_outcome: string;
      result_mode: string;
      result_application_count: bigint;
      result_campaign_data: Record<string, unknown>;
    }>(
      `select * from public.update_marketplace_campaign_details(
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )`,
      [
        editCampaignId,
        brandId,
        organizationId,
        actorId,
        initialRevision,
        JSON.stringify({
          title: "Updated campaign",
          type: "product_seeding",
          otherTypeLabel: null,
          applicantLimit: "20",
          location: "전국",
          offer: "제품 제공",
          budget: "20,000원",
          summary: "Updated terms",
          mission: "가입 과정 소개",
          targetCountries: ["KR"],
          thumbnailUrl: "https://yeollock.me/og-image.png",
          deadline: "2026-08-21",
          uploadDeadline: "2026-08-24",
          platforms: ["naver_blog"],
          deliverables: ["블로그 포스팅 1건"],
          applicationContactFields: ["phone"],
          applicationContactConsentVersion: "contact-v2",
          requiredConsents: [{ id: "contact", text: "연락처 제공 동의" }],
          consentVersion: "consent-v2",
        }),
        JSON.stringify(editActivity("event-full")),
      ],
    );
    assert.equal(fullEdit.rows[0].result_outcome, "updated");
    assert.equal(fullEdit.rows[0].result_mode, "full");
    assert.equal(Number(fullEdit.rows[0].result_application_count), 0);
    assert.equal(fullEdit.rows[0].result_campaign_data.summary, "Updated terms");
    assert.equal(fullEdit.rows[0].result_campaign_data.type, "product_seeding");
    assert.deepEqual(fullEdit.rows[0].result_campaign_data.applicationContactFields, [
      "phone",
    ]);

    const snapshotAfter = await db.query<{ snapshot: string }>(
      `select campaign_snapshot::text as snapshot
       from public.marketplace_contact_proposals
       where campaign_id = $1`,
      [editCampaignId],
    );
    assert.equal(snapshotAfter.rows[0].snapshot, snapshotBefore.rows[0].snapshot);

    const staleEdit = await db.query<{ result_outcome: string }>(
      `select * from public.update_marketplace_campaign_details(
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )`,
      [
        editCampaignId,
        brandId,
        organizationId,
        actorId,
        initialRevision,
        JSON.stringify({ title: "Stale title" }),
        JSON.stringify(editActivity("event-stale")),
      ],
    );
    assert.equal(staleEdit.rows[0].result_outcome, "conflict");

    const termsLocked = await db.query<{
      result_outcome: string;
      result_mode: string;
      result_application_count: bigint;
      result_locked_fields: string[];
    }>(
      `select * from public.update_marketplace_campaign_details(
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )`,
      [
        presentationCampaignId,
        brandId,
        organizationId,
        actorId,
        initialRevision,
        JSON.stringify({ summary: "Changed after applications" }),
        JSON.stringify(editActivity("event-terms")),
      ],
    );
    assert.equal(termsLocked.rows[0].result_outcome, "fields_locked");
    assert.equal(termsLocked.rows[0].result_mode, "presentation_only");
    assert.equal(Number(termsLocked.rows[0].result_application_count), 2);
    assert.ok(termsLocked.rows[0].result_locked_fields.includes("summary"));
    assert.ok(!termsLocked.rows[0].result_locked_fields.includes("title"));

    const presentationEdit = await db.query<{
      result_outcome: string;
      result_mode: string;
      result_campaign_data: Record<string, unknown>;
    }>(
      `select * from public.update_marketplace_campaign_details(
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )`,
      [
        presentationCampaignId,
        brandId,
        organizationId,
        actorId,
        initialRevision,
        JSON.stringify({ title: "Presentation-only title" }),
        JSON.stringify(editActivity("event-presentation")),
      ],
    );
    assert.equal(presentationEdit.rows[0].result_outcome, "updated");
    assert.equal(presentationEdit.rows[0].result_mode, "presentation_only");
    assert.equal(
      presentationEdit.rows[0].result_campaign_data.title,
      "Presentation-only title",
    );

    const legacyPresentationEdit = await db.query<{
      result_outcome: string;
      result_mode: string;
      result_application_count: bigint;
      result_campaign_data: Record<string, unknown>;
    }>(
      `select * from public.update_marketplace_campaign_details(
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )`,
      [
        legacyPresentationCampaignId,
        brandId,
        organizationId,
        actorId,
        initialRevision,
        JSON.stringify({
          title: "Legacy presentation updated",
          thumbnailUrl: "https://yeollock.me/og-image.png",
        }),
        JSON.stringify(editActivity("event-legacy-presentation")),
      ],
    );
    assert.equal(legacyPresentationEdit.rows[0].result_outcome, "updated");
    assert.equal(
      legacyPresentationEdit.rows[0].result_mode,
      "presentation_only",
    );
    assert.equal(
      Number(legacyPresentationEdit.rows[0].result_application_count),
      1,
    );
    assert.equal(
      legacyPresentationEdit.rows[0].result_campaign_data.title,
      "Legacy presentation updated",
    );
    assert.equal(
      legacyPresentationEdit.rows[0].result_campaign_data.thumbnailUrl,
      "https://yeollock.me/og-image.png",
    );
    assert.equal(
      Object.hasOwn(legacyPresentationEdit.rows[0].result_campaign_data, "summary"),
      false,
    );

    const closedLocked = await db.query<{
      result_outcome: string;
      result_mode: string;
      result_policy_reason: string;
    }>(
      `select * from public.update_marketplace_campaign_details(
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )`,
      [
        lockedCampaignId,
        brandId,
        organizationId,
        actorId,
        initialRevision,
        JSON.stringify({ title: "Cannot edit" }),
        JSON.stringify(editActivity("event-locked")),
      ],
    );
    assert.equal(closedLocked.rows[0].result_outcome, "locked");
    assert.equal(closedLocked.rows[0].result_mode, "locked");
    assert.equal(
      closedLocked.rows[0].result_policy_reason,
      "campaign_closed",
    );

    const mirror = await db.query<{ active_campaigns: unknown[] }>(
      `select active_campaigns
       from public.marketplace_brand_profiles
       where id = $1`,
      [brandId],
    );
    assert.ok(
      mirror.rows[0].active_campaigns.some(
        (campaign) =>
          typeof campaign === "object" &&
          campaign !== null &&
          (campaign as Record<string, unknown>).id === editCampaignId &&
        (campaign as Record<string, unknown>).summary === "Updated terms",
      ),
    );

    await db.query(
      `insert into public.profiles (id, role, email, data_origin)
       values ($1, 'influencer', 'creator@validmail.co.kr', 'production')`,
      [influencerId],
    );
    await db.exec(`
      create trigger marketplace_campaign_application_submission_proof
      before insert on public.marketplace_contact_proposals
      for each row execute function
        public.directsign_capture_campaign_application_submission_proof()
    `);

    await db.query(
      `select * from public.update_marketplace_campaign_details(
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb
      )`,
      [
        staleApplicationCampaignId,
        brandId,
        organizationId,
        actorId,
        initialRevision,
        JSON.stringify({ summary: "Terms changed during application" }),
        JSON.stringify(editActivity("event-race")),
      ],
    );

    const staleProposalId = "40000000-0000-4000-8000-000000000008";
    await assert.rejects(
      db.query(
        `insert into public.marketplace_contact_proposals (
           id, direction, campaign_id, target_brand_profile_id,
           sender_profile_id, data_origin, status, campaign_snapshot,
           application_consent_snapshot
         ) values (
           $1, 'influencer_to_brand', $2, $3, $4, 'production',
           'submitted', $5::jsonb, $6::jsonb
         )`,
        [
          staleProposalId,
          staleApplicationCampaignId,
          brandId,
          influencerId,
          JSON.stringify({
            campaignRevision: initialRevision,
            summary: "Original terms",
            consentVersion: "old-consent",
          }),
          JSON.stringify({ version: "old-consent" }),
        ],
      ),
      /campaign application snapshot revision is stale/,
    );
    const staleRows = await db.query<{ count: bigint }>(
      `select count(*)::bigint as count
       from public.marketplace_contact_proposals
       where id = $1`,
      [staleProposalId],
    );
    assert.equal(Number(staleRows.rows[0].count), 0);

    const latestRevision = await db.query<{ revision: string }>(
      `select updated_at::text as revision
       from public.marketplace_campaigns
       where id = $1`,
      [staleApplicationCampaignId],
    );
    const currentProposalId = "40000000-0000-4000-8000-000000000009";
    await db.query(
      `insert into public.marketplace_contact_proposals (
         id, direction, campaign_id, target_brand_profile_id,
         sender_profile_id, data_origin, status, campaign_snapshot,
         application_consent_snapshot
       ) values (
         $1, 'influencer_to_brand', $2, $3, $4, 'production',
         'submitted', $5::jsonb, $6::jsonb
       )`,
      [
        currentProposalId,
        staleApplicationCampaignId,
        brandId,
        influencerId,
        JSON.stringify({
          campaignRevision: latestRevision.rows[0].revision,
          summary: "Terms changed during application",
          consentVersion: "current-consent",
        }),
        JSON.stringify({ version: "current-consent" }),
      ],
    );
    const currentRows = await db.query<{
      submitted_actor_proof_at: string | null;
    }>(
      `select submitted_actor_proof_at
       from public.marketplace_contact_proposals
       where id = $1`,
      [currentProposalId],
    );
    assert.ok(currentRows.rows[0].submitted_actor_proof_at);
  } finally {
    await db.close();
  }
});

test("campaign application revision rejects a stale view and accepts the current view", () => {
  const revisionSeenByApplicant = "2026-08-08T00:00:00.000Z";
  const authoritativeRevision = "2026-08-08T01:00:00.000Z";

  assert.equal(
    isExpectedCampaignRevisionCurrent(
      revisionSeenByApplicant,
      authoritativeRevision,
    ),
    false,
  );
  assert.equal(
    isExpectedCampaignRevisionCurrent(
      authoritativeRevision,
      authoritativeRevision,
    ),
    true,
  );
  assert.equal(
    isExpectedCampaignRevisionCurrent(undefined, authoritativeRevision),
    false,
  );
});

test("server wires aggregate counts, structured edit errors, and best-effort cache invalidation", async () => {
  const server = await readFile(serverUrl, "utf8");
  const migration = await readFile(migrationUrl, "utf8");
  const applicationSource = server.slice(
    server.indexOf("const submitMarketplaceCampaignApplication"),
    server.indexOf("const saveInfluencerMarketplaceAvatar"),
  );
  const transitionSource = server.slice(
    server.indexOf("const transitionMarketplaceProposalToContract"),
    server.indexOf("const readMarketplaceMessagesForInfluencer"),
  );
  const editSource = server.slice(
    server.indexOf("const updateAdvertiserMarketplaceCampaign = async"),
    server.indexOf("const updateAdvertiserMarketplaceCampaignStatus"),
  );
  const presentationValidationSource = server.slice(
    server.indexOf("const isMarketplaceCampaignPresentationOnlyEdit"),
    server.indexOf("const buildMarketplaceCampaignEditInput"),
  );
  const campaignListRouteSource = server.slice(
    server.indexOf('app.get("/api/marketplace/campaigns"'),
    server.indexOf('app.get("/api/marketplace/campaigns/:campaignId"'),
  );
  const campaignDetailRouteSource = server.slice(
    server.indexOf('app.get("/api/marketplace/campaigns/:campaignId"'),
    server.indexOf("app.post(\n  \"/api/marketplace/campaigns/:campaignId/applications\""),
  );
  const freshResponseSource = server.slice(
    server.indexOf("const isValidPublicMarketplaceFreshQuery"),
    server.indexOf("const warmPublicMarketplaceCache"),
  );
  const publicImageNormalizerSource = server.slice(
    server.indexOf("const normalizeMarketplacePublicImageUrl"),
    server.indexOf("const formatStoredMarketplacePlatformHandle"),
  );

  assert.match(
    server,
    /get_public_marketplace_campaign_application_counts/,
  );
  assert.match(server, /applicationCount:\s*campaign\.id/);
  assert.match(server, /activityEvents:\s*_activityEvents/);
  assert.match(server, /statusUpdatedBy:\s*_statusUpdatedBy/);
  assert.match(applicationSource, /await clearPublicMarketplaceCampaignCache\(\)/);
  assert.match(transitionSource, /proposal\.campaign_id[\s\S]*?clearPublicMarketplaceCampaignCache/);
  assert.match(server, /const clearPublicMarketplaceCampaignCache = \(\) => \{[\s\S]*?\.catch\(/);
  assert.match(editSource, /expectedUpdatedAt/);
  assert.ok(
    editSource.indexOf("isMarketplaceCampaignPresentationOnlyEdit") <
      editSource.indexOf("validateMarketplaceCampaignInput"),
  );
  assert.match(
    presentationValidationSource,
    /field === "title" \|\| field === "thumbnailUrl"/,
  );
  assert.match(
    presentationValidationSource,
    /normalizeMarketplacePublicImageUrl/,
  );
  assert.match(editSource, /updateMarketplaceCampaignDetailsAtomically/);
  assert.match(editSource, /code: "campaign_edit_conflict"/);
  assert.match(editSource, /code: "campaign_edit_fields_locked"/);
  assert.match(editSource, /code: "campaign_edit_locked"/);
  assert.match(server, /app\.patch\("\/api\/advertiser\/campaigns\/:id"/);
  assert.match(server, /edit_policy: result\.edit_policy/);
  for (const routeSource of [
    campaignListRouteSource,
    campaignDetailRouteSource,
  ]) {
    assert.match(
      routeSource,
      /isValidPublicMarketplaceFreshQuery\(request\.query\.fresh\)/,
    );
    assert.match(
      routeSource,
      /fresh\s*\? await readMarketplaceCampaignPosts\(\)\s*:\s*await readPublicMarketplaceCache/,
    );
    assert.match(routeSource, /sendFreshPublicMarketplaceJson/);
  }
  assert.match(
    freshResponseSource,
    /Cache-Control", "private, no-store"/,
  );
  assert.match(freshResponseSource, /Vercel-CDN-Cache-Control", "no-store"/);
  assert.match(freshResponseSource, /Vary", "Cookie"/);
  assert.match(publicImageNormalizerSource, /url\.hostname === "yeollock\.me"/);
  assert.match(
    publicImageNormalizerSource,
    /return `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`/,
  );
  assert.match(
    server,
    /findMarketplaceCampaignApplicationTargetById[\s\S]*?campaignRow\.updated_at/,
  );
  assert.match(
    applicationSource,
    /buildMarketplaceCampaignSnapshot\([\s\S]*?applicationTarget\.campaignRevision/,
  );
  assert.match(
    applicationSource,
    /const expectedCampaignRevision = body\.expectedCampaignRevision/,
  );
  assert.match(
    applicationSource,
    /isExpectedCampaignRevisionCurrent\([\s\S]*?applicationTarget\.campaignRevision/,
  );
  assert.ok(
    applicationSource.indexOf("isExpectedCampaignRevisionCurrent") <
      applicationSource.indexOf("validateCampaignApplicationConsent"),
  );
  assert.ok(
    applicationSource.indexOf("isExpectedCampaignRevisionCurrent") <
      applicationSource.indexOf("insertSupabaseRowsReturning"),
  );
  assert.match(applicationSource, /code: "campaign_application_stale"/);
  assert.match(server, /updatedAt: row\.updated_at/);
  assert.match(
    migration,
    /for key share[\s\S]*?campaignRevision[\s\S]*?v_campaign\.updated_at/,
  );
});
