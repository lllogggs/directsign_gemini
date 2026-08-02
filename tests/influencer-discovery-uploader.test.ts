import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  readPendingInfluencerBatch,
  stageInfluencerDiscoveryWorkbook,
} from "../scripts/lib/influencer-discovery-queue.mjs";
import {
  readUploaderState,
  runInfluencerDiscoveryBatchUpload,
} from "../scripts/upload-influencer-discovery-batch.mjs";
import {
  assertInfluencerUploaderSession,
  reserveExistingHandles,
  upsertSupabaseRows,
} from "../scripts/discover-korean-influencers.mjs";

async function withQueueRoot(callback: (rootDir: string) => Promise<void>) {
  const rootDir = await mkdtemp(path.join(tmpdir(), "yeollock-uploader-"));
  try {
    await callback(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function stageFixture(rootDir: string, createdAt: string) {
  return stageInfluencerDiscoveryWorkbook({
    rootDir,
    runId: `fixture-${createdAt}`,
    createdAt,
    category: "beauty",
    platform: "instagram",
    rows: [
      {
        id: "profile-a",
        platform: "instagram",
        platform_handle: "creator-a",
        display_name: "Creator A",
        source_evidence: { countryConfidence: "explicit" },
      },
      {
        id: "profile-b",
        platform: "instagram",
        platform_handle: "creator-b",
        display_name: "Creator B",
        source_evidence: { countryConfidence: "official" },
      },
    ],
  });
}

describe("influencer discovery batch uploader", () => {
  it("does not load any database code before the 12-hour boundary", async () => {
    await withQueueRoot(async (rootDir) => {
      await stageFixture(rootDir, "2026-07-15T00:00:00.000Z");
      let databaseLoads = 0;
      let visitorRuns = 0;

      const result = await runInfluencerDiscoveryBatchUpload(
        {
          rootDir,
          intervalHours: 12,
          now: "2026-07-15T11:59:59.999Z",
        },
        {
          loadDiscoveryUploadFunctions: async () => {
            databaseLoads += 1;
            throw new Error("database code must not load before due");
          },
          runNaverVisitorBatch: async () => {
            visitorRuns += 1;
            return { ok: true };
          },
        },
      );

      assert.equal(result.ok, true);
      assert.equal(result.skipped, "not_due");
      assert.equal(result.dueAt, "2026-07-15T12:00:00.000Z");
      assert.equal(databaseLoads, 0);
      assert.equal(visitorRuns, 0);
      assert.equal(
        (await readPendingInfluencerBatch({ rootDir })).files.length,
        1,
      );
    });
  });

  it("allows one explicit Product Owner forced upload before the boundary", async () => {
    await withQueueRoot(async (rootDir) => {
      await stageFixture(rootDir, "2026-07-15T00:00:00.000Z");
      let uploadedRows = 0;

      const result = await runInfluencerDiscoveryBatchUpload(
        {
          rootDir,
          intervalHours: 12,
          force: true,
          now: "2026-07-15T01:00:00.000Z",
        },
        {
          loadDiscoveryUploadFunctions: async () => ({
            reserveExistingHandles: async (
              rows: Array<Record<string, unknown>>,
            ) => rows,
            upsertSupabaseRows: async (
              rows: Array<Record<string, unknown>>,
            ) => {
              uploadedRows = rows.length;
              return rows.length;
            },
          }),
          runNaverVisitorBatch: async () => ({ ok: true, checked: 0 }),
        },
      );

      assert.equal(result.ok, true);
      if (!("forced" in result) || !("profile" in result)) {
        assert.fail("forced upload should return the completed upload result");
      }
      assert.equal(result.forced, true);
      assert.equal(result.profile.uploadedRows, 2);
      assert.equal(uploadedRows, 2);
      assert.equal(
        (await readPendingInfluencerBatch({ rootDir })).files.length,
        0,
      );
      const state = await readUploaderState({ rootDir });
      assert.equal(state.lastForcedUploadAt, "2026-07-15T01:00:00.000Z");
      assert.equal(
        state.lastSuccessfulUploadAt,
        "2026-07-15T01:00:00.000Z",
      );
    });
  });

  it("uploads only changed rows, archives after success, and does not roll back for visitor failure", async () => {
    await withQueueRoot(async (rootDir) => {
      await stageFixture(rootDir, "2026-07-15T00:00:00.000Z");
      let reserveOptions: unknown;
      let upsertOptions: unknown;
      let uploadedRows: Array<Record<string, unknown>> = [];
      let visitorSession: Record<string, unknown> | undefined;

      const result = await runInfluencerDiscoveryBatchUpload(
        {
          rootDir,
          intervalHours: 12,
          now: "2026-07-15T12:00:00.000Z",
        },
        {
          loadDiscoveryUploadFunctions: async () => ({
            reserveExistingHandles: async (
              rows: Array<Record<string, unknown>>,
              options: unknown,
            ) => {
              reserveOptions = options;
              return [rows[1]];
            },
            upsertSupabaseRows: async (
              rows: Array<Record<string, unknown>>,
              options: unknown,
            ) => {
              uploadedRows = rows;
              upsertOptions = options;
              return rows.length;
            },
          }),
          runNaverVisitorBatch: async (options: Record<string, unknown>) => {
            visitorSession = options;
            return {
              ok: false,
              error: "visitor service unavailable",
            };
          },
        },
      );

      assert.equal(result.ok, true);
      assert.ok("profile" in result && "visitor" in result);
      const reserveSession = (
        reserveOptions as {
          onlyChanged?: boolean;
          uploaderSession?: Record<string, unknown>;
        }
      ).uploaderSession;
      const upsertSession = (
        upsertOptions as { uploaderSession?: Record<string, unknown> }
      ).uploaderSession;
      assert.equal(
        (reserveOptions as { onlyChanged?: boolean }).onlyChanged,
        true,
      );
      assert.equal(typeof reserveSession?.token, "string");
      assert.equal(String(reserveSession?.token).length > 20, true);
      assert.equal(reserveSession?.pid, process.pid);
      assert.equal(reserveSession?.authorizedAt, "2026-07-15T12:00:00.000Z");
      assert.equal(reserveSession?.batchId, result.profile.batchId);
      assert.equal(reserveSession?.rootDir, path.resolve(rootDir));
      assert.deepEqual(upsertSession, reserveSession);
      assert.deepEqual(
        uploadedRows.map((row) => row.id),
        ["profile-b"],
      );
      assert.equal(result.profile.changedRows, 1);
      assert.equal(result.profile.uploadedRows, 1);
      assert.equal(result.visitor.ok, false);
      assert.equal(typeof visitorSession?.uploaderLockToken, "string");
      assert.equal(String(visitorSession?.uploaderLockToken).length > 20, true);
      assert.equal(visitorSession?.uploaderPid, process.pid);
      assert.equal(
        (await readPendingInfluencerBatch({ rootDir })).files.length,
        0,
      );

      const state = await readUploaderState({ rootDir });
      assert.equal(state.lastSuccessfulUploadAt, "2026-07-15T12:00:00.000Z");
      assert.equal(state.lastChangedRowCount, 1);
      assert.match(
        String(state.lastArchivePath),
        /archive[\\/]profiles[\\/].+\.xlsx$/,
      );
      assert.equal(state.lastVisitorError, "visitor service unavailable");
    });
  });

  it("retains pending XLSX after failure and blocks three-minute database retries", async () => {
    await withQueueRoot(async (rootDir) => {
      await stageFixture(rootDir, "2026-07-15T00:00:00.000Z");

      await assert.rejects(
        runInfluencerDiscoveryBatchUpload(
          {
            rootDir,
            intervalHours: 12,
            now: "2026-07-15T12:00:00.000Z",
          },
          {
            loadDiscoveryUploadFunctions: async () => ({
              reserveExistingHandles: async (
                rows: Array<Record<string, unknown>>,
              ) => rows,
              upsertSupabaseRows: async () => {
                throw new Error("simulated Supabase failure");
              },
            }),
            runNaverVisitorBatch: async () => ({ ok: true }),
          },
        ),
        /simulated Supabase failure/,
      );

      assert.equal(
        (await readPendingInfluencerBatch({ rootDir })).files.length,
        1,
      );
      const failedState = await readUploaderState({ rootDir });
      assert.equal(
        failedState.lastSupabaseAccessAt,
        "2026-07-15T12:00:00.000Z",
      );
      assert.equal(failedState.lastError, "simulated Supabase failure");

      let databaseLoads = 0;
      const retry = await runInfluencerDiscoveryBatchUpload(
        {
          rootDir,
          intervalHours: 12,
          now: "2026-07-15T12:03:00.000Z",
        },
        {
          loadDiscoveryUploadFunctions: async () => {
            databaseLoads += 1;
            throw new Error("three-minute retry must stay local");
          },
          runNaverVisitorBatch: async () => ({ ok: true }),
        },
      );

      assert.equal(retry.skipped, "not_due");
      assert.equal(retry.dueAt, "2026-07-16T00:00:00.000Z");
      assert.equal(databaseLoads, 0);
      assert.equal(
        (await readPendingInfluencerBatch({ rootDir })).files.length,
        1,
      );
    });
  });
});

describe("influencer batch merge protections", () => {
  it("rejects direct database reads and writes without the live 12-hour uploader session", async () => {
    await assert.rejects(
      reserveExistingHandles([{ id: "direct-read" }]),
      /verified influencer uploader session/i,
    );
    await assert.rejects(
      upsertSupabaseRows([]),
      /verified influencer uploader session/i,
    );
  });

  it("binds a database session to the due-state authorization, not only a lock token", async () => {
    await withQueueRoot(async (rootDir) => {
      const queueRoot = path.join(
        rootDir,
        "data",
        "influencer-discovery-queue",
      );
      const authorizedAt = "2026-07-15T12:00:00.000Z";
      const batchId = "authorized-batch";
      const token = "authorized-uploader-token";
      await mkdir(queueRoot, { recursive: true });
      await writeFile(
        path.join(queueRoot, "uploader.lock"),
        JSON.stringify({ pid: process.pid, token, startedAt: authorizedAt }),
      );
      await writeFile(
        path.join(queueRoot, "state.json"),
        JSON.stringify({
          intervalHours: 6,
          lastAttemptAt: authorizedAt,
          lastSupabaseAccessAt: authorizedAt,
          lastAttemptedBatchId: batchId,
        }),
      );

      const uploaderSession = {
        token,
        pid: process.pid,
        authorizedAt,
        batchId,
        rootDir,
      };
      await assert.rejects(
        assertInfluencerUploaderSession(uploaderSession),
        /verified influencer uploader session/i,
      );

      await writeFile(
        path.join(queueRoot, "state.json"),
        JSON.stringify({
          intervalHours: 12,
          lastAttemptAt: authorizedAt,
          lastSupabaseAccessAt: authorizedAt,
          lastAttemptedBatchId: batchId,
        }),
      );
      const verified = await assertInfluencerUploaderSession(uploaderSession);
      assert.equal(verified.authorizedAt, authorizedAt);
      assert.equal(verified.batchId, batchId);
    });
  });

  it("deep-merges accumulated source evidence instead of replacing older arrays", async () => {
    const existing = {
      id: "evidence-profile",
      platform: "youtube",
      public_handle: "evidence-creator",
      platform_handle: "evidence-creator",
      profile_url: "https://youtube.com/@evidence-creator",
      source_url: "https://source.example/old-row",
      status: "active",
      source_provider: "youtube_data_api",
      quality_score: 90,
      categories: ["beauty"],
      audience_countries: ["south_korea"],
      source_evidence: {
        countryConfidence: "explicit",
        countrySignals: ["bio:KR"],
        searchQueries: ["old-query"],
        sampleTitles: ["old-title"],
        sourceUrls: ["https://source.example/old-array"],
        sourceUrl: "https://source.example/old-evidence",
        discovery: { queries: ["old-nested-query"], provider: "old-provider" },
        nullablePrimitive: "keep-me",
        orderedObjects: [{ alpha: 1, beta: 2 }],
      },
    };
    const incoming = {
      ...existing,
      source_url: "https://source.example/new-row",
      source_provider: "web_search",
      source_evidence: {
        countryConfidence: "explicit",
        countrySignals: ["official:KR"],
        searchQueries: ["new-query"],
        sampleTitles: ["new-title"],
        sourceUrls: ["https://source.example/new-array"],
        sourceUrl: "https://source.example/new-evidence",
        discovery: { queries: ["new-nested-query"], provider: "new-provider" },
        nullablePrimitive: null,
        orderedObjects: [{ beta: 2, alpha: 1 }],
      },
    };

    const [row] = await reserveExistingHandles([incoming], {
      databaseSnapshot: {
        discoveredIdentities: [existing],
        discoveredCandidates: [existing],
        marketplace: [],
      },
    });

    assert.deepEqual(row.source_evidence.searchQueries, [
      "old-query",
      "new-query",
    ]);
    assert.deepEqual(row.source_evidence.sampleTitles, [
      "old-title",
      "new-title",
    ]);
    assert.deepEqual(row.source_evidence.countrySignals, [
      "bio:KR",
      "official:KR",
    ]);
    assert.deepEqual(row.source_evidence.discovery, {
      queries: ["old-nested-query", "new-nested-query"],
      provider: "new-provider",
    });
    assert.equal(row.source_evidence.nullablePrimitive, "keep-me");
    assert.deepEqual(row.source_evidence.orderedObjects, [
      { alpha: 1, beta: 2 },
    ]);
    assert.deepEqual(row.source_evidence.sourceUrls, [
      "https://source.example/old-array",
      "https://source.example/new-array",
      "https://source.example/old-evidence",
      "https://source.example/new-evidence",
      "https://source.example/old-row",
      "https://source.example/new-row",
    ]);
  });

  it("never narrows an existing explicit multi-country identity when stronger single-country evidence arrives", async () => {
    const existing = {
      id: "multi-country-profile",
      platform: "youtube",
      public_handle: "multi-country-creator",
      platform_handle: "multi-country-creator",
      profile_url: "https://youtube.com/@multi-country-creator",
      status: "active",
      source_provider: "creator_bio",
      quality_score: 80,
      categories: ["travel"],
      audience_countries: ["south_korea", "japan"],
      source_evidence: {
        countryConfidence: "explicit",
        countrySignals: ["bio:KR", "bio:JP"],
        countryAudit: { sources: ["bio"], reviewer: "legacy" },
      },
    };
    const incoming = {
      ...existing,
      source_provider: "youtube_data_api",
      audience_countries: ["south_korea"],
      source_evidence: {
        countryConfidence: "official",
        countrySignals: ["official:KR"],
        countryLock: true,
        countryStatusLock: true,
        countryAudit: { sources: ["official"], reviewer: "current" },
      },
    };

    const [row] = await reserveExistingHandles([incoming], {
      databaseSnapshot: {
        discoveredIdentities: [existing],
        discoveredCandidates: [existing],
        marketplace: [],
      },
    });

    assert.deepEqual(row.audience_countries, ["south_korea", "japan"]);
    assert.equal(row.source_evidence.countryConfidence, "official");
    assert.deepEqual(row.source_evidence.countrySignals, [
      "bio:KR",
      "bio:JP",
      "official:KR",
    ]);
    assert.equal(row.source_evidence.countryLock, true);
    assert.equal(row.source_evidence.countryStatusLock, true);
    assert.deepEqual(row.source_evidence.countryAudit, {
      sources: ["bio", "official"],
      reviewer: "current",
    });
  });

  it("keeps a manually locked multi-country identity unchanged", async () => {
    const existing = {
      id: "locked-country-profile",
      platform: "instagram",
      public_handle: "locked-country-creator",
      platform_handle: "locked-country-creator",
      profile_url: "https://instagram.com/locked-country-creator",
      status: "active",
      source_provider: "manual_review",
      quality_score: 90,
      categories: ["travel"],
      audience_countries: ["south_korea", "japan"],
      source_evidence: {
        countryConfidence: "manual_verified",
        countrySignals: ["manual:KR", "manual:JP"],
        countryLock: true,
        countryAudit: { reviewer: "owner" },
      },
    };
    const incoming = {
      ...existing,
      source_provider: "instagram_api",
      audience_countries: ["united_states"],
      source_evidence: {
        countryConfidence: "official",
        countrySignals: ["official:US"],
        countryAudit: { reviewer: "collector" },
      },
    };

    const [row] = await reserveExistingHandles([incoming], {
      databaseSnapshot: {
        discoveredIdentities: [existing],
        discoveredCandidates: [existing],
        marketplace: [],
      },
    });

    assert.deepEqual(row.audience_countries, ["south_korea", "japan"]);
    assert.equal(row.source_evidence.countryConfidence, "manual_verified");
    assert.deepEqual(row.source_evidence.countrySignals, [
      "manual:KR",
      "manual:JP",
    ]);
    assert.equal(row.source_evidence.countryLock, true);
    assert.deepEqual(row.source_evidence.countryAudit, { reviewer: "owner" });
  });

  it("preserves official multi-country evidence when a later source is unknown", async () => {
    const existing = {
      id: "same-profile",
      platform: "youtube",
      public_handle: "creator",
      platform_handle: "creator",
      profile_url: "https://youtube.com/@creator",
      status: "active",
      source_provider: "youtube_data_api",
      quality_score: 90,
      audience_countries: ["south_korea", "japan"],
      source_evidence: {
        countryConfidence: "official",
        countrySignals: ["official:KR", "official:JP"],
      },
    };
    const incoming = {
      ...existing,
      source_provider: "naver_web_search_youtube_public_profile",
      audience_countries: [],
      source_evidence: {
        countryConfidence: "unknown",
        countrySignals: [],
      },
    };

    const rows = await reserveExistingHandles([incoming], {
      databaseSnapshot: {
        discoveredIdentities: [existing],
        discoveredCandidates: [existing],
        marketplace: [],
      },
    });

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].audience_countries, ["south_korea", "japan"]);
    assert.equal(rows[0].source_evidence.countryConfidence, "official");
    assert.deepEqual(rows[0].source_evidence.countrySignals, [
      "official:KR",
      "official:JP",
    ]);
  });

  it("does not resurrect hidden or claimed identities under a different id", async () => {
    for (const status of ["hidden", "claimed"]) {
      const protectedIdentity = {
        id: `${status}-existing`,
        platform: "instagram",
        public_handle: `${status}-creator`,
        platform_handle: "same-creator",
        profile_url: "https://instagram.com/same-creator",
        status,
        source_provider: "web_search",
        quality_score: 10,
      };
      const incoming = {
        id: `${status}-new-id`,
        platform: "instagram",
        public_handle: `${status}-new-handle`,
        platform_handle: "same-creator",
        profile_url: "https://instagram.com/same-creator",
        status: "active",
        source_provider: "youtube_data_api",
        quality_score: 100,
        categories: ["beauty"],
        source_evidence: { countryConfidence: "unknown" },
      };

      const rows = await reserveExistingHandles([incoming], {
        databaseSnapshot: {
          discoveredIdentities: [protectedIdentity],
          discoveredCandidates: [],
          marketplace: [],
        },
      });
      assert.deepEqual(rows, []);
    }
  });
});
