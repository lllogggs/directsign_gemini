-- Atomic, cross-instance reservation of the three administrator MFA failure
-- buckets. Callers provide only server-hashed lowercase SHA-256 bucket keys;
-- raw user, factor, and network identifiers must never reach these tables.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- The existing generic limiter used to delete many expired rows before locking
-- its requested bucket. That order can deadlock with the three-bucket MFA
-- reservation. Lock/update the requested bucket first, then clean only rows
-- that can be locked immediately; cleanup is best-effort and never waits.
create or replace function public.consume_directsign_rate_limit(
  p_bucket_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_current_count integer;
  v_current_reset timestamptz;
begin
  if btrim(coalesce(p_bucket_key, '')) = '' then
    raise exception using
      errcode = '22023',
      message = 'bucket key is required';
  end if;
  if p_max_attempts < 1 or p_window_seconds < 1 then
    raise exception using
      errcode = '22023',
      message = 'rate limit bounds must be positive';
  end if;

  insert into public.directsign_rate_limit_buckets as bucket (
    bucket_key,
    attempt_count,
    reset_at,
    updated_at
  )
  values (
    p_bucket_key,
    1,
    v_now + pg_catalog.make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (bucket_key) do update
  set
    attempt_count = case
      when bucket.reset_at <= v_now then 1
      else bucket.attempt_count + 1
    end,
    reset_at = case
      when bucket.reset_at <= v_now
        then v_now + pg_catalog.make_interval(secs => p_window_seconds)
      else bucket.reset_at
    end,
    updated_at = v_now
  returning bucket.attempt_count, bucket.reset_at
  into v_current_count, v_current_reset;

  if pg_catalog.random() < 0.01 then
    v_now := pg_catalog.clock_timestamp();

    with cleanup_candidates as (
      select expired_bucket.bucket_key
      from public.directsign_rate_limit_buckets as expired_bucket
      where expired_bucket.reset_at < v_now - interval '1 day'
        and expired_bucket.bucket_key <> p_bucket_key
      order by expired_bucket.bucket_key
      limit 128
      for update of expired_bucket skip locked
    )
    delete from public.directsign_rate_limit_buckets as expired_bucket
    using cleanup_candidates as candidate
    where expired_bucket.bucket_key = candidate.bucket_key;
  end if;

  return query
  select
    v_current_count > p_max_attempts,
    greatest(
      0,
      pg_catalog.ceil(
        extract(
          epoch from (v_current_reset - pg_catalog.clock_timestamp())
        )
      )::integer
    );
end;
$$;

revoke execute on function public.consume_directsign_rate_limit(
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.consume_directsign_rate_limit(
  text,
  integer,
  integer
) to service_role;

create table if not exists public.directsign_admin_mfa_rate_limit_reservations (
  reservation_id uuid primary key,
  max_attempts integer not null,
  window_seconds integer not null,
  reservation_ttl_seconds integer not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint directsign_admin_mfa_reservation_max_attempts_positive
    check (max_attempts > 0),
  constraint directsign_admin_mfa_reservation_window_positive
    check (window_seconds > 0),
  constraint directsign_admin_mfa_reservation_ttl_range
    check (
      reservation_ttl_seconds >= 1
      and reservation_ttl_seconds <= 900
    ),
  constraint directsign_admin_mfa_reservation_expiry_order
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '15 minutes'
    )
);

create index if not exists directsign_admin_mfa_reservations_expiry_idx
  on public.directsign_admin_mfa_rate_limit_reservations (expires_at);

create table if not exists public.directsign_admin_mfa_rate_limit_reservation_items (
  reservation_id uuid not null
    references public.directsign_admin_mfa_rate_limit_reservations (reservation_id)
    on delete cascade,
  bucket_key text not null,
  bucket_reset_at timestamptz not null,
  primary key (reservation_id, bucket_key),
  constraint directsign_admin_mfa_reservation_item_bucket_hash
    check (bucket_key ~ '^[0-9a-f]{64}$')
);

create index if not exists directsign_admin_mfa_reservation_items_bucket_idx
  on public.directsign_admin_mfa_rate_limit_reservation_items (
    bucket_key,
    bucket_reset_at
  );

-- Terminal rows are deliberately minimal idempotency tombstones. Finalizing or
-- rolling back deletes the active reservation and its item metadata, while this
-- small record prevents the same UUID from applying a second mutation.
create table if not exists public.directsign_admin_mfa_rate_limit_outcomes (
  reservation_id uuid primary key,
  terminal_outcome text not null,
  completed_at timestamptz not null,
  purge_after timestamptz not null,
  constraint directsign_admin_mfa_outcome_value
    check (terminal_outcome in ('finalized', 'rolled_back')),
  constraint directsign_admin_mfa_outcome_purge_order
    check (purge_after > completed_at)
);

create index if not exists directsign_admin_mfa_rate_limit_outcomes_purge_idx
  on public.directsign_admin_mfa_rate_limit_outcomes (purge_after);

alter table public.directsign_admin_mfa_rate_limit_reservations
  enable row level security;
alter table public.directsign_admin_mfa_rate_limit_reservation_items
  enable row level security;
alter table public.directsign_admin_mfa_rate_limit_outcomes
  enable row level security;

revoke all on table public.directsign_admin_mfa_rate_limit_reservations
  from public, anon, authenticated;
revoke all on table public.directsign_admin_mfa_rate_limit_reservation_items
  from public, anon, authenticated;
revoke all on table public.directsign_admin_mfa_rate_limit_outcomes
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.directsign_admin_mfa_rate_limit_reservations
  to service_role;
grant select, insert, update, delete
  on table public.directsign_admin_mfa_rate_limit_reservation_items
  to service_role;
grant select, insert, update, delete
  on table public.directsign_admin_mfa_rate_limit_outcomes
  to service_role;

create or replace function public.rollback_admin_mfa_rate_limit_reservation(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_terminal_outcome text;
  v_active_reservation uuid;
  v_item record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role required';
  end if;

  if p_reservation_id is null then
    raise exception using
      errcode = '22023',
      message = 'reservation id is required';
  end if;

  -- Every operation locks its UUID first and its bucket hashes second. Bucket
  -- hashes are always locked in lexical order, preventing cross-reservation
  -- deadlocks when user, factor, or IP buckets overlap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'directsign-admin-mfa-reservation:' || p_reservation_id::text,
      0
    )
  );

  select outcome.terminal_outcome
  into v_terminal_outcome
  from public.directsign_admin_mfa_rate_limit_outcomes as outcome
  where outcome.reservation_id = p_reservation_id;

  if found then
    return v_terminal_outcome = 'rolled_back';
  end if;

  select reservation.reservation_id
  into v_active_reservation
  from public.directsign_admin_mfa_rate_limit_reservations as reservation
  where reservation.reservation_id = p_reservation_id
  for update;

  if not found then
    -- A window-expiry cleanup may have completed while this call waited for
    -- the reservation row. Re-read the terminal marker before returning.
    select outcome.terminal_outcome
    into v_terminal_outcome
    from public.directsign_admin_mfa_rate_limit_outcomes as outcome
    where outcome.reservation_id = p_reservation_id;

    return found and v_terminal_outcome = 'rolled_back';
  end if;

  for v_item in
    select item.bucket_key, item.bucket_reset_at
    from public.directsign_admin_mfa_rate_limit_reservation_items as item
    where item.reservation_id = p_reservation_id
    order by item.bucket_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'directsign-admin-mfa-bucket:' || v_item.bucket_key,
        0
      )
    );
  end loop;

  v_now := pg_catalog.clock_timestamp();

  -- A reservation owns exactly one increment in each recorded reset window.
  -- If another request has already rolled the bucket into a new window, the
  -- timestamp predicate intentionally leaves the new window untouched.
  for v_item in
    select item.bucket_key, item.bucket_reset_at
    from public.directsign_admin_mfa_rate_limit_reservation_items as item
    where item.reservation_id = p_reservation_id
    order by item.bucket_key
  loop
    update public.directsign_rate_limit_buckets as bucket
    set
      attempt_count = greatest(0, bucket.attempt_count - 1),
      updated_at = v_now
    where bucket.bucket_key = v_item.bucket_key
      and bucket.reset_at = v_item.bucket_reset_at;
  end loop;

  insert into public.directsign_admin_mfa_rate_limit_outcomes (
    reservation_id,
    terminal_outcome,
    completed_at,
    purge_after
  )
  values (
    p_reservation_id,
    'rolled_back',
    v_now,
    v_now + interval '30 days'
  );

  -- The terminal row is inserted first in the same transaction. A retry can
  -- therefore never observe a missing reservation between decrement and mark.
  delete from public.directsign_admin_mfa_rate_limit_reservations
  where reservation_id = p_reservation_id;

  return true;
