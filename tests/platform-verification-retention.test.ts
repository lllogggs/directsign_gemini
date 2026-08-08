import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetainedOwnershipCheck,
  buildRetainedPlatformAutomationDecision,
} from "../server/platform-verification-retention.js";

test("retains only first-party YouTube and NAVER verification decisions", () => {
  const providerResult = {
    provider: "youtube_data_api",
    configured: true,
    mode: "api_ready",
    status: "matched",
    checked_at: "2026-08-08T08:00:00.000Z",
    http_status: 200,
    result_hash: "provider-response-fingerprint",
    matched_fields: ["channel.snippet.description"],
    profile: {
      channel_id: "provider-channel-id",
      title: "provider title",
      subscriber_count: "1234",
    },
  };

  assert.deepEqual(
    buildRetainedPlatformAutomationDecision("youtube", providerResult),
    {
      provider: "youtube_data_api",
      mode: "api_ready",
      status: "matched",
      checked_at: "2026-08-08T08:00:00.000Z",
      decision_source: "transient_provider_check",
      decision_rule_version: "2026-08-08.1",
      provider_response_retained: false,
    },
  );
  assert.deepEqual(
    buildRetainedOwnershipCheck("naver_blog", {
      status: "matched",
      checked_at: "2026-08-08T08:00:00.000Z",
      http_status: 200,
      error: "provider detail",
    } as never),
    {
      status: "matched",
      checked_at: "2026-08-08T08:00:00.000Z",
    },
  );
});

test("normalizes invalid provider values without retaining them", () => {
  assert.deepEqual(
    buildRetainedPlatformAutomationDecision("naver_blog", {
      provider: "provider-response-content",
      mode: "provider-mode",
      status: "provider-status",
      checked_at: "not-a-date",
    }),
    {
      provider: "naver_search_api",
      mode: "manual_fallback",
      status: "failed",
      decision_source: "transient_provider_check",
      decision_rule_version: "2026-08-08.1",
      provider_response_retained: false,
    },
  );
});

test("leaves non-minimized platform decisions unchanged", () => {
  const instagramResult = {
    provider: "instagram_graph_api",
    configured: true,
    mode: "webhook_ready",
    status: "matched",
  };
  assert.equal(
    buildRetainedPlatformAutomationDecision("instagram", instagramResult),
    instagramResult,
  );
});
