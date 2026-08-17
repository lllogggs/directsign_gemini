import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

type Row = Record<string, unknown>;
const firstRow = (result: { rows: unknown[] }) =>
  result.rows[0] as Row | undefined;

test("direct-sign mutations, quota, audit, close, and erasure stay atomic", async () => {
const db = new PGlite({ extensions: { pgcrypto } });

const one = async (sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows[0] as Row;

const count = async (table: string) =>
  Number((await one(`select count(*)::integer as value from ${table}`)).value);

const setup = String.raw`
create role anon;
create role authenticated;
create role service_role;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema storage;

create type public.directsign_contract_status as enum (
  'draft', 'negotiating', 'signing', 'active', 'completed', 'cancelled'
);
create type public.directsign_contract_party_role as enum (
  'advertiser', 'marketer', 'agency', 'influencer',
  'creator_manager', 'approver', 'viewer'
);
create type public.directsign_review_status as enum (
  'draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'waived'
);
create type public.directsign_deliverable_type as enum (
  'post', 'reels', 'shorts', 'video', 'story', 'live', 'blog', 'other'
);
create type public.directsign_file_type as enum (
  'contract_pdf', 'snapshot_pdf', 'attachment', 'evidence', 'screenshot',
  'settlement_report', 'signature_image', 'other'
);

create table public.profiles (
  id uuid primary key,
  name text not null default 'QA'
);
create table public.organizations (
  id uuid primary key
);
create table public.marketplace_brand_profiles (
  id uuid primary key,
  active_campaigns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.marketplace_campaigns (
  id text primary key,
  campaign_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.contracts (
  id uuid primary key,
  status public.directsign_contract_status not null default 'draft',
  deleted_at timestamptz,
  next_actor_role public.directsign_contract_party_role,
  next_action text,
  next_due_at timestamptz,
  completed_at timestamptz,
  version_no integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.directsign_contracts (
  id text primary key,
  advertiser_id text not null,
  title text not null,
  status text not null,
  influencer_name text,
  share_token text,
  share_token_status text not null default 'not_issued',
  contract jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.deliverable_requirements (
  id uuid primary key,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  deliverable_type public.directsign_deliverable_type not null default 'post',
  title text not null default 'QA',
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.deliverables (
  id uuid primary key,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  requirement_id uuid references public.deliverable_requirements(id) on delete set null,
  creator_profile_id uuid references public.profiles(id) on delete set null,
  title text,
  url text,
  submitted_at timestamptz,
  review_status public.directsign_review_status not null default 'draft',
  review_comment text,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.contract_files (
  id uuid primary key,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  related_type text,
  related_id uuid,
  file_type public.directsign_file_type not null default 'other',
  bucket text not null,
  storage_path text not null,
  file_name text,
  content_type text,
  byte_size bigint,
  file_hash text,
  created_at timestamptz not null default now()
);
create table public.contract_events (
  id uuid primary key,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  actor_display_name text,
  event_type text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  previous_event_hash text,
  event_hash text,
  created_at timestamptz not null default now()
);
create or replace function public.directsign_set_contract_event_hash()
returns trigger language plpgsql as $$ begin return new; end $$;
create trigger contract_events_set_hash before insert on public.contract_events
for each row execute function public.directsign_set_contract_event_hash();

create table public.support_access_events (
  id uuid primary key,
  support_access_request_id uuid not null,
  contract_id text not null,
  action text not null,
  actor_role text not null,
  actor_profile_id uuid,
  actor_name text,
  description text not null,
  ip text,
  user_agent text,
  event_hash text not null default '',
  previous_event_hash text,
  created_at timestamptz not null default now()
);

create table public.privacy_erasure_requests (
  id uuid primary key,
  auth_user_id uuid not null,
  account_role text not null default 'advertiser',
  subject_hash text not null default repeat('a', 64),
  status text not null default 'requested',
  organization_ids uuid[] not null default '{}'::uuid[],
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.privacy_storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  erasure_request_id uuid references public.privacy_erasure_requests(id) on delete set null,
  source_type text not null,
  source_id text not null,
  category text not null,
  bucket text not null,
  object_path text not null,
  due_at timestamptz not null,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type, source_id, bucket, object_path)
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
`;

const ids = {
  contract: "11111111-1111-4111-8111-111111111111",
  creator: "22222222-2222-4222-8222-222222222222",
  advertiser: "33333333-3333-4333-8333-333333333333",
  requirement: "44444444-4444-4444-8444-444444444444",
  reservation: "55555555-5555-4555-8555-555555555555",
  deliverable: "66666666-6666-4666-8666-666666666666",
  file: "77777777-7777-4777-8777-777777777777",
  submittedEvent: "88888888-8888-4888-8888-888888888888",
  reviewEvent: "99999999-9999-4999-8999-999999999999",
  readyEvent: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  closeEvent: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  erasedOrganization: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  liveOrganization: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  marketplaceBrand: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

try {
  await db.exec(setup);
  await db.query(`insert into public.organizations(id) values($1)`, [
    ids.liveOrganization,
  ]);
  await db.query(
    `insert into storage.objects(bucket_id,name) values
      ('yeollock-marketplace-public',$1),
      ('yeollock-marketplace-public',$2)`,
    [
      `campaign-thumbnails/${ids.erasedOrganization}/orphan.png`,
      `campaign-thumbnails/${ids.liveOrganization}/keep.png`,
    ],
  );
  const brokenCampaign = {
    id: "4b57fcee-6d4a-4c73-bcb0-3c8e88176158",
    deliverables: [
      "네이버 블로그 포스팅 1건",
      "본문 1",
      "200자 이상",
      "직접 캡처 8장 이상",
      "광고 표기 필수",
      "서비스 링크 포함",
    ],
  };
  await db.query(
    `insert into public.marketplace_campaigns(id,campaign_data) values($1,$2::jsonb)`,
    [brokenCampaign.id, JSON.stringify(brokenCampaign)],
  );
  await db.query(
    `insert into public.marketplace_brand_profiles(id,active_campaigns)
     values($1,jsonb_build_array($2::jsonb))`,
    [ids.marketplaceBrand, JSON.stringify(brokenCampaign)],
  );
  for (const name of [
    "20260811190000_atomic_contract_close.sql",
    "20260811191000_reserve_deliverable_upload_quota.sql",
    "20260811192000_fix_campaign_thumbnail_erasure_prefix.sql",
    "20260811193000_serialize_audit_event_chains.sql",
    "20260811194000_atomic_deliverable_mutations.sql",
    "20260811195000_backfill_erased_campaign_thumbnail_orphans.sql",
    "20260811196000_repair_campaign_deliverable_thousands_separator.sql",
  ]) {
    await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
  }

  assert.equal(await count("public.privacy_storage_deletion_queue"), 1);
  assert.deepEqual(
    await one(`
      select source_id, object_path
      from public.privacy_storage_deletion_queue
    `),
    {
      source_id: `erased-org:${ids.erasedOrganization}`,
      object_path: `campaign-thumbnails/${ids.erasedOrganization}/orphan.png`,
    },
  );
  await db.exec(`
    delete from public.privacy_storage_deletion_queue;
    delete from storage.objects;
  `);
  console.log("PASS completed-erasure orphan thumbnail backfill");

  for (const source of [
    `select campaign_data->'deliverables' as deliverables
       from public.marketplace_campaigns
      where id='4b57fcee-6d4a-4c73-bcb0-3c8e88176158'`,
    `select active_campaigns->0->'deliverables' as deliverables
       from public.marketplace_brand_profiles
      where id='${ids.marketplaceBrand}'`,
  ]) {
    assert.deepEqual((await one(source)).deliverables, [
      "네이버 블로그 포스팅 1건",
      "본문 1,200자 이상",
      "직접 캡처 8장 이상",
      "광고 표기 필수",
      "서비스 링크 포함",
    ]);
  }
  console.log("PASS campaign thousands separator repair");

  const privileges = await one(`
    select
      has_function_privilege(
        'anon',
        'public.reserve_directsign_deliverable_upload(uuid,uuid,uuid,bigint,integer,bigint,bigint,integer)',
        'execute'
      ) as anon_reserve,
      has_function_privilege(
        'authenticated',
        'public.finalize_directsign_deliverable_submission(uuid,timestamptz,jsonb,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,text,inet,text,timestamptz)',
        'execute'
      ) as authenticated_finalize,
      has_function_privilege(
        'service_role',
        'public.close_directsign_contract_atomically(uuid,timestamptz,jsonb,timestamptz,uuid,text,uuid)',
        'execute'
      ) as service_close
  `);
  assert.deepEqual(privileges, {
    anon_reserve: false,
    authenticated_finalize: false,
    service_close: true,
  });
  console.log("PASS privileges fail closed");

  const initialAt = "2026-08-11T00:00:00.000Z";
  await db.query(
    "insert into public.profiles(id,name) values($1,'Creator'),($2,'Advertiser')",
    [ids.creator, ids.advertiser],
  );
  await db.query(
    "insert into public.contracts(id,status,updated_at) values($1,'active',$2)",
    [ids.contract, initialAt],
  );
  await db.query(
    `insert into public.directsign_contracts(
      id,advertiser_id,title,status,contract,updated_at
    ) values($1,'adv','QA','SIGNED',$2::jsonb,$3)`,
    [
      ids.contract,
      JSON.stringify({
        id: ids.contract,
        status: "SIGNED",
        workflow: {},
        deliverable_summary: {},
      }),
      initialAt,
    ],
  );
  await db.query(
    "insert into public.deliverable_requirements(id,contract_id,quantity) values($1,$2,1)",
    [ids.requirement, ids.contract],
  );

  const reservation = await one(
    `select * from public.reserve_directsign_deliverable_upload(
      $1,$2,$3,10,50,100,100,900
    )`,
    [ids.reservation, ids.contract, ids.creator],
  );
  assert.equal(reservation.outcome, "reserved");
  assert.equal(
    await count("public.directsign_deliverable_upload_reservations"),
    1,
  );
  console.log("PASS quota reservation");

  const badFile = JSON.stringify({
    id: ids.file,
    bucket: "private",
    byte_size: 10,
    file_hash: "a".repeat(64),
  });
  await assert.rejects(
    db.query(
      `select * from public.finalize_directsign_deliverable_submission(
        $1,$2,$3::jsonb,$4,$5,$6,'Post','https://example.test/post',
        '{}'::jsonb,$7::jsonb,$8,$9,$10,'Creator',null,null,$11
      )`,
      [
        ids.contract,
        initialAt,
        JSON.stringify({ id: ids.contract, status: "SIGNED" }),
        ids.deliverable,
        ids.requirement,
        ids.creator,
        badFile,
        ids.reservation,
        ids.submittedEvent,
        ids.readyEvent,
        "2026-08-11T00:01:00.000Z",
      ],
    ),
  );
  assert.equal(await count("public.deliverables"), 0);
  assert.equal(await count("public.contract_files"), 0);
  assert.equal(await count("public.contract_events"), 0);
  assert.equal(
    await count("public.directsign_deliverable_upload_reservations"),
    1,
  );
  console.log("PASS submission rollback is all-or-nothing");

  const goodFile = JSON.stringify({
    id: ids.file,
    bucket: "private",
    storage_path: "deliverables/c/file.png",
    file_name: "file.png",
    content_type: "image/png",
    byte_size: 10,
    file_hash: "a".repeat(64),
  });
  const submittedAt = "2026-08-11T00:02:00.000Z";
  const submitted = await one(
    `select * from public.finalize_directsign_deliverable_submission(
      $1,$2,$3::jsonb,$4,$5,$6,'Post','https://example.test/post',
      '{}'::jsonb,$7::jsonb,$8,$9,$10,'Creator',null,null,$11
    )`,
    [
      ids.contract,
      initialAt,
      JSON.stringify({ id: ids.contract, status: "SIGNED" }),
      ids.deliverable,
      ids.requirement,
      ids.creator,
      goodFile,
      ids.reservation,
      ids.submittedEvent,
      ids.readyEvent,
      submittedAt,
    ],
  );
  assert.equal(submitted.outcome, "submitted");
  assert.equal(Number(submitted.total), 1);
  assert.equal(Number(submitted.submitted), 1);
  assert.equal(Number(submitted.approved), 0);
  assert.equal(await count("public.deliverables"), 1);
  assert.equal(await count("public.contract_files"), 1);
  assert.equal(
    await count("public.directsign_deliverable_upload_reservations"),
    0,
  );
  assert.equal(await count("public.contract_events"), 1);
  console.log("PASS atomic submission consumes reservation");

  const legacyAfterSubmit = await one(
    "select contract,updated_at from public.directsign_contracts where id=$1",
    [ids.contract],
  );
  const deliverableAfterSubmit = await one(
    "select updated_at from public.deliverables where id=$1",
    [ids.deliverable],
  );
  const reviewedAt = "2026-08-11T00:03:00.000Z";
  const reviewed = await one(
    `select * from public.finalize_directsign_deliverable_review(
      $1,$2,$3::jsonb,$4,$5,'approved',null,$6,'Advertiser',$7,$8,null,null,$9
    )`,
    [
      ids.contract,
      legacyAfterSubmit.updated_at,
      JSON.stringify(legacyAfterSubmit.contract),
      ids.deliverable,
      deliverableAfterSubmit.updated_at,
      ids.advertiser,
      ids.reviewEvent,
      ids.readyEvent,
      reviewedAt,
    ],
  );
  assert.equal(reviewed.outcome, "reviewed");
  assert.equal(Number(reviewed.approved), 1);
  assert.equal(await count("public.contract_events"), 3);
  assert.equal(
    Number(
      (
        await one(
          "select count(*)::integer as value from public.contract_events where event_type='deliverables_ready_to_close'",
        )
      ).value,
    ),
    1,
  );
  const hashes = (
    await db.query(
      `select chain_generation,previous_event_hash,event_hash
       from public.contract_events
       where contract_id=$1 order by created_at,id`,
      [ids.contract],
    )
  ).rows as Row[];
  assert.ok(
    hashes.every(
      (entry) =>
        typeof entry.event_hash === "string" && entry.event_hash.length === 64,
    ),
  );
  assert.ok(hashes.every((entry) => Number(entry.chain_generation) === 1));
  const checkpoint = await one(
    `select checkpoint_hash,source_event_count,source_head_count
       from public.contract_event_chain_checkpoints where contract_id=$1`,
    [ids.contract],
  );
  assert.equal(Number(checkpoint.source_event_count), 0);
  assert.equal(Number(checkpoint.source_head_count), 0);
  assert.equal(hashes[0].previous_event_hash, checkpoint.checkpoint_hash);
  assert.equal(hashes[1].previous_event_hash, hashes[0].event_hash);
  assert.equal(hashes[2].previous_event_hash, hashes[1].event_hash);
  console.log("PASS review, ready event, and canonical audit chain");

  const deliverableAfterReview = await one(
    "select updated_at from public.deliverables where id=$1",
    [ids.deliverable],
  );
  const interveningAt = "2026-08-11T00:03:30.000Z";
  await db.query(
    `update public.directsign_contracts set updated_at=$2 where id=$1`,
    [ids.contract, interveningAt],
  );
  await db.query(
    `update public.contracts
        set updated_at=$2, version_no=version_no+1
      where id=$1`,
    [ids.contract, interveningAt],
  );
  const legacyBeforeRetry = await one(
    "select contract,updated_at from public.directsign_contracts where id=$1",
    [ids.contract],
  );
  const projectionBeforeRetry = await one(
    "select updated_at,version_no from public.contracts where id=$1",
    [ids.contract],
  );
  const idempotent = await one(
    `select * from public.finalize_directsign_deliverable_review(
      $1,$2,$3::jsonb,$4,$5,'approved',null,$6,'Advertiser',$7,$8,null,null,$9
    )`,
    [
      ids.contract,
      legacyBeforeRetry.updated_at,
      JSON.stringify(legacyBeforeRetry.contract),
      ids.deliverable,
      deliverableAfterReview.updated_at,
      ids.advertiser,
      ids.reviewEvent,
      ids.readyEvent,
      reviewedAt,
    ],
  );
  assert.equal(idempotent.outcome, "idempotent");
  assert.equal(await count("public.contract_events"), 3);
  assert.equal(
    String(
      (await one("select updated_at from public.directsign_contracts where id=$1", [ids.contract]))
        .updated_at,
    ),
    String(legacyBeforeRetry.updated_at),
  );
  assert.deepEqual(
    await one("select updated_at,version_no from public.contracts where id=$1", [ids.contract]),
    projectionBeforeRetry,
  );
  console.log("PASS idempotent review preserves newer workflow timestamps and audit");

  const legacyBeforeClose = await one(
    "select contract,updated_at from public.directsign_contracts where id=$1",
    [ids.contract],
  );
  const closeAt = "2026-08-11T00:04:00.000Z";
  const closed = await one(
    `select * from public.close_directsign_contract_atomically(
      $1,$2,$3::jsonb,$4,$5,'Advertiser',$6
    )`,
    [
      ids.contract,
      legacyBeforeClose.updated_at,
      JSON.stringify({
        ...(legacyBeforeClose.contract as object),
        status: "CLOSED",
      }),
      closeAt,
      ids.advertiser,
      ids.closeEvent,
    ],
  );
  assert.equal(closed.outcome, "closed");
  assert.equal(
    (await one("select status::text as status from public.contracts where id=$1", [ids.contract])).status,
    "completed",
  );
  assert.equal(
    (await one("select contract->>'status' as status from public.directsign_contracts where id=$1", [ids.contract])).status,
    "CLOSED",
  );
  assert.equal(await count("public.contract_events"), 4);
  console.log("PASS atomic close commits both projections and event");

  await assert.rejects(
    db.query(
      `update public.deliverables
       set metadata='{"late":true}'::jsonb where id=$1`,
      [ids.deliverable],
    ),
    /DIRECTSIGN_CONTRACT_NOT_ACTIVE/,
  );
  assert.deepEqual(
    (await one("select metadata from public.deliverables where id=$1", [ids.deliverable])).metadata,
    {},
  );
  console.log("PASS post-close deliverable mutation is rejected and rolled back");

  const organizationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const erasureId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const userId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await db.query(
    `insert into storage.objects(bucket_id,name) values
      ('yeollock-marketplace-public',$1),
      ('yeollock-marketplace-public',$2)`,
    [
      `campaign-thumbnails/${organizationId}/one.png`,
      "campaign-thumbnails/ffffffff-ffff-4fff-8fff-ffffffffffff/not-owned.png",
    ],
  );
  await db.query(
    `insert into public.privacy_erasure_requests(
      id,auth_user_id,organization_ids
    ) values($1,$2,array[$3::uuid])`,
    [erasureId, userId, organizationId],
  );
  assert.equal(await count("public.privacy_storage_deletion_queue"), 1);
  assert.equal(
    (await one("select object_path from public.privacy_storage_deletion_queue")).object_path,
    `campaign-thumbnails/${organizationId}/one.png`,
  );
  console.log("PASS canonical organization erasure prefix");
} finally {
  await db.close();
}
});

test("legacy contract forks checkpoint without evidence rewrites and generation one stays serialized", async () => {
  const migration = await readFile(
    "supabase/migrations/20260811193000_serialize_audit_event_chains.sql",
    "utf8",
  );
  const db = new PGlite({ extensions: { pgcrypto } });
  const forkContract = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const cleanContract = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const retentionContract = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const rootId = "11111111-1111-4111-8111-111111111111";
  const branchOneId = "22222222-2222-4222-8222-222222222222";
  const branchTwoId = "33333333-3333-4333-8333-333333333333";
  const secondRootId = "44444444-4444-4444-8444-444444444444";
  const cleanRootId = "55555555-5555-4555-8555-555555555555";
  const cleanHeadId = "66666666-6666-4666-8666-666666666666";
  const rootHash = "a".repeat(64);
  const branchOneHash = "b".repeat(64);
  const branchTwoHash = "c".repeat(64);
  const secondRootHash = "d".repeat(64);
  const cleanRootHash = "e".repeat(64);
  const cleanHeadHash = "f".repeat(64);

  const evidenceRows = async (contractId: string) =>
    (
      await db.query(
        `select id::text,contract_id::text,actor_profile_id::text,actor_role,
                actor_display_name,event_type,target_type,target_id::text,
                payload::text,host(ip_address)::text as ip_address,user_agent,
                previous_event_hash,event_hash,created_at::text
           from public.contract_events
          where contract_id=$1
          order by id`,
        [contractId],
      )
    ).rows;

  try {
    await db.exec(String.raw`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema extensions;
      create extension pgcrypto with schema extensions;
      create table public.contracts (id uuid primary key);
      create table public.contract_events (
        id uuid primary key,
        contract_id uuid not null references public.contracts(id) on delete cascade,
        actor_profile_id uuid,
        actor_role text,
        actor_display_name text,
        event_type text not null,
        target_type text,
        target_id uuid,
        payload jsonb not null default '{}'::jsonb,
        ip_address inet,
        user_agent text,
        previous_event_hash text,
        event_hash text,
        created_at timestamptz not null default now()
      );
      create table public.support_access_events (
        id uuid primary key,
        support_access_request_id uuid not null,
        contract_id text not null,
        action text not null,
        actor_role text not null,
        actor_profile_id uuid,
        actor_name text,
        description text not null,
        ip text,
        user_agent text,
        previous_event_hash text,
        event_hash text,
        created_at timestamptz not null default now()
      );
      create or replace function public.directsign_set_contract_event_hash()
      returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger contract_events_set_hash before insert on public.contract_events
      for each row execute function public.directsign_set_contract_event_hash();
      create or replace function public.test_prevent_contract_event_mutation()
      returns trigger language plpgsql as $$
      begin
        if tg_op = 'DELETE'
           and current_setting('directsign.privacy_retention_purge', true) = 'on' then
          return old;
        end if;
        raise exception 'contract_events is append-only';
      end $$;
      create trigger contract_events_prevent_mutation
      before update or delete on public.contract_events
      for each row execute function public.test_prevent_contract_event_mutation();
    `);
    await db.query(
      `insert into public.contracts(id) values($1),($2),($3)`,
      [forkContract, cleanContract, retentionContract],
    );
    await db.query(
      `insert into public.contract_events(
         id,contract_id,event_type,payload,previous_event_hash,event_hash,created_at
       ) values
       ($1,$7,'root','{"position":"root"}',null,$9,'2026-08-01T00:00:00Z'),
       ($2,$7,'branch_one','{"position":"one"}',$9,$10,'2026-08-01T00:01:00Z'),
       ($3,$7,'branch_two','{"position":"two"}',$9,$11,'2026-08-01T00:02:00Z'),
       ($4,$7,'second_root','{"position":"other"}',null,$12,'2026-08-01T00:03:00Z'),
       ($5,$8,'clean_root','{}',null,$13,'2026-08-01T00:00:00Z'),
       ($6,$8,'clean_head','{}',$13,$14,'2026-08-01T00:01:00Z')`,
      [
        rootId,
        branchOneId,
        branchTwoId,
        secondRootId,
        cleanRootId,
        cleanHeadId,
        forkContract,
        cleanContract,
        rootHash,
        branchOneHash,
        branchTwoHash,
        secondRootHash,
        cleanRootHash,
        cleanHeadHash,
      ],
    );
    const before = await evidenceRows(forkContract);

    await db.exec(migration);

    assert.deepEqual(await evidenceRows(forkContract), before);
    assert.deepEqual(
      (
        await db.query(
          `select distinct chain_generation from public.contract_events
           where contract_id in ($1,$2)`,
          [forkContract, cleanContract],
        )
      ).rows,
      [{ chain_generation: 0 }],
    );

    const checkpoint = (
      await db.query(
        `select source_event_count,source_head_count,source_snapshot,
                checkpoint_hash,created_at::text
           from public.contract_event_chain_checkpoints where contract_id=$1`,
        [forkContract],
      )
    ).rows[0] as Row;
    assert.equal(Number(checkpoint.source_event_count), 4);
    assert.equal(Number(checkpoint.source_head_count), 3);
    assert.deepEqual(
      (checkpoint.source_snapshot as { heads: unknown[] }).heads,
      [
        { event_id: branchOneId, event_hash: branchOneHash },
        { event_id: branchTwoId, event_hash: branchTwoHash },
        { event_id: secondRootId, event_hash: secondRootHash },
      ],
    );
    const canonical = [
      "directsign.contract-event-chain-checkpoint.v1",
      `contract_id=${forkContract}`,
      "source_generation=0",
      "target_generation=1",
      "event_count=4",
      "head_count=3",
      "heads:",
      `${branchOneId}:${branchOneHash}`,
      `${branchTwoId}:${branchTwoHash}`,
      `${secondRootId}:${secondRootHash}`,
    ].join("\n");
    assert.equal(
      checkpoint.checkpoint_hash,
      createHash("sha256").update(canonical, "utf8").digest("hex"),
    );

    const cleanCheckpoint = (
      await db.query(
        `select source_event_count,source_head_count,source_snapshot,checkpoint_hash
           from public.contract_event_chain_checkpoints where contract_id=$1`,
        [cleanContract],
      )
    ).rows[0] as Row;
    assert.equal(Number(cleanCheckpoint.source_event_count), 2);
    assert.equal(Number(cleanCheckpoint.source_head_count), 1);
    assert.deepEqual(
      (cleanCheckpoint.source_snapshot as { heads: unknown[] }).heads,
      [{ event_id: cleanHeadId, event_hash: cleanHeadHash }],
    );
    assert.notEqual(cleanCheckpoint.checkpoint_hash, checkpoint.checkpoint_hash);

    const privilege = (
      await db.query(`
        select
          has_table_privilege('anon','public.contract_event_chain_checkpoints','select') as anon_select,
          has_table_privilege('authenticated','public.contract_event_chain_checkpoints','select') as authenticated_select,
          has_table_privilege('service_role','public.contract_event_chain_checkpoints','select') as service_select,
          has_table_privilege('service_role','public.contract_event_chain_checkpoints','delete') as service_delete,
          has_function_privilege(
            'service_role',
            'directsign_private.directsign_ensure_contract_event_checkpoint(uuid)',
            'execute'
          ) as service_writer
      `)
    ).rows[0];
    assert.deepEqual(privilege, {
      anon_select: false,
      authenticated_select: false,
      service_select: true,
      service_delete: false,
      service_writer: false,
    });
    await assert.rejects(
      db.query(
        `update public.contract_event_chain_checkpoints
            set source_event_count=0 where contract_id=$1`,
        [forkContract],
      ),
      /DIRECTSIGN_CONTRACT_EVENT_CHECKPOINT_APPEND_ONLY/,
    );
    await assert.rejects(
      db.query(
        `delete from public.contract_event_chain_checkpoints where contract_id=$1`,
        [forkContract],
      ),
      /DIRECTSIGN_CONTRACT_EVENT_CHECKPOINT_APPEND_ONLY/,
    );

    const firstFutureId = "77777777-7777-4777-8777-777777777777";
    await db.query(
      `insert into public.contract_events(
         id,contract_id,event_type,chain_generation,previous_event_hash,event_hash
       ) values($1,$2,'future_first',0,$3,'client-supplied')`,
      [firstFutureId, forkContract, secondRootHash],
    );
    const firstFuture = (
      await db.query(
        `select chain_generation,previous_event_hash,event_hash
           from public.contract_events where id=$1`,
        [firstFutureId],
      )
    ).rows[0] as Row;
    assert.equal(Number(firstFuture.chain_generation), 1);
    assert.equal(firstFuture.previous_event_hash, checkpoint.checkpoint_hash);
    assert.match(String(firstFuture.event_hash), /^[0-9a-f]{64}$/);

    const concurrentIds = [
      "80000000-0000-4000-8000-000000000001",
      "80000000-0000-4000-8000-000000000002",
      "80000000-0000-4000-8000-000000000003",
      "80000000-0000-4000-8000-000000000004",
      "80000000-0000-4000-8000-000000000005",
    ];
    await Promise.all(
      concurrentIds.map((id) =>
        db.query(
          `insert into public.contract_events(id,contract_id,event_type)
           values($1,$2,'future_parallel')`,
          [id, forkContract],
        ),
      ),
    );
    const generationShape = (
      await db.query(
        `select
           count(*)::integer as event_count,
           count(distinct previous_event_hash)::integer as predecessor_count,
           count(*) filter (where not exists (
             select 1 from public.contract_events child
              where child.contract_id=event.contract_id
                and child.chain_generation=1
                and child.previous_event_hash=event.event_hash
           ))::integer as head_count
         from public.contract_events event
         where contract_id=$1 and chain_generation=1`,
        [forkContract],
      )
    ).rows[0];
    assert.deepEqual(generationShape, {
      event_count: 6,
      predecessor_count: 6,
      head_count: 1,
    });

    const cleanFutureId = "99999999-9999-4999-8999-999999999999";
    await db.query(
      `insert into public.contract_events(id,contract_id,event_type)
       values($1,$2,'clean_future')`,
      [cleanFutureId, cleanContract],
    );
    assert.equal(
      firstRow(
        await db.query(
          `select previous_event_hash from public.contract_events where id=$1`,
          [cleanFutureId],
        ),
      )?.previous_event_hash,
      cleanCheckpoint.checkpoint_hash,
    );

    const beforeRerun = (
      await db.query(
        `select checkpoint_hash,created_at::text
           from public.contract_event_chain_checkpoints where contract_id=$1`,
        [forkContract],
      )
    ).rows[0];
    await db.exec(migration);
    assert.deepEqual(
      (
        await db.query(
          `select checkpoint_hash,created_at::text
             from public.contract_event_chain_checkpoints where contract_id=$1`,
          [forkContract],
        )
      ).rows[0],
      beforeRerun,
    );

    const retentionEventId = "aaaaaaaa-1111-4111-8111-111111111111";
    await db.query(
      `insert into public.contract_events(id,contract_id,event_type)
       values($1,$2,'retention_evidence')`,
      [retentionEventId, retentionContract],
    );
    await assert.rejects(
      db.query(`delete from public.contracts where id=$1`, [retentionContract]),
      /contract_events is append-only/,
    );
    await db.exec(`begin`);
    await db.exec(`select set_config('directsign.privacy_retention_purge','on',true)`);
    await db.query(`delete from public.contract_events where contract_id=$1`, [
      retentionContract,
    ]);
    await db.exec(`select set_config('directsign.privacy_retention_purge','off',true)`);
    await db.query(`delete from public.contracts where id=$1`, [retentionContract]);
    await db.exec(`commit`);
    assert.equal(
      Number(
        firstRow(
          await db.query(
            `select count(*)::integer as value
               from public.contract_event_chain_checkpoints where contract_id=$1`,
            [retentionContract],
          ),
        )?.value,
      ),
      0,
    );

    await db.exec(`alter table public.contract_events disable trigger contract_events_set_hash`);
    await db.query(
      `insert into public.contract_events(
         id,contract_id,event_type,chain_generation,event_hash
       ) values('bbbbbbbb-1111-4111-8111-111111111111',$1,'drift',0,$2)`,
      [forkContract, "1".repeat(64)],
    );
    await db.exec(`alter table public.contract_events enable trigger contract_events_set_hash`);
    await assert.rejects(
      db.query(
        `select directsign_private.directsign_ensure_contract_event_checkpoint($1)`,
        [forkContract],
      ),
      /DIRECTSIGN_CONTRACT_EVENT_CHECKPOINT_DRIFT/,
    );
  } finally {
    await db.close();
  }
});

test("support-chain fork aborts the whole checkpoint migration transaction", async () => {
  const migration = await readFile(
    "supabase/migrations/20260811193000_serialize_audit_event_chains.sql",
    "utf8",
  );
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(String.raw`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema extensions;
      create extension pgcrypto with schema extensions;
      create table public.contracts (id uuid primary key);
      create table public.contract_events (
        id uuid primary key,
        contract_id uuid not null references public.contracts(id) on delete cascade,
        actor_profile_id uuid,
        actor_role text,
        event_type text not null,
        target_type text,
        target_id uuid,
        payload jsonb not null default '{}'::jsonb,
        previous_event_hash text,
        event_hash text,
        created_at timestamptz not null default now()
      );
      create table public.support_access_events (
        id uuid primary key,
        support_access_request_id uuid not null,
        contract_id text not null,
        action text not null,
        actor_role text not null,
        actor_profile_id uuid,
        actor_name text,
        description text not null,
        ip text,
        user_agent text,
        previous_event_hash text,
        event_hash text,
        created_at timestamptz not null default now()
      );
      create or replace function public.directsign_set_contract_event_hash()
      returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger contract_events_set_hash before insert on public.contract_events
      for each row execute function public.directsign_set_contract_event_hash();
      insert into public.contracts(id)
      values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      insert into public.contract_events(id,contract_id,event_type,event_hash)
      values(
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'legacy',
        repeat('a',64)
      );
      insert into public.support_access_events(
        id,support_access_request_id,contract_id,action,actor_role,
        description,event_hash,created_at
      ) values
        ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','contract','viewed','admin','one',repeat('b',64),now()),
        ('44444444-4444-4444-8444-444444444444','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','contract','viewed','admin','two',repeat('c',64),now());
    `);
    await assert.rejects(
      db.exec(migration),
      /DIRECTSIGN_SUPPORT_AUDIT_CHAIN_REPAIR_REQUIRED/,
    );
    await db.exec(`rollback`);
    assert.equal(
      firstRow(
        await db.query(
          `select to_regclass('public.contract_event_chain_checkpoints') is null as absent`,
        ),
      )?.absent,
      true,
    );
    assert.equal(
      Number(
        firstRow(
          await db.query(
            `select count(*)::integer as value from information_schema.columns
              where table_schema='public' and table_name='contract_events'
                and column_name='chain_generation'`,
          ),
        )?.value,
      ),
      0,
    );
    assert.equal(
      firstRow(
        await db.query(
          `select event_hash from public.contract_events
            where id='11111111-1111-4111-8111-111111111111'`,
        ),
      )?.event_hash,
      "a".repeat(64),
    );
  } finally {
    await db.close();
  }
});

test("legacy cycle beside a valid chain fails closed without partial schema", async () => {
  const migration = await readFile(
    "supabase/migrations/20260811193000_serialize_audit_event_chains.sql",
    "utf8",
  );
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(String.raw`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema extensions;
      create extension pgcrypto with schema extensions;
      create table public.contracts (id uuid primary key);
      create table public.contract_events (
        id uuid primary key,
        contract_id uuid not null references public.contracts(id) on delete cascade,
        actor_profile_id uuid,
        actor_role text,
        event_type text not null,
        target_type text,
        target_id uuid,
        payload jsonb not null default '{}'::jsonb,
        previous_event_hash text,
        event_hash text,
        created_at timestamptz not null default now()
      );
      create table public.support_access_events (
        id uuid primary key,
        support_access_request_id uuid not null,
        contract_id text not null,
        action text not null,
        actor_role text not null,
        actor_profile_id uuid,
        actor_name text,
        description text not null,
        ip text,
        user_agent text,
        previous_event_hash text,
        event_hash text,
        created_at timestamptz not null default now()
      );
      create or replace function public.directsign_set_contract_event_hash()
      returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger contract_events_set_hash before insert on public.contract_events
      for each row execute function public.directsign_set_contract_event_hash();
      insert into public.contracts(id)
      values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      insert into public.contract_events(
        id,contract_id,event_type,previous_event_hash,event_hash
      ) values
        ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','valid_root',null,repeat('a',64)),
        ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','valid_head',repeat('a',64),repeat('b',64)),
        ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cycle_one',repeat('d',64),repeat('c',64)),
        ('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cycle_two',repeat('c',64),repeat('d',64));
    `);
    await assert.rejects(
      db.exec(migration),
      /DIRECTSIGN_LEGACY_AUDIT_CYCLE_DETECTED/,
    );
    await db.exec(`rollback`);
    assert.equal(
      Number(
        firstRow(
          await db.query(
            `select count(*)::integer as value from information_schema.columns
              where table_schema='public' and table_name='contract_events'
                and column_name='chain_generation'`,
          ),
        )?.value,
      ),
      0,
    );
  } finally {
    await db.close();
  }
});
