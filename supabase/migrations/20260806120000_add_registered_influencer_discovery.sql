-- Keep completed influencer members discoverable to signed-in advertisers
-- without publishing those members through the anonymous/SEO directory.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create extension if not exists pg_trgm with schema extensions;

create schema if not exists directsign_private;
revoke all on schema directsign_private from public, anon;
grant usage on schema directsign_private to service_role;

alter table public.marketplace_influencer_profiles
  add column if not exists registered_identity_only boolean
    not null default false;

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_registered_identity_state;
alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_registered_identity_state
  check (
    not registered_identity_only
    or (
      not is_published
      and public_handle ~ '^rm-[a-f0-9]{27}$'
      and cardinality(audience_countries) = 0
    )
  );

-- Reserve the opaque rm-* namespace for the UUID-derived provisional identity.
-- Publishing keeps the row id stable but replaces this placeholder with the
-- approved-platform public handle.
do $$
begin
  if exists (
    select 1
    from public.marketplace_influencer_profiles as marketplace_profile
    where marketplace_profile.public_handle ~ '^rm-[a-f0-9]{27}$'
      and (
        not marketplace_profile.registered_identity_only
        or marketplace_profile.public_handle <>
          'rm-' || left(md5(marketplace_profile.owner_profile_id::text), 27)
      )
  ) then
    raise exception
      'marketplace influencer rm-* namespace contains a non-provisional handle';
  end if;
end;
$$;

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_registered_handle_owner;
alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_registered_handle_owner
  check (
    (
      registered_identity_only
      and public_handle = 'rm-' || left(md5(owner_profile_id::text), 27)
    )
    or (
      not registered_identity_only
      and public_handle !~ '^rm-[a-f0-9]{27}$'
    )
  );

create table if not exists public.marketplace_registered_influencer_directory (
  owner_profile_id uuid primary key
    references public.profiles (id) on delete cascade,
  registered_handle text not null,
  display_name text not null,
  avatar_url text,
  search_text text not null default '',
  category_keys text[] not null default '{}'::text[],
  creator_countries text[] not null default '{}'::text[],
  country_display_label text,
  platforms text[] not null default '{}'::text[],
  verified_channels jsonb not null default '[]'::jsonb,
  audience_counts jsonb not null default '{}'::jsonb,
  max_audience_count bigint,
  registered_member_visibility text not null
    default 'authenticated_advertisers',
  platform_verified boolean not null default false,
  public_marketplace_profile_id uuid not null unique
    references public.marketplace_influencer_profiles (id) on delete cascade,
  public_profile_published boolean not null default false,
  public_profile_handle text,
  source_updated_at timestamptz not null,
  eligibility_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_registered_influencer_handle_stable check (
    registered_handle =
      'rm-' || left(md5(owner_profile_id::text), 27)
  ),
  constraint marketplace_registered_influencer_handle_format check (
    registered_handle ~ '^rm-[a-f0-9]{27}$'
  ),
  constraint marketplace_registered_influencer_name_not_blank check (
    btrim(display_name) <> '' and length(display_name) <= 120
  ),
  constraint marketplace_registered_influencer_avatar_safe check (
    avatar_url is null
    or (
      length(avatar_url) <= 2048
      and avatar_url ~* '^https?://'
    )
  ),
  constraint marketplace_registered_influencer_categories_not_null check (
    array_position(category_keys, null) is null
  ),
  constraint marketplace_registered_influencer_countries_not_null check (
    array_position(creator_countries, null) is null
  ),
  constraint marketplace_registered_influencer_country_label check (
    (
      cardinality(creator_countries) = 0
      and country_display_label = '국가 미확인'
    )
    or (
      cardinality(creator_countries) > 0
      and country_display_label is null
    )
  ),
  constraint marketplace_registered_influencer_platforms_allowed check (
    platforms <@ array[
      'instagram',
      'youtube',
      'tiktok',
      'naver_blog',
      'other'
    ]::text[]
    and array_position(platforms, null) is null
  ),
  constraint marketplace_registered_influencer_verified_channels_array check (
    jsonb_typeof(verified_channels) = 'array'
  ),
  constraint marketplace_registered_influencer_audience_counts_object check (
    jsonb_typeof(audience_counts) = 'object'
  ),
  constraint marketplace_registered_influencer_max_audience_nonnegative check (
    max_audience_count is null or max_audience_count >= 0
  ),
  constraint marketplace_registered_influencer_visibility_private check (
    registered_member_visibility = 'authenticated_advertisers'
  ),
  constraint marketplace_registered_influencer_public_handle_state check (
    (
      public_profile_published
      and public_profile_handle is not null
      and public_profile_handle ~
        '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$'
    )
    or (
      not public_profile_published
      and public_profile_handle is null
    )
  ),
  constraint marketplace_registered_influencer_verification_consistent check (
    platform_verified = (
      cardinality(platforms) > 0
      and jsonb_array_length(verified_channels) > 0
    )
  ),
  constraint marketplace_registered_influencer_unverified_empty check (
    platform_verified
    or (
      cardinality(platforms) = 0
      and verified_channels = '[]'::jsonb
      and audience_counts = '{}'::jsonb
      and max_audience_count is null
    )
  ),
  constraint marketplace_registered_influencer_eligibility_not_blank check (
    btrim(eligibility_version) <> ''
  )
);

