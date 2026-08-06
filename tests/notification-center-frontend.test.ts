import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getNotificationCopy,
  getNotificationDestination,
  type NotificationItem,
} from "../src/domain/notifications";
import {
  clearNotificationCenterCache,
  getNotificationCenterSnapshot,
  readAllNotifications,
  refreshNotificationCount,
  refreshNotificationList,
} from "../src/hooks/useNotificationCenter";

test("notification destinations accept only the route-key allowlist", () => {
  assert.equal(
    getNotificationDestination("advertiser", "dashboard", {}),
    "/advertiser/dashboard",
  );
  assert.equal(
    getNotificationDestination("advertiser", "campaign_detail", {
      campaignId: "campaign_123",
    }),
    "/advertiser/campaigns?campaign=campaign%3Acampaign_123",
  );
  assert.equal(
    getNotificationDestination("influencer", "contract_detail", {
      contractId: "contract-123",
    }),
    "/contract/contract-123",
  );
  assert.equal(
    getNotificationDestination("influencer", "campaign_detail", {
      campaignId: "brand:legacy:1",
    }),
    "/influencer/campaigns?view=applied&campaign=brand%3Alegacy%3A1",
  );
  assert.equal(
    getNotificationDestination("influencer", "https://attacker.example", {
      url: "https://attacker.example",
    }),
    undefined,
  );
  assert.equal(
    getNotificationDestination("advertiser", "contract_detail", {
      contractId: "../admin",
    }),
    undefined,
  );
});

test("notification copy is Korean and does not expose unknown server copy", () => {
  const base: NotificationItem = {
    id: "event-1",
    eventType: "contract.signed",
    copyKey: "contract.signed",
    safeParams: { contractTitle: "여름 캠페인 계약" },
    routeKey: "contract_detail",
    routeParams: { contractId: "contract-1" },
    occurredAt: "2026-08-03T00:00:00.000Z",
    readAt: null,
  };

  assert.deepEqual(getNotificationCopy(base), {
    title: "계약 서명 완료",
    detail: "여름 캠페인 계약 서명이 완료되었습니다.",
  });

  const fallback = getNotificationCopy({
    ...base,
    copyKey: "server.internal.secret_event",
    safeParams: { message: "raw server message" },
  });
  assert.equal(fallback.title, "진행 상태가 업데이트됐어요");
  assert.equal(fallback.detail.includes("raw server message"), false);
});

test("campaign status notifications map server status codes to Korean labels", () => {
  const copy = getNotificationCopy({
    id: "00000000-0000-4000-8000-000000000001",
    eventType: "campaign.status_changed",
    copyKey: "campaign.status_changed",
    safeParams: {
      campaignTitle: "여름 캠페인",
      campaignStatus: "closed",
    },
    routeKey: "campaign_detail",
    routeParams: { campaignId: "campaign-1" },
    occurredAt: "2026-08-03T00:00:00.000Z",
    readAt: null,
  });

  assert.deepEqual(copy, {
    title: "캠페인 지원 결과",
    detail: "여름 캠페인 지원 결과가 미선정으로 확정되었습니다.",
  });
});

test("content review notifications state the actionable review result", () => {
  const base: NotificationItem = {
    id: "00000000-0000-4000-8000-000000000002",
    eventType: "contract.content_reviewed",
    copyKey: "contract.content_reviewed",
    safeParams: {
      contractTitle: "여름 캠페인 계약",
      reviewStatus: "changes_requested",
    },
    routeKey: "contract_detail",
    routeParams: { contractId: "contract-1" },
    occurredAt: "2026-08-03T00:00:00.000Z",
    readAt: null,
  };

  assert.deepEqual(getNotificationCopy(base), {
    title: "콘텐츠 검수 결과",
    detail: "여름 캠페인 계약 콘텐츠에 수정 요청이 도착했습니다.",
  });
  assert.equal(
    getNotificationCopy({
      ...base,
      safeParams: { ...base.safeParams, reviewStatus: "approved" },
    }).detail,
    "여름 캠페인 계약 콘텐츠가 승인되었습니다.",
  );
});

