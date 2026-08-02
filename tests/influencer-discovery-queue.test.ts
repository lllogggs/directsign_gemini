import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import {
  archiveInfluencerBatch,
  archiveNaverVisitorBatch,
  isInfluencerBatchDue,
  readInfluencerDiscoveryWorkbook,
  readPendingInfluencerBatch,
  readPendingNaverVisitorBatch,
  stageInfluencerDiscoveryWorkbook,
  stageNaverVisitorWorkbook,
} from "../scripts/lib/influencer-discovery-queue.mjs";

describe("local influencer discovery XLSX queue", () => {
  let rootDir = "";

  before(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "yeollock-discovery-queue-"));
  });

  after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("round-trips Unicode and full JSON as formula-safe inline strings", async () => {
    const rows = [
      {
        id: "creator-한글",
        display_name: "민서 & <친구>",
        introduction: '=HYPERLINK("https://invalid.example","클릭")',
        source_evidence: {
          countries: ["KR", "JP"],
          note: "첫째 줄\n둘째 줄",
          nested: { verified: true, score: 0 },
        },
      },
    ];
    const staged = await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "run-unicode",
      createdAt: "2026-07-15T00:00:00.000Z",
      category: "뷰티",
      platform: "youtube",
      rows,
    });
    const readBack = await readInfluencerDiscoveryWorkbook(staged.filePath);

    assert.deepEqual(readBack.rows, rows);
    assert.equal(readBack.category, "뷰티");
    assert.equal(readBack.platform, "youtube");
    assert.match(
      staged.filePath.replace(/\\/g, "/"),
      /data\/influencer-discovery-queue\/pending\/profiles\//,
    );

    const archive = unzipSync(new Uint8Array(await readFile(staged.filePath)));
    const profileXml = strFromU8(archive["xl/worksheets/sheet1.xml"]);
    assert.match(profileXml, /t="inlineStr"/);
    assert.doesNotMatch(profileXml, /<f(?:\s|>)/);
    assert.match(profileXml, /=HYPERLINK/);

    const originalBytes = await readFile(staged.filePath);
    await assert.rejects(
      stageInfluencerDiscoveryWorkbook({
        rootDir,
        runId: "run-unicode",
        createdAt: "2026-07-15T00:00:00.000Z",
        category: "뷰티",
        platform: "youtube",
        rows: [{ id: "replacement" }],
      }),
      /Immutable queue workbook already exists/,
    );
    assert.deepEqual(await readFile(staged.filePath), originalBytes);
    const pendingNames = await readdir(path.dirname(staged.filePath));
    assert.equal(pendingNames.some((name) => name.endsWith(".partial")), false);
  });

  it("snapshots pending files and keeps the latest createdAt for duplicate ids", async () => {
    await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "run-old",
      createdAt: "2026-07-15T01:00:00.000Z",
      category: "리빙",
      platform: "instagram",
      rows: [
        { id: "same", follower_count: 10 },
        { id: "old-only", follower_count: 20 },
      ],
    });
    await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "run-new",
      createdAt: "2026-07-15T02:00:00.000Z",
      category: "리빙",
      platform: "instagram",
      rows: [{ id: "same", follower_count: 99 }],
    });

    const batch = await readPendingInfluencerBatch({ rootDir });
    const repeatedRead = await readPendingInfluencerBatch({ rootDir });
    assert.equal(batch.files.length, 3);
    assert.match(batch.checksum, /^[a-f0-9]{64}$/);
    assert.equal(batch.batchId, repeatedRead.batchId);
    assert.deepEqual(batch.rows, [
      {
        id: "creator-한글",
        display_name: "민서 & <친구>",
        introduction: '=HYPERLINK("https://invalid.example","클릭")',
        source_evidence: {
          countries: ["KR", "JP"],
          note: "첫째 줄\n둘째 줄",
          nested: { verified: true, score: 0 },
        },
      },
      { id: "old-only", follower_count: 20 },
      { id: "same", follower_count: 99 },
    ]);
  });

  it("keeps earlier evidence, authoritative multi-country data, and protected status", async () => {
    await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "evidence-old",
      createdAt: "2026-07-15T03:00:00.000Z",
      category: "travel",
      platform: "youtube",
      rows: [
        {
          id: "evidence-same",
          status: "hidden",
          follower_count: 10,
          audience_countries: ["south_korea", "japan"],
          source_url: "https://youtube.com/@creator/old",
          source_evidence: {
            countryConfidence: "official",
            countrySignals: ["official:KR", "official:JP"],
            searchQueries: ["old query"],
            recentPosts: [
              {
                title: "older evidence",
                url: "https://blog.naver.com/creator/1",
                publishedDate: "2026-07-13",
              },
            ],
          },
        },
      ],
    });
    await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "evidence-new",
      createdAt: "2026-07-15T04:00:00.000Z",
      category: "travel",
      platform: "youtube",
      rows: [
        {
          id: "evidence-same",
          status: "active",
          follower_count: 99,
          audience_countries: [],
          source_url: "https://youtube.com/@creator/new",
          source_evidence: {
            countryConfidence: "unknown",
            countrySignals: [],
            searchQueries: ["new query"],
            recentPosts: [
              {
                title: "newer evidence",
                url: "https://blog.naver.com/creator/2",
                publishedDate: "2026-07-14",
              },
            ],
          },
        },
      ],
    });

    const batch = await readPendingInfluencerBatch({ rootDir });
    const merged = batch.rows.find((row) => row.id === "evidence-same");
    assert.ok(merged);
    assert.equal(merged.follower_count, 99);
    assert.equal(merged.status, "hidden");
    assert.deepEqual(merged.audience_countries, ["south_korea", "japan"]);
    assert.equal(merged.source_evidence.countryConfidence, "official");
    assert.deepEqual(merged.source_evidence.searchQueries, ["old query", "new query"]);
    assert.deepEqual(
      merged.source_evidence.recentPosts.map((post) => post.publishedDate),
      ["2026-07-14", "2026-07-13"],
    );
    assert.deepEqual(merged.source_evidence.sourceUrls, [
      "https://youtube.com/@creator/old",
      "https://youtube.com/@creator/new",
    ]);
  });

  it("quarantines a corrupt XLSX and continues reading healthy workbooks", async () => {
    const healthy = await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "healthy-after-corrupt",
      createdAt: "2026-07-15T05:00:00.000Z",
      category: "food",
      platform: "naver_blog",
      rows: [{ id: "healthy-after-corrupt", value: 1 }],
    });
    const corruptPath = path.join(path.dirname(healthy.filePath), "corrupt.xlsx");
    await writeFile(corruptPath, "not-an-xlsx", "utf8");

    const batch = await readPendingInfluencerBatch({ rootDir });
    assert.equal(batch.rows.some((row) => row.id === "healthy-after-corrupt"), true);
    assert.equal(batch.quarantinedFiles.length, 1);
    assert.equal(batch.quarantinedFiles[0].originalFilePath, corruptPath);
    await assert.doesNotReject(readFile(batch.quarantinedFiles[0].filePath));
    await assert.rejects(readFile(corruptPath), /ENOENT/);
  });

  it("becomes due exactly at the 12-hour boundary", () => {
    const oldestPendingAt = "2026-07-15T00:00:00.000Z";
    assert.equal(
      isInfluencerBatchDue({
        state: null,
        now: "2026-07-15T11:59:59.999Z",
        intervalHours: 12,
        oldestPendingAt,
      }),
      false,
    );
    assert.equal(
      isInfluencerBatchDue({
        state: null,
        now: "2026-07-15T12:00:00.000Z",
        intervalHours: 12,
        oldestPendingAt,
      }),
      true,
    );
    assert.equal(
      isInfluencerBatchDue({
        state: { lastSuccessfulUploadAt: "2026-07-15T03:00:00.000Z" },
        now: "2026-07-15T14:59:59.999Z",
        intervalHours: 12,
        oldestPendingAt,
      }),
      false,
    );
    assert.equal(
      isInfluencerBatchDue({
        state: { lastSuccessfulUploadAt: "2026-07-15T03:00:00.000Z" },
        now: "2026-07-15T15:00:00.000Z",
        intervalHours: 12,
        oldestPendingAt,
      }),
      true,
    );
    assert.equal(
      isInfluencerBatchDue({
        state: null,
        now: "2026-07-16T00:00:00.000Z",
        intervalHours: 12,
        oldestPendingAt: null,
      }),
      false,
    );
  });
});

