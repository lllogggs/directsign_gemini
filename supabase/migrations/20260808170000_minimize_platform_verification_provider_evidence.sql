begin;

-- Legacy inline evidence remains available for the verification-retention
-- period, but is removed from the broadly returned request snapshot.
create table if not exists directsign_private.verification_legacy_evidence_files (
  request_id uuid primary key
    references public.verification_requests (id) on delete cascade,
  file_data_url text not null,
  migrated_at timestamptz not null default clock_timestamp(),
  constraint verification_legacy_evidence_files_data_url check (
    file_data_url ~ '^data:(application/pdf|image/(png|jpeg|webp));base64,'
  )
);

revoke all on table directsign_private.verification_legacy_evidence_files
  from public, anon, authenticated, service_role;

insert into directsign_private.verification_legacy_evidence_files (
  request_id,
  file_data_url,
  migrated_at
)
select
  request.id,
  request.evidence_snapshot_json ->> 'file_data_url',
  clock_timestamp()
from public.verification_requests as request
where request.target_type::text = 'influencer_account'
  and request.verification_type::text = 'platform_account'
  and request.platform::text in ('youtube', 'naver_blog')
  and jsonb_typeof(request.evidence_snapshot_json -> 'file_data_url') = 'string'
  and request.evidence_snapshot_json ->> 'file_data_url'
    ~ '^data:(application/pdf|image/(png|jpeg|webp));base64,'
on conflict (request_id) do nothing;

create or replace function public.get_verification_legacy_evidence_file(
  p_request_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_file_data_url text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'verification legacy evidence access requires service role';
  end if;

  select evidence.file_data_url
  into v_file_data_url
  from directsign_private.verification_legacy_evidence_files as evidence
  where evidence.request_id = p_request_id;

  return v_file_data_url;
end;
$$;

revoke all on function public.get_verification_legacy_evidence_file(uuid)
  from public, anon, authenticated;
grant execute on function public.get_verification_legacy_evidence_file(uuid)
  to service_role;

-- Evidence-download audit events are append-only private records. They must
-- not be patched back into evidence_snapshot_json.
create table if not exists directsign_private.verification_evidence_access_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.verification_requests (id) on delete cascade,
  action text not null default 'evidence_downloaded',
  actor_role text not null default 'admin',
  actor_profile_id uuid not null,
  actor_name text not null,
  ip text not null,
  user_agent text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint verification_evidence_access_action check (
    action = 'evidence_downloaded'
  ),
  constraint verification_evidence_access_actor_role check (
    actor_role = 'admin'
  ),
  constraint verification_evidence_access_actor_name check (
    btrim(actor_name) <> '' and length(actor_name) <= 200
  ),
  constraint verification_evidence_access_ip check (
    btrim(ip) <> '' and length(ip) <= 128
  ),
  constraint verification_evidence_access_user_agent check (
    btrim(user_agent) <> '' and length(user_agent) <= 1024
  )
);

create index if not exists verification_evidence_access_request_created_idx
  on directsign_private.verification_evidence_access_events (
    request_id,
    created_at desc
  );

revoke all on table directsign_private.verification_evidence_access_events
  from public, anon, authenticated, service_role;

insert into directsign_private.verification_evidence_access_events (
  id,
  request_id,
  action,
  actor_role,
  actor_profile_id,
  actor_name,
  ip,
  user_agent,
  created_at
)
select
  case
    when pg_catalog.pg_input_is_valid(event.value ->> 'id', 'uuid')
      then (event.value ->> 'id')::uuid
    else gen_random_uuid()
  end,
  request.id,
  'evidence_downloaded',
  'admin',
  (event.value ->> 'actor_profile_id')::uuid,
  coalesce(
    nullif(left(btrim(event.value ->> 'actor_name'), 200), ''),
    'unknown'
  ),
  coalesce(nullif(left(btrim(event.value ->> 'ip'), 128), ''), 'unknown'),
  coalesce(
    nullif(left(btrim(event.value ->> 'user_agent'), 1024), ''),
    'unknown'
  ),
  case
    when pg_catalog.pg_input_is_valid(
      event.value ->> 'created_at',
      'timestamp with time zone'
    ) then (event.value ->> 'created_at')::timestamptz
    else coalesce(request.updated_at, request.created_at, clock_timestamp())
  end
from public.verification_requests as request
cross join lateral pg_catalog.jsonb_array_elements(
  case
    when jsonb_typeof(
      request.evidence_snapshot_json -> 'evidence_access_audit'
    ) = 'array' then request.evidence_snapshot_json -> 'evidence_access_audit'
    else '[]'::jsonb
  end
) as event(value)
where request.target_type::text = 'influencer_account'
  and request.verification_type::text = 'platform_account'
  and request.platform::text in ('youtube', 'naver_blog')
  and event.value ->> 'action' = 'evidence_downloaded'
  and event.value ->> 'actor_role' = 'admin'
  and pg_catalog.pg_input_is_valid(
    event.value ->> 'actor_profile_id',
    'uuid'
  )
