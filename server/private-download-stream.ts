export const PRIVATE_DOWNLOAD_STREAM_CHUNK_BYTES = 64 * 1024;

export const readPrivateDownloadResponseBodyBounded = async (
  response: Response,
  maximumBytes: number,
) => {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || !response.body) {
    throw new Error("Private download source is not readable");
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Private download source exceeds its verified size");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
};

type ChunkedHttpResponse = NodeJS.EventEmitter & {
  destroyed?: boolean;
  writableEnded?: boolean;
  removeHeader(name: string): void;
  setHeader(name: string, value: string): void;
  write(chunk: Uint8Array): boolean;
  end(): void;
};

export const setPrivateDownloadHeaders = (
  response: Pick<ChunkedHttpResponse, "removeHeader" | "setHeader">,
  {
    contentType,
    contentDisposition,
  }: { contentType: string; contentDisposition: string },
) => {
  response.removeHeader("Content-Length");
  response.setHeader("Content-Type", contentType);
  response.setHeader("Content-Disposition", contentDisposition);
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Vary", "Cookie");
};

const waitForDrain = (response: ChunkedHttpResponse) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.removeListener("drain", onDrain);
      response.removeListener("close", onClose);
      response.removeListener("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Private download response closed before completion"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);
  });

/**
 * Writes an already-authorized and integrity-checked private file as a real
 * chunked response. Keeping Content-Length unset avoids the platform's buffered
 * response path while preserving the existing same-origin authorization gate.
 */
export const streamPrivateDownloadBuffer = async (
  response: ChunkedHttpResponse,
  buffer: Uint8Array,
) => {
  if (buffer.byteLength === 0) {
    response.end();
    return;
  }

  for (
    let offset = 0;
    offset < buffer.byteLength;
    offset += PRIVATE_DOWNLOAD_STREAM_CHUNK_BYTES
  ) {
    if (response.destroyed || response.writableEnded) {
      throw new Error("Private download response closed before completion");
    }
    const chunk = buffer.subarray(
      offset,
      Math.min(buffer.byteLength, offset + PRIVATE_DOWNLOAD_STREAM_CHUNK_BYTES),
    );
    if (!response.write(chunk)) {
      await waitForDrain(response);
    }
  }
  response.end();
};
