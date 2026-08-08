-- Final corrective migration after 20260808120000/130000/140000 were applied remotely.
-- Those applied history files stay byte-identical to remote; this migration
-- idempotently reapplies the reviewed privacy-retention guarantees.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Converted campaign applications remain five-year evidence. Keep the brand
-- UUID as an immutable snapshot instead of ON DELETE SET NULL mutating proof.
alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_target_brand_profile_id_fkey;

-- Campaign contact evidence may be held at its own source boundary in addition
-- to profile, organization, contract, and whole-category holds.
alter table public.privacy_legal_holds
  drop constraint if exists privacy_legal_holds_scope_type_allowed;
alter table public.privacy_legal_holds
  add constraint privacy_legal_holds_scope_type_allowed check (
    scope_type in (
      'profile',
      'organization',
      'contract',
      'campaign',
      'campaign_application',
      'verification_request',
      'support_ticket',
      'support_access_request',
      'retention_category'
    )
  );

-- A held marketplace proposal can outlive the public profile, campaign, or
-- contract row that originally linked it to the hold. Quarantine the complete
-- private evidence plus the scope identifiers needed to re-evaluate the hold,
-- while deleting the ordinary application row immediately. Destroy the
-- quarantine as soon as the hold is released.
create table if not exists public.privacy_held_marketplace_proposals (
  proposal_id uuid primary key,
  evidence_snapshot jsonb not null,
  due_at timestamptz not null,
  sender_profile_id uuid,
  target_owner_profile_id uuid,
  sender_organization_id uuid,
  target_organization_id uuid,
  campaign_organization_id uuid,
  campaign_id text,
  converted_contract_id uuid,
  first_delete_attempt_at timestamptz not null,
  last_delete_attempt_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint privacy_held_marketplace_proposals_attempt_order check (
    first_delete_attempt_at <= last_delete_attempt_at
  )
);

-- An earlier in-progress version used the live proposal as the parent. A
-- legal-hold quarantine must instead survive deleting that customer-visible
-- row, so upgrade that shape idempotently before installing the trigger.
alter table public.privacy_held_marketplace_proposals
  drop constraint if exists privacy_held_marketplace_proposals_proposal_id_fkey;
alter table public.privacy_held_marketplace_proposals
  add column if not exists evidence_snapshot jsonb;
update public.privacy_held_marketplace_proposals as deferred
set evidence_snapshot = to_jsonb(proposal)
from public.marketplace_contact_proposals as proposal
where proposal.id = deferred.proposal_id
  and deferred.evidence_snapshot is null;
alter table public.privacy_held_marketplace_proposals
  alter column evidence_snapshot set not null;

alter table public.privacy_held_marketplace_proposals enable row level security;
alter table public.privacy_held_marketplace_proposals force row level security;

create index if not exists privacy_held_marketplace_proposals_due_idx
  on public.privacy_held_marketplace_proposals (due_at, proposal_id);

-- A worker must obtain a fresh, short authorization immediately before the
-- external Storage API DELETE. Claiming alone never authorizes deletion.
alter table public.privacy_storage_deletion_queue
  add column if not exists authorized_at timestamptz,
  add column if not exists authorization_expires_at timestamptz;

-- Idempotency replays are valid only for the exact same batch semantics.
-- A short DB lease makes abandoned failed/running rows retryable while an
-- actually running worker remains unambiguously exclusive.
alter table public.privacy_retention_runs
  add column if not exists requested_limit integer,
  add column if not exists attempt_count integer,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

-- Before this corrective migration, the only production caller used 500.
-- Preserve that known server contract for already-written remote rows.
update public.privacy_retention_runs
set
  requested_limit = coalesce(requested_limit, 500),
  attempt_count = greatest(coalesce(attempt_count, 0), 1),
  lease_token = case
    when status = 'running' then coalesce(lease_token, gen_random_uuid())
    else null
  end,
  lease_expires_at = case
    when status = 'running' then coalesce(
      lease_expires_at, clock_timestamp()
    )
    else null
  end;

alter table public.privacy_retention_runs
  alter column requested_limit set not null,
  alter column attempt_count set not null,
  alter column attempt_count set default 1;

alter table public.privacy_retention_runs
  drop constraint if exists privacy_retention_runs_requested_limit_range;
alter table public.privacy_retention_runs
  add constraint privacy_retention_runs_requested_limit_range check (
    requested_limit between 1 and 500
  );

alter table public.privacy_retention_runs
  drop constraint if exists privacy_retention_runs_attempt_positive;
alter table public.privacy_retention_runs
  add constraint privacy_retention_runs_attempt_positive check (
    attempt_count >= 1
  );

alter table public.privacy_retention_runs
  drop constraint if exists privacy_retention_runs_lease_state;
alter table public.privacy_retention_runs
  add constraint privacy_retention_runs_lease_state check (
    (
      status = 'running'
      and lease_token is not null
      and lease_expires_at is not null
      and completed_at is null
    )
    or (
      status <> 'running'
      and lease_token is null
      and lease_expires_at is null
    )
  );

-- Reconcile only impossible legacy lease states before tightening the state
-- machine. Valid in-flight workers keep their leases untouched.
update public.privacy_storage_deletion_queue
set
  status = 'failed',
  available_at = clock_timestamp(),
  lease_owner = null,
  lease_expires_at = null,
  authorized_at = null,
  authorization_expires_at = null,
  last_error_code = 'lease_state_invalid',
  updated_at = clock_timestamp()
where status = 'processing'
  and (lease_owner is null or lease_expires_at is null);

update public.privacy_storage_deletion_queue
set
  lease_owner = null,
  lease_expires_at = null,
  authorized_at = null,
  authorization_expires_at = null,
  updated_at = clock_timestamp()
where status <> 'processing'
  and (
    lease_owner is not null
    or lease_expires_at is not null
    or authorized_at is not null
    or authorization_expires_at is not null
  );

alter table public.privacy_storage_deletion_queue
  drop constraint if exists privacy_storage_queue_processing_lease_state;
alter table public.privacy_storage_deletion_queue
  add constraint privacy_storage_queue_processing_lease_state check (
    (
      status = 'processing'
      and lease_owner is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'processing'
      and lease_owner is null
      and lease_expires_at is null
    )
  );

alter table public.privacy_storage_deletion_queue
  drop constraint if exists privacy_storage_queue_authorization_pair;
alter table public.privacy_storage_deletion_queue
  add constraint privacy_storage_queue_authorization_pair check (
    (
      authorized_at is null
      and authorization_expires_at is null
    )
    or (
      authorized_at is not null
      and authorization_expires_at is not null
      and lease_owner is not null
      and lease_expires_at is not null
      and authorization_expires_at > authorized_at
      and authorization_expires_at <= authorized_at + interval '30 seconds'
      and authorization_expires_at <= lease_expires_at
      and status = 'processing'
    )
  );

create or replace function directsign_private.directsign_lock_privacy_storage_barrier()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'directsign:privacy-storage-hold-barrier', 94731
    )
  );
end;
$$;

-- Match a prospective hold to a queue item without using the hold's current
-- clock state. This must be defined before the backlog RPC below references it.
create or replace function directsign_private.directsign_storage_queue_matches_hold(
  p_source_type text,
  p_source_id text,
  p_category text,
  p_scope_type text,
  p_scope_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_advertiser_id text;
  v_contract public.contracts%rowtype;
  v_verification public.verification_requests%rowtype;
begin
  if p_source_type = 'account' then
    return false;
  end if;

  if p_scope_type = 'retention_category'
    and p_scope_id in (p_category, 'all') then
    return true;
  end if;

  if p_source_type = 'contract'
    and p_source_id ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select contract.* into v_contract
    from public.contracts as contract
    where contract.id = p_source_id::uuid;

    if not found then
      return false;
    end if;

    return coalesce(
      (p_scope_type = 'contract' and p_scope_id in (
        p_source_id, v_contract.legacy_contract_id
      ))
      or (
        p_scope_type = 'organization'
        and p_scope_id = v_contract.owner_organization_id::text
      )
      or (
        p_scope_type = 'profile'
        and (
          p_scope_id = v_contract.created_by_profile_id::text
          or exists (
            select 1
            from public.contract_parties as party
            where party.contract_id = v_contract.id
              and party.profile_id::text = p_scope_id
          )
          or exists (
            select 1
            from public.contract_events as event
            where event.contract_id = v_contract.id
              and event.actor_profile_id::text = p_scope_id
          )
        )
      ),
      false
    );
  end if;

  if p_source_type = 'legacy_contract' then
    select legacy.advertiser_id into v_advertiser_id
    from public.directsign_contracts as legacy
    where legacy.id = p_source_id;

    return coalesce(
      (p_scope_type = 'contract' and p_scope_id = p_source_id)
      or (p_scope_type = 'profile' and p_scope_id = v_advertiser_id),
      false
    );
  end if;

  if p_source_type = 'verification_request'
    and p_source_id ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select request.* into v_verification
    from public.verification_requests as request
    where request.id = p_source_id::uuid;

    if not found then
      return false;
    end if;

    return coalesce(
      (p_scope_type = 'verification_request' and p_scope_id = p_source_id)
      or (
        p_scope_type = 'profile'
        and p_scope_id in (
          v_verification.profile_id::text,
          v_verification.target_id
        )
      )
      or (
        p_scope_type = 'organization'
        and p_scope_id in (
          v_verification.organization_id::text,
          v_verification.target_id
        )
      ),
      false
    );
  end if;

  return false;
end;
$$;

-- Re-evaluate every scope that can lawfully retain a campaign application or
-- one-to-one proposal. Snapshot columns keep this decision possible after the
-- public profile/campaign/contract linkage has been removed.
create or replace function directsign_private.directsign_campaign_application_retention_held(
  p_proposal_id uuid,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (select p_proposal_id as proposal_id) as source
    left join public.marketplace_contact_proposals as proposal
      on proposal.id = source.proposal_id
    left join public.privacy_held_marketplace_proposals as deferred
      on deferred.proposal_id = source.proposal_id
    left join public.marketplace_campaigns as campaign
      on campaign.id = proposal.campaign_id
    left join public.marketplace_brand_profiles as target_brand
      on target_brand.id = proposal.target_brand_profile_id
    left join public.marketplace_influencer_profiles as target_influencer
      on target_influencer.id = proposal.target_influencer_profile_id
    where (
        proposal.id is not null
        or deferred.proposal_id is not null
      )
      and (
        directsign_private.directsign_privacy_hold_active(
          'retention_category', 'campaign_contact', 'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'retention_category', 'account', 'account', p_now
        )
        or (
          coalesce(
            deferred.converted_contract_id,
            proposal.converted_contract_id
          ) is not null
          and directsign_private.directsign_privacy_hold_active(
            'retention_category', 'contract', 'contract', p_now
          )
        )
        or directsign_private.directsign_privacy_hold_active(
          'campaign_application', source.proposal_id::text,
          'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'campaign', coalesce(deferred.campaign_id, proposal.campaign_id),
          'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'profile', coalesce(
            deferred.sender_profile_id,
            proposal.sender_profile_id
          )::text, 'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'profile', coalesce(
            deferred.target_owner_profile_id,
            target_influencer.owner_profile_id
          )::text, 'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'organization', coalesce(
            deferred.sender_organization_id,
            proposal.sender_organization_id
          )::text, 'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'organization', coalesce(
            deferred.target_organization_id,
            target_brand.organization_id
          )::text, 'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'organization', coalesce(
            deferred.campaign_organization_id,
            campaign.organization_id
          )::text, 'campaign_contact', p_now
        )
        or directsign_private.directsign_privacy_hold_active(
          'contract', coalesce(
            deferred.converted_contract_id,
            proposal.converted_contract_id
          )::text, 'campaign_contact', p_now
        )
      )
  );
$$;

