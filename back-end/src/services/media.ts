import { spawn } from "node:child_process";
import { TranscriptError } from "./transcript.js";

/**
 * ffmpeg wrapper. Whisper wants 16 kHz mono PCM and nothing else, so this is
 * deliberately narrow: one conversion, one probe, no general-purpose surface.
 */

/** What Whisper's encoder expects; anything else is resampled internally anyway. */
const SAMPLE_RATE = 16_000;

/** Extensions we'll attempt. ffmpeg handles far more, but a folder scan needs a filter. */
export const MEDIA_EXTENSIONS = new Set([
  ".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi",
  ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".aiff",
]);

interface RunResult {
  code: number | null;
  stderr: string;
}

/**
 * ffmpeg writes everything to stderr, progress included, so it's captured
 * rather than inherited — a failure message is useless if it's already gone to
 * the terminal.
 */
function run(bin: string, args: string[], signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { signal });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      // Unbounded growth on a long file would hold the whole log in memory.
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
    });

    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/**
 * Strips video and writes 16 kHz mono PCM to `destination`.
 *
 * Throws TranscriptError so a bad file fails the same way a missing caption
 * track does — before the first emit, as a 422 rather than a stream that dies.
 */
export async function extractAudio(
  ffmpeg: string,
  source: string,
  destination: string,
  signal?: AbortSignal
): Promise<void> {
  const { code, stderr } = await run(
    ffmpeg,
    [
      "-y",
      "-i", source,
      "-vn", // audio only — decoding video frames would be wasted work
      "-ar", String(SAMPLE_RATE),
      "-ac", "1",
      "-c:a", "pcm_s16le",
      destination,
    ],
    signal
  );

  if (code !== 0) {
    // ffmpeg's last line is the actionable one; the rest is banner and stream info.
    const reason = stderr.trim().split("\n").at(-1) ?? `exit ${code}`;
    throw new TranscriptError(`Could not read audio from this file: ${reason}`);
  }
}

/** Duration in seconds, or null when ffmpeg won't say — the manifest allows null. */
export async function probeDuration(
  ffmpeg: string,
  source: string,
  signal?: AbortSignal
): Promise<number | null> {
  // No ffprobe in the vendor directory, but ffmpeg reports duration on stderr
  // while refusing to produce output, which is enough.
  const { stderr } = await run(ffmpeg, ["-i", source, "-f", "null", "-"], signal);
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/.exec(stderr);
  if (!match) return null;

  const [, h, m, s, frac] = match;
  return (
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac}`)
  );
}
