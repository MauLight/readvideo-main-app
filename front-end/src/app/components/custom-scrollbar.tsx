"use client";

import { useEffect, useRef, useState } from "react";
import { SquareArrowUp } from "lucide-react";

// Minimal custom scrollbar that replaces the native one for a scroll container.
// The container should hide its native scrollbar (scrollbar-hide). Render this
// as a sibling inside a `relative` wrapper; it sits at -right-4 by default.
// Visibility is left to the parent (render only when the container overflows).
export default function CustomScrollbar({
  scrollRef,
  offset = "-1rem",
  padY = "0",
  showScrollTop = false,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  // CSS value for the track's `right` (e.g. "-1rem", "8px", "0"). Defaults to -1rem.
  offset?: string;
  // Vertical inset for the track (top & bottom), e.g. "1rem". Defaults to 0.
  // Shrinks the track; the thumb math already respects the track height.
  padY?: string;
  // Adds a back-to-top button just below the track. Off by default.
  showScrollTop?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);
  const [thumb, setThumb] = useState({ height: 0, top: 0 });

  function syncThumb() {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const { scrollHeight, clientHeight, scrollTop } = el;
    const trackH = track.clientHeight;
    const thumbH = Math.max((clientHeight / scrollHeight) * trackH, 24);
    const maxScroll = scrollHeight - clientHeight;
    const maxTravel = trackH - thumbH;
    setThumb({
      height: thumbH,
      top: maxScroll > 0 ? (scrollTop / maxScroll) * maxTravel : 0,
    });
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncThumb();
    el.addEventListener("scroll", syncThumb);
    const observer = new ResizeObserver(syncThumb);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", syncThumb);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDragMove(e: PointerEvent) {
    const el = scrollRef.current;
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!el || !track || !drag) return;
    const { scrollHeight, clientHeight } = el;
    const thumbH = Math.max(
      (clientHeight / scrollHeight) * track.clientHeight,
      24,
    );
    const maxScroll = scrollHeight - clientHeight;
    const maxTravel = track.clientHeight - thumbH;
    const deltaY = e.clientY - drag.startY;
    // thumb pixels -> scroll pixels, scaled by the space available to scroll
    el.scrollTop = drag.startScroll + deltaY * (maxScroll / maxTravel);
  }

  function handleDragEnd() {
    dragRef.current = null;
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", handleDragEnd);
  }

  function handleDragStart(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { startY: e.clientY, startScroll: el.scrollTop };
    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragEnd);
    e.preventDefault();
  }

  function handleScrollTop() {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div
        ref={trackRef}
        style={{ right: offset, top: padY, bottom: padY }}
        className="absolute w-2.5 bg-gray-200 dark:bg-[#171717] rounded-full z-50"
      >
        <div
          onPointerDown={handleDragStart}
          style={{
            height: thumb.height,
            transform: `translateY(${thumb.top}px)`,
          }}
          className="w-full bg-gray-300 dark:bg-[#6d6d6d]/10 rounded-full cursor-grab active:cursor-grabbing"
        />
      </div>

      {showScrollTop && (
        // Sits just under the track, centred on the same 2.5-wide column.
        <button
          type="button"
          onClick={handleScrollTop}
          aria-label="Scroll to top"
          style={{ right: offset, bottom: `calc(${padY} - 2rem)` }}
          className="absolute z-50 -mr-1.5 flex items-center justify-center w-6 h-6 text-[#6d6d6d] hover:text-text cursor-pointer"
        >
          <SquareArrowUp className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
