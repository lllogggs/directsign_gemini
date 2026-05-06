-- Force security-sensitive DirectSign writes through the Express API.
--
-- The browser does not need direct Supabase Data API writes for contracts,
-- signatures, verification review state, support access, or profile/org
-- mutations. The server writes these tables with the service role after
-- applying validation, verification gates, audit logging, and private storage.

revoke insert, update, delete on table
  public.profiles,
  public.organizations,
  public.organization_members,
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
  public.support_access_requests
from anon, authenticated;

grant select on table
  public.profiles,
  public.organizations,
  public.organization_members,
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
  public.support_access_requests
to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.organizations,
  public.organization_members,
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
  public.support_access_requests
to service_role;

drop policy if exists contracts_insert_authenticated on public.contracts;
drop policy if exists contracts_update_managers on public.contracts;
drop policy if exists contract_parties_manage_contract on public.contract_parties;
drop policy if exists contract_platforms_manage_contract on public.contract_platforms;
drop policy if exists contract_pricing_terms_manage_contract on public.contract_pricing_terms;
drop policy if exists contract_clauses_manage_contract on public.contract_clauses;
drop policy if exists clause_threads_insert_accessible on public.clause_threads;
drop policy if exists clause_threads_update_managers on public.clause_threads;
drop policy if exists deliverable_requirements_manage_contract on public.deliverable_requirements;
drop policy if exists deliverables_insert_accessible on public.deliverables;
drop policy if exists deliverables_update_accessible on public.deliverables;
drop policy if exists settlement_periods_manage_contract on public.settlement_periods;
drop policy if exists settlement_reports_manage_contract on public.settlement_reports;
drop policy if exists settlement_items_manage_contract on public.settlement_items;
drop policy if exists payouts_manage_contract on public.payouts;
drop policy if exists share_links_manage_contract on public.share_links;
drop policy if exists contract_snapshots_insert_accessible on public.contract_snapshots;
drop policy if exists signatures_insert_accessible on public.signatures;
drop policy if exists contract_files_insert_accessible on public.contract_files;
drop policy if exists contract_files_update_managers on public.contract_files;
drop policy if exists contract_events_insert_accessible on public.contract_events;
drop policy if exists verification_requests_insert_related on public.verification_requests;
drop policy if exists verification_requests_insert_self_pending on public.verification_requests;
drop policy if exists verification_requests_admin_review on public.verification_requests;
drop policy if exists verification_requests_insert_admin on public.verification_requests;
drop policy if exists support_access_requests_insert_party on public.support_access_requests;
drop policy if exists support_access_requests_admin_update on public.support_access_requests;

comment on table public.contracts is
  'DirectSign contracts. Mutations are intentionally service-role only; app users go through the Express API for validation and audit gates.';
comment on table public.verification_requests is
  'Manual advertiser and influencer verification queue. Mutations are intentionally service-role only to protect review state.';
