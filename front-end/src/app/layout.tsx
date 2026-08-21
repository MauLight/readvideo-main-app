import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "./context/themeContext";
import "./globals.css";

/**
 * Self-hosted so nothing reaches out to a font CDN — the packaged app runs
 * from disk and may well be offline.
 *
 * One variable file per style covers each family's whole weight range, so
 * weights cost nothing extra. Both are exposed as CSS variables rather than
 * `.className`, which would set the family on <html> and restyle the whole
 * app; here they only back the `font-title` / `font-body` utilities (see
 * globals.css).
 */
const inter = localFont({
  src: [
    { path: "./fonts/Inter-Variable.ttf", style: "normal" },
    { path: "./fonts/Inter-Italic-Variable.ttf", style: "italic" },
  ],
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

// Single wght axis, 200–900 (ExtraLight to Black), and no italic — Japanese
// serifs don't ship one, so `italic` will synthesize a slant if used.
const notoSerifJp = localFont({
  src: [{ path: "./fonts/NotoSerifJP-Variable.ttf", style: "normal" }],
  weight: "200 900",
  variable: "--font-noto-serif-jp",
  display: "swap",
});

export const metadata: Metadata = {
  // Electron shows the document title in the window chrome — BrowserWindow
  // sets no `title` of its own, so this is the app window's name.
  title: "ReadVideo",
  description: "A solution to create academic text out of youtube lectures.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dark` is in the markup, not only applied by the effect, so the
    // dark-first default paints without a flash on first load.
    <html
      lang="en"
      className={`dark h-full antialiased ${inter.variable} ${notoSerifJp.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