on conflict (id) do nothing;

create or replace function public.record_verification_evidence_access(
  p_request_id uuid,
  p_actor_profile_id uuid,
  p_actor_name text,
  p_ip text,
  p_user_agent text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id uuid := gen_random_uuid();
  v_actor_name text := btrim(coalesce(p_actor_name, ''));
  v_ip text := btrim(coalesce(p_ip, ''));
  v_user_agent text := btrim(coalesce(p_user_agent, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'verification evidence audit requires service role';
  end if;
  if p_request_id is null
     or p_actor_profile_id is null
     or v_actor_name = ''
     or length(v_actor_name) > 200
     or v_ip = ''
     or length(v_ip) > 128
     or v_user_agent = ''
     or length(v_user_agent) > 1024 then
    raise exception using
      errcode = '22023',
      message = 'invalid verification evidence audit input';
  end if;
  if not exists (
    select 1
    from public.verification_requests as request
    where request.id = p_request_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'verification request not found';
  end if;

  insert into directsign_private.verification_evidence_access_events (
    id,
    request_id,
    action,
    actor_role,
    actor_profile_id,
    actor_name,
    ip,
    user_agent,
    created_at
  ) values (
    v_event_id,
    p_request_id,
    'evidence_downloaded',
    'admin',
    p_actor_profile_id,
    v_actor_name,
    v_ip,
    v_user_agent,
    clock_timestamp()
  );

  return v_event_id;
end;
$$;

revoke all on function public.record_verification_evidence_access(
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.record_verification_evidence_access(
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;

create or replace function directsign_private.directsign_minimize_platform_verification_evidence(
  p_evidence jsonb,
  p_request_id uuid,
  p_platform text,
  p_platform_handle text,
  p_platform_url text,
  p_profile_id uuid,
  p_ownership_method text,
  p_challenge_code text,
  p_challenge_url text,
  p_status text,
  p_checked_at timestamptz,
  p_evidence_file_name text,
  p_evidence_file_mime text,
  p_evidence_file_size integer,
  p_created_at timestamptz
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_evidence jsonb := case
    when jsonb_typeof(p_evidence) = 'object' then p_evidence
    else '{}'::jsonb
  end;
  v_existing_ownership jsonb;
  v_existing_automation jsonb;
  v_existing_decision jsonb;
  v_decision jsonb;
  v_check jsonb;
  v_ownership jsonb;
  v_evidence_file jsonb;
  v_result jsonb;
  v_provider text;
  v_mode text;
  v_decision_status text;
  v_check_status text;
  v_checked_at text;
  v_platform_handle text := nullif(btrim(coalesce(p_platform_handle, '')), '');
  v_platform_url text := nullif(btrim(coalesce(p_platform_url, '')), '');
  v_challenge_code text := nullif(btrim(coalesce(p_challenge_code, '')), '');
  v_challenge_url text := nullif(btrim(coalesce(p_challenge_url, '')), '');
  v_file jsonb;
  v_file_provider text;
  v_file_bucket text;
  v_file_path text;
  v_file_sha256 text;
  v_file_stored_at text;
  v_legacy_data_url text;
  v_claimed_handle text;
  v_alternate_handle text;
  v_current_owner_profile_id text;
  v_current_marketplace_profile_id text;
  v_requested_by_profile_id text;
  v_reason text;
begin
  if p_platform not in ('youtube', 'naver_blog') then
    return v_evidence;
  end if;

  v_file := case
    when jsonb_typeof(v_evidence -> 'evidence_file') = 'object'
      then v_evidence -> 'evidence_file'
    else '{}'::jsonb
  end;
  v_file_provider := v_file ->> 'provider';
  v_file_bucket := nullif(btrim(v_file ->> 'bucket'), '');
  v_file_path := nullif(btrim(v_file ->> 'path'), '');
  v_file_sha256 := lower(coalesce(v_file ->> 'sha256', ''));
  v_file_stored_at := btrim(coalesce(v_file ->> 'stored_at', ''));
  v_legacy_data_url := case
    when jsonb_typeof(v_evidence -> 'file_data_url') = 'string'
      and v_evidence ->> 'file_data_url'
        ~ '^data:(application/pdf|image/(png|jpeg|webp));base64,'
      then v_evidence ->> 'file_data_url'
  end;

  if p_request_id is not null
     and (
       v_legacy_data_url is not null
       or (
         v_file_provider = 'legacy_private_table'
         and v_file ->> 'download_path'
           = '/api/admin/verification-requests/'
             || p_request_id::text || '/evidence'
       )
     ) then
    v_evidence_file := jsonb_strip_nulls(jsonb_build_object(
      'provider', 'legacy_private_table',
      'file_name', nullif(btrim(coalesce(p_evidence_file_name, '')), ''),
      'content_type', case
        when p_evidence_file_mime in (
          'application/pdf', 'image/png', 'image/jpeg', 'image/webp'
        ) then p_evidence_file_mime
      end,
      'byte_size', case
        when p_evidence_file_size between 1 and 10485760
          then p_evidence_file_size
      end,
      'download_path', '/api/admin/verification-requests/'
        || p_request_id::text || '/evidence'
    ));
  elsif v_file_provider in ('supabase_storage', 'local_file')
     and v_file_bucket is not null
     and length(v_file_bucket) <= 120
     and (
       (v_file_provider = 'local_file' and v_file_bucket = 'local')
       or (v_file_provider = 'supabase_storage' and v_file_bucket <> 'local')
     )
     and v_file_path is not null
     and length(v_file_path) <= 1024
     and left(v_file_path, 1) <> '/'
     and left(v_file_path, 1) <> pg_catalog.chr(92)
     and v_file_path !~ '(^|[\\/])\.\.([\\/]|$)'
     and nullif(btrim(coalesce(p_evidence_file_name, '')), '') is not null
     and p_evidence_file_name = v_file ->> 'file_name'
     and length(p_evidence_file_name) <= 255
     and p_evidence_file_mime in (
       'application/pdf', 'image/png', 'image/jpeg', 'image/webp'
     )
     and p_evidence_file_mime = v_file ->> 'content_type'
     and p_evidence_file_size between 1 and 10485760
     and jsonb_typeof(v_file -> 'byte_size') = 'number'
     and (v_file ->> 'byte_size') ~ '^[0-9]+$'
     and (v_file ->> 'byte_size')::bigint = p_evidence_file_size
     and v_file_sha256 ~ '^[0-9a-f]{64}$'
     and v_file_stored_at
       ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
     and pg_catalog.pg_input_is_valid(
       v_file_stored_at,
       'timestamp with time zone'
     )
     and p_request_id is not null then
    v_evidence_file := jsonb_build_object(
      'provider', v_file_provider,
      'bucket', v_file_bucket,
      'path', v_file_path,
      'file_name', p_evidence_file_name,
      'content_type', p_evidence_file_mime,
      'byte_size', p_evidence_file_size,
      'sha256', v_file_sha256,
      'stored_at', v_file_stored_at,
      'download_path', '/api/admin/verification-requests/'
        || p_request_id::text || '/evidence'
    );
  end if;

  -- A public-profile handle appeal is a first-party claim, not an automated
  -- provider decision. Keep only the fields required to operate the appeal.
  if v_evidence ->> 'request_type' = 'public_profile_handle_claim' then
    v_claimed_handle := lower(btrim(coalesce(
      v_evidence ->> 'claimed_handle',
      ''
    )));
    if v_claimed_handle !~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$' then
      v_claimed_handle := null;
    end if;
    v_alternate_handle := lower(btrim(coalesce(
      v_evidence ->> 'requested_alternate_handle',
      ''
    )));
    if v_alternate_handle <> ''
       and v_alternate_handle !~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$' then
      v_alternate_handle := null;
    elsif v_alternate_handle = '' then
      v_alternate_handle := null;
    end if;
    v_current_owner_profile_id := case
      when pg_catalog.pg_input_is_valid(
        v_evidence ->> 'current_owner_profile_id',
        'uuid'
      ) then lower(v_evidence ->> 'current_owner_profile_id')
    end;
    v_current_marketplace_profile_id := case
      when pg_catalog.pg_input_is_valid(
        v_evidence ->> 'current_marketplace_profile_id',
        'uuid'
      ) then lower(v_evidence ->> 'current_marketplace_profile_id')
    end;
    v_requested_by_profile_id := coalesce(
      p_profile_id::text,
      case when pg_catalog.pg_input_is_valid(
        v_evidence ->> 'requested_by_profile_id',
        'uuid'
      ) then lower(v_evidence ->> 'requested_by_profile_id')
      end
    );
    v_reason := nullif(left(btrim(coalesce(v_evidence ->> 'reason', '')), 4000), '');

    v_result := jsonb_build_object(
      'request_type', 'public_profile_handle_claim',
      'claim_type', 'platform_handle_conflict',
      'claimed_handle', v_claimed_handle,
      'claimed_profile_url', case
        when v_claimed_handle is not null
          then 'https://yeollock.me/' || v_claimed_handle
      end,
      'requested_alternate_handle', v_alternate_handle,
      'current_owner_profile_id', v_current_owner_profile_id,
      'current_marketplace_profile_id', v_current_marketplace_profile_id,
      'requested_by_profile_id', v_requested_by_profile_id,
      'submitted_from', 'public_profile_settings',
      'platform', p_platform,
      'platform_handle', case
        when v_platform_handle is not null and length(v_platform_handle) <= 160
          then v_platform_handle
      end,
      'platform_url', case
        when v_platform_url ~* '^https://'
          and length(v_platform_url) <= 2048
          and (
            (p_platform = 'youtube' and v_platform_url ~* '^https://(([^/@]+\.)*youtube\.com|([^/@]+\.)*youtu\.be)([/:?#]|$)')
            or (p_platform = 'naver_blog' and v_platform_url ~* '^https://([^/@]+\.)*blog\.naver\.com([/:?#]|$)')
          ) then v_platform_url
      end,
      'reason', v_reason,
      'created_at', case when p_created_at is not null then pg_catalog.to_char(
        p_created_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ) end
    );
    if v_evidence_file is not null then
      v_result := v_result || jsonb_build_object(
        'evidence_file', v_evidence_file
      );
    end if;
    return v_result;
  end if;

  v_existing_ownership := case
    when jsonb_typeof(v_evidence -> 'ownership_verification') = 'object'
      then v_evidence -> 'ownership_verification'
    else '{}'::jsonb
  end;
  v_existing_automation := case
    when jsonb_typeof(v_existing_ownership -> 'automation') = 'object'
      then v_existing_ownership -> 'automation'
    else '{}'::jsonb
  end;
  v_existing_decision := case
    when jsonb_typeof(v_existing_automation -> 'platform_account') = 'object'
      then v_existing_automation -> 'platform_account'
    else '{}'::jsonb
  end;

  v_provider := case p_platform
    when 'youtube' then 'youtube_data_api'
    else 'naver_search_api'
  end;
  v_mode := case
    when v_existing_decision ->> 'mode' in (
      'api_ready',
      'public_challenge',
      'manual_fallback',
      'oauth_required',
      'webhook_ready'
    ) then v_existing_decision ->> 'mode'
    else 'manual_fallback'
  end;
  v_decision_status := case p_status
    when 'not_run' then 'pending'
    when 'matched' then 'matched'
    when 'not_found' then 'not_found'
    when 'blocked' then 'blocked'
    else 'failed'
  end;
  v_check_status := case p_status
    when 'not_run' then 'not_run'
    when 'matched' then 'matched'
    when 'not_found' then 'not_found'
    when 'blocked' then 'blocked'
    else 'failed'
  end;
  v_checked_at := case when p_checked_at is not null then pg_catalog.to_char(
    p_checked_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) end;

  v_decision := jsonb_strip_nulls(jsonb_build_object(
    'provider', v_provider,
    'mode', v_mode,
    'status', v_decision_status,
    'checked_at', v_checked_at,
    'decision_source', 'transient_provider_check',
    'decision_rule_version', '2026-08-08.1',
    'provider_response_retained', false
  ));
  v_check := jsonb_strip_nulls(jsonb_build_object(
    'status', v_check_status,
    'checked_at', v_checked_at
  ));

  v_ownership := jsonb_strip_nulls(jsonb_build_object(
    'platform', p_platform,
    'platform_handle', case
      when v_platform_handle is not null and length(v_platform_handle) <= 160
        then v_platform_handle
    end,
    'platform_url', case
      when v_platform_url ~* '^https://'
        and length(v_platform_url) <= 2048
        and (
          (p_platform = 'youtube' and v_platform_url ~* '^https://(([^/@]+\.)*youtube\.com|([^/@]+\.)*youtu\.be)([/:?#]|$)')
          or (p_platform = 'naver_blog' and v_platform_url ~* '^https://([^/@]+\.)*blog\.naver\.com([/:?#]|$)')
        ) then v_platform_url
    end,
    'method', case
      when p_ownership_method in (
        'profile_bio_code',
        'public_post_code',
        'channel_description_code',
        'screenshot_review'
      ) then p_ownership_method
    end,
    'challenge_code', case
      when v_challenge_code ~ '^DS-[A-Z0-9]{4}-[A-Z0-9]{4}$'
        then v_challenge_code
    end,
    'challenge_url', case
      when v_challenge_url ~* '^https://'
        and length(v_challenge_url) <= 2048
        and (
          (p_platform = 'youtube' and v_challenge_url ~* '^https://(([^/@]+\.)*youtube\.com|([^/@]+\.)*youtu\.be)([/:?#]|$)')
          or (p_platform = 'naver_blog' and v_challenge_url ~* '^https://([^/@]+\.)*blog\.naver\.com([/:?#]|$)')
        ) then v_challenge_url
    end,
    'automated_check', v_check,
    'automation', jsonb_build_object(
      'platform_account', v_decision,
      'ownership_challenge', v_check
    )
  ));

  v_result := jsonb_build_object('ownership_verification', v_ownership);
  if v_evidence_file is not null then
    v_result := v_result || jsonb_build_object(
      'evidence_file', v_evidence_file
    );
  end if;
  return v_result;
end;
$$;

revoke all on function directsign_private.directsign_minimize_platform_verification_evidence(
  jsonb,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  integer,
  timestamptz
) from public, anon, authenticated;
grant execute on function directsign_private.directsign_minimize_platform_verification_evidence(
  jsonb,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  integer,
  timestamptz
) to service_role;

-- Four-argument compatibility helper for controlled maintenance calls. The
-- table CHECK below always uses the row-bound fifteen-argument overload.
create or replace function directsign_private.directsign_minimize_platform_verification_evidence(
  p_evidence jsonb,
  p_platform text,
  p_status text,
  p_checked_at timestamptz
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select directsign_private.directsign_minimize_platform_verification_evidence(
    p_evidence,
    null::uuid,
    p_platform,
    p_evidence #>> '{ownership_verification,platform_handle}',
    p_evidence #>> '{ownership_verification,platform_url}',
    null::uuid,
    p_evidence #>> '{ownership_verification,method}',
    p_evidence #>> '{ownership_verification,challenge_code}',
    p_evidence #>> '{ownership_verification,challenge_url}',
    p_status,
    p_checked_at,
    p_evidence #>> '{evidence_file,file_name}',
    p_evidence #>> '{evidence_file,content_type}',
    case
      when pg_catalog.pg_input_is_valid(
        p_evidence #>> '{evidence_file,byte_size}',
        'integer'
      )
        then (p_evidence #>> '{evidence_file,byte_size}')::integer
    end,
    p_checked_at
  )
$$;

revoke all on function directsign_private.directsign_minimize_platform_verification_evidence(
  jsonb,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
grant execute on function directsign_private.directsign_minimize_platform_verification_evidence(
  jsonb,
  text,
  text,
  timestamptz
) to service_role;

-- Replace the former NAVER self-report trigger in place. The trigger already
-- exists on this table; changing its target function body makes every future
-- insert/update neutralize deprecated NAVER metrics instead of recreating a
-- creator_self_report_required state.
create or replace function directsign_private.directsign_sanitize_naver_channel_self_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.platform::text = 'naver_blog'
     or new.follower_sync_source in (
       'creator_self_report',
       'creator_self_report_required',
       'naver_blog_public_visitor_counter'
     )
     or coalesce(new.follower_sync_metadata ->> 'provider', '')
       in ('creator_self_report', 'naver_blog_public_visitor_counter')
     or coalesce(new.follower_sync_metadata ->> 'metric', '')
       = 'average_daily_visitors_4d'
     or coalesce(new.follower_sync_metadata ->> 'trust', '') = 'self_reported'
     or position('자가신고' in coalesce(new.performance_label, '')) > 0 then
    new.follower_count := null;
    new.followers_label := '계정 연동';
    new.performance_label := '프로필에서 확인';
    new.follower_count_synced_at := null;
    new.follower_sync_status := 'not_synced';
    new.follower_sync_source := null;
    new.follower_sync_error := null;
    new.follower_sync_metadata := '{}'::jsonb;
  end if;

  return new;
end;
$$;

comment on function directsign_private.directsign_sanitize_naver_channel_self_report() is
  'Neutralizes deprecated NAVER provider/self-report metrics and prevents their reintroduction after verification evidence minimization.';

-- The latest Product Owner retention allowlist excludes the former NAVER
-- visitor self-report from both the structured column and JSON snapshot.
update public.verification_requests as request
set naver_blog_recent_4d_average_visitors = null
where request.target_type::text = 'influencer_account'
  and request.verification_type::text = 'platform_account'
  and request.platform::text in ('youtube', 'naver_blog')
  and request.naver_blog_recent_4d_average_visitors is not null;

update public.verification_requests as request
set evidence_snapshot_json =
  directsign_private.directsign_minimize_platform_verification_evidence(
    request.evidence_snapshot_json,
    request.id,
    request.platform::text,
    request.platform_handle,
    request.platform_url,
    request.profile_id,
    request.ownership_verification_method::text,
    request.ownership_challenge_code,
    request.ownership_challenge_url,
    request.ownership_check_status::text,
    request.ownership_checked_at,
    request.evidence_file_name,
    request.evidence_file_mime,
    request.evidence_file_size,
    request.created_at
  )
where request.target_type::text = 'influencer_account'
  and request.verification_type::text = 'platform_account'
  and request.platform::text in ('youtube', 'naver_blog');

alter table public.verification_requests
  drop constraint if exists verification_requests_minimized_provider_evidence;
alter table public.verification_requests
  add constraint verification_requests_minimized_provider_evidence check (
    target_type::text <> 'influencer_account'
    or verification_type::text <> 'platform_account'
    or platform::text not in ('youtube', 'naver_blog')
    or (
      naver_blog_recent_4d_average_visitors is null
      and evidence_snapshot_json =
        directsign_private.directsign_minimize_platform_verification_evidence(
          evidence_snapshot_json,
          id,
          platform::text,
          platform_handle,
          platform_url,
          profile_id,
          ownership_verification_method::text,
          ownership_challenge_code,
          ownership_challenge_url,
          ownership_check_status::text,
          ownership_checked_at,
          evidence_file_name,
          evidence_file_mime,
          evidence_file_size,
          created_at
        )
    )
  ) not valid;
alter table public.verification_requests
  validate constraint verification_requests_minimized_provider_evidence;

do $$
begin
  if exists (
    select 1
    from public.verification_requests as request
    where request.target_type::text = 'influencer_account'
      and request.platform::text in ('youtube', 'naver_blog')
      and request.ownership_challenge_code is not null
      and (request.data_origin is null or request.data_origin = 'production')
    group by request.ownership_challenge_code
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate production YouTube/NAVER ownership challenge codes must be resolved before migration',
      constraint = 'verification_requests_production_platform_challenge_unique';
  end if;
end;
$$;

create unique index if not exists verification_requests_production_platform_challenge_unique
  on public.verification_requests (ownership_challenge_code)
  where target_type = 'influencer_account'
    and platform in ('youtube', 'naver_blog')
    and ownership_challenge_code is not null
    and (data_origin is null or data_origin = 'production');

comment on index public.verification_requests_production_platform_challenge_unique is
  'Prevents a production YouTube/NAVER ownership challenge from approving more than one verification request.';

create temporary table directsign_minimized_platform_profiles (
  profile_id uuid primary key
) on commit drop;

insert into directsign_minimized_platform_profiles (profile_id)
select distinct channel.profile_id
from public.marketplace_influencer_channels as channel
where channel.platform::text in ('youtube', 'naver_blog');

update public.marketplace_influencer_channels as channel
set
  follower_count = null,
  followers_label = '계정 연동',
  performance_label = '프로필에서 확인',
  follower_count_synced_at = null,
  follower_sync_status = 'not_synced',
  follower_sync_source = null,
  follower_sync_error = null,
  follower_sync_metadata = '{}'::jsonb,
  updated_at = clock_timestamp()
where channel.profile_id in (
  select minimized.profile_id
  from directsign_minimized_platform_profiles as minimized
)
  and channel.platform::text in ('youtube', 'naver_blog');

delete from public.marketplace_follower_sync_events as event
where event.platform::text in ('youtube', 'naver_blog');

alter table public.marketplace_follower_sync_events
  drop constraint if exists marketplace_follower_sync_events_no_minimized_platforms;
alter table public.marketplace_follower_sync_events
  add constraint marketplace_follower_sync_events_no_minimized_platforms
  check (platform not in ('youtube', 'naver_blog')) not valid;
alter table public.marketplace_follower_sync_events
  validate constraint marketplace_follower_sync_events_no_minimized_platforms;

comment on constraint marketplace_follower_sync_events_no_minimized_platforms
  on public.marketplace_follower_sync_events is
  'Follower-sync evidence must never be retained for minimized YouTube or NAVER platforms.';

do $$
declare
  v_owner_profile_id uuid;
begin
  for v_owner_profile_id in
    select distinct profile.owner_profile_id
    from public.marketplace_influencer_profiles as profile
    join directsign_minimized_platform_profiles as minimized
      on minimized.profile_id = profile.id
    where profile.owner_profile_id is not null
  loop
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
  end loop;
end;
$$;

comment on function directsign_private.directsign_minimize_platform_verification_evidence(
  jsonb,
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  integer,
  timestamptz
) is
  'Reconstructs a row-bound first-party YouTube/NAVER verification or handle-claim snapshot and removes provider responses, hashes, HTTP details, provider metrics, and NAVER self-reports.';

create or replace function directsign_private.directsign_sanitize_naver_channel_self_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.platform::text in ('youtube', 'naver_blog') then
    new.follower_count := null;
    new.followers_label := '계정 연동';
    new.performance_label := '프로필에서 확인';
    new.follower_count_synced_at := null;
    new.follower_sync_status := 'not_synced';
    new.follower_sync_source := null;
    new.follower_sync_error := null;
    new.follower_sync_metadata := '{}'::jsonb;
  end if;
  return new;
end;
$$;

comment on function directsign_private.directsign_sanitize_naver_channel_self_report() is
  'Neutralizes every YouTube/NAVER follower metric and provenance field regardless of source and prevents re-entry.';

revoke all on function directsign_private.directsign_sanitize_naver_channel_self_report()
  from public, anon, authenticated, service_role;

create table if not exists directsign_private.influencer_ownership_challenge_consumptions (
  challenge_id uuid primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null,
  code_digest text not null,
  platform_handle_hash text not null,
  platform_url_hash text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default clock_timestamp(),
  constraint influencer_ownership_challenge_platform check (
    platform in ('instagram', 'youtube', 'tiktok', 'naver_blog', 'other')
  ),
  constraint influencer_ownership_challenge_code_digest check (
    code_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint influencer_ownership_challenge_handle_hash check (
    platform_handle_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint influencer_ownership_challenge_url_hash check (
    platform_url_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint influencer_ownership_challenge_exact_ttl check (
    expires_at = issued_at + interval '30 minutes'
  ),
  constraint influencer_ownership_challenge_consumed_window check (
    consumed_at >= issued_at - interval '30 seconds'
    and consumed_at < expires_at
  )
);

create index if not exists influencer_ownership_challenge_expiry_idx
  on directsign_private.influencer_ownership_challenge_consumptions (expires_at);

revoke all on table directsign_private.influencer_ownership_challenge_consumptions
  from public, anon, authenticated, service_role;

create or replace function public.consume_influencer_ownership_challenge(
  p_challenge_id uuid,
  p_profile_id uuid,
  p_platform text,
  p_code_digest text,
  p_platform_handle_hash text,
  p_platform_url_hash text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_challenge_id is null
     or p_profile_id is null
     or p_platform not in ('instagram', 'youtube', 'tiktok', 'naver_blog', 'other')
     or coalesce(p_code_digest, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_platform_handle_hash, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_platform_url_hash, '') !~ '^[0-9a-f]{64}$'
     or p_issued_at is null
     or p_expires_at is null
     or p_expires_at <> p_issued_at + interval '30 minutes'
     or p_issued_at > v_now + interval '30 seconds' then
    return jsonb_build_object('consumed', false, 'reason', 'invalid_time');
  end if;
  if p_expires_at <= v_now then
    return jsonb_build_object('consumed', false, 'reason', 'expired');
  end if;

  insert into directsign_private.influencer_ownership_challenge_consumptions (
    challenge_id,
    profile_id,
    platform,
    code_digest,
    platform_handle_hash,
    platform_url_hash,
    issued_at,
    expires_at,
    consumed_at
  ) values (
    p_challenge_id,
    p_profile_id,
    p_platform,
    p_code_digest,
    p_platform_handle_hash,
    p_platform_url_hash,
    p_issued_at,
    p_expires_at,
    v_now
  )
  on conflict (challenge_id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'consumed', v_inserted = 1,
    'reason', case when v_inserted = 1 then 'consumed' else 'already_consumed' end
  );
end;
$$;

revoke all on function public.consume_influencer_ownership_challenge(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_influencer_ownership_challenge(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz
) to service_role;

create or replace function public.cleanup_influencer_ownership_challenges(
  p_now timestamptz,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_deleted integer := 0;
  v_backlog integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'cleanup limit must be between 1 and 500';
  end if;

  with candidates as (
    select ledger.challenge_id
    from directsign_private.influencer_ownership_challenge_consumptions as ledger
    where ledger.expires_at < v_now - interval '1 day'
    order by ledger.expires_at, ledger.challenge_id
    limit p_limit
    for update skip locked
  )
  delete from directsign_private.influencer_ownership_challenge_consumptions as ledger
  using candidates
  where ledger.challenge_id = candidates.challenge_id;
  get diagnostics v_deleted = row_count;

  select count(*)::integer into v_backlog
  from directsign_private.influencer_ownership_challenge_consumptions as ledger
  where ledger.expires_at < v_now - interval '1 day';

  return jsonb_build_object('deleted', v_deleted, 'backlog', v_backlog);
end;
$$;

revoke all on function public.cleanup_influencer_ownership_challenges(
  timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.cleanup_influencer_ownership_challenges(
  timestamptz, integer
) to service_role;

create or replace function public.enqueue_verification_storage_compensation(
  p_request_id uuid,
  p_bucket text,
  p_object_path text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_queue_id uuid;
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_request_id is null
     or btrim(coalesce(p_bucket, '')) = ''
     or length(p_bucket) > 120
     or p_bucket !~ '^[A-Za-z0-9._-]+$'
     or coalesce(p_object_path, '') !~ '^(verification-advertiser|verification-influencer)/[a-z0-9._-]+/[a-z0-9._-]+$'
     or coalesce(p_error_code, '') !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'invalid verification storage compensation target';
  end if;

  insert into public.privacy_storage_deletion_queue (
    source_type,
    source_id,
    category,
    bucket,
    object_path,
    due_at,
    status,
    available_at,
    last_error_code,
    created_at,
    updated_at
  ) values (
    'verification_request',
    p_request_id::text,
    'verification',
    p_bucket,
    p_object_path,
    v_now,
    'pending',
    v_now,
    p_error_code,
    v_now,
    v_now
  )
  on conflict (source_type, source_id, bucket, object_path) do update
  set
    status = case
      when public.privacy_storage_deletion_queue.status = 'completed'
        then 'completed'
      else 'pending'
    end,
    available_at = least(public.privacy_storage_deletion_queue.available_at, v_now),
    lease_owner = null,
    lease_expires_at = null,
    authorized_at = null,
    authorization_expires_at = null,
    last_error_code = p_error_code,
    updated_at = v_now
  returning id, status into v_queue_id, v_status;

  return jsonb_build_object(
    'queued', v_status in ('pending', 'failed'),
    'queue_id', v_queue_id
  );
end;
$$;

revoke all on function public.enqueue_verification_storage_compensation(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.enqueue_verification_storage_compensation(
  uuid, text, text, text
) to service_role;

create table if not exists directsign_private.naver_search_verification_daily_usage (
  usage_date_kst date primary key,
  used integer not null default 0,
  endpoints jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  constraint naver_search_verification_daily_usage_used_nonnegative check (used >= 0),
  constraint naver_search_verification_daily_usage_endpoints_object check (
    jsonb_typeof(endpoints) = 'object'
  )
);

revoke all on table directsign_private.naver_search_verification_daily_usage
  from public, anon, authenticated, service_role;

create or replace function public.reserve_naver_search_verification_request(
  p_endpoint text,
  p_daily_limit integer,
  p_budget_ratio numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_date_kst date;
  v_expires_at timestamptz;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_cap integer;
  v_used integer;
  v_endpoints jsonb;
begin
  if v_endpoint not in ('blog_verification') then
    raise exception using errcode = '22023', message = 'invalid naver search endpoint';
  end if;
  if p_daily_limit is null
     or p_daily_limit < 1
     or p_daily_limit > 1000000
     or p_budget_ratio is null
     or p_budget_ratio <= 0
     or p_budget_ratio > 0.05 then
    raise exception using errcode = '22023', message = 'invalid naver search budget';
  end if;

  v_cap := floor(p_daily_limit::numeric * p_budget_ratio)::integer;
  if v_cap < 1 then
    raise exception using errcode = '22023', message = 'invalid naver search cap';
  end if;

  -- A single transaction lock must precede the wall-clock read. Otherwise a
  -- request waiting across KST midnight can reserve against yesterday's row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('naver_search_verification_daily_usage', 0)
  );
  v_now := clock_timestamp();
  v_date_kst := (v_now at time zone 'Asia/Seoul')::date;
  v_expires_at := ((v_date_kst + 1)::timestamp at time zone 'Asia/Seoul');

  delete from directsign_private.naver_search_verification_daily_usage as usage
  where usage.usage_date_kst < v_date_kst - 31;

  insert into directsign_private.naver_search_verification_daily_usage (
    usage_date_kst,
    used,
    endpoints,
    updated_at
  ) values (
    v_date_kst,
    0,
    '{}'::jsonb,
    v_now
  )
  on conflict (usage_date_kst) do nothing;

  select usage.used, usage.endpoints
  into v_used, v_endpoints
  from directsign_private.naver_search_verification_daily_usage as usage
  where usage.usage_date_kst = v_date_kst
  for update;

  if v_used >= v_cap then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'budget_exhausted',
      'date_kst', v_date_kst,
      'expires_at', to_char(
        v_expires_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'cap', v_cap,
      'used', v_used,
      'remaining', 0
    );
  end if;

  v_used := v_used + 1;
  v_endpoints := jsonb_set(
    coalesce(v_endpoints, '{}'::jsonb),
    array[v_endpoint],
    to_jsonb(coalesce((v_endpoints ->> v_endpoint)::integer, 0) + 1),
    true
  );
  update directsign_private.naver_search_verification_daily_usage as usage
  set
    used = v_used,
    endpoints = v_endpoints,
    updated_at = v_now
  where usage.usage_date_kst = v_date_kst;

  return jsonb_build_object(
    'allowed', true,
    'date_kst', v_date_kst,
    'expires_at', to_char(
      v_expires_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'cap', v_cap,
    'used', v_used,
    'remaining', greatest(v_cap - v_used, 0),
    'reserved', 1
  );
end;
$$;

revoke all on function public.reserve_naver_search_verification_request(
  text,
  integer,
  numeric
) from public, anon, authenticated;
grant execute on function public.reserve_naver_search_verification_request(
  text,
  integer,
  numeric
) to service_role;

comment on function public.reserve_naver_search_verification_request(
  text,
  integer,
  numeric
) is
  'Atomically reserves a non-identifying NAVER Search verification quota slot using the KST calendar day.';

notify pgrst, 'reload schema';

commit;
