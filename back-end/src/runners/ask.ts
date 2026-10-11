import { streamAnswer } from "../services/openai.js";
import { AskInput, Emit, ValidationError } from "./types.js";

/**
 * One question about an existing transcript -> one streamed answer.
 *
 *   chunk -> { text }        (repeated)
 *   done  -> {}
 *   error -> { error }       (generation failed mid-stream)
 *
 * Deliberately the same frame vocabulary as runArticle, so the renderer's
 * chunk-accumulating parser works unchanged.
 *
 * Throws before the first emit when there is nothing to answer from or
 * nothing to answer.
 */
export async function runAsk(
  { transcript, messages, keys }: AskInput,
  emit: Emit,
  signal: AbortSignal
): Promise<void> {
  if (!transcript.trim()) {
    throw new ValidationError("A transcript is required to ask about it.");
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) {
    throw new ValidationError("The last message must be the user's question.");
  }

  try {
    for await (const delta of streamAnswer(
      transcript,
      messages,
      keys.openai,
      signal
    )) {
      emit("chunk", { text: delta });
    }
    emit("done", {});
  } catch (err) {
    if (signal.aborted) return; // caller hung up; nothing to report
    console.error("Answer streaming failed:", err);
    emit("error", { error: "Failed to answer the question." });
  }
}
