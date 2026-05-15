alter table public.marketplace_contact_proposals
  add column if not exists campaign_id text,
  add column if not exists campaign_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists converted_contract_id uuid;

create index if not exists marketplace_contact_proposals_campaign_idx
  on public.marketplace_contact_proposals (campaign_id, created_at desc)
  where campaign_id is not null;

create index if not exists marketplace_contact_proposals_converted_contract_idx
  on public.marketplace_contact_proposals (converted_contract_id)
  where converted_contract_id is not null;

comment on column public.marketplace_contact_proposals.campaign_id is
  'Marketplace campaign id when an influencer applies directly to a posted campaign.';

comment on column public.marketplace_contact_proposals.campaign_snapshot is
  'Server-captured campaign terms used to create an initial contract draft after advertiser acceptance.';

comment on column public.marketplace_contact_proposals.converted_contract_id is
  'Contract id created when the advertiser accepts the campaign application.';
