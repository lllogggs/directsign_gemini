create table if not exists public.marketplace_influencer_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null unique references public.profiles (id) on delete cascade,
  public_handle text not null,
  display_name text not null,
  headline text not null,
  bio text not null,
  location text not null default '활동 지역 미입력',
  avatar_label text not null default 'IN',
  categories text[] not null default '{}'::text[],
  audience text not null default '관심사 기반 팔로워',
  audience_tags text[] not null default '{}'::text[],
  collaboration_types text[] not null default '{}'::text[],
  starting_price_label text not null default '협의 가능',
  response_time_label text not null default '프로필 확인 후 응답',
  verified_label text not null default '공개 프로필 설정',
  brand_fit text[] not null default '{}'::text[],
  recent_brands text[] not null default '{}'::text[],
  portfolio jsonb not null default '[]'::jsonb,
  proposal_hints text[] not null default '{}'::text[],
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_influencer_profiles_handle_format check (
    public_handle ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$'
  ),
  constraint marketplace_influencer_profiles_display_name_not_blank check (btrim(display_name) <> ''),
  constraint marketplace_influencer_profiles_headline_not_blank check (btrim(headline) <> ''),
  constraint marketplace_influencer_profiles_bio_not_blank check (btrim(bio) <> ''),
  constraint marketplace_influencer_profiles_portfolio_array check (jsonb_typeof(portfolio) = 'array'),
  constraint marketplace_influencer_profiles_collaboration_types_allowed check (
    collaboration_types <@ array[
      'sponsored_post',
      'product_seeding',
      'ppl',
      'group_buy',
      'visit_review'
    ]::text[]
  )
);

create unique index if not exists marketplace_influencer_profiles_public_handle_uidx
  on public.marketplace_influencer_profiles (lower(public_handle));

create index if not exists marketplace_influencer_profiles_published_idx
  on public.marketplace_influencer_profiles (is_published, updated_at desc);

create index if not exists marketplace_influencer_profiles_categories_gin_idx
  on public.marketplace_influencer_profiles using gin (categories);

create table if not exists public.marketplace_influencer_channels (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.marketplace_influencer_profiles (id) on delete cascade,
  platform public.directsign_platform_type not null,
  label text not null,
  handle text not null,
  url text,
  followers_label text not null default '계정 연동',
  performance_label text not null default '프로필에서 확인',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_influencer_channels_label_not_blank check (btrim(label) <> ''),
  constraint marketplace_influencer_channels_handle_not_blank check (btrim(handle) <> ''),
  constraint marketplace_influencer_channels_url_http check (
    url is null or url ~* '^https?://'
  )
);

create unique index if not exists marketplace_influencer_channels_profile_platform_handle_uidx
  on public.marketplace_influencer_channels (profile_id, platform, lower(handle));

create index if not exists marketplace_influencer_channels_profile_sort_idx
  on public.marketplace_influencer_channels (profile_id, sort_order);

create table if not exists public.marketplace_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  public_handle text not null,
  display_name text not null,
  category text not null,
  headline text not null,
  description text not null,
  location text not null default '운영 지역 미입력',
  logo_label text not null default 'BR',
  preferred_platforms text[] not null default '{}'::text[],
  proposal_types text[] not null default '{}'::text[],
  budget_range_label text not null default '협의 가능',
  response_time_label text not null default '제안 확인 후 응답',
  status_label text not null default '입점 브랜드',
  fit_tags text[] not null default '{}'::text[],
  audience_targets text[] not null default '{}'::text[],
  active_campaigns jsonb not null default '[]'::jsonb,
  recent_creators text[] not null default '{}'::text[],
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_brand_profiles_handle_format check (
    public_handle ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$'
  ),
  constraint marketplace_brand_profiles_display_name_not_blank check (btrim(display_name) <> ''),
  constraint marketplace_brand_profiles_headline_not_blank check (btrim(headline) <> ''),
  constraint marketplace_brand_profiles_description_not_blank check (btrim(description) <> ''),
  constraint marketplace_brand_profiles_active_campaigns_array check (jsonb_typeof(active_campaigns) = 'array'),
  constraint marketplace_brand_profiles_platforms_allowed check (
    preferred_platforms <@ array['instagram', 'youtube', 'tiktok', 'naver_blog', 'other']::text[]
  ),
  constraint marketplace_brand_profiles_proposal_types_allowed check (
    proposal_types <@ array[
      'sponsored_post',
      'product_seeding',
      'ppl',
      'group_buy',
      'visit_review'
    ]::text[]
  )
);

create unique index if not exists marketplace_brand_profiles_public_handle_uidx
  on public.marketplace_brand_profiles (lower(public_handle));

create index if not exists marketplace_brand_profiles_published_idx
  on public.marketplace_brand_profiles (is_published, updated_at desc);

create index if not exists marketplace_brand_profiles_platforms_gin_idx
  on public.marketplace_brand_profiles using gin (preferred_platforms);

