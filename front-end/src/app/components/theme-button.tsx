"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/context/themeContext";

/**
 * Flips the palette. Styled to match KeysButton exactly, since the two sit
 * side by side — hover colour comes from the shared utility rather than a
 * motion animation, so they behave identically.
 */
export default function ThemeButton() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-border dark:bg-[#191919] px-4 h-9 text-[#b8b8b9] text-[0.9rem] hover:text-text cursor-pointer"
    >
      {isDark ? (
        <Moon className="w-3.5 h-3.5" />
      ) : (
        <Sun className="w-3.5 h-3.5" />
      )}
      <span className="text-small">Theme</span>
    </button>
  );
}