end;
$$;

create or replace function public.finalize_admin_mfa_rate_limit_reservation(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_terminal_outcome text;
  v_active_reservation uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role required';
  end if;

  if p_reservation_id is null then
    raise exception using
      errcode = '22023',
      message = 'reservation id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'directsign-admin-mfa-reservation:' || p_reservation_id::text,
      0
    )
  );

  select outcome.terminal_outcome
  into v_terminal_outcome
  from public.directsign_admin_mfa_rate_limit_outcomes as outcome
  where outcome.reservation_id = p_reservation_id;

  if found then
    return v_terminal_outcome = 'finalized';
  end if;

  select reservation.reservation_id
  into v_active_reservation
  from public.directsign_admin_mfa_rate_limit_reservations as reservation
  where reservation.reservation_id = p_reservation_id
  for update;

  if not found then
    select outcome.terminal_outcome
    into v_terminal_outcome
    from public.directsign_admin_mfa_rate_limit_outcomes as outcome
    where outcome.reservation_id = p_reservation_id;

    return found and v_terminal_outcome = 'finalized';
  end if;

  v_now := pg_catalog.clock_timestamp();

  insert into public.directsign_admin_mfa_rate_limit_outcomes (
    reservation_id,
    terminal_outcome,
    completed_at,
    purge_after
  )
  values (
    p_reservation_id,
    'finalized',
    v_now,
    v_now + interval '30 days'
  );

  -- Cascading deletion removes all bucket/reset metadata. Counts remain in the
  -- shared bucket table because a definitive invalid MFA attempt was observed.
  delete from public.directsign_admin_mfa_rate_limit_reservations
  where reservation_id = p_reservation_id;

  return true;
