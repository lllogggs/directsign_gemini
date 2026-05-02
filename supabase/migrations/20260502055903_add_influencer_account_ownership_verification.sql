do $$
begin
  create type public.directsign_ownership_verification_method as enum (
    'profile_bio_code',
    'public_post_code',
    'channel_description_code',
    'screenshot_review'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.directsign_ownership_check_status as enum (
    'not_run',
    'matched',
    'not_found',
    'blocked',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.verification_requests
  add column if not exists ownership_verification_method public.directsign_ownership_verification_method,
  add column if not exists ownership_challenge_code text,
  add column if not exists ownership_challenge_url text,
  add column if not exists ownership_check_status public.directsign_ownership_check_status
    not null default 'not_run',
  add column if not exists ownership_checked_at timestamptz;

alter table public.verification_requests
  drop constraint if exists verification_requests_ownership_code_format;

alter table public.verification_requests
  add constraint verification_requests_ownership_code_format check (
    ownership_challenge_code is null
    or ownership_challenge_code ~ '^DS-[A-Z0-9]{4}-[A-Z0-9]{4}$'
  );

alter table public.verification_requests
  drop constraint if exists verification_requests_ownership_url_format;

alter table public.verification_requests
  add constraint verification_requests_ownership_url_format check (
    ownership_challenge_url is null
    or ownership_challenge_url ~* '^https?://'
  );

create index if not exists verification_requests_influencer_platform_idx
  on public.verification_requests (platform, platform_handle, created_at desc)
  where target_type = 'influencer_account';

comment on column public.verification_requests.ownership_verification_method is
  'How an influencer proves ownership of a platform account: profile code, public post, channel description, or screenshot review.';

comment on column public.verification_requests.ownership_challenge_code is
  'DirectSign challenge code the influencer must place on the public profile, channel, or proof post.';

comment on column public.verification_requests.ownership_check_status is
  'Best-effort server check result for the challenge code. Operator review remains authoritative.';
