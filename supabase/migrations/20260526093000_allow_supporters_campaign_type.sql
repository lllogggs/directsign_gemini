alter table public.marketplace_influencer_profiles
  drop constraint if exists marketplace_influencer_profiles_collaboration_types_allowed;

alter table public.marketplace_influencer_profiles
  add constraint marketplace_influencer_profiles_collaboration_types_allowed check (
    collaboration_types <@ array[
      'sponsored_post',
      'product_seeding',
      'supporters',
      'ppl',
      'group_buy',
      'visit_review'
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
      'ppl',
      'group_buy',
      'visit_review'
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
      'ppl',
      'group_buy',
      'visit_review'
    )
  );
