alter table public.directsign_contracts
  add column if not exists campaign_name text,
  add column if not exists post_link text;

comment on column public.directsign_contracts.campaign_name is
  'Campaign grouping name shown to advertiser dashboards.';

comment on column public.directsign_contracts.post_link is
  'Influencer-submitted final post or content URL for campaign completion tracking.';
