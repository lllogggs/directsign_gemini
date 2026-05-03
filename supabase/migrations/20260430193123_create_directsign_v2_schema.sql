create extension if not exists "pgcrypto";

do $$
begin
  create type public.directsign_user_role as enum (
    'marketer',
    'influencer',
    'admin'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_org_member_role as enum (
    'owner',
    'admin',
    'marketer',
    'finance',
    'viewer'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_contract_status as enum (
    'draft',
    'negotiating',
    'signing',
    'active',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_contract_party_role as enum (
    'advertiser',
    'marketer',
    'agency',
    'influencer',
    'creator_manager',
    'approver',
    'viewer'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_platform_type as enum (
    'naver_blog',
    'youtube',
    'instagram',
    'tiktok',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_pricing_type as enum (
    'fixed_fee',
    'commission',
    'fixed_plus_commission',
    'barter',
    'custom'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_commission_base as enum (
    'gross_sales',
    'net_sales',
    'order_amount',
    'settled_sales'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_settlement_cycle as enum (
    'once',
    'weekly',
    'monthly',
    'campaign_end',
    'custom'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_payment_due_type as enum (
    'after_invoice',
    'after_review',
    'fixed_date',
    'campaign_end',
    'custom'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_clause_status as enum (
    'pending',
    'accepted',
    'requested_change',
    'rejected',
    'countered',
    'removed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_clause_thread_status as enum (
    'open',
    'accepted',
    'rejected',
    'countered',
    'withdrawn'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_deliverable_type as enum (
    'post',
    'reels',
    'shorts',
    'video',
    'story',
    'live',
    'blog',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_review_status as enum (
    'draft',
    'submitted',
    'changes_requested',
    'approved',
    'rejected',
    'waived'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_share_link_scope as enum (
    'preview',
    'review',
    'sign',
    'deliverables',
    'settlement'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_share_link_status as enum (
    'active',
    'expired',
    'revoked',
    'consumed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_settlement_status as enum (
    'draft',
    'confirmed',
    'disputed',
    'paid',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_payout_status as enum (
    'pending',
    'scheduled',
    'paid',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_file_type as enum (
    'contract_pdf',
    'snapshot_pdf',
    'attachment',
    'evidence',
    'screenshot',
    'settlement_report',
    'signature_image',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.directsign_user_role not null default 'marketer',
  name text not null,
  email text not null,
  company_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type text not null default 'advertiser',
  business_registration_number text,
  website_url text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint organizations_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.directsign_org_member_role not null default 'marketer',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  public_share_id uuid not null unique default gen_random_uuid(),
  owner_organization_id uuid references public.organizations (id) on delete restrict,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  status public.directsign_contract_status not null default 'draft',
  campaign_title text not null,
  campaign_summary text,
  campaign_start_date date,
  campaign_end_date date,
  upload_deadline date,
  review_deadline date,
  total_fee_amount numeric(14, 2),
  total_fee_currency char(3) not null default 'KRW',
  pricing_type public.directsign_pricing_type not null default 'fixed_fee',
  next_actor_role public.directsign_contract_party_role,
  next_action text,
  next_due_at timestamptz,
  version_no integer not null default 1,
  signed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  legacy_contract_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contracts_campaign_title_not_blank check (btrim(campaign_title) <> ''),
  constraint contracts_total_fee_non_negative check (
    total_fee_amount is null or total_fee_amount >= 0
  ),
  constraint contracts_version_positive check (version_no > 0),
  constraint contracts_campaign_date_order check (
    campaign_start_date is null
    or campaign_end_date is null
    or campaign_end_date >= campaign_start_date
  )
);

create table if not exists public.contract_parties (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  party_role public.directsign_contract_party_role not null,
  display_name text not null,
  legal_name text,
  email text,
  phone text,
  company_name text,
  channel_url text,
  is_primary_signer boolean not null default false,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_parties_display_name_not_blank check (btrim(display_name) <> '')
);

create table if not exists public.contract_platforms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  platform public.directsign_platform_type not null,
  handle text,
  url text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.contract_pricing_terms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references public.contracts (id) on delete cascade,
  pricing_type public.directsign_pricing_type not null,
  currency char(3) not null default 'KRW',
  fixed_amount numeric(14, 2),
  commission_rate_bps integer,
  commission_base public.directsign_commission_base,
  minimum_guarantee_amount numeric(14, 2),
  cap_amount numeric(14, 2),
  vat_included boolean not null default true,
  vat_rate_bps integer not null default 1000,
  settlement_cycle public.directsign_settlement_cycle not null default 'campaign_end',
  payment_due_type public.directsign_payment_due_type not null default 'after_invoice',
  payment_due_days integer,
  payment_due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_pricing_amounts_non_negative check (
    (fixed_amount is null or fixed_amount >= 0)
    and (minimum_guarantee_amount is null or minimum_guarantee_amount >= 0)
    and (cap_amount is null or cap_amount >= 0)
  ),
  constraint contract_pricing_commission_rate_range check (
    commission_rate_bps is null
    or (commission_rate_bps >= 0 and commission_rate_bps <= 10000)
  ),
  constraint contract_pricing_vat_rate_range check (
    vat_rate_bps >= 0 and vat_rate_bps <= 10000
  ),
  constraint contract_pricing_due_days_non_negative check (
    payment_due_days is null or payment_due_days >= 0
  ),
  constraint contract_pricing_fixed_required check (
    pricing_type not in ('fixed_fee', 'fixed_plus_commission')
    or fixed_amount is not null
  ),
  constraint contract_pricing_commission_required check (
    pricing_type not in ('commission', 'fixed_plus_commission')
    or (commission_rate_bps is not null and commission_base is not null)
  ),
  constraint contract_pricing_cap_above_minimum check (
    cap_amount is null
    or minimum_guarantee_amount is null
    or cap_amount >= minimum_guarantee_amount
  )
);

create table if not exists public.contract_clauses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  order_no integer not null,
  clause_type text,
  title text not null,
  body text not null,
  status public.directsign_clause_status not null default 'pending',
  requested_by_profile_id uuid references public.profiles (id) on delete set null,
  requested_by_role public.directsign_contract_party_role,
  resolved_at timestamptz,
  locked_at timestamptz,
  version_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_clauses_order_positive check (order_no > 0),
  constraint contract_clauses_title_not_blank check (btrim(title) <> ''),
  constraint contract_clauses_body_not_blank check (btrim(body) <> ''),
  constraint contract_clauses_version_positive check (version_no > 0),
  unique (contract_id, order_no)
);

create table if not exists public.clause_threads (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  clause_id uuid not null references public.contract_clauses (id) on delete cascade,
  parent_thread_id uuid references public.clause_threads (id) on delete set null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_role public.directsign_contract_party_role not null,
  status public.directsign_clause_thread_status not null default 'open',
  action_type text not null,
  selected_excerpt text,
  original_text text,
  proposed_text text,
  message text,
  resolved_by_profile_id uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clause_threads_action_type_not_blank check (btrim(action_type) <> ''),
  constraint clause_threads_contract_clause_match unique (id, contract_id, clause_id)
);

create table if not exists public.deliverable_requirements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  platform_id uuid references public.contract_platforms (id) on delete set null,
  clause_id uuid references public.contract_clauses (id) on delete set null,
  deliverable_type public.directsign_deliverable_type not null,
  title text not null,
  description text,
  quantity integer not null default 1,
  due_at timestamptz,
  retention_days integer,
  review_required boolean not null default true,
  evidence_required boolean not null default false,
  order_no integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverable_requirements_title_not_blank check (btrim(title) <> ''),
  constraint deliverable_requirements_quantity_positive check (quantity > 0),
  constraint deliverable_requirements_retention_non_negative check (
    retention_days is null or retention_days >= 0
  ),
  constraint deliverable_requirements_order_positive check (order_no > 0)
);

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  requirement_id uuid references public.deliverable_requirements (id) on delete set null,
  creator_profile_id uuid references public.profiles (id) on delete set null,
  title text,
  url text,
  submitted_at timestamptz,
  review_status public.directsign_review_status not null default 'draft',
  review_comment text,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverables_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.settlement_periods (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_periods_date_order check (period_end >= period_start),
  unique (contract_id, period_start, period_end)
);

create table if not exists public.settlement_reports (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  pricing_term_id uuid references public.contract_pricing_terms (id) on delete set null,
  settlement_period_id uuid references public.settlement_periods (id) on delete set null,
  status public.directsign_settlement_status not null default 'draft',
  currency char(3) not null default 'KRW',
  period_start date not null,
  period_end date not null,
  gross_sales_amount numeric(14, 2) not null default 0,
  order_count integer not null default 0,
  cancel_count integer not null default 0,
  refund_amount numeric(14, 2) not null default 0,
  platform_fee_amount numeric(14, 2) not null default 0,
  net_sales_amount numeric(14, 2) not null default 0,
  commission_base_amount numeric(14, 2) not null default 0,
  commission_rate_bps integer,
  fixed_amount_applied numeric(14, 2) not null default 0,
  minimum_guarantee_applied numeric(14, 2) not null default 0,
  cap_applied numeric(14, 2),
  influencer_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  payout_amount numeric(14, 2) not null default 0,
  confirmed_by_profile_id uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_reports_date_order check (period_end >= period_start),
  constraint settlement_reports_counts_non_negative check (
    order_count >= 0 and cancel_count >= 0
  ),
  constraint settlement_reports_amounts_non_negative check (
    gross_sales_amount >= 0
    and refund_amount >= 0
    and platform_fee_amount >= 0
    and net_sales_amount >= 0
    and commission_base_amount >= 0
    and fixed_amount_applied >= 0
    and minimum_guarantee_applied >= 0
    and (cap_applied is null or cap_applied >= 0)
    and influencer_amount >= 0
    and tax_amount >= 0
    and payout_amount >= 0
  ),
  constraint settlement_reports_commission_rate_range check (
    commission_rate_bps is null
    or (commission_rate_bps >= 0 and commission_rate_bps <= 10000)
  )
);

create table if not exists public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_report_id uuid not null references public.settlement_reports (id) on delete cascade,
  item_type text not null,
  description text,
  quantity numeric(14, 2),
  amount numeric(14, 2) not null default 0,
  source_url text,
  occurred_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint settlement_items_type_not_blank check (btrim(item_type) <> ''),
  constraint settlement_items_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  settlement_report_id uuid references public.settlement_reports (id) on delete set null,
  payee_profile_id uuid references public.profiles (id) on delete set null,
  status public.directsign_payout_status not null default 'pending',
  currency char(3) not null default 'KRW',
  amount numeric(14, 2) not null,
  due_date date,
  paid_at timestamptz,
  payment_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_amount_non_negative check (amount >= 0),
  constraint payouts_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  token_hash text not null unique,
  scope public.directsign_share_link_scope not null default 'review',
  status public.directsign_share_link_status not null default 'active',
  expires_at timestamptz,
  revoked_at timestamptz,
  max_access_count integer,
  access_count integer not null default 0,
  last_accessed_at timestamptz,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint share_links_token_hash_not_blank check (btrim(token_hash) <> ''),
  constraint share_links_access_count_non_negative check (access_count >= 0),
  constraint share_links_max_access_count_positive check (
    max_access_count is null or max_access_count > 0
  )
);

create table if not exists public.contract_snapshots (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  version_no integer not null,
  snapshot_type text not null default 'draft',
  snapshot_json jsonb not null,
  body_hash text not null,
  pdf_hash text,
  storage_path text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint contract_snapshots_version_positive check (version_no > 0),
  constraint contract_snapshots_json_is_object check (jsonb_typeof(snapshot_json) = 'object'),
  constraint contract_snapshots_body_hash_not_blank check (btrim(body_hash) <> ''),
  unique (contract_id, version_no),
  unique (id, contract_id)
);

create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  signed_snapshot_id uuid not null,
  signer_profile_id uuid references public.profiles (id) on delete set null,
  signer_party_id uuid references public.contract_parties (id) on delete set null,
  signer_role public.directsign_contract_party_role not null,
  signer_name text,
  signer_email text,
  signature_hash text not null,
  signature_storage_path text,
  signed_ip inet,
  signed_user_agent text,
  consent_text_version text,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint signatures_snapshot_contract_fk foreign key (signed_snapshot_id, contract_id)
    references public.contract_snapshots (id, contract_id) on delete restrict,
  constraint signatures_hash_not_blank check (btrim(signature_hash) <> '')
);

create table if not exists public.contract_files (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  uploaded_by_profile_id uuid references public.profiles (id) on delete set null,
  related_type text,
  related_id uuid,
  file_type public.directsign_file_type not null default 'other',
  bucket text not null,
  storage_path text not null,
  file_name text,
  content_type text,
  byte_size bigint,
  file_hash text,
  created_at timestamptz not null default now(),
  constraint contract_files_bucket_not_blank check (btrim(bucket) <> ''),
  constraint contract_files_storage_path_not_blank check (btrim(storage_path) <> ''),
  constraint contract_files_byte_size_non_negative check (byte_size is null or byte_size >= 0)
);

create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  actor_display_name text,
  event_type text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  previous_event_hash text,
  event_hash text,
  created_at timestamptz not null default now(),
  constraint contract_events_type_not_blank check (btrim(event_type) <> ''),
  constraint contract_events_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create or replace function public.directsign_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.directsign_set_contract_event_hash()
returns trigger
language plpgsql
as $$
declare
  v_previous_hash text;
begin
  if new.previous_event_hash is null then
    select event_hash
    into v_previous_hash
    from public.contract_events
    where contract_id = new.contract_id
      and event_hash is not null
    order by created_at desc, id desc
    limit 1;

    new.previous_event_hash = v_previous_hash;
  end if;

  new.event_hash = encode(
    digest(
      concat_ws(
        '|',
        new.id::text,
        new.contract_id::text,
        coalesce(new.actor_profile_id::text, ''),
        coalesce(new.actor_role, ''),
        new.event_type,
        coalesce(new.target_type, ''),
        coalesce(new.target_id::text, ''),
        new.payload::text,
        coalesce(new.previous_event_hash, ''),
        new.created_at::text
      ),
      'sha256'
    ),
    'hex'
  );

  return new;
end;
$$;

create or replace function public.directsign_prevent_contract_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'contract_events is append-only';
end;
$$;

create or replace function public.directsign_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    );
$$;

create or replace function public.directsign_is_org_member(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = p_organization_id
        and organization_members.profile_id = auth.uid()
    );
$$;

create or replace function public.directsign_can_access_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or public.directsign_is_admin()
    or exists (
      select 1
      from public.contracts
      where contracts.id = p_contract_id
        and (
          contracts.created_by_profile_id = auth.uid()
          or (
            contracts.owner_organization_id is not null
            and public.directsign_is_org_member(contracts.owner_organization_id)
          )
          or exists (
            select 1
            from public.contract_parties
            where contract_parties.contract_id = contracts.id
              and contract_parties.profile_id = auth.uid()
          )
        )
    );
$$;

create or replace function public.directsign_can_manage_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or public.directsign_is_admin()
    or exists (
      select 1
      from public.contracts
      where contracts.id = p_contract_id
        and (
          contracts.created_by_profile_id = auth.uid()
          or (
            contracts.owner_organization_id is not null
            and exists (
              select 1
              from public.organization_members
              where organization_members.organization_id = contracts.owner_organization_id
                and organization_members.profile_id = auth.uid()
                and organization_members.role in ('owner', 'admin', 'marketer')
            )
          )
          or exists (
            select 1
            from public.contract_parties
            where contract_parties.contract_id = contracts.id
              and contract_parties.profile_id = auth.uid()
              and contract_parties.party_role in ('advertiser', 'marketer', 'agency', 'approver')
          )
        )
    );
$$;

create or replace function public.directsign_can_respond_to_contract(
  p_contract_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.directsign_can_manage_contract(p_contract_id)
    or exists (
      select 1
      from public.contract_parties
      where contract_parties.contract_id = p_contract_id
        and contract_parties.profile_id = auth.uid()
        and contract_parties.party_role in ('influencer', 'creator_manager')
    );
$$;

create or replace function public.directsign_public_contract_preview(
  p_token_hash text
)
returns table (
  contract_id uuid,
  public_share_id uuid,
  campaign_title text,
  status public.directsign_contract_status,
  campaign_start_date date,
  campaign_end_date date,
  upload_deadline date,
  review_deadline date,
  pricing_type public.directsign_pricing_type,
  total_fee_amount numeric,
  total_fee_currency char(3),
  parties jsonb,
  platforms jsonb,
  pricing_terms jsonb,
  clauses jsonb,
  deliverable_requirements jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    contracts.id,
    contracts.public_share_id,
    contracts.campaign_title,
    contracts.status,
    contracts.campaign_start_date,
    contracts.campaign_end_date,
    contracts.upload_deadline,
    contracts.review_deadline,
    contracts.pricing_type,
    contracts.total_fee_amount,
    contracts.total_fee_currency,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'role', contract_parties.party_role,
          'display_name', contract_parties.display_name,
          'company_name', contract_parties.company_name,
          'channel_url', contract_parties.channel_url
        )
        order by contract_parties.party_role::text
      )
      from public.contract_parties
      where contract_parties.contract_id = contracts.id
    ), '[]'::jsonb) as parties,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'platform', contract_platforms.platform,
          'handle', contract_platforms.handle,
          'url', contract_platforms.url,
          'is_primary', contract_platforms.is_primary
        )
        order by contract_platforms.is_primary desc, contract_platforms.platform::text
      )
      from public.contract_platforms
      where contract_platforms.contract_id = contracts.id
    ), '[]'::jsonb) as platforms,
    to_jsonb(contract_pricing_terms) - 'id' - 'contract_id' as pricing_terms,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', contract_clauses.id,
          'order_no', contract_clauses.order_no,
          'title', contract_clauses.title,
          'body', contract_clauses.body,
          'status', contract_clauses.status
        )
        order by contract_clauses.order_no
      )
      from public.contract_clauses
      where contract_clauses.contract_id = contracts.id
        and contract_clauses.status <> 'removed'
    ), '[]'::jsonb) as clauses,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', deliverable_requirements.id,
          'deliverable_type', deliverable_requirements.deliverable_type,
          'title', deliverable_requirements.title,
          'description', deliverable_requirements.description,
          'quantity', deliverable_requirements.quantity,
          'due_at', deliverable_requirements.due_at,
          'retention_days', deliverable_requirements.retention_days
        )
        order by deliverable_requirements.order_no
      )
      from public.deliverable_requirements
      where deliverable_requirements.contract_id = contracts.id
    ), '[]'::jsonb) as deliverable_requirements
  from public.share_links
  join public.contracts on contracts.id = share_links.contract_id
  left join public.contract_pricing_terms on contract_pricing_terms.contract_id = contracts.id
  where share_links.token_hash = p_token_hash
    and share_links.status = 'active'
    and (share_links.expires_at is null or share_links.expires_at > now())
    and (
      share_links.max_access_count is null
      or share_links.access_count < share_links.max_access_count
    )
    and contracts.deleted_at is null
  limit 1;
