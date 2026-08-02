"use client";

import { motion } from "motion/react";
import { ListVideo, RefreshCcw, SquarePlay, TextInitial } from "lucide-react";
import { useVideo } from "../context/video-context";

const RED = "#fa222f";
const GREEN = "#00a63e"; // green-600 in sRGB — the input's video accent
const AMBER = "#fe9a00"; // amber-500 in sRGB — the input's playlist accent
const COLOR_FADE = { duration: 0.6, ease: "easeInOut" as const };

export default function Graphic() {
  const { status, kind, toggleKind } = useVideo();

  // Once a real target is on deck the accent shifts off red, matching the
  // input. A failed lookup stays red rather than signalling success.
  const active = status !== "idle" && status !== "error";
  const accent = active ? (kind === "playlist" ? AMBER : GREEN) : RED;

  return (
    <div className="w-full h-full flex justify-center items-center pb-40">
      <div className="w-100 h-100 flex justify-center items-center border border-[#1f1f1f] rounded-full relative">
        <div className="absolute w-full h-full flex justify-center items-center">
          <div className="flex items-center gap-x-5">
            <div
              onClick={toggleKind}
              className="relative w-35 h-40 cursor-pointer"
            >
              {/* <div className="absolute w-50 h-52 -top-6 -left-7 flex justify-center items-center">
          <div className="w-full h-full bg-radial from-[#fa222f]/50 to-75% to-transparent animate-pulse backdrop-blur-2xl" />
        </div> */}

              <div className="absolute inset-0 flex justify-center items-center">
                {/* <div className="absolute w-35.5 h-40.5 bg-[#fa222f] animate-pulse backdrop-blur-2xl rounded-xl" /> */}
                <div className="z-50 w-35 h-40 flex flex-col gap-y-1 justify-center items-center border border-border rounded-xl bg-linear-to-b from-[#191919] to-[#111111]">
                  <>
                    {kind === "video" ? (
                      <>
                        <SquarePlay className="w-10 h-10 text-faded-light" />
                        <p className="text-[#898989] uppercase text-[0.8rem] font-semibold">
                          Video
                        </p>
                      </>
                    ) : (
                      <>
                        <ListVideo className="w-10 h-10 text-faded-light" />
                        <p className="text-[#898989] uppercase text-[0.8rem] font-semibold">
                          Playlist
                        </p>
                      </>
                    )}
                  </>
                </div>
              </div>
            </div>

            <motion.div
              className="flex items-center gap-x-2 z-50"
              animate={{ color: accent }}
              transition={COLOR_FADE}
            >
              <motion.div
                className="w-10 border-b animate-pulse"
                animate={{ borderColor: accent }}
                transition={COLOR_FADE}
              />
              {/* Inherits the animated colour through currentColor. */}
              <RefreshCcw className="w-10 h-10 animate-spin" />
              <motion.div
                className="w-10 border-b animate-pulse"
                animate={{ borderColor: accent }}
                transition={COLOR_FADE}
              />
            </motion.div>

            <div className="relative w-35 h-40">
              {/* Gradients can't be tweened, so the two glows cross-fade instead. */}
              <div className="absolute w-48 h-50 -top-6 -left-7">
                <motion.div
                  className="absolute inset-0 bg-radial from-[#fa222f]/50 to-75% to-transparent animate-pulse"
                  animate={{ opacity: active ? 0 : 1 }}
                  transition={COLOR_FADE}
                />
                <motion.div
                  className={`absolute inset-0 bg-radial ${
                    kind === "playlist"
                      ? "from-amber-500/50"
                      : "from-green-600/50"
                  } to-75% to-transparent animate-pulse`}
                  animate={{ opacity: active ? 0.3 : 0 }}
                  transition={COLOR_FADE}
                />
              </div>

              <div className="absolute inset-0 flex justify-center items-center">
                <motion.div
                  className="absolute w-35.5 h-40.5 animate-pulse rounded-xl"
                  animate={{ backgroundColor: accent }}
                  transition={COLOR_FADE}
                />
                <div className="z-50 w-35 h-40 flex flex-col gap-y-1 justify-center items-center border border-border rounded-xl bg-linear-to-b from-[#191919] to-[#111111]">
                  <TextInitial className="w-10 h-10 text-faded-light" />
                  <p className="text-[#898989] uppercase text-[0.8rem] font-semibold">
                    Text
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-70 h-70 border border-[#1f1f1f] rounded-full" />
      </div>
    </div>
  );
}
