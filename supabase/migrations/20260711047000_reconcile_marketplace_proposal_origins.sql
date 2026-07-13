-- Reconcile proposals written during the deployment window from trusted party
-- relationships. This is intentionally independent of request text.

update public.marketplace_contact_proposals as proposal
set data_origin = coalesce(
  (
    select sender_profile.data_origin
    from public.profiles as sender_profile
    where sender_profile.id = proposal.sender_profile_id
      and sender_profile.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  (
    select target_owner.data_origin
    from public.marketplace_influencer_profiles as target_profile
    join public.profiles as target_owner
      on target_owner.id = target_profile.owner_profile_id
    where target_profile.id = proposal.target_influencer_profile_id
      and target_owner.data_origin in ('qa', 'demo', 'seed')
    limit 1
  ),
  (
    select organization_owner.data_origin
    from public.marketplace_brand_profiles as target_brand
    join public.organization_members as target_membership
      on target_membership.organization_id = target_brand.organization_id
    join public.profiles as organization_owner
      on organization_owner.id = target_membership.profile_id
    where target_brand.id = proposal.target_brand_profile_id
      and target_membership.role in ('owner', 'admin', 'marketer')
      and organization_owner.data_origin in ('qa', 'demo', 'seed')
    order by case organization_owner.data_origin
      when 'qa' then 0
      when 'demo' then 1
      else 2
    end
    limit 1
  ),
  proposal.data_origin
)
where proposal.data_origin = 'production';
