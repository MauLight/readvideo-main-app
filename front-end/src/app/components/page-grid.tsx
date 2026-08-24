"use client";

import { ReactNode, useEffect, useState } from "react";
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
  const { committed } = useVideo();
  const [twoColumn, setTwoColumn] = useState(false);

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
    </div>
  );
}