create unique index if not exists
  marketplace_registered_influencer_directory_handle_uidx
  on public.marketplace_registered_influencer_directory (
    lower(registered_handle)
  );

create index if not exists
  marketplace_registered_influencer_directory_platforms_gin_idx
  on public.marketplace_registered_influencer_directory using gin (platforms);

create index if not exists
  marketplace_registered_influencer_directory_categories_gin_idx
  on public.marketplace_registered_influencer_directory
  using gin (category_keys);

create index if not exists
  marketplace_registered_influencer_directory_countries_gin_idx
  on public.marketplace_registered_influencer_directory
  using gin (creator_countries);

create index if not exists
  marketplace_registered_influencer_directory_search_trgm_idx
  on public.marketplace_registered_influencer_directory
  using gin (search_text extensions.gin_trgm_ops);

create index if not exists
  marketplace_registered_influencer_directory_audience_desc_idx
  on public.marketplace_registered_influencer_directory (
    max_audience_count desc nulls last,
    lower(display_name),
    registered_handle,
    owner_profile_id
  );

alter table public.marketplace_registered_influencer_directory
  enable row level security;

revoke all on table public.marketplace_registered_influencer_directory
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.marketplace_registered_influencer_directory
  to service_role;

create or replace function directsign_private.directsign_email_is_operational(
  p_email text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    btrim(coalesce(p_email, '')) <> ''
    and lower(p_email)
      !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
    and lower(p_email)
      !~ '@(example[.](com|org|net)|directsign[.]app)$'
    and lower(split_part(p_email, '@', 2)) <> 'test'
    and lower(split_part(p_email, '@', 2)) !~ '[.]test$'
    and not (
      lower(split_part(p_email, '@', 2)) = 'yeollock.me'
      and lower(split_part(p_email, '@', 1)) in (
        'breadroom.manager',
        'test.influencer',
        'creator.sora',
        'breadroom',
        'breadroom-partner',
        'obre-beauty',
        'housefit',
        'brewinglab',
        'nightcare',
        'minseo.home',
        'today.taste',
        'haru.fit',
        'ziyu.log',
        'luna.day',
        'yuna.beauty',
        'review.j',
        'only.routine',
        'harin.log',
        'moa.review',
        'sua.pick',
        'raon.beauty',
        'jian.home',
        'serin.daily',
        'narae.shorts',
        'romi.review',
        'sodam.pick'
      )
    );
$$;

create or replace function directsign_private.directsign_has_test_marker(
  p_value text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(p_value, '')) = '' then false
    else
      lower(p_value) ~
        '(^|[^a-z0-9])(qa|test|demo|seed|showcase|dummy)([^a-z0-9]|$)'
      or lower(p_value) ~ '(테스트|데모|시드|쇼케이스|더미)'
      or exists (
        select 1
        from unnest(array[
          '광고주.매니저',
          '브레드룸',
          '브래드룸',
          'breadroom',
          'breadroom.partner',
          '오브레',
          'obre',
          '하우스핏',
          'housefit',
          '브루잉랩',
          'brewinglab',
          '나이트케어',
          'nightcare',
          '크리에이터.소라',
          'creator.sora',
          '민서홈',
          'minseo.home',
          '오늘의취향',
          'today.taste',
          '하루핏',
          'haru.fit',
          '지유로그',
          'ziyu.log',
          '루나데이',
          'luna.day',
          '유나뷰티',
          'yuna.beauty',
          '리뷰제이',
          'review.j',
          '온리루틴',
          'only.routine',
          '하린로그',
          'harin.log',
          '모아리뷰',
          'moa.review',
          '수아픽',
          'sua.pick',
          '라온뷰티',
          'raon.beauty',
          '지안홈',
          'jian.home',
          '세린데일리',
          'serin.daily',
          '나래숏폼',
          'narae.shorts',
          '로미리뷰',
          'romi.review',
          '소담픽',
          'sodam.pick',
          '선정.크리에이터.계약',
          '완료.보관.캠페인',
          '브레드룸.여름.루틴',
          '브레드룸.신제품.언박싱',
          '파우치.필수템.쇼츠',
          '데일리.루틴.블로그',
          '성수.팝업',
          '나이트.케어.쇼츠',
          '공동구매.파일럿',
          '오브레.릴스',
          '브루잉랩.공동구매'
        ]::text[]) as known_marker(value)
        where strpos(
          lower(regexp_replace(btrim(p_value), '[[:space:]_-]+', '.', 'g')),
          known_marker.value
        ) > 0
      )
  end;
$$;

-- This helper is deliberately not exposed through PostgREST. It uses trusted
-- profile fields only and applies a second test-identity guard even when a bad
-- legacy row was incorrectly labelled production.
create or replace function directsign_private.directsign_is_operational_profile(
  p_profile_id uuid,
  p_expected_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as candidate
    join auth.users as auth_user
      on auth_user.id = candidate.id
    where candidate.id = p_profile_id
      and candidate.role::text = p_expected_role
      and candidate.data_origin = 'production'
      and btrim(candidate.name) <> ''
      and directsign_private.directsign_email_is_operational(candidate.email)
      and directsign_private.directsign_email_is_operational(auth_user.email)
      and not directsign_private.directsign_has_test_marker(candidate.name)
      and not directsign_private.directsign_has_test_marker(
        candidate.avatar_url
      )
      and lower(coalesce(auth_user.raw_app_meta_data, '{}'::jsonb)::text)
        !~ '"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"[[:space:]]*:[[:space:]]*(true|"true"|1|"1")'
      and lower(coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)::text)
        !~ '"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"[[:space:]]*:[[:space:]]*(true|"true"|1|"1")'
      and lower(coalesce(auth_user.raw_app_meta_data, '{}'::jsonb)::text)
        !~ '"(data_origin|environment)"[[:space:]]*:[[:space:]]*"(qa|demo|seed|test)"'
      and lower(coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)::text)
        !~ '"(data_origin|environment)"[[:space:]]*:[[:space:]]*"(qa|demo|seed|test)"'
  );
