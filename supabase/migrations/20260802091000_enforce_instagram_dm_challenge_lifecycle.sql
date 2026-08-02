do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verification_requests_terminal_dm_challenge_cleared_chk'
      and conrelid = 'public.verification_requests'::regclass
  ) then
    alter table public.verification_requests
      add constraint verification_requests_terminal_dm_challenge_cleared_chk
      check (
        coalesce(ownership_verification_method::text, '') <> 'instagram_dm_code'
        or status = 'pending'
        or (
          ownership_challenge_code_hash is null
          and ownership_challenge_code_ciphertext is null
        )
      ) not valid;
  end if;
end
$$;

alter table public.verification_requests
  validate constraint verification_requests_terminal_dm_challenge_cleared_chk;
