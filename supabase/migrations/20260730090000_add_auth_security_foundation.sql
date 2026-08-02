-- Database-backed authentication security primitives for personal operators,
-- one-time recent-auth grants, and privacy-preserving operational metrics.
-- Application code must still perform authoritative Supabase Auth validation.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  create type public.directsign_auth_metric_operation as enum (
    'user_signup',
    'user_login',
    'admin_login',
    'admin_mfa_enroll',
    'admin_mfa_challenge',
    'admin_mfa_verify',
    'recent_auth_issue',
    'recent_auth_consume',
    'session_validate',
    'session_refresh',
    'session_logout',
    'session_revoke',
    'password_reset'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_auth_metric_role as enum (
    'anonymous',
    'marketer',
    'influencer',
    'admin',
    'system'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_auth_metric_outcome as enum (
    'success',
    'rejected',
    'required',
    'expired',
    'revoked',
    'invalid',
    'rate_limited',
    'provider_error',
    'storage_error',
    'unavailable'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_auth_metric_data_origin as enum (
    'production',
    'qa',
    'demo',
    'seed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.admin_operator_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_session_id uuid not null unique,
  operator_profile_id uuid not null
    references public.profiles (id) on delete cascade,
  aal text not null default 'aal2',
  authenticated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  ip_hash text,
  user_agent_hash text,
  device_hash text,
  created_at timestamptz not null default now(),
  constraint admin_operator_sessions_aal2 check (aal = 'aal2'),
  constraint admin_operator_sessions_absolute_ttl check (
    absolute_expires_at > authenticated_at
    and absolute_expires_at <= authenticated_at + interval '8 hours'
  ),
  constraint admin_operator_sessions_last_seen_order check (
    last_seen_at >= authenticated_at
    and last_seen_at <= absolute_expires_at
  ),
  constraint admin_operator_sessions_revocation_order check (
    revoked_at is null or revoked_at >= authenticated_at
  ),
  constraint admin_operator_sessions_revocation_reason check (
    (revoked_at is null and revoke_reason is null)
    or (
      revoked_at is not null
      and revoke_reason ~ '^[a-z][a-z0-9_]{0,63}$'
    )
  ),
  constraint admin_operator_sessions_ip_hash_format check (
    ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint admin_operator_sessions_user_agent_hash_format check (
    user_agent_hash is null or user_agent_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint admin_operator_sessions_device_hash_format check (
    device_hash is null or device_hash ~ '^[0-9a-f]{64}$'
  )
);

create index if not exists admin_operator_sessions_active_operator_idx
  on public.admin_operator_sessions (
    operator_profile_id,
    absolute_expires_at desc
  )
  where revoked_at is null;

-- The full FK index keeps profile deletion from scanning expired or revoked rows.
create index if not exists admin_operator_sessions_operator_profile_idx
  on public.admin_operator_sessions (operator_profile_id);

create index if not exists admin_operator_sessions_expiry_idx
  on public.admin_operator_sessions (absolute_expires_at);

alter table public.admin_operator_sessions enable row level security;

revoke all on table public.admin_operator_sessions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_operator_sessions
  to service_role;

-- An admin profile alone must never unlock Data API RLS. Authenticated
-- operator access additionally requires the signed JWT to be AAL2 and bound
-- to the same active, unrevoked database-backed Supabase Auth session.
create or replace function directsign_private.directsign_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case auth.role()
    when 'service_role' then true
    when 'authenticated' then (
      coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      and exists (
        select 1
        from public.profiles as admin_profile
        join public.admin_operator_sessions as operator_session
          on operator_session.operator_profile_id = admin_profile.id
        where admin_profile.id = auth.uid()
          and admin_profile.role = 'admin'
          and operator_session.operator_profile_id = auth.uid()
          and operator_session.auth_session_id = case
            when coalesce(auth.jwt() ->> 'session_id', '') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (auth.jwt() ->> 'session_id')::uuid
            else null::uuid
          end
          and operator_session.aal = 'aal2'
          and operator_session.revoked_at is null
          and operator_session.authenticated_at
            <= pg_catalog.statement_timestamp()
          and operator_session.absolute_expires_at
            > pg_catalog.statement_timestamp()
      )
    )
    else false
  end;
$$;

revoke execute on function directsign_private.directsign_is_admin()
  from public, anon;
grant execute on function directsign_private.directsign_is_admin()
  to authenticated, service_role;

comment on function directsign_private.directsign_is_admin() is
  'Returns true only for service_role or a current admin profile using an active AAL2 Supabase session registered in admin_operator_sessions. Missing or malformed session claims fail closed.';

create table if not exists public.auth_recent_grants (
  token_hash text primary key,
  profile_id uuid not null
    references public.profiles (id) on delete cascade,
  auth_session_id uuid not null,
  role public.directsign_user_role not null,
  action text not null,
  resource_hash text not null,
  authenticated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_recent_grants_token_hash_format check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint auth_recent_grants_action_format check (
    action ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint auth_recent_grants_resource_hash_format check (
    resource_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint auth_recent_grants_ttl check (
    expires_at > authenticated_at
    and expires_at <= authenticated_at + interval '10 minutes'
  ),
  constraint auth_recent_grants_consumed_order check (
    consumed_at is null or consumed_at >= authenticated_at
  ),
  constraint auth_recent_grants_revoked_order check (
    revoked_at is null or revoked_at >= authenticated_at
  )
);

create index if not exists auth_recent_grants_active_session_idx
  on public.auth_recent_grants (profile_id, auth_session_id, expires_at)
  where consumed_at is null and revoked_at is null;

-- The full FK index also covers consumed, revoked, and expired grants.
create index if not exists auth_recent_grants_profile_idx
  on public.auth_recent_grants (profile_id);

create index if not exists auth_recent_grants_expiry_idx
  on public.auth_recent_grants (expires_at);

alter table public.auth_recent_grants enable row level security;

revoke all on table public.auth_recent_grants
  from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_recent_grants
  to service_role;

create or replace function public.consume_auth_recent_grant(
  p_token_hash text,
  p_profile_id uuid,
  p_auth_session_id uuid,
  p_role public.directsign_user_role,
  p_action text,
  p_resource_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_consumed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role required';
  end if;

  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_profile_id is null
    or p_auth_session_id is null
    or p_role is null
    or p_action is null
    or p_action !~ '^[a-z][a-z0-9_]{0,63}$'
    or p_resource_hash is null
    or p_resource_hash !~ '^[0-9a-f]{64}$'
  then
    return false;
  end if;

  update public.auth_recent_grants as grant_row
  set consumed_at = v_now
  where grant_row.token_hash = p_token_hash
    and grant_row.profile_id = p_profile_id
    and grant_row.auth_session_id = p_auth_session_id
    and grant_row.role = p_role
    and grant_row.action = p_action
    and grant_row.resource_hash = p_resource_hash
    and grant_row.authenticated_at <= v_now
    and grant_row.expires_at > v_now
    and grant_row.consumed_at is null
    and grant_row.revoked_at is null
    and exists (
      select 1
      from public.profiles as current_profile
      where current_profile.id = grant_row.profile_id
        and current_profile.role = grant_row.role
    )
    and (
      grant_row.role <> 'admin'::public.directsign_user_role
      or exists (
        select 1
        from public.admin_operator_sessions as operator_session
        where operator_session.auth_session_id = grant_row.auth_session_id
          and operator_session.operator_profile_id = grant_row.profile_id
          and operator_session.aal = 'aal2'
          and operator_session.authenticated_at <= v_now
          and operator_session.absolute_expires_at > v_now
          and operator_session.revoked_at is null
      )
    )
  returning true into v_consumed;

  return coalesce(v_consumed, false);
end;
$$;

revoke execute on function public.consume_auth_recent_grant(
  text,
  uuid,
  uuid,
  public.directsign_user_role,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.consume_auth_recent_grant(
  text,
  uuid,
  uuid,
  public.directsign_user_role,
  text,
  text
) to service_role;

create table if not exists public.operational_auth_metric_buckets (
  bucket_minute timestamptz not null,
  operation public.directsign_auth_metric_operation not null,
  role public.directsign_auth_metric_role not null,
  outcome public.directsign_auth_metric_outcome not null,
  request_count bigint not null default 1,
  total_latency_ms bigint not null default 0,
  max_latency_ms integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket_minute, operation, role, outcome),
  constraint operational_auth_metric_minute_bucket check (
    bucket_minute = pg_catalog.date_trunc('minute', bucket_minute)
  ),
  constraint operational_auth_metric_count_positive check (
    request_count > 0
  ),
  constraint operational_auth_metric_latency_non_negative check (
    total_latency_ms >= 0 and max_latency_ms >= 0
  ),
  constraint operational_auth_metric_latency_order check (
    total_latency_ms >= max_latency_ms
  )
);

create index if not exists operational_auth_metric_bucket_minute_idx
  on public.operational_auth_metric_buckets (bucket_minute desc);

alter table public.operational_auth_metric_buckets enable row level security;

revoke all on table public.operational_auth_metric_buckets
  from public, anon, authenticated;
grant select, delete on table public.operational_auth_metric_buckets
  to service_role;

revoke usage on type public.directsign_auth_metric_operation
  from public, anon, authenticated;
revoke usage on type public.directsign_auth_metric_role
  from public, anon, authenticated;
revoke usage on type public.directsign_auth_metric_outcome
  from public, anon, authenticated;
revoke usage on type public.directsign_auth_metric_data_origin
  from public, anon, authenticated;
grant usage on type public.directsign_auth_metric_operation,
  public.directsign_auth_metric_role,
  public.directsign_auth_metric_outcome,
  public.directsign_auth_metric_data_origin
  to service_role;

create or replace function public.record_operational_auth_metric(
  p_operation public.directsign_auth_metric_operation,
  p_role public.directsign_auth_metric_role,
  p_outcome public.directsign_auth_metric_outcome,
  p_latency_ms integer,
  p_data_origin public.directsign_auth_metric_data_origin
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_bucket_minute timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role required';
  end if;

  -- Operational dashboards must never count QA, demo, seed, or unknown data.
  if p_data_origin is distinct from
    'production'::public.directsign_auth_metric_data_origin
  then
    return;
  end if;

  if p_operation is null
    or p_role is null
    or p_outcome is null
    or p_latency_ms is null
    or p_latency_ms < 0
    or p_latency_ms > 3600000
  then
    raise exception using
      errcode = '22023',
      message = 'invalid operational auth metric';
  end if;

  v_bucket_minute := pg_catalog.date_trunc('minute', v_now);

  insert into public.operational_auth_metric_buckets as metric_bucket (
    bucket_minute,
    operation,
    role,
    outcome,
    request_count,
    total_latency_ms,
    max_latency_ms,
    updated_at
  )
  values (
    v_bucket_minute,
    p_operation,
    p_role,
    p_outcome,
    1,
    p_latency_ms::bigint,
    p_latency_ms,
    v_now
  )
  on conflict (bucket_minute, operation, role, outcome) do update
  set
    request_count = metric_bucket.request_count + 1,
    total_latency_ms = metric_bucket.total_latency_ms
      + excluded.total_latency_ms,
    max_latency_ms = greatest(
      metric_bucket.max_latency_ms,
      excluded.max_latency_ms
    ),
    updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.record_operational_auth_metric(
  public.directsign_auth_metric_operation,
  public.directsign_auth_metric_role,
  public.directsign_auth_metric_outcome,
  integer,
  public.directsign_auth_metric_data_origin
) from public, anon, authenticated;
grant execute on function public.record_operational_auth_metric(
  public.directsign_auth_metric_operation,
  public.directsign_auth_metric_role,
  public.directsign_auth_metric_outcome,
  integer,
  public.directsign_auth_metric_data_origin
) to service_role;

-- Extend the existing low-cardinality operator alert queue for authentication
-- health without changing or removing any existing alert kind/action.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'operational_alert_events_kind_auth_health'
      and conrelid = 'public.operational_alert_events'::regclass
  ) then
    alter table public.operational_alert_events
      add constraint operational_alert_events_kind_auth_health check (
        kind in (
          'verification_request',
          'support_ticket',
          'support_access',
          'auth_health'
        )
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'operational_alert_events_action_auth_health'
      and conrelid = 'public.operational_alert_events'::regclass
  ) then
    alter table public.operational_alert_events
      add constraint operational_alert_events_action_auth_health check (
        action in (
          'auto_approved',
          'needs_review',
          'mobile_action',
          'provider_degraded',
          'terminal_spike',
          'revoke_failed',
          'rate_limit_spike'
        )
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'operational_alert_events_kind_action_match'
      and conrelid = 'public.operational_alert_events'::regclass
  ) then
    alter table public.operational_alert_events
      add constraint operational_alert_events_kind_action_match check (
        (
          kind = 'auth_health'
          and action in (
            'provider_degraded',
            'terminal_spike',
            'revoke_failed',
            'rate_limit_spike'
          )
        )
        or (
          kind <> 'auth_health'
          and action in ('auto_approved', 'needs_review', 'mobile_action')
        )
      ) not valid;
  end if;
end $$;

alter table public.operational_alert_events
  validate constraint operational_alert_events_kind_auth_health;
alter table public.operational_alert_events
  validate constraint operational_alert_events_action_auth_health;
alter table public.operational_alert_events
  validate constraint operational_alert_events_kind_action_match;

-- Remove the narrower legacy checks only after the expanded constraints have
-- been installed and validated, so there is no unconstrained write window.
alter table public.operational_alert_events
  drop constraint if exists operational_alert_events_kind;
alter table public.operational_alert_events
  drop constraint if exists operational_alert_events_action;

-- Add personal operator attribution without changing or backfilling legacy rows.
alter table public.support_access_requests
  add column if not exists reviewed_by_profile_id uuid;

alter table public.support_access_events
  add column if not exists actor_profile_id uuid;

alter table public.operational_support_tickets
  add column if not exists reviewed_by_profile_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'support_access_requests_reviewer_profile_fk'
      and conrelid = 'public.support_access_requests'::regclass
  ) then
    alter table public.support_access_requests
      add constraint support_access_requests_reviewer_profile_fk
      foreign key (reviewed_by_profile_id)
      references public.profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'support_access_events_actor_profile_fk'
      and conrelid = 'public.support_access_events'::regclass
  ) then
    alter table public.support_access_events
      add constraint support_access_events_actor_profile_fk
      foreign key (actor_profile_id)
      references public.profiles (id) on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'operational_support_tickets_reviewer_profile_fk'
      and conrelid = 'public.operational_support_tickets'::regclass
  ) then
    alter table public.operational_support_tickets
      add constraint operational_support_tickets_reviewer_profile_fk
      foreign key (reviewed_by_profile_id)
      references public.profiles (id) on delete set null;
  end if;
end $$;

create index if not exists support_access_requests_reviewer_profile_idx
  on public.support_access_requests (reviewed_by_profile_id)
  where reviewed_by_profile_id is not null;

create index if not exists support_access_events_actor_profile_idx
  on public.support_access_events (actor_profile_id, created_at desc)
  where actor_profile_id is not null;

create index if not exists operational_support_tickets_reviewer_profile_idx
  on public.operational_support_tickets (reviewed_by_profile_id, updated_at desc)
  where reviewed_by_profile_id is not null;

comment on table public.admin_operator_sessions is
  'Service-role-only registry for personal Supabase administrator sessions. Every active row is AAL2 and has an eight-hour maximum lifetime.';
comment on column public.admin_operator_sessions.auth_session_id is
  'Supabase Auth session_id claim. It is not a refresh token or cookie secret.';
comment on column public.admin_operator_sessions.ip_hash is
  'Lowercase hex HMAC-SHA-256 of a normalized IP; never store the raw IP here.';
comment on column public.admin_operator_sessions.user_agent_hash is
  'Lowercase hex HMAC-SHA-256 of a normalized user agent; never store the raw value here.';
comment on column public.admin_operator_sessions.device_hash is
  'Lowercase hex HMAC-SHA-256 of a server-derived device label; never store the raw label here.';

comment on table public.auth_recent_grants is
  'Service-role-only, one-time, session/action/resource-bound recent-auth grants. Only the token hash is stored.';
comment on column public.auth_recent_grants.token_hash is
  'Lowercase hex SHA-256 of the opaque grant token; the original token must never be persisted.';
comment on column public.auth_recent_grants.resource_hash is
  'Lowercase hex keyed hash of the protected resource identifier; never store a raw contract, share, account, or token identifier here.';
comment on function public.consume_auth_recent_grant(
  text,
  uuid,
  uuid,
  public.directsign_user_role,
  text,
  text
) is
  'Atomically consumes one unexpired recent-auth grant only when profile, current role, auth session, action, and resource hash all match.';

comment on table public.operational_auth_metric_buckets is
  'Production-only minute buckets for low-cardinality authentication health metrics. No raw identity, network, session, token, or resource identifiers are accepted.';
comment on function public.record_operational_auth_metric(
  public.directsign_auth_metric_operation,
  public.directsign_auth_metric_role,
  public.directsign_auth_metric_outcome,
  integer,
  public.directsign_auth_metric_data_origin
) is
  'Atomically records one production authentication metric using database time; non-production or unknown origins are ignored.';

comment on constraint operational_alert_events_kind_action_match
  on public.operational_alert_events is
  'Keeps authentication-health alert actions separate from verification and support workflow actions.';

comment on column public.support_access_requests.reviewed_by_profile_id is
  'Nullable personal operator attribution for new support-access reviews; legacy rows remain null.';
comment on column public.support_access_events.actor_profile_id is
  'Nullable personal operator attribution for new append-only support-access events; legacy rows remain null and referenced operator profiles must be retained.';
comment on column public.operational_support_tickets.reviewed_by_profile_id is
  'Nullable personal operator attribution for the latest ticket review; legacy rows remain null.';