$$;

create or replace function directsign_private.directsign_refresh_registered_member_discovery(
  p_owner_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_marketplace_profile public.marketplace_influencer_profiles%rowtype;
  v_registered_handle text;
  v_avatar_url text;
  v_category_keys text[] := '{}'::text[];
  v_creator_countries text[] := '{}'::text[];
  v_country_display_label text := '국가 미확인';
  v_platforms text[] := '{}'::text[];
  v_verified_channels jsonb := '[]'::jsonb;
  v_audience_counts jsonb := '{}'::jsonb;
  v_max_audience_count bigint;
  v_verified_handles text := '';
  v_previous_public_profile_handle text;
  v_saved_alias_handles text[] := '{}'::text[];
  v_saved_identity_lock_handle text;
  v_verification_updated_at timestamptz;
  v_channel_updated_at timestamptz;
  v_search_text text;
  v_source_updated_at timestamptz;
begin
  select *
  into v_profile
  from public.profiles
  where id = p_owner_profile_id;

  if not found
     or not directsign_private.directsign_is_operational_profile(
       p_owner_profile_id,
       'influencer'
     ) then
    delete from public.marketplace_registered_influencer_directory
    where owner_profile_id = p_owner_profile_id;
    return;
  end if;

  v_registered_handle :=
    'rm-' || left(md5(p_owner_profile_id::text), 27);
  v_avatar_url := case
    when btrim(coalesce(v_profile.avatar_url, '')) ~* '^https?://'
      then left(btrim(v_profile.avatar_url), 2048)
    else null
  end;
  v_category_keys := public.directsign_public_creator_category_keys(
    coalesce(v_profile.activity_categories, '{}'::text[])
  );

  -- Proposals and the influencer inbox already use the marketplace profile id
  -- as their durable target. Materialize only that identity here: it remains
  -- unpublished, carries no platform/follower claims, and therefore cannot be
  -- picked up by the anonymous public-directory trigger.
  insert into public.marketplace_influencer_profiles (
    owner_profile_id,
    public_handle,
    display_name,
    headline,
    bio,
    location,
    avatar_label,
    avatar_url,
    categories,
    audience,
    audience_tags,
    audience_countries,
    collaboration_types,
    starting_price_label,
    response_time_label,
    verified_label,
    brand_fit,
    recent_brands,
    portfolio,
    proposal_hints,
    is_published,
    registered_identity_only,
    data_origin,
    updated_at
  ) values (
    p_owner_profile_id,
    v_registered_handle,
    left(btrim(v_profile.name), 120),
    '프로필 작성 전',
    '프로필 작성 전',
    '국가 미확인',
    'IN',
    v_avatar_url,
    coalesce(v_profile.activity_categories, '{}'::text[]),
    '정보 미입력',
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    '정보 미입력',
    '정보 미입력',
    '플랫폼 인증 전',
    '{}'::text[],
    '{}'::text[],
    '[]'::jsonb,
    '{}'::text[],
    false,
    true,
    'production',
    v_profile.updated_at
  )
  on conflict (owner_profile_id) do nothing;

  select marketplace_profile.*
  into v_marketplace_profile
  from public.marketplace_influencer_profiles as marketplace_profile
  where marketplace_profile.owner_profile_id = p_owner_profile_id
    and marketplace_profile.data_origin = 'production'
  limit 1;

  if not found then
    -- A production member linked to a non-production marketplace row is a
    -- quarantined data-origin mismatch. Never expose or overwrite that row.
    delete from public.marketplace_registered_influencer_directory
    where owner_profile_id = p_owner_profile_id;
    v_marketplace_profile := null;
    return;
  end if;

  select registered_member.public_profile_handle
  into v_previous_public_profile_handle
  from public.marketplace_registered_influencer_directory as registered_member
  where registered_member.owner_profile_id = p_owner_profile_id;

  -- A creator's audience market is not evidence of the creator's own country.
  -- Until an official-platform country or explicit self-description evidence
  -- field is introduced, registered members remain country-unknown.
  v_creator_countries := '{}'::text[];
  v_country_display_label := '국가 미확인';

  with approved_raw as (
    select distinct on (
      request.platform,
      lower(regexp_replace(btrim(request.platform_handle), '^@+', ''))
    )
      request.platform::text as platform,
      lower(regexp_replace(btrim(request.platform_handle), '^@+', ''))
        as handle,
      case
        when btrim(coalesce(request.platform_url, '')) ~* '^https?://'
          then left(btrim(request.platform_url), 2048)
        else null
      end as url,
      greatest(request.updated_at, request.reviewed_at) as verified_updated_at
    from public.verification_requests as request
    where request.target_type::text = 'influencer_account'
      and request.verification_type::text = 'platform_account'
      and request.status::text = 'approved'
      and request.reviewed_at is not null
      and request.data_origin = 'production'
      and request.platform is not null
      and btrim(coalesce(request.platform_handle, '')) <> ''
      and length(
        lower(regexp_replace(btrim(request.platform_handle), '^@+', ''))
      ) <= 160
      and (
        btrim(coalesce(request.submitted_by_email, '')) = ''
        or directsign_private.directsign_email_is_operational(
          request.submitted_by_email
        )
      )
      and not directsign_private.directsign_has_test_marker(concat_ws(
        ' ',
        request.subject_name,
        request.submitted_by_name,
        request.platform_handle,
        request.platform_url,
        request.note,
        request.reviewer_note
      ))
      and lower(coalesce(request.evidence_snapshot_json, '{}'::jsonb)::text)
        !~ '"(seeded|is_test|test_data)"[[:space:]]*:[[:space:]]*true'
      and (
        (
          (request.profile_id is not null or btrim(request.target_id) <> '')
          and (
            request.profile_id is null
            or request.profile_id = p_owner_profile_id
          )
          and (
            btrim(request.target_id) = ''
            or request.target_id = p_owner_profile_id::text
          )
        )
        or (
          request.profile_id is null
          and btrim(request.target_id) = ''
          and lower(btrim(coalesce(request.submitted_by_email, ''))) =
            lower(btrim(v_profile.email))
        )
      )
    order by
      request.platform,
      lower(regexp_replace(btrim(request.platform_handle), '^@+', '')),
      request.reviewed_at desc,
      request.created_at desc,
      request.id desc
  ),
  approved as (
    select *
    from approved_raw
    where handle <> ''
    order by platform, handle
  ),
  enriched as (
    select
      approved.platform,
      approved.handle,
      approved.url,
      approved.verified_updated_at,
      matched_channel.follower_count,
      matched_channel.updated_at as channel_updated_at
    from approved
    left join lateral (
      select
        channel.follower_count,
        channel.updated_at
      from public.marketplace_influencer_channels as channel
      where v_marketplace_profile.id is not null
        and channel.profile_id = v_marketplace_profile.id
        and channel.platform::text = approved.platform
        and lower(regexp_replace(btrim(channel.handle), '^@+', '')) =
          approved.handle
      order by
        channel.follower_count desc nulls last,
        channel.updated_at desc,
        channel.id desc
      limit 1
    ) as matched_channel on true
  ),
  per_platform as (
    select
      enriched.platform,
      max(enriched.follower_count) as follower_count
    from enriched
    group by enriched.platform
  )
  select
    coalesce(
      (select array_agg(platform order by platform)
       from (select distinct platform from enriched) as unique_platforms),
      '{}'::text[]
    ),
    coalesce(
      (select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'platform', enriched.platform,
          'handle', enriched.handle,
          'url', enriched.url,
          'follower_count', enriched.follower_count
        ))
        order by enriched.platform, enriched.handle
      ) from enriched),
      '[]'::jsonb
    ),
    coalesce(
      (select jsonb_object_agg(
        per_platform.platform,
        per_platform.follower_count
        order by per_platform.platform
      ) filter (where per_platform.follower_count is not null)
       from per_platform),
      '{}'::jsonb
    ),
    (select max(follower_count) from per_platform),
    coalesce(
      (select string_agg(handle, ' ' order by platform, handle)
       from enriched),
      ''
    ),
    (select max(verified_updated_at) from enriched),
    (select max(channel_updated_at) from enriched)
  into
    v_platforms,
    v_verified_channels,
    v_audience_counts,
    v_max_audience_count,
    v_verified_handles,
    v_verification_updated_at,
    v_channel_updated_at;

  v_search_text := lower(regexp_replace(concat_ws(
    ' ',
    left(btrim(v_profile.name), 120),
    v_registered_handle,
    array_to_string(v_category_keys, ' '),
    array_to_string(v_creator_countries, ' '),
    v_verified_handles
  ), '\s+', ' ', 'g'));

  v_source_updated_at := greatest(
    v_profile.updated_at,
    coalesce(v_marketplace_profile.updated_at, v_profile.updated_at),
    coalesce(v_verification_updated_at, v_profile.updated_at),
    coalesce(v_channel_updated_at, v_profile.updated_at)
  );

  insert into public.marketplace_registered_influencer_directory (
    owner_profile_id,
    registered_handle,
    display_name,
    avatar_url,
    search_text,
    category_keys,
    creator_countries,
    country_display_label,
    platforms,
    verified_channels,
    audience_counts,
    max_audience_count,
    registered_member_visibility,
    platform_verified,
    public_marketplace_profile_id,
    public_profile_published,
    public_profile_handle,
    source_updated_at,
    eligibility_version,
    updated_at
  ) values (
    p_owner_profile_id,
    v_registered_handle,
    left(btrim(v_profile.name), 120),
    v_avatar_url,
    left(v_search_text, 20000),
    v_category_keys,
    v_creator_countries,
    v_country_display_label,
    v_platforms,
    v_verified_channels,
    v_audience_counts,
    v_max_audience_count,
    'authenticated_advertisers',
    cardinality(v_platforms) > 0,
    v_marketplace_profile.id,
    coalesce(v_marketplace_profile.is_published, false),
    case
      when coalesce(v_marketplace_profile.is_published, false)
        then lower(v_marketplace_profile.public_handle)
      else null
    end,
    v_source_updated_at,
    '2026-08-registered-member-v1',
    clock_timestamp()
  )
  on conflict (owner_profile_id) do update set
    -- registered_handle is intentionally immutable after first materialization.
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    search_text = excluded.search_text,
    category_keys = excluded.category_keys,
    creator_countries = excluded.creator_countries,
    country_display_label = excluded.country_display_label,
    platforms = excluded.platforms,
    verified_channels = excluded.verified_channels,
    audience_counts = excluded.audience_counts,
    max_audience_count = excluded.max_audience_count,
    registered_member_visibility = excluded.registered_member_visibility,
    platform_verified = excluded.platform_verified,
    public_marketplace_profile_id = excluded.public_marketplace_profile_id,
    public_profile_published = excluded.public_profile_published,
    public_profile_handle = excluded.public_profile_handle,
    source_updated_at = excluded.source_updated_at,
    eligibility_version = excluded.eligibility_version,
    updated_at = excluded.updated_at;

  -- An advertiser may have saved the creator before the member account was
  -- verified, using either a former public-profile handle or the public handle
  -- of an externally discovered channel. Once those identities are linked by
  -- an approved exact platform handle, collapse every alias onto the stable
  -- rm-* member identity. This runs on signup, verification, profile, and
  -- channel refreshes, so the saved-only list cannot lose the creator later.
  select coalesce(
    array_agg(distinct alias.public_handle order by alias.public_handle),
    '{}'::text[]
  )
  into v_saved_alias_handles
  from (
    select lower(btrim(v_previous_public_profile_handle)) as public_handle
    where btrim(coalesce(v_previous_public_profile_handle, '')) <> ''

    union

    select lower(btrim(v_marketplace_profile.public_handle)) as public_handle
    where coalesce(v_marketplace_profile.is_published, false)
      and btrim(coalesce(v_marketplace_profile.public_handle, '')) <> ''

    union

    select lower(public_directory.public_handle) as public_handle
    from public.marketplace_public_influencer_directory as public_directory
    join public.discovered_influencer_profiles as discovered
      on public_directory.source_type = 'discovered'
      and discovered.id = public_directory.source_id
    join lateral jsonb_array_elements(v_verified_channels)
      as verified_channel(value)
      on verified_channel.value ->> 'platform' = discovered.platform::text
      and lower(regexp_replace(
        btrim(verified_channel.value ->> 'handle'),
        '^@+',
        ''
      )) = lower(regexp_replace(
        btrim(discovered.platform_handle),
        '^@+',
        ''
      ))
  ) as alias
  where alias.public_handle <> ''
    and alias.public_handle <> v_registered_handle;

  -- Serialize the alias collapse with save/unsave mutations. Lock every known
  -- alias in a deterministic order so a verification commit can never land
  -- between canonical handle resolution and the corresponding bookmark write.
  for v_saved_identity_lock_handle in
    select distinct candidate.handle
    from unnest(
      array_append(v_saved_alias_handles, v_registered_handle)
    ) as candidate(handle)
    where btrim(coalesce(candidate.handle, '')) <> ''
    order by candidate.handle
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'directsign:marketplace-saved-influencer:' ||
          v_saved_identity_lock_handle,
        0
      )
    );
  end loop;

  with removed_alias_saves as (
    delete from public.advertiser_saved_influencers as saved
    where saved.influencer_public_handle = any(v_saved_alias_handles)
    returning
      saved.organization_id,
      saved.created_by_profile_id,
      saved.created_at,
      saved.influencer_public_handle
  )
  insert into public.advertiser_saved_influencers (
    organization_id,
    influencer_public_handle,
    created_by_profile_id,
    created_at
  )
  select distinct on (saved.organization_id)
    saved.organization_id,
    v_registered_handle,
    saved.created_by_profile_id,
    saved.created_at
  from removed_alias_saves as saved
  order by
    saved.organization_id,
    saved.created_at asc,
    saved.influencer_public_handle asc
  on conflict (organization_id, influencer_public_handle) do nothing;
