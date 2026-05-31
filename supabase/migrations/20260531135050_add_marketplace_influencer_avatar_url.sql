alter table public.marketplace_influencer_profiles
  add column if not exists avatar_url text;

alter table public.marketplace_brand_profiles
  add column if not exists logo_url text;

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_avatar_url_format;

alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_avatar_url_format
  check (avatar_url is null or avatar_url ~* '^(https?://|/)');

alter table public.marketplace_brand_profiles
  drop constraint if exists marketplace_brand_profiles_logo_url_format;

alter table public.marketplace_brand_profiles
  add constraint marketplace_brand_profiles_logo_url_format
  check (logo_url is null or logo_url ~* '^(https?://|/)');

comment on column public.marketplace_influencer_profiles.avatar_url is
  'Public profile image URL for influencer discovery, campaign applicants, and profile pages.';

comment on column public.marketplace_brand_profiles.logo_url is
  'Public brand logo or representative image URL for campaign discovery and brand profile pages.';
