"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Printer } from "lucide-react";
import { useVideo } from "../context/video-context";
import { usePrintable } from "../hooks/usePrintable";
import ArticleBody from "./article-body";
import CustomScrollbar from "./custom-scrollbar";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.8, ease: "easeInOut" as const },
};

export default function AcademicText() {
  const { status, article } = useVideo();
  const { ref: articleRef, print: handlePrint } = usePrintable<HTMLElement>();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence mode="wait">
      {status === "loading" && (
        <motion.div
          key="loading"
          {...fade}
          className="h-full flex items-center justify-center gap-2 text-text2"
        >
          <span className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
          Loading
        </motion.div>
      )}

      {status === "error" && (
        <motion.div
          key="error"
          {...fade}
          className="h-full flex items-center justify-center text-center text-text2 px-6"
        >
          The service is unavailable right now, please try again later
        </motion.div>
      )}

      {(status === "streaming" || status === "success") && (
        <motion.div key="content" {...fade} className="relative h-full">
          {status === "success" && (
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print article"
              className="absolute top-4 right-0 z-10 flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-text2 hover:text-text bg-[#0d0d0d] cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          )}
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto scrollbar-hide"
          >
            <ArticleBody
              ref={articleRef}
              markdown={article}
              className="pt-18 pb-20"
            />
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
