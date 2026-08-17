-- Cross-instance quota reservation for content evidence uploads.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.directsign_deliverable_upload_reservations (
  id uuid primary key,
  contract_id uuid not null references public.contracts (id) on delete cascade,
  creator_profile_id uuid not null references public.profiles (id) on delete cascade,
  byte_size bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint directsign_deliverable_upload_reservation_bytes_non_negative
    check (byte_size >= 0),
  constraint directsign_deliverable_upload_reservation_expiry_order
    check (expires_at > created_at)
);

create index if not exists directsign_deliverable_upload_reservations_contract_idx
  on public.directsign_deliverable_upload_reservations (contract_id, expires_at);
create index if not exists directsign_deliverable_upload_reservations_creator_idx
  on public.directsign_deliverable_upload_reservations (creator_profile_id, expires_at);

alter table public.directsign_deliverable_upload_reservations enable row level security;
revoke all on table public.directsign_deliverable_upload_reservations
  from public, anon, authenticated;
grant select, insert, delete on table public.directsign_deliverable_upload_reservations
  to service_role;

create or replace function public.reserve_directsign_deliverable_upload(
  p_reservation_id uuid,
  p_contract_id uuid,
  p_creator_profile_id uuid,
  p_byte_size bigint,
  p_max_deliverables integer,
  p_max_contract_bytes bigint,
  p_max_creator_daily_bytes bigint,
  p_ttl_seconds integer default 900
)
returns table (
  outcome text,
  deliverable_count integer,
  contract_bytes bigint,
  creator_daily_bytes bigint
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_day_start timestamptz := date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_status text;
  v_deliverable_count integer := 0;
  v_contract_bytes bigint := 0;
  v_creator_daily_bytes bigint := 0;
begin
  if p_reservation_id is null
    or p_contract_id is null
    or p_creator_profile_id is null
    or p_byte_size is null
    or p_byte_size < 0
    or p_max_deliverables <= 0
    or p_max_contract_bytes <= 0
    or p_max_creator_daily_bytes <= 0
    or p_ttl_seconds < 30
    or p_ttl_seconds > 3600 then
    raise exception using errcode = '22023', message = 'invalid deliverable quota reservation input';
  end if;

  -- Contract row lock serializes close and every reservation for this contract.
  select contract.status::text
  into v_status
  from public.contracts as contract
  where contract.id = p_contract_id
    and contract.deleted_at is null
  for update;

  if v_status is null then
    return query select 'contract_not_found', 0, 0::bigint, 0::bigint;
    return;
  end if;
  if v_status <> 'active' then
    return query select 'contract_not_active', 0, 0::bigint, 0::bigint;
    return;
  end if;

  -- One creator-wide daily lock closes the multi-contract quota race.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_creator_profile_id::text || ':' || v_day_start::date::text,
      0
    )
  );

  delete from public.directsign_deliverable_upload_reservations as reservation
  where reservation.expires_at <= v_now;

  select (
      select count(*)::integer
      from public.deliverables as deliverable
      where deliverable.contract_id = p_contract_id
    ) + (
      select count(*)::integer
      from public.directsign_deliverable_upload_reservations as reservation
      where reservation.contract_id = p_contract_id
        and reservation.expires_at > v_now
    )
  into v_deliverable_count;

  select coalesce((
      select sum(coalesce(file.byte_size, 0))::bigint
      from public.contract_files as file
      where file.contract_id = p_contract_id
        and file.related_type = 'deliverable'
    ), 0) + coalesce((
      select sum(reservation.byte_size)::bigint
      from public.directsign_deliverable_upload_reservations as reservation
      where reservation.contract_id = p_contract_id
        and reservation.expires_at > v_now
    ), 0)
  into v_contract_bytes;

  select coalesce((
      select sum(coalesce(file.byte_size, 0))::bigint
      from public.contract_files as file
      where file.uploaded_by_profile_id = p_creator_profile_id
        and file.related_type = 'deliverable'
        and file.created_at >= v_day_start
    ), 0) + coalesce((
      select sum(reservation.byte_size)::bigint
      from public.directsign_deliverable_upload_reservations as reservation
      where reservation.creator_profile_id = p_creator_profile_id
        and reservation.created_at >= v_day_start
        and reservation.expires_at > v_now
    ), 0)
  into v_creator_daily_bytes;

  if v_deliverable_count >= p_max_deliverables then
    return query select 'deliverable_limit', v_deliverable_count, v_contract_bytes, v_creator_daily_bytes;
    return;
  end if;
  if v_contract_bytes + p_byte_size > p_max_contract_bytes
    or v_creator_daily_bytes + p_byte_size > p_max_creator_daily_bytes then
    return query select 'storage_limit', v_deliverable_count, v_contract_bytes, v_creator_daily_bytes;
    return;
  end if;

  insert into public.directsign_deliverable_upload_reservations (
    id,
    contract_id,
    creator_profile_id,
    byte_size,
    created_at,
    expires_at
  ) values (
    p_reservation_id,
    p_contract_id,
    p_creator_profile_id,
    p_byte_size,
    v_now,
    v_now + make_interval(secs => p_ttl_seconds)
  );

  return query select 'reserved', v_deliverable_count, v_contract_bytes, v_creator_daily_bytes;
end;
$$;

revoke all on function public.reserve_directsign_deliverable_upload(
  uuid, uuid, uuid, bigint, integer, bigint, bigint, integer
) from public, anon, authenticated;
grant execute on function public.reserve_directsign_deliverable_upload(
  uuid, uuid, uuid, bigint, integer, bigint, bigint, integer
) to service_role;

comment on table public.directsign_deliverable_upload_reservations is
  'Short-lived service-role-only reservations that make per-contract and per-creator content evidence quotas cross-instance safe.';
