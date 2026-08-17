begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.publish_marketplace_campaign_cas(
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_campaign_data jsonb,
  p_publication_request_key text,
  p_expected_updated_at timestamptz default null
)
returns table (
  result_allowed boolean,
  result_created boolean,
  result_campaign_id text,
  result_brand_profile_id uuid,
  result_campaign_data jsonb,
  result_status text,
  result_first_published_at timestamptz,
  result_organization_campaign_sequence bigint,
  result_verification_gate_basis text,
  result_published_count bigint,
  result_business_verified boolean
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  -- Match the pre-CAS publication function's lock order so a rolling deploy
  -- cannot deadlock an older instance that already owns the organization
  -- publication counter before it reaches the brand mirror update.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'marketplace-campaign-publication:' || p_organization_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('marketplace-campaign:' || p_campaign_id, 0)
  );
  select campaign.*
  into v_campaign
  from public.marketplace_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.organization_id = p_organization_id
    and campaign.brand_profile_id = p_brand_profile_id
    and campaign.archived_at is null
  for update;

  if found then
    if v_campaign.organization_campaign_sequence is not null
      and v_campaign.publication_request_key = p_publication_request_key then
      -- Provider-response retries retain the original idempotent behavior.
      null;
    elsif p_expected_updated_at is null
      or v_campaign.updated_at is distinct from p_expected_updated_at
      or v_campaign.status <> 'draft' then
      raise exception using
        errcode = '40001',
        message = 'MARKETPLACE_CAMPAIGN_VERSION_CONFLICT';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception using
      errcode = '40001',
      message = 'MARKETPLACE_CAMPAIGN_VERSION_CONFLICT';
  end if;

  perform 1
  from public.marketplace_brand_profiles as brand
  where brand.id = p_brand_profile_id
    and brand.organization_id = p_organization_id
  for update;

  return query
  select *
  from public.publish_marketplace_campaign(
    p_campaign_id,
    p_brand_profile_id,
    p_organization_id,
    p_actor_profile_id,
    p_campaign_data,
    p_publication_request_key
  );
end;
$$;

