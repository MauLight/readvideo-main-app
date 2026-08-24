"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useYouTubeLink } from "../hooks/useYouTubeLink";
import { useVideo } from "../context/video-context";
import { Segment } from "../lib/api";
import CustomScrollbar from "./custom-scrollbar";

// offset is milliseconds -> "m:ss" (or "h:mm:ss" for long videos).
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

interface SegmentRowProps {
  segment: Segment;
  onSeek: (seconds: number) => void;
  active: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
}

function SegmentRow({ segment, onSeek, active, rowRef }: SegmentRowProps) {
  function handleClick() {
    onSeek(segment.offset / 1000);
  }

  return (
    <div
      ref={rowRef}
      onClick={handleClick}
      className={`z-10 flex gap-x-3 h-10 items-center px-5 rounded-md cursor-pointer ${
        active
          ? "bg-[#337fc5]"
          : "bg-[#dddddd] hover:bg-[#c9c9c9] dark:bg-border-form dark:hover:bg-[#222222]"
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        className={`shrink-0 text-[0.8rem] tabular-nums cursor-pointer ${
          active
            ? "text-[#1d1c1b] dark:text-text"
            : "text-[#787879] hover:text-[#337fc5]"
        }`}
      >
        {formatTimestamp(segment.offset)}
      </button>
      <p
        className={`whitespace-pre-wrap leading-relaxed text-[0.9rem] ${
          active
            ? "text-[#1d1c1b] dark:text-text"
            : "text-[#464647] dark:text-[#b8b8b9] font-medium"
        }`}
      >
        {segment.text}
      </p>
    </div>
  );
}

export default function Transcript() {
  const link = useYouTubeLink();
  const { segments, seekTo, committed } = useVideo();
  const [sync, setSync] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track the player's playback time via the iframe's postMessage events.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.includes("youtube.com")) return;
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (
        data?.event === "infoDelivery" &&
        typeof data.info?.currentTime === "number"
      ) {
        setCurrentTime(data.info.currentTime);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The last segment whose start time has been reached.
  const ms = currentTime * 1000;
  const activeOffset = useMemo(() => {
    if (!segments) return null;
    let found: number | null = null;
    for (const segment of segments) {
      if (ms >= segment.offset) found = segment.offset;
      else break;
    }
    return found;
  }, [segments, ms]);

  // Keep the active segment scrolled into view while syncing.
  useEffect(() => {
    if (sync && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [activeOffset, sync]);

  function handleToggle() {
    setSync((prev) => !prev);
  }

  if (!link || !committed || !segments?.length) return null;

  return (
    <div className="relative w-full h-full">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto scrollbar-hide border border-[#e9e9e9] dark:border-border-form rounded-lg p-4 bg-[#ededed] dark:bg-[#0d0d0d] z-10"
      >
        <div className="sticky -top-5 z-20 -mx-4 -mt-4 mb-2 px-4 pt-4 pb-3  flex items-center backdrop-blur-xs justify-between">
          <span className="text-[#484849] dark:text-[#b8b8b9] z-10">
            Transcript
          </span>
          <button
            type="button"
            onClick={handleToggle}
            className={`rounded-[10px] text-[0.9rem] px-4 h-9 border cursor-pointer z-10 ${
              sync
                ? "bg-[#337fc5] text-text border-[#337fc5]"
                : "border-border bg-border text-[#b8b8b9] hover:text-text"
            }`}
          >
            Sync {sync ? "on" : "off"}
          </button>
          <div className="absolute z-0 top-0 left-0 w-full h-full bg-linear-to-b from-[#ededed] dark:from-[#0d0d0d] from-30% to-transparent"></div>
        </div>
        <div className="flex flex-col gap-y-2">
          {segments.map((segment) => {
            const active = sync && segment.offset === activeOffset;
            return (
              <SegmentRow
                key={segment.offset}
                segment={segment}
                onSeek={seekTo}
                active={active}
                rowRef={active ? activeRowRef : undefined}
              />
            );
          })}
        </div>
      </div>
      <CustomScrollbar scrollRef={scrollRef} />
    </div>
  );
}
