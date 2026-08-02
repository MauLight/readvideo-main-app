"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, Printer, RotateCcw } from "lucide-react";
import { Chapter, useVideo } from "../context/video-context";
import { usePrintable } from "../hooks/usePrintable";
import ArticleBody from "./article-body";
import CustomScrollbar from "./custom-scrollbar";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.8, ease: "easeInOut" as const },
};

/**
 * A skipped chapter, with a retry when one could actually help.
 *
 * Retrying mid-run would race the playlist stream — both write into `chapters`
 * — so the button stays disabled until the run ends and says why.
 */
function ChapterError({ chapter }: { chapter: Chapter }) {
  const { playlistRunning, retryChapter } = useVideo();

  // No captions means no transcript to work from, however many times we ask.
  const retryable = chapter.errorStatus !== "no_transcript";

  function handleRetry() {
    retryChapter(chapter);
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex items-center gap-2 text-text2">
        <CircleAlert className="w-4 h-4 shrink-0 text-amber-600" />
        {chapter.error}
      </div>

      {retryable && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={playlistRunning}
          data-print-hide
          className="self-start flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-text2 enabled:hover:text-text enabled:cursor-pointer disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          {playlistRunning ? "Waiting for the playlist to finish" : "Retry"}
        </button>
      )}
    </div>
  );
}

/**
 * One chapter, printable on its own. Its ref wraps the whole section so the
 * heading comes along with the body.
 */
function ChapterSection({
  chapter,
  total,
}: {
  chapter: Chapter;
  total: number;
}) {
  const { ref, print } = usePrintable<HTMLElement>(chapter.title);
  const printable = chapter.state === "done";

  return (
    <section ref={ref} className="group flex flex-col gap-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-y-1">
          <p className="text-small text-[#595959] uppercase tracking-wide">
            Chapter {chapter.index + 1} of {total}
          </p>
          <h2 className="text-subheader font-semibold text-text">
            {chapter.title}
          </h2>
        </div>

        {printable && (
          <button
            type="button"
            onClick={print}
            aria-label={`Print ${chapter.title}`}
            data-print-hide
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-border text-text2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-text cursor-pointer"
          >
            <Printer className="w-4 h-4" />
          </button>
        )}
      </header>

      {chapter.state === "error" ? (
        <ChapterError chapter={chapter} />
      ) : (
        <ArticleBody markdown={chapter.markdown} />
      )}
    </section>
  );
}

/**
 * The playlist counterpart to AcademicText: one shell, one scrollbar, and a
 * stack of chapters that fill in as the stream delivers them.
 */
export default function PlaylistText() {
  const { status, chapters, playlistRunning } = useVideo();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ref: allRef, print: printAll } = usePrintable<HTMLDivElement>(
    "Playlist"
  );

  return (
    <AnimatePresence mode="wait">
      {status === "loading" && chapters.length === 0 && (
        <motion.div
          key="loading"
          {...fade}
          className="h-full flex items-center justify-center gap-2 text-text2"
        >
          <span className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
          Loading
        </motion.div>
      )}

      {status === "error" && chapters.length === 0 && (
        <motion.div
          key="error"
          {...fade}
          className="h-full flex items-center justify-center text-center text-text2 px-6"
        >
          The service is unavailable right now, please try again later
        </motion.div>
      )}

      {chapters.length > 0 && (
        <motion.div key="content" {...fade} className="relative h-full">
          {!playlistRunning && (
            <button
              type="button"
              onClick={printAll}
              aria-label="Print the whole playlist"
              className="absolute top-4 right-0 z-10 flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-text2 hover:text-text bg-[#0d0d0d] cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print all
            </button>
          )}
          <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide">
            <div ref={allRef} className="flex flex-col gap-y-14 pt-18 pb-20">
              {chapters.map((chapter) => (
                <ChapterSection
                  key={chapter.index}
                  chapter={chapter}
                  total={chapters.length}
                />
              ))}
            </div>
          </div>
          <CustomScrollbar
            padY="3rem"
            offset="-3rem"
            scrollRef={scrollRef}
            showScrollTop
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
