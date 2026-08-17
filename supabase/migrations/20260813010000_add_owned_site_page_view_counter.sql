create table if not exists public.site_page_view_counts (
  view_date date not null,
  page_key text not null check (
    page_key in (
      'public_home',
      'public_creators_en',
      'public_creators_ja',
      'public_creators_zh',
      'public_intro_advertiser',
      'public_intro_influencer',
      'public_privacy',
      'public_terms',
      'public_e_sign_consent',
      'public_resources_index'
    )
  ),
  view_count bigint not null default 0 check (view_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (view_date, page_key)
);

comment on table public.site_page_view_counts is
  'Aggregated public information-page requests. No cookie, IP, user, or device identifier is stored.';

alter table public.site_page_view_counts enable row level security;

revoke all on table public.site_page_view_counts from public, anon, authenticated;

create or replace function public.increment_site_page_view_count(
  p_page_key text
) returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  next_count bigint;
begin
  if p_page_key is null or p_page_key not in (
    'public_home',
    'public_creators_en',
    'public_creators_ja',
    'public_creators_zh',
    'public_intro_advertiser',
    'public_intro_influencer',
    'public_privacy',
    'public_terms',
    'public_e_sign_consent',
    'public_resources_index'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid public page key';
  end if;

  insert into public.site_page_view_counts (
    view_date,
    page_key,
    view_count
  ) values (
    timezone('Asia/Seoul', now())::date,
    p_page_key,
    1
  )
  on conflict (view_date, page_key)
  do update set
    view_count = public.site_page_view_counts.view_count + 1,
    updated_at = now()
  returning view_count into next_count;

  return next_count;
end;
$$;

revoke execute on function public.increment_site_page_view_count(text)
  from public, anon, authenticated;
grant execute on function public.increment_site_page_view_count(text)
  to service_role;