test("public brand profiles switch to the influencer app frame only after authentication", () => {
  const source = readFileSync(
    new URL("../src/pages/marketplace/MarketplacePages.tsx", import.meta.url),
    "utf8",
  );
  const publicBrandStart = source.indexOf(
    "export function PublicBrandProfilePage",
  );
  const marketplaceShellStart = source.indexOf(
    "function MarketplaceShell",
    publicBrandStart,
  );
  const publicBrandSource = source.slice(publicBrandStart, marketplaceShellStart);

  assert.equal(
    publicBrandSource.match(/showAuthenticatedActions=\{false\}/g)?.length,
    3,
  );
  assert.equal(
    publicBrandSource.match(/publicHeader=\{publicBrandHeader\}/g)?.length,
    3,
  );
  assert.match(
    publicBrandSource,
    /<PublicProfileHeader mode=\{influencerShellMode\} \{\.\.\.publicBrandHeader\} \/>/,
  );
  assert.match(publicBrandSource, /authenticatedRole: "influencer"/);
  assert.match(
    source,
    /mode === "authenticated" && authenticatedRole && !forceHref[\s\S]*?<MarketplaceAppHeader[\s\S]*?role=\{authenticatedRole\}[\s\S]*?actions=\{authenticatedActions\}/,
  );
});

