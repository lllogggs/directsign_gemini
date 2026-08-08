-- Enforce the retention periods published in the customer privacy policy.
--
-- Customer-visible records are deleted only after their category deadline and
-- only when no active legal hold applies. Files are deliberately handled in
-- two phases: this migration queues an exact Storage object path, the server
-- deletes that object through the Storage API, and a later retention pass may
-- then delete the owning database row. Direct deletes from storage.objects are
-- prohibited because they can orphan the underlying object.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create table if not exists public.privacy_legal_holds (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_id text not null,
  reason_code text not null,
  reference_hash text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  released_at timestamptz,
  created_by_profile_id uuid,
  released_by_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_legal_holds_scope_type_allowed check (
    scope_type in (
      'profile',
      'organization',
      'contract',
      'verification_request',
      'support_ticket',
      'support_access_request',
      'retention_category'
    )
  ),
  constraint privacy_legal_holds_scope_id_not_blank check (
    btrim(scope_id) <> '' and length(scope_id) <= 200
  ),
  constraint privacy_legal_holds_reason_allowed check (
    reason_code in (
      'legal_obligation',
      'litigation',
      'investigation',
      'fraud_prevention',
      'claim',
      'audit'
    )
  ),
  constraint privacy_legal_holds_reference_hash_format check (
    reference_hash is null or reference_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint privacy_legal_holds_expiry_order check (
    expires_at is null or expires_at > starts_at
  ),
  constraint privacy_legal_holds_release_order check (
    released_at is null or released_at >= starts_at
  )
);
create index if not exists privacy_legal_holds_active_scope_idx
  on public.privacy_legal_holds (scope_type, scope_id, starts_at, expires_at)
  where released_at is null;
create table if not exists public.privacy_erasure_requests (
  id uuid primary key,
  auth_user_id uuid not null,
  account_role text not null,
  subject_hash text not null,
  status text not null default 'requested',
  organization_ids uuid[] not null default '{}'::uuid[],
  requested_at timestamptz not null,
  prepared_at timestamptz,
  finalized_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_erasure_requests_role_allowed check (
    account_role in ('advertiser', 'influencer')
  ),
  constraint privacy_erasure_requests_subject_hash_format check (
    subject_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint privacy_erasure_requests_status_allowed check (
    status in (
      'requested',
      'preparing',
      'held',
      'waiting_storage',
      'ready_to_finalize',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  constraint privacy_erasure_requests_attempt_nonnegative check (
    attempt_count >= 0
  ),
  constraint privacy_erasure_requests_error_code_safe check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint privacy_erasure_requests_finalize_order check (
    finalized_at is null or finalized_at >= requested_at
  )
);
create unique index if not exists privacy_erasure_requests_active_user_idx
  on public.privacy_erasure_requests (auth_user_id)
  where status not in ('completed', 'cancelled');
create index if not exists privacy_erasure_requests_status_retry_idx
  on public.privacy_erasure_requests (status, next_attempt_at, requested_at);
create table if not exists public.privacy_storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  erasure_request_id uuid
    references public.privacy_erasure_requests (id) on delete set null,
  source_type text not null,
  source_id text not null,
  category text not null,
  bucket text not null,
  object_path text not null,
  due_at timestamptz not null,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_storage_queue_source_type_allowed check (
    source_type in ('account', 'contract', 'legacy_contract', 'verification_request')
  ),
  constraint privacy_storage_queue_category_allowed check (
    category in ('account', 'contract', 'verification')
  ),
  constraint privacy_storage_queue_source_id_not_blank check (
    btrim(source_id) <> '' and length(source_id) <= 200
  ),
  constraint privacy_storage_queue_bucket_not_blank check (
    btrim(bucket) <> '' and length(bucket) <= 120
  ),
  constraint privacy_storage_queue_path_safe check (
    btrim(object_path) <> ''
    and length(object_path) <= 1024
    and object_path !~ '(^|/)\.\.(/|$)'
    and left(object_path, 1) <> '/'
  ),
  constraint privacy_storage_queue_status_allowed check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint privacy_storage_queue_lease_pair check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  ),
  constraint privacy_storage_queue_attempt_nonnegative check (
    attempt_count >= 0
  ),
  constraint privacy_storage_queue_error_code_safe check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint privacy_storage_queue_completion_state check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  unique (source_type, source_id, bucket, object_path)
);
create index if not exists privacy_storage_queue_claim_idx
  on public.privacy_storage_deletion_queue (available_at, due_at, created_at)
  where status in ('pending', 'failed');
create index if not exists privacy_storage_queue_source_idx
  on public.privacy_storage_deletion_queue (source_type, source_id, status);
create index if not exists privacy_storage_queue_erasure_idx
  on public.privacy_storage_deletion_queue (erasure_request_id, status)
  where erasure_request_id is not null;
create table if not exists public.privacy_retention_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique,
  run_kind text not null default 'scheduled',
  dry_run boolean not null default false,
  status text not null default 'running',
  counters jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint privacy_retention_runs_kind_allowed check (
    run_kind in ('scheduled', 'manual', 'account_erasure')
  ),
  constraint privacy_retention_runs_status_allowed check (
    status in ('running', 'completed', 'failed')
  ),
  constraint privacy_retention_runs_idempotency_safe check (
    idempotency_key is null
    or (
      btrim(idempotency_key) <> ''
      and length(idempotency_key) <= 160
      and idempotency_key ~ '^[A-Za-z0-9:_-]+$'
    )
  ),
  constraint privacy_retention_runs_counters_object check (
    jsonb_typeof(counters) = 'object'
  ),
  constraint privacy_retention_runs_error_code_safe check (
    error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  constraint privacy_retention_runs_completion_order check (
    completed_at is null or completed_at >= started_at
  )
);
create index if not exists privacy_retention_runs_created_idx
  on public.privacy_retention_runs (created_at desc);
alter table public.privacy_legal_holds enable row level security;
alter table public.privacy_erasure_requests enable row level security;
alter table public.privacy_storage_deletion_queue enable row level security;
alter table public.privacy_retention_runs enable row level security;
revoke all on table
  public.privacy_legal_holds,
  public.privacy_erasure_requests,
  public.privacy_storage_deletion_queue,
  public.privacy_retention_runs
from public, anon, authenticated;
grant select, insert, update, delete on table
  public.privacy_legal_holds,
  public.privacy_erasure_requests,
  public.privacy_storage_deletion_queue,
  public.privacy_retention_runs
to service_role;
create or replace function directsign_private.directsign_require_privacy_service_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
end;
$$;
create or replace function directsign_private.directsign_privacy_hold_active(
  p_scope_type text,
  p_scope_id text,
  p_category text,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.privacy_legal_holds as hold
    where hold.released_at is null
      and hold.starts_at <= p_now
      and (hold.expires_at is null or hold.expires_at > p_now)
      and (
        (hold.scope_type = p_scope_type and hold.scope_id = p_scope_id)
        or (
          hold.scope_type = 'retention_category'
          and hold.scope_id in (p_category, 'all')
        )
      )
  );
$$;
create or replace function directsign_private.directsign_storage_deletion_held(
  p_source_type text,
  p_source_id text,
  p_category text,
  p_now timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_advertiser_id text;
  v_profile_id uuid;
  v_organization_id uuid;
  v_target_id text;
begin
  -- Public avatar/brand/campaign imagery is erased even while separately
  -- retained evidence is held.
  if p_source_type = 'account' then
    return false;
  end if;

  if directsign_private.directsign_privacy_hold_active(
    'retention_category', p_category, p_category, p_now
  ) then
    return true;
  end if;

  if p_source_type = 'contract'
     and p_source_id ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return directsign_private.directsign_privacy_hold_active(
      'contract', p_source_id, 'contract', p_now
    ) or exists (
      select 1
      from public.contracts as contract
      where contract.id = p_source_id::uuid
        and (
          directsign_private.directsign_privacy_hold_active(
            'contract', contract.legacy_contract_id, 'contract', p_now
          )
          or directsign_private.directsign_privacy_hold_active(
            'organization', contract.owner_organization_id::text, 'contract', p_now
          )
          or directsign_private.directsign_privacy_hold_active(
            'profile', contract.created_by_profile_id::text, 'contract', p_now
          )
          or exists (
            select 1
            from public.contract_parties as party
            where party.contract_id = contract.id
              and directsign_private.directsign_privacy_hold_active(
                'profile', party.profile_id::text, 'contract', p_now
              )
          )
          or exists (
            select 1
            from public.contract_events as event
            where event.contract_id = contract.id
              and directsign_private.directsign_privacy_hold_active(
                'profile', event.actor_profile_id::text, 'contract', p_now
              )
          )
        )
    );
  end if;

  if p_source_type = 'legacy_contract' then
    select legacy.advertiser_id into v_advertiser_id
    from public.directsign_contracts as legacy
    where legacy.id = p_source_id;

    return directsign_private.directsign_privacy_hold_active(
      'contract', p_source_id, 'contract', p_now
    ) or directsign_private.directsign_privacy_hold_active(
      'profile', v_advertiser_id, 'contract', p_now
    );
  end if;

  if p_source_type = 'verification_request'
     and p_source_id ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select
      coalesce(
        request.profile_id,
        directsign_private.directsign_uuid_or_null(request.target_id)
      ),
      request.organization_id,
      request.target_id
    into v_profile_id, v_organization_id, v_target_id
    from public.verification_requests as request
    where request.id = p_source_id::uuid;

    return directsign_private.directsign_privacy_hold_active(
      'verification_request', p_source_id, 'verification', p_now
    ) or directsign_private.directsign_privacy_hold_active(
      'profile', v_profile_id::text, 'verification', p_now
    ) or directsign_private.directsign_privacy_hold_active(
      'organization', v_organization_id::text, 'verification', p_now
    ) or directsign_private.directsign_privacy_hold_active(
      'profile', v_target_id, 'verification', p_now
    ) or directsign_private.directsign_privacy_hold_active(
      'organization', v_target_id, 'verification', p_now
    );
  end if;

  return false;
end;
$$;
-- Operator-only recovery for an exhausted or corrected Storage deletion. The
-- same queue identity is reused, so a retry cannot create duplicate work.
create or replace function public.requeue_privacy_storage_deletion(
  p_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_queue public.privacy_storage_deletion_queue%rowtype;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  update public.privacy_storage_deletion_queue as queue
  set
    status = 'pending',
    available_at = v_now,
    lease_owner = null,
    lease_expires_at = null,
    attempt_count = 0,
    last_error_code = null,
    completed_at = null,
    updated_at = v_now
  where queue.id = p_id
    and queue.status = 'failed'
  returning * into v_queue;

  if not found then
    return jsonb_build_object('found', false, 'id', p_id);
  end if;

  if v_queue.erasure_request_id is not null then
    update public.privacy_erasure_requests
    set
      status = 'waiting_storage',
      last_error_code = null,
      next_attempt_at = v_now,
      updated_at = v_now
    where id = v_queue.erasure_request_id
      and status not in ('completed', 'cancelled');
  end if;

  return jsonb_build_object(
    'found', true,
    'id', v_queue.id,
    'status', v_queue.status,
    'attempt_count', v_queue.attempt_count
  );
end;
$$;
-- Re-declare the claim RPC after the hold helpers exist. Holds are rechecked at
-- claim time, not only when the retention row was first queued.
create or replace function public.claim_privacy_storage_deletions(
  p_worker_id text,
  p_limit integer,
  p_request_id uuid default null,
  p_now timestamptz default clock_timestamp(),
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  bucket text,
  object_path text,
  source_type text,
  source_id text,
  request_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 120), 15), 900);
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if btrim(coalesce(p_worker_id, '')) = ''
     or length(p_worker_id) > 160
     or p_worker_id !~ '^[A-Za-z0-9:._-]+$' then
    raise exception using errcode = '22023', message = 'safe storage worker id required';
  end if;

  update public.privacy_storage_deletion_queue as expired_lease
  set
    status = 'failed',
    available_at = v_now,
    lease_owner = null,
    lease_expires_at = null,
    last_error_code = 'lease_expired',
    updated_at = v_now
  where expired_lease.status = 'processing'
    and expired_lease.lease_expires_at <= v_now;

  return query
  with eligible as materialized (
    select
      queue.id,
      queue.category,
      queue.due_at,
      queue.created_at,
      row_number() over (
        partition by queue.category
        order by queue.due_at, queue.created_at, queue.id
      ) as category_rank
    from public.privacy_storage_deletion_queue as queue
    where queue.status in ('pending', 'failed')
      and queue.due_at <= v_now
      and queue.available_at <= v_now
      and queue.attempt_count < 10
      and (p_request_id is null or queue.erasure_request_id = p_request_id)
      and not directsign_private.directsign_storage_deletion_held(
        queue.source_type, queue.source_id, queue.category, v_now
      )
  ), candidates as (
    select queue.id
    from public.privacy_storage_deletion_queue as queue
    join eligible on eligible.id = queue.id
    order by
      eligible.category_rank,
      eligible.category,
      eligible.due_at,
      eligible.created_at,
      eligible.id
    limit v_limit
    for update of queue skip locked
  ), claimed as (
    update public.privacy_storage_deletion_queue as queue
    set
      status = 'processing',
      lease_owner = p_worker_id,
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      attempt_count = queue.attempt_count + 1,
      last_error_code = null,
      updated_at = v_now
    from candidates
    where queue.id = candidates.id
    returning queue.*
  )
  select
    claimed.id,
    claimed.bucket,
    claimed.object_path,
    claimed.source_type,
    claimed.source_id,
    claimed.erasure_request_id,
    claimed.attempt_count
  from claimed
  order by claimed.due_at, claimed.created_at, claimed.id;
end;
$$;
revoke all on function
  directsign_private.directsign_require_privacy_service_role(),
  directsign_private.directsign_privacy_hold_active(text, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function
  directsign_private.directsign_require_privacy_service_role(),
  directsign_private.directsign_privacy_hold_active(text, text, text, timestamptz)
to service_role;
-- Account removal must be able to preserve the immutable operator UUID while
-- the support-access event itself remains within its three-year period. This
-- mirrors the historical-actor design already used by contract_events and
-- notification_events.
alter table public.support_access_events
  drop constraint if exists support_access_events_actor_profile_fk;
alter table public.support_access_requests
  drop constraint if exists support_access_requests_requester_profile_id_fkey;
-- Contract retention and support-access retention have different clocks. Keep
-- the contract UUID as an immutable historical snapshot instead of allowing a
-- five-year contract purge to cascade-delete a newer three-year access record.
alter table public.support_access_requests
  drop constraint if exists support_access_requests_contract_uuid_fkey;
-- These UUIDs are pseudonymous evidence links, not login access. Preserve the
-- links after Auth/profile erasure so a profile-scoped legal hold can still
-- protect the correct retained contract or verification chain.
alter table public.contracts
  drop constraint if exists contracts_created_by_profile_id_fkey;
alter table public.contract_parties
  drop constraint if exists contract_parties_profile_id_fkey;
alter table public.verification_requests
  drop constraint if exists verification_requests_profile_id_fkey;
-- Append-only evidence remains immutable during normal operation. The only
-- exception is a whole-chain retention purge running in a service-role RPC and
-- marked by a transaction-local context flag.
create or replace function public.directsign_prevent_contract_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('directsign.privacy_retention_purge', true) = 'on'
     and coalesce(auth.role(), '') = 'service_role' then
    return old;
  end if;

  raise exception 'contract_events is append-only';
end;
$$;
create or replace function public.directsign_prevent_support_access_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('directsign.privacy_retention_purge', true) = 'on'
     and coalesce(auth.role(), '') = 'service_role' then
    return old;
  end if;

  raise exception 'support_access_events is append-only';
end;
$$;
create or replace function public.create_privacy_legal_hold(
  p_hold_id uuid,
  p_scope_type text,
  p_scope_id text,
  p_reason_code text,
  p_reference_hash text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_created_by_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.privacy_legal_holds%rowtype;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if p_hold_id is null then
    raise exception using errcode = '22023', message = 'hold id required';
  end if;

  insert into public.privacy_legal_holds (
    id,
    scope_type,
    scope_id,
    reason_code,
    reference_hash,
    starts_at,
    expires_at,
    created_by_profile_id
  ) values (
    p_hold_id,
    p_scope_type,
    p_scope_id,
    p_reason_code,
    p_reference_hash,
    coalesce(p_starts_at, clock_timestamp()),
    p_expires_at,
    p_created_by_profile_id
  )
  on conflict (id) do nothing;

  select * into v_hold
  from public.privacy_legal_holds
  where id = p_hold_id;

  if v_hold.scope_type is distinct from p_scope_type
     or v_hold.scope_id is distinct from p_scope_id
     or v_hold.reason_code is distinct from p_reason_code
     or v_hold.reference_hash is distinct from p_reference_hash then
    raise exception using errcode = '23505', message = 'hold id already has different scope';
  end if;

  return jsonb_build_object(
    'id', v_hold.id,
    'scope_type', v_hold.scope_type,
    'scope_id', v_hold.scope_id,
    'reason_code', v_hold.reason_code,
    'starts_at', v_hold.starts_at,
    'expires_at', v_hold.expires_at,
    'released_at', v_hold.released_at
  );
end;
$$;
create or replace function public.release_privacy_legal_hold(
  p_hold_id uuid,
  p_released_by_profile_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.privacy_legal_holds%rowtype;
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  perform directsign_private.directsign_require_privacy_service_role();

  update public.privacy_legal_holds
  set
    released_at = coalesce(released_at, v_now),
    released_by_profile_id = coalesce(released_by_profile_id, p_released_by_profile_id),
    updated_at = v_now
  where id = p_hold_id
  returning * into v_hold;

  if not found then
    return jsonb_build_object('found', false, 'id', p_hold_id);
  end if;

  return jsonb_build_object(
    'found', true,
    'id', v_hold.id,
    'released_at', v_hold.released_at
  );
end;
$$;
create or replace function public.request_account_erasure(
  p_request_id uuid,
  p_profile_id uuid,
  p_role text,
  p_subject_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_profile_role text;
  v_account_role text;
  v_existing public.privacy_erasure_requests%rowtype;
  v_request public.privacy_erasure_requests%rowtype;
  v_organization_ids uuid[] := '{}'::uuid[];
  v_pending_storage integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if p_request_id is null or p_profile_id is null then
    raise exception using errcode = '22023', message = 'request and profile ids required';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'valid subject hash required';
  end if;

  v_account_role := case p_role
    when 'advertiser' then 'advertiser'
    when 'marketer' then 'advertiser'
    when 'influencer' then 'influencer'
    else null
  end;
  if v_account_role is null then
    raise exception using errcode = '22023', message = 'customer account role required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_profile_id::text, 827436)
  );

  select request_row.* into v_existing
  from public.privacy_erasure_requests as request_row
  where request_row.id = p_request_id
     or (
       request_row.auth_user_id = p_profile_id
       and request_row.status not in ('completed', 'cancelled')
     )
  order by (request_row.id = p_request_id) desc, request_row.requested_at desc
  limit 1
  for update;

  if found then
    if v_existing.auth_user_id <> p_profile_id
       or v_existing.account_role <> v_account_role
       or v_existing.subject_hash <> p_subject_hash then
      raise exception using errcode = '23505', message = 'erasure request identity mismatch';
    end if;
    if v_existing.status in (
      'waiting_storage', 'ready_to_finalize', 'completed', 'cancelled'
    ) then
      select count(*)::integer into v_pending_storage
      from public.privacy_storage_deletion_queue as queue
      where queue.erasure_request_id = v_existing.id
        and queue.status <> 'completed';
      return jsonb_build_object(
        'request_id', v_existing.id,
        'status', v_existing.status,
        'pending_storage', v_pending_storage,
        'requires_auth_user_deletion', v_existing.status = 'ready_to_finalize'
      );
    end if;
  end if;

  select profile.role::text into v_profile_role
  from public.profiles as profile
  where profile.id = p_profile_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'customer profile not found';
  end if;
  if (v_account_role = 'advertiser' and v_profile_role <> 'marketer')
     or (v_account_role = 'influencer' and v_profile_role <> 'influencer') then
    raise exception using errcode = '42501', message = 'account role mismatch';
  end if;
  if exists (
    select 1
    from public.internal_service_accounts as internal_account
    where internal_account.profile_id = p_profile_id
  ) then
    raise exception using errcode = '42501', message = 'internal service account erasure denied';
  end if;

  select coalesce(array_agg(member.organization_id order by member.organization_id), '{}'::uuid[])
  into v_organization_ids
  from public.organization_members as member
  where member.profile_id = p_profile_id
    and not exists (
      select 1
      from public.organization_members as other_member
      where other_member.organization_id = member.organization_id
        and other_member.profile_id <> p_profile_id
    );

  if v_existing.id is null then
    insert into public.privacy_erasure_requests (
      id,
      auth_user_id,
      account_role,
      subject_hash,
      status,
      organization_ids,
      requested_at,
      last_attempt_at,
      attempt_count,
      created_at,
      updated_at
    ) values (
      p_request_id,
      p_profile_id,
      v_account_role,
      p_subject_hash,
      'requested',
      v_organization_ids,
      v_now,
      v_now,
      1,
      v_now,
      v_now
    )
    returning * into v_request;
  else
    update public.privacy_erasure_requests
    set
      organization_ids = v_organization_ids,
      status = 'requested',
      last_attempt_at = v_now,
      next_attempt_at = null,
      attempt_count = attempt_count + 1,
      last_error_code = null,
      updated_at = v_now
    where id = v_existing.id
    returning * into v_request;
  end if;

  update public.privacy_erasure_requests
  set status = 'preparing', updated_at = v_now
  where id = v_request.id;

  -- Queue all service-owned influencer avatars by their canonical Storage
  -- prefix. External avatar URLs are merely unlinked below.
  insert into public.privacy_storage_deletion_queue (
    erasure_request_id,
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    available_at,
    created_at,
    updated_at
  )
  select
    v_request.id,
    'account',
    p_profile_id::text,
    'account',
    object_row.bucket_id,
    object_row.name,
    v_now,
    v_now,
    v_now,
    v_now
  from storage.objects as object_row
  where object_row.bucket_id = 'yeollock-marketplace-public'
    and object_row.name like 'influencer-avatars/' || p_profile_id::text || '/%'
  on conflict (source_type, source_id, bucket, object_path) do update
  set
    erasure_request_id = excluded.erasure_request_id,
    due_at = least(public.privacy_storage_deletion_queue.due_at, excluded.due_at),
    available_at = least(public.privacy_storage_deletion_queue.available_at, excluded.available_at),
    updated_at = excluded.updated_at;

  -- Sole-member advertiser organizations lose their public brand imagery and
  -- publication state. The organization id is retained only in this bounded
  -- erasure job so finalize can remove an otherwise unreferenced organization.
  insert into public.privacy_storage_deletion_queue (
    erasure_request_id,
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    available_at,
    created_at,
    updated_at
  )
  select
    v_request.id,
    'account',
    p_profile_id::text,
    'account',
    object_row.bucket_id,
    object_row.name,
    v_now,
    v_now,
    v_now,
    v_now
  from public.marketplace_brand_profiles as brand
  join storage.objects as object_row
    on object_row.bucket_id = 'yeollock-marketplace-public'
    and object_row.name like 'brand-logos/' || brand.id::text || '/%'
  where brand.organization_id = any(v_organization_ids)
  on conflict (source_type, source_id, bucket, object_path) do update
  set
    erasure_request_id = excluded.erasure_request_id,
    due_at = least(public.privacy_storage_deletion_queue.due_at, excluded.due_at),
    available_at = least(public.privacy_storage_deletion_queue.available_at, excluded.available_at),
    updated_at = excluded.updated_at;

  insert into public.privacy_storage_deletion_queue (
    erasure_request_id,
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    available_at,
    created_at,
    updated_at
  )
  select
    v_request.id,
    'account',
    p_profile_id::text,
    'account',
    object_row.bucket_id,
    object_row.name,
    v_now,
    v_now,
    v_now,
    v_now
  from public.marketplace_campaigns as campaign
  join storage.objects as object_row
    on object_row.bucket_id = 'yeollock-marketplace-public'
    and left(
      object_row.name,
      length('campaign-thumbnails/' || campaign.id || '/')
    ) = 'campaign-thumbnails/' || campaign.id || '/'
  where campaign.organization_id = any(v_organization_ids)
  on conflict (source_type, source_id, bucket, object_path) do update
  set
    erasure_request_id = excluded.erasure_request_id,
    due_at = least(public.privacy_storage_deletion_queue.due_at, excluded.due_at),
    available_at = least(public.privacy_storage_deletion_queue.available_at, excluded.available_at),
    updated_at = excluded.updated_at;

  delete from public.marketplace_contact_proposals as proposal
  where proposal.converted_contract_id is null
    and (
      proposal.sender_profile_id = p_profile_id
      or proposal.target_influencer_profile_id in (
        select influencer_profile.id
        from public.marketplace_influencer_profiles as influencer_profile
        where influencer_profile.owner_profile_id = p_profile_id
      )
    );

  delete from public.marketplace_public_influencer_directory as directory
  where directory.source_type = 'registered'
    and directory.source_id in (
      select influencer_profile.id
      from public.marketplace_influencer_profiles as influencer_profile
      where influencer_profile.owner_profile_id = p_profile_id
    );

  delete from public.marketplace_registered_influencer_directory
  where owner_profile_id = p_profile_id;

  delete from public.marketplace_influencer_profiles
  where owner_profile_id = p_profile_id;

  update public.marketplace_brand_profiles
  set
    is_published = false,
    archived_at = coalesce(archived_at, v_now),
    logo_url = null,
    active_campaigns = '[]'::jsonb,
    updated_at = v_now
  where organization_id = any(v_organization_ids);

  update public.marketplace_campaigns
  set
    -- Published recruitment is closed. A never-published draft remains draft
    -- because its immutable lifetime sequence is intentionally absent.
    status = case when status = 'open' then 'closed' else status end,
    campaign_data = campaign_data - 'thumbnailUrl' - 'thumbnail_url',
    archived_at = coalesce(archived_at, v_now),
    updated_at = v_now
  where organization_id = any(v_organization_ids)
    and archived_at is null;

  update public.share_links as link
  set status = 'revoked', revoked_at = coalesce(link.revoked_at, v_now)
  where link.status = 'active'
    and (
      link.created_by_profile_id = p_profile_id
      or exists (
        select 1
        from public.contracts as contract
        where contract.id = link.contract_id
          and (
            contract.created_by_profile_id = p_profile_id
            or contract.owner_organization_id = any(v_organization_ids)
            or exists (
              select 1
              from public.contract_parties as party
              where party.contract_id = contract.id
                and party.profile_id = p_profile_id
            )
          )
      )
    );

  update public.directsign_contracts as legacy
  set
    share_token = null,
    share_token_status = 'revoked',
    contract = jsonb_set(
      legacy.contract #- '{evidence,share_token}',
      '{evidence,share_token_status}',
      '"revoked"'::jsonb,
      true
    ),
    updated_at = v_now
  where (legacy.share_token is not null or legacy.share_token_status = 'active')
    and (
      legacy.advertiser_id = p_profile_id::text
      or exists (
        select 1
        from public.contracts as contract
        where (
            contract.id::text = legacy.id
            or contract.legacy_contract_id = legacy.id
          )
          and (
            contract.created_by_profile_id = p_profile_id
            or contract.owner_organization_id = any(v_organization_ids)
            or exists (
              select 1
              from public.contract_parties as party
              where party.contract_id = contract.id
                and party.profile_id = p_profile_id
            )
          )
      )
    );

  update public.profiles
  set
    name = '탈퇴한 회원',
    email = 'deleted+' || substring(p_subject_hash from 1 for 32)
      || '@privacy.invalid',
    company_name = null,
    phone = null,
    avatar_url = null,
    verification_status = 'not_submitted',
    email_verified_at = null,
    phone_verified_at = null,
    activity_categories = '{}'::text[],
    activity_platforms = '{}'::text[],
    activity_page_url = null,
    activity_page_platform = null,
    activity_page_handle = null,
    public_profile_consent_at = null,
    public_profile_consent_version = null,
    public_profile_consent_source = null,
    public_profile_setup_state = 'setup_required',
    terms_accepted_at = null,
    privacy_policy_accepted_at = null,
    terms_version = null,
    privacy_policy_version = null,
    signup_consent_snapshot = '{}'::jsonb,
    data_origin = null,
    updated_at = v_now
  where id = p_profile_id;

  -- Profile/marketplace synchronization triggers run while the Auth profile
  -- still exists. Remove any directory row they may have re-materialized from
  -- the tombstone before returning from prepare. An unpublished internal
  -- marketplace identity may remain until the Auth cascade, but it has no
  -- directory/public reachability and contains only tombstoned profile data.
  delete from public.marketplace_public_influencer_directory as directory
  where directory.source_type = 'registered'
    and directory.source_id in (
      select registered.public_marketplace_profile_id
      from public.marketplace_registered_influencer_directory as registered
      where registered.owner_profile_id = p_profile_id
    );

  delete from public.marketplace_registered_influencer_directory
  where owner_profile_id = p_profile_id;

  delete from public.google_calendar_events where profile_id = p_profile_id;
  delete from public.google_workspace_connections where profile_id = p_profile_id;
  delete from public.advertiser_saved_influencers where created_by_profile_id = p_profile_id;
  delete from public.notification_recipients where recipient_profile_id = p_profile_id;
  delete from public.auth_recent_grants where profile_id = p_profile_id;
  delete from public.admin_operator_sessions where operator_profile_id = p_profile_id;
  delete from public.organization_members where profile_id = p_profile_id;

  select count(*)::integer into v_pending_storage
  from public.privacy_storage_deletion_queue as queue
  where queue.erasure_request_id = v_request.id
    and queue.status <> 'completed';

  update public.privacy_erasure_requests
  set
    status = case when v_pending_storage = 0
      then 'ready_to_finalize'
      else 'waiting_storage'
    end,
    prepared_at = coalesce(prepared_at, v_now),
    updated_at = v_now
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'pending_storage', v_pending_storage,
    'requires_auth_user_deletion', v_request.status = 'ready_to_finalize'
  );
end;
$$;
create or replace function public.get_privacy_erasure_status(
  p_request_id uuid default null,
  p_auth_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request public.privacy_erasure_requests%rowtype;
  v_pending integer := 0;
  v_failed integer := 0;
  v_completed integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if p_request_id is null and p_auth_user_id is null then
    raise exception using errcode = '22023', message = 'request or auth user id required';
  end if;

  select request_row.* into v_request
  from public.privacy_erasure_requests as request_row
  where (p_request_id is null or request_row.id = p_request_id)
    and (p_auth_user_id is null or request_row.auth_user_id = p_auth_user_id)
  order by request_row.requested_at desc
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select
    count(*) filter (where queue.status in ('pending', 'processing'))::integer,
    count(*) filter (where queue.status = 'failed')::integer,
    count(*) filter (where queue.status = 'completed')::integer
  into v_pending, v_failed, v_completed
  from public.privacy_storage_deletion_queue as queue
  where queue.erasure_request_id = v_request.id;

  return jsonb_build_object(
    'found', true,
    'request_id', v_request.id,
    'auth_user_id', v_request.auth_user_id,
    'role', v_request.account_role,
    'status', v_request.status,
    'requested_at', v_request.requested_at,
    'prepared_at', v_request.prepared_at,
    'finalized_at', v_request.finalized_at,
    'pending_storage', v_pending,
    'failed_storage', v_failed,
    'completed_storage', v_completed,
    'attempt_count', v_request.attempt_count,
    'last_error_code', v_request.last_error_code,
    'requires_auth_user_deletion', v_request.status = 'ready_to_finalize'
  );
end;
$$;
create or replace function public.complete_privacy_storage_deletion(
  p_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_error_code text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_error_code text;
  v_queue public.privacy_storage_deletion_queue%rowtype;
  v_pending integer := 0;
  v_permanent_failures integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if p_id is null or btrim(coalesce(p_worker_id, '')) = '' then
    raise exception using errcode = '22023', message = 'queue id and worker id required';
  end if;

  v_error_code := case
    when coalesce(p_succeeded, false) then null
    when p_error_code ~ '^[a-z][a-z0-9_]{0,63}$' then p_error_code
    else 'storage_delete_failed'
  end;

  update public.privacy_storage_deletion_queue as queue
  set
    status = case when coalesce(p_succeeded, false) then 'completed' else 'failed' end,
    available_at = case
      when coalesce(p_succeeded, false) then queue.available_at
      else v_now + make_interval(
        secs => least(3600, (30 * power(2, least(queue.attempt_count, 6)))::integer)
      )
    end,
    lease_owner = null,
    lease_expires_at = null,
    last_error_code = v_error_code,
    completed_at = case when coalesce(p_succeeded, false) then v_now else null end,
    updated_at = v_now
  where queue.id = p_id
    and queue.status = 'processing'
    and queue.lease_owner = p_worker_id
    and queue.lease_expires_at > v_now
  returning * into v_queue;

  if not found then
    return jsonb_build_object('found', false, 'id', p_id);
  end if;

  if v_queue.erasure_request_id is not null then
    select
      count(*) filter (where queue.status <> 'completed')::integer,
      count(*) filter (
        where queue.status = 'failed' and queue.attempt_count >= 10
      )::integer
    into v_pending, v_permanent_failures
    from public.privacy_storage_deletion_queue as queue
    where queue.erasure_request_id = v_queue.erasure_request_id;

    update public.privacy_erasure_requests
    set
      status = case
        when v_permanent_failures > 0 then 'failed'
        when v_pending = 0 then 'ready_to_finalize'
        else 'waiting_storage'
      end,
      last_error_code = case
        when v_permanent_failures > 0 then 'storage_retry_exhausted'
        else null
      end,
      next_attempt_at = case
        when v_permanent_failures > 0 then null
        else next_attempt_at
      end,
      updated_at = v_now
    where id = v_queue.erasure_request_id
      and status not in ('completed', 'cancelled', 'held');
  end if;

  return jsonb_build_object(
    'found', true,
    'id', v_queue.id,
    'status', v_queue.status,
    'attempt_count', v_queue.attempt_count,
    'pending_for_request', v_pending,
    'request_ready_to_finalize',
      v_queue.erasure_request_id is not null and v_pending = 0
  );
end;
$$;
create or replace function public.mark_account_erasure_failed(
  p_request_id uuid,
  p_error_code text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_error_code text;
  v_request public.privacy_erasure_requests%rowtype;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  v_error_code := case
    when p_error_code ~ '^[a-z][a-z0-9_]{0,63}$' then p_error_code
    else 'account_erasure_failed'
  end;

  update public.privacy_erasure_requests
  set
    -- This RPC records a retryable Auth Admin API failure. Storage exhaustion
    -- is the only automated path that moves a request to manual `failed`.
    status = 'ready_to_finalize',
    last_error_code = v_error_code,
    last_attempt_at = v_now,
    next_attempt_at = v_now + interval '5 minutes',
    attempt_count = attempt_count + 1,
    updated_at = v_now
  where id = p_request_id
    and status not in ('completed', 'cancelled')
  returning * into v_request;

  if not found then
    return jsonb_build_object('found', false, 'request_id', p_request_id);
  end if;

  return jsonb_build_object(
    'found', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'last_error_code', v_request.last_error_code,
    'next_attempt_at', v_request.next_attempt_at
  );
end;
$$;
create or replace function public.finalize_account_erasure(
  p_request_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_request public.privacy_erasure_requests%rowtype;
  v_pending integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  select request_row.* into v_request
  from public.privacy_erasure_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('found', false, 'request_id', p_request_id);
  end if;
  if v_request.status = 'completed' then
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'completed',
      'finalized_at', v_request.finalized_at
    );
  end if;
  if v_request.status = 'cancelled' then
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'cancelled',
      'requires_auth_user_deletion', false
    );
  end if;
  select count(*)::integer into v_pending
  from public.privacy_storage_deletion_queue as queue
  where queue.erasure_request_id = v_request.id
    and queue.status <> 'completed';

  if v_pending > 0 then
    update public.privacy_erasure_requests
    set status = 'waiting_storage', updated_at = v_now
    where id = v_request.id;
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'waiting_storage',
      'pending_storage', v_pending
    );
  end if;

  -- The application must first delete the Supabase Auth user through the Auth
  -- Admin API. That operation revokes Auth sessions and normally cascades the
  -- public profile. Keeping this check makes an Auth API failure retryable and
  -- prevents an orphan login from being reported as erased.
  if exists (
    select 1 from auth.users as auth_user
    where auth_user.id = v_request.auth_user_id
  ) then
    update public.privacy_erasure_requests
    set status = 'ready_to_finalize', updated_at = v_now
    where id = v_request.id;
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'ready_to_finalize',
      'pending_storage', 0,
      'requires_auth_user_deletion', true
    );
  end if;

  delete from public.profiles where id = v_request.auth_user_id;

  -- Storage cleanup has completed. Remove sole-member marketplace rows now,
  -- except for an organization under hold. Converted applications/contracts
  -- remain in their separate five-year evidence chains.
  --
  -- The contact snapshot column is installed by the immediately following
  -- campaign-contact migration. Dynamic SQL keeps this migration independently
  -- deployable while ensuring that, once present, all applicant phone/email
  -- snapshots are redacted before their campaign/brand parent is removed.
  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid =
      'public.marketplace_contact_proposals'::regclass
      and attribute.attname = 'application_contact_snapshot'
      and not attribute.attisdropped
  ) then
    perform pg_catalog.set_config(
      'request.jwt.claim.role', 'service_role', true
    );
    execute $redact$
      update public.marketplace_contact_proposals as proposal
      set application_contact_snapshot = null
      where proposal.application_contact_snapshot is not null
        and (
          (
            proposal.sender_organization_id = any($1)
            and not directsign_private.directsign_privacy_hold_active(
              'organization', proposal.sender_organization_id::text,
              'account', $2
            )
          )
          or exists (
            select 1
            from public.marketplace_brand_profiles as brand
            where brand.id = proposal.target_brand_profile_id
              and brand.organization_id = any($1)
              and not directsign_private.directsign_privacy_hold_active(
                'organization', brand.organization_id::text, 'account', $2
              )
          )
          or exists (
            select 1
            from public.marketplace_campaigns as campaign
            where campaign.id = proposal.campaign_id
              and campaign.organization_id = any($1)
              and not directsign_private.directsign_privacy_hold_active(
                'organization', campaign.organization_id::text, 'account', $2
              )
          )
        )
    $redact$ using v_request.organization_ids, v_now;
  end if;

  delete from public.marketplace_contact_proposals as proposal
  where proposal.converted_contract_id is null
    and (
      (
        proposal.sender_organization_id = any(v_request.organization_ids)
        and not directsign_private.directsign_privacy_hold_active(
          'organization', proposal.sender_organization_id::text, 'account', v_now
        )
      )
      or exists (
        select 1
        from public.marketplace_brand_profiles as brand
        where brand.id = proposal.target_brand_profile_id
          and brand.organization_id = any(v_request.organization_ids)
          and not directsign_private.directsign_privacy_hold_active(
            'organization', brand.organization_id::text, 'account', v_now
          )
      )
      or exists (
        select 1
        from public.marketplace_campaigns as campaign
        where campaign.id = proposal.campaign_id
          and campaign.organization_id = any(v_request.organization_ids)
          and not directsign_private.directsign_privacy_hold_active(
            'organization', campaign.organization_id::text, 'account', v_now
          )
      )
    );

  delete from public.notification_campaign_status_recipients as recipient
  where recipient.source_key in (
    select source.source_key
    from public.notification_campaign_status_sources as source
    join public.marketplace_campaigns as campaign
      on campaign.id = source.campaign_id
    where campaign.organization_id = any(v_request.organization_ids)
      and not directsign_private.directsign_privacy_hold_active(
        'organization', campaign.organization_id::text, 'account', v_now
      )
  );

  delete from public.notification_campaign_status_sources as source
  where exists (
    select 1
    from public.marketplace_campaigns as campaign
    where campaign.id = source.campaign_id
      and campaign.organization_id = any(v_request.organization_ids)
      and not directsign_private.directsign_privacy_hold_active(
        'organization', campaign.organization_id::text, 'account', v_now
      )
  );

  delete from public.notification_events as notification
  where notification.source_type = 'campaign'
    and exists (
      select 1
      from public.marketplace_campaigns as campaign
      where campaign.id = notification.source_id
        and campaign.organization_id = any(v_request.organization_ids)
        and not directsign_private.directsign_privacy_hold_active(
          'organization', campaign.organization_id::text, 'account', v_now
        )
    );

  delete from public.marketplace_campaigns as campaign
  where campaign.organization_id = any(v_request.organization_ids)
    and not directsign_private.directsign_privacy_hold_active(
      'organization', campaign.organization_id::text, 'account', v_now
    );

  delete from public.marketplace_brand_profiles as brand
  where brand.organization_id = any(v_request.organization_ids)
    and not directsign_private.directsign_privacy_hold_active(
      'organization', brand.organization_id::text, 'account', v_now
    );

  delete from public.organizations as organization
  where organization.id = any(v_request.organization_ids)
    and not directsign_private.directsign_privacy_hold_active(
      'organization', organization.id::text, 'account', v_now
    )
    and not exists (
      select 1 from public.organization_members as member
      where member.organization_id = organization.id
    )
    and not exists (
      select 1 from public.contracts as contract
      where contract.owner_organization_id = organization.id
    )
    and not exists (
      select 1 from public.marketplace_campaigns as campaign
      where campaign.organization_id = organization.id
    );

  update public.privacy_erasure_requests
  set
    status = 'completed',
    finalized_at = v_now,
    last_attempt_at = v_now,
    next_attempt_at = null,
    last_error_code = null,
    updated_at = v_now
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'found', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'finalized_at', v_request.finalized_at,
    'requires_auth_user_deletion', false
  );
end;
$$;
-- Storage references are normalized into exact bucket/object pairs. A bad or
-- legacy-unrecognized reference is intentionally not queued and therefore
-- keeps the database owner row from being deleted; losing the last pointer to
-- a file is less safe than requiring an operator repair.
create or replace function directsign_private.directsign_queue_contract_storage(
  p_contract_id uuid,
  p_due_at timestamptz,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queued integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  with storage_references as (
    select
      file.bucket,
      file.storage_path as object_path,
      case when file.bucket = 'local'
        then 'local_file'
        else 'supabase_storage'
      end as provider
    from public.contract_files as file
    where file.contract_id = p_contract_id

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signed_pdf_bucket}', ''),
        'directsign-private'
      ) as bucket,
      snapshot.storage_path as object_path,
      legacy.contract #>> '{signature_data,signed_pdf_storage_provider}'
        as provider
    from public.contract_snapshots as snapshot
    left join public.contracts as contract
      on contract.id = snapshot.contract_id
    left join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where snapshot.contract_id = p_contract_id
      and snapshot.storage_path is not null

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signature_storage_bucket}', ''),
        'directsign-private'
      ) as bucket,
      signature.signature_storage_path as object_path,
      legacy.contract #>> '{signature_data,signature_storage_provider}'
        as provider
    from public.signatures as signature
    left join public.contracts as contract
      on contract.id = signature.contract_id
    left join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where signature.contract_id = p_contract_id
      and signature.signature_storage_path is not null

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signature_storage_bucket}', ''),
        'directsign-private'
      ) as bucket,
      legacy.contract #>> '{signature_data,signature_storage_path}' as object_path,
      legacy.contract #>> '{signature_data,signature_storage_provider}' as provider
    from public.contracts as contract
    join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where contract.id = p_contract_id

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signed_pdf_bucket}', ''),
        'directsign-private'
      ) as bucket,
      legacy.contract #>> '{signature_data,signed_pdf_path}' as object_path,
      legacy.contract #>> '{signature_data,signed_pdf_storage_provider}' as provider
    from public.contracts as contract
    join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where contract.id = p_contract_id
  )
  insert into public.privacy_storage_deletion_queue (
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    available_at,
    created_at,
    updated_at
  )
  select distinct
    'contract',
    p_contract_id::text,
    'contract',
    reference.bucket,
    reference.object_path,
    p_due_at,
    p_now,
    p_now,
    p_now
  from storage_references as reference
  where btrim(coalesce(reference.bucket, '')) <> ''
    and reference.bucket <> 'local'
    and coalesce(reference.provider, 'supabase_storage') = 'supabase_storage'
    and length(reference.bucket) <= 120
    and btrim(coalesce(reference.object_path, '')) <> ''
    and length(reference.object_path) <= 1024
    and reference.object_path !~ '(^|/)\.\.(/|$)'
    and left(reference.object_path, 1) <> '/'
  on conflict (source_type, source_id, bucket, object_path) do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;
