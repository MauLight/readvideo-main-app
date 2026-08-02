import {
  abortError,
  FrameListener,
  newRequestId,
  requireDesktop,
  StreamBody,
  StreamRoute,
} from "./desktop";

/**
 * Client for the article backend, which lives in the Electron main process.
 *
 * Everything goes over the desktop bridge — there is no HTTP path. Credentials
 * never cross it either: main reads them from safeStorage itself, the same
 * store the onboarding form writes to.
 */

export interface HealthResult {
  ok: boolean;
  status: "ok" | "degraded";
  openai?: { ok: boolean; error?: string };
}

/**
 * Verifies the user's OpenAI key before any tokens are spent — main runs
 * models.list(), an authenticated call that costs nothing.
 */
export async function checkHealth(): Promise<HealthResult> {
  const health = await requireDesktop().health();
  return { ...health, ok: health.status === "ok" };
}

export type ArticleStyle = "blog" | "academic";

export interface Segment {
  text: string;
  offset: number; // ms
  duration: number; // ms
}

/** One video in a playlist manifest. `index` keys every later stream event. */
export interface PlaylistItem {
  index: number; // 0-based position in the playlist
  videoId: string;
  title: string;
  durationSeconds: number | null; // null when the length couldn't be read
}

/** Opening `playlist` event of POST /api/playlists/stream. */
export interface PlaylistManifest {
  playlistId: string; // from ?list=
  title: string;
  total: number; // === items.length
  style: ArticleStyle;
  items: PlaylistItem[];
}

/** `item_start` — that chapter began generating. */
export interface PlaylistItemStartEvent {
  index: number; // matches a manifest item's index
  videoId: string;
  title: string;
}

/** `chunk` — a slice of one chapter's article. Append in arrival order. */
export interface PlaylistChunkEvent {
  index: number; // which manifest item this text belongs to
  text: string;
}

/** `item_done` — that chapter finished cleanly. */
export interface PlaylistItemDoneEvent {
  index: number;
  status: "ok";
}

/** `item_error` — that chapter failed; the playlist loop continues. */
export interface PlaylistItemErrorEvent {
  index: number;
  status: "no_transcript" | "error";
  error: string;
}

/** `done` — the run finished normally. Tallies across the whole playlist. */
export interface PlaylistDoneEvent {
  completed: number;
  skipped: number;
}

/**
 * How the stream ended. `done` means the server sent its closing tally;
 * `interrupted` means the connection closed without one — cancelled by the
 * client, or dropped.
 */
export type PlaylistOutcome = "done" | "interrupted";

export interface StreamHandlers {
  onTranscript?: (data: {
    style: ArticleStyle;
    transcript: string;
    segments: Segment[];
  }) => void;
  onChunk?: (text: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

/**
 * Stream an article (Markdown) from a YouTube URL via SSE.
 *
 * Resolves when the stream closes. Network/HTTP failures throw; a mid-stream
 * `error` event is delivered through handlers.onError (not thrown).
 */
export async function streamArticle(
  url: string,
  style: ArticleStyle,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  await runStream(
    "articles",
    { url, style },
    (event, data) => {
      switch (event) {
        case "transcript":
          handlers.onTranscript?.(
            data as unknown as {
              style: ArticleStyle;
              transcript: string;
              segments: Segment[];
            }
          );
          break;
        case "chunk":
          handlers.onChunk?.((data.text as string) ?? "");
          break;
        case "done":
          handlers.onDone?.();
          break;
        case "error":
          handlers.onError?.((data.error as string) ?? "Generation failed.");
          break;
      }
    },
    signal
  );
}

export interface PlaylistStreamHandlers {
  /** Opening frame: the full chapter list, before any text arrives. */
  onManifest?: (manifest: PlaylistManifest) => void;
  onItemStart?: (item: PlaylistItemStartEvent) => void;
  onChunk?: (chunk: PlaylistChunkEvent) => void;
  onItemDone?: (item: PlaylistItemDoneEvent) => void;
  /** One chapter failed; the run continues with the next. */
  onItemError?: (item: PlaylistItemErrorEvent) => void;
  /** The run finished normally, with its tally. */
  onDone?: (summary: PlaylistDoneEvent) => void;
  /** The whole run failed. */
  onError?: (error: string) => void;
}

/**
 * Stream a playlist's articles (Markdown) from a YouTube URL via SSE.
 *
 * Frames arrive as: one `playlist` manifest, then per chapter
 * `item_start` -> zero or more `chunk` -> exactly one `item_done`/`item_error`.
 * Chapters are keyed by `index`, matching the manifest.
 *
 * Resolves when the stream closes, returning how it ended: "done" if the
 * server sent its closing tally, "interrupted" if the connection closed
 * without one (a client cancel sends no `done`). Network/HTTP failures throw;
 * mid-stream failures are delivered through onItemError/onError (not thrown).
 */
export async function streamPlaylist(
  url: string,
  style: ArticleStyle,
  handlers: PlaylistStreamHandlers,
  signal?: AbortSignal
): Promise<PlaylistOutcome> {
  // `done` is the only sentinel — the stream otherwise just stops. Tracked
  // here so a run that ends without one is reported as interrupted.
  let outcome: PlaylistOutcome = "interrupted";

  await runStream(
    "playlists",
    { url, style },
    (event, data) => {
      switch (event) {
        case "playlist":
          handlers.onManifest?.(data as unknown as PlaylistManifest);
          break;
        case "item_start":
          handlers.onItemStart?.(data as unknown as PlaylistItemStartEvent);
          break;
        case "chunk":
          handlers.onChunk?.(data as unknown as PlaylistChunkEvent);
          break;
        case "item_done":
          handlers.onItemDone?.(data as unknown as PlaylistItemDoneEvent);
          break;
        case "item_error":
          handlers.onItemError?.(data as unknown as PlaylistItemErrorEvent);
          break;
        case "done":
          outcome = "done";
          handlers.onDone?.(data as unknown as PlaylistDoneEvent);
          break;
        case "error":
          handlers.onError?.((data.error as string) ?? "Generation failed.");
          break;
      }
    },
    signal
  );

  return outcome;
}

/**
 * Runs one streaming request over the bridge, feeding frames to `onFrame`.
 * An AbortSignal maps onto cancel(requestId); main rejects with an AbortError.
 */
async function runStream(
  route: StreamRoute,
  body: StreamBody,
  onFrame: FrameListener,
  signal?: AbortSignal
): Promise<void> {
  const desktop = requireDesktop();
  if (signal?.aborted) throw abortError();

  const requestId = newRequestId();

  function handleAbort() {
    desktop.cancel(requestId);
  }

  signal?.addEventListener("abort", handleAbort, { once: true });
  try {
    await desktop.stream(route, body, requestId, onFrame);
  } catch (err) {
    // contextBridge copies errors across the isolated worlds keeping only
    // `message` and `stack`, so a name set on the far side arrives as plain
    // "Error". Re-derive it here, where the signal is the reliable witness.
    if (signal?.aborted) throw abortError();
    throw err;
  } finally {
    signal?.removeEventListener("abort", handleAbort);
  }
}
