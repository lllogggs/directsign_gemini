import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

type Row = Record<string, unknown>;

const ids = {
  marketer: "10000000-0000-4000-8000-000000000001",
  deletedMarketer: "10000000-0000-4000-8000-000000000002",
  erasureActor: "10000000-0000-4000-8000-000000000003",
  creator: "20000000-0000-4000-8000-000000000001",
  deletedContractCreator: "20000000-0000-4000-8000-000000000002",
  organization: "21000000-0000-4000-8000-000000000001",
  verificationTickets: [
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000003",
    "30000000-0000-4000-8000-000000000004",
    "30000000-0000-4000-8000-000000000005",
  ],
  deletedAccountTicket: "30000000-0000-4000-8000-000000000006",
  erasureTicket: "30000000-0000-4000-8000-000000000007",
  postErasureTicket: "30000000-0000-4000-8000-000000000008",
  erasureFinalizedTicket: "30000000-0000-4000-8000-000000000009",
  pruneCleanedBoundary: "32000000-0000-4000-8000-000000000001",
  pruneCleanedEarly: "32000000-0000-4000-8000-000000000002",
  pruneCleanedHeld: "32000000-0000-4000-8000-000000000003",
  pruneFinalizedDeleted: "32000000-0000-4000-8000-000000000004",
  pruneFinalizedReferenced: "32000000-0000-4000-8000-000000000005",
  pruneFinalizedHeld: "32000000-0000-4000-8000-000000000006",
  pruneFinalizedPending: "32000000-0000-4000-8000-000000000007",
  pruneBatchA: "32000000-0000-4000-8000-000000000008",
  pruneBatchB: "32000000-0000-4000-8000-000000000009",
  erasureRequest: "31000000-0000-4000-8000-000000000001",
  contract: "40000000-0000-4000-8000-000000000001",
  deletedContract: "40000000-0000-4000-8000-000000000002",
  requirement: "50000000-0000-4000-8000-000000000001",
  deliverableTicket: "60000000-0000-4000-8000-000000000001",
  quotaTicket: "60000000-0000-4000-8000-000000000002",
  storageQuotaTicket: "60000000-0000-4000-8000-000000000003",
  deletedContractTicket: "60000000-0000-4000-8000-000000000004",
  reservation: "70000000-0000-4000-8000-000000000001",
  quotaReservation: "70000000-0000-4000-8000-000000000002",
  storageQuotaReservation: "70000000-0000-4000-8000-000000000003",
  deletedContractReservation: "70000000-0000-4000-8000-000000000004",
  file: "80000000-0000-4000-8000-000000000001",
  submittedEvent: "90000000-0000-4000-8000-000000000001",
  readyEvent: "90000000-0000-4000-8000-000000000002",
  leaseA: "a0000000-0000-4000-8000-000000000001",
  leaseB: "a0000000-0000-4000-8000-000000000002",
  leaseC: "a0000000-0000-4000-8000-000000000003",
} as const;

