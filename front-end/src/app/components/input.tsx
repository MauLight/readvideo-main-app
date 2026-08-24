"use client";

import { YouTubeKind } from "../lib/youtube";

interface InputProps {
  label: string;
  value: string;
  updater: (label: string, value: string) => void;
  /** Which accent the pasted state uses: green for a video, amber for a list. */
  kind?: YouTubeKind;
  error?: boolean;
  showClear?: boolean;
  pasted?: boolean;
  onFocus?: () => void;
}

export default function Input({
  label,
  value,
  updater,
  kind,
  error,
  showClear,
  pasted,
  onFocus,
}: InputProps) {
  function handleChange({ target }: { target: { value: string } }) {
    updater(label, target.value);
  }

  function handleClear() {
    updater(label, "");
  }

  const pastedClass =
    kind === "playlist"
      ? "bg-amber-500 border-t border-amber-700 shadow shadow-amber-600"
      : "bg-[#0f743f] border-t border-[#2f945f] shadow shadow-[#0f541f]";

  const borderClass = error
    ? "bg-red-800 border-t border-red-700 shadow shadow-red-800"
    : pasted
      ? pastedClass
      : "bg-[#c5bfbf] dark:bg-[#121213] shadow-xl shadow-[#a5a29f] dark:shadow-[#0d0d0f] border-t border-[#cfc6c6] dark:border-[#1f1f20]";

  // Clear button shows on error, or whenever the parent asks for it (success).
  const clearVisible = error || showClear;

  return (
    <div className="relative w-full">
      <input
        id={`${label} input`}
        value={value}
        onChange={handleChange}
        onFocus={onFocus}
        name={label}
        placeholder={label}
        className={`h-15 ${borderClass} rounded-xl pl-3 pr-20 w-full outline-0 :text-[#686869] dark:text-[#b8b8b9] placeholder-[#49494a] resize-none overflow-hidden`}
      />
      {clearVisible && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear input"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center border border-teal-950 rounded-lg px-3 h-8 text-[#b8b8b9] bg-teal-950"
        >
          clear
        </button>
      )}
    </div>
  );
}
