import { net } from "electron";

/**
 * oEmbed lookups, run in main.
 *
 * These used to live in the renderer, but YouTube's oEmbed endpoint reflects
 * the request Origin rather than sending `*`, so calling it from the page
 * would depend on YouTube accepting whatever origin the app presents. Main has
 * no origin at all, so the question disappears.
 *
 * Uses Electron's net module rather than global fetch: it goes through
 * Chromium's stack, so it picks up system proxy settings.
 */

export interface YouTubeTarget {
  kind: "video" | "playlist";
  id: string;
}

export interface YouTubeMeta {
  title: string;
  author: string;
  thumbnail: string;
}

// Same alphabet the client and backend parsers accept. The renderer validates
// before calling, but main re-checks because it's an IPC boundary.
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function isTarget(value: unknown): value is YouTubeTarget {
  if (typeof value !== "object" || value === null) return false;
  const { kind, id } = value as Record<string, unknown>;
  return (
    (kind === "video" || kind === "playlist") &&
    typeof id === "string" &&
    ID.test(id)
  );
}

/** The canonical youtube.com URL a target points at. */
function youtubeUrl(target: YouTubeTarget): string {
  return target.kind === "playlist"
    ? `https://www.youtube.com/playlist?list=${target.id}`
    : `https://www.youtube.com/watch?v=${target.id}`;
}

function oembedUrl(target: YouTubeTarget): string {
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(
    youtubeUrl(target)
  )}&format=json`;
}

interface OembedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/**
 * Fetches oEmbed for a target. Returns null when the target doesn't exist, is
 * private, or the reply isn't usable JSON — all of which mean the same thing
 * to the caller.
 */
async function fetchOembed(
  target: YouTubeTarget
): Promise<OembedResponse | null> {
  const res = await net.fetch(oembedUrl(target));
  if (!res.ok) return null;

  try {
    return (await res.json()) as OembedResponse;
  } catch {
    return null;
  }
}

/** True for a real, embeddable video or playlist. */
export async function verifyTarget(value: unknown): Promise<boolean> {
  if (!isTarget(value)) return false;
  return (await fetchOembed(value)) !== null;
}

/**
 * Display metadata for a video or a playlist. For a playlist the thumbnail is
 * simply its first video; oEmbed offers no item count or duration.
 */
export async function targetMeta(value: unknown): Promise<YouTubeMeta | null> {
  if (!isTarget(value)) return null;

  const data = await fetchOembed(value);
  if (!data?.title) return null;

  return {
    title: data.title,
    author: data.author_name ?? "",
    thumbnail: data.thumbnail_url ?? "",
  };
}
