-- Publish one consented minimal creator profile after email confirmation, then
-- promote the same profile and channel when platform ownership is approved.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.profiles
  add column if not exists activity_page_url text,
  add column if not exists activity_page_platform text,
  add column if not exists activity_page_handle text,
  add column if not exists public_profile_consent_at timestamptz,
  add column if not exists public_profile_consent_version text,
  add column if not exists public_profile_consent_source text,
  add column if not exists public_profile_setup_state text
    not null default 'setup_required';

alter table public.profiles
  drop constraint if exists profiles_activity_page_url_http,
  add constraint profiles_activity_page_url_http check (
    activity_page_url is null
    or (
      length(activity_page_url) <= 2048
      and activity_page_url ~* '^https://'
    )
  ),
  drop constraint if exists profiles_activity_page_platform_allowed,
  add constraint profiles_activity_page_platform_allowed check (
    activity_page_platform is null
    or activity_page_platform in (
      'instagram', 'youtube', 'tiktok', 'naver_blog', 'other'
    )
  ),
  drop constraint if exists profiles_activity_page_handle_safe,
  add constraint profiles_activity_page_handle_safe check (
    activity_page_handle is null
    or (
      btrim(activity_page_handle) <> ''
      and length(activity_page_handle) <= 160
      and activity_page_handle = regexp_replace(activity_page_handle, '^@+', '')
    )
  ),
  drop constraint if exists profiles_public_profile_setup_state_allowed,
  add constraint profiles_public_profile_setup_state_allowed check (
    public_profile_setup_state in (
      'setup_required', 'pending_email', 'minimal', 'complete'
    )
  ),
  drop constraint if exists profiles_public_profile_consent_complete,
  add constraint profiles_public_profile_consent_complete check (
    (
      public_profile_consent_at is null
      and public_profile_consent_version is null
    )
    or (
      public_profile_consent_at is not null
      and btrim(coalesce(public_profile_consent_version, '')) <> ''
    )
  );

alter table public.marketplace_influencer_profiles
  add column if not exists public_index_enabled boolean
    not null default false,
  add column if not exists profile_setup_state text
    not null default 'setup_required',
  add column if not exists representative_activity_page_url text;

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_headline_not_blank,
  drop constraint if exists marketplace_influencer_profiles_bio_not_blank,
  drop constraint if exists marketplace_influencer_profiles_profile_setup_state_allowed,
  add constraint marketplace_influencer_profiles_profile_setup_state_allowed check (
    profile_setup_state in ('setup_required', 'minimal', 'complete')
  ),
  drop constraint if exists marketplace_influencer_profiles_activity_page_http,
  add constraint marketplace_influencer_profiles_activity_page_http check (
    representative_activity_page_url is null
    or (
      length(representative_activity_page_url) <= 2048
      and representative_activity_page_url ~* '^https://'
    )
  );

-- Existing deliberately published profiles remain indexed. Provisional rm-*
-- identities remain private until the consented publisher below runs.
update public.marketplace_influencer_profiles
set
  public_index_enabled = true,
  profile_setup_state = case
    when btrim(coalesce(headline, '')) <> '' and avatar_url is not null
      then 'complete'
    else 'minimal'
  end
where is_published
  and not registered_identity_only
  and public_handle !~ '^rm-[a-f0-9]{27}$';

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_registered_identity_state,
  add constraint marketplace_influencer_profiles_registered_identity_state check (
    (
      registered_identity_only
      and not is_published
      and not public_index_enabled
      and profile_setup_state = 'setup_required'
      and public_handle ~ '^rm-[a-f0-9]{27}$'
      and cardinality(audience_countries) = 0
    )
    or not registered_identity_only
  ),
  drop constraint if exists marketplace_influencer_profiles_registered_handle_owner,
  add constraint marketplace_influencer_profiles_registered_handle_owner check (
    (
      registered_identity_only
      and public_handle = 'rm-' || left(md5(owner_profile_id::text), 27)
    )
    or (
      not registered_identity_only
      and (
        public_handle !~ '^rm-[a-f0-9]{27}$'
        or (
          public_handle = 'rm-' || left(md5(owner_profile_id::text), 27)
          and is_published
          and not public_index_enabled
          and profile_setup_state = 'minimal'
        )
      )
    )
  );

