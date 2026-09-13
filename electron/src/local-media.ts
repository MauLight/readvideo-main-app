import { stat } from "node:fs/promises";
import path from "node:path";
import { MEDIA_EXTENSIONS } from "back-end/services/media";
import type { Source } from "back-end/services/source";

/**
 * Turns whatever was dropped into a decision: one article, or a playlist.
 *
 * The renderer can't do this — it's sandboxed with no fs — and it needs the
 * answer before starting, since article and playlist are different routes.
 */

export interface DropPlan {
  route: "articles" | "playlists";
  source: Source;
  /** For the UI to show before the manifest arrives. */
  title: string;
  count: number;
}

export interface DropRejection {
  route: null;
  reason: string;
}

function isMedia(file: string): boolean {
  return MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/** Longest shared directory, so a multi-file drop still has a sensible name. */
function commonParent(files: string[]): string {
  const dirs = files.map((file) => path.dirname(file));
  return dirs.every((dir) => dir === dirs[0]) ? dirs[0] : path.dirname(dirs[0]);
}

export async function planDrop(
  paths: unknown
): Promise<DropPlan | DropRejection> {
  const candidates = Array.isArray(paths)
    ? paths.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];

  if (!candidates.length) return { route: null, reason: "Nothing usable was dropped." };

  const directories: string[] = [];
  const files: string[] = [];

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) directories.push(candidate);
      else if (isMedia(candidate)) files.push(candidate);
    } catch {
      // Vanished between drop and stat, or unreadable — skip it rather than
      // failing a drop that has other usable entries.
    }
  }

  // A folder is a playlist on its own; the runner enumerates it, so mixing one
  // with loose files would need a merge step nothing asks for yet.
  if (directories.length === 1 && !files.length) {
    const dir = directories[0];
    return {
      route: "playlists",
      source: { kind: "file", ref: dir },
      title: path.basename(dir) || dir,
      count: 0, // unknown until the manifest is built
    };
  }

  if (directories.length > 1) {
    return { route: null, reason: "Drop one folder at a time." };
  }

  if (!files.length) {
    return { route: null, reason: "No video or audio files were found there." };
  }

  if (files.length === 1) {
    const file = files[0];
    return {
      route: "articles",
      source: { kind: "file", ref: file },
      title: path.basename(file, path.extname(file)),
      count: 1,
    };
  }

  const parent = commonParent(files);
  return {
    route: "playlists",
    source: { kind: "file", ref: parent, refs: files },
    title: path.basename(parent) || "Dropped files",
    count: files.length,
  };
}
