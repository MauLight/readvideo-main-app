import { resolveTranscript } from "../services/source.js";
import { streamArticle } from "../services/openai.js";
import { Emit, RunInput, ValidationError } from "./types.js";

/**
 * One source -> one streamed article.
 *
 *   progress   -> { fraction }    (local files only, while transcribing)
 *   transcript -> { style, transcript, segments }
 *   chunk      -> { text }        (repeated)
 *   done       -> {}
 *   error      -> { error }       (generation failed mid-stream)
 *
 * Throws before the first emit when the URL is unusable or has no transcript.
 */
export async function runArticle(
  { source, style, keys }: RunInput,
  emit: Emit,
  signal: AbortSignal
): Promise<void> {
  if (!source.ref.trim()) {
    throw new ValidationError("A source is required.");
  }

  // Before the line: a transcript failure is still a clean, statusable error.
  // Transcribing a local file takes minutes, so it reports as it goes — the
  // caption path resolves in one round trip and never emits this.
  const transcript = await resolveTranscript(source, {
    signal,
    onProgress: (fraction) => emit("progress", { fraction }),
  });

  emit("transcript", {
    style,
    transcript: transcript.text,
    segments: transcript.segments,
  });

  try {
    for await (const delta of streamArticle(
      transcript.text,
      style,
      keys.openai,
      signal
    )) {
      emit("chunk", { text: delta });
    }
    emit("done", {});
  } catch (err) {
    if (signal.aborted) return; // caller hung up; nothing to report
    console.error("Article streaming failed:", err);
    emit("error", { error: "Failed to generate the article." });
  }
}
