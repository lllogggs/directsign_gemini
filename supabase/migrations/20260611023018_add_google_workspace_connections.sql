create table if not exists public.google_workspace_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  google_account_email text,
  google_account_id text,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  scopes text[] not null default '{}'::text[],
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_workspace_connections_profile_unique unique (profile_id),
  constraint google_workspace_connections_email_not_blank check (
    google_account_email is null or btrim(google_account_email) <> ''
  )
);

create table if not exists public.google_calendar_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete cascade,
  legacy_contract_id text,
  source_type text not null,
  source_id text not null,
  event_kind text not null,
  google_calendar_id text not null,
  google_event_id text not null,
  event_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_events_source_not_blank check (btrim(source_id) <> ''),
  constraint google_calendar_events_kind_not_blank check (btrim(event_kind) <> ''),
  constraint google_calendar_events_google_id_not_blank check (
    btrim(google_calendar_id) <> '' and btrim(google_event_id) <> ''
  ),
  constraint google_calendar_events_profile_source_unique unique (
    profile_id,
    source_type,
    source_id,
    event_kind
  )
);

create index if not exists google_workspace_connections_profile_idx
  on public.google_workspace_connections (profile_id)
  where revoked_at is null;

create index if not exists google_calendar_events_profile_idx
  on public.google_calendar_events (profile_id);

create index if not exists google_calendar_events_contract_idx
  on public.google_calendar_events (contract_id)
  where contract_id is not null;

alter table public.google_workspace_connections enable row level security;
alter table public.google_calendar_events enable row level security;

comment on table public.google_workspace_connections is
  'Server-only Google OAuth token storage for Sheets and Calendar integrations.';

comment on table public.google_calendar_events is
  'Server-only mapping for idempotent Google Calendar sync events.';
