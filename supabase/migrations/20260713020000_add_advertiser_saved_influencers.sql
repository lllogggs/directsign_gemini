create table if not exists public.advertiser_saved_influencers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  influencer_public_handle text not null,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, influencer_public_handle),
  constraint advertiser_saved_influencers_handle_format check (
    influencer_public_handle ~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$'
  )
);

create index if not exists advertiser_saved_influencers_org_created_idx
  on public.advertiser_saved_influencers (organization_id, created_at desc);

alter table public.advertiser_saved_influencers enable row level security;

revoke all
  on table public.advertiser_saved_influencers
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.advertiser_saved_influencers
  to service_role;

comment on table public.advertiser_saved_influencers is
  'Server-only advertiser organization bookmarks for public influencer profiles.';

comment on column public.advertiser_saved_influencers.influencer_public_handle is
  'Normalized public creator handle. It may point to a registered or discovered creator profile.';

notify pgrst, 'reload schema';
