export class PlaylistError extends Error {}

export interface PlaylistVideo {
  /** Position in the playlist (0-based). */
  index: number;
  videoId: string;
  title: string;
  /** Video length in seconds, or null if it couldn't be read. */
  durationSeconds: number | null;
}

export interface PlaylistData {
  playlistId: string;
  title: string;
  videos: PlaylistVideo[];
}

const API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Extracts the playlist id from a YouTube URL:
 *   https://www.youtube.com/playlist?list=PLAYLIST_ID
 *   https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
 * Returns null when no list id can be found.
 */
export function extractPlaylistId(url: string): string | null {
  try {
    return new URL(url).searchParams.get("list");
  } catch {
    return null;
  }
}

/** Parses an ISO 8601 duration like "PT1H2M3S" or "PT9M52S" into seconds. */
function parseIso8601Duration(iso: string): number | null {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [hours, minutes, seconds] = match.slice(1).map((v) => Number(v ?? 0));
  return hours * 3600 + minutes * 60 + seconds;
}

/** Calls a YouTube Data API endpoint and returns the parsed JSON. */
async function callApi(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string
): Promise<any> {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message ?? `HTTP ${res.status}`;
    const reason = data?.error?.errors?.[0]?.reason;
    throw new PlaylistError(
      `YouTube API error: ${message}${reason ? ` (${reason})` : ""}`
    );
  }
  return data;
}

/**
 * Resolves a playlist URL into its ordered list of videos (id, title,
 * duration) via the YouTube Data API. Paginates so playlists larger than one
 * page load fully. Throws PlaylistError with a client-friendly message.
 */
export async function getPlaylistVideos(
  url: string,
  apiKey: string | undefined
): Promise<PlaylistData> {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    throw new PlaylistError("Could not parse a YouTube playlist id from the URL.");
  }
  if (!apiKey) {
    throw new PlaylistError("A YouTube Data API key is required for playlists.");
  }

  try {
    // 1. Playlist title (and existence check).
    const info = await callApi(
      "playlists",
      { part: "snippet", id: playlistId, maxResults: "1" },
      apiKey
    );
    if (!info.items?.length) {
      throw new PlaylistError("Playlist not found or is private.");
    }
    const title: string = info.items[0].snippet?.title ?? "Untitled playlist";

    // 2. Video ids + order, paginated.
    const collected: { videoId: string; title: string; position: number }[] = [];
    let pageToken: string | undefined;
    do {
      const page = await callApi(
        "playlistItems",
        {
          part: "contentDetails,snippet",
          playlistId,
          maxResults: "50",
          ...(pageToken ? { pageToken } : {}),
        },
        apiKey
      );
      for (const item of page.items ?? []) {
        const videoId: string | undefined = item.contentDetails?.videoId;
        const itemTitle: string = item.snippet?.title ?? "";
        // Skip deleted/private placeholders.
        if (!videoId || itemTitle === "Deleted video" || itemTitle === "Private video") {
          continue;
        }
        collected.push({
          videoId,
          title: itemTitle,
          position: item.snippet?.position ?? collected.length,
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    if (!collected.length) {
      throw new PlaylistError("The playlist has no accessible videos.");
    }

    // 3. Durations, batched 50 ids per videos.list call.
    const durations = new Map<string, number | null>();
    for (let i = 0; i < collected.length; i += 50) {
      const batch = collected.slice(i, i + 50);
      const details = await callApi(
        "videos",
        {
          part: "contentDetails",
          id: batch.map((v) => v.videoId).join(","),
        },
        apiKey
      );
      for (const v of details.items ?? []) {
        durations.set(v.id, parseIso8601Duration(v.contentDetails?.duration ?? ""));
      }
    }

    // 4. Order by playlist position and assemble.
    collected.sort((a, b) => a.position - b.position);
    const videos: PlaylistVideo[] = collected.map((v, index) => ({
      index,
      videoId: v.videoId,
      title: v.title,
      durationSeconds: durations.get(v.videoId) ?? null,
    }));

    return { playlistId, title, videos };
  } catch (err) {
    if (err instanceof PlaylistError) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new PlaylistError(`Failed to load playlist: ${message}`);
  }
}
