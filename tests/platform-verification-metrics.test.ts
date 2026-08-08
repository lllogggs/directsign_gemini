import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bindOwnershipStatusToSubmittedIdentity,
  buildVerifiedPlatformChannelMetric,
  normalizeVerificationMetricCount,
  readVerifiedPlatformChannelMetric,
  shouldInvalidateApprovedPlatformChannelCache,
} from "../server/platform-verification-metrics.js";
import { translateApiErrorMessage } from "../src/domain/userMessages.js";
import {
  consumeInitialVerificationAccountPrefill,
  isInfluencerOwnershipChallengeAvailable,
  shouldIssueInfluencerOwnershipChallenge,
} from "../src/pages/influencer/InfluencerVerification.js";

const checkedAt = "2026-08-07T09:10:11.123Z";

test("verification account prefill is initial-only and explicit platform choices win", () => {
  const consumedKeys = new Set<string>();
  const input = {
    accountHandle: "@approved.creator",
    accountUrl: "https://www.instagram.com/approved.creator/",
    currentHandle: "",
    currentUrl: "",
    hasContractContext: false,
    hasExplicitFormInteraction: false,
    isAdditionalRequest: false,
  };

  assert.deepEqual(
    consumeInitialVerificationAccountPrefill(input, consumedKeys),
    {
      platform: "instagram",
      method: "instagram_dm_code",
      platformHandle: "@approved.creator",
      platformUrl: "https://www.instagram.com/approved.creator/",
    },
  );
  assert.equal(
    consumeInitialVerificationAccountPrefill(input, consumedKeys),
    undefined,
  );

  for (const blockedInput of [
    { ...input, accountHandle: "contract", hasContractContext: true },
    {
      ...input,
      accountHandle: "additional",
      isAdditionalRequest: true,
    },
    {
      ...input,
      accountHandle: "selected",
      hasExplicitFormInteraction: true,
    },
    { ...input, accountHandle: "typed", currentHandle: "typed" },
  ]) {
    const blockedKeys = new Set<string>();
    assert.equal(
      consumeInitialVerificationAccountPrefill(blockedInput, blockedKeys),
      undefined,
    );
    assert.equal(blockedKeys.size, 1);
    assert.equal(
      consumeInitialVerificationAccountPrefill(
        {
          ...blockedInput,
          currentHandle: "",
          hasContractContext: false,
          hasExplicitFormInteraction: false,
          isAdditionalRequest: false,
        },
        blockedKeys,
      ),
      undefined,
    );
  }
});

test("approved Instagram users keep an explicit YouTube or NAVER selection empty until they type", () => {
  for (const target of [
    {
      platform: "youtube" as const,
      handle: "youtube.creator",
      url: "https://youtube.com/@youtube.creator",
    },
    {
      platform: "naver_blog" as const,
      handle: "naver-creator",
      url: "https://blog.naver.com/naver-creator",
    },
  ]) {
    const consumedKeys = new Set<string>();
    const approvedAccount = {
      accountHandle: "approved.creator",
      accountUrl: "https://instagram.com/approved.creator",
      currentHandle: "",
      currentUrl: "",
      hasContractContext: false,
      hasExplicitFormInteraction: false,
      isAdditionalRequest: false,
    };
    assert.equal(
      consumeInitialVerificationAccountPrefill(
        approvedAccount,
        consumedKeys,
      )?.platform,
      "instagram",
    );

    // Opening the additional-account form and selecting a new platform clears
    // the identity fields. The consumed account hint cannot repopulate them.
    assert.equal(
      consumeInitialVerificationAccountPrefill(
        {
          ...approvedAccount,
          hasExplicitFormInteraction: true,
          isAdditionalRequest: true,
        },
        consumedKeys,
      ),
      undefined,
    );
    const settledStates = [
      { handle: "", url: "" },
      { handle: target.handle, url: "" },
      { handle: target.handle, url: target.url },
    ];
    assert.equal(
      settledStates.filter(({ handle, url }) =>
        shouldIssueInfluencerOwnershipChallenge(
          true,
          true,
          false,
          handle,
          url,
        ),
      ).length,
      1,
      `${target.platform} must issue only after both identity fields are present`,
    );
  }
});

test("ownership challenges require a visible form and both identity fields", () => {
  for (const isInstagramDmMethod of [false, true]) {
    assert.equal(
      shouldIssueInfluencerOwnershipChallenge(
        true,
        false,
        isInstagramDmMethod,
        "creator",
        "https://youtube.com/@creator",
      ),
      false,
    );
  }
  assert.equal(
    shouldIssueInfluencerOwnershipChallenge(true, true, false, "", ""),
    false,
  );
  assert.equal(
    shouldIssueInfluencerOwnershipChallenge(
      true,
      true,
      false,
      "creator",
      "https://youtube.com/@creator",
    ),
    true,
  );
  assert.equal(
    shouldIssueInfluencerOwnershipChallenge(
      true,
      true,
      true,
      "creator",
      "https://instagram.com/creator",
    ),
    false,
  );
  assert.equal(
    shouldIssueInfluencerOwnershipChallenge(
      false,
      true,
      false,
      "creator",
      "https://youtube.com/@creator",
    ),
    false,
  );
});

test("a platform change invalidates the previous ownership challenge", () => {
  const challenge = {
    platform: "youtube" as const,
    platform_handle: "creator",
    platform_url: "https://youtube.com/@creator",
  };
  assert.equal(
    isInfluencerOwnershipChallengeAvailable({
      challenge,
      platform: "youtube",
      platformHandle: "creator",
      platformUrl: "https://youtube.com/@creator",
      expired: false,
      loading: false,
    }),
    true,
  );
  assert.equal(
    isInfluencerOwnershipChallengeAvailable({
      challenge,
      platform: "naver_blog",
      platformHandle: "",
      platformUrl: "",
      expired: false,
      loading: false,
    }),
    false,
  );
});

test("the influencer verification form has no NAVER visitor metric input", () => {
  const source = readFileSync(
    new URL(
      "../src/pages/influencer/InfluencerVerification.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /average_daily_visitors|daily_visitors|visitor_count|방문자\s*(수|입력)/i,
  );
  assert.match(
    source,
    /const handleStartAdditionalRequest = \(\) => \{[\s\S]*?setShowAdditionalRequest\(true\);[\s\S]*?setOwnershipChallenge\(null\);[\s\S]*?setForm\(initialForm\);/,
  );
  assert.match(source, /onClick=\{handleStartAdditionalRequest\}/);
  assert.doesNotMatch(
    source,
    /onClick=\{\(\) => setShowAdditionalRequest\(true\)\}/,
  );
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
