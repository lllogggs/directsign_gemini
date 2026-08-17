import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_PRIVATE_FILE_SIZE_BYTES,
  PRIVATE_FILE_TUS_CHUNK_SIZE_BYTES,
  buildPrivateTusUploadOptions,
  calculatePrivateFileSha256,
  getOrCreatePrivateFileUploadIdentity,
  parsePrivateFileUploadTicket,
  preparePrivateFileDescriptor,
  requestPrivateFileUploadTicket,
  shouldDiscardPrivateFileUploadTicket,
  shouldRetryPrivateFileUpload,
  type PrivateFileUploadTicket,
} from "../src/domain/privateFileUpload";

const future = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const validTicket = (): PrivateFileUploadTicket => ({
  ticket_id: "11111111-1111-4111-8111-111111111111",
  upload_url:
    "https://project-id.storage.supabase.co/storage/v1/upload/resumable",
  upload_signature: "signed-upload-capability",
  bucket: "directsign-private",
  object_path:
    "verification-advertiser/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333-evidence.pdf",
  initiation_expires_at: future(120),
  finalize_expires_at: future(60),
});

test("private file hashing uses raw bytes and returns canonical SHA-256", async () => {
  const file = Object.assign(new Blob(["abc"], { type: "application/pdf" }), {
    name: "evidence.pdf",
    lastModified: 1,
  }) as File;

  assert.equal(
    await calculatePrivateFileSha256(file),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.deepEqual(
    await preparePrivateFileDescriptor(file, "application/pdf"),
    {
      type: "application/pdf",
      size: 3,
      sha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
  );
});

test("client hard-stops files above ten MiB before hashing or ticket issuance", async () => {
  let read = false;
  const oversized = {
    name: "oversized.pdf",
    type: "application/pdf",
    size: MAX_PRIVATE_FILE_SIZE_BYTES + 1,
    lastModified: 1,
    arrayBuffer: async () => {
      read = true;
      return new ArrayBuffer(0);
    },
  } as File;

  await assert.rejects(
    preparePrivateFileDescriptor(oversized, "application/pdf"),
    /파일을 확인하지 못했습니다/,
  );
  assert.equal(read, false);
});

test("ticket requests contain metadata and hash only, never file bytes or names", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  try {
    globalThis.fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify(validTicket()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const ticket = await requestPrivateFileUploadTicket({
      endpoint: "/api/verification/advertiser/upload-ticket",
      descriptor: {
        type: "application/pdf",
        size: 10_485_760,
        sha256: "a".repeat(64),
      },
      expectedArea: "verification-advertiser",
    });

    assert.equal(ticket.ticket_id, validTicket().ticket_id);
    assert.deepEqual(JSON.parse(requestBody), {
      file: {
        type: "application/pdf",
        size: 10_485_760,
        sha256: "a".repeat(64),
      },
    });
    assert.doesNotMatch(requestBody, /data_url|base64|evidence\.pdf/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verification retries reuse one upload_id after a lost ticket response", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  let requestCount = 0;
  let uuidCalls = 0;
  const stableUploadId = "11111111-1111-4111-8111-111111111111";
  try {
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      requestCount += 1;
      if (requestCount === 1) {
        throw new Error("simulated response loss");
      }
      return new Response(JSON.stringify(validTicket()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const selectionKey = "same-file-and-form";
    let identity = getOrCreatePrivateFileUploadIdentity(
      undefined,
      selectionKey,
      () => {
        uuidCalls += 1;
        return stableUploadId;
      },
    );
    const request = () =>
      requestPrivateFileUploadTicket({
        endpoint: "/api/verification/advertiser/upload-ticket",
        descriptor: {
          type: "application/pdf",
          size: 3,
          sha256: "a".repeat(64),
        },
        expectedArea: "verification-advertiser",
        context: { upload_id: identity.uploadId },
      });

    await assert.rejects(request(), /simulated response loss/);
    identity = getOrCreatePrivateFileUploadIdentity(
      identity,
      selectionKey,
      () => {
        uuidCalls += 1;
        return "99999999-9999-4999-8999-999999999999";
      },
    );
    await request();

    assert.equal(uuidCalls, 1);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].upload_id, stableUploadId);
    assert.equal(bodies[1].upload_id, stableUploadId);
    assert.notEqual(
      getOrCreatePrivateFileUploadIdentity(
        identity,
        "changed-file-or-form",
        () => "99999999-9999-4999-8999-999999999999",
      ).uploadId,
      stableUploadId,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("signed TUS options are private, non-upserting, six-MiB, and non-persistent", () => {
  const ticket = validTicket();
  const options = buildPrivateTusUploadOptions(ticket, {
    type: "application/pdf",
    size: 10_485_760,
    sha256: "a".repeat(64),
  });

  assert.equal(options.endpoint, ticket.upload_url);
  assert.equal(options.chunkSize, 6 * 1024 * 1024);
  assert.equal(options.chunkSize, PRIVATE_FILE_TUS_CHUNK_SIZE_BYTES);
  assert.deepEqual(options.headers, {
    "x-signature": ticket.upload_signature,
    "x-upsert": "false",
  });
  assert.deepEqual(options.metadata, {
    bucketName: "directsign-private",
    objectName: ticket.object_path,
    contentType: "application/pdf",
    cacheControl: "0",
  });
  assert.equal(options.parallelUploads, 1);
  assert.equal(options.uploadDataDuringCreation, true);
  assert.equal(options.storeFingerprintForResuming, false);
  assert.equal("authorization" in options.headers, false);
  assert.equal("apikey" in options.headers, false);

  const resumed = buildPrivateTusUploadOptions(
    ticket,
    {
      type: "application/pdf",
      size: 10_485_760,
      sha256: "a".repeat(64),
    },
    `${ticket.upload_url}/upload-resource-id`,
  );
  assert.equal(
    resumed.uploadUrl,
    `${ticket.upload_url}/upload-resource-id`,
  );
  assert.throws(
    () =>
      buildPrivateTusUploadOptions(
        ticket,
        {
          type: "application/pdf",
          size: 10_485_760,
          sha256: "a".repeat(64),
        },
        "https://attacker.example/upload-resource-id",
      ),
    /재개 주소가 허용되지 않았습니다/,
  );
});

test("ticket parser rejects exfiltration endpoints and cross-purpose paths", () => {
  assert.throws(
    () =>
      parsePrivateFileUploadTicket(
        { ...validTicket(), upload_url: "https://attacker.example/upload" },
        "verification-advertiser",
      ),
    /허용되지 않았습니다/,
  );
  assert.throws(
    () =>
      parsePrivateFileUploadTicket(
        {
          ...validTicket(),
          object_path:
            "deliverables/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333-evidence.pdf",
        },
        "verification-advertiser",
      ),
    /허용되지 않았습니다/,
  );
  assert.throws(
    () =>
      parsePrivateFileUploadTicket(
        { ...validTicket(), bucket: "public-assets" },
        "verification-advertiser",
      ),
    /파일 저장소가 올바르지 않습니다/,
  );
});

test("retry classification preserves ambiguous tickets and discards only terminal tickets", () => {
  assert.equal(shouldRetryPrivateFileUpload("UPLOAD_NOT_READY"), true);
  assert.equal(shouldRetryPrivateFileUpload("UPLOAD_TICKET_INVALID"), false);
  assert.equal(
    shouldDiscardPrivateFileUploadTicket(422, "UPLOAD_TICKET_EXPIRED"),
    true,
  );
  assert.equal(
    shouldDiscardPrivateFileUploadTicket(409, "UPLOAD_NOT_READY"),
    false,
  );
  assert.equal(
    shouldDiscardPrivateFileUploadTicket(503, "UPLOAD_NOT_READY"),
    false,
  );
  assert.equal(shouldDiscardPrivateFileUploadTicket(503), false);
});

test("private upload screens contain no JSON base64 fallback or persistent token storage", () => {
  const paths = [
    "../src/pages/marketing/AdvertiserVerification.tsx",
    "../src/pages/influencer/InfluencerVerification.tsx",
    "../src/pages/influencer/ContractViewer.tsx",
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /readAsDataURL|readFileAsDataUrl|data_url/);
    assert.match(source, /upload_ticket_id/);
  }
  for (const path of paths.slice(0, 2)) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /context: \{ upload_id: uploadAttempt\.uploadId \}/);
    assert.match(source, /getOrCreatePrivateFileUploadIdentity/);
  }

  const helper = readFileSync(
    new URL("../src/domain/privateFileUpload.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(helper, /localStorage|sessionStorage|console\./);
  assert.match(helper, /storeFingerprintForResuming: false/);
  assert.match(helper, /withCredentials = false/);
});

test("additional influencer verification cannot be reset by account prefill", () => {
  const source = readFileSync(
    new URL(
      "../src/pages/influencer/InfluencerVerification.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const prefillEffect = source.slice(
    source.indexOf("const accountUrl = verification?.account?.platform_url?.trim()"),
    source.indexOf("const updateForm =", source.indexOf("const accountUrl =")),
  );
  const updatePlatform = source.slice(
    source.indexOf("const updatePlatform ="),
    source.indexOf("const updateMethod =", source.indexOf("const updatePlatform =")),
  );
  const openAdditionalRequest = source.slice(
    source.indexOf("const openAdditionalRequestForm ="),
    source.indexOf(
      "const updateMethod =",
      source.indexOf("const openAdditionalRequestForm ="),
    ),
  );

  assert.match(source, /const accountPrefillIdentityRef = useRef\(""\)/);
  assert.match(source, /const accountPrefillConsumedRef = useRef\(false\)/);
  assert.match(prefillEffect, /accountPrefillIdentityRef\.current !== accountIdentity/);
  assert.match(
    prefillEffect,
    /contract \|\|[\s\S]+showAdditionalRequest \|\|[\s\S]+accountPrefillConsumedRef\.current/,
  );
  assert.match(prefillEffect, /accountPrefillConsumedRef\.current = true/);
  assert.match(updatePlatform, /accountPrefillConsumedRef\.current = true/);
  assert.ok(
    updatePlatform.indexOf("accountPrefillConsumedRef.current = true") <
      updatePlatform.indexOf("setPlatform(nextPlatform)"),
  );
  assert.match(openAdditionalRequest, /accountPrefillConsumedRef\.current = true/);
  assert.match(openAdditionalRequest, /setShowAdditionalRequest\(true\)/);
  assert.match(openAdditionalRequest, /setForm\(initialForm\)/);
  assert.match(source, /onClick=\{openAdditionalRequestForm\}/);
});
