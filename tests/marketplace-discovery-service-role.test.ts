import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const phaseOneUrl = new URL(
  "../supabase/migrations/20260811200000_add_server_marketplace_influencer_discovery.sql",
  import.meta.url,
);
const optimizationUrl = new URL(
  "../supabase/migrations/20260811203000_optimize_server_marketplace_influencer_discovery.sql",
  import.meta.url,
);
const cleanupUrl = new URL(
  "../supabase/migrations/20260811201000_remove_authenticated_marketplace_influencer_discovery.sql",
  import.meta.url,
);
const serverUrl = new URL("../server/index.ts", import.meta.url);

const rpcSignature =
  "public.list_server_marketplace_influencers(uuid,uuid,uuid,text,text,text[],text[],text,integer,integer,boolean)";
const oldRpcSignature =
  "public.list_authenticated_marketplace_influencers(uuid,text,text,text[],text[],text,integer,integer,boolean)";

const actorId = "10000000-0000-4000-8000-000000000001";
const seedActorId = "10000000-0000-4000-8000-000000000002";
const organizationId = "20000000-0000-4000-8000-000000000001";
const testOrganizationId = "20000000-0000-4000-8000-000000000002";

const setupDatabase = async (applyOptimization = true) => {
  const db = new PGlite();
  await db.exec(String.raw`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema directsign_private;

    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;

    create table auth.users (
      id uuid primary key,
      email text,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create table public.profiles (
      id uuid primary key references auth.users(id),
      role text not null,
      name text not null,
      email text not null,
      avatar_url text,
      data_origin text
    );
    create table public.organizations (
      id uuid primary key,
      name text not null,
      organization_type text not null,
      deleted_at timestamptz
    );
    create table public.organization_members (
      organization_id uuid not null references public.organizations(id),
      profile_id uuid not null references public.profiles(id),
      role text not null,
      primary key (organization_id, profile_id)
    );
    create table public.marketplace_influencer_profiles (
      id uuid primary key,
      owner_profile_id uuid
    );
    create table public.marketplace_registered_influencer_directory (
      owner_profile_id uuid primary key,
      registered_handle text not null,
      display_name text not null,
      avatar_url text,
      search_text text not null,
      category_keys text[] not null,
      creator_countries text[] not null,
      country_display_label text,
      platforms text[] not null,
      verified_channels jsonb not null,
      audience_counts jsonb not null,
      max_audience_count bigint,
      registered_member_visibility text not null,
      platform_verified boolean not null,
      public_marketplace_profile_id uuid not null,
      public_profile_published boolean not null,
      public_profile_handle text,
      source_updated_at timestamptz not null
    );
    create table public.discovered_influencer_profiles (
      id uuid primary key,
      platform text not null,
      platform_handle text not null
    );
    create table public.marketplace_public_influencer_directory (
      listing_key text primary key,
      source_type text not null,
      source_id uuid not null,
      public_handle text not null,
      display_name text not null,
      search_text text not null,
      category_keys text[] not null,
      audience_countries text[] not null,
      platforms text[] not null,
      audience_counts jsonb not null,
      max_audience_count bigint,
      source_updated_at timestamptz not null
    );
    create table public.advertiser_saved_influencers (
      organization_id uuid not null,
      influencer_public_handle text not null,
      created_at timestamptz not null default now()
    );

    create function directsign_private.directsign_has_test_marker(p_value text)
    returns boolean language sql immutable as $$
      select lower(coalesce(p_value, '')) ~ '(^|[^a-z0-9])(qa|test|demo|seed)([^a-z0-9]|$)'
    $$;
    create function directsign_private.directsign_is_operational_profile(
      p_profile_id uuid,
      p_expected_role text
    ) returns boolean language sql stable security definer set search_path = '' as $$
      select exists (
        select 1
        from public.profiles as profile
        join auth.users as auth_user on auth_user.id = profile.id
        where profile.id = p_profile_id
          and profile.role = p_expected_role
          and profile.data_origin = 'production'
          and profile.email !~* '(qa|test|demo|seed|example)'
          and auth_user.email !~* '(qa|test|demo|seed|example)'
          and not directsign_private.directsign_has_test_marker(profile.name)
      )
    $$;

    create function public.list_authenticated_marketplace_influencers(
      p_organization_id uuid,
      p_search text default null,
      p_platform text default null,
      p_categories text[] default '{}'::text[],
      p_countries text[] default '{}'::text[],
      p_sort text default 'audience_desc',
      p_page integer default 1,
      p_page_size integer default 100,
      p_saved_only boolean default false
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
    revoke all on function ${oldRpcSignature} from public, anon, authenticated;
    grant execute on function ${oldRpcSignature} to authenticated;

    insert into auth.users(id,email) values
      ('${actorId}','owner@brand.co'),
      ('${seedActorId}','seed-user@brand.co');
    insert into public.profiles(id,role,name,email,data_origin) values
      ('${actorId}','marketer','Operating Owner','owner@brand.co','production'),
      ('${seedActorId}','marketer','Seed Owner','seed-user@brand.co','seed');
    insert into public.organizations(id,name,organization_type) values
      ('${organizationId}','Operating Brand','advertiser'),
      ('${testOrganizationId}','QA Test Brand','advertiser');
    insert into public.organization_members(organization_id,profile_id,role) values
      ('${organizationId}','${actorId}','owner'),
      ('${testOrganizationId}','${actorId}','owner'),
      ('${organizationId}','${seedActorId}','marketer');

    insert into public.discovered_influencer_profiles(id,platform,platform_handle)
    select
      ('30000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
      case when value % 2 = 0 then 'youtube' else 'instagram' end,
      'creator' || value::text
    from generate_series(1, 205) as value;

    insert into public.marketplace_public_influencer_directory(
      listing_key, source_type, source_id, public_handle, display_name,
      search_text, category_keys, audience_countries, platforms,
      audience_counts, max_audience_count, source_updated_at
    )
    select
      'discovered:' || discovered.id::text,
      'discovered',
      discovered.id,
      'creator-' || value::text,
      'Creator ' || lpad(value::text, 3, '0'),
      lower(
        'Creator ' || value::text || ' beauty' ||
        case
          when value = 1 then ' unique-one'
          when value = 3 then ' unique-three'
          else ''
        end
      ),
      array['beauty']::text[],
      array['KR']::text[],
      array[discovered.platform]::text[],
      jsonb_build_object(discovered.platform, value * 100),
      value * 100,
      now()
    from generate_series(1, 205) as value
    join public.discovered_influencer_profiles as discovered
      on discovered.id = (
        '30000000-0000-4000-8000-' || lpad(value::text, 12, '0')
      )::uuid;

    insert into public.marketplace_registered_influencer_directory(
      owner_profile_id, registered_handle, display_name, avatar_url,
      search_text, category_keys, creator_countries, country_display_label,
      platforms, verified_channels, audience_counts, max_audience_count,
      registered_member_visibility, platform_verified,
      public_marketplace_profile_id, public_profile_published,
      public_profile_handle, source_updated_at
    ) values
      (
        '40000000-0000-4000-8000-000000000001',
        'rm-aaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'Private One', null, 'private one beauty', array['beauty'],
        '{}'::text[], '국가 미확인', array['instagram'],
        '[{"platform":"instagram","handle":"creator1","follower_count":50000}]',
        '{"instagram":50000}', 50000, 'authenticated_advertisers', true,
        '50000000-0000-4000-8000-000000000001', false, null, now()
      ),
      (
        '40000000-0000-4000-8000-000000000002',
        'rm-bbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'Private Two', null, 'private two food', array['food'],
        array['united_states'], null, array['youtube'],
        '[{"platform":"youtube","handle":"private2","follower_count":75000}]',
        '{"youtube":75000}', 75000, 'authenticated_advertisers', true,
        '50000000-0000-4000-8000-000000000002', false, null, now()
      );
  `);

  await db.exec(await readFile(phaseOneUrl, "utf8"));
  if (applyOptimization) {
    await db.exec(await readFile(optimizationUrl, "utf8"));
  }
  return db;
};

