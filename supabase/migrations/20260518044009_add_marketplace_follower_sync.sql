alter table public.marketplace_influencer_channels
  add column if not exists follower_count bigint,
  add column if not exists follower_count_synced_at timestamptz,
  add column if not exists follower_sync_status text not null default 'not_synced',
  add column if not exists follower_sync_source text,
  add column if not exists follower_sync_error text,
  add column if not exists follower_sync_metadata jsonb not null default '{}'::jsonb;

alter table public.marketplace_influencer_channels
  drop constraint if exists marketplace_influencer_channels_follower_count_nonnegative;

alter table public.marketplace_influencer_channels
  add constraint marketplace_influencer_channels_follower_count_nonnegative check (
    follower_count is null or follower_count >= 0
  );

alter table public.marketplace_influencer_channels
  drop constraint if exists marketplace_influencer_channels_follower_sync_status_allowed;

alter table public.marketplace_influencer_channels
  add constraint marketplace_influencer_channels_follower_sync_status_allowed check (
    follower_sync_status in (
      'not_synced',
      'synced',
      'stale',
      'failed',
      'skipped',
      'not_configured'
    )
  );

alter table public.marketplace_influencer_channels
  drop constraint if exists marketplace_influencer_channels_follower_sync_metadata_object;

alter table public.marketplace_influencer_channels
  add constraint marketplace_influencer_channels_follower_sync_metadata_object check (
    jsonb_typeof(follower_sync_metadata) = 'object'
  );

create index if not exists marketplace_influencer_channels_follower_sync_idx
  on public.marketplace_influencer_channels (follower_sync_status, follower_count_synced_at asc nulls first);

create table if not exists public.marketplace_follower_sync_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by text not null default 'cron',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  channels_checked integer not null default 0,
  channels_updated integer not null default 0,
  channels_failed integer not null default 0,
  channels_skipped integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_follower_sync_runs_status_allowed check (
    status in ('running', 'completed', 'partial_failed', 'failed')
  ),
  constraint marketplace_follower_sync_runs_counts_nonnegative check (
    channels_checked >= 0
    and channels_updated >= 0
    and channels_failed >= 0
    and channels_skipped >= 0
  ),
  constraint marketplace_follower_sync_runs_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists marketplace_follower_sync_runs_created_idx
  on public.marketplace_follower_sync_runs (created_at desc);

drop trigger if exists marketplace_follower_sync_runs_touch_updated_at
  on public.marketplace_follower_sync_runs;
create trigger marketplace_follower_sync_runs_touch_updated_at
before update on public.marketplace_follower_sync_runs
for each row execute function public.directsign_touch_updated_at();

create table if not exists public.marketplace_follower_sync_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.marketplace_follower_sync_runs (id) on delete cascade,
  channel_id uuid references public.marketplace_influencer_channels (id) on delete set null,
  profile_id uuid references public.marketplace_influencer_profiles (id) on delete set null,
  platform public.directsign_platform_type not null,
  handle text not null,
  status text not null,
  previous_follower_count bigint,
  follower_count bigint,
  previous_followers_label text,
  followers_label text,
  provider text,
  http_status integer,
  error_message text,
  checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketplace_follower_sync_events_status_allowed check (
    status in ('updated', 'unchanged', 'failed', 'skipped', 'not_configured')
  ),
  constraint marketplace_follower_sync_events_counts_nonnegative check (
    (previous_follower_count is null or previous_follower_count >= 0)
    and (follower_count is null or follower_count >= 0)
  ),
  constraint marketplace_follower_sync_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists marketplace_follower_sync_events_run_idx
  on public.marketplace_follower_sync_events (run_id, created_at desc);

create index if not exists marketplace_follower_sync_events_channel_idx
  on public.marketplace_follower_sync_events (channel_id, created_at desc)
  where channel_id is not null;

alter table public.marketplace_follower_sync_runs enable row level security;
alter table public.marketplace_follower_sync_events enable row level security;

revoke all on table
  public.marketplace_follower_sync_runs,
  public.marketplace_follower_sync_events
from public, anon, authenticated;

grant select, insert, update on table
  public.marketplace_follower_sync_runs
to service_role;

grant select, insert on table
  public.marketplace_follower_sync_events
to service_role;

comment on column public.marketplace_influencer_channels.follower_count is
  'Latest numeric follower, subscriber, or public daily visitor count from the platform provider when available.';

comment on column public.marketplace_influencer_channels.follower_count_synced_at is
  'Time when follower_count and followers_label were last refreshed from a platform provider.';

comment on table public.marketplace_follower_sync_runs is
  'Server-only summary records for marketplace follower count sync executions.';

comment on table public.marketplace_follower_sync_events is
  'Server-only per-channel follower sync audit events, including skipped and failed provider checks.';