create or replace function directsign_private.directsign_contract_storage_complete(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with storage_references as (
    select file.bucket, file.storage_path as object_path
    from public.contract_files as file
    where file.contract_id = p_contract_id

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signed_pdf_bucket}', ''),
        'directsign-private'
      ),
      snapshot.storage_path
    from public.contract_snapshots as snapshot
    left join public.contracts as contract
      on contract.id = snapshot.contract_id
    left join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where snapshot.contract_id = p_contract_id
      and snapshot.storage_path is not null

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signature_storage_bucket}', ''),
        'directsign-private'
      ),
      signature.signature_storage_path
    from public.signatures as signature
    left join public.contracts as contract
      on contract.id = signature.contract_id
    left join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where signature.contract_id = p_contract_id
      and signature.signature_storage_path is not null

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signature_storage_bucket}', ''),
        'directsign-private'
      ),
      legacy.contract #>> '{signature_data,signature_storage_path}'
    from public.contracts as contract
    join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where contract.id = p_contract_id

    union all

    select
      coalesce(
        nullif(legacy.contract #>> '{signature_data,signed_pdf_bucket}', ''),
        'directsign-private'
      ),
      legacy.contract #>> '{signature_data,signed_pdf_path}'
    from public.contracts as contract
    join public.directsign_contracts as legacy
      on legacy.id = contract.legacy_contract_id
      or legacy.id = contract.id::text
    where contract.id = p_contract_id
  )
  select not exists (
    select 1
    from storage_references as reference
    where btrim(coalesce(reference.object_path, '')) <> ''
      and not exists (
        select 1
        from public.privacy_storage_deletion_queue as queue
        where queue.source_type = 'contract'
          and queue.source_id = p_contract_id::text
          and queue.bucket = reference.bucket
          and queue.object_path = reference.object_path
          and queue.status = 'completed'
      )
  );