test("authenticated influencer profiles keep the advertiser app frame and local back action", () => {
  const source = readFileSync(
    new URL("../src/pages/marketplace/MarketplacePages.tsx", import.meta.url),
    "utf8",
  );
  const publicInfluencerStart = source.indexOf(
    "export function PublicInfluencerProfilePage",
  );
  const publicBrandStart = source.indexOf(
    "export function PublicBrandProfilePage",
    publicInfluencerStart,
  );
  const publicInfluencerSource = source.slice(
    publicInfluencerStart,
    publicBrandStart,
  );

  assert.equal(
    publicInfluencerSource.match(/showAuthenticatedActions=\{false\}/g)?.length,
    3,
  );
  assert.equal(
    publicInfluencerSource.match(/publicHeader=\{publicInfluencerHeader\}/g)?.length,
    3,
  );
  assert.match(
    publicInfluencerSource,
    /<PublicProfileHeader[\s\S]*?mode=\{advertiserShellMode\}[\s\S]*?\{\.\.\.publicInfluencerHeader\}/,
  );
  assert.match(publicInfluencerSource, /authenticatedRole: "advertiser"/);
  assert.match(
    publicInfluencerSource,
    /authenticatedActions: <AdvertiserMarketplaceHeaderActions \/>/,
  );
  assert.match(
    publicInfluencerSource,
    /advertiserShellMode === "authenticated" && !isOwnPublishedProfile[\s\S]*?to="\/advertiser\/discover"[\s\S]*?인플루언서 찾기/,
  );
  assert.match(
    publicInfluencerSource,
    /inline-flex items-center justify-center gap-2 whitespace-nowrap[\s\S]*?<Handshake className="h-4 w-4 shrink-0" \/>[\s\S]*?1:1 계약 제안/,
  );
  assert.match(
    source,
    /function MarketplaceAppHeader\([\s\S]*?<HeaderNotificationCenterButton role=\{role\} \/>[\s\S]*?<HeaderMessageCenterButton[\s\S]*?<AdvertiserAccountSettingsMenu/,
  );
  assert.equal(
    source.match(/<AdvertiserMarketplaceHeaderActions \/>/g)?.length,
    2,
  );
});

test("campaign application operations use their dedicated endpoint", () => {
  const advertiserSource = readFileSync(
    new URL("../src/pages/marketing/Dashboard.tsx", import.meta.url),
    "utf8",
  );
  const influencerSource = readFileSync(
    new URL("../src/pages/marketplace/CampaignPages.tsx", import.meta.url),
    "utf8",
  );
  const qaSource = readFileSync(
    new URL("../scripts/qa-standard.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    advertiserSource,
    /\/api\/marketplace\/campaign-applications\?role=advertiser/,
  );
  assert.match(
    influencerSource,
    /\/api\/marketplace\/campaign-applications\?role=influencer/,
  );
  const applicantSortCheck = qaSource.slice(
    qaSource.indexOf("const checkAdvertiserApplicantSortMenu"),
    qaSource.indexOf("const checkInfluencerContractLoginContinuation"),
  );
  assert.match(
    applicantSortCheck,
    /\/api\/marketplace\/campaign-applications\?role=advertiser/,
  );
  assert.doesNotMatch(
    applicantSortCheck,
    /\/api\/marketplace\/messages\?role=advertiser/,
  );
  assert.match(applicantSortCheck, /const horizontalOverlap = rect/);
  assert.match(applicantSortCheck, /const horizontalEdgeAligned = rect/);
  assert.match(applicantSortCheck, /verticalGap <= 16/);
  assert.match(applicantSortCheck, /rect\.bottom <= window\.innerHeight/);
  assert.doesNotMatch(
    advertiserSource,
    /menuClassName="left-auto right-0 min-w-\[176px\]"/,
  );
  assert.match(advertiserSource, /menuClassName="min-w-\[176px\]"/);
  assert.match(influencerSource, /focusedCampaignId=\{focusedCampaignId\}/);
  assert.match(influencerSource, /scrollIntoView\(\{ block: "center" \}\)/);
  assert.match(
    advertiserSource,
    /campaign\.key === `campaign:\$\{selectedCampaignKey\}`/,
  );
});

test("count polling failure keeps the last unread value and cache clear removes it", async () => {
  const originalFetch = globalThis.fetch;
  let shouldFail = false;
  globalThis.fetch = (async () => {
    if (shouldFail) {
      return new Response(JSON.stringify({ error: "temporary" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        unreadCount: 5,
        through: "2026-08-03T00:00:00.000Z",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    clearNotificationCenterCache("advertiser");
    assert.equal(
      await refreshNotificationCount("advertiser", { force: true }),
      true,
    );
    assert.equal(
      getNotificationCenterSnapshot("advertiser").unreadCount,
      5,
    );

    shouldFail = true;
    assert.equal(
      await refreshNotificationCount("advertiser", { force: true }),
      false,
    );
    assert.equal(
      getNotificationCenterSnapshot("advertiser").unreadCount,
      5,
    );

    clearNotificationCenterCache("advertiser");
    assert.equal(
      getNotificationCenterSnapshot("advertiser").unreadCount,
      undefined,
    );
  } finally {
    clearNotificationCenterCache();
    globalThis.fetch = originalFetch;
  }
});

test("authorization failure clears private notification cache", async () => {
  const originalFetch = globalThis.fetch;
  let status = 200;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify(
        status === 200
          ? { unreadCount: 4, through: "2026-08-03T00:00:00.000Z" }
          : { error: "unauthorized" },
      ),
      {
        status,
        headers: { "Content-Type": "application/json" },
      },
    )) as typeof fetch;

  try {
    clearNotificationCenterCache("influencer");
    assert.equal(
      await refreshNotificationCount("influencer", { force: true }),
      true,
    );
    assert.equal(
      getNotificationCenterSnapshot("influencer").unreadCount,
      4,
    );

    status = 401;
    assert.equal(
      await refreshNotificationCount("influencer", { force: true }),
      false,
    );
    assert.equal(
      getNotificationCenterSnapshot("influencer").unreadCount,
      undefined,
    );
    assert.deepEqual(
      getNotificationCenterSnapshot("influencer").items,
      [],
    );
  } finally {
    clearNotificationCenterCache();
    globalThis.fetch = originalFetch;
  }
});

test("read-all uses the server cutoff and leaves a concurrent newer item unread", async () => {
  const originalFetch = globalThis.fetch;
  let postedThrough: string | undefined;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/notifications?")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "before-cutoff",
              eventType: "contract.signed",
              copyKey: "contract.signed",
              safeParams: {},
              routeKey: "dashboard",
              routeParams: {},
              occurredAt: "2026-08-03T00:00:00.000Z",
              readAt: null,
            },
            {
              id: "after-cutoff",
              eventType: "deadline.action_due",
              copyKey: "deadline.action_due",
              safeParams: {},
              routeKey: "dashboard",
              routeParams: {},
              occurredAt: "2026-08-03T00:00:02.000Z",
              readAt: null,
            },
          ],
          nextCursor: null,
          through: "2026-08-03T00:00:01.000Z",
          unreadCount: 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as { through?: string };
    postedThrough = body.through;
    return new Response(
      JSON.stringify({
        through: "2026-08-03T00:00:01.000Z",
        updatedCount: 1,
        unreadCount: 1,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    clearNotificationCenterCache("influencer");
    assert.equal(await refreshNotificationList("influencer"), true);
    assert.equal(await readAllNotifications("influencer"), true);
    const snapshot = getNotificationCenterSnapshot("influencer");
    assert.equal(postedThrough, "2026-08-03T00:00:01.000Z");
    assert.equal(snapshot.items[0]?.readAt, "2026-08-03T00:00:01.000Z");
    assert.equal(snapshot.items[1]?.readAt, null);
    assert.equal(snapshot.unreadCount, 1);
  } finally {
    clearNotificationCenterCache();
    globalThis.fetch = originalFetch;
  }
});
