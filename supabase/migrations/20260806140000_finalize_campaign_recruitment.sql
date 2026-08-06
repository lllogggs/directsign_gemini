-- Finalize campaign recruitment as one database transaction. The public
-- campaign closes first so its durable campaign-status Bell snapshot captures
-- every still-pending applicant; those same applications then become the
-- customer-facing "미선정" outcome (internal status: declined).

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.finalize_marketplace_campaign_recruitment(
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_campaign_data jsonb
)
returns table (
  result_campaign_id text,
  result_campaign_data jsonb,
  result_status text,
  result_not_selected_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
  v_now timestamptz := clock_timestamp();
  v_campaign_data jsonb;
  v_mirror jsonb;
  v_not_selected_count bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if btrim(coalesce(p_campaign_id, '')) = ''
    or p_brand_profile_id is null
    or p_organization_id is null
    or p_actor_profile_id is null
    or jsonb_typeof(p_campaign_data) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'complete campaign recruitment finalization input is required';
  end if;

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
  if v_campaign.status not in ('open', 'draft', 'closed') then
    raise exception using
      errcode = '55000',
      message = 'campaign recruitment cannot be finalized from the current status';
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
    where brand.id = p_brand_profile_id
      and brand.organization_id = p_organization_id
      and brand.archived_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'campaign recruitment finalization actor is not authorized';
  end if;

  v_campaign_data := p_campaign_data || jsonb_build_object(
    'id', p_campaign_id,
    'status', 'closed',
    'updatedAt', v_now,
    'statusUpdatedAt', v_now,
    'statusUpdatedByProfileId', p_actor_profile_id
  );

  -- Keep this update before the application transition. The existing durable
  -- campaign-status trigger snapshots submitted/reviewed applicants in the
  -- same transaction and delivers their Bell result without using messages.
  update public.marketplace_campaigns
  set
    campaign_data = v_campaign_data,
    status = 'closed',
    updated_at = v_now
  where id = p_campaign_id
    and brand_profile_id = p_brand_profile_id
    and organization_id = p_organization_id
  returning * into v_campaign;

  update public.marketplace_contact_proposals as application
  set
    status = 'declined',
    updated_at = v_now
  where application.direction = 'influencer_to_brand'
    and application.campaign_id = p_campaign_id
    and application.target_brand_profile_id = p_brand_profile_id
    and application.converted_contract_id is null
    and application.status in ('submitted', 'reviewed');
  get diagnostics v_not_selected_count = row_count;

  select coalesce(
    jsonb_agg(
      mirror_row.campaign_document
      order by mirror_row.created_at desc, mirror_row.id desc
    ),
    '[]'::jsonb
  )
  into v_mirror
  from (
    select
      campaign.id,
      campaign.created_at,
      campaign.campaign_data || jsonb_build_object(
        'id', campaign.id,
        'status', campaign.status,
        'createdAt', campaign.created_at,
        'updatedAt', campaign.updated_at
      ) as campaign_document
    from public.marketplace_campaigns as campaign
    where campaign.brand_profile_id = p_brand_profile_id
      and campaign.archived_at is null
    order by campaign.created_at desc, campaign.id desc
    limit 20
  ) as mirror_row;

  update public.marketplace_brand_profiles
  set
    active_campaigns = v_mirror,
    status_label = '모집 종료',
    updated_at = v_now
  where id = p_brand_profile_id
    and organization_id = p_organization_id;

  return query select
    v_campaign.id,
    v_campaign.campaign_data,
    v_campaign.status,
    v_not_selected_count;
end;
$$;

revoke execute on function public.finalize_marketplace_campaign_recruitment(
  text, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.finalize_marketplace_campaign_recruitment(
  text, uuid, uuid, uuid, jsonb
) to service_role;

comment on function public.finalize_marketplace_campaign_recruitment(
  text, uuid, uuid, uuid, jsonb
) is
  'Atomically closes campaign recruitment and finalizes every non-selected application as the internal declined / customer-facing 미선정 outcome.';
