import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { MEDIA_EXTENSIONS, probeDuration } from "./media.js";
import { Source } from "./source.js";
import { TranscriptError } from "./transcript.js";
import type { PlaylistData, PlaylistVideo } from "./playlist.js";

/**
 * A folder of recordings, or a handful of dropped files, read as a playlist.
 *
 * The YouTube equivalent is getPlaylistVideos; both produce PlaylistData, so
 * runPlaylist doesn't care which it got.
 */

/**
 * Lectures are named lecture-2, lecture-10 — plain string order puts 10 before
 * 2, which silently reorders a course. Numeric collation is the whole point.
 */
function naturalSort(a: string, b: string): number {
  return path
    .basename(a)
    .localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: "base" });
}

function isMedia(file: string): boolean {
  return MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/** Files named explicitly, or everything playable in a directory. */
async function collectFiles(source: Source): Promise<string[]> {
  if (source.refs?.length) return [...source.refs].sort(naturalSort);

  const entries = await readdir(source.ref, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isMedia(entry.name))
    // Finder and friends litter directories with these.
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => path.join(source.ref, entry.name))
    .sort(naturalSort);
}

export async function getFolderVideos(
  source: Source,
  ffmpeg: string,
  signal?: AbortSignal
): Promise<PlaylistData> {
  let files: string[];
  try {
    files = await collectFiles(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new TranscriptError(`Could not read that folder: ${message}`);
  }

  if (!files.length) {
    throw new TranscriptError("No video or audio files were found there.");
  }

  // Durations are only for the manifest's progress display, so a file that
  // won't probe becomes null rather than failing the whole run.
  const videos: PlaylistVideo[] = [];
  for (const [index, file] of files.entries()) {
    let durationSeconds: number | null = null;
    try {
      durationSeconds = await probeDuration(ffmpeg, file, signal);
    } catch {
      durationSeconds = null;
    }

    videos.push({
      index,
      source: { kind: "file", ref: file },
      title: path.basename(file, path.extname(file)),
      durationSeconds,
    });
  }

  const root = source.refs?.length ? path.dirname(files[0]) : source.ref;
  return {
    playlistId: root,
    title: path.basename(root) || "Local files",
    videos,
  };
}

/** True when this source names a directory rather than a single file. */
export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}
