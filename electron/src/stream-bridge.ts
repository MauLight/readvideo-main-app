import { IpcMainInvokeEvent, WebContents } from "electron";
import { runArticle } from "back-end/runners/article";
import { runPlaylist } from "back-end/runners/playlist";
import type { Emit, RunInput } from "back-end/runners/types";
import { checkOpenAI } from "back-end/services/openai";
import { loadKeys } from "./key-store.js";

/**
 * Runs the backend's runners in main and pushes their frames to the renderer.
 *
 * The runners are transport-agnostic — `(input, emit, signal)` — so this is the
 * IPC counterpart to the Express adapter in back-end/src/routes/sse.ts. Frames
 * keep the same (event, data) shape SSE produced, which is why the renderer's
 * parsers needed no changes.
 *
 * Credentials never cross the bridge: they're read from safeStorage here.
 */

export type StreamRoute = "articles" | "playlists";

export interface StreamRequest {
  route: StreamRoute;
  body: { url: string; style: string };
  requestId: string;
}

/**
 * Outcomes are returned, not thrown. An ipcMain.handle rejection reaches the
 * renderer wrapped in "Error invoking remote method ...", which would bury the
 * real message; preload rethrows cleanly from this instead.
 */
export type StreamResult =
  | { status: "done" }
  | { status: "aborted" }
  | { status: "error"; message: string };

const VALID_STYLES = ["blog", "academic"] as const;
type WritingStyle = (typeof VALID_STYLES)[number];

/** In-flight runs, so cancel() can find the right one. */
const running = new Map<string, AbortController>();

function readStyle(value: unknown): WritingStyle {
  return VALID_STYLES.includes(value as WritingStyle)
    ? (value as WritingStyle)
    : "blog";
}

function isRequest(value: unknown): value is StreamRequest {
  if (typeof value !== "object" || value === null) return false;
  const { route, body, requestId } = value as Record<string, unknown>;
  return (
    (route === "articles" || route === "playlists") &&
    typeof requestId === "string" &&
    requestId.length > 0 &&
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).url === "string"
  );
}

/**
 * Sends one frame to the renderer, tagged with the run it belongs to. Guards
 * against a destroyed window: a run outliving its window would otherwise throw
 * on every chunk.
 */
function frameSender(sender: WebContents, requestId: string): Emit {
  return (event, data) => {
    if (sender.isDestroyed()) return;
    sender.send("stream:frame", { requestId, event, data });
  };
}

export async function startStream(
  event: IpcMainInvokeEvent,
  request: unknown
): Promise<StreamResult> {
  if (!isRequest(request)) {
    return { status: "error", message: "Malformed stream request." };
  }

  const keys = await loadKeys();
  if (!keys) {
    return { status: "error", message: "No API keys are stored." };
  }

  const controller = new AbortController();
  running.set(request.requestId, controller);

  const input: RunInput = {
    url: request.body.url,
    style: readStyle(request.body.style),
    keys,
  };

  const run = request.route === "playlists" ? runPlaylist : runArticle;

  try {
    await run(input, frameSender(event.sender, request.requestId), controller.signal);
    return controller.signal.aborted ? { status: "aborted" } : { status: "done" };
  } catch (err) {
    if (controller.signal.aborted) return { status: "aborted" };

    // Runners throw only for failures before the first frame — a bad URL, no
    // transcript, a private playlist. Those messages are meant for the user.
    const message =
      err instanceof Error ? err.message : "The run failed unexpectedly.";
    return { status: "error", message };
  } finally {
    running.delete(request.requestId);
  }
}

export function cancelStream(requestId: unknown): void {
  if (typeof requestId !== "string") return;
  running.get(requestId)?.abort();
}

/** Aborts everything still running — used when the window goes away. */
export function cancelAll(): void {
  for (const controller of running.values()) controller.abort();
  running.clear();
}

export interface HealthPayload {
  status: "ok" | "degraded";
  openai?: { ok: boolean; error?: string };
  error?: string;
}

/**
 * Validates the stored OpenAI key with models.list() — authenticated, and free
 * — so a bad key is caught before any tokens are spent.
 */
export async function health(): Promise<HealthPayload> {
  const keys = await loadKeys();
  if (!keys) {
    return { status: "degraded", error: "No API keys are stored." };
  }

  const openai = await checkOpenAI(keys.openai);
  return { status: openai.ok ? "ok" : "degraded", openai };
}
