import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration160000Url = new URL(
  "../supabase/migrations/20260807160000_apply_verified_platform_channel_metrics.sql",
  import.meta.url,
);
const migration170000Url = new URL(
  "../supabase/migrations/20260807170000_enforce_naver_blog_self_report_metrics.sql",
  import.meta.url,
);

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwnerId = "22222222-2222-4222-8222-222222222222";
const marketplaceProfileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const fixtureSql = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema directsign_private;
  set time zone 'UTC';

  create type public.directsign_platform_type as enum (
    'instagram', 'youtube', 'tiktok', 'naver_blog', 'other'
  );
  create type public.directsign_verification_status as enum (
    'not_submitted', 'pending', 'approved', 'rejected'
  );
  create type public.directsign_verification_target_type as enum (
    'advertiser_organization', 'influencer_account'
  );
  create type public.directsign_verification_type as enum (
    'business_registration_certificate', 'platform_account',
    'email', 'phone', 'manual'
  );
  create type public.directsign_ownership_verification_method as enum (
    'profile_bio_code', 'public_post_code', 'channel_description_code',
    'screenshot_review', 'instagram_dm_code'
  );

  create table public.profiles (
    id uuid primary key,
    role text not null,
    data_origin text not null default 'production'
  );

  create table public.verification_requests (
    id uuid primary key default gen_random_uuid(),
    target_type public.directsign_verification_target_type not null,
    target_id text not null,
    verification_type public.directsign_verification_type not null,
    status public.directsign_verification_status not null default 'pending',
    profile_id uuid,
    subject_name text not null,
    submitted_by_name text,
    submitted_by_email text,
    platform public.directsign_platform_type,
    platform_handle text,
    platform_url text,
    evidence_snapshot_json jsonb not null default '{}'::jsonb,
    note text,
    reviewer_note text,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    ownership_verification_method public.directsign_ownership_verification_method,
    data_origin text not null default 'production'
  );

  create table public.marketplace_influencer_profiles (
    id uuid primary key default gen_random_uuid(),
    owner_profile_id uuid not null unique,
    data_origin text not null default 'production'
  );

  create table public.marketplace_influencer_channels (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null,
    platform public.directsign_platform_type not null,
    label text not null,
    handle text not null,
    url text,
    followers_label text not null default '계정 연동',
    performance_label text not null default '프로필에서 확인',
    sort_order integer not null default 0,
    follower_count bigint,
    follower_count_synced_at timestamptz,
    follower_sync_status text not null default 'not_synced',
    follower_sync_source text,
    follower_sync_error text,
    follower_sync_metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (profile_id, platform, handle)
  );

  create table public.marketplace_registered_influencer_directory (
    owner_profile_id uuid primary key,
    registered_handle text not null default 'rm-test',
    display_name text not null default 'Test',
    platforms text[] not null default '{}'::text[],
    verified_channels jsonb not null default '[]'::jsonb,
    audience_counts jsonb not null default '{}'::jsonb,
    max_audience_count bigint,
    public_marketplace_profile_id uuid not null unique,
    source_updated_at timestamptz not null default now(),
    eligibility_version text not null default 'test'
  );

  create table public.marketplace_public_influencer_directory (
    listing_key text primary key,
    source_type text not null default 'registered',
    source_id uuid not null,
    public_handle text not null,
    display_name text not null,
    platforms text[] not null default '{}'::text[],
    audience_counts jsonb not null default '{}'::jsonb,
    max_audience_count bigint,
    source_updated_at timestamptz not null default now(),
    eligibility_version text not null default 'test',
    eligibility_reason text not null default 'test'
  );

  create or replace function directsign_private.directsign_email_is_operational(
    p_email text
  ) returns boolean language sql immutable as $$ select true $$;

  create or replace function directsign_private.directsign_has_test_marker(
    p_value text
  ) returns boolean language sql immutable as $$ select false $$;

  create or replace function directsign_private.directsign_uuid_or_null(
    p_value text
  ) returns uuid language plpgsql immutable as $$
  begin
    return p_value::uuid;
  exception when others then
    return null;
  end;
  $$;

  create or replace function directsign_private.directsign_is_operational_profile(
    p_id uuid,
    p_role text
  ) returns boolean language sql stable as $$
    select exists (
      select 1
      from public.profiles
      where id = p_id
        and role = p_role
        and data_origin = 'production'
    )
  $$;

  create or replace function directsign_private.directsign_refresh_registered_member_discovery(
    p_id uuid
  ) returns void language plpgsql as $$
  declare
    v_marketplace_profile_id uuid;
    v_verified_channels jsonb;
    v_audience_counts jsonb;
    v_max_audience_count bigint;
  begin
    select id
    into v_marketplace_profile_id
    from public.marketplace_influencer_profiles
    where owner_profile_id = p_id
      and data_origin = 'production';

    if v_marketplace_profile_id is null then
      return;
    end if;

    with approved as (
      select distinct on (
        request.platform,
        lower(regexp_replace(btrim(request.platform_handle), '^@+', ''))
      )
        request.platform,
        lower(regexp_replace(btrim(request.platform_handle), '^@+', '')) as handle
      from public.verification_requests as request
      where request.target_type::text = 'influencer_account'
        and request.verification_type::text = 'platform_account'
        and request.status::text = 'approved'
        and request.reviewed_at is not null
        and request.data_origin = 'production'
        and (
          (request.profile_id is null or request.profile_id = p_id)
          and (
            btrim(request.target_id) = ''
            or directsign_private.directsign_uuid_or_null(request.target_id) = p_id
          )
          and (
            request.profile_id is not null
            or directsign_private.directsign_uuid_or_null(request.target_id) is not null
          )
        )
      order by
        request.platform,
        lower(regexp_replace(btrim(request.platform_handle), '^@+', '')),
        request.reviewed_at desc,
        request.created_at desc,
        request.id desc
    ),
    projected as (
      select
        approved.platform,
        approved.handle,
        matched_channel.follower_count
      from approved
      left join lateral (
        select channel.follower_count
        from public.marketplace_influencer_channels as channel
        where channel.profile_id = v_marketplace_profile_id
          and channel.platform = approved.platform
          and lower(regexp_replace(btrim(channel.handle), '^@+', '')) =
            approved.handle
        order by channel.updated_at desc, channel.id desc
        limit 1
      ) as matched_channel on true
    )
    select
      coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'platform', projected.platform::text,
        'handle', projected.handle,
        'follower_count', projected.follower_count
      )) order by projected.platform::text, projected.handle), '[]'::jsonb),
      coalesce(jsonb_object_agg(
        projected.platform::text,
        projected.follower_count
      ) filter (where projected.follower_count is not null), '{}'::jsonb),
      max(projected.follower_count)
    into v_verified_channels, v_audience_counts, v_max_audience_count
    from projected;

    update public.marketplace_registered_influencer_directory
    set
      verified_channels = v_verified_channels,
      audience_counts = v_audience_counts,
      max_audience_count = v_max_audience_count,
      source_updated_at = now()
    where owner_profile_id = p_id;
  end;
  $$;

  create or replace function directsign_private.directsign_materialize_registered_member_channels(
    p_id uuid
  ) returns void language sql as $$ select $$;

  create or replace function directsign_private.directsign_apply_approved_instagram_dm_follower_metric(
    p_id uuid
  ) returns void language sql as $$ select $$;

  create or replace function directsign_private.directsign_format_marketplace_follower_count_label(
    p_count bigint
  ) returns text language sql immutable as $$
    select p_count::text || '명'
  $$;

  create function public.apply_discovered_naver_blog_visitor_metrics_v2(jsonb)
  returns void language sql as $$ select $$;
  create function public.apply_discovered_naver_blog_visitor_metrics(jsonb)
  returns void language sql as $$ select $$;