alter table public.marketplace_influencer_channels
  add column if not exists ownership_status text
    not null default 'verified';

alter table public.marketplace_influencer_channels
  drop constraint if exists marketplace_influencer_channels_ownership_status_allowed,
  add constraint marketplace_influencer_channels_ownership_status_allowed check (
    ownership_status in ('unverified', 'verified')
  );

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
      and candidate.email_verified_at is not null
      and auth_user.email_confirmed_at is not null
      and btrim(candidate.name) <> ''
      and directsign_private.directsign_email_is_operational(candidate.email)
      and directsign_private.directsign_email_is_operational(auth_user.email)
      and not directsign_private.directsign_has_test_marker(candidate.name)
      and not directsign_private.directsign_has_test_marker(candidate.avatar_url)
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

create or replace function public.directsign_publish_minimal_influencer_profile(
  p_owner_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_marketplace_profile public.marketplace_influencer_profiles%rowtype;
  v_registered_handle text;
  v_channel_id uuid;
begin
  select *
  into v_profile
  from public.profiles
  where id = p_owner_profile_id
  for update;

  if not found
     or not directsign_private.directsign_is_operational_profile(
       p_owner_profile_id,
       'influencer'
     )
     or v_profile.public_profile_consent_at is null
     or btrim(coalesce(v_profile.public_profile_consent_version, '')) = ''
     or btrim(coalesce(v_profile.activity_page_url, '')) = ''
     or btrim(coalesce(v_profile.activity_page_platform, '')) = ''
     or btrim(coalesce(v_profile.activity_page_handle, '')) = '' then
    return null;
  end if;

  perform directsign_private.directsign_refresh_registered_member_discovery(
    p_owner_profile_id
  );

  select *
  into v_marketplace_profile
  from public.marketplace_influencer_profiles
  where owner_profile_id = p_owner_profile_id
    and data_origin = 'production'
  limit 1
  for update;

  if not found then
    return null;
  end if;

  v_registered_handle := 'rm-' || left(md5(p_owner_profile_id::text), 27);

  if v_marketplace_profile.registered_identity_only
     or v_marketplace_profile.profile_setup_state = 'setup_required' then
    update public.marketplace_influencer_profiles
    set
      public_handle = v_registered_handle,
      display_name = left(btrim(v_profile.name), 120),
      headline = '',
      bio = '',
      location = '국가 미확인',
      avatar_label = case
        when btrim(v_profile.name) ~ '^[A-Za-z0-9]'
          then upper(left(regexp_replace(v_profile.name, '[^A-Za-z0-9]', '', 'g'), 2))
        else upper(left(btrim(v_profile.name), 2))
      end,
      avatar_url = case
        when btrim(coalesce(v_profile.avatar_url, '')) ~* '^https://'
          then left(btrim(v_profile.avatar_url), 2048)
        else null
      end,
      categories = coalesce(v_profile.activity_categories, '{}'::text[]),
      audience = '',
      audience_tags = '{}'::text[],
      audience_countries = '{}'::text[],
      collaboration_types = '{}'::text[],
      starting_price_label = '',
      response_time_label = '',
      verified_label = '계정 인증 전',
      brand_fit = '{}'::text[],
      recent_brands = '{}'::text[],
      portfolio = '[]'::jsonb,
      proposal_hints = '{}'::text[],
      is_published = true,
      registered_identity_only = false,
      public_index_enabled = false,
      profile_setup_state = 'minimal',
      representative_activity_page_url = v_profile.activity_page_url,
      updated_at = clock_timestamp()
    where id = v_marketplace_profile.id;
  else
    update public.marketplace_influencer_profiles
    set
      representative_activity_page_url = coalesce(
        representative_activity_page_url,
        v_profile.activity_page_url
      ),
      updated_at = clock_timestamp()
    where id = v_marketplace_profile.id;
  end if;

  select channel.id
  into v_channel_id
  from public.marketplace_influencer_channels as channel
  where channel.profile_id = v_marketplace_profile.id
    and channel.platform::text = v_profile.activity_page_platform
    and lower(regexp_replace(btrim(channel.handle), '^@+', '')) =
      lower(regexp_replace(btrim(v_profile.activity_page_handle), '^@+', ''))
  order by channel.updated_at desc, channel.id desc
  limit 1;

  if v_channel_id is null then
    insert into public.marketplace_influencer_channels (
      id,
      profile_id,
      platform,
      label,
      handle,
      url,
      followers_label,
      performance_label,
      follower_count,
      follower_count_synced_at,
      follower_sync_source,
      ownership_status,
      sort_order,
      updated_at
    ) values (
      gen_random_uuid(),
      v_marketplace_profile.id,
      v_profile.activity_page_platform::public.directsign_platform_type,
      case v_profile.activity_page_platform
        when 'instagram' then 'Instagram'
        when 'youtube' then 'YouTube'
        when 'tiktok' then 'TikTok'
        when 'naver_blog' then 'Naver Blog'
        else 'Other'
      end,
      lower(regexp_replace(btrim(v_profile.activity_page_handle), '^@+', '')),
      v_profile.activity_page_url,
      '',
      '계정 인증 전',
      null,
      null,
      null,
      'unverified',
      0,
      clock_timestamp()
    );
  end if;

  update public.profiles
  set
    public_profile_setup_state = 'minimal',
    updated_at = clock_timestamp()
  where id = p_owner_profile_id
    and public_profile_setup_state <> 'complete';

  perform directsign_private.directsign_refresh_registered_member_discovery(
    p_owner_profile_id
  );
  return v_registered_handle;
end;
$$;

revoke all on function public.directsign_publish_minimal_influencer_profile(uuid)
  from public, anon, authenticated;
grant execute on function public.directsign_publish_minimal_influencer_profile(uuid)
  to service_role;

create or replace function directsign_private.directsign_materialize_registered_member_channels(
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
  v_request record;
  v_channel_id uuid;
  v_approved_count integer := 0;
  v_primary_handle text;
  v_desired_handle text;
  v_suffix text;
  v_registered_handle text;
begin
  select *
  into v_profile
  from public.profiles
  where id = p_owner_profile_id;

  select *
  into v_marketplace_profile
  from public.marketplace_influencer_profiles
  where owner_profile_id = p_owner_profile_id
    and data_origin = 'production'
  limit 1
  for update;

  if not found then
    return;
  end if;

  for v_request in
    select distinct on (
      request_row.platform,
      lower(regexp_replace(btrim(request_row.platform_handle), '^@+', ''))
    )
      request_row.platform,
      lower(regexp_replace(btrim(request_row.platform_handle), '^@+', '')) as handle,
      case
        when btrim(coalesce(request_row.platform_url, '')) ~* '^https://'
          then left(btrim(request_row.platform_url), 2048)
        else null
      end as url,
      request_row.reviewed_at
    from public.verification_requests as request_row
    where request_row.target_type::text = 'influencer_account'
      and request_row.verification_type::text = 'platform_account'
      and request_row.status::text = 'approved'
      and request_row.reviewed_at is not null
      and request_row.data_origin = 'production'
      and request_row.platform is not null
      and btrim(coalesce(request_row.platform_handle, '')) <> ''
      and (
        request_row.profile_id is not null
        or btrim(coalesce(request_row.target_id, '')) <> ''
      )
      and (
        request_row.profile_id is null
        or request_row.profile_id = p_owner_profile_id
      )
      and (
        btrim(coalesce(request_row.target_id, '')) = ''
        or request_row.target_id = p_owner_profile_id::text
      )
      and (
        btrim(coalesce(request_row.submitted_by_email, '')) = ''
        or directsign_private.directsign_email_is_operational(
          request_row.submitted_by_email
        )
      )
      and not directsign_private.directsign_has_test_marker(concat_ws(
        ' ',
        request_row.subject_name,
        request_row.submitted_by_name,
        request_row.platform_handle,
        request_row.platform_url,
        request_row.note,
        request_row.reviewer_note
      ))
    order by
      request_row.platform,
      lower(regexp_replace(btrim(request_row.platform_handle), '^@+', '')),
      request_row.reviewed_at asc,
      request_row.id asc
  loop
    v_approved_count := v_approved_count + 1;
    if v_primary_handle is null then
      v_primary_handle := v_request.handle;
    end if;

    select channel.id
    into v_channel_id
    from public.marketplace_influencer_channels as channel
    where channel.profile_id = v_marketplace_profile.id
      and channel.platform = v_request.platform
      and lower(regexp_replace(btrim(channel.handle), '^@+', '')) =
        v_request.handle
    order by channel.updated_at desc, channel.id desc
    limit 1;

    if v_channel_id is null then
      insert into public.marketplace_influencer_channels (
        id,
        profile_id,
        platform,
        label,
        handle,
        url,
        ownership_status,
        sort_order,
        updated_at
      ) values (
        gen_random_uuid(),
        v_marketplace_profile.id,
        v_request.platform,
        case v_request.platform::text
          when 'instagram' then 'Instagram'
          when 'youtube' then 'YouTube'
          when 'tiktok' then 'TikTok'
          when 'naver_blog' then 'Naver Blog'
          else 'Other'
        end,
        v_request.handle,
        v_request.url,
        'verified',
        v_approved_count - 1,
        clock_timestamp()
      );
    else
      update public.marketplace_influencer_channels
      set
        url = coalesce(v_request.url, url),
        ownership_status = 'verified',
        performance_label = case
          when platform::text = 'naver_blog' then performance_label
          else '계정 인증 완료'
        end,
        updated_at = clock_timestamp()
      where id = v_channel_id;
    end if;
  end loop;

  delete from public.marketplace_influencer_channels as channel
  where channel.profile_id = v_marketplace_profile.id
    and channel.ownership_status = 'verified'
    and not exists (
      select 1
      from public.verification_requests as request_row
      where request_row.target_type::text = 'influencer_account'
        and request_row.verification_type::text = 'platform_account'
        and request_row.status::text = 'approved'
        and request_row.reviewed_at is not null
        and request_row.data_origin = 'production'
        and request_row.platform = channel.platform
        and lower(regexp_replace(btrim(request_row.platform_handle), '^@+', '')) =
          lower(regexp_replace(btrim(channel.handle), '^@+', ''))
        and (
          request_row.profile_id is not null
          or btrim(coalesce(request_row.target_id, '')) <> ''
        )
        and (
          request_row.profile_id is null
          or request_row.profile_id = p_owner_profile_id
        )
        and (
          btrim(coalesce(request_row.target_id, '')) = ''
          or request_row.target_id = p_owner_profile_id::text
        )
    );

  v_registered_handle := 'rm-' || left(md5(p_owner_profile_id::text), 27);

  if v_approved_count > 0 and v_marketplace_profile.is_published then
    v_desired_handle := lower(regexp_replace(v_primary_handle, '[^a-z0-9_.-]+', '-', 'g'));
    v_desired_handle := regexp_replace(v_desired_handle, '^[_.-]+|[_.-]+$', '', 'g');
    if length(v_desired_handle) < 3 then
      v_desired_handle := 'creator-' || left(md5(p_owner_profile_id::text), 8);
    end if;
    v_desired_handle := left(v_desired_handle, 30);
    v_desired_handle := regexp_replace(v_desired_handle, '[_.-]+$', '', 'g');

    if exists (
      select 1
      from public.marketplace_influencer_profiles as conflict
      where lower(conflict.public_handle) = v_desired_handle
        and conflict.owner_profile_id <> p_owner_profile_id
    ) then
      v_suffix := '-' || left(md5(p_owner_profile_id::text), 4);
      v_desired_handle :=
        regexp_replace(left(v_desired_handle, 30 - length(v_suffix)), '[_.-]+$', '', 'g') ||
        v_suffix;
    end if;

    update public.marketplace_influencer_profiles
    set
      public_handle = case
        when public_handle ~ '^rm-[a-f0-9]{27}$'
          then v_desired_handle
        else public_handle
      end,
      registered_identity_only = false,
      public_index_enabled = true,
      verified_label = '계정 인증 완료',
      profile_setup_state = case
        when avatar_url is not null and btrim(coalesce(headline, '')) <> ''
          then 'complete'
        else 'minimal'
      end,
      updated_at = clock_timestamp()
    where id = v_marketplace_profile.id;

    delete from public.marketplace_influencer_channels
    where profile_id = v_marketplace_profile.id
      and ownership_status = 'unverified';
  elsif v_approved_count = 0 and v_marketplace_profile.is_published then
    update public.marketplace_influencer_profiles
    set
      public_handle = v_registered_handle,
      public_index_enabled = false,
      verified_label = '계정 인증 전',
      profile_setup_state = case
        when avatar_url is not null and btrim(coalesce(headline, '')) <> ''
          then 'complete'
        else 'minimal'
      end,
      updated_at = clock_timestamp()
    where id = v_marketplace_profile.id;

    update public.marketplace_influencer_channels
    set
      ownership_status = 'unverified',
      followers_label = '',
      performance_label = '계정 인증 전',
      follower_count = null,
      follower_count_synced_at = null,
      follower_sync_status = 'not_synced',
      follower_sync_source = null,
      follower_sync_error = null,
      follower_sync_metadata = null,
      updated_at = clock_timestamp()
    where profile_id = v_marketplace_profile.id;
  end if;

  perform public.directsign_publish_minimal_influencer_profile(
    p_owner_profile_id
  );
  perform directsign_private.directsign_refresh_registered_member_discovery(
    p_owner_profile_id
  );
end;
$$;

-- Public directory/ranking/sitemap data contains verified/indexable profiles
-- only. The direct rm-* profile remains readable through the profile table.
create or replace function directsign_private.directsign_prune_nonindexed_profile_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_index_enabled boolean;
begin
  select profile.public_index_enabled
  into v_index_enabled
  from public.marketplace_influencer_profiles as profile
  where profile.id = case when tg_op = 'DELETE' then old.id else new.id end;

  if coalesce(v_index_enabled, false) = false then
    delete from public.marketplace_public_influencer_directory
    where source_type = 'registered'
      and source_id = case when tg_op = 'DELETE' then old.id else new.id end;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function directsign_private.directsign_prune_nonindexed_channel_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := case
    when tg_op = 'DELETE' then old.profile_id
    else new.profile_id
  end;
  v_index_enabled boolean;
begin
  select profile.public_index_enabled
  into v_index_enabled
  from public.marketplace_influencer_profiles as profile
  where profile.id = v_profile_id;

  if coalesce(v_index_enabled, false) = false then
    delete from public.marketplace_public_influencer_directory
    where source_type = 'registered'
      and source_id = v_profile_id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists zz_marketplace_profiles_prune_nonindexed_directory
  on public.marketplace_influencer_profiles;
create trigger zz_marketplace_profiles_prune_nonindexed_directory
after insert or update or delete
on public.marketplace_influencer_profiles
for each row execute function
  directsign_private.directsign_prune_nonindexed_profile_directory();

drop trigger if exists zz_marketplace_channels_prune_nonindexed_directory
  on public.marketplace_influencer_channels;
create trigger zz_marketplace_channels_prune_nonindexed_directory
after insert or update or delete
on public.marketplace_influencer_channels
for each row execute function
  directsign_private.directsign_prune_nonindexed_channel_directory();

delete from public.marketplace_public_influencer_directory as directory
using public.marketplace_influencer_profiles as profile
where directory.source_type = 'registered'
  and directory.source_id = profile.id
  and not profile.public_index_enabled;

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

  perform directsign_private.directsign_refresh_registered_member_discovery(new.id);
  perform public.directsign_publish_minimal_influencer_profile(new.id);
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
  activity_platforms,
  activity_page_url,
  activity_page_platform,
  activity_page_handle,
  public_profile_consent_at,
  public_profile_consent_version,
  email_verified_at,
  data_origin
on public.profiles
for each row execute function
  directsign_private.directsign_sync_registered_member_profile();

-- One approved production account was explicitly selected by the Product
-- Owner for migration. No other legacy member receives publication consent.
do $$
declare
  v_owner_profile_id uuid;
  v_request_id uuid;
  v_platform_url text;
  v_follower_count bigint;
begin
  select
    coalesce(
      request_row.profile_id,
      directsign_private.directsign_uuid_or_null(request_row.target_id)
    ),
    request_row.id,
    request_row.platform_url
  into v_owner_profile_id, v_request_id, v_platform_url
  from public.verification_requests as request_row
  where request_row.target_type::text = 'influencer_account'
    and request_row.verification_type::text = 'platform_account'
    and request_row.status::text = 'approved'
    and request_row.platform::text = 'instagram'
    and lower(regexp_replace(btrim(request_row.platform_handle), '^@+', '')) =
      'running_yaho'
    and request_row.data_origin = 'production'
    and request_row.reviewed_at is not null
    and (
      request_row.profile_id is null
      or request_row.target_id is null
      or btrim(request_row.target_id) = ''
      or request_row.target_id = request_row.profile_id::text
    )
  order by request_row.reviewed_at desc, request_row.id desc
  limit 1;

  if v_owner_profile_id is null or v_request_id is null then
    raise exception 'running_yaho approved production verification was not found';
  end if;

  update public.profiles as profile
  set
    activity_categories = array['fitness']::text[],
    activity_platforms = array['instagram']::text[],
    activity_page_url = coalesce(
      case
        when btrim(coalesce(v_platform_url, '')) ~* '^https://'
          then v_platform_url
        else null
      end,
      'https://www.instagram.com/running_yaho/'
    ),
    activity_page_platform = 'instagram',
    activity_page_handle = 'running_yaho',
    public_profile_consent_at = coalesce(
      profile.public_profile_consent_at,
      clock_timestamp()
    ),
    public_profile_consent_version = coalesce(
      profile.public_profile_consent_version,
      '2026-08-07'
    ),
    public_profile_consent_source = coalesce(
      profile.public_profile_consent_source,
      'product_owner_targeted_backfill'
    ),
    public_profile_setup_state = case
      when profile.public_profile_setup_state = 'complete' then 'complete'
      else 'pending_email'
    end,
    email_verified_at = coalesce(
      profile.email_verified_at,
      (select auth_user.email_confirmed_at
       from auth.users as auth_user
       where auth_user.id = profile.id)
    ),
    updated_at = clock_timestamp()
  where profile.id = v_owner_profile_id
    and profile.role::text = 'influencer'
    and profile.data_origin = 'production';

  perform public.directsign_publish_minimal_influencer_profile(v_owner_profile_id);
  perform directsign_private.directsign_materialize_registered_member_channels(
    v_owner_profile_id
  );
  perform directsign_private.directsign_apply_approved_instagram_dm_follower_metric(
    v_request_id
  );

  select channel.follower_count
  into v_follower_count
  from public.marketplace_influencer_channels as channel
  join public.marketplace_influencer_profiles as profile
    on profile.id = channel.profile_id
  where profile.owner_profile_id = v_owner_profile_id
    and channel.platform::text = 'instagram'
    and lower(regexp_replace(btrim(channel.handle), '^@+', '')) = 'running_yaho'
    and channel.ownership_status = 'verified'
  order by channel.updated_at desc, channel.id desc
  limit 1;

  if v_follower_count is distinct from 178 then
    raise exception
      'running_yaho authoritative Instagram follower count must be 178, got %',
      v_follower_count;
  end if;
end;
$$;

comment on function public.directsign_publish_minimal_influencer_profile(uuid) is
  'Idempotently publishes a consented, email-confirmed minimal creator profile on its stable rm-* identity without enabling metrics, proposals, or indexing.';
