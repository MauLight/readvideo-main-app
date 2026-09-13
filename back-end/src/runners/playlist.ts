import { resolveTranscript } from "../services/source.js";
import { TranscriptError } from "../services/transcript.js";
import { streamArticle } from "../services/openai.js";
import { getPlaylistVideos } from "../services/playlist.js";
import { getFolderVideos } from "../services/folder.js";
import { whisperBinaries } from "../services/whisper.js";
import { Emit, RunInput, ValidationError } from "./types.js";

/**
 * A playlist -> one streamed article per item, in order.
 *
 * The playlist is either a YouTube list or a local folder; past the manifest
 * the two are indistinguishable.
 *
 *   playlist   -> { playlistId, title, total, style, items }
 *   item_start -> { index, source, title }
 *   chunk      -> { index, text }        (repeated per item)
 *   item_done  -> { index, status: "ok" }
 *   item_error -> { index, status: "no_transcript" | "error", error }
 *   done       -> { completed, skipped }
 *
 * A video without captions is skipped and the run continues; only failures
 * before the manifest are thrown.
 */
/**
 * Where the item list comes from. Kept here rather than in services/source.ts
 * to avoid a cycle: services/playlist.ts already imports from there.
 */
async function resolvePlaylist(
  source: RunInput["source"],
  youtubeKey: string | undefined,
  signal: AbortSignal
) {
  if (source.kind === "youtube") {
    return getPlaylistVideos(source.ref, youtubeKey);
  }

  const binaries = whisperBinaries();
  if (!binaries) {
    throw new ValidationError(
      "This build can't read local folders. Run `npm run setup:local`, then rebuild."
    );
  }
  return getFolderVideos(source, binaries.ffmpeg, signal);
}

export async function runPlaylist(
  { source: playlistSource, style, keys }: RunInput,
  emit: Emit,
  signal: AbortSignal
): Promise<void> {
  if (!playlistSource.ref.trim()) {
    throw new ValidationError("A playlist source is required.");
  }

  // Before the line: resolve the playlist so failures stay statusable.
  const playlist = await resolvePlaylist(playlistSource, keys.youtube, signal);

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
      source: video.source,
      title: video.title,
    });

    let transcript;
    try {
      transcript = await resolveTranscript(video.source, {
        signal,
        onProgress: (fraction) =>
          emit("progress", { index: video.index, fraction }),
      });
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
