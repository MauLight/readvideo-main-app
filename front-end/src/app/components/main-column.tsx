"use client";

import { AnimatePresence, motion } from "motion/react";
import { useVideo } from "../context/video-context";
import Navbar from "./navbar";
import KeysButton from "./keys-button";
import ThemeButton from "./theme-button";
import VideoComponent from "./video";
import Transcript from "./transcript";
import MessageList from "./message-list";
import { useChat } from "../context/chat-context";
import Intelligencebar from "./Intelligencebar";

export default function MainColumn() {
  const { committed } = useVideo();
  const { active: asking } = useChat();

  // Stable full-height container: only the vertical alignment changes, so the
  // input's move-to-center animation runs without its container resizing.
  //
  // Navbar and video are shrink-0 and the transcript takes what is left: it is
  // the only child that scrolls, so it is the only one that should absorb the
  // leftover height. Letting it size itself instead squeezed the video.
  return (
    <div
      className={`relative col-span-1 flex h-full min-h-0 flex-col px-20 bg-[#f8f7f9] dark:bg-[#181719] ${
        committed ? "justify-start gap-y-5 pt-4 pb-20" : "justify-end pb-20"
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
            className="absolute top-4 left-20 z-20 flex items-center gap-2"
          >
            <KeysButton />
            <ThemeButton />
          </motion.div>
        )}
      </AnimatePresence>

      <Navbar />
      {committed && <Intelligencebar />}
      {/* Asking takes the pane over: the video and transcript go, the
          conversation arrives in their place. "Back to video" in MessageList
          clears it and brings them back. */}
      {asking ? (
        <MessageList />
      ) : (
        <>
          <VideoComponent />
          <Transcript />
        </>
      )}
    </div>
  );
}
