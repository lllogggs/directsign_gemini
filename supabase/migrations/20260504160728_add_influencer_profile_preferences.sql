alter table public.profiles
  add column if not exists activity_categories text[] not null default '{}',
  add column if not exists activity_platforms text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_activity_categories_allowed;

alter table public.profiles
  add constraint profiles_activity_categories_allowed
  check (
    activity_categories <@ array[
      'mukbang',
      'travel',
      'beauty',
      'fashion',
      'fitness',
      'tech',
      'game',
      'education',
      'lifestyle',
      'finance'
    ]::text[]
  );

alter table public.profiles
  drop constraint if exists profiles_activity_platforms_allowed;

alter table public.profiles
  add constraint profiles_activity_platforms_allowed
  check (
    activity_platforms <@ array[
      'instagram',
      'youtube',
      'tiktok',
      'naver_blog',
      'other'
    ]::text[]
  );

create index if not exists profiles_activity_categories_gin_idx
  on public.profiles using gin (activity_categories)
  where role = 'influencer';

create index if not exists profiles_activity_platforms_gin_idx
  on public.profiles using gin (activity_platforms)
  where role = 'influencer';
