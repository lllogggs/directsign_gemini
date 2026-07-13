alter table public.discovered_influencer_profiles
  add column if not exists naver_blog_visitor_average_4d bigint,
  add column if not exists naver_blog_visitor_counts jsonb not null default '[]'::jsonb,
  add column if not exists naver_blog_visitor_checked_at timestamptz,
  add column if not exists naver_blog_visitor_status text not null default 'not_checked',
  add column if not exists naver_blog_visitor_error text;

alter table public.discovered_influencer_profiles
  drop constraint if exists discovered_influencer_profiles_naver_visitor_average_nonnegative;

alter table public.discovered_influencer_profiles
  add constraint discovered_influencer_profiles_naver_visitor_average_nonnegative check (
    naver_blog_visitor_average_4d is null or naver_blog_visitor_average_4d >= 0
  );

alter table public.discovered_influencer_profiles
  drop constraint if exists discovered_influencer_profiles_naver_visitor_counts_array;

alter table public.discovered_influencer_profiles
  add constraint discovered_influencer_profiles_naver_visitor_counts_array check (
    jsonb_typeof(naver_blog_visitor_counts) = 'array'
  );

alter table public.discovered_influencer_profiles
  drop constraint if exists discovered_influencer_profiles_naver_visitor_status_allowed;

alter table public.discovered_influencer_profiles
  add constraint discovered_influencer_profiles_naver_visitor_status_allowed check (
    naver_blog_visitor_status in ('not_checked', 'available', 'unavailable', 'failed')
  );

create index if not exists discovered_influencer_profiles_naver_visitor_queue_idx
  on public.discovered_influencer_profiles (
    naver_blog_visitor_checked_at asc nulls first,
    id asc
  )
  where platform = 'naver_blog' and status = 'active';

create or replace function public.apply_discovered_naver_blog_visitor_metrics(
  p_updates jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'p_updates must be a JSON array';
  end if;

  with updates as (
    select *
    from jsonb_to_recordset(p_updates) as item(
      id uuid,
      visitor_status text,
      visitor_average_4d bigint,
      visitor_counts jsonb,
      checked_at timestamptz,
      error_message text
    )
  )
  update public.discovered_influencer_profiles as profile
  set
    naver_blog_visitor_status = updates.visitor_status,
    naver_blog_visitor_average_4d = case
      when updates.visitor_status = 'available' then updates.visitor_average_4d
      else null
    end,
    naver_blog_visitor_counts = case
      when updates.visitor_status = 'available'
        then coalesce(updates.visitor_counts, '[]'::jsonb)
      else '[]'::jsonb
    end,
    naver_blog_visitor_checked_at = updates.checked_at,
    naver_blog_visitor_error = nullif(btrim(updates.error_message), ''),
    updated_at = greatest(profile.updated_at, updates.checked_at)
  from updates
  where
    profile.id = updates.id
    and profile.platform = 'naver_blog'
    and updates.visitor_status in ('available', 'unavailable', 'failed');

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.apply_discovered_naver_blog_visitor_metrics(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_discovered_naver_blog_visitor_metrics(jsonb)
  to service_role;

comment on column public.discovered_influencer_profiles.naver_blog_visitor_average_4d is
  'Public Naver Blog visitor average for the four completed KST days before today.';
comment on column public.discovered_influencer_profiles.naver_blog_visitor_counts is
  'The four dated public visitor counts used to calculate naver_blog_visitor_average_4d.';
comment on column public.discovered_influencer_profiles.naver_blog_visitor_checked_at is
  'Last time the public Naver Blog visitor counter was checked.';
comment on column public.discovered_influencer_profiles.naver_blog_visitor_status is
  'Whether the public Naver Blog visitor counter was available at the last weekly check.';
comment on function public.apply_discovered_naver_blog_visitor_metrics(jsonb) is
  'Service-role-only batch update for public Naver Blog visitor metrics.';
