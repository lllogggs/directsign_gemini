-- Consolidated no-op.
--
-- The normalized DirectSign v2 schema is created by
-- 20260430193123_create_directsign_v2_schema.sql. This migration ID is kept
-- so existing project history remains comparable, but it intentionally avoids
-- replaying the same DDL statements on clean DBs.
select 1;
