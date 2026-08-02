"use client";

import { RefObject, useCallback, useRef } from "react";

const printStyles = `
  body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; color: #111; max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.5rem; }
  h1 { font-size: 1.9rem; font-weight: 700; margin: 1.25rem 0 0.75rem; }
  h2 { font-size: 1.4rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
  h3 { font-size: 1.15rem; font-weight: 700; margin: 1rem 0 0.5rem; }
  p { margin: 0.75rem 0; }
  ul, ol { padding-left: 1.5rem; margin: 0.75rem 0; }
  li { margin: 0.25rem 0; }
  a { color: #1a4fd6; }
  strong { font-weight: 700; }
  pre { background: #f4f4f4; padding: 0.75rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 0.85rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.9rem; }
  th, td { border: 1px solid #ccc; padding: 0.35rem 0.6rem; text-align: left; }
  blockquote { border-left: 2px solid #ccc; padding-left: 1rem; font-style: italic; }
  /* Controls are copied along with the content; keep them off the page. */
  [data-print-hide] { display: none !important; }
`;

// The print window's KaTeX stylesheet loads async; printing before it lands
// would lay formulas out as unstyled spans. Never block longer than a moment.
function waitForStyles(win: Window): Promise<void> {
  return new Promise((resolve) => {
    const link = win.document.querySelector("link[rel=stylesheet]");
    if (!link) {
      resolve();
      return;
    }

    function done() {
      resolve();
    }

    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    win.setTimeout(done, 2000);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface Printable<T> {
  ref: RefObject<T | null>;
  print: () => void;
}

/**
 * Prints whatever the returned ref wraps, in a bare window styled for paper.
 *
 * Elements marked `data-print-hide` are dropped, so buttons living inside the
 * printed subtree don't end up on the page.
 */
export function usePrintable<T extends HTMLElement>(
  title = "Article"
): Printable<T> {
  const ref = useRef<T>(null);

  const print = useCallback(async () => {
    const content = ref.current?.innerHTML;
    if (!content) return;

    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return;

    function handleAfterPrint() {
      win?.close();
    }

    win.document.write(
      `<!doctype html><html><head><title>${escapeHtml(title)}</title>` +
        `<link rel="stylesheet" href="/katex/katex.min.css">` +
        `<style>${printStyles}</style></head><body>${content}</body></html>`
    );
    win.document.close();

    await waitForStyles(win);
    win.onafterprint = handleAfterPrint;
    win.focus();
    win.print();
  }, [title]);

  return { ref, print };
}
