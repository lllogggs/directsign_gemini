import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  fetchInstagramBusinessFollowerMetric,
  fetchInstagramReelPublicMetrics,
  normalizeInstagramReelUrl,
  readTrustedInstagramChannelFollowerMetric,
  readTrustedInstagramDmFollowerMetric,
  selectLatestInstagramFollowerMetric,
} from "../server/instagram-campaign-metrics.js";
import { isInstagramReelUrl } from "../src/domain/deliverables.js";

const requestId = "38a54dc6-273a-4f7c-a67b-3ca2cb633a97";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const instagramMetricMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260811130000_add_instagram_campaign_metrics.sql",
  ),
  "utf8",
);

test("DM 인증 응답의 정확한 계정 팔로워 수만 신뢰한다", () => {
  const metric = readTrustedInstagramDmFollowerMetric({
    id: requestId,
    status: "approved",
    data_origin: "production",
    platform_handle: "@creator.one",
    ownership_verification_method: "instagram_dm_code",
    evidence_snapshot_json: {
      ownership_verification: {
        instagram_dm: {
          state: "verified",
          verified_handle: "creator.one",
          follower_count: 1234,
          follower_count_checked_at: "2026-08-11T03:04:05.000Z",
          follower_count_source: "instagram_user_profile_api",
        },
      },
    },
  });
  assert.deepEqual(metric, {
    followerCount: 1234,
    checkedAt: "2026-08-11T03:04:05.000Z",
    source: "instagram_user_profile_api",
    verificationRequestId: requestId,
  });
  assert.equal(
    readTrustedInstagramDmFollowerMetric({
      id: requestId,
      status: "approved",
      data_origin: "production",
      platform_handle: "creator.two",
      ownership_verification_method: "instagram_dm_code",
      evidence_snapshot_json: {
        ownership_verification: {
          instagram_dm: {
            state: "verified",
            verified_handle: "creator.one",
            follower_count: 1234,
            follower_count_checked_at: "2026-08-11T03:04:05.000Z",
            follower_count_source: "instagram_user_profile_api",
          },
        },
      },
    }),
    undefined,
  );
});

test("새로고침 값은 인증 요청과 계정이 정확히 묶인 경우에만 신뢰한다", () => {
  const metric = readTrustedInstagramChannelFollowerMetric(
    {
      handle: "creator.one",
      follower_count: 1500,
      follower_count_synced_at: "2026-08-11T04:00:00.000Z",
      follower_sync_status: "synced",
      follower_sync_source: "instagram_graph_api",
      follower_sync_metadata: {
        request_id: requestId,
        verification_bound: true,
        checked_at: "2026-08-11T04:00:00.000Z",
      },
    },
    { id: requestId, platform_handle: "@creator.one" },
  );
  assert.equal(metric?.followerCount, 1500);
  assert.equal(
    readTrustedInstagramChannelFollowerMetric(
      {
        handle: "creator.one",
        follower_count: 1500,
        follower_count_synced_at: "2026-08-11T04:00:00.000Z",
        follower_sync_status: "synced",
        follower_sync_source: "instagram_graph_api",
        follower_sync_metadata: {
          request_id: "346e5cc2-e777-4639-a183-d356ed263d5f",
          verification_bound: true,
        },
      },
      { id: requestId, platform_handle: "creator.one" },
    ),
    undefined,
  );
  assert.equal(
    selectLatestInstagramFollowerMetric(
      {
        followerCount: 1234,
        checkedAt: "2026-08-11T03:00:00.000Z",
        source: "instagram_user_profile_api",
        verificationRequestId: requestId,
      },
      metric,
    )?.followerCount,
    1500,
  );
});

