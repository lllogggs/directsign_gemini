-- Serialize deliverable mutations with contract close and make the authoritative
-- legacy contract, V2 projection, and close event one database transaction.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.guard_active_contract_deliverable_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_status text;
begin
  select contract.status::text
  into v_status
  from public.contracts as contract
  where contract.id = new.contract_id
    and contract.deleted_at is null
  for key share;

  if v_status is null then
    raise exception using
      errcode = 'P0002',
      message = 'DIRECTSIGN_CONTRACT_NOT_FOUND';
  end if;

  if v_status <> 'active' then
    raise exception using
      errcode = '40001',
      message = 'DIRECTSIGN_CONTRACT_NOT_ACTIVE';
  end if;

  return new;
end;
$$;

drop trigger if exists deliverables_require_active_contract on public.deliverables;
create trigger deliverables_require_active_contract
before insert or update on public.deliverables
for each row execute function public.guard_active_contract_deliverable_mutation();

create or replace function public.close_directsign_contract_atomically(
  p_contract_id uuid,
  p_expected_updated_at timestamptz,
  p_updated_legacy_contract jsonb,
  p_closed_at timestamptz,
  p_actor_profile_id uuid,
  p_actor_display_name text,
  p_event_id uuid
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
  v_contract public.contracts%rowtype;
  v_total integer := 0;
  v_submitted integer := 0;
  v_approved integer := 0;
begin
  if p_contract_id is null
    or p_expected_updated_at is null
    or p_updated_legacy_contract is null
    or jsonb_typeof(p_updated_legacy_contract) <> 'object'
    or p_closed_at is null
    or p_actor_profile_id is null
    or p_event_id is null then
    raise exception using errcode = '22023', message = 'invalid contract close input';
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
    or v_legacy.updated_at is distinct from p_expected_updated_at then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  select contract.*
  into v_contract
  from public.contracts as contract
  where contract.id = p_contract_id
    and contract.deleted_at is null
  for update;

  if not found then
    return query select 'projection_missing', 0, 0, 0;
    return;
  end if;

  if v_contract.status::text <> 'active' then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  -- Lock all requirement and deliverable rows while deriving the close proof.
  perform 1
  from public.deliverable_requirements as requirement
  where requirement.contract_id = p_contract_id
  for share;

  perform 1
  from public.deliverables as deliverable
  where deliverable.contract_id = p_contract_id
  for update;

  select coalesce(sum(requirement.quantity), 0)::integer
  into v_total
  from public.deliverable_requirements as requirement
  where requirement.contract_id = p_contract_id;

  select coalesce(sum(least(requirement.quantity, counts.submitted_count)), 0)::integer,
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

  if v_total <= 0 or v_approved < v_total then
    return query select 'deliverables_not_ready', v_total, v_submitted, v_approved;
    return;
  end if;

  update public.directsign_contracts as legacy
  set contract = p_updated_legacy_contract,
      -- Legacy scalar status intentionally remains SIGNED for compatibility;
      -- the authoritative JSON status is CLOSED.
      status = 'SIGNED',
      updated_at = p_closed_at
  where legacy.id = p_contract_id::text;

  update public.contracts as contract
  set status = 'completed'::public.directsign_contract_status,
      next_actor_role = null,
      next_action = '광고 계약 마감 완료',
      next_due_at = null,
      completed_at = p_closed_at,
      version_no = contract.version_no + 1,
      updated_at = p_closed_at
  where contract.id = p_contract_id;

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
    created_at
  ) values (
    p_event_id,
    p_contract_id,
    p_actor_profile_id,
    'advertiser',
    nullif(btrim(p_actor_display_name), ''),
    'contract_closed',
    'contract',
    p_contract_id,
    jsonb_build_object(
      'summary', jsonb_build_object(
        'total', v_total,
        'submitted', v_submitted,
        'approved', v_approved
      ),
      'settlement_confirmed', true
    ),
    p_closed_at
  ) on conflict (id) do nothing;

  return query select 'closed', v_total, v_submitted, v_approved;
