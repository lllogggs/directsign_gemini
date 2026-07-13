alter table public.discovered_influencer_profiles
  drop constraint if exists discovered_influencer_profiles_audience_countries_allowed;

alter table public.discovered_influencer_profiles
  add constraint discovered_influencer_profiles_audience_countries_allowed
  check (
    audience_countries is null
    or cardinality(audience_countries) = 0
    or array_to_string(audience_countries, ',') ~
      '^(south_korea|japan|taiwan|hong_kong|united_states|china|thailand|vietnam|indonesia|singapore|malaysia|australia|canada|germany|india|philippines|bulgaria|tanzania|egypt|global|other|iso_[a-z]{2})(,(south_korea|japan|taiwan|hong_kong|united_states|china|thailand|vietnam|indonesia|singapore|malaysia|australia|canada|germany|india|philippines|bulgaria|tanzania|egypt|global|other|iso_[a-z]{2}))*$'
  );

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_audience_countries_allowed;

alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_audience_countries_allowed
  check (
    audience_countries is null
    or cardinality(audience_countries) = 0
    or array_to_string(audience_countries, ',') ~
      '^(south_korea|japan|taiwan|hong_kong|united_states|china|thailand|vietnam|indonesia|singapore|malaysia|australia|canada|germany|india|philippines|bulgaria|tanzania|egypt|global|other|iso_[a-z]{2})(,(south_korea|japan|taiwan|hong_kong|united_states|china|thailand|vietnam|indonesia|singapore|malaysia|australia|canada|germany|india|philippines|bulgaria|tanzania|egypt|global|other|iso_[a-z]{2}))*$'
  );

comment on column public.discovered_influencer_profiles.audience_countries is
  'Creator country codes for discovery filters. Legacy names remain supported; other ISO 3166-1 countries use iso_xx. Search locale and ranking market are not creator-country evidence.';

comment on column public.marketplace_influencer_profiles.audience_countries is
  'Creator country codes selected or verified for advertiser discovery filters. Additional ISO 3166-1 countries use iso_xx.';

notify pgrst, 'reload schema';
