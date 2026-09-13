/**
 * The shape every transcript source produces, whatever the source.
 *
 * YouTube captions and local Whisper output converge here, which is what lets
 * the runners, the SSE contract and the transcript panel stay source-agnostic.
 */

export interface TranscriptSegment {
  /** Caption text for this segment. */
  text: string;
  /** Start time in milliseconds. */
  offset: number;
  /** How long the segment is shown, in milliseconds. */
  duration: number;
}

export interface TranscriptData {
  /** The whole transcript joined into one string. */
  text: string;
  /** Individual timestamped segments. */
  segments: TranscriptSegment[];
  /** ISO code of the track or detected language, when known. */
  lang?: string;
}

/**
 * A transcript could not be obtained. Thrown before a runner's first emit, so
 * the HTTP layer answers 422 rather than opening a stream it can't fill.
 */
export class TranscriptError extends Error {}

/** Joins segments the one way every source should join them. */
export function joinSegments(segments: TranscriptSegment[]): string {
  return segments.map((segment) => segment.text).join(" ");
}
