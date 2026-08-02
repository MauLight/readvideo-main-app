import { YoutubeTranscript } from "youtube-transcript";

// YouTube video ids are exactly 11 chars of [A-Za-z0-9_-].
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Hosts we accept, so "notyoutube.com" can't sneak through.
const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

/**
 * Extracts the 11-character video id from the common YouTube URL shapes:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/{embed,shorts,live,v}/VIDEO_ID
 * Returns null when no id can be found.
 *
 * Kept deliberately in step with parseYouTubeLink on the client: the client
 * validates before sending, so anything it accepts must parse here too.
 */
export function extractVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    // Tolerate URLs pasted without a scheme (e.g. "youtu.be/abc").
    parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return VIDEO_ID.test(id) ? id : null;
  }

  const fromQuery = parsed.searchParams.get("v");
  if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (
    segments.length >= 2 &&
    ["embed", "shorts", "live", "v"].includes(segments[0])
  ) {
    return VIDEO_ID.test(segments[1]) ? segments[1] : null;
  }

  return null;
}

export class TranscriptError extends Error {}

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
}

/**
 * Fetches the transcript for a YouTube URL as both a joined string and
 * timestamped segments. Throws TranscriptError with a client-friendly
 * message on failure.
 */
export async function getTranscriptData(url: string): Promise<TranscriptData> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new TranscriptError("Could not parse a YouTube video id from the URL.");
  }

  try {
    const raw = await YoutubeTranscript.fetchTranscript(videoId);
    if (!raw.length) {
      throw new TranscriptError("No transcript is available for this video.");
    }
    const segments: TranscriptSegment[] = raw.map((s) => ({
      text: s.text,
      offset: s.offset,
      duration: s.duration,
    }));
    return { text: segments.map((s) => s.text).join(" "), segments };
  } catch (err) {
    if (err instanceof TranscriptError) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new TranscriptError(`Failed to fetch transcript: ${message}`);
  }
}
