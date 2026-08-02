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
      : "bg-green-600 border-t border-green-800 shadow shadow-green-700";

  const borderClass = error
    ? "bg-red-700 border-t border-red-900 shadow shadow-red-800"
    : pasted
      ? pastedClass
      : "bg-[#191919] border-t border-border shadow shadow-[#212121]";

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
        className={`h-12 ${borderClass} rounded-lg pl-3 pr-20 w-full outline-0 text-dark2 dark:text-text2 resize-none overflow-hidden`}
      />
      {clearVisible && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear input"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center border border-border rounded-lg px-3 h-8 text-dark2 dark:text-text2 bg-black"
        >
          clear
        </button>
      )}
    </div>
  );
}
