import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

type Row = Record<string, unknown>;

const migrationPath =
  "supabase/migrations/20260811193000_serialize_audit_event_chains.sql";

const ids = {
  forkContract: "11111111-1111-4111-8111-111111111111",
  cleanContract: "22222222-2222-4222-8222-222222222222",
  emptyContract: "33333333-3333-4333-8333-333333333333",
  forkRoot: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  forkHeadA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  forkHeadB: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  cleanRoot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  cleanHead: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  generationOneA: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  generationOneB: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  competingSuccessor: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
  supportRequest: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  supportRoot: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  supportHead: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
  supportNext: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3",
} as const;

const hashes = {
  forkRoot: "1".repeat(64),
  forkHeadA: "2".repeat(64),
  forkHeadB: "3".repeat(64),
  cleanRoot: "4".repeat(64),
  cleanHead: "5".repeat(64),
  supportRoot: "6".repeat(64),
  supportHead: "7".repeat(64),
} as const;

test("audit chain checkpoints preserve legacy forks and serialize generation one", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const migration = await readFile(migrationPath, "utf8");

  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)).rows[0] as Row;

  const scalar = async (sql: string, params: unknown[] = []) =>
    (await one(sql, params)).value;

  const contractSnapshot = async (contractId: string, legacyShape = false) =>
    (
      await one(
        `select coalesce(
           jsonb_agg(
             ${legacyShape ? "to_jsonb(event) - 'chain_generation'" : "to_jsonb(event)"}
             order by event.id
           ),
           '[]'::jsonb
         ) as value
         from public.contract_events as event
         where event.contract_id = $1`,
        [contractId],
      )
    ).value;

  const supportSnapshot = async () =>
    (
      await one(`
        select coalesce(
          jsonb_agg(to_jsonb(event) order by event.id),
          '[]'::jsonb
        ) as value
        from public.support_access_events as event
      `)
    ).value;

  try {
    await db.exec(String.raw`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;

      create schema extensions;
      create extension pgcrypto with schema extensions;
      create schema auth;

      create or replace function auth.role()
      returns text
      language sql
      stable
      set search_path = ''
      as $$
        select nullif(
          pg_catalog.current_setting('request.jwt.claim.role', true),
          ''
        )
      $$;
      grant usage on schema auth to public;
      grant execute on function auth.role() to public;

      create table public.contracts (
        id uuid primary key,
        title text not null default 'QA contract'
      );

      create table public.contract_events (
        id uuid primary key,
        contract_id uuid not null
          references public.contracts(id) on delete cascade,
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
        event_hash text not null default '',
        previous_event_hash text,
        created_at timestamptz not null default now()
      );

      create or replace function public.directsign_set_contract_event_hash()
      returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger contract_events_set_hash
      before insert on public.contract_events
      for each row execute function public.directsign_set_contract_event_hash();

      create or replace function public.directsign_prevent_contract_event_mutation()
      returns trigger
      language plpgsql
      set search_path = ''
      as $$
      begin
        if tg_op = 'DELETE'
           and pg_catalog.current_setting(
             'directsign.privacy_retention_purge', true
           ) = 'on'
           and coalesce(auth.role(), '') = 'service_role' then
          return old;
        end if;
        raise exception 'contract_events is append-only';
      end;
      $$;
      create trigger contract_events_prevent_update
      before update on public.contract_events
      for each row execute function public.directsign_prevent_contract_event_mutation();
      create trigger contract_events_prevent_delete
      before delete on public.contract_events
      for each row execute function public.directsign_prevent_contract_event_mutation();

      create or replace function public.directsign_prevent_support_access_event_mutation()
      returns trigger
      language plpgsql
      set search_path = ''
      as $$ begin raise exception 'support_access_events is append-only'; end $$;
      create trigger support_access_events_prevent_update
      before update on public.support_access_events
      for each row execute function
        public.directsign_prevent_support_access_event_mutation();
      create trigger support_access_events_prevent_delete
      before delete on public.support_access_events
      for each row execute function
        public.directsign_prevent_support_access_event_mutation();

      grant select, delete on public.contracts to service_role;
    `);

    await db.query(
      `insert into public.contracts(id) values ($1), ($2), ($3)`,
      [ids.forkContract, ids.cleanContract, ids.emptyContract],
    );

    await db.query(
      `insert into public.contract_events(
         id, contract_id, event_type, payload,
         previous_event_hash, event_hash, created_at
       ) values
         ($1, $2, 'legacy_root', '{"ordinal":1}', null, $3, $4),
         ($5, $2, 'legacy_head_a', '{"ordinal":2}', $3, $6, $7),
         ($8, $2, 'legacy_head_b', '{"ordinal":3}', $3, $9, $10),
         ($11, $12, 'clean_root', '{"ordinal":1}', null, $13, $14),
         ($15, $12, 'clean_head', '{"ordinal":2}', $13, $16, $17)`,
      [
        ids.forkRoot,
        ids.forkContract,
        hashes.forkRoot,
        "2026-08-01T00:00:00.000Z",
        ids.forkHeadA,
        hashes.forkHeadA,
        "2026-08-01T00:01:00.000Z",
        ids.forkHeadB,
        hashes.forkHeadB,
        "2026-08-01T00:02:00.000Z",
        ids.cleanRoot,
        ids.cleanContract,
        hashes.cleanRoot,
        "2026-08-01T00:03:00.000Z",
        ids.cleanHead,
        hashes.cleanHead,
        "2026-08-01T00:04:00.000Z",
      ],
    );

    await db.query(
      `insert into public.support_access_events(
         id, support_access_request_id, contract_id, action, actor_role,
         description, previous_event_hash, event_hash, created_at
       ) values
         ($1, $2, $3, 'opened', 'support', 'root', null, $4, $5),
         ($6, $2, $3, 'viewed', 'support', 'head', $4, $7, $8)`,
      [
        ids.supportRoot,
        ids.supportRequest,
        ids.forkContract,
        hashes.supportRoot,
        "2026-08-01T01:00:00.000Z",
        ids.supportHead,
        hashes.supportHead,
        "2026-08-01T01:01:00.000Z",
      ],
    );

    const forkBefore = await contractSnapshot(ids.forkContract);
    const cleanBefore = await contractSnapshot(ids.cleanContract);
    const supportBefore = await supportSnapshot();

    await db.exec(migration);

    await t.test("legacy fork and clean rows remain byte-equivalent", async () => {
      assert.deepEqual(
        await contractSnapshot(ids.forkContract, true),
        forkBefore,
      );
      assert.deepEqual(
        await contractSnapshot(ids.cleanContract, true),
        cleanBefore,
      );

      assert.equal(
        await scalar(
          `select count(*)::integer as value
           from public.contract_events
           where contract_id = $1 and chain_generation = 0`,
          [ids.forkContract],
        ),
        3,
      );
      assert.equal(
        await scalar(
          `select count(*)::integer as value
           from public.contract_events
           where contract_id = $1 and chain_generation = 0`,
          [ids.cleanContract],
        ),
        2,
      );
    });

    await t.test("fork and clean checkpoints commit exact legacy heads", async () => {
      const forkCheckpoint = await one(
        `select
           source_event_count::integer as event_count,
           source_head_count::integer as head_count,
           source_snapshot,
           checkpoint_hash
         from public.contract_event_chain_checkpoints
         where contract_id = $1 and generation = 1`,
        [ids.forkContract],
      );

      assert.equal(forkCheckpoint.event_count, 3);
      assert.equal(forkCheckpoint.head_count, 2);
      assert.deepEqual(
        (forkCheckpoint.source_snapshot as Row).heads,
        [
          { event_id: ids.forkHeadA, event_hash: hashes.forkHeadA },
          { event_id: ids.forkHeadB, event_hash: hashes.forkHeadB },
        ],
      );

      const canonical = [
        "directsign.contract-event-chain-checkpoint.v1",
        `contract_id=${ids.forkContract}`,
        "source_generation=0",
        "target_generation=1",
        "event_count=3",
        "head_count=2",
        "heads:",
        `${ids.forkHeadA}:${hashes.forkHeadA}`,
        `${ids.forkHeadB}:${hashes.forkHeadB}`,
      ].join("\n");
      assert.equal(
        forkCheckpoint.checkpoint_hash,
        createHash("sha256").update(canonical).digest("hex"),
      );

      const cleanCheckpoint = await one(
        `select
           source_event_count::integer as event_count,
           source_head_count::integer as head_count,
           source_snapshot
         from public.contract_event_chain_checkpoints
         where contract_id = $1 and generation = 1`,
        [ids.cleanContract],
      );
      assert.equal(cleanCheckpoint.event_count, 2);
      assert.equal(cleanCheckpoint.head_count, 1);
      assert.deepEqual((cleanCheckpoint.source_snapshot as Row).heads, [
        { event_id: ids.cleanHead, event_hash: hashes.cleanHead },
      ]);

      const emptyCheckpoint = await one(
        `select
           source_event_count::integer as event_count,
           source_head_count::integer as head_count,
           source_snapshot
         from public.contract_event_chain_checkpoints
         where contract_id = $1 and generation = 1`,
        [ids.emptyContract],
      );
      assert.equal(emptyCheckpoint.event_count, 0);
      assert.equal(emptyCheckpoint.head_count, 0);
      assert.deepEqual((emptyCheckpoint.source_snapshot as Row).heads, []);
    });

    await t.test("generation one starts at the checkpoint and stays linear", async () => {
      const checkpointHash = String(
        await scalar(
          `select checkpoint_hash as value
           from public.contract_event_chain_checkpoints
           where contract_id = $1 and generation = 1`,
          [ids.forkContract],
        ),
      );

      await db.query(
        `insert into public.contract_events(
           id, contract_id, event_type, payload,
           chain_generation, previous_event_hash, event_hash, created_at
         ) values ($1, $2, 'generation_one_a', '{"ordinal":4}',
           0, $3, $4, $5)`,
        [
          ids.generationOneA,
          ids.forkContract,
          "f".repeat(64),
          "0".repeat(64),
          "2026-08-02T00:00:00.000Z",
        ],
      );

      const first = await one(
        `select chain_generation, previous_event_hash, event_hash
         from public.contract_events where id = $1`,
        [ids.generationOneA],
      );
      assert.equal(first.chain_generation, 1);
      assert.equal(first.previous_event_hash, checkpointHash);
      assert.match(String(first.event_hash), /^[0-9a-f]{64}$/);
      assert.notEqual(first.event_hash, "0".repeat(64));

      await db.query(
        `insert into public.contract_events(
           id, contract_id, event_type, payload, created_at
         ) values ($1, $2, 'generation_one_b', '{"ordinal":5}', $3)`,
        [
          ids.generationOneB,
          ids.forkContract,
          "2026-08-02T00:01:00.000Z",
        ],
      );
      const second = await one(
        `select chain_generation, previous_event_hash, event_hash
         from public.contract_events where id = $1`,
        [ids.generationOneB],
      );
      assert.equal(second.chain_generation, 1);
      assert.equal(second.previous_event_hash, first.event_hash);

      await db.exec(
        "alter table public.contract_events disable trigger contract_events_set_hash",
      );
      try {
        await assert.rejects(
          db.query(
            `insert into public.contract_events(
               id, contract_id, event_type, chain_generation,
               previous_event_hash, event_hash, created_at
             ) values ($1, $2, 'competing_successor', 1, $3, $4, $5)`,
            [
              ids.competingSuccessor,
              ids.forkContract,
              checkpointHash,
              "8".repeat(64),
              "2026-08-02T00:02:00.000Z",
            ],
          ),
          /duplicate key|unique/i,
        );
      } finally {
        await db.exec(
          "alter table public.contract_events enable trigger contract_events_set_hash",
        );
      }
    });

    await t.test("events and checkpoints reject update/delete tampering", async () => {
      await assert.rejects(
        db.query(
          `update public.contract_events
           set payload = '{"tampered":true}'::jsonb where id = $1`,
          [ids.forkRoot],
        ),
        /append-only/i,
      );
      await assert.rejects(
        db.query("delete from public.contract_events where id = $1", [
          ids.forkRoot,
        ]),
        /append-only/i,
      );
      await assert.rejects(
        db.query(
          `update public.contract_event_chain_checkpoints
           set checkpoint_hash = $2 where contract_id = $1`,
          [ids.forkContract, "9".repeat(64)],
        ),
        /CHECKPOINT_APPEND_ONLY/i,
      );
      await assert.rejects(
        db.query(
          `delete from public.contract_event_chain_checkpoints
           where contract_id = $1`,
          [ids.forkContract],
        ),
        /CHECKPOINT_APPEND_ONLY/i,
      );
    });

    await t.test("support history is unchanged and its next event is serialized", async () => {
      assert.deepEqual(await supportSnapshot(), supportBefore);

      await db.query(
        `insert into public.support_access_events(
           id, support_access_request_id, contract_id, action, actor_role,
           description, previous_event_hash, event_hash, created_at
         ) values ($1, $2, $3, 'downloaded', 'support', 'next', $4, $5, $6)`,
        [
          ids.supportNext,
          ids.supportRequest,
          ids.forkContract,
          "0".repeat(64),
          "0".repeat(64),
          "2026-08-02T01:02:00.000Z",
        ],
      );
      const next = await one(
        `select previous_event_hash, event_hash
         from public.support_access_events where id = $1`,
        [ids.supportNext],
      );
      assert.equal(next.previous_event_hash, hashes.supportHead);
      assert.match(String(next.event_hash), /^[0-9a-f]{64}$/);
      assert.notEqual(next.event_hash, "0".repeat(64));
    });

    await t.test("checkpoint metadata and writer functions are service-only", async () => {
      const privileges = await one(`
        select
          has_schema_privilege(
            'anon', 'directsign_private', 'usage'
          ) as anon_schema,
          has_schema_privilege(
            'authenticated', 'directsign_private', 'usage'
          ) as authenticated_schema,
          has_table_privilege(
            'anon',
            'public.contract_event_chain_checkpoints',
            'select'
          ) as anon_select,
          has_table_privilege(
            'authenticated',
            'public.contract_event_chain_checkpoints',
            'select'
          ) as authenticated_select,
          has_table_privilege(
            'service_role',
            'public.contract_event_chain_checkpoints',
            'select'
          ) as service_select,
          has_table_privilege(
            'service_role',
            'public.contract_event_chain_checkpoints',
            'insert,update,delete'
          ) as service_write,
          has_function_privilege(
            'service_role',
            'directsign_private.directsign_ensure_contract_event_checkpoint(uuid)',
            'execute'
          ) as service_checkpoint_execute,
          has_function_privilege(
            'authenticated',
            'public.directsign_set_contract_event_hash()',
            'execute'
          ) as authenticated_hash_execute
      `);
      assert.deepEqual(privileges, {
        anon_schema: false,
        authenticated_schema: false,
        anon_select: false,
        authenticated_select: false,
        service_select: true,
        service_write: false,
        service_checkpoint_execute: false,
        authenticated_hash_execute: false,
      });

      await db.exec("set role authenticated");
      try {
        await assert.rejects(
          db.query("select * from public.contract_event_chain_checkpoints"),
          /permission denied/i,
        );
      } finally {
        await db.exec("reset role");
      }

      await db.exec("set role service_role");
      try {
        assert.equal(
          await scalar(
            `select count(*)::integer as value
             from public.contract_event_chain_checkpoints`,
          ),
          3,
        );
      } finally {
        await db.exec("reset role");
      }
    });

    await t.test("rerunning the migration is evidence-idempotent", async () => {
      const eventsBefore = await contractSnapshot(ids.forkContract);
      const supportBeforeRerun = await supportSnapshot();
      const checkpointsBefore = (
        await one(`
          select jsonb_agg(to_jsonb(checkpoint) order by contract_id) as value
          from public.contract_event_chain_checkpoints as checkpoint
        `)
      ).value;

      await db.exec(migration);

      assert.deepEqual(
        await contractSnapshot(ids.forkContract),
        eventsBefore,
      );
      assert.deepEqual(await supportSnapshot(), supportBeforeRerun);
      assert.deepEqual(
        (
          await one(`
            select jsonb_agg(to_jsonb(checkpoint) order by contract_id) as value
            from public.contract_event_chain_checkpoints as checkpoint
          `)
        ).value,
        checkpointsBefore,
      );
    });

    await t.test("normal deletion stays blocked and retention purge can cascade", async () => {
      await db.query("delete from public.contracts where id = $1", [
        ids.emptyContract,
      ]);
      assert.equal(
        await scalar(
          `select count(*)::integer as value
           from public.contract_event_chain_checkpoints
           where contract_id = $1`,
          [ids.emptyContract],
        ),
        0,
      );

      await assert.rejects(
        db.query("delete from public.contracts where id = $1", [
          ids.forkContract,
        ]),
        /append-only|CHECKPOINT_APPEND_ONLY/i,
      );
      assert.equal(
        await scalar(
          `select count(*)::integer as value
           from public.contract_events where contract_id = $1`,
          [ids.forkContract],
        ),
        5,
      );

      await db.exec(`
        begin;
        set local role service_role;
        set local request.jwt.claim.role = 'service_role';
        set local directsign.privacy_retention_purge = 'on';
        delete from public.contracts
        where id = '${ids.forkContract}';
        commit;
      `);
      assert.equal(
        await scalar(
          `select count(*)::integer as value
           from public.contract_events where contract_id = $1`,
          [ids.forkContract],
        ),
        0,
      );
      assert.equal(
        await scalar(
          `select count(*)::integer as value
           from public.contract_event_chain_checkpoints
           where contract_id = $1`,
          [ids.forkContract],
        ),
        0,
      );
      assert.equal(
        await scalar(
          `select count(*)::integer as value
           from public.support_access_events
           where support_access_request_id = $1`,
          [ids.supportRequest],
        ),
        3,
      );
    });
  } finally {
    await db.close();
  }
});
