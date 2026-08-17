import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const migration = readSource(
  "../supabase/migrations/20260808120000_enforce_privacy_retention_and_erasure.sql",
);
const applicationContactMigration = readSource(
  "../supabase/migrations/20260808130000_add_campaign_application_contacts.sql",
);
const remoteAppliedCorrectiveMigration = readSource(
  "../supabase/migrations/20260808140000_finalize_privacy_retention_guarantees.sql",
);
const correctiveMigration = readSource(
  "../supabase/migrations/20260808150000_finalize_privacy_retention_guarantees.sql",
);
const server = readSource("../server/index.ts");
const privacyPage = readSource("../src/pages/legal/LegalDocumentPage.tsx");
const signupPage = readSource("../src/pages/auth/SignupPage.tsx");
const campaignPage = readSource("../src/pages/marketplace/CampaignPages.tsx");
const advertiserDashboard = readSource("../src/pages/marketing/Dashboard.tsx");
const contractBuilder = readSource("../src/pages/marketing/ContractBuilder.tsx");

const applyPrivacySchemaThroughFinalGuaranteesMigration = async (db: PGlite) => {
  await db.exec(String.raw`
    create role anon;
    create role authenticated;
    create role service_role;
    create role authenticator;
    create schema auth;
    create schema storage;
    create schema extensions;
    create schema vault;
    create schema supabase_functions;
    create table auth.users (
      id uuid primary key,
      email text,
      encrypted_password text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      raw_app_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      last_sign_in_at timestamptz,
      email_confirmed_at timestamptz,
      confirmation_sent_at timestamptz,
      banned_until timestamptz,
      deleted_at timestamptz
    );
    create function auth.uid() returns uuid
      language sql stable as $$ select null::uuid $$;
    create function auth.role() returns text
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.role', true), '')
      $$;
    create function auth.jwt() returns jsonb
      language sql stable as $$ select '{}'::jsonb $$;
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      owner uuid,
      metadata jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table storage.buckets (
      id text primary key,
      name text,
      public boolean default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create function storage.foldername(text) returns text[]
      language sql immutable as $$ select string_to_array($1, '/') $$;
    create function supabase_functions.http_request() returns trigger
      language plpgsql as $$ begin return new; end $$;
  `);

  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const migrationFiles = readdirSync(migrationDirectory)
    .filter(
      (file) =>
        file.endsWith(".sql") &&
        file <= "20260808150000_finalize_privacy_retention_guarantees.sql",
    )
    .sort();

  for (const file of migrationFiles) {
    let sql = readFileSync(new URL(file, migrationDirectory), "utf8")
      .replace(/^\s*create extension[^;]+;\s*$/gim, "")
      .replace(/^\s*alter publication[^;]+;\s*$/gim, "")
      .replace(
        /create\s+(?:unique\s+)?index\s+[^;]*gin_trgm_ops[^;]*;/gi,
        "",
      );
    if (file.startsWith("20260807180000")) {
      sql = sql.replace(
        /-- One approved production account[\s\S]*?end;\s*\$\$;/,
        "",
      );
    }
    await db.exec(sql);
  }
  await db.exec(`set "request.jwt.claim.role" = 'service_role'`);
};

const sha256 = (source: string) =>
  createHash("sha256").update(source).digest("hex").toUpperCase();

test("remote-applied privacy migration history remains byte exact", () => {
  assert.equal(
    sha256(migration),
    "BE775A5DAA28FF15226FD9DF1CCD29D459FD74D5596EC45CDAD723C52D314E5E",
  );
  assert.equal(
    sha256(applicationContactMigration),
    "5FCD289B330CD7FEA56E98ACFAFDAE13E569FEDDFC19F130A78EA655D80CEFED",
  );
  assert.equal(
    sha256(remoteAppliedCorrectiveMigration),
    "DEBDEDFBD59BA155D80FB73776BFD99FFEC9B666E4CEE24D95DAAEB564A21331",
  );
});

