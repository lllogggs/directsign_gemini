-- Serialize append-only audit chains per resource. Contract-event history may
-- contain a small number of legacy forks that must remain byte-for-byte
-- immutable evidence. A separate, deterministic checkpoint commits every
-- legacy head and starts one new serialized generation without rewriting the
-- historical rows.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- This write barrier is acquired before taking any legacy snapshot. INSERT
-- takes ROW EXCLUSIVE before its BEFORE trigger, so the order also prevents an
-- advisory-lock/table-lock inversion with the new writer during a rerun.
lock table public.contract_events in share row exclusive mode;
lock table public.support_access_events in share row exclusive mode;

create schema if not exists directsign_private;
revoke all on schema directsign_private from public;

-- A constant DEFAULT adds the generation without issuing UPDATE against the
-- append-only evidence rows. Existing rows read as generation zero; all future
-- rows are forced to generation one by both the default and the trigger.
alter table public.contract_events
  add column if not exists chain_generation integer not null default 0;
alter table public.contract_events
  alter column chain_generation set default 1;

alter table public.contract_events
  drop constraint if exists contract_events_chain_generation_allowed;
alter table public.contract_events
  add constraint contract_events_chain_generation_allowed check (
    chain_generation in (0, 1)
  );

create table if not exists public.contract_event_chain_checkpoints (
  contract_id uuid not null
    references public.contracts (id) on delete cascade,
  generation integer not null,
  source_generation integer not null,
  source_event_count bigint not null,
  source_head_count bigint not null,
  source_snapshot jsonb not null,
  checkpoint_hash text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (contract_id, generation),
  constraint contract_event_chain_checkpoints_generation check (
    generation = 1 and source_generation = 0
  ),
  constraint contract_event_chain_checkpoints_counts check (
    source_event_count >= 0
    and source_head_count >= 0
    and source_head_count <= source_event_count
  ),
  constraint contract_event_chain_checkpoints_snapshot_object check (
    pg_catalog.jsonb_typeof(source_snapshot) = 'object'
  ),
  constraint contract_event_chain_checkpoints_hash check (
    checkpoint_hash ~ '^[0-9a-f]{64}$'
  )
);

alter table public.contract_event_chain_checkpoints enable row level security;
revoke all on table public.contract_event_chain_checkpoints
  from public, anon, authenticated, service_role;
grant select on table public.contract_event_chain_checkpoints to service_role;

comment on table public.contract_event_chain_checkpoints is
  'System-only, append-only commitments to immutable generation-zero contract-event heads. These are evidence metadata, not customer timeline events.';
comment on column public.contract_event_chain_checkpoints.source_snapshot is
  'PII-free canonical legacy-head manifest: contract UUID, generations, counts, and sorted event UUID/hash pairs only.';

create or replace function directsign_private.directsign_prevent_contract_event_checkpoint_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and (
       pg_catalog.current_setting(
         'directsign.privacy_retention_purge', true
       ) = 'on'
       or not exists (
         select 1
         from public.contract_events as event
         where event.contract_id = old.contract_id
       )
     ) then
    return old;
  end if;

  raise exception using
    errcode = '55000',
    message = 'DIRECTSIGN_CONTRACT_EVENT_CHECKPOINT_APPEND_ONLY',
    detail = 'Contract event checkpoints cannot be changed before their linked evidence is purged.';
end;
$$;

drop trigger if exists contract_event_chain_checkpoints_prevent_mutation
  on public.contract_event_chain_checkpoints;
create trigger contract_event_chain_checkpoints_prevent_mutation
before update or delete on public.contract_event_chain_checkpoints
for each row execute function
  directsign_private.directsign_prevent_contract_event_checkpoint_mutation();

revoke all on function
  directsign_private.directsign_prevent_contract_event_checkpoint_mutation()
from public, anon, authenticated, service_role;

