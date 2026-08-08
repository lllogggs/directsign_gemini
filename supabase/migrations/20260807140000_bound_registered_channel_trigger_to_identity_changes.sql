-- Follower metric updates must not synchronously run the full registered-member
-- discovery projection. Structural identity changes still refresh it.
drop trigger if exists marketplace_channels_sync_registered_member_discovery
  on public.marketplace_influencer_channels;
create trigger marketplace_channels_sync_registered_member_discovery
after insert or delete or update of profile_id, platform, handle, url
on public.marketplace_influencer_channels
for each row execute function
  directsign_private.directsign_sync_registered_member_channel();
