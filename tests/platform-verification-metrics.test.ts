import assert from "node:assert/strict";
import test from "node:test";

import {
  bindOwnershipStatusToSubmittedIdentity,
  buildNaverBlogSelfReportedChannelMetric,
  buildVerifiedPlatformChannelMetric,
  normalizeVerificationMetricCount,
  readVerifiedPlatformChannelMetric,
  shouldInvalidateApprovedPlatformChannelCache,
} from "../server/platform-verification-metrics.js";
import { translateApiErrorMessage } from "../src/domain/userMessages.js";

const checkedAt = "2026-08-07T09:10:11.123Z";

const youtubeAutomation = (
  profile: Record<string, unknown> = {},
) => ({
  provider: "youtube_data_api",
  configured: true,
  checked_at: checkedAt,
  profile: {
    channel_api_succeeded: true,
    channel_id: "UCabcdefghijklmnopqrstuv",
    custom_url: "@Creator.One",
    subscriber_count: "12345",
    hidden_subscriber_count: false,
    ...profile,
  },
});

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

test("Naver Blog self-reported metrics preserve explicit provenance", () => {
  assert.deepEqual(
    buildNaverBlogSelfReportedChannelMetric({
      platformHandle: "@@Creator.Blog",
      value: "1234",
      reportedAt: checkedAt,
    }),
    {
      status: "available",
      platform: "naver_blog",
      metric: "average_daily_visitors_4d",
      value: 1234,
      period_days: 4,
      source: "creator_self_report",
      trust: "self_reported",
      reported_at: checkedAt,
      reported_handle: "creator.blog",
    },
  );
  assert.equal(
    buildNaverBlogSelfReportedChannelMetric({
      platformHandle: "creator.blog",
      value: 0,
      reportedAt: "2026-08-07T09:10:11Z",
    })?.value,
    0,
  );
});

test("Naver Blog self-reported metrics reject malformed values and evidence", () => {
  for (const value of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "-1",
    "1.5",
    "1e3",
    "1,000",
    "0123",
    " 123 ",
    "9007199254740992",
  ]) {
    assert.equal(
      buildNaverBlogSelfReportedChannelMetric({
        platformHandle: "creator.blog",
        value,
        reportedAt: checkedAt,
      }),
      undefined,
    );
  }

  for (const platformHandle of ["", "@", "@@"]) {
    assert.equal(
      buildNaverBlogSelfReportedChannelMetric({
        platformHandle,
        value: 1234,
        reportedAt: checkedAt,
      }),
      undefined,
    );
  }

  for (const reportedAt of [
    undefined,
    null,
    "",
    "2026-08-07 09:10:11Z",
    "2026-08-07T09:10:11+09:00",
    "not-a-date",
    new Date(checkedAt),
  ]) {
    assert.equal(
      buildNaverBlogSelfReportedChannelMetric({
        platformHandle: "creator.blog",
        value: 1234,
        reportedAt,
      }),
      undefined,
    );
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

test("YouTube uses the account-bound channels.list subscriber count", () => {
  assert.deepEqual(
    buildVerifiedPlatformChannelMetric({
      platform: "youtube",
      platformHandle: "@Creator.One",
      automation: youtubeAutomation(),
    }),
    {
      status: "available",
      platform: "youtube",
      metric: "subscriber_count",
      value: 12345,
      checked_at: checkedAt,
      source: "youtube_data_api",
      verified_handle: "creator.one",
      approximate: true,
    },
  );
});

test("YouTube rejects a different API channel and supports exact channel ids", () => {
  assert.equal(
    buildVerifiedPlatformChannelMetric({
      platform: "youtube",
      platformHandle: "@Creator.One",
      automation: youtubeAutomation({ custom_url: "@Different.Creator" }),
    }),
    undefined,
  );

  const channelId = "UCabcdefghijklmnopqrstuv";
  const channelIdMetric = buildVerifiedPlatformChannelMetric({
    platform: "youtube",
    platformHandle: channelId,
    automation: youtubeAutomation({ custom_url: undefined }),
  });
  assert.equal(channelIdMetric?.status, "available");
  assert.equal(
    channelIdMetric?.status === "available" ? channelIdMetric.value : undefined,
    12345,
  );
});

test("YouTube records hidden or invalid counts as explicitly unavailable", () => {
  assert.deepEqual(
    buildVerifiedPlatformChannelMetric({
      platform: "youtube",
      platformHandle: "creator.one",
      automation: youtubeAutomation({ hidden_subscriber_count: true }),
    }),
    {
      status: "unavailable",
      platform: "youtube",
      metric: "subscriber_count",
      checked_at: checkedAt,
      source: "youtube_data_api",
      verified_handle: "creator.one",
      reason: "hidden",
    },
  );
  assert.equal(
    buildVerifiedPlatformChannelMetric({
      platform: "youtube",
      platformHandle: "creator.one",
      automation: youtubeAutomation({ subscriber_count: "1e3" }),
    })?.status,
    "unavailable",
  );
  for (const hiddenSubscriberCount of [undefined, "false"]) {
    assert.equal(
      buildVerifiedPlatformChannelMetric({
        platform: "youtube",
        platformHandle: "creator.one",
        automation: youtubeAutomation({
          hidden_subscriber_count: hiddenSubscriberCount,
        }),
      })?.status,
      "unavailable",
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
    platform: "youtube",
    platformHandle: "creator.one",
    automation: youtubeAutomation(),
  });
  const record = {
    target_type: "influencer_account",
    verification_type: "platform_account",
    status: "approved",
    data_origin: "production",
    platform: "youtube",
    platform_handle: "@Creator.One",
    reviewed_at: checkedAt,
    evidence_snapshot_json: {
      ownership_verification: { channel_metric: channelMetric },
    },
  };
  assert.equal(readVerifiedPlatformChannelMetric(record)?.value, 12345);
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
