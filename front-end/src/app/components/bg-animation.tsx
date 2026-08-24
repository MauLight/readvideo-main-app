"use client";

import { useCallback, useEffect, useState } from "react";
import WebThreads from "@/component/WebThreads";
import { useVideo } from "../context/video-context";
import { useTheme } from "../context/themeContext";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from "motion/react";
import Image from "next/image";

// The ready set is the idle set hue-rotated to green, so the two stay matched
// in darkness — tweak freely, nothing else depends on these.
const IDLE: [string, string, string] = ["#6f0b0b", "#6d040f", "#5f0000"];
const IDLE_LIGHT: [string, string, string] = ["#110000", "#ff0000", "ff0000"];
const READY: [string, string, string] = ["#0b6f0b", "#046d0f", "#005f00"];

/** Matches Graphic's COLOR_FADE, so the accent shifts read as one change. */
const COLOR_FADE = { duration: 0.6, ease: "easeInOut" as const };

type Rgb = [number, number, number];

/**
 * Blending is done by hand rather than with motion's useTransform: that emits
 * `rgba(...)` strings, and WebThreads' hexToRgb only parses hex — it falls back
 * to [1,1,1], turning every thread white for the whole tween.
 */
const HEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

function toRgb(hex: string): Rgb {
  const parsed = HEX.exec(hex);
  if (!parsed) return [255, 255, 255];
  return [
    parseInt(parsed[1], 16),
    parseInt(parsed[2], 16),
    parseInt(parsed[3], 16),
  ];
}

function channel(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

function mixHex(from: Rgb, to: Rgb, t: number): string {
  const r = channel(from[0] + (to[0] - from[0]) * t);
  const g = channel(from[1] + (to[1] - from[1]) * t);
  const b = channel(from[2] + (to[2] - from[2]) * t);
  return `#${r}${g}${b}`;
}

// Parsed once — the endpoints never change.
const IDLE_RGB = IDLE.map(toRgb) as [Rgb, Rgb, Rgb];
const IDLE_LIGHT_RGB = IDLE_LIGHT.map(toRgb) as [Rgb, Rgb, Rgb];
const READY_RGB = READY.map(toRgb) as [Rgb, Rgb, Rgb];

export default function BgAnimation() {
  const { canTranscribe } = useVideo();
  const { theme } = useTheme();

  // These are shader uniforms, not CSS, so no CSS transition can reach them.
  // One driver for all three channels keeps them in step.
  const progress = useMotionValue(0);
  const [colors, setColors] = useState<[string, string, string]>(IDLE);

  useEffect(() => {
    const controls = animate(progress, canTranscribe ? 1 : 0, COLOR_FADE);
    // Stop on re-trigger so a reversal resumes from wherever it got to.
    return () => controls.stop();
  }, [canTranscribe, progress]);

  // Only the idle end is themed; READY is shared, so a verified link lands on
  // the same green either way. Both branches are module constants, so this
  // reference only changes when the theme actually flips.
  const idleRgb = theme === "light" ? IDLE_LIGHT_RGB : IDLE_RGB;

  const applyColors = useCallback(
    (t: number) => {
      setColors([
        mixHex(idleRgb[0], READY_RGB[0], t),
        mixHex(idleRgb[1], READY_RGB[1], t),
        mixHex(idleRgb[2], READY_RGB[2], t),
      ]);
    },
    [idleRgb],
  );

  const handleProgress = useCallback(() => {
    applyColors(progress.get());
  }, [applyColors, progress]);

  useMotionValueEvent(progress, "change", handleProgress);

  // Toggling the theme moves the idle endpoint without moving `progress`, so
  // no change event fires — recolour from the current position instead.
  useEffect(() => {
    applyColors(progress.get());
  }, [applyColors, progress]);

  return (
    <div className="absolute top-0 left-0 w-full h-full z-0">
      {canTranscribe && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.2, 0.1] }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-0 w-full h-full bg-[#046d0f]"
        ></motion.div>
      )}
      {/* Two files rather than a CSS filter: the inverted art is drawn, not a
          channel flip, so it can't be derived from the dark one. */}
      <Image
        className="object-cover opacity-15 z-5"
        src={theme === "light" ? "/brain_inverted.webp" : "/brain.webp"}
        alt=""
        aria-hidden
        fill
      />
      <WebThreads
        color1={colors[0]}
        color2={colors[1]}
        color3={colors[2]}
        speed={0.2}
        threadCount={6}
        frequency={5}
        spread={0.18}
        taper={1}
        position={0.625}
        fanMode="center"
        glow={0.02}
        falloff={0.6}
        thickness={1.1}
        brightness={0.6}
        opacity={1}
        mirror
        shimmer={false}
        grain
        grainIntensity={0.05}
        mouseInteraction={false}
      />
      <div className="absolute top-0 left-0 w-full h-full bg-white dark:bg-transparent z-0" />
    </div>
  );
}
