import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { isSafeSignaturePng } from "../server/signature-image-security.js";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (value: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return result;
};

const makePng = (width: number, height: number) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.alloc(width * 4 + 1);
  const imageData = deflateSync(
    Buffer.concat(Array.from({ length: height }, () => row)),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", imageData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const makePngWithRawData = (
  width: number,
  height: number,
  raw: Buffer,
  extraChunks: Buffer[] = [],
) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...extraChunks,
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

test("accepts a bounded canvas PNG", () => {
  assert.equal(isSafeSignaturePng(makePng(300, 150)), true);
});

test("rejects compressed PNG images with unsafe pixel dimensions", () => {
  assert.equal(isSafeSignaturePng(makePng(2_049, 1)), false);
  assert.equal(isSafeSignaturePng(makePng(2_048, 2_048)), true);
});

test("rejects truncated, corrupt, and trailing-content PNG payloads", () => {
  const png = makePng(10, 10);
  assert.equal(isSafeSignaturePng(png.subarray(0, 40)), false);
  const corrupt = Buffer.from(png);
  corrupt[20] ^= 0xff;
  assert.equal(isSafeSignaturePng(corrupt), false);
  assert.equal(
    isSafeSignaturePng(Buffer.concat([png, Buffer.from("polyglot")])),
    false,
  );
});

test("rejects excess inflate output and ancillary compressed profiles", () => {
  assert.equal(
    isSafeSignaturePng(makePngWithRawData(1, 1, Buffer.alloc(2 * 1024 * 1024))),
    false,
  );
  const compressedProfile = Buffer.concat([
    Buffer.from("profile\0\0", "binary"),
    deflateSync(Buffer.alloc(2 * 1024 * 1024)),
  ]);
  assert.equal(
    isSafeSignaturePng(
      makePngWithRawData(
        1,
        1,
        Buffer.from([0, 0, 0, 0, 0]),
        [chunk("iCCP", compressedProfile)],
      ),
    ),
    false,
  );
});

test("rejects truncated, extra, and invalid-filter scanlines", () => {
  assert.equal(
    isSafeSignaturePng(makePngWithRawData(1, 1, Buffer.alloc(4))),
    false,
  );
  assert.equal(
    isSafeSignaturePng(makePngWithRawData(1, 1, Buffer.alloc(6))),
    false,
  );
  assert.equal(
    isSafeSignaturePng(
      makePngWithRawData(1, 1, Buffer.from([5, 0, 0, 0, 0])),
    ),
    false,
  );
});
