import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260811197000_atomic_campaign_status_transitions.sql",
  import.meta.url,
);

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  brand: "22222222-2222-4222-8222-222222222222",
  actor: "33333333-3333-4333-8333-333333333333",
  application: "44444444-4444-4444-8444-444444444444",
  endedApplication: "44444444-4444-4444-8444-444444444445",
  unmatchedApplication: "44444444-4444-4444-8444-444444444446",
  contract: "55555555-5555-4555-8555-555555555555",
  unrelatedContract: "66666666-6666-4666-8666-666666666666",
};

const setupSql = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;
  create function auth.role()
  returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '');
  $$;

  create table public.profiles (
    id uuid primary key,
    role text not null,
    email text not null default 'advertiser@example.test'
  );
  create table public.organizations (id uuid primary key);
  create table public.organization_members (
    organization_id uuid not null,
    profile_id uuid not null,
    role text not null,
    primary key (organization_id, profile_id)
  );
  create table public.marketplace_brand_profiles (
    id uuid primary key,
    organization_id uuid not null,
    active_campaigns jsonb not null default '[]'::jsonb,
    status_label text,
    is_published boolean not null default false,
    archived_at timestamptz,
    updated_at timestamptz not null default now()
  );
  create table public.marketplace_campaigns (
    id text primary key,
    brand_profile_id uuid not null,
    organization_id uuid not null,
    campaign_data jsonb not null default '{}'::jsonb,
    status text not null default 'draft',
    first_published_at timestamptz,
    organization_campaign_sequence bigint,
    verification_gate_basis text,
    publication_request_key text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
  );
  create table public.marketplace_contact_proposals (
    id uuid primary key,
    direction text not null,
    campaign_id text,
    target_brand_profile_id uuid,
    status text not null,
    converted_contract_id uuid,
    updated_at timestamptz not null default now()
  );
  create table public.contracts (
    id uuid primary key,
    workflow_source text,
    marketplace_campaign_id text,
    source_application_id text,
    status text not null,
    deleted_at timestamptz
  );

  create or replace function public.publish_marketplace_campaign(
    p_campaign_id text,
    p_brand_profile_id uuid,
    p_organization_id uuid,
    p_actor_profile_id uuid,
    p_campaign_data jsonb,
    p_publication_request_key text
  )
  returns table (
    result_allowed boolean,
    result_created boolean,
    result_campaign_id text,
    result_brand_profile_id uuid,
    result_campaign_data jsonb,
    result_status text,
    result_first_published_at timestamptz,
    result_organization_campaign_sequence bigint,
    result_verification_gate_basis text,
    result_published_count bigint,
    result_business_verified boolean
  )
  language plpgsql security definer set search_path = '' as $$
  declare
    v_campaign public.marketplace_campaigns%rowtype;
    v_created boolean := false;
    v_now timestamptz := clock_timestamp();
    v_mirror jsonb;
  begin
    select campaign.* into v_campaign
    from public.marketplace_campaigns as campaign
    where campaign.id = p_campaign_id;

    if found and v_campaign.organization_campaign_sequence is not null then
      return query select
        true, false, v_campaign.id, v_campaign.brand_profile_id,
        v_campaign.campaign_data, v_campaign.status,
        v_campaign.first_published_at,
        v_campaign.organization_campaign_sequence,
        v_campaign.verification_gate_basis,
        v_campaign.organization_campaign_sequence,
        true;
      return;
    elsif found then
      update public.marketplace_campaigns as campaign
      set campaign_data = p_campaign_data,
          status = 'open',
          first_published_at = v_now,
          organization_campaign_sequence = 1,
          verification_gate_basis = 'intro_exempt',
          publication_request_key = p_publication_request_key,
          updated_at = v_now
      where campaign.id = p_campaign_id
      returning campaign.* into v_campaign;
    else
      v_created := true;
      insert into public.marketplace_campaigns (
        id, brand_profile_id, organization_id, campaign_data, status,
        first_published_at, organization_campaign_sequence,
        verification_gate_basis, publication_request_key, created_at, updated_at
      ) values (
        p_campaign_id, p_brand_profile_id, p_organization_id,
        p_campaign_data, 'open', v_now, 1, 'intro_exempt',
        p_publication_request_key, v_now, v_now
      ) returning * into v_campaign;
    end if;

    select jsonb_agg(campaign.campaign_data || jsonb_build_object(
      'id', campaign.id, 'status', campaign.status, 'updatedAt', campaign.updated_at
    )) into v_mirror
    from public.marketplace_campaigns as campaign
    where campaign.brand_profile_id = p_brand_profile_id
      and campaign.archived_at is null;
    update public.marketplace_brand_profiles as brand
    set active_campaigns = coalesce(v_mirror, '[]'::jsonb),
        is_published = true,
        updated_at = v_now
    where brand.id = p_brand_profile_id;

    return query select
      true, v_created, v_campaign.id, v_campaign.brand_profile_id,
      v_campaign.campaign_data, v_campaign.status,
      v_campaign.first_published_at,
      v_campaign.organization_campaign_sequence,
      v_campaign.verification_gate_basis,
      1::bigint,
      true;
  end;
  $$;

  create or replace function public.finalize_marketplace_campaign_recruitment(
    p_campaign_id text,
    p_brand_profile_id uuid,
    p_organization_id uuid,
    p_actor_profile_id uuid,
    p_campaign_data jsonb
  )
  returns table (
    result_campaign_id text,
    result_campaign_data jsonb,
    result_status text,
    result_not_selected_count bigint
  )
  language plpgsql security definer set search_path = '' as $$
  declare
    v_campaign public.marketplace_campaigns%rowtype;
    v_now timestamptz := clock_timestamp();
    v_not_selected bigint := 0;
  begin
    update public.marketplace_campaigns as campaign
    set campaign_data = p_campaign_data || jsonb_build_object(
          'status', 'closed', 'updatedAt', v_now
        ),
        status = 'closed',
        updated_at = v_now
    where campaign.id = p_campaign_id
    returning campaign.* into v_campaign;
    update public.marketplace_contact_proposals as application
    set status = 'declined', updated_at = v_now
    where application.campaign_id = p_campaign_id
      and application.converted_contract_id is null
      and application.status in ('submitted', 'reviewed');
    get diagnostics v_not_selected = row_count;
    update public.marketplace_brand_profiles as brand
    set active_campaigns = jsonb_build_array(
          v_campaign.campaign_data || jsonb_build_object('id', v_campaign.id)
        ),
        status_label = '모집 종료',
        updated_at = v_now
    where brand.id = p_brand_profile_id;
    return query select
      v_campaign.id, v_campaign.campaign_data, v_campaign.status, v_not_selected;
  end;
  $$;