end;
$$;

-- Resolve every customer-facing alias to the stable registered member handle.
-- The service uses this for both save and unsave so a stale browser tab cannot
-- recreate a discovered alias or fail to remove the canonical interest row
-- after platform verification linked the two identities.
create or replace function public.resolve_marketplace_saved_influencer_handle(
  p_handle text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  v_registered_handle text;
begin
  if v_handle !~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$' then
    return null;
  end if;

  select registered_member.registered_handle
  into v_registered_handle
  from public.marketplace_registered_influencer_directory as registered_member
  where registered_member.registered_handle = v_handle
     or registered_member.public_profile_handle = v_handle
  order by
    (registered_member.registered_handle = v_handle) desc,
    registered_member.updated_at desc,
    registered_member.registered_handle asc
  limit 1;

  if v_registered_handle is not null then
    return v_registered_handle;
  end if;

  select registered_member.registered_handle
  into v_registered_handle
  from public.marketplace_public_influencer_directory as public_directory
  join public.discovered_influencer_profiles as discovered
    on public_directory.source_type = 'discovered'
    and discovered.id = public_directory.source_id
  join public.marketplace_registered_influencer_directory as registered_member
    on registered_member.platform_verified
  join lateral jsonb_array_elements(registered_member.verified_channels)
    as verified_channel(value)
    on verified_channel.value ->> 'platform' = discovered.platform::text
    and lower(regexp_replace(
      btrim(verified_channel.value ->> 'handle'),
      '^@+',
      ''
    )) = lower(regexp_replace(
      btrim(discovered.platform_handle),
      '^@+',
      ''
    ))
  where public_directory.public_handle = v_handle
  order by
    registered_member.source_updated_at desc,
    registered_member.registered_handle asc
  limit 1;

  return coalesce(v_registered_handle, v_handle);
end;
$$;

-- Resolve and mutate in one database transaction. The requested-alias lock is
-- also acquired by the verification refresh above, closing the exact boundary
-- where an old discovered handle could otherwise be reinserted after migration.
create or replace function public.mutate_marketplace_saved_influencer(
  p_organization_id uuid,
  p_created_by_profile_id uuid,
  p_requested_handle text,
  p_saved boolean
)
returns table (
  handle text,
  requested_handle text,
  saved boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_requested_handle text := lower(btrim(coalesce(p_requested_handle, '')));
  v_canonical_handle text;
begin
  if p_organization_id is null or p_created_by_profile_id is null then
    raise exception 'Advertiser organization and actor are required'
      using errcode = '22023';
  end if;

  if p_saved is null then
    raise exception 'Saved state is required'
      using errcode = '22023';
  end if;

  if v_requested_handle !~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$' then
    raise exception 'Influencer handle is invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations as organization
    join public.organization_members as membership
      on membership.organization_id = organization.id
    where organization.id = p_organization_id
      and organization.deleted_at is null
      and organization.organization_type = 'advertiser'
      and membership.profile_id = p_created_by_profile_id
      and membership.role::text in ('owner', 'admin', 'marketer')
  ) then
    raise exception 'Advertiser organization membership is required'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'directsign:marketplace-saved-influencer:' || v_requested_handle,
      0
    )
  );

  v_canonical_handle :=
    public.resolve_marketplace_saved_influencer_handle(v_requested_handle);
  if v_canonical_handle is null then
    raise exception 'Influencer handle could not be resolved'
      using errcode = '22023';
  end if;

  if p_saved then
    insert into public.advertiser_saved_influencers (
      organization_id,
      influencer_public_handle,
      created_by_profile_id
    )
    values (
      p_organization_id,
      v_canonical_handle,
      p_created_by_profile_id
    )
    on conflict (organization_id, influencer_public_handle) do nothing;
  else
    delete from public.advertiser_saved_influencers as advertiser_save
    where advertiser_save.organization_id = p_organization_id
      and advertiser_save.influencer_public_handle = v_canonical_handle;
  end if;

  return query
  select v_canonical_handle, v_requested_handle, p_saved;
