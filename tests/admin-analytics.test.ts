import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADMIN_ANALYTICS_RANGE_DAYS,
  buildAnalyticsDateKeys,
  calculateAnalyticsDeltaPercent,
  formatAnalyticsDateLabel,
  isAdminAnalyticsRangeDays,
} from "../src/domain/adminAnalytics.js";

const dashboardSource = readFileSync(
  new URL("../src/pages/admin/AdminAnalyticsDashboard.tsx", import.meta.url),
  "utf8",
);

test("admin analytics accepts only the supported comparison ranges", () => {
  assert.deepEqual(ADMIN_ANALYTICS_RANGE_DAYS, [7, 30, 90]);
  assert.equal(isAdminAnalyticsRangeDays(7), true);
  assert.equal(isAdminAnalyticsRangeDays(30), true);
  assert.equal(isAdminAnalyticsRangeDays(90), true);
  assert.equal(isAdminAnalyticsRangeDays(14), false);
  assert.equal(isAdminAnalyticsRangeDays("30"), false);
});

test("admin analytics builds stable UTC date keys and Korean chart labels", () => {
  assert.deepEqual(buildAnalyticsDateKeys("2026-08-13", 3), [
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
  ]);
  assert.equal(formatAnalyticsDateLabel("2026-08-13"), "8/13");
  assert.deepEqual(buildAnalyticsDateKeys("invalid", 3), []);
});

test("admin analytics returns a null delta when the previous period has no baseline", () => {
  assert.equal(calculateAnalyticsDeltaPercent(12, 0), null);
  assert.equal(calculateAnalyticsDeltaPercent(12, -1), null);
  assert.equal(calculateAnalyticsDeltaPercent(110, 100), 10);
  assert.equal(calculateAnalyticsDeltaPercent(1, 3), -66.7);
});

test("admin analytics ends the operator session and cancels stale range requests", () => {
  assert.match(
    dashboardSource,
    /apiFetch\("\/api\/admin\/logout", \{ method: "POST" \}\)/,
  );
  assert.match(dashboardSource, /new AbortController\(\)/);
  assert.match(dashboardSource, /requestId === analyticsRequestIdRef\.current/);
  assert.match(dashboardSource, /controller\.abort\(\)/);
});
