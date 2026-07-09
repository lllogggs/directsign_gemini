alter table public.marketplace_brand_profiles
  drop constraint if exists marketplace_brand_profiles_organization_id_key;

drop index if exists marketplace_brand_profiles_organization_id_key;

alter table public.marketplace_brand_profiles
  add column if not exists is_default boolean not null default false,
  add column if not exists archived_at timestamptz;

update public.marketplace_brand_profiles
set is_default = true
where archived_at is null
  and id in (
    select distinct on (organization_id) id
    from public.marketplace_brand_profiles
    where archived_at is null
    order by organization_id, created_at asc, id asc
  );

create unique index if not exists marketplace_brand_profiles_one_default_per_org_uidx
  on public.marketplace_brand_profiles (organization_id)
  where is_default = true and archived_at is null;

create index if not exists marketplace_brand_profiles_org_active_updated_idx
  on public.marketplace_brand_profiles (organization_id, archived_at, updated_at desc);

alter table public.directsign_contracts
  add column if not exists brand_profile_id uuid;

create index if not exists directsign_contracts_brand_profile_updated_idx
  on public.directsign_contracts (brand_profile_id, updated_at desc)
  where brand_profile_id is not null;

drop policy if exists marketplace_brand_profiles_select_published
  on public.marketplace_brand_profiles;

create policy marketplace_brand_profiles_select_published
on public.marketplace_brand_profiles for select
to anon, authenticated
using (is_published and archived_at is null);

comment on column public.marketplace_brand_profiles.is_default is
  'Default brand profile shown first for an advertiser organization. Multiple brands can belong to one organization.';

comment on column public.marketplace_brand_profiles.archived_at is
  'Soft-delete timestamp. Archived brand profiles stay available for historical campaign and contract records.';

comment on column public.directsign_contracts.brand_profile_id is
  'Advertiser brand profile selected when the contract was created or last bound by the advertiser.';
