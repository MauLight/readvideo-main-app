import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { protocol } from "electron";

/**
 * Serves dropped media to the renderer.
 *
 * The page is served over http://127.0.0.1, and Chromium refuses file:// from
 * an http origin, so a local video can't be pointed at directly. A custom
 * scheme also works in the dev loop, where the static server isn't running at
 * all and a route on it would not exist.
 *
 * Seeking needs byte ranges, so this answers 206 — without that the element
 * can only play straight through.
 */

export const MEDIA_SCHEME = "readvideo-media";

/**
 * Only what the user dropped. Without this the renderer could read any file on
 * the machine through a scheme it is handed by default.
 */
const allowedRoots = new Set<string>();

export function allowMedia(paths: string[]): void {
  for (const entry of paths) allowedRoots.add(path.resolve(entry));
}

function isAllowed(file: string): boolean {
  const target = path.resolve(file);
  for (const root of allowedRoots) {
    if (target === root) return true;
    if (target.startsWith(root + path.sep)) return true;
  }
  return false;
}

export function mediaUrl(file: string): string {
  return `${MEDIA_SCHEME}://media/?p=${encodeURIComponent(file)}`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".aiff": "audio/aiff",
};

/**
 * Must run before app ready. `stream` is what lets a Response body be piped
 * rather than buffered — a 2 GB lecture would otherwise land in memory.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true },
    },
  ]);
}

export function serveMedia(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const file = new URL(request.url).searchParams.get("p");
    if (!file) return new Response("Missing path", { status: 400 });
    if (!isAllowed(file)) return new Response("Not permitted", { status: 403 });

    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return new Response("Not found", { status: 404 });
    }

    const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const range = request.headers.get("Range");

    if (!range) {
      return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
        status: 200,
        headers: {
          "Content-Type": type,
          "Content-Length": String(size),
          "Accept-Ranges": "bytes",
        },
      });
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

    if (Number.isNaN(start) || start >= size || end < start) {
      return new Response("Bad range", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    return new Response(
      Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream,
      {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
        },
      }
    );
  });
}