end;
$$;

create or replace function public.sync_directsign_deliverable_workflow_atomically(
  p_contract_id uuid,
  p_expected_updated_at timestamptz,
  p_updated_legacy_contract jsonb,
  p_updated_at timestamptz,
  p_event_id uuid default null,
  p_event_ip inet default null,
  p_event_user_agent text default null
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
  v_contract public.contracts%rowtype;
  v_total integer := 0;
  v_submitted integer := 0;
  v_approved integer := 0;
  v_requirement_count integer := 0;
  v_completed boolean := false;
  v_has_pending_review boolean := false;
  v_has_revision boolean := false;
  v_first_submitted_url text;
  v_next_actor text;
  v_next_action text;
  v_workflow jsonb;
  v_updated_contract jsonb;
begin
  if p_contract_id is null
    or p_expected_updated_at is null
    or p_updated_legacy_contract is null
    or jsonb_typeof(p_updated_legacy_contract) <> 'object'
    or p_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'invalid deliverable workflow input';
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
    or v_legacy.updated_at is distinct from p_expected_updated_at then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  select contract.*
  into v_contract
  from public.contracts as contract
  where contract.id = p_contract_id
    and contract.deleted_at is null
  for update;

  if not found then
    return query select 'projection_missing', 0, 0, 0;
    return;
  end if;

  if v_contract.status::text <> 'active' then
    return query select 'version_conflict', 0, 0, 0;
    return;
  end if;

  -- The contract UPDATE lock conflicts with the deliverable guard's KEY SHARE
  -- lock, so the summary below and any concurrent submit/review are serialized.
  perform 1
  from public.deliverable_requirements as requirement
  where requirement.contract_id = p_contract_id
  for share;

  perform 1
  from public.deliverables as deliverable
  where deliverable.contract_id = p_contract_id
  for share;

  select count(*)::integer,
         coalesce(sum(requirement.quantity), 0)::integer
  into v_requirement_count, v_total
  from public.deliverable_requirements as requirement
  where requirement.contract_id = p_contract_id;

  if v_requirement_count > 0 then
    select coalesce(sum(least(requirement.quantity, counts.submitted_count)), 0)::integer,
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
    select count(*)::integer,
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

  v_completed := v_total > 0 and v_approved >= v_total;
  select
    coalesce(bool_or(deliverable.review_status::text = 'submitted'), false),
    coalesce(bool_or(deliverable.review_status::text in ('changes_requested', 'rejected')), false),
    (array_agg(deliverable.url order by deliverable.created_at, deliverable.id)
      filter (where nullif(btrim(deliverable.url), '') is not null))[1]
  into v_has_pending_review, v_has_revision, v_first_submitted_url
  from public.deliverables as deliverable
  where deliverable.contract_id = p_contract_id;

  if v_completed and p_event_id is null then
    raise exception using
      errcode = '22023',
      message = 'ready-to-close event id is required';
  end if;

  if v_completed then
    v_next_actor := 'advertiser';
    v_next_action := '모든 콘텐츠가 승인되었습니다. 광고 계약 마감을 진행하세요.';
    v_workflow := jsonb_build_object(
      'next_actor', v_next_actor,
      'next_action', v_next_action,
      'risk_level', 'low',
      'last_message', '모든 필수 콘텐츠가 승인되었습니다.'
    );
  elsif v_has_pending_review then
    v_next_actor := 'advertiser';
    v_next_action := '제출된 콘텐츠 URL과 파일을 검수하고 승인 또는 수정 요청을 남기세요.';
    v_workflow := jsonb_build_object(
      'next_actor', v_next_actor,
      'next_action', v_next_action,
      'risk_level', 'medium',
      'last_message', '광고주 콘텐츠 확인 및 검수가 필요합니다.'
    );
  else
    v_next_actor := 'influencer';
    v_next_action := case
      when v_has_revision then '수정 요청된 콘텐츠를 보완한 뒤 URL이나 파일을 다시 제출하세요.'
      else '콘텐츠 URL과 파일을 제출해 광고주 검수를 요청하세요.'
    end;
    v_workflow := jsonb_build_object(
      'next_actor', v_next_actor,
      'next_action', v_next_action,
      'risk_level', case when v_has_revision then 'medium' else 'low' end,
      'last_message', case
        when v_has_revision then '콘텐츠 수정 요청 또는 반려가 있습니다.'
        else '인플루언서 콘텐츠 제출을 기다리는 중입니다.'
      end
    );
  end if;

  v_updated_contract := jsonb_set(
    jsonb_set(
      jsonb_set(
        p_updated_legacy_contract,
        '{workflow}',
        v_workflow,
        true
      ),
      '{deliverable_summary}',
      jsonb_build_object(
        'total', v_total,
        'submitted', v_submitted,
        'approved', v_approved,
        'updated_at', p_updated_at
      ),
      true
    ),
    '{updated_at}',
    to_jsonb(p_updated_at::text),
    true
  );
  if v_first_submitted_url is not null then
    v_updated_contract := jsonb_set(
      v_updated_contract,
      '{post_link}',
      to_jsonb(v_first_submitted_url),
      true
    );
  end if;

  update public.directsign_contracts as legacy
  set contract = v_updated_contract,
      status = 'SIGNED',
      updated_at = p_updated_at
  where legacy.id = p_contract_id::text;

  update public.contracts as contract
  set status = 'active'::public.directsign_contract_status,
      next_actor_role = case v_next_actor
        when 'advertiser' then 'advertiser'::public.directsign_contract_party_role
        when 'influencer' then 'influencer'::public.directsign_contract_party_role
        else null
      end,
      next_action = v_next_action,
      next_due_at = null,
      completed_at = null,
      version_no = contract.version_no + 1,
      updated_at = p_updated_at
  where contract.id = p_contract_id;

  if v_completed then
    insert into public.contract_events (
      id,
      contract_id,
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
      p_event_id,
      p_contract_id,
      'system',
      '연락미',
      'deliverables_ready_to_close',
      'contract',
      p_contract_id,
      jsonb_build_object(
        'summary', jsonb_build_object(
          'total', v_total,
          'submitted', v_submitted,
          'approved', v_approved
        )
      ),
      p_event_ip,
      nullif(btrim(p_event_user_agent), ''),
      p_updated_at
    ) on conflict (id) do nothing;
  end if;

  return query select 'updated', v_total, v_submitted, v_approved;
end;
$$;

revoke all on function public.guard_active_contract_deliverable_mutation()
  from public, anon, authenticated;
revoke all on function public.close_directsign_contract_atomically(
  uuid, timestamptz, jsonb, timestamptz, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function public.sync_directsign_deliverable_workflow_atomically(
  uuid, timestamptz, jsonb, timestamptz, uuid, inet, text
) from public, anon, authenticated;

grant execute on function public.close_directsign_contract_atomically(
  uuid, timestamptz, jsonb, timestamptz, uuid, text, uuid
) to service_role;
grant execute on function public.sync_directsign_deliverable_workflow_atomically(
  uuid, timestamptz, jsonb, timestamptz, uuid, inet, text
) to service_role;

comment on function public.close_directsign_contract_atomically(
  uuid, timestamptz, jsonb, timestamptz, uuid, text, uuid
) is
  'Locks the contract and deliverable rows, rechecks required approvals, then commits both contract projections and the close event atomically.';

comment on function public.sync_directsign_deliverable_workflow_atomically(
  uuid, timestamptz, jsonb, timestamptz, uuid, inet, text
) is
  'Serializes deliverable mutations, re-derives the workflow summary, and commits both contract projections plus the ready-to-close event in one transaction.';
