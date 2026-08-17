-- Finalize content submissions and reviews as all-or-nothing database
-- transactions. The Storage object is created first and is deleted by the
-- application if this RPC fails; every database row, audit event, workflow
-- projection, quota reservation, and Bell source commits together here.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.finalize_directsign_deliverable_submission(
  p_contract_id uuid,
  p_expected_contract_updated_at timestamptz,
  p_updated_legacy_contract jsonb,
  p_deliverable_id uuid,
  p_requirement_id uuid,
  p_creator_profile_id uuid,
  p_title text,
  p_url text,
  p_metadata jsonb,
  p_file jsonb,
  p_reservation_id uuid,
  p_submitted_event_id uuid,
  p_ready_event_id uuid,
  p_actor_display_name text,
  p_event_ip inet,
  p_event_user_agent text,
  p_occurred_at timestamptz
)
returns table (
  outcome text,
  total integer,
  submitted integer,
  approved integer
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_legacy public.directsign_contracts%rowtype;
  v_projection_status text;
  v_reservation public.directsign_deliverable_upload_reservations%rowtype;
  v_file_size bigint := 0;
  v_workflow_outcome text;
  v_total integer := 0;
  v_submitted integer := 0;
  v_approved integer := 0;
begin
  if p_contract_id is null
    or p_expected_contract_updated_at is null
    or p_updated_legacy_contract is null
    or jsonb_typeof(p_updated_legacy_contract) <> 'object'
    or p_deliverable_id is null
    or p_creator_profile_id is null
    or nullif(btrim(p_title), '') is null
    or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or (p_file is not null and jsonb_typeof(p_file) <> 'object')
    or p_reservation_id is null
    or p_submitted_event_id is null
    or p_ready_event_id is null
    or p_occurred_at is null then
    raise exception using
      errcode = '22023',
      message = 'invalid deliverable submission input';
  end if;

  select legacy.*
  into v_legacy
  from public.directsign_contracts as legacy
  where legacy.id = p_contract_id::text
  for update;

  if not found then
    return query select 'authoritative_record_missing', 0, 0, 0;
    return;
  end if;
  if coalesce(v_legacy.contract ->> 'status', '') <> 'SIGNED'
    or v_legacy.updated_at is distinct from p_expected_contract_updated_at then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  select contract.status::text
  into v_projection_status
  from public.contracts as contract
  where contract.id = p_contract_id
    and contract.deleted_at is null
  for update;

  if v_projection_status is null then
    return query select 'projection_missing', 0, 0, 0;
    return;
  end if;
  if v_projection_status <> 'active' then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  select reservation.*
  into v_reservation
  from public.directsign_deliverable_upload_reservations as reservation
  where reservation.id = p_reservation_id
  for update;

  if not found
    or v_reservation.contract_id <> p_contract_id
    or v_reservation.creator_profile_id <> p_creator_profile_id
    or v_reservation.expires_at <= pg_catalog.clock_timestamp() then
    return query select 'reservation_invalid', 0, 0, 0;
    return;
  end if;

  if p_file is not null then
    begin
      v_file_size := (p_file ->> 'byte_size')::bigint;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid contract file size';
    end;
  end if;
  if v_file_size < 0 or v_file_size <> v_reservation.byte_size then
    raise exception using errcode = '22023', message = 'quota reservation size mismatch';
  end if;

  if p_requirement_id is not null and not exists (
    select 1
    from public.deliverable_requirements as requirement
    where requirement.id = p_requirement_id
      and requirement.contract_id = p_contract_id
  ) then
    return query select 'requirement_invalid', 0, 0, 0;
    return;
  end if;

  insert into public.deliverables (
    id,
    contract_id,
    requirement_id,
    creator_profile_id,
    title,
    url,
    submitted_at,
    review_status,
    metadata,
    created_at,
    updated_at
  ) values (
    p_deliverable_id,
    p_contract_id,
    p_requirement_id,
    p_creator_profile_id,
    p_title,
    nullif(btrim(p_url), ''),
    p_occurred_at,
    'submitted'::public.directsign_review_status,
    p_metadata,
    p_occurred_at,
    p_occurred_at
  );

  if p_file is not null then
    insert into public.contract_files (
      id,
      contract_id,
      uploaded_by_profile_id,
      related_type,
      related_id,
      file_type,
      bucket,
      storage_path,
      file_name,
      content_type,
      byte_size,
      file_hash,
      created_at
    ) values (
      (p_file ->> 'id')::uuid,
      p_contract_id,
      p_creator_profile_id,
      'deliverable',
      p_deliverable_id,
      'evidence'::public.directsign_file_type,
      p_file ->> 'bucket',
      p_file ->> 'storage_path',
      nullif(p_file ->> 'file_name', ''),
      nullif(p_file ->> 'content_type', ''),
      v_file_size,
      p_file ->> 'file_hash',
      p_occurred_at
    );
  end if;

  if not exists (
    select 1 from public.contract_events where id = p_submitted_event_id
  ) then
    insert into public.contract_events (
      id,
      contract_id,
      actor_profile_id,
      actor_role,
      actor_display_name,
      event_type,
      target_type,
      target_id,
      payload,
      ip_address,
      user_agent,
      created_at
    ) values (
      p_submitted_event_id,
      p_contract_id,
      p_creator_profile_id,
      'influencer',
      nullif(btrim(p_actor_display_name), ''),
      'deliverable_submitted',
      'deliverable',
      p_deliverable_id,
      jsonb_build_object(
        'requirement_id', p_requirement_id,
        'title', p_title,
        'has_url', nullif(btrim(p_url), '') is not null,
        'has_file', p_file is not null,
        'transition_occurred_at', p_occurred_at
      ),
      p_event_ip,
      nullif(btrim(p_event_user_agent), ''),
      p_occurred_at
    );
  end if;

  select workflow.outcome, workflow.total, workflow.submitted, workflow.approved
  into v_workflow_outcome, v_total, v_submitted, v_approved
  from public.sync_directsign_deliverable_workflow_atomically(
    p_contract_id,
    p_expected_contract_updated_at,
    p_updated_legacy_contract,
    p_occurred_at,
    p_ready_event_id,
    p_event_ip,
    p_event_user_agent
  ) as workflow;

  if v_workflow_outcome is distinct from 'updated' then
    raise exception using
      errcode = '40001',
      message = 'DIRECTSIGN_CONTRACT_VERSION_CONFLICT';
  end if;

  delete from public.directsign_deliverable_upload_reservations
  where id = p_reservation_id;

  return query select 'submitted', v_total, v_submitted, v_approved;
end;
$$;

create or replace function public.finalize_directsign_deliverable_review(
  p_contract_id uuid,
  p_expected_contract_updated_at timestamptz,
  p_updated_legacy_contract jsonb,
  p_deliverable_id uuid,
  p_expected_deliverable_updated_at timestamptz,
  p_review_status text,
  p_review_comment text,
  p_reviewer_profile_id uuid,
  p_reviewer_display_name text,
  p_review_event_id uuid,
  p_ready_event_id uuid,
  p_event_ip inet,
  p_event_user_agent text,
  p_occurred_at timestamptz
)
returns table (
  outcome text,
  total integer,
  submitted integer,
  approved integer
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_legacy public.directsign_contracts%rowtype;
  v_projection_status text;
  v_deliverable public.deliverables%rowtype;
  v_event_type text;
  v_transition_at timestamptz;
  v_workflow_outcome text;
  v_requirement_count integer := 0;
  v_total integer := 0;
  v_submitted integer := 0;
  v_approved integer := 0;
begin
  if p_contract_id is null
    or p_expected_contract_updated_at is null
    or p_updated_legacy_contract is null
    or jsonb_typeof(p_updated_legacy_contract) <> 'object'
    or p_deliverable_id is null
    or p_review_status not in ('approved', 'changes_requested', 'rejected')
    or p_reviewer_profile_id is null
    or p_review_event_id is null
    or p_ready_event_id is null
    or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'invalid deliverable review input';
  end if;
  if p_review_status in ('changes_requested', 'rejected')
    and nullif(btrim(p_review_comment), '') is null then
    raise exception using errcode = '22023', message = 'review comment is required';
  end if;

  select legacy.*
  into v_legacy
  from public.directsign_contracts as legacy
  where legacy.id = p_contract_id::text
  for update;
  if not found then
    return query select 'authoritative_record_missing', 0, 0, 0;
    return;
  end if;
  if coalesce(v_legacy.contract ->> 'status', '') <> 'SIGNED'
    or v_legacy.updated_at is distinct from p_expected_contract_updated_at then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  select contract.status::text
  into v_projection_status
  from public.contracts as contract
  where contract.id = p_contract_id
    and contract.deleted_at is null
  for update;
  if v_projection_status is null then
    return query select 'projection_missing', 0, 0, 0;
    return;
  end if;
  if v_projection_status <> 'active' then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  select deliverable.*
  into v_deliverable
  from public.deliverables as deliverable
  where deliverable.id = p_deliverable_id
    and deliverable.contract_id = p_contract_id
  for update;
  if not found then
    return query select 'deliverable_missing', 0, 0, 0;
    return;
  end if;

  v_event_type := case p_review_status
    when 'approved' then 'deliverable_approved'
    when 'changes_requested' then 'deliverable_changes_requested'
    else 'deliverable_rejected'
  end;

  if v_deliverable.review_status::text = p_review_status then
    if v_deliverable.reviewed_by_profile_id is null
      or v_deliverable.reviewed_at is null then
      return query select 'review_conflict', 0, 0, 0;
      return;
    end if;
    if not exists (
      select 1
      from public.contract_events as event
      where event.id = p_review_event_id
        and event.contract_id = p_contract_id
        and event.event_type = v_event_type
        and event.target_type = 'deliverable'
        and event.target_id = p_deliverable_id
    ) then
      return query select 'review_conflict', 0, 0, 0;
      return;
    end if;

    -- A same-status retry is a read, not a new workflow transition. Re-running
    -- sync with the historical reviewed_at would rewind contract timestamps and
    -- increment the projection version after newer reviews.
    select count(*)::integer,
           coalesce(sum(requirement.quantity), 0)::integer
    into v_requirement_count, v_total
    from public.deliverable_requirements as requirement
    where requirement.contract_id = p_contract_id;

    if v_requirement_count > 0 then
      select
        coalesce(sum(least(requirement.quantity, counts.submitted_count)), 0)::integer,
        coalesce(sum(least(requirement.quantity, counts.approved_count)), 0)::integer
      into v_submitted, v_approved
      from public.deliverable_requirements as requirement
      cross join lateral (
        select
          count(*) filter (
            where deliverable.review_status::text in (
              'submitted', 'changes_requested', 'approved', 'rejected', 'waived'
            )
          )::integer as submitted_count,
          count(*) filter (
            where deliverable.review_status::text in ('approved', 'waived')
          )::integer as approved_count
        from public.deliverables as deliverable
        where deliverable.contract_id = p_contract_id
          and deliverable.requirement_id = requirement.id
      ) as counts
      where requirement.contract_id = p_contract_id;
    else
      select
        count(*)::integer,
        count(*) filter (
          where deliverable.review_status::text in (
            'submitted', 'changes_requested', 'approved', 'rejected', 'waived'
          )
        )::integer,
        count(*) filter (
          where deliverable.review_status::text in ('approved', 'waived')
        )::integer
      into v_total, v_submitted, v_approved
      from public.deliverables as deliverable
      where deliverable.contract_id = p_contract_id;
    end if;

    return query select 'idempotent', v_total, v_submitted, v_approved;
    return;
  elsif v_deliverable.review_status::text = 'submitted'
    and p_expected_deliverable_updated_at is not null
    and v_deliverable.updated_at is not distinct from p_expected_deliverable_updated_at then
    update public.deliverables as deliverable
    set review_status = p_review_status::public.directsign_review_status,
        review_comment = nullif(btrim(p_review_comment), ''),
        reviewed_by_profile_id = p_reviewer_profile_id,
        reviewed_at = p_occurred_at,
        updated_at = p_occurred_at
    where deliverable.id = p_deliverable_id;
    v_transition_at := p_occurred_at;
  else
    return query select 'review_conflict', 0, 0, 0;
    return;
  end if;

  if not exists (
    select 1 from public.contract_events where id = p_review_event_id
  ) then
    insert into public.contract_events (
      id,
      contract_id,
      actor_profile_id,
      actor_role,
      actor_display_name,
      event_type,
      target_type,
      target_id,
      payload,
      ip_address,
      user_agent,
      created_at
    ) values (
      p_review_event_id,
      p_contract_id,
      coalesce(v_deliverable.reviewed_by_profile_id, p_reviewer_profile_id),
      'advertiser',
      nullif(btrim(p_reviewer_display_name), ''),
      v_event_type,
      'deliverable',
      p_deliverable_id,
      jsonb_build_object(
        'review_status', p_review_status,
        'review_comment', coalesce(v_deliverable.review_comment, nullif(btrim(p_review_comment), '')),
        'transition_occurred_at', v_transition_at
      ),
      p_event_ip,
      nullif(btrim(p_event_user_agent), ''),
      v_transition_at
    );
  end if;

  select workflow.outcome, workflow.total, workflow.submitted, workflow.approved
  into v_workflow_outcome, v_total, v_submitted, v_approved
  from public.sync_directsign_deliverable_workflow_atomically(
    p_contract_id,
    p_expected_contract_updated_at,
    p_updated_legacy_contract,
    p_occurred_at,
    p_ready_event_id,
    p_event_ip,
    p_event_user_agent
  ) as workflow;

  if v_workflow_outcome is distinct from 'updated' then
    raise exception using
      errcode = '40001',
      message = 'DIRECTSIGN_CONTRACT_VERSION_CONFLICT';
  end if;

  return query select
    case when v_deliverable.review_status::text = p_review_status
      then 'idempotent'
      else 'reviewed'
    end,
    v_total,
    v_submitted,
    v_approved;
end;
$$;

revoke all on function public.finalize_directsign_deliverable_submission(
  uuid, timestamptz, jsonb, uuid, uuid, uuid, text, text, jsonb, jsonb,
  uuid, uuid, uuid, text, inet, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.finalize_directsign_deliverable_submission(
  uuid, timestamptz, jsonb, uuid, uuid, uuid, text, text, jsonb, jsonb,
  uuid, uuid, uuid, text, inet, text, timestamptz
) to service_role;

revoke all on function public.finalize_directsign_deliverable_review(
  uuid, timestamptz, jsonb, uuid, timestamptz, text, text, uuid, text,
  uuid, uuid, inet, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.finalize_directsign_deliverable_review(
  uuid, timestamptz, jsonb, uuid, timestamptz, text, text, uuid, text,
  uuid, uuid, inet, text, timestamptz
) to service_role;

comment on function public.finalize_directsign_deliverable_submission(
  uuid, timestamptz, jsonb, uuid, uuid, uuid, text, text, jsonb, jsonb,
  uuid, uuid, uuid, text, inet, text, timestamptz
) is
  'Atomically consumes a quota reservation and commits a deliverable, optional file metadata, audit events, Bell source, and both workflow projections.';
comment on function public.finalize_directsign_deliverable_review(
  uuid, timestamptz, jsonb, uuid, timestamptz, text, text, uuid, text,
  uuid, uuid, inet, text, timestamptz
) is
  'Atomically CAS-reviews a deliverable and commits its audit event, Bell source, and both workflow projections.';
