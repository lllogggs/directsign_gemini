import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  formatCampaignEligibilityRules,
  normalizeCampaignEligibilityRules,
  validateCampaignEligibilityRules,
} from "../src/domain/campaignEligibility.js";
import {
  calculateNaverBlogVisitorAverage,
  fetchNaverBlogVisitorMetric,
  getNaverBlogVisitorTargetDates,
  parseNaverBlogVisitorCounts,
} from "../server/naver-blog-visitor-metric.js";
import {
  checkNaverInfluencerProfileConnection,
  hasExactNaverInfluencerBlogConnection,
  normalizeNaverBlogIdentity,
  normalizeNaverInfluencerProfile,
  normalizeNaverInfluencerProfileUrl,
} from "../server/naver-influencer-credential.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const eligibilityMigration = readFileSync(
  join(
    root,
    "supabase/migrations/20260811120000_add_campaign_eligibility_rules.sql",
  ),
  "utf8",
);

const eligibilityFixtureSql = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;
  create function auth.role()
  returns text
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.role', true), '');
  $$;

  create table public.organizations (id uuid primary key);
  create table public.profiles (
    id uuid primary key,
    role text not null,
    email text not null,
    data_origin text not null default 'production'
  );
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
    archived_at timestamptz,
    updated_at timestamptz not null default now()
  );
  create table public.marketplace_campaigns (
    id text primary key,
    brand_profile_id uuid not null,
    organization_id uuid not null,
    campaign_data jsonb not null default '{}'::jsonb,
    status text not null default 'open',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
  );
  create table public.marketplace_contact_proposals (
    id uuid primary key,
    direction text not null,
    campaign_id text,
    target_brand_profile_id uuid,
    sender_profile_id uuid,
    campaign_snapshot jsonb,
    data_origin text not null default 'production',
    submitted_actor_proof_at timestamptz,
    status text not null default 'submitted'
  );
  create table public.verification_requests (
    id uuid primary key,
    profile_id uuid not null references public.profiles (id),
    target_type text not null,
    verification_type text not null,
    status text not null,
    reviewed_at timestamptz,
    platform text,
    platform_handle text,
    platform_url text,
    data_origin text
  );
