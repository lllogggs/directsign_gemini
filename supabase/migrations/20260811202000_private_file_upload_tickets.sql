-- Direct-to-Storage upload tickets keep 10 MiB private files out of the
-- Vercel Function request body while preserving server-authored ownership,
-- quota, audit, and finalization boundaries.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.directsign_private_file_upload_tickets (
  id uuid primary key,
  purpose text not null,
  -- Keep the actor/resource identifiers after account or contract erasure until
  -- the delayed Storage cleanup has proved the object is either referenced or
  -- deleted. Cascading these rows would strand an untracked private object.
  actor_profile_id uuid not null,
  resource_id uuid not null,
  contract_id uuid,
  requirement_id uuid,
  reservation_id uuid,
  erasure_request_id uuid
    references public.privacy_erasure_requests (id) on delete set null,
  bucket text not null,
  object_path text not null,
  content_type text not null,
  byte_size bigint not null,
  sha256 text not null,
  state text not null default 'issued',
  issued_at timestamptz not null default clock_timestamp(),
  finalize_expires_at timestamptz not null,
  cleanup_not_before timestamptz not null,
  finalized_at timestamptz,
  cleaned_at timestamptz,
  cleanup_lease_owner uuid,
  cleanup_lease_expires_at timestamptz,
  cleanup_attempts integer not null default 0,
  last_error_code text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint directsign_private_upload_ticket_purpose check (
    purpose in (
      'advertiser_verification',
      'influencer_verification',
      'deliverable'
    )
  ),
  constraint directsign_private_upload_ticket_state check (
    state in ('issued', 'finalized', 'cleanup_pending', 'cleaned')
  ),
  constraint directsign_private_upload_ticket_bucket check (
    bucket = 'directsign-private'
  ),
  constraint directsign_private_upload_ticket_path check (
    object_path ~ '^(verification-advertiser|verification-influencer|deliverables)/[0-9a-f-]{36}/[0-9a-f-]{36}-evidence\.(pdf|png|jpg|webp)$'
  ),
  constraint directsign_private_upload_ticket_content_type check (
    content_type in (
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp'
    )
  ),
  constraint directsign_private_upload_ticket_size check (
    byte_size between 1 and 10485760
  ),
  constraint directsign_private_upload_ticket_sha256 check (
    sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint directsign_private_upload_ticket_time_order check (
    finalize_expires_at > issued_at
    and cleanup_not_before >= issued_at + interval '27 hours'
  ),
  constraint directsign_private_upload_ticket_shape check (
    (
      purpose = 'deliverable'
      and contract_id is not null
      and reservation_id is not null
    )
    or (
      purpose in ('advertiser_verification', 'influencer_verification')
      and contract_id is null
      and requirement_id is null
      and reservation_id is null
    )
  ),
  constraint directsign_private_upload_ticket_finalized_state check (
    (state = 'finalized' and finalized_at is not null)
    or state <> 'finalized'
  ),
  constraint directsign_private_upload_ticket_cleaned_state check (
    (state = 'cleaned' and cleaned_at is not null)
    or state <> 'cleaned'
  ),
  unique (bucket, object_path)
);

create index if not exists directsign_private_upload_ticket_actor_idx
  on public.directsign_private_file_upload_tickets (
    actor_profile_id,
    state,
    finalize_expires_at
  );
create index if not exists directsign_private_upload_ticket_cleanup_idx
  on public.directsign_private_file_upload_tickets (
    cleanup_not_before,
    cleanup_lease_expires_at
  )
  where state in ('issued', 'cleanup_pending');
create index if not exists directsign_private_upload_ticket_erasure_idx
  on public.directsign_private_file_upload_tickets (
    erasure_request_id,
    state,
    cleanup_not_before
  )
  where erasure_request_id is not null;
create index if not exists directsign_private_upload_ticket_cleaned_prune_idx
  on public.directsign_private_file_upload_tickets (cleaned_at, id)
  where state = 'cleaned';
create index if not exists directsign_private_upload_ticket_finalized_prune_idx
  on public.directsign_private_file_upload_tickets (finalized_at, id)
  where state = 'finalized';

alter table public.directsign_private_file_upload_tickets enable row level security;
revoke all on table public.directsign_private_file_upload_tickets
  from public, anon, authenticated, service_role;

create or replace function directsign_private.directsign_private_upload_erasure_active(
  p_actor_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.privacy_erasure_requests as request
    where request.auth_user_id = p_actor_profile_id
      and request.status not in ('completed', 'cancelled')
  )
$$;

revoke all on function
  directsign_private.directsign_private_upload_erasure_active(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.issue_directsign_private_file_upload_ticket(
  p_ticket_id uuid,
  p_purpose text,
  p_actor_profile_id uuid,
  p_resource_id uuid,
  p_contract_id uuid,
  p_requirement_id uuid,
  p_content_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_reservation_id uuid,
  p_max_deliverables integer default 20,
  p_max_contract_bytes bigint default 104857600,
  p_max_creator_daily_bytes bigint default 104857600
)
returns table (
  outcome text,
  ticket_id uuid,
  bucket text,
  object_path text,
  finalize_expires_at timestamptz,
  cleanup_not_before timestamptz
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_role text;
  v_extension text;
  v_area text;
  v_owner_id uuid;
  v_object_path text;
  v_existing public.directsign_private_file_upload_tickets%rowtype;
  v_active_count integer := 0;
  v_unreferenced_bytes bigint := 0;
  v_unreferenced_limit bigint;
  -- A signed resumable-upload capability is path-bound, but Storage does not
  -- enforce the caller-declared ticket size. Every outstanding capability can
  -- therefore consume the bucket's full 10 MiB object limit.
  v_capability_bytes constant bigint := 10485760;
  v_reservation_outcome text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_ticket_id is null
    or p_purpose not in (
      'advertiser_verification',
      'influencer_verification',
      'deliverable'
    )
    or p_actor_profile_id is null
    or p_resource_id is null
    or p_content_type not in (
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp'
    )
    or p_byte_size is null
    or p_byte_size < 1
    or p_byte_size > 10485760
    or lower(coalesce(p_sha256, '')) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid private upload ticket input';
  end if;

  select profile.role::text
  into v_role
  from public.profiles as profile
  where profile.id = p_actor_profile_id;
  if v_role is null
    or (p_purpose = 'advertiser_verification' and v_role <> 'marketer')
    or (p_purpose in ('influencer_verification', 'deliverable') and v_role <> 'influencer') then
    return query select 'actor_invalid', null::uuid, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_extension := case p_content_type
    when 'application/pdf' then 'pdf'
    when 'image/png' then 'png'
    when 'image/jpeg' then 'jpg'
    when 'image/webp' then 'webp'
  end;
  v_area := case p_purpose
    when 'advertiser_verification' then 'verification-advertiser'
    when 'influencer_verification' then 'verification-influencer'
    else 'deliverables'
  end;
  v_owner_id := case when p_purpose = 'deliverable'
    then p_contract_id
    else p_actor_profile_id
  end;

  if p_purpose = 'deliverable' then
    if p_contract_id is null or p_reservation_id is null then
      raise exception using errcode = '22023', message = 'deliverable upload requires contract and reservation ids';
    end if;
    if not exists (
      select 1
      from public.contracts as contract
      join public.directsign_contracts as legacy
        on legacy.id = contract.id::text
      where contract.id = p_contract_id
        and contract.deleted_at is null
        and contract.status::text = 'active'
        and coalesce(legacy.contract ->> 'status', '') = 'SIGNED'
    ) then
      return query select 'contract_invalid', null::uuid, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
    if not exists (
      select 1
      from public.contract_parties as party
      where party.contract_id = p_contract_id
        and party.profile_id = p_actor_profile_id
        and party.party_role::text = 'influencer'
    ) then
      return query select 'actor_invalid', null::uuid, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
    if p_requirement_id is not null and not exists (
      select 1
      from public.deliverable_requirements as requirement
      where requirement.id = p_requirement_id
        and requirement.contract_id = p_contract_id
    ) then
      return query select 'requirement_invalid', null::uuid, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
  elsif p_contract_id is not null
    or p_requirement_id is not null
    or p_reservation_id is not null then
    raise exception using errcode = '22023', message = 'verification upload ticket has deliverable fields';
  end if;

  v_object_path := v_area || '/' || v_owner_id::text || '/'
    || p_resource_id::text || '-evidence.' || v_extension;

  perform pg_advisory_xact_lock(
    hashtextextended('private-upload-ticket:' || p_actor_profile_id::text, 0)
  );

  if directsign_private.directsign_private_upload_erasure_active(
    p_actor_profile_id
  ) then
    return query select 'erasure_in_progress', null::uuid, null::text,
      null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select ticket.*
  into v_existing
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.id = p_ticket_id
  for update;
  if found then
    if v_existing.purpose <> p_purpose
      or v_existing.actor_profile_id <> p_actor_profile_id
      or v_existing.resource_id <> p_resource_id
      or v_existing.contract_id is distinct from p_contract_id
      or v_existing.requirement_id is distinct from p_requirement_id
      or v_existing.reservation_id is distinct from p_reservation_id
      or v_existing.object_path <> v_object_path
      or v_existing.content_type <> p_content_type
      or v_existing.byte_size <> p_byte_size
      or v_existing.sha256 <> lower(p_sha256) then
      return query select 'conflict', v_existing.id, v_existing.bucket,
        v_existing.object_path, v_existing.finalize_expires_at,
        v_existing.cleanup_not_before;
      return;
    end if;
    return query select
      case
        when v_existing.state = 'finalized' then 'finalized'
        when v_existing.state = 'issued' and v_existing.finalize_expires_at > v_now then 'idempotent'
        else 'expired'
      end,
      v_existing.id,
      v_existing.bucket,
      v_existing.object_path,
      v_existing.finalize_expires_at,
      v_existing.cleanup_not_before;
    return;
  end if;

  select count(*)::integer
  into v_active_count
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.actor_profile_id = p_actor_profile_id
    and ticket.purpose = p_purpose
    and ticket.state = 'issued'
    and ticket.finalize_expires_at > v_now;
  if v_active_count >= 3 then
    return query select 'ticket_limit', null::uuid, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Expired initiation windows and cleanup failures must not reset the abuse
  -- budget while an object may still exist. Count every outstanding signed
  -- capability at the bucket maximum rather than trusting the declared size.
  -- Deliverables retain their larger product quota; verification evidence is
  -- intentionally limited to three maximum-sized abandoned files per actor.
  v_unreferenced_limit := case
    when p_purpose = 'deliverable' then p_max_creator_daily_bytes
    else 31457280::bigint
  end;
  select count(*)::bigint * v_capability_bytes
  into v_unreferenced_bytes
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.actor_profile_id = p_actor_profile_id
    and ticket.purpose = p_purpose
    and ticket.state in ('issued', 'cleanup_pending');
  if v_unreferenced_bytes + v_capability_bytes > v_unreferenced_limit then
    return query select 'unreferenced_limit', null::uuid, null::text, null::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_purpose = 'deliverable' then
    select reservation.outcome
    into v_reservation_outcome
    from public.reserve_directsign_deliverable_upload(
      p_reservation_id,
      p_contract_id,
      p_actor_profile_id,
      v_capability_bytes,
      p_max_deliverables,
      p_max_contract_bytes,
      p_max_creator_daily_bytes,
      3600
    ) as reservation;
    if v_reservation_outcome is distinct from 'reserved' then
      return query select v_reservation_outcome, null::uuid, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
  end if;

  insert into public.directsign_private_file_upload_tickets (
    id,
    purpose,
    actor_profile_id,
    resource_id,
    contract_id,
    requirement_id,
    reservation_id,
    bucket,
    object_path,
    content_type,
    byte_size,
    sha256,
    state,
    issued_at,
    finalize_expires_at,
    cleanup_not_before,
    updated_at
  ) values (
    p_ticket_id,
    p_purpose,
    p_actor_profile_id,
    p_resource_id,
    p_contract_id,
    p_requirement_id,
    p_reservation_id,
    'directsign-private',
    v_object_path,
    p_content_type,
    p_byte_size,
    lower(p_sha256),
    'issued',
    v_now,
    v_now + interval '1 hour',
    v_now + interval '27 hours',
    v_now
  );

  return query select 'issued', p_ticket_id, 'directsign-private',
    v_object_path, v_now + interval '1 hour', v_now + interval '27 hours';
end;
$$;

revoke all on function public.issue_directsign_private_file_upload_ticket(
  uuid, text, uuid, uuid, uuid, uuid, text, bigint, text, uuid,
  integer, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.issue_directsign_private_file_upload_ticket(
  uuid, text, uuid, uuid, uuid, uuid, text, bigint, text, uuid,
  integer, bigint, bigint
) to service_role;

create or replace function public.read_directsign_private_file_upload_ticket(
  p_ticket_id uuid,
  p_actor_profile_id uuid,
  p_purpose text,
  p_resource_id uuid,
  p_contract_id uuid default null,
  p_requirement_id uuid default null
)
returns table (
  outcome text,
  ticket_id uuid,
  purpose text,
  actor_profile_id uuid,
  resource_id uuid,
  contract_id uuid,
  requirement_id uuid,
  reservation_id uuid,
  bucket text,
  object_path text,
  content_type text,
  byte_size bigint,
  sha256 text,
  state text,
  finalize_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  v_ticket public.directsign_private_file_upload_tickets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  select ticket.*
  into v_ticket
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.id = p_ticket_id;
  if not found then
    return query select 'not_found', null::uuid, null::text, null::uuid,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::bigint, null::text, null::text, null::timestamptz;
    return;
  end if;
  if v_ticket.actor_profile_id <> p_actor_profile_id
    or v_ticket.purpose <> p_purpose
    or v_ticket.resource_id <> p_resource_id
    or v_ticket.contract_id is distinct from p_contract_id
    or v_ticket.requirement_id is distinct from p_requirement_id then
    return query select 'mismatch', null::uuid, null::text, null::uuid,
      null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::text,
      null::text, null::bigint, null::text, null::text, null::timestamptz;
    return;
  end if;
  return query select 'found', v_ticket.id, v_ticket.purpose,
    v_ticket.actor_profile_id, v_ticket.resource_id, v_ticket.contract_id,
    v_ticket.requirement_id, v_ticket.reservation_id, v_ticket.bucket,
    v_ticket.object_path, v_ticket.content_type, v_ticket.byte_size,
    v_ticket.sha256, v_ticket.state, v_ticket.finalize_expires_at;
end;
$$;

revoke all on function public.read_directsign_private_file_upload_ticket(
  uuid, uuid, text, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.read_directsign_private_file_upload_ticket(
  uuid, uuid, text, uuid, uuid, uuid
) to service_role;

create or replace function public.finalize_directsign_private_file_upload_ticket(
  p_ticket_id uuid,
  p_actor_profile_id uuid,
  p_purpose text,
  p_resource_id uuid,
  p_bucket text,
  p_object_path text,
  p_content_type text,
  p_byte_size bigint,
  p_sha256 text
)
returns text
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_ticket public.directsign_private_file_upload_tickets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('private-upload-ticket:' || p_actor_profile_id::text, 0)
  );
  select ticket.*
  into v_ticket
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.id = p_ticket_id
  for update;
  if not found then return 'not_found'; end if;
  if v_ticket.actor_profile_id <> p_actor_profile_id
    or v_ticket.purpose <> p_purpose
    or v_ticket.resource_id <> p_resource_id
    or v_ticket.bucket <> p_bucket
    or v_ticket.object_path <> p_object_path
    or v_ticket.content_type <> p_content_type
    or v_ticket.byte_size <> p_byte_size
    or v_ticket.sha256 <> lower(coalesce(p_sha256, '')) then
    return 'mismatch';
  end if;
  if p_purpose in ('advertiser_verification', 'influencer_verification')
    and not exists (
      select 1
      from public.verification_requests as verification
      where verification.id = p_resource_id
        and verification.profile_id = p_actor_profile_id
        and verification.evidence_snapshot_json #>> '{evidence_file,provider}'
          = 'supabase_storage'
        and verification.evidence_snapshot_json #>> '{evidence_file,bucket}'
          = v_ticket.bucket
        and verification.evidence_snapshot_json #>> '{evidence_file,path}'
          = v_ticket.object_path
        and verification.evidence_snapshot_json #>> '{evidence_file,content_type}'
          = v_ticket.content_type
        and verification.evidence_snapshot_json #>> '{evidence_file,byte_size}'
          = v_ticket.byte_size::text
        and verification.evidence_snapshot_json #>> '{evidence_file,sha256}'
          = v_ticket.sha256
    ) then
    return 'mismatch';
  end if;
  if v_ticket.state = 'finalized' then return 'idempotent'; end if;
  if directsign_private.directsign_private_upload_erasure_active(
    p_actor_profile_id
  ) then
    return 'expired';
  end if;
  if v_ticket.state <> 'issued' or v_ticket.finalize_expires_at <= v_now then
    return 'expired';
  end if;
  update public.directsign_private_file_upload_tickets as ticket
  set state = 'finalized', finalized_at = v_now, updated_at = v_now,
    cleanup_lease_owner = null, cleanup_lease_expires_at = null
  where ticket.id = p_ticket_id;
  return 'finalized';
end;
$$;

revoke all on function public.finalize_directsign_private_file_upload_ticket(
  uuid, uuid, text, uuid, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.finalize_directsign_private_file_upload_ticket(
  uuid, uuid, text, uuid, text, text, text, bigint, text
) to service_role;

create or replace function public.insert_directsign_verification_request_from_ticket(
  p_upload_ticket_id uuid,
  p_actor_profile_id uuid,
  p_purpose text,
  p_record jsonb
)
returns table (
  outcome text,
  verification_request jsonb
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_ticket public.directsign_private_file_upload_tickets%rowtype;
  v_requested public.verification_requests%rowtype;
  v_existing public.verification_requests%rowtype;
  v_evidence jsonb;
  v_expected_target_type text;
  v_expected_role text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_purpose not in ('advertiser_verification', 'influencer_verification')
    or p_record is null
    or jsonb_typeof(p_record) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid verification ticket finalization input';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('private-upload-ticket:' || p_actor_profile_id::text, 0)
  );

  select populated.*
  into v_requested
  from jsonb_populate_record(null::public.verification_requests, p_record)
    as populated;
  v_evidence := v_requested.evidence_snapshot_json -> 'evidence_file';
  v_expected_target_type := case p_purpose
    when 'advertiser_verification' then 'advertiser_organization'
    else 'influencer_account'
  end;
  v_expected_role := case p_purpose
    when 'advertiser_verification' then 'marketer'
    else 'influencer'
  end;

  select ticket.*
  into v_ticket
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.id = p_upload_ticket_id
  for update;
  if not found then
    return query select 'upload_ticket_invalid', null::jsonb;
    return;
  end if;

  if v_ticket.purpose <> p_purpose
    or v_ticket.actor_profile_id <> p_actor_profile_id
    or v_ticket.resource_id <> v_requested.id
    or v_ticket.contract_id is not null
    or v_ticket.requirement_id is not null
    or v_ticket.reservation_id is not null
    or v_requested.id <> p_upload_ticket_id
    or v_requested.profile_id <> p_actor_profile_id
    or v_requested.target_type::text <> v_expected_target_type
    or v_requested.status::text <> 'pending'
    or v_requested.reviewed_at is not null
    or v_requested.reviewed_by_profile_id is not null
    or v_requested.reviewed_by_name is not null
    or v_requested.reviewer_note is not null
    or (
      p_purpose = 'advertiser_verification'
      and (
        v_requested.verification_type::text <>
          'business_registration_certificate'
        or v_requested.organization_id is null
        or v_requested.target_id <> v_requested.organization_id::text
        or not exists (
          select 1
          from public.organizations as organization
          join public.organization_members as membership
            on membership.organization_id = organization.id
          where organization.id = v_requested.organization_id
            and organization.organization_type = 'advertiser'
            and organization.deleted_at is null
            and membership.profile_id = p_actor_profile_id
            and membership.role::text in ('owner', 'admin', 'marketer')
        )
      )
    )
    or (
      p_purpose = 'influencer_verification'
      and (
        v_requested.verification_type::text <> 'platform_account'
        or v_requested.target_id <> p_actor_profile_id::text
        or v_requested.organization_id is not null
      )
    )
    or not exists (
      select 1
      from public.profiles as profile
      where profile.id = p_actor_profile_id
        and profile.role::text = v_expected_role
    )
    or coalesce(v_requested.evidence_file_mime, '') <> v_ticket.content_type
    or coalesce(v_requested.evidence_file_size, -1)::bigint <> v_ticket.byte_size
    or jsonb_typeof(v_evidence) is distinct from 'object'
    or v_evidence ->> 'provider' <> 'supabase_storage'
    or v_evidence ->> 'bucket' <> v_ticket.bucket
    or v_evidence ->> 'path' <> v_ticket.object_path
    or v_evidence ->> 'content_type' <> v_ticket.content_type
    or coalesce(v_evidence ->> 'byte_size', '') !~ '^[0-9]{1,11}$'
    or (v_evidence ->> 'byte_size')::bigint <> v_ticket.byte_size
    or v_evidence ->> 'sha256' <> v_ticket.sha256 then
    return query select 'upload_ticket_invalid', null::jsonb;
    return;
  end if;

  if v_ticket.state = 'finalized' then
    select request.*
    into v_existing
    from public.verification_requests as request
    where request.id = v_requested.id;
    if found
      and v_existing.profile_id = p_actor_profile_id
      and v_existing.evidence_snapshot_json #>> '{evidence_file,provider}' =
        v_evidence ->> 'provider'
      and v_existing.evidence_snapshot_json #>> '{evidence_file,bucket}' =
        v_evidence ->> 'bucket'
      and v_existing.evidence_snapshot_json #>> '{evidence_file,path}' =
        v_evidence ->> 'path'
      and v_existing.evidence_snapshot_json #>> '{evidence_file,content_type}' =
        v_evidence ->> 'content_type'
      and v_existing.evidence_snapshot_json #>> '{evidence_file,byte_size}' =
        v_evidence ->> 'byte_size'
      and v_existing.evidence_snapshot_json #>> '{evidence_file,sha256}' =
        v_evidence ->> 'sha256' then
      return query select 'idempotent', to_jsonb(v_existing);
    else
      return query select 'upload_ticket_invalid', null::jsonb;
    end if;
    return;
  end if;
  if directsign_private.directsign_private_upload_erasure_active(
    p_actor_profile_id
  ) then
    return query select 'upload_ticket_expired', null::jsonb;
    return;
  end if;
  if v_ticket.state <> 'issued' or v_ticket.finalize_expires_at <= v_now then
    return query select 'upload_ticket_expired', null::jsonb;
    return;
  end if;

  insert into public.verification_requests
  select v_requested.*
  returning * into v_existing;

  update public.directsign_private_file_upload_tickets as ticket
  set state = 'finalized', finalized_at = v_now, updated_at = v_now,
    cleanup_lease_owner = null, cleanup_lease_expires_at = null
  where ticket.id = p_upload_ticket_id;

  return query select 'inserted', to_jsonb(v_existing);
end;
$$;

revoke all on function public.insert_directsign_verification_request_from_ticket(
  uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.insert_directsign_verification_request_from_ticket(
  uuid, uuid, text, jsonb
) to service_role;

create or replace function public.finalize_directsign_deliverable_submission_from_ticket(
  p_upload_ticket_id uuid,
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
  v_ticket public.directsign_private_file_upload_tickets%rowtype;
  v_outcome text;
  v_total integer := 0;
  v_submitted integer := 0;
  v_approved integer := 0;
  v_file_size bigint;
  v_capability_bytes constant bigint := 10485760;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_file is null
    or jsonb_typeof(p_file) <> 'object'
    or coalesce(p_file ->> 'byte_size', '') !~ '^[0-9]{1,11}$' then
    raise exception using errcode = '22023', message = 'ticket finalization requires file metadata';
  end if;
  v_file_size := (p_file ->> 'byte_size')::bigint;

  perform pg_advisory_xact_lock(
    hashtextextended('private-upload-ticket:' || p_creator_profile_id::text, 0)
  );

  select ticket.*
  into v_ticket
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.id = p_upload_ticket_id
  for update;
  if not found then
    return query select 'upload_ticket_invalid', 0, 0, 0;
    return;
  end if;
  if v_ticket.purpose <> 'deliverable'
    or v_ticket.actor_profile_id <> p_creator_profile_id
    or v_ticket.resource_id <> p_deliverable_id
    or v_ticket.contract_id <> p_contract_id
    or v_ticket.requirement_id is distinct from p_requirement_id
    or v_ticket.reservation_id <> p_reservation_id
    or v_ticket.bucket <> p_file ->> 'bucket'
    or v_ticket.object_path <> p_file ->> 'storage_path'
    or v_ticket.content_type <> p_file ->> 'content_type'
    or v_ticket.byte_size <> v_file_size
    or v_ticket.sha256 <> p_file ->> 'file_hash' then
    return query select 'upload_ticket_invalid', 0, 0, 0;
    return;
  end if;
  if v_ticket.state = 'finalized' then
    if not exists (
      select 1
      from public.deliverables as deliverable
      join public.contract_files as file
        on file.contract_id = deliverable.contract_id
       and file.related_type = 'deliverable'
       and file.related_id = deliverable.id
      where deliverable.id = p_deliverable_id
        and deliverable.contract_id = p_contract_id
        and deliverable.creator_profile_id = p_creator_profile_id
        and file.bucket = v_ticket.bucket
        and file.storage_path = v_ticket.object_path
        and file.content_type = v_ticket.content_type
        and file.byte_size = v_ticket.byte_size
        and file.file_hash = v_ticket.sha256
    ) then
      return query select 'upload_ticket_invalid', 0, 0, 0;
      return;
    end if;
    return query select 'idempotent', 0, 0, 0;
    return;
  end if;
  if directsign_private.directsign_private_upload_erasure_active(
    p_creator_profile_id
  ) then
    return query select 'upload_ticket_expired', 0, 0, 0;
    return;
  end if;
  if v_ticket.state <> 'issued'
    or v_ticket.finalize_expires_at <= clock_timestamp() then
    return query select 'upload_ticket_expired', 0, 0, 0;
    return;
  end if;

  -- Preserve the lock order used by the authoritative finalizer before
  -- shrinking the pessimistic capability reservation to the byte count that
  -- the server verified from Storage. A non-committing outcome restores the
  -- 10 MiB reservation below, and an exception rolls this update back.
  perform legacy.id
  from public.directsign_contracts as legacy
  where legacy.id = p_contract_id::text
  for update;
  perform contract.id
  from public.contracts as contract
  where contract.id = p_contract_id
  for update;
  update public.directsign_deliverable_upload_reservations as reservation
  set byte_size = v_file_size
  where reservation.id = p_reservation_id
    and reservation.contract_id = p_contract_id
    and reservation.creator_profile_id = p_creator_profile_id;

  select result.outcome, result.total, result.submitted, result.approved
  into v_outcome, v_total, v_submitted, v_approved
  from public.finalize_directsign_deliverable_submission(
    p_contract_id,
    p_expected_contract_updated_at,
    p_updated_legacy_contract,
    p_deliverable_id,
    p_requirement_id,
    p_creator_profile_id,
    p_title,
    p_url,
    p_metadata,
    p_file,
    p_reservation_id,
    p_submitted_event_id,
    p_ready_event_id,
    p_actor_display_name,
    p_event_ip,
    p_event_user_agent,
    p_occurred_at
  ) as result;

  if v_outcome = 'submitted' then
    update public.directsign_private_file_upload_tickets as ticket
    set state = 'finalized', finalized_at = clock_timestamp(),
      updated_at = clock_timestamp(), cleanup_lease_owner = null,
      cleanup_lease_expires_at = null
    where ticket.id = p_upload_ticket_id;
  else
    update public.directsign_deliverable_upload_reservations as reservation
    set byte_size = v_capability_bytes
    where reservation.id = p_reservation_id
      and reservation.contract_id = p_contract_id
      and reservation.creator_profile_id = p_creator_profile_id;
  end if;
  return query select v_outcome, v_total, v_submitted, v_approved;
end;
$$;

revoke all on function public.finalize_directsign_deliverable_submission_from_ticket(
  uuid, uuid, timestamptz, jsonb, uuid, uuid, uuid, text, text, jsonb, jsonb,
  uuid, uuid, uuid, text, inet, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.finalize_directsign_deliverable_submission_from_ticket(
  uuid, uuid, timestamptz, jsonb, uuid, uuid, uuid, text, text, jsonb, jsonb,
  uuid, uuid, uuid, text, inet, text, timestamptz
) to service_role;

create or replace function public.claim_directsign_private_upload_cleanup(
  p_lease_owner uuid,
  p_limit integer,
  p_lease_seconds integer default 300
)
returns setof public.directsign_private_file_upload_tickets
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_lease_owner is null or p_limit < 1 or p_limit > 100
    or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'invalid upload cleanup lease';
  end if;
  return query
  with candidates as (
    select ticket.id
    from public.directsign_private_file_upload_tickets as ticket
    where ticket.state in ('issued', 'cleanup_pending')
      and ticket.erasure_request_id is null
      and ticket.cleanup_not_before <= clock_timestamp()
      and (
        ticket.cleanup_lease_expires_at is null
        or ticket.cleanup_lease_expires_at <= clock_timestamp()
      )
    order by ticket.cleanup_not_before, ticket.id
    limit p_limit
    for update skip locked
  )
  update public.directsign_private_file_upload_tickets as ticket
  set state = 'cleanup_pending', cleanup_lease_owner = p_lease_owner,
    cleanup_lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
    cleanup_attempts = ticket.cleanup_attempts + 1,
    updated_at = clock_timestamp()
  from candidates
  where ticket.id = candidates.id
  returning ticket.*;
end;
$$;

revoke all on function public.claim_directsign_private_upload_cleanup(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.claim_directsign_private_upload_cleanup(
  uuid, integer, integer
) to service_role;

create or replace function public.complete_directsign_private_upload_cleanup(
  p_ticket_id uuid,
  p_lease_owner uuid,
  p_outcome text,
  p_error_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_ticket public.directsign_private_file_upload_tickets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_outcome not in ('referenced', 'cleaned', 'retry')
    or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_]{0,63}$') then
    raise exception using errcode = '22023', message = 'invalid upload cleanup outcome';
  end if;
  select ticket.* into v_ticket
  from public.directsign_private_file_upload_tickets as ticket
  where ticket.id = p_ticket_id
  for update;
  if not found then return 'not_found'; end if;
  if v_ticket.state = 'finalized' then return 'finalized'; end if;
  if v_ticket.state = 'cleaned' then return 'cleaned'; end if;
  if v_ticket.state <> 'cleanup_pending'
    or v_ticket.cleanup_lease_owner is distinct from p_lease_owner
    or v_ticket.cleanup_lease_expires_at <= clock_timestamp() then
    return 'lease_lost';
  end if;
  if p_outcome = 'referenced' then
    update public.directsign_private_file_upload_tickets as ticket
    set state = 'finalized', finalized_at = clock_timestamp(),
      cleanup_lease_owner = null, cleanup_lease_expires_at = null,
      last_error_code = null, updated_at = clock_timestamp()
    where ticket.id = p_ticket_id;
    return 'finalized';
  end if;
  if p_outcome = 'cleaned' then
    update public.directsign_private_file_upload_tickets as ticket
    set state = 'cleaned', cleaned_at = clock_timestamp(),
      cleanup_lease_owner = null, cleanup_lease_expires_at = null,
      last_error_code = null, updated_at = clock_timestamp()
    where ticket.id = p_ticket_id;
    return 'cleaned';
  end if;
  update public.directsign_private_file_upload_tickets as ticket
  set state = 'cleanup_pending', cleanup_lease_owner = null,
    cleanup_lease_expires_at = null, last_error_code = p_error_code,
    cleanup_not_before = greatest(
      ticket.cleanup_not_before,
      clock_timestamp() + interval '1 hour'
    ), updated_at = clock_timestamp()
  where ticket.id = p_ticket_id;
  return 'retry';
end;
$$;

revoke all on function public.complete_directsign_private_upload_cleanup(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.complete_directsign_private_upload_cleanup(
  uuid, uuid, text, text
) to service_role;

-- Ticket rows contain private object paths, hashes, and actor/resource ids.
-- Ordinary cleanup receipts are retained for 30 days so ambiguous cleanup can
-- be investigated, then removed in bounded batches. A finalized ticket is
-- removable only after the authoritative evidence reference is absent and an
-- exact completed privacy Storage deletion proves that its object is gone.
create or replace function public.prune_directsign_private_file_upload_tickets(
  p_limit integer default 100,
  p_now timestamptz default null
)
returns table (
  cleaned_pruned integer,
  finalized_pruned integer,
  total_pruned integer
)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '120s'
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_hold_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'invalid upload ticket prune limit';
  end if;
  if v_now > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'invalid upload ticket prune time';
  end if;

  -- Legal-hold create/release mutations use this same transaction advisory
  -- barrier. Keep the hold check and metadata delete indivisible with respect
  -- to a new or expanded hold.
  perform directsign_private.directsign_lock_privacy_storage_barrier();
  -- Read the hold clock only after acquiring the barrier. A caller-supplied
  -- historical retention boundary must never make a current hold invisible.
  v_hold_now := clock_timestamp();

  return query
  with candidates as (
    select ticket.id
    from public.directsign_private_file_upload_tickets as ticket
    where (
        (
          ticket.state = 'cleaned'
          and ticket.cleaned_at is not null
          and ticket.cleaned_at + interval '30 days' <= v_now
          and (
            ticket.erasure_request_id is null
            or exists (
              select 1
              from public.privacy_erasure_requests as erasure
              where erasure.id = ticket.erasure_request_id
                and erasure.auth_user_id = ticket.actor_profile_id
                and erasure.status = 'completed'
            )
          )
        )
        or (
          ticket.state = 'finalized'
          and ticket.finalized_at is not null
          and exists (
            select 1
            from public.privacy_storage_deletion_queue as deletion
            where deletion.bucket = ticket.bucket
              and deletion.object_path = ticket.object_path
              and deletion.status = 'completed'
              and deletion.completed_at is not null
              and (
                (
                  ticket.purpose in (
                    'advertiser_verification',
                    'influencer_verification'
                  )
                  and deletion.source_type = 'verification_request'
                  and deletion.source_id = ticket.resource_id::text
                  and deletion.category = 'verification'
                )
                or (
                  ticket.purpose = 'deliverable'
                  and deletion.source_type = 'contract'
                  and deletion.source_id = ticket.contract_id::text
                  and deletion.category = 'contract'
                )
              )
          )
        )
      )
      -- A cleanup outcome can race with creation of the durable reference.
      -- Never prune while the exact immutable evidence identity still exists.
      and not exists (
        select 1
        from public.verification_requests as verification
        where ticket.purpose in (
            'advertiser_verification',
            'influencer_verification'
          )
          and verification.id = ticket.resource_id
          and verification.profile_id = ticket.actor_profile_id
          and verification.evidence_snapshot_json #>>
            '{evidence_file,provider}' = 'supabase_storage'
          and verification.evidence_snapshot_json #>>
            '{evidence_file,bucket}' = ticket.bucket
          and verification.evidence_snapshot_json #>>
            '{evidence_file,path}' = ticket.object_path
          and verification.evidence_snapshot_json #>>
            '{evidence_file,content_type}' = ticket.content_type
          and verification.evidence_snapshot_json #>>
            '{evidence_file,byte_size}' = ticket.byte_size::text
          and verification.evidence_snapshot_json #>>
            '{evidence_file,sha256}' = ticket.sha256
      )
      and not exists (
        select 1
        from public.deliverables as deliverable
        join public.contract_files as file
          on file.contract_id = deliverable.contract_id
         and file.related_type = 'deliverable'
         and file.related_id = deliverable.id
        where ticket.purpose = 'deliverable'
          and deliverable.id = ticket.resource_id
          and deliverable.contract_id = ticket.contract_id
          and deliverable.creator_profile_id = ticket.actor_profile_id
          and file.uploaded_by_profile_id = ticket.actor_profile_id
          and file.bucket = ticket.bucket
          and file.storage_path = ticket.object_path
          and file.content_type = ticket.content_type
          and file.byte_size = ticket.byte_size
          and file.file_hash = ticket.sha256
      )
      -- Re-evaluate holds at prune time even though a completed deletion queue
      -- item proves the Storage worker passed its own hold gate earlier.
      and not directsign_private.directsign_privacy_hold_active(
        'retention_category',
        case when ticket.purpose = 'deliverable' then 'contract'
          else 'verification' end,
        case when ticket.purpose = 'deliverable' then 'contract'
          else 'verification' end,
        v_hold_now
      )
      and not directsign_private.directsign_privacy_hold_active(
        'profile',
        ticket.actor_profile_id::text,
        case when ticket.purpose = 'deliverable' then 'contract'
          else 'verification' end,
        v_hold_now
      )
      and not (
        ticket.purpose in (
          'advertiser_verification',
          'influencer_verification'
        )
        and directsign_private.directsign_privacy_hold_active(
          'verification_request',
          ticket.resource_id::text,
          'verification',
          v_hold_now
        )
      )
      and not (
        ticket.purpose = 'deliverable'
        and directsign_private.directsign_privacy_hold_active(
          'contract',
          ticket.contract_id::text,
          'contract',
          v_hold_now
        )
      )
    order by coalesce(ticket.cleaned_at, ticket.finalized_at), ticket.id
    limit p_limit
    for update of ticket skip locked
  ), deleted as (
    delete from public.directsign_private_file_upload_tickets as ticket
    using candidates
    where ticket.id = candidates.id
    returning ticket.state
  )
  select
    count(*) filter (where deleted.state = 'cleaned')::integer,
    count(*) filter (where deleted.state = 'finalized')::integer,
    count(*)::integer
  from deleted;
end;
$$;

revoke all on function public.prune_directsign_private_file_upload_tickets(
  integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.prune_directsign_private_file_upload_tickets(
  integer, timestamptz
) to service_role;
comment on function public.prune_directsign_private_file_upload_tickets(
  integer, timestamptz
) is
  'Service-only bounded SKIP LOCKED pruning: cleaned ticket metadata after 30 days, or finalized metadata only after exact reference absence, completed Storage deletion proof, and current legal-hold checks.';

-- Account erasure must invalidate application finalization immediately, but a
-- signed resumable upload may still finish after that point. A signature can
-- be minted until the one-hour ticket window closes, and the resulting TUS
-- resource can remain resumable for 24 hours. The ticket's existing 27-hour
-- cleanup boundary is therefore also the earliest safe external DELETE time.
create or replace function
  directsign_private.directsign_attach_private_uploads_to_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    delete from public.directsign_private_file_upload_tickets as ticket
    where ticket.erasure_request_id = new.id
      and ticket.actor_profile_id = new.auth_user_id
      and ticket.state = 'cleaned';
    return new;
  end if;
  if new.status = 'cancelled' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'private-upload-ticket:' || new.auth_user_id::text,
      0
    )
  );

  -- Reconcile an already-completed exact queue item before replaying the
  -- erasure trigger, so a successful external delete is never re-queued.
  update public.directsign_private_file_upload_tickets as ticket
  set
    state = 'cleaned',
    cleaned_at = coalesce(ticket.cleaned_at, queue.completed_at),
    erasure_request_id = new.id,
    cleanup_lease_owner = null,
    cleanup_lease_expires_at = null,
    last_error_code = null,
    updated_at = clock_timestamp()
  from public.privacy_storage_deletion_queue as queue
  where ticket.actor_profile_id = new.auth_user_id
    and ticket.state = 'cleanup_pending'
    and queue.erasure_request_id = new.id
    and queue.source_type = 'account'
    and queue.source_id = new.auth_user_id::text
    and queue.category = 'account'
    and queue.bucket = ticket.bucket
    and queue.object_path = ticket.object_path
    and queue.status = 'completed';

  with invalidated as (
    update public.directsign_private_file_upload_tickets as ticket
    set
      state = 'cleanup_pending',
      erasure_request_id = new.id,
      cleanup_lease_owner = null,
      cleanup_lease_expires_at = null,
      last_error_code = 'account_erasure',
      updated_at = clock_timestamp()
    where ticket.actor_profile_id = new.auth_user_id
      and ticket.state in ('issued', 'cleanup_pending')
    returning ticket.*
  )
  insert into public.privacy_storage_deletion_queue (
    erasure_request_id,
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    available_at,
    created_at,
    updated_at
  )
  select
    new.id,
    'account',
    new.auth_user_id::text,
    'account',
    invalidated.bucket,
    invalidated.object_path,
    invalidated.cleanup_not_before,
    invalidated.cleanup_not_before,
    clock_timestamp(),
    clock_timestamp()
  from invalidated
  on conflict (source_type, source_id, bucket, object_path) do update
  set
    erasure_request_id = excluded.erasure_request_id,
    due_at = greatest(
      public.privacy_storage_deletion_queue.due_at,
      excluded.due_at
    ),
    available_at = greatest(
      public.privacy_storage_deletion_queue.available_at,
      excluded.available_at
    ),
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function
  directsign_private.directsign_attach_private_uploads_to_erasure()
  from public, anon, authenticated, service_role;

drop trigger if exists privacy_erasure_private_upload_gate
  on public.privacy_erasure_requests;
create trigger privacy_erasure_private_upload_gate
after insert or update on public.privacy_erasure_requests
for each row execute function
  directsign_private.directsign_attach_private_uploads_to_erasure();

create or replace function
  directsign_private.directsign_complete_erased_private_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'completed'
    or old.status = 'completed'
    or new.erasure_request_id is null
    or new.source_type <> 'account'
    or new.category <> 'account' then
    return new;
  end if;

  delete from public.directsign_deliverable_upload_reservations as reservation
  using public.directsign_private_file_upload_tickets as ticket
  where ticket.erasure_request_id = new.erasure_request_id
    and ticket.actor_profile_id::text = new.source_id
    and ticket.bucket = new.bucket
    and ticket.object_path = new.object_path
    and ticket.state = 'cleanup_pending'
    and reservation.id = ticket.reservation_id;

  update public.directsign_private_file_upload_tickets as ticket
  set
    state = 'cleaned',
    cleaned_at = coalesce(ticket.cleaned_at, new.completed_at),
    cleanup_lease_owner = null,
    cleanup_lease_expires_at = null,
    last_error_code = null,
    updated_at = clock_timestamp()
  where ticket.erasure_request_id = new.erasure_request_id
    and ticket.actor_profile_id::text = new.source_id
    and ticket.bucket = new.bucket
    and ticket.object_path = new.object_path
    and ticket.state = 'cleanup_pending';

  return new;
end;
$$;

revoke all on function
  directsign_private.directsign_complete_erased_private_upload()
  from public, anon, authenticated, service_role;

drop trigger if exists privacy_storage_private_upload_completion
  on public.privacy_storage_deletion_queue;
create trigger privacy_storage_private_upload_completion
after update of status on public.privacy_storage_deletion_queue
for each row execute function
  directsign_private.directsign_complete_erased_private_upload();

-- Reconcile an erasure that was already active when this migration was
-- deployed. The no-op timestamp assignment intentionally fires the gate.
update public.privacy_erasure_requests
set updated_at = updated_at
where status not in ('completed', 'cancelled');

comment on table public.directsign_private_file_upload_tickets is
  'Service-only capabilities that bind a signed direct Storage upload to one actor, resource, immutable path, MIME, byte count, hash, quota reservation, and delayed orphan cleanup.';

notify pgrst, 'reload schema';
commit;
