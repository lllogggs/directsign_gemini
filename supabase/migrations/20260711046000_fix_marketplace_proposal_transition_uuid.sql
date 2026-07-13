drop function if exists public.transition_marketplace_contact_proposal(
  uuid,
  text[],
  text,
  text
);

create or replace function public.transition_marketplace_contact_proposal(
  p_proposal_id uuid,
  p_expected_statuses text[],
  p_next_status text,
  p_converted_contract_id uuid default null
)
returns table (
  proposal_id uuid,
  previous_status text,
  current_status text,
  current_converted_contract_id uuid,
  changed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  proposal_row public.marketplace_contact_proposals%rowtype;
  status_before text;
begin
  if p_next_status not in (
    'submitted',
    'reviewed',
    'accepted',
    'declined',
    'converted_to_contract',
    'closed'
  ) then
    raise exception 'unsupported marketplace proposal status';
  end if;

  if p_next_status = 'converted_to_contract'
    and p_converted_contract_id is null then
    raise exception 'converted contract id is required';
  end if;

  select *
  into proposal_row
  from public.marketplace_contact_proposals
  where id = p_proposal_id
  for update;

  if not found then
    return;
  end if;

  status_before := proposal_row.status;
  if not (proposal_row.status = any(coalesce(p_expected_statuses, '{}'::text[]))) then
    return query select
      proposal_row.id,
      status_before,
      proposal_row.status,
      proposal_row.converted_contract_id,
      false;
    return;
  end if;

  update public.marketplace_contact_proposals
  set
    status = p_next_status,
    converted_contract_id = case
      when p_next_status = 'converted_to_contract' then p_converted_contract_id
      else converted_contract_id
    end,
    updated_at = now()
  where id = p_proposal_id
  returning * into proposal_row;

  return query select
    proposal_row.id,
    status_before,
    proposal_row.status,
    proposal_row.converted_contract_id,
    true;
end;
$$;

revoke execute on function public.transition_marketplace_contact_proposal(
  uuid,
  text[],
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.transition_marketplace_contact_proposal(
  uuid,
  text[],
  text,
  uuid
) to service_role;
