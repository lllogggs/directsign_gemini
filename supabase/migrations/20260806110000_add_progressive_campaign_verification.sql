-- Progressive verification for marketplace campaigns.
--
-- The first two lifetime campaign publications in an advertiser organization
-- are allowed before business verification.  Every later publication requires
-- an approved, reviewed business-verification request.  Publication sequence
-- is database-owned and survives campaign status, brand, and archive changes.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create schema if not exists directsign_private;
revoke all on schema directsign_private from public, anon, authenticated;
grant usage on schema directsign_private to service_role;

-- These fail-closed identity guards are defined before the campaign gate so
-- a QA/demo/seed approval can never verify an operating advertiser. The next
-- migration reuses the same helpers for registered-influencer discovery.
create or replace function directsign_private.directsign_email_is_operational(
  p_email text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    btrim(coalesce(p_email, '')) <> ''
    and lower(p_email)
      !~ '(^|[+._-])(qa|test|demo|seed)([+._@-]|$)'
    and lower(p_email)
      !~ '@(example[.](com|org|net)|directsign[.]app)$'
    and lower(split_part(p_email, '@', 2)) <> 'test'
    and lower(split_part(p_email, '@', 2)) !~ '[.]test$'
    and not (
      lower(split_part(p_email, '@', 2)) = 'yeollock.me'
      and lower(split_part(p_email, '@', 1)) in (
        'breadroom.manager',
        'test.influencer',
        'creator.sora',
        'breadroom',
        'breadroom-partner',
        'obre-beauty',
        'housefit',
        'brewinglab',
        'nightcare',
        'minseo.home',
        'today.taste',
        'haru.fit',
        'ziyu.log',
        'luna.day',
        'yuna.beauty',
        'review.j',
        'only.routine',
        'harin.log',
        'moa.review',
        'sua.pick',
        'raon.beauty',
        'jian.home',
        'serin.daily',
        'narae.shorts',
        'romi.review',
        'sodam.pick'
      )
    );
$$;

create or replace function directsign_private.directsign_has_test_marker(
  p_value text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(p_value, '')) = '' then false
    else
      lower(p_value) ~
        '(^|[^a-z0-9])(qa|test|demo|seed|showcase|dummy)([^a-z0-9]|$)'
      or lower(p_value) ~ '(테스트|데모|시드|쇼케이스|더미)'
      or exists (
        select 1
        from unnest(array[
          '광고주.매니저',
          '브레드룸',
          '브래드룸',
          'breadroom',
          'breadroom.partner',
          '오브레',
          'obre',
          '하우스핏',
          'housefit',
          '브루잉랩',
          'brewinglab',
          '나이트케어',
          'nightcare',
          '크리에이터.소라',
          'creator.sora',
          '민서홈',
          'minseo.home',
          '오늘의취향',
          'today.taste',
          '하루핏',
          'haru.fit',
          '지유로그',
          'ziyu.log',
          '루나데이',
          'luna.day',
          '유나뷰티',
          'yuna.beauty',
          '리뷰제이',
          'review.j',
          '온리루틴',
          'only.routine',
          '하린로그',
          'harin.log',
          '모아리뷰',
          'moa.review',
          '수아픽',
          'sua.pick',
          '라온뷰티',
          'raon.beauty',
          '지안홈',
          'jian.home',
          '세린데일리',
          'serin.daily',
          '나래숏폼',
          'narae.shorts',
          '로미리뷰',
          'romi.review',
          '소담픽',
          'sodam.pick',
          '선정.크리에이터.계약',
          '완료.보관.캠페인',
          '브레드룸.여름.루틴',
          '브레드룸.신제품.언박싱',
          '파우치.필수템.쇼츠',
          '데일리.루틴.블로그',
          '성수.팝업',
          '나이트.케어.쇼츠',
          '공동구매.파일럿',
          '오브레.릴스',
          '브루잉랩.공동구매'
        ]::text[]) as known_marker(value)
        where strpos(
          lower(regexp_replace(btrim(p_value), '[[:space:]_-]+', '.', 'g')),
          known_marker.value
        ) > 0
      )
  end;
$$;

alter table public.marketplace_campaigns
  add column if not exists first_published_at timestamptz,
  add column if not exists organization_campaign_sequence bigint,
  add column if not exists verification_gate_basis text,
  add column if not exists publication_request_key text;

-- Rows created before this policy cannot prove the verification state that
-- existed at publication time.  Preserve the first two as the introductory
-- allowance and mark later historical publications explicitly grandfathered.
with legacy_publications as (
  select
    campaign.id,
    campaign.organization_id,
    coalesce(
      case
        when pg_catalog.pg_input_is_valid(
          nullif(campaign.campaign_data ->> 'firstPublishedAt', ''),
          'timestamp with time zone'
        ) then (campaign.campaign_data ->> 'firstPublishedAt')::timestamptz
      end,
      case
        when pg_catalog.pg_input_is_valid(
          nullif(campaign.campaign_data ->> 'publishedAt', ''),
          'timestamp with time zone'
        ) then (campaign.campaign_data ->> 'publishedAt')::timestamptz
      end,
      case
        when pg_catalog.pg_input_is_valid(
          nullif(campaign.campaign_data ->> 'createdAt', ''),
          'timestamp with time zone'
        ) then (campaign.campaign_data ->> 'createdAt')::timestamptz
      end,
      case
        when pg_catalog.pg_input_is_valid(
          nullif(campaign.campaign_data ->> 'created_at', ''),
          'timestamp with time zone'
        ) then (campaign.campaign_data ->> 'created_at')::timestamptz
      end,
      campaign.created_at
    ) as publication_at
  from public.marketplace_campaigns as campaign
  where campaign.status <> 'draft'
),
ranked_publications as (
  select
    publication.id,
    publication.publication_at,
    row_number() over (
      partition by publication.organization_id
      order by publication.publication_at asc, publication.id asc
    )::bigint as publication_sequence
  from legacy_publications as publication
)
update public.marketplace_campaigns as campaign
set
  first_published_at = coalesce(
    campaign.first_published_at,
    ranked.publication_at
  ),
  organization_campaign_sequence = ranked.publication_sequence,
  verification_gate_basis = case
    when ranked.publication_sequence <= 2 then 'intro_exempt'
    else 'grandfathered'
  end
from ranked_publications as ranked
where ranked.id = campaign.id
  and (
    campaign.first_published_at is null
    or campaign.organization_campaign_sequence is null
    or campaign.verification_gate_basis is null
  );

alter table public.marketplace_campaigns
  drop constraint if exists marketplace_campaigns_publication_sequence_positive;
alter table public.marketplace_campaigns
  add constraint marketplace_campaigns_publication_sequence_positive check (
    organization_campaign_sequence is null
    or organization_campaign_sequence > 0
  );

alter table public.marketplace_campaigns
  drop constraint if exists marketplace_campaigns_verification_gate_basis_allowed;
alter table public.marketplace_campaigns
  add constraint marketplace_campaigns_verification_gate_basis_allowed check (
    verification_gate_basis is null
    or verification_gate_basis in (
      'intro_exempt',
      'business_verified',
      'grandfathered'
    )
  );

alter table public.marketplace_campaigns
  drop constraint if exists marketplace_campaigns_publication_metadata_complete;
alter table public.marketplace_campaigns
  add constraint marketplace_campaigns_publication_metadata_complete check (
    (
      first_published_at is null
      and organization_campaign_sequence is null
      and verification_gate_basis is null
    )
    or (
      first_published_at is not null
      and organization_campaign_sequence is not null
      and verification_gate_basis is not null
    )
  );

alter table public.marketplace_campaigns
  drop constraint if exists marketplace_campaigns_public_status_has_sequence;
alter table public.marketplace_campaigns
  add constraint marketplace_campaigns_public_status_has_sequence check (
    status = 'draft'
    or organization_campaign_sequence is not null
  );

alter table public.marketplace_campaigns
  drop constraint if exists marketplace_campaigns_publication_request_key_length;
alter table public.marketplace_campaigns
  add constraint marketplace_campaigns_publication_request_key_length check (
    publication_request_key is null
    or (
      btrim(publication_request_key) <> ''
      and length(publication_request_key) <= 128
    )
  );

create unique index if not exists marketplace_campaigns_organization_sequence_unique
  on public.marketplace_campaigns (
    organization_id,
    organization_campaign_sequence
  )
  where organization_campaign_sequence is not null;

create unique index if not exists marketplace_campaigns_publication_request_unique
  on public.marketplace_campaigns (organization_id, publication_request_key)
  where publication_request_key is not null;

create table if not exists public.marketplace_campaign_publication_counters (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  published_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint marketplace_campaign_publication_count_non_negative check (
    published_count >= 0
  )
);

insert into public.marketplace_campaign_publication_counters (
  organization_id,
  published_count,
  updated_at
)
select
  campaign.organization_id,
  max(campaign.organization_campaign_sequence),
  now()
from public.marketplace_campaigns as campaign
where campaign.organization_campaign_sequence is not null
group by campaign.organization_id
on conflict (organization_id) do update
set
  published_count = greatest(
    marketplace_campaign_publication_counters.published_count,
    excluded.published_count
  ),
  updated_at = excluded.updated_at;

alter table public.marketplace_campaign_publication_counters enable row level security;
revoke all on table public.marketplace_campaign_publication_counters
  from public, anon, authenticated;
grant select, insert, update on table public.marketplace_campaign_publication_counters
  to service_role;

create or replace function public.directsign_organization_business_verified(
  p_organization_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role is required';
  end if;

  return exists (
    select 1
    from public.organizations as organization
    join public.verification_requests as request
      on request.id = organization.business_verification_request_id
    join public.profiles as submitter
      on submitter.id = request.profile_id
    join auth.users as submitter_auth
      on submitter_auth.id = submitter.id
    join public.organization_members as membership
      on membership.organization_id = organization.id
      and membership.profile_id = submitter.id
    where organization.id = p_organization_id
      and organization.deleted_at is null
      and organization.organization_type = 'advertiser'
      and organization.business_verification_status = 'approved'
      and organization.business_verified_at is not null
      and request.target_type = 'advertiser_organization'
      and request.verification_type = 'business_registration_certificate'
      and request.status = 'approved'
      and request.reviewed_at is not null
      and request.organization_id = organization.id
      and request.target_id = organization.id::text
      and request.data_origin = 'production'
      and submitter.data_origin = 'production'
      and submitter.role::text = 'marketer'
      and membership.role::text in ('owner', 'admin', 'marketer')
      and directsign_private.directsign_email_is_operational(
        request.submitted_by_email
      )
      and directsign_private.directsign_email_is_operational(submitter.email)
      and directsign_private.directsign_email_is_operational(
        submitter_auth.email
      )
      and lower(coalesce(submitter_auth.raw_app_meta_data, '{}'::jsonb)::text)
        !~ '"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"[[:space:]]*:[[:space:]]*(true|"true"|1|"1")'
      and lower(coalesce(submitter_auth.raw_user_meta_data, '{}'::jsonb)::text)
        !~ '"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"[[:space:]]*:[[:space:]]*(true|"true"|1|"1")'
      and lower(coalesce(submitter_auth.raw_app_meta_data, '{}'::jsonb)::text)
        !~ '"(data_origin|environment)"[[:space:]]*:[[:space:]]*"(qa|demo|seed|test)"'
      and lower(coalesce(submitter_auth.raw_user_meta_data, '{}'::jsonb)::text)
        !~ '"(data_origin|environment)"[[:space:]]*:[[:space:]]*"(qa|demo|seed|test)"'
      and request.business_registration_number ~ '^[0-9]{10}$'
      and organization.business_registration_number =
        request.business_registration_number
      and btrim(coalesce(organization.representative_name, '')) <> ''
      and btrim(coalesce(request.representative_name, '')) <> ''
      and btrim(organization.representative_name) =
        btrim(request.representative_name)
      and not directsign_private.directsign_has_test_marker(
        organization.name
      )
      and not directsign_private.directsign_has_test_marker(
        organization.representative_name
      )
      and not directsign_private.directsign_has_test_marker(submitter.name)
      and not directsign_private.directsign_has_test_marker(
        submitter.company_name
      )
      and not directsign_private.directsign_has_test_marker(
        submitter.avatar_url
      )
      and not directsign_private.directsign_has_test_marker(
        request.subject_name
      )
      and not directsign_private.directsign_has_test_marker(
        request.representative_name
      )
      and not directsign_private.directsign_has_test_marker(
        request.submitted_by_name
      )
      and not directsign_private.directsign_has_test_marker(request.note)
      and not directsign_private.directsign_has_test_marker(
        request.reviewer_note
      )
      and not directsign_private.directsign_has_test_marker(
        request.reviewed_by_name
      )
      and not directsign_private.directsign_has_test_marker(
        request.evidence_file_name
      )
      and lower(coalesce(request.evidence_snapshot_json, '{}'::jsonb)::text)
        !~ '"(qa|test|demo|seed|qa_account|seeded|is_test|test_data|demo_account|seed_account)"[[:space:]]*:[[:space:]]*(true|"true"|1|"1")'
      and lower(coalesce(request.evidence_snapshot_json, '{}'::jsonb)::text)
        !~ '"(data_origin|environment)"[[:space:]]*:[[:space:]]*"(qa|demo|seed|test)"'
      and not directsign_private.directsign_has_test_marker(
        coalesce(request.evidence_snapshot_json, '{}'::jsonb)::text
      )
  );
end;
$$;

create or replace function public.get_progressive_campaign_access(
  p_organization_id uuid
)
returns table (
  published_count bigint,
  unverified_campaign_limit integer,
  next_campaign_number bigint,
  business_verified boolean,
  can_publish boolean,
  verification_required boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_published_count bigint;
  v_business_verified boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role is required';
  end if;

  if not exists (
    select 1
    from public.organizations as organization
    where organization.id = p_organization_id
      and organization.deleted_at is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'advertiser organization was not found';
  end if;

  select coalesce(counter.published_count, 0)
  into v_published_count
  from (select 1) as singleton
  left join public.marketplace_campaign_publication_counters as counter
    on counter.organization_id = p_organization_id;

  v_business_verified :=
    public.directsign_organization_business_verified(p_organization_id);

  return query select
    v_published_count,
    2,
    v_published_count + 1,
    v_business_verified,
    v_business_verified or v_published_count < 2,
    not v_business_verified and v_published_count >= 2;
end;
$$;

create or replace function public.publish_marketplace_campaign(
  p_campaign_id text,
  p_brand_profile_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid,
  p_campaign_data jsonb,
  p_publication_request_key text
)
returns table (
  result_allowed boolean,
  result_created boolean,
  result_campaign_id text,
  result_brand_profile_id uuid,
  result_campaign_data jsonb,
  result_status text,
  result_first_published_at timestamptz,
  result_organization_campaign_sequence bigint,
  result_verification_gate_basis text,
  result_published_count bigint,
  result_business_verified boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.marketplace_campaigns%rowtype;
  v_published_count bigint;
  v_next_sequence bigint;
  v_business_verified boolean;
  v_gate_basis text;
  v_publish_existing boolean := false;
  v_now timestamptz := clock_timestamp();
  v_mirror jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role is required';
  end if;
  if btrim(coalesce(p_campaign_id, '')) = '' then
    raise exception using errcode = '22023', message = 'campaign id is required';
  end if;
  if jsonb_typeof(p_campaign_data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'campaign data must be an object';
  end if;
  if btrim(coalesce(p_publication_request_key, '')) = ''
    or length(p_publication_request_key) > 128 then
    raise exception using
      errcode = '22023',
      message = 'publication request key is invalid';
  end if;
  if not exists (
    select 1
    from public.marketplace_brand_profiles as brand
    where brand.id = p_brand_profile_id
      and brand.organization_id = p_organization_id
      and brand.archived_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'campaign brand does not belong to the organization';
  end if;
  if not exists (
    select 1
    from public.organization_members as membership
    join public.profiles as actor
      on actor.id = membership.profile_id
    where membership.organization_id = p_organization_id
      and membership.profile_id = p_actor_profile_id
      and membership.role in ('owner', 'admin', 'marketer')
      and actor.role = 'marketer'
  ) then
    raise exception using
      errcode = '42501',
      message = 'campaign publication actor is not authorized';
  end if;

  -- A transaction-scoped organization lock protects the first insert when no
  -- counter row exists yet.  The counter row lock then serializes publications.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'marketplace-campaign-publication:' || p_organization_id::text,
      0
    )
  );

  insert into public.marketplace_campaign_publication_counters (
    organization_id,
    published_count,
    updated_at
  )
  values (p_organization_id, 0, v_now)
  on conflict (organization_id) do nothing;

  select counter.published_count
  into v_published_count
  from public.marketplace_campaign_publication_counters as counter
  where counter.organization_id = p_organization_id
  for update;

  select campaign.*
  into v_existing
  from public.marketplace_campaigns as campaign
  where campaign.organization_id = p_organization_id
    and (
      campaign.id = p_campaign_id
      or campaign.publication_request_key = p_publication_request_key
    )
  order by case when campaign.id = p_campaign_id then 0 else 1 end
  limit 1;

  if found then
    if v_existing.brand_profile_id <> p_brand_profile_id then
      raise exception using
        errcode = '23505',
        message = 'publication request key belongs to another campaign brand';
    end if;
    if v_existing.organization_campaign_sequence is not null then
      return query select
        true,
        false,
        v_existing.id,
        v_existing.brand_profile_id,
        v_existing.campaign_data,
        v_existing.status,
        v_existing.first_published_at,
        v_existing.organization_campaign_sequence,
        v_existing.verification_gate_basis,
        v_published_count,
        public.directsign_organization_business_verified(p_organization_id);
      return;
    end if;
    if v_existing.status <> 'draft'
      or v_existing.first_published_at is not null
      or v_existing.verification_gate_basis is not null then
      raise exception using
        errcode = '23514',
        message = 'campaign publication metadata is incomplete';
    end if;
    v_publish_existing := true;
  end if;

  v_business_verified :=
    public.directsign_organization_business_verified(p_organization_id);
  v_next_sequence := v_published_count + 1;

  if not v_business_verified and v_next_sequence > 2 then
    return query select
      false,
      false,
      p_campaign_id,
      p_brand_profile_id,
      p_campaign_data,
      'open'::text,
      null::timestamptz,
      null::bigint,
      null::text,
      v_published_count,
      v_business_verified;
    return;
  end if;

  v_gate_basis := case
    when v_next_sequence <= 2 then 'intro_exempt'
    else 'business_verified'
  end;

  if v_publish_existing then
    update public.marketplace_campaigns
    set
      campaign_data = p_campaign_data,
      status = 'open',
      first_published_at = v_now,
      organization_campaign_sequence = v_next_sequence,
      verification_gate_basis = v_gate_basis,
      publication_request_key = p_publication_request_key,
      updated_at = v_now
    where id = v_existing.id
      and organization_id = p_organization_id
      and organization_campaign_sequence is null
    returning * into v_existing;
  else
    insert into public.marketplace_campaigns (
      id,
      brand_profile_id,
      organization_id,
      campaign_data,
      status,
      first_published_at,
      organization_campaign_sequence,
      verification_gate_basis,
      publication_request_key,
      created_at,
      updated_at,
      archived_at
    )
    values (
      p_campaign_id,
      p_brand_profile_id,
      p_organization_id,
      p_campaign_data,
      'open',
      v_now,
      v_next_sequence,
      v_gate_basis,
      p_publication_request_key,
      v_now,
      v_now,
      null
    )
    returning * into v_existing;
  end if;

  update public.marketplace_campaign_publication_counters
  set published_count = v_next_sequence, updated_at = v_now
  where organization_id = p_organization_id;

  -- Keep the temporary JSON rollback mirror in the same transaction, after the
  -- authoritative row and sequence have both succeeded.
  select coalesce(
    jsonb_agg(mirror_row.campaign_document order by mirror_row.created_at desc, mirror_row.id desc),
    '[]'::jsonb
  )
  into v_mirror
  from (
    select
      campaign.id,
      campaign.created_at,
      campaign.campaign_data || jsonb_build_object(
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
  set
    active_campaigns = v_mirror,
    is_published = true,
    updated_at = v_now
  where id = p_brand_profile_id
    and organization_id = p_organization_id;

  return query select
    true,
    true,
    v_existing.id,
    v_existing.brand_profile_id,
    v_existing.campaign_data,
    v_existing.status,
    v_existing.first_published_at,
    v_existing.organization_campaign_sequence,
    v_existing.verification_gate_basis,
    v_next_sequence,
    v_business_verified;
end;
$$;

create or replace function public.directsign_campaign_contract_verification_exempt(
  p_contract_id uuid,
  p_organization_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'service role is required';
  end if;

  return exists (
    select 1
    from public.contracts as contract
    join public.marketplace_campaigns as campaign
      on campaign.id = contract.marketplace_campaign_id
      and campaign.organization_id = contract.owner_organization_id
    join public.marketplace_brand_profiles as brand
      on brand.id = campaign.brand_profile_id
      and brand.organization_id = campaign.organization_id
    join public.marketplace_contact_proposals as application
      on application.id::text = contract.source_application_id
      and application.direction = 'influencer_to_brand'
      and application.campaign_id = campaign.id
      and application.target_brand_profile_id = brand.id
      and application.converted_contract_id = contract.id
      and application.status in ('converted_to_contract', 'closed')
    join public.organization_members as membership
      on membership.organization_id = campaign.organization_id
      and membership.profile_id = p_actor_profile_id
      and membership.role in ('owner', 'admin', 'marketer')
    where contract.id = p_contract_id
      and contract.deleted_at is null
      and contract.owner_organization_id = p_organization_id
      and contract.workflow_source = 'marketplace_campaign'
      and campaign.verification_gate_basis = 'intro_exempt'
      and campaign.organization_campaign_sequence between 1 and 2
  );
end;
$$;

create or replace function public.directsign_protect_campaign_publication_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.marketplace_brand_profiles as brand
    where brand.id = new.brand_profile_id
      and brand.organization_id = new.organization_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'campaign brand and organization must match';
  end if;

  if tg_op = 'UPDATE' and (
    new.organization_id is distinct from old.organization_id
    or new.first_published_at is distinct from old.first_published_at
    or new.organization_campaign_sequence is distinct from old.organization_campaign_sequence
    or new.verification_gate_basis is distinct from old.verification_gate_basis
    or new.publication_request_key is distinct from old.publication_request_key
  ) then
    if not (
      old.status = 'draft'
      and old.first_published_at is null
      and old.organization_campaign_sequence is null
      and old.verification_gate_basis is null
      and old.publication_request_key is null
      and new.organization_id is not distinct from old.organization_id
      and new.status = 'open'
      and new.first_published_at is not null
      and new.organization_campaign_sequence is not null
      and new.verification_gate_basis in ('intro_exempt', 'business_verified')
      and new.publication_request_key is not null
    ) then
      raise exception using
        errcode = '55000',
        message = 'campaign publication identity is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_campaign_publication_identity_immutable
  on public.marketplace_campaigns;
create trigger marketplace_campaign_publication_identity_immutable
before insert or update of
  organization_id,
  brand_profile_id,
  first_published_at,
  organization_campaign_sequence,
  verification_gate_basis,
  publication_request_key
on public.marketplace_campaigns
for each row execute function public.directsign_protect_campaign_publication_identity();

create or replace function public.directsign_protect_contract_workflow_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workflow_source is distinct from old.workflow_source
    or new.marketplace_campaign_id is distinct from old.marketplace_campaign_id
    or new.source_application_id is distinct from old.source_application_id then
    raise exception using
      errcode = '55000',
      message = 'contract workflow provenance is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists contract_workflow_provenance_immutable
  on public.contracts;
create trigger contract_workflow_provenance_immutable
before update of workflow_source, marketplace_campaign_id, source_application_id
on public.contracts
for each row execute function public.directsign_protect_contract_workflow_provenance();

revoke execute on function public.directsign_organization_business_verified(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_progressive_campaign_access(uuid)
  from public, anon, authenticated;
revoke execute on function public.publish_marketplace_campaign(
  text, uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated;
revoke execute on function public.directsign_campaign_contract_verification_exempt(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke execute on function public.directsign_protect_campaign_publication_identity()
  from public, anon, authenticated;
revoke execute on function public.directsign_protect_contract_workflow_provenance()
  from public, anon, authenticated;
revoke execute on function directsign_private.directsign_email_is_operational(text)
  from public, anon, authenticated;
revoke execute on function directsign_private.directsign_has_test_marker(text)
  from public, anon, authenticated;

grant execute on function public.directsign_organization_business_verified(uuid)
  to service_role;
grant execute on function public.get_progressive_campaign_access(uuid)
  to service_role;
grant execute on function public.publish_marketplace_campaign(
  text, uuid, uuid, uuid, jsonb, text
) to service_role;
grant execute on function public.directsign_campaign_contract_verification_exempt(
  uuid, uuid, uuid
) to service_role;
grant execute on function public.directsign_protect_campaign_publication_identity()
  to service_role;
grant execute on function public.directsign_protect_contract_workflow_provenance()
  to service_role;

comment on column public.marketplace_campaigns.organization_campaign_sequence is
  'Immutable organization-wide lifetime publication number; status, archive, and brand changes never reset it.';
comment on column public.marketplace_campaigns.verification_gate_basis is
  'Immutable publication authorization basis: intro_exempt, business_verified, or grandfathered.';
comment on table public.marketplace_campaign_publication_counters is
  'Monotonic organization-wide campaign publication counter retained independently from campaign lifecycle state.';
