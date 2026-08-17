begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.support_access_requests
  add column if not exists consent_version text,
  add column if not exists consent_accepted_at timestamptz;

alter table public.support_access_requests
  drop constraint if exists support_access_requests_consent_provenance;
alter table public.support_access_requests
  add constraint support_access_requests_consent_provenance check (
    (consent_version is null and consent_accepted_at is null)
    or (
      consent_version = 'directsign-support-access-consent-v1'
      and consent_accepted_at is not null
      and consent_accepted_at >= created_at - interval '5 seconds'
      and consent_accepted_at <= created_at + interval '5 seconds'
    )
  );

create index if not exists support_access_requests_active_party_idx
  on public.support_access_requests (
    contract_uuid,
    requester_profile_id,
    requester_role,
    expires_at desc
  )
  where status = 'active';

create or replace function public.directsign_prevent_support_access_request_immutable_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    old.contract_id is distinct from new.contract_id
    or old.contract_uuid is distinct from new.contract_uuid
    or old.legacy_contract_id is distinct from new.legacy_contract_id
    or old.requester_profile_id is distinct from new.requester_profile_id
    or old.requester_role is distinct from new.requester_role
    or old.requester_name is distinct from new.requester_name
    or old.requester_email is distinct from new.requester_email
    or old.reason is distinct from new.reason
    or old.scope is distinct from new.scope
    or old.data_origin is distinct from new.data_origin
    or old.expires_at is distinct from new.expires_at
    or old.consent_version is distinct from new.consent_version
    or old.consent_accepted_at is distinct from new.consent_accepted_at
    or old.audit_events is distinct from new.audit_events
    or old.created_at is distinct from new.created_at
  then
    raise exception using
      errcode = '22023',
      message = 'support_access_requests immutable fields cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.create_support_access_grant_atomically(
  p_request_id uuid,
  p_contract_id uuid,
  p_requester_profile_id uuid,
  p_requester_role text,
  p_reason text,
  p_scope text,
  p_data_origin text,
  p_consent_version text,
  p_event_id uuid,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_legacy public.directsign_contracts%rowtype;
  v_contract public.contracts%rowtype;
  v_profile public.profiles%rowtype;
  v_request public.support_access_requests%rowtype;
  v_event public.support_access_events%rowtype;
  v_event_found boolean := false;
  v_data_origin text;
  v_authorized boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_request_id is null
    or p_contract_id is null
    or p_requester_profile_id is null
    or p_event_id is null
    or p_requester_role is null
    or p_requester_role not in ('advertiser', 'influencer')
    or p_reason is null
    or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 5
    or pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 1000
    or p_scope is null
    or p_scope not in ('contract', 'contract_and_pdf')
    or p_consent_version is distinct from 'directsign-support-access-consent-v1'
    or (p_data_origin is not null and p_data_origin not in ('production', 'qa', 'demo', 'seed'))
    or pg_catalog.char_length(coalesce(p_ip, '')) > 256
    or pg_catalog.char_length(coalesce(p_user_agent, '')) > 1000 then
    raise exception using errcode = '22023', message = 'invalid support access grant input';
  end if;

  -- The party-scoped advisory lock serializes the active-grant uniqueness
  -- check even when two application instances receive the same request.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'support-access-grant:' || p_contract_id::text || ':'
        || p_requester_profile_id::text || ':' || p_requester_role,
      0
    )
  );

  select legacy_contract.*
  into v_legacy
  from public.directsign_contracts as legacy_contract
  where legacy_contract.id = p_contract_id::text
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select contract.*
  into v_contract
  from public.contracts as contract
  where contract.id = p_contract_id
    and contract.legacy_contract_id = p_contract_id::text
    and contract.deleted_at is null
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select profile.*
  into v_profile
  from public.profiles as profile
  where profile.id = p_requester_profile_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'support access requester is not authorized';
  end if;

  if p_requester_role = 'advertiser' and v_profile.role::text = 'marketer' then
    v_authorized := (
      (
        v_legacy.advertiser_id = p_requester_profile_id::text
        or (
          pg_catalog.strpos(coalesce(v_legacy.contract -> 'advertiser_info' ->> 'manager', ''), '@') > 1
          and pg_catalog.lower(pg_catalog.btrim(v_profile.email)) =
            pg_catalog.lower(pg_catalog.btrim(v_legacy.contract -> 'advertiser_info' ->> 'manager'))
        )
      )
      and (
        v_contract.created_by_profile_id = p_requester_profile_id
        or exists (
          select 1
          from public.contract_parties as party
          where party.contract_id = p_contract_id
            and party.party_role::text in ('advertiser', 'marketer', 'agency')
            and (
              party.profile_id = p_requester_profile_id
              or (
                party.profile_id is null
                and party.email is not null
                and pg_catalog.lower(pg_catalog.btrim(party.email)) =
                  pg_catalog.lower(pg_catalog.btrim(v_profile.email))
              )
            )
        )
      )
    );
  elsif p_requester_role = 'influencer' and v_profile.role::text = 'influencer' then
    v_authorized := (
      pg_catalog.lower(pg_catalog.btrim(v_profile.email)) =
        pg_catalog.lower(pg_catalog.btrim(coalesce(
          v_legacy.contract -> 'influencer_info' ->> 'contact',
          v_legacy.contract -> 'influencer_info' ->> 'email',
          ''
        )))
      and exists (
        select 1
        from public.contract_parties as party
        where party.contract_id = p_contract_id
          and party.party_role::text in ('influencer', 'creator_manager')
          and (
            party.profile_id = p_requester_profile_id
            or (
              party.profile_id is null
              and party.email is not null
              and pg_catalog.lower(pg_catalog.btrim(party.email)) =
                pg_catalog.lower(pg_catalog.btrim(v_profile.email))
            )
          )
      )
    );
  end if;

  if not v_authorized then
    raise exception using errcode = '42501', message = 'support access requester is not authorized';
  end if;

  v_data_origin := coalesce(
    v_legacy.data_origin,
    v_contract.data_origin,
    v_profile.data_origin,
    p_data_origin
  );
  if v_data_origin is not null
    and v_data_origin not in ('production', 'qa', 'demo', 'seed') then
    raise exception using errcode = '22023', message = 'invalid support access data origin';
  end if;

  select request_row.*
  into v_request
  from public.support_access_requests as request_row
  where request_row.id = p_request_id
  for update;
  if found then
    select event_row.*
    into v_event
    from public.support_access_events as event_row
    where event_row.id = p_event_id;
    v_event_found := found;

    if v_request.contract_id = p_contract_id::text
      and v_request.contract_uuid = p_contract_id
      and v_request.legacy_contract_id = p_contract_id::text
      and v_request.requester_profile_id = p_requester_profile_id
      and v_request.requester_role::text = p_requester_role
      and v_request.reason = pg_catalog.btrim(p_reason)
      and v_request.scope::text = p_scope
      and v_request.status::text = 'active'
      and v_request.data_origin is not distinct from v_data_origin
      and v_request.consent_version = p_consent_version
      and v_event_found
      and v_event.support_access_request_id = p_request_id
      and v_event.contract_id = p_contract_id::text
      and v_event.action = 'created'
      and v_event.actor_role = p_requester_role
      and v_event.actor_profile_id = p_requester_profile_id then
      return jsonb_build_object(
        'outcome', 'idempotent',
        'request', to_jsonb(v_request),
        'event', to_jsonb(v_event)
      );
    end if;

    return jsonb_build_object('outcome', 'request_conflict');
  end if;

  if exists (
    select 1 from public.support_access_events as event_row where event_row.id = p_event_id
  ) then
    return jsonb_build_object('outcome', 'request_conflict');
  end if;

  select request_row.*
  into v_request
  from public.support_access_requests as request_row
  where (request_row.contract_uuid = p_contract_id or request_row.contract_id = p_contract_id::text)
    and request_row.requester_profile_id = p_requester_profile_id
    and request_row.requester_role::text = p_requester_role
    and request_row.status::text = 'active'
    and request_row.expires_at > v_now
  order by request_row.created_at desc, request_row.id desc
  limit 1
  for update;
  if found then
    return jsonb_build_object(
      'outcome', 'active_duplicate',
      'request', to_jsonb(v_request)
    );
  end if;

  insert into public.support_access_requests (
    id,
    contract_id,
    contract_uuid,
    legacy_contract_id,
    requester_profile_id,
    requester_role,
    requester_name,
    requester_email,
    reason,
    scope,
    status,
    data_origin,
    expires_at,
    consent_version,
    consent_accepted_at,
    audit_events,
    created_at,
    updated_at
  ) values (
    p_request_id,
    p_contract_id::text,
    p_contract_id,
    p_contract_id::text,
    p_requester_profile_id,
    p_requester_role::public.directsign_contract_party_role,
    v_profile.name,
    v_profile.email,
    pg_catalog.btrim(p_reason),
    p_scope::public.directsign_support_access_scope,
    'active'::public.directsign_support_access_status,
    v_data_origin,
    v_now + interval '24 hours',
    p_consent_version,
    v_now,
    '[]'::jsonb,
    v_now,
    v_now
  )
  returning * into v_request;

  insert into public.support_access_events (
    id,
    support_access_request_id,
    contract_id,
    action,
    actor_role,
    actor_profile_id,
    actor_name,
    description,
    ip,
    user_agent,
    event_hash,
    previous_event_hash,
    created_at
  ) values (
    p_event_id,
    p_request_id,
    p_contract_id::text,
    'created',
    p_requester_role,
    p_requester_profile_id,
    v_profile.name,
    pg_catalog.format(
      'Contract party granted 24-hour operator access (consent=%s, scope=%s).',
      p_consent_version,
      p_scope
    ),
    nullif(pg_catalog.btrim(coalesce(p_ip, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_user_agent, '')), ''),
    '',
    null,
    v_now
  )
  returning * into v_event;

  return jsonb_build_object(
    'outcome', 'created',
    'request', to_jsonb(v_request),
    'event', to_jsonb(v_event)
  );
