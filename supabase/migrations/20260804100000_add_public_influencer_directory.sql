create extension if not exists pg_trgm with schema extensions;

create table if not exists public.marketplace_public_influencer_directory (
  listing_key text primary key,
  source_type text not null,
  source_id uuid not null,
  public_handle text not null,
  display_name text not null,
  search_text text not null default '',
  category_keys text[] not null default '{}'::text[],
  audience_countries text[] not null default '{}'::text[],
  platforms text[] not null default '{}'::text[],
  audience_counts jsonb not null default '{}'::jsonb,
  max_audience_count bigint,
  quality_score integer not null default 0,
  source_updated_at timestamptz not null,
  eligibility_version text not null,
  eligibility_reason text not null,
  rebuild_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_public_influencer_directory_source_type_allowed check (
    source_type in ('registered', 'discovered')
  ),
  constraint marketplace_public_influencer_directory_listing_key_format check (
    listing_key = source_type || ':' || source_id::text
  ),
  constraint marketplace_public_influencer_directory_handle_format check (
    public_handle = lower(public_handle)
    and public_handle ~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$'
  ),
  constraint marketplace_public_influencer_directory_display_name_not_blank check (
    btrim(display_name) <> ''
  ),
  constraint marketplace_public_influencer_directory_categories_not_null check (
    array_position(category_keys, null) is null
  ),
  constraint marketplace_public_influencer_directory_countries_not_null check (
    array_position(audience_countries, null) is null
  ),
  constraint marketplace_public_influencer_directory_platforms_allowed check (
    platforms <@ array[
      'instagram',
      'youtube',
      'tiktok',
      'naver_blog',
      'other'
    ]::text[]
  ),
  constraint marketplace_public_influencer_directory_audience_counts_object check (
    jsonb_typeof(audience_counts) = 'object'
  ),
  constraint marketplace_public_influencer_directory_max_audience_nonnegative check (
    max_audience_count is null or max_audience_count >= 0
  ),
  constraint marketplace_public_influencer_directory_quality_score_range check (
    quality_score between 0 and 100
  ),
  constraint marketplace_public_influencer_directory_eligibility_not_blank check (
    btrim(eligibility_version) <> '' and btrim(eligibility_reason) <> ''
  ),
  unique (source_type, source_id)
);

create unique index if not exists marketplace_public_influencer_directory_handle_uidx
  on public.marketplace_public_influencer_directory (lower(public_handle));

create index if not exists marketplace_public_influencer_directory_platforms_gin_idx
  on public.marketplace_public_influencer_directory using gin (platforms);

create index if not exists marketplace_public_influencer_directory_categories_gin_idx
  on public.marketplace_public_influencer_directory using gin (category_keys);

create index if not exists marketplace_public_influencer_directory_countries_gin_idx
  on public.marketplace_public_influencer_directory using gin (audience_countries);

create index if not exists marketplace_public_influencer_directory_search_trgm_idx
  on public.marketplace_public_influencer_directory
  using gin (search_text extensions.gin_trgm_ops);

create index if not exists marketplace_public_influencer_directory_audience_desc_idx
  on public.marketplace_public_influencer_directory (
    max_audience_count desc nulls last,
    lower(display_name),
    public_handle,
    listing_key
  );

create index if not exists marketplace_public_influencer_directory_name_idx
  on public.marketplace_public_influencer_directory (
    lower(display_name),
    public_handle,
    listing_key
  );

alter table public.marketplace_public_influencer_directory enable row level security;

revoke all on table public.marketplace_public_influencer_directory
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.marketplace_public_influencer_directory
  to service_role;

create or replace function public.directsign_public_audience_count(
  p_label text
)
returns bigint
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_normalized text := lower(replace(coalesce(p_label, ''), ',', ''));
  v_match text[];
  v_amount numeric;
  v_multiplier bigint;
  v_candidate numeric;
  v_max numeric;
