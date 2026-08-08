-- Apply the follower count returned by the same Instagram User Profile API
-- request that resolved an inbound DM sender. The verification RPC remains the
-- transaction boundary: approval, the canonical channel write, and the
-- registered discovery projection either complete together or roll back.

create or replace function directsign_private.directsign_format_marketplace_follower_count_label(
  p_count bigint
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_count is null or p_count < 0 then null
    when p_count < 10000 then
      to_char(p_count, 'FM999G999G999G999G999') || '명'
    when p_count < 1000000 then
      regexp_replace(
        to_char(round(p_count::numeric / 10000, 1), 'FM999990D0'),
        '[.,]0$',
        ''
      ) || '만'
    else
      to_char(
        round(p_count::numeric / 10000),
        'FM999G999G999G999G999'
      ) || '만'
  end;
$$;

create or replace function directsign_private.directsign_apply_approved_instagram_dm_follower_metric(
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
  v_handle text;
  v_verified_handle text;
  v_follower_text text;
  v_follower_count bigint;
  v_checked_at_text text;
  v_synced_at timestamptz;
  v_sort_order integer;
  v_updated_count integer;
begin
  select request_row.*
  into v_request
  from public.verification_requests as request_row
  where request_row.id = p_request_id
    and request_row.target_type::text = 'influencer_account'
    and request_row.verification_type::text = 'platform_account'
    and request_row.platform::text = 'instagram'
    and request_row.status::text = 'approved'
    and request_row.reviewed_at is not null
    and request_row.ownership_verification_method::text = 'instagram_dm_code'
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
    raise exception 'Instagram DM verification target is not a profile UUID';
  end if;
  if v_request.profile_id is not null
     and v_target_profile_id is not null
     and v_request.profile_id is distinct from v_target_profile_id then
    raise exception 'Instagram DM verification owner binding mismatch';
  end if;
  v_owner_profile_id := coalesce(v_request.profile_id, v_target_profile_id);
  if v_owner_profile_id is null then
    raise exception 'Instagram DM verification owner is missing';
  end if;
  if not directsign_private.directsign_is_operational_profile(
    v_owner_profile_id,
    'influencer'
  ) then
    return;
  end if;

  if coalesce(
       v_request.evidence_snapshot_json
         #>> '{ownership_verification,instagram_dm,state}',
       ''
     ) <> 'verified' then
    raise exception 'approved Instagram DM evidence is not verified';
  end if;

  v_handle := lower(regexp_replace(
    btrim(coalesce(v_request.platform_handle, '')),
    '^@+',
    ''
  ));
  v_verified_handle := lower(regexp_replace(
    btrim(coalesce(
      v_request.evidence_snapshot_json
        #>> '{ownership_verification,instagram_dm,verified_handle}',
      ''
    )),
    '^@+',
    ''
  ));
  if v_handle = '' or v_handle !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Instagram DM requested handle is invalid';
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
    and channel.platform::text = 'instagram'
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
      'instagram',
      'Instagram',
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
      and channel.platform::text = 'instagram'
      and lower(regexp_replace(btrim(channel.handle), '^@+', '')) = v_handle
    order by
      (lower(btrim(channel.handle)) = v_handle) desc,
      channel.updated_at desc,
      channel.id desc
    limit 1
    for update;
  end if;

  if v_channel_id is null then
    raise exception 'canonical Instagram channel is missing';
  end if;

  if v_verified_handle is distinct from v_handle
     or coalesce(
       v_request.evidence_snapshot_json
         #>> '{ownership_verification,instagram_dm,follower_count_source}',
       ''
     ) <> 'instagram_user_profile_api'
     or jsonb_typeof(
       v_request.evidence_snapshot_json
         #> '{ownership_verification,instagram_dm,follower_count}'
     ) is distinct from 'number' then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  v_follower_text := v_request.evidence_snapshot_json
    #>> '{ownership_verification,instagram_dm,follower_count}';
  if coalesce(v_follower_text, '') !~ '^(0|[1-9][0-9]{0,15})$' then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;
  v_follower_count := v_follower_text::bigint;
  if v_follower_count < 0 or v_follower_count > 9007199254740991 then
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
    return;
  end if;

  v_synced_at := coalesce(
    v_request.ownership_checked_at,
    v_request.reviewed_at,
    v_request.updated_at,
    now()
  );
  v_checked_at_text := v_request.evidence_snapshot_json
    #>> '{ownership_verification,instagram_dm,follower_count_checked_at}';
  if coalesce(v_checked_at_text, '')
     ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$' then
    begin
      v_synced_at := v_checked_at_text::timestamptz;
    exception when others then
      null;
    end;
  end if;

  update public.marketplace_influencer_channels as channel
  set
    follower_count = v_follower_count,
    followers_label = directsign_private.directsign_format_marketplace_follower_count_label(
      v_follower_count
    ),
    follower_count_synced_at = v_synced_at,
    follower_sync_status = 'synced',
    follower_sync_source = 'instagram_user_profile_api',
    follower_sync_error = null,
    follower_sync_metadata = jsonb_build_object(
      'checked_at', v_synced_at,
      'provider', 'instagram_user_profile_api',
      'verification_bound', true
    )
  where channel.id = v_channel_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'canonical Instagram channel metric write failed';
  end if;

  perform directsign_private.directsign_refresh_registered_member_discovery(
    v_owner_profile_id
  );
  return;
end;
$$;

-- The existing verification trigger materializes every approved platform
-- account. Route only approved Instagram DM rows through the stricter helper so
-- an existing @handle cannot be duplicated as handle, and QA/test rows never
-- become operational discovery channels. Other verification methods keep the
-- deployed materializer unchanged.
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

create or replace function public.directsign_consume_instagram_dm_challenge(
  p_request_id uuid,
  p_code_hash text,
  p_received_at timestamptz,
  p_auto_approve boolean,
  p_evidence_snapshot jsonb,
  p_message_id_hash text,
  p_sender_id_hash text,
  p_reviewer_note text,
  p_reviewed_by_name text
)
returns setof public.verification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved public.verification_requests%rowtype;
begin
  lock table public.verification_requests in share row exclusive mode;

  update public.verification_requests as target
  set
    status = case
      when p_auto_approve then 'approved'::public.directsign_verification_status
      else 'pending'::public.directsign_verification_status
    end,
    evidence_snapshot_json = p_evidence_snapshot,
    ownership_challenge_code_hash = null,
    ownership_challenge_code_ciphertext = null,
    ownership_challenge_consumed_at = p_received_at,
    ownership_challenge_message_id_hash = p_message_id_hash,
    ownership_challenge_sender_id_hash = p_sender_id_hash,
    ownership_check_status = 'matched'::public.directsign_ownership_check_status,
    ownership_checked_at = p_received_at,
    reviewer_note = case
      when p_auto_approve then p_reviewer_note
      else target.reviewer_note
    end,
    reviewed_by_name = case
      when p_auto_approve then p_reviewed_by_name
      else target.reviewed_by_name
    end,
    reviewed_at = case
      when p_auto_approve then p_received_at
      else target.reviewed_at
    end,
    updated_at = p_received_at
  where target.id = p_request_id
    and target.target_type = 'influencer_account'
    and target.platform = 'instagram'
    and target.status = 'pending'
    and target.ownership_verification_method = 'instagram_dm_code'
    and target.ownership_challenge_code_hash = p_code_hash
    and target.ownership_challenge_consumed_at is null
    and target.ownership_challenge_expires_at > p_received_at
    and not exists (
      select 1
      from public.verification_requests as newer
      where newer.id <> target.id
        and coalesce(newer.profile_id::text, newer.target_id) =
          coalesce(target.profile_id::text, target.target_id)
        and newer.platform = 'instagram'
        and lower(regexp_replace(newer.platform_handle, '^@+', '')) =
          lower(regexp_replace(target.platform_handle, '^@+', ''))
        and newer.created_at >= target.created_at
    )
  returning target.* into v_saved;

  if not found then
    return;
  end if;

  return next v_saved;
end;
$$;

create or replace function public.directsign_review_instagram_dm_challenge(
  p_request_id uuid,
  p_status text,
  p_reviewer_note text,
  p_reviewed_by_profile_id uuid,
  p_reviewed_by_name text,
  p_reviewed_at timestamptz,
  p_evidence_snapshot jsonb
)
returns setof public.verification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved public.verification_requests%rowtype;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid Instagram DM terminal status';
  end if;

  lock table public.verification_requests in share row exclusive mode;

  update public.verification_requests as target
  set
    status = p_status::public.directsign_verification_status,
    evidence_snapshot_json = p_evidence_snapshot,
    ownership_challenge_code_hash = null,
    ownership_challenge_code_ciphertext = null,
    ownership_challenge_consumed_at = p_reviewed_at,
    ownership_check_status = case
      when p_status = 'approved'
        then 'matched'::public.directsign_ownership_check_status
      else 'failed'::public.directsign_ownership_check_status
    end,
    ownership_checked_at = p_reviewed_at,
    reviewer_note = p_reviewer_note,
    reviewed_by_profile_id = p_reviewed_by_profile_id,
    reviewed_by_name = p_reviewed_by_name,
    reviewed_at = p_reviewed_at,
    updated_at = p_reviewed_at
  where target.id = p_request_id
    and target.target_type = 'influencer_account'
    and target.platform = 'instagram'
    and target.status = 'pending'
    and target.ownership_verification_method = 'instagram_dm_code'
    and coalesce(
      target.evidence_snapshot_json
        #>> '{ownership_verification,instagram_dm,state}',
      ''
    ) in ('manual_review', 'expired')
    and not exists (
      select 1
      from public.verification_requests as newer
      where newer.id <> target.id
        and coalesce(newer.profile_id::text, newer.target_id) =
          coalesce(target.profile_id::text, target.target_id)
        and newer.platform = 'instagram'
        and lower(regexp_replace(newer.platform_handle, '^@+', '')) =
          lower(regexp_replace(target.platform_handle, '^@+', ''))
        and newer.created_at >= target.created_at
    )
  returning target.* into v_saved;

  if not found then
    return;
  end if;

  return next v_saved;
end;
$$;

revoke all on function
  directsign_private.directsign_format_marketplace_follower_count_label(bigint),
  directsign_private.directsign_apply_approved_instagram_dm_follower_metric(uuid),
  directsign_private.directsign_sync_registered_member_channels_from_verification()
from public, anon, authenticated;
grant execute on function
  directsign_private.directsign_format_marketplace_follower_count_label(bigint),
  directsign_private.directsign_apply_approved_instagram_dm_follower_metric(uuid),
  directsign_private.directsign_sync_registered_member_channels_from_verification()
to service_role;

revoke all on function public.directsign_consume_instagram_dm_challenge(
  uuid,
  text,
  timestamptz,
  boolean,
  jsonb,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.directsign_consume_instagram_dm_challenge(
  uuid,
  text,
  timestamptz,
  boolean,
  jsonb,
  text,
  text,
  text,
  text
) to service_role;

revoke all on function public.directsign_review_instagram_dm_challenge(
  uuid,
  text,
  text,
  uuid,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;
grant execute on function public.directsign_review_instagram_dm_challenge(
  uuid,
  text,
  text,
  uuid,
  text,
  timestamptz,
  jsonb
) to service_role;

comment on function directsign_private.directsign_apply_approved_instagram_dm_follower_metric(uuid) is
  'Writes only a safe follower_count captured by the matching Instagram DM User Profile response to the canonical production channel, then refreshes registered discovery metrics in the verification transaction.';
