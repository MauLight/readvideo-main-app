import { getTranscriptData } from "../services/youtube.js";
import { streamArticle } from "../services/openai.js";
import { Emit, RunInput, ValidationError } from "./types.js";

/**
 * One video -> one streamed article.
 *
 *   transcript -> { style, transcript, segments }
 *   chunk      -> { text }        (repeated)
 *   done       -> {}
 *   error      -> { error }       (generation failed mid-stream)
 *
 * Throws before the first emit when the URL is unusable or has no transcript.
 */
export async function runArticle(
  { url, style, keys }: RunInput,
  emit: Emit,
  signal: AbortSignal
): Promise<void> {
  if (!url.trim()) {
    throw new ValidationError("A YouTube 'url' string is required.");
  }

  // Before the line: a transcript failure is still a clean, statusable error.
  const transcript = await getTranscriptData(url);

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
