-- Campaign application consent evidence and the expanded campaign type set.
-- Existing applications remain readable with a NULL consent snapshot. This
-- expand step adds validated, immutable evidence storage before the matching
-- server release; a follow-up migration enables the INSERT requirement after
-- that release is serving production traffic.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_collaboration_types_allowed;

alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_collaboration_types_allowed check (
    collaboration_types <@ array[
      'sponsored_post',
      'product_seeding',
      'supporters',
      'experience_group',
      'ppl',
      'group_buy',
      'visit_review',
      'other'
    ]::text[]
  );

alter table public.marketplace_brand_profiles
  drop constraint if exists marketplace_brand_profiles_proposal_types_allowed;

alter table public.marketplace_brand_profiles
  add constraint marketplace_brand_profiles_proposal_types_allowed check (
    proposal_types <@ array[
      'sponsored_post',
      'product_seeding',
      'supporters',
      'experience_group',
      'ppl',
      'group_buy',
      'visit_review',
      'other'
    ]::text[]
  );

alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_proposal_type_allowed;

alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_proposal_type_allowed check (
    proposal_type in (
      'sponsored_post',
      'product_seeding',
      'supporters',
      'experience_group',
      'ppl',
      'group_buy',
      'visit_review',
      'other'
    )
  );

alter table public.marketplace_contact_proposals
  add column if not exists application_consent_snapshot jsonb;

create or replace function public.directsign_campaign_application_consent_snapshot_valid(
  p_snapshot jsonb,
  p_sender_profile_id uuid,
  p_campaign_id text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_item_id text;
  v_item_text text;
  v_ids text[] := array[]::text[];
begin
  if p_snapshot is null then
    return true;
  end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or (p_snapshot - 'version' - 'items' - 'accepted_at' - 'actor_profile_id' - 'campaign_id')
      <> '{}'::jsonb
    or jsonb_typeof(p_snapshot -> 'version') is distinct from 'string'
    or (p_snapshot ->> 'version') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_snapshot -> 'items') is distinct from 'array'
    or jsonb_array_length(p_snapshot -> 'items') > 8
    or jsonb_typeof(p_snapshot -> 'accepted_at') is distinct from 'string'
    or btrim(p_snapshot ->> 'accepted_at') = ''
    or not pg_catalog.pg_input_is_valid(
      nullif(p_snapshot ->> 'accepted_at', ''),
      'timestamp with time zone'
    )
    or jsonb_typeof(p_snapshot -> 'actor_profile_id') is distinct from 'string'
    or (p_snapshot ->> 'actor_profile_id') is distinct from p_sender_profile_id::text
    or jsonb_typeof(p_snapshot -> 'campaign_id') is distinct from 'string'
    or (p_snapshot ->> 'campaign_id') is distinct from p_campaign_id then
    return false;
  end if;

  for v_item in
    select item
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'items') as consent(item)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or (v_item - 'id' - 'text') <> '{}'::jsonb
      or jsonb_typeof(v_item -> 'id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'text') is distinct from 'string' then
      return false;
    end if;

    v_item_id := btrim(v_item ->> 'id');
    v_item_text := btrim(v_item ->> 'text');
    if v_item_id = ''
      or char_length(v_item_id) > 80
      or v_item_text = ''
      or char_length(v_item_text) > 300
      or v_item_id = any(v_ids) then
      return false;
    end if;
    v_ids := array_append(v_ids, v_item_id);
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke execute on function public.directsign_campaign_application_consent_snapshot_valid(
  jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.directsign_campaign_application_consent_snapshot_valid(
  jsonb, uuid, text
) to service_role;

alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_application_consent_snapshot_valid;

alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_application_consent_snapshot_valid check (
    public.directsign_campaign_application_consent_snapshot_valid(
      application_consent_snapshot,
      sender_profile_id,
      campaign_id
    )
  );

create or replace function public.directsign_protect_campaign_application_consent_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.application_consent_snapshot is distinct from old.application_consent_snapshot then
    raise exception using
      errcode = '55000',
      message = 'campaign application consent snapshot is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_campaign_application_consent_snapshot_guard
  on public.marketplace_contact_proposals;
create trigger marketplace_campaign_application_consent_snapshot_guard
before insert or update of application_consent_snapshot
on public.marketplace_contact_proposals
for each row execute function public.directsign_protect_campaign_application_consent_snapshot();

revoke execute on function public.directsign_protect_campaign_application_consent_snapshot()
  from public, anon, authenticated;
grant execute on function public.directsign_protect_campaign_application_consent_snapshot()
  to service_role;

comment on column public.marketplace_contact_proposals.application_consent_snapshot is
  'Immutable server-captured evidence of the exact campaign consents accepted by the applying influencer.';