end;
$$;

create or replace function directsign_private.directsign_sync_registered_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.marketplace_registered_influencer_directory
    where owner_profile_id = old.id;
    return old;
  end if;

  perform directsign_private.directsign_refresh_registered_member_discovery(
    new.id
  );
  return new;
end;
$$;

drop trigger if exists profiles_sync_registered_member_discovery
  on public.profiles;
create trigger profiles_sync_registered_member_discovery
after insert or delete or update of
  role,
  name,
  email,
  avatar_url,
  activity_categories,
  data_origin
on public.profiles
for each row execute function
  directsign_private.directsign_sync_registered_member_profile();

create or replace function directsign_private.directsign_uuid_or_null(
  p_value text
)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_value, '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_value::uuid
    else null::uuid
  end;
$$;

create or replace function directsign_private.directsign_sync_registered_member_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_profile_id uuid;
  v_old_target_profile_id uuid;
  v_new_profile_id uuid;
  v_new_target_profile_id uuid;
  v_candidate_profile_id uuid;
begin
  if tg_op <> 'INSERT'
     and old.target_type::text = 'influencer_account' then
    v_old_profile_id := old.profile_id;
    v_old_target_profile_id :=
      directsign_private.directsign_uuid_or_null(old.target_id);
  end if;

  if tg_op <> 'DELETE'
     and new.target_type::text = 'influencer_account' then
    v_new_profile_id := new.profile_id;
    v_new_target_profile_id :=
      directsign_private.directsign_uuid_or_null(new.target_id);
  end if;

  for v_candidate_profile_id in
    select distinct candidate_profile_id
    from unnest(array[
      v_old_profile_id,
      v_old_target_profile_id,
      v_new_profile_id,
      v_new_target_profile_id
    ]) as candidate_profile_id
    where candidate_profile_id is not null
  loop
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_candidate_profile_id
    );
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists verification_requests_sync_registered_member_discovery
  on public.verification_requests;