const setup = String.raw`
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema extensions;
create schema directsign_private;
create extension pgcrypto with schema extensions;

create or replace function auth.role()
returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

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
create type public.directsign_verification_status as enum (
  'not_submitted', 'pending', 'approved', 'rejected'
);
create type public.directsign_verification_target_type as enum (
  'advertiser_organization', 'influencer_account'
);
create type public.directsign_verification_type as enum (
  'business_registration_certificate', 'platform_account', 'email',
  'phone', 'manual'
);

create table public.profiles (
  id uuid primary key,
  name text not null default 'QA',
  role text not null
);
create table public.organizations (
  id uuid primary key,
  organization_type text not null,
  deleted_at timestamptz
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  primary key (organization_id, profile_id)
);
create table public.privacy_erasure_requests (
  id uuid primary key,
  auth_user_id uuid not null,
  status text not null default 'requested',
  updated_at timestamptz not null default now()
);
create table public.privacy_legal_holds (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_id text not null,
  reason_code text not null default 'legal_obligation',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  released_at timestamptz
);
create or replace function directsign_private.directsign_privacy_hold_active(
  p_scope_type text,
  p_scope_id text,
  p_category text,
  p_now timestamptz
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.privacy_legal_holds as hold
    where hold.released_at is null
      and hold.starts_at <= p_now
      and (hold.expires_at is null or hold.expires_at > p_now)
      and (
        (hold.scope_type = p_scope_type and hold.scope_id = p_scope_id)
        or (
          hold.scope_type = 'retention_category'
          and hold.scope_id in (p_category, 'all')
        )
      )
  )
$$;
create or replace function
  directsign_private.directsign_lock_privacy_storage_barrier()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('directsign:privacy-storage-hold-barrier', 94731)
  );
end
$$;
create table public.privacy_storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  erasure_request_id uuid references public.privacy_erasure_requests(id)
    on delete set null,
  source_type text not null,
  source_id text not null,
  category text not null,
  bucket text not null,
  object_path text not null,
  due_at timestamptz not null,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, bucket, object_path)
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
create table public.contract_parties (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  party_role public.directsign_contract_party_role not null,
  display_name text not null default 'QA'
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
create table public.verification_requests (
  id uuid primary key,
  target_type public.directsign_verification_target_type not null,
  target_id text not null,
  verification_type public.directsign_verification_type not null,
  status public.directsign_verification_status not null default 'pending',
  profile_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  subject_name text not null,
  evidence_file_name text,
  evidence_file_mime text,
  evidence_file_size integer,
  evidence_snapshot_json jsonb not null default '{}'::jsonb,
  reviewer_note text,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

test("private direct-upload tickets remain capability-bound and atomic", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)).rows[0] as Row;
  const count = async (table: string, where = "true") =>
    Number(
      (
        await one(
          `select count(*)::integer as value from ${table} where ${where}`,
        )
      ).value,
    );
  const setClaimRole = async (role: string) => {
    await db.query(
      "select set_config('request.jwt.claim.role',$1,false)",
      [role],
    );
  };
  const issue = async ({
    ticketId,
    purpose,
    actorId,
    resourceId = ticketId,
    contractId = null,
    requirementId = null,
    contentType = "application/pdf",
    byteSize = 1,
    sha256 = "a".repeat(64),
    reservationId = null,
    maxDeliverables = 20,
    maxContractBytes = 104857600,
    maxCreatorDailyBytes = 104857600,
  }: {
    ticketId: string;
    purpose: string;
    actorId: string;
    resourceId?: string;
    contractId?: string | null;
    requirementId?: string | null;
    contentType?: string;
    byteSize?: number;
    sha256?: string;
    reservationId?: string | null;
    maxDeliverables?: number;
    maxContractBytes?: number;
    maxCreatorDailyBytes?: number;
  }) =>
    one(
      `select * from public.issue_directsign_private_file_upload_ticket(
        $1::uuid,$2::text,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::text,
        $8::bigint,$9::text,$10::uuid,$11::integer,$12::bigint,$13::bigint
      )`,
      [
        ticketId,
        purpose,
        actorId,
        resourceId,
        contractId,
        requirementId,
        contentType,
        byteSize,
        sha256,
        reservationId,
        maxDeliverables,
        maxContractBytes,
        maxCreatorDailyBytes,
      ],
    );

  try {
    await db.exec(setup);
    for (const migration of [
      "20260811190000_atomic_contract_close.sql",
      "20260811191000_reserve_deliverable_upload_quota.sql",
      "20260811194000_atomic_deliverable_mutations.sql",
      "20260811202000_private_file_upload_tickets.sql",
    ]) {
      await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
    }
    await setClaimRole("service_role");

    await db.query(
      `insert into public.profiles(id,name,role) values
        ($1,'Marketer','marketer'),
        ($2,'Deleted marketer','marketer'),
        ($3,'Creator','influencer'),
        ($4,'Deleted-contract creator','influencer'),
        ($5,'Erasure actor','marketer')`,
      [
        ids.marketer,
        ids.deletedMarketer,
        ids.creator,
        ids.deletedContractCreator,
        ids.erasureActor,
      ],
    );
    await db.query(
      `insert into public.organizations(id,organization_type)
       values($1,'advertiser')`,
      [ids.organization],
    );
    await db.query(
      `insert into public.organization_members(organization_id,profile_id,role)
       values($1,$2,'owner'),($1,$3,'marketer')`,
      [ids.organization, ids.marketer, ids.erasureActor],
    );

    await t.test("only service-role RPC capabilities are exposed", async () => {
      const privileges = await one(`
        select
          has_table_privilege('anon', 'public.directsign_private_file_upload_tickets', 'select') as anon_table,
          has_table_privilege('authenticated', 'public.directsign_private_file_upload_tickets', 'select') as authenticated_table,
          has_table_privilege('service_role', 'public.directsign_private_file_upload_tickets', 'select') as service_table,
          has_function_privilege('anon', 'public.issue_directsign_private_file_upload_ticket(uuid,text,uuid,uuid,uuid,uuid,text,bigint,text,uuid,integer,bigint,bigint)', 'execute') as anon_issue,
          has_function_privilege('authenticated', 'public.read_directsign_private_file_upload_ticket(uuid,uuid,text,uuid,uuid,uuid)', 'execute') as authenticated_read,
          has_function_privilege('authenticated', 'public.insert_directsign_verification_request_from_ticket(uuid,uuid,text,jsonb)', 'execute') as authenticated_verification,
          has_function_privilege('authenticated', 'public.finalize_directsign_deliverable_submission_from_ticket(uuid,uuid,timestamptz,jsonb,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,text,inet,text,timestamptz)', 'execute') as authenticated_deliverable,
          has_function_privilege('service_role', 'public.issue_directsign_private_file_upload_ticket(uuid,text,uuid,uuid,uuid,uuid,text,bigint,text,uuid,integer,bigint,bigint)', 'execute') as service_issue,
          has_function_privilege('service_role', 'public.read_directsign_private_file_upload_ticket(uuid,uuid,text,uuid,uuid,uuid)', 'execute') as service_read,
          has_function_privilege('service_role', 'public.insert_directsign_verification_request_from_ticket(uuid,uuid,text,jsonb)', 'execute') as service_verification,
          has_function_privilege('service_role', 'public.finalize_directsign_deliverable_submission_from_ticket(uuid,uuid,timestamptz,jsonb,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,text,inet,text,timestamptz)', 'execute') as service_deliverable,
          has_function_privilege('service_role', 'public.claim_directsign_private_upload_cleanup(uuid,integer,integer)', 'execute') as service_claim,
          has_function_privilege('service_role', 'public.complete_directsign_private_upload_cleanup(uuid,uuid,text,text)', 'execute') as service_complete,
          has_function_privilege('anon', 'public.prune_directsign_private_file_upload_tickets(integer,timestamptz)', 'execute') as anon_prune,
          has_function_privilege('authenticated', 'public.prune_directsign_private_file_upload_tickets(integer,timestamptz)', 'execute') as authenticated_prune,
          has_function_privilege('service_role', 'public.prune_directsign_private_file_upload_tickets(integer,timestamptz)', 'execute') as service_prune
      `);
      assert.deepEqual(privileges, {
        anon_table: false,
        authenticated_table: false,
        service_table: false,
        anon_issue: false,
        authenticated_read: false,
        authenticated_verification: false,
        authenticated_deliverable: false,
        service_issue: true,
        service_read: true,
        service_verification: true,
        service_deliverable: true,
        service_claim: true,
        service_complete: true,
        anon_prune: false,
        authenticated_prune: false,
        service_prune: true,
      });

      await setClaimRole("authenticated");
      await assert.rejects(
        issue({
          ticketId: ids.verificationTickets[0],
          purpose: "advertiser_verification",
          actorId: ids.marketer,
        }),
        /service role required/,
      );
      await setClaimRole("service_role");
      assert.equal(await count("public.directsign_private_file_upload_tickets"), 0);
    });

    await t.test(
      "10 MiB, exact idempotency, active cap, and outstanding capability budget fail closed",
      async () => {
        const max = 10 * 1024 * 1024;
        const first = await issue({
          ticketId: ids.verificationTickets[0],
          purpose: "advertiser_verification",
          actorId: ids.marketer,
          byteSize: max,
        });
        assert.equal(first.outcome, "issued");
        assert.equal(first.bucket, "directsign-private");
        assert.equal(
          first.object_path,
          `verification-advertiser/${ids.marketer}/${ids.verificationTickets[0]}-evidence.pdf`,
        );
        assert.equal(
          (
            await issue({
              ticketId: ids.verificationTickets[0],
              purpose: "advertiser_verification",
              actorId: ids.marketer,
              byteSize: max,
            })
          ).outcome,
          "idempotent",
        );
        assert.equal(
          (
            await issue({
              ticketId: ids.verificationTickets[0],
              purpose: "advertiser_verification",
              actorId: ids.marketer,
              byteSize: max,
              sha256: "b".repeat(64),
            })
          ).outcome,
          "conflict",
        );
        await assert.rejects(
          issue({
            ticketId: ids.verificationTickets[1],
            purpose: "advertiser_verification",
            actorId: ids.marketer,
            byteSize: max + 1,
          }),
          /invalid private upload ticket input/,
        );

        for (const [index, ticketId] of ids.verificationTickets
          .slice(1, 3)
          .entries()) {
          assert.equal(
            (
              await issue({
                ticketId,
                purpose: "advertiser_verification",
                actorId: ids.marketer,
                // A 1-byte declaration still conveys a 10 MiB Storage
                // capability and must consume the same outstanding budget.
                byteSize: index === 0 ? 1 : max,
              })
            ).outcome,
            "issued",
          );
        }
        assert.equal(
          (
            await issue({
              ticketId: ids.verificationTickets[3],
              purpose: "advertiser_verification",
              actorId: ids.marketer,
              byteSize: max,
            })
          ).outcome,
          "ticket_limit",
        );
        await db.query(
          `update public.directsign_private_file_upload_tickets
              set issued_at=clock_timestamp()-interval '30 hours',
                  finalize_expires_at=clock_timestamp()-interval '29 hours',
                  cleanup_not_before=clock_timestamp()+interval '1 hour'
            where id=any($1::uuid[])`,
          [ids.verificationTickets.slice(1, 3)],
        );
        assert.equal(
          (
            await issue({
              ticketId: ids.verificationTickets[3],
              purpose: "advertiser_verification",
              actorId: ids.marketer,
              byteSize: 1,
            })
          ).outcome,
          "unreferenced_limit",
        );
        assert.equal(await count("public.directsign_private_file_upload_tickets"), 3);
      },
    );

    await t.test(
      "verification insertion and finalized replay bind the exact evidence record",
      async () => {
        const ticketId = ids.verificationTickets[0];
        const ticket = await one(
          `select * from public.read_directsign_private_file_upload_ticket(
            $1::uuid,$2::uuid,'advertiser_verification',$1::uuid,null,null
          )`,
          [ticketId, ids.marketer],
        );
        assert.equal(ticket.outcome, "found");
        const record = {
          id: ticketId,
          target_type: "advertiser_organization",
          target_id: ids.organization,
          verification_type: "business_registration_certificate",
          status: "pending",
          profile_id: ids.marketer,
          organization_id: ids.organization,
          subject_name: "QA advertiser",
          evidence_file_name: "evidence.pdf",
          evidence_file_mime: ticket.content_type,
          evidence_file_size: Number(ticket.byte_size),
          evidence_snapshot_json: {
            evidence_file: {
              provider: "supabase_storage",
              bucket: ticket.bucket,
              path: ticket.object_path,
              content_type: ticket.content_type,
              byte_size: Number(ticket.byte_size),
              sha256: ticket.sha256,
              stored_at: "2026-08-11T00:00:00.000Z",
            },
          },
          created_at: "2026-08-11T00:00:00.000Z",
          updated_at: "2026-08-11T00:00:00.000Z",
        };
        const mismatched = structuredClone(record);
        mismatched.evidence_snapshot_json.evidence_file.sha256 = "b".repeat(64);
        assert.equal(
          (
            await one(
              `select * from public.insert_directsign_verification_request_from_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$3::jsonb
              )`,
              [ticketId, ids.marketer, JSON.stringify(mismatched)],
            )
          ).outcome,
          "upload_ticket_invalid",
        );
        assert.equal(await count("public.verification_requests"), 0);
        assert.equal(
          (
            await one(
              `select * from public.insert_directsign_verification_request_from_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$3::jsonb
              )`,
              [ticketId, ids.marketer, JSON.stringify(record)],
            )
          ).outcome,
          "inserted",
        );
        assert.equal(
          (
            await one(
              `select * from public.insert_directsign_verification_request_from_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$3::jsonb
              )`,
              [ticketId, ids.marketer, JSON.stringify(record)],
            )
          ).outcome,
          "idempotent",
        );
        const replayWithLaterStoredAt = structuredClone(record);
        replayWithLaterStoredAt.evidence_snapshot_json.evidence_file.stored_at =
          "2026-08-11T00:05:00.000Z";
        assert.equal(
          (
            await one(
              `select * from public.insert_directsign_verification_request_from_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$3::jsonb
              )`,
              [
                ticketId,
                ids.marketer,
                JSON.stringify(replayWithLaterStoredAt),
              ],
            )
          ).outcome,
          "idempotent",
        );
        assert.equal(await count("public.verification_requests"), 1);
        assert.equal(
          (
            await one(
              `select public.finalize_directsign_private_file_upload_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$1::uuid,
                $3::text,$4::text,$5::text,$6::bigint,$7::text
              ) as outcome`,
              [
                ticketId,
                ids.marketer,
                ticket.bucket,
                ticket.object_path,
                ticket.content_type,
                ticket.byte_size,
                ticket.sha256,
              ],
            )
          ).outcome,
          "idempotent",
        );
        assert.equal(await count("public.verification_requests"), 1);

        const max = 10 * 1024 * 1024;
        assert.equal(
          (
            await issue({
              ticketId: ids.verificationTickets[3],
              purpose: "advertiser_verification",
              actorId: ids.marketer,
              byteSize: max,
            })
          ).outcome,
          "issued",
        );
        await db.query(
          `update public.directsign_private_file_upload_tickets
             set issued_at=clock_timestamp()-interval '2 hours',
                 finalize_expires_at=clock_timestamp()-interval '1 hour',
                 cleanup_not_before=clock_timestamp()+interval '25 hours'
           where id=any($1::uuid[])`,
          [ids.verificationTickets.slice(1, 4)],
        );
        assert.equal(
          (
            await issue({
              ticketId: ids.verificationTickets[4],
              purpose: "advertiser_verification",
              actorId: ids.marketer,
              byteSize: 1,
            })
          ).outcome,
          "unreferenced_limit",
        );
      },
    );

    const expectedContractUpdatedAt = "2026-08-11T00:00:00.000Z";
    let deliverableFile: Record<string, unknown> = {};
    await t.test("deliverable ticket reserves quota and rejects competing limits", async () => {
      await db.query(
        `insert into public.contracts(id,status,updated_at) values($1,'active',$2)`,
        [ids.contract, expectedContractUpdatedAt],
      );
      await db.query(
        `insert into public.directsign_contracts(
          id,advertiser_id,title,status,contract,updated_at
        ) values($1,'advertiser','QA','SIGNED',$2::jsonb,$3)`,
        [
          ids.contract,
          JSON.stringify({ id: ids.contract, status: "SIGNED" }),
          expectedContractUpdatedAt,
        ],
      );
      await db.query(
        `insert into public.contract_parties(contract_id,profile_id,party_role)
         values($1,$2,'influencer')`,
        [ids.contract, ids.creator],
      );
      await db.query(
        `insert into public.deliverable_requirements(id,contract_id,quantity)
         values($1,$2,1)`,
        [ids.requirement, ids.contract],
      );

      const issued = await issue({
        ticketId: ids.deliverableTicket,
        purpose: "deliverable",
        actorId: ids.creator,
        contractId: ids.contract,
        requirementId: ids.requirement,
        contentType: "image/png",
        byteSize: 10,
        reservationId: ids.reservation,
      });
      assert.equal(issued.outcome, "issued");
      assert.equal(
        issued.object_path,
        `deliverables/${ids.contract}/${ids.deliverableTicket}-evidence.png`,
      );
      deliverableFile = {
        id: ids.file,
        bucket: issued.bucket,
        storage_path: issued.object_path,
        file_name: "evidence.png",
        content_type: "image/png",
        byte_size: 10,
        file_hash: "a".repeat(64),
      };
      assert.equal(
        await count("public.directsign_deliverable_upload_reservations"),
        1,
      );
      assert.equal(
        Number(
          (
            await one(
              `select byte_size
                 from public.directsign_deliverable_upload_reservations
                where id=$1`,
              [ids.reservation],
            )
          ).byte_size,
        ),
        10 * 1024 * 1024,
      );

      await db.query(
        "update public.contracts set status='completed' where id=$1",
        [ids.contract],
      );
      assert.equal(
        (
          await issue({
            ticketId: ids.quotaTicket,
            purpose: "deliverable",
            actorId: ids.creator,
            contractId: ids.contract,
            requirementId: ids.requirement,
            byteSize: 1,
            reservationId: ids.quotaReservation,
            maxDeliverables: 100,
          })
        ).outcome,
        "contract_invalid",
      );
      await db.query("update public.contracts set status='active' where id=$1", [
        ids.contract,
      ]);

      assert.equal(
        (
          await issue({
            ticketId: ids.quotaTicket,
            purpose: "deliverable",
            actorId: ids.creator,
            contractId: ids.contract,
            requirementId: ids.requirement,
            byteSize: 1,
            reservationId: ids.quotaReservation,
            maxDeliverables: 1,
          })
        ).outcome,
        "deliverable_limit",
      );
      assert.equal(
        (
          await issue({
            ticketId: ids.storageQuotaTicket,
            purpose: "deliverable",
            actorId: ids.creator,
            contractId: ids.contract,
            requirementId: ids.requirement,
            byteSize: 6,
            reservationId: ids.storageQuotaReservation,
            maxContractBytes: 15,
          })
        ).outcome,
        "storage_limit",
      );
      assert.equal(await count("public.directsign_private_file_upload_tickets", "purpose='deliverable'"), 1);
      assert.equal(
        await count("public.directsign_deliverable_upload_reservations"),
        1,
      );
      assert.equal(
        Number(
          (
            await one(
              `select byte_size
                 from public.directsign_deliverable_upload_reservations
                where id=$1`,
              [ids.reservation],
            )
          ).byte_size,
        ),
        10 * 1024 * 1024,
      );
    });

    await t.test("194 wrapper rolls back every row, then succeeds and replays exactly", async () => {
      await db.exec(String.raw`
        create or replace function public.qa_fail_contract_file_insert()
        returns trigger language plpgsql as $$
        begin
          if current_setting('qa.fail_contract_file_insert', true) = 'on' then
            raise exception 'QA_CONTRACT_FILE_INSERT_FAILURE';
          end if;
          return new;
        end $$;
        create trigger qa_fail_contract_file_insert
        before insert on public.contract_files
        for each row execute function public.qa_fail_contract_file_insert();
      `);
      await db.query(
        "select set_config('qa.fail_contract_file_insert','on',false)",
      );
      const call = () =>
        db.query(
          `select * from public.finalize_directsign_deliverable_submission_from_ticket(
            $1::uuid,$2::uuid,$3::timestamptz,$4::jsonb,$5::uuid,$6::uuid,
            $7::uuid,'QA content','https://example.test/content','{}'::jsonb,
            $8::jsonb,$9::uuid,$10::uuid,$11::uuid,'Creator',null,null,$12::timestamptz
          )`,
          [
            ids.deliverableTicket,
            ids.contract,
            expectedContractUpdatedAt,
            JSON.stringify({ id: ids.contract, status: "SIGNED" }),
            ids.deliverableTicket,
            ids.requirement,
            ids.creator,
            JSON.stringify(deliverableFile),
            ids.reservation,
            ids.submittedEvent,
            ids.readyEvent,
            "2026-08-11T00:01:00.000Z",
          ],
        );

      await assert.rejects(call(), /QA_CONTRACT_FILE_INSERT_FAILURE/);
      assert.equal(await count("public.deliverables"), 0);
      assert.equal(await count("public.contract_files"), 0);
      assert.equal(await count("public.contract_events"), 0);
      assert.equal(
        await count("public.directsign_deliverable_upload_reservations"),
        1,
      );
      assert.equal(
        Number(
          (
            await one(
              `select byte_size
                 from public.directsign_deliverable_upload_reservations
                where id=$1`,
              [ids.reservation],
            )
          ).byte_size,
        ),
        10 * 1024 * 1024,
      );
      assert.deepEqual(
        await one(
          `select state,finalized_at from public.directsign_private_file_upload_tickets
           where id=$1`,
          [ids.deliverableTicket],
        ),
        { state: "issued", finalized_at: null },
      );
      assert.equal(
        new Date(
          (
            await one(
              "select updated_at from public.directsign_contracts where id=$1",
              [ids.contract],
            )
          ).updated_at as string,
        ).toISOString(),
        expectedContractUpdatedAt,
      );

      await db.query(
        "select set_config('qa.fail_contract_file_insert','off',false)",
      );
      const succeeded = (await call()).rows[0] as Row;
      assert.equal(succeeded.outcome, "submitted");
      assert.deepEqual(
        [
          Number(succeeded.total),
          Number(succeeded.submitted),
          Number(succeeded.approved),
        ],
        [1, 1, 0],
      );
      assert.equal(await count("public.deliverables"), 1);
      assert.equal(await count("public.contract_files"), 1);
      assert.equal(await count("public.contract_events"), 1);
      assert.equal(
        await count("public.directsign_deliverable_upload_reservations"),
        0,
      );
      assert.equal(
        (
          await one(
            "select state from public.directsign_private_file_upload_tickets where id=$1",
            [ids.deliverableTicket],
          )
        ).state,
        "finalized",
      );

      const replay = (await call()).rows[0] as Row;
      assert.equal(replay.outcome, "idempotent");
      assert.equal(await count("public.deliverables"), 1);
      assert.equal(await count("public.contract_files"), 1);
      assert.equal(await count("public.contract_events"), 1);

      const mismatchedFile = {
        ...deliverableFile,
        file_hash: "b".repeat(64),
      };
      const mismatch = await one(
        `select * from public.finalize_directsign_deliverable_submission_from_ticket(
          $1::uuid,$2::uuid,$3::timestamptz,$4::jsonb,$5::uuid,$6::uuid,
          $7::uuid,'QA content','https://example.test/content','{}'::jsonb,
          $8::jsonb,$9::uuid,$10::uuid,$11::uuid,'Creator',null,null,$12::timestamptz
        )`,
        [
          ids.deliverableTicket,
          ids.contract,
          expectedContractUpdatedAt,
          JSON.stringify({ id: ids.contract, status: "SIGNED" }),
          ids.deliverableTicket,
          ids.requirement,
          ids.creator,
          JSON.stringify(mismatchedFile),
          ids.reservation,
          ids.submittedEvent,
          ids.readyEvent,
          "2026-08-11T00:01:00.000Z",
        ],
      );
      assert.equal(mismatch.outcome, "upload_ticket_invalid");
    });

    await t.test("account and contract deletion retain cleanup tracking rows", async () => {
      assert.equal(
        (
          await issue({
            ticketId: ids.deletedAccountTicket,
            purpose: "advertiser_verification",
            actorId: ids.deletedMarketer,
            contentType: "image/jpeg",
            byteSize: 123,
          })
        ).outcome,
        "issued",
      );
      await db.query("delete from public.profiles where id=$1", [ids.deletedMarketer]);
      assert.equal(
        await count(
          "public.directsign_private_file_upload_tickets",
          `id='${ids.deletedAccountTicket}'`,
        ),
        1,
      );

      await db.query(
        "insert into public.contracts(id,status) values($1,'active')",
        [ids.deletedContract],
      );
      await db.query(
        `insert into public.directsign_contracts(
          id,advertiser_id,title,status,contract
        ) values($1,'advertiser','QA','SIGNED',$2::jsonb)`,
        [
          ids.deletedContract,
          JSON.stringify({ id: ids.deletedContract, status: "SIGNED" }),
        ],
      );
      await db.query(
        `insert into public.contract_parties(contract_id,profile_id,party_role)
         values($1,$2,'influencer')`,
        [ids.deletedContract, ids.deletedContractCreator],
      );
      assert.equal(
        (
          await issue({
            ticketId: ids.deletedContractTicket,
            purpose: "deliverable",
            actorId: ids.deletedContractCreator,
            contractId: ids.deletedContract,
            contentType: "image/webp",
            byteSize: 456,
            reservationId: ids.deletedContractReservation,
          })
        ).outcome,
        "issued",
      );
      assert.equal(
        await count("public.directsign_deliverable_upload_reservations", `id='${ids.deletedContractReservation}'`),
        1,
      );
      await db.query("delete from public.contracts where id=$1", [ids.deletedContract]);
      assert.equal(
        await count("public.directsign_deliverable_upload_reservations", `id='${ids.deletedContractReservation}'`),
        0,
      );
      assert.equal(
        await count(
          "public.directsign_private_file_upload_tickets",
          `id='${ids.deletedContractTicket}'`,
        ),
        1,
      );
    });

    await t.test("cleanup leases exclude competitors and preserve retry ownership", async () => {
      const claim = async (owner: string, limit = 1) =>
        (await db.query(
          "select * from public.claim_directsign_private_upload_cleanup($1::uuid,$2::integer,300)",
          [owner, limit],
        )).rows as Row[];
      const complete = async (
        ticketId: string,
        owner: string,
        outcome: string,
        errorCode: string | null = null,
      ) =>
        (
          await one(
            `select public.complete_directsign_private_upload_cleanup(
              $1::uuid,$2::uuid,$3::text,$4::text
            ) as outcome`,
            [ticketId, owner, outcome, errorCode],
          )
        ).outcome;

      assert.equal((await claim(ids.leaseA)).length, 0);
      await db.query(
        `update public.directsign_private_file_upload_tickets
            set issued_at=clock_timestamp()-interval '30 hours',
                finalize_expires_at=clock_timestamp()-interval '29 hours',
                cleanup_not_before=clock_timestamp()-interval '2 hours'
          where id=$1`,
        [ids.verificationTickets[1]],
      );
      const firstLease = await claim(ids.leaseA);
      assert.equal(firstLease.length, 1);
      assert.equal(firstLease[0].id, ids.verificationTickets[1]);
      assert.equal(Number(firstLease[0].cleanup_attempts), 1);
      assert.equal((await claim(ids.leaseB)).length, 0);
      assert.equal(
        await complete(ids.verificationTickets[1], ids.leaseB, "cleaned"),
        "lease_lost",
      );
      assert.equal(
        await complete(
          ids.verificationTickets[1],
          ids.leaseA,
          "retry",
          "storage_timeout",
        ),
        "retry",
      );
      const retried = await one(
        `select state,cleanup_lease_owner,last_error_code,
                cleanup_not_before > clock_timestamp() as delayed
           from public.directsign_private_file_upload_tickets where id=$1`,
        [ids.verificationTickets[1]],
      );
      assert.deepEqual(retried, {
        state: "cleanup_pending",
        cleanup_lease_owner: null,
        last_error_code: "storage_timeout",
        delayed: true,
      });

      await db.query(
        `update public.directsign_private_file_upload_tickets
            set cleanup_not_before=clock_timestamp()-interval '1 minute'
          where id=$1`,
        [ids.verificationTickets[1]],
      );
      const secondLease = await claim(ids.leaseB);
      assert.equal(secondLease.length, 1);
      assert.equal(Number(secondLease[0].cleanup_attempts), 2);
      await db.query(
        `update public.directsign_private_file_upload_tickets
            set cleanup_lease_expires_at=clock_timestamp()-interval '1 second'
          where id=$1`,
        [ids.verificationTickets[1]],
      );
      assert.equal(
        await complete(ids.verificationTickets[1], ids.leaseB, "cleaned"),
        "lease_lost",
      );
      const thirdLease = await claim(ids.leaseC);
      assert.equal(thirdLease.length, 1);
      assert.equal(Number(thirdLease[0].cleanup_attempts), 3);
      assert.equal(
        await complete(ids.verificationTickets[1], ids.leaseC, "cleaned"),
        "cleaned",
      );

      await db.query(
        `update public.directsign_private_file_upload_tickets
            set issued_at=clock_timestamp()-interval '30 hours',
                finalize_expires_at=clock_timestamp()-interval '29 hours',
                cleanup_not_before=clock_timestamp()-interval '2 hours'
          where id=$1`,
        [ids.verificationTickets[2]],
      );
      assert.equal((await claim(ids.leaseA)).length, 1);
      assert.equal(
        await complete(ids.verificationTickets[2], ids.leaseA, "referenced"),
        "finalized",
      );
      assert.deepEqual(
        await one(
          `select state,finalized_at is not null as finalized,
                  cleanup_lease_owner is null as lease_released
             from public.directsign_private_file_upload_tickets where id=$1`,
          [ids.verificationTickets[2]],
        ),
        { state: "finalized", finalized: true, lease_released: true },
      );
    });

    await t.test(
      "bounded ticket pruning honors TTL, exact references, completed deletion, and legal holds",
      async () => {
        const pruneNow = (await one("select clock_timestamp() as value"))
          .value as string;
        const insertTicket = async (
          ticketId: string,
          state: "cleaned" | "finalized",
          cleanedAt: string | null = null,
        ) => {
          await db.query(
            `insert into public.directsign_private_file_upload_tickets(
               id,purpose,actor_profile_id,resource_id,bucket,object_path,
               content_type,byte_size,sha256,state,issued_at,
               finalize_expires_at,cleanup_not_before,finalized_at,cleaned_at,
               updated_at
             ) values(
               $1::uuid,'influencer_verification',$2::uuid,$1::uuid,
               'directsign-private',
               'verification-influencer/' || $2::uuid::text || '/' ||
                 $1::uuid::text ||
                 '-evidence.png',
               'image/png',1,$3::text,$4::text,
               $5::timestamptz-interval '60 days',
               $5::timestamptz-interval '59 days',
               $5::timestamptz-interval '58 days',
               case when $4::text='finalized' then
                 $5::timestamptz-interval '31 days' else null end,
               $6::timestamptz,$5::timestamptz
             )`,
            [
              ticketId,
              ids.creator,
              "d".repeat(64),
              state,
              pruneNow,
              cleanedAt,
            ],
          );
        };
        const insertDeletion = async (
          ticketId: string,
          status: "pending" | "completed",
          pathTicketId = ticketId,
        ) => {
          await db.query(
            `insert into public.privacy_storage_deletion_queue(
               source_type,source_id,category,bucket,object_path,due_at,
               status,available_at,completed_at,created_at,updated_at
             ) values(
               'verification_request',$1::uuid::text,'verification',
               'directsign-private',
               'verification-influencer/' || $2::uuid::text || '/' ||
                 $3::uuid::text ||
                 '-evidence.png',
               $4::timestamptz-interval '1 day',$5,
               $4::timestamptz-interval '1 day',
               case when $5='completed' then
                 $4::timestamptz-interval '1 day' else null end,
               $4::timestamptz-interval '2 days',$4::timestamptz
             )`,
            [ticketId, ids.creator, pathTicketId, pruneNow, status],
          );
        };
        const prune = async (limit = 500) =>
          one(
            `select *
               from public.prune_directsign_private_file_upload_tickets(
                 $1::integer,$2::timestamptz
               )`,
            [limit, pruneNow],
          );

        await insertTicket(
          ids.pruneCleanedBoundary,
          "cleaned",
          new Date(
            new Date(pruneNow).getTime() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        );
        await insertTicket(
          ids.pruneCleanedEarly,
          "cleaned",
          new Date(
            new Date(pruneNow).getTime() -
              30 * 24 * 60 * 60 * 1000 +
              1000,
          ).toISOString(),
        );
        await insertTicket(
          ids.pruneCleanedHeld,
          "cleaned",
          new Date(
            new Date(pruneNow).getTime() - 31 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        );
        await db.query(
          `insert into public.privacy_legal_holds(
             scope_type,scope_id,starts_at
           ) values(
             'verification_request',$1::uuid::text,
             $2::timestamptz-interval '1 day'
           )`,
          [ids.pruneCleanedHeld, pruneNow],
        );

        await setClaimRole("authenticated");
        await assert.rejects(prune(), /service role required/);
        await setClaimRole("service_role");
        await assert.rejects(prune(501), /invalid upload ticket prune limit/);

        assert.deepEqual(await prune(), {
          cleaned_pruned: 1,
          finalized_pruned: 0,
          total_pruned: 1,
        });
        assert.equal(
          await count(
            "public.directsign_private_file_upload_tickets",
            `id='${ids.pruneCleanedBoundary}'`,
          ),
          0,
        );
        assert.equal(
          await count(
            "public.directsign_private_file_upload_tickets",
            `id in ('${ids.pruneCleanedEarly}','${ids.pruneCleanedHeld}')`,
          ),
          2,
        );

        for (const ticketId of [ids.pruneBatchA, ids.pruneBatchB]) {
          await insertTicket(
            ticketId,
            "cleaned",
            new Date(
              new Date(pruneNow).getTime() - 31 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          );
        }
        assert.deepEqual(await prune(1), {
          cleaned_pruned: 1,
          finalized_pruned: 0,
          total_pruned: 1,
        });
        assert.equal(
          await count(
            "public.directsign_private_file_upload_tickets",
            `id in ('${ids.pruneBatchA}','${ids.pruneBatchB}')`,
          ),
          1,
        );
        assert.deepEqual(await prune(1), {
          cleaned_pruned: 1,
          finalized_pruned: 0,
          total_pruned: 1,
        });

        for (const ticketId of [
          ids.pruneFinalizedDeleted,
          ids.pruneFinalizedReferenced,
          ids.pruneFinalizedHeld,
          ids.pruneFinalizedPending,
        ]) {
          await insertTicket(ticketId, "finalized");
        }
        for (const ticketId of [
          ids.pruneFinalizedDeleted,
          ids.pruneFinalizedReferenced,
          ids.pruneFinalizedHeld,
        ]) {
          await insertDeletion(ticketId, "completed");
        }
        await insertDeletion(ids.pruneFinalizedPending, "pending");
        await db.query(
          `insert into public.privacy_legal_holds(
             scope_type,scope_id,starts_at
           ) values(
             'verification_request',$1::uuid::text,
             $2::timestamptz-interval '1 day'
           )`,
          [ids.pruneFinalizedHeld, pruneNow],
        );
        await db.query(
          `insert into public.verification_requests(
             id,target_type,target_id,verification_type,status,profile_id,
             subject_name,evidence_file_mime,evidence_file_size,
             evidence_snapshot_json
           ) values(
             $1::uuid,'influencer_account',$2::uuid::text,
             'platform_account','pending',$2::uuid,
             'QA creator','image/png',1,
             jsonb_build_object('evidence_file',jsonb_build_object(
               'provider','supabase_storage','bucket','directsign-private',
               'path','verification-influencer/' || $2::uuid::text || '/' ||
                 $1::uuid::text || '-evidence.png',
               'content_type','image/png','byte_size',1,
               'sha256',$3::text
             ))
           )`,
          [ids.pruneFinalizedReferenced, ids.creator, "d".repeat(64)],
        );

        assert.deepEqual(await prune(), {
          cleaned_pruned: 0,
          finalized_pruned: 1,
          total_pruned: 1,
        });
        assert.equal(
          await count(
            "public.directsign_private_file_upload_tickets",
            `id='${ids.pruneFinalizedDeleted}'`,
          ),
          0,
        );
        assert.equal(
          await count(
            "public.directsign_private_file_upload_tickets",
            `id in ('${ids.pruneFinalizedReferenced}',
                    '${ids.pruneFinalizedHeld}',
                    '${ids.pruneFinalizedPending}')`,
          ),
          3,
        );

        const migration = await readFile(
          "supabase/migrations/20260811202000_private_file_upload_tickets.sql",
          "utf8",
        );
        assert.match(
          migration,
          /limit p_limit\s+for update of ticket skip locked/i,
        );
        assert.match(
          migration,
          /perform directsign_private\.directsign_lock_privacy_storage_barrier\(\)/i,
        );
      },
    );

    await t.test(
      "account erasure invalidates issued capabilities and waits for exact delayed cleanup",
      async () => {
        const issued = await issue({
          ticketId: ids.erasureTicket,
          purpose: "advertiser_verification",
          actorId: ids.erasureActor,
          byteSize: 321,
        });
        const finalized = await issue({
          ticketId: ids.erasureFinalizedTicket,
          purpose: "advertiser_verification",
          actorId: ids.erasureActor,
          byteSize: 654,
          sha256: "c".repeat(64),
        });
        assert.equal(issued.outcome, "issued");
        assert.equal(finalized.outcome, "issued");
        const issuedTicket = await one(
          "select * from public.directsign_private_file_upload_tickets where id=$1",
          [ids.erasureTicket],
        );
        const finalizedTicket = await one(
          "select * from public.directsign_private_file_upload_tickets where id=$1",
          [ids.erasureFinalizedTicket],
        );

        const verificationRecord = (
          ticketId: string,
          ticket: Row,
          hash: string,
        ) => ({
          id: ticketId,
          target_type: "advertiser_organization",
          target_id: ids.organization,
          verification_type: "business_registration_certificate",
          status: "pending",
          profile_id: ids.erasureActor,
          organization_id: ids.organization,
          subject_name: "QA advertiser",
          evidence_file_name: "evidence.pdf",
          evidence_file_mime: ticket.content_type,
          evidence_file_size: Number(ticket.byte_size),
          evidence_snapshot_json: {
            evidence_file: {
              provider: "supabase_storage",
              bucket: ticket.bucket,
              path: ticket.object_path,
              content_type: ticket.content_type,
              byte_size: Number(ticket.byte_size),
              sha256: hash,
              stored_at: "2026-08-11T00:00:00.000Z",
            },
          },
          created_at: "2026-08-11T00:00:00.000Z",
          updated_at: "2026-08-11T00:00:00.000Z",
        });

        const finalizedRecord = verificationRecord(
          ids.erasureFinalizedTicket,
          finalizedTicket,
          "c".repeat(64),
        );
        assert.equal(
          (
            await one(
              `select * from public.insert_directsign_verification_request_from_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$3::jsonb
              )`,
              [
                ids.erasureFinalizedTicket,
                ids.erasureActor,
                JSON.stringify(finalizedRecord),
              ],
            )
          ).outcome,
          "inserted",
        );

        await db.query(
          `insert into public.privacy_erasure_requests(
            id,auth_user_id,status,updated_at
          ) values($1,$2,'requested',clock_timestamp())`,
          [ids.erasureRequest, ids.erasureActor],
        );

        assert.deepEqual(
          await one(
            `select state, erasure_request_id,
                    cleanup_not_before >= issued_at + interval '27 hours'
                      as capability_window_elapsed_by_cleanup
             from public.directsign_private_file_upload_tickets where id=$1`,
            [ids.erasureTicket],
          ),
          {
            state: "cleanup_pending",
            erasure_request_id: ids.erasureRequest,
            capability_window_elapsed_by_cleanup: true,
          },
        );
        assert.deepEqual(
          await one(
            `select queue.status,
                    queue.due_at = ticket.cleanup_not_before as exact_due,
                    queue.available_at = ticket.cleanup_not_before as exact_available,
                    queue.due_at > clock_timestamp() as capability_still_live
             from public.privacy_storage_deletion_queue as queue
             join public.directsign_private_file_upload_tickets as ticket
               on ticket.erasure_request_id=queue.erasure_request_id
              and ticket.bucket=queue.bucket
              and ticket.object_path=queue.object_path
             where ticket.id=$1`,
            [ids.erasureTicket],
          ),
          {
            status: "pending",
            exact_due: true,
            exact_available: true,
            capability_still_live: true,
          },
        );
        assert.equal(
          (
            await one(
              `select
                 (select count(*) from public.privacy_storage_deletion_queue
                   where erasure_request_id=$1 and status<>'completed') =
                 (select count(*) from public.directsign_private_file_upload_tickets
                   where erasure_request_id=$1 and state='cleanup_pending')
                   as every_unfinalized_ticket_is_queued`,
              [ids.erasureRequest],
            )
          ).every_unfinalized_ticket_is_queued,
          true,
        );
        assert.equal(
          (
            await one(
              `select case when exists (
                 select 1 from public.privacy_storage_deletion_queue
                 where erasure_request_id=$1 and status<>'completed'
               ) then 'waiting_storage' else 'ready_to_finalize' end as status`,
              [ids.erasureRequest],
            )
          ).status,
          "waiting_storage",
        );

        const issuedRecord = verificationRecord(
          ids.erasureTicket,
          issuedTicket,
          "a".repeat(64),
        );
        assert.equal(
          (
            await one(
              `select * from public.insert_directsign_verification_request_from_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$3::jsonb
              )`,
              [
                ids.erasureTicket,
                ids.erasureActor,
                JSON.stringify(issuedRecord),
              ],
            )
          ).outcome,
          "upload_ticket_expired",
        );
        assert.equal(
          (
            await issue({
              ticketId: ids.postErasureTicket,
              purpose: "advertiser_verification",
              actorId: ids.erasureActor,
            })
          ).outcome,
          "erasure_in_progress",
        );
        assert.equal(
          (
            await one(
              `select * from public.insert_directsign_verification_request_from_ticket(
                $1::uuid,$2::uuid,'advertiser_verification',$3::jsonb
              )`,
              [
                ids.erasureFinalizedTicket,
                ids.erasureActor,
                JSON.stringify(finalizedRecord),
              ],
            )
          ).outcome,
          "idempotent",
        );
        assert.deepEqual(
          await one(
            `select state, erasure_request_id is null as retained_separately
             from public.directsign_private_file_upload_tickets where id=$1`,
            [ids.erasureFinalizedTicket],
          ),
          { state: "finalized", retained_separately: true },
        );

        await db.query(
          `update public.privacy_storage_deletion_queue
           set due_at=clock_timestamp()-interval '1 second',
               available_at=clock_timestamp()-interval '1 second',
               status='completed', completed_at=clock_timestamp(),
               updated_at=clock_timestamp()
           where erasure_request_id=$1 and object_path=$2`,
          [ids.erasureRequest, issued.object_path],
        );
        assert.deepEqual(
          await one(
            `select state, cleaned_at is not null as cleaned,
                    cleanup_lease_owner is null as lease_released
             from public.directsign_private_file_upload_tickets where id=$1`,
            [ids.erasureTicket],
          ),
          { state: "cleaned", cleaned: true, lease_released: true },
        );
        assert.equal(
          (
            await one(
              `select case when exists (
                 select 1 from public.privacy_storage_deletion_queue
                 where erasure_request_id=$1 and status<>'completed'
               ) then 'waiting_storage' else 'ready_to_finalize' end as status`,
              [ids.erasureRequest],
            )
          ).status,
          "ready_to_finalize",
        );
        await db.query(
          `update public.privacy_erasure_requests
           set status='completed', updated_at=clock_timestamp() where id=$1`,
          [ids.erasureRequest],
        );
        assert.equal(
          await count(
            "public.directsign_private_file_upload_tickets",
            `id='${ids.erasureTicket}'`,
          ),
          0,
        );
        assert.deepEqual(
          await one(
            `select state, erasure_request_id is null as retained_separately
             from public.directsign_private_file_upload_tickets where id=$1`,
            [ids.erasureFinalizedTicket],
          ),
          { state: "finalized", retained_separately: true },
        );
      },
    );
  } finally {
    await db.close();
  }
});