$$;

create or replace view public.contract_summaries
with (security_invoker = true)
as
select
  contracts.id as contract_id,
  contracts.public_share_id,
  contracts.campaign_title,
  contracts.status,
  contracts.pricing_type,
  contracts.total_fee_amount,
  contracts.total_fee_currency,
  contracts.campaign_start_date,
  contracts.campaign_end_date,
  contracts.upload_deadline,
  contracts.review_deadline,
  contracts.next_actor_role,
  contracts.next_action,
  contracts.next_due_at,
  contracts.updated_at,
  (
    select contract_parties.display_name
    from public.contract_parties
    where contract_parties.contract_id = contracts.id
      and contract_parties.party_role in ('advertiser', 'marketer', 'agency')
    order by
      case contract_parties.party_role
        when 'advertiser' then 1
        when 'marketer' then 2
        else 3
      end,
      contract_parties.created_at
    limit 1
  ) as advertiser_name,
  (
    select contract_parties.display_name
    from public.contract_parties
    where contract_parties.contract_id = contracts.id
      and contract_parties.party_role in ('influencer', 'creator_manager')
    order by
      case contract_parties.party_role
        when 'influencer' then 1
        else 2
      end,
      contract_parties.created_at
    limit 1
  ) as influencer_name,
  coalesce((
    select array_agg(contract_platforms.platform order by contract_platforms.platform)
    from public.contract_platforms
    where contract_platforms.contract_id = contracts.id
  ), array[]::public.directsign_platform_type[]) as platforms
