alter function public.directsign_touch_updated_at()
set search_path = public;

alter function public.directsign_set_contract_event_hash()
set search_path = public, extensions;

alter function public.directsign_prevent_contract_event_mutation()
set search_path = public;

revoke execute on function public.directsign_is_admin()
from public, anon;

revoke execute on function public.directsign_is_org_member(uuid)
from public, anon;

revoke execute on function public.directsign_can_access_contract(uuid)
from public, anon;

revoke execute on function public.directsign_can_manage_contract(uuid)
from public, anon;

revoke execute on function public.directsign_can_respond_to_contract(uuid)
from public, anon;

grant execute on function public.directsign_is_admin()
to authenticated, service_role;

grant execute on function public.directsign_is_org_member(uuid)
to authenticated, service_role;

grant execute on function public.directsign_can_access_contract(uuid)
to authenticated, service_role;

grant execute on function public.directsign_can_manage_contract(uuid)
to authenticated, service_role;

grant execute on function public.directsign_can_respond_to_contract(uuid)
to authenticated, service_role;

revoke execute on function public.directsign_public_contract_preview(text)
from public, anon, authenticated;

grant execute on function public.directsign_public_contract_preview(text)
to service_role;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end
$$;
