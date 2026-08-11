import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  isTerminalSupabaseAccessFailure,
  isTerminalSupabaseRefreshFailure,
  userSessionAccessMaxAgeSeconds,
  userSessionRefreshMaxAgeSeconds,
  userSessionRollingDays,
} from "../lib/user-session-policy";
import { classifyAuthMetricDataOrigin } from "../lib/auth-monitoring";
import {
  createAuthMetricOriginCookieValue,
  getAuthMetricOriginCookieName,
  readAuthMetricOriginCookieValue,
} from "../lib/auth-metric-origin";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const advertiserUserId = "11111111-1111-4111-8111-111111111111";
const influencerUserId = "22222222-2222-4222-8222-222222222222";

type RefreshMode =
  | "success"
  | "terminal"
  | "ambiguous"
  | "transient"
  | "timeout"
  | "user-transient"
  | "user-timeout";

type FakeSupabaseState = {
  mode: RefreshMode;
  delayMs: number;
  refreshCalls: number;
  refreshCallsByToken: Map<string, number>;
  logoutAccessTokens: string[];
  passwordGrantCalls: number;
  authMetricCalls: Array<Record<string, unknown>>;
  rateLimitCalls: Array<Record<string, unknown>>;
  rateLimitClears: string[];
  adminMfaAttemptCounts: Map<string, number>;
  adminMfaReservations: Map<string, string[]>;
  adminMfaFinalizeUnavailable: boolean;
  rateLimitClearUnavailable: boolean;
  rateLimitUnavailable: boolean;
  rejectExpiredAccessLogout: boolean;
  profileRoleOverride?: "marketer" | "influencer";
};

const fakeSupabaseState: FakeSupabaseState = {
  mode: "success",
  delayMs: 0,
  refreshCalls: 0,
  refreshCallsByToken: new Map(),
  logoutAccessTokens: [],
  passwordGrantCalls: 0,
  authMetricCalls: [],
  rateLimitCalls: [],
  rateLimitClears: [],
  adminMfaAttemptCounts: new Map(),
  adminMfaReservations: new Map(),
  adminMfaFinalizeUnavailable: false,
  rateLimitClearUnavailable: false,
  rateLimitUnavailable: false,
  rejectExpiredAccessLogout: false,
};

let fakeSupabaseServer: Server;
let appServer: Server;
let appBaseUrl = "";
let temporaryDataDir = "";
const originalEnvironment = new Map<string, string | undefined>();

const trackedEnvironmentKeys = [
  "VERCEL",
  "NODE_ENV",
  "DATA_DIR",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_REQUEST_TIMEOUT_MS",
  "SUPABASE_PROFILE_CACHE_SECONDS",
  "DIRECTSIGN_DEMO_MODE",
  "DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE",
  "DIRECTSIGN_TOKEN_ENCRYPTION_SECRET",
  "USER_SESSION_FAST_PATH_SECRET",
  "DISABLE_PUBLIC_MARKETPLACE_CACHE_WARMUP",
] as const;

const listen = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

const close = (server: Server | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });

const sendJson = (
  response: import("node:http").ServerResponse,
  status: number,
  payload: unknown,
) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
};

const readJsonBody = async (request: import("node:http").IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
};

const profileForUser = (userId: string) => ({
  id: userId,
  role: userId === advertiserUserId ? "marketer" : "influencer",
  name: userId === advertiserUserId ? "Session Advertiser" : "Session Influencer",
  email:
    userId === advertiserUserId
      ? "session-advertiser@example.test"
      : "session-influencer@example.test",
  company_name: userId === advertiserUserId ? "Session Brand" : null,
  activity_categories: [],
  activity_platforms: [],
  verification_status: "not_submitted",
  email_verified_at: "2026-01-01T00:00:00.000Z",
  terms_accepted_at: "2026-01-01T00:00:00.000Z",
  privacy_policy_accepted_at: "2026-01-01T00:00:00.000Z",
  terms_version: "test",
  privacy_policy_version: "test",
  data_origin: "test",
});

