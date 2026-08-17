begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Supabase access JWTs remain cryptographically valid until their exp claim.
-- This state makes password/security revocation authoritative immediately,
-- including across application instances and after a refresh rotates the JWT.
create table if not exists public.account_security_epochs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sessions_valid_after timestamptz not null default '-infinity'::timestamptz,
  reset_in_progress boolean not null default false,
  active_reset_id uuid,
  active_recovery_session_id uuid,
  reset_started_at timestamptz,
  password_update_uncertain boolean not null default false,
  last_completed_reset_id uuid,
  last_completed_recovery_session_id uuid,
  reset_completed_at timestamptz,
  last_cancelled_reset_id uuid,
  reset_cancelled_at timestamptz,
  generation bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint account_security_epochs_generation_non_negative
    check (generation >= 0),
  constraint account_security_epochs_active_reset_shape check (
    (
      reset_in_progress
      and active_reset_id is not null
      and active_recovery_session_id is not null
      and reset_started_at is not null
    )
    or (
      not reset_in_progress
      and active_reset_id is null
      and active_recovery_session_id is null
      and reset_started_at is null
      and not password_update_uncertain
    )
  ),
  constraint account_security_epochs_completed_reset_shape check (
    (last_completed_reset_id is null and last_completed_recovery_session_id is null)
    or (last_completed_reset_id is not null and last_completed_recovery_session_id is not null)
  )
);

alter table public.account_security_epochs enable row level security;
alter table public.account_security_epochs force row level security;
revoke all on table public.account_security_epochs
  from public, anon, authenticated, service_role;

create or replace function public.verify_directsign_auth_session(
  p_user_id uuid,
  p_auth_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '15s'
as $$
declare
  v_epoch public.account_security_epochs%rowtype;
  v_session_created_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_user_id is null or p_auth_session_id is null then
    return pg_catalog.jsonb_build_object('active', false, 'reason', 'invalid');
  end if;

  -- Materialize one row per user so a verifier cannot miss a concurrent reset
  -- insert. The row share lock serializes this read with begin/finish/register.
  insert into public.account_security_epochs (user_id)
  select auth_user.id from auth.users as auth_user where auth_user.id = p_user_id
  on conflict (user_id) do nothing;

  select epoch.*
  into v_epoch
  from public.account_security_epochs as epoch
  where epoch.user_id = p_user_id
  for share;
  if not found then
    return pg_catalog.jsonb_build_object('active', false, 'reason', 'user_missing');
  end if;

  if v_epoch.reset_in_progress then
    return pg_catalog.jsonb_build_object(
      'active', false,
      'reason', 'reset_in_progress',
      'generation', v_epoch.generation
    );
  end if;

  select auth_session.created_at
  into v_session_created_at
  from auth.sessions as auth_session
  where auth_session.id = p_auth_session_id
    and auth_session.user_id = p_user_id
  for share;
  if not found then
    return pg_catalog.jsonb_build_object(
      'active', false,
      'reason', 'session_missing',
      'generation', v_epoch.generation
    );
  end if;

  if v_session_created_at <= v_epoch.sessions_valid_after then
    return pg_catalog.jsonb_build_object(
      'active', false,
      'reason', 'before_cutoff',
      'generation', v_epoch.generation
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'active', true,
    'reason', 'active',
    'generation', v_epoch.generation
  );
end;
$$;

create or replace function public.begin_directsign_password_reset(
  p_user_id uuid,
  p_reset_id uuid,
  p_recovery_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_epoch public.account_security_epochs%rowtype;
  v_recovery_created_at timestamptz;
  v_outcome text := 'started';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_user_id is null or p_reset_id is null or p_recovery_session_id is null then
    raise exception using errcode = '22023', message = 'invalid password reset barrier input';
  end if;

  insert into public.account_security_epochs (user_id)
  select auth_user.id from auth.users as auth_user where auth_user.id = p_user_id
  on conflict (user_id) do nothing;

  select epoch.*
  into v_epoch
  from public.account_security_epochs as epoch
  where epoch.user_id = p_user_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'user_missing');
  end if;

  if not v_epoch.reset_in_progress
    and v_epoch.last_completed_reset_id = p_reset_id
    and v_epoch.last_completed_recovery_session_id = p_recovery_session_id then
    return pg_catalog.jsonb_build_object(
      'outcome', 'completed',
      'generation', v_epoch.generation
    );
  end if;

  if v_epoch.reset_in_progress
    and v_epoch.active_reset_id = p_reset_id
    and v_epoch.active_recovery_session_id = p_recovery_session_id then
    return pg_catalog.jsonb_build_object(
      'outcome', 'resumed',
      'password_update_uncertain', v_epoch.password_update_uncertain,
      'generation', v_epoch.generation
    );
  end if;

  select auth_session.created_at
  into v_recovery_created_at
  from auth.sessions as auth_session
  where auth_session.id = p_recovery_session_id
    and auth_session.user_id = p_user_id
  for share;
  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'recovery_session_missing');
  end if;

  -- A newer mailbox-proven recovery session may safely take over a reset whose
  -- provider response was lost. An older/concurrent proof may never do so.
  if v_epoch.reset_in_progress then
    if v_recovery_created_at <= v_epoch.reset_started_at then
      return pg_catalog.jsonb_build_object('outcome', 'reset_conflict');
    end if;
    v_outcome := 'superseded';
  end if;

  update public.account_security_epochs as epoch
  set
    sessions_valid_after = greatest(epoch.sessions_valid_after, v_now),
    reset_in_progress = true,
    active_reset_id = p_reset_id,
    active_recovery_session_id = p_recovery_session_id,
    reset_started_at = v_now,
    password_update_uncertain = false,
    generation = epoch.generation + 1,
    updated_at = v_now
  where epoch.user_id = p_user_id
  returning * into v_epoch;

  update public.admin_operator_sessions as operator_session
  set
    revoked_at = greatest(v_now, operator_session.authenticated_at),
    revoke_reason = 'password_reset'
  where operator_session.operator_profile_id = p_user_id
    and operator_session.revoked_at is null;

  update public.auth_recent_grants as recent_grant
  set revoked_at = greatest(v_now, recent_grant.authenticated_at)
  where recent_grant.profile_id = p_user_id
    and recent_grant.revoked_at is null;

  return pg_catalog.jsonb_build_object(
    'outcome', v_outcome,
    'generation', v_epoch.generation
  );