begin
  for v_match in
    select regexp_matches(
      v_normalized,
      '([0-9]+(?:\.[0-9]+)?)\s*(억|만|천|k|m)?',
      'g'
    )
  loop
    v_amount := v_match[1]::numeric;
    v_multiplier := case v_match[2]
      when '억' then 100000000
      when '만' then 10000
      when '천' then 1000
      when 'k' then 1000
      when 'm' then 1000000
      else 1
    end;
    v_candidate := v_amount * v_multiplier;
    if v_max is null or v_candidate > v_max then
      v_max := v_candidate;
    end if;
  end loop;

  return case when v_max is null then null else round(v_max)::bigint end;
end;
$$;

create or replace function public.directsign_public_creator_category_key(
  p_value text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(btrim(coalesce(p_value, '')))
    when '' then null
    when 'beauty' then 'beauty'
    when '뷰티' then 'beauty'
    when '스킨케어' then 'beauty'
    when '메이크업' then 'beauty'
    when '화장품' then 'beauty'
    when '미용' then 'beauty'
    when '코스메틱' then 'beauty'
    when 'fashion' then 'fashion'
    when '패션' then 'fashion'
    when '스타일링' then 'fashion'
    when '코디' then 'fashion'
    when '의류' then 'fashion'
    when '신발' then 'fashion'
    when '액세서리' then 'fashion'
    when 'living' then 'living'
    when 'lifestyle' then 'living'
    when '리빙' then 'living'
    when '라이프스타일' then 'living'
    when '홈' then 'living'
    when '인테리어' then 'living'
    when 'diy' then 'living'
    when '셀프diy' then 'living'
    when '살림' then 'living'
    when '생활' then 'living'
    when 'food' then 'food'
    when 'mukbang' then 'food'
    when '푸드' then 'food'
    when '맛집' then 'food'
    when '요리' then 'food'
    when '먹방' then 'food'
    when '카페' then 'food'
    when '홈카페' then 'food'
    when '레시피' then 'food'
    when 'travel' then 'travel'
    when '여행' then 'travel'
    when '숙박' then 'travel'
    when '로컬' then 'travel'
    when '호텔' then 'travel'
    when '캠핑' then 'travel'
    when 'parenting' then 'parenting'
    when 'kids' then 'parenting'
    when '육아' then 'parenting'
    when '키즈' then 'parenting'
    when '키즈카페' then 'parenting'
    when '출산' then 'parenting'
    when '유아' then 'parenting'
    when 'pet' then 'pet'
    when 'pets' then 'pet'
    when '펫' then 'pet'
    when '애견' then 'pet'
    when '반려동물' then 'pet'
    when '강아지' then 'pet'
    when '고양이' then 'pet'
    when '반려견' then 'pet'
    when '반려묘' then 'pet'
    when 'fitness' then 'fitness'
    when 'fit' then 'fitness'
    when 'health' then 'fitness'
    when '운동' then 'fitness'
    when '헬스' then 'fitness'
    when '건강' then 'fitness'
    when '피트니스' then 'fitness'
    when '트레이너' then 'fitness'
    when '다이어트' then 'fitness'
    when '홈트' then 'fitness'
    when 'game' then 'game'
    when 'gaming' then 'game'
    when '게임' then 'game'
    when '게이밍' then 'game'
    when '스트리밍' then 'game'
    when 'e스포츠' then 'game'
    when 'tech' then 'tech'
    when 'technology' then 'tech'
    when '테크' then 'tech'
    when 'it·테크' then 'tech'
    when '생활가전' then 'tech'
    when '가전' then 'tech'
    when '디지털' then 'tech'
    when 'education' then 'education'
    when '교육' then 'education'
    when '공부' then 'education'
    when '학습' then 'education'
    when '어학' then 'education'
    when '커리어' then 'education'
    when '영어' then 'education'
    when '한국어 강사' then 'education'
    when '한국어 교육' then 'education'
    when 'finance' then 'finance'
    when 'business' then 'finance'
    when '경제' then 'finance'
    when '금융' then 'finance'
    when '재테크' then 'finance'
    when '주식' then 'finance'
    when '비즈니스' then 'finance'
    when '경제·비즈니스' then 'finance'
    when 'automotive' then 'automotive'
    when 'car' then 'automotive'
    when '자동차' then 'automotive'
    when '차량' then 'automotive'
    when '모빌리티' then 'automotive'
    when 'content' then 'content'
    when 'entertainment' then 'content'
    when '콘텐츠' then 'content'
    when '엔터테인먼트' then 'content'
    when '브이로그' then 'content'
    when '일상' then 'content'
    when '일상·브이로그' then 'content'
    when '코미디' then 'content'
    else 'content'
  end;
$$;

create or replace function public.directsign_public_creator_category_keys(
  p_values text[]
)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    array_agg(distinct category_key order by category_key)
      filter (where category_key is not null),
    '{}'::text[]
  )
  from (
    select public.directsign_public_creator_category_key(value) as category_key
    from unnest(coalesce(p_values, '{}'::text[])) as value
  ) as normalized;
