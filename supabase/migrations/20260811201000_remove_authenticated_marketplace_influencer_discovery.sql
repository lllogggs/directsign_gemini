begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- MANUAL ROLLING-DEPLOY GATE. This file intentionally lives outside
-- supabase/migrations and must not be copied into the automatic migration chain
-- until every application instance has successfully served discovery through
-- public.list_server_marketplace_influencers. Applying it while an old server
-- instance is live would break discovery on that instance; not applying it
-- leaves the old-JWT RPC bypass open.
revoke all on function public.list_authenticated_marketplace_influencers(
  uuid,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean
) from public, anon, authenticated, service_role;

drop function public.list_authenticated_marketplace_influencers(
  uuid,
  text,
  text,
  text[],
  text[],
  text,
  integer,
  integer,
  boolean
);

notify pgrst, 'reload schema';

commit;
