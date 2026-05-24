alter table public.directsign_contracts
  drop constraint if exists directsign_contracts_status_check;

alter table public.directsign_contracts
  add constraint directsign_contracts_status_check
  check (status in ('DRAFT', 'REVIEWING', 'NEGOTIATING', 'APPROVED', 'SIGNED', 'CLOSED'));

comment on constraint directsign_contracts_status_check on public.directsign_contracts is
  'Allows legacy contract rows to represent the closed/ended contract lifecycle used by the dashboard.';
