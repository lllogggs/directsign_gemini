create or replace function public.directsign_consume_instagram_dm_challenge(
  p_request_id uuid,
  p_code_hash text,
  p_received_at timestamptz,
  p_auto_approve boolean,
  p_evidence_snapshot jsonb,
  p_message_id_hash text,
  p_sender_id_hash text,
  p_reviewer_note text,
  p_reviewed_by_name text
)
returns setof public.verification_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize the authority check with Instagram verification inserts. This
  -- closes the gap where a newer fallback could otherwise be inserted between
  -- a SELECT and the challenge-consuming UPDATE.
  lock table public.verification_requests in share row exclusive mode;

  return query
  update public.verification_requests as target
  set
    status = case
      when p_auto_approve then 'approved'::public.directsign_verification_status
      else 'pending'::public.directsign_verification_status
    end,
    evidence_snapshot_json = p_evidence_snapshot,
    ownership_challenge_code_hash = null,
    ownership_challenge_code_ciphertext = null,
    ownership_challenge_consumed_at = p_received_at,
    ownership_challenge_message_id_hash = p_message_id_hash,
    ownership_challenge_sender_id_hash = p_sender_id_hash,
    ownership_check_status = 'matched'::public.directsign_ownership_check_status,
    ownership_checked_at = p_received_at,
    reviewer_note = case when p_auto_approve then p_reviewer_note else target.reviewer_note end,
    reviewed_by_name = case when p_auto_approve then p_reviewed_by_name else target.reviewed_by_name end,
    reviewed_at = case when p_auto_approve then p_received_at else target.reviewed_at end,
    updated_at = p_received_at
  where target.id = p_request_id
    and target.target_type = 'influencer_account'
    and target.platform = 'instagram'
    and target.status = 'pending'
    and target.ownership_verification_method = 'instagram_dm_code'
    and target.ownership_challenge_code_hash = p_code_hash
    and target.ownership_challenge_consumed_at is null
    and target.ownership_challenge_expires_at > p_received_at
    and not exists (
      select 1
      from public.verification_requests as newer
      where newer.id <> target.id
        and coalesce(newer.profile_id::text, newer.target_id) =
          coalesce(target.profile_id::text, target.target_id)
        and newer.platform = 'instagram'
        and lower(regexp_replace(newer.platform_handle, '^@+', '')) =
          lower(regexp_replace(target.platform_handle, '^@+', ''))
        and newer.created_at >= target.created_at
    )
  returning target.*;
end;
$$;

create or replace function public.directsign_review_instagram_dm_challenge(
  p_request_id uuid,
  p_status text,
  p_reviewer_note text,
  p_reviewed_by_profile_id uuid,
  p_reviewed_by_name text,
  p_reviewed_at timestamptz,
  p_evidence_snapshot jsonb
)
returns setof public.verification_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid Instagram DM terminal status';
  end if;

  lock table public.verification_requests in share row exclusive mode;

  return query
  update public.verification_requests as target
  set
    status = p_status::public.directsign_verification_status,
    evidence_snapshot_json = p_evidence_snapshot,
    ownership_challenge_code_hash = null,
    ownership_challenge_code_ciphertext = null,
    ownership_challenge_consumed_at = p_reviewed_at,
    ownership_check_status = case
      when p_status = 'approved' then 'matched'::public.directsign_ownership_check_status
      else 'failed'::public.directsign_ownership_check_status
    end,
    ownership_checked_at = p_reviewed_at,
    reviewer_note = p_reviewer_note,
    reviewed_by_profile_id = p_reviewed_by_profile_id,
    reviewed_by_name = p_reviewed_by_name,
    reviewed_at = p_reviewed_at,
    updated_at = p_reviewed_at
  where target.id = p_request_id
    and target.target_type = 'influencer_account'
    and target.platform = 'instagram'
    and target.status = 'pending'
    and target.ownership_verification_method = 'instagram_dm_code'
    and coalesce(
      target.evidence_snapshot_json #>> '{ownership_verification,instagram_dm,state}',
      ''
    ) in ('manual_review', 'expired')
    and not exists (
      select 1
      from public.verification_requests as newer
      where newer.id <> target.id
        and coalesce(newer.profile_id::text, newer.target_id) =
          coalesce(target.profile_id::text, target.target_id)
        and newer.platform = 'instagram'
        and lower(regexp_replace(newer.platform_handle, '^@+', '')) =
          lower(regexp_replace(target.platform_handle, '^@+', ''))
        and newer.created_at >= target.created_at
    )
  returning target.*;
end;
$$;

revoke all on function public.directsign_consume_instagram_dm_challenge(
  uuid,
  text,
  timestamptz,
  boolean,
  jsonb,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.directsign_consume_instagram_dm_challenge(
  uuid,
  text,
  timestamptz,
  boolean,
  jsonb,
  text,
  text,
  text,
  text
) to service_role;

revoke all on function public.directsign_review_instagram_dm_challenge(
  uuid,
  text,
  text,
  uuid,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;
grant execute on function public.directsign_review_instagram_dm_challenge(
  uuid,
  text,
  text,
  uuid,
  text,
  timestamptz,
  jsonb
) to service_role;
