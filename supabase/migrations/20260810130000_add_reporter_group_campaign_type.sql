-- Reporter groups are a campaign-only recruitment type. The shared contact
-- proposal table must accept campaign applications with this type, while the
-- one-to-one profile and proposal type constraints intentionally stay unchanged.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.marketplace_contact_proposals
  drop constraint if exists marketplace_contact_proposals_proposal_type_allowed;

alter table public.marketplace_contact_proposals
  add constraint marketplace_contact_proposals_proposal_type_allowed check (
    proposal_type in (
      'sponsored_post',
      'product_seeding',
      'supporters',
      'experience_group',
      'reporter_group',
      'ppl',
      'group_buy',
      'visit_review',
      'other'
    )
  );