`;

const campaignDocument = (id: string, status: string, updatedAt: string) => ({
  id,
  title: `Campaign ${id}`,
  type: "sponsored_post",
  budget: "10,000원",
  status,
  createdAt: updatedAt,
  updatedAt,
  activityEvents: [],
});

test("campaign publication and lifecycle transitions use authoritative CAS", async () => {
  const db = new PGlite();
  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)).rows[0] as Record<string, unknown>;
  const revision = "2026-08-11T00:00:00.000Z";

  try {
    await db.exec(setupSql);
    await db.exec(await readFile(migrationUrl, "utf8"));
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);
    await db.query(`insert into public.organizations(id) values($1)`, [
      ids.organization,
    ]);
    await db.query(
      `insert into public.profiles(id,role) values($1,'marketer')`,
      [ids.actor],
    );
    await db.query(
      `insert into public.organization_members(organization_id,profile_id,role)
       values($1,$2,'owner')`,
      [ids.organization, ids.actor],
    );
    await db.query(
      `insert into public.marketplace_brand_profiles(id,organization_id,updated_at)
       values($1,$2,$3)`,
      [ids.brand, ids.organization, revision],
    );

    assert.equal(
      (
        await one(
          `select has_function_privilege('anon',
            'public.transition_marketplace_campaign_status_cas(text,uuid,uuid,uuid,text,jsonb,timestamptz)',
            'execute') as allowed`,
        )
      ).allowed,
      false,
    );
    assert.equal(
      (
        await one(
          `select has_function_privilege('service_role',
            'public.transition_marketplace_campaign_status_cas(text,uuid,uuid,uuid,text,jsonb,timestamptz)',
            'execute') as allowed`,
        )
      ).allowed,
      true,
    );

    const draftId = "campaign-draft";
    await db.query(
      `insert into public.marketplace_campaigns(
         id,brand_profile_id,organization_id,campaign_data,status,created_at,updated_at
       ) values($1,$2,$3,$4,'draft',$5,$5)`,
      [
        draftId,
        ids.brand,
        ids.organization,
        JSON.stringify(campaignDocument(draftId, "draft", revision)),
        revision,
      ],
    );
    const published = await one(
      `select * from public.publish_marketplace_campaign_cas(
        $1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz
      )`,
      [
        draftId,
        ids.brand,
        ids.organization,
        ids.actor,
        JSON.stringify(campaignDocument(draftId, "open", revision)),
        "publish-draft",
        revision,
      ],
    );
    assert.equal(published.result_status, "open");

    const staleId = "campaign-stale";
    await db.query(
      `insert into public.marketplace_campaigns(
         id,brand_profile_id,organization_id,campaign_data,status,created_at,updated_at
       ) values($1,$2,$3,$4,'draft',$5,$5)`,
      [
        staleId,
        ids.brand,
        ids.organization,
        JSON.stringify(campaignDocument(staleId, "draft", revision)),
        "2026-08-11T00:01:00.000Z",
      ],
    );
    await assert.rejects(
      db.query(
        `select * from public.publish_marketplace_campaign_cas(
          $1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz
        )`,
        [
          staleId,
          ids.brand,
          ids.organization,
          ids.actor,
          JSON.stringify(campaignDocument(staleId, "open", revision)),
          "publish-stale",
          revision,
        ],
      ),
      /MARKETPLACE_CAMPAIGN_VERSION_CONFLICT/,
    );

    const newId = "campaign-new";
    const created = await one(
      `select * from public.publish_marketplace_campaign_cas(
        $1,$2,$3,$4,$5::jsonb,$6,null::timestamptz
      )`,
      [
        newId,
        ids.brand,
        ids.organization,
        ids.actor,
        JSON.stringify(campaignDocument(newId, "open", revision)),
        "publish-new",
      ],
    );
    assert.equal(created.result_created, true);

    const closeId = "campaign-close";
    await db.query(
      `insert into public.marketplace_campaigns(
         id,brand_profile_id,organization_id,campaign_data,status,created_at,updated_at
       ) values($1,$2,$3,$4,'open',$5,$5)`,
      [
        closeId,
        ids.brand,
        ids.organization,
        JSON.stringify(campaignDocument(closeId, "open", revision)),
        revision,
      ],
    );
    await db.query(
      `insert into public.marketplace_contact_proposals(
        id,direction,campaign_id,target_brand_profile_id,status
      ) values($1,'influencer_to_brand',$2,$3,'submitted')`,
      [ids.application, closeId, ids.brand],
    );
    const finalized = await one(
      `select * from public.finalize_marketplace_campaign_recruitment_cas(
        $1,$2,$3,$4,$5::jsonb,$6::timestamptz
      )`,
      [
        closeId,
        ids.brand,
        ids.organization,
        ids.actor,
        JSON.stringify(campaignDocument(closeId, "closed", revision)),
        revision,
      ],
    );
    assert.equal(finalized.result_status, "closed");
    assert.equal(finalized.result_not_selected_count, 1);

    const closedRevision = String(
      (
        await one(
          `select updated_at::text as updated_at
           from public.marketplace_campaigns where id=$1`,
          [closeId],
        )
      ).updated_at,
    );
    const reopened = await one(
      `select * from public.transition_marketplace_campaign_status_cas(
        $1,$2,$3,$4,'open',$5::jsonb,$6::timestamptz
      )`,
      [
        closeId,
        ids.brand,
        ids.organization,
        ids.actor,
        JSON.stringify(campaignDocument(closeId, "open", closedRevision)),
        closedRevision,
      ],
    );
    assert.equal(reopened.outcome, "updated");

    const endedId = "campaign-ended";
    await db.query(
      `insert into public.marketplace_campaigns(
         id,brand_profile_id,organization_id,campaign_data,status,created_at,updated_at
       ) values($1,$2,$3,$4,'closed',$5,$5)`,
      [
        endedId,
        ids.brand,
        ids.organization,
        JSON.stringify(campaignDocument(endedId, "closed", revision)),
        revision,
      ],
    );
    await db.query(
      `insert into public.marketplace_contact_proposals(
        id,direction,campaign_id,target_brand_profile_id,status,converted_contract_id
      ) values($1,'influencer_to_brand',$2,$3,'converted_to_contract',$4)`,
      [ids.endedApplication, endedId, ids.brand, ids.contract],
    );
    await db.query(
      `insert into public.contracts(
        id,workflow_source,marketplace_campaign_id,source_application_id,status
      ) values($1,'marketplace_campaign',$2,$3,'completed')`,
      [ids.contract, endedId, ids.endedApplication],
    );
    const ended = await one(
      `select * from public.transition_marketplace_campaign_status_cas(
        $1,$2,$3,$4,'ended',$5::jsonb,$6::timestamptz
      )`,
      [
        endedId,
        ids.brand,
        ids.organization,
        ids.actor,
        JSON.stringify(campaignDocument(endedId, "ended", revision)),
        revision,
      ],
    );
    assert.equal(ended.outcome, "updated");

    const unmatchedId = "campaign-unmatched";
    await db.query(
      `insert into public.marketplace_campaigns(
         id,brand_profile_id,organization_id,campaign_data,status,created_at,updated_at
       ) values($1,$2,$3,$4,'closed',$5,$5)`,
      [
        unmatchedId,
        ids.brand,
        ids.organization,
        JSON.stringify(campaignDocument(unmatchedId, "closed", revision)),
        revision,
      ],
    );
    await db.query(
      `insert into public.marketplace_contact_proposals(
        id,direction,campaign_id,target_brand_profile_id,status
      ) values($1,'influencer_to_brand',$2,$3,'accepted')`,
      [ids.unmatchedApplication, unmatchedId, ids.brand],
    );
    await db.query(
      `insert into public.contracts(
        id,workflow_source,marketplace_campaign_id,source_application_id,status
      ) values($1,'marketplace_campaign',$2,null,'completed')`,
      [ids.unrelatedContract, unmatchedId],
    );
    const unmatched = await one(
      `select * from public.transition_marketplace_campaign_status_cas(
        $1,$2,$3,$4,'ended',$5::jsonb,$6::timestamptz
      )`,
      [
        unmatchedId,
        ids.brand,
        ids.organization,
        ids.actor,
        JSON.stringify(campaignDocument(unmatchedId, "ended", revision)),
        revision,
      ],
    );
    assert.equal(unmatched.outcome, "invalid_transition");
    assert.equal(
      (
        await one(`select status from public.marketplace_campaigns where id=$1`, [
          unmatchedId,
        ])
      ).status,
      "closed",
    );

    const currentRevision = String(
      (
        await one(`select updated_at from public.marketplace_campaigns where id=$1`, [
          unmatchedId,
        ])
      ).updated_at,
    );
    const stale = await one(
      `select * from public.transition_marketplace_campaign_status_cas(
        $1,$2,$3,$4,'open',$5::jsonb,$6::timestamptz
      )`,
      [
        unmatchedId,
        ids.brand,
        ids.organization,
        ids.actor,
        JSON.stringify(campaignDocument(unmatchedId, "open", revision)),
        "2026-08-10T23:59:59.000Z",
      ],
    );
    assert.equal(stale.outcome, "version_conflict");
    assert.notEqual(currentRevision, "");
  } finally {
    await db.close();
  }
});

test("campaign status and brand mirror roll back together", async () => {
  const db = new PGlite();
  const revision = "2026-08-11T00:00:00.000Z";
  const campaignId = "campaign-rollback";
  try {
    await db.exec(setupSql);
    await db.exec(await readFile(migrationUrl, "utf8"));
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);
    await db.query(`insert into public.organizations(id) values($1)`, [ids.organization]);
    await db.query(`insert into public.profiles(id,role) values($1,'marketer')`, [
      ids.actor,
    ]);
    await db.query(
      `insert into public.organization_members(organization_id,profile_id,role)
       values($1,$2,'owner')`,
      [ids.organization, ids.actor],
    );
    await db.query(
      `insert into public.marketplace_brand_profiles(id,organization_id,updated_at)
       values($1,$2,$3)`,
      [ids.brand, ids.organization, revision],
    );
    await db.query(
      `insert into public.marketplace_campaigns(
        id,brand_profile_id,organization_id,campaign_data,status,created_at,updated_at
      ) values($1,$2,$3,$4,'closed',$5,$5)`,
      [
        campaignId,
        ids.brand,
        ids.organization,
        JSON.stringify(campaignDocument(campaignId, "closed", revision)),
        revision,
      ],
    );
    await db.exec(`
      create function public.fail_campaign_brand_mirror()
      returns trigger language plpgsql as $$
      begin
        raise exception 'forced brand mirror failure';
      end;
      $$;
      create trigger fail_campaign_brand_mirror
      before update on public.marketplace_brand_profiles
      for each row execute function public.fail_campaign_brand_mirror();
    `);

    await assert.rejects(
      db.query(
        `select * from public.transition_marketplace_campaign_status_cas(
          $1,$2,$3,$4,'open',$5::jsonb,$6::timestamptz
        )`,
        [
          campaignId,
          ids.brand,
          ids.organization,
          ids.actor,
          JSON.stringify(campaignDocument(campaignId, "open", revision)),
          revision,
        ],
      ),
      /forced brand mirror failure/,
    );
    const row = (
      await db.query(`select status,updated_at from public.marketplace_campaigns where id=$1`, [
        campaignId,
      ])
    ).rows[0] as Record<string, unknown>;
    assert.equal(row.status, "closed");
    assert.equal(new Date(String(row.updated_at)).toISOString(), revision);
  } finally {
    await db.close();
  }
});
