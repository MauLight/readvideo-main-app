import { useVideo } from "../context/video-context";
import { parseYouTubeLink, YouTubeLink } from "../lib/youtube";

/**
 * What the current context URL points at — a video or a playlist, with its id —
 * or null when there's no valid link. Shared gate for the player, preview and
 * transcript.
 */
export function useYouTubeLink(): YouTubeLink | null {
  const { url } = useVideo();
  return url ? parseYouTubeLink(url) : null;
}
