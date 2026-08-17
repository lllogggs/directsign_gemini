begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- This production campaign was authored as "본문 1,200자 이상". The retired
-- comma-splitting editor persisted the thousands separator as two array items.
-- Repair only the exact known row and exact broken value; do not guess at other
-- customer-authored comma boundaries.
update public.marketplace_campaigns
set
  campaign_data = jsonb_set(
    campaign_data,
    '{deliverables}',
    '["네이버 블로그 포스팅 1건","본문 1,200자 이상","직접 캡처 8장 이상","광고 표기 필수","서비스 링크 포함"]'::jsonb,
    false
  ),
  updated_at = pg_catalog.clock_timestamp()
where id = '4b57fcee-6d4a-4c73-bcb0-3c8e88176158'
  and campaign_data -> 'deliverables' =
    '["네이버 블로그 포스팅 1건","본문 1","200자 이상","직접 캡처 8장 이상","광고 표기 필수","서비스 링크 포함"]'::jsonb;

update public.marketplace_brand_profiles as brand
set
  active_campaigns = (
    select jsonb_agg(
      case
        when campaign.item ->> 'id' = '4b57fcee-6d4a-4c73-bcb0-3c8e88176158'
         and campaign.item -> 'deliverables' =
           '["네이버 블로그 포스팅 1건","본문 1","200자 이상","직접 캡처 8장 이상","광고 표기 필수","서비스 링크 포함"]'::jsonb
          then jsonb_set(
            campaign.item,
            '{deliverables}',
            '["네이버 블로그 포스팅 1건","본문 1,200자 이상","직접 캡처 8장 이상","광고 표기 필수","서비스 링크 포함"]'::jsonb,
            false
          )
        else campaign.item
      end
      order by campaign.ordinality
    )
    from jsonb_array_elements(brand.active_campaigns)
      with ordinality as campaign(item, ordinality)
  ),
  updated_at = pg_catalog.clock_timestamp()
where jsonb_typeof(brand.active_campaigns) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(brand.active_campaigns) as campaign(item)
    where campaign.item ->> 'id' = '4b57fcee-6d4a-4c73-bcb0-3c8e88176158'
      and campaign.item -> 'deliverables' =
        '["네이버 블로그 포스팅 1건","본문 1","200자 이상","직접 캡처 8장 이상","광고 표기 필수","서비스 링크 포함"]'::jsonb
  );

commit;
