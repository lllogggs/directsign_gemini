alter type public.directsign_ownership_verification_method
  add value if not exists 'instagram_dm_code';

alter table public.verification_requests
  add column if not exists ownership_challenge_code_hash text,
  add column if not exists ownership_challenge_code_ciphertext text,
  add column if not exists ownership_challenge_expires_at timestamptz,
  add column if not exists ownership_challenge_consumed_at timestamptz,
  add column if not exists ownership_challenge_message_id_hash text,
  add column if not exists ownership_challenge_sender_id_hash text;

alter table public.verification_requests
  drop constraint if exists verification_requests_ownership_code_hash_format;
alter table public.verification_requests
  add constraint verification_requests_ownership_code_hash_format check (
    ownership_challenge_code_hash is null
    or ownership_challenge_code_hash ~ '^[0-9a-f]{64}$'
  );

alter table public.verification_requests
  drop constraint if exists verification_requests_ownership_ciphertext_format;
alter table public.verification_requests
  add constraint verification_requests_ownership_ciphertext_format check (
    ownership_challenge_code_ciphertext is null
    or ownership_challenge_code_ciphertext ~ '^igdm:v1:[A-Za-z0-9_-]+$'
  );

alter table public.verification_requests
  drop constraint if exists verification_requests_ownership_event_hash_format;
alter table public.verification_requests
  add constraint verification_requests_ownership_event_hash_format check (
    (
      ownership_challenge_message_id_hash is null
      or ownership_challenge_message_id_hash ~ '^[0-9a-f]{64}$'
    )
    and (
      ownership_challenge_sender_id_hash is null
      or ownership_challenge_sender_id_hash ~ '^[0-9a-f]{64}$'
    )
  );

alter table public.verification_requests
  drop constraint if exists verification_requests_ownership_challenge_times;
alter table public.verification_requests
  add constraint verification_requests_ownership_challenge_times check (
    (
      ownership_challenge_expires_at is null
      or ownership_challenge_expires_at > created_at
    )
    and (
      ownership_challenge_consumed_at is null
      or ownership_challenge_consumed_at >= created_at
    )
  );

create unique index if not exists verification_requests_active_challenge_hash_idx
  on public.verification_requests (ownership_challenge_code_hash)
  where ownership_challenge_code_hash is not null;

create unique index if not exists verification_requests_one_active_instagram_dm_idx
  on public.verification_requests (
    profile_id,
    platform,
    lower(regexp_replace(platform_handle, '^@+', ''))
  )
  where ownership_challenge_code_hash is not null;

comment on column public.verification_requests.ownership_challenge_code_hash is
  'Keyed server hash used only to locate one active Instagram DM challenge.';
comment on column public.verification_requests.ownership_challenge_code_ciphertext is
  'AES-GCM ciphertext for authenticated challenge recovery; cleared on consume or expiry.';
comment on column public.verification_requests.ownership_challenge_expires_at is
  'Server-enforced expiry for a one-time ownership challenge.';
comment on column public.verification_requests.ownership_challenge_consumed_at is
  'Timestamp at which an ownership challenge was atomically consumed.';
