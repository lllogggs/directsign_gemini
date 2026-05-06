-- Consolidated no-op.
--
-- Verification request tables and policies are created by
-- 20260501030000_create_verification_requests.sql. This migration ID is kept
-- for history compatibility while preventing duplicate trigger creation on a
-- clean database reset.
select 1;
