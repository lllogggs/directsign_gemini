create table if not exists public.operational_support_tickets (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'other',
  requester_role text not null default 'other',
  requester_name text,
  requester_email text not null,
  subject text not null,
  message text not null,
  context_url text,
  severity text not null default 'normal',
  status text not null default 'open',
  admin_note text,
  source text not null default 'support_page',
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_support_tickets_category check (
    category in (
      'service_error',
      'account_access',
      'contract_flow',
      'settlement_question',
      'privacy_request',
      'other'
    )
  ),
  constraint operational_support_tickets_requester_role check (
    requester_role in ('advertiser', 'influencer', 'operator', 'other')
  ),
  constraint operational_support_tickets_severity check (
    severity in ('low', 'normal', 'high', 'urgent')
  ),
  constraint operational_support_tickets_status check (
    status in ('open', 'reviewing', 'resolved', 'closed')
  ),
  constraint operational_support_tickets_email_not_blank check (
    btrim(requester_email) <> ''
  ),
  constraint operational_support_tickets_subject_not_blank check (
    btrim(subject) <> ''
  ),
  constraint operational_support_tickets_message_not_blank check (
    btrim(message) <> ''
  )
);

create index if not exists operational_support_tickets_status_created_idx
  on public.operational_support_tickets (status, created_at desc);

create index if not exists operational_support_tickets_category_created_idx
  on public.operational_support_tickets (category, created_at desc);

alter table public.operational_support_tickets enable row level security;

drop policy if exists operational_support_tickets_service_select
  on public.operational_support_tickets;
create policy operational_support_tickets_service_select
on public.operational_support_tickets for select
to service_role
using (auth.role() = 'service_role');

drop policy if exists operational_support_tickets_service_insert
  on public.operational_support_tickets;
create policy operational_support_tickets_service_insert
on public.operational_support_tickets for insert
to service_role
with check (auth.role() = 'service_role');

drop policy if exists operational_support_tickets_service_update
  on public.operational_support_tickets;
create policy operational_support_tickets_service_update
on public.operational_support_tickets for update
to service_role
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on public.operational_support_tickets from public, anon, authenticated;
grant select, insert, update on public.operational_support_tickets to service_role;

create or replace function public.directsign_touch_operational_support_ticket()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.directsign_touch_operational_support_ticket()
  from public, anon, authenticated;
grant execute on function public.directsign_touch_operational_support_ticket()
  to service_role;

drop trigger if exists operational_support_tickets_touch_updated_at
  on public.operational_support_tickets;
create trigger operational_support_tickets_touch_updated_at
before update on public.operational_support_tickets
for each row execute function public.directsign_touch_operational_support_ticket();

comment on table public.operational_support_tickets is
  'Operational customer support tickets for service errors, account access, contract flow, settlement boundary questions, and privacy requests.';
