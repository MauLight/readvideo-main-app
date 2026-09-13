import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractAudio } from "./media.js";
import {
  joinSegments,
  TranscriptData,
  TranscriptError,
  TranscriptSegment,
} from "./transcript.js";

/**
 * Local transcription via whisper.cpp.
 *
 * The binaries live in the Electron bundle, which this package can't reach —
 * it has no business importing electron, and it also runs as a standalone
 * server. So the paths are injected once at startup instead of resolved here.
 */

export interface WhisperBinaries {
  ffmpeg: string;
  cli: string;
  model: string;
}

let binaries: WhisperBinaries | null = null;

export function configureWhisper(paths: WhisperBinaries): void {
  binaries = paths;
}

/** False in a build that never fetched the optional stack. */
export function whisperAvailable(): boolean {
  return binaries !== null;
}

export interface TranscribeOptions {
  /** 0–1. whisper-cli reports progress on stderr; this forwards it. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** One entry of whisper-cli's `-oj` output. */
interface WhisperJsonSegment {
  text?: string;
  offsets?: { from?: number; to?: number };
}

interface WhisperJson {
  result?: { language?: string };
  transcription?: WhisperJsonSegment[];
}

const PROGRESS = /progress\s*=\s*(\d+)%/i;

function runWhisper(
  cli: string,
  args: string[],
  options: TranscribeOptions
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { signal: options.signal });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);

      const match = PROGRESS.exec(text);
      if (match && options.onProgress) options.onProgress(Number(match[1]) / 100);
    });

    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/**
 * Transcribes a local video or audio file.
 *
 * Two processes: ffmpeg narrows whatever was dropped to 16 kHz mono PCM, then
 * whisper-cli turns that into timestamped segments. Both run against a scratch
 * directory that is removed however this ends.
 *
 * Returns the same TranscriptData a YouTube caption track produces, so nothing
 * downstream can tell the difference.
 */
export async function transcribeFile(
  source: string,
  options: TranscribeOptions = {}
): Promise<TranscriptData> {
  if (!binaries) {
    throw new TranscriptError(
      "Local transcription isn't installed in this build. Run `npm run setup:local`."
    );
  }

  const scratch = await mkdtemp(path.join(tmpdir(), "readvideo-"));
  const wav = path.join(scratch, "audio.wav");
  const outBase = path.join(scratch, "out");

  try {
    await extractAudio(binaries.ffmpeg, source, wav, options.signal);

    const { code, stderr } = await runWhisper(
      binaries.cli,
      [
        "-m", binaries.model,
        "-f", wav,
        "-oj",                  // JSON beside the audio, with millisecond offsets
        "-of", outBase,
        "--print-progress",     // the only progress signal there is
        "--no-prints",          // ...without the model banner drowning it
      ],
      options
    );

    if (code !== 0) {
      const reason = stderr.trim().split("\n").at(-1) ?? `exit ${code}`;
      throw new TranscriptError(`Transcription failed: ${reason}`);
    }

    const parsed = JSON.parse(
      await readFile(`${outBase}.json`, "utf8")
    ) as WhisperJson;

    const segments: TranscriptSegment[] = (parsed.transcription ?? [])
      .map((segment) => {
        const from = segment.offsets?.from ?? 0;
        const to = segment.offsets?.to ?? from;
        return {
          text: (segment.text ?? "").trim(),
          offset: from,
          duration: Math.max(0, to - from),
        };
      })
      .filter((segment) => segment.text.length > 0);

    if (!segments.length) {
      throw new TranscriptError("No speech was found in this file.");
    }

    return {
      text: joinSegments(segments),
      segments,
      lang: parsed.result?.language,
    };
  } catch (err) {
    if (err instanceof TranscriptError) throw err;
    // An abort is the caller hanging up, not a failure worth relabelling.
    if ((err as Error).name === "AbortError") throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new TranscriptError(`Transcription failed: ${message}`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
