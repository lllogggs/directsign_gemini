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
const remoteAppliedCampaignMetricsMigration = readSource(
  "../supabase/migrations/20260808160000_add_campaign_application_metrics_and_atomic_edit.sql",
);
const platformVerificationMinimizationMigration = readSource(
  "../supabase/migrations/20260808170000_minimize_platform_verification_provider_evidence.sql",
);
const server = readSource("../server/index.ts");
const privacyPage = readSource("../src/pages/legal/LegalDocumentPage.tsx");
const signupPage = readSource("../src/pages/auth/SignupPage.tsx");
const campaignPage = readSource("../src/pages/marketplace/CampaignPages.tsx");
const advertiserDashboard = readSource("../src/pages/marketing/Dashboard.tsx");
const contractBuilder = readSource("../src/pages/marketing/ContractBuilder.tsx");

const applyPrivacySchemaThroughFinalGuaranteesMigration = async (
  db: PGlite,
  throughMigration =
    "20260808170000_minimize_platform_verification_provider_evidence.sql",
) => {
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
        file <= throughMigration,
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
  createHash("sha256")
    .update(source.replace(/\r\n/g, "\n"))
    .digest("hex")
    .toUpperCase();

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
  assert.equal(
    sha256(remoteAppliedCampaignMetricsMigration),
    "DB07C35D9EF3D7698FEC3857853CE7C2B52C75203532A902C70776ABB34DF016",
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

test("YouTube and NAVER verification retention stores only first-party decisions", async () => {
  assert.match(
    privacyPage,
    /YouTube·NAVER 응답은 소유 여부를 판정하는 동안에만 사용하고 저장하지 않습니다/,
  );
  assert.match(
    privacyPage,
    /YouTube·NAVER 자동인증 응답, 응답 해시와 응답에서 확인한 채널·게시물·통계 정보는 저장하지 않습니다/,
  );

  const sanitizerStart = platformVerificationMinimizationMigration.indexOf(
    "create or replace function directsign_private.directsign_minimize_platform_verification_evidence(\n  p_evidence jsonb,\n  p_request_id uuid",
  );
  const sanitizerEnd = platformVerificationMinimizationMigration.indexOf(
    "revoke all on function directsign_private.directsign_minimize_platform_verification_evidence(",
    sanitizerStart,
  );
  assert.ok(sanitizerStart >= 0 && sanitizerEnd > sanitizerStart);
  const rowBoundSanitizer = platformVerificationMinimizationMigration.slice(
    sanitizerStart,
    sanitizerEnd,
  );
  assert.doesNotMatch(rowBoundSanitizer, /self_reported_channel_metric/);
  assert.match(
    rowBoundSanitizer,
    /p_request_id uuid[\s\S]+?p_platform_handle text[\s\S]+?p_challenge_code text[\s\S]+?p_evidence_file_name text/,
  );
  assert.match(
    rowBoundSanitizer,
    /request_type' = 'public_profile_handle_claim'[\s\S]+?'claim_type', 'platform_handle_conflict'[\s\S]+?'requested_alternate_handle'[\s\S]+?'reason'/,
  );
  assert.match(
    platformVerificationMinimizationMigration,
    /naver_blog_recent_4d_average_visitors is null[\s\S]+?evidence_snapshot_json =[\s\S]+?directsign_private\.directsign_minimize_platform_verification_evidence/,
  );
  assert.match(
    platformVerificationMinimizationMigration,
    /duplicate production YouTube\/NAVER ownership challenge codes must be resolved before migration[\s\S]+?verification_requests_production_platform_challenge_unique/,
  );
  assert.match(
    platformVerificationMinimizationMigration,
    /create table if not exists directsign_private\.verification_legacy_evidence_files/,
  );
  assert.match(
    platformVerificationMinimizationMigration,
    /create table if not exists directsign_private\.verification_evidence_access_events/,
  );
  assert.match(
    platformVerificationMinimizationMigration,
    /delete from public\.marketplace_follower_sync_events[\s\S]+?add constraint marketplace_follower_sync_events_no_minimized_platforms[\s\S]+?check \(platform not in \('youtube', 'naver_blog'\)\) not valid[\s\S]+?validate constraint marketplace_follower_sync_events_no_minimized_platforms/,
  );

  const quotaFunctionStart = platformVerificationMinimizationMigration.indexOf(
    "create or replace function public.reserve_naver_search_verification_request",
  );
  const quotaFunction = platformVerificationMinimizationMigration.slice(
    quotaFunctionStart,
    platformVerificationMinimizationMigration.indexOf(
      "revoke all on function public.reserve_naver_search_verification_request",
      quotaFunctionStart,
    ),
  );
  assert.ok(
    quotaFunction.indexOf("pg_advisory_xact_lock") <
      quotaFunction.indexOf("v_now := clock_timestamp()"),
    "the global transaction lock must be acquired before the KST day is read",
  );
  assert.ok(
    quotaFunction.indexOf("v_now := clock_timestamp()") <
      quotaFunction.indexOf("for update"),
    "the post-lock KST day must be selected before the daily row lock",
  );

  const db = new PGlite();
  try {
    await applyPrivacySchemaThroughFinalGuaranteesMigration(
      db,
      "20260808160000_add_campaign_application_metrics_and_atomic_edit.sql",
    );

    await db.exec(String.raw`
      insert into public.verification_requests (
        id, target_type, target_id, verification_type, status, data_origin,
        subject_name, platform, platform_handle, platform_url,
        ownership_verification_method, ownership_challenge_code,
        ownership_challenge_url, ownership_check_status, ownership_checked_at,
        evidence_file_name, evidence_file_mime, evidence_file_size,
        evidence_snapshot_json, created_at, updated_at
      ) values (
        '90000000-0000-4000-8000-000000000001',
        'influencer_account', 'youtube:submitted-handle', 'platform_account',
        'pending', 'production', 'Submitted creator', 'youtube',
        'submitted-handle', 'https://youtube.com/@submitted-handle',
        'channel_description_code', 'DS-TEST-ONLY',
        'https://youtube.com/@submitted-handle', 'matched',
        '2026-08-08T08:00:00Z', 'legacy-proof.png', 'image/png', 12,
        '{
          "seeded":{"raw_response":"hidden-here"},
          "source":"qa_seed",
          "qa_seed":true,
          "self_reported_channel_metric":{"raw_response":"smuggled"},
          "file_data_url":"data:image/png;base64,iVBORw0KGgo=",
          "evidence_access_audit":[{
            "id":"91000000-0000-4000-8000-000000000001",
            "action":"evidence_downloaded",
            "actor_role":"admin",
            "actor_profile_id":"92000000-0000-4000-8000-000000000001",
            "actor_name":"Historical operator",
            "ip":"127.0.0.1",
            "user_agent":"historical-agent",
            "created_at":"2026-08-08T08:05:00Z"
          }],
          "ownership_verification":{
            "platform_handle":"attacker-handle",
            "platform_url":"https://attacker.invalid",
            "channel_metric":{"value":1234,"source":"youtube_data_api"},
            "automation":{"platform_account":{
              "provider":"provider-sensitive",
              "configured":true,
              "mode":"api_ready",
              "status":"matched",
              "checked_at":"2099-01-01T00:00:00Z",
              "raw_response":{"items":[1]},
              "result_hash":"provider-hash",
              "http_status":200,
              "profile":{"subscriber_count":"1234"}
            }}
          }
        }'::jsonb,
        '2026-08-08T08:00:00Z', '2026-08-08T08:00:00Z'
      ), (
        '90000000-0000-4000-8000-000000000002',
        'influencer_account', 'naver:submitted-blog', 'platform_account',
        'pending', 'production', 'Submitted blogger', 'naver_blog',
        'submitted-blog', 'https://blog.naver.com/submitted-blog',
        'profile_bio_code', 'DS-NAVR-ONLY',
        'https://blog.naver.com/submitted-blog', 'matched',
        '2026-08-08T09:00:00Z', 'proof.webp', 'image/webp', 8,
        '{
          "self_reported_channel_metric":{
            "status":"available",
            "source":"creator_self_report",
            "value":55,
            "provider_response":{"smuggled":true}
          },
          "evidence_file":{
            "provider":"local_file",
            "bucket":"local",
            "path":"verification-evidence/proof.webp",
            "file_name":"proof.webp",
            "content_type":"image/webp",
            "byte_size":8,
            "sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "stored_at":"2026-08-08T09:00:00Z",
            "raw_response":{"smuggled":true}
          },
          "ownership_verification":{
            "automation":{"platform_account":{
              "configured":true,
              "mode":"api_ready",
              "raw_response":{"provider":"secret"}
            }}
          }
        }'::jsonb,
        '2026-08-08T09:00:00Z', '2026-08-08T09:00:00Z'
      ), (
        '90000000-0000-4000-8000-000000000003',
        'influencer_account', 'claim:submitted-handle', 'platform_account',
        'pending', 'production', 'Public handle claim', 'youtube',
        'submitted-handle', 'https://youtube.com/@submitted-handle',
        'screenshot_review', null, null, 'not_run', null,
        null, null, null,
        '{
          "request_type":"public_profile_handle_claim",
          "claim_type":"platform_handle_conflict",
          "claimed_handle":"submitted.handle",
          "claimed_profile_url":"https://provider.invalid/injected",
          "requested_alternate_handle":"submitted_creator",
          "current_owner_profile_id":"93000000-0000-4000-8000-000000000001",
          "current_marketplace_profile_id":"94000000-0000-4000-8000-000000000001",
          "requested_by_profile_id":"95000000-0000-4000-8000-000000000001",
          "submitted_from":"public_profile_settings",
          "reason":"The verified platform handle is mine.",
          "raw_response":{"provider":"must disappear"},
          "ownership_verification":{"automation":{"platform_account":{
            "profile":{"provider":"must disappear"}
          }}}
        }'::jsonb,
        '2026-08-08T10:00:00Z', '2026-08-08T10:00:00Z'
      );

      update public.verification_requests
      set naver_blog_recent_4d_average_visitors = 55
      where id = '90000000-0000-4000-8000-000000000002';

      insert into auth.users (id, email)
      values (
        '98000000-0000-4000-8000-000000000001',
        'naver-retention@example.invalid'
      );
      insert into public.profiles (id, role, name, email, data_origin)
      values (
        '98000000-0000-4000-8000-000000000001',
        'influencer', 'NAVER retention test',
        'naver-retention@example.invalid', 'production'
      );
      insert into public.marketplace_influencer_profiles (
        id, owner_profile_id, data_origin, public_handle, display_name,
        headline, bio
      ) values (
        '98000000-0000-4000-8000-000000000002',
        '98000000-0000-4000-8000-000000000001',
        'production', 'navertest', 'NAVER test', 'NAVER test', 'NAVER test'
      );
      insert into public.marketplace_influencer_channels (
        id, profile_id, platform, label, handle, url,
        follower_count, followers_label, performance_label,
        follower_count_synced_at, follower_sync_status,
        follower_sync_source, follower_sync_error, follower_sync_metadata
      ) values (
        '98000000-0000-4000-8000-000000000003',
        '98000000-0000-4000-8000-000000000002',
        'naver_blog', 'NAVER Blog', 'submitted-blog',
        'https://blog.naver.com/submitted-blog', 55, '일평균 55명',
        '최근 4일 평균 · 자가신고', '2026-08-08T09:00:00Z', 'synced',
        'creator_self_report', 'private naver error', '{
          "provider":"creator_self_report",
          "metric":"average_daily_visitors_4d",
          "trust":"self_reported",
          "period_days":4,
          "account_approved":true,
          "availability":"available",
          "reported_handle":"submitted-blog",
          "checked_at":"2026-08-08T09:00:00Z",
          "request_id":"90000000-0000-4000-8000-000000000002"
        }'::jsonb
      ), (
        '98000000-0000-4000-8000-000000000004',
        '98000000-0000-4000-8000-000000000002',
        'youtube', 'YouTube', 'submitted-channel',
        'https://youtube.com/@submitted-channel', 987654, '987,654명',
        'provider metric', '2026-08-08T09:00:00Z', 'failed',
        'arbitrary_legacy_source', 'private youtube error', '{
          "provider":"unknown_vendor",
          "provenance":"must-not-survive",
          "raw":"private"
        }'::jsonb
      );

      insert into public.marketplace_follower_sync_events (
        id, profile_id, platform, handle, status, provider,
        follower_count, error_message, metadata
      ) values
      (
        '98000000-0000-4000-8000-000000000011',
        '98000000-0000-4000-8000-000000000002',
        'youtube', 'submitted-channel', 'failed', 'unknown_vendor',
        987654, 'private youtube event', '{"raw":"private"}'::jsonb
      ),
      (
        '98000000-0000-4000-8000-000000000012',
        '98000000-0000-4000-8000-000000000002',
        'naver_blog', 'submitted-blog', 'failed', 'unknown_vendor',
        55, 'private naver event', '{"raw":"private"}'::jsonb
      ),
      (
        '98000000-0000-4000-8000-000000000013',
        '98000000-0000-4000-8000-000000000002',
        'instagram', 'surviving-instagram', 'unchanged', 'youtube_data_api',
        10, null, '{}'::jsonb
      );
    `);

    await db.exec(platformVerificationMinimizationMigration);

    // Exercise the exact JSON emitted by the application after the CHECK is
    // active. JavaScript ISO strings use millisecond precision, so both fresh
    // verification requests and first-party handle appeals must remain valid.
    await db.exec(String.raw`
      insert into public.verification_requests (
        id, target_type, target_id, verification_type, status, data_origin,
        profile_id, subject_name, platform, platform_handle, platform_url,
        ownership_verification_method, ownership_challenge_code,
        ownership_challenge_url, ownership_check_status, ownership_checked_at,
        evidence_snapshot_json, reviewed_by_name, reviewed_at,
        created_at, updated_at
      ) values (
        '90000000-0000-4000-8000-000000000011',
        'influencer_account', '98000000-0000-4000-8000-000000000001', 'platform_account',
        'approved', 'production', '98000000-0000-4000-8000-000000000001',
        'Fresh YouTube creator', 'youtube', 'fresh-channel',
        'https://youtube.com/@fresh-channel', 'channel_description_code',
        'DS-YT01-ABCD', 'https://youtube.com/@fresh-channel', 'matched',
        '2026-08-08T11:00:00.123Z',
        '{
          "ownership_verification":{
            "platform":"youtube",
            "platform_handle":"fresh-channel",
            "platform_url":"https://youtube.com/@fresh-channel",
            "method":"channel_description_code",
            "challenge_code":"DS-YT01-ABCD",
            "challenge_url":"https://youtube.com/@fresh-channel",
            "automated_check":{"status":"matched","checked_at":"2026-08-08T11:00:00.123Z"},
            "automation":{
              "platform_account":{
                "provider":"youtube_data_api","mode":"api_ready","status":"matched",
                "checked_at":"2026-08-08T11:00:00.123Z",
                "decision_source":"transient_provider_check",
                "decision_rule_version":"2026-08-08.1",
                "provider_response_retained":false
              },
              "ownership_challenge":{"status":"matched","checked_at":"2026-08-08T11:00:00.123Z"}
            }
          }
        }'::jsonb, '연락미 automation', '2026-08-08T11:00:00.123Z',
        '2026-08-08T11:00:00.456Z', '2026-08-08T11:00:00.456Z'
      ), (
        '90000000-0000-4000-8000-000000000012',
        'influencer_account', '98000000-0000-4000-8000-000000000001', 'platform_account',
        'pending', 'production', '98000000-0000-4000-8000-000000000001',
        'Fresh NAVER creator', 'naver_blog', 'fresh-blog',
        'https://blog.naver.com/fresh-blog', 'profile_bio_code',
        'DS-NV01-EFGH', 'https://blog.naver.com/fresh-blog', 'not_found',
        '2026-08-08T11:01:00.234Z',
        '{
          "ownership_verification":{
            "platform":"naver_blog",
            "platform_handle":"fresh-blog",
            "platform_url":"https://blog.naver.com/fresh-blog",
            "method":"profile_bio_code",
            "challenge_code":"DS-NV01-EFGH",
            "challenge_url":"https://blog.naver.com/fresh-blog",
            "automated_check":{"status":"not_found","checked_at":"2026-08-08T11:01:00.234Z"},
            "automation":{
              "platform_account":{
                "provider":"naver_search_api","mode":"manual_fallback","status":"not_found",
                "checked_at":"2026-08-08T11:01:00.234Z",
                "decision_source":"transient_provider_check",
                "decision_rule_version":"2026-08-08.1",
                "provider_response_retained":false
              },
              "ownership_challenge":{"status":"not_found","checked_at":"2026-08-08T11:01:00.234Z"}
            }
          }
        }'::jsonb, null, null,
        '2026-08-08T11:01:00.567Z', '2026-08-08T11:01:00.567Z'
      ), (
        '90000000-0000-4000-8000-000000000013',
        'influencer_account', '98000000-0000-4000-8000-000000000001', 'platform_account',
        'pending', 'production', '98000000-0000-4000-8000-000000000001',
        'Fresh public handle claim', 'youtube', 'fresh-channel',
        'https://youtube.com/@fresh-channel', 'screenshot_review',
        null, null, 'not_run', null,
        '{
          "request_type":"public_profile_handle_claim",
          "claim_type":"platform_handle_conflict",
          "claimed_handle":"fresh.handle",
          "claimed_profile_url":"https://yeollock.me/fresh.handle",
          "requested_alternate_handle":null,
          "current_owner_profile_id":"93000000-0000-4000-8000-000000000001",
          "current_marketplace_profile_id":"94000000-0000-4000-8000-000000000001",
          "requested_by_profile_id":"98000000-0000-4000-8000-000000000001",
          "submitted_from":"public_profile_settings",
          "platform":"youtube",
          "platform_handle":"fresh-channel",
          "platform_url":"https://youtube.com/@fresh-channel",
          "reason":"This verified platform handle belongs to me.",
          "created_at":"2026-08-08T11:02:00.789Z"
        }'::jsonb, null, null,
        '2026-08-08T11:02:00.789Z', '2026-08-08T11:02:00.789Z'
      );
    `);

    // The migration is intentionally idempotent for controlled recovery and
    // must preserve the same application-format rows on a second pass.
    await db.exec(platformVerificationMinimizationMigration);
    const freshRows = await db.query<{
      id: string;
      status: string;
      ownership_check_status: string;
      ownership_checked_at: string | null;
      reviewed_at: string | null;
      evidence_snapshot_json: Record<string, unknown>;
    }>(String.raw`
      select id, status, ownership_check_status,
        case when ownership_checked_at is null then null else to_char(
          ownership_checked_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) end as ownership_checked_at,
        case when reviewed_at is null then null else to_char(
          reviewed_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) end as reviewed_at,
        evidence_snapshot_json
      from public.verification_requests
      where id in (
        '90000000-0000-4000-8000-000000000011',
        '90000000-0000-4000-8000-000000000012',
        '90000000-0000-4000-8000-000000000013'
      )
      order by id
    `);
    assert.equal(freshRows.rows.length, 3);
    assert.deepEqual(
      {
        status: freshRows.rows[0]?.status,
        ownership_status: freshRows.rows[0]?.ownership_check_status,
        ownership_checked_at: freshRows.rows[0]?.ownership_checked_at,
        reviewed_at: freshRows.rows[0]?.reviewed_at,
      },
      {
        status: "approved",
        ownership_status: "matched",
        ownership_checked_at: "2026-08-08T11:00:00.123Z",
        reviewed_at: "2026-08-08T11:00:00.123Z",
      },
    );
    assert.deepEqual(
      {
        status: freshRows.rows[1]?.status,
        ownership_status: freshRows.rows[1]?.ownership_check_status,
        ownership_checked_at: freshRows.rows[1]?.ownership_checked_at,
        reviewed_at: freshRows.rows[1]?.reviewed_at,
      },
      {
        status: "pending",
        ownership_status: "not_found",
        ownership_checked_at: "2026-08-08T11:01:00.234Z",
        reviewed_at: null,
      },
    );
    assert.equal(
      freshRows.rows[0]?.evidence_snapshot_json.ownership_verification &&
        ((freshRows.rows[0].evidence_snapshot_json.ownership_verification as Record<string, unknown>)
          .automation as Record<string, Record<string, unknown>>)
          .platform_account?.checked_at,
      "2026-08-08T11:00:00.123Z",
    );
    assert.equal(
      freshRows.rows[1]?.evidence_snapshot_json.ownership_verification &&
        ((freshRows.rows[1].evidence_snapshot_json.ownership_verification as Record<string, unknown>)
          .automation as Record<string, Record<string, unknown>>)
          .platform_account?.status,
      "not_found",
    );
    assert.equal(
      freshRows.rows[2]?.evidence_snapshot_json.created_at,
      "2026-08-08T11:02:00.789Z",
    );
    const boundedClaim = await db.query<{ reason_length: number }>(String.raw`
      select length(
        directsign_private.directsign_minimize_platform_verification_evidence(
          jsonb_build_object(
            'request_type', 'public_profile_handle_claim',
            'claim_type', 'platform_handle_conflict',
            'claimed_handle', 'fresh.handle',
            'claimed_profile_url', 'https://yeollock.me/fresh.handle',
            'requested_by_profile_id',
              '98000000-0000-4000-8000-000000000001',
            'platform', 'youtube',
            'platform_handle', 'fresh-channel',
            'platform_url', 'https://youtube.com/@fresh-channel',
            'reason', repeat('가', 4001),
            'created_at', '2026-08-08T11:02:00.789Z'
          ),
          '90000000-0000-4000-8000-000000000013',
          'youtube', 'fresh-channel',
          'https://youtube.com/@fresh-channel',
          '98000000-0000-4000-8000-000000000001',
          'screenshot_review', null, null, 'not_run', null,
          null, null, null, '2026-08-08T11:02:00.789Z'
        ) ->> 'reason'
      )::integer as reason_length
    `);
    assert.equal(boundedClaim.rows[0]?.reason_length, 4_000);

    const acl = await db.query<{
      anon_quota_execute: boolean;
      authenticated_quota_execute: boolean;
      service_quota_execute: boolean;
      anon_legacy_execute: boolean;
      authenticated_legacy_execute: boolean;
      service_legacy_execute: boolean;
      anon_audit_execute: boolean;
      authenticated_audit_execute: boolean;
      service_audit_execute: boolean;
      anon_consume_execute: boolean;
      authenticated_consume_execute: boolean;
      service_consume_execute: boolean;
      service_cleanup_execute: boolean;
      authenticated_compensation_execute: boolean;
      service_compensation_execute: boolean;
      service_channel_sanitizer_execute: boolean;
      service_quota_table_select: boolean;
      service_challenge_table_select: boolean;
      service_legacy_table_select: boolean;
      service_audit_table_select: boolean;
    }>(String.raw`
      select
        has_function_privilege(
          'anon',
          'public.reserve_naver_search_verification_request(text,integer,numeric)',
          'EXECUTE'
        ) as anon_quota_execute,
        has_function_privilege(
          'authenticated',
          'public.reserve_naver_search_verification_request(text,integer,numeric)',
          'EXECUTE'
        ) as authenticated_quota_execute,
        has_function_privilege(
          'service_role',
          'public.reserve_naver_search_verification_request(text,integer,numeric)',
          'EXECUTE'
        ) as service_quota_execute,
        has_function_privilege(
          'anon',
          'public.get_verification_legacy_evidence_file(uuid)',
          'EXECUTE'
        ) as anon_legacy_execute,
        has_function_privilege(
          'authenticated',
          'public.get_verification_legacy_evidence_file(uuid)',
          'EXECUTE'
        ) as authenticated_legacy_execute,
        has_function_privilege(
          'service_role',
          'public.get_verification_legacy_evidence_file(uuid)',
          'EXECUTE'
        ) as service_legacy_execute,
        has_function_privilege(
          'anon',
          'public.record_verification_evidence_access(uuid,uuid,text,text,text)',
          'EXECUTE'
        ) as anon_audit_execute,
        has_function_privilege(
          'authenticated',
          'public.record_verification_evidence_access(uuid,uuid,text,text,text)',
          'EXECUTE'
        ) as authenticated_audit_execute,
        has_function_privilege(
          'service_role',
          'public.record_verification_evidence_access(uuid,uuid,text,text,text)',
          'EXECUTE'
        ) as service_audit_execute,
        has_function_privilege(
          'anon',
          'public.consume_influencer_ownership_challenge(uuid,uuid,text,text,text,text,timestamptz,timestamptz)',
          'EXECUTE'
        ) as anon_consume_execute,
        has_function_privilege(
          'authenticated',
          'public.consume_influencer_ownership_challenge(uuid,uuid,text,text,text,text,timestamptz,timestamptz)',
          'EXECUTE'
        ) as authenticated_consume_execute,
        has_function_privilege(
          'service_role',
          'public.consume_influencer_ownership_challenge(uuid,uuid,text,text,text,text,timestamptz,timestamptz)',
          'EXECUTE'
        ) as service_consume_execute,
        has_function_privilege(
          'service_role',
          'public.cleanup_influencer_ownership_challenges(timestamptz,integer)',
          'EXECUTE'
        ) as service_cleanup_execute,
        has_function_privilege(
          'authenticated',
          'public.enqueue_verification_storage_compensation(uuid,text,text,text)',
          'EXECUTE'
        ) as authenticated_compensation_execute,
        has_function_privilege(
          'service_role',
          'public.enqueue_verification_storage_compensation(uuid,text,text,text)',
          'EXECUTE'
        ) as service_compensation_execute,
        has_function_privilege(
          'service_role',
          'directsign_private.directsign_sanitize_naver_channel_self_report()',
          'EXECUTE'
        ) as service_channel_sanitizer_execute,
        has_table_privilege(
          'service_role',
          'directsign_private.naver_search_verification_daily_usage',
          'SELECT'
        ) as service_quota_table_select,
        has_table_privilege(
          'service_role',
          'directsign_private.influencer_ownership_challenge_consumptions',
          'SELECT'
        ) as service_challenge_table_select,
        has_table_privilege(
          'service_role',
          'directsign_private.verification_legacy_evidence_files',
          'SELECT'
        ) as service_legacy_table_select,
        has_table_privilege(
          'service_role',
          'directsign_private.verification_evidence_access_events',
          'SELECT'
        ) as service_audit_table_select
    `);
    assert.deepEqual(acl.rows[0], {
      anon_quota_execute: false,
      authenticated_quota_execute: false,
      service_quota_execute: true,
      anon_legacy_execute: false,
      authenticated_legacy_execute: false,
      service_legacy_execute: true,
      anon_audit_execute: false,
      authenticated_audit_execute: false,
      service_audit_execute: true,
      anon_consume_execute: false,
      authenticated_consume_execute: false,
      service_consume_execute: true,
      service_cleanup_execute: true,
      authenticated_compensation_execute: false,
      service_compensation_execute: true,
      service_channel_sanitizer_execute: false,
      service_quota_table_select: false,
      service_challenge_table_select: false,
      service_legacy_table_select: false,
      service_audit_table_select: false,
    });

    const concurrentChallengeId = "99000000-0000-4000-8000-000000000001";
    const challengeIssuedAt = new Date(Date.now() - 60_000);
    const challengeExpiresAt = new Date(
      challengeIssuedAt.getTime() + 30 * 60 * 1000,
    );
    const consumeChallenge = () =>
      db.query<{ result: { consumed: boolean; reason: string } }>(String.raw`
        select public.consume_influencer_ownership_challenge(
          '${concurrentChallengeId}',
          '98000000-0000-4000-8000-000000000001',
          'youtube', repeat('a', 64), repeat('b', 64), repeat('c', 64),
          '${challengeIssuedAt.toISOString()}',
          '${challengeExpiresAt.toISOString()}'
        ) as result
      `);
    const concurrentConsumeResults = await Promise.all(
      Array.from({ length: 8 }, () => consumeChallenge()),
    );
    const consumeResults = concurrentConsumeResults.map(
      (result) => result.rows[0]!.result,
    );
    assert.equal(consumeResults.filter((result) => result.consumed).length, 1);
    assert.equal(
      consumeResults.filter((result) => result.reason === "already_consumed")
        .length,
      7,
    );
    const ledgerBinding = await db.query<{
      profile_id: string;
      platform: string;
      code_digest: string;
      platform_handle_hash: string;
      platform_url_hash: string;
    }>(String.raw`
      select profile_id, platform, code_digest,
        platform_handle_hash, platform_url_hash
      from directsign_private.influencer_ownership_challenge_consumptions
      where challenge_id = '${concurrentChallengeId}'
    `);
    assert.deepEqual(ledgerBinding.rows[0], {
      profile_id: "98000000-0000-4000-8000-000000000001",
      platform: "youtube",
      code_digest: "a".repeat(64),
      platform_handle_hash: "b".repeat(64),
      platform_url_hash: "c".repeat(64),
    });

    const queuedCompensation = await db.query<{
      result: { queued: boolean; queue_id: string };
    }>(String.raw`
      select public.enqueue_verification_storage_compensation(
        '99000000-0000-4000-8000-000000000002',
        'directsign-private',
        'verification-influencer/owner/exact-proof.pdf',
        'verification_insert_failed'
      ) as result
    `);
    assert.equal(queuedCompensation.rows[0]?.result.queued, true);
    const queuedTarget = await db.query<{
      source_id: string;
      bucket: string;
      object_path: string;
      status: string;
    }>(String.raw`
      select source_id, bucket, object_path, status
      from public.privacy_storage_deletion_queue
      where id = '${queuedCompensation.rows[0]!.result.queue_id}'
    `);
    assert.deepEqual(queuedTarget.rows[0], {
      source_id: "99000000-0000-4000-8000-000000000002",
      bucket: "directsign-private",
      object_path: "verification-influencer/owner/exact-proof.pdf",
      status: "pending",
    });

    await db.exec(String.raw`
      insert into directsign_private.influencer_ownership_challenge_consumptions (
        challenge_id, profile_id, platform, code_digest,
        platform_handle_hash, platform_url_hash,
        issued_at, expires_at, consumed_at
      ) select
        '99000000-0000-4000-8000-000000000003',
        '98000000-0000-4000-8000-000000000001',
        'naver_blog', repeat('d', 64), repeat('e', 64), repeat('f', 64),
        fixture.issued_at,
        fixture.issued_at + interval '30 minutes',
        fixture.issued_at + interval '10 minutes'
      from (
        select clock_timestamp() - interval '3 days 30 minutes' as issued_at
      ) as fixture
    `);
    const cleanup = await db.query<{
      result: { deleted: number; backlog: number };
    }>(String.raw`
      select public.cleanup_influencer_ownership_challenges(
        clock_timestamp(), 500
      ) as result
    `);
    assert.equal(cleanup.rows[0]!.result.deleted >= 1, true);
    assert.equal(cleanup.rows[0]!.result.backlog, 0);

    await db.exec(`set "request.jwt.claim.role" = 'authenticated'`);
    await assert.rejects(consumeChallenge(), /service role required/);
    await assert.rejects(
      db.query(String.raw`
        select public.enqueue_verification_storage_compensation(
          '99000000-0000-4000-8000-000000000004',
          'directsign-private',
          'verification-influencer/owner/denied.pdf',
          'verification_insert_failed'
        )
      `),
      /service role required/,
    );
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);

    const legacy = await db.query<{ file_data_url: string }>(String.raw`
      select public.get_verification_legacy_evidence_file(
        '90000000-0000-4000-8000-000000000001'
      ) as file_data_url
    `);
    assert.equal(
      legacy.rows[0]?.file_data_url,
      "data:image/png;base64,iVBORw0KGgo=",
    );

    await db.exec(`set "request.jwt.claim.role" = 'authenticated'`);
    await assert.rejects(
      db.query(String.raw`
        select public.get_verification_legacy_evidence_file(
          '90000000-0000-4000-8000-000000000001'
        )
      `),
      /verification legacy evidence access requires service role/,
    );
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);

    await db.query(String.raw`
      select public.record_verification_evidence_access(
        '90000000-0000-4000-8000-000000000001',
        '96000000-0000-4000-8000-000000000001',
        'Current operator',
        '127.0.0.2',
        'current-agent'
      )
    `);
    const auditRows = await db.query<{ count: number }>(String.raw`
      select count(*)::integer as count
      from directsign_private.verification_evidence_access_events
      where request_id = '90000000-0000-4000-8000-000000000001'
    `);
    assert.equal(auditRows.rows[0]?.count, 2);

    const stored = await db.query<{
      id: string;
      naver_blog_recent_4d_average_visitors: number | null;
      evidence_snapshot_json: Record<string, unknown>;
    }>(String.raw`
      select id, naver_blog_recent_4d_average_visitors, evidence_snapshot_json
      from public.verification_requests
      where id in (
        '90000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000002',
        '90000000-0000-4000-8000-000000000003'
      )
      order by id
    `);
    const youtube = stored.rows[0]!.evidence_snapshot_json;
    const naver = stored.rows[1]!.evidence_snapshot_json;
    const claim = stored.rows[2]!.evidence_snapshot_json;
    const serialized = JSON.stringify(stored.rows);
    for (const forbidden of [
      "raw_response",
      "result_hash",
      "http_status",
      "subscriber_count",
      "self_reported_channel_metric",
      "creator_self_report",
      "file_data_url",
      "evidence_access_audit",
      "provider-sensitive",
      "qa_seed",
      "hidden-here",
      "attacker.invalid",
      "provider.invalid",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.equal(stored.rows[1]?.naver_blog_recent_4d_average_visitors, null);
    assert.deepEqual(Object.keys(youtube).sort(), [
      "evidence_file",
      "ownership_verification",
    ]);
    assert.equal(
      (youtube.evidence_file as Record<string, unknown>).provider,
      "legacy_private_table",
    );
    assert.equal(
      (youtube.ownership_verification as Record<string, unknown>)
        .platform_handle,
      "submitted-handle",
    );
    assert.equal(
      (youtube.ownership_verification as Record<string, unknown>)
        .challenge_code,
      "DS-TEST-ONLY",
    );
    assert.equal(
      JSON.stringify(youtube).includes("provider_response_retained"),
      true,
    );
    assert.equal(
      (naver.evidence_file as Record<string, unknown>).provider,
      "local_file",
    );
    assert.deepEqual(
      Object.keys(naver.evidence_file as Record<string, unknown>).sort(),
      [
        "bucket",
        "byte_size",
        "content_type",
        "download_path",
        "file_name",
        "path",
        "provider",
        "sha256",
        "stored_at",
      ],
    );
    assert.equal(claim.request_type, "public_profile_handle_claim");
    assert.equal(claim.claim_type, "platform_handle_conflict");
    assert.equal(claim.claimed_handle, "submitted.handle");
    assert.equal(claim.claimed_profile_url, "https://yeollock.me/submitted.handle");
    assert.equal(claim.requested_alternate_handle, "submitted_creator");
    assert.equal(claim.reason, "The verified platform handle is mine.");
    assert.equal(Object.hasOwn(claim, "ownership_verification"), false);

    await db.exec(String.raw`
      insert into public.marketplace_influencer_channels (
        id, profile_id, platform, label, handle, url,
        follower_count, followers_label, performance_label,
        follower_count_synced_at, follower_sync_status,
        follower_sync_source, follower_sync_error, follower_sync_metadata
      ) values (
        '98000000-0000-4000-8000-000000000005',
        '98000000-0000-4000-8000-000000000002',
        'naver_blog', 'NAVER Blog', 'reentered-blog',
        'https://blog.naver.com/reentered-blog', 123, '123명',
        'arbitrary metric', clock_timestamp(), 'failed',
        'arbitrary_reentry_source', 'private reentry error',
        '{"provider":"unknown_vendor","raw":"private"}'::jsonb
      )
    `);

    const minimizedChannels = await db.query<{
      follower_count: number | null;
      followers_label: string;
      performance_label: string;
      follower_count_synced_at: string | null;
      follower_sync_status: string;
      follower_sync_source: string | null;
      follower_sync_error: string | null;
      follower_sync_metadata: Record<string, unknown>;
    }>(String.raw`
      select follower_count, followers_label, performance_label,
        follower_count_synced_at, follower_sync_status, follower_sync_source,
        follower_sync_error, follower_sync_metadata
      from public.marketplace_influencer_channels
      where profile_id = '98000000-0000-4000-8000-000000000002'
        and platform in ('youtube', 'naver_blog')
      order by platform, handle
    `);
    assert.equal(minimizedChannels.rows.length, 2);
    for (const channel of minimizedChannels.rows) {
      assert.deepEqual(channel, {
        follower_count: null,
        followers_label: "계정 연동",
        performance_label: "프로필에서 확인",
        follower_count_synced_at: null,
        follower_sync_status: "not_synced",
        follower_sync_source: null,
        follower_sync_error: null,
        follower_sync_metadata: {},
      });
    }
    for (const blockedEvent of [
      {
        id: "98000000-0000-4000-8000-000000000014",
        platform: "youtube",
        provider: "legacy_naver_variant",
      },
      {
        id: "98000000-0000-4000-8000-000000000015",
        platform: "naver_blog",
        provider: "youtube_data_api_variant",
      },
    ]) {
      await assert.rejects(
        db.exec(String.raw`
          insert into public.marketplace_follower_sync_events (
            id, profile_id, platform, handle, status, provider,
            follower_count, error_message, metadata
          ) values (
            '${blockedEvent.id}',
            '98000000-0000-4000-8000-000000000002',
            '${blockedEvent.platform}', 'blocked-reentry', 'failed',
            '${blockedEvent.provider}', 123, 'must not persist',
            '{"raw":"must-not-persist"}'::jsonb
          )
        `),
        /marketplace_follower_sync_events_no_minimized_platforms/,
      );
    }
    await assert.rejects(
      db.exec(String.raw`
        update public.marketplace_follower_sync_events
        set platform = 'youtube', provider = 'provider-switch-variant'
        where id = '98000000-0000-4000-8000-000000000013'
      `),
      /marketplace_follower_sync_events_no_minimized_platforms/,
    );
    await db.exec(String.raw`
      insert into public.marketplace_follower_sync_events (
        id, profile_id, platform, handle, status, provider,
        follower_count, error_message, metadata
      ) values (
        '98000000-0000-4000-8000-000000000016',
        '98000000-0000-4000-8000-000000000002',
        'instagram', 'allowed-instagram', 'unchanged',
        'naver_search_api_variant', 11, null, '{}'::jsonb
      )
    `);
    const survivingFollowerEvents = await db.query<{
      platform: string;
      provider: string | null;
    }>(String.raw`
      select platform, provider
      from public.marketplace_follower_sync_events
      order by id
    `);
    assert.deepEqual(survivingFollowerEvents.rows, [
      { platform: "instagram", provider: "youtube_data_api" },
      { platform: "instagram", provider: "naver_search_api_variant" },
    ]);
    await db.exec(String.raw`
      update public.marketplace_influencer_channels
      set follower_count = 999,
        followers_label = '일평균 999명',
        performance_label = '최근 4일 평균 · 자가신고',
        follower_count_synced_at = clock_timestamp(),
        follower_sync_status = 'synced',
        follower_sync_source = 'arbitrary_reentry_source',
        follower_sync_error = 'must be removed',
        follower_sync_metadata = '{
          "provider":"unknown_vendor",
          "metric":"average_daily_visitors_4d",
          "trust":"self_reported"
        }'::jsonb
      where profile_id = '98000000-0000-4000-8000-000000000002'
        and platform in ('youtube', 'naver_blog')
    `);
    const blockedReintroduction = await db.query<{
      follower_count: number | null;
      performance_label: string;
      follower_sync_source: string | null;
      follower_sync_error: string | null;
      follower_sync_metadata: Record<string, unknown>;
    }>(String.raw`
      select follower_count, performance_label, follower_sync_source,
        follower_sync_error,
        follower_sync_metadata
      from public.marketplace_influencer_channels
      where profile_id = '98000000-0000-4000-8000-000000000002'
        and platform in ('youtube', 'naver_blog')
      order by platform, handle
    `);
    for (const channel of blockedReintroduction.rows) {
      assert.deepEqual(channel, {
        follower_count: null,
        performance_label: "프로필에서 확인",
        follower_sync_source: null,
        follower_sync_error: null,
        follower_sync_metadata: {},
      });
    }

    const forbiddenPaths = [
      "{raw_response}",
      "{seeded}",
      "{self_reported_channel_metric}",
      "{evidence_access_audit}",
      "{evidence_file,raw_response}",
      "{ownership_verification,channel_metric}",
      "{ownership_verification,automation,platform_account,raw_response}",
      "{ownership_verification,automation,platform_account,result_hash}",
      "{ownership_verification,automation,platform_account,http_status}",
      "{ownership_verification,automation,platform_account,profile}",
    ];
    for (const path of forbiddenPaths) {
      await assert.rejects(
        db.exec(String.raw`
          update public.verification_requests
          set evidence_snapshot_json = jsonb_set(
            evidence_snapshot_json,
            '${path}',
            '"reintroduced"'::jsonb,
            true
          )
          where id = '90000000-0000-4000-8000-000000000001'
        `),
        /verification_requests_minimized_provider_evidence/,
      );
    }
    await assert.rejects(
      db.exec(String.raw`
        update public.verification_requests
        set evidence_snapshot_json = jsonb_set(
          evidence_snapshot_json,
          '{ownership_verification,automation,platform_account,checked_at}',
          '"not-a-time"'::jsonb,
          true
        )
        where id = '90000000-0000-4000-8000-000000000001'
      `),
      /verification_requests_minimized_provider_evidence/,
    );
    await assert.rejects(
      db.exec(String.raw`
        update public.verification_requests
        set evidence_snapshot_json = evidence_snapshot_json ||
          '{"raw_response":{"provider":"claim-injection"}}'::jsonb
        where id = '90000000-0000-4000-8000-000000000003'
      `),
      /verification_requests_minimized_provider_evidence/,
    );
    await assert.rejects(
      db.exec(String.raw`
        update public.verification_requests
        set naver_blog_recent_4d_average_visitors = 99
        where id = '90000000-0000-4000-8000-000000000002'
      `),
      /verification_requests_minimized_provider_evidence/,
    );

    const reservations: Array<{
      allowed: boolean;
      reason?: string;
      date_kst: string;
      expires_at: string;
      cap: number;
      used: number;
      remaining: number;
    }> = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const reservation = await db.query<{
        result: (typeof reservations)[number];
      }>(
        "select public.reserve_naver_search_verification_request('blog_verification', 100, 0.05) as result",
      );
      reservations.push(reservation.rows[0]!.result);
    }
    assert.equal(reservations.slice(0, 5).every((item) => item.allowed), true);
    assert.deepEqual(reservations[5], {
      allowed: false,
      reason: "budget_exhausted",
      date_kst: reservations[5]?.date_kst,
      expires_at: reservations[5]?.expires_at,
      cap: 5,
      used: 5,
      remaining: 0,
    });
    assert.match(
      reservations[0]!.expires_at,
      /^\d{4}-\d{2}-\d{2}T15:00:00\.000Z$/,
    );
  } finally {
    await db.close();
  }

  const duplicateDb = new PGlite();
  try {
    await applyPrivacySchemaThroughFinalGuaranteesMigration(
      duplicateDb,
      "20260808160000_add_campaign_application_metrics_and_atomic_edit.sql",
    );
    await duplicateDb.exec(String.raw`
      insert into public.verification_requests (
        id, target_type, target_id, verification_type, status, data_origin,
        subject_name, platform, platform_handle, platform_url,
        ownership_verification_method, ownership_challenge_code,
        ownership_check_status, evidence_snapshot_json
      ) values
      (
        '97000000-0000-4000-8000-000000000001',
        'influencer_account', 'duplicate-owner-1', 'platform_account',
        'pending', 'production', 'Duplicate one', 'youtube', 'duplicate-one',
        'https://youtube.com/@duplicate-one', 'channel_description_code',
        'DS-DUPE-CODE', 'not_run', '{}'::jsonb
      ),
      (
        '97000000-0000-4000-8000-000000000002',
        'influencer_account', 'duplicate-owner-2', 'platform_account',
        'pending', null, 'Duplicate two', 'naver_blog', 'duplicate-two',
        'https://blog.naver.com/duplicate-two', 'profile_bio_code',
        'DS-DUPE-CODE', 'not_run', '{}'::jsonb
      );
    `);
    await assert.rejects(
      duplicateDb.exec(platformVerificationMinimizationMigration),
      /duplicate production YouTube\/NAVER ownership challenge codes must be resolved before migration/,
    );
  } finally {
    await duplicateDb.close();
  }
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

  assert.match(server, /const signupPrivacyPolicyVersion = "2026-08-08\.4"/);
  assert.match(
    signupPage,
    /const PRIVACY_POLICY_DOCUMENT_VERSION = "2026-08-08\.4"/,
  );
  assert.match(privacyPage, /documentVersion: "2026-08-08\.4"/);
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
    /applicationContactFields: \[\] as CampaignApplicationContactField\[\]/,
  );
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
    /export const isMicrosoftClarityCollectionEnabled = \(\) => false/,
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