-- Aggregate-only post-pass backlog; no row locator or object path is exposed.
create or replace function public.get_privacy_retention_backlog(
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_contract bigint := 0;
  v_legacy bigint := 0;
  v_verification bigint := 0;
  v_support_access bigint := 0;
  v_support_tickets bigint := 0;
  v_application_contacts bigint := 0;
  v_security bigint := 0;
  v_org_cleanup bigint := 0;
  v_storage_pending bigint := 0;
  v_storage_failed bigint := 0;
  v_auth_pending bigint := 0;
  v_total_due bigint := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  select count(*) into v_contract
  from public.contracts as contract
  where contract.status::text in ('completed', 'cancelled')
    and greatest(
      contract.updated_at,
      contract.signed_at,
      contract.completed_at,
      contract.cancelled_at
    ) + interval '5 years' <= v_now
    and not directsign_private.directsign_contract_retention_held(
      contract.id, v_now
    );

  select count(*) into v_legacy
  from public.directsign_contracts as legacy
  where legacy.status = 'CLOSED'
    and legacy.updated_at + interval '5 years' <= v_now
    and not exists (
      select 1
      from public.contracts as contract
      where contract.legacy_contract_id = legacy.id
         or contract.id::text = legacy.id
    )
    and not directsign_private.directsign_legacy_contract_retention_held(
      legacy.id, legacy.advertiser_id, v_now
    );

  select count(*) into v_verification
  from public.verification_requests as request
  where request.status::text in ('approved', 'rejected')
    and greatest(
      request.updated_at,
      request.reviewed_at,
      request.ownership_checked_at
    ) + interval '3 years' <= v_now
    and not directsign_private.directsign_verification_retention_held(
      request.id,
      coalesce(
        request.profile_id,
        directsign_private.directsign_uuid_or_null(request.target_id)
      ),
      request.organization_id,
      v_now
    )
    and not directsign_private.directsign_privacy_hold_active(
      'profile', request.target_id, 'verification', v_now
    )
    and not directsign_private.directsign_privacy_hold_active(
      'organization', request.target_id, 'verification', v_now
    );

  select count(*) into v_support_access
  from public.support_access_requests as request
  where (
      request.status::text in ('closed', 'revoked', 'expired')
      or (
        request.status::text = 'active'
        and request.expires_at <= v_now
      )
    )
    and case
      when request.status::text in ('expired', 'active') then greatest(
        request.updated_at,
        request.reviewed_at,
        request.expires_at
      )
      else greatest(request.updated_at, request.reviewed_at)
    end + interval '3 years' <= v_now
    and not directsign_private.directsign_support_access_retention_held(
      request.id,
      request.requester_profile_id,
      request.contract_id,
      request.contract_uuid,
      request.legacy_contract_id,
      v_now
    );

  select count(*) into v_support_tickets
  from public.operational_support_tickets as ticket
  where ticket.status in ('resolved', 'closed')
    and ticket.updated_at + interval '3 years' <= v_now
    and not directsign_private.directsign_support_ticket_retention_held(
      ticket.id, ticket.contract_id, v_now
    );

  select count(*) into v_application_contacts
  from (
    select proposal.id
    from public.marketplace_contact_proposals as proposal
    join public.marketplace_campaigns as campaign
      on campaign.id = proposal.campaign_id
    cross join lateral (
      select case
        when pg_catalog.pg_input_is_valid(
          nullif(campaign.campaign_data ->> 'uploadDeadline', ''), 'date'
        ) then
          (campaign.campaign_data ->> 'uploadDeadline')::date
            + interval '90 days'
        else null
      end as upload_retention_due
    ) as retention
    where proposal.application_contact_snapshot is not null
      and greatest(
        retention.upload_retention_due,
        case
          when campaign.status in ('closed', 'ended')
            then campaign.updated_at + interval '90 days'
          else null
        end
      ) <= v_now
      and not directsign_private.directsign_campaign_application_retention_held(
        proposal.id, v_now
      )

    union

    select deferred.proposal_id
    from public.privacy_held_marketplace_proposals as deferred
    where deferred.due_at <= v_now
      and not directsign_private.directsign_campaign_application_retention_held(
        deferred.proposal_id, v_now
      )
  ) as due_application;

  if not directsign_private.directsign_privacy_hold_active(
    'retention_category', 'security', 'security', v_now
  ) then
    select
      (select count(*) from public.operational_auth_metric_buckets as metric
        where metric.bucket_minute + interval '1 year' <= v_now)
      + (select count(*) from public.operational_alert_events as alert
        where alert.created_at + interval '1 year' <= v_now
          and not (
            alert.kind = 'verification_request'
            and directsign_private.directsign_privacy_hold_active(
              'verification_request', alert.subject_id, 'security', v_now
            )
          )
          and not (
            alert.kind = 'support_ticket'
            and directsign_private.directsign_privacy_hold_active(
              'support_ticket', alert.subject_id, 'security', v_now
            )
          )
          and not (
            alert.kind = 'support_access'
            and directsign_private.directsign_privacy_hold_active(
              'support_access_request', alert.subject_id, 'security', v_now
            )
          ))
      + (select count(*) from public.marketplace_follower_sync_runs as run
        where greatest(run.created_at, run.updated_at, run.finished_at)
          + interval '1 year' <= v_now)
      + (select count(*) from public.marketplace_follower_sync_events as event
        where event.created_at + interval '1 year' <= v_now)
      + (select count(*) from public.admin_operator_sessions as session
        where session.absolute_expires_at + interval '30 days' <= v_now)
      + (select count(*) from public.auth_recent_grants as recent_grant
        where recent_grant.expires_at + interval '1 day' <= v_now)
      + (select count(*) from public.directsign_rate_limit_buckets as bucket
        where bucket.reset_at + interval '1 day' <= v_now)
      + (select count(*)
        from public.directsign_admin_mfa_rate_limit_reservations as reservation
        where reservation.expires_at + interval '1 day' <= v_now)
      + (select count(*)
        from public.directsign_admin_mfa_rate_limit_outcomes as outcome
        where outcome.purge_after <= v_now)
      + (select count(*) from public.privacy_erasure_requests as request
        where request.status in ('completed', 'cancelled')
          and coalesce(request.finalized_at, request.updated_at)
            + interval '1 year' <= v_now
          and not directsign_private.directsign_privacy_hold_active(
            'profile', request.auth_user_id::text, 'account', v_now
          )
          and not exists (
            select 1
            from unnest(request.organization_ids) as erased_org(id)
            join public.organizations as organization
              on organization.id = erased_org.id
          ))
      + (select count(*)
        from public.privacy_storage_deletion_queue as completed_queue
        where completed_queue.status = 'completed'
          and completed_queue.completed_at + interval '1 year' <= v_now)
      + (select count(*) from public.privacy_retention_runs as old_run
        where old_run.status in ('completed', 'failed')
          and coalesce(old_run.completed_at, old_run.created_at)
            + interval '1 year' <= v_now)
    into v_security;
  end if;

  select count(*) into v_org_cleanup
  from public.privacy_erasure_requests as request
  cross join lateral unnest(request.organization_ids) as erased_org(id)
  join public.organizations as organization on organization.id = erased_org.id
  where request.status = 'completed'
    and not directsign_private.directsign_privacy_hold_active(
      'organization', organization.id::text, 'account', v_now
    )
    and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'account', 'account', v_now
    )
    and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'campaign_contact', 'campaign_contact', v_now
    )
    and not exists (
      select 1
      from public.marketplace_campaigns as held_campaign
      where held_campaign.organization_id = organization.id
        and directsign_private.directsign_privacy_hold_active(
          'campaign', held_campaign.id, 'campaign_contact', v_now
        )
    )
    and not exists (
      select 1
      from public.marketplace_contact_proposals as held_proposal
      where (
          held_proposal.sender_organization_id = organization.id
          or exists (
            select 1
            from public.marketplace_brand_profiles as held_brand
            where held_brand.id = held_proposal.target_brand_profile_id
              and held_brand.organization_id = organization.id
          )
          or exists (
            select 1
            from public.marketplace_campaigns as held_campaign
            where held_campaign.id = held_proposal.campaign_id
              and held_campaign.organization_id = organization.id
          )
        )
        and (
          directsign_private.directsign_privacy_hold_active(
            'campaign_application', held_proposal.id::text,
            'campaign_contact', v_now
          )
          or directsign_private.directsign_privacy_hold_active(
            'profile', held_proposal.sender_profile_id::text,
            'campaign_contact', v_now
          )
          or directsign_private.directsign_privacy_hold_active(
            'contract', held_proposal.converted_contract_id::text,
            'campaign_contact', v_now
          )
          or exists (
            select 1
            from public.marketplace_influencer_profiles as held_influencer
            where held_influencer.id = held_proposal.target_influencer_profile_id
              and directsign_private.directsign_privacy_hold_active(
                'profile', held_influencer.owner_profile_id::text,
                'campaign_contact', v_now
              )
          )
        )
    )
    and not exists (
      select 1 from public.organization_members as member
      where member.organization_id = organization.id
    )
    and (
      not exists (
        select 1 from public.contracts as contract
        where contract.owner_organization_id = organization.id
      )
      or exists (
        select 1 from public.marketplace_campaigns as campaign
        where campaign.organization_id = organization.id
      )
      or exists (
        select 1 from public.marketplace_brand_profiles as brand
        where brand.organization_id = organization.id
      )
      or exists (
        select 1
        from public.marketplace_contact_proposals as proposal
        where proposal.converted_contract_id is null
          and (
            proposal.sender_organization_id = organization.id
            or exists (
              select 1
              from public.marketplace_brand_profiles as brand
              where brand.id = proposal.target_brand_profile_id
                and brand.organization_id = organization.id
            )
            or exists (
              select 1
              from public.marketplace_campaigns as campaign
              where campaign.id = proposal.campaign_id
                and campaign.organization_id = organization.id
            )
          )
      )
    );

  select
    count(*) filter (
      where (
        (
            queue.status in ('pending', 'failed')
            and queue.available_at <= v_now
            and queue.attempt_count < 10
          )
          or (
            queue.status = 'processing'
            and queue.lease_expires_at <= v_now
          )
        )
        and queue.due_at <= v_now
        and not directsign_private.directsign_storage_deletion_held(
          queue.source_type, queue.source_id, queue.category, v_now
        )
        and not exists (
          select 1
          from public.privacy_legal_holds as hold
          where hold.released_at is null
            and (hold.expires_at is null or hold.expires_at > v_now)
            and directsign_private.directsign_storage_queue_matches_hold(
              queue.source_type,
              queue.source_id,
              queue.category,
              hold.scope_type,
              hold.scope_id
            )
        )
    ),
    count(*) filter (
      where queue.status = 'failed'
        and queue.attempt_count >= 10
    )
  into v_storage_pending, v_storage_failed
  from public.privacy_storage_deletion_queue as queue;

  select count(*) into v_auth_pending
  from public.privacy_erasure_requests as request
  where request.status = 'ready_to_finalize'
    and (request.next_attempt_at is null or request.next_attempt_at <= v_now);

  v_total_due :=
    v_contract + v_legacy + v_verification
    + v_support_access + v_support_tickets + v_application_contacts
    + v_security + v_org_cleanup
    + v_storage_pending + v_storage_failed
    + v_auth_pending;

  return jsonb_build_object(
    'due_contracts', v_contract,
    'due_legacy_contracts', v_legacy,
    'due_verifications', v_verification,
    'due_support', v_support_access + v_support_tickets,
    'due_security', v_security,
    'due_org_cleanup', v_org_cleanup,
    'due_application_contacts', v_application_contacts,
    'pending_storage', v_storage_pending,
    'failed_storage', v_storage_failed,
    'ready_auth', v_auth_pending,
    'total_due', v_total_due,
    'has_backlog', v_total_due > 0
  );
end;
$$;

