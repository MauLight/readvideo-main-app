import { getTranscriptData, TranscriptError } from "../services/youtube.js";
import { streamArticle } from "../services/openai.js";
import { getPlaylistVideos } from "../services/playlist.js";
import { Emit, RunInput, ValidationError } from "./types.js";

/**
 * A playlist -> one streamed article per video, in order.
 *
 *   playlist   -> { playlistId, title, total, style, items }
 *   item_start -> { index, videoId, title }
 *   chunk      -> { index, text }        (repeated per item)
 *   item_done  -> { index, status: "ok" }
 *   item_error -> { index, status: "no_transcript" | "error", error }
 *   done       -> { completed, skipped }
 *
 * A video without captions is skipped and the run continues; only failures
 * before the manifest are thrown.
 */
export async function runPlaylist(
  { url, style, keys }: RunInput,
  emit: Emit,
  signal: AbortSignal
): Promise<void> {
  if (!url.trim()) {
    throw new ValidationError("A YouTube playlist 'url' string is required.");
  }

  // Before the line: resolve the playlist so failures stay statusable.
  const playlist = await getPlaylistVideos(url, keys.youtube);

  emit("playlist", {
    playlistId: playlist.playlistId,
    title: playlist.title,
    total: playlist.videos.length,
    style,
    items: playlist.videos,
  });

  let completed = 0;
  let skipped = 0;

  for (const video of playlist.videos) {
    if (signal.aborted) break;

    emit("item_start", {
      index: video.index,
      videoId: video.videoId,
      title: video.title,
    });

    let transcript;
    try {
      transcript = await getTranscriptData(
        `https://www.youtube.com/watch?v=${video.videoId}`
      );
    } catch (err) {
      skipped++;
      const status = err instanceof TranscriptError ? "no_transcript" : "error";
      const message =
        err instanceof Error ? err.message : "Failed to fetch transcript.";
      emit("item_error", { index: video.index, status, error: message });
      continue;
    }

    try {
      for await (const delta of streamArticle(
        transcript.text,
        style,
        keys.openai,
        signal
      )) {
        emit("chunk", { index: video.index, text: delta });
      }
      completed++;
      emit("item_done", { index: video.index, status: "ok" });
    } catch (err) {
      if (signal.aborted) break; // caller hung up
      skipped++;
      console.error(`Playlist item ${video.index} generation failed:`, err);
      emit("item_error", {
        index: video.index,
        status: "error",
        error: "Failed to generate the article.",
      });
    }
  }

  // No `done` on abort — the caller already knows it stopped.
  if (!signal.aborted) {
    emit("done", { completed, skipped });
  }
}