const callDiscovery = async (
  db: PGlite,
  overrides: Partial<{
    actorUserId: string;
    actorProfileId: string;
    organizationId: string;
    search: string | null;
    platform: string | null;
    categories: string[];
    countries: string[];
    sort: string;
    page: number;
    pageSize: number;
    savedOnly: boolean;
  }> = {},
) => {
  const params = {
    actorUserId: actorId,
    actorProfileId: actorId,
    organizationId,
    search: null,
    platform: null,
    categories: [] as string[],
    countries: [] as string[],
    sort: "audience_desc",
    page: 1,
    pageSize: 100,
    savedOnly: false,
    ...overrides,
  };
  const result = await db.query<{ result: Record<string, unknown> }>(
    `select public.list_server_marketplace_influencers(
      $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
      $6::text[], $7::text[], $8::text, $9::integer, $10::integer,
      $11::boolean
    ) as result`,
    [
      params.actorUserId,
      params.actorProfileId,
      params.organizationId,
      params.search,
      params.platform,
      params.categories,
      params.countries,
      params.sort,
      params.page,
      params.pageSize,
      params.savedOnly,
    ],
  );
  return result.rows[0].result as {
    items: Array<Record<string, unknown>>;
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    has_more: boolean;
  };
};

test("service-only discovery preserves exact filters and stable 100-row pages", async () => {
  const db = await setupDatabase();
  try {
    const acl = await db.query<{
      anon_ok: boolean;
      authenticated_ok: boolean;
      service_ok: boolean;
      claims_authenticated_select: boolean;
      projection_anon_select: boolean;
      projection_authenticated_select: boolean;
      projection_service_select: boolean;
      projection_trigger_anon_execute: boolean;
      projection_trigger_authenticated_execute: boolean;
      projection_trigger_service_execute: boolean;
      old_authenticated_ok: boolean;
    }>(`
      select
        has_function_privilege('anon', '${rpcSignature}', 'execute') as anon_ok,
        has_function_privilege('authenticated', '${rpcSignature}', 'execute')
          as authenticated_ok,
        has_function_privilege('service_role', '${rpcSignature}', 'execute')
          as service_ok,
        has_table_privilege(
          'authenticated',
          'public.marketplace_registered_influencer_identity_claims',
          'select'
        ) as claims_authenticated_select,
        has_table_privilege(
          'anon',
          'directsign_private.marketplace_discovered_identity_projection',
          'select'
        ) as projection_anon_select,
        has_table_privilege(
          'authenticated',
          'directsign_private.marketplace_discovered_identity_projection',
          'select'
        ) as projection_authenticated_select,
        has_table_privilege(
          'service_role',
          'directsign_private.marketplace_discovered_identity_projection',
          'select'
        ) as projection_service_select,
        has_function_privilege(
          'anon',
          'directsign_private.directsign_sync_discovered_identity_projection()',
          'execute'
        ) as projection_trigger_anon_execute,
        has_function_privilege(
          'authenticated',
          'directsign_private.directsign_sync_discovered_identity_projection()',
          'execute'
        ) as projection_trigger_authenticated_execute,
        has_function_privilege(
          'service_role',
          'directsign_private.directsign_sync_discovered_identity_projection()',
          'execute'
        ) as projection_trigger_service_execute,
        has_function_privilege('authenticated', '${oldRpcSignature}', 'execute')
          as old_authenticated_ok
    `);
    assert.deepEqual(acl.rows[0], {
      anon_ok: false,
      authenticated_ok: false,
      service_ok: true,
      claims_authenticated_select: false,
      projection_anon_select: false,
      projection_authenticated_select: false,
      projection_service_select: false,
      projection_trigger_anon_execute: false,
      projection_trigger_authenticated_execute: false,
      projection_trigger_service_execute: false,
      old_authenticated_ok: true,
    });

    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    const first = await callDiscovery(db, { page: 1 });
    const second = await callDiscovery(db, { page: 2 });
    const third = await callDiscovery(db, { page: 3 });
    assert.equal(first.total, 206);
    assert.equal(first.page_size, 100);
    assert.equal(first.items.length, 100);
    assert.equal(second.items.length, 100);
    assert.equal(third.items.length, 6);
    assert.equal(first.total_pages, 3);
    assert.equal(first.has_more, true);
    assert.equal(third.has_more, false);
    const listingKeys = [...first.items, ...second.items, ...third.items].map(
      (item) => item.listing_key,
    );
    assert.equal(new Set(listingKeys).size, 206);
    assert.ok(listingKeys.includes("registered_member:rm-aaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert.ok(listingKeys.includes("registered_member:rm-bbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    assert.ok(!listingKeys.includes("discovered:30000000-0000-4000-8000-000000000001"));

    const searched = await callDiscovery(db, {
      search: "private two",
      sort: "name_asc",
    });
    assert.equal(searched.total, 1);
    assert.equal(searched.items[0].country_display_label, undefined);
    assert.deepEqual(searched.items[0].creator_countries, ["united_states"]);

    await db.exec(`reset role`);
    await db.exec(`
      insert into public.advertiser_saved_influencers(
        organization_id, influencer_public_handle
      ) values
        ('${organizationId}', 'creator-2'),
        ('${organizationId}', 'rm-bbbbbbbbbbbbbbbbbbbbbbbbbbb')
    `);
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    const saved = await callDiscovery(db, { savedOnly: true, sort: "name_asc" });
    assert.equal(saved.total, 2);
    assert.deepEqual(
      saved.items.map((item) => item.public_handle),
      ["creator-2", "rm-bbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    );
    const filtered = await callDiscovery(db, {
      platform: "youtube",
      categories: ["food"],
      countries: ["united_states"],
    });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].public_handle, "rm-bbbbbbbbbbbbbbbbbbbbbbbbbbb");

    await assert.rejects(callDiscovery(db, { pageSize: 99 }), /exactly 100/);
  } finally {
    await db.close();
  }
});

test("optimized page query is JSON-identical to phase 200 across filters, sorts, and page edges", async () => {
  const db = await setupDatabase(false);
  try {
    await db.exec(`
      insert into public.advertiser_saved_influencers(
        organization_id,
        influencer_public_handle
      ) values
        ('${organizationId}', 'creator-2'),
        ('${organizationId}', 'rm-bbbbbbbbbbbbbbbbbbbbbbbbbbb')
    `);
    const matrix = [
      { page: 1, sort: "audience_desc" },
      { page: 2, sort: "audience_desc" },
      { page: 3, sort: "audience_desc" },
      { page: 4, sort: "audience_desc" },
      { page: 1, sort: "audience_asc" },
      { page: 1, sort: "name_asc" },
      { search: "private two", sort: "name_asc" },
      { platform: "youtube", sort: "audience_desc" },
      { categories: ["food"], sort: "name_asc" },
      { countries: ["united_states"], sort: "name_asc" },
      { savedOnly: true, sort: "name_asc" },
    ];

    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    const before = [];
    for (const query of matrix) {
      before.push(await callDiscovery(db, query));
    }

    await db.exec(`reset role`);
    await db.exec(await readFile(optimizationUrl, "utf8"));
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    const after = [];
    for (const query of matrix) {
      after.push(await callDiscovery(db, query));
    }

    assert.deepEqual(after, before);
    assert.equal(after[3].items.length, 0);
    assert.equal(after[3].total, 206);
  } finally {
    await db.close();
  }
});

test("database revalidates actor, production origin, organization, and membership", async () => {
  const db = await setupDatabase();
  try {
    await db.exec(`set role authenticated; set "request.jwt.claim.role" = 'authenticated'`);
    await assert.rejects(callDiscovery(db), /permission denied/);

    await db.exec(`reset role; set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    await assert.rejects(
      callDiscovery(db, { actorUserId: seedActorId, actorProfileId: seedActorId }),
      /trusted production advertiser profile required/,
    );
    await assert.rejects(
      callDiscovery(db, { actorUserId: seedActorId }),
      /trusted production advertiser profile required/,
    );
    await assert.rejects(
      callDiscovery(db, { organizationId: testOrganizationId }),
      /active production advertiser membership required/,
    );
    await db.exec(`reset role`);
    await db.exec(`
      update public.organization_members
      set role = 'viewer'
      where organization_id = '${organizationId}' and profile_id = '${actorId}'
    `);
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    await assert.rejects(
      callDiscovery(db),
      /active production advertiser membership required/,
    );
  } finally {
    await db.close();
  }
});

test("claim projection updates atomically and the exact SQL page query is explainable", async () => {
  const db = await setupDatabase();
  try {
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    const before = await callDiscovery(db, { search: "unique-one" });
    assert.equal(before.total, 0);

    await db.exec(`reset role`);
    await db.exec(`
      update public.marketplace_registered_influencer_directory
      set verified_channels =
        '[{"platform":"instagram","handle":"creator3","follower_count":50000}]'
      where owner_profile_id = '40000000-0000-4000-8000-000000000001'
    `);
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    const restored = await callDiscovery(db, { search: "unique-one" });
    const claimed = await callDiscovery(db, { search: "unique-three" });
    assert.equal(restored.total, 1);
    assert.equal(claimed.total, 0);

    await db.exec(`reset role`);
    await db.exec(`
      update public.discovered_influencer_profiles
      set platform = 'YouTube', platform_handle = '@Creator3-Renamed'
      where id = '30000000-0000-4000-8000-000000000003'
    `);
    const normalized = await db.query<{
      platform: string;
      normalized_handle: string;
    }>(`
      select platform, normalized_handle
      from directsign_private.marketplace_discovered_identity_projection
      where source_id = '30000000-0000-4000-8000-000000000003'
    `);
    assert.deepEqual(normalized.rows[0], {
      platform: "youtube",
      normalized_handle: "creator3-renamed",
    });
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    assert.equal((await callDiscovery(db, { search: "unique-three" })).total, 1);

    await db.exec(`reset role`);
    await db.exec(`
      delete from public.discovered_influencer_profiles
      where id = '30000000-0000-4000-8000-000000000003'
    `);
    assert.equal(
      (
        await db.query<{ count: number }>(`
          select count(*)::integer as count
          from directsign_private.marketplace_discovered_identity_projection
          where source_id = '30000000-0000-4000-8000-000000000003'
        `)
      ).rows[0].count,
      0,
    );
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    assert.equal((await callDiscovery(db, { search: "unique-three" })).total, 0);

    await db.exec(`reset role`);
    await db.exec(`
      insert into public.discovered_influencer_profiles(id, platform, platform_handle)
      values (
        '30000000-0000-4000-8000-000000000003',
        'instagram',
        '@Creator3'
      )
    `);
    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    assert.equal((await callDiscovery(db, { search: "unique-three" })).total, 0);

    await db.exec(`reset role`);
    for (const statement of [
      `select directsign_private.directsign_marketplace_influencer_page(
        '${organizationId}', '', '%', null, '{}'::text[], '{}'::text[],
        'audience_desc', 1, 100, false
      )`,
      `select directsign_private.directsign_marketplace_influencer_page(
        '${organizationId}', 'creator', '%creator%', 'youtube',
        array['beauty'], array['KR'], 'name_asc', 2, 100, false
      )`,
      `select directsign_private.directsign_marketplace_influencer_page(
        '${organizationId}', '', '%', null, '{}'::text[], '{}'::text[],
        'audience_asc', 10000, 100, true
      )`,
    ]) {
      const explained = await db.query(`explain (analyze, format json) ${statement}`);
      assert.equal(explained.rows.length, 1);
    }
  } finally {
    await db.close();
  }
});

test("cleanup phase removes the old JWT RPC only after the compatible RPC exists", async () => {
  const db = await setupDatabase();
  try {
    await db.exec(await readFile(cleanupUrl, "utf8"));
    const state = await db.query<{
      new_rpc: string | null;
      old_rpc: string | null;
      new_anon_execute: boolean;
      new_authenticated_execute: boolean;
      new_service_execute: boolean;
    }>(`
      select
        to_regprocedure('${rpcSignature}')::text as new_rpc,
        to_regprocedure('${oldRpcSignature}')::text as old_rpc,
        has_function_privilege('anon', '${rpcSignature}', 'execute')
          as new_anon_execute,
        has_function_privilege('authenticated', '${rpcSignature}', 'execute')
          as new_authenticated_execute,
        has_function_privilege('service_role', '${rpcSignature}', 'execute')
          as new_service_execute
    `);
    assert.ok(state.rows[0].new_rpc);
    assert.equal(state.rows[0].old_rpc, null);
    assert.equal(state.rows[0].new_anon_execute, false);
    assert.equal(state.rows[0].new_authenticated_execute, false);
    assert.equal(state.rows[0].new_service_execute, true);
  } finally {
    await db.close();
  }
});

test("fresh-chain cleanup before the optimization keeps service discovery available", async () => {
  const db = await setupDatabase(false);
  try {
    await db.exec(await readFile(cleanupUrl, "utf8"));
    await db.exec(await readFile(optimizationUrl, "utf8"));

    const state = await db.query<{
      new_rpc: string | null;
      old_rpc: string | null;
    }>(`
      select
        to_regprocedure('${rpcSignature}')::text as new_rpc,
        to_regprocedure('${oldRpcSignature}')::text as old_rpc
    `);
    assert.ok(state.rows[0].new_rpc);
    assert.equal(state.rows[0].old_rpc, null);

    await db.exec(`set role service_role; set "request.jwt.claim.role" = 'service_role'`);
    const page = await callDiscovery(db);
    assert.equal(page.total, 206);
    assert.equal(page.items.length, 100);
  } finally {
    await db.close();
  }
});

test("server derives actor ids, never forwards a user JWT, and logs only safe failure metadata", async () => {
  const [server, phaseOne, optimization, cleanup] = await Promise.all([
    readFile(serverUrl, "utf8"),
    readFile(phaseOneUrl, "utf8"),
    readFile(optimizationUrl, "utf8"),
    readFile(cleanupUrl, "utf8"),
  ]);
  const route = server.slice(
    server.indexOf('app.get("/api/marketplace/influencers"'),
    server.indexOf('app.get("/api/advertiser/saved-influencers"'),
  );
  const reader = server.slice(
    server.indexOf("const readAuthenticatedMarketplaceInfluencerPage"),
    server.indexOf("const readPublicMarketplaceInfluencerProfileByHandle"),
  );

  assert.doesNotMatch(server, /fetchSupabaseAsUser/);
  assert.match(reader, /rpc\/list_server_marketplace_influencers/);
  assert.match(reader, /p_actor_user_id: actorUserId/);
  assert.match(reader, /p_actor_profile_id: actorProfileId/);
  assert.match(route, /actorUserId: advertiserAuth\.user\.id/);
  assert.match(route, /actorProfileId: advertiserAuth\.profile\.id/);
  assert.ok(
    route.indexOf("requireAdvertiserSession") <
      route.indexOf("readAuthenticatedMarketplaceInfluencerPage"),
  );
  assert.doesNotMatch(route, /readIndexedMarketplaceInfluencerPage/);
  assert.match(route, /Cache-Control", "private, no-store/);
  assert.match(route, /status\(503\)[\s\S]+retryable: true/);
  assert.match(
    reader,
    /correlation_id:[\s\S]+upstream_status:[\s\S]+sqlstate:[\s\S]+duration_ms:/,
  );
  const warning = reader.slice(
    reader.indexOf("marketplace discovery upstream failure"),
    reader.indexOf("if (", reader.indexOf("marketplace discovery upstream failure")),
  );
  assert.doesNotMatch(warning, /actorUserId|actorProfileId|organizationId|filters|search/);

  assert.match(phaseOne, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(phaseOne, /p_actor_user_id is distinct from p_actor_profile_id/);
  assert.match(phaseOne, /directsign_is_operational_profile\([\s\S]+?'marketer'/);
  assert.match(phaseOne, /organization\.organization_type = 'advertiser'/);
  assert.match(phaseOne, /organization\.deleted_at is null/);
  assert.match(phaseOne, /membership\.role::text in \('owner', 'admin', 'marketer'\)/);
  assert.match(phaseOne, /with candidates as not materialized/);
  assert.match(phaseOne, /filtered as not materialized/);
  assert.match(optimization, /discovered_identities as materialized/);
  assert.match(optimization, /filtered as materialized/);
  assert.match(optimization, /paged_keys as materialized/);
  assert.match(
    optimization,
    /from directsign_private\.marketplace_discovered_identity_projection/,
  );
  assert.doesNotMatch(
    optimization.slice(
      optimization.indexOf("create or replace function\n  directsign_private.directsign_marketplace_influencer_page"),
    ),
    /join public\.discovered_influencer_profiles/,
  );
  assert.match(optimization, /limit p_page_size[\s\S]+offset/);
  assert.match(optimization, /join public\.marketplace_public_influencer_directory[\s\S]+paged_key\.listing_key/);
  assert.doesNotMatch(phaseOne, /row_number\s*\(/i);
  assert.doesNotMatch(phaseOne, /drop function public\.list_authenticated/);
  assert.match(cleanup, /revoke all on function public\.list_authenticated/);
  assert.match(cleanup, /drop function public\.list_authenticated/);
});