end;
$$;

create or replace function public.transition_support_access_status_atomically(
  p_request_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_target_status text,
  p_actor_profile_id uuid,
  p_admin_auth_session_id uuid,
  p_event_id uuid,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_actor public.profiles%rowtype;
  v_request public.support_access_requests%rowtype;
  v_event public.support_access_events%rowtype;
  v_event_found boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_request_id is null
    or p_expected_status is null
    or p_expected_status not in ('active', 'closed', 'revoked', 'expired')
    or p_expected_updated_at is null
    or p_target_status is null
    or p_target_status not in ('closed', 'revoked')
    or p_actor_profile_id is null
    or p_admin_auth_session_id is null
    or p_event_id is null
    or pg_catalog.char_length(coalesce(p_ip, '')) > 256
    or pg_catalog.char_length(coalesce(p_user_agent, '')) > 1000 then
    raise exception using errcode = '22023', message = 'invalid support access transition input';
  end if;

  select actor.*
  into v_actor
  from public.profiles as actor
  where actor.id = p_actor_profile_id
    and actor.role::text = 'admin'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'trusted admin profile required';
  end if;

  perform 1
  from public.admin_operator_sessions as operator_session
  where operator_session.auth_session_id = p_admin_auth_session_id
    and operator_session.operator_profile_id = p_actor_profile_id
    and operator_session.aal = 'aal2'
    and operator_session.revoked_at is null
    and operator_session.absolute_expires_at > v_now
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'active AAL2 admin session required';
  end if;

  select request_row.*
  into v_request
  from public.support_access_requests as request_row
  where request_row.id = p_request_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select event_row.*
  into v_event
  from public.support_access_events as event_row
  where event_row.id = p_event_id;
  v_event_found := found;

  -- An exact retry after a committed response loss is read-only. It does not
  -- churn updated_at or append a second terminal event.
  if v_request.status::text = p_target_status then
    return jsonb_build_object(
      'outcome', 'idempotent',
      'request', to_jsonb(v_request),
      'event', case
        when v_event_found
          and v_event.support_access_request_id = p_request_id
          and v_event.action = p_target_status
          and v_event.actor_profile_id = p_actor_profile_id
        then to_jsonb(v_event)
        else null
      end
    );
  end if;

  if v_event_found then
    return jsonb_build_object('outcome', 'request_conflict');
  end if;

  if v_request.status::text <> 'active'
    or p_expected_status <> 'active' then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'request', to_jsonb(v_request)
    );
  end if;

  if v_request.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'outcome', 'version_conflict',
      'request', to_jsonb(v_request)
    );
  end if;

  update public.support_access_requests as request_row
  set
    status = p_target_status::public.directsign_support_access_status,
    reviewed_by_profile_id = p_actor_profile_id,
    reviewed_by_name = v_actor.name,
    reviewed_at = v_now,
    updated_at = v_now
  where request_row.id = p_request_id
  returning * into v_request;

  insert into public.support_access_events (
    id,
    support_access_request_id,
    contract_id,
    action,
    actor_role,
    actor_profile_id,
    actor_name,
    description,
    ip,
    user_agent,
    event_hash,
    previous_event_hash,
    created_at
  ) values (
    p_event_id,
    p_request_id,
    v_request.contract_id,
    p_target_status,
    'admin',
    p_actor_profile_id,
    v_actor.name,
    case p_target_status
      when 'closed' then 'Operator closed support access.'
      else 'Operator revoked support access.'
    end,
    nullif(pg_catalog.btrim(coalesce(p_ip, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_user_agent, '')), ''),
    '',
    null,
    v_now
  )
  returning * into v_event;

  return jsonb_build_object(
    'outcome', 'updated',
    'request', to_jsonb(v_request),
    'event', to_jsonb(v_event)
  );
