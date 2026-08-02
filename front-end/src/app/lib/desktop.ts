/**
 * The contract between the renderer and the Electron main process.
 *
 * Under Electron the renderer makes no HTTP calls of its own: the page is
 * served from http://127.0.0.1 purely so the document has a real web origin
 * (the YouTube player needs one), while all data travels over IPC. In a plain
 * browser `window.desktop` is absent and lib/api.ts falls back to HTTP/SSE.
 *
 * Streaming shape, mirroring SSE so both transports feed the same parsers:
 *   - the caller mints a `requestId` and passes it in
 *   - main pushes frames back as (event, data) pairs, one channel per run
 *   - `cancel(requestId)` is what an AbortSignal maps onto
 *   - the returned promise settles when the run ends, and rejects when the run
 *     is cancelled. Note the rejection's `name` cannot be relied on: Electron's
 *     contextBridge copies errors keeping only `message` and `stack`, so
 *     anything the far side sets arrives as plain "Error". runStream re-derives
 *     AbortError from the signal instead — see lib/api.ts.
 *
 * Credentials are deliberately absent. On the desktop path main owns the keys
 * through safeStorage (see lib/keys.ts), so they never cross this boundary.
 */

import type { ApiKeys } from "./keys";

export type StreamRoute = "articles" | "playlists";

export interface StreamBody {
  url: string;
  style: string;
}

export type FrameListener = (
  event: string,
  data: Record<string, unknown>
) => void;

export interface HealthPayload {
  ok: boolean;
  status: "ok" | "degraded";
  openai?: { ok: boolean; error?: string };
}

export interface YouTubeTarget {
  kind: "video" | "playlist";
  id: string;
}

export interface YouTubeMeta {
  title: string;
  author: string;
  thumbnail: string;
}

export interface DesktopBridge {
  /** Resolves when the run ends; rejects with an AbortError when cancelled. */
  stream: (
    route: StreamRoute,
    body: StreamBody,
    requestId: string,
    onFrame: FrameListener
  ) => Promise<void>;
  cancel: (requestId: string) => void;
  health: () => Promise<HealthPayload>;
  /** oEmbed lives in main so YouTube's origin rules stop applying. */
  youtube: {
    verify: (target: YouTubeTarget) => Promise<boolean>;
    meta: (target: YouTubeTarget) => Promise<YouTubeMeta | null>;
  };
  /** Backed by Electron's safeStorage — the only place keys are kept. */
  keys: {
    load: () => Promise<ApiKeys | null>;
    save: (keys: ApiKeys) => Promise<void>;
    clear: () => Promise<void>;
  };
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** The bridge when running under Electron, otherwise null. */
export function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.desktop ?? null;
}

/** Thrown when the app is running outside Electron. */
export class NoBridgeError extends Error {
  constructor() {
    super("The desktop bridge is unavailable — run the desktop app.");
    this.name = "NoBridgeError";
  }
}

/** The bridge, or a clear failure. Every call into main goes through this. */
export function requireDesktop(): DesktopBridge {
  const desktop = getDesktop();
  if (!desktop) throw new NoBridgeError();
  return desktop;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

/** The rejection `stream` produces on cancel, matched by name everywhere. */
export function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}
