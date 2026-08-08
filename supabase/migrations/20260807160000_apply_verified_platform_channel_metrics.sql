-- Materialize approved YouTube, TikTok, and Naver Blog identities in the
-- verification transaction. YouTube/TikTok metrics remain provider-bound;
-- Naver Blog may apply only a separately disclosed creator self-report.

alter table public.verification_requests
  add column if not exists naver_blog_recent_4d_average_visitors bigint;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'verification_requests_naver_blog_visitor_report_valid'
      and conrelid = 'public.verification_requests'::regclass
  ) then
    alter table public.verification_requests
      add constraint verification_requests_naver_blog_visitor_report_valid
      check (
        naver_blog_recent_4d_average_visitors is null
        or (
          target_type::text = 'influencer_account'
          and verification_type::text = 'platform_account'
          and platform::text = 'naver_blog'
          and naver_blog_recent_4d_average_visitors between 0 and 9007199254740991
        )
      );
  end if;
end;
$$;

create or replace function directsign_private.directsign_apply_approved_platform_channel_metric(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.verification_requests%rowtype;
  v_owner_profile_id uuid;
  v_target_profile_id uuid;
  v_marketplace_profile_id uuid;
  v_channel_id uuid;
  v_platform text;
  v_label text;
  v_handle text;
  v_verified_handle text;
  v_metric jsonb;
  v_metric_name text;
  v_expected_metric_name text;
  v_metric_status text;
  v_unavailable_reason text;
  v_source text;
  v_expected_source text;
  v_value_text text;
  v_value bigint;
  v_checked_at_text text;
  v_checked_at timestamptz;
  v_sort_order integer;
  v_updated_count integer;
begin
  select request_row.*
  into v_request
  from public.verification_requests as request_row
  where request_row.id = p_request_id
    and request_row.target_type::text = 'influencer_account'
    and request_row.verification_type::text = 'platform_account'
    and request_row.platform::text in ('youtube', 'tiktok', 'naver_blog')
    and request_row.status::text = 'approved'
    and request_row.reviewed_at is not null
    and request_row.data_origin = 'production';

  if not found then
    return;
  end if;

  if (
       btrim(coalesce(v_request.submitted_by_email, '')) <> ''
       and not directsign_private.directsign_email_is_operational(
         v_request.submitted_by_email
       )
     )
     or directsign_private.directsign_has_test_marker(concat_ws(
       ' ',
       v_request.subject_name,
       v_request.submitted_by_name,
       v_request.platform_handle,
       v_request.platform_url,
       v_request.note,
       v_request.reviewer_note
     ))
     or lower(coalesce(v_request.evidence_snapshot_json, '{}'::jsonb)::text)
       ~ '"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"[[:space:]]*:[[:space:]]*(true|"true"|1|"1")' then
    return;
  end if;

  v_target_profile_id := directsign_private.directsign_uuid_or_null(
    v_request.target_id
  );
  if btrim(coalesce(v_request.target_id, '')) <> ''
     and v_target_profile_id is null then
    raise exception 'platform verification target is not a profile UUID';
  end if;
  if v_request.profile_id is not null
     and v_target_profile_id is not null
     and v_request.profile_id is distinct from v_target_profile_id then
    raise exception 'platform verification owner binding mismatch';
  end if;
  v_owner_profile_id := coalesce(v_request.profile_id, v_target_profile_id);
  if v_owner_profile_id is null then
    raise exception 'platform verification owner is missing';
  end if;
  if not directsign_private.directsign_is_operational_profile(
    v_owner_profile_id,
    'influencer'
  ) then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'directsign-platform-channel:' || v_owner_profile_id::text,
      0
    )
  );

  v_platform := v_request.platform::text;
  v_label := case v_platform
    when 'youtube' then 'YouTube'
    when 'tiktok' then 'TikTok'
    when 'naver_blog' then 'Naver Blog'
  end;
  v_handle := lower(regexp_replace(
    btrim(coalesce(v_request.platform_handle, '')),
    '^@+',
    ''
  ));
  if v_handle = ''
     or char_length(v_handle) > 160
     or v_handle ~ '[[:space:]/]' then
    raise exception 'approved platform handle is invalid';
  end if;

  select marketplace_profile.id
  into v_marketplace_profile_id
  from public.marketplace_influencer_profiles as marketplace_profile
  where marketplace_profile.owner_profile_id = v_owner_profile_id
    and marketplace_profile.data_origin = 'production'
  order by marketplace_profile.id
  limit 1;

  if v_marketplace_profile_id is null then
    raise exception 'canonical marketplace profile is missing';
  end if;

  select channel.id
  into v_channel_id
  from public.marketplace_influencer_channels as channel
  where channel.profile_id = v_marketplace_profile_id
    and channel.platform::text = v_platform
    and lower(regexp_replace(btrim(channel.handle), '^@+', '')) = v_handle
  order by
    (lower(btrim(channel.handle)) = v_handle) desc,
    channel.updated_at desc,
    channel.id desc
  limit 1
  for update;

  if v_channel_id is null then
    select coalesce(max(channel.sort_order), -1) + 1
    into v_sort_order
    from public.marketplace_influencer_channels as channel
    where channel.profile_id = v_marketplace_profile_id;

    insert into public.marketplace_influencer_channels (
      id,
      profile_id,
      platform,
      label,
      handle,
      url,
      sort_order
    )
    values (
      gen_random_uuid(),
      v_marketplace_profile_id,
      v_platform::public.directsign_platform_type,
      v_label,
      v_handle,
      case
        when btrim(coalesce(v_request.platform_url, '')) ~* '^https?://'
          then left(btrim(v_request.platform_url), 2048)
        else null
      end,
      v_sort_order
    )
    on conflict do nothing
    returning id into v_channel_id;
  end if;

  if v_channel_id is null then
    select channel.id
    into v_channel_id
    from public.marketplace_influencer_channels as channel
    where channel.profile_id = v_marketplace_profile_id
      and channel.platform::text = v_platform
      and lower(regexp_replace(btrim(channel.handle), '^@+', '')) = v_handle
    order by
      (lower(btrim(channel.handle)) = v_handle) desc,
      channel.updated_at desc,
      channel.id desc
    limit 1
    for update;
  end if;

  if v_channel_id is null then
    raise exception 'canonical platform channel is missing';
  end if;

  update public.marketplace_influencer_channels as channel
  set
    label = v_label,
    handle = v_handle,
    url = case
      when btrim(coalesce(v_request.platform_url, '')) ~* '^https?://'
        then left(btrim(v_request.platform_url), 2048)
      else channel.url
    end,
    updated_at = clock_timestamp()
  where channel.id = v_channel_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'canonical platform channel write failed';
  end if;

  v_metric := case
    when v_platform = 'naver_blog' then
      v_request.evidence_snapshot_json -> 'self_reported_channel_metric'
    else
      v_request.evidence_snapshot_json #> '{ownership_verification,channel_metric}'
  end;
  if jsonb_typeof(v_metric) is distinct from 'object' then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  v_metric_name := coalesce(v_metric ->> 'metric', '');
  v_metric_status := coalesce(v_metric ->> 'status', '');
  v_source := coalesce(v_metric ->> 'source', '');
  v_expected_metric_name := case v_platform
    when 'youtube' then 'subscriber_count'
    when 'tiktok' then 'follower_count'
    when 'naver_blog' then 'average_daily_visitors_4d'
  end;
  v_expected_source := case v_platform
    when 'youtube' then 'youtube_data_api'
    when 'tiktok' then 'tiktok_user_info_api'
    when 'naver_blog' then 'creator_self_report'
  end;
  v_verified_handle := lower(regexp_replace(
    btrim(coalesce(
      case
        when v_platform = 'naver_blog' then v_metric ->> 'reported_handle'
        else v_metric ->> 'verified_handle'
      end,
      ''
    )),
    '^@+',
    ''
  ));

  if coalesce(v_metric ->> 'platform', '') <> v_platform
     or v_metric_name <> v_expected_metric_name
     or v_source <> v_expected_source
     or v_verified_handle is distinct from v_handle
     or (
       v_platform = 'naver_blog'
       and (
         coalesce(v_metric ->> 'trust', '') <> 'self_reported'
         or coalesce(v_metric ->> 'period_days', '') <> '4'
       )
     ) then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  v_checked_at_text := coalesce(
    case
      when v_platform = 'naver_blog' then v_metric ->> 'reported_at'
      else v_metric ->> 'checked_at'
    end,
    ''
  );
  if v_checked_at_text
     !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$' then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;
  begin
    v_checked_at := v_checked_at_text::timestamptz;
  exception when others then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end;

  if v_platform = 'naver_blog'
     and (
       v_request.naver_blog_recent_4d_average_visitors is null
       or v_checked_at is distinct from v_request.created_at
     ) then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  if v_platform <> 'naver_blog' and v_metric_status = 'unavailable' then
    v_unavailable_reason := coalesce(v_metric ->> 'reason', '');
    if v_unavailable_reason not in ('hidden', 'missing_or_invalid') then
      perform directsign_private.directsign_refresh_registered_member_discovery(
        v_owner_profile_id
      );
      return;
    end if;

    update public.marketplace_influencer_channels as channel
    set
      follower_count = null,
      followers_label = '계정 연동',
      follower_count_synced_at = v_checked_at,
      follower_sync_status = 'skipped',
      follower_sync_source = v_source,
      follower_sync_error = null,
      follower_sync_metadata = coalesce(
        channel.follower_sync_metadata,
        '{}'::jsonb
      ) || jsonb_build_object(
        'checked_at', v_checked_at,
        'provider', v_source,
        'metric', v_metric_name,
        'verification_bound', true,
        'availability', 'unavailable',
        'reason', v_unavailable_reason
      ),
      updated_at = clock_timestamp()
    where channel.id = v_channel_id
      and (
        channel.follower_count_synced_at is null
        or v_checked_at >= channel.follower_count_synced_at
      );

    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  if v_metric_status <> 'available'
     or jsonb_typeof(v_metric -> 'value') is distinct from 'number' then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  v_value_text := v_metric ->> 'value';
  if coalesce(v_value_text, '') !~ '^(0|[1-9][0-9]{0,15})$' then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;
  v_value := v_value_text::bigint;
  if v_value < 0 or v_value > 9007199254740991 then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;
  if v_platform = 'naver_blog'
     and v_value is distinct from v_request.naver_blog_recent_4d_average_visitors then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  update public.marketplace_influencer_channels as channel
  set
    follower_count = v_value,
    followers_label = case
      when v_platform = 'naver_blog' then
        '일평균 ' || pg_catalog.to_char(
          v_value::numeric,
          'FM999,999,999,999,999,999'
        ) || '명'
      else directsign_private.directsign_format_marketplace_follower_count_label(
        v_value
      )
    end,
    performance_label = case
      when v_platform = 'naver_blog' then '최근 4일 평균 · 자가신고'
      else channel.performance_label
    end,
    follower_count_synced_at = v_checked_at,
    follower_sync_status = 'synced',
    follower_sync_source = v_source,
    follower_sync_error = null,
    follower_sync_metadata = coalesce(
      channel.follower_sync_metadata,
      '{}'::jsonb
    ) || jsonb_strip_nulls(jsonb_build_object(
        'checked_at', v_checked_at,
        'provider', v_source,
        'metric', v_metric_name,
        'verification_bound', v_platform <> 'naver_blog',
        'account_approved', true,
        'availability', 'available',
        'trust', case
          when v_platform = 'naver_blog' then 'self_reported'
          else 'provider'
        end,
        'period_days', case
          when v_platform = 'naver_blog' then 4
          else null
        end,
        'reported_handle', case
          when v_platform = 'naver_blog' then v_handle
          else null
        end,
        'request_id', case
          when v_platform = 'naver_blog' then v_request.id
          else null
        end,
        'approximate', case
          when v_platform = 'youtube' then true
          else null
        end
      )),
    updated_at = clock_timestamp()
  where channel.id = v_channel_id
    and (
      (
        v_platform = 'naver_blog'
        and channel.follower_sync_source = 'naver_blog_public_visitor_counter'
      )
      or
      channel.follower_count_synced_at is null
      or v_checked_at >= channel.follower_count_synced_at
    );

  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 then
    -- A newer provider sync already owns the canonical value.
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;
  if v_updated_count <> 1 then
    raise exception 'canonical platform channel metric write failed';
  end if;

  perform directsign_private.directsign_refresh_registered_member_discovery(
    v_owner_profile_id
  );
