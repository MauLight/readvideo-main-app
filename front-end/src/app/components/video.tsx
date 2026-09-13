"use client";

import { useYouTubeLink } from "../hooks/useYouTubeLink";
import { useVideo } from "../context/video-context";
import { requireDesktop } from "../lib/desktop";
import { youtubeEmbedUrl } from "../lib/youtube";

export default function VideoComponent() {
  const link = useYouTubeLink();
  const { status, committed, playerRef, activeLocalRef, videoRef, setCurrentTime } =
    useVideo();

  // The interactive player replaces the thumbnail once transcription starts.
  // Gated on `committed` too, so it unmounts in sync with the navbar on clear.
  const active =
    status === "loading" || status === "streaming" || status === "success";
  if (!committed || !active) return null;

  // A dropped file has no YouTube link, so this branch comes first.
  if (activeLocalRef) return <LocalPlayer />;
  if (!link) return null;

  // Register for the player's time updates (infoDelivery events), which the
  // video context listens to for synced highlighting.
  function handleLoad() {
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
      "https://www.youtube.com"
    );
  }

  return (
    <div className="z-10 w-full aspect-video border border-border-light dark:border-border-form rounded-lg overflow-hidden">
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

  /**
   * A real element, so seeking is a property assignment rather than a
   * postMessage. It loads over a custom scheme because Chromium refuses
   * file:// from the http origin the renderer is served on.
   */
  function LocalPlayer() {
    function handleTimeUpdate(event: React.SyntheticEvent<HTMLVideoElement>) {
      setCurrentTime(event.currentTarget.currentTime);
    }

    return (
      <div className="z-10 w-full aspect-video border border-border-light dark:border-border-form rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          onTimeUpdate={handleTimeUpdate}
          className="w-full h-full"
          src={requireDesktop().files.mediaUrl(activeLocalRef as string)}
          controls
          preload="metadata"
        />
      </div>
    );
  }
}
