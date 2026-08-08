-- Campaign-scoped applicant contact collection with immutable consent evidence.
-- Raw phone/email values remain only on the private application row and are
-- redacted after the campaign purpose has ended plus 90 days.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
alter table public.marketplace_contact_proposals
  add column if not exists application_contact_snapshot jsonb;
create or replace function public.directsign_campaign_application_contact_snapshot_valid(
  p_snapshot jsonb,
  p_campaign_snapshot jsonb,
  p_sender_profile_id uuid,
  p_campaign_id text,
  p_target_brand_profile_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expected_fields jsonb := coalesce(
    p_campaign_snapshot -> 'applicationContactFields',
    '[]'::jsonb
  );
  v_contact jsonb;
  v_field jsonb;
  v_field_name text;
  v_phone text;
  v_email text;
  v_recipient_organization_id uuid;
begin
  -- Retention redaction is a valid terminal state. The INSERT guard below
  -- still requires a snapshot whenever the campaign requested contact fields.
  if p_snapshot is null then
    return true;
  end if;

  if jsonb_typeof(v_expected_fields) is distinct from 'array' then
    return false;
  end if;

  if p_snapshot is null then
    return true;
  end if;

  if jsonb_array_length(v_expected_fields) = 0 then
    return false;
  end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object'
    or (
      p_snapshot
      - 'version'
      - 'policy_version'
      - 'fields'
      - 'contact'
      - 'accepted_at'
      - 'actor_profile_id'
      - 'campaign_id'
      - 'recipient_brand_profile_id'
      - 'recipient_organization_id'
      - 'recipient_name'
      - 'purpose'
      - 'retention_policy'
    ) <> '{}'::jsonb
    or jsonb_typeof(p_snapshot -> 'version') is distinct from 'string'
    or (p_snapshot ->> 'version') !~ '^[0-9a-f]{64}$'
    or (p_snapshot ->> 'version') is distinct from
      (p_campaign_snapshot ->> 'applicationContactConsentVersion')
    or jsonb_typeof(p_snapshot -> 'policy_version') is distinct from 'string'
    or (p_snapshot ->> 'policy_version') is distinct from '2026-08-08.1'
    or jsonb_typeof(p_snapshot -> 'fields') is distinct from 'array'
    or (p_snapshot -> 'fields') is distinct from v_expected_fields
    or jsonb_array_length(p_snapshot -> 'fields') not between 1 and 2
    or jsonb_typeof(p_snapshot -> 'contact') is distinct from 'object'
    or jsonb_typeof(p_snapshot -> 'accepted_at') is distinct from 'string'
    or not pg_catalog.pg_input_is_valid(
      nullif(p_snapshot ->> 'accepted_at', ''),
      'timestamp with time zone'
    )
    or jsonb_typeof(p_snapshot -> 'actor_profile_id') is distinct from 'string'
    or (p_snapshot ->> 'actor_profile_id') is distinct from p_sender_profile_id::text
    or jsonb_typeof(p_snapshot -> 'campaign_id') is distinct from 'string'
    or (p_snapshot ->> 'campaign_id') is distinct from p_campaign_id
    or jsonb_typeof(p_snapshot -> 'recipient_brand_profile_id') is distinct from 'string'
    or (p_snapshot ->> 'recipient_brand_profile_id') is distinct from
      p_target_brand_profile_id::text
    or jsonb_typeof(p_snapshot -> 'recipient_organization_id') is distinct from 'string'
    or not pg_catalog.pg_input_is_valid(
      nullif(p_snapshot ->> 'recipient_organization_id', ''),
      'uuid'
    )
    or jsonb_typeof(p_snapshot -> 'recipient_name') is distinct from 'string'
    or btrim(p_snapshot ->> 'recipient_name') = ''
    or char_length(p_snapshot ->> 'recipient_name') > 160
    or (p_snapshot ->> 'recipient_name') is distinct from
      (p_campaign_snapshot ->> 'brandName')
    or jsonb_typeof(p_snapshot -> 'purpose') is distinct from 'string'
    or (p_snapshot ->> 'purpose') is distinct from
      '캠페인 지원자 확인, 선정 및 진행 안내'
    or jsonb_typeof(p_snapshot -> 'retention_policy') is distinct from 'string'
    or (p_snapshot ->> 'retention_policy') is distinct from
      'campaign_end_plus_90_days' then
    return false;
  end if;

  v_recipient_organization_id := (p_snapshot ->> 'recipient_organization_id')::uuid;
  if not exists (
    select 1
    from public.marketplace_brand_profiles as brand
    where brand.id = p_target_brand_profile_id
      and brand.organization_id = v_recipient_organization_id
  ) then
    return false;
  end if;

  v_contact := p_snapshot -> 'contact';
  if (
    select count(*)
    from pg_catalog.jsonb_object_keys(v_contact)
  ) is distinct from jsonb_array_length(v_expected_fields) then
    return false;
  end if;

  for v_field in
    select item
    from pg_catalog.jsonb_array_elements(v_expected_fields) as requested(item)
  loop
    if jsonb_typeof(v_field) is distinct from 'string' then
      return false;
    end if;
    v_field_name := v_field #>> '{}';
    if v_field_name not in ('phone', 'email')
      or jsonb_typeof(v_contact -> v_field_name) is distinct from 'string'
      or btrim(v_contact ->> v_field_name) = '' then
      return false;
    end if;
  end loop;

  if v_contact ? 'phone' then
    v_phone := btrim(v_contact ->> 'phone');
    if char_length(v_phone) > 24
      or v_phone !~ '^[0-9+() -]{8,24}$'
      or char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 9 and 15 then
      return false;
    end if;
  end if;

  if v_contact ? 'email' then
    v_email := lower(btrim(v_contact ->> 'email'));
    if char_length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      return false;
    end if;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;
revoke execute on function public.directsign_campaign_application_contact_snapshot_valid(
  jsonb, jsonb, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.directsign_campaign_application_contact_snapshot_valid(
  jsonb, jsonb, uuid, text, uuid
) to service_role;
alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_application_contact_snapshot_valid;
alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_application_contact_snapshot_valid check (
    public.directsign_campaign_application_contact_snapshot_valid(
      application_contact_snapshot,
      campaign_snapshot,
      sender_profile_id,
      campaign_id,
      target_brand_profile_id
    )
  );
create or replace function public.directsign_protect_campaign_application_contact_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_fields jsonb := coalesce(
    new.campaign_snapshot -> 'applicationContactFields',
    '[]'::jsonb
  );
begin
  if tg_op = 'INSERT' then
    if new.direction = 'influencer_to_brand'
      and new.campaign_id is not null
      and jsonb_typeof(v_expected_fields) = 'array'
      and jsonb_array_length(v_expected_fields) > 0
      and new.application_contact_snapshot is null then
      raise exception using
        errcode = '23514',
        message = 'campaign application contact snapshot is required';
    end if;
    return new;
  end if;

  if new.application_contact_snapshot is distinct from old.application_contact_snapshot then
    if old.application_contact_snapshot is not null
      and new.application_contact_snapshot is null
      and coalesce(
        pg_catalog.current_setting('request.jwt.claim.role', true),
        ''
      ) = 'service_role' then
      return new;
    end if;
    raise exception using
      errcode = '55000',
      message = 'campaign application contact snapshot is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists marketplace_campaign_application_contact_snapshot_guard
  on public.marketplace_contact_proposals;
create trigger marketplace_campaign_application_contact_snapshot_guard
before insert or update of application_contact_snapshot
on public.marketplace_contact_proposals
for each row execute function public.directsign_protect_campaign_application_contact_snapshot();
revoke execute on function public.directsign_protect_campaign_application_contact_snapshot()
  from public, anon, authenticated;
grant execute on function public.directsign_protect_campaign_application_contact_snapshot()
  to service_role;
create or replace function public.redact_expired_campaign_application_contacts(
  p_now timestamptz default now(),
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redacted integer := 0;
begin
  if coalesce(
    pg_catalog.current_setting('request.jwt.claim.role', true),
    ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  with candidates as (
    select proposal.id
    from public.marketplace_contact_proposals as proposal
    join public.marketplace_campaigns as campaign
      on campaign.id = proposal.campaign_id
    cross join lateral (
      select case
        when pg_catalog.pg_input_is_valid(
          nullif(
            campaign.campaign_data ->> 'uploadDeadline',
            ''
          ),
          'date'
        ) then (
          (campaign.campaign_data ->> 'uploadDeadline')::date
          + interval '90 days'
        )
        else null
      end as upload_retention_due
    ) as retention
    where proposal.application_contact_snapshot is not null
      and greatest(
        retention.upload_retention_due,
        case
          when campaign.status in ('closed', 'ended')
            then campaign.updated_at + interval '90 days'
          else null
        end
      ) <= p_now
    order by proposal.created_at asc
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
    for update of proposal skip locked
  )
  update public.marketplace_contact_proposals as proposal
  set application_contact_snapshot = null
  from candidates
  where proposal.id = candidates.id;

  get diagnostics v_redacted = row_count;
  return jsonb_build_object('redacted', v_redacted, 'processed_at', p_now);
end;
$$;
revoke execute on function public.redact_expired_campaign_application_contacts(
  timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.redact_expired_campaign_application_contacts(
  timestamptz, integer
) to service_role;
comment on column public.marketplace_contact_proposals.application_contact_snapshot is
  'Immutable private applicant phone/email and exact system consent evidence; visible only to the owning advertiser organization and redacted after purpose end plus 90 days.';
commit;