`;

test("campaign eligibility accepts only supported platform metric pairs", () => {
  const valid = validateCampaignEligibilityRules(
    [
      { platform: "instagram", metric: "followers", minimum: 1_000 },
      { platform: "youtube", metric: "subscribers", minimum: 500 },
      {
        platform: "naver_blog",
        metric: "average_daily_visitors_4d",
        minimum: 100,
      },
    ],
    ["instagram", "youtube", "naver_blog"],
  );
  assert.equal(valid.ok, true);
  assert.equal(
    valid.ok ? formatCampaignEligibilityRules(valid.rules) : "",
    "인스타그램 팔로워 1,000명 이상 · 유튜브 구독자 500명 이상 · 네이버 블로그 최근 4일 일평균 방문자 100명 이상",
  );

  const tiktok = validateCampaignEligibilityRules(
    [{ platform: "tiktok", metric: "followers", minimum: 1_000 }],
    ["tiktok"],
  );
  assert.equal(tiktok.ok, false);

  const mismatchedPlatform = validateCampaignEligibilityRules(
    [{ platform: "instagram", metric: "followers", minimum: 1_000 }],
    ["youtube"],
  );
  assert.equal(mismatchedPlatform.ok, false);

  const stringMinimum = validateCampaignEligibilityRules(
    [{ platform: "instagram", metric: "followers", minimum: "1000" }],
    ["instagram"],
  );
  assert.equal(stringMinimum.ok, false);
});

test("campaign eligibility normalization never invents defaults", () => {
  assert.deepEqual(normalizeCampaignEligibilityRules(undefined), []);
  assert.deepEqual(
    normalizeCampaignEligibilityRules([
      { platform: "instagram", metric: "followers", minimum: 0 },
      { platform: "youtube", metric: "followers", minimum: 100 },
    ]),
    [],
  );
});

test("Naver Influencer condition is mutually exclusive with visitor count", () => {
  const influencer = validateCampaignEligibilityRules(
    [{ platform: "naver_blog", metric: "naver_influencer" }],
    ["naver_blog"],
  );
  assert.equal(influencer.ok, true);
  assert.equal(
    influencer.ok ? formatCampaignEligibilityRules(influencer.rules) : "",
    "네이버 인플루언서",
  );

  const inventedMinimum = validateCampaignEligibilityRules(
    [{ platform: "naver_blog", metric: "naver_influencer", minimum: 1 }],
    ["naver_blog"],
  );
  assert.equal(inventedMinimum.ok, false);

  const duplicateNaverModes = validateCampaignEligibilityRules(
    [
      { platform: "naver_blog", metric: "naver_influencer" },
      {
        platform: "naver_blog",
        metric: "average_daily_visitors_4d",
        minimum: 100,
      },
    ],
    ["naver_blog"],
  );
  assert.equal(duplicateNaverModes.ok, false);
});

test("Naver Influencer profile check distinguishes mismatch from technical uncertainty", async () => {
  const connectedState = JSON.stringify({
    ROOT_QUERY: {
      'dataSourceMap({"input":{"influencerName":"creator"}})': {
        dataSourceMap: {
          profile: {
            channelInfo: [
              {
                ctype: "activeChannels",
                items: [
                  {
                    serviceType: "NBLOG",
                    serviceId: "creator_blog",
                    status: "ENABLED",
                    providerStatus: "CONNECTED",
                    url: "https://blog.naver.com/creator_blog",
                  },
                ],
              },
            ],
          },
        },
      },
    },
  });
  const html = `<script>window.__APOLLO_STATE__ = ${connectedState};window.__REACT_QUERY_STATE__ = {};</script>`;

  assert.deepEqual(normalizeNaverInfluencerProfile("https://in.naver.com/Creator"), {
    profileId: "creator",
    profileUrl: "https://in.naver.com/creator",
  });
  assert.equal(normalizeNaverBlogIdentity("https://blog.naver.com/creator_blog"), "creator_blog");
  assert.equal(
    normalizeNaverInfluencerProfile("https://in.naver.com.evil.test/creator"),
    undefined,
  );
  assert.equal(normalizeNaverInfluencerProfileUrl("creator"), undefined);
  assert.deepEqual(
    normalizeNaverInfluencerProfileUrl("https://in.naver.com/Creator"),
    {
      profileId: "creator",
      profileUrl: "https://in.naver.com/creator",
    },
  );
  assert.equal(hasExactNaverInfluencerBlogConnection(html, "creator_blog"), true);
  assert.equal(hasExactNaverInfluencerBlogConnection(html, "other_blog"), false);

  const verified = await checkNaverInfluencerProfileConnection(
    "creator",
    "creator_blog",
    {
      now: new Date("2026-08-11T03:00:00.000Z"),
      fetchImpl: async (input, init) => {
        assert.equal(String(input), "https://in.naver.com/creator");
        assert.equal(init?.redirect, "manual");
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  );
  assert.equal(verified?.status, "verified");

  const changedMarkup = await checkNaverInfluencerProfileConnection(
    "creator",
    "creator_blog",
    {
      fetchImpl: async () =>
        new Response("<html>temporary page</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    },
  );
  assert.equal(changedMarkup?.status, "unavailable");

  const explicitMismatch = await checkNaverInfluencerProfileConnection(
    "creator",
    "other_blog",
    {
      fetchImpl: async () =>
        new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    },
  );
  assert.equal(explicitMismatch?.status, "not_linked");
});

test("Naver visitor metric uses the previous four completed KST days", () => {
  const now = new Date("2026-08-11T03:00:00.000Z");
  const targetDates = getNaverBlogVisitorTargetDates(now);
  assert.deepEqual(targetDates, ["20260810", "20260809", "20260808", "20260807"]);
  const counts = parseNaverBlogVisitorCounts(
    [
      '<visitorcnt id="20260810" cnt="80"/>',
      '<visitorcnt id="20260809" cnt="100"/>',
      '<visitorcnt id="20260808" cnt="120"/>',
      '<visitorcnt id="20260807" cnt="140"/>',
      '<visitorcnt id="20260806" cnt="999"/>',
    ].join(""),
  );
  assert.equal(calculateNaverBlogVisitorAverage(counts, targetDates), 110);
});

test("Naver visitor fetch is fixed-host, bounded input, and returns no daily payload", async () => {
  let requestedUrl = "";
  const result = await fetchNaverBlogVisitorMetric("creator_blog", {
    now: new Date("2026-08-11T03:00:00.000Z"),
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(
        [
          '<visitorcnt id="20260810" cnt="80"/>',
          '<visitorcnt id="20260809" cnt="100"/>',
          '<visitorcnt id="20260808" cnt="120"/>',
          '<visitorcnt id="20260807" cnt="140"/>',
        ].join(""),
        { status: 200, headers: { "Content-Type": "application/xml" } },
      );
    },
  });
  assert.match(
    requestedUrl,
    /^https:\/\/blog\.naver\.com\/NVisitorgp4Ajax\.nhn\?blogId=creator_blog$/,
  );
  assert.deepEqual(result, {
    status: "available",
    averageDailyVisitors4d: 110,
    checkedAt: "2026-08-11T03:00:00.000Z",
  });
  assert.equal("counts" in result, false);
});

test("Naver counter without completed-day values is a soft private state", async () => {
  const result = await fetchNaverBlogVisitorMetric("creator_blog", {
    now: new Date("2026-08-11T03:00:00.000Z"),
    fetchImpl: async () => new Response("<result />", { status: 200 }),
  });
  assert.deepEqual(result, {
    status: "counter_private",
    checkedAt: "2026-08-11T03:00:00.000Z",
  });
});

test("Naver application cache stores only the approved-account reference, average, and check time", () => {
  const tableDefinition = eligibilityMigration.slice(
    eligibilityMigration.indexOf(
      "create table if not exists directsign_private.campaign_naver_application_metrics",
    ),
    eligibilityMigration.indexOf(
      "alter table directsign_private.campaign_naver_application_metrics enable row level security",
    ),
  );

  assert.match(tableDefinition, /verification_request_id uuid primary key/);
  assert.match(tableDefinition, /average_daily_visitors_4d bigint not null/);
  assert.match(tableDefinition, /checked_at timestamptz not null/);
  assert.doesNotMatch(tableDefinition, /profile_id|data_origin|created_at|updated_at/);
  assert.match(
    eligibilityMigration,
    /force row level security[\s\S]+revoke all on table directsign_private\.campaign_naver_application_metrics[\s\S]+from public, anon, authenticated/,
  );
  assert.match(
    eligibilityMigration,
    /checked_at < [^;]+ - interval '30 days'/,
  );
  assert.match(
    eligibilityMigration,
    /p_campaign_data -> 'platforms' \? \(item\.rule ->> 'platform'\)/,
  );
});

test("campaign eligibility and the private Naver cache are enforced in Postgres", async () => {
  const db = new PGlite();
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const brandId = "22222222-2222-4222-8222-222222222222";
  const influencerId = "33333333-3333-4333-8333-333333333333";
  const verificationRequestId = "44444444-4444-4444-8444-444444444444";
  try {
    await db.exec(eligibilityFixtureSql);
    await db.exec(eligibilityMigration);
    await db.exec(`set "request.jwt.claim.role" = 'service_role'`);
    await db.query("insert into public.organizations (id) values ($1)", [
      organizationId,
    ]);
    await db.query(
      `insert into public.marketplace_brand_profiles (id, organization_id)
       values ($1, $2)`,
      [brandId, organizationId],
    );
    await db.query(
      `insert into public.profiles (id, role, email, data_origin)
       values ($1, 'influencer', 'creator@example.test', 'production')`,
      [influencerId],
    );
    await db.query(
      `insert into public.verification_requests (
         id, profile_id, target_type, verification_type, status,
         reviewed_at, platform, platform_handle, platform_url, data_origin
       ) values ($1, $2, 'influencer_account', 'platform_account', 'approved',
         now(), 'naver_blog', 'creator_blog',
         'https://blog.naver.com/creator_blog', 'production')`,
      [verificationRequestId, influencerId],
    );

    await db.query(
      `insert into public.marketplace_campaigns (
         id, brand_profile_id, organization_id, campaign_data
       ) values ('valid', $1, $2, $3)`,
      [
        brandId,
        organizationId,
        JSON.stringify({
          platforms: ["naver_blog"],
          eligibilityRules: [
            {
              platform: "naver_blog",
              metric: "average_daily_visitors_4d",
              minimum: 100,
            },
          ],
        }),
      ],
    );
    await assert.rejects(
      db.query(
        `insert into public.marketplace_campaigns (
           id, brand_profile_id, organization_id, campaign_data
         ) values ('invalid', $1, $2, $3)`,
        [
          brandId,
          organizationId,
          JSON.stringify({
            platforms: ["youtube"],
            eligibilityRules: [
              {
                platform: "naver_blog",
                metric: "average_daily_visitors_4d",
                minimum: 100,
              },
            ],
          }),
        ],
      ),
      /marketplace_campaigns_eligibility_rules_valid/,
    );

    const checkedAt = new Date().toISOString();
    await db.query(
      `select public.upsert_campaign_naver_application_metric($1, $2, $3, $4, $5)`,
      [influencerId, verificationRequestId, "production", 123, checkedAt],
    );
    const fresh = await db.query<{
      average_daily_visitors_4d: bigint;
      checked_at: Date;
    }>(
      `select * from public.get_campaign_naver_application_metric($1, $2, $3)`,
      [influencerId, verificationRequestId, "production"],
    );
    assert.equal(Number(fresh.rows[0]?.average_daily_visitors_4d), 123);

    await db.query(
      `select public.upsert_naver_influencer_self_attestation($1, $2, $3, $4, $5, $6)`,
      [
        influencerId,
        verificationRequestId,
        "production",
        "creator",
        "2026-08-13.1",
        checkedAt,
      ],
    );
    const selfState = await db.query<{
      self_profile_id: string;
      self_attested_at: Date;
      self_expires_at: Date;
      automatic_profile_id: string | null;
    }>(
      `select * from public.get_naver_influencer_eligibility_state($1, $2, $3)`,
      [influencerId, verificationRequestId, "production"],
    );
    assert.equal(selfState.rows[0]?.self_profile_id, "creator");
    assert.equal(selfState.rows[0]?.automatic_profile_id, null);
    assert.equal(
      selfState.rows[0]?.self_expires_at.getTime() -
        selfState.rows[0]?.self_attested_at.getTime(),
      365 * 24 * 60 * 60 * 1000,
    );
    const selfBadges = await db.query<{ blog_id: string }>(
      `select * from public.get_active_naver_influencer_badges($1)`,
      [["creator_blog"]],
    );
    assert.deepEqual(selfBadges.rows, []);

    await db.query(
      `select public.upsert_naver_influencer_qualification($1, $2, $3, $4, $5)`,
      [influencerId, verificationRequestId, "production", "creator", checkedAt],
    );
    const automaticState = await db.query<{
      automatic_profile_id: string;
      self_profile_id: string | null;
    }>(
      `select * from public.get_naver_influencer_eligibility_state($1, $2, $3)`,
      [influencerId, verificationRequestId, "production"],
    );
    assert.equal(automaticState.rows[0]?.automatic_profile_id, "creator");
    assert.equal(automaticState.rows[0]?.self_profile_id, null);
    const automaticBadges = await db.query<{ blog_id: string }>(
      `select * from public.get_active_naver_influencer_badges($1)`,
      [["creator_blog"]],
    );
    assert.deepEqual(automaticBadges.rows, [{ blog_id: "creator_blog" }]);

    const campaignRevision = "2026-08-11T03:00:00.000Z";
    const influencerCampaignData = {
      platforms: ["naver_blog"],
      eligibilityRules: [
        { platform: "naver_blog", metric: "naver_influencer" },
      ],
    };
    await db.query(
      `insert into public.marketplace_campaigns (
         id, brand_profile_id, organization_id, campaign_data
       ) values ('influencer-condition', $1, $2, $3)`,
      [brandId, organizationId, JSON.stringify(influencerCampaignData)],
    );
    const campaignSnapshot = {
      ...influencerCampaignData,
      campaignRevision,
    };
    await assert.rejects(
      db.query(
        `insert into public.marketplace_contact_proposals (
           id, direction, campaign_id, target_brand_profile_id,
           sender_profile_id, campaign_snapshot, data_origin,
           submitted_actor_proof_at
         ) values (
           '55555555-5555-4555-8555-555555555555',
           'influencer_to_brand', 'influencer-condition', $1, $2, $3,
           'production', now()
         )`,
        [brandId, influencerId, JSON.stringify(campaignSnapshot)],
      ),
      /marketplace_contact_proposals_eligibility_snapshot_valid/,
    );
    const decisionAt = "2026-08-11T03:00:01.000Z";
    const eligibilitySnapshot = {
      version: "2026-08-11.3",
      actorProfileId: influencerId,
      campaignId: "influencer-condition",
      campaignRevision,
      decisionAt,
      items: [
        {
          platform: "naver_blog",
          metric: "naver_influencer",
          verificationRequestId,
          evidenceType: "auto_verified",
          profileUrl: "https://in.naver.com/creator",
          evidenceAt: checkedAt,
          decisionAt,
        },
      ],
    };
    await db.query(
      `insert into public.marketplace_contact_proposals (
         id, direction, campaign_id, target_brand_profile_id,
         sender_profile_id, campaign_snapshot, application_eligibility_snapshot,
         data_origin, submitted_actor_proof_at
       ) values (
         '66666666-6666-4666-8666-666666666666',
         'influencer_to_brand', 'influencer-condition', $1, $2, $3, $4,
         'production', now()
       )`,
      [
        brandId,
        influencerId,
        JSON.stringify(campaignSnapshot),
        JSON.stringify(eligibilitySnapshot),
      ],
    );
    await assert.rejects(
      db.query(
        `update public.marketplace_contact_proposals
         set application_eligibility_snapshot = null
         where id = '66666666-6666-4666-8666-666666666666'`,
      ),
      /application eligibility snapshot is immutable/,
    );

    const instagramCampaignSnapshot = {
      platforms: ["instagram"],
      eligibilityRules: [
        { platform: "instagram", metric: "followers", minimum: 1_000 },
      ],
      campaignRevision,
    };
    await db.query(
      `insert into public.marketplace_campaigns (
         id, brand_profile_id, organization_id, campaign_data
       ) values ('instagram-condition', $1, $2, $3)`,
      [brandId, organizationId, JSON.stringify(instagramCampaignSnapshot)],
    );
    const instagramEligibilitySnapshot = {
      version: "2026-08-11.3",
      actorProfileId: influencerId,
      campaignId: "instagram-condition",
      campaignRevision,
      decisionAt,
      items: [
        {
          platform: "instagram",
          metric: "follower_count",
          verificationRequestId: "77777777-7777-4777-8777-777777777777",
          count: 1_500,
          minimum: 1_000,
          source: "instagram_user_profile_api",
          evidenceAt: checkedAt,
          decisionAt,
          accountHandle: "creator.one",
          accountUrl: "https://www.instagram.com/creator.one/",
        },
      ],
    };
    await db.query(
      `insert into public.marketplace_contact_proposals (
         id, direction, campaign_id, target_brand_profile_id,
         sender_profile_id, campaign_snapshot, application_eligibility_snapshot,
         data_origin, submitted_actor_proof_at
       ) values (
         '88888888-8888-4888-8888-888888888888',
         'influencer_to_brand', 'instagram-condition', $1, $2, $3, $4,
         'production', now()
       )`,
      [
        brandId,
        influencerId,
        JSON.stringify(instagramCampaignSnapshot),
        JSON.stringify(instagramEligibilitySnapshot),
      ],
    );
    await assert.rejects(
      db.query(
        `insert into public.marketplace_contact_proposals (
           id, direction, campaign_id, target_brand_profile_id,
           sender_profile_id, campaign_snapshot, application_eligibility_snapshot,
           data_origin, submitted_actor_proof_at
         ) values (
           '99999999-9999-4999-8999-999999999999',
           'influencer_to_brand', 'instagram-condition', $1, $2, $3, $4,
           'production', now()
         )`,
        [
          brandId,
          influencerId,
          JSON.stringify(instagramCampaignSnapshot),
          JSON.stringify({
            ...instagramEligibilitySnapshot,
            items: [
              {
                ...instagramEligibilitySnapshot.items[0],
                count: 999,
              },
            ],
          }),
        ],
      ),
      /marketplace_contact_proposals_eligibility_snapshot_valid/,
    );
    await assert.rejects(
      db.query(
        `insert into public.marketplace_contact_proposals (
           id, direction, campaign_id, target_brand_profile_id,
           sender_profile_id, campaign_snapshot, application_eligibility_snapshot,
           data_origin, submitted_actor_proof_at
         ) values (
           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
           'influencer_to_brand', 'instagram-condition', $1, $2, $3, $4,
           'production', now()
         )`,
        [
          brandId,
          influencerId,
          JSON.stringify(instagramCampaignSnapshot),
          JSON.stringify({
            ...instagramEligibilitySnapshot,
            items: [
              {
                ...instagramEligibilitySnapshot.items[0],
                accountUrl: "https://example.com/creator.one",
              },
            ],
          }),
        ],
      ),
      /marketplace_contact_proposals_eligibility_snapshot_valid/,
    );

    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'directsign_private'
         and table_name = 'campaign_naver_application_metrics'
       order by ordinal_position`,
    );
    assert.deepEqual(
      columns.rows.map((row) => row.column_name),
      ["verification_request_id", "average_daily_visitors_4d", "checked_at"],
    );

    await db.exec(`set "request.jwt.claim.role" = 'authenticated'`);
    await assert.rejects(
      db.query(
        `select * from public.get_campaign_naver_application_metric($1, $2, $3)`,
        [influencerId, verificationRequestId, "production"],
      ),
      /service role required/,
    );
  } finally {
    await db.close();
  }
});