create table if not exists public.marketplace_contact_proposals (
  id uuid primary key default gen_random_uuid(),
  direction text not null,
  target_influencer_profile_id uuid references public.marketplace_influencer_profiles (id) on delete set null,
  target_brand_profile_id uuid references public.marketplace_brand_profiles (id) on delete set null,
  target_handle text not null,
  target_display_name text not null,
  sender_profile_id uuid references public.profiles (id) on delete set null,
  sender_organization_id uuid references public.organizations (id) on delete set null,
  sender_name text not null,
  sender_intro text not null,
  proposal_type text not null,
  proposal_summary text not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_contact_proposals_direction_allowed check (
    direction in ('advertiser_to_influencer', 'influencer_to_brand')
  ),
  constraint marketplace_contact_proposals_status_allowed check (
    status in ('submitted', 'reviewed', 'converted_to_contract', 'closed')
  ),
  constraint marketplace_contact_proposals_proposal_type_allowed check (
    proposal_type in (
      'sponsored_post',
      'product_seeding',
      'ppl',
      'group_buy',
      'visit_review'
    )
  ),
  constraint marketplace_contact_proposals_sender_not_blank check (btrim(sender_name) <> ''),
  constraint marketplace_contact_proposals_intro_not_blank check (btrim(sender_intro) <> ''),
  constraint marketplace_contact_proposals_summary_not_blank check (btrim(proposal_summary) <> '')
);

create index if not exists marketplace_contact_proposals_sender_idx
  on public.marketplace_contact_proposals (sender_profile_id, created_at desc);

create index if not exists marketplace_contact_proposals_target_influencer_idx
  on public.marketplace_contact_proposals (target_influencer_profile_id, created_at desc)
  where target_influencer_profile_id is not null;

create index if not exists marketplace_contact_proposals_target_brand_idx
  on public.marketplace_contact_proposals (target_brand_profile_id, created_at desc)
  where target_brand_profile_id is not null;

drop trigger if exists marketplace_influencer_profiles_touch_updated_at
  on public.marketplace_influencer_profiles;
create trigger marketplace_influencer_profiles_touch_updated_at
before update on public.marketplace_influencer_profiles
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists marketplace_influencer_channels_touch_updated_at
  on public.marketplace_influencer_channels;
create trigger marketplace_influencer_channels_touch_updated_at
before update on public.marketplace_influencer_channels
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists marketplace_brand_profiles_touch_updated_at
  on public.marketplace_brand_profiles;
create trigger marketplace_brand_profiles_touch_updated_at
before update on public.marketplace_brand_profiles
for each row execute function public.directsign_touch_updated_at();

drop trigger if exists marketplace_contact_proposals_touch_updated_at
  on public.marketplace_contact_proposals;
create trigger marketplace_contact_proposals_touch_updated_at
before update on public.marketplace_contact_proposals
for each row execute function public.directsign_touch_updated_at();

alter table public.marketplace_influencer_profiles enable row level security;
alter table public.marketplace_influencer_channels enable row level security;
alter table public.marketplace_brand_profiles enable row level security;
alter table public.marketplace_contact_proposals enable row level security;

drop policy if exists marketplace_influencer_profiles_select_public_or_owner
  on public.marketplace_influencer_profiles;
create policy marketplace_influencer_profiles_select_public_or_owner
on public.marketplace_influencer_profiles for select
to anon, authenticated
using (
  is_published
  or ((select auth.uid()) is not null and owner_profile_id = (select auth.uid()))
);

drop policy if exists marketplace_influencer_channels_select_public_or_owner
  on public.marketplace_influencer_channels;
create policy marketplace_influencer_channels_select_public_or_owner
on public.marketplace_influencer_channels for select
to anon, authenticated
using (
  exists (
    select 1
    from public.marketplace_influencer_profiles profiles
    where profiles.id = marketplace_influencer_channels.profile_id
      and (
        profiles.is_published
        or (
          (select auth.uid()) is not null
          and profiles.owner_profile_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists marketplace_brand_profiles_select_published
  on public.marketplace_brand_profiles;
create policy marketplace_brand_profiles_select_published
on public.marketplace_brand_profiles for select
to anon, authenticated
using (is_published);

revoke all on table
  public.marketplace_influencer_profiles,
  public.marketplace_influencer_channels,
  public.marketplace_brand_profiles,
  public.marketplace_contact_proposals
from public, anon, authenticated;

grant select on table
  public.marketplace_influencer_profiles,
  public.marketplace_influencer_channels,
  public.marketplace_brand_profiles
to anon, authenticated;

grant select, insert, update, delete on table
  public.marketplace_influencer_profiles,
  public.marketplace_influencer_channels,
  public.marketplace_brand_profiles,
  public.marketplace_contact_proposals
to service_role;

comment on table public.marketplace_influencer_profiles is
  'Public influencer marketplace profiles. Mutations go through server APIs so handle ownership, platform linkage, and audit context stay server controlled.';

comment on table public.marketplace_brand_profiles is
  'Public advertiser and brand marketplace profiles used by influencer discovery.';

comment on table public.marketplace_contact_proposals is
  'Initial mutual contact proposals between advertisers and influencers. Stored server-side; direct client Data API writes are intentionally not granted.';
