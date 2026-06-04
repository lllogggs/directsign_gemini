-- Cache optimization support indexes.
-- These indexes match the dashboard bootstrap, marketplace messaging, and
-- campaign application query shapes so short-lived app caches refill quickly.

create index if not exists directsign_contracts_advertiser_updated_idx
  on public.directsign_contracts (advertiser_id, updated_at desc);

create index if not exists directsign_contracts_advertiser_status_updated_idx
  on public.directsign_contracts (advertiser_id, status, updated_at desc);

create index if not exists marketplace_contact_proposals_sender_direction_created_idx
  on public.marketplace_contact_proposals (
    sender_profile_id,
    direction,
    created_at desc
  );

create index if not exists marketplace_contact_proposals_target_brand_direction_created_idx
  on public.marketplace_contact_proposals (
    target_brand_profile_id,
    direction,
    created_at desc
  )
  where target_brand_profile_id is not null;

create index if not exists marketplace_contact_proposals_target_influencer_direction_created_idx
  on public.marketplace_contact_proposals (
    target_influencer_profile_id,
    direction,
    created_at desc
  )
  where target_influencer_profile_id is not null;

create index if not exists marketplace_contact_proposals_campaign_status_created_idx
  on public.marketplace_contact_proposals (
    campaign_id,
    status,
    created_at desc
  )
  where campaign_id is not null;

create index if not exists contract_parties_profile_role_contract_idx
  on public.contract_parties (profile_id, party_role, contract_id)
  where profile_id is not null;

create index if not exists contract_events_contract_type_created_idx
  on public.contract_events (contract_id, event_type, created_at desc);
