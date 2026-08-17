begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- This is phase one of a rolling-safe discovery cutover. It adds the
-- service-only RPC while the previous authenticated RPC remains available to
-- already-running application instances. Apply 20260811201000 only after the
-- entire server fleet is confirmed to use list_server_marketplace_influencers.

-- Avoid expanding every registered member's verified_channels JSON for every
-- directory read. This table is a private, trigger-maintained projection used
-- only to suppress a discovered identity after the same platform identity has
-- been claimed by a registered member.
create table if not exists public.marketplace_registered_influencer_identity_claims (
  owner_profile_id uuid not null
    references public.marketplace_registered_influencer_directory (owner_profile_id)
    on delete cascade,
  platform text not null,
  normalized_handle text not null,
  created_at timestamptz not null default now(),
  primary key (owner_profile_id, platform, normalized_handle),
  constraint marketplace_registered_identity_claim_platform_allowed check (
    platform in ('instagram', 'youtube', 'tiktok', 'naver_blog', 'other')
  ),
  constraint marketplace_registered_identity_claim_handle_valid check (
    btrim(normalized_handle) <> ''
    and normalized_handle = lower(normalized_handle)
    and normalized_handle !~ '^@'
    and length(normalized_handle) <= 160
  )
);

create index if not exists marketplace_registered_identity_claim_lookup_idx
  on public.marketplace_registered_influencer_identity_claims (
    platform,
    normalized_handle
  );
create index if not exists advertiser_saved_influencers_org_handle_idx
  on public.advertiser_saved_influencers (
    organization_id,
    influencer_public_handle
  );
create index if not exists marketplace_registered_influencer_directory_name_idx
  on public.marketplace_registered_influencer_directory (
    lower(display_name),
    registered_handle,
    owner_profile_id
  );

alter table public.marketplace_registered_influencer_identity_claims
  enable row level security;
alter table public.marketplace_registered_influencer_identity_claims
  force row level security;
revoke all on table public.marketplace_registered_influencer_identity_claims
  from public, anon, authenticated, service_role;

create or replace function
  directsign_private.directsign_refresh_registered_identity_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.marketplace_registered_influencer_identity_claims
    where owner_profile_id = old.owner_profile_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'UPDATE'
       and new.owner_profile_id is distinct from old.owner_profile_id then
      delete from public.marketplace_registered_influencer_identity_claims
      where owner_profile_id = new.owner_profile_id;
    end if;

    if new.platform_verified then
      insert into public.marketplace_registered_influencer_identity_claims (
        owner_profile_id,
        platform,
        normalized_handle
      )
      select distinct
        new.owner_profile_id,
        lower(btrim(channel.value ->> 'platform')),
        lower(regexp_replace(
          btrim(channel.value ->> 'handle'),
          '^@+',
          ''
        ))
      from jsonb_array_elements(new.verified_channels) as channel(value)
      where lower(btrim(coalesce(channel.value ->> 'platform', ''))) in (
          'instagram', 'youtube', 'tiktok', 'naver_blog', 'other'
        )
        and btrim(coalesce(channel.value ->> 'handle', '')) <> ''
        and length(lower(regexp_replace(
          btrim(channel.value ->> 'handle'),
          '^@+',
          ''
        ))) <= 160
      on conflict (owner_profile_id, platform, normalized_handle) do nothing;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists marketplace_registered_identity_claims_refresh
  on public.marketplace_registered_influencer_directory;
create trigger marketplace_registered_identity_claims_refresh
after insert or delete or update of
  owner_profile_id,
  platform_verified,
  verified_channels
on public.marketplace_registered_influencer_directory
for each row execute function
  directsign_private.directsign_refresh_registered_identity_claims();