end;
$$;

create or replace function public.reserve_admin_mfa_rate_limit(
  p_reservation_id uuid,
  p_user_bucket_key text,
  p_factor_bucket_key text,
  p_ip_bucket_key text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_reservation_ttl_seconds integer default 120
)
returns table (
  blocked boolean,
  retry_after_seconds integer,
  reserved boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_bucket_keys text[];
  v_sorted_bucket_keys text[];
  v_existing_bucket_keys text[];
  v_bucket_key text;
  v_bucket_reset_at timestamptz;
  v_existing_reservation record;
  v_terminal_outcome text;
  v_cleanup_reservation_ids uuid[];
  v_cleanup_reservation_id uuid;
  v_cleanup_bucket_key text;
  v_cleanup_bucket_reset_at timestamptz;
  v_cleanup_increment_count integer;
  v_bucket record;
  v_unique_bucket_count integer;
  v_blocked boolean := false;
  v_retry_after_seconds integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role required';
  end if;

  if p_reservation_id is null
    or p_user_bucket_key is null
    or p_user_bucket_key !~ '^[0-9a-f]{64}$'
    or p_factor_bucket_key is null
    or p_factor_bucket_key !~ '^[0-9a-f]{64}$'
    or p_ip_bucket_key is null
    or p_ip_bucket_key !~ '^[0-9a-f]{64}$'
    or p_max_attempts is null
    or p_max_attempts < 1
    or p_max_attempts > 1000
    or p_window_seconds is null
    or p_window_seconds < 1
    or p_window_seconds > 604800
    or p_reservation_ttl_seconds is null
    or p_reservation_ttl_seconds < 1
    or p_reservation_ttl_seconds > 900
  then
    raise exception using
      errcode = '22023',
      message = 'invalid admin MFA rate limit reservation';
  end if;

  v_bucket_keys := array[
    p_user_bucket_key,
    p_factor_bucket_key,
    p_ip_bucket_key
  ];

  select pg_catalog.count(*)::integer
  into v_unique_bucket_count
  from (
    select distinct candidate.bucket_key
    from pg_catalog.unnest(v_bucket_keys) as candidate(bucket_key)
  ) as unique_buckets;

  if v_unique_bucket_count <> 3 then
    raise exception using
      errcode = '22023',
      message = 'admin MFA rate limit buckets must be distinct';
  end if;

  select pg_catalog.array_agg(candidate.bucket_key order by candidate.bucket_key)
  into v_sorted_bucket_keys
  from pg_catalog.unnest(v_bucket_keys) as candidate(bucket_key);

  -- Compensate abandoned reservations at their TTL. All candidate reservation
  -- UUIDs are locked first in lexical order, followed by the lexical union of
  -- their bucket hashes. This preserves the same reservation-before-bucket
  -- hierarchy as normal calls without accumulating locks in per-reservation
  -- bucket order, which could otherwise deadlock across overlapping batches.
  select pg_catalog.array_agg(
    candidate.reservation_id order by candidate.reservation_id
  )
  into v_cleanup_reservation_ids
  from (
    select reservation.reservation_id
    from public.directsign_admin_mfa_rate_limit_reservations as reservation
    where reservation.expires_at <= v_now
    order by reservation.reservation_id
    limit 32
  ) as candidate;

  -- Lock the global union of cleanup UUIDs and the current UUID before taking
  -- any bucket lock. No new reservation advisory lock is acquired later.
  for v_cleanup_reservation_id in
    select distinct lock_candidate.reservation_id
    from (
      select p_reservation_id as reservation_id
      union all
      select candidate.reservation_id
      from pg_catalog.unnest(v_cleanup_reservation_ids)
        as candidate(reservation_id)
    ) as lock_candidate
    order by lock_candidate.reservation_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'directsign-admin-mfa-reservation:'
          || v_cleanup_reservation_id::text,
        0
      )
    );
  end loop;

  v_now := pg_catalog.clock_timestamp();

  -- Revalidate after waiting for every reservation lock. A concurrent
  -- finalize or rollback may have removed one of the initial candidates.
  select pg_catalog.array_agg(
    candidate.reservation_id order by candidate.reservation_id
  )
  into v_cleanup_reservation_ids
  from (
    select reservation.reservation_id
    from public.directsign_admin_mfa_rate_limit_reservations as reservation
    where (
        reservation.reservation_id = any(v_cleanup_reservation_ids)
        or reservation.reservation_id = p_reservation_id
      )
      and reservation.expires_at <= v_now
      and (
        select pg_catalog.count(*)
        from public.directsign_admin_mfa_rate_limit_reservation_items as item
        where item.reservation_id = reservation.reservation_id
      ) = 3
    order by reservation.reservation_id
  ) as candidate;

  -- Lock the global union of cleanup buckets and all three current-request
  -- buckets before performing any bucket mutation. No new bucket advisory
  -- lock is acquired later in this function.
  for v_cleanup_bucket_key in
    select distinct lock_candidate.bucket_key
    from (
      select candidate.bucket_key
      from pg_catalog.unnest(v_sorted_bucket_keys) as candidate(bucket_key)
      union all
      select item.bucket_key
      from public.directsign_admin_mfa_rate_limit_reservation_items as item
      where item.reservation_id = any(v_cleanup_reservation_ids)
    ) as lock_candidate
    order by lock_candidate.bucket_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'directsign-admin-mfa-bucket:' || v_cleanup_bucket_key,
        0
      )
    );
  end loop;

  v_now := pg_catalog.clock_timestamp();

  if coalesce(
    pg_catalog.cardinality(v_cleanup_reservation_ids),
    0
  ) > 0 then
    -- Grouping exact reset timestamps preserves increments from newer windows
    -- and subtracts exactly one count per abandoned reservation in the same
    -- still-current window.
    for
      v_cleanup_bucket_key,
      v_cleanup_bucket_reset_at,
      v_cleanup_increment_count
    in
      select
        item.bucket_key,
        item.bucket_reset_at,
        pg_catalog.count(*)::integer
      from public.directsign_admin_mfa_rate_limit_reservation_items as item
      where item.reservation_id = any(v_cleanup_reservation_ids)
      group by item.bucket_key, item.bucket_reset_at
      order by item.bucket_key, item.bucket_reset_at
    loop
      update public.directsign_rate_limit_buckets as bucket
      set
        attempt_count = greatest(
          0,
          bucket.attempt_count - v_cleanup_increment_count
        ),
        updated_at = v_now
      where bucket.bucket_key = v_cleanup_bucket_key
        and bucket.reset_at = v_cleanup_bucket_reset_at;
    end loop;

    insert into public.directsign_admin_mfa_rate_limit_outcomes (
      reservation_id,
      terminal_outcome,
      completed_at,
      purge_after
    )
    select
      reservation.reservation_id,
      'rolled_back',
      v_now,
      v_now + interval '30 days'
    from public.directsign_admin_mfa_rate_limit_reservations as reservation
    where reservation.reservation_id = any(v_cleanup_reservation_ids)
    order by reservation.reservation_id;

    delete from public.directsign_admin_mfa_rate_limit_reservations
    where reservation_id = any(v_cleanup_reservation_ids);
  end if;

  with purge_candidates as (
    select expired_outcome.reservation_id
    from public.directsign_admin_mfa_rate_limit_outcomes as expired_outcome
    where expired_outcome.purge_after <= v_now
    order by expired_outcome.purge_after, expired_outcome.reservation_id
    limit 128
    for update of expired_outcome skip locked
  )
  delete from public.directsign_admin_mfa_rate_limit_outcomes as outcome
  using purge_candidates as candidate
  where outcome.reservation_id = candidate.reservation_id;

  v_now := pg_catalog.clock_timestamp();

  select outcome.terminal_outcome
  into v_terminal_outcome
  from public.directsign_admin_mfa_rate_limit_outcomes as outcome
  where outcome.reservation_id = p_reservation_id;

  if found then
    return query select false, 0, false;
    return;
  end if;

  select
    reservation.max_attempts,
    reservation.window_seconds,
    reservation.reservation_ttl_seconds,
    reservation.expires_at
  into v_existing_reservation
  from public.directsign_admin_mfa_rate_limit_reservations as reservation
  where reservation.reservation_id = p_reservation_id
  for update;

  if found then
    select pg_catalog.array_agg(item.bucket_key order by item.bucket_key)
    into v_existing_bucket_keys
    from public.directsign_admin_mfa_rate_limit_reservation_items as item
    where item.reservation_id = p_reservation_id;

    if v_existing_reservation.max_attempts <> p_max_attempts
      or v_existing_reservation.window_seconds <> p_window_seconds
      or v_existing_reservation.reservation_ttl_seconds
        <> p_reservation_ttl_seconds
      or v_existing_bucket_keys is distinct from v_sorted_bucket_keys
    then
      raise exception using
        errcode = '22023',
        message = 'reservation id parameters do not match';
    end if;

    if v_existing_reservation.expires_at <= v_now then
      -- This reservation crossed its TTL after cleanup revalidation. Its UUID
      -- and validated input buckets are already part of the two global lock
      -- unions, so compensate inline without acquiring another advisory lock.
      for v_bucket in
        select item.bucket_key, item.bucket_reset_at
        from public.directsign_admin_mfa_rate_limit_reservation_items as item
        where item.reservation_id = p_reservation_id
        order by item.bucket_key
      loop
        update public.directsign_rate_limit_buckets as bucket
        set
          attempt_count = greatest(0, bucket.attempt_count - 1),
          updated_at = v_now
        where bucket.bucket_key = v_bucket.bucket_key
          and bucket.reset_at = v_bucket.bucket_reset_at;
      end loop;

      insert into public.directsign_admin_mfa_rate_limit_outcomes (
        reservation_id,
        terminal_outcome,
        completed_at,
        purge_after
      )
      values (
        p_reservation_id,
        'rolled_back',
        v_now,
        v_now + interval '30 days'
      );

      delete from public.directsign_admin_mfa_rate_limit_reservations
      where reservation_id = p_reservation_id;

      return query select false, 0, false;
      return;
    end if;

    return query select false, 0, true;
    return;
  end if;

  -- An expiry cleanup can delete an active row while this call waits for its
  -- row lock. Its terminal insert commits atomically with that deletion.
  select outcome.terminal_outcome
  into v_terminal_outcome
  from public.directsign_admin_mfa_rate_limit_outcomes as outcome
  where outcome.reservation_id = p_reservation_id;

  if found then
    return query select false, 0, false;
    return;
  end if;

  -- Materialize absent buckets with a zero count, then row-lock all three in
  -- deterministic order. This closes the absent-row race and also serializes
  -- safely with the pre-existing generic single-bucket consumer.
  for v_bucket_key in
    select candidate.bucket_key
    from pg_catalog.unnest(v_sorted_bucket_keys) as candidate(bucket_key)
    order by candidate.bucket_key
  loop
    insert into public.directsign_rate_limit_buckets (
      bucket_key,
      attempt_count,
      reset_at,
      updated_at
    )
    values (v_bucket_key, 0, v_now, v_now)
    on conflict (bucket_key) do nothing;
  end loop;

  for v_bucket in
    select
      bucket.bucket_key,
      bucket.attempt_count,
      bucket.reset_at
    from public.directsign_rate_limit_buckets as bucket
    where bucket.bucket_key = any(v_sorted_bucket_keys)
    order by bucket.bucket_key
    for update
  loop
    -- Bucket state is evaluated below after all rows have been locked.
    null;
  end loop;

  v_now := pg_catalog.clock_timestamp();

  for v_bucket in
    select
      bucket.bucket_key,
      bucket.attempt_count,
      bucket.reset_at
    from public.directsign_rate_limit_buckets as bucket
    where bucket.bucket_key = any(v_sorted_bucket_keys)
    order by bucket.bucket_key
  loop
    if v_bucket.reset_at > v_now
      and v_bucket.attempt_count >= p_max_attempts
    then
      v_blocked := true;
      v_retry_after_seconds := greatest(
        v_retry_after_seconds,
        greatest(
          0,
          pg_catalog.ceil(
            extract(epoch from (v_bucket.reset_at - v_now))
          )::integer
        )
      );
    end if;
  end loop;

  -- No counter is incremented when any active bucket is already at its cap.
  if v_blocked then
    return query select true, v_retry_after_seconds, false;
    return;
  end if;

  insert into public.directsign_admin_mfa_rate_limit_reservations (
    reservation_id,
    max_attempts,
    window_seconds,
    reservation_ttl_seconds,
    created_at,
    expires_at
  )
  values (
    p_reservation_id,
    p_max_attempts,
    p_window_seconds,
    p_reservation_ttl_seconds,
    v_now,
    v_now + pg_catalog.make_interval(secs => p_reservation_ttl_seconds)
  );

  -- All checks and all increments occur in this one transaction. Expired
  -- windows reset to one; active windows increment once. Each resulting reset
  -- timestamp is recorded so rollback can compensate only this exact window.
  for v_bucket_key in
    select candidate.bucket_key
    from pg_catalog.unnest(v_sorted_bucket_keys) as candidate(bucket_key)
    order by candidate.bucket_key
  loop
    update public.directsign_rate_limit_buckets as bucket
    set
      attempt_count = case
        when bucket.reset_at <= v_now then 1
        else bucket.attempt_count + 1
      end,
      reset_at = case
        when bucket.reset_at <= v_now
          then v_now + pg_catalog.make_interval(secs => p_window_seconds)
        else bucket.reset_at
      end,
      updated_at = v_now
    where bucket.bucket_key = v_bucket_key
    returning bucket.reset_at into v_bucket_reset_at;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'admin MFA rate limit bucket disappeared';
    end if;

    insert into public.directsign_admin_mfa_rate_limit_reservation_items (
      reservation_id,
      bucket_key,
      bucket_reset_at
    )
    values (
      p_reservation_id,
      v_bucket_key,
      v_bucket_reset_at
    );
  end loop;

  return query select false, 0, true;
