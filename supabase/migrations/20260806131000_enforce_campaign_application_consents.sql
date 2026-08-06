-- Enforce immutable consent evidence after the matching application release is live.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.directsign_protect_campaign_application_consent_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.direction = 'influencer_to_brand'
      and new.campaign_id is not null
      and new.application_consent_snapshot is null then
      raise exception using
        errcode = '23514',
        message = 'campaign application consent snapshot is required';
    end if;
    return new;
  end if;

  if new.application_consent_snapshot is distinct from old.application_consent_snapshot then
    raise exception using
      errcode = '55000',
      message = 'campaign application consent snapshot is immutable';
  end if;
  return new;
end;
$$;

revoke execute on function public.directsign_protect_campaign_application_consent_snapshot()
  from public, anon, authenticated;
grant execute on function public.directsign_protect_campaign_application_consent_snapshot()
  to service_role;