test("published retention periods are backed by exact database intervals", () => {
  assert.match(migration, /interval '5 years'/);
  assert.match(migration, /interval '3 years'/);
  assert.match(migration, /interval '1 year'/);
  assert.match(migration, /create or replace function public\.run_privacy_retention/);
  assert.match(migration, /p_dry_run boolean default false/);
  assert.match(migration, /p_limit integer/);
  assert.match(migration, /directsign_privacy_hold_active/);

  assert.match(
    privacyPage,
    /종료·취소·마지막 처리 시각 중 가장 늦은 시각부터 5년간/,
  );
  assert.match(
    privacyPage,
    /승인 또는 반려로 최종 처리된 마지막 시각부터 3년간/,
  );
  assert.match(privacyPage, /실제 마지막 처리 시각부터 3년간/);
  assert.match(privacyPage, /접속 로그[\s\S]*최대 1년간/);
  assert.match(privacyPage, /다음 자동 파기 작업에서 다시 평가/);
});

test("corrective retention migration is atomic, hold-aware and service-only", () => {
  assert.match(correctiveMigration, /^--[\s\S]*?\nbegin;/);
  assert.match(correctiveMigration, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/);
  assert.equal(
    correctiveMigration.match(
      /create or replace function directsign_private\.directsign_storage_queue_matches_hold/g,
    )?.length,
    1,
  );
  assert.match(correctiveMigration, /'campaign',[\s\S]*?'campaign_application'/);
  assert.match(
    correctiveMigration,
    /create table if not exists public\.privacy_held_marketplace_proposals/,
  );
  assert.match(
    correctiveMigration,
    /marketplace_contact_proposals_legal_hold_delete_guard/,
  );
  assert.match(
    correctiveMigration,
    /directsign_cleanup_due_held_marketplace_proposals/,
  );
  assert.match(
    correctiveMigration,
    /create or replace function public\.authorize_privacy_storage_deletion/,
  );
  assert.match(correctiveMigration, /authorization_expires_at <= authorized_at \+ interval '30 seconds'/);
  assert.match(correctiveMigration, /v_now timestamptz := pg_catalog\.clock_timestamp\(\)/);
  assert.match(correctiveMigration, /'accepted', false/);
  assert.match(
    correctiveMigration,
    /v_hold_active := directsign_private\.directsign_storage_deletion_held\([\s\S]*?if v_hold_active then[\s\S]*?'accepted', false[\s\S]*?'reason', 'legal_hold_active'/,
  );
  assert.match(correctiveMigration, /revoke insert, update, delete on table public\.privacy_storage_deletion_queue/);
  assert.match(correctiveMigration, /from public, anon, authenticated;/);
});

test("retention backlog is flat, actionable and includes campaign contact expiry", () => {
  for (const key of [
    "due_contracts",
    "due_legacy_contracts",
    "due_verifications",
    "due_support",
    "due_security",
    "due_org_cleanup",
    "due_application_contacts",
    "pending_storage",
    "failed_storage",
    "ready_auth",
    "total_due",
    "has_backlog",
  ]) {
    assert.match(correctiveMigration, new RegExp(`'${key}'`));
  }
  assert.match(correctiveMigration, /queue\.available_at <= v_now/);
  assert.match(correctiveMigration, /queue\.lease_expires_at <= v_now/);
  assert.match(correctiveMigration, /request\.next_attempt_at is null or request\.next_attempt_at <= v_now/);
  assert.match(correctiveMigration, /v_backlog := public\.get_privacy_retention_backlog\(v_now\)/);
});

test("retention idempotency rejects semantic drift and safely retries failed leases", async () => {
  const db = new PGlite();
  try {
    await applyPrivacySchemaThroughFinalGuaranteesMigration(db);

    // The final guarantees must also be safe over a database that already has
    // the intended definitions, because production received an earlier 140
    // snapshot while this corrective state was still being assembled.
    await db.exec(correctiveMigration);

    const first = await db.query<{
      result: { status: string; idempotent_replay: boolean };
    }>(
      "select public.run_privacy_retention(clock_timestamp(), 10, true, 'pglite:exact') as result",
    );
    assert.equal(first.rows[0]?.result.status, "completed");
    assert.equal(first.rows[0]?.result.idempotent_replay, false);

    const replay = await db.query<{
      result: { status: string; idempotent_replay: boolean };
    }>(
      "select public.run_privacy_retention(clock_timestamp(), 10, true, 'pglite:exact') as result",
    );
    assert.equal(replay.rows[0]?.result.status, "completed");
    assert.equal(replay.rows[0]?.result.idempotent_replay, true);

    await assert.rejects(
      db.query(
        "select public.run_privacy_retention(clock_timestamp(), 10, false, 'pglite:exact')",
      ),
      /privacy retention idempotency semantics mismatch/,
    );

    await db.exec(String.raw`
      insert into public.privacy_retention_runs (
        id, idempotency_key, run_kind, dry_run, status, counters,
        error_code, started_at, completed_at, created_at,
        requested_limit, attempt_count
      ) values (
        '11111111-1111-4111-8111-111111111111',
        'pglite:failed', 'manual', true, 'failed', '{}'::jsonb,
        'retention_run_failed', clock_timestamp(), clock_timestamp(),
        clock_timestamp(), 10, 1
      );
    `);
    const retry = await db.query<{
      result: { status: string; idempotent_replay: boolean };
    }>(
      "select public.run_privacy_retention(clock_timestamp(), 10, true, 'pglite:failed') as result",
    );
    assert.equal(retry.rows[0]?.result.status, "completed");
    assert.equal(retry.rows[0]?.result.idempotent_replay, false);
    const retriedRow = await db.query<{ attempt_count: number }>(
      "select attempt_count from public.privacy_retention_runs where idempotency_key = 'pglite:failed'",
    );
    assert.equal(retriedRow.rows[0]?.attempt_count, 2);

    await db.exec(String.raw`
      insert into public.privacy_retention_runs (
        id, idempotency_key, run_kind, dry_run, status, counters,
        started_at, created_at, requested_limit, attempt_count,
        lease_token, lease_expires_at
      ) values (
        '22222222-2222-4222-8222-222222222222',
        'pglite:running', 'manual', true, 'running', '{}'::jsonb,
        clock_timestamp(), clock_timestamp(), 10, 1,
        '33333333-3333-4333-8333-333333333333',
        clock_timestamp() + interval '5 minutes'
      );
    `);
    await assert.rejects(
      db.query(
        "select public.run_privacy_retention(clock_timestamp(), 10, true, 'pglite:running')",
      ),
      /privacy retention idempotency key is running/,
    );
  } finally {
    await db.close();
  }
});

test("held proposal evidence is quarantined while the live application row is erased", async () => {
  const db = new PGlite();
  const proposalId = "44444444-4444-4444-8444-444444444444";
  const holdId = "55555555-5555-4555-8555-555555555555";
  try {
    await applyPrivacySchemaThroughFinalGuaranteesMigration(db);

    const acl = await db.query<{
      anon_authorize: boolean;
      authenticated_backlog: boolean;
      service_queue_update: boolean;
      service_erasure_update: boolean;
      service_run_update: boolean;
      service_quarantine_select: boolean;
    }>(String.raw`
      select
        has_function_privilege(
          'anon',
          'public.authorize_privacy_storage_deletion(uuid,text,timestamptz)',
          'EXECUTE'
        ) as anon_authorize,
        has_function_privilege(
          'authenticated',
          'public.get_privacy_retention_backlog(timestamptz)',
          'EXECUTE'
        ) as authenticated_backlog,
        has_table_privilege(
          'service_role', 'public.privacy_storage_deletion_queue', 'UPDATE'
        ) as service_queue_update,
        has_table_privilege(
          'service_role', 'public.privacy_erasure_requests', 'UPDATE'
        ) as service_erasure_update,
        has_table_privilege(
          'service_role', 'public.privacy_retention_runs', 'UPDATE'
        ) as service_run_update,
        has_table_privilege(
          'service_role', 'public.privacy_held_marketplace_proposals', 'SELECT'
        ) as service_quarantine_select
    `);
    assert.deepEqual(acl.rows[0], {
      anon_authorize: false,
      authenticated_backlog: false,
      service_queue_update: false,
      service_erasure_update: false,
      service_run_update: false,
      service_quarantine_select: false,
    });

    await db.query(
      `insert into public.marketplace_contact_proposals (
        id, direction, target_handle, target_display_name, sender_name,
        sender_intro, proposal_type, proposal_summary, status
      ) values (
        $1, 'advertiser_to_influencer', '@held-target', 'Held target',
        'Held sender', 'Private held introduction', 'sponsored_post',
        'Private held proposal summary', 'submitted'
      )`,
      [proposalId],
    );
    await db.query(
      `select public.create_privacy_legal_hold(
        $1, 'campaign_application', $2, 'litigation', null,
        clock_timestamp() - interval '1 second', null, null
      )`,
      [holdId, proposalId],
    );

    await db.query(
      "delete from public.marketplace_contact_proposals where id = $1",
      [proposalId],
    );

    const live = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.marketplace_contact_proposals where id = $1",
      [proposalId],
    );
    assert.equal(live.rows[0]?.count, 0);

    const quarantined = await db.query<{
      sender_name: string;
      held: boolean;
    }>(
      `select
        evidence_snapshot ->> 'sender_name' as sender_name,
        directsign_private.directsign_campaign_application_retention_held(
          proposal_id, clock_timestamp()
        ) as held
      from public.privacy_held_marketplace_proposals
      where proposal_id = $1`,
      [proposalId],
    );
    assert.equal(quarantined.rows[0]?.sender_name, "Held sender");
    assert.equal(quarantined.rows[0]?.held, true);

    await db.query(
      "select public.release_privacy_legal_hold($1, null, clock_timestamp())",
      [holdId],
    );
    const cleanup = await db.query<{ result: { deleted: number } }>(
      `select directsign_private.directsign_cleanup_due_held_marketplace_proposals(
        clock_timestamp(), 10, false
      ) as result`,
    );
    assert.equal(cleanup.rows[0]?.result.deleted, 1);

    const remaining = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.privacy_held_marketplace_proposals where proposal_id = $1",
      [proposalId],
    );
    assert.equal(remaining.rows[0]?.count, 0);
  } finally {
    await db.close();
  }
});

