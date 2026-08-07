-- Keep follower metric writes for an unpublished registered member out of the
-- public-directory refresh path, while refreshing the authenticated advertiser
-- directory from the authoritative channel count.
create or replace function public.directsign_sync_registered_channel_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_published boolean;
  v_data_origin text;
begin
  if tg_op = 'DELETE' then
    select marketplace_profile.is_published, marketplace_profile.data_origin
    into v_is_published, v_data_origin
    from public.marketplace_influencer_profiles as marketplace_profile
    where marketplace_profile.id = old.profile_id;

    if v_is_published is distinct from true
       or v_data_origin is distinct from 'production' then
      return old;
    end if;

    perform public.directsign_refresh_registered_influencer_directory(
      old.profile_id
    );
    return old;
  end if;

  select marketplace_profile.is_published, marketplace_profile.data_origin
  into v_is_published, v_data_origin
  from public.marketplace_influencer_profiles as marketplace_profile
  where marketplace_profile.id = new.profile_id;

  if v_is_published is distinct from true
     or v_data_origin is distinct from 'production' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id then
    perform public.directsign_refresh_registered_influencer_directory(
      old.profile_id
    );
  end if;
  perform public.directsign_refresh_registered_influencer_directory(
    new.profile_id
  );
  return new;
end;
$$;

create or replace function directsign_private.directsign_sync_registered_member_directory_from_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_owner_profile_id uuid;
begin
  for v_profile_id in
    select candidate_profile_id
    from unnest(array[
      case when tg_op = 'DELETE' then old.profile_id else new.profile_id end,
      case
        when tg_op = 'UPDATE' and old.profile_id is distinct from new.profile_id
          then old.profile_id
        else null
      end
    ]) as candidate_profile_id
    where candidate_profile_id is not null
  loop
    select marketplace_profile.owner_profile_id
    into v_owner_profile_id
    from public.marketplace_influencer_profiles as marketplace_profile
    where marketplace_profile.id = v_profile_id
      and marketplace_profile.registered_identity_only
      and marketplace_profile.data_origin = 'production';

    if v_owner_profile_id is not null then
      perform directsign_private.directsign_refresh_registered_member_discovery(
        v_owner_profile_id
      );
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists marketplace_influencer_channels_sync_registered_member_directory
  on public.marketplace_influencer_channels;
create trigger marketplace_influencer_channels_sync_registered_member_directory
after insert or update or delete
on public.marketplace_influencer_channels
for each row execute function
  directsign_private.directsign_sync_registered_member_directory_from_channel();

revoke all on function
  directsign_private.directsign_sync_registered_member_directory_from_channel()
from public, anon, authenticated;
grant execute on function
  directsign_private.directsign_sync_registered_member_directory_from_channel()
to service_role;
