-- Naver Blog visitor counts are creator self-reports only. Keep their metric
-- meaning and trust visible, and exclude them from subscriber/follower sorts.

create or replace function directsign_private.directsign_naver_self_report_request_is_authoritative(
  p_request_id uuid,
  p_owner_profile_id uuid,
  p_handle text,
  p_count bigint,
  p_checked_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_request_id is not null
    and p_owner_profile_id is not null
    and btrim(coalesce(p_handle, '')) <> ''
    and p_count between 0 and 9007199254740991
    and p_checked_at is not null
    and directsign_private.directsign_is_operational_profile(
      p_owner_profile_id,
      'influencer'
    )
    and exists (
      select 1
      from public.verification_requests as request_row
      where request_row.id = p_request_id
        and request_row.target_type::text = 'influencer_account'
        and request_row.verification_type::text = 'platform_account'
        and request_row.platform::text = 'naver_blog'
        and request_row.status::text = 'approved'
        and request_row.reviewed_at is not null
        and request_row.data_origin = 'production'
        and request_row.naver_blog_recent_4d_average_visitors = p_count
        and request_row.created_at = p_checked_at
        and lower(regexp_replace(
          btrim(coalesce(request_row.platform_handle, '')),
          '^@+',
          ''
        )) = lower(regexp_replace(btrim(p_handle), '^@+', ''))
        and (
          request_row.profile_id is null
          or request_row.profile_id = p_owner_profile_id
        )
        and (
          btrim(coalesce(request_row.target_id, '')) = ''
          or directsign_private.directsign_uuid_or_null(
            request_row.target_id
          ) = p_owner_profile_id
        )
        and (
          request_row.profile_id is not null
          or directsign_private.directsign_uuid_or_null(
            request_row.target_id
          ) is not null
        )
        and coalesce(
          request_row.evidence_snapshot_json #>>
            '{self_reported_channel_metric,status}',
          ''
        ) = 'available'
        and coalesce(
          request_row.evidence_snapshot_json #>>
            '{self_reported_channel_metric,platform}',
          ''
        ) = 'naver_blog'
        and coalesce(
          request_row.evidence_snapshot_json #>>
            '{self_reported_channel_metric,metric}',
          ''
        ) = 'average_daily_visitors_4d'
        and coalesce(
          request_row.evidence_snapshot_json #>>
            '{self_reported_channel_metric,value}',
          ''
        ) = p_count::text
        and coalesce(
          request_row.evidence_snapshot_json #>>
            '{self_reported_channel_metric,period_days}',
          ''
        ) = '4'
        and coalesce(
          request_row.evidence_snapshot_json #>>
            '{self_reported_channel_metric,source}',
          ''
        ) = 'creator_self_report'
        and coalesce(
          request_row.evidence_snapshot_json #>>
            '{self_reported_channel_metric,trust}',
          ''
        ) = 'self_reported'
        and lower(regexp_replace(
          btrim(coalesce(
            request_row.evidence_snapshot_json #>>
              '{self_reported_channel_metric,reported_handle}',
            ''
          )),
          '^@+',
          ''
        )) = lower(regexp_replace(btrim(p_handle), '^@+', ''))
        and case
          when pg_catalog.pg_input_is_valid(
            nullif(
              request_row.evidence_snapshot_json #>>
                '{self_reported_channel_metric,reported_at}',
              ''
            ),
            'timestamp with time zone'
          ) then (
            request_row.evidence_snapshot_json #>>
              '{self_reported_channel_metric,reported_at}'
          )::timestamptz = p_checked_at
          else false
        end
        and (
          btrim(coalesce(request_row.submitted_by_email, '')) = ''
          or directsign_private.directsign_email_is_operational(
            request_row.submitted_by_email
          )
        )
        and not directsign_private.directsign_has_test_marker(concat_ws(
          ' ',
          request_row.subject_name,
          request_row.submitted_by_name,
          request_row.platform_handle,
          request_row.platform_url,
          request_row.note,
          request_row.reviewer_note
        ))
        and lower(coalesce(
          request_row.evidence_snapshot_json,
          '{}'::jsonb
        )::text) !~ '"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"[[:space:]]*:[[:space:]]*(true|"true"|1|"1")'
    );
$$;

create or replace function directsign_private.directsign_channel_has_naver_self_report_provenance(
  p_platform text,
  p_followers_label text,
  p_performance_label text,
  p_sync_source text,
  p_metadata jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(p_platform, '') = 'naver_blog'
    or coalesce(p_sync_source, '') in (
      'creator_self_report',
      'creator_self_report_required',
      'naver_blog_public_visitor_counter'
    )
    or coalesce(p_metadata ->> 'provider', '') = 'creator_self_report'
    or coalesce(p_metadata ->> 'metric', '') = 'average_daily_visitors_4d'
    or coalesce(p_metadata ->> 'trust', '') = 'self_reported'
    or coalesce(p_followers_label, '')
      ~ '^일평균[[:space:]]+[0-9][0-9,]*명$'
    or position('자가신고' in coalesce(p_performance_label, '')) > 0;
$$;

create or replace function directsign_private.directsign_sanitize_naver_channel_self_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_profile_id uuid;
  v_request_id uuid;
  v_checked_at timestamptz;
  v_valid boolean := false;
  v_requires_non_naver_reset boolean;
begin
  v_requires_non_naver_reset :=
    directsign_private.directsign_channel_has_naver_self_report_provenance(
      new.platform::text,
      new.followers_label,
      new.performance_label,
      new.follower_sync_source,
      new.follower_sync_metadata
    );
  if tg_op = 'UPDATE' then
    v_requires_non_naver_reset := v_requires_non_naver_reset
      or directsign_private.directsign_channel_has_naver_self_report_provenance(
        old.platform::text,
        old.followers_label,
        old.performance_label,
        old.follower_sync_source,
        old.follower_sync_metadata
      );
  end if;

  if new.platform::text <> 'naver_blog' then
    if v_requires_non_naver_reset then
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
  end if;

  select marketplace_profile.owner_profile_id
  into v_owner_profile_id
  from public.marketplace_influencer_profiles as marketplace_profile
  where marketplace_profile.id = new.profile_id
    and marketplace_profile.data_origin = 'production';

  v_request_id := directsign_private.directsign_uuid_or_null(
    new.follower_sync_metadata ->> 'request_id'
  );
  if new.follower_count between 0 and 9007199254740991
     and new.follower_sync_source = 'creator_self_report'
     and coalesce(new.follower_sync_metadata ->> 'provider', '') = 'creator_self_report'
     and coalesce(new.follower_sync_metadata ->> 'metric', '') = 'average_daily_visitors_4d'
     and coalesce(new.follower_sync_metadata ->> 'trust', '') = 'self_reported'
     and coalesce(new.follower_sync_metadata ->> 'period_days', '') = '4'
     and coalesce(new.follower_sync_metadata ->> 'account_approved', '') = 'true'
     and coalesce(new.follower_sync_metadata ->> 'availability', '') = 'available'
     and lower(regexp_replace(
       btrim(coalesce(new.follower_sync_metadata ->> 'reported_handle', '')),
       '^@+',
       ''
     )) = lower(regexp_replace(btrim(new.handle), '^@+', ''))
     and new.follower_count_synced_at is not null
     and pg_catalog.pg_input_is_valid(
       nullif(new.follower_sync_metadata ->> 'checked_at', ''),
       'timestamp with time zone'
     )
     and v_request_id is not null
     and v_owner_profile_id is not null then
    v_checked_at := (new.follower_sync_metadata ->> 'checked_at')::timestamptz;

    v_valid := directsign_private.directsign_naver_self_report_request_is_authoritative(
      v_request_id,
      v_owner_profile_id,
      new.handle,
      new.follower_count,
      v_checked_at
    ) and new.follower_count_synced_at = v_checked_at;
  end if;

  if v_valid then
    new.followers_label := '일평균 ' || pg_catalog.to_char(
      new.follower_count::numeric,
      'FM999,999,999,999,999,999'
    ) || '명';
    new.performance_label := '최근 4일 평균 · 자가신고';
    new.follower_sync_status := 'synced';
    new.follower_sync_error := null;
  else
    new.follower_count := null;
    new.followers_label := '계정 연동';
    new.performance_label := '자가신고 미입력';
    new.follower_count_synced_at := null;
    new.follower_sync_status := 'skipped';
    new.follower_sync_source := 'creator_self_report_required';
    new.follower_sync_error := null;
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_naver_channel_self_report_sanitizer
  on public.marketplace_influencer_channels;
create trigger marketplace_naver_channel_self_report_sanitizer
before insert or update of
  profile_id,
  platform,
  handle,
  followers_label,
  performance_label,
  follower_count,
  follower_count_synced_at,
  follower_sync_status,
  follower_sync_source,
  follower_sync_metadata
on public.marketplace_influencer_channels
for each row execute function
  directsign_private.directsign_sanitize_naver_channel_self_report();

create or replace function directsign_private.directsign_sanitize_registered_naver_metrics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel jsonb;
  v_channels jsonb := '[]'::jsonb;
  v_handle text;
  v_count bigint;
  v_source text;
  v_metadata jsonb;
  v_synced_at timestamptz;
  v_request_id uuid;
begin
  for v_channel in
    select item.value
    from jsonb_array_elements(coalesce(new.verified_channels, '[]'::jsonb))
      as item(value)
  loop
    if coalesce(v_channel ->> 'platform', '') = 'naver_blog' then
      v_handle := lower(regexp_replace(
        btrim(coalesce(v_channel ->> 'handle', '')),
        '^@+',
        ''
      ));
      v_count := null;
      v_source := null;
      v_metadata := null;
      v_synced_at := null;
      v_request_id := null;

      select
        channel.follower_count,
        channel.follower_sync_source,
        channel.follower_sync_metadata,
        channel.follower_count_synced_at
      into v_count, v_source, v_metadata, v_synced_at
      from public.marketplace_influencer_channels as channel
      where channel.profile_id = new.public_marketplace_profile_id
        and channel.platform::text = 'naver_blog'
        and lower(regexp_replace(btrim(channel.handle), '^@+', '')) = v_handle
      order by channel.updated_at desc, channel.id desc
      limit 1;

      v_channel := v_channel
        - 'follower_count'
        - 'metric_type'
        - 'metric_source'
        - 'metric_trust'
        - 'metric_period_days';

      v_request_id := directsign_private.directsign_uuid_or_null(
        v_metadata ->> 'request_id'
      );

      if v_source = 'creator_self_report'
         and v_count between 0 and 9007199254740991
         and coalesce(v_metadata ->> 'provider', '') = 'creator_self_report'
         and coalesce(v_metadata ->> 'metric', '') = 'average_daily_visitors_4d'
         and coalesce(v_metadata ->> 'trust', '') = 'self_reported'
         and coalesce(v_metadata ->> 'period_days', '') = '4'
         and coalesce(v_metadata ->> 'account_approved', '') = 'true'
         and coalesce(v_metadata ->> 'availability', '') = 'available'
         and lower(regexp_replace(
           btrim(coalesce(v_metadata ->> 'reported_handle', '')),
           '^@+',
           ''
         )) = v_handle
         and v_synced_at is not null
         and pg_catalog.pg_input_is_valid(
           nullif(v_metadata ->> 'checked_at', ''),
           'timestamp with time zone'
         )
         and (v_metadata ->> 'checked_at')::timestamptz = v_synced_at
         and v_request_id is not null
         and directsign_private.directsign_naver_self_report_request_is_authoritative(
           v_request_id,
           new.owner_profile_id,
           v_handle,
           v_count,
           v_synced_at
         ) then
        v_channel := v_channel || jsonb_build_object(
          'follower_count', v_count,
          'metric_type', 'average_daily_visitors_4d',
          'metric_source', 'creator_self_report',
          'metric_trust', 'self_reported',
          'metric_period_days', 4
        );
      end if;
    end if;

    v_channels := v_channels || jsonb_build_array(v_channel);
  end loop;

  new.verified_channels := v_channels;
  new.audience_counts := coalesce(new.audience_counts, '{}'::jsonb) - 'naver_blog';
  select max(metric.value::bigint)
  into new.max_audience_count
  from jsonb_each_text(new.audience_counts) as metric(key, value)
  where metric.value ~ '^(0|[1-9][0-9]{0,18})$';
  return new;
end;
$$;

drop trigger if exists marketplace_registered_naver_metric_sanitizer
  on public.marketplace_registered_influencer_directory;
create trigger marketplace_registered_naver_metric_sanitizer
before insert or update of
  owner_profile_id,
  verified_channels,
  audience_counts,
  max_audience_count,
  public_marketplace_profile_id
on public.marketplace_registered_influencer_directory
for each row execute function
  directsign_private.directsign_sanitize_registered_naver_metrics();

create or replace function directsign_private.directsign_refresh_registered_naver_metric_from_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_owner_profile_id uuid;
  v_related boolean;
begin
  v_related :=
    directsign_private.directsign_channel_has_naver_self_report_provenance(
      old.platform::text,
      old.followers_label,
      old.performance_label,
      old.follower_sync_source,
      old.follower_sync_metadata
    )
    or directsign_private.directsign_channel_has_naver_self_report_provenance(
      new.platform::text,
      new.followers_label,
      new.performance_label,
      new.follower_sync_source,
      new.follower_sync_metadata
    )
    or (
      old.follower_count is not null
      and new.follower_count is null
      and new.follower_sync_source is null
      and new.follower_sync_status = 'not_synced'
    );
  if not v_related then
    return new;
  end if;

  for v_profile_id in
    select distinct candidate_profile_id
    from unnest(array[old.profile_id, new.profile_id]) as candidate_profile_id
    where candidate_profile_id is not null
  loop
    v_owner_profile_id := null;
    select marketplace_profile.owner_profile_id
    into v_owner_profile_id
    from public.marketplace_influencer_profiles as marketplace_profile
    where marketplace_profile.id = v_profile_id
      and marketplace_profile.data_origin = 'production';

    if v_owner_profile_id is not null then
      perform directsign_private.directsign_refresh_registered_member_discovery(
        v_owner_profile_id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists marketplace_naver_channel_metric_refresh
  on public.marketplace_influencer_channels;
create trigger marketplace_naver_channel_metric_refresh
after update of
  platform,
  followers_label,
  performance_label,
  follower_count,
  follower_count_synced_at,
  follower_sync_status,
  follower_sync_source,
  follower_sync_error,
  follower_sync_metadata
on public.marketplace_influencer_channels
for each row execute function
  directsign_private.directsign_refresh_registered_naver_metric_from_channel();

create or replace function directsign_private.directsign_exclude_naver_from_public_audience_sort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.audience_counts := coalesce(new.audience_counts, '{}'::jsonb) - 'naver_blog';
  select max(metric.value::bigint)
  into new.max_audience_count
  from jsonb_each_text(new.audience_counts) as metric(key, value)
  where metric.value ~ '^(0|[1-9][0-9]{0,18})$';
  return new;
end;
$$;

drop trigger if exists marketplace_public_naver_audience_sort_exclusion
  on public.marketplace_public_influencer_directory;
create trigger marketplace_public_naver_audience_sort_exclusion
before insert or update of audience_counts, max_audience_count
on public.marketplace_public_influencer_directory
for each row execute function
  directsign_private.directsign_exclude_naver_from_public_audience_sort();

create or replace function directsign_private.directsign_revoke_naver_self_report_on_verification_loss()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_profile_id uuid;
  v_owner_profile_ids uuid[] := '{}'::uuid[];
begin
  select coalesce(
    array_agg(distinct marketplace_profile.owner_profile_id),
    '{}'::uuid[]
  )
  into v_owner_profile_ids
  from public.marketplace_influencer_channels as channel
  join public.marketplace_influencer_profiles as marketplace_profile
    on marketplace_profile.id = channel.profile_id
  where channel.platform::text = 'naver_blog'
    and channel.follower_sync_source in (
      'creator_self_report',
      'creator_self_report_required'
    )
    and coalesce(channel.follower_sync_metadata ->> 'request_id', '') = old.id::text
    and not directsign_private.directsign_naver_self_report_request_is_authoritative(
      old.id,
      marketplace_profile.owner_profile_id,
      channel.handle,
      channel.follower_count,
      channel.follower_count_synced_at
    );

  update public.marketplace_influencer_channels as channel
  set
    follower_count = null,
    followers_label = '계정 연동',
    performance_label = '자가신고 미입력',
    follower_count_synced_at = null,
    follower_sync_status = 'skipped',
    follower_sync_source = 'creator_self_report_required',
    follower_sync_error = null,
    follower_sync_metadata = coalesce(channel.follower_sync_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'approval_revoked', true,
        'approval_revoked_at', clock_timestamp()
      ),
    updated_at = clock_timestamp()
  from public.marketplace_influencer_profiles as marketplace_profile
  where channel.profile_id = marketplace_profile.id
    and channel.platform::text = 'naver_blog'
    and channel.follower_sync_source in (
      'creator_self_report',
      'creator_self_report_required'
    )
    and coalesce(channel.follower_sync_metadata ->> 'request_id', '') = old.id::text
    and not directsign_private.directsign_naver_self_report_request_is_authoritative(
      old.id,
      marketplace_profile.owner_profile_id,
      channel.handle,
      channel.follower_count,
      channel.follower_count_synced_at
    );

  foreach v_owner_profile_id in array v_owner_profile_ids
  loop
    perform directsign_private.directsign_refresh_registered_member_discovery(
      v_owner_profile_id
    );
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists verification_requests_revoke_naver_self_report_metric
  on public.verification_requests;
create trigger verification_requests_revoke_naver_self_report_metric
after delete or update of
  id,
  target_type,
  target_id,
  verification_type,
  status,
  profile_id,
  platform,
  platform_handle,
  platform_url,
  reviewed_at,
  data_origin,
  naver_blog_recent_4d_average_visitors,
  evidence_snapshot_json,
  created_at,
  submitted_by_email,
  subject_name,
  submitted_by_name,
  note,
  reviewer_note
on public.verification_requests
for each row execute function
  directsign_private.directsign_revoke_naver_self_report_on_verification_loss();

-- Hide every legacy undocumented-counter value from customer-facing channels.
-- Existing restricted metadata remains available only as an internal audit.
update public.marketplace_influencer_channels as channel
set
  follower_count = null,
  followers_label = '계정 연동',
  performance_label = '자가신고 미입력',
  follower_count_synced_at = null,
  follower_sync_status = 'skipped',
  follower_sync_source = 'creator_self_report_required',
  follower_sync_error = null,
  follower_sync_metadata = coalesce(channel.follower_sync_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'legacy_unofficial_metric_hidden', true,
      'legacy_unofficial_metric_hidden_at', clock_timestamp()
    ),
  updated_at = clock_timestamp()
where channel.platform::text = 'naver_blog'
  and channel.follower_sync_source = 'naver_blog_public_visitor_counter';

-- Revalidate every existing Naver channel and remove any self-report tuple that
-- was previously copied onto another platform.
update public.marketplace_influencer_channels
set follower_count = follower_count
where directsign_private.directsign_channel_has_naver_self_report_provenance(
  platform::text,
  followers_label,
  performance_label,
  follower_sync_source,
  follower_sync_metadata
);

-- Re-run both read-model sanitizers for already materialized rows.
update public.marketplace_registered_influencer_directory
set
  verified_channels = verified_channels,
  audience_counts = audience_counts,
  max_audience_count = max_audience_count
where 'naver_blog' = any(platforms);

update public.marketplace_public_influencer_directory
set
  audience_counts = audience_counts,
  max_audience_count = max_audience_count
where 'naver_blog' = any(platforms)
   or audience_counts ? 'naver_blog';

-- The previous batch RPC must no longer be callable or present.
drop function if exists public.apply_discovered_naver_blog_visitor_metrics_v2(jsonb);
drop function if exists public.apply_discovered_naver_blog_visitor_metrics(jsonb);

revoke all on function
  directsign_private.directsign_naver_self_report_request_is_authoritative(
    uuid,
    uuid,
    text,
    bigint,
    timestamptz
  ),
  directsign_private.directsign_channel_has_naver_self_report_provenance(
    text,
    text,
    text,
    text,
    jsonb
  ),
  directsign_private.directsign_sanitize_naver_channel_self_report(),
  directsign_private.directsign_sanitize_registered_naver_metrics(),
  directsign_private.directsign_refresh_registered_naver_metric_from_channel(),
  directsign_private.directsign_exclude_naver_from_public_audience_sort(),
  directsign_private.directsign_revoke_naver_self_report_on_verification_loss()
from public, anon, authenticated;

grant execute on function
  directsign_private.directsign_naver_self_report_request_is_authoritative(
    uuid,
    uuid,
    text,
    bigint,
    timestamptz
  ),
  directsign_private.directsign_channel_has_naver_self_report_provenance(
    text,
    text,
    text,
    text,
    jsonb
  ),
  directsign_private.directsign_sanitize_naver_channel_self_report(),
  directsign_private.directsign_sanitize_registered_naver_metrics(),
  directsign_private.directsign_refresh_registered_naver_metric_from_channel(),
  directsign_private.directsign_exclude_naver_from_public_audience_sort(),
  directsign_private.directsign_revoke_naver_self_report_on_verification_loss()
to service_role;

comment on function directsign_private.directsign_sanitize_registered_naver_metrics() is
  'Adds explicit trust metadata only for exact creator-reported Naver metrics and excludes them from subscriber/follower sorting.';

comment on function directsign_private.directsign_naver_self_report_request_is_authoritative(
  uuid,
  uuid,
  text,
  bigint,
  timestamptz
) is
  'Validates the complete owner, request, evidence, value, handle, timestamp, and production-safety tuple for a Naver creator self-report.';

comment on function directsign_private.directsign_channel_has_naver_self_report_provenance(
  text,
  text,
  text,
  text,
  jsonb
) is
  'Recognizes Naver self-report provenance even when a channel row is moved to another platform.';

comment on function directsign_private.directsign_refresh_registered_naver_metric_from_channel() is
  'Refreshes the authenticated registered-member projection after a Naver-related raw channel metric is changed or cleared.';

comment on function directsign_private.directsign_exclude_naver_from_public_audience_sort() is
  'Excludes Naver daily visitor metrics from the cross-platform subscriber/follower public sort.';

comment on function directsign_private.directsign_revoke_naver_self_report_on_verification_loss() is
  'Clears a request-bound Naver self-report when its approved production verification is revoked, deleted, or rebound.';

comment on function directsign_private.directsign_sanitize_naver_channel_self_report() is
  'Keeps a raw Naver channel metric only when it is bound to the exact approved production self-report request, then derives its customer-facing labels.';

notify pgrst, 'reload schema';
