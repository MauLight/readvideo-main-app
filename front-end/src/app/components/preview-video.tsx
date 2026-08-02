"use client";

import Image from "next/image";
import { useVideo } from "../context/video-context";
import { useYouTubeLink } from "../hooks/useYouTubeLink";

export default function PreviewVideo() {
  const link = useYouTubeLink();
  const { status, meta, clearInput } = useVideo();

  // Shown only in the centered pre-transcription state.
  if (!link || !meta || status !== "preview") return null;

  return (
    <div className="relative w-full flex gap-10 border border-border-form rounded-lg overflow-hidden bg-[#0d0d0d]">
      <div className="w-70 aspect-video relative">
        <Image
          src={meta.thumbnail}
          alt={meta.title}
          fill
          className="object-cover"
        />
      </div>
      <div className="flex flex-col justify-center">
        <h2 className="text-subheader font-semibold text-text">{meta.title}</h2>
        <p className="text-small text-text2">{meta.author}</p>
      </div>
      <button
        type="button"
        onClick={clearInput}
        aria-label="Clear video"
        className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full text-text2 hover:text-text hover:bg-white/10 cursor-pointer"
      >
        ✕
      </button>
    </div>
  );
}