-- Shared idempotent cleanup used both at finalization and after hold release.
create or replace function directsign_private.directsign_cleanup_erased_organization(
  p_organization_id uuid,
  p_now timestamptz,
  p_dry_run boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_campaign_ids text[] := array[]::text[];
  v_campaign_source_keys text[] := array[]::text[];
  v_proposal_ids uuid[] := array[]::uuid[];
  v_contacts_redacted integer := 0;
  v_proposals_deleted integer := 0;
  v_campaigns_deleted integer := 0;
  v_brands_deleted integer := 0;
  v_organization_deleted integer := 0;
  v_contracts_remaining integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  -- Hold creation takes RowExclusive on this table. SHARE keeps the complete
  -- check-to-delete chain atomic with respect to new or expanded holds.
  lock table public.privacy_legal_holds in share mode;

  if p_organization_id is null then
    return jsonb_build_object(
      'found', false,
      'held', false,
      'tracking_complete', true,
      'organization_deleted', false
    );
  end if;

  if not exists (
    select 1
    from public.organizations as organization
    where organization.id = p_organization_id
  ) then
    return jsonb_build_object(
      'found', false,
      'held', false,
      'tracking_complete', true,
      'organization_deleted', true
    );
  end if;

  if directsign_private.directsign_privacy_hold_active(
      'organization', p_organization_id::text, 'account', v_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'retention_category', 'account', 'account', v_now
    )
    or directsign_private.directsign_privacy_hold_active(
      'retention_category', 'campaign_contact', 'campaign_contact', v_now
    ) then
    return jsonb_build_object(
      'found', true,
      'held', true,
      'tracking_complete', false,
      'organization_deleted', false
    );
  end if;

  -- If membership was transferred or another member was added concurrently,
  -- the organization is no longer an account-erasure orphan. Its active owner
  -- keeps the marketplace purpose, so do not redact or remove its data here.
  if exists (
    select 1
    from public.organization_members as member
    where member.organization_id = p_organization_id
  ) then
    return jsonb_build_object(
      'found', true,
      'held', false,
      'members_remaining', true,
      'tracking_complete', true,
      'organization_deleted', false
    );
  end if;

  select coalesce(array_agg(campaign.id order by campaign.id), array[]::text[])
  into v_campaign_ids
  from public.marketplace_campaigns as campaign
  where campaign.organization_id = p_organization_id;

  select coalesce(array_agg(source.source_key order by source.source_key), array[]::text[])
  into v_campaign_source_keys
  from public.notification_campaign_status_sources as source
  where source.organization_id = p_organization_id
    or source.campaign_id = any(v_campaign_ids);

  select coalesce(array_agg(proposal.id order by proposal.id), array[]::uuid[])
  into v_proposal_ids
  from public.marketplace_contact_proposals as proposal
  where proposal.converted_contract_id is null
    and (
      proposal.sender_organization_id = p_organization_id
      or exists (
        select 1
        from public.marketplace_brand_profiles as brand
        where brand.id = proposal.target_brand_profile_id
          and brand.organization_id = p_organization_id
      )
      or proposal.campaign_id = any(v_campaign_ids)
    );

  if exists (
      select 1
      from public.marketplace_campaigns as campaign
      where campaign.id = any(v_campaign_ids)
        and directsign_private.directsign_privacy_hold_active(
          'campaign', campaign.id, 'campaign_contact', v_now
        )
    )
    or exists (
      select 1
      from public.marketplace_contact_proposals as proposal
      where (
          proposal.sender_organization_id = p_organization_id
          or proposal.campaign_id = any(v_campaign_ids)
          or exists (
            select 1
            from public.marketplace_brand_profiles as brand
            where brand.id = proposal.target_brand_profile_id
              and brand.organization_id = p_organization_id
          )
        )
        and (
          directsign_private.directsign_privacy_hold_active(
            'campaign_application', proposal.id::text,
            'campaign_contact', v_now
          )
          or directsign_private.directsign_privacy_hold_active(
            'profile', proposal.sender_profile_id::text,
            'campaign_contact', v_now
          )
          or directsign_private.directsign_privacy_hold_active(
            'contract', proposal.converted_contract_id::text,
            'campaign_contact', v_now
          )
          or exists (
            select 1
            from public.marketplace_influencer_profiles as influencer_profile
            where influencer_profile.id = proposal.target_influencer_profile_id
              and directsign_private.directsign_privacy_hold_active(
                'profile', influencer_profile.owner_profile_id::text,
                'campaign_contact', v_now
              )
          )
        )
    ) then
    return jsonb_build_object(
      'found', true,
      'held', true,
      'tracking_complete', false,
      'organization_deleted', false
    );
  end if;

  -- The contact column is introduced by the immediately following migration.
  -- Dynamic SQL keeps this migration deployable by itself while still making
  -- every later cleanup redact converted and unconverted applicant contacts.
  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid =
      'public.marketplace_contact_proposals'::regclass
      and attribute.attname = 'application_contact_snapshot'
      and not attribute.attisdropped
  ) then
    if coalesce(p_dry_run, false) then
      execute $count_redactions$
        select count(*)::integer
        from public.marketplace_contact_proposals as proposal
        where proposal.application_contact_snapshot is not null
          and (
            proposal.sender_organization_id = $1
            or exists (
              select 1
              from public.marketplace_brand_profiles as brand
              where brand.id = proposal.target_brand_profile_id
                and brand.organization_id = $1
            )
            or exists (
              select 1
              from public.marketplace_campaigns as campaign
              where campaign.id = proposal.campaign_id
                and campaign.organization_id = $1
            )
          )
      $count_redactions$
      into v_contacts_redacted
      using p_organization_id;
    else
      execute $redact_contacts$
        update public.marketplace_contact_proposals as proposal
        set application_contact_snapshot = null
        where proposal.application_contact_snapshot is not null
          and (
            proposal.sender_organization_id = $1
            or exists (
              select 1
              from public.marketplace_brand_profiles as brand
              where brand.id = proposal.target_brand_profile_id
                and brand.organization_id = $1
            )
            or exists (
              select 1
              from public.marketplace_campaigns as campaign
              where campaign.id = proposal.campaign_id
                and campaign.organization_id = $1
            )
          )
      $redact_contacts$
      using p_organization_id;
      get diagnostics v_contacts_redacted = row_count;
    end if;
  end if;

  select count(*)::integer into v_contracts_remaining
  from public.contracts as contract
  where contract.owner_organization_id = p_organization_id;

  if coalesce(p_dry_run, false) then
    select count(*)::integer into v_proposals_deleted
    from unnest(v_proposal_ids) as proposal_id(id);
    select count(*)::integer into v_campaigns_deleted
    from unnest(v_campaign_ids) as campaign_id(id);
    select count(*)::integer into v_brands_deleted
    from public.marketplace_brand_profiles as brand
    where brand.organization_id = p_organization_id;
    v_organization_deleted := case when v_contracts_remaining = 0 then 1 else 0 end;

    return jsonb_build_object(
      'found', true,
      'held', false,
      'dry_run', true,
      'contacts_redacted', v_contacts_redacted,
      'proposals_deleted', v_proposals_deleted,
      'campaigns_deleted', v_campaigns_deleted,
      'brands_deleted', v_brands_deleted,
      'contracts_remaining', v_contracts_remaining,
      'organization_deleted', v_organization_deleted = 1,
      'tracking_complete', v_contracts_remaining = 0
    );
  end if;

  -- Remove projection tombstones/events before their unconverted source rows.
  delete from public.notification_projection_failures as failure
  where failure.source_type = 'campaign_application'
    and failure.source_id in (
      select proposal_id.id::text from unnest(v_proposal_ids) as proposal_id(id)
    );

  delete from public.notification_projection_receipts as receipt
  where receipt.source_type = 'campaign_application'
    and receipt.source_id in (
      select proposal_id.id::text from unnest(v_proposal_ids) as proposal_id(id)
    );

  delete from public.notification_events as notification
  where notification.source_type = 'campaign_application'
    and notification.source_id in (
      select proposal_id.id::text from unnest(v_proposal_ids) as proposal_id(id)
    );

  delete from public.marketplace_contact_proposals as proposal
  where proposal.id = any(v_proposal_ids);
  get diagnostics v_proposals_deleted = row_count;

  -- Campaign status projection rows contain immutable source snapshots and can
  -- otherwise keep retry work pointing at a campaign that has been erased.
  delete from public.notification_projection_failures as failure
  where (
      failure.source_type = 'campaign_status'
      and failure.source_id = any(v_campaign_source_keys)
    )
    or (
      failure.source_type = 'campaign'
      and failure.source_id = any(v_campaign_ids)
    );

  delete from public.notification_projection_receipts as receipt
  where receipt.source_type = 'campaign'
    and receipt.source_id = any(v_campaign_ids);

  delete from public.notification_events as notification
  where notification.source_type = 'campaign'
    and notification.source_id = any(v_campaign_ids);

  delete from public.notification_campaign_status_recipients as recipient
  where recipient.source_key = any(v_campaign_source_keys);

  delete from public.notification_campaign_status_sources as source
  where source.source_key = any(v_campaign_source_keys);

  delete from public.marketplace_campaigns as campaign
  where campaign.id = any(v_campaign_ids);
  get diagnostics v_campaigns_deleted = row_count;

  delete from public.marketplace_brand_profiles as brand
  where brand.organization_id = p_organization_id;
  get diagnostics v_brands_deleted = row_count;

  delete from public.organizations as organization
  where organization.id = p_organization_id
    and not exists (
      select 1
      from public.organization_members as member
      where member.organization_id = organization.id
    )
    and not exists (
      select 1
      from public.contracts as contract
      where contract.owner_organization_id = organization.id
    )
    and not exists (
      select 1
      from public.marketplace_campaigns as campaign
      where campaign.organization_id = organization.id
    );
  get diagnostics v_organization_deleted = row_count;

  return jsonb_build_object(
    'found', true,
    'held', false,
    'dry_run', false,
    'contacts_redacted', v_contacts_redacted,
    'proposals_deleted', v_proposals_deleted,
    'campaigns_deleted', v_campaigns_deleted,
    'brands_deleted', v_brands_deleted,
    'contracts_remaining', v_contracts_remaining,
    'organization_deleted', v_organization_deleted = 1,
    'tracking_complete', v_organization_deleted = 1
  );
end;
$$;

-- Account finalization uses the same cleanup path as the retention sweep.
create or replace function public.finalize_account_erasure(
  p_request_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_request public.privacy_erasure_requests%rowtype;
  v_pending integer := 0;
  v_organization_id uuid;
  v_cleanup jsonb;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  select request_row.* into v_request
  from public.privacy_erasure_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('found', false, 'request_id', p_request_id);
  end if;
  if v_request.status = 'completed' then
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'completed',
      'finalized_at', v_request.finalized_at
    );
  end if;
  if v_request.status = 'cancelled' then
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'cancelled',
      'requires_auth_user_deletion', false
    );
  end if;
  select count(*)::integer into v_pending
  from public.privacy_storage_deletion_queue as queue
  where queue.erasure_request_id = v_request.id
    and queue.status <> 'completed';

  if v_pending > 0 then
    update public.privacy_erasure_requests
    set status = 'waiting_storage', updated_at = v_now
    where id = v_request.id;
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'waiting_storage',
      'pending_storage', v_pending
    );
  end if;

  -- The application must first delete the Supabase Auth user through the Auth
  -- Admin API. That operation revokes Auth sessions and normally cascades the
  -- public profile. Keeping this check makes an Auth API failure retryable and
  -- prevents an orphan login from being reported as erased.
  if exists (
    select 1 from auth.users as auth_user
    where auth_user.id = v_request.auth_user_id
  ) then
    update public.privacy_erasure_requests
    set status = 'ready_to_finalize', updated_at = v_now
    where id = v_request.id;
    return jsonb_build_object(
      'found', true,
      'request_id', v_request.id,
      'status', 'ready_to_finalize',
      'pending_storage', 0,
      'requires_auth_user_deletion', true
    );
  end if;

  delete from public.profiles where id = v_request.auth_user_id;

  -- Storage and Auth cleanup are complete. Use the same idempotent path as the
  -- later retention sweep so an active organization hold can delay only this
  -- evidence cleanup and release can resume the exact chain safely.
  foreach v_organization_id in array v_request.organization_ids loop
    v_cleanup := directsign_private.directsign_cleanup_erased_organization(
      v_organization_id, v_now, false
    );
    if coalesce((v_cleanup ->> 'tracking_complete')::boolean, false) then
      v_request.organization_ids := array_remove(
        v_request.organization_ids, v_organization_id
      );
    end if;
  end loop;

  update public.privacy_erasure_requests
  set
    status = 'completed',
    finalized_at = v_now,
    last_attempt_at = v_now,
    next_attempt_at = null,
    last_error_code = null,
    organization_ids = v_request.organization_ids,
    updated_at = v_now
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'found', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'finalized_at', v_request.finalized_at,
    'requires_auth_user_deletion', false
  );
end;
$$;

-- Legal-hold mutations and Storage claim/authorize/complete share this
-- transaction-level gate. An affected processing queue prevents a new hold
-- from committing, so a hold cannot appear during the external DELETE window.
create or replace function directsign_private.directsign_guard_storage_hold_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  perform directsign_private.directsign_lock_privacy_storage_barrier();

  if tg_op in ('INSERT', 'UPDATE')
    and new.released_at is null
    and (new.expires_at is null or new.expires_at > v_now)
    and exists (
      select 1
      from public.privacy_storage_deletion_queue as queue
      where queue.status = 'processing'
        and directsign_private.directsign_storage_queue_matches_hold(
          queue.source_type,
          queue.source_id,
          queue.category,
          new.scope_type,
          new.scope_id
        )
    ) then
    raise exception using
      errcode = '55P03',
      message = 'storage_deletion_in_progress';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Fair, hold-aware claims also synchronize exhausted expired leases.
