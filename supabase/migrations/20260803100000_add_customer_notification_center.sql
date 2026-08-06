-- Durable, server-owned customer notification center.
--
-- The immutable event is separated from per-recipient read state.  Customer
-- clients never access these tables directly: the application server scopes
-- every read/write to the authenticated profile and role.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  source_type text not null,
  source_id text not null,
  source_version text not null,
  -- Keep the actor as an immutable historical snapshot.  A foreign key with
  -- ON DELETE SET NULL would issue an UPDATE and conflict with the immutable
  -- event trigger when a profile is removed.
  actor_profile_id uuid,
  actor_role text,
  copy_key text not null,
  safe_params jsonb not null default '{}'::jsonb,
  route_key text not null,
  route_params jsonb not null default '{}'::jsonb,
  data_origin text not null default 'production',
  occurred_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint notification_events_event_key_format check (
    event_key ~ '^[a-z0-9][a-z0-9:_-]{2,239}$'
  ),
  constraint notification_events_event_type_format check (
    event_type ~ '^[a-z][a-z0-9_.]{2,79}$'
  ),
  constraint notification_events_source_type_allowed check (
    source_type in (
      'contract_event',
      'deliverable',
      'campaign_application',
      'campaign',
      'deadline',
      'system'
    )
  ),
  constraint notification_events_source_id_not_blank check (
    btrim(source_id) <> '' and length(source_id) <= 160
  ),
  constraint notification_events_source_version_not_blank check (
    btrim(source_version) <> '' and length(source_version) <= 160
  ),
  constraint notification_events_actor_role_allowed check (
    actor_role is null or actor_role in ('advertiser', 'influencer', 'system')
  ),
  constraint notification_events_copy_key_allowed check (
    copy_key in (
      'campaign.application_received',
      'campaign.application_selected',
      'campaign.status_changed',
      'contract.ready_to_sign',
      'contract.signed',
      'contract.content_submitted',
      'contract.content_reviewed',
      'contract.ready_to_close',
      'contract.closed',
      'deadline.action_due'
    )
  ),
  constraint notification_events_safe_params_object check (
    jsonb_typeof(safe_params) = 'object'
    and octet_length(safe_params::text) <= 4096
  ),
  constraint notification_events_route_key_allowed check (
    route_key in ('dashboard', 'campaign_detail', 'contract_detail')
  ),
  constraint notification_events_route_params_object check (
    jsonb_typeof(route_params) = 'object'
    and octet_length(route_params::text) <= 2048
  ),
  -- Bell notifications must never materialize QA/demo/seed data.  The server
  -- also rejects known operational test identities before calling the RPC.
  constraint notification_events_production_only check (
    data_origin = 'production'
  ),
  constraint notification_events_expiry_order check (
    expires_at > occurred_at
    and expires_at <= occurred_at + interval '180 days'
  )
);

create unique index if not exists notification_events_source_version_unique
  on public.notification_events (
    source_type,
    source_id,
    event_type,
    source_version
  );

-- Also repair a database where an earlier draft of this migration created the
-- incompatible ON DELETE SET NULL actor foreign key.
alter table public.notification_events
  drop constraint if exists notification_events_actor_profile_id_fkey;

-- Contract audit events are the durable fallback for supported workflow
-- projections.  Preserve their historical actor UUID as well; ON DELETE SET
-- NULL would make a failed projection unrecoverable after account deletion.
alter table public.contract_events
  drop constraint if exists contract_events_actor_profile_id_fkey;

-- A nullable stamp distinguishes notification-owned post-cutover audit facts
-- that were production-validated in their INSERT transaction from legacy
-- rows.  contract_events is append-only, so this proof cannot be added later.
alter table public.contract_events
  add column if not exists notification_actor_proof_at timestamptz;

-- Campaign applications are also immutable notification sources.  Preserve
-- the submitting profile UUID instead of allowing profile deletion to erase
-- who performed a production application transition.
alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_sender_profile_id_fkey;

create index if not exists notification_events_source_idx
  on public.notification_events (source_type, source_id, occurred_at desc);

create table if not exists public.notification_recipients (
  event_id uuid not null
    references public.notification_events (id) on delete cascade,
  recipient_profile_id uuid not null
    references public.profiles (id) on delete cascade,
  recipient_role text not null,
  recipient_organization_id uuid
    references public.organizations (id) on delete cascade,
  occurred_at timestamptz not null,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, recipient_profile_id),
  constraint notification_recipients_role_allowed check (
    recipient_role in ('advertiser', 'influencer')
  ),
  constraint notification_recipients_read_order check (
    read_at is null or read_at >= occurred_at
  ),
  constraint notification_recipients_archive_order check (
    archived_at is null or archived_at >= occurred_at
  )
);

create index if not exists notification_recipients_profile_feed_idx
  on public.notification_recipients (
    recipient_profile_id,
    recipient_role,
    occurred_at desc,
    event_id desc
  )
  where archived_at is null;

create index if not exists notification_recipients_profile_unread_idx
  on public.notification_recipients (
    recipient_profile_id,
    recipient_role,
    occurred_at desc
  )
  where read_at is null and archived_at is null;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique
    references public.notification_events (id) on delete cascade,
  topic text not null default 'customer_notification_projection',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_topic_not_blank check (
    btrim(topic) <> '' and length(topic) <= 80
  ),
  constraint notification_outbox_status_allowed check (
    status in ('pending', 'processing', 'completed', 'dead')
  ),
  constraint notification_outbox_attempt_non_negative check (
    attempt_count >= 0
  ),
  constraint notification_outbox_lease_pair check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  ),
  constraint notification_outbox_error_code_format check (
    last_error_code is null
    or last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
  )
);

create index if not exists notification_outbox_claim_idx
  on public.notification_outbox (available_at, created_at)
  where status in ('pending', 'processing');

create table if not exists public.notification_projection_state (
  projection_key text primary key,
  cutover_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint notification_projection_state_key_format check (
    projection_key ~ '^[a-z][a-z0-9_]{2,79}$'
  )
);

-- Compact, non-expiring idempotency receipts survive feed retention.  Without
-- this tombstone, a reconciliation pass could recreate a purged event as
-- unread after its 90/180-day customer-visible retention window.
create table if not exists public.notification_projection_receipts (
  event_key text primary key,
  fact_fingerprint text not null,
  notification_event_id uuid,
  source_type text not null,
  source_id text not null,
  source_version text not null,
  projected_at timestamptz not null default now(),
  constraint notification_projection_receipts_key_format check (
    event_key ~ '^[a-z0-9][a-z0-9:_-]{2,239}$'
  ),
  constraint notification_projection_receipts_fingerprint_format check (
    fact_fingerprint ~ '^[0-9a-f]{32}$'
  )
);

-- Authoritative workflow transitions that may be written before the API can
-- append its audit event.  This table intentionally stores no URL, comment,
-- token, email, IP, or user-agent data.
create table if not exists public.notification_workflow_sources (
  source_key text primary key,
  source_type text not null,
  source_id uuid not null,
  contract_id uuid not null,
  event_type text not null,
  source_version text not null,
  actor_profile_id uuid,
  actor_role text,
  review_status text,
  occurred_at timestamptz not null,
  data_origin text not null,
  created_at timestamptz not null default now(),
  constraint notification_workflow_sources_key_format check (
    source_key ~ '^[a-z0-9][a-z0-9:_-]{2,239}$'
  ),
  constraint notification_workflow_sources_type_allowed check (
    source_type = 'deliverable'
  ),
  constraint notification_workflow_sources_event_allowed check (
    event_type in (
      'deliverable_submitted',
      'deliverable_approved',
      'deliverable_changes_requested',
      'deliverable_rejected'
    )
  ),
  constraint notification_workflow_sources_actor_role_allowed check (
    actor_role in ('advertiser', 'influencer')
  ),
  constraint notification_workflow_sources_review_status_allowed check (
    review_status in ('submitted', 'approved', 'changes_requested', 'rejected')
  ),
  constraint notification_workflow_sources_production_only check (
    data_origin = 'production'
  ),
  unique (source_type, source_id, event_type, source_version)
);

create index if not exists notification_workflow_sources_reconcile_idx
  on public.notification_workflow_sources (occurred_at, source_key);

-- Campaign status is mutable on marketplace_campaigns, so every customer-
-- visible transition receives an immutable source row and an immutable,
-- pre-batched recipient snapshot before projection is attempted.  A later
-- status change can therefore never erase an earlier failed projection.
create table if not exists public.notification_campaign_status_sources (
  source_key text primary key,
  campaign_id text not null,
  brand_profile_id uuid not null,
  organization_id uuid not null,
  campaign_status text not null,
  campaign_title text,
  source_version text not null,
  actor_profile_id uuid not null,
  actor_role text not null,
  occurred_at timestamptz not null,
  data_origin text not null,
  created_at timestamptz not null default now(),
  constraint notification_campaign_status_sources_key_format check (
    source_key ~ '^campaign_status:[0-9a-f]{32}$'
  ),
  constraint notification_campaign_status_sources_status_allowed check (
    campaign_status in ('open', 'closed', 'ended')
  ),
  constraint notification_campaign_status_sources_actor_role check (
    actor_role = 'advertiser'
  ),
  constraint notification_campaign_status_sources_production_only check (
    data_origin = 'production'
  ),
  unique (campaign_id, source_version)
);

create table if not exists public.notification_campaign_status_recipients (
  source_key text not null
    references public.notification_campaign_status_sources (source_key)
    on delete restrict,
  recipient_profile_id uuid not null,
  batch_no integer not null,
  created_at timestamptz not null default now(),
  primary key (source_key, recipient_profile_id),
  constraint notification_campaign_status_recipient_batch_nonnegative check (
    batch_no >= 0
  )
);

create index if not exists notification_campaign_status_sources_reconcile_idx
  on public.notification_campaign_status_sources (occurred_at, source_key);
create index if not exists notification_campaign_status_recipients_batch_idx
  on public.notification_campaign_status_recipients (source_key, batch_no);

-- Projection failures are operational work items.  They contain only a
-- bounded SQLSTATE/error class and source locator, never customer payloads.
create table if not exists public.notification_projection_failures (
  projection_key text not null,
  source_type text not null,
  source_id text not null,
  source_version text not null,
  status text not null default 'pending',
  attempt_count integer not null default 1,
  last_error_code text not null,
  last_error_detail text,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (projection_key, source_type, source_id, source_version),
  constraint notification_projection_failures_status_allowed check (
    status in ('pending', 'resolved')
  ),
  constraint notification_projection_failures_attempt_positive check (
    attempt_count > 0
  ),
  constraint notification_projection_failures_error_code_format check (
    last_error_code ~ '^[0-9A-Z_]{2,32}$'
  )
);

create index if not exists notification_projection_failures_pending_idx
  on public.notification_projection_failures (last_failed_at, projection_key)
  where status = 'pending';

insert into public.notification_projection_state (projection_key, cutover_at)
values ('customer_bell', now())
on conflict (projection_key) do nothing;

alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_projection_state enable row level security;
alter table public.notification_projection_receipts enable row level security;
alter table public.notification_workflow_sources enable row level security;
alter table public.notification_campaign_status_sources enable row level security;
alter table public.notification_campaign_status_recipients enable row level security;
alter table public.notification_projection_failures enable row level security;

revoke all on table
  public.notification_events,
  public.notification_recipients,
  public.notification_outbox,
  public.notification_projection_state,
  public.notification_projection_receipts,
  public.notification_workflow_sources,
  public.notification_campaign_status_sources,
  public.notification_campaign_status_recipients,
  public.notification_projection_failures
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.notification_events,
  public.notification_recipients,
  public.notification_outbox,
  public.notification_projection_state,
  public.notification_projection_receipts,
  public.notification_workflow_sources,
  public.notification_campaign_status_sources,
  public.notification_campaign_status_recipients,
  public.notification_projection_failures
to service_role;

create or replace function public.directsign_notification_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'notification events are immutable';
end;
$$;

drop trigger if exists notification_events_reject_update
  on public.notification_events;
create trigger notification_events_reject_update
before update on public.notification_events
for each row execute function public.directsign_notification_event_immutable();

drop trigger if exists notification_projection_receipts_reject_update
  on public.notification_projection_receipts;
create trigger notification_projection_receipts_reject_update
before update on public.notification_projection_receipts
for each row execute function public.directsign_notification_event_immutable();

drop trigger if exists notification_workflow_sources_reject_update
  on public.notification_workflow_sources;
create trigger notification_workflow_sources_reject_update
before update on public.notification_workflow_sources
for each row execute function public.directsign_notification_event_immutable();

drop trigger if exists notification_campaign_status_sources_reject_update
  on public.notification_campaign_status_sources;
create trigger notification_campaign_status_sources_reject_update
before update on public.notification_campaign_status_sources
for each row execute function public.directsign_notification_event_immutable();

drop trigger if exists notification_campaign_status_recipients_reject_update
  on public.notification_campaign_status_recipients;
create trigger notification_campaign_status_recipients_reject_update
before update on public.notification_campaign_status_recipients
for each row execute function public.directsign_notification_event_immutable();

