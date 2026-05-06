-- Harden contract-content access so operators cannot directly read contracts
-- through Supabase RLS. Operator review must go through the audited support
-- access flow handled by the server.

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

revoke execute on function public.directsign_can_access_contract(uuid)
  from public, anon;
revoke execute on function public.directsign_can_manage_contract(uuid)
  from public, anon;
grant execute on function public.directsign_can_access_contract(uuid)
  to authenticated, service_role;
grant execute on function public.directsign_can_manage_contract(uuid)
  to authenticated, service_role;

drop policy if exists support_access_requests_insert_party on public.support_access_requests;
drop policy if exists support_access_requests_insert_service_only on public.support_access_requests;
create policy support_access_requests_insert_service_only
on public.support_access_requests for insert
to service_role
with check (auth.role() = 'service_role');

revoke insert on public.support_access_requests from authenticated;
grant select, update on public.support_access_requests to authenticated;
grant select, insert, update on public.support_access_requests to service_role;

create table if not exists public.support_access_events (
  id uuid primary key default gen_random_uuid(),
  support_access_request_id uuid not null
    references public.support_access_requests (id) on delete cascade,
  contract_id text not null,
  action text not null,
  actor_role text not null,
  actor_name text,
  description text not null,
  ip text,
  user_agent text,
  event_hash text not null,
  previous_event_hash text,
  created_at timestamptz not null default now(),
  constraint support_access_events_contract_id_not_blank check (btrim(contract_id) <> ''),
  constraint support_access_events_description_not_blank check (btrim(description) <> ''),
  constraint support_access_events_action check (
    action in ('created', 'viewed_contract', 'viewed_pdf', 'closed', 'expired')
  ),
  constraint support_access_events_actor_role check (
    actor_role in ('advertiser', 'influencer', 'admin', 'system')
  )
);

create unique index if not exists support_access_events_event_hash_key
  on public.support_access_events (event_hash);

create index if not exists support_access_events_request_created_idx
  on public.support_access_events (support_access_request_id, created_at desc);

create index if not exists support_access_events_contract_created_idx
  on public.support_access_events (contract_id, created_at desc);

alter table public.support_access_events enable row level security;

drop policy if exists support_access_events_select_service_only on public.support_access_events;
create policy support_access_events_select_service_only
on public.support_access_events for select
to service_role
using (auth.role() = 'service_role');

drop policy if exists support_access_events_insert_service_only on public.support_access_events;
create policy support_access_events_insert_service_only
on public.support_access_events for insert
to service_role
with check (auth.role() = 'service_role');

revoke all on public.support_access_events from public, anon, authenticated;
grant select, insert on public.support_access_events to service_role;

create or replace function public.directsign_prevent_support_access_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'support_access_events is append-only';
end;
$$;

revoke execute on function public.directsign_prevent_support_access_event_mutation()
  from public, anon, authenticated;

drop trigger if exists support_access_events_prevent_update
  on public.support_access_events;
create trigger support_access_events_prevent_update
before update on public.support_access_events
for each row execute function public.directsign_prevent_support_access_event_mutation();

drop trigger if exists support_access_events_prevent_delete
  on public.support_access_events;
create trigger support_access_events_prevent_delete
before delete on public.support_access_events
for each row execute function public.directsign_prevent_support_access_event_mutation();

comment on table public.support_access_events is
  'Append-only audit chain for operator support access to contract contents.';
