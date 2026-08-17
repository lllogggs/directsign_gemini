-- Campaign images are stored under the owning organization id, not the
-- campaign id. Queue that canonical prefix before account preparation removes
-- memberships, and backfill any in-flight erasure requests.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.queue_account_campaign_thumbnail_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(array_length(new.organization_ids, 1), 0) = 0 then
    return new;
  end if;

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
    object_row.bucket_id,
    object_row.name,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  from storage.objects as object_row
  where object_row.bucket_id = 'yeollock-marketplace-public'
    and exists (
      select 1
      from unnest(new.organization_ids) as organization_id
      where object_row.name like
        'campaign-thumbnails/' || organization_id::text || '/%'
    )
  on conflict (source_type, source_id, bucket, object_path) do update
  set
    erasure_request_id = excluded.erasure_request_id,
    due_at = least(public.privacy_storage_deletion_queue.due_at, excluded.due_at),
    available_at = least(
      public.privacy_storage_deletion_queue.available_at,
      excluded.available_at
    ),
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists privacy_erasure_queue_campaign_thumbnail_prefix
  on public.privacy_erasure_requests;
create trigger privacy_erasure_queue_campaign_thumbnail_prefix
after insert or update of status, organization_ids
on public.privacy_erasure_requests
for each row
when (new.status not in ('completed', 'cancelled'))
execute function public.queue_account_campaign_thumbnail_erasure();

-- Repair requests that were prepared under the old campaign-id prefix.
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
  request.id,
  'account',
  request.auth_user_id::text,
  'account',
  object_row.bucket_id,
  object_row.name,
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp()
from public.privacy_erasure_requests as request
join storage.objects as object_row
  on object_row.bucket_id = 'yeollock-marketplace-public'
 and exists (
   select 1
   from unnest(request.organization_ids) as organization_id
   where object_row.name like
     'campaign-thumbnails/' || organization_id::text || '/%'
 )
-- Include requests previously marked completed: the old campaign-id prefix
-- could let finalization succeed while organization-owned thumbnails remained.
where request.status <> 'cancelled'
on conflict (source_type, source_id, bucket, object_path) do update
set
  erasure_request_id = excluded.erasure_request_id,
  due_at = least(public.privacy_storage_deletion_queue.due_at, excluded.due_at),
  available_at = least(
    public.privacy_storage_deletion_queue.available_at,
    excluded.available_at
  ),
  updated_at = excluded.updated_at;

revoke all on function public.queue_account_campaign_thumbnail_erasure()
  from public, anon, authenticated;

comment on function public.queue_account_campaign_thumbnail_erasure() is
  'Queues linked and pre-uploaded campaign thumbnail objects by canonical organization-owned Storage prefix before account erasure can finalize.';
