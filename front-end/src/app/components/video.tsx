"use client";

import { useYouTubeLink } from "../hooks/useYouTubeLink";
import { useVideo } from "../context/video-context";
import { youtubeEmbedUrl } from "../lib/youtube";

export default function VideoComponent() {
  const link = useYouTubeLink();
  const { status, committed, playerRef } = useVideo();

  // The interactive player replaces the thumbnail once transcription starts.
  // Gated on `committed` too, so it unmounts in sync with the navbar on clear.
  const active =
    status === "loading" || status === "streaming" || status === "success";
  if (!link || !committed || !active) return null;

  // Register for the player's time updates (infoDelivery events), which the
  // Transcript listens to for synced highlighting.
  function handleLoad() {
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
      "https://www.youtube.com",
    );
  }

  return (
    <div className="z-10 w-full shrink-0 aspect-video border border-border-light dark:border-border-form rounded-lg overflow-hidden">
      <iframe
        ref={playerRef}
        onLoad={handleLoad}
        className="w-full h-full"
        src={`${youtubeEmbedUrl(link)}${link.kind === "playlist" ? "&" : "?"}enablejsapi=1`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
