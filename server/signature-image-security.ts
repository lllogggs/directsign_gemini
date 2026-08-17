import { inflateSync } from "node:zlib";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxSignatureDimension = 2_048;
const maxSignaturePixels = 4_194_304;
const maxPngChunks = 256;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
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

export const isSafeSignaturePng = (buffer: Buffer) => {
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(pngSignature)) {
    return false;
  }

  let offset = 8;
  let chunkCount = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  let width = 0;
  let height = 0;
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
    const expectedCrc = buffer.readUInt32BE(crcOffset);
    const actualCrc = calculateCrc32(buffer.subarray(typeStart, dataEnd));
    if (expectedCrc !== actualCrc) return false;

    if (chunkCount === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      const bitDepth = buffer[dataStart + 8]!;
      const colorType = buffer[dataStart + 9]!;
      const compressionMethod = buffer[dataStart + 10]!;
      const filterMethod = buffer[dataStart + 11]!;
      const interlaceMethod = buffer[dataStart + 12]!;
      if (
        width < 1 ||
        height < 1 ||
        width > maxSignatureDimension ||
        height > maxSignatureDimension ||
        width * height > maxSignaturePixels ||
        bitDepth !== 8 ||
        colorType !== 6 ||
        compressionMethod !== 0 ||
        filterMethod !== 0 ||
        interlaceMethod !== 0
      ) {
        return false;
      }
      sawHeader = true;
    } else if (type === "IHDR") {
      return false;
    }

    if (type === "IDAT") {
      if (length <= 0 || sawEnd) return false;
      sawImageData = true;
      imageDataParts.push(buffer.subarray(dataStart, dataEnd));
    } else if (type !== "IHDR" && type !== "IEND") {
      // Browser canvas signatures need no metadata chunks. Rejecting every
      // ancillary chunk also prevents hidden iCCP/text inflate paths.
      return false;
    }
    if (type === "IEND") {
      if (length !== 0 || nextOffset !== buffer.length) return false;
      sawEnd = true;
      offset = nextOffset;
      break;
    }

    offset = nextOffset;
    chunkCount += 1;
  }

  if (!(sawHeader && sawImageData && sawEnd && offset === buffer.length)) {
    return false;
  }

  const expectedInflatedLength = height * (1 + width * 4);
  try {
    const inflated = inflateSync(Buffer.concat(imageDataParts), {
      maxOutputLength: expectedInflatedLength,
    });
    if (inflated.length !== expectedInflatedLength) return false;
    const rowLength = 1 + width * 4;
    for (let row = 0; row < height; row += 1) {
      if (inflated[row * rowLength]! > 4) return false;
    }
    return true;
  } catch {
    return false;
  }
};