`;

type VerificationInput = {
  handle: string;
  value: number | null;
  createdAt: string;
  status?: "approved" | "pending" | "rejected";
  dataOrigin?: "production" | "qa";
  profileId?: string;
  targetId?: string;
  includeEvidence?: boolean;
};

const selfReportedEvidence = (
  handle: string,
  value: number,
  reportedAt: string,
) => ({
  self_reported_channel_metric: {
    status: "available",
    platform: "naver_blog",
    metric: "average_daily_visitors_4d",
    value,
    period_days: 4,
    source: "creator_self_report",
    trust: "self_reported",
    reported_at: reportedAt,
    reported_handle: handle,
  },
});

const insertVerification = async (
  db: PGlite,
  input: VerificationInput,
) => {
  const status = input.status ?? "approved";
  const evidence =
    input.includeEvidence === false || input.value === null
      ? {}
      : selfReportedEvidence(input.handle, input.value, input.createdAt);

  const inserted = await db.query<{ id: string }>(
    `
      insert into public.verification_requests (
        target_type,
        target_id,
        verification_type,
        status,
        profile_id,
        subject_name,
        submitted_by_email,
        platform,
        platform_handle,
        reviewed_at,
        created_at,
        data_origin,
        naver_blog_recent_4d_average_visitors,
        evidence_snapshot_json
      ) values (
        'influencer_account',
        $1,
        'platform_account',
        $2,
        $3,
        'Creator',
        'creator@example.com',
        'naver_blog',
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
      returning id::text as id
    `,
    [
      input.targetId ?? ownerId,
      status,
      input.profileId ?? ownerId,
      input.handle,
      status === "pending" ? null : input.createdAt,
      input.createdAt,
      input.dataOrigin ?? "production",
      input.value,
      JSON.stringify(evidence),
    ],
  );
  return inserted.rows[0].id;
};

test("Naver self-report migrations enforce canonical metric boundaries", async (t) => {
  const db = new PGlite();

  try {
    await db.exec(fixtureSql);
    await db.exec(await readFile(migration160000Url, "utf8"));

    await db.query(
      `insert into public.profiles (id, role, data_origin)
       values ($1, 'influencer', 'production'),
              ($2, 'influencer', 'production')`,
      [ownerId, otherOwnerId],
    );
    await db.query(
      `insert into public.marketplace_influencer_profiles (
         id, owner_profile_id, data_origin
       ) values ($1, $2, 'production')`,
      [marketplaceProfileId, ownerId],
    );

    await db.query(
      `
        insert into public.marketplace_influencer_channels (
          profile_id,
          platform,
          label,
          handle,
          follower_count,
          follower_count_synced_at,
          follower_sync_status,
          follower_sync_source,
          follower_sync_metadata
        ) values (
          $1,
          'naver_blog',
          'Naver Blog',
          'legacy.blog',
          88,
          '2026-08-09T00:00:00Z',
          'synced',
          'naver_blog_public_visitor_counter',
          '{"metric":"daily_visitors"}'::jsonb
        )
      `,
      [marketplaceProfileId],
    );
    await db.query(
      `
        insert into public.marketplace_influencer_channels (
          profile_id,
          platform,
          label,
          handle,
          followers_label,
          performance_label,
          follower_count,
          follower_count_synced_at,
          follower_sync_status,
          follower_sync_source,
          follower_sync_metadata
        ) values (
          $1,
          'instagram',
          'Instagram',
          'legacy-misplaced',
          '일평균 9,999명',
          '최근 4일 평균 · 자가신고',
          9999,
          '2026-08-09T00:00:00Z',
          'synced',
          'creator_self_report',
          '{"provider":"creator_self_report","metric":"average_daily_visitors_4d","trust":"self_reported"}'::jsonb
        )
      `,
      [marketplaceProfileId],
    );
    await db.query(
      `
        insert into public.marketplace_registered_influencer_directory (
          owner_profile_id,
          platforms,
          verified_channels,
          audience_counts,
          max_audience_count,
          public_marketplace_profile_id
        ) values (
          $1,
          array['naver_blog'],
          '[{"platform":"naver_blog","handle":"legacy.blog","follower_count":88}]',
          '{"naver_blog":88}',
          88,
          $2
        )
      `,
      [ownerId, marketplaceProfileId],
    );
    await db.query(
      `
        insert into public.marketplace_public_influencer_directory (
          listing_key,
          source_id,
          public_handle,
          display_name,
          platforms,
          audience_counts,
          max_audience_count
        ) values (
          'registered:legacy',
          $1,
          'creator',
          'Creator',
          array['naver_blog'],
          '{"naver_blog":88}',
          88
        )
      `,
      [ownerId],
    );

    await db.exec(await readFile(migration170000Url, "utf8"));

    await t.test("removes legacy public-counter values and RPCs", async () => {
      const legacyChannel = (
        await db.query<{
          follower_count: number | null;
          followers_label: string;
          performance_label: string;
          follower_count_synced_at: Date | null;
          follower_sync_status: string;
          follower_sync_source: string;
          follower_sync_metadata: Record<string, unknown>;
        }>(
          `select follower_count,
                  followers_label,
                  performance_label,
                  follower_count_synced_at,
                  follower_sync_status,
                  follower_sync_source,
                  follower_sync_metadata
           from public.marketplace_influencer_channels
           where handle = 'legacy.blog'`,
        )
      ).rows[0];

      assert.deepEqual(
        {
          follower_count: legacyChannel.follower_count,
          followers_label: legacyChannel.followers_label,
          performance_label: legacyChannel.performance_label,
          follower_count_synced_at: legacyChannel.follower_count_synced_at,
          follower_sync_status: legacyChannel.follower_sync_status,
          follower_sync_source: legacyChannel.follower_sync_source,
          legacyHidden:
            legacyChannel.follower_sync_metadata
              .legacy_unofficial_metric_hidden,
        },
        {
          follower_count: null,
          followers_label: "계정 연동",
          performance_label: "자가신고 미입력",
          follower_count_synced_at: null,
          follower_sync_status: "skipped",
          follower_sync_source: "creator_self_report_required",
          legacyHidden: true,
        },
      );

      const misplacedLegacy = (
        await db.query<{
          follower_count: number | null;
          followers_label: string;
          performance_label: string;
          follower_count_synced_at: Date | null;
          follower_sync_status: string;
          follower_sync_source: string | null;
          follower_sync_metadata: Record<string, unknown>;
        }>(
          `select follower_count,
                  followers_label,
                  performance_label,
                  follower_count_synced_at,
                  follower_sync_status,
                  follower_sync_source,
                  follower_sync_metadata
           from public.marketplace_influencer_channels
           where handle = 'legacy-misplaced'`,
        )
      ).rows[0];
      assert.deepEqual(misplacedLegacy, {
        follower_count: null,
        followers_label: "계정 연동",
        performance_label: "프로필에서 확인",
        follower_count_synced_at: null,
        follower_sync_status: "not_synced",
        follower_sync_source: null,
        follower_sync_metadata: {},
      });

      const registered = (
        await db.query<{
          verified_channels: Array<Record<string, unknown>>;
          audience_counts: Record<string, number>;
          max_audience_count: number | null;
        }>(
          `select verified_channels, audience_counts, max_audience_count
           from public.marketplace_registered_influencer_directory
           where owner_profile_id = $1`,
          [ownerId],
        )
      ).rows[0];
      assert.deepEqual(registered, {
        verified_channels: [],
        audience_counts: {},
        max_audience_count: null,
      });

      const publicDirectory = (
        await db.query<{
          audience_counts: Record<string, number>;
          max_audience_count: number | null;
        }>(
          `select audience_counts, max_audience_count
           from public.marketplace_public_influencer_directory
           where listing_key = 'registered:legacy'`,
        )
      ).rows[0];
      assert.deepEqual(publicDirectory, {
        audience_counts: {},
        max_audience_count: null,
      });

      const legacyRpcs = (
        await db.query<{ first_rpc: string | null; second_rpc: string | null }>(
          `select
             to_regprocedure(
               'public.apply_discovered_naver_blog_visitor_metrics_v2(jsonb)'
             )::text as first_rpc,
             to_regprocedure(
               'public.apply_discovered_naver_blog_visitor_metrics(jsonb)'
             )::text as second_rpc`,
        )
      ).rows[0];
      assert.deepEqual(legacyRpcs, { first_rpc: null, second_rpc: null });
    });

    await t.test("applies approved production values including zero", async () => {
      await insertVerification(db, {
        handle: "zero.blog",
        value: 0,
        createdAt: "2026-08-07T01:00:00Z",
      });
      await insertVerification(db, {
        handle: "value.blog",
        value: 1234,
        createdAt: "2026-08-07T02:00:00Z",
      });

      const channels = (
        await db.query<{
          handle: string;
          follower_count: number;
          followers_label: string;
          performance_label: string;
          follower_sync_status: string;
          follower_sync_source: string;
          follower_sync_metadata: Record<string, unknown>;
        }>(
          `select handle,
                  follower_count,
                  followers_label,
                  performance_label,
                  follower_sync_status,
                  follower_sync_source,
                  follower_sync_metadata
           from public.marketplace_influencer_channels
           where handle in ('zero.blog', 'value.blog')
           order by handle`,
        )
      ).rows;

      assert.deepEqual(
        channels.map((channel) => ({
          handle: channel.handle,
          follower_count: channel.follower_count,
          followers_label: channel.followers_label,
          performance_label: channel.performance_label,
          follower_sync_status: channel.follower_sync_status,
          follower_sync_source: channel.follower_sync_source,
        })),
        [
          {
            handle: "value.blog",
            follower_count: 1234,
            followers_label: "일평균 1,234명",
            performance_label: "최근 4일 평균 · 자가신고",
            follower_sync_status: "synced",
            follower_sync_source: "creator_self_report",
          },
          {
            handle: "zero.blog",
            follower_count: 0,
            followers_label: "일평균 0명",
            performance_label: "최근 4일 평균 · 자가신고",
            follower_sync_status: "synced",
            follower_sync_source: "creator_self_report",
          },
        ],
      );
      assert.deepEqual(
        {
          metric: channels[0].follower_sync_metadata.metric,
          trust: channels[0].follower_sync_metadata.trust,
          periodDays: channels[0].follower_sync_metadata.period_days,
          reportedHandle:
            channels[0].follower_sync_metadata.reported_handle,
          verificationBound:
            channels[0].follower_sync_metadata.verification_bound,
        },
        {
          metric: "average_daily_visitors_4d",
          trust: "self_reported",
          periodDays: 4,
          reportedHandle: "value.blog",
          verificationBound: false,
        },
      );
    });

    await t.test("clears invalid raw writes from the registered projection", async () => {
      await insertVerification(db, {
        handle: "direct-tamper.blog",
        value: 654,
        createdAt: "2026-08-07T02:20:00Z",
      });

      const before = (
        await db.query<{ verified_channels: Array<Record<string, unknown>> }>(
          `select verified_channels
           from public.marketplace_registered_influencer_directory
           where owner_profile_id = $1`,
          [ownerId],
        )
      ).rows[0].verified_channels.find(
        (channel) => channel.handle === "direct-tamper.blog",
      );
      assert.deepEqual(before, {
        platform: "naver_blog",
        handle: "direct-tamper.blog",
        follower_count: 654,
        metric_type: "average_daily_visitors_4d",
        metric_source: "creator_self_report",
        metric_trust: "self_reported",
        metric_period_days: 4,
      });

      await db.query(
        `update public.marketplace_influencer_channels
         set follower_count = 999
         where handle = 'direct-tamper.blog'`,
      );

      const rawCount = (
        await db.query<{ follower_count: number | null }>(
          `select follower_count
           from public.marketplace_influencer_channels
           where handle = 'direct-tamper.blog'`,
        )
      ).rows[0].follower_count;
      const after = (
        await db.query<{ verified_channels: Array<Record<string, unknown>> }>(
          `select verified_channels
           from public.marketplace_registered_influencer_directory
           where owner_profile_id = $1`,
          [ownerId],
        )
      ).rows[0].verified_channels.find(
        (channel) => channel.handle === "direct-tamper.blog",
      );
      assert.equal(rawCount, null);
      assert.deepEqual(after, {
        platform: "naver_blog",
        handle: "direct-tamper.blog",
      });
    });

    await t.test("never carries a Naver self-report onto another platform", async () => {
      await insertVerification(db, {
        handle: "platform-move.blog",
        value: 345,
        createdAt: "2026-08-07T02:25:00Z",
      });

      await db.query(
        `update public.marketplace_influencer_channels
         set platform = 'instagram'
         where handle = 'platform-move.blog'`,
      );

      const raw = (
        await db.query<{
          platform: string;
          follower_count: number | null;
          followers_label: string;
          performance_label: string;
          follower_count_synced_at: Date | null;
          follower_sync_status: string;
          follower_sync_source: string | null;
          follower_sync_metadata: Record<string, unknown>;
        }>(
          `select platform::text,
                  follower_count,
                  followers_label,
                  performance_label,
                  follower_count_synced_at,
                  follower_sync_status,
                  follower_sync_source,
                  follower_sync_metadata
           from public.marketplace_influencer_channels
           where handle = 'platform-move.blog'`,
        )
      ).rows[0];
      assert.deepEqual(raw, {
        platform: "instagram",
        follower_count: null,
        followers_label: "계정 연동",
        performance_label: "프로필에서 확인",
        follower_count_synced_at: null,
        follower_sync_status: "not_synced",
        follower_sync_source: null,
        follower_sync_metadata: {},
      });

      const registered = (
        await db.query<{
          verified_channels: Array<Record<string, unknown>>;
          audience_counts: Record<string, number>;
          max_audience_count: number | null;
        }>(
          `select verified_channels, audience_counts, max_audience_count
           from public.marketplace_registered_influencer_directory
           where owner_profile_id = $1`,
          [ownerId],
        )
      ).rows[0];
      assert.deepEqual(
        registered.verified_channels.find(
          (channel) => channel.handle === "platform-move.blog",
        ),
        { platform: "naver_blog", handle: "platform-move.blog" },
      );
      assert.equal(registered.audience_counts.naver_blog, undefined);
      assert.notEqual(registered.max_audience_count, 345);
    });

    await t.test("clears a self-report when its approval is revoked", async () => {
      await insertVerification(db, {
        handle: "revoked.blog",
        value: 777,
        createdAt: "2026-08-07T02:30:00Z",
      });

      await db.query(
        `update public.verification_requests
         set status = 'rejected', updated_at = now()
         where platform_handle = 'revoked.blog'`,
      );

      const revokedChannel = (
        await db.query<{
          follower_count: number | null;
          followers_label: string;
          performance_label: string;
          follower_count_synced_at: Date | null;
          follower_sync_status: string;
          follower_sync_source: string;
          follower_sync_metadata: Record<string, unknown>;
        }>(
          `select follower_count,
                  followers_label,
                  performance_label,
                  follower_count_synced_at,
                  follower_sync_status,
                  follower_sync_source,
                  follower_sync_metadata
           from public.marketplace_influencer_channels
           where handle = 'revoked.blog'`,
        )
      ).rows[0];

      assert.deepEqual(
        {
          follower_count: revokedChannel.follower_count,
          followers_label: revokedChannel.followers_label,
          performance_label: revokedChannel.performance_label,
          follower_count_synced_at: revokedChannel.follower_count_synced_at,
          follower_sync_status: revokedChannel.follower_sync_status,
          follower_sync_source: revokedChannel.follower_sync_source,
          approvalRevoked:
            revokedChannel.follower_sync_metadata.approval_revoked,
        },
        {
          follower_count: null,
          followers_label: "계정 연동",
          performance_label: "자가신고 미입력",
          follower_count_synced_at: null,
          follower_sync_status: "skipped",
          follower_sync_source: "creator_self_report_required",
          approvalRevoked: true,
        },
      );
    });

    await t.test("requires the exact owner in every Naver projection", async () => {
      const requestId = await insertVerification(db, {
        handle: "owner-bound.blog",
        value: 246,
        createdAt: "2026-08-07T02:40:00Z",
      });

      const authority = (
        await db.query<{ matching_owner: boolean; other_owner: boolean }>(
          `select
             directsign_private.directsign_naver_self_report_request_is_authoritative(
               $1::uuid,
               $2::uuid,
               'owner-bound.blog',
               246,
               '2026-08-07T02:40:00Z'::timestamptz
             ) as matching_owner,
             directsign_private.directsign_naver_self_report_request_is_authoritative(
               $1::uuid,
               $3::uuid,
               'owner-bound.blog',
               246,
               '2026-08-07T02:40:00Z'::timestamptz
             ) as other_owner`,
          [requestId, ownerId, otherOwnerId],
        )
      ).rows[0];
      assert.deepEqual(authority, {
        matching_owner: true,
        other_owner: false,
      });

      await db.query(
        `update public.marketplace_registered_influencer_directory
         set verified_channels = '[
           {"platform":"naver_blog","handle":"owner-bound.blog","follower_count":999}
         ]'
         where owner_profile_id = $1`,
        [ownerId],
      );
      await db.query(
        `update public.marketplace_registered_influencer_directory
         set owner_profile_id = $1
         where owner_profile_id = $2`,
        [otherOwnerId, ownerId],
      );
      const reboundChannel = (
        await db.query<{ verified_channels: Array<Record<string, unknown>> }>(
          `select verified_channels
           from public.marketplace_registered_influencer_directory
           where owner_profile_id = $1`,
          [otherOwnerId],
        )
      ).rows[0].verified_channels[0];
      assert.deepEqual(reboundChannel, {
        platform: "naver_blog",
        handle: "owner-bound.blog",
      });

      await db.query(
        `update public.marketplace_registered_influencer_directory
         set owner_profile_id = $1
         where owner_profile_id = $2`,
        [ownerId, otherOwnerId],
      );
    });

    await t.test("clears a metric when its approved typed value is changed", async () => {
      const requestId = await insertVerification(db, {
        handle: "typed-tamper.blog",
        value: 777,
        createdAt: "2026-08-07T02:50:00Z",
      });

      await db.query(
        `update public.verification_requests
         set naver_blog_recent_4d_average_visitors = 778,
             updated_at = now()
         where id = $1`,
        [requestId],
      );

      const channel = (
        await db.query<{
          follower_count: number | null;
          follower_sync_source: string;
          follower_sync_metadata: Record<string, unknown>;
        }>(
          `select follower_count, follower_sync_source, follower_sync_metadata
           from public.marketplace_influencer_channels
           where handle = 'typed-tamper.blog'`,
        )
      ).rows[0];
      assert.equal(channel.follower_count, null);
      assert.equal(channel.follower_sync_source, "creator_self_report_required");
      assert.equal(channel.follower_sync_metadata.approval_revoked, true);
    });

    await t.test("clears a metric when approved evidence becomes test-marked", async () => {
      const requestId = await insertVerification(db, {
        handle: "evidence-tamper.blog",
        value: 888,
        createdAt: "2026-08-07T02:55:00Z",
      });

      await db.query(
        `update public.verification_requests
         set evidence_snapshot_json = evidence_snapshot_json || '{"qa":true}'::jsonb,
             updated_at = now()
         where id = $1`,
        [requestId],
      );

      const channel = (
        await db.query<{
          follower_count: number | null;
          follower_sync_source: string;
          follower_sync_metadata: Record<string, unknown>;
        }>(
          `select follower_count, follower_sync_source, follower_sync_metadata
           from public.marketplace_influencer_channels
           where handle = 'evidence-tamper.blog'`,
        )
      ).rows[0];
      assert.equal(channel.follower_count, null);
      assert.equal(channel.follower_sync_source, "creator_self_report_required");
      assert.equal(channel.follower_sync_metadata.approval_revoked, true);
    });

    await t.test("excludes pending, rejected, and QA requests", async () => {
      await db.query(
        `
          insert into public.marketplace_influencer_channels (
            profile_id,
            platform,
            label,
            handle,
            follower_count,
            follower_count_synced_at,
            follower_sync_status,
            follower_sync_source
          ) values
            ($1, 'naver_blog', 'Naver Blog', 'pending.blog', 7,
             '2026-08-01T00:00:00Z', 'synced', 'creator_self_report'),
            ($1, 'naver_blog', 'Naver Blog', 'rejected.blog', 8,
             '2026-08-01T00:00:00Z', 'synced', 'creator_self_report'),
            ($1, 'naver_blog', 'Naver Blog', 'qa.blog', 9,
             '2026-08-01T00:00:00Z', 'synced', 'creator_self_report')
        `,
        [marketplaceProfileId],
      );

      await insertVerification(db, {
        handle: "pending.blog",
        value: 111,
        createdAt: "2026-08-07T03:00:00Z",
        status: "pending",
      });
      await insertVerification(db, {
        handle: "rejected.blog",
        value: 222,
        createdAt: "2026-08-07T03:01:00Z",
        status: "rejected",
      });
      await insertVerification(db, {
        handle: "qa.blog",
        value: 333,
        createdAt: "2026-08-07T03:02:00Z",
        dataOrigin: "qa",
      });

      const rows = (
        await db.query<{
          handle: string;
          follower_count: number | null;
          follower_sync_source: string;
        }>(
          `select handle, follower_count, follower_sync_source
           from public.marketplace_influencer_channels
           where handle in ('pending.blog', 'rejected.blog', 'qa.blog')
           order by handle`,
        )
      ).rows;
      assert.deepEqual(rows, [
        {
          handle: "pending.blog",
          follower_count: null,
          follower_sync_source: "creator_self_report_required",
        },
        {
          handle: "qa.blog",
          follower_count: null,
          follower_sync_source: "creator_self_report_required",
        },
        {
          handle: "rejected.blog",
          follower_count: null,
          follower_sync_source: "creator_self_report_required",
        },
      ]);
    });

    await t.test("rejects a profile and target owner mismatch", async () => {
      await assert.rejects(
        insertVerification(db, {
          handle: "mismatch.blog",
          value: 55,
          createdAt: "2026-08-07T04:00:00Z",
          profileId: otherOwnerId,
          targetId: ownerId,
        }),
        /platform verification owner binding mismatch/,
      );

      const count = (
        await db.query<{ count: number }>(
          `select count(*)::integer as count
           from public.verification_requests
           where platform_handle = 'mismatch.blog'`,
        )
      ).rows[0].count;
      assert.equal(count, 0);
    });

    await t.test("does not overwrite a newer canonical metric", async () => {
      await insertVerification(db, {
        handle: "stale.blog",
        value: 9999,
        createdAt: "2026-08-10T00:00:00Z",
      });
      await insertVerification(db, {
        handle: "stale.blog",
        value: 444,
        createdAt: "2026-08-07T05:00:00Z",
      });

      const staleChannel = (
        await db.query<{
          follower_count: number;
          follower_count_synced_at: Date;
          follower_sync_source: string;
        }>(
          `select follower_count,
                  follower_count_synced_at,
                  follower_sync_source
           from public.marketplace_influencer_channels
           where handle = 'stale.blog'`,
        )
      ).rows[0];
      assert.equal(staleChannel.follower_count, 9999);
      assert.equal(
        staleChannel.follower_count_synced_at.toISOString(),
        "2026-08-10T00:00:00.000Z",
      );
      assert.equal(staleChannel.follower_sync_source, "creator_self_report");
    });

    await t.test("keeps legacy missing reports channel-only", async () => {
      await insertVerification(db, {
        handle: "legacy-existing.blog",
        value: 321,
        createdAt: "2026-08-06T00:00:00Z",
      });

      await insertVerification(db, {
        handle: "legacy-missing.blog",
        value: null,
        createdAt: "2026-08-07T06:00:00Z",
        includeEvidence: false,
      });
      await insertVerification(db, {
        handle: "legacy-existing.blog",
        value: null,
        createdAt: "2026-08-07T06:01:00Z",
        includeEvidence: false,
      });

      const rows = (
        await db.query<{
          handle: string;
          follower_count: number | null;
          follower_sync_source: string | null;
        }>(
          `select handle, follower_count, follower_sync_source
           from public.marketplace_influencer_channels
           where handle in ('legacy-missing.blog', 'legacy-existing.blog')
           order by handle`,
        )
      ).rows;
      assert.deepEqual(rows, [
        {
          handle: "legacy-existing.blog",
          follower_count: 321,
          follower_sync_source: "creator_self_report",
        },
        {
          handle: "legacy-missing.blog",
          follower_count: null,
          follower_sync_source: "creator_self_report_required",
        },
      ]);
    });

    await t.test("keeps Naver visitors out of audience sorting", async () => {
      await db.query(
        `
          update public.marketplace_registered_influencer_directory
          set
            platforms = array['naver_blog', 'instagram'],
            verified_channels = '[
              {"platform":"naver_blog","handle":"value.blog","follower_count":999999},
              {"platform":"instagram","handle":"insta","follower_count":5000}
            ]',
            audience_counts = '{"naver_blog":1234,"instagram":5000}',
            max_audience_count = 999999
          where owner_profile_id = $1
        `,
        [ownerId],
      );

      const registered = (
        await db.query<{
          verified_channels: Array<Record<string, unknown>>;
          audience_counts: Record<string, number>;
          max_audience_count: number;
        }>(
          `select verified_channels, audience_counts, max_audience_count
           from public.marketplace_registered_influencer_directory
           where owner_profile_id = $1`,
          [ownerId],
        )
      ).rows[0];
      assert.deepEqual(registered.audience_counts, { instagram: 5000 });
      assert.equal(registered.max_audience_count, 5000);
      assert.deepEqual(registered.verified_channels[0], {
        platform: "naver_blog",
        handle: "value.blog",
        follower_count: 1234,
        metric_type: "average_daily_visitors_4d",
        metric_source: "creator_self_report",
        metric_trust: "self_reported",
        metric_period_days: 4,
      });

      await db.query(
        `
          update public.marketplace_public_influencer_directory
          set
            platforms = array['naver_blog', 'instagram'],
            audience_counts = '{"naver_blog":1234,"instagram":5000}',
            max_audience_count = 999999
          where listing_key = 'registered:legacy'
        `,
      );
      const publicDirectory = (
        await db.query<{
          audience_counts: Record<string, number>;
          max_audience_count: number;
        }>(
          `select audience_counts, max_audience_count
           from public.marketplace_public_influencer_directory
           where listing_key = 'registered:legacy'`,
        )
      ).rows[0];
      assert.deepEqual(publicDirectory, {
        audience_counts: { instagram: 5000 },
        max_audience_count: 5000,
      });
    });
  } finally {
    await db.close();
  }
});