-- The projection is derived data, so a deterministic rebuild is safer than
-- preserving any partial/manual contents if this migration is rehearsed.
delete from public.marketplace_registered_influencer_identity_claims;
insert into public.marketplace_registered_influencer_identity_claims (
  owner_profile_id,
  platform,
  normalized_handle
)
select distinct
  registered_member.owner_profile_id,
  lower(btrim(channel.value ->> 'platform')),
  lower(regexp_replace(
    btrim(channel.value ->> 'handle'),
    '^@+',
    ''
  ))
from public.marketplace_registered_influencer_directory as registered_member
cross join lateral jsonb_array_elements(
  registered_member.verified_channels
) as channel(value)
where registered_member.platform_verified
  and lower(btrim(coalesce(channel.value ->> 'platform', ''))) in (
    'instagram', 'youtube', 'tiktok', 'naver_blog', 'other'
  )
  and btrim(coalesce(channel.value ->> 'handle', '')) <> ''
  and length(lower(regexp_replace(
    btrim(channel.value ->> 'handle'),
    '^@+',
    ''
  ))) <= 160
on conflict (owner_profile_id, platform, normalized_handle) do nothing;

revoke all on function
  directsign_private.directsign_refresh_registered_identity_claims()
from public, anon, authenticated, service_role;

-- Keep the page query in a separate SQL function so production can run
-- EXPLAIN (ANALYZE, BUFFERS) against the exact query as the migration evolves.
-- The public wrapper below validates every caller and actor before invoking it.
create or replace function
  directsign_private.directsign_marketplace_influencer_page(
    p_organization_id uuid,
    p_search text,
    p_search_pattern text,
    p_platform text,
    p_categories text[],
    p_countries text[],
    p_sort text,
    p_page integer,
    p_page_size integer,
    p_saved_only boolean
  )