test("campaign contact purpose literal is identical in server and both SQL validators", () => {
  const purpose = "캠페인 지원자 확인, 선정 및 진행 안내";
  assert.ok(server.includes(`"${purpose}"`));
  assert.ok(applicationContactMigration.includes(`'${purpose}'`));
  assert.ok(correctiveMigration.includes(`'${purpose}'`));
  assert.doesNotMatch(correctiveMigration, /�|罹|媛|吏/);
});

test("calendar retention boundaries exclude one day or one second early and include exact expiry", async () => {
  const db = new PGlite();
  try {
    const result = await db.query<{ boundary: string; due: boolean }>(String.raw`
      select boundary, due
      from (
        values
          ('5y_day_early', timestamptz '2021-08-09 00:00:00+00'
            + interval '5 years' <= timestamptz '2026-08-08 00:00:00+00'),
          ('5y_second_early', timestamptz '2021-08-08 00:00:01+00'
            + interval '5 years' <= timestamptz '2026-08-08 00:00:00+00'),
          ('5y_exact', timestamptz '2021-08-08 00:00:00+00'
            + interval '5 years' <= timestamptz '2026-08-08 00:00:00+00'),
          ('3y_day_early', timestamptz '2023-08-09 00:00:00+00'
            + interval '3 years' <= timestamptz '2026-08-08 00:00:00+00'),
          ('3y_second_early', timestamptz '2023-08-08 00:00:01+00'
            + interval '3 years' <= timestamptz '2026-08-08 00:00:00+00'),
          ('3y_exact', timestamptz '2023-08-08 00:00:00+00'
            + interval '3 years' <= timestamptz '2026-08-08 00:00:00+00'),
          ('1y_day_early', timestamptz '2025-08-09 00:00:00+00'
            + interval '1 year' <= timestamptz '2026-08-08 00:00:00+00'),
          ('1y_second_early', timestamptz '2025-08-08 00:00:01+00'
            + interval '1 year' <= timestamptz '2026-08-08 00:00:00+00'),
          ('1y_exact', timestamptz '2025-08-08 00:00:00+00'
            + interval '1 year' <= timestamptz '2026-08-08 00:00:00+00')
      ) as boundaries(boundary, due)
      order by boundary
    `);

    assert.deepEqual(
      Object.fromEntries(result.rows.map((row) => [row.boundary, row.due])),
      {
        "1y_day_early": false,
        "1y_exact": true,
        "1y_second_early": false,
        "3y_day_early": false,
        "3y_exact": true,
        "3y_second_early": false,
        "5y_day_early": false,
        "5y_exact": true,
        "5y_second_early": false,
      },
    );
  } finally {
    await db.close();
  }

  assert.match(migration, /\+ interval '5 years' <= v_now/);
  assert.match(migration, /\+ interval '3 years' <= v_now/);
  assert.match(migration, /\+ interval '1 year' <= v_now/);
});