from public.contracts
where contracts.deleted_at is null;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists contracts_touch_updated_at on public.contracts;
create trigger contracts_touch_updated_at
before update on public.contracts
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists contract_parties_touch_updated_at on public.contract_parties;
create trigger contract_parties_touch_updated_at
before update on public.contract_parties
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists contract_pricing_terms_touch_updated_at on public.contract_pricing_terms;
create trigger contract_pricing_terms_touch_updated_at
before update on public.contract_pricing_terms
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists contract_clauses_touch_updated_at on public.contract_clauses;
create trigger contract_clauses_touch_updated_at
before update on public.contract_clauses
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists clause_threads_touch_updated_at on public.clause_threads;
create trigger clause_threads_touch_updated_at
before update on public.clause_threads
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists deliverable_requirements_touch_updated_at on public.deliverable_requirements;
create trigger deliverable_requirements_touch_updated_at
before update on public.deliverable_requirements
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists deliverables_touch_updated_at on public.deliverables;
create trigger deliverables_touch_updated_at
before update on public.deliverables
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists settlement_periods_touch_updated_at on public.settlement_periods;
create trigger settlement_periods_touch_updated_at
before update on public.settlement_periods
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists settlement_reports_touch_updated_at on public.settlement_reports;
create trigger settlement_reports_touch_updated_at
before update on public.settlement_reports
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists payouts_touch_updated_at on public.payouts;
create trigger payouts_touch_updated_at
before update on public.payouts
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists contract_events_set_hash on public.contract_events;
create trigger contract_events_set_hash
before insert on public.contract_events
for each row execute function public.directsign_set_contract_event_hash();