returns jsonb
language sql
stable
as $$
  with candidates as not materialized (
    select
      public_directory.listing_key,
      public_directory.source_type,
      public_directory.source_id,
      public_directory.public_handle,
      public_directory.display_name,
      null::text as avatar_url,
      public_directory.search_text,
      public_directory.category_keys,
      public_directory.audience_countries as creator_countries,
      case
        when cardinality(public_directory.audience_countries) = 0
          then '국가 미확인'
        else null
      end as country_display_label,
      public_directory.platforms,
      '[]'::jsonb as verified_channels,
      public_directory.audience_counts,
      public_directory.max_audience_count,
      'public'::text as registered_member_visibility,
      false as platform_verified,
      true as public_profile_published,
      public_directory.public_handle as public_profile_handle,
      public_directory.source_updated_at
    from public.marketplace_public_influencer_directory as public_directory
    join public.discovered_influencer_profiles as discovered
      on public_directory.source_type = 'discovered'
      and discovered.id = public_directory.source_id
    where public_directory.source_type = 'discovered'
      and public_directory.public_handle !~ '^rm-[a-f0-9]{27}$'
      and not exists (
        select 1
        from public.marketplace_registered_influencer_identity_claims
          as claimed_identity
        where claimed_identity.platform = discovered.platform::text
          and claimed_identity.normalized_handle = lower(regexp_replace(
            btrim(discovered.platform_handle),
            '^@+',
            ''
          ))
      )

    union all

    select
      'registered_member:' || registered_member.registered_handle,
      'registered_member',
      null::uuid,
      registered_member.registered_handle,
      registered_member.display_name,
      registered_member.avatar_url,
      registered_member.search_text,
      registered_member.category_keys,
      registered_member.creator_countries,
      registered_member.country_display_label,
      registered_member.platforms,
      registered_member.verified_channels,
      registered_member.audience_counts,
      registered_member.max_audience_count,
      registered_member.registered_member_visibility,
      registered_member.platform_verified,
      registered_member.public_profile_published,
      registered_member.public_profile_handle,
      registered_member.source_updated_at
    from public.marketplace_registered_influencer_directory
      as registered_member
    where registered_member.registered_member_visibility =
      'authenticated_advertisers'
  ),
  filtered as not materialized (
    select
      candidate.*,
      case
        when p_platform is null then candidate.max_audience_count
        else nullif(candidate.audience_counts ->> p_platform, '')::bigint
      end as audience_sort_count
    from candidates as candidate
    where (
      p_search = ''
      or candidate.search_text like p_search_pattern escape '\'
    )
      and (p_platform is null or p_platform = any(candidate.platforms))
      and (
        cardinality(p_categories) = 0
        or candidate.category_keys && p_categories
      )
      and (
        cardinality(p_countries) = 0
        or candidate.creator_countries && p_countries
      )
      and (
        not p_saved_only
        or exists (
          select 1
          from public.advertiser_saved_influencers as saved
          where saved.organization_id = p_organization_id
            and saved.influencer_public_handle in (
              candidate.public_handle,
              candidate.public_profile_handle
            )
        )
      )
  ),
  counted as materialized (
    select count(*)::bigint as total
    from filtered
  ),
  paged as materialized (
    select filtered.*
    from filtered
    order by
      case when p_sort = 'audience_desc'
        then audience_sort_count end desc nulls last,
      case when p_sort = 'audience_asc'
        then audience_sort_count end asc nulls last,
      case when p_sort = 'name_asc'
        then lower(display_name) end asc,
      lower(display_name) asc,
      public_handle asc,
      listing_key asc
    limit p_page_size
    offset ((p_page - 1)::bigint * p_page_size::bigint)
  )
  select jsonb_build_object(
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'listing_key', paged.listing_key,
            'source_type', paged.source_type,
            'source_id', paged.source_id,
            'public_handle', paged.public_handle,
            'display_name', paged.display_name,
            'avatar_url', paged.avatar_url,
            'category_keys', paged.category_keys,
            'creator_countries', paged.creator_countries,
            'country_display_label', paged.country_display_label,
            'platforms', paged.platforms,
            'verified_channels', paged.verified_channels,
            'audience_counts', paged.audience_counts,
            'max_audience_count', paged.max_audience_count,
            'registered_member_visibility',
              paged.registered_member_visibility,
            'platform_verified', paged.platform_verified,
            'public_profile_published', paged.public_profile_published,
            'public_profile_handle', paged.public_profile_handle,
            'source_updated_at', paged.source_updated_at
          ))
          order by
            case when p_sort = 'audience_desc'
              then paged.audience_sort_count end desc nulls last,
            case when p_sort = 'audience_asc'
              then paged.audience_sort_count end asc nulls last,
            case when p_sort = 'name_asc'
              then lower(paged.display_name) end asc,
            lower(paged.display_name) asc,
            paged.public_handle asc,
            paged.listing_key asc
        )
        from paged
      ),
      '[]'::jsonb
    ),
    'total', counted.total,
    'page', p_page,
    'page_size', p_page_size,
    'total_pages', case
      when counted.total = 0 then 0
      else ceil(counted.total::numeric / p_page_size::numeric)::bigint
    end,
    'has_more', (p_page::bigint * p_page_size::bigint) < counted.total
  )
  from counted;
$$;

revoke all on function
  directsign_private.directsign_marketplace_influencer_page(
    uuid, text, text, text, text[], text[], text,
    integer, integer, boolean
  )
from public, anon, authenticated, service_role;