create or replace function public.claim_privacy_storage_deletions(
  p_worker_id text,
  p_limit integer,
  p_request_id uuid default null,
  p_now timestamptz default clock_timestamp(),
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  bucket text,
  object_path text,
  source_type text,
  source_id text,
  request_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- p_now remains in the RPC signature for compatibility; security leases use
  -- the database clock so an application clock cannot extend authorization.
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 120), 15), 900);
begin
  perform directsign_private.directsign_require_privacy_service_role();

  perform directsign_private.directsign_lock_privacy_storage_barrier();

  if btrim(coalesce(p_worker_id, '')) = ''
     or length(p_worker_id) > 160
     or p_worker_id !~ '^[A-Za-z0-9:._-]+$' then
    raise exception using errcode = '22023', message = 'safe storage worker id required';
  end if;

  with expired_leases as (
    update public.privacy_storage_deletion_queue as expired_lease
    set
      status = 'failed',
      available_at = v_now,
      lease_owner = null,
      lease_expires_at = null,
      authorized_at = null,
      authorization_expires_at = null,
      last_error_code = 'lease_expired',
      updated_at = v_now
    where expired_lease.status = 'processing'
      and expired_lease.lease_expires_at <= v_now
    returning expired_lease.erasure_request_id, expired_lease.attempt_count
  ), exhausted_requests as (
    select distinct expired.erasure_request_id
    from expired_leases as expired
    where expired.erasure_request_id is not null
      and expired.attempt_count >= 10
  )
  update public.privacy_erasure_requests as request
  set
    status = 'failed',
    last_error_code = 'storage_retry_exhausted',
    last_attempt_at = v_now,
    next_attempt_at = null,
    updated_at = v_now
  where request.id in (
    select exhausted.erasure_request_id
    from exhausted_requests as exhausted
  )
    and request.status not in ('completed', 'cancelled');

  return query
  with eligible as materialized (
    select
      queue.id,
      queue.category,
      queue.due_at,
      queue.created_at,
      row_number() over (
        partition by queue.category
        order by queue.due_at, queue.created_at, queue.id
      ) as category_rank
    from public.privacy_storage_deletion_queue as queue
    where queue.status in ('pending', 'failed')
      and queue.due_at <= v_now
      and queue.available_at <= v_now
      and queue.attempt_count < 10
      and (p_request_id is null or queue.erasure_request_id = p_request_id)
      and not directsign_private.directsign_storage_deletion_held(
        queue.source_type, queue.source_id, queue.category, v_now
      )
      and not exists (
        select 1
        from public.privacy_legal_holds as hold
        where hold.released_at is null
          and (hold.expires_at is null or hold.expires_at > v_now)
          and directsign_private.directsign_storage_queue_matches_hold(
            queue.source_type,
            queue.source_id,
            queue.category,
            hold.scope_type,
            hold.scope_id
          )
      )
  ), candidates as (
    select queue.id
    from public.privacy_storage_deletion_queue as queue
    join eligible on eligible.id = queue.id
    order by
      eligible.category_rank,
      eligible.category,
      eligible.due_at,
      eligible.created_at,
      eligible.id
    limit v_limit
    for update of queue skip locked
  ), claimed as (
    update public.privacy_storage_deletion_queue as queue
    set
      status = 'processing',
      lease_owner = p_worker_id,
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      authorized_at = null,
      authorization_expires_at = null,
      attempt_count = queue.attempt_count + 1,
      last_error_code = null,
      updated_at = v_now
    from candidates
    where queue.id = candidates.id
    returning queue.*
  )
  select
    claimed.id,
    claimed.bucket,
    claimed.object_path,
    claimed.source_type,
    claimed.source_id,
    claimed.erasure_request_id,
    claimed.attempt_count
  from claimed
  order by claimed.due_at, claimed.created_at, claimed.id;
end;
$$;

-- UUID text is canonical lowercase so a hold cannot be bypassed by changing
-- hexadecimal case. Campaign ids that are not UUIDs remain byte-for-byte.
update public.privacy_legal_holds
set scope_id = lower(btrim(scope_id))
where btrim(scope_id) ~*
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and scope_id is distinct from lower(btrim(scope_id));

create or replace function directsign_private.directsign_normalize_privacy_hold_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.scope_type := btrim(new.scope_type);
  new.scope_id := btrim(new.scope_id);
  if new.scope_id ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    new.scope_id := lower(new.scope_id);
  end if;
  return new;
end;
$$;

drop trigger if exists privacy_legal_holds_scope_normalizer
  on public.privacy_legal_holds;
create trigger privacy_legal_holds_scope_normalizer
before insert or update of scope_type, scope_id on public.privacy_legal_holds
for each row execute function
  directsign_private.directsign_normalize_privacy_hold_scope();

drop trigger if exists privacy_legal_holds_storage_gate
  on public.privacy_legal_holds;
create trigger privacy_legal_holds_storage_gate
after insert or update or delete on public.privacy_legal_holds
for each row execute function
  directsign_private.directsign_guard_storage_hold_mutation();

-- Force all hold mutations through the audited SECURITY DEFINER RPCs. The
-- trigger above remains a defense for owner/migration writes.
revoke insert, update, delete on table public.privacy_legal_holds
  from service_role;

