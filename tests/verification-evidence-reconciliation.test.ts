import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  hasExactVerificationEvidenceFile,
  reconcileVerificationEvidencePersistence,
  type VerificationEvidenceFileIdentity,
} from "../server/verification-evidence-reconciliation.js";

const pendingFile: VerificationEvidenceFileIdentity = {
  provider: "supabase_storage",
  bucket: "directsign-private",
  path: "verification-influencer/profile/request-proof.png",
  content_type: "image/png",
  byte_size: 128,
  sha256: "a".repeat(64),
};

const persistedRecord = {
  id: "request-id",
  evidence_snapshot_json: {
    evidence_file: { ...pendingFile },
  },
};

test("verification evidence exact reconciliation accepts only the committed file identity", () => {
  assert.equal(hasExactVerificationEvidenceFile(persistedRecord, pendingFile), true);
  assert.equal(
    hasExactVerificationEvidenceFile(
      {
        ...persistedRecord,
        evidence_snapshot_json: {
          evidence_file: { ...pendingFile, sha256: "b".repeat(64) },
        },
      },
      pendingFile,
    ),
    false,
  );
});

test("verification evidence insert failure deletes a proven orphan", async () => {
  let deleted = 0;
  let alerted = 0;
  const result = await reconcileVerificationEvidencePersistence({
    pendingFile,
    readRecord: async () => undefined,
    deletePendingFile: async () => {
      deleted += 1;
    },
    reportUrgent: async () => {
      alerted += 1;
    },
  });

  assert.deepEqual(result, { state: "cleaned", reason: "record_missing" });
  assert.equal(deleted, 1);
  assert.equal(alerted, 0);
});

test("Instagram active-challenge race cleans the losing evidence before recovery", async () => {
  const operations: string[] = [];
  const result = await reconcileVerificationEvidencePersistence({
    pendingFile,
    readRecord: async () => {
      operations.push("request-row-read");
      return undefined;
    },
    deletePendingFile: async () => {
      operations.push("loser-object-delete");
    },
    reportUrgent: async () => {
      operations.push("urgent-alert");
    },
  });
  operations.push("active-challenge-read");

  assert.equal(result.state, "cleaned");
  assert.deepEqual(operations, [
    "request-row-read",
    "loser-object-delete",
    "active-challenge-read",
  ]);

  const server = fs.readFileSync("server/index.ts", "utf8");
  const routeStart = server.indexOf('app.post("/api/verification/influencer"');
  const routeEnd = server.indexOf(
    '"/api/verification/influencer/instagram-dm-challenge"',
    routeStart,
  );
  const route = server.slice(routeStart, routeEnd);
  const insertCatch = route.indexOf("const evidenceReconciliation");
  assert.ok(insertCatch >= 0);
  assert.ok(
    route.indexOf("reconcileStoredVerificationEvidence", insertCatch) <
      route.indexOf("readActiveInstagramDmChallenge", insertCatch),
  );
});

test("verification evidence ambiguous lookup retains the object and emits urgent alert", async () => {
  const lookupError = new Error("lookup unavailable");
  let deleted = 0;
  const alerts: Array<{ reason: string; recordPresent: boolean }> = [];
  const result = await reconcileVerificationEvidencePersistence({
    pendingFile,
    readRecord: async () => {
      throw lookupError;
    },
    deletePendingFile: async () => {
      deleted += 1;
    },
    reportUrgent: async ({ reason, recordPresent }) => {
      alerts.push({ reason, recordPresent });
    },
  });

  assert.equal(result.state, "retained");
  assert.equal(result.reason, "lookup_ambiguous");
  assert.equal(deleted, 0);
  assert.deepEqual(alerts, [
    { reason: "lookup_ambiguous", recordPresent: false },
  ]);
});

test("verification evidence cleanup failure retains the object and emits urgent alert", async () => {
  const cleanupError = new Error("storage unavailable");
  const alerts: Array<{ reason: string; recordPresent: boolean }> = [];
  const result = await reconcileVerificationEvidencePersistence({
    pendingFile,
    readRecord: async () => ({
      ...persistedRecord,
      evidence_snapshot_json: {
        evidence_file: { ...pendingFile, byte_size: pendingFile.byte_size + 1 },
      },
    }),
    deletePendingFile: async () => {
      throw cleanupError;
    },
    reportUrgent: async ({ reason, recordPresent }) => {
      alerts.push({ reason, recordPresent });
    },
  });

  assert.equal(result.state, "retained");
  assert.equal(result.reason, "cleanup_failed");
  assert.deepEqual(alerts, [{ reason: "cleanup_failed", recordPresent: true }]);
});

test("verification evidence committed row is returned without deleting its object", async () => {
  let deleted = 0;
  const result = await reconcileVerificationEvidencePersistence({
    pendingFile,
    readRecord: async () => persistedRecord,
    deletePendingFile: async () => {
      deleted += 1;
    },
    reportUrgent: async () => undefined,
  });

  assert.equal(result.state, "committed");
  if (result.state === "committed") {
    assert.equal(result.record.id, persistedRecord.id);
  }
  assert.equal(deleted, 0);
});
