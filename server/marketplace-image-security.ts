import { inflateSync } from "node:zlib";
import sharp from "sharp";

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const maxImageDimension = 4_096;
const maxImagePixels = 12_000_000;
const maxDecodedBytes = 48 * 1024 * 1024;
const maxNormalizedDimension = 1_600;
const maxPngChunks = 256;
const maxJpegSegments = 256;
const maxWebpChunks = 128;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value =
      (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const calculateCrc32 = (value: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const hasSafeDimensions = (width: number, height: number) =>
  Number.isSafeInteger(width) &&
  Number.isSafeInteger(height) &&
  width >= 1 &&
  height >= 1 &&
  width <= maxImageDimension &&
  height <= maxImageDimension &&
  width * height <= maxImagePixels;

const pngChannels = new Map<number, number>([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);

const validPngBitDepths = new Map<number, ReadonlySet<number>>([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);

const safePngMetadataChunkLengths = new Map<string, (length: number) => boolean>([
  ["cHRM", (length) => length === 32],
  ["gAMA", (length) => length === 4],
  ["sRGB", (length) => length === 1],
  ["pHYs", (length) => length === 9],
  ["bKGD", (length) => length >= 1 && length <= 6],
  ["tIME", (length) => length === 7],
  ["tRNS", (length) => length >= 1 && length <= 256],
]);

const isSafeMarketplacePng = (buffer: Buffer) => {
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(pngSignature)) {
    return false;
  }

  let offset = 8;
  let chunkCount = 0;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let sawEnd = false;
  const imageDataParts: Buffer[] = [];

  while (offset < buffer.length && chunkCount < maxPngChunks) {
    if (offset + 12 > buffer.length) return false;
    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const nextOffset = crcOffset + 4;
    if (dataEnd < dataStart || nextOffset > buffer.length) return false;

    const type = buffer.subarray(typeStart, dataStart).toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    if (
      buffer.readUInt32BE(crcOffset) !==
      calculateCrc32(buffer.subarray(typeStart, dataEnd))
    ) {
      return false;
    }

    if (chunkCount === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8]!;
      colorType = buffer[dataStart + 9]!;
      const allowedBitDepths = validPngBitDepths.get(colorType);
      if (
        !hasSafeDimensions(width, height) ||
        !allowedBitDepths?.has(bitDepth) ||
        buffer[dataStart + 10] !== 0 ||
        buffer[dataStart + 11] !== 0 ||
        // Interlacing makes the exact decoded-size budget less direct. Product
        // uploads do not need it, so reject it instead of guessing.
        buffer[dataStart + 12] !== 0
      ) {
        return false;
      }
      sawHeader = true;
    } else if (type === "IHDR") {
      return false;
    } else if (type === "PLTE") {
      if (
        sawPalette ||
        sawImageData ||
        length < 3 ||
        length > 768 ||
        length % 3 !== 0
      ) {
        return false;
      }
      sawPalette = true;
    } else if (type === "IDAT") {
      if (length < 1 || imageDataEnded || sawEnd) return false;
      sawImageData = true;
      imageDataParts.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (length !== 0 || !sawImageData || nextOffset !== buffer.length) {
        return false;
      }
      sawEnd = true;
      offset = nextOffset;
      break;
    } else {
      if (sawImageData) imageDataEnded = true;
      const validatesLength = safePngMetadataChunkLengths.get(type);
      if (!validatesLength?.(length)) return false;
    }

    if (type !== "IDAT" && sawImageData) imageDataEnded = true;
    offset = nextOffset;
    chunkCount += 1;
  }

  if (
    !sawHeader ||
    !sawImageData ||
    !sawEnd ||
    offset !== buffer.length ||
    (colorType === 3 && !sawPalette)
  ) {
    return false;
  }

  const channels = pngChannels.get(colorType);
  if (!channels) return false;
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const expectedDecodedBytes = height * (1 + rowBytes);
  if (
    !Number.isSafeInteger(expectedDecodedBytes) ||
    expectedDecodedBytes > maxDecodedBytes
  ) {
    return false;
  }

  try {
    const decoded = inflateSync(Buffer.concat(imageDataParts), {
      maxOutputLength: expectedDecodedBytes,
    });
    if (decoded.length !== expectedDecodedBytes) return false;
    const rowLength = 1 + rowBytes;
    for (let row = 0; row < height; row += 1) {
      if (decoded[row * rowLength]! > 4) return false;
    }
    return true;
  } catch {
    return false;
  }
};

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

const isSafeMarketplaceJpeg = (buffer: Buffer) => {
  if (
    buffer.length < 12 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    return false;
  }

  let offset = 2;
  let sawDimensions = false;
  let segmentCount = 0;
  while (offset + 1 < buffer.length - 2 && segmentCount < maxJpegSegments) {
    if (buffer[offset] !== 0xff) return false;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) return false;
    const marker = buffer[offset]!;
    offset += 1;
    if (marker === 0xd9) break;
    if (marker === 0x00 || marker === 0xd8) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return false;
    }
    if (jpegStartOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) return false;
      const precision = buffer[offset + 2]!;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (precision !== 8 || !hasSafeDimensions(width, height)) return false;
      sawDimensions = true;
    }
    if (marker === 0xda) {
      // The compressed scan is entropy-coded, so marker-shaped bytes may occur.
      // Dimension and exact trailing EOI checks are the relevant allocation bound.
      return sawDimensions;
    }
    offset += segmentLength;
    segmentCount += 1;
  }
  return false;
};

