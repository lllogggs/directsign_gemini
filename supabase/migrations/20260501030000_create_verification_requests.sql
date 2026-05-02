do $$
begin
  create type public.directsign_verification_status as enum (
    'not_submitted',
    'pending',
    'approved',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_verification_target_type as enum (
    'advertiser_organization',
    'influencer_account'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_verification_type as enum (
    'business_registration_certificate',
    'platform_account',
    'email',
    'phone',
    'manual'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists verification_status public.directsign_verification_status
    not null default 'not_submitted',
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_verified_at timestamptz;

alter table public.organizations
  add column if not exists business_verification_status public.directsign_verification_status
    not null default 'not_submitted',
  add column if not exists business_verified_at timestamptz,
  add column if not exists business_verification_request_id uuid,
  add column if not exists representative_name text;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  target_type public.directsign_verification_target_type not null,
  target_id text not null,
  verification_type public.directsign_verification_type not null,
  status public.directsign_verification_status not null default 'pending',
  profile_id uuid references public.profiles (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  subject_name text not null,
  submitted_by_name text,
  submitted_by_email text,
  business_registration_number text,
  representative_name text,
  manager_phone text,
  platform public.directsign_platform_type,
  platform_handle text,
  platform_url text,
  document_issue_date date,
  document_check_number text,
  evidence_file_name text,
  evidence_file_mime text,
  evidence_file_size integer,
  evidence_snapshot_json jsonb not null default '{}'::jsonb,
  note text,
  reviewer_note text,
  submitted_ip text,
  submitted_user_agent text,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_requests_subject_name_not_blank check (btrim(subject_name) <> ''),
  constraint verification_requests_target_id_not_blank check (btrim(target_id) <> ''),
  constraint verification_requests_evidence_size_positive check (
    evidence_file_size is null or evidence_file_size > 0
  ),
  constraint verification_requests_snapshot_object check (
    jsonb_typeof(evidence_snapshot_json) = 'object'
  ),
  constraint verification_requests_business_number_digits check (
    business_registration_number is null
    or business_registration_number ~ '^[0-9]{10}$'
  ),
  constraint verification_requests_pending_or_reviewed check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null)
  )
);

alter table public.organizations
  drop constraint if exists organizations_business_verification_request_fk;

alter table public.organizations
  add constraint organizations_business_verification_request_fk
  foreign key (business_verification_request_id)
  references public.verification_requests (id)
  on delete set null;

create index if not exists verification_requests_target_created_idx
  on public.verification_requests (target_type, target_id, created_at desc);

create index if not exists verification_requests_status_created_idx
  on public.verification_requests (status, created_at desc);

create index if not exists verification_requests_org_idx
  on public.verification_requests (organization_id)
  where organization_id is not null;

alter table public.verification_requests enable row level security;

drop policy if exists verification_requests_select_related on public.verification_requests;
create policy verification_requests_select_related
on public.verification_requests for select
to authenticated
using (
  public.directsign_is_admin()
  or profile_id = auth.uid()
  or (
    organization_id is not null
    and public.directsign_is_org_member(organization_id)
  )
);

drop policy if exists verification_requests_insert_related on public.verification_requests;
create policy verification_requests_insert_related
on public.verification_requests for insert
to authenticated
with check (
  public.directsign_is_admin()
  or profile_id = auth.uid()
  or (
    organization_id is not null
    and public.directsign_is_org_member(organization_id)
  )
);

drop policy if exists verification_requests_admin_review on public.verification_requests;
create policy verification_requests_admin_review
on public.verification_requests for update
to authenticated
using (public.directsign_is_admin())
with check (public.directsign_is_admin());

grant select, insert, update on public.verification_requests
to authenticated, service_role;

comment on table public.verification_requests is
  'Manual verification queue for advertiser business documents and influencer platform accounts.';