end;
$$;

revoke execute on function public.reserve_admin_mfa_rate_limit(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.reserve_admin_mfa_rate_limit(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer
) to service_role;

revoke execute on function public.rollback_admin_mfa_rate_limit_reservation(uuid)
  from public, anon, authenticated;
grant execute on function public.rollback_admin_mfa_rate_limit_reservation(uuid)
  to service_role;

revoke execute on function public.finalize_admin_mfa_rate_limit_reservation(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_mfa_rate_limit_reservation(uuid)
  to service_role;

comment on table public.directsign_admin_mfa_rate_limit_reservations is
  'Short-lived service-role-only reservations for atomic user/factor/IP administrator MFA rate-limit increments.';
comment on table public.directsign_admin_mfa_rate_limit_reservation_items is
  'Exact hashed bucket and reset-window increments owned by an active administrator MFA reservation; no raw identifiers.';
comment on table public.directsign_admin_mfa_rate_limit_outcomes is
  'Minimal 30-day UUID tombstones that make administrator MFA reservation rollback and finalize idempotent.';

comment on function public.reserve_admin_mfa_rate_limit(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer
) is
  'Atomically reserves one increment in each of three distinct lowercase 64-hex administrator MFA buckets, or denies without increments when any active bucket is capped.';
comment on function public.rollback_admin_mfa_rate_limit_reservation(uuid) is
  'Idempotently compensates only the three exact reset-window increments owned by a reservation, then removes active reservation metadata.';
comment on function public.finalize_admin_mfa_rate_limit_reservation(uuid) is
  'Idempotently retains reserved bucket counts while removing active reservation and reset-window metadata.';