create or replace function public.finalize_marketplace_campaign_recruitment_cas(
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_campaign_data jsonb,
  p_expected_updated_at timestamptz
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
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'campaign revision is required';
  end if;

  select campaign.*
  into v_campaign
  from public.marketplace_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.organization_id = p_organization_id
    and campaign.brand_profile_id = p_brand_profile_id
    and campaign.archived_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign not found';
  end if;
  if v_campaign.updated_at is distinct from p_expected_updated_at
    or v_campaign.status <> 'open' then
    raise exception using
      errcode = '40001',
      message = 'MARKETPLACE_CAMPAIGN_VERSION_CONFLICT';
  end if;

  perform 1
  from public.marketplace_brand_profiles as brand
  where brand.id = p_brand_profile_id
    and brand.organization_id = p_organization_id
  for update;

  return query
  select *
  from public.finalize_marketplace_campaign_recruitment(
    p_campaign_id,
    p_brand_profile_id,
    p_organization_id,
    p_actor_profile_id,
    p_campaign_data
  );
end;
$$;

create or replace function public.transition_marketplace_campaign_status_cas(
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_target_status text,
  p_campaign_data jsonb,
  p_expected_updated_at timestamptz
)
returns table (
  outcome text,
  result_campaign_data jsonb,
  result_status text,
  result_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_selected_applications integer := 0;
  v_selected_contracts integer := 0;
  v_all_selected_contracts_completed boolean := false;
  v_every_selected_application_has_completed_contract boolean := false;
  v_campaign_data jsonb;
  v_mirror jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_expected_updated_at is null
    or p_actor_profile_id is null
    or p_target_status not in ('open', 'ended')
    or jsonb_typeof(p_campaign_data) is distinct from 'object'
    or p_campaign_data ->> 'id' is distinct from p_campaign_id then
    raise exception using errcode = '22023', message = 'invalid campaign transition input';
  end if;

  select campaign.*
  into v_campaign
  from public.marketplace_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.organization_id = p_organization_id
    and campaign.brand_profile_id = p_brand_profile_id
    and campaign.archived_at is null
  for update;
  if not found then
    return query select 'not_found', null::jsonb, null::text, null::timestamptz;
    return;
  end if;
  if v_campaign.updated_at is distinct from p_expected_updated_at then
    return query select 'version_conflict', null::jsonb, v_campaign.status, v_campaign.updated_at;
    return;
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
    raise exception using errcode = '42501', message = 'campaign transition actor is not authorized';
  end if;

  -- Selection/finalization RPCs use the same campaign-first lock order. Once
  -- this row is locked, their proposal/contract mutations cannot cross this
  -- authoritative status check.
  perform 1
  from public.marketplace_contact_proposals as application
  where application.direction = 'influencer_to_brand'
    and application.campaign_id = p_campaign_id
  for update;
  perform 1
  from public.contracts as contract
  where contract.workflow_source = 'marketplace_campaign'
    and contract.marketplace_campaign_id = p_campaign_id
    and contract.deleted_at is null
  for update;

  select count(*)::integer
  into v_selected_applications
  from public.marketplace_contact_proposals as application
  where application.direction = 'influencer_to_brand'
    and application.campaign_id = p_campaign_id
    and (
      application.status in ('accepted', 'converted_to_contract')
      or application.converted_contract_id is not null
    );

  select
    count(*)::integer,
    coalesce(bool_and(contract.status::text = 'completed'), false)
  into v_selected_contracts, v_all_selected_contracts_completed
  from public.contracts as contract
  where contract.workflow_source = 'marketplace_campaign'
    and contract.marketplace_campaign_id = p_campaign_id
    and contract.deleted_at is null;

  select not exists (
    select 1
    from public.marketplace_contact_proposals as application
    where application.direction = 'influencer_to_brand'
      and application.campaign_id = p_campaign_id
      and (
        application.status in ('accepted', 'converted_to_contract')
        or application.converted_contract_id is not null
      )
      and not exists (
        select 1
        from public.contracts as contract
        where contract.workflow_source = 'marketplace_campaign'
          and contract.marketplace_campaign_id = p_campaign_id
          and contract.deleted_at is null
          and contract.status::text = 'completed'
          and (
            contract.source_application_id = application.id::text
            or (
              application.converted_contract_id is not null
              and contract.id = application.converted_contract_id
            )
          )
      )
  )
  into v_every_selected_application_has_completed_contract;

  if p_target_status = 'open' then
    if v_campaign.status not in ('closed', 'ended')
      or v_selected_applications > 0
      or v_selected_contracts > 0 then
      return query select 'invalid_transition', v_campaign.campaign_data, v_campaign.status, v_campaign.updated_at;
      return;
    end if;
  elsif p_target_status = 'ended' then
    if v_campaign.status <> 'closed'
      or v_selected_applications < 1
      or v_selected_contracts < 1
      or not v_all_selected_contracts_completed
      or not v_every_selected_application_has_completed_contract then
      return query select 'invalid_transition', v_campaign.campaign_data, v_campaign.status, v_campaign.updated_at;
      return;
    end if;
  end if;

  v_campaign_data := p_campaign_data || jsonb_build_object(
    'id', p_campaign_id,
    'status', p_target_status,
    'updatedAt', v_now,
    'statusUpdatedAt', v_now,
    'statusUpdatedByProfileId', p_actor_profile_id
  );
  update public.marketplace_campaigns as campaign
  set
    campaign_data = v_campaign_data,
    status = p_target_status,
    updated_at = v_now
  where campaign.id = p_campaign_id
  returning campaign.* into v_campaign;

  perform 1
  from public.marketplace_brand_profiles as brand
  where brand.id = p_brand_profile_id
    and brand.organization_id = p_organization_id
  for update;
  select coalesce(
    jsonb_agg(mirror.campaign_document order by mirror.created_at desc, mirror.id desc),
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
  ) as mirror;
  update public.marketplace_brand_profiles as brand
  set
    active_campaigns = v_mirror,
    status_label = case when p_target_status = 'open' then '모집 중' else '운영 종료' end,
    updated_at = v_now
  where brand.id = p_brand_profile_id
    and brand.organization_id = p_organization_id;

  return query select 'updated', v_campaign.campaign_data, v_campaign.status, v_campaign.updated_at;
end;
$$;

revoke all on function public.publish_marketplace_campaign_cas(
  text, uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.finalize_marketplace_campaign_recruitment_cas(
  text, uuid, uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.transition_marketplace_campaign_status_cas(
  text, uuid, uuid, uuid, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.publish_marketplace_campaign_cas(
  text, uuid, uuid, uuid, jsonb, text, timestamptz
) to service_role;
grant execute on function public.finalize_marketplace_campaign_recruitment_cas(
  text, uuid, uuid, uuid, jsonb, timestamptz
) to service_role;
grant execute on function public.transition_marketplace_campaign_status_cas(
  text, uuid, uuid, uuid, text, jsonb, timestamptz
) to service_role;

comment on function public.transition_marketplace_campaign_status_cas(
  text, uuid, uuid, uuid, text, jsonb, timestamptz
) is
  'Serializes campaign reopen/end transitions with applicant selection and selected-person contract completion.';

commit;
