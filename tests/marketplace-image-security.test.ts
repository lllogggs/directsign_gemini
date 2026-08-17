import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import sharp from "sharp";
import {
  isSafeMarketplaceImage,
  normalizeMarketplaceImage,
} from "../server/marketplace-image-security.js";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value =
      (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (value: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    8 + data.length,
  );
  return result;
};

const makePng = (width: number, height: number, raw?: Buffer) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.alloc(width * 4 + 1);
  const decoded =
    raw ?? Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(decoded)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const makeJpeg = (width: number, height: number) => {
  const frame = Buffer.alloc(17);
  frame.writeUInt16BE(17, 0);
  frame[2] = 8;
  frame.writeUInt16BE(height, 3);
  frame.writeUInt16BE(width, 5);
  frame[7] = 3;
  frame.set([1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0], 8);
  const scan = Buffer.alloc(12);
  scan.writeUInt16BE(12, 0);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xc0]),
    frame,
    Buffer.from([0xff, 0xda]),
    scan,
    Buffer.from([0x11, 0x22, 0x33, 0xff, 0xd9]),
  ]);
};

const webpChunk = (type: string, payload: Buffer) => {
  const result = Buffer.alloc(8 + payload.length + (payload.length % 2));
  result.write(type, 0, "ascii");
  result.writeUInt32LE(payload.length, 4);
  payload.copy(result, 8);
  return result;
};

const makeWebp = (width: number, height: number, animated = false) => {
  const chunks: Buffer[] = [];
  if (animated) {
    const extended = Buffer.alloc(10);
    extended[0] = 0x02;
    extended.writeUIntLE(width - 1, 4, 3);
    extended.writeUIntLE(height - 1, 7, 3);
    chunks.push(webpChunk("VP8X", extended));
  }
  const image = Buffer.alloc(10);
  image[0] = 0;
  image.set([0x9d, 0x01, 0x2a], 3);
  image.writeUInt16LE(width, 6);
  image.writeUInt16LE(height, 8);
  chunks.push(webpChunk("VP8 ", image));
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
};

test("accepts bounded PNG, JPEG, and WebP marketplace images", () => {
  assert.equal(isSafeMarketplaceImage(makePng(32, 24), "image/png"), true);
  assert.equal(isSafeMarketplaceImage(makeJpeg(640, 480), "image/jpeg"), true);
  assert.equal(isSafeMarketplaceImage(makeWebp(640, 480), "image/webp"), true);
});

test("rejects unsafe dimensions and compressed PNG output", () => {
  assert.equal(isSafeMarketplaceImage(makePng(4_097, 1), "image/png"), false);
  assert.equal(isSafeMarketplaceImage(makeJpeg(4_097, 1), "image/jpeg"), false);
  assert.equal(isSafeMarketplaceImage(makeWebp(4_097, 1), "image/webp"), false);
  assert.equal(
    isSafeMarketplaceImage(makePng(1, 1, Buffer.alloc(16 * 1024 * 1024)), "image/png"),
    false,
  );
});

test("rejects animated, corrupt, trailing, and MIME-confused images", () => {
  assert.equal(isSafeMarketplaceImage(makeWebp(100, 100, true), "image/webp"), false);
  assert.equal(
    isSafeMarketplaceImage(
      Buffer.concat([makeWebp(100, 100), Buffer.from("trailing")]),
      "image/webp",
    ),
    false,
  );
  assert.equal(isSafeMarketplaceImage(makePng(2, 2), "image/jpeg"), false);
  assert.equal(isSafeMarketplaceImage(Buffer.from("not-an-image"), "image/png"), false);
});

test("normalizes public uploads to metadata-free bounded PNG", async () => {
  const source = await sharp({
    create: {
      background: { alpha: 1, b: 80, g: 120, r: 220 },
      channels: 4,
      height: 900,
      width: 1_200,
    },
  })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const sourceMetadata = await sharp(source).metadata();
  assert.ok(sourceMetadata.exif);

  const normalized = await normalizeMarketplaceImage(source, "image/jpeg");
  const normalizedMetadata = await sharp(normalized.buffer).metadata();
  assert.equal(normalized.mimeType, "image/png");
  assert.equal(normalized.buffer.byteLength <= 3 * 1024 * 1024, true);
  assert.equal(normalizedMetadata.exif, undefined);
  assert.equal(normalizedMetadata.icc, undefined);
  assert.equal(normalizedMetadata.xmp, undefined);
  assert.equal(
    isSafeMarketplaceImage(normalized.buffer, normalized.mimeType),
    true,
  );
});
