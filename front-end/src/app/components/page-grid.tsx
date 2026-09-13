"use client";

import { DragEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useVideo } from "../context/video-context";
import Graphic from "./graphic";
import BgAnimation from "./bg-animation";

/** Kept in step with the `fade` duration in academic-text / playlist-text. */
const READER_FADE_MS = 800;

/**
 * The page's grid shell, split out because Home is a Server Component and
 * can't read the video context itself — same reason ReaderPane exists.
 *
 * One column until Transcribe is pressed. `committed` flips on the press
 * itself rather than when generation starts, so the split runs with the
 * navbar's move-to-top instead of lagging behind it.
 */
export default function PageGrid({ children }: { children: ReactNode }) {
  const { committed, capabilities, startDrop, dropError } = useVideo();
  const [twoColumn, setTwoColumn] = useState(false);
  const [dragging, setDragging] = useState(false);
  // dragenter/leave fire for every child the pointer crosses, so a boolean
  // flickers. Counting entries against leaves is the standard fix.
  const dragDepth = useRef(0);

  const canDrop = capabilities?.localTranscription === true;

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canDrop) return;
      // Only file drags; a text selection dragged across the window isn't one.
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    [canDrop]
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canDrop || !event.dataTransfer.types.includes("Files")) return;
      // Without this the browser refuses the drop entirely.
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [canDrop]
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canDrop) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      startDrop(Array.from(event.dataTransfer.files));
    },
    [canDrop, startDrop]
  );

  // Splitting happens at once, collapsing waits. `committed` clears the moment
  // the input does, but the reader pane is still fading for another 0.8s —
  // dropping to one column right away reflows the article to full width
  // mid-fade, which reads as the left panel leaving first.
  useEffect(() => {
    if (committed) {
      setTwoColumn(true);
      return;
    }

    const timer = window.setTimeout(() => setTwoColumn(false), READER_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [committed]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative h-full w-full grid grid-rows-1 ${
        twoColumn ? "grid-cols-2" : "grid-cols-1"
      }`}
    >
      {children}

      {/* Opening screen only — unmounts on Transcribe, so the WebThreads
          canvas stops animating once the workspace takes over.

          Timing matches the `fade` in academic-text / playlist-text: those run
          an 0.8s exit when status leaves their branches, so returning at zero
          duration popped this in over an article still fading out. */}
      <AnimatePresence>
        {!committed && (
          <motion.div
            key="opening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute top-0 left-0 w-full h-full flex justify-center items-center"
          >
            <Graphic />
            <div className="absolute w-full h-full bg-[#fff6f6]/25 dark:bg-[#16161f]/50 z-10" />
            <BgAnimation />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop affordance. Only rendered while dragging, so it never sits in
          front of the app — and never at all in a build without the local
          stack, where a dropped file could only be refused. */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none"
          >
            <div className="rounded-2xl border-2 border-dashed border-[#2f945f] px-12 py-10 text-center">
              <p className="text-subheader font-semibold text-text">Drop to transcribe</p>
              <p className="text-small text-text2 mt-1">
                A file becomes an article. Several, or a folder, become chapters.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A refusal needs saying — silence would read as the drop being ignored. */}
      <AnimatePresence>
        {dropError && (
          <motion.div
            key="drop-error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-100 rounded-lg border border-border bg-[#191919] px-4 py-2 text-small text-text2"
          >
            {dropError}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
