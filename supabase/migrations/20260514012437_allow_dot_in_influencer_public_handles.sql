alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_handle_format;

alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_handle_format check (
    public_handle ~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$'
  );

with approved_platforms as (
  select
    profile_id as owner_profile_id,
    lower(replace(regexp_replace(btrim(platform_handle), '^@+', ''), ' ', '_')) as automatic_handle,
    created_at
  from public.verification_requests
  where target_type = 'influencer_account'
    and status = 'approved'
    and profile_id is not null
    and platform_handle is not null
    and btrim(platform_handle) <> ''
),
first_profile_platform as (
  select distinct on (owner_profile_id)
    owner_profile_id,
    automatic_handle
  from approved_platforms
  where automatic_handle ~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$'
  order by owner_profile_id, created_at asc
),
unique_automatic_handles as (
  select automatic_handle
  from first_profile_platform
  group by automatic_handle
  having count(*) = 1
)
update public.marketplace_influencer_profiles profiles
set
  public_handle = first_profile_platform.automatic_handle,
  is_published = true,
  updated_at = now()
from first_profile_platform
join unique_automatic_handles
  on unique_automatic_handles.automatic_handle = first_profile_platform.automatic_handle
where profiles.owner_profile_id = first_profile_platform.owner_profile_id
  and lower(profiles.public_handle) <> first_profile_platform.automatic_handle
  and not exists (
    select 1
    from public.marketplace_influencer_profiles other_profiles
    where other_profiles.id <> profiles.id
      and lower(other_profiles.public_handle) = first_profile_platform.automatic_handle
  );
