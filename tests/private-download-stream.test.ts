import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRIVATE_DOWNLOAD_STREAM_CHUNK_BYTES,
  readPrivateDownloadResponseBodyBounded,
  setPrivateDownloadHeaders,
  streamPrivateDownloadBuffer,
} from "../server/private-download-stream.js";

class TestResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  readonly chunks: Buffer[] = [];
  readonly headers = new Map<string, string>();
  writes = 0;

  removeHeader(name: string) {
    this.headers.delete(name.toLowerCase());
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  write(chunk: Uint8Array) {
    this.chunks.push(Buffer.from(chunk));
    this.writes += 1;
    if (this.writes === 1) {
      queueMicrotask(() => this.emit("drain"));
      return false;
    }
    return true;
  }

  end() {
    this.writableEnded = true;
  }
}

test("private downloads are same-origin, no-store, and never advertise a buffered length", () => {
  const response = new TestResponse();
  response.setHeader("Content-Length", "10485760");

  setPrivateDownloadHeaders(response, {
    contentType: "application/pdf",
    contentDisposition: 'attachment; filename="evidence.pdf"',
  });

  assert.equal(response.headers.has("content-length"), false);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="evidence.pdf"',
  );
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("private downloads use bounded chunks and honor backpressure", async () => {
  const source = Buffer.alloc(10 * 1024 * 1024, 0x5a);
  const response = new TestResponse();

  await streamPrivateDownloadBuffer(response, source);

  assert.equal(response.writes, 160);
  assert.equal(response.writableEnded, true);
  assert.deepEqual(Buffer.concat(response.chunks), source);
  assert.ok(
    response.chunks.every(
      (chunk) => chunk.byteLength <= PRIVATE_DOWNLOAD_STREAM_CHUNK_BYTES,
    ),
  );
});

test("private download origins are read with a hard verified byte bound", async () => {
  const response = new Response(Buffer.alloc(96 * 1024, 0x42));
  const body = await readPrivateDownloadResponseBodyBounded(response, 96 * 1024);
  assert.equal(body.byteLength, 96 * 1024);

  await assert.rejects(
    readPrivateDownloadResponseBodyBounded(
      new Response(Buffer.alloc(96 * 1024, 0x42)),
      64 * 1024,
    ),
    /exceeds its verified size/,
  );
});

test("private downloads stop when the client response is already closed", async () => {
  const response = new TestResponse();
  response.destroyed = true;

  await assert.rejects(
    streamPrivateDownloadBuffer(response, Buffer.from("private")),
    /closed before completion/,
  );
  assert.equal(response.chunks.length, 0);
});

test("private downloads do not hang when the client closes during backpressure", async () => {
  class ClosingResponse extends TestResponse {
    override write(chunk: Uint8Array) {
      this.chunks.push(Buffer.from(chunk));
      this.writes += 1;
      queueMicrotask(() => {
        this.destroyed = true;
        this.emit("close");
      });
      return false;
    }
  }

  const response = new ClosingResponse();
  await assert.rejects(
    streamPrivateDownloadBuffer(response, Buffer.alloc(128 * 1024, 0x2a)),
    /closed before completion/,
  );
  assert.equal(response.writableEnded, false);
  assert.equal(response.writes, 1);
});

test("authorized private routes audit before streaming and support migrated evidence", () => {
  const server = readFileSync(
    new URL("../server/index.ts", import.meta.url),
    "utf8",
  );
  const between = (start: string, end: string) => {
    const startIndex = server.indexOf(start);
    const endIndex = server.indexOf(end, startIndex + start.length);
    assert.notEqual(startIndex, -1, `missing route start: ${start}`);
    assert.notEqual(endIndex, -1, `missing route end: ${end}`);
    return server.slice(startIndex, endIndex);
  };

  const evidence = between(
    'app.get("/api/admin/verification-requests/:id/evidence"',
    'app.patch("/api/admin/verification-requests/:id"',
  );
  const deliverable = between(
    '"/api/contracts/:id/deliverables/:deliverableId/files/:fileId"',
    'app.post("/api/contracts/:id/support-access-requests"',
  );
  const reviewPdf = between(
    'app.get("/api/contracts/:id/review-pdf"',
    'app.get("/api/contracts/:id/final-pdf"',
  );
  const finalPdf = between(
    'app.get("/api/contracts/:id/final-pdf"',
    'app.post("/api/contracts/:id/signatures/influencer"',
  );

  assert.match(evidence, /readLegacyVerificationEvidenceDataUrl/);
  assert.match(server, /get_verification_legacy_evidence_file/);
  assert.match(server, /record_verification_evidence_access/);
  assert.ok(
    evidence.indexOf("appendVerificationEvidenceAccessAudit") <
      evidence.lastIndexOf("streamPrivateDownloadBuffer"),
  );
  assert.ok(
    deliverable.indexOf("insertContractEvent") <
      deliverable.indexOf("streamPrivateDownloadBuffer"),
  );
  assert.ok(
    reviewPdf.indexOf("appendSupportAccessAuditEvent") <
      reviewPdf.indexOf("streamPrivateDownloadBuffer"),
  );
  assert.match(reviewPdf, /review_pdf_downloaded/);
  assert.match(reviewPdf, /access_role: access\.role/);
  assert.ok(
    reviewPdf.indexOf("insertContractEvent") <
      reviewPdf.indexOf("streamPrivateDownloadBuffer"),
  );
  assert.ok(
    finalPdf.indexOf("insertContractEvent") <
      finalPdf.indexOf("streamPrivateDownloadBuffer"),
  );
  for (const route of [evidence, deliverable, reviewPdf, finalPdf]) {
    assert.match(route, /setPrivateDownloadHeaders/);
    assert.match(route, /streamPrivateDownloadBuffer/);
    assert.doesNotMatch(route, /response\.send\((?:fileBuffer|pdfBuffer|buffer)\)/);
  }
});
