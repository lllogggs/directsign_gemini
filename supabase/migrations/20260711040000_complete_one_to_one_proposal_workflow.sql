-- Complete the mutual 1:1 proposal lifecycle and keep contract evidence behind
-- the server API. Campaign applications continue to convert directly to their
-- selected-person fixed contract; ordinary 1:1 proposals require acceptance.

alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_status_allowed;

alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_status_allowed check (
    status in (
      'submitted',
      'reviewed',
      'accepted',
      'declined',
      'converted_to_contract',
      'closed'
    )
  );

create unique index if not exists marketplace_contact_proposals_converted_contract_unique
  on public.marketplace_contact_proposals (converted_contract_id)
  where converted_contract_id is not null;

drop policy if exists contract_snapshots_select_accessible
  on public.contract_snapshots;
drop policy if exists signatures_select_accessible
  on public.signatures;
drop policy if exists contract_files_select_accessible
  on public.contract_files;
drop policy if exists contract_events_select_accessible
  on public.contract_events;

revoke all on table
  public.contract_snapshots,
  public.signatures,
  public.contract_files,
  public.contract_events
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.contract_snapshots,
  public.signatures,
  public.contract_files,
  public.contract_events
to service_role;

comment on table public.contract_events is
  'Append-only contract audit ledger. Raw rows are service-role only; customer views are returned by scoped no-store server APIs.';
