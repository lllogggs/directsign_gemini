-- Contract evidence and operator support access must be written through the
-- server so signing consent, IP/user-agent, private storage, hashes, and audit
-- chains cannot be bypassed from the public Data API.

drop policy if exists contract_snapshots_insert_accessible on public.contract_snapshots;
drop policy if exists signatures_insert_accessible on public.signatures;
drop policy if exists contract_files_insert_accessible on public.contract_files;
drop policy if exists contract_files_update_managers on public.contract_files;
drop policy if exists contract_events_insert_accessible on public.contract_events;

revoke insert, update, delete on public.contract_snapshots from anon, authenticated;
revoke insert, update, delete on public.signatures from anon, authenticated;
revoke insert, update, delete on public.contract_files from anon, authenticated;
revoke insert, update, delete on public.contract_events from anon, authenticated;

grant select on public.contract_snapshots to authenticated;
grant select on public.signatures to authenticated;
grant select on public.contract_files to authenticated;
grant select on public.contract_events to authenticated;

grant select, insert, update, delete on public.contract_snapshots to service_role;
grant select, insert, update, delete on public.signatures to service_role;
grant select, insert, update, delete on public.contract_files to service_role;
grant select, insert, update, delete on public.contract_events to service_role;

drop policy if exists support_access_requests_admin_update on public.support_access_requests;
drop policy if exists support_access_requests_update_service_only on public.support_access_requests;
create policy support_access_requests_update_service_only
on public.support_access_requests for update
to service_role
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke update on public.support_access_requests from authenticated;
grant select on public.support_access_requests to authenticated;
grant select, insert, update on public.support_access_requests to service_role;

create or replace function public.directsign_prevent_support_access_request_immutable_update()
returns trigger
language plpgsql
as $$
begin
  if
    old.contract_id is distinct from new.contract_id
    or old.contract_uuid is distinct from new.contract_uuid
    or old.legacy_contract_id is distinct from new.legacy_contract_id
    or old.requester_profile_id is distinct from new.requester_profile_id
    or old.requester_role is distinct from new.requester_role
    or old.requester_name is distinct from new.requester_name
    or old.requester_email is distinct from new.requester_email
    or old.reason is distinct from new.reason
    or old.scope is distinct from new.scope
    or old.expires_at is distinct from new.expires_at
    or old.audit_events is distinct from new.audit_events
    or old.created_at is distinct from new.created_at
  then
    raise exception 'support_access_requests immutable fields cannot be changed';
  end if;

  return new;
end;
$$;

revoke execute on function public.directsign_prevent_support_access_request_immutable_update()
  from public, anon, authenticated;

drop trigger if exists support_access_requests_prevent_immutable_update
  on public.support_access_requests;
create trigger support_access_requests_prevent_immutable_update
before update on public.support_access_requests
for each row execute function public.directsign_prevent_support_access_request_immutable_update();

comment on function public.directsign_prevent_support_access_request_immutable_update()
  is 'Prevents operator support access requests from being repointed or widened after a party creates them.';
