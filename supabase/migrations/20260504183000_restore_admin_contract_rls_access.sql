create or replace function public.directsign_can_access_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or public.directsign_is_admin()
    or exists (
      select 1
      from public.contracts
      where contracts.id = p_contract_id
        and (
          contracts.created_by_profile_id = auth.uid()
          or (
            contracts.owner_organization_id is not null
            and public.directsign_is_org_member(contracts.owner_organization_id)
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

create or replace function public.directsign_can_manage_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or public.directsign_is_admin()
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

revoke execute on function public.directsign_can_access_contract(uuid)
  from public, anon;
revoke execute on function public.directsign_can_manage_contract(uuid)
  from public, anon;
grant execute on function public.directsign_can_access_contract(uuid)
  to authenticated, service_role;
grant execute on function public.directsign_can_manage_contract(uuid)
  to authenticated, service_role;