create or replace function directsign_private.directsign_ensure_contract_event_checkpoint(
  p_contract_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_event_count bigint;
  v_reachable_count bigint;
  v_head_count bigint;
  v_heads jsonb;
  v_head_lines text;
  v_snapshot jsonb;
  v_canonical_bytes text;
  v_checkpoint_hash text;
  v_existing public.contract_event_chain_checkpoints%rowtype;
begin
  if p_contract_id is null then
    raise exception using
      errcode = '22004',
      message = 'DIRECTSIGN_CONTRACT_EVENT_CHECKPOINT_CONTRACT_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_contract_id::text, 514778219)
  );

  if not exists (
    select 1 from public.contracts as contract
    where contract.id = p_contract_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'DIRECTSIGN_CONTRACT_EVENT_CHECKPOINT_CONTRACT_NOT_FOUND';
  end if;

  -- No legacy evidence is repaired or normalized. Reject malformed input and
  -- commit only the exact immutable bytes already present.
  if exists (
    select 1
    from public.contract_events as event
    where event.contract_id = p_contract_id
      and event.chain_generation = 0
      and (
        event.event_hash is null
        or event.event_hash !~ '^[0-9a-f]{64}$'
        or (
          event.previous_event_hash is not null
          and event.previous_event_hash !~ '^[0-9a-f]{64}$'
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'DIRECTSIGN_LEGACY_AUDIT_HASH_INVALID',
      detail = 'Generation-zero audit evidence contains a missing or malformed hash.';
  end if;

  if exists (
    select event.event_hash
    from public.contract_events as event
    where event.contract_id = p_contract_id
      and event.chain_generation = 0
    group by event.event_hash
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'DIRECTSIGN_LEGACY_AUDIT_HASH_DUPLICATE',
      detail = 'Generation-zero audit evidence reuses an event hash.';
  end if;

  if exists (
    select 1
    from public.contract_events as event
    where event.contract_id = p_contract_id
      and event.chain_generation = 0
      and event.previous_event_hash is not null
      and not exists (
        select 1
        from public.contract_events as predecessor
        where predecessor.contract_id = event.contract_id
          and predecessor.chain_generation = 0
          and predecessor.event_hash = event.previous_event_hash
      )
  ) then
    raise exception using
      errcode = '23503',
      message = 'DIRECTSIGN_LEGACY_AUDIT_PREDECESSOR_MISSING',
      detail = 'Generation-zero audit evidence references a missing predecessor.';
  end if;

  select pg_catalog.count(*)::bigint
    into v_event_count
  from public.contract_events as event
  where event.contract_id = p_contract_id
    and event.chain_generation = 0;

  -- Every valid predecessor graph is reachable forward from one of its NULL
  -- roots. Comparing the recursive coverage catches a cycle even when that
  -- cycle has an outward tail/head alongside a separate valid component.
  with recursive reachable as (
    select root.id, root.event_hash
    from public.contract_events as root
    where root.contract_id = p_contract_id
      and root.chain_generation = 0
      and root.previous_event_hash is null

    union

    select child.id, child.event_hash
    from public.contract_events as child
    join reachable as predecessor
      on predecessor.event_hash = child.previous_event_hash
    where child.contract_id = p_contract_id
      and child.chain_generation = 0
  )
  select pg_catalog.count(*)::bigint
    into v_reachable_count
  from reachable;

  if v_reachable_count <> v_event_count then
    raise exception using
      errcode = '23514',
      message = 'DIRECTSIGN_LEGACY_AUDIT_CYCLE_DETECTED',
      detail = 'Generation-zero audit evidence is not fully reachable from its immutable roots.';
  end if;

  select
    pg_catalog.count(*)::bigint,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'event_id', head.id::text,
          'event_hash', head.event_hash
        )
        order by head.id::text, head.event_hash
      ),
      '[]'::jsonb
    ),
    coalesce(
      pg_catalog.string_agg(
        head.id::text || ':' || head.event_hash,
        E'\n' order by head.id::text, head.event_hash
      ),
      ''
    )
  into v_head_count, v_heads, v_head_lines
  from public.contract_events as head
  where head.contract_id = p_contract_id
    and head.chain_generation = 0
    and not exists (
      select 1
      from public.contract_events as child
      where child.contract_id = head.contract_id
        and child.chain_generation = 0
        and child.previous_event_hash = head.event_hash
    );

  if v_event_count > 0 and v_head_count = 0 then
    raise exception using
      errcode = '23514',
      message = 'DIRECTSIGN_LEGACY_AUDIT_CYCLE_DETECTED',
      detail = 'Generation-zero audit evidence has no terminal head.';
  end if;

  v_snapshot := pg_catalog.jsonb_build_object(
    'canonical_version', 1,
    'contract_id', p_contract_id::text,
    'source_generation', 0,
    'target_generation', 1,
    'event_count', v_event_count,
    'head_count', v_head_count,
    'heads', v_heads
  );

  -- UUIDs and SHA-256 hashes have fixed widths, so the sorted newline format
  -- is unambiguous. The domain and contract UUID prevent reuse across resource
  -- kinds or contracts.
  v_canonical_bytes :=
      'directsign.contract-event-chain-checkpoint.v1' || E'\n'
    || 'contract_id=' || p_contract_id::text || E'\n'
    || 'source_generation=0' || E'\n'
    || 'target_generation=1' || E'\n'
    || 'event_count=' || v_event_count::text || E'\n'
    || 'head_count=' || v_head_count::text || E'\n'
    || 'heads:' || E'\n'
    || v_head_lines;

  v_checkpoint_hash := pg_catalog.encode(
    extensions.digest(v_canonical_bytes, 'sha256'),
    'hex'
  );

  insert into public.contract_event_chain_checkpoints (
    contract_id,
    generation,
    source_generation,
    source_event_count,
    source_head_count,
    source_snapshot,
    checkpoint_hash
  ) values (
    p_contract_id,
    1,
    0,
    v_event_count,
    v_head_count,
    v_snapshot,
    v_checkpoint_hash
  )
  on conflict (contract_id, generation) do nothing;

  select checkpoint.*
    into strict v_existing
  from public.contract_event_chain_checkpoints as checkpoint
  where checkpoint.contract_id = p_contract_id
    and checkpoint.generation = 1;

  if v_existing.source_generation <> 0
     or v_existing.source_event_count <> v_event_count
     or v_existing.source_head_count <> v_head_count
     or v_existing.source_snapshot <> v_snapshot
     or v_existing.checkpoint_hash <> v_checkpoint_hash then
    raise exception using
      errcode = '23514',
      message = 'DIRECTSIGN_CONTRACT_EVENT_CHECKPOINT_DRIFT',
      detail = 'The immutable generation-zero snapshot differs from its existing checkpoint.';
  end if;

  return v_checkpoint_hash;
end;
$$;

revoke all on function
  directsign_private.directsign_ensure_contract_event_checkpoint(uuid)
from public, anon, authenticated, service_role;

comment on function
  directsign_private.directsign_ensure_contract_event_checkpoint(uuid) is
  'Owner-only deterministic writer/verifier for PII-free generation-zero contract-event checkpoints.';

-- Create one checkpoint for every existing contract, including an empty
-- checkpoint for contracts without events. This gives clean and forked legacy
-- chains identical generation-boundary semantics.
do $$
declare
  v_contract record;
begin
  for v_contract in
    select contract.id
    from public.contracts as contract
    order by contract.id
  loop
    perform directsign_private.directsign_ensure_contract_event_checkpoint(
      v_contract.id
    );
  end loop;
end;
$$;

drop index if exists public.contract_events_chain_lookup_idx;
create index contract_events_chain_lookup_idx
  on public.contract_events (
    contract_id,
    chain_generation,
    previous_event_hash
  );

-- Legacy generation zero intentionally permits its historical roots/forks.
-- Generation one has one successor per predecessor and unique event hashes.
drop index if exists public.contract_events_one_successor_idx;
create unique index contract_events_one_successor_idx
  on public.contract_events (
    contract_id,
    chain_generation,
    coalesce(previous_event_hash, '__DIRECTSIGN_ROOT__')
  )
  where chain_generation >= 1;

create unique index if not exists contract_events_generation_hash_unique_idx
  on public.contract_events (contract_id, chain_generation, event_hash)
  where chain_generation >= 1;

create or replace function public.directsign_set_contract_event_hash()
returns trigger
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_checkpoint_hash text;
  v_previous_hash text;
  v_head_count bigint;
  v_generation_event_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.contract_id::text, 514778219)
  );

  new.chain_generation := 1;
  v_checkpoint_hash :=
    directsign_private.directsign_ensure_contract_event_checkpoint(
      new.contract_id
    );

  -- Detect any out-of-band corruption before extending generation one.
  if exists (
    select 1
    from public.contract_events as event
    where event.contract_id = new.contract_id
      and event.chain_generation = 1
      and event.previous_event_hash is distinct from v_checkpoint_hash
      and not exists (
        select 1
        from public.contract_events as predecessor
        where predecessor.contract_id = event.contract_id
          and predecessor.chain_generation = 1
          and predecessor.event_hash = event.previous_event_hash
      )
  ) then
    raise exception using
      errcode = '23503',
      message = 'DIRECTSIGN_AUDIT_CHAIN_PREDECESSOR_MISSING';
  end if;

  select
    pg_catalog.count(*)::bigint,
    pg_catalog.max(head.event_hash)
  into v_head_count, v_previous_hash
  from public.contract_events as head
  where head.contract_id = new.contract_id
    and head.chain_generation = 1
    and not exists (
      select 1
      from public.contract_events as child
      where child.contract_id = head.contract_id
        and child.chain_generation = 1
        and child.previous_event_hash = head.event_hash
    );

  select pg_catalog.count(*)::bigint
    into v_generation_event_count
  from public.contract_events as event
  where event.contract_id = new.contract_id
    and event.chain_generation = 1;

  if v_generation_event_count = 0 then
    v_previous_hash := v_checkpoint_hash;
  elsif v_head_count <> 1 then
    raise exception using
      errcode = '23505',
      message = 'DIRECTSIGN_AUDIT_GENERATION_REPAIR_REQUIRED',
      detail = 'Generation one must have exactly one unreferenced head.';
  end if;

  new.previous_event_hash := v_previous_hash;
  new.event_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.concat_ws(
        '|',
        'directsign.contract-event.v2',
        new.chain_generation::text,
        new.id::text,
        new.contract_id::text,
        coalesce(new.actor_profile_id::text, ''),
        coalesce(new.actor_role, ''),
        new.event_type,
        coalesce(new.target_type, ''),
        coalesce(new.target_id::text, ''),
        new.payload::text,
        coalesce(new.previous_event_hash, ''),
        new.created_at::text
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

-- Support-access history has no production forks. Preserve its existing hash
-- format and retention behavior while adding the same per-request serialization
-- that was originally reviewed for this migration.
create index if not exists support_access_events_chain_lookup_idx
  on public.support_access_events (
    support_access_request_id,
    previous_event_hash
  );

do $$
begin
  if exists (
    select 1
    from public.support_access_events
    group by
      support_access_request_id,
      coalesce(previous_event_hash, '__DIRECTSIGN_ROOT__')
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'DIRECTSIGN_SUPPORT_AUDIT_CHAIN_REPAIR_REQUIRED',
      detail = 'Existing support access event chains contain multiple roots or successors.',
      hint = 'Stop deployment and preserve the affected evidence for manual incident review.';
  end if;
end;
$$;

create unique index if not exists support_access_events_one_successor_idx
  on public.support_access_events (
    support_access_request_id,
    coalesce(previous_event_hash, '__DIRECTSIGN_ROOT__')
  );

create or replace function public.directsign_set_support_access_event_hash()
returns trigger
language plpgsql
set search_path = 'public', 'extensions'
set lock_timeout = '5s'
as $$
declare
  v_previous_hash text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.support_access_request_id::text, 914663721)
  );

  select event.event_hash
  into v_previous_hash
  from public.support_access_events as event
  where event.support_access_request_id = new.support_access_request_id
    and event.event_hash is not null
    and not exists (
      select 1
      from public.support_access_events as child
      where child.support_access_request_id = new.support_access_request_id
        and child.previous_event_hash = event.event_hash
    )
  order by event.created_at desc, event.id desc
  limit 1;

  new.previous_event_hash := v_previous_hash;
  new.event_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.concat_ws(
        '|',
        new.id::text,
        new.support_access_request_id::text,
        new.contract_id,
        new.action,
        new.actor_role,
        coalesce(new.actor_profile_id::text, ''),
        coalesce(new.actor_name, ''),
        new.description,
        coalesce(new.ip, ''),
        coalesce(new.user_agent, ''),
        coalesce(new.previous_event_hash, ''),
        new.created_at::text
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

drop trigger if exists support_access_events_set_hash
  on public.support_access_events;
create trigger support_access_events_set_hash
before insert on public.support_access_events
for each row execute function public.directsign_set_support_access_event_hash();

revoke all on function public.directsign_set_contract_event_hash()
  from public, anon, authenticated;
revoke all on function public.directsign_set_support_access_event_hash()
  from public, anon, authenticated;

comment on function public.directsign_set_contract_event_hash() is
  'Serializes generation-one contract audit evidence after a deterministic immutable legacy checkpoint.';
comment on function public.directsign_set_support_access_event_hash() is
  'Serializes each support-access audit chain and server-authors its canonical predecessor and hash.';
