create table if not exists public.directsign_rate_limit_buckets (
  bucket_key text primary key,
  attempt_count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint directsign_rate_limit_attempt_count_non_negative
    check (attempt_count >= 0),
  constraint directsign_rate_limit_bucket_key_not_blank
    check (btrim(bucket_key) <> '')
);

create index if not exists directsign_rate_limit_buckets_reset_idx
  on public.directsign_rate_limit_buckets (reset_at);

alter table public.directsign_rate_limit_buckets enable row level security;

create or replace function public.consume_directsign_rate_limit(
  p_bucket_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  current_reset timestamptz;
begin
  if btrim(coalesce(p_bucket_key, '')) = '' then
    raise exception 'bucket key is required';
  end if;
  if p_max_attempts < 1 or p_window_seconds < 1 then
    raise exception 'rate limit bounds must be positive';
  end if;

  insert into public.directsign_rate_limit_buckets (
    bucket_key,
    attempt_count,
    reset_at,
    updated_at
  )
  values (
    p_bucket_key,
    1,
    now() + make_interval(secs => p_window_seconds),
    now()
  )
  on conflict (bucket_key) do update
  set
    attempt_count = case
      when directsign_rate_limit_buckets.reset_at <= now() then 1
      else directsign_rate_limit_buckets.attempt_count + 1
    end,
    reset_at = case
      when directsign_rate_limit_buckets.reset_at <= now()
        then now() + make_interval(secs => p_window_seconds)
      else directsign_rate_limit_buckets.reset_at
    end,
    updated_at = now()
  returning attempt_count, reset_at into current_count, current_reset;

  return query
  select
    current_count > p_max_attempts,
    greatest(
      0,
      ceil(extract(epoch from (current_reset - now())))::integer
    );
end;
$$;

revoke all on table public.directsign_rate_limit_buckets
  from public, anon, authenticated;
grant select, insert, update, delete on table public.directsign_rate_limit_buckets
  to service_role;

revoke execute on function public.consume_directsign_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_directsign_rate_limit(text, integer, integer)
  to service_role;

comment on table public.directsign_rate_limit_buckets is
  'Hashed cross-instance login and sensitive endpoint throttling buckets. Service-role only.';