$$;
create or replace function directsign_private.directsign_queue_legacy_contract_storage(
  p_contract_id text,
  p_due_at timestamptz,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queued integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  with storage_references as (
    select
      coalesce(
        nullif(contract #>> '{signature_data,signature_storage_bucket}', ''),
        'directsign-private'
      ) as bucket,
      contract #>> '{signature_data,signature_storage_path}' as object_path,
      contract #>> '{signature_data,signature_storage_provider}' as provider
    from public.directsign_contracts
    where id = p_contract_id

    union all

    select
      coalesce(
        nullif(contract #>> '{signature_data,signed_pdf_bucket}', ''),
        'directsign-private'
      ),
      contract #>> '{signature_data,signed_pdf_path}',
      contract #>> '{signature_data,signed_pdf_storage_provider}'
    from public.directsign_contracts
    where id = p_contract_id
  )
  insert into public.privacy_storage_deletion_queue (
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    available_at,
    created_at,
    updated_at
  )
  select distinct
    'legacy_contract',
    p_contract_id,
    'contract',
    reference.bucket,
    reference.object_path,
    p_due_at,
    p_now,
    p_now,
    p_now
  from storage_references as reference
  where btrim(coalesce(reference.bucket, '')) <> ''
    and reference.bucket <> 'local'
    and coalesce(reference.provider, 'supabase_storage') = 'supabase_storage'
    and length(reference.bucket) <= 120
    and btrim(coalesce(reference.object_path, '')) <> ''
    and length(reference.object_path) <= 1024
    and reference.object_path !~ '(^|/)\.\.(/|$)'
    and left(reference.object_path, 1) <> '/'
  on conflict (source_type, source_id, bucket, object_path) do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;
create or replace function directsign_private.directsign_legacy_contract_storage_complete(
  p_contract_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with storage_references as (
    select
      coalesce(
        nullif(contract #>> '{signature_data,signature_storage_bucket}', ''),
        'directsign-private'
      ) as bucket,
      contract #>> '{signature_data,signature_storage_path}' as object_path
    from public.directsign_contracts
    where id = p_contract_id

    union all

    select
      coalesce(
        nullif(contract #>> '{signature_data,signed_pdf_bucket}', ''),
        'directsign-private'
      ),
      contract #>> '{signature_data,signed_pdf_path}'
    from public.directsign_contracts
    where id = p_contract_id
  )
  select not exists (
    select 1
    from storage_references as reference
    where btrim(coalesce(reference.object_path, '')) <> ''
      and not exists (
        select 1
        from public.privacy_storage_deletion_queue as queue
        where queue.source_type = 'legacy_contract'
          and queue.source_id = p_contract_id
          and queue.bucket = reference.bucket
          and queue.object_path = reference.object_path
          and queue.status = 'completed'
      )
  );
$$;
create or replace function directsign_private.directsign_queue_verification_storage(
  p_request_id uuid,
  p_due_at timestamptz,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queued integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  insert into public.privacy_storage_deletion_queue (
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    available_at,
    created_at,
    updated_at
  )
  select
    'verification_request',
    request.id::text,
    'verification',
    request.evidence_snapshot_json #>> '{evidence_file,bucket}',
    request.evidence_snapshot_json #>> '{evidence_file,path}',
    p_due_at,
    p_now,
    p_now,
    p_now
  from public.verification_requests as request
  where request.id = p_request_id
    and coalesce(
      request.evidence_snapshot_json #>> '{evidence_file,provider}',
      'supabase_storage'
    ) = 'supabase_storage'
    and btrim(coalesce(
      request.evidence_snapshot_json #>> '{evidence_file,bucket}', ''
    )) <> ''
    and request.evidence_snapshot_json #>> '{evidence_file,bucket}' <> 'local'
    and length(request.evidence_snapshot_json #>> '{evidence_file,bucket}') <= 120
    and btrim(coalesce(
      request.evidence_snapshot_json #>> '{evidence_file,path}', ''
    )) <> ''
    and length(request.evidence_snapshot_json #>> '{evidence_file,path}') <= 1024
    and (request.evidence_snapshot_json #>> '{evidence_file,path}')
      !~ '(^|/)\.\.(/|$)'
    and left(request.evidence_snapshot_json #>> '{evidence_file,path}', 1) <> '/'
  on conflict (source_type, source_id, bucket, object_path) do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;
create or replace function directsign_private.directsign_verification_storage_complete(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.verification_requests as request
    where request.id = p_request_id
      and btrim(coalesce(
        request.evidence_snapshot_json #>> '{evidence_file,path}', ''
      )) <> ''
      and not exists (
        select 1
        from public.privacy_storage_deletion_queue as queue
        where queue.source_type = 'verification_request'
          and queue.source_id = request.id::text
          and queue.bucket = request.evidence_snapshot_json
            #>> '{evidence_file,bucket}'
          and queue.object_path = request.evidence_snapshot_json
            #>> '{evidence_file,path}'
          and queue.status = 'completed'
      )
  );
$$;
create or replace function directsign_private.directsign_contract_retention_held(
  p_contract_id uuid,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contracts as contract
    where contract.id = p_contract_id
      and (
        directsign_private.directsign_privacy_hold_active(
          'contract', contract.id::text, 'contract', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'contract', contract.legacy_contract_id, 'contract', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'organization', contract.owner_organization_id::text, 'contract', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'profile', contract.created_by_profile_id::text, 'contract', p_now
        )
        or exists (
          select 1
          from public.contract_parties as party
          where party.contract_id = contract.id
            and directsign_private.directsign_privacy_hold_active(
              'profile', party.profile_id::text, 'contract', p_now
            )
        )
        or exists (
          select 1
          from public.contract_events as event
          where event.contract_id = contract.id
            and directsign_private.directsign_privacy_hold_active(
              'profile', event.actor_profile_id::text, 'contract', p_now
            )
        )
      )
  );
$$;
create or replace function directsign_private.directsign_legacy_contract_retention_held(
  p_contract_id text,
  p_advertiser_id text,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    directsign_private.directsign_privacy_hold_active(
      'contract', p_contract_id, 'contract', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'profile', p_advertiser_id, 'contract', p_now
    );
$$;
create or replace function directsign_private.directsign_verification_retention_held(
  p_request_id uuid,
  p_profile_id uuid,
  p_organization_id uuid,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    directsign_private.directsign_privacy_hold_active(
      'verification_request', p_request_id::text, 'verification', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'profile', p_profile_id::text, 'verification', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'organization', p_organization_id::text, 'verification', p_now
    );
$$;
create or replace function directsign_private.directsign_support_access_retention_held(
  p_request_id uuid,
  p_requester_profile_id uuid,
  p_contract_id text,
  p_contract_uuid uuid,
  p_legacy_contract_id text,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    directsign_private.directsign_privacy_hold_active(
      'support_access_request', p_request_id::text, 'support', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'profile', p_requester_profile_id::text, 'support', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'contract', p_contract_uuid::text, 'support', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'contract', p_contract_id, 'support', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'contract', p_legacy_contract_id, 'support', p_now
    );
$$;
create or replace function directsign_private.directsign_support_ticket_retention_held(
  p_ticket_id uuid,
  p_contract_id text,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    directsign_private.directsign_privacy_hold_active(
      'support_ticket', p_ticket_id::text, 'support', p_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'contract', p_contract_id, 'support', p_now
    );
$$;
create or replace function public.run_privacy_retention(
  p_now timestamptz,
  p_limit integer,
  p_dry_run boolean default false,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_limit integer := p_limit;
  v_remaining integer;
  v_run public.privacy_retention_runs%rowtype;
  v_row record;
  v_row_count integer := 0;
  v_processed integer := 0;
  v_contracts_due integer := 0;
  v_contracts_deleted integer := 0;
  v_legacy_contracts_due integer := 0;
  v_legacy_contracts_deleted integer := 0;
  v_verification_due integer := 0;
  v_verification_deleted integer := 0;
  v_support_access_due integer := 0;
  v_support_access_deleted integer := 0;
  v_support_tickets_due integer := 0;
  v_support_tickets_deleted integer := 0;
  v_orphan_organizations_deleted integer := 0;
  v_security_due integer := 0;
  v_security_deleted integer := 0;
  v_storage_queued integer := 0;
  v_storage_waiting integer := 0;
  v_would_delete integer := 0;
  v_counters jsonb := '{}'::jsonb;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if v_limit is null or v_limit < 1 or v_limit > 500 then
    raise exception using errcode = '22023', message = 'limit must be between 1 and 500';
  end if;
  if p_idempotency_key is not null and (
    btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 160
    or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
  ) then
    raise exception using errcode = '22023', message = 'safe idempotency key required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('directsign:privacy-retention', 94731)
  );

  insert into public.privacy_retention_runs (
    idempotency_key,
    run_kind,
    dry_run,
    status,
    started_at,
    created_at
  ) values (
    p_idempotency_key,
    case when p_idempotency_key is null then 'scheduled' else 'manual' end,
    coalesce(p_dry_run, false),
    'running',
    v_now,
    v_now
  )
  on conflict (idempotency_key) do nothing
  returning * into v_run;

  if not found then
    select run.* into v_run
    from public.privacy_retention_runs as run
    where run.idempotency_key = p_idempotency_key;

    return jsonb_build_object(
      'run_id', v_run.id,
      'status', v_run.status,
      'dry_run', v_run.dry_run,
      'idempotent_replay', true,
      'counters', v_run.counters
    );
  end if;

  v_remaining := v_limit;

  begin
    -- p_limit is a per-stream quota, not one global queue. Keeping a separate
    -- bounded allowance for every evidence/security stream prevents a large
    -- contract backlog from starving verification, support or security expiry.
    -- Prevent a hold from appearing between candidate selection and the final
    -- evidence delete. Hold creation waits for this short bounded transaction.
    lock table public.privacy_legal_holds in share mode;

    -- Contract retention starts only after a terminal contract's last recorded
    -- processing timestamp plus exactly five calendar years.
    for v_row in
      select
        contract.id,
        contract.legacy_contract_id,
        greatest(
          contract.updated_at,
          contract.signed_at,
          contract.completed_at,
          contract.cancelled_at
        ) + interval '5 years' as due_at
      from public.contracts as contract
      where contract.status::text in ('completed', 'cancelled')
        and greatest(
          contract.updated_at,
          contract.signed_at,
          contract.completed_at,
          contract.cancelled_at
        ) + interval '5 years' <= v_now
        and not directsign_private.directsign_contract_retention_held(
          contract.id, v_now
        )
      order by due_at, contract.id
      limit v_remaining
      for update of contract skip locked
    loop
      v_contracts_due := v_contracts_due + 1;
      v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

      if coalesce(p_dry_run, false) then
        if directsign_private.directsign_contract_storage_complete(v_row.id) then
          v_would_delete := v_would_delete + 1;
        else
          v_storage_waiting := v_storage_waiting + 1;
        end if;
      else
        v_storage_queued := v_storage_queued
          + directsign_private.directsign_queue_contract_storage(
              v_row.id, v_row.due_at, v_now
            );

        if directsign_private.directsign_contract_storage_complete(v_row.id) then
          -- Projection tombstones and events are no longer needed once their
          -- authoritative five-year contract evidence is itself due.
          delete from public.notification_projection_failures as failure
          where (
            failure.source_type = 'contract_event'
            and failure.source_id in (
              select event.id::text
              from public.contract_events as event
              where event.contract_id = v_row.id
            )
          ) or (
            failure.source_type = 'deliverable'
            and failure.source_id in (
              select deliverable.id::text
              from public.deliverables as deliverable
              where deliverable.contract_id = v_row.id
            )
          ) or (
            failure.source_type = 'deadline'
            and failure.source_id = v_row.id::text
          );

          delete from public.notification_projection_receipts as receipt
          where (
            receipt.source_type = 'contract_event'
            and receipt.source_id in (
              select event.id::text
              from public.contract_events as event
              where event.contract_id = v_row.id
            )
          ) or (
            receipt.source_type = 'deliverable'
            and receipt.source_id in (
              select deliverable.id::text
              from public.deliverables as deliverable
              where deliverable.contract_id = v_row.id
            )
          ) or (
            receipt.source_type = 'deadline'
            and receipt.source_id = v_row.id::text
          );

          delete from public.notification_events as notification
          where (
            notification.source_type = 'contract_event'
            and notification.source_id in (
              select event.id::text
              from public.contract_events as event
              where event.contract_id = v_row.id
            )
          ) or (
            notification.source_type = 'deliverable'
            and notification.source_id in (
              select deliverable.id::text
              from public.deliverables as deliverable
              where deliverable.contract_id = v_row.id
            )
          ) or (
            notification.source_type = 'deadline'
            and notification.source_id = v_row.id::text
          );

          delete from public.notification_workflow_sources as source
          where source.contract_id = v_row.id;

          delete from public.marketplace_contact_proposals as proposal
          where proposal.converted_contract_id = v_row.id;

          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'on', true
          );
          delete from public.contract_events as event
          where event.contract_id = v_row.id;
          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'off', true
          );

          delete from public.signatures as signature
          where signature.contract_id = v_row.id;
          delete from public.contract_snapshots as snapshot
          where snapshot.contract_id = v_row.id;
          delete from public.contract_files as file
          where file.contract_id = v_row.id;

          delete from public.contracts as contract
          where contract.id = v_row.id;

          delete from public.directsign_contracts as legacy
          where legacy.id = v_row.legacy_contract_id
             or legacy.id = v_row.id::text;

          v_contracts_deleted := v_contracts_deleted + 1;
        else
          v_storage_waiting := v_storage_waiting + 1;
        end if;
      end if;

    end loop;

    -- Old legacy contracts are independent candidates only when no V2 row is
    -- linked. CLOSED is the sole terminal legacy state.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          legacy.id,
          legacy.advertiser_id,
          legacy.updated_at + interval '5 years' as due_at
        from public.directsign_contracts as legacy
        where legacy.status = 'CLOSED'
          and legacy.updated_at + interval '5 years' <= v_now
          and not exists (
            select 1
            from public.contracts as contract
            where contract.legacy_contract_id = legacy.id
               or contract.id::text = legacy.id
          )
          and not directsign_private.directsign_legacy_contract_retention_held(
            legacy.id, legacy.advertiser_id, v_now
          )
        order by due_at, legacy.id
        limit v_remaining
        for update of legacy skip locked
      loop
        v_legacy_contracts_due := v_legacy_contracts_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          if directsign_private.directsign_legacy_contract_storage_complete(v_row.id) then
            v_would_delete := v_would_delete + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        else
          v_storage_queued := v_storage_queued
            + directsign_private.directsign_queue_legacy_contract_storage(
                v_row.id, v_row.due_at, v_now
              );
          if directsign_private.directsign_legacy_contract_storage_complete(v_row.id) then
            delete from public.google_calendar_events as calendar_event
            where calendar_event.legacy_contract_id = v_row.id;
            delete from public.marketplace_contact_proposals as proposal
            where proposal.converted_contract_id = case
              when v_row.id ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then v_row.id::uuid
              else null::uuid
            end;
            delete from public.directsign_contracts as legacy
            where legacy.id = v_row.id;
            v_legacy_contracts_deleted := v_legacy_contracts_deleted + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        end if;

      end loop;
    end if;

    -- Verification evidence expires after the terminal request's last
    -- processing timestamp plus exactly three calendar years.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          request.id,
          request.profile_id,
          request.organization_id,
          greatest(
            request.updated_at,
            request.reviewed_at,
            request.ownership_checked_at
          ) + interval '3 years' as due_at
        from public.verification_requests as request
        where request.status::text in ('approved', 'rejected')
          and greatest(
            request.updated_at,
            request.reviewed_at,
            request.ownership_checked_at
          ) + interval '3 years' <= v_now
          and not directsign_private.directsign_verification_retention_held(
            request.id,
            coalesce(
              request.profile_id,
              directsign_private.directsign_uuid_or_null(request.target_id)
            ),
            request.organization_id,
            v_now
          )
          and not directsign_private.directsign_privacy_hold_active(
            'profile', request.target_id, 'verification', v_now
          )
          and not directsign_private.directsign_privacy_hold_active(
            'organization', request.target_id, 'verification', v_now
          )
        order by due_at, request.id
        limit v_remaining
        for update of request skip locked
      loop
        v_verification_due := v_verification_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          if directsign_private.directsign_verification_storage_complete(v_row.id) then
            v_would_delete := v_would_delete + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        else
          v_storage_queued := v_storage_queued
            + directsign_private.directsign_queue_verification_storage(
                v_row.id, v_row.due_at, v_now
              );
          if directsign_private.directsign_verification_storage_complete(v_row.id) then
            delete from public.operational_alert_events as alert
            where alert.kind = 'verification_request'
              and alert.subject_id = v_row.id::text;
            delete from public.verification_requests as request
            where request.id = v_row.id;
            v_verification_deleted := v_verification_deleted + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        end if;

      end loop;
    end if;

    -- Support-access audit chains use their own three-year clock and survive
    -- an earlier contract purge through immutable UUID/text snapshots.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          request.id,
          case
            when request.status::text in ('expired', 'active') then greatest(
              request.updated_at,
              request.reviewed_at,
              request.expires_at
            )
            else greatest(request.updated_at, request.reviewed_at)
          end + interval '3 years' as due_at
        from public.support_access_requests as request
        where (
            request.status::text in ('closed', 'revoked', 'expired')
            or (
              request.status::text = 'active'
              and request.expires_at <= v_now
            )
          )
          and case
            when request.status::text in ('expired', 'active') then greatest(
              request.updated_at,
              request.reviewed_at,
              request.expires_at
            )
            else greatest(request.updated_at, request.reviewed_at)
          end + interval '3 years' <= v_now
          and not directsign_private.directsign_support_access_retention_held(
            request.id,
            request.requester_profile_id,
            request.contract_id,
            request.contract_uuid,
            request.legacy_contract_id,
            v_now
          )
        order by due_at, request.id
        limit v_remaining
        for update of request skip locked
      loop
        v_support_access_due := v_support_access_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_alert_events as alert
          where alert.kind = 'support_access'
            and alert.subject_id = v_row.id::text;

          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'on', true
          );
          delete from public.support_access_events as event
          where event.support_access_request_id = v_row.id;
          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'off', true
          );

          delete from public.support_access_requests as request
          where request.id = v_row.id;
          v_support_access_deleted := v_support_access_deleted + 1;
        end if;

      end loop;
    end if;

    -- Resolved customer support records expire at updated_at + exactly three
    -- years. Open/reviewing work remains actionable and is never auto-purged.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          ticket.id,
          ticket.updated_at + interval '3 years' as due_at
        from public.operational_support_tickets as ticket
        where ticket.status in ('resolved', 'closed')
          and ticket.updated_at + interval '3 years' <= v_now
          and not directsign_private.directsign_support_ticket_retention_held(
            ticket.id, ticket.contract_id, v_now
          )
        order by due_at, ticket.id
        limit v_remaining
        for update of ticket skip locked
      loop
        v_support_tickets_due := v_support_tickets_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_alert_events as alert
          where alert.kind = 'support_ticket'
            and alert.subject_id = v_row.id::text;
          delete from public.operational_support_tickets as ticket
          where ticket.id = v_row.id;
          v_support_tickets_deleted := v_support_tickets_deleted + 1;
        end if;

      end loop;
    end if;

    -- Authentication and operational security logs use their documented
    -- boundaries. Each table receives an independent bounded quota so a busy
    -- metric stream cannot starve another expiry stream.
    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select metric.ctid as row_ctid
        from public.operational_auth_metric_buckets as metric
        where metric.bucket_minute + interval '1 year' <= v_now
        order by metric.bucket_minute
        limit v_remaining
        for update of metric skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_auth_metric_buckets
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select alert.ctid as row_ctid
        from public.operational_alert_events as alert
        where alert.created_at + interval '1 year' <= v_now
          and not (
            alert.kind = 'verification_request'
            and directsign_private.directsign_privacy_hold_active(
              'verification_request', alert.subject_id, 'security', v_now
            )
          )
          and not (
            alert.kind = 'support_ticket'
            and directsign_private.directsign_privacy_hold_active(
              'support_ticket', alert.subject_id, 'security', v_now
            )
          )
          and not (
            alert.kind = 'support_access'
            and directsign_private.directsign_privacy_hold_active(
              'support_access_request', alert.subject_id, 'security', v_now
            )
          )
        order by alert.created_at, alert.id
        limit v_remaining
        for update of alert skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_alert_events
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select run.ctid as row_ctid
        from public.marketplace_follower_sync_runs as run
        where greatest(
          run.created_at,
          run.updated_at,
          run.finished_at
        ) + interval '1 year' <= v_now
        order by greatest(run.created_at, run.updated_at, run.finished_at), run.id
        limit v_remaining
        for update of run skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.marketplace_follower_sync_runs
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select event.ctid as row_ctid
        from public.marketplace_follower_sync_events as event
        where event.created_at + interval '1 year' <= v_now
        order by event.created_at, event.id
        limit v_remaining
        for update of event skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.marketplace_follower_sync_events
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select session.ctid as row_ctid
        from public.admin_operator_sessions as session
        where session.absolute_expires_at + interval '30 days' <= v_now
        order by session.absolute_expires_at, session.id
        limit v_remaining
        for update of session skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.admin_operator_sessions
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select grant_row.ctid as row_ctid
        from public.auth_recent_grants as grant_row
        where grant_row.expires_at + interval '1 day' <= v_now
        order by grant_row.expires_at, grant_row.token_hash
        limit v_remaining
        for update of grant_row skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.auth_recent_grants
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select bucket.ctid as row_ctid
        from public.directsign_rate_limit_buckets as bucket
        where bucket.reset_at + interval '1 day' <= v_now
        order by bucket.reset_at, bucket.bucket_key
        limit v_remaining
        for update of bucket skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.directsign_rate_limit_buckets
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select reservation.ctid as row_ctid
        from public.directsign_admin_mfa_rate_limit_reservations as reservation
        where reservation.expires_at + interval '1 day' <= v_now
        order by reservation.expires_at, reservation.reservation_id
        limit v_remaining
        for update of reservation skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.directsign_admin_mfa_rate_limit_reservations
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select outcome.ctid as row_ctid
        from public.directsign_admin_mfa_rate_limit_outcomes as outcome
        where outcome.purge_after <= v_now
        order by outcome.purge_after, outcome.reservation_id
        limit v_remaining
        for update of outcome skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.directsign_admin_mfa_rate_limit_outcomes
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    -- A completed erasure keeps its sole-member organization ids until later
    -- contract/campaign cleanup makes the organization deletable. This avoids
    -- losing the only bounded orphan-cleanup locator at finalization time.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          request.id as request_id,
          organization.id as organization_id
        from public.privacy_erasure_requests as request
        cross join lateral unnest(request.organization_ids) as erased_org(id)
        join public.organizations as organization
          on organization.id = erased_org.id
        where request.status = 'completed'
          and not directsign_private.directsign_privacy_hold_active(
            'organization', organization.id::text, 'account', v_now
          )
          and not exists (
            select 1 from public.organization_members as member
            where member.organization_id = organization.id
          )
          and not exists (
            select 1 from public.contracts as contract
            where contract.owner_organization_id = organization.id
          )
          and not exists (
            select 1 from public.marketplace_campaigns as campaign
            where campaign.organization_id = organization.id
          )
        order by request.finalized_at, request.id, organization.id
        limit v_remaining
        for update of organization skip locked
      loop
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.organizations
          where id = v_row.organization_id;
          update public.privacy_erasure_requests
          set
            organization_ids = array_remove(
              organization_ids, v_row.organization_id
            ),
            updated_at = v_now
          where id = v_row.request_id;
          v_orphan_organizations_deleted :=
            v_orphan_organizations_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select request.ctid as row_ctid
        from public.privacy_erasure_requests as request
        where request.status in ('completed', 'cancelled')
          and coalesce(request.finalized_at, request.updated_at)
            + interval '1 year' <= v_now
          and not directsign_private.directsign_privacy_hold_active(
            'profile', request.auth_user_id::text, 'account', v_now
          )
          and not exists (
            select 1
            from unnest(request.organization_ids) as erased_org(id)
            join public.organizations as organization
              on organization.id = erased_org.id
          )
        order by coalesce(request.finalized_at, request.updated_at), request.id
        limit v_remaining
        for update of request skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.privacy_erasure_requests
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select queue.ctid as row_ctid
        from public.privacy_storage_deletion_queue as queue
        where queue.status = 'completed'
          and queue.completed_at + interval '1 year' <= v_now
        order by queue.completed_at, queue.id
        limit v_remaining
        for update of queue skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.privacy_storage_deletion_queue
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select old_run.ctid as row_ctid
        from public.privacy_retention_runs as old_run
        where old_run.id <> v_run.id
          and old_run.status in ('completed', 'failed')
          and coalesce(old_run.completed_at, old_run.created_at)
            + interval '1 year' <= v_now
        order by coalesce(old_run.completed_at, old_run.created_at), old_run.id
        limit v_remaining
        for update of old_run skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.privacy_retention_runs
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_counters := jsonb_build_object(
      'processed', v_processed,
      'contracts_due', v_contracts_due,
      'contracts_deleted', v_contracts_deleted,
      'legacy_contracts_due', v_legacy_contracts_due,
      'legacy_contracts_deleted', v_legacy_contracts_deleted,
      'verification_due', v_verification_due,
      'verification_deleted', v_verification_deleted,
      'support_access_due', v_support_access_due,
      'support_access_deleted', v_support_access_deleted,
      'support_tickets_due', v_support_tickets_due,
      'support_tickets_deleted', v_support_tickets_deleted,
      'orphan_organizations_deleted', v_orphan_organizations_deleted,
      'security_due', v_security_due,
      'security_deleted', v_security_deleted,
      'storage_queued', v_storage_queued,
      'storage_waiting', v_storage_waiting,
      'would_delete', v_would_delete
    );

    update public.privacy_retention_runs
    set
      status = 'completed',
      counters = v_counters,
      completed_at = v_now
    where id = v_run.id
    returning * into v_run;

    return jsonb_build_object(
      'run_id', v_run.id,
      'status', v_run.status,
      'dry_run', v_run.dry_run,
      'idempotent_replay', false,
      'counters', v_run.counters
    );
  exception
    when others then
      update public.privacy_retention_runs
      set
        status = 'failed',
        error_code = 'retention_run_failed',
        counters = jsonb_build_object('processed_before_rollback', v_processed),
        completed_at = v_now
      where id = v_run.id
      returning * into v_run;

      return jsonb_build_object(
        'run_id', v_run.id,
        'status', 'failed',
        'dry_run', v_run.dry_run,
        'error_code', v_run.error_code,
        'counters', v_run.counters
      );
  end;
end;
$$;
revoke all on function
  public.create_privacy_legal_hold(
    uuid, text, text, text, text, timestamptz, timestamptz, uuid
  ),
  public.release_privacy_legal_hold(uuid, uuid, timestamptz),
  public.request_account_erasure(uuid, uuid, text, text, timestamptz),
  public.get_privacy_erasure_status(uuid, uuid),
  public.claim_privacy_storage_deletions(
    text, integer, uuid, timestamptz, integer
  ),
  public.complete_privacy_storage_deletion(
    uuid, text, boolean, text, timestamptz
  ),
  public.requeue_privacy_storage_deletion(uuid, timestamptz),
  public.mark_account_erasure_failed(uuid, text, timestamptz),
  public.finalize_account_erasure(uuid, timestamptz),
  public.run_privacy_retention(timestamptz, integer, boolean, text)
from public, anon, authenticated;
grant execute on function
  public.create_privacy_legal_hold(
    uuid, text, text, text, text, timestamptz, timestamptz, uuid
  ),
  public.release_privacy_legal_hold(uuid, uuid, timestamptz),
  public.request_account_erasure(uuid, uuid, text, text, timestamptz),
  public.get_privacy_erasure_status(uuid, uuid),
  public.claim_privacy_storage_deletions(
    text, integer, uuid, timestamptz, integer
  ),
  public.complete_privacy_storage_deletion(
    uuid, text, boolean, text, timestamptz
  ),
  public.requeue_privacy_storage_deletion(uuid, timestamptz),
  public.mark_account_erasure_failed(uuid, text, timestamptz),
  public.finalize_account_erasure(uuid, timestamptz),
  public.run_privacy_retention(timestamptz, integer, boolean, text)
to service_role;
revoke all on function
  directsign_private.directsign_require_privacy_service_role(),
  directsign_private.directsign_privacy_hold_active(
    text, text, text, timestamptz
  ),
  directsign_private.directsign_storage_deletion_held(
    text, text, text, timestamptz
  ),
  directsign_private.directsign_queue_contract_storage(
    uuid, timestamptz, timestamptz
  ),
  directsign_private.directsign_contract_storage_complete(uuid),
  directsign_private.directsign_queue_legacy_contract_storage(
    text, timestamptz, timestamptz
  ),
  directsign_private.directsign_legacy_contract_storage_complete(text),
  directsign_private.directsign_queue_verification_storage(
    uuid, timestamptz, timestamptz
  ),
  directsign_private.directsign_verification_storage_complete(uuid),
  directsign_private.directsign_contract_retention_held(uuid, timestamptz),
  directsign_private.directsign_legacy_contract_retention_held(
    text, text, timestamptz
  ),
  directsign_private.directsign_verification_retention_held(
    uuid, uuid, uuid, timestamptz
  ),
  directsign_private.directsign_support_access_retention_held(
    uuid, uuid, text, uuid, text, timestamptz
  ),
  directsign_private.directsign_support_ticket_retention_held(
    uuid, text, timestamptz
  )
from public, anon, authenticated;
grant execute on function
  directsign_private.directsign_require_privacy_service_role(),
  directsign_private.directsign_privacy_hold_active(
    text, text, text, timestamptz
  ),
  directsign_private.directsign_storage_deletion_held(
    text, text, text, timestamptz
  ),
  directsign_private.directsign_queue_contract_storage(
    uuid, timestamptz, timestamptz
  ),
  directsign_private.directsign_contract_storage_complete(uuid),
  directsign_private.directsign_queue_legacy_contract_storage(
    text, timestamptz, timestamptz
  ),
  directsign_private.directsign_legacy_contract_storage_complete(text),
  directsign_private.directsign_queue_verification_storage(
    uuid, timestamptz, timestamptz
  ),
  directsign_private.directsign_verification_storage_complete(uuid),
  directsign_private.directsign_contract_retention_held(uuid, timestamptz),
  directsign_private.directsign_legacy_contract_retention_held(
    text, text, timestamptz
  ),
  directsign_private.directsign_verification_retention_held(
    uuid, uuid, uuid, timestamptz
  ),
  directsign_private.directsign_support_access_retention_held(
    uuid, uuid, text, uuid, text, timestamptz
  ),
  directsign_private.directsign_support_ticket_retention_held(
    uuid, text, timestamptz
  )
to service_role;
-- The application uses a server proxy for all customer contract/account data.
-- Removing table/view SELECT from browser JWT roles prevents a pre-erasure
-- access token from reading retained pseudonymous evidence during its remaining
-- access-token lifetime. Curated SECURITY DEFINER RPCs keep their own explicit
-- EXECUTE grants and the server keeps service_role table access.
revoke select on table
  public.profiles,
  public.organizations,
  public.organization_members,
  public.directsign_contracts,
  public.contracts,
  public.contract_parties,
  public.contract_platforms,
  public.contract_pricing_terms,
  public.contract_clauses,
  public.clause_threads,
  public.deliverable_requirements,
  public.deliverables,
  public.settlement_periods,
  public.settlement_reports,
  public.settlement_items,
  public.payouts,
  public.share_links,
  public.contract_snapshots,
  public.signatures,
  public.contract_files,
  public.contract_events,
  public.verification_requests,
  public.support_access_requests,
  public.support_access_events,
  public.marketplace_contact_proposals,
  public.marketplace_campaigns,
  public.contract_summaries
from public, anon, authenticated;
comment on function public.run_privacy_retention(
  timestamptz, integer, boolean, text
) is
  'Bounded service-role retention pass. Terminal contracts use last processing + 5 years, terminal verification/support evidence uses + 3 years, and security logs use + 1 year. Storage-backed owners require a completed Storage API queue item before database deletion.';
comment on function public.request_account_erasure(
  uuid, uuid, text, text, timestamptz
) is
  'Idempotently blocks account/public access, tombstones the live profile, revokes share links and queues exact Storage objects before Auth Admin deletion and finalization.';
notify pgrst, 'reload schema';
commit;
