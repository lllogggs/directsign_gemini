import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260811199000_revoke_password_reset_sessions.sql",
  import.meta.url,
);

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  oldSession: "22222222-2222-4222-8222-222222222222",
  recoverySession: "33333333-3333-4333-8333-333333333333",
  newSession: "44444444-4444-4444-8444-444444444444",
  reset: "55555555-5555-4555-8555-555555555555",
};

type Row = Record<string, unknown>;

const setup = async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '');
    $$;
    create table auth.users (id uuid primary key);
    create table auth.sessions (
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      created_at timestamptz not null
    );
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      role text not null
    );
    create table public.admin_operator_sessions (
      id uuid primary key default gen_random_uuid(),
      auth_session_id uuid not null unique,
      operator_profile_id uuid not null references public.profiles(id),
      aal text not null default 'aal2',
      authenticated_at timestamptz not null,
      last_seen_at timestamptz not null,
      absolute_expires_at timestamptz not null,
      revoked_at timestamptz,
      revoke_reason text
    );
    create table public.auth_recent_grants (
      token_hash text primary key,
      profile_id uuid not null references public.profiles(id),
      auth_session_id uuid not null,
      authenticated_at timestamptz not null,
      revoked_at timestamptz
    );
  `);
  await db.exec(await readFile(migrationUrl, "utf8"));
  await db.exec(`select set_config('request.jwt.claim.role', 'service_role', false)`);
  await db.query(`insert into auth.users(id) values($1)`, [ids.user]);
  await db.query(`insert into public.profiles(id,role) values($1,'admin')`, [ids.user]);
  await db.query(
    `insert into auth.sessions(id,user_id,created_at) values
      ($1,$3,now() - interval '2 hours'),
      ($2,$3,now() - interval '1 minute')`,
    [ids.oldSession, ids.recoverySession, ids.user],
  );
  return db;
};

const rpc = async (
  db: PGlite,
  name: string,
  params: unknown[],
  casts: string[],
) => {
  const placeholders = params.map((_, index) => `$${index + 1}::${casts[index]}`);
  return (
    await db.query(`select public.${name}(${placeholders.join(",")}) as result`, params)
  ).rows[0] as { result: Row };
};

test("199 migration enforces a monotonic reset barrier and authoritative auth.sessions cutoff", async () => {
  const db = await setup();
  try {
    let verified = await rpc(
      db,
      "verify_directsign_auth_session",
      [ids.user, ids.oldSession],
      ["uuid", "uuid"],
    );
    assert.equal(verified.result.active, true);

    await db.query(
      `insert into public.admin_operator_sessions(
        auth_session_id,operator_profile_id,authenticated_at,last_seen_at,absolute_expires_at
      ) values($1,$2,now(),now(),now() + interval '1 hour')`,
      [ids.oldSession, ids.user],
    );
    await db.query(
      `insert into public.auth_recent_grants(
        token_hash,profile_id,auth_session_id,authenticated_at
      ) values(repeat('a',64),$1,$2,now())`,
      [ids.user, ids.oldSession],
    );

    const begun = await rpc(
      db,
      "begin_directsign_password_reset",
      [ids.user, ids.reset, ids.recoverySession],
      ["uuid", "uuid", "uuid"],
    );
    assert.equal(begun.result.outcome, "started");

    verified = await rpc(
      db,
      "verify_directsign_auth_session",
      [ids.user, ids.oldSession],
      ["uuid", "uuid"],
    );
    assert.equal(verified.result.active, false);
    assert.equal(verified.result.reason, "reset_in_progress");
    const revokedAdminCount = (
      await db.query(
        `select count(*)::int as count from public.admin_operator_sessions where revoked_at is not null`,
      )
    ).rows[0] as Row;
    assert.equal(revokedAdminCount.count, 1);
    const revokedGrantCount = (
      await db.query(
        `select count(*)::int as count from public.auth_recent_grants where revoked_at is not null`,
      )
    ).rows[0] as Row;
    assert.equal(revokedGrantCount.count, 1);

    const resumed = await rpc(
      db,
      "begin_directsign_password_reset",
      [ids.user, ids.reset, ids.recoverySession],
      ["uuid", "uuid", "uuid"],
    );
    assert.equal(resumed.result.outcome, "resumed");

    const finished = await rpc(
      db,
      "finish_directsign_password_reset",
      [ids.user, ids.reset, ids.recoverySession],
      ["uuid", "uuid", "uuid"],
    );
    assert.equal(finished.result.outcome, "finished");

    verified = await rpc(
      db,
      "verify_directsign_auth_session",
      [ids.user, ids.oldSession],
      ["uuid", "uuid"],
    );
    assert.equal(verified.result.active, false);
    assert.equal(verified.result.reason, "before_cutoff");

    await db.query(
      `insert into auth.sessions(id,user_id,created_at) values($1,$2,now() + interval '1 second')`,
      [ids.newSession, ids.user],
    );
    verified = await rpc(
      db,
      "verify_directsign_auth_session",
      [ids.user, ids.newSession],
      ["uuid", "uuid"],
    );
    assert.equal(verified.result.active, true);

    const retry = await rpc(
      db,
      "finish_directsign_password_reset",
      [ids.user, ids.reset, ids.recoverySession],
      ["uuid", "uuid", "uuid"],
    );
    assert.equal(retry.result.outcome, "completed");
  } finally {
    await db.close();
  }
});

test("199 migration denies non-service callers and closes the admin registration race", async () => {
  const db = await setup();
  try {
    const publicExecute = await db.query(
      `select
        has_function_privilege('anon','public.verify_directsign_auth_session(uuid,uuid)','execute') as anon_ok,
        has_function_privilege('authenticated','public.begin_directsign_password_reset(uuid,uuid,uuid)','execute') as authenticated_ok`,
    );
    const privileges = publicExecute.rows[0] as Row;
    assert.equal(privileges.anon_ok, false);
    assert.equal(privileges.authenticated_ok, false);

    await rpc(
      db,
      "begin_directsign_password_reset",
      [ids.user, ids.reset, ids.recoverySession],
      ["uuid", "uuid", "uuid"],
    );
    const registration = await rpc(
      db,
      "register_directsign_admin_operator_session",
      [
        ids.user,
        ids.user,
        ids.recoverySession,
        new Date().toISOString(),
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ],
      ["uuid", "uuid", "uuid", "timestamptz", "timestamptz"],
    );
    assert.equal(registration.result.outcome, "session_blocked");

    const retained = await rpc(
      db,
      "mark_directsign_password_reset_uncertain",
      [ids.user, ids.reset, ids.recoverySession],
      ["uuid", "uuid", "uuid"],
    );
    assert.equal(retained.result.outcome, "retained");
    const state = (
      await db.query(
        `select reset_in_progress,password_update_uncertain from public.account_security_epochs where user_id=$1`,
        [ids.user],
      )
    ).rows[0] as Row;
    assert.equal(state.reset_in_progress, true);
    assert.equal(state.password_update_uncertain, true);
  } finally {
    await db.close();
  }
});
