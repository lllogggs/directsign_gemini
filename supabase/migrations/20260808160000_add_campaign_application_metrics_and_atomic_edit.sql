-- Keep public campaign application metrics free of test data and make
-- post-publication campaign edits authoritative, versioned, and atomic with
-- the application state that determines which fields remain editable.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create index if not exists marketplace_campaign_valid_application_count_idx
  on public.marketplace_contact_proposals (campaign_id, status)
  where direction = 'influencer_to_brand'
    and campaign_id is not null
    and data_origin = 'production'
    and submitted_actor_proof_at is not null
    and status in ('submitted', 'reviewed', 'accepted', 'converted_to_contract');

-- The application service reads campaign terms and this revision from one
-- authoritative row. Application insertion then takes FOR KEY SHARE on that
-- same row and rejects the write if an edit committed in between. The caller
-- must reload and collect consent against the new terms instead of persisting
-- a stale snapshot.
create or replace function public.directsign_capture_campaign_application_submission_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
  v_snapshot_revision timestamptz;
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

    if new.data_origin = 'production' then
      if pg_catalog.jsonb_typeof(new.campaign_snapshot) is distinct from 'object'
        or btrim(coalesce(new.campaign_snapshot ->> 'campaignRevision', '')) = '' then
        raise exception using
          errcode = '55000',
          message = 'campaign application snapshot revision is stale';
      end if;
      begin
        v_snapshot_revision :=
          (new.campaign_snapshot ->> 'campaignRevision')::timestamptz;
      exception when others then
        raise exception using
          errcode = '55000',
          message = 'campaign application snapshot revision is stale';
      end;
      if v_snapshot_revision is distinct from v_campaign.updated_at then
        raise exception using
          errcode = '55000',
          message = 'campaign application snapshot revision is stale';
      end if;
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

