"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useVideo } from "../context/video-context";

const images = [
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846088/a_exmgpt.png",
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846088/4_wiqwxi.png",
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846087/5_lspqkq.png",
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846087/c_iyy6qn.png",
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846087/b_dw64si.png",
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846087/2_syetjc.jpg",
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846087/1_htmj5q.jpg",
  "https://res.cloudinary.com/dglhgnd47/image/upload/v1784846087/c_ocksz1.jpg",
];

// Deterministic per-column ordering (rotations) — avoids a hydration mismatch
// that Math.random() shuffling would cause.
function rotate<T>(arr: T[], n: number): T[] {
  const offset = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(offset), ...arr.slice(0, offset)];
}

const COLUMNS = [0, 3, 5, 1].map((offset) => rotate(images, offset));

export default function AnimatedBg() {
  const { committed } = useVideo();
  if (committed) return null;

  return (
    <div className="absolute inset-0 w-full h-full z-0 grid grid-cols-4 gap-0 overflow-hidden opacity-20">
      {COLUMNS.map((columnImages, i) => (
        <Column
          key={i}
          images={columnImages}
          direction={i % 2 === 0 ? "down" : "up"}
          duration={64 + i * 2}
        />
      ))}
      <div className="absolute inset-0 w-full h-full bg-linear-to-r from-indigo-700 via-teal-700 to-blue-700 opacity-20 z-50" />
    </div>
  );
}

interface ColumnProps {
  images: string[];
  direction: "up" | "down";
  duration: number;
}

function Column({ images, direction, duration }: ColumnProps) {
  // Content is duplicated, so shifting by 50% lands on an identical frame and
  // loops seamlessly. Up scrolls 0 -> -50%, down scrolls -50% -> 0.
  const y = direction === "up" ? ["0%", "-50%"] : ["-50%", "0%"];

  return (
    <div className="relative overflow-hidden">
      <motion.div
        className="flex flex-col"
        animate={{ y }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {[...images, ...images].map((src, idx) => (
          <div className="w-full" key={idx}>
            <Image
              width={300}
              height={300}
              alt=""
              src={src}
              className="w-full h-auto object-cover"
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
