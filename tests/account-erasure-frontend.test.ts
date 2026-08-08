import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("account settings expose one role-bound erasure entry", () => {
  const advertiserMenu = readSource(
    "../src/components/AdvertiserAccountSettingsMenu.tsx",
  );
  const influencerMenu = readSource(
    "../src/components/InfluencerAccountSettingsMenu.tsx",
  );

  assert.equal(advertiserMenu.match(/회원 탈퇴/g)?.length, 1);
  assert.match(advertiserMenu, /openAccountErasureDialog\("advertiser"\)/);
  assert.equal(influencerMenu.match(/회원 탈퇴/g)?.length, 1);
  assert.match(influencerMenu, /openAccountErasureDialog\("influencer"\)/);
});

test("account erasure requires exact confirmation and keeps one idempotency key across recent-auth retry", () => {
  const dialog = readSource("../src/components/AccountErasureDialog.tsx");

  assert.match(dialog, /ACCOUNT_ERASURE_CONFIRMATION = "탈퇴"/);
  assert.match(dialog, /method: "DELETE"/);
  assert.match(dialog, /"Idempotency-Key": window\.crypto\.randomUUID\(\)/);
  assert.match(dialog, /apiFetch\("\/api\/account", requestInit\)/);
  assert.match(
    dialog,
    /JSON\.stringify\(\{[\s\S]*?role,[\s\S]*?confirmation: ACCOUNT_ERASURE_CONFIRMATION/,
  );
});

test("successful erasure disables analytics, clears session state, and hard-navigates to the role login", () => {
  const dialog = readSource("../src/components/AccountErasureDialog.tsx");
  const app = readSource("../src/App.tsx");
  const recentAuth = readSource("../src/components/RecentAuthDialog.tsx");

  assert.match(dialog, /setAnalyticsConsent\("denied"\)/);
  assert.match(dialog, /window\.sessionStorage\.clear\(\)/);
  assert.match(dialog, /window\.location\.replace\(`\/login\/\$\{role\}`\)/);
  assert.equal(app.match(/<AccountErasureDialog \/>/g)?.length, 1);
  assert.match(
    recentAuth,
    /account_delete: "계정 탈퇴를 완료하기 전에"/,
  );
  assert.match(
    recentAuth,
    /account_security_change: "계정 보안을 변경하기 전에"/,
  );
});
