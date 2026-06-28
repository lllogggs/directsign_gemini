alter table public.marketplace_influencer_profiles
  add column if not exists audience_countries text[] not null default '{}'::text[];

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_audience_countries_allowed;

alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_audience_countries_allowed
  check (
    audience_countries <@ array[
      'south_korea',
      'japan',
      'taiwan',
      'hong_kong',
      'united_states',
      'china',
      'thailand',
      'vietnam',
      'indonesia',
      'singapore',
      'malaysia',
      'global'
    ]::text[]
  );

create index if not exists marketplace_influencer_profiles_audience_countries_gin_idx
  on public.marketplace_influencer_profiles using gin (audience_countries);

comment on column public.marketplace_influencer_profiles.audience_countries is
  'Country or market codes for the creator audience, used for advertiser discovery filters.';
