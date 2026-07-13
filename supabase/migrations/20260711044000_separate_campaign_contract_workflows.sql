-- Keep campaign-selected contracts out of the independent 1:1 workflow and
-- make campaign applications idempotent across concurrent tabs and retries.

alter table public.contracts
  add column if not exists workflow_source text not null default 'one_to_one',
  add column if not exists marketplace_campaign_id text,
  add column if not exists source_application_id text;

alter table public.contracts
  drop constraint if exists contracts_workflow_source_allowed;
alter table public.contracts
  add constraint contracts_workflow_source_allowed check (
    workflow_source in ('one_to_one', 'marketplace_campaign')
  );

update public.contracts as contract_row
set
  workflow_source = 'marketplace_campaign',
  marketplace_campaign_id = nullif(
    legacy.contract -> 'campaign' ->> 'marketplace_campaign_id',
    ''
  ),
  source_application_id = nullif(
    legacy.contract -> 'campaign' ->> 'source_application_id',
    ''
  )
from public.directsign_contracts as legacy
where legacy.id = coalesce(contract_row.legacy_contract_id, contract_row.id::text)
  and legacy.contract -> 'campaign' ->> 'source' = 'marketplace_campaign';

create index if not exists contracts_workflow_source_updated_idx
  on public.contracts (workflow_source, updated_at desc)
  where deleted_at is null;

create index if not exists contracts_marketplace_campaign_idx
  on public.contracts (marketplace_campaign_id, updated_at desc)
  where marketplace_campaign_id is not null and deleted_at is null;

create unique index if not exists marketplace_campaign_application_actor_unique
  on public.marketplace_contact_proposals (campaign_id, sender_profile_id)
  where direction = 'influencer_to_brand'
    and campaign_id is not null
    and sender_profile_id is not null;

alter table public.marketplace_influencer_profiles
  add column if not exists data_origin text not null default 'production';
alter table public.marketplace_brand_profiles
  add column if not exists data_origin text not null default 'production';

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_data_origin_allowed;
alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_data_origin_allowed check (
    data_origin in ('production', 'qa', 'demo', 'seed')
  );
alter table public.marketplace_brand_profiles
  drop constraint if exists marketplace_brand_profiles_data_origin_allowed;
alter table public.marketplace_brand_profiles
  add constraint marketplace_brand_profiles_data_origin_allowed check (
    data_origin in ('production', 'qa', 'demo', 'seed')
  );

update public.marketplace_influencer_profiles as marketplace_profile
set data_origin = coalesce(owner_profile.data_origin, 'production')
from public.profiles as owner_profile
where owner_profile.id = marketplace_profile.owner_profile_id;

update public.marketplace_brand_profiles as brand
set data_origin = coalesce(
  (
    select member_profile.data_origin
    from public.organization_members as membership
    join public.profiles as member_profile
      on member_profile.id = membership.profile_id
    where membership.organization_id = brand.organization_id
      and membership.role in ('owner', 'admin', 'marketer')
      and member_profile.data_origin in ('qa', 'demo', 'seed')
    order by case member_profile.data_origin
      when 'qa' then 0
      when 'demo' then 1
      else 2
    end
    limit 1
  ),
  'production'
);

create index if not exists marketplace_influencer_profiles_data_origin_idx
  on public.marketplace_influencer_profiles (data_origin, updated_at desc);
create index if not exists marketplace_brand_profiles_data_origin_idx
  on public.marketplace_brand_profiles (data_origin, updated_at desc);

alter table public.marketplace_contact_proposals
  add column if not exists sender_brand_profile_id uuid
    references public.marketplace_brand_profiles (id) on delete set null,
  add column if not exists data_origin text not null default 'production',
  add column if not exists request_key text;

alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_data_origin_allowed;
alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_data_origin_allowed check (
    data_origin in ('production', 'qa', 'demo', 'seed')
  );

update public.marketplace_contact_proposals as proposal
set sender_brand_profile_id = (
  select brand.id
  from public.marketplace_brand_profiles as brand
  where brand.organization_id = proposal.sender_organization_id
  order by
    case when lower(btrim(brand.display_name)) = lower(btrim(proposal.sender_name)) then 0 else 1 end,
    case when coalesce(brand.is_default, false) then 0 else 1 end,
    brand.created_at asc
  limit 1
)
where proposal.direction = 'advertiser_to_influencer'
  and proposal.sender_brand_profile_id is null
  and proposal.sender_organization_id is not null;

