begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Older erasure finalization removed an organization id from the request once
-- the organization row was deleted. That made the request-to-prefix backfill
-- unable to discover an already-completed account. Recover only canonical
-- organization-owned campaign thumbnail paths whose organization no longer
-- exists. The privacy worker still performs the actual, retryable deletion.
with orphaned_campaign_thumbnail as (
  select
    object_row.bucket_id,
    object_row.name,
    lower(split_part(object_row.name, '/', 2)) as erased_organization_id
  from storage.objects as object_row
  where object_row.bucket_id = 'yeollock-marketplace-public'
    and object_row.name ~* (
      '^campaign-thumbnails/' ||
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' ||
      '[a-z0-9._-]+$'
    )
    and not exists (
      select 1
      from public.organizations as organization
      where organization.id = split_part(object_row.name, '/', 2)::uuid
    )
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
  null,
  'account',
  'erased-org:' || orphan.erased_organization_id,
  'account',
  orphan.bucket_id,
  orphan.name,
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp()
from orphaned_campaign_thumbnail as orphan
on conflict (source_type, source_id, bucket, object_path) do update
set
  due_at = least(public.privacy_storage_deletion_queue.due_at, excluded.due_at),
  available_at = least(
    public.privacy_storage_deletion_queue.available_at,
    excluded.available_at
  ),
  updated_at = excluded.updated_at;

comment on table public.privacy_storage_deletion_queue is
  'Retryable deletion queue. Account rows may include erased-org:<uuid> orphan recovery entries for public campaign thumbnails whose owning organization was already removed.';

commit;

