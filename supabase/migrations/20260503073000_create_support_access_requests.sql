do $$
begin
  create type public.directsign_support_access_status as enum (
    'active',
    'closed',
    'revoked',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_support_access_scope as enum (
    'contract',
    'contract_and_pdf'
  );
exception
  when duplicate_object then null;
end $$;

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

drop policy if exists contracts_insert_authenticated on public.contracts;
create policy contracts_insert_authenticated
on public.contracts for insert
to authenticated
with check (
  created_by_profile_id = auth.uid()
  or (
    owner_organization_id is not null
    and exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = owner_organization_id
        and organization_members.profile_id = auth.uid()
        and organization_members.role in ('owner', 'admin', 'marketer')
    )
  )
);

create table if not exists public.support_access_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id text not null,
  contract_uuid uuid references public.contracts (id) on delete cascade,
  legacy_contract_id text,
  requester_profile_id uuid references public.profiles (id) on delete set null,
  requester_role public.directsign_contract_party_role not null,
  requester_name text,
  requester_email text,
  reason text not null,
  scope public.directsign_support_access_scope not null default 'contract',
  status public.directsign_support_access_status not null default 'active',
  expires_at timestamptz not null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  audit_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_access_requests_contract_reference check (btrim(contract_id) <> ''),
  constraint support_access_requests_reason_not_blank check (btrim(reason) <> ''),
  constraint support_access_requests_audit_events_array check (
    jsonb_typeof(audit_events) = 'array'
  ),
  constraint support_access_requests_requester_role check (
    requester_role in ('advertiser', 'influencer')
  )
);

create index if not exists support_access_requests_contract_created_idx
  on public.support_access_requests (contract_id, created_at desc)
  where contract_id is not null;

create index if not exists support_access_requests_contract_uuid_created_idx
  on public.support_access_requests (contract_uuid, created_at desc)
  where contract_uuid is not null;

create index if not exists support_access_requests_status_expires_idx
  on public.support_access_requests (status, expires_at desc);

alter table public.support_access_requests enable row level security;

drop policy if exists support_access_requests_select_related on public.support_access_requests;
create policy support_access_requests_select_related
on public.support_access_requests for select
to authenticated
using (
  public.directsign_is_admin()
  or requester_profile_id = auth.uid()
  or (
    contract_uuid is not null
    and public.directsign_can_access_contract(contract_uuid)
  )
);

drop policy if exists support_access_requests_insert_party on public.support_access_requests;
create policy support_access_requests_insert_party
on public.support_access_requests for insert
to authenticated
with check (
  requester_profile_id = auth.uid()
  and requester_role in ('advertiser', 'influencer')
  and (
    contract_uuid is null
    or public.directsign_can_access_contract(contract_uuid)
  )
);

drop policy if exists support_access_requests_admin_update on public.support_access_requests;
create policy support_access_requests_admin_update
on public.support_access_requests for update
to authenticated
using (public.directsign_is_admin())
with check (public.directsign_is_admin());

grant select, insert, update on public.support_access_requests
to authenticated, service_role;

comment on table public.support_access_requests is
  'Time-limited operator support access opened by a contract party. Contract contents remain hidden from operators unless an active request exists.';