create trigger verification_requests_sync_registered_member_discovery
after insert or delete or update of
  target_type,
  target_id,
  verification_type,
  status,
  profile_id,
  platform,
  platform_handle,
  platform_url,
  subject_name,
  submitted_by_name,
  submitted_by_email,
  evidence_snapshot_json,
  note,
  reviewer_note,
  reviewed_at,
  data_origin
on public.verification_requests
for each row execute function
  directsign_private.directsign_sync_registered_member_verification();

create or replace function directsign_private.directsign_sync_registered_member_marketplace_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      old.owner_profile_id
    );
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.owner_profile_id is distinct from old.owner_profile_id then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      old.owner_profile_id
    );
  end if;

  perform directsign_private.directsign_refresh_registered_member_discovery(
    new.owner_profile_id
  );
  return new;
end;
$$;

drop trigger if exists marketplace_profiles_sync_registered_member_discovery
  on public.marketplace_influencer_profiles;
create trigger marketplace_profiles_sync_registered_member_discovery
after insert or delete or update of
  owner_profile_id,
  is_published,
  registered_identity_only,
  audience_countries,
  data_origin,
  updated_at
on public.marketplace_influencer_profiles
for each row execute function
  directsign_private.directsign_sync_registered_member_marketplace_profile();

create or replace function directsign_private.directsign_sync_registered_member_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_owner_profile_id uuid;
  v_new_owner_profile_id uuid;
