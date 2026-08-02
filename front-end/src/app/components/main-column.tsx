"use client";

import { AnimatePresence, motion } from "motion/react";
import { useVideo } from "../context/video-context";
import Navbar from "./navbar";
import KeysButton from "./keys-button";
import VideoComponent from "./video";
import Transcript from "./transcript";

export default function MainColumn() {
  const { committed } = useVideo();

  // Stable full-height container: only the vertical alignment changes, so the
  // input's move-to-center animation runs without its container resizing.
  return (
    <div
      className={`relative col-span-1 flex h-full min-h-0 flex-col px-20 ${
        committed ? "justify-start gap-y-5 pt-4" : "justify-center pb-40"
      }`}
    >
      {/* Opening screen only — fades out as generation takes over the layout. */}
      <AnimatePresence>
        {!committed && (
          <motion.div
            key="keys"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="absolute top-4 left-20 z-20"
          >
            <KeysButton />
          </motion.div>
        )}
      </AnimatePresence>

      <Navbar />
      <VideoComponent />
      <Transcript />
    </div>
  );
}