end;
$$;

create or replace function directsign_private.directsign_sync_registered_member_channels_from_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_profile_id uuid;
begin
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE'
       and (
         old.profile_id is distinct from new.profile_id
         or old.target_id is distinct from new.target_id
         or old.platform is distinct from new.platform
         or lower(regexp_replace(btrim(coalesce(old.platform_handle, '')), '^@+', ''))
           is distinct from
           lower(regexp_replace(btrim(coalesce(new.platform_handle, '')), '^@+', ''))
       ) then
      if old.profile_id is not null then
        perform directsign_private.directsign_materialize_registered_member_channels(
          old.profile_id
        );
      end if;
      v_owner_profile_id := directsign_private.directsign_uuid_or_null(old.target_id);
      if v_owner_profile_id is not null
         and v_owner_profile_id is distinct from old.profile_id then
        perform directsign_private.directsign_materialize_registered_member_channels(
          v_owner_profile_id
        );
      end if;
    end if;

    if new.target_type::text = 'influencer_account'
       and new.verification_type::text = 'platform_account'
       and new.platform::text = 'instagram'
       and new.status::text = 'approved'
       and new.ownership_verification_method::text = 'instagram_dm_code' then
      perform directsign_private.directsign_apply_approved_instagram_dm_follower_metric(
        new.id
      );
      return new;
    end if;

    if new.target_type::text = 'influencer_account'
       and new.verification_type::text = 'platform_account'
       and new.platform::text in ('youtube', 'tiktok', 'naver_blog')
       and new.status::text = 'approved' then
      perform directsign_private.directsign_apply_approved_platform_channel_metric(
        new.id
      );
      return new;
    end if;

    if new.profile_id is not null then
      perform directsign_private.directsign_materialize_registered_member_channels(
        new.profile_id
      );
    end if;
    v_owner_profile_id := directsign_private.directsign_uuid_or_null(new.target_id);
    if v_owner_profile_id is not null
       and v_owner_profile_id is distinct from new.profile_id then
      perform directsign_private.directsign_materialize_registered_member_channels(
        v_owner_profile_id
      );
    end if;
  else
    if old.profile_id is not null then
      perform directsign_private.directsign_materialize_registered_member_channels(
        old.profile_id
      );
    end if;
    v_owner_profile_id := directsign_private.directsign_uuid_or_null(old.target_id);
    if v_owner_profile_id is not null
       and v_owner_profile_id is distinct from old.profile_id then
      perform directsign_private.directsign_materialize_registered_member_channels(
        v_owner_profile_id
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists verification_requests_materialize_registered_member_channels
  on public.verification_requests;
create trigger verification_requests_materialize_registered_member_channels
after insert or delete or update of
  target_type,
  target_id,
  verification_type,
  status,
  profile_id,
  platform,
  platform_handle,
  platform_url,
  naver_blog_recent_4d_average_visitors,
  reviewed_at,
  data_origin,
  evidence_snapshot_json
on public.verification_requests
for each row execute function
  directsign_private.directsign_sync_registered_member_channels_from_verification();

revoke all on function
  directsign_private.directsign_apply_approved_platform_channel_metric(uuid),
  directsign_private.directsign_sync_registered_member_channels_from_verification()
from public, anon, authenticated;

grant execute on function
  directsign_private.directsign_apply_approved_platform_channel_metric(uuid),
  directsign_private.directsign_sync_registered_member_channels_from_verification()
to service_role;

comment on function directsign_private.directsign_apply_approved_platform_channel_metric(uuid) is
  'Materializes an approved production YouTube, TikTok, or Naver Blog channel and applies only an exact account-bound provider metric or a separately disclosed Naver creator self-report before refreshing registered discovery.';