end;
$$;

revoke all on function public.create_support_access_grant_atomically(
  uuid, uuid, uuid, text, text, text, text, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.transition_support_access_status_atomically(
  uuid, text, timestamptz, text, uuid, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.create_support_access_grant_atomically(
  uuid, uuid, uuid, text, text, text, text, text, uuid, text, text
) to service_role;
grant execute on function public.transition_support_access_status_atomically(
  uuid, text, timestamptz, text, uuid, uuid, uuid, text, text
) to service_role;

-- State rows are now written only through the SECURITY DEFINER functions.
-- Direct event inserts remain available to the service for viewed_contract and
-- viewed_pdf audit entries, which do not mutate grant state.
revoke insert, update on public.support_access_requests from service_role;
grant select on public.support_access_requests to service_role;

comment on column public.support_access_requests.consent_version is
  'Immutable version of the explicit party consent recorded when the active support grant was created.';
comment on column public.support_access_requests.consent_accepted_at is
  'Database-authored time when explicit support-access consent was recorded.';
comment on function public.create_support_access_grant_atomically(
  uuid, uuid, uuid, text, text, text, text, text, uuid, text, text
) is
  'Service-only atomic creation of a 24-hour support grant and its append-only created event, with contract-party provenance checks.';
comment on function public.transition_support_access_status_atomically(
  uuid, text, timestamptz, text, uuid, uuid, uuid, text, text
) is
  'Service-only CAS transition from active to closed or revoked with an AAL2 operator session and an atomic append-only event.';

commit;
