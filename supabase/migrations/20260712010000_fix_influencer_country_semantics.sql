alter table public.discovered_influencer_profiles
  alter column audience_countries set default '{}'::text[];

alter table public.discovered_influencer_profiles
  drop constraint if exists discovered_influencer_profiles_audience_countries_allowed;

alter table public.discovered_influencer_profiles
  add constraint discovered_influencer_profiles_audience_countries_allowed
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
      'australia',
      'canada',
      'germany',
      'india',
      'philippines',
      'bulgaria',
      'tanzania',
      'egypt',
      'global',
      'other'
    ]::text[]
  );

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
      'australia',
      'canada',
      'germany',
      'india',
      'philippines',
      'bulgaria',
      'tanzania',
      'egypt',
      'global',
      'other'
    ]::text[]
  );

comment on column public.discovered_influencer_profiles.audience_countries is
  'Creator country codes for discovery filters. Search locale and ranking market are not creator-country evidence; unknown stays empty.';

comment on column public.marketplace_influencer_profiles.audience_countries is
  'Creator country codes selected or verified for advertiser discovery filters.';

notify pgrst, 'reload schema';