const createUnsignedTestAccessToken = (userId: string, sessionId: string) =>
  [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({ sub: userId, session_id: sessionId, aal: "aal1" }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");

const resetFakeSupabase = (mode: RefreshMode, delayMs = 0) => {
  fakeSupabaseState.mode = mode;
  fakeSupabaseState.delayMs = delayMs;
  fakeSupabaseState.refreshCalls = 0;
  fakeSupabaseState.refreshCallsByToken.clear();
  fakeSupabaseState.logoutAccessTokens = [];
  fakeSupabaseState.passwordGrantCalls = 0;
  fakeSupabaseState.authMetricCalls = [];
  fakeSupabaseState.rateLimitCalls = [];
  fakeSupabaseState.rateLimitClears = [];
  fakeSupabaseState.adminMfaAttemptCounts.clear();
  fakeSupabaseState.adminMfaReservations.clear();
  fakeSupabaseState.adminMfaFinalizeUnavailable = false;
  fakeSupabaseState.rateLimitClearUnavailable = false;
  fakeSupabaseState.rateLimitUnavailable = false;
  fakeSupabaseState.rejectExpiredAccessLogout = false;
  fakeSupabaseState.profileRoleOverride = undefined;
};

const getCookieHeaders = (response: Response) => response.headers.getSetCookie();

const applySetCookies = (jar: Map<string, string>, cookies: string[]) => {
  for (const cookie of cookies) {
    const [nameValue] = cookie.split(";", 1);
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex < 0) continue;
    const name = nameValue.slice(0, separatorIndex).trim();
    const value = nameValue.slice(separatorIndex + 1).trim();
    if (/;\s*Max-Age=0(?:;|$)/i.test(cookie)) {
      jar.delete(name);
      continue;
    }
    jar.set(name, value);
  }
};

const serializeCookieJar = (jar: Map<string, string>) =>
  [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

const assertPrivateSessionHeaders = (response: Response) => {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
};

describe("user session persistence policy", () => {
  it("uses a one-hour access token and a shared rolling 30-day refresh window", () => {
    assert.equal(userSessionAccessMaxAgeSeconds, 60 * 60);
    assert.equal(userSessionRollingDays, 30);
    assert.equal(userSessionRefreshMaxAgeSeconds, 60 * 60 * 24 * 30);
  });

  it("keeps known QA identities out of production auth alerts", () => {
    const knownSeedLocalParts = [
      "brand-demo",
      "breadroom.manager",
      "breadroom",
      "brewinglab",
      "creator-demo",
      "creator.sora",
      "harin.log",
      "haru.fit",
      "housefit",
      "jian.home",
      "luna.day",
      "minseo.home",
      "moa.review",
      "narae.shorts",
      "nightcare",
      "obre-beauty",
      "only.routine",
      "raon.beauty",
      "review.j",
      "romi.review",
      "serin.daily",
      "sodam.pick",
      "sua.pick",
      "test.influencer",
      "today.taste",
      "yuna.beauty",
      "ziyu.log",
    ];
    for (const localPart of knownSeedLocalParts) {
      const identifier = `${localPart}@yeollock.me`;
      assert.equal(classifyAuthMetricDataOrigin({ identifier }), "qa", identifier);
    }
    for (const identifier of [
      "qa.advertiser01@yeollock.me",
      "qa.influencer05@yeollock.me",
      "test.advertiser@yeollock.me",
    ]) {
      assert.equal(classifyAuthMetricDataOrigin({ identifier }), "qa");
    }
    assert.notEqual(
      classifyAuthMetricDataOrigin({ identifier: "minseo.home@gmail.com" }),
      "qa",
    );
  });

  it("uses only a server-signed non-PII origin when profile lookup misses", () => {
    const previousVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      assert.equal(classifyAuthMetricDataOrigin({}), undefined);
      const secret = "auth-metric-origin-test-secret";
      const nowMs = Date.parse("2026-07-30T12:00:00.000Z");
      const productionBinding = {
        userId: "11111111-1111-4111-8111-111111111111",
        authSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sessionProof: "production-refresh-proof",
      };
      const productionValue = createAuthMetricOriginCookieValue({
        role: "advertiser",
        origin: "production",
        secret,
        ...productionBinding,
        nowMs,
      });
      assert.ok(productionValue);
      assert.equal(productionValue.includes("@"), false);
      assert.equal(productionValue.includes(productionBinding.userId), false);
      assert.equal(productionValue.includes(productionBinding.authSessionId), false);
      assert.equal(productionValue.includes(productionBinding.sessionProof), false);
      assert.equal(
        readAuthMetricOriginCookieValue({
          value: productionValue,
          role: "advertiser",
          secret,
          ...productionBinding,
          nowMs,
        }),
        "production",
      );
      assert.equal(
        readAuthMetricOriginCookieValue({
          value: productionValue,
          role: "influencer",
          secret,
          ...productionBinding,
          nowMs,
        }),
        undefined,
      );
      for (const replayBinding of [
        { ...productionBinding, userId: "22222222-2222-4222-8222-222222222222" },
        {
          ...productionBinding,
          authSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
        { ...productionBinding, sessionProof: "different-refresh-proof" },
      ]) {
        assert.equal(
          readAuthMetricOriginCookieValue({
            value: productionValue,
            role: "advertiser",
            secret,
            ...replayBinding,
            nowMs,
          }),
          undefined,
        );
      }
      assert.equal(
        readAuthMetricOriginCookieValue({
          value: `${productionValue.slice(0, -1)}${
            productionValue.endsWith("A") ? "B" : "A"
          }`,
          role: "advertiser",
          secret,
          ...productionBinding,
          nowMs,
        }),
        undefined,
      );
      assert.equal(
        readAuthMetricOriginCookieValue({
          value: productionValue,
          role: "advertiser",
          secret,
          ...productionBinding,
          nowMs: nowMs + 2 * 60 * 60 * 1000,
        }),
        undefined,
      );

      const qaValue = createAuthMetricOriginCookieValue({
        role: "advertiser",
        origin: "qa",
        secret,
        userId: "33333333-3333-4333-8333-333333333333",
        authSessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        sessionProof: "qa-refresh-proof",
        nowMs,
      });
      assert.ok(qaValue);
      assert.equal(
        readAuthMetricOriginCookieValue({
          value: qaValue,
          role: "advertiser",
          secret,
          ...productionBinding,
          nowMs,
        }),
        undefined,
      );
    } finally {
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
    }
  });

  it("requires definitive Supabase auth evidence before terminating a session", () => {
    for (const code of [
      "refresh_token_not_found",
      "refresh_token_already_used",
      "session_expired",
      "session_not_found",
    ]) {
      assert.equal(
        isTerminalSupabaseRefreshFailure({ status: 400, code }),
        true,
        `${code} should terminate an invalid refresh session`,
      );
    }

    for (const status of [400, 403, 404, 409, 422, 500, 502, 503, 504]) {
      assert.equal(
        isTerminalSupabaseRefreshFailure({ status, code: "unexpected_failure" }),
        false,
        `${status} without terminal auth evidence should remain retryable`,
      );
    }

    assert.equal(isTerminalSupabaseAccessFailure({ status: 401 }), true);
    assert.equal(
      isTerminalSupabaseAccessFailure({
        status: 503,
        code: "session_not_found",
      }),
      false,
    );
  });

  it("keeps both login entrypoints on the shared cookie policy", () => {
    const server = read("server/index.ts");
    const fastAuth = read("lib/fast-auth.ts");

    for (const source of [server, fastAuth]) {
      assert.match(source, /userSessionAccessMaxAgeSeconds/);
      assert.match(source, /userSessionRefreshMaxAgeSeconds/);
      assert.doesNotMatch(source, /60 \* 60 \* 24 \* 14/);
    }
  });
});

describe("server auth refresh integration", { concurrency: false }, () => {
  before(async () => {
    fakeSupabaseServer = createServer(async (request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/auth/v1/token" &&
        requestUrl.searchParams.get("grant_type") === "password"
      ) {
        fakeSupabaseState.passwordGrantCalls += 1;
        const body = await readJsonBody(request);
        const email = String(body.email ?? "").toLowerCase();
        const userId = email.includes("advertiser")
          ? advertiserUserId
          : influencerUserId;
        sendJson(response, 200, {
          access_token: `${userId}-password-access`,
          refresh_token: `${userId}-password-refresh`,
          expires_in: userSessionAccessMaxAgeSeconds,
          user: {
            id: userId,
            email: profileForUser(userId).email,
            email_confirmed_at: "2026-01-01T00:00:00.000Z",
          },
        });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/auth/v1/token" &&
        requestUrl.searchParams.get("grant_type") === "refresh_token"
      ) {
        const body = await readJsonBody(request);
        const refreshToken = String(body.refresh_token ?? "");
        fakeSupabaseState.refreshCalls += 1;
        fakeSupabaseState.refreshCallsByToken.set(
          refreshToken,
          (fakeSupabaseState.refreshCallsByToken.get(refreshToken) ?? 0) + 1,
        );

        if (fakeSupabaseState.mode === "terminal") {
          sendJson(response, 400, {
            code: "refresh_token_not_found",
            message: "Session containing the refresh token was not found",
          });
          return;
        }

        if (fakeSupabaseState.mode === "ambiguous") {
          sendJson(response, 404, {
            code: "not_found",
            message: "Auth route was not found",
          });
          return;
        }

        if (fakeSupabaseState.mode === "transient") {
          sendJson(response, 503, { message: "temporarily unavailable" });
          return;
        }

        const userId = refreshToken.includes("advertiser")
          ? advertiserUserId
          : influencerUserId;
        const accessToken = refreshToken.includes("origin-binding")
          ? createUnsignedTestAccessToken(
              userId,
              `session-${refreshToken}`,
            )
          : `${refreshToken}-access-rotated`;
        const reply = () =>
          sendJson(response, 200, {
            access_token: accessToken,
            refresh_token: `${refreshToken}-refresh-rotated`,
            expires_in: userSessionAccessMaxAgeSeconds,
            user: {
              id: userId,
              email: profileForUser(userId).email,
              email_confirmed_at: "2026-01-01T00:00:00.000Z",
            },
          });

        if (fakeSupabaseState.mode === "timeout") {
          setTimeout(reply, Math.max(fakeSupabaseState.delayMs, 1_000));
          return;
        }
        if (fakeSupabaseState.delayMs > 0) {
          setTimeout(reply, fakeSupabaseState.delayMs);
          return;
        }
        reply();
        return;
      }

      if (requestUrl.pathname === "/auth/v1/user") {
        if (fakeSupabaseState.mode === "user-transient") {
          sendJson(response, 503, { message: "user verification unavailable" });
          return;
        }
        if (fakeSupabaseState.mode === "user-timeout") {
          setTimeout(() => {
            if (!response.destroyed) {
              sendJson(response, 401, { message: "expired access token" });
            }
          }, Math.max(fakeSupabaseState.delayMs, 1_000));
          return;
        }
        sendJson(response, 401, { message: "expired access token" });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/auth/v1/logout"
      ) {
        const accessToken = String(request.headers.authorization ?? "").replace(
          /^Bearer\s+/i,
          "",
        );
        fakeSupabaseState.logoutAccessTokens.push(accessToken);
        if (
          fakeSupabaseState.rejectExpiredAccessLogout &&
          accessToken.includes("expired-access")
        ) {
          sendJson(response, 401, { message: "expired access token" });
          return;
        }
        response.statusCode = 204;
        response.end();
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/rest/v1/rpc/record_operational_auth_metric"
      ) {
        fakeSupabaseState.authMetricCalls.push(await readJsonBody(request));
        sendJson(response, 200, null);
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/rest/v1/rpc/reserve_admin_mfa_rate_limit"
      ) {
        const body = await readJsonBody(request);
        const reservationId = String(body.p_reservation_id ?? "");
        const keys = [
          String(body.p_user_bucket_key ?? ""),
          String(body.p_factor_bucket_key ?? ""),
          String(body.p_ip_bucket_key ?? ""),
        ];
        const maxAttempts = Number(body.p_max_attempts ?? 0);
        const blocked = keys.some(
          (key) =>
            (fakeSupabaseState.adminMfaAttemptCounts.get(key) ?? 0) >=
            maxAttempts,
        );
        if (!blocked) {
          for (const key of keys) {
            fakeSupabaseState.adminMfaAttemptCounts.set(
              key,
              (fakeSupabaseState.adminMfaAttemptCounts.get(key) ?? 0) + 1,
            );
          }
          fakeSupabaseState.adminMfaReservations.set(reservationId, keys);
        }
        sendJson(response, 200, [
          {
            blocked,
            retry_after_seconds: blocked ? 60 : 0,
            reserved: !blocked,
          },
        ]);
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname ===
          "/rest/v1/rpc/rollback_admin_mfa_rate_limit_reservation"
      ) {
        const body = await readJsonBody(request);
        const reservationId = String(body.p_reservation_id ?? "");
        const keys = fakeSupabaseState.adminMfaReservations.get(reservationId);
        if (keys) {
          for (const key of keys) {
            fakeSupabaseState.adminMfaAttemptCounts.set(
              key,
              Math.max(
                0,
                (fakeSupabaseState.adminMfaAttemptCounts.get(key) ?? 0) - 1,
              ),
            );
          }
          fakeSupabaseState.adminMfaReservations.delete(reservationId);
        }
        sendJson(response, 200, true);
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname ===
          "/rest/v1/rpc/finalize_admin_mfa_rate_limit_reservation"
      ) {
        if (fakeSupabaseState.adminMfaFinalizeUnavailable) {
          sendJson(response, 503, { message: "finalize unavailable" });
          return;
        }
        const body = await readJsonBody(request);
        fakeSupabaseState.adminMfaReservations.delete(
          String(body.p_reservation_id ?? ""),
        );
        sendJson(response, 200, true);
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/rest/v1/rpc/consume_directsign_rate_limit"
      ) {
        const body = await readJsonBody(request);
        fakeSupabaseState.rateLimitCalls.push(body);
        if (fakeSupabaseState.rateLimitUnavailable) {
          sendJson(response, 503, { message: "rate limiter unavailable" });
          return;
        }
        sendJson(response, 200, [
          { blocked: false, retry_after_seconds: 0 },
        ]);
        return;
      }

      if (
        request.method === "DELETE" &&
        requestUrl.pathname === "/rest/v1/directsign_rate_limit_buckets"
      ) {
        fakeSupabaseState.rateLimitClears.push(
          requestUrl.searchParams.get("bucket_key") ?? "",
        );
        if (fakeSupabaseState.rateLimitClearUnavailable) {
          sendJson(response, 503, { message: "clear unavailable" });
          return;
        }
        response.statusCode = 204;
        response.end();
        return;
      }

      if (requestUrl.pathname === "/rest/v1/profiles") {
        const requestedUserId =
          requestUrl.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
        sendJson(
          response,
          200,
          requestedUserId
            ? [
                {
                  ...profileForUser(requestedUserId),
                  ...(fakeSupabaseState.profileRoleOverride
                    ? { role: fakeSupabaseState.profileRoleOverride }
                    : {}),
                },
              ]
            : [],
        );
        return;
      }

      if (requestUrl.pathname === "/rest/v1/organization_members") {
        sendJson(response, 200, []);
        return;
      }

      sendJson(response, 200, []);
    });
    await listen(fakeSupabaseServer);
    const fakeAddress = fakeSupabaseServer.address() as AddressInfo;

    temporaryDataDir = mkdtempSync(join(tmpdir(), "yeollock-auth-session-"));
    for (const key of trackedEnvironmentKeys) {
      originalEnvironment.set(key, process.env[key]);
    }
    Object.assign(process.env, {
      VERCEL: "1",
      NODE_ENV: "test",
      DATA_DIR: temporaryDataDir,
      SUPABASE_URL: `http://127.0.0.1:${fakeAddress.port}`,
      SUPABASE_PUBLISHABLE_KEY: "session-test-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "session-test-service-role-key",
      SUPABASE_REQUEST_TIMEOUT_MS: "0.5",
      SUPABASE_PROFILE_CACHE_SECONDS: "0.001",
      DIRECTSIGN_DEMO_MODE: "true",
      DIRECTSIGN_ALLOW_PRODUCTION_DEMO_MODE: "true",
      DIRECTSIGN_TOKEN_ENCRYPTION_SECRET:
        "session-test-token-encryption-secret-0123456789abcdef",
      USER_SESSION_FAST_PATH_SECRET:
        "session-test-fast-path-secret-0123456789abcdef",
      DISABLE_PUBLIC_MARKETPLACE_CACHE_WARMUP: "1",
    });

    const { app } = await import("../server/index.ts");
    appServer = createServer(app);
    await listen(appServer);
    const appAddress = appServer.address() as AddressInfo;
    appBaseUrl = `http://127.0.0.1:${appAddress.port}`;
  });

  after(async () => {
    await close(appServer);
    await close(fakeSupabaseServer);
    if (temporaryDataDir) {
      rmSync(temporaryDataDir, { recursive: true, force: true });
    }
    for (const key of trackedEnvironmentKeys) {
      const original = originalEnvironment.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it("single-flights concurrent refreshes and renews the 30-day cookie", async () => {
    resetFakeSupabase("success", 35);
    const refreshToken = "influencer-concurrent";
    const requests = Array.from({ length: 16 }, () =>
      fetch(`${appBaseUrl}/api/influencer/session`, {
        headers: {
          Accept: "application/json",
          Cookie: `directsign_influencer_refresh=${refreshToken}`,
        },
      }),
    );
    const responses = await Promise.all(requests);
    const payloads = await Promise.all(responses.map((response) => response.json()));

    assert.equal(fakeSupabaseState.refreshCalls, 1);
    assert.equal(fakeSupabaseState.refreshCallsByToken.get(refreshToken), 1);
    for (const [index, response] of responses.entries()) {
      assert.equal(response.status, 200);
      assert.equal(
        (payloads[index] as { authenticated?: boolean }).authenticated,
        true,
      );
      assertPrivateSessionHeaders(response);
      const cookies = getCookieHeaders(response);
      assert.ok(
        cookies.some((cookie) =>
          cookie.startsWith("directsign_influencer_access="),
        ),
      );
      assert.ok(
        cookies.some(
          (cookie) =>
            cookie.startsWith("directsign_influencer_refresh=") &&
            cookie.includes(`Max-Age=${userSessionRefreshMaxAgeSeconds}`) &&
            cookie.includes("HttpOnly") &&
            cookie.includes("SameSite=Lax") &&
            cookie.includes("Secure"),
        ),
      );
    }
  });

  it("reuses a completed rotation while old-cookie requests are still arriving", async () => {
    resetFakeSupabase("success");
    const refreshToken = "advertiser-response-order";
    const request = () =>
      fetch(`${appBaseUrl}/api/advertiser/session`, {
        headers: {
          Accept: "application/json",
          Cookie: `directsign_advertiser_refresh=${refreshToken}`,
        },
      });

    const first = await request();
    const second = await request();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(fakeSupabaseState.refreshCalls, 1);
    assert.equal(fakeSupabaseState.refreshCallsByToken.get(refreshToken), 1);
  });

  it("rebinds the auth-origin cookie to each rotated session proof", async () => {
    for (const role of ["advertiser", "influencer"] as const) {
      resetFakeSupabase("success");
      const refreshToken = `${role}-origin-binding`;
      const userId = role === "advertiser" ? advertiserUserId : influencerUserId;
      const response = await fetch(`${appBaseUrl}/api/${role}/session`, {
        headers: {
          Accept: "application/json",
          Cookie: `directsign_${role}_refresh=${refreshToken}`,
        },
      });

      assert.equal(response.status, 200);
      const cookieName = getAuthMetricOriginCookieName(role);
      const cookieHeader = getCookieHeaders(response).find((cookie) =>
        cookie.startsWith(`${cookieName}=`),
      );
      assert.ok(cookieHeader, `${role} auth-origin cookie was not rebound`);
      const encodedValue = cookieHeader.split(";", 1)[0]!.slice(cookieName.length + 1);
      const value = decodeURIComponent(encodedValue);
      const binding = {
        value,
        role,
        secret: process.env.DIRECTSIGN_TOKEN_ENCRYPTION_SECRET!,
        userId,
        authSessionId: `session-${refreshToken}`,
      };

      assert.equal(
        readAuthMetricOriginCookieValue({
          ...binding,
          sessionProof: `${refreshToken}-refresh-rotated`,
        }),
        "qa",
      );
      assert.equal(
        readAuthMetricOriginCookieValue({
          ...binding,
          sessionProof: refreshToken,
        }),
        undefined,
      );
    }
  });

  it("does not rotate or clear cookies when access verification is transient", async () => {
    resetFakeSupabase("user-transient");
    const response = await fetch(`${appBaseUrl}/api/influencer/session`, {
      headers: {
        Accept: "application/json",
        Cookie:
          "directsign_influencer_access=temporary-access; directsign_influencer_refresh=influencer-preserved",
      },
    });
    const payload = (await response.json()) as { retryable?: boolean };

    assert.equal(response.status, 503);
    assert.equal(payload.retryable, true);
    assert.equal(fakeSupabaseState.refreshCalls, 0);
    assert.deepEqual(getCookieHeaders(response), []);
  });

  it("times out access verification as retryable without rotating or clearing cookies", async () => {
    resetFakeSupabase("user-timeout", 500);
    const startedAt = Date.now();
    const response = await fetch(`${appBaseUrl}/api/advertiser/session`, {
      headers: {
        Accept: "application/json",
        Cookie:
          "directsign_advertiser_access=temporary-access; directsign_advertiser_refresh=advertiser-preserved",
      },
    });
    const elapsedMs = Date.now() - startedAt;
    const payload = (await response.json()) as { retryable?: boolean };

    assert.equal(response.status, 503);
    assert.equal(payload.retryable, true);
    assert.equal(fakeSupabaseState.refreshCalls, 0);
    assert.ok(elapsedMs < 1_000, `access verification timeout took ${elapsedMs}ms`);
    assertPrivateSessionHeaders(response);
    assert.deepEqual(getCookieHeaders(response), []);
  });

  it("returns retryable 503 without clearing cookies on transient refresh failure", async () => {
    resetFakeSupabase("transient");
    const response = await fetch(`${appBaseUrl}/api/advertiser/session`, {
      headers: {
        Accept: "application/json",
        Cookie: "directsign_advertiser_refresh=advertiser-transient",
      },
    });
    const payload = (await response.json()) as {
      error?: string;
      retryable?: boolean;
    };

    assert.equal(response.status, 503);
    assert.equal(payload.retryable, true);
    assert.equal(payload.error, "Authentication service temporarily unavailable");
    assertPrivateSessionHeaders(response);
    assert.deepEqual(getCookieHeaders(response), []);
  });

  it("preserves cookies when a 4xx response does not prove token invalidity", async () => {
    resetFakeSupabase("ambiguous");
    const response = await fetch(`${appBaseUrl}/api/advertiser/session`, {
      headers: {
        Accept: "application/json",
        Cookie: "directsign_advertiser_refresh=advertiser-ambiguous",
      },
    });
    const payload = (await response.json()) as { retryable?: boolean };

    assert.equal(response.status, 503);
    assert.equal(payload.retryable, true);
    assertPrivateSessionHeaders(response);
    assert.deepEqual(getCookieHeaders(response), []);
  });

  it("times out refresh calls as retryable 503 without clearing cookies", async () => {
    resetFakeSupabase("timeout", 500);
    const startedAt = Date.now();
    const response = await fetch(`${appBaseUrl}/api/influencer/session`, {
      headers: {
        Accept: "application/json",
        Cookie: "directsign_influencer_refresh=influencer-timeout",
      },
    });
    const elapsedMs = Date.now() - startedAt;
    const payload = (await response.json()) as { retryable?: boolean };

    assert.equal(response.status, 503);
    assert.equal(payload.retryable, true);
    assert.ok(elapsedMs < 1_000, `refresh timeout took ${elapsedMs}ms`);
    assertPrivateSessionHeaders(response);
    assert.deepEqual(getCookieHeaders(response), []);
  });

  it("clears cookies only after a terminal invalid refresh response", async () => {
    resetFakeSupabase("terminal");
    const response = await fetch(`${appBaseUrl}/api/advertiser/session`, {
      headers: {
        Accept: "application/json",
        Cookie: "directsign_advertiser_refresh=advertiser-invalid",
      },
    });
    const payload = (await response.json()) as { authenticated?: boolean };

    assert.equal(response.status, 200);
    assert.equal(payload.authenticated, false);
    assertPrivateSessionHeaders(response);
    const cookies = getCookieHeaders(response);
    assert.ok(
      cookies.some(
        (cookie) =>
          cookie.startsWith("directsign_advertiser_access=") &&
          cookie.includes("Max-Age=0"),
      ),
    );
    assert.ok(
      cookies.some(
        (cookie) =>
          cookie.startsWith("directsign_advertiser_refresh=") &&
          cookie.includes("Max-Age=0"),
      ),
    );
  });

  it("keeps explicit logout authoritative and clears the persisted session", async () => {
    resetFakeSupabase("success");
    const refreshToken = "influencer-logout";
    const sessionResponse = await fetch(`${appBaseUrl}/api/influencer/session`, {
      headers: {
        Accept: "application/json",
        Cookie: `directsign_influencer_refresh=${refreshToken}`,
      },
    });
    assert.equal(sessionResponse.status, 200);

    const logoutResponse = await fetch(`${appBaseUrl}/api/influencer/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: [
          `directsign_influencer_access=${refreshToken}-access-rotated`,
          `directsign_influencer_refresh=${refreshToken}-refresh-rotated`,
        ].join("; "),
      },
    });
    const payload = (await logoutResponse.json()) as {
      authenticated?: boolean;
    };

    assert.equal(logoutResponse.status, 200);
    assert.equal(payload.authenticated, false);
    assertPrivateSessionHeaders(logoutResponse);
    const cookies = getCookieHeaders(logoutResponse);
    assert.ok(
      cookies.some(
        (cookie) =>
          cookie.startsWith("directsign_influencer_access=") &&
          cookie.includes("Max-Age=0"),
      ),
    );
    assert.ok(
      cookies.some(
        (cookie) =>
          cookie.startsWith("directsign_influencer_refresh=") &&
          cookie.includes("Max-Age=0"),
      ),
    );
  });

  it("refreshes an expired access token only to revoke it during logout", async () => {
    resetFakeSupabase("success");
    fakeSupabaseState.rejectExpiredAccessLogout = true;
    const refreshToken = "influencer-logout-fallback";
    const response = await fetch(`${appBaseUrl}/api/influencer/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: [
          "directsign_influencer_access=expired-access",
          `directsign_influencer_refresh=${refreshToken}`,
        ].join("; "),
      },
    });

    assert.equal(response.status, 200);
    assert.equal(fakeSupabaseState.refreshCalls, 1);
    assert.deepEqual(fakeSupabaseState.logoutAccessTokens, [
      "expired-access",
      `${refreshToken}-access-rotated`,
    ]);
    const cookies = getCookieHeaders(response);
    assert.ok(
      cookies.some((cookie) =>
        cookie.startsWith("directsign_influencer_logout_barrier="),
      ),
    );
  });

  it("keeps logout authoritative when a stale refresh response arrives later", async () => {
    resetFakeSupabase("success");
    const refreshToken = "advertiser-stale-response";
    const staleSessionResponse = await fetch(
      `${appBaseUrl}/api/advertiser/session`,
      {
        headers: {
          Accept: "application/json",
          Cookie: `directsign_advertiser_refresh=${refreshToken}`,
        },
      },
    );
    assert.equal(staleSessionResponse.status, 200);
    const staleSessionCookies = getCookieHeaders(staleSessionResponse);

    const logoutResponse = await fetch(`${appBaseUrl}/api/advertiser/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: [
          `directsign_advertiser_access=${refreshToken}-access-rotated`,
          `directsign_advertiser_refresh=${refreshToken}-refresh-rotated`,
        ].join("; "),
      },
    });
    assert.equal(logoutResponse.status, 200);

    const browserCookies = new Map<string, string>();
    applySetCookies(browserCookies, getCookieHeaders(logoutResponse));
    applySetCookies(browserCookies, staleSessionCookies);
    assert.ok(browserCookies.has("directsign_advertiser_logout_barrier"));
    assert.ok(browserCookies.has("directsign_advertiser_refresh"));

    const followup = await fetch(`${appBaseUrl}/api/advertiser/session`, {
      headers: {
        Accept: "application/json",
        Cookie: serializeCookieJar(browserCookies),
      },
    });
    const payload = (await followup.json()) as { authenticated?: boolean };
    assert.equal(followup.status, 200);
    assert.equal(payload.authenticated, false);
    assert.equal(fakeSupabaseState.refreshCalls, 1);
  });

  it("keeps a pre-logout refresh response blocked after a new login", async () => {
    resetFakeSupabase("success");
    const refreshToken = "advertiser-stale-after-relogin";
    const staleSessionResponse = await fetch(
      `${appBaseUrl}/api/advertiser/session`,
      {
        headers: {
          Accept: "application/json",
          Cookie: `directsign_advertiser_refresh=${refreshToken}`,
        },
      },
    );
    assert.equal(staleSessionResponse.status, 200);
    const staleSessionCookies = getCookieHeaders(staleSessionResponse);

    const logoutResponse = await fetch(`${appBaseUrl}/api/advertiser/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: [
          `directsign_advertiser_access=${refreshToken}-access-rotated`,
          `directsign_advertiser_refresh=${refreshToken}-refresh-rotated`,
        ].join("; "),
      },
    });
    assert.equal(logoutResponse.status, 200);

    const browserCookies = new Map<string, string>();
    applySetCookies(browserCookies, getCookieHeaders(logoutResponse));
    const barrier = browserCookies.get(
      "directsign_advertiser_logout_barrier",
    );
    assert.ok(barrier);

    const loginResponse = await fetch(`${appBaseUrl}/api/advertiser/login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: serializeCookieJar(browserCookies),
      },
      body: JSON.stringify({
        email: "session-advertiser@example.test",
        password: "LocalQaPassword!123",
      }),
    });
    assert.equal(loginResponse.status, 200);
    applySetCookies(browserCookies, getCookieHeaders(loginResponse));
    assert.equal(
      browserCookies.get("directsign_advertiser_logout_resume"),
      barrier,
    );

    applySetCookies(browserCookies, staleSessionCookies);
    assert.notEqual(
      browserCookies.get("directsign_advertiser_logout_resume"),
      barrier,
    );

    const followup = await fetch(`${appBaseUrl}/api/advertiser/session`, {
      headers: {
        Accept: "application/json",
        Cookie: serializeCookieJar(browserCookies),
      },
    });
    const payload = (await followup.json()) as { authenticated?: boolean };
    assert.equal(followup.status, 200);
    assert.equal(payload.authenticated, false);
    assert.equal(fakeSupabaseState.refreshCalls, 1);
  });

  it("terminates role-mismatched sessions for both customer roles", async () => {
    for (const role of ["advertiser", "influencer"] as const) {
      resetFakeSupabase("success");
      fakeSupabaseState.profileRoleOverride =
        role === "advertiser" ? "influencer" : "marketer";
      const response = await fetch(`${appBaseUrl}/api/${role}/session`, {
        headers: {
          Accept: "application/json",
          Cookie: `directsign_${role}_refresh=${role}-role-mismatch`,
        },
      });
      const cookies = getCookieHeaders(response);

      assert.equal(response.status, 403);
      assert.ok(
        cookies.some(
          (cookie) =>
            cookie.startsWith(`directsign_${role}_refresh=`) &&
            cookie.includes("Max-Age=0"),
        ),
      );
      assert.ok(
        cookies.some((cookie) =>
          cookie.startsWith(`directsign_${role}_logout_barrier=`),
        ),
      );
      assert.equal(fakeSupabaseState.logoutAccessTokens.length, 1);
    }
    fakeSupabaseState.profileRoleOverride = undefined;
  });

  it("terminates influencer role mismatches on dashboard and profile routes", async () => {
    for (const [index, path] of [
      "/api/influencer/dashboard",
      "/api/influencer/public-profile",
    ].entries()) {
      resetFakeSupabase("success");
      fakeSupabaseState.profileRoleOverride = "marketer";
      await new Promise((resolve) => setTimeout(resolve, 5));
      const response = await fetch(`${appBaseUrl}${path}`, {
        headers: {
          Accept: "application/json",
          Cookie: `directsign_influencer_refresh=influencer-route-mismatch-${index}`,
        },
      });
      const cookies = getCookieHeaders(response);

      assert.equal(response.status, 403);
      assert.ok(
        cookies.some(
          (cookie) =>
            cookie.startsWith("directsign_influencer_refresh=") &&
            cookie.includes("Max-Age=0"),
        ),
      );
      assert.ok(
        cookies.some((cookie) =>
          cookie.startsWith("directsign_influencer_logout_barrier="),
        ),
      );
      assert.equal(fakeSupabaseState.logoutAccessTokens.length, 1);
    }
    fakeSupabaseState.profileRoleOverride = undefined;
  });

  it("marks both anonymous session probes private and cookie-varying", async () => {
    for (const role of ["advertiser", "influencer"] as const) {
      const response = await fetch(`${appBaseUrl}/api/${role}/session`, {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as { authenticated?: boolean };
      assert.equal(response.status, 200);
      assert.equal(payload.authenticated, false);
      assertPrivateSessionHeaders(response);
    }
  });

  it("atomically admits at most five parallel admin MFA attempts and rolls back once", async () => {
    resetFakeSupabase("success");
    const {
      reserveAdminMfaRateLimit,
      rollbackAdminMfaRateLimitReservation,
    } = await import("../server/index.ts");
    const request = {
      ip: "198.51.100.42",
      socket: { remoteAddress: "198.51.100.42" },
    } as Parameters<typeof reserveAdminMfaRateLimit>[0];

    const reservations = await Promise.all(
      Array.from({ length: 8 }, () =>
        reserveAdminMfaRateLimit(
          request,
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ),
      ),
    );
    const admitted = reservations.filter((reservation) => !reservation.blocked);
    assert.equal(admitted.length, 5);
    assert.equal(reservations.filter((reservation) => reservation.blocked).length, 3);
    assert.equal(new Set(admitted.map((reservation) => reservation.id)).size, 5);
    assert.equal(fakeSupabaseState.adminMfaAttemptCounts.size, 3);
    for (const [key, count] of fakeSupabaseState.adminMfaAttemptCounts) {
      assert.match(key, /^[a-f0-9]{64}$/);
      assert.equal(count, 5);
    }

    await rollbackAdminMfaRateLimitReservation(admitted[0]!.id);
    await rollbackAdminMfaRateLimitReservation(admitted[0]!.id);
    for (const count of fakeSupabaseState.adminMfaAttemptCounts.values()) {
      assert.equal(count, 4);
    }
    const retry = await reserveAdminMfaRateLimit(
      request,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    assert.equal(retry.blocked, false);
    for (const count of fakeSupabaseState.adminMfaAttemptCounts.values()) {
      assert.equal(count, 5);
    }
  });

  it("records early production admin MFA failures while excluding QA origins", async () => {
    const { createAdminPendingMfaBindingToken } = await import(
      "../server/index.ts"
    );
    const secret = process.env.DIRECTSIGN_TOKEN_ENCRYPTION_SECRET!;
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const authSessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const factorId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const createBinding = (dataOrigin: "production" | "qa") =>
      createAdminPendingMfaBindingToken({
        secret,
        userId,
        authSessionId,
        factorId,
        dataOrigin,
      });
    const submit = (binding: string, code: string) =>
      fetch(`${appBaseUrl}/api/admin/mfa/verify`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: [
            "directsign_admin_access=pending-admin-access",
            `directsign_admin_mfa_factor=${encodeURIComponent(binding)}`,
          ].join("; "),
        },
        body: JSON.stringify({ code }),
      });
    const waitForMetrics = async (minimum: number) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (fakeSupabaseState.authMetricCalls.length >= minimum) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    resetFakeSupabase("success");
    const invalidProduction = await submit(createBinding("production"), "bad");
    assert.equal(invalidProduction.status, 422);
    await waitForMetrics(1);
    assert.deepEqual(fakeSupabaseState.authMetricCalls, [
      {
        p_operation: "admin_mfa_verify",
        p_role: "admin",
        p_outcome: "rejected",
        p_latency_ms: fakeSupabaseState.authMetricCalls[0]?.p_latency_ms,
        p_data_origin: "production",
      },
    ]);
    assert.equal(
      Number.isFinite(fakeSupabaseState.authMetricCalls[0]?.p_latency_ms),
      true,
    );

    resetFakeSupabase("success");
    const invalidQa = await submit(createBinding("qa"), "bad");
    assert.equal(invalidQa.status, 422);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(fakeSupabaseState.authMetricCalls, []);

    resetFakeSupabase("user-transient");
    const providerFailure = await submit(createBinding("production"), "123456");
    assert.equal(providerFailure.status, 503);
    await waitForMetrics(1);
    assert.equal(fakeSupabaseState.authMetricCalls.length, 1);
    assert.equal(
      fakeSupabaseState.authMetricCalls[0]?.p_outcome,
      "provider_error",
    );

    resetFakeSupabase("success");
    const productionBinding = createBinding("production");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await submit(productionBinding, "bad")).status);
    }
    assert.deepEqual(statuses, [422, 422, 422, 422, 422, 429]);
    await waitForMetrics(6);
    assert.equal(
      fakeSupabaseState.authMetricCalls.filter(
        (call) => call.p_outcome === "rate_limited",
      ).length,
      1,
    );
    for (const call of fakeSupabaseState.authMetricCalls) {
      const serialized = JSON.stringify(call);
      assert.equal(serialized.includes(userId), false);
      assert.equal(serialized.includes(authSessionId), false);
      assert.equal(serialized.includes(factorId), false);
      assert.equal(serialized.includes("pending-admin-access"), false);
      assert.equal(serialized.includes("bad"), false);
    }
  });

  it("fails admin MFA closed when reservation finalization is unavailable", async () => {
    resetFakeSupabase("success");
    const { createAdminPendingMfaBindingToken } = await import("../server/index.ts");
    const factorBinding = createAdminPendingMfaBindingToken({
      secret: process.env.DIRECTSIGN_TOKEN_ENCRYPTION_SECRET!,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      authSessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      factorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      dataOrigin: "qa",
    });
    assert.ok(factorBinding);

    fakeSupabaseState.adminMfaFinalizeUnavailable = true;
    const response = await fetch(`${appBaseUrl}/api/admin/mfa/verify`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: [
          "directsign_admin_access=pending-admin-access",
          `directsign_admin_mfa_factor=${encodeURIComponent(factorBinding)}`,
        ].join("; "),
      },
      body: JSON.stringify({ code: "not-a-code" }),
    });
    const payload = (await response.json()) as { retryable?: boolean };

    assert.equal(response.status, 503);
    assert.equal(payload.retryable, true);
    assert.equal(fakeSupabaseState.adminMfaReservations.size, 1);
    assert.deepEqual(getCookieHeaders(response), []);
    for (const count of fakeSupabaseState.adminMfaAttemptCounts.values()) {
      assert.equal(count, 1);
    }
    fakeSupabaseState.adminMfaFinalizeUnavailable = false;
  });

  it("marks the dedicated Vercel login entrypoint private and cookie-varying", async () => {
    resetFakeSupabase("success");
    const { default: advertiserLoginHandler } = await import(
      "../api/advertiser/login.ts"
    );
    const fastLoginServer = createServer((request, response) => {
      void advertiserLoginHandler(request, response);
    });
    await listen(fastLoginServer);
    try {
      const address = fastLoginServer.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/advertiser/login`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "session-advertiser@example.test",
            password: "LocalQaPassword!123",
          }),
        },
      );

      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vary"), "Cookie");
      assert.equal(
        response.headers.get("x-yeollock-auth-entrypoint"),
        "fast-advertiser",
      );
      assert.equal(response.status, 200);
      assert.equal(fakeSupabaseState.rateLimitCalls.length, 2);
      for (const call of fakeSupabaseState.rateLimitCalls) {
        assert.match(String(call.p_bucket_key ?? ""), /^[a-f0-9]{64}$/);
        assert.equal(JSON.stringify(call).includes("session-advertiser"), false);
        assert.equal(JSON.stringify(call).includes("127.0.0.1"), false);
      }
      assert.deepEqual(fakeSupabaseState.rateLimitClears, [
        `eq.${String(fakeSupabaseState.rateLimitCalls[1]?.p_bucket_key ?? "")}`,
      ]);
    } finally {
      await close(fastLoginServer);
    }
  });

  it("fails the hosted fast-login limiter closed without touching auth cookies", async () => {
    resetFakeSupabase("success");
    fakeSupabaseState.rateLimitUnavailable = true;
    const { default: advertiserLoginHandler } = await import(
      "../api/advertiser/login.ts"
    );
    const fastLoginServer = createServer((request, response) => {
      void advertiserLoginHandler(request, response);
    });
    await listen(fastLoginServer);
    try {
      const address = fastLoginServer.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/advertiser/login`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Cookie: "directsign_advertiser_refresh=existing-refresh",
          },
          body: JSON.stringify({
            email: "session-advertiser@example.test",
            password: "LocalQaPassword!123",
          }),
        },
      );
      const payload = (await response.json()) as { retryable?: boolean };

      assert.equal(response.status, 503);
      assert.equal(payload.retryable, true);
      assert.equal(response.headers.get("retry-after"), "2");
      assert.equal(fakeSupabaseState.passwordGrantCalls, 0);
      assert.deepEqual(response.headers.getSetCookie(), []);
    } finally {
      fakeSupabaseState.rateLimitUnavailable = false;
      await close(fastLoginServer);
    }
  });
});

describe("client transient-session regressions", () => {
  it("does not turn an advertiser session 5xx or network error into logout", () => {
    const source = read("src/pages/marketing/AdvertiserAuthGate.tsx");
    const start = source.indexOf("let retryAttempt = 0");
    const end = source.indexOf("const handleSubmit", start);
    const sessionCheck = source.slice(start, end);
    const authoritativeLogoutIndex = sessionCheck.indexOf(
      "const isAuthoritativeLogout",
    );
    const clearSessionIndex = sessionCheck.indexOf(
      "clearAdvertiserSessionCache()",
    );

    assert.ok(authoritativeLogoutIndex >= 0);
    assert.ok(clearSessionIndex > authoritativeLogoutIndex);
    assert.match(
      sessionCheck,
      /response\.status === 401[\s\S]+response\.status === 403[\s\S]+response\.ok && data\.authenticated === false/,
    );
    assert.match(sessionCheck, /retryDelayMs = Math\.min/);
    assert.match(
      source,
      /const \[isChecking, setIsChecking\] = useState\(true\)/,
    );
    assert.match(
      source,
      /const \[isAuthenticated, setIsAuthenticated\] = useState\(false\)/,
    );
    assert.doesNotMatch(source, /activateVerifiedCachedSession/);
    assert.doesNotMatch(
      sessionCheck,
      /setIsAuthenticated\(Boolean\(latestCachedSession\)\)/,
    );
    const transientCatch = sessionCheck.slice(
      sessionCheck.indexOf("} catch {"),
      sessionCheck.indexOf("if (cancelled) return", sessionCheck.indexOf("} catch {")),
    );
    assert.doesNotMatch(transientCatch, /clearAdvertiserSessionCache/);
    assert.equal(transientCatch.includes("setIsAuthenticated(false)"), false);
  });

  it("keeps marketplace shell mode unchanged for transient probes", () => {
    const source = read("src/pages/marketplace/MarketplacePages.tsx");
    const start = source.indexOf("function useMarketplaceShellMode");
    const end = source.indexOf("function useInfluencerMarketplaceShellMode", start);
    const hook = source.slice(start, end);

    assert.match(
      hook,
      /response\.status === 401[\s\S]+response\.status === 403[\s\S]+response\.ok && data\.authenticated === false/,
    );
    assert.match(
      hook,
      /useState<MarketplaceShellMode>\("checking"\)/,
    );
    assert.match(hook, /const checkSession = async/);
    assert.match(hook, /retryDelayMs = Math\.min/);
    assert.match(hook, /void checkSession\(\)/);
    const transientCatchStart = hook.indexOf("} catch {");
    const transientCatch = hook.slice(
      transientCatchStart,
      hook.indexOf("if (!active", transientCatchStart),
    );
    assert.equal(transientCatch.includes('setMode("anonymous")'), false);
    assert.match(transientCatch, /Keep the last known shell mode/);

    const appHeaderStart = source.indexOf("function MarketplaceAppHeader");
    const appHeaderEnd = source.indexOf("function PublicProfileHeader", appHeaderStart);
    const appHeader = source.slice(appHeaderStart, appHeaderEnd);
    const shellStart = source.indexOf("function MarketplaceShell");
    const shell = source.slice(shellStart);
    assert.match(appHeader, /const isCheckingSession = mode === "checking"/);
    assert.match(appHeader, /mode === "anonymous" \?/);
    assert.match(shell, /<MarketplaceAppHeader[\s\S]*?mode=\{mode\}/);
  });

  it("keeps campaign session state retryable instead of downgrading it", () => {
    const source = read("src/pages/marketplace/CampaignPages.tsx");
    const stateStart = source.indexOf("const [sessionStatus, setSessionStatus]");
    const checkStart = source.indexOf("const checkSession = async", stateStart);
    const checkEnd = source.indexOf("void checkSession()", checkStart);
    const sessionCheck = source.slice(checkStart, checkEnd);

    assert.match(
      sessionCheck,
      /response\.status === 401[\s\S]+response\.status === 403[\s\S]+response\.ok && data\.authenticated === false/,
    );
    assert.match(sessionCheck, /retryDelayMs = Math\.min/);
    const transientCatch = sessionCheck.slice(
      sessionCheck.indexOf("} catch {"),
      sessionCheck.indexOf("if (!active", sessionCheck.indexOf("} catch {")),
    );
    assert.equal(transientCatch.includes('setSessionStatus("anonymous")'), false);

    const applicationsStart = source.indexOf("const loadApplications = useCallback");
    const applicationsEnd = source.indexOf("const filteredApplications", applicationsStart);
    const applicationLoad = source.slice(applicationsStart, applicationsEnd);
    assert.match(
      applicationLoad,
      /sessionResponse\.status === 401[\s\S]+sessionResponse\.status === 403[\s\S]+sessionResponse\.ok && sessionData\.authenticated === false/,
    );
    assert.match(applicationLoad, /scheduleApplicationsRetry\(\)/);
    assert.match(applicationLoad, /applicationsRetryAttemptRef/);
    assert.match(
      applicationLoad,
      /if \(!sessionEstablished\)[\s\S]+scheduleApplicationsRetry\(\)[\s\S]+return/,
    );
    const retryableSessionBranch = applicationLoad.slice(
      applicationLoad.indexOf("} else {"),
      applicationLoad.indexOf(
        'const response = await apiFetch(',
      ),
    );
    assert.match(retryableSessionBranch, /status: "loading"/);
    assert.match(retryableSessionBranch, /scheduleApplicationsRetry\(\)/);
    assert.equal(retryableSessionBranch.includes('setShellMode("anonymous")'), false);
    assert.equal(retryableSessionBranch.includes('status: "error"'), false);
    assert.match(
      source,
      /useState<CampaignShellMode>\("checking"\)/,
    );
    assert.match(source, /const isCheckingSession = mode === "checking"/);
    assert.match(source, /sessionStatus === "anonymous"/);
    assert.match(source, /accountLink \?/);
  });
});