begin
  if tg_op <> 'INSERT' then
    select profile.owner_profile_id
    into v_old_owner_profile_id
    from public.marketplace_influencer_profiles as profile
    where profile.id = old.profile_id;
  end if;

  if tg_op <> 'DELETE' then
    select profile.owner_profile_id
    into v_new_owner_profile_id
    from public.marketplace_influencer_profiles as profile
    where profile.id = new.profile_id;
  end if;

  if v_old_owner_profile_id is not null then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_old_owner_profile_id
    );
  end if;
  if v_new_owner_profile_id is not null
     and v_new_owner_profile_id is distinct from v_old_owner_profile_id then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_new_owner_profile_id
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists marketplace_channels_sync_registered_member_discovery
  on public.marketplace_influencer_channels;
create trigger marketplace_channels_sync_registered_member_discovery
after insert or delete or update of
  profile_id,
  platform,
  handle,
  url,
  follower_count,
  updated_at
on public.marketplace_influencer_channels
for each row execute function
  directsign_private.directsign_sync_registered_member_channel();

-- The public/SEO RPC remains unchanged. This authenticated RPC is the only
-- client-visible path that adds private registered-member identities.
drop function if exists public.list_authenticated_marketplace_influencers(
  uuid,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean
);

create or replace function public.list_authenticated_marketplace_influencers(
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
  v_actor_profile_id uuid := auth.uid();
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_search_pattern text;
  v_platform text := nullif(lower(btrim(coalesce(p_platform, ''))), '');
  v_categories text[];
  v_countries text[];
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.role() is distinct from 'authenticated'
     or v_actor_profile_id is null
     or not directsign_private.directsign_is_operational_profile(
       v_actor_profile_id,
       'marketer'
     ) then
    raise exception 'authenticated production advertiser profile required'
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
         and membership.profile_id = v_actor_profile_id
         and membership.role::text in ('owner', 'admin', 'marketer')
     ) then
    raise exception 'active advertiser organization membership required'
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

  with registered_verified_identities as materialized (
    select distinct
      verified_channel.value ->> 'platform' as platform,
      lower(regexp_replace(
        btrim(verified_channel.value ->> 'handle'),
        '^@+',
        ''
      )) as handle
    from public.marketplace_registered_influencer_directory
      as registered_member
    cross join lateral jsonb_array_elements(
      registered_member.verified_channels
    ) as verified_channel(value)
    where registered_member.platform_verified
      and btrim(coalesce(verified_channel.value ->> 'platform', '')) <> ''
      and btrim(coalesce(verified_channel.value ->> 'handle', '')) <> ''
  ),
  candidates as (
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
    left join registered_verified_identities as claimed_identity
      on claimed_identity.platform = discovered.platform::text
      and claimed_identity.handle = lower(regexp_replace(
        btrim(discovered.platform_handle),
        '^@+',
        ''
      ))
    where public_directory.source_type = 'discovered'
      -- Reserve rm-* for stable registered identities in this private view.
      and public_directory.public_handle !~ '^rm-[a-f0-9]{27}$'
      and claimed_identity.platform is null

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
  filtered as materialized (
    select
      candidate.*,
      case
        when v_platform is null then candidate.max_audience_count
        else nullif(candidate.audience_counts ->> v_platform, '')::bigint
      end as audience_sort_count
    from candidates as candidate
    where (
      v_search = ''
      or candidate.search_text like v_search_pattern escape '\'
    )
      and (v_platform is null or v_platform = any(candidate.platforms))
      and (
        cardinality(v_categories) = 0
        or candidate.category_keys && v_categories
      )
      and (
        cardinality(v_countries) = 0
        or candidate.creator_countries && v_countries
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
  counted as (
    select count(*)::bigint as total
    from filtered
  ),
  ranked as (
    select
      filtered.*,
      row_number() over (
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
      ) as result_number
    from filtered
  ),
  paged as (
    select *
    from ranked
    where result_number > ((p_page - 1)::bigint * p_page_size::bigint)
      and result_number <= (p_page::bigint * p_page_size::bigint)
    order by result_number
  )
  select
    coalesce(
      jsonb_agg(
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

revoke all on function
  directsign_private.directsign_email_is_operational(text)
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_has_test_marker(text)
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_is_operational_profile(uuid, text)
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_refresh_registered_member_discovery(uuid)
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_sync_registered_member_profile()
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_uuid_or_null(text)
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_sync_registered_member_verification()
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_sync_registered_member_marketplace_profile()
  from public, anon, authenticated;
revoke all on function
  directsign_private.directsign_sync_registered_member_channel()
  from public, anon, authenticated;

grant execute on function
  directsign_private.directsign_refresh_registered_member_discovery(uuid)
  to service_role;

revoke all on function
  public.resolve_marketplace_saved_influencer_handle(text)
  from public, anon, authenticated;
grant execute on function
  public.resolve_marketplace_saved_influencer_handle(text)
  to service_role;

revoke all on function public.mutate_marketplace_saved_influencer(
  uuid,
  uuid,
  text,
  boolean
) from public, anon, authenticated;
grant execute on function public.mutate_marketplace_saved_influencer(
  uuid,
  uuid,
  text,
  boolean
) to service_role;

revoke all on function public.list_authenticated_marketplace_influencers(
  uuid,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean
) from public, anon, authenticated;
grant execute on function public.list_authenticated_marketplace_influencers(
  uuid,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean
) to authenticated;

-- Backfill every completed operating influencer profile. The refresh function
-- also enriches the already-approved platform accounts while preserving the
-- UUID-derived registered identity and leaving unverified channel data empty.
do $$
declare
  v_owner_profile_id uuid;
begin
  for v_owner_profile_id in
    select profile.id
    from public.profiles as profile
    where profile.role::text = 'influencer'
  loop
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
  end loop;
end;
$$;

-- Existing favorites may point at a member's former public handle. Collapse
-- them onto the stable rm identity so saved-only results and later toggles do
-- not drift when public profile metadata changes.
delete from public.advertiser_saved_influencers as saved
using public.marketplace_registered_influencer_directory as registered_member
where registered_member.public_profile_handle is not null
  and saved.influencer_public_handle = registered_member.public_profile_handle
  and saved.influencer_public_handle <> registered_member.registered_handle
  and exists (
    select 1
    from public.advertiser_saved_influencers as stable_saved
    where stable_saved.organization_id = saved.organization_id
      and stable_saved.influencer_public_handle =
        registered_member.registered_handle
  );

update public.advertiser_saved_influencers as saved
set influencer_public_handle = registered_member.registered_handle
from public.marketplace_registered_influencer_directory as registered_member
where registered_member.public_profile_handle is not null
  and saved.influencer_public_handle = registered_member.public_profile_handle
  and saved.influencer_public_handle <> registered_member.registered_handle;

comment on table public.marketplace_registered_influencer_directory is
  'Private sanitized read model for completed production influencer members. It is visible only through the authenticated advertiser RPC and never changes anonymous public/SEO eligibility.';
comment on column
  public.marketplace_registered_influencer_directory.registered_handle is
  'Stable opaque handle derived only from owner_profile_id; it never uses email or another raw PII field and is not replaced after platform verification.';
comment on column
  public.marketplace_registered_influencer_directory.registered_member_visibility is
  'Explicit private visibility marker. The only permitted value is authenticated_advertisers.';
comment on column
  public.marketplace_registered_influencer_directory.platform_verified is
  'True only when at least one production platform-account verification request has been approved.';
comment on function public.list_authenticated_marketplace_influencers(
  uuid,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean
) is
  'Exact 100-row advertiser-only discovery query. It unions publicly eligible discovered creators with private registered members after checking auth.uid(), trusted advertiser role, production origin, and active organization membership.';

notify pgrst, 'reload schema';
