"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const STORAGE_KEY = "readvideo-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Dark-first: the palette is built for it, so it's both the initial state and
 * the class layout.tsx ships in the markup — no flash on the common path.
 * A stored choice wins over that, then the OS preference.
 *
 * The class lands on <html> rather than a wrapper element. The page depends on
 * an unbroken h-screen/h-full chain, and an extra div in the middle collapses
 * it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  // Blocks the persist effect until the stored value has been read, so the
  // initial "dark" can't overwrite a saved "light" on the first commit.
  const restored = useRef(false);

  // useEffect, not useLayoutEffect: this prerenders during the static export,
  // where the layout variant warns and buys nothing.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
    }
    restored.current = true;
  }, []);

  // One place owns the class and the persistence, so callers only set state.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (restored.current) localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
