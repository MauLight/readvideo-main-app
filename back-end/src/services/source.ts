import { getTranscriptData } from "./youtube.js";
import { TranscriptData, TranscriptError } from "./transcript.js";
import { transcribeFile, whisperAvailable } from "./whisper.js";

/**
 * Where a transcript comes from.
 *
 * The runners deal in this rather than a URL, so adding a source means adding
 * a case here and nothing else — the SSE contract, the reader and the article
 * prompt never learn there was a choice.
 */

export type SourceKind = "youtube" | "file";

export interface Source {
  kind: SourceKind;
  /** A YouTube URL for "youtube", an absolute path for "file". */
  ref: string;
}

/** Narrows unknown input from a request body or IPC payload. */
export function readSource(value: unknown): Source {
  const candidate = value as Partial<Source> | undefined;
  const ref = typeof candidate?.ref === "string" ? candidate.ref.trim() : "";
  if (!ref) throw new TranscriptError("A source 'ref' string is required.");

  if (candidate?.kind === "file") return { kind: "file", ref };
  if (candidate?.kind === "youtube") return { kind: "youtube", ref };

  throw new TranscriptError(
    `Unknown source kind "${String(candidate?.kind)}". Expected youtube or file.`
  );
}

export interface ResolveOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Produces a transcript however this source requires one.
 *
 * Captions come back in a round trip; a local file has to be decoded and run
 * through Whisper, which takes minutes — hence onProgress, which the caption
 * path simply never calls.
 */
export async function resolveTranscript(
  source: Source,
  options: ResolveOptions = {}
): Promise<TranscriptData> {
  if (source.kind === "youtube") return getTranscriptData(source.ref);

  if (!whisperAvailable()) {
    throw new TranscriptError(
      "This build can't transcribe local files. Run `npm run setup:local`, then rebuild."
    );
  }

  return transcribeFile(source.ref, options);
}

/** A YouTube URL for a video id — the one place that shape is rebuilt. */
export function youtubeSource(videoId: string): Source {
  return { kind: "youtube", ref: `https://www.youtube.com/watch?v=${videoId}` };
}