drop trigger if exists contract_events_prevent_update on public.contract_events;
create trigger contract_events_prevent_update
before update on public.contract_events
for each row execute function public.directsign_prevent_contract_event_mutation();

drop trigger if exists contract_events_prevent_delete on public.contract_events;
create trigger contract_events_prevent_delete
before delete on public.contract_events
for each row execute function public.directsign_prevent_contract_event_mutation();

create unique index if not exists contract_parties_one_advertiser_idx
  on public.contract_parties (contract_id)
  where party_role = 'advertiser';

create unique index if not exists contract_parties_one_influencer_idx
  on public.contract_parties (contract_id)
  where party_role = 'influencer';

create unique index if not exists contract_platforms_one_primary_idx
  on public.contract_platforms (contract_id)
  where is_primary;

create unique index if not exists signatures_one_per_party_idx
  on public.signatures (contract_id, signer_party_id)
  where signer_party_id is not null;

create index if not exists profiles_email_idx
  on public.profiles (lower(email));

create index if not exists organizations_created_by_idx
  on public.organizations (created_by_profile_id);

create index if not exists organization_members_profile_idx
  on public.organization_members (profile_id);

create index if not exists contracts_owner_status_updated_idx
  on public.contracts (owner_organization_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists contracts_created_by_status_idx
  on public.contracts (created_by_profile_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists contracts_public_share_id_idx
  on public.contracts (public_share_id);

create index if not exists contract_parties_contract_idx
  on public.contract_parties (contract_id);

create index if not exists contract_parties_profile_idx
  on public.contract_parties (profile_id);

create index if not exists contract_platforms_contract_idx
  on public.contract_platforms (contract_id);

create index if not exists contract_clauses_contract_order_idx
  on public.contract_clauses (contract_id, order_no);

create index if not exists contract_clauses_contract_status_idx
  on public.contract_clauses (contract_id, status);

create index if not exists clause_threads_clause_created_idx
  on public.clause_threads (clause_id, created_at desc);

create index if not exists deliverable_requirements_contract_idx
  on public.deliverable_requirements (contract_id, order_no);

create index if not exists deliverables_contract_review_idx
  on public.deliverables (contract_id, review_status);

create index if not exists settlement_periods_contract_idx
  on public.settlement_periods (contract_id, period_start, period_end);

create index if not exists settlement_reports_contract_period_idx
  on public.settlement_reports (contract_id, period_start, period_end);

create index if not exists settlement_reports_status_idx
  on public.settlement_reports (status);

create index if not exists settlement_items_report_idx
  on public.settlement_items (settlement_report_id);

create index if not exists payouts_contract_status_idx
  on public.payouts (contract_id, status);

create index if not exists share_links_token_hash_idx
  on public.share_links (token_hash);

create index if not exists share_links_contract_scope_idx
  on public.share_links (contract_id, scope, status);

create index if not exists contract_snapshots_contract_version_idx
  on public.contract_snapshots (contract_id, version_no desc);

create index if not exists signatures_contract_idx
  on public.signatures (contract_id, signed_at desc);

create index if not exists contract_files_contract_type_idx
  on public.contract_files (contract_id, file_type);

create index if not exists contract_events_contract_created_idx
  on public.contract_events (contract_id, created_at desc);

create index if not exists contract_events_target_idx
  on public.contract_events (target_type, target_id)
  where target_type is not null and target_id is not null;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_parties enable row level security;
alter table public.contract_platforms enable row level security;
alter table public.contract_pricing_terms enable row level security;
alter table public.contract_clauses enable row level security;
alter table public.clause_threads enable row level security;
alter table public.deliverable_requirements enable row level security;
alter table public.deliverables enable row level security;
alter table public.settlement_periods enable row level security;
alter table public.settlement_reports enable row level security;
alter table public.settlement_items enable row level security;
alter table public.payouts enable row level security;
alter table public.share_links enable row level security;
alter table public.contract_snapshots enable row level security;
alter table public.signatures enable row level security;
alter table public.contract_files enable row level security;
alter table public.contract_events enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles for select
to authenticated
using (id = auth.uid() or public.directsign_is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles for insert
to authenticated
with check (
  public.directsign_is_admin()
  or (id = auth.uid() and role <> 'admin')
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles for update
to authenticated
using (id = auth.uid() or public.directsign_is_admin())
with check (
  public.directsign_is_admin()
  or (id = auth.uid() and role <> 'admin')
);

drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members
on public.organizations for select
to authenticated
using (
  public.directsign_is_admin()
  or public.directsign_is_org_member(id)
);

drop policy if exists organizations_insert_authenticated on public.organizations;
create policy organizations_insert_authenticated
on public.organizations for insert
to authenticated
with check (
  created_by_profile_id = auth.uid()
  or public.directsign_is_admin()
);

drop policy if exists organizations_update_managers on public.organizations;
create policy organizations_update_managers
on public.organizations for update
to authenticated
using (
  public.directsign_is_admin()
  or exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = organizations.id
      and organization_members.profile_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
)
with check (
  public.directsign_is_admin()
  or exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = organizations.id
      and organization_members.profile_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
);

drop policy if exists organization_members_select_org_members on public.organization_members;
create policy organization_members_select_org_members
on public.organization_members for select
to authenticated
using (
  public.directsign_is_admin()
  or public.directsign_is_org_member(organization_id)
);

drop policy if exists organization_members_manage_org_admins on public.organization_members;
create policy organization_members_manage_org_admins
on public.organization_members for all
to authenticated
using (
  public.directsign_is_admin()
  or exists (
    select 1
    from public.organization_members as managers
    where managers.organization_id = organization_members.organization_id
      and managers.profile_id = auth.uid()
      and managers.role in ('owner', 'admin')
  )
)
with check (
  public.directsign_is_admin()
  or exists (
    select 1
    from public.organizations
    where organizations.id = organization_members.organization_id
      and organizations.created_by_profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.organization_members as managers
    where managers.organization_id = organization_members.organization_id
      and managers.profile_id = auth.uid()
      and managers.role in ('owner', 'admin')
  )
);

drop policy if exists contracts_select_accessible on public.contracts;
create policy contracts_select_accessible
on public.contracts for select
to authenticated
using (public.directsign_can_access_contract(id));

drop policy if exists contracts_insert_authenticated on public.contracts;
create policy contracts_insert_authenticated
on public.contracts for insert
to authenticated
with check (
  public.directsign_is_admin()
  or created_by_profile_id = auth.uid()
  or (
    owner_organization_id is not null
    and exists (
      select 1
      from public.organization_members
      where organization_members.organization_id = owner_organization_id
        and organization_members.profile_id = auth.uid()
        and organization_members.role in ('owner', 'admin', 'marketer')
    )
  )
);

drop policy if exists contracts_update_managers on public.contracts;
create policy contracts_update_managers
on public.contracts for update
to authenticated
using (public.directsign_can_manage_contract(id))
with check (public.directsign_can_manage_contract(id));

drop policy if exists contract_parties_select_accessible on public.contract_parties;
create policy contract_parties_select_accessible
on public.contract_parties for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists contract_parties_manage_contract on public.contract_parties;
create policy contract_parties_manage_contract
on public.contract_parties for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists contract_platforms_select_accessible on public.contract_platforms;
create policy contract_platforms_select_accessible
on public.contract_platforms for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists contract_platforms_manage_contract on public.contract_platforms;
create policy contract_platforms_manage_contract
on public.contract_platforms for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists contract_pricing_terms_select_accessible on public.contract_pricing_terms;
create policy contract_pricing_terms_select_accessible
on public.contract_pricing_terms for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists contract_pricing_terms_manage_contract on public.contract_pricing_terms;
create policy contract_pricing_terms_manage_contract
on public.contract_pricing_terms for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists contract_clauses_select_accessible on public.contract_clauses;
create policy contract_clauses_select_accessible
on public.contract_clauses for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists contract_clauses_manage_contract on public.contract_clauses;
create policy contract_clauses_manage_contract
on public.contract_clauses for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists clause_threads_select_accessible on public.clause_threads;
create policy clause_threads_select_accessible
on public.clause_threads for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists clause_threads_insert_accessible on public.clause_threads;
create policy clause_threads_insert_accessible
on public.clause_threads for insert
to authenticated
with check (public.directsign_can_respond_to_contract(contract_id));

drop policy if exists clause_threads_update_managers on public.clause_threads;
create policy clause_threads_update_managers
on public.clause_threads for update
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists deliverable_requirements_select_accessible on public.deliverable_requirements;
create policy deliverable_requirements_select_accessible
on public.deliverable_requirements for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists deliverable_requirements_manage_contract on public.deliverable_requirements;
create policy deliverable_requirements_manage_contract
on public.deliverable_requirements for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists deliverables_select_accessible on public.deliverables;
create policy deliverables_select_accessible
on public.deliverables for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists deliverables_insert_accessible on public.deliverables;
create policy deliverables_insert_accessible
on public.deliverables for insert
to authenticated
with check (public.directsign_can_respond_to_contract(contract_id));

drop policy if exists deliverables_update_accessible on public.deliverables;
create policy deliverables_update_accessible
on public.deliverables for update
to authenticated
using (public.directsign_can_respond_to_contract(contract_id))
with check (public.directsign_can_respond_to_contract(contract_id));

drop policy if exists settlement_periods_select_accessible on public.settlement_periods;
create policy settlement_periods_select_accessible
on public.settlement_periods for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists settlement_periods_manage_contract on public.settlement_periods;
create policy settlement_periods_manage_contract
on public.settlement_periods for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists settlement_reports_select_accessible on public.settlement_reports;
create policy settlement_reports_select_accessible
on public.settlement_reports for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists settlement_reports_manage_contract on public.settlement_reports;
create policy settlement_reports_manage_contract
on public.settlement_reports for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists settlement_items_select_accessible on public.settlement_items;
create policy settlement_items_select_accessible
on public.settlement_items for select
to authenticated
using (
  exists (
    select 1
    from public.settlement_reports
    where settlement_reports.id = settlement_items.settlement_report_id
      and public.directsign_can_access_contract(settlement_reports.contract_id)
  )
);

drop policy if exists settlement_items_manage_contract on public.settlement_items;
create policy settlement_items_manage_contract
on public.settlement_items for all
to authenticated
using (
  exists (
    select 1
    from public.settlement_reports
    where settlement_reports.id = settlement_items.settlement_report_id
      and public.directsign_can_manage_contract(settlement_reports.contract_id)
  )
)
with check (
  exists (
    select 1
    from public.settlement_reports
    where settlement_reports.id = settlement_items.settlement_report_id
      and public.directsign_can_manage_contract(settlement_reports.contract_id)
  )
);

drop policy if exists payouts_select_accessible on public.payouts;
create policy payouts_select_accessible
on public.payouts for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists payouts_manage_contract on public.payouts;
create policy payouts_manage_contract
on public.payouts for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists share_links_select_managers on public.share_links;
create policy share_links_select_managers
on public.share_links for select
to authenticated
using (public.directsign_can_manage_contract(contract_id));

drop policy if exists share_links_manage_contract on public.share_links;
create policy share_links_manage_contract
on public.share_links for all
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists contract_snapshots_select_accessible on public.contract_snapshots;
create policy contract_snapshots_select_accessible
on public.contract_snapshots for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists contract_snapshots_insert_accessible on public.contract_snapshots;
create policy contract_snapshots_insert_accessible
on public.contract_snapshots for insert
to authenticated
with check (public.directsign_can_respond_to_contract(contract_id));

drop policy if exists signatures_select_accessible on public.signatures;
create policy signatures_select_accessible
on public.signatures for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists signatures_insert_accessible on public.signatures;
create policy signatures_insert_accessible
on public.signatures for insert
to authenticated
with check (public.directsign_can_respond_to_contract(contract_id));

drop policy if exists contract_files_select_accessible on public.contract_files;
create policy contract_files_select_accessible
on public.contract_files for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists contract_files_insert_accessible on public.contract_files;
create policy contract_files_insert_accessible
on public.contract_files for insert
to authenticated
with check (public.directsign_can_respond_to_contract(contract_id));

drop policy if exists contract_files_update_managers on public.contract_files;
create policy contract_files_update_managers
on public.contract_files for update
to authenticated
using (public.directsign_can_manage_contract(contract_id))
with check (public.directsign_can_manage_contract(contract_id));

drop policy if exists contract_events_select_accessible on public.contract_events;
create policy contract_events_select_accessible
on public.contract_events for select
to authenticated
using (public.directsign_can_access_contract(contract_id));

drop policy if exists contract_events_insert_accessible on public.contract_events;
create policy contract_events_insert_accessible
on public.contract_events for insert
to authenticated
with check (public.directsign_can_respond_to_contract(contract_id));

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.profiles,
  public.organizations,
  public.organization_members,
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
  public.contract_events
to authenticated, service_role;

grant select on public.contract_summaries to authenticated, service_role;

grant execute on function public.directsign_public_contract_preview(text)
to anon, authenticated, service_role;

grant execute on function public.directsign_is_admin()
to authenticated, service_role;

grant execute on function public.directsign_is_org_member(uuid)
to authenticated, service_role;

grant execute on function public.directsign_can_access_contract(uuid)
to authenticated, service_role;

grant execute on function public.directsign_can_manage_contract(uuid)
to authenticated, service_role;

grant execute on function public.directsign_can_respond_to_contract(uuid)
to authenticated, service_role;

comment on table public.contracts is
  'DirectSign v2 contract root entity. Legacy directsign_contracts remains available during migration.';

comment on table public.contract_pricing_terms is
  'Contract payment terms including fixed fees, commission rates in basis points, guarantees, caps, VAT, and due rules.';

comment on table public.settlement_reports is
  'Commission and group-buying settlement report with explicit calculation basis and payout amount.';

comment on table public.contract_events is
  'Append-only audit ledger for contract lifecycle, clause negotiation, signatures, deliverables, files, and settlements.';;
