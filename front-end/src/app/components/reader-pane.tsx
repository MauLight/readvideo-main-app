"use client";

import { useVideo } from "../context/video-context";
import AcademicText from "./academic-text";
import PlaylistText from "./playlist-text";

/**
 * Client-side switch between the single-article and playlist readers, since
 * Home is a Server Component and can't read the video context itself.
 *
 * Keyed off `chapters` rather than the link kind: chapters only exist once a
 * playlist manifest has arrived, so a single video can never land here.
 */
export default function ReaderPane() {
  const { chapters } = useVideo();

  return chapters.length > 0 ? <PlaylistText /> : <AcademicText />;
}
