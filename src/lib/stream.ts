import fs from 'node:fs/promises';
import { parseRange } from './ranges';

/**
 * Streaming helpers for byte-range delivery.
 *
 * Files are read in 2 MB chunks straight from disk — content is never
 * buffered in application memory. The stream applies backpressure through
 * the ReadableStream controller's desiredSize.
 */

const CHUNK_SIZE = 2 * 1024 * 1024;

/**
 * Create a web ReadableStream that yields the inclusive byte range
 * [start, end] of the file at `absPath`.
 */
export async function createRangeStream(
  absPath: string,
  start: number,
  end: number,
): Promise<ReadableStream<Uint8Array>> {
  const fileHandle = await fs.open(absPath, 'r');

  let offset = Math.max(0, start);
  let closePromise: Promise<void> | null = null;
  const closeHandle = (): Promise<void> => {
    if (!closePromise) {
      closePromise = fileHandle.close().catch(() => {
        /* already closed */
      });
    }
    return closePromise;
  };

  const source: UnderlyingDefaultSource<Uint8Array> = {
    async pull(controller) {
      try {
        while (offset <= end) {
          const length = Math.min(CHUNK_SIZE, end - offset + 1);
          const buffer = Buffer.alloc(length);
          const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);
          if (bytesRead === 0) break; // EOF / no more data
          offset += bytesRead;
          controller.enqueue(new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead));
          if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
        }
      } catch (err) {
        void closeHandle();
        controller.error(err);
        return;
      }
      // Range fully consumed: release the file handle, then close the stream.
      void closeHandle();
      controller.close();
    },
    cancel() {
      void closeHandle();
    },
  };

  return new ReadableStream<Uint8Array>(source);
}

export interface RangeResponseOptions {
  contentType: string;
  cacheControl?: string;
  etag?: string | null;
  missingMessage?: string;
}

/**
 * Serve a file with HTTP Range support (206/416), shared by the original
 * stream route and the generated-asset route.
 */
export async function serveFileRange(
  req: Request,
  absPath: string,
  opts: RangeResponseOptions,
): Promise<Response> {
  let size: number;
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) throw new Error('not a file');
    size = stat.size;
  } catch {
    return Response.json({ error: opts.missingMessage ?? 'File not found' }, { status: 404 });
  }

  const spec = parseRange(req.headers.get('range'), size);
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': opts.contentType,
  });
  if (opts.cacheControl) headers.set('Cache-Control', opts.cacheControl);
  if (opts.etag) headers.set('ETag', `"${opts.etag}"`);

  if (spec.status === 416) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = spec.status === 206 ? spec.start : 0;
  const end = spec.status === 206 ? spec.end : size - 1;
  headers.set('Content-Length', String(Math.max(0, end - start + 1)));
  if (spec.status === 206) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);

  const body = await createRangeStream(absPath, start, end);
  return new Response(body, { status: spec.status, headers });
}
