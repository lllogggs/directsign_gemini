create or replace function public.directsign_touch_operational_support_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke execute on function public.directsign_touch_operational_support_ticket()
  from public, anon, authenticated;
grant execute on function public.directsign_touch_operational_support_ticket()
  to service_role;