create or replace function public.create_privacy_legal_hold(
  p_hold_id uuid,
  p_scope_type text,
  p_scope_id text,
  p_reason_code text,
  p_reference_hash text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_created_by_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.privacy_legal_holds%rowtype;
  v_scope_type text := btrim(p_scope_type);
  v_scope_id text := btrim(p_scope_id);
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if p_hold_id is null then
    raise exception using errcode = '22023', message = 'hold id required';
  end if;
  if v_scope_id ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_scope_id := lower(v_scope_id);
  end if;

  insert into public.privacy_legal_holds (
    id,
    scope_type,
    scope_id,
    reason_code,
    reference_hash,
    starts_at,
    expires_at,
    created_by_profile_id
  ) values (
    p_hold_id,
    v_scope_type,
    v_scope_id,
    p_reason_code,
    p_reference_hash,
    coalesce(p_starts_at, clock_timestamp()),
    p_expires_at,
    p_created_by_profile_id
  )
  on conflict (id) do nothing;

  select hold.* into v_hold
  from public.privacy_legal_holds as hold
  where hold.id = p_hold_id;

  if v_hold.scope_type is distinct from v_scope_type
     or v_hold.scope_id is distinct from v_scope_id
     or v_hold.reason_code is distinct from p_reason_code
     or v_hold.reference_hash is distinct from p_reference_hash
     or v_hold.expires_at is distinct from p_expires_at
     or v_hold.created_by_profile_id is distinct from p_created_by_profile_id
     or (
       p_starts_at is not null
       and v_hold.starts_at is distinct from p_starts_at
     ) then
    raise exception using errcode = '23505', message = 'hold id already has different scope';
  end if;

  return jsonb_build_object(
    'id', v_hold.id,
    'scope_type', v_hold.scope_type,
    'scope_id', v_hold.scope_id,
    'reason_code', v_hold.reason_code,
    'starts_at', v_hold.starts_at,
    'expires_at', v_hold.expires_at,
    'released_at', v_hold.released_at
  );
end;
$$;

-- Reset an operator-approved failed item without masking another exhausted
-- sibling on the same account-erasure request.
create or replace function public.requeue_privacy_storage_deletion(
  p_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_queue public.privacy_storage_deletion_queue%rowtype;
  v_permanent_failures integer := 0;
  v_parent_status text;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  update public.privacy_storage_deletion_queue as queue
  set
    status = 'pending',
    available_at = v_now,
    lease_owner = null,
    lease_expires_at = null,
    authorized_at = null,
    authorization_expires_at = null,
    attempt_count = 0,
    last_error_code = null,
    completed_at = null,
    updated_at = v_now
  where queue.id = p_id
    and queue.status = 'failed'
  returning * into v_queue;

  if not found then
    return jsonb_build_object('found', false, 'id', p_id);
  end if;

  if v_queue.erasure_request_id is not null then
    select count(*)::integer into v_permanent_failures
    from public.privacy_storage_deletion_queue as sibling
    where sibling.erasure_request_id = v_queue.erasure_request_id
      and sibling.status = 'failed'
      and sibling.attempt_count >= 10;

    update public.privacy_erasure_requests
    set
      status = case
        when v_permanent_failures > 0 then 'failed'
        else 'waiting_storage'
      end,
      last_error_code = case
        when v_permanent_failures > 0 then 'storage_retry_exhausted'
        else null
      end,
      next_attempt_at = case
        when v_permanent_failures > 0 then null
        else v_now
      end,
      updated_at = v_now
    where id = v_queue.erasure_request_id
      and status not in ('completed', 'cancelled')
    returning status into v_parent_status;
  end if;

  return jsonb_build_object(
    'found', true,
    'id', v_queue.id,
    'status', v_queue.status,
    'attempt_count', v_queue.attempt_count,
    'parent_status', v_parent_status,
    'remaining_exhausted_storage', v_permanent_failures
  );
end;
$$;

create or replace function public.authorize_privacy_storage_deletion(
  p_id uuid,
  p_worker_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- p_now is retained for RPC compatibility; authorization uses DB time.
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_queue public.privacy_storage_deletion_queue%rowtype;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if p_id is null
    or btrim(coalesce(p_worker_id, '')) = ''
    or length(p_worker_id) > 160
    or p_worker_id !~ '^[A-Za-z0-9:._-]+$' then
    raise exception using
      errcode = '22023',
      message = 'queue id and safe worker id required';
  end if;

  perform directsign_private.directsign_lock_privacy_storage_barrier();

  select queue.* into v_queue
  from public.privacy_storage_deletion_queue as queue
  where queue.id = p_id
  for update;

  if not found then
    return jsonb_build_object(
      'found', false,
      'authorized', false,
      'id', p_id,
      'status', null,
      'authorization_expires_at', null,
      'reason', 'not_found'
    );
  end if;

  if v_queue.status <> 'processing'
    or v_queue.lease_owner is distinct from p_worker_id
    or v_queue.lease_expires_at is null
    or v_queue.lease_expires_at <= v_now then
    return jsonb_build_object(
      'found', true,
      'authorized', false,
      'id', v_queue.id,
      'status', v_queue.status,
      'authorization_expires_at', null,
      'reason', 'lease_mismatch_or_expired'
    );
  end if;

  if directsign_private.directsign_storage_deletion_held(
      v_queue.source_type, v_queue.source_id, v_queue.category, v_now
    )
    or exists (
      select 1
      from public.privacy_legal_holds as hold
      where hold.released_at is null
        and hold.starts_at < least(
          v_queue.lease_expires_at,
          v_now + interval '30 seconds'
        )
        and (hold.expires_at is null or hold.expires_at > v_now)
        and directsign_private.directsign_storage_queue_matches_hold(
          v_queue.source_type,
          v_queue.source_id,
          v_queue.category,
          hold.scope_type,
          hold.scope_id
        )
    ) then
    update public.privacy_storage_deletion_queue
    set
      status = 'pending',
      available_at = v_now,
      lease_owner = null,
      lease_expires_at = null,
      authorized_at = null,
      authorization_expires_at = null,
      last_error_code = 'legal_hold_active',
      updated_at = v_now
    where id = v_queue.id
    returning * into v_queue;

    return jsonb_build_object(
      'found', true,
      'authorized', false,
      'id', v_queue.id,
      'status', v_queue.status,
      'authorization_expires_at', null,
      'reason', 'legal_hold_active'
    );
  end if;

  if v_queue.lease_expires_at < v_now + interval '10 seconds' then
    return jsonb_build_object(
      'found', true,
      'authorized', false,
      'id', v_queue.id,
      'status', v_queue.status,
      'authorization_expires_at', null,
      'reason', 'lease_expiring'
    );
  end if;

  update public.privacy_storage_deletion_queue
  set
    authorized_at = v_now,
    authorization_expires_at = least(
      v_queue.lease_expires_at,
      v_now + interval '30 seconds'
    ),
    updated_at = v_now
  where id = v_queue.id
  returning * into v_queue;

  return jsonb_build_object(
    'found', true,
    'authorized', true,
    'id', v_queue.id,
    'status', v_queue.status,
    'authorization_expires_at', v_queue.authorization_expires_at,
    'reason', null
  );
end;
$$;

-- Completion records the external result only for a pre-authorized lease.
create or replace function public.complete_privacy_storage_deletion(
  p_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_error_code text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- p_now is retained for RPC compatibility; completion uses DB time.
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_error_code text;
  v_queue public.privacy_storage_deletion_queue%rowtype;
  v_pending integer := 0;
  v_permanent_failures integer := 0;
  v_hold_active boolean := false;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  perform directsign_private.directsign_lock_privacy_storage_barrier();

  if p_id is null or btrim(coalesce(p_worker_id, '')) = '' then
    raise exception using errcode = '22023', message = 'queue id and worker id required';
  end if;

  v_error_code := case
    when coalesce(p_succeeded, false) then null
    when p_error_code ~ '^[a-z][a-z0-9_]{0,63}$' then p_error_code
    else 'storage_delete_failed'
  end;

  select queue.* into v_queue
  from public.privacy_storage_deletion_queue as queue
  where queue.id = p_id
  for update;

  if not found then
    return jsonb_build_object(
      'found', false,
      'accepted', false,
      'id', p_id,
      'reason', 'not_found'
    );
  end if;

  if v_queue.status <> 'processing'
    or v_queue.lease_owner is distinct from p_worker_id
    or v_queue.lease_expires_at is null
    or v_queue.lease_expires_at <= v_now then
    return jsonb_build_object(
      'found', true,
      'accepted', false,
      'id', v_queue.id,
      'status', v_queue.status,
      'reason', 'lease_mismatch_or_expired'
    );
  end if;

  if v_queue.authorized_at is null
    or v_queue.authorization_expires_at is null
    or v_queue.authorization_expires_at <= v_now then
    return jsonb_build_object(
      'found', true,
      'accepted', false,
      'id', v_queue.id,
      'status', v_queue.status,
      'reason', 'authorization_expired'
    );
  end if;

  v_hold_active := directsign_private.directsign_storage_deletion_held(
    v_queue.source_type, v_queue.source_id, v_queue.category, v_now
  );

  -- This should be unreachable while the shared barrier is respected, but a
  -- newly detected hold is an invariant breach, never a successful
  -- completion. Keep the queue retryable, surface accepted=false to the
  -- worker, and require operator investigation even if Storage reported that
  -- the object was already deleted.
  if v_hold_active then
    update public.privacy_storage_deletion_queue as queue
    set
      status = 'pending',
      available_at = v_now,
      lease_owner = null,
      lease_expires_at = null,
      authorized_at = null,
      authorization_expires_at = null,
      last_error_code = 'legal_hold_active',
      completed_at = null,
      updated_at = v_now
    where queue.id = v_queue.id
    returning * into v_queue;

    return jsonb_build_object(
      'found', true,
      'accepted', false,
      'id', v_queue.id,
      'status', v_queue.status,
      'reason', 'legal_hold_active',
      'hold_detected_after_authorization', true
    );
  end if;

  update public.privacy_storage_deletion_queue as queue
  set
    status = case
      when coalesce(p_succeeded, false) then 'completed'
      else 'failed'
    end,
    available_at = case
      when coalesce(p_succeeded, false) then queue.available_at
      else v_now + make_interval(
        secs => least(
          3600,
          (30 * power(2, least(queue.attempt_count, 6)))::integer
        )
      )
    end,
    lease_owner = null,
    lease_expires_at = null,
    authorized_at = null,
    authorization_expires_at = null,
    last_error_code = case
      when coalesce(p_succeeded, false) then null
      else v_error_code
    end,
    completed_at = case
      when coalesce(p_succeeded, false) then v_now
      else null
    end,
    updated_at = v_now
  where queue.id = v_queue.id
  returning * into v_queue;

  if v_queue.erasure_request_id is not null then
    select
      count(*) filter (where queue.status <> 'completed')::integer,
      count(*) filter (
        where queue.status = 'failed' and queue.attempt_count >= 10
      )::integer
    into v_pending, v_permanent_failures
    from public.privacy_storage_deletion_queue as queue
    where queue.erasure_request_id = v_queue.erasure_request_id;

    update public.privacy_erasure_requests
    set
      status = case
        when v_permanent_failures > 0 then 'failed'
        when v_pending = 0 then 'ready_to_finalize'
        else 'waiting_storage'
      end,
      last_error_code = case
        when v_permanent_failures > 0 then 'storage_retry_exhausted'
        else null
      end,
      next_attempt_at = case
        when v_permanent_failures > 0 then null
        else next_attempt_at
      end,
      updated_at = v_now
    where id = v_queue.erasure_request_id
      and status not in ('completed', 'cancelled', 'held');
  end if;

  return jsonb_build_object(
    'found', true,
    'accepted', true,
    'id', v_queue.id,
    'status', v_queue.status,
    'attempt_count', v_queue.attempt_count,
    'hold_detected_after_authorization', v_hold_active,
    'pending_for_request', v_pending,
    'request_ready_to_finalize',
      v_queue.erasure_request_id is not null and v_pending = 0
  );
end;
$$;


-- Every proposal deletion path, including account erasure and terminal
-- contract cleanup, must defer private application/contact/consent evidence
-- while a matching legal hold is active. Public directory/profile removal is
-- unaffected; only this private evidence row is retained.
create or replace function directsign_private.directsign_guard_held_marketplace_proposal_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_target_owner_profile_id uuid;
  v_target_organization_id uuid;
  v_campaign_organization_id uuid;
begin
  lock table public.privacy_legal_holds in share mode;

  if not directsign_private.directsign_campaign_application_retention_held(
    old.id, v_now
  ) then
    return old;
  end if;

  select influencer.owner_profile_id
  into v_target_owner_profile_id
  from public.marketplace_influencer_profiles as influencer
  where influencer.id = old.target_influencer_profile_id;

  select brand.organization_id
  into v_target_organization_id
  from public.marketplace_brand_profiles as brand
  where brand.id = old.target_brand_profile_id;

  select campaign.organization_id
  into v_campaign_organization_id
  from public.marketplace_campaigns as campaign
  where campaign.id = old.campaign_id;

  insert into public.privacy_held_marketplace_proposals (
    proposal_id,
    evidence_snapshot,
    due_at,
    sender_profile_id,
    target_owner_profile_id,
    sender_organization_id,
    target_organization_id,
    campaign_organization_id,
    campaign_id,
    converted_contract_id,
    first_delete_attempt_at,
    last_delete_attempt_at,
    created_at,
    updated_at
  ) values (
    old.id,
    to_jsonb(old),
    v_now,
    old.sender_profile_id,
    v_target_owner_profile_id,
    old.sender_organization_id,
    v_target_organization_id,
    v_campaign_organization_id,
    old.campaign_id,
    old.converted_contract_id,
    v_now,
    v_now,
    v_now,
    v_now
  )
  on conflict (proposal_id) do update
  set
    evidence_snapshot = coalesce(
      public.privacy_held_marketplace_proposals.evidence_snapshot,
      excluded.evidence_snapshot
    ),
    due_at = least(
      public.privacy_held_marketplace_proposals.due_at,
      excluded.due_at
    ),
    sender_profile_id = coalesce(
      public.privacy_held_marketplace_proposals.sender_profile_id,
      excluded.sender_profile_id
    ),
    target_owner_profile_id = coalesce(
      public.privacy_held_marketplace_proposals.target_owner_profile_id,
      excluded.target_owner_profile_id
    ),
    sender_organization_id = coalesce(
      public.privacy_held_marketplace_proposals.sender_organization_id,
      excluded.sender_organization_id
    ),
    target_organization_id = coalesce(
      public.privacy_held_marketplace_proposals.target_organization_id,
      excluded.target_organization_id
    ),
    campaign_organization_id = coalesce(
      public.privacy_held_marketplace_proposals.campaign_organization_id,
      excluded.campaign_organization_id
    ),
    campaign_id = coalesce(
      public.privacy_held_marketplace_proposals.campaign_id,
      excluded.campaign_id
    ),
    converted_contract_id = coalesce(
      public.privacy_held_marketplace_proposals.converted_contract_id,
      excluded.converted_contract_id
    ),
    last_delete_attempt_at = excluded.last_delete_attempt_at,
    updated_at = excluded.updated_at;

  -- Preserve the evidence only in the forced-RLS quarantine, then allow the
  -- live proposal row to disappear so account erasure cannot leave private
  -- contact/consent data visible through ordinary application reads.
  return old;
end;
$$;

drop trigger if exists marketplace_contact_proposals_legal_hold_delete_guard
  on public.marketplace_contact_proposals;
create trigger marketplace_contact_proposals_legal_hold_delete_guard
before delete on public.marketplace_contact_proposals
for each row execute function
  directsign_private.directsign_guard_held_marketplace_proposal_delete();

create or replace function directsign_private.directsign_cleanup_due_held_marketplace_proposals(
  p_now timestamptz,
  p_limit integer,
  p_dry_run boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 1000));
  v_row record;
  v_due integer := 0;
  v_deleted integer := 0;
  v_row_count integer := 0;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  -- Hold creation takes RowExclusive; this lock makes the complete
  -- check-to-delete sequence linearizable with new or expanded holds.
  lock table public.privacy_legal_holds in share mode;

  for v_row in
    select deferred.proposal_id
    from public.privacy_held_marketplace_proposals as deferred
    where deferred.due_at <= v_now
      and not directsign_private.directsign_campaign_application_retention_held(
        deferred.proposal_id, v_now
      )
    order by deferred.due_at, deferred.proposal_id
    limit v_limit
    for update of deferred skip locked
  loop
    v_due := v_due + 1;
    if coalesce(p_dry_run, false) then
      continue;
    end if;

    delete from public.notification_projection_failures as failure
    where failure.source_type = 'campaign_application'
      and failure.source_id = v_row.proposal_id::text;
    delete from public.notification_projection_receipts as receipt
    where receipt.source_type = 'campaign_application'
      and receipt.source_id = v_row.proposal_id::text;
    delete from public.notification_events as notification
    where notification.source_type = 'campaign_application'
      and notification.source_id = v_row.proposal_id::text;

    delete from public.marketplace_contact_proposals as proposal
    where proposal.id = v_row.proposal_id;

    delete from public.privacy_held_marketplace_proposals as deferred
    where deferred.proposal_id = v_row.proposal_id;
    get diagnostics v_row_count = row_count;
    v_deleted := v_deleted + v_row_count;
  end loop;

  return jsonb_build_object(
    'due', v_due,
    'deleted', v_deleted,
    'would_delete', case when coalesce(p_dry_run, false) then v_due else 0 end
  );
end;
$$;

-- Reapply the finalized campaign-contact validator and immutable redaction guard.
create or replace function public.directsign_campaign_application_contact_snapshot_valid(
  p_snapshot jsonb,
  p_campaign_snapshot jsonb,
  p_sender_profile_id uuid,
  p_campaign_id text,
  p_target_brand_profile_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expected_fields jsonb := coalesce(
    p_campaign_snapshot -> 'applicationContactFields',
    '[]'::jsonb
  );
  v_contact jsonb;
  v_field jsonb;
  v_field_name text;
  v_phone text;
  v_email text;
  v_recipient_organization_id uuid;
begin
  -- Retention redaction is a valid terminal state. The INSERT guard below
  -- still requires a snapshot whenever the campaign requested contact fields.
  if p_snapshot is null then
    return true;
  end if;

  if jsonb_typeof(v_expected_fields) is distinct from 'array' then
    return false;
  end if;

  if jsonb_array_length(v_expected_fields) = 0 then
    return false;
  end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or (
      p_snapshot
      - 'version'
      - 'policy_version'
      - 'fields'
      - 'contact'
      - 'accepted_at'
      - 'actor_profile_id'
      - 'campaign_id'
      - 'recipient_brand_profile_id'
      - 'recipient_organization_id'
      - 'recipient_name'
      - 'purpose'
      - 'retention_policy'
    ) <> '{}'::jsonb
    or jsonb_typeof(p_snapshot -> 'version') is distinct from 'string'
    or (p_snapshot ->> 'version') !~ '^[0-9a-f]{64}$'
    or (p_snapshot ->> 'version') is distinct from
      (p_campaign_snapshot ->> 'applicationContactConsentVersion')
    or jsonb_typeof(p_snapshot -> 'policy_version') is distinct from 'string'
    or (p_snapshot ->> 'policy_version') is distinct from '2026-08-08.1'
    or jsonb_typeof(p_snapshot -> 'fields') is distinct from 'array'
    or (p_snapshot -> 'fields') is distinct from v_expected_fields
    or jsonb_array_length(p_snapshot -> 'fields') not between 1 and 2
    or jsonb_typeof(p_snapshot -> 'contact') is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'accepted_at') is distinct from 'string'
    or not pg_catalog.pg_input_is_valid(
      nullif(p_snapshot ->> 'accepted_at', ''),
      'timestamp with time zone'
    )
    or jsonb_typeof(p_snapshot -> 'actor_profile_id') is distinct from 'string'
    or (p_snapshot ->> 'actor_profile_id') is distinct from p_sender_profile_id::text
    or jsonb_typeof(p_snapshot -> 'campaign_id') is distinct from 'string'
    or (p_snapshot ->> 'campaign_id') is distinct from p_campaign_id
    or jsonb_typeof(p_snapshot -> 'recipient_brand_profile_id') is distinct from 'string'
    or (p_snapshot ->> 'recipient_brand_profile_id') is distinct from
      p_target_brand_profile_id::text
    or jsonb_typeof(p_snapshot -> 'recipient_organization_id') is distinct from 'string'
    or not pg_catalog.pg_input_is_valid(
      nullif(p_snapshot ->> 'recipient_organization_id', ''),
      'uuid'
    )
    or jsonb_typeof(p_snapshot -> 'recipient_name') is distinct from 'string'
    or btrim(p_snapshot ->> 'recipient_name') = ''
    or char_length(p_snapshot ->> 'recipient_name') > 160
    or (p_snapshot ->> 'recipient_name') is distinct from
      (p_campaign_snapshot ->> 'brandName')
    or jsonb_typeof(p_snapshot -> 'purpose') is distinct from 'string'
    or (p_snapshot ->> 'purpose') is distinct from
      '캠페인 지원자 확인, 선정 및 진행 안내'
    or jsonb_typeof(p_snapshot -> 'retention_policy') is distinct from 'string'
    or (p_snapshot ->> 'retention_policy') is distinct from
      'campaign_end_plus_90_days' then
    return false;
  end if;

  v_recipient_organization_id := (p_snapshot ->> 'recipient_organization_id')::uuid;
  if not exists (
    select 1
    from public.marketplace_brand_profiles as brand
    where brand.id = p_target_brand_profile_id
      and brand.organization_id = v_recipient_organization_id
  ) then
    return false;
  end if;

  v_contact := p_snapshot -> 'contact';
  if (
    select count(*)
    from pg_catalog.jsonb_object_keys(v_contact)
  ) is distinct from jsonb_array_length(v_expected_fields) then
    return false;
  end if;

  for v_field in
    select item
    from pg_catalog.jsonb_array_elements(v_expected_fields) as requested(item)
  loop
    if jsonb_typeof(v_field) is distinct from 'string' then
      return false;
    end if;
    v_field_name := v_field #>> '{}';
    if v_field_name not in ('phone', 'email')
      or jsonb_typeof(v_contact -> v_field_name) is distinct from 'string'
      or btrim(v_contact ->> v_field_name) = '' then
      return false;
    end if;
  end loop;

  if v_contact ? 'phone' then
    v_phone := btrim(v_contact ->> 'phone');
    if char_length(v_phone) > 24
      or v_phone !~ '^[0-9+() -]{8,24}$'
      or char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 9 and 15 then
      return false;
    end if;
  end if;

  if v_contact ? 'email' then
    v_email := lower(btrim(v_contact ->> 'email'));
    if char_length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      return false;
    end if;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function public.directsign_protect_campaign_application_contact_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_fields jsonb := coalesce(
    new.campaign_snapshot -> 'applicationContactFields',
    '[]'::jsonb
  );
begin
  if tg_op = 'INSERT' then
    if new.direction = 'influencer_to_brand'
      and new.campaign_id is not null
      and jsonb_typeof(v_expected_fields) = 'array'
      and jsonb_array_length(v_expected_fields) > 0
      and new.application_contact_snapshot is null then
      raise exception using
        errcode = '23514',
        message = 'campaign application contact snapshot is required';
    end if;
    return new;
  end if;

  if new.application_contact_snapshot is distinct from old.application_contact_snapshot then
    if old.application_contact_snapshot is not null
      and new.application_contact_snapshot is null
      and coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    raise exception using
      errcode = '55000',
      message = 'campaign application contact snapshot is immutable';
  end if;
  return new;
end;
$$;

-- Purpose-expiry redaction is service-only and legal-hold aware.
create or replace function public.redact_expired_campaign_application_contacts(
  p_now timestamptz default now(),
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redacted integer := 0;
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  lock table public.privacy_legal_holds in share mode;

  with candidates as (
    select proposal.id
    from public.marketplace_contact_proposals as proposal
    join public.marketplace_campaigns as campaign
      on campaign.id = proposal.campaign_id
    cross join lateral (
      select case
        when pg_catalog.pg_input_is_valid(
          nullif(
            campaign.campaign_data ->> 'uploadDeadline',
            ''
          ),
          'date'
        ) then (
          (campaign.campaign_data ->> 'uploadDeadline')::date
          + interval '90 days'
        )
        else null
      end as upload_retention_due
    ) as retention
    where proposal.application_contact_snapshot is not null
      and greatest(
        retention.upload_retention_due,
        case
          when campaign.status in ('closed', 'ended')
            then campaign.updated_at + interval '90 days'
          else null
        end
      ) <= v_now
      and not directsign_private.directsign_campaign_application_retention_held(
        proposal.id, v_now
      )
    order by proposal.created_at asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
    for update of proposal skip locked
  )
  update public.marketplace_contact_proposals as proposal
  set application_contact_snapshot = null
  from candidates
  where proposal.id = candidates.id;

  get diagnostics v_redacted = row_count;
  return jsonb_build_object('redacted', v_redacted, 'processed_at', p_now);
end;
$$;


-- Keep the public profile tombstone exact even when an older remotely-applied
-- erasure RPC supplied malformed display text. This trigger also guarantees
-- the documented immediate PII minimization before Auth deletion finishes.
create or replace function directsign_private.directsign_enforce_erased_profile_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email ~ '^deleted\+[0-9a-f]{32}@privacy\.invalid$' then
    new.name := '탈퇴한 회원';
    new.company_name := null;
    new.phone := null;
    new.avatar_url := null;
    new.verification_status := 'not_submitted';
    new.email_verified_at := null;
    new.phone_verified_at := null;
    new.activity_categories := '{}'::text[];
    new.activity_platforms := '{}'::text[];
    new.activity_page_url := null;
    new.activity_page_platform := null;
    new.activity_page_handle := null;
    new.public_profile_consent_at := null;
    new.public_profile_consent_version := null;
    new.public_profile_consent_source := null;
    new.public_profile_setup_state := 'setup_required';
    new.terms_accepted_at := null;
    new.privacy_policy_accepted_at := null;
    new.terms_version := null;
    new.privacy_policy_version := null;
    new.signup_consent_snapshot := '{}'::jsonb;
    new.data_origin := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_erasure_tombstone_guard on public.profiles;
create trigger profiles_erasure_tombstone_guard
before insert or update on public.profiles
for each row execute function
  directsign_private.directsign_enforce_erased_profile_tombstone();

-- Auth Admin API failures are retryable and must not move the job out of the
-- server worker's ready_to_finalize selection. Only exhausted Storage work
-- enters the manual failed state.
create or replace function public.mark_account_erasure_failed(
  p_request_id uuid,
  p_error_code text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_error_code text;
  v_request public.privacy_erasure_requests%rowtype;
begin
  perform directsign_private.directsign_require_privacy_service_role();

  v_error_code := case
    when p_error_code ~ '^[a-z][a-z0-9_]{0,63}$' then p_error_code
    else 'account_erasure_failed'
  end;

  update public.privacy_erasure_requests
  set
    status = 'ready_to_finalize',
    last_error_code = v_error_code,
    last_attempt_at = v_now,
    next_attempt_at = v_now + interval '5 minutes',
    attempt_count = attempt_count + 1,
    updated_at = v_now
  where id = p_request_id
    and status not in ('completed', 'cancelled')
  returning * into v_request;

  if not found then
    return jsonb_build_object('found', false, 'request_id', p_request_id);
  end if;

  return jsonb_build_object(
    'found', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'last_error_code', v_request.last_error_code,
    'next_attempt_at', v_request.next_attempt_at
  );
end;
$$;


-- Reapply the final fair, bounded retention engine over the remotely applied version.
create or replace function public.run_privacy_retention(
  p_now timestamptz,
  p_limit integer,
  p_dry_run boolean default false,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_limit integer := p_limit;
  v_remaining integer;
  v_run public.privacy_retention_runs%rowtype;
  v_row record;
  v_cleanup jsonb;
  v_row_count integer := 0;
  v_processed integer := 0;
  v_contracts_due integer := 0;
  v_contracts_deleted integer := 0;
  v_legacy_contracts_due integer := 0;
  v_legacy_contracts_deleted integer := 0;
  v_verification_due integer := 0;
  v_verification_deleted integer := 0;
  v_support_access_due integer := 0;
  v_support_access_deleted integer := 0;
  v_support_tickets_due integer := 0;
  v_support_tickets_deleted integer := 0;
  v_application_contacts_due integer := 0;
  v_application_contacts_redacted integer := 0;
  v_held_proposals_due integer := 0;
  v_held_proposals_deleted integer := 0;
  v_orphan_organizations_deleted integer := 0;
  v_security_due integer := 0;
  v_security_deleted integer := 0;
  v_storage_queued integer := 0;
  v_storage_waiting integer := 0;
  v_would_delete integer := 0;
  v_counters jsonb := '{}'::jsonb;
  v_backlog jsonb := '{}'::jsonb;
  v_lease_now timestamptz := clock_timestamp();
  v_lease_token uuid := gen_random_uuid();
begin
  perform directsign_private.directsign_require_privacy_service_role();

  if v_limit is null or v_limit < 1 or v_limit > 500 then
    raise exception using errcode = '22023', message = 'limit must be between 1 and 500';
  end if;
  if p_idempotency_key is not null and (
    btrim(p_idempotency_key) = ''
    or length(p_idempotency_key) > 160
    or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
  ) then
    raise exception using errcode = '22023', message = 'safe idempotency key required';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('directsign:privacy-retention', 94731)
  ) then
    raise exception using
      errcode = '55P03',
      message = 'privacy retention run already in progress';
  end if;

  if p_idempotency_key is not null then
    select run.* into v_run
    from public.privacy_retention_runs as run
    where run.idempotency_key = p_idempotency_key
    for update;

    if found then
      if v_run.requested_limit is distinct from v_limit
        or v_run.dry_run is distinct from coalesce(p_dry_run, false) then
        raise exception using
          errcode = '22023',
          message = 'privacy retention idempotency semantics mismatch';
      end if;

      if v_run.status = 'completed' then
        return jsonb_build_object(
          'run_id', v_run.id,
          'status', v_run.status,
          'dry_run', v_run.dry_run,
          'attempt_count', v_run.attempt_count,
          'idempotent_replay', true,
          'counters', v_run.counters
        );
      end if;

      if v_run.status = 'running'
        and v_run.lease_expires_at > v_lease_now then
        raise exception using
          errcode = '55P03',
          message = 'privacy retention idempotency key is running';
      end if;

      update public.privacy_retention_runs
      set
        status = 'running',
        counters = '{}'::jsonb,
        error_code = null,
        started_at = v_now,
        completed_at = null,
        attempt_count = attempt_count + 1,
        lease_token = v_lease_token,
        lease_expires_at = v_lease_now + interval '10 minutes'
      where id = v_run.id
      returning * into v_run;
    else
      insert into public.privacy_retention_runs (
        idempotency_key,
        run_kind,
        dry_run,
        status,
        requested_limit,
        attempt_count,
        lease_token,
        lease_expires_at,
        started_at,
        created_at
      ) values (
        p_idempotency_key,
        'manual',
        coalesce(p_dry_run, false),
        'running',
        v_limit,
        1,
        v_lease_token,
        v_lease_now + interval '10 minutes',
        v_now,
        v_now
      )
      returning * into v_run;
    end if;
  else
    insert into public.privacy_retention_runs (
      idempotency_key,
      run_kind,
      dry_run,
      status,
      requested_limit,
      attempt_count,
      lease_token,
      lease_expires_at,
      started_at,
      created_at
    ) values (
      null,
      'scheduled',
      coalesce(p_dry_run, false),
      'running',
      v_limit,
      1,
      v_lease_token,
      v_lease_now + interval '10 minutes',
      v_now,
      v_now
    )
    returning * into v_run;
  end if;

  v_remaining := v_limit;

  begin
    -- p_limit is a per-stream quota, not one global queue. Keeping a separate
    -- bounded allowance for every evidence/security stream prevents a large
    -- contract backlog from starving verification, support or security expiry.
    -- Prevent a hold from appearing between candidate selection and the final
    -- evidence delete. Hold creation waits for this short bounded transaction.
    lock table public.privacy_legal_holds in share mode;

    -- Contract retention starts only after a terminal contract's last recorded
    -- processing timestamp plus exactly five calendar years.
    for v_row in
      select
        contract.id,
        contract.legacy_contract_id,
        greatest(
          contract.updated_at,
          contract.signed_at,
          contract.completed_at,
          contract.cancelled_at
        ) + interval '5 years' as due_at
      from public.contracts as contract
      where contract.status::text in ('completed', 'cancelled')
        and greatest(
          contract.updated_at,
          contract.signed_at,
          contract.completed_at,
          contract.cancelled_at
        ) + interval '5 years' <= v_now
        and not directsign_private.directsign_contract_retention_held(
          contract.id, v_now
        )
      order by due_at, contract.id
      limit v_remaining
      for update of contract skip locked
    loop
      v_contracts_due := v_contracts_due + 1;
      v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

      if coalesce(p_dry_run, false) then
        if directsign_private.directsign_contract_storage_complete(v_row.id) then
          v_would_delete := v_would_delete + 1;
        else
          v_storage_waiting := v_storage_waiting + 1;
        end if;
      else
        v_storage_queued := v_storage_queued
          + directsign_private.directsign_queue_contract_storage(
              v_row.id, v_row.due_at, v_now
            );

        if directsign_private.directsign_contract_storage_complete(v_row.id) then
          -- Projection tombstones and events are no longer needed once their
          -- authoritative five-year contract evidence is itself due.
          delete from public.notification_projection_failures as failure
          where (
            failure.source_type = 'contract_event'
            and failure.source_id in (
              select event.id::text
              from public.contract_events as event
              where event.contract_id = v_row.id
            )
          ) or (
            failure.source_type = 'deliverable'
            and failure.source_id in (
              select deliverable.id::text
              from public.deliverables as deliverable
              where deliverable.contract_id = v_row.id
            )
          ) or (
            failure.source_type = 'deadline'
            and failure.source_id = v_row.id::text
          );

          delete from public.notification_projection_receipts as receipt
          where (
            receipt.source_type = 'contract_event'
            and receipt.source_id in (
              select event.id::text
              from public.contract_events as event
              where event.contract_id = v_row.id
            )
          ) or (
            receipt.source_type = 'deliverable'
            and receipt.source_id in (
              select deliverable.id::text
              from public.deliverables as deliverable
              where deliverable.contract_id = v_row.id
            )
          ) or (
            receipt.source_type = 'deadline'
            and receipt.source_id = v_row.id::text
          );

          delete from public.notification_events as notification
          where (
            notification.source_type = 'contract_event'
            and notification.source_id in (
              select event.id::text
              from public.contract_events as event
              where event.contract_id = v_row.id
            )
          ) or (
            notification.source_type = 'deliverable'
            and notification.source_id in (
              select deliverable.id::text
              from public.deliverables as deliverable
              where deliverable.contract_id = v_row.id
            )
          ) or (
            notification.source_type = 'deadline'
            and notification.source_id = v_row.id::text
          );

          delete from public.notification_workflow_sources as source
          where source.contract_id = v_row.id;

          delete from public.marketplace_contact_proposals as proposal
          where proposal.converted_contract_id = v_row.id;

          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'on', true
          );
          delete from public.contract_events as event
          where event.contract_id = v_row.id;
          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'off', true
          );

          delete from public.signatures as signature
          where signature.contract_id = v_row.id;
          delete from public.contract_snapshots as snapshot
          where snapshot.contract_id = v_row.id;
          delete from public.contract_files as file
          where file.contract_id = v_row.id;

          delete from public.contracts as contract
          where contract.id = v_row.id;

          delete from public.directsign_contracts as legacy
          where legacy.id = v_row.legacy_contract_id
             or legacy.id = v_row.id::text;

          v_contracts_deleted := v_contracts_deleted + 1;
        else
          v_storage_waiting := v_storage_waiting + 1;
        end if;
      end if;

    end loop;

    -- Old legacy contracts are independent candidates only when no V2 row is
    -- linked. CLOSED is the sole terminal legacy state.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          legacy.id,
          legacy.advertiser_id,
          legacy.updated_at + interval '5 years' as due_at
        from public.directsign_contracts as legacy
        where legacy.status = 'CLOSED'
          and legacy.updated_at + interval '5 years' <= v_now
          and not exists (
            select 1
            from public.contracts as contract
            where contract.legacy_contract_id = legacy.id
               or contract.id::text = legacy.id
          )
          and not directsign_private.directsign_legacy_contract_retention_held(
            legacy.id, legacy.advertiser_id, v_now
          )
        order by due_at, legacy.id
        limit v_remaining
        for update of legacy skip locked
      loop
        v_legacy_contracts_due := v_legacy_contracts_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          if directsign_private.directsign_legacy_contract_storage_complete(v_row.id) then
            v_would_delete := v_would_delete + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        else
          v_storage_queued := v_storage_queued
            + directsign_private.directsign_queue_legacy_contract_storage(
                v_row.id, v_row.due_at, v_now
              );
          if directsign_private.directsign_legacy_contract_storage_complete(v_row.id) then
            delete from public.google_calendar_events as calendar_event
            where calendar_event.legacy_contract_id = v_row.id;
            delete from public.marketplace_contact_proposals as proposal
            where proposal.converted_contract_id = case
              when v_row.id ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then v_row.id::uuid
              else null::uuid
            end;
            delete from public.directsign_contracts as legacy
            where legacy.id = v_row.id;
            v_legacy_contracts_deleted := v_legacy_contracts_deleted + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        end if;

      end loop;
    end if;

    -- Verification evidence expires after the terminal request's last
    -- processing timestamp plus exactly three calendar years.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          request.id,
          request.profile_id,
          request.organization_id,
          greatest(
            request.updated_at,
            request.reviewed_at,
            request.ownership_checked_at
          ) + interval '3 years' as due_at
        from public.verification_requests as request
        where request.status::text in ('approved', 'rejected')
          and greatest(
            request.updated_at,
            request.reviewed_at,
            request.ownership_checked_at
          ) + interval '3 years' <= v_now
          and not directsign_private.directsign_verification_retention_held(
            request.id,
            coalesce(
              request.profile_id,
              directsign_private.directsign_uuid_or_null(request.target_id)
            ),
            request.organization_id,
            v_now
          )
          and not directsign_private.directsign_privacy_hold_active(
            'profile', request.target_id, 'verification', v_now
          )
          and not directsign_private.directsign_privacy_hold_active(
            'organization', request.target_id, 'verification', v_now
          )
        order by due_at, request.id
        limit v_remaining
        for update of request skip locked
      loop
        v_verification_due := v_verification_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          if directsign_private.directsign_verification_storage_complete(v_row.id) then
            v_would_delete := v_would_delete + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        else
          v_storage_queued := v_storage_queued
            + directsign_private.directsign_queue_verification_storage(
                v_row.id, v_row.due_at, v_now
              );
          if directsign_private.directsign_verification_storage_complete(v_row.id) then
            delete from public.operational_alert_events as alert
            where alert.kind = 'verification_request'
              and alert.subject_id = v_row.id::text;
            delete from public.verification_requests as request
            where request.id = v_row.id;
            v_verification_deleted := v_verification_deleted + 1;
          else
            v_storage_waiting := v_storage_waiting + 1;
          end if;
        end if;

      end loop;
    end if;

    -- Support-access audit chains use their own three-year clock and survive
    -- an earlier contract purge through immutable UUID/text snapshots.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          request.id,
          case
            when request.status::text in ('expired', 'active') then greatest(
              request.updated_at,
              request.reviewed_at,
              request.expires_at
            )
            else greatest(request.updated_at, request.reviewed_at)
          end + interval '3 years' as due_at
        from public.support_access_requests as request
        where (
            request.status::text in ('closed', 'revoked', 'expired')
            or (
              request.status::text = 'active'
              and request.expires_at <= v_now
            )
          )
          and case
            when request.status::text in ('expired', 'active') then greatest(
              request.updated_at,
              request.reviewed_at,
              request.expires_at
            )
            else greatest(request.updated_at, request.reviewed_at)
          end + interval '3 years' <= v_now
          and not directsign_private.directsign_support_access_retention_held(
            request.id,
            request.requester_profile_id,
            request.contract_id,
            request.contract_uuid,
            request.legacy_contract_id,
            v_now
          )
        order by due_at, request.id
        limit v_remaining
        for update of request skip locked
      loop
        v_support_access_due := v_support_access_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_alert_events as alert
          where alert.kind = 'support_access'
            and alert.subject_id = v_row.id::text;

          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'on', true
          );
          delete from public.support_access_events as event
          where event.support_access_request_id = v_row.id;
          perform pg_catalog.set_config(
            'directsign.privacy_retention_purge', 'off', true
          );

          delete from public.support_access_requests as request
          where request.id = v_row.id;
          v_support_access_deleted := v_support_access_deleted + 1;
        end if;

      end loop;
    end if;

    -- Resolved customer support records expire at updated_at + exactly three
    -- years. Open/reviewing work remains actionable and is never auto-purged.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          ticket.id,
          ticket.updated_at + interval '3 years' as due_at
        from public.operational_support_tickets as ticket
        where ticket.status in ('resolved', 'closed')
          and ticket.updated_at + interval '3 years' <= v_now
          and not directsign_private.directsign_support_ticket_retention_held(
            ticket.id, ticket.contract_id, v_now
          )
        order by due_at, ticket.id
        limit v_remaining
        for update of ticket skip locked
      loop
        v_support_tickets_due := v_support_tickets_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_alert_events as alert
          where alert.kind = 'support_ticket'
            and alert.subject_id = v_row.id::text;
          delete from public.operational_support_tickets as ticket
          where ticket.id = v_row.id;
          v_support_tickets_deleted := v_support_tickets_deleted + 1;
        end if;

      end loop;
    end if;

    -- Campaign contact values are purpose-limited to the campaign terminal or
    -- upload deadline anchor plus exactly 90 days. Legal holds retain the row;
    -- otherwise the contact value is independently redacted.
    if coalesce(p_dry_run, false) then
      select count(*)::integer into v_application_contacts_due
      from (
        select proposal.id
        from public.marketplace_contact_proposals as proposal
        join public.marketplace_campaigns as campaign
          on campaign.id = proposal.campaign_id
        cross join lateral (
          select case
            when pg_catalog.pg_input_is_valid(
              nullif(campaign.campaign_data ->> 'uploadDeadline', ''), 'date'
            ) then
              (campaign.campaign_data ->> 'uploadDeadline')::date
                + interval '90 days'
            else null
          end as upload_retention_due
        ) as retention
        where proposal.application_contact_snapshot is not null
          and greatest(
            retention.upload_retention_due,
            case
              when campaign.status in ('closed', 'ended')
                then campaign.updated_at + interval '90 days'
              else null
            end
          ) <= v_now
          and not directsign_private.directsign_campaign_application_retention_held(
            proposal.id, v_now
          )
        order by proposal.created_at, proposal.id
        limit v_limit
      ) as due_contact;
      v_would_delete := v_would_delete + v_application_contacts_due;
    else
      v_cleanup := public.redact_expired_campaign_application_contacts(
        v_now, v_limit
      );
      v_application_contacts_redacted := coalesce(
        (v_cleanup ->> 'redacted')::integer, 0
      );
      v_application_contacts_due := v_application_contacts_redacted;
    end if;
    v_processed := v_processed + v_application_contacts_due;

    -- A prior delete attempt deferred by a legal hold is a separate bounded
    -- stream. Once all matching holds expire/release, remove the entire private
    -- proposal/contact/consent evidence row and its notification projections.
    v_cleanup := directsign_private.directsign_cleanup_due_held_marketplace_proposals(
      v_now, v_limit, coalesce(p_dry_run, false)
    );
    v_held_proposals_due := coalesce((v_cleanup ->> 'due')::integer, 0);
    v_held_proposals_deleted := coalesce((v_cleanup ->> 'deleted')::integer, 0);
    v_processed := v_processed + v_held_proposals_due;
    v_would_delete := v_would_delete
      + coalesce((v_cleanup ->> 'would_delete')::integer, 0);

    -- Authentication and operational security logs use their documented
    -- boundaries. Each table receives an independent bounded quota so a busy
    -- metric stream cannot starve another expiry stream.
    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select metric.ctid as row_ctid
        from public.operational_auth_metric_buckets as metric
        where metric.bucket_minute + interval '1 year' <= v_now
        order by metric.bucket_minute
        limit v_remaining
        for update of metric skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_auth_metric_buckets
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select alert.ctid as row_ctid
        from public.operational_alert_events as alert
        where alert.created_at + interval '1 year' <= v_now
          and not (
            alert.kind = 'verification_request'
            and directsign_private.directsign_privacy_hold_active(
              'verification_request', alert.subject_id, 'security', v_now
            )
          )
          and not (
            alert.kind = 'support_ticket'
            and directsign_private.directsign_privacy_hold_active(
              'support_ticket', alert.subject_id, 'security', v_now
            )
          )
          and not (
            alert.kind = 'support_access'
            and directsign_private.directsign_privacy_hold_active(
              'support_access_request', alert.subject_id, 'security', v_now
            )
          )
        order by alert.created_at, alert.id
        limit v_remaining
        for update of alert skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.operational_alert_events
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select run.ctid as row_ctid
        from public.marketplace_follower_sync_runs as run
        where greatest(
          run.created_at,
          run.updated_at,
          run.finished_at
        ) + interval '1 year' <= v_now
        order by greatest(run.created_at, run.updated_at, run.finished_at), run.id
        limit v_remaining
        for update of run skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.marketplace_follower_sync_runs
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select event.ctid as row_ctid
        from public.marketplace_follower_sync_events as event
        where event.created_at + interval '1 year' <= v_now
        order by event.created_at, event.id
        limit v_remaining
        for update of event skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.marketplace_follower_sync_events
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select session.ctid as row_ctid
        from public.admin_operator_sessions as session
        where session.absolute_expires_at + interval '30 days' <= v_now
        order by session.absolute_expires_at, session.id
        limit v_remaining
        for update of session skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.admin_operator_sessions
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select grant_row.ctid as row_ctid
        from public.auth_recent_grants as grant_row
        where grant_row.expires_at + interval '1 day' <= v_now
        order by grant_row.expires_at, grant_row.token_hash
        limit v_remaining
        for update of grant_row skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.auth_recent_grants
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select bucket.ctid as row_ctid
        from public.directsign_rate_limit_buckets as bucket
        where bucket.reset_at + interval '1 day' <= v_now
        order by bucket.reset_at, bucket.bucket_key
        limit v_remaining
        for update of bucket skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.directsign_rate_limit_buckets
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select reservation.ctid as row_ctid
        from public.directsign_admin_mfa_rate_limit_reservations as reservation
        where reservation.expires_at + interval '1 day' <= v_now
        order by reservation.expires_at, reservation.reservation_id
        limit v_remaining
        for update of reservation skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.directsign_admin_mfa_rate_limit_reservations
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select outcome.ctid as row_ctid
        from public.directsign_admin_mfa_rate_limit_outcomes as outcome
        where outcome.purge_after <= v_now
        order by outcome.purge_after, outcome.reservation_id
        limit v_remaining
        for update of outcome skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.directsign_admin_mfa_rate_limit_outcomes
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    -- A completed erasure keeps held or contract-backed organization ids as a
    -- bounded locator. Once a hold is released, the same finalizer helper
    -- resumes contact -> proposal/notification -> campaign -> brand -> org
    -- cleanup; a retained contract keeps only the last org deletion pending.
    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select
          request.id as request_id,
          organization.id as organization_id
        from public.privacy_erasure_requests as request
        cross join lateral unnest(request.organization_ids) as erased_org(id)
        join public.organizations as organization
          on organization.id = erased_org.id
        where request.status = 'completed'
          and not directsign_private.directsign_privacy_hold_active(
            'organization', organization.id::text, 'account', v_now
          )
        order by request.finalized_at, request.id, organization.id
        limit v_remaining
        for update of organization skip locked
      loop
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;

        v_cleanup := directsign_private.directsign_cleanup_erased_organization(
          v_row.organization_id, v_now, coalesce(p_dry_run, false)
        );

        if coalesce(p_dry_run, false) and (
          coalesce((v_cleanup ->> 'contacts_redacted')::integer, 0) > 0
          or coalesce((v_cleanup ->> 'proposals_deleted')::integer, 0) > 0
          or coalesce((v_cleanup ->> 'campaigns_deleted')::integer, 0) > 0
          or coalesce((v_cleanup ->> 'brands_deleted')::integer, 0) > 0
          or coalesce((v_cleanup ->> 'organization_deleted')::boolean, false)
        ) then
          v_would_delete := v_would_delete + 1;
        end if;

        if not coalesce(p_dry_run, false)
          and coalesce(
            (v_cleanup ->> 'tracking_complete')::boolean, false
          ) then
          update public.privacy_erasure_requests
          set
            organization_ids = array_remove(
              organization_ids, v_row.organization_id
            ),
            updated_at = v_now
          where id = v_row.request_id;
        end if;

        if not coalesce(p_dry_run, false)
          and coalesce(
            (v_cleanup ->> 'organization_deleted')::boolean, false
          ) then
          v_orphan_organizations_deleted :=
            v_orphan_organizations_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 then
      for v_row in
        select request.ctid as row_ctid
        from public.privacy_erasure_requests as request
        where request.status in ('completed', 'cancelled')
          and coalesce(request.finalized_at, request.updated_at)
            + interval '1 year' <= v_now
          and not directsign_private.directsign_privacy_hold_active(
            'profile', request.auth_user_id::text, 'account', v_now
          )
          and not exists (
            select 1
            from unnest(request.organization_ids) as erased_org(id)
            join public.organizations as organization
              on organization.id = erased_org.id
          )
        order by coalesce(request.finalized_at, request.updated_at), request.id
        limit v_remaining
        for update of request skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.privacy_erasure_requests
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select queue.ctid as row_ctid
        from public.privacy_storage_deletion_queue as queue
        where queue.status = 'completed'
          and queue.completed_at + interval '1 year' <= v_now
        order by queue.completed_at, queue.id
        limit v_remaining
        for update of queue skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.privacy_storage_deletion_queue
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_remaining := v_limit;
    if v_remaining > 0 and not directsign_private.directsign_privacy_hold_active(
      'retention_category', 'security', 'security', v_now
    ) then
      for v_row in
        select old_run.ctid as row_ctid
        from public.privacy_retention_runs as old_run
        where old_run.id <> v_run.id
          and old_run.status in ('completed', 'failed')
          and coalesce(old_run.completed_at, old_run.created_at)
            + interval '1 year' <= v_now
        order by coalesce(old_run.completed_at, old_run.created_at), old_run.id
        limit v_remaining
        for update of old_run skip locked
      loop
        v_security_due := v_security_due + 1;
        v_processed := v_processed + 1;
        v_remaining := v_remaining - 1;
        if coalesce(p_dry_run, false) then
          v_would_delete := v_would_delete + 1;
        else
          delete from public.privacy_retention_runs
          where ctid = v_row.row_ctid;
          v_security_deleted := v_security_deleted + 1;
        end if;
      end loop;
    end if;

    v_backlog := public.get_privacy_retention_backlog(v_now);

    v_counters := jsonb_build_object(
      'processed', v_processed,
      'contracts_due', v_contracts_due,
      'contracts_deleted', v_contracts_deleted,
      'legacy_contracts_due', v_legacy_contracts_due,
      'legacy_contracts_deleted', v_legacy_contracts_deleted,
      'verification_due', v_verification_due,
      'verification_deleted', v_verification_deleted,
      'support_access_due', v_support_access_due,
      'support_access_deleted', v_support_access_deleted,
      'support_tickets_due', v_support_tickets_due,
      'support_tickets_deleted', v_support_tickets_deleted,
      'application_contacts_due', v_application_contacts_due,
      'application_contacts_redacted', v_application_contacts_redacted,
      'held_proposals_due', v_held_proposals_due,
      'held_proposals_deleted', v_held_proposals_deleted,
      'orphan_organizations_deleted', v_orphan_organizations_deleted,
      'security_due', v_security_due,
      'security_deleted', v_security_deleted,
      'storage_queued', v_storage_queued,
      'storage_waiting', v_storage_waiting,
      'would_delete', v_would_delete,
      'backlog', v_backlog,
      'total_due', coalesce((v_backlog ->> 'total_due')::bigint, 0),
      'has_backlog', coalesce((v_backlog ->> 'has_backlog')::boolean, false)
    );

    update public.privacy_retention_runs
    set
      status = 'completed',
      counters = v_counters,
      completed_at = v_now,
      lease_token = null,
      lease_expires_at = null
    where id = v_run.id
    returning * into v_run;

    return jsonb_build_object(
      'run_id', v_run.id,
      'status', v_run.status,
      'dry_run', v_run.dry_run,
      'idempotent_replay', false,
      'counters', v_run.counters
    );
  exception
    when others then
      update public.privacy_retention_runs
      set
        status = 'failed',
        error_code = 'retention_run_failed',
        counters = jsonb_build_object('processed_before_rollback', v_processed),
        completed_at = v_now,
        lease_token = null,
        lease_expires_at = null
      where id = v_run.id
      returning * into v_run;

      return jsonb_build_object(
        'run_id', v_run.id,
        'status', 'failed',
        'dry_run', v_run.dry_run,
        'error_code', v_run.error_code,
        'counters', v_run.counters
      );
  end;
end;
$$;

-- Retention anchors are indexed exactly as evaluated by the bounded worker.
-- These are regular transactional indexes because this corrective migration
-- must remain atomic; the short lock timeout prevents an unsafe long deploy.
create index if not exists privacy_contracts_terminal_anchor_idx
  on public.contracts ((greatest(
    updated_at, signed_at, completed_at, cancelled_at
  )), id)
  where status in ('completed', 'cancelled');

create index if not exists privacy_legacy_contracts_terminal_anchor_idx
  on public.directsign_contracts (updated_at, id)
  where status = 'CLOSED';

create index if not exists privacy_verification_terminal_anchor_idx
  on public.verification_requests ((greatest(
    updated_at, reviewed_at, ownership_checked_at
  )), id)
  where status in ('approved', 'rejected');

create index if not exists privacy_support_access_terminal_anchor_idx
  on public.support_access_requests ((case
    when status in ('expired', 'active') then greatest(
      updated_at, reviewed_at, expires_at
    )
    else greatest(updated_at, reviewed_at)
  end), id)
  where status in ('closed', 'revoked', 'expired', 'active');

create index if not exists privacy_support_tickets_terminal_anchor_idx
  on public.operational_support_tickets (updated_at, id)
  where status in ('resolved', 'closed');

create index if not exists privacy_auth_metric_anchor_idx
  on public.operational_auth_metric_buckets (bucket_minute);
create index if not exists privacy_alert_event_anchor_idx
  on public.operational_alert_events (created_at, id);
create index if not exists privacy_follower_sync_run_anchor_idx
  on public.marketplace_follower_sync_runs ((greatest(
    created_at, updated_at, finished_at
  )), id);
create index if not exists privacy_follower_sync_event_anchor_idx
  on public.marketplace_follower_sync_events (created_at, id);
create index if not exists privacy_admin_session_anchor_idx
  on public.admin_operator_sessions (absolute_expires_at, id);
create index if not exists privacy_recent_auth_grant_anchor_idx
  on public.auth_recent_grants (expires_at, token_hash);
create index if not exists privacy_rate_limit_anchor_idx
  on public.directsign_rate_limit_buckets (reset_at);
create index if not exists privacy_mfa_reservation_anchor_idx
  on public.directsign_admin_mfa_rate_limit_reservations (
    expires_at, reservation_id
  );
create index if not exists privacy_mfa_outcome_anchor_idx
  on public.directsign_admin_mfa_rate_limit_outcomes (purge_after, reservation_id);
create index if not exists privacy_erasure_completed_anchor_idx
  on public.privacy_erasure_requests ((coalesce(finalized_at, updated_at)), id)
  where status in ('completed', 'cancelled');
create index if not exists privacy_storage_completed_anchor_idx
  on public.privacy_storage_deletion_queue (completed_at, id)
  where status = 'completed';
create index if not exists privacy_retention_run_completed_anchor_idx
  on public.privacy_retention_runs ((coalesce(completed_at, created_at)), id)
  where status in ('completed', 'failed');

-- Browser roles cannot bypass the server proxy with a still-valid pre-erasure
-- JWT. Service-role RPCs remain the sole data plane for retained private rows.
revoke all privileges on table
  public.profiles,
  public.organizations,
  public.organization_members,
  public.directsign_contracts,
  public.contracts,
  public.contract_parties,
  public.contract_platforms,
  public.contract_pricing_terms,
  public.contract_clauses,
  public.clause_threads,
  public.deliverable_requirements,
  public.deliverables,
  public.settlement_periods,
  public.settlement_reports,
  public.settlement_items,
  public.payouts,
  public.share_links,
  public.contract_snapshots,
  public.signatures,
  public.contract_files,
  public.contract_events,
  public.verification_requests,
  public.support_access_requests,
  public.support_access_events,
  public.marketplace_influencer_profiles,
  public.marketplace_influencer_channels,
  public.marketplace_brand_profiles,
  public.marketplace_contact_proposals,
  public.marketplace_campaigns,
  public.contract_summaries,
  public.privacy_held_marketplace_proposals
from public, anon, authenticated;

revoke all on table public.privacy_held_marketplace_proposals
  from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.privacy_storage_deletion_queue
  from service_role;
revoke insert, update, delete on table
  public.privacy_erasure_requests,
  public.privacy_retention_runs
from service_role;

revoke execute on function public.create_privacy_legal_hold(
  uuid, text, text, text, text, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.create_privacy_legal_hold(
  uuid, text, text, text, text, timestamptz, timestamptz, uuid
) to service_role;

revoke execute on function public.release_privacy_legal_hold(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.release_privacy_legal_hold(
  uuid, uuid, timestamptz
) to service_role;

revoke execute on function public.request_account_erasure(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.request_account_erasure(
  uuid, uuid, text, text, timestamptz
) to service_role;

revoke execute on function public.get_privacy_erasure_status(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_privacy_erasure_status(uuid, uuid)
  to service_role;

revoke execute on function public.finalize_account_erasure(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_account_erasure(uuid, timestamptz)
  to service_role;

revoke execute on function public.mark_account_erasure_failed(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.mark_account_erasure_failed(
  uuid, text, timestamptz
) to service_role;

revoke execute on function public.claim_privacy_storage_deletions(
  text, integer, uuid, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.claim_privacy_storage_deletions(
  text, integer, uuid, timestamptz, integer
) to service_role;

revoke execute on function public.authorize_privacy_storage_deletion(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.authorize_privacy_storage_deletion(
  uuid, text, timestamptz
) to service_role;

revoke execute on function public.complete_privacy_storage_deletion(
  uuid, text, boolean, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_privacy_storage_deletion(
  uuid, text, boolean, text, timestamptz
) to service_role;

revoke execute on function public.requeue_privacy_storage_deletion(
  uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.requeue_privacy_storage_deletion(
  uuid, timestamptz
) to service_role;

revoke execute on function public.redact_expired_campaign_application_contacts(
  timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.redact_expired_campaign_application_contacts(
  timestamptz, integer
) to service_role;

revoke execute on function public.get_privacy_retention_backlog(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_privacy_retention_backlog(timestamptz)
  to service_role;

revoke execute on function public.run_privacy_retention(
  timestamptz, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.run_privacy_retention(
  timestamptz, integer, boolean, text
) to service_role;

revoke execute on function public.directsign_campaign_application_contact_snapshot_valid(
  jsonb, jsonb, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.directsign_campaign_application_contact_snapshot_valid(
  jsonb, jsonb, uuid, text, uuid
) to service_role;

revoke execute on function public.directsign_protect_campaign_application_contact_snapshot()
  from public, anon, authenticated;
grant execute on function public.directsign_protect_campaign_application_contact_snapshot()
  to service_role;

revoke execute on function
  directsign_private.directsign_lock_privacy_storage_barrier(),
  directsign_private.directsign_storage_queue_matches_hold(text, text, text, text, text),
  directsign_private.directsign_campaign_application_retention_held(uuid, timestamptz),
  directsign_private.directsign_guard_storage_hold_mutation(),
  directsign_private.directsign_normalize_privacy_hold_scope(),
  directsign_private.directsign_guard_held_marketplace_proposal_delete(),
  directsign_private.directsign_cleanup_due_held_marketplace_proposals(
    timestamptz, integer, boolean
  ),
  directsign_private.directsign_cleanup_erased_organization(
    uuid, timestamptz, boolean
  ),
  directsign_private.directsign_enforce_erased_profile_tombstone()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
