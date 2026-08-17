import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrationUrl = new URL(
  "../supabase/migrations/20260811198000_atomic_support_access_transitions.sql",
  import.meta.url,
);
const auditChainMigrationUrl = new URL(
  "../supabase/migrations/20260811193000_serialize_audit_event_chains.sql",
  import.meta.url,
);
const serverUrl = new URL("../server/index.ts", import.meta.url);

const ids = {
  advertiser: "11111111-1111-4111-8111-111111111111",
  influencer: "22222222-2222-4222-8222-222222222222",
  unrelated: "33333333-3333-4333-8333-333333333333",
  admin: "44444444-4444-4444-8444-444444444444",
  adminSession: "55555555-5555-4555-8555-555555555555",
  contract1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  contract2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  contract3: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  contract4: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  request1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  request2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  request3: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  request4: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
  request5: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
  event1: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  event2: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  event3: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  event4: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
  event5: "cccccccc-cccc-4ccc-8ccc-ccccccccccc5",
  event6: "cccccccc-cccc-4ccc-8ccc-ccccccccccc6",
  event7: "cccccccc-cccc-4ccc-8ccc-ccccccccccc7",
  event8: "cccccccc-cccc-4ccc-8ccc-ccccccccccc8",
};

const setupSql = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create function auth.role()
  returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '');
  $$;

  create type public.directsign_contract_party_role as enum (
    'advertiser', 'marketer', 'agency', 'influencer',
    'creator_manager', 'approver', 'viewer'
  );
  create type public.directsign_support_access_scope as enum (
    'contract', 'contract_and_pdf'
  );
  create type public.directsign_support_access_status as enum (
    'active', 'closed', 'revoked', 'expired'
  );

  create table public.profiles (
    id uuid primary key,
    role text not null,
    name text not null,
    email text not null,
    data_origin text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.directsign_contracts (
    id text primary key,
    advertiser_id text not null,
    contract jsonb not null,
    data_origin text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.contracts (
    id uuid primary key,
    legacy_contract_id text unique,
    created_by_profile_id uuid,
    data_origin text,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.contract_parties (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid not null,
    profile_id uuid,
    party_role public.directsign_contract_party_role not null,
    email text
  );
  create table public.admin_operator_sessions (
    auth_session_id uuid primary key,
    operator_profile_id uuid not null,
    aal text not null,
    absolute_expires_at timestamptz not null,
    revoked_at timestamptz
  );
  create table public.support_access_requests (
    id uuid primary key,
    contract_id text not null,
    contract_uuid uuid,
    legacy_contract_id text,
    requester_profile_id uuid,
    requester_role public.directsign_contract_party_role not null,
    requester_name text,
    requester_email text,
    reason text not null,
    scope public.directsign_support_access_scope not null,
    status public.directsign_support_access_status not null,
    data_origin text,
    expires_at timestamptz not null,
    reviewed_by_profile_id uuid,
    reviewed_by_name text,
    reviewed_at timestamptz,
    audit_events jsonb not null default '[]'::jsonb,
    created_at timestamptz not null,
    updated_at timestamptz not null
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
    event_hash text not null unique,
    previous_event_hash text,
    created_at timestamptz not null
  );
  create table public.contract_events (
    id uuid primary key,
    contract_id uuid not null,
    actor_profile_id uuid,
    actor_role text,
    event_type text not null,
    target_type text,
    target_id uuid,
    payload jsonb not null default '{}'::jsonb,
    event_hash text not null,
    previous_event_hash text,
    created_at timestamptz not null default now()
  );

  create function public.directsign_prevent_support_access_request_immutable_update()
  returns trigger language plpgsql as $$
  begin
    return new;
  end;
  $$;
  create trigger support_access_requests_prevent_immutable_update
  before update on public.support_access_requests
  for each row execute function public.directsign_prevent_support_access_request_immutable_update();

  create table public.test_support_access_event_failures (
    action text primary key
  );
  create function public.test_fail_support_access_event()
  returns trigger language plpgsql as $$
  begin
    if exists (
      select 1 from public.test_support_access_event_failures where action = new.action
    ) then
      raise exception 'INJECTED_SUPPORT_ACCESS_EVENT_FAILURE';
    end if;
    return new;
  end;
  $$;
  create trigger z_support_access_event_failure
  before insert on public.support_access_events
  for each row execute function public.test_fail_support_access_event();
`;

type Row = Record<string, unknown>;

const one = async (db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query(sql, params)).rows[0] as Row;

const setupDatabase = async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(setupSql);
  await db.exec(await readFile(auditChainMigrationUrl, "utf8"));
  await db.exec(await readFile(migrationUrl, "utf8"));
  await db.exec(`select set_config('request.jwt.claim.role', 'service_role', false)`);

  await db.query(
    `insert into public.profiles(id,role,name,email,data_origin) values
      ($1,'marketer','Advertiser','advertiser@example.test','production'),
      ($2,'influencer','Influencer','influencer@example.test','production'),
      ($3,'marketer','Unrelated','unrelated@example.test','production'),
      ($4,'admin','Operator','operator@example.test','production')`,
    [ids.advertiser, ids.influencer, ids.unrelated, ids.admin],
  );
  await db.query(
    `insert into public.admin_operator_sessions(
      auth_session_id,operator_profile_id,aal,absolute_expires_at
    ) values($1,$2,'aal2',now() + interval '1 hour')`,
    [ids.adminSession, ids.admin],
  );

  for (const contractId of [
    ids.contract1,
    ids.contract2,
    ids.contract3,
    ids.contract4,
  ]) {
    await db.query(
      `insert into public.directsign_contracts(id,advertiser_id,contract,data_origin)
       values($1,$2,$3::jsonb,'production')`,
      [
        contractId,
        ids.advertiser,
        JSON.stringify({
          advertiser_info: { manager: "advertiser@example.test" },
          influencer_info: { contact: "influencer@example.test" },
        }),
      ],
    );
    await db.query(
      `insert into public.contracts(
        id,legacy_contract_id,created_by_profile_id,data_origin
      ) values($1::uuid,$1::text,$2,'production')`,
      [contractId, ids.advertiser],
    );
    await db.query(
      `insert into public.contract_parties(contract_id,profile_id,party_role,email) values
        ($1,$2,'advertiser','advertiser@example.test'),
        ($1,$3,'influencer','influencer@example.test')`,
      [contractId, ids.advertiser, ids.influencer],
    );
  }
  return db;
};

const grantSql = `
  select result->>'outcome' as outcome,
         result->'request'->>'status' as status
  from (
    select public.create_support_access_grant_atomically(
      $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::uuid,$10,$11
    ) as result
  ) as rpc
`;

const createGrant = (
  db: PGlite,
  input: {
    requestId: string;
    contractId: string;
    eventId: string;
    profileId?: string;
    role?: "advertiser" | "influencer";
    scope?: "contract" | "contract_and_pdf";
  },
) =>
  one(db, grantSql, [
    input.requestId,
    input.contractId,
    input.profileId ?? ids.advertiser,
    input.role ?? "advertiser",
    "Need help reviewing this contract",
    input.scope ?? "contract_and_pdf",
    "production",
    "directsign-support-access-consent-v1",
    input.eventId,
    "203.0.113.10",
    "support-access-atomicity-test",
  ]);

const transitionSql = `
  select result->>'outcome' as outcome,
         result->'request'->>'status' as status
  from (
    select public.transition_support_access_status_atomically(
      $1::uuid,$2,$3::timestamptz,$4,$5::uuid,$6::uuid,$7::uuid,$8,$9
    ) as result
  ) as rpc
`;

test("support access grant and created event commit atomically with exact consent provenance", async () => {
  const db = await setupDatabase();
  try {
    assert.equal(
      (
        await one(
          db,
          `select has_function_privilege(
            'anon',
            'public.create_support_access_grant_atomically(uuid,uuid,uuid,text,text,text,text,text,uuid,text,text)',
            'execute'
          ) as allowed`,
        )
      ).allowed,
      false,
    );
    await db.exec(`set role anon`);
    await assert.rejects(
      createGrant(db, {
        requestId: ids.request2,
        contractId: ids.contract2,
        eventId: ids.event2,
      }),
      /permission denied/,
    );
    await db.exec(`reset role`);
    assert.equal(
      (
        await one(
          db,
          `select has_function_privilege(
            'service_role',
            'public.create_support_access_grant_atomically(uuid,uuid,uuid,text,text,text,text,text,uuid,text,text)',
            'execute'
          ) as allowed`,
        )
      ).allowed,
      true,
    );
    assert.equal(
      (
        await one(
          db,
          `select has_table_privilege(
            'service_role','public.support_access_requests','INSERT,UPDATE'
          ) as allowed`,
        )
      ).allowed,
      false,
    );

    const created = await createGrant(db, {
      requestId: ids.request1,
      contractId: ids.contract1,
      eventId: ids.event1,
    });
    assert.equal(created.outcome, "created");
    assert.equal(created.status, "active");

    const persisted = await one(
      db,
      `select
         contract_id,
         contract_uuid::text,
         legacy_contract_id,
         requester_profile_id::text,
         requester_name,
         requester_email,
         scope::text,
         status::text,
         consent_version,
         consent_accepted_at is not null as consent_recorded,
         extract(epoch from (expires_at - created_at))::integer as ttl_seconds,
         jsonb_array_length(audit_events) as legacy_event_count
       from public.support_access_requests where id=$1`,
      [ids.request1],
    );
    assert.equal(persisted.contract_id, ids.contract1);
    assert.equal(persisted.contract_uuid, ids.contract1);
    assert.equal(persisted.legacy_contract_id, ids.contract1);
    assert.equal(persisted.requester_profile_id, ids.advertiser);
    assert.equal(persisted.requester_name, "Advertiser");
    assert.equal(persisted.requester_email, "advertiser@example.test");
    assert.equal(persisted.scope, "contract_and_pdf");
    assert.equal(
      persisted.consent_version,
      "directsign-support-access-consent-v1",
    );
    assert.equal(persisted.consent_recorded, true);
    assert.equal(persisted.ttl_seconds, 86_400);
    assert.equal(persisted.legacy_event_count, 0);

    await db.exec(`set role service_role`);
    await assert.rejects(
      db.query(
        `update public.support_access_requests set status='closed' where id=$1`,
        [ids.request1],
      ),
      /permission denied/,
    );
    await db.exec(`reset role`);

    const event = await one(
      db,
      `select action,actor_role,actor_profile_id::text,
              previous_event_hash,event_hash <> '' as hashed
       from public.support_access_events where id=$1`,
      [ids.event1],
    );
    assert.equal(event.action, "created");
    assert.equal(event.actor_role, "advertiser");
    assert.equal(event.actor_profile_id, ids.advertiser);
    assert.equal(event.previous_event_hash, null);
    assert.equal(event.hashed, true);

    const retried = await createGrant(db, {
      requestId: ids.request1,
      contractId: ids.contract1,
      eventId: ids.event1,
    });
    assert.equal(retried.outcome, "idempotent");
    assert.equal(
      (
        await one(
          db,
          `select count(*)::integer as count
           from public.support_access_events where support_access_request_id=$1`,
          [ids.request1],
        )
      ).count,
      1,
    );

    const duplicate = await createGrant(db, {
      requestId: ids.request2,
      contractId: ids.contract1,
      eventId: ids.event2,
    });
    assert.equal(duplicate.outcome, "active_duplicate");
    assert.equal(
      (
        await one(
          db,
          `select count(*)::integer as count from public.support_access_requests`,
        )
      ).count,
      1,
    );

    await assert.rejects(
      createGrant(db, {
        requestId: ids.request2,
        contractId: ids.contract2,
        eventId: ids.event2,
        profileId: ids.unrelated,
      }),
      /support access requester is not authorized/,
    );

    await db.exec(`select set_config('request.jwt.claim.role', 'authenticated', false)`);
    await assert.rejects(
      createGrant(db, {
        requestId: ids.request2,
        contractId: ids.contract2,
        eventId: ids.event2,
      }),
      /service role required/,
    );
    await db.exec(`select set_config('request.jwt.claim.role', 'service_role', false)`);

    await db.exec(
      `insert into public.test_support_access_event_failures(action) values('created')`,
    );
    await assert.rejects(
      createGrant(db, {
        requestId: ids.request2,
        contractId: ids.contract2,
        eventId: ids.event2,
      }),
      /INJECTED_SUPPORT_ACCESS_EVENT_FAILURE/,
    );
    assert.equal(
      (
        await one(
          db,
          `select count(*)::integer as count
           from public.support_access_requests where id=$1`,
          [ids.request2],
        )
      ).count,
      0,
    );
    await db.exec(`delete from public.test_support_access_event_failures`);
  } finally {
    await db.close();
  }
});

test("support access terminal transitions use CAS, AAL2, idempotency, and event rollback", async () => {
  const db = await setupDatabase();
  try {
    await createGrant(db, {
      requestId: ids.request1,
      contractId: ids.contract1,
      eventId: ids.event1,
    });
    const initial = await one(
      db,
      `select status::text,updated_at::text from public.support_access_requests where id=$1`,
      [ids.request1],
    );
    const closed = await one(db, transitionSql, [
      ids.request1,
      initial.status,
      initial.updated_at,
      "closed",
      ids.admin,
      ids.adminSession,
      ids.event2,
      "203.0.113.11",
      "support-access-atomicity-test",
    ]);
    assert.equal(closed.outcome, "updated");
    assert.equal(closed.status, "closed");

    const afterClose = await one(
      db,
      `select status::text,updated_at::text,reviewed_by_profile_id::text
       from public.support_access_requests where id=$1`,
      [ids.request1],
    );
    assert.equal(afterClose.reviewed_by_profile_id, ids.admin);
    const sameTerminal = await one(db, transitionSql, [
      ids.request1,
      "closed",
      afterClose.updated_at,
      "closed",
      ids.admin,
      ids.adminSession,
      ids.event3,
      "203.0.113.11",
      "support-access-atomicity-test",
    ]);
    assert.equal(sameTerminal.outcome, "idempotent");
    assert.equal(
      (
        await one(
          db,
          `select count(*)::integer as count
           from public.support_access_events where support_access_request_id=$1`,
          [ids.request1],
        )
      ).count,
      2,
    );
    assert.equal(
      (
        await one(
          db,
          `select updated_at::text from public.support_access_requests where id=$1`,
          [ids.request1],
        )
      ).updated_at,
      afterClose.updated_at,
    );

    const terminalChange = await one(db, transitionSql, [
      ids.request1,
      "closed",
      afterClose.updated_at,
      "revoked",
      ids.admin,
      ids.adminSession,
      ids.event3,
      "203.0.113.11",
      "support-access-atomicity-test",
    ]);
    assert.equal(terminalChange.outcome, "invalid_transition");
    assert.equal(terminalChange.status, "closed");

    await createGrant(db, {
      requestId: ids.request2,
      contractId: ids.contract2,
      eventId: ids.event3,
    });
    const second = await one(
      db,
      `select status::text,updated_at::text from public.support_access_requests where id=$1`,
      [ids.request2],
    );
    const stale = await one(db, transitionSql, [
      ids.request2,
      second.status,
      "2026-01-01T00:00:00.000Z",
      "closed",
      ids.admin,
      ids.adminSession,
      ids.event4,
      "203.0.113.11",
      "support-access-atomicity-test",
    ]);
    assert.equal(stale.outcome, "version_conflict");
    assert.equal(stale.status, "active");

    await db.exec(
      `insert into public.test_support_access_event_failures(action) values('revoked')`,
    );
    await assert.rejects(
      one(db, transitionSql, [
        ids.request2,
        second.status,
        second.updated_at,
        "revoked",
        ids.admin,
        ids.adminSession,
        ids.event4,
        "203.0.113.11",
        "support-access-atomicity-test",
      ]),
      /INJECTED_SUPPORT_ACCESS_EVENT_FAILURE/,
    );
    assert.equal(
      (
        await one(
          db,
          `select status::text from public.support_access_requests where id=$1`,
          [ids.request2],
        )
      ).status,
      "active",
    );
    assert.equal(
      (
        await one(
          db,
          `select count(*)::integer as count
           from public.support_access_events where id=$1`,
          [ids.event4],
        )
      ).count,
      0,
    );
    await db.exec(`delete from public.test_support_access_event_failures`);

    await db.query(
      `update public.admin_operator_sessions set revoked_at=now()
       where auth_session_id=$1`,
      [ids.adminSession],
    );
    await assert.rejects(
      one(db, transitionSql, [
        ids.request2,
        second.status,
        second.updated_at,
        "closed",
        ids.admin,
        ids.adminSession,
        ids.event4,
        "203.0.113.11",
        "support-access-atomicity-test",
      ]),
      /active AAL2 admin session required/,
    );
  } finally {
    await db.close();
  }
});

test("competing terminal transitions have one state/event winner and server routes use only atomic RPC helpers", async () => {
  const db = await setupDatabase();
  try {
    const grantCalls = await Promise.all([
      createGrant(db, {
        requestId: ids.request3,
        contractId: ids.contract3,
        eventId: ids.event4,
      }),
      createGrant(db, {
        requestId: ids.request5,
        contractId: ids.contract3,
        eventId: ids.event8,
      }),
    ]);
    assert.deepEqual(
      grantCalls.map((row) => row.outcome).sort(),
      ["active_duplicate", "created"],
    );
    assert.equal(
      (
        await one(
          db,
          `select count(*)::integer as count
           from public.support_access_requests
           where contract_uuid=$1 and requester_profile_id=$2 and status='active'`,
          [ids.contract3, ids.advertiser],
        )
      ).count,
      1,
    );

    await createGrant(db, {
      requestId: ids.request4,
      contractId: ids.contract4,
      eventId: ids.event5,
    });
    const active = await one(
      db,
      `select status::text,updated_at::text from public.support_access_requests where id=$1`,
      [ids.request4],
    );
    const calls = await Promise.all([
      one(db, transitionSql, [
        ids.request4,
        active.status,
        active.updated_at,
        "closed",
        ids.admin,
        ids.adminSession,
        ids.event6,
        "203.0.113.11",
        "support-access-atomicity-test",
      ]),
      one(db, transitionSql, [
        ids.request4,
        active.status,
        active.updated_at,
        "revoked",
        ids.admin,
        ids.adminSession,
        ids.event7,
        "203.0.113.11",
        "support-access-atomicity-test",
      ]),
    ]);
    assert.deepEqual(
      calls.map((row) => row.outcome).sort(),
      ["invalid_transition", "updated"],
    );
    assert.equal(
      (
        await one(
          db,
          `select count(*)::integer as count
           from public.support_access_events
           where support_access_request_id=$1 and action in ('closed','revoked')`,
          [ids.request4],
        )
      ).count,
      1,
    );

    const serverSource = await readFile(serverUrl, "utf8");
    const adminRoute = serverSource.slice(
      serverSource.indexOf('app.patch("/api/admin/support-access-requests/:id"'),
      serverSource.indexOf('app.get("/api/advertiser/session"'),
    );
    const grantRoute = serverSource.slice(
      serverSource.indexOf('app.post("/api/contracts/:id/support-access-requests"'),
      serverSource.indexOf('app.get("/api/contracts/:id"'),
    );
    assert.match(adminRoute, /transitionSupportAccessStatusAtomically/);
    assert.doesNotMatch(adminRoute, /updateSupportAccessRequest|appendSupportAccessEventRow/);
    assert.match(
      adminRoute,
      /status\(result\.outcome === "reconciled" \? 202 : 200\)/,
    );
    assert.match(grantRoute, /createSupportAccessGrantAtomically/);
    assert.doesNotMatch(
      grantRoute,
      /insertSupportAccessRequest|appendSupportAccessEventRow|ensureSupportAccessEventStoreAvailable/,
    );
    assert.match(
      grantRoute,
      /status\(result\.outcome === "reconciled" \? 202 : 201\)/,
    );

    const reconciliationHelpers = serverSource.slice(
      serverSource.indexOf("const readSupportAccessAtomicReconciliation"),
      serverSource.indexOf('const supportTicketTable = "operational_support_tickets"'),
    );
    assert.match(reconciliationHelpers, /reconciled\.request\.contract_uuid === input\.contractId/);
    assert.match(reconciliationHelpers, /reconciled\.event\.support_access_request_id === input\.requestId/);
    assert.match(reconciliationHelpers, /reconciled\.event\.actor_profile_id === input\.requesterProfileId/);
    assert.match(reconciliationHelpers, /outcome: "reconciled"/);
  } finally {
    await db.close();
  }
});
