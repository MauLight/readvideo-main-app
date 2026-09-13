import { ApiKeys } from "../config.js";
import { WritingStyle } from "../services/openai.js";

/**
 * How a runner reports progress. The HTTP layer turns these into SSE frames;
 * another transport (IPC, a worker) can forward the same event names.
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
 *   - Anything that fails BEFORE it (bad URL, no transcript) is thrown, so
 *     HTTP can answer with a status code.
 *   - Anything that fails AFTER it is emitted as an `error` frame, because the
 *     response has already begun.
 */