describe("successful queue archival", () => {
  let rootDir = "";

  before(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "yeollock-discovery-archive-"));
  });

  after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("writes and verifies one merged archive before deleting only snapshotted files", async () => {
    await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "snapshot-a",
      createdAt: "2026-07-15T00:00:00.000Z",
      category: "여행",
      platform: "youtube",
      rows: [{ id: "a", value: 1 }],
    });
    await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "snapshot-b",
      createdAt: "2026-07-15T01:00:00.000Z",
      category: "여행",
      platform: "youtube",
      rows: [{ id: "b", value: 2 }],
    });
    const snapshot = await readPendingInfluencerBatch({ rootDir });
    const newlyAdded = await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "arrived-during-upload",
      createdAt: "2026-07-15T12:00:01.000Z",
      category: "여행",
      platform: "youtube",
      rows: [{ id: "new", value: 3 }],
    });

    const archived = await archiveInfluencerBatch({
      rootDir,
      batchId: snapshot.batchId,
      files: snapshot.files,
      rows: snapshot.rows,
      completedAt: "2026-07-15T12:00:00.000Z",
    });
    const merged = await readInfluencerDiscoveryWorkbook(archived.archivePath);
    assert.deepEqual(merged.rows, snapshot.rows);
    assert.equal(merged.meta.archive_batch_id, snapshot.batchId);

    const remaining = await readPendingInfluencerBatch({ rootDir });
    assert.equal(remaining.files.length, 1);
    assert.equal(remaining.files[0].filePath, newlyAdded.filePath);
    assert.deepEqual(remaining.rows, [{ id: "new", value: 3 }]);
  });

  it("does not archive or remove source files when a snapshot checksum fails", async () => {
    const staged = await stageInfluencerDiscoveryWorkbook({
      rootDir,
      runId: "tamper-source",
      createdAt: "2026-07-16T00:00:00.000Z",
      category: "교육",
      platform: "naver_blog",
      rows: [{ id: "tampered", value: 1 }],
    });
    const snapshot = await readPendingInfluencerBatch({ rootDir });
    const original = await readFile(staged.filePath);
    await writeFile(staged.filePath, Buffer.concat([original, Buffer.from("tampered")]));

    await assert.rejects(
      archiveInfluencerBatch({
        rootDir,
        batchId: snapshot.batchId,
        files: snapshot.files,
        rows: snapshot.rows,
        completedAt: "2026-07-16T12:00:00.000Z",
      }),
      /changed after snapshot/,
    );
    await assert.doesNotReject(readFile(staged.filePath));
    const archiveDir = path.join(
      rootDir,
      "data",
      "influencer-discovery-queue",
      "archive",
      "profiles",
    );
    const archivedNames = await readdir(archiveDir).catch(() => []);
    assert.equal(archivedNames.length, 1);
  });
});

