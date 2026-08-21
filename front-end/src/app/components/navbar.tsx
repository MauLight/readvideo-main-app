"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Input from "./input";
import PreviewVideo from "./preview-video";
import StatusComponent, { Status } from "./status";
import { useDebounce } from "../hooks/useDebounce";
import {
  parseYouTubeLink,
  verifyYouTubeLink,
  YouTubeLink,
} from "../lib/youtube";
import { useVideo } from "../context/video-context";
import { FilePlay } from "lucide-react";

export default function Navbar() {
  const {
    inputValue: value,
    setInputValue,
    setUrl,
    status: articleStatus,
    canTranscribe,
    kind,
    generate,
    committed,
    setCommitted,
  } = useVideo();
  const [status, setStatus] = useState<Status>("idle");
  // True while the input holds a link we pulled from the clipboard ourselves.
  const [pasted, setPasted] = useState(false);
  // Deferred generation: wait for the move-to-top animation to finish before
  // kicking off the (heavy) generation, so the workspace doesn't pop in early.
  const [pendingGenerate, setPendingGenerate] = useState(false);
  // The hero text is revealed only once the input has settled back at center,
  // so it never perturbs the return animation.
  const [headerVisible, setHeaderVisible] = useState(true);
  const debouncedValue = useDebounce(value, 1000);

  function handleChange(label: string, newValue: string) {
    setInputValue(newValue);
    setPasted(false); // any manual edit or clear drops the green highlight
  }

  // On focus, pull a YouTube link straight out of the clipboard. The click that
  // focused the input supplies the user activation the clipboard read needs.
  async function handleInputFocus() {
    if (value !== "") return;
    if (!navigator.clipboard?.readText) return;

    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (parseYouTubeLink(text)) {
        setInputValue(text);
        setPasted(true);
      }
    } catch {
      // denied or unfocused document — the user can still paste manually
    }
  }

  // Clearing the input resets immediately, without waiting for the debounce.
  useEffect(() => {
    if (value === "") setStatus("idle");
  }, [value]);

  // Debounced value settles ~1s after the user stops typing.
  // Layer 1 (parse) gates layer 2 (network verify), each mapped to a status.
  useEffect(() => {
    if (!debouncedValue) {
      setStatus("idle");
      return;
    }

    const link = parseYouTubeLink(debouncedValue);
    if (!link) {
      setStatus("error");
      return;
    }

    const controller = new AbortController();

    async function check(target: YouTubeLink) {
      setStatus("loading");
      try {
        const exists = await verifyYouTubeLink(target, controller.signal);
        setStatus(exists ? "success" : "error");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("error");
      }
    }

    check(link);

    return () => controller.abort();
  }, [debouncedValue]);

  // On a verified URL, publish it so the preview loads. No generation yet.
  useEffect(() => {
    setUrl(status === "success" ? value : null);
  }, [status, value, setUrl]);

  // Leaving the verified state (edit/clear/error) re-centers the layout.
  useEffect(() => {
    if (status !== "success") {
      setCommitted(false);
      setPendingGenerate(false);
    }
  }, [status]);

  // Hide the hero text the moment we commit; it returns after the input
  // settles back at center (see handleLayoutSettle).
  useEffect(() => {
    if (committed) setHeaderVisible(false);
  }, [committed]);

  // Transcribe: on first press, animate to the top and generate once it
  // settles. On retry (already at the top), generate immediately.
  function handleTranscribe() {
    if (committed) {
      void generate();
    } else {
      setPendingGenerate(true);
      setCommitted(true);
    }
  }

  // Fires when the input finishes moving. On commit, kick off generation.
  // On return-to-center, reveal the hero text.
  function handleLayoutSettle() {
    if (committed) {
      if (pendingGenerate) {
        setPendingGenerate(false);
        void generate();
      }
    } else {
      setHeaderVisible(true);
    }
  }

  return (
    <nav className="z-50 w-full">
      <motion.div
        layout="position"
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
        onLayoutAnimationComplete={handleLayoutSettle}
        className="relative w-full flex flex-col justify-start gap-5"
      >
        {!committed && (
          <motion.div
            className="absolute bottom-full inset-x-0 mb-10 flex flex-col gap-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: headerVisible ? 1 : 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <motion.div
              animate={{ opacity: articleStatus !== "idle" ? 0 : 1 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="flex gap-x-2 items-baseline"
            >
              <FilePlay className="text-red-800 h-6 w-6" />
              <h1 className="text-[6rem] lowercase text-[#c9c9c2] font-title font-medium leading-19">
                Read Lecture Videos
              </h1>
            </motion.div>
            <motion.div
              animate={{ opacity: articleStatus !== "idle" ? 0 : 1 }}
              transition={{ duration: 0.5, ease: "easeInOut", delay: 0.5 }}
              className="text-[#a9a9a2] text-[1.2rem] flex gap-x-1 items-center ml-10 font-title"
            >
              Translate
              <YouTubeLogo />
              lectures into academic text you can read.
            </motion.div>
          </motion.div>
        )}

        <div className=" flex items-end">
          {/* The indent lines the input up with the hero heading, which sits
              behind an icon. Once committed the hero is gone, so it goes too. */}
          <div className={`flex-1 max-w-202 ${committed ? "" : "ml-9"}`}>
            <Input
              label="Paste your link here"
              value={value}
              updater={handleChange}
              onFocus={handleInputFocus}
              error={status === "error"}
              pasted={pasted}
              kind={kind}
              showClear={articleStatus !== "idle"}
            />
          </div>
          <AnimatePresence>
            {canTranscribe && (
              <motion.div
                key="transcribe"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="shrink-0 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={handleTranscribe}
                  className="ml-5 h-15 px-7 rounded-xl bg-[#0f743f] border-t border-[#2f945f] shadow shadow-[#0f541f] text-[#d8d8d9] font-medium cursor-pointer whitespace-nowrap"
                >
                  Transcribe
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Above the input while previewing. The hero occupies this same
            anchor but has already faded to 0 by the time a link verifies, so
            the two never show together. Once committed this unmounts and
            VideoComponent takes over below the navbar. */}
        <div className="absolute bottom-full left-10 max-w-200 inset-x-0 mb-5">
          {!committed && <PreviewVideo />}
        </div>

        <div className="absolute top-full inset-x-0 mt-3 flex flex-col gap-8">
          {!committed && (status === "loading" || status === "success") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            >
              <StatusComponent status={status} kind={kind} />
            </motion.div>
          )}
        </div>
      </motion.div>
    </nav>
  );
}

function YouTubeLogo() {
  return (
    <p className="font-title leading-7">
      <b className="text-[#c8c8c9] pr-0.75">You</b>
      <b className="bg-linear-to-b from-red-800 to-red-900 text-[#c8c8c9] p-0.75 rounded-md mr-0.5">
        Tube
      </b>
    </p>
  );
}
