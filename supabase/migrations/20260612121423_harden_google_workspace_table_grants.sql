revoke all
  on table public.google_workspace_connections
  from public, anon, authenticated;

revoke all
  on table public.google_calendar_events
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.google_workspace_connections
  to service_role;

grant select, insert, update, delete
  on table public.google_calendar_events
  to service_role;

comment on table public.google_workspace_connections is
  'Server-only Google OAuth token storage for Sheets and Calendar integrations. Access must stay restricted to service_role.';

comment on table public.google_calendar_events is
  'Server-only mapping for idempotent Google Calendar sync events. Access must stay restricted to service_role.';
