create or replace function public.directsign_upsert_campaign_instagram_follower_metric(
  p_profile_id uuid,
  p_verification_request_id uuid,
  p_expected_handle text,
  p_follower_count bigint,
  p_checked_at timestamptz,
  p_source text
)
returns table (
  follower_count bigint,
  checked_at timestamptz,
  source text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.verification_requests%rowtype;
  v_marketplace_profile_id uuid;
  v_channel_id uuid;
  v_request_handle text;
  v_verified_handle text;
  v_existing_checked_at timestamptz;
begin
  if p_follower_count is null
     or p_follower_count < 0
     or p_follower_count > 9007199254740991
     or p_checked_at is null
     or p_checked_at > clock_timestamp() + interval '5 minutes'
     or p_source not in ('instagram_user_profile_api', 'instagram_graph_api') then
    raise exception using errcode = '22023', message = 'invalid Instagram follower metric';
  end if;

  v_request_handle := lower(regexp_replace(btrim(coalesce(p_expected_handle, '')), '^@+', ''));
  if v_request_handle = '' or v_request_handle !~ '^[a-z0-9._]{1,30}$' then
    raise exception using errcode = '22023', message = 'invalid Instagram handle';
  end if;

  select request_row.*
  into v_request
  from public.verification_requests as request_row
  where request_row.id = p_verification_request_id
    and request_row.target_type::text = 'influencer_account'
    and request_row.verification_type::text = 'platform_account'
    and request_row.platform::text = 'instagram'
    and request_row.status::text = 'approved'
    and request_row.reviewed_at is not null
    and request_row.ownership_verification_method::text = 'instagram_dm_code'
    and request_row.data_origin = 'production'
    and coalesce(request_row.profile_id, directsign_private.directsign_uuid_or_null(request_row.target_id)) = p_profile_id;

  if not found or not directsign_private.directsign_is_operational_profile(
    p_profile_id,
    'influencer'
  ) then
    raise exception using errcode = '42501', message = 'Instagram verification binding is not allowed';
  end if;

  v_verified_handle := lower(regexp_replace(
    btrim(coalesce(
      v_request.evidence_snapshot_json
        #>> '{ownership_verification,instagram_dm,verified_handle}',
      ''
    )),
    '^@+',
    ''
  ));
  if lower(regexp_replace(btrim(coalesce(v_request.platform_handle, '')), '^@+', ''))
       is distinct from v_request_handle
     or v_verified_handle is distinct from v_request_handle
     or coalesce(
       v_request.evidence_snapshot_json
         #>> '{ownership_verification,instagram_dm,state}',
       ''
     ) <> 'verified' then
    raise exception using errcode = '42501', message = 'Instagram identity does not match';
  end if;

  select marketplace_profile.id
  into v_marketplace_profile_id
  from public.marketplace_influencer_profiles as marketplace_profile
  where marketplace_profile.owner_profile_id = p_profile_id
    and marketplace_profile.data_origin = 'production'
  order by marketplace_profile.id
  limit 1;

  select channel.id, channel.follower_count_synced_at
  into v_channel_id, v_existing_checked_at
  from public.marketplace_influencer_channels as channel
  where channel.profile_id = v_marketplace_profile_id
    and channel.platform::text = 'instagram'
    and lower(regexp_replace(btrim(channel.handle), '^@+', '')) = v_request_handle
  order by channel.updated_at desc, channel.id desc
  limit 1
  for update;

  if v_channel_id is null then
    raise exception using errcode = '23503', message = 'canonical Instagram channel is missing';
  end if;

  if v_existing_checked_at is null or p_checked_at >= v_existing_checked_at then
    update public.marketplace_influencer_channels as channel
    set
      follower_count = p_follower_count,
      followers_label = directsign_private.directsign_format_marketplace_follower_count_label(
        p_follower_count
      ),
      follower_count_synced_at = p_checked_at,
      follower_sync_status = 'synced',
      follower_sync_source = p_source,
      follower_sync_error = null,
      follower_sync_metadata = jsonb_build_object(
        'checked_at', p_checked_at,
        'provider', p_source,
        'verification_bound', true,
        'request_id', p_verification_request_id
      )
    where channel.id = v_channel_id;
  end if;

  perform directsign_private.directsign_refresh_registered_member_discovery(
    p_profile_id
  );

  return query
  select
    channel.follower_count,
    channel.follower_count_synced_at,
    channel.follower_sync_source
  from public.marketplace_influencer_channels as channel
  where channel.id = v_channel_id
    and channel.follower_sync_status = 'synced'
    and channel.follower_sync_source in (
      'instagram_user_profile_api',
      'instagram_graph_api'
    );
end;
$$;

revoke all on function public.directsign_upsert_campaign_instagram_follower_metric(
  uuid, uuid, text, bigint, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.directsign_upsert_campaign_instagram_follower_metric(
  uuid, uuid, text, bigint, timestamptz, text
) to service_role;

comment on function public.directsign_upsert_campaign_instagram_follower_metric(
  uuid, uuid, text, bigint, timestamptz, text
) is
  'Service-role-only exact-account Instagram follower refresh used by private campaign eligibility.';
