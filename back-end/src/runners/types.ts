import { ApiKeys } from "../config.js";
import { ChatMessage, WritingStyle } from "../services/openai.js";
import { Source } from "../services/source.js";

/**
 * How a runner reports progress. Express turns these into SSE frames; Electron
 * forwards them over IPC. Same event names either way.
 */
export type Emit = (event: string, payload: unknown) => void;

export interface RunInput {
  /** What to transcribe. A YouTube link or a local file, decided upstream. */
  source: Source;
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

/**
 * What an ask run needs. Deliberately not a Source: the transcript already
 * exists by the time anyone can ask about it, so re-resolving it would mean
 * re-transcribing a local file for every question.
 *
 * History travels with the request because the back-end holds no sessions.
 */
export interface AskInput {
  transcript: string;
  /** Oldest first, ending with the question being asked now. */
  messages: ChatMessage[];
  keys: ApiKeys;
}
