import { ApiKeys } from "../config.js";
import { WritingStyle } from "../services/openai.js";

/**
 * How a runner reports progress. Express turns these into SSE frames; Electron
 * forwards them over IPC. Same event names either way.
 */
export type Emit = (event: string, payload: unknown) => void;

export interface RunInput {
  url: string;
  style: WritingStyle;
  keys: ApiKeys;
}

/** Bad input, caught before anything is emitted. */
export class ValidationError extends Error {}

/**
 * Runners draw a hard line at the first emit:
 *
 *   - Anything that fails BEFORE it (bad URL, no transcript, private playlist)
 *     is thrown, so HTTP can answer with a status code and IPC can reject.
 *   - Anything that fails AFTER it is emitted as an `error`/`item_error` frame,
 *     because the response has already begun.
 */
