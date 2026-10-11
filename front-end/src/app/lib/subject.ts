import type { Chapter } from "../context/video-context";

/**
 * The text a conversation is grounded on: one video's transcript, or a whole
 * playlist's, stitched into one document with chapter headings.
 *
 * Still no retrieval. Ten 30-minute lectures come to roughly 60k tokens
 * against a 128k context, so the entire course fits — and questions like "where
 * does he first mention X?" need all of it, which is exactly what a top-k
 * retriever would not supply.
 */

/**
 * Where it stops fitting. ~90k tokens at four characters each, leaving room
 * for the conversation and the answer. Past this the model would reject the
 * request outright, so the text is trimmed rather than the call failing.
 */
const MAX_SUBJECT_CHARS = 360_000;

/** Cut at a word boundary when one is close, so a sentence doesn't end mid-word. */
function trimTo(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > limit * 0.9 ? cut.slice(0, lastSpace) : cut;
}

function heading(chapter: Chapter): string {
  return `## Chapter ${chapter.index + 1}: ${chapter.title}`;
}

/**
 * Every chapter gets an equal share of the budget rather than the first few
 * getting all of it.
 *
 * A course-wide question ("does she ever revisit the opening claim?") is better
 * served by partial coverage of every chapter than by complete coverage of the
 * first three and silence about the rest. The marker is left in so the model
 * can say the text was cut instead of concluding something is absent.
 */
function joinWithinBudget(chapters: Chapter[]): string {
  const withText = chapters.filter((chapter) => chapter.transcript?.trim());
  if (!withText.length) return "";

  const headings = withText.reduce(
    (total, chapter) => total + heading(chapter).length + 2,
    0
  );
  const share = Math.floor(
    Math.max(0, MAX_SUBJECT_CHARS - headings) / withText.length
  );

  return withText
    .map((chapter) => {
      const text = chapter.transcript as string;
      const body =
        text.length <= share
          ? text
          : `${trimTo(text, share)}\n[This chapter's transcript was truncated to fit.]`;
      return `${heading(chapter)}\n${body}`;
    })
    .join("\n\n");
}

/**
 * Null when there is nothing to ask about yet.
 *
 * A playlist only counts once its run has finished: mid-run the subject grows
 * with every chapter, so an answer would silently be about however much had
 * arrived when the question was sent.
 */
export function buildSubject(
  transcript: string | null,
  chapters: Chapter[],
  playlistRunning: boolean
): string | null {
  if (chapters.length > 0) {
    if (playlistRunning) return null;
    return joinWithinBudget(chapters) || null;
  }
  return transcript?.trim() ? transcript : null;
}
