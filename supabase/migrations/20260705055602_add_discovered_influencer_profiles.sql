create table if not exists public.discovered_influencer_profiles (
  id uuid primary key,
  platform public.directsign_platform_type not null,
  public_handle text not null,
  external_id text not null,
  platform_handle text not null,
  display_name text not null,
  headline text not null default '',
  bio text not null default '',
  profile_url text not null,
  avatar_url text,
  categories text[] not null default '{}'::text[],
  audience_countries text[] not null default array['south_korea']::text[],
  audience_tags text[] not null default '{}'::text[],
  followers_label text not null default '공개 지표 확인',
  follower_count bigint,
  average_views bigint,
  post_count bigint,
  quality_score integer not null default 0,
  status text not null default 'needs_review',
  source_provider text not null default 'official_api',
  source_keyword text,
  source_url text,
  source_evidence jsonb not null default '{}'::jsonb,
  claimed_marketplace_profile_id uuid references public.marketplace_influencer_profiles (id) on delete set null,
  discovered_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovered_influencer_profiles_handle_format check (
    public_handle ~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$'
  ),
  constraint discovered_influencer_profiles_display_name_not_blank check (btrim(display_name) <> ''),
  constraint discovered_influencer_profiles_platform_handle_not_blank check (btrim(platform_handle) <> ''),
  constraint discovered_influencer_profiles_external_id_not_blank check (btrim(external_id) <> ''),
  constraint discovered_influencer_profiles_profile_url_http check (profile_url ~* '^https?://'),
  constraint discovered_influencer_profiles_avatar_url_http check (
    avatar_url is null or avatar_url ~* '^https?://'
  ),
  constraint discovered_influencer_profiles_nonnegative_counts check (
    (follower_count is null or follower_count >= 0)
    and (average_views is null or average_views >= 0)
    and (post_count is null or post_count >= 0)
  ),
  constraint discovered_influencer_profiles_quality_score_range check (
    quality_score between 0 and 100
  ),
  constraint discovered_influencer_profiles_status_allowed check (
    status in ('active', 'needs_review', 'hidden', 'claimed')
  ),
  constraint discovered_influencer_profiles_source_evidence_object check (
    jsonb_typeof(source_evidence) = 'object'
  )
);

create unique index if not exists discovered_influencer_profiles_platform_external_uidx
  on public.discovered_influencer_profiles (platform, lower(external_id));

create unique index if not exists discovered_influencer_profiles_public_handle_uidx
  on public.discovered_influencer_profiles (lower(public_handle));

create index if not exists discovered_influencer_profiles_status_quality_idx
  on public.discovered_influencer_profiles (status, quality_score desc, last_checked_at desc);

create index if not exists discovered_influencer_profiles_categories_gin_idx
  on public.discovered_influencer_profiles using gin (categories);

create index if not exists discovered_influencer_profiles_audience_countries_gin_idx
  on public.discovered_influencer_profiles using gin (audience_countries);

drop trigger if exists discovered_influencer_profiles_touch_updated_at
  on public.discovered_influencer_profiles;
create trigger discovered_influencer_profiles_touch_updated_at
before update on public.discovered_influencer_profiles
for each row execute function public.directsign_touch_updated_at();

alter table public.discovered_influencer_profiles enable row level security;

revoke all
  on table public.discovered_influencer_profiles
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.discovered_influencer_profiles
  to service_role;

comment on table public.discovered_influencer_profiles is
  'Server-only public-source influencer discovery candidates. These are not user accounts and must be exposed only through curated server APIs.';

comment on column public.discovered_influencer_profiles.claimed_marketplace_profile_id is
  'Set when the discovered public profile is later claimed by a real marketplace influencer profile.';

notify pgrst, 'reload schema';
