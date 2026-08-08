import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260808130000_add_campaign_application_contacts.sql",
  import.meta.url,
);

const organizationId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";
const influencerId = "33333333-3333-4333-8333-333333333333";
const proposalId = "44444444-4444-4444-8444-444444444444";
const campaignId = "campaign-contact-test";
const consentVersion = "a".repeat(64);

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

  create table public.marketplace_brand_profiles (
    id uuid primary key,
    organization_id uuid not null references public.organizations (id)
  );

  create table public.marketplace_campaigns (
    id text primary key,
    brand_profile_id uuid not null references public.marketplace_brand_profiles (id),
    organization_id uuid not null references public.organizations (id),
    campaign_data jsonb not null default '{}'::jsonb,
    status text not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.marketplace_contact_proposals (
    id uuid primary key,
    direction text not null,
    target_brand_profile_id uuid,
    sender_profile_id uuid,
    campaign_id text,
    campaign_snapshot jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`;

const buildCampaignSnapshot = () => ({
  id: campaignId,
  brandId,
  brandName: "연락미",
  applicationContactFields: ["phone"],
  applicationContactConsentVersion: consentVersion,
});

const buildContactSnapshot = (phone = "010-1234-5678") => ({
  version: consentVersion,
  policy_version: "2026-08-08.1",
  fields: ["phone"],
  contact: { phone },
  accepted_at: "2026-08-08T00:00:00.000Z",
  actor_profile_id: influencerId,
  campaign_id: campaignId,
  recipient_brand_profile_id: brandId,
  recipient_organization_id: organizationId,
  recipient_name: "연락미",
  purpose: "캠페인 지원자 확인, 선정 및 진행 안내",
  retention_policy: "campaign_end_plus_90_days",
});

test("campaign application contacts require exact immutable consent evidence", async () => {
  const db = new PGlite();
  try {
    await db.exec(fixtureSql);
    await db.exec(await readFile(migrationUrl, "utf8"));
    await db.query("insert into public.organizations (id) values ($1)", [
      organizationId,
    ]);
    await db.query(
      "insert into public.marketplace_brand_profiles (id, organization_id) values ($1, $2)",
      [brandId, organizationId],
    );
    await db.query(
      `insert into public.marketplace_campaigns (
        id, brand_profile_id, organization_id, campaign_data, status, updated_at
      ) values ($1, $2, $3, $4, 'open', '2026-01-01T00:00:00Z')`,
      [
        campaignId,
        brandId,
        organizationId,
        JSON.stringify({ uploadDeadline: "2026-01-01" }),
      ],
    );

    await assert.rejects(
      db.query(
        `insert into public.marketplace_contact_proposals (
          id, direction, target_brand_profile_id, sender_profile_id,
          campaign_id, campaign_snapshot
        ) values ($1, 'influencer_to_brand', $2, $3, $4, $5)`,
        [
          "55555555-5555-4555-8555-555555555555",
          brandId,
          influencerId,
          campaignId,
          JSON.stringify(buildCampaignSnapshot()),
        ],
      ),
      /campaign application contact snapshot is required/,
    );

    await db.query(
      `insert into public.marketplace_contact_proposals (
        id, direction, target_brand_profile_id, sender_profile_id,
        campaign_id, campaign_snapshot, application_contact_snapshot,
        created_at, updated_at
      ) values ($1, 'influencer_to_brand', $2, $3, $4, $5, $6,
        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
      [
        proposalId,
        brandId,
        influencerId,
        campaignId,
        JSON.stringify(buildCampaignSnapshot()),
        JSON.stringify(buildContactSnapshot()),
      ],
    );

    await assert.rejects(
      db.query(
        "update public.marketplace_contact_proposals set application_contact_snapshot = $1 where id = $2",
        [JSON.stringify(buildContactSnapshot("010-9999-9999")), proposalId],
      ),
      /campaign application contact snapshot is immutable/,
    );

    const stored = await db.query<{ phone: string }>(
      "select application_contact_snapshot -> 'contact' ->> 'phone' as phone from public.marketplace_contact_proposals where id = $1",
      [proposalId],
    );
    assert.equal(stored.rows[0]?.phone, "010-1234-5678");
  } finally {
    await db.close();
  }
});

test("expired applicant contacts are redacted only by the service role sweep", async () => {
  const db = new PGlite();
  try {
    await db.exec(fixtureSql);
    await db.exec(await readFile(migrationUrl, "utf8"));
    await db.query("insert into public.organizations (id) values ($1)", [
      organizationId,
    ]);
    await db.query(
      "insert into public.marketplace_brand_profiles (id, organization_id) values ($1, $2)",
      [brandId, organizationId],
    );
    await db.query(
      `insert into public.marketplace_campaigns (
        id, brand_profile_id, organization_id, campaign_data, status, updated_at
      ) values ($1, $2, $3, $4, 'open', '2026-01-01T00:00:00Z')`,
      [
        campaignId,
        brandId,
        organizationId,
        JSON.stringify({ uploadDeadline: "2026-01-01" }),
      ],
    );
    await db.query(
      `insert into public.marketplace_contact_proposals (
        id, direction, target_brand_profile_id, sender_profile_id,
        campaign_id, campaign_snapshot, application_contact_snapshot,
        created_at, updated_at
      ) values ($1, 'influencer_to_brand', $2, $3, $4, $5, $6,
        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
      [
        proposalId,
        brandId,
        influencerId,
        campaignId,
        JSON.stringify(buildCampaignSnapshot()),
        JSON.stringify(buildContactSnapshot()),
      ],
    );
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);

    const result = await db.query<{ result: { redacted: number } }>(
      "select public.redact_expired_campaign_application_contacts($1, 10) as result",
      ["2026-04-02T00:00:00Z"],
    );
    assert.equal(result.rows[0]?.result.redacted, 1);

    const stored = await db.query<{ snapshot: unknown }>(
      "select application_contact_snapshot as snapshot from public.marketplace_contact_proposals where id = $1",
      [proposalId],
    );
    assert.equal(stored.rows[0]?.snapshot, null);
  } finally {
    await db.close();
  }
});