create or replace function public.list_server_marketplace_influencers(
  p_actor_user_id uuid,
  p_actor_profile_id uuid,
  p_organization_id uuid,
  p_search text default null,
  p_platform text default null,
  p_categories text[] default '{}'::text[],
  p_countries text[] default '{}'::text[],
  p_sort text default 'audience_desc',
  p_page integer default 1,
  p_page_size integer default 100,
  p_saved_only boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_search_pattern text;
  v_platform text := nullif(lower(btrim(coalesce(p_platform, ''))), '');
  v_categories text[];
  v_countries text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_actor_user_id is null
     or p_actor_profile_id is null
     or p_actor_user_id is distinct from p_actor_profile_id
     or not directsign_private.directsign_is_operational_profile(
       p_actor_profile_id,
       'marketer'
     ) then
    raise exception 'trusted production advertiser profile required'
      using errcode = '42501';
  end if;

  if p_organization_id is null
     or not exists (
       select 1
       from public.organizations as organization
       join public.organization_members as membership
         on membership.organization_id = organization.id
       where organization.id = p_organization_id
         and organization.organization_type = 'advertiser'
         and organization.deleted_at is null
         and not directsign_private.directsign_has_test_marker(
           organization.name
         )
         and membership.profile_id = p_actor_profile_id
         and membership.role::text in ('owner', 'admin', 'marketer')
     ) then
    raise exception 'active production advertiser membership required'
      using errcode = '42501';
  end if;

  if p_page is null or p_page < 1 or p_page > 10000 then
    raise exception 'p_page must be between 1 and 10000';
  end if;
  if p_page_size is distinct from 100 then
    raise exception 'p_page_size must be exactly 100';
  end if;
  if length(v_search) > 120 then
    raise exception 'p_search must be at most 120 characters';
  end if;
  if cardinality(coalesce(p_categories, '{}'::text[])) > 20
     or exists (
       select 1
       from unnest(coalesce(p_categories, '{}'::text[])) as category
       where length(category) > 64
     ) then
    raise exception 'p_categories exceeds the allowed size';
  end if;
  if cardinality(coalesce(p_countries, '{}'::text[])) > 20
     or exists (
       select 1
       from unnest(coalesce(p_countries, '{}'::text[])) as country
       where length(country) > 64
     ) then
    raise exception 'p_countries exceeds the allowed size';
  end if;
  if v_platform is not null and v_platform not in (
    'instagram', 'youtube', 'tiktok', 'naver_blog', 'other'
  ) then
    raise exception 'unsupported marketplace influencer platform';
  end if;
  if p_sort is null
     or p_sort not in ('audience_desc', 'audience_asc', 'name_asc') then
    raise exception 'unsupported marketplace influencer sort';
  end if;
  if p_saved_only is null then
    raise exception 'p_saved_only must not be null';
  end if;

  v_search_pattern := '%' || replace(
    replace(replace(v_search, '\', '\\'), '%', '\%'),
    '_',
    '\_'
  ) || '%';

  select coalesce(
    array_agg(distinct lower(btrim(value)) order by lower(btrim(value)))
      filter (where btrim(value) <> ''),
    '{}'::text[]
  )
  into v_categories
  from unnest(coalesce(p_categories, '{}'::text[])) as value;

  select coalesce(
    array_agg(distinct lower(btrim(value)) order by lower(btrim(value)))
      filter (where btrim(value) <> ''),
    '{}'::text[]
  )
  into v_countries
  from unnest(coalesce(p_countries, '{}'::text[])) as value;

  return directsign_private.directsign_marketplace_influencer_page(
    p_organization_id,
    v_search,
    v_search_pattern,
    v_platform,
    v_categories,
    v_countries,
    p_sort,
    p_page,
    p_page_size,
    p_saved_only
  );
end;
$$;

revoke all on function public.list_server_marketplace_influencers(
  uuid, uuid, uuid, text, text, text[], text[], text,
  integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.list_server_marketplace_influencers(
  uuid, uuid, uuid, text, text, text[], text[], text,
  integer, integer, boolean
) to service_role;

comment on table public.marketplace_registered_influencer_identity_claims is
  'Private trigger-maintained platform identity projection used to keep claimed registered identities out of discovered search results without per-request JSON expansion.';
comment on function public.list_server_marketplace_influencers(
  uuid, uuid, uuid, text, text, text[], text[], text,
  integer, integer, boolean
) is
  'Service-only exact 100-row advertiser discovery query. The server supplies matching auth-user/profile ids and the function independently revalidates production profile and active advertiser membership.';

notify pgrst, 'reload schema';

commit;
