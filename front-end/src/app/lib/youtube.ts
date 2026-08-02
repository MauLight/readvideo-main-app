import { abortError, requireDesktop } from "./desktop";

/**
 * YouTube URL validation.
 *
 * Everything speaks one shape: YouTubeLink, a { kind, id } pair covering both
 * videos and playlists.
 *
 * Two layers:
 *   1. parseYouTubeLink — synchronous, cheap, and local. Works out what the URL
 *      points at, or returns null if it isn't a YouTube URL.
 *   2. verifyYouTubeLink / fetchVideoMeta — oEmbed lookups, run in the main
 *      process. oEmbed reflects the request Origin rather than sending `*`, so
 *      calling it from the renderer would be at the mercy of YouTube's rules
 *      for whatever origin Electron presents. Main has no origin at all.
 *
 * parseYouTubeLink is deliberately mirrored by extractVideoId in the backend:
 * anything accepted here must parse there too.
 */

// YouTube video ids are exactly 11 chars of [A-Za-z0-9_-].
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Hosts we accept, so "notyoutube.com" can't sneak through.
const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

// Playlist ids are far less uniform than video ids (PL…, UU…, OLAK5uy_…,
// RD… mixes), so this only checks the alphabet and a plausible length.
const PLAYLIST_ID = /^[A-Za-z0-9_-]{12,50}$/;

export type YouTubeKind = "video" | "playlist";

export interface YouTubeLink {
  kind: YouTubeKind;
  /** Video id when kind is "video", playlist id when kind is "playlist". */
  id: string;
}

/**
 * Parses a YouTube URL into what it points at. Returns null if the input
 * isn't a YouTube URL we recognise.
 *
 * A watch URL with ?list= counts as a video — it plays one video that happens
 * to sit in a list. Only /playlist targets the list itself.
 */
export function parseYouTubeLink(input: string): YouTubeLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    // Tolerate URLs pasted without a scheme (e.g. "youtu.be/abc").
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return null;

  const videoId = extractVideoId(url, host);
  const onPlaylistPath = url.pathname.split("/").filter(Boolean)[0] === "playlist";
  if (videoId && !onPlaylistPath) return { kind: "video", id: videoId };

  const list = url.searchParams.get("list");
  if (list && PLAYLIST_ID.test(list)) return { kind: "playlist", id: list };

  return null;
}

function extractVideoId(url: URL, host: string): string | null {
  // youtu.be/<id>
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return VIDEO_ID.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v && VIDEO_ID.test(v)) return v;

  // youtube.com/{embed,shorts,live,v}/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && ["embed", "shorts", "live", "v"].includes(segments[0])) {
    return VIDEO_ID.test(segments[1]) ? segments[1] : null;
  }

  return null;
}

/** The canonical youtube.com URL a link points at. */
export function youtubeUrl(link: YouTubeLink): string {
  return link.kind === "playlist"
    ? `https://www.youtube.com/playlist?list=${link.id}`
    : `https://www.youtube.com/watch?v=${link.id}`;
}

/** The iframe embed URL for a link — a playlist plays as a videoseries. */
export function youtubeEmbedUrl(link: YouTubeLink): string {
  return link.kind === "playlist"
    ? `https://www.youtube.com/embed/videoseries?list=${link.id}`
    : `https://www.youtube.com/embed/${link.id}`;
}

/**
 * The bridge has no AbortSignal — IPC calls aren't cancellable — so a late
 * reply from a superseded check is discarded here instead. Callers already
 * ignore AbortError, so they need no changes.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/**
 * Confirms the target exists, via oEmbed in the main process.
 * Resolves true for a real, embeddable video or playlist; false otherwise.
 * Pass an AbortSignal to discard checks superseded by newer input.
 */
export async function verifyYouTubeLink(
  link: YouTubeLink,
  signal?: AbortSignal
): Promise<boolean> {
  throwIfAborted(signal);
  const exists = await requireDesktop().youtube.verify(link);
  throwIfAborted(signal);
  return exists;
}

export interface VideoMeta {
  title: string;
  author: string;
  thumbnail: string;
}

/**
 * Fetches display metadata (title, channel, thumbnail) for either a video or a
 * playlist. Returns null if the target isn't available. No API key required —
 * oEmbed is public, it just can't be called from the renderer's origin.
 *
 * Note oEmbed gives no item count or duration for a playlist — the thumbnail
 * is simply its first video.
 */
export async function fetchVideoMeta(
  link: YouTubeLink,
  signal?: AbortSignal
): Promise<VideoMeta | null> {
  throwIfAborted(signal);
  const meta = await requireDesktop().youtube.meta(link);
  throwIfAborted(signal);
  return meta;
}
