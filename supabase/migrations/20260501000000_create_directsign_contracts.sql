create table if not exists public.directsign_contracts (
  id text primary key,
  advertiser_id text not null,
  title text not null,
  status text not null check (status in ('DRAFT', 'REVIEWING', 'NEGOTIATING', 'APPROVED', 'SIGNED')),
  influencer_name text,
  share_token text unique,
  share_token_status text not null default 'not_issued' check (share_token_status in ('not_issued', 'active', 'expired', 'revoked')),
  contract jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists directsign_contracts_updated_at_idx
  on public.directsign_contracts (updated_at desc);

create index if not exists directsign_contracts_status_idx
  on public.directsign_contracts (status);

create index if not exists directsign_contracts_advertiser_id_idx
  on public.directsign_contracts (advertiser_id);

create index if not exists directsign_contracts_share_token_idx
  on public.directsign_contracts (share_token)
  where share_token is not null;

alter table public.directsign_contracts enable row level security;

drop policy if exists "directsign_contracts_no_direct_client_access"
  on public.directsign_contracts;

create policy "directsign_contracts_no_direct_client_access"
  on public.directsign_contracts
  for all
  using (false)
  with check (false);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.directsign_contracts to service_role;

comment on table public.directsign_contracts is
  'DirectSign contract ledger. Access is expected through the DirectSign server using a Supabase service role key.';