end;
$$;

create or replace function public.mark_directsign_password_reset_uncertain(
  p_user_id uuid,
  p_reset_id uuid,
  p_recovery_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '15s'
as $$
declare
  v_epoch public.account_security_epochs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select epoch.*
  into v_epoch
  from public.account_security_epochs as epoch
  where epoch.user_id = p_user_id
  for update;
  if not found
    or not v_epoch.reset_in_progress
    or v_epoch.active_reset_id is distinct from p_reset_id
    or v_epoch.active_recovery_session_id is distinct from p_recovery_session_id then
    return pg_catalog.jsonb_build_object('outcome', 'reset_conflict');
  end if;

  update public.account_security_epochs as epoch
  set password_update_uncertain = true,
      updated_at = pg_catalog.clock_timestamp()
  where epoch.user_id = p_user_id
  returning * into v_epoch;

  return pg_catalog.jsonb_build_object(
    'outcome', 'retained',
    'generation', v_epoch.generation
  );
end;
$$;

create or replace function public.cancel_directsign_password_reset(
  p_user_id uuid,
  p_reset_id uuid,
  p_recovery_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_epoch public.account_security_epochs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select epoch.*
  into v_epoch
  from public.account_security_epochs as epoch
  where epoch.user_id = p_user_id
  for update;
  if not found
    or not v_epoch.reset_in_progress
    or v_epoch.active_reset_id is distinct from p_reset_id
    or v_epoch.active_recovery_session_id is distinct from p_recovery_session_id then
    return pg_catalog.jsonb_build_object('outcome', 'reset_conflict');
  end if;

  update public.account_security_epochs as epoch
  set
    sessions_valid_after = greatest(epoch.sessions_valid_after, v_now),
    reset_in_progress = false,
    active_reset_id = null,
    active_recovery_session_id = null,
    reset_started_at = null,
    password_update_uncertain = false,
    last_cancelled_reset_id = p_reset_id,
    reset_cancelled_at = v_now,
    generation = epoch.generation + 1,
    updated_at = v_now
  where epoch.user_id = p_user_id
  returning * into v_epoch;

  return pg_catalog.jsonb_build_object(
    'outcome', 'cancelled',
    'generation', v_epoch.generation
  );
end;
$$;

create or replace function public.finish_directsign_password_reset(
  p_user_id uuid,
  p_reset_id uuid,
  p_recovery_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_epoch public.account_security_epochs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select epoch.*
  into v_epoch
  from public.account_security_epochs as epoch
  where epoch.user_id = p_user_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'reset_conflict');
  end if;

  if not v_epoch.reset_in_progress
    and v_epoch.last_completed_reset_id = p_reset_id
    and v_epoch.last_completed_recovery_session_id = p_recovery_session_id then
    return pg_catalog.jsonb_build_object(
      'outcome', 'completed',
      'generation', v_epoch.generation
    );
  end if;

  if not v_epoch.reset_in_progress
    or v_epoch.active_reset_id is distinct from p_reset_id
    or v_epoch.active_recovery_session_id is distinct from p_recovery_session_id then
    return pg_catalog.jsonb_build_object('outcome', 'reset_conflict');
  end if;

  update public.account_security_epochs as epoch
  set
    sessions_valid_after = greatest(epoch.sessions_valid_after, v_now),
    reset_in_progress = false,
    active_reset_id = null,
    active_recovery_session_id = null,
    reset_started_at = null,
    password_update_uncertain = false,
    last_completed_reset_id = p_reset_id,
    last_completed_recovery_session_id = p_recovery_session_id,
    reset_completed_at = v_now,
    generation = epoch.generation + 1,
    updated_at = v_now
  where epoch.user_id = p_user_id
  returning * into v_epoch;

  update public.admin_operator_sessions as operator_session
  set
    revoked_at = greatest(v_now, operator_session.authenticated_at),
    revoke_reason = 'password_reset'
  where operator_session.operator_profile_id = p_user_id
    and operator_session.revoked_at is null;

  update public.auth_recent_grants as recent_grant
  set revoked_at = greatest(v_now, recent_grant.authenticated_at)
  where recent_grant.profile_id = p_user_id
    and recent_grant.revoked_at is null;

  return pg_catalog.jsonb_build_object(
    'outcome', 'finished',
    'generation', v_epoch.generation
  );
end;
$$;

create or replace function public.register_directsign_admin_operator_session(
  p_user_id uuid,
  p_profile_id uuid,
  p_auth_session_id uuid,
  p_authenticated_at timestamptz,
  p_absolute_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_epoch public.account_security_epochs%rowtype;
  v_session_created_at timestamptz;
  v_operator public.admin_operator_sessions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_user_id is null
    or p_profile_id is distinct from p_user_id
    or p_auth_session_id is null
    or p_authenticated_at is null
    or p_absolute_expires_at is null
    or p_absolute_expires_at <= p_authenticated_at
    or p_absolute_expires_at <= v_now
    or p_absolute_expires_at > p_authenticated_at + interval '8 hours' then
    raise exception using errcode = '22023', message = 'invalid admin operator session input';
  end if;

  insert into public.account_security_epochs (user_id)
  select auth_user.id from auth.users as auth_user where auth_user.id = p_user_id
  on conflict (user_id) do nothing;

  select epoch.*
  into v_epoch
  from public.account_security_epochs as epoch
  where epoch.user_id = p_user_id
  for update;
  if not found or v_epoch.reset_in_progress then
    return pg_catalog.jsonb_build_object('outcome', 'session_blocked');
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = p_profile_id and profile.role::text = 'admin'
  for share;
  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'profile_forbidden');
  end if;

  select auth_session.created_at
  into v_session_created_at
  from auth.sessions as auth_session
  where auth_session.id = p_auth_session_id
    and auth_session.user_id = p_user_id
  for share;
  if not found or v_session_created_at <= v_epoch.sessions_valid_after then
    return pg_catalog.jsonb_build_object('outcome', 'session_blocked');
  end if;

  insert into public.admin_operator_sessions (
    auth_session_id,
    operator_profile_id,
    aal,
    authenticated_at,
    last_seen_at,
    absolute_expires_at,
    revoked_at,
    revoke_reason
  ) values (
    p_auth_session_id,
    p_profile_id,
    'aal2',
    p_authenticated_at,
    greatest(v_now, p_authenticated_at),
    p_absolute_expires_at,
    null,
    null
  )
  on conflict (auth_session_id) do update set
    operator_profile_id = excluded.operator_profile_id,
    aal = 'aal2',
    authenticated_at = excluded.authenticated_at,
    last_seen_at = excluded.last_seen_at,
    absolute_expires_at = excluded.absolute_expires_at,
    revoked_at = null,
    revoke_reason = null
  returning * into v_operator;

  return pg_catalog.jsonb_build_object(
    'outcome', 'registered',
    'authenticated_at', v_operator.authenticated_at,
    'absolute_expires_at', v_operator.absolute_expires_at,
    'generation', v_epoch.generation
  );
end;
$$;

revoke all on function public.verify_directsign_auth_session(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.begin_directsign_password_reset(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.mark_directsign_password_reset_uncertain(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_directsign_password_reset(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finish_directsign_password_reset(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.register_directsign_admin_operator_session(
  uuid, uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.verify_directsign_auth_session(uuid, uuid)
  to service_role;
grant execute on function public.begin_directsign_password_reset(uuid, uuid, uuid)
  to service_role;
grant execute on function public.mark_directsign_password_reset_uncertain(uuid, uuid, uuid)
  to service_role;
grant execute on function public.cancel_directsign_password_reset(uuid, uuid, uuid)
  to service_role;
grant execute on function public.finish_directsign_password_reset(uuid, uuid, uuid)
  to service_role;
grant execute on function public.register_directsign_admin_operator_session(
  uuid, uuid, uuid, timestamptz, timestamptz
) to service_role;

comment on table public.account_security_epochs is
  'Private monotonic session cutoff and in-progress password-reset barrier. Only service-only RPCs may read or mutate it.';
comment on function public.verify_directsign_auth_session(uuid, uuid) is
  'Service-only authoritative auth.sessions existence and created_at cutoff check. Reset-in-progress fails closed.';
comment on function public.begin_directsign_password_reset(uuid, uuid, uuid) is
  'Begins or resumes a mailbox-proven password reset under a per-user locked monotonic session cutoff.';
comment on function public.finish_directsign_password_reset(uuid, uuid, uuid) is
  'Idempotently finalizes a password reset, advances the cutoff, and revokes recent/admin authorization grants.';
comment on function public.register_directsign_admin_operator_session(
  uuid, uuid, uuid, timestamptz, timestamptz
) is
  'Atomically registers an AAL2 operator session only when its auth.sessions row is newer than the user security cutoff.';

commit;
