alter table public.deliverable_requirements
  add column if not exists content_format text,
  add column if not exists requirement_json jsonb not null default '{}'::jsonb;

alter table public.deliverable_requirements
  drop constraint if exists deliverable_requirements_requirement_json_is_object;

alter table public.deliverable_requirements
  add constraint deliverable_requirements_requirement_json_is_object
  check (jsonb_typeof(requirement_json) = 'object');

comment on column public.deliverable_requirements.content_format is
  'Platform-specific content format selected in the contract builder, such as instagram_reels or naver_blog_review.';

comment on column public.deliverable_requirements.requirement_json is
  'Structured per-format requirements such as video length, word count, photo count, frame count, and maintain period.';

create or replace function public.directsign_public_contract_preview(
  p_token_hash text
)
returns table (
  contract_id uuid,
  public_share_id uuid,
  campaign_title text,
  status public.directsign_contract_status,
  campaign_start_date date,
  campaign_end_date date,
  upload_deadline date,
  review_deadline date,
  pricing_type public.directsign_pricing_type,
  total_fee_amount numeric,
  total_fee_currency char(3),
  parties jsonb,
  platforms jsonb,
  pricing_terms jsonb,
  clauses jsonb,
  deliverable_requirements jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    contracts.id,
    contracts.public_share_id,
    contracts.campaign_title,
    contracts.status,
    contracts.campaign_start_date,
    contracts.campaign_end_date,
    contracts.upload_deadline,
    contracts.review_deadline,
    contracts.pricing_type,
    contracts.total_fee_amount,
    contracts.total_fee_currency,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'role', contract_parties.party_role,
          'display_name', contract_parties.display_name,
          'company_name', contract_parties.company_name,
          'channel_url', contract_parties.channel_url
        )
        order by contract_parties.party_role::text
      )
      from public.contract_parties
      where contract_parties.contract_id = contracts.id
    ), '[]'::jsonb) as parties,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'platform', contract_platforms.platform,
          'handle', contract_platforms.handle,
          'url', contract_platforms.url,
          'is_primary', contract_platforms.is_primary
        )
        order by contract_platforms.is_primary desc, contract_platforms.platform::text
      )
      from public.contract_platforms
      where contract_platforms.contract_id = contracts.id
    ), '[]'::jsonb) as platforms,
    to_jsonb(contract_pricing_terms) - 'id' - 'contract_id' as pricing_terms,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', contract_clauses.id,
          'order_no', contract_clauses.order_no,
          'title', contract_clauses.title,
          'body', contract_clauses.body,
          'status', contract_clauses.status
        )
        order by contract_clauses.order_no
      )
      from public.contract_clauses
      where contract_clauses.contract_id = contracts.id
        and contract_clauses.status <> 'removed'
    ), '[]'::jsonb) as clauses,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', deliverable_requirements.id,
          'deliverable_type', deliverable_requirements.deliverable_type,
          'title', deliverable_requirements.title,
          'description', deliverable_requirements.description,
          'quantity', deliverable_requirements.quantity,
          'due_at', deliverable_requirements.due_at,
          'retention_days', deliverable_requirements.retention_days,
          'content_format', deliverable_requirements.content_format,
          'requirement_json', deliverable_requirements.requirement_json
        )
        order by deliverable_requirements.order_no
      )
      from public.deliverable_requirements
      where deliverable_requirements.contract_id = contracts.id
    ), '[]'::jsonb) as deliverable_requirements
  from public.share_links
  join public.contracts on contracts.id = share_links.contract_id
  left join public.contract_pricing_terms on contract_pricing_terms.contract_id = contracts.id
  where share_links.token_hash = p_token_hash
    and share_links.status = 'active'
    and (share_links.expires_at is null or share_links.expires_at > now())
    and (
      share_links.max_access_count is null
      or share_links.access_count < share_links.max_access_count
    )
    and contracts.deleted_at is null
  limit 1;
$$;
