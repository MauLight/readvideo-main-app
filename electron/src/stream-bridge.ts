import { IpcMainInvokeEvent, WebContents } from "electron";
import { runArticle } from "back-end/runners/article";
import { runPlaylist } from "back-end/runners/playlist";
import { runAsk } from "back-end/runners/ask";
import type { AskInput, Emit, RunInput } from "back-end/runners/types";
import type { ChatMessage } from "back-end/services/openai";
import { readSource } from "back-end/services/source";
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

export type StreamRoute = "articles" | "playlists" | "ask";

/**
 * Discriminated on route, because "ask" takes a transcript and a conversation
 * rather than a source — see AskInput in back-end/runners/types.
 */
export type StreamRequest =
  | {
      route: "articles" | "playlists";
      body: { source: { kind: string; ref: string }; style: string };
      requestId: string;
    }
  | {
      route: "ask";
      body: { transcript: string; messages: ChatMessage[] };
      requestId: string;
    };

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

function isMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => {
      if (typeof entry !== "object" || entry === null) return false;
      const { role, content } = entry as Record<string, unknown>;
      return (
        (role === "user" || role === "assistant") && typeof content === "string"
      );
    })
  );
}

function isRequest(value: unknown): value is StreamRequest {
  if (typeof value !== "object" || value === null) return false;
  const { route, body, requestId } = value as Record<string, unknown>;
  if (typeof requestId !== "string" || requestId.length === 0) return false;
  if (typeof body !== "object" || body === null) return false;

  const fields = body as Record<string, unknown>;
  if (route === "ask") {
    return typeof fields.transcript === "string" && isMessages(fields.messages);
  }
  return (
    (route === "articles" || route === "playlists") &&
    typeof fields.source === "object"
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

  const emit = frameSender(event.sender, request.requestId);

  try {
    if (request.route === "ask") {
      const input: AskInput = {
        transcript: request.body.transcript,
        messages: request.body.messages,
        keys,
      };
      await runAsk(input, emit, controller.signal);
      return controller.signal.aborted ? { status: "aborted" } : { status: "done" };
    }

    const input: RunInput = {
      // Trusted here in a way the HTTP route can't be: a file path from the
      // renderer came from the user's own drag-drop, not a remote caller.
      source: readSource(request.body.source),
      style: readStyle(request.body.style),
      keys,
    };
    const run = request.route === "playlists" ? runPlaylist : runArticle;
    await run(input, emit, controller.signal);
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
