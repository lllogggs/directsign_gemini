-- Explicitly separate operating records from QA/demo/seed records. Columns are
-- nullable so legacy rows continue through the conservative heuristic fallback
-- until they are backfilled.

alter table public.profiles
  add column if not exists data_origin text;
alter table public.directsign_contracts
  add column if not exists data_origin text;
alter table public.contracts
  add column if not exists data_origin text;
alter table public.verification_requests
  add column if not exists data_origin text;
alter table public.support_access_requests
  add column if not exists data_origin text;
alter table public.operational_support_tickets
  add column if not exists data_origin text;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'directsign_contracts',
    'contracts',
    'verification_requests',
    'support_access_requests',
    'operational_support_tickets'
  ]
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      table_name,
      table_name || '_data_origin_allowed'
    );
    execute format(
      'alter table public.%I add constraint %I check (data_origin is null or data_origin in (''production'', ''qa'', ''demo'', ''seed''))',
      table_name,
      table_name || '_data_origin_allowed'
    );
  end loop;
end;
$$;

create index if not exists directsign_contracts_data_origin_idx
  on public.directsign_contracts (data_origin, updated_at desc);
create index if not exists verification_requests_data_origin_idx
  on public.verification_requests (data_origin, created_at desc);
create index if not exists support_access_requests_data_origin_idx
  on public.support_access_requests (data_origin, created_at desc);
create index if not exists operational_support_tickets_data_origin_idx
  on public.operational_support_tickets (data_origin, created_at desc);

comment on column public.directsign_contracts.data_origin is
  'production, qa, demo, or seed. Null means a legacy row that still requires conservative classification.';