test("application checks reuse trusted Instagram metrics, refresh YouTube, and keep conditions out of cards", () => {
  const server = readFileSync(join(root, "server/index.ts"), "utf8");
  const campaignPages = readFileSync(
    join(root, "src/pages/marketplace/CampaignPages.tsx"),
    "utf8",
  );
  const evaluator = server.slice(
    server.indexOf("const evaluateCampaignEligibilityRule = async"),
    server.indexOf("const hasApprovedInfluencerPlatformVerification = async"),
  );
  const desktopCard = campaignPages.slice(
    campaignPages.indexOf("function CampaignPostCard"),
    campaignPages.indexOf("function CampaignPlatformLogoMarks"),
  );

  assert.match(evaluator, /readTrustedInstagramFollowerMetricForRequest/);
  assert.doesNotMatch(evaluator, /await fetchInstagramFollowerSnapshot\(channel\)/);
  assert.match(evaluator, /fetchYoutubeFollowerSnapshot\(channel\)/);
  assert.match(evaluator, /source: metric\.source/);
  assert.match(evaluator, /source: "youtube_data_api"/);
  assert.ok(
    evaluator.indexOf("readFreshCampaignNaverMetric") <
      evaluator.indexOf("fetchCampaignNaverMetricSingleFlight"),
  );
  assert.match(evaluator, /buildCampaignEligibilityNotMet\(rule\)/);
  assert.match(server, /code: "condition_not_met"/);
  assert.match(evaluator, /code: "metric_unavailable"/);
  assert.match(evaluator, /code: "naver_counter_private"/);
  assert.doesNotMatch(desktopCard, /eligibilityRules|지원 조건/);
  assert.match(campaignPages, /최신 수치 확인/);
  assert.match(campaignPages, /신청 전에 팔로워 수 확인이 필요합니다/);
  assert.match(
    campaignPages,
    /rule\.platform === "instagram" && rule\.metric === "followers"/,
  );
  assert.doesNotMatch(campaignPages, /rule\.metric === "follower_count"/);
  assert.match(campaignPages, /신청할 때 공식 API 최신값을 확인합니다/);
  assert.match(
    campaignPages,
    /방문자 수 카운터를 공개하면 자동 확인 후 신청할 수 있습니다|방문자 수 카운터를 공개하면 신청할 때 자동으로 확인됩니다/,
  );
  assert.match(campaignPages, /eligibilityAccountIds/);
});
