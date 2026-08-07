-- Materialize approved platform identities for the stable registered-member
-- profile so the server-side follower sync can process a newly verified
-- signup before the creator publishes a full public profile.
create or replace function directsign_private.directsign_materialize_registered_member_channels(
  p_owner_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marketplace_profile_id uuid;
begin
  select marketplace_profile.id
  into v_marketplace_profile_id
  from public.marketplace_influencer_profiles as marketplace_profile
  where marketplace_profile.owner_profile_id = p_owner_profile_id
    and marketplace_profile.registered_identity_only
    and marketplace_profile.data_origin = 'production'
  limit 1;

  if v_marketplace_profile_id is null then
    return;
  end if;

  insert into public.marketplace_influencer_channels (
    id,
    profile_id,
    platform,
    label,
    handle,
    url,
    sort_order
  )
  select
    gen_random_uuid(),
    v_marketplace_profile_id,
    request_row.platform,
    case request_row.platform::text
      when 'instagram' then 'Instagram'
      when 'youtube' then 'YouTube'
      when 'tiktok' then 'TikTok'
      when 'naver_blog' then 'Naver Blog'
      else 'Other'
    end,
    lower(regexp_replace(btrim(request_row.platform_handle), '^@+', '')),
    case
      when btrim(coalesce(request_row.platform_url, '')) ~* '^https?://'
        then left(btrim(request_row.platform_url), 2048)
      else null
    end,
    row_number() over (
      order by
        request_row.platform::text,
        lower(regexp_replace(btrim(request_row.platform_handle), '^@+', ''))
    )::integer - 1
  from public.verification_requests as request_row
  where request_row.target_type::text = 'influencer_account'
    and request_row.verification_type::text = 'platform_account'
    and request_row.status::text = 'approved'
    and request_row.reviewed_at is not null
    and request_row.data_origin = 'production'
    and request_row.platform is not null
    and btrim(coalesce(request_row.platform_handle, '')) <> ''
    and (
      request_row.profile_id = p_owner_profile_id
      or request_row.target_id = p_owner_profile_id::text
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
  on conflict do nothing;

  -- A revoked platform approval must not remain as a sync target. This only
  -- cleans the provisional identity profile; published profile channels are
  -- managed by the normal public-profile save flow.
  delete from public.marketplace_influencer_channels as channel
  where channel.profile_id = v_marketplace_profile_id
    and not exists (
      select 1
      from public.verification_requests as request_row
      where request_row.target_type::text = 'influencer_account'
        and request_row.verification_type::text = 'platform_account'
        and request_row.status::text = 'approved'
        and request_row.reviewed_at is not null
        and request_row.data_origin = 'production'
        and request_row.platform = channel.platform
        and lower(regexp_replace(
          btrim(request_row.platform_handle),
          '^@+',
          ''
        )) = lower(regexp_replace(btrim(channel.handle), '^@+', ''))
        and (
          request_row.profile_id = p_owner_profile_id
          or request_row.target_id = p_owner_profile_id::text
        )
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
  reviewed_at,
  data_origin
on public.verification_requests
for each row execute function
  directsign_private.directsign_sync_registered_member_channels_from_verification();

do $$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select id
    from public.profiles
    where role::text = 'influencer'
      and data_origin = 'production'
  loop
    perform directsign_private.directsign_materialize_registered_member_channels(
      v_profile_id
    );
  end loop;
end;
$$;

revoke all on function
  directsign_private.directsign_materialize_registered_member_channels(uuid),
  directsign_private.directsign_sync_registered_member_channels_from_verification()
from public, anon, authenticated;

grant execute on function
  directsign_private.directsign_materialize_registered_member_channels(uuid),
  directsign_private.directsign_sync_registered_member_channels_from_verification()
to service_role;

comment on function directsign_private.directsign_materialize_registered_member_channels(uuid) is
  'Materializes approved production platform channels for an unpublished registered influencer identity so server-side metric sync can run immediately after verification.';
