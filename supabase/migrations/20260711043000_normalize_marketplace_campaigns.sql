-- Move campaigns out of the brand profile JSON array so campaign history and
-- status updates remain independently queryable. The legacy JSON column stays
-- as a temporary rollback mirror while the server dual-writes both stores.

create table if not exists public.marketplace_campaigns (
  id text primary key,
  brand_profile_id uuid not null references public.marketplace_brand_profiles (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  campaign_data jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint marketplace_campaigns_data_object check (
    jsonb_typeof(campaign_data) = 'object'
  ),
  constraint marketplace_campaigns_status_allowed check (
    status in ('open', 'draft', 'closed', 'ended')
  )
);

create index if not exists marketplace_campaigns_brand_created_idx
  on public.marketplace_campaigns (brand_profile_id, created_at desc)
  where archived_at is null;

create index if not exists marketplace_campaigns_organization_status_idx
  on public.marketplace_campaigns (organization_id, status, updated_at desc)
  where archived_at is null;

insert into public.marketplace_campaigns (
  id,
  brand_profile_id,
  organization_id,
  campaign_data,
  status,
  created_at,
  updated_at
)
select
  coalesce(
    nullif(campaign.item ->> 'id', ''),
    brand.id::text || ':legacy:' || campaign.ordinality::text
  ),
  brand.id,
  brand.organization_id,
  campaign.item,
  case
    when campaign.item ->> 'status' in ('open', 'draft', 'closed', 'ended')
      then campaign.item ->> 'status'
    else 'open'
  end,
  brand.created_at,
  brand.updated_at
from public.marketplace_brand_profiles as brand
cross join lateral jsonb_array_elements(brand.active_campaigns)
  with ordinality as campaign(item, ordinality)
where jsonb_typeof(campaign.item) = 'object'
on conflict (id) do nothing;

alter table public.marketplace_campaigns enable row level security;

revoke all on table public.marketplace_campaigns
  from public, anon, authenticated;

grant select, insert, update, delete on table public.marketplace_campaigns
  to service_role;

comment on table public.marketplace_campaigns is
  'Authoritative campaign rows. active_campaigns on marketplace_brand_profiles is a temporary rollback mirror.';
