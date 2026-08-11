-- Add optional campaign eligibility rules, a tightly-scoped 30-day Naver
-- visitor cache, and separate one-year Naver Influencer qualification records.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create schema if not exists directsign_private;
grant usage on schema directsign_private to service_role;

create or replace function directsign_private.directsign_valid_campaign_eligibility_rules(
  p_rules jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rules is null then true
    when pg_catalog.jsonb_typeof(p_rules) <> 'array' then false
    when pg_catalog.jsonb_array_length(p_rules) > 3 then false
    else not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_rules) as item(rule)
      where pg_catalog.jsonb_typeof(item.rule) <> 'object'
        or coalesce(item.rule ->> 'platform', '') not in (
          'instagram', 'youtube', 'naver_blog'
        )
        or exists (
          select 1
          from pg_catalog.jsonb_object_keys(item.rule) as field(field_name)
          where field.field_name not in ('platform', 'metric', 'minimum')
        )
        or case
          when item.rule ->> 'platform' = 'naver_blog'
            and item.rule ->> 'metric' = 'naver_influencer' then
              item.rule ? 'minimum'
              or (
                select pg_catalog.count(*)
                from pg_catalog.jsonb_object_keys(item.rule)
              ) <> 2
          else
            pg_catalog.jsonb_typeof(item.rule -> 'minimum') <> 'number'
            or coalesce(item.rule ->> 'metric', '') <> case item.rule ->> 'platform'
              when 'instagram' then 'followers'
              when 'youtube' then 'subscribers'
              when 'naver_blog' then 'average_daily_visitors_4d'
              else ''
            end
            or case
              when coalesce(item.rule ->> 'minimum', '') ~ '^[1-9][0-9]*$'
                then (item.rule ->> 'minimum')::numeric > 1000000000
              else true
            end
            or (
              select pg_catalog.count(*)
              from pg_catalog.jsonb_object_keys(item.rule)
            ) <> 3
        end
    ) and (
      select pg_catalog.count(distinct item.rule ->> 'platform')
      from pg_catalog.jsonb_array_elements(p_rules) as item(rule)
    ) = pg_catalog.jsonb_array_length(p_rules)
  end;
$$;

revoke all on function directsign_private.directsign_valid_campaign_eligibility_rules(jsonb)
  from public, anon, authenticated;
grant execute on function directsign_private.directsign_valid_campaign_eligibility_rules(jsonb)
  to service_role;

create or replace function directsign_private.directsign_campaign_eligibility_platforms_match(
  p_campaign_data jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(p_campaign_data -> 'eligibilityRules', '[]'::jsonb)
    ) as item(rule)
    where not coalesce(
      p_campaign_data -> 'platforms' ? (item.rule ->> 'platform'),
      false
    )
  );
$$;

revoke all on function directsign_private.directsign_campaign_eligibility_platforms_match(jsonb)
  from public, anon, authenticated;
grant execute on function directsign_private.directsign_campaign_eligibility_platforms_match(jsonb)
  to service_role;

alter table public.marketplace_campaigns
  drop constraint if exists marketplace_campaigns_eligibility_rules_valid;
alter table public.marketplace_campaigns
  add constraint marketplace_campaigns_eligibility_rules_valid check (
    directsign_private.directsign_valid_campaign_eligibility_rules(
      campaign_data -> 'eligibilityRules'
    )
    and directsign_private.directsign_campaign_eligibility_platforms_match(
      campaign_data
    )
  ) not valid;
alter table public.marketplace_campaigns
  validate constraint marketplace_campaigns_eligibility_rules_valid;

create table if not exists directsign_private.campaign_naver_application_metrics (
  verification_request_id uuid primary key
    references public.verification_requests (id) on delete cascade,
  average_daily_visitors_4d bigint not null,
  checked_at timestamptz not null,
  constraint campaign_naver_application_metrics_value_valid check (
    average_daily_visitors_4d between 0 and 1000000000
  )
);

create index if not exists campaign_naver_application_metrics_expiry_idx
  on directsign_private.campaign_naver_application_metrics (checked_at);
alter table directsign_private.campaign_naver_application_metrics enable row level security;
alter table directsign_private.campaign_naver_application_metrics force row level security;
revoke all on table directsign_private.campaign_naver_application_metrics
  from public, anon, authenticated;
grant select, insert, update, delete
  on table directsign_private.campaign_naver_application_metrics
  to service_role;

comment on table directsign_private.campaign_naver_application_metrics is
  'Private 30-day cache used only to decide Naver Blog campaign applications. Daily counts, response bodies, handles, and failure reasons are never stored.';

