begin;

-- Raw marketplace rows contain ownership ids, operational/test markers and
-- denormalized campaign snapshots. Public clients must use the curated server
-- APIs and directory views instead of bypassing those filters through PostgREST.
revoke select on table
  public.marketplace_influencer_profiles,
  public.marketplace_influencer_channels,
  public.marketplace_brand_profiles
from public, anon, authenticated;

drop policy if exists marketplace_influencer_profiles_select_public_or_owner
  on public.marketplace_influencer_profiles;
drop policy if exists marketplace_influencer_channels_select_public_or_owner
  on public.marketplace_influencer_channels;
drop policy if exists marketplace_brand_profiles_select_published
  on public.marketplace_brand_profiles;

-- Prevent future objects from being created in the API-exposed schema by
-- untrusted roles. Migrations and the service role retain their own privileges.
revoke create on schema public from public, anon, authenticated;

-- Keep the default private evidence bucket aligned with the customer-facing
-- 10 MB upload limit and fail closed if dashboard configuration drifts later.
update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
where id = 'directsign-private';

-- pg_input_is_valid is STABLE, so callers and the planner must not treat this
-- validator as immutable across database state/configuration changes.
alter function public.directsign_campaign_application_consent_snapshot_valid(
  jsonb,
  uuid,
  text
) stable;

commit;
