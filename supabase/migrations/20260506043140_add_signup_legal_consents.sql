alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_policy_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_policy_version text,
  add column if not exists signup_consent_snapshot jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_signup_consent_snapshot_object;

alter table public.profiles
  add constraint profiles_signup_consent_snapshot_object
  check (jsonb_typeof(signup_consent_snapshot) = 'object');

comment on column public.profiles.terms_accepted_at is
  'Timestamp when the user accepted the required terms during signup.';

comment on column public.profiles.privacy_policy_accepted_at is
  'Timestamp when the user accepted the required privacy policy during signup.';

comment on column public.profiles.signup_consent_snapshot is
  'Signup legal consent evidence recorded by the application server.';

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.directsign_advertiser_verification_approved_for_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select vr.status = 'approved' and vr.reviewed_at is not null
    from public.contracts c
    join public.verification_requests vr
      on vr.target_type = 'advertiser_organization'
      and vr.verification_type = 'business_registration_certificate'
      and (
        vr.profile_id = c.created_by_profile_id
        or vr.target_id = c.created_by_profile_id::text
        or (
          c.owner_organization_id is not null
          and (
            vr.organization_id = c.owner_organization_id
            or vr.target_id = c.owner_organization_id::text
          )
        )
      )
    where c.id = p_contract_id
      and (
        public.directsign_is_admin()
        or c.created_by_profile_id = auth.uid()
        or (
          c.owner_organization_id is not null
          and public.directsign_is_org_member(c.owner_organization_id)
        )
      )
    order by vr.created_at desc
    limit 1
  ), false);
$$;

revoke execute on function private.directsign_advertiser_verification_approved_for_contract(uuid)
from public;

grant execute on function private.directsign_advertiser_verification_approved_for_contract(uuid)
to authenticated, service_role;

drop policy if exists share_links_manage_contract on public.share_links;

create policy share_links_manage_contract
on public.share_links for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (
  public.directsign_can_manage_contract(contract_id)
  and (
    status <> 'active'
    or private.directsign_advertiser_verification_approved_for_contract(contract_id)
  )
);