$$;

create or replace function public.directsign_refresh_registered_influencer_directory(
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.marketplace_influencer_profiles%rowtype;
  v_platforms text[] := '{}'::text[];
  v_audience_counts jsonb := '{}'::jsonb;
  v_max_audience_count bigint;
  v_channel_handles text := '';
  v_channel_updated_at timestamptz;
  v_category_keys text[] := '{}'::text[];
  v_search_text text;
begin
  select *
  into v_profile
  from public.marketplace_influencer_profiles
  where id = p_profile_id;

  if not found
     or not v_profile.is_published
     or v_profile.data_origin is distinct from 'production' then
    delete from public.marketplace_public_influencer_directory
    where source_type = 'registered' and source_id = p_profile_id;
    return;
  end if;

  with per_platform as (
    select
      channel.platform::text as platform,
      max(coalesce(
        channel.follower_count,
        public.directsign_public_audience_count(channel.followers_label)
      )) as audience_count,
      string_agg(channel.handle, ' ' order by channel.sort_order, channel.id) as handles,
      max(channel.updated_at) as updated_at
    from public.marketplace_influencer_channels as channel
    where channel.profile_id = p_profile_id
    group by channel.platform
  )
  select
    coalesce(array_agg(platform order by platform), '{}'::text[]),
    coalesce(jsonb_object_agg(platform, audience_count order by platform), '{}'::jsonb),
    max(audience_count),
    coalesce(string_agg(handles, ' ' order by platform), ''),
    max(updated_at)
  into
    v_platforms,
    v_audience_counts,
    v_max_audience_count,
    v_channel_handles,
    v_channel_updated_at
  from per_platform;

  v_category_keys := public.directsign_public_creator_category_keys(
    v_profile.categories
  );
  v_search_text := lower(regexp_replace(concat_ws(
    ' ',
    v_profile.display_name,
    v_profile.public_handle,
    v_profile.headline,
    v_profile.bio,
    v_profile.location,
    v_profile.audience,
    array_to_string(v_profile.categories, ' '),
    array_to_string(v_category_keys, ' '),
    array_to_string(v_profile.audience_countries, ' '),
    array_to_string(v_profile.audience_tags, ' '),
    array_to_string(v_profile.brand_fit, ' '),
    array_to_string(v_profile.recent_brands, ' '),
    v_channel_handles
  ), '\s+', ' ', 'g'));

  -- A registered, production profile owns a colliding handle. Discovered
  -- candidates never replace a customer-published profile.
  delete from public.marketplace_public_influencer_directory
  where
    public_handle = lower(v_profile.public_handle)
    and source_type = 'discovered';

  insert into public.marketplace_public_influencer_directory (
    listing_key,
    source_type,
    source_id,
    public_handle,
    display_name,
    search_text,
    category_keys,
    audience_countries,
    platforms,
    audience_counts,
    max_audience_count,
    quality_score,
    source_updated_at,
    eligibility_version,
    eligibility_reason,
    updated_at
  ) values (
    'registered:' || v_profile.id::text,
    'registered',
    v_profile.id,
    lower(v_profile.public_handle),
    v_profile.display_name,
    left(v_search_text, 20000),
    v_category_keys,
    coalesce(v_profile.audience_countries, '{}'::text[]),
    v_platforms,
    v_audience_counts,
    v_max_audience_count,
    100,
    greatest(
      v_profile.updated_at,
      coalesce(v_channel_updated_at, v_profile.updated_at)
    ),
    '2026-08-public-directory-v1',
    'registered_production_profile',
    clock_timestamp()
  )
  on conflict (listing_key) do update set
    public_handle = excluded.public_handle,
    display_name = excluded.display_name,
    search_text = excluded.search_text,
    category_keys = excluded.category_keys,
    audience_countries = excluded.audience_countries,
    platforms = excluded.platforms,
    audience_counts = excluded.audience_counts,
    max_audience_count = excluded.max_audience_count,
    quality_score = excluded.quality_score,
    source_updated_at = excluded.source_updated_at,
    eligibility_version = excluded.eligibility_version,
    eligibility_reason = excluded.eligibility_reason,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.directsign_sync_registered_influencer_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.marketplace_public_influencer_directory
    where source_type = 'registered' and source_id = old.id;
    return old;
  end if;

  perform public.directsign_refresh_registered_influencer_directory(new.id);
  return new;
end;
$$;

drop trigger if exists marketplace_influencer_profiles_sync_public_directory
  on public.marketplace_influencer_profiles;
create trigger marketplace_influencer_profiles_sync_public_directory
after insert or update or delete
on public.marketplace_influencer_profiles
for each row execute function public.directsign_sync_registered_influencer_directory();

create or replace function public.directsign_sync_registered_channel_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.directsign_refresh_registered_influencer_directory(old.profile_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id then
    perform public.directsign_refresh_registered_influencer_directory(old.profile_id);
  end if;
  perform public.directsign_refresh_registered_influencer_directory(new.profile_id);
  return new;
end;
$$;

drop trigger if exists marketplace_influencer_channels_sync_public_directory
  on public.marketplace_influencer_channels;
create trigger marketplace_influencer_channels_sync_public_directory
after insert or update or delete
on public.marketplace_influencer_channels
for each row execute function public.directsign_sync_registered_channel_directory();

create or replace function public.directsign_remove_unlisted_discovered_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.marketplace_public_influencer_directory
    where source_type = 'discovered' and source_id = old.id;
    return old;
  end if;

  if new.status <> 'active' or new.claimed_marketplace_profile_id is not null then
    delete from public.marketplace_public_influencer_directory
    where source_type = 'discovered' and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists discovered_influencers_remove_unlisted_directory
  on public.discovered_influencer_profiles;
create trigger discovered_influencers_remove_unlisted_directory
after insert or update of status, claimed_marketplace_profile_id or delete
on public.discovered_influencer_profiles
for each row execute function public.directsign_remove_unlisted_discovered_directory();

drop function if exists public.list_marketplace_influencers(
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean,
  uuid
);

create or replace function public.list_marketplace_influencers(
  p_search text default null,
  p_platform text default null,
  p_categories text[] default '{}'::text[],
  p_countries text[] default '{}'::text[],
  p_sort text default 'audience_desc',
  p_page integer default 1,
  p_page_size integer default 100,
  p_saved_only boolean default false,
  p_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_search_pattern text;
  v_platform text := nullif(lower(btrim(coalesce(p_platform, ''))), '');
  v_categories text[];
  v_countries text[];
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 10000 then
    raise exception 'p_page must be between 1 and 10000';
  end if;
  if p_page_size is distinct from 100 then
    raise exception 'p_page_size must be exactly 100';
  end if;
  if v_platform is not null and v_platform not in (
    'instagram', 'youtube', 'tiktok', 'naver_blog', 'other'
  ) then
    raise exception 'unsupported marketplace influencer platform';
  end if;
  if p_sort not in ('audience_desc', 'audience_asc', 'name_asc') then
    raise exception 'unsupported marketplace influencer sort';
  end if;
  if p_saved_only and p_organization_id is null then
    raise exception 'p_organization_id is required for saved-only results';
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

  with filtered as materialized (
    select
      directory.listing_key,
      directory.source_type,
      directory.source_id,
      directory.public_handle,
      directory.display_name,
      case
        when v_platform is null then directory.max_audience_count
        else nullif(directory.audience_counts ->> v_platform, '')::bigint
      end as audience_sort_count
    from public.marketplace_public_influencer_directory as directory
    where
      (
        v_search = ''
        or directory.search_text like v_search_pattern escape '\'
      )
      and (v_platform is null or v_platform = any(directory.platforms))
      and (cardinality(v_categories) = 0 or directory.category_keys && v_categories)
      and (cardinality(v_countries) = 0 or directory.audience_countries && v_countries)
      and (
        not p_saved_only
        or exists (
          select 1
          from public.advertiser_saved_influencers as saved
          where
            saved.organization_id = p_organization_id
            and saved.influencer_public_handle = directory.public_handle
        )
      )
  ), counted as (
    select count(*)::bigint as total
    from filtered
  ), ranked as (
    select
      filtered.*,
      row_number() over (
        order by
          case when p_sort = 'audience_desc' then audience_sort_count end desc nulls last,
          case when p_sort = 'audience_asc' then audience_sort_count end asc nulls last,
          case when p_sort = 'name_asc' then lower(display_name) end asc,
          lower(display_name) asc,
          public_handle asc,
          listing_key asc
      ) as result_number
    from filtered
  ), paged as (
    select *
    from ranked
    where
      result_number > ((p_page - 1)::bigint * p_page_size::bigint)
      and result_number <= (p_page::bigint * p_page_size::bigint)
    order by result_number
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'listing_key', paged.listing_key,
          'source_type', paged.source_type,
          'source_id', paged.source_id,
          'public_handle', paged.public_handle
        )
        order by paged.result_number
      ),
      '[]'::jsonb
    ),
    (select total from counted)
  into v_items, v_total
  from paged;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'total_pages', case
      when v_total = 0 then 0
      else ceil(v_total::numeric / p_page_size::numeric)::bigint
    end,
    'has_more', (p_page::bigint * p_page_size::bigint) < v_total
  );