-- One historical actor rule is shared by projection, reconciliation, and
-- customer reads: a deleted actor remains valid, while an actor row that still
-- exists must remain explicitly production and free of QA/demo/seed markers.
create or replace function public.notification_historical_actor_valid(
  p_actor_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_actor_profile_id is null
    or not exists (
      select 1
      from public.profiles as existing_actor
      where existing_actor.id = p_actor_profile_id
    )
    or exists (
      select 1
      from public.profiles as production_actor
      where production_actor.id = p_actor_profile_id
        and production_actor.data_origin = 'production'
        and lower(production_actor.email)
          !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(production_actor.email)
          !~ '@(example[.](com|org|net)|directsign[.]app)$'
    );
$$;

revoke execute on function public.notification_historical_actor_valid(uuid)
  from public, anon, authenticated;
grant execute on function public.notification_historical_actor_valid(uuid)
  to service_role;

-- Audit payload timestamps are untrusted text.  Parse only the canonical
-- ISO-8601 shape emitted by the server, and turn malformed or impossible
-- calendar values into NULL instead of aborting a projector/reconciler pass.
create or replace function public.notification_safe_timestamptz(
  p_value text
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
begin
  if p_value is null
    or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return null;
  end if;

  begin
    return p_value::timestamptz;
  exception when others then
    return null;
  end;
end;
$$;

revoke execute on function public.notification_safe_timestamptz(text)
  from public, anon, authenticated;
grant execute on function public.notification_safe_timestamptz(text)
  to service_role;

create or replace function public.record_notification_projection_failure(
  p_projection_key text,
  p_source_type text,
  p_source_id text,
  p_source_version text,
  p_error_code text,
  p_error_detail text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and pg_catalog.pg_trigger_depth() = 0 then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  insert into public.notification_projection_failures (
    projection_key,
    source_type,
    source_id,
    source_version,
    status,
    attempt_count,
    last_error_code,
    last_error_detail,
    first_failed_at,
    last_failed_at,
    resolved_at
  ) values (
    left(coalesce(nullif(p_projection_key, ''), 'unknown'), 80),
    left(coalesce(nullif(p_source_type, ''), 'unknown'), 80),
    left(coalesce(nullif(p_source_id, ''), 'unknown'), 160),
    left(coalesce(nullif(p_source_version, ''), 'unknown'), 160),
    'pending',
    1,
    left(
      upper(regexp_replace(
        coalesce(nullif(p_error_code, ''), 'PROJECTION_FAILED'),
        '[^0-9A-Z_]',
        '_',
        'g'
      )),
      32
    ),
    left(regexp_replace(coalesce(p_error_detail, ''), '[[:cntrl:]]', ' ', 'g'), 300),
    now(),
    now(),
    null
  )
  on conflict (projection_key, source_type, source_id, source_version)
  do update set
    status = 'pending',
    attempt_count = public.notification_projection_failures.attempt_count + 1,
    last_error_code = excluded.last_error_code,
    last_error_detail = excluded.last_error_detail,
    last_failed_at = now(),
    resolved_at = null;
end;
$$;

revoke execute on function public.record_notification_projection_failure(
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_notification_projection_failure(
  text, text, text, text, text, text
) to service_role;

create or replace function public.resolve_notification_projection_failure(
  p_projection_key text,
  p_source_type text,
  p_source_id text,
  p_source_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and pg_catalog.pg_trigger_depth() = 0 then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  update public.notification_projection_failures as failure
  set status = 'resolved', resolved_at = now()
  where failure.projection_key = p_projection_key
    and failure.source_type = p_source_type
    and failure.source_id = p_source_id
    and failure.source_version = p_source_version
    and failure.status = 'pending';
end;
$$;

revoke execute on function public.resolve_notification_projection_failure(
  text, text, text, text
) from public, anon, authenticated;
grant execute on function public.resolve_notification_projection_failure(
  text, text, text, text
) to service_role;

-- Preserve who selected a campaign applicant independently from mutable
-- proposal status/updated_at.  No FK is used: the UUID is immutable historical
-- provenance and must survive later profile deletion.
alter table public.marketplace_contact_proposals
  add column if not exists converted_by_profile_id uuid,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_actor_proof_at timestamptz,
  add column if not exists submitted_actor_proof_at timestamptz;

-- Validate a production campaign application at the occurrence boundary and
-- stamp an immutable proof.  The stamp deliberately stays NULL for legacy or
-- non-production rows, which prevents a later profile deletion from turning a
-- previously rejected QA/test application into a retryable production event.
create or replace function public.directsign_capture_campaign_application_submission_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
      join public.marketplace_campaigns as campaign
        on campaign.id = new.campaign_id
        and campaign.brand_profile_id = new.target_brand_profile_id
        and campaign.archived_at is null
      join public.marketplace_brand_profiles as brand
        on brand.id = campaign.brand_profile_id
        and brand.organization_id = campaign.organization_id
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

drop trigger if exists marketplace_campaign_application_submission_proof
  on public.marketplace_contact_proposals;
create trigger marketplace_campaign_application_submission_proof
before insert on public.marketplace_contact_proposals
for each row execute function public.directsign_capture_campaign_application_submission_proof();

revoke execute on function public.directsign_capture_campaign_application_submission_proof()
  from public, anon, authenticated;
grant execute on function public.directsign_capture_campaign_application_submission_proof()
  to service_role;

create or replace function public.directsign_protect_campaign_application_submission_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A QA/non-campaign row cannot be reclassified into a production campaign
  -- after it already carries workflow state that bypassed the INSERT proof.
  if new.direction = 'influencer_to_brand'
    and new.campaign_id is not null
    and new.data_origin = 'production'
    and (
      new.status is distinct from 'submitted'
      or new.converted_contract_id is not null
      or new.converted_by_profile_id is not null
      or new.converted_at is not null
    )
    and (
      old.direction is distinct from new.direction
      or old.campaign_id is distinct from new.campaign_id
      or old.data_origin is distinct from new.data_origin
      or old.target_brand_profile_id is distinct from new.target_brand_profile_id
    ) then
    raise exception using
      errcode = '23514',
      message = 'campaign application provenance cannot be reclassified';
  end if;

  if new.submitted_actor_proof_at is distinct from old.submitted_actor_proof_at
    or (
      (
        old.submitted_actor_proof_at is not null
        or old.converted_actor_proof_at is not null
      )
      and (
        new.sender_profile_id is distinct from old.sender_profile_id
        or new.direction is distinct from old.direction
        or new.campaign_id is distinct from old.campaign_id
        or new.target_brand_profile_id is distinct from old.target_brand_profile_id
        or new.data_origin is distinct from old.data_origin
        or new.created_at is distinct from old.created_at
        or new.sender_name is distinct from old.sender_name
        or new.campaign_snapshot is distinct from old.campaign_snapshot
      )
    ) then
    raise exception using
      errcode = '55000',
      message = 'campaign application submission provenance is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_campaign_application_submission_proof_immutable
  on public.marketplace_contact_proposals;
create trigger marketplace_campaign_application_submission_proof_immutable
before update of
  submitted_actor_proof_at, sender_profile_id, direction, campaign_id,
  target_brand_profile_id, data_origin, created_at, sender_name,
  campaign_snapshot
on public.marketplace_contact_proposals
for each row execute function public.directsign_protect_campaign_application_submission_proof();

revoke execute on function public.directsign_protect_campaign_application_submission_proof()
  from public, anon, authenticated;
grant execute on function public.directsign_protect_campaign_application_submission_proof()
  to service_role;

alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_conversion_actor_pair;
alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_conversion_actor_pair check (
    (converted_by_profile_id is null and converted_at is null)
    or (
      converted_by_profile_id is not null
      and converted_at is not null
      and converted_contract_id is not null
    )
  ) not valid;
alter table public.marketplace_contact_proposals
  validate constraint marketplace_contact_proposals_conversion_actor_pair;

create or replace function public.directsign_protect_campaign_conversion_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversion_occurred_at timestamptz;
begin
  if old.status = 'closed'
    and new.status is distinct from 'closed' then
    raise exception using
      errcode = '55000',
      message = 'closed campaign application status is final';
  end if;
  if old.status = 'declined'
    and new.status is distinct from 'declined' then
    raise exception using
      errcode = '55000',
      message = 'declined campaign application status is final';
  end if;
  if old.status = 'converted_to_contract'
    and new.status not in ('converted_to_contract', 'closed') then
    raise exception using
      errcode = '55000',
      message = 'converted campaign application status is monotonic';
  end if;
  if new.status = 'converted_to_contract'
    and (
      old.status is null
      or old.status not in (
        'submitted', 'reviewed', 'accepted', 'converted_to_contract'
      )
    ) then
    raise exception using
      errcode = '23514',
      message = 'campaign conversion source status is not eligible';
  end if;

  if old.converted_contract_id is not null
    or old.converted_by_profile_id is not null
    or old.converted_at is not null
    or old.converted_actor_proof_at is not null then
    if new.converted_by_profile_id is distinct from old.converted_by_profile_id
      or new.converted_at is distinct from old.converted_at
      or new.converted_contract_id is distinct from old.converted_contract_id
      or new.converted_actor_proof_at is distinct from old.converted_actor_proof_at then
      raise exception using
        errcode = '55000',
        message = 'campaign conversion provenance is immutable';
    end if;
    if old.converted_actor_proof_at is null
      and old.status in ('submitted', 'reviewed', 'accepted')
      and new.status = 'converted_to_contract' then
      raise exception using
        errcode = '23514',
        message = 'DB-validated campaign conversion proof is required';
    end if;
    return new;
  end if;

  if not (
      old.status in ('submitted', 'reviewed', 'accepted')
      and new.status = 'converted_to_contract'
    )
    and (
      new.converted_by_profile_id is distinct from old.converted_by_profile_id
      or new.converted_at is distinct from old.converted_at
      or new.converted_contract_id is distinct from old.converted_contract_id
      or new.converted_actor_proof_at is distinct from old.converted_actor_proof_at
    ) then
    raise exception using
      errcode = '23514',
      message = 'campaign conversion proof must be captured with the status transition';
  end if;

  if not (
      old.status in ('submitted', 'reviewed', 'accepted')
      and new.status = 'converted_to_contract'
    )
    and new.converted_by_profile_id is not distinct from old.converted_by_profile_id
    and new.converted_at is not distinct from old.converted_at
    and new.converted_contract_id is not distinct from old.converted_contract_id
    and new.converted_actor_proof_at is not distinct from old.converted_actor_proof_at then
    return new;
  end if;
  if new.status <> 'converted_to_contract'
    or new.converted_contract_id is null
    or new.converted_by_profile_id is null then
    raise exception using
      errcode = '23514',
      message = 'complete campaign conversion provenance is required';
  end if;

  if new.direction <> 'influencer_to_brand'
    or new.campaign_id is null
    or new.data_origin is distinct from 'production' then
    new.converted_actor_proof_at := null;
    return new;
  end if;

  if not exists (
      select 1
      from public.marketplace_campaigns as campaign
      join public.marketplace_brand_profiles as brand
        on brand.id = campaign.brand_profile_id
        and brand.id = new.target_brand_profile_id
        and brand.organization_id = campaign.organization_id
        and brand.data_origin = 'production'
      join public.contracts as selected_contract
        on selected_contract.id = new.converted_contract_id
        and selected_contract.deleted_at is null
        and selected_contract.data_origin = 'production'
        and selected_contract.owner_organization_id = campaign.organization_id
        and selected_contract.workflow_source = 'marketplace_campaign'
        and selected_contract.marketplace_campaign_id = new.campaign_id
        and selected_contract.source_application_id = new.id::text
      join public.organization_members as membership
        on membership.organization_id = campaign.organization_id
        and membership.profile_id = new.converted_by_profile_id
        and membership.role in ('owner', 'admin', 'marketer')
      join public.profiles as actor
        on actor.id = membership.profile_id
        and actor.role = 'marketer'
        and actor.data_origin = 'production'
        and lower(actor.email)
          !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(actor.email)
          !~ '@(example[.](com|org|net)|directsign[.]app)$'
      where campaign.id = new.campaign_id
        and campaign.archived_at is null
    ) then
    raise exception using
      errcode = '42501',
      message = 'production campaign selection actor is not authorized';
  end if;

  -- Ignore any caller-supplied timestamp.  The selected transition and its
  -- immutable proof share one database-owned occurrence time, but only after
  -- exact campaign, application, contract, organization, and actor binding.
  v_conversion_occurred_at := clock_timestamp();
  new.converted_at := v_conversion_occurred_at;
  new.converted_actor_proof_at := v_conversion_occurred_at;
  return new;
end;
$$;

drop trigger if exists marketplace_campaign_conversion_provenance_immutable
  on public.marketplace_contact_proposals;
create trigger marketplace_campaign_conversion_provenance_immutable
before update of
  status, converted_contract_id, converted_by_profile_id, converted_at,
  converted_actor_proof_at
on public.marketplace_contact_proposals
for each row execute function public.directsign_protect_campaign_conversion_provenance();

revoke execute on function public.directsign_protect_campaign_conversion_provenance()
  from public, anon, authenticated;
grant execute on function public.directsign_protect_campaign_conversion_provenance()
  to service_role;

-- Replace the old four-argument RPC.  Existing servers cannot silently create
-- a selected campaign application without durable actor provenance: for a
-- converted transition p_actor_profile_id is mandatory.
drop function if exists public.transition_marketplace_contact_proposal(
  uuid, text[], text, uuid
);

create function public.transition_marketplace_contact_proposal(
  p_proposal_id uuid,
  p_expected_statuses text[],
  p_next_status text,
  p_converted_contract_id uuid default null,
  p_actor_profile_id uuid default null
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
set search_path = ''
as $$
declare
  v_proposal public.marketplace_contact_proposals%rowtype;
  v_status_before text;
  v_changed_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_next_status not in (
    'submitted', 'reviewed', 'accepted', 'declined',
    'converted_to_contract', 'closed'
  ) then
    raise exception 'unsupported marketplace proposal status';
  end if;
  if p_next_status = 'converted_to_contract' and (
    p_converted_contract_id is null or p_actor_profile_id is null
  ) then
    raise exception 'converted contract and actor are required';
  end if;

  select * into v_proposal
  from public.marketplace_contact_proposals as proposal
  where proposal.id = p_proposal_id
  for update;
  if not found then return; end if;

  v_status_before := v_proposal.status;
  if not (v_proposal.status = any(coalesce(p_expected_statuses, '{}'::text[]))) then
    return query select
      v_proposal.id,
      v_status_before,
      v_proposal.status,
      v_proposal.converted_contract_id,
      false;
    return;
  end if;

  if p_next_status = 'converted_to_contract'
    and v_proposal.converted_at is not null then
    if v_proposal.status = 'converted_to_contract'
      and v_proposal.converted_contract_id = p_converted_contract_id then
      return query select
        v_proposal.id,
        v_status_before,
        v_proposal.status,
        v_proposal.converted_contract_id,
        false;
      return;
    end if;
    raise exception using
      errcode = '55000',
      message = 'campaign conversion provenance is immutable';
  end if;

  -- A production campaign selection may only name an exact production
  -- advertiser who currently belongs to the campaign owner organization.
  if p_next_status = 'converted_to_contract'
    and v_proposal.direction = 'influencer_to_brand'
    and v_proposal.campaign_id is not null
    and v_proposal.data_origin = 'production'
    and not exists (
      select 1
      from public.marketplace_campaigns as campaign
      join public.marketplace_brand_profiles as brand
        on brand.id = campaign.brand_profile_id
        and brand.id = v_proposal.target_brand_profile_id
        and brand.organization_id = campaign.organization_id
        and brand.data_origin = 'production'
      join public.organization_members as membership
        on membership.organization_id = campaign.organization_id
        and membership.profile_id = p_actor_profile_id
        and membership.role in ('owner', 'admin', 'marketer')
      join public.profiles as actor
        on actor.id = membership.profile_id
        and actor.role = 'marketer'
        and actor.data_origin = 'production'
        and lower(actor.email)
          !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(actor.email)
          !~ '@(example[.](com|org|net)|directsign[.]app)$'
      where campaign.id = v_proposal.campaign_id
        and campaign.archived_at is null
    ) then
    raise exception using
      errcode = '42501',
      message = 'production campaign selection actor is not authorized';
  end if;

  v_changed_at := now();
  update public.marketplace_contact_proposals as proposal
  set
    status = p_next_status,
    converted_contract_id = case
      when p_next_status = 'converted_to_contract' then p_converted_contract_id
      else proposal.converted_contract_id
    end,
    converted_by_profile_id = case
      when p_next_status = 'converted_to_contract' then p_actor_profile_id
      else proposal.converted_by_profile_id
    end,
    converted_at = case
      when p_next_status = 'converted_to_contract' then v_changed_at
      else proposal.converted_at
    end,
    updated_at = v_changed_at
  where proposal.id = p_proposal_id
  returning * into v_proposal;

  return query select
    v_proposal.id,
    v_status_before,
    v_proposal.status,
    v_proposal.converted_contract_id,
    true;
end;
$$;

revoke execute on function public.transition_marketplace_contact_proposal(
  uuid, text[], text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.transition_marketplace_contact_proposal(
  uuid, text[], text, uuid, uuid
) to service_role;

-- Existing invite-first contracts may have an influencer party email but no
-- profile_id. Link only one exact normalized production influencer identity;
-- never infer by handle/name and never allow QA/demo/seed identities.
update public.contract_parties as party
set profile_id = profile.id, updated_at = now()
from public.profiles as profile,
     public.contracts as contract
where party.profile_id is null
  and party.party_role = 'influencer'
  and party.email is not null
  and btrim(party.email) <> ''
  and contract.id = party.contract_id
  and contract.deleted_at is null
  and contract.data_origin = 'production'
  and profile.role = 'influencer'
  and profile.data_origin = 'production'
  and lower(btrim(profile.email)) = lower(btrim(party.email))
  and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
  and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
  and 1 = (
    select count(*)
    from public.profiles as candidate
    where candidate.role = 'influencer'
      and candidate.data_origin = 'production'
      and lower(btrim(candidate.email)) = lower(btrim(party.email))
      and lower(candidate.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
      and lower(candidate.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
  );

create or replace function public.directsign_link_influencer_contract_parties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error_code text;
  v_error_detail text;
begin
  if new.role::text <> 'influencer'
    or new.data_origin is distinct from 'production'
    or btrim(coalesce(new.email, '')) = ''
    or lower(new.email) ~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
    or lower(new.email) ~ '@(example[.](com|org|net)|directsign[.]app)$' then
    return new;
  end if;

  -- Fail closed when legacy/profile corruption produced more than one
  -- production influencer with the same normalized email.
  if exists (
    select 1
    from public.profiles as other
    where other.id <> new.id
      and other.role = 'influencer'
      and other.data_origin = 'production'
      and lower(btrim(other.email)) = lower(btrim(new.email))
  ) then
    return new;
  end if;

  begin
    update public.contract_parties as party
    set profile_id = new.id, updated_at = now()
    from public.contracts as contract
    where party.profile_id is null
      and party.party_role = 'influencer'
      and party.email is not null
      and lower(btrim(party.email)) = lower(btrim(new.email))
      and contract.id = party.contract_id
      and contract.deleted_at is null
      and contract.data_origin = 'production';
  exception
    when others then
      get stacked diagnostics
        v_error_code = returned_sqlstate,
        v_error_detail = message_text;
      begin
        perform public.record_notification_projection_failure(
          'contract_party_profile_link',
          'profile',
          new.id::text,
          new.updated_at::text,
          v_error_code,
          v_error_detail
        );
      exception when others then
        raise warning 'influencer contract-party link failed [%]', v_error_code;
      end;
  end;

  return new;
end;
$$;

drop trigger if exists profiles_link_influencer_contract_parties
  on public.profiles;
create trigger profiles_link_influencer_contract_parties
after insert or update of email, role, data_origin on public.profiles
for each row execute function public.directsign_link_influencer_contract_parties();

revoke execute on function public.directsign_link_influencer_contract_parties()
  from public, anon, authenticated;
grant execute on function public.directsign_link_influencer_contract_parties()
  to service_role;

-- A profile trigger can fail transiently and a contract party can also be
-- inserted after the matching profile.  This bounded, lock-safe reconciler
-- uses the same exact production identity proof and makes both cases retryable
-- across instances.
create or replace function public.reconcile_influencer_contract_party_links(
  p_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  for v_candidate in
    select party.id as party_id, profile.id as profile_id
    from public.contract_parties as party
    join public.contracts as contract
      on contract.id = party.contract_id
      and contract.deleted_at is null
      and contract.data_origin = 'production'
    join public.profiles as profile
      on profile.role = 'influencer'
      and profile.data_origin = 'production'
      and lower(btrim(profile.email)) = lower(btrim(party.email))
      and lower(profile.email)
        !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
      and lower(profile.email)
        !~ '@(example[.](com|org|net)|directsign[.]app)$'
    where party.profile_id is null
      and party.party_role = 'influencer'
      and party.email is not null
      and btrim(party.email) <> ''
      and 1 = (
        select count(*)
        from public.profiles as candidate
        where candidate.role = 'influencer'
          and candidate.data_origin = 'production'
          and lower(btrim(candidate.email)) = lower(btrim(party.email))
          and lower(candidate.email)
            !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
          and lower(candidate.email)
            !~ '@(example[.](com|org|net)|directsign[.]app)$'
      )
    order by party.updated_at asc, party.id asc
    limit least(greatest(p_limit, 1), 1000)
    for update of party skip locked
  loop
    update public.contract_parties as party
    set profile_id = v_candidate.profile_id, updated_at = now()
    where party.id = v_candidate.party_id
      and party.profile_id is null;
    if found then
      v_count := v_count + 1;
      update public.notification_projection_failures as failure
      set status = 'resolved', resolved_at = now()
      where failure.projection_key = 'contract_party_profile_link'
        and failure.source_type = 'profile'
        and failure.source_id = v_candidate.profile_id::text
        and failure.status = 'pending';
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.reconcile_influencer_contract_party_links(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_influencer_contract_party_links(integer)
  to service_role;

-- Atomically appends one immutable event, its authoritative recipients, and an
-- outbox record.  Idempotency collisions must describe the exact same source
-- version; a reused key with different facts fails closed.
create or replace function public.enqueue_notification_event(
  p_event_key text,
  p_event_type text,
  p_source_type text,
  p_source_id text,
  p_source_version text,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_copy_key text,
  p_safe_params jsonb,
  p_route_key text,
  p_route_params jsonb,
  p_data_origin text,
  p_occurred_at timestamptz,
  p_recipients jsonb
)
returns table (notification_event_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_inserted boolean := false;
  v_existing public.notification_events%rowtype;
  v_existing_receipt public.notification_projection_receipts%rowtype;
  v_fact_fingerprint text;
  v_requested_recipient_keys text[];
  v_existing_recipient_keys text[];
begin
  -- Direct RPC use remains service-only.  The trigger-depth exception permits
  -- only trusted database triggers already attached by this migration; an
  -- authenticated client cannot manufacture trigger depth for a direct call.
  if coalesce(auth.role(), '') <> 'service_role'
    and pg_catalog.pg_trigger_depth() = 0 then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  if p_data_origin is distinct from 'production' then
    return;
  end if;
  if p_actor_profile_id is not null and not exists (
    select 1
    from public.profiles as actor
    where actor.id = p_actor_profile_id
      and actor.data_origin = 'production'
      and lower(actor.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
      and lower(actor.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
  ) then
    -- Existing non-production/test identities always fail closed.  A profile
    -- deleted after an occurrence is allowed only when an immutable source
    -- captured and production-validated that exact actor beforehand.
    if exists (
      select 1 from public.profiles as existing_actor
      where existing_actor.id = p_actor_profile_id
    ) or not (
      (
        p_source_type = 'deliverable'
        and exists (
          select 1
          from public.notification_workflow_sources as source
          where source.source_key = p_event_key
            and source.source_id = case
              when p_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then p_source_id::uuid
              else null::uuid
            end
            and source.source_version = p_source_version
            and source.actor_profile_id = p_actor_profile_id
            and source.data_origin = 'production'
        )
      )
      or (
        p_source_type = 'contract_event'
        and exists (
          select 1
          from public.contract_events as contract_event
          join public.contracts as contract
            on contract.id = contract_event.contract_id
            and contract.deleted_at is null
            and contract.data_origin = 'production'
          where contract_event.id = case
              when p_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then p_source_id::uuid
              else null::uuid
            end
            and p_event_key = 'contract_event:' || contract_event.id::text
            and p_source_version = contract_event.id::text
            and contract_event.actor_profile_id = p_actor_profile_id
            and contract_event.notification_actor_proof_at is not null
            and contract_event.event_type in (
              'share_link_issued',
              'contract_signed',
              'post_link_submitted',
              'deliverable_submitted',
              'deliverable_approved',
              'deliverable_changes_requested',
              'deliverable_rejected',
              'contract_closed'
            )
        )
      )
      or (
        p_source_type = 'campaign'
        and exists (
          select 1
          from public.notification_campaign_status_sources as source
          join public.notification_campaign_status_recipients as snapshot
            on snapshot.source_key = source.source_key
          where source.campaign_id = p_source_id
            and source.actor_profile_id = p_actor_profile_id
            and source.data_origin = 'production'
            and p_event_key = source.source_key || ':batch:' || snapshot.batch_no::text
            and p_source_version =
              source.source_version || ':batch:' || snapshot.batch_no::text
        )
      )
      or (
        p_source_type = 'campaign_application'
        and exists (
          select 1
          from public.marketplace_contact_proposals as proposal
          where proposal.id = case
              when p_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then p_source_id::uuid
              else null::uuid
            end
            and proposal.data_origin = 'production'
            and (
              (
                proposal.sender_profile_id = p_actor_profile_id
                and proposal.submitted_actor_proof_at is not null
                and p_event_key =
                  'campaign_application:' || proposal.id::text || ':submitted'
                and p_source_version =
                  extract(epoch from proposal.created_at)::text || ':submitted'
              )
              or (
                proposal.converted_by_profile_id = p_actor_profile_id
                and proposal.converted_at is not null
                and proposal.converted_actor_proof_at is not null
                and p_event_key =
                  'campaign_application:' || proposal.id::text || ':selected'
                and p_source_version =
                  extract(epoch from proposal.converted_at)::text || ':selected'
              )
            )
        )
      )
    ) then
      return;
    end if;
  end if;
  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array' then
    raise exception 'notification recipients must be an array';
  end if;
  if jsonb_array_length(coalesce(p_recipients, '[]'::jsonb)) > 250 then
    raise exception 'notification recipient safety limit exceeded';
  end if;

  -- Resolve an immutable recipient snapshot from real, correctly-typed product
  -- profiles. Advertiser recipients are additionally bound to the supplied
  -- organization membership.
  select array_agg(eligible.recipient_key order by eligible.recipient_key)
  into v_requested_recipient_keys
  from (
    select distinct concat_ws(
      ':',
      recipient.id::text,
      requested."role",
      case
        when requested."role" = 'advertiser'
          then nullif(requested."organizationId", '')::uuid::text
        else ''
      end
    ) as recipient_key
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as requested(
      "profileId" text,
      "role" text,
      "organizationId" text
    )
    join public.profiles as recipient
      on recipient.id = nullif(requested."profileId", '')::uuid
    where requested."role" in ('advertiser', 'influencer')
      and (
        (requested."role" = 'advertiser' and recipient.role = 'marketer')
        or (requested."role" = 'influencer' and recipient.role = 'influencer')
      )
      and recipient.id is distinct from p_actor_profile_id
      and recipient.data_origin = 'production'
      and lower(recipient.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
      and lower(recipient.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
      and (
        requested."role" = 'influencer'
        or exists (
          select 1
          from public.organization_members as membership
          where membership.profile_id = recipient.id
            and membership.organization_id =
              nullif(requested."organizationId", '')::uuid
        )
      )
  ) as eligible;

  if coalesce(cardinality(v_requested_recipient_keys), 0) = 0 then
    return;
  end if;

  v_fact_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'eventType', p_event_type,
      'sourceType', p_source_type,
      'sourceId', p_source_id,
      'sourceVersion', p_source_version,
      'actorProfileId', p_actor_profile_id,
      'actorRole', p_actor_role,
      'copyKey', p_copy_key,
      'safeParams', coalesce(p_safe_params, '{}'::jsonb),
      'routeKey', p_route_key,
      'routeParams', coalesce(p_route_params, '{}'::jsonb),
      'dataOrigin', p_data_origin,
      'occurredAtEpoch', extract(epoch from p_occurred_at),
      'recipients', to_jsonb(v_requested_recipient_keys)
    )::text
  );

  select * into v_existing_receipt
  from public.notification_projection_receipts as receipt
  where receipt.event_key = p_event_key;

  if found then
    if v_existing_receipt.fact_fingerprint is distinct from v_fact_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'notification projection receipt collision';
    end if;

    return query
    select event.id, false
    from public.notification_events as event
    where event.event_key = p_event_key
    limit 1;
    return;
  end if;

  insert into public.notification_events (
    event_key,
    event_type,
    source_type,
    source_id,
    source_version,
    actor_profile_id,
    actor_role,
    copy_key,
    safe_params,
    route_key,
    route_params,
    data_origin,
    occurred_at,
    expires_at
  )
  values (
    p_event_key,
    p_event_type,
    p_source_type,
    p_source_id,
    p_source_version,
    p_actor_profile_id,
    p_actor_role,
    p_copy_key,
    coalesce(p_safe_params, '{}'::jsonb),
    p_route_key,
    coalesce(p_route_params, '{}'::jsonb),
    p_data_origin,
    p_occurred_at,
    p_occurred_at + interval '180 days'
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select * into v_existing
    from public.notification_events
    where event_key = p_event_key;

    if not found then
      raise exception 'notification idempotency lookup failed';
    end if;
    if v_existing.event_type is distinct from p_event_type
      or v_existing.source_type is distinct from p_source_type
      or v_existing.source_id is distinct from p_source_id
      or v_existing.source_version is distinct from p_source_version
      or v_existing.actor_profile_id is distinct from p_actor_profile_id
      or v_existing.actor_role is distinct from p_actor_role
      or v_existing.copy_key is distinct from p_copy_key
      or v_existing.safe_params is distinct from coalesce(p_safe_params, '{}'::jsonb)
      or v_existing.route_key is distinct from p_route_key
      or v_existing.route_params is distinct from coalesce(p_route_params, '{}'::jsonb)
      or v_existing.data_origin is distinct from p_data_origin
      or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception using
        errcode = '23505',
        message = 'notification idempotency key collision';
    end if;
    v_event_id := v_existing.id;

    select array_agg(existing_recipient.recipient_key order by existing_recipient.recipient_key)
    into v_existing_recipient_keys
    from (
      select concat_ws(
        ':',
        recipient.recipient_profile_id::text,
        recipient.recipient_role,
        coalesce(recipient.recipient_organization_id::text, '')
      ) as recipient_key
      from public.notification_recipients as recipient
      where recipient.event_id = v_event_id
    ) as existing_recipient;

    -- Idempotent retries preserve the original audience exactly.  They never
    -- expand an old event to organization members who joined later.
    if coalesce(v_existing_recipient_keys, '{}'::text[])
      is distinct from coalesce(v_requested_recipient_keys, '{}'::text[]) then
      raise exception using
        errcode = '23505',
        message = 'notification recipient snapshot collision';
    end if;
  else
    v_inserted := true;
  end if;

  insert into public.notification_recipients (
    event_id,
    recipient_profile_id,
    recipient_role,
    recipient_organization_id,
    occurred_at
  )
  select distinct
    v_event_id,
    recipient.id,
    requested."role",
    case
      when requested."role" = 'advertiser'
        then nullif(requested."organizationId", '')::uuid
      else null
    end,
    p_occurred_at
  from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as requested(
    "profileId" text,
    "role" text,
    "organizationId" text
  )
  join public.profiles as recipient
    on recipient.id = nullif(requested."profileId", '')::uuid
  where requested."role" in ('advertiser', 'influencer')
    and (
      (requested."role" = 'advertiser' and recipient.role = 'marketer')
      or (requested."role" = 'influencer' and recipient.role = 'influencer')
    )
    and recipient.id is distinct from p_actor_profile_id
    and recipient.data_origin = 'production'
    and lower(recipient.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
    and lower(recipient.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
    and (
      requested."role" = 'influencer'
      or exists (
        select 1
        from public.organization_members as membership
        where membership.profile_id = recipient.id
          and membership.organization_id =
            nullif(requested."organizationId", '')::uuid
      )
    )
  on conflict (event_id, recipient_profile_id) do nothing;

  insert into public.notification_outbox (event_id)
  values (v_event_id)
  on conflict (event_id) do nothing;

  insert into public.notification_projection_receipts (
    event_key,
    fact_fingerprint,
    notification_event_id,
    source_type,
    source_id,
    source_version
  ) values (
    p_event_key,
    v_fact_fingerprint,
    v_event_id,
    p_source_type,
    p_source_id,
    p_source_version
  )
  on conflict (event_key) do nothing;

  select * into v_existing_receipt
  from public.notification_projection_receipts as receipt
  where receipt.event_key = p_event_key;
  if not found
    or v_existing_receipt.fact_fingerprint is distinct from v_fact_fingerprint then
    raise exception using
      errcode = '23505',
      message = 'notification projection receipt collision';
  end if;

  return query select v_event_id, v_inserted;
end;
$$;

revoke execute on function public.enqueue_notification_event(
  text, text, text, text, text, uuid, text, text, jsonb, text, jsonb,
  text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.enqueue_notification_event(
  text, text, text, text, text, uuid, text, text, jsonb, text, jsonb,
  text, timestamptz, jsonb
) to service_role;

-- Project one authoritative deliverable transition captured in the same
-- transaction as the deliverable mutation.  API-side audit writes remain
-- useful evidence, but they are no longer the only durable notification
-- source and therefore cannot create a second Bell item.
create or replace function public.project_notification_workflow_source(
  p_source_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.notification_workflow_sources%rowtype;
  v_contract public.contracts%rowtype;
  v_copy_key text;
  v_event_type text;
  v_target_role text;
  v_recipients jsonb;
  v_notification_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and pg_catalog.pg_trigger_depth() = 0 then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select * into v_source
  from public.notification_workflow_sources as source
  where source.source_key = p_source_key;
  if not found or v_source.data_origin is distinct from 'production' then
    return null;
  end if;
  if not public.notification_historical_actor_valid(
    v_source.actor_profile_id
  ) then
    return null;
  end if;

  select * into v_contract
  from public.contracts as contract
  where contract.id = v_source.contract_id
    and contract.deleted_at is null
    and contract.data_origin = 'production';
  if not found then return null; end if;

  case v_source.event_type
    when 'deliverable_submitted' then
      v_copy_key := 'contract.content_submitted';
      v_event_type := 'contract.content_submitted';
      v_target_role := 'advertiser';
    when 'deliverable_approved' then
      v_copy_key := 'contract.content_reviewed';
      v_event_type := 'contract.content_reviewed';
      v_target_role := 'influencer';
    when 'deliverable_changes_requested' then
      v_copy_key := 'contract.content_reviewed';
      v_event_type := 'contract.content_reviewed';
      v_target_role := 'influencer';
    when 'deliverable_rejected' then
      v_copy_key := 'contract.content_reviewed';
      v_event_type := 'contract.content_reviewed';
      v_target_role := 'influencer';
    else
      return null;
  end case;

  if v_target_role = 'advertiser' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'profileId', recipient.profile_id::text,
      'role', 'advertiser',
      'organizationId', recipient.organization_id::text
    )), '[]'::jsonb)
    into v_recipients
    from (
      select distinct membership.profile_id, membership.organization_id
      from public.organization_members as membership
      join public.profiles as profile
        on profile.id = membership.profile_id
        and profile.data_origin = 'production'
        and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
      where membership.organization_id = v_contract.owner_organization_id
        and membership.role in ('owner', 'admin', 'marketer')
    ) as recipient;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'profileId', party.profile_id::text,
      'role', 'influencer'
    )), '[]'::jsonb)
    into v_recipients
    from (
      select distinct contract_party.profile_id
      from public.contract_parties as contract_party
      join public.profiles as profile
        on profile.id = contract_party.profile_id
        and profile.data_origin = 'production'
        and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
      where contract_party.contract_id = v_contract.id
        and contract_party.party_role = 'influencer'
        and contract_party.profile_id is not null
    ) as party;
  end if;

  select result.notification_event_id into v_notification_id
  from public.enqueue_notification_event(
    v_source.source_key,
    v_event_type,
    'deliverable',
    v_source.source_id::text,
    v_source.source_version,
    v_source.actor_profile_id,
    v_source.actor_role,
    v_copy_key,
    jsonb_strip_nulls(jsonb_build_object(
      'contractTitle', left(v_contract.campaign_title, 120),
      'reviewStatus', v_source.review_status
    )),
    'contract_detail',
    jsonb_build_object('contractId', v_contract.id::text),
    'production',
    v_source.occurred_at,
    v_recipients
  ) as result
  limit 1;

  perform public.resolve_notification_projection_failure(
    'customer_bell',
    v_source.source_type,
    v_source.source_id::text,
    v_source.source_version
  );
  return v_notification_id;
end;
$$;

revoke execute on function public.project_notification_workflow_source(text)
  from public, anon, authenticated;
grant execute on function public.project_notification_workflow_source(text)
  to service_role;

create or replace function public.directsign_capture_deliverable_notification_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_event_type text;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_occurred_at timestamptz;
  v_source_version text;
  v_source_key text;
  v_error_code text;
  v_error_detail text;
begin
  select * into v_contract
  from public.contracts as contract
  where contract.id = new.contract_id
    and contract.deleted_at is null
    and contract.data_origin = 'production';
  if not found then return new; end if;

  if tg_op = 'INSERT' and new.review_status::text = 'submitted' then
    v_event_type := 'deliverable_submitted';
    v_actor_profile_id := new.creator_profile_id;
    v_actor_role := 'influencer';
    v_occurred_at := coalesce(new.submitted_at, new.updated_at, new.created_at, now());
  elsif tg_op = 'UPDATE'
    and old.review_status is distinct from new.review_status
    and new.review_status::text in ('approved', 'changes_requested', 'rejected') then
    v_event_type := case new.review_status::text
      when 'approved' then 'deliverable_approved'
      when 'changes_requested' then 'deliverable_changes_requested'
      else 'deliverable_rejected'
    end;
    v_actor_profile_id := new.reviewed_by_profile_id;
    v_actor_role := 'advertiser';
    v_occurred_at := coalesce(new.reviewed_at, new.updated_at, now());
  else
    return new;
  end if;

  if v_actor_profile_id is null
    or not exists (
      select 1
      from public.profiles as actor
      where actor.id = v_actor_profile_id
        and actor.data_origin = 'production'
        and (
          (v_actor_role = 'influencer' and actor.role = 'influencer')
          or (v_actor_role = 'advertiser' and actor.role = 'marketer')
        )
        and lower(actor.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(actor.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
    )
    or (
      v_actor_role = 'influencer'
      and not exists (
        select 1
        from public.contract_parties as party
        where party.contract_id = new.contract_id
          and party.party_role = 'influencer'
          and party.profile_id = v_actor_profile_id
      )
    )
    or (
      v_actor_role = 'advertiser'
      and not exists (
        select 1
        from public.organization_members as membership
        where membership.organization_id = v_contract.owner_organization_id
          and membership.profile_id = v_actor_profile_id
          and membership.role in ('owner', 'admin', 'marketer')
      )
    ) then
    raise exception using
      errcode = '42501',
      message = 'authoritative production deliverable actor is required';
  end if;

  v_source_version := new.review_status::text || ':' ||
    extract(epoch from v_occurred_at)::text;
  v_source_key := 'deliverable:' || new.id::text || ':' ||
    pg_catalog.md5(pg_catalog.concat_ws(
      '|', v_event_type, v_source_version
    ));

  -- Source capture is part of the deliverable business mutation.  Projection
  -- may fail independently below, but source/actor capture must either persist
  -- atomically or roll the deliverable transition back.
  insert into public.notification_workflow_sources (
    source_key,
    source_type,
    source_id,
    contract_id,
    event_type,
    source_version,
    actor_profile_id,
    actor_role,
    review_status,
    occurred_at,
    data_origin
  ) values (
    v_source_key,
    'deliverable',
    new.id,
    new.contract_id,
    v_event_type,
    v_source_version,
    v_actor_profile_id,
    v_actor_role,
    new.review_status::text,
    v_occurred_at,
    'production'
  );

  begin
    perform public.project_notification_workflow_source(v_source_key);
  exception
    when others then
      get stacked diagnostics
        v_error_code = returned_sqlstate,
        v_error_detail = message_text;
      begin
        perform public.record_notification_projection_failure(
          'customer_bell',
          'deliverable',
          new.id::text,
          v_source_version,
          v_error_code,
          v_error_detail
        );
      exception when others then
        raise warning 'customer Bell projection failed [%]', v_error_code;
      end;
  end;

  return new;
end;
$$;

drop trigger if exists deliverables_capture_notification_source
  on public.deliverables;
create trigger deliverables_capture_notification_source
after insert or update of review_status on public.deliverables
for each row execute function public.directsign_capture_deliverable_notification_source();

revoke execute on function public.directsign_capture_deliverable_notification_source()
  from public, anon, authenticated;
grant execute on function public.directsign_capture_deliverable_notification_source()
  to service_role;

create or replace function public.reconcile_notification_workflow_sources(
  p_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.notification_workflow_sources%rowtype;
  v_count integer := 0;
  v_error_code text;
  v_error_detail text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  for v_source in
    select source.*
    from public.notification_workflow_sources as source
    left join public.notification_projection_receipts as receipt
      on receipt.event_key = source.source_key
    where source.data_origin = 'production'
      and public.notification_historical_actor_valid(
        source.actor_profile_id
      )
      and receipt.event_key is null
      and exists (
        select 1
        from public.contracts as contract
        where contract.id = source.contract_id
          and contract.deleted_at is null
          and contract.data_origin = 'production'
          and (
            (
              source.event_type = 'deliverable_submitted'
              and exists (
                select 1
                from public.organization_members as membership
                join public.profiles as profile
                  on profile.id = membership.profile_id
                  and profile.data_origin = 'production'
                  and lower(profile.email)
                    !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
                  and lower(profile.email)
                    !~ '@(example[.](com|org|net)|directsign[.]app)$'
                where membership.organization_id = contract.owner_organization_id
                  and membership.role in ('owner', 'admin', 'marketer')
              )
            )
            or (
              source.event_type <> 'deliverable_submitted'
              and exists (
                select 1
                from public.contract_parties as party
                join public.profiles as profile
                  on profile.id = party.profile_id
                  and profile.data_origin = 'production'
                  and lower(profile.email)
                    !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
                  and lower(profile.email)
                    !~ '@(example[.](com|org|net)|directsign[.]app)$'
                where party.contract_id = contract.id
                  and party.party_role = 'influencer'
              )
            )
          )
      )
    order by source.occurred_at asc, source.source_key asc
    limit least(greatest(p_limit, 1), 1000)
  loop
    begin
      if public.project_notification_workflow_source(v_source.source_key) is not null then
        v_count := v_count + 1;
      end if;
    exception
      when others then
        get stacked diagnostics
          v_error_code = returned_sqlstate,
          v_error_detail = message_text;
        perform public.record_notification_projection_failure(
          'customer_bell',
          v_source.source_type,
          v_source.source_id::text,
          v_source.source_version,
          v_error_code,
          v_error_detail
        );
    end;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.reconcile_notification_workflow_sources(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_notification_workflow_sources(integer)
  to service_role;

-- Campaign applications are represented in marketplace_contact_proposals for
-- storage compatibility, but they are campaign workflow (Bell), not human 1:1
-- dialogue (message center). Project them in the same database transaction.
create or replace function public.project_campaign_application_notification(
  p_proposal_id uuid,
  p_transition text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.marketplace_contact_proposals%rowtype;
  v_brand public.marketplace_brand_profiles%rowtype;
  v_recipients jsonb;
  v_projection_version text;
  v_occurred_at timestamptz;
  v_notification_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and pg_catalog.pg_trigger_depth() = 0 then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  if p_transition not in ('submitted', 'selected') then
    raise exception 'invalid campaign application projection transition';
  end if;

  select * into v_proposal
  from public.marketplace_contact_proposals as proposal
  where proposal.id = p_proposal_id
    and proposal.direction = 'influencer_to_brand'
    and proposal.campaign_id is not null
    and proposal.data_origin = 'production';
  if not found then return null; end if;
  if v_proposal.sender_profile_id is null
    or not public.notification_historical_actor_valid(
      v_proposal.sender_profile_id
    ) then
    return null;
  end if;
  if p_transition = 'submitted'
    and v_proposal.submitted_actor_proof_at is null then
    return null;
  end if;
  if p_transition = 'selected' and (
    v_proposal.status not in ('converted_to_contract', 'closed')
    or v_proposal.converted_contract_id is null
    or v_proposal.converted_by_profile_id is null
    or v_proposal.converted_at is null
    or v_proposal.converted_actor_proof_at is null
  ) then
    return null;
  end if;

  select * into v_brand
  from public.marketplace_brand_profiles
  where id = v_proposal.target_brand_profile_id
    and data_origin = 'production';
  if not found then return null; end if;
  if not exists (
    select 1
    from public.marketplace_campaigns as campaign
    where campaign.id = v_proposal.campaign_id
      and campaign.brand_profile_id = v_proposal.target_brand_profile_id
      and campaign.organization_id = v_brand.organization_id
      and campaign.archived_at is null
  ) then
    return null;
  end if;

  if p_transition = 'selected'
    and not public.notification_historical_actor_valid(
      v_proposal.converted_by_profile_id
    ) then
    return null;
  end if;

  if p_transition = 'submitted' then
    v_occurred_at := v_proposal.created_at;
    v_projection_version := extract(epoch from v_occurred_at)::text || ':submitted';
    select coalesce(jsonb_agg(jsonb_build_object(
      'profileId', recipient.profile_id::text,
      'role', 'advertiser',
      'organizationId', recipient.organization_id::text
    )), '[]'::jsonb)
    into v_recipients
    from (
      select distinct membership.profile_id, membership.organization_id
      from public.organization_members as membership
      join public.profiles as profile
        on profile.id = membership.profile_id
        and profile.data_origin = 'production'
        and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
      where membership.organization_id = v_brand.organization_id
        and membership.role in ('owner', 'admin', 'marketer')
    ) as recipient;

    select result.notification_event_id into v_notification_id
    from public.enqueue_notification_event(
      'campaign_application:' || v_proposal.id::text || ':submitted',
      'campaign.application_received',
      'campaign_application',
      v_proposal.id::text,
      v_projection_version,
      v_proposal.sender_profile_id,
      'influencer',
      'campaign.application_received',
      jsonb_strip_nulls(jsonb_build_object(
        'campaignTitle', left(v_proposal.campaign_snapshot ->> 'title', 120),
        'creatorName', left(v_proposal.sender_name, 80)
      )),
      'campaign_detail',
      jsonb_build_object('campaignId', v_proposal.campaign_id),
      'production',
      v_occurred_at,
      v_recipients
    ) as result
    limit 1;
  else
    v_occurred_at := v_proposal.converted_at;
    v_projection_version := extract(epoch from v_occurred_at)::text || ':selected';
    v_recipients := jsonb_build_array(jsonb_build_object(
      'profileId', v_proposal.sender_profile_id::text,
      'role', 'influencer'
    ));

    select result.notification_event_id into v_notification_id
    from public.enqueue_notification_event(
      'campaign_application:' || v_proposal.id::text || ':selected',
      'campaign.application_selected',
      'campaign_application',
      v_proposal.id::text,
      v_projection_version,
      v_proposal.converted_by_profile_id,
      'advertiser',
      'campaign.application_selected',
      jsonb_strip_nulls(jsonb_build_object(
        'campaignTitle', left(v_proposal.campaign_snapshot ->> 'title', 120)
      )),
      'campaign_detail',
      jsonb_build_object('campaignId', v_proposal.campaign_id),
      'production',
      v_occurred_at,
      v_recipients
    ) as result
    limit 1;
  end if;

  perform public.resolve_notification_projection_failure(
    'customer_bell',
    'campaign_application',
    v_proposal.id::text,
    v_projection_version
  );
  return v_notification_id;
end;
$$;

revoke execute on function public.project_campaign_application_notification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.project_campaign_application_notification(uuid, text)
  to service_role;

create or replace function public.directsign_project_campaign_application_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transition text;
  v_projection_version text;
  v_error_code text;
  v_error_detail text;
begin
  if new.direction <> 'influencer_to_brand' or new.campaign_id is null then
    return new;
  end if;
  if new.data_origin is distinct from 'production' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'submitted' and (
    new.sender_profile_id is null
    or new.submitted_actor_proof_at is null
    or not exists (
      select 1
      from public.profiles as sender
      join public.marketplace_campaigns as campaign
        on campaign.id = new.campaign_id
        and campaign.brand_profile_id = new.target_brand_profile_id
        and campaign.archived_at is null
      join public.marketplace_brand_profiles as brand
        on brand.id = campaign.brand_profile_id
        and brand.organization_id = campaign.organization_id
        and brand.data_origin = 'production'
      where sender.id = new.sender_profile_id
        and sender.role = 'influencer'
        and sender.data_origin = 'production'
        and lower(sender.email)
          !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(sender.email)
          !~ '@(example[.](com|org|net)|directsign[.]app)$'
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'production campaign application actor is not authorized';
  end if;

  if tg_op = 'INSERT' and new.status = 'submitted' then
    v_transition := 'submitted';
    v_projection_version := extract(epoch from new.created_at)::text || ':submitted';
  elsif tg_op = 'UPDATE'
    and old.status is distinct from new.status
    and new.status = 'converted_to_contract' then
    v_transition := 'selected';
    if new.converted_by_profile_id is null
      or new.converted_at is null
      or new.converted_actor_proof_at is null
      or new.converted_contract_id is null
      or not exists (
        select 1
        from public.marketplace_campaigns as campaign
        join public.marketplace_brand_profiles as brand
          on brand.id = campaign.brand_profile_id
          and brand.id = new.target_brand_profile_id
          and brand.organization_id = campaign.organization_id
          and brand.data_origin = 'production'
        join public.organization_members as membership
          on membership.organization_id = campaign.organization_id
          and membership.profile_id = new.converted_by_profile_id
          and membership.role in ('owner', 'admin', 'marketer')
        join public.profiles as actor
          on actor.id = membership.profile_id
          and actor.role = 'marketer'
          and actor.data_origin = 'production'
          and lower(actor.email)
            !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
          and lower(actor.email)
            !~ '@(example[.](com|org|net)|directsign[.]app)$'
        where campaign.id = new.campaign_id
          and campaign.archived_at is null
      ) then
      raise exception using
        errcode = '42501',
        message = 'production campaign selection actor is not authorized';
    end if;
    v_projection_version := extract(epoch from new.converted_at)::text || ':selected';
  else
    return new;
  end if;

  begin
    perform public.project_campaign_application_notification(new.id, v_transition);
  exception
    when others then
      get stacked diagnostics
        v_error_code = returned_sqlstate,
        v_error_detail = message_text;
      begin
        perform public.record_notification_projection_failure(
          'customer_bell',
          'campaign_application',
          new.id::text,
          v_projection_version,
          v_error_code,
          v_error_detail
        );
      exception when others then
        raise warning 'campaign application Bell projection failed [%]', v_error_code;
      end;
  end;

  return new;
end;
$$;

drop trigger if exists marketplace_campaign_applications_project_notification
  on public.marketplace_contact_proposals;
create trigger marketplace_campaign_applications_project_notification
after insert or update of status on public.marketplace_contact_proposals
for each row execute function public.directsign_project_campaign_application_notification();

revoke execute on function public.directsign_project_campaign_application_notification()
  from public, anon, authenticated;
grant execute on function public.directsign_project_campaign_application_notification()
  to service_role;

create or replace function public.project_campaign_status_notification(
  p_source_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.notification_campaign_status_sources%rowtype;
  v_campaign public.marketplace_campaigns%rowtype;
  v_batch record;
  v_notification_id uuid;
  v_batch_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and pg_catalog.pg_trigger_depth() = 0 then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select * into v_source
  from public.notification_campaign_status_sources as source
  where source.source_key = p_source_key
    and source.data_origin = 'production';
  if not found then return 0; end if;
  if not public.notification_historical_actor_valid(
    v_source.actor_profile_id
  ) then
    return 0;
  end if;

  -- Revalidate current campaign/brand ownership without requiring the mutable
  -- current status to equal this historical transition.
  select * into v_campaign
  from public.marketplace_campaigns as campaign
  where campaign.id = v_source.campaign_id
    and campaign.brand_profile_id = v_source.brand_profile_id
    and campaign.organization_id = v_source.organization_id
    and campaign.archived_at is null
    and exists (
      select 1
      from public.marketplace_brand_profiles as brand
      where brand.id = campaign.brand_profile_id
        and brand.organization_id = campaign.organization_id
        and brand.data_origin = 'production'
    );
  if not found then return 0; end if;

  if exists (
    select 1
    from public.notification_projection_receipts as receipt
    where receipt.event_key = v_source.source_key
  ) then
    return 0;
  end if;

  -- Batch numbers were frozen in the source transaction.  A partial retry
  -- skips completed batches, so later account deletion cannot perturb already
  -- projected recipient snapshots.
  for v_batch in
    select
      snapshot.batch_no,
      jsonb_agg(
        jsonb_build_object(
          'profileId', snapshot.recipient_profile_id::text,
          'role', 'influencer'
        )
        order by snapshot.recipient_profile_id
      ) as recipients
    from public.notification_campaign_status_recipients as snapshot
    join public.profiles as recipient_profile
      on recipient_profile.id = snapshot.recipient_profile_id
      and recipient_profile.role = 'influencer'
      and recipient_profile.data_origin = 'production'
      and lower(recipient_profile.email)
        !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
      and lower(recipient_profile.email)
        !~ '@(example[.](com|org|net)|directsign[.]app)$'
    where snapshot.source_key = v_source.source_key
      and not exists (
        select 1
        from public.notification_projection_receipts as receipt
        where receipt.event_key = v_source.source_key || ':batch:' || snapshot.batch_no::text
      )
    group by snapshot.batch_no
    order by snapshot.batch_no
  loop
    v_notification_id := null;
    select result.notification_event_id into v_notification_id
    from public.enqueue_notification_event(
      v_source.source_key || ':batch:' || v_batch.batch_no::text,
      'campaign.status_changed',
      'campaign',
      v_source.campaign_id,
      v_source.source_version || ':batch:' || v_batch.batch_no::text,
      v_source.actor_profile_id,
      v_source.actor_role,
      'campaign.status_changed',
      jsonb_strip_nulls(jsonb_build_object(
        'campaignTitle', v_source.campaign_title,
        'campaignStatus', v_source.campaign_status
      )),
      'campaign_detail',
      jsonb_build_object('campaignId', v_source.campaign_id),
      'production',
      v_source.occurred_at,
      v_batch.recipients
    ) as result
    limit 1;
    if v_notification_id is null then
      raise exception 'campaign status Bell batch was not persisted';
    end if;
    v_batch_count := v_batch_count + 1;
  end loop;

  -- A source-level completion marker makes reconciliation O(1) and avoids
  -- re-evaluating a recipient snapshot after membership/application changes.
  insert into public.notification_projection_receipts (
    event_key,
    fact_fingerprint,
    notification_event_id,
    source_type,
    source_id,
    source_version
  ) values (
    v_source.source_key,
    pg_catalog.md5(pg_catalog.concat_ws(
      '|', v_source.source_key, v_source.campaign_id,
      v_source.campaign_status, v_source.source_version,
      v_source.actor_profile_id::text,
      extract(epoch from v_source.occurred_at)::text,
      'campaign_projection_complete'
    )),
    null,
    'campaign',
    v_source.campaign_id,
    v_source.source_version
  )
  on conflict (event_key) do nothing;

  perform public.resolve_notification_projection_failure(
    'customer_bell', 'campaign_status', v_source.source_key, v_source.source_version
  );

  return v_batch_count;
end;
$$;

revoke execute on function public.project_campaign_status_notification(text)
  from public, anon, authenticated;
grant execute on function public.project_campaign_status_notification(text)
  to service_role;

create or replace function public.directsign_project_campaign_status_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand public.marketplace_brand_profiles%rowtype;
  v_actor_profile_id uuid;
  v_source_key text;
  v_source_version text;
  v_error_code text;
  v_error_detail text;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;
  if new.status not in ('open', 'closed', 'ended') then return new; end if;

  select * into v_brand
  from public.marketplace_brand_profiles as brand
  where brand.id = new.brand_profile_id
    and brand.organization_id = new.organization_id
    and brand.data_origin = 'production';
  if not found then return new; end if;

  -- The application server writes this exact profile UUID into the normalized
  -- campaign JSON.  Guard the cast before validating role, data origin, and
  -- current organization membership.
  v_actor_profile_id := case
    when nullif(new.campaign_data ->> 'statusUpdatedByProfileId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (new.campaign_data ->> 'statusUpdatedByProfileId')::uuid
    else null::uuid
  end;
  if v_actor_profile_id is null or not exists (
    select 1
    from public.organization_members as membership
    join public.profiles as actor
      on actor.id = membership.profile_id
      and actor.role = 'marketer'
      and actor.data_origin = 'production'
      and lower(actor.email)
        !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
      and lower(actor.email)
        !~ '@(example[.](com|org|net)|directsign[.]app)$'
    where membership.organization_id = new.organization_id
      and membership.profile_id = v_actor_profile_id
      and membership.role in ('owner', 'admin', 'marketer')
  ) then
    raise exception using
      errcode = '42501',
      message = 'production campaign status actor is not authorized';
  end if;

  v_source_version := new.status || ':' || extract(epoch from new.updated_at)::text;
  v_source_key := 'campaign_status:' || pg_catalog.md5(pg_catalog.concat_ws(
    '|', new.id, v_source_version
  ));

  -- Source and audience snapshot are part of the business transaction.  Do
  -- not catch these inserts: a production transition without durable Bell
  -- provenance must roll back rather than commit invisibly.
  insert into public.notification_campaign_status_sources (
    source_key,
    campaign_id,
    brand_profile_id,
    organization_id,
    campaign_status,
    campaign_title,
    source_version,
    actor_profile_id,
    actor_role,
    occurred_at,
    data_origin
  ) values (
    v_source_key,
    new.id,
    new.brand_profile_id,
    new.organization_id,
    new.status,
    left(new.campaign_data ->> 'title', 120),
    v_source_version,
    v_actor_profile_id,
    'advertiser',
    new.updated_at,
    'production'
  );

  insert into public.notification_campaign_status_recipients (
    source_key, recipient_profile_id, batch_no
  )
  select
    v_source_key,
    eligible.sender_profile_id,
    ((row_number() over (order by eligible.sender_profile_id) - 1) / 250)::integer
  from (
    select distinct proposal.sender_profile_id
    from public.marketplace_contact_proposals as proposal
    join public.profiles as applicant_profile
      on applicant_profile.id = proposal.sender_profile_id
      and applicant_profile.role = 'influencer'
      and applicant_profile.data_origin = 'production'
      and lower(applicant_profile.email)
        !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
      and lower(applicant_profile.email)
        !~ '@(example[.](com|org|net)|directsign[.]app)$'
    where proposal.direction = 'influencer_to_brand'
      and proposal.campaign_id = new.id
      and proposal.target_brand_profile_id = new.brand_profile_id
      and proposal.converted_contract_id is null
      and proposal.status in ('submitted', 'reviewed')
      and proposal.sender_profile_id is not null
      and proposal.data_origin = 'production'
      and proposal.created_at <= new.updated_at
  ) as eligible;

  begin
    perform public.project_campaign_status_notification(v_source_key);
  exception
    when others then
      get stacked diagnostics
        v_error_code = returned_sqlstate,
        v_error_detail = message_text;
      begin
        perform public.record_notification_projection_failure(
          'customer_bell',
          'campaign_status',
          v_source_key,
          v_source_version,
          v_error_code,
          v_error_detail
        );
      exception when others then
        raise warning 'campaign status Bell projection failed [%]', v_error_code;
      end;
  end;

  return new;
end;
$$;

drop trigger if exists marketplace_campaigns_project_status_notification
  on public.marketplace_campaigns;
create trigger marketplace_campaigns_project_status_notification
after update of status on public.marketplace_campaigns
for each row execute function public.directsign_project_campaign_status_notification();

revoke execute on function public.directsign_project_campaign_status_notification()
  from public, anon, authenticated;
grant execute on function public.directsign_project_campaign_status_notification()
  to service_role;

-- Backfill only the migration cutover window and only when the new durable
-- actor UUID is already present and proves a production organization member.
-- Historical campaigns without that proof intentionally remain excluded.
with inserted_source as (
  insert into public.notification_campaign_status_sources (
    source_key,
    campaign_id,
    brand_profile_id,
    organization_id,
    campaign_status,
    campaign_title,
    source_version,
    actor_profile_id,
    actor_role,
    occurred_at,
    data_origin
  )
  select
    'campaign_status:' || pg_catalog.md5(pg_catalog.concat_ws(
      '|', campaign.id, campaign.status || ':' ||
      extract(epoch from campaign.updated_at)::text
    )),
    campaign.id,
    campaign.brand_profile_id,
    campaign.organization_id,
    campaign.status,
    left(campaign.campaign_data ->> 'title', 120),
    campaign.status || ':' || extract(epoch from campaign.updated_at)::text,
    actor.id,
    'advertiser',
    campaign.updated_at,
    'production'
  from public.marketplace_campaigns as campaign
  join public.marketplace_brand_profiles as brand
    on brand.id = campaign.brand_profile_id
    and brand.organization_id = campaign.organization_id
    and brand.data_origin = 'production'
  join public.notification_projection_state as projection_state
    on projection_state.projection_key = 'customer_bell'
    and campaign.updated_at >= projection_state.cutover_at
  join public.profiles as actor
    on actor.id = case
      when nullif(campaign.campaign_data ->> 'statusUpdatedByProfileId', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (campaign.campaign_data ->> 'statusUpdatedByProfileId')::uuid
      else null::uuid
    end
    and actor.role = 'marketer'
    and actor.data_origin = 'production'
    and lower(actor.email)
      !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
    and lower(actor.email)
      !~ '@(example[.](com|org|net)|directsign[.]app)$'
  join public.organization_members as membership
    on membership.organization_id = campaign.organization_id
    and membership.profile_id = actor.id
    and membership.role in ('owner', 'admin', 'marketer')
  where campaign.archived_at is null
    and campaign.status in ('open', 'closed', 'ended')
  on conflict (source_key) do nothing
  returning source_key, campaign_id, brand_profile_id, occurred_at
), eligible_recipient as (
  select
    source.source_key,
    proposal.sender_profile_id,
    ((row_number() over (
      partition by source.source_key order by proposal.sender_profile_id
    ) - 1) / 250)::integer as batch_no
  from inserted_source as source
  join public.marketplace_contact_proposals as proposal
    on proposal.campaign_id = source.campaign_id
    and proposal.target_brand_profile_id = source.brand_profile_id
    and proposal.direction = 'influencer_to_brand'
    and proposal.converted_contract_id is null
    and proposal.status in ('submitted', 'reviewed')
    and proposal.sender_profile_id is not null
    and proposal.data_origin = 'production'
    and proposal.created_at <= source.occurred_at
  join public.profiles as applicant_profile
    on applicant_profile.id = proposal.sender_profile_id
    and applicant_profile.role = 'influencer'
    and applicant_profile.data_origin = 'production'
    and lower(applicant_profile.email)
      !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
    and lower(applicant_profile.email)
      !~ '@(example[.](com|org|net)|directsign[.]app)$'
  group by source.source_key, proposal.sender_profile_id
)
insert into public.notification_campaign_status_recipients (
  source_key, recipient_profile_id, batch_no
)
select source_key, sender_profile_id, batch_no
from eligible_recipient
on conflict (source_key, recipient_profile_id) do nothing;

-- Reconcile only the narrow cutover-to-trigger-installation window and later
-- projection failures.  Historical campaign rows intentionally remain out of
-- the Bell feed so the first cron cannot flood customers with old unread work.
-- Every post-trigger campaign status transition is read from the immutable
-- ledger rather than reconstructed from the mutable current campaign row.
create or replace function public.reconcile_campaign_notifications(
  p_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_count integer := 0;
  v_error_code text;
  v_error_detail text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  for v_candidate in
    select candidate.kind, candidate.source_id, candidate.source_version,
      candidate.occurred_at
    from (
      select
        'application_submitted'::text as kind,
        proposal.id::text as source_id,
        extract(epoch from proposal.created_at)::text || ':submitted' as source_version,
        proposal.created_at as occurred_at,
        'campaign_application:' || proposal.id::text || ':submitted' as receipt_key
      from public.marketplace_contact_proposals as proposal
      join public.marketplace_brand_profiles as brand
        on brand.id = proposal.target_brand_profile_id
        and brand.data_origin = 'production'
      join public.marketplace_campaigns as campaign
        on campaign.id = proposal.campaign_id
        and campaign.brand_profile_id = proposal.target_brand_profile_id
        and campaign.organization_id = brand.organization_id
        and campaign.archived_at is null
      join public.notification_projection_state as projection_state
        on projection_state.projection_key = 'customer_bell'
      where proposal.direction = 'influencer_to_brand'
        and proposal.campaign_id is not null
        and proposal.data_origin = 'production'
        and proposal.sender_profile_id is not null
        and proposal.submitted_actor_proof_at is not null
        and public.notification_historical_actor_valid(
          proposal.sender_profile_id
        )
        and proposal.created_at >= projection_state.cutover_at
        and exists (
          select 1
          from public.organization_members as membership
          join public.profiles as recipient_profile
            on recipient_profile.id = membership.profile_id
            and recipient_profile.data_origin = 'production'
            and lower(recipient_profile.email)
              !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
            and lower(recipient_profile.email)
              !~ '@(example[.](com|org|net)|directsign[.]app)$'
          where membership.organization_id = brand.organization_id
            and membership.role in ('owner', 'admin', 'marketer')
        )

      union all

      select
        'application_selected'::text,
        proposal.id::text,
        extract(epoch from proposal.converted_at)::text || ':selected',
        proposal.converted_at,
        'campaign_application:' || proposal.id::text || ':selected'
      from public.marketplace_contact_proposals as proposal
      join public.marketplace_brand_profiles as brand
        on brand.id = proposal.target_brand_profile_id
        and brand.data_origin = 'production'
      join public.marketplace_campaigns as campaign
        on campaign.id = proposal.campaign_id
        and campaign.brand_profile_id = proposal.target_brand_profile_id
        and campaign.organization_id = brand.organization_id
        and campaign.archived_at is null
      join public.profiles as sender_profile
        on sender_profile.id = proposal.sender_profile_id
        and sender_profile.role = 'influencer'
        and sender_profile.data_origin = 'production'
        and lower(sender_profile.email)
          !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(sender_profile.email)
          !~ '@(example[.](com|org|net)|directsign[.]app)$'
      join public.notification_projection_state as projection_state
        on projection_state.projection_key = 'customer_bell'
      where proposal.direction = 'influencer_to_brand'
        and proposal.campaign_id is not null
        and proposal.status in ('converted_to_contract', 'closed')
        and proposal.converted_contract_id is not null
        and proposal.converted_by_profile_id is not null
        and proposal.converted_at is not null
        and proposal.converted_actor_proof_at is not null
        and proposal.data_origin = 'production'
        and proposal.converted_at >= projection_state.cutover_at
        and public.notification_historical_actor_valid(
          proposal.converted_by_profile_id
        )

      union all

      select
        'campaign_status'::text,
        source.source_key,
        source.source_version,
        source.occurred_at,
        source.source_key
      from public.notification_campaign_status_sources as source
      join public.marketplace_campaigns as campaign
        on campaign.id = source.campaign_id
        and campaign.brand_profile_id = source.brand_profile_id
        and campaign.organization_id = source.organization_id
        and campaign.archived_at is null
      join public.marketplace_brand_profiles as brand
        on brand.id = campaign.brand_profile_id
        and brand.data_origin = 'production'
        and brand.organization_id = campaign.organization_id
      where source.data_origin = 'production'
        and public.notification_historical_actor_valid(
          source.actor_profile_id
        )
    ) as candidate
    left join public.notification_projection_receipts as receipt
      on receipt.event_key = candidate.receipt_key
    where receipt.event_key is null
    order by candidate.occurred_at asc, candidate.kind asc, candidate.source_id asc
    limit least(greatest(p_limit, 1), 1000)
  loop
    begin
      if v_candidate.kind = 'application_submitted' then
        if public.project_campaign_application_notification(
          v_candidate.source_id::uuid,
          'submitted'
        ) is not null then
          v_count := v_count + 1;
        end if;
      elsif v_candidate.kind = 'application_selected' then
        if public.project_campaign_application_notification(
          v_candidate.source_id::uuid,
          'selected'
        ) is not null then
          v_count := v_count + 1;
        end if;
      else
        v_count := v_count + public.project_campaign_status_notification(
          v_candidate.source_id
        );
      end if;
    exception
      when others then
        get stacked diagnostics
          v_error_code = returned_sqlstate,
          v_error_detail = message_text;
        perform public.record_notification_projection_failure(
          'customer_bell',
          case
            when v_candidate.kind = 'campaign_status' then 'campaign_status'
            else 'campaign_application'
          end,
          v_candidate.source_id,
          v_candidate.source_version,
          v_error_code,
          v_error_detail
        );
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.reconcile_campaign_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_campaign_notifications(integer)
  to service_role;

-- Re-check the current source authorization on every list/count/read action.
-- A stored receipt is evidence that a user was once a recipient; it is never
-- sufficient by itself after organization membership or contract access is
-- revoked.
create or replace function public.customer_notification_recipient_authorized(
  p_event_id uuid,
  p_profile_id uuid,
  p_recipient_role text,
  p_recipient_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when event.source_type = 'contract_event' then exists (
        select 1
        from public.contract_events as contract_event
        join public.contracts as contract
          on contract.id = contract_event.contract_id
          and contract.deleted_at is null
          and contract.data_origin = 'production'
        where contract_event.id = case
            when event.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then event.source_id::uuid
              else null::uuid
            end
          and contract_event.notification_actor_proof_at is not null
          and (
            (
              p_recipient_role = 'advertiser'
              and contract.owner_organization_id = p_recipient_organization_id
              and exists (
                select 1
                from public.organization_members as membership
                where membership.organization_id = p_recipient_organization_id
                  and membership.profile_id = p_profile_id
                  and membership.role in ('owner', 'admin', 'marketer')
              )
            )
            or (
              p_recipient_role = 'influencer'
              and exists (
                select 1
                from public.contract_parties as party
                where party.contract_id = contract.id
                  and party.party_role = 'influencer'
                  and party.profile_id = p_profile_id
              )
            )
          )
      )
      when event.source_type = 'deliverable' then exists (
        select 1
        from public.deliverables as deliverable
        join public.contracts as contract
          on contract.id = deliverable.contract_id
          and contract.deleted_at is null
          and contract.data_origin = 'production'
        join public.notification_workflow_sources as source
          on source.source_key = event.event_key
          and source.source_type = 'deliverable'
          and source.source_id = deliverable.id
          and source.contract_id = contract.id
          and source.source_version = event.source_version
          and source.data_origin = 'production'
        where deliverable.id = case
            when event.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then event.source_id::uuid
            else null::uuid
          end
          and (
            (
              p_recipient_role = 'advertiser'
              and contract.owner_organization_id = p_recipient_organization_id
              and exists (
                select 1
                from public.organization_members as membership
                where membership.organization_id = p_recipient_organization_id
                  and membership.profile_id = p_profile_id
                  and membership.role in ('owner', 'admin', 'marketer')
              )
            )
            or (
              p_recipient_role = 'influencer'
              and exists (
                select 1
                from public.contract_parties as party
                where party.contract_id = contract.id
                  and party.party_role = 'influencer'
                  and party.profile_id = p_profile_id
              )
            )
          )
      )
      when event.source_type = 'deadline' then exists (
        select 1
        from public.contracts as contract
        where contract.id = case
            when event.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then event.source_id::uuid
            else null::uuid
          end
          and contract.deleted_at is null
          and contract.data_origin = 'production'
          and contract.status in ('draft', 'negotiating', 'signing', 'active')
          and contract.next_due_at is not null
          and event.source_version =
            contract.version_no::text || ':' ||
            extract(epoch from contract.next_due_at)::text
          and (
            (
              p_recipient_role = 'advertiser'
              and contract.next_actor_role in ('advertiser', 'marketer', 'agency')
              and contract.owner_organization_id = p_recipient_organization_id
              and exists (
                select 1
                from public.organization_members as membership
                where membership.organization_id = p_recipient_organization_id
                  and membership.profile_id = p_profile_id
                  and membership.role in ('owner', 'admin', 'marketer')
              )
            )
            or (
              p_recipient_role = 'influencer'
              and contract.next_actor_role = 'influencer'
              and exists (
                select 1
                from public.contract_parties as party
                where party.contract_id = contract.id
                  and party.party_role = 'influencer'
                  and party.profile_id = p_profile_id
              )
            )
          )
      )
      when event.source_type = 'campaign_application' then exists (
        select 1
        from public.marketplace_contact_proposals as proposal
        join public.marketplace_campaigns as campaign
          on campaign.id = proposal.campaign_id
          and campaign.brand_profile_id = proposal.target_brand_profile_id
          and campaign.archived_at is null
        join public.marketplace_brand_profiles as brand
          on brand.id = proposal.target_brand_profile_id
          and brand.organization_id = campaign.organization_id
        where proposal.id = case
            when event.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then event.source_id::uuid
            else null::uuid
          end
          and proposal.campaign_id is not null
          and proposal.data_origin = 'production'
          and brand.data_origin = 'production'
          and (
            (
              event.event_type = 'campaign.application_selected'
              and p_recipient_role = 'influencer'
              and proposal.sender_profile_id = p_profile_id
              and proposal.converted_contract_id is not null
              and proposal.converted_by_profile_id is not null
              and proposal.converted_at is not null
              and proposal.converted_actor_proof_at is not null
              and event.actor_profile_id = proposal.converted_by_profile_id
              and event.actor_role = 'advertiser'
              and event.source_version =
                extract(epoch from proposal.converted_at)::text || ':selected'
            )
            or (
              event.event_type = 'campaign.application_received'
              and p_recipient_role = 'advertiser'
              and brand.organization_id = p_recipient_organization_id
              and event.actor_profile_id = proposal.sender_profile_id
              and event.actor_role = 'influencer'
              and proposal.submitted_actor_proof_at is not null
              and event.source_version =
                extract(epoch from proposal.created_at)::text || ':submitted'
              and exists (
                select 1
                from public.organization_members as membership
                where membership.organization_id = p_recipient_organization_id
                  and membership.profile_id = p_profile_id
                  and membership.role in ('owner', 'admin', 'marketer')
              )
            )
          )
      )
      when event.source_type = 'campaign' then (
        p_recipient_role = 'influencer'
        and exists (
          select 1
          from public.notification_campaign_status_sources as source
          join public.notification_campaign_status_recipients as snapshot
            on snapshot.source_key = source.source_key
            and snapshot.recipient_profile_id = p_profile_id
          join public.marketplace_campaigns as campaign
            on campaign.id = source.campaign_id
            and campaign.brand_profile_id = source.brand_profile_id
            and campaign.organization_id = source.organization_id
            and campaign.archived_at is null
          join public.marketplace_brand_profiles as brand
            on brand.id = campaign.brand_profile_id
            and brand.data_origin = 'production'
            and brand.organization_id = campaign.organization_id
          where source.campaign_id = event.source_id
            and source.data_origin = 'production'
            and source.actor_profile_id = event.actor_profile_id
            and source.actor_role = event.actor_role
            and event.event_key =
              source.source_key || ':batch:' || snapshot.batch_no::text
            and event.source_version =
              source.source_version || ':batch:' || snapshot.batch_no::text
        )
      )
      else false
    end
    from public.notification_events as event
    where event.id = p_event_id
      and event.data_origin = 'production'
      and event.expires_at > now()
      and public.notification_historical_actor_valid(event.actor_profile_id)
      and exists (
        select 1
        from public.profiles as recipient_profile
        where recipient_profile.id = p_profile_id
          and recipient_profile.data_origin = 'production'
          and lower(recipient_profile.email)
            !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
          and lower(recipient_profile.email)
            !~ '@(example[.](com|org|net)|directsign[.]app)$'
      )
  ), false);
$$;

revoke execute on function public.customer_notification_recipient_authorized(
  uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.customer_notification_recipient_authorized(
  uuid, uuid, text, uuid
) to service_role;

create or replace function public.list_customer_notifications(
  p_profile_id uuid,
  p_recipient_role text,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_event_id uuid default null,
  p_limit integer default 21
)
returns table (
  event_id uuid,
  event_type text,
  copy_key text,
  safe_params jsonb,
  route_key text,
  route_params jsonb,
  occurred_at timestamptz,
  read_at timestamptz
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
  if p_recipient_role not in ('advertiser', 'influencer') then
    raise exception 'invalid notification recipient role';
  end if;
  if (p_cursor_occurred_at is null) <> (p_cursor_event_id is null) then
    raise exception 'notification cursor fields must be paired';
  end if;

  return query
  select
    event.id,
    event.event_type,
    event.copy_key,
    event.safe_params,
    event.route_key,
    event.route_params,
    event.occurred_at,
    recipient.read_at
  from public.notification_recipients as recipient
  join public.notification_events as event
    on event.id = recipient.event_id
  where recipient.recipient_profile_id = p_profile_id
    and recipient.recipient_role = p_recipient_role
    and recipient.archived_at is null
    and event.data_origin = 'production'
    and event.expires_at > now()
    and (
      (recipient.read_at is null and recipient.occurred_at >= now() - interval '180 days')
      or (recipient.read_at is not null and recipient.occurred_at >= now() - interval '90 days')
    )
    and (
      p_cursor_occurred_at is null
      or recipient.occurred_at < p_cursor_occurred_at
      or (
        recipient.occurred_at = p_cursor_occurred_at
        and recipient.event_id < p_cursor_event_id
      )
    )
    and public.customer_notification_recipient_authorized(
      recipient.event_id,
      recipient.recipient_profile_id,
      recipient.recipient_role,
      recipient.recipient_organization_id
    )
  order by recipient.occurred_at desc, recipient.event_id desc
  limit least(greatest(p_limit, 1), 51);
end;
$$;

revoke execute on function public.list_customer_notifications(
  uuid, text, timestamptz, uuid, integer
) from public, anon, authenticated;
grant execute on function public.list_customer_notifications(
  uuid, text, timestamptz, uuid, integer
) to service_role;

create or replace function public.mark_notification_read(
  p_profile_id uuid,
  p_recipient_role text,
  p_event_id uuid,
  p_read_at timestamptz default now()
)
returns table (event_id uuid, read_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_recipient_role not in ('advertiser', 'influencer') then
    raise exception 'invalid notification recipient role';
  end if;

  return query
  update public.notification_recipients as recipient
  set
    read_at = coalesce(recipient.read_at, greatest(p_read_at, recipient.occurred_at)),
    updated_at = now()
  where recipient.event_id = p_event_id
    and recipient.recipient_profile_id = p_profile_id
    and recipient.recipient_role = p_recipient_role
    and recipient.archived_at is null
    and public.customer_notification_recipient_authorized(
      recipient.event_id,
      recipient.recipient_profile_id,
      recipient.recipient_role,
      recipient.recipient_organization_id
    )
  returning recipient.event_id, recipient.read_at;
end;
$$;

revoke execute on function public.mark_notification_read(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid, text, uuid, timestamptz)
  to service_role;

create or replace function public.mark_all_notifications_read(
  p_profile_id uuid,
  p_recipient_role text,
  p_cutoff timestamptz,
  p_read_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_recipient_role not in ('advertiser', 'influencer') then
    raise exception 'invalid notification recipient role';
  end if;
  if p_cutoff > now() + interval '1 minute' then
    raise exception 'notification read cutoff is in the future';
  end if;

  update public.notification_recipients as recipient
  set
    read_at = greatest(p_read_at, recipient.occurred_at),
    updated_at = now()
  where recipient.recipient_profile_id = p_profile_id
    and recipient.recipient_role = p_recipient_role
    and recipient.read_at is null
    and recipient.archived_at is null
    and recipient.occurred_at <= p_cutoff
    and public.customer_notification_recipient_authorized(
      recipient.event_id,
      recipient.recipient_profile_id,
      recipient.recipient_role,
      recipient.recipient_organization_id
    );
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.mark_all_notifications_read(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_all_notifications_read(uuid, text, timestamptz, timestamptz)
  to service_role;

create or replace function public.get_notification_unread_count(
  p_profile_id uuid,
  p_recipient_role text
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_recipient_role not in ('advertiser', 'influencer') then
    raise exception 'invalid notification recipient role';
  end if;

  select count(*)::integer into v_count
  from public.notification_recipients as recipient
  join public.notification_events as event
    on event.id = recipient.event_id
  where recipient.recipient_profile_id = p_profile_id
    and recipient.recipient_role = p_recipient_role
    and recipient.read_at is null
    and recipient.archived_at is null
    and recipient.occurred_at >= now() - interval '180 days'
    and event.data_origin = 'production'
    and event.expires_at > now()
    and public.customer_notification_recipient_authorized(
      recipient.event_id,
      recipient.recipient_profile_id,
      recipient.recipient_role,
      recipient.recipient_organization_id
    );
  return coalesce(v_count, 0);
end;
$$;

revoke execute on function public.get_notification_unread_count(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_notification_unread_count(uuid, text)
  to service_role;

-- Multi-instance safe leasing for future downstream delivery.  The Bell feed is
-- already durable once recipients are inserted; outbox delivery must never be
-- on the customer request's critical path.
create or replace function public.claim_notification_outbox(
  p_lease_owner text,
  p_limit integer default 100,
  p_lease_seconds integer default 60
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if btrim(coalesce(p_lease_owner, '')) = '' then
    raise exception 'lease owner is required';
  end if;

  -- A worker can die after claiming attempt 10.  Such a row no longer matches
  -- the normal candidate predicate, so reap the abandoned lease explicitly
  -- (and also repair any legacy pending row already at the attempt ceiling).
  update public.notification_outbox as abandoned
  set
    status = 'dead',
    lease_owner = null,
    lease_expires_at = null,
    last_error_code = 'max_attempts_exhausted',
    processed_at = now(),
    updated_at = now()
  where abandoned.attempt_count >= 10
    and (
      abandoned.status = 'pending'
      or (
        abandoned.status = 'processing'
        and abandoned.lease_expires_at <= now()
      )
    );

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox as outbox
    where (
        outbox.status = 'pending'
        or (
          outbox.status = 'processing'
          and outbox.lease_expires_at <= now()
        )
      )
      and outbox.available_at <= now()
      and outbox.attempt_count < 10
    order by outbox.available_at asc, outbox.created_at asc
    for update skip locked
    limit least(greatest(p_limit, 1), 250)
  )
  update public.notification_outbox as outbox
  set
    status = 'processing',
    attempt_count = outbox.attempt_count + 1,
    lease_owner = left(p_lease_owner, 120),
    lease_expires_at = now() + make_interval(secs => least(greatest(p_lease_seconds, 10), 600)),
    updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

revoke execute on function public.claim_notification_outbox(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(text, integer, integer)
  to service_role;

create or replace function public.complete_notification_outbox(
  p_outbox_id uuid,
  p_lease_owner text,
  p_success boolean,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  update public.notification_outbox as outbox
  set
    status = case
      when p_success then 'completed'
      when outbox.attempt_count >= 10 then 'dead'
      else 'pending'
    end,
    available_at = case
      when p_success then outbox.available_at
      else now() + make_interval(
        secs => least(3600, (power(2, least(outbox.attempt_count, 10)) * 5)::integer)
      )
    end,
    lease_owner = null,
    lease_expires_at = null,
    last_error_code = case
      when p_success then null
      else coalesce(nullif(left(lower(p_error_code), 64), ''), 'delivery_failed')
    end,
    processed_at = case when p_success then now() else null end,
    updated_at = now()
  where outbox.id = p_outbox_id
    and outbox.status = 'processing'
    and outbox.lease_owner = p_lease_owner;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.complete_notification_outbox(uuid, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_notification_outbox(uuid, text, boolean, text)
  to service_role;

-- Validate notification-owned audit facts in the occurrence transaction.  A
-- later retry may then trust the immutable contract_event even if the actor
-- leaves the organization or deletes the account.
create or replace function public.directsign_validate_notification_contract_event_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_expected_actor_role text;
  v_transition_occurred_at timestamptz;
begin
  -- The database trigger, never the caller, owns this occurrence proof.
  new.notification_actor_proof_at := null;
  -- Idempotent audit synchronization may re-submit an already immutable ID
  -- after its historical actor has left or deleted the account.  Let the
  -- existing primary-key conflict handler discard that duplicate; UPDATE paths
  -- remain blocked by the append-only contract_events trigger.
  if exists (
    select 1 from public.contract_events as existing_event
    where existing_event.id = new.id
  ) then
    return new;
  end if;
  v_expected_actor_role := case
    when new.event_type in (
      'share_link_issued',
      'deliverable_approved',
      'deliverable_changes_requested',
      'deliverable_rejected',
      'contract_closed'
    ) then 'advertiser'
    when new.event_type in (
      'contract_signed',
      'post_link_submitted',
      'deliverable_submitted'
    ) then 'influencer'
    when new.event_type = 'deliverables_ready_to_close' then 'system'
    else null
  end;
  if v_expected_actor_role is null then return new; end if;

  select * into v_contract
  from public.contracts as contract
  where contract.id = new.contract_id
    and contract.deleted_at is null
    and contract.data_origin = 'production';
  if not found then return new; end if;

  if v_expected_actor_role = 'system' then
    if new.actor_profile_id is not null
      or new.actor_role is distinct from 'system' then
      raise exception using
        errcode = '42501',
        message = 'system contract event actor is required';
    end if;
    new.notification_actor_proof_at := clock_timestamp();
    return new;
  end if;

  if new.actor_profile_id is null
    or new.actor_role is distinct from v_expected_actor_role
    or not exists (
      select 1
      from public.profiles as actor
      where actor.id = new.actor_profile_id
        and actor.data_origin = 'production'
        and lower(actor.email)
          !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(actor.email)
          !~ '@(example[.](com|org|net)|directsign[.]app)$'
        and (
          (v_expected_actor_role = 'advertiser' and actor.role = 'marketer')
          or (v_expected_actor_role = 'influencer' and actor.role = 'influencer')
        )
    )
    or (
      v_expected_actor_role = 'advertiser'
      and not exists (
        select 1
        from public.organization_members as membership
        where membership.organization_id = v_contract.owner_organization_id
          and membership.profile_id = new.actor_profile_id
          and membership.role in ('owner', 'admin', 'marketer')
      )
    )
    or (
      v_expected_actor_role = 'influencer'
      and not exists (
        select 1
        from public.contract_parties as party
        where party.contract_id = v_contract.id
          and party.party_role = 'influencer'
          and party.profile_id = new.actor_profile_id
      )
    ) then
    raise exception using
      errcode = '42501',
      message = 'authoritative production contract event actor is required';
  end if;

  if new.event_type in (
    'deliverable_submitted',
    'deliverable_approved',
    'deliverable_changes_requested',
    'deliverable_rejected'
  ) then
    v_transition_occurred_at := public.notification_safe_timestamptz(
      new.payload ->> 'transition_occurred_at'
    );
  end if;

  if new.event_type in (
    'deliverable_submitted',
    'deliverable_approved',
    'deliverable_changes_requested',
    'deliverable_rejected'
  ) and (
    new.target_type is distinct from 'deliverable'
    or new.target_id is null
    or v_transition_occurred_at is null
    or not exists (
      select 1
      from public.deliverables as deliverable
      where deliverable.id = new.target_id
        and deliverable.contract_id = new.contract_id
        and (
          (
            new.event_type = 'deliverable_submitted'
            and deliverable.creator_profile_id = new.actor_profile_id
            and deliverable.submitted_at = v_transition_occurred_at
          )
          or (
            new.event_type <> 'deliverable_submitted'
            and deliverable.reviewed_by_profile_id = new.actor_profile_id
            and deliverable.reviewed_at = v_transition_occurred_at
          )
        )
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'authoritative deliverable transition evidence is required';
  end if;

  new.notification_actor_proof_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists contract_events_notification_actor_validate
  on public.contract_events;
create trigger contract_events_notification_actor_validate
before insert on public.contract_events
for each row execute function public.directsign_validate_notification_contract_event_actor();

revoke execute on function public.directsign_validate_notification_contract_event_actor()
  from public, anon, authenticated;
grant execute on function public.directsign_validate_notification_contract_event_actor()
  to service_role;

-- Projects supported post-contract workflow events into the Bell feed.  Human
-- dialogue and independent 1:1 proposal events intentionally never enter this
-- function, so the message center remains their single owner.
create or replace function public.project_contract_event_notification(
  p_contract_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract_event public.contract_events%rowtype;
  v_contract public.contracts%rowtype;
  v_copy_key text;
  v_event_type text;
  v_target_role text;
  v_expected_actor_role text;
  v_safe_params jsonb;
  v_recipients jsonb;
  v_notification_id uuid;
  v_cutover_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and pg_catalog.pg_trigger_depth() = 0 then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select * into v_contract_event
  from public.contract_events
  where id = p_contract_event_id;
  if not found
    or v_contract_event.notification_actor_proof_at is null then
    return null;
  end if;

  select projection_state.cutover_at into v_cutover_at
  from public.notification_projection_state as projection_state
  where projection_state.projection_key = 'customer_bell';
  if not found or v_contract_event.created_at < v_cutover_at then
    return null;
  end if;

  -- The authoritative deliverable source owns the Bell item when capture
  -- succeeded.  If that same-transaction capture failed, the immutable API
  -- audit event becomes a retryable fallback instead of being discarded.
  if v_contract_event.event_type in (
    'deliverable_submitted',
    'deliverable_approved',
    'deliverable_changes_requested',
    'deliverable_rejected'
  ) and exists (
    select 1
    from public.notification_workflow_sources as source
    where source.source_type = 'deliverable'
      and source.source_id = v_contract_event.target_id
      and source.contract_id = v_contract_event.contract_id
      and source.event_type = v_contract_event.event_type
      and source.actor_profile_id is not distinct from v_contract_event.actor_profile_id
      and source.actor_role is not distinct from v_contract_event.actor_role
      and source.occurred_at = public.notification_safe_timestamptz(
        v_contract_event.payload ->> 'transition_occurred_at'
      )
  ) then
    return null;
  end if;

  select * into v_contract
  from public.contracts
  where id = v_contract_event.contract_id
    and deleted_at is null
    and data_origin = 'production';
  if not found then
    return null;
  end if;

  case v_contract_event.event_type
    when 'share_link_issued' then
      if v_contract.status not in ('signing', 'active', 'completed') then return null; end if;
      v_copy_key := 'contract.ready_to_sign';
      v_event_type := 'contract.ready_to_sign';
      v_target_role := 'influencer';
      v_expected_actor_role := 'advertiser';
    when 'contract_signed' then
      if v_contract.status not in ('active', 'completed') then return null; end if;
      v_copy_key := 'contract.signed';
      v_event_type := 'contract.signed';
      v_target_role := 'advertiser';
      v_expected_actor_role := 'influencer';
    when 'post_link_submitted' then
      if v_contract.status not in ('active', 'completed') then return null; end if;
      v_copy_key := 'contract.content_submitted';
      v_event_type := 'contract.content_submitted';
      v_target_role := 'advertiser';
      v_expected_actor_role := 'influencer';
    when 'deliverable_submitted' then
      if v_contract.status not in ('active', 'completed')
        or v_contract_event.target_type is distinct from 'deliverable'
        or v_contract_event.target_id is null
        or not exists (
          select 1
          from public.deliverables as deliverable
          where deliverable.id = v_contract_event.target_id
            and deliverable.contract_id = v_contract.id
        ) then return null; end if;
      v_copy_key := 'contract.content_submitted';
      v_event_type := 'contract.content_submitted';
      v_target_role := 'advertiser';
      v_expected_actor_role := 'influencer';
    when 'deliverable_approved' then
      if v_contract.status not in ('active', 'completed')
        or v_contract_event.target_type is distinct from 'deliverable'
        or v_contract_event.target_id is null
        or not exists (
          select 1
          from public.deliverables as deliverable
          where deliverable.id = v_contract_event.target_id
            and deliverable.contract_id = v_contract.id
        ) then return null; end if;
      v_copy_key := 'contract.content_reviewed';
      v_event_type := 'contract.content_reviewed';
      v_target_role := 'influencer';
      v_expected_actor_role := 'advertiser';
    when 'deliverable_changes_requested' then
      if v_contract.status not in ('active', 'completed')
        or v_contract_event.target_type is distinct from 'deliverable'
        or v_contract_event.target_id is null
        or not exists (
          select 1
          from public.deliverables as deliverable
          where deliverable.id = v_contract_event.target_id
            and deliverable.contract_id = v_contract.id
        ) then return null; end if;
      v_copy_key := 'contract.content_reviewed';
      v_event_type := 'contract.content_reviewed';
      v_target_role := 'influencer';
      v_expected_actor_role := 'advertiser';
    when 'deliverable_rejected' then
      if v_contract.status not in ('active', 'completed')
        or v_contract_event.target_type is distinct from 'deliverable'
        or v_contract_event.target_id is null
        or not exists (
          select 1
          from public.deliverables as deliverable
          where deliverable.id = v_contract_event.target_id
            and deliverable.contract_id = v_contract.id
        ) then return null; end if;
      v_copy_key := 'contract.content_reviewed';
      v_event_type := 'contract.content_reviewed';
      v_target_role := 'influencer';
      v_expected_actor_role := 'advertiser';
    when 'deliverables_ready_to_close' then
      if v_contract.status not in ('active', 'completed') then return null; end if;
      v_copy_key := 'contract.ready_to_close';
      v_event_type := 'contract.ready_to_close';
      v_target_role := 'advertiser';
      v_expected_actor_role := 'system';
    when 'contract_closed' then
      if v_contract.status <> 'completed' then return null; end if;
      v_copy_key := 'contract.closed';
      v_event_type := 'contract.closed';
      v_target_role := 'influencer';
      v_expected_actor_role := 'advertiser';
    else
      return null;
  end case;

  if v_expected_actor_role = 'system' then
    if v_contract_event.actor_profile_id is not null
      or v_contract_event.actor_role is distinct from v_expected_actor_role then
      raise exception 'system contract event actor is required';
    end if;
  elsif v_contract_event.actor_profile_id is null
    or v_contract_event.actor_role is distinct from v_expected_actor_role then
    raise exception 'authoritative user contract event actor is required';
  elsif not public.notification_historical_actor_valid(
    v_contract_event.actor_profile_id
  ) then
    raise exception 'contract event actor is no longer production eligible';
  end if;

  v_safe_params := jsonb_strip_nulls(jsonb_build_object(
    'contractTitle', left(v_contract.campaign_title, 120),
    'reviewStatus', nullif(v_contract_event.payload ->> 'review_status', '')
  ));

  if v_target_role = 'advertiser' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'profileId', recipient.profile_id::text,
      'role', 'advertiser',
      'organizationId', recipient.organization_id::text
    )), '[]'::jsonb)
    into v_recipients
    from (
      select distinct membership.profile_id, membership.organization_id
      from public.organization_members as membership
      join public.profiles as profile
        on profile.id = membership.profile_id
        and profile.data_origin = 'production'
        and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
      where membership.organization_id = v_contract.owner_organization_id
        and membership.role in ('owner', 'admin', 'marketer')
    ) as recipient;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'profileId', party.profile_id::text,
      'role', 'influencer'
    )), '[]'::jsonb)
    into v_recipients
    from (
      select distinct contract_party.profile_id
      from public.contract_parties as contract_party
      join public.profiles as profile
        on profile.id = contract_party.profile_id
        and profile.data_origin = 'production'
        and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
        and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
      where contract_party.contract_id = v_contract.id
        and contract_party.party_role = 'influencer'
        and contract_party.profile_id is not null
    ) as party;
  end if;

  select result.notification_event_id into v_notification_id
  from public.enqueue_notification_event(
    'contract_event:' || v_contract_event.id::text,
    v_event_type,
    'contract_event',
    v_contract_event.id::text,
    v_contract_event.id::text,
    v_contract_event.actor_profile_id,
    case
      when v_contract_event.actor_role in ('advertiser', 'influencer', 'system')
        then v_contract_event.actor_role
      else null
    end,
    v_copy_key,
    v_safe_params,
    'contract_detail',
    jsonb_build_object('contractId', v_contract.id::text),
    'production',
    v_contract_event.created_at,
    v_recipients
  ) as result
  limit 1;

  perform public.resolve_notification_projection_failure(
    'customer_bell',
    'contract_event',
    v_contract_event.id::text,
    v_contract_event.id::text
  );

  if v_contract_event.event_type in (
    'deliverable_submitted',
    'deliverable_approved',
    'deliverable_changes_requested',
    'deliverable_rejected'
  ) then
    update public.notification_projection_failures as failure
    set status = 'resolved', resolved_at = now()
    where failure.projection_key = 'customer_bell_capture'
      and failure.source_type = 'deliverable'
      and failure.source_id = v_contract_event.target_id::text
      and failure.status = 'pending';
  end if;

  return v_notification_id;
end;
$$;

revoke execute on function public.project_contract_event_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.project_contract_event_notification(uuid)
  to service_role;

create or replace function public.directsign_project_contract_event_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error_code text;
  v_error_detail text;
begin
  begin
    perform public.project_contract_event_notification(new.id);
  exception
    when others then
      -- Customer mutations and their audit events must not fail because the
      -- secondary Bell projection is temporarily unavailable. The durable
      -- reconciliation function will retry missing event keys.  Persist a
      -- bounded operational work item instead of swallowing the error.
      get stacked diagnostics
        v_error_code = returned_sqlstate,
        v_error_detail = message_text;
      begin
        perform public.record_notification_projection_failure(
          'customer_bell',
          'contract_event',
          new.id::text,
          new.id::text,
          v_error_code,
          v_error_detail
        );
      exception when others then
        raise warning 'contract event Bell projection failed [%]', v_error_code;
      end;
  end;
  return new;
end;
$$;

drop trigger if exists contract_events_project_customer_notification
  on public.contract_events;
create trigger contract_events_project_customer_notification
after insert on public.contract_events
for each row execute function public.directsign_project_contract_event_notification();

revoke execute on function public.directsign_project_contract_event_notification()
  from public, anon, authenticated;
grant execute on function public.directsign_project_contract_event_notification()
  to service_role;

create or replace function public.reconcile_contract_notifications(
  p_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_error_code text;
  v_error_detail text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  for v_row in
    select contract_event.id
    from public.contract_events as contract_event
    join public.notification_projection_state as projection_state
      on projection_state.projection_key = 'customer_bell'
      and contract_event.created_at >= projection_state.cutover_at
    join public.contracts as contract
      on contract.id = contract_event.contract_id
      and contract.deleted_at is null
      and contract.data_origin = 'production'
    left join public.notification_projection_receipts as receipt
      on receipt.event_key = 'contract_event:' || contract_event.id::text
    where contract_event.event_type in (
      'share_link_issued',
      'contract_signed',
      'post_link_submitted',
      'deliverable_submitted',
      'deliverable_approved',
      'deliverable_changes_requested',
      'deliverable_rejected',
      'deliverables_ready_to_close',
      'contract_closed'
    )
      and contract_event.notification_actor_proof_at is not null
      and receipt.event_key is null
      and (
        contract_event.event_type not in (
          'deliverable_submitted',
          'deliverable_approved',
          'deliverable_changes_requested',
          'deliverable_rejected'
        )
        or (
          contract_event.target_type = 'deliverable'
          and contract_event.target_id is not null
          and exists (
            select 1
            from public.deliverables as deliverable
            where deliverable.id = contract_event.target_id
              and deliverable.contract_id = contract.id
          )
          and not exists (
            select 1
            from public.notification_workflow_sources as source
            where source.source_type = 'deliverable'
              and source.source_id = contract_event.target_id
              and source.contract_id = contract_event.contract_id
              and source.event_type = contract_event.event_type
              and source.actor_profile_id is not distinct from contract_event.actor_profile_id
              and source.actor_role is not distinct from contract_event.actor_role
              and source.occurred_at = public.notification_safe_timestamptz(
                contract_event.payload ->> 'transition_occurred_at'
              )
          )
        )
      )
      and public.notification_historical_actor_valid(
        contract_event.actor_profile_id
      )
      and (
        (
          contract_event.event_type in (
            'share_link_issued',
            'contract_closed',
            'deliverable_approved',
            'deliverable_changes_requested',
            'deliverable_rejected'
          )
          and exists (
            select 1
            from public.contract_parties as party
            join public.profiles as profile
              on profile.id = party.profile_id
              and profile.data_origin = 'production'
              and lower(profile.email)
                !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
              and lower(profile.email)
                !~ '@(example[.](com|org|net)|directsign[.]app)$'
            where party.contract_id = contract.id
              and party.party_role = 'influencer'
          )
        )
        or (
          contract_event.event_type in (
            'contract_signed',
            'post_link_submitted',
            'deliverable_submitted',
            'deliverables_ready_to_close'
          )
          and exists (
            select 1
            from public.organization_members as membership
            join public.profiles as profile
              on profile.id = membership.profile_id
              and profile.data_origin = 'production'
              and lower(profile.email)
                !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
              and lower(profile.email)
                !~ '@(example[.](com|org|net)|directsign[.]app)$'
            where membership.organization_id = contract.owner_organization_id
              and membership.role in ('owner', 'admin', 'marketer')
          )
        )
      )
    order by contract_event.created_at asc, contract_event.id asc
    limit least(greatest(p_limit, 1), 1000)
  loop
    begin
      if public.project_contract_event_notification(v_row.id) is not null then
        v_count := v_count + 1;
      end if;
    exception
      when others then
        get stacked diagnostics
          v_error_code = returned_sqlstate,
          v_error_detail = message_text;
        perform public.record_notification_projection_failure(
          'customer_bell',
          'contract_event',
          v_row.id::text,
          v_row.id::text,
          v_error_code,
          v_error_detail
        );
    end;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.reconcile_contract_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_contract_notifications(integer)
  to service_role;

-- Only authoritative contract.next_due_at values create deadline reminders.
-- Terminal/superseded contracts and actor-self recipients are rechecked inside
-- the enqueue transaction on every reconciliation pass.
create or replace function public.reconcile_contract_deadline_notifications(
  p_horizon_minutes integer default 2880,
  p_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_recipients jsonb;
  v_notification_id uuid;
  v_inserted boolean := false;
  v_count integer := 0;
  v_target_role text;
  v_event_key text;
  v_error_code text;
  v_error_detail text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  for v_contract in
    select *
    from public.contracts as contract
    where contract.deleted_at is null
      and contract.data_origin = 'production'
      and contract.status in ('draft', 'negotiating', 'signing', 'active')
      and contract.next_due_at is not null
      -- Daily cron can be delayed or miss one run.  Retain a bounded 48-hour
      -- lookback so already-due work is not permanently skipped.
      and contract.next_due_at > now() - interval '48 hours'
      and contract.next_due_at <= now() + make_interval(
        mins => least(greatest(p_horizon_minutes, 15), 2880)
      )
      and contract.next_actor_role in ('advertiser', 'marketer', 'agency', 'influencer')
      and (
        (
          contract.next_actor_role in ('advertiser', 'marketer', 'agency')
          and exists (
            select 1
            from public.organization_members as membership
            join public.profiles as profile
              on profile.id = membership.profile_id
              and profile.data_origin = 'production'
              and lower(profile.email)
                !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
              and lower(profile.email)
                !~ '@(example[.](com|org|net)|directsign[.]app)$'
            where membership.organization_id = contract.owner_organization_id
              and membership.role in ('owner', 'admin', 'marketer')
          )
        )
        or (
          contract.next_actor_role = 'influencer'
          and exists (
            select 1
            from public.contract_parties as party
            join public.profiles as profile
              on profile.id = party.profile_id
              and profile.data_origin = 'production'
              and lower(profile.email)
                !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
              and lower(profile.email)
                !~ '@(example[.](com|org|net)|directsign[.]app)$'
            where party.contract_id = contract.id
              and party.party_role = 'influencer'
          )
        )
      )
      -- Apply idempotency before LIMIT.  Already-projected early deadlines
      -- cannot consume every daily batch and starve later due contracts.
      and not exists (
        select 1
        from public.notification_projection_receipts as receipt
        where receipt.event_key = 'contract_deadline:' || contract.id::text || ':' ||
          contract.version_no::text || ':' ||
          extract(epoch from contract.next_due_at)::bigint::text
      )
    order by contract.next_due_at asc, contract.id asc
    limit least(greatest(p_limit, 1), 1000)
  loop
    v_target_role := case
      when v_contract.next_actor_role = 'influencer' then 'influencer'
      else 'advertiser'
    end;

    if v_target_role = 'advertiser' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'profileId', recipient.profile_id::text,
        'role', 'advertiser',
        'organizationId', recipient.organization_id::text
      )), '[]'::jsonb)
      into v_recipients
      from (
        select distinct membership.profile_id, membership.organization_id
        from public.organization_members as membership
        join public.profiles as profile
          on profile.id = membership.profile_id
          and profile.data_origin = 'production'
          and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
          and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
        where membership.organization_id = v_contract.owner_organization_id
          and membership.role in ('owner', 'admin', 'marketer')
      ) as recipient;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'profileId', party.profile_id::text,
        'role', 'influencer'
      )), '[]'::jsonb)
      into v_recipients
      from (
        select distinct contract_party.profile_id
        from public.contract_parties as contract_party
        join public.profiles as profile
          on profile.id = contract_party.profile_id
          and profile.data_origin = 'production'
          and lower(profile.email) !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
          and lower(profile.email) !~ '@(example[.](com|org|net)|directsign[.]app)$'
        where contract_party.contract_id = v_contract.id
          and contract_party.party_role = 'influencer'
          and contract_party.profile_id is not null
      ) as party;
    end if;

    v_event_key := 'contract_deadline:' || v_contract.id::text || ':' ||
      v_contract.version_no::text || ':' ||
      extract(epoch from v_contract.next_due_at)::bigint::text;

    begin
      select result.notification_event_id, result.inserted
      into v_notification_id, v_inserted
      from public.enqueue_notification_event(
        v_event_key,
        'deadline.action_due',
        'deadline',
        v_contract.id::text,
        v_contract.version_no::text || ':' ||
          extract(epoch from v_contract.next_due_at)::text,
        null,
        'system',
        'deadline.action_due',
        jsonb_build_object(
          'contractTitle', left(v_contract.campaign_title, 120),
          'dueAt', pg_catalog.to_char(
            v_contract.next_due_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ),
        'contract_detail',
        jsonb_build_object('contractId', v_contract.id::text),
        'production',
        v_contract.next_due_at - interval '48 hours',
        v_recipients
      ) as result
      limit 1;

      if v_notification_id is not null and v_inserted then
        v_count := v_count + 1;
      end if;
      perform public.resolve_notification_projection_failure(
        'customer_bell',
        'deadline',
        v_contract.id::text,
        v_contract.version_no::text || ':' ||
          extract(epoch from v_contract.next_due_at)::text
      );
    exception
      when others then
        get stacked diagnostics
          v_error_code = returned_sqlstate,
          v_error_detail = message_text;
        perform public.record_notification_projection_failure(
          'customer_bell',
          'deadline',
          v_contract.id::text,
          v_contract.version_no::text || ':' ||
            extract(epoch from v_contract.next_due_at)::text,
          v_error_code,
          v_error_detail
        );
    end;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.reconcile_contract_deadline_notifications(integer, integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_contract_deadline_notifications(integer, integer)
  to service_role;

create or replace function public.purge_expired_customer_notifications()
returns table (recipients_deleted integer, events_deleted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients_deleted integer := 0;
  v_events_deleted integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  delete from public.notification_recipients as recipient
  where (
      recipient.read_at is not null
      and recipient.occurred_at < now() - interval '90 days'
    )
    or recipient.occurred_at < now() - interval '180 days';
  get diagnostics v_recipients_deleted = row_count;

  delete from public.notification_events as event
  where not exists (
    select 1
    from public.notification_recipients as recipient
    where recipient.event_id = event.id
  );
  get diagnostics v_events_deleted = row_count;

  return query select v_recipients_deleted, v_events_deleted;
end;
$$;

revoke execute on function public.purge_expired_customer_notifications()
  from public, anon, authenticated;
grant execute on function public.purge_expired_customer_notifications()
  to service_role;

comment on table public.notification_events is
  'Immutable server-owned Bell notification facts. Pre-contract 1:1 messages never belong here.';
comment on table public.notification_recipients is
  'Per-profile Bell delivery and read state, scoped exclusively through no-store server APIs.';
comment on table public.notification_outbox is
  'Retryable multi-instance-safe outbox for downstream notification projection/delivery.';
comment on table public.notification_projection_receipts is
  'Non-expiring idempotency tombstones retained after customer-visible Bell rows expire.';
comment on table public.notification_workflow_sources is
  'Minimal authoritative deliverable transitions captured atomically with workflow mutations.';
comment on table public.notification_projection_failures is
  'Service-only actionable retry ledger for Bell projection failures; contains no customer payloads.';
