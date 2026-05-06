-- Harden direct Data API privileges for security-sensitive verification state.
-- The application server uses service_role for these workflows; authenticated
-- users only keep the minimal direct-write surface needed by the existing RLS.

revoke insert, update on table public.profiles from authenticated;

grant insert (
  id,
  role,
  name,
  email,
  company_name,
  phone,
  avatar_url,
  activity_categories,
  activity_platforms
) on table public.profiles to authenticated;

grant update (
  name,
  email,
  company_name,
  phone,
  avatar_url,
  activity_categories,
  activity_platforms
) on table public.profiles to authenticated;

revoke insert, update on table public.organizations from authenticated;

grant insert (
  name,
  organization_type,
  business_registration_number,
  website_url,
  created_by_profile_id,
  representative_name
) on table public.organizations to authenticated;

grant update (
  name,
  organization_type,
  business_registration_number,
  website_url,
  representative_name
) on table public.organizations to authenticated;

drop policy if exists verification_requests_insert_related
on public.verification_requests;

drop policy if exists verification_requests_insert_self_pending
on public.verification_requests;

create policy verification_requests_insert_self_pending
on public.verification_requests for insert
to authenticated
with check (
  status = 'pending'
  and reviewer_note is null
  and reviewed_by_profile_id is null
  and reviewed_by_name is null
  and reviewed_at is null
  and (
    profile_id = auth.uid()
    or (
      organization_id is not null
      and public.directsign_is_org_member(organization_id)
    )
  )
);

drop policy if exists verification_requests_insert_admin
on public.verification_requests;

create policy verification_requests_insert_admin
on public.verification_requests for insert
to authenticated
with check (public.directsign_is_admin());

revoke insert, update on table public.verification_requests from authenticated;

grant insert (
  target_type,
  target_id,
  verification_type,
  profile_id,
  organization_id,
  subject_name,
  submitted_by_name,
  submitted_by_email,
  business_registration_number,
  representative_name,
  manager_phone,
  platform,
  platform_handle,
  platform_url,
  document_issue_date,
  document_check_number,
  evidence_file_name,
  evidence_file_mime,
  evidence_file_size,
  evidence_snapshot_json,
  note,
  ownership_verification_method,
  ownership_challenge_code,
  ownership_challenge_url
) on table public.verification_requests to authenticated;

grant update (
  status,
  reviewer_note,
  reviewed_by_profile_id,
  reviewed_by_name,
  reviewed_at,
  updated_at
) on table public.verification_requests to authenticated;