test("storage erasure is a service-only two-phase queue", () => {
  assert.match(migration, /create table if not exists public\.privacy_storage_deletion_queue/);
  assert.match(migration, /create or replace function public\.claim_privacy_storage_deletions/);
  assert.match(migration, /create or replace function public\.complete_privacy_storage_deletion/);
  assert.match(migration, /for update of queue skip locked/);
  assert.match(migration, /status = 'completed'/);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
  assert.match(
    migration,
    /revoke all on table[\s\S]*?privacy_storage_deletion_queue[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(server, /deleteQueuedSupabaseStorageObject/);
  assert.match(server, /Privacy storage deletion target is outside the allowlist/);
  assert.match(server, /complete_privacy_storage_deletion/);
  assert.match(server, /Math\.min\(16, Math\.floor\(limit\)\)/);
  assert.match(server, /completion\?\.found !== true/);
  assert.match(server, /completion\.accepted !== true/);
  assert.match(server, /authorize_privacy_storage_deletion/);
  assert.match(server, /runPrivacyStorageDeletionDrain/);
});

test("account erasure is idempotent, recently authenticated and blocks resurrection", () => {
  const routeStart = server.indexOf('app.delete("/api/account"');
  const routeEnd = server.indexOf('app.post("/api/advertiser/login"', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.match(route, /setPrivateAuthResponseHeaders\(response\)/);
  assert.match(route, /confirmation !== "탈퇴"/);
  assert.match(route, /request\.header\("idempotency-key"\)/);
  assert.match(route, /action: "account_delete"/);
  assert.match(route, /request_account_erasure/);
  assert.match(route, /revokeSupabaseSessionsGlobally/);
  assert.match(route, /hardDeleteSupabaseAuthUser/);
  assert.match(route, /finalizePrivacyAccountErasure/);
  assert.ok(
    route.indexOf("revokeSupabaseSessionsGlobally") <
      route.indexOf("runPrivacyStorageDeletionDrain"),
    "global session revocation must run before deferred storage cleanup",
  );
  assert.match(server, /isPrivacyAccountErasureBlockingAccess/);
  assert.match(
    server,
    /return Boolean\(erasure && erasure\.status !== "cancelled"\)/,
  );
  assert.equal(
    server.match(/await rejectPrivacyErasedBrowserSession\(\{/g)?.length,
    6,
    "both roles must check erasure tombstones for cached, access-token and refreshed sessions",
  );

  assert.match(migration, /create or replace function public\.request_account_erasure/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /subject_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /create or replace function public\.finalize_account_erasure/);
  assert.match(migration, /status = 'ready_to_finalize'/);
  assert.match(migration, /select 1 from auth\.users/);
});

test("append-only evidence stays protected outside the bounded purge function", () => {
  assert.match(
    migration,
    /current_setting\('directsign\.privacy_retention_purge', true\) = 'on'/,
  );
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) = 'service_role'/);
  assert.match(migration, /raise exception 'contract_events is append-only'/);
  assert.match(migration, /raise exception 'support_access_events is append-only'/);
  assert.match(
    migration,
    /drop constraint if exists support_access_events_actor_profile_fk/,
  );
  assert.match(
    migration,
    /drop constraint if exists support_access_requests_requester_profile_id_fkey/,
  );
});

test("privacy notice version and verified backup window are explicit", () => {
  const runbook = readSource("../docs/privacy-retention-runbook.md");

  assert.match(server, /const signupPrivacyPolicyVersion = "2026-08-13\.1"/);
  assert.match(
    signupPage,
    /const PRIVACY_POLICY_DOCUMENT_VERSION = "2026-08-13\.1"/,
  );
  assert.match(privacyPage, /documentVersion: "2026-08-13\.1"/);
  assert.match(runbook, /네이버 블로그 캠페인 지원 조건 확인값[\s\S]+30일/);
  assert.match(runbook, /네이버 인플루언서 자동 확인·본인 확인 재사용 기록[\s\S]+1년/);
  assert.match(privacyPage, /본인 확인 재사용 기록[\s\S]+최대 1년간/);
  assert.match(privacyPage, /데이터베이스 백업은 현재 운영 설정에서 최대 7일/);
  assert.match(privacyPage, /비공개 파일은 데이터베이스 백업에 포함되지 않으며/);
  assert.match(runbook, /최근 7개 일일 물리 백업/);
  assert.match(runbook, /복원된 profile UUID를 서버의 동일 HMAC 규칙으로 해시/);
});

test("the hourly retention route is private, bounded and cron-authenticated", () => {
  assert.match(
    server,
    /app\.get\("\/api\/cron\/privacy-retention"[\s\S]*?Cache-Control", "private, no-store"[\s\S]*?requireCronRequest[\s\S]*?runPrivacyRetentionSweep/,
  );
  const vercel = readSource("../vercel.json");
  assert.match(vercel, /"path": "\/api\/cron\/privacy-retention"/);
  assert.match(vercel, /"schedule": "30 \* \* \* \*"/);
  assert.match(vercel, /"maxDuration": 300/);
  assert.match(server, /get_privacy_retention_backlog/);
  assert.match(server, /enqueuePrivacyRetentionBacklogAlert/);
  assert.match(server, /enqueuePrivacyRetentionFailureAlert/);
  assert.match(server, /runKey = `vercel:\$\{now\.slice\(0, 13\)\}`/);
});

test("campaign contact collection is opt-in, versioned and separate from custom consents", () => {
  assert.match(
    campaignPage,
    /applicationContactFields: CampaignApplicationContactField\[\]/,
  );
  assert.match(campaignPage, /applicationContactFields: \[\]/);
  assert.match(campaignPage, /지원자 연락처 수집/);
  assert.match(campaignPage, /기본값은 미수집/);
  assert.match(campaignPage, /개인정보 수집·이용 및 광고주 제공\(필수\)/);
  assert.match(campaignPage, /applicationContactConsentAccepted/);
  assert.match(campaignPage, /requiredConsents: form\.requiredConsents/);
  assert.match(server, /validateCampaignApplicationContact\(body, campaign\)/);
  assert.match(server, /campaign_application_contact_version_mismatch/);
  assert.match(server, /application_contact_snapshot:/);
  assert.match(server, /recipient_organization_id: targetBrandRow\.organization_id/);
  assert.match(
    server,
    /\/api\/marketplace\/campaigns\/:campaignId\/applications[\s\S]*?Cache-Control", "private, no-store"/,
  );
  assert.match(advertiserDashboard, /thread\.applicationContact\?\.phone/);
  assert.match(advertiserDashboard, /thread\.applicationContact\?\.email/);
  assert.match(contractBuilder, /<Label>이메일<\/Label>/);
  assert.match(contractBuilder, /<Label>휴대전화<\/Label>/);
});

test("campaign contact evidence is immutable, private and redacted after 90 days", async () => {
  assert.match(
    applicationContactMigration,
    /add column if not exists application_contact_snapshot jsonb/,
  );
  assert.match(
    applicationContactMigration,
    /campaign application contact snapshot is immutable/,
  );
  assert.match(
    applicationContactMigration,
    /old\.application_contact_snapshot is not null[\s\S]*?new\.application_contact_snapshot is null[\s\S]*?service_role/,
  );
  assert.match(
    applicationContactMigration,
    /create or replace function public\.redact_expired_campaign_application_contacts/,
  );
  assert.match(applicationContactMigration, /interval '90 days'/);
  assert.match(
    applicationContactMigration,
    /revoke execute on function public\.redact_expired_campaign_application_contacts[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(server, /campaign application contact retention/);
  assert.match(server, /const isValidIsoCalendarDate/);
  assert.match(server, /deadline > uploadDeadline/);
  assert.doesNotMatch(server, /calendar\.app\.created/);
  const analytics = readSource("../src/domain/analytics.ts");
  assert.match(
    analytics,
    /export const isMicrosoftClarityCollectionEnabled = \(\) => true/,
  );
  assert.match(privacyPage, /캠페인 종료 또는 콘텐츠 제출 마감 후 90일까지/);
  assert.match(privacyPage, /공개 캠페인·일반 프로필·메시지·알림에는 표시하지 않습니다/);

  const db = new PGlite();
  try {
    const result = await db.query<{ boundary: string; due: boolean }>(String.raw`
      select boundary, due
      from (
        values
          ('second_early', timestamptz '2026-08-15 00:00:01+00'
            + interval '90 days' <= timestamptz '2026-11-13 00:00:00+00'),
          ('exact', timestamptz '2026-08-15 00:00:00+00'
            + interval '90 days' <= timestamptz '2026-11-13 00:00:00+00')
      ) as boundaries(boundary, due)
      order by boundary
    `);
    assert.deepEqual(
      Object.fromEntries(result.rows.map((row) => [row.boundary, row.due])),
      { exact: true, second_early: false },
    );
  } finally {
    await db.close();
  }
});

test("account erasure RPC waits for issued upload capability cleanup before Auth finalization", async () => {
  const db = new PGlite();
  const profileId = "f1000000-0000-4000-8000-000000000001";
  const requestId = "f2000000-0000-4000-8000-000000000001";
  const ticketId = "f3000000-0000-4000-8000-000000000001";
  const workerId = "qa.private-upload-erasure";
  try {
    await applyPrivacySchemaThroughFinalGuaranteesMigration(db);
    for (const file of [
      "20260811191000_reserve_deliverable_upload_quota.sql",
      "20260811194000_atomic_deliverable_mutations.sql",
      "20260811202000_private_file_upload_tickets.sql",
    ]) {
      await db.exec(readSource(`../supabase/migrations/${file}`));
    }
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);
    await db.query(
      `insert into auth.users(id,email,raw_user_meta_data)
       values($1,'erasure-ticket@qa.invalid',$2::jsonb)`,
      [profileId, JSON.stringify({ role: "influencer", name: "Erasure QA" })],
    );
    await db.query(
      `insert into public.profiles(id,role,name,email,data_origin)
       values($1,'influencer','Erasure QA','erasure-ticket@qa.invalid','production')
       on conflict(id) do update set role='influencer', name='Erasure QA',
         email='erasure-ticket@qa.invalid', data_origin='production'`,
      [profileId],
    );

    const issued = await db.query<{
      outcome: string;
      cleanup_not_before: string;
    }>(
      `select outcome,cleanup_not_before
       from public.issue_directsign_private_file_upload_ticket(
         $1::uuid,'influencer_verification',$2::uuid,$1::uuid,
         null,null,'image/png',8,$3,null,20,104857600,104857600
       )`,
      [ticketId, profileId, "a".repeat(64)],
    );
    assert.equal(issued.rows[0]?.outcome, "issued");

    const requested = await db.query<{
      result: { status: string; pending_storage: number };
    }>(
      `select public.request_account_erasure(
        $1::uuid,$2::uuid,'influencer',$3,clock_timestamp()
      ) as result`,
      [requestId, profileId, "b".repeat(64)],
    );
    assert.equal(requested.rows[0]?.result.status, "waiting_storage");
    assert.equal(requested.rows[0]?.result.pending_storage, 1);

    const gated = await db.query<{
      result: { status: string; pending_storage: number };
    }>(
      "select public.finalize_account_erasure($1::uuid,clock_timestamp()) as result",
      [requestId],
    );
    assert.equal(gated.rows[0]?.result.status, "waiting_storage");
    assert.equal(gated.rows[0]?.result.pending_storage, 1);

    const state = await db.query<{
      state: string;
      exact_due: boolean;
      capability_window_elapsed_by_cleanup: boolean;
    }>(
      `select ticket.state,
              queue.due_at=ticket.cleanup_not_before as exact_due,
              ticket.cleanup_not_before >= ticket.issued_at + interval '27 hours'
                as capability_window_elapsed_by_cleanup
       from public.directsign_private_file_upload_tickets as ticket
       join public.privacy_storage_deletion_queue as queue
         on queue.erasure_request_id=ticket.erasure_request_id
        and queue.bucket=ticket.bucket
        and queue.object_path=ticket.object_path
       where ticket.id=$1`,
      [ticketId],
    );
    assert.deepEqual(state.rows[0], {
      state: "cleanup_pending",
      exact_due: true,
      capability_window_elapsed_by_cleanup: true,
    });

    const blockedFinalize = await db.query<{ outcome: string }>(
      `select outcome from public.insert_directsign_verification_request_from_ticket(
        $1::uuid,$2::uuid,'influencer_verification',$3::jsonb
      )`,
      [
        ticketId,
        profileId,
        JSON.stringify({
          id: ticketId,
          target_type: "influencer_account",
          target_id: profileId,
          verification_type: "platform_account",
          status: "pending",
          profile_id: profileId,
          subject_name: "Erasure QA",
          evidence_file_name: "evidence.png",
          evidence_file_mime: "image/png",
          evidence_file_size: 8,
          evidence_snapshot_json: {
            evidence_file: {
              provider: "supabase_storage",
              bucket: "directsign-private",
              path: `verification-influencer/${profileId}/${ticketId}-evidence.png`,
              content_type: "image/png",
              byte_size: 8,
              sha256: "a".repeat(64),
            },
          },
        }),
      ],
    );
    assert.equal(blockedFinalize.rows[0]?.outcome, "upload_ticket_expired");

    await db.query(
      `update public.directsign_private_file_upload_tickets
       set issued_at=clock_timestamp()-interval '30 hours',
           finalize_expires_at=clock_timestamp()-interval '29 hours',
           cleanup_not_before=clock_timestamp()-interval '1 hour'
       where id=$1`,
      [ticketId],
    );
    await db.query(
      `update public.privacy_storage_deletion_queue
       set due_at=clock_timestamp()-interval '1 second',
           available_at=clock_timestamp()-interval '1 second'
       where erasure_request_id=$1`,
      [requestId],
    );
    const competingPrivateCleanup = await db.query(
      `select * from public.claim_directsign_private_upload_cleanup(
        'f4000000-0000-4000-8000-000000000001'::uuid,10,300
      )`,
    );
    assert.equal(competingPrivateCleanup.rows.length, 0);
    const claimed = await db.query<{ id: string }>(
      `select id from public.claim_privacy_storage_deletions(
        $1,10,$2::uuid,clock_timestamp(),120
      )`,
      [workerId, requestId],
    );
    assert.equal(claimed.rows.length, 1);
    const queueId = claimed.rows[0]?.id;
    const authorized = await db.query<{
      result: { authorized: boolean };
    }>(
      `select public.authorize_privacy_storage_deletion(
        $1::uuid,$2,clock_timestamp()
      ) as result`,
      [queueId, workerId],
    );
    assert.equal(authorized.rows[0]?.result.authorized, true);
    const completed = await db.query<{
      result: { accepted: boolean; request_ready_to_finalize: boolean };
    }>(
      `select public.complete_privacy_storage_deletion(
        $1::uuid,$2,true,null,clock_timestamp()
      ) as result`,
      [queueId, workerId],
    );
    assert.equal(completed.rows[0]?.result.accepted, true);
    assert.equal(completed.rows[0]?.result.request_ready_to_finalize, true);

    const authGate = await db.query<{
      result: { status: string; requires_auth_user_deletion: boolean };
    }>(
      "select public.finalize_account_erasure($1::uuid,clock_timestamp()) as result",
      [requestId],
    );
    assert.equal(authGate.rows[0]?.result.status, "ready_to_finalize");
    assert.equal(authGate.rows[0]?.result.requires_auth_user_deletion, true);
    await db.query("delete from auth.users where id=$1", [profileId]);
    const final = await db.query<{
      result: { status: string; requires_auth_user_deletion: boolean };
    }>(
      "select public.finalize_account_erasure($1::uuid,clock_timestamp()) as result",
      [requestId],
    );
    assert.equal(final.rows[0]?.result.status, "completed");
    assert.equal(final.rows[0]?.result.requires_auth_user_deletion, false);
    const postFinalize = await db.query<{
      ticket_count: number;
      audit_queue_count: number;
    }>(
      `select
         (select count(*)::integer
          from public.directsign_private_file_upload_tickets
          where erasure_request_id=$1) as ticket_count,
         (select count(*)::integer
          from public.privacy_storage_deletion_queue
          where erasure_request_id=$1 and status='completed') as audit_queue_count`,
      [requestId],
    );
    assert.deepEqual(postFinalize.rows[0], {
      ticket_count: 0,
      audit_queue_count: 1,
    });
  } finally {
    await db.close();
  }
});
