create table if not exists public.operational_alert_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  action text not null,
  severity text not null default 'normal',
  status text not null default 'queued',
  subject_type text not null,
  subject_id text not null,
  title text not null,
  body text not null,
  mobile_path text not null,
  dashboard_path text,
  dedupe_key text not null,
  decision_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_alert_events_kind check (
    kind in ('verification_request', 'support_ticket', 'support_access')
  ),
  constraint operational_alert_events_action check (
    action in ('auto_approved', 'needs_review', 'mobile_action')
  ),
  constraint operational_alert_events_severity check (
    severity in ('info', 'normal', 'high', 'urgent')
  ),
  constraint operational_alert_events_status check (
    status in ('queued', 'sent', 'failed', 'muted')
  ),
  constraint operational_alert_events_subject_type_not_blank check (btrim(subject_type) <> ''),
  constraint operational_alert_events_subject_id_not_blank check (btrim(subject_id) <> ''),
  constraint operational_alert_events_title_not_blank check (btrim(title) <> ''),
  constraint operational_alert_events_body_not_blank check (btrim(body) <> ''),
  constraint operational_alert_events_mobile_path check (
    mobile_path = '/admin/mobile' or mobile_path like '/admin/mobile?%'
  ),
  constraint operational_alert_events_dedupe_key_not_blank check (btrim(dedupe_key) <> '')
);

create unique index if not exists operational_alert_events_dedupe_key_idx
  on public.operational_alert_events (dedupe_key);

create index if not exists operational_alert_events_status_created_idx
  on public.operational_alert_events (status, created_at desc);

create index if not exists operational_alert_events_subject_idx
  on public.operational_alert_events (kind, subject_id, created_at desc);

alter table public.operational_alert_events enable row level security;

revoke all on public.operational_alert_events from public, anon, authenticated;
grant select, insert, update on public.operational_alert_events to service_role;

create or replace function public.directsign_touch_operational_alert_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.directsign_touch_operational_alert_event()
  from public, anon, authenticated;
grant execute on function public.directsign_touch_operational_alert_event()
  to service_role;

drop trigger if exists operational_alert_events_touch_updated_at
  on public.operational_alert_events;
create trigger operational_alert_events_touch_updated_at
before update on public.operational_alert_events
for each row execute function public.directsign_touch_operational_alert_event();

comment on table public.operational_alert_events is
  'Server-side operational phone alert queue for admin mobile operations.';
