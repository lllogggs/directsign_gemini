-- Internal service-check accounts are production auth identities managed by the
-- service role. They are not QA, demo, seed, or customer-visible test data.
-- The influencer account can use authenticated campaign/contract surfaces while
-- remaining absent from advertiser discovery and public creator directories.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.internal_service_accounts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  account_role text not null check (account_role in ('marketer', 'influencer')),
  exclude_from_influencer_discovery boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_service_accounts_discovery_scope check (
    not exclude_from_influencer_discovery or account_role = 'influencer'
  )
);

alter table public.internal_service_accounts enable row level security;

revoke all on table public.internal_service_accounts
  from public, anon, authenticated;
grant select, insert, update, delete on table public.internal_service_accounts
  to service_role;

create index if not exists internal_service_accounts_discovery_idx
  on public.internal_service_accounts (
    account_role,
    exclude_from_influencer_discovery,
    updated_at desc
  );

comment on table public.internal_service_accounts is
  'Service-role-managed production accounts used for controlled service checks. The table is never exposed to customer sessions.';

comment on column public.internal_service_accounts.exclude_from_influencer_discovery is
  'When true for an influencer account, hide the account from advertiser and public creator discovery while retaining authenticated workflow access.';

create or replace function directsign_private.directsign_is_internal_service_account(
  p_profile_id uuid,
  p_expected_role text default null,
  p_require_discovery_exclusion boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.internal_service_accounts as internal_account
    join public.profiles as profile
      on profile.id = internal_account.profile_id
    where internal_account.profile_id = p_profile_id
      and profile.role::text = internal_account.account_role
      and (
        p_expected_role is null
        or profile.role::text = p_expected_role
      )
      and (
        not p_require_discovery_exclusion
        or internal_account.exclude_from_influencer_discovery
      )
  );
$$;

revoke all on function
  directsign_private.directsign_is_internal_service_account(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function
  directsign_private.directsign_is_internal_service_account(uuid, text, boolean)
  to service_role;

create or replace function public.directsign_remove_internal_influencer_directory_rows(
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not directsign_private.directsign_is_internal_service_account(
    p_profile_id,
    'influencer',
    true
  ) then
    return;
  end if;

  delete from public.marketplace_registered_influencer_directory
  where owner_profile_id = p_profile_id;

  delete from public.marketplace_public_influencer_directory as public_directory
  using public.marketplace_influencer_profiles as marketplace_profile
  where public_directory.source_type = 'registered'
    and public_directory.source_id = marketplace_profile.id
    and marketplace_profile.owner_profile_id = p_profile_id;
end;
$$;

revoke all on function
  public.directsign_remove_internal_influencer_directory_rows(uuid)
  from public, anon, authenticated;
grant execute on function
  public.directsign_remove_internal_influencer_directory_rows(uuid)
  to service_role;

create or replace function public.directsign_validate_internal_service_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_role text;
begin
  select profile.role::text
  into v_profile_role
  from public.profiles as profile
  where profile.id = new.profile_id;

  if v_profile_role is null or v_profile_role <> new.account_role then
    raise exception using
      errcode = '23514',
      message = 'internal service account role must match profile role';
  end if;

  return new;
end;
$$;

drop trigger if exists internal_service_accounts_validate
  on public.internal_service_accounts;
create trigger internal_service_accounts_validate
before insert or update of profile_id, account_role
on public.internal_service_accounts
for each row execute function public.directsign_validate_internal_service_account();

create or replace function public.directsign_sync_internal_service_account_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_profile_role text;
begin
  v_profile_id := case
    when tg_op = 'DELETE' then old.profile_id
    else new.profile_id
  end;

  select profile.role::text
  into v_profile_role
  from public.profiles as profile
  where profile.id = v_profile_id;

  if v_profile_role <> 'influencer' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op <> 'DELETE'
     and directsign_private.directsign_is_internal_service_account(
       v_profile_id,
       'influencer',
       true
     ) then
    perform public.directsign_remove_internal_influencer_directory_rows(
      v_profile_id
    );
  else
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_profile_id
    );
    perform public.directsign_refresh_registered_influencer_directory(
      marketplace_profile.id
    )
    from public.marketplace_influencer_profiles as marketplace_profile
    where marketplace_profile.owner_profile_id = v_profile_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.directsign_sync_internal_service_account_directory()
  from public, anon, authenticated;
grant execute on function public.directsign_sync_internal_service_account_directory()
  to service_role;

create or replace function public.directsign_hide_internal_profile_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op <> 'DELETE'
     and directsign_private.directsign_is_internal_service_account(
       new.id,
       'influencer',
       true
     ) then
    perform public.directsign_remove_internal_influencer_directory_rows(new.id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.directsign_hide_internal_profile_directory()
  from public, anon, authenticated;
grant execute on function public.directsign_hide_internal_profile_directory()
  to service_role;

create or replace function public.directsign_hide_internal_marketplace_profile_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  v_profile_id := case
    when tg_op = 'DELETE' then old.owner_profile_id
    else new.owner_profile_id
  end;

  if directsign_private.directsign_is_internal_service_account(
    v_profile_id,
    'influencer',
    true
  ) then
    perform public.directsign_remove_internal_influencer_directory_rows(
      v_profile_id
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.directsign_hide_internal_marketplace_profile_directory()
  from public, anon, authenticated;
grant execute on function public.directsign_hide_internal_marketplace_profile_directory()
  to service_role;

create or replace function public.directsign_hide_internal_channel_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marketplace_profile_id uuid;
  v_profile_id uuid;
begin
  v_marketplace_profile_id := case
    when tg_op = 'DELETE' then old.profile_id
    else new.profile_id
  end;

  select marketplace_profile.owner_profile_id
  into v_profile_id
  from public.marketplace_influencer_profiles as marketplace_profile
  where marketplace_profile.id = v_marketplace_profile_id;

  if directsign_private.directsign_is_internal_service_account(
    v_profile_id,
    'influencer',
    true
  ) then
    perform public.directsign_remove_internal_influencer_directory_rows(
      v_profile_id
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.directsign_hide_internal_channel_directory()
  from public, anon, authenticated;
grant execute on function public.directsign_hide_internal_channel_directory()
  to service_role;

drop trigger if exists internal_service_accounts_sync_directory
  on public.internal_service_accounts;
create trigger internal_service_accounts_sync_directory
after insert or update or delete
on public.internal_service_accounts
for each row execute function public.directsign_sync_internal_service_account_directory();

drop trigger if exists zz_internal_service_accounts_hide_profiles
  on public.profiles;
create trigger zz_internal_service_accounts_hide_profiles
after insert or update of role, name, email, avatar_url, activity_categories,
  activity_platforms, data_origin
on public.profiles
for each row execute function public.directsign_hide_internal_profile_directory();

drop trigger if exists zz_internal_service_accounts_hide_marketplace_profiles
  on public.marketplace_influencer_profiles;
create trigger zz_internal_service_accounts_hide_marketplace_profiles
after insert or update or delete
on public.marketplace_influencer_profiles
for each row execute function public.directsign_hide_internal_marketplace_profile_directory();

drop trigger if exists zz_internal_service_accounts_hide_channels
  on public.marketplace_influencer_channels;
create trigger zz_internal_service_accounts_hide_channels
after insert or update or delete
on public.marketplace_influencer_channels
for each row execute function public.directsign_hide_internal_channel_directory();