create or replace function public.get_campaign_naver_application_metric(
  p_profile_id uuid,
  p_verification_request_id uuid,
  p_data_origin text
)
returns table (
  average_daily_visitors_4d bigint,
  checked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_profile_id is null
    or p_verification_request_id is null
    or p_data_origin not in ('production', 'qa', 'demo', 'seed') then
    raise exception using errcode = '22023', message = 'valid metric identity required';
  end if;

  delete from directsign_private.campaign_naver_application_metrics as stale
  where stale.checked_at < clock_timestamp() - interval '30 days';

  return query
  select metric.average_daily_visitors_4d, metric.checked_at
  from directsign_private.campaign_naver_application_metrics as metric
  join public.verification_requests as verification
    on verification.id = metric.verification_request_id
    and verification.target_type = 'influencer_account'
    and verification.verification_type = 'platform_account'
    and verification.status = 'approved'
    and verification.reviewed_at is not null
    and verification.platform = 'naver_blog'
  join public.profiles as profile
    on profile.id = verification.profile_id
  where verification.profile_id = p_profile_id
    and metric.verification_request_id = p_verification_request_id
    and coalesce(verification.data_origin, profile.data_origin, 'production')
      = p_data_origin
    and metric.checked_at >= clock_timestamp() - interval '30 days'
  limit 1;
end;
$$;

create or replace function public.upsert_campaign_naver_application_metric(
  p_profile_id uuid,
  p_verification_request_id uuid,
  p_data_origin text,
  p_average_daily_visitors_4d bigint,
  p_checked_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_profile_id is null
    or p_verification_request_id is null
    or p_data_origin not in ('production', 'qa', 'demo', 'seed')
    or p_average_daily_visitors_4d is null
    or p_average_daily_visitors_4d not between 0 and 1000000000
    or p_checked_at is null
    or p_checked_at < clock_timestamp() - interval '1 day'
    or p_checked_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'valid metric input required';
  end if;
  if not exists (
    select 1
    from public.verification_requests as verification
    join public.profiles as profile
      on profile.id = verification.profile_id
    where verification.id = p_verification_request_id
      and verification.profile_id = p_profile_id
      and verification.target_type = 'influencer_account'
      and verification.verification_type = 'platform_account'
      and verification.status = 'approved'
      and verification.reviewed_at is not null
      and verification.platform = 'naver_blog'
      and coalesce(verification.data_origin, profile.data_origin, 'production')
        = p_data_origin
  ) then
    raise exception using errcode = '42501', message = 'approved Naver account required';
  end if;

  delete from directsign_private.campaign_naver_application_metrics as stale
  where stale.checked_at < clock_timestamp() - interval '30 days';

  insert into directsign_private.campaign_naver_application_metrics (
    verification_request_id,
    average_daily_visitors_4d,
    checked_at
  ) values (
    p_verification_request_id,
    p_average_daily_visitors_4d,
    p_checked_at
  )
  on conflict (verification_request_id) do update set
    average_daily_visitors_4d = excluded.average_daily_visitors_4d,
    checked_at = excluded.checked_at;
end;
$$;

create or replace function public.cleanup_campaign_naver_application_metrics(
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_now is null then
    raise exception using errcode = '22023', message = 'retention time required';
  end if;
  delete from directsign_private.campaign_naver_application_metrics as metric
  where metric.checked_at < p_now - interval '30 days';
  get diagnostics v_deleted = row_count;
  return pg_catalog.jsonb_build_object('deleted_count', v_deleted);
end;
$$;

revoke all on function public.get_campaign_naver_application_metric(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.upsert_campaign_naver_application_metric(
  uuid, uuid, text, bigint, timestamptz
) from public, anon, authenticated;
revoke all on function public.cleanup_campaign_naver_application_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_campaign_naver_application_metric(uuid, uuid, text)
  to service_role;
grant execute on function public.upsert_campaign_naver_application_metric(
  uuid, uuid, text, bigint, timestamptz
) to service_role;
grant execute on function public.cleanup_campaign_naver_application_metrics(timestamptz)
  to service_role;

comment on function public.get_campaign_naver_application_metric(uuid, uuid, text) is
  'Returns one fresh private Naver application metric only to the service role and removes expired cache rows.';
comment on function public.upsert_campaign_naver_application_metric(
  uuid, uuid, text, bigint, timestamptz
) is
  'Stores only a successful four-day average and check time for an approved Naver account.';

create table if not exists directsign_private.naver_influencer_qualifications (
  verification_request_id uuid primary key
    references public.verification_requests (id) on delete cascade,
  influencer_profile_id text not null,
  checked_at timestamptz not null,
  expires_at timestamptz not null,
  constraint naver_influencer_qualifications_profile_valid check (
    influencer_profile_id ~ '^[a-z0-9._-]{2,64}$'
  ),
  constraint naver_influencer_qualifications_expiry_valid check (
    expires_at = checked_at + interval '1 year'
  )
);

create table if not exists directsign_private.naver_influencer_self_attestations (
  verification_request_id uuid primary key
    references public.verification_requests (id) on delete cascade,
  influencer_profile_id text not null,
  attestation_version text not null,
  attested_at timestamptz not null,
  expires_at timestamptz not null,
  constraint naver_influencer_self_attestations_profile_valid check (
    influencer_profile_id ~ '^[a-z0-9._-]{2,64}$'
  ),
  constraint naver_influencer_self_attestations_version_valid check (
    attestation_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'
  ),
  constraint naver_influencer_self_attestations_expiry_valid check (
    expires_at = attested_at + interval '1 year'
  )
);

create index if not exists naver_influencer_qualifications_expiry_idx
  on directsign_private.naver_influencer_qualifications (expires_at);
create index if not exists naver_influencer_self_attestations_expiry_idx
  on directsign_private.naver_influencer_self_attestations (expires_at);

alter table directsign_private.naver_influencer_qualifications enable row level security;
alter table directsign_private.naver_influencer_qualifications force row level security;
alter table directsign_private.naver_influencer_self_attestations enable row level security;
alter table directsign_private.naver_influencer_self_attestations force row level security;
revoke all on table directsign_private.naver_influencer_qualifications
  from public, anon, authenticated;
revoke all on table directsign_private.naver_influencer_self_attestations
  from public, anon, authenticated;
grant select, insert, update, delete
  on table directsign_private.naver_influencer_qualifications
  to service_role;
grant select, insert, update, delete
  on table directsign_private.naver_influencer_self_attestations
  to service_role;

comment on table directsign_private.naver_influencer_qualifications is
  'Private one-year automatic qualification for an exact approved Naver Blog account. Only this table may supply the public Influencer badge.';
comment on table directsign_private.naver_influencer_self_attestations is
  'Private one-year applicant self-attestation created only after an unavailable automatic check. It never supplies a public badge.';

create or replace function public.get_naver_influencer_eligibility_state(
  p_profile_id uuid,
  p_verification_request_id uuid,
  p_data_origin text
)
returns table (
  automatic_profile_id text,
  automatic_checked_at timestamptz,
  automatic_expires_at timestamptz,
  self_profile_id text,
  self_attestation_version text,
  self_attested_at timestamptz,
  self_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_profile_id is null
    or p_verification_request_id is null
    or p_data_origin not in ('production', 'qa', 'demo', 'seed') then
    raise exception using errcode = '22023', message = 'valid credential identity required';
  end if;

  return query
  select
    automatic.influencer_profile_id,
    automatic.checked_at,
    automatic.expires_at,
    self_attestation.influencer_profile_id,
    self_attestation.attestation_version,
    self_attestation.attested_at,
    self_attestation.expires_at
  from public.verification_requests as verification
  join public.profiles as profile on profile.id = verification.profile_id
  left join directsign_private.naver_influencer_qualifications as automatic
    on automatic.verification_request_id = verification.id
  left join directsign_private.naver_influencer_self_attestations as self_attestation
    on self_attestation.verification_request_id = verification.id
  where verification.id = p_verification_request_id
    and verification.profile_id = p_profile_id
    and verification.target_type = 'influencer_account'
    and verification.verification_type = 'platform_account'
    and verification.status = 'approved'
    and verification.reviewed_at is not null
    and verification.platform = 'naver_blog'
    and coalesce(verification.data_origin, profile.data_origin, 'production')
      = p_data_origin
  limit 1;
end;
$$;

create or replace function public.upsert_naver_influencer_qualification(
  p_profile_id uuid,
  p_verification_request_id uuid,
  p_data_origin text,
  p_influencer_profile_id text,
  p_checked_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_profile_id is null
    or p_verification_request_id is null
    or p_data_origin not in ('production', 'qa', 'demo', 'seed')
    or coalesce(p_influencer_profile_id, '') !~ '^[a-z0-9._-]{2,64}$'
    or p_checked_at is null
    or p_checked_at < clock_timestamp() - interval '1 day'
    or p_checked_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'valid qualification input required';
  end if;
  if not exists (
    select 1
    from public.verification_requests as verification
    join public.profiles as profile on profile.id = verification.profile_id
    where verification.id = p_verification_request_id
      and verification.profile_id = p_profile_id
      and verification.target_type = 'influencer_account'
      and verification.verification_type = 'platform_account'
      and verification.status = 'approved'
      and verification.reviewed_at is not null
      and verification.platform = 'naver_blog'
      and coalesce(verification.data_origin, profile.data_origin, 'production')
        = p_data_origin
  ) then
    raise exception using errcode = '42501', message = 'approved Naver account required';
  end if;

  insert into directsign_private.naver_influencer_qualifications (
    verification_request_id, influencer_profile_id, checked_at, expires_at
  ) values (
    p_verification_request_id, p_influencer_profile_id, p_checked_at,
    p_checked_at + interval '1 year'
  )
  on conflict (verification_request_id) do update set
    influencer_profile_id = excluded.influencer_profile_id,
    checked_at = excluded.checked_at,
    expires_at = excluded.expires_at;

  delete from directsign_private.naver_influencer_self_attestations
  where verification_request_id = p_verification_request_id;
end;
$$;

create or replace function public.upsert_naver_influencer_self_attestation(
  p_profile_id uuid,
  p_verification_request_id uuid,
  p_data_origin text,
  p_influencer_profile_id text,
  p_attestation_version text,
  p_attested_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_profile_id is null
    or p_verification_request_id is null
    or p_data_origin not in ('production', 'qa', 'demo', 'seed')
    or coalesce(p_influencer_profile_id, '') !~ '^[a-z0-9._-]{2,64}$'
    or coalesce(p_attestation_version, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'
    or p_attested_at is null
    or p_attested_at < clock_timestamp() - interval '1 day'
    or p_attested_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'valid self-attestation input required';
  end if;
  if not exists (
    select 1
    from public.verification_requests as verification
    join public.profiles as profile on profile.id = verification.profile_id
    where verification.id = p_verification_request_id
      and verification.profile_id = p_profile_id
      and verification.target_type = 'influencer_account'
      and verification.verification_type = 'platform_account'
      and verification.status = 'approved'
      and verification.reviewed_at is not null
      and verification.platform = 'naver_blog'
      and coalesce(verification.data_origin, profile.data_origin, 'production')
        = p_data_origin
  ) or exists (
    select 1
    from directsign_private.naver_influencer_qualifications as automatic
    where automatic.verification_request_id = p_verification_request_id
      and automatic.expires_at > clock_timestamp()
  ) then
    raise exception using errcode = '42501', message = 'self-attestation is not allowed';
  end if;

  insert into directsign_private.naver_influencer_self_attestations (
    verification_request_id, influencer_profile_id, attestation_version,
    attested_at, expires_at
  ) values (
    p_verification_request_id, p_influencer_profile_id, p_attestation_version,
    p_attested_at, p_attested_at + interval '1 year'
  )
  on conflict (verification_request_id) do update set
    influencer_profile_id = excluded.influencer_profile_id,
    attestation_version = excluded.attestation_version,
    attested_at = excluded.attested_at,
    expires_at = excluded.expires_at;
end;
$$;

create or replace function public.get_active_naver_influencer_badges(
  p_blog_ids text[]
)
returns table (blog_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_blog_ids is null or cardinality(p_blog_ids) > 200 then
    raise exception using errcode = '22023', message = 'valid blog ids required';
  end if;

  return query
  select distinct lower(trim(leading '@' from btrim(verification.platform_handle)))
  from directsign_private.naver_influencer_qualifications as automatic
  join public.verification_requests as verification
    on verification.id = automatic.verification_request_id
  join public.profiles as profile on profile.id = verification.profile_id
  where automatic.expires_at > clock_timestamp()
    and verification.target_type = 'influencer_account'
    and verification.verification_type = 'platform_account'
    and verification.status = 'approved'
    and verification.reviewed_at is not null
    and verification.platform = 'naver_blog'
    and coalesce(verification.data_origin, profile.data_origin, 'production') = 'production'
    and lower(trim(leading '@' from btrim(verification.platform_handle)))
      = any(p_blog_ids)
    and lower(trim(leading '@' from btrim(verification.platform_handle)))
      ~ '^[a-z0-9_-]{2,50}$';
end;
$$;

create or replace function public.cleanup_naver_influencer_credentials(
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_automatic_deleted bigint := 0;
  v_self_deleted bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_now is null then
    raise exception using errcode = '22023', message = 'retention time required';
  end if;
  delete from directsign_private.naver_influencer_qualifications
  where expires_at <= p_now;
  get diagnostics v_automatic_deleted = row_count;
  delete from directsign_private.naver_influencer_self_attestations
  where expires_at <= p_now;
  get diagnostics v_self_deleted = row_count;
  return pg_catalog.jsonb_build_object(
    'automatic_deleted_count', v_automatic_deleted,
    'self_attestation_deleted_count', v_self_deleted
  );
end;
$$;

create or replace function directsign_private.revoke_naver_influencer_credentials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.platform = 'naver_blog' and (
    new.platform is distinct from old.platform
    or new.status is distinct from old.status
    or new.reviewed_at is distinct from old.reviewed_at
    or new.platform_handle is distinct from old.platform_handle
    or new.platform_url is distinct from old.platform_url
  ) then
    delete from directsign_private.naver_influencer_qualifications
    where verification_request_id = old.id;
    delete from directsign_private.naver_influencer_self_attestations
    where verification_request_id = old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists verification_requests_revoke_naver_influencer_credentials
  on public.verification_requests;
create trigger verification_requests_revoke_naver_influencer_credentials
after update of platform, status, reviewed_at, platform_handle, platform_url
on public.verification_requests
for each row execute function directsign_private.revoke_naver_influencer_credentials();

revoke all on function public.get_naver_influencer_eligibility_state(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.upsert_naver_influencer_qualification(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.upsert_naver_influencer_self_attestation(
  uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.get_active_naver_influencer_badges(text[])
  from public, anon, authenticated;
revoke all on function public.cleanup_naver_influencer_credentials(timestamptz)
  from public, anon, authenticated;
revoke all on function directsign_private.revoke_naver_influencer_credentials()
  from public, anon, authenticated;
grant execute on function public.get_naver_influencer_eligibility_state(uuid, uuid, text)
  to service_role;
grant execute on function public.upsert_naver_influencer_qualification(
  uuid, uuid, text, text, timestamptz
) to service_role;
grant execute on function public.upsert_naver_influencer_self_attestation(
  uuid, uuid, text, text, text, timestamptz
) to service_role;
grant execute on function public.get_active_naver_influencer_badges(text[])
  to service_role;
grant execute on function public.cleanup_naver_influencer_credentials(timestamptz)
  to service_role;

alter table public.marketplace_contact_proposals
  add column if not exists application_eligibility_snapshot jsonb;

create or replace function public.directsign_campaign_application_eligibility_snapshot_valid(
  p_snapshot jsonb,
  p_campaign_snapshot jsonb,
  p_sender_profile_id uuid,
  p_campaign_id text,
  p_direction text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_direction <> 'influencer_to_brand' or coalesce(p_campaign_id, '') = ''
      then p_snapshot is null
    when not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(p_campaign_snapshot -> 'eligibilityRules', '[]'::jsonb)
      ) as condition(rule)
      where (
        condition.rule ->> 'platform' = 'instagram'
        and condition.rule ->> 'metric' = 'followers'
      ) or (
        condition.rule ->> 'platform' = 'youtube'
        and condition.rule ->> 'metric' = 'subscribers'
      ) or (
        condition.rule ->> 'platform' = 'naver_blog'
        and condition.rule ->> 'metric' = 'naver_influencer'
      )
    ) then p_snapshot is null
    else coalesce((
      pg_catalog.jsonb_typeof(p_snapshot) = 'object'
      and (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(p_snapshot)
      ) = 6
      and p_snapshot ->> 'version' = '2026-08-11.3'
      and p_snapshot ->> 'actorProfileId' = p_sender_profile_id::text
      and p_snapshot ->> 'campaignId' = p_campaign_id
      and btrim(coalesce(p_snapshot ->> 'campaignRevision', '')) <> ''
      and p_snapshot ->> 'campaignRevision'
        = p_campaign_snapshot ->> 'campaignRevision'
      and btrim(coalesce(p_snapshot ->> 'decisionAt', '')) <> ''
      and coalesce(p_snapshot ->> 'decisionAt', '')
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      and pg_catalog.jsonb_typeof(p_snapshot -> 'items') = 'array'
      and pg_catalog.jsonb_array_length(p_snapshot -> 'items') = (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(
          coalesce(p_campaign_snapshot -> 'eligibilityRules', '[]'::jsonb)
        ) as condition(rule)
        where (
          condition.rule ->> 'platform' = 'instagram'
          and condition.rule ->> 'metric' = 'followers'
        ) or (
          condition.rule ->> 'platform' = 'youtube'
          and condition.rule ->> 'metric' = 'subscribers'
        ) or (
          condition.rule ->> 'platform' = 'naver_blog'
          and condition.rule ->> 'metric' = 'naver_influencer'
        )
      )
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_snapshot -> 'items') as evidence(item)
        where not (
          pg_catalog.jsonb_typeof(evidence.item) = 'object'
          and coalesce(evidence.item ->> 'verificationRequestId', '')
            ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and coalesce(evidence.item ->> 'evidenceAt', '')
            ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
          and evidence.item ->> 'decisionAt' = p_snapshot ->> 'decisionAt'
          and (
            (
              evidence.item ->> 'platform' = 'naver_blog'
              and evidence.item ->> 'metric' = 'naver_influencer'
              and evidence.item ->> 'evidenceType' in ('auto_verified', 'self_attested')
              and coalesce(evidence.item ->> 'profileUrl', '')
                ~ '^https://in\.naver\.com/[a-z0-9._-]{2,64}$'
              and (
                (
                  evidence.item ->> 'evidenceType' = 'auto_verified'
                  and not (evidence.item ? 'attestationVersion')
                  and (
                    select pg_catalog.count(*)
                    from pg_catalog.jsonb_object_keys(evidence.item)
                  ) = 7
                ) or (
                  evidence.item ->> 'evidenceType' = 'self_attested'
                  and evidence.item ->> 'attestationVersion' = '2026-08-11.2'
                  and (
                    select pg_catalog.count(*)
                    from pg_catalog.jsonb_object_keys(evidence.item)
                  ) = 8
                )
              )
              and exists (
                select 1
                from pg_catalog.jsonb_array_elements(
                  coalesce(p_campaign_snapshot -> 'eligibilityRules', '[]'::jsonb)
                ) as condition(rule)
                where condition.rule ->> 'platform' = 'naver_blog'
                  and condition.rule ->> 'metric' = 'naver_influencer'
              )
            ) or (
              evidence.item ->> 'platform' in ('instagram', 'youtube')
              and evidence.item ->> 'metric' = case
                when evidence.item ->> 'platform' = 'instagram'
                  then 'follower_count'
                else 'subscriber_count'
              end
              and evidence.item ->> 'source' in (
                'instagram_user_profile_api',
                'instagram_graph_api',
                'youtube_data_api'
              )
              and (
                (evidence.item ->> 'platform' = 'instagram'
                  and evidence.item ->> 'source' in (
                    'instagram_user_profile_api',
                    'instagram_graph_api'
                  ))
                or (evidence.item ->> 'platform' = 'youtube'
                  and evidence.item ->> 'source' = 'youtube_data_api')
              )
              and pg_catalog.jsonb_typeof(evidence.item -> 'count') = 'number'
              and pg_catalog.jsonb_typeof(evidence.item -> 'minimum') = 'number'
              and coalesce(evidence.item ->> 'count', '') ~ '^(0|[1-9][0-9]{0,15})$'
              and coalesce(evidence.item ->> 'minimum', '') ~ '^(0|[1-9][0-9]{0,15})$'
              and (evidence.item ->> 'count')::numeric
                >= (evidence.item ->> 'minimum')::numeric
              and (
                select pg_catalog.count(*)
                from pg_catalog.jsonb_object_keys(evidence.item)
              ) = case
                when evidence.item ->> 'platform' = 'instagram' then 10
                else 8
              end
              and (
                evidence.item ->> 'platform' <> 'instagram'
                or (
                  coalesce(evidence.item ->> 'accountHandle', '')
                    ~ '^[a-z0-9._]{1,30}$'
                  and evidence.item ->> 'accountUrl'
                    = 'https://www.instagram.com/'
                      || (evidence.item ->> 'accountHandle') || '/'
                )
              )
              and exists (
                select 1
                from pg_catalog.jsonb_array_elements(
                  coalesce(p_campaign_snapshot -> 'eligibilityRules', '[]'::jsonb)
                ) as condition(rule)
                where condition.rule ->> 'platform' = evidence.item ->> 'platform'
                  and condition.rule ->> 'metric' = case
                    when evidence.item ->> 'platform' = 'instagram'
                      then 'followers'
                    else 'subscribers'
                  end
                  and condition.rule ->> 'minimum' = evidence.item ->> 'minimum'
              )
            )
          )
        )
      )
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(
          coalesce(p_campaign_snapshot -> 'eligibilityRules', '[]'::jsonb)
        ) as condition(rule)
        where (
          (
            condition.rule ->> 'platform' = 'instagram'
            and condition.rule ->> 'metric' = 'followers'
          ) or (
            condition.rule ->> 'platform' = 'youtube'
            and condition.rule ->> 'metric' = 'subscribers'
          ) or (
            condition.rule ->> 'platform' = 'naver_blog'
            and condition.rule ->> 'metric' = 'naver_influencer'
          )
        ) and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_snapshot -> 'items') as evidence(item)
          where evidence.item ->> 'platform' = condition.rule ->> 'platform'
            and evidence.item ->> 'metric' = case
              when condition.rule ->> 'platform' = 'instagram'
                then 'follower_count'
              when condition.rule ->> 'platform' = 'youtube'
                then 'subscriber_count'
              else 'naver_influencer'
            end
        )
      )
    ), false)
  end;
$$;

alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_eligibility_snapshot_valid;
alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_eligibility_snapshot_valid check (
    public.directsign_campaign_application_eligibility_snapshot_valid(
      application_eligibility_snapshot,
      campaign_snapshot,
      sender_profile_id,
      campaign_id,
      direction
    )
  ) not valid;
alter table public.marketplace_contact_proposals
  validate constraint marketplace_contact_proposals_eligibility_snapshot_valid;

create or replace function directsign_private.protect_campaign_application_eligibility_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.application_eligibility_snapshot is distinct from old.application_eligibility_snapshot then
    raise exception using errcode = '42501', message = 'application eligibility snapshot is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_campaign_application_eligibility_snapshot_guard
  on public.marketplace_contact_proposals;
create trigger marketplace_campaign_application_eligibility_snapshot_guard
before update of application_eligibility_snapshot
on public.marketplace_contact_proposals
for each row execute function directsign_private.protect_campaign_application_eligibility_snapshot();

revoke all on function public.directsign_campaign_application_eligibility_snapshot_valid(
  jsonb, jsonb, uuid, text, text
) from public, anon, authenticated;
revoke all on function directsign_private.protect_campaign_application_eligibility_snapshot()
  from public, anon, authenticated;
grant execute on function public.directsign_campaign_application_eligibility_snapshot_valid(
  jsonb, jsonb, uuid, text, text
) to service_role;

comment on column public.marketplace_contact_proposals.application_eligibility_snapshot is
  'Immutable private campaign eligibility evidence shown only to the applicant and owning campaign advertiser.';

create or replace function public.update_marketplace_campaign_details(
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_expected_updated_at timestamptz,
  p_campaign_patch jsonb,
  p_activity_event jsonb
)
returns table (
  result_outcome text,
  result_campaign_id text,
  result_brand_profile_id uuid,
  result_campaign_data jsonb,
  result_status text,
  result_updated_at timestamptz,
  result_application_count bigint,
  result_mode text,
  result_locked_fields text[],
  result_policy_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.marketplace_campaigns%rowtype;
  v_now timestamptz := clock_timestamp();
  v_current_revision timestamptz;
  v_application_count bigint := 0;
  v_mode text;
  v_locked_fields text[];
  v_policy_reason text;
  v_all_fields constant text[] := array[
    'title', 'type', 'otherTypeLabel', 'applicantLimit', 'location', 'offer',
    'budget', 'summary', 'mission', 'targetCountries', 'thumbnailUrl',
    'deadline', 'uploadDeadline', 'platforms', 'deliverables',
    'eligibilityRules', 'applicationContactFields', 'requiredConsents'
  ];
  v_term_fields constant text[] := array[
    'type', 'otherTypeLabel', 'applicantLimit', 'location', 'offer', 'budget',
    'summary', 'mission', 'targetCountries', 'deadline', 'uploadDeadline',
    'platforms', 'deliverables', 'eligibilityRules',
    'applicationContactFields', 'requiredConsents'
  ];
  v_patch_fields constant text[] := v_all_fields || array[
    'applicationContactConsentVersion', 'consentVersion'
  ];
  v_existing_events jsonb;
  v_activity_events jsonb;
  v_next_data jsonb;
  v_mirror jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if btrim(coalesce(p_campaign_id, '')) = ''
    or p_brand_profile_id is null
    or p_organization_id is null
    or p_actor_profile_id is null
    or p_expected_updated_at is null
    or jsonb_typeof(p_campaign_patch) is distinct from 'object'
    or p_campaign_patch = '{}'::jsonb
    or jsonb_typeof(p_activity_event) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'complete campaign edit input is required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_campaign_patch) as patch_field(field_name)
    where not (patch_field.field_name = any(v_patch_fields))
  ) then
    raise exception using errcode = '22023', message = 'campaign patch contains unsupported fields';
  end if;
  if btrim(coalesce(p_activity_event ->> 'id', '')) = ''
    or btrim(coalesce(p_activity_event ->> 'actor', '')) = ''
    or btrim(coalesce(p_activity_event ->> 'action', '')) = ''
    or btrim(coalesce(p_activity_event ->> 'description', '')) = '' then
    raise exception using errcode = '22023', message = 'campaign edit activity event is invalid';
  end if;

  select campaign.* into v_campaign
  from public.marketplace_campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.brand_profile_id = p_brand_profile_id
    and campaign.organization_id = p_organization_id
    and campaign.archived_at is null
  for update;

  if not found then
    return query select 'not_found'::text, p_campaign_id, p_brand_profile_id,
      null::jsonb, null::text, null::timestamptz, 0::bigint, 'locked'::text,
      v_all_fields, 'not_found'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.marketplace_brand_profiles as brand
    join public.organization_members as membership
      on membership.organization_id = brand.organization_id
      and membership.profile_id = p_actor_profile_id
      and membership.role in ('owner', 'admin', 'marketer')
    join public.profiles as actor
      on actor.id = membership.profile_id and actor.role = 'marketer'
    where brand.id = p_brand_profile_id
      and brand.organization_id = p_organization_id
      and brand.archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'campaign edit actor is not authorized';
  end if;

  select pg_catalog.count(*)::bigint into v_application_count
  from public.marketplace_contact_proposals as application
  where application.direction = 'influencer_to_brand'
    and application.campaign_id = p_campaign_id
    and application.target_brand_profile_id = p_brand_profile_id
    and application.data_origin = 'production'
    and application.submitted_actor_proof_at is not null
    and application.status in ('submitted', 'reviewed', 'accepted', 'converted_to_contract');

  if v_campaign.status in ('closed', 'ended') then
    v_mode := 'locked';
    v_locked_fields := v_all_fields;
    v_policy_reason := 'campaign_closed';
  elsif v_application_count > 0 then
    v_mode := 'presentation_only';
    v_locked_fields := v_term_fields;
    v_policy_reason := 'applications_started';
  else
    v_mode := 'full';
    v_locked_fields := '{}'::text[];
    v_policy_reason := 'no_applications';
  end if;

  v_current_revision := v_campaign.updated_at;
  if v_current_revision is distinct from p_expected_updated_at then
    return query select 'conflict'::text, v_campaign.id,
      v_campaign.brand_profile_id, v_campaign.campaign_data,
      v_campaign.status, v_current_revision, v_application_count, v_mode,
      v_locked_fields, v_policy_reason;
    return;
  end if;
  if v_mode = 'locked' then
    return query select 'locked'::text, v_campaign.id,
      v_campaign.brand_profile_id, v_campaign.campaign_data,
      v_campaign.status, v_current_revision, v_application_count, v_mode,
      v_locked_fields, v_policy_reason;
    return;
  end if;
  if v_mode = 'presentation_only' and exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_campaign_patch) as patch_field(field_name)
    where patch_field.field_name not in ('title', 'thumbnailUrl')
  ) then
    return query select 'fields_locked'::text, v_campaign.id,
      v_campaign.brand_profile_id, v_campaign.campaign_data,
      v_campaign.status, v_current_revision, v_application_count, v_mode,
      v_locked_fields, v_policy_reason;
    return;
  end if;

  v_next_data := pg_catalog.jsonb_strip_nulls(v_campaign.campaign_data || p_campaign_patch);
  if not directsign_private.directsign_valid_campaign_eligibility_rules(
    v_next_data -> 'eligibilityRules'
  ) then
    raise exception using errcode = '22023', message = 'campaign eligibility rules are invalid';
  end if;
  v_existing_events := case
    when pg_catalog.jsonb_typeof(v_campaign.campaign_data -> 'activityEvents') = 'array'
      then v_campaign.campaign_data -> 'activityEvents'
    else '[]'::jsonb
  end;
  select coalesce(
    pg_catalog.jsonb_agg(recent.event order by recent.ordinality), '[]'::jsonb
  ) into v_activity_events
  from (
    select event, ordinality
    from pg_catalog.jsonb_array_elements(
      v_existing_events || pg_catalog.jsonb_build_array(p_activity_event)
    ) with ordinality as source(event, ordinality)
    order by ordinality desc
    limit 80
  ) as recent;

  v_next_data := v_next_data || pg_catalog.jsonb_build_object(
    'id', v_campaign.id,
    'status', v_campaign.status,
    'createdAt', v_campaign.created_at,
    'updatedAt', v_now,
    'activityEvents', v_activity_events
  );

  update public.marketplace_campaigns
  set campaign_data = v_next_data, updated_at = v_now
  where id = v_campaign.id
    and brand_profile_id = v_campaign.brand_profile_id
    and organization_id = v_campaign.organization_id
  returning * into v_campaign;

  select coalesce(
    pg_catalog.jsonb_agg(
      mirror_row.campaign_document
      order by mirror_row.created_at desc, mirror_row.id desc
    ),
    '[]'::jsonb
  ) into v_mirror
  from (
    select campaign.id, campaign.created_at,
      campaign.campaign_data || pg_catalog.jsonb_build_object(
        'id', campaign.id,
        'status', campaign.status,
        'createdAt', campaign.created_at,
        'updatedAt', campaign.updated_at
      ) as campaign_document
    from public.marketplace_campaigns as campaign
    where campaign.brand_profile_id = p_brand_profile_id
      and campaign.archived_at is null
    order by campaign.created_at desc, campaign.id desc
    limit 20
  ) as mirror_row;

  update public.marketplace_brand_profiles
  set active_campaigns = v_mirror, updated_at = v_now
  where id = p_brand_profile_id
    and organization_id = p_organization_id
    and archived_at is null;

  return query select 'updated'::text, v_campaign.id,
    v_campaign.brand_profile_id, v_campaign.campaign_data,
    v_campaign.status, v_campaign.updated_at, v_application_count, v_mode,
    v_locked_fields, v_policy_reason;
end;
$$;

revoke execute on function public.update_marketplace_campaign_details(
  text, uuid, uuid, uuid, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.update_marketplace_campaign_details(
  text, uuid, uuid, uuid, timestamptz, jsonb, jsonb
) to service_role;

comment on function public.update_marketplace_campaign_details(
  text, uuid, uuid, uuid, timestamptz, jsonb, jsonb
) is
  'Atomically enforces campaign ownership, optimistic concurrency, application-aware eligibility term locks, activity history, and the legacy brand mirror.';
