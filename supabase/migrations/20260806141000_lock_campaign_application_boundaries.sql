-- Serialize campaign application submission, applicant selection, and
-- recruitment finalization on the same authoritative campaign row. This
-- leaves no interleaving where a submitted application or orphan contract can
-- appear after recruitment has closed.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.directsign_capture_campaign_application_submission_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
begin
  -- Callers cannot self-assert provenance, including for unrelated rows.
  new.submitted_actor_proof_at := null;
  new.converted_actor_proof_at := null;

  if new.direction = 'influencer_to_brand'
    and new.campaign_id is not null
    and new.data_origin = 'production'
    and (
      new.status is distinct from 'submitted'
      or new.converted_contract_id is not null
      or new.converted_by_profile_id is not null
      or new.converted_at is not null
    ) then
    raise exception using
      errcode = '23514',
      message = 'production campaign applications must be inserted before conversion';
  end if;

  if new.direction = 'influencer_to_brand'
    and new.campaign_id is not null
    and new.status = 'submitted' then
    -- FOR KEY SHARE conflicts with recruitment finalization's FOR UPDATE.
    -- If submission locks first, close waits and then declines the committed
    -- application. If close locks first, submission wakes to a closed status
    -- and is rejected before the proposal row can exist.
    select campaign.* into v_campaign
    from public.marketplace_campaigns as campaign
    where campaign.id = new.campaign_id
      and campaign.brand_profile_id = new.target_brand_profile_id
      and campaign.archived_at is null
    for key share;
    if not found then
      raise exception using
        errcode = '42501',
        message = 'campaign application target is not authorized';
    end if;
    if v_campaign.status <> 'open' then
      raise exception using
        errcode = '55000',
        message = 'campaign is not open for applications';
    end if;
  end if;

  if new.direction <> 'influencer_to_brand'
    or new.campaign_id is null
    or new.status <> 'submitted'
    or new.data_origin is distinct from 'production' then
    return new;
  end if;

  if new.sender_profile_id is null
    or not exists (
      select 1
      from public.profiles as sender
      join public.marketplace_brand_profiles as brand
        on brand.id = v_campaign.brand_profile_id
        and brand.organization_id = v_campaign.organization_id
        and brand.data_origin = 'production'
      where sender.id = new.sender_profile_id
        and sender.role = 'influencer'
        and sender.data_origin = 'production'
        and lower(sender.email)
          !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(sender.email)
          !~ '@(example[.](com|org|net)|directsign[.]app)$'
    ) then
    raise exception using
      errcode = '42501',
      message = 'production campaign application actor is not authorized';
  end if;

  new.submitted_actor_proof_at := clock_timestamp();
  return new;
end;
$$;

revoke execute on function public.directsign_capture_campaign_application_submission_proof()
  from public, anon, authenticated;
grant execute on function public.directsign_capture_campaign_application_submission_proof()
  to service_role;

create or replace function public.reserve_marketplace_campaign_application_selection(
  p_proposal_id uuid,
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid
)
returns table (
  result_proposal_id uuid,
  result_previous_status text,
  result_current_status text,
  result_campaign_status text,
  result_reserved boolean,
  result_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
  v_proposal public.marketplace_contact_proposals%rowtype;
  v_previous_status text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_proposal_id is null
    or btrim(coalesce(p_campaign_id, '')) = ''
    or p_brand_profile_id is null
    or p_organization_id is null
    or p_actor_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'complete campaign selection reservation input is required';
  end if;

  -- Match the close RPC's lock order: authoritative campaign first, proposal
  -- second. This avoids both orphan contracts and campaign/proposal deadlocks.
  select campaign.* into v_campaign
  from public.marketplace_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.brand_profile_id = p_brand_profile_id
    and campaign.organization_id = p_organization_id
    and campaign.archived_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign not found';
  end if;

  if not exists (
    select 1
    from public.marketplace_brand_profiles as brand
    join public.organization_members as membership
      on membership.organization_id = brand.organization_id
      and membership.profile_id = p_actor_profile_id
      and membership.role in ('owner', 'admin', 'marketer')
    join public.profiles as actor
      on actor.id = membership.profile_id
      and actor.role = 'marketer'
      and actor.data_origin = brand.data_origin
      and (
        brand.data_origin <> 'production'
        or (
          lower(actor.email)
            !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
          and lower(actor.email)
            !~ '@(example[.](com|org|net)|directsign[.]app)$'
        )
      )
    where brand.id = p_brand_profile_id
      and brand.organization_id = p_organization_id
      and brand.archived_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'campaign selection reservation actor is not authorized';
  end if;

  select proposal.* into v_proposal
  from public.marketplace_contact_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.direction = 'influencer_to_brand'
    and proposal.campaign_id = p_campaign_id
    and proposal.target_brand_profile_id = p_brand_profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign application not found';
  end if;

  v_previous_status := v_proposal.status;
  if v_proposal.status = 'converted_to_contract'
    or v_proposal.converted_contract_id is not null then
    return query select
      v_proposal.id, v_previous_status, v_proposal.status, v_campaign.status,
      false, 'already_converted'::text;
    return;
  end if;

  -- An accepted row is a durable reservation created while recruitment was
  -- open. It may finish contract creation after close, which is necessary for
  -- safe retry after a process interruption.
  if v_proposal.status = 'accepted' then
    return query select
      v_proposal.id, v_previous_status, v_proposal.status, v_campaign.status,
      false, 'already_reserved'::text;
    return;
  end if;

  if v_proposal.status not in ('submitted', 'reviewed') then
    return query select
      v_proposal.id, v_previous_status, v_proposal.status, v_campaign.status,
      false, 'application_finalized'::text;
    return;
  end if;

  if v_campaign.status <> 'open' then
    return query select
      v_proposal.id, v_previous_status, v_proposal.status, v_campaign.status,
      false, 'campaign_closed'::text;
    return;
  end if;

  update public.marketplace_contact_proposals as proposal
  set status = 'accepted', updated_at = v_now
  where proposal.id = p_proposal_id
    and proposal.status in ('submitted', 'reviewed')
  returning * into v_proposal;

  return query select
    v_proposal.id, v_previous_status, v_proposal.status, v_campaign.status,
    true, 'reserved'::text;
end;
$$;

revoke execute on function public.reserve_marketplace_campaign_application_selection(
  uuid, text, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.reserve_marketplace_campaign_application_selection(
  uuid, text, uuid, uuid, uuid
) to service_role;

comment on function public.reserve_marketplace_campaign_application_selection(
  uuid, text, uuid, uuid, uuid
) is
  'Serializes applicant selection against campaign close before any contract write can begin.';
