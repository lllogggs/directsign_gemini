import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260806150000_add_internal_service_accounts.sql",
  ),
  "utf8",
);
const bootstrap = fs.readFileSync(
  path.join(root, "scripts", "create-internal-service-accounts.mjs"),
  "utf8",
);

test("internal service accounts are service-role-only and discovery-scoped", () => {
  assert.match(migration, /create table if not exists public\.internal_service_accounts/);
  assert.match(migration, /alter table public\.internal_service_accounts enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.internal_service_accounts\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.internal_service_accounts\s+to service_role/,
  );
  assert.match(
    migration,
    /directsign_is_internal_service_account\(\s*p_profile_id uuid,\s*p_expected_role text default null,\s*p_require_discovery_exclusion boolean default false/s,
  );
  assert.match(
    migration,
    /directsign_remove_internal_influencer_directory_rows[\s\S]+marketplace_registered_influencer_directory/,
  );
  assert.match(migration, /directsign_hide_internal_marketplace_profile_directory/);
  assert.match(migration, /marketplace_public_influencer_directory/);
  assert.match(migration, /zz_internal_service_accounts_hide_profiles/);
  assert.match(migration, /zz_internal_service_accounts_hide_marketplace_profiles/);
  assert.match(migration, /zz_internal_service_accounts_hide_channels/);
});

test("internal service account bootstrap is explicit and production-bound", () => {
  assert.match(
    bootstrap,
    /YEOLLOCK_INTERNAL_SERVICE_ACCOUNT_RUN\s*===\s*"true"/,
  );
  assert.match(
    bootstrap,
    /PUBLIC_ORIGIN !== "https:\/\/yeollock\.me"/,
  );
  assert.match(bootstrap, /YEOLLOCK_ACK_SUPABASE_HOST/);
  assert.match(bootstrap, /INTERNAL_SERVICE_ACCOUNT_PASSWORD/);
  assert.match(bootstrap, /email_confirm: true/);
  assert.match(bootstrap, /data_origin: "production"/);
  assert.match(bootstrap, /internal_service_account: true/);
  assert.match(bootstrap, /excludeFromInfluencerDiscovery: true/);
  assert.doesNotMatch(bootstrap, /data_origin:\s*["']qa["']/);
  assert.doesNotMatch(bootstrap, /QA_TEST_PASSWORD\s*\|\|/);
});
