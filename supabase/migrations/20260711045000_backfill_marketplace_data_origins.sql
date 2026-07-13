-- Backfill explicit operating/test origins for legacy records. Only trusted
-- profile relationships and the project's established QA email allowlist are
-- used; free-form customer text never decides an operating record's origin.

create or replace function public.directsign_migration_origin_for_email(
  p_email text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  email_local text := split_part(normalized_email, '@', 1);
  email_domain text := split_part(normalized_email, '@', 2);
begin
  if email_domain in (
    'directsign.app',
    'example.com',
    'example.net',
    'example.org',
    'test'
  ) or email_domain like '%.test' then
    return 'qa';
  end if;

  if email_local ~ '^(qa|test|demo|seed)[._-]'
    or email_local ~ '[._-](qa|test|demo|seed)([._-]|$)' then
    return 'qa';
  end if;

  if email_domain = 'yeollock.me' and email_local in (
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
  ) then
    return 'qa';
  end if;

  return 'production';
end;
$$;

update public.profiles
set data_origin = public.directsign_migration_origin_for_email(email)
where data_origin is null
   or (
     data_origin = 'production'
     and public.directsign_migration_origin_for_email(email) = 'qa'
   );

update public.marketplace_influencer_profiles as marketplace_profile
set data_origin = coalesce(owner_profile.data_origin, 'production')
from public.profiles as owner_profile
where owner_profile.id = marketplace_profile.owner_profile_id
  and marketplace_profile.data_origin is distinct from coalesce(
    owner_profile.data_origin,
    'production'
  );

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

update public.marketplace_contact_proposals as proposal
set data_origin = coalesce(
  (
    select sender_profile.data_origin
    from public.profiles as sender_profile
    where sender_profile.id = proposal.sender_profile_id
      and sender_profile.data_origin in ('qa', 'demo', 'seed')
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

update public.directsign_contracts as legacy_contract
set data_origin = coalesce(
  (
    select advertiser_profile.data_origin
    from public.profiles as advertiser_profile
    where advertiser_profile.id::text = legacy_contract.advertiser_id::text
      and advertiser_profile.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  case
    when public.directsign_migration_origin_for_email(
      legacy_contract.contract #>> '{advertiser_info,manager}'
    ) = 'qa'
      or public.directsign_migration_origin_for_email(
        legacy_contract.contract #>> '{influencer_info,contact}'
      ) = 'qa'
      or public.directsign_migration_origin_for_email(
        legacy_contract.contract #>> '{signature_data,signer_email}'
      ) = 'qa'
      then 'qa'
    else 'production'
  end
)
where legacy_contract.data_origin is null
   or legacy_contract.data_origin = 'production';

update public.contracts as contract_row
set data_origin = coalesce(
  (
    select creator_profile.data_origin
    from public.profiles as creator_profile
    where creator_profile.id = contract_row.created_by_profile_id
      and creator_profile.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  (
    select legacy_contract.data_origin
    from public.directsign_contracts as legacy_contract
    where legacy_contract.id = coalesce(
      contract_row.legacy_contract_id,
      contract_row.id::text
    )
      and legacy_contract.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  'production'
)
where contract_row.data_origin is null
   or contract_row.data_origin = 'production';

update public.verification_requests as verification
set data_origin = coalesce(
  (
    select requester_profile.data_origin
    from public.profiles as requester_profile
    where requester_profile.id = verification.profile_id
      and requester_profile.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  case
    when public.directsign_migration_origin_for_email(
      verification.submitted_by_email
    ) = 'qa' then 'qa'
    else 'production'
  end
)
where verification.data_origin is null
   or verification.data_origin = 'production';

update public.support_access_requests as access_request
set data_origin = coalesce(
  (
    select legacy_contract.data_origin
    from public.directsign_contracts as legacy_contract
    where legacy_contract.id = access_request.contract_id
      and legacy_contract.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  (
    select contract_row.data_origin
    from public.contracts as contract_row
    where contract_row.id::text = access_request.contract_id
      and contract_row.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  'production'
)
where access_request.data_origin is null
   or access_request.data_origin = 'production';

update public.operational_support_tickets as ticket
set data_origin = coalesce(
  (
    select legacy_contract.data_origin
    from public.directsign_contracts as legacy_contract
    where legacy_contract.id = ticket.contract_id
      and legacy_contract.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  (
    select contract_row.data_origin
    from public.contracts as contract_row
    where contract_row.id::text = ticket.contract_id
      and contract_row.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  'production'
)
where ticket.data_origin is null
   or ticket.data_origin = 'production';

drop function public.directsign_migration_origin_for_email(text);
