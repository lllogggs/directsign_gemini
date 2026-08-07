-- Follower writes must remain bounded. The registered directory projection is
-- refreshed explicitly by the server after the channel write instead of
-- running a large verification projection inside the channel transaction.
drop trigger if exists marketplace_influencer_channels_sync_registered_member_directory
  on public.marketplace_influencer_channels;

drop function if exists
  directsign_private.directsign_sync_registered_member_directory_from_channel();
