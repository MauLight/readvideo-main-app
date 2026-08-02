import { Request, Response } from "express";
import { ApiKeys } from "../config.js";
import { WritingStyle } from "../services/openai.js";
import { TranscriptError } from "../services/youtube.js";
import { PlaylistError } from "../services/playlist.js";
import { Emit, RunInput, ValidationError } from "../runners/types.js";

const VALID_STYLES: WritingStyle[] = ["blog", "academic"];

/** Thrown when the caller sent no credentials. */
export class MissingKeyError extends Error {}

/**
 * The user's keys travel per request — the server holds none of its own.
 * YouTube is optional here; only playlists need it, and that check lives in
 * the playlist service so the error message can be specific.
 */
export function readKeys(req: Request): ApiKeys {
  const openai = req.header("x-openai-key")?.trim();
  if (!openai) {
    throw new MissingKeyError("An OpenAI API key is required (x-openai-key).");
  }

  return { openai, youtube: req.header("x-youtube-key")?.trim() || undefined };
}

/**
 * Absent style falls back to "blog"; an unrecognised one is rejected. Silently
 * substituting would return a whole article in the wrong voice over a typo.
 */
export function readStyle(value: unknown): WritingStyle {
  if (value === undefined || value === null) return "blog";
  if (!VALID_STYLES.includes(value as WritingStyle)) {
    throw new ValidationError(
      `Unknown style "${String(value)}". Expected ${VALID_STYLES.join(" or ")}.`
    );
  }
  return value as WritingStyle;
}

/**
 * An Emit that writes SSE frames, switching the response into stream mode on
 * the first call. Deferring the headers is what lets a runner throw beforehand
 * and still get a normal JSON error response.
 */
export function sseEmitter(res: Response): { emit: Emit; started: () => boolean } {
  let started = false;

  return {
    started: () => started,
    emit: (event, payload) => {
      if (!started) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();
        started = true;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    },
  };
}

/** Maps a pre-stream failure onto an HTTP status. */
function statusFor(err: unknown): number {
  if (err instanceof MissingKeyError) return 401;
  if (err instanceof ValidationError) return 400;
  if (err instanceof TranscriptError || err instanceof PlaylistError) return 422;
  return 500;
}

type Runner = (
  input: RunInput,
  emit: Emit,
  signal: AbortSignal
) => Promise<void>;

/**
 * Wires a runner to an Express request: reads keys, streams frames, aborts the
 * run if the client hangs up, and answers with JSON when it fails before the
 * first frame.
 */
export async function handleStream(
  req: Request,
  res: Response,
  run: Runner,
  fallbackMessage: string
): Promise<void> {
  const { emit, started } = sseEmitter(res);
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  try {
    const keys = readKeys(req);
    const { url, style } = req.body ?? {};
    await run(
      { url: typeof url === "string" ? url : "", style: readStyle(style), keys },
      emit,
      controller.signal
    );
  } catch (err) {
    if (!started()) {
      const status = statusFor(err);
      if (status === 500) console.error(fallbackMessage, err);
      res.status(status).json({
        error: err instanceof Error && status !== 500 ? err.message : fallbackMessage,
      });
      return;
    }

    // Already streaming — the frame is the only channel left.
    console.error(fallbackMessage, err);
    emit("error", { error: fallbackMessage });
  } finally {
    if (started()) res.end();
  }
}
