import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRepresentativeActivityPage,
} from "../src/domain/activityPage.js";

test("infers supported creator profile URLs and normalizes them to HTTPS", () => {
  const cases = [
    ["instagram.com/running_yaho/", "instagram", "running_yaho"],
    ["https://youtube.com/@creator", "youtube", "creator"],
    ["https://www.tiktok.com/@daily.fit", "tiktok", "daily.fit"],
    ["https://m.blog.naver.com/blog-id", "naver_blog", "blog-id"],
  ] as const;

  for (const [value, platform, handle] of cases) {
    const result = parseRepresentativeActivityPage(value);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.page.supported, true);
    assert.equal(result.page.platform, platform);
    assert.equal(result.page.handle, handle);
    assert.match(result.page.normalizedUrl, /^https:\/\//);
  }
});

test("does not mistake an Instagram content URL for an account", () => {
  const result = parseRepresentativeActivityPage(
    "https://instagram.com/reel/ABC123/",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.page.supported, false);
  assert.equal(result.page.platform, undefined);
  assert.equal(result.page.handle, undefined);
});

test("accepts an unsupported public page for explicit platform and account input", () => {
  const result = parseRepresentativeActivityPage(
    "https://creator.example.com/profile/me",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.page.supported, false);
  assert.equal(result.page.normalizedUrl, "https://creator.example.com/profile/me");
});

test("rejects local, credentialed, and non-web addresses", () => {
  for (const value of [
    "http://localhost:3000/profile",
    "https://user:secret@example.com/profile",
    "javascript:alert(1)",
  ]) {
    assert.equal(parseRepresentativeActivityPage(value).ok, false);
  }
});