end;
$$;

revoke all on function public.directsign_public_audience_count(text)
  from public, anon, authenticated;
revoke all on function public.directsign_public_creator_category_key(text)
  from public, anon, authenticated;
revoke all on function public.directsign_public_creator_category_keys(text[])
  from public, anon, authenticated;
revoke all on function public.directsign_refresh_registered_influencer_directory(uuid)
  from public, anon, authenticated;
revoke all on function public.directsign_sync_registered_influencer_directory()
  from public, anon, authenticated;
revoke all on function public.directsign_sync_registered_channel_directory()
  from public, anon, authenticated;
revoke all on function public.directsign_remove_unlisted_discovered_directory()
  from public, anon, authenticated;
revoke all on function public.list_marketplace_influencers(
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean,
  uuid
) from public, anon, authenticated;

grant execute on function public.directsign_public_audience_count(text)
  to service_role;
grant execute on function public.directsign_public_creator_category_key(text)
  to service_role;
grant execute on function public.directsign_public_creator_category_keys(text[])
  to service_role;
grant execute on function public.directsign_refresh_registered_influencer_directory(uuid)
  to service_role;
grant execute on function public.list_marketplace_influencers(
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean,
  uuid
) to service_role;

comment on table public.marketplace_public_influencer_directory is
  'Server-only sanitized read model for exact public influencer filtering, sorting, counting, and pagination. Raw source evidence is intentionally excluded.';
comment on function public.list_marketplace_influencers(
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean,
  uuid
) is
  'Service-role-only exact influencer directory query. Filters and global sort are applied before the fixed 100-row numbered page.';

-- Deliberately no INSERT/UPDATE backfill appears in this migration. Existing
-- discovered candidates become visible only after the separately reviewed
-- rebuild-public-influencer-directory.mjs --apply run.

notify pgrst, 'reload schema';