const readUInt24LE = (buffer: Buffer, offset: number) =>
  buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16);

const isSafeMarketplaceWebp = (buffer: Buffer) => {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP" ||
    buffer.readUInt32LE(4) !== buffer.length - 8
  ) {
    return false;
  }

  let offset = 12;
  let chunkCount = 0;
  let dimensions: { width: number; height: number } | undefined;
  let sawImageChunk = false;
  while (offset < buffer.length && chunkCount < maxWebpChunks) {
    if (offset + 8 > buffer.length) return false;
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + (length % 2);
    if (dataEnd < dataStart || nextOffset > buffer.length) return false;

    if (type === "VP8X") {
      if (length !== 10 || dimensions) return false;
      const flags = buffer[dataStart]!;
      if ((flags & 0x02) !== 0) return false;
      dimensions = {
        width: 1 + readUInt24LE(buffer, dataStart + 4),
        height: 1 + readUInt24LE(buffer, dataStart + 7),
      };
    } else if (type === "VP8L") {
      if (length < 5 || buffer[dataStart] !== 0x2f) return false;
      const bits = buffer.readUInt32LE(dataStart + 1);
      const parsed = {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      };
      if (
        dimensions &&
        (dimensions.width !== parsed.width || dimensions.height !== parsed.height)
      ) {
        return false;
      }
      dimensions ??= parsed;
      sawImageChunk = true;
    } else if (type === "VP8 ") {
      if (
        length < 10 ||
        (buffer[dataStart]! & 1) !== 0 ||
        buffer[dataStart + 3] !== 0x9d ||
        buffer[dataStart + 4] !== 0x01 ||
        buffer[dataStart + 5] !== 0x2a
      ) {
        return false;
      }
      const parsed = {
        width: buffer.readUInt16LE(dataStart + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataStart + 8) & 0x3fff,
      };
      if (
        dimensions &&
        (dimensions.width !== parsed.width || dimensions.height !== parsed.height)
      ) {
        return false;
      }
      dimensions ??= parsed;
      sawImageChunk = true;
    }

    offset = nextOffset;
    chunkCount += 1;
  }

  return (
    offset === buffer.length &&
    sawImageChunk &&
    Boolean(dimensions) &&
    hasSafeDimensions(dimensions!.width, dimensions!.height)
  );
};

export const isSafeMarketplaceImage = (
  buffer: Buffer,
  mimeType: string,
) => {
  if (mimeType === "image/png") return isSafeMarketplacePng(buffer);
  if (mimeType === "image/jpeg") return isSafeMarketplaceJpeg(buffer);
  if (mimeType === "image/webp") return isSafeMarketplaceWebp(buffer);
  return false;
};

export const normalizeMarketplaceImage = async (
  buffer: Buffer,
  mimeType: string,
) => {
  if (!isSafeMarketplaceImage(buffer, mimeType)) {
    throw new Error("Marketplace image structure is invalid");
  }

  const { data, info } = await sharp(buffer, {
    animated: false,
    failOn: "error",
    limitInputChannels: 4,
    limitInputPixels: maxImagePixels,
    pages: 1,
    sequentialRead: true,
  })
    .autoOrient()
    .resize({
      fit: "inside",
      height: maxNormalizedDimension,
      width: maxNormalizedDimension,
      withoutEnlargement: true,
    })
    // The long-lived bucket was originally PNG-only. Normalizing every accepted
    // source format to a compact indexed PNG preserves rolling-deploy and
    // rollback compatibility while stripping EXIF/GPS/XMP/ICC by default.
    .png({
      colours: 256,
      compressionLevel: 9,
      effort: 10,
      palette: true,
      quality: 90,
    })
    .toBuffer({ resolveWithObject: true });

  const normalized = Buffer.from(data);
  if (
    !hasSafeDimensions(info.width, info.height) ||
    !isSafeMarketplaceImage(normalized, "image/png")
  ) {
    throw new Error("Normalized marketplace image is invalid");
  }

  return {
    buffer: normalized,
    mimeType: "image/png" as const,
    width: info.width,
    height: info.height,
  };
};