test("팔로워 새로고침은 토큰을 URL에 넣지 않고 응답 계정을 대조한다", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let authorization = "";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(
      JSON.stringify({
        business_discovery: {
          username: "creator.one",
          followers_count: 2048,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const result = await fetchInstagramBusinessFollowerMetric({
      accessToken: "server-secret-token",
      igUserId: "123",
      graphVersion: "v24.0",
      username: "creator.one",
    });
    assert.equal(result.status, "available");
    assert.equal(
      result.status === "available" ? result.followerCount : undefined,
      2048,
    );
    assert.equal(new URL(requestedUrl).searchParams.has("access_token"), false);
    assert.equal(authorization, "Bearer server-secret-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("정확한 릴스 링크만 정규화하고 공개 좋아요·댓글만 보강한다", async () => {
  assert.deepEqual(
    normalizeInstagramReelUrl(
      "https://www.instagram.com/reel/C0dEx_123/?utm_source=share",
    ),
    {
      shortcode: "C0dEx_123",
      url: "https://www.instagram.com/reel/C0dEx_123/",
    },
  );
  assert.equal(
    normalizeInstagramReelUrl("https://instagram.example/reel/C0dEx_123/"),
    undefined,
  );
  assert.equal(
    isInstagramReelUrl("https://www.instagram.com/reel/C0dEx_123/"),
    true,
  );
  assert.equal(
    isInstagramReelUrl("https://instagram.example/reel/C0dEx_123/"),
    false,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        business_discovery: {
          username: "creator.one",
          media: {
            data: [
              {
                permalink: "https://www.instagram.com/reel/C0dEx_123/",
                media_type: "VIDEO",
                media_product_type: "REELS",
                like_count: 321,
                comments_count: 12,
              },
            ],
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;
  try {
    const result = await fetchInstagramReelPublicMetrics({
      accessToken: "server-secret-token",
      igUserId: "123",
      graphVersion: "v24.0",
      username: "creator.one",
      reelUrl: "https://www.instagram.com/reel/C0dEx_123/",
    });
    assert.equal(result.status, "available");
    assert.equal(result.like_count, 321);
    assert.equal(result.comments_count, 12);
    assert.equal("views" in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("인스타그램 팔로워 새로고침은 DB에서도 승인된 DM 계정에만 묶인다", async () => {
  const db = new PGlite();
  const profileId = "11111111-1111-4111-8111-111111111111";
  const marketplaceProfileId = "22222222-2222-4222-8222-222222222222";
  const channelId = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(String.raw`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema directsign_private;

      create table public.verification_requests (
        id uuid primary key,
        profile_id uuid,
        target_id text,
        target_type text not null,
        verification_type text not null,
        platform text,
        status text not null,
        reviewed_at timestamptz,
        ownership_verification_method text,
        data_origin text,
        platform_handle text,
        evidence_snapshot_json jsonb not null default '{}'::jsonb
      );
      create table public.marketplace_influencer_profiles (
        id uuid primary key,
        owner_profile_id uuid not null,
        data_origin text not null
      );
      create table public.marketplace_influencer_channels (
        id uuid primary key,
        profile_id uuid not null,
        platform text not null,
        handle text not null,
        follower_count bigint,
        followers_label text,
        follower_count_synced_at timestamptz,
        follower_sync_status text not null default 'not_synced',
        follower_sync_source text,
        follower_sync_error text,
        follower_sync_metadata jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      );

      create function directsign_private.directsign_uuid_or_null(value text)
      returns uuid language plpgsql immutable as $$
      begin
        return value::uuid;
      exception when others then
        return null;
      end;
      $$;
      create function directsign_private.directsign_is_operational_profile(
        value uuid,
        expected_role text
      ) returns boolean language sql stable as $$
        select value is not null and expected_role = 'influencer';
      $$;
      create function directsign_private.directsign_format_marketplace_follower_count_label(
        value bigint
      ) returns text language sql immutable as $$
        select value::text;
      $$;
      create function directsign_private.directsign_refresh_registered_member_discovery(
        value uuid
      ) returns void language plpgsql as $$
      begin
        return;
      end;
      $$;
    `);
    await db.exec(instagramMetricMigration);
    await db.query(
      `insert into public.verification_requests (
         id, profile_id, target_id, target_type, verification_type, platform,
         status, reviewed_at, ownership_verification_method, data_origin,
         platform_handle, evidence_snapshot_json
       ) values ($1::uuid, $2::uuid, $2::uuid::text, 'influencer_account', 'platform_account',
         'instagram', 'approved', now(), 'instagram_dm_code', 'production',
         '@creator.one', $3)`,
      [
        requestId,
        profileId,
        JSON.stringify({
          ownership_verification: {
            instagram_dm: {
              state: "verified",
              verified_handle: "creator.one",
            },
          },
        }),
      ],
    );
    await db.query(
      `insert into public.marketplace_influencer_profiles
         (id, owner_profile_id, data_origin)
       values ($1, $2, 'production')`,
      [marketplaceProfileId, profileId],
    );
    await db.query(
      `insert into public.marketplace_influencer_channels
         (id, profile_id, platform, handle)
       values ($1, $2, 'instagram', '@creator.one')`,
      [channelId, marketplaceProfileId],
    );
    await db.exec(`set role service_role`);
    const updated = await db.query<{
      follower_count: string;
      source: string;
    }>(
      `select * from public.directsign_upsert_campaign_instagram_follower_metric(
         $1, $2, '@creator.one', 4321, now(),
         'instagram_graph_api'
       )`,
      [profileId, requestId],
    );
    assert.equal(Number(updated.rows[0]?.follower_count), 4321);
    assert.equal(updated.rows[0]?.source, "instagram_graph_api");
    await assert.rejects(
      db.query(
        `select * from public.directsign_upsert_campaign_instagram_follower_metric(
           $1, $2, 'another.creator', 999999,
           now(), 'instagram_graph_api'
         )`,
        [profileId, requestId],
      ),
      /Instagram identity does not match/,
    );
  } finally {
    await db.close();
  }
});
