begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Keep the request-time discovery query away from the wide crawler table. The
-- projection contains only the immutable join key and the normalized identity
-- needed to exclude identities already claimed by a registered member.
create table if not exists
  directsign_private.marketplace_discovered_identity_projection (
    source_id uuid primary key references public.discovered_influencer_profiles (id)
      on update cascade on delete cascade,
    platform text not null,
    normalized_handle text not null,
    refreshed_at timestamptz not null default clock_timestamp(),
    constraint marketplace_discovered_identity_projection_platform_not_blank
      check (btrim(platform) <> ''),
    constraint marketplace_discovered_identity_projection_handle_not_blank
      check (btrim(normalized_handle) <> '')
  );

create index if not exists marketplace_discovered_identity_projection_lookup_idx
  on directsign_private.marketplace_discovered_identity_projection (
    platform,
    normalized_handle,
    source_id
  );

alter table directsign_private.marketplace_discovered_identity_projection
  enable row level security;

revoke all on table
  directsign_private.marketplace_discovered_identity_projection
from public, anon, authenticated, service_role;

create or replace function
  directsign_private.directsign_sync_discovered_identity_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into directsign_private.marketplace_discovered_identity_projection (
    source_id,
    platform,
    normalized_handle,
    refreshed_at
  ) values (
    new.id,
    lower(btrim(new.platform::text)),
    lower(regexp_replace(btrim(new.platform_handle), '^@+', '')),
    clock_timestamp()
  )
  on conflict (source_id) do update
  set platform = excluded.platform,
      normalized_handle = excluded.normalized_handle,
      refreshed_at = excluded.refreshed_at
  where marketplace_discovered_identity_projection.platform
        is distinct from excluded.platform
     or marketplace_discovered_identity_projection.normalized_handle
        is distinct from excluded.normalized_handle;

  return new;
end;
$$;

revoke all on function
  directsign_private.directsign_sync_discovered_identity_projection()
from public, anon, authenticated, service_role;

drop trigger if exists discovered_influencer_sync_identity_projection
  on public.discovered_influencer_profiles;
create trigger discovered_influencer_sync_identity_projection
after insert or update of id, platform, platform_handle
on public.discovered_influencer_profiles
for each row execute function
  directsign_private.directsign_sync_discovered_identity_projection();

insert into directsign_private.marketplace_discovered_identity_projection (
  source_id,
  platform,
  normalized_handle,
  refreshed_at
)
select
  discovered.id,
  lower(btrim(discovered.platform::text)),
  lower(regexp_replace(btrim(discovered.platform_handle), '^@+', '')),
  clock_timestamp()
from public.discovered_influencer_profiles as discovered
on conflict (source_id) do update
set platform = excluded.platform,
    normalized_handle = excluded.normalized_handle,
    refreshed_at = excluded.refreshed_at
where marketplace_discovered_identity_projection.platform
      is distinct from excluded.platform
   or marketplace_discovered_identity_projection.normalized_handle
      is distinct from excluded.normalized_handle;

-- A partial backfill must never silently publish a claimed identity. Abort the
-- migration if the projection is not an exact image of the authoritative rows.
do $$
begin
  if exists (
    select 1
    from public.discovered_influencer_profiles as discovered
    full join
      directsign_private.marketplace_discovered_identity_projection as projection
      on projection.source_id = discovered.id
    where discovered.id is null
      or projection.source_id is null
      or projection.platform is distinct from
        lower(btrim(discovered.platform::text))
      or projection.normalized_handle is distinct from
        lower(regexp_replace(btrim(discovered.platform_handle), '^@+', ''))
  ) then
    raise exception 'marketplace discovered identity projection drift'
      using errcode = 'P0001';
  end if;
end;
$$;

-- The first request after deployment must not plan against the default empty
-- table estimate. Refresh statistics inside the migration transaction.
analyze directsign_private.marketplace_discovered_identity_projection;

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
  with discovered_identities as materialized (
    select
      projection.source_id,
      projection.platform,
      projection.normalized_handle
    from directsign_private.marketplace_discovered_identity_projection
      as projection
  ),
  candidates as not materialized (
    select
      public_directory.listing_key,
      public_directory.source_type,
      public_directory.source_id,
      public_directory.public_handle,
      public_directory.display_name,
      public_directory.search_text,
      public_directory.category_keys,
      public_directory.audience_countries as creator_countries,
      public_directory.platforms,
      public_directory.audience_counts,
      public_directory.max_audience_count,
      public_directory.public_handle as public_profile_handle
    from public.marketplace_public_influencer_directory as public_directory
    join discovered_identities as discovered_identity
      on public_directory.source_type = 'discovered'
      and discovered_identity.source_id = public_directory.source_id
    where public_directory.source_type = 'discovered'
      and public_directory.public_handle !~ '^rm-[a-f0-9]{27}$'
      and not exists (
        select 1
        from public.marketplace_registered_influencer_identity_claims
          as claimed_identity
        where claimed_identity.platform = discovered_identity.platform
          and claimed_identity.normalized_handle =
            discovered_identity.normalized_handle
      )

    union all

    select
      'registered_member:' || registered_member.registered_handle,
      'registered_member',
      null::uuid,
      registered_member.registered_handle,
      registered_member.display_name,
      registered_member.search_text,
      registered_member.category_keys,
      registered_member.creator_countries,
      registered_member.platforms,
      registered_member.audience_counts,
      registered_member.max_audience_count,
      registered_member.public_profile_handle
    from public.marketplace_registered_influencer_directory
      as registered_member
    where registered_member.registered_member_visibility =
      'authenticated_advertisers'
  ),
  filtered as materialized (
    select
      candidate.listing_key,
      candidate.source_type,
      candidate.source_id,
      candidate.public_handle,
      candidate.display_name,
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
  paged_keys as materialized (
    select
      filtered.listing_key,
      filtered.source_type,
      filtered.source_id,
      filtered.public_handle,
      filtered.display_name,
      filtered.audience_sort_count
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
  ),
  paged as materialized (
    select
      paged_key.listing_key,
      public_directory.source_type,
      public_directory.source_id,
      public_directory.public_handle,
      public_directory.display_name,
      null::text as avatar_url,
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
      public_directory.source_updated_at,
      paged_key.audience_sort_count
    from paged_keys as paged_key
    join public.marketplace_public_influencer_directory as public_directory
      on paged_key.source_type = 'discovered'
      and public_directory.listing_key = paged_key.listing_key

    union all

    select
      paged_key.listing_key,
      'registered_member',
      null::uuid,
      registered_member.registered_handle,
      registered_member.display_name,
      registered_member.avatar_url,
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
      registered_member.source_updated_at,
      paged_key.audience_sort_count
    from paged_keys as paged_key
    join public.marketplace_registered_influencer_directory as registered_member
      on paged_key.source_type = 'registered_member'
      and registered_member.registered_handle = paged_key.public_handle
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

comment on table
  directsign_private.marketplace_discovered_identity_projection is
  'Owner-only skinny identity projection used by server marketplace discovery.';

notify pgrst, 'reload schema';

commit;
