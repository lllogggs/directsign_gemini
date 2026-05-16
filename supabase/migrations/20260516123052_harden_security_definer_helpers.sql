-- Move SECURITY DEFINER RLS helper functions out of the exposed public API
-- schema so authenticated users cannot invoke them directly through
-- /rest/v1/rpc/*. Policies keep using the same function OIDs after SET SCHEMA.

create schema if not exists directsign_private;

revoke all on schema directsign_private from public, anon;
grant usage on schema directsign_private to authenticated, service_role;

alter function public.directsign_is_admin()
  set schema directsign_private;

alter function public.directsign_is_org_member(uuid)
  set schema directsign_private;

alter function public.directsign_can_access_contract(uuid)
  set schema directsign_private;

alter function public.directsign_can_manage_contract(uuid)
  set schema directsign_private;

alter function public.directsign_can_respond_to_contract(uuid)
  set schema directsign_private;

create or replace function directsign_private.directsign_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, directsign_private
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  );
$$;

create or replace function directsign_private.directsign_is_org_member(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, directsign_private
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = p_organization_id
      and organization_members.profile_id = auth.uid()
  );
$$;

create or replace function directsign_private.directsign_can_access_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, directsign_private
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.contracts
      where contracts.id = p_contract_id
        and (
          contracts.created_by_profile_id = auth.uid()
          or (
            contracts.owner_organization_id is not null
            and directsign_private.directsign_is_org_member(contracts.owner_organization_id)
          )
          or exists (
            select 1
            from public.contract_parties
            where contract_parties.contract_id = contracts.id
              and contract_parties.profile_id = auth.uid()
          )
        )
    );
$$;

create or replace function directsign_private.directsign_can_manage_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, directsign_private
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.contracts
      where contracts.id = p_contract_id
        and (
          contracts.created_by_profile_id = auth.uid()
          or (
            contracts.owner_organization_id is not null
            and exists (
              select 1
              from public.organization_members
              where organization_members.organization_id = contracts.owner_organization_id
                and organization_members.profile_id = auth.uid()
                and organization_members.role in ('owner', 'admin', 'marketer')
            )
          )
        )
    );
$$;

create or replace function directsign_private.directsign_can_respond_to_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, directsign_private
as $$
  select
    directsign_private.directsign_can_manage_contract(p_contract_id)
    or exists (
      select 1
      from public.contract_parties
      where contract_parties.contract_id = p_contract_id
        and contract_parties.profile_id = auth.uid()
        and contract_parties.party_role in ('influencer', 'creator_manager')
    );
$$;

revoke execute on function directsign_private.directsign_is_admin()
  from public, anon;
revoke execute on function directsign_private.directsign_is_org_member(uuid)
  from public, anon;
revoke execute on function directsign_private.directsign_can_access_contract(uuid)
  from public, anon;
revoke execute on function directsign_private.directsign_can_manage_contract(uuid)
  from public, anon;
revoke execute on function directsign_private.directsign_can_respond_to_contract(uuid)
  from public, anon;

grant execute on function directsign_private.directsign_is_admin()
  to authenticated, service_role;
grant execute on function directsign_private.directsign_is_org_member(uuid)
  to authenticated, service_role;
grant execute on function directsign_private.directsign_can_access_contract(uuid)
  to authenticated, service_role;
grant execute on function directsign_private.directsign_can_manage_contract(uuid)
  to authenticated, service_role;
grant execute on function directsign_private.directsign_can_respond_to_contract(uuid)
  to authenticated, service_role;

alter function public.directsign_prevent_support_access_event_mutation()
  set search_path = public;

alter function public.directsign_prevent_support_access_request_immutable_update()
  set search_path = public;