update public.marketplace_contact_proposals as proposal
set data_origin = coalesce(
  (
    select profile.data_origin
    from public.profiles as profile
    where profile.id = proposal.sender_profile_id
      and profile.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  (
    select target_owner.data_origin
    from public.marketplace_influencer_profiles as target_profile
    join public.profiles as target_owner
      on target_owner.id = target_profile.owner_profile_id
    where target_profile.id = proposal.target_influencer_profile_id
      and target_owner.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  (
    select organization_owner.data_origin
    from public.marketplace_brand_profiles as target_brand
    join public.organization_members as target_membership
      on target_membership.organization_id = target_brand.organization_id
    join public.profiles as organization_owner
      on organization_owner.id = target_membership.profile_id
    where target_brand.id = proposal.target_brand_profile_id
      and target_membership.role in ('owner', 'admin', 'marketer')
      and organization_owner.data_origin in ('qa', 'demo', 'seed')
    order by case organization_owner.data_origin
      when 'qa' then 0
      when 'demo' then 1
      else 2
    end
    limit 1
  ),
  'production'
);

create index if not exists marketplace_contact_proposals_sender_brand_idx
  on public.marketplace_contact_proposals (sender_brand_profile_id, created_at desc)
  where sender_brand_profile_id is not null;

create unique index if not exists marketplace_contact_proposals_request_key_unique
  on public.marketplace_contact_proposals (request_key)
  where request_key is not null;

create or replace function public.transition_marketplace_contact_proposal(
  p_proposal_id uuid,
  p_expected_statuses text[],
  p_next_status text,
  p_converted_contract_id text default null
)
returns table (
  proposal_id uuid,
  previous_status text,
  current_status text,
  current_converted_contract_id text,
  changed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  proposal_row public.marketplace_contact_proposals%rowtype;
  status_before text;
begin
  if p_next_status not in (
    'submitted',
    'reviewed',
    'accepted',
    'declined',
    'converted_to_contract',
    'closed'
  ) then
    raise exception 'unsupported marketplace proposal status';
  end if;

  if p_next_status = 'converted_to_contract'
    and btrim(coalesce(p_converted_contract_id, '')) = '' then
    raise exception 'converted contract id is required';
  end if;

  select *
  into proposal_row
  from public.marketplace_contact_proposals
  where id = p_proposal_id
  for update;

  if not found then
    return;
  end if;

  status_before := proposal_row.status;
  if not (proposal_row.status = any(coalesce(p_expected_statuses, '{}'::text[]))) then
    return query select
      proposal_row.id,
      status_before,
      proposal_row.status,
      proposal_row.converted_contract_id,
      false;
    return;
  end if;

  update public.marketplace_contact_proposals
  set
    status = p_next_status,
    converted_contract_id = case
      when p_next_status = 'converted_to_contract' then p_converted_contract_id
      else converted_contract_id
    end,
    updated_at = now()
  where id = p_proposal_id
  returning * into proposal_row;

  return query select
    proposal_row.id,
    status_before,
    proposal_row.status,
    proposal_row.converted_contract_id,
    true;
end;
$$;

revoke execute on function public.transition_marketplace_contact_proposal(
  uuid,
  text[],
  text,
  text
) from public, anon, authenticated;
grant execute on function public.transition_marketplace_contact_proposal(
  uuid,
  text[],
  text,
  text
) to service_role;

create or replace function public.consume_directsign_rate_limit(
  p_bucket_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
  current_reset timestamptz;
begin
  if btrim(coalesce(p_bucket_key, '')) = '' then
    raise exception 'bucket key is required';
  end if;
  if p_max_attempts < 1 or p_window_seconds < 1 then
    raise exception 'rate limit bounds must be positive';
  end if;

  if random() < 0.01 then
    delete from public.directsign_rate_limit_buckets
    where reset_at < now() - interval '1 day';
  end if;

  insert into public.directsign_rate_limit_buckets (
    bucket_key,
    attempt_count,
    reset_at,
    updated_at
  )
  values (
    p_bucket_key,
    1,
    now() + make_interval(secs => p_window_seconds),
    now()
  )
  on conflict (bucket_key) do update
  set
    attempt_count = case
      when directsign_rate_limit_buckets.reset_at <= now() then 1
      else directsign_rate_limit_buckets.attempt_count + 1
    end,
    reset_at = case
      when directsign_rate_limit_buckets.reset_at <= now()
        then now() + make_interval(secs => p_window_seconds)
      else directsign_rate_limit_buckets.reset_at
    end,
    updated_at = now()
  returning attempt_count, reset_at into current_count, current_reset;

  return query select
    current_count > p_max_attempts,
    greatest(
      0,
      ceil(extract(epoch from (current_reset - now())))::integer
    );
end;
$$;

revoke execute on function public.consume_directsign_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_directsign_rate_limit(text, integer, integer)
  to service_role;

comment on column public.contracts.workflow_source is
  'one_to_one for independent contracts; marketplace_campaign for selected-person campaign contracts.';

comment on column public.marketplace_contact_proposals.sender_brand_profile_id is
  'Authoritative advertiser brand used when an advertiser sends a one-to-one proposal.';
comment on column public.marketplace_contact_proposals.request_key is
  'Short-lived server-derived idempotency key for proposal creation retries.';