create or replace function public.get_public_marketplace_campaign_application_counts(
  p_campaign_ids text[]
)
returns table (
  campaign_id text,
  application_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  if coalesce(pg_catalog.cardinality(p_campaign_ids), 0) = 0 then
    return;
  end if;

  return query
  select
    application.campaign_id,
    pg_catalog.count(*)::bigint
  from public.marketplace_contact_proposals as application
  join public.marketplace_campaigns as campaign
    on campaign.id = application.campaign_id
    and campaign.brand_profile_id = application.target_brand_profile_id
    and campaign.archived_at is null
  join public.marketplace_brand_profiles as brand
    on brand.id = campaign.brand_profile_id
    and brand.organization_id = campaign.organization_id
    and brand.data_origin = 'production'
    and brand.archived_at is null
  where application.campaign_id = any(p_campaign_ids)
    and application.direction = 'influencer_to_brand'
    and application.data_origin = 'production'
    and application.submitted_actor_proof_at is not null
    and application.status in (
      'submitted',
      'reviewed',
      'accepted',
      'converted_to_contract'
    )
  group by application.campaign_id;
end;
$$;

revoke execute on function public.get_public_marketplace_campaign_application_counts(text[])
  from public, anon, authenticated;
grant execute on function public.get_public_marketplace_campaign_application_counts(text[])
  to service_role;

comment on function public.get_public_marketplace_campaign_application_counts(text[]) is
  'Returns only aggregate, proven production application counts for requested campaign ids; no applicant fields are exposed.';

create or replace function public.update_marketplace_campaign_details(
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_expected_updated_at timestamptz,
  p_campaign_patch jsonb,
  p_activity_event jsonb
)
returns table (
  result_outcome text,
  result_campaign_id text,
  result_brand_profile_id uuid,
  result_campaign_data jsonb,
  result_status text,
  result_updated_at timestamptz,
  result_application_count bigint,
  result_mode text,
  result_locked_fields text[],
  result_policy_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
  v_now timestamptz := clock_timestamp();
  v_current_revision timestamptz;
  v_application_count bigint := 0;
  v_mode text;
  v_locked_fields text[];
  v_policy_reason text;
  v_all_fields constant text[] := array[
    'title',
    'type',
    'otherTypeLabel',
    'applicantLimit',
    'location',
    'offer',
    'budget',
    'summary',
    'mission',
    'targetCountries',
    'thumbnailUrl',
    'deadline',
    'uploadDeadline',
    'platforms',
    'deliverables',
    'applicationContactFields',
    'requiredConsents'
  ];
  v_term_fields constant text[] := array[
    'type',
    'otherTypeLabel',
    'applicantLimit',
    'location',
    'offer',
    'budget',
    'summary',
    'mission',
    'targetCountries',
    'deadline',
    'uploadDeadline',
    'platforms',
    'deliverables',
    'applicationContactFields',
    'requiredConsents'
  ];
  v_patch_fields constant text[] := v_all_fields || array[
    'applicationContactConsentVersion',
    'consentVersion'
  ];
  v_existing_events jsonb;
  v_activity_events jsonb;
  v_next_data jsonb;
  v_mirror jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if btrim(coalesce(p_campaign_id, '')) = ''
    or p_brand_profile_id is null
    or p_organization_id is null
    or p_actor_profile_id is null
    or p_expected_updated_at is null
    or jsonb_typeof(p_campaign_patch) is distinct from 'object'
    or p_campaign_patch = '{}'::jsonb
    or jsonb_typeof(p_activity_event) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'complete campaign edit input is required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_campaign_patch) as patch_field(field_name)
    where not (patch_field.field_name = any(v_patch_fields))
  ) then
    raise exception using
      errcode = '22023',
      message = 'campaign patch contains unsupported fields';
  end if;
  if btrim(coalesce(p_activity_event ->> 'id', '')) = ''
    or btrim(coalesce(p_activity_event ->> 'actor', '')) = ''
    or btrim(coalesce(p_activity_event ->> 'action', '')) = ''
    or btrim(coalesce(p_activity_event ->> 'description', '')) = '' then
    raise exception using
      errcode = '22023',
      message = 'campaign edit activity event is invalid';
  end if;

  -- The same campaign row is locked by application insertion (FOR KEY SHARE),
  -- selection, and recruitment finalization. The count and field policy below
  -- therefore describe one serializable campaign/application boundary.
  select campaign.* into v_campaign
  from public.marketplace_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.brand_profile_id = p_brand_profile_id
    and campaign.organization_id = p_organization_id
    and campaign.archived_at is null
  for update;

  if not found then
    return query select
      'not_found'::text,
      p_campaign_id,
      p_brand_profile_id,
      null::jsonb,
      null::text,
      null::timestamptz,
      0::bigint,
      'locked'::text,
      v_all_fields,
      'not_found'::text;
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
    raise exception using
      errcode = '42501',
      message = 'campaign edit actor is not authorized';
  end if;

  select pg_catalog.count(*)::bigint
  into v_application_count
  from public.marketplace_contact_proposals as application
  where application.direction = 'influencer_to_brand'
    and application.campaign_id = p_campaign_id
    and application.target_brand_profile_id = p_brand_profile_id
    and application.data_origin = 'production'
    and application.submitted_actor_proof_at is not null
    and application.status in (
      'submitted',
      'reviewed',
      'accepted',
      'converted_to_contract'
    );

  if v_campaign.status in ('closed', 'ended') then
    v_mode := 'locked';
    v_locked_fields := v_all_fields;
    v_policy_reason := 'campaign_closed';
  elsif v_application_count > 0 then
    v_mode := 'presentation_only';
    v_locked_fields := v_term_fields;
    v_policy_reason := 'applications_started';
  else
    v_mode := 'full';
    v_locked_fields := '{}'::text[];
    v_policy_reason := 'no_applications';
  end if;

  v_current_revision := v_campaign.updated_at;

  if v_current_revision is distinct from p_expected_updated_at then
    return query select
      'conflict'::text,
      v_campaign.id,
      v_campaign.brand_profile_id,
      v_campaign.campaign_data,
      v_campaign.status,
      v_current_revision,
      v_application_count,
      v_mode,
      v_locked_fields,
      v_policy_reason;
    return;
  end if;

  if v_mode = 'locked' then
    return query select
      'locked'::text,
      v_campaign.id,
      v_campaign.brand_profile_id,
      v_campaign.campaign_data,
      v_campaign.status,
      v_current_revision,
      v_application_count,
      v_mode,
      v_locked_fields,
      v_policy_reason;
    return;
  end if;

  if v_mode = 'presentation_only' and exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_campaign_patch) as patch_field(field_name)
    where patch_field.field_name not in ('title', 'thumbnailUrl')
  ) then
    return query select
      'fields_locked'::text,
      v_campaign.id,
      v_campaign.brand_profile_id,
      v_campaign.campaign_data,
      v_campaign.status,
      v_current_revision,
      v_application_count,
      v_mode,
      v_locked_fields,
      v_policy_reason;
    return;
  end if;

  v_next_data := pg_catalog.jsonb_strip_nulls(
    v_campaign.campaign_data || p_campaign_patch
  );
  v_existing_events := case
    when pg_catalog.jsonb_typeof(v_campaign.campaign_data -> 'activityEvents') = 'array'
      then v_campaign.campaign_data -> 'activityEvents'
    else '[]'::jsonb
  end;
  select coalesce(
    pg_catalog.jsonb_agg(recent.event order by recent.ordinality),
    '[]'::jsonb
  )
  into v_activity_events
  from (
    select event, ordinality
    from pg_catalog.jsonb_array_elements(
      v_existing_events || pg_catalog.jsonb_build_array(p_activity_event)
    ) with ordinality as source(event, ordinality)
    order by ordinality desc
    limit 80
  ) as recent;

  v_next_data := v_next_data || pg_catalog.jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'createdAt', v_campaign.created_at,
    'updatedAt', v_now,
    'activityEvents', v_activity_events
  );

  update public.marketplace_campaigns
  set
    campaign_data = v_next_data,
    updated_at = v_now
  where id = v_campaign.id
    and brand_profile_id = v_campaign.brand_profile_id
    and organization_id = v_campaign.organization_id
  returning * into v_campaign;

  select coalesce(
    pg_catalog.jsonb_agg(
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
      campaign.campaign_data || pg_catalog.jsonb_build_object(
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
    updated_at = v_now
  where id = p_brand_profile_id
    and organization_id = p_organization_id
    and archived_at is null;

  return query select
    'updated'::text,
    v_campaign.id,
    v_campaign.brand_profile_id,
    v_campaign.campaign_data,
    v_campaign.status,
    v_campaign.updated_at,
    v_application_count,
    v_mode,
    v_locked_fields,
    v_policy_reason;
end;
$$;

revoke execute on function public.update_marketplace_campaign_details(
  text, uuid, uuid, uuid, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.update_marketplace_campaign_details(
  text, uuid, uuid, uuid, timestamptz, jsonb, jsonb
) to service_role;

comment on function public.update_marketplace_campaign_details(
  text, uuid, uuid, uuid, timestamptz, jsonb, jsonb
) is
  'Atomically enforces campaign ownership, optimistic concurrency, application-aware edit policy, activity history, and the legacy brand mirror.';