describe("Naver visitor XLSX queue", () => {
  let rootDir = "";

  before(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "yeollock-visitor-queue-"));
  });

  after(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("round-trips, snapshots, and archives visitor metrics without losing evidence", async () => {
    const rows = [
      {
        id: "naver-한글",
        visitor_status: "available",
        visitor_average_4d: 1234,
        visitor_counts: [
          { date: "2026-07-14", count: 1000 },
          { date: "2026-07-13", count: 1100 },
          { date: "2026-07-12", count: 1300 },
          { date: "2026-07-11", count: 1536 },
        ],
        checked_at: "2026-07-15T01:00:00.000Z",
      },
    ];
    const staged = await stageNaverVisitorWorkbook({
      rootDir,
      runId: "visitor-run",
      createdAt: "2026-07-15T01:00:00.000Z",
      rows,
    });
    assert.deepEqual((await readInfluencerDiscoveryWorkbook(staged.filePath)).rows, rows);

    const snapshot = await readPendingNaverVisitorBatch({ rootDir });
    assert.deepEqual(snapshot.rows, rows);
    const archived = await archiveNaverVisitorBatch({
      rootDir,
      batchId: snapshot.batchId,
      files: snapshot.files,
      rows: snapshot.rows,
      completedAt: "2026-07-15T13:00:00.000Z",
    });
    assert.deepEqual(
      (await readInfluencerDiscoveryWorkbook(archived.archivePath)).rows,
      rows,
    );
    assert.equal((await readPendingNaverVisitorBatch({ rootDir })).files.length, 0);
  });
});
