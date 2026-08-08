import assert from "node:assert/strict";
import test from "node:test";

import {
  bindOwnershipStatusToSubmittedIdentity,
  buildVerifiedPlatformChannelMetric,
  normalizeVerificationMetricCount,
  readVerifiedPlatformChannelMetric,
  shouldInvalidateApprovedPlatformChannelCache,
} from "../server/platform-verification-metrics.js";
import { translateApiErrorMessage } from "../src/domain/userMessages.js";

const checkedAt = "2026-08-07T09:10:11.123Z";

const tiktokAutomation = (profile: Record<string, unknown> = {}) => ({
  provider: "tiktok_login_kit",
  configured: true,
  checked_at: checkedAt,
  profile: {
    user_info_api_succeeded: true,
    oauth_token_source: "submitted_user_access_token",
    username: "Creator.One",
    follower_count: 2345,
    ...profile,
  },
});

test("verification metrics accept only non-negative safe integers", () => {
  assert.equal(normalizeVerificationMetricCount(0), 0);
  assert.equal(normalizeVerificationMetricCount("12345"), 12345);
  for (const value of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "-1",
    "1.5",
    "1e3",
    "1,000",
    "9007199254740992",
  ]) {
    assert.equal(normalizeVerificationMetricCount(value), undefined);
  }
});

test("public proof matches are rejected when the submitted account differs", () => {
  assert.equal(bindOwnershipStatusToSubmittedIdentity("matched", true), "matched");
  assert.equal(
    bindOwnershipStatusToSubmittedIdentity("matched", false),
    "not_found",
  );
  assert.equal(
    bindOwnershipStatusToSubmittedIdentity("blocked", false),
    "blocked",
  );
});

test("YouTube and Naver verification never materialize provider or self-reported metrics", () => {
  for (const platform of ["youtube", "naver_blog"]) {
    assert.equal(
      buildVerifiedPlatformChannelMetric({
        platform,
        platformHandle: "creator.one",
        automation: {
          provider: platform === "youtube" ? "youtube_data_api" : "naver_search_api",
          configured: true,
          checked_at: checkedAt,
          profile: {
            subscriber_count: 12345,
            follower_count: 12345,
            average_daily_visitors_4d: 12345,
          },
        },
      }),
      undefined,
    );
  }
});

test("platform account URL mismatches have actionable Korean messages", () => {
  assert.equal(
    translateApiErrorMessage("TikTok handle and profile URL must match"),
    "TikTok 계정명과 프로필 URL의 계정을 같게 입력해 주세요.",
  );
  assert.equal(
    translateApiErrorMessage("Naver Blog id and profile URL must match"),
    "네이버 블로그 ID와 프로필 URL의 블로그를 같게 입력해 주세요.",
  );
  assert.equal(
    translateApiErrorMessage("YouTube handle and channel URL must match"),
    "YouTube 계정명과 채널 URL의 채널을 같게 입력해 주세요.",
  );
});

test("TikTok accepts only an exact user returned for the submitted OAuth token", () => {
  assert.deepEqual(
    buildVerifiedPlatformChannelMetric({
      platform: "tiktok",
      platformHandle: "@Creator.One",
      platformAccessTokenProvided: true,
      automation: tiktokAutomation(),
    }),
    {
      status: "available",
      platform: "tiktok",
      metric: "follower_count",
      value: 2345,
      checked_at: checkedAt,
      source: "tiktok_user_info_api",
      verified_handle: "creator.one",
    },
  );

  for (const automation of [
    tiktokAutomation({ oauth_token_source: "server_fallback" }),
    tiktokAutomation({ username: "another.creator" }),
    tiktokAutomation({ user_info_api_succeeded: false }),
  ]) {
    assert.equal(
      buildVerifiedPlatformChannelMetric({
        platform: "tiktok",
        platformHandle: "creator.one",
        platformAccessTokenProvided: true,
        automation,
      }),
      undefined,
    );
  }
  assert.equal(
    buildVerifiedPlatformChannelMetric({
      platform: "tiktok",
      platformHandle: "creator.one",
      platformAccessTokenProvided: false,
      automation: tiktokAutomation(),
    }),
    undefined,
  );
});

test("TikTok keeps a missing stats value distinct from account verification", () => {
  assert.equal(
    buildVerifiedPlatformChannelMetric({
      platform: "tiktok",
      platformHandle: "creator.one",
      platformAccessTokenProvided: true,
      automation: tiktokAutomation({ follower_count: undefined }),
    })?.status,
    "unavailable",
  );
});

test("stored metrics and cache invalidation require approved production records", () => {
  const channelMetric = buildVerifiedPlatformChannelMetric({
    platform: "tiktok",
    platformHandle: "creator.one",
    platformAccessTokenProvided: true,
    automation: tiktokAutomation(),
  });
  const record = {
    target_type: "influencer_account",
    verification_type: "platform_account",
    status: "approved",
    data_origin: "production",
    platform: "tiktok",
    platform_handle: "@Creator.One",
    reviewed_at: checkedAt,
    evidence_snapshot_json: {
      ownership_verification: { channel_metric: channelMetric },
    },
  };
  assert.equal(readVerifiedPlatformChannelMetric(record)?.value, 2345);
  assert.equal(shouldInvalidateApprovedPlatformChannelCache(record), true);
  assert.equal(
    shouldInvalidateApprovedPlatformChannelCache(
      { ...record, platform: "naver_blog" },
    ),
    true,
  );
  assert.equal(
    readVerifiedPlatformChannelMetric({ ...record, data_origin: "qa" }),
    undefined,
  );
  assert.equal(
    shouldInvalidateApprovedPlatformChannelCache(record, true),
    false,
  );
  assert.equal(
    shouldInvalidateApprovedPlatformChannelCache({ ...record, status: "pending" }),
    false,
  );
});
